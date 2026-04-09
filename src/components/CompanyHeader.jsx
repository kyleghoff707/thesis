import { C } from '../theme';
import { badgeColor } from '../engines/ruleOneScore';
import { formatCompanyName } from '../engines/formatCompanyName';

function ScoreBadge({ label, score, large = false }) {
  const color = badgeColor(score);
  const bgMap = { green: C.scoreBgGreen, yellow: C.scoreBgYellow, red: C.scoreBgRed, gray: C.badge };
  const bg = bgMap[color] || C.badge;
  const textColor = color === 'gray' ? C.badgeText : '#fff';

  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{
        fontSize: 11,
        color: C.textSecondary,
        marginBottom: 4,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
      }}>
        {label}
      </div>
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: large ? '6px 20px' : '4px 14px',
        borderRadius: 6,
        fontSize: large ? 20 : 15,
        fontWeight: 800,
        color: textColor,
        background: bg,
        minWidth: large ? 60 : 48,
      }}>
        {score != null ? score : '--'}
      </div>
    </div>
  );
}

export default function CompanyHeader({ company, latest, moatScore, managementScore, ruleOneScore }) {
  const changeAmt = latest?.change;
  const changePct = latest?.changePct;
  const isPositive = changePct >= 0;
  const changeColor = isPositive ? C.green : C.red;

  return (
    <div data-tour="company-header" style={{
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      padding: '16px 0',
      borderBottom: `1px solid ${C.border}`,
      marginBottom: 16,
    }}>
      {/* Left: company info + price */}
      <div style={{ flex: 1 }}>
        {/* Exchange : Ticker line */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          {company?.exchange && (
            <span style={{
              fontSize: 11,
              fontWeight: 600,
              color: C.textMuted,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}>
              {company.exchange}:
            </span>
          )}
          <span style={{ fontSize: 20, fontWeight: 800, color: C.accent }}>
            {company?.ticker || '---'}
          </span>
          {company?.sicDescription && (
            <span style={{
              fontSize: 11,
              color: C.textMuted,
              marginLeft: 6,
              letterSpacing: '0.02em',
            }}>
              {company.sicDescription}
            </span>
          )}
        </div>

        {/* Company name */}
        <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginTop: 2 }}>
          {formatCompanyName(company?.name) || 'Loading...'}
        </div>

        {/* Price + change */}
        {latest && (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 8 }}>
            <span style={{ fontSize: 22, fontWeight: 700, color: C.text }}>
              ${latest.price?.toFixed(2)}
            </span>
            <span style={{ fontSize: 13, fontWeight: 600, color: changeColor }}>
              {isPositive ? '+' : ''}{changeAmt != null ? `$${Math.abs(changeAmt).toFixed(2)}` : ''}
              {' '}
              ({isPositive ? '+' : ''}{changePct?.toFixed(2)}%)
            </span>
            <span style={{
              fontSize: 11,
              color: C.textMuted,
              fontWeight: 500,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}>
              Last (USD) {company?.exchange ? `(${company.exchange})` : ''}
            </span>
          </div>
        )}
      </div>

      {/* Right: score badges */}
      <div data-tour="score-badges" style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginLeft: 24 }}>
        <ScoreBadge label="Rule #1 Score" score={ruleOneScore} large />
        <div style={{ display: 'flex', gap: 10, marginTop: 2 }}>
          <ScoreBadge label="Moat" score={moatScore} />
          <ScoreBadge label="Mgmt" score={managementScore} />
        </div>
      </div>
    </div>
  );
}
