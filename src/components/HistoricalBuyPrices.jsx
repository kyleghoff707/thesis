import { useMemo, useState } from 'react';
import { C } from '../theme';
import {
  ComposedChart, Area, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts';
import {
  computeMOS, computePBT, computeTenCap, computeEquityBond,
  suggestFuturePE, estimateMaintenanceCapEx,
} from '../engines/valuation';
import { compute3YearSmoothedRates, computeWeightedAvgGrowthRate } from '../engines/growthRates';

// ─── Constants ────────────────────────────────────────────

const MONTH_MAP = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

const METHODS = [
  { key: 'mosPrice', label: 'MOS', color: '#16a34a' },
  { key: 'pbtPrice', label: 'PBT', color: '#ea580c' },
  { key: 'tenCapPrice', label: 'Ten Cap', color: '#0f766e' },
  { key: 'ebPrice', label: 'Equity Bond', color: '#7c3aed' },
];

// ─── Computation helpers ──────────────────────────────────

function computeRollingCompositeGR(analysisSeries, compositeMetrics, asOfYear) {
  if (!analysisSeries) return null;
  const rates = [];
  for (const key of compositeMetrics) {
    const series = analysisSeries[key];
    if (!series) continue;
    const truncated = series.filter(d => d.year <= asOfYear);
    if (truncated.length < 4) continue;
    const smoothed = compute3YearSmoothedRates(truncated);
    const weightedAvg = computeWeightedAvgGrowthRate(smoothed);
    if (weightedAvg != null && isFinite(weightedAvg)) rates.push(weightedAvg);
  }
  if (rates.length === 0) return null;
  return rates.reduce((a, b) => a + b, 0) / rates.length;
}

function getMaxHighPE(historicalPE, asOfYear) {
  let max = null;
  for (const [y, pe] of Object.entries(historicalPE)) {
    if (Number(y) <= asOfYear && pe != null && pe > 0 && isFinite(pe)) {
      if (max === null || pe > max) max = pe;
    }
  }
  return max;
}

function getAvgHighPE(historicalPE, asOfYear) {
  const vals = [];
  for (const [y, pe] of Object.entries(historicalPE)) {
    if (Number(y) <= asOfYear && pe != null && pe > 0 && isFinite(pe)) vals.push(pe);
  }
  return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

function trailing(sortedYears, year, n, getter) {
  const vals = [];
  for (let i = 0; i < n; i++) {
    const y = year - i;
    if (sortedYears.includes(y)) {
      const v = getter(y);
      if (v != null && isFinite(v)) vals.push(v);
    }
  }
  return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

function yearFCFRatio(income, cashFlow, y) {
  const ni = income[y]?.net_income_loss;
  const cf = cashFlow[y] || {};
  const fcf = cf.free_cash_flow ?? (
    cf.net_cash_flow_from_operating_activities != null && cf.capital_expenditures != null
      ? cf.net_cash_flow_from_operating_activities - Math.abs(cf.capital_expenditures)
      : null
  );
  return (ni && ni > 0 && fcf != null) ? fcf / ni : null;
}

function getBVPS(balance, year) {
  const eq = balance[year]?.equity_attributable_to_parent ?? balance[year]?.equity;
  const sh = balance[year]?.shares_outstanding;
  return (eq != null && sh > 0) ? eq / sh : null;
}

function getRetainedRatio(income, year) {
  const eps = income[year]?.diluted_earnings_per_share;
  const dps = income[year]?.dividends_per_share ?? 0;
  return (eps > 0) ? Math.max(0, Math.min(1, 1 - Math.abs(dps) / eps)) : null;
}

function trailingROE(returns, year, n) {
  if (!returns?.yearly) return null;
  const vals = [];
  for (let i = 0; i < n; i++) {
    const entry = returns.yearly.find(r => r.year === year - i);
    if (entry?.roe != null && isFinite(entry.roe) && entry.roe > 0) vals.push(entry.roe);
  }
  return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

// ─── Formatters ───────────────────────────────────────────

function fmtDollar(n) {
  if (n == null || isNaN(n)) return '--';
  return '$' + Number(n.toFixed(2)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPct(n) {
  if (n == null || isNaN(n)) return '--';
  return (n * 100).toFixed(1) + '%';
}

// ─── Component ────────────────────────────────────────────

export default function HistoricalBuyPrices({
  edgarStatements,
  allPrices,
  returns,
  historicalPE,
  historicalAvgPE,
  analysisSeries,
  compositeMetrics,
  maintenancePct = 0.70,
  marr = 0.15,
  pbtYears = 8,
}) {
  const [mode, setMode] = useState('trailing3');
  const [enabledMethods, setEnabledMethods] = useState(() => new Set(METHODS.map(m => m.key)));
  const [showTable, setShowTable] = useState(false);

  const toggleMethod = (key) => {
    setEnabledMethods(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // ─── Compute historical buy prices per fiscal year ─────

  const buyPrices = useMemo(() => {
    if (!edgarStatements || !allPrices?.length || !analysisSeries) return [];

    const { years, income, balance, cashFlow, fiscalMonths } = edgarStatements;
    const sortedYears = years.filter(y => y !== 'TTM').sort((a, b) => a - b);
    const sortedPrices = [...allPrices].sort((a, b) => a.date.localeCompare(b.date));

    const results = [];

    for (const year of sortedYears) {
      // Fiscal year end date
      const fyEndMonth = MONTH_MAP[fiscalMonths?.[year]] ?? 11;
      const lastDay = new Date(year, fyEndMonth + 1, 0).getDate();
      const endDate = `${year}-${String(fyEndMonth + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

      // Year-end stock price (last trading day at or before FY end)
      let yearEndPrice = null;
      for (let i = sortedPrices.length - 1; i >= 0; i--) {
        if (sortedPrices[i].date <= endDate) {
          yearEndPrice = sortedPrices[i].adjustedClose ?? sortedPrices[i].close;
          break;
        }
      }
      if (!yearEndPrice) continue;

      // Rolling composite FGR using data available up to this year
      const fgr = computeRollingCompositeGR(analysisSeries, compositeMetrics, year);

      // Historical high PE up to this year (for MOS future PE cap)
      const maxHighPE = getMaxHighPE(historicalPE, year);
      // True average PE up to this year (for Equity Bond — more conservative)
      const avgPE = getAvgHighPE(historicalAvgPE || historicalPE, year);

      // --- EPS ---
      const eps = mode === 'trailing3'
        ? trailing(sortedYears, year, 3, y => income[y]?.diluted_earnings_per_share)
        : income[year]?.diluted_earnings_per_share;

      // --- FCF Ratio ---
      const fcfRatio = mode === 'trailing3'
        ? trailing(sortedYears, year, 3, y => yearFCFRatio(income, cashFlow, y))
        : yearFCFRatio(income, cashFlow, year);

      // --- Future PE ---
      const futurePE = (fgr && fgr > 0) ? suggestFuturePE(fgr, maxHighPE) : null;

      // --- MOS ---
      const mos = (eps > 0 && fgr > 0 && futurePE > 0)
        ? computeMOS({ eps, fgr, futurePE, marr }) : null;

      // --- PBT ---
      const fcfPS = (eps > 0 && fcfRatio > 0) ? eps * fcfRatio : null;
      const pbt = (fcfPS > 0 && fgr > 0)
        ? computePBT({ fcfPerShare: fcfPS, fgr, targetYears: pbtYears }) : null;

      // --- Ten Cap (always uses year's actual values) ---
      const opCF = cashFlow[year]?.net_cash_flow_from_operating_activities;
      const capEx = cashFlow[year]?.capital_expenditures;
      const tax = income[year]?.income_tax;
      const shares = balance[year]?.shares_outstanding;
      const maintCapEx = capEx != null ? estimateMaintenanceCapEx(capEx, maintenancePct) : null;
      const tenCap = (opCF != null && shares > 0)
        ? computeTenCap({ operatingCashFlow: opCF, maintenanceCapEx: maintCapEx, taxProvision: tax, sharesOutstanding: shares })
        : null;

      // --- Equity Bond ---
      // ROE: always use trailing average (inherently backward-looking)
      const roe = trailingROE(returns, year, mode === 'trailing3' ? 3 : 5);
      const bvps = mode === 'trailing3'
        ? trailing(sortedYears, year, 3, y => getBVPS(balance, y))
        : getBVPS(balance, year);
      const retainedRatio = mode === 'trailing3'
        ? trailing(sortedYears, year, 3, y => getRetainedRatio(income, y))
        : getRetainedRatio(income, year);

      const eb = (bvps > 0 && roe > 0 && retainedRatio != null && retainedRatio > 0 && avgPE > 0)
        ? computeEquityBond({ bvps, roe, retainedRatio, historicalPE: avgPE, marr })
        : null;

      results.push({
        year,
        endDate,
        price: Math.round(yearEndPrice * 100) / 100,
        mosPrice: (mos?.mosPrice > 0) ? mos.mosPrice : null,
        mosStickerPrice: (mos?.stickerPrice > 0) ? mos.stickerPrice : null,
        pbtPrice: (pbt?.pbtPrice > 0) ? pbt.pbtPrice : null,
        tenCapPrice: (tenCap?.tenCapPrice > 0) ? tenCap.tenCapPrice : null,
        ebPrice: (eb?.buyPrice > 0) ? eb.buyPrice : null,
        fgr,
        eps: eps != null ? Math.round(eps * 100) / 100 : null,
      });
    }

    return results;
  }, [edgarStatements, allPrices, returns, historicalPE, analysisSeries, compositeMetrics, maintenancePct, marr, pbtYears, mode]);

  // ─── Build chart data (merge daily prices + stepped buy prices) ─────

  const chartData = useMemo(() => {
    if (!allPrices?.length || !buyPrices.length) return [];

    const startCutoff = `${buyPrices[0].year - 1}-01-01`;
    const filtered = allPrices
      .filter(p => p.date >= startCutoff)
      .sort((a, b) => a.date.localeCompare(b.date));

    return filtered.map(p => {
      // Find most recent FY end at or before this date → those buy prices apply
      let bp = null;
      for (let i = buyPrices.length - 1; i >= 0; i--) {
        if (p.date >= buyPrices[i].endDate) {
          bp = buyPrices[i];
          break;
        }
      }

      return {
        date: p.date,
        price: p.adjustedClose ?? p.close,
        mosPrice: bp?.mosPrice ?? null,
        pbtPrice: bp?.pbtPrice ?? null,
        tenCapPrice: bp?.tenCapPrice ?? null,
        ebPrice: bp?.ebPrice ?? null,
      };
    });
  }, [allPrices, buyPrices]);

  // ─── Render ─────────────────────────────────────────────

  if (!edgarStatements || !allPrices?.length) {
    return <div style={{ padding: 20, color: C.textMuted, fontSize: 13 }}>Loading price data...</div>;
  }

  if (buyPrices.length === 0) {
    return <div style={{ padding: 20, color: C.textMuted, fontSize: 13 }}>Not enough data to compute historical valuations.</div>;
  }

  // Count years where price was in buy zone for any method
  const buyZoneYears = buyPrices.filter(bp =>
    METHODS.some(m => bp[m.key] != null && bp.price <= bp[m.key])
  ).length;

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload;
    if (!d) return null;
    return (
      <div style={{
        background: C.bgCard,
        border: `1px solid ${C.border}`,
        borderRadius: 6,
        padding: '8px 12px',
        fontSize: 11,
        boxShadow: `0 2px 8px rgba(0,0,0,0.15)`,
      }}>
        <div style={{ fontWeight: 600, marginBottom: 4, color: C.text }}>{d.date}</div>
        <div style={{ color: C.text, marginBottom: 2 }}>Price: {fmtDollar(d.price)}</div>
        {METHODS.filter(m => enabledMethods.has(m.key)).map(m => (
          d[m.key] != null && (
            <div key={m.key} style={{
              color: m.color,
              fontWeight: d.price <= d[m.key] ? 700 : 400,
            }}>
              {m.label}: {fmtDollar(d[m.key])}
              {d.price <= d[m.key] && ' ← BUY'}
            </div>
          )
        ))}
      </div>
    );
  };

  return (
    <div>
      {/* Header + controls */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
        flexWrap: 'wrap',
        gap: 12,
      }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>Price vs Value</div>
          <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>
            Historical buy prices using rolling composite growth rate
            &middot; {mode === 'trailing3' ? '3-Year Trailing Avg' : 'Single Year'} inputs
            {buyZoneYears > 0 && (
              <span style={{ color: '#16a34a', fontWeight: 600 }}>
                {' '}&middot; {buyZoneYears} year{buyZoneYears !== 1 ? 's' : ''} in buy zone
              </span>
            )}
          </div>
        </div>

        {/* Mode toggle */}
        <div style={{ display: 'flex', gap: 0, border: `1px solid ${C.border}`, borderRadius: 6, overflow: 'hidden' }}>
          {[
            { key: 'single', label: 'Single Year' },
            { key: 'trailing3', label: '3-Yr Trailing' },
          ].map(opt => (
            <button
              key={opt.key}
              onClick={() => setMode(opt.key)}
              style={{
                padding: '5px 14px',
                fontSize: 11,
                fontWeight: mode === opt.key ? 600 : 400,
                color: mode === opt.key ? '#fff' : C.textSecondary,
                background: mode === opt.key ? C.accent : 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'all .15s',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Method toggles */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        {METHODS.map(m => {
          const active = enabledMethods.has(m.key);
          return (
            <label key={m.key} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12 }}>
              <input
                type="checkbox"
                checked={active}
                onChange={() => toggleMethod(m.key)}
                style={{ accentColor: m.color }}
              />
              <span style={{
                color: active ? m.color : C.textMuted,
                fontWeight: active ? 600 : 400,
                transition: 'color .15s',
              }}>
                {m.label}
              </span>
            </label>
          );
        })}
      </div>

      {/* Chart */}
      <div style={{
        background: C.bgCard,
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        padding: '16px 8px 8px',
        marginBottom: 16,
        boxShadow: `0 1px 3px rgba(0,0,0,0.04)`,
      }}>
        <ResponsiveContainer width="100%" height={400}>
          <ComposedChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
            <defs>
              <linearGradient id="histPriceGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={C.borderLight} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: C.textMuted }}
              tickFormatter={(d) => d?.slice(0, 4)}
              interval="preserveStartEnd"
              minTickGap={60}
            />
            <YAxis
              tick={{ fontSize: 10, fill: C.textMuted }}
              tickFormatter={(v) => `$${Math.round(v)}`}
              width={65}
              domain={['auto', 'auto']}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="price"
              stroke="#6366f1"
              strokeWidth={1.5}
              fill="url(#histPriceGrad)"
              dot={false}
              isAnimationActive={false}
              name="Price"
            />
            {METHODS.filter(m => enabledMethods.has(m.key)).map(m => (
              <Line
                key={m.key}
                type="stepAfter"
                dataKey={m.key}
                stroke={m.color}
                strokeWidth={2}
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
                strokeDasharray={m.key === 'ebPrice' ? '6 3' : undefined}
                name={m.label}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Data table toggle */}
      <button
        onClick={() => setShowTable(p => !p)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 12px',
          fontSize: 12,
          fontWeight: 500,
          color: C.textSecondary,
          background: 'transparent',
          border: `1px solid ${C.border}`,
          borderRadius: 6,
          cursor: 'pointer',
          fontFamily: 'inherit',
          marginBottom: showTable ? 12 : 0,
        }}
      >
        <span style={{ fontSize: 10 }}>{showTable ? '▼' : '▶'}</span>
        {showTable ? 'Hide' : 'Show'} Data Table
      </button>

      {/* Data table */}
      {showTable && (
        <div style={{
          background: C.bgCard,
          border: `1px solid ${C.border}`,
          borderRadius: 8,
          overflow: 'hidden',
          boxShadow: `0 1px 3px rgba(0,0,0,0.04)`,
        }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
              <thead>
                <tr>
                  {['Year', 'Price', 'FGR', 'EPS', 'MOS', 'PBT', 'Ten Cap', 'Equity Bond'].map(h => (
                    <th key={h} style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: h === 'Year' ? C.text : C.textSecondary,
                      padding: '8px 10px',
                      textAlign: h === 'Year' ? 'left' : 'right',
                      borderBottom: `2px solid ${C.border}`,
                      whiteSpace: 'nowrap',
                      background: C.bgCard,
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...buyPrices].reverse().map(bp => {
                  const inBuyZone = (key) => bp[key] != null && bp[key] > 0 && bp.price <= bp[key];
                  const cellBase = {
                    fontSize: 12,
                    padding: '6px 10px',
                    textAlign: 'right',
                    fontVariantNumeric: 'tabular-nums',
                    borderBottom: `1px solid ${C.borderLight}`,
                  };
                  return (
                    <tr key={bp.year}>
                      <td style={{ ...cellBase, textAlign: 'left', fontWeight: 600, color: C.text }}>{bp.year}</td>
                      <td style={{ ...cellBase, color: C.text, fontWeight: 500 }}>{fmtDollar(bp.price)}</td>
                      <td style={{ ...cellBase, color: C.textSecondary }}>{fmtPct(bp.fgr)}</td>
                      <td style={{ ...cellBase, color: C.textSecondary }}>{fmtDollar(bp.eps)}</td>
                      {['mosPrice', 'pbtPrice', 'tenCapPrice', 'ebPrice'].map(key => (
                        <td key={key} style={{
                          ...cellBase,
                          fontWeight: 500,
                          color: inBuyZone(key) ? '#16a34a' : C.text,
                          background: inBuyZone(key) ? 'rgba(22,163,74,0.08)' : 'transparent',
                        }}>
                          {fmtDollar(bp[key])}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
