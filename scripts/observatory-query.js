#!/usr/bin/env node
// Observatory Query — CLI tool for querying observatory data.
//
// Usage:
//   node scripts/observatory-query.js --verdict-accuracy
//   node scripts/observatory-query.js --agent financial-analyst
//   node scripts/observatory-query.js --ticker LULU
//   node scripts/observatory-query.js --cost-by-agent
//   node scripts/observatory-query.js --runs
//   node scripts/observatory-query.js --diff RUN_ID_1 RUN_ID_2

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

const ROOT = join(process.cwd(), 'observatory');
const RUNS_DIR = join(ROOT, 'runs');

// Load all run manifests sorted chronologically
function loadManifests() {
  if (!existsSync(RUNS_DIR)) return [];
  return readdirSync(RUNS_DIR)
    .filter(d => !d.startsWith('.'))
    .sort()
    .map(dir => {
      const path = join(RUNS_DIR, dir, 'manifest.json');
      if (!existsSync(path)) return null;
      try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
    })
    .filter(Boolean);
}

// Load agent records for a specific run
function loadAgentRecords(runId) {
  const agentsDir = join(RUNS_DIR, runId, 'agents');
  if (!existsSync(agentsDir)) return [];
  return readdirSync(agentsDir)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      try { return JSON.parse(readFileSync(join(agentsDir, f), 'utf8')); } catch { return null; }
    })
    .filter(Boolean);
}

// ─── Verdict Accuracy ─────────────────────────────────────────────
function showVerdictAccuracy() {
  const manifests = loadManifests();
  const withExpected = manifests.filter(m => m.expectedVerdict);

  console.log('Verdict Accuracy Report');
  console.log('='.repeat(50));
  console.log(`Total runs: ${manifests.length}`);
  console.log(`Runs with expected verdict: ${withExpected.length}\n`);

  if (withExpected.length === 0) {
    console.log('No expected verdicts set. Populate observatory/known-verdicts.json first.');
    return;
  }

  const matches = withExpected.filter(m => m.verdictMatch);
  const accuracy = (matches.length / withExpected.length * 100).toFixed(1);
  console.log(`Accuracy: ${matches.length}/${withExpected.length} (${accuracy}%)\n`);

  // Per-ticker breakdown
  const byTicker = {};
  for (const m of withExpected) {
    const t = m.controlVariables.ticker;
    if (!byTicker[t]) byTicker[t] = { runs: 0, matches: 0, expected: m.expectedVerdict, verdicts: [] };
    byTicker[t].runs++;
    if (m.verdictMatch) byTicker[t].matches++;
    byTicker[t].verdicts.push(m.actualVerdict);
  }

  console.log('Per-ticker:');
  console.log(`${'Ticker'.padEnd(8)} ${'Expected'.padEnd(12)} ${'Accuracy'.padEnd(10)} Verdicts`);
  console.log('-'.repeat(60));
  for (const [ticker, data] of Object.entries(byTicker).sort((a, b) => a[0].localeCompare(b[0]))) {
    const acc = `${data.matches}/${data.runs}`;
    console.log(`${ticker.padEnd(8)} ${data.expected.padEnd(12)} ${acc.padEnd(10)} ${data.verdicts.join(', ')}`);
  }
}

// ─── Agent Summary ────────────────────────────────────────────────
function showAgent(role) {
  const manifests = loadManifests();
  console.log(`Agent Profile: ${role}`);
  console.log('='.repeat(50));

  let totalCost = 0, totalDuration = 0, count = 0;
  const verdicts = [];

  for (const m of manifests) {
    const records = loadAgentRecords(m.runId).filter(r => r.agentRole === role);
    for (const r of records) {
      totalCost += r.usage.cost || 0;
      totalDuration += r.timing.durationSeconds || 0;
      count++;
      for (const s of r.output.sections) {
        if (s.verdict) verdicts.push(s.verdict);
      }
    }
  }

  if (count === 0) {
    console.log(`No records found for agent "${role}".`);
    return;
  }

  console.log(`Runs: ${count}`);
  console.log(`Avg cost: $${(totalCost / count).toFixed(2)}`);
  console.log(`Avg duration: ${(totalDuration / count).toFixed(0)}s`);
  console.log(`Total cost: $${totalCost.toFixed(2)}`);

  // Verdict distribution
  const dist = {};
  for (const v of verdicts) dist[v] = (dist[v] || 0) + 1;
  console.log(`\nVerdict distribution:`);
  for (const [v, n] of Object.entries(dist).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${v}: ${n}`);
  }
}

// ─── Ticker Summary ───────────────────────────────────────────────
function showTicker(ticker) {
  const manifests = loadManifests().filter(m => m.controlVariables.ticker === ticker.toUpperCase());
  console.log(`Ticker: ${ticker.toUpperCase()}`);
  console.log('='.repeat(50));

  if (manifests.length === 0) {
    console.log(`No runs found for ${ticker}.`);
    return;
  }

  console.log(`${'Run ID'.padEnd(35)} ${'Verdict'.padEnd(12)} ${'Match'.padEnd(8)} ${'Cost'.padEnd(8)} Duration`);
  console.log('-'.repeat(80));
  for (const m of manifests) {
    const matchStr = m.verdictMatch === true ? 'YES' : m.verdictMatch === false ? 'NO' : '-';
    const dur = `${(m.pipelineMetrics.totalWallTimeSeconds / 60).toFixed(0)}min`;
    console.log(
      `${m.runId.padEnd(35)} ${(m.actualVerdict || '?').padEnd(12)} ${matchStr.padEnd(8)} $${m.pipelineMetrics.totalCost.toFixed(2).padEnd(6)} ${dur}`
    );
  }

  console.log(`\nExpected verdict: ${manifests[0]?.expectedVerdict || 'not set'}`);
  console.log(`Verdicts: ${manifests.map(m => m.actualVerdict || '?').join(' → ')}`);
}

// ─── Cost by Agent ────────────────────────────────────────────────
function showCostByAgent() {
  const manifests = loadManifests();
  console.log('Cost by Agent Role');
  console.log('='.repeat(50));

  const costs = {};
  for (const m of manifests) {
    for (const r of loadAgentRecords(m.runId)) {
      if (!costs[r.agentRole]) costs[r.agentRole] = { total: 0, count: 0 };
      costs[r.agentRole].total += r.usage.cost || 0;
      costs[r.agentRole].count++;
    }
  }

  const sorted = Object.entries(costs).sort((a, b) => b[1].total - a[1].total);
  console.log(`${'Agent'.padEnd(30)} ${'Total'.padEnd(10)} ${'Avg'.padEnd(10)} Runs`);
  console.log('-'.repeat(60));
  for (const [role, data] of sorted) {
    console.log(`${role.padEnd(30)} $${data.total.toFixed(2).padEnd(8)} $${(data.total / data.count).toFixed(2).padEnd(8)} ${data.count}`);
  }

  const grandTotal = sorted.reduce((sum, [, d]) => sum + d.total, 0);
  console.log(`\nTotal across all agents: $${grandTotal.toFixed(2)}`);
}

// ─── List Runs ────────────────────────────────────────────────────
function showRuns() {
  const manifests = loadManifests();
  console.log('All Pipeline Runs');
  console.log('='.repeat(80));
  console.log(`${'Run ID'.padEnd(35)} ${'Ticker'.padEnd(8)} ${'Verdict'.padEnd(12)} ${'Match'.padEnd(8)} ${'Cost'.padEnd(8)} Sections`);
  console.log('-'.repeat(85));

  for (const m of manifests) {
    const matchStr = m.verdictMatch === true ? 'YES' : m.verdictMatch === false ? 'NO' : '-';
    console.log(
      `${m.runId.padEnd(35)} ${m.controlVariables.ticker.padEnd(8)} ${(m.actualVerdict || '?').padEnd(12)} ${matchStr.padEnd(8)} $${m.pipelineMetrics.totalCost.toFixed(2).padEnd(6)} ${m.pipelineMetrics.sectionsProduced}`
    );
  }
  console.log(`\nTotal: ${manifests.length} runs`);
}

// ─── Diff Two Runs ────────────────────────────────────────────────
function showDiff(runId1, runId2) {
  const m1 = (() => { try { return JSON.parse(readFileSync(join(RUNS_DIR, runId1, 'manifest.json'), 'utf8')); } catch { return null; } })();
  const m2 = (() => { try { return JSON.parse(readFileSync(join(RUNS_DIR, runId2, 'manifest.json'), 'utf8')); } catch { return null; } })();

  if (!m1 || !m2) {
    console.log('One or both run IDs not found.');
    return;
  }

  console.log(`Diff: ${runId1} vs ${runId2}`);
  console.log('='.repeat(60));

  // Compare key metrics
  const fields = [
    ['Ticker', m1.controlVariables.ticker, m2.controlVariables.ticker],
    ['Stage', m1.controlVariables.stage, m2.controlVariables.stage],
    ['Verdict', m1.actualVerdict, m2.actualVerdict],
    ['Expected', m1.expectedVerdict, m2.expectedVerdict],
    ['Match', String(m1.verdictMatch), String(m2.verdictMatch)],
    ['Cost', `$${m1.pipelineMetrics.totalCost.toFixed(2)}`, `$${m2.pipelineMetrics.totalCost.toFixed(2)}`],
    ['Duration', `${(m1.pipelineMetrics.totalWallTimeSeconds / 60).toFixed(0)}min`, `${(m2.pipelineMetrics.totalWallTimeSeconds / 60).toFixed(0)}min`],
    ['Sections', String(m1.pipelineMetrics.sectionsProduced), String(m2.pipelineMetrics.sectionsProduced)],
    ['Errors', String(m1.pipelineMetrics.errorsCount), String(m2.pipelineMetrics.errorsCount)],
    ['DataPacket Hash', m1.controlVariables.dataPacketHash?.slice(0, 12), m2.controlVariables.dataPacketHash?.slice(0, 12)],
  ];

  console.log(`${'Field'.padEnd(18)} ${'Run 1'.padEnd(16)} ${'Run 2'.padEnd(16)} Change`);
  console.log('-'.repeat(65));
  for (const [field, v1, v2] of fields) {
    const changed = v1 !== v2 ? '<-' : '';
    console.log(`${field.padEnd(18)} ${String(v1 || '-').padEnd(16)} ${String(v2 || '-').padEnd(16)} ${changed}`);
  }

  // Compare section verdicts
  const vc1 = (() => { try { return JSON.parse(readFileSync(join(RUNS_DIR, runId1, 'verdict-check.json'), 'utf8')); } catch { return null; } })();
  const vc2 = (() => { try { return JSON.parse(readFileSync(join(RUNS_DIR, runId2, 'verdict-check.json'), 'utf8')); } catch { return null; } })();

  if (vc1?.sectionVerdicts && vc2?.sectionVerdicts) {
    console.log('\nSection Verdicts:');
    const allKeys = [...new Set([...Object.keys(vc1.sectionVerdicts), ...Object.keys(vc2.sectionVerdicts)])].sort();
    for (const key of allKeys) {
      const v1 = vc1.sectionVerdicts[key] || '-';
      const v2 = vc2.sectionVerdicts[key] || '-';
      const changed = v1 !== v2 ? '<-' : '';
      console.log(`  ${key.padEnd(25)} ${v1.padEnd(12)} ${v2.padEnd(12)} ${changed}`);
    }
  }
}

// ─── Route Command ────────────────────────────────────────────────
const args = process.argv.slice(2);

if (args.includes('--verdict-accuracy')) {
  showVerdictAccuracy();
} else if (args.includes('--cost-by-agent')) {
  showCostByAgent();
} else if (args.includes('--runs')) {
  showRuns();
} else if (args.includes('--agent') && args[args.indexOf('--agent') + 1]) {
  showAgent(args[args.indexOf('--agent') + 1]);
} else if (args.includes('--ticker') && args[args.indexOf('--ticker') + 1]) {
  showTicker(args[args.indexOf('--ticker') + 1]);
} else if (args.includes('--diff') && args[args.indexOf('--diff') + 1] && args[args.indexOf('--diff') + 2]) {
  showDiff(args[args.indexOf('--diff') + 1], args[args.indexOf('--diff') + 2]);
} else {
  console.log(`Observatory Query — CLI tool for pipeline run data

Usage:
  --verdict-accuracy     Overall and per-ticker verdict match rates
  --cost-by-agent        Cost breakdown by agent role
  --runs                 List all pipeline runs
  --agent <role>         Profile for a specific agent role
  --ticker <TICKER>      Run history for a specific ticker
  --diff <run1> <run2>   Compare two runs side-by-side`);
}
