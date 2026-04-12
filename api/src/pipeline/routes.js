// Pipeline routes — server-side report generation via Managed Agents.
// POST /api/pipeline/run — start a pipeline run (creates session + event loop DO)
// GET /api/pipeline/status/:runId — poll progress (reads D1)

import { ensureCoordinatorAgent, createSession, sendSessionEvent } from './coordinator.js';

const STALE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function handlePipeline(request, env, path, user, ctx) {
  // POST /api/pipeline/run
  if (request.method === 'POST' && path === '/api/pipeline/run') {
    return handleRun(request, env, user, ctx);
  }

  // GET /api/pipeline/status/:runId
  const statusMatch = path.match(/^\/api\/pipeline\/status\/([a-zA-Z0-9-]+)$/);
  if (request.method === 'GET' && statusMatch) {
    return handleStatus(env, user, statusMatch[1]);
  }

  return json({ error: 'Not found' }, 404);
}

async function handleRun(request, env, user, ctx) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const { ticker, stage, reportId } = body;
  if (!ticker || !stage) {
    return json({ error: 'ticker and stage are required' }, 400);
  }

  // Validate ticker format (prevents SSRF via malicious ticker in outbound fetch URLs)
  if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker.toUpperCase())) {
    return json({ error: 'Invalid ticker format' }, 400);
  }

  const validStages = ['onePager', 'pitchDeck', 'fullStory'];
  if (!validStages.includes(stage)) {
    return json({ error: `stage must be one of: ${validStages.join(', ')}` }, 400);
  }

  // Check for active pipeline run (concurrent limit: 1 per user)
  const active = await env.DB.prepare(
    `SELECT id, ticker, stage, status, updated_at FROM pipeline_runs
     WHERE user_id = ? AND status IN ('queued', 'assembling', 'running')
     ORDER BY created_at DESC LIMIT 1`
  ).bind(user.id).first();

  if (active) {
    // Check staleness: if updated_at is > 10 min ago, mark as failed
    const updatedAt = new Date(active.updated_at).getTime();
    const now = Date.now();
    if (now - updatedAt > STALE_TIMEOUT_MS) {
      await env.DB.prepare(
        `UPDATE pipeline_runs SET status = 'failed', error = 'Timed out (stale)',
         updated_at = datetime('now') WHERE id = ?`
      ).bind(active.id).run();
      // Fall through — allow new run
    } else {
      return json({
        error: 'Pipeline already running',
        activeRun: { id: active.id, ticker: active.ticker, stage: active.stage },
      }, 409);
    }
  }

  // Check spending cap
  const billing = await env.DB.prepare(
    'SELECT monthly_limit_cents, billing_active FROM billing WHERE user_id = ?'
  ).bind(user.id).first();

  if (!billing && user.role !== 'admin') {
    return json({ error: 'Billing not configured. Set up payment method first.' }, 402);
  }

  if (billing && !billing.billing_active && user.role !== 'admin') {
    return json({ error: 'Billing not active. Set up payment method first.' }, 402);
  }

  if (billing && user.role !== 'admin') {
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const spent = await env.DB.prepare(
      `SELECT COALESCE(SUM(cost_millicents), 0) as total FROM api_usage
       WHERE user_id = ? AND created_at >= ? AND status = 'completed'`
    ).bind(user.id, monthStart.toISOString()).first();

    const spentCents = Math.ceil((spent?.total || 0) / 10);
    if (spentCents >= billing.monthly_limit_cents) {
      return json({ error: 'Monthly spending limit reached' }, 429);
    }
  }

  // Ensure report exists in D1 (created lazily — search only adds to React state)
  if (reportId) {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO reports (id, user_id, ticker) VALUES (?, ?, ?)`
    ).bind(reportId, user.id, ticker).run();
  }

  // Create pipeline run record
  const runId = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO pipeline_runs (id, user_id, report_id, ticker, stage, status, started_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'queued', datetime('now'), datetime('now'))`
  ).bind(runId, user.id, reportId || null, ticker, stage).run();

  // Create Managed Agent session and launch event loop DO.
  // The coordinator agent dispatches analyst agents via custom tools.
  // The event loop DO handles tool calls and keeps running for 5-15 min.
  let sessionId;
  try {
    // Get or create the coordinator agent (cached by prompt hash)
    const agentId = await ensureCoordinatorAgent(env);

    // Create a new session for this pipeline run
    const session = await createSession(agentId, env);
    sessionId = session.id;

    // Send the initial message to start the coordinator
    await sendSessionEvent(sessionId, {
      type: 'user.message',
      content: `Generate a ${stage} report for ${ticker}. Run ID: ${runId}. Report ID: ${reportId || 'none'}. User ID: ${user.id}.`,
    }, env);

    // Store session_id in D1 for debugging/recovery
    await env.DB.prepare(
      'UPDATE pipeline_runs SET session_id = ?, updated_at = datetime(\'now\') WHERE id = ?'
    ).bind(sessionId, runId).run();

  } catch (err) {
    // Session creation failed — mark run as failed
    console.warn(`Pipeline session creation failed for ${runId}:`, err.message);
    await env.DB.prepare(
      `UPDATE pipeline_runs SET status = 'failed', error = ?,
       updated_at = datetime('now') WHERE id = ?`
    ).bind(`Session creation failed: ${err.message}`, runId).run().catch(() => {});
    return json({ error: 'Failed to start pipeline session', detail: err.message }, 500);
  }

  // Fire-and-forget the event loop DO.
  // DO's fetch() awaits the full event loop (keeps DO alive for 5-15 min).
  // Errors are caught and written to D1 by the DO's try/catch.
  const doId = env.SESSION_EVENT_LOOP.idFromName(runId);
  const stub = env.SESSION_EVENT_LOOP.get(doId);

  // ctx.waitUntil keeps the Worker alive long enough for the DO request to dispatch.
  // Without it, the Worker isolate dies after sending the 202 response and the
  // stub.fetch() request is silently dropped before reaching the DO.
  const doPromise = stub.fetch(new Request('https://internal/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, runId, ticker, stage, userId: user.id, reportId }),
  })).catch(async (err) => {
    console.warn(`Pipeline event loop launch error for ${runId}:`, err.message);
    await env.DB.prepare(
      `UPDATE pipeline_runs SET status = 'failed', error = ?,
       updated_at = datetime('now') WHERE id = ?`
    ).bind(`Event loop failed: ${err.message}`, runId).run().catch(() => {});
  });
  ctx.waitUntil(doPromise);

  return json({ runId, status: 'queued', ticker, stage }, 202);
}

async function handleStatus(env, user, runId) {
  const run = await env.DB.prepare(
    `SELECT id, ticker, stage, status, current_wave, total_waves, progress,
            sections_json, error, budget_json, started_at, completed_at, updated_at, created_at
     FROM pipeline_runs WHERE id = ? AND user_id = ?`
  ).bind(runId, user.id).first();

  if (!run) {
    return json({ error: 'Pipeline run not found' }, 404);
  }

  // Staleness check: if running and not updated in 10 min, mark failed
  if (['queued', 'assembling', 'running'].includes(run.status)) {
    const updatedAt = new Date(run.updated_at).getTime();
    if (Date.now() - updatedAt > STALE_TIMEOUT_MS) {
      await env.DB.prepare(
        `UPDATE pipeline_runs SET status = 'failed', error = 'Timed out (no progress for 10 minutes)',
         updated_at = datetime('now') WHERE id = ?`
      ).bind(runId).run();
      run.status = 'failed';
      run.error = 'Timed out (no progress for 10 minutes)';
    }
  }

  // Parse JSON fields
  let progress = null;
  let budget = null;
  try { progress = run.progress ? JSON.parse(run.progress) : null; } catch {}
  try { budget = run.budget_json ? JSON.parse(run.budget_json) : null; } catch {}

  return json({
    id: run.id,
    ticker: run.ticker,
    stage: run.stage,
    status: run.status,
    currentWave: run.current_wave,
    totalWaves: run.total_waves,
    progress,
    sections_json: run.sections_json || null,
    error: run.error,
    budget,
    startedAt: run.started_at,
    completedAt: run.completed_at,
    updatedAt: run.updated_at,
    createdAt: run.created_at,
  });
}
