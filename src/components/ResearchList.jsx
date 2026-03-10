import { useNavigate } from 'react-router-dom';
import { C } from '../theme';

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
      padding: '2px 8px',
      borderRadius: 4,
      fontSize: 11,
      fontWeight: 600,
      color: C.badgeText,
      background: C.badge,
    }}>
      {STAGE_LABELS[stage] || 'Unknown'}
    </span>
  );
}

export default function ResearchList({ reports, onDelete }) {
  const navigate = useNavigate();

  if (reports.length === 0) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '60vh',
        color: C.textSecondary,
      }}>
        <div style={{ fontSize: 40, marginBottom: 16, opacity: 0.3 }}>◫</div>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>No research yet</div>
        <div style={{ fontSize: 13 }}>Enter a ticker above to start your first analysis</div>
      </div>
    );
  }

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 16px', color: C.text }}>
        Research Pipeline
      </h2>
      <table style={{
        width: '100%',
        borderCollapse: 'collapse',
        fontSize: 13,
      }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${C.border}` }}>
            {['Ticker', 'Company', 'Stage', 'Score', 'Updated', ''].map(h => (
              <th key={h} style={{
                textAlign: 'left',
                padding: '8px 12px',
                color: C.textSecondary,
                fontWeight: 600,
                fontSize: 11,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {reports.map(report => (
            <tr
              key={report.id}
              onClick={() => navigate(`/research/${report.id}/toolbox`)}
              style={{
                borderBottom: `1px solid ${C.borderLight}`,
                cursor: 'pointer',
              }}
              onMouseEnter={e => e.currentTarget.style.background = C.bgHover}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <td style={{ padding: '10px 12px', fontWeight: 700, color: C.accent }}>
                {report.ticker}
              </td>
              <td style={{ padding: '10px 12px', color: C.textSecondary }}>
                {report.companyName || '--'}
              </td>
              <td style={{ padding: '10px 12px' }}>
                <StageBadge stage={report.currentStage} />
              </td>
              <td style={{ padding: '10px 12px' }}>
                <ScoreBadge score={report.ruleOneScore} />
              </td>
              <td style={{ padding: '10px 12px', color: C.textSecondary }}>
                {report.updatedAt}
              </td>
              <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`Delete research for ${report.ticker}?`)) {
                      onDelete(report.id);
                    }
                  }}
                  style={{
                    padding: '4px 8px',
                    fontSize: 11,
                    background: 'transparent',
                    color: C.textMuted,
                    border: `1px solid ${C.borderLight}`,
                    borderRadius: 4,
                    cursor: 'pointer',
                  }}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
