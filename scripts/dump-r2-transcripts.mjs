#!/usr/bin/env node
// Dump every transcript from the production R2 bucket into ./transcripts/.
//
// Usage: npm run dump:transcripts
//
// Spawns scripts/dump-r2-transcripts/worker.js via `wrangler dev --remote`,
// streams an NDJSON listing from /dump, and writes each line to
// transcripts/{TICKER}/{YEAR}/Q{N}.md (pure markdown — JSON wrapper stripped).
// Writes transcripts/MANIFEST.json at the end with timestamp + index.
//
// Requires the local user to be authenticated with `wrangler login`. No
// Cloudflare credentials are read from or written to this repo.

import { spawn } from 'node:child_process';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const WORKER_DIR = join(__dirname, 'dump-r2-transcripts');
const TRANSCRIPTS_DIR = join(REPO_ROOT, 'transcripts');
const PORT = 8799;
const HEALTH_URL = `http://localhost:${PORT}/health`;
const DUMP_URL = `http://localhost:${PORT}/dump`;
const WRANGLER_BIN = join(REPO_ROOT, 'api', 'node_modules', '.bin', 'wrangler');

if (!existsSync(WRANGLER_BIN)) {
  console.error(`wrangler not found at ${WRANGLER_BIN}. Run \`cd api && npm install\` first.`);
  process.exit(1);
}

console.log('Dumping R2 → ./transcripts/');
console.log(`  worker dir: ${WORKER_DIR}`);
console.log(`  output:     ${TRANSCRIPTS_DIR}`);

// Wipe and recreate transcripts/ — this is a full snapshot, not an incremental sync.
if (existsSync(TRANSCRIPTS_DIR)) {
  console.log('  wiping existing transcripts/...');
  await rm(TRANSCRIPTS_DIR, { recursive: true, force: true });
}
await mkdir(TRANSCRIPTS_DIR, { recursive: true });

// ─── Spawn wrangler dev --remote ─────────────────────────────────

console.log('  starting wrangler dev --remote...');
const wrangler = spawn(
  WRANGLER_BIN,
  ['dev', '--remote', '--port', String(PORT), '--log-level', 'error'],
  { cwd: WORKER_DIR, stdio: ['ignore', 'pipe', 'pipe'] },
);

let wranglerStderr = '';
wrangler.stderr.on('data', (d) => { wranglerStderr += d.toString(); });
wrangler.stdout.on('data', () => { /* swallow — too chatty */ });

const cleanup = () => {
  if (!wrangler.killed) wrangler.kill('SIGTERM');
};
process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(130); });

// ─── Wait for /health ─────────────────────────────────────────────

const HEALTH_TIMEOUT_MS = 60_000;
const start = Date.now();
let ready = false;
while (Date.now() - start < HEALTH_TIMEOUT_MS) {
  try {
    const res = await fetch(HEALTH_URL);
    if (res.ok) { ready = true; break; }
  } catch { /* not yet */ }
  await new Promise((r) => setTimeout(r, 500));
}
if (!ready) {
  console.error('wrangler dev never became ready. stderr:');
  console.error(wranglerStderr);
  cleanup();
  process.exit(1);
}
console.log(`  worker ready (${((Date.now() - start) / 1000).toFixed(1)}s)`);

// ─── Stream NDJSON from /dump ─────────────────────────────────────

console.log('  streaming /dump...');
const dumpStart = Date.now();

const res = await fetch(DUMP_URL);
if (!res.ok || !res.body) {
  console.error(`/dump returned ${res.status}`);
  cleanup();
  process.exit(1);
}

const decoder = new TextDecoder();
let buffer = '';
let count = 0;
let totalBytes = 0;
let serverTotal = null;
let streamError = null;
const tickers = new Map(); // ticker → [{ year, quarter, bytes }]

const reader = res.body.getReader();
while (true) {
  const { value, done } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });

  let nl;
  while ((nl = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, nl);
    buffer = buffer.slice(nl + 1);
    if (!line) continue;

    let obj;
    try { obj = JSON.parse(line); }
    catch { console.warn(`  bad NDJSON line: ${line.slice(0, 80)}...`); continue; }

    if (obj._done) { serverTotal = obj.total; continue; }
    if (obj._error) { streamError = obj._error; continue; }

    const { ticker, year, quarter, text } = obj;
    if (!ticker || !year || !quarter || typeof text !== 'string') continue;

    const fileDir = join(TRANSCRIPTS_DIR, ticker, String(year));
    await mkdir(fileDir, { recursive: true });
    const filePath = join(fileDir, `Q${quarter}.md`);
    await writeFile(filePath, text, 'utf8');

    const bytes = Buffer.byteLength(text, 'utf8');
    totalBytes += bytes;
    if (!tickers.has(ticker)) tickers.set(ticker, []);
    tickers.get(ticker).push({ year, quarter, bytes });
    count++;
    if (count % 100 === 0) {
      const mb = (totalBytes / 1024 / 1024).toFixed(1);
      process.stdout.write(`  ${count} written (${mb} MB)\r`);
    }
  }
}
process.stdout.write('\n');

if (streamError) {
  console.error(`worker stream error: ${streamError}`);
  cleanup();
  process.exit(1);
}

// ─── Manifest ─────────────────────────────────────────────────────

const tickerSummary = [...tickers.entries()]
  .map(([ticker, qs]) => ({
    ticker,
    quarters: qs.sort((a, b) => b.year - a.year || b.quarter - a.quarter),
  }))
  .sort((a, b) => a.ticker.localeCompare(b.ticker));

const manifest = {
  generatedAt: new Date().toISOString(),
  totalCount: count,
  totalBytes,
  uniqueTickers: tickerSummary.length,
  tickers: tickerSummary,
};
await writeFile(
  join(TRANSCRIPTS_DIR, 'MANIFEST.json'),
  JSON.stringify(manifest, null, 2) + '\n',
  'utf8',
);

cleanup();

const elapsed = ((Date.now() - dumpStart) / 1000).toFixed(1);
const mb = (totalBytes / 1024 / 1024).toFixed(2);
console.log(`Done: ${count} transcripts, ${tickerSummary.length} tickers, ${mb} MB in ${elapsed}s`);
if (serverTotal !== null && serverTotal !== count) {
  console.warn(`  warning: server reported ${serverTotal} but received ${count}`);
}
