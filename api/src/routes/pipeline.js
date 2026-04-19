// Pipeline routes — Managed Agents integration for report generation.
// POST /api/pipeline/run — create session, send message, return runId
// POST /api/pipeline/assemble-data/:ticker — assemble DataPacket for agent consumption
// GET /api/pipeline/status/:runId — poll session events, save on completion
// GET /api/pipeline/events/:runId — proxy session event log (observability)

import { assembleDataPacket } from '../assembly/assembleDataPacket.js';
import { assembleFilingContent } from '../assembly/assembleFilingContent.js';

const ANTHROPIC_API = 'https://api.anthropic.com';
const BETA_HEADER = 'managed-agents-2026-04-01';
const STALE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes (One Pager takes ~4 min, generous buffer)

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}

export async function handlePipeline(request, env, path, user) {
  if (request.method === 'POST' && path === '/api/pipeline/run') {
    return handleRun(request, env, user);
  }

  const statusMatch = path.match(/^\/api\/pipeline\/status\/([a-zA-Z0-9-]+)$/);
  if (request.method === 'GET' && statusMatch) {
    return handleStatus(env, user, statusMatch[1]);
  }

  const eventsMatch = path.match(/^\/api\/pipeline\/events\/([a-zA-Z0-9-]+)$/);
  if (request.method === 'GET' && eventsMatch) {
    return handleEvents(env, user, eventsMatch[1]);
  }

  // GET /api/pipeline/export/:reportId/:stage/:format — generate PDF/DOCX via export service
  const exportMatch = path.match(/^\/api\/pipeline\/export\/([a-zA-Z0-9-]+)\/([a-zA-Z-]+)\/(pdf|docx)$/);
  if (request.method === 'GET' && exportMatch) {
    return handleExport(env, user, exportMatch[1], exportMatch[2], exportMatch[3]);
  }

  // POST /api/pipeline/assemble-data/:ticker — DEBUG/ADMIN ONLY
  // Server-side DataPacket assembly. NOT used by production pipeline (browser assembles).
  const assembleMatch = path.match(/^\/api\/pipeline\/assemble-data\/([A-Za-z0-9.-]+)$/);
  if (request.method === 'POST' && assembleMatch) {
    const url = new URL(request.url);
    const includeFilings = url.searchParams.get('includeFilings') === 'true';
    return handleAssembleData(env, user, assembleMatch[1], includeFilings);
  }

  // POST /api/pipeline/assemble-filings/:ticker — DEBUG/ADMIN ONLY
  // Server-side filing assembly. NOT used by production pipeline (browser assembles).
  const filingsMatch = path.match(/^\/api\/pipeline\/assemble-filings\/([A-Za-z0-9.-]+)$/);
  if (request.method === 'POST' && filingsMatch) {
    return handleAssembleFilings(request, env, user, filingsMatch[1]);
  }

  // Diagnostic: test session creation (temporary — remove after debugging)
  if (request.method === 'GET' && path === '/api/pipeline/test') {
    try {
      const session = await anthropicFetch(`${ANTHROPIC_API}/v1/sessions`, 'POST', {
        agent: env.MA_ONE_PAGER_AGENT_ID,
        environment_id: env.MA_ENVIRONMENT_ID,
      }, env);
      return json({ ok: true, sessionId: session.id, agent: env.MA_ONE_PAGER_AGENT_ID });
    } catch (err) {
      return json({ ok: false, error: err.message, agent: env.MA_ONE_PAGER_AGENT_ID, env: env.MA_ENVIRONMENT_ID, hasKey: !!env.ANTHROPIC_API_KEY }, 500);
    }
  }

  return json({ error: 'Not found' }, 404);
}

// ─── POST /api/pipeline/run ─────────────────────────────────

async function handleRun(request, env, user) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON body' }, 400); }

  const { ticker, stage, reportId } = body;
  if (!ticker || !stage) return json({ error: 'ticker and stage are required' }, 400);
  if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker.toUpperCase())) return json({ error: 'Invalid ticker format' }, 400);

  const SUPPORTED_STAGES = ['onePager', 'pitchDeck'];
  if (!SUPPORTED_STAGES.includes(stage)) {
    return json({ error: `Stage "${stage}" is not yet available via Managed Agents.` }, 501);
  }

  // Concurrent limit: 1 per user
  const active = await env.DB.prepare(
    `SELECT id, ticker, stage, status, updated_at FROM pipeline_runs
     WHERE user_id = ? AND status IN ('queued', 'running') ORDER BY created_at DESC LIMIT 1`
  ).bind(user.id).first();

  if (active) {
    const age = Date.now() - new Date(active.updated_at).getTime();
    if (age > STALE_TIMEOUT_MS) {
      await env.DB.prepare(
        `UPDATE pipeline_runs SET status = 'failed', error = 'Timed out', updated_at = datetime('now') WHERE id = ?`
      ).bind(active.id).run();
    } else {
      return json({ error: 'Pipeline already running', activeRun: { id: active.id, ticker: active.ticker } }, 409);
    }
  }

  // Billing check (skip for admin)
  if (user.role !== 'admin') {
    const billing = await env.DB.prepare(
      'SELECT monthly_limit_cents, billing_active FROM billing WHERE user_id = ?'
    ).bind(user.id).first();
    if (!billing || !billing.billing_active) return json({ error: 'Billing not active.' }, 402);

    const monthStart = new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);
    const spent = await env.DB.prepare(
      `SELECT COALESCE(SUM(cost_millicents), 0) as total FROM api_usage
       WHERE user_id = ? AND created_at >= ? AND status = 'completed'`
    ).bind(user.id, monthStart.toISOString()).first();
    if (Math.ceil((spent?.total || 0) / 10) >= billing.monthly_limit_cents) {
      return json({ error: 'Monthly spending limit reached' }, 429);
    }
  }

  // Ensure report exists in D1
  if (reportId) {
    await env.DB.prepare(
      'INSERT OR IGNORE INTO reports (id, user_id, ticker) VALUES (?, ?, ?)'
    ).bind(reportId, user.id, ticker).run();
  }

  // ── Stage: Pitch Deck ──────────────────────────────────────
  // Browser assembles DataPacket + filing content, sends as payload.
  // Worker relays to the Pitch Deck coordinator Managed Agent session.
  if (stage === 'pitchDeck') {
    const payload = body.payload;
    if (!payload?.dataPacket) {
      return json({ error: 'payload.dataPacket is required for Pitch Deck generation' }, 400);
    }

    const coordinatorAgent = env.MA_PD_COORDINATOR || 'agent_011Ca37DJEQBPbm6rKET3fMs';

    // Create Managed Agent session for Pitch Deck coordinator
    let sessionId;
    try {
      const session = await anthropicFetch(`${ANTHROPIC_API}/v1/sessions`, 'POST', {
        agent: coordinatorAgent,
        environment_id: env.MA_ENVIRONMENT_ID,
      }, env);
      sessionId = session.id;
    } catch (err) {
      return json({ error: 'Failed to create Pitch Deck agent session', detail: err.message }, 500);
    }

    // Build and send the initial message with DataPacket + filing content
    const messageText = buildPitchDeckMessage(ticker, payload);
    try {
      await anthropicFetch(`${ANTHROPIC_API}/v1/sessions/${sessionId}/events`, 'POST', {
        events: [{
          type: 'user.message',
          content: [{ type: 'text', text: messageText }],
        }],
      }, env);
    } catch (err) {
      return json({ error: 'Failed to send message to Pitch Deck agent', detail: err.message }, 500);
    }

    // Create pipeline run record
    const runId = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO pipeline_runs (id, user_id, report_id, ticker, stage, status, session_id, started_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'running', ?, datetime('now'), datetime('now'))`
    ).bind(runId, user.id, reportId || null, ticker.toUpperCase(), stage, sessionId).run();

    return json({ runId, status: 'running', ticker: ticker.toUpperCase(), stage }, 200);
  }

  // ── Stage: One Pager ───────────────────────────────────────
  // Accepts optional body.payload.dataPacket (browser-assembled sliced DataPacket).
  // If absent, falls back to ticker-only prompt (pre-slicing behavior).

  // Create Managed Agent session
  let sessionId;
  try {
    const session = await anthropicFetch(`${ANTHROPIC_API}/v1/sessions`, 'POST', {
      agent: env.MA_ONE_PAGER_AGENT_ID,
      environment_id: env.MA_ENVIRONMENT_ID,
    }, env);
    sessionId = session.id;
  } catch (err) {
    return json({ error: 'Failed to create agent session', detail: err.message }, 500);
  }

  // Send initial message
  const onePagerDataPacket = body.payload?.dataPacket;
  const onePagerText = buildOnePagerMessage(ticker, onePagerDataPacket);
  try {
    await anthropicFetch(`${ANTHROPIC_API}/v1/sessions/${sessionId}/events`, 'POST', {
      events: [{
        type: 'user.message',
        content: [{ type: 'text', text: onePagerText }],
      }],
    }, env);
  } catch (err) {
    return json({ error: 'Failed to send message to agent', detail: err.message }, 500);
  }

  // Create pipeline run record
  const runId = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO pipeline_runs (id, user_id, report_id, ticker, stage, status, session_id, started_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'running', ?, datetime('now'), datetime('now'))`
  ).bind(runId, user.id, reportId || null, ticker.toUpperCase(), stage, sessionId).run();

  return json({ runId, status: 'running', ticker: ticker.toUpperCase(), stage }, 200);
}

// ─── GET /api/pipeline/status/:runId ────────────────────────

async function handleStatus(env, user, runId) {
  const run = await env.DB.prepare(
    `SELECT id, ticker, stage, status, session_id, report_id, sections_json, error, budget_json, started_at, updated_at
     FROM pipeline_runs WHERE id = ? AND user_id = ?`
  ).bind(runId, user.id).first();

  if (!run) return json({ error: 'Pipeline run not found' }, 404);

  // Already terminal — return cached result
  if (['completed', 'completed_with_errors', 'failed'].includes(run.status)) {
    return json({
      status: run.status, sections_json: run.sections_json || null,
      error: run.error, budget: run.budget_json ? JSON.parse(run.budget_json) : null,
    });
  }

  // Staleness check
  if (Date.now() - new Date(run.updated_at).getTime() > STALE_TIMEOUT_MS) {
    await env.DB.prepare(
      `UPDATE pipeline_runs SET status = 'failed', error = 'Timed out', updated_at = datetime('now') WHERE id = ?`
    ).bind(runId).run();
    return json({ status: 'failed', error: 'Timed out (no progress for 15 minutes)' });
  }

  // Poll session events from Managed Agents (read-only)
  if (!run.session_id) return json({ status: run.status });

  try {
    const eventsRes = await fetch(`${ANTHROPIC_API}/v1/sessions/${run.session_id}/events`, {
      headers: anthropicHeaders(env),
    });

    if (!eventsRes.ok) return json({ status: 'running' });

    const data = await eventsRes.json();
    const events = data.events || data.data || [];

    // Check for terminal session state
    const idleEvent = events.find(e =>
      e.type === 'session.status_idle' && e.stop_reason?.type === 'end_turn'
    );

    if (idleEvent) {
      // Session complete — extract output and save
      const agentMessage = [...events].reverse().find(e => e.type === 'agent.message');
      const result = extractReportFromMessage(agentMessage, run.ticker);

      if (result.sections) {
        const sectionsJson = JSON.stringify(result.sections);

        await env.DB.prepare(
          `UPDATE pipeline_runs SET status = 'completed', sections_json = ?, completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`
        ).bind(sectionsJson, runId).run();

        if (run.report_id) {
          const stageData = JSON.stringify({
            sections: result.sections, errors: [], generatedAt: new Date().toISOString(),
          });
          await env.DB.prepare(
            `INSERT INTO report_stages (report_id, stage, data) VALUES (?, ?, ?)
             ON CONFLICT(report_id, stage) DO UPDATE SET data = excluded.data`
          ).bind(run.report_id, run.stage, stageData).run();
        }

        const usage = events.filter(e => e.type === 'span.model_request_end' && e.model_usage);
        let totalInput = 0, totalOutput = 0;
        for (const u of usage) {
          totalInput += (u.model_usage.input_tokens || 0) + (u.model_usage.cache_read_input_tokens || 0) + (u.model_usage.cache_creation_input_tokens || 0);
          totalOutput += u.model_usage.output_tokens || 0;
        }
        const costDollars = (totalInput * 3 / 1e6) + (totalOutput * 15 / 1e6);
        try {
          await env.DB.prepare(
            `INSERT INTO api_usage (user_id, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, web_searches, cost_millicents, status, caller, ticker)
             VALUES (?, 'claude-sonnet-4-6', ?, ?, 0, 0, 0, ?, 'completed', 'one-pager-managed', ?)`
          ).bind(user.id, totalInput, totalOutput, Math.round(costDollars * 1000), run.ticker).run();
        } catch {}

        return json({ status: 'completed', sections_json: sectionsJson, error: null, budget: { totalInput, totalOutput, costDollars } });
      }

      await env.DB.prepare(
        `UPDATE pipeline_runs SET status = 'failed', error = 'Could not parse agent output', updated_at = datetime('now') WHERE id = ?`
      ).bind(runId).run();
      return json({ status: 'failed', error: 'Agent completed but output could not be parsed' });
    }

    // Still running
    const searches = events.filter(e => e.type === 'agent.tool_use' && e.name === 'web_search');
    const thinking = events.filter(e => e.type === 'agent.thinking');
    await env.DB.prepare(
      `UPDATE pipeline_runs SET updated_at = datetime('now') WHERE id = ?`
    ).bind(runId).run();

    return json({
      status: 'running',
      progress: { searches: searches.length, thinkingSteps: thinking.length },
    });

  } catch {
    return json({ status: 'running' });
  }
}

// ─── GET /api/pipeline/events/:runId (observability) ────────

async function handleEvents(env, user, runId) {
  const run = await env.DB.prepare(
    'SELECT session_id FROM pipeline_runs WHERE id = ? AND user_id = ?'
  ).bind(runId, user.id).first();

  if (!run?.session_id) return json({ error: 'Not found' }, 404);

  const res = await fetch(`${ANTHROPIC_API}/v1/sessions/${run.session_id}/events`, {
    headers: anthropicHeaders(env),
  });

  return new Response(res.body, { status: res.status, headers: { 'Content-Type': 'application/json' } });
}

// ─── GET /api/pipeline/export/:runId/:format ────────────────

async function handleExport(env, user, reportId, stage, format) {
  // Look up the most recent completed pipeline run for this report + stage
  const stageReverseMap = { 'one-pager': 'onePager', 'pitch-deck': 'pitchDeck', 'full-story': 'fullStory' };
  const pipelineStage = stageReverseMap[stage] || stage;

  const run = await env.DB.prepare(
    `SELECT ticker, stage, sections_json FROM pipeline_runs
     WHERE report_id = ? AND user_id = ? AND stage = ? AND status = 'completed'
     ORDER BY completed_at DESC LIMIT 1`
  ).bind(reportId, user.id, pipelineStage).first();

  if (!run?.sections_json) return json({ error: 'No completed report found' }, 404);

  const exportStage = stage;

  // Build the report object the Python generators expect
  let sections;
  try { sections = JSON.parse(run.sections_json); } catch { return json({ error: 'Invalid report data' }, 500); }

  const reportData = {
    ticker: run.ticker,
    companyName: sections[0]?.data?.name || run.ticker,
    stage: run.stage,
    generatedAt: new Date().toISOString(),
    sections,
    overallVerdict: sections.find(s => s.key === 'overall_verdict')?.verdict || 'N/A',
    sectionKeys: sections.map(s => s.key),
  };

  // Call export service
  if (!env.EXPORT_SERVICE_URL) return json({ error: 'Export service not configured' }, 503);

  try {
    const exportRes = await fetch(`${env.EXPORT_SERVICE_URL}/export/${exportStage}/${format}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticker: run.ticker, report: reportData }),
    });

    if (!exportRes.ok) {
      const err = await exportRes.text();
      return json({ error: `Export service error: ${err.slice(0, 200)}` }, 500);
    }

    const mime = format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const ext = format === 'pdf' ? '.pdf' : '.docx';

    return new Response(exportRes.body, {
      headers: {
        'Content-Type': mime,
        'Content-Disposition': `attachment; filename="${run.ticker}-${exportStage}${ext}"`,
      },
    });
  } catch (err) {
    return json({ error: `Export service unreachable: ${err.message}` }, 503);
  }
}

// ─── POST /api/pipeline/assemble-data/:ticker ──────────────

async function handleAssembleData(env, user, ticker, includeFilings = false) {
  const upperTicker = ticker.toUpperCase();
  if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(upperTicker)) {
    return json({ error: 'Invalid ticker format' }, 400);
  }

  const startedAt = Date.now();
  try {
    const dataPacket = await assembleDataPacket(upperTicker, env);

    // Optionally assemble filing content (SEC filing markdown + transcripts)
    let filingStats = null;
    if (includeFilings) {
      try {
        const filingResult = await assembleFilingContent(upperTicker, dataPacket, env);
        dataPacket.filingContent = filingResult.filingContent;
        dataPacket.transcriptContent = filingResult.transcriptContent;
        filingStats = filingResult.stats;
        if (filingResult.errors.length > 0) {
          dataPacket.errors = [...(dataPacket.errors || []), ...filingResult.errors];
        }
      } catch (e) {
        dataPacket.errors = [...(dataPacket.errors || []), `filing-content: ${e.message}`];
      }
    }

    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);

    // Summary of populated vs null fields for quick debugging
    const fields = Object.keys(dataPacket).filter(k => k !== 'ticker' && k !== 'assembledAt' && k !== 'errors');
    const populated = fields.filter(k => dataPacket[k] != null);
    const nullFields = fields.filter(k => dataPacket[k] == null);

    return json({
      ticker: upperTicker,
      assembledAt: dataPacket.assembledAt,
      elapsedSeconds: parseFloat(elapsed),
      populated: populated.length,
      nullFields,
      filingStats,
      errors: dataPacket.errors || [],
      dataPacket,
    });
  } catch (err) {
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    return json({
      error: 'DataPacket assembly failed',
      detail: err.message,
      elapsedSeconds: parseFloat(elapsed),
    }, 500);
  }
}

// ─── POST /api/pipeline/assemble-filings/:ticker ────────────
// Separate endpoint for filing content assembly — avoids re-running
// the full DataPacket (which consumes ~20s of CPU on its own).
// Accepts POST body: { filings: [...], cik: "..." }

async function handleAssembleFilings(request, env, user, ticker) {
  const upperTicker = ticker.toUpperCase();
  if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(upperTicker)) {
    return json({ error: 'Invalid ticker format' }, 400);
  }

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON body' }, 400); }

  const { filings, cik } = body;
  if (!filings || !cik) {
    return json({ error: 'filings array and cik are required in POST body' }, 400);
  }

  const startedAt = Date.now();
  try {
    // Build a minimal dataPacket-like object with just what assembleFilingContent needs
    const minPacket = { filings, companyInfo: { cik } };
    const result = await assembleFilingContent(upperTicker, minPacket, env);
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);

    return json({
      ticker: upperTicker,
      elapsedSeconds: parseFloat(elapsed),
      filingContent: result.filingContent,
      transcriptContent: result.transcriptContent,
      stats: result.stats,
      errors: result.errors,
    });
  } catch (err) {
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    return json({
      error: 'Filing content assembly failed',
      detail: err.message,
      elapsedSeconds: parseFloat(elapsed),
    }, 500);
  }
}

// ─── One Pager Message Builder ──────────────────────────────
// If a sliced DataPacket was provided, embed it as a fenced JSON block so the
// agent can use it for quantitative facts (financials, market cap, gurus, etc.)
// and reserve web search for narrative context. If no DataPacket, fall back to
// the pre-slicing ticker-only prompt — agent web-searches everything.

function buildOnePagerMessage(ticker, dataPacket) {
  const upper = ticker.toUpperCase();
  if (!dataPacket || typeof dataPacket !== 'object') {
    return `Create a One Pager on ${upper}`;
  }
  const companyName = dataPacket.companyInfo?.name || upper;
  return `# One Pager Research: ${upper}
Company: ${companyName}
Assembled: ${dataPacket._sliceMetadata?.ticker ? new Date().toISOString() : 'unknown'}

## DataPacket (sliced)

\`\`\`json
${JSON.stringify(dataPacket)}
\`\`\`

Use this DataPacket for all quantitative facts (financials, market cap, ROE/ROIC, gurus, growth rates). Use web search for narrative context (business model, competitive advantages, industry trends, investor concerns).`;
}

// ─── Pitch Deck Message Builder ─────────────────────────────

function buildPitchDeckMessage(ticker, payload) {
  const { dataPacket, filingContent, assembledAt } = payload;
  const companyName = dataPacket.companyInfo?.name || dataPacket.ticker || ticker;
  const timestamp = assembledAt || new Date().toISOString();

  let text = `# Pitch Deck Research: ${ticker.toUpperCase()}\nCompany: ${companyName}\nAssembled: ${timestamp}\n\n`;

  // DataPacket as compact JSON
  text += `## DataPacket\n\n\`\`\`json\n${JSON.stringify(dataPacket)}\n\`\`\`\n\n`;

  // Filing content sections
  if (filingContent && Array.isArray(filingContent)) {
    text += `## Filing Content\n\n`;
    for (const filing of filingContent) {
      const label = filing.label || filing.type || 'Filing';
      const period = filing.period || filing.fiscalYear || '';
      text += `### ${label}${period ? ` (${period})` : ''}\n\n`;
      if (filing.sections && typeof filing.sections === 'object') {
        for (const [sectionName, sectionText] of Object.entries(filing.sections)) {
          text += `#### ${sectionName}\n\n${sectionText}\n\n`;
        }
      } else if (filing.markdown) {
        text += `${filing.markdown}\n\n`;
      }
    }
  }

  return text;
}

// ─── Helpers ────────────────────────────────────────────────

function anthropicHeaders(env) {
  return {
    'Content-Type': 'application/json',
    'x-api-key': env.ANTHROPIC_API_KEY,
    'anthropic-version': '2023-06-01',
    'anthropic-beta': BETA_HEADER,
  };
}

async function anthropicFetch(url, method, body, env) {
  const res = await fetch(url, {
    method, headers: anthropicHeaders(env),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic API ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

function extractReportFromMessage(messageEvent, ticker) {
  if (!messageEvent?.content) return { sections: null };

  const fullText = messageEvent.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('');

  // Extract JSON block from agent output
  const jsonMatch = fullText.match(/```json\s*([\s\S]*?)```/);
  if (!jsonMatch) return { sections: null };

  let parsed;
  try { parsed = JSON.parse(jsonMatch[1]); } catch { return { sections: null }; }

  // Transform keyed object into sections array for the frontend
  const SECTION_MAP = [
    { key: 'company_info', title: 'Company Information', num: 1 },
    { key: 'minimum_standards', title: 'Minimum Standards', num: 2 },
    { key: 'meaning', title: 'Meaning KPIs', num: 3 },
    { key: 'management_kpis', title: 'Management KPIs', num: 4 },
    { key: 'growth_metrics', title: 'Growth Metrics', num: 5 },
    { key: 'valuation_summary', title: 'Valuation Summary', num: 6 },
    { key: 'overall_verdict', title: 'Overall Verdict', num: 7 },
  ];

  const sections = SECTION_MAP
    .filter(m => parsed[m.key])
    .map(m => {
      const src = parsed[m.key];
      return {
        key: m.key, title: m.title, sectionNumber: m.num,
        status: src.verdict === 'PASS' ? 'pass' : src.verdict === 'FAIL' ? 'fail' : 'review',
        confidence: src.confidence || 'MEDIUM', verdict: src.verdict,
        verdictRationale: src.verdictRationale || '', summary: src.summary || '',
        data: JSON.stringify(src.gates || src.kpis || src.companyDetails || src.growthTable || src.keyValuationMetrics || src.sectionSummary || {}),
        narrative: src.narrative || '', citations: src.citations || [],
        tables: [], charts: [], redFlags: src.redFlags || [],
        primarySourceInsights: [], crossCuttingFindings: [], searchesPerformed: [],
        modelUsed: 'claude-sonnet-4-6', tokenCost: { input: 0, output: 0 },
      };
    });

  return { sections: sections.length > 0 ? sections : null };
}
