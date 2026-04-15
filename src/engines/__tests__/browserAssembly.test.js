// Integration test: full browser-side DataPacket + filing assembly.
// Mirrors exactly what useAssembleData.js does.
// Run: npm test -- --run -t "browser assembly"
//
// Installs a fetch interceptor to rewrite Vite proxy URLs to direct SEC URLs
// (same pattern as the Worker's fetch interceptor in assembleDataPacket.js).

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import '../../../api/src/shims/domino-polyfill.js'; // DOMParser for Node.js (filingMarkdown needs it)
import { assembleDataPacket } from '../dataExport';
import { fetchFilingMarkdownBatch } from '../filingMarkdown';
import { extractAllSections } from '../filingSections';

// ─── Fetch interceptor for Vitest ──────────────────────────
// In Vitest, import.meta.env.DEV = true, so apiBase.js produces relative
// URLs like /api/sec/... and /api/edgar/... which fail without a dev server.
// This interceptor rewrites them to direct SEC/EDGAR URLs.
const SEC_UA = 'Thes1s/1.0 kylehoff@thes1sinvesting.com';
let origFetch;

function installFetchInterceptor() {
  origFetch = globalThis.fetch;
  globalThis.fetch = (url, opts = {}) => {
    const urlStr = typeof url === 'string' ? url : url?.url || String(url);

    // /api/sec/ → https://www.sec.gov/
    if (urlStr.startsWith('/api/sec/')) {
      const direct = 'https://www.sec.gov/' + urlStr.slice('/api/sec/'.length);
      return origFetch(direct, { ...opts, headers: { ...opts.headers, 'User-Agent': SEC_UA, 'Accept': 'application/json' } });
    }
    // /api/edgar/ → https://data.sec.gov/
    if (urlStr.startsWith('/api/edgar/')) {
      const direct = 'https://data.sec.gov/' + urlStr.slice('/api/edgar/'.length);
      return origFetch(direct, { ...opts, headers: { ...opts.headers, 'User-Agent': SEC_UA, 'Accept': 'application/json' } });
    }
    // /data/ → https://api.thes1sinvesting.com/data/
    if (urlStr.startsWith('/data/')) {
      return origFetch('https://api.thes1sinvesting.com' + urlStr, opts);
    }
    // /api/finviz/, /api/yahoo* → skip (return empty)
    if (urlStr.startsWith('/api/finviz/') || urlStr.startsWith('/api/yahoo')) {
      return Promise.resolve(new Response('{}', { status: 503 }));
    }

    return origFetch(url, opts);
  };
}

function restoreFetch() {
  if (origFetch) globalThis.fetch = origFetch;
}

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

// This test makes real network calls to SEC EDGAR — skip in CI.
// Run manually: npm test -- --run -t "browser assembly: TICKER"
describe.skip('browser assembly', () => {
  beforeAll(() => installFetchInterceptor());
  afterAll(() => restoreFetch());

  async function testTicker(ticker) {
    // Phase 1: DataPacket
    const dp = await assembleDataPacket(ticker);
    expect(dp).toBeTruthy();
    expect(dp.companyInfo).toBeTruthy();
    expect(dp.financials).toBeTruthy();
    expect(dp.growthRates).toBeTruthy();

    const ci = dp.companyInfo;
    const comp = dp.compensation;
    console.log(`  ${ci.name} | Comp: ${comp?.executives?.length || 0}E/${comp?.directors?.length || 0}D`);

    // Phase 2: Filing selection + markdown
    const cik = ci.cik;
    const selected = selectFilings(dp.filings);
    expect(selected.length).toBeGreaterThan(0);

    const filingsWithCik = selected.map(f => ({ ...f, cik }));
    console.log(`  Selected ${filingsWithCik.length} filings, CIK: ${cik}`);
    if (filingsWithCik[0]) console.log(`  First: ${filingsWithCik[0].form} ${filingsWithCik[0].filingDate} ${filingsWithCik[0].primaryDocument?.slice(0, 40)}`);
    const markdownMap = await fetchFilingMarkdownBatch(filingsWithCik);
    console.log(`  Markdown results: ${markdownMap.size}`);
    for (const [acc, result] of markdownMap) {
      console.log(`    ${acc}: md=${result.markdown?.length || 0}ch, err=${result.error || 'none'}, skip=${result.skipped || false}`);
    }

    // Phase 3: Section extraction
    const filingContent = {};
    for (const filing of filingsWithCik) {
      const result = markdownMap.get(filing.accessionNumber);
      if (!result?.markdown) continue;

      const formType = filing.form === '10-Q' ? '10-Q' : '10-K';
      const sections = extractAllSections(result.markdown, formType);
      const limit = formType === '10-Q' ? SECTION_LIMIT_10Q : SECTION_LIMIT_10K;
      for (const key of Object.keys(sections)) {
        if (sections[key]?.length > limit) sections[key] = sections[key].slice(0, limit);
      }

      const charCount = Object.values(sections).reduce((sum, s) => sum + (s?.length || 0), 0);
      filingContent[`${filing.form}-${filing.filingDate}`] = { sections, charCount, fromCache: result.fromCache };
    }

    // Verify
    const filingKeys = Object.keys(filingContent);
    expect(filingKeys.length).toBeGreaterThan(0);

    for (const [key, val] of Object.entries(filingContent)) {
      const secs = Object.keys(val.sections);
      const cached = val.fromCache ? '[cached]' : '[fresh]';
      console.log(`  ${key}: ${secs.join(', ')} (${val.charCount.toLocaleString()}ch) ${cached}`);
    }

    // Payload size
    const payload = { dataPacket: dp, filingContent, assembledAt: new Date().toISOString() };
    const size = JSON.stringify(payload).length;
    console.log(`  Payload: ${(size / 1024).toFixed(0)} KB`);

    return { dp, filingContent, payloadSize: size };
  }

  it('SBUX', async () => {
    const { dp, filingContent, payloadSize } = await testTicker('SBUX');
    expect(Object.keys(filingContent).length).toBeGreaterThanOrEqual(3);
    expect(payloadSize).toBeLessThan(5 * 1024 * 1024); // under 5MB
  }, 300_000);

  it('TDG', async () => {
    const { dp, filingContent, payloadSize } = await testTicker('TDG');
    expect(Object.keys(filingContent).length).toBeGreaterThanOrEqual(3);
    expect(payloadSize).toBeLessThan(5 * 1024 * 1024);
  }, 300_000);

  it('PEP', async () => {
    const { dp, filingContent, payloadSize } = await testTicker('PEP');
    expect(Object.keys(filingContent).length).toBeGreaterThanOrEqual(3);
    expect(payloadSize).toBeLessThan(5 * 1024 * 1024);
  }, 300_000);
});
