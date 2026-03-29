/**
 * quarterly-diagnostic.test.js — Diagnose quarterly accuracy failures
 *
 * Run with: npx vitest run scripts/quarterly-diagnostic.mjs --reporter=verbose
 *
 * This is a diagnostic test that compares EDGAR quarterly engine output
 * vs Morningstar fixtures for AAPL and LULU. It prints detailed side-by-side
 * comparison tables to identify systematic failure patterns.
 */

import { describe, it, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const FIXTURES_DIR = path.join(ROOT, 'src/engines/__tests__/fixtures/morningstar-quarterly');
const ANNUAL_FIXTURES_DIR = path.join(ROOT, 'src/engines/__tests__/fixtures/morningstar');
const EDGAR_CACHE_DIR = path.join(ANNUAL_FIXTURES_DIR, 'edgar-cache');

// ─── Fetch Interceptor (same as test) ──────────────────────────
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

// ─── Load Fixtures ──────────────────────────────────────────────
function loadFixture(ticker) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, `${ticker}.json`), 'utf-8'));
}

const fieldMapping = JSON.parse(
  fs.readFileSync(path.join(ANNUAL_FIXTURES_DIR, 'field-mapping.json'), 'utf-8')
);
const STMT_MAP = { income: 'income', balance_sheet: 'balance', cash_flow: 'cashFlow' };

let fetchEdgarQuarterly;

describe('Quarterly Diagnostic', () => {
  beforeAll(async () => {
    const mod = await import('../src/engines/edgarFinancials.js');
    fetchEdgarQuarterly = mod.fetchEdgarQuarterly;
  }, 15000);

  for (const ticker of ['AAPL', 'LULU']) {
    it(`diagnose ${ticker}`, async () => {
      const fixture = loadFixture(ticker);
      const engineData = await fetchEdgarQuarterly(ticker);

      console.log('\n' + '='.repeat(80));
      console.log(`DIAGNOSING: ${ticker}`);
      console.log('='.repeat(80));
      console.log(`Fiscal Year End: ${fixture.fiscalYearEnd}`);

      const msIncome = fixture.statements.income;
      const msQuarters = Object.keys(msIncome).filter(q => q !== 'TTM');
      console.log(`MS Income quarters: ${msQuarters.join(', ')}`);
      console.log(`Engine fiscal years: ${engineData.fiscalYears.join(', ')}`);

      // Print engine quarter structure with revenues
      console.log('\nEngine quarterly data structure:');
      for (const fy of engineData.fiscalYears) {
        const quarters = Object.keys(engineData.quarterly[fy] || {}).sort();
        const revs = quarters.map(q => {
          const rev = engineData.quarterly[fy]?.[q]?.income?.revenues;
          return `${q}=${rev != null ? (rev / 1e6).toFixed(0) + 'M' : 'null'}`;
        });
        console.log(`  FY${fy}: ${revs.join(', ') || '(empty)'}`);
      }

      // ─── Revenue Side-by-Side (offset=0) ──────────────────────
      console.log('\n' + '-'.repeat(80));
      console.log('REVENUE COMPARISON: MS quarter -> Engine FY/Q (offset=0)');
      console.log('-'.repeat(80));

      let matchCount = 0, missCount = 0, diffCount = 0;

      for (const msQ of msQuarters) {
        const match = msQ.match(/^Q(\d)\s+(\d{4})$/);
        if (!match) continue;
        const qNum = parseInt(match[1]);
        const msYear = parseInt(match[2]);
        const edgarQtr = `Q${qNum}`;

        const msRev = msIncome[msQ]['Total Revenue'];
        const engRev = engineData.quarterly[msYear]?.[edgarQtr]?.income?.revenues;

        let status, pctStr = '';
        if (engRev == null) {
          status = 'MISSING';
          missCount++;
        } else if (msRev != null && Math.abs((engRev - msRev) / msRev) < 0.01) {
          status = 'MATCH';
          matchCount++;
        } else {
          status = 'DIFF';
          diffCount++;
          if (msRev && engRev) pctStr = ((engRev - msRev) / msRev * 100).toFixed(1) + '%';
        }

        const msRevStr = msRev ? (msRev / 1e6).toFixed(0) + 'M' : 'N/A';
        const engRevStr = engRev ? (engRev / 1e6).toFixed(0) + 'M' : 'N/A';
        console.log(`  ${msQ.padEnd(10)} → FY${msYear}/Q${qNum}: MS=${msRevStr.padEnd(12)} Engine=${engRevStr.padEnd(12)} ${status} ${pctStr}`);
      }

      console.log(`\nRevenue summary: ${matchCount} match, ${missCount} missing, ${diffCount} diff`);

      // ─── For missing quarters, search for the MS revenue in other engine slots ───
      if (missCount > 0 || diffCount > 0) {
        console.log('\n' + '-'.repeat(80));
        console.log('CROSS-REFERENCE: Where does the MS revenue value exist in engine?');
        console.log('-'.repeat(80));

        for (const msQ of msQuarters) {
          const match = msQ.match(/^Q(\d)\s+(\d{4})$/);
          if (!match) continue;
          const qNum = parseInt(match[1]);
          const msYear = parseInt(match[2]);
          const edgarQtr = `Q${qNum}`;

          const msRev = msIncome[msQ]['Total Revenue'];
          const engRev = engineData.quarterly[msYear]?.[edgarQtr]?.income?.revenues;

          // Only for missing or diff
          if (engRev != null && msRev != null && Math.abs((engRev - msRev) / msRev) < 0.01) continue;

          // Search all engine FY/Q combos
          let foundAt = [];
          for (const fy of engineData.fiscalYears) {
            for (const q of ['Q1', 'Q2', 'Q3', 'Q4']) {
              const rev = engineData.quarterly[fy]?.[q]?.income?.revenues;
              if (rev != null && msRev != null && Math.abs((rev - msRev) / msRev) < 0.01) {
                foundAt.push(`FY${fy}/${q} (rev=${(rev / 1e6).toFixed(0)}M)`);
              }
            }
          }

          console.log(`  MS ${msQ} (rev=${msRev ? (msRev / 1e6).toFixed(0) + 'M' : 'N/A'}): ${foundAt.length > 0 ? 'FOUND at ' + foundAt.join(', ') : 'NOT FOUND in any engine slot'}`);
        }
      }

      // ─── Failure category analysis across ALL fields ──────────
      console.log('\n' + '-'.repeat(80));
      console.log('ALL-FIELD FAILURE ANALYSIS');
      console.log('-'.repeat(80));

      let totalMatch = 0, totalMissField = 0, totalMissQtr = 0, totalDiff = 0, totalCompared = 0;
      const failuresByField = {};
      const failuresByStmt = { income: { match: 0, diff: 0, miss: 0 }, balance_sheet: { match: 0, diff: 0, miss: 0 }, cash_flow: { match: 0, diff: 0, miss: 0 } };

      for (const [stmtKey, mappings] of Object.entries(fieldMapping)) {
        if (stmtKey === '_meta') continue;
        const engineStmtKey = STMT_MAP[stmtKey];

        for (const [msField, mapInfo] of Object.entries(mappings)) {
          if (!mapInfo.thesisField) continue;

          let fieldMatch = 0, fieldDiff = 0, fieldMiss = 0;

          for (const msQ of msQuarters) {
            const match = msQ.match(/^Q(\d)\s+(\d{4})$/);
            if (!match) continue;
            const qNum = parseInt(match[1]);
            const msYear = parseInt(match[2]);
            const edgarQtr = `Q${qNum}`;

            const msValue = fixture.statements[stmtKey]?.[msQ]?.[msField];
            if (msValue == null) continue;

            const engineQtr = engineData.quarterly[msYear]?.[edgarQtr];
            if (!engineQtr) {
              totalMissQtr++;
              fieldMiss++;
              failuresByStmt[stmtKey].miss++;
              continue;
            }

            const thesisValue = engineQtr[engineStmtKey]?.[mapInfo.thesisField];
            if (thesisValue == null) {
              totalMissField++;
              fieldMiss++;
              failuresByStmt[stmtKey].miss++;
              continue;
            }

            let adjustedMs = msValue;
            if (mapInfo.thesisField === 'effective_tax_rate') adjustedMs = msValue * 100;

            const expected = mapInfo.sign * adjustedMs;
            totalCompared++;

            if (Math.abs(expected) < 1 && Math.abs(thesisValue) < 1) {
              totalMatch++;
              fieldMatch++;
              failuresByStmt[stmtKey].match++;
            } else if (expected === 0) {
              if (Math.abs(thesisValue) < 1e6) { totalMatch++; fieldMatch++; failuresByStmt[stmtKey].match++; }
              else { totalDiff++; fieldDiff++; failuresByStmt[stmtKey].diff++; }
            } else {
              const pct = Math.abs((thesisValue - expected) / expected);
              const thresh = mapInfo.tolerance === 'exact' ? 0.01 : mapInfo.tolerance === 'close' ? 0.05 : mapInfo.tolerance === 'approximate' ? 0.10 : 0.20;
              if (pct <= thresh) {
                totalMatch++;
                fieldMatch++;
                failuresByStmt[stmtKey].match++;
              } else {
                totalDiff++;
                fieldDiff++;
                failuresByStmt[stmtKey].diff++;
              }
            }
          }

          if (fieldDiff > 0 || fieldMiss > 0) {
            failuresByField[`${mapInfo.thesisField} (${stmtKey})`] = { match: fieldMatch, diff: fieldDiff, miss: fieldMiss };
          }
        }
      }

      const overallPct = totalCompared > 0 ? ((totalMatch / totalCompared) * 100).toFixed(1) : '0.0';
      console.log(`\n  TOTAL: ${totalMatch}/${totalCompared} match (${overallPct}%) | ${totalDiff} diff | ${totalMissQtr} missing-quarter | ${totalMissField} missing-field`);

      console.log('\n  By statement type:');
      for (const [stmt, counts] of Object.entries(failuresByStmt)) {
        const total = counts.match + counts.diff;
        const pct = total > 0 ? ((counts.match / total) * 100).toFixed(1) : 'N/A';
        console.log(`    ${stmt.padEnd(16)}: ${counts.match}/${total} (${pct}%) match | ${counts.diff} diff | ${counts.miss} miss`);
      }

      // Top failing fields
      const sortedFailures = Object.entries(failuresByField)
        .sort((a, b) => (b[1].diff + b[1].miss) - (a[1].diff + a[1].miss))
        .slice(0, 15);

      if (sortedFailures.length > 0) {
        console.log('\n  Top failing fields:');
        for (const [field, counts] of sortedFailures) {
          console.log(`    ${field.padEnd(45)}: ${counts.diff} diff, ${counts.miss} miss (${counts.match} match)`);
        }
      }

      // Print sample DIFF values for top 5 failing fields
      console.log('\n' + '-'.repeat(80));
      console.log('SAMPLE DIFF VALUES (top failing fields)');
      console.log('-'.repeat(80));

      const topFields = sortedFailures.slice(0, 5).map(([f]) => f);

      for (const fieldKey of topFields) {
        const [thesisField, stmtInParen] = fieldKey.match(/^(.+?)\s+\((.+)\)$/)?.slice(1) || [];
        if (!thesisField) continue;

        console.log(`\n  ${fieldKey}:`);
        const engineStmtKey = STMT_MAP[stmtInParen];

        // Find the mapping entry
        let mapInfo = null, msFieldName = null;
        for (const [msF, info] of Object.entries(fieldMapping[stmtInParen] || {})) {
          if (info.thesisField === thesisField) { mapInfo = info; msFieldName = msF; break; }
        }
        if (!mapInfo) continue;

        let shown = 0;
        for (const msQ of msQuarters) {
          if (shown >= 5) break;
          const match = msQ.match(/^Q(\d)\s+(\d{4})$/);
          if (!match) continue;
          const qNum = parseInt(match[1]);
          const msYear = parseInt(match[2]);
          const edgarQtr = `Q${qNum}`;

          const msValue = fixture.statements[stmtInParen]?.[msQ]?.[msFieldName];
          if (msValue == null) continue;

          const engineQtr = engineData.quarterly[msYear]?.[edgarQtr];
          const thesisValue = engineQtr?.[engineStmtKey]?.[thesisField];
          if (thesisValue == null) continue;

          let adjustedMs = msValue;
          if (thesisField === 'effective_tax_rate') adjustedMs = msValue * 100;
          const expected = mapInfo.sign * adjustedMs;

          if (Math.abs(expected) > 1) {
            const pct = ((thesisValue - expected) / expected * 100).toFixed(1);
            const ratio = expected !== 0 ? (thesisValue / expected).toFixed(3) : 'N/A';
            console.log(`    ${msQ}: MS=${expected} Engine=${thesisValue} diff=${pct}% ratio=${ratio}`);
            shown++;
          }
        }
      }

      console.log(`\n  EDGAR API: ${requestCount} live requests, ${cacheHits} cache hits`);
    }, 120000);
  }

  // ─── Raw EDGAR data inspection ──────────────────────────────
  it('AAPL raw EDGAR revenue entries', async () => {
    // Fetch raw EDGAR companyfacts for AAPL
    const resp = await fetch('/api/edgar/api/xbrl/companyfacts/CIK0000320193.json');
    const facts = await resp.json();

    const revTag = facts?.facts?.['us-gaap']?.['RevenueFromContractWithCustomerExcludingAssessedTax'];
    const entries = revTag?.units?.USD || [];

    // Filter to 10-Q entries for FY2023 and FY2024
    console.log('\n' + '='.repeat(80));
    console.log('AAPL: Raw EDGAR Revenue entries for FY2023 and FY2024 (10-Q only)');
    console.log('='.repeat(80));

    for (const fy of [2023, 2024, 2025]) {
      console.log(`\n  FY${fy} entries:`);
      const fyEntries = entries.filter(e => e.form === '10-Q' && e.fy === fy);
      for (const e of fyEntries) {
        const dur = e.start ? Math.round((new Date(e.end) - new Date(e.start)) / (1000*60*60*24)) : 'N/A';
        console.log(`    fp=${e.fp} start=${e.start} end=${e.end} dur=${String(dur).padEnd(4)} filed=${e.filed} val=${(e.val/1e6).toFixed(0)}M`);
      }
    }

    // Also check 10-K entries for FY2023 and FY2024
    console.log('\n  10-K entries (FY2023, FY2024):');
    const kEntries = entries.filter(e => e.form === '10-K' && (e.fy === 2023 || e.fy === 2024));
    for (const e of kEntries) {
      const dur = e.start ? Math.round((new Date(e.end) - new Date(e.start)) / (1000*60*60*24)) : 'N/A';
      console.log(`    fy=${e.fy} fp=${e.fp} start=${e.start} end=${e.end} dur=${String(dur).padEnd(4)} filed=${e.filed} val=${(e.val/1e6).toFixed(0)}M`);
    }
  }, 30000);

  // ─── Raw EDGAR data inspection: LULU ─────────────────────────
  it('LULU raw EDGAR revenue entries', async () => {
    // Fetch raw EDGAR companyfacts for LULU (CIK 1397187)
    const resp = await fetch('/api/edgar/api/xbrl/companyfacts/CIK0001397187.json');
    const facts = await resp.json();

    const revTag = facts?.facts?.['us-gaap']?.['RevenueFromContractWithCustomerExcludingAssessedTax']
      || facts?.facts?.['us-gaap']?.['Revenues'];
    const tagName = facts?.facts?.['us-gaap']?.['RevenueFromContractWithCustomerExcludingAssessedTax'] ? 'RevenueFromContractWithCustomerExcludingAssessedTax' : 'Revenues';
    const entries = revTag?.units?.USD || [];

    console.log('\n' + '='.repeat(80));
    console.log(`LULU: Raw EDGAR ${tagName} entries for FY2024 and FY2025 (10-Q + 10-K)`);
    console.log('='.repeat(80));

    for (const fy of [2024, 2025]) {
      console.log(`\n  FY${fy} 10-Q entries:`);
      const fyEntries = entries.filter(e => e.form === '10-Q' && e.fy === fy);
      for (const e of fyEntries) {
        const dur = e.start ? Math.round((new Date(e.end) - new Date(e.start)) / (1000*60*60*24)) : 'N/A';
        console.log(`    fp=${e.fp} start=${e.start} end=${e.end} dur=${String(dur).padEnd(4)} filed=${e.filed} val=${(e.val/1e6).toFixed(0)}M`);
      }
      console.log(`  FY${fy} 10-K entries:`);
      const kEntries = entries.filter(e => e.form === '10-K' && e.fy === fy);
      for (const e of kEntries) {
        const dur = e.start ? Math.round((new Date(e.end) - new Date(e.start)) / (1000*60*60*24)) : 'N/A';
        console.log(`    fp=${e.fp} start=${e.start} end=${e.end} dur=${String(dur).padEnd(4)} filed=${e.filed} val=${(e.val/1e6).toFixed(0)}M`);
      }
    }

    // Now trace the de-cumulation for FY2025 Q4
    console.log('\n  FY2025 de-cumulation trace:');
    const fy25 = entries.filter(e => e.fy === 2025);
    const q3Entries = fy25.filter(e => e.form === '10-Q' && e.fp === 'Q3');
    const q3YTD = q3Entries.filter(e => e.start != null).sort((a, b) => {
      const durA = new Date(a.end) - new Date(a.start);
      const durB = new Date(b.end) - new Date(b.start);
      return durB - durA;
    });
    console.log(`  Q3 YTD candidates (sorted by duration):`);
    for (const e of q3YTD) {
      const dur = Math.round((new Date(e.end) - new Date(e.start)) / (1000*60*60*24));
      console.log(`    dur=${dur} val=${(e.val/1e6).toFixed(0)}M start=${e.start} end=${e.end} filed=${e.filed}`);
    }

    const fyTotal = entries.filter(e => e.form === '10-K' && e.fp === 'FY' && e.fy === 2025)
      .sort((a, b) => b.end.localeCompare(a.end))[0];
    if (fyTotal) {
      console.log(`  FY total: val=${(fyTotal.val/1e6).toFixed(0)}M start=${fyTotal.start} end=${fyTotal.end}`);
      const q3ytdVal = q3YTD[0]?.val;
      if (q3ytdVal) {
        console.log(`  Q4 de-cumulated = ${(fyTotal.val/1e6).toFixed(0)}M - ${(q3ytdVal/1e6).toFixed(0)}M = ${((fyTotal.val - q3ytdVal)/1e6).toFixed(0)}M`);
      }
    }

    // Check: does the engine get the right Q3 YTD?
    // The issue might be that comparative data from the prior year has longer duration
    console.log('\n  All FY2025 entries with start dates (checking for comparative confusion):');
    for (const e of fy25.filter(e => e.start != null && e.form === '10-Q')) {
      const dur = Math.round((new Date(e.end) - new Date(e.start)) / (1000*60*60*24));
      console.log(`    fp=${e.fp} dur=${dur} val=${(e.val/1e6).toFixed(0)}M start=${e.start} end=${e.end}`);
    }

    // Also check balance sheet for LULU — Assets entries
    console.log('\n' + '-'.repeat(80));
    console.log('LULU: Raw EDGAR Assets entries (balance sheet, instant) FY2024-2025');
    console.log('-'.repeat(80));

    const assetsTag = facts?.facts?.['us-gaap']?.['Assets'];
    const assetsEntries = assetsTag?.units?.USD || [];

    for (const fy of [2024, 2025]) {
      console.log(`\n  FY${fy} 10-Q Assets entries:`);
      const fyEntries = assetsEntries.filter(e => e.form === '10-Q' && e.fy === fy);
      for (const e of fyEntries) {
        console.log(`    fp=${e.fp} end=${e.end} filed=${e.filed} val=${(e.val/1e6).toFixed(0)}M`);
      }
    }
  }, 30000);

  // ─── Deep-dive: AAPL restated data / FY duplication ──────────
  it('AAPL restated data deep-dive', async () => {
    const fixture = loadFixture('AAPL');
    const engineData = await fetchEdgarQuarterly('AAPL');

    console.log('\n' + '='.repeat(80));
    console.log('AAPL: Restated data / FY duplication analysis');
    console.log('='.repeat(80));
    console.log('Q1 2023 matches EXACTLY but Q1 2024 shows FY2023 value.');
    console.log('Check if the engine picks up restated values from later filings.\n');

    // Check FY2023 vs FY2024 duplication
    console.log('AAPL FY2023 vs FY2024 revenue (checking for restatement leak):');
    for (const q of ['Q1', 'Q2', 'Q3', 'Q4']) {
      const fy23 = engineData.quarterly[2023]?.[q]?.income?.revenues;
      const fy24 = engineData.quarterly[2024]?.[q]?.income?.revenues;
      console.log(`  ${q}: FY2023=${fy23 != null ? (fy23 / 1e6).toFixed(0) + 'M' : 'N/A'}  FY2024=${fy24 != null ? (fy24 / 1e6).toFixed(0) + 'M' : 'N/A'}  ${fy23 === fy24 ? 'IDENTICAL!' : 'different'}`);
    }

    // Also check FY2024 vs FY2025
    console.log('\nAAPL FY2024 vs FY2025 revenue:');
    for (const q of ['Q1', 'Q2', 'Q3', 'Q4']) {
      const fy24 = engineData.quarterly[2024]?.[q]?.income?.revenues;
      const fy25 = engineData.quarterly[2025]?.[q]?.income?.revenues;
      console.log(`  ${q}: FY2024=${fy24 != null ? (fy24 / 1e6).toFixed(0) + 'M' : 'N/A'}  FY2025=${fy25 != null ? (fy25 / 1e6).toFixed(0) + 'M' : 'N/A'}  ${fy24 === fy25 ? 'IDENTICAL!' : 'different'}`);
    }

    // Now: what does MS expect for each quarter, and where does that value actually live?
    console.log('\nAAPL: Where each MS revenue value lives in the engine:');
    const msIncome = fixture.statements.income;
    const msQuarters = Object.keys(msIncome).filter(q => q !== 'TTM');
    for (const msQ of msQuarters) {
      const match = msQ.match(/^Q(\d)\s+(\d{4})$/);
      if (!match) continue;
      const msRev = msIncome[msQ]['Total Revenue'];
      const msRevM = (msRev / 1e6).toFixed(0);

      // Search in engine
      const found = [];
      for (const fy of engineData.fiscalYears) {
        for (const q of ['Q1', 'Q2', 'Q3', 'Q4']) {
          const rev = engineData.quarterly[fy]?.[q]?.income?.revenues;
          if (rev != null && Math.abs((rev - msRev) / msRev) < 0.005) {
            found.push(`FY${fy}/${q}`);
          }
        }
      }
      console.log(`  MS ${msQ.padEnd(10)} rev=${msRevM.padEnd(8)}M  → Engine: ${found.length > 0 ? found.join(', ') : 'NOT FOUND'}`);
    }
  }, 30000);

  // ─── Deep-dive: LULU Q4 de-cumulation + balance sheet ────────
  it('LULU Q4 and balance sheet deep-dive', async () => {
    const fixture = loadFixture('LULU');
    const engineData = await fetchEdgarQuarterly('LULU');

    console.log('\n' + '='.repeat(80));
    console.log('LULU: Q4 de-cumulation + balance sheet offset analysis');
    console.log('='.repeat(80));

    // Q4 de-cumulation issue
    console.log('\nLULU Q4 revenue: engine vs MS');
    for (const fy of [2022, 2023, 2024, 2025]) {
      const q1 = engineData.quarterly[fy]?.Q1?.income?.revenues || 0;
      const q2 = engineData.quarterly[fy]?.Q2?.income?.revenues || 0;
      const q3 = engineData.quarterly[fy]?.Q3?.income?.revenues || 0;
      const q4 = engineData.quarterly[fy]?.Q4?.income?.revenues || 0;
      const fyTotal = q1 + q2 + q3 + q4;
      const sum123 = q1 + q2 + q3;

      const msQ4Label = `Q4 ${fy}`;
      const msQ4Rev = fixture.statements.income[msQ4Label]?.['Total Revenue'];

      console.log(`  FY${fy}:`);
      console.log(`    Q1=${(q1/1e6).toFixed(0)}M Q2=${(q2/1e6).toFixed(0)}M Q3=${(q3/1e6).toFixed(0)}M sum(Q1-3)=${(sum123/1e6).toFixed(0)}M`);
      console.log(`    Q4 engine=${(q4/1e6).toFixed(0)}M  Q4 MS=${msQ4Rev ? (msQ4Rev/1e6).toFixed(0)+'M' : 'N/A'}  FY total=${(fyTotal/1e6).toFixed(0)}M`);
      if (msQ4Rev) {
        console.log(`    Ratio engine/MS = ${(q4/msQ4Rev).toFixed(3)} — extra ${((q4-msQ4Rev)/1e6).toFixed(0)}M`);
        // Is the engine Q4 = MS Q4 + something? Check if extra = Q1 of this FY
        console.log(`    Extra matches Q1 of next FY? next FY Q1=${engineData.quarterly[fy+1]?.Q1?.income?.revenues ? (engineData.quarterly[fy+1]?.Q1?.income?.revenues/1e6).toFixed(0)+'M' : 'N/A'}`);

        // Check: does engine Q4 = MS Q4 + Q1 of this FY?
        if (q4 > msQ4Rev) {
          const extra = q4 - msQ4Rev;
          console.log(`    Extra=${(extra/1e6).toFixed(0)}M vs Q1=${(q1/1e6).toFixed(0)}M — ${Math.abs((extra - q1)/q1) < 0.01 ? 'Q4 includes Q1 de-cumulation error!' : 'not Q1'}`);
        }
      }
    }

    // Balance sheet: check if there's a quarter offset
    console.log('\n\nLULU Balance Sheet: check quarter-level offset');
    const msBal = fixture.statements.balance_sheet;
    const msBalQtrs = Object.keys(msBal).filter(q => q !== 'TTM');

    for (const msQ of msBalQtrs.slice(0, 8)) {
      const match = msQ.match(/^Q(\d)\s+(\d{4})$/);
      if (!match) continue;
      const qNum = parseInt(match[1]);
      const msYear = parseInt(match[2]);

      const msAssets = msBal[msQ]?.['Total Assets'];
      if (!msAssets) continue;
      const msAssetsM = (msAssets / 1e6).toFixed(0);

      // Check multiple candidate engine slots
      const candidates = [];
      for (const fyOffset of [-1, 0, 1]) {
        for (const qOffset of [0, 1, -1]) {
          let testQ = qNum + qOffset;
          let testFY = msYear + fyOffset;
          if (testQ > 4) { testQ -= 4; testFY++; }
          if (testQ < 1) { testQ += 4; testFY--; }

          const engAssets = engineData.quarterly[testFY]?.[`Q${testQ}`]?.balance?.assets;
          if (engAssets != null && Math.abs((engAssets - msAssets) / msAssets) < 0.01) {
            candidates.push(`FY${testFY}/Q${testQ}`);
          }
        }
      }

      const directAssets = engineData.quarterly[msYear]?.[`Q${qNum}`]?.balance?.assets;
      const directM = directAssets ? (directAssets / 1e6).toFixed(0) : 'N/A';

      console.log(`  MS ${msQ.padEnd(10)} assets=${msAssetsM.padEnd(8)}M  direct FY${msYear}/Q${qNum}=${directM.padEnd(8)}M  matches: ${candidates.length > 0 ? candidates.join(', ') : 'NONE'}`);
    }
  }, 30000);
});
