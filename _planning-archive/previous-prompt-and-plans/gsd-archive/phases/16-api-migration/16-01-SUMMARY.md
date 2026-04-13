---
phase: 16-api-migration
plan: 01
subsystem: api
tags: [zod, structured-output, debate, schema, claude-api]

# Dependency graph
requires:
  - phase: 10-pipeline-integration
    provides: aiResearch.js dispatch engine with ReportSectionSchema structured outputs
provides:
  - 4 role-specific Zod schemas for debate steps (BullThesisSchema, BearInversionSchema, BullRebuttalSchema, JudgeVerdictSchema)
  - DEBATE_SCHEMAS lookup map for role-to-schema resolution
  - Schema-parameterized dispatchAgent (options.schema)
  - Web search gating (maxSearches === 0 produces empty tools array)
  - Debate context injection in user messages (debateContext, debateRole)
affects: [16-02-PLAN, debate-pipeline, pipelineManager]

# Tech tracking
tech-stack:
  added: []
  patterns: [schema-parameterized dispatch, web search gating, post-processing guards]

key-files:
  created:
    - src/schemas/debateStep.js
    - src/schemas/__tests__/debateStep.test.js
  modified:
    - src/engines/aiResearch.js
    - src/engines/__tests__/aiResearch.test.js

key-decisions:
  - "4 separate Zod schemas per debate role (not one discriminated union) for cleaner zodOutputFormat enforcement"
  - "isReportSection guard skips data JSON.parse, citation enrichment, and tokenCost overwriting for non-ReportSection outputs"
  - "SFM debate step fixtures embedded inline in test file (not loaded from .thes1s/ which is gitignored)"

patterns-established:
  - "Schema parameterization: options.schema overrides default ReportSectionSchema in dispatchAgent"
  - "Web search gating: maxSearches === 0 produces empty tools array (tool absent entirely, not max_uses: 0)"
  - "Post-processing guard: isReportSection flag controls whether ReportSection-specific post-processing runs"

requirements-completed: [API-02]

# Metrics
duration: 6min
completed: 2026-03-30
---

# Phase 16 Plan 01: Debate Schema & Dispatch Extensions Summary

**4 Zod debate step schemas with DEBATE_SCHEMAS lookup map, schema-parameterized dispatchAgent with web search gating and debate context injection**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-31T03:11:25Z
- **Completed:** 2026-03-31T03:17:43Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Created 4 role-specific Zod schemas (BullThesisSchema, BearInversionSchema, BullRebuttalSchema, JudgeVerdictSchema) validated against real SFM debate output
- Extended dispatchAgent to accept optional schema parameter for non-ReportSection structured outputs
- Added web search gating (empty tools array when maxSearches === 0) and debate context injection (debateContext, debateRole)
- 31 new tests (21 schema + 10 dispatch) passing with zero regressions on all 100 relevant tests

## Task Commits

Each task was committed atomically:

1. **Task 1: Create DebateStepSchema Zod definitions with tests** - `9380de5` (feat) — TDD: RED (import fails) then GREEN (21 tests pass)
2. **Task 2: Extend dispatchAgent with schema parameter and web search gating** - `768a306` (feat)

## Files Created/Modified

- `src/schemas/debateStep.js` — 4 Zod schemas + DEBATE_SCHEMAS map, translated from agents/orchestrator/schemas/debate-step.schema.json
- `src/schemas/__tests__/debateStep.test.js` — 21 tests: parse success with SFM-derived fixtures, rejection cases, DEBATE_SCHEMAS map verification
- `src/engines/aiResearch.js` — Schema parameter (options.schema), web search gating (maxSearches === 0), debate context/role in buildUserMessage, isReportSection post-processing guard
- `src/engines/__tests__/aiResearch.test.js` — 10 new tests: schema parameter, web search gating (3 tests), debate context in user message (4 tests), post-processing skip for custom schema

## Decisions Made

- Used 4 separate Zod schemas instead of a discriminated union — cleaner for zodOutputFormat enforcement where each API call uses exactly one schema
- Embedded SFM debate step fixtures inline in test file rather than loading from .thes1s/ (gitignored, not available in worktrees)
- Post-processing guard (`isReportSection`) checks `!options.schema || options.schema === ReportSectionSchema` — this ensures debate outputs are not corrupted by ReportSection-specific data parsing or tokenCost overwriting

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] SFM fixture files unavailable in worktree**
- **Found during:** Task 1 (TDD RED phase)
- **Issue:** `.thes1s/reports/SFM/sections/debate-step-*.json` files are gitignored and not present in worktrees
- **Fix:** Embedded representative SFM-derived fixture data inline in the test file, preserving the same structure and field values from the real debate output
- **Files modified:** src/schemas/__tests__/debateStep.test.js
- **Verification:** All 21 tests pass against inline fixtures
- **Committed in:** 9380de5

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Fixture loading approach changed but test coverage identical. No scope creep.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- DebateStepSchema contracts ready for Plan 02 (debate branch in pipelineManager)
- dispatchAgent supports schema parameter for debate dispatch
- Web search gating ready for debate roles (only bear gets web search per D-03)
- Debate context injection ready for sequential debate step flow

---
*Phase: 16-api-migration*
*Completed: 2026-03-30*
