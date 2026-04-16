// Observatory Wiki Synthesizer — Deterministic template-based synthesis.
// After each pipeline run, reads raw data and updates wiki pages.
// No LLM calls — all synthesis is deterministic from structured data.
//
// Usage:
//   await updateWiki(runId);          // Update wiki after a single run
//   await synthesizeAll();            // Batch update from all runs (post-sprint)

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, renameSync } from 'fs';
import { join, relative } from 'path';

const OBSERVATORY_ROOT = join(process.cwd(), 'observatory');
const RUNS_DIR = join(OBSERVATORY_ROOT, 'runs');
const WIKI_DIRS = {
  agents: join(OBSERVATORY_ROOT, 'agents'),
  tickers: join(OBSERVATORY_ROOT, 'tickers'),
  failureModes: join(OBSERVATORY_ROOT, 'failure-modes'),
  patterns: join(OBSERVATORY_ROOT, 'patterns'),
};

// Read a wiki page, or return null if it doesn't exist
function readPage(pagePath) {
  const fullPath = pagePath.startsWith('/') ? pagePath : join(OBSERVATORY_ROOT, pagePath);
  return existsSync(fullPath) ? readFileSync(fullPath, 'utf8') : null;
}

// Write a wiki page atomically (temp file + rename)
function writePage(pagePath, content) {
  const fullPath = pagePath.startsWith('/') ? pagePath : join(OBSERVATORY_ROOT, pagePath);
  const dir = fullPath.replace(/\/[^/]+$/, '');
  mkdirSync(dir, { recursive: true });
  const tmpPath = fullPath + '.tmp';
  writeFileSync(tmpPath, content);
  renameSync(tmpPath, fullPath);
}

// Load a run's manifest and all agent records
function loadRunData(runId) {
  const runDir = join(RUNS_DIR, runId);
  if (!existsSync(runDir)) return null;

  const manifest = JSON.parse(readFileSync(join(runDir, 'manifest.json'), 'utf8'));
  const orchestrator = existsSync(join(runDir, 'orchestrator.json'))
    ? JSON.parse(readFileSync(join(runDir, 'orchestrator.json'), 'utf8'))
    : null;
  const verdictCheck = existsSync(join(runDir, 'verdict-check.json'))
    ? JSON.parse(readFileSync(join(runDir, 'verdict-check.json'), 'utf8'))
    : null;

  const agentsDir = join(runDir, 'agents');
  const agentRecords = [];
  if (existsSync(agentsDir)) {
    for (const file of readdirSync(agentsDir).filter(f => f.endsWith('.json'))) {
      agentRecords.push(JSON.parse(readFileSync(join(agentsDir, file), 'utf8')));
    }
  }

  return { manifest, orchestrator, verdictCheck, agentRecords };
}

// Load all run manifests for historical context
function loadAllRuns() {
  if (!existsSync(RUNS_DIR)) return [];
  return readdirSync(RUNS_DIR)
    .filter(d => !d.startsWith('.'))
    .sort()
    .map(dir => {
      try {
        return loadRunData(dir);
      } catch { return null; }
    })
    .filter(Boolean);
}

// Determine which wiki pages need updating
function identifyAffectedPages(runData) {
  const pages = new Set();
  const { manifest, orchestrator, agentRecords } = runData;
  const ticker = manifest.controlVariables.ticker;

  pages.add(`tickers/${ticker}.md`);
  for (const record of agentRecords) {
    pages.add(`agents/${record.agentRole}.md`);
  }
  if (orchestrator) {
    if (orchestrator.formatViolations?.length > 0) pages.add('failure-modes/format-violations.md');
    if (orchestrator.retries?.length > 0) pages.add('failure-modes/retries.md');
    if (orchestrator.stallsDetected?.length > 0) pages.add('failure-modes/stalls.md');
    if (orchestrator.dataGaps?.length > 0) pages.add('failure-modes/data-gaps.md');
  }
  pages.add('patterns/verdict-accuracy.md');
  return Array.from(pages);
}

// ──────────────────────────────────────────────────
// Deterministic page generators (no LLM calls)
// ──────────────────────────────────────────────────

function generateTickerPage(ticker, allRuns) {
  const tickerRuns = allRuns.filter(r => r.manifest.controlVariables.ticker === ticker);
  if (tickerRuns.length === 0) return null;

  const verdictHistory = tickerRuns.map(r => r.manifest.actualVerdict || 'unknown');
  const expectedVerdict = tickerRuns[0].manifest.expectedVerdict || 'not set';
  const matchCount = tickerRuns.filter(r => r.manifest.verdictMatch === true).length;
  const accuracy = tickerRuns.some(r => r.manifest.expectedVerdict)
    ? (matchCount / tickerRuns.filter(r => r.manifest.expectedVerdict).length).toFixed(2)
    : 'N/A';

  const now = new Date().toISOString();
  const companyName = ticker; // We don't have company name in manifests

  let page = `---
type: ticker-page
ticker: ${ticker}
companyName: ${companyName}
lastUpdated: ${now}
runCount: ${tickerRuns.length}
expectedVerdict: ${expectedVerdict}
verdictHistory: [${verdictHistory.join(', ')}]
verdictAccuracy: ${accuracy}
tags: [ticker, ${ticker}]
---

## Run History

| Run ID | Stage | Verdict | Expected | Match | Cost | Duration | Sections |
|--------|-------|---------|----------|-------|------|----------|----------|
`;

  for (const run of tickerRuns) {
    const m = run.manifest;
    const match = m.verdictMatch === true ? 'MATCH' : m.verdictMatch === false ? 'MISMATCH' : '-';
    page += `| ${m.runId} | ${m.controlVariables.stage} | ${m.actualVerdict || '?'} | ${m.expectedVerdict || '-'} | ${match} | $${m.pipelineMetrics.totalCost.toFixed(2)} | ${(m.pipelineMetrics.totalWallTimeSeconds / 60).toFixed(0)}min | ${m.pipelineMetrics.sectionsProduced}/${m.pipelineMetrics.sectionsExpected || '?'} |\n`;
  }

  // Verdict stability
  const uniqueVerdicts = [...new Set(verdictHistory)];
  const stability = uniqueVerdicts.length === 1
    ? `All ${tickerRuns.length} runs returned ${uniqueVerdicts[0]}.`
    : `Verdicts vary: ${uniqueVerdicts.join(', ')}. ${verdictHistory.filter(v => v === verdictHistory[0]).length}/${tickerRuns.length} returned ${verdictHistory[0]}.`;

  page += `\n## Verdict Stability\n\n${stability}\n`;

  // Agent performance
  const agentStats = {};
  for (const run of tickerRuns) {
    for (const agent of run.agentRecords) {
      if (!agentStats[agent.agentRole]) agentStats[agent.agentRole] = { runs: 0, totalDuration: 0 };
      agentStats[agent.agentRole].runs++;
      agentStats[agent.agentRole].totalDuration += agent.timing.durationSeconds || 0;
    }
  }

  if (Object.keys(agentStats).length > 0) {
    page += `\n## Agent Performance\n\n| Agent | Runs | Avg Duration |\n|-------|------|--------------|\n`;
    for (const [role, stats] of Object.entries(agentStats)) {
      page += `| [[agents/${role}]] | ${stats.runs} | ${(stats.totalDuration / stats.runs).toFixed(0)}s |\n`;
    }
  } else {
    page += `\n## Agent Performance\n\n_No agent-level data recorded yet. Agent recording was added after these runs._\n`;
  }

  // Data gaps
  const allGaps = tickerRuns.flatMap(r => r.orchestrator?.dataGaps || []);
  if (allGaps.length > 0) {
    page += `\n## DataPacket Notes\n\n`;
    for (const gap of allGaps) page += `- ${gap}\n`;
  } else {
    page += `\n## DataPacket Notes\n\n_No data gaps recorded._\n`;
  }

  page += `\n## Control Variable Sensitivity\n\n_Insufficient data for sensitivity analysis (need multiple runs with different configurations)._\n`;

  return page;
}

function generateAgentPage(agentRole, allRuns) {
  const agentRuns = [];
  for (const run of allRuns) {
    for (const agent of run.agentRecords) {
      if (agent.agentRole === agentRole) {
        agentRuns.push({ ...agent, ticker: run.manifest.controlVariables.ticker, stage: run.manifest.controlVariables.stage });
      }
    }
  }

  if (agentRuns.length === 0) return null;

  const avgCost = agentRuns.reduce((s, a) => s + (a.usage?.cost || 0), 0) / agentRuns.length;
  const avgDuration = agentRuns.reduce((s, a) => s + (a.timing?.durationSeconds || 0), 0) / agentRuns.length;

  const verdicts = agentRuns.flatMap(a => a.output.sections.map(s => s.verdict)).filter(Boolean);
  const verdictDist = {};
  for (const v of verdicts) verdictDist[v] = (verdictDist[v] || 0) + 1;

  const now = new Date().toISOString();

  let page = `---
type: agent-profile
agentRole: ${agentRole}
lastUpdated: ${now}
runCount: ${agentRuns.length}
avgCost: ${avgCost.toFixed(2)}
avgDuration: ${avgDuration.toFixed(0)}
verdictDistribution:
${Object.entries(verdictDist).map(([k, v]) => `  ${k}: ${v}`).join('\n')}
tags: [agent, ${agentRole}]
---

## Behavioral Summary

Agent **${agentRole}** has been observed across ${agentRuns.length} run(s). Average duration: ${avgDuration.toFixed(0)}s. Average cost: $${avgCost.toFixed(2)}.

## Run History

| Run ID | Ticker | Stage | Wave | Duration | Sections | Verdict |
|--------|--------|-------|------|----------|----------|---------|
`;

  for (const a of agentRuns) {
    const sectionVerdicts = a.output.sections.map(s => s.verdict || '?').join(', ');
    page += `| ${a.runId} | ${a.ticker} | ${a.stage} | ${a.wave} | ${(a.timing?.durationSeconds || 0).toFixed(0)}s | ${a.output.sectionsProduced} | ${sectionVerdicts} |\n`;
  }

  // Retry info
  const retries = agentRuns.filter(a => a.qualitySignals.retryCount > 0);
  if (retries.length > 0) {
    page += `\n## Failure Modes\n\n`;
    for (const a of retries) {
      page += `- ${a.runId}: ${a.qualitySignals.retryCount} retries (${a.qualitySignals.retryReasons.join(', ')})\n`;
    }
  } else {
    page += `\n## Failure Modes\n\n_No failures observed._\n`;
  }

  page += `\n## Cost Profile\n\nAverage cost: $${avgCost.toFixed(2)} per run.\n`;
  page += `\n## Quality Trends\n\n_Critic scores not yet tracked at agent level._\n`;
  page += `\n## Recommendations\n\n_Insufficient data for recommendations (need 5+ runs)._\n`;

  return page;
}

function generateVerdictAccuracyPage(allRuns) {
  const now = new Date().toISOString();
  const runsWithExpected = allRuns.filter(r => r.manifest.expectedVerdict);
  const matches = runsWithExpected.filter(r => r.manifest.verdictMatch === true).length;
  const accuracy = runsWithExpected.length > 0 ? (matches / runsWithExpected.length).toFixed(2) : 'N/A';

  // Per-ticker breakdown
  const tickerStats = {};
  for (const run of allRuns) {
    const ticker = run.manifest.controlVariables.ticker;
    if (!tickerStats[ticker]) tickerStats[ticker] = { total: 0, matched: 0, expected: null, verdicts: [] };
    tickerStats[ticker].total++;
    tickerStats[ticker].verdicts.push(run.manifest.actualVerdict);
    if (run.manifest.expectedVerdict) {
      tickerStats[ticker].expected = run.manifest.expectedVerdict;
      if (run.manifest.verdictMatch) tickerStats[ticker].matched++;
    }
  }

  let page = `---
type: pattern
pattern: verdict-accuracy
lastUpdated: ${now}
confidence: ${runsWithExpected.length >= 10 ? 'high' : runsWithExpected.length >= 5 ? 'medium' : 'low'}
runsSampled: ${allRuns.length}
tags: [pattern, verdict, accuracy]
---

## Observation

Overall verdict accuracy: **${accuracy === 'N/A' ? 'N/A (no expected verdicts configured)' : `${(parseFloat(accuracy) * 100).toFixed(0)}%`}** (${matches}/${runsWithExpected.length} runs matched expected verdict).

Total runs analyzed: ${allRuns.length}

## Per-Ticker Breakdown

| Ticker | Runs | Expected | Actual Verdicts | Accuracy |
|--------|------|----------|----------------|----------|
`;

  for (const [ticker, stats] of Object.entries(tickerStats)) {
    const verdictSummary = [...new Set(stats.verdicts)].join(', ');
    const acc = stats.expected ? `${stats.matched}/${stats.total}` : 'no expected';
    page += `| [[tickers/${ticker}]] | ${stats.total} | ${stats.expected || '-'} | ${verdictSummary} | ${acc} |\n`;
  }

  page += `\n## Evidence\n\n`;
  for (const run of allRuns) {
    const m = run.manifest;
    const match = m.verdictMatch === true ? 'MATCH' : m.verdictMatch === false ? 'MISMATCH' : 'no expected';
    page += `- ${m.runId}: ${m.actualVerdict || '?'} vs ${m.expectedVerdict || 'none'} → ${match}\n`;
  }

  page += `\n## Hypothesis\n\n`;
  if (runsWithExpected.length > 0 && parseFloat(accuracy) < 0.5) {
    page += `Agents are systematically conservative — producing WATCHLIST when BUY is expected. This is a known conservatism bias pattern.\n`;
  } else if (accuracy === 'N/A') {
    page += `No expected verdicts configured yet. Populate \`observatory/known-verdicts.json\` to enable calibration.\n`;
  } else {
    page += `Accuracy data still accumulating. Need more runs for reliable patterns.\n`;
  }

  page += `\n## Recommended Action\n\n`;
  if (runsWithExpected.length > 0 && parseFloat(accuracy) < 0.5) {
    page += `- Investigate prompt conservatism: agents may over-weight risks vs growth signals\n- Compare section-level verdicts to identify which agents drive WATCHLIST\n- Consider adjusting valuation thresholds or risk weighting\n`;
  } else {
    page += `- Continue accumulating runs to build statistical confidence\n- Populate known-verdicts.json with more tickers\n`;
  }

  return page;
}

function generateFailureModePage(mode, allRuns) {
  const now = new Date().toISOString();
  const events = [];

  for (const run of allRuns) {
    const orch = run.orchestrator;
    if (!orch) continue;
    const m = run.manifest;

    if (mode === 'format-violations') {
      for (const v of (orch.formatViolations || [])) {
        events.push({ runId: m.runId, ticker: m.controlVariables.ticker, agent: v.agent, details: v.violation });
      }
    } else if (mode === 'retries') {
      for (const r of (orch.retries || [])) {
        events.push({ runId: m.runId, ticker: m.controlVariables.ticker, agent: r.agent, details: `${r.reason} (attempt ${r.attempt})` });
      }
    } else if (mode === 'stalls') {
      for (const s of (orch.stallsDetected || [])) {
        events.push({ runId: m.runId, ticker: m.controlVariables.ticker, agent: s.agent, details: `${s.durationSeconds}s, ${s.resolution}` });
      }
    } else if (mode === 'data-gaps') {
      for (const g of (orch.dataGaps || [])) {
        events.push({ runId: m.runId, ticker: m.controlVariables.ticker, agent: '-', details: g });
      }
    }
  }

  if (events.length === 0) return null;

  const affectedAgents = [...new Set(events.map(e => e.agent).filter(a => a !== '-'))];

  let page = `---
type: failure-mode
mode: ${mode}
lastUpdated: ${now}
severity: ${events.length > 5 ? 'high' : events.length > 2 ? 'medium' : 'low'}
frequency: ${events.length}
affectedAgents: [${affectedAgents.join(', ')}]
tags: [failure-mode, ${mode}]
---

## Definition

${mode === 'format-violations' ? 'Agent output did not match expected JSON schema.' :
  mode === 'retries' ? 'Agent execution failed and was retried.' :
  mode === 'stalls' ? 'Agent execution stalled (exceeded expected duration).' :
  'Required data was missing or incomplete during pipeline execution.'}

## Instances

| Run ID | Ticker | Agent | Details |
|--------|--------|-------|---------|
`;

  for (const e of events) {
    page += `| ${e.runId} | ${e.ticker} | ${e.agent} | ${e.details} |\n`;
  }

  page += `\n## Root Cause Analysis\n\n_To be filled after pattern emerges across multiple runs._\n`;
  page += `\n## Mitigation\n\n_To be determined based on root cause._\n`;

  return page;
}

// Rebuild index.md from all existing wiki pages
function updateIndex() {
  const sections = {
    Agents: [],
    Tickers: [],
    'Failure Modes': [],
    Patterns: [],
    'Prompt Versions': [],
    Experiments: [],
  };

  for (const [category, dir] of Object.entries(WIKI_DIRS)) {
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir).filter(f => f.endsWith('.md'))) {
      const name = file.replace('.md', '');
      const dirName = relative(OBSERVATORY_ROOT, dir);
      const link = `[[${dirName}/${name}]]`;

      let description = name;
      try {
        const content = readFileSync(join(dir, file), 'utf8');
        const bodyStart = content.indexOf('---', content.indexOf('---') + 3);
        if (bodyStart > 0) {
          const body = content.slice(bodyStart + 3).trim();
          const firstHeading = body.match(/^#+ (.+)/m);
          description = firstHeading ? firstHeading[1] : name;
        }
      } catch { /* keep name */ }

      const sectionKey = {
        agents: 'Agents',
        tickers: 'Tickers',
        failureModes: 'Failure Modes',
        patterns: 'Patterns',
      }[category] || category;

      if (sections[sectionKey]) {
        sections[sectionKey].push(`- ${link} — ${description}`);
      }
    }
  }

  sections['Prompt Versions'] = ['- [[prompt-versions/changelog]] — All prompt changes with measured impact'];
  sections['Experiments'] = ['- [[experiments/doe-log]] — Formal DOE experiment tracking'];

  let index = '# Observatory Index\n\n> Pipeline observability wiki for Thes1s agent team optimization.\n> Updated automatically after each pipeline run.\n\n';
  for (const [section, entries] of Object.entries(sections)) {
    index += `## ${section}\n\n`;
    if (entries.length > 0) {
      index += entries.join('\n') + '\n';
    } else {
      index += `_No ${section.toLowerCase()} pages yet._\n`;
    }
    index += '\n';
  }

  writePage('index.md', index);
}

// Update the wiki after a single run
export async function updateWiki(runId) {
  const allRuns = loadAllRuns();
  const runData = allRuns.find(r => r.manifest.runId === runId);
  if (!runData) {
    console.warn(`Observatory synthesis: run ${runId} not found`);
    return;
  }

  const affectedPages = identifyAffectedPages(runData);
  console.log(`\nObservatory synthesis: updating ${affectedPages.length} wiki pages...`);

  let updatedCount = 0;
  for (const pagePath of affectedPages) {
    try {
      let content = null;

      if (pagePath.startsWith('tickers/')) {
        const ticker = pagePath.replace('tickers/', '').replace('.md', '');
        content = generateTickerPage(ticker, allRuns);
      } else if (pagePath.startsWith('agents/')) {
        const role = pagePath.replace('agents/', '').replace('.md', '');
        content = generateAgentPage(role, allRuns);
      } else if (pagePath === 'patterns/verdict-accuracy.md') {
        content = generateVerdictAccuracyPage(allRuns);
      } else if (pagePath.startsWith('failure-modes/')) {
        const mode = pagePath.replace('failure-modes/', '').replace('.md', '');
        content = generateFailureModePage(mode, allRuns);
      }

      if (content && content.trim().length > 50) {
        writePage(pagePath, content);
        updatedCount++;
        console.log(`  Updated: ${pagePath}`);
      }
    } catch (err) {
      console.warn(`  Failed: ${pagePath} — ${err.message}`);
    }
  }

  // Append wiki update event to log.md
  try {
    const logPath = join(OBSERVATORY_ROOT, 'log.md');
    const pagesStr = affectedPages.filter((_, i) => i < updatedCount).map(p => `[[${p.replace('.md', '')}]]`).join(', ');
    const entry = `\n## [${new Date().toISOString().slice(0, 10)}] wiki-update | ${updatedCount} pages updated\n- Updated: ${pagesStr}\n`;
    const currentLog = existsSync(logPath) ? readFileSync(logPath, 'utf8') : '';
    writeFileSync(logPath, currentLog + entry);
  } catch { /* non-critical */ }

  try { updateIndex(); } catch (err) { console.warn(`  Index update failed: ${err.message}`); }

  console.log(`Observatory synthesis complete: ${updatedCount}/${affectedPages.length} pages updated.`);
}

// Batch synthesis: process all runs, then generate all pages
export async function synthesizeAll() {
  const allRuns = loadAllRuns();
  if (allRuns.length === 0) {
    console.log('No runs found.');
    return;
  }

  console.log(`Batch synthesis: processing ${allRuns.length} runs...`);

  // Get all unique tickers and agents
  const tickers = [...new Set(allRuns.map(r => r.manifest.controlVariables.ticker))];
  const agentRoles = [...new Set(allRuns.flatMap(r => r.agentRecords.map(a => a.agentRole)))];

  let updatedCount = 0;

  // Generate ticker pages
  for (const ticker of tickers) {
    const content = generateTickerPage(ticker, allRuns);
    if (content) {
      writePage(`tickers/${ticker}.md`, content);
      updatedCount++;
      console.log(`  Updated: tickers/${ticker}.md`);
    }
  }

  // Generate agent pages
  for (const role of agentRoles) {
    const content = generateAgentPage(role, allRuns);
    if (content) {
      writePage(`agents/${role}.md`, content);
      updatedCount++;
      console.log(`  Updated: agents/${role}.md`);
    }
  }

  // Generate verdict accuracy page
  const verdictPage = generateVerdictAccuracyPage(allRuns);
  if (verdictPage) {
    writePage('patterns/verdict-accuracy.md', verdictPage);
    updatedCount++;
    console.log('  Updated: patterns/verdict-accuracy.md');
  }

  // Generate failure mode pages
  for (const mode of ['format-violations', 'retries', 'stalls', 'data-gaps']) {
    const content = generateFailureModePage(mode, allRuns);
    if (content) {
      writePage(`failure-modes/${mode}.md`, content);
      updatedCount++;
      console.log(`  Updated: failure-modes/${mode}.md`);
    }
  }

  // Update index
  try { updateIndex(); } catch (err) { console.warn(`Index update failed: ${err.message}`); }

  // Log
  try {
    const logPath = join(OBSERVATORY_ROOT, 'log.md');
    const entry = `\n## [${new Date().toISOString().slice(0, 10)}] wiki-update | batch synthesis | ${updatedCount} pages updated\n- Tickers: ${tickers.join(', ')}\n- Agents: ${agentRoles.length > 0 ? agentRoles.join(', ') : 'none (no agent records yet)'}\n`;
    const currentLog = existsSync(logPath) ? readFileSync(logPath, 'utf8') : '';
    writeFileSync(logPath, currentLog + entry);
  } catch { /* non-critical */ }

  console.log(`\nBatch synthesis complete: ${updatedCount} pages generated.`);
}
