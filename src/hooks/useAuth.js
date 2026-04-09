import { useState, useEffect, useCallback } from 'react';
import { authUrl } from '../engines/apiBase';

// Auth hook — manages login state via session cookie.
// On mount, checks /auth/me. Returns { user, loading, login, logout, signup }.
export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Check current session on mount
  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const res = await fetch(authUrl('/me'), { credentials: 'include' });
        if (!res.ok) { setLoading(false); return; }
        const data = await res.json();
        if (!cancelled) setUser(data.user || null);
      } catch {
        // Server unreachable — not logged in
      }
      if (!cancelled) setLoading(false);
    }
    check();
    return () => { cancelled = true; };
  }, []);

  const login = useCallback(async (email, password) => {
    const res = await fetch(authUrl('/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    await fetch(authUrl('/logout'), { method: 'POST', credentials: 'include' });
    setUser(null);
  }, []);

  const signup = useCallback(async (token, name, password) => {
    const res = await fetch(authUrl('/signup'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ token, name, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Signup failed');
    setUser(data.user);
    return data.user;
  }, []);

  return { user, loading, login, logout, signup };
}
