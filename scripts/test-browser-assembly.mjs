#!/usr/bin/env node
// Test the full browser assembly path: DataPacket + filing markdown + section extraction.
// Uses the domino polyfill so DOMParser works in Node.js (same as Worker).
// This mirrors exactly what useAssembleData.js does in the browser.

import '../api/src/shims/domino-polyfill.js';

import { assembleDataPacket } from '../src/engines/dataExport.js';
import { fetchFilingMarkdownBatch } from '../src/engines/filingMarkdown.js';
import { extractAllSections } from '../src/engines/filingSections.js';

const TICKER = process.argv[2] || 'AAPL';
const MAX_10K = 5;
const MAX_10Q = 4;
const SECTION_LIMIT_10K = 40_000;
const SECTION_LIMIT_10Q = 15_000;

function selectFilings(filings) {
  if (!Array.isArray(filings) || filings.length === 0) return [];
  const tenKs = [];
  const tenQs = [];
  for (const f of filings) {
    if (f.primaryDocument?.endsWith('.xml')) continue;
    if (f.form === '10-K' && tenKs.length < MAX_10K) tenKs.push(f);
    else if (f.form === '10-Q' && tenQs.length < MAX_10Q) tenQs.push(f);
  }
  return [...tenKs, ...tenQs];
}

console.log(`\n${'='.repeat(60)}`);
console.log(`Testing full assembly: ${TICKER}`);
console.log(`${'='.repeat(60)}\n`);

const t0 = Date.now();

// Phase 1: DataPacket
console.log('[Phase 1] DataPacket assembly...');
const dp = await assembleDataPacket(TICKER);
const t1 = Date.now();

const ci = dp.companyInfo || {};
const comp = dp.compensation;
const execs = comp?.executives?.length || 0;
const dirs = comp?.directors?.length || 0;
console.log(`  ${ci.name || '?'} (SIC ${ci.sic || '?'})`);
console.log(`  ${((t1 - t0) / 1000).toFixed(1)}s | Comp: ${execs}E/${dirs}D`);
console.log(`  Errors: ${(dp.errors || []).join(', ') || 'none'}`);

if (comp?.executives?.[0]) {
  const top = comp.executives[0];
  const comps = top.compensation || {};
  const latest = Object.values(comps)[0] || {};
  console.log(`  Top exec: ${top.name} $${(latest.total || 0).toLocaleString()}`);
}

// Phase 2: Filing content
console.log('\n[Phase 2] Filing pre-fetch...');
const cik = ci.cik;
const selected = selectFilings(dp.filings);
console.log(`  Selected: ${selected.length} filings (${selected.filter(f => f.form === '10-K').length} 10-Ks, ${selected.filter(f => f.form === '10-Q').length} 10-Qs)`);

if (selected.length === 0 || !cik) {
  console.log('  SKIP: no filings or CIK');
  process.exit(0);
}

const filingsWithCik = selected.map(f => ({ ...f, cik }));
const t2 = Date.now();

const markdownMap = await fetchFilingMarkdownBatch(filingsWithCik, (done, total) => {
  process.stdout.write(`\r  Fetching ${done}/${total} filings...`);
});
console.log('');

const t3 = Date.now();

// Phase 3: Section extraction
const filingContent = {};
let totalSections = 0;
for (const filing of filingsWithCik) {
  const result = markdownMap.get(filing.accessionNumber);
  if (!result?.markdown) continue;

  const formType = filing.form === '10-Q' ? '10-Q' : '10-K';
  const sections = extractAllSections(result.markdown, formType);
  const limit = formType === '10-Q' ? SECTION_LIMIT_10Q : SECTION_LIMIT_10K;

  for (const key of Object.keys(sections)) {
    if (sections[key] && sections[key].length > limit) {
      sections[key] = sections[key].slice(0, limit);
    }
  }

  const charCount = Object.values(sections).reduce((sum, s) => sum + (s?.length || 0), 0);
  const key = `${filing.form}-${filing.filingDate}`;
  filingContent[key] = { sections, charCount, fromCache: result.fromCache };
  totalSections += Object.keys(sections).length;
}

const t4 = Date.now();

// Report
console.log(`  ${((t3 - t2) / 1000).toFixed(1)}s fetch | ${((t4 - t3) / 1000).toFixed(1)}s extract`);
console.log(`  Filings with content: ${Object.keys(filingContent).length}/${selected.length}`);
console.log(`  Total sections: ${totalSections}\n`);

for (const [key, val] of Object.entries(filingContent)) {
  const secs = Object.keys(val.sections);
  const cached = val.fromCache ? '[cached]' : '[fresh]';
  console.log(`  ${key}: ${secs.join(', ')} (${val.charCount.toLocaleString()}ch) ${cached}`);
}

// Payload size
const payload = { dataPacket: dp, filingContent, assembledAt: new Date().toISOString() };
const payloadSize = JSON.stringify(payload).length;

console.log(`\n  Total: ${((t4 - t0) / 1000).toFixed(1)}s | Payload: ${(payloadSize / 1024).toFixed(0)} KB`);
console.log(`\nRESULT: PASS ${TICKER}\n`);
