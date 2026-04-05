# Phase 9: Parallel Dispatch & Caching - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the manager layer that dispatches multiple analysts in parallel within waves, with prompt caching for shared context and actual-cost budget tracking. The manager follows the dispatch-table.json wave structure: pre-processing (PSR) → Wave 1 → checkpoint → Wave 2 → checkpoint → Wave 3 → checkpoint → synthesis. Parallelism is within waves, not across them.

</domain>

<decisions>
## Implementation Decisions

### Concurrency strategy
- **D-01:** Parallel within waves, sequential between waves. All agents in a wave fire simultaneously via `Promise.allSettled`. Waves execute in order (1 → 2 → 3) because later waves depend on earlier findings (e.g., section 4 Moats needs Wave 1's market position context, sections 9-10 need "full context" from all prior waves).
- **D-02:** No artificial concurrency limit. 10 simultaneous requests is well within typical Claude API rate limits. The Phase 8 retry logic handles the rare 429 if it ever occurs.

### Cache architecture
- **D-03:** Stack system message in cache-friendly order: (1) universal context (Rule One fundamentals + tools), (2) PSR findings, (3) agent-specific prompt + curriculum. Apply `cache_control` breakpoints on the universal context and PSR findings prefix so agents within the same wave get cache hits on the shared prefix.
- **D-04:** Agent-specific content (prompt.md, curriculum files, DataPacket slice) goes after the cached prefix. These vary per agent and won't get cross-agent cache hits — that's expected.

### Budget tracker
- **D-05:** Actuals only — record real API response usage fields (inputTokens, outputTokens, cacheRead, cacheWrite, webSearches, cost) after each dispatch. Ditch pre-flight character-based estimates. The existing `contextBudget.js` `createBudgetTracker()` should be updated to accept actual usage from `aiResearch.js` results instead of character counts.

### Manager interface
- **D-06:** Single function with per-wave callbacks for intermediate visibility. The manager accepts an `onWaveComplete(waveNumber, results, costSoFar)` callback so the UI can show progress as each wave finishes.
- **D-07:** The manager pauses between waves for PM (user) review. The PM can approve, provide corrections, supply additional data, or ask for changes before the next wave fires. PM feedback is folded into the next wave's context. This matches the dispatch-table.json checkpoint rules.
- **D-08:** The manager follows `agents/orchestrator/dispatch-table.json` for wave structure, section-to-agent mapping, and checkpoint rules. It is code, not AI — deterministic dispatch coordination.

### Claude's Discretion
- How to structure the `onWaveComplete` callback payload (which fields, how summaries are formatted)
- Whether PSR pre-processing (annual-reader + quarterly-reader) runs in parallel or sequential (dispatch-table says quarterly can run parallel with annual)
- How PM feedback from checkpoints gets incorporated into subsequent wave context (appended to user message, added to system message, etc.)
- Cache monitoring implementation details (logging format, 70% threshold warning mechanism)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Dispatch architecture
- `agents/orchestrator/dispatch-table.json` — Wave structure, section-to-agent mapping, checkpoint rules, parallelism flags for Pitch Deck (and One Pager, Full Story)
- `agents/orchestrator/config.json` — Section mapping (pitchDeck.sectionMapping), checkpoint rules
- `agents/orchestrator/README.md` — State machine, checkpoint format, FGR confirmation rule

### Phase 8 outputs (foundation)
- `src/engines/aiResearch.js` — Single-agent dispatch engine (`dispatchAgent`) that this phase builds on top of
- `src/engines/contextBudget.js` — Budget tracker to be updated for actuals-only tracking
- `.planning/phases/08-core-agent-dispatch/08-CONTEXT.md` — D-01 through D-06 decisions (dotenv pattern, model map, rich result object, zodOutputFormat, data JSON.parse)

### Agent configs (all Pitch Deck analysts)
- `agents/business-analyst/config.json` — sections [1,2], dataPacketSlice, universalContext
- `agents/competitor-evaluator/config.json` — sections [3,4], dataPacketSlice
- `agents/financial-analyst/config.json` — sections [5,7,8], dataPacketSlice
- `agents/management-evaluator/config.json` — section [6], dataPacketSlice
- `agents/risk-analyst/config.json` — section [9], dataPacketSlice
- `agents/valuation-specialist/config.json` — section [10], dataPacketSlice
- `agents/primary-source-reader/config.json` — PSR config (annual + quarterly reading)
- `agents/synthesis-writer/config.json` — post-processing polish

### API caching reference
- `.planning/research/STACK.md` — `cache_control` breakpoints, prompt caching API parameters

### Requirements
- `.planning/REQUIREMENTS.md` — API-02, API-03, API-06, API-07 are the requirements for this phase

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/engines/aiResearch.js` — `dispatchAgent(agentRole, dataPacket, options)` returns `{ section, usage, webSearches, model, stopReason, duration, error }`. The manager calls this per agent.
- `src/engines/contextBudget.js` — `createBudgetTracker()` with `record()` and `getSummary()`. Needs update: replace character-based estimation with actual API usage recording.
- `src/engines/dataExport.js` — `assembleDataPacket()` builds the full DataPacket from engine outputs. Used in pre-processing step.
- `agents/orchestrator/dispatch-table.json` — Complete wave structure with parallelism flags, checkpoint rules, and section-to-agent mapping.

### Established Patterns
- Engines return `null` on failure, callers check for null
- `try/catch` with `console.warn` for non-fatal errors
- Named exports for all public functions
- `_testExports` pattern for testing internal helpers

### Integration Points
- Manager function will be a new export from `aiResearch.js` or a new file (Claude's discretion)
- `dispatchAgent()` is the per-agent call — manager wraps it with wave sequencing and `Promise.allSettled`
- Budget tracker feeds into the callback payload for PM visibility

</code_context>

<specifics>
## Specific Ideas

- The dispatch-table.json already defines the exact wave structure — the manager should read it, not hardcode waves
- PSR findings from pre-processing should be included in the cached system message prefix for all subsequent agents
- PM feedback at checkpoints should be meaningful — not just "approve/reject" but the ability to provide corrections, additional data sources, or redirect analysis focus
- Cache hit rate monitoring (API-06) should warn at the 70% threshold so we know if the caching strategy is working

</specifics>

<deferred>
## Deferred Ideas

- **Streaming progress UI** — Real-time token streaming to show agent "thinking". Out of scope per REQUIREMENTS.md.
- **Configurable concurrency limit** — Not needed now (10 requests is fine), can be added as a one-line change if rate limits become an issue.
- **Pre-flight cost estimation** — Ditched in favor of actuals-only tracking. Could be added later if users want cost preview before running.

</deferred>

---

*Phase: 09-parallel-dispatch-caching*
*Context gathered: 2026-03-28*
