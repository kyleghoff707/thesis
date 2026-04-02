---
phase: 17-end-to-end-validation
plan: 01
subsystem: pipeline
tags: [cli, pipeline-chaining, gate-checks, quality-scoring, critic]

# Dependency graph
requires:
  - phase: 16.2-one-pager-api-migration
    provides: Single-call One Pager generator via pipelineManager
  - phase: 15-quality-system
    provides: critic.js dual scoring (mechanical + methodology) for PD and FS
provides:
  - "--stage all flag in run-pipeline.js for end-to-end 3-stage chaining"
  - "Automatic gate checks between stages (OP verdict, PD/FS quality scores)"
  - "Inline quality scoring via critic.js validateStage()"
  - "Combined budget.json with per-stage cost breakdown"
affects: [17-end-to-end-validation, pipeline-validation]

# Tech tracking
tech-stack:
  added: []
  patterns: ["assembleAndPreprocess() shared helper for DataPacket + filing preprocessing", "Stage chaining with gate checks and inline quality scoring"]

key-files:
  modified: ["scripts/run-pipeline.js"]

key-decisions:
  - "Extracted DataPacket assembly + filing preprocessing into shared assembleAndPreprocess() function to avoid duplication between single-stage and all-stage modes"
  - "Gate thresholds: OP requires PASS verdict, PD and FS require 85+ on both mechanical and methodology scores"
  - "Full Story uses maxSearches: 7 matching run-full-story.js convention"

patterns-established:
  - "Stage chaining: single DataPacket assembled once, shared across all 3 stages"
  - "Gate check pattern: run quality scoring inline, fail fast with clear error identifying which stage and why"

requirements-completed: [QUAL-02]

# Metrics
duration: 2min
completed: 2026-04-01
---

# Phase 17 Plan 01: End-to-End Pipeline Chaining Summary

**run-pipeline.js extended with --stage all flag for automated 3-stage chaining (OP->PD->FS) with inline quality gate checks via critic.js**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-02T01:09:22Z
- **Completed:** 2026-04-02T01:11:32Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Added `--stage all` flag that chains One Pager, Pitch Deck, and Full Story in a single invocation
- Gate checks between stages: OP verdict must be PASS, PD/FS both mechanical and methodology scores must be 85+
- Inline quality scoring runs between stages using critic.js validateStage() so gate decisions use real scores
- PD sections injected into DataPacket before Full Story for thesis inheritance
- Combined budget.json written with per-stage cost breakdown and $15 ceiling check
- Backward compatible: existing positional argument syntax unchanged

## Task Commits

Each task was committed atomically:

1. **Task 1: Add --stage all chaining with gate checks and inline quality scoring** - `a7480f8` (feat)

## Files Created/Modified
- `scripts/run-pipeline.js` - Extended with --stage all chaining, gate checks, inline quality scoring, combined budget reporting

## Decisions Made
- Extracted shared `assembleAndPreprocess()` helper to avoid duplicating DataPacket assembly and filing pre-processing between single-stage and all-stage code paths
- Gate thresholds match D-04/D-05 from context: OP uses PASS/FAIL verdict, PD and FS use 85+ dual scores
- Full Story inherits PD sections via `dataPacket.pitchDeckSections` matching run-full-story.js pattern
- Debate outputs and section outputs saved individually for Full Story matching run-full-story.js conventions

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Known Stubs
None - all functionality is fully wired.

## Next Phase Readiness
- Pipeline chaining is ready for end-to-end validation with MNST ticker
- Quality scoring runs inline so gate decisions are automated
- Combined budget tracking enables cost ceiling verification

## Self-Check: PASSED

- scripts/run-pipeline.js: FOUND
- 17-01-SUMMARY.md: FOUND
- Commit a7480f8: FOUND
- stage === 'all': FOUND
- validateStage: FOUND
- GATE FAILED: FOUND
- pitchDeckSections: FOUND
- budget.json: FOUND

---
*Phase: 17-end-to-end-validation*
*Completed: 2026-04-01*
