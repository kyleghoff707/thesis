// aiResearch.js — Claude API dispatch engine for AI agent sections
// Dispatches a single agent via client.messages.parse() with structured output.
// Uses dotenv directly (NOT nodeAdapter.js — its fetch patch strips SDK auth headers).

import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { resolve } from 'path';
dotenv.config({ path: resolve(process.cwd(), '.env.local') });

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { ReportSectionSchema } from '../schemas/reportSection.js';

// ─── Client initialization ─────────────────────────────────────

const client = new Anthropic({ apiKey: process.env.VITE_CLAUDE_KEY });

// ─── Constants ──────────────────────────────────────────────────

const MODEL_MAP = {
  sonnet: 'claude-sonnet-4-6',
  opus: 'claude-opus-4-6',
};

const PRICING = {
  'claude-sonnet-4-6':   { input: 3.0, output: 15.0, cacheRead: 0.30, cacheWrite: 3.75, webSearch: 0.01 },
  'claude-opus-4-6':     { input: 5.0, output: 25.0, cacheRead: 0.50, cacheWrite: 6.25, webSearch: 0.01 },
};

const AGENTS_DIR = resolve(process.cwd(), 'agents');

// ─── Context assembly ───────────────────────────────────────────

// Load and parse agent config.json
function loadAgentConfig(role) {
  const configPath = resolve(AGENTS_DIR, role, 'config.json');
  try {
    return JSON.parse(readFileSync(configPath, 'utf8'));
  } catch (err) {
    throw new Error(`Failed to load agent config for "${role}": ${err.message}`);
  }
}

// Load agent prompt.md
function loadAgentPrompt(role) {
  const promptPath = resolve(AGENTS_DIR, role, 'prompt.md');
  try {
    return readFileSync(promptPath, 'utf8');
  } catch (err) {
    throw new Error(`Failed to load agent prompt for "${role}": ${err.message}`);
  }
}

// Load curriculum files, join with separator
function loadCurriculum(curriculumPaths) {
  if (!curriculumPaths || curriculumPaths.length === 0) return '';
  return curriculumPaths.map(p => {
    const fullPath = resolve(process.cwd(), p);
    try {
      return readFileSync(fullPath, 'utf8');
    } catch {
      return `[Curriculum file not found: ${p}]`;
    }
  }).join('\n\n---\n\n');
}

// Extract only the requested keys from the DataPacket
function sliceDataPacket(dataPacket, sliceKeys) {
  if (!sliceKeys || sliceKeys.length === 0) {
    return { ticker: dataPacket.ticker, caveats: dataPacket.caveats };
  }
  const slice = { ticker: dataPacket.ticker, caveats: dataPacket.caveats };
  for (const key of sliceKeys) {
    if (dataPacket[key] !== undefined) {
      slice[key] = dataPacket[key];
    }
  }
  return slice;
}

// Generate a field path reference block for the DataPacket slice (FIX-01)
// Walks top-level + second-level keys so agents know which `ref` paths are valid.
function generateFieldPathBlock(dataSlice) {
  const lines = [
    '## DataPacket Field Paths',
    '',
    'These are the ONLY valid `ref` paths for DataPacket citations. Do NOT fabricate paths that do not appear below.',
    '',
  ];

  for (const [key, value] of Object.entries(dataSlice)) {
    if (value === null) {
      lines.push(`- \`dataPacket.${key}\`: null`);
    } else if (Array.isArray(value)) {
      lines.push(`- \`dataPacket.${key}\`: array[${value.length}]`);
    } else if (typeof value === 'object') {
      const subKeys = Object.keys(value);
      lines.push(`- \`dataPacket.${key}\`: {${subKeys.length} fields}`);
      const displayed = subKeys.slice(0, 20);
      for (const sk of displayed) {
        const sv = value[sk];
        if (sv === null) {
          lines.push(`  - \`.${sk}\`: null`);
        } else if (Array.isArray(sv)) {
          lines.push(`  - \`.${sk}\`: array[${sv.length}]`);
        } else if (typeof sv === 'object') {
          lines.push(`  - \`.${sk}\`: {${Object.keys(sv).length} fields}`);
        } else {
          lines.push(`  - \`.${sk}\`: ${typeof sv}`);
        }
      }
      if (subKeys.length > 20) {
        lines.push(`  - ...and ${subKeys.length - 20} more fields`);
      }
    } else {
      lines.push(`- \`dataPacket.${key}\`: ${typeof value}`);
    }
  }

  return lines.join('\n');
}

// Build the user message from DataPacket slice and options
function buildUserMessage(dataSlice, options = {}) {
  const parts = [];

  // Field path reference block (FIX-01) — BEFORE the DataPacket JSON
  parts.push(generateFieldPathBlock(dataSlice));

  // DataPacket slice in JSON code fence
  parts.push(`## DataPacket\n\n\`\`\`json\n${JSON.stringify(dataSlice, null, 2)}\n\`\`\``);

  // Section assignment
  if (options.sectionAssignment) {
    parts.push(`## Assignment\n\n${options.sectionAssignment}`);
  }

  // Prior section context (for dependent agents)
  if (options.priorSections && options.priorSections.length > 0) {
    const validSections = options.priorSections.filter(s => s && s.title);
    if (validSections.length > 0) {
      const summaries = validSections.map(s =>
        `### ${s.title} (${s.status})\n${s.summary}\nRed flags: ${(s.redFlags || []).join('; ')}`
      ).join('\n\n');
      parts.push(`## Prior Section Findings\n\n${summaries}`);
    }
  }

  // PM feedback from checkpoint review (D-07)
  if (options.pmFeedback) {
    parts.push(`## PM Feedback\n\n${options.pmFeedback}`);
  }

  // Debate context — prior debate steps for sequential debate flow
  if (options.debateContext) {
    parts.push(`## Debate Context\n\n${options.debateContext}`);
  }

  // Debate role identifier
  if (options.debateRole) {
    parts.push(`## Debate Role\n\nYou are acting as the **${options.debateRole}** in this debate.`);
  }

  return parts.join('\n\n---\n\n');
}

// ─── System message blocks (D-03: prompt caching) ──────────────

// Build system message as array of content blocks with cache_control breakpoints
// Order: (1) universal context [cached], (2) PSR findings [cached], (3) agent-specific [not cached]
function buildSystemBlocks(universalContext, psrFindings, agentPrompt, curriculum) {
  const blocks = [];

  // Breakpoint 1: Universal context (shared by ALL agents -- cacheable)
  if (universalContext) {
    blocks.push({
      type: 'text',
      text: universalContext,
      cache_control: { type: 'ephemeral' },
    });
  }

  // Breakpoint 2: PSR findings (shared by all analysis agents for same ticker)
  if (psrFindings) {
    blocks.push({
      type: 'text',
      text: psrFindings,
      cache_control: { type: 'ephemeral' },
    });
  }

  // No breakpoint: Agent-specific content (varies per agent -- not cached cross-agent)
  const agentContent = [agentPrompt, curriculum].filter(Boolean).join('\n\n---\n\n');
  if (agentContent) {
    blocks.push({ type: 'text', text: agentContent });
  }

  return blocks;
}

// ─── Web search URL extraction ──────────────────────────────────

// Extract URLs from web_search_tool_result content blocks
function extractWebSearchURLs(response) {
  const urls = [];
  for (const block of (response.content || [])) {
    if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
      for (const result of block.content) {
        if (result.type === 'web_search_result') {
          urls.push({
            url: result.url,
            title: result.title,
            pageAge: result.page_age,
          });
        }
      }
    }
  }
  return urls;
}

// ─── Citation enrichment ────────────────────────────────────────

// Match citations to web search URLs by domain or title substring (FIX-02)
function enrichCitationsWithURLs(section, webSearchURLs) {
  if (!section.citations || webSearchURLs.length === 0) return;

  for (const citation of section.citations) {
    // Skip citations that already have a URL
    if (citation.url) continue;

    // Skip DataPacket citations
    if (citation.source === 'DataPacket' || citation.ref?.startsWith('dataPacket.')) continue;

    // Try to match by domain name or title substring
    const sourceLower = (citation.source || '').toLowerCase();
    const sourceNoSpaces = sourceLower.replace(/\s+/g, '');
    const match = webSearchURLs.find(ws => {
      try {
        const domain = new URL(ws.url).hostname.replace('www.', '');
        const domainBase = domain.replace(/\.com$|\.net$|\.org$|\.io$/, '');
        return sourceLower.includes(domain) ||
               sourceNoSpaces.includes(domainBase) ||
               sourceLower.includes(ws.title.toLowerCase().substring(0, 20));
      } catch { return false; }
    });
    if (match) {
      citation.url = match.url;
    }
  }
}

// ─── Cost calculation ───────────────────────────────────────────

// Build usage summary from API response usage fields
function buildUsage(apiUsage, model) {
  const p = PRICING[model] || PRICING['claude-sonnet-4-6'];
  const inputTokens = apiUsage.input_tokens || 0;
  const outputTokens = apiUsage.output_tokens || 0;
  const cacheRead = apiUsage.cache_read_input_tokens || 0;
  const cacheWrite = apiUsage.cache_creation_input_tokens || 0;
  const webSearches = apiUsage.server_tool_use?.web_search_requests || 0;

  const cost =
    (inputTokens * p.input / 1_000_000) +
    (outputTokens * p.output / 1_000_000) +
    (cacheRead * p.cacheRead / 1_000_000) +
    (cacheWrite * p.cacheWrite / 1_000_000) +
    (webSearches * p.webSearch);

  return { inputTokens, outputTokens, cacheRead, cacheWrite, webSearches, cost };
}

// ─── Sleep helper ───────────────────────────────────────────────

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ─── Retry logic ────────────────────────────────────────────────

// Extract parsed result from response — handles both structured output and manual JSON parsing
function extractResult(response, schema) {
  // Structured output path: parsed_output is set by messages.parse()
  if (response.parsed_output) return response.parsed_output;

  // Manual path: extract JSON from text content blocks (used when tools are present)
  const textBlocks = (response.content || []).filter(b => b.type === 'text');
  if (textBlocks.length === 0) return null;

  const text = textBlocks.map(b => b.text).join('').trim();
  if (!text) return null;

  // Find JSON object in the response text (may have leading/trailing text)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    // Validate against schema if provided
    if (schema) {
      const result = schema.safeParse(parsed);
      if (result.success) return result.data;
      // Schema validation failed — return raw parsed JSON anyway (best effort)
      return parsed;
    }
    return parsed;
  } catch {
    return null;
  }
}

// Wraps an API call with retry-then-escalate error handling (API-05)
async function dispatchWithRetry(callFn, agentRole, schema) {
  try {
    const response = await callFn();

    // Check stop_reason
    if (response.stop_reason === 'max_tokens') {
      // Truncated — retry once with higher max_tokens
      console.warn(`${agentRole}: max_tokens hit, retrying with 32768`);
      const retryResponse = await callFn({ maxTokens: 32768 });
      if (retryResponse.stop_reason !== 'end_turn') {
        return {
          result: null,
          error: 'Truncated after retry',
          response: retryResponse,
        };
      }
      return { result: extractResult(retryResponse, schema), error: null, response: retryResponse };
    }

    if (response.stop_reason === 'refusal') {
      return {
        result: null,
        error: 'Agent refused request (safety filter)',
        response,
      };
    }

    // Extract result from response
    const result = extractResult(response, schema);

    // end_turn — check for near-empty responses (transient model failures)
    if (!result && (response.usage?.output_tokens || 0) < 100) {
      console.warn(`${agentRole}: near-empty response (${response.usage?.output_tokens} tokens), retrying once`);
      try {
        const retryResponse = await callFn();
        const retryResult = extractResult(retryResponse, schema);
        if (retryResult) {
          return { result: retryResult, error: null, response: retryResponse };
        }
      } catch (retryErr) {
        console.warn(`${agentRole}: retry also failed: ${retryErr.message}`);
      }
      // Fall through with original response — null guard in dispatchAgent will catch it
    }

    return { result, error: null, response };

  } catch (err) {
    // Rate limit (429)
    if (err.status === 429) {
      const retryAfter = parseInt(err.headers?.['retry-after'] || '30', 10);
      console.warn(`${agentRole}: rate limited, waiting ${retryAfter}s`);
      await sleep(retryAfter * 1000);
      try {
        const retryResponse = await callFn();
        return { result: retryResponse.parsed_output, error: null, response: retryResponse };
      } catch (retryErr) {
        return { result: null, error: `Rate limit retry failed: ${retryErr.message}` };
      }
    }

    // Overloaded (529) or server error (5xx)
    if (err.status >= 500) {
      console.warn(`${agentRole}: server error ${err.status}, retrying after 10s`);
      await sleep(10000);
      try {
        const retryResponse = await callFn();
        return { result: retryResponse.parsed_output, error: null, response: retryResponse };
      } catch (retryErr) {
        return { result: null, error: `Server error retry failed: ${retryErr.message}` };
      }
    }

    // Other errors (400 schema issue, auth, etc.) — don't retry
    return { result: null, error: `${err.status || 'unknown'}: ${err.message}` };
  }
}

// ─── Main dispatch function ─────────────────────────────────────

export async function dispatchAgent(agentRole, dataPacket, options = {}) {
  const startTime = Date.now();

  // 1. Load agent config, prompt, curriculum
  const config = loadAgentConfig(agentRole);
  const prompt = loadAgentPrompt(agentRole);

  // Load universal context files if agent requests them
  let universalContext = '';
  if (config.universalContext && config.universalContextFiles) {
    universalContext = loadCurriculum(config.universalContextFiles);
  }

  const curriculum = loadCurriculum(config.curriculum);
  const dataSlice = sliceDataPacket(dataPacket, config.dataPacketSlice);

  // 2. Resolve model via MODEL_MAP (default to sonnet)
  const model = MODEL_MAP[config.model] || MODEL_MAP.sonnet;

  // 3. Build tools array — web search gated by maxSearches (D-03)
  // When maxSearches === 0, tools array is empty (tool absent entirely)
  const effectiveTools = (options.maxSearches === 0) ? [] : [
    {
      type: 'web_search_20250305',
      name: 'web_search',
      max_uses: options.maxSearches || 5,
    },
  ];

  // 4. Build system message: cache-friendly content blocks (per D-03)
  const systemBlocks = buildSystemBlocks(universalContext, options.psrFindings, prompt, curriculum);

  // 5. Build user message
  const userContent = buildUserMessage(dataSlice, options);

  // 6. Define callFn for API dispatch
  // Schema parameter (D-05): use options.schema when provided, else ReportSectionSchema
  const schema = options.schema || ReportSectionSchema;

  // Opus 4.6 bug: output_config + tools together produces empty responses for some prompts.
  // When tools are present, skip output_config and parse JSON manually from response text.
  const useStructuredOutput = effectiveTools.length === 0;

  const callFn = (overrides = {}) => {
    const params = {
      model,
      max_tokens: overrides.maxTokens || options.maxTokens || 16384,
      system: systemBlocks,
      messages: [{ role: 'user', content: userContent }],
    };

    if (useStructuredOutput) {
      // No tools — safe to use structured output enforcement
      params.tools = [];
      params.output_config = { format: zodOutputFormat(schema) };
      return client.messages.parse(params);
    } else {
      // Tools present — use create() without output_config, parse JSON manually
      params.tools = effectiveTools;
      return client.messages.create(params);
    }
  };

  // 7. Dispatch with retry handling
  const retryResult = await dispatchWithRetry(callFn, agentRole, schema);

  // 8. Handle error case
  if (retryResult.error) {
    return {
      section: null,
      usage: buildUsage(retryResult.response?.usage || {}, model),
      webSearches: [],
      model,
      stopReason: retryResult.response?.stop_reason || 'error',
      duration: Date.now() - startTime,
      error: retryResult.error,
    };
  }

  // 9. Process parsed_output
  const section = retryResult.result;

  // Guard: if parsed_output is null (schema validation failed or model returned minimal tokens),
  // return an error instead of silently propagating null section
  if (!section) {
    const outputTokens = retryResult.response?.usage?.output_tokens || 0;
    // Diagnostic: dump full response structure to understand parsing failure
    const resp = retryResult.response;
    console.warn(`${agentRole}: parsed_output is null (${outputTokens} output tokens)`);
    console.warn(`  stop_reason: ${resp?.stop_reason}`);
    console.warn(`  content length: ${resp?.content?.length}`);
    console.warn(`  content: ${JSON.stringify(resp?.content)?.substring(0, 500)}`);
    console.warn(`  response keys: ${resp ? Object.keys(resp).join(', ') : 'null'}`);
    // Check for output field (structured output may use different field)
    if (resp?.output) console.warn(`  output: ${JSON.stringify(resp.output)?.substring(0, 500)}`);
    if (resp?.parsed_output !== undefined) console.warn(`  parsed_output: ${JSON.stringify(resp.parsed_output)?.substring(0, 200)}`);
    // Check the raw HTTP response body if available
    if (resp?._raw) console.warn(`  _raw keys: ${Object.keys(resp._raw).join(', ')}`);
    return {
      section: null,
      usage: buildUsage(retryResult.response?.usage || {}, model),
      webSearches: [],
      model,
      stopReason: retryResult.response?.stop_reason || 'unknown',
      duration: Date.now() - startTime,
      error: `Structured output parsing failed (${outputTokens} output tokens, stop_reason: ${retryResult.response?.stop_reason || 'unknown'})`,
    };
  }

  // Determine if output is a ReportSection (has data/citations/tokenCost fields)
  // Non-ReportSection outputs (e.g., DebateStepSchema) skip data parsing, citation
  // enrichment, and tokenCost/modelUsed overwriting
  const isReportSection = !options.schema || options.schema === ReportSectionSchema;

  // Extract web search URLs from response content blocks
  const webSearches = extractWebSearchURLs(retryResult.response);

  if (isReportSection) {
    // Parse data field from JSON string to object (D-06)
    if (section && typeof section.data === 'string') {
      try {
        section.data = JSON.parse(section.data);
      } catch (e) {
        console.warn(`${agentRole}: data field JSON.parse failed: ${e.message}`);
        // Keep as string — critic.js handles both
      }
    }

    // Enrich citations with web search URLs (FIX-02)
    if (section) {
      enrichCitationsWithURLs(section, webSearches);
    }

    // Overwrite agent-reported tokenCost and modelUsed with actual API values
    if (section) {
      const usage = retryResult.response.usage || {};
      section.tokenCost = {
        input: usage.input_tokens || 0,
        output: usage.output_tokens || 0,
      };
      section.modelUsed = model;
    }
  }

  // 10. Return rich result object
  return {
    section,
    usage: buildUsage(retryResult.response.usage, model),
    webSearches,
    model,
    stopReason: retryResult.response.stop_reason,
    duration: Date.now() - startTime,
    error: null,
  };
}

// ─── Test exports ───────────────────────────────────────────────

export const _testExports = {
  extractWebSearchURLs,
  enrichCitationsWithURLs,
  buildUsage,
  sliceDataPacket,
  loadAgentConfig,
  loadAgentPrompt,
  loadCurriculum,
  buildUserMessage,
  buildSystemBlocks,
  generateFieldPathBlock,
  MODEL_MAP,
  PRICING,
};
