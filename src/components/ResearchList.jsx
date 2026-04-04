import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { C } from '../theme';
import { formatCompanyName } from '../engines/formatCompanyName';

const STAGE_LABELS = {
  1: 'One Pager',
  2: 'Pitch Deck',
  3: 'Full Story',
};

function ScoreBadge({ score }) {
  if (score == null) return <span style={{ color: C.textMuted, fontSize: 12 }}>--</span>;
  let bg = C.scoreBgRed;
  if (score >= 70) bg = C.scoreBgGreen;
  else if (score >= 40) bg = C.scoreBgYellow;
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 4,
      fontSize: 12,
      fontWeight: 700,
      color: '#fff',
      background: bg,
    }}>
      {score}
    </span>
  );
}

function StageBadge({ stage }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 10px',
      borderRadius: 9999,
      fontSize: 11,
      fontWeight: 600,
      color: C.accent,
      background: C.accent + '14',
    }}>
      {STAGE_LABELS[stage] || 'Unknown'}
    </span>
  );
}

export default function ResearchList({ reports, onDelete }) {
  const navigate = useNavigate();
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  if (reports.length === 0) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '60vh',
      }}>
        <div style={{ fontSize: 40, marginBottom: 16, color: C.textMuted, opacity: 0.5 }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <line x1="3" y1="9" x2="21" y2="9"/>
            <line x1="9" y1="21" x2="9" y2="9"/>
          </svg>
        </div>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4, color: C.text }}>No research yet</div>
        <div style={{ fontSize: 13, color: C.textMuted }}>Enter a ticker above to start your first analysis</div>
      </div>
    );
  }

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 16px', color: C.text }}>
        Research Pipeline
      </h2>
      <div style={{
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        overflow: 'hidden',
        background: C.bgCard,
      }}>
        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
        }}>
          <thead>
            <tr>
              {['Ticker', 'Company', 'Stage', 'Score', 'Updated', ''].map(h => (
                <th key={h} style={{
                  textAlign: 'left',
                  padding: '10px 14px',
                  color: C.textMuted,
                  fontWeight: 600,
                  fontSize: 11,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  background: C.headerBg,
                  borderBottom: `1px solid ${C.border}`,
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {reports.map((report, idx) => (
              <tr
                key={report.id}
                onClick={() => navigate(`/research/${report.id}`)}
                style={{
                  borderBottom: idx < reports.length - 1 ? `1px solid ${C.borderLight}` : 'none',
                  cursor: 'pointer',
                  transition: 'background .1s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = C.bgHover}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <td style={{ padding: '10px 14px', fontWeight: 700, color: C.accent, fontSize: 13 }}>
                  {report.ticker}
                </td>
                <td style={{ padding: '10px 14px', color: C.textSecondary, fontSize: 13 }}>
                  {formatCompanyName(report.companyName) || '--'}
                </td>
                <td style={{ padding: '10px 14px' }}>
                  <StageBadge stage={report.currentStage} />
                </td>
                <td style={{ padding: '10px 14px' }}>
                  <ScoreBadge score={report.ruleOneScore} />
                </td>
                <td style={{ padding: '10px 14px', color: C.textSecondary, fontSize: 13 }}>
                  {report.updatedAt}
                </td>
                <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); navigate('/reports'); }}
                      style={{
                        padding: '4px 8px',
                        fontSize: 11,
                        fontWeight: 600,
                        color: C.accent,
                        background: 'transparent',
                        border: '1px solid ' + C.border,
                        borderRadius: 6,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        transition: 'all .15s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = C.accentLight; e.currentTarget.style.borderColor = C.accent; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = C.border; }}
                    >
                      View Reports
                    </button>
                    {confirmDeleteId === report.id ? (
                      <div
                        onClick={e => e.stopPropagation()}
                        style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                      >
                        <span style={{ fontSize: 11, color: C.textMuted, marginRight: 2 }}>Are you sure?</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDelete(report.id);
                            setConfirmDeleteId(null);
                          }}
                          style={{
                            padding: '3px 10px',
                            fontSize: 11,
                            fontWeight: 600,
                            background: C.red,
                            color: '#fff',
                            border: 'none',
                            borderRadius: 6,
                            cursor: 'pointer',
                            transition: 'all .15s',
                          }}
                        >
                          Yes
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDeleteId(null);
                          }}
                          style={{
                            padding: '3px 10px',
                            fontSize: 11,
                            fontWeight: 600,
                            background: 'transparent',
                            color: C.textSecondary,
                            border: `1px solid ${C.border}`,
                            borderRadius: 6,
                            cursor: 'pointer',
                            transition: 'all .15s',
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDeleteId(report.id);
                        }}
                        style={{
                          padding: '3px 10px',
                          fontSize: 11,
                          fontWeight: 600,
                          background: 'transparent',
                          color: C.textMuted,
                          border: `1px solid ${C.border}`,
                          borderRadius: 6,
                          cursor: 'pointer',
                          transition: 'all .15s',
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.color = C.red;
                          e.currentTarget.style.borderColor = C.red;
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.color = C.textMuted;
                          e.currentTarget.style.borderColor = C.border;
                        }}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
