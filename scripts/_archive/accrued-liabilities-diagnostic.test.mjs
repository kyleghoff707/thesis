/**
 * Diagnostic: Accrued Liabilities quarterly pattern
 * Run: npx vitest run scripts/accrued-liabilities-diagnostic --reporter=verbose 2>&1 | head -400
 */
import { describe, it, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '..', 'src', 'engines', '__tests__', 'fixtures', 'morningstar-quarterly');
const ANNUAL_DIR = path.join(__dirname, '..', 'src', 'engines', '__tests__', 'fixtures', 'morningstar');
const EDGAR_CACHE_DIR = path.join(ANNUAL_DIR, 'edgar-cache');

const SEC_HEADERS = { 'User-Agent': 'StockAnalyzer/1.0 kylehoff@example.com', 'Accept-Encoding': 'identity' };
let lastRequestTime = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = async function(url, opts = {}) {
  let resolved = typeof url === 'string' ? url : url.toString();
  if (resolved.startsWith('/api/edgar/')) resolved = 'https://data.sec.gov/' + resolved.slice('/api/edgar/'.length);
  else if (resolved.startsWith('/api/sec/')) resolved = 'https://www.sec.gov/' + resolved.slice('/api/sec/'.length);
  if (!resolved.includes('sec.gov')) return originalFetch(url, opts);
  const cacheKey = resolved.replace(/[^a-zA-Z0-9.-]/g, '_').slice(0, 200);
  const cachePath = path.join(EDGAR_CACHE_DIR, cacheKey + '.json');
  if (fs.existsSync(cachePath)) {
    return new Response(fs.readFileSync(cachePath, 'utf-8'), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  const now = Date.now();
  if (now - lastRequestTime < 100) await new Promise(r => setTimeout(r, 100 - (now - lastRequestTime)));
  lastRequestTime = Date.now();
  const resp = await originalFetch(resolved, { ...opts, headers: { ...SEC_HEADERS, ...opts.headers } });
  if (resp.ok) {
    const text = await resp.text();
    fs.mkdirSync(EDGAR_CACHE_DIR, { recursive: true });
    fs.writeFileSync(cachePath, text);
    return new Response(text, { status: resp.status, headers: { 'content-type': 'application/json' } });
  }
  return resp;
};

const fieldMapping = JSON.parse(fs.readFileSync(path.join(ANNUAL_DIR, 'field-mapping.json'), 'utf-8'));
const msFixtures = {};
for (const file of fs.readdirSync(FIXTURES_DIR)) {
  if (!file.endsWith('.json')) continue;
  msFixtures[file.replace('.json', '')] = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, file), 'utf-8'));
}

function parseQuarterLabel(label) {
  const m = label.trim().match(/^Q(\d)\s+(\d{4})$/);
  return m ? { quarter: parseInt(m[1]), year: parseInt(m[2]) } : null;
}

function detectOffset(msIncome, engineQ, engineFYs) {
  if (!msIncome || !engineQ || engineFYs.length === 0) return 0;
  const msByFY = {};
  for (const label of Object.keys(msIncome)) {
    if (label === 'TTM') continue;
    const p = parseQuarterLabel(label);
    if (!p) continue;
    if (!msByFY[p.year]) msByFY[p.year] = {};
    msByFY[p.year][`Q${p.quarter}`] = msIncome[label];
  }
  const scores = {};
  for (const offset of [0, -1]) {
    let matches = 0, compared = 0;
    for (const [yr, qtrs] of Object.entries(msByFY)) {
      const ey = parseInt(yr) + offset;
      for (const [q, fields] of Object.entries(qtrs)) {
        const msRev = fields['Total Revenue'];
        const engRev = engineQ[ey]?.[q]?.income?.revenues;
        if (msRev != null && engRev != null) {
          compared++;
          if (Math.abs((engRev - msRev) / msRev) < 0.02) matches++;
        }
      }
    }
    scores[offset] = { matches, compared };
  }
  return (scores[-1].matches > scores[0].matches && scores[-1].matches >= 5) ? -1 : 0;
}

const EUR = new Set(['RACE']);

let fetchEdgarQuarterly;

describe('Accrued Liabilities Diagnostic', () => {
  beforeAll(async () => {
    const mod = await import('../src/engines/edgarFinancials.js');
    fetchEdgarQuarterly = mod.fetchEdgarQuarterly;
  }, 10000);

  it('accrued_liabilities pattern analysis', async () => {
    console.log('\n\n═══ ACCRUED_LIABILITIES QUARTERLY PATTERN ═══');
    const diffs = [];
    const nulls = [];
    const tickers = Object.keys(msFixtures).filter(t => !EUR.has(t)).sort();
    
    for (const ticker of tickers) {
      const fix = msFixtures[ticker];
      const eng = await fetchEdgarQuarterly(ticker);
      if (!eng) continue;
      const offset = detectOffset(fix.statements.income, eng.quarterly, eng.fiscalYears);
      
      const msBalance = fix.statements.balance_sheet || {};
      for (const period of Object.keys(msBalance)) {
        if (period === 'TTM') continue;
        const parsed = parseQuarterLabel(period);
        if (!parsed) continue;
        const edgarYear = parsed.year + offset;
        
        const msVal = msBalance[period]?.['Accrued Expenses, Current'];
        if (msVal == null) continue;
        
        const engVal = eng.quarterly?.[edgarYear]?.[`Q${parsed.quarter}`]?.balance?.accrued_liabilities;
        if (engVal == null) {
          nulls.push({ ticker, period, edgarYear, q: parsed.quarter, ms: msVal });
          continue;
        }
        
        const pct = msVal === 0 ? (engVal === 0 ? 0 : 100) : Math.abs((engVal - msVal) / msVal);
        if (pct > 0.05) {
          diffs.push({ ticker, period, edgarYear, q: parsed.quarter, ms: msVal, eng: engVal, pct: (pct * 100).toFixed(1), diff: engVal - msVal });
        }
      }
    }
    
    console.log(`Total data points: ${diffs.length + nulls.length}`);
    console.log(`Failures (>5%): ${diffs.length}`);
    console.log(`Nulls (engine=null): ${nulls.length}`);
    console.log(`Affected companies: ${new Set([...diffs, ...nulls].map(d => d.ticker)).size}`);
    
    // Analyze pattern
    if (diffs.length > 0) {
      console.log(`\n═══ FAILURE PATTERN ANALYSIS ═══`);
      const byTicker = {};
      for (const d of diffs) {
        if (!byTicker[d.ticker]) byTicker[d.ticker] = [];
        byTicker[d.ticker].push(d);
      }
      
      for (const [ticker, cases] of Object.entries(byTicker).sort((a,b) => b[1].length - a[1].length).slice(0, 10)) {
        console.log(`\n${ticker}: ${cases.length} failures`);
        
        // Check if pattern is consistent (always high/low)
        const isAlwaysHigher = cases.every(c => c.eng > c.ms);
        const isAlwaysLower = cases.every(c => c.eng < c.ms);
        const avgPct = (cases.reduce((s, c) => s + parseFloat(c.pct), 0) / cases.length).toFixed(1);
        const avgRatio = (cases.reduce((s, c) => s + c.eng / c.ms, 0) / cases.length).toFixed(3);
        
        console.log(`  Pattern: ${isAlwaysHigher ? 'ALWAYS HIGHER' : isAlwaysLower ? 'ALWAYS LOWER' : 'MIXED'} | Avg %diff: ${avgPct}% | Avg ratio (eng/ms): ${avgRatio}`);
        
        for (const c of cases.slice(0, 3)) {
          const msM = (c.ms / 1e9).toFixed(2);
          const engM = (c.eng / 1e9).toFixed(2);
          console.log(`  ${c.period} FY${c.edgarYear}: MS=${msM}B eng=${engM}B diff=${c.diff >= 0 ? '+' : ''}${(c.diff/1e9).toFixed(2)}B (${c.pct}%)`);
        }
      }
    }
    
    if (nulls.length > 0) {
      console.log(`\n═══ NULL ENGINE VALUES (${nulls.length} cases) ═══`);
      const byTicker = {};
      for (const d of nulls) {
        if (!byTicker[d.ticker]) byTicker[d.ticker] = [];
        byTicker[d.ticker].push(d);
      }
      for (const [ticker, cases] of Object.entries(byTicker).sort((a,b) => b[1].length - a[1].length).slice(0, 5)) {
        console.log(`\n${ticker}: ${cases.length} nulls`);
        for (const c of cases.slice(0, 3)) {
          console.log(`  ${c.period} FY${c.edgarYear}: MS has ${(c.ms / 1e9).toFixed(2)}B but engine returns NULL`);
        }
      }
    }
  }, 300000);
});
