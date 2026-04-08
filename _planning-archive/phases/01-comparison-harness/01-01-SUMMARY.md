---
phase: 01-comparison-harness
plan: 01
subsystem: validation
tags: [xbrl, morningstar, fiscal-year, sign-convention, field-mapping, tolerance-tiers, vitest]

# Dependency graph
requires: []
provides:
  - "Fiscal year aligner (parseFiscalYearEnd + resolveYearOffset) for all 19 non-Dec FY companies"
  - "Field mapper (loadFieldMapping + mapMorningstarToCanonical + 4 special field handlers)"
  - "Comparator (compareField + compareCompany with 5-tier tolerance thresholds)"
  - "174 unit tests validating FY alignment, sign conventions, field mapping, and comparison logic"
affects: [01-02-PLAN, comparison-harness, triangulation-engine]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Pure ESM modules in validation/scripts/lib/ for CLI pipeline", "Injectable specialHandlers for testable comparison logic", "TDD workflow (RED-GREEN) for all modules"]

key-files:
  created:
    - "validation/scripts/lib/fiscal-aligner.mjs"
    - "validation/scripts/lib/field-mapper.mjs"
    - "validation/scripts/lib/comparator.mjs"
    - "src/engines/__tests__/harness/fiscal-aligner.test.js"
    - "src/engines/__tests__/harness/field-mapper.test.js"
    - "src/engines/__tests__/harness/sign-convention.test.js"
    - "src/engines/__tests__/harness/comparator.test.js"
  modified: []

key-decisions:
  - "Used fiscalYearEnd metadata as primary FY resolver with revenue-matching as validation (not brute-force-first)"
  - "Jan/Feb FY companies get predicted offset +1; all others default to 0"
  - "compareCompany takes specialHandlers as injectable parameter for testability and Phase 2 extensibility"
  - "field-mapping.json has 101 mapped fields (not 87 as metadata claims) -- tests use actual count"

patterns-established:
  - "Pure ESM modules in validation/scripts/lib/ with named exports"
  - "Harness tests in src/engines/__tests__/harness/ using relative imports to lib/"
  - "Injectable handlers pattern: special field handlers passed as options, not hardcoded in comparator"

requirements-completed: [HARNESS-01, HARNESS-02, HARNESS-03, HARNESS-04]

# Metrics
duration: 9min
completed: 2026-03-25
---

# Phase 01 Plan 01: Core Comparison Library Summary

**Three pure-function ESM modules (fiscal-aligner, field-mapper, comparator) with 174 unit tests covering FY alignment for all 19 non-Dec companies, 101-field sign conventions, and 5-tier tolerance comparison logic**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-25T23:35:36Z
- **Completed:** 2026-03-25T23:44:52Z
- **Tasks:** 2
- **Files created:** 7

## Accomplishments
- Fiscal year aligner correctly resolves offsets for all 19 non-December FY companies using metadata-first strategy with revenue-matching validation
- Field mapper loads all 101 mapped fields, applies sign conventions (sign:-1 flips expenses from MS negative to XBRL positive), scales effective_tax_rate from decimal to percentage, and handles 4 special fields (intangibles NET, reported operating income, accrued combined skip, tax rate scale)
- Comparator produces MATCH/CLOSE/DIFF/MISSING_FIELD/MISSING_YEAR/SKIP_SPINOFF status using exact same tolerance math as existing morningstarAccuracy.test.js
- All 174 harness tests pass; existing 394 project tests unaffected (no regressions)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create fiscal-aligner.mjs and field-mapper.mjs** - `4348cfb` (feat)
2. **Task 2: Create comparator.mjs** - `58dfd5f` (feat)

_Both tasks followed TDD: tests written first (RED), then implementation (GREEN)._

## Files Created/Modified
- `validation/scripts/lib/fiscal-aligner.mjs` (147 lines) - parseFiscalYearEnd + resolveYearOffset with metadata-first FY resolution
- `validation/scripts/lib/field-mapper.mjs` (199 lines) - loadFieldMapping, mapMorningstarToCanonical, getSpecialFieldHandlers, STMT_MAP
- `validation/scripts/lib/comparator.mjs` (218 lines) - compareField, compareCompany, THRESHOLDS, FINANCIAL_SECTOR, SPIN_OFF, EUR_COMPANIES
- `src/engines/__tests__/harness/fiscal-aligner.test.js` (483 lines) - 35 tests for FY alignment of all 19 non-Dec companies + edge cases
- `src/engines/__tests__/harness/field-mapper.test.js` (286 lines) - 22 tests for field mapping, sign convention, scale, special handlers
- `src/engines/__tests__/harness/sign-convention.test.js` (74 lines) - 77 tests validating sign convention for all 101 mapped AAPL 2025 fields
- `src/engines/__tests__/harness/comparator.test.js` (473 lines) - 40 tests for tolerance boundaries, edge cases, compareCompany orchestration

## Decisions Made
- **FY metadata as primary resolver (D-02 implementation):** Used `fiscalYearEnd` from fixture JSON to predict offset (+1 for Jan/Feb FY, 0 for all others), then validate with revenue matching. Falls back to brute-force only if validation fails. This is more deterministic than the existing brute-force-first approach.
- **field-mapping.json has 101 mapped fields, not 87:** The `_meta.totalMapped: 87` in field-mapping.json is stale. Actual count is 101 non-null thesisField entries (99 unique, 2 duplicates: depreciation_amortization and dividends_paid each have 2 MS source fields). Tests use the actual count.
- **Injectable specialHandlers:** comparator.mjs takes special field handlers as an options parameter rather than hardcoding them. This keeps the comparator testable with mock handlers and extensible for Phase 2 multi-source comparison.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected mapped field count from 87 to 101**
- **Found during:** Task 1 (sign-convention.test.js)
- **Issue:** Plan specified 87 mapped fields based on `_meta.totalMapped` in field-mapping.json, but actual count is 101 (file was extended after metadata was written)
- **Fix:** Updated all test assertions from 87 to 101; documented the stale metadata
- **Files modified:** sign-convention.test.js, field-mapper.test.js
- **Verification:** Tests pass with correct count; manual verification confirms 101 non-null thesisField entries
- **Committed in:** 4348cfb (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Correct count is more accurate. No scope creep.

## Issues Encountered
None -- all tests passed on first GREEN implementation for both tasks.

## Known Stubs
None -- all modules are fully functional pure-function implementations.

## User Setup Required
None -- no external service configuration required.

## Next Phase Readiness
- Three library modules ready for Plan 02 (compare-morningstar.mjs orchestrator + reporter)
- Modules export clean interfaces: fiscal-aligner provides FY offset, field-mapper transforms MS data, comparator compares field-by-field
- comparator.mjs imports from fiscal-aligner.mjs (key link verified)
- field-mapper.mjs reads from field-mapping.json at runtime (key link verified)
- specialHandlers injection pattern ready for Phase 2 multi-source extension

## Self-Check: PASSED

- All 7 created files verified to exist
- Both commit hashes (4348cfb, 58dfd5f) verified in git log
- All 174 tests pass (0 failures)

---
*Phase: 01-comparison-harness*
*Completed: 2026-03-25*
