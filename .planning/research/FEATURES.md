# Feature Landscape: Claude API Orchestration Layer (v1.1 Migration)

**Domain:** Multi-agent AI orchestration for investment research report generation
**Researched:** 2026-03-27
**Mode:** Ecosystem research for API migration from Claude Code subagent to direct Claude API
**Confidence:** HIGH (official docs verified all capabilities)

---

## Table Stakes

Features the orchestration layer MUST have. Missing any of these means the migration fails or produces worse results than the current CC skill approach.

| Feature | Why Required | Complexity | Dependencies | Notes |
|---------|-------------|------------|--------------|-------|
| **Structured JSON outputs** | Mechanically solves 4/6 V3 persistent issues (citation format, red flags type, searchesPerformed format, field completeness). Eliminates two-pass output pattern. | Medium | `@anthropic-ai/sdk >=0.80`, Zod v4, ReportSectionSchema adaptation | Schema must use `additionalProperties: false` on all objects. `z.looseObject({})` in current schema is INCOMPATIBLE -- must convert `data`, `config`, `ChartSchema.data` to explicit typed objects or use `z.record()` with strict wrapper. `minItems: 1` on redFlags IS supported. |
| **Parallel agent dispatch** | Runtime: 2.5hr sequential -> ~30-40min parallel. Core value proposition of the migration. | Low | `Promise.allSettled()`, rate limit awareness | Already proven pattern in `dataExport.js`. Pitch deck has 7 unique agents across 10 sections. Phase 1 (2 agents), Phase 2 (3 agents), Phase 3 (2 agents + synthesis) can all parallelize within-phase. |
| **Prompt caching** | Cost: ~$14 uncached -> ~$8-9 cached. Shared context (curriculum + DataPacket + PSR findings) repeats across 7+ agents. Without caching, each agent re-pays full input price for identical content. | Medium | Cache breakpoint placement strategy, minimum token thresholds (2048 for Sonnet, 4096 for Opus) | Max 4 explicit cache breakpoints per request. Content must be placed identically and at prompt start across agents. Cache lasts 5 min (1.25x write) or 1 hour (2x write), reads always 0.1x. |
| **Web search tool** | Agents need real-time web data for competitor analysis, PEST risks, industry trends, management reputation. V3 had 53 web searches. API web search returns actual URLs in results -- solves citation URL laundering. | Low | Web search enabled in Claude Console, `web_search_20260209` tool type | $10/1000 searches. `max_uses` parameter controls cost per agent. Search results include `url`, `title`, `page_age`, `encrypted_content`. Citations auto-generated with source URLs. |
| **Error handling + retry logic** | API calls fail (rate limits, timeouts, 5xx). A 10-section pipeline with no retry = frequent full failures. | Medium | Exponential backoff, per-agent isolation, partial result recovery | Must handle: rate limits (429), overloaded (529), server errors (500), timeout. Each agent failure should not crash the pipeline -- use `Promise.allSettled()` and report partial results. |
| **DataPacket path reference** | Agents fabricate DataPacket paths when citing values. Must include actual field paths in agent prompts. Not solved by API migration alone -- this is a prompt-level fix. | Low | DataPacket schema introspection, path enumeration function | Generate a "DataPacket Field Reference" block listing all available top-level and second-level paths. Include in every agent's system prompt. |
| **Token budget tracking** | Must track input/output tokens per agent and total pipeline cost. Existing `contextBudget.js` needs pricing update. | Low | Update `MODEL_PRICING` constants for Opus 4.6 ($5/$25) and Sonnet 4.6 ($3/$15). Add cache hit/miss tracking. | API response includes `usage.cache_read_input_tokens`, `usage.cache_creation_input_tokens`. Wire these into budget tracker. |

---

## Differentiators

Features that make the migration BETTER than the CC skill approach, beyond just fixing V3 issues.

| Feature | Value Proposition | Complexity | Dependencies | Notes |
|---------|-------------------|------------|--------------|-------|
| **Streaming progress** | Show real-time agent progress to the PM instead of 30+ min black box. Each agent streams its output as it generates. | Medium | SSE/streaming API, UI progress component | API supports streaming with `stream: true`. Agent thinking, tool use, and text blocks stream in order. Could show "Financial Analyst: writing FCF analysis..." in real-time. |
| **Batch API (50% output discount)** | PSR agents (annual readers, quarterly readers) don't need real-time results -- they could run as a batch at 50% output token discount. PSR is the biggest cost driver. | High | Asynchronous batch submission, polling for results, 24hr completion window | Batch API: Sonnet input $1.50/MTok, output $7.50/MTok (vs $3/$15 standard). PSR reads 5-7 filings at ~70K tokens each = ~350-490K input tokens. 50% output discount on ~30K output tokens saves ~$0.22 per PSR run. Marginal savings but meaningful at scale. Adds complexity. |
| **Dynamic web search filtering** | `web_search_20260209` tool with code execution filters search results BEFORE they enter context. Reduces irrelevant token consumption. | Low | Code execution tool must also be enabled alongside web search | Free when used with web search. Reduces token waste from irrelevant search results -- particularly valuable for PEST analysis and competitor research where broad queries return noise. |
| **Strict tool_use validation** | Custom tools (getMetric, computeMOS, sensitivityTable) can use `strict: true` to guarantee schema-valid tool inputs from agents. Prevents malformed tool calls. | Low | Define JSON schemas for each custom tool's input_schema | Financial-analyst and valuation-specialist use 5+ custom tools. Strict validation means no more invalid `computeMOS({ fgr: "high" })` calls. |
| **1-hour cache TTL** | For iterative runs (PM requests re-generation of specific sections), 1-hour cache means curriculum + DataPacket stays cached between runs. | Low | Use `ttl: "1h"` on cache_control for stable content | 2x write cost but 0.1x reads. Break-even after 2 reads. If PM iterates on a section 2+ times within an hour, this pays for itself. |
| **Agent SDK structured outputs** | The Claude Agent SDK provides `structured_output` on agent completion -- the agent can use any tools during execution and still return validated JSON at the end. | Medium | `@anthropic-ai/sdk` Agent SDK, or manual multi-turn tool loop | This is the pattern for agents that need to search, compute, AND return structured JSON. The agent does its tool_use work, then the final response conforms to the output schema. |
| **Zod-native schema integration** | SDK supports `zodOutputFormat()` helper -- pass Zod schemas directly instead of converting to JSON Schema manually. TypeScript type safety on parsed outputs. | Low | `@anthropic-ai/sdk >=0.80`, Zod v4 peer dependency | The `getReportSectionJSONSchema()` function already exists in `reportSection.js`. SDK's `zodOutputFormat()` wraps this automatically. Use `client.messages.parse()` for auto-validated responses. |

---

## Anti-Features

Features to explicitly NOT build. These seem attractive but add complexity without proportional value, or actively harm the system.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Claude Citations feature** | Citations feature (`citations: true`) is INCOMPATIBLE with structured outputs (`output_config.format`). Returns 400 error. Cannot use both. | Keep the existing manual citation schema (`CitationSchema` with id/ref/text/source). Agents populate citation fields in structured JSON. Web search URLs come from tool_result content, not the Citations feature. |
| **Multi-turn agent conversations** | Complex stateful agent loops where each agent has a multi-turn conversation. Adds latency, complexity, and cost. Most analysis sections can be completed in a single response. | Single-turn with tools: agent gets system prompt + user message, uses web search and custom tools during its turn, returns structured JSON. Only PSR agents might need multi-turn (for very large filings), but even those work single-turn with the pre-processed filing markdown. |
| **Inter-agent real-time communication** | Agents "talking" to each other during generation. The orchestrator already handles information flow via phased dispatch (Phase 1 findings feed Phase 2 context). | Use the existing phased dispatch pattern: Phase 1 agents produce findings, orchestrator extracts cross-cutting findings and includes them in Phase 2/3 agent context. Sequential dependency, not real-time chat. |
| **Extended thinking** | Extended thinking blocks add significant output token cost. For analytical sections, the structured output schema already forces the model to think through the analysis (verdict, rationale, narrative, citations, red flags). | Use standard generation. The narrative field IS the model's thinking. If a section needs deeper reasoning, increase max_tokens and trust the prompt + curriculum to guide depth. |
| **Fast mode (6x pricing)** | $30/$150 per MTok for Opus 4.6 fast mode. A full pipeline would cost $80+ per company. | Use standard mode. 30-40 min is acceptable for a research report that replaces 70+ hours of manual work. Speed is not the bottleneck -- quality is. |
| **Custom tool for every engine function** | Exposing all 20+ engine functions as API tools. Most agents don't need them -- they get pre-computed data in the DataPacket. | Expose only the tools listed in each agent's `config.json` `tools` array. Financial-analyst gets 8 tools, valuation-specialist gets 5, business-analyst gets 0. The DataPacket already contains computed results for most fields. |
| **Full filing text in API context** | Sending raw 10-K text (300KB+) through the API instead of using pre-processed filing markdown. | Continue using `scripts/prepare-data.js` to pre-process filings to markdown. PSR agents receive the pre-processed JSON sections. This saves ~60% of tokens vs raw HTML/text. |

---

## Feature Dependencies

```
DataPacket assembly (existing)
  -> DataPacket path reference generator (new)
     -> Agent prompt builder (new)

ReportSectionSchema adaptation (existing schema, needs fixes)
  -> Structured output format config (new)
     -> Agent dispatch function (new)

Prompt caching strategy
  -> Cache breakpoint placement in prompt builder
     -> Parallel dispatch within phases

Web search tool setup
  -> Citation URL extraction from tool_result
     -> Post-processing: inject URLs into citation.source

Error handling / retry
  -> Per-agent result tracking
     -> Partial result recovery
        -> Quality validation (existing critic.js)

Token budget tracking (existing contextBudget.js)
  -> Updated pricing constants
  -> Cache hit/miss accounting
     -> Cost reporting
```

---

## Critical Technical Details

### 1. Structured Outputs + Tool Use: YES, They Work Together

Verified from official docs: "JSON outputs and strict tool use solve different problems and can be used together. When combined, Claude can call tools with guaranteed-valid parameters AND return structured JSON responses."

**How it works:** The grammar applies only to Claude's direct output (the final JSON response), not to tool_use calls or tool_result blocks. An agent can:
1. Receive system prompt + user message with `output_config.format` specifying the JSON schema
2. Call `web_search` tool multiple times during its turn
3. Call custom tools (`computeMOS`, `sensitivityTable`) during its turn
4. Return its final response as validated JSON matching the ReportSectionSchema

This eliminates the two-pass output pattern entirely. The model doesn't need to "write prose first, then JSON" -- structured outputs guarantee the JSON is valid, and the narrative field within that JSON can be as long as needed.

### 2. Structured Outputs + Citations: NO, Incompatible

"Citations require interleaving citation blocks with text, which conflicts with strict JSON schema constraints. Returns 400 error if citations enabled with output_config.format."

This means we CANNOT use the Claude Citations feature. Our existing manual citation approach (CitationSchema as a JSON array within the section) is the correct pattern. Web search URLs will be available from the tool_result content blocks -- agents must be prompted to extract and include them in citation `source` fields.

### 3. Prompt Caching: Exact Mechanics

**Minimum tokens:** Sonnet 4.6 = 2,048; Opus 4.6 = 4,096. Below minimum = silently skipped.

**Max breakpoints:** 4 per request. Recommended layout for our agents:
1. Tool definitions (web_search + custom tools) -- Breakpoint 1
2. System prompt (curriculum + universal context) -- Breakpoint 2
3. Shared context (DataPacket slice + PSR findings) -- Breakpoint 3
4. Per-agent task instruction -- NOT cached (varies per section)

**Cache invalidation:** Changing tool definitions, web search toggle, or output_config.format invalidates the cache. All agents using the same tool set and output schema should share cache hits.

**Pricing math for Thes1s pitch deck:**
- Curriculum + universal context: ~20K tokens (shared across 7 agents)
- DataPacket (varies by agent slice): ~15-50K tokens
- PSR findings: ~30K tokens (shared across Phase 1-3 agents)
- Per-agent instruction: ~2-5K tokens (not cached)

### 4. ReportSectionSchema: Required Adaptations

The current schema has two incompatibilities with structured outputs:

**Problem 1:** `z.looseObject({})` generates `additionalProperties: true`. Structured outputs require `additionalProperties: false` on ALL objects.

**Fix:** Replace `z.looseObject({})` in these fields:
- `data` field -> Use `z.record(z.string(), z.unknown())` or define explicit per-section data schemas
- `ChartSchema.config` -> Define explicit chart config schema
- `ChartSchema.data` items -> Define explicit chart data schema
- `StageReportSchema.checkpoints[].userInput` -> Use `z.record(z.string(), z.unknown())`

**Problem 2:** `z.record(z.unknown())` may not be supported. Structured outputs support `additionalProperties: false` but NOT arbitrary `additionalProperties` values.

**Best solution:** Define per-section `data` schemas. Each section type (radar, fcf, pest, valuation) has a known data structure. Create section-specific Zod schemas:
```
ReportSectionSchema(sectionKey) -> uses sectionKey-specific data schema
```
This is more work upfront but produces better validation downstream.

**Problem 3:** `.min(1)` on `redFlags` array -- this IS supported (`minItems` of 0 and 1 only). No change needed.

### 5. Web Search: Cost and URL Extraction

**Pricing:** $10 per 1,000 searches = $0.01 per search.
V3 used 53 searches across 10 sections. At $0.01/search = $0.53 per company for web search fees.

**URL extraction:** Web search tool_result includes `url` field on every `web_search_result`. The agent sees these URLs and can include them in citation `source` fields. The prompt must instruct: "When citing web search findings, use the exact URL from the search result, not a paraphrase of the source name."

**max_uses parameter:** Controls searches per agent turn. Recommend:
- business-analyst: `max_uses: 8`
- competitor-evaluator: `max_uses: 8`
- management-evaluator: `max_uses: 8`
- risk-analyst: `max_uses: 10` (PEST needs more research)
- financial-analyst: `max_uses: 4` (mostly DataPacket-driven)
- valuation-specialist: `max_uses: 5`
- synthesis-writer: `max_uses: 0` (no web search, reads section files)

Total budget: ~51 searches max = ~$0.51 per company.

### 6. Parallel Dispatch: Concrete Phase Plan

Current CC skill dispatches sequentially (RAM constraint). API has no such constraint.

**PSR Phase (sequential -- each year feeds the next):**
- Annual readers: sequential, oldest first (5-7 agents, ~2-3 min each on Sonnet)
- Quarterly readers: sequential batches (1-2 agents, ~3-4 min each)
- PSR total: ~15-20 min (partially parallelizable -- annual + quarterly could overlap)

**Generation Phase 1 (parallel):**
- business-analyst (sections 1, 2) -- Sonnet
- competitor-evaluator (sections 3, 4) -- Sonnet
- These two agents have NO dependencies on each other.
- Phase 1 total: ~4-6 min (wall clock)

**Generation Phase 2 (partially parallel):**
- financial-analyst (sections 5, 7, 8) -- Sonnet
- management-evaluator (section 6) -- Sonnet
- These can run in parallel. They consume Phase 1 cross-cutting findings.
- Phase 2 total: ~5-8 min (wall clock for longest agent)

**Generation Phase 3 (parallel):**
- risk-analyst (section 9) -- Opus
- valuation-specialist (section 10) -- Opus
- These consume Phase 1 + Phase 2 findings.
- Phase 3 total: ~5-8 min (Opus is slower)

**Synthesis Phase:**
- synthesis-writer -- Opus, consumes all 10 sections
- ~3-5 min

**Total estimated wall clock: 30-40 min** (down from 2.5 hours sequential)

---

## Cost Model: Detailed Estimate

### Current State (CC Skill, V3)
| Component | Cost |
|-----------|------|
| PSR (5 annual + 2 quarterly, Sonnet) | ~$4.00 |
| 7 analysis agents (mixed Sonnet/Opus) | ~$6.00 |
| Synthesis writer (Opus) | ~$2.00 |
| CC overhead (tool calls, state management) | ~$20.00 |
| **Total** | **~$32.00** |

### Projected State (API with Caching)

**Pricing used:**
- Sonnet 4.6: $3/$15 MTok (input/output), cache reads $0.30/MTok
- Opus 4.6: $5/$25 MTok (input/output), cache reads $0.50/MTok
- Web search: $0.01/search

**PSR agents (no caching benefit -- each reads different filings):**

| Agent | Model | Input (tokens) | Output (tokens) | Cost |
|-------|-------|---------------|-----------------|------|
| 5x annual-reader | Sonnet | 5 x 80K = 400K | 5 x 8K = 40K | $1.80 |
| 2x quarterly-reader | Sonnet | 2 x 120K = 240K | 2 x 10K = 20K | $1.02 |
| **PSR subtotal** | | **640K** | **60K** | **$2.82** |

**Analysis agents (WITH caching):**

Shared cached context per agent: curriculum (~20K) + universal files (~8K) + PSR findings (~30K) = ~58K tokens.
First agent pays cache write (1.25x), remaining 6 agents pay cache read (0.1x).

| Agent | Model | Cached (tokens) | Fresh Input (tokens) | Output (tokens) | Cost |
|-------|-------|-----------------|---------------------|-----------------|------|
| business-analyst (write) | Sonnet | 58K (write) | 25K | 12K | $0.47 |
| competitor-evaluator (read) | Sonnet | 58K (read) | 20K | 12K | $0.28 |
| financial-analyst (read) | Sonnet | 58K (read) | 40K | 15K | $0.37 |
| management-evaluator (read) | Sonnet | 58K (read) | 15K | 10K | $0.23 |
| risk-analyst (read) | Opus | 58K (read) | 15K | 12K | $0.44 |
| valuation-specialist (read) | Opus | 58K (read) | 30K | 15K | $0.58 |
| synthesis-writer (read) | Opus | 58K (read) | 50K | 15K | $0.68 |
| **Analysis subtotal** | | | | | **$3.05** |

**Web search:** ~50 searches x $0.01 = $0.50

**Token overhead from search results in context:** ~50K additional input tokens across all agents = ~$0.15-0.25

| Component | V3 Cost | Projected Cost | Savings |
|-----------|---------|----------------|---------|
| PSR | $4.00 | $2.82 | 30% (Sonnet pricing update, no CC overhead) |
| Analysis agents | $6.00 | $3.05 | 49% (prompt caching) |
| Synthesis | $2.00 | $0.68 | 66% (prompt caching) |
| CC overhead | $20.00 | $0.00 | 100% (eliminated) |
| Web search | included | $0.50 | N/A (new explicit cost) |
| Search tokens | included | $0.25 | N/A |
| **Total** | **$32.00** | **$7.30** | **77%** |

**Note:** The $14 estimate in V3 validation report excluded CC overhead. True V3 cost was $32. The $7.30 projected cost is a fair apples-to-apples comparison. Against the $14 API-only baseline (what agents alone cost without CC overhead), savings are ~48%.

### Sensitivity: What If Caching Misses?

If agents run in parallel and cache isn't available for subsequent requests (concurrent cache race condition -- "A cache entry only becomes available after the first response begins"):

**Mitigation:** Dispatch the first agent in each phase slightly ahead (~1-2s) to seed the cache before dispatching the rest. The first response begins streaming almost immediately, making the cache available.

**Worst case (no caching at all):** Total cost rises to ~$10.50. Still 67% cheaper than V3 due to eliminated CC overhead.

---

## MVP Recommendation

Prioritize in this order:

1. **Structured JSON outputs** -- Single highest-impact feature. Solves 4 persistent V3 issues mechanically. Requires ReportSectionSchema adaptation (the `looseObject` fix). Do this first.

2. **Parallel dispatch** -- Biggest user experience improvement (2.5hr -> 35min). Low complexity given existing `Promise.allSettled` patterns. Do immediately after structured outputs work.

3. **Web search tool** -- Solves citation URL laundering. Low complexity. Required for search compliance validation to pass.

4. **Prompt caching** -- Saves ~49% on analysis agent costs. Medium complexity (cache breakpoint placement matters). Do after dispatch is working to avoid premature optimization.

5. **Error handling + retry** -- Required for production reliability but can start simple (retry once with backoff) and iterate.

6. **DataPacket path reference** -- Prompt-level fix, low complexity, solves the remaining V3 issue that structured outputs don't address.

**Defer:**
- **Streaming progress UI** -- Nice to have but not required for v1.1. PM can wait 35 min.
- **Batch API for PSR** -- Marginal savings (~$0.40) for significant complexity. Revisit if cost target isn't met.
- **Strict tool_use validation** -- Agents with custom tools (financial-analyst, valuation-specialist) work fine without it in V3. Add later if tool call errors become a problem.
- **1-hour cache TTL** -- Only matters for iterative re-runs. Start with 5-min TTL, upgrade if PM iteration pattern emerges.

---

## Sources

- [Claude API Structured Outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs) -- Feature compatibility, JSON schema limitations, grammar compilation
- [Claude API Prompt Caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching) -- Cache breakpoints, TTL, pricing multipliers, minimum tokens
- [Claude API Web Search Tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool) -- Tool definition, response format, citations, pricing
- [Claude API Pricing](https://platform.claude.com/docs/en/about-claude/pricing) -- Model pricing table, cache multipliers, web search, batch discount
- [@anthropic-ai/sdk on npm](https://www.npmjs.com/package/@anthropic-ai/sdk) -- v0.80.0 latest, Zod integration via zodOutputFormat helper
- [Claude API Tool Use Overview](https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview) -- Tool use + structured outputs combined usage
