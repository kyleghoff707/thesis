---
phase: 10-pipeline-integration-prompt-fixes
plan: 02
subsystem: agents
tags: [dispatch-table, agent-prompts, structured-output, api-dispatch, datapacket]

# Dependency graph
requires:
  - phase: 08-core-agent-dispatch
    provides: dispatchAgent reads dispatch-table.json and injects prompt.md as system message
provides:
  - dispatch-table.json with one-section-per-dispatch for ReportSectionSchema compatibility
  - Agent prompts cleaned of CC-specific references and unavailable tool documentation
  - PSR agents with API Dispatch Mode notes for graceful degradation
affects: [10-03-pipeline-integration-prompt-fixes, pipeline-smoke-test]

# Tech tracking
tech-stack:
  added: []
  patterns: [one-dispatch-per-section for structured output compatibility, DataPacket-first agent design]

key-files:
  created: []
  modified:
    - agents/orchestrator/dispatch-table.json
    - agents/valuation-specialist/prompt.md
    - agents/business-analyst/prompt.md
    - agents/competitor-evaluator/prompt.md
    - agents/financial-analyst/prompt.md
    - agents/annual-reader/prompt.md
    - agents/quarterly-reader/prompt.md

key-decisions:
  - "One dispatch = one section = one ReportSectionSchema object -- no multi-section returns"
  - "Preserve existing tool documentation in PSR prompts for future custom tool wiring"
  - "DataPacket is the primary data source for all agents -- tools are supplementary"

patterns-established:
  - "One-section-per-dispatch: every dispatch-table entry has sections array of length 1"
  - "API Dispatch Mode note: top-of-prompt block explaining tool unavailability for PSR agents"
  - "DataPacket-first references: agents reference dataPacket.field paths instead of tool calls"

requirements-completed: [FIX-01, FIX-03, FIX-04, FIX-05]

# Metrics
duration: 4min
completed: 2026-03-29
---

# Phase 10 Plan 02: Prompt Audit & Dispatch Fixes Summary

**Split multi-section dispatches to one-per-section for ReportSectionSchema, removed CC-specific references, replaced unavailable tool documentation with DataPacket field paths, and added PSR agent dispatch mode notes**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-29T04:51:42Z
- **Completed:** 2026-03-29T04:55:54Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments
- dispatch-table.json pitchDeck now has exactly 10 single-section dispatch entries (was 8 with two multi-section entries), onePager also split from 3 to 5 entries
- Zero instances of "CC skill", "Claude Code", or "return an array of TWO" across all agent prompts
- All 6 unavailable tool references (comparePeers, getMetric, getFinancialLine, computeMOS, readFilingSection, getTranscriptExcerpt) either replaced with DataPacket references or noted as unavailable in dispatch mode
- PSR agents (annual-reader, quarterly-reader) have clear API Dispatch Mode guidance with graceful degradation instructions

## Task Commits

Each task was committed atomically:

1. **Task 1: Split multi-section dispatch entries in dispatch-table.json** - `be0b1be` (feat)
2. **Task 2: Fix CC-specific references and multi-section output instructions** - `49cbe03` (fix)
3. **Task 3: Add DataPacket workaround notes for PSR agent tool unavailability** - `7a62a2d` (fix)

## Files Created/Modified
- `agents/orchestrator/dispatch-table.json` - Split multi-section entries: pitchDeck 10 entries, onePager 5 entries, all single-section
- `agents/valuation-specialist/prompt.md` - Removed CC skill reference, replaced comparePeers tool ref with DataPacket + web search
- `agents/business-analyst/prompt.md` - Replaced two-object output with single ReportSectionSchema guidance
- `agents/competitor-evaluator/prompt.md` - Replaced comparePeers tool section with DataPacket peer metrics, fixed all tool references, single-section output
- `agents/financial-analyst/prompt.md` - Replaced 6 custom tool docs with DataPacket field path reference, single-section output
- `agents/annual-reader/prompt.md` - Added API Dispatch Mode note for readFilingSection unavailability
- `agents/quarterly-reader/prompt.md` - Added API Dispatch Mode note for readFilingSection + getTranscriptExcerpt unavailability

## Decisions Made
- One-section-per-dispatch is mandatory: ReportSectionSchema returns a single object, so each dispatch entry must target exactly one section
- Preserved tool documentation in PSR prompts (annual-reader, quarterly-reader) rather than deleting it -- the docs describe the ideal workflow and will be useful when custom tools are eventually wired
- Used DataPacket field path references (e.g., `dataPacket.peerMetrics`, `dataPacket.growthRates`) as the primary data access pattern instead of tool calls

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Fixed comparePeers reference in valuation-specialist prompt line 516**
- **Found during:** Task 2 (prompt audit)
- **Issue:** valuation-specialist prompt.md line 516 referenced `comparePeers` tool for market share ceiling analysis -- this tool is unavailable in API dispatch
- **Fix:** Replaced with "peer metrics from the DataPacket and web search"
- **Files modified:** agents/valuation-specialist/prompt.md
- **Verification:** grep confirms no remaining comparePeers references in prompt.md files targeted by this plan
- **Committed in:** 49cbe03 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Essential for correctness -- without this fix, the valuation-specialist would attempt to call an unavailable tool during market share ceiling analysis. No scope creep.

## Issues Encountered
None

## Known Stubs
None -- all changes are prompt text edits, no code stubs.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All agent prompts are now compatible with API dispatch (structured output, single-section returns, DataPacket-first data access)
- dispatch-table.json is ready for pipelineManager.js to read and dispatch one-section-per-call
- Plan 03 (pipeline wiring validation) can proceed -- prompts and dispatch table are aligned with the API dispatch infrastructure built in Phases 07-09

## Self-Check: PASSED

All 7 modified files verified present. All 3 task commits verified in git log.
