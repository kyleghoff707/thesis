---
phase: 12-full-story-foundation
plan: 02
subsystem: orchestration
tags: [agent-prompts, full-story, checklist, debate, bear-inversion, valuation-confirmation]

# Dependency graph
requires:
  - phase: 12-full-story-foundation
    provides: dispatch table with 6 sections, checklist-item.schema.json, debate-step.schema.json
provides:
  - 7 agent prompts updated with Full Story section instructions
  - 3 checklist sections (meaning, moat, management) using unified PASS/FAIL/PARTIAL schema
  - 4 debate roles (bull, bear, bull_rebuttal, judge) using lightweight debate step format
  - Valuation confirmation section with 5 growth quality checks
affects: [13-cc-skill, 14-debate-pipeline, 15-quality-scoring]

# Tech tracking
tech-stack:
  added: []
  patterns: [unified-checklist-schema-in-prompts, lightweight-debate-format-in-prompts, pitch-deck-inheritance-pattern]

key-files:
  created: []
  modified:
    - agents/business-analyst/prompt.md
    - agents/competitor-evaluator/prompt.md
    - agents/valuation-specialist/prompt.md
    - agents/synthesis-writer/prompt.md
    - agents/financial-analyst/prompt.md
    - agents/risk-analyst/prompt.md
    - agents/management-evaluator/prompt.md

key-decisions:
  - "All 3 checklist prompts (BA, CE, ME) use identical unified schema from checklist-item.schema.json"
  - "All 4 debate roles use lightweight format from debate-step.schema.json (not ReportSectionSchema)"
  - "Only bear (risk-analyst) has web search in debate per D-07; bull, bull_rebuttal, judge explicitly state no web search"
  - "Management-evaluator REVIEW/INSUFFICIENT_DATA verdicts mapped to PARTIAL in unified schema"

patterns-established:
  - "Full Story section instructions appended after existing Required Web Searches section with --- separator"
  - "Checklist sections include all items numbered 1-N, verdict logic, red flag examples, and Pitch Deck inheritance reference"
  - "Debate role sections specify lightweight output format with explicit no-web-search statement (except bear)"

requirements-completed: [ORCH-03]

# Metrics
duration: 6min
completed: 2026-03-29
---

# Phase 12 Plan 02: Agent Prompt Updates for Full Story Summary

**7 agent prompts updated with Full Story instructions: 3 checklist sections (unified PASS/FAIL/PARTIAL schema), 4 debate roles (lightweight format, bear-only web search), and valuation confirmation with 5 growth quality checks**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-29T22:57:54Z
- **Completed:** 2026-03-29T23:04:21Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments
- Added Full Story S2 Meaning Checklist (15 items) to business-analyst prompt with unified checklist scoring schema
- Added Full Story S3 Moat Checklist (15 items) to competitor-evaluator prompt with pricing power, anti-fragility, and field research deep dives
- Added Full Story S5 Valuation Confirmation to valuation-specialist prompt with 5 growth quality checks (debt-fueled, organic vs acquisition, growth ceiling, growth stage, buy price confirmation)
- Added Debate Step 1 (Bull Thesis) and Step 3 (Bull Rebuttal) to synthesis-writer prompt with lightweight format
- Added Debate Step 4 (Judge Verdict) to financial-analyst prompt with exchange scoring (Strong Bull/Strong Bear/Unresolved)
- Added Debate Step 2 (Bear Inversion) to risk-analyst prompt with web search enabled and severity classification (thesis_killer/significant/minor)
- Aligned management-evaluator S4 data format with unified checklist-item.schema.json (items/number/item/verdict/checklistType/summary.scoreDisplay)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Full Story checklist section instructions to business-analyst and competitor-evaluator prompts** - `ff72d6b` (feat)
2. **Task 2: Add Full Story section instructions to valuation-specialist, synthesis-writer, and financial-analyst prompts** - `4c9916e` (feat)
3. **Task 3: Update risk-analyst bear debate section and management-evaluator unified checklist schema** - `2db397f` (feat)

## Files Created/Modified
- `agents/business-analyst/prompt.md` - Full Story S2 Meaning Checklist with 15 items, unified schema, KPI deep dive instructions
- `agents/competitor-evaluator/prompt.md` - Full Story S3 Moat Checklist with 15 items, pricing power, anti-fragility check
- `agents/valuation-specialist/prompt.md` - Full Story S5 Valuation Confirmation with debt-fueled growth, organic vs acquisition, growth ceiling, growth stage classification
- `agents/synthesis-writer/prompt.md` - Debate Step 1 Bull Thesis + Step 3 Bull Rebuttal, lightweight format, no web search
- `agents/financial-analyst/prompt.md` - Debate Step 4 Judge Verdict with exchanges, overall verdict direction, investment implication
- `agents/risk-analyst/prompt.md` - Debate Step 2 Bear Inversion with web search, severity classification, overallBearCase
- `agents/management-evaluator/prompt.md` - S4 data format aligned: items/number/item/verdict PASS|FAIL|PARTIAL, checklistType, summary.scoreDisplay

## Decisions Made
- All 3 checklist sections use identical unified schema matching checklist-item.schema.json from Plan 01 -- consistency across meaning (BA), moat (CE), and management (ME)
- Old management-evaluator verdicts (REVIEW, INSUFFICIENT_DATA) mapped to PARTIAL per D-01 binary conviction philosophy
- Bear (risk-analyst) is the only debate role with web search per D-07 -- bull, bull_rebuttal, and judge explicitly note "You do NOT have web search"
- Debate roles produce lightweight format (not ReportSectionSchema) per D-06 -- orchestrator composes all 4 step outputs into final S6 section

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All 7 agent prompts now have Full Story instructions matching the dispatch table from Plan 01
- Schemas from Plan 01 (checklist-item, debate-step) are referenced consistently across all relevant prompts
- Ready for Phase 13 (CC skill implementation) which will use these prompts to generate Full Story sections
- The 6-section Full Story structure is now fully defined: dispatch table (Plan 01) + agent prompts (Plan 02)

## Self-Check: PASSED

All 7 modified files verified on disk. All 3 task commits (ff72d6b, 4c9916e, 2db397f) verified in git log.

---
*Phase: 12-full-story-foundation*
*Completed: 2026-03-29*
