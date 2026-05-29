#!/usr/bin/env node
// Injects locally-generated Thesis reports into the user's account on
// thesis-investing.com via Bearer-token authentication. Reads JSON from
// ~/thesis/reports/{TICKER}/, falling back to newest archive, inlines debate
// sections for final-thesis, and POSTs to /v1/reports.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, isAbsolute, resolve } from 'node:path';
import { homedir } from 'node:os';
import { readThesisConfig } from '../src/config/thesisConfig.js';
import { reportsDir } from '../src/utils/thesisDir.js';

export const STAGE_FILES = {
  onePager: 'one-pager.json',
  pitchDeck: 'pitch-deck.json',
  finalThesis: 'final-thesis.json',
};

export const VALID_STAGES = Object.keys(STAGE_FILES);

const DEBATE_KEYS = ['step1Bull', 'step2Bear', 'step3Rebuttal', 'step4Judge'];

export function printHelp() {
  console.log(`Usage: node scripts/inject-report.mjs --ticker TICKER

Push locally-generated reports for TICKER to your Thesis account.

Flags:
  --ticker, -t TICKER       Ticker to inject (required, single value).
  --api-base-url URL        Override API base URL (default: from config).
  --api-key KEY             Override API key (default: from config).
  --help, -h                Show this help.

Reads:
  ~/thesis/reports/{TICKER}/{one-pager,pitch-deck,final-thesis}.json
  Falls back to the newest archive directory if the working dir is empty.

Sends:
  POST {apiBaseUrl}/v1/reports
  Authorization: Bearer {apiKey}
`);
}

function requireValue(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith('-')) throw new Error(`${flag} requires a value`);
  return value;
}

export function parseArgs(argv) {
  const args = {
    ticker: null,
    apiBaseUrl: null,
    apiKey: null,
    help: false,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--ticker' || arg === '-t') {
      if (args.ticker) throw new Error('--ticker may only be provided once');
      args.ticker = requireValue(argv, i, arg).toUpperCase();
      i += 1;
    } else if (arg === '--api-base-url') {
      args.apiBaseUrl = requireValue(argv, i, arg).trim().replace(/\/+$/, '');
      i += 1;
    } else if (arg === '--api-key') {
      args.apiKey = requireValue(argv, i, arg).trim();
      i += 1;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!args.help && !args.ticker) throw new Error('--ticker is required');
  return args;
}

export function resolveStagePath(ticker, stage) {
  const filename = STAGE_FILES[stage];
  if (!filename) return null;

  const tickerDir = reportsDir(ticker);
  const working = resolve(tickerDir, filename);
  if (existsSync(working)) return { path: working, source: 'working' };

  const archiveRoot = resolve(tickerDir, 'archive');
  if (!existsSync(archiveRoot)) return null;

  let entries;
  try {
    entries = readdirSync(archiveRoot, { withFileTypes: true });
  } catch {
    return null;
  }

  const matching = entries
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort()
    .reverse();

  for (const dir of matching) {
    const candidate = resolve(archiveRoot, dir, filename);
    if (existsSync(candidate)) return { path: candidate, source: `archive/${dir}` };
  }

  return null;
}

function resolvePossiblyHomeRelative(baseDir, value) {
  if (value === '~') return homedir();
  if (value.startsWith('~/')) return resolve(homedir(), value.slice(2));
  if (isAbsolute(value)) return value;
  return resolve(baseDir, value);
}

export function inlineDebatePaths(raw, sourcePath) {
  if (!raw?.debate || typeof raw.debate !== 'object') return raw;

  const sourceDir = dirname(sourcePath);
  const isArchiveSource = sourceDir.split(/[\\/]/).includes('archive');
  for (const key of DEBATE_KEYS) {
    const value = raw.debate[key];
    if (typeof value !== 'string' || !value.endsWith('.json')) continue;

    const archiveCandidates = [
      resolve(sourceDir, basename(value)),
      resolve(sourceDir, 'sections', basename(value)),
    ];
    const pathCandidates = [
      resolvePossiblyHomeRelative(sourceDir, value),
      resolvePossiblyHomeRelative(process.cwd(), value),
    ];
    const candidates = isArchiveSource
      ? [...archiveCandidates, ...pathCandidates]
      : [...pathCandidates, ...archiveCandidates];

    for (const candidate of candidates) {
      if (!existsSync(candidate)) continue;
      try {
        // Debate-step files are already enveloped as { step, role, ..., content }.
        // Assign the parsed file directly so the wire shape is `stepXxx.content = <debate data>`,
        // which is what the hosted renderer reads. Re-wrapping here would double-nest the data
        // (stepXxx.content.content) and the renderer would show empty Bull/Bear/Rebuttal/Judge tabs.
        raw.debate[key] = JSON.parse(readFileSync(candidate, 'utf8'));
        break;
      } catch {
        // Keep trying candidates; malformed or unreadable files should not crash inject.
      }
    }
  }

  return raw;
}

export function loadStage(ticker, stage) {
  const found = resolveStagePath(ticker, stage);
  if (!found) {
    console.warn(`  skipped ${stage} (no data)`);
    return null;
  }

  let raw;
  try {
    raw = JSON.parse(readFileSync(found.path, 'utf8'));
  } catch (error) {
    console.warn(`  skipped ${stage} (could not parse ${found.source}: ${error.message})`);
    return null;
  }

  if (!Array.isArray(raw?.sections) || raw.sections.length === 0) {
    console.warn(`  skipped ${stage} (no sections in ${found.source})`);
    return null;
  }

  if (stage === 'finalThesis') raw = inlineDebatePaths(raw, found.path);
  console.log(`  loaded ${stage} from ${found.source}`);
  return raw;
}

export function buildPayload(ticker, stages) {
  const companyName =
    stages.onePager?.companyName ||
    stages.pitchDeck?.companyName ||
    stages.finalThesis?.companyName ||
    ticker;

  return { ticker, companyName, stages };
}

export async function postReport({ apiBaseUrl, apiKey, payload, fetchImpl = globalThis.fetch }) {
  let response;
  try {
    response = await fetchImpl(`${apiBaseUrl}/v1/reports`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    throw new Error(`Could not reach ${apiBaseUrl}. Check your connection. (${error.message})`);
  }

  let body = {};
  try {
    body = await response.json();
  } catch {
    // Non-JSON response; status-specific messages below stay friendly.
  }

  if (response.ok) return body;

  const message = body?.error?.message || `HTTP ${response.status}`;
  if (response.status === 401) {
    throw new Error('API key was rejected. Check your key at thesis-investing.com/account.');
  }
  if (response.status === 429) {
    const retry = body?.error?.retryAfterSeconds || 60;
    throw new Error(`Rate-limited. Retry in ${retry}s.`);
  }
  if (response.status >= 500) {
    throw new Error(`Server error (${response.status}). Retry with \`/inject ${payload.ticker}\` shortly.`);
  }

  throw new Error(`Inject failed (${response.status}): ${message}`);
}

export async function main(argv = process.argv, deps = {}) {
  const fetchImpl = deps.fetchImpl || globalThis.fetch;

  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    console.error(error.message);
    printHelp();
    return 1;
  }

  if (args.help) {
    printHelp();
    return 0;
  }

  let config;
  try {
    config = readThesisConfig();
  } catch (error) {
    console.error(error.message);
    return 1;
  }

  const apiBaseUrl = args.apiBaseUrl || config.apiBaseUrl;
  const apiKey = args.apiKey || config.apiKey;

  if (!apiKey) {
    console.error('No API key configured. Run `npm run setup` or paste your key from thesis-investing.com/account into ~/thesis/config.json.');
    return 1;
  }

  const tickerDir = reportsDir(args.ticker);
  if (!existsSync(tickerDir)) {
    console.error(`No report found for ${args.ticker}. Run \`/analyze ${args.ticker}\` first.`);
    return 1;
  }

  console.log(`Injecting ${args.ticker} to thesis-investing.com`);

  const stages = {};
  for (const stage of VALID_STAGES) {
    const raw = loadStage(args.ticker, stage);
    if (raw) stages[stage] = raw;
  }

  if (Object.keys(stages).length === 0) {
    console.error(`No stage data found for ${args.ticker}. Run \`/analyze ${args.ticker}\` first.`);
    return 1;
  }

  const payload = buildPayload(args.ticker, stages);

  let result;
  try {
    result = await postReport({ apiBaseUrl, apiKey, payload, fetchImpl });
  } catch (error) {
    console.error(error.message);
    return 1;
  }

  const stagesWritten = Array.isArray(result.stagesWritten) ? result.stagesWritten : [];
  for (const stage of VALID_STAGES) {
    if (stagesWritten.includes(stage)) console.log(`  ✓ ${stage}`);
    else if (stages[stage]) console.warn(`  skipped ${stage} (server did not write)`);
  }

  if (stagesWritten.length < 1) {
    console.error(`No stages were written for ${args.ticker}. Retry with \`/inject ${args.ticker}\`.`);
    return 1;
  }

  const target = config.accountEmail || 'your Thesis account';
  console.log(result.created === false ? 'Updated existing report.' : 'Created new report.');
  const view = result.url ? ` View: ${result.url}` : '';
  console.log(`Injected to ${target}.${view}`);

  return 0;
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  main().then(code => process.exit(code ?? 0)).catch(error => {
    console.error(error.message || error);
    process.exit(1);
  });
}
