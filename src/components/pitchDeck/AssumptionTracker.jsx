import { useEffect, useRef } from 'react';
import { C } from '../../theme';

// Sidebar panel listing all key assumptions with confidence bars.
// 360px wide, fixed right-side slide-out (same pattern as DeepDivePanel).
// Read-only in Phase 6D — edit capability deferred.

// Confidence level to fill percentage and color
function confidenceToFill(confidence) {
  const level = (confidence || '').toUpperCase();
  switch (level) {
    case 'HIGH': return { width: '100%', color: C.green };
    case 'MEDIUM': return { width: '66%', color: C.yellow };
    case 'LOW': return { width: '33%', color: C.red };
    default: return { width: '50%', color: C.textMuted };
  }
}

export default function AssumptionTracker({ isOpen, onClose, assumptions }) {
  const panelRef = useRef(null);

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

  const items = assumptions || [];

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
          width: 360,
          background: C.bgCard,
          borderLeft: '1px solid ' + C.border,
          zIndex: 1001,
          overflowY: 'auto',
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
            Key Assumptions
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

        {/* Assumption Items */}
        <div style={{ padding: 16 }}>
          {items.length === 0 && (
            <div style={{
              fontSize: 13,
              color: C.textMuted,
              textAlign: 'center',
              paddingTop: 24,
            }}>
              No assumptions tracked yet.
            </div>
          )}

          {items.map((item, i) => {
            const { width, color } = confidenceToFill(item.confidence);
            const isLast = i === items.length - 1;

            return (
              <div
                key={item.key || i}
                style={{
                  paddingBottom: 12,
                  marginBottom: 12,
                  borderBottom: isLast ? 'none' : '1px solid ' + C.borderLight,
                }}
              >
                {/* Label: "FGR Low: 10%" */}
                <div style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: C.text,
                  marginBottom: 6,
                }}>
                  {item.label}{item.value != null ? `: ${item.value}` : ''}
                </div>

                {/* Confidence bar + label row */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 4,
                }}>
                  {/* Bar track */}
                  <div style={{
                    width: 120,
                    height: 6,
                    borderRadius: 3,
                    background: C.border,
                    flexShrink: 0,
                    overflow: 'hidden',
                  }}>
                    {/* Bar fill */}
                    <div style={{
                      width,
                      height: '100%',
                      borderRadius: 3,
                      background: color,
                      transition: 'width 0.3s ease',
                    }} />
                  </div>

                  {/* Confidence label */}
                  <span style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color,
                    textTransform: 'uppercase',
                  }}>
                    {item.confidence || 'UNKNOWN'}
                  </span>
                </div>

                {/* Source */}
                {item.source && (
                  <div style={{
                    fontSize: 10,
                    fontWeight: 400,
                    color: C.textSecondary,
                    marginBottom: 2,
                  }}>
                    Source: {item.source}
                  </div>
                )}

                {/* Affects */}
                {item.affectsSections && item.affectsSections.length > 0 && (
                  <div style={{
                    fontSize: 10,
                    fontWeight: 400,
                    color: C.textMuted,
                  }}>
                    Affects: {item.affectsSections.map(s =>
                      s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
                    ).join(', ')}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
