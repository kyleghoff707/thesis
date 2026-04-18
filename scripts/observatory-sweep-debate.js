#!/usr/bin/env node
// Observatory Debate Sweep — script-driven file-evidence checks for fullStory runs.
// Reads saved debate artifacts and emits format-violation events for patterns that
// the orchestrator systematically misses (clean-run bias, frame-bucketing).
//
// Sources tried in order: archive/{RUN_ID}/, sections/, then full-story.json .debate.*
// Stage inferred from RUN_ID suffix; non-fullStory stages are no-ops.
//
// Usage: node scripts/observatory-sweep-debate.js RUN_ID TICKER

import { readFileSync, existsSync, statSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const [, , runId, ticker] = process.argv;
if (!runId || !ticker) {
  console.error('Usage: node scripts/observatory-sweep-debate.js RUN_ID TICKER');
  process.exit(1);
}

if (!runId.endsWith('-fullStory')) {
  console.log(`Observatory sweep: skipped — ${runId} is not a fullStory run`);
  process.exit(0);
}

const ROOT = process.cwd();
const ARCHIVE = join(ROOT, '.thes1s/reports', ticker, 'archive', runId);
const SECTIONS = join(ROOT, '.thes1s/reports', ticker, 'sections');
const FULL_STORY = join(ROOT, '.thes1s/reports', ticker, 'full-story.json');

// Resolve artifact for a given debate role; returns {content, sizeBytes, source} or null.
function loadDebateStep(stepNum, role) {
  const filename = `debate-step-${stepNum}-${role}.json`;
  for (const dir of [ARCHIVE, SECTIONS]) {
    const path = join(dir, filename);
    if (existsSync(path)) {
      const raw = readFileSync(path, 'utf8');
      const sizeBytes = statSync(path).size;
      try {
        const parsed = JSON.parse(raw);
        return { parsed, raw, sizeBytes, source: path };
      } catch {
        return { parsed: null, raw, sizeBytes, source: path };
      }
    }
  }
  // Fallback: extract from full-story.json
  if (existsSync(FULL_STORY)) {
    try {
      const fs = JSON.parse(readFileSync(FULL_STORY, 'utf8'));
      const key = `step${stepNum}_${role}`;
      if (fs.debate?.[key]) {
        const inner = fs.debate[key];
        const raw = JSON.stringify(inner);
        return { parsed: inner, raw, sizeBytes: raw.length, source: `${FULL_STORY}#debate.${key}` };
      }
    } catch {}
  }
  return null;
}

function recordViolation(agent, violation) {
  try {
    execSync(
      `node scripts/observatory-record-event.js ${runId} format-violation ` +
      `--agent ${JSON.stringify(agent)} --violation ${JSON.stringify(violation)} --fix-applied false`,
      { stdio: ['ignore', 'ignore', 'inherit'] }
    );
  } catch (err) {
    console.error(`  failed to record: ${agent} — ${violation}`);
  }
}

// Counters
const counts = { bullConcessions: 0, schemaDrift: 0, miscount: 0, stubs: 0, fenceWrap: 0 };

// ---- Rule 5/6: stub size + markdown fence wrap (all 4 debate steps) ----
const STEPS = [[1, 'bull'], [2, 'bear'], [3, 'rebuttal'], [4, 'judge']];
const ROLE_AGENT = {
  bull: 'synthesis-writer-bull',
  bear: 'risk-analyst-bear',
  rebuttal: 'synthesis-writer-rebuttal',
  judge: 'financial-analyst-judge',
};
for (const [n, role] of STEPS) {
  const step = loadDebateStep(n, role);
  if (!step) continue;
  if (step.sizeBytes < 2048) {
    recordViolation(ROLE_AGENT[role], `stub output (${step.sizeBytes} bytes) for debate-step-${n}-${role}`);
    counts.stubs++;
  }
  const trimmed = step.raw.trimStart();
  if (trimmed.startsWith('```')) {
    recordViolation(ROLE_AGENT[role], `markdown fence wrap survived save in debate-step-${n}-${role}`);
    counts.fenceWrap++;
  }
}

// ---- Rule 1/2: rebuttal concessions (weak strength + acknowledged factual errors) ----
const reb = loadDebateStep(3, 'rebuttal');
if (reb?.parsed) {
  const exchanges = reb.parsed.content?.rebuttals ?? reb.parsed.rebuttals ?? [];
  const concessionRegex = /(the bear correctly caught|the bear correctly noted|factual error|bull (?:cited|claimed|stated) .{0,80}(?:incorrect|cut|raised|wrong))/i;
  exchanges.forEach((ex, idx) => {
    const strength = (ex.rebuttalStrength ?? ex.strength ?? '').toLowerCase();
    const id = ex.pointNumber ?? ex.rebuttalId ?? idx + 1;
    if (strength === 'weak') {
      recordViolation('synthesis-writer-bull', `bull point ${id} conceded weak in rebuttal`);
      counts.bullConcessions++;
    }
    // Search the actual rebuttal narrative field for factual-error acknowledgments
    const narrative = ex.bullRebuttal ?? ex.rebuttal ?? ex.bull_rebuttal ?? '';
    const concession = ex.acknowledgedConcession ?? ex.concession ?? ex.acknowledgment ?? '';
    const text = `${narrative} ${concession}`;
    const match = concessionRegex.exec(text);
    if (match) {
      const start = Math.max(0, match.index - 20);
      const snippet = text.slice(start, match.index + 180).replace(/\s+/g, ' ').trim().slice(0, 200);
      recordViolation('synthesis-writer-bull', `bull factual error acknowledged in rebuttal point ${id}: ${snippet}`);
      counts.bullConcessions++;
    }
  });
}

// ---- Rule 3/4: judge schema drift + scoreboard miscount ----
const judge = loadDebateStep(4, 'judge');
if (judge?.parsed) {
  const exchanges = judge.parsed.content?.exchanges ?? [];
  if (exchanges.length > 0) {
    const driftCount = exchanges.filter(
      (ex) => ex.judgeScore == null || ex.pointNumber == null
    ).length;
    if (driftCount > 0) {
      recordViolation(
        'financial-analyst-judge',
        `judge schema drift: ${driftCount}/${exchanges.length} exchanges missing judgeScore or pointNumber`
      );
      counts.schemaDrift++;
    }
    // Scoreboard sum check — try multiple paths
    const sb =
      judge.parsed.content?.scoreboard ??
      judge.parsed.content?.overallVerdict?.scoreboard ??
      (judge.parsed.content?.overallVerdict?.strongBullCount != null
        ? {
            strongBull: judge.parsed.content.overallVerdict.strongBullCount,
            strongBear: judge.parsed.content.overallVerdict.strongBearCount,
            unresolved: judge.parsed.content.overallVerdict.unresolvedCount,
          }
        : null);
    if (sb) {
      const sum = (sb.strongBull ?? 0) + (sb.strongBear ?? 0) + (sb.unresolved ?? 0);
      if (sum !== exchanges.length) {
        recordViolation(
          'financial-analyst-judge',
          `judge scoreboard miscount: ${sb.strongBull ?? 0}+${sb.strongBear ?? 0}+${sb.unresolved ?? 0}=${sum}, exchanges has ${exchanges.length}`
        );
        counts.miscount++;
      }
    } else {
      recordViolation(
        'financial-analyst-judge',
        `judge schema drift: no scoreboard present (expected content.scoreboard or overallVerdict.{strongBullCount,strongBearCount,unresolvedCount})`
      );
      counts.schemaDrift++;
    }
  }
}

const total = Object.values(counts).reduce((a, b) => a + b, 0);
console.log(
  `Observatory sweep: logged ${total} events ` +
  `(${counts.bullConcessions} bull-concessions, ${counts.schemaDrift} schema-drifts, ` +
  `${counts.miscount} miscounts, ${counts.stubs} stubs, ${counts.fenceWrap} fence-wraps)`
);
