import { useState } from 'react';
import { C } from '../theme';

// Login page — email + password form. No "Create Account" link visible.
// Invite-only signup is at /signup?token=xyz (sent via email).
export default function LoginPage({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await onLogin(email, password);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', background: C.bg,
    }}>
      <div style={{
        width: 380, padding: 40, borderRadius: 12,
        background: C.bgCard, border: `1px solid ${C.border}`,
        boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <img src="/logo.svg" alt="Thes1s" style={{ height: 36, marginBottom: 12 }} />
          <p style={{ color: C.textSecondary, fontSize: 13, margin: 0 }}>
            AI-powered investment research
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: C.text, marginBottom: 6 }}>
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoFocus
            style={{
              width: '100%', padding: '10px 12px', fontSize: 14, borderRadius: 8,
              border: `1px solid ${C.border}`, background: C.bgInput, color: C.text,
              outline: 'none', boxSizing: 'border-box', marginBottom: 16,
            }}
          />

          <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: C.text, marginBottom: 6 }}>
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            style={{
              width: '100%', padding: '10px 12px', fontSize: 14, borderRadius: 8,
              border: `1px solid ${C.border}`, background: C.bgInput, color: C.text,
              outline: 'none', boxSizing: 'border-box', marginBottom: 24,
            }}
          />

          {error && (
            <div style={{
              padding: '8px 12px', borderRadius: 6, marginBottom: 16,
              background: C.redBg, color: C.red, fontSize: 13,
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: '10px 0', fontSize: 14, fontWeight: 600,
              borderRadius: 8, border: 'none', cursor: loading ? 'wait' : 'pointer',
              background: C.accent, color: '#fff',
            }}
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
