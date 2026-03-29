/**
 * quarterly-div-invest-diagnostic.test.mjs — Diagnose dividends_paid + investment field failures
 *
 * Run with: npx vitest run scripts/quarterly-div-invest-diagnostic.test.mjs --reporter=verbose
 *
 * Investigates two quarterly failure patterns:
 *   Pattern 1: dividends_paid (67 DIFFs, 7 companies)
 *   Pattern 2: sale_of_investments (104 DIFFs, 10 cos) + purchase_of_investments (98 DIFFs, 16 cos)
 *
 * For ALL 50 tickers, compares these fields' quarterly values (MS vs engine),
 * showing ticker, quarter, MS value, engine value, ratio for each DIFF.
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

// ─── Load Fixtures & Mapping ─────────────────────────────────────────

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

const STMT_MAP = { income: 'income', balance_sheet: 'balance', cash_flow: 'cashFlow' };

// EUR companies — skip
const EUR_COMPANIES = new Set(['RACE']);

// ─── Quarter Label Parser ────────────────────────────────────────────

function parseQuarterLabel(label) {
  const match = label.trim().match(/^Q(\d)\s+(\d{4})$/);
  if (!match) return null;
  return { quarter: parseInt(match[1]), year: parseInt(match[2]) };
}

// ─── Fiscal Year Offset Detection (same as quarterly accuracy test) ──

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

// ─── Target Fields ──────────────────────────────────────────────────

// Fields to investigate and their field-mapping entries
const TARGET_FIELDS = {
  dividends_paid: {
    msFields: ['Common Stock Dividends Paid', 'Cash Dividends Paid'],
    stmtKey: 'cash_flow',
    engineStmtKey: 'cashFlow',
    group: 'DIVIDENDS',
  },
  sale_of_investments: {
    msFields: ['Sale of Investments'],
    stmtKey: 'cash_flow',
    engineStmtKey: 'cashFlow',
    group: 'INVESTMENTS',
  },
  purchase_of_investments: {
    msFields: ['Purchase of Investments'],
    stmtKey: 'cash_flow',
    engineStmtKey: 'cashFlow',
    group: 'INVESTMENTS',
  },
};

// ─── Comparison Thresholds ──────────────────────────────────────────

const THRESHOLDS = {
  exact: 0.01,
  close: 0.05,
  approximate: 0.10,
  relaxed: 0.20,
  informational: Infinity,
};

// ─── Test Suite ──────────────────────────────────────────────────────

let fetchEdgarQuarterly;

// Accumulate results across all tickers
const dividendDiffs = [];
const investmentDiffs = [];
const dividendMissing = [];
const investmentMissing = [];
const perTickerSummary = [];

describe('Quarterly Dividends & Investment Diagnostic', () => {
  beforeAll(async () => {
    const mod = await import('../src/engines/edgarFinancials.js');
    fetchEdgarQuarterly = mod.fetchEdgarQuarterly;
  }, 15000);

  afterAll(() => {
    // ─── FINAL REPORT ────────────────────────────────────────────
    console.log('\n' + '='.repeat(90));
    console.log('DIVIDENDS & INVESTMENT QUARTERLY DIAGNOSTIC REPORT');
    console.log('='.repeat(90));

    // ── Dividends Section ──
    console.log('\n' + '─'.repeat(90));
    console.log('PATTERN 1: dividends_paid');
    console.log('─'.repeat(90));
    console.log(`Total DIFFs: ${dividendDiffs.length}`);

    if (dividendDiffs.length > 0) {
      // Group by ticker
      const byTicker = {};
      for (const d of dividendDiffs) {
        if (!byTicker[d.ticker]) byTicker[d.ticker] = [];
        byTicker[d.ticker].push(d);
      }

      console.log(`Affected companies: ${Object.keys(byTicker).join(', ')}\n`);

      // Pattern analysis
      let signMismatch = 0;
      let magnitudeDiff = 0;
      let ratioNeg1 = 0;
      let ratioOther = 0;

      for (const d of dividendDiffs) {
        if ((d.expected > 0 && d.engineVal < 0) || (d.expected < 0 && d.engineVal > 0)) {
          signMismatch++;
        }
        const ratio = d.expected !== 0 ? d.engineVal / d.expected : null;
        if (ratio != null && Math.abs(ratio - (-1)) < 0.05) ratioNeg1++;
        else if (ratio != null && Math.abs(ratio - 1) > 0.05) ratioOther++;
        else magnitudeDiff++;
      }

      console.log(`Pattern breakdown:`);
      console.log(`  Sign mismatch (positive vs negative): ${signMismatch}`);
      console.log(`  Ratio ≈ -1 (exact sign flip): ${ratioNeg1}`);
      console.log(`  Magnitude difference (same sign): ${magnitudeDiff}`);
      console.log(`  Other ratio: ${ratioOther}`);

      console.log(`\nDetailed DIFFs:`);
      console.log('  ' + 'Ticker'.padEnd(8) + 'Quarter'.padEnd(12) + 'MS(expected)'.padEnd(18) + 'Engine'.padEnd(18) + 'Ratio'.padEnd(10) + 'MSfield');

      for (const [ticker, diffs] of Object.entries(byTicker)) {
        for (const d of diffs) {
          const ratio = d.expected !== 0 ? (d.engineVal / d.expected).toFixed(3) : 'N/A';
          const msStr = fmtM(d.expected);
          const engStr = fmtM(d.engineVal);
          console.log(`  ${ticker.padEnd(8)}${d.quarter.padEnd(12)}${msStr.padEnd(18)}${engStr.padEnd(18)}${ratio.padEnd(10)}${d.msField}`);
        }
      }
    }

    if (dividendMissing.length > 0) {
      console.log(`\nMissing (MS has value, engine null): ${dividendMissing.length}`);
      const missByTicker = {};
      for (const d of dividendMissing) {
        if (!missByTicker[d.ticker]) missByTicker[d.ticker] = 0;
        missByTicker[d.ticker]++;
      }
      for (const [t, c] of Object.entries(missByTicker)) {
        console.log(`  ${t}: ${c} missing quarters`);
      }
    }

    // ── Investment Section ──
    console.log('\n' + '─'.repeat(90));
    console.log('PATTERN 2: sale_of_investments + purchase_of_investments');
    console.log('─'.repeat(90));
    console.log(`Total DIFFs: ${investmentDiffs.length}`);

    if (investmentDiffs.length > 0) {
      // Group by field then ticker
      const byField = {};
      for (const d of investmentDiffs) {
        if (!byField[d.thesisField]) byField[d.thesisField] = {};
        if (!byField[d.thesisField][d.ticker]) byField[d.thesisField][d.ticker] = [];
        byField[d.thesisField][d.ticker].push(d);
      }

      for (const [field, byTicker] of Object.entries(byField)) {
        const totalDiffs = Object.values(byTicker).reduce((s, arr) => s + arr.length, 0);
        console.log(`\n  ${field}: ${totalDiffs} DIFFs across ${Object.keys(byTicker).length} companies`);
        console.log(`  Affected: ${Object.keys(byTicker).join(', ')}`);

        // Pattern analysis
        let signMismatch = 0;
        let ratioNeg1 = 0;
        let ratioCluster = {};

        for (const diffs of Object.values(byTicker)) {
          for (const d of diffs) {
            if ((d.expected > 0 && d.engineVal < 0) || (d.expected < 0 && d.engineVal > 0)) {
              signMismatch++;
            }
            const ratio = d.expected !== 0 ? d.engineVal / d.expected : null;
            if (ratio != null) {
              if (Math.abs(ratio - (-1)) < 0.05) ratioNeg1++;
              // Bucket ratios for pattern detection
              const bucket = ratio > 0 ? Math.round(ratio * 10) / 10 : Math.round(ratio * 10) / 10;
              ratioCluster[bucket] = (ratioCluster[bucket] || 0) + 1;
            }
          }
        }

        console.log(`  Sign mismatches: ${signMismatch}`);
        console.log(`  Ratio ≈ -1 (exact sign flip): ${ratioNeg1}`);

        // Show top ratio clusters
        const topClusters = Object.entries(ratioCluster)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5);
        console.log(`  Top ratio clusters: ${topClusters.map(([r, c]) => `${r}x(${c})`).join(', ')}`);

        // Detailed DIFFs (limit to first 30)
        console.log(`\n  ${'Ticker'.padEnd(8)}${'Quarter'.padEnd(12)}${'MS(expected)'.padEnd(18)}${'Engine'.padEnd(18)}${'Ratio'.padEnd(10)}${'Pct'.padEnd(10)}`);
        let shown = 0;
        for (const [ticker, diffs] of Object.entries(byTicker)) {
          for (const d of diffs) {
            if (shown >= 30) break;
            const ratio = d.expected !== 0 ? (d.engineVal / d.expected).toFixed(3) : 'N/A';
            const pct = d.expected !== 0 ? ((d.engineVal - d.expected) / Math.abs(d.expected) * 100).toFixed(1) + '%' : 'N/A';
            console.log(`  ${ticker.padEnd(8)}${d.quarter.padEnd(12)}${fmtM(d.expected).padEnd(18)}${fmtM(d.engineVal).padEnd(18)}${ratio.padEnd(10)}${pct}`);
            shown++;
          }
          if (shown >= 30) break;
        }
        if (shown >= 30) console.log(`  ... (${totalDiffs - 30} more)`);
      }
    }

    if (investmentMissing.length > 0) {
      console.log(`\nMissing (MS has value, engine null): ${investmentMissing.length}`);
      const missByField = {};
      for (const d of investmentMissing) {
        const key = `${d.thesisField}:${d.ticker}`;
        if (!missByField[d.thesisField]) missByField[d.thesisField] = {};
        if (!missByField[d.thesisField][d.ticker]) missByField[d.thesisField][d.ticker] = 0;
        missByField[d.thesisField][d.ticker]++;
      }
      for (const [field, tickers] of Object.entries(missByField)) {
        console.log(`  ${field}:`);
        for (const [t, c] of Object.entries(tickers)) {
          console.log(`    ${t}: ${c} missing`);
        }
      }
    }

    // ── Per-Ticker Summary ──
    console.log('\n' + '─'.repeat(90));
    console.log('PER-TICKER SUMMARY');
    console.log('─'.repeat(90));
    console.log('  ' + 'Ticker'.padEnd(8) + 'Offset'.padEnd(8) + 'DivMatch'.padEnd(10) + 'DivDiff'.padEnd(10) + 'DivMiss'.padEnd(10) + 'InvMatch'.padEnd(10) + 'InvDiff'.padEnd(10) + 'InvMiss'.padEnd(10));
    for (const s of perTickerSummary) {
      console.log(`  ${s.ticker.padEnd(8)}${String(s.offset).padEnd(8)}${String(s.divMatch).padEnd(10)}${String(s.divDiff).padEnd(10)}${String(s.divMiss).padEnd(10)}${String(s.invMatch).padEnd(10)}${String(s.invDiff).padEnd(10)}${String(s.invMiss).padEnd(10)}`);
    }

    console.log(`\n  EDGAR API: ${requestCount} live requests, ${cacheHits} cache hits`);
  });

  it.each(ALL_TICKERS)(
    '%s',
    async (ticker) => {
      const fixture = msFixtures[ticker];
      if (EUR_COMPANIES.has(ticker)) return;

      const engineData = await fetchEdgarQuarterly(ticker);
      if (!engineData) return;

      // Detect offset
      const offset = detectQuarterlyYearOffset(
        fixture.statements.income,
        engineData.quarterly,
        engineData.fiscalYears
      );

      const msCF = fixture.statements.cash_flow || {};
      const msQuarters = Object.keys(msCF).filter(q => q !== 'TTM');

      let divMatch = 0, divDiff = 0, divMiss = 0;
      let invMatch = 0, invDiff = 0, invMiss = 0;

      for (const [thesisField, fieldInfo] of Object.entries(TARGET_FIELDS)) {
        const mapEntry = fieldMapping[fieldInfo.stmtKey];
        // Find the first MS field name that exists in fieldMapping
        let msFieldName = null;
        let sign = 1;
        let tolerance = 'close';
        for (const msF of fieldInfo.msFields) {
          if (mapEntry[msF]) {
            msFieldName = msF;
            sign = mapEntry[msF].sign;
            tolerance = mapEntry[msF].tolerance;
            break;
          }
        }
        if (!msFieldName) continue;

        for (const msQ of msQuarters) {
          const parsed = parseQuarterLabel(msQ);
          if (!parsed) continue;

          const edgarYear = parsed.year + offset;
          const edgarQtr = `Q${parsed.quarter}`;

          // Try both MS field names in order (some fixtures use parent "Cash Dividends Paid" instead of child)
          let msValue = null;
          let usedMsField = msFieldName;
          for (const msF of fieldInfo.msFields) {
            const v = msCF[msQ]?.[msF];
            if (v != null) {
              msValue = v;
              usedMsField = msF;
              break;
            }
          }
          if (msValue == null) continue;

          const expected = sign * msValue;
          const engineQtr = engineData.quarterly?.[edgarYear]?.[edgarQtr];
          const engineVal = engineQtr?.[fieldInfo.engineStmtKey]?.[thesisField];

          const isDiv = fieldInfo.group === 'DIVIDENDS';

          if (engineVal == null) {
            if (isDiv) { divMiss++; dividendMissing.push({ ticker, quarter: msQ, thesisField, msField: usedMsField, expected }); }
            else { invMiss++; investmentMissing.push({ ticker, quarter: msQ, thesisField, msField: usedMsField, expected }); }
            continue;
          }

          // Check match
          let isMatch = false;
          if (Math.abs(expected) < 1 && Math.abs(engineVal) < 1) {
            isMatch = true;
          } else if (expected === 0) {
            isMatch = Math.abs(engineVal) < 1_000_000;
          } else {
            const pct = Math.abs((engineVal - expected) / expected);
            const threshold = THRESHOLDS[tolerance] || THRESHOLDS.close;
            isMatch = pct <= threshold;
          }

          if (isMatch) {
            if (isDiv) divMatch++;
            else invMatch++;
          } else {
            const diffEntry = { ticker, quarter: msQ, thesisField, msField: usedMsField, expected, engineVal };
            if (isDiv) {
              divDiff++;
              dividendDiffs.push(diffEntry);
            } else {
              invDiff++;
              investmentDiffs.push(diffEntry);
            }
          }
        }
      }

      perTickerSummary.push({ ticker, offset, divMatch, divDiff, divMiss, invMatch, invDiff, invMiss });
    },
    120000
  );
});

// ─── Helpers ──────────────────────────────────────────────────────────

function fmtM(val) {
  if (val == null) return 'null';
  const sign = val < 0 ? '-' : '';
  const abs = Math.abs(val);
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(0)}M`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(0)}K`;
  return `${sign}${abs}`;
}
