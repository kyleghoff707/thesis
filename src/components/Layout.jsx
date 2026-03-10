import { NavLink, useNavigate } from 'react-router-dom';
import { C } from '../theme';
import TickerSearch from './TickerSearch';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: '◫' },
  { to: '/validation', label: 'Validation', icon: '✓' },
];

function GearIcon({ size = 16, color }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill={color} xmlns="http://www.w3.org/2000/svg">
      <path d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492zM5.754 8a2.246 2.246 0 1 1 4.492 0 2.246 2.246 0 0 1-4.492 0z"/>
      <path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52l-.094-.319zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 0 0 2.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 0 0 1.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 0 0-1.115 2.693l.16.291c.415.764-.421 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 0 0-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 0 0-2.692-1.115l-.292.16c-.764.415-1.6-.421-1.184-1.185l.159-.291A1.873 1.873 0 0 0 1.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 0 0 3.06 4.377l-.16-.292c-.415-.764.421-1.6 1.185-1.184l.292.159a1.873 1.873 0 0 0 2.692-1.115l.094-.319z"/>
    </svg>
  );
}

export default function Layout({ children, onNewResearch, onSettingsOpen }) {
  const navigate = useNavigate();

  const handleNewResearch = (ticker) => {
    const report = onNewResearch(ticker);
    if (report) {
      navigate(`/research/${report.id}/toolbox`);
    }
  };

  return (
    <div style={{ display: 'flex', height: '100vh', background: C.bg, color: C.text }}>
      {/* Sidebar */}
      <nav style={{
        width: 220,
        minWidth: 220,
        background: C.sidebar,
        borderRight: `1px solid ${C.border}`,
        display: 'flex',
        flexDirection: 'column',
        padding: '16px 0',
      }}>
        <div style={{
          padding: '0 16px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <img src="/logo.svg" alt="" style={{ width: 24, height: 24, borderRadius: 5 }} />
          <span style={{
            fontSize: 15,
            fontWeight: 700,
            letterSpacing: '-0.3px',
            color: C.text,
          }}>
            Thes<span style={{ color: C.accent, fontStyle: 'italic' }}>1</span>s
          </span>
        </div>

        <div style={{ flex: 1 }}>
          {NAV_ITEMS.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 16px',
                fontSize: 13,
                color: isActive ? C.text : C.textSecondary,
                background: isActive ? C.sidebarHover : 'transparent',
                textDecoration: 'none',
                borderRadius: 6,
                margin: '0 8px',
                fontWeight: isActive ? 600 : 400,
              })}
            >
              <span style={{ fontSize: 16 }}>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </div>

        <div style={{ padding: '0 16px' }}>
          <button
            onClick={onSettingsOpen}
            style={{
              width: '100%',
              padding: '8px 12px',
              fontSize: 12,
              background: C.bgCard,
              color: C.textSecondary,
              border: `1px solid ${C.border}`,
              borderRadius: 6,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <GearIcon size={14} color={C.textSecondary} />
            Settings
          </button>
        </div>
      </nav>

      {/* Main area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <header style={{
          height: 52,
          minHeight: 52,
          background: C.header,
          borderBottom: `1px solid ${C.headerBorder}`,
          display: 'flex',
          alignItems: 'center',
          padding: '0 24px',
          gap: 16,
        }}>
          <TickerSearch onSubmit={handleNewResearch} />
        </header>

        {/* Content */}
        <main style={{
          flex: 1,
          overflow: 'auto',
          padding: 24,
        }}>
          {children}
        </main>
      </div>
    </div>
  );
}
