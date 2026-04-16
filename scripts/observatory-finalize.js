#!/usr/bin/env node
// Observatory Finalize — completes a run capture with results.
// Called by skills after all agents have completed and output is saved.
//
// Usage: node scripts/observatory-finalize.js RUN_ID OUTPUT_PATH [flags]
//
// Flags:
//   --verdict VERDICT     Overall verdict (PASS/FAIL/WATCHLIST)
//   --cost COST           Total cost in USD
//   --duration SECONDS    Total wall-clock time in seconds
//   --tokens TOTAL        Total tokens used
//   --input-tokens N      Input tokens
//   --output-tokens N     Output tokens
//   --tool-uses N         Number of tool calls (web searches, file reads, etc.)
//   --model MODEL         Model used (e.g., claude-sonnet-4-6)
//
// Example:
//   node scripts/observatory-finalize.js 20260414-143022-COST-onePager .thes1s/reports/COST/one-pager.json --verdict WATCHLIST --tokens 59489 --tool-uses 14 --duration 214

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const OBSERVATORY_ROOT = join(process.cwd(), 'observatory');
const RUNS_DIR = join(OBSERVATORY_ROOT, 'runs');

// Parse args
const args = process.argv.slice(2);
const runId = args[0];
const outputPath = args[1];

if (!runId) {
  console.error('Usage: node scripts/observatory-finalize.js RUN_ID OUTPUT_PATH [--verdict V] [--cost C] [--duration S]');
  process.exit(1);
}

// Parse optional flags
let cliVerdict = null, cliCost = null, cliDuration = null;
let cliTokens = null, cliInputTokens = null, cliOutputTokens = null;
let cliToolUses = null, cliModel = null;
for (let i = 2; i < args.length; i++) {
  if (args[i] === '--verdict' && args[i + 1]) { cliVerdict = args[++i]; }
  if (args[i] === '--cost' && args[i + 1]) { cliCost = parseFloat(args[++i]); }
  if (args[i] === '--tokens' && args[i + 1]) { cliTokens = parseInt(args[++i]); }
  if (args[i] === '--input-tokens' && args[i + 1]) { cliInputTokens = parseInt(args[++i]); }
  if (args[i] === '--output-tokens' && args[i + 1]) { cliOutputTokens = parseInt(args[++i]); }
  if (args[i] === '--tool-uses' && args[i + 1]) { cliToolUses = parseInt(args[++i]); }
  if (args[i] === '--duration' && args[i + 1]) { cliDuration = parseFloat(args[++i]); }
  if (args[i] === '--model' && args[i + 1]) { cliModel = args[++i]; }
}

const runDir = join(RUNS_DIR, runId);
if (!existsSync(runDir)) {
  console.error(`Run directory not found: ${runDir}`);
  process.exit(1);
}

// Read existing manifest
const manifestPath = join(runDir, 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

// Read output file to extract verdict and section data
let sections = [];
let overallVerdict = cliVerdict;
if (outputPath && existsSync(outputPath)) {
  try {
    const output = JSON.parse(readFileSync(outputPath, 'utf8'));

    // Extract sections (handle both array and object-with-sections formats)
    sections = output.sections || [];
    if (!Array.isArray(sections) && typeof output === 'object') {
      // One Pager format: keys are section names
      const sectionKeys = ['company_info', 'minimum_standards', 'meaning', 'growth_metrics', 'valuation_summary', 'overall_verdict'];
      sections = sectionKeys.map(key => output[key] || output.sections?.find(s => s.key === key)).filter(Boolean);
    }

    // Extract overall verdict
    if (!overallVerdict) {
      overallVerdict = output.overallVerdict
        || output.overall_verdict?.verdict
        || sections.find(s => s.key === 'overall_verdict')?.verdict
        || sections.find(s => s.sectionNumber === 6)?.verdict
        || null;
    }
  } catch (err) {
    console.error(`Warning: could not read output file: ${err.message}`);
  }
}

// Update manifest
const completedAt = new Date().toISOString();
const startTime = new Date(manifest.timestamp).getTime();
const totalSeconds = cliDuration || ((Date.now() - startTime) / 1000);

manifest.completedAt = completedAt;
manifest.actualVerdict = overallVerdict;
manifest.verdictMatch = manifest.expectedVerdict
  ? (overallVerdict === manifest.expectedVerdict)
  : null;

// Estimate cost from tokens if not provided directly
// Sonnet pricing: ~$3/M input, ~$15/M output. Rough estimate using 60/40 split.
const estimatedCost = cliCost || (cliTokens
  ? (cliTokens * 0.6 * 3 / 1_000_000) + (cliTokens * 0.4 * 15 / 1_000_000)
  : 0);

manifest.pipelineMetrics = {
  totalWallTimeSeconds: totalSeconds,
  totalCost: estimatedCost,
  totalTokens: cliTokens || 0,
  totalInputTokens: cliInputTokens || (cliTokens ? Math.round(cliTokens * 0.6) : 0),
  totalOutputTokens: cliOutputTokens || (cliTokens ? Math.round(cliTokens * 0.4) : 0),
  toolUses: cliToolUses || 0,
  model: cliModel || manifest.controlVariables.models?.default || 'claude-sonnet-4-6',
  sectionsProduced: sections.length,
  sectionsExpected: manifest.controlVariables.stage === 'pitchDeck' ? 11
    : manifest.controlVariables.stage === 'all' ? 23 : 6,
  errorsCount: 0,
};

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

// Build verdict check
const sectionVerdicts = {};
const verdictCounts = {};
for (const section of sections) {
  if (section?.key && section?.verdict) {
    sectionVerdicts[section.key] = section.verdict;
    verdictCounts[section.verdict] = (verdictCounts[section.verdict] || 0) + 1;
  }
}

const verdictCheck = {
  runId,
  ticker: manifest.controlVariables.ticker,
  expectedVerdict: manifest.expectedVerdict,
  expectedSource: manifest.expectedVerdict ? 'known-verdicts.json' : null,
  actualVerdict: overallVerdict,
  match: manifest.verdictMatch,
  sectionVerdicts,
  verdictDistribution: verdictCounts,
};

writeFileSync(join(runDir, 'verdict-check.json'), JSON.stringify(verdictCheck, null, 2));

// Append to log.md
try {
  const logPath = join(OBSERVATORY_ROOT, 'log.md');
  const matchStr = manifest.expectedVerdict
    ? (manifest.verdictMatch ? 'MATCH' : 'MISMATCH')
    : 'no expected verdict';
  const costStr = estimatedCost.toFixed(2);
  const durMin = (totalSeconds / 60).toFixed(0);

  // Read orchestrator for failure count
  let failureCount = 0;
  const orchPath = join(runDir, 'orchestrator.json');
  if (existsSync(orchPath)) {
    try {
      const orch = JSON.parse(readFileSync(orchPath, 'utf8'));
      failureCount = (orch.formatViolations?.length || 0) + (orch.retries?.length || 0) + (orch.stallsDetected?.length || 0);
    } catch { /* skip */ }
  }

  const failureStr = failureCount > 0 ? `\n- Failures: ${failureCount}` : '\n- Failures: none';

  const entry = `\n## [${completedAt.slice(0, 10)}] run | ${manifest.controlVariables.ticker} ${manifest.controlVariables.stage} | ${runId}\n` +
    `- Verdict: ${overallVerdict || 'unknown'} (expected: ${manifest.expectedVerdict || 'not set'}) — ${matchStr}\n` +
    `- Cost: $${costStr} | Duration: ${durMin}min | Sections: ${sections.length}/${manifest.pipelineMetrics.sectionsExpected}` +
    failureStr + '\n';

  const currentLog = existsSync(logPath) ? readFileSync(logPath, 'utf8') : '';
  writeFileSync(logPath, currentLog + entry);
} catch (err) {
  console.error(`Warning: could not append to log.md: ${err.message}`);
}

// Summary
const matchIcon = manifest.verdictMatch === true ? 'MATCH' : manifest.verdictMatch === false ? 'MISMATCH' : '-';
console.log(`\nObservatory: finalized run ${runId}`);
console.log(`  Verdict: ${overallVerdict || 'unknown'} (expected: ${manifest.expectedVerdict || 'not set'}) — ${matchIcon}`);
console.log(`  Sections: ${sections.length} | Cost: $${estimatedCost.toFixed(2)} | Duration: ${(totalSeconds / 60).toFixed(0)}min`);
console.log(`  Output: observatory/runs/${runId}/`);
