#!/usr/bin/env node
// Combined data preparation script for pitch deck generation.
// Runs ALL data prep steps in a single Node.js process to avoid
// Claude Code tool call overhead (~30-45s per Bash invocation).
//
// Steps combined:
//   1. Gate check (verify one-pager exists)
//   2. Initialize generation status
//   3. Fetch DataPacket from the Thesis API
//   4. Pre-fetch earnings call transcripts
//   5. Pre-process SEC filings to markdown
//   6. Data quality checkpoint
//
// Usage: node --loader ./scripts/node-esm-loader.js scripts/prepare-data.js TICKER
//
// Output: Structured JSON summary to stdout, human-readable logs to stderr.
//         Reports artifacts go to ~/thesis/reports/{TICKER}/; intermediate
//         scratch (sections/, quality/) goes to ~/thesis/cache/{TICKER}/.

import '../src/engines/nodeAdapter.js';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

import { reportsDir, cacheDir } from '../src/utils/thesisDir.js';
import { requireThesisApiConfig } from '../src/config/thesisConfig.js';
import { fetchDataPacket } from '../src/api/thesisDataApi.js';
import { fetchTranscript, listBundledTranscripts } from '../src/engines/transcripts.js';
import { normalizeTicker } from '../src/utils/ticker.js';

const USAGE = 'Usage: node scripts/prepare-data.js <TICKER>';
const log = msg => console.error(msg);

function timed(timings, label) {
  const start = Date.now();
  return () => { timings[label] = Date.now() - start; };
}

function countPopulated(packet) {
  return {
    populated: Object.entries(packet).filter(([, value]) => value != null).length,
    total: Object.keys(packet).length,
  };
}

function buildGuruSummary(packet) {
  return {
    count: packet.gurus?.count ?? packet.gurus?.holdings?.length ?? 0,
    holdings: (packet.gurus?.holdings || []).map(holding => ({
      name: holding.guru?.name || holding.name || '?',
      value: holding.positions?.reduce((sum, position) => sum + (position.value || 0), 0)
        ?? holding.value
        ?? 0,
    })),
  };
}

function deriveTranscriptQuarters(packet) {
  const filings = (packet.filings || []).filter(filing => (
    filing.form === '10-Q' || filing.form === '10-K'
  ));
  const quarters = [];
  const seen = new Set();

  for (const filing of filings.slice(0, 8)) {
    const date = new Date(filing.filingDate);
    if (Number.isNaN(date.getTime())) continue;

    const month = date.getMonth() + 1;
    const year = date.getFullYear();
    let quarter;
    if (month <= 3) quarter = { year: year - 1, quarter: 4 };
    else if (month <= 6) quarter = { year, quarter: 1 };
    else if (month <= 9) quarter = { year, quarter: 2 };
    else quarter = { year, quarter: 3 };

    const key = `${quarter.year}Q${quarter.quarter}`;
    if (!seen.has(key)) {
      seen.add(key);
      quarters.push(quarter);
    }
  }

  return quarters;
}

function parseCheckpointOutput(output) {
  const text = output == null ? '' : String(output);
  const jsonMatch = text.match(/\{[\s\S]*"canProceed"[\s\S]*\}/);
  return jsonMatch ? JSON.parse(jsonMatch[0]) : null;
}

function applyCheckpointResult(checkpoint) {
  const verdict = checkpoint.canProceed ? 'PROCEED' : 'BLOCKED';
  log(`  DataPacket: ${checkpoint.dataPacket?.fieldCount?.populated}/${checkpoint.dataPacket?.fieldCount?.total} fields`);
  log(`  Filings: ${checkpoint.filingQuality?.tenKCount} 10-Ks, ${checkpoint.filingQuality?.tenQCount} 10-Qs`);
  return verdict;
}

function assertFilingPreprocessContract(packet) {
  const filings = packet.filings || [];
  const annuals = filings.filter(filing => filing?.form === '10-K').slice(0, 5);
  const quarterlies = filings.filter(filing => filing?.form === '10-Q').slice(0, 4);
  const filingsToPreprocess = [...annuals, ...quarterlies];

  if (filingsToPreprocess.length === 0) return;

  const missing = new Set();
  if (!packet.companyInfo?.cik) missing.add('companyInfo.cik');

  for (const filing of filingsToPreprocess) {
    if (!filing.accessionNumber) missing.add('filings[].accessionNumber');
    if (!filing.primaryDocument) missing.add('filings[].primaryDocument');
  }

  if (missing.size > 0) {
    throw new Error(
      `Hosted DataPacket is missing filing metadata required for local SEC preprocessing: ${Array.from(missing).join(', ')}`
    );
  }
}

export async function prepareData(ticker, options = {}) {
  const symbol = normalizeTicker(ticker);

  const timings = {};
  const totalStart = Date.now();
  const reportDir = reportsDir(symbol);
  const cacheBase = cacheDir(symbol);
  const execFile = options.execFileSync || execFileSync;
  const transcriptFetcher = options.fetchTranscript || fetchTranscript;

  // Step 1: Gate Check
  log(`\n=== Step 1: Gate Check for ${symbol} ===`);
  const done1 = timed(timings, 'gateCheck');

  mkdirSync(join(cacheBase, 'sections'), { recursive: true });
  mkdirSync(join(cacheBase, 'quality'), { recursive: true });
  mkdirSync(reportDir, { recursive: true });

  const onePagerPath = join(reportDir, 'one-pager.json');
  if (!existsSync(onePagerPath)) {
    log(`FAILED: One Pager not found at ${onePagerPath}`);
    log(`Run /generate:one-pager ${symbol} first.`);
    throw new Error(`One Pager not found at ${onePagerPath}`);
  }

  const onePager = JSON.parse(readFileSync(onePagerPath, 'utf8'));
  if (onePager.overallVerdict == null) {
    log('FAILED: One Pager has no verdict.');
    throw new Error('One Pager has no verdict.');
  }
  log(`  Gate PASSED - One Pager verdict: ${onePager.overallVerdict}`);
  done1();

  // Step 2: Init Generation Status
  log('\n=== Step 2: Init Generation Status ===');
  const done2 = timed(timings, 'initStatus');
  try {
    const statusPath = join(reportDir, 'generation-status.json');
    let existing = {};
    try { existing = JSON.parse(readFileSync(statusPath, 'utf8')); } catch {}
    const now = new Date().toISOString();
    writeFileSync(statusPath, JSON.stringify({
      ticker: symbol,
      stage: 'pitchDeck',
      state: 'DATA_PREP',
      startedAt: existing.startedAt || now,
      updatedAt: now,
      ...(existing.lastVerdict ? { lastVerdict: existing.lastVerdict } : {}),
    }, null, 2) + '\n');
    log('  Status initialized');
  } catch (error) {
    log(`  Warning: ${error.message} (non-fatal)`);
  }
  done2();

  // Step 3: DataPacket Fetch
  log('\n=== Step 3: DataPacket Fetch ===');
  const done3 = timed(timings, 'assembly');
  const config = options.config || requireThesisApiConfig();
  const result = await fetchDataPacket(symbol, config, options);
  const packet = result.dataPacket;
  assertFilingPreprocessContract(packet);
  const outputPath = join(reportDir, 'data-packet.json');
  writeFileSync(outputPath, `${JSON.stringify(packet, null, 2)}\n`);

  const dataPacketFields = countPopulated(packet);
  const guruSummary = buildGuruSummary(packet);
  log(`  Fields: ${dataPacketFields.populated}/${dataPacketFields.total}`);
  log(`  Financials: ${packet.financials?.years?.length || 0} years`);
  log(`  Gurus: ${guruSummary.count}`);
  log(`  Errors: ${packet.errors?.length || 0}`);
  if (packet.errors) packet.errors.forEach(error => log(`    - ${error}`));
  for (const holding of guruSummary.holdings) {
    log(`  Guru: ${holding.name}: $${(holding.value / 1e6).toFixed(1)}M`);
  }
  if (guruSummary.count === 0) log('  No gurus hold this ticker');
  done3();

  // Step 4: Transcript Pre-Fetch
  log('\n=== Step 4: Transcript Pre-Fetch ===');
  const done4 = timed(timings, 'transcripts');
  const transcriptDir = join(reportDir, 'transcripts');
  mkdirSync(transcriptDir, { recursive: true });

  // Bundled transcripts are the authoritative local source: scan the corpus
  // directory directly so a ticker's fiscal-calendar quirks can never cause a
  // bundled transcript to be skipped. Fall back to filing-derived calendar
  // quarters (for the Alpha Vantage path) only when the ticker isn't bundled.
  const bundledQuarters = listBundledTranscripts(symbol);
  const usingBundled = bundledQuarters.length > 0;
  const quarters = usingBundled ? bundledQuarters : deriveTranscriptQuarters(packet);
  if (usingBundled) {
    log(`  Source: bundled corpus (${bundledQuarters.length} transcript(s) on disk)`);
  }
  let savedTranscripts = 0;
  for (const quarter of quarters) {
    try {
      const result = await transcriptFetcher(symbol, {
        year: quarter.year,
        quarter: quarter.quarter,
        id: null,
      });
      if (result?.found && result?.text) {
        const fname = `Q${quarter.quarter}-FY${quarter.year}.md`;
        writeFileSync(join(transcriptDir, fname), result.text);
        savedTranscripts++;
        log(`  Saved: ${fname} (${result.text.length} chars)`);
      }
    } catch {
      // Non-fatal: transcript coverage can be sparse.
    }
  }
  log(`  Transcripts: ${savedTranscripts}/${quarters.length}`);
  done4();

  // Step 5: Filing Pre-Processing
  log('\n=== Step 5: Filing Pre-Processing ===');
  const done5 = timed(timings, 'filingPreprocess');
  try {
    const out = execFile(
      'node',
      ['--loader', './scripts/node-esm-loader.js', 'scripts/preprocess-filings.js', symbol],
      { timeout: 120000, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    );
    const match = out.match(/(\d+) succeeded/);
    log(`  ${match ? match[0] : 'Done'}`);
  } catch (error) {
    log(`  Warning: ${error.message?.slice(0, 80)} (non-fatal)`);
  }
  done5();

  // Step 6: Data Quality Checkpoint
  log('\n=== Step 6: Data Quality Checkpoint ===');
  const done6 = timed(timings, 'qualityCheck');
  let checkpointVerdict = 'UNKNOWN';
  try {
    const out = execFile(
      'node',
      ['--loader', './scripts/node-esm-loader.js', 'scripts/data-quality-checkpoint.js', symbol],
      { timeout: 120000, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    );
    const checkpoint = parseCheckpointOutput(out);
    if (checkpoint) checkpointVerdict = applyCheckpointResult(checkpoint);
  } catch (error) {
    const checkpoint = parseCheckpointOutput(error.stdout);
    if (checkpoint) {
      checkpointVerdict = applyCheckpointResult(checkpoint);
    } else if (error.status === 1) {
      checkpointVerdict = 'BLOCKED';
      log('  BLOCKED: Critical data missing');
    } else {
      log(`  Warning: ${error.message?.slice(0, 80)}`);
    }
  }
  log(`  Verdict: ${checkpointVerdict}`);
  done6();

  // Summary
  const totalMs = Date.now() - totalStart;
  log(`\n${'='.repeat(50)}`);
  log(`DATA PREPARATION COMPLETE: ${symbol}`);
  log(`${'='.repeat(50)}`);
  log(`  Total time: ${(totalMs / 1000).toFixed(1)}s`);
  log(`  Verdict: ${checkpointVerdict}`);
  log(`  One Pager: ${onePager.overallVerdict}`);
  log(`  DataPacket: ${dataPacketFields.populated}/${dataPacketFields.total} fields`);
  log(`  Gurus: ${guruSummary.count} holding`);
  log(`  Transcripts: ${savedTranscripts}/${quarters.length}`);
  log('');
  log('  Timing breakdown:');
  for (const [label, ms] of Object.entries(timings)) {
    log(`    ${label}: ${(ms / 1000).toFixed(1)}s`);
  }

  return {
    ticker: symbol,
    checkpointVerdict,
    onePagerVerdict: onePager.overallVerdict,
    dataPacketFields,
    guruCount: guruSummary.count,
    guruHoldings: guruSummary.holdings,
    transcriptsSaved: savedTranscripts,
    transcriptsTotal: quarters.length,
    timings,
    totalMs,
    errors: packet.errors || [],
  };
}

async function main() {
  const ticker = process.argv[2];
  if (!ticker) {
    console.error(USAGE);
    process.exit(1);
  }

  try {
    const summary = await prepareData(ticker);
    console.log(JSON.stringify(summary));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

const isCli = process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href;
if (isCli) {
  main();
}
