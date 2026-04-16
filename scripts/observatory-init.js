#!/usr/bin/env node
// Observatory Init — creates a run capture directory and prints the runId.
// Called by skills before dispatching agents.
//
// Usage: node scripts/observatory-init.js TICKER STAGE [DATAPACKET_PATH]
// Output: Prints runId to stdout (last line). Skills capture this for later use.
//
// Example:
//   node scripts/observatory-init.js COST onePager .thes1s/reports/COST/data-packet.json

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';

const OBSERVATORY_ROOT = join(process.cwd(), 'observatory');
const RUNS_DIR = join(OBSERVATORY_ROOT, 'runs');

const ticker = (process.argv[2] || '').toUpperCase();
const stage = process.argv[3] || 'unknown';
const dataPacketPath = process.argv[4] || null;

if (!ticker) {
  console.error('Usage: node scripts/observatory-init.js TICKER STAGE [DATAPACKET_PATH]');
  process.exit(1);
}

// Generate run ID
const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const runId = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}-${ticker}-${stage}`;

// Hash DataPacket if path provided
let dataPacketHash = 'none';
let dataPacketCaveats = [];
if (dataPacketPath && existsSync(dataPacketPath)) {
  try {
    const dp = JSON.parse(readFileSync(dataPacketPath, 'utf8'));
    const stable = { ...dp };
    delete stable.assembledAt;
    delete stable.errors;
    dataPacketHash = createHash('sha256').update(JSON.stringify(stable)).digest('hex').slice(0, 16);
    dataPacketCaveats = dp.caveats || [];
  } catch (err) {
    console.error(`Warning: could not hash DataPacket: ${err.message}`);
  }
}

// Create directory
const runDir = join(RUNS_DIR, runId);
mkdirSync(join(runDir, 'agents'), { recursive: true });

// Write initial manifest (will be completed by observatory-finalize.js)
const manifest = {
  runId,
  timestamp: now.toISOString(),
  completedAt: null,
  controlVariables: {
    ticker,
    stage,
    models: { default: 'claude-sonnet-4-6' },
    dataPacketHash,
    dataPacketCaveats,
  },
  expectedVerdict: null,
  actualVerdict: null,
  verdictMatch: null,
  pipelineMetrics: null,
  agentFiles: [],
};

// Check known verdicts
const knownVerdictsPath = join(OBSERVATORY_ROOT, 'known-verdicts.json');
if (existsSync(knownVerdictsPath)) {
  try {
    const kv = JSON.parse(readFileSync(knownVerdictsPath, 'utf8'));
    const entry = kv.verdicts?.[ticker];
    if (entry) {
      manifest.expectedVerdict = entry.verdict;
    }
  } catch { /* skip */ }
}

writeFileSync(join(runDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

// Also write empty orchestrator.json (will be populated during run)
writeFileSync(join(runDir, 'orchestrator.json'), JSON.stringify({
  runId,
  dispatches: [],
  retries: [],
  stallsDetected: [],
  formatViolations: [],
  dataGaps: [],
}, null, 2));

console.log(`Observatory: initialized run ${runId}`);
console.log(`  Directory: observatory/runs/${runId}/`);
console.log(`  Expected verdict: ${manifest.expectedVerdict || 'not set'}`);
console.log(`  DataPacket hash: ${dataPacketHash}`);
console.log(runId);
