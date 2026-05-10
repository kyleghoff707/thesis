#!/usr/bin/env node
// Combined data preparation script for pitch deck generation.
// Runs ALL data prep steps in a single Node.js process to avoid
// Claude Code tool call overhead (~30-45s per Bash invocation).
//
// Steps combined:
//   1. Gate check (verify one-pager exists)
//   2. Initialize generation status
//   3. Pre-fetch guru holdings
//   4. Assemble DataPacket (EDGAR, SEC, Finviz — NO Yahoo in Node.js)
//   5. Pre-fetch earnings call transcripts
//   6. Pre-process SEC filings to markdown
//   7. Data quality checkpoint
//
// Usage: node --loader ./scripts/node-esm-loader.js scripts/prepare-data.js TICKER
//
// Output: Structured JSON summary to stdout, human-readable logs to stderr.
//         Reports artifacts go to ~/thesis/reports/{TICKER}/; intermediate
//         scratch (sections/, quality/) goes to ~/thesis/cache/{TICKER}/.

import '../src/engines/nodeAdapter.js';
import { assembleDataPacket } from '../src/engines/dataExport.js';
import { fetchTranscript } from '../src/engines/transcripts.js';
import { reportsDir, cacheDir } from '../src/utils/thesisDir.js';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const ticker = process.argv[2]?.toUpperCase();
if (!ticker) {
  console.error('Usage: node scripts/prepare-data.js <TICKER>');
  process.exit(1);
}

const log = (msg) => console.error(msg);
const timings = {};
function timed(label) {
  const start = Date.now();
  return () => { timings[label] = Date.now() - start; };
}

const totalStart = Date.now();
const reportDir = reportsDir(ticker);
const cacheBase = cacheDir(ticker);

// ── Step 1: Gate Check ──────────────────────────────────────
log(`\n=== Step 1: Gate Check for ${ticker} ===`);
const done1 = timed('gateCheck');

mkdirSync(join(cacheBase, 'sections'), { recursive: true });
mkdirSync(join(cacheBase, 'quality'), { recursive: true });
mkdirSync(reportDir, { recursive: true });

const onePagerPath = join(reportDir, 'one-pager.json');
if (!existsSync(onePagerPath)) {
  log(`FAILED: One Pager not found at ${onePagerPath}`);
  log(`Run /generate:one-pager ${ticker} first.`);
  process.exit(1);
}

const onePager = JSON.parse(readFileSync(onePagerPath, 'utf8'));
if (onePager.overallVerdict == null) {
  log('FAILED: One Pager has no verdict.');
  process.exit(1);
}
log(`  Gate PASSED — One Pager verdict: ${onePager.overallVerdict}`);
done1();

// ── Step 2: Init Generation Status ──────────────────────────
log('\n=== Step 2: Init Generation Status ===');
const done2 = timed('initStatus');
try {
  const { initGenerationStatus } = await import('../src/engines/progressState.js');
  initGenerationStatus(ticker, 'pitchDeck');
  log('  Status initialized');
} catch (e) {
  log(`  Warning: ${e.message} (non-fatal)`);
}
done2();

// ── Step 3: Assemble DataPacket (includes guru data) ────────
log('\n=== Step 3: DataPacket Assembly ===');
const done3 = timed('assembly');
const packet = await assembleDataPacket(ticker);
const outputPath = join(reportDir, 'data-packet.json');
writeFileSync(outputPath, JSON.stringify(packet, null, 2));

const populated = Object.entries(packet).filter(([, v]) => v != null).length;
const total = Object.keys(packet).length;
log(`  Fields: ${populated}/${total}`);
log(`  Financials: ${packet.financials?.years?.length || 0} years`);
log(`  Gurus: ${packet.gurus?.count ?? 0}`);
log(`  Errors: ${packet.errors?.length || 0}`);
if (packet.errors) packet.errors.forEach(e => log(`    - ${e}`));

// Extract guru summary from DataPacket (no separate fetch needed —
// assembleDataPacket already calls the guru engine internally)
const guruSummary = {
  count: packet.gurus?.count ?? packet.gurus?.holdings?.length ?? 0,
  holdings: (packet.gurus?.holdings || []).map(h => ({
    name: h.guru?.name || h.name || '?',
    value: h.positions?.reduce((s, p) => s + (p.value || 0), 0) ?? h.value ?? 0,
  })),
};
for (const h of guruSummary.holdings) {
  log(`  Guru: ${h.name}: $${(h.value / 1e6).toFixed(1)}M`);
}
if (guruSummary.count === 0) log('  No gurus hold this ticker');
done3();

// ── Step 4: Transcript Pre-Fetch ────────────────────────────
log('\n=== Step 4: Transcript Pre-Fetch ===');
const done4 = timed('transcripts');
const transcriptDir = join(reportDir, 'transcripts');
mkdirSync(transcriptDir, { recursive: true });

const filings = (packet.filings || []).filter(f => f.form === '10-Q' || f.form === '10-K');
const quarters = [];
const seen = new Set();
for (const f of filings.slice(0, 8)) {
  const d = new Date(f.filingDate);
  const month = d.getMonth() + 1;
  const year = d.getFullYear();
  let q;
  if (month <= 3) q = { year: year - 1, quarter: 4 };
  else if (month <= 6) q = { year, quarter: 1 };
  else if (month <= 9) q = { year, quarter: 2 };
  else q = { year, quarter: 3 };
  const key = `${q.year}Q${q.quarter}`;
  if (!seen.has(key)) { seen.add(key); quarters.push(q); }
}

let savedTranscripts = 0;
for (const q of quarters) {
  try {
    const result = await fetchTranscript(ticker, { year: q.year, quarter: q.quarter, id: null });
    if (result?.found && result?.text) {
      const fname = `Q${q.quarter}-FY${q.year}.md`;
      writeFileSync(join(transcriptDir, fname), result.text);
      savedTranscripts++;
      log(`  Saved: ${fname} (${result.text.length} chars)`);
    }
  } catch (e) {
    // Silent — Alpha Vantage free tier has limited coverage
  }
}
log(`  Transcripts: ${savedTranscripts}/${quarters.length}`);
done4();

// ── Step 5: Pre-Process Filings ─────────────────────────────
log('\n=== Step 5: Filing Pre-Processing ===');
const done5 = timed('filingPreprocess');
try {
  const out = execSync(
    `node --loader ./scripts/node-esm-loader.js scripts/preprocess-filings.js ${ticker}`,
    { timeout: 120000, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
  );
  const match = out.match(/(\d+) succeeded/);
  log(`  ${match ? match[0] : 'Done'}`);
} catch (e) {
  log(`  Warning: ${e.message?.slice(0, 80)} (non-fatal)`);
}
done5();

// ── Step 6: Data Quality Checkpoint ─────────────────────────
log('\n=== Step 6: Data Quality Checkpoint ===');
const done6 = timed('qualityCheck');
let checkpointVerdict = 'UNKNOWN';
try {
  const out = execSync(
    `node --loader ./scripts/node-esm-loader.js scripts/data-quality-checkpoint.js ${ticker}`,
    { timeout: 30000, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
  );
  // Parse the JSON output (last line or stdout)
  const jsonMatch = out.match(/\{[\s\S]*"canProceed"[\s\S]*\}/);
  if (jsonMatch) {
    const cp = JSON.parse(jsonMatch[0]);
    checkpointVerdict = cp.canProceed ? 'PROCEED' : 'BLOCKED';
    log(`  DataPacket: ${cp.dataPacket?.fieldCount?.populated}/${cp.dataPacket?.fieldCount?.total} fields`);
    log(`  Filings: ${cp.filingQuality?.tenKCount} 10-Ks, ${cp.filingQuality?.tenQCount} 10-Qs`);
  }
} catch (e) {
  if (e.status === 1) {
    checkpointVerdict = 'BLOCKED';
    log('  BLOCKED: Critical data missing');
  } else {
    log(`  Warning: ${e.message?.slice(0, 80)}`);
  }
}
log(`  Verdict: ${checkpointVerdict}`);
done6();

// ── Summary ─────────────────────────────────────────────────
const totalMs = Date.now() - totalStart;
log(`\n${'═'.repeat(50)}`);
log(`DATA PREPARATION COMPLETE: ${ticker}`);
log(`${'═'.repeat(50)}`);
log(`  Total time: ${(totalMs / 1000).toFixed(1)}s`);
log(`  Verdict: ${checkpointVerdict}`);
log(`  One Pager: ${onePager.overallVerdict}`);
log(`  DataPacket: ${populated}/${total} fields`);
log(`  Gurus: ${guruSummary.count} holding`);
log(`  Transcripts: ${savedTranscripts}/${quarters.length}`);
log('');
log('  Timing breakdown:');
for (const [label, ms] of Object.entries(timings)) {
  log(`    ${label}: ${(ms / 1000).toFixed(1)}s`);
}

// Output structured JSON to stdout for the orchestrator
const summary = {
  ticker,
  checkpointVerdict,
  onePagerVerdict: onePager.overallVerdict,
  dataPacketFields: { populated, total },
  guruCount: guruSummary.count,
  guruHoldings: guruSummary.holdings,
  transcriptsSaved: savedTranscripts,
  transcriptsTotal: quarters.length,
  timings,
  totalMs,
  errors: packet.errors || [],
};
console.log(JSON.stringify(summary));

process.exit(0);
