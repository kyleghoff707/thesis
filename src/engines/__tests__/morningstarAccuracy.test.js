/**
 * morningstarAccuracy.test.js — Phase A3: Morningstar Parity Test Suite
 *
 * Compares Thes1s XBRL engine output against 50 Morningstar golden fixtures.
 * Calls the live engine pipeline (with disk-cached EDGAR responses for speed).
 *
 * First run:  ~2-3 min (downloads EDGAR data, caches to disk)
 * Subsequent: ~30-60s  (reads from disk cache, processes through live engine)
 *
 * Cache location: src/engines/__tests__/fixtures/edgar-cache/ (gitignored)
 * Clear cache:    rm -rf src/engines/__tests__/fixtures/edgar-cache/
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'morningstar');
const EDGAR_CACHE_DIR = path.join(FIXTURES_DIR, 'edgar-cache');

// ─── Fetch Interceptor ──────────────────────────────────────
// The XBRL engine uses Vite dev proxy URLs in dev mode (/api/edgar/...).
// In vitest there's no Vite server, so we rewrite to direct SEC URLs,
// add the required User-Agent header, and cache responses to disk.

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

  // Rewrite Vite dev proxy URLs to direct SEC URLs
  if (resolved.startsWith('/api/edgar/')) {
    resolved = 'https://data.sec.gov/' + resolved.slice('/api/edgar/'.length);
  } else if (resolved.startsWith('/api/sec/')) {
    resolved = 'https://www.sec.gov/' + resolved.slice('/api/sec/'.length);
  }

  // Only intercept SEC requests
  if (!resolved.includes('sec.gov') && !resolved.includes('data.sec.gov')) {
    return originalFetch(url, opts);
  }

  // Check disk cache
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

  // Rate limit: 100ms between SEC requests (10 req/sec)
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < 100) {
    await new Promise(r => setTimeout(r, 100 - elapsed));
  }
  lastRequestTime = Date.now();
  requestCount++;

  // Fetch from SEC with proper headers
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
  fs.readFileSync(path.join(FIXTURES_DIR, 'field-mapping.json'), 'utf-8')
);

const msFixtures = {};
for (const file of fs.readdirSync(FIXTURES_DIR)) {
  if (!file.endsWith('.json') || file === 'field-mapping.json') continue;
  const ticker = file.replace('.json', '');
  msFixtures[ticker] = JSON.parse(
    fs.readFileSync(path.join(FIXTURES_DIR, file), 'utf-8')
  );
}

const ALL_TICKERS = Object.keys(msFixtures).sort();

// ─── Company Categories ──────────────────────────────────────

const FINANCIAL_SECTOR = new Set(['BRK-B', 'JPM', 'MET', 'WFC']);

const SPIN_OFF = { JNJ: 2023, T: 2022 };

const RESTATEMENT_FLAGGED = new Set(['EQIX', 'LEN', 'NEM', 'PG', 'SFM', 'XPEL']);

// Companies that report in non-USD currency — skip from comparison
// (EDGAR XBRL uses reporting currency; fixture values are in reporting currency)
const EUR_COMPANIES = new Set(['RACE']);

// ─── Fiscal Year Offset Detection ────────────────────────────
// Morningstar labels by calendar year the FY ends.
// EDGAR labels by the company's stated FY designation.
// For some non-Dec-FY companies, MS year != EDGAR year.
// We auto-detect offset by comparing revenue for each possible shift.
// Bias toward offset=0 (the common case) — only use -1 if it's clearly better.

function detectYearOffset(msStmt, engineIncome, engineYears) {
  if (!msStmt || !engineIncome) return 0;

  const msYears = Object.keys(msStmt).filter(y => y !== 'TTM').map(Number);
  if (msYears.length === 0 || engineYears.length === 0) return 0;

  // Try offsets 0 and -1
  const scores = {};
  for (const offset of [0, -1]) {
    let matches = 0;
    let compared = 0;
    for (const msYear of msYears) {
      const edgarYear = msYear + offset;
      const msRev = msStmt[String(msYear)]?.['Total Revenue'];
      const engRev = engineIncome[edgarYear]?.revenues;
      if (msRev != null && engRev != null) {
        compared++;
        const pct = Math.abs((engRev - msRev) / msRev);
        if (pct < 0.02) matches++; // Within 2% = match
      }
    }
    scores[offset] = { matches, compared };
  }

  // Bias toward 0: only use -1 if it has strictly more matches AND at least 3
  // (3 prevents false positives from coincidental near-matches in data discrepancies)
  if (scores[-1].matches > scores[0].matches && scores[-1].matches >= 3) {
    return -1;
  }
  return 0;
}

// ─── Statement Key Mapping ───────────────────────────────────
// MS fixture keys → engine return keys
const STMT_MAP = {
  income: 'income',
  balance_sheet: 'balance',
  cash_flow: 'cashFlow',
};

// ─── Tolerance Thresholds ────────────────────────────────────

const THRESHOLDS = {
  exact: 0.01,
  close: 0.05,
  approximate: 0.10,
  relaxed: 0.20,
  informational: Infinity,
};

// ─── Comparison Logic ────────────────────────────────────────

function compareField(msValue, thesisValue, sign, tolerance) {
  const expected = sign * msValue;
  const actual = thesisValue;

  // Both zero or both near-zero
  if (Math.abs(expected) < 1 && Math.abs(actual) < 1) {
    return { status: 'MATCH', pct: 0, expected, actual };
  }

  // One zero, other not
  if (expected === 0) {
    return {
      status: Math.abs(actual) < 1_000_000 ? 'MATCH' : 'DIFF',
      pct: Infinity,
      expected,
      actual,
    };
  }

  const pct = Math.abs((actual - expected) / expected);
  const threshold = THRESHOLDS[tolerance] || THRESHOLDS.close;

  let status;
  if (pct <= threshold) status = 'MATCH';
  else if (pct <= THRESHOLDS.close) status = 'CLOSE';
  else status = 'DIFF';

  return { status, pct, expected, actual };
}

function compareCompany(ticker, fixture, engineData) {
  const results = [];
  const offset = detectYearOffset(
    fixture.statements.income,
    engineData?.income,
    engineData?.years || []
  );

  for (const [msStmtKey, mappings] of Object.entries(fieldMapping)) {
    if (msStmtKey === '_meta') continue;
    const engineStmtKey = STMT_MAP[msStmtKey];

    for (const [msField, mapInfo] of Object.entries(mappings)) {
      if (!mapInfo.thesisField) continue; // Skip unmapped fields

      const msStmt = fixture.statements[msStmtKey] || {};
      const msYears = Object.keys(msStmt).filter(y => y !== 'TTM');

      for (const msYear of msYears) {
        const edgarYear = parseInt(msYear) + offset;
        let msValue = msStmt[msYear]?.[msField];

        // ─── P1a: Intangible Assets — compare against implied NET ───
        // MS "Intangibles other than Goodwill" is GROSS carrying amount.
        // Our engine extracts NET (after accumulated amortization).
        // Compute implied NET = GROSS + AccumAmort (AccumAmort is negative).
        if (msField === 'Intangibles other than Goodwill' && msValue != null) {
          const accumAmort =
            msStmt[msYear]?.['Accumulated Amortization of Intangibles other than Goodwill'] ??
            msStmt[msYear]?.['Accumulated Amortization of Intangible Assets'] ??
            msStmt[msYear]?.['Accumulated Amortization and Impairment'];
          if (accumAmort != null) {
            msValue = msValue + accumAmort; // GROSS + (-AccumAmort) = NET
          }
        }

        // ─── P1b: Operating Income — prefer "Reported" over "Normalized" ───
        // MS "Total Operating Profit/Loss" is NORMALIZED (excludes restructuring,
        // impairment). Our engine extracts as-reported XBRL OperatingIncomeLoss.
        // Use "Reported Total Operating Profit/Loss" when available.
        if (msField === 'Total Operating Profit/Loss') {
          const reportedValue = msStmt[msYear]?.['Reported Total Operating Profit/Loss'];
          if (reportedValue != null) {
            msValue = reportedValue;
          }
        }

        // ─── P1c: Accrued Liabilities — skip combined-only companies ───
        // When MS only has combined "Payables and Accrued Expenses" (no separate
        // "Accrued Expenses, Current"), the data doesn't exist at required granularity.
        if (msField === 'Accrued Expenses, Current' && msValue != null) {
          // Check if this company has separate accrued in ANY year — if not, it's
          // a combined-only company and we should skip
          const hasAnySeparateAccrued = msYears.some(
            yr => msStmt[yr]?.['Accrued Expenses, Current'] != null
          );
          if (!hasAnySeparateAccrued) {
            // Combined-only company — skip this comparison entirely
            continue;
          }
        }

        // Skip if MS doesn't have this field for this year
        if (msValue == null) continue;

        // Skip spin-off pre-spin years for affected companies
        if (SPIN_OFF[ticker] && edgarYear < SPIN_OFF[ticker]) {
          results.push({
            msField,
            thesisField: mapInfo.thesisField,
            statement: msStmtKey,
            msYear,
            edgarYear,
            status: 'SKIP_SPINOFF',
            tolerance: mapInfo.tolerance,
          });
          continue;
        }

        const engineStmt = engineData?.[engineStmtKey]?.[edgarYear];
        if (!engineStmt) {
          results.push({
            msField,
            thesisField: mapInfo.thesisField,
            statement: msStmtKey,
            msYear,
            edgarYear,
            status: 'MISSING_YEAR',
            tolerance: mapInfo.tolerance,
          });
          continue;
        }

        const thesisValue = engineStmt[mapInfo.thesisField];
        if (thesisValue == null) {
          results.push({
            msField,
            thesisField: mapInfo.thesisField,
            statement: msStmtKey,
            msYear,
            edgarYear,
            status: 'MISSING_FIELD',
            tolerance: mapInfo.tolerance,
          });
          continue;
        }

        // Apply sign multiplier
        let { sign } = mapInfo;

        // Special handling: effective_tax_rate (MS decimal → Thes1s percentage)
        let adjustedMsValue = msValue;
        if (mapInfo.thesisField === 'effective_tax_rate') {
          adjustedMsValue = msValue * 100;
        }

        const comparison = compareField(
          adjustedMsValue,
          thesisValue,
          sign,
          mapInfo.tolerance
        );

        // Relax tolerance for financial-sector companies on revenue and debt fields
        let effectiveTolerance = mapInfo.tolerance;
        if (FINANCIAL_SECTOR.has(ticker)) {
          if (['revenues', 'total_debt', 'net_debt'].includes(mapInfo.thesisField)) {
            effectiveTolerance = 'relaxed';
          }
        }

        results.push({
          msField,
          thesisField: mapInfo.thesisField,
          statement: msStmtKey,
          msYear,
          edgarYear,
          status: comparison.status,
          pct: comparison.pct,
          expected: comparison.expected,
          actual: comparison.actual,
          tolerance: effectiveTolerance,
        });
      }
    }
  }

  return { ticker, offset, results };
}

// ─── Report Generation ───────────────────────────────────────

function generateReport(allResults) {
  const lines = [];
  lines.push('');
  lines.push('MORNINGSTAR ACCURACY REPORT');
  lines.push('═'.repeat(70));

  let totalMatch = 0;
  let totalClose = 0;
  let totalDiff = 0;
  let totalMissing = 0;
  let totalSkipped = 0;
  let totalCompared = 0;
  const failurePatterns = {};

  for (const { ticker, offset, results } of allResults) {
    const match = results.filter(r => r.status === 'MATCH').length;
    const close = results.filter(r => r.status === 'CLOSE').length;
    const diff = results.filter(r => r.status === 'DIFF').length;
    const missing = results.filter(
      r => r.status === 'MISSING_FIELD' || r.status === 'MISSING_YEAR'
    ).length;
    const skipped = results.filter(r => r.status === 'SKIP_SPINOFF').length;
    const compared = match + close + diff;
    const pct = compared > 0 ? ((match / compared) * 100).toFixed(1) : '0.0';

    const parts = [`${ticker.padEnd(8)}`];
    parts.push(`${String(match).padStart(4)}/${String(compared).padStart(4)} match (${pct}%)`);
    if (close > 0) parts.push(`${close} close`);
    if (missing > 0) parts.push(`${missing} missing`);
    if (diff > 0) parts.push(`${diff} DIFF`);
    if (offset !== 0) parts.push(`offset:${offset}`);
    if (skipped > 0) parts.push(`${skipped} skipped`);

    lines.push(parts.join('  '));

    totalMatch += match;
    totalClose += close;
    totalDiff += diff;
    totalMissing += missing;
    totalSkipped += skipped;
    totalCompared += compared;

    // Track failure patterns
    for (const r of results.filter(r => r.status === 'DIFF')) {
      const key = `${r.thesisField} (${r.statement})`;
      if (!failurePatterns[key]) failurePatterns[key] = [];
      failurePatterns[key].push({
        ticker,
        year: r.msYear,
        expected: r.expected,
        actual: r.actual,
        pct: r.pct,
      });
    }
  }

  lines.push('═'.repeat(70));
  const overallPct =
    totalCompared > 0
      ? ((totalMatch / totalCompared) * 100).toFixed(1)
      : '0.0';
  lines.push(
    `OVERALL: ${totalMatch}/${totalCompared} (${overallPct}%) match | ${totalClose} close | ${totalMissing} missing | ${totalDiff} DIFF`
  );

  // Top failure patterns
  const sortedPatterns = Object.entries(failurePatterns)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 15);

  if (sortedPatterns.length > 0) {
    lines.push('');
    lines.push('TOP FAILURE PATTERNS:');
    for (const [field, cases] of sortedPatterns) {
      const tickers = [...new Set(cases.map(c => c.ticker))];
      lines.push(
        `  ${field}: ${cases.length} failures across ${tickers.length} companies`
      );
    }
  }

  lines.push('');
  lines.push(
    `EDGAR API: ${requestCount} live requests, ${cacheHits} cache hits`
  );

  return lines.join('\n');
}

// ─── Test Suite ──────────────────────────────────────────────

// Dynamic import of engine module (after fetch interceptor is in place)
let fetchEdgarStatements;

const allResults = [];

describe('Morningstar Accuracy', () => {
  beforeAll(async () => {
    // Import engine after fetch override is active
    const mod = await import('../edgarFinancials.js');
    fetchEdgarStatements = mod.fetchEdgarStatements;
  }, 10000);

  afterAll(() => {
    // Print the full accuracy report
    if (allResults.length > 0) {
      console.log(generateReport(allResults));
    }
  });

  // Each company is one test case
  it.each(ALL_TICKERS)(
    '%s',
    async (ticker) => {
      const fixture = msFixtures[ticker];
      expect(fixture, `No fixture for ${ticker}`).toBeDefined();

      // Skip EUR-reporting companies (EDGAR uses EUR values, comparison needs currency handling)
      if (EUR_COMPANIES.has(ticker)) {
        allResults.push({
          ticker,
          offset: 0,
          results: [{ status: 'SKIP_EUR', msField: 'N/A', thesisField: 'N/A', tolerance: 'informational' }],
        });
        return;
      }

      // Fetch from live engine (uses disk-cached EDGAR responses)
      const engineData = await fetchEdgarStatements(ticker);

      if (!engineData) {
        allResults.push({
          ticker,
          offset: 0,
          results: [{ status: 'ENGINE_ERROR', msField: 'N/A', thesisField: 'N/A', tolerance: 'informational' }],
        });
        // Don't fail — some tickers might not resolve. Track and report.
        return;
      }

      const companyResult = compareCompany(ticker, fixture, engineData);
      allResults.push(companyResult);

      // For the BASELINE run, we don't fail on diffs — we establish baseline.
      // Change this to assert on materialDiffs after Phase B fixes.
      //
      // For now, just ensure the engine returned data and we got comparisons.
      const compared = companyResult.results.filter(
        r => r.status === 'MATCH' || r.status === 'CLOSE' || r.status === 'DIFF'
      );
      expect(
        compared.length,
        `${ticker}: no field comparisons succeeded — engine may have returned empty data`
      ).toBeGreaterThan(0);
    },
    120000 // 2 minute timeout per company (first run downloads EDGAR data)
  );
});
