---
phase: 23-delight-feature-wiring
plan: 01
subsystem: ui
tags: [claude-api, deep-dive, glossary, react, markdown, inline-annotations]

# Dependency graph
requires:
  - phase: 19-shared-renderers
    provides: ReportMarkdown component with citation rendering
  - phase: 21-full-story-viewer
    provides: SectionRenderer component and DeepDivePanel
provides:
  - deepDive.js engine for on-demand Claude API deep dive analysis
  - ReportMarkdown with "Tell me more" claim links and dashed-underline glossary terms
  - SectionRenderer prop passthrough for notableClaims and glossaryTerms
  - DeepDivePanel with Go Deeper button and iterative depth tracking
affects: [23-02, 23-03, pitch-deck-viewer, full-story-viewer]

# Tech tracking
tech-stack:
  added: []
  patterns: [inline-annotation-rendering, density-limited-term-highlighting, iterative-deepening-ui]

key-files:
  created:
    - src/engines/deepDive.js
    - src/engines/__tests__/deepDive.test.js
    - src/components/__tests__/glossaryHelpers.test.js
  modified:
    - src/components/ReportMarkdown.jsx
    - src/components/SectionRenderer.jsx
    - src/components/pitchDeck/DeepDivePanel.jsx

key-decisions:
  - "Deep dive engine uses direct fetch to Claude API (same pattern as companyAdapter.js Layer 3) rather than SDK"
  - "Glossary density limit of 3 terms per paragraph prevents visual clutter in narratives"
  - "processChildrenWithGlossary and processChildrenWithClaims are chained after citations in paragraph rendering pipeline"

patterns-established:
  - "Inline annotation pattern: process paragraph children through chained transformers (citations -> claims -> glossary)"
  - "Density limiting pattern: counter-based limit per React.Children.map call"
  - "Deep dive depth tracking: previousDives array length gates max depth at 3"

requirements-completed: [DLT-01, DLT-03]

# Metrics
duration: 7min
completed: 2026-04-03
---

# Phase 23 Plan 01: Deep Dive Engine, Claims, and Glossary Rendering Summary

**Claude API deep dive engine with "Tell me more" inline links, dashed-underline glossary terms (3/paragraph limit), and Go Deeper iterative deepening in DeepDivePanel**

## Performance

- **Duration:** 7 min
- **Started:** 2026-04-04T04:17:29Z
- **Completed:** 2026-04-04T04:24:29Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments
- Deep dive engine (deepDive.js) with Claude API integration, max depth 3, all error paths returning { content, error }
- ReportMarkdown enhanced with processChildrenWithClaims ("Tell me more" links) and processChildrenWithGlossary (dashed-underline terms with 3-per-paragraph density limit)
- DeepDivePanel enhanced with Go Deeper button, depth counter, error state, and ReportMarkdown rendering
- 12 new tests (7 engine + 5 component), all 1089 src tests passing

## Task Commits

Each task was committed atomically:

1. **Task 1: Create deepDive.js engine with tests (TDD)** - `68251b2` (feat)
2. **Task 2: Enhance ReportMarkdown + SectionRenderer for claims and glossary terms** - `160879e` (feat)
3. **Task 3: Enhance DeepDivePanel with Go Deeper button and depth tracking** - `bc91dc9` (feat)

## Files Created/Modified
- `src/engines/deepDive.js` - Claude API deep dive engine with generateDeepDive and buildDeepDivePrompt
- `src/engines/__tests__/deepDive.test.js` - 7 tests covering success, missing key, max depth, API error, network error, headers, prompt content
- `src/components/ReportMarkdown.jsx` - Added processChildrenWithClaims, processChildrenWithGlossary, escapeRegex; updated makeComponents and default export signatures
- `src/components/SectionRenderer.jsx` - Added notableClaims, onDeepDiveClick, glossaryTerms, onGlossaryClick props; passes through to ReportMarkdown
- `src/components/pitchDeck/DeepDivePanel.jsx` - Added depth, maxDepth, onGoDeeper, error props; Go Deeper button with depth counter; ReportMarkdown for string content
- `src/components/__tests__/glossaryHelpers.test.js` - 5 tests for glossary density limiting, case-insensitive matching, non-string passthrough

## Decisions Made
- Deep dive engine uses direct fetch to Claude API (same pattern as companyAdapter.js Layer 3) rather than the SDK, keeping consistency with existing codebase patterns
- Glossary density limit of 3 terms per paragraph prevents visual clutter while still highlighting the most important terms
- Paragraph processing pipeline chains citations -> claims -> glossary in that order, with each transformer handling its own child types

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed test isolation for vi.doMock with resetModules**
- **Found during:** Task 1 (TDD GREEN phase)
- **Issue:** Static `vi.mock` at module top affected all tests; Test 2's empty CLAUDE_KEY leaked to subsequent tests via module cache
- **Fix:** Used `vi.resetModules()` in `beforeEach` with `vi.doMock` + dynamic import per test via `loadModule()` helper
- **Files modified:** src/engines/__tests__/deepDive.test.js
- **Verification:** All 7 tests pass independently and in sequence
- **Committed in:** 68251b2

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Test isolation fix was necessary for correct test behavior. No scope creep.

## Issues Encountered
None beyond the test isolation fix documented above.

## Known Stubs
None. All functions are fully implemented with real logic, not placeholder returns.

## User Setup Required
None - no external service configuration required. Deep dive engine uses the existing VITE_CLAUDE_KEY from .env.local.

## Next Phase Readiness
- Deep dive engine ready for Plan 03 (Wave 2) to wire into PitchDeck and FullStory viewers
- SectionRenderer and ReportMarkdown accept notableClaims and glossaryTerms props — Plan 03 just needs to pass data from report JSON
- DeepDivePanel ready to be opened by "Tell me more" clicks with Go Deeper iterative deepening

## Self-Check: PASSED

- All 6 files (3 created, 3 modified) verified on disk
- All 3 commit hashes (68251b2, 160879e, bc91dc9) verified in git log
- 39 test files, 1089 tests passing (12 new + 1077 existing)

---
*Phase: 23-delight-feature-wiring*
*Completed: 2026-04-03*
