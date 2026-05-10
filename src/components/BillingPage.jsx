// BillingPage — Usage & Billing dashboard.
// Shows current month spend, progress bar, recent activity, billing management.
// Admin section shows all users' spend with limit adjustment.

import { useState } from 'react';
import { C } from '../theme';
import { useUsage, useAdminBilling } from '../hooks/useUsage';
import { userUrl } from '../engines/apiBase';

function SectionHeader({ label }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em',
      color: C.accent, borderBottom: `1px solid ${C.border}`, paddingBottom: 8, marginBottom: 16,
    }}>
      {label}
    </div>
  );
}

function ProgressBar({ value, max }) {
  const pct = max > 0 ? Math.min(value / max, 1) : 0;
  const color = pct < 0.6 ? C.green : pct < 0.8 ? C.yellow : C.red;
  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      style={{
        height: 8, borderRadius: 4, background: C.borderLight, overflow: 'hidden', width: '100%',
      }}
    >
      <div style={{
        height: '100%', borderRadius: 4, background: color,
        width: `${pct * 100}%`, transition: 'width 0.3s ease',
      }} />
    </div>
  );
}

function StatusDot({ active }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500,
    }}>
      <span style={{
        width: 8, height: 8, borderRadius: '50%',
        background: active ? C.green : C.red,
      }} />
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

function WelcomeCard({ onSetup, loading }) {
  return (
    <div style={{
      border: `1px solid ${C.accent}`, borderRadius: 8, background: C.bgCard,
      padding: 24, marginBottom: 20,
    }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 8 }}>
        Welcome to Thesis!
      </div>
      <div style={{ fontSize: 13, color: C.textSecondary, marginBottom: 16, lineHeight: 1.5 }}>
        To run AI analyses, set up billing so we can track your usage.
        You only pay for what you use, no markup, no subscription.
      </div>
      <button
        onClick={onSetup}
        disabled={loading}
        style={{
          background: C.accent, color: '#fff', border: 'none', borderRadius: 6,
          padding: '10px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          minHeight: 44, opacity: loading ? 0.6 : 1, transition: 'all .15s',
        }}
      >
        {loading ? 'Redirecting...' : 'Set up billing — takes 30 seconds'}
      </button>
    </div>
  );
}

function SummaryCard({ billing, onManage, onSetup }) {
  const spendDollars = (billing.spendMillicents / 1000).toFixed(2);
  const limitDollars = (billing.limitCents / 100).toFixed(2);
  const now = new Date();
  const monthName = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const pct = billing.limitCents > 0
    ? billing.spendMillicents / (billing.limitCents * 10)
    : 0;

  return (
    <div style={{
      border: `1px solid ${C.border}`, borderRadius: 8, background: C.bgCard,
      padding: 20, marginBottom: 20, boxShadow: `0 1px 3px 0 ${C.shadow}`,
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: C.textMuted, marginBottom: 4 }}>
        {monthName}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 28, fontWeight: 700, color: C.text, fontVariantNumeric: 'tabular-nums' }}>
          ${spendDollars}
        </span>
        <span style={{ fontSize: 13, color: C.textSecondary }}>
          of ${limitDollars} limit
        </span>
      </div>
      <div style={{ marginBottom: 12 }}>
        <ProgressBar value={billing.spendMillicents} max={billing.limitCents * 10} />
      </div>
      {pct >= 0.8 && (
        <div style={{
          fontSize: 12, color: C.red, fontWeight: 500, marginBottom: 12,
        }}>
          Approaching limit
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <StatusDot active={billing.billingActive} />
        {billing.hasStripe ? (
          <button onClick={onManage} style={{
            background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6,
            padding: '6px 12px', fontSize: 13, fontWeight: 500, color: C.text,
            cursor: 'pointer', transition: 'all .15s', minHeight: 44,
          }}>
            Manage Billing
          </button>
        ) : (
          <button onClick={onSetup} style={{
            background: C.accent, color: '#fff', border: 'none', borderRadius: 6,
            padding: '6px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            minHeight: 44, transition: 'all .15s',
          }}>
            Set Up Billing
          </button>
        )}
      </div>
    </div>
  );
}

function UsageTable({ usage }) {
  if (usage.length === 0) {
    return (
      <div style={{
        textAlign: 'center', padding: '40px 20px', color: C.textMuted, fontSize: 13,
      }}>
        No analyses yet. Run your first One Pager to get started.
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {['Date', 'Model', 'Cost', 'Caller', 'Ticker'].map(h => (
              <th key={h} style={{
                textAlign: 'left', fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
                letterSpacing: '0.04em', color: C.textMuted, padding: '8px 12px',
                borderBottom: `1px solid ${C.border}`,
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {usage.map((row, i) => {
            const date = new Date(row.created_at + 'Z');
            const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
            return (
              <tr key={i} style={{ borderBottom: `1px solid ${C.borderLight}` }}>
                <td style={{ padding: '8px 12px', fontSize: 13, color: C.textSecondary }}>
                  {dateStr}, {timeStr}
                </td>
                <td style={{ padding: '8px 12px', fontSize: 12, color: C.textMuted, fontFamily: 'monospace' }}>
                  {row.model?.replace('claude-', '')}
                </td>
                <td style={{ padding: '8px 12px', fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: C.text }}>
                  ${(row.cost_millicents / 1000).toFixed(3)}
                </td>
                <td style={{ padding: '8px 12px', fontSize: 12, color: C.textMuted }}>
                  {row.caller || '—'}
                </td>
                <td style={{ padding: '8px 12px', fontSize: 13, fontWeight: 600, color: C.accent }}>
                  {row.ticker || '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AdminSection({ user }) {
  const { users, loading, error } = useAdminBilling();
  const [expanded, setExpanded] = useState(false);

  if (user.role !== 'admin') return null;

  return (
    <div style={{
      border: `1px solid ${C.border}`, borderRadius: 8, background: C.bgCard,
      marginTop: 20, boxShadow: `0 1px 3px 0 ${C.shadow}`,
    }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px',
          cursor: 'pointer', userSelect: 'none',
        }}
      >
        <span style={{
          display: 'inline-block', fontSize: 11, transition: 'transform 0.25s ease',
          transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
        }}>&#9654;</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>All Users</span>
      </div>
      {expanded && (
        <div style={{ padding: '0 16px 16px' }}>
          {loading && <div style={{ color: C.textMuted, fontSize: 13 }}>Loading...</div>}
          {error && <div style={{ color: C.red, fontSize: 13 }}>{error}</div>}
          {!loading && !error && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['User', 'Spend', 'Limit', 'Status'].map(h => (
                      <th key={h} style={{
                        textAlign: 'left', fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
                        letterSpacing: '0.04em', color: C.textMuted, padding: '8px 12px',
                        borderBottom: `1px solid ${C.border}`,
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id} style={{ borderBottom: `1px solid ${C.borderLight}` }}>
                      <td style={{ padding: '8px 12px', fontSize: 13, color: C.text }}>
                        {u.name || u.email}{u.role === 'admin' ? ' (admin)' : ''}
                      </td>
                      <td style={{ padding: '8px 12px', fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: C.text }}>
                        ${((u.spend_millicents || 0) / 1000).toFixed(2)}
                      </td>
                      <td style={{ padding: '8px 12px', fontSize: 13, color: C.textSecondary }}>
                        {u.role === 'admin' ? '—' : `$${((u.monthly_limit_cents || 5000) / 100).toFixed(2)}`}
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <StatusDot active={u.billing_active} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function BillingPage({ user }) {
  const { billing, usage, loading, error, refresh } = useUsage();
  const [setupLoading, setSetupLoading] = useState(false);

  const handleSetup = async () => {
    setSetupLoading(true);
    try {
      const res = await fetch(userUrl('/stripe/setup'), {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else setSetupLoading(false);
    } catch {
      setSetupLoading(false);
    }
  };

  const handleManage = async () => {
    try {
      const res = await fetch(userUrl('/stripe/portal'), {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.url) window.open(data.url, '_blank');
    } catch { /* silent */ }
  };

  if (loading) {
    return (
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '20px 24px' }}>
        <h1 style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 20 }}>Usage & Billing</h1>
        <div style={{
          border: `1px solid ${C.border}`, borderRadius: 8, background: C.bgCard,
          padding: 20, height: 120,
        }}>
          <div style={{ width: 200, height: 12, background: C.borderLight, borderRadius: 4, marginBottom: 12 }} />
          <div style={{ width: 100, height: 28, background: C.borderLight, borderRadius: 4, marginBottom: 12 }} />
          <div style={{ height: 8, background: C.borderLight, borderRadius: 4 }} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '20px 24px' }}>
        <h1 style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 20 }}>Usage & Billing</h1>
        <div style={{
          border: `1px solid ${C.border}`, borderRadius: 8, background: C.bgCard,
          padding: 20, textAlign: 'center',
        }}>
          <div style={{ color: C.red, fontSize: 13, marginBottom: 12 }}>
            Couldn't load billing data.
          </div>
          <button onClick={refresh} style={{
            background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6,
            padding: '6px 12px', fontSize: 13, color: C.accent, cursor: 'pointer',
          }}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  const showWelcome = billing && !billing.billingActive && user.role !== 'admin';

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '20px 24px' }}>
      <h1 style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 20 }}>Usage & Billing</h1>

      {showWelcome ? (
        <WelcomeCard onSetup={handleSetup} loading={setupLoading} />
      ) : (
        billing && <SummaryCard billing={billing} onManage={handleManage} onSetup={handleSetup} />
      )}

      <SectionHeader label="Recent Activity" />
      <div style={{
        border: `1px solid ${C.border}`, borderRadius: 8, background: C.bgCard,
        overflow: 'hidden', boxShadow: `0 1px 3px 0 ${C.shadow}`,
      }}>
        <UsageTable usage={usage} />
      </div>

      <AdminSection user={user} />
    </div>
  );
}
