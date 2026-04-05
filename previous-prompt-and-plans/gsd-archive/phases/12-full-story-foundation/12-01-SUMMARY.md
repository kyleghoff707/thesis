---
phase: 12-full-story-foundation
plan: 01
subsystem: orchestration
tags: [dispatch-table, agent-config, json-schema, full-story, checklist, debate]

# Dependency graph
requires:
  - phase: 10-pipeline-integration
    provides: dispatch table with pitchDeck pattern, agent configs with sections arrays
provides:
  - Full Story dispatch table with 6 sections (no S7/S8)
  - 4-step debate structure (bull/bear/bull_rebuttal/judge) in dispatch table
  - S3 moat_checklist assigned to competitor-evaluator
  - Checklist scoring schema (PASS/FAIL/PARTIAL with evidence and confidence)
  - Debate step schema (4 role variants with structured content)
  - All 7 agent config.json files aligned with dispatch table
affects: [12-02-agent-prompts, 13-cc-skill, 14-debate-pipeline]

# Tech tracking
tech-stack:
  added: []
  patterns: [4-step-debate-dispatch, checklist-scoring-schema, oneOf-role-variants]

key-files:
  created:
    - agents/orchestrator/schemas/checklist-item.schema.json
    - agents/orchestrator/schemas/debate-step.schema.json
  modified:
    - agents/orchestrator/dispatch-table.json
    - agents/orchestrator/config.json
    - agents/business-analyst/config.json
    - agents/valuation-specialist/config.json
    - agents/synthesis-writer/config.json
    - agents/financial-analyst/config.json

key-decisions:
  - "Full Story has 6 sections (removed trading_strategy S7 and pace_plan S8 per D-10)"
  - "S3 moat_checklist ownership moved from business-analyst to competitor-evaluator per D-11"
  - "Debate is 4 sequential steps with only bear having web search per D-07/D-12"
  - "Checklist verdicts use PASS/FAIL/PARTIAL (not numeric scores) per D-01"

patterns-established:
  - "Debate dispatch: isDebate flag + sequential steps array with role/agent/webSearch/receivesContext"
  - "Checklist schema: items array with verdict/evidence/confidence + summary with scoreDisplay"
  - "Debate step schema: oneOf content variants per role (BullThesis, BearInversion, BullRebuttal, JudgeVerdict)"

requirements-completed: [ORCH-02, ORCH-04]

# Metrics
duration: 3min
completed: 2026-03-29
---

# Phase 12 Plan 01: Full Story Foundation Summary

**Full Story dispatch table with 6-section layout, 4-step adversarial debate, and checklist/debate JSON schemas for agent output contracts**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-29T22:50:31Z
- **Completed:** 2026-03-29T22:54:28Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Updated dispatch table fullStory from 8 sections (3 phases) to 6 sections (2 phases) with proper debate structure
- Defined 4-step adversarial debate in dispatch table (bull/bear/bull_rebuttal/judge) with web search restricted to bear only
- Created checklist-item.schema.json defining PASS/FAIL/PARTIAL verdicts with evidence and confidence for all 43 checklist items
- Created debate-step.schema.json with 4 role-specific content variants (BullThesis, BearInversion, BullRebuttal, JudgeVerdict)
- Aligned all 7 agent config.json sections.fullStory arrays with the updated dispatch table assignments

## Task Commits

Each task was committed atomically:

1. **Task 1: Update dispatch table and all agent configs for Full Story** - `e2a3831` (feat)
2. **Task 2: Design and document checklist scoring and debate step schemas** - `166aa5c` (feat)

## Files Created/Modified
- `agents/orchestrator/dispatch-table.json` - Removed S7/S8, added 4-step debate structure, updated sectionKeys to 6
- `agents/orchestrator/config.json` - Updated sections.fullStory to [1,2,3,4,5,6], sectionMapping to match
- `agents/business-analyst/config.json` - fullStory [2,3] -> [2] (S3 moat moved to competitor-evaluator)
- `agents/valuation-specialist/config.json` - fullStory [5,7] -> [5] (S7 trading_strategy removed)
- `agents/synthesis-writer/config.json` - fullStory [8] -> [6] (bull + bull_rebuttal in debate)
- `agents/financial-analyst/config.json` - fullStory [5] -> [6] (judge role in debate)
- `agents/orchestrator/schemas/checklist-item.schema.json` - New: ChecklistSectionData schema
- `agents/orchestrator/schemas/debate-step.schema.json` - New: DebateStepOutput schema with 4 role variants

## Decisions Made
- Full Story reduced to 6 sections per D-10: trading_strategy and pace_plan are human judgment, not AI work
- S3 moat_checklist assigned to competitor-evaluator per D-11: they already own Pitch Deck moat validation, natural deepening
- Debate step 2 (bear/risk-analyst) is the only step with web search per D-07: bear researches short-seller theses and negative coverage
- Checklist uses PASS/FAIL/PARTIAL verdicts per D-01: binary conviction thinking matching Rule One methodology (no numeric scales)
- S6 primary owner is synthesis-writer in orchestrator config per D-12: debate uses multiple agents but synthesis-writer composes the final output

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Dispatch table and agent configs are the structural foundation for plan 12-02 (agent prompt updates)
- Schemas are documentation-as-code contracts that agent prompts will reference for output format
- competitor-evaluator/config.json and management-evaluator/config.json and risk-analyst/config.json were already correct and required no changes

## Self-Check: PASSED

All 9 created/modified files verified on disk. Both task commits (e2a3831, 166aa5c) verified in git log.

---
*Phase: 12-full-story-foundation*
*Completed: 2026-03-29*
