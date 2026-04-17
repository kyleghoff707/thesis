#!/usr/bin/env node
// Slice DataPacket — extracts only the fields an agent needs.
// Eliminates orchestrator cognitive load of manually slicing a 200KB JSON.
//
// Usage: node scripts/slice-datapacket.js TICKER AGENT_ROLE
// Output: Writes sliced JSON to stdout. Orchestrator pipes into agent prompt.
//
// Example:
//   node scripts/slice-datapacket.js LULU business-analyst > /tmp/slice.json
//   # or inline:
//   SLICE=$(node scripts/slice-datapacket.js LULU business-analyst)

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// Agent registry — which DataPacket fields each agent needs.
// Mirrors the AGENT_REGISTRY in generate-pitch-deck and generate-full-story skills.
const REGISTRY = {
  // Pitch Deck agents
  'annual-reader':              ['companyInfo', 'classification', 'financials', 'ttm', 'filings', 'caveats'],
  'quarterly-reader':           ['companyInfo', 'classification', 'financials', 'ttm', 'filings', 'caveats'],
  'business-analyst':           ['companyInfo', 'classification', 'ruleOneScore', 'peers', 'gurus', 'financials', 'ttm', 'growthRates', 'caveats'],
  'competitor-market-position':  ['companyInfo', 'classification', 'ruleOneScore', 'peers', 'peerMetrics', 'financials', 'ttm', 'growthRates', 'caveats'],
  'competitor-moats':           ['companyInfo', 'classification', 'ruleOneScore', 'peers', 'peerMetrics', 'financials', 'ttm', 'growthRates', 'caveats'],
  'financial-analyst':          ['companyInfo', 'classification', 'financials', 'ttm', 'growthRates', 'returnMetrics', 'debtMetrics', 'fcf', 'keyMetrics', 'caveats'],
  'management-evaluator':       ['companyInfo', 'classification', 'compensation', 'insiders', 'gurus', 'financials', 'ttm', 'returnMetrics', 'caveats'],
  'risk-analyst':               ['companyInfo', 'classification', 'financials', 'ttm', 'growthRates', 'peers', 'insiders', 'caveats'],
  'valuation-specialist':       ['companyInfo', 'classification', 'financials', 'ttm', 'growthRates', 'returnMetrics', 'fcf', 'keyMetrics', 'caveats'],
  'synthesis-writer':           [],  // receives section outputs only, no DataPacket

  // Full Story agents (same field mappings where roles overlap)
  'competitor-evaluator':       ['companyInfo', 'classification', 'ruleOneScore', 'peers', 'peerMetrics', 'financials', 'ttm', 'growthRates', 'caveats'],

  // One Pager — core Rule One minimum standards + valuation inputs + guru signal.
  // Keeps gurus (2.4KB, Rule One "meaning" signal — guru ownership is real context).
  // Drops insiders/filings/compensation/peers/peerMetrics/ruleOneScore:
  // - Insider/peer/mgmt analysis is pitch-deck territory
  // - Filings are read by annual-reader/quarterly-reader in pitch deck
  // - ruleOneScore is a pre-computed composite; one-pager judges from raw data
  // - Narrative context (business model, catalysts, management commentary)
  //   is better sourced via web search than via DataPacket
  'one-pager':                  ['companyInfo', 'classification', 'financials', 'ttm', 'growthRates', 'returnMetrics', 'debtMetrics', 'fcf', 'keyMetrics', 'gurus', 'caveats'],
};

const args = process.argv.slice(2);
const ticker = args[0]?.toUpperCase();
const agentRole = args[1];

if (!ticker || !agentRole) {
  console.error('Usage: node scripts/slice-datapacket.js TICKER AGENT_ROLE');
  console.error('');
  console.error('Available roles:');
  for (const role of Object.keys(REGISTRY)) {
    console.error(`  ${role}: ${REGISTRY[role].join(', ') || '(no DataPacket fields)'}`);
  }
  process.exit(1);
}

const dpPath = join(process.cwd(), `.thes1s/reports/${ticker}/data-packet.json`);
if (!existsSync(dpPath)) {
  console.error(`DataPacket not found: ${dpPath}`);
  process.exit(1);
}

const fields = REGISTRY[agentRole];
if (!fields) {
  console.error(`Unknown agent role: ${agentRole}`);
  console.error(`Available: ${Object.keys(REGISTRY).join(', ')}`);
  process.exit(1);
}

if (fields.length === 0) {
  console.error(`Agent ${agentRole} does not receive DataPacket fields (receives section outputs only).`);
  process.exit(0);
}

// Read and slice
const dp = JSON.parse(readFileSync(dpPath, 'utf8'));
const slice = {};
for (const field of fields) {
  if (dp[field] !== undefined) {
    slice[field] = dp[field];
  }
}

// Add metadata so the agent knows this is a slice
slice._sliceMetadata = {
  ticker,
  agentRole,
  fieldsIncluded: fields.filter(f => dp[f] !== undefined),
  fieldsMissing: fields.filter(f => dp[f] === undefined),
  originalSize: JSON.stringify(dp).length,
  sliceSize: JSON.stringify(slice).length,
};

console.log(JSON.stringify(slice, null, 2));
