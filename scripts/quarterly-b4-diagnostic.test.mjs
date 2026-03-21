/**
 * Diagnostic: Investigate XYZ, EW, remaining shares, and LULU patterns
 * Run: npx vitest run scripts/quarterly-b4-diagnostic --reporter=verbose
 */
import { describe, it, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '..', 'src', 'engines', '__tests__', 'fixtures', 'morningstar-quarterly');
const ANNUAL_DIR = path.join(__dirname, '..', 'src', 'engines', '__tests__', 'fixtures', 'morningstar');
const EDGAR_CACHE_DIR = path.join(ANNUAL_DIR, 'edgar-cache');

// Fetch interceptor
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

const SPINOFF = { JNJ: 2023, T: 2022 };
const STMT_MAP = { income: 'income', balance_sheet: 'balance', cash_flow: 'cashFlow' };
const THRESHOLDS = { exact: 0.01, close: 0.05, approximate: 0.10, relaxed: 0.20, informational: Infinity };

function getCompanyDiffs(ticker, fix, eng) {
  const offset = detectOffset(fix.statements.income, eng.quarterly, eng.fiscalYears);
  const diffs = [];
  for (const [msStmtKey, mappings] of Object.entries(fieldMapping)) {
    if (msStmtKey === '_meta') continue;
    const engKey = STMT_MAP[msStmtKey];
    for (const [msField, info] of Object.entries(mappings)) {
      if (!info.thesisField) continue;
      const msStmt = fix.statements[msStmtKey] || {};
      for (const period of Object.keys(msStmt)) {
        if (period === 'TTM') continue;
        const parsed = parseQuarterLabel(period);
        if (!parsed) continue;
        const ey = parsed.year + offset;
        if (SPINOFF[ticker] && ey < SPINOFF[ticker]) continue;
        let msVal = msStmt[period]?.[msField];
        if (msVal == null) continue;
        if (msField === 'Total Operating Profit/Loss') {
          const rep = msStmt[period]?.['Reported Total Operating Profit/Loss'];
          if (rep != null) msVal = rep;
        }
        if (msField === 'Intangibles other than Goodwill') {
          const amort = msStmt[period]?.['Accumulated Amortization of Intangibles other than Goodwill']
            ?? msStmt[period]?.['Accumulated Amortization of Intangible Assets']
            ?? msStmt[period]?.['Accumulated Amortization and Impairment'];
          if (amort != null) msVal += amort;
        }
        const expected = info.sign * msVal;
        const actual = eng.quarterly?.[ey]?.[`Q${parsed.quarter}`]?.[engKey]?.[info.thesisField];
        if (actual == null) continue;
        const pct = expected === 0 ? (Math.abs(actual) < 1e6 ? 0 : Infinity) : Math.abs((actual - expected) / expected);
        const threshold = THRESHOLDS[info.tolerance] || 0.05;
        if (pct > threshold) {
          diffs.push({ field: info.thesisField, stmt: msStmtKey, period, expected, actual, pct });
        }
      }
    }
  }
  return { offset, diffs };
}

let fetchEdgarQuarterly;

describe('B4 Diagnostics', () => {
  beforeAll(async () => {
    const mod = await import('../src/engines/edgarFinancials.js');
    fetchEdgarQuarterly = mod.fetchEdgarQuarterly;
  }, 10000);

  it('XYZ detailed failure breakdown', async () => {
    const fix = msFixtures['XYZ'];
    const eng = await fetchEdgarQuarterly('XYZ');
    if (!eng) { console.log('XYZ engine null'); return; }
    const { offset, diffs } = getCompanyDiffs('XYZ', fix, eng);
    console.log(`\n\n═══ XYZ DETAILED (offset:${offset}) ═══`);
    console.log(`Total DIFFs: ${diffs.length}`);
    const byField = {};
    for (const d of diffs) { if (!byField[d.field]) byField[d.field] = []; byField[d.field].push(d); }
    for (const [field, cases] of Object.entries(byField).sort((a,b) => b[1].length - a[1].length).slice(0, 15)) {
      console.log(`\n  ${field} (${cases[0].stmt}): ${cases.length} failures`);
      for (const c of cases.slice(0, 3)) {
        console.log(`    ${c.period}: exp=${(c.expected/1e6).toFixed(0)}M got=${(c.actual/1e6).toFixed(0)}M diff=${(c.pct*100).toFixed(1)}%`);
      }
    }
  }, 300000);

  it('EW detailed failure breakdown', async () => {
    const fix = msFixtures['EW'];
    const eng = await fetchEdgarQuarterly('EW');
    if (!eng) { console.log('EW engine null'); return; }
    const { offset, diffs } = getCompanyDiffs('EW', fix, eng);
    console.log(`\n\n═══ EW DETAILED (offset:${offset}) ═══`);
    console.log(`Total DIFFs: ${diffs.length}`);
    const byField = {};
    for (const d of diffs) { if (!byField[d.field]) byField[d.field] = []; byField[d.field].push(d); }
    for (const [field, cases] of Object.entries(byField).sort((a,b) => b[1].length - a[1].length).slice(0, 15)) {
      console.log(`\n  ${field} (${cases[0].stmt}): ${cases.length} failures`);
      for (const c of cases.slice(0, 3)) {
        console.log(`    ${c.period}: exp=${(c.expected/1e6).toFixed(0)}M got=${(c.actual/1e6).toFixed(0)}M diff=${(c.pct*100).toFixed(1)}%`);
      }
    }
  }, 300000);

  it('LULU detailed failure breakdown', async () => {
    const fix = msFixtures['LULU'];
    const eng = await fetchEdgarQuarterly('LULU');
    if (!eng) { console.log('LULU engine null'); return; }
    const { offset, diffs } = getCompanyDiffs('LULU', fix, eng);
    console.log(`\n\n═══ LULU DETAILED (offset:${offset}) ═══`);
    console.log(`Total DIFFs: ${diffs.length}`);
    const byField = {};
    for (const d of diffs) { if (!byField[d.field]) byField[d.field] = []; byField[d.field].push(d); }
    for (const [field, cases] of Object.entries(byField).sort((a,b) => b[1].length - a[1].length).slice(0, 15)) {
      console.log(`\n  ${field} (${cases[0].stmt}): ${cases.length} failures`);
      for (const c of cases.slice(0, 3)) {
        console.log(`    ${c.period}: exp=${(c.expected/1e6).toFixed(0)}M got=${(c.actual/1e6).toFixed(0)}M diff=${(c.pct*100).toFixed(1)}%`);
      }
    }
  }, 300000);

  it('Shares failures — which companies and patterns', async () => {
    console.log('\n\n═══ SHARES FAILURES ═══');
    const tickers = Object.keys(msFixtures).filter(t => t !== 'RACE').sort();
    for (const ticker of tickers) {
      const fix = msFixtures[ticker];
      const eng = await fetchEdgarQuarterly(ticker);
      if (!eng) continue;
      const offset = detectOffset(fix.statements.income, eng.quarterly, eng.fiscalYears);

      const msIncome = fix.statements.income || {};
      const shareDiffs = [];
      for (const period of Object.keys(msIncome)) {
        if (period === 'TTM') continue;
        const parsed = parseQuarterLabel(period);
        if (!parsed) continue;
        const ey = parsed.year + offset;
        if (SPINOFF[ticker] && ey < SPINOFF[ticker]) continue;

        for (const [label, thesisField] of [['Diluted Average Shares', 'diluted_average_shares'], ['Basic Average Shares', 'basic_average_shares']]) {
          const msVal = msIncome[period]?.[label];
          if (msVal == null) continue;
          const engVal = eng.quarterly?.[ey]?.[`Q${parsed.quarter}`]?.income?.[thesisField];
          if (engVal == null) continue;
          const pct = Math.abs((engVal - msVal) / msVal);
          if (pct > 0.01) {
            shareDiffs.push({ field: label, period, q: parsed.quarter, ms: msVal, eng: engVal, pct: (pct*100).toFixed(1)+'%' });
          }
        }
      }
      if (shareDiffs.length > 0) {
        console.log(`\n${ticker} (offset:${offset}): ${shareDiffs.length} share failures`);
        // Group by quarter number to see if Q4 is the problem
        const byQ = { Q1: 0, Q2: 0, Q3: 0, Q4: 0 };
        for (const d of shareDiffs) byQ[`Q${d.q}`]++;
        console.log(`  By quarter: Q1=${byQ.Q1} Q2=${byQ.Q2} Q3=${byQ.Q3} Q4=${byQ.Q4}`);
        for (const d of shareDiffs.slice(0, 4)) {
          console.log(`  ${d.field} ${d.period} (Q${d.q}): MS=${(d.ms/1e6).toFixed(0)}M eng=${(d.eng/1e6).toFixed(0)}M diff=${d.pct}`);
        }
      }
    }
  }, 300000);

  it('operating_income_loss — which companies', async () => {
    console.log('\n\n═══ OPERATING_INCOME_LOSS FAILURES ═══');
    const tickers = Object.keys(msFixtures).filter(t => t !== 'RACE').sort();
    for (const ticker of tickers) {
      const fix = msFixtures[ticker];
      const eng = await fetchEdgarQuarterly(ticker);
      if (!eng) continue;
      const offset = detectOffset(fix.statements.income, eng.quarterly, eng.fiscalYears);
      const msIncome = fix.statements.income || {};
      const opDiffs = [];
      for (const period of Object.keys(msIncome)) {
        if (period === 'TTM') continue;
        const parsed = parseQuarterLabel(period);
        if (!parsed) continue;
        const ey = parsed.year + offset;
        if (SPINOFF[ticker] && ey < SPINOFF[ticker]) continue;
        let msVal = msIncome[period]?.['Total Operating Profit/Loss'];
        const rep = msIncome[period]?.['Reported Total Operating Profit/Loss'];
        if (rep != null) msVal = rep;
        if (msVal == null) continue;
        const engVal = eng.quarterly?.[ey]?.[`Q${parsed.quarter}`]?.income?.operating_income_loss;
        if (engVal == null) continue;
        const pct = msVal === 0 ? Infinity : Math.abs((engVal - msVal) / msVal);
        if (pct > 0.01) {
          opDiffs.push({ period, q: parsed.quarter, ms: msVal, eng: engVal, pct: (pct*100).toFixed(1)+'%' });
        }
      }
      if (opDiffs.length > 0) {
        console.log(`\n${ticker} (offset:${offset}): ${opDiffs.length} failures`);
        for (const d of opDiffs.slice(0, 3)) {
          console.log(`  ${d.period} (Q${d.q}): MS=${(d.ms/1e6).toFixed(0)}M eng=${(d.eng/1e6).toFixed(0)}M diff=${d.pct}`);
        }
      }
    }
  }, 300000);

  it('dividends_paid — which companies', async () => {
    console.log('\n\n═══ DIVIDENDS_PAID FAILURES ═══');
    const tickers = Object.keys(msFixtures).filter(t => t !== 'RACE').sort();
    for (const ticker of tickers) {
      const fix = msFixtures[ticker];
      const eng = await fetchEdgarQuarterly(ticker);
      if (!eng) continue;
      const offset = detectOffset(fix.statements.income, eng.quarterly, eng.fiscalYears);
      const msCF = fix.statements.cash_flow || {};
      const divDiffs = [];
      for (const period of Object.keys(msCF)) {
        if (period === 'TTM') continue;
        const parsed = parseQuarterLabel(period);
        if (!parsed) continue;
        const ey = parsed.year + offset;
        if (SPINOFF[ticker] && ey < SPINOFF[ticker]) continue;
        const msVal = msCF[period]?.['Payment of Dividends and Other Cash Distributions'];
        if (msVal == null) continue;
        const engVal = eng.quarterly?.[ey]?.[`Q${parsed.quarter}`]?.cashFlow?.dividends_paid;
        if (engVal == null) continue;
        const expected = -1 * msVal; // sign=-1 in field mapping
        const pct = expected === 0 ? Infinity : Math.abs((engVal - expected) / expected);
        if (pct > 0.05) {
          divDiffs.push({ period, q: parsed.quarter, expected, eng: engVal, pct: (pct*100).toFixed(1)+'%' });
        }
      }
      if (divDiffs.length > 0) {
        console.log(`\n${ticker} (offset:${offset}): ${divDiffs.length} failures`);
        for (const d of divDiffs.slice(0, 3)) {
          console.log(`  ${d.period} (Q${d.q}): exp=${(d.expected/1e6).toFixed(0)}M eng=${(d.eng/1e6).toFixed(0)}M diff=${d.pct}`);
        }
      }
    }
  }, 300000);
});
