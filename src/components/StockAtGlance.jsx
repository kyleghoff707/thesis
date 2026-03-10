import { useState, useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { C } from '../theme';

const RANGES = ['1y', '3y', '5y', '10y', 'max'];

function fmtM(n) {
  if (n == null) return '-';
  return Number((n / 1e6).toFixed(2)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDollar(n, decimals = 2) {
  if (n == null) return '-';
  return '$' + Number(n.toFixed(decimals)).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function pct(n) {
  if (n == null) return '-';
  return (n * 100).toFixed(2) + '%';
}

function MetricRow({ label, value }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      padding: '5px 0',
      borderBottom: `1px solid ${C.borderLight}`,
      fontSize: 13,
    }}>
      <span style={{ color: C.textSecondary }}>{label}</span>
      <span style={{ fontWeight: 600, color: C.text, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  );
}

export default function StockAtGlance({
  company, edgarStatements, prices, latest, onRangeChange, range = '5y',
  returns, debt, fcfResult,
}) {
  const [selectedRange, setSelectedRange] = useState(range);

  const handleRange = (r) => {
    setSelectedRange(r);
    if (onRangeChange) onRangeChange(r);
  };

  // All data from EDGAR (single source of truth)
  const stmts = edgarStatements;
  const latestYear = stmts?.years?.[0];
  const inc = latestYear ? stmts.income[latestYear] : {};
  const bal = latestYear ? stmts.balance[latestYear] : {};
  const cf = latestYear ? stmts.cashFlow[latestYear] : {};

  // TTM data from EDGAR
  const ttm = stmts?.ttm;
  const ttmInc = ttm?.income || {};
  const ttmEPS = ttmInc.diluted_earnings_per_share ?? ttmInc.basic_earnings_per_share;

  // 52-week high/low from price data
  const { week52High, week52Low } = useMemo(() => {
    if (!prices || prices.length === 0) return { week52High: null, week52Low: null };
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const isoDate = oneYearAgo.toISOString().slice(0, 10);
    const recentPrices = prices.filter(p => p.date >= isoDate);
    const data = recentPrices.length > 0 ? recentPrices : prices;
    let high = -Infinity, low = Infinity;
    for (const p of data) {
      const h = p.high ?? p.adjustedClose ?? p.close;
      const l = p.low ?? p.adjustedClose ?? p.close;
      if (h > high) high = h;
      if (l < low) low = l;
    }
    return { week52High: high === -Infinity ? null : high, week52Low: low === Infinity ? null : low };
  }, [prices]);

  // Current P/E
  const currentPrice = latest?.price;
  const peRatio = currentPrice && ttmEPS && ttmEPS > 0 ? currentPrice / ttmEPS : null;

  // FCF ratio (FCF / Net Income) from latest year
  const latestFCF = fcfResult?.yearly?.find(d => d.year === latestYear);
  const fcfRatio = latestFCF?.fcf != null && inc.net_income_loss && inc.net_income_loss > 0
    ? latestFCF.fcf / inc.net_income_loss : null;

  // Return metrics — latest 1yr averages (now from EDGAR)
  const latestReturns = returns?.averages?.['1yr'];

  // Shares outstanding from EDGAR balance sheet (EOP), fallback to weighted average
  const sharesOut = bal.shares_outstanding ?? inc.basic_average_shares;

  // Market cap computed from shares × current price
  const marketCap = (sharesOut && currentPrice) ? sharesOut * currentPrice : null;

  // Buybacks per share from EDGAR cash flow (share repurchases / shares outstanding)
  const repurchases = Math.abs(cf.share_repurchases ?? 0);
  const buybacksPerShare = (repurchases > 0 && sharesOut && sharesOut > 0)
    ? repurchases / sharesOut : null;

  // LT Debt from EDGAR
  const ltDebt = bal.long_term_debt ?? 0;

  // Chart data
  const chartData = (prices || []).map(p => ({
    date: p.date,
    price: p.adjustedClose ?? p.close,
  }));

  return (
    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
      {/* Left: Two-column metrics table matching Toolbox layout */}
      <div style={{ flex: '1 1 500px', minWidth: 400 }}>
        <div style={{ display: 'flex', gap: 40 }}>
          {/* Column 1 */}
          <div style={{ flex: 1 }}>
            <MetricRow label="52-week High" value={fmtDollar(week52High)} />
            <MetricRow label="Current PE Ratio" value={peRatio != null ? peRatio.toFixed(2) : '-'} />
            <MetricRow label="Shares Outstanding*" value={sharesOut != null ? fmtM(sharesOut) : '-'} />
            <MetricRow label="Revenue*" value={inc.revenues != null ? '$' + fmtM(inc.revenues) : '-'} />
            <MetricRow label="FCF Ratio" value={fcfRatio != null ? fcfRatio.toFixed(2) : '-'} />
            <MetricRow label="Return on Inv Cap (ROIC)" value={pct(latestReturns?.roic)} />
            <MetricRow label="LT Debt to Earnings" value={
              inc.net_income_loss && inc.net_income_loss > 0
                ? (ltDebt / inc.net_income_loss).toFixed(1)
                : ltDebt === 0 ? '0' : '-'
            } />
            <MetricRow label="Net Debt to Earnings" value={
              debt?.isNetCash ? '0.0' : (debt?.netDebtToEarnings != null ? debt.netDebtToEarnings.toFixed(1) : '-')
            } />
          </div>

          {/* Column 2 */}
          <div style={{ flex: 1 }}>
            <MetricRow label="52-week Low" value={fmtDollar(week52Low)} />
            <MetricRow label="Market Cap*" value={marketCap != null ? '$' + fmtM(marketCap) : '-'} />
            <MetricRow label="Buybacks per Share" value={fmtDollar(buybacksPerShare)} />
            <MetricRow label="EPS TTM" value={fmtDollar(ttmEPS)} />
            <MetricRow label="Return on Equity (ROE)" value={pct(latestReturns?.roe)} />
            <MetricRow label="Return on Assets (ROA)" value={pct(latestReturns?.roa)} />
            <MetricRow label="LT Debt to FCF" value={
              latestFCF?.fcf && latestFCF.fcf > 0
                ? (ltDebt / latestFCF.fcf).toFixed(1)
                : ltDebt === 0 ? '0' : '-'
            } />
            <MetricRow label="Net Debt to FCF" value={
              debt?.isNetCash ? '0.0' : (debt?.netDebtToFCF != null ? debt.netDebtToFCF.toFixed(1) : '-')
            } />
          </div>
        </div>

        <div style={{ marginTop: 8, fontSize: 11, color: C.textMuted, display: 'flex', justifyContent: 'space-between' }}>
          <span>Updated: {new Date().toLocaleDateString()}</span>
          <span>* in millions</span>
        </div>
      </div>

      {/* Right: Price chart */}
      <div style={{ flex: '1 1 350px', minWidth: 300 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.textSecondary, marginBottom: 4 }}>
          {company?.ticker || ''} Price Chart
        </div>

        {/* Range selector */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
          {RANGES.map(r => (
            <button
              key={r}
              onClick={() => handleRange(r)}
              style={{
                padding: '4px 10px',
                fontSize: 11,
                fontWeight: 600,
                background: selectedRange === r ? C.accent : 'transparent',
                color: selectedRange === r ? '#fff' : C.textSecondary,
                border: `1px solid ${selectedRange === r ? C.accent : C.border}`,
                borderRadius: 4,
                cursor: 'pointer',
                textTransform: 'uppercase',
              }}
            >
              {r}
            </button>
          ))}
        </div>

        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={C.accent} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={C.accent} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: C.textMuted }}
                tickLine={false}
                axisLine={{ stroke: C.border }}
                tickFormatter={d => {
                  const parts = d.split('-');
                  return parts[1] + '/' + parts[0].slice(2);
                }}
                minTickGap={60}
              />
              <YAxis
                tick={{ fontSize: 10, fill: C.textMuted }}
                tickLine={false}
                axisLine={false}
                domain={['auto', 'auto']}
                tickFormatter={v => '$' + v.toFixed(0)}
                width={55}
              />
              <Tooltip
                contentStyle={{
                  background: C.bgCard,
                  border: `1px solid ${C.border}`,
                  borderRadius: 6,
                  fontSize: 12,
                  color: C.text,
                }}
                formatter={v => ['$' + v.toFixed(2), 'Price']}
                labelFormatter={l => l}
              />
              <Area
                type="monotone"
                dataKey="price"
                stroke={C.accent}
                strokeWidth={1.5}
                fill="url(#priceGrad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textMuted, fontSize: 13 }}>
            Loading price data...
          </div>
        )}
      </div>
    </div>
  );
}
