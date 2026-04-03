// Shared Spinner component for all report viewers
// Injects keyframes once on first import

import { C } from '../theme';

// Inject keyframes once (module-level flag)
let injected = false;
function injectKeyframes() {
  if (injected || typeof document === 'undefined') return;
  const style = document.createElement('style');
  style.textContent = `
    @keyframes thes1s-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    @keyframes thes1s-fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes thes1s-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
  `;
  document.head.appendChild(style);
  injected = true;
}

// Run on first import
injectKeyframes();

export default function Spinner({ size = 20 }) {
  return (
    <div style={{
      width: size,
      height: size,
      border: '2px solid ' + C.border,
      borderTopColor: C.accent,
      borderRadius: '50%',
      animation: 'thes1s-spin 1s linear infinite',
    }} />
  );
}
