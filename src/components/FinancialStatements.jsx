import { useState, useEffect, useMemo, useCallback } from 'react';
import { C } from '../theme';
import { computeKeyMetrics, KEY_METRICS_ROWS } from '../engines/keyMetrics';

// ─── CSV Export ──────────────────────────────────────────────

function escapeCsv(val) {
  const s = String(val ?? '');
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
}

function buildAllFinancialsCsv({ ticker, companyName, layout, version, latestPrice, displayYears, fiscalMonths, stmtMap, ttmStmtMap, isQuarterly, quarterlyLabelMap, edgarQuarterly }) {
  const now = new Date();
  const ts = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}-${String(now.getHours()).padStart(2,'0')}-${String(now.getMinutes()).padStart(2,'0')}`;
  const lines = [];

  // Header metadata
  lines.push(`${escapeCsv(ticker)},${escapeCsv(companyName || '')}`);
  lines.push(`Version,${version === 'restated' ? 'Restated' : 'As-Reported'}`);
  lines.push(`Layout,${layout === 'expanded' ? 'Expanded' : 'Consolidated'}`);
  lines.push(`Report,${isQuarterly ? 'Quarterly' : 'Annual'}`);
  if (latestPrice != null) lines.push(`Price,$${latestPrice.toFixed(2)}`);
  lines.push('');

  // Column headers
  const headerRow = ['', ...displayYears.map(y => fiscalMonths?.[y] ? `${y} (${fiscalMonths[y]})` : String(y))];
  lines.push(headerRow.map(escapeCsv).join(','));

  // getValue for a specific statement tab
  function getValue(row, col, tab) {
    // Quarterly mode — col is "Q1_2025" etc.
    const qCol = quarterlyLabelMap?.[col];
    if (qCol) {
      const qData = edgarQuarterly?.quarterly?.[qCol.fy]?.[qCol.qtr];
      if (!qData) return null;
      const source = row.source || tab;
      const val = qData[source]?.[row.key];
      if (val == null) return null;
      if (row.negate) return -Math.abs(val);
      if (row.hideNegative && val <= 0) return null;
      return val;
    }
    // TTM column
    if (col === 'TTM') {
      const ttmSource = row.source ? ttmStmtMap[row.source] : ttmStmtMap[tab];
      const val = ttmSource?.[row.key];
      if (val == null) return null;
      if (row.negate) return -Math.abs(val);
      if (row.hideNegative && val <= 0) return null;
      return val;
    }
    // Annual mode
    const source = row.source ? stmtMap[row.source] : stmtMap[tab];
    const val = source?.[col]?.[row.key];
    if (val == null) return null;
    if (row.negate) return -Math.abs(val);
    if (row.hideNegative && val <= 0) return null;
    return val;
  }

  // Emit all three statements
  for (const tabKey of ['income', 'balance', 'cashFlow']) {
    const allRows = ROWS[tabKey] || [];
    const rows = allRows.filter(row => layout === 'expanded' || !row.expanded);

    for (const row of rows) {
      if (row.type === 'header') {
        lines.push(escapeCsv(`----------${row.label}----------`));
        continue;
      }
      if (row.type === 'spacer') continue;

      const hasData = displayYears.some(y => getValue(row, y, tabKey) != null);
      if (!hasData) continue;

      const cells = [escapeCsv(row.label)];
      for (const y of displayYears) {
        const val = getValue(row, y, tabKey);
        cells.push(val != null ? String(val) : '');
      }
      lines.push(cells.join(','));
    }
  }

  return { csv: lines.join('\n'), timestamp: ts };
}

function buildKeyMetricsCsv(metricYears, metricCategories, keyMetrics, fiscalMonths) {
  const headerRow = ['', ...metricYears.map(y => fiscalMonths?.[y] ? `${y} (${fiscalMonths[y]})` : String(y))];
  const lines = [headerRow.map(escapeCsv).join(',')];

  for (const [catKey, cat] of metricCategories) {
    const catHasData = cat.rows.some(row =>
      metricYears.some(y => keyMetrics?.metrics?.[y]?.[catKey]?.[row.key] != null)
    );
    if (!catHasData) continue;

    lines.push('');
    lines.push(escapeCsv(cat.label));

    for (const row of cat.rows) {
      const hasData = metricYears.some(y => keyMetrics?.metrics?.[y]?.[catKey]?.[row.key] != null);
      if (!hasData) continue;

      const cells = [escapeCsv(row.label)];
      for (const y of metricYears) {
        const val = keyMetrics?.metrics?.[y]?.[catKey]?.[row.key];
        cells.push(val != null ? String(val) : '');
      }
      lines.push(cells.join(','));
    }
  }
  return lines.join('\n');
}

function downloadCsv(csv, filename) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── View Modes ──────────────────────────────────────────────

const VIEWS = [
  { key: 'financials', label: 'Financials' },
  { key: 'keyMetrics', label: 'Key Metrics' },
];

const TABS = [
  { key: 'income', label: 'Income Statement' },
  { key: 'balance', label: 'Balance Sheet' },
  { key: 'cashFlow', label: 'Cash Flow' },
];

// ─── Row Definitions (Rule One Toolbox structure) ────────────
// type: 'header' = section divider, 'row' = data row, 'spacer' = visual gap
// bold: true for totals/subtotals
// negate: display as negative (e.g., CapEx, Buybacks shown as negative cash)
// expanded: true = only shown in expanded layout
// source: cross-reference data from a different statement (e.g., net income in cash flow)

const ROWS = {
  income: [
    { type: 'header', label: 'Income Statement' },
    { key: 'revenues', label: 'Revenue' },
    { key: 'revenues', label: 'Operating Revenue', expanded: true },
    { key: 'cost_of_revenue', label: 'Cost of Revenue' },
    { key: 'gross_profit', label: 'Gross Profit', bold: true },
    { key: 'sga', label: 'Selling, General and Administrative' },
    { key: 'research_and_development', label: 'Research & Development' },
    { key: 'depreciation_amortization_is', label: 'Depreciation, Amortization, and Depletion' },
    { key: 'other_operating_expenses', label: 'Other Operating Expenses' },
    { key: 'operating_expenses', label: 'Operating Expenses' },
    { key: 'total_expenses', label: 'Total Expenses', expanded: true },
    { key: 'operating_income_loss', label: 'Operating Income', bold: true },
    { key: 'interest_income', label: 'Interest Income-Non Operating' },
    { key: 'interest_expense', label: 'Interest Expense-Non Operating' },
    { key: 'net_interest_income', label: 'Net Interest Income (Expense)' },
    { key: 'other_income_expense', label: 'Other Income (Expense)' },
    { key: 'income_before_tax', label: 'Pre-Tax Income' },
    { key: 'income_tax', label: 'Tax Provision' },
    { key: 'income_from_continuing_operations', label: 'Continuing Operations' },
    { key: 'net_income_loss', label: 'Net Income', bold: true },
    { key: 'net_income_including_nci', label: 'Net Income Including Noncontrolling Interests', expanded: true },
    { key: 'net_income_loss', label: 'Net Income (Common Stockholders)', expanded: true },
    { key: 'basic_earnings_per_share', label: 'EPS (Basic)', perShare: true },
    { key: 'diluted_earnings_per_share', label: 'EPS (Diluted)', perShare: true },
    { key: 'basic_average_shares', label: 'Shares Outstanding (Basic)', shares: true },
    { key: 'diluted_average_shares', label: 'Shares Outstanding (Diluted)', shares: true },
    { key: 'dividends_per_share', label: 'Dividend Per Share', perShare: true },
    { type: 'spacer', expanded: true },
    { key: 'ebit', label: 'Earning Before Interest and Tax', expanded: true },
    { key: 'ebitda', label: 'Earning Before Interest Tax Depreciation Amortization', expanded: true },
    { key: 'effective_tax_rate', label: 'Tax Rate For Calcs', expanded: true, format: 'pct' },
  ],
  balance: [
    { type: 'header', label: 'Balance Sheet' },
    { key: 'assets', label: 'Total Assets', bold: true, expanded: true },
    { key: 'current_assets', label: 'Current Assets', bold: true, expanded: true },
    { key: 'cash_and_marketable_securities', label: 'Cash, Cash Equivalents, & Marketable Securities' },
    { key: 'cash', label: 'Cash and Cash Equivalents', expanded: true },
    { key: 'cash_only', label: 'Cash', expanded: true },
    { key: 'cash_equivalents', label: 'Cash Equivalents', expanded: true },
    { key: 'short_term_investments', label: 'Short Term Investments', expanded: true },
    { key: 'total_receivables', label: 'Receivables' },
    { key: 'accounts_receivable', label: 'Accounts Receivable', expanded: true },
    { key: 'accounts_receivable_gross', label: 'Accounts Receivable, Gross', expanded: true },
    { key: 'allowance_doubtful_accounts', label: 'Allowance for Doubtful Accounts Receivable', expanded: true },
    { key: 'vendor_receivables', label: 'Other Receivables', expanded: true },
    { key: 'inventory', label: 'Total Inventory' },
    { key: 'prepaid_expenses', label: 'Prepaid Expenses' },
    { key: 'other_current_assets', label: 'Other Current Assets' },
    { key: 'current_assets', label: 'Current Assets', bold: true },
    { type: 'spacer' },
    { key: 'property_plant_equipment', label: 'Net Property, Plant, & Equipment' },
    { key: 'property_plant_equipment_gross', label: 'Gross Property, Plant, & Equipment', expanded: true },
    { key: 'ppe_land', label: 'Land & Improvements', expanded: true },
    { key: 'ppe_buildings', label: 'Properties', expanded: true },
    { key: 'ppe_machinery', label: 'Machinery, Furniture, & Equipment', expanded: true },
    { key: 'ppe_leasehold', label: 'Leasehold and Improvements', expanded: true },
    { key: 'ppe_other', label: 'Other Properties', expanded: true },
    { key: 'ppe_construction', label: 'Construction in Progress', expanded: true },
    { key: 'accumulated_depreciation', label: 'Accumulated Depreciation', expanded: true },
    { key: 'goodwill', label: 'Goodwill' },
    { key: 'intangible_assets', label: 'Intangibles' },
    { key: 'long_term_investments', label: 'Long-Term Equity Investment' },
    { key: 'available_for_sale_securities', label: 'Available-for-Sale Securities', expanded: true },
    { key: 'operating_lease_rou_asset', label: 'Operating Lease ROU Asset' },
    { key: 'deferred_tax_assets', label: 'Deferred Tax Assets', expanded: true },
    { key: 'other_noncurrent_assets', label: 'Other Non-Current Assets' },
    { key: 'noncurrent_assets', label: 'Total Non-Current Assets' },
    { key: 'assets', label: 'Total Assets', bold: true },
    { type: 'spacer' },
    { key: 'accounts_payable', label: 'Payables' },
    { key: 'accrued_liabilities', label: 'Accrued Expenses Payable' },
    { key: 'payables_and_accrued', label: 'Payables & Accrued Expenses', expanded: true },
    { key: 'short_term_debt', label: 'Short-Term Debt' },
    { key: 'current_portion_lt_debt', label: 'Current Portion of Long-Term Debt' },
    { key: 'short_term_debt_and_leases', label: 'Short-Term Debt & Capital Lease Obligation', expanded: true },
    { key: 'operating_lease_liability_current', label: 'Operating Lease Liability (Current)' },
    { key: 'finance_lease_liability_current', label: 'Capital Lease Obligation (Current)' },
    { key: 'deferred_revenue_current', label: 'Deferred Revenue (Current)' },
    { key: 'other_current_liabilities', label: 'Other Current Liabilities' },
    { key: 'current_liabilities', label: 'Current Liabilities', bold: true },
    { key: 'long_term_debt', label: 'Long-Term Debt' },
    { key: 'lt_debt_and_leases_noncurrent', label: 'Long-Term Debt & Capital Lease Obligations', expanded: true },
    { key: 'operating_lease_liability_noncurrent', label: 'Operating Lease Liability (Non-Current)' },
    { key: 'finance_lease_liability_noncurrent', label: 'Capital Lease Obligation (Non-Current)' },
    { key: 'deferred_tax_liabilities', label: 'Non-Current Deferred Liabilities' },
    { key: 'deferred_revenue_noncurrent', label: 'Non-Current Deferred Revenue', expanded: true },
    { key: 'pension_liabilities', label: 'Pension Liabilities', expanded: true },
    { key: 'other_noncurrent_liabilities', label: 'Other Non-Current Liabilities' },
    { key: 'noncurrent_liabilities', label: 'Total Non-Current Liabilities' },
    { key: 'liabilities', label: 'Total Liabilities', bold: true },
    { type: 'spacer' },
    { key: 'preferred_stock', label: 'Preferred Stock' },
    { key: 'common_stock', label: 'Common Stock' },
    { key: 'additional_paid_in_capital', label: 'Additional Paid In Capital' },
    { key: 'retained_earnings', label: 'Retained Earnings' },
    { key: 'aoci', label: 'Gain/Losses Not Affecting Retained Earnings' },
    { key: 'treasury_stock', label: 'Treasury Stock' },
    { key: 'equity', label: 'Stockholder Equity', bold: true },
    { key: 'total_debt_with_leases', label: 'Total Debt (Short & Long-Term)' },
    { key: 'net_debt', label: 'Net Debt', hideNegative: true },
    { type: 'spacer', expanded: true },
    { key: 'total_capitalization', label: 'Total Capitalization', expanded: true },
    { key: 'invested_capital', label: 'Invested Capital', expanded: true },
    { key: 'working_capital', label: 'Working Capital', expanded: true },
    { key: 'net_tangible_assets', label: 'Net Tangible Assets', expanded: true },
    { key: 'shares_outstanding', label: 'Ordinary Shares Number', expanded: true, shares: true, source: 'balance' },
    { key: 'treasury_shares', label: 'Treasury Shares Number', expanded: true, shares: true, source: 'balance' },
  ],
  cashFlow: [
    { type: 'header', label: 'Cash Flow' },
    { key: 'net_cash_flow_from_operating_activities', label: 'Cash Flow from Operating Activities', bold: true, expanded: true },
    { key: 'net_income_loss', label: 'Net Income from Continuing Operations', source: 'income' },
    { key: 'depreciation_amortization', label: 'Depreciation, Amortization, & Depletion' },
    { key: 'depreciation_only', label: 'Depreciation', expanded: true },
    { key: 'amortization_of_intangibles', label: 'Amortization of Intangibles', expanded: true },
    { key: 'change_in_receivables', label: 'Change in Receivables' },
    { key: 'change_in_inventory', label: 'Change in Inventory' },
    { key: 'change_in_payables', label: 'Change in Payables & Accrued Expenses' },
    { key: 'change_in_other_working_capital', label: 'Change in Other Working Capital' },
    { key: 'change_in_working_capital', label: 'Change in Working Capital' },
    { key: 'deferred_income_tax', label: 'Deferred Income Tax' },
    { key: 'stock_based_compensation', label: 'Stock Based Compensation' },
    { key: 'other_noncash_items', label: 'Other Non-Cash Items' },
    { key: 'net_cash_flow_from_operating_activities', label: 'Cash Flow from Operating Activities', bold: true },
    { type: 'spacer' },
    { key: 'capital_expenditures', label: 'Capital Expenditure', negate: true },
    { key: 'capital_expenditures_net', label: 'Capital Expenditures, Net', expanded: true },
    { key: 'purchase_of_business', label: 'Purchase of Business', negate: true },
    { key: 'purchase_sale_of_business_net', label: 'Purchase/Sale of Business, Net', expanded: true },
    { key: 'purchase_of_investments', label: 'Purchase of Investment', negate: true },
    { key: 'sale_of_investments', label: 'Sale of Investment' },
    { key: 'net_investments', label: 'Purchase/Sale of Investments, Net' },
    { key: 'purchase_of_intangibles', label: 'Purchase/Sale of Intangibles, Net', expanded: true, negate: true },
    { key: 'other_investing', label: 'Other Investing Changes' },
    { key: 'net_cash_flow_from_investing_activities', label: 'Cash Flow from Investing Activities', bold: true },
    { type: 'spacer' },
    { key: 'proceeds_from_lt_debt', label: 'Issuance of Debt' },
    { key: 'repayments_of_lt_debt', label: 'Repayment of Debt' },
    { key: 'net_debt_issuance', label: 'Net Issuance/Payments of Debt' },
    { key: 'net_lt_debt_issuance', label: 'Long-Term Debt Net Issuance', expanded: true },
    { key: 'net_st_debt_issuance', label: 'Short-Term Debt Net Issuance', expanded: true },
    { key: 'proceeds_from_stock_issuance', label: 'Proceeds from Common Stock Issuance' },
    { key: 'share_repurchases', label: 'Payments for Common Stock', negate: true },
    { key: 'net_common_stock', label: 'Net Change in Common Stock' },
    { key: 'dividends_paid', label: 'Cash Dividends Paid', negate: true },
    { key: 'finance_lease_payments', label: 'Lease Financing Payments', negate: true },
    { key: 'other_financing', label: 'Other Financing Charges' },
    { key: 'net_cash_flow_from_financing_activities', label: 'Cash Flow from Financing Activities', bold: true },
    { type: 'spacer' },
    { key: 'beginning_cash_position', label: 'Beginning Cash Position', expanded: true },
    { key: 'net_change_in_cash', label: 'Change in Cash' },
    { key: 'ending_cash_position', label: 'Ending Cash Position', expanded: true },
    { key: 'effect_of_exchange_rate', label: 'Effect of Exchange Rate', expanded: true },
    { key: 'free_cash_flow', label: 'Free Cash Flow', bold: true },
    { type: 'spacer', expanded: true },
    { key: 'interest_paid', label: 'Interest Paid, Supplemental Data', expanded: true },
    { key: 'income_taxes_paid', label: 'Income Tax Paid, Supplemental Data', expanded: true },
  ],
};

// ─── Formatting ──────────────────────────────────────────────

function fmtNum(n, decimals) {
  const parts = n.toFixed(decimals).split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.join('.');
}

function fmtVal(value, opts = {}) {
  if (value == null) return '–';
  if (opts.format === 'pct') return fmtNum(value, 2) + '%';
  if (opts.perShare) return '$' + fmtNum(value, 2);
  if (opts.shares) return fmtNum(value / 1e6, 1);
  if (opts.negate) value = -Math.abs(value);
  // Display in millions (matches header: "All Numbers in Millions")
  const inMillions = value / 1e6;
  return '$' + fmtNum(inMillions, 1);
}

function fmtMetric(value, format) {
  if (value == null) return '–';
  switch (format) {
    case 'dollar': return '$' + fmtNum(value, 2);
    case 'pct': return fmtNum(value, 2) + '%';
    case 'ratio': return fmtNum(value, 2);
    case 'days': return fmtNum(value, 1);
    case 'shares': {
      if (Math.abs(value) >= 1e9) return fmtNum(value / 1e9, 2) + 'B';
      if (Math.abs(value) >= 1e6) return fmtNum(value / 1e6, 1) + 'M';
      return fmtNum(value, 0);
    }
    default: return fmtNum(value, 2);
  }
}

// ─── Trend Sparkline ─────────────────────────────────────────

function TrendBars({ values }) {
  // values: array in chronological order (oldest first), may contain nulls
  const filtered = values.filter(v => v != null);
  if (filtered.length < 2) return <div style={{ width: 80, height: 22 }} />;

  const maxAbs = Math.max(...filtered.map(v => Math.abs(v)));
  if (maxAbs === 0) return <div style={{ width: 80, height: 22 }} />;

  const n = values.length;
  const W = 80, H = 22;
  const gap = 1;
  const barW = Math.max(2, (W - gap * (n - 1)) / n);

  const hasNeg = filtered.some(v => v < 0);
  const hasPos = filtered.some(v => v >= 0);
  const mixed = hasNeg && hasPos;

  return (
    <svg width={W} height={H} style={{ display: 'block' }}>
      {mixed && <line x1={0} y1={H / 2} x2={W} y2={H / 2} stroke={C.borderLight} strokeWidth={0.5} />}
      {values.map((v, i) => {
        if (v == null) return null;
        const x = i * (barW + gap);
        const color = v >= 0 ? C.accent : C.red;

        if (mixed) {
          const midY = H / 2;
          const barH = Math.max(1, (Math.abs(v) / maxAbs) * (H / 2 - 1));
          const y = v >= 0 ? midY - barH : midY;
          return <rect key={i} x={x} y={y} width={barW} height={barH} fill={color} rx={0.5} />;
        }
        const barH = Math.max(1, (Math.abs(v) / maxAbs) * (H - 2));
        return <rect key={i} x={x} y={H - barH - 1} width={barW} height={barH} fill={color} rx={0.5} />;
      })}
    </svg>
  );
}

// ─── Component ───────────────────────────────────────────────

export default function FinancialStatements({ edgarStatements, edgarQuarterly, latestPrice, ticker, companyName, version, onVersionChange, dataView, onDataViewChange, settings }) {
  const [view, setView] = useState('financials');
  const [tab, setTab] = useState('income');
  const [layout, setLayout] = useState(settings?.defaultLayout || 'expanded');
  const [periods, setPeriods] = useState(settings?.defaultPeriods || '10');
  const [qtrPeriods, setQtrPeriods] = useState(settings?.defaultQtrPeriods || '8');
  const [columnOrder, setColumnOrder] = useState('newestFirst'); // 'newestFirst' | 'oldestFirst'
  const [expandedMetrics, setExpandedMetrics] = useState(new Set()); // tracks which metric rows show % change
  const [hoverState, setHoverState] = useState({ row: null, col: null });

  const toggleMetricExpand = useCallback((key) => {
    setExpandedMetrics(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  // Sync local state with settings changes (e.g., from Settings modal)
  useEffect(() => { setLayout(settings?.defaultLayout || 'expanded'); }, [settings?.defaultLayout]);
  useEffect(() => { setPeriods(settings?.defaultPeriods || '10'); }, [settings?.defaultPeriods]);
  useEffect(() => { setQtrPeriods(settings?.defaultQtrPeriods || '8'); }, [settings?.defaultQtrPeriods]);

  const handleTableMouseMove = useCallback((e) => {
    const cell = e.target.closest('td, th');
    if (!cell) return;
    const row = cell.dataset.row;
    const col = cell.dataset.col;
    if (row == null && col == null) return;
    setHoverState(prev => (prev.row === row && prev.col === col) ? prev : { row, col });
  }, []);

  const clearHover = useCallback(() => {
    setHoverState({ row: null, col: null });
  }, []);

  const keyMetrics = useMemo(() => {
    if (!edgarStatements) return null;
    return computeKeyMetrics(edgarStatements, latestPrice);
  }, [edgarStatements, latestPrice]);

  if (!edgarStatements) return null;

  const { years, income, balance, cashFlow, fiscalMonths, ttm } = edgarStatements;
  const isQuarterly = dataView === 'quarterly';
  const periodCount = periods === 'all' ? years.length : parseInt(periods);
  const annualYears = years.slice(0, periodCount);

  // Build quarterly columns: "Q4 2025", "Q3 2025", etc. (most recent first)
  const quarterlyColumns = useMemo(() => {
    if (!isQuarterly || !edgarQuarterly?.quarterly) return [];
    const cols = [];
    for (const fy of edgarQuarterly.fiscalYears || []) {
      for (const qtr of ['Q4', 'Q3', 'Q2', 'Q1']) {
        if (edgarQuarterly.quarterly[fy]?.[qtr]) {
          cols.push({ key: `${qtr}_${fy}`, label: `${qtr} ${fy}`, fy, qtr });
        }
      }
    }
    return cols;
  }, [isQuarterly, edgarQuarterly]);

  const qtrCount = qtrPeriods === 'all' ? quarterlyColumns.length : parseInt(qtrPeriods);
  const displayQuarterColumns = quarterlyColumns.slice(0, qtrCount);

  // Columns for the table (either annual or quarterly)
  const displayColumns = isQuarterly
    ? displayQuarterColumns.map(c => c.key)
    : (ttm ? ['TTM', ...annualYears] : annualYears);

  // Column labels for quarterly mode
  const quarterlyLabelMap = useMemo(() => {
    const map = {};
    for (const c of displayQuarterColumns) {
      map[c.key] = c;
    }
    return map;
  }, [displayQuarterColumns]);

  // ── Financial Statements View ──
  if (view === 'financials') {
    const stmtMap = { income, balance, cashFlow };
    const allRows = ROWS[tab] || [];
    // Filter by layout — expanded rows hidden in consolidated mode
    const rows = allRows.filter(row => layout === 'expanded' || !row.expanded);

    const ttmStmtMap = ttm ? { income: ttm.income, balance: ttm.balance, cashFlow: ttm.cashFlow } : {};

    function getValue(row, col) {
      // Quarterly mode — col is "Q1_2025" etc.
      const qCol = quarterlyLabelMap[col];
      if (qCol) {
        const qData = edgarQuarterly?.quarterly?.[qCol.fy]?.[qCol.qtr];
        if (!qData) return null;
        const source = row.source || tab;
        const val = qData[source]?.[row.key];
        if (val == null) return null;
        if (row.negate) return -Math.abs(val);
        if (row.hideNegative && val <= 0) return null;
        return val;
      }
      // TTM column
      if (col === 'TTM') {
        const source = row.source ? ttmStmtMap[row.source] : ttmStmtMap[tab];
        const val = source?.[row.key];
        if (val == null) return null;
        if (row.negate) return -Math.abs(val);
        if (row.hideNegative && val <= 0) return null;
        return val;
      }
      // Annual mode
      const source = row.source ? stmtMap[row.source] : stmtMap[tab];
      const val = source?.[col]?.[row.key];
      if (val == null) return null;
      if (row.negate) return -Math.abs(val);
      if (row.hideNegative && val <= 0) return null;
      return val;
    }

    // Column header labels and fiscal months for quarterly
    const columnHeadersRaw = isQuarterly
      ? displayQuarterColumns.map(c => ({ key: c.key, label: c.label, fiscalMonth: null }))
      : displayColumns.map(col => ({ key: col, label: String(col), fiscalMonth: col !== 'TTM' ? fiscalMonths?.[col] : null }));

    // Apply column order
    const orderedColumns = columnOrder === 'oldestFirst'
      ? (() => { const d = displayColumns.filter(c => c !== 'TTM').slice().reverse(); return ttm && !isQuarterly ? [...d, 'TTM'] : d; })()
      : displayColumns;
    const columnHeaders = columnOrder === 'oldestFirst'
      ? (() => { const ttmH = columnHeadersRaw.find(h => h.key === 'TTM'); const rest = columnHeadersRaw.filter(h => h.key !== 'TTM').slice().reverse(); return ttmH ? [...rest, ttmH] : rest; })()
      : columnHeadersRaw;

    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <ViewToggle view={view} setView={setView} />
          <TableToolbar
            onExport={() => {
              const { csv, timestamp } = buildAllFinancialsCsv({
                ticker, companyName, layout, version, latestPrice,
                displayYears: orderedColumns, fiscalMonths,
                stmtMap, ttmStmtMap, isQuarterly,
                quarterlyLabelMap, edgarQuarterly,
              });
              downloadCsv(csv, `${ticker || 'financials'}_${layout === 'expanded' ? 'Expanded' : 'Consolidated'}_Financials_${timestamp}.csv`);
            }}
            columnOrder={columnOrder}
            onToggleOrder={() => setColumnOrder(o => o === 'newestFirst' ? 'oldestFirst' : 'newestFirst')}
          />
        </div>
        <DropdownBar
          layout={layout} setLayout={setLayout}
          version={version} onVersionChange={onVersionChange}
          periods={periods} setPeriods={setPeriods}
          disableLayout={false}
          dataView={dataView} onDataViewChange={onDataViewChange}
          qtrPeriods={qtrPeriods} setQtrPeriods={setQtrPeriods}
        />
        {isQuarterly && !edgarQuarterly && (
          <div style={{ padding: '12px 16px', background: C.yellowBg, color: C.yellow, borderRadius: 6, fontSize: 13, marginBottom: 12 }}>
            Loading quarterly data...
          </div>
        )}
        <TabBar tab={tab} setTab={setTab} />
        <StatementTable
          columns={orderedColumns}
          rows={rows}
          getValue={getValue}
          fiscalMonths={fiscalMonths}
          ttmQuarter={ttm?.quarter}
          columnHeaders={columnHeaders}
          hoverState={hoverState}
          onMouseMove={handleTableMouseMove}
          onMouseLeave={clearHover}
        />
      </div>
    );
  }

  // ── Key Metrics View ──
  const metricYearsRaw = keyMetrics?.years?.slice(0, periodCount) || [];
  const metricCategories = Object.entries(KEY_METRICS_ROWS);
  const metricYears = columnOrder === 'oldestFirst' ? metricYearsRaw.slice().reverse() : metricYearsRaw;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <ViewToggle view={view} setView={setView} />
        <TableToolbar
          onExport={() => {
            const csv = buildKeyMetricsCsv(metricYears, metricCategories, keyMetrics, fiscalMonths);
            downloadCsv(csv, `${ticker || 'key_metrics'}_Key_Metrics.csv`);
          }}
          columnOrder={columnOrder}
          onToggleOrder={() => setColumnOrder(o => o === 'newestFirst' ? 'oldestFirst' : 'newestFirst')}
        />
      </div>
      <DropdownBar
        layout={layout} setLayout={setLayout}
        version={version} onVersionChange={onVersionChange}
        periods={periods} setPeriods={setPeriods}
        disableLayout={true}
        dataView={dataView} onDataViewChange={onDataViewChange}
        qtrPeriods={qtrPeriods} setQtrPeriods={setQtrPeriods}
      />
      <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '75vh' }}>
        <table
          style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, whiteSpace: 'nowrap' }}
          onMouseMove={handleTableMouseMove}
          onMouseLeave={clearHover}
        >
          <thead>
            <tr style={{ borderBottom: `2px solid ${C.border}` }}>
              <th data-col="label" style={{
                position: 'sticky', left: 0, top: 0, background: C.bgCard,
                textAlign: 'left', padding: '6px 12px', color: C.textMuted,
                fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em',
                minWidth: 220, zIndex: 3,
              }}>Metric</th>
              <th style={{
                position: 'sticky', top: 0, background: C.bgCard,
                textAlign: 'center', padding: '6px 6px', color: C.textMuted,
                fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em',
                width: 90, zIndex: 2,
              }}>Trend</th>
              {metricYears.map(y => (
                <th key={y} data-col={String(y)} style={{
                  position: 'sticky', top: 0, background: C.bgCard,
                  textAlign: 'right', padding: '6px 10px', color: C.text,
                  fontSize: 13, fontWeight: 700, minWidth: 80, zIndex: 2,
                  boxShadow: hoverState.col === String(y) ? `inset 0 0 0 1000px ${C.accent}0c` : undefined,
                }}>
                  {y}
                  {fiscalMonths?.[y] && <div style={{ fontSize: 10, fontWeight: 500, color: C.textSecondary }}>{fiscalMonths[y]}</div>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {metricCategories.map(([catKey, cat]) => {
              // Separate value rows from change rows
              const valueRows = cat.rows.filter(r => !r.key.endsWith('Change'));
              const catHasData = valueRows.some(row =>
                metricYears.some(y => keyMetrics?.metrics?.[y]?.[catKey]?.[row.key] != null)
              );
              if (!catHasData) return null;

              return [
                <tr key={`hdr-${catKey}`}>
                  <td colSpan={metricYears.length + 2} style={{
                    padding: '10px 12px 4px',
                    fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                    letterSpacing: 0.5, color: C.accent,
                    borderBottom: `1px solid ${C.accent}`,
                  }}>{cat.label}</td>
                </tr>,
                ...valueRows.flatMap(row => {
                  const hasData = metricYears.some(y =>
                    keyMetrics?.metrics?.[y]?.[catKey]?.[row.key] != null
                  );
                  if (!hasData) return [];

                  const changeKey = row.key + 'Change';
                  const changeRow = cat.rows.find(r => r.key === changeKey);
                  const hasChange = changeRow && metricYears.some(y =>
                    keyMetrics?.metrics?.[y]?.[catKey]?.[changeKey] != null
                  );
                  const isExpanded = expandedMetrics.has(row.key);

                  const rowId = `km-${row.key}`;
                  const trendValues = metricYears.map(y => keyMetrics?.metrics?.[y]?.[catKey]?.[row.key] ?? null);

                  const rows = [(
                    <tr key={row.key} style={{ borderBottom: `1px solid ${C.borderLight}` }}>
                      <td data-row={rowId} data-col="label" style={{
                        position: 'sticky', left: 0, background: C.bgCard,
                        padding: '5px 12px', color: C.text, fontWeight: 400, zIndex: 1,
                        boxShadow: hoverState.row === rowId ? `inset 0 0 0 1000px ${C.accent}0c` : undefined,
                        cursor: hasChange ? 'pointer' : undefined,
                      }}
                        onClick={hasChange ? () => toggleMetricExpand(row.key) : undefined}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          {hasChange && (
                            <span style={{
                              display: 'inline-block', fontSize: 8, color: C.textMuted,
                              transition: 'transform 0.15s',
                              transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                            }}>▶</span>
                          )}
                          {row.label}
                        </span>
                      </td>
                      <td style={{ padding: '3px 5px', verticalAlign: 'middle' }}>
                        <TrendBars values={trendValues} />
                      </td>
                      {metricYears.map(y => {
                        const colId = String(y);
                        const isRow = hoverState.row === rowId;
                        const isCol = hoverState.col === colId;
                        const shadow = (isRow && isCol)
                          ? `inset 0 0 0 1000px ${C.accent}18`
                          : (isRow || isCol)
                          ? `inset 0 0 0 1000px ${C.accent}0c`
                          : undefined;
                        return (
                          <td key={y} data-row={rowId} data-col={colId} style={{
                            textAlign: 'right', padding: '5px 10px', color: C.text,
                            fontVariantNumeric: 'tabular-nums',
                            boxShadow: shadow,
                          }}>
                            {fmtMetric(keyMetrics?.metrics?.[y]?.[catKey]?.[row.key], row.format)}
                          </td>
                        );
                      })}
                    </tr>
                  )];

                  // Expandable % change row
                  if (hasChange && isExpanded) {
                    const changeRowId = `km-${changeKey}`;
                    const changeTrendValues = metricYears.map(y => keyMetrics?.metrics?.[y]?.[catKey]?.[changeKey] ?? null);
                    rows.push(
                      <tr key={changeKey} style={{ borderBottom: `1px solid ${C.borderLight}`, background: C.bgHover || C.bg }}>
                        <td data-row={changeRowId} data-col="label" style={{
                          position: 'sticky', left: 0, background: C.bgHover || C.bg,
                          padding: '4px 12px 4px 28px', color: C.textSecondary, fontSize: 11,
                          fontWeight: 400, fontStyle: 'italic', zIndex: 1,
                          boxShadow: hoverState.row === changeRowId ? `inset 0 0 0 1000px ${C.accent}0c` : undefined,
                        }}>% Change</td>
                        <td style={{ padding: '3px 5px', verticalAlign: 'middle', background: C.bgHover || C.bg }}>
                          <TrendBars values={changeTrendValues} />
                        </td>
                        {metricYears.map(y => {
                          const val = keyMetrics?.metrics?.[y]?.[catKey]?.[changeKey];
                          const colId = String(y);
                          const isRow = hoverState.row === changeRowId;
                          const isCol = hoverState.col === colId;
                          const shadow = (isRow && isCol)
                            ? `inset 0 0 0 1000px ${C.accent}18`
                            : (isRow || isCol)
                            ? `inset 0 0 0 1000px ${C.accent}0c`
                            : undefined;
                          return (
                            <td key={y} data-row={changeRowId} data-col={colId} style={{
                              textAlign: 'right', padding: '4px 10px', fontSize: 11,
                              color: val != null ? (val >= 0 ? C.green : C.red) : C.textMuted,
                              fontVariantNumeric: 'tabular-nums',
                              background: C.bgHover || C.bg,
                              boxShadow: shadow,
                            }}>
                              {val != null ? (val >= 0 ? '+' : '') + fmtMetric(val, changeRow.format) : '–'}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  }

                  return rows;
                }),
              ];
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Sub-Components ──────────────────────────────────────────

function TableToolbar({ onExport, columnOrder, onToggleOrder }) {
  const isOldest = columnOrder === 'oldestFirst';
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
      <button
        onClick={onExport}
        style={{
          padding: '7px 14px', fontSize: 12, fontWeight: 600,
          background: 'transparent', color: C.textSecondary,
          border: `1px solid ${C.border}`, borderRadius: 6,
          cursor: 'pointer', transition: 'all .15s',
        }}
      >Export CSV</button>
      <button
        onClick={onToggleOrder}
        title={isOldest ? 'Showing oldest first — click for newest first' : 'Showing newest first — click for oldest first'}
        style={{
          padding: '7px 14px', fontSize: 12, fontWeight: 600,
          background: 'transparent', color: C.textSecondary,
          border: `1px solid ${C.border}`, borderRadius: 6,
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
          transition: 'all .15s',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {isOldest ? (
            <>
              <line x1="4" y1="12" x2="20" y2="12" />
              <polyline points="14 6 20 12 14 18" />
            </>
          ) : (
            <>
              <line x1="20" y1="12" x2="4" y2="12" />
              <polyline points="10 6 4 12 10 18" />
            </>
          )}
        </svg>
        {isOldest ? 'Old → New' : 'New → Old'}
      </button>
    </div>
  );
}

function ViewToggle({ view, setView }) {
  return (
    <div style={{ display: 'flex', gap: 0, marginBottom: 12, borderBottom: `1px solid ${C.border}` }}>
      {VIEWS.map(v => (
        <button
          key={v.key}
          onClick={() => setView(v.key)}
          style={{
            padding: '8px 16px', fontSize: 13, cursor: 'pointer',
            background: 'transparent',
            color: view === v.key ? C.accent : C.textSecondary,
            fontWeight: view === v.key ? 600 : 500,
            border: 'none',
            borderBottom: view === v.key ? `2px solid ${C.accent}` : '2px solid transparent',
            marginBottom: -1,
            transition: 'all .15s',
          }}
        >{v.label}</button>
      ))}
    </div>
  );
}

function DropdownBar({ layout, setLayout, version, onVersionChange, periods, setPeriods, disableLayout, dataView, onDataViewChange, qtrPeriods, setQtrPeriods }) {
  const isQuarterly = dataView === 'quarterly';
  return (
    <div style={{
      display: 'flex', gap: 16, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap',
    }}>
      <DropdownControl
        label="Layout" value={layout} onChange={setLayout}
        disabled={disableLayout}
        options={[
          { value: 'expanded', label: 'Expanded' },
          { value: 'consolidated', label: 'Consolidated' },
        ]}
      />
      <DropdownControl
        label="Version" value={version} onChange={onVersionChange}
        options={[
          { value: 'restated', label: 'Restated' },
          { value: 'original', label: 'Original' },
        ]}
      />
      <DropdownControl
        label="View" value={dataView || 'annual'} onChange={onDataViewChange || (() => {})}
        options={[
          { value: 'annual', label: 'Annual' },
          { value: 'quarterly', label: 'Quarterly' },
        ]}
      />
      {isQuarterly ? (
        <DropdownControl
          label="Periods" value={qtrPeriods} onChange={setQtrPeriods}
          options={[
            { value: '4', label: '4 Qtrs' },
            { value: '8', label: '8 Qtrs' },
            { value: '12', label: '12 Qtrs' },
            { value: '20', label: '20 Qtrs' },
            { value: 'all', label: 'All' },
          ]}
        />
      ) : (
        <DropdownControl
          label="Periods" value={periods} onChange={setPeriods}
          options={[
            { value: '5', label: '5' },
            { value: '10', label: '10' },
            { value: '13', label: '13' },
            { value: 'all', label: 'All' },
          ]}
        />
      )}
    </div>
  );
}

function DropdownControl({ label, value, onChange, options, disabled }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: disabled ? 0.4 : 1 }}>
      <span style={{ fontSize: 11, color: C.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}:</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        style={{
          padding: '6px 10px', fontSize: 13, fontWeight: 500,
          background: C.bgInput || C.bgCard, color: C.text,
          border: `1px solid ${C.border}`, borderRadius: 6,
          cursor: disabled ? 'default' : 'pointer',
          fontFamily: 'inherit', outline: 'none',
        }}
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value} disabled={opt.disabled}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function TabBar({ tab, setTab }) {
  return (
    <div style={{ display: 'flex', gap: 0, marginBottom: 12, borderBottom: `1px solid ${C.border}` }}>
      {TABS.map(t => (
        <button
          key={t.key}
          onClick={() => setTab(t.key)}
          style={{
            padding: '8px 16px', fontSize: 13, cursor: 'pointer',
            background: 'transparent',
            color: tab === t.key ? C.accent : C.textSecondary,
            fontWeight: tab === t.key ? 600 : 500,
            border: 'none',
            borderBottom: tab === t.key ? `2px solid ${C.accent}` : '2px solid transparent',
            marginBottom: -1,
            transition: 'all .15s',
          }}
        >{t.label}</button>
      ))}
    </div>
  );
}

function StatementTable({ columns, rows, getValue, fiscalMonths, ttmQuarter, columnHeaders, hoverState, onMouseMove, onMouseLeave }) {
  // Columns for trend bars: exclude TTM, keep same order as displayed columns
  const trendCols = useMemo(() => columns.filter(c => c !== 'TTM'), [columns]);

  return (
    <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '75vh' }}>
      <table
        style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, whiteSpace: 'nowrap' }}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
      >
        <thead>
          <tr style={{ borderBottom: `2px solid ${C.border}` }}>
            <th data-col="label" style={{
              position: 'sticky', left: 0, top: 0, background: C.bgCard,
              textAlign: 'left', padding: '6px 12px', color: C.textMuted,
              fontSize: 11, fontWeight: 600, minWidth: 260, zIndex: 3,
            }}>
              All numbers in millions except per share data
            </th>
            <th style={{
              position: 'sticky', top: 0, background: C.bgCard,
              textAlign: 'center', padding: '6px 6px', color: C.textMuted,
              fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em',
              width: 90, zIndex: 2,
            }}>Trend</th>
            {(columnHeaders || columns.map(col => ({ key: col, label: String(col), fiscalMonth: fiscalMonths?.[col] }))).map(hdr => {
              const colId = String(hdr.key);
              return (
                <th key={hdr.key} data-col={colId} style={{
                  position: 'sticky', top: 0, background: hdr.key === 'TTM' ? C.bgHover || C.bgCard : C.bgCard,
                  textAlign: 'right', padding: '6px 10px', color: C.text,
                  fontSize: 13, fontWeight: 700, minWidth: 90, zIndex: 2,
                  borderLeft: hdr.key === 'TTM' ? `2px solid ${C.accent}` : undefined,
                  boxShadow: hoverState?.col === colId ? `inset 0 0 0 1000px ${C.accent}0c` : undefined,
                }}>
                  {hdr.label}
                  {hdr.key === 'TTM' && ttmQuarter && <div style={{ fontSize: 10, fontWeight: 500, color: C.textSecondary }}>{ttmQuarter}</div>}
                  {hdr.fiscalMonth && <div style={{ fontSize: 10, fontWeight: 500, color: C.textSecondary }}>{hdr.fiscalMonth}</div>}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            if (row.type === 'header') {
              return (
                <tr key={`hdr-${idx}`}>
                  <td colSpan={columns.length + 2} style={{
                    padding: '10px 12px 4px', fontSize: 11, fontWeight: 700,
                    textTransform: 'uppercase', letterSpacing: 0.5, color: C.accent,
                    borderBottom: `1px solid ${C.accent}`,
                  }}>{row.label}</td>
                </tr>
              );
            }

            if (row.type === 'spacer') {
              return <tr key={`sp-${idx}`}><td colSpan={columns.length + 2} style={{ height: 8 }} /></tr>;
            }

            const hasData = columns.some(col => getValue(row, col) != null);
            if (!hasData) return null;

            const rowId = `${row.key}-${idx}`;
            const trendValues = trendCols.map(col => getValue(row, col));

            return (
              <tr key={rowId} style={{ borderBottom: `1px solid ${C.borderLight}` }}>
                <td data-row={rowId} data-col="label" style={{
                  position: 'sticky', left: 0, background: C.bgCard,
                  padding: '5px 12px', color: C.text,
                  fontWeight: row.bold ? 700 : 400, zIndex: 1,
                  boxShadow: hoverState?.row === rowId ? `inset 0 0 0 1000px ${C.accent}0c` : undefined,
                }}>{row.label}</td>
                <td style={{ padding: '3px 5px', verticalAlign: 'middle' }}>
                  <TrendBars values={trendValues} />
                </td>
                {columns.map(col => {
                  const val = getValue(row, col);
                  const colId = String(col);
                  const isRow = hoverState?.row === rowId;
                  const isCol = hoverState?.col === colId;
                  const shadow = (isRow && isCol)
                    ? `inset 0 0 0 1000px ${C.accent}18`
                    : (isRow || isCol)
                    ? `inset 0 0 0 1000px ${C.accent}0c`
                    : undefined;
                  return (
                    <td key={col} data-row={rowId} data-col={colId} style={{
                      textAlign: 'right', padding: '5px 10px', color: C.text,
                      fontWeight: row.bold ? 600 : 400,
                      fontVariantNumeric: 'tabular-nums',
                      borderLeft: col === 'TTM' ? `2px solid ${C.accent}` : undefined,
                      background: col === 'TTM' ? (C.bgHover || 'transparent') : undefined,
                      boxShadow: shadow,
                    }}>
                      {fmtVal(val, { perShare: row.perShare, shares: row.shares, negate: row.negate, format: row.format })}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
