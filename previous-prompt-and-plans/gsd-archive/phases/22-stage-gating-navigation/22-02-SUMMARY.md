---
phase: 22-stage-gating-navigation
plan: 02
subsystem: ui
tags: [react, stage-pills, gate-logic, navigation, reports-list]

# Dependency graph
requires:
  - phase: 22-stage-gating-navigation
    plan: 01
    provides: Enhanced /api/thes1s/reports response with per-ticker stage availability
provides:
  - ReportsList with 3 gate-aware stage pills per ticker row (OP/PD/FS)
  - Stage status detection (approved/generated/pending/locked)
  - Gate-enforced pill navigation to stage routes
  - Lock icon and tooltip on gated stages
affects: [22-03, 23-delight-features]

# Tech tracking
tech-stack:
  added: []
  patterns: [stage-pill-status-detection, gate-aware-navigation-pills]

key-files:
  created: []
  modified: [src/components/ReportsList.jsx]

key-decisions:
  - "Backward-compatible API handling: component supports both old string[] and new object[] ticker formats"
  - "STAGE_DEFS/GATE_TOOLTIPS defined inside component function (not module-level) because C palette is mutable -- consistent with Phase 21 decision"
  - "No row-level onClick -- only pill clicks navigate, per UI-SPEC interaction contract"

patterns-established:
  - "StagePill inline pattern: status-based coloring with approved(green)/generated(teal-tint)/pending(gray)/locked(dimmed+lock) states"
  - "Gate enforcement reuses same approval key pattern as StageNavBar for consistency"

requirements-completed: [NAV-01, NAV-02, NAV-04]

# Metrics
duration: 2min
completed: 2026-04-03
---

# Phase 22 Plan 02: ReportsList Stage Pills Summary

**ReportsList rewritten with 3 gate-aware stage pills (OP/PD/FS) per ticker row -- approved/generated/pending/locked status detection with color-coded pills and lock icons**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-03T13:51:52Z
- **Completed:** 2026-04-03T13:53:38Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Rewrote ReportsList.jsx from single "One Pager" badge to 3 stage pills (OP/PD/FS) per ticker row
- Implemented gate logic: PD locked until OP approved, FS locked until PD approved
- Added status-based pill styling matching UI-SPEC color map (green/teal-tint/gray/dimmed)
- Added LockIcon (10px SVG) on locked pills with opacity 0.5 and title tooltip explaining gate condition
- Removed row-level onClick -- only pill buttons navigate to stage routes

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite ReportsList with multi-stage pills, gate logic, and status detection** - `a657b18` (feat)

**Plan metadata:** pending

## Files Created/Modified
- `src/components/ReportsList.jsx` - Rewrote with STAGE_DEFS, GATE_TOOLTIPS, getStageStatus(), getPillStyle(), LockIcon, handlePillClick() -- 3 pills per ticker row with gate-aware navigation

## Decisions Made
- Backward-compatible API handling: supports both old string[] and new object[] ticker data formats from /api/thes1s/reports
- STAGE_DEFS and GATE_TOOLTIPS defined inside the component function (not module-level) because the C palette object is mutable and theme changes need to be reflected -- consistent with the Phase 21 pattern decision
- No row-level onClick on ticker cards -- only stage pill buttons trigger navigation, matching the UI-SPEC interaction contract (D-01, D-10)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Backward-compatible API response handling**
- **Found during:** Task 1
- **Issue:** Plan assumed new API shape from Plan 01, but Plan 01 may not be merged yet; old API returns string[] not object[]
- **Fix:** Added runtime detection: `typeof tickerObj === 'string'` check handles both old (string[]) and new (object[]) shapes gracefully
- **Files modified:** src/components/ReportsList.jsx
- **Verification:** Component renders correctly with both data shapes
- **Committed in:** a657b18

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Essential for deployment ordering flexibility. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Known Stubs
None - all data paths are wired to the API response and report data.

## Next Phase Readiness
- ReportsList pills ready for Plan 03 (Layout NavLink highlighting for Reports tab)
- Gate logic consistent with StageNavBar -- both use the same stageApprovals pattern

---
*Phase: 22-stage-gating-navigation*
*Completed: 2026-04-03*
