import { useState, useEffect, useRef, useCallback } from 'react';
import { C } from '../theme';

// Tooltip position helper — places tooltip relative to the spotlight rect
function computeTooltipPosition(position, rect) {
  const TW = 340;
  const TH = 240;
  const OFF = 20;
  const PAD = 10;
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  if (!rect || position === 'center') return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
  let top, left;
  const rTop = rect.top - PAD, rLeft = rect.left - PAD, rW = rect.width + PAD * 2, rH = rect.height + PAD * 2;
  if (position === 'below') {
    top = Math.min(rTop + rH + OFF, vh - TH - 16);
    left = Math.max(16, Math.min(rLeft + rW / 2 - TW / 2, vw - TW - 16));
  } else if (position === 'above') {
    top = Math.max(16, rTop - TH - OFF);
    left = Math.max(16, Math.min(rLeft + rW / 2 - TW / 2, vw - TW - 16));
  } else if (position === 'right') {
    top = Math.max(16, Math.min(rTop + rH / 2 - TH / 2, vh - TH - 16));
    left = Math.min(rLeft + rW + OFF, vw - TW - 16);
  } else if (position === 'left') {
    top = Math.max(16, Math.min(rTop + rH / 2 - TH / 2, vh - TH - 16));
    left = Math.max(16, rLeft - TW - OFF);
  }
  return { top, left };
}

export default function ProductTour({ steps, step, onNext, onBack, onSkip }) {
  const [rect, setRect] = useState(null);
  const [visible, setVisible] = useState(false);
  const nextBtnRef = useRef(null);
  const backBtnRef = useRef(null);
  const skipBtnRef = useRef(null);

  // Reset visibility immediately when step changes
  const [prevStep, setPrevStep] = useState(step);
  if (step !== prevStep) { setPrevStep(step); setVisible(false); setRect(null); }

  // Measure target element with retries + handle resize
  useEffect(() => {
    if (step < 0 || step >= steps.length) return;
    const cur = steps[step];
    let cancelled = false;

    function measure() {
      if (cancelled) return;
      if (!cur.target) { setRect(null); setVisible(true); return; }
      const el = document.querySelector(`[data-tour="${cur.target}"]`);
      if (!el) return null;
      el.scrollIntoView({ behavior: 'instant', block: cur.scrollTo ? 'center' : 'nearest' });
      requestAnimationFrame(() => {
        if (cancelled) return;
        const r = el.getBoundingClientRect();
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
        setVisible(true);
      });
      return el;
    }

    function tryFind(attempt) {
      if (cancelled) return;
      if (!cur.target) { setRect(null); setVisible(true); return; }
      const el = document.querySelector(`[data-tour="${cur.target}"]`);
      if (!el) {
        if (attempt < 4) { setTimeout(() => tryFind(attempt + 1), attempt < 2 ? 150 : 300); return; }
        setRect(null); setVisible(true); return;
      }
      measure();
    }

    // Start after two animation frames (let React render complete)
    const raf = requestAnimationFrame(() => { requestAnimationFrame(() => tryFind(0)); });

    // Recalculate on window resize
    function onResize() { measure(); }
    window.addEventListener('resize', onResize);

    return () => { cancelled = true; cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); };
  }, [step, steps]);

  // Escape key to dismiss
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') onSkip();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onSkip]);

  // Focus the Next button when step becomes visible
  useEffect(() => {
    if (visible && nextBtnRef.current) {
      nextBtnRef.current.focus();
    }
  }, [visible, step]);

  // Focus trap: Tab cycles between Back/Next/Skip
  const handleKeyDown = useCallback((e) => {
    if (e.key !== 'Tab') return;
    const buttons = [backBtnRef.current, nextBtnRef.current, skipBtnRef.current].filter(Boolean);
    if (buttons.length === 0) return;
    const idx = buttons.indexOf(document.activeElement);
    e.preventDefault();
    if (e.shiftKey) {
      const prev = idx <= 0 ? buttons.length - 1 : idx - 1;
      buttons[prev].focus();
    } else {
      const next = idx >= buttons.length - 1 ? 0 : idx + 1;
      buttons[next].focus();
    }
  }, []);

  if (step < 0 || !visible) return null;
  const cur = steps[step];
  const total = steps.length;
  const bg = C.bgCard;
  const txt = C.text;
  const muted = C.textSecondary;
  const bdr = C.border;
  const dotInactive = C.border;
  const accent = C.accent;
  const tooltipPos = computeTooltipPosition(cur.position, rect);
  const P = 10;

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9999, pointerEvents: 'auto' }}
      onKeyDown={handleKeyDown}
    >
      {/* SVG mask spotlight or full overlay */}
      {rect ? (
        <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, display: 'block', pointerEvents: 'none' }}>
          <defs><mask id="tour-mask">
            <rect width="100%" height="100%" fill="white"/>
            <rect x={rect.left - P} y={rect.top - P} width={rect.width + P * 2} height={rect.height + P * 2} rx={8} fill="black"/>
          </mask></defs>
          <rect width="100%" height="100%" fill="rgba(0,0,0,0.55)" mask="url(#tour-mask)"/>
        </svg>
      ) : (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', pointerEvents: 'none' }}/>
      )}

      {/* Highlight border around target */}
      {rect && (
        <div style={{ position: 'fixed', top: rect.top - P, left: rect.left - P,
          width: rect.width + P * 2, height: rect.height + P * 2, borderRadius: 8,
          border: `2px solid ${accent}`, boxShadow: `0 0 0 3px ${accent}33`,
          pointerEvents: 'none', transition: 'top 0.25s ease, left 0.25s ease, width 0.25s ease, height 0.25s ease' }}/>
      )}

      {/* Tooltip card */}
      <div
        role="dialog"
        aria-label={`Product tour step ${step + 1} of ${total}`}
        style={{ ...tooltipPos, position: 'fixed', pointerEvents: 'auto', background: bg,
          border: `1px solid ${bdr}`, borderRadius: 8, padding: '20px 24px', maxWidth: 340, minWidth: 280,
          boxShadow: `0 8px 32px ${C.shadow}`,
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif", zIndex: 10000,
          transition: 'top 0.25s ease, left 0.25s ease' }}
      >
        {/* Step counter — matches ScoreBadge label style */}
        <div style={{ fontSize: 11, fontWeight: 600, color: accent, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
          Step {step + 1} of {total}
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: txt, marginBottom: 8, lineHeight: 1.3 }}>
          {cur.title}
        </div>
        <div style={{ fontSize: 13, color: muted, lineHeight: 1.6, marginBottom: 20 }}>
          {cur.body}
        </div>

        {/* Progress dots */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
          {steps.map((_, i) => (
            <div key={i} style={{ width: i === step ? 18 : 6, height: 6, borderRadius: 3,
              background: i === step ? accent : dotInactive, transition: 'all 0.2s ease' }}/>
          ))}
        </div>

        {/* Navigation buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {step > 0 && (
            <button ref={backBtnRef} onClick={onBack} style={{ padding: '7px 16px', borderRadius: 8,
              border: `1px solid ${bdr}`, background: 'transparent', color: txt,
              fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              outline: 'none' }}
              onFocus={e => e.currentTarget.style.boxShadow = `0 0 0 2px ${accent}`}
              onBlur={e => e.currentTarget.style.boxShadow = 'none'}>
              Back
            </button>
          )}
          <button ref={nextBtnRef} onClick={onNext} style={{ flex: 1, padding: '7px 16px', borderRadius: 8,
            border: 'none', background: accent, color: '#fff', fontSize: 12, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit', outline: 'none' }}
            onFocus={e => e.currentTarget.style.boxShadow = `0 0 0 2px ${accent}, 0 0 0 4px ${bg}`}
            onBlur={e => e.currentTarget.style.boxShadow = 'none'}>
            {step === total - 1 ? 'Finish' : 'Next \u2192'}
          </button>
          {step < total - 1 && (
            <button ref={skipBtnRef} onClick={onSkip} style={{ padding: '7px 12px', borderRadius: 8,
              border: 'none', background: 'transparent', color: muted, fontSize: 12,
              cursor: 'pointer', fontFamily: 'inherit', outline: 'none' }}
              onFocus={e => e.currentTarget.style.boxShadow = `0 0 0 2px ${accent}`}
              onBlur={e => e.currentTarget.style.boxShadow = 'none'}>
              Skip
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
