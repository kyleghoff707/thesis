#!/usr/bin/env node
/**
 * fetch-sp500-fmp.mjs -- Batch FMP data fetcher for S&P 500 companies
 *
 * Scrapes the S&P 500 ticker list from Wikipedia, caches it locally,
 * then fetches FMP financial data for each ticker via fmp-collector.mjs.
 *
 * Usage:
 *   node validation/scripts/fetch-sp500-fmp.mjs
 *
 * Produces:
 *   validation/data/sp500-tickers.json  (cached ticker list)
 *   validation/cache/fmp/{TICKER}-fmp.json  (per-ticker FMP cache)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as cheerio from 'cheerio';
import { fetchFmpData } from './lib/fmp-collector.mjs';
import { readCache, isExpired } from './lib/disk-cache.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const TICKER_CACHE_PATH = path.resolve(ROOT, 'validation/data/sp500-tickers.json');
const FMP_CACHE_DIR = path.resolve(ROOT, 'validation/cache/fmp');
const FIELD_MAPPING_PATH = path.resolve(ROOT, 'src/engines/__tests__/fixtures/morningstar/field-mapping.json');
const ENV_PATH = path.resolve(ROOT, '.env.local');

const TICKER_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const FMP_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ─── Load API Key ────────────────────────────────────────────

function loadFmpKey() {
  try {
    const envContent = fs.readFileSync(ENV_PATH, 'utf-8');
    const match = envContent.match(/^VITE_FMP_KEY=(.+)$/m);
    if (match) return match[1].trim();
  } catch {
    // fall through
  }
  process.stderr.write('ERROR: VITE_FMP_KEY not found in .env.local\n');
  process.exit(1);
}

// ─── Fetch S&P 500 Ticker List ──────────────────────────────

async function fetchSP500Tickers() {
  // Check cached ticker list
  if (fs.existsSync(TICKER_CACHE_PATH)) {
    try {
      const cached = JSON.parse(fs.readFileSync(TICKER_CACHE_PATH, 'utf-8'));
      const age = Date.now() - new Date(cached._fetchedAt).getTime();
      if (age < TICKER_TTL_MS && cached.tickers && cached.tickers.length > 0) {
        process.stderr.write(`Using cached ticker list (${cached.tickers.length} tickers, ${(age / 86400000).toFixed(1)} days old)\n`);
        return cached.tickers;
      }
    } catch {
      // corrupted cache, re-fetch
    }
  }

  process.stderr.write('Fetching S&P 500 constituents from Wikipedia...\n');

  const res = await fetch('https://en.wikipedia.org/wiki/List_of_S%26P_500_companies');
  if (!res.ok) {
    process.stderr.write(`ERROR: Wikipedia fetch failed (${res.status})\n`);
    process.exit(1);
  }

  const html = await res.text();
  const $ = cheerio.load(html);
  const tickers = [];

  // First table on the page is the constituents table
  const table = $('table.wikitable').first();
  table.find('tbody tr').each((i, row) => {
    const cells = $(row).find('td');
    if (cells.length === 0) return; // skip header

    const ticker = $(cells[0]).text().trim().replace('.', '-'); // BRK.B -> BRK-B for EDGAR
    if (ticker) {
      tickers.push(ticker);
    }
  });

  process.stderr.write(`  Found ${tickers.length} companies from Wikipedia\n`);

  // Cache ticker list
  fs.mkdirSync(path.dirname(TICKER_CACHE_PATH), { recursive: true });
  fs.writeFileSync(TICKER_CACHE_PATH, JSON.stringify({
    _fetchedAt: new Date().toISOString(),
    tickers,
  }, null, 2));

  return tickers;
}

// ─── Main ───────────────────────────────────────────────────

async function main() {
  const apiKey = loadFmpKey();
  const tickers = await fetchSP500Tickers();

  process.stderr.write(`\nFetching FMP data for ${tickers.length} companies...\n\n`);

  let fetched = 0;
  let cached = 0;
  let failed = 0;

  for (let i = 0; i < tickers.length; i++) {
    const ticker = tickers[i];

    // Check if already cached
    const existingCache = readCache(FMP_CACHE_DIR, `${ticker}-fmp`);
    if (existingCache && !isExpired(existingCache, FMP_TTL_MS)) {
      cached++;
      // Progress every 25 tickers
      if ((i + 1) % 25 === 0) {
        process.stderr.write(`[${i + 1}/${tickers.length}] fetched: ${fetched}, cached: ${cached}, failed: ${failed}\n`);
      }
      continue;
    }

    // Fetch from FMP
    const result = await fetchFmpData(ticker, {
      apiKey,
      cacheDir: FMP_CACHE_DIR,
      cacheTtlMs: FMP_TTL_MS,
      fieldMappingPath: FIELD_MAPPING_PATH,
    });

    if (result) {
      fetched++;
    } else {
      failed++;
      process.stderr.write(`  FAILED: ${ticker}\n`);
    }

    // Progress every 25 tickers
    if ((i + 1) % 25 === 0) {
      process.stderr.write(`[${i + 1}/${tickers.length}] fetched: ${fetched}, cached: ${cached}, failed: ${failed}\n`);
    }

    // Rate limit: 200ms between tickers
    await new Promise(r => setTimeout(r, 200));
  }

  process.stderr.write(`\nFetch complete: ${fetched} fetched, ${cached} cached (reused), ${failed} failed out of ${tickers.length}\n`);

  // Exit code: 0 if fewer than 10 failures
  process.exit(failed < 10 ? 0 : 1);
}

main().catch(err => {
  process.stderr.write(`FATAL: ${err.message}\n`);
  process.exit(1);
});
