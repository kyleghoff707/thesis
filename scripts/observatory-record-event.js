#!/usr/bin/env node
// Observatory Record Event — logs orchestrator events to orchestrator.json.
// Called by skills to record wave completions, retries, stalls, violations, and data gaps.
//
// Usage: node scripts/observatory-record-event.js RUN_ID SUBCOMMAND [flags]
//
// Subcommands:
//
//   dispatch  — Record a wave/phase completion
//     --wave N                Wave number
//     --stage "Stage Name"    Human-readable stage name
//     --agents "a,b,c"        Comma-separated agent roles
//     --parallel true|false   Whether agents ran in parallel (default: true)
//     --duration SECONDS      Total wave wall-clock time
//
//   retry  — Record an agent retry
//     --agent ROLE            Agent that was retried
//     --wave N                Wave number
//     --reason "..."          Why the retry was needed
//     --attempt N             Attempt number (1 = first retry)
//     --resolved true|false   Whether the retry resolved the issue (default: false)
//
//   stall  — Record a detected stall
//     --agent ROLE            Agent that stalled
//     --wave N                Wave number
//     --duration SECONDS      How long the stall lasted
//     --resolution "..."      How it was resolved
//
//   format-violation  — Record a format/schema violation in agent output
//     --agent ROLE            Agent that produced bad output
//     --violation "..."       Description of the violation
//     --fix-applied true|false Whether auto-fix was applied (default: false)
//
//   data-gap  — Record missing or incomplete data
//     --description "..."     What data was missing
//
// Examples:
//   node scripts/observatory-record-event.js 20260415-204131-LULU-pitchDeck dispatch \
//     --wave 1 --stage "Business Fundamentals" \
//     --agents "business-analyst,competitor-market-position" --parallel true --duration 180
//
//   node scripts/observatory-record-event.js 20260415-204131-LULU-pitchDeck retry \
//     --agent business-analyst --wave 1 --reason "missing citations" --attempt 1

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const OBSERVATORY_ROOT = join(process.cwd(), 'observatory');
const RUNS_DIR = join(OBSERVATORY_ROOT, 'runs');

// Parse args
const args = process.argv.slice(2);
const runId = args[0];
const subcommand = args[1];

const validSubcommands = ['dispatch', 'retry', 'stall', 'format-violation', 'data-gap'];

if (!runId || !subcommand || !validSubcommands.includes(subcommand)) {
  console.error(`Usage: node scripts/observatory-record-event.js RUN_ID {${validSubcommands.join('|')}} [flags]`);
  process.exit(1);
}

const runDir = join(RUNS_DIR, runId);
if (!existsSync(runDir)) {
  console.error(`Run directory not found: ${runDir}`);
  process.exit(1);
}

// Parse flags
const flags = {};
for (let i = 2; i < args.length; i++) {
  if (args[i].startsWith('--') && args[i + 1]) {
    const key = args[i].slice(2);
    flags[key] = args[++i];
  }
}

// Read existing orchestrator.json
const orchPath = join(runDir, 'orchestrator.json');
let orchestrator;
try {
  orchestrator = JSON.parse(readFileSync(orchPath, 'utf8'));
} catch {
  // Initialize if missing or corrupt
  orchestrator = {
    runId,
    dispatches: [],
    retries: [],
    stallsDetected: [],
    formatViolations: [],
    dataGaps: [],
  };
}

// Ensure all arrays exist
orchestrator.dispatches = orchestrator.dispatches || [];
orchestrator.retries = orchestrator.retries || [];
orchestrator.stallsDetected = orchestrator.stallsDetected || [];
orchestrator.formatViolations = orchestrator.formatViolations || [];
orchestrator.dataGaps = orchestrator.dataGaps || [];

// Handle subcommand
switch (subcommand) {
  case 'dispatch': {
    const agents = (flags.agents || '').split(',').map(s => s.trim()).filter(Boolean);
    orchestrator.dispatches.push({
      wave: parseInt(flags.wave) || 0,
      stage: flags.stage || `Wave ${flags.wave || 0}`,
      agents,
      parallel: flags.parallel !== 'false',
      durationSeconds: parseFloat(flags.duration) || 0,
    });
    console.log(`Observatory: recorded dispatch — wave ${flags.wave}, ${agents.length} agents, ${flags.parallel !== 'false' ? 'parallel' : 'sequential'}`);
    break;
  }

  case 'retry': {
    orchestrator.retries.push({
      agent: flags.agent || 'unknown',
      wave: parseInt(flags.wave) || 0,
      reason: flags.reason || 'unspecified',
      attempt: parseInt(flags.attempt) || 1,
      resolved: flags.resolved === 'true',
    });
    console.log(`Observatory: recorded retry — ${flags.agent} wave ${flags.wave}, attempt ${flags.attempt || 1}`);
    break;
  }

  case 'stall': {
    orchestrator.stallsDetected.push({
      agent: flags.agent || 'unknown',
      wave: parseInt(flags.wave) || 0,
      detectedAt: new Date().toISOString(),
      durationSeconds: parseFloat(flags.duration) || 0,
      resolution: flags.resolution || 'unspecified',
    });
    console.log(`Observatory: recorded stall — ${flags.agent} wave ${flags.wave}, ${flags.duration}s`);
    break;
  }

  case 'format-violation': {
    orchestrator.formatViolations.push({
      agent: flags.agent || 'unknown',
      violation: flags.violation || 'unspecified',
      original: null,
      corrected: null,
      fixApplied: flags['fix-applied'] === 'true',
    });
    console.log(`Observatory: recorded format violation — ${flags.agent}: ${flags.violation}`);
    break;
  }

  case 'data-gap': {
    orchestrator.dataGaps.push(flags.description || 'unspecified data gap');
    console.log(`Observatory: recorded data gap — ${flags.description}`);
    break;
  }
}

// Write back
writeFileSync(orchPath, JSON.stringify(orchestrator, null, 2));
