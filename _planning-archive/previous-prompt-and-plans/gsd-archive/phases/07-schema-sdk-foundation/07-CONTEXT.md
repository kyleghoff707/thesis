# Phase 7: Schema & SDK Foundation - Context

**Gathered:** 2026-03-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix ReportSectionSchema for structured output compatibility with the Claude API and verify end-to-end with live smoke tests. This phase delivers a working schema that passes `zodOutputFormat()` and produces valid `parsed_output` from a real API call — including web search tool compatibility.

</domain>

<decisions>
## Implementation Decisions

### looseObject replacement strategy
- **D-01:** Replace all `z.looseObject({})` in API-facing schemas with `z.string()`. The agent serializes flexible data as a JSON string inside the structured output. The orchestrator parses the string after extraction. This is the simplest approach and guaranteed compatible with `additionalProperties: false`.
- **D-02:** Apply `z.string()` consistently to: `ReportSectionSchema.data`, `ChartSchema.config`, `ChartSchema.data` array items.

### Schema scope
- **D-03:** Fix only API-facing schemas: `ReportSectionSchema`, `ChartSchema`, `CitationSchema` (add optional `url` field). Do NOT touch `StageReportSchema`, `progress.js`, or `dataPacket.js` — they use `looseObject` for internal validation only and are never sent to the API.
- **D-04:** `StageReportSchema.checkpoints[].userInput` keeps `z.looseObject({})` — it's internal state, not API output.

### Smoke test design
- **D-05:** Two-stage smoke test:
  - Stage 1: Minimal API call with simple prompt ("Generate a sample radar section for AAPL") + structured output schema. Verifies schema compiles, API accepts it, `stop_reason: end_turn`, `parsed_output` populated. ~$0.05.
  - Stage 2: Realistic agent call using actual `business-analyst/prompt.md` + real SFM DataPacket slice + `web_search_20250305` tool. Verifies schema + agent prompt compatibility + web search tool combined with structured outputs. ~$0.50-0.60.
- **D-06:** Both stages must pass. If Stage 1 fails, fix schema before attempting Stage 2. If Stage 2 fails but Stage 1 passed, the issue is prompt/tool interaction, not schema.

### SDK upgrade
- **D-07:** Upgrade `@anthropic-ai/sdk` from `^0.78.0` to latest (0.80.0+). Use `client.messages.parse()` with `zodOutputFormat(ReportSectionSchema)` for the smoke tests.

### Claude's Discretion
- Exact `max_tokens` value for smoke tests (research suggests 8192-16384)
- Whether to create a standalone test script or integrate into vitest
- How to handle the `ChartSchema.data` array — `z.array(z.string())` vs keeping `z.array(ChartSchema)` with `z.string()` inside

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Schema files (modify)
- `src/schemas/reportSection.js` — Current schema with 4 `z.looseObject({})` fields that need replacing. Also contains `getReportSectionJSONSchema()` export.

### Research (read for API parameter details)
- `.planning/research/STACK.md` — Complete API parameter reference: `output_config.format`, `zodOutputFormat()`, `cache_control`, `web_search_20250305` tool definition, SDK `.parse()` method, JSON Schema limitations
- `.planning/research/PITFALLS.md` — Pitfall 2 (narrative collapse under schema constraints), Pitfall 5 (schema complexity limits — 24 optional params), Pitfall 9 (schema compilation latency)
- `.planning/research/ARCHITECTURE.md` §Structured Outputs Integration — Schema modification options, `additionalProperties: false` requirement, optional parameter budget (currently 7 of 24)

### Agent files (read-only for Stage 2 smoke test)
- `agents/business-analyst/prompt.md` — System prompt for the realistic smoke test
- `agents/business-analyst/config.json` — Agent config (model, curriculum, DataPacket slice)

### Existing SDK usage (reference)
- `src/engines/companyAdapter.js` — Current Anthropic API usage via raw `fetch()`. NOT the pattern for aiResearch.js (that uses the SDK client), but shows how the API key is accessed.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/schemas/reportSection.js`: Complete schema with `getReportSectionJSONSchema()` — the base we're modifying
- `@anthropic-ai/sdk ^0.78.0`: Already installed, needs version bump
- `zod 4.3.6`: Already installed, `z.toJSONSchema()` works

### Established Patterns
- All schemas in `src/schemas/` use Zod v4 with `z.looseObject({})` for flexible fields
- `getReportSectionJSONSchema()` already exports JSON Schema — the function stays, the underlying schema changes
- `companyAdapter.js` uses `import.meta.env.VITE_CLAUDE_KEY` for the API key in browser; Node uses `process.env.VITE_CLAUDE_KEY` via `nodeAdapter.js`

### Integration Points
- `src/engines/critic.js` imports `ReportSectionSchema` for validation — schema changes must not break critic
- `src/engines/dataExport.js` imports `DataPacketSchema` — NOT being changed in this phase
- `src/components/SectionRenderer.jsx` reads `section.data` as an object — if `data` becomes a string in the API output, the orchestrator must parse it before passing to UI components
- Future `aiResearch.js` (Phase 8) will import the modified schema via `zodOutputFormat()`

</code_context>

<specifics>
## Specific Ideas

- The smoke test should output detailed diagnostics: `stop_reason`, `parsed_output` field count, `usage` tokens, `cache_creation_input_tokens` (even if 0 for now), and any `web_search_tool_result` blocks found
- If the `z.string()` approach for `data` works, document the parse-after-extraction pattern clearly so Phase 8 knows to handle it

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 07-schema-sdk-foundation*
*Context gathered: 2026-03-27*
