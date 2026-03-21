/**
 * quarterly-shares-diagnostic.test.mjs — Diagnose basic_average_shares and
 * diluted_average_shares quarterly failures.
 *
 * Run with: npx vitest run scripts/quarterly-shares-diagnostic.test.mjs --reporter=verbose
 *
 * Hypothesis: Q4 derivation formula (Q4 = 4*FY_avg - Q1 - Q2 - Q3) is wrong
 * because weighted-average shares don't combine that way.
 *
 * This diagnostic:
 *   1. Runs all 50 tickers through the quarterly engine
 *   2. Compares basic_average_shares and diluted_average_shares vs MS fixtures
 *   3. Groups failures by Q1/Q2/Q3 vs Q4 to isolate derivation issues
 *   4. Shows ratio analysis to identify systematic patterns
 */

import { describe, it, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const FIXTURES_DIR = path.join(ROOT, 'src/engines/__tests__/fixtures/morningstar-quarterly');
const ANNUAL_FIXTURES_DIR = path.join(ROOT, 'src/engines/__tests__/fixtures/morningstar');
const EDGAR_CACHE_DIR = path.join(ANNUAL_FIXTURES_DIR, 'edgar-cache');

// ─── Fetch Interceptor (same as quarterly accuracy test) ──────────────
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

// ─── Load Fixtures ──────────────────────────────────────────────
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

// EUR companies — skip
const EUR_COMPANIES = new Set(['RACE']);

// Spin-off companies — skip pre-spin years
const SPIN_OFF = { EW: 2023, JNJ: 2023, T: 2022 };

// ─── Offset Detection (same as accuracy test) ────────────────────
function parseQuarterLabel(label) {
  const match = label.trim().match(/^Q(\d)\s+(\d{4})$/);
  if (!match) return null;
  return { quarter: parseInt(match[1]), year: parseInt(match[2]) };
}

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

// ─── Shares Field Definitions ────────────────────────────────────
const SHARES_FIELDS = [
  {
    msField: 'Basic Weighted Average Shares Outstanding',
    thesisField: 'basic_average_shares',
    label: 'basic_avg_shares',
  },
  {
    msField: 'Diluted Weighted Average Shares Outstanding',
    thesisField: 'diluted_average_shares',
    label: 'diluted_avg_shares',
  },
];

// ─── Diagnostic ──────────────────────────────────────────────────

let fetchEdgarQuarterly;

// Collect all diffs for summary
const allDiffs = [];
const tickerSummaries = [];

describe('Quarterly Shares Diagnostic', () => {
  beforeAll(async () => {
    const mod = await import('../src/engines/edgarFinancials.js');
    fetchEdgarQuarterly = mod.fetchEdgarQuarterly;
  }, 15000);

  afterAll(() => {
    // ─── Print comprehensive summary ──────────────────────────
    console.log('\n' + '='.repeat(90));
    console.log('QUARTERLY SHARES DIAGNOSTIC — FULL SUMMARY');
    console.log('='.repeat(90));

    // ─── Per-company summary ──────────────────────────────────
    console.log('\nPER-COMPANY RESULTS:');
    console.log(
      '  ' +
      'Ticker'.padEnd(8) +
      'Offset'.padEnd(8) +
      'basic Match'.padEnd(14) +
      'basic DIFF'.padEnd(13) +
      'diluted Match'.padEnd(16) +
      'diluted DIFF'.padEnd(14) +
      'Q4 DIFFs'.padEnd(10) +
      'Non-Q4 DIFFs'
    );
    console.log('  ' + '-'.repeat(95));

    let totalBasicMatch = 0, totalBasicDiff = 0;
    let totalDilutedMatch = 0, totalDilutedDiff = 0;

    for (const s of tickerSummaries) {
      const line =
        '  ' +
        s.ticker.padEnd(8) +
        String(s.offset).padEnd(8) +
        String(s.basicMatch).padEnd(14) +
        String(s.basicDiff).padEnd(13) +
        String(s.dilutedMatch).padEnd(16) +
        String(s.dilutedDiff).padEnd(14) +
        String(s.q4Diffs).padEnd(10) +
        String(s.nonQ4Diffs);
      if (s.basicDiff > 0 || s.dilutedDiff > 0) {
        console.log(line + '  <<<');
      }
      totalBasicMatch += s.basicMatch;
      totalBasicDiff += s.basicDiff;
      totalDilutedMatch += s.dilutedMatch;
      totalDilutedDiff += s.dilutedDiff;
    }

    console.log('  ' + '-'.repeat(95));
    console.log(
      '  ' +
      'TOTAL'.padEnd(8) +
      ''.padEnd(8) +
      String(totalBasicMatch).padEnd(14) +
      String(totalBasicDiff).padEnd(13) +
      String(totalDilutedMatch).padEnd(16) +
      String(totalDilutedDiff).padEnd(14) +
      String(allDiffs.filter(d => d.isQ4).length).padEnd(10) +
      String(allDiffs.filter(d => !d.isQ4).length)
    );

    // ─── Q4 vs non-Q4 breakdown ──────────────────────────────
    const q4Diffs = allDiffs.filter(d => d.isQ4);
    const nonQ4Diffs = allDiffs.filter(d => !d.isQ4);

    console.log('\n' + '-'.repeat(90));
    console.log('Q4 vs NON-Q4 FAILURE DISTRIBUTION:');
    console.log('-'.repeat(90));
    console.log(`  Q4 DIFFs:     ${q4Diffs.length}`);
    console.log(`  Non-Q4 DIFFs: ${nonQ4Diffs.length}`);
    console.log(`  Total DIFFs:  ${allDiffs.length}`);

    if (allDiffs.length > 0) {
      console.log(`  Q4 percentage: ${((q4Diffs.length / allDiffs.length) * 100).toFixed(1)}%`);
    }

    // ─── Q4 DIFF details ─────────────────────────────────────
    if (q4Diffs.length > 0) {
      console.log('\n' + '-'.repeat(90));
      console.log('Q4 DIFF DETAILS (derivation formula: Q4 = 4*FY_avg - Q1 - Q2 - Q3):');
      console.log('-'.repeat(90));
      console.log(
        '  ' +
        'Ticker'.padEnd(8) +
        'Quarter'.padEnd(10) +
        'Field'.padEnd(22) +
        'MS Value'.padEnd(20) +
        'Engine Value'.padEnd(20) +
        'Ratio'.padEnd(10) +
        'Pct Diff'
      );

      for (const d of q4Diffs) {
        const pctStr = d.pctDiff !== Infinity ? (d.pctDiff * 100).toFixed(1) + '%' : 'INF';
        const ratioStr = d.ratio !== Infinity ? d.ratio.toFixed(4) : 'INF';
        console.log(
          '  ' +
          d.ticker.padEnd(8) +
          d.quarter.padEnd(10) +
          d.field.padEnd(22) +
          String(d.msValue).padEnd(20) +
          String(d.engineValue).padEnd(20) +
          ratioStr.padEnd(10) +
          pctStr
        );
      }
    }

    // ─── Non-Q4 DIFF details ─────────────────────────────────
    if (nonQ4Diffs.length > 0) {
      console.log('\n' + '-'.repeat(90));
      console.log('NON-Q4 DIFF DETAILS (Q1/Q2/Q3 — direct extraction, NOT derivation):');
      console.log('-'.repeat(90));
      console.log(
        '  ' +
        'Ticker'.padEnd(8) +
        'Quarter'.padEnd(10) +
        'Field'.padEnd(22) +
        'MS Value'.padEnd(20) +
        'Engine Value'.padEnd(20) +
        'Ratio'.padEnd(10) +
        'Pct Diff'
      );

      for (const d of nonQ4Diffs) {
        const pctStr = d.pctDiff !== Infinity ? (d.pctDiff * 100).toFixed(1) + '%' : 'INF';
        const ratioStr = d.ratio !== Infinity ? d.ratio.toFixed(4) : 'INF';
        console.log(
          '  ' +
          d.ticker.padEnd(8) +
          d.quarter.padEnd(10) +
          d.field.padEnd(22) +
          String(d.msValue).padEnd(20) +
          String(d.engineValue).padEnd(20) +
          ratioStr.padEnd(10) +
          pctStr
        );
      }
    }

    // ─── Ratio pattern analysis ──────────────────────────────
    if (allDiffs.length > 0) {
      console.log('\n' + '-'.repeat(90));
      console.log('RATIO PATTERN ANALYSIS (looking for systematic patterns):');
      console.log('-'.repeat(90));

      // Group by approximate ratio buckets
      const ratioBuckets = {};
      for (const d of allDiffs) {
        if (d.ratio === Infinity || isNaN(d.ratio)) continue;
        const bucket = d.ratio.toFixed(2);
        if (!ratioBuckets[bucket]) ratioBuckets[bucket] = [];
        ratioBuckets[bucket].push(d);
      }

      const sortedBuckets = Object.entries(ratioBuckets)
        .sort((a, b) => b[1].length - a[1].length);

      console.log('  Ratio clusters (engine/MS):');
      for (const [ratio, cases] of sortedBuckets.slice(0, 15)) {
        const tickers = [...new Set(cases.map(c => c.ticker))].join(', ');
        const q4Count = cases.filter(c => c.isQ4).length;
        console.log(`    ratio=${ratio}: ${cases.length} cases (${q4Count} Q4) — ${tickers}`);
      }
    }

    // ─── Companies with failures ─────────────────────────────
    const failingCompanies = tickerSummaries.filter(
      s => s.basicDiff > 0 || s.dilutedDiff > 0
    );
    console.log('\n' + '-'.repeat(90));
    console.log(`FAILING COMPANIES: ${failingCompanies.length} of ${tickerSummaries.length}`);
    console.log('-'.repeat(90));
    for (const s of failingCompanies) {
      const totalDiffs = s.basicDiff + s.dilutedDiff;
      console.log(
        `  ${s.ticker.padEnd(8)} ${totalDiffs} diffs (${s.q4Diffs} Q4, ${s.nonQ4Diffs} non-Q4)`
      );
    }

    console.log('\n  EDGAR API: ' + requestCount + ' live requests, ' + cacheHits + ' cache hits');
  });

  // ─── Run all 50 tickers ──────────────────────────────────────
  it.each(ALL_TICKERS)(
    '%s — shares diagnostic',
    async (ticker) => {
      // Skip EUR companies
      if (EUR_COMPANIES.has(ticker)) {
        tickerSummaries.push({
          ticker, offset: 0,
          basicMatch: 0, basicDiff: 0,
          dilutedMatch: 0, dilutedDiff: 0,
          q4Diffs: 0, nonQ4Diffs: 0,
        });
        return;
      }

      const fixture = msFixtures[ticker];
      const engineData = await fetchEdgarQuarterly(ticker);

      if (!engineData) {
        tickerSummaries.push({
          ticker, offset: 0,
          basicMatch: 0, basicDiff: 0,
          dilutedMatch: 0, dilutedDiff: 0,
          q4Diffs: 0, nonQ4Diffs: 0,
        });
        return;
      }

      // Detect offset
      const offset = detectQuarterlyYearOffset(
        fixture.statements.income,
        engineData.quarterly,
        engineData.fiscalYears || []
      );

      const msIncomeStmt = fixture.statements.income || {};
      const msPeriods = Object.keys(msIncomeStmt).filter(p => p !== 'TTM');

      let basicMatch = 0, basicDiff = 0;
      let dilutedMatch = 0, dilutedDiff = 0;
      let q4Diffs = 0, nonQ4Diffs = 0;

      for (const sharesField of SHARES_FIELDS) {
        for (const msPeriod of msPeriods) {
          const parsed = parseQuarterLabel(msPeriod);
          if (!parsed) continue;

          const edgarYear = parsed.year + offset;
          const edgarQtr = `Q${parsed.quarter}`;
          const isQ4 = parsed.quarter === 4;

          // Skip spin-off pre-spin years
          if (SPIN_OFF[ticker] && edgarYear < SPIN_OFF[ticker]) continue;

          const msValue = msIncomeStmt[msPeriod]?.[sharesField.msField];
          if (msValue == null) continue;

          const engineQtr = engineData.quarterly?.[edgarYear]?.[edgarQtr];
          const engineValue = engineQtr?.income?.[sharesField.thesisField];

          if (engineValue == null) {
            // Missing — don't count as diff for this diagnostic
            continue;
          }

          // Compare: MS sign=1, so expected = msValue
          const expected = msValue;
          const actual = engineValue;

          // Both near-zero
          if (Math.abs(expected) < 1 && Math.abs(actual) < 1) {
            if (sharesField.thesisField === 'basic_average_shares') basicMatch++;
            else dilutedMatch++;
            continue;
          }

          const pctDiff = expected !== 0 ? Math.abs((actual - expected) / expected) : Infinity;
          const ratio = expected !== 0 ? actual / expected : Infinity;

          // Tolerance: exact (1%)
          if (pctDiff <= 0.01) {
            if (sharesField.thesisField === 'basic_average_shares') basicMatch++;
            else dilutedMatch++;
          } else {
            // DIFF
            if (sharesField.thesisField === 'basic_average_shares') basicDiff++;
            else dilutedDiff++;

            if (isQ4) q4Diffs++;
            else nonQ4Diffs++;

            allDiffs.push({
              ticker,
              quarter: `Q${parsed.quarter} ${parsed.year}`,
              field: sharesField.label,
              msValue: expected,
              engineValue: actual,
              ratio,
              pctDiff,
              isQ4,
              edgarYear,
            });
          }
        }
      }

      tickerSummaries.push({
        ticker, offset,
        basicMatch, basicDiff,
        dilutedMatch, dilutedDiff,
        q4Diffs, nonQ4Diffs,
      });
    },
    120000
  );
});
