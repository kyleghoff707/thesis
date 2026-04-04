import { C } from '../theme';

function getStatusStyle(status) {
  if (!status) return null;
  const map = {
    KEPT: { bg: C.green, text: '#fff', label: 'KEPT' },
    BROKEN: { bg: C.red, text: '#fff', label: 'BROKEN' },
    PARTIAL: { bg: C.yellow, text: '#fff', label: 'PARTIAL' },
    PENDING: { bg: C.badge, text: C.badgeText, label: 'PENDING' },
  };
  return map[status] || null;
}

const icons = {
  KEPT: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  BROKEN: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  PARTIAL: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12c2-3 4-3 6 0s4 3 6 0 4-3 6 0" />
    </svg>
  ),
  PENDING: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
};

export default function PromiseStatusBadge({ status }) {
  const style = getStatusStyle(status);
  if (!style) return null;

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      padding: '3px 10px',
      borderRadius: 9999,
      fontSize: 11,
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '0.04em',
      background: style.bg,
      color: style.text,
    }}>
      <span style={{ display: 'flex', alignItems: 'center' }}>
        {icons[status]}
      </span>
      {style.label}
    </span>
  );
}

export const _testExports = { getStatusStyle };
