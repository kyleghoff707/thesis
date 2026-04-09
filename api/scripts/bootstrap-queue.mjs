#!/usr/bin/env node
// One-time bootstrap for the smart taxonomy system.
// Run after deploying schema changes to remote D1.
//
// What it does:
// 1. Runs ALTER TABLE to add new columns (idempotent)
// 2. Creates classification_queue table
// 3. Backfills exchange, confidence, yahoo_sector, yahoo_industry from assignments JSON
// 4. Sets is_sp500 = 1 for current S&P 500 members
// 5. Populates classification_queue with SEC CIKs not in company_assignments
//
// Usage: node api/scripts/bootstrap-queue.mjs

import { readFileSync, writeFileSync, unlinkSync } from 'fs';
import { execSync } from 'child_process';
import { resolve } from 'path';
import { setTimeout as sleep } from 'timers/promises';

const API_DIR = resolve(import.meta.dirname, '..');
const ROOT = resolve(API_DIR, '..');

function run(sql, label) {
  const tmpFile = resolve(import.meta.dirname, '_bootstrap_tmp.sql');
  writeFileSync(tmpFile, sql);
  try {
    execSync(`npx wrangler d1 execute thes1s --remote --file=${tmpFile}`, {
      cwd: API_DIR,
      stdio: 'pipe',
      timeout: 30_000,
    });
    console.log(`  ✓ ${label}`);
  } catch (err) {
    const msg = err.stderr?.toString().slice(0, 200) || err.message;
    // Ignore "duplicate column" errors (already exists)
    if (msg.includes('duplicate column') || msg.includes('already exists')) {
      console.log(`  ~ ${label} (already exists, skipping)`);
    } else {
      console.warn(`  ✗ ${label}: ${msg}`);
    }
  } finally {
    try { unlinkSync(tmpFile); } catch {}
  }
}

async function runBatch(sql, label) {
  const tmpFile = resolve(import.meta.dirname, '_bootstrap_batch.sql');
  writeFileSync(tmpFile, sql);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      execSync(`npx wrangler d1 execute thes1s --remote --file=${tmpFile}`, {
        cwd: API_DIR,
        stdio: 'pipe',
        timeout: 30_000,
      });
      console.log(`  ✓ ${label}`);
      unlinkSync(tmpFile);
      return true;
    } catch (err) {
      console.warn(`  Batch attempt ${attempt + 1}/3 failed:`, err.stderr?.toString().slice(0, 100));
      if (attempt < 2) await sleep(1000 * (attempt + 1));
    }
  }
  try { unlinkSync(tmpFile); } catch {}
  console.warn(`  ✗ ${label} failed after 3 attempts`);
  return false;
}

console.log('=== Smart Taxonomy Bootstrap ===\n');

// Step 1: Schema migrations (ALTER TABLE)
console.log('Step 1: Schema migrations...');
const alters = [
  "ALTER TABLE company_assignments ADD COLUMN exchange TEXT;",
  "ALTER TABLE company_assignments ADD COLUMN status TEXT DEFAULT 'active';",
  "ALTER TABLE company_assignments ADD COLUMN delisted_at TEXT;",
  "ALTER TABLE company_assignments ADD COLUMN confidence REAL DEFAULT 0.85;",
  "ALTER TABLE company_assignments ADD COLUMN yahoo_sector TEXT;",
  "ALTER TABLE company_assignments ADD COLUMN yahoo_industry TEXT;",
];
for (const sql of alters) {
  const col = sql.match(/ADD COLUMN (\w+)/)?.[1];
  run(sql, `Add column ${col}`);
}

// Indexes
run("CREATE INDEX IF NOT EXISTS idx_assignments_status ON company_assignments(status);", 'Index on status');
run("CREATE INDEX IF NOT EXISTS idx_assignments_sp500 ON company_assignments(is_sp500);", 'Index on is_sp500');

// classification_queue table
run(`CREATE TABLE IF NOT EXISTS classification_queue (
  cik TEXT PRIMARY KEY,
  ticker TEXT,
  name TEXT,
  status TEXT DEFAULT 'pending',
  exclude_reason TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);`, 'Create classification_queue table');

// Step 2: Backfill existing company_assignments from JSON
console.log('\nStep 2: Backfill exchange, confidence, yahoo fields...');
const assignmentsJson = JSON.parse(readFileSync(resolve(ROOT, 'industry-classification/thes1s-company-assignments.json'), 'utf8'));
const assignments = assignmentsJson.assignments;
const esc = (s) => s ? s.replace(/\\/g, '\\\\').replace(/'/g, "''") : '';

const BATCH_SIZE = 50;
let batchLines = [];
let totalBackfilled = 0;

for (const [cik, data] of Object.entries(assignments)) {
  if (!data.ticker) continue;
  batchLines.push(
    `UPDATE company_assignments SET exchange = '${esc(data.exchange || '')}', confidence = ${data.confidence || 0.85}, yahoo_sector = '${esc(data.yahooSector || '')}', yahoo_industry = '${esc(data.yahooIndustry || '')}', status = 'active' WHERE cik = '${esc(cik)}';`
  );

  if (batchLines.length >= BATCH_SIZE) {
    await runBatch(batchLines.join('\n'), `Backfill batch (${totalBackfilled + batchLines.length} rows)`);
    totalBackfilled += batchLines.length;
    batchLines = [];
  }
}
if (batchLines.length > 0) {
  await runBatch(batchLines.join('\n'), `Backfill batch (${totalBackfilled + batchLines.length} rows)`);
  totalBackfilled += batchLines.length;
}
console.log(`  Backfilled ${totalBackfilled} companies`);

// Step 3: Set is_sp500 flags
console.log('\nStep 3: Set S&P 500 flags...');
const sp500Path = resolve(ROOT, 'validation/data/sp500-tickers.json');
let sp500Tickers;
try {
  sp500Tickers = JSON.parse(readFileSync(sp500Path, 'utf8'));
} catch {
  console.warn('  Could not read sp500-tickers.json, skipping S&P 500 flags');
  sp500Tickers = [];
}

if (sp500Tickers.length > 0) {
  // Reset all first
  run("UPDATE company_assignments SET is_sp500 = 0 WHERE is_sp500 = 1;", 'Reset existing is_sp500 flags');

  // Set for current members
  const sp500Batch = sp500Tickers.map(t =>
    `UPDATE company_assignments SET is_sp500 = 1 WHERE ticker = '${esc(t)}';`
  );
  for (let i = 0; i < sp500Batch.length; i += BATCH_SIZE) {
    const slice = sp500Batch.slice(i, i + BATCH_SIZE);
    await runBatch(slice.join('\n'), `S&P 500 batch (${Math.min(i + BATCH_SIZE, sp500Batch.length)}/${sp500Tickers.length})`);
  }
  console.log(`  Set is_sp500 = 1 for ${sp500Tickers.length} companies`);
}

// Step 4: Populate classification_queue with SEC CIKs not in company_assignments
console.log('\nStep 4: Populate classification queue...');
const secRes = await fetch('https://www.sec.gov/files/company_tickers.json', {
  headers: { 'User-Agent': 'StockAnalyzer/1.0 bootstrap' },
});
if (!secRes.ok) {
  console.warn(`  SEC fetch failed (${secRes.status}), skipping queue population`);
} else {
  const secData = await secRes.json();
  const assignmentCiks = new Set(Object.keys(assignments));

  // Non-common-stock filter patterns
  const NON_COMMON = [/[.\-\/]W[S]?$/, /[.\-\/]U$/, /[.\-\/]R[T]?$/, /[.\-\/]P[A-Z]?$/, /[.\-\/]PR[.\-\/]?[A-Z]?$/];

  let queueBatch = [];
  let totalQueued = 0;

  for (const entry of Object.values(secData)) {
    const cik = String(entry.cik_str).padStart(10, '0');
    const ticker = entry.ticker;

    // Skip if already in assignments
    if (assignmentCiks.has(cik)) continue;
    // Skip non-common stock
    if (NON_COMMON.some(re => re.test(ticker))) continue;

    // Mark as excluded (these are the ~7K that didn't make it through Yahoo classification)
    queueBatch.push(
      `INSERT OR IGNORE INTO classification_queue (cik, ticker, name, status, exclude_reason) VALUES ('${esc(cik)}', '${esc(ticker)}', '${esc(entry.title)}', 'excluded', 'initial-bootstrap');`
    );

    if (queueBatch.length >= BATCH_SIZE) {
      await runBatch(queueBatch.join('\n'), `Queue batch (${totalQueued + queueBatch.length})`);
      totalQueued += queueBatch.length;
      queueBatch = [];
    }
  }
  if (queueBatch.length > 0) {
    await runBatch(queueBatch.join('\n'), `Queue batch (${totalQueued + queueBatch.length})`);
    totalQueued += queueBatch.length;
  }
  console.log(`  Queued ${totalQueued} SEC CIKs as 'excluded' (bootstrap baseline)`);
}

console.log('\n=== Bootstrap complete ===');
console.log('Next: cd api && npx wrangler deploy');
