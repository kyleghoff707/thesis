/**
 * quarterly-wms-diagnostic.test.mjs
 *
 * Diagnoses WMS (Advanced Drainage Systems) quarterly XBRL accuracy.
 * WMS fiscal year ends March 31 — offset detection may be mislabeling quarters.
 *
 * Uses the same fetch interceptor + disk cache as the accuracy test suite so that
 * EDGAR responses are cached and reused between runs.
 *
 * Run: npx vitest run scripts/quarterly-wms-diagnostic --reporter=verbose
 *
 * Cache location: src/engines/__tests__/fixtures/morningstar/edgar-cache/ (shared with accuracy tests)
 * First run: ~30-60s (downloads EDGAR data for WMS, caches to disk)
 * Subsequent: ~5-10s (reads from disk cache)
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

// ─── Fetch Interceptor ──────────────────────────────────────────────────────
// Rewrite Vite dev proxy URLs → direct SEC URLs, disk-cache responses.
// Identical to the pattern in morningstarQuarterlyAccuracy.test.js.

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

// ─── Load fixtures & mapping ────────────────────────────────────────────────

const wmsFixture = JSON.parse(
  fs.readFileSync(path.join(FIXTURES_DIR, 'WMS.json'), 'utf-8')
);

const fieldMapping = JSON.parse(
  fs.readFileSync(path.join(ANNUAL_FIXTURES_DIR, 'field-mapping.json'), 'utf-8')
);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseQuarterLabel(label) {
  const m = label.trim().match(/^Q(\d)\s+(\d{4})$/);
  if (!m) return null;
  return { quarter: parseInt(m[1]), year: parseInt(m[2]) };
}

function fmt(n) {
  if (n == null) return '        null';
  return String(Math.round(n / 1e6)).padStart(8) + 'M';
}

function pctStr(pct) {
  if (pct == null || !isFinite(pct)) return '   N/A';
  return (pct * 100).toFixed(1).padStart(6) + '%';
}

// ─── Comparison helpers ──────────────────────────────────────────────────────

const THRESHOLDS = {
  exact: 0.01,
  close: 0.05,
  approximate: 0.10,
  relaxed: 0.20,
  informational: Infinity,
};

function compareField(msValue, thesisValue, sign, tolerance) {
  const expected = sign * msValue;
  const actual = thesisValue;

  if (Math.abs(expected) < 1 && Math.abs(actual) < 1) return { status: 'MATCH', pct: 0 };
  if (expected === 0) return { status: Math.abs(actual) < 1_000_000 ? 'MATCH' : 'DIFF', pct: Infinity };

  const pct = Math.abs((actual - expected) / expected);
  const threshold = THRESHOLDS[tolerance] ?? THRESHOLDS.close;
  const status = pct <= threshold ? 'MATCH' : pct <= THRESHOLDS.close ? 'CLOSE' : 'DIFF';
  return { status, pct };
}

const STMT_MAP = {
  income: 'income',
  balance_sheet: 'balance',
  cash_flow: 'cashFlow',
};

// ─── Engine import + main diagnostic ─────────────────────────────────────────

let fetchEdgarQuarterly;
let engineData;

describe('WMS Quarterly Diagnostic', () => {
  beforeAll(async () => {
    const mod = await import('../src/engines/edgarFinancials.js');
    fetchEdgarQuarterly = mod.fetchEdgarQuarterly;
  }, 10000);

  it('runs WMS offset diagnostic', async () => {
    // ─── Fetch WMS engine data ──────────────────────────────────────────────

    console.log('\nFetching WMS quarterly data from EDGAR (disk cache used if available)...');
    engineData = await fetchEdgarQuarterly('WMS');

    if (!engineData) {
      console.error('ERROR: fetchEdgarQuarterly returned null for WMS');
      return;
    }

    const { quarterly, fiscalYears, fiscalMonths } = engineData;

    console.log(`Engine returned: ${fiscalYears.length} fiscal years`);
    console.log('FY list:', fiscalYears.join(', '));
    console.log('FY end months:', JSON.stringify(fiscalMonths));
    console.log(`EDGAR API: ${requestCount} live requests, ${cacheHits} cache hits`);

    const msIncome = wmsFixture.statements.income;
    const msRevPeriods = Object.keys(msIncome)
      .filter(k => k !== 'TTM')
      .filter(k => parseQuarterLabel(k) !== null)
      .sort((a, b) => {
        const pa = parseQuarterLabel(a);
        const pb = parseQuarterLabel(b);
        return pa.year !== pb.year ? pa.year - pb.year : pa.quarter - pb.quarter;
      });

    // ─── SECTION 1: Revenue quarter-by-quarter comparison ──────────────────

    console.log('\n' + '═'.repeat(90));
    console.log('SECTION 1 — REVENUE COMPARISON: offset:0 vs offset:-1');
    console.log('═'.repeat(90));
    console.log('(WMS fiscal year ends March 31 — MS labels are fiscal-year-ending, not calendar-year)');
    console.log('');
    console.log(
      'MS Label'.padEnd(12) +
      'MS Rev($M)'.padEnd(16) +
      '─── offset:0 ───'.padEnd(32) +
      '─── offset:-1 ───'
    );
    console.log(
      ''.padEnd(12) +
      ''.padEnd(16) +
      'Eng FY.Q     Eng Rev    Diff'.padEnd(32) +
      'Eng FY.Q     Eng Rev    Diff'
    );
    console.log('-'.repeat(90));

    for (const label of msRevPeriods) {
      const parsed = parseQuarterLabel(label);
      const msRev = msIncome[label]?.['Total Revenue'];

      const buildRow = (offset) => {
        const edgarYear = parsed.year + offset;
        const edgarQtr = `Q${parsed.quarter}`;
        const engRev = quarterly?.[edgarYear]?.[edgarQtr]?.income?.revenues;
        const pct = msRev != null && engRev != null && msRev !== 0
          ? Math.abs((engRev - msRev) / msRev)
          : null;
        const match = pct != null && pct < 0.02;
        const diffStr = pct == null ? '    N/A' : match ? '  MATCH' : `${pctStr(pct)} DIFF`;
        const fySuffix = `FY${edgarYear}.${edgarQtr}`;
        return `${fySuffix.padEnd(14)}${fmt(engRev).padEnd(12)}${diffStr}`;
      };

      console.log(
        `${label.padEnd(12)}${fmt(msRev).padEnd(16)}${buildRow(0).padEnd(32)}${buildRow(-1)}`
      );
    }

    // ─── SECTION 2: Offset detection scoring ────────────────────────────────

    console.log('\n' + '═'.repeat(90));
    console.log('SECTION 2 — OFFSET DETECTION SCORING (replicates detectQuarterlyYearOffset logic)');
    console.log('═'.repeat(90));

    const scores = { '0': { matches: 0, compared: 0 }, '-1': { matches: 0, compared: 0 } };

    for (const label of msRevPeriods) {
      const parsed = parseQuarterLabel(label);
      const msRev = msIncome[label]?.['Total Revenue'];
      if (msRev == null) continue;

      for (const offset of [0, -1]) {
        const edgarYear = parsed.year + offset;
        const edgarQtr = `Q${parsed.quarter}`;
        const engRev = quarterly?.[edgarYear]?.[edgarQtr]?.income?.revenues;
        if (engRev == null) continue;
        scores[String(offset)].compared++;
        const pct = Math.abs((engRev - msRev) / msRev);
        if (pct < 0.02) scores[String(offset)].matches++;
      }
    }

    for (const offset of [0, -1]) {
      const s = scores[String(offset)];
      const pct = s.compared > 0 ? ((s.matches / s.compared) * 100).toFixed(1) : '0.0';
      console.log(`  offset:${offset}   ${s.matches}/${s.compared} revenue quarters match (${pct}%)`);
    }

    // Replicate exact bias logic from the test suite
    const winner = scores['-1'].matches > scores['0'].matches && scores['-1'].matches >= 5 ? -1 : 0;
    console.log(`\n  => detectQuarterlyYearOffset() returns: offset:${winner}`);
    console.log('  (Bias rule: only use -1 if strictly more matches AND at least 5)');

    // ─── SECTION 3: Raw EDGAR entries for Revenue tags ───────────────────────

    console.log('\n' + '═'.repeat(90));
    console.log('SECTION 3 — RAW EDGAR ENTRIES FOR REVENUE TAGS (first 20 each, most recent first)');
    console.log('═'.repeat(90));
    console.log('(Reveals EDGAR FY labels, fiscal periods, and period-end dates for WMS)');

    // Fetch the ticker map to get WMS CIK, then fetch company facts directly.
    // These are the same calls fetchEdgarQuarterly made — will be served from disk cache.
    let wmsCIK = null;
    try {
      const tickerMapResp = await fetch('/api/sec/files/company_tickers.json');
      if (tickerMapResp.ok) {
        const tickerMap = await tickerMapResp.json();
        for (const entry of Object.values(tickerMap)) {
          if (entry.ticker?.toUpperCase() === 'WMS') {
            wmsCIK = String(entry.cik_str).padStart(10, '0');
            break;
          }
        }
      }
    } catch (e) {
      console.log(`  CIK lookup failed: ${e.message}`);
    }

    if (!wmsCIK) {
      console.log('  Could not look up WMS CIK — skipping raw EDGAR entries');
    } else {
      console.log(`  WMS CIK: ${wmsCIK}`);

      const factsUrl = `/api/edgar/api/xbrl/companyfacts/CIK${wmsCIK}.json`;
      let rawFacts = null;
      try {
        const factsResp = await fetch(factsUrl);
        if (factsResp.ok) {
          rawFacts = await factsResp.json();
        } else {
          console.log(`  Company facts fetch returned ${factsResp.status}`);
        }
      } catch (e) {
        console.log(`  Company facts fetch failed: ${e.message}`);
      }

      const REVENUE_TAGS = [
        'RevenueFromContractWithCustomerExcludingAssessedTax',
        'Revenues',
      ];

      for (const tag of REVENUE_TAGS) {
        const tagData = rawFacts?.facts?.['us-gaap']?.[tag];

        if (!tagData) {
          console.log(`\n  ${tag}: NOT FOUND in EDGAR facts`);
          continue;
        }

        const entries = tagData.units?.USD || [];
        console.log(`\n  ${tag}: ${entries.length} total USD entries`);
        console.log(
          '  ' +
          'idx'.padEnd(5) + 'form'.padEnd(8) + 'fy'.padEnd(6) + 'fp'.padEnd(6) +
          'start'.padEnd(13) + 'end'.padEnd(13) + 'val($M)'.padEnd(12) + 'filed'
        );
        console.log('  ' + '-'.repeat(75));

        const sorted = [...entries]
          .filter(e => e.form === '10-Q' || e.form === '10-K')
          .sort((a, b) => (b.end || '').localeCompare(a.end || ''));

        let shown = 0;
        for (const e of sorted) {
          if (shown >= 20) break;
          const valM = e.val != null ? (e.val / 1e6).toFixed(1).padStart(8) : '    null';
          console.log(
            '  ' +
            String(shown + 1).padStart(3).padEnd(5) +
            (e.form || '').padEnd(8) +
            String(e.fy ?? '').padEnd(6) +
            (e.fp || '').padEnd(6) +
            (e.start || 'N/A').padEnd(13) +
            (e.end || 'N/A').padEnd(13) +
            valM.padEnd(12) +
            (e.filed || '')
          );
          shown++;
        }

        // Show FY × FP breakdown from 10-Q filings only
        const fpMap = new Map();
        for (const e of entries.filter(e => e.form === '10-Q')) {
          const key = `FY${e.fy}-${e.fp}`;
          if (!fpMap.has(key)) fpMap.set(key, { end: e.end, fy: e.fy, fp: e.fp });
        }
        const fySet = new Set(entries.filter(e => e.form === '10-Q').map(e => e.fy));

        console.log(`\n  EDGAR FYs in 10-Q filings: ${[...fySet].sort((a, b) => a - b).join(', ')}`);
        console.log('  10-Q FY × FP pairs (each unique combo):');
        for (const [k, v] of [...fpMap.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
          console.log(`    ${k.padEnd(14)}  period end: ${v.end}`);
        }
      }
    }

    // ─── SECTION 4: Full field comparison at offset:0 vs offset:-1 ──────────

    console.log('\n' + '═'.repeat(90));
    console.log('SECTION 4 — FULL FIELD COMPARISON: ALL FIELDS at offset:0 vs offset:-1');
    console.log('═'.repeat(90));
    console.log('(Informational-tolerance fields excluded — they are known structural mismatches)');

    function runAllComparisons(offset) {
      let matches = 0, close = 0, diffs = 0, missing = 0;
      const diffDetails = [];

      for (const [msStmtKey, mappings] of Object.entries(fieldMapping)) {
        if (msStmtKey === '_meta') continue;
        const engineStmtKey = STMT_MAP[msStmtKey];

        for (const [msField, mapInfo] of Object.entries(mappings)) {
          if (!mapInfo.thesisField) continue;
          if (mapInfo.tolerance === 'informational') continue;

          const msStmt = wmsFixture.statements[msStmtKey] || {};
          const msPeriods = Object.keys(msStmt).filter(p => p !== 'TTM');

          for (const msPeriod of msPeriods) {
            const parsed = parseQuarterLabel(msPeriod);
            if (!parsed) continue;

            const edgarYear = parsed.year + offset;
            const edgarQtr = `Q${parsed.quarter}`;

            let msValue = msStmt[msPeriod]?.[msField];

            // P1a: intangible assets — compare against implied net
            if (msField === 'Intangibles other than Goodwill' && msValue != null) {
              const accumAmort =
                msStmt[msPeriod]?.['Accumulated Amortization of Intangibles other than Goodwill'] ??
                msStmt[msPeriod]?.['Accumulated Amortization of Intangible Assets'] ??
                msStmt[msPeriod]?.['Accumulated Amortization and Impairment'];
              if (accumAmort != null) msValue = msValue + accumAmort;
            }

            // P1b: Operating Income — prefer Reported
            if (msField === 'Total Operating Profit/Loss') {
              const reported = msStmt[msPeriod]?.['Reported Total Operating Profit/Loss'];
              if (reported != null) msValue = reported;
            }

            if (msValue == null) continue;

            let adjustedMsValue = msValue;
            if (mapInfo.thesisField === 'effective_tax_rate') {
              adjustedMsValue = msValue * 100;
            }

            const engineQtr = quarterly?.[edgarYear]?.[edgarQtr];
            if (!engineQtr) { missing++; continue; }
            const engineStmt = engineQtr[engineStmtKey];
            if (!engineStmt) { missing++; continue; }
            const thesisValue = engineStmt[mapInfo.thesisField];
            if (thesisValue == null) { missing++; continue; }

            const cmp = compareField(adjustedMsValue, thesisValue, mapInfo.sign, mapInfo.tolerance);
            if (cmp.status === 'MATCH') matches++;
            else if (cmp.status === 'CLOSE') close++;
            else {
              diffs++;
              diffDetails.push({
                field: mapInfo.thesisField,
                stmt: msStmtKey,
                period: msPeriod,
                edgarFY: edgarYear,
                edgarQtr,
                expected: mapInfo.sign * adjustedMsValue,
                actual: thesisValue,
                pct: cmp.pct,
              });
            }
          }
        }
      }

      const compared = matches + close + diffs;
      return { matches, close, diffs, missing, compared, diffDetails };
    }

    const result0 = runAllComparisons(0);
    const resultN1 = runAllComparisons(-1);

    for (const [label, r] of [['offset:0 ', result0], ['offset:-1', resultN1]]) {
      const pct = r.compared > 0 ? ((r.matches / r.compared) * 100).toFixed(1) : '0.0';
      console.log(
        `\n  ${label}  =>  ${r.matches}/${r.compared} MATCH (${pct}%)` +
        `  |  ${r.close} close  |  ${r.diffs} DIFF  |  ${r.missing} missing`
      );
    }

    // ─── SECTION 5: Top diffs at the currently-detected offset ───────────────

    const detectedR = winner === -1 ? resultN1 : result0;
    const detectedLabel = `offset:${winner}`;

    console.log('\n' + '═'.repeat(90));
    console.log(`SECTION 5 — TOP DIFFS AT ${detectedLabel} (the currently-detected offset for WMS)`);
    console.log('═'.repeat(90));

    const diffsByField = {};
    for (const d of detectedR.diffDetails) {
      const k = `${d.field} (${d.stmt})`;
      if (!diffsByField[k]) diffsByField[k] = [];
      diffsByField[k].push(d);
    }

    const sortedDiffFields = Object.entries(diffsByField)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 15);

    if (sortedDiffFields.length === 0) {
      console.log('  (no diffs at this offset)');
    } else {
      for (const [fieldKey, cases] of sortedDiffFields) {
        console.log(`\n  ${fieldKey}: ${cases.length} diffs`);
        for (const c of cases.slice(0, 5)) {
          const expM = (c.expected / 1e6).toFixed(1);
          const actM = (c.actual / 1e6).toFixed(1);
          const pctS = (c.pct * 100).toFixed(1);
          console.log(
            `    ${c.period} → EDGAR FY${c.edgarFY}.${c.edgarQtr}` +
            `  expected:${expM}M  actual:${actM}M  (${pctS}% off)`
          );
        }
      }
    }

    // ─── SECTION 6: Fiscal calendar alignment ────────────────────────────────

    console.log('\n' + '═'.repeat(90));
    console.log('SECTION 6 — WMS FISCAL CALENDAR ALIGNMENT');
    console.log('═'.repeat(90));
    console.log('WMS FY ends March 31. Morningstar labels quarters by the fiscal year they belong to.');
    console.log('Example: MS "Q1 FY2023" = Apr–Jun 2022 = first quarter of WMS fiscal year ending Mar 2023.');
    console.log('EDGAR also labels that quarter as FY=2023, FP=Q1.');
    console.log('');
    console.log('=> offset:0 should be correct (MS FY year == EDGAR FY year).');
    console.log('=> If offset:-1 is detected, the engine is looking one year early.');
    console.log('');

    console.log('Engine quarters available (FY × Q → revenue):');
    for (const fy of [...fiscalYears].sort((a, b) => a - b)) {
      const qtrs = Object.keys(quarterly[fy] || {}).sort();
      if (qtrs.length === 0) continue;
      const revValues = qtrs.map(q => {
        const rev = quarterly[fy]?.[q]?.income?.revenues;
        return `${q}:${rev != null ? (rev / 1e6).toFixed(0) + 'M' : 'null'}`;
      });
      console.log(`  FY${fy}: ${revValues.join('  ')}`);
    }

    console.log('\nMorningstar quarters (all, sorted chronologically):');
    for (const label of msRevPeriods) {
      const rev = msIncome[label]?.['Total Revenue'];
      console.log(`  ${label.padEnd(10)} ${rev != null ? (rev / 1e6).toFixed(0) + 'M' : 'null'}`);
    }

    // ─── SUMMARY ─────────────────────────────────────────────────────────────

    console.log('\n' + '═'.repeat(90));
    console.log('SUMMARY');
    console.log('═'.repeat(90));

    const pct0 = result0.compared > 0 ? ((result0.matches / result0.compared) * 100).toFixed(1) : '0.0';
    const pctN1 = resultN1.compared > 0 ? ((resultN1.matches / resultN1.compared) * 100).toFixed(1) : '0.0';

    console.log(`  offset:0   MATCH rate: ${pct0}%  (${result0.matches}/${result0.compared})  |  ${result0.diffs} DIFF  |  ${result0.missing} missing`);
    console.log(`  offset:-1  MATCH rate: ${pctN1}%  (${resultN1.matches}/${resultN1.compared})  |  ${resultN1.diffs} DIFF  |  ${resultN1.missing} missing`);
    console.log(`\n  detectQuarterlyYearOffset() returns: offset:${winner}`);

    if (result0.matches > resultN1.matches) {
      console.log(`\n  DIAGNOSIS: offset:0 is BETTER (${result0.matches} vs ${resultN1.matches} matches).`);
      console.log('  The offset detection is picking the WRONG offset.');
      console.log('  Root cause: revenue comparison finds more revenue matches at -1 even though the');
      console.log('  data is actually correctly labeled at 0. This suggests the engine FY data at');
      console.log('  (year-1) accidentally matches MS revenue values for some quarters, skewing the score.');
    } else if (resultN1.matches > result0.matches) {
      console.log(`\n  DIAGNOSIS: offset:-1 is genuinely better (${resultN1.matches} vs ${result0.matches} matches).`);
      console.log('  The detected offset appears CORRECT. Accuracy problem lies elsewhere.');
    } else {
      console.log('\n  DIAGNOSIS: Both offsets produce equal matches. Offset detection is ambiguous.');
    }

    console.log(`\n  EDGAR API: ${requestCount} live requests, ${cacheHits} cache hits`);
  }, 120000); // 2-minute timeout (first run downloads EDGAR data)
});
