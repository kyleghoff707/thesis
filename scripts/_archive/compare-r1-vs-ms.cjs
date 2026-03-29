/**
 * compare-r1-vs-ms.cjs
 *
 * Compares R1 Toolbox fixtures against Morningstar fixtures for the same 50 companies.
 * Both stored in whole dollars. R1 and MS have different field names and sign conventions.
 *
 * Usage: node scripts/compare-r1-vs-ms.cjs [TICKER]
 */

const fs = require('fs');
const path = require('path');

const R1_DIR = path.join(__dirname, '..', 'src', 'engines', '__tests__', 'fixtures', 'r1toolbox');
const MS_DIR = path.join(__dirname, '..', 'src', 'engines', '__tests__', 'fixtures', 'morningstar');

// ---------------------------------------------------------------------------
// Field Mapping: R1 field name → { msField, sign }
// sign: 1 if same sign, -1 if MS is negated vs R1
// ---------------------------------------------------------------------------

const FIELD_MAP = {
  income: {
    // Core IS fields
    'Revenue':                                      { msField: 'Total Revenue', sign: 1 },
    'Operating Revenue':                            { msField: 'Business Revenue', sign: 1 },
    'Cost of Revenue':                              { msField: 'Cost of Revenue', sign: -1 },
    'Gross Profit':                                 { msField: 'Gross Profit', sign: 1 },
    'Operating Expenses':                           { msField: 'Operating Income/Expenses', sign: -1 },
    'Selling, General and Administrative':          { msField: 'Selling, General and Administrative Expenses', sign: -1 },
    'Research & Development':                       { msField: 'Research and Development Expenses', sign: -1 },
    'Operating Income':                             { msField: 'Total Operating Profit/Loss', sign: 1 },
    'Pre-Tax Income':                               { msField: 'Pretax Income', sign: 1 },
    'Tax Provision':                                { msField: 'Provision for Income Tax', sign: -1 },
    'Net Income':                                   { msField: 'Net Income Available to Common Stockholders', sign: 1 },
    'Continuing Operations':                        { msField: 'Net Income before Extraordinary Items and Discontinued Operations', sign: 1 },
    'Diluted Net Income Available to Common Stockholders': { msField: 'Diluted Net Income Available to Common Stockholders', sign: 1 },
    'Net Income Including Noncontrolling Interests':{ msField: 'Net Income after Non-Controlling/Minority Interests', sign: 1 },
    'Interest Income-Non Operating':                { msField: 'Interest Income', sign: 1 },
    'Interest Expense-Non Operating':               { msField: 'Interest Expense Net of Capitalized Interest', sign: -1 },
    'Other Income (Expense)':                       { msField: 'Other Income/Expense, Non-Operating', sign: 1 },
    // EPS / Shares (Consolidated layout)
    'EPS (Basic)':                                  { msField: 'Basic EPS', sign: 1 },
    'EPS (Diluted)':                                { msField: 'Diluted EPS', sign: 1 },
    'Dividend Per Share':                           { msField: 'Total Dividend Per Share', sign: 1 },
    // Reconciled / supplemental
    'Total Revenue As Reported':                    { msField: 'Total Revenue as Reported, Supplemental', sign: 1 },
    'Total Operating Profit/Loss As Reported, Supplemental': { msField: 'Reported Total Operating Profit/Loss', sign: 1 },
    'Depreciation, Reconciled':                     { msField: 'Depreciation, Reconciled', sign: 1 },
    'Cost of Revenue, Reconciled':                  { msField: 'Cost of Revenue, Reconciled', sign: 1 },
    'Tax Rate For Calcs':                           { msField: 'Reported Effective Tax Rate', sign: 1 },
  },

  balance_sheet: {
    'Total Assets':                                 { msField: 'Total Assets', sign: 1 },
    'Current Assets':                               { msField: 'Current Assets', sign: 1 },
    'Cash and Cash Equivalents':                    { msField: 'Cash and Cash Equivalents', sign: 1 },
    'Short Term Investments':                       { msField: 'Short Term Investments', sign: 1 },
    'Receivables':                                  { msField: 'Receivables', sign: 1 },
    'Accounts Receivable':                          { msField: 'Accounts Receivable', sign: 1 },
    'Total Inventory':                              { msField: 'Total Inventory', sign: 1 },
    'Other Current Assets':                         { msField: 'Other Current Assets', sign: 1 },
    'Total Non-Current Assets':                     { msField: 'Total Non-Current Assets', sign: 1 },
    'Net Property, Plant, & Equipment':             { msField: 'Net PPE Including Operating Lease Right-of-Use Assets', sign: 1 },
    'Gross Property, Plant, & Equipment':           { msField: 'Gross PPE', sign: 1 },
    'Accumulated Depreciation':                     { msField: 'Accumulated Depreciation', sign: 1 },
    'Goodwill':                                     { msField: 'Goodwill', sign: 1 },
    'Long-Term Equity Investment':                  { msField: 'Long Term Equity Investment', sign: 1 },
    'Total Liabilities':                            { msField: 'Total Liabilities', sign: 1 },
    'Current Liabilities':                          { msField: 'Current Liabilities', sign: 1 },
    'Accounts Payable':                             { msField: 'Accounts Payable', sign: 1 },
    'Short-Term Debt':                              { msField: 'Short Term Debt', sign: 1 },
    'Deferred Revenue, Current':                    { msField: 'Deferred Revenue, Current', sign: 1 },
    'Other Current Liabilities':                    { msField: 'Other Current Liabilities', sign: 1 },
    'Total Non-Current Liabilities':                { msField: 'Total Non-Current Liabilities', sign: 1 },
    'Long-Term Debt':                               { msField: 'Long Term Debt', sign: 1 },
    'Other Non-Current Liabilities':                { msField: 'Other Non-Current Liabilities', sign: 1 },
    'Stockholder Equity':                           { msField: "Total Stockholders' Equity", sign: 1 },
    'Retained Earnings':                            { msField: 'Retained Earnings', sign: 1 },
    'Common Stock':                                 { msField: 'Common Stock', sign: 1 },
    'Treasury Stock':                               { msField: 'Treasury Stock', sign: 1 },
  },

  cash_flow: {
    'Cash Flow from Operating Activities':          { msField: 'Cash Flow from Operating Activities, Indirect', sign: 1 },
    'Net Income from Continuing Operations':        { msField: 'Operating Cash Flow', sign: 1 },
    'Depreciation, Amortization, & Depletion':      { msField: 'Depreciation, Amortization and Depletion, Cash Flow', sign: 1 },
    'Deferred Income Tax':                          { msField: 'Deferred Income Tax, Cash Flow', sign: 1 },
    'Stock Based Compensation':                     { msField: 'Stock Based Compensation, Cash Flow', sign: 1 },
    'Other Non-Cash Items':                         { msField: 'Other Non-Cash Items, Cash Flow', sign: 1 },
    'Change in Working Capital':                    { msField: 'Change in Working Capital', sign: 1 },
    'Change in Receivables':                        { msField: 'Change in Receivables', sign: 1 },
    'Change in Inventory':                          { msField: 'Change in Inventory', sign: 1 },
    'Change in Payables & Accrued Expenses':        { msField: 'Change in Payables and Accrued Expenses', sign: 1 },
    'Cash Flow from Investing Activities':          { msField: 'Cash Flow from Investing Activities', sign: 1 },
    'Purchase of Property, Plant, & Equipment':     { msField: 'Capital Expenditure Reported', sign: 1 },
    'Capital Expenditure':                          { msField: 'Capital Expenditure Reported', sign: 1 },
    'Purchase/Sale of Business, Net':               { msField: 'Net Business Purchase and Sale', sign: 1 },
    'Purchase/Sale of Investments, Net':            { msField: 'Net Investment Purchase and Sale', sign: 1 },
    'Cash Flow from Financing Activities':          { msField: 'Cash Flow from Financing Activities', sign: 1 },
    'Net Issuance/Payments of Debt':                { msField: 'Net Issuance/Payments of Debt', sign: 1 },
    'Net Change in Common Stock':                   { msField: 'Net Common Stock Issuance', sign: 1 },
    'Cash Dividends Paid':                          { msField: 'Common Stock Dividends Paid', sign: 1 },
    'Common Stock Dividends Paid':                  { msField: 'Common Stock Dividends Paid', sign: 1 },
    'Ending Cash Position':                         { msField: 'Ending Cash Position', sign: 1 },
    'Beginning Cash Position':                      { msField: 'Beginning Cash Position', sign: 1 },
    'Change in Cash':                               { msField: 'Change in Cash', sign: 1 },
    'Free Cash Flow':                               { msField: 'Free Cash Flow', sign: 1 },
  },
};

// Alternate MS field names to try (some companies use different names)
const MS_ALTERNATES = {
  "Total Stockholders' Equity": ['Stockholders Equity', 'Total Equity Gross Minority Interest', "Stockholders' Equity"],
  'Net PPE Including Operating Lease Right-of-Use Assets': ['Net PPE', 'Net Property, Plant and Equipment'],
  'Gross PPE': ['Gross Property, Plant and Equipment'],
  'Operating Cash Flow': ['Net Income from Continuing Operations', 'Net Income'],
  'Net Business Purchase and Sale': ['Net Business Purchase And Sale'],
  'Net Investment Purchase and Sale': ['Net Investment Purchase And Sale'],
  'Net Issuance/Payments of Debt': ['Net Issuance Payments of Debt'],
  'Net Common Stock Issuance': ['Net Common Stock Issuance/Repurchase'],
  'Change in Payables and Accrued Expenses': ['Change in Payables And Accrued Expenses', 'Change in Payables and Accrued Expense'],
};

// ---------------------------------------------------------------------------
// Comparison Logic
// ---------------------------------------------------------------------------

function compare(r1Val, msVal, sign) {
  const r1Adj = Math.abs(r1Val);
  const msAdj = Math.abs(msVal * sign); // apply sign correction

  // Use absolute values for comparison since sign conventions may differ
  const r1Abs = Math.abs(r1Val);
  const msAbs = Math.abs(msVal);

  if (r1Abs === msAbs) return { status: 'MATCH', pctDiff: 0 };

  // For very small values, use absolute difference
  const maxVal = Math.max(r1Abs, msAbs);
  if (maxVal < 1000000) {
    // Per-share or small values — use absolute diff
    const diff = Math.abs(r1Abs - msAbs);
    if (diff < 0.01) return { status: 'MATCH', pctDiff: 0 };
    if (diff < 0.1) return { status: 'CLOSE', pctDiff: diff };
    return { status: 'DIFF', pctDiff: diff };
  }

  const pctDiff = Math.abs(r1Abs - msAbs) / maxVal;
  if (pctDiff < 0.001) return { status: 'MATCH', pctDiff };  // <0.1%
  if (pctDiff < 0.01) return { status: 'CLOSE', pctDiff };    // <1%
  if (pctDiff < 0.05) return { status: 'NEAR', pctDiff };     // <5%
  return { status: 'DIFF', pctDiff };
}

function getMsValue(msStmt, year, primaryField) {
  const yearData = msStmt[year];
  if (!yearData) return null;

  if (yearData[primaryField] !== undefined) return yearData[primaryField];

  // Try alternates
  const alts = MS_ALTERNATES[primaryField] || [];
  for (const alt of alts) {
    if (yearData[alt] !== undefined) return yearData[alt];
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const requestedTicker = process.argv[2];

  const r1Files = fs.readdirSync(R1_DIR).filter(f => f.endsWith('.json'));
  const msFiles = new Set(fs.readdirSync(MS_DIR).filter(f => f.endsWith('.json') && f !== 'field-mapping.json'));

  let tickers = r1Files.map(f => f.replace('.json', '')).filter(t => msFiles.has(`${t}.json`)).sort();

  if (requestedTicker) {
    const key = requestedTicker.replace('.', '-');
    tickers = tickers.filter(t => t === key);
  }

  console.log(`\nR1 TOOLBOX vs MORNINGSTAR COMPARISON`);
  console.log(`${'='.repeat(70)}`);
  console.log(`Comparing ${tickers.length} companies...\n`);

  const totals = { match: 0, close: 0, near: 0, diff: 0, r1Only: 0, msOnly: 0 };
  const perCompany = {};
  const fieldDiffs = {};  // track which fields have most diffs

  for (const ticker of tickers) {
    const r1 = JSON.parse(fs.readFileSync(path.join(R1_DIR, `${ticker}.json`), 'utf-8'));
    const ms = JSON.parse(fs.readFileSync(path.join(MS_DIR, `${ticker}.json`), 'utf-8'));

    const co = { match: 0, close: 0, near: 0, diff: 0, diffDetails: [] };

    for (const stmtType of ['income', 'balance_sheet', 'cash_flow']) {
      const mapping = FIELD_MAP[stmtType] || {};
      const r1Stmt = r1.statements[stmtType] || {};
      const msStmt = ms.statements[stmtType] || {};

      // Get overlapping years (skip TTM)
      const r1Years = Object.keys(r1Stmt).filter(y => y !== 'TTM');
      const msYears = new Set(Object.keys(msStmt).filter(y => y !== 'TTM'));
      const sharedYears = r1Years.filter(y => msYears.has(y));

      for (const [r1Field, { msField, sign }] of Object.entries(mapping)) {
        for (const year of sharedYears) {
          const r1Val = r1Stmt[year]?.[r1Field];
          const msVal = getMsValue(msStmt, year, msField);

          if (r1Val == null && msVal == null) continue;
          if (r1Val == null || msVal == null) {
            // One side has data, the other doesn't — skip (different field coverage)
            continue;
          }

          const result = compare(r1Val, msVal, sign);

          if (result.status === 'MATCH') {
            co.match++;
            totals.match++;
          } else if (result.status === 'CLOSE') {
            co.close++;
            totals.close++;
          } else if (result.status === 'NEAR') {
            co.near++;
            totals.near++;
          } else {
            co.diff++;
            totals.diff++;
            co.diffDetails.push({
              field: r1Field,
              msField,
              year,
              r1Val,
              msVal,
              pct: (result.pctDiff * 100).toFixed(1) + '%',
            });

            // Track by field
            const key = `${r1Field} (${stmtType.replace('_', ' ')})`;
            fieldDiffs[key] = (fieldDiffs[key] || 0) + 1;
          }
        }
      }
    }

    const total = co.match + co.close + co.near + co.diff;
    const matchRate = total > 0 ? ((co.match + co.close) / total * 100).toFixed(1) : '0';
    const status = co.diff === 0 ? '✓' : `${co.diff} diffs`;

    console.log(`  ${ticker.padEnd(8)} ${String(total).padStart(4)} compared | ${matchRate}% match | ${status}`);

    if (co.diffDetails.length > 0 && co.diffDetails.length <= 5) {
      for (const d of co.diffDetails) {
        const r1Str = typeof d.r1Val === 'number' && Math.abs(d.r1Val) >= 1000000
          ? `${(d.r1Val / 1e6).toFixed(0)}M` : String(d.r1Val);
        const msStr = typeof d.msVal === 'number' && Math.abs(d.msVal) >= 1000000
          ? `${(d.msVal / 1e6).toFixed(0)}M` : String(d.msVal);
        console.log(`           ${d.year} ${d.field}: R1=${r1Str} MS=${msStr} (${d.pct})`);
      }
    }

    perCompany[ticker] = co;
  }

  // Overall summary
  const grandTotal = totals.match + totals.close + totals.near + totals.diff;
  const overallMatch = ((totals.match + totals.close) / grandTotal * 100).toFixed(1);

  console.log(`\n${'='.repeat(70)}`);
  console.log(`OVERALL: ${totals.match + totals.close}/${grandTotal} (${overallMatch}%) match/close`);
  console.log(`  MATCH: ${totals.match} | CLOSE (<1%): ${totals.close} | NEAR (<5%): ${totals.near} | DIFF (≥5%): ${totals.diff}`);

  // Top field differences
  if (Object.keys(fieldDiffs).length > 0) {
    console.log(`\nTOP FIELD DIFFERENCES (≥5% off):`);
    const sorted = Object.entries(fieldDiffs).sort((a, b) => b[1] - a[1]).slice(0, 15);
    for (const [field, count] of sorted) {
      console.log(`  ${String(count).padStart(4)}  ${field}`);
    }
  }

  // Companies with most diffs
  const worstCompanies = Object.entries(perCompany)
    .filter(([_, c]) => c.diff > 0)
    .sort((a, b) => b[1].diff - a[1].diff)
    .slice(0, 10);

  if (worstCompanies.length > 0) {
    console.log(`\nCOMPANIES WITH MOST DIFFS:`);
    for (const [ticker, c] of worstCompanies) {
      const total = c.match + c.close + c.near + c.diff;
      console.log(`  ${ticker.padEnd(8)} ${c.diff} diffs / ${total} compared`);
    }
  }
}

main();
