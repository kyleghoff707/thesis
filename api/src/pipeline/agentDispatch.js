// Worker-side agent dispatch — self-contained dispatch using Anthropic SDK.
// Does NOT import aiResearch.js (contaminated with Vite ?raw, import.meta.env).
// Reimplements the core dispatch logic: prompt assembly, API call, result extraction.

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { CURRICULUM_MAP, AGENT_CONFIGS, AGENT_PROMPTS } from './curriculumBundle.js';
import { MODEL_PRICING, normalizeModel } from '../../../packages/pricing/index.js';

const MODEL_MAP = { sonnet: 'claude-sonnet-4-6', opus: 'claude-opus-4-6' };
const PRICING = MODEL_PRICING;

let _client = null;
function getClient(env) {
  if (!_client) _client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return _client;
}

// ─── Prompt assembly (mirrors aiResearch.js logic) ──────────

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

function extractResult(response, schema) {
  if (response.parsed_output) return response.parsed_output;
  const text = (response.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
  if (!text) return null;
  // Strategy 1: code block
  const cb = text.match(/```json\s*([\s\S]*?)```/);
  if (cb) { try { return JSON.parse(cb[1].trim()); } catch {} }
  // Strategy 2: key field
  const kf = text.match(/\{"key"\s*:\s*"[\s\S]*\}/);
  if (kf) { try { return JSON.parse(kf[0]); } catch {} }
  // Strategy 3: greedy
  const g = text.match(/\{[\s\S]*\}/);
  if (g) { try { return JSON.parse(g[0]); } catch {} }
  return null;
}

function buildUsage(apiUsage, model) {
  const p = PRICING[normalizeModel(model)] || PRICING['claude-sonnet-4-6'];
  const inp = apiUsage.input_tokens || 0, out = apiUsage.output_tokens || 0;
  const cr = apiUsage.cache_read_input_tokens || 0, cw = apiUsage.cache_creation_input_tokens || 0;
  const ws = apiUsage.server_tool_use?.web_search_requests || 0;
  return {
    inputTokens: inp, outputTokens: out, cacheRead: cr, cacheWrite: cw, webSearches: ws,
    cost: (inp * p.input / 1e6) + (out * p.output / 1e6) + (cr * p.cacheRead / 1e6) + (cw * p.cacheWrite / 1e6) + (ws * p.webSearch),
  };
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ─── Dispatch with retry ──────────────────────────────────��─

async function dispatchWithRetry(callFn, agentRole, schema) {
  try {
    const response = await callFn();
    if (response.stop_reason === 'max_tokens') {
      const retryMax = Math.min(64000, (response.usage?.output_tokens || 16384) * 2);
      const retry = await callFn({ maxTokens: retryMax });
      return { result: extractResult(retry, schema), error: null, response: retry };
    }
    if (response.stop_reason === 'refusal') return { result: null, error: 'Agent refused (safety filter)', response };
    const result = extractResult(response, schema);
    if (!result && (response.usage?.output_tokens || 0) < 100) {
      try { const r2 = await callFn(); const r2r = extractResult(r2, schema); if (r2r) return { result: r2r, error: null, response: r2 }; } catch {}
    }
    return { result, error: null, response };
  } catch (err) {
    if (err.status === 429) {
      const wait = parseInt(err.headers?.['retry-after'] || '30', 10);
      await sleep(wait * 1000);
      try { const r = await callFn(); return { result: extractResult(r, schema), error: null, response: r }; } catch (e) { return { result: null, error: `Rate limit: ${e.message}` }; }
    }
    if (err.status >= 500) {
      for (const d of [10, 30]) { await sleep(d * 1000); try { const r = await callFn(); return { result: extractResult(r, schema), error: null, response: r }; } catch (e) { if (e.status >= 500) continue; return { result: null, error: e.message }; } }
      return { result: null, error: `Server error after retries` };
    }
    return { result: null, error: `${err.status || 'unknown'}: ${err.message}` };
  }
}

// ─── Main dispatch ──────────────────────────────────────────

/**
 * Dispatch an agent from the Worker context.
 * Self-contained: no aiResearch.js import needed.
 */
export async function dispatchAgentServer(agentRole, dataPacket, options = {}, env) {
  const startTime = Date.now();
  const client = getClient(env);

  const config = AGENT_CONFIGS[agentRole];
  if (!config) throw new Error(`Unknown agent: "${agentRole}"`);

  const promptEntry = AGENT_PROMPTS[agentRole];
  if (!promptEntry) throw new Error(`No prompt for agent "${agentRole}"`);
  let prompt = promptEntry.base;
  if (options.stage && promptEntry[options.stage]) prompt += '\n\n---\n\n' + promptEntry[options.stage];

  let universalContext = '';
  if (config.universalContext && config.universalContextFiles) {
    universalContext = config.universalContextFiles.map(p => CURRICULUM_MAP[p] || '').filter(Boolean).join('\n\n---\n\n');
  }
  const curriculum = (config.curriculum || []).map(p => CURRICULUM_MAP[p] || '').filter(Boolean).join('\n\n---\n\n');
  const dataSlice = sliceDataPacket(dataPacket, config.dataPacketSlice);
  const model = MODEL_MAP[config.model] || MODEL_MAP.sonnet;

  const tools = (options.maxSearches === 0) ? [] : [
    { type: 'web_search_20250305', name: 'web_search', max_uses: options.maxSearches || 5 },
  ];
  const systemBlocks = buildSystemBlocks(universalContext, options.psrFindings, prompt, curriculum);
  const userContent = buildUserMessage(dataSlice, options);

  // Import schema dynamically to avoid pulling in Zod at module level
  const { ReportSectionSchema } = await import('../../../src/schemas/reportSection.js');
  const schema = options.schema || ReportSectionSchema;

  const callFn = (overrides = {}) => {
    const params = {
      model,
      max_tokens: overrides.maxTokens || options.maxTokens || 16384,
      system: systemBlocks,
      messages: [{ role: 'user', content: userContent }],
      tools: tools.length > 0 ? tools : [],
      output_config: { format: zodOutputFormat(schema) },
    };
    // Non-streaming in Worker (no client to stream to)
    return client.messages.create(params);
  };

  const retryResult = await dispatchWithRetry(callFn, agentRole, schema);
  const section = retryResult.result;

  if (!section) {
    return {
      section: null,
      usage: buildUsage(retryResult.response?.usage || {}, model),
      webSearches: [],
      model,
      stopReason: retryResult.response?.stop_reason || 'unknown',
      duration: Date.now() - startTime,
      error: retryResult.error || 'Structured output parsing failed',
    };
  }

  // Post-processing for ReportSection
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
    webSearches: [],
    model,
    stopReason: retryResult.response.stop_reason,
    duration: Date.now() - startTime,
    error: null,
  };
}
