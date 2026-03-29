/**
 * quarterly-revenue-companies.test.mjs — Identify revenue DIFF details per ticker/quarter
 *
 * Loops through all 50 quarterly MS fixtures, compares the `revenues` field only,
 * and prints every mismatch with ticker, quarter, MS value, engine value, ratio.
 *
 * Run: npx vitest run scripts/quarterly-revenue-companies.test.mjs
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '..', 'src', 'engines', '__tests__', 'fixtures', 'morningstar-quarterly');
const ANNUAL_FIXTURES_DIR = path.join(__dirname, '..', 'src', 'engines', '__tests__', 'fixtures', 'morningstar');
const EDGAR_CACHE_DIR = path.join(ANNUAL_FIXTURES_DIR, 'edgar-cache');

// ─── Fetch Interceptor ──────────────────────────────────────
const SEC_HEADERS = {
  'User-Agent': 'StockAnalyzer/1.0 kylehoff@example.com',
  'Accept-Encoding': 'identity',
};

let requestCount = 0;
let cacheHits = 0;
let lastRequestTime = 0;

const originalFetch = globalThis.fetch;

globalThis.fetch = async function interceptedFetch(url, opts = {}) {
  let resolved = typeof url === 'string' ? url : url.toString();

  if (resolved.startsWith('/api/edgar/')) {
    resolved = 'https://data.sec.gov/' + resolved.slice('/api/edgar/'.length);
  } else if (resolved.startsWith('/api/sec/')) {
    resolved = 'https://www.sec.gov/' + resolved.slice('/api/sec/'.length);
  }

  if (!resolved.includes('sec.gov') && !resolved.includes('data.sec.gov')) {
    return originalFetch(url, opts);
  }

  const cacheKey = resolved.replace(/[^a-zA-Z0-9.-]/g, '_').slice(0, 200);
  const cachePath = path.join(EDGAR_CACHE_DIR, cacheKey + '.json');

  if (fs.existsSync(cachePath)) {
    cacheHits++;
    const data = fs.readFileSync(cachePath, 'utf-8');
    return new Response(data, {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }

  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < 100) {
    await new Promise(r => setTimeout(r, 100 - elapsed));
  }
  lastRequestTime = Date.now();
  requestCount++;

  const resp = await originalFetch(resolved, {
    ...opts,
    headers: { ...SEC_HEADERS, ...opts.headers },
  });

  if (resp.ok) {
    const text = await resp.text();
    fs.mkdirSync(EDGAR_CACHE_DIR, { recursive: true });
    fs.writeFileSync(cachePath, text);
    return new Response(text, {
      status: resp.status,
      headers: { 'content-type': 'application/json' },
    });
  }

  return resp;
};

// ─── Load Fixtures & Mapping ─────────────────────────────────

const fieldMapping = JSON.parse(
  fs.readFileSync(path.join(ANNUAL_FIXTURES_DIR, 'field-mapping.json'), 'utf-8')
);

const msFixtures = {};
for (const file of fs.readdirSync(FIXTURES_DIR)) {
  if (!file.endsWith('.json')) continue;
  const ticker = file.replace('.json', '');
  msFixtures[ticker] = JSON.parse(
    fs.readFileSync(path.join(FIXTURES_DIR, file), 'utf-8')
  );
}

const ALL_TICKERS = Object.keys(msFixtures).sort();

// Companies that report in non-USD — skip
const EUR_COMPANIES = new Set(['RACE']);

// Engine revenue taxonomy tags (Layer 1)
const REVENUE_TAGS = [
  'RevenueFromContractWithCustomerExcludingAssessedTax',
  'Revenues',
  'SalesRevenueNet',
  'SalesRevenueGoodsNet',
  'RevenueFromContractWithCustomerIncludingAssessedTax',
];

// ─── Quarter Label Parser ────────────────────────────────────

function parseQuarterLabel(label) {
  const match = label.trim().match(/^Q(\d)\s+(\d{4})$/);
  if (!match) return null;
  return { quarter: parseInt(match[1]), year: parseInt(match[2]) };
}

// ─── Fiscal Year Offset Detection ────────────────────────────
// Same logic as the main quarterly accuracy test

function detectQuarterlyYearOffset(msIncomeStmt, engineQuarterly, engineFYs) {
  if (!msIncomeStmt || !engineQuarterly || engineFYs.length === 0) return 0;

  const msByFY = {};
  for (const label of Object.keys(msIncomeStmt)) {
    if (label === 'TTM') continue;
    const parsed = parseQuarterLabel(label);
    if (!parsed) continue;
    if (!msByFY[parsed.year]) msByFY[parsed.year] = {};
    msByFY[parsed.year][`Q${parsed.quarter}`] = msIncomeStmt[label];
  }

  const scores = {};
  for (const offset of [0, -1]) {
    let matches = 0;
    let compared = 0;

    for (const [msYearStr, msQuarters] of Object.entries(msByFY)) {
      const msYear = parseInt(msYearStr);
      const edgarYear = msYear + offset;

      for (const [qtr, msFields] of Object.entries(msQuarters)) {
        const msRev = msFields['Total Revenue'];
        const engRev = engineQuarterly[edgarYear]?.[qtr]?.income?.revenues;

        if (msRev != null && engRev != null) {
          compared++;
          const pct = Math.abs((engRev - msRev) / msRev);
          if (pct < 0.02) matches++;
        }
      }
    }

    scores[offset] = { matches, compared };
  }

  if (scores[-1].matches > scores[0].matches && scores[-1].matches >= 5) {
    return -1;
  }
  return 0;
}

// ─── Revenue Field Info ──────────────────────────────────────

const revenueMapping = fieldMapping.income['Total Revenue'];
const msFieldName = 'Total Revenue';
const thesisFieldName = revenueMapping.thesisField; // 'revenues'
const sign = revenueMapping.sign; // 1
const tolerance = revenueMapping.tolerance; // 'exact'

// ─── Test Suite ──────────────────────────────────────────────

let fetchEdgarQuarterly;

const allDiffs = [];
const tickerSummaries = [];

describe('Quarterly Revenue Failures', () => {
  beforeAll(async () => {
    const mod = await import('../src/engines/edgarFinancials.js');
    fetchEdgarQuarterly = mod.fetchEdgarQuarterly;
  }, 10000);

  afterAll(() => {
    // ─── Print Report ──────────────────────────────────────
    console.log('');
    console.log('QUARTERLY REVENUE DIFF REPORT');
    console.log('='.repeat(100));
    console.log('');
    console.log(`MS field: "${msFieldName}" → Engine field: "${thesisFieldName}" (sign: ${sign})`);
    console.log(`Engine Layer 1 tags: ${REVENUE_TAGS.join(', ')}`);
    console.log(`Tolerance: ${tolerance} (<1%)`);
    console.log('');

    if (allDiffs.length === 0) {
      console.log('NO DIFFS FOUND — all revenue values match within tolerance.');
    } else {
      console.log(`FOUND ${allDiffs.length} REVENUE DIFFS:`);
      console.log('-'.repeat(100));
      console.log(
        'Ticker'.padEnd(8) +
        'Quarter'.padEnd(12) +
        'MS Value'.padStart(18) +
        'Engine Value'.padStart(18) +
        'Ratio (E/MS)'.padStart(14) +
        '  Pct Diff'.padStart(12) +
        '  Notes'
      );
      console.log('-'.repeat(100));

      for (const d of allDiffs) {
        const msStr = d.msValue.toLocaleString('en-US');
        const engStr = d.engineValue != null ? d.engineValue.toLocaleString('en-US') : 'NULL';
        const ratioStr = d.ratio != null ? d.ratio.toFixed(4) : 'N/A';
        const pctStr = d.pctDiff != null ? (d.pctDiff * 100).toFixed(2) + '%' : 'N/A';

        console.log(
          d.ticker.padEnd(8) +
          d.quarter.padEnd(12) +
          msStr.padStart(18) +
          engStr.padStart(18) +
          ratioStr.padStart(14) +
          pctStr.padStart(12) +
          '  ' + (d.notes || '')
        );
      }

      console.log('-'.repeat(100));

      // Summary by ticker
      const byTicker = {};
      for (const d of allDiffs) {
        if (!byTicker[d.ticker]) byTicker[d.ticker] = [];
        byTicker[d.ticker].push(d);
      }
      console.log('');
      console.log('SUMMARY BY TICKER:');
      for (const [ticker, diffs] of Object.entries(byTicker).sort((a, b) => b[1].length - a[1].length)) {
        const avgPct = diffs.filter(d => d.pctDiff != null).reduce((s, d) => s + d.pctDiff, 0) / diffs.filter(d => d.pctDiff != null).length;
        console.log(`  ${ticker}: ${diffs.length} diffs, avg pct diff: ${(avgPct * 100).toFixed(2)}%`);
      }
    }

    // Ticker-level summary
    console.log('');
    console.log('PER-TICKER BREAKDOWN (all quarters):');
    console.log('-'.repeat(60));
    for (const s of tickerSummaries.sort((a, b) => a.ticker.localeCompare(b.ticker))) {
      const matchPct = s.compared > 0 ? ((s.match / s.compared) * 100).toFixed(1) : 'N/A';
      console.log(
        `  ${s.ticker.padEnd(8)} ${String(s.match).padStart(3)}/${String(s.compared).padStart(3)} match (${matchPct}%)` +
        (s.missing > 0 ? `  ${s.missing} missing` : '') +
        (s.diff > 0 ? `  ${s.diff} DIFF` : '') +
        (s.offset !== 0 ? `  offset:${s.offset}` : '') +
        (s.skipped ? `  ${s.skipped}` : '')
      );
    }

    console.log('');
    console.log(`EDGAR API: ${requestCount} live requests, ${cacheHits} cache hits`);
    console.log('');
  });

  it('identify revenue diffs across all tickers and quarters', async () => {
    for (const ticker of ALL_TICKERS) {
      if (EUR_COMPANIES.has(ticker)) {
        tickerSummaries.push({ ticker, match: 0, diff: 0, missing: 0, compared: 0, offset: 0, skipped: 'EUR-skip' });
        continue;
      }

      const fixture = msFixtures[ticker];
      const msIncomeStmt = fixture.statements.income || {};

      // Fetch quarterly engine data
      let engineData;
      try {
        engineData = await fetchEdgarQuarterly(ticker);
      } catch (e) {
        tickerSummaries.push({ ticker, match: 0, diff: 0, missing: 0, compared: 0, offset: 0, skipped: 'engine-error' });
        continue;
      }

      if (!engineData) {
        tickerSummaries.push({ ticker, match: 0, diff: 0, missing: 0, compared: 0, offset: 0, skipped: 'no-data' });
        continue;
      }

      // Detect offset
      const offset = detectQuarterlyYearOffset(
        msIncomeStmt,
        engineData.quarterly,
        engineData.fiscalYears || []
      );

      let matchCount = 0;
      let diffCount = 0;
      let missingCount = 0;

      // Loop through all MS quarters
      const msPeriods = Object.keys(msIncomeStmt).filter(p => p !== 'TTM');

      for (const msPeriod of msPeriods) {
        const parsed = parseQuarterLabel(msPeriod);
        if (!parsed) continue;

        const edgarYear = parsed.year + offset;
        const edgarQtr = `Q${parsed.quarter}`;

        const msValue = msIncomeStmt[msPeriod]?.[msFieldName];
        if (msValue == null) continue;

        // Get engine value
        const engineQtr = engineData.quarterly?.[edgarYear]?.[edgarQtr];
        const engineValue = engineQtr?.income?.revenues;

        if (engineValue == null) {
          missingCount++;
          allDiffs.push({
            ticker,
            quarter: `${msPeriod} → FY${edgarYear}.${edgarQtr}`,
            msValue,
            engineValue: null,
            ratio: null,
            pctDiff: null,
            notes: 'ENGINE MISSING',
          });
          continue;
        }

        const expected = sign * msValue;
        const pctDiff = Math.abs(expected) > 0 ? Math.abs((engineValue - expected) / expected) : 0;
        const ratio = expected !== 0 ? engineValue / expected : null;

        if (pctDiff <= 0.01) {
          // Within 1% — match
          matchCount++;
        } else {
          // DIFF
          diffCount++;
          allDiffs.push({
            ticker,
            quarter: `${msPeriod} → FY${edgarYear}.${edgarQtr}`,
            msValue: expected,
            engineValue,
            ratio,
            pctDiff,
            notes: '',
          });
        }
      }

      tickerSummaries.push({
        ticker,
        match: matchCount,
        diff: diffCount,
        missing: missingCount,
        compared: matchCount + diffCount,
        offset,
        skipped: null,
      });
    }

    // The test passes — we're just collecting data
    expect(allDiffs).toBeDefined();
  }, 600000); // 10 minute timeout for all 50 tickers
});
