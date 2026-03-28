---
phase: 08-core-agent-dispatch
plan: 01
subsystem: testing
tags: [vitest, claude-api, structured-outputs, web-search, citations, mock-fixtures]

# Dependency graph
requires:
  - phase: 07-schema-sdk-foundation
    provides: ReportSectionSchema with z.string() for API-facing fields, SDK 0.80.0 with messages.parse()
provides:
  - Mock API response fixture (successResponse, maxTokensResponse, refusalResponse) for aiResearch.js tests
  - 21-test scaffold covering dispatchAgent, extractWebSearchURLs, enrichCitationsWithURLs, buildUsage, sliceDataPacket, dispatchWithRetry
  - contextBudget.js with claude-sonnet-4-6 model ID and cache token cost tracking
affects: [08-core-agent-dispatch, 09-parallel-dispatch]

# Tech tracking
tech-stack:
  added: []
  patterns: [mock-api-response fixture pattern for Claude structured output testing, _testExports for internal helper testing]

key-files:
  created:
    - src/engines/__tests__/fixtures/mock-api-response.json
    - src/engines/__tests__/aiResearch.test.js
  modified:
    - src/engines/contextBudget.js
    - src/engines/__tests__/contextBudget.test.js

key-decisions:
  - "buildUsage cost includes $0.01 per web search request in addition to token costs"
  - "contextBudget DEFAULT_MODEL changed from claude-sonnet-4-20250514 to claude-sonnet-4-6 (older ID does not support output_config)"
  - "computeCost extended with optional cacheReadTokens/cacheWriteTokens for prompt caching cost tracking"

patterns-established:
  - "Mock fixture structure: { successResponse, maxTokensResponse, refusalResponse } with realistic Claude API content blocks"
  - "Web search URL extraction from web_search_tool_result content blocks for citation enrichment"
  - "Cache pricing tracked per model entry in MODEL_PRICING for future prompt caching support"

requirements-completed: [API-01, API-04, API-05, FIX-02]

# Metrics
duration: 5min
completed: 2026-03-28
---

# Phase 8 Plan 01: Test Scaffold & Context Budget Fix Summary

**21-test aiResearch.js scaffold with mock Claude API fixtures and contextBudget claude-sonnet-4-6 model ID fix for structured output dispatch**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-28T16:40:18Z
- **Completed:** 2026-03-28T16:45:27Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- Created comprehensive mock API response fixture with 3 response variants (success, max_tokens, refusal) and realistic web search content blocks
- Built 21-test scaffold covering all aiResearch.js public functions and internal helpers (tests will pass when Plan 02 creates the engine)
- Fixed contextBudget.js to support claude-sonnet-4-6 model ID and cache token cost tracking

## Task Commits

Each task was committed atomically:

1. **Task 1: Create mock API response fixture** - `b25f9af` (test)
2. **Task 2: Create aiResearch.test.js unit test scaffold** - `8ba5de1` (test)
3. **Task 3: Fix contextBudget.js model ID for structured outputs** - `f25f480` (fix)

## Files Created/Modified
- `src/engines/__tests__/fixtures/mock-api-response.json` - Mock Claude API response with successResponse (end_turn + parsed_output + 2 web_search_tool_result blocks), maxTokensResponse (truncation), refusalResponse (safety)
- `src/engines/__tests__/aiResearch.test.js` - 21 test cases in 6 describe blocks covering extractWebSearchURLs, enrichCitationsWithURLs, buildUsage, sliceDataPacket, dispatchAgent, dispatchWithRetry
- `src/engines/contextBudget.js` - Added claude-sonnet-4-6 to MODEL_PRICING, updated DEFAULT_MODEL, added cache pricing, extended computeCost with cache token params
- `src/engines/__tests__/contextBudget.test.js` - Added tests for claude-sonnet-4-6 pricing and cache cost computation, updated DEFAULT_MODEL assertion

## Decisions Made
- Web search cost is $0.01 per search request, included in buildUsage cost calculation alongside token costs
- DEFAULT_MODEL changed from claude-sonnet-4-20250514 to claude-sonnet-4-6 because the older model ID does not support output_config structured outputs
- computeCost extended with optional cacheReadTokens and cacheWriteTokens parameters (backward compatible, defaults to 0)
- Mock fixture narrative is 3,185 characters (realistic length) to enable narrative length validation tests in Plan 02

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Test scaffold ready for Plan 02 to implement aiResearch.js -- all 21 tests will guide implementation
- Mock fixture provides realistic API response data for all success/error paths
- contextBudget.js ready to track costs with correct model IDs and cache pricing
- All 659 existing engine tests continue passing

## Self-Check: PASSED

All 4 created/modified files verified on disk. All 3 task commit hashes found in git log.

---
*Phase: 08-core-agent-dispatch*
*Completed: 2026-03-28*
