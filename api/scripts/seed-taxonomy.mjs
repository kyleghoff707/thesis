#!/usr/bin/env node
// Seed company_assignments in D1 from thes1s-company-assignments.json.
// Run: node api/scripts/seed-taxonomy.mjs
//
// Uses wrangler d1 execute to batch-insert rows.

import { readFileSync, writeFileSync, unlinkSync } from 'fs';
import { execSync } from 'child_process';
import { resolve } from 'path';

const TAXONOMY_PATH = resolve(import.meta.dirname, '../../industry-classification/thes1s-company-assignments.json');
const BATCH_SIZE = 50; // D1 supports ~100 per batch, stay conservative

const raw = JSON.parse(readFileSync(TAXONOMY_PATH, 'utf8'));
const assignments = raw.assignments;
const entries = Object.entries(assignments);

console.log(`Seeding ${entries.length} companies into D1...`);

// Build SQL batches
let totalInserted = 0;
const batches = [];
let currentBatch = [];

for (const [cik, data] of entries) {
  if (!data.ticker) continue;

  const esc = (s) => s ? s.replace(/'/g, "''") : '';
  const sql = `INSERT OR REPLACE INTO company_assignments (cik, ticker, name, sector, industry_group, industry, thes1s_code, sic_code) VALUES ('${esc(cik)}', '${esc(data.ticker)}', '${esc(data.name)}', '${esc(data.sector)}', '${esc(data.industryGroup)}', '${esc(data.industry)}', '${esc(data.thes1sCode)}', '${esc(data.sicCode || '')}');`;

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

// Execute each batch via wrangler
for (let i = 0; i < batches.length; i++) {
  const tmpFile = resolve(import.meta.dirname, `_batch_${i}.sql`);
  writeFileSync(tmpFile, batches[i]);

  try {
    execSync(`npx wrangler d1 execute thes1s --remote --file=${tmpFile}`, {
      cwd: resolve(import.meta.dirname, '..'),
      stdio: 'pipe',
    });
    totalInserted += batches[i].split('\n').length;
    if ((i + 1) % 20 === 0 || i === batches.length - 1) {
      console.log(`  Batch ${i + 1}/${batches.length} — ${totalInserted} rows inserted`);
    }
  } catch (err) {
    console.error(`Batch ${i} failed:`, err.stderr?.toString().slice(0, 200));
  } finally {
    unlinkSync(tmpFile);
  }
}

console.log(`\nDone. ${totalInserted} companies seeded into D1.`);
