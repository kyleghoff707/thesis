#!/usr/bin/env node
/**
 * API Source Verification & Truth Set Comparison
 *
 * Tests all financial data API keys (FMP, SimFin, EODHD, mstarpy, Yahoo Finance)
 * and compares their annual income statement, balance sheet, and cash flow data
 * against the Morningstar CSV truth set.
 *
 * Usage: node validation/scripts/test-api-sources.mjs [TICKER]
 * Default ticker: AAPL
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const TRUTH_DIR = resolve(ROOT, 'knowledge/morningstar-financial-statements');

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
const EODHD_KEY = ENV.VITE_EODHD_KEY;
const ALPHA_VANTAGE_KEY = ENV.VITE_ALPHA_VANTAGE_KEY;

const TICKER = (process.argv[2] || 'AAPL').toUpperCase();

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n) {
  if (n == null || isNaN(n)) return '--';
  return n.toLocaleString('en-US');
}

function fmtPct(n) {
  if (n == null || isNaN(n)) return '--';
  return (n * 100).toFixed(1) + '%';
}

function pctDiff(actual, expected) {
  if (!expected || !actual) return null;
  return Math.abs((actual - expected) / expected);
}

async function fetchJSON(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) {
    return { _error: true, status: res.status, statusText: res.statusText };
  }
  return res.json();
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── Parse Morningstar Truth CSV ──────────────────────────────────────────────
function parseMorningstarCSV(filePath) {
  if (!existsSync(filePath)) return null;
  const raw = readFileSync(filePath, 'utf-8');
  const lines = raw.split('\n').filter(l => l.trim());
  if (lines.length < 2) return null;

  // First line: header with years
  const headerParts = lines[0].split(',');
  // Years are in positions 1+, skip first column (label)
  const years = headerParts.slice(1).map(y => y.trim()).filter(y => y && y !== 'TTM');

  const data = {};
  for (const line of lines.slice(1)) {
    // Handle quoted fields with commas inside
    const parts = [];
    let inQuote = false;
    let current = '';
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
    if (Object.keys(values).length > 0) {
      data[label] = values;
    }
  }
  return { years, data };
}

// ── Load Truth Set ───────────────────────────────────────────────────────────
function loadTruthSet(ticker) {
  const dir = resolve(TRUTH_DIR, ticker);
  return {
    income: parseMorningstarCSV(resolve(dir, `${ticker}_Income_Statement_Annual_Restated.csv`)),
    balance: parseMorningstarCSV(resolve(dir, `${ticker}_Balance_Sheet_Annual_Restated.csv`)),
    cashFlow: parseMorningstarCSV(resolve(dir, `${ticker}_Cash_Flow_Annual_Restated.csv`)),
  };
}

// ── Field Mapping: Morningstar label → API field name per source ─────────────
// We compare a core set of ~20 fields that all sources should have

const COMPARISON_FIELDS = {
  income: [
    { ms: 'Total Revenue', fmp: 'revenue', simfin: 'Revenue', eodhd: 'totalRevenue', yahoo: 'totalRevenue', label: 'Revenue' },
    { ms: 'Cost of Revenue', fmp: 'costOfRevenue', simfin: 'Cost of Revenue', eodhd: 'costOfRevenue', yahoo: 'costOfRevenue', label: 'Cost of Revenue', negate: true },
    { ms: 'Gross Profit', fmp: 'grossProfit', simfin: 'Gross Profit', eodhd: 'grossProfit', yahoo: 'grossProfit', label: 'Gross Profit' },
    { ms: 'Total Operating Profit/Loss', fmp: 'operatingIncome', simfin: 'Operating Income (Loss)', eodhd: 'operatingIncome', yahoo: 'operatingIncome', label: 'Operating Income' },
    { ms: 'Research and Development Expenses', fmp: 'researchAndDevelopmentExpenses', simfin: 'Research & Development', eodhd: 'researchDevelopment', yahoo: 'researchAndDevelopment', label: 'R&D', negate: true },
    { ms: 'Selling, General and Administrative Expenses', fmp: 'sellingGeneralAndAdministrativeExpenses', simfin: 'Selling, General & Administrative', eodhd: 'sellingGeneralAdministrative', yahoo: 'sellingGeneralAndAdministration', label: 'SGA', negate: true },
    { ms: 'Pretax Income', fmp: 'incomeBeforeTax', simfin: 'Pretax Income (Loss)', eodhd: 'incomeBeforeTax', yahoo: 'incomeBeforeTax', label: 'Pretax Income' },
    { ms: 'Provision for Income Tax', fmp: 'incomeTaxExpense', simfin: 'Income Tax (Expense) Benefit, Net', eodhd: 'incomeTaxExpense', yahoo: 'incomeTaxExpense', label: 'Tax Expense', negate: true },
    { ms: 'Net Income after Non-Controlling/Minority Interests', fmp: 'netIncome', simfin: 'Net Income', eodhd: 'netIncome', yahoo: 'netIncome', label: 'Net Income' },
    { ms: 'Diluted EPS', fmp: 'epsdiluted', simfin: null, eodhd: null, yahoo: 'dilutedEPS', label: 'Diluted EPS' },
  ],
  balance: [
    { ms: 'Total Assets', fmp: 'totalAssets', simfin: 'Total Assets', eodhd: 'totalAssets', yahoo: 'totalAssets', label: 'Total Assets' },
    { ms: 'Total Current Assets', fmp: 'totalCurrentAssets', simfin: 'Total Current Assets', eodhd: 'totalCurrentAssets', yahoo: 'currentAssets', label: 'Current Assets' },
    { ms: 'Cash and Cash Equivalents', fmp: 'cashAndCashEquivalents', simfin: 'Cash, Cash Equivalents & Short Term Investments', eodhd: 'cash', yahoo: 'cashAndCashEquivalents', label: 'Cash' },
    { ms: 'Inventories', fmp: 'inventory', simfin: 'Inventories', eodhd: 'inventory', yahoo: 'inventory', label: 'Inventory' },
    { ms: 'Total Liabilities', fmp: 'totalLiabilities', simfin: 'Total Liabilities', eodhd: 'totalLiab', yahoo: 'totalLiabilitiesNetMinorityInterest', label: 'Total Liabilities' },
    { ms: 'Total Current Liabilities', fmp: 'totalCurrentLiabilities', simfin: 'Total Current Liabilities', eodhd: 'totalCurrentLiabilities', yahoo: 'currentLiabilities', label: 'Current Liabilities' },
    { ms: 'Total Equity', fmp: 'totalStockholdersEquity', simfin: 'Total Equity', eodhd: 'totalStockholderEquity', yahoo: 'stockholdersEquity', label: 'Total Equity' },
    { ms: 'Retained Earnings/Accumulated Deficit', fmp: 'retainedEarnings', simfin: 'Retained Earnings', eodhd: 'retainedEarnings', yahoo: 'retainedEarnings', label: 'Retained Earnings' },
    { ms: 'Long Term Debt', fmp: 'longTermDebt', simfin: 'Long Term Debt', eodhd: 'longTermDebt', yahoo: 'longTermDebt', label: 'Long-Term Debt' },
  ],
  cashFlow: [
    { ms: 'Cash Flow from Operating Activities, Indirect', fmp: 'netCashProvidedByOperatingActivities', simfin: 'Net Cash from Operating Activities', eodhd: 'totalCashFromOperatingActivities', yahoo: 'operatingCashFlow', label: 'Operating Cash Flow' },
    { ms: 'Cash Flow from Investing Activities', fmp: 'netCashProvidedByInvestingActivities', simfin: 'Net Cash from Investing Activities', eodhd: 'totalCashflowsFromInvestingActivities', yahoo: 'investingCashFlow', label: 'Investing Cash Flow' },
    { ms: 'Cash Flow from Financing Activities', fmp: 'netCashProvidedByFinancingActivities', simfin: 'Net Cash from Financing Activities', eodhd: 'totalCashFromFinancingActivities', yahoo: 'financingCashFlow', label: 'Financing Cash Flow' },
    { ms: 'Depreciation, Amortization and Depletion, Non-Cash Adjustment', fmp: 'depreciationAndAmortization', simfin: 'Depreciation & Amortization', eodhd: 'depreciation', yahoo: 'depreciationAndAmortization', label: 'D&A' },
    { ms: 'Stock-Based Compensation, Non-Cash Adjustment', fmp: 'stockBasedCompensation', simfin: 'Share-based Compensation', eodhd: 'stockBasedCompensation', yahoo: 'stockBasedCompensation', label: 'Stock-Based Comp' },
    { ms: 'Purchase of Property, Plant and Equipment', fmp: 'capitalExpenditure', simfin: 'Capital Expenditures', eodhd: 'capitalExpenditures', yahoo: 'capitalExpenditure', label: 'CapEx', negate: true },
    { ms: 'Common Stock Dividends Paid', fmp: 'commonDividendsPaid', simfin: 'Dividends Paid', eodhd: 'dividendsPaid', yahoo: 'dividendsPaid', label: 'Dividends Paid', negate: true },
  ],
};

// ── Source 1: FMP ────────────────────────────────────────────────────────────
async function testFMP(ticker) {
  console.log('\n━━━ FMP (Financial Modeling Prep) ━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  if (!FMP_KEY) {
    console.log('  ✗ No VITE_FMP_KEY in .env.local');
    return null;
  }

  const base = 'https://financialmodelingprep.com/stable';
  const q = `symbol=${ticker}&period=annual&apikey=${FMP_KEY}`;

  console.log('  Testing API key...');

  const [income, balance, cashFlow] = await Promise.all([
    fetchJSON(`${base}/income-statement?${q}`),
    fetchJSON(`${base}/balance-sheet-statement?${q}`),
    fetchJSON(`${base}/cash-flow-statement?${q}`),
  ]);

  if (income._error) {
    console.log(`  ✗ API returned ${income.status} ${income.statusText}`);
    if (income.status === 403) console.log('    → API key may be invalid or plan does not include this endpoint');
    if (income.status === 429) console.log('    → Rate limited');
    return null;
  }

  if (!Array.isArray(income) || income.length === 0) {
    console.log('  ✗ Empty response — check API key or plan tier');
    console.log('  Raw response:', JSON.stringify(income).slice(0, 200));
    return null;
  }

  const years = income.map(r => r.fiscalYear || r.date?.slice(0, 4)).filter(Boolean);
  console.log(`  ✓ API key works`);
  console.log(`  ✓ Income: ${income.length} years (${years[years.length - 1]}–${years[0]})`);
  console.log(`  ✓ Balance: ${balance.length} years`);
  console.log(`  ✓ Cash Flow: ${cashFlow.length} years`);

  // Also test exec comp
  const execComp = await fetchJSON(`${base}/governance-executive-compensation?symbol=${ticker}&apikey=${FMP_KEY}`);
  if (execComp._error || !Array.isArray(execComp) || execComp.length === 0) {
    console.log('  ○ Exec Comp: not available on this plan');
  } else {
    console.log(`  ✓ Exec Comp: ${execComp.length} records`);
    if (execComp[0]) {
      const e = execComp[0];
      console.log(`    Sample: ${e.nameAndPosition || e.executiveName || e.name} — $${fmt(e.totalCompensation || e.total || 0)}`);
    }
  }

  // Normalize to {year: {field: value}}
  const normalize = (arr) => {
    if (!Array.isArray(arr)) return {};
    const out = {};
    for (const row of arr) {
      const year = row.fiscalYear || row.calendarYear || row.date?.slice(0, 4);
      if (year) out[String(year)] = row;
    }
    return out;
  };

  return {
    name: 'FMP',
    yearsAvailable: years.length,
    income: normalize(income),
    balance: normalize(balance),
    cashFlow: normalize(cashFlow),
    execComp: (!execComp._error && Array.isArray(execComp)) ? execComp : null,
  };
}

// ── Source 2: SimFin ─────────────────────────────────────────────────────────
async function testSimFin(ticker) {
  console.log('\n━━━ SimFin ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  if (!SIMFIN_KEY) {
    console.log('  ✗ No VITE_SIMFIN_KEY in .env.local');
    return null;
  }

  const base = 'https://backend.simfin.com/api/v3/companies/statements';
  const headers = { 'Authorization': `api-key ${SIMFIN_KEY}` };

  console.log('  Testing API key...');

  const [incomeRes, balanceRes, cashFlowRes] = await Promise.all([
    fetchJSON(`${base}/compact?ticker=${ticker}&statements=PL&period=FY`, { headers }),
    fetchJSON(`${base}/compact?ticker=${ticker}&statements=BS&period=FY`, { headers }),
    fetchJSON(`${base}/compact?ticker=${ticker}&statements=CF&period=FY`, { headers }),
  ]);

  if (incomeRes._error) {
    console.log(`  ✗ API returned ${incomeRes.status} ${incomeRes.statusText}`);
    if (incomeRes.status === 401) console.log('    → API key invalid or not activated (check email confirmation)');
    if (incomeRes.status === 429) console.log('    → Rate limited (max 5/sec on Start plan)');
    return null;
  }

  // SimFin v3 returns: [{ template, name, ticker, statements: [{ statement, columns, data }] }]
  const companyData = Array.isArray(incomeRes) ? incomeRes[0] : incomeRes;

  if (!companyData?.ticker && !companyData?.name) {
    console.log('  ✗ Ticker not found in SimFin database');
    console.log('  Raw:', JSON.stringify(incomeRes).slice(0, 300));
    return null;
  }

  // Parse compact format — statements are nested under the company object
  function parseCompact(apiRes) {
    // Could be [{ statements: [{ columns, data }] }] or [{ columns, data }]
    const company = Array.isArray(apiRes) ? apiRes[0] : apiRes;
    let cols, rows;

    if (company?.statements) {
      // v3 nested format
      const stmt = company.statements[0];
      cols = stmt?.columns || [];
      rows = stmt?.data || [];
    } else if (company?.columns) {
      // Flat format
      cols = company.columns;
      rows = company.data || [];
    } else {
      return {};
    }

    const yearIdx = cols.indexOf('Fiscal Year');
    const out = {};
    for (const row of rows) {
      const year = String(row[yearIdx]);
      const obj = {};
      for (let i = 0; i < cols.length; i++) {
        obj[cols[i]] = row[i];
      }
      out[year] = obj;
    }
    return out;
  }

  const income = parseCompact(incomeRes);
  const balance = parseCompact(balanceRes);
  const cashFlow = parseCompact(cashFlowRes);

  const years = Object.keys(income).sort();
  console.log(`  ✓ API key works`);
  console.log(`  ✓ Income: ${years.length} years (${years[0]}–${years[years.length - 1]})`);
  console.log(`  ✓ Balance: ${Object.keys(balance).length} years`);
  console.log(`  ✓ Cash Flow: ${Object.keys(cashFlow).length} years`);
  console.log(`  ○ Exec Comp: not available from SimFin`);

  return {
    name: 'SimFin',
    yearsAvailable: years.length,
    income,
    balance,
    cashFlow,
    execComp: null,
  };
}

// ── Source 3: EODHD ──────────────────────────────────────────────────────────
async function testEODHD(ticker) {
  console.log('\n━━━ EODHD (EOD Historical Data) ━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  if (!EODHD_KEY) {
    console.log('  ✗ No VITE_EODHD_KEY in .env.local');
    return null;
  }

  console.log('  Testing API key...');

  // EODHD returns everything in one call
  const url = `https://eodhd.com/api/fundamentals/${ticker}.US?api_token=${EODHD_KEY}&fmt=json`;
  const data = await fetchJSON(url);

  if (data._error) {
    console.log(`  ✗ API returned ${data.status} ${data.statusText}`);
    if (data.status === 402) console.log('    → Your EODHD plan does not include Fundamentals (requires $59.99/mo tier)');
    if (data.status === 401) console.log('    → API key invalid');
    return null;
  }

  // Check if financials are present
  const financials = data.Financials;
  if (!financials || !financials.Income_Statement) {
    console.log('  ✗ Fundamentals not included in your EODHD plan');
    console.log('    → Financials section missing from response');
    console.log('    → Available sections:', Object.keys(data || {}).join(', '));
    return null;
  }

  const incomeYearly = financials.Income_Statement?.yearly || {};
  const balanceYearly = financials.Balance_Sheet?.yearly || {};
  const cashFlowYearly = financials.Cash_Flow?.yearly || {};

  const years = Object.keys(incomeYearly).sort();
  console.log(`  ✓ API key works`);
  console.log(`  ✓ Income: ${years.length} years (${years[0]}–${years[years.length - 1]})`);
  console.log(`  ✓ Balance: ${Object.keys(balanceYearly).length} years`);
  console.log(`  ✓ Cash Flow: ${Object.keys(cashFlowYearly).length} years`);

  // Check for officers/exec comp
  const officers = data.General?.Officers;
  if (officers) {
    const sample = Object.values(officers)[0];
    console.log(`  ○ Exec Comp: officer names/titles only (no compensation $)`);
    if (sample) console.log(`    Sample: ${sample.Name} — ${sample.Title}`);
  }

  // Normalize — EODHD uses date keys like "2024-09-30"
  function normalizeByFY(yearly) {
    const out = {};
    for (const [dateKey, row] of Object.entries(yearly)) {
      // Extract year — for companies with non-Dec fiscal years, use the year from the date
      const year = dateKey.slice(0, 4);
      // EODHD values are strings — convert to numbers
      const numRow = {};
      for (const [k, v] of Object.entries(row)) {
        if (typeof v === 'string' && v !== '' && !isNaN(parseFloat(v))) {
          numRow[k] = parseFloat(v);
        } else {
          numRow[k] = v;
        }
      }
      out[year] = numRow;
    }
    return out;
  }

  return {
    name: 'EODHD',
    yearsAvailable: years.length,
    income: normalizeByFY(incomeYearly),
    balance: normalizeByFY(balanceYearly),
    cashFlow: normalizeByFY(cashFlowYearly),
    execComp: null, // names only, no $ amounts
  };
}

// ── Source 4: mstarpy (Morningstar scraper via Python) ───────────────────────
async function testMstarpy(ticker) {
  console.log('\n━━━ mstarpy (Morningstar Scraper) ━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Check if mstarpy is installed
  try {
    execSync('python3 -c "import mstarpy"', { stdio: 'pipe' });
  } catch {
    console.log('  ✗ mstarpy not installed. Run: pip3 install mstarpy');
    return null;
  }

  console.log('  Testing mstarpy (calling Morningstar API via Python)...');

  // Pull all three statements via Python — write to temp file to avoid quoting issues
  const { writeFileSync: writeTmp, unlinkSync } = await import('fs');
  const tmpScript = resolve(__dirname, '_mstarpy_tmp.py');
  writeTmp(tmpScript, `
import json, sys
try:
    from mstarpy import Stock
    s = Stock(term="${ticker}")

    income = s.incomeStatement(period="annual", reportType="restated")
    balance = s.balanceSheet(period="annual", reportType="restated")
    cf = s.cashFlow(period="annual", reportType="restated")

    result = {
        "income": income,
        "balance": balance,
        "cashFlow": cf,
        "success": True
    }
    print(json.dumps(result, default=str))
except Exception as e:
    print(json.dumps({"success": False, "error": str(e)}))
`);

  try {
    const output = execSync(`python3 ${tmpScript}`, {
      timeout: 30000,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    try { unlinkSync(tmpScript); } catch {};

    const data = JSON.parse(output.trim());
    if (!data.success) {
      console.log(`  ✗ mstarpy error: ${data.error}`);
      return null;
    }

    // Parse mstarpy v9 format: nested subLevel tree, values in millions
    function parseMstarpy(stmtData) {
      if (!stmtData?.columnDefs || !stmtData?.rows) return {};
      const allCols = stmtData.columnDefs;
      const years = allCols.filter(y => y !== 'TTM');
      const magnitude = stmtData.footer?.orderOfMagnitude;
      // Convert millions to full dollars to match Morningstar CSVs
      const multiplier = magnitude === 'Million' ? 1e6 : magnitude === 'Thousand' ? 1e3 : 1;
      const out = {};
      for (const year of years) out[year] = {};

      // Walk nested tree, collecting label→datum at every level
      function walk(rows) {
        for (const row of rows) {
          const label = row.label;
          const datum = row.datum;
          if (label && datum) {
            for (let i = 0; i < years.length && i < allCols.length; i++) {
              const colIdx = allCols.indexOf(years[i]);
              const v = datum[colIdx];
              if (v != null && v !== '_PO_' && typeof v === 'number') {
                // EPS and share counts should NOT be multiplied
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

    const income = parseMstarpy(data.income);
    const balance = parseMstarpy(data.balance);
    const cashFlow = parseMstarpy(data.cashFlow);

    const years = Object.keys(income).sort();
    console.log(`  ✓ mstarpy works (Morningstar data accessible)`);
    console.log(`  ✓ Income: ${years.length} years (${years[0]}–${years[years.length - 1]})`);
    console.log(`  ✓ Balance: ${Object.keys(balance).length} years`);
    console.log(`  ✓ Cash Flow: ${Object.keys(cashFlow).length} years`);
    console.log(`  ○ Exec Comp: names/titles only (no compensation $)`);

    return {
      name: 'mstarpy',
      yearsAvailable: years.length,
      income,
      balance,
      cashFlow,
      execComp: null,
    };
  } catch (err) {
    try { unlinkSync(tmpScript); } catch {}
    console.log(`  ✗ Python execution failed: ${err.message?.split('\n')[0]}`);
    if (err.stderr) console.log(`    ${err.stderr.toString().split('\n').slice(-3).join('\n    ')}`);
    return null;
  }
}

// ── Source 5: Yahoo Finance (via direct API call) ────────────────────────────
async function testYahoo(ticker) {
  console.log('\n━━━ Yahoo Finance ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Testing Yahoo Finance fundamentalsTimeSeries...');
  console.log('  ⚠ Note: Yahoo limits to ~4 years of annual data');

  // Yahoo Finance v8 API — fundamentals timeseries
  // We use the query2 endpoint which is publicly accessible
  const period1 = Math.floor(new Date('2015-01-01').getTime() / 1000);
  const period2 = Math.floor(Date.now() / 1000);

  // Yahoo timeseries API with specific financial fields
  const fields = [
    'annualTotalRevenue', 'annualCostOfRevenue', 'annualGrossProfit',
    'annualOperatingIncome', 'annualNetIncome', 'annualIncomeBeforeTax',
    'annualIncomeTaxExpense', 'annualTotalAssets', 'annualTotalLiabilitiesNetMinorityInterest',
    'annualStockholdersEquity', 'annualCurrentAssets', 'annualCurrentLiabilities',
    'annualCashAndCashEquivalents', 'annualLongTermDebt', 'annualRetainedEarnings',
    'annualOperatingCashFlow', 'annualInvestingCashFlow', 'annualFinancingCashFlow',
    'annualCapitalExpenditure', 'annualDepreciationAndAmortization',
    'annualFreeCashFlow', 'annualDividendsPaid', 'annualStockBasedCompensation',
    'annualInventory', 'annualResearchAndDevelopment',
    'annualSellingGeneralAndAdministration',
  ].join(',');

  const url = `https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${ticker}?type=${fields}&period1=${period1}&period2=${period2}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' }
  });

  if (!res.ok) {
    console.log(`  ✗ Yahoo returned ${res.status} ${res.statusText}`);
    return null;
  }

  const json = await res.json();
  const timeseries = json?.timeseries?.result;

  if (!timeseries || timeseries.length === 0) {
    console.log('  ✗ No timeseries data returned');
    return null;
  }

  // Parse Yahoo timeseries format
  // Each entry: { meta: { type: ['annualTotalRevenue'] }, timestamp: [...], annualTotalRevenue: [{...}, ...] }
  const yearData = {}; // {year: {field: value}}

  for (const series of timeseries) {
    const typeName = series.meta?.type?.[0];
    if (!typeName) continue;
    const values = series[typeName];
    if (!Array.isArray(values)) continue;

    for (const entry of values) {
      const date = entry.asOfDate; // "2024-09-30"
      if (!date) continue;
      const year = date.slice(0, 4);
      if (!yearData[year]) yearData[year] = {};
      yearData[year][typeName] = entry.reportedValue?.raw ?? null;
    }
  }

  const years = Object.keys(yearData).sort();
  console.log(`  ✓ Yahoo Finance works (no API key needed)`);
  console.log(`  ✓ Data: ${years.length} years (${years[0]}–${years[years.length - 1]})`);
  console.log(`  ○ Exec Comp: not available`);

  // Map Yahoo field names to simpler keys
  function normalizeYahoo(yearData) {
    const out = {};
    for (const [year, fields] of Object.entries(yearData)) {
      out[year] = {};
      for (const [k, v] of Object.entries(fields)) {
        // Strip 'annual' prefix
        const shortKey = k.replace(/^annual/, '');
        // Convert PascalCase to camelCase
        const camel = shortKey.charAt(0).toLowerCase() + shortKey.slice(1);
        out[year][camel] = v;
      }
    }
    return out;
  }

  const normalized = normalizeYahoo(yearData);

  return {
    name: 'Yahoo',
    yearsAvailable: years.length,
    income: normalized,
    balance: normalized,
    cashFlow: normalized,
    execComp: null,
  };
}

// ── Comparison Engine ────────────────────────────────────────────────────────
function compareToTruth(source, truth, ticker) {
  if (!source || !truth) return null;

  const results = { income: [], balance: [], cashFlow: [] };
  const summaryBySource = { matches: 0, mismatches: 0, missing: 0, total: 0 };

  for (const [stmtType, fields] of Object.entries(COMPARISON_FIELDS)) {
    const truthData = truth[stmtType]?.data;
    const sourceData = source[stmtType];
    if (!truthData || !sourceData) continue;

    // Find overlapping years (use completed fiscal years only, skip most recent)
    const truthYears = truth[stmtType]?.years || [];
    const sourceYears = Object.keys(sourceData);
    // Use years that exist in both, excluding the most recent (might have earnings update)
    const overlapYears = truthYears
      .filter(y => sourceYears.includes(y))
      .sort()
      .slice(0, -1); // drop most recent year

    if (overlapYears.length === 0) continue;
    const testYear = overlapYears[overlapYears.length - 1]; // most recent completed year that both have

    for (const field of fields) {
      // mstarpy uses the same Morningstar labels as the truth set CSV
      const sourceFieldName = source.name === 'mstarpy' ? field.ms : (field[source.name.toLowerCase()] || field.fmp);
      if (!sourceFieldName) continue;

      // Get Morningstar truth value for this field/year
      let msValue = null;
      const msLabel = field.ms;
      if (truthData[msLabel]?.[testYear] != null) {
        msValue = truthData[msLabel][testYear];
      }

      // Get source value
      let srcValue = null;
      if (sourceData[testYear]) {
        srcValue = sourceData[testYear][sourceFieldName];
      }

      // Handle sign conventions — MS stores expenses as negative, some APIs store as positive
      if (field.negate && srcValue != null && srcValue > 0 && msValue != null && msValue < 0) {
        srcValue = -srcValue;
      }

      summaryBySource.total++;

      if (msValue == null && srcValue == null) {
        summaryBySource.missing++;
        continue;
      }

      if (msValue == null || srcValue == null) {
        summaryBySource.missing++;
        results[stmtType].push({
          field: field.label,
          year: testYear,
          ms: msValue,
          source: srcValue,
          diff: null,
          status: '○ missing',
        });
        continue;
      }

      const diff = pctDiff(srcValue, msValue);
      const match = diff != null && diff < 0.01; // within 1%

      if (match) {
        summaryBySource.matches++;
      } else {
        summaryBySource.mismatches++;
      }

      results[stmtType].push({
        field: field.label,
        year: testYear,
        ms: msValue,
        source: srcValue,
        diff,
        status: match ? '✓' : '✗ differs',
      });
    }
  }

  return { results, summary: summaryBySource };
}

// ── Print Comparison Table ───────────────────────────────────────────────────
function printComparison(sourceName, comparison) {
  if (!comparison) {
    console.log(`  No comparison data for ${sourceName}`);
    return;
  }

  const { results, summary } = comparison;
  const accuracy = summary.total > 0
    ? ((summary.matches / (summary.matches + summary.mismatches)) * 100).toFixed(1)
    : '--';

  console.log(`\n  ── ${sourceName} vs Morningstar Truth Set ──`);
  console.log(`  Accuracy: ${accuracy}% (${summary.matches} match, ${summary.mismatches} differ, ${summary.missing} missing)`);

  for (const [stmtType, rows] of Object.entries(results)) {
    if (rows.length === 0) continue;
    const label = stmtType === 'income' ? 'Income Statement' :
                  stmtType === 'balance' ? 'Balance Sheet' : 'Cash Flow';
    console.log(`\n  ${label}:`);
    console.log(`  ${'Field'.padEnd(22)} ${'Year'.padEnd(6)} ${'Morningstar'.padStart(18)} ${'Source'.padStart(18)} ${'Diff'.padStart(8)} Status`);
    console.log(`  ${'─'.repeat(80)}`);
    for (const row of rows) {
      const msStr = row.ms != null ? fmt(row.ms).padStart(18) : '--'.padStart(18);
      const srcStr = row.source != null ? fmt(row.source).padStart(18) : '--'.padStart(18);
      const diffStr = row.diff != null ? fmtPct(row.diff).padStart(8) : '--'.padStart(8);
      console.log(`  ${row.field.padEnd(22)} ${row.year.padEnd(6)} ${msStr} ${srcStr} ${diffStr} ${row.status}`);
    }
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  Thes1s — Financial Data Source Verification                ║');
  console.log('║  Comparing all API sources against Morningstar truth set    ║');
  console.log(`╚══════════════════════════════════════════════════════════════╝`);
  console.log(`\nTicker: ${TICKER}`);
  console.log(`Truth Set: knowledge/morningstar-financial-statements/${TICKER}/`);

  // Load truth set
  const truth = loadTruthSet(TICKER);
  if (!truth.income) {
    console.log(`\n✗ No Morningstar truth data found for ${TICKER}`);
    process.exit(1);
  }
  console.log(`Truth Set Years: ${truth.income.years.join(', ')}`);

  // Test all sources
  const sources = [];

  const fmp = await testFMP(TICKER);
  if (fmp) sources.push(fmp);

  // Small delay between APIs to be polite
  await sleep(500);

  const simfin = await testSimFin(TICKER);
  if (simfin) sources.push(simfin);

  await sleep(500);

  const eodhd = await testEODHD(TICKER);
  if (eodhd) sources.push(eodhd);

  await sleep(500);

  const yahoo = await testYahoo(TICKER);
  if (yahoo) sources.push(yahoo);

  await sleep(500);

  const mstarpy = await testMstarpy(TICKER);
  if (mstarpy) sources.push(mstarpy);

  // ── Comparison Results ───────────────────────────────────────────────────
  console.log('\n\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  Truth Set Comparison Results                               ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  for (const source of sources) {
    const comparison = compareToTruth(source, truth, TICKER);
    printComparison(source.name, comparison);
  }

  // ── Summary Table ────────────────────────────────────────────────────────
  console.log('\n\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  Source Capability Summary                                  ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  console.log(`\n  ${'Source'.padEnd(14)} ${'Key OK'.padEnd(8)} ${'Years'.padEnd(8)} ${'Exec Comp'.padEnd(12)} Rate Limits`);
  console.log(`  ${'─'.repeat(72)}`);

  const summaryRows = [
    { name: 'FMP', ok: !!fmp, years: fmp?.yearsAvailable, exec: fmp?.execComp ? 'Yes ($)' : 'No', limits: '300/min (Starter), no daily cap' },
    { name: 'SimFin', ok: !!simfin, years: simfin?.yearsAvailable, exec: 'No', limits: '5/sec (Start), no daily cap' },
    { name: 'EODHD', ok: !!eodhd, years: eodhd?.yearsAvailable, exec: 'Names only', limits: '1,000/min, 100K/day (10 calls each)' },
    { name: 'mstarpy', ok: !!mstarpy, years: mstarpy?.yearsAvailable, exec: 'Names only', limits: 'No official limit (anti-bot risk)' },
    { name: 'Yahoo', ok: !!yahoo, years: yahoo?.yearsAvailable, exec: 'No', limits: 'No key needed, ~4yr max annual' },
  ];

  for (const row of summaryRows) {
    const okStr = row.ok ? '✓' : '✗';
    const yearStr = row.years != null ? String(row.years) : '--';
    console.log(`  ${row.name.padEnd(14)} ${okStr.padEnd(8)} ${yearStr.padEnd(8)} ${row.exec.padEnd(12)} ${row.limits}`);
  }

  console.log('\n  Rate Limit Details:');
  console.log('  ─────────────────────────────────────────────────────');
  console.log('  FMP Starter:  300 calls/min, no daily cap, 20GB/30d bandwidth');
  console.log('  FMP Premium:  750 calls/min, 30yr history ($59/mo)');
  console.log('  SimFin Start: 5 req/sec (~300/min), 10yr history');
  console.log('  SimFin Basic: 10 req/sec, 15yr history ($35/mo)');
  console.log('  EODHD:        1,000 req/min, 100K calls/day, each fundamentals = 10 calls');
  console.log('  Yahoo:        No official limits, max 4yr annual data (hard limit)');
  console.log('  mstarpy:      No rate limit, but Morningstar anti-bot may block');

  console.log('\n✓ Done');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
