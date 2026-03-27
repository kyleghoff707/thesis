# Technology Stack: Claude API Migration

**Project:** Thes1s v1.1 -- API Migration & Pitch Deck Quality
**Researched:** 2026-03-27
**Overall confidence:** HIGH
**Scope:** Focused on the 4 new capabilities needed for direct Claude API orchestration. Does NOT re-research validated infrastructure (Node.js data bridge, agent definitions, DataPacket assembly, Zod schemas).

---

## Executive Summary

The existing `@anthropic-ai/sdk@0.78.0` and `zod@4.3.6` already support everything needed for the API migration. No new dependencies are required. The SDK's `zodOutputFormat` helper, prompt caching via `cache_control`, `Promise.allSettled` for parallel dispatch, and the built-in `web_search_20250305` server tool cover all four target capabilities. The main work is upgrading the SDK to `^0.80.0` (for full `output_config` GA support) and building the orchestration layer in `aiResearch.js`.

---

## Question 1: Structured Outputs

### Does @anthropic-ai/sdk support structured outputs?

**YES.** Structured outputs are GA (generally available) on all current Claude models: Opus 4.6, Sonnet 4.6, Sonnet 4.5, Opus 4.5, Haiku 4.5. No beta header required.

**Confidence:** HIGH -- Verified against official docs and the installed SDK's type definitions.

### API Parameter

The parameter is `output_config.format` (not the older `output_format`):

```javascript
const response = await client.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 8192,
  messages: [{ role: 'user', content: prompt }],
  output_config: {
    format: {
      type: 'json_schema',
      schema: {
        type: 'object',
        properties: { /* ... */ },
        required: ['key', 'title', 'narrative'],
        additionalProperties: false,  // REQUIRED for all objects
      }
    }
  }
});

// Response is guaranteed-valid JSON in:
const parsed = JSON.parse(response.content[0].text);
```

**Migration note:** The old `output_format` parameter and `structured-outputs-2025-11-13` beta header still work during the transition period, but `output_config.format` is the GA path. The SDK helper methods (`parse()`, `zodOutputFormat()`) handle the translation internally.

### Zod Integration -- zodOutputFormat

The SDK provides a first-party `zodOutputFormat` helper that converts Zod schemas directly:

```javascript
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';

const client = new Anthropic({ apiKey: process.env.VITE_CLAUDE_KEY });

const response = await client.messages.parse({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 8192,
  messages: [{ role: 'user', content: sectionPrompt }],
  output_config: { format: zodOutputFormat(ReportSectionSchema) },
});

// Automatically parsed + Zod-validated:
console.log(response.parsed_output);  // Typed, validated object
```

**Critical finding: The existing `ReportSectionSchema` in `src/schemas/reportSection.js` works directly with `zodOutputFormat`.** Verified locally:

```
SUCCESS: zodOutputFormat works with ReportSectionSchema
Schema type: json_schema
Has parse fn: true
Top-level keys: [key, title, sectionNumber, status, confidence, verdict, ...]
```

This means the Zod schemas already written for critic.js validation can be reused as-is for constrained decoding. No schema conversion needed.

### The .parse() Method

The SDK's `client.messages.parse()` method (not `.create()`) provides:
1. Automatic `output_config` injection from `zodOutputFormat`
2. JSON parsing of the response text
3. Zod validation of the parsed result
4. A `parsed_output` property on the response with the typed result

Use `.parse()` for agent dispatch. Use `.create()` only when you need raw responses.

### JSON Schema Limitations

Structured outputs support standard JSON Schema with these constraints:

**Supported:**
- All basic types: object, array, string, integer, number, boolean, null
- `enum` (strings, numbers, bools, nulls only)
- `anyOf`, `allOf` (no `allOf` with `$ref`)
- `$ref`, `$def`, `definitions` (no external `$ref`)
- `required` and `additionalProperties` (must be `false` for objects)
- String formats: date-time, date, email, uri, uuid, etc.
- Array `minItems` (0 or 1 only)

**NOT Supported:**
- Recursive schemas
- Numerical constraints (minimum, maximum, multipleOf)
- String constraints (minLength, maxLength)
- Array constraints beyond minItems 0/1
- `additionalProperties` set to anything other than `false`

**Impact on ReportSectionSchema:** The `z.looseObject({})` fields (`data`, `charts.config`, `charts.data`) use `additionalProperties: true` internally. The `zodOutputFormat` helper's `transformJSONSchema` function converts these to be compatible. Verified working locally. However, if the API rejects the schema at runtime, the fallback is to replace `z.looseObject({})` with explicit fields or `z.record(z.string(), z.unknown())`.

### Recommendation

Use `client.messages.parse()` with `zodOutputFormat(ReportSectionSchema)` for all agent dispatch. This mechanically solves the citation format anarchy, searchesPerformed chaos, and DataPacket path fabrication issues identified in V3 validation -- the model physically cannot produce output that violates the schema.

---

## Question 2: Prompt Caching

### How does prompt caching work?

Prompt caching stores previously processed prompt segments and reuses them across API calls. Identical prompt prefixes hit the cache at 10% of the normal input token cost. No beta header required.

**Confidence:** HIGH -- Verified against official pricing page and SDK type definitions.

### API Parameters

Mark cacheable content with `cache_control` on content blocks:

```javascript
const response = await client.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 8192,
  system: [
    {
      type: 'text',
      text: agentSystemPrompt,      // ~3,000-8,000 tokens of curriculum
      cache_control: { type: 'ephemeral' }  // 5-min TTL (default)
    }
  ],
  messages: [
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: dataPacketJSON,       // ~15,000-25,000 tokens of financial data
          cache_control: { type: 'ephemeral' }
        }
      ]
    }
  ],
  tools: [
    {
      type: 'web_search_20250305',
      name: 'web_search',
      max_uses: 5,
      cache_control: { type: 'ephemeral' }  // Tool defs can be cached too
    }
  ]
});
```

### Cache Control Options

| TTL | Syntax | Write Cost | Read Cost | Use When |
|-----|--------|------------|-----------|----------|
| 5 minutes | `{ type: 'ephemeral' }` | 1.25x base | 0.1x base | Multiple agents dispatched within 5 min (our parallel dispatch pattern) |
| 1 hour | `{ type: 'ephemeral', ttl: '1h' }` | 2.0x base | 0.1x base | When re-running sections or iterating on agent output over longer sessions |

### Cache Prefix Order

Content is cached in this hierarchy (must be identical prefix to hit):
1. `tools` -- all tool definitions up to and including the breakpoint
2. `system` -- all system blocks up to and including the breakpoint
3. `messages` -- conversation history up to and including the breakpoint

**Maximum of 4 explicit breakpoints per request.**

### Minimum Cacheable Token Lengths

| Model | Minimum Tokens |
|-------|---------------|
| Claude Sonnet 4.6 | 2,048 |
| Claude Sonnet 4.5 / 4 | 1,024 |
| Claude Opus 4.6 / 4.5 | 4,096 |
| Claude Haiku 4.5 | 4,096 |

If the minimum is not met, the request succeeds but no caching occurs. Check the response `usage` fields.

### Response Usage (Cache Diagnostics)

```javascript
{
  usage: {
    input_tokens: 50,              // Tokens AFTER last cache breakpoint
    cache_read_input_tokens: 15000, // Tokens retrieved from cache (90% savings)
    cache_creation_input_tokens: 248, // Tokens newly written to cache
    output_tokens: 4000,
    cache_creation: {
      ephemeral_5m_input_tokens: 15248,  // Total 5-min cached
      ephemeral_1h_input_tokens: 0,      // Total 1-hr cached
    }
  }
}
```

### Pricing Impact for Thes1s

Using Claude Sonnet 4 ($3/MTok input, $15/MTok output):

| Scenario | Input Cost | Notes |
|----------|------------|-------|
| No caching (9 agents, ~20K shared tokens each) | $0.54 for shared content | 180K tokens at $3/MTok |
| With caching (first agent writes, 8 agents read) | $0.12 for shared content | 20K write at $3.75/MTok + 160K read at $0.30/MTok |
| **Savings** | **78% on shared input** | Cache the system prompt + Rule One curriculum + DataPacket |

### Caching Strategy for Thes1s

**What to cache (high payoff):**
1. **Rule One curriculum** (~2,000 tokens) -- Shared by all 9 agents. Put in system message with `cache_control`.
2. **DataPacket JSON** (~15,000-25,000 tokens) -- Identical for all agents analyzing the same ticker. Put as first user message content block with `cache_control`.
3. **Tool definitions** (~500 tokens) -- Same web search + custom tool defs for all agents. Put `cache_control` on the last tool.

**What NOT to cache:**
- Agent-specific curriculum (varies per agent, defeats caching)
- Prior section outputs (unique per dispatch, small enough to not matter)

**Optimal pattern:** Structure prompts so the cacheable prefix (curriculum + DataPacket) comes first, and the agent-specific content (section assignment, prior outputs) comes last. This maximizes cache hit rate across parallel dispatches.

### Recommendation

Use 5-minute cache TTL (`{ type: 'ephemeral' }`) for parallel agent dispatch. Place the shared Rule One curriculum and DataPacket in the system message / first user message with cache breakpoints. This targets the $14 to $8-12 cost reduction goal without code complexity.

---

## Question 3: Parallel Agent Dispatch

### What's the best pattern for parallel dispatch in Node.js?

**`Promise.allSettled` -- already the pattern used in `dataExport.js`.**

**Confidence:** HIGH -- This is standard Node.js async/await, no library needed.

### Pattern

```javascript
// Dispatch all 9 agents in parallel
const agentPromises = agentConfigs.map(agent =>
  dispatchAgent(agent, dataPacket, sharedContext)
);

// Promise.allSettled: all resolve, even if individual agents fail
const results = await Promise.allSettled(agentPromises);

// Process results -- partial success is acceptable
const sections = [];
const errors = [];

for (const result of results) {
  if (result.status === 'fulfilled') {
    sections.push(result.value);
  } else {
    errors.push(result.reason);
  }
}
```

### Why Promise.allSettled (not Promise.all)

| Method | On First Failure | Use Case |
|--------|-----------------|----------|
| `Promise.all` | Rejects immediately, cancels remaining | When ALL must succeed |
| `Promise.allSettled` | Waits for all, reports each | When partial success is acceptable |

For Thes1s, partial success IS acceptable. If the Risk Analyst fails but 8 other agents succeed, you want those 8 sections. The V3 validation already demonstrated this -- individual section failures don't invalidate the entire report.

### Concurrency Control

The Anthropic API has rate limits per tier. For parallel dispatch of 9 agents, no throttling is needed at Tier 1 (60 requests/min, 80K tokens/min). If rate-limited, add a simple semaphore:

```javascript
// Simple concurrency limiter -- no external dependency needed
function createSemaphore(limit) {
  let active = 0;
  const queue = [];

  return function throttle(fn) {
    return new Promise((resolve, reject) => {
      const run = async () => {
        active++;
        try { resolve(await fn()); }
        catch (e) { reject(e); }
        finally {
          active--;
          if (queue.length > 0) queue.shift()();
        }
      };
      if (active < limit) run();
      else queue.push(run);
    });
  };
}

// Usage: limit to 4 concurrent API calls
const throttle = createSemaphore(4);
const results = await Promise.allSettled(
  agentConfigs.map(agent => throttle(() => dispatchAgent(agent, dataPacket)))
);
```

### Dispatch Groups (Dependency-Aware)

Not all agents can run simultaneously -- some need outputs from others:

```
Group 1 (parallel): Financial Analyst, Business Analyst, Competitor Evaluator,
                     Management Evaluator, Risk Analyst
Group 2 (after Group 1): Valuation Specialist (needs Financial Analyst output for FGR)
Group 3 (after Group 2): Synthesis Writer (needs all prior section outputs)
```

```javascript
// Group 1: Independent agents
const group1 = await Promise.allSettled([
  dispatchAgent('financial-analyst', ...),
  dispatchAgent('business-analyst', ...),
  dispatchAgent('competitor-evaluator', ...),
  dispatchAgent('management-evaluator', ...),
  dispatchAgent('risk-analyst', ...),
]);

// Group 2: Depends on Group 1
const group2 = await Promise.allSettled([
  dispatchAgent('valuation-specialist', ..., { priorSections: extractSections(group1) }),
]);

// Group 3: Depends on all
const group3 = await Promise.allSettled([
  dispatchAgent('synthesis-writer', ..., { priorSections: extractSections([...group1, ...group2]) }),
]);
```

### Runtime Estimate

Current CC subagent pipeline: ~2.5 hours (agents run sequentially with CC overhead).
Target with parallel API dispatch: ~30-40 minutes.

| Phase | Duration | Bottleneck |
|-------|----------|------------|
| DataPacket assembly | ~2-3 min | EDGAR API rate limits |
| Group 1 (5 agents parallel) | ~10-15 min | Longest agent (web search agents take longer) |
| Group 2 (valuation) | ~5-8 min | Single agent, moderate complexity |
| Group 3 (synthesis) | ~5-10 min | Single agent, reads all prior output |
| **Total** | **~22-36 min** | **Within 30-40 min target** |

### Recommendation

Use `Promise.allSettled` with 3 dispatch groups. No external concurrency library needed. The existing `dataExport.js` already uses `Promise.allSettled` for engine calls, so this is a proven pattern in the codebase.

---

## Question 4: Web Search via tool_use

### How does tool_use work for web search?

Web search is a **server tool** -- Anthropic executes the search on their infrastructure. You include it in the `tools` array, and the API handles the search + result injection automatically. No client-side search execution needed.

**Confidence:** HIGH -- Verified against official docs and SDK type definitions. Both `WebSearchTool20250305` and `WebSearchTool20260209` interfaces exist in the installed SDK.

### API Parameters

```javascript
const response = await client.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 8192,
  messages: [{ role: 'user', content: sectionPrompt }],
  tools: [
    {
      type: 'web_search_20250305',   // Server tool type
      name: 'web_search',
      max_uses: 5,                   // Limit searches per request (cost control)
      // Optional domain filtering:
      // allowed_domains: ['sec.gov', 'reuters.com', 'wsj.com'],
      // blocked_domains: ['reddit.com'],
    }
  ],
  output_config: {
    format: zodOutputFormat(ReportSectionSchema),
  },
});
```

### Two Tool Versions

| Version | Type String | Features | Best For |
|---------|------------|----------|----------|
| Basic | `web_search_20250305` | Standard web search | Sonnet 4 agents (our default) |
| Dynamic Filtering | `web_search_20260209` | Code execution filters results before context | Opus 4.6 / Sonnet 4.6 agents (reduces token waste) |

**Dynamic filtering** (`web_search_20260209`) requires the code execution tool to also be enabled. It lets Claude write code to filter search results before they enter the context window, keeping only relevant content. This reduces token consumption on search-heavy agents.

For initial implementation, use `web_search_20250305` (basic). Upgrade to `web_search_20260209` later if token costs from search results are excessive.

### Response Structure

The response includes actual URLs and cited text:

```javascript
// In response.content array:
{
  type: 'server_tool_use',
  id: 'srvtoolu_...',
  name: 'web_search',
  input: { query: 'SFM Sprouts Farmers Market competitive landscape 2025' }
}

// Followed by:
{
  type: 'web_search_tool_result',
  tool_use_id: 'srvtoolu_...',
  content: [
    {
      type: 'web_search_result',
      url: 'https://www.reuters.com/...',
      title: 'Sprouts Farmers Market...',
      encrypted_content: '...',       // Encrypted -- for multi-turn only
      page_age: 'March 15, 2026'
    }
  ]
}

// Claude's text blocks include inline citations:
{
  type: 'text',
  text: 'Sprouts Farmers Market holds approximately 1.5% of the US grocery market',
  citations: [
    {
      type: 'web_search_result_location',
      url: 'https://www.reuters.com/...',
      title: 'Sprouts Farmers Market...',
      cited_text: 'Sprouts commands roughly 1.5% share...'
    }
  ]
}
```

### Extracting Citation URLs

The citations in the response contain actual URLs. This directly solves the "web citation laundering" issue from V3 validation:

```javascript
function extractWebCitations(response) {
  const citations = [];
  for (const block of response.content) {
    if (block.citations) {
      for (const cite of block.citations) {
        if (cite.type === 'web_search_result_location') {
          citations.push({
            url: cite.url,
            title: cite.title,
            citedText: cite.cited_text,
          });
        }
      }
    }
  }
  return citations;
}
```

### Pricing

- **$10 per 1,000 searches** ($0.01 per search)
- Plus standard token costs for search result content (counted as input tokens)
- Search results that return errors are not billed

For a Pitch Deck with 5 web-searching agents at 5 searches each: 25 searches = $0.25 per company. Negligible compared to token costs.

### searchesPerformed Schema Compliance

With structured outputs, the `searchesPerformed` field in `ReportSectionSchema` is mechanically enforced. The response's `usage.server_tool_use.web_search_requests` count can be cross-referenced against what the agent reports in `searchesPerformed.length` for quality validation.

### Recommendation

Use `web_search_20250305` for all agents that need web search capability (Business Analyst, Management Evaluator, Risk Analyst, Valuation Specialist, Competitor Evaluator). Set `max_uses: 5` to control cost. Extract citation URLs from `response.content[].citations[]` for the citation system. This mechanically solves the citation URL verification issue.

---

## Question 5: New Dependencies Needed

### Short Answer: None.

The existing stack already has everything needed:

| Capability | Already Have | Version | Status |
|-----------|-------------|---------|--------|
| Claude API client | `@anthropic-ai/sdk` | ^0.78.0 (installed) | Upgrade to ^0.80.0 recommended |
| Zod schemas | `zod` | 4.3.6 (installed) | No change needed |
| zodOutputFormat helper | `@anthropic-ai/sdk/helpers/zod` | Included in SDK | No change needed |
| Prompt caching | `cache_control` parameter | In SDK types | No change needed |
| Web search tool | `WebSearchTool20250305` | In SDK types | No change needed |
| Parallel dispatch | `Promise.allSettled` | Native Node.js | No change needed |
| Environment config | `dotenv` | 17.3.1 (installed) | No change needed |
| DOM parsing (Node) | `linkedom` | 0.18.12 (installed) | No change needed |
| Token estimation | `contextBudget.js` | Already built | No change needed |
| Budget tracking | `contextBudget.js` | Already built | No change needed |

### SDK Version Upgrade

Upgrade `@anthropic-ai/sdk` from `^0.78.0` to `^0.80.0`:

```bash
npm install @anthropic-ai/sdk@latest
```

The `^0.78.0` semver range already covers 0.80.0, so `npm install` should pull it automatically. But an explicit update ensures the latest fixes for `output_config` GA support.

Key changes from 0.78.0 to 0.80.0 (verified from npm):
- Full `output_config.format` GA support (no beta header needed)
- `zodOutputFormat` at non-beta path (`@anthropic-ai/sdk/helpers/zod`)
- `client.messages.parse()` method available
- `WebSearchTool20260209` type added

### What NOT to Add

| Library | Why Not |
|---------|---------|
| `@anthropic-ai/claude-agent-sdk` | Was in the original STACK.md for the dual-path approach. The v1.1 milestone is API-only. Agent SDK would add CC orchestration overhead that the migration specifically aims to eliminate. |
| `langchain` / `@langchain/anthropic` | Unnecessary abstraction layer. The SDK's `messages.parse()` + `zodOutputFormat` already provides type-safe structured outputs. |
| `@ai-sdk/anthropic` (Vercel AI SDK) | Chat UI focused. No structured output enforcement. No `parse()` method. |
| `p-limit` / `p-queue` | Concurrency control for Promise.allSettled. A 15-line semaphore function handles this without a dependency. |
| `tiktoken` / `@anthropic-ai/tokenizer` | The API returns actual token counts in `response.usage`. Use `contextBudget.js` estimates for pre-dispatch budgeting, API response for post-dispatch tracking. |
| `retry` / `p-retry` | Simple retry logic (exponential backoff) is ~10 lines of code. Not worth a dependency. |
| `zod-to-json-schema` | Deprecated. `zodOutputFormat` uses Zod v4's native `z.toJSONSchema()` internally. |

---

## Recommended Stack (Summary)

### Core (No Changes)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `@anthropic-ai/sdk` | ^0.80.0 (upgrade from 0.78.0) | Claude API client with structured outputs, caching, web search | First-party SDK. Has `messages.parse()`, `zodOutputFormat`, `cache_control` types, `WebSearchTool` types. Everything needed. |
| `zod` | 4.3.6 (already installed) | Schema definition + runtime validation | `zodOutputFormat` uses `z.toJSONSchema()` internally. ReportSectionSchema already works. |

### Already Built (Reuse As-Is)

| Module | Purpose | Reuse Strategy |
|--------|---------|---------------|
| `src/schemas/reportSection.js` | Report section Zod schema | Pass directly to `zodOutputFormat()` for structured outputs |
| `src/engines/contextBudget.js` | Token estimation + cost tracking | Use for pre-dispatch budgeting. Update `MODEL_PRICING` with cache pricing. |
| `src/engines/dataExport.js` | DataPacket assembly | Call `assembleDataPacket(ticker)` before agent dispatch |
| `src/engines/nodeAdapter.js` | Node.js environment shims | Already handles dotenv, proxy mapping, DOM parsing |
| `agents/*/config.json` | Agent role configuration | Read `sections`, `tools`, `model`, `curriculum`, `dataPacketSlice` |
| `agents/*/prompt.md` | Agent system prompts | Load as system message content for `messages.parse()` |
| `src/engines/critic.js` | Quality validation | Run on each section AFTER structured output parsing |

### New (To Build)

| Module | Purpose | Key APIs Used |
|--------|---------|---------------|
| `src/engines/aiResearch.js` | Orchestration layer: dispatches agents, manages caching, collects results | `client.messages.parse()`, `zodOutputFormat()`, `cache_control`, `web_search_20250305` |

This is the ONLY new file. It imports from existing modules (schemas, contextBudget, agent configs) and calls the Claude API.

---

## Integration Patterns

### Pattern 1: Agent Dispatch with Structured Output + Caching

```javascript
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { ReportSectionSchema } from '../schemas/reportSection.js';
import { getEnv } from './nodeAdapter.js';

const client = new Anthropic({ apiKey: getEnv('VITE_CLAUDE_KEY') });

async function dispatchAgent(agentConfig, dataPacket, priorSections = []) {
  const systemPrompt = await loadPrompt(agentConfig.role);
  const curriculum = await loadCurriculum(agentConfig.curriculum);
  const dataSlice = sliceDataPacket(dataPacket, agentConfig.dataPacketSlice);

  const tools = [];
  if (agentConfig.tools?.includes('web_search')) {
    tools.push({
      type: 'web_search_20250305',
      name: 'web_search',
      max_uses: 5,
      cache_control: { type: 'ephemeral' },
    });
  }

  const response = await client.messages.parse({
    model: agentConfig.model === 'opus'
      ? 'claude-opus-4-6'
      : 'claude-sonnet-4-20250514',
    max_tokens: 8192,
    system: [
      {
        type: 'text',
        text: `${systemPrompt}\n\n${curriculum}`,
        cache_control: { type: 'ephemeral' },
      }
    ],
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: JSON.stringify(dataSlice),
            cache_control: { type: 'ephemeral' },
          },
          {
            type: 'text',
            text: buildSectionAssignment(agentConfig, priorSections),
            // No cache_control -- this varies per agent
          }
        ]
      }
    ],
    tools,
    output_config: { format: zodOutputFormat(ReportSectionSchema) },
  });

  return {
    section: response.parsed_output,
    usage: response.usage,
    webCitations: extractWebCitations(response),
  };
}
```

### Pattern 2: Parallel Dispatch with Budget Tracking

```javascript
import { createBudgetTracker } from './contextBudget.js';

async function generatePitchDeck(ticker) {
  const dataPacket = await assembleDataPacket(ticker);
  const budget = createBudgetTracker();

  // Group 1: Independent agents (parallel)
  const group1Results = await Promise.allSettled([
    dispatchAgent(agents['financial-analyst'], dataPacket),
    dispatchAgent(agents['business-analyst'], dataPacket),
    dispatchAgent(agents['competitor-evaluator'], dataPacket),
    dispatchAgent(agents['management-evaluator'], dataPacket),
    dispatchAgent(agents['risk-analyst'], dataPacket),
  ]);

  const group1Sections = collectSections(group1Results);
  trackBudget(budget, group1Results);

  // Group 2: Depends on Group 1
  const group2Results = await Promise.allSettled([
    dispatchAgent(agents['valuation-specialist'], dataPacket, group1Sections),
  ]);

  const allSections = [...group1Sections, ...collectSections(group2Results)];
  trackBudget(budget, group2Results);

  // Group 3: Synthesis
  const group3Results = await Promise.allSettled([
    dispatchAgent(agents['synthesis-writer'], dataPacket, allSections),
  ]);

  trackBudget(budget, group3Results);

  return {
    sections: [...allSections, ...collectSections(group3Results)],
    budget: budget.getSummary(),
  };
}
```

---

## contextBudget.js Updates Needed

The existing `contextBudget.js` needs pricing updates for cache-aware cost tracking:

```javascript
// Add to MODEL_PRICING:
export const MODEL_PRICING = {
  'claude-sonnet-4-20250514': {
    input: 3.0,
    output: 15.0,
    cacheWrite5m: 3.75,    // 1.25x input
    cacheWrite1h: 6.0,     // 2.0x input
    cacheRead: 0.30,       // 0.1x input
  },
  'claude-opus-4-6': {
    input: 5.0,
    output: 25.0,
    cacheWrite5m: 6.25,    // 1.25x input
    cacheWrite1h: 10.0,    // 2.0x input
    cacheRead: 0.50,       // 0.1x input
  },
};

// Add web search cost tracking:
export const WEB_SEARCH_COST = 0.01; // $0.01 per search
```

---

## Existing companyAdapter.js: Migration Path

The existing `companyAdapter.js` uses raw `fetch()` with the `anthropic-dangerous-direct-browser-access` header. For the API migration, this should eventually migrate to the SDK client. But it works and is not blocking -- leave it as-is for v1.1, migrate in a future cleanup pass.

Key difference: `companyAdapter.js` runs in the **browser** (Vite dev server / Tauri webview). The new `aiResearch.js` runs in **Node.js** (via nodeAdapter.js). They use different API access patterns:
- Browser: `fetch()` with `anthropic-dangerous-direct-browser-access` header
- Node.js: `new Anthropic({ apiKey })` SDK client (no browser header needed)

---

## Sources

- [Structured Outputs - Claude API Docs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs) -- output_config.format GA, JSON Schema limitations, Zod integration
- [Prompt Caching - Claude API Docs](https://platform.claude.com/docs/en/build-with-claude/prompt-caching) -- cache_control, TTL options, pricing multipliers, minimum token lengths
- [Web Search Tool - Claude API Docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool) -- tool type strings, max_uses, response structure, citation format
- [Pricing - Claude API Docs](https://platform.claude.com/docs/en/about-claude/pricing) -- Model pricing, cache pricing, web search $10/1000 searches
- [@anthropic-ai/sdk npm](https://www.npmjs.com/package/@anthropic-ai/sdk) -- SDK v0.80.0, peer dependency on Zod ^3.25.0 || ^4.0.0
- [Anthropic SDK TypeScript - DeepWiki](https://deepwiki.com/anthropics/anthropic-sdk-typescript) -- zodOutputFormat, betaZodTool, helper paths
- [Introducing web search on the Anthropic API](https://claude.com/blog/web-search-api) -- Web search announcement, dynamic filtering
- [Anthropic Launches Structured Outputs](https://techbytes.app/posts/claude-structured-outputs-json-schema-api/) -- Constrained decoding explanation
- Local verification: `node -e "..."` tests confirming zodOutputFormat + ReportSectionSchema compatibility
