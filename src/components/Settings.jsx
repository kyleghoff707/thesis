import { useNavigate } from 'react-router-dom';
import { C } from '../theme';

function SettingSelect({ label, value, onChange, options }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0' }}>
      <span style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          padding: '6px 10px', fontSize: 13, fontWeight: 500,
          background: C.bgInput || C.bgCard, color: C.text,
          border: `1px solid ${C.border}`, borderRadius: 6,
          cursor: 'pointer', fontFamily: 'inherit', outline: 'none',
          minWidth: 130, transition: 'border-color .15s',
        }}
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}

function SectionHeader({ label }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
      letterSpacing: '0.04em', color: C.accent, paddingTop: 20, paddingBottom: 6,
      borderBottom: `1px solid ${C.border}`, marginBottom: 4,
    }}>{label}</div>
  );
}

export default function Settings({ settings, updateSettings, isDark, toggleTheme, onClose }) {
  const navigate = useNavigate();
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: C.bgCard, borderRadius: 12,
          boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
          width: 440, maxWidth: 720, maxHeight: '80vh', overflow: 'auto',
          padding: '24px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: 0 }}>Settings</h2>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', color: C.textMuted,
              fontSize: 20, cursor: 'pointer', padding: '4px 8px', lineHeight: 1,
              borderRadius: 6, transition: 'all .15s',
            }}
            onMouseEnter={e => e.currentTarget.style.color = C.text}
            onMouseLeave={e => e.currentTarget.style.color = C.textMuted}
          >&times;</button>
        </div>

        <SectionHeader label="Appearance" />
        <SettingSelect
          label="Theme"
          value={isDark ? 'dark' : 'light'}
          onChange={v => { if ((v === 'dark') !== isDark) toggleTheme(); }}
          options={[
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
        />

        <SectionHeader label="Financial Statements" />
        <SettingSelect
          label="Default Layout"
          value={settings.defaultLayout}
          onChange={v => updateSettings({ defaultLayout: v })}
          options={[
            { value: 'expanded', label: 'Expanded' },
            { value: 'consolidated', label: 'Consolidated' },
          ]}
        />
        <SettingSelect
          label="Default Version"
          value={settings.defaultVersion}
          onChange={v => updateSettings({ defaultVersion: v })}
          options={[
            { value: 'restated', label: 'Restated' },
            { value: 'original', label: 'Original' },
          ]}
        />
        <SettingSelect
          label="Default View"
          value={settings.defaultView}
          onChange={v => updateSettings({ defaultView: v })}
          options={[
            { value: 'annual', label: 'Annual' },
            { value: 'quarterly', label: 'Quarterly' },
          ]}
        />
        <SettingSelect
          label="Default Periods (Annual)"
          value={settings.defaultPeriods}
          onChange={v => updateSettings({ defaultPeriods: v })}
          options={[
            { value: '5', label: '5 Years' },
            { value: '10', label: '10 Years' },
            { value: '13', label: '13 Years' },
            { value: 'all', label: 'All' },
          ]}
        />
        <SettingSelect
          label="Default Periods (Quarterly)"
          value={settings.defaultQtrPeriods}
          onChange={v => updateSettings({ defaultQtrPeriods: v })}
          options={[
            { value: '4', label: '4 Qtrs' },
            { value: '8', label: '8 Qtrs' },
            { value: '12', label: '12 Qtrs' },
            { value: '20', label: '20 Qtrs' },
            { value: 'all', label: 'All' },
          ]}
        />

        <SectionHeader label="Growth Analysis" />
        <SettingSelect
          label="Default Chart Years"
          value={settings.growthChartYears}
          onChange={v => updateSettings({ growthChartYears: v })}
          options={[
            { value: '5', label: '5 Years' },
            { value: '10', label: '10 Years' },
            { value: '13', label: '13 Years' },
            { value: 'all', label: 'All' },
          ]}
        />

        <SectionHeader label="Price Chart" />
        <SettingSelect
          label="Default Range"
          value={settings.defaultPriceRange}
          onChange={v => updateSettings({ defaultPriceRange: v })}
          options={[
            { value: '1y', label: '1 Year' },
            { value: '3y', label: '3 Years' },
            { value: '5y', label: '5 Years' },
            { value: '10y', label: '10 Years' },
            { value: 'max', label: 'Max' },
          ]}
        />

        <SectionHeader label="Gurus" />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0' }}>
          <div>
            <span style={{ fontSize: 13, fontWeight: 500, color: C.text }}>Enable N-PORT data</span>
            <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>
              Fetch complete portfolio data (cash, money market) for gurus with registered funds
            </div>
          </div>
          <button
            onClick={() => updateSettings({ enableNport: !settings.enableNport })}
            style={{
              width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer',
              background: settings.enableNport ? C.accent : C.border,
              position: 'relative', transition: 'background .2s', flexShrink: 0,
            }}
          >
            <div style={{
              width: 16, height: 16, borderRadius: '50%', background: '#fff',
              position: 'absolute', top: 3,
              left: settings.enableNport ? 21 : 3,
              transition: 'left .2s',
              boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
            }} />
          </button>
        </div>

        <SectionHeader label="Tools" />
        <div style={{ padding: '8px 0' }}>
          <button
            onClick={() => { onClose(); navigate('/validation'); }}
            style={{
              background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6,
              padding: '6px 12px', fontSize: 13, fontWeight: 500, color: C.textSecondary,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
              transition: 'all .15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.color = C.accent; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.textSecondary; }}
          >
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
            </svg>
            Run Validation
          </button>
          <button
            onClick={() => { onClose(); navigate('/guru-audit'); }}
            style={{
              background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6,
              padding: '6px 12px', fontSize: 13, fontWeight: 500, color: C.textSecondary,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
              transition: 'all .15s', marginTop: 8,
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.color = C.accent; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.textSecondary; }}
          >
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" />
            </svg>
            Run Guru Audit
          </button>
          <button
            onClick={() => { onClose(); navigate('/ticker-audit'); }}
            style={{
              background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6,
              padding: '6px 12px', fontSize: 13, fontWeight: 500, color: C.textSecondary,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
              transition: 'all .15s', marginTop: 8,
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.color = C.accent; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.textSecondary; }}
          >
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 7h16M4 12h16M4 17h10" /><circle cx="19" cy="17" r="3" /><path d="M21.5 19.5L23 21" />
            </svg>
            Run Ticker Audit
          </button>
          <button
            onClick={() => { onClose(); navigate('/nport-audit'); }}
            style={{
              background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6,
              padding: '6px 12px', fontSize: 13, fontWeight: 500, color: C.textSecondary,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
              transition: 'all .15s', marginTop: 8,
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.color = C.accent; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.textSecondary; }}
          >
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><path d="M12 18v-6" /><path d="M9 15h6" />
            </svg>
            Run N-PORT Audit
          </button>
          <button
            onClick={() => { onClose(); navigate('/comp-audit'); }}
            style={{
              background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6,
              padding: '6px 12px', fontSize: 13, fontWeight: 500, color: C.textSecondary,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
              transition: 'all .15s', marginTop: 8,
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.color = C.accent; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.textSecondary; }}
          >
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="18" rx="2" /><path d="M8 7h8M8 12h8M8 17h4" />
            </svg>
            Run Compensation Audit
          </button>
        </div>

        <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
          <button
            onClick={onClose}
            style={{
              width: '100%', padding: '7px 16px', fontSize: 12, fontWeight: 600,
              background: C.accent, color: '#fff', border: 'none', borderRadius: 6,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              transition: 'all .15s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = C.accentHover}
            onMouseLeave={e => e.currentTarget.style.background = C.accent}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
