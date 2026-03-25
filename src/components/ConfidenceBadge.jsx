import { C } from '../theme';

export default function ConfidenceBadge({ confidence }) {
  if (!confidence) return null;

  const map = {
    HIGH: { color: C.green, bg: C.greenBg },
    MEDIUM: { color: C.yellow, bg: C.yellowBg },
    LOW: { color: C.red, bg: C.redBg },
  };

  const style = map[confidence];
  if (!style) return null;

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      padding: '2px 8px',
      borderRadius: 4,
      fontSize: 10,
      fontWeight: 600,
      color: style.color,
      background: style.bg,
      textTransform: 'uppercase',
      letterSpacing: '0.04em',
      lineHeight: 1,
    }}>
      {confidence}
    </span>
  );
}
