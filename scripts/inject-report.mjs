#!/usr/bin/env node
// Injects locally-generated pipeline reports into a Thes1s user's account via
// the admin HTTP API. Reads .thes1s/reports/{TICKER}/{one-pager,pitch-deck,full-story}.json
// and POSTs them to /admin/inject-report on api.thes1sinvesting.com.
//
// Usage:
//   node scripts/inject-report.mjs --ticker INTU --ticker NOW
//   node scripts/inject-report.mjs --ticker INTU --email someone@example.com
//   node scripts/inject-report.mjs --ticker INTU --stages onePager,pitchDeck
//   node scripts/inject-report.mjs --ticker INTU --api http://localhost:8787
//
// Flags:
//   --ticker,-t    Ticker to inject (repeatable). Required.
//   --email,-e     Target user's email (the account to inject into). Default: kyleghoff707@gmail.com
//   --stages       Comma list of stages. Default: onePager,pitchDeck,fullStory
//   --api          API base URL. Default: https://api.thes1sinvesting.com
//   --admin-email  Admin login email. Default: $THES1S_ADMIN_EMAIL or --email
//   --password,-p  Admin password. Default: $THES1S_ADMIN_PASSWORD (prompted if missing).
//   --help,-h      Show this help.
//
// The caller MUST be an admin (role='admin'). Non-admins get 403.

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const PROJECT_ROOT = resolve(import.meta.dirname, '..');
const REPORTS_DIR = resolve(PROJECT_ROOT, '.thes1s/reports');

const STAGE_FILES = {
  onePager: 'one-pager.json',
  pitchDeck: 'pitch-deck.json',
  fullStory: 'full-story.json',
};
const VALID_STAGES = Object.keys(STAGE_FILES);

function printHelp() {
  const src = readFileSync(new URL(import.meta.url), 'utf8');
  console.log(src.split('\n').filter(l => l.startsWith('//')).slice(0, 23).join('\n'));
}

function parseArgs(argv) {
  const args = {
    tickers: [],
    email: 'kyleghoff707@gmail.com',
    stages: VALID_STAGES,
    api: 'https://api.thes1sinvesting.com',
    adminEmail: process.env.THES1S_ADMIN_EMAIL || null,
    password: process.env.THES1S_ADMIN_PASSWORD || null,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--ticker' || a === '-t') args.tickers.push(String(argv[++i]).toUpperCase());
    else if (a === '--email' || a === '-e') args.email = argv[++i];
    else if (a === '--stages') args.stages = argv[++i].split(',').map(s => s.trim()).filter(Boolean);
    else if (a === '--api') args.api = argv[++i].replace(/\/$/, '');
    else if (a === '--admin-email') args.adminEmail = argv[++i];
    else if (a === '--password' || a === '-p') args.password = argv[++i];
    else if (a === '--help' || a === '-h') { printHelp(); process.exit(0); }
    else { console.error(`Unknown argument: ${a}`); process.exit(1); }
  }
  if (args.tickers.length === 0) { printHelp(); process.exit(1); }
  for (const s of args.stages) {
    if (!VALID_STAGES.includes(s)) {
      console.error(`Invalid stage: ${s}. Must be one of ${VALID_STAGES.join(', ')}`);
      process.exit(1);
    }
  }
  if (!args.adminEmail) args.adminEmail = 'kyleghoff707@gmail.com';
  return args;
}

async function promptPassword(label) {
  const rl = createInterface({ input: stdin, output: stdout, terminal: true });
  const answer = await rl.question(`${label}: `);
  rl.close();
  return answer.trim();
}

// Resolve the path to a stage JSON for a ticker. Tries working dir first
// (.thes1s/reports/{TICKER}/{file}.json), then the newest matching archive dir
// (.thes1s/reports/{TICKER}/archive/YYYYMMDD-HHMMSS-{TICKER}-{stage}/{file}.json).
// Archive dir names sort lexicographically = chronologically, so the max-named
// dir is the most recent run for that stage.
function resolveStagePath(ticker, stage) {
  const filename = STAGE_FILES[stage];
  const working = resolve(REPORTS_DIR, ticker, filename);
  if (existsSync(working)) return { path: working, source: 'working' };

  const archiveRoot = resolve(REPORTS_DIR, ticker, 'archive');
  if (!existsSync(archiveRoot)) return null;

  let entries;
  try {
    entries = readdirSync(archiveRoot);
  } catch {
    return null;
  }
  const suffix = `-${ticker}-${stage}`;
  const matching = entries.filter(e => e.endsWith(suffix)).sort();
  for (const dir of matching.reverse()) {
    const candidate = resolve(archiveRoot, dir, filename);
    if (existsSync(candidate)) return { path: candidate, source: `archive/${dir}` };
  }
  return null;
}

function loadStage(ticker, stage) {
  const found = resolveStagePath(ticker, stage);
  if (!found) return null;
  try {
    const raw = JSON.parse(readFileSync(found.path, 'utf8'));
    if (!Array.isArray(raw?.sections) || raw.sections.length === 0) {
      console.warn(`  [${ticker}] ${stage}: ${found.source} has no sections — skipping`);
      return null;
    }
    console.log(`  [${ticker}] ${stage}: loaded from ${found.source}`);
    return raw;
  } catch (err) {
    console.warn(`  [${ticker}] ${stage}: failed to parse ${found.source} — ${err.message}`);
    return null;
  }
}

async function login(api, email, password) {
  const res = await fetch(`${api}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Login failed (${res.status}): ${body}`);
  }
  const setCookie = res.headers.get('Set-Cookie') || '';
  const match = setCookie.match(/session=([^;]+)/);
  if (!match) throw new Error('Login succeeded but no session cookie in response');
  const { user } = await res.json();
  return { cookie: `session=${match[1]}`, user };
}

async function injectOne({ api, cookie, targetEmail, ticker, stageData }) {
  const companyName = stageData.onePager?.companyName ||
    stageData.pitchDeck?.companyName ||
    stageData.fullStory?.companyName || ticker;

  const res = await fetch(`${api}/admin/inject-report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ targetEmail, ticker, companyName, stages: stageData }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`inject-report ${res.status}: ${text}`);
  return JSON.parse(text);
}

async function main() {
  const args = parseArgs(process.argv);

  if (!args.password) args.password = await promptPassword(`Password for ${args.adminEmail}`);
  if (!args.password) { console.error('Password required'); process.exit(1); }

  console.log(`\nInjecting via ${args.api}`);
  console.log(`  target email: ${args.email}`);
  console.log(`  admin login:  ${args.adminEmail}`);
  console.log(`  tickers:      ${args.tickers.join(', ')}`);
  console.log(`  stages:       ${args.stages.join(', ')}\n`);

  const { cookie, user } = await login(args.api, args.adminEmail, args.password);
  if (user.role !== 'admin') {
    console.error(`User ${user.email} has role=${user.role}. Admin required.`);
    process.exit(1);
  }
  console.log(`Logged in as ${user.email} (${user.role})\n`);

  let okCount = 0;
  for (const ticker of args.tickers) {
    const stageData = {};
    for (const stage of args.stages) {
      const raw = loadStage(ticker, stage);
      if (raw) stageData[stage] = raw;
    }
    if (Object.keys(stageData).length === 0) {
      console.warn(`[${ticker}] no stage files found — skipping`);
      continue;
    }

    try {
      const result = await injectOne({ api: args.api, cookie, targetEmail: args.email, ticker, stageData });
      const action = result.created ? 'created' : 'updated';
      console.log(`[${ticker}] ${action} report ${result.reportId} — stages: ${result.stagesWritten.join(', ')}`);
      okCount++;
    } catch (err) {
      console.error(`[${ticker}] ${err.message}`);
    }
  }

  console.log(`\nDone. ${okCount}/${args.tickers.length} tickers injected.`);
}

main().catch(err => { console.error(err); process.exit(1); });
