// Observatory Wiki Synthesizer — Karpathy Wiki LLM pattern
// After each pipeline run, reads raw data and updates wiki pages.
// Uses Sonnet for synthesis (cheap, fast, good at structured markdown).
//
// Usage:
//   await updateWiki(runId);          // Update wiki after a single run
//   await synthesizeAll();            // Batch update from all runs (post-sprint)

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, renameSync } from 'fs';
import { join, relative } from 'path';
import Anthropic from '@anthropic-ai/sdk';

const OBSERVATORY_ROOT = join(process.cwd(), 'observatory');
const RUNS_DIR = join(OBSERVATORY_ROOT, 'runs');
const WIKI_DIRS = {
  agents: join(OBSERVATORY_ROOT, 'agents'),
  tickers: join(OBSERVATORY_ROOT, 'tickers'),
  failureModes: join(OBSERVATORY_ROOT, 'failure-modes'),
  patterns: join(OBSERVATORY_ROOT, 'patterns'),
};

// Read the governance schema
function loadSchema() {
  const schemaPath = join(OBSERVATORY_ROOT, 'CLAUDE.md');
  return existsSync(schemaPath) ? readFileSync(schemaPath, 'utf8') : '';
}

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

  // Atomic write: write to temp, then rename
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

// Determine which wiki pages need updating based on a run
function identifyAffectedPages(runData) {
  const pages = new Set();
  const { manifest, orchestrator, agentRecords } = runData;
  const ticker = manifest.controlVariables.ticker;

  // Ticker page always updated
  pages.add(`tickers/${ticker}.md`);

  // Agent profiles for all agents that participated
  for (const record of agentRecords) {
    pages.add(`agents/${record.agentRole}.md`);
  }

  // Failure mode pages if violations occurred
  if (orchestrator) {
    if (orchestrator.formatViolations?.length > 0) pages.add('failure-modes/format-violations.md');
    if (orchestrator.retries?.length > 0) pages.add('failure-modes/retries.md');
    if (orchestrator.stallsDetected?.length > 0) pages.add('failure-modes/stalls.md');
    if (orchestrator.dataGaps?.length > 0) pages.add('failure-modes/data-gaps.md');
  }

  // Verdict accuracy pattern page
  pages.add('patterns/verdict-accuracy.md');

  return Array.from(pages);
}

// Call Sonnet to update a single wiki page
async function synthesizePage(client, schema, pagePath, currentContent, runData, allRunsSummary) {
  const { manifest, orchestrator, verdictCheck, agentRecords } = runData;

  // Build a focused data summary (not the full raw data — that would blow the context)
  const runSummary = {
    runId: manifest.runId,
    ticker: manifest.controlVariables.ticker,
    stage: manifest.controlVariables.stage,
    verdict: manifest.actualVerdict,
    expectedVerdict: manifest.expectedVerdict,
    verdictMatch: manifest.verdictMatch,
    cost: manifest.pipelineMetrics.totalCost,
    duration: manifest.pipelineMetrics.totalWallTimeSeconds,
    sections: manifest.pipelineMetrics.sectionsProduced,
    errors: manifest.pipelineMetrics.errorsCount,
    formatViolations: orchestrator?.formatViolations?.length || 0,
    retries: orchestrator?.retries?.length || 0,
    dataGaps: orchestrator?.dataGaps || [],
  };

  // Agent summaries relevant to this page
  const relevantAgents = agentRecords.map(a => ({
    role: a.agentRole,
    wave: a.wave,
    sectionsProduced: a.output.sectionsProduced,
    verdicts: a.output.sections.map(s => `${s.key}: ${s.verdict}`).join(', '),
    cost: a.usage.cost,
    duration: a.timing.durationSeconds,
    criticScores: a.qualitySignals.criticScores,
    retryCount: a.qualitySignals.retryCount,
    formatValid: a.qualitySignals.formatValid,
  }));

  const prompt = `You are the Observatory wiki maintainer. Update this wiki page based on new pipeline run data.

## Schema (follow these rules exactly)
${schema}

## Page to update: ${pagePath}

## Current page content (empty if new page):
${currentContent || '(This is a new page — create it from scratch following the schema.)'}

## New run data:
${JSON.stringify(runSummary, null, 2)}

## Agent data from this run:
${JSON.stringify(relevantAgents, null, 2)}

${allRunsSummary ? `## Historical context (all prior runs summary):\n${allRunsSummary}` : ''}

## Instructions:
- Rewrite the page incorporating this new run data
- Follow the YAML frontmatter schema for this page type exactly
- Use [[wikilinks]] for all cross-references
- Update numeric summaries (runCount, avgCost, etc.)
- Add new table rows for the run history
- Keep qualitative summaries accurate to the data
- Output the COMPLETE page content (frontmatter + body), nothing else
- Do NOT wrap the output in markdown code fences — output raw markdown directly, starting with ---`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });

  let text = response.content[0]?.text || '';

  // Strip markdown code fences if the LLM wrapped the output
  if (text.startsWith('```markdown\n') || text.startsWith('```md\n') || text.startsWith('```\n')) {
    text = text.replace(/^```(?:markdown|md)?\n/, '').replace(/\n```\s*$/, '');
  }

  return text;
}

// Get a summary of all runs for historical context
function getAllRunsSummary() {
  if (!existsSync(RUNS_DIR)) return '';
  const runDirs = readdirSync(RUNS_DIR).filter(d => !d.startsWith('.')).sort();

  const summaries = [];
  for (const dir of runDirs) {
    const manifestPath = join(RUNS_DIR, dir, 'manifest.json');
    if (!existsSync(manifestPath)) continue;
    try {
      const m = JSON.parse(readFileSync(manifestPath, 'utf8'));
      summaries.push(`${m.runId}: ${m.controlVariables.ticker} ${m.controlVariables.stage} → ${m.actualVerdict || '?'} (expected: ${m.expectedVerdict || '?'}) $${m.pipelineMetrics.totalCost.toFixed(2)} ${(m.pipelineMetrics.totalWallTimeSeconds / 60).toFixed(0)}min`);
    } catch { /* skip corrupted */ }
  }

  return summaries.join('\n');
}

// Update the wiki after a single run
export async function updateWiki(runId) {
  const runData = loadRunData(runId);
  if (!runData) {
    console.warn(`Observatory synthesis: run ${runId} not found`);
    return;
  }

  const schema = loadSchema();
  const affectedPages = identifyAffectedPages(runData);
  const allRunsSummary = getAllRunsSummary();

  console.log(`\nObservatory synthesis: updating ${affectedPages.length} wiki pages...`);

  // Initialize Anthropic client
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.VITE_CLAUDE_KEY;
  if (!apiKey) {
    console.warn('Observatory synthesis: no API key found (ANTHROPIC_API_KEY or VITE_CLAUDE_KEY). Skipping wiki update.');
    return;
  }
  const client = new Anthropic({ apiKey });

  let updatedCount = 0;
  for (const pagePath of affectedPages) {
    try {
      const currentContent = readPage(pagePath);
      const newContent = await synthesizePage(client, schema, pagePath, currentContent, runData, allRunsSummary);

      if (newContent && newContent.trim().length > 50) {
        writePage(pagePath, newContent);
        updatedCount++;
        console.log(`  Updated: ${pagePath}`);
      } else {
        console.warn(`  Skipped (empty response): ${pagePath}`);
      }
    } catch (err) {
      console.warn(`  Failed: ${pagePath} — ${err.message}`);
    }
  }

  // Append wiki update event to log.md
  try {
    const logPath = join(OBSERVATORY_ROOT, 'log.md');
    const pagesStr = affectedPages.map(p => `[[${p.replace('.md', '')}]]`).join(', ');
    const entry = `\n## [${new Date().toISOString().slice(0, 10)}] wiki-update | ${updatedCount} pages updated\n- Updated: ${pagesStr}\n`;
    const currentLog = existsSync(logPath) ? readFileSync(logPath, 'utf8') : '';
    writeFileSync(logPath, currentLog + entry);
  } catch { /* non-critical */ }

  // Update index.md
  try {
    updateIndex();
  } catch (err) {
    console.warn(`  Index update failed: ${err.message}`);
  }

  console.log(`Observatory synthesis complete: ${updatedCount}/${affectedPages.length} pages updated.`);
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

  // Scan each wiki directory
  for (const [category, dir] of Object.entries(WIKI_DIRS)) {
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir).filter(f => f.endsWith('.md'))) {
      const name = file.replace('.md', '');
      const dirName = relative(OBSERVATORY_ROOT, dir);
      const link = `[[${dirName}/${name}]]`;

      // Read first line of content after frontmatter for description
      let description = '';
      try {
        const content = readFileSync(join(dir, file), 'utf8');
        const bodyStart = content.indexOf('---', content.indexOf('---') + 3);
        if (bodyStart > 0) {
          const body = content.slice(bodyStart + 3).trim();
          const firstHeading = body.match(/^#+ (.+)/m);
          description = firstHeading ? firstHeading[1] : name;
        }
      } catch { description = name; }

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

  // Add static entries
  sections['Prompt Versions'] = ['- [[prompt-versions/changelog]] — All prompt changes with measured impact'];
  sections['Experiments'] = ['- [[experiments/doe-log]] — Formal DOE experiment tracking'];

  // Build index content
  let index = '# Observatory Index\n\n> Pipeline observability wiki for Thes1s agent team optimization.\n> Updated automatically after each pipeline run by the LLM synthesizer.\n\n';
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

// Batch synthesis: process all runs chronologically (post-sprint)
export async function synthesizeAll() {
  if (!existsSync(RUNS_DIR)) {
    console.log('No runs found.');
    return;
  }

  const runDirs = readdirSync(RUNS_DIR).filter(d => !d.startsWith('.')).sort();
  console.log(`Batch synthesis: processing ${runDirs.length} runs...`);

  for (const dir of runDirs) {
    console.log(`\nProcessing: ${dir}`);
    await updateWiki(dir);
  }

  console.log(`\nBatch synthesis complete. ${runDirs.length} runs processed.`);
}
