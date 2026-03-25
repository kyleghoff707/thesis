import { C } from '../theme';

// Pure function: maps verdict string to style object for badge rendering.
// Returns { bg, text, label } or null for invalid/null verdicts.
function getVerdictStyle(verdict) {
  if (!verdict) return null;
  const map = {
    PASS: { bg: C.green, text: '#fff', label: 'PASS' },
    FAIL: { bg: C.red, text: '#fff', label: 'FAIL' },
    WATCHLIST: { bg: C.yellow, text: '#fff', label: 'WATCHLIST' },
    REVIEW: { bg: C.accent, text: '#fff', label: 'REVIEW' },
  };
  return map[verdict] || null;
}

// SVG icons (12x12 viewBox 24x24, stroke=currentColor, strokeWidth=2)
function CheckIcon() {
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

const VERDICT_ICONS = {
  PASS: CheckIcon,
  FAIL: XIcon,
  WATCHLIST: EyeIcon,
  REVIEW: ClockIcon,
};

export default function VerdictBadge({ verdict, size = 'default' }) {
  const style = getVerdictStyle(verdict);
  if (!style) return null;

  const Icon = VERDICT_ICONS[verdict];
  const isLarge = size === 'large';

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      padding: isLarge ? '6px 16px' : '3px 10px',
      borderRadius: 9999,
      fontSize: isLarge ? 13 : 11,
      fontWeight: 700,
      color: style.text,
      background: style.bg,
      textTransform: 'uppercase',
      letterSpacing: '0.04em',
      lineHeight: 1,
    }}>
      {Icon && (
        <span style={{ display: 'flex', alignItems: 'center' }}>
          <Icon />
        </span>
      )}
      {style.label}
    </span>
  );
}

export const _testExports = { getVerdictStyle };
