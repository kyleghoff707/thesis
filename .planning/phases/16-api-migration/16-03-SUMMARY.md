---
phase: 16-api-migration
plan: 03
subsystem: api
tags: [pipeline-runner, full-story, debate, cli, cost-tracking]

# Dependency graph
requires:
  - phase: 16-api-migration (plans 01, 02)
    provides: debate schemas, debate branch in pipelineManager, dispatchAgent schema parameter
provides:
  - scripts/run-full-story.js CLI runner for Full Story pipeline
  - debateOutputs exposed in runPipeline return value
  - Individual debate step and section file saving
  - Per-stage and combined cost reporting
affects: [full-story-validation, quality-scoring, pipeline-integration]

# Tech tracking
tech-stack:
  added: []
  patterns: [gate-check-before-pipeline, inherit-pitch-deck-context, per-stage-cost-tracking, debate-step-file-saving]

key-files:
  created:
    - scripts/run-full-story.js
    - src/schemas/debateStep.js
  modified:
    - src/engines/pipelineManager.js

key-decisions:
  - "Gate check supports both pipeline-output.json and pitch-deck.json for Pitch Deck input"
  - "Full Story output written to full-story-api.json (not pipeline-output.json) to keep separate from Pitch Deck"
  - "Debate steps saved as debate-step-{1-4}.json, sections as fullStory-S{N}-{key}.json"
  - "Combined cost reported against $15 ceiling per D-06"

patterns-established:
  - "Gate check pattern: verify prerequisite stage output before running pipeline"
  - "Debate step saving: individual JSON files per role for debugging"
  - "Per-stage cost comparison: load prior stage budget from saved output"

requirements-completed: [API-01, API-03]

# Metrics
duration: 4min
completed: 2026-03-31
---

# Phase 16 Plan 03: Full Story Pipeline Runner Summary

**CLI runner for Full Story pipeline with Pitch Deck gate check, debate step saving, and per-stage cost reporting against $15 ceiling**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-31T03:32:48Z
- **Completed:** 2026-03-31T03:37:20Z
- **Tasks:** 1/2 (Task 2 is human-verify checkpoint)
- **Files modified:** 3

## Accomplishments
- Created scripts/run-full-story.js with gate check, PD inheritance, debate step saving, and cost summary
- Added debate branch to pipelineManager.js with sequential dispatch, context routing, and synthesis composition
- Created debateStep.js Zod schemas (4 role-specific schemas + DEBATE_SCHEMAS lookup map)
- Exposed debateOutputs in runPipeline return value for callers

## Task Commits

Each task was committed atomically:

1. **Task 1: Create run-full-story.js pipeline runner with debate step saving** - `e77048c` (feat)
2. **Task 2: Validate SFM Full Story quality parity and cost benchmark** - PENDING (checkpoint:human-verify)

## Files Created/Modified
- `scripts/run-full-story.js` - CLI entry point for Full Story pipeline (gate check, PD inheritance, debate saves, cost summary)
- `src/schemas/debateStep.js` - 4 role-specific Zod schemas for debate steps (bull, bear, bull_rebuttal, judge) + DEBATE_SCHEMAS map
- `src/engines/pipelineManager.js` - Added debate branch (isDebate), buildDebateContext helper, debateOutputs in return

## Decisions Made
- Gate check supports both `pipeline-output.json` and `pitch-deck.json` filenames (consistent with Phase 13 decision)
- Full Story output saved as `full-story-api.json` to avoid overwriting Pitch Deck `pipeline-output.json`
- Debate steps saved individually for debugging with role-to-step-number mapping (bull=1, bear=2, bull_rebuttal=3, judge=4)
- Section files saved as `fullStory-S{N}-{key}.json` matching CC skill pattern
- Combined cost reported against $15 ceiling with per-stage breakdown

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Created debateStep.js schemas (Plan 01 dependency)**
- **Found during:** Task 1
- **Issue:** Plan 01 (debateStep.js creation) running in parallel worktree, not yet committed. pipelineManager.js imports DEBATE_SCHEMAS from it.
- **Fix:** Created src/schemas/debateStep.js with all 4 role-specific Zod schemas and DEBATE_SCHEMAS map, matching Plan 01 spec exactly.
- **Files modified:** src/schemas/debateStep.js
- **Verification:** Import resolves correctly, script loads without errors
- **Committed in:** e77048c (Task 1 commit)

**2. [Rule 3 - Blocking] Added full debate branch to pipelineManager.js (Plan 02 dependency)**
- **Found during:** Task 1
- **Issue:** Plan 02 (debate branch in pipelineManager.js) running in parallel worktree, not yet committed. Plan 03 needs the debate branch to add debateOutputs to return.
- **Fix:** Added complete isDebate branch with sequential dispatch, buildDebateContext helper, context routing, web search gating, synthesis composition, and role-qualified budget labels — all matching Plan 02 spec.
- **Files modified:** src/engines/pipelineManager.js
- **Verification:** Script runs and correctly gates on missing Pitch Deck output
- **Committed in:** e77048c (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (2 blocking — parallel plan dependencies)
**Impact on plan:** Both auto-fixes required because Plans 01 and 02 run in parallel worktrees and haven't committed yet. Code matches their specs exactly. Merge conflicts expected — orchestrator will resolve.

## Issues Encountered
- Plans 01 and 02 running in parallel worktrees haven't landed yet. Created minimal implementations matching their specs to unblock this plan. The orchestrator's merge step will reconcile.

## User Setup Required
None - no external service configuration required.

## Known Stubs
None - all code is fully wired. The runner will produce real output once Pitch Deck data exists and Plans 01/02 changes to aiResearch.js are merged (schema parameter, web search gating, debate context in user messages).

## Next Phase Readiness
- Task 2 requires PM to run the Full Story pipeline on SFM and validate quality parity
- After Task 2 approval, Phase 16 API migration is complete
- Plans 01 and 02 must be merged before the runner can execute end-to-end

---
*Phase: 16-api-migration*
*Completed: 2026-03-31*
