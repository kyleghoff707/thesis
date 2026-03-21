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

let fetchCompanyFacts;

describe('XBRL Accrued Tags Detail', () => {
  beforeAll(async () => {
    const mod = await import('../src/engines/edgarFinancials.js');
    fetchCompanyFacts = mod.fetchCompanyFacts;
  }, 10000);

  it('examine AccruedLiabilitiesCurrent vs AccountsPayableAndAccruedLiabilitiesCurrent for CMG', async () => {
    console.log('\n\n═══ CMG: AccruedLiabilitiesCurrent vs AccountsPayableAndAccruedLiabilitiesCurrent ═══');
    const facts = await fetchCompanyFacts('CMG');
    if (!facts) { console.log('Failed to fetch facts'); return; }
    
    const accruedCurrent = facts['us-gaap:AccruedLiabilitiesCurrent'] || {};
    const payablesAccrued = facts['us-gaap:AccountsPayableAndAccruedLiabilitiesCurrent'] || {};
    const accountsPayable = facts['us-gaap:AccountsPayableCurrent'] || {};
    
    console.log('\nAccruedLiabilitiesCurrent (what XBRL spec expects for "accrued expenses"):');
    for (const unit of Object.keys(accruedCurrent).filter(u => u.includes('USD'))) {
      const vals = accruedCurrent[unit];
      console.log(`  Unit: ${unit}`);
      const sorted = Object.entries(vals).filter(v => v[1].filed).sort((a,b) => b[0].localeCompare(a[0])).slice(0, 5);
      for (const [date, val] of sorted) {
        console.log(`    ${date.slice(0,10)}: ${(val.val/1e9).toFixed(3)}B`);
      }
    }
    
    console.log('\nAccountsPayableAndAccruedLiabilitiesCurrent (combined field):');
    for (const unit of Object.keys(payablesAccrued).filter(u => u.includes('USD'))) {
      const vals = payablesAccrued[unit];
      console.log(`  Unit: ${unit}`);
      const sorted = Object.entries(vals).filter(v => v[1].filed).sort((a,b) => b[0].localeCompare(a[0])).slice(0, 5);
      for (const [date, val] of sorted) {
        console.log(`    ${date.slice(0,10)}: ${(val.val/1e9).toFixed(3)}B`);
      }
    }
    
    console.log('\nAccountsPayableCurrent (standalone AP):');
    for (const unit of Object.keys(accountsPayable).filter(u => u.includes('USD'))) {
      const vals = accountsPayable[unit];
      console.log(`  Unit: ${unit}`);
      const sorted = Object.entries(vals).filter(v => v[1].filed).sort((a,b) => b[0].localeCompare(a[0])).slice(0, 5);
      for (const [date, val] of sorted) {
        console.log(`    ${date.slice(0,10)}: ${(val.val/1e9).toFixed(3)}B`);
      }
    }
  }, 300000);

  it('examine NEE (NULL case) — what tags exist', async () => {
    console.log('\n\n═══ NEE: Which tags exist? ═══');
    const facts = await fetchCompanyFacts('NEE');
    if (!facts) { console.log('Failed to fetch facts'); return; }
    
    const accruedCurrent = facts['us-gaap:AccruedLiabilitiesCurrent'] || {};
    const payablesAccrued = facts['us-gaap:AccountsPayableAndAccruedLiabilitiesCurrent'] || {};
    const accountsPayable = facts['us-gaap:AccountsPayableCurrent'] || {};
    const employeeRelated = facts['us-gaap:EmployeeRelatedLiabilitiesCurrent'] || {};
    
    console.log('Tags found in NEE:');
    console.log(`  AccruedLiabilitiesCurrent: ${Object.keys(accruedCurrent).length > 0 ? 'YES' : 'NO'}`);
    console.log(`  AccountsPayableAndAccruedLiabilitiesCurrent: ${Object.keys(payablesAccrued).length > 0 ? 'YES' : 'NO'}`);
    console.log(`  AccountsPayableCurrent: ${Object.keys(accountsPayable).length > 0 ? 'YES' : 'NO'}`);
    console.log(`  EmployeeRelatedLiabilitiesCurrent: ${Object.keys(employeeRelated).length > 0 ? 'YES' : 'NO'}`);
    
    // Search for all liabilities with "accrued" in name
    const allAccrued = Object.keys(facts).filter(k => k.toLowerCase().includes('accrued')).filter(k => !k.includes('nci'));
    console.log(`\nAll tags with 'accrued' in name: ${allAccrued.length}`);
    for (const tag of allAccrued) {
      const tagFacts = facts[tag] || {};
      const hasValues = Object.values(tagFacts).some(u => Object.keys(u).length > 0);
      console.log(`  ${tag}: ${hasValues ? 'HAS DATA' : 'no data'}`);
    }
  }, 300000);
});
