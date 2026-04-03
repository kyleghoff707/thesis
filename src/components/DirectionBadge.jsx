import { C } from '../theme';

export default function DirectionBadge({ direction }) {
  const map = {
    Bull: { bg: C.green, label: 'BULL' },
    Bear: { bg: C.red, label: 'BEAR' },
    Neutral: { bg: C.yellow, label: 'NEUTRAL' },
  };
  const style = map[direction];
  if (!style) return null;

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '6px 16px',
      borderRadius: 9999,
      fontSize: 13,
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '0.04em',
      background: style.bg,
      color: '#fff',
    }}>
      {style.label}
    </span>
  );
}
