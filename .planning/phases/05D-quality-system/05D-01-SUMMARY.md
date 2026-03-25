---
phase: 05D-quality-system
plan: 01
subsystem: quality
tags: [validation, citations, completeness, confidence, vitest, pure-engine]

# Dependency graph
requires:
  - phase: 05A-agent-definitions
    provides: ReportSectionSchema, CitationSchema, DataPacket structure
provides:
  - validateSection() — per-section quality report with citation, completeness, confidence, multi-source, red flag, and data gap checks
  - validateStage() — aggregate quality report across all sections in a stage
  - classifyCitation() — 4-type citation classification (datapacket, sec_filing, web_url, untraceable)
  - resolveDataPath() — DataPacket dot-path navigation for citation verification
  - matchNumericValue() — fuzzy numeric matching with percentage/dollar/abbreviation handling
affects: [05D-02, 05D-03, 05B-one-pager-display-components]

# Tech tracking
tech-stack:
  added: []
  patterns: [pure-validation-engine, weighted-completeness-scoring, citation-type-classification, fuzzy-numeric-matching]

key-files:
  created:
    - src/engines/critic.js
    - src/engines/__tests__/critic.test.js
    - src/engines/__tests__/fixtures/cost-section-company-info.json
    - src/engines/__tests__/fixtures/cost-data-packet-slice.json
  modified: []

key-decisions:
  - "Handle both canonical {id, ref, text, source} and non-canonical {id, source, url, note} citation formats — flag non-canonical as low severity"
  - "URL validation runs on all citations with non-empty url fields, not just web_url classified ones — catches malformed URLs on SEC/untraceable citations"
  - "Completeness scoring uses 4-factor weighted formula: 40% required fields, 25% narrative depth, 20% citation density, 15% data population"
  - "Data gap detection uses section-key-to-domain mapping to check only relevant DataPacket fields per section"

patterns-established:
  - "Pure validation engine: no fs, no path, no fetch, no side effects — input is JSON, output is QualityReport"
  - "Test fixtures from real generated data: COST one-pager section + DataPacket slice"
  - "_testExports pattern for exposing internal functions to unit tests"

requirements-completed: [QUAL-01, QUAL-02, QUAL-03, QUAL-04, QUAL-05, QUAL-06]

# Metrics
duration: 5min
completed: 2026-03-25
---

# Phase 5D Plan 01: Quality Validation Engine Summary

**Pure critic.js engine validating 6 quality dimensions (citations, completeness, confidence, multi-source, red flags, data gaps) against real COST one-pager data with 41 passing tests**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-25T02:14:08Z
- **Completed:** 2026-03-25T02:19:30Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Built critic.js with 11 exported functions covering all 6 QUAL requirements (QUAL-01 through QUAL-06)
- Citation validation handles both canonical and non-canonical formats, classifying into 4 types with type-specific validation strategies
- Fuzzy numeric matching handles percentages (13.0% to 0.13), dollar abbreviations ($432B to 432B), comma-separated numbers, and 5% tolerance
- 41 test cases pass against real COST fixture data extracted from the generated one-pager
- Zero new dependencies — pure JS validation logic on existing JSON structures

## Task Commits

Each task was committed atomically:

1. **Task 1: Create test fixtures from real COST data + critic.js test scaffold** - `92cc438` (test)
2. **Task 2: Implement critic.js -- pure validation engine** - `9cbc71b` (feat)

## Files Created/Modified
- `src/engines/critic.js` — Pure validation engine: validateSection, validateStage, 9 internal functions
- `src/engines/__tests__/critic.test.js` — 41 test cases covering QUAL-01 through QUAL-06 + integration
- `src/engines/__tests__/fixtures/cost-section-company-info.json` — Real COST company_info section (10 citations, 4 red flags)
- `src/engines/__tests__/fixtures/cost-data-packet-slice.json` — Minimal DataPacket slice (1.6KB) for path resolution tests

## Decisions Made
- Handle both citation formats (canonical and non-canonical) with format flagging as low severity — matches real COST output where 76% use non-canonical format
- URL validation applied to all citations with non-empty url fields (not just web_url classified ones) — fixed a test failure where malformed URLs on untraceable citations weren't caught
- Completeness scoring treats empty arrays and empty strings as "not present" for required fields — prevents inflated scores when sections have `citations: []`
- Data gap detection uses a section-key-to-domain mapping (SECTION_DATA_DOMAINS) instead of scanning all DataPacket fields — reduces false positives

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] URL validation for non-web_url citations**
- **Found during:** Task 2 (GREEN phase)
- **Issue:** Citations with `url: 'not-a-url'` classified as `untraceable` (not `web_url`) so URL format wasn't validated
- **Fix:** Added post-classification URL validation for any citation with non-empty `url` field, regardless of type
- **Files modified:** src/engines/critic.js
- **Verification:** All 41 tests pass including the invalid URL format test
- **Committed in:** 9cbc71b (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor logic fix required during TDD GREEN phase. No scope creep.

## Issues Encountered
- COST report files exist in the main repo `.thes1s/` directory, not in the worktree — read from main repo path for fixture extraction

## Known Stubs
None — all functions are fully implemented with real validation logic.

## Next Phase Readiness
- critic.js ready for integration into CC skill post-processing (Plan 02: contextBudget.js + Plan 03: failure recovery)
- QualityReport structure ready for UI rendering in a future quality dashboard
- COST fixture data available for testing contextBudget.js and failure recovery

## Self-Check: PASSED

All 4 created files verified on disk. Both task commits (92cc438, 9cbc71b) verified in git log.

---
*Phase: 05D-quality-system*
*Completed: 2026-03-25*
