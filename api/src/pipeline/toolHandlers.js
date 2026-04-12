// Tool handlers for Managed Agent custom tools.
// Extracted from PipelineRunner.js and agentDispatch.js — standalone functions
// that can be called from the SessionEventLoop DO.

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { assembleDataPacketServer } from './dataPacket.js';
import { CURRICULUM_MAP, AGENT_CONFIGS, AGENT_PROMPTS } from './curriculumBundle.js';
import { MODEL_PRICING, normalizeModel } from '../../../packages/pricing/index.js';

const MODEL_MAP = { sonnet: 'claude-sonnet-4-6', opus: 'claude-opus-4-6' };

let _client = null;
let _clientKey = null;
function getClient(env) {
  if (!_client || _clientKey !== env.ANTHROPIC_API_KEY) {
    _client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    _clientKey = env.ANTHROPIC_API_KEY;
  }
  return _client;
}

// ─── Tool 1: get_data_packet ─────────────────────────────────

export async function handleGetDataPacket(ticker, env) {
  return assembleDataPacketServer(ticker, env);
}

// ─── Tool 5: run_psr ─────────────────────────────────────────
// Primary Source Reader pre-processing — fetches filing text + transcripts,
// dispatches annual-reader and quarterly-reader agents, returns formatted findings.

/**
 * Format PSR agent output into a structured findings string for downstream agents.
 * Copied from pipelineManager.js:30-45 — same format, same cache breakpoint strategy.
 */
function formatPsrFindings(psrSections) {
  if (!psrSections || psrSections.length === 0) return '';
  const parts = [];
  for (const section of psrSections) {
    if (!section) continue;
    const label = section.title || section.key || 'PSR Agent';
    if (section.narrative) {
      parts.push(`### ${label}\n\n${section.narrative}`);
    }
    if (section.primarySourceInsights && section.primarySourceInsights.length > 0) {
      parts.push(`**Key Insights:**\n${section.primarySourceInsights.map(i => `- ${i}`).join('\n')}`);
    }
  }
  if (parts.length === 0) return '';
  return `## Primary Source Reader Findings\n\n${parts.join('\n\n---\n\n')}`;
}

/**
 * Fetch 10-K/10-Q filing text from SEC EDGAR.
 * Returns { [key]: { form, date, sections, fullLength } }
 */
async function fetchFilingContentServer(filings, cik, env) {
  if (!filings?.length || !cik) return {};

  const SEC_BASE = 'https://www.sec.gov';
  const SEC_HEADERS = {
    'User-Agent': env.SEC_USER_AGENT || 'Thes1s/1.0 (contact@thes1sinvesting.com)',
    'Accept': 'text/html,application/xhtml+xml',
  };

  const filingContent = {};
  const annuals = filings.filter(f => f.form === '10-K').slice(0, 5);
  const quarterlies = filings.filter(f => f.form === '10-Q').slice(0, 4);
  const toProcess = [...annuals, ...quarterlies];

  for (const f of toProcess) {
    try {
      if (!f.accessionNumber || !f.primaryDocument) continue;
      const accNoFormatted = f.accessionNumber.replace(/-/g, '');
      const url = `${SEC_BASE}/Archives/edgar/data/${cik}/${accNoFormatted}/${f.primaryDocument}`;
      const res = await fetch(url, { headers: SEC_HEADERS });
      if (!res.ok) continue;

      const html = await res.text();

      // Simple HTML-to-text extraction (Turndown may not be available in Worker).
      // Strip tags, decode entities, normalize whitespace.
      const text = html
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/\s+/g, ' ')
        .trim();

      // Truncate to ~100KB to stay within reasonable token budgets
      const truncated = text.length > 100000 ? text.slice(0, 100000) + '\n\n[Truncated]' : text;

      const key = `${f.form}-${f.filingDate}`;
      filingContent[key] = {
        form: f.form,
        date: f.filingDate,
        text: truncated,
        fullLength: text.length,
      };
    } catch (err) {
      console.warn(`Filing fetch failed for ${f.form} ${f.filingDate}: ${err.message}`);
    }
  }

  return filingContent;
}

/**
 * Fetch earnings call transcripts from R2 (cron-populated), falling back to the
 * /data/transcripts/ endpoint for any quarters not in R2.
 */
async function fetchTranscriptsServer(ticker, env) {
  const transcriptContent = {};
  const currentYear = new Date().getFullYear();

  // Try last 8 fiscal quarters from R2
  for (let y = currentYear; y >= currentYear - 1; y--) {
    for (let q = 4; q >= 1; q--) {
      const r2Key = `transcripts/${ticker.toUpperCase()}/${y}Q${q}`;
      try {
        const obj = await env.TRANSCRIPTS.get(r2Key);
        if (obj) {
          const data = JSON.parse(await obj.text());
          const key = `transcript-${y}Q${q}`;
          transcriptContent[key] = data;
        }
      } catch {
        // Not in R2 — skip, not critical
      }
    }
  }

  return transcriptContent;
}

/**
 * Run PSR pre-processing: fetch filing text + transcripts, dispatch readers, format findings.
 */
export async function handleRunPsr(ticker, stage, dataPacket, env) {
  const cik = dataPacket.companyInfo?.cik;
  const filings = dataPacket.filings || [];
  const errors = [];
  const psrSections = [];

  // ── Fetch filing content and transcripts in parallel ──
  const [filingContent, transcriptContent] = await Promise.all([
    fetchFilingContentServer(filings, cik, env),
    fetchTranscriptsServer(ticker, env),
  ]);

  const annualKeys = Object.keys(filingContent).filter(k => k.startsWith('10-K')).sort();
  const quarterlyKeys = Object.keys(filingContent).filter(k => k.startsWith('10-Q')).sort();
  const transcriptKeys = Object.keys(transcriptContent);

  // ── Dispatch PSR agents in parallel ──
  const dispatches = [];

  // One annual-reader per 10-K, each with only its year's filing in the DataPacket
  for (const key of annualKeys) {
    const perYearPacket = {
      ...dataPacket,
      filingContent: { [key]: filingContent[key] },
    };
    dispatches.push({
      label: `annual-reader (${key})`,
      promise: handleRunAgent({
        role: 'annual-reader',
        stage,
        sectionAssignment: `Read the single 10-K filing provided in filingContent (${key}). Extract findings per the annual-reader schema.`,
        maxSearches: 0,
        maxTokens: 32768,
      }, perYearPacket, env),
    });
  }

  // One quarterly-reader for all 10-Qs
  if (quarterlyKeys.length > 0) {
    const quarterlyPacket = {
      ...dataPacket,
      filingContent: Object.fromEntries(quarterlyKeys.map(k => [k, filingContent[k]])),
    };
    dispatches.push({
      label: `quarterly-reader (${quarterlyKeys.join(', ')})`,
      promise: handleRunAgent({
        role: 'quarterly-reader',
        stage,
        sectionAssignment: `Read all ${quarterlyKeys.length} 10-Q filings provided in filingContent. Extract findings per the quarterly-reader schema.`,
        maxSearches: 0,
        maxTokens: 32768,
      }, quarterlyPacket, env),
    });
  }

  // One quarterly-reader for transcripts
  if (transcriptKeys.length > 0) {
    const transcriptPacket = {
      ...dataPacket,
      filingContent: {},
      transcriptContent,
    };
    dispatches.push({
      label: `quarterly-reader (transcripts: ${transcriptKeys.length})`,
      promise: handleRunAgent({
        role: 'quarterly-reader',
        stage,
        sectionAssignment: `Read all ${transcriptKeys.length} earnings call transcripts provided in transcriptContent. Focus on: management guidance changes, tone shifts, promise tracking, forward-looking statements, and Q&A insights.`,
        maxSearches: 0,
        maxTokens: 32768,
      }, transcriptPacket, env),
    });
  }

  if (dispatches.length === 0) {
    return {
      psrFindings: '',
      psrSections: [],
      dispatched: 0,
      errors: [],
    };
  }

  // Execute all PSR dispatches in parallel
  const results = await Promise.allSettled(dispatches.map(d => d.promise));

  let totalUsage = { inputTokens: 0, outputTokens: 0, cost: 0 };
  for (let i = 0; i < results.length; i++) {
    const label = dispatches[i].label;
    if (results[i].status === 'fulfilled') {
      const r = results[i].value;
      if (r.section) psrSections.push(r.section);
      if (r.error) errors.push({ agent: label, error: r.error });
      if (r.usage) {
        totalUsage.inputTokens += r.usage.inputTokens || 0;
        totalUsage.outputTokens += r.usage.outputTokens || 0;
        totalUsage.cost += r.usage.cost || 0;
      }
    } else {
      errors.push({ agent: label, error: results[i].reason?.message || 'Unknown error' });
    }
  }

  return {
    psrFindings: formatPsrFindings(psrSections),
    psrSections,
    dispatched: dispatches.length,
    completed: psrSections.length,
    errors,
    usage: totalUsage,
  };
}

// ─── Tool 2: run_agent ───────────────────────────────────────
// Reused from agentDispatch.js — same prompt assembly, API call, retry logic.

function sliceDataPacket(dp, sliceKeys) {
  if (!sliceKeys || sliceKeys.length === 0) return { ticker: dp.ticker, caveats: dp.caveats };
  const slice = { ticker: dp.ticker, caveats: dp.caveats };
  for (const key of sliceKeys) { if (dp[key] !== undefined) slice[key] = dp[key]; }
  return slice;
}

function generateFieldPathBlock(dataSlice) {
  const lines = ['## DataPacket Field Paths', '', 'These are the ONLY valid `ref` paths for DataPacket citations.', ''];
  for (const [key, value] of Object.entries(dataSlice)) {
    if (value === null) lines.push(`- \`dataPacket.${key}\`: null`);
    else if (Array.isArray(value)) lines.push(`- \`dataPacket.${key}\`: array[${value.length}]`);
    else if (typeof value === 'object') {
      const subKeys = Object.keys(value);
      lines.push(`- \`dataPacket.${key}\`: {${subKeys.length} fields}`);
      for (const sk of subKeys.slice(0, 20)) {
        const sv = value[sk];
        if (sv === null) lines.push(`  - \`.${sk}\`: null`);
        else if (Array.isArray(sv)) lines.push(`  - \`.${sk}\`: array[${sv.length}]`);
        else if (typeof sv === 'object') lines.push(`  - \`.${sk}\`: {${Object.keys(sv).length} fields}`);
        else lines.push(`  - \`.${sk}\`: ${typeof sv}`);
      }
      if (subKeys.length > 20) lines.push(`  - ...and ${subKeys.length - 20} more fields`);
    } else lines.push(`- \`dataPacket.${key}\`: ${typeof value}`);
  }
  return lines.join('\n');
}

function buildUserMessage(dataSlice, options = {}) {
  const parts = [generateFieldPathBlock(dataSlice)];
  parts.push(`## DataPacket\n\n\`\`\`json\n${JSON.stringify(dataSlice, null, 2)}\n\`\`\``);
  if (options.sectionAssignment) parts.push(`## Assignment\n\n${options.sectionAssignment}`);
  if (options.priorSections?.length > 0) {
    const valid = options.priorSections.filter(s => s?.title);
    if (valid.length > 0) {
      parts.push(`## Prior Section Findings\n\n${valid.map(s =>
        `### ${s.title} (${s.status})\n${s.summary}\nRed flags: ${(s.redFlags || []).join('; ')}`
      ).join('\n\n')}`);
    }
  }
  if (options.pmFeedback) parts.push(`## PM Feedback\n\n${options.pmFeedback}`);
  if (options.debateContext) parts.push(`## Debate Context\n\n${options.debateContext}`);
  if (options.debateRole) parts.push(`## Debate Role\n\nYou are acting as the **${options.debateRole}** in this debate.`);
  return parts.join('\n\n---\n\n');
}

function buildSystemBlocks(universalContext, psrFindings, agentPrompt, curriculum) {
  const blocks = [];
  if (universalContext) blocks.push({ type: 'text', text: universalContext, cache_control: { type: 'ephemeral' } });
  if (psrFindings) blocks.push({ type: 'text', text: psrFindings, cache_control: { type: 'ephemeral' } });
  const agentContent = [agentPrompt, curriculum].filter(Boolean).join('\n\n---\n\n');
  if (agentContent) blocks.push({ type: 'text', text: agentContent });
  return blocks;
}

function extractResult(response) {
  if (response.parsed_output) return response.parsed_output;
  const text = (response.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
  if (!text) return null;
  const cb = text.match(/```json\s*([\s\S]*?)```/);
  if (cb) { try { return JSON.parse(cb[1].trim()); } catch {} }
  const kf = text.match(/\{"key"\s*:\s*"[\s\S]*\}/);
  if (kf) { try { return JSON.parse(kf[0]); } catch {} }
  const g = text.match(/\{[\s\S]*\}/);
  if (g) { try { return JSON.parse(g[0]); } catch {} }
  return null;
}

function buildUsage(apiUsage, model) {
  const p = MODEL_PRICING[normalizeModel(model)] || MODEL_PRICING['claude-sonnet-4-6'];
  const inp = apiUsage.input_tokens || 0, out = apiUsage.output_tokens || 0;
  const cr = apiUsage.cache_read_input_tokens || 0, cw = apiUsage.cache_creation_input_tokens || 0;
  const ws = apiUsage.server_tool_use?.web_search_requests || 0;
  return {
    inputTokens: inp, outputTokens: out, cacheRead: cr, cacheWrite: cw, webSearches: ws,
    cost: (inp * p.input / 1e6) + (out * p.output / 1e6) + (cr * p.cacheRead / 1e6) + (cw * p.cacheWrite / 1e6) + (ws * p.webSearch),
  };
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function dispatchWithRetry(callFn, agentRole) {
  try {
    const response = await callFn();
    if (response.stop_reason === 'max_tokens') {
      const retryMax = Math.min(64000, (response.usage?.output_tokens || 16384) * 2);
      const retry = await callFn({ maxTokens: retryMax });
      return { result: extractResult(retry), error: null, response: retry };
    }
    if (response.stop_reason === 'refusal') return { result: null, error: 'Agent refused (safety filter)', response };
    const result = extractResult(response);
    if (!result && (response.usage?.output_tokens || 0) < 100) {
      try { const r2 = await callFn(); const r2r = extractResult(r2); if (r2r) return { result: r2r, error: null, response: r2 }; } catch {}
    }
    return { result, error: null, response };
  } catch (err) {
    if (err.status === 429) {
      const wait = parseInt(err.headers?.['retry-after'] || '30', 10);
      await sleep(wait * 1000);
      try { const r = await callFn(); return { result: extractResult(r), error: null, response: r }; } catch (e) { return { result: null, error: `Rate limit: ${e.message}` }; }
    }
    if (err.status >= 500) {
      for (const d of [10, 30]) { await sleep(d * 1000); try { const r = await callFn(); return { result: extractResult(r), error: null, response: r }; } catch (e) { if (e.status >= 500) continue; return { result: null, error: e.message }; } }
      return { result: null, error: 'Server error after retries' };
    }
    return { result: null, error: `${err.status || 'unknown'}: ${err.message}` };
  }
}

/**
 * Dispatch a single analyst agent via Claude Messages API.
 * Params come from the coordinator's run_agent tool call.
 */
export async function handleRunAgent(params, dataPacket, env) {
  const startTime = Date.now();
  const client = getClient(env);

  const { role, stage, sectionAssignment, priorSections, debateRole, debateContext, maxSearches, maxTokens } = params;

  const config = AGENT_CONFIGS[role];
  if (!config) throw new Error(`Unknown agent: "${role}"`);

  const promptEntry = AGENT_PROMPTS[role];
  if (!promptEntry) throw new Error(`No prompt for agent "${role}"`);
  let prompt = promptEntry.base;
  if (stage && promptEntry[stage]) prompt += '\n\n---\n\n' + promptEntry[stage];

  let universalContext = '';
  if (config.universalContext && config.universalContextFiles) {
    universalContext = config.universalContextFiles.map(p => CURRICULUM_MAP[p] || '').filter(Boolean).join('\n\n---\n\n');
  }
  const curriculum = (config.curriculum || []).map(p => CURRICULUM_MAP[p] || '').filter(Boolean).join('\n\n---\n\n');
  const dataSlice = sliceDataPacket(dataPacket, config.dataPacketSlice);
  const model = MODEL_MAP[config.model] || MODEL_MAP.sonnet;

  const effectiveMaxSearches = maxSearches !== undefined ? maxSearches : 5;
  const tools = effectiveMaxSearches === 0 ? [] : [
    { type: 'web_search_20250305', name: 'web_search', max_uses: effectiveMaxSearches },
  ];
  const systemBlocks = buildSystemBlocks(universalContext, params.psrFindings || null, prompt, curriculum);
  const userContent = buildUserMessage(dataSlice, {
    sectionAssignment,
    priorSections,
    debateRole,
    debateContext,
  });

  const { ReportSectionSchema } = await import('../../../src/schemas/reportSection.js');

  const callFn = (overrides = {}) => {
    const callParams = {
      model,
      max_tokens: overrides.maxTokens || maxTokens || 16384,
      system: systemBlocks,
      messages: [{ role: 'user', content: userContent }],
      tools: tools.length > 0 ? tools : [],
      output_config: { format: zodOutputFormat(ReportSectionSchema) },
    };
    return client.messages.create(callParams);
  };

  const retryResult = await dispatchWithRetry(callFn, role);
  const section = retryResult.result;

  if (!section) {
    return {
      section: null,
      usage: buildUsage(retryResult.response?.usage || {}, model),
      model,
      duration: Date.now() - startTime,
      error: retryResult.error || 'Structured output parsing failed',
    };
  }

  if (section && typeof section.data === 'string') {
    try { section.data = JSON.parse(section.data); } catch {}
  }
  if (section) {
    const usage = retryResult.response?.usage || {};
    section.tokenCost = { input: usage.input_tokens || 0, output: usage.output_tokens || 0 };
    section.modelUsed = model;
  }

  return {
    section,
    usage: buildUsage(retryResult.response.usage, model),
    model,
    duration: Date.now() - startTime,
    error: null,
  };
}

// ─── Tool 3: save_progress ───────────────────────────────────
// Extracted from PipelineRunner.updateProgress()

const ALLOWED_COLUMNS = new Set([
  'status', 'current_wave', 'total_waves', 'progress', 'sections_json',
  'data_packet_json', 'error', 'budget_json', 'started_at', 'completed_at',
]);

export async function handleSaveProgress(params, env) {
  const { runId, wave, totalWaves, status, completedSections } = params;
  const updates = {};

  if (status) updates.status = status === 'completed' ? 'completed' : 'running';
  if (wave !== undefined) updates.current_wave = wave;
  if (totalWaves !== undefined) updates.total_waves = totalWaves;
  if (status === 'completed') updates.completed_at = new Date().toISOString();

  updates.progress = JSON.stringify({
    wave: wave || 0,
    totalWaves: totalWaves || 0,
    status: status || 'running',
    sectionsCompleted: completedSections?.length || 0,
  });

  // Build safe UPDATE query
  const safeEntries = Object.entries(updates).filter(([k]) => ALLOWED_COLUMNS.has(k));
  if (safeEntries.length === 0) return { ok: true };

  const setClauses = safeEntries.map(([k]) => `${k} = ?`).join(', ');
  const values = safeEntries.map(([, v]) => v);

  try {
    await env.DB.prepare(
      `UPDATE pipeline_runs SET ${setClauses}, updated_at = datetime('now') WHERE id = ?`
    ).bind(...values, runId).run();
  } catch (err) {
    console.warn(`Pipeline ${runId}: D1 progress write failed: ${err.message}`);
  }

  return { ok: true };
}

// ─── Tool 4: save_report ─────────────────────────────────────
// Extracted from PipelineRunner.runPipeline() Phase 3.

export async function handleSaveReport(params, env) {
  const { reportId, stage, sections, errors, userId, runId, ticker } = params;

  const hasErrors = errors?.length > 0;
  const finalStatus = hasErrors ? 'completed_with_errors' : 'completed';

  // Save sections to report_stages (skip when reportId is null or the string "none")
  if (reportId && reportId !== 'none' && sections?.length > 0) {
    const owns = await env.DB.prepare(
      'SELECT id FROM reports WHERE id = ? AND user_id = ?'
    ).bind(reportId, userId).first();

    if (owns) {
      const stageData = {
        sections,
        errors: errors || [],
        generatedAt: new Date().toISOString(),
      };

      await env.DB.prepare(
        `INSERT INTO report_stages (report_id, stage, data) VALUES (?, ?, ?)
         ON CONFLICT(report_id, stage) DO UPDATE SET data = excluded.data`
      ).bind(reportId, stage, JSON.stringify(stageData)).run();

      const stageNum = stage === 'onePager' ? 1 : stage === 'pitchDeck' ? 2 : 3;
      await env.DB.prepare(
        `UPDATE reports SET current_stage = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?`
      ).bind(stageNum, reportId, userId).run();
    }
  }

  // Log aggregate cost
  if (sections?.length > 0) {
    await logPipelineCost(userId, ticker, sections, runId, env);
  }

  // Update pipeline_runs to completed
  await handleSaveProgress({
    runId,
    status: 'completed',
    completedSections: (sections || []).map(s => s?.title || 'unknown'),
  }, env);

  // Store final sections in pipeline_runs
  try {
    await env.DB.prepare(
      `UPDATE pipeline_runs SET sections_json = ?, error = ?, completed_at = datetime('now'),
       updated_at = datetime('now') WHERE id = ?`
    ).bind(
      JSON.stringify(sections || []),
      hasErrors ? JSON.stringify(errors) : null,
      runId,
    ).run();
  } catch (err) {
    console.warn(`Pipeline ${runId}: final sections write failed: ${err.message}`);
  }

  return { ok: true, status: finalStatus };
}

// ─── Cost logging ─────────────────────────────────────────────

export async function logCoordinatorCost(userId, ticker, runId, usage, env) {
  try {
    const p = MODEL_PRICING['claude-sonnet-4-6'];
    const costDollars = ((usage.inputTokens || 0) * p.input / 1e6) +
                        ((usage.outputTokens || 0) * p.output / 1e6);
    const costMc = Math.round(costDollars * 1000);

    await env.DB.prepare(
      `INSERT INTO api_usage (user_id, model, input_tokens, output_tokens,
       cache_read_tokens, cache_write_tokens, web_searches, cost_millicents,
       status, caller, ticker) VALUES (?, 'claude-sonnet-4-6', ?, ?, 0, 0, 0, ?, 'completed', 'coordinator', ?)`
    ).bind(userId, usage.inputTokens || 0, usage.outputTokens || 0, costMc, ticker).run();
  } catch (err) {
    console.warn(`Pipeline ${runId}: coordinator cost logging failed: ${err.message}`);
  }
}

export async function logPipelineCost(userId, ticker, sections, runId, env) {
  try {
    let totalInput = 0, totalOutput = 0;
    for (const s of sections) {
      if (s?.tokenCost) {
        totalInput += s.tokenCost.input || 0;
        totalOutput += s.tokenCost.output || 0;
      }
    }

    // Sonnet pricing: $3/MTok input, $15/MTok output
    const costDollars = (totalInput * 3 / 1_000_000) + (totalOutput * 15 / 1_000_000);
    const costMc = Math.round(costDollars * 1000);

    await env.DB.prepare(
      `INSERT INTO api_usage (user_id, model, input_tokens, output_tokens,
       cache_read_tokens, cache_write_tokens, web_searches, cost_millicents,
       status, caller, ticker) VALUES (?, 'pipeline-aggregate', ?, ?, 0, 0, 0, ?, 'completed', 'pipeline', ?)`
    ).bind(userId, totalInput, totalOutput, costMc, ticker).run();
  } catch (err) {
    console.warn(`Pipeline ${runId}: cost logging failed: ${err.message}`);
  }
}
