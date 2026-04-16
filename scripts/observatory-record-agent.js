#!/usr/bin/env node
// Observatory Record Agent — writes per-agent execution records.
// Called by skills after each subagent completes.
//
// Usage: node scripts/observatory-record-agent.js RUN_ID [flags]
//
// Flags:
//   --role ROLE             Agent role (e.g., business-analyst, one-pager)
//   --wave N                Wave number (0-4)
//   --stage STAGE           Pipeline stage (onePager, pitchDeck, fullStory)
//   --sections "k1,k2"     Comma-separated section keys produced
//   --model MODEL           Model used (e.g., claude-sonnet-4-6)
//   --duration SECONDS      Agent wall-clock time
//   --verdict VERDICT       Section verdict (PASS/FAIL/WATCHLIST)
//   --confidence LEVEL      Confidence level (HIGH/MEDIUM/LOW)
//   --citations N           Number of citations in output
//   --red-flags N           Number of red flags identified
//   --narrative-length N    Character count of narrative text
//   --tokens N              Total tokens (optional, often unavailable from CC subagents)
//   --input-tokens N        Input tokens (optional)
//   --output-tokens N       Output tokens (optional)
//   --cost COST             Cost in USD (optional)
//   --retry-count N         Number of retries needed
//   --retry-reasons "r1,r2" Comma-separated retry reasons
//
// Example:
//   node scripts/observatory-record-agent.js 20260415-204131-LULU-pitchDeck \
//     --role business-analyst --wave 1 --stage pitchDeck \
//     --sections "radar,simple_predictable" --model claude-sonnet-4-6 \
//     --duration 120 --verdict PASS --confidence HIGH \
//     --citations 12 --red-flags 0 --narrative-length 2400

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const OBSERVATORY_ROOT = join(process.cwd(), 'observatory');
const RUNS_DIR = join(OBSERVATORY_ROOT, 'runs');

// Parse args
const args = process.argv.slice(2);
const runId = args[0];

if (!runId || runId.startsWith('--')) {
  console.error('Usage: node scripts/observatory-record-agent.js RUN_ID --role ROLE --wave N --stage STAGE [flags]');
  process.exit(1);
}

// Parse flags
let role = null, wave = null, stage = null, sections = [];
let model = 'claude-sonnet-4-6', duration = 0, verdict = null, confidence = null;
let citations = 0, redFlags = 0, narrativeLength = 0;
let tokens = 0, inputTokens = 0, outputTokens = 0, cost = 0;
let retryCount = 0, retryReasons = [];

for (let i = 1; i < args.length; i++) {
  if (args[i] === '--role' && args[i + 1]) { role = args[++i]; }
  if (args[i] === '--wave' && args[i + 1]) { wave = parseInt(args[++i]); }
  if (args[i] === '--stage' && args[i + 1]) { stage = args[++i]; }
  if (args[i] === '--sections' && args[i + 1]) { sections = args[++i].split(',').map(s => s.trim()).filter(Boolean); }
  if (args[i] === '--model' && args[i + 1]) { model = args[++i]; }
  if (args[i] === '--duration' && args[i + 1]) { duration = parseFloat(args[++i]); }
  if (args[i] === '--verdict' && args[i + 1]) { verdict = args[++i]; }
  if (args[i] === '--confidence' && args[i + 1]) { confidence = args[++i]; }
  if (args[i] === '--citations' && args[i + 1]) { citations = parseInt(args[++i]); }
  if (args[i] === '--red-flags' && args[i + 1]) { redFlags = parseInt(args[++i]); }
  if (args[i] === '--narrative-length' && args[i + 1]) { narrativeLength = parseInt(args[++i]); }
  if (args[i] === '--tokens' && args[i + 1]) { tokens = parseInt(args[++i]); }
  if (args[i] === '--input-tokens' && args[i + 1]) { inputTokens = parseInt(args[++i]); }
  if (args[i] === '--output-tokens' && args[i + 1]) { outputTokens = parseInt(args[++i]); }
  if (args[i] === '--cost' && args[i + 1]) { cost = parseFloat(args[++i]); }
  if (args[i] === '--retry-count' && args[i + 1]) { retryCount = parseInt(args[++i]); }
  if (args[i] === '--retry-reasons' && args[i + 1]) { retryReasons = args[++i].split(',').map(s => s.trim()).filter(Boolean); }
}

if (!role || wave === null || !stage) {
  console.error('Error: --role, --wave, and --stage are required.');
  process.exit(1);
}

const runDir = join(RUNS_DIR, runId);
if (!existsSync(runDir)) {
  console.error(`Run directory not found: ${runDir}`);
  process.exit(1);
}

const agentsDir = join(runDir, 'agents');

// Build record following observatoryCapture.js recordAgent() schema
const record = {
  runId,
  agentRole: role,
  wave,
  stage,
  sectionsAssigned: sections,
  input: {
    model,
    promptVersion: null,
  },
  output: {
    sectionsProduced: sections.length,
    sections: sections.map(key => ({
      key,
      verdict,
      confidence,
      redFlagCount: redFlags,
      citationCount: citations,
      narrativeLength,
    })),
  },
  usage: {
    inputTokens: inputTokens || (tokens ? Math.round(tokens * 0.6) : 0),
    outputTokens: outputTokens || (tokens ? Math.round(tokens * 0.4) : 0),
    cacheRead: 0,
    cacheWrite: 0,
    webSearches: 0,
    cost: cost || 0,
  },
  timing: {
    startedAt: null,
    completedAt: new Date().toISOString(),
    durationSeconds: duration,
  },
  qualitySignals: {
    formatValid: true,
    schemaValid: true,
    requiredFieldsMissing: [],
    keyNormalized: false,
    retryCount,
    retryReasons,
    criticScores: {},
  },
};

// Write agent file
const filename = `wave-${wave}-${role}.json`;
writeFileSync(join(agentsDir, filename), JSON.stringify(record, null, 2));

// Update manifest.json agentFiles array
const manifestPath = join(runDir, 'manifest.json');
if (existsSync(manifestPath)) {
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const agentFilePath = `agents/${filename}`;
    if (!manifest.agentFiles) manifest.agentFiles = [];
    if (!manifest.agentFiles.includes(agentFilePath)) {
      manifest.agentFiles.push(agentFilePath);
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    }
  } catch (err) {
    console.warn(`Warning: could not update manifest agentFiles: ${err.message}`);
  }
}

console.log(`Observatory: recorded agent ${role} (wave ${wave}) → ${filename}`);
