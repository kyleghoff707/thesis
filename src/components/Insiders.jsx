import { useState, useMemo } from 'react';
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { C } from '../theme';
import { useInsiders } from '../hooks/useInsiders';
import { usePrices } from '../hooks/usePrices';

// ─── Format helpers ─────────────────────────────────────────

function fmtShares(val) {
  if (val == null || isNaN(val)) return '--';
  const abs = Math.abs(val);
  const sign = val < 0 ? '-' : '';
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(0)}K`;
  return val.toLocaleString();
}

function fmtValue(val) {
  if (val == null || isNaN(val)) return '--';
  const abs = Math.abs(val);
  const sign = val < 0 ? '-' : '';
  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}K`;
  return `${sign}$${abs.toLocaleString()}`;
}

function fmtDate(dateStr) {
  if (!dateStr) return '--';
  const [y, m, d] = dateStr.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[parseInt(m) - 1]} ${parseInt(d)}, ${y}`;
}

function fmtMonthLabel(monthStr) {
  if (!monthStr) return '';
  const [y, m] = monthStr.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[parseInt(m) - 1]} ${y}`;
}

// ─── Filter options ─────────────────────────────────────────

const TYPE_FILTERS = [
  { value: 'all', label: 'All Transactions' },
  { value: 'openMarket', label: 'Open Market Only' },
  { value: 'purchases', label: 'Purchases' },
  { value: 'sales', label: 'Sales' },
  { value: 'exercises', label: 'Awards / Exercises' },
];

const TRADE_TYPE_COLORS = {
  Purchase: '#16a34a',
  Sale: '#dc2626',
  Award: '#94a3b8',
  Exercise: '#94a3b8',
  'Tax Withholding': '#94a3b8',
  Gift: '#94a3b8',
  Conversion: '#94a3b8',
};

// ─── Sort helpers ───────────────────────────────────────────

function getSortValue(txn, key, currentPrice) {
  switch (key) {
    case 'transactionDate': return txn.transactionDate;
    case 'ownerName': return txn.ownerName.toLowerCase();
    case 'officerTitle': return txn.officerTitle.toLowerCase();
    case 'transactionLabel': return txn.transactionLabel;
    case 'pricePerShare': return txn.pricePerShare ?? -1;
    case 'shares': return txn.shares;
    case 'totalValue': return txn.totalValue ?? 0;
    case 'pctChange': return txn.pctChange;
    case 'sharesOwnedAfter': return txn.sharesOwnedAfter;
    case 'priceSince': {
      if (!currentPrice || !txn.pricePerShare) return 0;
      return ((currentPrice - txn.pricePerShare) / txn.pricePerShare) * 100;
    }
    default: return 0;
  }
}

// ─── Component ──────────────────────────────────────────────

export default function Insiders({ ticker }) {
  const { transactions, monthlyData, summary, loading, loadingMore, progress, error, hasMore, loadFullHistory } = useInsiders(ticker);
  const { prices } = usePrices(ticker, '3y');

  // Filters
  const [typeFilter, setTypeFilter] = useState('all');
  const [insiderFilter, setInsiderFilter] = useState('all');
  const [sortKey, setSortKey] = useState('transactionDate');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;
  const [priceMode, setPriceMode] = useState('monthly');

  // Current price for "Price Change Since Trade"
  const currentPrice = useMemo(() => {
    if (!prices || prices.length === 0) return null;
    return prices[prices.length - 1]?.close || null;
  }, [prices]);

  // Monthly price lookup for chart overlay
  const monthlyPrices = useMemo(() => {
    if (!prices || prices.length === 0) return {};
    const map = {};
    for (const p of prices) {
      if (!p.date) continue;
      const month = p.date.slice(0, 7);
      map[month] = p.close; // last entry per month = month-end price
    }
    return map;
  }, [prices]);

  // Unique insider list for filter dropdown
  const insiderList = useMemo(() => {
    const map = new Map();
    for (const t of transactions) {
      if (!map.has(t.ownerCik)) {
        map.set(t.ownerCik, { cik: t.ownerCik, name: t.ownerName, title: t.officerTitle });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [transactions]);

  // Selected insider's current holdings (direct + indirect from most recent transactions)
  const selectedInsiderInfo = useMemo(() => {
    if (insiderFilter === 'all') return null;
    const insiderTxns = transactions
      .filter(t => t.ownerCik === insiderFilter)
      .sort((a, b) => b.transactionDate.localeCompare(a.transactionDate));
    if (insiderTxns.length === 0) return null;
    const ins = insiderList.find(i => i.cik === insiderFilter);
    // Get latest transaction per ownership type
    const latestDirect = insiderTxns.find(t => t.ownershipType === 'D');
    const latestIndirect = insiderTxns.find(t => t.ownershipType === 'I');
    const directShares = latestDirect?.sharesOwnedAfter || 0;
    const indirectShares = latestIndirect?.sharesOwnedAfter || 0;
    const totalShares = directShares + indirectShares;
    const lastDate = insiderTxns[0].transactionDate;
    return {
      name: ins?.name || insiderTxns[0].ownerName,
      title: ins?.title || insiderTxns[0].officerTitle,
      directShares,
      indirectShares,
      sharesHeld: totalShares,
      lastDate,
      marketValue: currentPrice ? totalShares * currentPrice : null,
    };
  }, [insiderFilter, transactions, insiderList, currentPrice]);

  // Chart subtitle describing active filters
  const chartSubtitle = useMemo(() => {
    const typePart = TYPE_FILTERS.find(f => f.value === typeFilter)?.label || 'All Transactions';
    const insiderPart = insiderFilter !== 'all'
      ? selectedInsiderInfo?.name || 'Selected Insider'
      : 'All Insiders';
    return `${typePart} · ${insiderPart}`;
  }, [typeFilter, insiderFilter, selectedInsiderInfo]);

  // Apply filters
  const filteredTransactions = useMemo(() => {
    let filtered = transactions;
    // Type filter
    if (typeFilter === 'openMarket') filtered = filtered.filter(t => t.isOpenMarket);
    else if (typeFilter === 'purchases') filtered = filtered.filter(t => t.shares > 0);
    else if (typeFilter === 'sales') filtered = filtered.filter(t => t.shares < 0);
    else if (typeFilter === 'exercises') filtered = filtered.filter(t => !t.isOpenMarket);
    // Insider filter
    if (insiderFilter !== 'all') filtered = filtered.filter(t => t.ownerCik === insiderFilter);
    return filtered;
  }, [transactions, typeFilter, insiderFilter]);

  // Sorted transactions
  const sortedTransactions = useMemo(() => {
    const sorted = [...filteredTransactions].sort((a, b) => {
      const va = getSortValue(a, sortKey, currentPrice);
      const vb = getSortValue(b, sortKey, currentPrice);
      if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      return sortDir === 'asc' ? va - vb : vb - va;
    });
    return sorted;
  }, [filteredTransactions, sortKey, sortDir, currentPrice]);

  // Paginated
  const pagedTransactions = sortedTransactions.slice(0, (page + 1) * PAGE_SIZE);

  // Chart data: merge monthly aggregates with stock prices
  const chartData = useMemo(() => {
    // Filter monthly data same as transactions
    let txnsForChart = transactions;
    if (typeFilter === 'openMarket') txnsForChart = transactions.filter(t => t.isOpenMarket);
    else if (typeFilter === 'purchases') txnsForChart = transactions.filter(t => t.shares > 0);
    else if (typeFilter === 'sales') txnsForChart = transactions.filter(t => t.shares < 0);
    else if (typeFilter === 'exercises') txnsForChart = transactions.filter(t => !t.isOpenMarket);
    if (insiderFilter !== 'all') txnsForChart = txnsForChart.filter(t => t.ownerCik === insiderFilter);

    // Re-aggregate filtered data
    const months = {};
    for (const txn of txnsForChart) {
      const month = txn.transactionDate.slice(0, 7);
      if (!months[month]) months[month] = { purchases: 0, sales: 0 };
      if (txn.shares > 0) months[month].purchases += txn.shares;
      else months[month].sales += Math.abs(txn.shares);
    }

    // Build full month range
    const allMonths = Object.keys(months).sort();
    if (allMonths.length === 0) return [];

    // Fill in gaps
    const result = [];
    const start = allMonths[0];
    const end = allMonths[allMonths.length - 1];
    let [y, m] = start.split('-').map(Number);
    const [ey, em] = end.split('-').map(Number);

    while (y < ey || (y === ey && m <= em)) {
      const key = `${y}-${String(m).padStart(2, '0')}`;
      const data = months[key] || { purchases: 0, sales: 0 };
      result.push({
        month: key,
        label: fmtMonthLabel(key),
        purchases: data.purchases,
        sales: data.sales,
        stockPrice: monthlyPrices[key] || null,
      });
      m++;
      if (m > 12) { m = 1; y++; }
    }

    return result;
  }, [transactions, monthlyPrices, typeFilter, insiderFilter]);

  // Daily price chart data — uses raw daily prices for accurate price line
  const dailyChartData = useMemo(() => {
    if (priceMode !== 'daily' || !prices || prices.length === 0) return [];

    // Same transaction filtering as monthly chart
    let txnsForChart = transactions;
    if (typeFilter === 'openMarket') txnsForChart = transactions.filter(t => t.isOpenMarket);
    else if (typeFilter === 'purchases') txnsForChart = transactions.filter(t => t.shares > 0);
    else if (typeFilter === 'sales') txnsForChart = transactions.filter(t => t.shares < 0);
    else if (typeFilter === 'exercises') txnsForChart = transactions.filter(t => !t.isOpenMarket);
    if (insiderFilter !== 'all') txnsForChart = txnsForChart.filter(t => t.ownerCik === insiderFilter);

    // Aggregate transactions by month (bars still monthly)
    const monthlyTxns = {};
    for (const txn of txnsForChart) {
      const month = txn.transactionDate.slice(0, 7);
      if (!monthlyTxns[month]) monthlyTxns[month] = { purchases: 0, sales: 0 };
      if (txn.shares > 0) monthlyTxns[month].purchases += txn.shares;
      else monthlyTxns[month].sales += Math.abs(txn.shares);
    }

    // Date range from transactions
    const txnDates = txnsForChart.map(t => t.transactionDate).sort();
    if (txnDates.length === 0) return [];
    const startDate = txnDates[0];

    // Filter prices from first transaction date onward
    const filteredPrices = prices.filter(p => p.date >= startDate);
    if (filteredPrices.length === 0) return [];

    // Place bar data on last trading day of each month
    const lastDayPerMonth = {};
    for (const p of filteredPrices) {
      const month = p.date.slice(0, 7);
      lastDayPerMonth[month] = p.date;
    }

    return filteredPrices.map(p => {
      const month = p.date.slice(0, 7);
      const isBarDay = lastDayPerMonth[month] === p.date;
      const monthData = monthlyTxns[month];
      return {
        label: p.date,
        stockPrice: p.close,
        purchases: isBarDay && monthData ? monthData.purchases : 0,
        sales: isBarDay && monthData ? monthData.sales : 0,
      };
    });
  }, [priceMode, prices, transactions, typeFilter, insiderFilter]);

  const activeChartData = priceMode === 'daily' && dailyChartData.length > 0 ? dailyChartData : chartData;

  // Sort handler
  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
    setPage(0);
  };

  const sortArrow = (key) => {
    if (sortKey !== key) return '';
    return sortDir === 'asc' ? ' ▲' : ' ▼';
  };

  // ─── Render ─────────────────────────────────────────────

  if (!ticker) return null;

  return (
    <div>
      {/* Loading indicator */}
      {(loading || loadingMore) && progress.total > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: C.textSecondary, marginBottom: 6 }}>
            Loading insider data: {progress.current}/{progress.total} filings...
          </div>
          <div style={{ height: 4, background: C.border, borderRadius: 2, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${(progress.current / progress.total) * 100}%`,
              background: C.accent,
              borderRadius: 2,
              transition: 'width 0.2s',
            }} />
          </div>
        </div>
      )}

      {loading && progress.total === 0 && (
        <div style={{ color: C.textMuted, fontSize: 13, padding: '20px 0' }}>Loading insider data...</div>
      )}

      {error && (
        <div style={{ color: C.red, fontSize: 13, padding: '8px 12px', background: `${C.red}10`, borderRadius: 6, marginBottom: 12 }}>
          {error}
        </div>
      )}

      {!loading && transactions.length === 0 && !error && (
        <div style={{ color: C.textMuted, fontSize: 13, padding: '20px 0' }}>No insider transactions found.</div>
      )}

      {transactions.length > 0 && (
        <>
          {/* ── Section 1: Insider Sentiment Summary ── */}
          <SentimentSummary summary={summary} />

          {/* ── Section 2: Transaction Snapshot Chart ── */}
          <div style={{
            background: C.bgCard,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            padding: 16,
            marginBottom: 16,
          }}>
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Insider Transaction Snapshot</span>
                  <span style={{ fontSize: 11, color: C.textMuted, marginLeft: 10 }}>{chartSubtitle}</span>
                </div>
                <div style={{ display: 'flex', gap: 2, background: C.bgHover, borderRadius: 5, padding: 2 }}>
                  {['monthly', 'daily'].map(mode => (
                    <button
                      key={mode}
                      onClick={() => setPriceMode(mode)}
                      style={{
                        padding: '3px 10px',
                        fontSize: 11,
                        fontWeight: priceMode === mode ? 600 : 400,
                        borderRadius: 4,
                        border: 'none',
                        background: priceMode === mode ? C.bgCard : 'transparent',
                        color: priceMode === mode ? C.text : C.textMuted,
                        cursor: 'pointer',
                        boxShadow: priceMode === mode ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                        textTransform: 'capitalize',
                      }}
                    >{mode}</button>
                  ))}
                </div>
              </div>
              {selectedInsiderInfo && (
                <div style={{ fontSize: 11, color: C.textSecondary, marginTop: 4, display: 'flex', gap: 16 }}>
                  <span>Shares Held: <span style={{ fontWeight: 600, color: C.text }}>{selectedInsiderInfo.sharesHeld.toLocaleString()}</span>
                    {selectedInsiderInfo.indirectShares > 0 && (
                      <span style={{ color: C.textMuted }}> ({selectedInsiderInfo.directShares.toLocaleString()} direct + {selectedInsiderInfo.indirectShares.toLocaleString()} indirect)</span>
                    )}
                  </span>
                  {selectedInsiderInfo.marketValue != null && (
                    <span>Market Value: <span style={{ fontWeight: 600, color: C.text }}>{fmtValue(selectedInsiderInfo.marketValue)}</span></span>
                  )}
                  <span style={{ color: C.textMuted }}>as of {fmtDate(selectedInsiderInfo.lastDate)}</span>
                </div>
              )}
            </div>

            {activeChartData.length > 0 ? (
              <>
                <div style={{ display: 'flex', gap: 16, justifyContent: 'flex-end', fontSize: 11, color: C.textMuted, marginBottom: 6 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 12, height: 8, borderRadius: 2, background: C.red, display: 'inline-block', opacity: 0.8 }} /> Sales
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 12, height: 8, borderRadius: 2, background: C.green, display: 'inline-block', opacity: 0.8 }} /> Purchases
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 12, height: 2, borderRadius: 2, background: C.text, display: 'inline-block' }} /> Stock Price
                  </span>
                </div>
                <ResponsiveContainer width="100%" height={260}>
                  <ComposedChart data={activeChartData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10, fill: C.textMuted }}
                      interval={priceMode === 'daily' ? Math.max(1, Math.floor(activeChartData.length / 14)) : 'preserveStartEnd'}
                      angle={-45}
                      textAnchor="end"
                      height={50}
                      tickFormatter={priceMode === 'daily' ? (val) => {
                        if (!val || !val.includes('-')) return val;
                        const [y, m] = val.split('-');
                        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                        return `${months[parseInt(m)-1]} '${y.slice(2)}`;
                      } : undefined}
                    />
                    <YAxis
                      yAxisId="shares"
                      tick={{ fontSize: 11, fill: C.textMuted }}
                      tickFormatter={v => fmtShares(v)}
                      width={65}
                    />
                    <YAxis
                      yAxisId="price"
                      orientation="right"
                      tick={{ fontSize: 11, fill: C.textMuted }}
                      tickFormatter={v => `$${v}`}
                      width={55}
                      domain={['auto', 'auto']}
                    />
                    <Tooltip
                      contentStyle={{
                        background: C.bgCard,
                        border: `1px solid ${C.border}`,
                        borderRadius: 6,
                        fontSize: 12,
                      }}
                      formatter={(val, name) => {
                        if (name === 'stockPrice') return [`$${Number(val).toFixed(2)}`, 'Stock Price'];
                        if (name === 'sales') return [fmtShares(val), 'Shares Sold'];
                        if (name === 'purchases') return [fmtShares(val), 'Shares Purchased'];
                        return [val, name];
                      }}
                      labelFormatter={(label) => {
                        if (priceMode === 'daily' && label && /^\d{4}-\d{2}-\d{2}$/.test(label)) {
                          return fmtDate(label);
                        }
                        return label;
                      }}
                    />
                    <Bar yAxisId="shares" dataKey="sales" fill={C.red} fillOpacity={0.7} radius={[2, 2, 0, 0]} barSize={priceMode === 'daily' ? 6 : undefined} />
                    <Bar yAxisId="shares" dataKey="purchases" fill={C.green} fillOpacity={0.7} radius={[2, 2, 0, 0]} barSize={priceMode === 'daily' ? 6 : undefined} />
                    <Line
                      yAxisId="price"
                      dataKey="stockPrice"
                      type="monotone"
                      stroke={C.text}
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </>
            ) : (
              <div style={{ color: C.textMuted, fontSize: 12 }}>No chart data available for current filters.</div>
            )}
          </div>

          {/* ── Section 3: Filters ── */}
          <div style={{
            display: 'flex',
            gap: 12,
            alignItems: 'center',
            marginBottom: 12,
            flexWrap: 'wrap',
          }}>
            <select
              value={typeFilter}
              onChange={e => { setTypeFilter(e.target.value); setPage(0); }}
              style={{
                padding: '5px 8px',
                fontSize: 12,
                borderRadius: 6,
                border: `1px solid ${C.border}`,
                background: C.bgInput,
                color: C.text,
                cursor: 'pointer',
              }}
            >
              {TYPE_FILTERS.map(f => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>

            <select
              value={insiderFilter}
              onChange={e => { setInsiderFilter(e.target.value); setPage(0); }}
              style={{
                padding: '5px 8px',
                fontSize: 12,
                borderRadius: 6,
                border: `1px solid ${C.border}`,
                background: C.bgInput,
                color: C.text,
                cursor: 'pointer',
                maxWidth: 250,
              }}
            >
              <option value="all">All Insiders ({insiderList.length})</option>
              {insiderList.map(ins => (
                <option key={ins.cik} value={ins.cik}>{ins.name}{ins.title ? ` — ${ins.title}` : ''}</option>
              ))}
            </select>

            <span style={{ fontSize: 12, color: C.textMuted, marginLeft: 'auto' }}>
              {filteredTransactions.length} transaction{filteredTransactions.length !== 1 ? 's' : ''}
            </span>

            {hasMore && (
              <button
                onClick={loadFullHistory}
                disabled={loadingMore}
                style={{
                  padding: '5px 12px',
                  fontSize: 12,
                  borderRadius: 6,
                  border: `1px solid ${C.accent}`,
                  background: 'transparent',
                  color: C.accent,
                  cursor: loadingMore ? 'wait' : 'pointer',
                  opacity: loadingMore ? 0.6 : 1,
                }}
              >
                {loadingMore ? 'Loading...' : 'Load Full History (3yr)'}
              </button>
            )}
          </div>

          {/* ── Section 4: Transaction Details Table ── */}
          <div style={{
            background: C.bgCard,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            overflow: 'hidden',
          }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: `2px solid ${C.border}` }}>
                    {[
                      { key: 'transactionDate', label: 'Trade Date', width: 95 },
                      { key: 'ownerName', label: 'Insider Name', width: 150 },
                      { key: 'officerTitle', label: 'Title', width: 140 },
                      { key: 'transactionLabel', label: 'Trade Type', width: 100 },
                      { key: 'pricePerShare', label: 'Price', width: 75, align: 'right' },
                      { key: 'shares', label: 'Shares', width: 90, align: 'right' },
                      { key: 'totalValue', label: 'Trade Value', width: 100, align: 'right' },
                      { key: 'pctChange', label: '% Change', width: 80, align: 'right' },
                      { key: 'sharesOwnedAfter', label: 'Post-Trade Shares', width: 110, align: 'right' },
                      { key: 'priceSince', label: 'Price Since Trade', width: 110, align: 'right' },
                    ].map(col => (
                      <th
                        key={col.key}
                        onClick={() => handleSort(col.key)}
                        style={{
                          padding: '8px 10px',
                          textAlign: col.align || 'left',
                          fontWeight: 600,
                          color: C.textSecondary,
                          fontSize: 11,
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          cursor: 'pointer',
                          userSelect: 'none',
                          whiteSpace: 'nowrap',
                          width: col.width,
                          minWidth: col.width,
                        }}
                      >
                        {col.label}{sortArrow(col.key)}
                      </th>
                    ))}
                    <th style={{ padding: '8px 10px', width: 40, textAlign: 'center', fontWeight: 600, color: C.textSecondary, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Filing
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pagedTransactions.map((txn, i) => {
                    const priceSince = currentPrice != null && txn.pricePerShare
                      ? ((currentPrice - txn.pricePerShare) / txn.pricePerShare) * 100
                      : null;
                    const tradeColor = TRADE_TYPE_COLORS[txn.transactionLabel] || C.textMuted;

                    return (
                      <tr
                        key={`${txn.accessionNumber}-${i}`}
                        style={{
                          borderBottom: `1px solid ${C.border}`,
                          borderLeft: txn.isCluster ? `3px solid ${C.accent}` : '3px solid transparent',
                          background: i % 2 === 0 ? 'transparent' : `${C.bgHover}40`,
                        }}
                      >
                        <td style={{ padding: '7px 10px', whiteSpace: 'nowrap', color: C.text }}>
                          {fmtDate(txn.transactionDate)}
                        </td>
                        <td style={{ padding: '7px 10px', color: C.accent, fontWeight: 500 }}>
                          {txn.ownerName}
                        </td>
                        <td style={{ padding: '7px 10px', color: C.textSecondary, fontSize: 11 }}>
                          {txn.officerTitle || (txn.isDirector ? 'Director' : txn.isTenPercentOwner ? '10% Owner' : '--')}
                        </td>
                        <td style={{ padding: '7px 10px', color: tradeColor, fontWeight: txn.isOpenMarket ? 600 : 400 }}>
                          {txn.transactionLabel}
                        </td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', color: C.text, fontFamily: 'monospace' }}>
                          {txn.pricePerShare != null ? (
                            <>
                              ${txn.pricePerShare.toFixed(2)}
                              {txn.priceSource && txn.priceSource !== 'direct' && (
                                <span
                                  style={{ fontSize: 9, color: C.textMuted, marginLeft: 2, verticalAlign: 'super', cursor: 'default' }}
                                  title={txn.priceSource === 'footnote' ? 'Extracted from filing footnotes' : 'Option exercise/conversion price'}
                                >*</span>
                              )}
                            </>
                          ) : '--'}
                        </td>
                        <td style={{
                          padding: '7px 10px',
                          textAlign: 'right',
                          color: txn.shares > 0 ? C.green : txn.shares < 0 ? C.red : C.text,
                          fontFamily: 'monospace',
                        }}>
                          {txn.shares > 0 ? '+' : ''}{txn.shares.toLocaleString()}
                        </td>
                        <td style={{
                          padding: '7px 10px',
                          textAlign: 'right',
                          color: C.text,
                          fontFamily: 'monospace',
                        }}>
                          {fmtValue(txn.totalValue)}
                        </td>
                        <td style={{
                          padding: '7px 10px',
                          textAlign: 'right',
                          color: txn.pctChange > 0 ? C.green : txn.pctChange < 0 ? C.red : C.text,
                          fontFamily: 'monospace',
                        }}>
                          {txn.pctChange > 0 ? '+' : ''}{txn.pctChange.toFixed(1)}%
                        </td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', color: C.text, fontFamily: 'monospace' }}>
                          {txn.sharesOwnedAfter.toLocaleString()}
                        </td>
                        <td style={{
                          padding: '7px 10px',
                          textAlign: 'right',
                          fontFamily: 'monospace',
                          color: priceSince != null ? (priceSince >= 0 ? C.green : C.red) : C.textMuted,
                        }}>
                          {priceSince != null ? `${priceSince >= 0 ? '+' : ''}${priceSince.toFixed(1)}%` : '--'}
                        </td>
                        <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                          <a
                            href={`https://www.sec.gov/Archives/edgar/data/${txn.ownerCik}/${txn.accessionNumber.replace(/-/g, '')}/${txn.accessionNumber}-index.htm`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: C.accent, textDecoration: 'none', fontSize: 13 }}
                            title="View on SEC EDGAR"
                          >
                            ↗
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {sortedTransactions.length > pagedTransactions.length && (
              <div style={{
                padding: '10px 16px',
                borderTop: `1px solid ${C.border}`,
                textAlign: 'center',
              }}>
                <button
                  onClick={() => setPage(p => p + 1)}
                  style={{
                    padding: '6px 20px',
                    fontSize: 12,
                    borderRadius: 6,
                    border: `1px solid ${C.border}`,
                    background: 'transparent',
                    color: C.accent,
                    cursor: 'pointer',
                  }}
                >
                  Show More ({sortedTransactions.length - pagedTransactions.length} remaining)
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Sentiment Summary Sub-component ─────────────────────────

function SentimentSummary({ summary }) {
  if (!summary) return null;

  const isNetBuyer = summary.netShares12M > 0;
  const netLabel = isNetBuyer ? 'Buying' : 'Selling';
  const netColor = isNetBuyer ? C.green : C.red;
  const hasOpenMarketBuyers90D = summary.openMarketBuyers90D > 0;

  return (
    <div style={{
      display: 'flex',
      gap: 12,
      marginBottom: 16,
      flexWrap: 'wrap',
    }}>
      {/* Net Activity */}
      <StatCard
        label="Net Activity (12M)"
        value={`${netLabel} ${fmtShares(Math.abs(summary.netShares12M))}`}
        valueColor={netColor}
        subtext={`${summary.totalBuyers12M} buyer${summary.totalBuyers12M !== 1 ? 's' : ''}, ${summary.totalSellers12M} seller${summary.totalSellers12M !== 1 ? 's' : ''}`}
      />

      {/* Open Market Purchases */}
      <StatCard
        label="Open Market Purchases (90D)"
        value={`${summary.openMarketBuyers90D} insider${summary.openMarketBuyers90D !== 1 ? 's' : ''}`}
        valueColor={hasOpenMarketBuyers90D ? C.green : C.textMuted}
        subtext={hasOpenMarketBuyers90D ? 'Strongest buy signal' : 'None recently'}
        highlight={hasOpenMarketBuyers90D}
      />

      {/* Unique Insiders */}
      <StatCard
        label="Unique Insiders"
        value={summary.uniqueInsiders}
        valueColor={C.text}
        subtext={`${summary.openMarketBuyers12M} open market buyer${summary.openMarketBuyers12M !== 1 ? 's' : ''} (12M)`}
      />

      {/* Last Activity */}
      <StatCard
        label="Last Activity"
        value={summary.lastPurchaseDate ? fmtDate(summary.lastPurchaseDate) : '--'}
        valueColor={C.green}
        subtext={summary.lastSaleDate ? `Last sale: ${fmtDate(summary.lastSaleDate)}` : 'No open market sales'}
        sublabel="Last open market purchase"
      />
    </div>
  );
}

function StatCard({ label, value, valueColor, subtext, sublabel, highlight }) {
  return (
    <div style={{
      flex: '1 1 200px',
      minWidth: 180,
      padding: '10px 14px',
      background: highlight ? `${C.green}08` : C.bgCard,
      border: `1px solid ${highlight ? `${C.green}30` : C.border}`,
      borderRadius: 8,
    }}>
      <div style={{ fontSize: 11, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, color: valueColor }}>
        {value}
      </div>
      {sublabel && (
        <div style={{ fontSize: 10, color: C.textMuted, marginTop: 1 }}>{sublabel}</div>
      )}
      <div style={{ fontSize: 11, color: C.textSecondary, marginTop: 2 }}>
        {subtext}
      </div>
    </div>
  );
}
