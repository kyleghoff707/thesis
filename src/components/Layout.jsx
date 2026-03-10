import { NavLink, useNavigate } from 'react-router-dom';
import { C } from '../theme';
import TickerSearch from './TickerSearch';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: '◫' },
  { to: '/validation', label: 'Validation', icon: '✓' },
];

export default function Layout({ children, onNewResearch, isDark, toggleTheme }) {
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
            onClick={toggleTheme}
            style={{
              width: '100%',
              padding: '8px 12px',
              fontSize: 12,
              background: C.bgCard,
              color: C.textSecondary,
              border: `1px solid ${C.border}`,
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            {isDark ? 'Light Mode' : 'Dark Mode'}
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
