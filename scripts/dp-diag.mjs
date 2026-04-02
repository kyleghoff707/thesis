#!/usr/bin/env node
// DataPacket field diagnostic — run a few tickers and report null fields + errors
// Usage: node --loader ./scripts/node-esm-loader.js scripts/dp-diag.mjs

import '../src/engines/nodeAdapter.js';
import { assembleDataPacket } from '../src/engines/dataExport.js';

const tickers = ['AAPL', 'COST', 'SFM', 'ODFL', 'META'];

const FIELDS = [
  'companyInfo', 'classification', 'currentPrice', 'financials', 'ttm',
  'growthRates', 'returnMetrics', 'debtMetrics', 'fcf', 'keyMetrics',
  'ruleOneScore', 'gurus', 'insiders', 'compensation', 'peers',
  'peerMetrics', 'analystEstimates', 'prices',
  'transcriptAvailability', 'filings', 'caveats',
];

const summary = {};

for (const ticker of tickers) {
  console.log(`\n=== ${ticker} ===`);
  try {
    const dp = await assembleDataPacket(ticker);
    let filled = 0;
    let nullFields = [];
    for (const f of FIELDS) {
      const val = dp[f];
      const isNull = val == null || (Array.isArray(val) && val.length === 0);
      if (isNull) {
        nullFields.push(f);
        summary[f] = (summary[f] || 0) + 1;
      } else {
        filled++;
      }
    }
    console.log(`  Filled: ${filled}/${FIELDS.length}`);
    if (nullFields.length > 0) console.log(`  NULL: ${nullFields.join(', ')}`);
    if (dp.errors) console.log(`  Errors: ${dp.errors.join(' | ')}`);
  } catch (err) {
    console.log(`  FAILED: ${err.message}`);
  }
}

console.log('\n=== SUMMARY: Fields null across tickers ===');
const sorted = Object.entries(summary).sort((a, b) => b[1] - a[1]);
if (sorted.length === 0) console.log('  All fields populated for all tickers!');
for (const [field, count] of sorted) {
  console.log(`  ${field}: null in ${count}/${tickers.length} tickers`);
}
