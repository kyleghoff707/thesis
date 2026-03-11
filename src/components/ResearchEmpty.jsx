import { C } from '../theme';

export default function ResearchEmpty() {
  return (
    <div style={{ padding: '40px 0' }}>
      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32 }}>
        <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: C.text, margin: 0 }}>Research</h1>
      </div>

      {/* Empty state */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '80px 24px',
        background: C.bgCard,
        border: `1px solid ${C.border}`,
        borderRadius: 8,
      }}>
        <svg width={40} height={40} viewBox="0 0 24 24" fill="none" stroke={C.textMuted} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5, marginBottom: 16 }}>
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <div style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 6 }}>
          Search for a ticker to begin
        </div>
        <div style={{ fontSize: 13, color: C.textSecondary, textAlign: 'center', maxWidth: 320 }}>
          Use the search bar above to look up a company and start your research.
        </div>
      </div>
    </div>
  );
}
