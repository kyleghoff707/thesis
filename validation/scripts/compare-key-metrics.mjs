#!/usr/bin/env node
/**
 * compare-key-metrics.mjs -- Compare FMP pre-computed metrics against our keyMetrics.js
 *
 * Orchestrator for key metrics validation across S&P 100. Loads EDGAR data via
 * the engine bundle, computes key metrics, compares against FMP cached metrics.
 *
 * Usage:
 *   node validation/scripts/compare-key-metrics.mjs                     # full S&P 100
 *   node validation/scripts/compare-key-metrics.mjs --ticker AAPL       # single ticker
 *   node validation/scripts/compare-key-metrics.mjs --ticker AAPL,MSFT  # multiple tickers
 *   node validation/scripts/compare-key-metrics.mjs --show-all          # show all companies
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { readCache } from './lib/disk-cache.mjs';
import { compareKeyMetrics, METRICS_MAP } from './lib/key-metrics-comparator.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const FMP_METRICS_CACHE = path.resolve(ROOT, 'validation/cache/fmp-metrics');
const EDGAR_CACHE_DIR = path.resolve(ROOT, 'validation/cache/edgar-sp500');
const BUNDLE_PATH = path.resolve(__dirname, 'bundled-engines.mjs');
const REPORTS_DIR = path.resolve(ROOT, 'validation/reports');

// S&P 100 tickers (same list as fetch-sp100-fmp-metrics.mjs)
const SP100_TICKERS = [
  'AAPL', 'ABBV', 'ABT', 'ACN', 'ADBE', 'AIG', 'AMD', 'AMGN', 'AMT', 'AMZN',
  'AVGO', 'AXP', 'BA', 'BAC', 'BK', 'BKNG', 'BLK', 'BMY', 'BRK-B', 'C',
  'CAT', 'CHTR', 'CL', 'CMCSA', 'COF', 'COP', 'COST', 'CRM', 'CSCO', 'CVS',
  'CVX', 'DE', 'DHR', 'DIS', 'DOW', 'DUK', 'EMR', 'EXC', 'F', 'FDX',
  'GD', 'GE', 'GILD', 'GM', 'GOOG', 'GOOGL', 'GS', 'HD', 'HON', 'IBM',
  'INTC', 'INTU', 'JNJ', 'JPM', 'KHC', 'KO', 'LIN', 'LLY', 'LMT', 'LOW',
  'MA', 'MCD', 'MDLZ', 'MDT', 'MET', 'META', 'MMM', 'MO', 'MRK', 'MS',
  'MSFT', 'NEE', 'NFLX', 'NKE', 'NVDA', 'ORCL', 'PEP', 'PFE', 'PG', 'PM',
  'PYPL', 'QCOM', 'RTX', 'SBUX', 'SCHW', 'SO', 'SPG', 'T', 'TGT', 'TMO',
  'TMUS', 'TSLA', 'TXN', 'UNH', 'UNP', 'UPS', 'USB', 'V', 'VZ', 'WFC',
  'WMT', 'XOM',
];

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

const SEC_HEADERS = {
  'User-Agent': 'StockAnalyzer/1.0 kylehoff@example.com',
  'Accept-Encoding': 'identity',
};

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
    const data = fs.readFileSync(cachePath, 'utf-8');
    return new Response(data, { status: 200, headers: { 'content-type': 'application/json' } });
  }

  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < 100) await new Promise(r => setTimeout(r, 100 - elapsed));
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

// ─── Pre-flight ─────────────────────────────────────────────

if (!fs.existsSync(BUNDLE_PATH)) {
  process.stderr.write('Engine bundle not found. Building...\n');
  execSync('node validation/scripts/bundle.mjs', { cwd: ROOT, stdio: 'inherit' });
}

const { fetchEdgarStatements, computeKeyMetrics } = await import(BUNDLE_PATH);

// ─── CLI Args ───────────────────────────────────────────────

const args = process.argv.slice(2);
const tickerIdx = args.indexOf('--ticker');
const showAll = args.includes('--show-all');
let tickers = SP100_TICKERS;
if (tickerIdx !== -1 && args[tickerIdx + 1]) {
  tickers = args[tickerIdx + 1].split(',').map(t => t.trim().toUpperCase());
}

// ─── Main ───────────────────────────────────────────────────

process.stderr.write(`Comparing key metrics for ${tickers.length} tickers\n\n`);

const allResults = [];
let errors = 0;

for (let i = 0; i < tickers.length; i++) {
  const ticker = tickers[i];
  process.stderr.write(`[${i + 1}/${tickers.length}] ${ticker}...`);

  // Load FMP metrics from cache
  const fmpCached = readCache(FMP_METRICS_CACHE, `${ticker}-fmp-metrics`);
  if (!fmpCached) {
    process.stderr.write(' NO FMP CACHE\n');
    errors++;
    continue;
  }

  // Fetch EDGAR statements via engine bundle
  let edgarData;
  try {
    edgarData = await fetchEdgarStatements(ticker);
  } catch (err) {
    process.stderr.write(` EDGAR ERROR: ${err.message}\n`);
    errors++;
    continue;
  }
  if (!edgarData) {
    process.stderr.write(' NO EDGAR DATA\n');
    errors++;
    continue;
  }

  // Compute our key metrics
  const ourMetrics = computeKeyMetrics(edgarData);
  if (!ourMetrics) {
    process.stderr.write(' NO METRICS\n');
    errors++;
    continue;
  }

  // Compare
  const result = compareKeyMetrics(ticker, fmpCached.data, ourMetrics);
  allResults.push(result);

  const { match, diff, skip } = result.summary;
  const acc = result.summary.accuracy;
  process.stderr.write(` ✓${match} ✗${diff} ~${skip} ${acc != null ? `(${acc.toFixed(1)}%)` : ''}\n`);

  // Rate limit
  await new Promise(r => setTimeout(r, 100));
}

// ─── Report ─────────────────────────────────────────────────

const totalComparisons = allResults.reduce((s, r) => s + r.summary.match + r.summary.diff, 0);
const totalMatch = allResults.reduce((s, r) => s + r.summary.match, 0);
const totalDiff = allResults.reduce((s, r) => s + r.summary.diff, 0);
const totalSkip = allResults.reduce((s, r) => s + r.summary.skip, 0);
const overallAccuracy = totalComparisons > 0 ? (totalMatch / totalComparisons * 100) : 0;

console.log(`\n${'='.repeat(70)}`);
console.log(`KEY METRICS VALIDATION REPORT — S&P 100`);
console.log(`${'='.repeat(70)}`);
console.log(`Companies: ${allResults.length}  Errors: ${errors}`);
console.log(`Comparisons: ${totalComparisons}  Match: ${totalMatch}  Diff: ${totalDiff}  Skip: ${totalSkip}`);
console.log(`\nOVERALL ACCURACY: ${overallAccuracy.toFixed(1)}%\n`);

// Per-tier accuracy
const tierStats = {};
for (const result of allResults) {
  for (const comp of result.comparisons) {
    if (comp.status === 'SKIP') continue;
    if (!tierStats[comp.tier]) tierStats[comp.tier] = { match: 0, diff: 0 };
    if (comp.status === 'MATCH') tierStats[comp.tier].match++;
    else tierStats[comp.tier].diff++;
  }
}

console.log(`${'─'.repeat(50)}`);
console.log(`PER-CATEGORY ACCURACY:`);
console.log(`${'─'.repeat(50)}`);
console.log(`${'Category'.padEnd(20)} ${'Match'.padStart(6)} ${'Diff'.padStart(6)} ${'Total'.padStart(6)} ${'Acc%'.padStart(8)}`);
for (const [tier, stats] of Object.entries(tierStats).sort((a, b) => {
  const accA = a[1].match / (a[1].match + a[1].diff);
  const accB = b[1].match / (b[1].match + b[1].diff);
  return accB - accA;
})) {
  const total = stats.match + stats.diff;
  const acc = (stats.match / total * 100).toFixed(1);
  console.log(`  ${tier.padEnd(18)} ${String(stats.match).padStart(6)} ${String(stats.diff).padStart(6)} ${String(total).padStart(6)} ${(acc + '%').padStart(8)}`);
}

// Per-field accuracy
const fieldStats = {};
for (const result of allResults) {
  for (const comp of result.comparisons) {
    if (comp.status === 'SKIP') continue;
    const key = comp.ourField;
    if (!fieldStats[key]) fieldStats[key] = { match: 0, diff: 0, diffs: [] };
    if (comp.status === 'MATCH') fieldStats[key].match++;
    else {
      fieldStats[key].diff++;
      fieldStats[key].diffs.push({ ticker: result.ticker, year: comp.year, pct: comp.pctDiff, fmp: comp.fmpValue, engine: comp.engineValue });
    }
  }
}

console.log(`\n${'─'.repeat(70)}`);
console.log(`PER-FIELD ACCURACY:`);
console.log(`${'─'.repeat(70)}`);
console.log(`${'Field'.padEnd(28)} ${'Match'.padStart(6)} ${'Diff'.padStart(6)} ${'Total'.padStart(6)} ${'Acc%'.padStart(8)} ${'AvgDiff'.padStart(10)}`);
for (const [field, stats] of Object.entries(fieldStats).sort((a, b) => {
  const accA = a[1].match / (a[1].match + a[1].diff);
  const accB = b[1].match / (b[1].match + b[1].diff);
  return accA - accB; // worst first
})) {
  const total = stats.match + stats.diff;
  const acc = (stats.match / total * 100).toFixed(1);
  const avgDiff = stats.diffs.length > 0
    ? (stats.diffs.reduce((s, d) => s + d.pct, 0) / stats.diffs.length * 100).toFixed(1) + '%'
    : '—';
  console.log(`  ${field.padEnd(26)} ${String(stats.match).padStart(6)} ${String(stats.diff).padStart(6)} ${String(total).padStart(6)} ${(acc + '%').padStart(8)} ${avgDiff.padStart(10)}`);
}

// Worst companies
if (!showAll) {
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`WORST 10 COMPANIES:`);
  console.log(`${'─'.repeat(50)}`);
} else {
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`ALL COMPANIES:`);
  console.log(`${'─'.repeat(50)}`);
}
const sorted = [...allResults].sort((a, b) => (a.summary.accuracy ?? 0) - (b.summary.accuracy ?? 0));
const toShow = showAll ? sorted : sorted.slice(0, 10);
console.log(`${'Ticker'.padEnd(10)} ${'Match'.padStart(6)} ${'Diff'.padStart(6)} ${'Skip'.padStart(6)} ${'Acc%'.padStart(8)}`);
for (const r of toShow) {
  const acc = r.summary.accuracy != null ? r.summary.accuracy.toFixed(1) + '%' : '—';
  console.log(`  ${r.ticker.padEnd(8)} ${String(r.summary.match).padStart(6)} ${String(r.summary.diff).padStart(6)} ${String(r.summary.skip).padStart(6)} ${acc.padStart(8)}`);
}

// Single-ticker detail view
if (tickers.length <= 3) {
  for (const result of allResults) {
    console.log(`\n${'─'.repeat(70)}`);
    console.log(`DETAIL: ${result.ticker}`);
    console.log(`${'─'.repeat(70)}`);
    console.log(`${'Field'.padEnd(24)} ${'Year'.padStart(5)} ${'FMP'.padStart(12)} ${'Engine'.padStart(12)} ${'Diff%'.padStart(8)} ${'Status'.padStart(8)}`);
    for (const comp of result.comparisons.sort((a, b) => a.ourField.localeCompare(b.ourField) || a.year - b.year)) {
      const fmpStr = comp.fmpValue != null ? comp.fmpValue.toFixed(4) : 'null';
      const engStr = comp.engineValue != null ? comp.engineValue.toFixed(4) : 'null';
      const diffStr = comp.pctDiff != null ? (comp.pctDiff * 100).toFixed(1) + '%' : '—';
      console.log(`  ${comp.ourField.padEnd(22)} ${String(comp.year).padStart(5)} ${fmpStr.padStart(12)} ${engStr.padStart(12)} ${diffStr.padStart(8)} ${comp.status.padStart(8)}`);
    }
  }
}

// Save JSON report
fs.mkdirSync(REPORTS_DIR, { recursive: true });
const report = {
  generatedAt: new Date().toISOString(),
  companies: allResults.length,
  errors,
  overallAccuracy: overallAccuracy.toFixed(1) + '%',
  summary: { totalComparisons, totalMatch, totalDiff, totalSkip },
  perCategory: tierStats,
  perField: Object.fromEntries(
    Object.entries(fieldStats).map(([k, v]) => [k, { match: v.match, diff: v.diff, accuracy: (v.match / (v.match + v.diff) * 100).toFixed(1) + '%' }])
  ),
  perCompany: allResults.map(r => ({ ticker: r.ticker, ...r.summary })),
};
const reportPath = path.join(REPORTS_DIR, 'key-metrics-accuracy.json');
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
process.stderr.write(`\nReport saved: ${reportPath}\n`);
