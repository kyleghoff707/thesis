import { C } from '../theme';
import { cellColor, badgeColor } from '../engines/thesisScoreV2';

const PERIOD_COLS = [
  { key: '10yr', label: '10 Years' },
  { key: '7yr', label: '7 Years' },
  { key: '5yr', label: '5 Years' },
  { key: '3yr', label: '3 Years' },
  { key: '1yr', label: '1 Year' },
];

// Vibrant cell backgrounds — same for light and dark
const CELL_BG = { green: '#16a34a', yellow: '#ca8a04', red: '#dc2626' };

function getCellBg(color) {
  const isDark = C.bg === '#0f172a';
  if (color === 'gray') return C.bgHover;
  return CELL_BG[color] || 'transparent';
}

const cellBase = {
  padding: '8px 12px',
  textAlign: 'center',
  fontSize: 13,
  fontWeight: 600,
  fontVariantNumeric: 'tabular-nums',
};

// thresholds: { full, partial } — caller supplies per-metric cutoffs.
// Falls back to gray when not provided (v1 used hardcoded 10%/5%).
function RateCell({ rate, scored = true, thresholds }) {
  if (rate == null) return <td style={{ ...cellBase, color: C.textMuted }}>-</td>;
  const color = (scored && thresholds)
    ? cellColor(rate, thresholds.full, thresholds.partial)
    : 'gray';
  return (
    <td style={{ ...cellBase, background: getCellBg(color), color: color === 'gray' ? C.textMuted : '#fff' }}>
      {(rate * 100).toFixed(1)}%
    </td>
  );
}

function DebtCell({ value, isNetCash }) {
  if (value == null && !isNetCash) return <td style={{ ...cellBase, color: C.textMuted }}>-</td>;
  const years = isNetCash ? 0 : value;
  // 3-tier: net cash → green, 0-3 years → beige, >3 years → red
  const bg = years <= 0 ? CELL_BG.green : years <= 3 ? CELL_BG.yellow : CELL_BG.red;
  return (
    <td style={{ ...cellBase, background: bg, color: '#fff' }}>
      {years.toFixed(1)} Years
    </td>
  );
}

function ScoreBadge({ score }) {
  if (score == null) return <td style={{ ...cellBase, textAlign: 'center' }}>-</td>;
  const color = badgeColor(score);
  const bgMap = { green: C.scoreBgGreen, yellow: C.scoreBgYellow, red: C.scoreBgRed, gray: C.badge };
  return (
    <td style={{ ...cellBase, textAlign: 'center' }}>
      <span style={{
        display: 'inline-block',
        padding: '3px 14px',
        borderRadius: 4,
        fontSize: 13,
        fontWeight: 700,
        color: '#fff',
        background: bgMap[color],
        minWidth: 40,
      }}>
        {Math.round(score)}
      </span>
    </td>
  );
}

// rows: [{ label, rates, score, type?, thresholds?, debtValue?, isNetCash?, valueText? }]
//   type: 'rate' (default — uses rates+thresholds), 'debt' (uses debtValue+isNetCash),
//         'simple' (single-cell row, optional valueText, no period columns)
export default function ScoreTable({ sectionTitle, rows, overallLabel, overallScore }) {
  return (
    <div style={{ marginBottom: 16 }}>
      {sectionTitle && (
        <div style={{ fontSize: 15, fontWeight: 700, color: C.accent, marginBottom: 8 }}>
          {sectionTitle}
        </div>
      )}

      <div style={{ borderRadius: 8, overflow: 'hidden', border: `1px solid ${C.borderLight}` }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${C.border}` }}>
              <th style={{
                textAlign: 'left', padding: '8px 12px',
                color: C.textSecondary,
                fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em',
                minWidth: 200,
              }} />
              {PERIOD_COLS.map(p => (
                <th key={p.key} style={{
                  textAlign: 'center', padding: '8px 10px',
                  color: p.key === '1yr' ? C.textMuted : C.textSecondary,
                  fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em',
                  minWidth: 90,
                }}>
                  {p.label}
                </th>
              ))}
              <th style={{
                textAlign: 'center', padding: '8px 12px',
                color: C.textSecondary,
                fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em',
                minWidth: 70,
              }}>
                Score
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.label} style={{ borderBottom: `1px solid ${C.borderLight}` }}>
                <td style={{ padding: '8px 12px', fontSize: 13, color: C.text, fontWeight: 500 }}>
                  {row.label}
                </td>
                {row.type === 'debt' ? (
                  <>
                    <td style={cellBase} />
                    <td style={cellBase} />
                    <td style={cellBase} />
                    <td style={cellBase} />
                    <DebtCell value={row.debtValue} isNetCash={row.isNetCash} />
                  </>
                ) : row.type === 'simple' ? (
                  <td colSpan={PERIOD_COLS.length} style={{ ...cellBase, color: C.textMuted, textAlign: 'left', paddingLeft: 14 }}>
                    {row.valueText || ''}
                  </td>
                ) : (
                  PERIOD_COLS.map(p => (
                    <RateCell key={p.key} rate={row.rates?.[p.key]} scored={p.key !== '1yr'} thresholds={row.thresholds} />
                  ))
                )}
                <ScoreBadge score={row.score} />
              </tr>
            ))}
            {overallLabel && overallScore != null && (
              <tr style={{ borderTop: `2px solid ${C.border}` }}>
                <td style={{ padding: '10px 12px', fontSize: 14, fontWeight: 700, color: C.text }}>
                  {overallLabel}
                </td>
                <td colSpan={5} />
                <ScoreBadge score={overallScore} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
