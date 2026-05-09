// Auth routes — login, logout, /auth/me
// Passwords hashed with Web Crypto API (PBKDF2, available in Workers)
//
// Note: signup / invite / setup handlers were removed during the open-source migration.
// Phase 4 will rebuild signup as either open public signup or self-serve invite.

const SESSION_TTL_DAYS = 30;

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

// ─── Password hashing (PBKDF2 via Web Crypto) ─────────────────

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, key, 256
  );
  const hash = btoa(String.fromCharCode(...new Uint8Array(bits)));
  const saltB64 = btoa(String.fromCharCode(...salt));
  return `pbkdf2:100000:${saltB64}:${hash}`;
}

async function verifyPassword(password, stored) {
  const [, , saltB64, hashB64] = stored.split(':');
  const salt = Uint8Array.from(atob(saltB64), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, key, 256
  );
  const computed = btoa(String.fromCharCode(...new Uint8Array(bits)));
  return computed === hashB64;
}

// ─── Session cookie helpers ────────────────────────────────────

function sessionCookie(token, maxAge) {
  return `session=${token}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=${maxAge}`;
}

function clearSessionCookie() {
  return 'session=; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=0';
}

// ─── Route handler ─────────────────────────────────────────────

export async function handleAuth(request, env, path) {
  const method = request.method;

  // POST /auth/login
  if (path === '/auth/login' && method === 'POST') {
    const { email, password } = await request.json();
    if (!email || !password) return json({ error: 'Email and password required' }, 400);

    const user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email.toLowerCase()).first();
    if (!user) return json({ error: 'Invalid email or password' }, 401);

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) return json({ error: 'Invalid email or password' }, 401);

    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
    await env.DB.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)')
      .bind(token, user.id, expiresAt).run();

    return json(
      { user: { id: user.id, email: user.email, name: user.name, role: user.role } },
      200,
      { 'Set-Cookie': sessionCookie(token, SESSION_TTL_DAYS * 24 * 60 * 60) }
    );
  }

  // POST /auth/logout
  if (path === '/auth/logout' && method === 'POST') {
    const cookie = request.headers.get('Cookie') || '';
    const match = cookie.match(/session=([^;]+)/);
    if (match) {
      await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(match[1]).run();
    }
    return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie() });
  }

  // GET /auth/me — check current session
  if (path === '/auth/me' && method === 'GET') {
    const cookie = request.headers.get('Cookie') || '';
    const match = cookie.match(/session=([^;]+)/);
    if (!match) return json({ user: null });

    const row = await env.DB.prepare(
      'SELECT u.id, u.email, u.name, u.role FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.token = ? AND s.expires_at > datetime(\'now\')'
    ).bind(match[1]).first();

    return json({ user: row || null });
  }

  return json({ error: 'Not found' }, 404);
}
