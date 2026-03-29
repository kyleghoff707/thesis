/**
 * wms-fy-diagnostic.test.mjs — Diagnose WMS (Advanced Drainage Systems) FY labeling
 *
 * WMS has a March 31 FY-end. Some EDGAR entries reportedly have wrong `fy` labels.
 * This test fetches raw company facts and inspects all 10-Q entries for revenue
 * (duration tag) and assets (instant tag) to flag fy mismatches.
 *
 * Run with: npx vitest run scripts/wms-fy-diagnostic.test.mjs --reporter=verbose
 */

import { describe, it, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const EDGAR_CACHE_DIR = path.join(ROOT, 'src/engines/__tests__/fixtures/morningstar/edgar-cache');

// ─── Fetch Interceptor (caches SEC responses to disk) ──────────
const SEC_HEADERS = {
  'User-Agent': 'StockAnalyzer/1.0 kylehoff@example.com',
  'Accept-Encoding': 'identity',
};

let requestCount = 0;
let cacheHits = 0;
let lastRequestTime = 0;
const originalFetch = globalThis.fetch;

globalThis.fetch = async function interceptedFetch(url, opts = {}) {
  let resolved = typeof url === 'string' ? url : url.toString();

  if (resolved.startsWith('/api/edgar/')) {
    resolved = 'https://data.sec.gov/' + resolved.slice('/api/edgar/'.length);
  } else if (resolved.startsWith('/api/sec/')) {
    resolved = 'https://www.sec.gov/' + resolved.slice('/api/sec/'.length);
  }

  if (!resolved.includes('sec.gov') && !resolved.includes('data.sec.gov')) {
    return originalFetch(url, opts);
  }

  const cacheKey = resolved.replace(/[^a-zA-Z0-9.-]/g, '_').slice(0, 200);
  const cachePath = path.join(EDGAR_CACHE_DIR, cacheKey + '.json');

  if (fs.existsSync(cachePath)) {
    cacheHits++;
    const data = fs.readFileSync(cachePath, 'utf-8');
    return new Response(data, {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }

  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < 100) {
    await new Promise(r => setTimeout(r, 100 - elapsed));
  }
  lastRequestTime = Date.now();
  requestCount++;

  const resp = await originalFetch(resolved, {
    ...opts,
    headers: { ...SEC_HEADERS, ...opts.headers },
  });

  if (resp.ok) {
    const text = await resp.text();
    fs.mkdirSync(EDGAR_CACHE_DIR, { recursive: true });
    fs.writeFileSync(cachePath, text);
    return new Response(text, {
      status: resp.status,
      headers: { 'content-type': 'application/json' },
    });
  }

  return resp;
};

// ─── Helpers ────────────────────────────────────────────────────

/**
 * For WMS (FY ends March 31), compute what the "date-derived FY" should be.
 *
 * Duration tags (revenue): FY = year of end-date if end-month <= 3, else end-year + 1
 *   e.g. end=2023-09-30 → FY2024, end=2024-03-31 → FY2024
 *
 * Instant tags (assets): FY = year of end-date if end-month <= 3, else end-year + 1
 *   Same logic — an instant on 2023-09-30 belongs to FY2024 (ends Mar 2024).
 */
function deriveFY(endDate, fyEndMonth = 3) {
  const [yr, mo] = endDate.split('-').map(Number);
  // If the end date is at or before the FY-end month, it belongs to that calendar year's FY
  // If after, it belongs to the next calendar year's FY
  return mo <= fyEndMonth ? yr : yr + 1;
}

function padRight(str, len) {
  str = String(str);
  return str.length >= len ? str : str + ' '.repeat(len - str.length);
}

function padLeft(str, len) {
  str = String(str);
  return str.length >= len ? str : ' '.repeat(len - str.length) + str;
}

function printTable(headers, rows) {
  const widths = headers.map((h, i) => {
    return Math.max(h.length, ...rows.map(r => String(r[i] ?? '').length));
  });

  const sep = widths.map(w => '-'.repeat(w)).join('-+-');
  const headerLine = headers.map((h, i) => padRight(h, widths[i])).join(' | ');

  console.log(headerLine);
  console.log(sep);
  for (const row of rows) {
    const line = row.map((v, i) => {
      const s = String(v ?? '');
      // Right-align numeric-looking columns
      return (i >= 4 && i <= 4) ? padLeft(s, widths[i]) : padRight(s, widths[i]);
    }).join(' | ');
    console.log(line);
  }
}

// ─── Main Diagnostic ───────────────────────────────────────────

describe('WMS FY Diagnostic', () => {
  let lookupCIK, fetchCompanyFacts;

  beforeAll(async () => {
    const edgar = await import('../src/engines/edgar.js');
    lookupCIK = edgar.lookupCIK;
    fetchCompanyFacts = edgar.fetchCompanyFacts;
  }, 30000);

  it('diagnose WMS revenue (duration) and assets (instant) FY labels', async () => {
    const cik = await lookupCIK('WMS');
    console.log(`\nWMS CIK: ${cik}`);

    const facts = await fetchCompanyFacts(cik);
    if (!facts) throw new Error('Failed to fetch WMS company facts');

    // ─── Identify which revenue tag WMS uses ────────────────
    const revenueTags = [
      'Revenues',
      'RevenueFromContractWithCustomerExcludingAssessedTax',
      'RevenueFromContractWithCustomerIncludingAssessedTax',
      'SalesRevenueNet',
      'SalesRevenueGoodsNet',
    ];

    const usGaap = facts.facts?.['us-gaap'] || {};
    let revenueTag = null;
    for (const tag of revenueTags) {
      const entries = usGaap[tag]?.units?.USD;
      if (entries && entries.length > 0) {
        const q10Entries = entries.filter(e => e.form === '10-Q');
        if (q10Entries.length > 0) {
          revenueTag = tag;
          break;
        }
      }
    }

    if (!revenueTag) {
      console.log('Available revenue-like tags:');
      for (const tag of revenueTags) {
        const entries = usGaap[tag]?.units?.USD;
        console.log(`  ${tag}: ${entries ? entries.length + ' entries' : 'NOT FOUND'}`);
      }
      throw new Error('No revenue tag found with 10-Q entries');
    }

    console.log(`\nUsing revenue tag: ${revenueTag}`);

    // ─── DURATION TAG: Revenue 10-Q entries ─────────────────
    const revEntries = usGaap[revenueTag].units.USD
      .filter(e => e.form === '10-Q')
      .sort((a, b) => a.end.localeCompare(b.end) || a.filed.localeCompare(b.filed));

    console.log(`\n${'='.repeat(120)}`);
    console.log(`DURATION TAG: ${revenueTag} — All 10-Q entries (${revEntries.length} total)`);
    console.log(`${'='.repeat(120)}`);

    const revRows = revEntries.map(e => {
      const derivedFY = deriveFY(e.end, 3);
      const mismatch = e.fy !== derivedFY;
      return [
        e.fy,
        e.fp,
        e.start,
        e.end,
        (e.val / 1e6).toFixed(1) + 'M',
        e.form,
        e.filed,
        derivedFY,
        mismatch ? `*** MISMATCH (fy=${e.fy}, derived=${derivedFY}) ***` : '',
      ];
    });

    printTable(
      ['fy', 'fp', 'start', 'end', 'val', 'form', 'filed', 'derivedFY', 'flag'],
      revRows
    );

    // ─── Group by fy + fp ──────────────────────────────────
    console.log(`\n${'─'.repeat(80)}`);
    console.log('Revenue grouped by fy + fp:');
    console.log(`${'─'.repeat(80)}`);

    const revGrouped = {};
    for (const e of revEntries) {
      const key = `FY${e.fy} ${e.fp}`;
      if (!revGrouped[key]) revGrouped[key] = [];
      revGrouped[key].push(e);
    }

    for (const [key, entries] of Object.entries(revGrouped).sort()) {
      const summary = entries.map(e => {
        const derivedFY = deriveFY(e.end, 3);
        const flag = e.fy !== derivedFY ? ' *** WRONG FY ***' : '';
        return `  ${e.start} → ${e.end} = ${(e.val / 1e6).toFixed(1)}M (filed ${e.filed})${flag}`;
      }).join('\n');
      console.log(`\n${key} (${entries.length} entries):`);
      console.log(summary);
    }

    // ─── Mismatch summary for revenue ──────────────────────
    const revMismatches = revEntries.filter(e => e.fy !== deriveFY(e.end, 3));
    console.log(`\n${'─'.repeat(80)}`);
    console.log(`Revenue FY mismatches: ${revMismatches.length} of ${revEntries.length}`);
    if (revMismatches.length > 0) {
      for (const e of revMismatches) {
        const derived = deriveFY(e.end, 3);
        console.log(`  fy=${e.fy} fp=${e.fp} end=${e.end} → derivedFY=${derived} (off by ${e.fy - derived})`);
      }
    }
    console.log(`${'─'.repeat(80)}`);

    // ─── INSTANT TAG: Assets 10-Q entries ──────────────────
    const assetEntries = (usGaap['Assets']?.units?.USD || [])
      .filter(e => e.form === '10-Q')
      .sort((a, b) => a.end.localeCompare(b.end) || a.filed.localeCompare(b.filed));

    console.log(`\n${'='.repeat(120)}`);
    console.log(`INSTANT TAG: Assets — All 10-Q entries (${assetEntries.length} total)`);
    console.log(`${'='.repeat(120)}`);

    const assetRows = assetEntries.map(e => {
      const derivedFY = deriveFY(e.end, 3);
      const mismatch = e.fy !== derivedFY;
      return [
        e.fy,
        e.fp,
        e.start || '(instant)',
        e.end,
        (e.val / 1e6).toFixed(1) + 'M',
        e.form,
        e.filed,
        derivedFY,
        mismatch ? `*** MISMATCH (fy=${e.fy}, derived=${derivedFY}) ***` : '',
      ];
    });

    printTable(
      ['fy', 'fp', 'start', 'end', 'val', 'form', 'filed', 'derivedFY', 'flag'],
      assetRows
    );

    // ─── Group by fy + fp for assets ───────────────────────
    console.log(`\n${'─'.repeat(80)}`);
    console.log('Assets grouped by fy + fp:');
    console.log(`${'─'.repeat(80)}`);

    const assetGrouped = {};
    for (const e of assetEntries) {
      const key = `FY${e.fy} ${e.fp}`;
      if (!assetGrouped[key]) assetGrouped[key] = [];
      assetGrouped[key].push(e);
    }

    for (const [key, entries] of Object.entries(assetGrouped).sort()) {
      const summary = entries.map(e => {
        const derivedFY = deriveFY(e.end, 3);
        const flag = e.fy !== derivedFY ? ' *** WRONG FY ***' : '';
        return `  ${e.end} = ${(e.val / 1e6).toFixed(1)}M (filed ${e.filed})${flag}`;
      }).join('\n');
      console.log(`\n${key} (${entries.length} entries):`);
      console.log(summary);
    }

    // ─── Mismatch summary for assets ───────────────────────
    const assetMismatches = assetEntries.filter(e => e.fy !== deriveFY(e.end, 3));
    console.log(`\n${'─'.repeat(80)}`);
    console.log(`Assets FY mismatches: ${assetMismatches.length} of ${assetEntries.length}`);
    if (assetMismatches.length > 0) {
      for (const e of assetMismatches) {
        const derived = deriveFY(e.end, 3);
        console.log(`  fy=${e.fy} fp=${e.fp} end=${e.end} → derivedFY=${derived} (off by ${e.fy - derived})`);
      }
    }
    console.log(`${'─'.repeat(80)}`);

    // ─── Cross-reference with Morningstar fixture ──────────
    const fixturePath = path.join(ROOT, 'src/engines/__tests__/fixtures/morningstar-quarterly/WMS.json');
    if (fs.existsSync(fixturePath)) {
      const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));
      console.log(`\n${'='.repeat(80)}`);
      console.log(`MORNINGSTAR FIXTURE QUARTERS (FY-end: ${fixture.fiscalYearEnd})`);
      console.log(`${'='.repeat(80)}`);

      const msIncome = fixture.statements?.income || {};
      const msQuarters = Object.keys(msIncome).filter(q => q.startsWith('Q'));
      console.log(`Available quarters: ${msQuarters.join(', ')}`);

      // Show revenue per MS quarter
      console.log('\nMS Revenue per quarter:');
      for (const q of msQuarters.sort()) {
        const rev = msIncome[q]?.['Total Revenue'];
        console.log(`  ${q}: ${rev != null ? (rev / 1e6).toFixed(1) + 'M' : 'null'}`);
      }

      // Try to match MS quarters to EDGAR entries
      console.log('\n' + '-'.repeat(80));
      console.log('MS ↔ EDGAR matching attempt:');
      console.log('-'.repeat(80));

      for (const msQ of msQuarters.sort()) {
        const match = msQ.match(/^Q(\d)\s+(\d{4})$/);
        if (!match) continue;
        const qNum = parseInt(match[1]);
        const msYear = parseInt(match[2]);
        const msRev = msIncome[msQ]?.['Total Revenue'];

        // Find EDGAR entries with matching value
        const matchingEdgar = revEntries.filter(e => {
          if (msRev == null) return false;
          return Math.abs((e.val - msRev) / msRev) < 0.005; // within 0.5%
        });

        if (matchingEdgar.length > 0) {
          for (const e of matchingEdgar) {
            const derivedFY = deriveFY(e.end, 3);
            console.log(`  ${msQ} (${msRev != null ? (msRev / 1e6).toFixed(1) + 'M' : 'null'}) → EDGAR fy=${e.fy} fp=${e.fp} end=${e.end} derivedFY=${derivedFY} ${e.fy !== derivedFY ? '*** FY MISMATCH ***' : ''}`);
          }
        } else {
          console.log(`  ${msQ} (${msRev != null ? (msRev / 1e6).toFixed(1) + 'M' : 'null'}) → NO EDGAR MATCH FOUND`);
        }
      }
    }

    // ─── Final summary ──────────────────────────────────────
    console.log(`\n${'='.repeat(80)}`);
    console.log('SUMMARY');
    console.log(`${'='.repeat(80)}`);
    console.log(`Revenue tag: ${revenueTag}`);
    console.log(`Total 10-Q revenue entries: ${revEntries.length}`);
    console.log(`Revenue FY mismatches: ${revMismatches.length}`);
    console.log(`Total 10-Q asset entries: ${assetEntries.length}`);
    console.log(`Asset FY mismatches: ${assetMismatches.length}`);
    console.log(`SEC requests: ${requestCount}, Cache hits: ${cacheHits}`);

  }, 60000);
});
