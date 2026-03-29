/**
 * quarterly-revenue-diagnostic.mjs — Revenue mismatch root-cause analysis
 *
 * Loads all quarterly Morningstar fixtures, fetches engine data via
 * the same disk-cached EDGAR fetch interceptor used in the test suite,
 * and prints a focused diagnostic for the `revenues` field only.
 *
 * For each company with revenue DIFFs it shows:
 *   - Offset detection result (0 or -1) with scores
 *   - Quarter-level side-by-side: MS label → MS value vs engine value vs % diff
 *   - Cross-reference: where the MS revenue value actually appears in the engine
 *   - Raw EDGAR entries for every revenue tag found on that ticker
 *     (form, fy, fp, start, end, duration, filed, value — first 20 per tag)
 *
 * Run with:
 *   node --experimental-vm-modules scripts/quarterly-revenue-diagnostic.mjs
 *
 * Uses disk cache at src/engines/__tests__/fixtures/morningstar/edgar-cache/
 * (shared with the annual and quarterly test suites).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const FIXTURES_DIR   = path.join(ROOT, 'src/engines/__tests__/fixtures/morningstar-quarterly');
const ANNUAL_DIR     = path.join(ROOT, 'src/engines/__tests__/fixtures/morningstar');
const EDGAR_CACHE    = path.join(ANNUAL_DIR, 'edgar-cache');
const FIELD_MAP_PATH = path.join(ANNUAL_DIR, 'field-mapping.json');

// ─── Revenue XBRL tags (from INCOME_TAXONOMY in edgarFinancials.js) ──────────

const REVENUE_TAGS = [
  'RevenueFromContractWithCustomerExcludingAssessedTax',
  'Revenues',
  'SalesRevenueNet',
  'SalesRevenueGoodsNet',
  'RevenueFromContractWithCustomerIncludingAssessedTax',
];

// ─── Fetch Interceptor (identical to test suite) ──────────────────────────────

const SEC_HEADERS = {
  'User-Agent': 'StockAnalyzer/1.0 kylehoff@example.com',
  'Accept-Encoding': 'identity',
};

let requestCount = 0;
let cacheHits    = 0;
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

  const cacheKey  = resolved.replace(/[^a-zA-Z0-9.-]/g, '_').slice(0, 200);
  const cachePath = path.join(EDGAR_CACHE, cacheKey + '.json');

  if (fs.existsSync(cachePath)) {
    cacheHits++;
    const data = fs.readFileSync(cachePath, 'utf-8');
    return new Response(data, {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }

  const now     = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < 100) await new Promise(r => setTimeout(r, 100 - elapsed));
  lastRequestTime = Date.now();
  requestCount++;

  const resp = await originalFetch(resolved, {
    ...opts,
    headers: { ...SEC_HEADERS, ...opts.headers },
  });

  if (resp.ok) {
    const text = await resp.text();
    fs.mkdirSync(EDGAR_CACHE, { recursive: true });
    fs.writeFileSync(cachePath, text);
    return new Response(text, {
      status: resp.status,
      headers: { 'content-type': 'application/json' },
    });
  }

  return resp;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(v) {
  if (v == null) return 'N/A';
  return (v / 1e6).toFixed(0) + 'M';
}

function pctDiff(engine, ms) {
  if (ms == null || ms === 0) return 'N/A';
  return ((engine - ms) / ms * 100).toFixed(1) + '%';
}

function parseQuarterLabel(label) {
  const m = label.trim().match(/^Q(\d)\s+(\d{4})$/);
  if (!m) return null;
  return { quarter: parseInt(m[1]), year: parseInt(m[2]) };
}

// ─── Offset Detection (identical to test suite) ───────────────────────────────

function detectQuarterlyYearOffset(msIncomeStmt, engineQuarterly, engineFYs) {
  if (!msIncomeStmt || !engineQuarterly || engineFYs.length === 0) return { offset: 0, scores: {} };

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
    let matches = 0, compared = 0;
    for (const [msYearStr, msQuarters] of Object.entries(msByFY)) {
      const edgarYear = parseInt(msYearStr) + offset;
      for (const [qtr, msFields] of Object.entries(msQuarters)) {
        const msRev  = msFields['Total Revenue'];
        const engRev = engineQuarterly[edgarYear]?.[qtr]?.income?.revenues;
        if (msRev != null && engRev != null) {
          compared++;
          if (Math.abs((engRev - msRev) / msRev) < 0.02) matches++;
        }
      }
    }
    scores[offset] = { matches, compared };
  }

  const offset = (scores[-1].matches > scores[0].matches && scores[-1].matches >= 5) ? -1 : 0;
  return { offset, scores };
}

// ─── Raw EDGAR companyfacts fetch (used for tag inspection) ──────────────────

async function fetchCompanyFacts(cik) {
  const paddedCik = String(cik).padStart(10, '0');
  const url = `/api/edgar/api/xbrl/companyfacts/CIK${paddedCik}.json`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

// We need the CIK for each ticker. Re-use the same lookup the engine uses.
// Rather than duplicating CIK lookup logic, we derive it from cached CIK responses.
async function lookupCIK(ticker) {
  const url = `/api/sec/cgi-bin/browse-edgar?company=&CIK=${encodeURIComponent(ticker)}&type=10-K&dateb=&owner=include&count=5&search_text=&action=getcompany&output=atom`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const text = await resp.text();
    const match = text.match(/CIK=(\d+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Import the engine AFTER fetch override is active
  const { fetchEdgarQuarterly } = await import('../src/engines/edgarFinancials.js');

  // Load fixtures
  const msFixtures = {};
  for (const file of fs.readdirSync(FIXTURES_DIR)) {
    if (!file.endsWith('.json')) continue;
    const ticker = file.replace('.json', '');
    msFixtures[ticker] = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, file), 'utf-8'));
  }

  const ALL_TICKERS = Object.keys(msFixtures).sort();
  const EUR_COMPANIES = new Set(['RACE']);
  const FINANCIAL_SECTOR = new Set(['BRK-B', 'JPM', 'MET', 'WFC']);

  console.log('');
  console.log('═'.repeat(80));
  console.log(' QUARTERLY REVENUE DIAGNOSTIC');
  console.log(` ${ALL_TICKERS.length} tickers | focus: revenues field | ${new Date().toISOString().slice(0, 19)}`);
  console.log('═'.repeat(80));

  const summary = [];   // { ticker, offset, diffQuarters, missingQuarters }

  for (const ticker of ALL_TICKERS) {
    if (EUR_COMPANIES.has(ticker)) {
      summary.push({ ticker, skipped: 'EUR currency' });
      continue;
    }

    process.stdout.write(`\nProcessing ${ticker}... `);

    let engineData;
    try {
      engineData = await fetchEdgarQuarterly(ticker);
    } catch (err) {
      console.log(`ERROR: ${err.message}`);
      summary.push({ ticker, error: err.message });
      continue;
    }

    if (!engineData) {
      console.log('ENGINE RETURNED NULL');
      summary.push({ ticker, error: 'ENGINE_NULL' });
      continue;
    }
    console.log(`ok (${engineData.fiscalYears.length} FYs)`);

    const fixture    = msFixtures[ticker];
    const msIncome   = fixture.statements.income;
    const msQuarters = Object.keys(msIncome).filter(q => q !== 'TTM');

    // Offset detection
    const { offset, scores } = detectQuarterlyYearOffset(
      msIncome,
      engineData.quarterly,
      engineData.fiscalYears
    );

    // Collect revenue comparisons at this offset
    const diffs    = [];
    const matches  = [];
    const missing  = [];

    for (const msQ of msQuarters) {
      const parsed = parseQuarterLabel(msQ);
      if (!parsed) continue;

      const edgarYear = parsed.year + offset;
      const edgarQtr  = `Q${parsed.quarter}`;
      const msRev     = msIncome[msQ]['Total Revenue'];

      if (msRev == null) continue;

      const engRev = engineData.quarterly[edgarYear]?.[edgarQtr]?.income?.revenues;

      if (engRev == null) {
        missing.push({ msQ, edgarYear, edgarQtr, msRev });
      } else {
        const pct = Math.abs((engRev - msRev) / msRev);
        if (pct < 0.01) {
          matches.push({ msQ, edgarYear, edgarQtr, msRev, engRev, pct });
        } else {
          diffs.push({ msQ, edgarYear, edgarQtr, msRev, engRev, pct });
        }
      }
    }

    const isFinancial  = FINANCIAL_SECTOR.has(ticker);
    const effectiveThresh = isFinancial ? 0.20 : 0.01;  // relaxed for financials
    // Re-classify with effective threshold for financials
    const effectiveDiffs = isFinancial
      ? diffs.filter(d => d.pct > effectiveThresh)
      : diffs;

    const hasProblem = effectiveDiffs.length > 0 || missing.length > 0;

    // Build summary row
    const totalCompared = matches.length + diffs.length;
    summary.push({
      ticker,
      offset,
      offsetScores: scores,
      totalQtrs: msQuarters.length,
      compared: totalCompared,
      matchCount: matches.length,
      diffCount: diffs.length,
      missingCount: missing.length,
      effectiveDiffCount: effectiveDiffs.length,
      isFinancial,
    });

    if (!hasProblem) continue;

    // ── Detailed output for this company ──────────────────────────────────────

    console.log('');
    console.log('─'.repeat(80));
    console.log(` ${ticker}  |  offset:${offset}  |  scores: 0→${scores[0]?.matches}/${scores[0]?.compared} -1→${scores[-1]?.matches}/${scores[-1]?.compared}`);
    if (isFinancial) console.log(' [Financial sector — revenue tolerance relaxed to 20%]');
    console.log('─'.repeat(80));

    // Engine FY structure
    const fyLine = engineData.fiscalYears.map(fy => {
      const qtrs = Object.keys(engineData.quarterly[fy] || {}).sort();
      return `FY${fy}[${qtrs.join('')}]`;
    }).join('  ');
    console.log(` Engine FYs: ${fyLine}`);
    console.log('');

    // Side-by-side revenue table
    console.log(` ${'MS Quarter'.padEnd(12)} ${'→ Edgar Slot'.padEnd(16)} ${'MS Revenue'.padEnd(14)} ${'Engine Revenue'.padEnd(14)} ${'Diff%'.padEnd(8)} Status`);
    console.log(' ' + '─'.repeat(76));

    for (const msQ of msQuarters) {
      const parsed = parseQuarterLabel(msQ);
      if (!parsed) continue;

      const edgarYear = parsed.year + offset;
      const edgarQtr  = `Q${parsed.quarter}`;
      const msRev     = msIncome[msQ]['Total Revenue'];
      if (msRev == null) continue;

      const engRev = engineData.quarterly[edgarYear]?.[edgarQtr]?.income?.revenues;
      const diff   = engRev != null ? Math.abs((engRev - msRev) / msRev) : null;

      let status;
      if (engRev == null)                                       status = 'MISSING';
      else if (diff < 0.01)                                     status = 'MATCH';
      else if (isFinancial && diff < effectiveThresh)           status = 'MATCH(relaxed)';
      else if (diff < 0.05)                                     status = 'CLOSE';
      else                                                      status = 'DIFF';

      const edgarSlot = `FY${edgarYear}/${edgarQtr}`;
      const diffStr   = engRev != null ? pctDiff(engRev, msRev) : '—';

      const flag = (status === 'DIFF' || status === 'MISSING') ? ' ◄' : '';
      console.log(
        ` ${msQ.padEnd(12)} ${edgarSlot.padEnd(16)} ${fmt(msRev).padEnd(14)} ${fmt(engRev).padEnd(14)} ${diffStr.padEnd(8)} ${status}${flag}`
      );
    }

    // Cross-reference: where does each DIFF/MISSING MS value live in the engine?
    const problemRows = [...effectiveDiffs, ...missing];
    if (problemRows.length > 0) {
      console.log('');
      console.log(' Cross-reference — where does each DIFF/MISSING MS revenue appear in engine?');
      console.log(' ' + '─'.repeat(76));

      for (const row of problemRows) {
        const { msQ, msRev } = row;
        const found = [];
        for (const fy of engineData.fiscalYears) {
          for (const q of ['Q1', 'Q2', 'Q3', 'Q4']) {
            const rev = engineData.quarterly[fy]?.[q]?.income?.revenues;
            if (rev != null && Math.abs((rev - msRev) / msRev) < 0.01) {
              found.push(`FY${fy}/${q}(${fmt(rev)})`);
            }
          }
        }
        const where = found.length > 0 ? found.join(', ') : 'NOT FOUND anywhere in engine';
        console.log(` MS ${msQ.padEnd(10)} [${fmt(msRev)}]  →  ${where}`);
      }
    }

    // Raw EDGAR revenue tag entries
    console.log('');
    console.log(' Raw EDGAR revenue tag entries (10-Q and 10-K, up to 20 per tag)');
    console.log(' ' + '─'.repeat(76));

    // Fetch raw companyfacts for this ticker
    const cik = await lookupCIK(ticker);
    if (!cik) {
      console.log(' [could not look up CIK]');
      continue;
    }

    const facts = await fetchCompanyFacts(cik);
    if (!facts) {
      console.log(' [could not fetch companyfacts]');
      continue;
    }

    let anyTagFound = false;
    for (const tag of REVENUE_TAGS) {
      const tagFacts = facts?.facts?.['us-gaap']?.[tag];
      if (!tagFacts) continue;

      const entries = (tagFacts.units?.USD || [])
        .filter(e => e.form === '10-Q' || e.form === '10-K')
        .sort((a, b) => {
          // Sort by fy desc, then fp, then end desc
          if (a.fy !== b.fy) return b.fy - a.fy;
          return b.end.localeCompare(a.end);
        });

      if (entries.length === 0) continue;
      anyTagFound = true;

      console.log('');
      console.log(` Tag: ${tag}  (${entries.length} USD entries total)`);
      console.log(` ${'form'.padEnd(6)} ${'fy'.padEnd(5)} ${'fp'.padEnd(4)} ${'start'.padEnd(12)} ${'end'.padEnd(12)} ${'dur(d)'.padEnd(7)} ${'filed'.padEnd(12)} value`);

      const shown = entries.slice(0, 20);
      for (const e of shown) {
        const dur = e.start
          ? String(Math.round((new Date(e.end) - new Date(e.start)) / 86400000))
          : '—';
        console.log(
          ` ${e.form.padEnd(6)} ${String(e.fy ?? '').padEnd(5)} ${String(e.fp ?? '').padEnd(4)} ${String(e.start ?? '—').padEnd(12)} ${e.end.padEnd(12)} ${dur.padEnd(7)} ${e.filed.padEnd(12)} ${fmt(e.val)}`
        );
      }
      if (entries.length > 20) {
        console.log(` ... and ${entries.length - 20} more entries omitted`);
      }
    }

    if (!anyTagFound) {
      console.log(' [no known revenue tags found in companyfacts — may use non-standard tag]');
    }
  }

  // ─── Summary ───────────────────────────────────────────────────────────────

  console.log('');
  console.log('═'.repeat(80));
  console.log(' REVENUE DIFF SUMMARY');
  console.log('═'.repeat(80));
  console.log('');
  console.log(` ${'Ticker'.padEnd(10)} ${'Offset'.padEnd(8)} ${'Match'.padEnd(8)} ${'DIFF'.padEnd(8)} ${'Missing'.padEnd(10)} ${'EffDiff'.padEnd(10)} Notes`);
  console.log(' ' + '─'.repeat(76));

  let totalDiff = 0, totalMatch = 0, totalMissing = 0;

  for (const row of summary) {
    if (row.skipped) {
      console.log(` ${row.ticker.padEnd(10)} skipped — ${row.skipped}`);
      continue;
    }
    if (row.error) {
      console.log(` ${row.ticker.padEnd(10)} ERROR — ${row.error}`);
      continue;
    }

    const offStr   = `offset:${row.offset}`;
    const notes    = [];
    if (row.isFinancial) notes.push('financial-sector');
    if (row.offset === -1) notes.push('FY-offset');

    const hasProblem = row.effectiveDiffCount > 0 || row.missingCount > 0;
    const flag       = hasProblem ? ' ◄' : '';

    console.log(
      ` ${row.ticker.padEnd(10)} ${offStr.padEnd(8)} ${String(row.matchCount).padEnd(8)} ${String(row.diffCount).padEnd(8)} ${String(row.missingCount).padEnd(10)} ${String(row.effectiveDiffCount).padEnd(10)} ${notes.join(', ')}${flag}`
    );

    totalDiff    += row.diffCount;
    totalMatch   += row.matchCount;
    totalMissing += row.missingCount;
  }

  console.log(' ' + '─'.repeat(76));
  const totalCompared = totalMatch + totalDiff;
  const pct = totalCompared > 0 ? ((totalMatch / totalCompared) * 100).toFixed(1) : '0.0';
  console.log(` TOTAL: ${totalMatch}/${totalCompared} match (${pct}%) | ${totalDiff} DIFF | ${totalMissing} missing`);
  console.log('');
  console.log(` EDGAR API: ${requestCount} live requests, ${cacheHits} cache hits`);
  console.log('');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
