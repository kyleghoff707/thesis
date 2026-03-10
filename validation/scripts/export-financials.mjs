#!/usr/bin/env node
// Export Thes1s EDGAR financial data as JSON for validation.
// Usage: node validation/scripts/export-financials.mjs [TICKER...]
// If no tickers given, exports all 89 validation companies.
//
// Requires bundled engine: run `node validation/scripts/bundle.mjs` first.

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const BUNDLE_PATH = resolve(__dirname, 'bundled-engines.mjs');
const DATA_DIR = resolve(__dirname, '../data/thesis');

// Polyfill browser globals before importing bundled engines
globalThis.localStorage = {
  _data: {},
  getItem(key) { return this._data[key] ?? null; },
  setItem(key, val) { this._data[key] = String(val); },
  removeItem(key) { delete this._data[key]; },
  get length() { return Object.keys(this._data).length; },
  key(i) { return Object.keys(this._data)[i] ?? null; },
};

// Check bundle exists
if (!existsSync(BUNDLE_PATH)) {
  console.error('Bundled engines not found. Run: node validation/scripts/bundle.mjs');
  process.exit(1);
}

// Dynamic import of the bundled engines
const { fetchEdgarStatements, computeKeyMetrics } = await import(BUNDLE_PATH);

// Load validation companies list
const companiesFile = resolve(ROOT, 'src/data/validationCompanies.js');
const companiesSrc = readFileSync(companiesFile, 'utf-8');
// Extract ticker list from the JS source
const tickerMatches = [...companiesSrc.matchAll(/ticker:\s*'([^']+)'/g)];
const ALL_TICKERS = tickerMatches.map(m => m[1]);

// Determine which tickers to export
const args = process.argv.slice(2);
const tickers = args.length > 0 ? args.map(t => t.toUpperCase()) : ALL_TICKERS;

console.log(`Exporting ${tickers.length} companies...`);

// Rate limit: SEC allows 10 req/sec, be conservative
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

let exported = 0;
let failed = 0;

for (const ticker of tickers) {
  const outPath = resolve(DATA_DIR, `${ticker}.json`);

  // Skip if already exported (for resumability)
  if (existsSync(outPath)) {
    console.log(`  ${ticker} — already exported, skipping`);
    exported++;
    continue;
  }

  try {
    console.log(`  ${ticker} — fetching EDGAR data...`);

    // Clear localStorage cache between tickers to avoid stale data
    globalThis.localStorage._data = {};

    const statements = await fetchEdgarStatements(ticker, { version: 'restated' });
    if (!statements) {
      console.log(`  ${ticker} — NO DATA (CIK not found or no EDGAR facts)`);
      failed++;
      await sleep(300);
      continue;
    }

    const keyMetrics = computeKeyMetrics(statements);

    const output = {
      ticker,
      exportedAt: new Date().toISOString(),
      years: statements.years,
      fiscalMonths: statements.fiscalMonths,
      income: statements.income,
      balance: statements.balance,
      cashFlow: statements.cashFlow,
      keyMetrics: keyMetrics?.metrics || null,
    };

    writeFileSync(outPath, JSON.stringify(output, null, 2));
    exported++;
    console.log(`  ${ticker} — OK (${statements.years.length} years)`);

    // Rate limiting: ~3 requests per ticker (facts + splits + ticker map)
    await sleep(400);
  } catch (err) {
    console.error(`  ${ticker} — ERROR: ${err.message}`);
    failed++;
    await sleep(500);
  }
}

console.log(`\nDone: ${exported} exported, ${failed} failed out of ${tickers.length} total.`);
