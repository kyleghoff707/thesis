import { NavLink, useNavigate } from 'react-router-dom';
import { C } from '../theme';
import TickerSearch from './TickerSearch';

const NAV_TABS = [
  { to: '/watchlists', label: 'Watchlists', end: true, icon: (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  )},
  { to: '/research', label: 'Research', end: false, icon: (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  )},
  { to: '/gurus', label: 'Gurus', end: false, icon: (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" />
    </svg>
  )},
  { to: '/reports', label: 'Reports', end: true, icon: (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" />
    </svg>
  )},
];

function GearIcon({ size = 16, color }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  );
}

export default function Layout({ children, onNewResearch, onSettingsOpen }) {
  const navigate = useNavigate();

  const handleNewResearch = (ticker) => {
    const report = onNewResearch(ticker);
    if (report) {
      navigate(`/research/${report.id}`);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: C.bg, color: C.text }}>
      {/* Top navigation bar */}
      <nav style={{
        height: 52,
        minHeight: 52,
        background: C.header,
        borderBottom: `1px solid ${C.headerBorder}`,
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        gap: 4,
        boxShadow: '0 1px 3px 0 rgba(0,0,0,0.04)',
      }}>
        {/* Settings gear */}
        <button
          onClick={onSettingsOpen}
          title="Settings"
          style={{
            width: 32,
            height: 32,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'transparent',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
            color: C.textMuted,
            transition: 'all .15s',
            flexShrink: 0,
          }}
          onMouseEnter={e => { e.currentTarget.style.background = C.bgHover; e.currentTarget.style.color = C.textSecondary; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.textMuted; }}
        >
          <GearIcon size={16} color="currentColor" />
        </button>

        {/* Logo + brand */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            cursor: 'pointer',
            padding: '4px 8px',
            borderRadius: 6,
            flexShrink: 0,
            marginRight: 8,
          }}
          onClick={() => navigate('/research')}
        >
          <img src="/logo.svg" alt="" style={{ width: 22, height: 22, borderRadius: 4 }} />
          <span style={{
            fontSize: 16,
            fontWeight: 700,
            letterSpacing: '-0.01em',
            color: C.text,
          }}>
            Thes<span style={{ color: C.accent, fontStyle: 'italic' }}>1</span>s
          </span>
        </div>

        {/* Nav tabs */}
        <div style={{ display: 'flex', alignItems: 'center', height: '100%', gap: 0 }}>
          {NAV_TABS.map(tab => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '0 14px',
                height: '100%',
                fontSize: 13,
                fontWeight: isActive ? 600 : 500,
                color: isActive ? C.accent : C.textSecondary,
                textDecoration: 'none',
                borderBottom: isActive ? `2px solid ${C.accent}` : '2px solid transparent',
                transition: 'all .15s',
                whiteSpace: 'nowrap',
              })}
            >
              <span style={{ display: 'flex', alignItems: 'center' }}>{tab.icon}</span>
              {tab.label}
            </NavLink>
          ))}
        </div>

        {/* Search bar — pushed right */}
        <div style={{ marginLeft: 'auto', flexShrink: 0 }}>
          <TickerSearch onSubmit={handleNewResearch} />
        </div>
      </nav>

      {/* Content */}
      <main style={{
        flex: 1,
        overflow: 'auto',
        padding: '20px 24px',
      }}>
        <div style={{ maxWidth: 1400 }}>
          {children}
        </div>
      </main>
    </div>
  );
}
