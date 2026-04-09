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

// ─── Invite email template ────────────────────────────────────

function buildInviteEmail(signupUrl) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:40px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
  <tr><td style="padding:32px 40px 24px;text-align:center;">
    <img src="https://thes1sinvesting.com/logo.svg" alt="Thes1s" width="44" height="44" style="border-radius:8px;">
    <h1 style="margin:16px 0 0;font-size:22px;font-weight:700;color:#1e293b;">You're invited to Thes1s</h1>
  </td></tr>
  <tr><td style="padding:0 40px 24px;">
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#475569;">
      You've been invited to join <strong>Thes1s</strong> — an AI-powered investment research platform that performs Rule One stock analysis in minutes instead of hours.
    </p>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#475569;">
      Click the button below to create your account and get started.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
      <a href="${signupUrl}" style="display:inline-block;padding:14px 32px;background:#0f766e;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:8px;">
        Create your account
      </a>
    </td></tr></table>
  </td></tr>
  <tr><td style="padding:20px 40px;border-top:1px solid #e2e8f0;">
    <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.5;">
      This invite expires in 7 days. If you didn't expect this email, you can safely ignore it.
    </p>
  </td></tr>
  <tr><td style="padding:0 40px 24px;">
    <p style="margin:0;font-size:12px;color:#cbd5e1;">Thes1s — AI-Powered Investment Research</p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
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

    // Send invite email via Brevo
    const BREVO_KEY = env.BREVO_API_KEY;
    if (BREVO_KEY) {
      const signupUrl = `${new URL(request.url).origin.replace('api.', '')}/#/signup?token=${token}`;
      await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': BREVO_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender: { name: 'Thes1s', email: 'noreply@thes1sinvesting.com' },
          to: [{ email }],
          subject: 'You\'re invited to Thes1s',
          htmlContent: buildInviteEmail(signupUrl),
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
