// v3 pipeline routes — dispatch to Inngest, status polling, and Fly callback receiver.
// POST /api/v3/pipeline/onepager/start  — kicks off a One Pager run (auth required)
// GET  /api/v3/pipeline/status/:runId    — polls D1 for run status (auth required)
// POST /api/v3/pipeline/callback         — Fly service POSTs final result here (no auth, shared-secret instead)

import { Inngest } from 'inngest';
import { assembleDataPacket } from '../assembly/assembleDataPacket.js';
import { assembleFilingContent } from '../assembly/assembleFilingContent.js';
import {
  writeAssembly,
  dataPacketKey,
  filingsKey,
  parentReportKey,
} from '../assembly/r2-cache.js';

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

  // POST /api/v3/pipeline/pitchdeck/start
  if (request.method === 'POST' && path === '/api/v3/pipeline/pitchdeck/start') {
    return handlePitchDeckStart(request, env, user);
  }

  // POST /api/v3/pipeline/fullstory/start
  if (request.method === 'POST' && path === '/api/v3/pipeline/fullstory/start') {
    return handleFullStoryStart(request, env, user);
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

  // POST /api/v3/pipeline/progress (UNAUTHENTICATED — uses shared secret)
  if (request.method === 'POST' && path === '/api/v3/pipeline/progress') {
    return handleProgress(request, env);
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
  const reportId = crypto.randomUUID();

  // Mint v3_runs first (parent), then reports (child) so the FK on
  // reports.v3_run_id → v3_runs.id resolves under D1's immediate FK enforcement.
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO v3_runs (id, user_id, ticker, pipeline_stage, status) VALUES (?, ?, ?, 'one-pager', 'running')`
    ).bind(runId, user.id, ticker),
    env.DB.prepare(
      `INSERT INTO reports (id, user_id, ticker, current_stage, v3_run_id) VALUES (?, ?, ?, 1, ?)`
    ).bind(reportId, user.id, ticker, runId),
  ]);

  // Send Inngest event
  const inngest = getInngestClient(env);
  try {
    await inngest.send({
      name: 'thes1s/onepager.start',
      data: { runId, ticker, userId: String(user.id), reportId },
    });
  } catch (err) {
    await markFailed(env.DB, runId, `inngest dispatch: ${err.message}`);
    return json({ error: `Pipeline dispatch failed: ${err.message}` }, 500);
  }

  return json({ runId, reportId, status: 'running' }, 202);
}

async function handlePitchDeckStart(request, env, user) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON body' }, 400); }

  const ticker = (body.ticker ?? '').toString().trim().toUpperCase();
  if (!ticker || !/^[A-Z0-9.-]{1,10}$/.test(ticker)) {
    return json({ error: 'Invalid ticker' }, 400);
  }

  const runId = crypto.randomUUID();
  const reportId = crypto.randomUUID();

  // 1. Mint v3_runs first (parent), then reports (child) — FK ordering.
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO v3_runs (id, user_id, ticker, pipeline_stage, status) VALUES (?, ?, ?, 'pitch-deck', 'running')`
    ).bind(runId, user.id, ticker),
    env.DB.prepare(
      `INSERT INTO reports (id, user_id, ticker, current_stage, v3_run_id) VALUES (?, ?, ?, 2, ?)`
    ).bind(reportId, user.id, ticker, runId),
  ]);

  // 2. Pre-assemble DataPacket + filing content into R2.
  // Sequential because filing assembly needs the DataPacket's filings array.
  let packet;
  try {
    packet = await assembleDataPacket(ticker, env);
    await writeAssembly(env, dataPacketKey(runId), packet);
  } catch (err) {
    await markFailed(env.DB, runId, `assemble datapacket: ${err.message}`);
    return json({ error: `DataPacket assembly failed: ${err.message}` }, 500);
  }

  try {
    const filings = await assembleFilingContent(ticker, packet, env);
    await writeAssembly(env, filingsKey(runId), filings);
  } catch (err) {
    await markFailed(env.DB, runId, `assemble filings: ${err.message}`);
    return json({ error: `Filing assembly failed: ${err.message}` }, 500);
  }

  // 3. Fire the Inngest event.
  const inngest = getInngestClient(env);
  try {
    await inngest.send({
      name: 'thes1s/pitchdeck.start',
      data: { runId, ticker, userId: String(user.id), reportId },
    });
  } catch (err) {
    await markFailed(env.DB, runId, `inngest dispatch: ${err.message}`);
    return json({ error: `Pipeline dispatch failed: ${err.message}` }, 500);
  }

  return json({ runId, reportId, status: 'running' }, 202);
}

async function markFailed(db, runId, error) {
  await db.prepare(
    `UPDATE v3_runs SET status = 'failed', error_message = ?, finished_at = datetime('now') WHERE id = ?`
  ).bind(error, runId).run();
}

async function handleFullStoryStart(request, env, user) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON body' }, 400); }

  const ticker = (body.ticker ?? '').toString().trim().toUpperCase();
  const parentReportId = (body.parentReportId ?? '').toString().trim();
  if (!ticker || !/^[A-Z0-9.-]{1,10}$/.test(ticker)) {
    return json({ error: 'Invalid ticker' }, 400);
  }
  if (!parentReportId) {
    return json({ error: 'parentReportId required (must be a completed v3 Pitch Deck report)' }, 400);
  }

  // Validate the parent PD report.
  const parent = await env.DB.prepare(
    `SELECT id, ticker, v3_run_id, user_id FROM reports WHERE id = ? AND user_id = ?`
  ).bind(parentReportId, user.id).first();
  if (!parent) return json({ error: 'Parent report not found' }, 404);
  if (parent.ticker !== ticker) return json({ error: 'Parent report ticker mismatch' }, 400);
  if (!parent.v3_run_id) return json({ error: 'Parent report is not a v3 run (legacy v1 reports cannot drive FS yet)' }, 400);

  const parentRun = await env.DB.prepare(
    `SELECT status, result_json, pipeline_stage FROM v3_runs WHERE id = ?`
  ).bind(parent.v3_run_id).first();
  if (!parentRun || parentRun.status !== 'completed') {
    return json({ error: 'Parent Pitch Deck run not completed' }, 400);
  }
  if (parentRun.pipeline_stage !== 'pitch-deck') {
    return json({ error: 'Parent run is not a Pitch Deck' }, 400);
  }

  const runId = crypto.randomUUID();
  const reportId = crypto.randomUUID();

  // Mint v3_runs first (parent), then reports (child) — FK ordering.
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO v3_runs (id, user_id, ticker, pipeline_stage, status) VALUES (?, ?, ?, 'full-story', 'running')`
    ).bind(runId, user.id, ticker),
    env.DB.prepare(
      `INSERT INTO reports (id, user_id, ticker, current_stage, v3_run_id) VALUES (?, ?, ?, 3, ?)`
    ).bind(reportId, user.id, ticker, runId),
  ]);

  // Assemble DataPacket. FS does not need fresh filings — PSR was Wave 0 of PD,
  // its findings are inherited via the parent PD report.
  let packet;
  try {
    packet = await assembleDataPacket(ticker, env);
    await writeAssembly(env, dataPacketKey(runId), packet);
  } catch (err) {
    await markFailed(env.DB, runId, `assemble datapacket: ${err.message}`);
    return json({ error: `DataPacket assembly failed: ${err.message}` }, 500);
  }

  // Stash the parent PD report so FS Phase 1 agents can read it.
  try {
    await writeAssembly(env, parentReportKey(runId), JSON.parse(parentRun.result_json));
  } catch (err) {
    await markFailed(env.DB, runId, `stash parent report: ${err.message}`);
    return json({ error: `Could not stash parent PD report: ${err.message}` }, 500);
  }

  const inngest = getInngestClient(env);
  try {
    await inngest.send({
      name: 'thes1s/fullstory.start',
      data: { runId, ticker, userId: String(user.id), reportId, parentReportId },
    });
  } catch (err) {
    await markFailed(env.DB, runId, `inngest dispatch: ${err.message}`);
    return json({ error: `Pipeline dispatch failed: ${err.message}` }, 500);
  }

  return json({ runId, reportId, status: 'running' }, 202);
}

async function handleStatus(env, user, runId) {
  // Run-level row
  const row = await env.DB.prepare(
    `SELECT id, ticker, pipeline_stage, status,
            phase, phase_label, heartbeat_at,
            tokens_input, tokens_output, cost_usd,
            result_json, error_message, failed_sections,
            started_at, finished_at
     FROM v3_runs WHERE id = ? AND user_id = ?`
  ).bind(runId, user.id).first();

  if (!row) return json({ error: 'Run not found' }, 404);

  // Per-agent rows (may be empty if no agent has reported yet)
  const agentsRes = await env.DB.prepare(
    `SELECT agent_id, display_name, wave, status,
            started_at, finished_at, subprogress, last_message,
            tokens_input, tokens_output, cached_tokens, error_message
     FROM v3_run_agents
     WHERE run_id = ?
     ORDER BY wave ASC NULLS FIRST, agent_id ASC`
  ).bind(runId).all();

  const agents = (agentsRes.results ?? []).map((a) => ({
    id:           a.agent_id,
    displayName:  a.display_name,
    wave:         a.wave,
    status:       a.status,
    startedAt:    a.started_at,
    finishedAt:   a.finished_at,
    subprogress:  a.subprogress ? safeJsonParse(a.subprogress) : null,
    lastMessage:  a.last_message,
    tokens: (a.tokens_input || a.tokens_output || a.cached_tokens) ? {
      input:  a.tokens_input,
      output: a.tokens_output,
      cached: a.cached_tokens,
    } : null,
    error:        a.error_message,
  }));

  return json({
    runId:          row.id,
    ticker:         row.ticker,
    pipelineStage:  row.pipeline_stage,
    status:         row.status,
    phase:          row.phase,
    phaseLabel:     row.phase_label,
    agents,
    heartbeatAt:    row.heartbeat_at,
    startedAt:      row.started_at,
    updatedAt:      row.heartbeat_at ?? row.started_at,
    finishedAt:     row.finished_at,
    tokens: {
      input:  row.tokens_input ?? 0,
      output: row.tokens_output ?? 0,
      cached: 0,  // run-level cached not tracked separately yet
    },
    costUsd:        row.cost_usd ?? 0,
    result:         row.result_json ? safeJsonParse(row.result_json) : null,
    error:          row.error_message ? { message: row.error_message } : null,
    failedSections: row.failed_sections ? safeJsonParse(row.failed_sections) : null,
  });
}

function safeJsonParse(s) {
  try { return JSON.parse(s); } catch { return null; }
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
  if (!runId || !['completed', 'completed_with_errors', 'failed'].includes(status)) {
    return json({ error: 'Invalid callback payload' }, 400);
  }

  if (status === 'completed') {
    await env.DB.prepare(
      `UPDATE v3_runs SET status = 'completed', result_json = ?, finished_at = datetime('now') WHERE id = ? AND status NOT IN ('completed','completed_with_errors','failed')`
    ).bind(JSON.stringify(result ?? {}), runId).run();
  } else if (status === 'completed_with_errors') {
    await env.DB.prepare(
      `UPDATE v3_runs SET status = 'completed_with_errors', result_json = ?, failed_sections = ?, finished_at = datetime('now') WHERE id = ? AND status NOT IN ('completed','completed_with_errors','failed')`
    ).bind(
      JSON.stringify(result ?? {}),
      JSON.stringify(body.failedSections ?? []),
      runId,
    ).run();
  } else {
    await env.DB.prepare(
      `UPDATE v3_runs SET status = 'failed', error_message = ?, finished_at = datetime('now') WHERE id = ? AND status NOT IN ('completed','completed_with_errors','failed')`
    ).bind(String(error ?? 'Unknown error'), runId).run();
  }

  return json({ ok: true });
}

async function handleProgress(request, env) {
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

  const { runId, kind, payload } = body;
  if (!runId || !kind) {
    return json({ error: 'runId and kind required' }, 400);
  }

  switch (kind) {
    case 'heartbeat':
      return handleHeartbeat(env, runId);
    case 'agent-update':
      return handleAgentUpdate(env, runId, payload ?? {});
    case 'phase-update':
      return handlePhaseUpdate(env, runId, payload ?? {});
    case 'tokens':
      return handleTokens(env, runId, payload ?? {});
    default:
      return json({ error: `Unknown kind: ${kind}` }, 400);
  }
}

async function handleHeartbeat(env, runId) {
  // Idempotent: bump heartbeat_at only when the run is still in flight.
  await env.DB.prepare(
    `UPDATE v3_runs SET heartbeat_at = datetime('now') WHERE id = ? AND status NOT IN ('completed','completed_with_errors','failed')`
  ).bind(runId).run();
  return json({ ok: true });
}

// Implemented in Tasks 4 & 5
async function handleAgentUpdate(env, runId, payload) {
  const {
    agentId, displayName, wave, status,
    startedAt, finishedAt, subprogress, lastMessage,
    tokensInput, tokensOutput, cachedTokens, errorMessage,
  } = payload;

  if (!agentId || !displayName || !status) {
    return json({ error: 'agentId, displayName, status required' }, 400);
  }
  if (!['pending','running','completed','failed'].includes(status)) {
    return json({ error: `Invalid status: ${status}` }, 400);
  }

  // Idempotent UPSERT: existing row updates, new row inserts. Conditional
  // status guard prevents downgrade from terminal states (e.g. retry replay).
  await env.DB.prepare(
    `INSERT INTO v3_run_agents
       (run_id, agent_id, display_name, wave, status, started_at, finished_at,
        subprogress, last_message, tokens_input, tokens_output, cached_tokens, error_message)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(run_id, agent_id) DO UPDATE SET
       display_name  = excluded.display_name,
       wave          = excluded.wave,
       status        = CASE
                         WHEN v3_run_agents.status IN ('completed','failed')
                           THEN v3_run_agents.status
                         ELSE excluded.status
                       END,
       started_at    = COALESCE(v3_run_agents.started_at, excluded.started_at),
       finished_at   = COALESCE(excluded.finished_at, v3_run_agents.finished_at),
       subprogress   = excluded.subprogress,
       last_message  = excluded.last_message,
       tokens_input  = excluded.tokens_input,
       tokens_output = excluded.tokens_output,
       cached_tokens = excluded.cached_tokens,
       error_message = COALESCE(excluded.error_message, v3_run_agents.error_message)
    `
  ).bind(
    runId, agentId, displayName, wave ?? null, status,
    startedAt ?? null, finishedAt ?? null,
    subprogress ? JSON.stringify(subprogress) : null,
    lastMessage ?? null,
    tokensInput ?? 0, tokensOutput ?? 0, cachedTokens ?? 0,
    errorMessage ?? null,
  ).run();

  return json({ ok: true });
}
async function handlePhaseUpdate(env, runId, payload) {
  const { phase, phaseLabel } = payload;
  if (!phase) return json({ error: 'phase required' }, 400);

  await env.DB.prepare(
    `UPDATE v3_runs SET phase = ?, phase_label = ? WHERE id = ? AND status NOT IN ('completed','completed_with_errors','failed')`
  ).bind(phase, phaseLabel ?? null, runId).run();

  return json({ ok: true });
}

async function handleTokens(env, runId, payload) {
  const { tokensInput, tokensOutput, costUsd } = payload;

  await env.DB.prepare(
    `UPDATE v3_runs
     SET tokens_input  = COALESCE(?, tokens_input),
         tokens_output = COALESCE(?, tokens_output),
         cost_usd      = COALESCE(?, cost_usd)
     WHERE id = ? AND status NOT IN ('completed','completed_with_errors','failed')`
  ).bind(
    tokensInput ?? null,
    tokensOutput ?? null,
    costUsd ?? null,
    runId,
  ).run();

  return json({ ok: true });
}
