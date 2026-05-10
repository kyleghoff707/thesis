#!/usr/bin/env node
// sync-agent-yamls.mjs
//
// Regenerate managed-agent.yaml files from their paired prompt.md files.
// Approach: text surgery on the original YAML — replace ONLY the `system: |-` block
// and the `model:` line. Everything else (tools, callable_agents, comments, formatting)
// stays byte-identical. This preserves the wave-grouping comments in coordinator YAMLs.
//
// Usage:
//   node scripts/sync-agent-yamls.mjs            # dry run — writes to agents/.staging-sync/
//   node scripts/sync-agent-yamls.mjs --check    # verify staging files match prompt.md content
//   node scripts/sync-agent-yamls.mjs --commit   # overwrites real YAMLs (auto-stages + checks first)
//
// Scope: 12 platform-deployed agents only. Final Thesis agents (*-finalthesis/, coordinator-finalthesis)
// are intentionally not synced — their platform agents don't exist yet.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const AGENTS_DIR = join(ROOT, 'agents');
const STAGING_DIR = join(AGENTS_DIR, '.staging-sync');

const IN_SCOPE_AGENTS = [
  'one-pager',
  'coordinator-pitchdeck',
  'annual-reader',
  'quarterly-reader',
  'business-analyst-pitchdeck',
  'competitor-evaluator-market-position-pitchdeck',
  'competitor-evaluator-moats-pitchdeck',
  'financial-analyst-pitchdeck',
  'management-evaluator-pitchdeck',
  'risk-analyst-pitchdeck',
  'valuation-specialist-pitchdeck',
  'synthesis-writer-pitchdeck',
];

const FORCED_MODEL = 'claude-sonnet-4-6';
const COORDINATOR_AGENTS = new Set(['coordinator-pitchdeck']);

const args = process.argv.slice(2);
const COMMIT = args.includes('--commit');
const CHECK = args.includes('--check');

// ─────────────────────────────────────────────────────────────
// Text surgery: replace system: |- block and model: line
// ─────────────────────────────────────────────────────────────

function replaceModelLine(yamlText, newModel) {
  // Match `model: <value>` at beginning of line (top-level field)
  const modelRegex = /^model:\s*.+$/m;
  if (!modelRegex.test(yamlText)) {
    throw new Error('No top-level `model:` line found');
  }
  return yamlText.replace(modelRegex, `model: ${newModel}`);
}

function replaceSystemBlock(yamlText, newPromptContent) {
  // The system: |- block has this structure:
  //   system: |-
  //     content line 1
  //     content line 2
  //     ...
  //   <next-field>:    <-- zero-indent line ends the block
  //
  // Strategy: find "system: |-" line, then consume all subsequent lines that are
  // either blank or start with at least 2 spaces (the block scalar indent). Stop
  // at the first non-blank line with <2 leading spaces.

  const lines = yamlText.split('\n');
  let startIdx = -1;
  let endIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    if (/^system:\s*\|-?\s*$/.test(lines[i])) {
      startIdx = i;
      break;
    }
  }
  if (startIdx === -1) throw new Error('No `system: |-` block found');

  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line === '' || /^\s/.test(line)) continue;
    // Non-indented, non-blank line — block ended
    endIdx = i - 1;
    break;
  }
  if (endIdx === -1) endIdx = lines.length - 1; // block runs to EOF

  // Determine the indent used in the existing block (should be 2 spaces for standard YAML)
  let indent = '  ';
  for (let i = startIdx + 1; i <= endIdx; i++) {
    const match = lines[i].match(/^(\s+)\S/);
    if (match) { indent = match[1]; break; }
  }

  // Build replacement lines
  const promptLines = newPromptContent.trimEnd().split('\n');
  const newSystemLines = [
    'system: |-',
    ...promptLines.map(line => (line === '' ? '' : indent + line)),
  ];

  const before = lines.slice(0, startIdx);
  const after = lines.slice(endIdx + 1);
  return [...before, ...newSystemLines, ...after].join('\n');
}

// ─────────────────────────────────────────────────────────────
// File I/O
// ─────────────────────────────────────────────────────────────

function readYamlRaw(agentDir) {
  return readFileSync(join(AGENTS_DIR, agentDir, 'managed-agent.yaml'), 'utf8');
}

function readPrompt(agentDir) {
  return readFileSync(join(AGENTS_DIR, agentDir, 'prompt.md'), 'utf8');
}

function regenerate(agentDir) {
  const originalYaml = readYamlRaw(agentDir);
  const prompt = readPrompt(agentDir);

  let regenerated = replaceModelLine(originalYaml, FORCED_MODEL);
  regenerated = replaceSystemBlock(regenerated, prompt);
  return { regenerated, original: originalYaml, prompt };
}

function writeStaging(agentDir, text) {
  if (!existsSync(STAGING_DIR)) mkdirSync(STAGING_DIR, { recursive: true });
  writeFileSync(join(STAGING_DIR, `${agentDir}.yaml`), text);
}

function commitStaging(agentDir) {
  const stagingPath = join(STAGING_DIR, `${agentDir}.yaml`);
  const realPath = join(AGENTS_DIR, agentDir, 'managed-agent.yaml');
  writeFileSync(realPath, readFileSync(stagingPath, 'utf8'));
}

// ─────────────────────────────────────────────────────────────
// Verification
// ─────────────────────────────────────────────────────────────

function checkStaging(agentDir) {
  const stagingPath = join(STAGING_DIR, `${agentDir}.yaml`);
  if (!existsSync(stagingPath)) {
    return { ok: false, issues: ['staging file not found — run without --check first'] };
  }
  const text = readFileSync(stagingPath, 'utf8');

  let parsed;
  try {
    parsed = yaml.load(text);
  } catch (e) {
    return { ok: false, issues: [`YAML parse error: ${e.message}`] };
  }

  const prompt = readPrompt(agentDir).trimEnd();
  const issues = [];

  if (parsed.system !== prompt) {
    issues.push(`system field does not match prompt.md byte-for-byte (system len=${parsed.system?.length ?? 0}, prompt len=${prompt.length})`);
  }
  if (parsed.model !== FORCED_MODEL) {
    issues.push(`model is ${parsed.model}, expected ${FORCED_MODEL}`);
  }
  if (typeof parsed.system !== 'string' || parsed.system.length < 100) {
    issues.push('system field missing or too short');
  }
  if (!parsed.name) issues.push('name field missing');
  if (!parsed.description) issues.push('description field missing');

  if (COORDINATOR_AGENTS.has(agentDir)) {
    if (!Array.isArray(parsed.callable_agents) || parsed.callable_agents.length !== 10) {
      issues.push(`callable_agents expected 10 entries, got ${parsed.callable_agents?.length ?? 0}`);
    }
  }

  // Check comment preservation on coordinator (looking for "# Wave" in raw text)
  if (COORDINATOR_AGENTS.has(agentDir)) {
    const originalRaw = readYamlRaw(agentDir);
    const originalWaveComments = (originalRaw.match(/#\s*Wave\s*\d/g) || []).length;
    const stagedWaveComments = (text.match(/#\s*Wave\s*\d/g) || []).length;
    if (stagedWaveComments < originalWaveComments) {
      issues.push(`callable_agents wave comments lost (original had ${originalWaveComments}, staged has ${stagedWaveComments})`);
    }
  }

  return { ok: issues.length === 0, issues };
}

function diffSummary(oldText, newText) {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  return { oldLines: oldLines.length, newLines: newLines.length, delta: newLines.length - oldLines.length };
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────

function main() {
  console.log(`\n=== Agent YAML Sync (${COMMIT ? 'COMMIT' : CHECK ? 'CHECK' : 'DRY-RUN'}) ===\n`);
  console.log(`Scope: ${IN_SCOPE_AGENTS.length} agents | Forced model: ${FORCED_MODEL}\n`);

  let allOk = true;

  for (const agentDir of IN_SCOPE_AGENTS) {
    try {
      if (CHECK) {
        const { ok, issues } = checkStaging(agentDir);
        if (!ok) allOk = false;
        console.log(`[${ok ? '✓' : '✗'}] ${agentDir}${issues.length ? ' — ' + issues.join('; ') : ''}`);
        continue;
      }

      const { regenerated, original } = regenerate(agentDir);
      const diff = diffSummary(original, regenerated);
      const originalModel = original.match(/^model:\s*(\S+)/m)?.[1] || 'unknown';
      const modelFlip = originalModel !== FORCED_MODEL ? ` (${originalModel} → ${FORCED_MODEL})` : '';

      if (COMMIT) {
        writeStaging(agentDir, regenerated);
        const { ok, issues } = checkStaging(agentDir);
        if (!ok) {
          allOk = false;
          console.log(`[✗] ${agentDir} — check failed: ${issues.join('; ')}`);
          continue;
        }
        commitStaging(agentDir);
        console.log(`[commit] ${agentDir} — Δ ${diff.delta > 0 ? '+' : ''}${diff.delta} lines${modelFlip}`);
      } else {
        writeStaging(agentDir, regenerated);
        console.log(`[stage] ${agentDir} — Δ ${diff.delta > 0 ? '+' : ''}${diff.delta} lines${modelFlip}`);
      }
    } catch (e) {
      allOk = false;
      console.log(`[✗] ${agentDir} — ERROR: ${e.message}`);
    }
  }

  console.log('');
  if (CHECK) {
    console.log(allOk ? '✓ All staging files pass checks.' : '✗ Some staging files failed checks.');
  } else if (COMMIT) {
    console.log(allOk ? '✓ All YAMLs committed. Review `git diff` before git commit.' : '✗ Partial commit.');
  } else {
    console.log(`Staging complete. Next:`);
    console.log(`  node scripts/sync-agent-yamls.mjs --check`);
    console.log(`  node scripts/sync-agent-yamls.mjs --commit`);
  }

  process.exit(allOk ? 0 : 1);
}

main();
