#!/usr/bin/env node
/**
 * compare-morningstar.mjs — Main entry point for 50-company Morningstar comparison
 *
 * Orchestrates the full pipeline: load fixtures, run XBRL engine, compare field-by-field,
 * and produce both console summary and JSON detail report.
 *
 * Usage:
 *   node validation/scripts/compare-morningstar.mjs                  # full 50-company run
 *   node validation/scripts/compare-morningstar.mjs --ticker AAPL    # single ticker
 *   node validation/scripts/compare-morningstar.mjs --ticker AAPL,MSFT,LULU  # multiple tickers
 *   node validation/scripts/compare-morningstar.mjs --fy-check       # FY alignment check only
 *
 * Requires bundled engine: auto-builds if missing via `node validation/scripts/bundle.mjs`.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const FIXTURES_DIR = path.resolve(ROOT, 'src/engines/__tests__/fixtures/morningstar');
const EDGAR_CACHE_DIR = path.resolve(FIXTURES_DIR, 'edgar-cache');
const BUNDLE_PATH = path.resolve(__dirname, 'bundled-engines.mjs');
const REPORTS_DIR = path.resolve(ROOT, 'validation/reports');
const FIELD_MAPPING_PATH = path.resolve(FIXTURES_DIR, 'field-mapping.json');

// ─── Browser Polyfills ───────────────────────────────────────

globalThis.localStorage = {
  _data: {},
  getItem(key) { return this._data[key] ?? null; },
  setItem(key, val) { this._data[key] = String(val); },
  removeItem(key) { delete this._data[key]; },
  get length() { return Object.keys(this._data).length; },
  key(i) { return Object.keys(this._data)[i] ?? null; },
};

// ─── SEC Fetch Interceptor ───────────────────────────────────
// Rewrite Vite dev proxy URLs to direct SEC URLs.
// Disk cache in edgar-cache/ for speed (reuse existing cache from vitest runs).

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

// ─── Pre-flight Checks ──────────────────────────────────────

// Auto-build engine bundle if missing
if (!fs.existsSync(BUNDLE_PATH)) {
  process.stderr.write('Engine bundle not found. Building...\n');
  execSync('node validation/scripts/bundle.mjs', { cwd: ROOT, stdio: 'inherit' });
  if (!fs.existsSync(BUNDLE_PATH)) {
    process.stderr.write('ERROR: Failed to build engine bundle.\n');
    process.exit(1);
  }
  process.stderr.write('Engine bundle built successfully.\n');
}

// Verify fixtures exist
const fixtureFiles = fs.readdirSync(FIXTURES_DIR)
  .filter(f => f.endsWith('.json') && f !== 'field-mapping.json');
if (fixtureFiles.length === 0) {
  process.stderr.write('ERROR: No fixture files found in ' + FIXTURES_DIR + '\n');
  process.exit(1);
}

// ─── Load Dependencies ──────────────────────────────────────

import { loadFieldMapping } from './lib/field-mapper.mjs';
import { getSpecialFieldHandlers } from './lib/field-mapper.mjs';
import { compareCompany, EUR_COMPANIES } from './lib/comparator.mjs';
import { generateConsoleReport, generateJsonReport } from './lib/reporter.mjs';
import { parseFiscalYearEnd } from './lib/fiscal-aligner.mjs';

const { fetchEdgarStatements } = await import(BUNDLE_PATH);

// ─── Load Fixtures ───────────────────────────────────────────

const fieldMapping = loadFieldMapping(FIELD_MAPPING_PATH);
const specialHandlers = getSpecialFieldHandlers();

const msFixtures = {};
for (const file of fixtureFiles) {
  const ticker = file.replace('.json', '');
  msFixtures[ticker] = JSON.parse(
    fs.readFileSync(path.resolve(FIXTURES_DIR, file), 'utf-8')
  );
}

// ─── Parse CLI Args ──────────────────────────────────────────

const args = process.argv.slice(2);
const fyCheckOnly = args.includes('--fy-check');
const tickerIdx = args.indexOf('--ticker');
let requestedTickers = null;
if (tickerIdx !== -1 && args[tickerIdx + 1]) {
  requestedTickers = args[tickerIdx + 1].split(',').map(t => t.toUpperCase());
}

// Determine which tickers to run
const allFixtureTickers = Object.keys(msFixtures).sort();
const tickers = requestedTickers
  ? requestedTickers.filter(t => msFixtures[t])
  : allFixtureTickers;

// Warn about tickers not found in fixtures
if (requestedTickers) {
  for (const t of requestedTickers) {
    if (!msFixtures[t]) {
      process.stderr.write(`WARNING: No fixture found for ${t}, skipping.\n`);
    }
  }
}

// ─── FY Alignment Check Mode ────────────────────────────────

if (fyCheckOnly) {
  process.stderr.write(`\nFISCAL YEAR ALIGNMENT CHECK (${tickers.length} companies)\n`);
  process.stderr.write('='.repeat(60) + '\n');

  for (const ticker of tickers) {
    const fixture = msFixtures[ticker];
    const fyEnd = fixture.fiscalYearEnd || 'unknown';
    const parsed = parseFiscalYearEnd(fyEnd);
    const isNonDec = parsed && parsed.monthNum !== 12;

    if (isNonDec || !requestedTickers) {
      const marker = isNonDec ? '  <<< NON-DEC' : '';
      process.stderr.write(`${ticker.padEnd(8)} FY End: ${fyEnd.padEnd(12)} Month: ${String(parsed?.monthNum || '?').padStart(2)}${marker}\n`);
    }
  }

  process.stderr.write('\n');
  process.exit(0);
}

// ─── Run Comparison Pipeline ─────────────────────────────────

process.stderr.write(`\nComparing ${tickers.length} companies against Morningstar fixtures...\n\n`);

const allResults = [];
let engineErrors = 0;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

for (let i = 0; i < tickers.length; i++) {
  const ticker = tickers[i];

  // Skip EUR companies
  if (EUR_COMPANIES.has(ticker)) {
    allResults.push({
      ticker,
      offset: 0,
      results: [{ status: 'SKIP_EUR', msField: 'N/A', thesisField: 'N/A', tolerance: 'informational' }],
    });
    process.stderr.write(`${ticker.padEnd(8)} [${i + 1}/${tickers.length}]  SKIPPED (EUR reporting)\n`);
    continue;
  }

  // Clear localStorage between tickers
  globalThis.localStorage._data = {};

  try {
    const engineData = await fetchEdgarStatements(ticker, { version: 'restated' });

    if (!engineData) {
      allResults.push({
        ticker,
        offset: 0,
        results: [{ status: 'ENGINE_ERROR', msField: 'N/A', thesisField: 'N/A', tolerance: 'informational' }],
      });
      process.stderr.write(`${ticker.padEnd(8)} [${i + 1}/${tickers.length}]  ENGINE_ERROR (no data)\n`);
      engineErrors++;
      await sleep(300);
      continue;
    }

    const fixture = msFixtures[ticker];
    const companyResult = compareCompany(ticker, fixture, engineData, fieldMapping, {
      specialHandlers,
    });
    allResults.push(companyResult);

    // Progress to stderr
    const match = companyResult.results.filter(r => r.status === 'MATCH').length;
    const compared = companyResult.results.filter(
      r => r.status === 'MATCH' || r.status === 'CLOSE' || r.status === 'DIFF'
    ).length;
    const pct = compared > 0 ? ((match / compared) * 100).toFixed(1) : '0.0';
    process.stderr.write(`${ticker.padEnd(8)} [${i + 1}/${tickers.length}]  ${pct}%  (${match}/${compared} match)\n`);

    // Rate limiting between tickers
    await sleep(100);
  } catch (err) {
    allResults.push({
      ticker,
      offset: 0,
      results: [{ status: 'ENGINE_ERROR', msField: 'N/A', thesisField: 'N/A', tolerance: 'informational' }],
    });
    process.stderr.write(`${ticker.padEnd(8)} [${i + 1}/${tickers.length}]  ERROR: ${err.message}\n`);
    engineErrors++;
    await sleep(300);
  }
}

// ─── Generate Reports ────────────────────────────────────────

// Console report to stdout
const consoleReport = generateConsoleReport(allResults);
process.stdout.write(consoleReport + '\n');
process.stdout.write(`EDGAR API: ${requestCount} live requests, ${cacheHits} cache hits\n`);

// JSON report to file
fs.mkdirSync(REPORTS_DIR, { recursive: true });
const jsonReport = generateJsonReport(allResults);
const jsonPath = path.resolve(REPORTS_DIR, 'morningstar-accuracy.json');

// ─── Regression Diff (TRI-06) ──────────────────────────────
// Compare against previous report before overwriting
if (fs.existsSync(jsonPath)) {
  try {
    const previous = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    const prevAcc = previous.overallAccuracy;
    const currAcc = jsonReport.overallAccuracy;
    const delta = (currAcc - prevAcc).toFixed(1);
    const sign = delta > 0 ? '+' : '';

    // Diff failure patterns
    const prevFails = new Set((previous.topFailurePatterns || []).map(p => p.field));
    const currFails = new Set((jsonReport.topFailurePatterns || []).map(p => p.field));
    const gained = [...prevFails].filter(f => !currFails.has(f));
    const lost = [...currFails].filter(f => !prevFails.has(f));

    // Per-company regressions (dropped > 2%)
    const prevByTicker = {};
    for (const c of (previous.companies || [])) prevByTicker[c.ticker] = c.accuracy;
    const regressions = [];
    for (const c of (jsonReport.companies || [])) {
      const prev = prevByTicker[c.ticker];
      if (prev != null && c.accuracy < prev - 2) {
        regressions.push(`${c.ticker} ${prev.toFixed(1)}% → ${c.accuracy.toFixed(1)}%`);
      }
    }

    process.stdout.write('\nREGRESSION DIFF (vs previous run):\n');
    process.stdout.write(`  Accuracy: ${prevAcc.toFixed(1)}% → ${currAcc.toFixed(1)}% (${sign}${delta}%)\n`);
    process.stdout.write(`  Failure patterns resolved: ${gained.length}${gained.length > 0 ? ' (' + gained.join(', ') + ')' : ''}\n`);
    process.stdout.write(`  New failure patterns: ${lost.length}${lost.length > 0 ? ' (' + lost.join(', ') + ')' : ''}\n`);
    if (regressions.length > 0) {
      process.stdout.write(`  Company regressions (>2% drop): ${regressions.join(', ')}\n`);
    }
  } catch (e) {
    process.stderr.write(`WARNING: Could not diff against previous report: ${e.message}\n`);
  }
}

fs.writeFileSync(jsonPath, JSON.stringify(jsonReport, null, 2));
process.stderr.write(`\nJSON report written to: ${jsonPath}\n`);

// Exit code
if (engineErrors > 0) {
  process.stderr.write(`WARNING: ${engineErrors} ticker(s) produced ENGINE_ERROR.\n`);
  process.exit(1);
}

process.exit(0);
