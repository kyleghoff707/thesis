import { useEffect, useCallback } from 'react';
import { C } from '../theme';

const STAGE_COPY = {
  'one-pager': {
    title: ticker => `Generate One Pager for ${ticker}`,
    estimate: '~2-3 minutes, ~$1-2',
    body: 'This kicks off an AI research pipeline. The One Pager is a screening filter -- only generate for companies you\'re seriously considering as investment targets.',
    extra: 'You are beginning a 3-stage research process (One Pager, Pitch Deck, Final Thesis). The full pipeline takes about an hour and ~$12-15 total.',
    confirmLabel: 'Generate One Pager',
  },
  'pitch-deck': {
    title: ticker => `Generate Pitch Deck for ${ticker}`,
    estimate: '~15-25 minutes, ~$4-6',
    body: 'This is a deep 10-section business analysis generated across 3 waves.',
    extra: null,
    confirmLabel: 'Generate Pitch Deck',
  },
  'final-thesis': {
    title: ticker => `Generate Final Thesis for ${ticker}`,
    estimate: '~10-15 minutes, ~$3-4',
    body: 'This is the final conviction gate. Includes checklists, adversarial debate, and valuation confirmation.',
    extra: null,
    confirmLabel: 'Generate Final Thesis',
  },
};

export default function ConfirmGenerateDialog({ ticker, stage, onConfirm, onCancel }) {
  const copy = STAGE_COPY[stage] || STAGE_COPY['one-pager'];

  // Escape key handler
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') onCancel();
  }, [onCancel]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onCancel}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.3)',
          zIndex: 1000,
        }}
      />

      {/* Dialog */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 1001,
          background: C.bgCard,
          border: '1px solid ' + C.border,
          borderRadius: 12,
          padding: 24,
          width: 440,
          boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
        }}
      >
        {/* Title */}
        <div style={{
          fontSize: 16,
          fontWeight: 600,
          color: C.text,
          marginBottom: 16,
        }}>
          {copy.title(ticker)}
        </div>

        {/* Body — estimate + description */}
        <p style={{
          fontSize: 13,
          color: C.textSecondary,
          lineHeight: 1.6,
          margin: '0 0 12px',
        }}>
          This takes <strong style={{ color: C.text }}>{copy.estimate}</strong>.{' '}
          {copy.body}
        </p>

        {/* Extra context (first stage only) */}
        {copy.extra && (
          <p style={{
            fontSize: 13,
            color: C.textSecondary,
            lineHeight: 1.6,
            margin: '0 0 12px',
          }}>
            {copy.extra}
          </p>
        )}

        {/* Button row */}
        <div style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 12,
          marginTop: 24,
        }}>
          {/* Never Mind */}
          <button
            onClick={onCancel}
            style={{
              background: 'transparent',
              border: '1px solid ' + C.border,
              color: C.textSecondary,
              borderRadius: 6,
              padding: '8px 20px',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'all .15s',
            }}
          >
            Never Mind
          </button>

          {/* Confirm */}
          <button
            onClick={onConfirm}
            style={{
              background: C.accent,
              color: '#fff',
              borderRadius: 6,
              padding: '8px 20px',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              border: 'none',
              fontFamily: 'inherit',
              transition: 'background .15s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = C.accentHover}
            onMouseLeave={e => e.currentTarget.style.background = C.accent}
          >
            {copy.confirmLabel}
          </button>
        </div>
      </div>
    </>
  );
}
