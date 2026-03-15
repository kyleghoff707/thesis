import { useState, useEffect, useCallback, useRef } from 'react';
import { C } from '../theme';
import { runTickerAudit, GROUP_ORDER, GROUP_LABELS } from '../engines/tickerAudit';

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
        <GroupDetail group={activeGroup} data={results.groups[activeGroup]} />
      )}

      {/* If no group selected, show all groups inline */}
      {results && !activeGroup && (
        <div>
          {GROUP_ORDER.map(g => {
            const data = results.groups[g];
            if (!data || data.status === 'skip') return null;
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

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
