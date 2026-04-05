# Phase 8: Core Agent Dispatch - Research

**Researched:** 2026-03-28
**Domain:** Claude API structured output dispatch engine (`aiResearch.js`)
**Confidence:** HIGH

## Summary

Phase 8 builds `aiResearch.js` -- the engine that dispatches a single analysis agent via the Claude API with structured output and web search, producing a validated `ReportSectionSchema` object. This phase proves one agent works end-to-end before Phase 9 adds parallel dispatch. The foundation was laid by Phase 7: the schema works, the SDK works, the smoke test passes. Phase 8 converts that smoke test into a production-quality engine.

The core challenge is not API mechanics (Phase 7 proved those) but **context assembly**: loading agent configs, reading prompt files, slicing the DataPacket, injecting curriculum, and building the complete messages array. The engine must also handle error recovery (max_tokens truncation, rate limits, timeouts), extract web search URLs from `web_search_tool_result` blocks, enrich citations with those URLs, and return rich diagnostics for PM visibility.

**Primary recommendation:** Model `aiResearch.js` directly after `scripts/smoke-test-schema.js` (the proven pattern), adding context assembly from agent config files, DataPacket slicing, web search URL extraction, error handling with retry, and cost tracking from actual API response `usage` fields. Do NOT import `nodeAdapter.js`. Load `.env.local` via `dotenv.config()` directly.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Use standalone dotenv pattern (proven in `scripts/smoke-test-schema.js`). Load `.env.local` via `dotenv.config()` directly. Do NOT import `nodeAdapter.js` -- its fetch monkey-patch strips the Anthropic SDK's `x-api-key` header.
- **D-02:** This is a temporary local-only approach. The app will eventually have a Cloudflare server that hides all API keys. The entire client initialization strategy gets replaced at that point -- no need to over-engineer now.
- **D-03:** Map agent config shorthand to full model IDs: `"sonnet"` -> `"claude-sonnet-4-6"`, `"opus"` -> `"claude-opus-4-6"`. Only these model generations support `output_config` structured outputs. The older `claude-sonnet-4-20250514` / `claude-opus-4-20250514` do NOT work.
- **D-04:** Return rich result object: `{ section, usage: { inputTokens, outputTokens, cacheRead, cacheWrite, cost }, webSearches: [...urls], model, duration }`. Everything needed for PM visibility and cost tracking (API-07).
- **D-05:** Use `client.messages.parse()` with `zodOutputFormat(ReportSectionSchema)` -- the proven pattern from Phase 7's smoke test.
- **D-06:** `section.data` arrives as a JSON string from the API (Phase 7 D-01). The engine should `JSON.parse()` it before returning so callers receive an object, not a string.

### Claude's Discretion
- Whether dispatch function reads agent config.json + prompt.md at call time or expects them pre-loaded (trade-off: convenience vs statelessness)
- Web search URL extraction strategy -- agent fills citation.url via structured output + post-processing backfills gaps from `web_search_tool_result` blocks, or simpler approach
- Error handling: how to handle max_tokens truncation (return partial vs null), retry count, backoff strategy
- `max_tokens` value per agent (8192-16384 based on Phase 7 smoke test results)
- How curriculum files and DataPacket slices are assembled into the prompt (system message structure)

### Deferred Ideas (OUT OF SCOPE)
- **Cloudflare server layer** -- Moves API keys server-side, removes nodeAdapter conflict entirely. Different milestone.
- **Prompt caching** (`cache_control` breakpoints) -- API-03 is a separate requirement, likely Phase 9 with parallel dispatch
- **In-browser direct API calls** -- EXPT-06, out of scope for this milestone
- **Streaming progress** -- Nice-to-have but not table stakes per REQUIREMENTS.md Out of Scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| API-01 | aiResearch.js dispatches agents via direct Claude API calls with structured outputs (output_config.format + zodOutputFormat) | Proven pattern from smoke-test-schema.js. Use `client.messages.parse()` with `zodOutputFormat(ReportSectionSchema)`. Model must be `claude-sonnet-4-6` or `claude-opus-4-6`. |
| API-04 | Web search via server tool (web_search_20250305) with max_uses per agent and URL extraction from tool results | Web search tool is compatible with structured outputs. URLs are in `web_search_tool_result` content blocks. Must extract and match to citation `source` fields post-response. |
| API-05 | Error handling with retry-then-escalate: rate limit backoff, max_tokens retry, schema errors logged, partial results preserved | `stop_reason: "max_tokens"` means incomplete/invalid JSON. `stop_reason: "refusal"` means safety refusal. Only `stop_reason: "end_turn"` guarantees valid structured output. Retry once with higher max_tokens on truncation. |
| FIX-02 | Web citation URL enforcement -- post-processing enriches citation source fields with actual URLs from web_search_tool_result blocks | Two-layer approach: (1) agent prompt instructs including URL in `source` field, (2) orchestrator extracts URLs from `web_search_tool_result` blocks and matches to citations by domain/title. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@anthropic-ai/sdk` | 0.80.0 (installed) | Claude API client with `messages.parse()` + `zodOutputFormat()` | First-party SDK. GA structured output support, no beta headers. |
| `zod` | 4.3.6 (installed) | Schema definition for `ReportSectionSchema` | Already used. `zodOutputFormat()` uses `z.toJSONSchema()` internally. |
| `dotenv` | 17.3.1 (installed) | Load `.env.local` for API key | Already used in smoke test. Avoids nodeAdapter fetch conflict. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `fs` (Node built-in) | -- | Read agent config.json + prompt.md at dispatch time | Every dispatch call |
| `path` (Node built-in) | -- | Resolve file paths for agent configs and curriculum | Every dispatch call |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `dotenv` direct | `nodeAdapter.js` | nodeAdapter's fetch monkey-patch strips SDK auth headers -- MUST NOT use |
| `messages.parse()` | `messages.create()` + manual JSON.parse | Loses auto Zod validation and `parsed_output` convenience |
| File reads at dispatch time | Pre-loaded agent registry | Pre-loading is simpler but less flexible for hot-reloading prompts during development |

**Installation:**
No new packages needed. All dependencies are already installed.

## Architecture Patterns

### Recommended Project Structure
```
src/engines/
    aiResearch.js           # NEW: dispatch engine (this phase)
    contextBudget.js        # EXISTING: token estimation + cost tracking (needs model ID update)
    dataExport.js           # EXISTING: assembleDataPacket()
    critic.js               # EXISTING: scoreCompleteness() for post-dispatch quality check
src/schemas/
    reportSection.js        # EXISTING: ReportSectionSchema (Phase 7 modified)
scripts/
    smoke-test-schema.js    # EXISTING: reference implementation (Phase 7)
agents/
    {role}/config.json      # EXISTING: agent role definitions
    {role}/prompt.md        # EXISTING: agent system prompts
```

### Pattern 1: Agent Dispatch Function

**What:** A single `dispatchAgent()` function that takes agent role, DataPacket, and optional context, returns a rich result object.

**When to use:** Every time an agent needs to be dispatched for a section.

**Example:**
```javascript
// Source: smoke-test-schema.js (Phase 7 proven pattern) + agent config loading
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { resolve } from 'path';
dotenv.config({ path: resolve(process.cwd(), '.env.local') });

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { ReportSectionSchema } from '../schemas/reportSection.js';

const client = new Anthropic({ apiKey: process.env.VITE_CLAUDE_KEY });

const MODEL_MAP = {
  sonnet: 'claude-sonnet-4-6',
  opus: 'claude-opus-4-6',
};

export async function dispatchAgent(agentRole, dataPacket, options = {}) {
  const startTime = Date.now();

  // 1. Load agent config + prompt
  const config = loadAgentConfig(agentRole);
  const prompt = loadAgentPrompt(agentRole);
  const curriculum = loadCurriculum(config.curriculum);
  const dataSlice = sliceDataPacket(dataPacket, config.dataPacketSlice);

  // 2. Resolve model
  const model = MODEL_MAP[config.model] || MODEL_MAP.sonnet;

  // 3. Build tools array
  const tools = [];
  if (needsWebSearch(config)) {
    tools.push({
      type: 'web_search_20250305',
      name: 'web_search',
      max_uses: options.maxSearches || 5,
    });
  }

  // 4. Construct messages
  const systemContent = `${prompt}\n\n${curriculum}`;
  const userContent = buildUserMessage(dataSlice, options);

  // 5. Call API
  const response = await client.messages.parse({
    model,
    max_tokens: options.maxTokens || 16384,
    system: [{ type: 'text', text: systemContent }],
    messages: [{ role: 'user', content: userContent }],
    ...(tools.length > 0 ? { tools } : {}),
    output_config: { format: zodOutputFormat(ReportSectionSchema) },
  });

  // 6. Process response
  const section = response.parsed_output;
  if (typeof section.data === 'string') {
    try { section.data = JSON.parse(section.data); } catch {}
  }

  // 7. Extract web search URLs and enrich citations
  const webSearchURLs = extractWebSearchURLs(response);
  enrichCitationsWithURLs(section, webSearchURLs);

  // 8. Build result
  return {
    section,
    usage: buildUsage(response.usage, model),
    webSearches: webSearchURLs,
    model,
    stopReason: response.stop_reason,
    duration: Date.now() - startTime,
  };
}
```

### Pattern 2: Web Search URL Extraction and Citation Enrichment

**What:** Post-processing that extracts actual URLs from `web_search_tool_result` content blocks and injects them into the structured output's citation objects.

**When to use:** After every API call that used the web search tool.

**Critical insight:** With structured outputs + web search, the response `content` array contains:
1. Optional text blocks (Claude's reasoning before searching)
2. `server_tool_use` blocks (search queries)
3. `web_search_tool_result` blocks (results with URLs)
4. A final text block containing the structured JSON

The structured JSON is extracted by `messages.parse()` and available as `response.parsed_output`. The web search URLs are in the content blocks, NOT in the parsed output. Post-processing bridges these two sources.

**Example:**
```javascript
// Source: ARCHITECTURE.md web search URL flow + official API docs response structure
function extractWebSearchURLs(response) {
  const urls = [];
  for (const block of response.content) {
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

function enrichCitationsWithURLs(section, webSearchURLs) {
  if (!section.citations || webSearchURLs.length === 0) return;

  for (const citation of section.citations) {
    // Skip citations that already have a URL (agent populated it)
    if (citation.url) continue;

    // Skip DataPacket citations
    if (citation.source === 'DataPacket' || citation.ref?.startsWith('dataPacket.')) continue;

    // Try to match by domain name or title substring
    const sourceLower = (citation.source || '').toLowerCase();
    const match = webSearchURLs.find(ws => {
      try {
        const domain = new URL(ws.url).hostname.replace('www.', '');
        return sourceLower.includes(domain) ||
               sourceLower.includes(ws.title.toLowerCase().substring(0, 20));
      } catch { return false; }
    });
    if (match) {
      citation.url = match.url;
    }
  }
}
```

### Pattern 3: Error Handling with Retry-Then-Escalate

**What:** Handle `max_tokens` truncation, rate limits, timeouts, and refusals with a single retry then escalation.

**When to use:** Wraps every `client.messages.parse()` call.

**Example:**
```javascript
// Source: REQUIREMENTS.md API-05 + PITFALLS.md Pitfalls 2 & 8
async function dispatchWithRetry(callFn, agentRole) {
  try {
    const response = await callFn();

    // Check stop_reason
    if (response.stop_reason === 'max_tokens') {
      // Truncated -- retry once with higher max_tokens
      console.warn(`${agentRole}: max_tokens hit, retrying with 32768`);
      const retryResponse = await callFn({ maxTokens: 32768 });
      if (retryResponse.stop_reason !== 'end_turn') {
        // Still truncated -- return partial result with error flag
        return {
          result: retryResponse.parsed_output || null,
          error: `Truncated after retry (stop_reason: ${retryResponse.stop_reason})`,
          response: retryResponse,
        };
      }
      return { result: retryResponse.parsed_output, error: null, response: retryResponse };
    }

    if (response.stop_reason === 'refusal') {
      return {
        result: null,
        error: `Agent refused request (safety filter)`,
        response,
      };
    }

    // end_turn -- success
    return { result: response.parsed_output, error: null, response };

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

    // Other errors (400 schema issue, auth, etc.) -- don't retry
    return { result: null, error: `${err.status || 'unknown'}: ${err.message}` };
  }
}
```

### Pattern 4: Context Assembly (Agent Config -> API Messages)

**What:** Read agent config.json, load prompt.md, load curriculum files, slice the DataPacket, and build the system/messages array for the API call.

**When to use:** Before every dispatch.

**Recommendation:** Load files at call time (not pre-loaded). This is simpler, supports hot-reloading prompts during development, and the file I/O cost (~1-2ms) is negligible compared to API call time (~10-30s). File reads are synchronous (`readFileSync`) since they happen before the async API call.

**Example:**
```javascript
// Source: Agent configs (business-analyst, financial-analyst, etc.)
const AGENTS_DIR = resolve(process.cwd(), 'agents');
const KNOWLEDGE_DIR = resolve(process.cwd(), 'knowledge');

function loadAgentConfig(role) {
  const configPath = resolve(AGENTS_DIR, role, 'config.json');
  return JSON.parse(readFileSync(configPath, 'utf8'));
}

function loadAgentPrompt(role) {
  const promptPath = resolve(AGENTS_DIR, role, 'prompt.md');
  return readFileSync(promptPath, 'utf8');
}

function loadCurriculum(curriculumPaths) {
  if (!curriculumPaths || curriculumPaths.length === 0) return '';
  return curriculumPaths.map(p => {
    const fullPath = resolve(process.cwd(), p);
    try { return readFileSync(fullPath, 'utf8'); }
    catch { return `[Curriculum file not found: ${p}]`; }
  }).join('\n\n---\n\n');
}

function sliceDataPacket(dataPacket, sliceKeys) {
  if (!sliceKeys || sliceKeys.length === 0) return { ticker: dataPacket.ticker, caveats: dataPacket.caveats };
  const slice = { ticker: dataPacket.ticker, caveats: dataPacket.caveats };
  for (const key of sliceKeys) {
    if (dataPacket[key] !== undefined) slice[key] = dataPacket[key];
  }
  return slice;
}

function needsWebSearch(config) {
  // All analysis agents need web search. Only financial-analyst (pure numbers)
  // and synthesis-writer (reads prior sections) might not.
  // For Phase 8, enable web search for all agents -- the prompt governs usage.
  return true;
}
```

### Anti-Patterns to Avoid
- **Importing nodeAdapter.js:** Its `globalThis.fetch` monkey-patch adds SEC User-Agent headers to ALL fetch calls, stripping the Anthropic SDK's `x-api-key` header. Results in 401 errors.
- **Using `claude-sonnet-4-20250514` model ID:** Does not support `output_config` structured outputs. Returns 400 error.
- **Using `Promise.all()` for parallel dispatch:** Rejects on first failure, losing all successful results. Use `Promise.allSettled()` (but parallel is Phase 9, not Phase 8).
- **Sending `citations: { enabled: true }` with structured outputs:** Returns 400 error. These features are mutually exclusive.
- **Using `messages.create()` instead of `messages.parse()`:** Loses auto Zod validation and `parsed_output` convenience. Always use `.parse()`.
- **Ignoring `stop_reason`:** Only `"end_turn"` guarantees valid structured output. `"max_tokens"` means truncated/invalid JSON. `"refusal"` means safety refusal.
- **Setting `max_tokens` too low:** The ReportSectionSchema with full narrative, 15+ citations, tables, and data needs 6,000-12,000 output tokens. Set at least 16384 to be safe. The API docs confirm: "max_tokens does not factor into OTPM rate limit calculations, so there is no rate limit downside to setting a higher max_tokens value."
- **Assuming `section.data` is an object:** It arrives as a JSON string from the API. Must `JSON.parse()` before returning to callers.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Structured output parsing | Manual JSON.parse + Zod validation | `client.messages.parse()` + `zodOutputFormat()` | SDK handles JSON extraction from content blocks, Zod validation, and provides `parsed_output` |
| JSON Schema from Zod | Manual `z.toJSONSchema()` + additionalProperties fixes | `zodOutputFormat(ReportSectionSchema)` | SDK helper handles schema transformation, adds `additionalProperties: false`, wraps in output_config format |
| API key loading in Node scripts | Custom env loader or nodeAdapter | `dotenv.config({ path: '.env.local' })` | Standard pattern. nodeAdapter conflicts with SDK. |
| Token cost estimation | Custom token counting library | `response.usage` fields from API response | API returns exact token counts: `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens` |
| Web search execution | Custom web scraping or search API | `web_search_20250305` server tool | Anthropic executes searches on their infrastructure. No client-side search needed. |

**Key insight:** Phase 7 proved the entire SDK integration path works. The `scripts/smoke-test-schema.js` file IS the reference implementation. Phase 8 wraps it in production code with config loading, error handling, and diagnostics. Do not redesign what already works.

## Common Pitfalls

### Pitfall 1: Narrative Collapse Under Schema Constraints
**What goes wrong:** Claude abbreviates the `narrative` field (150 words instead of 800+) because it mentally reserves tokens for all other required schema fields. This was the V2 failure mode.
**Why it happens:** With 15+ required fields including arrays, the model "compresses" the longest fields to fit everything in the output token budget.
**How to avoid:** Set `max_tokens: 16384` (generous). The prompt already instructs 800+ words. Add a post-response check: if `narrative.length < 2000` characters (roughly 400 words), log a warning. Consider retry with explicit instruction if under 500 words.
**Warning signs:** Narrative fields under 500 characters. Quality scores below 60.

### Pitfall 2: Web Search URL Mismatch in Citation Enrichment
**What goes wrong:** The citation enrichment fuzzy matching (domain/title) produces false positives or misses genuine matches. A citation says "source: Reuters" but there are 3 Reuters URLs in the search results.
**Why it happens:** Domain-only matching is ambiguous when multiple searches hit the same domain.
**How to avoid:** Two-layer approach: (1) instruct the agent to include the full URL in the `source` field via its prompt, (2) post-processing enrichment as fallback only when `citation.url` is empty AND `citation.source` is not "DataPacket". Accept that some citations may not get URLs -- this is better than wrong URLs.
**Warning signs:** Citations with `url: undefined` after enrichment. Multiple citations mapping to the same URL.

### Pitfall 3: max_tokens Truncation Produces Invalid JSON
**What goes wrong:** `stop_reason: "max_tokens"` means the JSON is truncated mid-field. `JSON.parse()` fails. The entire agent output is lost.
**Why it happens:** The structured output is one large JSON string. If it exceeds max_tokens, the string is cut off. No closing braces, no complete fields.
**How to avoid:** Check `stop_reason` before accessing `parsed_output`. If `"max_tokens"`, retry once with `max_tokens: 32768`. If still truncated, return `null` (not a partial section) with the error details.
**Warning signs:** `stop_reason !== "end_turn"` in any API response.

### Pitfall 4: Stale Model IDs in contextBudget.js
**What goes wrong:** `contextBudget.js` has pricing for `claude-sonnet-4-20250514` but not `claude-sonnet-4-6`. Cost estimates are wrong or return undefined.
**Why it happens:** Phase 7 discovered that only `-4-6` model IDs support structured outputs. contextBudget.js was written before this discovery.
**How to avoid:** Update `MODEL_PRICING` in contextBudget.js to include `claude-sonnet-4-6` pricing. Both model IDs have the same pricing ($3/$15 for Sonnet, $15/$75 for Opus).
**Warning signs:** NaN or $0.00 cost estimates from contextBudget.js.

### Pitfall 5: File Path Resolution in Different Working Directories
**What goes wrong:** `readFileSync('agents/business-analyst/config.json')` fails because the working directory is not the project root (e.g., when called from a script in `scripts/`).
**Why it happens:** Relative paths depend on `process.cwd()`, which varies by invocation context.
**How to avoid:** Always use `resolve(process.cwd(), 'agents', role, 'config.json')` or detect the project root from a known landmark (e.g., `package.json`). The smoke test already uses `resolve(process.cwd(), '.env.local')` as the pattern.
**Warning signs:** ENOENT errors on agent config or prompt files.

## Code Examples

### Complete Response Processing (verified against Phase 7 smoke test output)

```javascript
// Source: smoke-test-schema.js diagnostics + official API response structure docs
function processResponse(response, agentRole) {
  const out = response.parsed_output;
  const usage = response.usage || {};

  // Validate stop_reason
  if (response.stop_reason !== 'end_turn') {
    return {
      section: null,
      error: `Unexpected stop_reason: ${response.stop_reason}`,
      usage: buildUsage(usage, agentRole),
    };
  }

  // Validate parsed_output exists
  if (!out) {
    return {
      section: null,
      error: 'parsed_output is null despite end_turn stop_reason',
      usage: buildUsage(usage, agentRole),
    };
  }

  // Parse data field (D-06: arrives as JSON string, callers expect object)
  if (typeof out.data === 'string') {
    try {
      out.data = JSON.parse(out.data);
    } catch (e) {
      console.warn(`${agentRole}: data field JSON.parse failed: ${e.message}`);
      // Keep as string -- critic.js handles both (Phase 7)
    }
  }

  // Extract web search URLs
  const webSearchURLs = extractWebSearchURLs(response);

  // Enrich citations with web URLs (FIX-02)
  enrichCitationsWithURLs(out, webSearchURLs);

  // Overwrite agent-reported token costs with actual API usage
  out.tokenCost = {
    input: usage.input_tokens || 0,
    output: usage.output_tokens || 0,
  };
  out.modelUsed = agentRole; // Will be overwritten with actual model in return value

  return {
    section: out,
    error: null,
    webSearchURLs,
    usage: buildUsage(usage, agentRole),
  };
}
```

### Cost Calculation from API Response Usage

```javascript
// Source: STACK.md pricing + smoke-test-schema.js estimateCost()
const PRICING = {
  'claude-sonnet-4-6':   { input: 3.0,  output: 15.0, cacheRead: 0.30, cacheWrite: 3.75, webSearch: 0.01 },
  'claude-opus-4-6':     { input: 15.0, output: 75.0, cacheRead: 1.50, cacheWrite: 18.75, webSearch: 0.01 },
};

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
```

### User Message Assembly

```javascript
// Source: smoke-test-schema.js Stage 2 + agent config patterns
function buildUserMessage(dataSlice, options = {}) {
  const parts = [];

  // DataPacket slice
  parts.push(`## DataPacket\n\n\`\`\`json\n${JSON.stringify(dataSlice, null, 2)}\n\`\`\``);

  // Section assignment (which sections to generate)
  if (options.sectionAssignment) {
    parts.push(`## Assignment\n\n${options.sectionAssignment}`);
  }

  // Prior section context (for dependent agents)
  if (options.priorSections && options.priorSections.length > 0) {
    const summaries = options.priorSections.map(s =>
      `### ${s.title} (${s.status})\n${s.summary}\nRed flags: ${s.redFlags.join('; ')}`
    ).join('\n\n');
    parts.push(`## Prior Section Findings\n\n${summaries}`);
  }

  return parts.join('\n\n---\n\n');
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `output_format` (beta) | `output_config.format` (GA) | Late 2025 | No beta header needed. SDK handles translation. |
| `betaZodOutputFormat` | `zodOutputFormat` | SDK 0.80.0 | Import from `@anthropic-ai/sdk/helpers/zod` (non-beta path) |
| `web_search_20250305` | `web_search_20260209` (with dynamic filtering) | Feb 2026 | Dynamic filtering requires code execution tool. Use `20250305` for now (simpler). |
| Claude Sonnet 4 | Claude Sonnet 4.6 | 2026 | Only 4.6+ supports structured outputs. Critical for model selection. |

**Deprecated/outdated:**
- `output_format` parameter: Still works during transition but use `output_config.format`.
- `claude-sonnet-4-20250514` / `claude-opus-4-20250514`: Do NOT support structured outputs. Use `-4-6` suffix models only.
- `betaZodOutputFormat`: Moved to `zodOutputFormat` at GA path.
- `nodeAdapter.js` for API scripts: Its fetch monkey-patch is fundamentally incompatible with the Anthropic SDK.

## Open Questions

1. **Optimal max_tokens per agent role**
   - What we know: Phase 7 smoke test used 16384 for Stage 2 (business-analyst) and produced ~$0.61 cost. Stage 1 used 8192 and worked fine for a simpler prompt.
   - What's unclear: Whether 16384 is too generous (wasting output token budget) or too tight for complex agents like financial-analyst (3 sections: S5, S7, S8). There is no rate limit penalty for higher max_tokens.
   - Recommendation: Default to 16384 for all agents. Allow per-agent override via `options.maxTokens`. Adjust after observing actual output sizes in Phase 9 validation.

2. **Whether curriculum should go in system message or user message**
   - What we know: The smoke test put the agent prompt in `system` and the DataPacket in `messages.user`. Curriculum could go in either place. Cache breakpoints work on both `system` and `messages` blocks.
   - What's unclear: Which placement produces better narrative quality. System message is "who you are"; user message is "what to do".
   - Recommendation: For Phase 8, concatenate prompt + curriculum into `system` (single text block). DataPacket + assignment into `user` (single text block). This is the simplest and mirrors the smoke test pattern. Phase 9 can optimize with cache breakpoints.

3. **Whether to bundle universal context files (rule-one-fundamentals.md, tools-for-analysis.md) with curriculum**
   - What we know: Agent configs have `universalContext: true` and `universalContextFiles` arrays. These are shared across all agents. ~18KB total.
   - What's unclear: Whether the universal context should be part of the system message or prepended to curriculum.
   - Recommendation: Prepend universal context files to the curriculum content in the system message. They provide methodology foundations that all agents need.

4. **How to handle agents that produce multiple sections**
   - What we know: `business-analyst` produces sections 1 and 2 for Pitch Deck. `financial-analyst` produces sections 5, 7, and 8. The schema is `ReportSectionSchema` (singular section).
   - What's unclear: Whether to dispatch once per section or once per agent with instructions for multiple sections.
   - Recommendation: For Phase 8 (single agent dispatch), dispatch once per section. The `sectionAssignment` option tells the agent which single section to produce. Multi-section batching is a Phase 9+ optimization.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.0 |
| Config file | none (defaults from package.json) |
| Quick run command | `npm test -- --run` |
| Full suite command | `npm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| API-01 | dispatchAgent returns validated ReportSectionSchema object | unit (mocked SDK) | `npm test -- src/engines/__tests__/aiResearch.test.js -t "dispatchAgent"` | Wave 0 |
| API-04 | extractWebSearchURLs extracts URLs from web_search_tool_result blocks | unit | `npm test -- src/engines/__tests__/aiResearch.test.js -t "extractWebSearchURLs"` | Wave 0 |
| API-04 | enrichCitationsWithURLs matches and injects URLs into citations | unit | `npm test -- src/engines/__tests__/aiResearch.test.js -t "enrichCitations"` | Wave 0 |
| API-05 | dispatchWithRetry retries on max_tokens, returns null on refusal | unit (mocked SDK) | `npm test -- src/engines/__tests__/aiResearch.test.js -t "retry"` | Wave 0 |
| API-05 | dispatchWithRetry handles rate limit (429) with backoff | unit (mocked SDK) | `npm test -- src/engines/__tests__/aiResearch.test.js -t "rate limit"` | Wave 0 |
| FIX-02 | Citations with web sources get URL field populated after enrichment | unit | `npm test -- src/engines/__tests__/aiResearch.test.js -t "citation URL"` | Wave 0 |
| API-01 | section.data is parsed from JSON string to object | unit | `npm test -- src/engines/__tests__/aiResearch.test.js -t "data parsing"` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npm test -- --run`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/engines/__tests__/aiResearch.test.js` -- covers API-01, API-04, API-05, FIX-02
- [ ] `src/engines/__tests__/fixtures/mock-api-response.json` -- mock structured output response with web_search_tool_result blocks

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All engine execution | Yes | v24.13.1 | -- |
| `@anthropic-ai/sdk` | API dispatch | Yes | 0.80.0 (^0.80.0 in package.json) | -- |
| `zod` | Schema validation | Yes | 4.3.6 | -- |
| `dotenv` | API key loading | Yes | 17.3.1 | -- |
| VITE_CLAUDE_KEY | API authentication | Yes (.env.local) | -- | -- |
| Claude API access | Structured outputs | Yes (verified in Phase 7 smoke test) | -- | -- |
| Web search enabled | API-04 | Yes (verified in Phase 7 smoke test Stage 2) | -- | -- |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** None.

**Note:** Actual SDK version in node_modules reports 0.78.0 via package.json metadata, but lockfile resolves to 0.80.0 and live API calls work (Phase 7 verified). A clean `npm ci` would resolve the metadata discrepancy.

## Sources

### Primary (HIGH confidence)
- `scripts/smoke-test-schema.js` -- Working reference implementation for API dispatch (222 lines, Phase 7)
- `src/schemas/reportSection.js` -- ReportSectionSchema with z.string() data fields (Phase 7 modified)
- [Structured Outputs - Claude API Docs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs) -- output_config.format GA, JSON Schema limitations, feature compatibility (citations incompatible), max_tokens truncation behavior, schema complexity limits
- [Web Search Tool - Claude API Docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool) -- Response structure with `web_search_tool_result` blocks, URL extraction, `max_uses` parameter, pricing ($10/1,000 searches)
- `.planning/phases/07-schema-sdk-foundation/07-EXECUTIVE-SUMMARY.md` -- Phase 7 critical discoveries (nodeAdapter, model versions, cost benchmarks)
- `.planning/phases/07-schema-sdk-foundation/07-02-SUMMARY.md` -- Detailed deviation notes (dotenv pattern, model selection)

### Secondary (MEDIUM confidence)
- `.planning/research/STACK.md` -- Complete API parameter reference, caching strategy, pricing models
- `.planning/research/PITFALLS.md` -- 12 documented pitfalls with prevention strategies
- `.planning/research/ARCHITECTURE.md` -- Parallel dispatch strategy, web search URL flow, citation enrichment pattern

### Tertiary (LOW confidence)
- None. All findings are verified against primary sources or proven in Phase 7.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- All libraries are already installed and proven in Phase 7 smoke test
- Architecture: HIGH -- Patterns are direct extractions from the working smoke test, extended with file loading and error handling
- Pitfalls: HIGH -- All pitfalls are either (a) observed in Phase 7, (b) observed in V1-V3 validation runs, or (c) confirmed in official Anthropic documentation

**Research date:** 2026-03-28
**Valid until:** 2026-04-28 (stable -- SDK 0.80.0 is GA, schema format is stable, web search tool is GA)
