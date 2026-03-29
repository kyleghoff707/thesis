/**
 * quarterly-capex-diagnostic.test.mjs — Diagnose capital_expenditures_net quarterly failures
 *
 * Run with: npx vitest run scripts/quarterly-capex-diagnostic.test.mjs --reporter=verbose
 *
 * Compares EDGAR quarterly engine `capital_expenditures_net` against Morningstar fixtures
 * for ALL 50 tickers. Reports detailed per-ticker, per-quarter diffs with ratios.
 */

import { describe, it, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const FIXTURES_DIR = path.join(ROOT, 'src/engines/__tests__/fixtures/morningstar-quarterly');
const ANNUAL_FIXTURES_DIR = path.join(ROOT, 'src/engines/__tests__/fixtures/morningstar');
const EDGAR_CACHE_DIR = path.join(ANNUAL_FIXTURES_DIR, 'edgar-cache');

// ─── Fetch Interceptor (same as quarterly accuracy test) ──────────────────
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

// ─── Load All Fixtures ──────────────────────────────────────
const msFixtures = {};
for (const file of fs.readdirSync(FIXTURES_DIR)) {
  if (!file.endsWith('.json')) continue;
  const ticker = file.replace('.json', '');
  msFixtures[ticker] = JSON.parse(
    fs.readFileSync(path.join(FIXTURES_DIR, file), 'utf-8')
  );
}
const ALL_TICKERS = Object.keys(msFixtures).sort();

// Companies that report in non-USD currency — skip from comparison
const EUR_COMPANIES = new Set(['RACE']);

// Spin-off companies — skip pre-spin years
const SPIN_OFF = { EW: 2023, JNJ: 2023, T: 2022 };

// ─── Quarter Label Parser ──────────────────────────────────
function parseQuarterLabel(label) {
  const match = label.trim().match(/^Q(\d)\s+(\d{4})$/);
  if (!match) return null;
  return { quarter: parseInt(match[1]), year: parseInt(match[2]) };
}

// ─── Fiscal Year Offset Detection (same as accuracy test) ──
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

// ─── Collected Results ──────────────────────────────────────
const allDiffs = [];          // { ticker, quarter, msVal, engineVal, ratio, engineCapex, engineSalePPE }
const tickerSummaries = [];   // { ticker, total, match, diff, nullEngine, nullMS, offset }

let fetchEdgarQuarterly;

// MS field names
const MS_CAPEX_NET_FIELD = 'Purchase/Sale and Disposal of Property, Plant and Equipment, Net';
const MS_CAPEX_FIELD = 'Purchase of Property, Plant and Equipment';

describe('Quarterly CapEx Net Diagnostic', () => {
  beforeAll(async () => {
    const mod = await import('../src/engines/edgarFinancials.js');
    fetchEdgarQuarterly = mod.fetchEdgarQuarterly;
  }, 15000);

  afterAll(() => {
    // ─── Print Summary Report ──────────────────────────────
    console.log('\n' + '='.repeat(90));
    console.log('QUARTERLY capital_expenditures_net DIAGNOSTIC REPORT');
    console.log('='.repeat(90));

    // Per-ticker summary
    console.log('\nPER-TICKER SUMMARY:');
    console.log(
      '  ' +
      'Ticker'.padEnd(10) +
      'Total'.padStart(6) +
      'Match'.padStart(7) +
      'Diff'.padStart(6) +
      'NullEng'.padStart(9) +
      'NullMS'.padStart(8) +
      'Offset'.padStart(8)
    );
    console.log('  ' + '-'.repeat(54));

    let grandTotal = 0, grandMatch = 0, grandDiff = 0, grandNullEng = 0, grandNullMS = 0;

    for (const s of tickerSummaries) {
      if (s.total === 0 && s.nullMS > 0) continue; // No MS data for this field
      console.log(
        '  ' +
        s.ticker.padEnd(10) +
        String(s.total).padStart(6) +
        String(s.match).padStart(7) +
        String(s.diff).padStart(6) +
        String(s.nullEngine).padStart(9) +
        String(s.nullMS).padStart(8) +
        String(s.offset).padStart(8)
      );
      grandTotal += s.total;
      grandMatch += s.match;
      grandDiff += s.diff;
      grandNullEng += s.nullEngine;
    }

    console.log('  ' + '-'.repeat(54));
    console.log(
      '  ' +
      'TOTAL'.padEnd(10) +
      String(grandTotal).padStart(6) +
      String(grandMatch).padStart(7) +
      String(grandDiff).padStart(6) +
      String(grandNullEng).padStart(9)
    );
    const matchRate = grandTotal > 0 ? ((grandMatch / grandTotal) * 100).toFixed(1) : '0.0';
    console.log(`\n  Match rate: ${grandMatch}/${grandTotal} (${matchRate}%)`);

    // ─── All DIFFs detail ──────────────────────────────────
    if (allDiffs.length > 0) {
      console.log('\n' + '-'.repeat(90));
      console.log('ALL DIFFS (engine vs MS mismatch > 5%):');
      console.log('-'.repeat(90));
      console.log(
        '  ' +
        'Ticker'.padEnd(8) +
        'Quarter'.padEnd(10) +
        'MS Value'.padStart(16) +
        'Engine Value'.padStart(16) +
        'Ratio'.padStart(8) +
        'Eng CapEx'.padStart(16) +
        'Eng SalePPE'.padStart(14) +
        'Pattern'.padStart(12)
      );
      console.log('  ' + '-'.repeat(98));

      for (const d of allDiffs) {
        const msStr = d.msVal != null ? (d.msVal / 1e6).toFixed(1) + 'M' : 'null';
        const engStr = d.engineVal != null ? (d.engineVal / 1e6).toFixed(1) + 'M' : 'null';
        const capexStr = d.engineCapex != null ? (d.engineCapex / 1e6).toFixed(1) + 'M' : 'null';
        const ppeStr = d.engineSalePPE != null ? (d.engineSalePPE / 1e6).toFixed(1) + 'M' : 'null';
        const ratioStr = d.ratio != null ? d.ratio.toFixed(3) : 'N/A';

        // Pattern detection
        let pattern = '';
        if (d.engineVal == null) {
          pattern = 'null-eng';
        } else if (d.msVal != null && d.engineVal != null) {
          if (d.engineSalePPE != null && d.engineSalePPE > 0) {
            // Check if the diff is explained by sale_of_ppe
            const withoutSale = d.engineCapex != null ? -Math.abs(d.engineCapex) : null;
            if (withoutSale != null && Math.abs((withoutSale - d.msVal) / d.msVal) < 0.05) {
              pattern = 'sale_of_ppe';
            }
          }
          if (!pattern && d.msVal < 0 && d.engineVal < 0 && Math.abs(d.engineVal) > Math.abs(d.msVal)) {
            pattern = 'eng>ms';
          } else if (!pattern && d.msVal < 0 && d.engineVal < 0 && Math.abs(d.engineVal) < Math.abs(d.msVal)) {
            pattern = 'eng<ms';
          } else if (!pattern && d.msVal > 0 && d.engineVal < 0) {
            pattern = 'sign-flip';
          } else if (!pattern && d.msVal < 0 && d.engineVal > 0) {
            pattern = 'sign-flip';
          } else if (!pattern && d.msVal > 0 && d.engineVal > 0) {
            pattern = 'both-pos';
          }
        }

        console.log(
          '  ' +
          d.ticker.padEnd(8) +
          d.quarter.padEnd(10) +
          msStr.padStart(16) +
          engStr.padStart(16) +
          ratioStr.padStart(8) +
          capexStr.padStart(16) +
          ppeStr.padStart(14) +
          pattern.padStart(12)
        );
      }

      // ─── Pattern Summary ──────────────────────────────────
      console.log('\n' + '-'.repeat(90));
      console.log('PATTERN SUMMARY:');
      console.log('-'.repeat(90));

      const patterns = {};
      for (const d of allDiffs) {
        let pattern = 'unknown';
        if (d.engineVal == null) {
          pattern = 'null-engine';
        } else if (d.msVal != null && d.engineVal != null) {
          if (d.engineSalePPE != null && d.engineSalePPE > 0) {
            const withoutSale = d.engineCapex != null ? -Math.abs(d.engineCapex) : null;
            if (withoutSale != null && Math.abs((withoutSale - d.msVal) / d.msVal) < 0.05) {
              pattern = 'sale_of_ppe-mismatch (engine adds sale_of_ppe that MS already netted)';
            }
          }
          if (pattern === 'unknown') {
            // Check if MS is computing the net differently (MS = capex + sale_of_ppe already)
            // while engine re-derives it
            const msCapexRaw = d.msCapex;
            if (msCapexRaw != null) {
              const msCapexAbs = Math.abs(msCapexRaw);
              const engCapexAbs = d.engineCapex != null ? Math.abs(d.engineCapex) : null;
              if (engCapexAbs != null && Math.abs(engCapexAbs - msCapexAbs) / msCapexAbs > 0.05) {
                pattern = 'capex-mismatch (raw capex differs between engine and MS)';
              }
            }
          }
          if (pattern === 'unknown') {
            if (d.msVal < 0 && d.engineVal < 0 && Math.abs(d.engineVal) > Math.abs(d.msVal)) {
              pattern = 'engine-more-negative (engine over-counts spending)';
            } else if (d.msVal < 0 && d.engineVal < 0 && Math.abs(d.engineVal) < Math.abs(d.msVal)) {
              pattern = 'engine-less-negative (engine under-counts spending)';
            } else if ((d.msVal > 0 && d.engineVal < 0) || (d.msVal < 0 && d.engineVal > 0)) {
              pattern = 'sign-flip';
            } else {
              pattern = 'other-magnitude';
            }
          }
        }
        if (!patterns[pattern]) patterns[pattern] = [];
        patterns[pattern].push(d.ticker);
      }

      for (const [pattern, tickers] of Object.entries(patterns).sort((a, b) => b[1].length - a[1].length)) {
        const unique = [...new Set(tickers)];
        console.log(`  ${pattern}: ${tickers.length} diffs across ${unique.length} companies (${unique.join(', ')})`);
      }
    }

    // ─── Companies with NULL engine but non-null MS ─────────
    const nullEngTickers = tickerSummaries.filter(s => s.nullEngine > 0);
    if (nullEngTickers.length > 0) {
      console.log('\n' + '-'.repeat(90));
      console.log('COMPANIES WITH NULL ENGINE (MS has data, engine returns null):');
      console.log('-'.repeat(90));
      for (const s of nullEngTickers) {
        console.log(`  ${s.ticker}: ${s.nullEngine} quarters with null engine`);
      }
    }

    // ─── Derivation Analysis ────────────────────────────────
    console.log('\n' + '-'.repeat(90));
    console.log('DERIVATION ANALYSIS:');
    console.log('-'.repeat(90));
    console.log('  Engine formula: capital_expenditures_net = -|capital_expenditures| + (sale_of_ppe ?? 0)');
    console.log('  MS field: "Purchase/Sale and Disposal of Property, Plant and Equipment, Net" (sign=1)');
    console.log('  MS capex: "Purchase of Property, Plant and Equipment" (sign=-1, so MS reports negative)');
    console.log('');
    console.log('  If MS nets capex+sales into one line and engine splits them,');
    console.log('  the diff could come from sale_of_ppe being added by engine but already');
    console.log('  included in the MS net figure. Or the raw capex tags may differ.');

    // ─── Ratio distribution ─────────────────────────────────
    const ratios = allDiffs.filter(d => d.ratio != null && isFinite(d.ratio));
    if (ratios.length > 0) {
      console.log('\n' + '-'.repeat(90));
      console.log('RATIO DISTRIBUTION (engine / MS):');
      console.log('-'.repeat(90));
      const sorted = ratios.map(d => d.ratio).sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;
      console.log(`  Count: ${sorted.length}`);
      console.log(`  Min:   ${sorted[0].toFixed(3)}`);
      console.log(`  Max:   ${sorted[sorted.length - 1].toFixed(3)}`);
      console.log(`  Median: ${median.toFixed(3)}`);
      console.log(`  Mean:   ${avg.toFixed(3)}`);

      // Bucket distribution
      const buckets = { '<0.5': 0, '0.5-0.9': 0, '0.9-1.1': 0, '1.1-1.5': 0, '1.5-2.0': 0, '>2.0': 0, 'negative': 0 };
      for (const r of sorted) {
        if (r < 0) buckets['negative']++;
        else if (r < 0.5) buckets['<0.5']++;
        else if (r < 0.9) buckets['0.5-0.9']++;
        else if (r <= 1.1) buckets['0.9-1.1']++;
        else if (r <= 1.5) buckets['1.1-1.5']++;
        else if (r <= 2.0) buckets['1.5-2.0']++;
        else buckets['>2.0']++;
      }
      console.log('  Buckets:');
      for (const [bucket, count] of Object.entries(buckets)) {
        if (count > 0) console.log(`    ${bucket.padEnd(10)}: ${count}`);
      }
    }

    console.log(`\n  EDGAR API: ${requestCount} live requests, ${cacheHits} cache hits`);
    console.log('');
  });

  it.each(ALL_TICKERS)(
    'capex-net %s',
    async (ticker) => {
      // Skip EUR companies
      if (EUR_COMPANIES.has(ticker)) {
        tickerSummaries.push({ ticker, total: 0, match: 0, diff: 0, nullEngine: 0, nullMS: 0, offset: 0 });
        return;
      }

      const fixture = msFixtures[ticker];
      const engineData = await fetchEdgarQuarterly(ticker);

      if (!engineData) {
        tickerSummaries.push({ ticker, total: 0, match: 0, diff: 0, nullEngine: 0, nullMS: 0, offset: 0 });
        return;
      }

      // Detect offset using same logic as accuracy test
      const offset = detectQuarterlyYearOffset(
        fixture.statements.income,
        engineData?.quarterly,
        engineData?.fiscalYears || []
      );

      const msCF = fixture.statements.cash_flow || {};
      const msQuarters = Object.keys(msCF).filter(q => q !== 'TTM');

      let total = 0, match = 0, diff = 0, nullEngine = 0, nullMS = 0;

      for (const msQ of msQuarters) {
        const parsed = parseQuarterLabel(msQ);
        if (!parsed) continue;

        // Skip spin-off pre-spin years
        const edgarYear = parsed.year + offset;
        if (SPIN_OFF[ticker] && edgarYear < SPIN_OFF[ticker]) continue;

        const msNetVal = msCF[msQ]?.[MS_CAPEX_NET_FIELD];
        const msCapexVal = msCF[msQ]?.[MS_CAPEX_FIELD]; // negative in MS

        if (msNetVal == null) {
          nullMS++;
          continue;
        }

        const edgarQtr = `Q${parsed.quarter}`;
        const engineQtr = engineData?.quarterly?.[edgarYear]?.[edgarQtr];
        const engineNetVal = engineQtr?.cashFlow?.capital_expenditures_net;
        const engineCapex = engineQtr?.cashFlow?.capital_expenditures;
        const engineSalePPE = engineQtr?.cashFlow?.sale_of_ppe;

        // MS field mapping: sign=1, so expected = 1 * msNetVal = msNetVal (already negative for outflows)
        const expected = msNetVal;

        if (engineNetVal == null) {
          nullEngine++;
          allDiffs.push({
            ticker, quarter: msQ, msVal: expected, engineVal: null,
            ratio: null, engineCapex, engineSalePPE, msCapex: msCapexVal,
          });
          continue;
        }

        total++;

        // Close tolerance: 5%
        const pct = Math.abs(expected) > 1
          ? Math.abs((engineNetVal - expected) / expected)
          : (Math.abs(engineNetVal) < 1 ? 0 : Infinity);

        if (pct <= 0.05) {
          match++;
        } else {
          diff++;
          const ratio = expected !== 0 ? engineNetVal / expected : null;
          allDiffs.push({
            ticker, quarter: msQ, msVal: expected, engineVal: engineNetVal,
            ratio, engineCapex, engineSalePPE, msCapex: msCapexVal,
          });
        }
      }

      tickerSummaries.push({ ticker, total, match, diff, nullEngine, nullMS, offset });
    },
    120000
  );
});
