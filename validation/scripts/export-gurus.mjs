#!/usr/bin/env node
// Export Thes1s guru 13F data as JSON for validation.
// Usage: node validation/scripts/export-gurus.mjs [CIK...]
// If no CIKs given, exports all 43 gurus.
//
// Requires bundled engine: run `node validation/scripts/bundle.mjs` first.

import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { DOMParser } from '@xmldom/xmldom';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUNDLE_PATH = resolve(__dirname, 'bundled-engines.mjs');
const DATA_DIR = resolve(__dirname, '../data/gurus');

// Polyfill browser globals before importing bundled engines
globalThis.DOMParser = DOMParser;
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

// Ensure output directory exists
mkdirSync(DATA_DIR, { recursive: true });

// Dynamic import of the bundled engines
const { GURUS, fetchGuruWithChanges } = await import(BUNDLE_PATH);

// Determine which gurus to export
const args = process.argv.slice(2);
const forceRefresh = args.includes('--force');
const filteredArgs = args.filter(a => !a.startsWith('--'));
const gurus = filteredArgs.length > 0
  ? GURUS.filter(g => filteredArgs.includes(g.cik) || filteredArgs.map(a => a.toLowerCase()).includes(g.name.toLowerCase()))
  : GURUS;

console.log(`Exporting ${gurus.length} gurus...\n`);

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

let exported = 0;
let failed = 0;
const summary = [];

for (const guru of gurus) {
  const outPath = resolve(DATA_DIR, `${guru.cik}.json`);

  // Skip if already exported (for resumability) unless --force
  if (!forceRefresh && existsSync(outPath)) {
    console.log(`  ${guru.name} (${guru.cik}) — already exported, skipping`);
    exported++;
    continue;
  }

  try {
    console.log(`  ${guru.name} (${guru.cik}) — fetching 13F data...`);

    // Clear localStorage cache between gurus
    globalThis.localStorage._data = {};

    const activity = await fetchGuruWithChanges(guru);

    if (!activity || !activity.holdings) {
      console.log(`  ${guru.name} — NO DATA`);
      failed++;
      summary.push({ name: guru.name, cik: guru.cik, status: 'NO_DATA' });
      await sleep(500);
      continue;
    }

    // Count diagnostics
    const mergedCount = activity.holdings.filter(h => h.mergedClasses).length;
    const totalClasses = activity.holdings
      .filter(h => h.mergedClasses)
      .reduce((s, h) => s + (h.classCount || 0), 0);

    const output = {
      guru: { name: guru.name, fund: guru.fund, cik: guru.cik },
      exportedAt: new Date().toISOString(),
      filing: activity.filing || null,
      previousFiling: activity.previousFiling || null,
      positionCount: activity.positionCount,
      totalValue: activity.totalValue,
      diagnostics: {
        classesAggregated: mergedCount,
        totalClassesMerged: totalClasses,
      },
      holdings: activity.holdings.map(h => ({
        issuer: h.issuer,
        titleOfClass: h.titleOfClass,
        cusip: h.cusip,
        cusip6: h.cusip6 || (h.cusip || '').slice(0, 6),
        ticker: h.ticker || null,
        value: h.value,
        shares: h.shares,
        portfolioPct: h.portfolioPct,
        action: h.action || null,
        mergedClasses: h.mergedClasses || false,
        classCount: h.classCount || 1,
      })),
      activity: activity.stats || null,
    };

    writeFileSync(outPath, JSON.stringify(output, null, 2));
    exported++;

    const guruSummary = {
      name: guru.name, cik: guru.cik, status: 'OK',
      positions: activity.positionCount,
      totalValue: activity.totalValue,
      classesAggregated: mergedCount,
    };
    summary.push(guruSummary);
    console.log(`  ${guru.name} — OK (${activity.positionCount} positions, $${(activity.totalValue / 1e9).toFixed(2)}B, ${mergedCount} classes merged)`);

    await sleep(500);
  } catch (err) {
    console.error(`  ${guru.name} — ERROR: ${err.message}`);
    failed++;
    summary.push({ name: guru.name, cik: guru.cik, status: 'ERROR', error: err.message });
    await sleep(500);
  }
}

// Write summary
const summaryPath = resolve(DATA_DIR, '_export-summary.json');
writeFileSync(summaryPath, JSON.stringify({
  exportedAt: new Date().toISOString(),
  total: gurus.length,
  exported,
  failed,
  gurus: summary,
}, null, 2));

console.log(`\nDone: ${exported} exported, ${failed} failed out of ${gurus.length} total.`);
console.log(`Summary: ${summaryPath}`);
