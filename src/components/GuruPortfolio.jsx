import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ResponsiveContainer, Tooltip, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, AreaChart, Area } from 'recharts';
import { C } from '../theme';
import { useGurus } from '../hooks/useGurus';
import { useSettings } from '../hooks/useSettings';
import { formatCompanyName } from '../engines/formatCompanyName';

// ─── Format helpers ─────────────────────────────────────────

function fmtValue(val) {
  if (val == null || isNaN(val)) return '--';
  if (val >= 1e12) return `$${(val / 1e12).toFixed(2)}T`;
  if (val >= 1e9) return `$${(val / 1e9).toFixed(1)}B`;
  if (val >= 1e6) return `$${(val / 1e6).toFixed(1)}M`;
  if (val >= 1e3) return `$${(val / 1e3).toFixed(0)}K`;
  return `$${val.toLocaleString()}`;
}

function fmtShares(shares) {
  if (shares == null || isNaN(shares)) return '--';
  if (shares >= 1e9) return `${(shares / 1e9).toFixed(2)}B`;
  if (shares >= 1e6) return `${(shares / 1e6).toFixed(1)}M`;
  if (shares >= 1e3) return `${(shares / 1e3).toFixed(0)}K`;
  return shares.toLocaleString();
}

function fmtPct(pct) {
  if (pct == null || isNaN(pct)) return '--';
  if (Math.abs(pct) >= 100) return `${pct.toFixed(0)}%`;
  if (Math.abs(pct) >= 10) return `${pct.toFixed(1)}%`;
  return `${pct.toFixed(2)}%`;
}

function fmtPrice(val) {
  if (val == null || isNaN(val) || val === 0) return '--';
  return `$${val.toFixed(2)}`;
}

// Action colors
const ACTION_COLORS = {
  new: '#16a34a',     // green
  added: '#16a34a',   // green
  reduced: '#dc2626', // red
  sold: '#dc2626',    // red
  held: '#3b82f6',    // blue
};

const ACTION_LABELS = {
  new: 'New',
  added: 'Increased',
  reduced: 'Decreased',
  sold: 'Sold Out',
  held: 'No Change',
};

// Quarter label from reportDate (e.g., "2025-12-31" → "25/Q4")
function toQuarterLabel(dateStr) {
  if (!dateStr) return '--';
  const [y, m] = dateStr.split('-');
  const q = Math.ceil(parseInt(m) / 3);
  return `${y.slice(2)}/Q${q}`;
}

function timeAgo(timestamp) {
  if (!timestamp) return null;
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// Readable date (e.g., "2025-12-31" → "Dec 31, 2025")
function toReadableDate(dateStr) {
  if (!dateStr) return '--';
  const [y, m, d] = dateStr.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[parseInt(m) - 1]} ${parseInt(d)}, ${y}`;
}

// Full quarter label (e.g., "2025Q4")
function toFullQuarterLabel(dateStr) {
  if (!dateStr) return '--';
  const [y, m] = dateStr.split('-');
  const q = Math.ceil(parseInt(m) / 3);
  return `${y}Q${q}`;
}

const VALUE_RANGES = ['6m', '1y', '3y', '5y'];
const RANGE_QUARTERS = { '6m': 2, '1y': 4, '3y': 12, '5y': 20 };

// ─── Treemap component ──────────────────────────────────────

function PortfolioTreemap({ holdings, filter }) {
  const [hoveredIdx, setHoveredIdx] = useState(null);
  const containerRef = useRef(null);

  const treemapData = useMemo(() => {
    const source = (filter === 'all' ? holdings : holdings.filter(h => {
      if (filter === 'bought') return h.action === 'new' || h.action === 'added';
      if (filter === 'sold') return h.action === 'reduced' || h.action === 'sold';
      if (filter === 'held') return h.action === 'held';
      return true;
    })).filter(h => h.value > 0);
    if (source.length === 0) return [];

    return [...source]
      .sort((a, b) => b.portfolioPct - a.portfolioPct)
      .slice(0, 25)
      .map(h => ({
        ticker: h.ticker || h.issuer?.slice(0, 6),
        issuer: h.issuer,
        pct: h.portfolioPct,
        value: h.value,
        shares: h.shares,
        action: h.action,
        color: ACTION_COLORS[h.action] || '#3b82f6',
      }));
  }, [holdings, filter]);

  if (treemapData.length === 0) {
    return (
      <div style={{ padding: '40px 0', textAlign: 'center', color: C.textMuted, fontSize: 13 }}>
        No position data available.
      </div>
    );
  }

  // Simple squarified treemap layout (percentage-based so it fills full width)
  const totalPct = treemapData.reduce((s, d) => s + d.pct, 0);
  const rects = layoutTreemap(treemapData, totalPct, 100, 100);

  return (
    <div style={{ position: 'relative' }}>
      <div ref={containerRef} style={{
        position: 'relative', width: '100%', height: 280,
        borderRadius: 6, overflow: 'hidden', border: `1px solid ${C.border}`,
      }}>
        {rects.map((r, i) => {
          const isHovered = hoveredIdx === i;
          const isSmall = r.w < 6 || r.h < 14;
          const isTiny = r.w < 3.5 || r.h < 10;
          return (
            <div
              key={i}
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
              style={{
                position: 'absolute',
                left: `${r.x}%`, top: `${r.y}%`, width: `${r.w}%`, height: `${r.h}%`,
                background: r.data.color,
                opacity: isHovered ? 1 : 0.82,
                border: `1px solid ${C.bgCard}`,
                boxSizing: 'border-box',
                cursor: 'default',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                padding: 3, overflow: 'hidden',
                transition: 'opacity .12s',
              }}
            >
              {!isTiny && (
                <>
                  <div style={{
                    fontSize: isSmall ? 10 : 13, fontWeight: 700, color: '#fff',
                    lineHeight: 1.2, textAlign: 'center',
                    textShadow: '0 1px 2px rgba(0,0,0,0.3)',
                  }}>
                    {r.data.ticker}
                  </div>
                  {!isSmall && (
                    <div style={{
                      fontSize: 11, color: 'rgba(255,255,255,0.85)',
                      textShadow: '0 1px 2px rgba(0,0,0,0.3)',
                    }}>
                      {fmtPct(r.data.pct)}
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Hover tooltip — speech bubble anchored to hovered rectangle */}
      {hoveredIdx != null && rects[hoveredIdx] && containerRef.current && (() => {
        const r = rects[hoveredIdx];
        const box = containerRef.current;
        const cW = box.offsetWidth;
        const cH = box.offsetHeight;

        // Pixel coords of hovered rect center and edges
        const rectCxPx = (r.x + r.w / 2) / 100 * cW;
        const rectTopPx = r.y / 100 * cH;
        const rectBotPx = (r.y + r.h) / 100 * cH;

        // Show above if rect is in bottom 60%, otherwise below
        const showAbove = r.y > 35;
        const arrowSize = 7;
        const gap = 4;

        // Tooltip top in px (relative to container)
        // We use a wrapper positioned in px, then the tooltip auto-sizes
        const tipTopPx = showAbove ? (rectTopPx - gap) : (rectBotPx + gap);

        // Clamp horizontal: tooltip is ~180px wide, keep arrow within bounds
        const tooltipWidth = 180;
        const halfTip = tooltipWidth / 2;
        const clampedCx = Math.max(halfTip + 4, Math.min(rectCxPx, cW - halfTip - 4));
        // Arrow offset from tooltip center (when tooltip is clamped)
        const arrowOffsetPx = rectCxPx - clampedCx;

        return (
          <div style={{
            position: 'absolute',
            left: clampedCx,
            top: tipTopPx,
            transform: showAbove ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
            pointerEvents: 'none', zIndex: 10,
          }}>
            {/* Tooltip body */}
            <div style={{
              position: 'relative',
              background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 6,
              padding: '8px 12px', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              whiteSpace: 'nowrap',
            }}>
              <div style={{ fontWeight: 600, color: C.text }}>{formatCompanyName(r.data.issuer)}</div>
              <div style={{ color: C.accent, fontSize: 11 }}>{r.data.ticker}</div>
              <div style={{ color: C.textSecondary, marginTop: 2 }}>
                {fmtValue(r.data.value)} &middot; {fmtPct(r.data.pct)}
              </div>
              <div style={{ color: ACTION_COLORS[r.data.action], fontWeight: 600, marginTop: 2 }}>
                {ACTION_LABELS[r.data.action] || '--'}
              </div>

              {/* Arrow pointing at the rect */}
              {/* Outer arrow (border color) */}
              <div style={{
                position: 'absolute',
                left: `calc(50% + ${arrowOffsetPx}px)`,
                [showAbove ? 'bottom' : 'top']: -(arrowSize * 2),
                transform: 'translateX(-50%)',
                width: 0, height: 0,
                borderLeft: `${arrowSize}px solid transparent`,
                borderRight: `${arrowSize}px solid transparent`,
                [showAbove ? 'borderTop' : 'borderBottom']: `${arrowSize}px solid ${C.border}`,
              }} />
              {/* Inner arrow (fill color) */}
              <div style={{
                position: 'absolute',
                left: `calc(50% + ${arrowOffsetPx}px)`,
                [showAbove ? 'bottom' : 'top']: -(arrowSize * 2 - 1),
                transform: 'translateX(-50%)',
                width: 0, height: 0,
                borderLeft: `${arrowSize}px solid transparent`,
                borderRight: `${arrowSize}px solid transparent`,
                [showAbove ? 'borderTop' : 'borderBottom']: `${arrowSize}px solid ${C.bgCard}`,
              }} />
            </div>
          </div>
        );
      })()}

      {/* Action legend */}
      <div style={{ display: 'flex', gap: 20, justifyContent: 'center', marginTop: 10 }}>
        {[
          { label: 'Bought / Added', color: '#16a34a' },
          { label: 'Reduced / Sold', color: '#dc2626' },
          { label: 'Held', color: '#3b82f6' },
        ].map(item => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: C.textSecondary }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: item.color, opacity: 0.85 }} />
            {item.label}
          </div>
        ))}
      </div>
    </div>
  );
}

// Slice-and-dice treemap layout (alternates horizontal/vertical splits)
function layoutTreemap(data, totalPct, W, H) {
  if (data.length === 0) return [];
  const rects = [];
  _layoutRecurse(data.map(d => ({ ...d, norm: d.pct / totalPct })), 0, 0, W, H, rects, true);
  return rects;
}

function _layoutRecurse(items, x, y, w, h, rects, horizontal) {
  if (items.length === 0) return;
  if (items.length === 1) {
    rects.push({ x, y, w, h, data: items[0] });
    return;
  }

  // Find split point that minimizes aspect ratio imbalance
  // Aspect correction: container is ~3.5:1 (wide), so scale width units
  const aspect = 3.5;
  const total = items.reduce((s, d) => s + d.norm, 0);
  let bestSplit = 1, bestRatio = Infinity;
  let running = 0;
  for (let i = 0; i < items.length - 1; i++) {
    running += items[i].norm;
    const frac = running / total;
    const r1 = horizontal ? (w * frac * aspect) / h : (w * aspect) / (h * frac);
    const r2 = horizontal ? (w * (1 - frac) * aspect) / h : (w * aspect) / (h * (1 - frac));
    const worst = Math.max(r1 > 1 ? r1 : 1 / r1, r2 > 1 ? r2 : 1 / r2);
    if (worst < bestRatio) { bestRatio = worst; bestSplit = i + 1; }
  }

  const left = items.slice(0, bestSplit);
  const right = items.slice(bestSplit);
  const leftTotal = left.reduce((s, d) => s + d.norm, 0);
  const frac = leftTotal / total;

  if (horizontal) {
    _layoutRecurse(left, x, y, w * frac, h, rects, !horizontal);
    _layoutRecurse(right, x + w * frac, y, w * (1 - frac), h, rects, !horizontal);
  } else {
    _layoutRecurse(left, x, y, w, h * frac, rects, !horizontal);
    _layoutRecurse(right, x, y + h * frac, w, h * (1 - frac), rects, !horizontal);
  }
}

// ─── Main Component ─────────────────────────────────────────

export default function GuruPortfolio() {
  const { cik } = useParams();
  const navigate = useNavigate();
  const { settings } = useSettings();
  const {
    gurus, activities, fetchOneWithChanges, fetchHistory, fetchPortfolioHistory,
    nportData, lastFetchedAt,
  } = useGurus();

  const [filter, setFilter] = useState('all');
  const [sortKey, setSortKey] = useState('pct');
  const [sortAsc, setSortAsc] = useState(false);
  const [expandedCusip, setExpandedCusip] = useState(null);
  const [historyData, setHistoryData] = useState({});
  const [historyLoading, setHistoryLoading] = useState(null);
  const [dataLoading, setDataLoading] = useState(false);

  // Portfolio value chart state
  const [portfolioHistory, setPortfolioHistory] = useState(null);
  const [portfolioHistoryLoading, setPortfolioHistoryLoading] = useState(false);
  const [valueChartRange, setValueChartRange] = useState('5y');

  const guru = useMemo(() => gurus.find(g => g.cik === cik), [gurus, cik]);
  const activity = useMemo(() => activities.find(a => a?.guru?.cik === cik), [activities, cik]);
  const nport = settings.enableNport !== false ? (nportData[cik] || null) : null;

  // Auto-fetch if no activity data exists for this guru
  useEffect(() => {
    if (guru && !activity && !dataLoading) {
      setDataLoading(true);
      fetchOneWithChanges(guru).finally(() => setDataLoading(false));
    }
  }, [guru, activity, dataLoading, fetchOneWithChanges]);

  // Auto-fetch portfolio value history when activity is loaded
  useEffect(() => {
    if (activity && guru && !portfolioHistory && !portfolioHistoryLoading) {
      setPortfolioHistoryLoading(true);
      fetchPortfolioHistory(guru, 20)
        .then(history => setPortfolioHistory(history))
        .catch(() => setPortfolioHistory([]))
        .finally(() => setPortfolioHistoryLoading(false));
    }
  }, [activity, guru, portfolioHistory, portfolioHistoryLoading, fetchPortfolioHistory]);

  // Reset portfolio history when guru changes
  useEffect(() => {
    setPortfolioHistory(null);
    setPortfolioHistoryLoading(false);
  }, [cik]);

  const holdings = activity?.holdings || [];

  // Filter holdings
  const filteredHoldings = useMemo(() => {
    if (filter === 'all') return holdings;
    if (filter === 'bought') return holdings.filter(h => h.action === 'new' || h.action === 'added');
    if (filter === 'sold') return holdings.filter(h => h.action === 'reduced' || h.action === 'sold');
    if (filter === 'held') return holdings.filter(h => h.action === 'held');
    return holdings;
  }, [holdings, filter]);

  // Sort holdings
  const sortedHoldings = useMemo(() => {
    const copy = [...filteredHoldings];
    copy.sort((a, b) => {
      let av, bv;
      switch (sortKey) {
        case 'ticker': av = a.ticker || a.issuer || ''; bv = b.ticker || b.issuer || '';
          return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
        case 'name': av = a.issuer || ''; bv = b.issuer || '';
          return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
        case 'pct': av = a.portfolioPct || 0; bv = b.portfolioPct || 0; break;
        case 'shares': av = a.shares || 0; bv = b.shares || 0; break;
        case 'action': av = a.action || ''; bv = b.action || '';
          return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
        case 'pctChange': av = a.pctChange || 0; bv = b.pctChange || 0; break;
        case 'sharesChange': av = a.sharesChange || 0; bv = b.sharesChange || 0; break;
        case 'portChange': av = a.portfolioPctChange || 0; bv = b.portfolioPctChange || 0; break;
        default: av = a.portfolioPct || 0; bv = b.portfolioPct || 0;
      }
      if (typeof av === 'string') return 0;
      return sortAsc ? av - bv : bv - av;
    });
    return copy;
  }, [filteredHoldings, sortKey, sortAsc]);

  // (treemap data is computed inside PortfolioTreemap component)

  // Portfolio value chart — filtered by range
  const filteredPortfolioHistory = useMemo(() => {
    if (!Array.isArray(portfolioHistory) || portfolioHistory.length === 0) return [];
    const count = RANGE_QUARTERS[valueChartRange] || 20;
    // portfolioHistory is newest-first from engine, slice then reverse for oldest-first X axis
    return portfolioHistory.slice(0, count).reverse();
  }, [portfolioHistory, valueChartRange]);

  const portfolioReturn = useMemo(() => {
    if (filteredPortfolioHistory.length < 2) return null;
    const startVal = filteredPortfolioHistory[0].totalValue;
    const endVal = filteredPortfolioHistory[filteredPortfolioHistory.length - 1].totalValue;
    if (!startVal || startVal === 0) return null;
    return ((endVal - startVal) / startVal) * 100;
  }, [filteredPortfolioHistory]);

  const chartData = useMemo(() =>
    filteredPortfolioHistory.map(h => ({
      quarter: toQuarterLabel(h.reportDate),
      value: h.totalValue,
    })),
    [filteredPortfolioHistory]
  );

  const handleSort = (key) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  };

  // Expand row and fetch history
  const handleExpand = useCallback(async (cusip) => {
    if (expandedCusip === cusip) {
      setExpandedCusip(null);
      return;
    }
    setExpandedCusip(cusip);

    if (!historyData[cusip] && guru) {
      setHistoryLoading(cusip);
      try {
        const history = await fetchHistory(guru, cusip);
        setHistoryData(prev => ({ ...prev, [cusip]: history }));
      } catch (err) {
        setHistoryData(prev => ({ ...prev, [cusip]: { error: err.message } }));
      } finally {
        setHistoryLoading(null);
      }
    }
  }, [expandedCusip, historyData, guru, fetchHistory]);

  if (!guru) {
    return (
      <div style={{ padding: '60px 24px', textAlign: 'center', color: C.textMuted }}>
        Guru not found. <span style={{ color: C.accent, cursor: 'pointer' }} onClick={() => navigate('/gurus')}>Back to Gurus</span>
      </div>
    );
  }

  const TABLE_COLS = [
    { key: 'expand', label: '', align: 'center', width: 30 },
    { key: 'ticker', label: 'Ticker', align: 'left' },
    { key: 'name', label: 'Company Name', align: 'left' },
    { key: 'pct', label: '% of Portfolio', align: 'right' },
    { key: 'shares', label: 'Shares Held', align: 'right' },
    { key: 'action', label: 'Last Quarter Action', align: 'center' },
    { key: 'pctChange', label: '% Change', align: 'right' },
    { key: 'sharesChange', label: 'Shares Change', align: 'right' },
    { key: 'portChange', label: '% Portfolio Change', align: 'right' },
  ];

  const rangeLabel = { '6m': '6M', '1y': '1Y', '3y': '3Y', '5y': '5Y' };

  return (
    <div style={{ padding: '24px 0 60px' }}>
      {/* ─── Back link + header ─── */}
      <div style={{ marginBottom: 20 }}>
        <span
          onClick={() => navigate('/gurus')}
          style={{ fontSize: 12, color: C.accent, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
        >
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back to Gurus
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
        <div>
          {/* Guru dropdown selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <select
              value={cik}
              onChange={(e) => navigate(`/gurus/${e.target.value}`)}
              style={{
                fontSize: 20, fontWeight: 700, color: C.text,
                background: 'transparent', border: 'none', cursor: 'pointer',
                fontFamily: 'inherit', outline: 'none', padding: 0,
              }}
            >
              {[...gurus].sort((a, b) => a.name.localeCompare(b.name)).map(g => (
                <option key={g.cik} value={g.cik} style={{ background: C.bg, color: C.text }}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
          <div style={{ fontSize: 13, color: C.textMuted }}>{guru.fund}</div>
        </div>

        {/* Portfolio Stats */}
        {activity && (
          <div style={{
            display: 'flex', gap: 24, padding: '12px 20px',
            border: `1px solid ${C.border}`, borderRadius: 8, background: C.bgCard,
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>
                Latest Reporting Period
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>
                {toFullQuarterLabel(activity.reportDate)}
              </div>
            </div>
            <div style={{ width: 1, background: C.border }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>
                Number of Stocks Held
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>
                {activity.positionCount}
              </div>
            </div>
            <div style={{ width: 1, background: C.border }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>
                Portfolio Value
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>
                {fmtValue(activity.totalValue)}
              </div>
              <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2, fontStyle: 'italic', textTransform: 'none' }}>
                as of close on {toReadableDate(activity.reportDate)}
                {lastFetchedAt && <span> · Data fetched: {timeAgo(lastFetchedAt)}</span>}
              </div>
            </div>
            {nport && (
              <>
                <div style={{ width: 1, background: C.border }} />
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
                    Cash Position
                    <span title="From N-PORT filing (fund portfolio data)" style={{ fontSize: 9, background: C.accent, color: '#fff', borderRadius: 3, padding: '1px 4px', fontWeight: 700, letterSpacing: 0, cursor: 'help' }}>N</span>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>
                    {fmtValue(nport.cashPosition)}
                  </div>
                  <div style={{ fontSize: 12, color: C.accent, fontWeight: 600 }}>
                    {fmtPct(nport.cashPct)} of fund
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Loading indicator */}
      {dataLoading && !activity && (
        <div style={{ padding: '40px 24px', textAlign: 'center', color: C.textMuted, fontSize: 13 }}>
          Loading portfolio data...
        </div>
      )}

      {activity && (
        <>
          {/* ─── Treemap: Latest Reported Holdings ─── */}
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: C.text, margin: '0 0 12px' }}>
              Latest Reported Holdings
            </h3>
            <PortfolioTreemap holdings={holdings} filter={filter} />
          </div>

          {/* ─── Filter + Holdings Table ─── */}
          <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
            <select
              value={filter}
              onChange={e => setFilter(e.target.value)}
              style={{
                padding: '6px 12px', fontSize: 13, border: `1px solid ${C.border}`,
                borderRadius: 6, background: C.bgInput, color: C.text, fontFamily: 'inherit',
                cursor: 'pointer', outline: 'none',
              }}
            >
              <option value="all">All</option>
              <option value="bought">Bought</option>
              <option value="sold">Sold</option>
              <option value="held">Held</option>
            </select>
            <span style={{ fontSize: 12, color: C.textMuted }}>
              {sortedHoldings.length} position{sortedHoldings.length !== 1 ? 's' : ''}
            </span>
          </div>

          <div style={{
            border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden', background: C.bgCard,
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {TABLE_COLS.map(col => (
                    <th
                      key={col.key}
                      onClick={() => col.key !== 'expand' && handleSort(col.key)}
                      style={{
                        textAlign: col.align, padding: '8px 10px',
                        color: C.textMuted, fontWeight: 600, fontSize: 11,
                        textTransform: 'uppercase', letterSpacing: '0.04em',
                        background: C.headerBg, borderBottom: `1px solid ${C.border}`,
                        cursor: col.key !== 'expand' ? 'pointer' : 'default',
                        userSelect: 'none', whiteSpace: 'nowrap',
                        width: col.width || 'auto',
                      }}
                    >
                      {col.label}
                      {sortKey === col.key && (
                        <span style={{ marginLeft: 4, fontSize: 10 }}>{sortAsc ? '↑' : '↓'}</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedHoldings.map((h) => {
                  const isExpanded = expandedCusip === h.cusip;
                  const history = historyData[h.cusip];
                  const isLoadingHistory = historyLoading === h.cusip;
                  const changeColor = (val) => val > 0 ? '#16a34a' : val < 0 ? '#dc2626' : C.textMuted;

                  return (
                    <HoldingRow
                      key={h.cusip}
                      holding={h}
                      isExpanded={isExpanded}
                      history={history}
                      isLoadingHistory={isLoadingHistory}
                      onExpand={() => handleExpand(h.cusip)}
                      changeColor={changeColor}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ─── N-PORT Fund Holdings (cash + derivatives) ─── */}
          {nport && (nport.cashHoldings?.length > 0 || nport.derivativeHoldings?.length > 0) && (
            <NportHoldingsSection nport={nport} />
          )}

          {/* ─── Portfolio Value Chart (below holdings) ─── */}
          <div style={{
            border: `1px solid ${C.border}`, borderRadius: 8,
            background: C.bgCard, padding: 16, marginTop: 24,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: C.text, margin: 0 }}>
                  Portfolio Value
                </h3>
                {portfolioReturn != null && (
                  <span style={{
                    fontSize: 13, fontWeight: 600,
                    color: portfolioReturn >= 0 ? '#16a34a' : '#dc2626',
                  }}>
                    {portfolioReturn >= 0 ? '+' : ''}{portfolioReturn.toFixed(2)}%
                    <span style={{ fontWeight: 400, fontSize: 11, color: C.textMuted, marginLeft: 4 }}>
                      {rangeLabel[valueChartRange]}
                    </span>
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {VALUE_RANGES.map(r => (
                  <button
                    key={r}
                    onClick={() => setValueChartRange(r)}
                    style={{
                      padding: '4px 10px', fontSize: 11, fontWeight: 600,
                      background: valueChartRange === r ? C.accent : C.bgHover,
                      color: valueChartRange === r ? '#fff' : C.textSecondary,
                      border: valueChartRange === r ? 'none' : `1px solid ${C.border}`,
                      borderRadius: 4, cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    {rangeLabel[r]}
                  </button>
                ))}
              </div>
            </div>

            {portfolioHistoryLoading && (
              <div style={{ padding: '60px 0', textAlign: 'center', color: C.textMuted, fontSize: 13 }}>
                Loading portfolio history...
              </div>
            )}

            {!portfolioHistoryLoading && chartData.length > 1 && (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                  <defs>
                    <linearGradient id="portfolioValueGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.accent} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={C.accent} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="quarter"
                    tick={{ fontSize: 10, fill: C.textMuted }}
                    tickLine={false}
                    axisLine={{ stroke: C.border }}
                    minTickGap={40}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: C.textMuted }}
                    tickLine={false}
                    axisLine={false}
                    domain={['auto', 'auto']}
                    tickFormatter={v => fmtValue(v)}
                    width={60}
                  />
                  <Tooltip
                    contentStyle={{
                      background: C.bgCard, border: `1px solid ${C.border}`,
                      borderRadius: 8, fontSize: 12, color: C.text,
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                    }}
                    formatter={v => [fmtValue(v), 'Portfolio Value']}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke={C.accent}
                    strokeWidth={1.5}
                    fill="url(#portfolioValueGrad)"
                    dot={{ r: 3, fill: C.accent, strokeWidth: 0 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}

            {!portfolioHistoryLoading && chartData.length <= 1 && portfolioHistory && (
              <div style={{ padding: '40px 0', textAlign: 'center', color: C.textMuted, fontSize: 13 }}>
                Not enough historical data for chart.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── N-PORT Holdings Section ─────────────────────────────────

function NportHoldingsSection({ nport }) {
  const [expanded, setExpanded] = useState(false);

  const cashItems = nport.cashHoldings || [];
  const derivItems = nport.derivativeHoldings || [];
  const otherItems = nport.otherHoldings || [];
  const allItems = [...cashItems, ...derivItems, ...otherItems];

  if (allItems.length === 0) return null;

  const catLabel = (cat) => {
    if (cat === 'STIV') return 'Money Market';
    if (cat === 'RF') return 'Repo';
    if (cat === 'DE' || cat === 'DIR') return 'Derivative';
    if (cat === 'DBT') return 'Debt';
    return cat || 'Other';
  };

  const catColor = (cat) => {
    if (cat === 'STIV' || cat === 'RF') return '#6366f1'; // indigo
    if (cat === 'DE' || cat === 'DIR') return '#f59e0b'; // amber
    if (cat === 'DBT') return '#8b5cf6'; // violet
    return C.textMuted;
  };

  return (
    <div style={{
      border: `1px solid ${C.border}`, borderRadius: 8,
      overflow: 'hidden', background: C.bgCard, marginTop: 16,
    }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          padding: '10px 14px', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: C.headerBg,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontSize: 10, color: expanded ? C.accent : C.textMuted,
            display: 'inline-block',
            transform: expanded ? 'rotate(90deg)' : 'none',
            transition: 'transform .15s',
          }}>
            ▶
          </span>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>
            Fund Holdings
          </span>
          <span style={{ fontSize: 9, background: C.accent, color: '#fff', borderRadius: 3, padding: '1px 4px', fontWeight: 700 }}>N-PORT</span>
          <span style={{ fontSize: 12, color: C.textMuted }}>
            {cashItems.length > 0 && `${cashItems.length} cash/money market`}
            {cashItems.length > 0 && derivItems.length > 0 && ', '}
            {derivItems.length > 0 && `${derivItems.length} derivatives`}
            {otherItems.length > 0 && `, ${otherItems.length} other`}
          </span>
        </div>
        <div style={{ fontSize: 12, color: C.textMuted }}>
          Net Assets: {fmtValue(nport.netAssets)}
        </div>
      </div>

      {expanded && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Name', 'Type', 'Value', '% of Net Assets'].map((h, i) => (
                <th key={h} style={{
                  textAlign: i >= 2 ? 'right' : 'left',
                  padding: '8px 12px', color: C.textMuted, fontWeight: 600,
                  fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em',
                  borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap',
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allItems.map((item, idx) => (
              <tr key={idx} style={{ borderBottom: `1px solid ${C.borderLight}` }}>
                <td style={{ padding: '7px 12px', fontSize: 13, color: C.text }}>
                  {formatCompanyName(item.name) || item.title}
                </td>
                <td style={{ padding: '7px 12px' }}>
                  <span style={{
                    fontSize: 11, fontWeight: 600,
                    color: catColor(item.assetCat),
                  }}>
                    {catLabel(item.assetCat)}
                  </span>
                </td>
                <td style={{
                  padding: '7px 12px', fontSize: 13, textAlign: 'right',
                  fontVariantNumeric: 'tabular-nums', fontWeight: 500,
                  color: item.value < 0 ? '#dc2626' : C.text,
                }}>
                  {item.value < 0 ? `-${fmtValue(Math.abs(item.value))}` : fmtValue(item.value)}
                </td>
                <td style={{
                  padding: '7px 12px', fontSize: 13, textAlign: 'right',
                  fontVariantNumeric: 'tabular-nums', color: C.textSecondary,
                }}>
                  {fmtPct(item.pctOfNetAssets)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {expanded && nport.filing && (
        <div style={{ padding: '8px 14px', fontSize: 11, color: C.textMuted, borderTop: `1px solid ${C.border}` }}>
          Source: N-PORT filing ({nport.filing.form}) &middot; Report date: {nport.filing.reportDate} &middot; Filed: {nport.filing.filingDate}
          {nport.seriesName && <> &middot; Series: {nport.seriesName}</>}
        </div>
      )}
    </div>
  );
}

// ─── Holding Row + Expandable Sub-Section ───────────────────

function HoldingRow({ holding: h, isExpanded, history, isLoadingHistory, onExpand, changeColor }) {
  return (
    <>
      <tr
        style={{ borderBottom: `1px solid ${isExpanded ? C.border : C.borderLight}`, cursor: 'pointer' }}
        onClick={onExpand}
        onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = C.bgHover; }}
        onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = 'transparent'; }}
      >
        {/* Expand chevron */}
        <td style={{ padding: '7px 6px', textAlign: 'center', width: 30 }}>
          <span style={{
            fontSize: 10, color: isExpanded ? C.accent : C.textMuted,
            display: 'inline-block',
            transform: isExpanded ? 'rotate(90deg)' : 'none',
            transition: 'transform .15s',
          }}>
            ▶
          </span>
        </td>
        {/* Ticker */}
        <td style={{ padding: '7px 10px', fontSize: 13, fontWeight: 600, color: h.ticker ? C.accent : C.textMuted }}>
          {h.ticker || '--'}
        </td>
        {/* Company Name */}
        <td style={{ padding: '7px 10px', fontSize: 13, color: C.text }}>
          {formatCompanyName(h.issuer)}
        </td>
        {/* % of Portfolio */}
        <td style={{ padding: '7px 10px', fontSize: 13, textAlign: 'right', fontWeight: 500, fontVariantNumeric: 'tabular-nums', color: C.text }}>
          {fmtPct(h.portfolioPct)}
        </td>
        {/* Shares */}
        <td style={{ padding: '7px 10px', fontSize: 13, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: C.textSecondary }}>
          {h.shares > 0 ? h.shares.toLocaleString() : '--'}
        </td>
        {/* Action */}
        <td style={{ padding: '7px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12,
          }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: ACTION_COLORS[h.action] || '#999',
              display: 'inline-block',
            }} />
            <span style={{ color: ACTION_COLORS[h.action] || C.textMuted, fontWeight: 500 }}>
              {ACTION_LABELS[h.action] || '--'}
            </span>
          </span>
        </td>
        {/* % Change */}
        <td style={{ padding: '7px 10px', fontSize: 13, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: changeColor(h.pctChange), fontWeight: 500 }}>
          {h.pctChange != null ? `${h.pctChange > 0 ? '+' : ''}${fmtPct(h.pctChange)}` : '--'}
        </td>
        {/* Shares Change */}
        <td style={{ padding: '7px 10px', fontSize: 13, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: changeColor(h.sharesChange) }}>
          {h.sharesChange != null && h.sharesChange !== 0
            ? `${h.sharesChange > 0 ? '+' : ''}${h.sharesChange.toLocaleString()}`
            : '--'}
        </td>
        {/* % Portfolio Change */}
        <td style={{ padding: '7px 10px', fontSize: 13, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: changeColor(h.portfolioPctChange) }}>
          {h.portfolioPctChange != null && Math.abs(h.portfolioPctChange) > 0.001
            ? `${h.portfolioPctChange > 0 ? '+' : ''}${fmtPct(h.portfolioPctChange)}`
            : '--'}
        </td>
      </tr>

      {/* Expanded section */}
      {isExpanded && (
        <tr>
          <td colSpan={9} style={{ padding: 0, background: C.bg, borderBottom: `1px solid ${C.border}` }}>
            <div style={{ padding: '16px 20px 20px 46px' }}>
              {isLoadingHistory && (
                <div style={{ fontSize: 13, color: C.textMuted, padding: '12px 0' }}>Loading history...</div>
              )}
              {history?.error && (
                <div style={{ fontSize: 13, color: C.red, padding: '12px 0' }}>{history.error}</div>
              )}
              {Array.isArray(history) && history.length > 0 && (
                <HistorySection holding={h} history={history} />
              )}
              {Array.isArray(history) && history.length === 0 && (
                <div style={{ fontSize: 13, color: C.textMuted, padding: '12px 0' }}>No historical data available.</div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── History Section (table + chart) ────────────────────────

function HistorySection({ holding, history }) {
  // Reverse so oldest is first for chart
  const chartData = useMemo(() =>
    [...history].reverse().map(h => ({
      quarter: toQuarterLabel(h.reportDate),
      shares: h.shares,
      avgPrice: h.avgPrice,
    })),
    [history]
  );

  return (
    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
      {/* History table */}
      <div style={{ flex: '1 1 45%', minWidth: 300 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.textSecondary, marginBottom: 8 }}>
          Historical Activity for {holding.ticker || formatCompanyName(holding.issuer)}
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Period', 'Shares Change', '% Change', 'Quarter End Shares', 'Avg. Price'].map((h, i) => (
                <th key={h} style={{
                  textAlign: i >= 1 ? 'right' : 'left',
                  padding: '6px 10px', color: C.textMuted, fontWeight: 600,
                  fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em',
                  borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap',
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {history.map((row) => {
              const chgColor = row.sharesChange > 0 ? '#16a34a' : row.sharesChange < 0 ? '#dc2626' : C.textMuted;
              return (
                <tr key={row.reportDate} style={{ borderBottom: `1px solid ${C.borderLight}` }}>
                  <td style={{ padding: '6px 10px', fontSize: 12, color: C.textSecondary }}>
                    {toFullQuarterLabel(row.reportDate)}
                  </td>
                  <td style={{ padding: '6px 10px', fontSize: 12, textAlign: 'right', color: chgColor, fontVariantNumeric: 'tabular-nums' }}>
                    {row.sharesChange !== 0 ? `${row.sharesChange > 0 ? '+' : ''}${row.sharesChange.toLocaleString()}` : '--'}
                  </td>
                  <td style={{ padding: '6px 10px', fontSize: 12, textAlign: 'right', color: chgColor, fontVariantNumeric: 'tabular-nums' }}>
                    {row.pctChange !== 0 ? `${row.pctChange > 0 ? '+' : ''}${fmtPct(row.pctChange)}` : '--'}
                  </td>
                  <td style={{ padding: '6px 10px', fontSize: 12, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: C.text }}>
                    {row.shares > 0 ? row.shares.toLocaleString() : '--'}
                  </td>
                  <td style={{ padding: '6px 10px', fontSize: 12, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: C.text }}>
                    {fmtPrice(row.avgPrice)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* History chart */}
      {chartData.length > 1 && (
        <div style={{ flex: '1 1 45%', minWidth: 300, minHeight: 200 }}>
          <div style={{ display: 'flex', gap: 16, justifyContent: 'flex-end', fontSize: 11, color: C.textMuted, marginBottom: 6 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 12, height: 8, borderRadius: 2, background: C.accent, display: 'inline-block' }} /> Shares Held
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 12, height: 3, borderRadius: 2, background: '#f59e0b', display: 'inline-block' }} /> Price
            </span>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <ComposedChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis dataKey="quarter" tick={{ fontSize: 11, fill: C.textMuted }} />
              <YAxis yAxisId="shares" tick={{ fontSize: 11, fill: C.textMuted }} tickFormatter={(v) => fmtShares(v)} width={60} />
              <YAxis yAxisId="price" orientation="right" tick={{ fontSize: 11, fill: C.textMuted }} tickFormatter={(v) => `$${v}`} width={50} />
              <Tooltip
                contentStyle={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12 }}
                formatter={(val, name) => [name === 'shares' ? fmtShares(val) : fmtPrice(val), name === 'shares' ? 'Shares Held' : 'Avg. Price']}
              />
              <Bar yAxisId="shares" dataKey="shares" fill={C.accent} fillOpacity={0.7} radius={[3, 3, 0, 0]} />
              <Line yAxisId="price" dataKey="avgPrice" type="monotone" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3, fill: '#f59e0b' }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
