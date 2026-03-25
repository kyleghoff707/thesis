import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { C } from '../theme';

export default function ReportsList({ reports, getReport, createReport }) {
  const navigate = useNavigate();
  const [tickers, setTickers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

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
          if (!cancelled) setTickers(data.tickers || []);
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

  function getApprovalLabel(report) {
    const status = report?.stageApprovals?.onePager;
    if (status === 'approved') return { label: 'Approved', color: C.green };
    if (status === 'rejected') return { label: 'Rejected', color: C.red };
    return { label: 'Pending', color: C.textMuted };
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

      {!loading && !error && tickers.length === 0 && (
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
            Use /generate:one-pager TICKER from Claude Code to generate your first One Pager.
          </div>
        </div>
      )}

      {!loading && tickers.map(ticker => {
        const matchedReport = findReport(ticker);
        const approval = getApprovalLabel(matchedReport);

        if (!matchedReport) {
          // Auto-create research entry for generated report with no matching entry
          const handleAutoCreate = () => {
            if (createReport) {
              const newReport = createReport(ticker);
              navigate(`/research/${newReport.id}/one-pager`);
            }
          };

          return (
            <div
              key={ticker}
              onClick={handleAutoCreate}
              style={{
                border: '1px solid ' + C.border,
                borderRadius: 8,
                padding: '16px 20px',
                marginBottom: 12,
                background: C.bgCard,
                cursor: createReport ? 'pointer' : 'default',
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
                <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>
                  Click to view One Pager
                </div>
              </div>
              <span style={{
                fontSize: 11,
                fontWeight: 600,
                color: C.accent,
                padding: '3px 10px',
                background: C.accent + '14',
                borderRadius: 9999,
              }}>
                One Pager
              </span>
            </div>
          );
        }

        return (
          <div
            key={ticker}
            onClick={() => navigate(`/research/${matchedReport.id}/one-pager`)}
            style={{
              border: '1px solid ' + C.border,
              borderRadius: 8,
              padding: '16px 20px',
              marginBottom: 12,
              background: C.bgCard,
              cursor: 'pointer',
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
                {matchedReport.companyName || '--'}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{
                fontSize: 11,
                fontWeight: 600,
                color: C.accent,
                padding: '3px 10px',
                background: C.accent + '14',
                borderRadius: 9999,
              }}>
                One Pager
              </span>
              <span style={{
                fontSize: 11,
                fontWeight: 600,
                color: approval.color,
              }}>
                {approval.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
