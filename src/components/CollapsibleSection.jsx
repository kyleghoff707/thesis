import { useState, useRef, useEffect } from 'react';
import { C } from '../theme';

export default function CollapsibleSection({ title, defaultOpen = true, badge, children }) {
  const [open, setOpen] = useState(defaultOpen);
  const contentRef = useRef(null);
  const [height, setHeight] = useState(defaultOpen ? 'auto' : 0);
  const [overflow, setOverflow] = useState(defaultOpen ? 'visible' : 'hidden');

  useEffect(() => {
    if (!contentRef.current) return;

    if (open) {
      // Measure the full height, animate to it, then switch to auto
      const contentHeight = contentRef.current.scrollHeight;
      setOverflow('hidden');
      setHeight(contentHeight);
      const timer = setTimeout(() => {
        setHeight('auto');
        setOverflow('visible');
      }, 280);
      return () => clearTimeout(timer);
    } else {
      // Collapse: set explicit height first so transition works, then go to 0
      const contentHeight = contentRef.current.scrollHeight;
      setHeight(contentHeight);
      setOverflow('hidden');
      // Force reflow before setting to 0
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setHeight(0);
        });
      });
    }
  }, [open]);

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
          padding: '14px 16px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: C.text,
          fontSize: 15,
          fontWeight: 700,
          textAlign: 'left',
          fontFamily: 'inherit',
          transition: 'all .15s',
        }}
      >
        <span style={{
          display: 'inline-block',
          transition: 'transform 0.25s ease',
          transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
          fontSize: 11,
          color: C.textMuted,
        }}>
          ▶
        </span>
        {title}
        {badge && <span style={{ marginLeft: 'auto' }}>{badge}</span>}
      </button>
      <div
        ref={contentRef}
        style={{
          height: height,
          overflow: overflow,
          transition: 'height 0.25s ease',
        }}
      >
        <div style={{ padding: '0 16px 16px' }}>
          {children}
        </div>
      </div>
    </div>
  );
}
