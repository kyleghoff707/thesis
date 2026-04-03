---
phase: 20-full-story-core-viewer
plan: 02
subsystem: ui
tags: [react, full-story, viewer, quality-scoring, scroll-spy, approval-gate]

# Dependency graph
requires:
  - phase: 20-full-story-core-viewer
    plan: 01
    provides: useFullStory hook, quality endpoint, SectionRenderer extensions, Wave 0 tests
provides:
  - Complete FullStory.jsx viewer with gate check, hero header, quality badges, sticky nav, sections, approval bar
affects: [full-story-viewer, report-stage-navigation]

# Tech tracking
tech-stack:
  added: []
  patterns: [DirectionBadge inline sub-component for Bull/Bear/Neutral, QualityBadge per-section overlay with traffic-light colors]

key-files:
  created: []
  modified:
    - src/components/FullStory.jsx

key-decisions:
  - "DirectionBadge and QualityBadge defined inline within FullStory.jsx rather than as separate files -- they are small and specific to this viewer"
  - "QualityBadge positioned above each SectionRenderer card (right-aligned, negative margin) to avoid modifying SectionRenderer's internal header API"
  - "handleApprove does NOT set currentStage since Full Story is the final stage (unlike PitchDeck which advances to stage 3)"
  - "Fallback verdict (D-09): when debateOutputs.judge is missing, displays most common section verdict via VerdictBadge instead of DirectionBadge"

patterns-established:
  - "Quality badge overlay pattern: flex justify-end + marginBottom -8 + zIndex 1 to float badge above SectionRenderer card without API changes"
  - "Direction-to-color mapping: Bull->green, Bear->red, Neutral->yellow for border-left accents and badge backgrounds"

requirements-completed: [FS-01, FS-04]

# Metrics
duration: 2min
completed: 2026-04-03
---

# Phase 20 Plan 02: Full Story Core Viewer Summary

**Complete FullStory.jsx rewrite with gate check, hero header (DirectionBadge + quality scores + judge verdict callout), sticky section nav with scroll spy, 6 sections via SectionRenderer with per-section QualityBadge overlays, and approval bar**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-03T04:47:39Z
- **Completed:** 2026-04-03T04:50:02Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Replaced the 114-line temporary FullStory.jsx shell with a 466-line full-featured viewer
- Hero header renders DirectionBadge (BULL/BEAR/NEUTRAL) when debateOutputs.judge.content.overallVerdict exists, with investment implication callout box (color-coded border-left per direction)
- Hero shows quality line "Quality: N/100 (Method: N)" with traffic-light colored text via qualityColor helper
- Fallback (D-09): when judge data is missing, hero shows most common section verdict via VerdictBadge(size="large")
- Gate check blocks access when pitchDeck approval is not 'approved' (and no existing report data)
- Sticky section nav (200px, top: 72px) with 6 items, verdict dots, scroll spy via useScrollSpy, keyboard accessibility
- 6 sections rendered via SectionRenderer with QualityBadge overlay per section (mechanical + methodology scores)
- Approval bar with "Approve Full Story" / "Reject Full Story" buttons, shown only when all 6 sections rendered and not yet approved
- handleApprove sets stageApprovals.fullStory = 'approved' without advancing currentStage (Full Story is final)
- handleReject prompts for optional notes via window.prompt, appends to report.notes with [Rejection] prefix
- Quality data gracefully degrades: null quality omits all quality-related UI without errors
- Exported _testExports { SECTION_DEFS, qualityColor } -- all 11 Wave 0 tests pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite FullStory.jsx** - `a6b222e` (feat)

## Files Created/Modified
- `src/components/FullStory.jsx` - Complete rewrite: gate check, hero header with DirectionBadge/quality/judge verdict, sticky nav with scroll spy, 6 sections via SectionRenderer with QualityBadge, approval bar

## Decisions Made
- DirectionBadge and QualityBadge defined inline within FullStory.jsx -- small and specific to this viewer, no separate files needed
- QualityBadge overlay positioned above SectionRenderer cards using flex justify-end + negative margin to avoid modifying SectionRenderer's internal header API
- handleApprove does NOT set currentStage since Full Story is the final stage
- Fallback verdict displays most common section verdict when judge data is missing

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Known Stubs
None - all functionality is fully wired. The component renders real data from useFullStory hook and quality endpoint.

## Self-Check: PASSED

All files verified present, all commit hashes found in git log.

---
*Phase: 20-full-story-core-viewer*
*Completed: 2026-04-03*
