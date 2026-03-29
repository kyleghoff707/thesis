/**
 * quarterly-opincome-diagnostic.test.mjs
 *
 * Diagnoses operating_income_loss quarterly DIFF failures across all 50 tickers.
 *
 * For each DIFF, shows:
 *   - ticker, quarter, MS value, engine value, ratio
 *   - whether the engine value was derived or direct from XBRL taxonomy
 *   - which MS value was used (Normalized vs Reported)
 *
 * Run with: npx vitest run scripts/quarterly-opincome-diagnostic.test.mjs --reporter=verbose
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

// ─── Fetch Interceptor (same as quarterly accuracy test) ──────────────
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

// ─── Load ALL Fixtures ──────────────────────────────────────────────
const msFixtures = {};
for (const file of fs.readdirSync(FIXTURES_DIR)) {
  if (!file.endsWith('.json')) continue;
  const ticker = file.replace('.json', '');
  msFixtures[ticker] = JSON.parse(
    fs.readFileSync(path.join(FIXTURES_DIR, file), 'utf-8')
  );
}

const ALL_TICKERS = Object.keys(msFixtures).sort();

// Companies that report in non-USD currency — skip
const EUR_COMPANIES = new Set(['RACE']);

const SPIN_OFF = { EW: 2023, JNJ: 2023, T: 2022 };

// ─── Quarter Label Parser ────────────────────────────────────
function parseQuarterLabel(label) {
  const match = label.trim().match(/^Q(\d)\s+(\d{4})$/);
  if (!match) return null;
  return { quarter: parseInt(match[1]), year: parseInt(match[2]) };
}

// ─── Fiscal Year Offset Detection (same as quarterly accuracy test) ───
function detectQuarterlyYearOffset(msIncomeStmt, engineQuarterly, engineFYs) {
  if (!msIncomeStmt || !engineQuarterly || engineFYs.length === 0) return 0;

  const msByFY = {};
  for (const label of Object.keys(msIncomeStmt)) {
    if (label === 'TTM') continue;
    const parsed = parseQuarterLabel(label);
    if (!parsed) continue;
    if (!msByFY[parsed.year]) msByFY[parsed.year] = {};
    msByFY[parsed.year][`Q${parsed.quarter}`] = msIncomeStmt[label];
  }

  const scores = {};
  for (const offset of [0, -1]) {
    let matches = 0;
    let compared = 0;

    for (const [msYearStr, msQuarters] of Object.entries(msByFY)) {
      const msYear = parseInt(msYearStr);
      const edgarYear = msYear + offset;

      for (const [qtr, msFields] of Object.entries(msQuarters)) {
        const msRev = msFields['Total Revenue'];
        const engRev = engineQuarterly[edgarYear]?.[qtr]?.income?.revenues;

        if (msRev != null && engRev != null) {
          compared++;
          const pct = Math.abs((engRev - msRev) / msRev);
          if (pct < 0.02) matches++;
        }
      }
    }

    scores[offset] = { matches, compared };
  }

  if (scores[-1].matches > scores[0].matches && scores[-1].matches >= 5) {
    return -1;
  }
  return 0;
}

// ─── Derivation Detection ────────────────────────────────────
// Checks whether operating_income_loss would have been null from direct XBRL
// extraction and therefore was derived by computeDerivedFields.
//
// Logic mirrors computeDerivedFields at line 859 of edgarFinancials.js:
//   if (inc.operating_income_loss == null) {
//     Path 1: income_before_tax + interest_expense - other_income_expense
//     Path 2: gross_profit - sga - R&D - D&A(IS) - other_operating_expenses
//   }
//
// We detect derivation by checking if the value matches either derivation path.
function detectDerivation(income) {
  const val = income.operating_income_loss;
  if (val == null) return { isDerived: false, source: 'MISSING' };

  // Path 1: income_before_tax + interest_expense - other_income_expense
  if (income.income_before_tax != null && income.interest_expense != null) {
    const path1 = income.income_before_tax + income.interest_expense - (income.other_income_expense ?? 0);
    if (Math.abs(val - path1) < 1) {
      // Could be derived via Path 1 — but also could be direct XBRL that happens to equal this
      // We can't tell for sure without provenance, so flag it as "matches Path 1"
    }
  }

  // Path 2: gross_profit - sga - R&D - D&A(IS) - other_operating_expenses
  if (income.gross_profit != null && income.sga != null) {
    const path2 = income.gross_profit - income.sga
      - (income.research_and_development ?? 0)
      - (income.depreciation_amortization_is ?? 0)
      - (income.other_operating_expenses ?? 0);
    if (Math.abs(val - path2) < 1) {
      // Matches Path 2
    }
  }

  // Check if val matches known derivation paths
  let path1Val = null;
  let path2Val = null;

  if (income.income_before_tax != null && income.interest_expense != null) {
    path1Val = income.income_before_tax + income.interest_expense - (income.other_income_expense ?? 0);
  }
  if (income.gross_profit != null && income.sga != null) {
    path2Val = income.gross_profit - income.sga
      - (income.research_and_development ?? 0)
      - (income.depreciation_amortization_is ?? 0)
      - (income.other_operating_expenses ?? 0);
  }

  // If the value exactly matches a derivation path, it may be derived
  // (or it could be a direct XBRL value that happens to equal the derivation)
  if (path1Val != null && Math.abs(val - path1Val) < 1) {
    return { isDerived: 'maybe-path1', source: 'income_before_tax + interest_expense - other_income_expense', path1Val };
  }
  if (path2Val != null && Math.abs(val - path2Val) < 1) {
    return { isDerived: 'maybe-path2', source: 'gross_profit - sga - R&D - D&A(IS) - other_operating', path2Val };
  }

  return { isDerived: false, source: 'DIRECT (OperatingIncomeLoss tag)' };
}

// ─── Test Suite ──────────────────────────────────────────────
let fetchEdgarQuarterly;

describe('Operating Income Quarterly Diagnostic', () => {
  beforeAll(async () => {
    const mod = await import('../src/engines/edgarFinancials.js');
    fetchEdgarQuarterly = mod.fetchEdgarQuarterly;
  }, 15000);

  it('diagnose operating_income_loss across ALL 50 tickers', async () => {
    const allDiffs = [];
    const tickerSummary = {};
    let totalCompared = 0;
    let totalMatch = 0;
    let totalDiff = 0;
    let totalMissing = 0;

    for (const ticker of ALL_TICKERS) {
      if (EUR_COMPANIES.has(ticker)) continue;

      const fixture = msFixtures[ticker];
      let engineData;
      try {
        engineData = await fetchEdgarQuarterly(ticker);
      } catch (e) {
        console.log(`  ${ticker}: ENGINE ERROR - ${e.message}`);
        continue;
      }
      if (!engineData) {
        console.log(`  ${ticker}: ENGINE RETURNED NULL`);
        continue;
      }

      const msIncome = fixture.statements?.income || {};
      const msQuarters = Object.keys(msIncome).filter(q => q !== 'TTM');
      const engineFYs = Object.keys(engineData.quarterly || {}).map(Number).sort((a, b) => b - a);

      const offset = detectQuarterlyYearOffset(msIncome, engineData.quarterly, engineFYs);

      let tickerMatch = 0;
      let tickerDiff = 0;
      let tickerMissing = 0;

      for (const msQ of msQuarters) {
        const parsed = parseQuarterLabel(msQ);
        if (!parsed) continue;

        const edgarYear = parsed.year + offset;
        const edgarQtr = `Q${parsed.quarter}`;

        // Skip spin-off pre-spin years
        if (SPIN_OFF[ticker] && edgarYear < SPIN_OFF[ticker]) continue;

        // Get MS value — apply P1b: prefer Reported over Normalized
        let msNormalized = msIncome[msQ]?.['Total Operating Profit/Loss'];
        let msReported = msIncome[msQ]?.['Reported Total Operating Profit/Loss'];
        let msValue = msReported != null ? msReported : msNormalized;
        let msSource = msReported != null ? 'Reported' : 'Normalized';

        // Also track whether Reported differs from Normalized
        let reportedDiffersFromNormalized = (msReported != null && msNormalized != null && msReported !== msNormalized);

        if (msValue == null) continue;

        // Get engine value
        const engineQtr = engineData.quarterly?.[edgarYear]?.[edgarQtr];
        if (!engineQtr) {
          tickerMissing++;
          totalMissing++;
          continue;
        }

        const engineValue = engineQtr.income?.operating_income_loss;
        if (engineValue == null) {
          tickerMissing++;
          totalMissing++;
          continue;
        }

        totalCompared++;

        // Compare
        const expected = msValue; // sign = 1 per field-mapping.json
        const pct = Math.abs(expected) > 1 ? Math.abs((engineValue - expected) / expected) : 0;

        if (pct <= 0.01 || (Math.abs(expected) < 1 && Math.abs(engineValue) < 1)) {
          totalMatch++;
          tickerMatch++;
        } else {
          totalDiff++;
          tickerDiff++;

          // Detect derivation
          const derivInfo = detectDerivation(engineQtr.income);

          // Also check: would normalized value match better?
          let normalizedMatch = false;
          let normalizedPct = null;
          if (reportedDiffersFromNormalized && msNormalized != null) {
            normalizedPct = Math.abs(msNormalized) > 1
              ? Math.abs((engineValue - msNormalized) / msNormalized)
              : 0;
            normalizedMatch = normalizedPct <= 0.01;
          }

          // Check: would using the OTHER MS value (if Reported used, check Normalized, vice versa) match?
          let altMsVal = msSource === 'Reported' ? msNormalized : msReported;
          let altMatch = false;
          if (altMsVal != null && Math.abs(altMsVal) > 1) {
            altMatch = Math.abs((engineValue - altMsVal) / altMsVal) <= 0.01;
          }

          allDiffs.push({
            ticker,
            quarter: msQ,
            edgarSlot: `FY${edgarYear}/${edgarQtr}`,
            msValue: expected,
            msSource,
            engineValue,
            ratio: expected !== 0 ? (engineValue / expected).toFixed(4) : 'N/A',
            pctDiff: (pct * 100).toFixed(1) + '%',
            isDerived: derivInfo.isDerived,
            derivSource: derivInfo.source,
            reportedDiffersFromNormalized,
            normalizedMatch,
            altMatch,
            altMsVal,
            // Include component values for analysis
            grossProfit: engineQtr.income?.gross_profit,
            sga: engineQtr.income?.sga,
            rd: engineQtr.income?.research_and_development,
            daIS: engineQtr.income?.depreciation_amortization_is,
            otherOpex: engineQtr.income?.other_operating_expenses,
            preTax: engineQtr.income?.income_before_tax,
            intExp: engineQtr.income?.interest_expense,
            otherInc: engineQtr.income?.other_income_expense,
          });
        }
      }

      tickerSummary[ticker] = {
        match: tickerMatch,
        diff: tickerDiff,
        missing: tickerMissing,
        offset,
      };
    }

    // ─── Print Report ──────────────────────────────────────────
    console.log('\n' + '='.repeat(100));
    console.log('OPERATING INCOME (operating_income_loss) QUARTERLY DIAGNOSTIC');
    console.log('='.repeat(100));
    console.log(`Total: ${totalMatch}/${totalCompared} MATCH (${(totalMatch/totalCompared*100).toFixed(1)}%) | ${totalDiff} DIFF | ${totalMissing} MISSING\n`);

    // ─── Per-ticker summary ──────────────────────────────────
    console.log('-'.repeat(80));
    console.log('PER-TICKER SUMMARY (only showing tickers with DIFFs):');
    console.log('-'.repeat(80));

    const tickersWithDiffs = Object.entries(tickerSummary)
      .filter(([_, s]) => s.diff > 0)
      .sort((a, b) => b[1].diff - a[1].diff);

    for (const [ticker, s] of tickersWithDiffs) {
      const total = s.match + s.diff;
      const pct = total > 0 ? ((s.match / total) * 100).toFixed(1) : 'N/A';
      console.log(`  ${ticker.padEnd(8)} ${s.match}/${total} (${pct}%) match | ${s.diff} DIFF | ${s.missing} missing | offset=${s.offset}`);
    }

    // ─── All DIFFs detail ──────────────────────────────────────
    console.log('\n' + '-'.repeat(100));
    console.log('ALL DIFFS (detailed):');
    console.log('-'.repeat(100));
    console.log(`${'Ticker'.padEnd(8)} ${'Quarter'.padEnd(10)} ${'MS Value'.padStart(16)} ${'Engine'.padStart(16)} ${'Ratio'.padStart(8)} ${'%Diff'.padStart(8)} ${'MS Src'.padEnd(10)} ${'Derived?'.padEnd(15)} ${'Norm!=Rep'.padEnd(10)} ${'AltMatch'.padEnd(8)}`);

    for (const d of allDiffs) {
      const msStr = (d.msValue / 1e6).toFixed(1) + 'M';
      const engStr = (d.engineValue / 1e6).toFixed(1) + 'M';
      console.log(
        `${d.ticker.padEnd(8)} ${d.quarter.padEnd(10)} ${msStr.padStart(16)} ${engStr.padStart(16)} ${d.ratio.padStart(8)} ${d.pctDiff.padStart(8)} ${d.msSource.padEnd(10)} ${String(d.isDerived).padEnd(15)} ${String(d.reportedDiffersFromNormalized).padEnd(10)} ${String(d.altMatch).padEnd(8)}`
      );
    }

    // ─── Pattern Analysis ──────────────────────────────────────
    console.log('\n' + '-'.repeat(100));
    console.log('PATTERN ANALYSIS:');
    console.log('-'.repeat(100));

    // 1. How many DIFFs match the Normalized MS value instead?
    const matchNormalized = allDiffs.filter(d => d.normalizedMatch);
    console.log(`\n  DIFFs where engine matches NORMALIZED MS value: ${matchNormalized.length}/${allDiffs.length}`);
    if (matchNormalized.length > 0) {
      console.log('  -> These would be fixed by NOT applying P1b (using Normalized instead of Reported)');
      for (const d of matchNormalized.slice(0, 10)) {
        console.log(`     ${d.ticker} ${d.quarter}: Reported=${(d.msValue/1e6).toFixed(1)}M, Normalized=${(d.altMsVal/1e6).toFixed(1)}M, Engine=${(d.engineValue/1e6).toFixed(1)}M`);
      }
    }

    // 2. How many DIFFs match the alt MS value?
    const matchAlt = allDiffs.filter(d => d.altMatch);
    console.log(`\n  DIFFs where engine matches the ALT MS value: ${matchAlt.length}/${allDiffs.length}`);

    // 3. How many are derived values?
    const derived = allDiffs.filter(d => d.isDerived && d.isDerived !== false);
    const direct = allDiffs.filter(d => !d.isDerived || d.isDerived === false);
    console.log(`\n  DIFFs from DERIVED values: ${derived.length}`);
    console.log(`  DIFFs from DIRECT XBRL tag: ${direct.length}`);

    if (derived.length > 0) {
      console.log('  Derived DIFF breakdown:');
      const byPath = {};
      for (const d of derived) {
        const key = String(d.isDerived);
        if (!byPath[key]) byPath[key] = 0;
        byPath[key]++;
      }
      for (const [path, count] of Object.entries(byPath)) {
        console.log(`    ${path}: ${count}`);
      }
    }

    // 4. Ratio clustering
    const ratios = allDiffs.map(d => parseFloat(d.ratio)).filter(r => !isNaN(r) && isFinite(r));
    if (ratios.length > 0) {
      const ratioBuckets = {};
      for (const r of ratios) {
        // Round to 2 decimal places for bucketing
        const bucket = r.toFixed(2);
        if (!ratioBuckets[bucket]) ratioBuckets[bucket] = 0;
        ratioBuckets[bucket]++;
      }
      const topBuckets = Object.entries(ratioBuckets).sort((a, b) => b[1] - a[1]).slice(0, 10);
      console.log('\n  Ratio clustering (engine/MS):');
      for (const [ratio, count] of topBuckets) {
        console.log(`    ratio=${ratio}: ${count} cases`);
      }
    }

    // 5. Check if Reported != Normalized pattern contributes to failures
    const reportedDiffers = allDiffs.filter(d => d.reportedDiffersFromNormalized);
    const reportedSame = allDiffs.filter(d => !d.reportedDiffersFromNormalized);
    console.log(`\n  DIFFs where Reported != Normalized: ${reportedDiffers.length}`);
    console.log(`  DIFFs where Reported == Normalized (or no Reported): ${reportedSame.length}`);

    // 6. Deep dive: for DIFFs where engine is DIRECT, show what tags might explain the difference
    console.log('\n' + '-'.repeat(100));
    console.log('DEEP DIVE: Direct XBRL DIFFs (engine got OperatingIncomeLoss tag but differs from MS)');
    console.log('-'.repeat(100));

    for (const d of direct.slice(0, 15)) {
      const delta = d.engineValue - d.msValue;
      console.log(`  ${d.ticker} ${d.quarter}: MS=${(d.msValue/1e6).toFixed(1)}M Engine=${(d.engineValue/1e6).toFixed(1)}M delta=${(delta/1e6).toFixed(1)}M`);

      // Check if delta matches any known component
      if (d.otherOpex != null && Math.abs(delta + d.otherOpex) < 1e6) {
        console.log(`    -> delta matches -other_operating_expenses (${(d.otherOpex/1e6).toFixed(1)}M) => MS may exclude restructuring/impairment`);
      }
      if (d.daIS != null && Math.abs(delta + d.daIS) < 1e6) {
        console.log(`    -> delta matches -depreciation_amortization_is (${(d.daIS/1e6).toFixed(1)}M)`);
      }
    }

    // 7. Check which tickers have DIFFs where NO "Reported" field exists
    const noReportedDiffs = allDiffs.filter(d => d.msSource === 'Normalized');
    console.log(`\n  DIFFs using Normalized MS value (no Reported field available): ${noReportedDiffs.length}`);
    if (noReportedDiffs.length > 0) {
      const tickers = [...new Set(noReportedDiffs.map(d => d.ticker))];
      console.log(`    Tickers: ${tickers.join(', ')}`);
    }

    // 8. Summary recommendation
    console.log('\n' + '='.repeat(100));
    console.log('SUMMARY & RECOMMENDATIONS');
    console.log('='.repeat(100));
    console.log(`Total operating_income_loss comparisons: ${totalCompared}`);
    console.log(`Match: ${totalMatch} (${(totalMatch/totalCompared*100).toFixed(1)}%)`);
    console.log(`Diff: ${totalDiff}`);
    console.log(`Missing: ${totalMissing}`);
    console.log(`Companies with DIFFs: ${tickersWithDiffs.length}`);
    console.log(`DIFFs where switching to Normalized would fix: ${matchNormalized.length}`);
    console.log(`DIFFs from derived values: ${derived.length}`);
    console.log(`DIFFs from direct XBRL: ${direct.length}`);

    console.log(`\nEDGAR API: ${requestCount} live requests, ${cacheHits} cache hits`);
  }, 600000); // 10 minute timeout
});
