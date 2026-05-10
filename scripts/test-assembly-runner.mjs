#!/usr/bin/env node
// Runs the full browser-side DataPacket + filing assembly test for a ticker.
// Uses vitest's Node API with the project's vite config for proper module resolution.
// Usage: node scripts/test-assembly-runner.mjs TICKER

import { createServer } from 'vite';
import { resolve } from 'path';

const TICKER = process.argv[2];
if (!TICKER) { console.error('Usage: node scripts/test-assembly-runner.mjs TICKER'); process.exit(1); }

// Bootstrap: load the domino polyfill + fetch interceptor, then run assembly
const root = resolve(import.meta.dirname, '..');

// Use vite to resolve modules (handles extensionless imports)
const vite = await createServer({
  root,
  server: { middlewareMode: true },
  optimizeDeps: { disabled: true },
});

try {
  // Load polyfill
  await vite.ssrLoadModule('/api/src/shims/domino-polyfill.js');

  // Load engines
  const { assembleDataPacket } = await vite.ssrLoadModule('/src/engines/dataExport.js');
  const { fetchFilingMarkdownBatch } = await vite.ssrLoadModule('/src/engines/filingMarkdown.js');
  const { extractAllSections } = await vite.ssrLoadModule('/src/engines/filingSections.js');

  // Install fetch interceptor (same as the test file)
  const SEC_UA = 'Thesis/1.0 kylehoff@thesis-investing.com';
  const origFetch = globalThis.fetch;
  globalThis.fetch = (url, opts = {}) => {
    const u = typeof url === 'string' ? url : url?.url || String(url);
    if (u.startsWith('/api/sec/')) return origFetch('https://www.sec.gov/' + u.slice(9), { ...opts, headers: { ...opts.headers, 'User-Agent': SEC_UA, Accept: 'application/json' } });
    if (u.startsWith('/api/edgar/')) return origFetch('https://data.sec.gov/' + u.slice(11), { ...opts, headers: { ...opts.headers, 'User-Agent': SEC_UA, Accept: 'application/json' } });
    if (u.startsWith('/data/')) return origFetch('https://api.thesis-investing.com' + u, opts);
    if (u.startsWith('/api/finviz/') || u.startsWith('/api/yahoo')) return Promise.resolve(new Response('{}', { status: 503 }));
    return origFetch(url, opts);
  };

  const MAX_10K = 5, MAX_10Q = 4;
  const SECTION_LIMIT_10K = 40000, SECTION_LIMIT_10Q = 15000;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: ${TICKER}`);
  console.log(`${'='.repeat(60)}`);

  // Phase 1: DataPacket
  const t0 = Date.now();
  console.log('\n[Phase 1] DataPacket...');
  const dp = await assembleDataPacket(TICKER);
  const t1 = Date.now();

  const ci = dp.companyInfo || {};
  const comp = dp.compensation;
  const execs = comp?.executives?.length || 0;
  const dirs = comp?.directors?.length || 0;
  console.log(`  ${ci.name || '?'} (SIC ${ci.sic || '?'})`);
  console.log(`  ${((t1-t0)/1000).toFixed(1)}s | Comp: ${execs}E/${dirs}D | Errors: ${(dp.errors||[]).length}`);

  // Validate
  const failures = [];
  for (const f of ['companyInfo','classification','financials','growthRates','fcf','keyMetrics']) {
    if (!dp[f]) failures.push(`missing: ${f}`);
  }
  if (dp.errors?.length) failures.push(`dp errors: ${dp.errors.join('; ')}`);

  if (failures.length) {
    console.log(`\nFAIL ${TICKER} Phase 1:`);
    failures.forEach(f => console.log(`  - ${f}`));
    process.exit(1);
  }
  console.log('  Phase 1: PASS');

  // Phase 2: Filing content
  console.log('\n[Phase 2] Filings...');
  const cik = ci.cik;
  const filings = dp.filings || [];
  const selected = [];
  let kCount = 0, qCount = 0;
  for (const f of filings) {
    if (f.primaryDocument?.endsWith('.xml')) continue;
    if (f.form === '10-K' && kCount < MAX_10K) { selected.push(f); kCount++; }
    else if (f.form === '10-Q' && qCount < MAX_10Q) { selected.push(f); qCount++; }
  }

  if (!selected.length || !cik) {
    console.log('  No filings to process');
    console.log(`\nRESULT: PASS ${TICKER} (DataPacket only)\n`);
    process.exit(0);
  }

  const withCik = selected.map(f => ({ ...f, cik }));
  const t2 = Date.now();
  const mdMap = await fetchFilingMarkdownBatch(withCik, (done, total) => {
    process.stdout.write(`\r  Fetching ${done}/${total}...`);
  });
  console.log('');
  const t3 = Date.now();

  // Extract sections
  const filingContent = {};
  for (const filing of withCik) {
    const result = mdMap.get(filing.accessionNumber);
    if (!result?.markdown) {
      if (result?.error) console.log(`  WARN: ${filing.accessionNumber}: ${result.error}`);
      continue;
    }
    const formType = filing.form === '10-Q' ? '10-Q' : '10-K';
    const sections = extractAllSections(result.markdown, formType);
    const limit = formType === '10-Q' ? SECTION_LIMIT_10Q : SECTION_LIMIT_10K;
    for (const k of Object.keys(sections)) {
      if (sections[k]?.length > limit) sections[k] = sections[k].slice(0, limit);
    }
    const charCount = Object.values(sections).reduce((s, v) => s + (v?.length || 0), 0);
    const key = `${filing.form}-${filing.filingDate}`;
    filingContent[key] = { sections, charCount, fromCache: result.fromCache };
  }

  const t4 = Date.now();
  const entries = Object.entries(filingContent);
  console.log(`  ${((t3-t2)/1000).toFixed(1)}s fetch | ${((t4-t3)/1000).toFixed(1)}s extract | ${entries.length}/${selected.length} filings`);

  for (const [key, val] of entries) {
    const secs = Object.keys(val.sections);
    const cached = val.fromCache ? '[cached]' : '[fresh]';
    console.log(`  ${key}: ${secs.join(', ')} (${val.charCount.toLocaleString()}ch) ${cached}`);
  }

  // Validate filings
  const fFailures = [];
  if (entries.length === 0) fFailures.push('0 filings with content');
  else if (entries.length < selected.length * 0.5) fFailures.push(`only ${entries.length}/${selected.length} have content`);

  if (fFailures.length) {
    console.log(`\nFAIL ${TICKER} Phase 2:`);
    fFailures.forEach(f => console.log(`  - ${f}`));
    process.exit(1);
  }

  const payload = { dataPacket: dp, filingContent, assembledAt: new Date().toISOString() };
  const size = JSON.stringify(payload).length;
  console.log(`\n  Total: ${((t4-t0)/1000).toFixed(1)}s | Payload: ${(size/1024).toFixed(0)} KB`);
  console.log(`\nRESULT: PASS ${TICKER}\n`);

  globalThis.fetch = origFetch;
  await vite.close();
  process.exit(0);

} catch (err) {
  console.error(`\nFAIL ${TICKER}: ${err.message}`);
  await vite.close();
  process.exit(1);
}
