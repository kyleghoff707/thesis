---
phase: 24-pm-workflow-controls
plan: 02
subsystem: ui
tags: [react, inline-styles, navigation, dialog, state-machine]

# Dependency graph
requires:
  - phase: 23-delight-feature-wiring
    provides: ReportsList component, SectionRenderer, stage gating infrastructure
provides:
  - GenerateButton component with 7-state contextual label per pipeline stage
  - ConfirmGenerateDialog with stage-specific cost/time estimates
  - Toolbox integration rendering GenerateButton in header area
  - Cross-navigation between Research and Reports tabs
affects: [24-01-PLAN, 24-03-PLAN, 24-04-PLAN]

# Tech tracking
tech-stack:
  added: []
  patterns: [contextual-button-state-machine, overlay-dialog-with-escape]

key-files:
  created:
    - src/components/GenerateButton.jsx
    - src/components/ConfirmGenerateDialog.jsx
    - src/hooks/useGeneratePipeline.js
  modified:
    - src/components/Toolbox.jsx
    - src/components/ResearchList.jsx
    - src/components/ReportsList.jsx

key-decisions:
  - "GenerateButton rendered separately from CompanyHeader (per Research Pitfall 4) to avoid bloating CompanyHeader props"
  - "Created stub useGeneratePipeline hook for parallel plan compatibility (plan 24-01 creates full implementation)"
  - "getButtonState is a pure function exported via _testExports for unit testing"

patterns-established:
  - "Contextual button state machine: getButtonState() walks stages in order, returns action/label/style"
  - "Overlay dialog pattern: fixed overlay zIndex 1000 + dialog zIndex 1001, Escape + overlay click dismiss"

requirements-completed: [PM-04, PM-06]

# Metrics
duration: 3min
completed: 2026-04-04
---

# Phase 24 Plan 02: Research Initiation UX Summary

**GenerateButton with 7-state contextual label + ConfirmGenerateDialog with stage-specific cost/time estimates + bidirectional Research/Reports cross-navigation**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-04T18:23:12Z
- **Completed:** 2026-04-04T18:26:21Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- GenerateButton component renders correct contextual label for all 7 IC-05 states (Generate/View per stage, disabled while generating)
- ConfirmGenerateDialog shows stage-specific cost/time estimates per IC-06 with Escape key and overlay click dismiss
- Toolbox renders GenerateButton right-aligned between CompanyHeader and tab bar with error display
- ResearchList rows have "View Reports" ghost button navigating to Reports tab
- ReportsList ticker cards have "View Toolbox" link navigating back to Research Toolbox (only when matching research exists)

## Task Commits

Each task was committed atomically:

1. **Task 1: GenerateButton and ConfirmGenerateDialog components** - `132af56` (feat)
2. **Task 2: Toolbox integration + cross-navigation buttons** - `949ff36` (feat)

## Files Created/Modified
- `src/components/GenerateButton.jsx` - Contextual generate/view button with 7-state machine, Spinner for generating state
- `src/components/ConfirmGenerateDialog.jsx` - Modal dialog with stage-specific copy (title, estimate, body, extra context), Escape + overlay dismiss
- `src/hooks/useGeneratePipeline.js` - Stub hook (plan 24-01 creates full implementation)
- `src/components/Toolbox.jsx` - Added GenerateButton render, stageAvailability fetch, generationError display
- `src/components/ResearchList.jsx` - Added "View Reports" ghost button in action column
- `src/components/ReportsList.jsx` - Added "View Toolbox" link per ticker card (only when findReport matches)

## Decisions Made
- GenerateButton rendered separately from CompanyHeader via Toolbox.jsx (per Research Pitfall 4) rather than passing additional props into CompanyHeader
- Created minimal stub useGeneratePipeline hook so Toolbox.jsx compiles during parallel execution -- plan 24-01 creates the full implementation
- getButtonState is a pure function that accepts ticker as parameter (for route building) and is exported via _testExports for testing

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Created stub useGeneratePipeline hook**
- **Found during:** Task 2 (Toolbox integration)
- **Issue:** Plan 24-01 creates useGeneratePipeline.js but runs in parallel (wave 1). Import would fail.
- **Fix:** Created minimal stub hook with safe defaults (generating=false, triggerGeneration fires POST)
- **Files modified:** src/hooks/useGeneratePipeline.js
- **Verification:** Toolbox.jsx can import without crashing; plan 24-01 will overwrite with full implementation
- **Committed in:** 949ff36 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Stub hook is intentional for parallel execution. Plan 24-01 replaces it.

## Known Stubs

| File | Line | Stub | Reason | Resolved By |
|------|------|------|--------|-------------|
| src/hooks/useGeneratePipeline.js | 1-25 | Minimal stub hook | Plan 24-01 runs in parallel, creates full implementation | Plan 24-01 |

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- GenerateButton and ConfirmGenerateDialog ready for wiring to real pipeline (plan 24-01 provides useGeneratePipeline)
- Cross-navigation links functional between Research and Reports tabs
- Ready for plan 24-03 (checkpoint panel) and plan 24-04 (data gap panel)

---
*Phase: 24-pm-workflow-controls*
*Completed: 2026-04-04*
