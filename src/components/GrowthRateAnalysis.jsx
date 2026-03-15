import { useState, useMemo, useRef, useCallback } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { C } from '../theme';
import {
  compute3YearSmoothedRates,
  buildGrowthAnalysisSeries,
} from '../engines/growthRates';

// ─── Constants ──────────────────────────────────────────────

const ALL_METRICS = [
  { key: 'bookValue', label: 'Book Value', color: '#64748b', unit: 'millions', chartType: 'growth' },
  { key: 'bvPlusDiv', label: 'Book Value Plus Dividends', color: '#8b5cf6', unit: 'millions', chartType: 'growth' },
  { key: 'earnings', label: 'Earnings', color: '#22c55e', unit: 'millions', chartType: 'growth' },
  { key: 'pretaxEarnings', label: 'Pre-Tax Earnings', color: '#10b981', unit: 'millions', chartType: 'growth' },
  { key: 'operatingCash', label: 'Operating Cash', color: '#3b82f6', unit: 'millions', chartType: 'growth' },
  { key: 'revenue', label: 'Revenue', color: '#f59e0b', unit: 'millions', chartType: 'growth' },
  { key: 'fcf', label: 'Free Cash Flow', color: '#ec4899', unit: 'millions', chartType: 'growth' },
  { key: 'retainedEarnings', label: 'Retained Earnings', color: '#84cc16', unit: 'millions', chartType: 'growth' },
  { key: 'marketCap', label: 'Market Cap', color: '#06b6d4', unit: 'millions', chartType: 'growth' },
  { key: 'roe', label: 'Return on Equity', color: '#f97316', unit: 'percent', chartType: 'return', isReturn: true },
  { key: 'roic', label: 'Return on Invested Capital', color: '#a855f7', unit: 'percent', chartType: 'return', isReturn: true },
  { key: 'roa', label: 'Return on Assets', color: '#14b8a6', unit: 'percent', chartType: 'return', isReturn: true },
];

// All growth-type metrics eligible for composite GR selection
const GROWTH_METRICS = ALL_METRICS.filter(m => m.chartType === 'growth');


const MONTH_INDEX = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

// ─── Formatters ─────────────────────────────────────────────

function fmtMillions(n) {
  if (n == null || isNaN(n)) return '';
  const v = n / 1e6;
  const prefix = v < 0 ? '-' : '';
  return prefix + Math.abs(v).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function fmtPercent(n) {
  if (n == null || isNaN(n)) return '';
  return (n * 100).toFixed(2) + '%';
}

function fmtGrowthRate(n) {
  if (n == null || isNaN(n)) return '--';
  return (n * 100).toFixed(2) + '%';
}

// ─── Chart tooltip ──────────────────────────────────────────

function CustomTooltip({ active, payload, label, mouseYRef, yDomain }) {
  if (!active || !payload?.length) return null;

  const validItems = payload.filter(p => p.value != null);
  if (validItems.length === 0) return null;

  let item = validItems[0];

  // Find the line closest to the cursor's vertical position
  const mouseY = mouseYRef?.current;
  if (mouseY != null && validItems.length > 1 && yDomain) {
    const plotTop = 20;
    const plotBottom = 275;
    const plotHeight = plotBottom - plotTop;
    const [yMin, yMax] = yDomain;
    const yRange = yMax - yMin;

    let closestDist = Infinity;
    for (const p of validItems) {
      const pixelY = yRange > 0
        ? plotTop + plotHeight * (1 - (p.value - yMin) / yRange)
        : (plotTop + plotBottom) / 2;
      const dist = Math.abs(pixelY - mouseY);
      if (dist < closestDist) {
        closestDist = dist;
        item = p;
      }
    }
  }

  const metricDef = ALL_METRICS.find(m => m.key === item.dataKey);
  const metricLabel = metricDef?.label || item.dataKey;
  const isReturn = metricDef?.chartType === 'return';

  return (
    <div style={{
      background: C.bgCard,
      border: `1px solid ${C.border}`,
      borderRadius: 8,
      padding: '10px 14px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
      fontSize: 12,
      minWidth: 200,
    }}>
      <div style={{ fontWeight: 600, color: metricDef?.color || C.text, marginBottom: 4 }}>
        {metricLabel}
        {!isReturn && (
          <span style={{ color: C.textMuted, fontWeight: 400 }}> 3 year Average Growth Rate</span>
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
        <span style={{ color: C.textSecondary }}>{label}</span>
        <span style={{ fontWeight: 700, color: C.text }}>
          {item.value != null ? item.value.toFixed(2) + '%' : '--'}
        </span>
      </div>
    </div>
  );
}

// ─── Legend with checkboxes ─────────────────────────────────

function ChartLegend({ visibleLines, onToggle }) {
  const activeMetrics = ALL_METRICS.filter(m => visibleLines.has(m.key));
  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'flex-end', minHeight: 18 }}>
      {activeMetrics.map(m => (
        <label
          key={m.key}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            fontSize: 10, color: C.textSecondary, cursor: 'pointer',
            userSelect: 'none', fontWeight: 500,
          }}
          onClick={() => onToggle(m.key)}
        >
          <span style={{
            width: 9, height: 9, borderRadius: '50%',
            background: m.color,
            border: `1.5px solid ${m.color}`,
            display: 'inline-block',
          }} />
          {m.label}
        </label>
      ))}
    </div>
  );
}

// ─── Weighted Average panel ─────────────────────────────────

function WeightedAvgPanel({ weightedAvgs, compositeGR, analystGR, onSaveComposite, compositeMetrics, onToggleCompositeMetric }) {
  return (
    <div style={{
      background: C.bgCard,
      border: `1px solid ${C.border}`,
      borderRadius: 8,
      padding: '14px 16px',
      minWidth: 220,
      boxShadow: `0 1px 3px ${C.shadow}`,
    }}>
      <div style={{
        fontSize: 12, fontWeight: 700, color: C.text,
        marginBottom: 12, letterSpacing: '0.02em',
      }}>
        Weighted Average Growth Rates
      </div>

      {GROWTH_METRICS.filter(m => compositeMetrics.has(m.key)).map(m => (
        <div key={m.key} style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '5px 0',
          borderBottom: `1px solid ${C.borderLight}`,
        }}>
          <span
            style={{
              display: 'flex', alignItems: 'center', gap: 6, fontSize: 11,
              color: C.textSecondary, cursor: 'pointer', userSelect: 'none',
            }}
            onClick={() => onToggleCompositeMetric(m.key)}
            title="Click to remove from composite"
          >
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: m.color,
              border: `1.5px solid ${m.color}`,
              display: 'inline-block',
            }} />
            {m.label}
          </span>
          <span style={{
            fontSize: 12, fontWeight: 600,
            fontVariantNumeric: 'tabular-nums',
            color: weightedAvgs[m.key] != null
              ? (weightedAvgs[m.key] >= 0 ? C.text : C.red)
              : C.textMuted,
          }}>
            {fmtGrowthRate(weightedAvgs[m.key])}
          </span>
        </div>
      ))}

      {/* Composite Growth Rate */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '8px 0 4px',
        marginTop: 4,
      }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: C.text }}>
          Composite Growth Rate
        </span>
        <span style={{
          fontSize: 13, fontWeight: 700,
          fontVariantNumeric: 'tabular-nums',
          color: C.accent,
        }}>
          {fmtGrowthRate(compositeGR)}
        </span>
      </div>

      {/* Analyst GR */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '4px 0 8px',
        borderBottom: `1px solid ${C.borderLight}`,
      }}>
        <span style={{ fontSize: 11, color: C.textSecondary }}>
          Analyst Estimated Long-Term GR
        </span>
        <span style={{
          fontSize: 12, fontWeight: 600,
          fontVariantNumeric: 'tabular-nums',
          color: analystGR ? C.text : C.textMuted,
        }}>
          {analystGR || '--'}
        </span>
      </div>

      {/* Save Composite button */}
      <button
        onClick={onSaveComposite}
        style={{
          marginTop: 12,
          width: '100%',
          padding: '8px 12px',
          fontSize: 11,
          fontWeight: 600,
          color: '#fff',
          background: C.accent,
          border: 'none',
          borderRadius: 6,
          cursor: 'pointer',
          fontFamily: 'inherit',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        Save Composite Growth Rate
      </button>
    </div>
  );
}

// ─── Data table ─────────────────────────────────────────────

function GrowthDataTable({ tableData, years, visibleLines, onToggle, excludedDataPoints, onToggleDataPoint, onClearExcludedDataPoints }) {
  const [newestFirst, setNewestFirst] = useState(false);
  const [hover, setHover] = useState({ row: null, col: null });
  const orderedYears = newestFirst ? years : [...years].reverse();

  const handleMouseMove = useCallback((e) => {
    const cell = e.target.closest('td, th');
    if (!cell) return;
    const row = cell.dataset.row ?? null;
    const col = cell.dataset.col ?? null;
    if (row == null && col == null) return;
    setHover(prev => (prev.row === row && prev.col === col) ? prev : { row, col });
  }, []);

  const handleMouseLeave = useCallback(() => {
    setHover({ row: null, col: null });
  }, []);

  const thStyle = {
    fontSize: 11,
    fontWeight: 600,
    color: C.textSecondary,
    padding: '8px 6px',
    textAlign: 'right',
    whiteSpace: 'nowrap',
    borderBottom: `2px solid ${C.border}`,
    position: 'sticky',
    top: 0,
    background: C.bgCard,
    zIndex: 1,
  };

  return (
    <div style={{
      background: C.bgCard,
      border: `1px solid ${C.border}`,
      borderRadius: 8,
      overflow: 'hidden',
      boxShadow: `0 1px 3px ${C.shadow}`,
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '10px 14px',
        borderBottom: `1px solid ${C.border}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.accent }}>
            Growth Metrics
          </div>
          {excludedDataPoints?.size > 0 && (
            <button
              onClick={onClearExcludedDataPoints}
              title="Clear all excluded data points"
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '2px 7px', fontSize: 10, fontWeight: 500,
                color: '#dc2626', background: 'rgba(220,38,38,0.08)',
                border: `1px solid rgba(220,38,38,0.2)`, borderRadius: 4,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
              {excludedDataPoints.size} excluded
            </button>
          )}
        </div>
        <button
          onClick={() => setNewestFirst(p => !p)}
          title={newestFirst ? 'Show oldest first' : 'Show newest first'}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '3px 8px', fontSize: 10, fontWeight: 500,
            color: C.textSecondary, background: 'transparent',
            border: `1px solid ${C.border}`, borderRadius: 5,
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points={newestFirst ? '15 18 9 12 15 6' : '9 18 15 12 9 6'} />
            <line x1={newestFirst ? '20' : '4'} y1="12" x2={newestFirst ? '4' : '20'} y2="12" />
          </svg>
          {newestFirst ? 'Newest → Oldest' : 'Oldest → Newest'}
        </button>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table
          style={{ width: '100%', borderCollapse: 'collapse', minWidth: orderedYears.length * 72 + 180 }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <thead>
            <tr>
              <th style={{ ...thStyle, textAlign: 'left', position: 'sticky', left: 0, background: C.bgCard, zIndex: 2, minWidth: 170 }}>
              </th>
              {orderedYears.map(y => {
                const colId = String(y);
                return (
                  <th key={y} data-col={colId} style={{
                    ...thStyle,
                    boxShadow: hover.col === colId ? `inset 0 0 0 1000px ${C.accent}0c` : undefined,
                  }}>{y}</th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {ALL_METRICS.map(row => {
              const isActive = visibleLines.has(row.key);
              const rowId = row.key;

              return (
                <tr key={row.key} style={{ borderBottom: `1px solid ${C.borderLight}` }}>
                  <td
                    data-row={rowId}
                    style={{
                      padding: '6px 10px',
                      fontSize: 12,
                      fontWeight: 500,
                      color: C.textSecondary,
                      whiteSpace: 'nowrap',
                      position: 'sticky',
                      left: 0,
                      background: C.bgCard,
                      zIndex: 1,
                      cursor: 'pointer',
                      boxShadow: hover.row === rowId ? `inset 0 0 0 1000px ${C.accent}0c` : undefined,
                    }}
                    onClick={() => onToggle(row.key)}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: isActive ? row.color : C.border,
                        display: 'inline-block',
                        flexShrink: 0,
                        transition: 'background .15s',
                      }} />
                      {row.label}
                      {row.unit === 'millions' && !row.isReturn && (
                        <span style={{ color: C.textMuted, fontSize: 10 }}>*</span>
                      )}
                      {row.isReturn && (
                        <span style={{ color: C.textMuted, fontSize: 10 }}>**</span>
                      )}
                    </span>
                  </td>
                  {orderedYears.map(y => {
                    const val = tableData[row.key]?.[y];
                    const colId = String(y);
                    const pointKey = `${row.key}:${y}`;
                    const isExcluded = excludedDataPoints?.has(pointKey);
                    const isRow = hover.row === rowId;
                    const isCol = hover.col === colId;
                    const shadow = isExcluded
                      ? `inset 0 0 0 1000px rgba(220,38,38,0.06)`
                      : (isRow && isCol)
                        ? `inset 0 0 0 1000px ${C.accent}18`
                        : (isRow || isCol)
                          ? `inset 0 0 0 1000px ${C.accent}0c`
                          : undefined;
                    let formatted;
                    if (row.unit === 'millions') {
                      formatted = fmtMillions(val);
                    } else if (row.unit === 'percent') {
                      formatted = fmtPercent(val);
                    } else {
                      formatted = val != null ? val.toLocaleString() : '';
                    }
                    const hasValue = val != null;

                    return (
                      <td
                        key={y}
                        data-row={rowId}
                        data-col={colId}
                        onClick={hasValue ? () => onToggleDataPoint(pointKey) : undefined}
                        title={hasValue ? (isExcluded ? 'Click to include this data point' : 'Click to exclude this data point') : undefined}
                        style={{
                          padding: '6px 6px',
                          fontSize: 11,
                          fontVariantNumeric: 'tabular-nums',
                          textAlign: 'right',
                          color: isExcluded ? '#dc2626' : C.text,
                          fontWeight: 500,
                          boxShadow: shadow,
                          cursor: hasValue ? 'pointer' : undefined,
                          textDecoration: isExcluded ? 'line-through' : undefined,
                          opacity: isExcluded ? 0.5 : undefined,
                        }}
                      >
                        {formatted}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ padding: '8px 14px', borderTop: `1px solid ${C.borderLight}` }}>
        <div style={{ fontSize: 10, color: C.textMuted }}>
          * In Millions
        </div>
        <div style={{ fontSize: 10, color: C.textMuted }}>
          ** Year over year growth is not calculated on Return Rate metrics
        </div>
        <div style={{ fontSize: 10, color: C.textMuted }}>
          Click any data cell to exclude it from growth rate calculations
        </div>
      </div>
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────

export default function GrowthRateAnalysis({
  edgarStatements,
  allPrices,
  returns,
  analystGR,
  weightedAvgs,
  compositeGR,
  compositeMetrics,
  excludedDataPoints,
  onToggleDataPoint,
  onClearExcludedDataPoints,
  onToggleCompositeMetric,
  onSaveComposite,
}) {
  // Line visibility toggles — growth metrics sync with compositeMetrics,
  // return metrics (ROE/ROIC/ROA) are chart-only
  const [returnLines, setReturnLines] = useState(() => new Set());
  const mouseYRef = useRef(null);

  // Visible lines = compositeMetrics (growth) + returnLines (return-only)
  const visibleLines = useMemo(() => {
    const s = new Set(compositeMetrics);
    for (const k of returnLines) s.add(k);
    return s;
  }, [compositeMetrics, returnLines]);

  const toggleLine = (key) => {
    const metric = ALL_METRICS.find(m => m.key === key);
    if (metric?.isReturn) {
      // Return metrics are chart-only, don't affect composite
      setReturnLines(prev => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    } else {
      // Growth metrics toggle both chart line and composite membership
      onToggleCompositeMetric(key);
    }
  };

  // Build all series from EDGAR data
  const analysisSeries = useMemo(() => {
    if (!edgarStatements) return null;
    return buildGrowthAnalysisSeries(edgarStatements);
  }, [edgarStatements]);

  // Build market cap series (shares × year-end price)
  const marketCapSeries = useMemo(() => {
    if (!edgarStatements || !allPrices?.length) return [];
    const { years, balance, fiscalMonths } = edgarStatements;
    const sortedYears = [...years].sort((a, b) => a - b);
    const result = [];
    for (const y of sortedYears) {
      const shares = balance[y]?.shares_outstanding;
      if (!shares) continue;
      const fyEndMonth = fiscalMonths?.[y];
      const monthIdx = fyEndMonth ? (MONTH_INDEX[fyEndMonth] ?? 11) : 11;
      const endDate = `${y}-${String(monthIdx + 1).padStart(2, '0')}-31`;
      const startDate = `${y}-${String(monthIdx + 1).padStart(2, '0')}-01`;
      const candidates = allPrices.filter(p => p.date >= startDate && p.date <= endDate);
      const closePrice = candidates.length > 0
        ? candidates[candidates.length - 1].adjustedClose ?? candidates[candidates.length - 1].close
        : null;
      if (closePrice != null) {
        result.push({ year: y, value: shares * closePrice });
      }
    }
    return result;
  }, [edgarStatements, allPrices]);

  // Compute 3-year smoothed rates for all growth-type metrics
  const smoothedRates = useMemo(() => {
    if (!analysisSeries) return {};
    const result = {};
    for (const m of ALL_METRICS) {
      if (m.chartType !== 'growth') continue;
      let series = m.key === 'marketCap' ? [...marketCapSeries] : [...(analysisSeries[m.key] || [])];
      // Filter out individually excluded data points
      if (excludedDataPoints?.size > 0) {
        series = series.filter(d => !excludedDataPoints.has(`${m.key}:${d.year}`));
      }
      result[m.key] = compute3YearSmoothedRates(series);
    }
    return result;
  }, [analysisSeries, marketCapSeries, excludedDataPoints]);

  // Build chart data: growth rates for dollar metrics, raw values for return metrics
  // Limited to 10 most recent years
  const chartData = useMemo(() => {
    const yearSet = new Set();
    for (const m of ALL_METRICS) {
      if (m.chartType === 'growth') {
        for (const d of (smoothedRates[m.key] || [])) yearSet.add(d.year);
      }
    }
    if (returns?.yearly) {
      for (const d of returns.yearly) yearSet.add(d.year);
    }

    const allYears = [...yearSet].sort((a, b) => a - b);
    const years = allYears.slice(-10);

    // Lookup maps for growth metrics
    const growthLookups = {};
    for (const m of ALL_METRICS) {
      if (m.chartType === 'growth') {
        growthLookups[m.key] = new Map((smoothedRates[m.key] || []).map(d => [d.year, d.rate]));
      }
    }

    // Lookup map for return metrics
    const returnLookup = {};
    if (returns?.yearly) {
      for (const d of returns.yearly) returnLookup[d.year] = d;
    }

    return years.map(year => {
      const row = { year };
      for (const m of ALL_METRICS) {
        if (m.chartType === 'growth') {
          const rate = growthLookups[m.key]?.get(year);
          row[m.key] = rate != null ? rate * 100 : null;
        } else if (m.chartType === 'return') {
          // Skip excluded return data points on the chart
          if (excludedDataPoints?.has(`${m.key}:${year}`)) {
            row[m.key] = null;
          } else {
            const val = returnLookup[year]?.[m.key];
            row[m.key] = val != null ? val * 100 : null;
          }
        }
      }
      return row;
    });
  }, [smoothedRates, returns, excludedDataPoints]);

  // Y-axis domain for tooltip proximity detection
  const yDomain = useMemo(() => {
    let min = Infinity, max = -Infinity;
    for (const row of chartData) {
      for (const m of ALL_METRICS) {
        if (visibleLines.has(m.key) && row[m.key] != null) {
          min = Math.min(min, row[m.key]);
          max = Math.max(max, row[m.key]);
        }
      }
    }
    return [min === Infinity ? 0 : min, max === -Infinity ? 0 : max];
  }, [chartData, visibleLines]);

  // Build data table values (year → value per row key)
  const tableData = useMemo(() => {
    if (!analysisSeries || !edgarStatements) return {};
    const result = {};

    // Dollar series from analysisSeries
    for (const key of ['bookValue', 'bvPlusDiv', 'earnings', 'pretaxEarnings', 'operatingCash', 'revenue', 'fcf', 'retainedEarnings']) {
      const map = {};
      for (const d of (analysisSeries[key] || [])) {
        map[d.year] = d.value;
      }
      result[key] = map;
    }

    // Market Cap from marketCapSeries
    const mcMap = {};
    for (const d of marketCapSeries) mcMap[d.year] = d.value;
    result.marketCap = mcMap;

    // Return metrics from returns.yearly
    const roeMap = {}, roicMap = {}, roaMap = {};
    if (returns?.yearly) {
      for (const d of returns.yearly) {
        if (d.roe != null) roeMap[d.year] = d.roe;
        if (d.roic != null) roicMap[d.year] = d.roic;
        if (d.roa != null) roaMap[d.year] = d.roa;
      }
    }
    result.roe = roeMap;
    result.roic = roicMap;
    result.roa = roaMap;

    return result;
  }, [analysisSeries, edgarStatements, marketCapSeries, returns]);

  // Visible years for the data table — fixed at 13 years to match Toolbox
  const tableYears = useMemo(() => {
    if (!edgarStatements) return [];
    const sortedYears = [...edgarStatements.years].sort((a, b) => b - a);
    return sortedYears.slice(0, 13);
  }, [edgarStatements]);

  if (!edgarStatements) return null;

  return (
    <div>
      {/* Title + description */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 4 }}>
          Growth Rates Analysis
        </div>
        <div style={{ fontSize: 12, color: C.textMuted }}>
          Add and remove trendlines from the graph below to analyze the 3 year smoothed growth rates for each metric.
        </div>
      </div>

      {/* Chart + Weighted Average panel */}
      <div style={{
        display: 'flex',
        gap: 16,
        marginBottom: 24,
        alignItems: 'flex-start',
      }}>
        {/* Chart area */}
        <div style={{
          flex: 1,
          background: C.bgCard,
          border: `1px solid ${C.border}`,
          borderRadius: 8,
          padding: '16px 16px 8px',
          boxShadow: `0 1px 3px ${C.shadow}`,
        }}>
          {/* Custom legend above chart */}
          <ChartLegend visibleLines={visibleLines} onToggle={toggleLine} />

          <div
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              mouseYRef.current = e.clientY - rect.top;
            }}
            onMouseLeave={() => { mouseYRef.current = null; }}
          >
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData} margin={{ top: 16, right: 16, bottom: 4, left: 8 }}>
                <XAxis
                  dataKey="year"
                  tick={{ fontSize: 11, fill: C.textMuted }}
                  tickLine={false}
                  axisLine={{ stroke: C.border }}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: C.textMuted }}
                  tickLine={false}
                  axisLine={false}
                  width={50}
                  tickFormatter={v => v.toFixed(0) + '%'}
                  domain={['auto', 'auto']}
                />
                <ReferenceLine y={0} stroke={C.border} strokeDasharray="3 3" />
                <Tooltip content={<CustomTooltip mouseYRef={mouseYRef} yDomain={yDomain} />} />
                {ALL_METRICS.map(m => (
                  visibleLines.has(m.key) && (
                    <Line
                      key={m.key}
                      type="monotone"
                      dataKey={m.key}
                      stroke={m.color}
                      strokeWidth={2.5}
                      dot={{ r: 4, fill: m.color, strokeWidth: 0 }}
                      activeDot={{ r: 6, fill: m.color, strokeWidth: 2, stroke: '#fff' }}
                      connectNulls
                    />
                  )
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Weighted Average panel */}
        <WeightedAvgPanel
          weightedAvgs={weightedAvgs}
          compositeGR={compositeGR}
          analystGR={analystGR}
          onSaveComposite={onSaveComposite}
          compositeMetrics={compositeMetrics}
          onToggleCompositeMetric={onToggleCompositeMetric}
        />
      </div>

      {/* Data table */}
      <GrowthDataTable
        tableData={tableData}
        years={tableYears}
        visibleLines={visibleLines}
        onToggle={toggleLine}
        excludedDataPoints={excludedDataPoints}
        onToggleDataPoint={onToggleDataPoint}
        onClearExcludedDataPoints={onClearExcludedDataPoints}
      />
    </div>
  );
}
