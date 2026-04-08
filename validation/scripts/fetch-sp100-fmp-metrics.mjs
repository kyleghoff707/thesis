#!/usr/bin/env node
/**
 * fetch-sp100-fmp-metrics.mjs -- Fetch FMP key-metrics + financial-ratios for S&P 100
 *
 * Fetches pre-computed metrics/ratios from FMP's Stable API for the S&P 100 (OEX)
 * companies, caching results to disk. Used as truth set for validating keyMetrics.js.
 *
 * Usage:
 *   node validation/scripts/fetch-sp100-fmp-metrics.mjs
 *   node validation/scripts/fetch-sp100-fmp-metrics.mjs --ticker AAPL       # single ticker
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { readCache, writeCache, isExpired } from './lib/disk-cache.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const ENV_PATH = path.resolve(ROOT, '.env.local');
const CACHE_DIR = path.resolve(ROOT, 'validation/cache/fmp-metrics');

const FMP_BASE = 'https://financialmodelingprep.com/stable';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// S&P 100 (OEX) constituents — stable list, rarely changes
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

// ─── Load API Key ────────────────────────────────────────────

function loadFmpKey() {
  try {
    const envContent = fs.readFileSync(ENV_PATH, 'utf-8');
    const match = envContent.match(/^VITE_FMP_KEY=(.+)$/m);
    if (match) return match[1].trim();
  } catch { /* fall through */ }
  process.stderr.write('ERROR: VITE_FMP_KEY not found in .env.local\n');
  process.exit(1);
}

// ─── Fetch Metrics for One Ticker ────────────────────────────

async function fetchFmpMetrics(ticker, apiKey) {
  const endpoints = [
    { url: `${FMP_BASE}/key-metrics?symbol=${ticker}&period=annual&apikey=${apiKey}`, type: 'keyMetrics' },
    { url: `${FMP_BASE}/ratios?symbol=${ticker}&period=annual&apikey=${apiKey}`, type: 'ratios' },
  ];

  const result = { keyMetrics: {}, ratios: {} };

  for (const { url, type } of endpoints) {
    const res = await fetch(url);
    if (!res.ok) {
      process.stderr.write(`  ${type} HTTP ${res.status}\n`);
      return null;
    }
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) {
      process.stderr.write(`  ${type}: empty response\n`);
      return null;
    }

    // Log sample response on first fetch for field name verification
    if (ticker === (parsedTickers[0] || SP100_TICKERS[0]) && type === 'keyMetrics') {
      const sampleFields = Object.keys(data[0]).sort().join(', ');
      process.stderr.write(`\n  SAMPLE key-metrics fields: ${sampleFields}\n`);
    }
    if (ticker === (parsedTickers[0] || SP100_TICKERS[0]) && type === 'ratios') {
      const sampleFields = Object.keys(data[0]).sort().join(', ');
      process.stderr.write(`  SAMPLE metrics-ratios fields: ${sampleFields}\n\n`);
    }

    // Normalize: key by fiscal year
    for (const row of data) {
      const year = String(row.calendarYear ?? row.fiscalYear ?? row.date?.slice(0, 4));
      if (!year || year === 'undefined') continue;
      result[type][year] = {};
      for (const [key, val] of Object.entries(row)) {
        if (key === 'date' || key === 'symbol' || key === 'period' || key === 'calendarYear' || key === 'fiscalYear') continue;
        result[type][year][key] = val;
      }
    }
  }

  return result;
}

// ─── CLI Args ────────────────────────────────────────────────

const args = process.argv.slice(2);
const tickerIdx = args.indexOf('--ticker');
let parsedTickers = SP100_TICKERS;
if (tickerIdx !== -1 && args[tickerIdx + 1]) {
  parsedTickers = args[tickerIdx + 1].split(',').map(t => t.trim().toUpperCase());
}

// ─── Main ────────────────────────────────────────────────────

const apiKey = loadFmpKey();
process.stderr.write(`Fetching FMP key-metrics + ratios for ${parsedTickers.length} tickers\n`);
process.stderr.write(`Cache: ${CACHE_DIR}\n\n`);

let fetched = 0;
let cached = 0;
let failed = 0;

for (let i = 0; i < parsedTickers.length; i++) {
  const ticker = parsedTickers[i];

  // Check cache
  const cacheKey = `${ticker}-fmp-metrics`;
  const existing = readCache(CACHE_DIR, cacheKey);
  if (existing && !isExpired(existing, CACHE_TTL_MS)) {
    cached++;
    if (i % 20 === 0) process.stderr.write(`[${i + 1}/${parsedTickers.length}] ${ticker} (cached)\n`);
    continue;
  }

  process.stderr.write(`[${i + 1}/${parsedTickers.length}] ${ticker}...`);

  const data = await fetchFmpMetrics(ticker, apiKey);
  if (data) {
    writeCache(CACHE_DIR, cacheKey, data);
    const kmYears = Object.keys(data.keyMetrics).length;
    const ratioYears = Object.keys(data.ratios).length;
    process.stderr.write(` ${kmYears} KM years, ${ratioYears} ratio years\n`);
    fetched++;
  } else {
    process.stderr.write(` FAILED\n`);
    failed++;
  }

  // Rate limit: 200ms between requests
  await new Promise(r => setTimeout(r, 200));
}

process.stderr.write(`\nDone: ${fetched} fetched, ${cached} cached, ${failed} failed\n`);
