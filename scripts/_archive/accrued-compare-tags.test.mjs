import { describe, it, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ANNUAL_DIR = path.join(__dirname, '..', 'src', 'engines', '__tests__', 'fixtures', 'morningstar');
const EDGAR_CACHE_DIR = path.join(ANNUAL_DIR, 'edgar-cache');

const SEC_HEADERS = { 'User-Agent': 'StockAnalyzer/1.0 kylehoff@example.com', 'Accept-Encoding': 'identity' };
let lastRequestTime = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = async function(url, opts = {}) {
  let resolved = typeof url === 'string' ? url : url.toString();
  if (resolved.startsWith('/api/edgar/')) resolved = 'https://data.sec.gov/' + resolved.slice('/api/edgar/'.length);
  else if (resolved.startsWith('/api/sec/')) resolved = 'https://www.sec.gov/' + resolved.slice('/api/sec/'.length);
  if (!resolved.includes('sec.gov')) return originalFetch(url, opts);
  const cacheKey = resolved.replace(/[^a-zA-Z0-9.-]/g, '_').slice(0, 200);
  const cachePath = path.join(EDGAR_CACHE_DIR, cacheKey + '.json');
  if (fs.existsSync(cachePath)) {
    return new Response(fs.readFileSync(cachePath, 'utf-8'), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  const now = Date.now();
  if (now - lastRequestTime < 100) await new Promise(r => setTimeout(r, 100 - (now - lastRequestTime)));
  lastRequestTime = Date.now();
  const resp = await originalFetch(resolved, { ...opts, headers: { ...SEC_HEADERS, ...opts.headers } });
  if (resp.ok) {
    const text = await resp.text();
    fs.mkdirSync(EDGAR_CACHE_DIR, { recursive: true });
    fs.writeFileSync(cachePath, text);
    return new Response(text, { status: resp.status, headers: { 'content-type': 'application/json' } });
  }
  return resp;
};

let fetchEdgarStatements;

describe('Tag Comparison', () => {
  beforeAll(async () => {
    const mod = await import('../src/engines/edgarFinancials.js');
    fetchEdgarStatements = mod.fetchEdgarStatements;
  }, 10000);

  it('CMG vs AMT: which tags have data', async () => {
    console.log('\n\n═══ CMG (ALWAYS LOWER: 51% of MS) vs AMT (ALWAYS HIGHER: 155% of MS) ═══\n');
    
    for (const ticker of ['CMG', 'AMT']) {
      const data = await fetchEdgarStatements(ticker);
      const mostRecent = data.annual[Math.max(...Object.keys(data.annual).map(Number))];
      
      console.log(`\n${ticker} Balance Sheet 2024 (most recent):`);
      console.log(`  accrued_liabilities: ${mostRecent.balance?.accrued_liabilities != null ? (mostRecent.balance.accrued_liabilities / 1e9).toFixed(3) + 'B' : 'NULL'}`);
      console.log(`  payables_and_accrued: ${mostRecent.balance?.payables_and_accrued != null ? (mostRecent.balance.payables_and_accrued / 1e9).toFixed(3) + 'B' : 'NULL'}`);
      console.log(`  accounts_payable: ${mostRecent.balance?.accounts_payable != null ? (mostRecent.balance.accounts_payable / 1e9).toFixed(3) + 'B' : 'NULL'}`);
    }
  }, 300000);
});
