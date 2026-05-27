#!/usr/bin/env node
// Update ~/thesis/reports/{TICKER}/generation-status.json
//
// Usage: node scripts/update-status.js TICKER STAGE STATE [VERDICT]
//   STAGE:  onePager | pitchDeck | finalThesis
//   STATE:  IN_PROGRESS | DATA_PREP | COMPLETED | FAILED
//
// Preserves startedAt across calls; always refreshes updatedAt. If VERDICT
// is supplied, it is stored as lastVerdict.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { normalizeTicker } from '../src/utils/ticker.js';

const [, , rawTicker, stage, state, ...verdictParts] = process.argv;
if (!rawTicker || !stage || !state) {
  console.error('Usage: update-status.js TICKER STAGE STATE [VERDICT]');
  process.exit(1);
}

let ticker;
try {
  ticker = normalizeTicker(rawTicker);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
const reportDir = join(homedir(), 'thesis', 'reports', ticker);
if (!existsSync(reportDir)) mkdirSync(reportDir, { recursive: true });

const statusPath = join(reportDir, 'generation-status.json');
let existing = {};
try { existing = JSON.parse(readFileSync(statusPath, 'utf8')); } catch {}

const now = new Date().toISOString();
const status = {
  ticker,
  stage,
  state,
  startedAt: existing.startedAt || now,
  updatedAt: now,
};
if (verdictParts.length) status.lastVerdict = verdictParts.join(' ');
else if (existing.lastVerdict) status.lastVerdict = existing.lastVerdict;

writeFileSync(statusPath, JSON.stringify(status, null, 2) + '\n');
console.log(`Status: ${ticker} -> ${stage}/${state}${status.lastVerdict ? ' (' + status.lastVerdict + ')' : ''}`);
