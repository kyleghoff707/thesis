import { useState, useEffect, useRef } from 'react';
import { C } from '../../theme';

// Slide-out panel for deep-dive analysis of section claims.
// Triggered by "Tell me more" links in section narratives.
// 440px wide, fixed right-side, with overlay + Escape/click-outside close.

export default function DeepDivePanel({ isOpen, onClose, title, content, loading }) {
  const panelRef = useRef(null);
  const [visible, setVisible] = useState(false);

  // Animate open/close: mount overlay immediately, slide panel in after a tick
  useEffect(() => {
    if (isOpen) {
      // Small delay to trigger CSS transition from translateX(100%) to translateX(0)
      const raf = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(raf);
    } else {
      setVisible(false);
    }
  }, [isOpen]);

  // Focus trap: focus panel on open
  useEffect(() => {
    if (isOpen && panelRef.current) {
      panelRef.current.focus();
    }
  }, [isOpen]);

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        onClose();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.3)',
          zIndex: 1000,
        }}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        tabIndex={-1}
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 440,
          background: C.bgCard,
          borderLeft: '1px solid ' + C.border,
          zIndex: 1001,
          overflowY: 'auto',
          transform: visible ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 250ms ease-out',
          outline: 'none',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: 16,
          borderBottom: '1px solid ' + C.borderLight,
        }}>
          <span style={{
            fontSize: 16,
            fontWeight: 700,
            color: C.text,
          }}>
            {title || 'Deep Dive'}
          </span>
          <button
            onClick={onClose}
            aria-label="Close panel"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 4,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke={C.textMuted}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Content area */}
        <div style={{ padding: 16 }}>
          {loading ? (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              paddingTop: 40,
            }}>
              {/* Spinner */}
              <div style={{
                width: 24,
                height: 24,
                border: '2px solid ' + C.border,
                borderTopColor: C.accent,
                borderRadius: '50%',
                animation: 'thes1s-spin 1s linear infinite',
              }} />
              <span style={{
                fontSize: 13,
                fontWeight: 400,
                color: C.textSecondary,
              }}>
                Analyzing...
              </span>
            </div>
          ) : content ? (
            <div style={{
              fontSize: 13,
              fontWeight: 400,
              lineHeight: 1.7,
              color: C.text,
            }}>
              {typeof content === 'string' ? (
                // Render string content with paragraph splitting
                content.split('\n\n').map((para, i) => (
                  <p key={i} style={{ marginBottom: 12 }}>{para}</p>
                ))
              ) : (
                // Render React node content directly
                content
              )}
            </div>
          ) : (
            <div style={{
              fontSize: 13,
              color: C.textMuted,
              paddingTop: 24,
              textAlign: 'center',
            }}>
              No content available.
            </div>
          )}
        </div>
      </div>
    </>
  );
}
