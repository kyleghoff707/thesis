#!/usr/bin/env node
// Observatory Lint — validates wiki consistency against raw run data.
// Runs 8 checks and outputs a structured report.
//
// Usage: node scripts/observatory-lint.js [--fix]

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';

const ROOT = join(process.cwd(), 'observatory');
const RUNS_DIR = join(ROOT, 'runs');
const fix = process.argv.includes('--fix');

const findings = [];
function report(severity, check, message) {
  findings.push({ severity, check, message });
  const icon = severity === 'error' ? 'x' : severity === 'warning' ? '!' : '-';
  console.log(`  [${icon}] ${message}`);
}

// Parse YAML frontmatter from a markdown file
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  try { return parseYaml(match[1]); } catch { return null; }
}

// Find all .md files in a directory (non-recursive)
function findPages(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(f => f.endsWith('.md')).map(f => join(dir, f));
}

// Find all [[wikilinks]] in content
function extractWikilinks(content) {
  const links = [];
  const re = /\[\[([^\]]+)\]\]/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    links.push(m[1]);
  }
  return links;
}

// Load all run manifests
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

// ─── Check 1: Frontmatter Schema Validation ───────────────────────
function check1_frontmatter() {
  console.log('\n1. Frontmatter schema validation');
  const requiredByType = {
    'agent-profile': ['type', 'agentRole', 'lastUpdated', 'runCount', 'tags'],
    'ticker-page': ['type', 'ticker', 'lastUpdated', 'runCount', 'tags'],
    'failure-mode': ['type', 'mode', 'lastUpdated', 'severity', 'tags'],
    'pattern': ['type', 'pattern', 'lastUpdated', 'tags'],
    'prompt-changelog': ['type', 'lastUpdated', 'tags'],
    'doe-log': ['type', 'lastUpdated', 'tags'],
  };

  const dirs = ['agents', 'tickers', 'failure-modes', 'patterns', 'prompt-versions', 'experiments'];
  for (const dir of dirs) {
    for (const page of findPages(join(ROOT, dir))) {
      const content = readFileSync(page, 'utf8');
      const fm = parseFrontmatter(content);
      const relPath = page.replace(ROOT + '/', '');

      if (!fm) {
        report('error', 1, `${relPath}: missing or invalid frontmatter`);
        continue;
      }

      const required = requiredByType[fm.type];
      if (!required) {
        report('warning', 1, `${relPath}: unknown page type "${fm.type}"`);
        continue;
      }

      for (const field of required) {
        if (fm[field] === undefined || fm[field] === null) {
          report('error', 1, `${relPath}: missing required field "${field}"`);
        }
      }
    }
  }
}

// ─── Check 2: Cross-reference Integrity ───────────────────────────
function check2_crossrefs() {
  console.log('\n2. Cross-reference integrity');
  const dirs = ['agents', 'tickers', 'failure-modes', 'patterns', 'prompt-versions', 'experiments'];

  for (const dir of dirs) {
    for (const page of findPages(join(ROOT, dir))) {
      const content = readFileSync(page, 'utf8');
      const links = extractWikilinks(content);
      const relPath = page.replace(ROOT + '/', '');

      for (const link of links) {
        const targetPath = join(ROOT, link + '.md');
        if (!existsSync(targetPath)) {
          report('warning', 2, `${relPath}: broken [[${link}]] — file not found`);
        }
      }
    }
  }
}

// ─── Check 3: Run Count Consistency ───────────────────────────────
function check3_runCounts() {
  console.log('\n3. Run count consistency');
  const manifests = loadManifests();

  // Agent run counts
  const agentRunCounts = {};
  for (const m of manifests) {
    const agentsDir = join(RUNS_DIR, m.runId, 'agents');
    if (!existsSync(agentsDir)) continue;
    for (const file of readdirSync(agentsDir).filter(f => f.endsWith('.json'))) {
      try {
        const record = JSON.parse(readFileSync(join(agentsDir, file), 'utf8'));
        const role = record.agentRole;
        agentRunCounts[role] = (agentRunCounts[role] || 0) + 1;
      } catch { /* skip */ }
    }
  }

  for (const page of findPages(join(ROOT, 'agents'))) {
    const content = readFileSync(page, 'utf8');
    const fm = parseFrontmatter(content);
    if (!fm?.agentRole || fm.runCount === undefined) continue;

    const actual = agentRunCounts[fm.agentRole] || 0;
    if (fm.runCount !== actual) {
      report('warning', 3, `agents/${fm.agentRole}.md: runCount=${fm.runCount}, actual=${actual}`);
    }
  }

  // Ticker run counts
  const tickerRunCounts = {};
  for (const m of manifests) {
    const t = m.controlVariables.ticker;
    tickerRunCounts[t] = (tickerRunCounts[t] || 0) + 1;
  }

  for (const page of findPages(join(ROOT, 'tickers'))) {
    const content = readFileSync(page, 'utf8');
    const fm = parseFrontmatter(content);
    if (!fm?.ticker || fm.runCount === undefined) continue;

    const actual = tickerRunCounts[fm.ticker] || 0;
    if (fm.runCount !== actual) {
      report('warning', 3, `tickers/${fm.ticker}.md: runCount=${fm.runCount}, actual=${actual}`);
    }
  }
}

// ─── Check 4: Numeric Accuracy ────────────────────────────────────
function check4_numerics() {
  console.log('\n4. Numeric accuracy (avgCost, avgDuration)');
  // Recompute from raw data and compare to frontmatter values
  const manifests = loadManifests();

  for (const page of findPages(join(ROOT, 'agents'))) {
    const content = readFileSync(page, 'utf8');
    const fm = parseFrontmatter(content);
    if (!fm?.agentRole || !fm.avgCost) continue;

    // Find all agent records for this role
    let totalCost = 0, count = 0;
    for (const m of manifests) {
      const agentsDir = join(RUNS_DIR, m.runId, 'agents');
      if (!existsSync(agentsDir)) continue;
      for (const file of readdirSync(agentsDir).filter(f => f.includes(fm.agentRole))) {
        try {
          const record = JSON.parse(readFileSync(join(agentsDir, file), 'utf8'));
          totalCost += record.usage.cost || 0;
          count++;
        } catch { /* skip */ }
      }
    }

    if (count > 0) {
      const actualAvg = totalCost / count;
      const drift = Math.abs(actualAvg - fm.avgCost) / fm.avgCost;
      if (drift > 0.05) {
        report('warning', 4, `agents/${fm.agentRole}.md: avgCost=${fm.avgCost}, actual=${actualAvg.toFixed(2)} (${(drift * 100).toFixed(0)}% drift)`);
      }
    }
  }
}

// ─── Check 5: Verdict History Consistency ─────────────────────────
function check5_verdictHistory() {
  console.log('\n5. Verdict history consistency');
  const manifests = loadManifests();

  for (const page of findPages(join(ROOT, 'tickers'))) {
    const content = readFileSync(page, 'utf8');
    const fm = parseFrontmatter(content);
    if (!fm?.ticker || !fm.verdictHistory) continue;

    const actual = manifests
      .filter(m => m.controlVariables.ticker === fm.ticker)
      .map(m => m.actualVerdict || 'unknown');

    if (JSON.stringify(fm.verdictHistory) !== JSON.stringify(actual)) {
      report('warning', 5, `tickers/${fm.ticker}.md: verdictHistory mismatch — wiki has ${fm.verdictHistory.length} entries, runs have ${actual.length}`);
    }
  }
}

// ─── Check 6: Log Completeness ────────────────────────────────────
function check6_logCompleteness() {
  console.log('\n6. Log completeness');
  const logPath = join(ROOT, 'log.md');
  const logContent = existsSync(logPath) ? readFileSync(logPath, 'utf8') : '';
  const manifests = loadManifests();

  for (const m of manifests) {
    if (!logContent.includes(m.runId)) {
      report('warning', 6, `Run ${m.runId} not found in log.md`);
    }
  }
}

// ─── Check 7: Stale Page Detection ───────────────────────────────
function check7_stalePages() {
  console.log('\n7. Stale page detection');
  const manifests = loadManifests();
  const runCount = manifests.length;
  if (runCount < 10) return; // Not enough data to judge staleness

  const dirs = ['agents', 'tickers', 'failure-modes', 'patterns'];
  for (const dir of dirs) {
    for (const page of findPages(join(ROOT, dir))) {
      const content = readFileSync(page, 'utf8');
      const fm = parseFrontmatter(content);
      if (!fm?.lastUpdated) continue;

      const lastUpdate = new Date(fm.lastUpdated);
      const latestRun = new Date(manifests[manifests.length - 1].completedAt || manifests[manifests.length - 1].timestamp);
      const daysSinceUpdate = (latestRun - lastUpdate) / (1000 * 60 * 60 * 24);

      if (daysSinceUpdate > 7) {
        const relPath = page.replace(ROOT + '/', '');
        report('info', 7, `${relPath}: last updated ${daysSinceUpdate.toFixed(0)} days ago`);
      }
    }
  }
}

// ─── Check 8: Failure Mode Coverage ──────────────────────────────
function check8_failureCoverage() {
  console.log('\n8. Failure mode coverage');
  const manifests = loadManifests();
  const knownModes = new Set();

  for (const page of findPages(join(ROOT, 'failure-modes'))) {
    const content = readFileSync(page, 'utf8');
    const fm = parseFrontmatter(content);
    if (fm?.mode) knownModes.add(fm.mode);
  }

  const uncovered = new Set();
  for (const m of manifests) {
    const orchPath = join(RUNS_DIR, m.runId, 'orchestrator.json');
    if (!existsSync(orchPath)) continue;
    try {
      const orch = JSON.parse(readFileSync(orchPath, 'utf8'));
      for (const v of (orch.formatViolations || [])) {
        if (!knownModes.has(v.violation) && !knownModes.has('format-violations')) {
          uncovered.add(v.violation);
        }
      }
      if (orch.retries?.length > 0 && !knownModes.has('retries')) uncovered.add('retries');
      if (orch.stallsDetected?.length > 0 && !knownModes.has('stalls')) uncovered.add('stalls');
      if (orch.dataGaps?.length > 0 && !knownModes.has('data-gaps')) uncovered.add('data-gaps');
    } catch { /* skip */ }
  }

  for (const mode of uncovered) {
    report('info', 8, `Uncovered failure mode: "${mode}" — consider creating failure-modes/${mode}.md`);
  }
}

// ─── Run All Checks ──────────────────────────────────────────────
console.log('Observatory Lint Report');
console.log('='.repeat(40));

check1_frontmatter();
check2_crossrefs();
check3_runCounts();
check4_numerics();
check5_verdictHistory();
check6_logCompleteness();
check7_stalePages();
check8_failureCoverage();

// Summary
const errors = findings.filter(f => f.severity === 'error').length;
const warnings = findings.filter(f => f.severity === 'warning').length;
const infos = findings.filter(f => f.severity === 'info').length;

console.log(`\n${'='.repeat(40)}`);
console.log(`Results: ${errors} errors, ${warnings} warnings, ${infos} info`);

if (errors > 0) {
  console.log('\nErrors must be fixed before wiki is reliable.');
  process.exit(1);
}
if (warnings > 0) {
  console.log('\nWarnings indicate wiki drift — run synthesis to correct.');
}

process.exit(0);
