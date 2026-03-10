#!/usr/bin/env node
// Run Layer 1 validation with quarterly roll-up across all 89 validation companies.
// Usage: node validation/scripts/run-quarterly-validation.mjs

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const BUNDLE_PATH = resolve(__dirname, 'bundled-engines.mjs');
const RESULTS_PATH = resolve(__dirname, '../reports/quarterly-validation.json');

// Polyfill browser globals
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

const { fetchEdgarStatements, fetchEdgarQuarterly, validateCompany } = await import(BUNDLE_PATH);

// Load validation companies
const companiesFile = resolve(ROOT, 'src/data/validationCompanies.js');
const companiesSrc = readFileSync(companiesFile, 'utf-8');
const tickerMatches = [...companiesSrc.matchAll(/ticker:\s*'([^']+)'/g)];
const ALL_TICKERS = tickerMatches.map(m => m[1]);

// Allow filtering via CLI args
const args = process.argv.slice(2);
const tickers = args.length > 0 ? args.map(t => t.toUpperCase()) : ALL_TICKERS;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

console.log(`Running quarterly validation for ${tickers.length} companies...\n`);

const results = {};
let completed = 0;
let skipped = 0;
let failed = 0;

// Aggregate stats
let totalQtrChecks = 0;
let totalQtrMatches = 0;
let totalQtrWarnings = 0;
let totalQtrErrors = 0;
let companiesWithQuarterly = 0;
let totalRetainedEarningsChecks = 0;
let totalRetainedEarningsWarnings = 0;
let totalIdentityPass = 0;
let totalIdentityChecks = 0;

for (const ticker of tickers) {
  globalThis.localStorage._data = {};

  try {
    process.stdout.write(`  ${ticker} — fetching...`);

    const statements = await fetchEdgarStatements(ticker, { version: 'restated' });
    if (!statements) {
      console.log(' NO DATA (skipped)');
      skipped++;
      results[ticker] = { status: 'SKIP', reason: 'No EDGAR data' };
      await sleep(300);
      continue;
    }

    // Fetch quarterly data
    globalThis.localStorage._data = {};
    const qResult = await fetchEdgarQuarterly(ticker, { version: 'restated' });
    const quarterlyData = qResult?.quarterly || null;

    // Run validation with quarterly roll-up (skip Frames for speed)
    const result = await validateCompany(ticker, statements, { skipFrames: true, quarterlyData });

    // Extract quarterly roll-up stats
    const qtrChecks = result.quarterlyRollupChecks || [];
    const qtrMatchCount = qtrChecks.filter(c => c.status === 'match').length;
    const qtrWarnCount = qtrChecks.filter(c => c.status === 'warning').length;
    const qtrErrCount = qtrChecks.filter(c => c.status === 'error').length;
    const qtrTotal = qtrChecks.length;
    const qtrMatchRate = qtrTotal > 0 ? (qtrMatchCount / qtrTotal * 100).toFixed(1) : 'N/A';

    // Retained earnings stats
    const reChecks = result.retainedEarningsChecks || [];
    const reWarnings = reChecks.filter(c => c.status === 'warning').length;

    // Identity check stats
    const identityYears = Object.values(result.identityChecks || {});
    let yearPass = 0, yearTotal = 0;
    for (const yearChecks of identityYears) {
      for (const check of yearChecks) {
        yearTotal++;
        if (check.status === 'pass') yearPass++;
      }
    }

    totalIdentityPass += yearPass;
    totalIdentityChecks += yearTotal;
    totalRetainedEarningsChecks += reChecks.length;
    totalRetainedEarningsWarnings += reWarnings;

    if (qtrTotal > 0) {
      companiesWithQuarterly++;
      totalQtrChecks += qtrTotal;
      totalQtrMatches += qtrMatchCount;
      totalQtrWarnings += qtrWarnCount;
      totalQtrErrors += qtrErrCount;
    }

    const status = result.summary?.overallStatus || 'UNKNOWN';
    console.log(` ${status} | Identity: ${result.summary?.identityPassRate}% | Qtr Roll-Up: ${qtrMatchRate}% (${qtrMatchCount}/${qtrTotal}) | RE warnings: ${reWarnings}/${reChecks.length}`);

    results[ticker] = {
      status,
      identityPassRate: result.summary?.identityPassRate,
      completenessScore: result.summary?.completenessScore,
      derivedMatchRate: result.summary?.derivedMatchRate,
      quarterlyRollup: {
        matchRate: qtrTotal > 0 ? parseFloat(qtrMatchRate) : null,
        matches: qtrMatchCount,
        warnings: qtrWarnCount,
        errors: qtrErrCount,
        total: qtrTotal,
        // Detail on errors
        errorDetails: qtrChecks.filter(c => c.status === 'error').map(c => ({
          year: c.fy, field: c.field, label: c.label, diff: c.pctDiff?.toFixed(2) + '%',
          quarterly: c.type === 'flow' ? c.quarterSum : c.q4Val, annual: c.annualVal,
        })),
      },
      retainedEarnings: {
        checks: reChecks.length,
        warnings: reWarnings,
      },
      years: result.years?.length || 0,
    };

    completed++;
    await sleep(400);
  } catch (err) {
    console.log(` ERROR: ${err.message}`);
    results[ticker] = { status: 'ERROR', error: err.message };
    failed++;
    await sleep(500);
  }
}

// ── Summary ──
console.log('\n' + '═'.repeat(70));
console.log('QUARTERLY VALIDATION SUMMARY');
console.log('═'.repeat(70));
console.log(`Companies: ${completed} completed, ${skipped} skipped, ${failed} errors (${tickers.length} total)`);
console.log(`Companies with quarterly data: ${companiesWithQuarterly}`);
console.log('');
console.log(`Identity Checks: ${totalIdentityChecks > 0 ? (totalIdentityPass/totalIdentityChecks*100).toFixed(1) : 'N/A'}% pass (${totalIdentityPass}/${totalIdentityChecks})`);
console.log(`Quarterly Roll-Up: ${totalQtrChecks > 0 ? (totalQtrMatches/totalQtrChecks*100).toFixed(1) : 'N/A'}% match (${totalQtrMatches}/${totalQtrChecks})`);
console.log(`  Warnings (1-5% off): ${totalQtrWarnings}`);
console.log(`  Errors (>5% off): ${totalQtrErrors}`);
console.log(`Retained Earnings: ${totalRetainedEarningsWarnings} warnings out of ${totalRetainedEarningsChecks} year-pairs`);

// Show any quarterly roll-up errors
const errorCompanies = Object.entries(results).filter(([, r]) => r.quarterlyRollup?.errors > 0);
if (errorCompanies.length > 0) {
  console.log('\n── Quarterly Roll-Up Errors (>5% off) ──');
  for (const [ticker, r] of errorCompanies) {
    console.log(`  ${ticker}:`);
    for (const detail of r.quarterlyRollup.errorDetails) {
      console.log(`    FY${detail.year} ${detail.field}: diff=${detail.diff} (qtr=${detail.quarterly}, annual=${detail.annual})`);
    }
  }
}

// Save results
writeFileSync(RESULTS_PATH, JSON.stringify({ timestamp: new Date().toISOString(), summary: { companies: completed, skipped, failed, companiesWithQuarterly, identityPassRate: totalIdentityChecks > 0 ? +(totalIdentityPass/totalIdentityChecks*100).toFixed(1) : null, quarterlyMatchRate: totalQtrChecks > 0 ? +(totalQtrMatches/totalQtrChecks*100).toFixed(1) : null, quarterlyChecks: totalQtrChecks, quarterlyMatches: totalQtrMatches, quarterlyWarnings: totalQtrWarnings, quarterlyErrors: totalQtrErrors, retainedEarningsChecks: totalRetainedEarningsChecks, retainedEarningsWarnings: totalRetainedEarningsWarnings }, results }, null, 2));
console.log(`\nResults saved to: validation/reports/quarterly-validation.json`);
