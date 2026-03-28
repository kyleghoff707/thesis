# Roadmap: Thes1s v1.1 — API Migration & Pitch Deck Quality

## Overview

Migrate the Pitch Deck pipeline from Claude Code subagent orchestration to direct Claude API calls. The schema must be fixed before any API calls work; core single-agent dispatch establishes the dispatch pattern and error handling; parallel dispatch and caching optimize runtime and cost; pipeline integration wires all 10 sections with mechanical compliance enforcement; validation proves the pipeline hits 85+ quality on real tickers at $8-12 cost in 30-40 minutes.

## Milestones

- v1.0 Agent Infrastructure & Pitch Deck Pipeline (shipped 2026-03-27) -- see MILESTONES.md
- v1.1 API Migration & Pitch Deck Quality (this roadmap)

## Phases

**Phase Numbering:**
- Continues from v1.0 (Phases 5A-6.3 archived in MILESTONES.md)
- Integer phases (7, 8, 9, 10, 11): Planned milestone work
- Decimal phases (7.1, 7.2): Urgent insertions if needed (marked with INSERTED)

- [ ] **Phase 7: Schema & SDK Foundation** - Fix structured output schema compatibility and verify end-to-end with live API
- [ ] **Phase 8: Core Agent Dispatch** - Single agent dispatches via Claude API with web search, structured output, and error handling
- [ ] **Phase 9: Parallel Dispatch & Caching** - Multi-agent parallelism with prompt caching and budget tracking
- [ ] **Phase 10: Pipeline Integration & Prompt Fixes** - Full 10-section Pitch Deck pipeline with mechanical compliance enforcement
- [ ] **Phase 11: Validation** - Prove pipeline quality, cost, and runtime on real tickers

## Phase Details

### Phase 7: Schema & SDK Foundation
**Goal**: ReportSectionSchema produces valid structured output JSON via the Claude API -- verified with a live smoke test
**Depends on**: Nothing (first phase of v1.1; builds on v1.0 schema and SDK)
**Requirements**: FMT-01, FMT-02, FMT-03
**Success Criteria** (what must be TRUE):
  1. `zodOutputFormat(ReportSectionSchema)` produces a valid JSON Schema accepted by the Claude API (no 400 errors on schema compilation)
  2. A single live API call with the adapted schema returns `stop_reason: "end_turn"` and `parsed_output` is populated with valid section data
  3. Citation objects in the parsed output include an optional `url` field available for web search results
**Plans:** 2 plans

Plans:
- [x] 07-01-PLAN.md — Schema modification + critic backward compatibility (FMT-01, FMT-02)
- [ ] 07-02-PLAN.md — SDK upgrade + live two-stage smoke test (FMT-03)

### Phase 8: Core Agent Dispatch
**Goal**: A single analysis agent produces a complete, quality section via direct Claude API call with web search and structured output
**Depends on**: Phase 7
**Requirements**: API-01, API-04, API-05, FIX-02
**Success Criteria** (what must be TRUE):
  1. `aiResearch.js` dispatches one agent (e.g., financial-analyst) via `client.messages.parse()` and receives a validated ReportSectionSchema object
  2. Agent performs web searches during its turn, and the orchestrator extracts actual URLs from `web_search_tool_result` blocks and injects them into citation `source` fields
  3. When an API call fails (rate limit, timeout, max_tokens truncation), the system retries once with context, then escalates -- partial results are never silently lost
  4. The dispatched agent's narrative field contains 800+ words of substantive analysis (not stubs or summaries)
**Plans**: TBD

### Phase 9: Parallel Dispatch & Caching
**Goal**: Multiple agents run concurrently with shared prompt caching, and every API call's cost is tracked
**Depends on**: Phase 8
**Requirements**: API-02, API-03, API-06, API-07
**Success Criteria** (what must be TRUE):
  1. A wave of 3+ agents dispatched via `Promise.allSettled` completes in parallel -- wall-clock time is roughly equal to the slowest single agent, not the sum of all agents
  2. `cache_read_input_tokens` is greater than zero on the second and subsequent agents in a wave (shared curriculum and DataPacket are being cached)
  3. Cache monitor logs hit rate per pipeline run and warns if below 70%
  4. After a pipeline run, the budget tracker reports per-agent and total cost broken down by input tokens, output tokens, cache reads, cache writes, and web searches
**Plans**: TBD

### Phase 10: Pipeline Integration & Prompt Fixes
**Goal**: The full 10-section Pitch Deck generates end-to-end via API with mechanical compliance on every section
**Depends on**: Phase 9
**Requirements**: FIX-01, FIX-03, FIX-04, FIX-05
**Success Criteria** (what must be TRUE):
  1. Every agent prompt includes a DataPacket field path reference block listing actual top-level and second-level field paths -- no fabricated paths appear in citation `ref` fields
  2. Every section's `citations` array contains objects in canonical `{id, ref, text, source}` format (enforced by structured output, not post-hoc parsing)
  3. Every section's `searchesPerformed` array contains objects in canonical `{query, resultCount, usedInSection}` format (enforced by structured output)
  4. Every section's `redFlags` is a string array (not object array) -- enforced by structured output schema
  5. All 10 sections + synthesis complete in a single pipeline run with no manual intervention
**Plans**: TBD

### Phase 11: Validation
**Goal**: The pipeline produces hedge-fund-quality Pitch Decks that meet cost and runtime targets on multiple tickers
**Depends on**: Phase 10
**Requirements**: VAL-01, VAL-02, VAL-03, VAL-04
**Success Criteria** (what must be TRUE):
  1. SFM Pitch Deck generated via API pipeline scores 85+ overall quality with zero high-severity issues
  2. A second ticker from a different sector generates successfully and scores 85+ quality
  3. Total pipeline cost per company is $8-12 as reported by the budget tracker (using actual API response usage fields)
  4. Total pipeline wall-clock runtime is 30-40 minutes (from dispatch start to synthesis complete)
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 7 -> 8 -> 9 -> 10 -> 11

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 7. Schema & SDK Foundation | 0/2 | Planning | - |
| 8. Core Agent Dispatch | 0/TBD | Not started | - |
| 9. Parallel Dispatch & Caching | 0/TBD | Not started | - |
| 10. Pipeline Integration & Prompt Fixes | 0/TBD | Not started | - |
| 11. Validation | 0/TBD | Not started | - |
