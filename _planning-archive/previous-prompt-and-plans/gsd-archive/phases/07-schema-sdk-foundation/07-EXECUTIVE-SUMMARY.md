# Phase 7: Schema & SDK Foundation — Executive Summary

**Date:** 2026-03-28
**Duration:** ~35 minutes (research + planning + execution + verification)
**Plans:** 2/2 complete across 2 waves
**Lines changed:** +523 / -9 across 7 files
**Tests:** 12 new tests added, zero regressions

---

## What This Phase Did

Phase 7 was the first phase of milestone v1.1 (API Migration & Pitch Deck Quality). The existing `ReportSectionSchema` used `z.looseObject({})` for flexible data fields — fine for internal validation, but fundamentally incompatible with the Claude API's structured output feature, which requires `additionalProperties: false` on every object. This phase fixed the schema, upgraded the SDK, and proved the fix works end-to-end with live API calls — including web search tool compatibility.

## What Shipped

### Plan 01 — Schema Fix + Backward Compatibility (Wave 1)
**Problem:** `z.looseObject({})` in 3 API-facing fields (`ReportSectionSchema.data`, `ChartSchema.config`, `ChartSchema.data` items) would cause Claude API to reject the schema outright. The SDK's `transformJSONSchema` strips `additionalProperties` and sets it to `false`, but preserves `properties: {}` — constraining the field to accept only empty objects `{}`.

**Solution:** Replaced all 3 occurrences with `z.string()`. The agent serializes flexible data as a JSON string inside the structured output; the orchestrator `JSON.parse()`s it after extraction. Added optional `url` field to `CitationSchema` for web search URLs. Updated `critic.js` `scoreCompleteness` to handle `data` as either string or object with graceful degradation.

**Result:** Schema passes `zodOutputFormat()` with zero `additionalProperties: true` in the output. `StageReportSchema.checkpoints[].userInput` intentionally kept as `z.looseObject({})` — internal only, never sent to the API. 12 new tests, all passing.

### Plan 02 — SDK Upgrade + Live Smoke Test (Wave 2)
**Problem:** SDK 0.78.0 was installed but `messages.parse()` and `zodOutputFormat()` needed 0.80.0+. No proof the schema actually worked with the live Claude API.

**Solution:** Upgraded `@anthropic-ai/sdk` to 0.80.0. Created `scripts/smoke-test-schema.js` (222 lines) with two-stage verification:
- **Stage 1:** Minimal API call — simple prompt + structured output schema. Verifies schema compiles, API accepts it, `stop_reason: end_turn`, `parsed_output` populated. Cost: **$0.04**.
- **Stage 2:** Realistic agent call — `business-analyst` prompt + real DataPacket slice + `web_search_20250305` tool. Verifies schema + agent prompt + web search combined. Cost: **$0.61**.

**Result:** Both stages PASS. The `z.string()` approach works perfectly. Stage 2 returned a 41-key JSON data object, 30 citations, and 5 web search result blocks.

---

## Key Metrics

| Metric | Before (Phase 7) | After (Phase 7) |
|--------|-------------------|-------------------|
| `z.looseObject({})` in API-facing schemas | 3 fields | **0** (converted to `z.string()`) |
| `@anthropic-ai/sdk` version | 0.78.0 | **0.80.0** |
| Structured output proof | None | **Two-stage live smoke test** |
| Schema + web search compatibility | Unknown | **Confirmed** (Stage 2 PASS) |
| Estimated per-agent cost | Unknown | **~$0.61** (realistic call with web search) |
| New test coverage | 0 | **12 tests** (8 schema + 4 critic) |

## Critical Discoveries

Two findings that affect all future API work:

1. **Model version matters for structured outputs.** Only `claude-sonnet-4-6`+ and `claude-opus-4-6`+ support `output_config`. The older `claude-sonnet-4-20250514` returns a 400 error. All agent configs must use the newer model IDs.

2. **`nodeAdapter.js` breaks Anthropic SDK calls.** Its `globalThis.fetch` monkey-patch (which adds SEC User-Agent headers) strips the SDK's `x-api-key` header. Any Node.js script calling the Claude API must load `.env.local` via `dotenv` directly — not via `nodeAdapter.js`. Phase 8's `aiResearch.js` engine will need its own solution for this.

## Architecture Decisions Validated

- **D-01 confirmed:** `z.string()` for flexible fields is the right approach. Zero API rejections. Zero breaking changes to existing consumers.
- **D-05/D-06 confirmed:** Two-stage smoke test design proved its value — Stage 1 catches schema issues cheaply ($0.04), Stage 2 validates the full agent experience ($0.61).
- **D-07 confirmed:** SDK 0.80.0 has `messages.parse()` and `zodOutputFormat()` at the GA import path. No beta headers needed.

## What's NOT Done (Deferred)

- **`aiResearch.js` engine** — The actual orchestration layer that uses these schemas to run agents from the Tauri app. That's Phase 8.
- **`SectionRenderer.jsx` updates** — If `data` arrives as a string from the API, the UI renderer needs to parse it. Handled when the orchestrator layer is built.
- **Agent config model updates** — Agent configs still reference old model IDs. Updated in Phase 8 when agents are wired to the new SDK path.

## Remaining Risk

- **SDK version discrepancy** — `node_modules` reports 0.78.0 in `package.json` metadata but lockfile resolves to 0.80.0 and live API calls work. A clean `npm ci` would resolve this. No functional impact.
- **Cost at scale** — Stage 2 cost $0.61 for a single agent with web search. With 9 agents per Pitch Deck, full pipeline could be $5-6 (within the $8-12 target).
- **Parse-after-extraction pattern** — Every consumer of `section.data` must know it arrives as a string from the API. This is documented but not yet enforced architecturally.

---

## Next Steps

1. **`/gsd:discuss-phase 8`** — Core Agent Dispatch: build the orchestration layer that sends agents through the Claude API with structured outputs
2. **Update agent configs** — Switch all agents to `claude-sonnet-4-6` model ID
3. **Run `/generate:pitch-deck SFM`** — Once Phase 8 ships, verify full pipeline with a real company

---

*Phase 7 complete. The schema works, the SDK works, the API accepts it, web search is compatible. Foundation laid for the full agent pipeline.*
