// Auth routes — login, signup (invite-only), invite, logout
// Passwords hashed with Web Crypto API (PBKDF2, available in Workers)

const SESSION_TTL_DAYS = 30;

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

// ─── Password hashing (PBKDF2 via Web Crypto) ─────────────────

async function hashPassword(password) {
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

    // Create session
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

  // POST /auth/invite — admin-only, sends invite email via Resend
  if (path === '/auth/invite' && method === 'POST') {
    // Check caller is admin
    const cookie = request.headers.get('Cookie') || '';
    const match = cookie.match(/session=([^;]+)/);
    if (!match) return json({ error: 'Unauthorized' }, 401);

    const session = await env.DB.prepare(
      'SELECT u.id, u.role FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.token = ? AND s.expires_at > datetime(\'now\')'
    ).bind(match[1]).first();
    if (!session || session.role !== 'admin') return json({ error: 'Admin access required' }, 403);

    const { email } = await request.json();
    if (!email) return json({ error: 'Email required' }, 400);

    // Check if user already exists
    const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email.toLowerCase()).first();
    if (existing) return json({ error: 'User already exists' }, 409);

    // Create invite token
    const token = crypto.randomUUID();
    await env.DB.prepare('INSERT INTO invite_tokens (token, email, created_by) VALUES (?, ?, ?)')
      .bind(token, email.toLowerCase(), session.id).run();

    // Send invite email via Resend
    const RESEND_KEY = env.RESEND_API_KEY;
    if (RESEND_KEY) {
      const signupUrl = `${new URL(request.url).origin.replace('api.', '')}/#/signup?token=${token}`;
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Thes1s <noreply@thes1s.com>',
          to: [email],
          subject: 'You\'re invited to Thes1s',
          html: `<p>You've been invited to use <strong>Thes1s</strong>, an AI-powered investment research tool.</p>
                 <p><a href="${signupUrl}">Click here to create your account</a></p>
                 <p>This link expires in 7 days.</p>`,
        }),
      });
    }

    return json({ ok: true, token });
  }

  // GET /auth/signup?token=xyz — validate invite token
  if (path === '/auth/signup' && method === 'GET') {
    const url = new URL(request.url);
    const token = url.searchParams.get('token');
    if (!token) return json({ error: 'Invite token required' }, 400);

    const invite = await env.DB.prepare(
      'SELECT * FROM invite_tokens WHERE token = ? AND used_at IS NULL'
    ).bind(token).first();

    if (!invite) return json({ error: 'Invalid or expired invite' }, 404);

    // Check if older than 7 days
    const created = new Date(invite.created_at);
    if (Date.now() - created.getTime() > 7 * 24 * 60 * 60 * 1000) {
      return json({ error: 'Invite expired' }, 410);
    }

    return json({ email: invite.email });
  }

  // POST /auth/signup — create account with invite token
  if (path === '/auth/signup' && method === 'POST') {
    const { token, name, password } = await request.json();
    if (!token || !password) return json({ error: 'Token and password required' }, 400);

    const invite = await env.DB.prepare(
      'SELECT * FROM invite_tokens WHERE token = ? AND used_at IS NULL'
    ).bind(token).first();

    if (!invite) return json({ error: 'Invalid or expired invite' }, 404);

    const created = new Date(invite.created_at);
    if (Date.now() - created.getTime() > 7 * 24 * 60 * 60 * 1000) {
      return json({ error: 'Invite expired' }, 410);
    }

    // Create user
    const userId = crypto.randomUUID();
    const passwordHash = await hashPassword(password);
    await env.DB.prepare('INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)')
      .bind(userId, invite.email, passwordHash, name || null).run();

    // Mark invite as used
    await env.DB.prepare('UPDATE invite_tokens SET used_at = datetime(\'now\') WHERE token = ?')
      .bind(token).run();

    // Create session
    const sessionToken = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
    await env.DB.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)')
      .bind(sessionToken, userId, expiresAt).run();

    // Create default watchlist
    await env.DB.prepare('INSERT INTO watchlists (id, user_id) VALUES (?, ?)')
      .bind(crypto.randomUUID(), userId).run();

    // Create default settings
    await env.DB.prepare('INSERT INTO user_settings (user_id) VALUES (?)')
      .bind(userId).run();

    return json(
      { user: { id: userId, email: invite.email, name: name || null, role: 'user' } },
      201,
      { 'Set-Cookie': sessionCookie(sessionToken, SESSION_TTL_DAYS * 24 * 60 * 60) }
    );
  }

  // POST /auth/setup — one-time admin account creation (only works when DB has 0 users)
  if (path === '/auth/setup' && method === 'POST') {
    const count = await env.DB.prepare('SELECT COUNT(*) as n FROM users').first();
    if (count.n > 0) return json({ error: 'Setup already complete' }, 403);

    const { email, password, name } = await request.json();
    if (!email || !password) return json({ error: 'Email and password required' }, 400);

    const userId = crypto.randomUUID();
    const passwordHash = await hashPassword(password);
    await env.DB.prepare('INSERT INTO users (id, email, password_hash, name, role) VALUES (?, ?, ?, ?, ?)')
      .bind(userId, email.toLowerCase(), passwordHash, name || null, 'admin').run();

    // Create default watchlist + settings
    await env.DB.prepare('INSERT INTO watchlists (id, user_id) VALUES (?, ?)').bind(crypto.randomUUID(), userId).run();
    await env.DB.prepare('INSERT INTO user_settings (user_id) VALUES (?)').bind(userId).run();

    // Create session
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
    await env.DB.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)')
      .bind(token, userId, expiresAt).run();

    return json(
      { user: { id: userId, email: email.toLowerCase(), name: name || null, role: 'admin' } },
      201,
      { 'Set-Cookie': sessionCookie(token, SESSION_TTL_DAYS * 24 * 60 * 60) }
    );
  }

  return json({ error: 'Not found' }, 404);
}
