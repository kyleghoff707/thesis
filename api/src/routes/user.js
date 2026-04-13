// User data routes — reports, watchlists, settings CRUD
// All routes require authentication (enforced by index.js)

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function handleUser(request, env, path, user) {
  const method = request.method;

  // ─── Reports ─────────────────────────────────────────────────

  // GET /user/reports — list user's reports (only those with at least one generated stage)
  if (path === '/user/reports' && method === 'GET') {
    const { results } = await env.DB.prepare(
      `SELECT r.id, r.ticker, r.company_name, r.current_stage, r.stage_approvals,
              r.watchlist, r.notes, r.created_at, r.updated_at
       FROM reports r
       WHERE r.user_id = ?
         AND EXISTS (SELECT 1 FROM report_stages rs WHERE rs.report_id = r.id)
       ORDER BY r.updated_at DESC`
    ).bind(user.id).all();
    // Fetch which stages exist for each report
    const reportIds = results.map(r => r.id);
    const stageRows = reportIds.length > 0
      ? (await env.DB.prepare(
          `SELECT report_id, stage FROM report_stages WHERE report_id IN (${reportIds.map(() => '?').join(',')})`
        ).bind(...reportIds).all()).results
      : [];

    // Build stages availability map per report
    const stageMap = {};
    for (const row of stageRows) {
      if (!stageMap[row.report_id]) stageMap[row.report_id] = {};
      stageMap[row.report_id][row.stage] = true;
    }

    return json({ reports: results.map(r => ({
      ...r,
      stage_approvals: JSON.parse(r.stage_approvals || '{}'),
      stages: stageMap[r.id] || {},
    })) });
  }

  // GET /user/reports/:id — get full report with stage data
  const reportMatch = path.match(/^\/user\/reports\/([^/]+)$/);
  if (reportMatch && method === 'GET') {
    const id = reportMatch[1];
    const report = await env.DB.prepare(
      'SELECT * FROM reports WHERE id = ? AND user_id = ?'
    ).bind(id, user.id).first();
    if (!report) return json({ error: 'Not found' }, 404);

    const { results: stages } = await env.DB.prepare(
      'SELECT stage, data, created_at FROM report_stages WHERE report_id = ?'
    ).bind(id).all();

    const parsed = {
      ...report,
      stage_approvals: JSON.parse(report.stage_approvals || '{}'),
      competitors: JSON.parse(report.competitors || '{}'),
    };
    for (const s of stages) {
      parsed[s.stage] = JSON.parse(s.data);
    }
    return json({ report: parsed });
  }

  // POST /user/reports — create new report
  if (path === '/user/reports' && method === 'POST') {
    const body = await request.json();
    const id = body.id || crypto.randomUUID();
    await env.DB.prepare(
      'INSERT INTO reports (id, user_id, ticker, company_name) VALUES (?, ?, ?, ?)'
    ).bind(id, user.id, body.ticker, body.companyName || null).run();
    return json({ id }, 201);
  }

  // PUT /user/reports/:id — update report metadata
  if (reportMatch && method === 'PUT') {
    const id = reportMatch[1];
    const body = await request.json();
    const fields = [];
    const values = [];

    for (const key of ['ticker', 'company_name', 'current_stage', 'notes', 'watchlist']) {
      if (body[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(body[key]);
      }
    }
    if (body.stage_approvals !== undefined) {
      fields.push('stage_approvals = ?');
      values.push(JSON.stringify(body.stage_approvals));
    }
    if (body.competitors !== undefined) {
      fields.push('competitors = ?');
      values.push(JSON.stringify(body.competitors));
    }
    if (fields.length === 0) return json({ error: 'No fields to update' }, 400);

    fields.push('updated_at = datetime(\'now\')');
    values.push(id, user.id);

    await env.DB.prepare(
      `UPDATE reports SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`
    ).bind(...values).run();
    return json({ ok: true });
  }

  // DELETE /user/reports/:id
  if (reportMatch && method === 'DELETE') {
    const id = reportMatch[1];
    await env.DB.prepare('DELETE FROM report_stages WHERE report_id = ?').bind(id).run();
    await env.DB.prepare('DELETE FROM reports WHERE id = ? AND user_id = ?').bind(id, user.id).run();
    return json({ ok: true });
  }

  // PUT /user/reports/:id/stages/:stage — save stage data
  const stageMatch = path.match(/^\/user\/reports\/([^/]+)\/stages\/([^/]+)$/);
  if (stageMatch && method === 'PUT') {
    const [, reportId, stage] = stageMatch;

    // Verify ownership
    const report = await env.DB.prepare('SELECT id FROM reports WHERE id = ? AND user_id = ?')
      .bind(reportId, user.id).first();
    if (!report) return json({ error: 'Not found' }, 404);

    const body = await request.json();
    await env.DB.prepare(
      'INSERT OR REPLACE INTO report_stages (report_id, stage, data) VALUES (?, ?, ?)'
    ).bind(reportId, stage, JSON.stringify(body)).run();

    return json({ ok: true });
  }

  // ─── Watchlists ──────────────────────────────────────────────

  // GET /user/watchlists
  if (path === '/user/watchlists' && method === 'GET') {
    const { results } = await env.DB.prepare(
      'SELECT * FROM watchlists WHERE user_id = ? ORDER BY created_at'
    ).bind(user.id).all();
    return json({ watchlists: results.map(w => ({ ...w, tickers: JSON.parse(w.tickers || '[]') })) });
  }

  // PUT /user/watchlists — update watchlists (replace all)
  if (path === '/user/watchlists' && method === 'PUT') {
    const { watchlists } = await request.json();
    // Delete existing and re-insert
    await env.DB.prepare('DELETE FROM watchlists WHERE user_id = ?').bind(user.id).run();
    for (const w of watchlists) {
      await env.DB.prepare(
        'INSERT INTO watchlists (id, user_id, name, tickers) VALUES (?, ?, ?, ?)'
      ).bind(w.id || crypto.randomUUID(), user.id, w.name || 'Default', JSON.stringify(w.tickers || [])).run();
    }
    return json({ ok: true });
  }

  // ─── Usage & Billing ─────────────────────────────────────────

  // GET /user/billing — current month spend, limit, status
  if (path === '/user/billing' && method === 'GET') {
    const db = env.DB;
    const isAdmin = user.role === 'admin';
    const showAll = isAdmin && new URL(request.url).searchParams.get('all') === 'true';

    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const monthStartStr = monthStart.toISOString().replace('T', ' ').slice(0, 19);

    if (showAll) {
      // Admin: all users
      const { results: users } = await db.prepare(`
        SELECT u.id, u.email, u.name, u.role, b.monthly_limit_cents, b.billing_active,
          b.stripe_customer_id,
          COALESCE((SELECT SUM(cost_millicents) FROM api_usage WHERE user_id = u.id AND created_at >= ? AND status = 'completed'), 0) as spend_millicents
        FROM users u LEFT JOIN billing b ON u.id = b.user_id
        ORDER BY u.created_at
      `).bind(monthStartStr).all();
      return json({ users });
    }

    // Single user
    const billing = await db.prepare(
      'SELECT monthly_limit_cents, billing_active, stripe_customer_id FROM billing WHERE user_id = ?'
    ).bind(user.id).first();

    const usage = await db.prepare(`
      SELECT COALESCE(SUM(cost_millicents), 0) as spend_millicents
      FROM api_usage WHERE user_id = ? AND created_at >= ? AND status = 'completed'
    `).bind(user.id, monthStartStr).first();

    return json({
      spendMillicents: usage?.spend_millicents || 0,
      limitCents: billing?.monthly_limit_cents || 5000,
      billingActive: billing?.billing_active || 0,
      hasStripe: !!billing?.stripe_customer_id,
    });
  }

  // GET /user/usage — recent API usage history
  if (path === '/user/usage' && method === 'GET') {
    const { results } = await env.DB.prepare(`
      SELECT model, input_tokens, output_tokens, cost_millicents, caller, ticker, created_at
      FROM api_usage WHERE user_id = ? AND status = 'completed'
      ORDER BY created_at DESC LIMIT 20
    `).bind(user.id).all();
    return json({ usage: results });
  }

  // PUT /user/billing/limit — admin only, adjust user's spending limit
  const limitMatch = path.match(/^\/user\/billing\/limit$/);
  if (limitMatch && method === 'PUT') {
    if (user.role !== 'admin') return json({ error: 'Admin access required' }, 403);
    const { userId, limitCents } = await request.json();
    if (!userId || limitCents === undefined) return json({ error: 'userId and limitCents required' }, 400);
    await env.DB.prepare(
      'UPDATE billing SET monthly_limit_cents = ?, updated_at = datetime(\'now\') WHERE user_id = ?'
    ).bind(limitCents, userId).run();
    return json({ ok: true });
  }

  // ─── Settings ────────────────────────────────────────────────

  // GET /user/settings
  if (path === '/user/settings' && method === 'GET') {
    const row = await env.DB.prepare('SELECT settings FROM user_settings WHERE user_id = ?')
      .bind(user.id).first();
    return json({ settings: JSON.parse(row?.settings || '{}') });
  }

  // PUT /user/settings
  if (path === '/user/settings' && method === 'PUT') {
    const body = await request.json();
    await env.DB.prepare(
      'INSERT OR REPLACE INTO user_settings (user_id, settings, updated_at) VALUES (?, ?, datetime(\'now\'))'
    ).bind(user.id, JSON.stringify(body)).run();
    return json({ ok: true });
  }

  return json({ error: 'Not found' }, 404);
}
