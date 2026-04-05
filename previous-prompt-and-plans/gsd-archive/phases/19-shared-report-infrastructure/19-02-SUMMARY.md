---
phase: 19-shared-report-infrastructure
plan: 02
subsystem: ui
tags: [react, intersection-observer, scroll-spy, navigation, hooks]

# Dependency graph
requires:
  - phase: 19-shared-report-infrastructure
    provides: reportHelpers.js and Spinner.jsx shared modules (plan 01)
provides:
  - useScrollSpy hook for shared section tracking across all report viewers
  - StageNavBar component for switching between report stages (One Pager / Pitch Deck / Full Story)
  - D-08 sidebar teal accent bar styling in OnePager and PitchDeck
affects: [20-one-pager-viewer, 21-pitch-deck-viewer, 22-full-story-viewer]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "useScrollSpy hook: IntersectionObserver + rAF debouncing for flicker-free scroll tracking"
    - "StageNavBar: gate-based tab locking via stageApprovals prop"
    - "Sidebar D-08 accent: 3px solid C.accent left border on active section"

key-files:
  created:
    - src/hooks/useScrollSpy.js
    - src/components/StageNavBar.jsx
    - src/hooks/__tests__/useScrollSpy.test.js
    - src/components/__tests__/stageNavBar.test.js
  modified:
    - src/components/OnePager.jsx
    - src/components/PitchDeck.jsx

key-decisions:
  - "topOffset 100px for both OnePager and PitchDeck (52px nav + 40px StageNavBar + 8px buffer) even though StageNavBar not yet wired"
  - "rAF debouncing in useScrollSpy prevents flicker on fast scrolling (D-09)"
  - "Sidebar padding normalized from 6px/10px to 8px/12px per 4-point spacing grid"
  - "PitchDeck sidebar fontWeight consolidated from 700 to 600 per 2-weight contract"

patterns-established:
  - "useScrollSpy: configurable prefix, threshold, topOffset for any section-based viewer"
  - "_testExports pattern for StageNavBar STAGES array (gate logic testable without rendering)"

requirements-completed: [INFRA-02, INFRA-04]

# Metrics
duration: 5min
completed: 2026-04-03
---

# Phase 19 Plan 02: useScrollSpy Hook and StageNavBar Component Summary

**Shared IntersectionObserver hook with rAF debouncing and 3-tab stage navigation bar with gate-based locking**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-03T02:42:07Z
- **Completed:** 2026-04-03T02:47:15Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Created useScrollSpy hook that eliminates duplicated IntersectionObserver logic from OnePager and PitchDeck (71 lines removed)
- Built StageNavBar with 3 tabs, lock/unlock gate logic, teal accent active state, and lock icon SVG per D-04/D-05/D-06
- Fixed sidebar active-item styling per D-08: teal accent left border + C.accent text color on active section
- Updated scrollMarginTop from 120 to 160 in both components (6 occurrences total) to account for StageNavBar height

## Task Commits

Each task was committed atomically:

1. **Task 1: Create useScrollSpy hook, StageNavBar component, and tests** - `dd0027b` (feat) -- TDD: RED -> GREEN
2. **Task 2: Refactor OnePager.jsx and PitchDeck.jsx** - `4c2e8d2` (refactor)

## Files Created/Modified
- `src/hooks/useScrollSpy.js` - Shared IntersectionObserver hook with rAF debouncing, configurable offset
- `src/components/StageNavBar.jsx` - Stage navigation tabs with gate-based lock/unlock, lock icon SVG
- `src/hooks/__tests__/useScrollSpy.test.js` - 3 tests covering hook interface and module structure
- `src/components/__tests__/stageNavBar.test.js` - 8 tests covering STAGES data structure, gate conditions
- `src/components/OnePager.jsx` - Removed inline IntersectionObserver, use useScrollSpy, D-08 sidebar accent
- `src/components/PitchDeck.jsx` - Removed inline IntersectionObserver, use useScrollSpy, D-08 sidebar accent

## Decisions Made
- Used topOffset of 100px for both components for consistency, even though OnePager does not yet render StageNavBar (it will be wired in Phase 22)
- Removed unused React imports (useState, useEffect, useRef) from OnePager after refactoring out the observer logic
- Normalized sidebar padding from 6px/10px to 8px/12px and borderRadius from 6 to 8 per the UI-SPEC's 4-point spacing grid
- Consolidated PitchDeck sidebar active fontWeight from 700 to 600 to match the 2-weight contract (400/600)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Known Stubs
None - all features are fully wired.

## Next Phase Readiness
- useScrollSpy hook ready for consumption by FullStory.jsx (Phase 22)
- StageNavBar ready to be rendered in report route layout (Phase 22)
- OnePager and PitchDeck sidebars now use consistent D-08 accent styling
- All 1025 src/ tests pass, production build succeeds

---
*Phase: 19-shared-report-infrastructure*
*Completed: 2026-04-03*
