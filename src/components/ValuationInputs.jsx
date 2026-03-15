import { useMemo, useState } from 'react';
import { C } from '../theme';

// ─── Formatters ─────────────────────────────────────────────

function fmtVal(n, decimals = 1) {
  if (n == null || isNaN(n)) return '--';
  const prefix = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  return prefix + Number(abs.toFixed(decimals)).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtMillions(n, decimals = 1) {
  if (n == null || isNaN(n)) return '--';
  return fmtVal(n / 1e6, decimals);
}

function fmtRatio(n) {
  if (n == null || isNaN(n)) return '--';
  return n.toFixed(2);
}

function fmtPctVal(n) {
  if (n == null || isNaN(n)) return '--';
  return (n * 100).toFixed(1) + '%';
}

// ─── Shared table component ─────────────────────────────────

function DataTable({ title, note, rows, columns, specialColumns, onColumnClick, excludedYears }) {
  const thStyle = {
    fontSize: 12,
    fontWeight: 600,
    color: C.textSecondary,
    padding: '8px 12px',
    textAlign: 'right',
    whiteSpace: 'nowrap',
    borderBottom: `2px solid ${C.border}`,
    position: 'sticky',
    top: 0,
    background: C.bgCard,
    zIndex: 1,
  };

  const tdStyle = (excluded) => ({
    fontSize: 12,
    fontVariantNumeric: 'tabular-nums',
    padding: '6px 12px',
    textAlign: 'right',
    color: excluded ? C.textMuted : C.text,
    fontWeight: 500,
    textDecoration: excluded ? 'line-through' : 'none',
    opacity: excluded ? 0.5 : 1,
    borderBottom: `1px solid ${C.borderLight}`,
  });

  const labelStyle = {
    fontSize: 12,
    fontWeight: 500,
    color: C.textSecondary,
    padding: '6px 12px',
    whiteSpace: 'nowrap',
    position: 'sticky',
    left: 0,
    background: C.bgCard,
    zIndex: 1,
    borderBottom: `1px solid ${C.borderLight}`,
  };

  return (
    <div style={{
      background: C.bgCard,
      border: `1px solid ${C.border}`,
      borderRadius: 8,
      marginBottom: 20,
      boxShadow: `0 1px 3px ${C.shadow}`,
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '12px 16px 8px',
        borderBottom: `1px solid ${C.border}`,
      }}>
        <div style={{
          fontSize: 13,
          fontWeight: 600,
          color: C.accent,
        }}>{title}</div>
        {note && (
          <div style={{
            fontSize: 11,
            color: C.textMuted,
            marginTop: 4,
            fontStyle: 'italic',
          }}>{note}</div>
        )}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
          minWidth: columns.length * 90 + 180,
        }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, textAlign: 'left', position: 'sticky', left: 0, background: C.bgCard, zIndex: 2 }}></th>
              {columns.map(col => {
                const isExcluded = excludedYears?.has(col.key);
                const isClickable = onColumnClick && col.key !== 'TTM' && col.key !== 'weightedAvg' && col.key !== '3yrAvg';
                return (
                  <th
                    key={col.key}
                    style={{
                      ...thStyle,
                      cursor: isClickable ? 'pointer' : 'default',
                      color: isExcluded ? C.red : col.isSpecial ? C.accent : C.textSecondary,
                      opacity: isExcluded ? 0.6 : 1,
                      userSelect: isClickable ? 'none' : 'auto',
                    }}
                    onClick={() => isClickable && onColumnClick(col.key)}
                    title={isClickable ? (isExcluded ? 'Click to include this year' : 'Click to exclude this year') : undefined}
                  >
                    {col.label}
                    {isExcluded && <span style={{ display: 'block', fontSize: 9, color: C.red }}>excluded</span>}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.key}>
                <td style={labelStyle}>{row.label}</td>
                {columns.map(col => {
                  const isExcluded = excludedYears?.has(col.key);
                  const val = row.getValue(col.key);
                  return (
                    <td key={col.key} style={{
                      ...tdStyle(isExcluded && !col.isSpecial),
                      fontWeight: col.isSpecial ? 600 : 500,
                      color: col.isSpecial ? C.accent : (isExcluded ? C.textMuted : C.text),
                    }}>
                      {row.format ? row.format(val) : fmtVal(val)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────

export default function ValuationInputs({
  edgarStatements,
  historicalPE,
  historicalAvgPE,
  excludedYears,
  toggleExcludedYear,
  excludedYears10Cap,
  toggleExcludedYear10Cap,
  excludedYearsMOS,
  toggleExcludedYearMOS,
  excludedYearsEB,
  toggleExcludedYearEB,
  eb3yrAvg,
  fcfRatioData,
  settings,
  hasTTM,
  returns,
}) {
  const [newestFirst, setNewestFirst] = useState(false);

  if (!edgarStatements) return null;

  const { years, income, balance, cashFlow, ttm } = edgarStatements;

  // Determine how many years to show
  const periodSetting = settings?.defaultPeriods || '10';
  const maxYears = periodSetting === 'all' ? years.length : Math.min(parseInt(periodSetting) || 10, years.length);
  const visibleYears = years.slice(0, maxYears);

  // Order years based on direction toggle
  const orderedYears = newestFirst ? visibleYears : [...visibleYears].reverse();

  // ─── 10 Cap Inputs ──────────────────────────────────────

  const tenCapColumns = useMemo(() => {
    const cols = [];
    // TTM goes on the "most recent" side: end when oldest-first, start when newest-first
    if (hasTTM && newestFirst) cols.push({ key: 'TTM', label: 'TTM', isSpecial: false });
    orderedYears.forEach(y => cols.push({ key: y, label: String(y) }));
    if (hasTTM && !newestFirst) cols.push({ key: 'TTM', label: 'TTM', isSpecial: false });
    return cols;
  }, [orderedYears, hasTTM, newestFirst]);

  const getTenCapVal = (field, year) => {
    if (year === 'TTM') {
      const t = edgarStatements.ttm;
      if (field === 'opCF') return t?.cashFlow?.net_cash_flow_from_operating_activities;
      if (field === 'capEx') return t?.cashFlow?.capital_expenditures;
      if (field === 'tax') return t?.income?.income_tax;
      if (field === 'shares') return t?.balance?.shares_outstanding;
      return null;
    }
    if (field === 'opCF') return cashFlow[year]?.net_cash_flow_from_operating_activities;
    if (field === 'capEx') return cashFlow[year]?.capital_expenditures;
    if (field === 'tax') return income[year]?.income_tax;
    if (field === 'shares') return balance[year]?.shares_outstanding;
    return null;
  };

  const tenCapRows = [
    { key: 'opCF', label: 'Operating Cash Flow', getValue: y => getTenCapVal('opCF', y), format: v => fmtMillions(v) },
    { key: 'capEx', label: 'Capital Expenditures', getValue: y => getTenCapVal('capEx', y), format: v => fmtMillions(v) },
    { key: 'tax', label: 'Tax Provision', getValue: y => getTenCapVal('tax', y), format: v => fmtMillions(v) },
    { key: 'shares', label: 'Shares Outstanding End of Period', getValue: y => getTenCapVal('shares', y), format: v => fmtMillions(v, 0) },
  ];

  // ─── MOS Inputs ─────────────────────────────────────────

  const mosColumns = useMemo(() => {
    const cols = [];
    if (hasTTM && newestFirst) cols.push({ key: 'TTM', label: 'TTM', isSpecial: false });
    orderedYears.forEach(y => cols.push({ key: y, label: String(y) }));
    if (hasTTM && !newestFirst) cols.push({ key: 'TTM', label: 'TTM', isSpecial: false });
    return cols;
  }, [orderedYears, hasTTM, newestFirst]);

  const mosRows = [
    {
      key: 'eps',
      label: 'Earnings Per Share (Diluted)',
      getValue: y => {
        if (y === 'TTM') return edgarStatements.ttm?.income?.diluted_earnings_per_share;
        return income[y]?.diluted_earnings_per_share;
      },
      format: v => fmtVal(v, 2),
    },
    {
      key: 'highPE',
      label: 'High PE Ratio',
      getValue: y => {
        if (y === 'TTM') {
          // TTM PE = current price / TTM EPS
          return null; // Not displayed for TTM in toolbox
        }
        return historicalPE?.[y];
      },
      format: v => fmtVal(v, 2),
    },
  ];

  // ─── PBT Inputs ─────────────────────────────────────────

  // Compute weighted averages for PBT rows
  const pbtWeightedAvgs = useMemo(() => {
    const activeYears = visibleYears.filter(y => !excludedYears.has(y));
    if (activeYears.length === 0) return { fcfRatio: null };

    // FCF Ratio = simple average of per-year FCF/NI ratios (non-excluded years)
    const fcfRatios = activeYears.map(y => {
      const ni = income[y]?.net_income_loss;
      const fcf = cashFlow[y]?.free_cash_flow;
      return (ni && ni > 0 && fcf != null) ? fcf / ni : null;
    }).filter(v => v != null);
    const fcfRatioAvg = fcfRatios.length > 0
      ? fcfRatios.reduce((a, b) => a + b, 0) / fcfRatios.length
      : null;

    return { fcfRatio: fcfRatioAvg };
  }, [visibleYears, excludedYears, income, cashFlow]);

  const pbtColumns = useMemo(() => {
    const cols = [];
    // Weighted Average stays on the "most recent" side
    if (newestFirst) cols.push({ key: 'weightedAvg', label: 'Weighted Average', isSpecial: true });
    orderedYears.forEach(y => cols.push({ key: y, label: String(y) }));
    if (!newestFirst) cols.push({ key: 'weightedAvg', label: 'Weighted Average', isSpecial: true });
    return cols;
  }, [orderedYears, newestFirst]);

  const pbtRows = [
    {
      key: 'ni',
      label: 'Net Income Continuous Operations',
      getValue: y => {
        if (y === 'weightedAvg') return null;
        return income[y]?.net_income_loss;
      },
      format: v => fmtMillions(v),
    },
    {
      key: 'opCF',
      label: 'Operating Cash Flow',
      getValue: y => {
        if (y === 'weightedAvg') return null;
        return cashFlow[y]?.net_cash_flow_from_operating_activities;
      },
      format: v => fmtMillions(v),
    },
    {
      key: 'capEx',
      label: 'Capital Expenditures',
      getValue: y => {
        if (y === 'weightedAvg') return null;
        return cashFlow[y]?.capital_expenditures;
      },
      format: v => fmtMillions(v),
    },
    {
      key: 'fcf',
      label: 'Free Cash Flow',
      getValue: y => {
        if (y === 'weightedAvg') return null;
        return cashFlow[y]?.free_cash_flow;
      },
      format: v => fmtMillions(v),
    },
    {
      key: 'fcfRatio',
      label: 'Free Cash Flow Ratio',
      getValue: y => {
        if (y === 'weightedAvg') return pbtWeightedAvgs.fcfRatio;
        const ni = income[y]?.net_income_loss;
        const fcf = cashFlow[y]?.free_cash_flow;
        if (!ni || ni <= 0 || fcf == null) return null;
        return fcf / ni;
      },
      format: v => fmtVal(v, 2),
    },
  ];

  // ─── Equity Bond Inputs ──────────────────────────────────

  const ebColumns = useMemo(() => {
    const cols = [];
    if (newestFirst) cols.push({ key: '3yrAvg', label: '3yr Avg', isSpecial: true });
    orderedYears.forEach(y => cols.push({ key: y, label: String(y) }));
    if (!newestFirst) cols.push({ key: '3yrAvg', label: '3yr Avg', isSpecial: true });
    return cols;
  }, [orderedYears, newestFirst]);

  // ─── Pretax Equity Bond Inputs ────────────────────────────

  const pretaxEPSByYear = useMemo(() => {
    const result = {};
    for (const y of years) {
      if (y === 'TTM') continue;
      const inc = income[y]?.income_before_tax;
      const sh = balance[y]?.shares_outstanding;
      if (inc != null && sh && sh > 0) result[y] = inc / sh;
    }
    if (edgarStatements.ttm) {
      const tInc = edgarStatements.ttm?.income?.income_before_tax;
      const tSh = edgarStatements.ttm?.balance?.shares_outstanding;
      if (tInc != null && tSh && tSh > 0) result['TTM'] = tInc / tSh;
    }
    return result;
  }, [years, income, balance, edgarStatements.ttm]);

  const ptebRows = [
    {
      key: 'pretaxInc',
      label: 'Pre-Tax Income',
      getValue: y => {
        if (y === 'TTM') return edgarStatements.ttm?.income?.income_before_tax;
        return income[y]?.income_before_tax;
      },
      format: v => fmtMillions(v),
    },
    {
      key: 'shares',
      label: 'Shares Outstanding',
      getValue: y => {
        if (y === 'TTM') return edgarStatements.ttm?.balance?.shares_outstanding;
        return balance[y]?.shares_outstanding;
      },
      format: v => fmtMillions(v, 0),
    },
    {
      key: 'pretaxEPS',
      label: 'Pretax EPS',
      getValue: y => pretaxEPSByYear[y] ?? null,
      format: v => fmtVal(v, 2),
    },
    {
      key: 'pretaxEPSGrowth',
      label: 'Pretax EPS Growth',
      getValue: y => {
        if (y === 'TTM') return null;
        const curr = pretaxEPSByYear[y];
        const prev = pretaxEPSByYear[y - 1];
        if (curr == null || prev == null || prev === 0) return null;
        return (curr - prev) / Math.abs(prev);
      },
      format: v => fmtPctVal(v),
    },
  ];

  // ─── BVPS Growth Inputs ───────────────────────────────────

  const roeByYear = useMemo(() => {
    if (!returns?.yearly) return {};
    const result = {};
    for (const entry of returns.yearly) {
      result[entry.year] = entry.roe;
    }
    return result;
  }, [returns]);

  const ebRows = [
    {
      key: 'bvps',
      label: 'Book Value Per Share',
      getValue: y => {
        if (y === '3yrAvg') return eb3yrAvg?.bvps ?? null;
        const eq = balance[y]?.equity_attributable_to_parent ?? balance[y]?.equity;
        const sh = balance[y]?.shares_outstanding;
        return (eq != null && sh && sh > 0) ? eq / sh : null;
      },
      format: v => fmtVal(v, 2),
    },
    {
      key: 'roe',
      label: 'Return on Equity',
      getValue: y => {
        if (y === '3yrAvg') return eb3yrAvg?.roe ?? null;
        return roeByYear[y] ?? null;
      },
      format: v => fmtPctVal(v),
    },
    {
      key: 'dps',
      label: 'Dividends Per Share',
      getValue: y => {
        if (y === '3yrAvg') return eb3yrAvg?.dps ?? null;
        return income[y]?.dividends_per_share ?? 0;
      },
      format: v => fmtVal(v, 2),
    },
    {
      key: 'retainedRatio',
      label: 'Retained Earnings Ratio',
      getValue: y => {
        if (y === '3yrAvg') return eb3yrAvg?.retainedRatio ?? null;
        const eps = income[y]?.diluted_earnings_per_share;
        const dps = income[y]?.dividends_per_share;
        if (!eps || eps <= 0) return null;
        const payout = dps ? Math.abs(dps) / eps : 0;
        return Math.max(0, Math.min(1, 1 - payout));
      },
      format: v => fmtPctVal(v),
    },
    {
      key: 'avgPE',
      label: 'Avg P/E Ratio',
      getValue: y => {
        if (y === '3yrAvg') return eb3yrAvg?.avgPE ?? null;
        return historicalAvgPE?.[y] ?? null;
      },
      format: v => fmtVal(v, 2),
    },
  ];

  // ─── Render ─────────────────────────────────────────────

  return (
    <div>
      {/* Direction toggle */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <button
          onClick={() => setNewestFirst(p => !p)}
          title={newestFirst ? 'Show oldest first' : 'Show newest first'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '4px 10px',
            fontSize: 11,
            fontWeight: 500,
            color: C.textSecondary,
            background: C.bgCard,
            border: `1px solid ${C.border}`,
            borderRadius: 6,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points={newestFirst ? '15 18 9 12 15 6' : '9 18 15 12 9 6'} />
            <line x1={newestFirst ? '20' : '4'} y1="12" x2={newestFirst ? '4' : '20'} y2="12" />
          </svg>
          {newestFirst ? 'Newest → Oldest' : 'Oldest → Newest'}
        </button>
      </div>

      <DataTable
        title="10 Cap Inputs"
        note="Values in millions · Click a year to exclude"
        rows={tenCapRows}
        columns={tenCapColumns}
        onColumnClick={toggleExcludedYear10Cap}
        excludedYears={excludedYears10Cap}
      />

      <DataTable
        title="Margin of Safety Inputs"
        note="Click a year to exclude"
        rows={mosRows}
        columns={mosColumns}
        onColumnClick={toggleExcludedYearMOS}
        excludedYears={excludedYearsMOS}
      />

      <DataTable
        title="Payback Time Inputs"
        note="Values in millions · Exclude outlier data by clicking on the year you wish to exclude"
        rows={pbtRows}
        columns={pbtColumns}
        onColumnClick={toggleExcludedYear}
        excludedYears={excludedYears}
      />

      <DataTable
        title="Equity Bond Inputs"
        note="Click a year to exclude · 3yr Avg feeds calculator defaults"
        rows={ebRows}
        columns={ebColumns}
        onColumnClick={toggleExcludedYearEB}
        excludedYears={excludedYearsEB}
      />
    </div>
  );
}
