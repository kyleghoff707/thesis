// SessionEventLoop — Durable Object for Managed Agent event processing.
// Lightweight keep-alive shell: opens SSE stream from a Managed Agent session,
// handles custom tool calls by dispatching to toolHandlers.js, and sends results
// back. Zero orchestration logic — all wave/phase decisions live in the
// coordinator's system prompt.

import { DurableObject } from 'cloudflare:workers';
import { handleGetDataPacket, handleRunAgent, handleRunPsr, handleSaveProgress, handleSaveReport, logCoordinatorCost } from './toolHandlers.js';

const ANTHROPIC_API = 'https://api.anthropic.com';
const BETA_HEADER = 'managed-agents-2026-04-01';

// Known event types from live API testing — log warnings for anything else
const KNOWN_EVENT_TYPES = new Set([
  'agent.custom_tool_use', 'agent.message', 'agent.thinking',
  'session.status_running', 'session.status_idle',
  'user.message', 'user.custom_tool_result',
  'span.model_request_start', 'span.model_request_end',
]);

export class SessionEventLoop extends DurableObject {
  async fetch(request) {
    if (request.method !== 'POST') {
      return new Response('Not found', { status: 404 });
    }

    const params = await request.json();

    // AWAIT the event loop. This keeps the DO alive for the full 5-15 min run.
    // The Worker route fire-and-forgets this stub.fetch() call so the HTTP
    // response to the user returns immediately (202).
    await this.runEventLoop(params);

    return new Response(JSON.stringify({ status: 'completed' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  async runEventLoop({ sessionId, runId, ticker, stage, userId, reportId }) {
    // DataPacket cached after first get_data_packet call
    let dataPacket = null;
    // Accumulated sections for cost logging fallback
    const allSections = [];

    try {
      // Update status to running
      await handleSaveProgress({ runId, wave: 0, status: 'assembling' }, this.env);

      // Poll session events (more reliable than SSE for Cloudflare Workers)
      await this.pollEventLoop(sessionId, runId, ticker, stage, userId, reportId, {
        getDataPacket: () => dataPacket,
        setDataPacket: (dp) => { dataPacket = dp; },
        psrFindings: null,
        setPsrFindings: function(f) { this.psrFindings = f; },
        getPsrFindings: function() { return this.psrFindings; },
        allSections,
      });

      // Log coordinator token costs (separate from agent dispatch costs)
      try {
        const coordUsage = await this.getCoordinatorUsage(sessionId);
        if (coordUsage) {
          await logCoordinatorCost(userId, ticker, runId, coordUsage, this.env);
        }
      } catch (err) {
        console.warn(`Pipeline ${runId}: coordinator usage fetch failed: ${err.message}`);
      }

    } catch (err) {
      console.warn(`Pipeline ${runId} event loop failed:`, err.message);
      try {
        await this.env.DB.prepare(
          `UPDATE pipeline_runs SET status = 'failed', error = ?, updated_at = datetime('now') WHERE id = ?`
        ).bind(err.message, runId).run();
      } catch {}
    }
  }

  /**
   * Query session events to extract coordinator's own token usage.
   * Sums usage from all assistant/agent response events.
   */
  async getCoordinatorUsage(sessionId) {
    try {
      const res = await fetch(`${ANTHROPIC_API}/v1/sessions/${sessionId}/events`, {
        headers: {
          'x-api-key': this.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': BETA_HEADER,
        },
      });

      if (!res.ok) return null;
      const data = await res.json();
      const events = data.events || data.data || [];

      let inputTokens = 0, outputTokens = 0;
      for (const e of events) {
        // Usage is in span.model_request_end events (model_usage field)
        if (e.type === 'span.model_request_end' && e.model_usage) {
          inputTokens += e.model_usage.input_tokens || 0;
          outputTokens += e.model_usage.output_tokens || 0;
        }
      }

      if (inputTokens === 0 && outputTokens === 0) return null;
      return { inputTokens, outputTokens };
    } catch {
      return null;
    }
  }

  async pollEventLoop(sessionId, runId, ticker, stage, userId, reportId, state) {
    let afterCursor = null;
    let sessionActive = true;
    const MAX_POLL_DURATION_MS = 20 * 60 * 1000; // 20 min hard cap
    const startTime = Date.now();

    while (sessionActive) {
      // Hard timeout
      if (Date.now() - startTime > MAX_POLL_DURATION_MS) {
        throw new Error('Pipeline exceeded 20 minute time limit');
      }

      // Fetch new events from session
      let url = `${ANTHROPIC_API}/v1/sessions/${sessionId}/events`;
      if (afterCursor) url += `?after=${afterCursor}`;

      const res = await fetch(url, {
        headers: {
          'x-api-key': this.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': BETA_HEADER,
        },
      });

      if (!res.ok) {
        const body = await res.text();
        console.warn(`Pipeline ${runId}: events fetch failed: ${res.status} ${body}`);
        // Wait and retry
        await sleep(3000);
        continue;
      }

      const data = await res.json();
      const events = data.events || data.data || [];

      if (events.length === 0) {
        // No new events — wait before next poll
        await sleep(2000);
        continue;
      }

      // Collect custom tool use events from this batch
      const toolCalls = [];

      let isTerminal = false;

      for (const event of events) {
        afterCursor = event.id || afterCursor;

        const eventType = event.type || event.event || '';

        // Detect custom tool use
        if (eventType === 'agent.custom_tool_use') {
          toolCalls.push(event);
        }

        // Terminal: session.status_idle with stop_reason.type === 'end_turn'
        // Paused for tools: session.status_idle with stop_reason.type === 'requires_action'
        if (eventType === 'session.status_idle') {
          if (event.stop_reason?.type === 'end_turn') {
            isTerminal = true;
          }
          // requires_action means tool calls are pending — process them below
        }

        // Log unknown event types for diagnostics
        if (eventType && !KNOWN_EVENT_TYPES.has(eventType)) {
          console.warn(`Pipeline ${runId}: unknown event type: "${eventType}" keys: ${Object.keys(event).join(',')}`);
        }
      }

      // Process all tool calls from this batch in parallel
      if (toolCalls.length > 0) {
        await this.processToolCalls(toolCalls, sessionId, runId, ticker, stage, userId, reportId, state);
      }

      // Exit after processing any remaining tool calls
      if (isTerminal) {
        sessionActive = false;
      }
    }
  }

  async processToolCalls(toolCalls, sessionId, runId, ticker, stage, userId, reportId, state) {
    // Execute all tool calls in parallel (within-phase parallelism)
    const results = await Promise.allSettled(
      toolCalls.map(tc => this.executeToolCall(tc, ticker, stage, userId, reportId, runId, state))
    );

    // Send all tool results back to the session.
    // API format: {events: [{type, custom_tool_use_id, content: [{type: "text", text: "..."}]}]}
    const resultEvents = [];
    for (let i = 0; i < results.length; i++) {
      const tc = toolCalls[i];
      // The tool use event's id IS the reference ID
      const toolUseId = tc.id;
      let resultText;

      if (results[i].status === 'fulfilled') {
        resultText = JSON.stringify(results[i].value);
      } else {
        resultText = JSON.stringify({ error: results[i].reason?.message || 'Tool execution failed' });
      }

      resultEvents.push({
        type: 'user.custom_tool_result',
        custom_tool_use_id: toolUseId,
        content: [{ type: 'text', text: resultText }],
      });
    }

    // Send all results in a single batch
    const sendRes = await fetch(`${ANTHROPIC_API}/v1/sessions/${sessionId}/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': BETA_HEADER,
      },
      body: JSON.stringify({ events: resultEvents }),
    });

    if (!sendRes.ok) {
      const body = await sendRes.text();
      console.warn(`Pipeline: tool result send failed: ${sendRes.status} ${body.slice(0, 200)}`);
    }
  }

  async executeToolCall(toolCall, ticker, stage, userId, reportId, runId, state) {
    const { name, input } = toolCall;

    switch (name) {
      case 'get_data_packet': {
        const dp = await handleGetDataPacket(input.ticker || ticker, this.env);
        state.setDataPacket(dp);

        // Return compact summary (full DataPacket stays in DO state)
        return {
          status: 'ok',
          ticker: dp.ticker,
          companyName: dp.companyInfo?.name || dp.ticker,
          availableFields: Object.keys(dp).filter(k => dp[k] !== null && dp[k] !== undefined),
          financialYears: dp.financials ? Object.keys(dp.financials).length : 0,
        };
      }

      case 'run_psr': {
        const dpForPsr = state.getDataPacket();
        if (!dpForPsr) {
          throw new Error('DataPacket not loaded. Call get_data_packet first.');
        }

        const psrResult = await handleRunPsr(
          input.ticker || ticker, input.stage || stage, dpForPsr, this.env,
        );

        // Store PSR findings in DO state for run_agent to reference
        if (psrResult.psrFindings) {
          state.setPsrFindings(psrResult.psrFindings);
        }

        // Accumulate PSR sections for cost logging
        for (const s of psrResult.psrSections || []) {
          state.allSections.push(s);
        }

        return {
          status: psrResult.errors?.length > 0 ? 'partial' : 'ok',
          psrFindings: psrResult.psrFindings,
          dispatched: psrResult.dispatched,
          completed: psrResult.completed,
          errors: psrResult.errors,
        };
      }

      case 'run_agent': {
        const dataPacket = state.getDataPacket();
        if (!dataPacket) {
          throw new Error('DataPacket not loaded. Call get_data_packet first.');
        }

        const result = await handleRunAgent(input, dataPacket, this.env);

        if (result.section) {
          state.allSections.push(result.section);
        }

        // Return the section data + metadata to the coordinator
        return {
          status: result.error ? 'error' : 'ok',
          section: result.section,
          error: result.error,
          usage: result.usage,
          model: result.model,
          duration: result.duration,
        };
      }

      case 'save_progress': {
        return handleSaveProgress({ ...input, runId }, this.env);
      }

      case 'save_report': {
        // Normalize "none" string from coordinator message parsing.
        // The initial message says "Report ID: none" when no report exists.
        // The coordinator passes this as reportId="none" (truthy string).
        // Fall back to DO params (could be null, which is correct).
        const effectiveReportId = (input.reportId === 'none' || !input.reportId)
          ? reportId
          : input.reportId;

        return handleSaveReport({
          ...input,
          userId,
          runId,
          ticker,
          reportId: effectiveReportId || null,
          stage: input.stage || stage,
        }, this.env);
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
