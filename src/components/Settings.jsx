import { C } from '../theme';

function SettingSelect({ label, value, onChange, options }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0' }}>
      <span style={{ fontSize: 13, color: C.text }}>{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          padding: '5px 10px', fontSize: 12, fontWeight: 500,
          background: C.bgInput || C.bgCard, color: C.text,
          border: `1px solid ${C.border}`, borderRadius: 4,
          cursor: 'pointer', fontFamily: 'inherit', outline: 'none',
          minWidth: 130,
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
      fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
      letterSpacing: 0.5, color: C.accent, padding: '16px 0 6px',
      borderBottom: `1px solid ${C.borderLight}`, marginBottom: 4,
    }}>{label}</div>
  );
}

export default function Settings({ settings, updateSettings, isDark, toggleTheme, onClose }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: C.bgCard, borderRadius: 12,
          border: `1px solid ${C.border}`,
          boxShadow: `0 16px 48px ${C.shadow}`,
          width: 440, maxHeight: '80vh', overflow: 'auto',
          padding: '24px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: 0 }}>Settings</h2>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', color: C.textSecondary,
              fontSize: 20, cursor: 'pointer', padding: '4px 8px', lineHeight: 1,
            }}
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

        <SectionHeader label="Key Metrics" />
        <SettingSelect
          label="Default Display"
          value={settings.keyMetricsDisplay}
          onChange={v => updateSettings({ keyMetricsDisplay: v })}
          options={[
            { value: 'both', label: 'Values & % Change' },
            { value: 'values', label: 'Values Only' },
            { value: 'change', label: '% Change Only' },
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
      </div>
    </div>
  );
}
