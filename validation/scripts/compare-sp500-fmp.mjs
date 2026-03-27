#!/usr/bin/env node
/**
 * compare-sp500-fmp.mjs -- Main orchestrator for S&P 500 FMP comparison
 *
 * Compares FMP financial data against the XBRL engine output for all S&P 500
 * companies, producing tiered accuracy reports (Tier 1/2/3 separately + overall).
 *
 * Usage:
 *   node validation/scripts/compare-sp500-fmp.mjs                         # full 503-company run
 *   node validation/scripts/compare-sp500-fmp.mjs --ticker AAPL           # single ticker
 *   node validation/scripts/compare-sp500-fmp.mjs --ticker AAPL,MSFT,LULU # multiple tickers
 *   node validation/scripts/compare-sp500-fmp.mjs --show-all              # show all companies in report
 *
 * Prerequisites:
 *   1. Run `node validation/scripts/fetch-sp500-fmp.mjs` first to populate FMP cache
 *   2. Engine bundle auto-builds if missing via `node validation/scripts/bundle.mjs`
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const TICKER_LIST_PATH = path.resolve(ROOT, 'validation/data/sp500-tickers.json');
const FMP_CACHE_DIR = path.resolve(ROOT, 'validation/cache/fmp');
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
// Rewrite Vite dev proxy URLs to direct SEC URLs.
// Disk cache in edgar-sp500/ for speed (separate from MS comparison cache).

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

// ─── Pre-flight Checks ─────────────────────────────────────

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

// Verify ticker list exists
if (!fs.existsSync(TICKER_LIST_PATH)) {
  process.stderr.write('ERROR: S&P 500 ticker list not found.\n');
  process.stderr.write('Run \'node validation/scripts/fetch-sp500-fmp.mjs\' first to fetch FMP data.\n');
  process.exit(1);
}

// ─── Load Dependencies ─────────────────────────────────────

import { readCache } from './lib/disk-cache.mjs';
import { compareFmpToEngine } from './lib/sp500-fmp-comparator.mjs';
import { generateSP500ConsoleReport, generateSP500JsonReport, tallyTieredResults } from './lib/sp500-reporter.mjs';

const { fetchEdgarStatements } = await import(BUNDLE_PATH);

// ─── Load Ticker List ──────────────────────────────────────

const tickerData = JSON.parse(fs.readFileSync(TICKER_LIST_PATH, 'utf-8'));
const allTickers = tickerData.tickers;

// ─── Parse CLI Args ────────────────────────────────────────

const args = process.argv.slice(2);
const showAll = args.includes('--show-all');
const tickerIdx = args.indexOf('--ticker');
let requestedTickers = null;
if (tickerIdx !== -1 && args[tickerIdx + 1]) {
  requestedTickers = args[tickerIdx + 1].split(',').map(t => t.toUpperCase());
}

// Determine which tickers to run
const tickers = requestedTickers
  ? requestedTickers.filter(t => allTickers.includes(t))
  : allTickers;

// Warn about tickers not in the S&P 500 list
if (requestedTickers) {
  for (const t of requestedTickers) {
    if (!allTickers.includes(t)) {
      process.stderr.write(`WARNING: ${t} not in S&P 500 list, skipping.\n`);
    }
  }
}

// ─── Run Comparison Pipeline ───────────────────────────────

process.stderr.write(`\nComparing ${tickers.length} companies (FMP vs XBRL engine)...\n\n`);

const allResults = [];
let engineErrors = 0;
const FMP_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

for (let i = 0; i < tickers.length; i++) {
  const ticker = tickers[i];

  // Read FMP cache -- don't re-fetch during comparison
  const fmpCache = readCache(FMP_CACHE_DIR, `${ticker}-fmp`);
  if (!fmpCache) {
    allResults.push({ ticker, status: 'NO_DATA', yearsCompared: 0, results: [] });
    process.stderr.write(`${ticker.padEnd(8)} [${i + 1}/${tickers.length}]  NO FMP CACHE\n`);
    continue;
  }

  // Clear localStorage between tickers to prevent cross-contamination
  globalThis.localStorage._data = {};

  try {
    const engineData = await fetchEdgarStatements(ticker, { version: 'restated' });

    if (!engineData) {
      allResults.push({ ticker, status: 'ENGINE_ERROR', yearsCompared: 0, results: [] });
      process.stderr.write(`${ticker.padEnd(8)} [${i + 1}/${tickers.length}]  ENGINE_ERROR (no data)\n`);
      engineErrors++;
      await sleep(300);
      continue;
    }

    // Compare FMP vs engine
    const companyResult = compareFmpToEngine(ticker, fmpCache.data, engineData);
    allResults.push(companyResult);

    // Progress to stderr
    const tally = tallyTieredResults(companyResult.results);
    const tier1Pct = tally.tier1.compared > 0 ? tally.tier1.accuracy.toFixed(1) : '-';
    const overallPct = tally.overall.compared > 0 ? tally.overall.accuracy.toFixed(1) : '-';
    process.stderr.write(
      `${ticker.padEnd(8)} [${i + 1}/${tickers.length}]  Tier1: ${tier1Pct}%  Overall: ${overallPct}%  (${companyResult.yearsCompared} years)\n`
    );

    // Rate limit for SEC API
    await sleep(100);
  } catch (err) {
    allResults.push({ ticker, status: 'ENGINE_ERROR', yearsCompared: 0, results: [] });
    process.stderr.write(`${ticker.padEnd(8)} [${i + 1}/${tickers.length}]  ERROR: ${err.message}\n`);
    engineErrors++;
    await sleep(300);
  }
}

// ─── Generate Reports ──────────────────────────────────────

// Console report to stdout
const consoleReport = generateSP500ConsoleReport(allResults, { showAll });
process.stdout.write(consoleReport + '\n');
process.stdout.write(`EDGAR API: ${requestCount} live requests, ${cacheHits} cache hits\n`);

// JSON report to file
fs.mkdirSync(REPORTS_DIR, { recursive: true });
const jsonReport = generateSP500JsonReport(allResults);
const jsonPath = path.resolve(REPORTS_DIR, 'sp500-fmp-accuracy.json');
fs.writeFileSync(jsonPath, JSON.stringify(jsonReport, null, 2));
process.stderr.write(`\nJSON report written to: ${jsonPath}\n`);

// Exit code
process.exit(0);
