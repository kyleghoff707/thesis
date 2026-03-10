import { useState, useMemo } from 'react';
import { C } from '../theme';
import { computeKeyMetrics, KEY_METRICS_ROWS } from '../engines/keyMetrics';

// ─── CSV Export ──────────────────────────────────────────────

function escapeCsv(val) {
  const s = String(val ?? '');
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
}

function buildFinancialsCsv(displayYears, rows, getValue, fiscalMonths) {
  const headerRow = ['', ...displayYears.map(y => fiscalMonths?.[y] ? `${y} (${fiscalMonths[y]})` : String(y))];
  const lines = [headerRow.map(escapeCsv).join(',')];

  for (const row of rows) {
    if (row.type === 'header') {
      lines.push('');
      lines.push(escapeCsv(row.label));
      continue;
    }
    if (row.type === 'spacer') continue;

    const hasData = displayYears.some(y => getValue(row, y) != null);
    if (!hasData) continue;

    const cells = [escapeCsv(row.label)];
    for (const y of displayYears) {
      const val = getValue(row, y);
      cells.push(val != null ? String(val) : '');
    }
    lines.push(cells.join(','));
  }
  return lines.join('\n');
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
  if (opts.shares) return fmtNum(value / 1e6, 1) + 'M';
  if (opts.negate) value = -Math.abs(value);
  if (Math.abs(value) >= 1e9) return '$' + fmtNum(value / 1e9, 2) + 'B';
  if (Math.abs(value) >= 1e6) return '$' + fmtNum(value / 1e6, 1) + 'M';
  if (Math.abs(value) >= 1e3) return '$' + fmtNum(value / 1e3, 1) + 'K';
  return '$' + fmtNum(value, 0);
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

// ─── Component ───────────────────────────────────────────────

export default function FinancialStatements({ edgarStatements, latestPrice, ticker, version, onVersionChange }) {
  const [view, setView] = useState('financials');
  const [tab, setTab] = useState('income');
  const [layout, setLayout] = useState('expanded');
  const [periods, setPeriods] = useState('13');

  const keyMetrics = useMemo(() => {
    if (!edgarStatements) return null;
    return computeKeyMetrics(edgarStatements, latestPrice);
  }, [edgarStatements, latestPrice]);

  if (!edgarStatements) return null;

  const { years, income, balance, cashFlow, fiscalMonths, ttm } = edgarStatements;
  const periodCount = periods === 'all' ? years.length : parseInt(periods);
  const annualYears = years.slice(0, periodCount);
  // Prepend TTM column if quarterly data exists
  const displayYears = ttm ? ['TTM', ...annualYears] : annualYears;

  // ── Financial Statements View ──
  if (view === 'financials') {
    const stmtMap = { income, balance, cashFlow };
    const allRows = ROWS[tab] || [];
    // Filter by layout — expanded rows hidden in consolidated mode
    const rows = allRows.filter(row => layout === 'expanded' || !row.expanded);

    const ttmStmtMap = ttm ? { income: ttm.income, balance: ttm.balance, cashFlow: ttm.cashFlow } : {};

    function getValue(row, year) {
      if (year === 'TTM') {
        const source = row.source ? ttmStmtMap[row.source] : ttmStmtMap[tab];
        const val = source?.[row.key];
        if (val == null) return null;
        if (row.negate) return -Math.abs(val);
        if (row.hideNegative && val <= 0) return null;
        return val;
      }
      const source = row.source ? stmtMap[row.source] : stmtMap[tab];
      const val = source?.[year]?.[row.key];
      if (val == null) return null;
      if (row.negate) return -Math.abs(val);
      if (row.hideNegative && val <= 0) return null;
      return val;
    }

    const tabLabel = TABS.find(t => t.key === tab)?.label || tab;

    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <ViewToggle view={view} setView={setView} />
          <CsvButton onClick={() => {
            const csv = buildFinancialsCsv(displayYears, rows, getValue, fiscalMonths);
            downloadCsv(csv, `${ticker || 'financials'}_${tabLabel.replace(/\s+/g, '_')}_${layout}_${version}.csv`);
          }} />
        </div>
        <DropdownBar
          layout={layout} setLayout={setLayout}
          version={version} onVersionChange={onVersionChange}
          periods={periods} setPeriods={setPeriods}
          disableLayout={false}
        />
        <TabBar tab={tab} setTab={setTab} />
        <StatementTable
          columns={displayYears}
          rows={rows}
          getValue={getValue}
          fiscalMonths={fiscalMonths}
          ttmQuarter={ttm?.quarter}
        />
      </div>
    );
  }

  // ── Key Metrics View ──
  const metricYears = keyMetrics?.years?.slice(0, periodCount) || [];
  const metricCategories = Object.entries(KEY_METRICS_ROWS);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <ViewToggle view={view} setView={setView} />
        <CsvButton onClick={() => {
          const csv = buildKeyMetricsCsv(metricYears, metricCategories, keyMetrics, fiscalMonths);
          downloadCsv(csv, `${ticker || 'key_metrics'}_Key_Metrics.csv`);
        }} />
      </div>
      <DropdownBar
        layout={layout} setLayout={setLayout}
        version={version} onVersionChange={onVersionChange}
        periods={periods} setPeriods={setPeriods}
        disableLayout={true}
      />
      <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '75vh' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, whiteSpace: 'nowrap' }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${C.border}` }}>
              <th style={{
                position: 'sticky', left: 0, top: 0, background: C.bgCard,
                textAlign: 'left', padding: '6px 12px', color: C.textSecondary,
                fontSize: 11, fontWeight: 600, minWidth: 220, zIndex: 3,
              }}>Metric</th>
              {metricYears.map(y => (
                <th key={y} style={{
                  position: 'sticky', top: 0, background: C.bgCard,
                  textAlign: 'right', padding: '6px 10px', color: C.text,
                  fontSize: 13, fontWeight: 700, minWidth: 80, zIndex: 2,
                }}>
                  {y}
                  {fiscalMonths?.[y] && <div style={{ fontSize: 10, fontWeight: 500, color: C.textSecondary }}>{fiscalMonths[y]}</div>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {metricCategories.map(([catKey, cat]) => {
              const catHasData = cat.rows.some(row =>
                metricYears.some(y => keyMetrics?.metrics?.[y]?.[catKey]?.[row.key] != null)
              );
              if (!catHasData) return null;

              return [
                <tr key={`hdr-${catKey}`}>
                  <td colSpan={metricYears.length + 1} style={{
                    padding: '10px 12px 4px',
                    fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                    letterSpacing: 0.5, color: C.accent,
                    borderBottom: `1px solid ${C.accent}`,
                  }}>{cat.label}</td>
                </tr>,
                ...cat.rows.map(row => {
                  const hasData = metricYears.some(y =>
                    keyMetrics?.metrics?.[y]?.[catKey]?.[row.key] != null
                  );
                  if (!hasData) return null;

                  return (
                    <tr key={row.key} style={{ borderBottom: `1px solid ${C.borderLight}` }}>
                      <td style={{
                        position: 'sticky', left: 0, background: C.bgCard,
                        padding: '5px 12px', color: C.text, fontWeight: 400, zIndex: 1,
                      }}>{row.label}</td>
                      {metricYears.map(y => (
                        <td key={y} style={{
                          textAlign: 'right', padding: '5px 10px', color: C.text,
                          fontVariantNumeric: 'tabular-nums',
                        }}>
                          {fmtMetric(keyMetrics?.metrics?.[y]?.[catKey]?.[row.key], row.format)}
                        </td>
                      ))}
                    </tr>
                  );
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

function CsvButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '5px 12px', fontSize: 11, fontWeight: 600,
        background: 'transparent', color: C.textSecondary,
        border: `1px solid ${C.border}`, borderRadius: 4,
        cursor: 'pointer', marginBottom: 12,
      }}
    >Export CSV</button>
  );
}

function ViewToggle({ view, setView }) {
  return (
    <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
      {VIEWS.map(v => (
        <button
          key={v.key}
          onClick={() => setView(v.key)}
          style={{
            padding: '6px 16px', fontSize: 12, fontWeight: 600,
            background: view === v.key ? C.accent : 'transparent',
            color: view === v.key ? '#fff' : C.textSecondary,
            border: `1px solid ${view === v.key ? C.accent : C.border}`,
            borderRadius: 4, cursor: 'pointer',
          }}
        >{v.label}</button>
      ))}
    </div>
  );
}

function DropdownBar({ layout, setLayout, version, onVersionChange, periods, setPeriods, disableLayout }) {
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
        label="View" value="annual" onChange={() => {}}
        options={[
          { value: 'annual', label: 'Annual' },
        ]}
      />
      <DropdownControl
        label="Periods" value={periods} onChange={setPeriods}
        options={[
          { value: '5', label: '5' },
          { value: '10', label: '10' },
          { value: '13', label: '13' },
          { value: 'all', label: 'All' },
        ]}
      />
    </div>
  );
}

function DropdownControl({ label, value, onChange, options, disabled }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: disabled ? 0.4 : 1 }}>
      <span style={{ fontSize: 12, color: C.textSecondary, fontWeight: 600 }}>{label}:</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        style={{
          padding: '5px 10px', fontSize: 12, fontWeight: 500,
          background: C.bgInput || C.bgCard, color: C.text,
          border: `1px solid ${C.border}`, borderRadius: 4,
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
    <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
      {TABS.map(t => (
        <button
          key={t.key}
          onClick={() => setTab(t.key)}
          style={{
            padding: '6px 14px', fontSize: 12, fontWeight: 600,
            background: tab === t.key ? C.accent : 'transparent',
            color: tab === t.key ? '#fff' : C.textSecondary,
            border: `1px solid ${tab === t.key ? C.accent : C.border}`,
            borderRadius: 4, cursor: 'pointer',
          }}
        >{t.label}</button>
      ))}
    </div>
  );
}

function StatementTable({ columns, rows, getValue, fiscalMonths, ttmQuarter }) {
  return (
    <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '75vh' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, whiteSpace: 'nowrap' }}>
        <thead>
          <tr style={{ borderBottom: `2px solid ${C.border}` }}>
            <th style={{
              position: 'sticky', left: 0, top: 0, background: C.bgCard,
              textAlign: 'left', padding: '6px 12px', color: C.textSecondary,
              fontSize: 11, fontWeight: 600, minWidth: 260, zIndex: 3,
            }}>
              All Numbers in Millions except per share data
            </th>
            {columns.map(col => (
              <th key={col} style={{
                position: 'sticky', top: 0, background: col === 'TTM' ? C.bgHover || C.bgCard : C.bgCard,
                textAlign: 'right', padding: '6px 10px', color: C.text,
                fontSize: 13, fontWeight: 700, minWidth: 90, zIndex: 2,
                borderLeft: col === 'TTM' ? `2px solid ${C.accent}` : undefined,
              }}>
                {col}
                {col === 'TTM' && ttmQuarter && <div style={{ fontSize: 10, fontWeight: 500, color: C.textSecondary }}>{ttmQuarter}</div>}
                {col !== 'TTM' && fiscalMonths?.[col] && <div style={{ fontSize: 10, fontWeight: 500, color: C.textSecondary }}>{fiscalMonths[col]}</div>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            if (row.type === 'header') {
              return (
                <tr key={`hdr-${idx}`}>
                  <td colSpan={columns.length + 1} style={{
                    padding: '10px 12px 4px', fontSize: 11, fontWeight: 700,
                    textTransform: 'uppercase', letterSpacing: 0.5, color: C.accent,
                    borderBottom: `1px solid ${C.accent}`,
                  }}>{row.label}</td>
                </tr>
              );
            }

            if (row.type === 'spacer') {
              return <tr key={`sp-${idx}`}><td colSpan={columns.length + 1} style={{ height: 8 }} /></tr>;
            }

            const hasData = columns.some(col => getValue(row, col) != null);
            if (!hasData) return null;

            return (
              <tr key={`${row.key}-${idx}`} style={{ borderBottom: `1px solid ${C.borderLight}` }}>
                <td style={{
                  position: 'sticky', left: 0, background: C.bgCard,
                  padding: '5px 12px', color: C.text,
                  fontWeight: row.bold ? 700 : 400, zIndex: 1,
                }}>{row.label}</td>
                {columns.map(col => {
                  const val = getValue(row, col);
                  return (
                    <td key={col} style={{
                      textAlign: 'right', padding: '5px 10px', color: C.text,
                      fontWeight: row.bold ? 600 : 400,
                      fontVariantNumeric: 'tabular-nums',
                      borderLeft: col === 'TTM' ? `2px solid ${C.accent}` : undefined,
                      background: col === 'TTM' ? (C.bgHover || 'transparent') : undefined,
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
