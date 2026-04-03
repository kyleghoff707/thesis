---
phase: 20-full-story-core-viewer
plan: 01
subsystem: ui
tags: [react, hooks, vite-middleware, section-renderer, full-story, quality-scoring]

# Dependency graph
requires:
  - phase: 19-shared-report-infrastructure
    provides: SectionRenderer, ReportMarkdown, StageNavBar, report route structure
provides:
  - useFullStory hook with quality data fetching and polling
  - Quality JSON endpoint in Vite middleware
  - SectionRenderer primarySourceInsights and searchesPerformed blocks
  - FullStory route with updateReport prop
  - Wave 0 test stubs for FullStory pure functions
affects: [20-02-full-story-rewrite, full-story-viewer]

# Tech tracking
tech-stack:
  added: []
  patterns: [no-double-fetch hook init pattern, quality subdirectory fileMap resolution]

key-files:
  created:
    - src/hooks/useFullStory.js
    - src/components/__tests__/fullStory.test.js
  modified:
    - vite.config.js
    - src/App.jsx
    - src/components/SectionRenderer.jsx
    - src/components/__tests__/sectionRenderer.test.js

key-decisions:
  - "useFullStory captures Promise.all results in init to avoid double-fetch bug present in usePitchDeck"
  - "Quality endpoint maps to quality/ subdirectory via fileMap path value (no special middleware logic needed)"

patterns-established:
  - "No-double-fetch init: capture Promise.all results and use them for poll-start decision instead of re-fetching"
  - "Quality data as optional: 404 on quality endpoint is silent degradation, not an error"

requirements-completed: [FS-01, FS-04]

# Metrics
duration: 3min
completed: 2026-04-03
---

# Phase 20 Plan 01: Full Story Infrastructure Summary

**Vite quality endpoint, useFullStory hook with no-double-fetch init, SectionRenderer primarySourceInsights/searchesPerformed blocks, and Wave 0 test stubs**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-03T04:40:24Z
- **Completed:** 2026-04-03T04:43:39Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments
- Created useFullStory hook that fetches report + quality + progress + generationStatus, polls during generation, and re-fetches both report and quality on completion -- fixing the double-fetch-on-init bug from usePitchDeck
- Added full-story-quality entry to Vite middleware fileMap, resolving to quality/full-story-v4.quality.json subdirectory
- Extended SectionRenderer with two new content blocks (primarySourceInsights and searchesPerformed) following existing styling patterns
- Fixed App.jsx FullStory route to pass updateReport prop (required for approval bar)
- Created Wave 0 test stubs covering SECTION_DEFS, qualityColor thresholds, qualityMap join logic, primarySourceInsights contract, and searchesPerformed contract (17 new tests, all passing)

## Task Commits

Each task was committed atomically:

1. **Task 0: Create Wave 0 test stubs** - `499a43a` (test)
2. **Task 1: Add quality endpoint + fix App.jsx route + extend SectionRenderer** - `cf36faf` (feat)
3. **Task 2: Create useFullStory hook** - `17cd5cd` (feat)

## Files Created/Modified
- `src/hooks/useFullStory.js` - Full Story data fetching hook with quality, polling, no-double-fetch init
- `src/components/__tests__/fullStory.test.js` - Wave 0 test stubs for FullStory pure functions
- `src/components/__tests__/sectionRenderer.test.js` - Extended with primarySourceInsights and searchesPerformed contract tests
- `vite.config.js` - Added full-story-quality to fileMap (quality subdirectory resolution)
- `src/App.jsx` - Fixed FullStory route to pass updateReport prop
- `src/components/SectionRenderer.jsx` - Added blocks 10 (primarySourceInsights) and 11 (searchesPerformed)

## Decisions Made
- useFullStory captures Promise.all results in init() to avoid the double-fetch bug that exists in usePitchDeck (which calls fetchProgress+fetchGenerationStatus inside init, then re-fetches in init().then())
- Quality endpoint maps to quality/ subdirectory via fileMap path value -- the existing path.join resolution handles it automatically without special middleware logic
- Quality fetch silently degrades on 404 (console.warn only, no setError) since older reports may not have quality data

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Known Stubs
None - all functionality is fully wired. The Wave 0 tests use inline contract definitions (not imports from FullStory.jsx) which is intentional -- Plan 02 will rewrite FullStory.jsx and replace inline definitions with actual imports.

## Next Phase Readiness
- useFullStory hook ready for Plan 02 FullStory.jsx rewrite to consume
- Quality endpoint serving from Vite middleware, ready for quality score display
- SectionRenderer blocks ready to render primarySourceInsights and searchesPerformed data
- updateReport prop available in FullStory component for approval bar functionality
- Wave 0 tests ready to be upgraded with actual imports once Plan 02 exports _testExports

## Self-Check: PASSED

All files verified present, all commit hashes found in git log.

---
*Phase: 20-full-story-core-viewer*
*Completed: 2026-04-03*
