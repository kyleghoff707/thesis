// v3 pipeline routes — dispatch to Inngest, status polling, and Fly callback receiver.
// POST /api/v3/pipeline/onepager/start  — kicks off a One Pager run (auth required)
// GET  /api/v3/pipeline/status/:runId    — polls D1 for run status (auth required)
// POST /api/v3/pipeline/callback         — Fly service POSTs final result here (no auth, shared-secret instead)

import { Inngest } from 'inngest';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function getInngestClient(env) {
  return new Inngest({
    id: 'thes1s-worker',
    eventKey: env.INNGEST_EVENT_KEY,
  });
}

export async function handlePipelineV3(request, env, path, user) {
  // POST /api/v3/pipeline/onepager/start
  if (request.method === 'POST' && path === '/api/v3/pipeline/onepager/start') {
    return handleOnePagerStart(request, env, user);
  }

  // GET /api/v3/pipeline/status/:runId
  const statusMatch = path.match(/^\/api\/v3\/pipeline\/status\/([a-zA-Z0-9-]+)$/);
  if (request.method === 'GET' && statusMatch) {
    return handleStatus(env, user, statusMatch[1]);
  }

  // POST /api/v3/pipeline/callback (UNAUTHENTICATED — uses shared secret instead)
  if (request.method === 'POST' && path === '/api/v3/pipeline/callback') {
    return handleCallback(request, env);
  }

  return null; // route not handled — let the main router 404
}

async function handleOnePagerStart(request, env, user) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const ticker = (body.ticker ?? '').toString().trim().toUpperCase();
  if (!ticker || !/^[A-Z0-9.-]{1,10}$/.test(ticker)) {
    return json({ error: 'Invalid ticker' }, 400);
  }

  const runId = crypto.randomUUID();

  // Insert v3_runs row before sending the event so the status endpoint is queryable immediately.
  await env.DB.prepare(
    `INSERT INTO v3_runs (id, user_id, ticker, pipeline_stage, status) VALUES (?, ?, ?, 'one-pager', 'running')`
  ).bind(runId, user.id, ticker).run();

  // Send Inngest event
  const inngest = getInngestClient(env);
  await inngest.send({
    name: 'thes1s/onepager.start',
    data: { runId, ticker, userId: String(user.id) },
  });

  return json({ runId, status: 'running' }, 202);
}

async function handleStatus(env, user, runId) {
  const row = await env.DB.prepare(
    `SELECT id, ticker, pipeline_stage, status, result_json, error_message, started_at, finished_at
     FROM v3_runs WHERE id = ? AND user_id = ?`
  ).bind(runId, user.id).first();

  if (!row) return json({ error: 'Run not found' }, 404);

  const result = row.result_json ? JSON.parse(row.result_json) : null;

  return json({
    runId: row.id,
    ticker: row.ticker,
    pipelineStage: row.pipeline_stage,
    status: row.status,
    result,
    error: row.error_message ?? null,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  });
}

async function handleCallback(request, env) {
  // Auth via shared secret (Fly knows WORKER_CALLBACK_SECRET; Worker has the same as V3_CALLBACK_SECRET).
  const provided = request.headers.get('X-Callback-Secret');
  if (!provided || provided !== env.V3_CALLBACK_SECRET) {
    return json({ error: 'Unauthorized' }, 401);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const { runId, status, result, error } = body;
  if (!runId || !['completed', 'failed'].includes(status)) {
    return json({ error: 'Invalid callback payload' }, 400);
  }

  if (status === 'completed') {
    await env.DB.prepare(
      `UPDATE v3_runs SET status = 'completed', result_json = ?, finished_at = datetime('now') WHERE id = ?`
    ).bind(JSON.stringify(result ?? {}), runId).run();
  } else {
    await env.DB.prepare(
      `UPDATE v3_runs SET status = 'failed', error_message = ?, finished_at = datetime('now') WHERE id = ?`
    ).bind(String(error ?? 'Unknown error'), runId).run();
  }

  return json({ ok: true });
}
