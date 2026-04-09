#!/usr/bin/env node
// Seed company_assignments in D1 from thes1s-company-assignments.json.
// Run: node api/scripts/seed-taxonomy.mjs
//
// Uses wrangler d1 execute to batch-insert rows.
// Retries failed batches up to 3 times with backoff.

import { readFileSync, writeFileSync, unlinkSync } from 'fs';
import { execSync } from 'child_process';
import { resolve } from 'path';
import { setTimeout as sleep } from 'timers/promises';

const TAXONOMY_PATH = resolve(import.meta.dirname, '../../industry-classification/thes1s-company-assignments.json');
const BATCH_SIZE = 50; // D1 supports ~100 per batch, stay conservative

const raw = JSON.parse(readFileSync(TAXONOMY_PATH, 'utf8'));
const assignments = raw.assignments;
const entries = Object.entries(assignments);

console.log(`Seeding ${entries.length} companies into D1...`);

// Build SQL batches
const esc = (s) => s ? s.replace(/\\/g, '\\\\').replace(/'/g, "''") : '';
let totalInserted = 0;
const batches = [];
let currentBatch = [];

for (const [cik, data] of entries) {
  if (!data.ticker) continue;

  const sql = `INSERT OR REPLACE INTO company_assignments (cik, ticker, name, sector, industry_group, industry, thes1s_code, sic_code, exchange, confidence, yahoo_sector, yahoo_industry, status) VALUES ('${esc(cik)}', '${esc(data.ticker)}', '${esc(data.name)}', '${esc(data.sector)}', '${esc(data.industryGroup)}', '${esc(data.industry)}', '${esc(data.thes1sCode)}', '${esc(data.sicCode || '')}', '${esc(data.exchange || '')}', ${data.confidence || 0.85}, '${esc(data.yahooSector || '')}', '${esc(data.yahooIndustry || '')}', 'active');`;

  currentBatch.push(sql);

  if (currentBatch.length >= BATCH_SIZE) {
    batches.push(currentBatch.join('\n'));
    currentBatch = [];
  }
}
if (currentBatch.length > 0) {
  batches.push(currentBatch.join('\n'));
}

console.log(`Built ${batches.length} batches of ~${BATCH_SIZE} rows each`);

// Execute each batch via wrangler with retry
const failedBatches = [];

for (let i = 0; i < batches.length; i++) {
  const tmpFile = resolve(import.meta.dirname, `_batch_${i}.sql`);
  writeFileSync(tmpFile, batches[i]);

  let ok = false;
  for (let attempt = 0; attempt < 3 && !ok; attempt++) {
    try {
      execSync(`npx wrangler d1 execute thes1s --remote --file=${tmpFile}`, {
        cwd: resolve(import.meta.dirname, '..'),
        stdio: 'pipe',
        timeout: 30_000,
      });
      totalInserted += batches[i].split('\n').length;
      ok = true;
    } catch (err) {
      console.warn(`  Batch ${i} attempt ${attempt + 1}/3 failed:`, err.stderr?.toString().slice(0, 200));
      if (attempt < 2) await sleep(1000 * (attempt + 1));
    }
  }

  if (!ok) failedBatches.push(i);

  unlinkSync(tmpFile);

  if ((i + 1) % 20 === 0 || i === batches.length - 1) {
    console.log(`  Batch ${i + 1}/${batches.length} — ${totalInserted} rows inserted`);
  }
}

if (failedBatches.length > 0) {
  console.error(`\n${failedBatches.length} batches failed after 3 retries: ${failedBatches.join(', ')}`);
}

console.log(`\nDone. ${totalInserted}/${entries.length} companies seeded into D1.`);
