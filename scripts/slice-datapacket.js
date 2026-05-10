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
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Agent registry — which DataPacket fields each agent needs.
// Source of truth: src/data/datapacket-slice-registry.json — shared with the
// browser utility at src/utils/sliceDataPacket.js. Edit the JSON, not this file.
const __dirname = dirname(fileURLToPath(import.meta.url));
const registryPath = join(__dirname, '..', 'src', 'data', 'datapacket-slice-registry.json');
const REGISTRY = JSON.parse(readFileSync(registryPath, 'utf8')).agents;

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

const dpPath = join(process.cwd(), `.thesis/reports/${ticker}/data-packet.json`);
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
