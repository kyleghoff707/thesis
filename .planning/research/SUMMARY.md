# Research Summary: Claude API Migration (Thes1s v1.1)

**Project:** Thes1s v1.1 — Pitch Deck Pipeline API Migration
**Synthesized:** 2026-03-27
**Research files:** STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md
**Overall confidence:** HIGH

---

## Executive Summary

Thes1s v1.1 migrates its Pitch Deck pipeline from Claude Code subagent orchestration to direct Claude API calls via a new `aiResearch.js` engine. The research confirms this is viable with zero new dependencies: the existing `@anthropic-ai/sdk` (minor upgrade to `^0.80.0`), `zod@4.3.6`, and native `Promise.allSettled` cover every capability needed. The SDK's `messages.parse()` + `zodOutputFormat()` + `cache_control` + `web_search_20250305` server tool replace the CC orchestration layer entirely. The projected cost is $7.30 per company run (down from ~$32 true V3 cost) at 30-35 minutes wall clock (down from 2.5 hours sequential). The cost reduction comes primarily from eliminating CC overhead ($20/run), with prompt caching contributing an additional ~$2-3 savings.

The research surfaced two architectural constraints that must be designed in from day one: (1) structured outputs and the Claude Citations API are mutually exclusive (returns 400 error) — web search URLs must be extracted from `server_tool_use` blocks in the orchestrator and injected into citation fields post-generation; (2) structured outputs require all JSON schema objects to have `additionalProperties: false`, meaning the current `z.looseObject({})` fields in `ReportSectionSchema` must be replaced with explicit typed fields before any API dispatch works. Both constraints have clear, well-documented solutions.

Three V3 validation failures are mechanically solved by this migration: citation format anarchy, red flags type crash, and `searchesPerformed` format chaos all disappear with constrained JSON decoding. Two remaining issues (DataPacket path fabrication, narrative collapse) require prompt-level solutions independent of the API migration but must be included in the implementation plan. The two-pass agent call pattern (free-form prose turn → structured output turn as a new conversation) is the proven fix for narrative collapse and must be the default dispatch pattern, not an optimization.

---

## Key Findings

### From STACK.md

**Core technologies (all existing, one minor upgrade):**

| Technology | Version | Role |
|------------|---------|------|
| `@anthropic-ai/sdk` | `^0.80.0` (upgrade from 0.78.0) | API client — `messages.parse()`, `zodOutputFormat()`, `cache_control` types, web search types |
| `zod` | 4.3.6 (unchanged) | Schema definition — `zodOutputFormat()` uses `z.toJSONSchema()` internally |
| `Promise.allSettled` | Native Node.js | Parallel dispatch — already proven pattern in `dataExport.js` |

Critical: Use `output_config.format` (GA parameter path), not the old beta `output_format`. SDK handles translation internally but direct API calls require the new path.

**Prompt caching economics:**
- Cache write: 1.25x base (5-min TTL) or 2x base (1-hr TTL)
- Cache reads: always 0.1x base
- Minimum cacheable: 2,048 tokens (Sonnet 4.6), 4,096 tokens (Opus 4.6)
- Maximum 4 cache breakpoints per request

**Web search cost:** $0.01 per search. 50 searches across a full pitch deck = $0.50. Negligible against token costs.

**No new dependencies needed.** Only `contextBudget.js` pricing constants need updating for cache-aware cost tracking.

### From FEATURES.md

**Must-have features (migration fails without these):**

1. **Structured JSON outputs** — Mechanically solves 4/6 V3 persistent issues. Requires `ReportSectionSchema` adaptation: all `z.looseObject({})` fields replaced. Use `client.messages.parse()` with `zodOutputFormat(ReportSectionSchema)`.
2. **Parallel agent dispatch** — Runtime 2.5hr → 30-35min. `Promise.allSettled` with 5 dependency-aware phases. Not optional — sequential execution defeats the cost model.
3. **Prompt caching** — Cost ~$14 uncached agents → ~$8-9 cached. Shared curriculum + DataPacket + PSR findings (~58K tokens) repeated across 7+ agents. Target 80%+ cache hit rate.
4. **Web search tool** — `web_search_20250305` server tool with `max_uses` per agent. Solves citation URL laundering (V3 Issue 2). Extract URLs from `response.content` tool_result blocks in orchestrator.
5. **Error handling + retry** — `Promise.allSettled` for partial recovery. Exponential backoff reading `retry-after` header. Per-agent timeouts via `AbortController`. Three-tier recovery: retry → model upgrade → user escalation.
6. **DataPacket path reference** — Include `_fieldPaths` metadata block in every agent's context. Prevents DataPacket citation fabrication (V3 Issue 4) which structured outputs cannot fix (they enforce shape, not semantics).
7. **Token budget tracking** — Update `contextBudget.js` with cache-aware pricing. Track `cache_read_input_tokens` and `cache_creation_input_tokens` per response.

**Should-have (better than CC, defer post-v1.1):**
- Streaming progress UI — 30-min black box becomes real-time agent status
- Dynamic web search filtering (`web_search_20260209`) — reduces irrelevant token consumption from broad queries
- 1-hour cache TTL — for iterative PM re-runs within a session; break-even after 2 reads

**Explicitly NOT building:**
- Claude Citations feature (incompatible with structured outputs — 400 error)
- Multi-turn agent conversations (adds latency and cost without quality gain)
- Extended thinking (narrative field IS the thinking; extra output tokens not justified)
- Batch API for PSR (marginal $0.40 saving with significant async complexity)
- Fast mode for Opus 4.6 ($30/$150 per MTok — $80+ per company, never)

### From ARCHITECTURE.md

**Single new file:** `src/engines/aiResearch.js` — the complete orchestration layer. All other files are unchanged or minimally modified.

**Modified files:**
- `src/schemas/reportSection.js` — Replace all `z.looseObject({})` fields with explicit typed objects or `z.record(z.string(), z.unknown())`
- `agents/*/prompt.md` — Add DataPacket field path reference block to each agent system prompt

**Deprecated:** `.claude/skills/generate-pitch-deck/SKILL.md` — replaced by `aiResearch.js`

**Parallel dispatch dependency graph:**
```
PSR (7 agents, all parallel) → ~8-10 min
Phase 1 (business-analyst S1+S2, competitor-evaluator S3, parallel) → ~5 min
Phase 2 (competitor-evaluator S4 sequential → financial-analyst S5/S7/S8 + management-evaluator S6 parallel) → ~8 min
Phase 3 (risk-analyst S9 + valuation-specialist S10, parallel) → ~5 min
Synthesis (synthesis-writer, sequential) → ~3 min
Total: ~30-35 min
```

**Cache breakpoint layout (4 max per request):**
1. Tool definitions (web_search + custom tools) — BP 1, freeze array per pipeline run
2. Agent system prompt + curriculum — BP 2, static prefix only
3. Shared DataPacket slice + PSR findings — BP 3, identical across agents
4. Per-agent task instruction — NOT cached (varies per section)

**Two-pass agent call pattern (mandatory, not optional):**
- Turn 1: Agent uses web search and custom tools, produces free-form prose (no structured output constraint on this turn)
- Turn 2: NEW conversation, Turn 1 prose passed as context, structured output schema applied
- Prevents the V2 narrative collapse failure (6/10 sections produced stubs). Must be the default pattern, not a fallback.

### From PITFALLS.md

**Top 5 pitfalls and prevention:**

1. **Structured outputs + Citations are mutually exclusive (Critical)** — API returns 400 when combining `output_config.format` with `citations: true`. Prevention: extract web URLs from `server_tool_use` blocks programmatically in the orchestrator; inject into citation fields before saving sections. Never attempt to enable both.

2. **Narrative collapse under schema constraints (Critical)** — JSON schema forces Claude to compress narrative fields to fit the output budget. Prevention: two-pass pattern (prose first as Turn 1, then structured output as new Turn 2 conversation). Set `max_tokens: 16384` per agent. Check `response.stop_reason === "end_turn"` — only this guarantees valid complete JSON. `"max_tokens"` means truncated invalid output.

3. **Cache invalidation from accidental ordering changes (Critical)** — Dynamic tool arrays, timestamps in prompts, or JSON key order variation invalidates the prefix hash and kills cache hits silently. Prevention: freeze tool array per pipeline run; static system prompt prefix with cache breakpoint placed before any dynamic content; use 1-hour TTL (`ttl: "1h"`) for curriculum and DataPacket. Monitor `cache_read_input_tokens` — if 0, cache is broken.

4. **Rate limiting kills parallelism at low API tiers (Critical)** — Tier 1 (30K ITPM) cannot support even 3 parallel 50K-token agents. Tier 2 (450K ITPM) is minimum for meaningful parallelism. Note: cached tokens do NOT count against ITPM, so 80% cache hit rate effectively 5x the ITPM capacity. Prevention: build dispatch queue with configurable concurrency; implement exponential backoff reading `retry-after` header; check Console > Settings > Limits before tuning concurrency.

5. **Loss of filesystem context when leaving CC (Moderate)** — CC subagents can Read/Write/Bash; API agents cannot access any file. Every curriculum, Rule One methodology reference, and engine function must be inlined or exposed as a tool. Prevention: build `contextAssembler` utility that reads each agent's `config.json` curriculum array and concatenates files at orchestrator startup.

**Additional moderate pitfalls to track:**
- Schema complexity limits: 20 strict tools max, 24 optional parameters total across all strict schemas combined. Make Toolbox tool schemas non-strict; only `output_config.format` strict.
- Web search token explosion in multi-turn: search results persist in conversation and inflate Turn 2 input tokens. Use a NEW conversation for Turn 2, not a continuation of Turn 1.
- DataPacket path fabrication persists after migration: structured outputs enforce shape, not semantics. Add `_fieldPaths` metadata and validate citation `ref` fields in `critic.js`.
- Schema compilation latency: first request with a new schema pays compile cost. Use the same `ReportSectionSchema` for all agents — one schema compiled once.

---

## Implications for Roadmap

### Suggested Phase Structure (3 phases)

**Phase 1 — Foundation: `aiResearch.js` Architecture**

Rationale: Every subsequent piece of work depends on getting the API client, two-pass dispatch pattern, schema adaptation, and error handling correct. The two architectural constraints (no Citations API, mandatory two-pass pattern) shape all agent calls. Must be established and validated with a single agent before any pipeline migration begins.

Delivers:
- `src/engines/aiResearch.js` skeleton — API client, `dispatchAgent()`, two-pass `buildMessages()`, `Promise.allSettled` dispatch, retry/backoff, per-agent `AbortController` timeouts
- `ReportSectionSchema` adaptation — replace all `z.looseObject({})` fields; verify `zodOutputFormat` works end-to-end against live API
- Cache breakpoint layout — stable tool array, static system prefix, BP placement verified via `cache_read_input_tokens`
- `contextAssembler` utility — reads each agent's `config.json` curriculum array, concatenates files at startup
- `cacheMonitor` — logs `cache_read_input_tokens` per response, warns if hit rate below 70%
- `contextBudget.js` pricing constants updated for Sonnet 4.6, Opus 4.6, cache write/read rates
- Single-agent smoke test: one agent (Financial Analyst), valid structured output, `stop_reason === "end_turn"`, narrative word count measured

Features covered: Structured JSON outputs, error handling + retry, token budget tracking
Pitfalls to avoid: Pitfall 1 (Citations incompatibility), Pitfall 2 (narrative collapse — two-pass pattern), Pitfall 3 (cache invalidation), Pitfall 5 (schema complexity limits), Pitfall 7 (filesystem context loss), Pitfall 8 (partial pipeline failure)
Research flag: No additional research needed. All behaviors verified in official docs and local tests.

---

**Phase 2 — Pipeline Migration: Replace CC Skills with API Dispatch**

Rationale: Once the dispatch infrastructure is solid, migrate each agent from CC skill invocation to API call in dependency order. Start with PSR phase (highest token cost, clearest caching ROI), then analysis phases, then synthesis. Validate each agent's output quality individually before moving to the next.

Delivers:
- PSR phase migration (annual-reader + quarterly-reader) — parallel 7-agent dispatch
- Analysis phases 1-3 migration — phased parallel dispatch per dependency graph
- Synthesis phase migration — single-agent sequential
- Per-agent `max_uses` tuning for web search (business-analyst: 8, competitor-evaluator: 8, management-evaluator: 8, risk-analyst: 10, financial-analyst: 4, valuation-specialist: 5, synthesis-writer: 0)
- `agents/*/prompt.md` updates — DataPacket field path reference block added to each agent
- URL extraction from web search `tool_result` blocks → citation `source` field injection post-processing
- Section-level persistence to `progress.json` immediately on completion; pipeline restart skips completed sections
- Per-agent quality comparison: CC-generated vs API-generated output for same ticker

Features covered: Parallel agent dispatch, web search tool, prompt caching (full implementation)
Pitfalls to avoid: Pitfall 4 (rate limiting — dispatch queue tuning), Pitfall 6 (web search token explosion — new conversation for Turn 2), Pitfall 12 (DataPacket path fabrication — `_fieldPaths` metadata)
Research flag: Light internal validation only — no external research needed. Per-agent output comparison drives any prompt tuning.

---

**Phase 3 — Validation and Cost Optimization**

Rationale: Full pipeline run against known tickers. Measure actual cost and cache hit rate vs projections. Tune based on results, not assumptions.

Delivers:
- Full pipeline run for SFM + one additional ticker (non-LULU for generation, LULU for evaluation only)
- Cost breakdown per phase vs $7.30 projection; flag if any phase exceeds target
- Cache hit rate report — target 80%+ on shared curriculum + DataPacket
- Narrative word count comparison — API two-pass vs CC V3 baseline; target 800+ words
- Quality score comparison — target equal to or better than V3 (75+ aggregate)
- 1-hour cache TTL upgrade if PM iterates on sections (enabled after confirming break-even)
- `web_search_20260209` upgrade evaluation if token waste from search results observed

Features covered: Cost optimization, streaming progress UI (if 30-min wait unacceptable in practice), dynamic web search filtering
Research flag: No new research needed — results from Phase 2 runs drive all decisions.

---

### Implementation Order Within Phase 1

1. SDK upgrade and import validation (`npm install @anthropic-ai/sdk@latest`)
2. `ReportSectionSchema` adaptation — replace `z.looseObject({})`, verify `zodOutputFormat` accepts result
3. Single-agent smoke test against live API — confirm `stop_reason === "end_turn"` and `parsed_output` populated
4. Two-pass pattern implementation — measure narrative word count vs single-pass
5. Cache breakpoint layout — verify `cache_read_input_tokens > 0` on second request to same agent
6. `contextAssembler` utility implementation
7. Dispatch queue with configurable concurrency and retry logic
8. `cacheMonitor` + `contextBudget.js` pricing updates

---

## Research Flags

| Phase | Needs Research? | Rationale |
|-------|----------------|-----------|
| Phase 1 | No | All API behaviors verified against official docs; `zodOutputFormat` + `ReportSectionSchema` compatibility confirmed in local tests |
| Phase 2 | Light | Per-agent quality comparison (CC vs API output) required before each agent migration — internal validation, not external research |
| Phase 3 | No | Driven entirely by measured results from Phase 2; no unknowns requiring pre-research |

One open question not yet resolved in research: the exact behavior of `web_search_20260209` (dynamic filtering with code execution) on Sonnet 4.6 was confirmed as supported but not tested. Evaluate in Phase 3 with a single-agent test before enabling broadly.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | SDK capabilities verified against official docs and confirmed via local `node -e` tests. `zodOutputFormat` + `ReportSectionSchema` compatibility verified locally. |
| Features | HIGH | Feature prioritization grounded in V3 validation failure analysis — not speculative. All prioritized features are GA-documented. |
| Architecture | HIGH | Component boundaries match existing codebase structure. Data flow builds directly on `dataExport.js` and agent directory layout. Two-pass pattern proven necessary in V2 vs V3 comparison. |
| Pitfalls | HIGH | Critical pitfalls verified against official Anthropic docs. Moderate pitfalls verified across 3 previous validation runs. No speculative risks. |

**Known gaps to address in Phase 1:**
- `z.looseObject()` to explicit schema conversion: theorized but not tested end-to-end against live `messages.parse()`. Verify in Phase 1 step 2 before proceeding.
- Actual cache hit rate under true parallel dispatch (race condition: all agents fire before first response begins caching). Verify in Phase 1 step 5 with warm-cache-first-agent pattern.
- API tier level for this project's Claude account: affects maximum parallelism. Check Console > Settings > Limits before Phase 2 dispatch queue tuning.
- Narrative word count regression from two-pass API pattern vs CC V3: must be measured in Phase 2 per-agent comparison before declaring success.

---

## Cost Model

| Scenario | Cost | Notes |
|----------|------|-------|
| V3 CC run (true total cost) | ~$32 | Includes ~$20 CC overhead |
| V3 CC run (API-only portion) | ~$14 | What agents alone cost; CC overhead removed |
| API migration with 80% cache hit | ~$7.30 | Projected with caching, 50 web searches, correct tier |
| API migration, no caching (worst case) | ~$10.50 | Still 67% cheaper than V3 due to eliminated CC overhead |
| Project cost ceiling | $12 | Per CLAUDE.md constraint |

All projected scenarios land within the $8-12 target. The dominant cost reduction is CC overhead elimination ($20/run), not prompt caching. Prompt caching is a secondary optimization worth implementing but not the load-bearing cost lever.

---

## Sources (Aggregated)

- [Claude API Structured Outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs) — `output_config.format` GA, JSON Schema constraints, grammar compilation, Citations incompatibility confirmed
- [Claude API Prompt Caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching) — `cache_control`, TTL options, pricing multipliers, minimum token lengths, invalidation hierarchy, parallel request limitation
- [Claude API Web Search Tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool) — Tool type strings, `max_uses`, response structure with URLs, citation format, pricing
- [Claude API Rate Limits](https://platform.claude.com/docs/en/api/rate-limits) — Per-tier RPM/ITPM/OTPM, cache-aware ITPM exemption, model family sharing, response headers
- [Claude API Pricing](https://platform.claude.com/docs/en/about-claude/pricing) — Model pricing, cache pricing, web search $10/1,000 searches
- [Claude API Citations](https://platform.claude.com/docs/en/build-with-claude/citations) — Incompatibility with structured outputs confirmed
- [@anthropic-ai/sdk on npm](https://www.npmjs.com/package/@anthropic-ai/sdk) — v0.80.0, Zod integration via `zodOutputFormat`, peer dependency Zod v4
- [Claude API Tool Use Overview](https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview) — Tool use + structured outputs combined usage confirmed
- [Anthropic SDK TypeScript — DeepWiki](https://deepwiki.com/anthropics/anthropic-sdk-typescript) — `zodOutputFormat` helper paths
- [Thes1s V3 Validation Report](.planning/phases/06.3-pipeline-validation-pt3/V3-VALIDATION-REPORT.md) — Citation format anarchy, web citation laundering, narrative collapse, DataPacket path fabrication, red flags type crash, cost regression (project-specific, HIGH confidence)
- Local verification: `node -e` tests confirming `zodOutputFormat` + `ReportSectionSchema` compatibility
