#!/usr/bin/env node
// Audit ticker resolution across all 43 gurus.
// Fetches each guru's 13F holdings and runs resolveTickersForHoldings(),
// then reports any holdings that failed to resolve a ticker.
//
// Usage:
//   node validation/scripts/bundle.mjs          # rebuild bundle first
//   node validation/scripts/audit-ticker-resolution.mjs
//   node validation/scripts/audit-ticker-resolution.mjs --quick   # use exported JSON data (no SEC fetch)
//
// Output: summary table + JSON report at validation/reports/ticker-resolution-audit.json

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { DOMParser } from '@xmldom/xmldom';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUNDLE_PATH = resolve(__dirname, 'bundled-engines.mjs');
const DATA_DIR = resolve(__dirname, '../data/gurus');
const REPORTS_DIR = resolve(__dirname, '../reports');

// Polyfill browser globals
globalThis.DOMParser = DOMParser;
globalThis.localStorage = {
  _data: {},
  getItem(key) { return this._data[key] ?? null; },
  setItem(key, val) { this._data[key] = String(val); },
  removeItem(key) { delete this._data[key]; },
  get length() { return Object.keys(this._data).length; },
  key(i) { return Object.keys(this._data)[i] ?? null; },
};

if (!existsSync(BUNDLE_PATH)) {
  console.error('Bundled engines not found. Run: node validation/scripts/bundle.mjs');
  process.exit(1);
}

mkdirSync(REPORTS_DIR, { recursive: true });

const { GURUS, fetchGuruWithChanges, resolveTickersForHoldings } = await import(BUNDLE_PATH);

const args = process.argv.slice(2);
const quickMode = args.includes('--quick');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Quick mode: use already-exported JSON files ───
async function loadFromExported() {
  if (!existsSync(DATA_DIR)) {
    console.error('No exported guru data found. Run: node validation/scripts/export-gurus.mjs');
    process.exit(1);
  }
  const results = [];
  for (const guru of GURUS) {
    const path = resolve(DATA_DIR, `${guru.cik}.json`);
    if (!existsSync(path)) continue;
    try {
      const data = JSON.parse(readFileSync(path, 'utf-8'));
      results.push({ guru, holdings: data.holdings || [] });
    } catch { /* skip */ }
  }
  return results;
}

// ─── Live mode: fetch from SEC EDGAR ───
async function fetchLive() {
  const results = [];
  let fetched = 0;
  for (const guru of GURUS) {
    fetched++;
    process.stdout.write(`\r  Fetching ${fetched}/${GURUS.length}: ${guru.name.padEnd(25)}`);
    // Clear cache between gurus so each gets a clean resolve
    globalThis.localStorage._data = {};
    try {
      const activity = await fetchGuruWithChanges(guru);
      if (activity?.holdings) {
        results.push({ guru, holdings: activity.holdings });
      }
      await sleep(300); // rate limit
    } catch (err) {
      console.error(`\n  FAILED: ${guru.name} — ${err.message}`);
    }
  }
  console.log('\r' + ' '.repeat(60));
  return results;
}

// ─── Main ───

console.log(`\nTicker Resolution Audit — ${GURUS.length} gurus`);
console.log(`Mode: ${quickMode ? 'quick (exported JSON)' : 'live (SEC EDGAR fetch)'}\n`);

const guruData = quickMode ? await loadFromExported() : await fetchLive();

// Now resolve tickers for each guru's holdings
let totalHoldings = 0;
let totalResolved = 0;
let totalFailed = 0;
const allFailures = [];
const guruSummaries = [];

for (const { guru, holdings } of guruData) {
  // Strip any existing tickers to force fresh resolution
  const stripped = holdings.map(h => ({ ...h, ticker: undefined }));
  const resolved = await resolveTickersForHoldings(stripped);

  const active = resolved.filter(h => h.action !== 'sold');
  const failed = active.filter(h => !h.ticker);
  const succeeded = active.filter(h => h.ticker);

  totalHoldings += active.length;
  totalResolved += succeeded.length;
  totalFailed += failed.length;

  if (failed.length > 0) {
    const failures = failed.map(h => ({
      issuer: h.issuer,
      cusip: h.cusip,
      value: h.value,
      portfolioPct: h.portfolioPct,
    }));
    allFailures.push({ guru: guru.name, cik: guru.cik, failures });
    guruSummaries.push({
      name: guru.name,
      total: active.length,
      resolved: succeeded.length,
      failed: failed.length,
      failedNames: failed.map(h => h.issuer),
    });
  }
}

// ─── Print results ───

const pct = totalHoldings > 0 ? ((totalResolved / totalHoldings) * 100).toFixed(1) : '0';
console.log(`\n${'═'.repeat(70)}`);
console.log(`  TOTAL: ${totalHoldings} active holdings across ${guruData.length} gurus`);
console.log(`  RESOLVED: ${totalResolved} (${pct}%)`);
console.log(`  FAILED: ${totalFailed}`);
console.log(`${'═'.repeat(70)}\n`);

if (guruSummaries.length > 0) {
  console.log('Gurus with unresolved tickers:\n');
  console.log(`  ${'Guru'.padEnd(25)} ${'Total'.padStart(6)} ${'OK'.padStart(6)} ${'Fail'.padStart(6)}  Failed Issuers`);
  console.log(`  ${'-'.repeat(25)} ${'-'.repeat(6)} ${'-'.repeat(6)} ${'-'.repeat(6)}  ${'-'.repeat(40)}`);
  for (const s of guruSummaries) {
    console.log(`  ${s.name.padEnd(25)} ${String(s.total).padStart(6)} ${String(s.resolved).padStart(6)} ${String(s.failed).padStart(6)}  ${s.failedNames.join(', ')}`);
  }
  console.log('');
} else {
  console.log('All tickers resolved successfully!\n');
}

// ─── Save JSON report ───

const report = {
  timestamp: new Date().toISOString(),
  mode: quickMode ? 'quick' : 'live',
  totalGurus: guruData.length,
  totalHoldings,
  totalResolved,
  totalFailed,
  resolutionRate: pct + '%',
  failures: allFailures,
};

const reportPath = resolve(REPORTS_DIR, 'ticker-resolution-audit.json');
writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(`Report saved: ${reportPath}`);
