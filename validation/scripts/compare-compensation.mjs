#!/usr/bin/env node
/**
 * compare-compensation.mjs — FMP compensation comparison orchestrator
 *
 * Compares FMP executive compensation data against our engine's SEC proxy
 * compensation extraction. Validates COMP-02.
 *
 * Usage:
 *   node validation/scripts/compare-compensation.mjs --ticker AAPL        # single ticker
 *   node validation/scripts/compare-compensation.mjs --ticker AAPL,MSFT   # multiple
 *   node validation/scripts/compare-compensation.mjs                      # all truth set
 *   node validation/scripts/compare-compensation.mjs --fetch              # fetch FMP data first
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const TICKER_LIST_PATH = path.resolve(ROOT, 'validation/data/sp500-tickers.json');
const FMP_COMP_CACHE_DIR = path.resolve(ROOT, 'validation/cache/fmp-comp');
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

// ─── DOMParser Polyfill (compensation.js needs it for HTML proxy parsing) ───

const { JSDOM } = await import('jsdom');
const jsdomInstance = new JSDOM();
globalThis.DOMParser = jsdomInstance.window.DOMParser;

// ─── SEC Fetch Interceptor ──────────────────────────────────

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

  // Also check for HTML cache (proxy filings are HTML, not JSON)
  const htmlCachePath = path.join(EDGAR_CACHE_DIR, cacheKey + '.html');
  if (fs.existsSync(htmlCachePath)) {
    cacheHits++;
    const data = fs.readFileSync(htmlCachePath, 'utf-8');
    return new Response(data, {
      status: 200,
      headers: { 'content-type': 'text/html' },
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
    // Cache as JSON or HTML based on content type
    const ct = resp.headers.get('content-type') || '';
    const ext = ct.includes('html') ? '.html' : '.json';
    fs.writeFileSync(path.join(EDGAR_CACHE_DIR, cacheKey + ext), text);
    return new Response(text, {
      status: resp.status,
      headers: { 'content-type': ct || 'application/json' },
    });
  }

  return resp;
};

// ─── Pre-flight Checks ─────────────────────────────────────

if (!fs.existsSync(BUNDLE_PATH)) {
  process.stderr.write('Engine bundle not found. Building...\n');
  execSync('node validation/scripts/bundle.mjs', { cwd: ROOT, stdio: 'inherit' });
}

// ─── Load Dependencies ─────────────────────────────────────

import { fetchFmpCompensation } from './lib/fmp-comp-collector.mjs';
import { compareCompensation } from './lib/comp-comparator.mjs';

const { fetchCompensation, cacheClear } = await import(BUNDLE_PATH);

// ─── Read API Key ──────────────────────────────────────────

const envPath = path.resolve(ROOT, '.env.local');
const envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : '';
const fmpKeyMatch = envContent.match(/VITE_FMP_KEY=(.+)/);
const FMP_KEY = fmpKeyMatch ? fmpKeyMatch[1].trim() : null;

if (!FMP_KEY) {
  process.stderr.write('ERROR: VITE_FMP_KEY not found in .env.local\n');
  process.exit(1);
}

// ─── Parse CLI Args ────────────────────────────────────────

const args = process.argv.slice(2);
const doFetch = args.includes('--fetch');
const tickerIdx = args.indexOf('--ticker');
let requestedTickers = null;
if (tickerIdx !== -1 && args[tickerIdx + 1]) {
  requestedTickers = args[tickerIdx + 1].split(',').map(t => t.toUpperCase());
}

// Default to 50-company truth set if no tickers specified
let tickers;
if (requestedTickers) {
  tickers = requestedTickers;
} else if (fs.existsSync(TICKER_LIST_PATH)) {
  const tickerData = JSON.parse(fs.readFileSync(TICKER_LIST_PATH, 'utf-8'));
  // Use first 50 (truth set) or all if --all specified
  tickers = args.includes('--all') ? tickerData.tickers : tickerData.tickers.slice(0, 50);
} else {
  process.stderr.write('ERROR: No tickers specified and no ticker list found.\n');
  process.exit(1);
}

// ─── FMP Data Fetch (optional) ─────────────────────────────

if (doFetch) {
  fs.mkdirSync(FMP_COMP_CACHE_DIR, { recursive: true });
  process.stderr.write(`Fetching FMP compensation data for ${tickers.length} tickers...\n`);

  let fetched = 0, cached = 0, failed = 0;
  for (let i = 0; i < tickers.length; i++) {
    const ticker = tickers[i];
    const result = await fetchFmpCompensation(ticker, {
      apiKey: FMP_KEY,
      cacheDir: FMP_COMP_CACHE_DIR,
      cacheTtlMs: 7 * 24 * 60 * 60 * 1000,
    });

    if (result) fetched++;
    else failed++;

    if ((i + 1) % 10 === 0) {
      process.stderr.write(`  [${i + 1}/${tickers.length}] fetched: ${fetched}, failed: ${failed}\n`);
    }

    await new Promise(r => setTimeout(r, 200));
  }

  process.stderr.write(`FMP fetch complete: ${fetched} fetched, ${failed} failed\n\n`);
}

// ─── Run Comparison Pipeline ───────────────────────────────

process.stderr.write(`\nComparing compensation for ${tickers.length} companies (FMP vs engine)...\n\n`);

const allResults = [];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

for (let i = 0; i < tickers.length; i++) {
  const ticker = tickers[i];

  // Clear caches between tickers
  globalThis.localStorage._data = {};
  cacheClear('comp');

  // Read FMP comp cache
  const fmpRecords = await fetchFmpCompensation(ticker, {
    apiKey: FMP_KEY,
    cacheDir: FMP_COMP_CACHE_DIR,
    cacheTtlMs: 7 * 24 * 60 * 60 * 1000,
  });

  if (!fmpRecords || fmpRecords.length === 0) {
    allResults.push({ ticker, status: 'NO_FMP_DATA', matched: 0, missing: 0, extra: 0, execMatches: [], fieldResults: [] });
    process.stderr.write(`${ticker.padEnd(8)} [${i + 1}/${tickers.length}]  NO FMP DATA\n`);
    continue;
  }

  try {
    const engineData = await fetchCompensation(ticker);

    if (!engineData || !engineData.executives || engineData.executives.length === 0) {
      allResults.push({ ticker, status: 'NO_ENGINE_DATA', matched: 0, missing: fmpRecords.length, extra: 0, execMatches: [], fieldResults: [] });
      process.stderr.write(`${ticker.padEnd(8)} [${i + 1}/${tickers.length}]  NO ENGINE DATA\n`);
      await sleep(300);
      continue;
    }

    const result = compareCompensation(ticker, fmpRecords, engineData);
    allResults.push(result);

    // Progress
    const matchCount = result.fieldResults.filter(r => r.status === 'MATCH').length;
    const totalFields = result.fieldResults.filter(r => r.status === 'MATCH' || r.status === 'DIFF').length;
    const pct = totalFields > 0 ? ((matchCount / totalFields) * 100).toFixed(1) : '-';
    process.stderr.write(
      `${ticker.padEnd(8)} [${i + 1}/${tickers.length}]  execs: ${result.matched}/${result.matched + result.missing} matched  fields: ${pct}%  (${matchCount}/${totalFields})\n`
    );

    await sleep(100);
  } catch (err) {
    allResults.push({ ticker, status: 'ENGINE_ERROR', matched: 0, missing: 0, extra: 0, execMatches: [], fieldResults: [] });
    process.stderr.write(`${ticker.padEnd(8)} [${i + 1}/${tickers.length}]  ERROR: ${err.message}\n`);
    await sleep(300);
  }
}

// ─── Console Report ────────────────────────────────────────

const okResults = allResults.filter(r => r.status === 'OK');
let totalMatch = 0, totalDiff = 0, totalMissing = 0;

for (const r of okResults) {
  for (const fr of r.fieldResults) {
    if (fr.status === 'MATCH') totalMatch++;
    else if (fr.status === 'DIFF') totalDiff++;
    else if (fr.status === 'MISSING_ENGINE' || fr.status === 'MISSING_YEAR') totalMissing++;
  }
}

const totalCompared = totalMatch + totalDiff;
const overallAccuracy = totalCompared > 0 ? ((totalMatch / totalCompared) * 100).toFixed(1) : '0.0';

const totalExecMatched = okResults.reduce((s, r) => s + r.matched, 0);
const totalExecMissing = okResults.reduce((s, r) => s + r.missing, 0);

const lines = [];
lines.push('');
lines.push('COMPENSATION COMPARISON REPORT (FMP vs Engine)');
lines.push('='.repeat(60));
lines.push(`Companies: ${tickers.length} | Compared: ${okResults.length} | No FMP: ${allResults.filter(r => r.status === 'NO_FMP_DATA').length} | No Engine: ${allResults.filter(r => r.status === 'NO_ENGINE_DATA').length} | Errors: ${allResults.filter(r => r.status === 'ENGINE_ERROR').length}`);
lines.push('');
lines.push('EXECUTIVE MATCHING');
lines.push(`  Matched: ${totalExecMatched} | Missing: ${totalExecMissing} | Match rate: ${totalExecMatched + totalExecMissing > 0 ? ((totalExecMatched / (totalExecMatched + totalExecMissing)) * 100).toFixed(1) : '0'}%`);
lines.push('');
lines.push('FIELD ACCURACY (matched executives only)');
lines.push(`  Match: ${totalMatch} / ${totalCompared} (${overallAccuracy}%)`);
lines.push(`  Diff: ${totalDiff} | Missing in engine: ${totalMissing}`);

// Per-field breakdown
const byField = {};
for (const r of okResults) {
  for (const fr of r.fieldResults) {
    if (!byField[fr.field]) byField[fr.field] = { match: 0, diff: 0, missing: 0 };
    if (fr.status === 'MATCH') byField[fr.field].match++;
    else if (fr.status === 'DIFF') byField[fr.field].diff++;
    else byField[fr.field].missing++;
  }
}

if (Object.keys(byField).length > 0) {
  lines.push('');
  lines.push('PER-FIELD BREAKDOWN');
  lines.push(`  ${'Field'.padEnd(20)} ${'Match'.padStart(6)} ${'Diff'.padStart(6)} ${'Miss'.padStart(6)} ${'Accuracy'.padStart(10)}`);
  lines.push(`  ${'─'.repeat(20)} ${'─'.repeat(6)} ${'─'.repeat(6)} ${'─'.repeat(6)} ${'─'.repeat(10)}`);
  for (const [field, counts] of Object.entries(byField).sort((a, b) => a[0].localeCompare(b[0]))) {
    const compared = counts.match + counts.diff;
    const acc = compared > 0 ? ((counts.match / compared) * 100).toFixed(1) + '%' : '-';
    lines.push(`  ${field.padEnd(20)} ${String(counts.match).padStart(6)} ${String(counts.diff).padStart(6)} ${String(counts.missing).padStart(6)} ${acc.padStart(10)}`);
  }
}

// Worst companies
const worst = [...okResults]
  .filter(r => r.fieldResults.length > 0)
  .map(r => {
    const m = r.fieldResults.filter(f => f.status === 'MATCH').length;
    const c = r.fieldResults.filter(f => f.status === 'MATCH' || f.status === 'DIFF').length;
    return { ticker: r.ticker, accuracy: c > 0 ? (m / c) * 100 : 0, matched: r.matched, missing: r.missing };
  })
  .sort((a, b) => a.accuracy - b.accuracy)
  .slice(0, 10);

if (worst.length > 0) {
  lines.push('');
  lines.push('LOWEST ACCURACY COMPANIES');
  lines.push(`  ${'Ticker'.padEnd(8)} ${'Accuracy'.padStart(10)} ${'Execs'.padStart(8)}`);
  for (const w of worst) {
    lines.push(`  ${w.ticker.padEnd(8)} ${w.accuracy.toFixed(1).padStart(9)}% ${`${w.matched}/${w.matched + w.missing}`.padStart(8)}`);
  }
}

lines.push('');
process.stdout.write(lines.join('\n') + '\n');
process.stdout.write(`SEC API: ${requestCount} live requests, ${cacheHits} cache hits\n`);

// ─── JSON Report ───────────────────────────────────────────

const jsonReport = {
  timestamp: new Date().toISOString(),
  summary: {
    totalCompanies: tickers.length,
    compared: okResults.length,
    execMatchRate: totalExecMatched + totalExecMissing > 0
      ? parseFloat(((totalExecMatched / (totalExecMatched + totalExecMissing)) * 100).toFixed(1))
      : 0,
    fieldAccuracy: parseFloat(overallAccuracy),
    totalMatch,
    totalDiff,
    totalMissing,
  },
  companies: allResults,
};

fs.mkdirSync(REPORTS_DIR, { recursive: true });
const jsonPath = path.resolve(REPORTS_DIR, 'comp-accuracy.json');
fs.writeFileSync(jsonPath, JSON.stringify(jsonReport, null, 2));
process.stderr.write(`\nJSON report written to: ${jsonPath}\n`);

process.exit(0);
