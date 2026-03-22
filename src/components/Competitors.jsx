import { useState, useMemo, useEffect, useCallback } from 'react';
import { C } from '../theme';
import { useCompetitors } from '../hooks/useCompetitors';
import { formatCompanyName } from '../engines/formatCompanyName';

// ─── Format helpers ─────────────────────────────────────────

function fmtValue(val) {
  if (val == null || isNaN(val)) return '--';
  if (Math.abs(val) >= 1e12) return `$${(val / 1e12).toFixed(2)}T`;
  if (Math.abs(val) >= 1e9) return `$${(val / 1e9).toFixed(1)}B`;
  if (Math.abs(val) >= 1e6) return `$${(val / 1e6).toFixed(1)}M`;
  if (Math.abs(val) >= 1e3) return `$${(val / 1e3).toFixed(0)}K`;
  return `$${val.toLocaleString()}`;
}

function fmtPct(val) {
  if (val == null || isNaN(val)) return '--';
  return `${(val * 100).toFixed(1)}%`;
}

function fmtScore(val) {
  if (val == null) return '--';
  return Math.round(val);
}

function fmtRatio(val) {
  if (val == null || isNaN(val)) return '--';
  if (val <= 0) return 'Net Cash';
  return `${val.toFixed(1)}x`;
}

function fmtPE(val) {
  if (val == null || isNaN(val)) return '--';
  if (val < 0) return 'N/A';
  return val.toFixed(1);
}

function fmtDivYield(val) {
  if (val == null || isNaN(val)) return '--';
  return `${(val * 100).toFixed(2)}%`;
}

// ─── Column definitions ──────────────────────────────────────

const ALL_COLUMNS = [
  { key: 'marketCap', label: 'Market Cap', align: 'right', format: fmtValue, defaultVisible: true, source: 'quote' },
  { key: 'moatScore', label: 'Moat Score', align: 'right', format: fmtScore, defaultVisible: true, source: 'score' },
  { key: 'mgmtScore', label: 'Management Score', align: 'right', format: fmtScore, defaultVisible: true, source: 'score' },
  { key: 'r1Score', label: 'Rule #1 Score', align: 'right', format: fmtScore, defaultVisible: true, source: 'score' },
  { key: 'roe', label: 'Return On Equity', align: 'right', format: fmtPct, defaultVisible: true, source: 'metric' },
  { key: 'roic', label: 'Return On Invested Capital', align: 'right', format: fmtPct, defaultVisible: true, source: 'metric' },
  { key: 'fcf', label: 'Free Cash Flow', align: 'right', format: fmtValue, defaultVisible: true, source: 'metric' },
  { key: 'revenue', label: 'Revenue', align: 'right', format: fmtValue, defaultVisible: true, source: 'metric' },
  { key: 'roa', label: 'Return On Assets', align: 'right', format: fmtPct, defaultVisible: false, source: 'metric' },
  { key: 'peRatio', label: 'P/E Ratio', align: 'right', format: fmtPE, defaultVisible: false, source: 'quote' },
  { key: 'netDebtToEarnings', label: 'Net Debt / Earnings', align: 'right', format: fmtRatio, defaultVisible: false, source: 'metric' },
  { key: 'netDebtToFCF', label: 'Net Debt / FCF', align: 'right', format: fmtRatio, defaultVisible: false, source: 'metric' },
  { key: 'ltDebtToEarnings', label: 'LT Debt / Earnings', align: 'right', format: fmtRatio, defaultVisible: false, source: 'metric' },
  { key: 'ltDebtToFCF', label: 'LT Debt / FCF', align: 'right', format: fmtRatio, defaultVisible: false, source: 'metric' },
  { key: 'grossMargin', label: 'Gross Margin', align: 'right', format: fmtPct, defaultVisible: false, source: 'metric' },
  { key: 'netMargin', label: 'Net Margin', align: 'right', format: fmtPct, defaultVisible: false, source: 'metric' },
  { key: 'operatingMargin', label: 'Operating Margin', align: 'right', format: fmtPct, defaultVisible: false, source: 'metric' },
  { key: 'fcfRatio', label: 'FCF Ratio', align: 'right', format: fmtRatio, defaultVisible: false, source: 'metric' },
  { key: 'quickRatio', label: 'Quick Ratio', align: 'right', format: fmtRatio, defaultVisible: false, source: 'metric' },
  { key: 'dividendYield', label: 'Dividend Yield', align: 'right', format: fmtDivYield, defaultVisible: false, source: 'quote' },
  { key: 'guruCount', label: '# of Gurus', align: 'right', format: v => v ?? '--', defaultVisible: false, source: 'guru' },
];

const DEFAULT_COLUMNS = ALL_COLUMNS.filter(c => c.defaultVisible).map(c => c.key);

function loadColumnPrefs() {
  try {
    const saved = localStorage.getItem('sa-competitors-columns');
    return saved ? JSON.parse(saved) : null;
  } catch { return null; }
}

// Industry-aware defaults: financials don't have gross margin / FCF in the traditional sense
function getDefaultColumns(classification) {
  if (classification?.sector === 'Financial Services') {
    return ['marketCap', 'moatScore', 'mgmtScore', 'r1Score', 'roe', 'roic', 'roa', 'peRatio', 'netDebtToEarnings'];
  }
  return DEFAULT_COLUMNS;
}

// ─── Score Badge ─────────────────────────────────────────────

function ScoreBadge({ value }) {
  if (value == null) return <span style={{ color: C.textMuted }}>--</span>;
  const v = Math.round(value);
  let bg = C.scoreBgRed;
  if (v >= 70) bg = C.scoreBgGreen;
  else if (v >= 40) bg = C.scoreBgYellow;
  return (
    <span style={{
      background: bg, color: '#fff', borderRadius: 4, padding: '2px 8px',
      fontSize: 12, fontWeight: 600, display: 'inline-block', minWidth: 32, textAlign: 'center',
    }}>
      {v}
    </span>
  );
}

// ─── Percentile Badge ────────────────────────────────────────

function PercentileBadge({ value, allValues }) {
  if (value == null || !allValues || allValues.length < 3) return null;
  const sorted = [...allValues].filter(v => v != null).sort((a, b) => a - b);
  if (sorted.length < 3) return null;
  const rank = sorted.filter(v => v <= value).length;
  const pctl = Math.round((rank / sorted.length) * 100);
  let color = C.yellow;
  if (pctl >= 75) color = C.green;
  else if (pctl < 25) color = C.red;
  return (
    <span style={{ fontSize: 9, color, marginLeft: 4, fontWeight: 500, opacity: 0.8 }} title={`${pctl}th percentile`}>
      {pctl}th
    </span>
  );
}

// ─── Private Competitor Modal ────────────────────────────────

function PrivateCompetitorModal({ onClose, onSave, editItem }) {
  const [name, setName] = useState(editItem?.name || '');
  const [estRevenue, setEstRevenue] = useState(editItem?.estimatedRevenue || '');
  const [estMarketCap, setEstMarketCap] = useState(editItem?.estimatedMarketCap || '');
  const [notes, setNotes] = useState(editItem?.notes || '');

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({
      id: editItem?.id || crypto.randomUUID(),
      name: name.trim(),
      estimatedRevenue: estRevenue ? parseFloat(estRevenue) : null,
      estimatedMarketCap: estMarketCap ? parseFloat(estMarketCap) : null,
      notes: notes.trim(),
    });
    onClose();
  };

  const inputStyle = {
    width: '100%', padding: '8px 10px', fontSize: 13, borderRadius: 6,
    border: `1px solid ${C.border}`, background: C.bgInput, color: C.text,
    outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10,
        padding: 24, width: 400, maxWidth: '90vw',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 16 }}>
          {editItem ? 'Edit' : 'Add'} Private Competitor
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: 11, color: C.textSecondary, marginBottom: 4, display: 'block' }}>Company Name *</label>
            <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Shein" autoFocus />
          </div>
          <div>
            <label style={{ fontSize: 11, color: C.textSecondary, marginBottom: 4, display: 'block' }}>Estimated Revenue ($)</label>
            <input style={inputStyle} type="number" value={estRevenue} onChange={e => setEstRevenue(e.target.value)} placeholder="e.g. 35000000000" />
          </div>
          <div>
            <label style={{ fontSize: 11, color: C.textSecondary, marginBottom: 4, display: 'block' }}>Estimated Market Cap ($)</label>
            <input style={inputStyle} type="number" value={estMarketCap} onChange={e => setEstMarketCap(e.target.value)} placeholder="e.g. 45000000000" />
          </div>
          <div>
            <label style={{ fontSize: 11, color: C.textSecondary, marginBottom: 4, display: 'block' }}>Notes</label>
            <textarea style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Competition context, market position, etc." />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
          <button onClick={onClose} style={{
            padding: '8px 16px', fontSize: 13, borderRadius: 6, cursor: 'pointer',
            border: `1px solid ${C.border}`, background: C.bgCard, color: C.text,
          }}>Cancel</button>
          <button onClick={handleSave} style={{
            padding: '8px 16px', fontSize: 13, borderRadius: 6, cursor: 'pointer',
            border: 'none', background: C.accent, color: '#fff', fontWeight: 500,
            opacity: name.trim() ? 1 : 0.5,
          }} disabled={!name.trim()}>Save</button>
        </div>
      </div>
    </div>
  );
}

// ─── Industry Benchmark Card ─────────────────────────────────

function BenchmarkCard({ targetCik, peerMetrics, quotes, targetTicker }) {
  const benchmarks = useMemo(() => {
    if (!peerMetrics || peerMetrics.size === 0) return null;
    const numCik = parseInt(targetCik, 10);
    const target = peerMetrics.get(numCik);
    if (!target) return null;

    const metrics = [
      { key: 'roe', label: 'ROE', format: v => `${(v * 100).toFixed(1)}%` },
      { key: 'grossMargin', label: 'Gross Margin', format: v => `${(v * 100).toFixed(1)}%` },
      { key: 'netMargin', label: 'Net Margin', format: v => `${(v * 100).toFixed(1)}%` },
      { key: 'roic', label: 'ROIC', format: v => `${(v * 100).toFixed(1)}%` },
    ];

    return metrics.map(({ key, label, format }) => {
      const allVals = [...peerMetrics.values()].map(d => d[key]).filter(v => v != null && isFinite(v));
      if (allVals.length < 3) return null;
      const sorted = [...allVals].sort((a, b) => a - b);
      const targetVal = target[key];
      if (targetVal == null) return null;
      const min = sorted[0];
      const max = sorted[sorted.length - 1];
      const median = sorted[Math.floor(sorted.length / 2)];
      const p25 = sorted[Math.floor(sorted.length * 0.25)];
      const p75 = sorted[Math.floor(sorted.length * 0.75)];
      const rank = sorted.filter(v => v <= targetVal).length;
      const pctl = Math.round((rank / sorted.length) * 100);
      const pctPosition = max !== min ? ((targetVal - min) / (max - min)) * 100 : 50;
      return { key, label, format, min, max, median, p25, p75, targetVal, pctl, pctPosition };
    }).filter(Boolean);
  }, [targetCik, peerMetrics]);

  if (!benchmarks || benchmarks.length === 0) return null;

  return (
    <div style={{
      background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 8,
      padding: '14px 18px', marginBottom: 16,
    }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: C.textSecondary, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        Industry Benchmarks — {targetTicker} vs Peers
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(benchmarks.length, 4)}, 1fr)`, gap: 16 }}>
        {benchmarks.map(b => (
          <div key={b.key}>
            <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 6 }}>{b.label}</div>
            {/* Bar visualization */}
            <div style={{ position: 'relative', height: 6, background: C.borderLight, borderRadius: 3, marginBottom: 4 }}>
              {/* P25-P75 range */}
              <div style={{
                position: 'absolute', top: 0, bottom: 0, borderRadius: 3,
                left: `${((b.p25 - b.min) / (b.max - b.min)) * 100}%`,
                width: `${((b.p75 - b.p25) / (b.max - b.min)) * 100}%`,
                background: C.border,
              }} />
              {/* Target marker */}
              <div style={{
                position: 'absolute', top: -3, width: 12, height: 12, borderRadius: '50%',
                background: b.pctl >= 75 ? C.green : b.pctl >= 25 ? C.yellow : C.red,
                border: `2px solid ${C.bgCard}`,
                left: `${Math.max(0, Math.min(100, b.pctPosition))}%`,
                transform: 'translateX(-50%)',
              }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: C.textMuted }}>
              <span>{b.format(b.min)}</span>
              <span style={{ color: b.pctl >= 75 ? C.green : b.pctl >= 25 ? C.accent : C.red, fontWeight: 600 }}>
                {b.format(b.targetVal)} ({b.pctl}th)
              </span>
              <span>{b.format(b.max)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Column Selector Dropdown ────────────────────────────────

function ColumnSelector({ visibleColumns, setVisibleColumns, classification }) {
  const [open, setOpen] = useState(false);

  const toggle = (key) => {
    setVisibleColumns(prev => {
      const next = prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key];
      localStorage.setItem('sa-competitors-columns', JSON.stringify(next));
      return next;
    });
  };

  const resetDefaults = () => {
    const defaults = getDefaultColumns(classification);
    setVisibleColumns(defaults);
    localStorage.removeItem('sa-competitors-columns');
  };

  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen(!open)} style={{
        padding: '5px 12px', fontSize: 12, borderRadius: 6, cursor: 'pointer',
        border: `1px solid ${C.border}`, background: C.bgCard, color: C.text,
        display: 'flex', alignItems: 'center', gap: 4,
      }}>
        Columns ({visibleColumns.length}) <span style={{ fontSize: 10 }}>▾</span>
      </button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 100,
            background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 8,
            padding: 8, minWidth: 220, maxHeight: 400, overflowY: 'auto',
            boxShadow: `0 4px 12px ${C.shadow}`,
          }}>
            {ALL_COLUMNS.map(col => (
              <label key={col.key} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px',
                borderRadius: 4, cursor: 'pointer', fontSize: 12, color: C.text,
              }} onMouseEnter={e => e.currentTarget.style.background = C.bgHover}
                 onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <input type="checkbox" checked={visibleColumns.includes(col.key)}
                  onChange={() => toggle(col.key)} style={{ accentColor: C.accent }} />
                {col.label}
              </label>
            ))}
            <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 4, paddingTop: 4 }}>
              <button onClick={resetDefaults} style={{
                fontSize: 11, color: C.accent, background: 'none', border: 'none',
                cursor: 'pointer', padding: '4px 8px',
              }}>Restore Default Layout</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main Competitors Component ──────────────────────────────

export default function Competitors({ company, guruActivities, report, updateReport }) {
  const {
    peers, peerMetrics, peerScores, peerCompleteness, quotes, tier, setTier,
    classification, tierCounts, loading, error, loadScores, scoresRequested,
  } = useCompetitors(company);

  const [visibleColumns, setVisibleColumns] = useState(() => loadColumnPrefs() || getDefaultColumns(classification));
  const [sortKey, setSortKey] = useState('revenue');
  const [sortDir, setSortDir] = useState('desc');
  const [showModal, setShowModal] = useState(false);
  const [editingPrivate, setEditingPrivate] = useState(null);
  const [showSparsePeers, setShowSparsePeers] = useState(false);

  // Trigger score loading when score columns become visible
  const hasScoreCols = visibleColumns.some(k => ['moatScore', 'mgmtScore', 'r1Score'].includes(k));
  useEffect(() => {
    if (hasScoreCols && !scoresRequested && peers.length > 0 && !loading.metrics) {
      loadScores();
    }
  }, [hasScoreCols, scoresRequested, peers.length, loading.metrics]);

  // Private competitors from report
  const privateCompetitors = report?.competitors?.privateCompetitors || [];

  const savePrivateCompetitor = useCallback((item) => {
    const existing = privateCompetitors.filter(p => p.id !== item.id);
    const updated = [...existing, item];
    updateReport(report.id, {
      competitors: { ...report.competitors, privateCompetitors: updated },
    });
  }, [report, privateCompetitors, updateReport]);

  const removePrivateCompetitor = useCallback((id) => {
    const updated = privateCompetitors.filter(p => p.id !== id);
    updateReport(report.id, {
      competitors: { ...report.competitors, privateCompetitors: updated },
    });
  }, [report, privateCompetitors, updateReport]);

  // Build guru counts per ticker
  const guruCounts = useMemo(() => {
    const counts = new Map();
    if (!guruActivities) return counts;
    for (const activity of guruActivities) {
      if (!activity?.holdings) continue;
      for (const h of activity.holdings) {
        if (h.ticker) {
          counts.set(h.ticker, (counts.get(h.ticker) || 0) + 1);
        }
      }
    }
    return counts;
  }, [guruActivities]);

  // Get metric value for a peer
  const getMetricValue = useCallback((peer, colKey) => {
    const numCik = parseInt(peer.cik, 10);
    const metrics = peerMetrics.get(numCik);
    const scores = peerScores.get(numCik);
    const quote = peer.ticker ? quotes.get(peer.ticker) : null;

    switch (colKey) {
      case 'marketCap': return quote?.marketCap ?? null;
      case 'moatScore': return scores?.moatScore ?? null;
      case 'mgmtScore': return scores?.managementScore ?? null;
      case 'r1Score': return scores?.ruleOneScore ?? null;
      case 'roe': return metrics?.roe ?? null;
      case 'roic': return metrics?.roic ?? null;
      case 'roa': return metrics?.roa ?? null;
      case 'fcf': return metrics?.fcf ?? null;
      case 'revenue': return metrics?.revenues ?? null;
      case 'peRatio': return quote?.pe ?? null;
      case 'netDebtToEarnings': return metrics?.netDebtToEarnings ?? null;
      case 'netDebtToFCF': return metrics?.netDebtToFCF ?? null;
      case 'ltDebtToEarnings': return metrics?.ltDebtToEarnings ?? null;
      case 'ltDebtToFCF': return metrics?.ltDebtToFCF ?? null;
      case 'grossMargin': return metrics?.grossMargin ?? null;
      case 'netMargin': return metrics?.netMargin ?? null;
      case 'operatingMargin': return metrics?.operatingMargin ?? null;
      case 'fcfRatio': return metrics?.fcfRatio ?? null;
      case 'quickRatio': return metrics?.quickRatio ?? null;
      case 'dividendYield': return quote?.dividendYield ?? null;
      case 'guruCount': return guruCounts.get(peer.ticker) ?? null;
      default: return null;
    }
  }, [peerMetrics, peerScores, quotes, guruCounts]);

  // Sort peers (filter sparse peers unless toggled on)
  const sortedPeers = useMemo(() => {
    const companyCik = company?.cik?.padStart(10, '0');
    const target = peers.find(p => p.cik === companyCik);
    let others = peers.filter(p => p.cik !== companyCik);

    // Filter sparse peers: hide those with < 17% completeness (< 1 core field)
    if (!showSparsePeers && peerCompleteness.size > 0) {
      others = others.filter(p => {
        const c = peerCompleteness.get(parseInt(p.cik, 10));
        return c == null || c >= 0.17;
      });
    }

    others.sort((a, b) => {
      const aVal = getMetricValue(a, sortKey);
      const bVal = getMetricValue(b, sortKey);
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
    });

    return target ? [target, ...others] : others;
  }, [peers, sortKey, sortDir, getMetricValue, company?.cik, showSparsePeers, peerCompleteness]);

  // Count hidden sparse peers
  const sparsePeerCount = useMemo(() => {
    if (peerCompleteness.size === 0) return 0;
    const companyCik = company?.cik?.padStart(10, '0');
    return peers.filter(p => {
      if (p.cik === companyCik) return false;
      const c = peerCompleteness.get(parseInt(p.cik, 10));
      return c != null && c < 0.17;
    }).length;
  }, [peers, peerCompleteness, company?.cik]);

  // Compute best-in-class values per column for highlighting
  const bestValues = useMemo(() => {
    const bests = {};
    for (const col of ALL_COLUMNS) {
      const vals = peers.map(p => ({ cik: p.cik, val: getMetricValue(p, col.key) })).filter(v => v.val != null);
      if (vals.length === 0) continue;
      // For debt metrics, lower is better
      const isLowerBetter = ['netDebtToEarnings', 'netDebtToFCF', 'ltDebtToEarnings', 'ltDebtToFCF', 'peRatio'].includes(col.key);
      const best = isLowerBetter
        ? vals.reduce((a, b) => (a.val < b.val ? a : b))
        : vals.reduce((a, b) => (a.val > b.val ? a : b));
      bests[col.key] = best.cik;
    }
    return bests;
  }, [peers, getMetricValue]);

  // All values per column (for percentile badges)
  const allColumnValues = useMemo(() => {
    const result = {};
    for (const col of ALL_COLUMNS) {
      result[col.key] = peers.map(p => getMetricValue(p, col.key)).filter(v => v != null);
    }
    return result;
  }, [peers, getMetricValue]);

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const visibleCols = ALL_COLUMNS.filter(c => visibleColumns.includes(c.key));
  const companyCik = company?.cik?.padStart(10, '0');

  if (!classification) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: C.textMuted, fontSize: 14 }}>
        No classification available for this company.
      </div>
    );
  }

  return (
    <div style={{ padding: '0 0 24px' }}>
      {/* Tier Selector */}
      <div style={{
        background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 8,
        padding: '12px 18px', marginBottom: 12,
      }}>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          {[
            { key: 'sector', label: `Sector: ${classification?.sector || '--'}` },
            { key: 'industryGroup', label: `Industry Group: ${classification?.industryGroup || '--'}` },
            { key: 'industry', label: `Industry: ${classification?.industry || '--'}` },
          ].map(t => (
            <label key={t.key} style={{
              display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
              fontSize: 13, color: tier === t.key ? C.text : C.textSecondary,
              fontWeight: tier === t.key ? 500 : 400,
            }}>
              <input type="radio" name="peer-tier" checked={tier === t.key}
                onChange={() => setTier(t.key)} style={{ accentColor: C.accent }} />
              {t.label}
              {tierCounts[t.key] != null && (
                <span style={{ fontSize: 11, color: C.textMuted }}>({tierCounts[t.key]})</span>
              )}
            </label>
          ))}
        </div>
      </div>

      {/* Benchmark Card */}
      <BenchmarkCard targetCik={companyCik} peerMetrics={peerMetrics} quotes={quotes} targetTicker={company?.ticker} />

      {/* Controls Bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 8, padding: '0 4px',
      }}>
        <div style={{ fontSize: 12, color: C.textSecondary }}>
          Companies ({loading.peers ? '...' : peers.length})
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {sparsePeerCount > 0 && (
            <label style={{
              display: 'flex', alignItems: 'center', gap: 4, fontSize: 11,
              color: C.textMuted, cursor: 'pointer',
            }}>
              <input type="checkbox" checked={showSparsePeers}
                onChange={e => setShowSparsePeers(e.target.checked)}
                style={{ accentColor: C.accent }} />
              Show {sparsePeerCount} sparse
            </label>
          )}
          <button onClick={() => { setEditingPrivate(null); setShowModal(true); }} style={{
            padding: '5px 12px', fontSize: 12, borderRadius: 6, cursor: 'pointer',
            border: `1px solid ${C.border}`, background: C.bgCard, color: C.accent,
            fontWeight: 500,
          }}>+ Private Competitor</button>
          <ColumnSelector visibleColumns={visibleColumns} setVisibleColumns={setVisibleColumns} classification={classification} />
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: '10px 14px', marginBottom: 12, background: C.redBg, color: C.red, borderRadius: 6, fontSize: 12 }}>
          {error}
        </div>
      )}

      {/* Data Table */}
      <div style={{ overflowX: 'auto', border: `1px solid ${C.border}`, borderRadius: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: C.bgHover }}>
              <th style={{
                textAlign: 'left', padding: '10px 14px', borderBottom: `1px solid ${C.border}`,
                fontSize: 12, fontWeight: 600, color: C.textSecondary, cursor: 'pointer',
                position: 'sticky', left: 0, background: C.bgHover, zIndex: 1, minWidth: 180,
              }} onClick={() => handleSort('name')}>
                Company {sortKey === 'name' ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
              </th>
              {visibleCols.map(col => (
                <th key={col.key} onClick={() => handleSort(col.key)} style={{
                  textAlign: col.align, padding: '10px 14px', borderBottom: `1px solid ${C.border}`,
                  fontSize: 12, fontWeight: 600, color: C.textSecondary, cursor: 'pointer',
                  whiteSpace: 'nowrap', minWidth: 100,
                }}>
                  {col.label} {sortKey === col.key ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading.peers && peers.length === 0 && (
              <tr><td colSpan={visibleCols.length + 1} style={{ padding: 40, textAlign: 'center', color: C.textMuted }}>
                Loading peers...
              </td></tr>
            )}
            {sortedPeers.map((peer, idx) => {
              const isTarget = peer.cik === companyCik;
              return (
                <tr key={peer.cik} style={{
                  background: isTarget ? C.accentLight : idx % 2 === 0 ? 'transparent' : C.borderLight,
                  borderLeft: isTarget ? `3px solid ${C.accent}` : '3px solid transparent',
                  transition: 'background .1s',
                }}
                  onMouseEnter={e => {
                    if (isTarget) return;
                    e.currentTarget.style.background = C.bgHover;
                    const sticky = e.currentTarget.querySelector('td');
                    if (sticky) sticky.style.background = C.bgHover;
                  }}
                  onMouseLeave={e => {
                    if (isTarget) return;
                    e.currentTarget.style.background = idx % 2 === 0 ? 'transparent' : C.borderLight;
                    const sticky = e.currentTarget.querySelector('td');
                    if (sticky) sticky.style.background = idx % 2 === 0 ? C.bgCard : C.borderLight;
                  }}
                >
                  <td style={{
                    padding: '8px 14px', borderBottom: `1px solid ${C.borderLight}`,
                    position: 'sticky', left: 0, zIndex: 1,
                    background: isTarget ? C.accentLight : idx % 2 === 0 ? C.bgCard : C.borderLight,
                    transition: 'background .1s',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {(() => {
                        const compl = peerCompleteness.get(parseInt(peer.cik, 10));
                        if (compl == null) return null;
                        return (
                          <span title={`${Math.round(compl * 100)}% data available`} style={{
                            width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                            background: compl >= 0.8 ? C.green : compl >= 0.5 ? C.yellow : C.red,
                          }} />
                        );
                      })()}
                      <div>
                        <div style={{ fontWeight: isTarget ? 600 : 400, color: C.text, fontSize: 13 }}>
                          {formatCompanyName(peer.name) || peer.ticker || 'Unknown'}
                        </div>
                        <div style={{ fontSize: 11, color: C.textMuted }}>
                          {peer.ticker || `CIK: ${parseInt(peer.cik, 10)}`}
                        </div>
                      </div>
                    </div>
                  </td>
                  {visibleCols.map(col => {
                    const val = getMetricValue(peer, col.key);
                    const isBest = bestValues[col.key] === peer.cik;
                    const isScoreCol = ['moatScore', 'mgmtScore', 'r1Score'].includes(col.key);
                    const isLoading = (col.source === 'metric' && loading.metrics) ||
                                     (col.source === 'score' && (loading.scores || (!scoresRequested && hasScoreCols)));

                    return (
                      <td key={col.key} style={{
                        textAlign: col.align, padding: '8px 14px',
                        borderBottom: `1px solid ${C.borderLight}`,
                        color: C.text, fontVariantNumeric: 'tabular-nums',
                        background: isBest ? (C.greenBg + '40') : undefined,
                      }}>
                        {isLoading ? (
                          <span style={{ color: C.textMuted, fontSize: 11 }}>...</span>
                        ) : isScoreCol ? (
                          <ScoreBadge value={val} />
                        ) : (
                          <>
                            <span style={{ color: val == null ? C.textMuted : C.text }}>
                              {col.format(val)}
                            </span>
                            {isTarget && <PercentileBadge value={val} allValues={allColumnValues[col.key]} />}
                          </>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}

            {/* Private Competitors */}
            {privateCompetitors.length > 0 && (
              <>
                <tr>
                  <td colSpan={visibleCols.length + 1} style={{
                    padding: '6px 14px', fontSize: 11, fontWeight: 600, color: C.textMuted,
                    textTransform: 'uppercase', letterSpacing: 0.5,
                    borderBottom: `1px solid ${C.border}`, borderTop: `1px solid ${C.border}`,
                    background: C.bgHover,
                  }}>
                    Private Competitors
                  </td>
                </tr>
                {privateCompetitors.map(pc => (
                  <tr key={pc.id} style={{ background: C.borderLight, opacity: 0.8, transition: 'background .1s' }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = C.bgHover;
                      const sticky = e.currentTarget.querySelector('td');
                      if (sticky) sticky.style.background = C.bgHover;
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = C.borderLight;
                      const sticky = e.currentTarget.querySelector('td');
                      if (sticky) sticky.style.background = C.borderLight;
                    }}
                  >
                    <td style={{
                      padding: '8px 14px', borderBottom: `1px solid ${C.borderLight}`,
                      position: 'sticky', left: 0, zIndex: 1, background: C.borderLight,
                      transition: 'background .1s',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontWeight: 400, color: C.text, fontSize: 13 }}>{pc.name}</span>
                        <span style={{
                          fontSize: 9, padding: '1px 5px', borderRadius: 3,
                          background: C.badge, color: C.badgeText, fontWeight: 500,
                        }}>Private</span>
                      </div>
                      {pc.notes && <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>{pc.notes}</div>}
                      <div style={{ display: 'flex', gap: 8, marginTop: 3 }}>
                        <button onClick={() => { setEditingPrivate(pc); setShowModal(true); }}
                          style={{ fontSize: 10, color: C.accent, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                          Edit
                        </button>
                        <button onClick={() => removePrivateCompetitor(pc.id)}
                          style={{ fontSize: 10, color: C.red, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                          Remove
                        </button>
                      </div>
                    </td>
                    {visibleCols.map(col => (
                      <td key={col.key} style={{
                        textAlign: col.align, padding: '8px 14px',
                        borderBottom: `1px solid ${C.borderLight}`,
                        color: C.textMuted, fontStyle: 'italic', fontSize: 12,
                      }}>
                        {col.key === 'marketCap' && pc.estimatedMarketCap ? `Est. ${fmtValue(pc.estimatedMarketCap)}` :
                         col.key === 'revenue' && pc.estimatedRevenue ? `Est. ${fmtValue(pc.estimatedRevenue)}` :
                         '--'}
                      </td>
                    ))}
                  </tr>
                ))}
              </>
            )}
          </tbody>
        </table>
      </div>

      {/* Loading indicators */}
      {(loading.metrics || loading.scores) && (
        <div style={{ padding: '8px 0', fontSize: 11, color: C.textMuted, textAlign: 'center' }}>
          {loading.metrics && 'Loading financial metrics...'}
          {loading.scores && 'Computing scores (this may take a moment)...'}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <PrivateCompetitorModal
          onClose={() => { setShowModal(false); setEditingPrivate(null); }}
          onSave={savePrivateCompetitor}
          editItem={editingPrivate}
        />
      )}
    </div>
  );
}
