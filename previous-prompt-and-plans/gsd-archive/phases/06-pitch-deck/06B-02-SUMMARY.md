---
phase: 06-pitch-deck
plan: 02
subsystem: ai-agents
tags: [cc-skill, section-regeneration, agent-dispatch, checkpoint-workflow]

# Dependency graph
requires:
  - phase: 06A-02
    provides: agent config.json with sectionMapping
  - phase: 06A-03
    provides: agent prompt.md files for dispatch
  - phase: 06A-04
    provides: risk-analyst agent definition
  - phase: 06A-05
    provides: management-evaluator agent definition
  - phase: 06A-06
    provides: competitor-evaluator agent definition
provides:
  - "/generate:section CC skill for targeted single-section regeneration"
  - "PM guidance injection into section re-runs"
  - "Section-level report update without full pipeline re-run"
affects: [generate-pitch-deck, generate-full-story, checkpoint-workflow]

# Tech tracking
tech-stack:
  added: []
  patterns: [section-level-agent-dispatch, pm-guidance-injection, report-assembly-update]

key-files:
  created:
    - ".claude/skills/generate-section/SKILL.md"
  modified: []

key-decisions:
  - "Skill uses same agent dispatch pattern as generate-one-pager — consistent prompt layering order"
  - "PM guidance appended last in prompt to ensure it overrides default behavior"
  - "Section save happens before report update — even if report update fails, section file is preserved"
  - "Retry-on-failure: one retry with error context, then abort without modifying existing report"

patterns-established:
  - "Section re-run pattern: load context -> slice DataPacket -> dispatch single agent -> validate -> update report"
  - "PM guidance injection: ADDITIONAL GUIDANCE FROM PM section appended to agent prompt"

requirements-completed: [CMD-01]

# Metrics
duration: 5min
completed: 2026-03-25
---

# Phase 06B Plan 02: Generate Section Skill Summary

**CC skill /generate:section enables targeted single-section regeneration for any stage (onePager/pitchDeck/fullStory) with optional PM guidance, using sectionMapping-based agent dispatch**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-25T19:43:35Z
- **Completed:** 2026-03-25T19:49:17Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Created 295-line SKILL.md with 8-step workflow for section-level regeneration
- Supports all 3 stages with full sectionMapping lookup from orchestrator config
- Loads prior section context, PSR findings, and existing report for informed regeneration
- PM guidance injection via optional 4th argument enables targeted redirection at checkpoints

## Task Commits

Each task was committed atomically:

1. **Task 1: Create /generate:section CC skill** - `d97a3e2` (feat)

## Files Created/Modified

- `.claude/skills/generate-section/SKILL.md` — 295-line CC skill for single section re-run with 8-step workflow (parse args, load config, load agent, load context, slice DataPacket, dispatch, validate+save, update report)

## Decisions Made

- Used same prompt layering order as generate-one-pager for consistency (prompt.md, DataPacket, curriculum, universal context, schema, prior sections, PSR, PM guidance)
- PM guidance is appended last in the prompt so it takes priority over default agent behavior
- Section save is atomic and independent from report update — resilient to partial failures
- Retry-on-failure follows D-05 pattern: one retry with error context, then abort cleanly

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- /generate:section skill is ready for use at checkpoints and as standalone command
- Depends on agents/ config files from 06A wave being present (config.json, prompt.md, dispatch-table.json)
- Ready for integration with generate-pitch-deck skill when that is built

---
*Phase: 06-pitch-deck*
*Completed: 2026-03-25*
