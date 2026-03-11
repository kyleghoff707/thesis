#!/usr/bin/env node
// Validate exported guru 13F data for self-consistency and against reference data.
// Usage: node validation/scripts/validate-gurus.mjs
//
// Requires exported guru data: run `node validation/scripts/export-gurus.mjs` first.

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, '../data/gurus');
const REPORTS_DIR = resolve(__dirname, '../reports');
const REFERENCE_PATH = resolve(__dirname, '../data/guru-reference.json');

// ============================================================
// Self-consistency checks
// ============================================================

function validateGuru(data) {
  const issues = [];

  // Active holdings = current positions (excludes sold-out entries from previous quarter comparison)
  const active = data.holdings.filter(h => h.action !== 'sold');

  // 1. Portfolio math: sum of active values should equal totalValue
  const sumValue = active.reduce((s, h) => s + h.value, 0);
  const valueDiff = Math.abs(sumValue - data.totalValue);
  const valuePct = data.totalValue > 0 ? (valueDiff / data.totalValue) * 100 : 0;
  if (valuePct > 0.1) {
    issues.push({ check: 'portfolio_value_sum', expected: data.totalValue, actual: sumValue, diffPct: valuePct.toFixed(2) });
  }

  // 2. Portfolio percentages should sum to ~100% (active only)
  const sumPct = active.reduce((s, h) => s + h.portfolioPct, 0);
  if (Math.abs(sumPct - 100) > 0.5) {
    issues.push({ check: 'portfolio_pct_sum', expected: 100, actual: sumPct.toFixed(2) });
  }

  // 3. No duplicate CUSIP 6-char prefixes in active holdings (confirms aggregation worked)
  const cusip6Counts = new Map();
  for (const h of active) {
    const c6 = h.cusip6 || (h.cusip || '').slice(0, 6);
    cusip6Counts.set(c6, (cusip6Counts.get(c6) || 0) + 1);
  }
  const duplicates = [...cusip6Counts.entries()].filter(([, count]) => count > 1);
  if (duplicates.length > 0) {
    issues.push({ check: 'cusip6_duplicates', duplicates: duplicates.map(([cusip6, count]) => ({ cusip6, count })) });
  }

  // 4. Position count matches active holdings array length
  if (data.positionCount !== active.length) {
    issues.push({ check: 'position_count', expected: data.positionCount, actual: active.length });
  }

  // 5. Value sanity: no implied price < $0.01 or > $1,000,000 (active only)
  // BRK.A trades ~$750K+ so upper bound must accommodate that
  const priceBounds = [];
  for (const h of active) {
    if (h.shares > 0) {
      const implied = h.value / h.shares;
      if (implied < 0.01) priceBounds.push({ issuer: h.issuer, cusip: h.cusip, implied, type: 'too_low' });
      if (implied > 1000000) priceBounds.push({ issuer: h.issuer, cusip: h.cusip, implied, type: 'too_high' });
    }
  }
  if (priceBounds.length > 0) {
    issues.push({ check: 'implied_price_bounds', outliers: priceBounds });
  }

  // 6. No holdings should have putCall set (options should be filtered)
  const optionsLeaked = data.holdings.filter(h => h.putCall);
  if (optionsLeaked.length > 0) {
    issues.push({ check: 'options_leaked', count: optionsLeaked.length });
  }

  return {
    guru: data.guru,
    positionCount: data.positionCount,
    totalValue: data.totalValue,
    filing: data.filing,
    diagnostics: data.diagnostics,
    issueCount: issues.length,
    issues,
    pass: issues.length === 0,
  };
}

// ============================================================
// Spot-check against reference data
// ============================================================

function spotCheck(data, reference) {
  const result = { guru: data.guru.name, checks: [] };

  // Position count
  const posDiff = Math.abs(data.positionCount - reference.expectedPositions);
  result.checks.push({
    metric: 'positionCount',
    thesis: data.positionCount,
    reference: reference.expectedPositions,
    diff: posDiff,
    pass: posDiff <= 2, // allow ±2 for minor classification differences
  });

  // Total value (within 5%)
  if (reference.expectedValue) {
    const valPct = Math.abs(data.totalValue - reference.expectedValue) / reference.expectedValue * 100;
    result.checks.push({
      metric: 'totalValue',
      thesis: data.totalValue,
      reference: reference.expectedValue,
      diffPct: valPct.toFixed(2),
      pass: valPct < 5,
    });
  }

  // Top holdings overlap
  if (reference.expectedTopHoldings) {
    const thesisTop = data.holdings.slice(0, 10).map(h => (h.ticker || h.issuer).toUpperCase());
    const matches = reference.expectedTopHoldings.filter(t => thesisTop.includes(t.toUpperCase()));
    result.checks.push({
      metric: 'topHoldingsOverlap',
      thesisTop5: thesisTop.slice(0, 5),
      referenceTop: reference.expectedTopHoldings,
      matched: matches.length,
      total: reference.expectedTopHoldings.length,
      pass: matches.length >= Math.floor(reference.expectedTopHoldings.length * 0.8),
    });
  }

  result.pass = result.checks.every(c => c.pass);
  return result;
}

// ============================================================
// Main
// ============================================================

console.log('Guru 13F Validation\n');

// Load exported guru files
const files = readdirSync(DATA_DIR).filter(f => f.endsWith('.json') && !f.startsWith('_'));
if (files.length === 0) {
  console.error('No exported guru data found. Run: node validation/scripts/export-gurus.mjs');
  process.exit(1);
}

console.log(`Found ${files.length} exported guru files.\n`);

// Run self-consistency checks
const results = [];
let passCount = 0;
let failCount = 0;
let totalOptionsFiltered = 0;
let totalClassesAggregated = 0;

for (const file of files) {
  const data = JSON.parse(readFileSync(resolve(DATA_DIR, file), 'utf-8'));
  const result = validateGuru(data);
  results.push(result);

  if (data.diagnostics) {
    totalClassesAggregated += data.diagnostics.classesAggregated || 0;
  }

  if (result.pass) {
    passCount++;
    console.log(`  ✅ ${data.guru.name} — ${data.positionCount} positions, $${(data.totalValue / 1e9).toFixed(2)}B`);
  } else {
    failCount++;
    console.log(`  ❌ ${data.guru.name} — ${result.issueCount} issue(s):`);
    for (const issue of result.issues) {
      console.log(`     - ${issue.check}: ${JSON.stringify(issue)}`);
    }
  }
}

// Spot-check against reference data (if available)
let spotCheckResults = null;
if (existsSync(REFERENCE_PATH)) {
  console.log('\n--- Spot-Check Against Reference Data ---\n');
  const references = JSON.parse(readFileSync(REFERENCE_PATH, 'utf-8'));
  spotCheckResults = [];

  for (const ref of references) {
    const dataFile = resolve(DATA_DIR, `${ref.cik}.json`);
    if (!existsSync(dataFile)) {
      console.log(`  ⚠️  ${ref.name} — no export file`);
      continue;
    }
    const data = JSON.parse(readFileSync(dataFile, 'utf-8'));
    const result = spotCheck(data, ref);
    spotCheckResults.push(result);

    const icon = result.pass ? '✅' : '❌';
    console.log(`  ${icon} ${result.guru}:`);
    for (const c of result.checks) {
      const ci = c.pass ? '✓' : '✗';
      console.log(`     ${ci} ${c.metric}: thesis=${c.thesis ?? c.thesisTop5?.join(',')} ref=${c.reference ?? c.referenceTop?.join(',')}`);
    }
  }
} else {
  console.log('\n  No reference data file found at validation/data/guru-reference.json');
  console.log('  Create one with hand-verified data from Dataroma/WhaleWisdom for spot-checks.\n');
}

// Write report
const report = {
  timestamp: new Date().toISOString(),
  summary: {
    gurusChecked: results.length,
    passed: passCount,
    failed: failCount,
    totalClassesAggregated,
  },
  spotChecks: spotCheckResults,
  perGuru: results,
};

const reportPath = resolve(REPORTS_DIR, 'guru-validation.json');
writeFileSync(reportPath, JSON.stringify(report, null, 2));

console.log(`\n--- Summary ---`);
console.log(`Gurus checked: ${results.length}`);
console.log(`Passed: ${passCount}`);
console.log(`Failed: ${failCount}`);
console.log(`Classes aggregated across all gurus: ${totalClassesAggregated}`);
console.log(`\nReport: ${reportPath}`);
