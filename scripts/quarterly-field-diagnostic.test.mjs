/**
 * Diagnostic: Examine specific quarterly failure patterns
 * Run: npx vitest run scripts/quarterly-field-diagnostic --reporter=verbose
 */
import { describe, it, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '..', 'src', 'engines', '__tests__', 'fixtures', 'morningstar-quarterly');
const ANNUAL_DIR = path.join(__dirname, '..', 'src', 'engines', '__tests__', 'fixtures', 'morningstar');
const EDGAR_CACHE_DIR = path.join(ANNUAL_DIR, 'edgar-cache');

// ─── Fetch interceptor (same as test suite) ───
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

// Load fixtures and field mapping
const fieldMapping = JSON.parse(fs.readFileSync(path.join(ANNUAL_DIR, 'field-mapping.json'), 'utf-8'));
const msFixtures = {};
for (const file of fs.readdirSync(FIXTURES_DIR)) {
  if (!file.endsWith('.json')) continue;
  msFixtures[file.replace('.json', '')] = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, file), 'utf-8'));
}

// Quarter parser + offset detection (same as test suite)
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
const SPINOFF = { JNJ: 2023, T: 2022 };

let fetchEdgarQuarterly, lookupCIK, fetchCompanyFacts;

describe('Quarterly Field Diagnostics', () => {
  beforeAll(async () => {
    const mod = await import('../src/engines/edgarFinancials.js');
    fetchEdgarQuarterly = mod.fetchEdgarQuarterly;
    // Also get the raw EDGAR access functions
    lookupCIK = mod.lookupCIK;
    fetchCompanyFacts = mod.fetchCompanyFacts;
  }, 10000);

  it('Revenue failures — which companies and why', async () => {
    const revDiffs = [];
    const tickers = Object.keys(msFixtures).filter(t => !EUR.has(t)).sort();

    for (const ticker of tickers) {
      const fix = msFixtures[ticker];
      const eng = await fetchEdgarQuarterly(ticker);
      if (!eng) continue;
      const offset = detectOffset(fix.statements.income, eng.quarterly, eng.fiscalYears);

      const msIncome = fix.statements.income || {};
      for (const period of Object.keys(msIncome)) {
        if (period === 'TTM') continue;
        const parsed = parseQuarterLabel(period);
        if (!parsed) continue;
        const edgarYear = parsed.year + offset;
        if (SPINOFF[ticker] && edgarYear < SPINOFF[ticker]) continue;

        const msRev = msIncome[period]?.['Total Revenue'];
        if (msRev == null) continue;

        const engRev = eng.quarterly?.[edgarYear]?.[`Q${parsed.quarter}`]?.income?.revenues;
        if (engRev == null) {
          // Missing - not a DIFF
          continue;
        }

        const pct = Math.abs((engRev - msRev) / msRev);
        if (pct > 0.01) {
          revDiffs.push({ ticker, period, edgarYear, q: parsed.quarter, offset, msRev, engRev, pct: (pct * 100).toFixed(2) + '%' });
        }
      }
    }

    console.log('\n\n═══ REVENUE DIFFS ═══');
    console.log(`Total: ${revDiffs.length} failures`);
    const byTicker = {};
    for (const d of revDiffs) {
      if (!byTicker[d.ticker]) byTicker[d.ticker] = [];
      byTicker[d.ticker].push(d);
    }
    for (const [ticker, diffs] of Object.entries(byTicker)) {
      console.log(`\n${ticker} (offset:${diffs[0].offset}):`);
      for (const d of diffs) {
        console.log(`  ${d.period} → FY${d.edgarYear}.Q${d.q}: MS=${(d.msRev/1e6).toFixed(0)}M  eng=${(d.engRev/1e6).toFixed(0)}M  diff=${d.pct}`);
      }
    }
  }, 300000);

  it('AMZN detailed failures — top fields', async () => {
    const fix = msFixtures['AMZN'];
    const eng = await fetchEdgarQuarterly('AMZN');
    if (!eng) { console.log('AMZN engine returned null'); return; }
    const offset = detectOffset(fix.statements.income, eng.quarterly, eng.fiscalYears);
    console.log(`\n\n═══ AMZN DETAILED (offset:${offset}) ═══`);

    const diffs = [];
    for (const [msStmtKey, mappings] of Object.entries(fieldMapping)) {
      if (msStmtKey === '_meta') continue;
      const stmtMap = { income: 'income', balance_sheet: 'balance', cash_flow: 'cashFlow' };
      const engKey = stmtMap[msStmtKey];

      for (const [msField, info] of Object.entries(mappings)) {
        if (!info.thesisField) continue;
        const msStmt = fix.statements[msStmtKey] || {};
        for (const period of Object.keys(msStmt)) {
          if (period === 'TTM') continue;
          const parsed = parseQuarterLabel(period);
          if (!parsed) continue;
          const ey = parsed.year + offset;
          const msVal = msStmt[period]?.[msField];
          if (msVal == null) continue;

          // Apply P1b
          let adjustedMs = msVal;
          if (msField === 'Total Operating Profit/Loss') {
            const rep = msStmt[period]?.['Reported Total Operating Profit/Loss'];
            if (rep != null) adjustedMs = rep;
          }

          const expected = info.sign * adjustedMs;
          const actual = eng.quarterly?.[ey]?.[`Q${parsed.quarter}`]?.[engKey]?.[info.thesisField];
          if (actual == null) continue;

          const pct = expected === 0 ? (actual === 0 ? 0 : Infinity) : Math.abs((actual - expected) / expected);
          const threshold = { exact: 0.01, close: 0.05, approximate: 0.10, relaxed: 0.20, informational: Infinity }[info.tolerance] || 0.05;
          if (pct > threshold) {
            diffs.push({ field: info.thesisField, stmt: msStmtKey, period, expected, actual, pct: (pct * 100).toFixed(1) + '%' });
          }
        }
      }
    }

    // Group by field
    const byField = {};
    for (const d of diffs) {
      if (!byField[d.field]) byField[d.field] = [];
      byField[d.field].push(d);
    }
    const sorted = Object.entries(byField).sort((a, b) => b[1].length - a[1].length);
    console.log(`Total AMZN DIFFs: ${diffs.length}`);
    for (const [field, cases] of sorted.slice(0, 15)) {
      console.log(`\n  ${field} (${cases[0].stmt}): ${cases.length} failures`);
      for (const c of cases.slice(0, 4)) {
        console.log(`    ${c.period}: exp=${(c.expected/1e6).toFixed(0)}M got=${(c.actual/1e6).toFixed(0)}M diff=${c.pct}`);
      }
    }
  }, 300000);

  it('net_change_in_cash — pattern analysis', async () => {
    console.log('\n\n═══ NET_CHANGE_IN_CASH PATTERN ═══');
    const samples = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'COST', 'CMG'];
    for (const ticker of samples) {
      const fix = msFixtures[ticker];
      if (!fix) continue;
      const eng = await fetchEdgarQuarterly(ticker);
      if (!eng) continue;
      const offset = detectOffset(fix.statements.income, eng.quarterly, eng.fiscalYears);
      const msCF = fix.statements.cash_flow || {};
      let diffCount = 0;
      const examples = [];
      for (const period of Object.keys(msCF)) {
        if (period === 'TTM') continue;
        const parsed = parseQuarterLabel(period);
        if (!parsed) continue;
        const ey = parsed.year + offset;
        const msVal = msCF[period]?.['Change in Cash'];
        const engVal = eng.quarterly?.[ey]?.[`Q${parsed.quarter}`]?.cashFlow?.net_change_in_cash;
        if (msVal != null && engVal != null) {
          const pct = msVal === 0 ? (engVal === 0 ? 0 : Infinity) : Math.abs((engVal - msVal) / msVal);
          if (pct > 0.05) {
            diffCount++;
            if (examples.length < 3) examples.push({ period, ms: msVal, eng: engVal, pct: (pct*100).toFixed(1)+'%' });
          }
        }
      }
      if (diffCount > 0) {
        console.log(`${ticker} (offset:${offset}): ${diffCount} DIFFs`);
        for (const e of examples) {
          console.log(`  ${e.period}: MS=${(e.ms/1e6).toFixed(0)}M eng=${(e.eng/1e6).toFixed(0)}M diff=${e.pct}`);
        }
      }
    }
  }, 300000);

  it('depreciation_amortization — pattern analysis', async () => {
    console.log('\n\n═══ DEPRECIATION_AMORTIZATION PATTERN ═══');
    const diffs = [];
    const tickers = Object.keys(msFixtures).filter(t => !EUR.has(t)).sort();
    for (const ticker of tickers) {
      const fix = msFixtures[ticker];
      const eng = await fetchEdgarQuarterly(ticker);
      if (!eng) continue;
      const offset = detectOffset(fix.statements.income, eng.quarterly, eng.fiscalYears);
      const msCF = fix.statements.cash_flow || {};
      for (const period of Object.keys(msCF)) {
        if (period === 'TTM') continue;
        const parsed = parseQuarterLabel(period);
        if (!parsed) continue;
        const ey = parsed.year + offset;
        // Check both MS field names for D&A
        const msVal = msCF[period]?.['Depreciation, Amortization and Depletion, Non-Cash Adjustment']
          ?? msCF[period]?.['Depreciation and Amortization, Non-Cash Adjustment'];
        const engVal = eng.quarterly?.[ey]?.[`Q${parsed.quarter}`]?.cashFlow?.depreciation_amortization;
        if (msVal != null && engVal != null) {
          const pct = msVal === 0 ? (engVal === 0 ? 0 : Infinity) : Math.abs((engVal - msVal) / msVal);
          if (pct > 0.05) {
            diffs.push({ ticker, period, ms: msVal, eng: engVal, pct: (pct*100).toFixed(1)+'%' });
          }
        }
      }
    }
    const byTicker = {};
    for (const d of diffs) {
      if (!byTicker[d.ticker]) byTicker[d.ticker] = [];
      byTicker[d.ticker].push(d);
    }
    console.log(`Total: ${diffs.length} failures across ${Object.keys(byTicker).length} companies`);
    for (const [ticker, cases] of Object.entries(byTicker).sort((a,b) => b[1].length - a[1].length)) {
      console.log(`\n${ticker}: ${cases.length} failures`);
      for (const c of cases.slice(0, 3)) {
        console.log(`  ${c.period}: MS=${(c.ms/1e6).toFixed(0)}M eng=${(c.eng/1e6).toFixed(0)}M diff=${c.pct}`);
      }
    }
  }, 300000);

  it('WMS — offset:0 vs offset:-1 full comparison', async () => {
    const fix = msFixtures['WMS'];
    const eng = await fetchEdgarQuarterly('WMS');
    if (!eng) { console.log('WMS engine returned null'); return; }

    console.log('\n\n═══ WMS OFFSET COMPARISON ═══');
    console.log('Engine FYs:', eng.fiscalYears);
    for (const fy of eng.fiscalYears.slice(0, 6)) {
      const qtrs = Object.keys(eng.quarterly[fy] || {}).sort();
      console.log(`  FY${fy}: [${qtrs.join(', ')}]`);
    }

    for (const testOffset of [0, -1]) {
      let matches = 0, diffs = 0, missing = 0;
      for (const [msStmtKey, mappings] of Object.entries(fieldMapping)) {
        if (msStmtKey === '_meta') continue;
        const stmtMap = { income: 'income', balance_sheet: 'balance', cash_flow: 'cashFlow' };
        const engKey = stmtMap[msStmtKey];
        for (const [msField, info] of Object.entries(mappings)) {
          if (!info.thesisField) continue;
          const msStmt = fix.statements[msStmtKey] || {};
          for (const period of Object.keys(msStmt)) {
            if (period === 'TTM') continue;
            const parsed = parseQuarterLabel(period);
            if (!parsed) continue;
            const ey = parsed.year + testOffset;
            let msVal = msStmt[period]?.[msField];
            if (msVal == null) continue;
            if (msField === 'Total Operating Profit/Loss') {
              const rep = msStmt[period]?.['Reported Total Operating Profit/Loss'];
              if (rep != null) msVal = rep;
            }
            const expected = info.sign * msVal;
            const actual = eng.quarterly?.[ey]?.[`Q${parsed.quarter}`]?.[engKey]?.[info.thesisField];
            if (actual == null) { missing++; continue; }
            const pct = expected === 0 ? (Math.abs(actual) < 1e6 ? 0 : Infinity) : Math.abs((actual - expected) / expected);
            const threshold = { exact: 0.01, close: 0.05, approximate: 0.10, relaxed: 0.20, informational: Infinity }[info.tolerance] || 0.05;
            if (pct <= threshold) matches++; else diffs++;
          }
        }
      }
      const total = matches + diffs;
      console.log(`offset:${testOffset} → ${matches}/${total} match (${(matches/total*100).toFixed(1)}%) | ${diffs} DIFF | ${missing} missing`);
    }

    // Show revenue at each offset
    console.log('\nRevenue at each offset:');
    const msIncome = fix.statements.income || {};
    for (const period of Object.keys(msIncome).filter(p => p !== 'TTM').sort()) {
      const parsed = parseQuarterLabel(period);
      if (!parsed) continue;
      const msRev = msIncome[period]?.['Total Revenue'];
      if (msRev == null) continue;
      const eng0 = eng.quarterly?.[parsed.year]?.[`Q${parsed.quarter}`]?.income?.revenues;
      const eng1 = eng.quarterly?.[parsed.year - 1]?.[`Q${parsed.quarter}`]?.income?.revenues;
      const m0 = eng0 != null ? (Math.abs((eng0-msRev)/msRev) < 0.02 ? '✓' : '✗') : '—';
      const m1 = eng1 != null ? (Math.abs((eng1-msRev)/msRev) < 0.02 ? '✓' : '✗') : '—';
      console.log(`  ${period}: MS=${(msRev/1e6).toFixed(0)}M | off:0 FY${parsed.year}.Q${parsed.quarter}=${eng0 != null ? (eng0/1e6).toFixed(0)+'M' : 'null'} ${m0} | off:-1 FY${parsed.year-1}.Q${parsed.quarter}=${eng1 != null ? (eng1/1e6).toFixed(0)+'M' : 'null'} ${m1}`);
    }
  }, 300000);
});
