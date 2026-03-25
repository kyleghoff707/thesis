import { useEffect, useRef } from 'react';
import { C } from '../../theme';

// Popover glossary card for industry-specific terms and KPIs.
// Triggered by dashed-underline terms in section narrative text.
// 320px wide, positioned absolutely below the trigger element.

export default function IndustryCard({
  isOpen,
  onClose,
  term,
  category,
  definition,
  benchmarks,
  position,
}) {
  const cardRef = useRef(null);

  // Click-outside handler
  useEffect(() => {
    if (!isOpen) return;
    function handleMouseDown(e) {
      if (cardRef.current && !cardRef.current.contains(e.target)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const top = position?.top ?? 0;
  const left = position?.left ?? 0;

  return (
    <div
      ref={cardRef}
      style={{
        position: 'absolute',
        top,
        left,
        width: 320,
        background: C.bgCard,
        border: '1px solid ' + C.border,
        borderRadius: 8,
        boxShadow: `0 4px 12px ${C.shadow}`,
        padding: 16,
        zIndex: 1000,
      }}
    >
      {/* Term */}
      <div style={{
        fontSize: 16,
        fontWeight: 700,
        color: C.text,
        marginBottom: term && category ? 0 : 8,
      }}>
        {term || 'Term'}
      </div>

      {/* Category */}
      {category && (
        <div style={{
          fontSize: 10,
          fontWeight: 400,
          color: C.textMuted,
          marginBottom: 8,
        }}>
          ({category})
        </div>
      )}

      {/* Definition label */}
      <div style={{
        fontSize: 10,
        fontWeight: 700,
        color: C.textMuted,
        textTransform: 'uppercase',
        marginTop: 12,
        marginBottom: 4,
      }}>
        Definition
      </div>

      {/* Definition text */}
      <div style={{
        fontSize: 13,
        fontWeight: 400,
        lineHeight: 1.5,
        color: C.text,
      }}>
        {definition || 'No definition available.'}
      </div>

      {/* Industry Benchmark */}
      {benchmarks && benchmarks.length > 0 && (
        <>
          <div style={{
            fontSize: 10,
            fontWeight: 700,
            color: C.textMuted,
            textTransform: 'uppercase',
            marginTop: 12,
            marginBottom: 4,
          }}>
            Industry Benchmark
          </div>
          {benchmarks.map((b, i) => (
            <div key={i} style={{
              fontSize: 13,
              fontWeight: b.isCompany ? 700 : 400,
              color: b.isCompany ? C.text : C.textSecondary,
              marginBottom: 2,
              lineHeight: 1.5,
            }}>
              {b.label}: {b.value}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
