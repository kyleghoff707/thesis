// Admin-only routes. Caller must have role='admin'.

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const VALID_STAGES = ['onePager', 'pitchDeck', 'fullStory'];
const STAGE_NUMBER = { onePager: 1, pitchDeck: 2, fullStory: 3 };

export async function handleAdmin(request, env, path, user) {
  if (user.role !== 'admin') return json({ error: 'Admin access required' }, 403);
  const method = request.method;

  // POST /admin/inject-report
  // Body: { targetEmail, ticker, companyName?, stages: { onePager?, pitchDeck?, fullStory? } }
  // Each stage value is the raw pipeline output: { sections, errors?, generatedAt? }
  if (path === '/admin/inject-report' && method === 'POST') {
    const body = await request.json();
    const { targetEmail, ticker, companyName, stages } = body || {};

    if (!targetEmail || !ticker || !stages || typeof stages !== 'object') {
      return json({ error: 'targetEmail, ticker, and stages are required' }, 400);
    }

    const stageEntries = Object.entries(stages).filter(([k, v]) => {
      if (!VALID_STAGES.includes(k)) return false;
      if (!v || !Array.isArray(v.sections) || v.sections.length === 0) return false;
      return true;
    });
    if (stageEntries.length === 0) {
      return json({ error: 'At least one stage with a non-empty sections array is required' }, 400);
    }

    const target = await env.DB.prepare('SELECT id FROM users WHERE email = ?')
      .bind(String(targetEmail).toLowerCase()).first();
    if (!target) return json({ error: `No user with email ${targetEmail}` }, 404);

    const existing = await env.DB.prepare(
      'SELECT id, current_stage FROM reports WHERE user_id = ? AND ticker = ? LIMIT 1'
    ).bind(target.id, ticker).first();

    const reportId = existing?.id || crypto.randomUUID();
    const maxStage = Math.max(...stageEntries.map(([k]) => STAGE_NUMBER[k]));
    const resolvedCompanyName = companyName ||
      stages.onePager?.companyName || stages.pitchDeck?.companyName || stages.fullStory?.companyName ||
      ticker;

    if (existing) {
      const nextStage = Math.max(existing.current_stage || 1, maxStage);
      await env.DB.prepare(
        `UPDATE reports SET company_name = ?, current_stage = ?, updated_at = datetime('now') WHERE id = ?`
      ).bind(resolvedCompanyName, nextStage, reportId).run();
    } else {
      await env.DB.prepare(
        `INSERT INTO reports (id, user_id, ticker, company_name, current_stage) VALUES (?, ?, ?, ?, ?)`
      ).bind(reportId, target.id, ticker, resolvedCompanyName, maxStage).run();
    }

    const writtenStages = [];
    for (const [stage, raw] of stageEntries) {
      const payload = {
        sections: raw.sections,
        errors: raw.errors || [],
        generatedAt: raw.generatedAt || new Date().toISOString(),
      };
      await env.DB.prepare(
        `INSERT INTO report_stages (report_id, stage, data) VALUES (?, ?, ?)
         ON CONFLICT(report_id, stage) DO UPDATE SET data = excluded.data`
      ).bind(reportId, stage, JSON.stringify(payload)).run();
      writtenStages.push(stage);
    }

    return json({
      ok: true,
      reportId,
      created: !existing,
      targetUserId: target.id,
      ticker,
      companyName: resolvedCompanyName,
      stagesWritten: writtenStages,
    });
  }

  return json({ error: 'Not found' }, 404);
}
