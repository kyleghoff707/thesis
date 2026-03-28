# Phase 8: Core Agent Dispatch - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Build `aiResearch.js` — the engine that dispatches a single analysis agent via the Claude API with structured output and web search, producing a complete quality section. This phase proves one agent works end-to-end before Phase 9 adds parallel dispatch. The engine must handle error recovery, web search URL extraction, cost tracking, and return rich diagnostics.

</domain>

<decisions>
## Implementation Decisions

### API client initialization
- **D-01:** Use standalone dotenv pattern (proven in `scripts/smoke-test-schema.js`). Load `.env.local` via `dotenv.config()` directly. Do NOT import `nodeAdapter.js` — its fetch monkey-patch strips the Anthropic SDK's `x-api-key` header.
- **D-02:** This is a temporary local-only approach. The app will eventually have a Cloudflare server that hides all API keys. The entire client initialization strategy gets replaced at that point — no need to over-engineer now.

### Model resolution
- **D-03:** Map agent config shorthand to full model IDs: `"sonnet"` → `"claude-sonnet-4-6"`, `"opus"` → `"claude-opus-4-6"`. Only these model generations support `output_config` structured outputs. The older `claude-sonnet-4-20250514` / `claude-opus-4-20250514` do NOT work.

### Agent dispatch interface
- **D-04:** Return rich result object: `{ section, usage: { inputTokens, outputTokens, cacheRead, cacheWrite, cost }, webSearches: [...urls], model, duration }`. Everything needed for PM visibility and cost tracking (API-07).
- **D-05:** Use `client.messages.parse()` with `zodOutputFormat(ReportSectionSchema)` — the proven pattern from Phase 7's smoke test.
- **D-06:** `section.data` arrives as a JSON string from the API (Phase 7 D-01). The engine should `JSON.parse()` it before returning so callers receive an object, not a string.

### Claude's Discretion
- Whether dispatch function reads agent config.json + prompt.md at call time or expects them pre-loaded (trade-off: convenience vs statelessness)
- Web search URL extraction strategy — agent fills citation.url via structured output + post-processing backfills gaps from `web_search_tool_result` blocks, or simpler approach
- Error handling: how to handle max_tokens truncation (return partial vs null), retry count, backoff strategy
- `max_tokens` value per agent (8192-16384 based on Phase 7 smoke test results)
- How curriculum files and DataPacket slices are assembled into the prompt (system message structure)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 7 outputs (foundation for this phase)
- `scripts/smoke-test-schema.js` — Working example of `messages.parse()` + `zodOutputFormat()` + web search. The reference implementation for API calls.
- `src/schemas/reportSection.js` — Modified schema with `z.string()` for data/config fields, optional `url` on CitationSchema
- `.planning/phases/07-schema-sdk-foundation/07-EXECUTIVE-SUMMARY.md` — Critical discoveries: nodeAdapter incompatibility, model version requirements, cost benchmarks
- `.planning/phases/07-schema-sdk-foundation/07-02-SUMMARY.md` — Detailed deviation notes: dotenv pattern, model selection, SDK auth issue

### Agent architecture
- `agents/business-analyst/config.json` — Reference agent config: model, curriculum, dataPacketSlice, sections, universalContext
- `agents/business-analyst/prompt.md` — Reference agent prompt (used in Phase 7 Stage 2 smoke test)
- `src/engines/dataExport.js` — `assembleDataPacket()` function that builds the DataPacket

### Research (API parameter details)
- `.planning/research/STACK.md` — Complete API parameter reference: `output_config.format`, `cache_control`, `web_search_20250305` tool definition, SDK `.parse()` method
- `.planning/research/PITFALLS.md` — Pitfall 2 (narrative collapse under schema), Pitfall 5 (schema complexity limits), Pitfall 9 (schema compilation latency)
- `.planning/research/ARCHITECTURE.md` §Structured Outputs Integration — Schema modification options, optional parameter budget

### Requirements
- `.planning/REQUIREMENTS.md` — API-01, API-04, API-05, FIX-02 are the requirements for this phase

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `scripts/smoke-test-schema.js` (222 lines) — Working API call pattern with dotenv, SDK client, zodOutputFormat, web search tool, diagnostics printing. Direct template for aiResearch.js.
- `src/schemas/reportSection.js` — `ReportSectionSchema` export for zodOutputFormat, `getReportSectionJSONSchema()` for reference
- `src/engines/dataExport.js` — `assembleDataPacket()` builds the full DataPacket from engine outputs
- `src/engines/critic.js` — `scoreCompleteness()` already handles string data via JSON.parse (Phase 7)

### Established Patterns
- Engines return `null` on failure, callers check for null (CLAUDE.md convention)
- `try/catch` with `console.warn` for non-fatal errors
- Named exports for all public functions
- Config via `import.meta.env.VITE_CLAUDE_KEY` in browser, `process.env.VITE_CLAUDE_KEY` in Node

### Integration Points
- `aiResearch.js` is a new file in `src/engines/` — no existing code to modify
- CC skill (`generate-pitch-deck/SKILL.md`) will eventually call this engine instead of spawning CC subagents
- `src/engines/config.js` has the API key accessor but uses `import.meta.env` — aiResearch.js needs dotenv instead

</code_context>

<specifics>
## Specific Ideas

- The smoke test's `printDiagnostics()` function is a good template for the diagnostics structure returned by dispatch
- Cost estimation should use actual API pricing: Sonnet ($3/$15 per M tokens), Opus ($15/$75 per M tokens), with cache read at 0.1x
- The eventual Cloudflare server migration means we should NOT bake in complex API key management — simple dotenv is intentionally temporary

</specifics>

<deferred>
## Deferred Ideas

- **Cloudflare server layer** — Moves API keys server-side, removes nodeAdapter conflict entirely. Different milestone.
- **Prompt caching** (`cache_control` breakpoints) — API-03 is a separate requirement, likely Phase 9 with parallel dispatch
- **In-browser direct API calls** — EXPT-06, out of scope for this milestone
- **Streaming progress** — Nice-to-have but not table stakes per REQUIREMENTS.md Out of Scope

</deferred>

---

*Phase: 08-core-agent-dispatch*
*Context gathered: 2026-03-28*
