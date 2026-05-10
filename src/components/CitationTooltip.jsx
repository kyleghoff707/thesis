import { useState } from 'react';
import { C } from '../theme';

const THES1S_SOURCES = [
  'DataPacket', 'Competitors Tab', 'Growth Analysis', 'Guru Holdings',
  'Financials Tab', 'Valuation Tab', 'Overview Tab', 'Insiders Tab',
  'Filings Tab',
];

// Detect citation type: thesis (app data), sec (SEC filings), web (external)
function getCitationType(source) {
  if (!source) return 'web';
  const lower = source.toLowerCase();
  if (THES1S_SOURCES.some(s => lower.includes(s.toLowerCase()))) return 'thesis';
  if (/10-k|10-q|8-k|proxy|sec\b/i.test(source)) return 'sec';
  return 'web';
}

const TYPE_STYLES = {
  thesis: () => ({ color: C.accent }),
  sec: () => ({ color: C.textSecondary }),
  web: () => ({ color: '#3b82f6' }),
};

const TYPE_ICONS = {
  thesis: (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  ),
  sec: (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  ),
  web: (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  ),
};

export default function CitationTooltip({ citation, onClick }) {
  const [showTooltip, setShowTooltip] = useState(false);

  if (!citation) return null;

  const type = getCitationType(citation.source);
  const typeStyle = TYPE_STYLES[type]();
  const truncatedText = citation.text && citation.text.length > 120
    ? citation.text.slice(0, 120) + '...'
    : citation.text;

  return (
    <span
      style={{ position: 'relative', display: 'inline' }}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <sup
        onClick={() => onClick && onClick(citation)}
        style={{
          cursor: 'pointer',
          color: typeStyle.color,
          fontSize: 10,
          fontWeight: 700,
          marginLeft: 1,
        }}
      >
        [{citation.id}]
      </sup>
      {showTooltip && (
        <div style={{
          position: 'absolute',
          bottom: '100%',
          left: '50%',
          transform: 'translateX(-50%)',
          background: C.tooltipBg,
          color: C.tooltipText,
          padding: '6px 10px',
          borderRadius: 6,
          fontSize: 11,
          lineHeight: 1.4,
          whiteSpace: 'normal',
          maxWidth: 300,
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          zIndex: 1000,
          pointerEvents: 'none',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
            <span style={{ display: 'flex', alignItems: 'center', color: typeStyle.color }}>
              {TYPE_ICONS[type]}
            </span>
            <span style={{ fontWeight: 600 }}>{citation.source}</span>
          </div>
          {truncatedText && (
            <div style={{ opacity: 0.85 }}>{truncatedText}</div>
          )}
        </div>
      )}
    </span>
  );
}

// Render text with inline citation references replaced by CitationTooltip components
export function renderTextWithCitations(text, citations, onCitationClick) {
  if (!text) return null;
  if (!citations || citations.length === 0) return text;

  const citationMap = {};
  for (const c of citations) {
    citationMap[c.id] = c;
  }

  // Split text on [N] patterns
  const parts = text.split(/(\[\d+\])/g);
  if (parts.length === 1) return text;

  return parts.map((part, i) => {
    const match = part.match(/^\[(\d+)\]$/);
    if (match) {
      const id = parseInt(match[1], 10);
      const citation = citationMap[id];
      if (citation) {
        return <CitationTooltip key={i} citation={citation} onClick={onCitationClick} />;
      }
    }
    return part;
  });
}
