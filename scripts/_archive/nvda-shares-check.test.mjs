import { describe, it, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, '..', 'src', 'engines', '__tests__', 'fixtures', 'morningstar', 'edgar-cache');

const originalFetch = globalThis.fetch;
globalThis.fetch = async function(url, opts = {}) {
  let resolved = typeof url === 'string' ? url : url.toString();
  if (resolved.startsWith('/api/edgar/')) resolved = 'https://data.sec.gov/' + resolved.slice('/api/edgar/'.length);
  if (resolved.startsWith('/api/sec/')) resolved = 'https://www.sec.gov/' + resolved.slice('/api/sec/'.length);
  if (!resolved.includes('sec.gov')) return originalFetch(url, opts);
  const cacheKey = resolved.replace(/[^a-zA-Z0-9.-]/g, '_').slice(0, 200);
  const cachePath = path.join(CACHE_DIR, cacheKey);
  if (fs.existsSync(cachePath)) {
    const data = fs.readFileSync(cachePath, 'utf8');
    return { ok: true, json: () => JSON.parse(data), text: () => data };
  }
  const now = Date.now();
  const wait = Math.max(0, 110 - (now - (globalThis._lastReq || 0)));
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  globalThis._lastReq = Date.now();
  const res = await originalFetch(resolved, { ...opts, headers: { 'User-Agent': 'StockAnalyzer/1.0 test', ...opts.headers }});
  if (res.ok) {
    const text = await res.text();
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(cachePath, text);
    return { ok: true, json: () => JSON.parse(text), text: () => text };
  }
  return res;
};

describe('NVDA Shares Check', () => {
  it('check share values from engine', async () => {
    const { fetchEdgarQuarterly } = await import('../src/engines/edgarFinancials.js');
    const result = await fetchEdgarQuarterly('NVDA');

    console.log('=== NVDA Engine Share Counts (basic_average_shares) ===');
    for (const fy of [2022, 2023, 2024, 2025]) {
      for (const qtr of ['Q1', 'Q2', 'Q3', 'Q4']) {
        const val = result.quarterly[fy]?.[qtr]?.income?.basic_average_shares;
        if (val != null) {
          console.log(`FY${fy} ${qtr}: ${val.toLocaleString()}`);
        }
      }
    }

    console.log('\n=== Fiscal Months ===');
    for (const fy of [2022, 2023, 2024, 2025]) {
      console.log(`FY${fy}: ${result.fiscalMonths?.[fy]}`);
    }

    // Also check splits
    const { fetchSplits, cumulativeSplitFactor } = await import('../src/engines/splits.js');
    const splits = await fetchSplits('NVDA');
    console.log('\n=== NVDA Splits ===');
    for (const s of splits) {
      console.log(`  date=${s.date} ratio=${s.ratio}`);
    }
    console.log('\n=== Cumulative Split Factors ===');
    for (const fy of [2021, 2022, 2023, 2024, 2025]) {
      const factor = cumulativeSplitFactor(splits, fy, 'Jan');
      console.log(`FY${fy}: factor=${factor}`);
    }
  });
});
