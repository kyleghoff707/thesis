---
phase: 08-core-agent-dispatch
plan: 02
subsystem: ai-engine
tags: [claude-api, structured-outputs, web-search, anthropic-sdk, dispatch, agent, zod]

# Dependency graph
requires:
  - phase: 07-schema-sdk-foundation
    provides: ReportSectionSchema with z.string() data fields, SDK 0.80.0, live smoke test proof
provides:
  - "dispatchAgent() — single-agent dispatch via client.messages.parse() with structured output"
  - "Web search URL extraction from web_search_tool_result content blocks"
  - "Citation enrichment with domain/title matching"
  - "Error handling: max_tokens retry, rate limit backoff, refusal detection"
  - "Cost tracking from API usage fields with PRICING table"
  - "Live integration test script for SFM business-analyst dispatch"
affects: [09-parallel-dispatch, 10-pitch-deck-pipeline]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "dotenv direct loading for Node scripts (not nodeAdapter.js)"
    - "vi.hoisted() for mock function references in vitest"
    - "dispatchWithRetry wraps all API calls with error classification"
    - "Space-tolerant domain matching for citation URL enrichment"

key-files:
  created:
    - src/engines/aiResearch.js
    - src/engines/__tests__/aiResearch.test.js
    - src/engines/__tests__/fixtures/mock-api-response.json
    - scripts/test-agent-dispatch.js
  modified: []

key-decisions:
  - "Web search enabled for all agents — prompt governs usage, not config"
  - "Space-tolerant domain matching in enrichCitationsWithURLs (e.g., 'Seeking Alpha' matches seekingalpha.com)"
  - "Mock API response fixture includes 3 variants: success, maxTokens truncation, refusal"
  - "Test and implementation created together since Plan 01 runs in parallel worktree"

patterns-established:
  - "dispatchAgent(role, dataPacket, options) — canonical single-agent dispatch signature"
  - "Rich result object: { section, usage, webSearches, model, stopReason, duration, error }"
  - "callFn pattern: dispatchWithRetry accepts closure that calls client.messages.parse()"

requirements-completed: [API-01, API-04, API-05, FIX-02]

# Metrics
duration: 7min
completed: 2026-03-28
---

# Phase 08 Plan 02: Core Agent Dispatch Summary

**Claude API dispatch engine (aiResearch.js) with structured output, web search URL extraction, citation enrichment, retry logic, and cost tracking — 30 unit tests passing**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-28T16:48:29Z
- **Completed:** 2026-03-28T16:56:09Z
- **Tasks:** 2
- **Files created:** 4

## Accomplishments
- Built complete aiResearch.js dispatch engine (369 lines): single-agent dispatch via client.messages.parse() with zodOutputFormat(ReportSectionSchema)
- Context assembly pipeline: loadAgentConfig, loadAgentPrompt, loadCurriculum, sliceDataPacket, buildUserMessage from agent config files
- Web search URL extraction from web_search_tool_result content blocks + citation enrichment with space-tolerant domain matching
- Error handling with retry-then-escalate: max_tokens retry (32768), rate limit backoff, refusal detection, 400 error escalation
- 30 unit tests covering all public and internal functions (all passing, 748 total src/ tests green)
- Live integration test script for SFM business-analyst dispatch with 9 assertions

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement aiResearch.js dispatch engine** - `71829ca` (feat) — TDD: created test file, fixture, then implementation
2. **Task 2: Create live integration test script** - `cf203ae` (feat) — scripts/test-agent-dispatch.js

## Files Created/Modified
- `src/engines/aiResearch.js` (369 lines) — Claude API dispatch engine with context assembly, web search, error handling, citation enrichment, cost tracking
- `src/engines/__tests__/aiResearch.test.js` (423 lines) — 30 unit tests covering extractWebSearchURLs, enrichCitationsWithURLs, buildUsage, sliceDataPacket, buildUserMessage, dispatchAgent, dispatchWithRetry, constants
- `src/engines/__tests__/fixtures/mock-api-response.json` (190 lines) — Mock API response with success, maxTokens, and refusal variants
- `scripts/test-agent-dispatch.js` (129 lines) — Live integration test dispatching business-analyst for SFM section 1

## Decisions Made
- **Web search for all agents:** Enabled web_search_20250305 for every agent dispatch. The prompt governs usage, not config flags.
- **Space-tolerant domain matching:** enrichCitationsWithURLs strips spaces from source names and TLDs from domains for fuzzy matching (e.g., "Seeking Alpha" matches "seekingalpha.com"). This was a deviation fix — the original exact-match approach failed for common source names.
- **Test + implementation co-created:** Since Plan 01 (tests-only) runs in a parallel worktree, this plan created both the fixture, test file, and implementation to be self-contained. Plan 01's tests are compatible if they arrive later.
- **Mock fixture structure:** Three response variants (successResponse, maxTokensResponse, refusalResponse) in a single JSON file, matching real Claude API response structure from Phase 7 smoke test observations.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed citation domain matching for source names with spaces**
- **Found during:** Task 1 (aiResearch.js implementation)
- **Issue:** "Seeking Alpha" source didn't match "seekingalpha.com" domain because the original matching logic required exact domain substring containment. Spaces in source names prevented matches.
- **Fix:** Added space-stripped source comparison against TLD-stripped domain base (e.g., "seekingalpha" from "seekingalpha.com" matches "seekingalpha" from "seeking alpha")
- **Files modified:** src/engines/aiResearch.js
- **Verification:** enrichCitationsWithURLs tests pass
- **Committed in:** 71829ca (Task 1 commit)

**2. [Rule 3 - Blocking] Created test infrastructure from Plan 01 spec**
- **Found during:** Task 1 (tests required by tdd="true" flag)
- **Issue:** Plan 02 depends on Plan 01's test file and fixture, but Plan 01 runs in parallel worktree. Tests didn't exist yet.
- **Fix:** Created mock-api-response.json fixture and aiResearch.test.js following Plan 01's exact specification, enabling TDD workflow
- **Files modified:** src/engines/__tests__/aiResearch.test.js, src/engines/__tests__/fixtures/mock-api-response.json
- **Verification:** 30 tests pass
- **Committed in:** 71829ca (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both fixes necessary for correctness and TDD workflow. No scope creep.

## Issues Encountered
- vitest `vi.mock` hoisting required `vi.hoisted()` to share mock function references between the mock factory and test body — standard vitest pattern for module-level mocks

## Known Stubs
None — all functions are fully implemented with no placeholder data or TODO markers.

## User Setup Required
None — no external service configuration required. Integration test requires VITE_CLAUDE_KEY in .env.local (already configured in main worktree).

## Next Phase Readiness
- aiResearch.js is the foundation for Phase 9 (parallel dispatch) and Phase 10 (full Pitch Deck pipeline)
- dispatchAgent() signature is stable: `(agentRole, dataPacket, options)` returns `{ section, usage, webSearches, model, stopReason, duration, error }`
- Prompt caching (cache_control breakpoints) can be added in Phase 9 without changing the dispatch interface
- contextBudget.js model ID fix (from Plan 01) still needed for cost estimation to work with claude-sonnet-4-6

## Self-Check: PASSED

All files exist:
- FOUND: src/engines/aiResearch.js
- FOUND: src/engines/__tests__/aiResearch.test.js
- FOUND: src/engines/__tests__/fixtures/mock-api-response.json
- FOUND: scripts/test-agent-dispatch.js
- FOUND: .planning/phases/08-core-agent-dispatch/08-02-SUMMARY.md

All commits exist:
- FOUND: 71829ca (Task 1: aiResearch.js engine + tests)
- FOUND: cf203ae (Task 2: integration test script)

---
*Phase: 08-core-agent-dispatch*
*Completed: 2026-03-28*
