import { useState } from 'react';
import { C } from '../theme';
import { clearAllCaches } from '../engines/cache';
import { authUrl } from '../engines/apiBase';

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

function SubGroupLabel({ label }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 500, color: C.textMuted,
      paddingTop: 12, paddingBottom: 2,
    }}>{label}</div>
  );
}

function ClearCacheButton() {
  const [state, setState] = useState('idle');

  const handleClick = async () => {
    if (state === 'idle') {
      setState('confirm');
      setTimeout(() => setState(prev => prev === 'confirm' ? 'idle' : prev), 3000);
      return;
    }
    if (state === 'confirm') {
      setState('clearing');
      try {
        await clearAllCaches();
        setState('done');
        setTimeout(() => setState('idle'), 2000);
      } catch {
        setState('error');
        setTimeout(() => setState('idle'), 3000);
      }
    }
  };

  const config = {
    idle: { label: 'Clear All Cached Data', border: C.border, color: C.textSecondary },
    confirm: { label: 'Click again to confirm', border: C.red, color: C.red },
    clearing: { label: 'Clearing...', border: C.border, color: C.textMuted },
    done: { label: 'Cache cleared', border: `${C.green}40`, color: C.green },
    error: { label: 'Failed — try again', border: C.red, color: C.red },
  };

  const { label, border, color } = config[state];

  return (
    <div style={{ padding: '8px 0' }}>
      <button
        onClick={handleClick}
        disabled={state === 'clearing'}
        style={{
          background: 'transparent',
          border: `1px solid ${border}`,
          borderRadius: 6,
          padding: '6px 12px',
          fontSize: 13,
          fontWeight: 500,
          color,
          cursor: state === 'clearing' ? 'wait' : 'pointer',
          transition: 'all .15s',
          fontFamily: 'inherit',
        }}
        onMouseEnter={e => { if (state === 'idle') { e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.color = C.accent; } }}
        onMouseLeave={e => { if (state === 'idle') { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.textSecondary; } }}
      >
        {label}
      </button>
      <div style={{ fontSize: 11, color: C.textMuted, marginTop: 6 }}>
        Removes cached financial data, filings, and quotes. Your research reports and settings are not affected.
      </div>
    </div>
  );
}

function InviteForm() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState('idle'); // idle | sending | success | error
  const [message, setMessage] = useState('');
  const [signupLink, setSignupLink] = useState('');

  const handleInvite = async () => {
    if (!email.trim()) return;
    setState('sending');
    setMessage('');
    setSignupLink('');
    try {
      const res = await fetch(authUrl('/invite'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setState('error');
        setMessage(data.error || 'Failed to send invite');
        return;
      }
      setState('success');
      setMessage(`Invite sent to ${email.trim()}`);
      const link = `${window.location.origin}/#/signup?token=${data.token}`;
      setSignupLink(link);
      setEmail('');
      setTimeout(() => { setState('idle'); setMessage(''); setSignupLink(''); }, 15000);
    } catch {
      setState('error');
      setMessage('Network error — try again');
    }
  };

  return (
    <div style={{ padding: '8px 0' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          type="email"
          placeholder="Email address"
          value={email}
          onChange={e => setEmail(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleInvite()}
          style={{
            flex: 1, padding: '6px 10px', fontSize: 13, fontWeight: 500,
            background: C.bgInput || C.bgCard, color: C.text,
            border: `1px solid ${C.border}`, borderRadius: 6,
            fontFamily: 'inherit', outline: 'none', transition: 'border-color .15s',
          }}
          onFocus={e => e.currentTarget.style.borderColor = C.accent}
          onBlur={e => e.currentTarget.style.borderColor = C.border}
        />
        <button
          onClick={handleInvite}
          disabled={state === 'sending' || !email.trim()}
          style={{
            padding: '6px 14px', fontSize: 12, fontWeight: 600,
            background: C.accent, color: '#fff', border: 'none', borderRadius: 6,
            cursor: state === 'sending' ? 'wait' : 'pointer',
            fontFamily: 'inherit', transition: 'all .15s', whiteSpace: 'nowrap',
            opacity: (!email.trim() || state === 'sending') ? 0.6 : 1,
          }}
          onMouseEnter={e => { if (email.trim() && state !== 'sending') e.currentTarget.style.background = C.accentHover; }}
          onMouseLeave={e => e.currentTarget.style.background = C.accent}
        >
          {state === 'sending' ? 'Sending...' : 'Send Invite'}
        </button>
      </div>
      {message && (
        <div style={{
          fontSize: 12, marginTop: 6,
          color: state === 'success' ? (C.green || '#16a34a') : (C.red || '#dc2626'),
        }}>
          {message}
        </div>
      )}
      {signupLink && (
        <div style={{ marginTop: 6 }}>
          <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 3 }}>
            Backup link (if email doesn't arrive):
          </div>
          <div style={{
            display: 'flex', gap: 6, alignItems: 'center',
          }}>
            <input
              readOnly
              value={signupLink}
              style={{
                flex: 1, padding: '4px 8px', fontSize: 11,
                background: C.bgInput || C.bgCard, color: C.textMuted,
                border: `1px solid ${C.border}`, borderRadius: 4,
                fontFamily: 'monospace', outline: 'none',
              }}
              onClick={e => e.target.select()}
            />
            <button
              onClick={() => navigator.clipboard.writeText(signupLink)}
              style={{
                padding: '4px 8px', fontSize: 11, fontWeight: 500,
                background: 'transparent', color: C.accent,
                border: `1px solid ${C.border}`, borderRadius: 4,
                cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
              }}
            >
              Copy
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Settings({ settings, updateSettings, isDark, toggleTheme, onClose, user }) {
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

        {/* ── Appearance ── */}
        <SectionHeader label="Appearance" />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0' }}>
          <div>
            <span style={{ fontSize: 13, fontWeight: 500, color: C.text }}>Dark mode</span>
          </div>
          <button
            role="switch"
            aria-checked={isDark}
            aria-label="Dark mode"
            onClick={toggleTheme}
            style={{
              width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer',
              background: isDark ? C.accent : C.border,
              position: 'relative', transition: 'background .2s', flexShrink: 0,
            }}
          >
            <div style={{
              width: 16, height: 16, borderRadius: '50%', background: '#fff',
              position: 'absolute', top: 3,
              left: isDark ? 21 : 3,
              transition: 'left .2s',
              boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
            }} />
          </button>
        </div>

        {/* ── Display Defaults ── */}
        <SectionHeader label="Display Defaults" />

        <SubGroupLabel label="Financial Statements" />
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

        <SubGroupLabel label="Charts" />
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

        {/* ── Data Sources ── */}
        <SectionHeader label="Data Sources" />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0' }}>
          <div>
            <span style={{ fontSize: 13, fontWeight: 500, color: C.text }}>Enable N-PORT data</span>
            <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>
              Fetch complete portfolio data (cash, money market) for gurus with registered funds
            </div>
          </div>
          <button
            role="switch"
            aria-checked={settings.enableNport}
            aria-label="Enable N-PORT data"
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

        {/* ── Storage ── */}
        <SectionHeader label="Storage" />
        <ClearCacheButton />

        {/* ── Invite Users (admin only) ── */}
        {user?.role === 'admin' && (
          <>
            <SectionHeader label="Invite Users" />
            <InviteForm />
          </>
        )}

        {/* ── Replay Tour ── */}
        {settings.tourCompleted && (
          <div style={{ padding: '8px 0' }}>
            <button
              onClick={() => { updateSettings({ tourCompleted: false }); onClose(); }}
              style={{
                background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6,
                padding: '6px 12px', fontSize: 13, fontWeight: 500, color: C.textSecondary,
                cursor: 'pointer', transition: 'all .15s', fontFamily: 'inherit',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.color = C.accent; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.textSecondary; }}
            >
              Replay Product Tour
            </button>
          </div>
        )}

        {/* ── About (divider only, no section header) ── */}
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 16 }}>
            <img src="/logo.svg" alt="Thes1s" style={{ width: 28, height: 28, borderRadius: 6 }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Thes1s</div>
              <div style={{ fontSize: 11, color: C.textMuted }}>AI-Powered Stock Research</div>
            </div>
          </div>

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
