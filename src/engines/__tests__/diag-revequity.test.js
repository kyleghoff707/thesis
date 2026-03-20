/**
 * diag-revequity.test.js — Diagnostic deep-dive for `revenues` and `equity` failures
 *
 * Shows every failure with: ticker, year, MS value, engine value, % difference.
 * For equity, also dumps sub-components the engine has for each failing year.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'morningstar');
const EDGAR_CACHE_DIR = path.join(FIXTURES_DIR, 'edgar-cache');

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

// ─── Constants ───────────────────────────────────────────────

const STMT_MAP = {
  income: 'income',
  balance_sheet: 'balance',
  cash_flow: 'cashFlow',
};

const THRESHOLDS = { exact: 0.01, close: 0.05 };

const SPIN_OFF = { JNJ: 2023, T: 2022 };

const EUR_COMPANIES = new Set(['RACE']);

// ─── Fiscal Year Offset Detection ────────────────────────────

function detectYearOffset(msStmt, engineIncome, engineYears) {
  if (!msStmt || !engineIncome) return 0;

  const msYears = Object.keys(msStmt).filter(y => y !== 'TTM').map(Number);
  if (msYears.length === 0 || engineYears.length === 0) return 0;

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
        if (pct < 0.02) matches++;
      }
    }
    scores[offset] = { matches, compared };
  }

  if (scores[-1].matches > scores[0].matches && scores[-1].matches >= 3) {
    return -1;
  }
  return 0;
}

// ─── Equity Sub-Component Fields ─────────────────────────────

const EQUITY_SUB_FIELDS = [
  'equity',
  'equity_attributable_to_parent',
  'minority_interest',
  'common_stock',
  'additional_paid_in_capital',
  'retained_earnings',
  'aoci',
  'treasury_stock',
  'preferred_stock',
  'liabilities_and_equity',
  'liabilities',
];

// ─── Diagnostic Fields Config ────────────────────────────────

const DIAG_FIELDS = [
  {
    thesisField: 'revenues',
    msField: 'Total Revenue',
    msStmtKey: 'income',
    engineStmtKey: 'income',
    sign: 1,
    tolerance: THRESHOLDS.exact,
  },
  {
    thesisField: 'equity',
    msField: 'Total Equity',
    msStmtKey: 'balance_sheet',
    engineStmtKey: 'balance',
    sign: 1,
    tolerance: THRESHOLDS.exact,
  },
];

// ─── Test Suite ──────────────────────────────────────────────

let fetchEdgarStatements;

const revenueFailures = [];
const equityFailures = [];

describe('Diagnostic: revenues & equity failures', () => {
  beforeAll(async () => {
    const mod = await import('../edgarFinancials.js');
    fetchEdgarStatements = mod.fetchEdgarStatements;
  }, 10000);

  afterAll(() => {
    // ─── Revenue Failures Report ──────────────────────────
    console.log('\n');
    console.log('═'.repeat(100));
    console.log('REVENUE FAILURES DIAGNOSTIC');
    console.log('═'.repeat(100));

    if (revenueFailures.length === 0) {
      console.log('  (none)');
    } else {
      console.log(
        `  ${'Ticker'.padEnd(8)} ${'Year'.padEnd(6)} ${'MS Value'.padStart(20)} ${'Engine Value'.padStart(20)} ${'% Diff'.padStart(10)}  Notes`
      );
      console.log('  ' + '─'.repeat(90));
      for (const f of revenueFailures) {
        const pctStr = f.pct === Infinity ? '  Inf' : (f.pct * 100).toFixed(2) + '%';
        console.log(
          `  ${f.ticker.padEnd(8)} ${String(f.year).padEnd(6)} ${String(f.msValue).padStart(20)} ${String(f.engineValue ?? 'NULL').padStart(20)} ${pctStr.padStart(10)}  ${f.notes}`
        );
      }
    }
    console.log(`\n  Total revenue failures: ${revenueFailures.length}`);
    console.log(`  Unique tickers: ${[...new Set(revenueFailures.map(f => f.ticker))].join(', ') || '(none)'}`);

    // ─── Equity Failures Report ───────────────────────────
    console.log('\n');
    console.log('═'.repeat(100));
    console.log('EQUITY FAILURES DIAGNOSTIC');
    console.log('═'.repeat(100));

    if (equityFailures.length === 0) {
      console.log('  (none)');
    } else {
      console.log(
        `  ${'Ticker'.padEnd(8)} ${'Year'.padEnd(6)} ${'MS Value'.padStart(20)} ${'Engine Value'.padStart(20)} ${'% Diff'.padStart(10)}  Notes`
      );
      console.log('  ' + '─'.repeat(90));
      for (const f of equityFailures) {
        const pctStr = f.pct === Infinity ? '  Inf' : (f.pct * 100).toFixed(2) + '%';
        console.log(
          `  ${f.ticker.padEnd(8)} ${String(f.year).padEnd(6)} ${String(f.msValue).padStart(20)} ${String(f.engineValue ?? 'NULL').padStart(20)} ${pctStr.padStart(10)}  ${f.notes}`
        );

        // Dump sub-components
        if (f.subComponents) {
          for (const [subField, subVal] of Object.entries(f.subComponents)) {
            if (subVal != null) {
              console.log(`${''.padStart(18)}  └─ ${subField.padEnd(35)} = ${String(subVal).padStart(20)}`);
            }
          }
          // Show which sub-components are null
          const nullFields = Object.entries(f.subComponents)
            .filter(([, v]) => v == null)
            .map(([k]) => k);
          if (nullFields.length > 0) {
            console.log(`${''.padStart(18)}  └─ (null fields: ${nullFields.join(', ')})`);
          }
        }
      }
    }
    console.log(`\n  Total equity failures: ${equityFailures.length}`);
    console.log(`  Unique tickers: ${[...new Set(equityFailures.map(f => f.ticker))].join(', ') || '(none)'}`);

    console.log('\n');
    console.log(`EDGAR API: ${requestCount} live requests, ${cacheHits} cache hits`);
    console.log('');
  });

  it.each(ALL_TICKERS)(
    '%s',
    async (ticker) => {
      const fixture = msFixtures[ticker];
      expect(fixture).toBeDefined();

      if (EUR_COMPANIES.has(ticker)) return;

      const engineData = await fetchEdgarStatements(ticker);
      if (!engineData) return;

      // Detect year offset using income statement revenue
      const offset = detectYearOffset(
        fixture.statements.income,
        engineData?.income,
        engineData?.years || []
      );

      for (const diagField of DIAG_FIELDS) {
        const msStmt = fixture.statements[diagField.msStmtKey] || {};
        const msYears = Object.keys(msStmt).filter(y => y !== 'TTM');

        for (const msYear of msYears) {
          const edgarYear = parseInt(msYear) + offset;

          // Skip spin-off pre-spin years
          if (SPIN_OFF[ticker] && edgarYear < SPIN_OFF[ticker]) continue;

          const msValue = msStmt[msYear]?.[diagField.msField];
          if (msValue == null) continue;

          const engineStmt = engineData?.[diagField.engineStmtKey]?.[edgarYear];

          if (!engineStmt) {
            const entry = {
              ticker,
              year: msYear,
              msValue,
              engineValue: null,
              pct: Infinity,
              notes: `MISSING_YEAR (edgar year ${edgarYear}, offset ${offset})`,
            };
            if (diagField.thesisField === 'revenues') revenueFailures.push(entry);
            if (diagField.thesisField === 'equity') {
              entry.subComponents = null;
              equityFailures.push(entry);
            }
            continue;
          }

          const engineValue = engineStmt[diagField.thesisField];

          if (engineValue == null) {
            const entry = {
              ticker,
              year: msYear,
              msValue,
              engineValue: null,
              pct: Infinity,
              notes: 'MISSING_FIELD',
            };
            if (diagField.thesisField === 'revenues') revenueFailures.push(entry);
            if (diagField.thesisField === 'equity') {
              // Gather sub-components even when equity itself is null
              const subs = {};
              for (const sf of EQUITY_SUB_FIELDS) {
                subs[sf] = engineStmt[sf] ?? null;
              }
              entry.subComponents = subs;
              equityFailures.push(entry);
            }
            continue;
          }

          const expected = diagField.sign * msValue;
          let pct;
          if (Math.abs(expected) < 1 && Math.abs(engineValue) < 1) {
            pct = 0;
          } else if (expected === 0) {
            pct = Math.abs(engineValue) < 1_000_000 ? 0 : Infinity;
          } else {
            pct = Math.abs((engineValue - expected) / expected);
          }

          const isDiff = pct > diagField.tolerance;

          if (isDiff) {
            const entry = {
              ticker,
              year: msYear,
              msValue: expected,
              engineValue,
              pct,
              notes: `DIFF (threshold ${(diagField.tolerance * 100).toFixed(0)}%)`,
            };
            if (diagField.thesisField === 'revenues') revenueFailures.push(entry);
            if (diagField.thesisField === 'equity') {
              const subs = {};
              for (const sf of EQUITY_SUB_FIELDS) {
                subs[sf] = engineStmt[sf] ?? null;
              }
              entry.subComponents = subs;
              equityFailures.push(entry);
            }
          }
        }
      }

      // Always pass — this is a diagnostic test
      expect(true).toBe(true);
    },
    120000
  );
});
