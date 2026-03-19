import { useState, useEffect, useCallback, useRef } from 'react';
import { C } from '../theme';
import { runTickerAudit, GROUP_ORDER, GROUP_LABELS, saveCoverageBaseline, clearCoverageBaseline } from '../engines/tickerAudit';

const STATUS_COLORS = {
  pass: '#16a34a',
  warn: '#d97706',
  fail: '#dc2626',
  skip: '#94a3b8',
};

const STATUS_ICONS = {
  pass: '\u2713',
  warn: '\u26A0',
  fail: '\u2717',
  skip: '\u2014',
};

export default function TickerDataAudit({ ticker, guruActivities }) {
  const [results, setResults] = useState(null);
  const [running, setRunning] = useState(false);
  const [groupProgress, setGroupProgress] = useState({});
  const [activeGroup, setActiveGroup] = useState(null);
  const [skipFrames, setSkipFrames] = useState(true);
  const [includeQuarterly, setIncludeQuarterly] = useState(false);
  const cancelRef = useRef(false);
  const prevTickerRef = useRef(null);

  // Reset when ticker changes
  useEffect(() => {
    if (ticker !== prevTickerRef.current) {
      prevTickerRef.current = ticker;
      setResults(null);
      setGroupProgress({});
      setActiveGroup(null);
    }
  }, [ticker]);

  const run = useCallback(async () => {
    if (!ticker || running) return;
    cancelRef.current = false;
    setRunning(true);
    setResults(null);
    setGroupProgress({});
    setActiveGroup(null);

    // Mark all groups as pending
    const initial = {};
    for (const g of GROUP_ORDER) initial[g] = 'pending';
    setGroupProgress(initial);

    const result = await runTickerAudit(ticker, {
      skipFrames,
      includeQuarterly,
      guruActivities,
      onProgress: (groupName, status) => {
        if (cancelRef.current) return;
        setGroupProgress(prev => ({ ...prev, [groupName]: status }));
      },
    });

    if (!cancelRef.current) {
      setResults(result);
      setRunning(false);
    }
  }, [ticker, skipFrames, includeQuarterly, guruActivities, running]);

  // Auto-run on first render
  useEffect(() => {
    if (ticker && !results && !running) {
      run();
    }
    return () => { cancelRef.current = true; };
  }, [ticker]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ticker) return null;

  const passCount = results ? GROUP_ORDER.filter(g => results.groups[g]?.status === 'pass').length : 0;
  const warnCount = results ? GROUP_ORDER.filter(g => results.groups[g]?.status === 'warn').length : 0;
  const failCount = results ? GROUP_ORDER.filter(g => results.groups[g]?.status === 'fail').length : 0;
  const skipCount = results ? GROUP_ORDER.filter(g => results.groups[g]?.status === 'skip').length : 0;

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Data Quality Audit</div>
          <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>
            Verifies data availability and integrity across all sources for {ticker}
          </div>
        </div>
        <button
          onClick={run}
          disabled={running}
          style={{
            marginLeft: 'auto',
            background: C.accent, color: '#fff', border: 'none', borderRadius: 6,
            padding: '7px 16px', fontSize: 12, fontWeight: 600, cursor: running ? 'wait' : 'pointer',
            opacity: running ? 0.7 : 1, whiteSpace: 'nowrap',
          }}
        >
          {running ? 'Running...' : results ? 'Re-run Audit' : 'Run Audit'}
        </button>
      </div>

      {/* Options */}
      <div style={{ display: 'flex', gap: 20, marginBottom: 16, fontSize: 12, color: C.textSecondary }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={!skipFrames}
            onChange={e => setSkipFrames(!e.target.checked)}
            disabled={running}
            style={{ accentColor: C.accent }}
          />
          Include Frames Cross-Check
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={includeQuarterly}
            onChange={e => setIncludeQuarterly(e.target.checked)}
            disabled={running}
            style={{ accentColor: C.accent }}
          />
          Include Quarterly Roll-Up
        </label>
      </div>

      {/* Progress / Group Status List */}
      {(running || results) && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          gap: 8,
          marginBottom: 20,
        }}>
          {GROUP_ORDER.map(g => {
            const status = results?.groups[g]?.status || groupProgress[g];
            const isRunning = running && status === 'pending';
            const isDone = status && status !== 'pending';
            const color = isDone ? STATUS_COLORS[status] : C.textMuted;

            return (
              <button
                key={g}
                onClick={() => isDone && setActiveGroup(activeGroup === g ? null : g)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '10px 12px',
                  background: activeGroup === g ? `${color}10` : C.bgCard,
                  border: `1px solid ${activeGroup === g ? color : C.border}`,
                  borderRadius: 8,
                  cursor: isDone ? 'pointer' : 'default',
                  transition: 'all .15s',
                  textAlign: 'left',
                  fontFamily: 'inherit',
                }}
              >
                <span style={{
                  width: 22, height: 22, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, fontSize: 12, fontWeight: 700,
                  background: isDone ? `${color}18` : 'transparent',
                  color: isDone ? color : C.textMuted,
                  border: isDone ? 'none' : `2px solid ${C.border}`,
                }}>
                  {isRunning ? (
                    <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.textMuted} strokeWidth="3">
                        <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
                      </svg>
                    </span>
                  ) : isDone ? STATUS_ICONS[status] : ''}
                </span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: isDone ? C.text : C.textMuted }}>
                    {GROUP_LABELS[g]}
                  </div>
                  {isDone && results?.groups[g] && (
                    <div style={{ fontSize: 10, color, fontWeight: 500, marginTop: 1 }}>
                      {results.groups[g].checks.length} check{results.groups[g].checks.length !== 1 ? 's' : ''}
                      {results.groups[g].duration > 0 && ` \u00B7 ${formatDuration(results.groups[g].duration)}`}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Overall Summary */}
      {results && (
        <div style={{
          display: 'flex', gap: 16, alignItems: 'center',
          padding: '14px 18px', marginBottom: 20,
          background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 8,
        }}>
          <OverallBadge status={results.overall} />
          <Stat label="Pass" value={passCount} color={STATUS_COLORS.pass} />
          <Stat label="Warn" value={warnCount} color={warnCount > 0 ? STATUS_COLORS.warn : C.textMuted} />
          <Stat label="Fail" value={failCount} color={failCount > 0 ? STATUS_COLORS.fail : C.textMuted} />
          {skipCount > 0 && <Stat label="Skip" value={skipCount} color={STATUS_COLORS.skip} />}
          <div style={{ marginLeft: 'auto', fontSize: 11, color: C.textMuted }}>
            {formatDuration(results.totalDuration)} total
          </div>
        </div>
      )}

      {/* Group Detail */}
      {results && activeGroup && results.groups[activeGroup] && (
        activeGroup === 'coverage' && results.groups.coverage?.coverageData
          ? <CoverageDashboard data={results.groups.coverage} ticker={ticker} onRerun={run} />
          : <GroupDetail group={activeGroup} data={results.groups[activeGroup]} />
      )}

      {/* If no group selected, show all groups inline */}
      {results && !activeGroup && (
        <div>
          {GROUP_ORDER.map(g => {
            const data = results.groups[g];
            if (!data || data.status === 'skip') return null;
            if (g === 'coverage' && data.coverageData) {
              return <CoverageDashboard key={g} data={data} ticker={ticker} onRerun={run} compact />;
            }
            return <GroupDetail key={g} group={g} data={data} compact />;
          })}
        </div>
      )}

      {/* Spinner keyframes */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────

function OverallBadge({ status }) {
  const colors = {
    PASS: { bg: 'rgba(22,163,74,0.12)', text: '#16a34a', border: 'rgba(22,163,74,0.25)' },
    WARNINGS: { bg: 'rgba(217,119,6,0.12)', text: '#d97706', border: 'rgba(217,119,6,0.25)' },
    FAIL: { bg: 'rgba(220,38,38,0.12)', text: '#dc2626', border: 'rgba(220,38,38,0.25)' },
  };
  const c = colors[status] || colors.FAIL;
  return (
    <div style={{
      padding: '6px 14px', borderRadius: 6,
      background: c.bg, border: `1px solid ${c.border}`,
      fontSize: 13, fontWeight: 700, color: c.text,
      letterSpacing: '0.02em',
    }}>
      {status}
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div style={{ textAlign: 'center', minWidth: 44 }}>
      <div style={{ fontSize: 20, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 10, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
    </div>
  );
}

function GroupDetail({ group, data, compact }) {
  const statusColor = STATUS_COLORS[data.status] || C.textMuted;

  return (
    <div style={{
      marginBottom: compact ? 12 : 20,
      background: C.bgCard,
      border: `1px solid ${C.border}`,
      borderRadius: 8,
      overflow: 'hidden',
    }}>
      {/* Group header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 14px',
        borderBottom: `1px solid ${C.border}`,
        background: `${statusColor}06`,
      }}>
        <span style={{
          width: 18, height: 18, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 700,
          background: `${statusColor}18`, color: statusColor,
        }}>
          {STATUS_ICONS[data.status]}
        </span>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{GROUP_LABELS[group]}</span>
        <span style={{
          fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
          background: `${statusColor}14`, color: statusColor,
          textTransform: 'uppercase', letterSpacing: '0.04em',
        }}>
          {data.status}
        </span>
        {data.duration > 0 && (
          <span style={{ fontSize: 11, color: C.textMuted, marginLeft: 'auto' }}>
            {formatDuration(data.duration)}
          </span>
        )}
      </div>

      {/* Check rows */}
      <div>
        {data.checks.map((check, i) => {
          const checkColor = STATUS_COLORS[check.status] || C.textMuted;
          return (
            <div key={i} style={{
              display: 'flex', alignItems: 'baseline', gap: 10,
              padding: '7px 14px',
              borderBottom: i < data.checks.length - 1 ? `1px solid ${C.border}40` : 'none',
            }}>
              <span style={{
                width: 16, fontSize: 11, fontWeight: 700, color: checkColor, flexShrink: 0,
                textAlign: 'center',
              }}>
                {STATUS_ICONS[check.status]}
              </span>
              <span style={{ fontSize: 12, fontWeight: 500, color: C.text, minWidth: 160 }}>
                {check.name}
              </span>
              <span style={{ fontSize: 12, color: C.textSecondary, flex: 1 }}>
                {typeof check.detail === 'object' ? JSON.stringify(check.detail) : check.detail}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Coverage Dashboard ───────────────────────────────────────────────

function CoverageDashboard({ data, compact, ticker, onRerun }) {
  const { coverageData } = data;
  const { industryType, latestYear, fieldDetails, tiers, layers, overlayFields, totalResolved, totalExpected, totalPct, delta } = coverageData;
  const statusColor = STATUS_COLORS[data.status] || C.textMuted;
  const [expandedSection, setExpandedSection] = useState(null);
  const [showAllFields, setShowAllFields] = useState(false);

  const TIER_COLORS = { 1: '#2dd4bf', 2: '#60a5fa', 3: '#a78bfa' };
  const LAYER_COLORS = { 1: C.accent, 2: '#f59e0b', derived: '#8b5cf6' };
  const CHANGE_COLORS = { gained: '#16a34a', lost: '#dc2626', changed: '#d97706' };

  const tierFields = (t) => fieldDetails.filter(d => d.tier === t);
  const visibleFields = showAllFields ? fieldDetails : fieldDetails.slice(0, 30);

  const handleResetBaseline = useCallback(() => {
    if (!ticker) return;
    saveCoverageBaseline(ticker, fieldDetails, industryType, latestYear);
    if (onRerun) onRerun();
  }, [ticker, fieldDetails, industryType, latestYear, onRerun]);

  const handleClearBaseline = useCallback(() => {
    if (!ticker) return;
    clearCoverageBaseline(ticker);
    if (onRerun) onRerun();
  }, [ticker, onRerun]);

  return (
    <div style={{
      marginBottom: compact ? 12 : 20,
      background: C.bgCard,
      border: `1px solid ${C.border}`,
      borderRadius: 8,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 14px',
        borderBottom: `1px solid ${C.border}`,
        background: `${statusColor}06`,
      }}>
        <span style={{
          width: 18, height: 18, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 700,
          background: `${statusColor}18`, color: statusColor,
        }}>
          {STATUS_ICONS[data.status]}
        </span>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>XBRL Coverage</span>
        <span style={{
          fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
          background: `${statusColor}14`, color: statusColor,
          textTransform: 'uppercase', letterSpacing: '0.04em',
        }}>
          {data.status}
        </span>
        {industryType !== 'standard' && (
          <span style={{
            fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
            background: `${C.accent}18`, color: C.accent,
            textTransform: 'uppercase', letterSpacing: '0.04em',
          }}>
            {industryType}
          </span>
        )}
        <span style={{ fontSize: 11, color: C.textMuted, marginLeft: 'auto' }}>
          FY{latestYear} · {totalResolved}/{totalExpected} fields ({totalPct}%)
        </span>
      </div>

      <div style={{ padding: '14px' }}>
        {/* Tier Coverage Bars */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          {[
            { label: 'Tier 1 — Scoring', data: tiers.tier1, tier: 1 },
            { label: 'Tier 2 — Display', data: tiers.tier2, tier: 2 },
            { label: 'Tier 3 — Expanded', data: tiers.tier3, tier: 3 },
          ].map(({ label, data: td, tier }) => (
            <div key={tier} style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: C.text }}>{label}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: TIER_COLORS[tier] }}>
                  {td.pct}%
                  {delta && delta.tierDeltas[tier] !== 0 && (
                    <span style={{ fontSize: 9, color: delta.tierDeltas[tier] > 0 ? CHANGE_COLORS.gained : CHANGE_COLORS.lost, marginLeft: 3 }}>
                      {delta.tierDeltas[tier] > 0 ? '+' : ''}{delta.tierDeltas[tier]}
                    </span>
                  )}
                </span>
              </div>
              <div style={{
                height: 6, borderRadius: 3,
                background: `${C.border}80`,
                overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%', borderRadius: 3,
                  width: `${td.pct}%`,
                  background: TIER_COLORS[tier],
                  transition: 'width 0.3s ease',
                }} />
              </div>
              <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>
                {td.resolved}/{td.total} fields
              </div>
            </div>
          ))}
        </div>

        {/* Layer Breakdown */}
        <div style={{
          display: 'flex', gap: 16, marginBottom: 16,
          padding: '10px 12px',
          background: `${C.border}20`, borderRadius: 6,
        }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: C.textSecondary }}>Resolution:</span>
          {[
            { label: 'Layer 1 (Static)', count: layers.layer1, color: LAYER_COLORS[1] },
            { label: 'Layer 2 (Taxonomy)', count: layers.layer2, color: LAYER_COLORS[2] },
            { label: 'Derived', count: layers.derived, color: LAYER_COLORS.derived },
          ].filter(l => l.count > 0).map(({ label, count, color }) => (
            <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{
                width: 8, height: 8, borderRadius: '50%',
                background: color, flexShrink: 0,
              }} />
              <span style={{ fontSize: 11, color: C.text }}>
                {label}: <b>{count}</b>
              </span>
            </span>
          ))}
          {overlayFields.length > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{
                width: 8, height: 8, borderRadius: '50%',
                background: '#ec4899', flexShrink: 0,
              }} />
              <span style={{ fontSize: 11, color: C.text }}>
                Overlay: <b>{overlayFields.length}</b>
              </span>
            </span>
          )}
        </div>

        {/* Coverage Monitor — Changes Since Baseline */}
        {delta && delta.hasChanges && (
          <div style={{
            marginBottom: 16, borderRadius: 6,
            border: `1px solid ${delta.fieldsLost.length > 0 ? CHANGE_COLORS.lost + '40' : CHANGE_COLORS.gained + '40'}`,
            overflow: 'hidden',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 12px',
              background: delta.fieldsLost.length > 0 ? CHANGE_COLORS.lost + '08' : CHANGE_COLORS.gained + '08',
              borderBottom: `1px solid ${C.border}40`,
            }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>
                Changes Since Baseline
              </span>
              <span style={{ fontSize: 10, color: C.textMuted }}>
                {new Date(delta.baselineSavedAt).toLocaleDateString()}
              </span>
              <button
                onClick={handleResetBaseline}
                style={{
                  marginLeft: 'auto', padding: '3px 8px', borderRadius: 4,
                  fontSize: 10, fontWeight: 600, cursor: 'pointer',
                  border: `1px solid ${C.border}`, background: 'transparent',
                  color: C.textSecondary, fontFamily: 'inherit',
                }}
              >
                Accept as New Baseline
              </button>
            </div>

            {/* Gained fields */}
            {delta.fieldsGained.map(f => (
              <div key={'g-' + f.field} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '5px 12px',
                borderBottom: `1px solid ${C.border}20`,
              }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: CHANGE_COLORS.gained, width: 12 }}>+</span>
                <span style={{ fontSize: 11, fontWeight: 500, color: C.text, minWidth: 140 }}>{f.label}</span>
                <span style={{ fontSize: 10, color: C.textSecondary, fontFamily: 'monospace' }}>
                  {f.derived ? 'derived' : f.tag || '—'}
                </span>
                {f.tier > 0 && (
                  <span style={{
                    marginLeft: 'auto', fontSize: 9, fontWeight: 700,
                    padding: '1px 6px', borderRadius: 3,
                    background: `${TIER_COLORS[f.tier]}20`, color: TIER_COLORS[f.tier],
                  }}>
                    T{f.tier}
                  </span>
                )}
              </div>
            ))}

            {/* Lost fields */}
            {delta.fieldsLost.map(f => (
              <div key={'l-' + f.field} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '5px 12px',
                borderBottom: `1px solid ${C.border}20`,
                background: `${CHANGE_COLORS.lost}06`,
              }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: CHANGE_COLORS.lost, width: 12 }}>-</span>
                <span style={{ fontSize: 11, fontWeight: 500, color: C.text, minWidth: 140 }}>{f.label}</span>
                <span style={{ fontSize: 10, color: C.textMuted, fontFamily: 'monospace', textDecoration: 'line-through' }}>
                  {f.derived ? 'derived' : f.tag || '—'}
                </span>
                {f.tier > 0 && (
                  <span style={{
                    marginLeft: 'auto', fontSize: 9, fontWeight: 700,
                    padding: '1px 6px', borderRadius: 3,
                    background: `${TIER_COLORS[f.tier]}20`, color: TIER_COLORS[f.tier],
                  }}>
                    T{f.tier}
                  </span>
                )}
              </div>
            ))}

            {/* Changed tags */}
            {delta.tagsChanged.map(f => (
              <div key={'c-' + f.field} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '5px 12px',
                borderBottom: `1px solid ${C.border}20`,
              }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: CHANGE_COLORS.changed, width: 12 }}>~</span>
                <span style={{ fontSize: 11, fontWeight: 500, color: C.text, minWidth: 140 }}>{f.label}</span>
                <span style={{ fontSize: 10, color: C.textMuted, flex: 1 }}>
                  <span style={{ fontFamily: 'monospace', textDecoration: 'line-through' }}>
                    {f.oldDerived ? 'derived' : f.oldTag || '—'}
                  </span>
                  <span style={{ margin: '0 4px', color: C.textMuted }}>{'\u2192'}</span>
                  <span style={{ fontFamily: 'monospace', color: C.textSecondary }}>
                    {f.newDerived ? 'derived' : f.newTag || '—'}
                  </span>
                </span>
                {f.tier > 0 && (
                  <span style={{
                    fontSize: 9, fontWeight: 700,
                    padding: '1px 6px', borderRadius: 3,
                    background: `${TIER_COLORS[f.tier]}20`, color: TIER_COLORS[f.tier],
                  }}>
                    T{f.tier}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Baseline info bar (no changes) */}
        {delta && !delta.hasChanges && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            marginBottom: 16, padding: '8px 12px',
            background: `${CHANGE_COLORS.gained}08`, borderRadius: 6,
            border: `1px solid ${CHANGE_COLORS.gained}20`,
          }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: CHANGE_COLORS.gained }}>
              {STATUS_ICONS.pass}
            </span>
            <span style={{ fontSize: 11, color: C.text }}>
              No changes since baseline ({new Date(delta.baselineSavedAt).toLocaleDateString()})
            </span>
            <button
              onClick={handleClearBaseline}
              style={{
                marginLeft: 'auto', padding: '3px 8px', borderRadius: 4,
                fontSize: 10, fontWeight: 600, cursor: 'pointer',
                border: `1px solid ${C.border}`, background: 'transparent',
                color: C.textMuted, fontFamily: 'inherit',
              }}
            >
              Reset Baseline
            </button>
          </div>
        )}

        {/* Section Toggles */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          {['all', 'tier1', 'tier2', 'tier3', overlayFields.length > 0 ? 'overlay' : null].filter(Boolean).map(section => {
            const isActive = expandedSection === section || (expandedSection === null && section === 'all');
            const sectionLabel = {
              all: `All (${fieldDetails.length})`,
              tier1: `Tier 1 (${tierFields(1).length})`,
              tier2: `Tier 2 (${tierFields(2).length})`,
              tier3: `Tier 3 (${tierFields(3).length})`,
              overlay: `Overlay (${overlayFields.length})`,
            }[section];
            return (
              <button
                key={section}
                onClick={() => {
                  setExpandedSection(section === 'all' ? null : section);
                  setShowAllFields(false);
                }}
                style={{
                  padding: '4px 10px', borderRadius: 4,
                  fontSize: 10, fontWeight: 600, cursor: 'pointer',
                  border: `1px solid ${isActive ? C.accent : C.border}`,
                  background: isActive ? `${C.accent}14` : 'transparent',
                  color: isActive ? C.accent : C.textSecondary,
                  fontFamily: 'inherit',
                }}
              >
                {sectionLabel}
              </button>
            );
          })}
        </div>

        {/* Field Table */}
        <div style={{ borderRadius: 6, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
          {/* Table Header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '160px 1fr 60px 60px',
            gap: 0,
            padding: '6px 10px',
            background: `${C.border}30`,
            borderBottom: `1px solid ${C.border}`,
          }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Field</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>XBRL Tag</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>Layer</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>Tier</span>
          </div>

          {/* Field Rows */}
          {(() => {
            let fields;
            if (expandedSection === 'tier1') fields = tierFields(1);
            else if (expandedSection === 'tier2') fields = tierFields(2);
            else if (expandedSection === 'tier3') fields = tierFields(3);
            else if (expandedSection === 'overlay') fields = overlayFields;
            else fields = visibleFields;

            return fields.map((d, i) => (
              <div key={d.field} style={{
                display: 'grid',
                gridTemplateColumns: '160px 1fr 60px 60px',
                gap: 0,
                padding: '5px 10px',
                borderBottom: i < fields.length - 1 ? `1px solid ${C.border}40` : 'none',
                background: i % 2 === 0 ? 'transparent' : `${C.border}10`,
              }}>
                <span style={{ fontSize: 11, fontWeight: 500, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {d.label}
                </span>
                <span style={{
                  fontSize: 10, color: d.derived ? C.textMuted : C.textSecondary,
                  fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  fontStyle: d.derived ? 'italic' : 'normal',
                }}>
                  {d.derived ? 'derived' : d.tag || '—'}
                </span>
                <span style={{ textAlign: 'center' }}>
                  <span style={{
                    display: 'inline-block', fontSize: 9, fontWeight: 700,
                    padding: '1px 6px', borderRadius: 3,
                    background: d.derived ? `${LAYER_COLORS.derived}20` : d.layer === 2 ? `${LAYER_COLORS[2]}20` : `${LAYER_COLORS[1]}20`,
                    color: d.derived ? LAYER_COLORS.derived : d.layer === 2 ? LAYER_COLORS[2] : LAYER_COLORS[1],
                  }}>
                    {d.derived ? 'DRV' : `L${d.layer}`}
                  </span>
                </span>
                <span style={{ textAlign: 'center' }}>
                  {d.tier > 0 ? (
                    <span style={{
                      display: 'inline-block', fontSize: 9, fontWeight: 700,
                      padding: '1px 6px', borderRadius: 3,
                      background: `${TIER_COLORS[d.tier]}20`,
                      color: TIER_COLORS[d.tier],
                    }}>
                      T{d.tier}
                    </span>
                  ) : (
                    <span style={{
                      display: 'inline-block', fontSize: 9, fontWeight: 700,
                      padding: '1px 6px', borderRadius: 3,
                      background: '#ec489920', color: '#ec4899',
                    }}>
                      OVR
                    </span>
                  )}
                </span>
              </div>
            ));
          })()}

          {/* Show more toggle */}
          {expandedSection === null && fieldDetails.length > 30 && !showAllFields && (
            <button
              onClick={() => setShowAllFields(true)}
              style={{
                display: 'block', width: '100%', padding: '6px',
                fontSize: 11, fontWeight: 600, color: C.accent,
                background: `${C.accent}08`, border: 'none',
                cursor: 'pointer', fontFamily: 'inherit',
                borderTop: `1px solid ${C.border}40`,
              }}
            >
              Show all {fieldDetails.length} fields
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
