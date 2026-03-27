#!/usr/bin/env node
/**
 * Batch API Comparison — runs FMP, SimFin, and mstarpy against all 50 truth set tickers.
 * Produces a summary report with per-ticker accuracy scores.
 *
 * Usage: node validation/scripts/batch-api-comparison.mjs
 *        node validation/scripts/batch-api-comparison.mjs --skip-mstarpy  (skip slow Morningstar scraper)
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const TRUTH_DIR = resolve(ROOT, 'knowledge/morningstar-financial-statements');
const REPORT_DIR = resolve(ROOT, 'validation/reports');

const SKIP_MSTARPY = process.argv.includes('--skip-mstarpy');

// ── Load .env.local ──────────────────────────────────────────────────────────
const envPath = resolve(ROOT, '.env.local');
const envLines = readFileSync(envPath, 'utf-8').split('\n');
const ENV = {};
for (const line of envLines) {
  const m = line.match(/^([A-Z_]+)=(.+)$/);
  if (m) ENV[m[1]] = m[2].trim();
}
const FMP_KEY = ENV.VITE_FMP_KEY;
const SIMFIN_KEY = ENV.VITE_SIMFIN_KEY;

// ── All truth set tickers ────────────────────────────────────────────────────
const ALL_TICKERS = readdirSync(TRUTH_DIR)
  .filter(d => existsSync(resolve(TRUTH_DIR, d, `${d}_Income_Statement_Annual_Restated.csv`)))
  .sort();

console.log(`\n╔══════════════════════════════════════════════════════════════════╗`);
console.log(`║  Thes1s — Batch API Comparison (${ALL_TICKERS.length} tickers)                     ║`);
console.log(`║  Sources: FMP, SimFin${SKIP_MSTARPY ? '' : ', mstarpy'}                                     ║`);
console.log(`╚══════════════════════════════════════════════════════════════════╝\n`);

// ── Helpers ──────────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchJSON(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) return { _error: true, status: res.status };
  return res.json();
}

function pctDiff(actual, expected) {
  if (!expected || !actual) return null;
  return Math.abs((actual - expected) / expected);
}

// ── Parse Morningstar CSV ────────────────────────────────────────────────────
function parseMorningstarCSV(filePath) {
  if (!existsSync(filePath)) return null;
  const raw = readFileSync(filePath, 'utf-8');
  const lines = raw.split('\n').filter(l => l.trim());
  if (lines.length < 2) return null;

  const headerParts = lines[0].split(',');
  const years = headerParts.slice(1).map(y => y.trim()).filter(y => y && y !== 'TTM');

  const data = {};
  for (const line of lines.slice(1)) {
    const parts = [];
    let inQuote = false, current = '';
    for (const ch of line) {
      if (ch === '"') { inQuote = !inQuote; continue; }
      if (ch === ',' && !inQuote) { parts.push(current); current = ''; continue; }
      current += ch;
    }
    parts.push(current);
    const label = parts[0].trim();
    if (!label || label.startsWith('Fiscal year')) continue;
    const values = {};
    for (let i = 0; i < years.length; i++) {
      const raw = (parts[i + 1] || '').trim().replace(/\.$/, '');
      if (raw && raw !== '') {
        const num = parseFloat(raw);
        if (!isNaN(num)) values[years[i]] = num;
      }
    }
    if (Object.keys(values).length > 0) data[label] = values;
  }
  return { years, data };
}

function loadTruthSet(ticker) {
  const dir = resolve(TRUTH_DIR, ticker);
  return {
    income: parseMorningstarCSV(resolve(dir, `${ticker}_Income_Statement_Annual_Restated.csv`)),
    balance: parseMorningstarCSV(resolve(dir, `${ticker}_Balance_Sheet_Annual_Restated.csv`)),
    cashFlow: parseMorningstarCSV(resolve(dir, `${ticker}_Cash_Flow_Annual_Restated.csv`)),
  };
}

// ── Core comparison fields ───────────────────────────────────────────────────
const FIELDS = {
  income: [
    { ms: 'Total Revenue', fmp: 'revenue', simfin: 'Revenue', label: 'Revenue' },
    { ms: 'Cost of Revenue', fmp: 'costOfRevenue', simfin: 'Cost of Revenue', label: 'COGS', negate: true },
    { ms: 'Gross Profit', fmp: 'grossProfit', simfin: 'Gross Profit', label: 'Gross Profit' },
    { ms: 'Total Operating Profit/Loss', fmp: 'operatingIncome', simfin: 'Operating Income (Loss)', label: 'Op Income' },
    { ms: 'Pretax Income', fmp: 'incomeBeforeTax', simfin: 'Pretax Income (Loss)', label: 'Pretax' },
    { ms: 'Net Income after Non-Controlling/Minority Interests', fmp: 'netIncome', simfin: 'Net Income', label: 'Net Income' },
  ],
  balance: [
    { ms: 'Total Assets', fmp: 'totalAssets', simfin: 'Total Assets', label: 'Assets' },
    { ms: 'Total Liabilities', fmp: 'totalLiabilities', simfin: 'Total Liabilities', label: 'Liabilities' },
    { ms: 'Total Equity', fmp: 'totalStockholdersEquity', simfin: 'Total Equity', label: 'Equity' },
    { ms: 'Cash and Cash Equivalents', fmp: 'cashAndCashEquivalents', simfin: 'Cash, Cash Equivalents & Short Term Investments', label: 'Cash' },
    { ms: 'Long Term Debt', fmp: 'longTermDebt', simfin: 'Long Term Debt', label: 'LT Debt' },
  ],
  cashFlow: [
    { ms: 'Cash Flow from Operating Activities, Indirect', fmp: 'netCashProvidedByOperatingActivities', simfin: 'Net Cash from Operating Activities', label: 'Op CF' },
    { ms: 'Cash Flow from Investing Activities', fmp: 'netCashProvidedByInvestingActivities', simfin: 'Net Cash from Investing Activities', label: 'Inv CF' },
    { ms: 'Cash Flow from Financing Activities', fmp: 'netCashProvidedByFinancingActivities', simfin: 'Net Cash from Financing Activities', label: 'Fin CF' },
    { ms: 'Purchase of Property, Plant and Equipment', fmp: 'capitalExpenditure', simfin: 'Capital Expenditures', label: 'CapEx', negate: true },
  ],
};

// ── FMP fetch ────────────────────────────────────────────────────────────────
async function fetchFMP(ticker) {
  const base = 'https://financialmodelingprep.com/stable';
  const q = `symbol=${ticker}&period=annual&apikey=${FMP_KEY}`;
  const [income, balance, cashFlow] = await Promise.all([
    fetchJSON(`${base}/income-statement?${q}`),
    fetchJSON(`${base}/balance-sheet-statement?${q}`),
    fetchJSON(`${base}/cash-flow-statement?${q}`),
  ]);
  if (income._error || !Array.isArray(income)) return null;
  const normalize = (arr) => {
    if (!Array.isArray(arr)) return {};
    const out = {};
    for (const row of arr) {
      const year = row.fiscalYear || row.date?.slice(0, 4);
      if (year) out[String(year)] = row;
    }
    return out;
  };
  return { income: normalize(income), balance: normalize(balance), cashFlow: normalize(cashFlow) };
}

// ── SimFin fetch ─────────────────────────────────────────────────────────────
async function fetchSimFin(ticker) {
  const base = 'https://backend.simfin.com/api/v3/companies/statements';
  const headers = { 'Authorization': `api-key ${SIMFIN_KEY}` };
  const [incomeRes, balanceRes, cashFlowRes] = await Promise.all([
    fetchJSON(`${base}/compact?ticker=${ticker}&statements=PL&period=FY`, { headers }),
    fetchJSON(`${base}/compact?ticker=${ticker}&statements=BS&period=FY`, { headers }),
    fetchJSON(`${base}/compact?ticker=${ticker}&statements=CF&period=FY`, { headers }),
  ]);

  function parseCompact(apiRes) {
    const company = Array.isArray(apiRes) ? apiRes[0] : apiRes;
    let cols, rows;
    if (company?.statements) {
      const stmt = company.statements[0];
      cols = stmt?.columns || []; rows = stmt?.data || [];
    } else if (company?.columns) {
      cols = company.columns; rows = company.data || [];
    } else return {};
    const yearIdx = cols.indexOf('Fiscal Year');
    const out = {};
    for (const row of rows) {
      const year = String(row[yearIdx]);
      const obj = {};
      for (let i = 0; i < cols.length; i++) obj[cols[i]] = row[i];
      out[year] = obj;
    }
    return out;
  }

  if (incomeRes._error) return null;
  return { income: parseCompact(incomeRes), balance: parseCompact(balanceRes), cashFlow: parseCompact(cashFlowRes) };
}

// ── mstarpy fetch ────────────────────────────────────────────────────────────
function fetchMstarpy(ticker) {
  const tmpScript = resolve(__dirname, '_mstarpy_batch_tmp.py');
  writeFileSync(tmpScript, `
import json
try:
    from mstarpy import Stock
    s = Stock(term="${ticker}")
    income = s.incomeStatement(period="annual", reportType="restated")
    balance = s.balanceSheet(period="annual", reportType="restated")
    cf = s.cashFlow(period="annual", reportType="restated")
    print(json.dumps({"success": True, "income": income, "balance": balance, "cashFlow": cf}, default=str))
except Exception as e:
    print(json.dumps({"success": False, "error": str(e)}))
`);

  try {
    const output = execSync(`python3 ${tmpScript}`, {
      timeout: 45000, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
    });
    try { require('fs').unlinkSync(tmpScript); } catch {}

    const data = JSON.parse(output.trim());
    if (!data.success) return null;

    function parseMstarpy(stmtData) {
      if (!stmtData?.columnDefs || !stmtData?.rows) return {};
      const allCols = stmtData.columnDefs;
      const years = allCols.filter(y => y !== 'TTM');
      const magnitude = stmtData.footer?.orderOfMagnitude;
      const multiplier = magnitude === 'Million' ? 1e6 : magnitude === 'Thousand' ? 1e3 : 1;
      const out = {};
      for (const year of years) out[year] = {};
      function walk(rows) {
        for (const row of rows) {
          const label = row.label;
          const datum = row.datum;
          if (label && datum) {
            for (let i = 0; i < years.length && i < allCols.length; i++) {
              const colIdx = allCols.indexOf(years[i]);
              const v = datum[colIdx];
              if (v != null && v !== '_PO_' && typeof v === 'number') {
                const isPerShare = label.includes('EPS') || label.includes('Per Share') || label.includes('Weighted Average Shares');
                out[years[i]][label] = isPerShare ? v : v * multiplier;
              }
            }
          }
          if (row.subLevel) walk(row.subLevel);
        }
      }
      walk(stmtData.rows);
      return out;
    }

    return { income: parseMstarpy(data.income), balance: parseMstarpy(data.balance), cashFlow: parseMstarpy(data.cashFlow) };
  } catch {
    try { require('fs').unlinkSync(tmpScript); } catch {}
    return null;
  }
}

// ── Compare source vs truth ──────────────────────────────────────────────────
function compare(sourceData, truth, sourceName) {
  let matches = 0, mismatches = 0, missing = 0, total = 0;
  const diffs = [];

  for (const [stmtType, fields] of Object.entries(FIELDS)) {
    const truthData = truth[stmtType]?.data;
    const srcData = sourceData[stmtType];
    if (!truthData || !srcData) continue;

    const truthYears = truth[stmtType]?.years || [];
    const srcYears = Object.keys(srcData);
    const overlap = truthYears.filter(y => srcYears.includes(y)).sort().slice(0, -1);
    if (overlap.length === 0) continue;
    const testYear = overlap[overlap.length - 1];

    for (const field of fields) {
      const srcFieldName = sourceName === 'mstarpy' ? field.ms : field[sourceName];
      if (!srcFieldName) continue;
      total++;

      let msValue = truthData[field.ms]?.[testYear] ?? null;
      let srcValue = srcData[testYear]?.[srcFieldName] ?? null;

      if (field.negate && srcValue != null && srcValue > 0 && msValue != null && msValue < 0) {
        srcValue = -srcValue;
      }

      if (msValue == null || srcValue == null) { missing++; continue; }

      const diff = pctDiff(srcValue, msValue);
      if (diff != null && diff < 0.01) {
        matches++;
      } else {
        mismatches++;
        diffs.push({ field: field.label, year: testYear, ms: msValue, src: srcValue, diff });
      }
    }
  }
  return { matches, mismatches, missing, total, diffs };
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const results = [];
  let fmpTotal = { m: 0, x: 0, miss: 0, n: 0 };
  let simfinTotal = { m: 0, x: 0, miss: 0, n: 0 };
  let mstarpyTotal = { m: 0, x: 0, miss: 0, n: 0 };

  for (let i = 0; i < ALL_TICKERS.length; i++) {
    const ticker = ALL_TICKERS[i];
    const truth = loadTruthSet(ticker);
    if (!truth.income) { console.log(`  [${i+1}/${ALL_TICKERS.length}] ${ticker} — no truth data, skipping`); continue; }

    process.stdout.write(`  [${i+1}/${ALL_TICKERS.length}] ${ticker.padEnd(6)} `);

    // FMP
    const fmpData = await fetchFMP(ticker);
    const fmpResult = fmpData ? compare(fmpData, truth, 'fmp') : null;
    if (fmpResult) { fmpTotal.m += fmpResult.matches; fmpTotal.x += fmpResult.mismatches; fmpTotal.miss += fmpResult.missing; fmpTotal.n += fmpResult.total; }

    // SimFin — rate limit 5/sec, we made 3 calls above
    await sleep(700);
    const simfinData = await fetchSimFin(ticker);
    const simfinResult = simfinData ? compare(simfinData, truth, 'simfin') : null;
    if (simfinResult) { simfinTotal.m += simfinResult.matches; simfinTotal.x += simfinResult.mismatches; simfinTotal.miss += simfinResult.missing; simfinTotal.n += simfinResult.total; }

    // mstarpy — slow, one ticker at a time
    let mstarpyResult = null;
    if (!SKIP_MSTARPY) {
      await sleep(2000); // Be polite to Morningstar
      const mstarpyData = fetchMstarpy(ticker);
      mstarpyResult = mstarpyData ? compare(mstarpyData, truth, 'mstarpy') : null;
      if (mstarpyResult) { mstarpyTotal.m += mstarpyResult.matches; mstarpyTotal.x += mstarpyResult.mismatches; mstarpyTotal.miss += mstarpyResult.missing; mstarpyTotal.n += mstarpyResult.total; }
    }

    const fmpPct = fmpResult ? `${((fmpResult.matches / (fmpResult.matches + fmpResult.mismatches || 1)) * 100).toFixed(0)}%` : 'ERR';
    const sfPct = simfinResult ? `${((simfinResult.matches / (simfinResult.matches + simfinResult.mismatches || 1)) * 100).toFixed(0)}%` : 'ERR';
    const msPct = mstarpyResult ? `${((mstarpyResult.matches / (mstarpyResult.matches + mstarpyResult.mismatches || 1)) * 100).toFixed(0)}%` : (SKIP_MSTARPY ? 'SKIP' : 'ERR');

    console.log(`FMP: ${fmpPct.padEnd(5)} SimFin: ${sfPct.padEnd(5)} mstarpy: ${msPct}`);

    results.push({
      ticker,
      fmp: fmpResult,
      simfin: simfinResult,
      mstarpy: mstarpyResult,
    });

    // Rate limit between tickers
    await sleep(300);
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  const accPct = (t) => t.n > 0 ? ((t.m / (t.m + t.x || 1)) * 100).toFixed(1) : '--';

  console.log(`\n\n╔══════════════════════════════════════════════════════════════════╗`);
  console.log(`║  RESULTS SUMMARY (${ALL_TICKERS.length} tickers)                                   ║`);
  console.log(`╚══════════════════════════════════════════════════════════════════╝`);
  console.log(`\n  Source       Match    Differ   Missing  Total    Accuracy`);
  console.log(`  ──────────────────────────────────────────────────────────`);
  console.log(`  FMP          ${String(fmpTotal.m).padEnd(8)} ${String(fmpTotal.x).padEnd(8)} ${String(fmpTotal.miss).padEnd(8)} ${String(fmpTotal.n).padEnd(8)} ${accPct(fmpTotal)}%`);
  console.log(`  SimFin       ${String(simfinTotal.m).padEnd(8)} ${String(simfinTotal.x).padEnd(8)} ${String(simfinTotal.miss).padEnd(8)} ${String(simfinTotal.n).padEnd(8)} ${accPct(simfinTotal)}%`);
  if (!SKIP_MSTARPY) {
    console.log(`  mstarpy      ${String(mstarpyTotal.m).padEnd(8)} ${String(mstarpyTotal.x).padEnd(8)} ${String(mstarpyTotal.miss).padEnd(8)} ${String(mstarpyTotal.n).padEnd(8)} ${accPct(mstarpyTotal)}%`);
  }

  // Tickers with mismatches
  console.log(`\n  Tickers with mismatches:`);
  for (const r of results) {
    const issues = [];
    if (r.fmp?.mismatches > 0) issues.push(`FMP(${r.fmp.mismatches}): ${r.fmp.diffs.map(d => d.field).join(', ')}`);
    if (r.simfin?.mismatches > 0) issues.push(`SimFin(${r.simfin.mismatches}): ${r.simfin.diffs.map(d => d.field).join(', ')}`);
    if (r.mstarpy?.mismatches > 0) issues.push(`mstarpy(${r.mstarpy.mismatches}): ${r.mstarpy.diffs.map(d => d.field).join(', ')}`);
    if (issues.length > 0) console.log(`    ${r.ticker}: ${issues.join(' | ')}`);
  }

  // Tickers where sources failed
  const fmpFails = results.filter(r => !r.fmp).map(r => r.ticker);
  const simfinFails = results.filter(r => !r.simfin).map(r => r.ticker);
  const mstarpyFails = results.filter(r => !r.mstarpy && !SKIP_MSTARPY).map(r => r.ticker);

  if (fmpFails.length > 0) console.log(`\n  FMP failures: ${fmpFails.join(', ')}`);
  if (simfinFails.length > 0) console.log(`  SimFin failures: ${simfinFails.join(', ')}`);
  if (mstarpyFails.length > 0) console.log(`  mstarpy failures: ${mstarpyFails.join(', ')}`);

  // Save report
  const reportPath = resolve(REPORT_DIR, 'api-source-comparison.json');
  writeFileSync(reportPath, JSON.stringify({ timestamp: new Date().toISOString(), results, totals: { fmp: fmpTotal, simfin: simfinTotal, mstarpy: mstarpyTotal } }, null, 2));
  console.log(`\n  Report saved: validation/reports/api-source-comparison.json`);
  console.log(`\n✓ Done`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
