import { useState } from 'react';
import { C } from '../theme';

export default function CollapsibleSection({ title, defaultOpen = true, badge, children }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div style={{
      border: `1px solid ${C.border}`,
      borderRadius: 8,
      marginBottom: 12,
      background: C.bgCard,
      boxShadow: '0 1px 3px 0 rgba(0,0,0,0.04)',
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '12px 16px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: C.text,
          fontSize: 13,
          fontWeight: 700,
          textAlign: 'left',
          fontFamily: 'inherit',
          transition: 'all .15s',
        }}
      >
        <span style={{
          display: 'inline-block',
          transition: 'transform 0.15s',
          transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
          fontSize: 10,
          color: C.textMuted,
        }}>
          ▶
        </span>
        {title}
        {badge && <span style={{ marginLeft: 'auto' }}>{badge}</span>}
      </button>
      {open && (
        <div style={{ padding: '0 16px 16px' }}>
          {children}
        </div>
      )}
    </div>
  );
}
