import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';

// Minimal global reset — all styling is inline via theme.js
const style = document.createElement('style');
style.textContent = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Helvetica, Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    line-height: 1.5;
    font-size: 13px;
  }
  ::-webkit-scrollbar { width: 8px; height: 8px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--scrollbar-thumb, #cbd5e1); border-radius: 4px; }
  ::-webkit-scrollbar-thumb:hover { background: var(--scrollbar-hover, #94a3b8); }
  ::selection { background: rgba(15, 118, 110, 0.15); }
  @media (max-width: 768px) {
    .thes1s-section-nav { display: none !important; }
    .thes1s-two-col { flex-direction: column !important; }
  }
`;
document.head.appendChild(style);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
