import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { C } from '../theme';

// Lock icon SVG (10px, scaled from StageNavBar pattern)
function LockIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  );
}

export default function ReportsList({ reports, getReport, createReport }) {
  const navigate = useNavigate();
  const [tickerData, setTickerData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Stage definitions -- pill labels are abbreviated
  // Defined inside component function because C palette is mutable (per Phase 21 decision)
  const STAGE_DEFS = [
    { key: 'one-pager', pillLabel: 'One Pager', approvalKey: 'onePager', stagesKey: 'onePager', gate: null },
    { key: 'pitch-deck', pillLabel: 'Pitch Deck', approvalKey: 'pitchDeck', stagesKey: 'pitchDeck', gate: 'onePager' },
    { key: 'full-story', pillLabel: 'Full Story', approvalKey: 'fullStory', stagesKey: 'fullStory', gate: 'pitchDeck' },
  ];

  const GATE_TOOLTIPS = {
    onePager: 'Approve One Pager to unlock Pitch Deck',
    pitchDeck: 'Approve Pitch Deck to unlock Full Story',
  };

  useEffect(() => {
    let cancelled = false;

    async function fetchTickers() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/thes1s/reports');
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setTickerData(data.tickers || []);
        } else {
          if (!cancelled) setError('Failed to load reports');
        }
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchTickers();

    return () => { cancelled = true; };
  }, []);

  // Find matching report by ticker
  function findReport(ticker) {
    if (!reports) return null;
    return reports.find(r => r.ticker === ticker) || null;
  }

  // Determine stage status: approved | generated | pending | locked
  function getStageStatus(stageDef, stageAvailability, stageApprovals) {
    // Check gate condition first
    if (stageDef.gate && stageApprovals?.[stageDef.gate] !== 'approved') {
      return 'locked'; // Gate blocks access regardless of generation status
    }
    // Gate passed (or no gate) -- check if approved
    if (stageApprovals?.[stageDef.approvalKey] === 'approved') return 'approved';
    // Check if generated (file exists on disk via API response)
    if (stageAvailability?.[stageDef.stagesKey] === true) return 'generated';
    // Not generated
    return 'pending';
  }

  // Pill styling per status (per UI-SPEC color map)
  function getPillStyle(status) {
    const base = {
      fontSize: 11,
      fontWeight: 600,
      padding: '3px 10px',
      borderRadius: 9999,
      textTransform: 'uppercase',
      letterSpacing: '0.04em',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      border: 'none',
      fontFamily: 'inherit',
      transition: 'opacity 0.15s',
    };
    switch (status) {
      case 'approved':
        return { ...base, background: C.green, color: '#fff', cursor: 'pointer' };
      case 'generated':
        return { ...base, background: C.accent + '14', color: C.accent, cursor: 'pointer' };
      case 'pending':
        return { ...base, background: C.badge, color: C.textMuted, cursor: 'default' };
      case 'locked':
        return { ...base, background: C.badge, color: C.textMuted, opacity: 0.5, cursor: 'not-allowed' };
      default:
        return { ...base, background: C.badge, color: C.textMuted, cursor: 'default' };
    }
  }

  // Handle pill click -- navigate for approved/generated, no-op for pending/locked
  function handlePillClick(tickerObj, stageDef, status) {
    if (status === 'pending' || status === 'locked') return;
    let report = findReport(tickerObj.ticker);
    if (!report && createReport) {
      report = createReport(tickerObj.ticker);
    }
    if (report) {
      navigate(`/research/${report.id}/${stageDef.key}`);
    }
  }

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 20 }}>
        Generated Reports
      </h2>

      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 20 }}>
          <div style={{
            width: 20,
            height: 20,
            border: '2px solid ' + C.border,
            borderTopColor: C.accent,
            borderRadius: '50%',
            animation: 'thes1s-spin 1s linear infinite',
          }} />
          <span style={{ fontSize: 13, color: C.textMuted }}>Loading reports...</span>
        </div>
      )}

      {error && (
        <div style={{ fontSize: 13, color: C.red, padding: 20 }}>{error}</div>
      )}

      {!loading && !error && tickerData.length === 0 && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '40vh',
          gap: 8,
        }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>No reports generated yet</div>
          <div style={{ fontSize: 13, color: C.textMuted }}>
            Search a ticker in the Research tab and click Generate One Pager to start.
          </div>
        </div>
      )}

      {!loading && tickerData.map(tickerObj => {
        // Handle both old (string) and new (object) API response shapes
        const ticker = typeof tickerObj === 'string' ? tickerObj : tickerObj.ticker;
        const stages = typeof tickerObj === 'string' ? {} : (tickerObj.stages || {});
        const report = findReport(ticker);
        const stageApprovals = report?.stageApprovals || {};

        return (
          <div
            key={ticker}
            data-tour={tickerObj === tickerData[0] ? 'report-card' : undefined}
            style={{
              border: '1px solid ' + C.border,
              borderRadius: 8,
              padding: '16px 20px',
              marginBottom: 12,
              background: C.bgCard,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = C.bgHover; }}
            onMouseLeave={e => { e.currentTarget.style.background = C.bgCard; }}
          >
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.accent }}>{ticker}</div>
              <div style={{ fontSize: 13, color: C.textSecondary, marginTop: 2 }}>
                {report?.companyName || ticker}
              </div>
              {(() => {
                const matchingReport = findReport(ticker);
                if (!matchingReport) return null;
                return (
                  <span
                    onClick={(e) => { e.stopPropagation(); navigate(`/research/${matchingReport.id}`); }}
                    style={{
                      fontSize: 12,
                      color: C.accent,
                      cursor: 'pointer',
                      display: 'inline-block',
                      marginTop: 2,
                    }}
                    onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
                    onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}
                  >
                    View Toolbox
                  </span>
                );
              })()}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {STAGE_DEFS.map(stageDef => {
                const status = getStageStatus(stageDef, stages, stageApprovals);
                return (
                  <button
                    key={stageDef.key}
                    style={getPillStyle(status)}
                    title={status === 'locked' ? GATE_TOOLTIPS[stageDef.gate] : ''}
                    onClick={() => handlePillClick(
                      typeof tickerObj === 'string' ? { ticker: tickerObj } : tickerObj,
                      stageDef,
                      status,
                    )}
                  >
                    {status === 'locked' && <LockIcon />}
                    {stageDef.pillLabel}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
