---
phase: 07-schema-sdk-foundation
plan: 01
subsystem: schemas
tags: [zod, structured-outputs, claude-api, json-schema, backward-compatibility]

# Dependency graph
requires:
  - phase: none
    provides: none
provides:
  - API-compatible ReportSectionSchema with z.string() replacing z.looseObject({})
  - CitationSchema with optional url field for web search URLs
  - Backward-compatible critic.js scoreCompleteness handling both string and object data
  - 12 new unit tests (8 schema FMT + 4 critic FMT)
affects: [07-02-smoke-test, 08-api-orchestration, critic-validation]

# Tech tracking
tech-stack:
  added: []
  patterns: [JSON-string-serialization-for-flexible-schema-fields, parse-after-extraction]

key-files:
  created: []
  modified:
    - src/schemas/reportSection.js
    - src/schemas/__tests__/reportSection.test.js
    - src/engines/critic.js
    - src/engines/__tests__/critic.test.js

key-decisions:
  - "z.string() replaces z.looseObject({}) for all API-facing flexible fields (data, config, chart data items)"
  - "StageReportSchema.checkpoints[].userInput keeps z.looseObject({}) -- internal only, never sent to API"
  - "critic.js parses string data via JSON.parse with try/catch fallback to null for invalid JSON"
  - "Array guard (!Array.isArray) prevents JSON arrays from being counted as keyed objects"

patterns-established:
  - "Parse-after-extraction: API-facing schemas use z.string() for flexible data, orchestrator JSON.parse()s after"
  - "Backward compatibility: consumers handle both string (raw API) and object (post-orchestrator) data"

requirements-completed: [FMT-01, FMT-02]

# Metrics
duration: 6min
completed: 2026-03-28
---

# Phase 7 Plan 01: Schema Fix for Structured Outputs Summary

**z.looseObject({}) replaced with z.string() in all API-facing schemas, CitationSchema gets optional url field, critic.js backward-compatible with string data**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-28T01:59:20Z
- **Completed:** 2026-03-28T02:05:28Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Replaced 3 `z.looseObject({})` usages in API-facing schemas with `z.string()` (ReportSectionSchema.data, ChartSchema.config, ChartSchema.data items)
- Added optional `url` field to CitationSchema for web search URL tracking
- Updated critic.js `scoreCompleteness` to handle section.data as both string (JSON) and object with graceful degradation
- Added 12 new unit tests covering zodOutputFormat compatibility, safeParse validation, additionalProperties absence, and backward compatibility

## Task Commits

Each task was committed atomically:

1. **Task 1: Create schema unit tests + modify ReportSectionSchema** - `3dc5cdc` (feat)
2. **Task 2: Update critic.js for backward-compatible data field handling** - `3d02210` (feat)

_Note: Both tasks followed TDD (RED-GREEN) pattern_

## Files Created/Modified
- `src/schemas/reportSection.js` - Replaced z.looseObject({}) with z.string() in API-facing fields, added CitationSchema.url
- `src/schemas/__tests__/reportSection.test.js` - Added 8 FMT-01/FMT-02 tests, updated validSection fixture to use JSON string data
- `src/engines/critic.js` - scoreCompleteness handles string data via JSON.parse with try/catch fallback
- `src/engines/__tests__/critic.test.js` - Added 4 FMT-01 tests for string data field handling

## Decisions Made
- Used `z.string()` consistently for all 3 flexible fields (data, config, chart data items) per D-01/D-02
- StageReportSchema.checkpoints[].userInput kept as `z.looseObject({}).optional()` per D-03/D-04
- critic.js uses `!Array.isArray(dataObj)` guard to prevent JSON arrays from being miscounted as keyed objects
- Fixture `cost-section-company-info.json` kept with `data` as object (represents post-orchestrator data)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Known Stubs
None - all changes are complete and functional.

## Next Phase Readiness
- Schema is ready for `zodOutputFormat()` in the live smoke test (Plan 02)
- critic.js handles both pre-migration (object) and post-migration (string) data formats
- All 718 src/ tests pass with zero regressions

## Self-Check: PASSED

- All 4 modified files exist on disk
- Both task commits found in git history (3dc5cdc, 3d02210)
- All 8 acceptance criteria verified via grep

---
*Phase: 07-schema-sdk-foundation*
*Completed: 2026-03-28*
