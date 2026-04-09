import { useState, useEffect } from 'react';
import { C } from '../theme';
import { authUrl } from '../engines/apiBase';

// Signup page — only accessible via invite link (/signup?token=xyz).
// Validates the invite token, then shows a form to set name + password.
export default function SignupPage({ onSignup }) {
  const [token, setToken] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [invalid, setInvalid] = useState(false);

  // Extract token from URL and validate
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
    const t = params.get('token');
    if (!t) { setInvalid(true); setLoading(false); return; }
    setToken(t);

    async function validate() {
      try {
        const res = await fetch(authUrl(`/signup?token=${t}`));
        if (!res.ok) { setInvalid(true); setLoading(false); return; }
        const data = await res.json();
        setEmail(data.email);
      } catch {
        setInvalid(true);
      }
      setLoading(false);
    }
    validate();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (password !== confirmPassword) { setError('Passwords do not match'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }

    setSubmitting(true);
    try {
      await onSignup(token, name, password);
      window.location.hash = '#/';
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: C.bg }}>
        <p style={{ color: C.textSecondary }}>Validating invite...</p>
      </div>
    );
  }

  if (invalid) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: C.bg }}>
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ color: C.text, marginBottom: 8 }}>Invalid Invite</h2>
          <p style={{ color: C.textSecondary, fontSize: 14 }}>This invite link is invalid or has expired.</p>
        </div>
      </div>
    );
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
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <img src="/logo.svg" alt="Thes1s" style={{ height: 36, marginBottom: 12 }} />
          <p style={{ color: C.textSecondary, fontSize: 13, margin: 0 }}>
            Create your account
          </p>
          <p style={{ color: C.textMuted, fontSize: 12, margin: '8px 0 0' }}>
            Invited as <strong style={{ color: C.text }}>{email}</strong>
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: C.text, marginBottom: 6 }}>
            Name
          </label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Optional"
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
            minLength={8}
            style={{
              width: '100%', padding: '10px 12px', fontSize: 14, borderRadius: 8,
              border: `1px solid ${C.border}`, background: C.bgInput, color: C.text,
              outline: 'none', boxSizing: 'border-box', marginBottom: 16,
            }}
          />

          <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: C.text, marginBottom: 6 }}>
            Confirm Password
          </label>
          <input
            type="password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
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
            disabled={submitting}
            style={{
              width: '100%', padding: '10px 0', fontSize: 14, fontWeight: 600,
              borderRadius: 8, border: 'none', cursor: submitting ? 'wait' : 'pointer',
              background: C.accent, color: '#fff',
            }}
          >
            {submitting ? 'Creating account...' : 'Create account'}
          </button>
        </form>
      </div>
    </div>
  );
}
