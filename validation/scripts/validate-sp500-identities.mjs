#!/usr/bin/env node
/**
 * validate-sp500-identities.mjs -- S&P 500 accounting identity check orchestrator
 *
 * Runs the existing validateCompany() function against all 503 S&P 500 companies.
 * Checks 10 accounting identities (Assets=L+E, GP=Rev-COGS, etc.) per year.
 *
 * Usage:
 *   node validation/scripts/validate-sp500-identities.mjs                    # full 503-company run
 *   node validation/scripts/validate-sp500-identities.mjs --ticker AAPL      # single ticker
 *   node validation/scripts/validate-sp500-identities.mjs --ticker AAPL,MSFT # multiple tickers
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const TICKER_LIST_PATH = path.resolve(ROOT, 'validation/data/sp500-tickers.json');
const EDGAR_CACHE_DIR = path.resolve(ROOT, 'validation/cache/edgar-sp500');
const BUNDLE_PATH = path.resolve(__dirname, 'bundled-engines.mjs');
const REPORTS_DIR = path.resolve(ROOT, 'validation/reports');

// ─── Browser Polyfills ──────────────────────────────────────

globalThis.localStorage = {
  _data: {},
  getItem(key) { return this._data[key] ?? null; },
  setItem(key, val) { this._data[key] = String(val); },
  removeItem(key) { delete this._data[key]; },
  get length() { return Object.keys(this._data).length; },
  key(i) { return Object.keys(this._data)[i] ?? null; },
};

// ─── SEC Fetch Interceptor ──────────────────────────────────
// Reuse same EDGAR cache as compare-sp500-fmp.mjs for cache hits.

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

// ─── Pre-flight Checks ─────────────────────────────────────

if (!fs.existsSync(BUNDLE_PATH)) {
  process.stderr.write('Engine bundle not found. Building...\n');
  execSync('node validation/scripts/bundle.mjs', { cwd: ROOT, stdio: 'inherit' });
  if (!fs.existsSync(BUNDLE_PATH)) {
    process.stderr.write('ERROR: Failed to build engine bundle.\n');
    process.exit(1);
  }
  process.stderr.write('Engine bundle built successfully.\n');
}

if (!fs.existsSync(TICKER_LIST_PATH)) {
  process.stderr.write('ERROR: S&P 500 ticker list not found.\n');
  process.stderr.write("Run 'node validation/scripts/fetch-sp500-fmp.mjs' first.\n");
  process.exit(1);
}

// ─── Load Dependencies ─────────────────────────────────────

const { fetchEdgarStatements, validateCompany, cacheClear } = await import(BUNDLE_PATH);

// ─── Load Ticker List ──────────────────────────────────────

const tickerData = JSON.parse(fs.readFileSync(TICKER_LIST_PATH, 'utf-8'));
const allTickers = tickerData.tickers;

// ─── Parse CLI Args ────────────────────────────────────────

const args = process.argv.slice(2);
const tickerIdx = args.indexOf('--ticker');
let requestedTickers = null;
if (tickerIdx !== -1 && args[tickerIdx + 1]) {
  requestedTickers = args[tickerIdx + 1].split(',').map(t => t.toUpperCase());
}

const tickers = requestedTickers
  ? requestedTickers.filter(t => allTickers.includes(t))
  : allTickers;

if (requestedTickers) {
  for (const t of requestedTickers) {
    if (!allTickers.includes(t)) {
      process.stderr.write(`WARNING: ${t} not in S&P 500 list, skipping.\n`);
    }
  }
}

// ─── Run Identity Check Pipeline ───────────────────────────

process.stderr.write(`\nRunning identity checks on ${tickers.length} companies...\n\n`);

const allCompanyResults = [];
let engineErrors = 0;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

for (let i = 0; i < tickers.length; i++) {
  const ticker = tickers[i];

  globalThis.localStorage._data = {};
  // Clear in-memory engine cache to prevent OOM on 503-company runs
  cacheClear('edgar');
  cacheClear('sa-cache');

  try {
    const engineData = await fetchEdgarStatements(ticker, { version: 'restated' });

    if (!engineData) {
      allCompanyResults.push({ ticker, status: 'ENGINE_ERROR', passRate: 0, checks: {} });
      process.stderr.write(`${ticker.padEnd(8)} [${i + 1}/${tickers.length}]  ENGINE_ERROR (no data)\n`);
      engineErrors++;
      await sleep(300);
      continue;
    }

    const validation = await validateCompany(ticker, engineData, { skipFrames: true });

    // Tally identity checks across all years
    let pass = 0, fail = 0, skip = 0;
    const failingChecks = [];

    for (const yr of Object.keys(validation.identityChecks)) {
      for (const check of validation.identityChecks[yr]) {
        if (check.status === 'pass') pass++;
        else if (check.status === 'fail') {
          fail++;
          failingChecks.push({ year: yr, name: check.name, lhs: check.lhs, rhs: check.rhs, diff: check.diff });
        }
        else skip++;
      }
    }

    const total = pass + fail;
    const passRate = total > 0 ? Math.round(pass / total * 1000) / 10 : 100;

    allCompanyResults.push({
      ticker,
      status: 'OK',
      passRate,
      totalChecks: total,
      passCount: pass,
      failCount: fail,
      skipCount: skip,
      failingChecks,
    });

    process.stderr.write(
      `${ticker.padEnd(8)} [${i + 1}/${tickers.length}]  ${passRate.toFixed(1)}% pass  (${pass}/${total} checks)\n`
    );

    await sleep(100);
  } catch (err) {
    allCompanyResults.push({ ticker, status: 'ENGINE_ERROR', passRate: 0, checks: {} });
    process.stderr.write(`${ticker.padEnd(8)} [${i + 1}/${tickers.length}]  ERROR: ${err.message}\n`);
    engineErrors++;
    await sleep(300);
  }
}

// ─── Aggregate Results ─────────────────────────────────────

const okResults = allCompanyResults.filter(r => r.status === 'OK');
let totalPass = 0, totalFail = 0, totalSkip = 0;

for (const r of okResults) {
  totalPass += r.passCount;
  totalFail += r.failCount;
  totalSkip += r.skipCount;
}

const totalChecked = totalPass + totalFail;
const overallPassRate = totalChecked > 0 ? Math.round(totalPass / totalChecked * 1000) / 10 : 100;

// Per-check pass rates
const perCheck = {};
for (const r of okResults) {
  for (const fc of r.failingChecks) {
    if (!perCheck[fc.name]) perCheck[fc.name] = { pass: 0, fail: 0, skip: 0 };
    perCheck[fc.name].fail++;
  }
}
// Count passes (all checks per company per year minus failures)
for (const r of okResults) {
  // We need the raw check data — reconstruct from pass/fail counts
  // Better approach: tally from the individual check names
}

// Rebuild per-check tallies properly by re-scanning failingChecks
const checkNames = [
  'Assets = Liabilities + Equity',
  'Current Assets + Non-Current Assets = Total Assets',
  'Current Liab + Non-Current Liab = Total Liabilities',
  'Gross Profit = Revenue - COGS',
  'OCF + ICF + FCF + FX ≈ Change in Cash',
  'FCF = OCF - CapEx',
  'Net Income ≈ Pre-Tax Income - Tax',
  'Working Capital = Current Assets - Current Liabilities',
  'Net Debt = Total Debt - Cash',
  'Operating Income ≈ GP - Itemized OpEx',
];

// Collect all failing check names with counts
const failByCheck = {};
for (const r of okResults) {
  for (const fc of r.failingChecks) {
    failByCheck[fc.name] = (failByCheck[fc.name] || 0) + 1;
  }
}

// We know the total checks and total fails, so total passes per check
// is tricky without tracking each check individually. Instead, count
// how many times each check was run vs failed.
// Since not every check runs every year (depends on data availability),
// we'll report fail counts and company counts per check.
const failByCheckCompany = {};
for (const r of okResults) {
  const checkSet = new Set();
  for (const fc of r.failingChecks) {
    checkSet.add(fc.name);
  }
  for (const name of checkSet) {
    failByCheckCompany[name] = (failByCheckCompany[name] || 0) + 1;
  }
}

// ─── Console Report ────────────────────────────────────────

const lines = [];
lines.push('');
lines.push('S&P 500 ACCOUNTING IDENTITY CHECK REPORT');
lines.push('==========================================');
lines.push(`Companies: ${tickers.length} | Processed: ${okResults.length} | Errors: ${engineErrors}`);
lines.push('');
lines.push('OVERALL PASS RATE');
lines.push(`  Pass: ${totalPass} / ${totalChecked} checks (${overallPassRate.toFixed(1)}%)`);
lines.push(`  Fail: ${totalFail} | Skip: ${totalSkip}`);
lines.push('');
lines.push('FAILURES BY CHECK TYPE');
lines.push(`  ${'Check Name'.padEnd(52)} Failures  Companies`);
lines.push(`  ${'─'.repeat(52)} ${'─'.repeat(8)}  ${'─'.repeat(9)}`);

const sortedChecks = Object.entries(failByCheck).sort((a, b) => b[1] - a[1]);
for (const [name, count] of sortedChecks) {
  const compCount = failByCheckCompany[name] || 0;
  lines.push(`  ${name.padEnd(52)} ${String(count).padStart(8)}  ${String(compCount).padStart(9)}`);
}
if (sortedChecks.length === 0) {
  lines.push('  (no failures)');
}

lines.push('');
lines.push('COMPANIES WITH MOST FAILURES (bottom 10)');
lines.push(`  ${'Ticker'.padEnd(8)} ${'Pass%'.padStart(7)}  ${'Fails'.padStart(5)}  Top Failing Check`);
lines.push(`  ${'─'.repeat(8)} ${'─'.repeat(7)}  ${'─'.repeat(5)}  ${'─'.repeat(40)}`);

const bottom10 = [...okResults]
  .filter(r => r.failCount > 0)
  .sort((a, b) => a.passRate - b.passRate)
  .slice(0, 10);

for (const r of bottom10) {
  const topFail = r.failingChecks.length > 0
    ? r.failingChecks[0].name.slice(0, 40)
    : '';
  lines.push(`  ${r.ticker.padEnd(8)} ${r.passRate.toFixed(1).padStart(6)}%  ${String(r.failCount).padStart(5)}  ${topFail}`);
}
if (bottom10.length === 0) {
  lines.push('  (no failures)');
}

lines.push('');

const consoleReport = lines.join('\n');
process.stdout.write(consoleReport + '\n');
process.stdout.write(`EDGAR API: ${requestCount} live requests, ${cacheHits} cache hits\n`);

// ─── JSON Report ───────────────────────────────────────────

const perCheckPassRates = {};
for (const [name, failCount] of Object.entries(failByCheck)) {
  perCheckPassRates[name] = {
    fail: failCount,
    companies: failByCheckCompany[name] || 0,
  };
}

const jsonReport = {
  timestamp: new Date().toISOString(),
  summary: {
    totalCompanies: tickers.length,
    processed: okResults.length,
    errors: engineErrors,
    overallPassRate,
    totalPass,
    totalFail,
    totalSkip,
    perCheckFailures: perCheckPassRates,
  },
  companies: allCompanyResults.map(r => ({
    ticker: r.ticker,
    status: r.status,
    passRate: r.passRate,
    totalChecks: r.totalChecks || 0,
    passCount: r.passCount || 0,
    failCount: r.failCount || 0,
    skipCount: r.skipCount || 0,
    failingChecks: r.failingChecks || [],
  })),
};

fs.mkdirSync(REPORTS_DIR, { recursive: true });
const jsonPath = path.resolve(REPORTS_DIR, 'sp500-identity-checks.json');
fs.writeFileSync(jsonPath, JSON.stringify(jsonReport, null, 2));
process.stderr.write(`\nJSON report written to: ${jsonPath}\n`);

// Exit code: 0 if pass rate > 90%, 1 otherwise
process.exit(overallPassRate > 90 ? 0 : 1);
