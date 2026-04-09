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

  // GET /user/reports — list user's reports
  if (path === '/user/reports' && method === 'GET') {
    const { results } = await env.DB.prepare(
      'SELECT id, ticker, company_name, current_stage, stage_approvals, watchlist, notes, created_at, updated_at FROM reports WHERE user_id = ? ORDER BY updated_at DESC'
    ).bind(user.id).all();
    return json({ reports: results.map(r => ({ ...r, stage_approvals: JSON.parse(r.stage_approvals || '{}') })) });
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
    const id = crypto.randomUUID();
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
