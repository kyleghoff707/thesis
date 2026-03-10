import { C } from '../theme';
import { badgeColor } from '../engines/ruleOneScore';

function ScoreBadge({ label, score }) {
  const color = badgeColor(score);
  const bgMap = { green: C.scoreBgGreen, yellow: C.scoreBgYellow, red: C.scoreBgRed, gray: C.badge };
  const bg = bgMap[color] || C.badge;

  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 10, color: C.textSecondary, marginBottom: 2, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {label}
      </div>
      <div style={{
        display: 'inline-block',
        padding: '4px 12px',
        borderRadius: 6,
        fontSize: 16,
        fontWeight: 800,
        color: '#fff',
        background: bg,
        minWidth: 44,
      }}>
        {score != null ? score : '--'}
      </div>
    </div>
  );
}

export default function CompanyHeader({ company, latest, moatScore, managementScore, ruleOneScore }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '16px 0',
      borderBottom: `1px solid ${C.border}`,
      marginBottom: 16,
    }}>
      {/* Left: company info */}
      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={{ fontSize: 24, fontWeight: 800, color: C.text }}>
            {company?.ticker || '---'}
          </span>
          <span style={{ fontSize: 14, color: C.textSecondary }}>
            {company?.exchange || ''}
          </span>
        </div>
        <div style={{ fontSize: 15, color: C.textSecondary, marginTop: 2 }}>
          {company?.name || 'Loading...'}
        </div>
        {company?.sicDescription && (
          <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>
            {company.sicDescription}
          </div>
        )}
      </div>

      {/* Center: price */}
      {latest && (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: C.text }}>
            ${latest.price?.toFixed(2)}
          </div>
          <div style={{
            fontSize: 12,
            fontWeight: 600,
            color: latest.changePct >= 0 ? C.green : C.red,
          }}>
            {latest.changePct >= 0 ? '+' : ''}{latest.changePct?.toFixed(2)}%
          </div>
          <div style={{ fontSize: 10, color: C.textMuted }}>{latest.date}</div>
        </div>
      )}

      {/* Right: score badges */}
      <div style={{ display: 'flex', gap: 16 }}>
        <ScoreBadge label="Moat" score={moatScore} />
        <ScoreBadge label="Mgmt" score={managementScore} />
        <ScoreBadge label="R1 Score" score={ruleOneScore} />
      </div>
    </div>
  );
}
