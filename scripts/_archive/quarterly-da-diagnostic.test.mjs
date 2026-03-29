/**
 * quarterly-da-diagnostic.test.mjs — Diagnostic for depreciation_amortization quarterly failures
 *
 * For ALL 50 tickers, compares D&A quarterly values (MS vs engine).
 * For each DIFF, shows: ticker, quarter, MS value, engine value, ratio, and which EDGAR tag resolved.
 * Groups results by failure pattern.
 *
 * Run: npx vitest run scripts/quarterly-da-diagnostic.test.mjs --reporter=verbose
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const FIXTURES_DIR = path.join(PROJECT_ROOT, 'src/engines/__tests__/fixtures/morningstar-quarterly');
const ANNUAL_FIXTURES_DIR = path.join(PROJECT_ROOT, 'src/engines/__tests__/fixtures/morningstar');
const EDGAR_CACHE_DIR = path.join(ANNUAL_FIXTURES_DIR, 'edgar-cache');

// ─── Fetch Interceptor (same as quarterly accuracy test) ──────
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

// ─── Load Fixtures & Mapping ─────────────────────────────────

const fieldMapping = JSON.parse(
  fs.readFileSync(path.join(ANNUAL_FIXTURES_DIR, 'field-mapping.json'), 'utf-8')
);

const msFixtures = {};
for (const file of fs.readdirSync(FIXTURES_DIR)) {
  if (!file.endsWith('.json')) continue;
  const ticker = file.replace('.json', '');
  msFixtures[ticker] = JSON.parse(
    fs.readFileSync(path.join(FIXTURES_DIR, file), 'utf-8')
  );
}

const ALL_TICKERS = Object.keys(msFixtures).sort();

// Companies that report in non-USD currency
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

// ─── D&A XBRL Tags (the tags from CASHFLOW_TAXONOMY) ─────────

const DA_TAGS = [
  // Primary tags (from depreciation_amortization field)
  'DepreciationDepletionAndAmortization',
  'DepreciationAndAmortization',
  'DepreciationAmortizationAndAccretionNet',
  'OtherDepreciationAndAmortization',
  // Alternate tags extracted separately
  'Depreciation',
  'AmortizationOfIntangibleAssets',
  'AdjustmentForAmortization',
];

// ─── Helper: find which XBRL tags have data for a given fy/quarter ───

function findDATagsForQuarter(companyFacts, fy, quarter) {
  const results = [];
  const fpMap = { Q1: 'Q1', Q2: 'Q2', Q3: 'Q3', Q4: 'FY' };

  for (const tag of DA_TAGS) {
    const facts = companyFacts?.facts?.['us-gaap']?.[tag];
    if (!facts) continue;
    const entries = facts.units?.USD || [];

    if (quarter === 'Q4') {
      // Q4 = FY total - Q3 YTD
      const fyEntries = entries.filter(e => e.form === '10-K' && e.fp === 'FY' && e.fy === fy);
      const q3Entries = entries.filter(e => e.form === '10-Q' && e.fy === fy && e.fp === 'Q3');
      if (fyEntries.length > 0) {
        const fyVal = fyEntries.sort((a, b) => b.end.localeCompare(a.end))[0].val;
        const q3YTD = q3Entries.length > 0
          ? q3Entries.sort((a, b) => b.end.localeCompare(a.end))[0].val
          : null;
        const q4Val = q3YTD != null ? fyVal - q3YTD : fyVal;
        results.push({ tag, val: q4Val, fyVal, q3YTD, method: q3YTD != null ? 'FY-Q3ytd' : 'FY-only' });
      }
    } else {
      // Q1-Q3: use YTD de-cumulation
      const qEntries = entries.filter(e => e.form === '10-Q' && e.fy === fy && e.fp === quarter);
      if (qEntries.length > 0) {
        // Get YTD value for this quarter
        const ytdVal = qEntries.sort((a, b) => b.end.localeCompare(a.end))[0].val;

        // Get prior quarter YTD for de-cumulation
        const qNum = parseInt(quarter.slice(1));
        let priorYTD = null;
        if (qNum > 1) {
          const priorQ = `Q${qNum - 1}`;
          const priorEntries = entries.filter(e => e.form === '10-Q' && e.fy === fy && e.fp === priorQ);
          if (priorEntries.length > 0) {
            priorYTD = priorEntries.sort((a, b) => b.end.localeCompare(a.end))[0].val;
          }
        }

        const singleQVal = priorYTD != null ? ytdVal - priorYTD : ytdVal;
        results.push({
          tag,
          val: singleQVal,
          ytdVal,
          priorYTD,
          method: priorYTD != null ? `Q${qNum}ytd-Q${qNum-1}ytd` : 'Q1-direct',
        });
      }
    }
  }

  return results;
}

// ─── Collect All D&A Results ─────────────────────────────────

const allDiffs = [];
const allResults = [];
let totalMatch = 0;
let totalDiff = 0;
let totalMissing = 0;
let totalEngineNull = 0;

describe('D&A Quarterly Diagnostic', () => {
  let fetchEdgarQuarterly;
  let lookupCIK;
  let fetchCompanyFacts;

  beforeAll(async () => {
    const mod = await import('../src/engines/edgarFinancials.js');
    fetchEdgarQuarterly = mod.fetchEdgarQuarterly;

    const edgarMod = await import('../src/engines/edgar.js');
    lookupCIK = edgarMod.lookupCIK;
    fetchCompanyFacts = edgarMod.fetchCompanyFacts;
  }, 15000);

  afterAll(() => {
    // ─── Generate Diagnostic Report ──────────────────────────
    const lines = [];
    lines.push('');
    lines.push('D&A QUARTERLY DIAGNOSTIC REPORT');
    lines.push('═'.repeat(80));
    lines.push(`Total: ${totalMatch} MATCH | ${totalDiff} DIFF | ${totalEngineNull} engine-null | ${totalMissing} missing-quarter`);
    lines.push('');

    // ─── Group by failure pattern ────────────────────────────
    const patterns = {
      'engine_too_high': [],
      'engine_too_low': [],
      'engine_null': [],
      'sign_mismatch': [],
      'ms_null_engine_has_value': [],
    };

    for (const d of allDiffs) {
      if (d.engineVal == null) {
        patterns.engine_null.push(d);
      } else if (d.msExpected > 0 && d.engineVal < 0 || d.msExpected < 0 && d.engineVal > 0) {
        patterns.sign_mismatch.push(d);
      } else if (Math.abs(d.engineVal) > Math.abs(d.msExpected)) {
        patterns.engine_too_high.push(d);
      } else {
        patterns.engine_too_low.push(d);
      }
    }

    for (const [pattern, diffs] of Object.entries(patterns)) {
      if (diffs.length === 0) continue;
      const uniqueTickers = [...new Set(diffs.map(d => d.ticker))];
      lines.push(`\n── ${pattern.toUpperCase()} (${diffs.length} cases, ${uniqueTickers.length} tickers: ${uniqueTickers.join(', ')}) ──`);

      for (const d of diffs) {
        const ratio = d.msExpected !== 0 ? (d.engineVal / d.msExpected).toFixed(3) : 'N/A';
        const pctOff = d.msExpected !== 0
          ? ((d.engineVal - d.msExpected) / Math.abs(d.msExpected) * 100).toFixed(1) + '%'
          : 'N/A';
        lines.push(
          `  ${d.ticker.padEnd(7)} ${d.quarter.padEnd(8)} ` +
          `MS=${fmt(d.msExpected).padStart(14)}  ENG=${fmt(d.engineVal).padStart(14)}  ` +
          `ratio=${ratio.padStart(7)}  pctOff=${pctOff.padStart(8)}  ` +
          `resolvedTag=${d.resolvedTag || 'none'}`
        );
        // Show all available tags for this quarter
        if (d.availableTags && d.availableTags.length > 0) {
          for (const t of d.availableTags) {
            lines.push(
              `          -> ${t.tag}: val=${fmt(t.val)} (${t.method})`
            );
          }
        }
      }
    }

    // ─── Per-ticker summary ──────────────────────────────────
    lines.push('\n\n── PER-TICKER SUMMARY ──');
    const byTicker = {};
    for (const r of allResults) {
      if (!byTicker[r.ticker]) byTicker[r.ticker] = { match: 0, diff: 0, missing: 0, engineNull: 0 };
      if (r.status === 'MATCH') byTicker[r.ticker].match++;
      else if (r.status === 'DIFF') byTicker[r.ticker].diff++;
      else if (r.status === 'MISSING') byTicker[r.ticker].missing++;
      else if (r.status === 'ENGINE_NULL') byTicker[r.ticker].engineNull++;
    }
    for (const [ticker, counts] of Object.entries(byTicker)) {
      if (counts.diff > 0 || counts.engineNull > 0) {
        lines.push(`  ${ticker.padEnd(7)}: ${counts.match} match, ${counts.diff} DIFF, ${counts.engineNull} engine-null, ${counts.missing} missing`);
      }
    }

    // ─── Ratio distribution ─────────────────────────────────
    lines.push('\n\n── RATIO DISTRIBUTION (engine/MS) ──');
    const ratios = allDiffs
      .filter(d => d.engineVal != null && d.msExpected !== 0)
      .map(d => ({ ticker: d.ticker, quarter: d.quarter, ratio: d.engineVal / d.msExpected }));

    const ratioBuckets = {};
    for (const r of ratios) {
      let bucket;
      if (r.ratio < 0) bucket = 'negative (sign flip)';
      else if (r.ratio < 0.5) bucket = '0.00-0.50 (engine < 50% of MS)';
      else if (r.ratio < 0.9) bucket = '0.50-0.90 (engine 50-90% of MS)';
      else if (r.ratio < 0.95) bucket = '0.90-0.95 (engine 90-95% of MS)';
      else if (r.ratio <= 1.05) bucket = '0.95-1.05 (within 5%)';
      else if (r.ratio <= 1.10) bucket = '1.05-1.10 (engine 5-10% high)';
      else if (r.ratio <= 1.50) bucket = '1.10-1.50 (engine 10-50% high)';
      else bucket = '1.50+ (engine >50% high)';

      if (!ratioBuckets[bucket]) ratioBuckets[bucket] = [];
      ratioBuckets[bucket].push(r);
    }
    for (const [bucket, items] of Object.entries(ratioBuckets).sort()) {
      lines.push(`  ${bucket}: ${items.length} cases`);
      for (const r of items.slice(0, 5)) {
        lines.push(`    ${r.ticker} ${r.quarter} ratio=${r.ratio.toFixed(3)}`);
      }
      if (items.length > 5) lines.push(`    ... and ${items.length - 5} more`);
    }

    lines.push('');
    lines.push(`EDGAR API: ${requestCount} live requests, ${cacheHits} cache hits`);

    console.log(lines.join('\n'));
  });

  it.each(ALL_TICKERS)(
    'D&A diagnostic for %s',
    async (ticker) => {
      if (EUR_COMPANIES.has(ticker)) return;

      // Fetch engine data
      const engineData = await fetchEdgarQuarterly(ticker);
      if (!engineData) return;

      // Also fetch raw companyFacts for tag resolution analysis
      const cik = await lookupCIK(ticker);
      const companyFacts = cik ? await fetchCompanyFacts(cik) : null;

      const offset = detectQuarterlyYearOffset(
        msFixtures[ticker].statements.income,
        engineData?.quarterly,
        engineData?.fiscalYears || []
      );

      const msCashFlow = msFixtures[ticker].statements.cash_flow || {};

      // Find the MS field names for D&A
      const daFieldNames = [
        'Depreciation, Amortization and Depletion, Non-Cash Adjustment',
        'Depreciation and Amortization, Non-Cash Adjustment',
      ];

      for (const msPeriod of Object.keys(msCashFlow)) {
        if (msPeriod === 'TTM') continue;
        const parsed = parseQuarterLabel(msPeriod);
        if (!parsed) continue;

        const edgarYear = parsed.year + offset;
        const edgarQtr = `Q${parsed.quarter}`;

        // Skip spin-off pre-spin years
        if (SPIN_OFF[ticker] && edgarYear < SPIN_OFF[ticker]) continue;

        // Get MS D&A value (try both field names)
        let msValue = null;
        let msFieldUsed = null;
        for (const fn of daFieldNames) {
          if (msCashFlow[msPeriod]?.[fn] != null) {
            msValue = msCashFlow[msPeriod][fn];
            msFieldUsed = fn;
            break;
          }
        }

        if (msValue == null) continue; // MS doesn't have D&A for this quarter

        // MS sign convention: D&A is positive in MS for cash flow (sign=1 in field-mapping)
        const msExpected = msValue; // sign multiplier = 1

        // Get engine value
        const engineQtr = engineData?.quarterly?.[edgarYear]?.[edgarQtr];
        if (!engineQtr) {
          allResults.push({ ticker, quarter: msPeriod, status: 'MISSING' });
          totalMissing++;
          continue;
        }

        const engineVal = engineQtr.cashFlow?.depreciation_amortization;

        // Look up which XBRL tags have data for this quarter
        const availableTags = companyFacts
          ? findDATagsForQuarter(companyFacts, edgarYear, edgarQtr)
          : [];

        // Determine which tag the engine likely resolved to (the max-pick logic)
        let resolvedTag = 'unknown';
        if (engineVal != null && availableTags.length > 0) {
          // The engine picks Math.max of all candidates, so find which tag's value matches
          const match = availableTags.find(t => Math.abs(t.val - engineVal) < 1);
          if (match) {
            resolvedTag = match.tag;
          } else {
            // Check if it's a component sum (depreciation_only + amort)
            const deprecOnly = availableTags.find(t => t.tag === 'Depreciation');
            const amortIntang = availableTags.find(t => t.tag === 'AmortizationOfIntangibleAssets');
            const amortAdj = availableTags.find(t => t.tag === 'AdjustmentForAmortization');
            if (deprecOnly) {
              const amort = Math.max(amortAdj?.val ?? 0, amortIntang?.val ?? 0);
              const sum = deprecOnly.val + amort;
              if (Math.abs(sum - engineVal) < 1) {
                resolvedTag = `Depreciation + ${amortAdj && (amortAdj.val >= (amortIntang?.val ?? 0)) ? 'AdjustmentForAmortization' : 'AmortizationOfIntangibleAssets'} (component sum)`;
              }
            }
            if (resolvedTag === 'unknown') {
              resolvedTag = `max-pick (eng=${engineVal}, candidates: ${availableTags.map(t => `${t.tag}=${t.val}`).join(', ')})`;
            }
          }
        }

        if (engineVal == null) {
          allResults.push({ ticker, quarter: msPeriod, status: 'ENGINE_NULL' });
          allDiffs.push({ ticker, quarter: msPeriod, msExpected, engineVal: null, resolvedTag: null, availableTags });
          totalEngineNull++;
          continue;
        }

        // Compare with 5% tolerance (field-mapping says "close")
        const pct = msExpected !== 0 ? Math.abs((engineVal - msExpected) / msExpected) : (engineVal === 0 ? 0 : Infinity);
        if (pct <= 0.05) {
          allResults.push({ ticker, quarter: msPeriod, status: 'MATCH' });
          totalMatch++;
        } else {
          allResults.push({ ticker, quarter: msPeriod, status: 'DIFF' });
          allDiffs.push({ ticker, quarter: msPeriod, msExpected, engineVal, resolvedTag, availableTags, pct });
          totalDiff++;
        }
      }

      // Just ensure we processed something
      expect(true).toBe(true);
    },
    120000
  );
});

// ─── Formatting helpers ──────────────────────────────────────

function fmt(val) {
  if (val == null) return 'null';
  if (Math.abs(val) >= 1e9) return (val / 1e9).toFixed(2) + 'B';
  if (Math.abs(val) >= 1e6) return (val / 1e6).toFixed(1) + 'M';
  return val.toLocaleString();
}
