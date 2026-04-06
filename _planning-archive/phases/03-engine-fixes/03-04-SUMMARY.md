---
phase: 03-engine-fixes
plan: 04
subsystem: validation
tags: [morningstar, xbrl, accrued-liabilities, intangibles, operating-income, comparison-harness]

# Dependency graph
requires:
  - phase: 03-engine-fixes/01
    provides: field-mapper.mjs, comparator.mjs, compare-morningstar.mjs with Category B handlers
provides:
  - Per-year accrued_combined_skip handler (no false skips on mixed-year companies)
  - Verified intangibles_net handler (AMAT reference: GROSS-AccumAmort=NET exact match)
  - Verified operating_income_reported handler (T reference: reported -$4.6B vs normalized $27.5B)
  - 50-company accuracy baseline documented at 91.2%
  - Remaining failure patterns cataloged for Plans 02 and 03
affects: [03-engine-fixes/02, 03-engine-fixes/03]

# Tech tracking
tech-stack:
  added: []
  patterns: [per-year special field handler granularity]

key-files:
  modified:
    - validation/scripts/lib/field-mapper.mjs
    - validation/scripts/lib/comparator.mjs
    - src/engines/__tests__/harness/field-mapper.test.js

key-decisions:
  - "Per-year accrued handler is architecturally correct but produces minimal accuracy change because the comparator null-check already skips missing years"
  - "Category B handlers (intangibles, operating income, accrued) were already implemented in Plan 01 and contributing to the 91.2% baseline"
  - "141 accrued_liabilities DIFFs are genuine value mismatches (engine AccruedLiabilitiesCurrent+EmployeeRelated vs MS AccruedLiabilitiesCurrent only) -- require engine-level fixes in Plan 02/03"

patterns-established:
  - "Per-year handler signature: handler(msValue, allYearsData, currentYear) for year-level granularity"

requirements-completed: [ENGINE-01, ENGINE-03]

# Metrics
duration: 7min
completed: 2026-03-27
---

# Phase 03 Plan 04: Category B Harness Alignment Summary

**Per-year accrued handler fix + verification of intangibles NET and operating income Reported handlers across 50-company Morningstar truth set**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-27T00:16:06Z
- **Completed:** 2026-03-27T00:23:46Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Fixed accrued_combined_skip handler from all-or-nothing company-level check to per-year granularity
- Verified intangibles_net handler produces exact matches for AMAT (reference case: GROSS $2,041M + AccumAmort -$1,937M = NET $104M)
- Verified operating_income_reported handler uses Reported value for T (FY2022: -$4,587M reported, not $27,498M normalized)
- Confirmed 91.2% overall accuracy with zero regressions across all 50 companies
- Cataloged remaining failure patterns: accrued_liabilities (141), net_change_in_cash (74), other_noncurrent_assets (62) as top 3

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix accrued_combined_skip handler to use per-year logic** - `81d8224` (fix)
2. **Task 2: Verify all Category B handlers + measure MS accuracy improvement** - verification only, no code changes needed

## Files Created/Modified
- `validation/scripts/lib/field-mapper.mjs` - Updated accrued handler to per-year signature with currentYear parameter
- `validation/scripts/lib/comparator.mjs` - Updated handler call to pass msYear as third argument
- `src/engines/__tests__/harness/field-mapper.test.js` - Updated accrued tests for per-year behavior (4 test cases)

## Decisions Made
- **Per-year handler has minimal accuracy impact:** The comparator's existing `msValue == null` check already skips years where MS lacks the "Accrued Expenses, Current" field. The per-year fix is architecturally correct (handler matches call-site semantics) but doesn't change the accuracy number.
- **Category B handlers already in baseline:** Plan 01 created field-mapper.mjs WITH all Category B handlers (intangibles_net, operating_income_reported, accrued_combined_skip, effective_tax_rate_scale) already implemented. The 91.2% baseline already includes their contributions. The plan's expected 3-4% improvement was predicated on handlers not yet existing.
- **141 accrued DIFFs are genuine value mismatches:** The engine's `accrued_liabilities` uses `AccruedLiabilitiesCurrent` + `EmployeeRelatedLiabilitiesCurrent` (broader scope) while MS "Accrued Expenses, Current" maps only to `AccruedLiabilitiesCurrent`. Fixing this requires either narrowing the engine's tag list or reclassifying as methodology difference -- Plan 02/03 territory.

## Deviations from Plan

### Deviation: Expected accuracy improvement not realized

- **Found during:** Task 2 (full comparison run)
- **Issue:** Plan expected ~3-4% accuracy improvement from Category B fixes. Actual improvement: 0% because handlers were already implemented in Plan 01 and contributing to the 91.2% baseline.
- **Resolution:** Documented as a finding. The handlers ARE working correctly -- they just weren't "new" since Plan 01 already built them. The per-year accrued fix is the only new change, and it has minimal impact because the comparator's null check already handles missing years.
- **Impact:** No impact on correctness. The plan's verification objective is still met -- all handlers confirmed working.

---

**Total deviations:** 1 (expected vs actual accuracy improvement)
**Impact on plan:** Verification objective met. All handlers confirmed working. The accuracy improvement was already captured in Plan 01's baseline.

## Issues Encountered
- None. All handlers work as expected. The 141 remaining accrued_liabilities failures are genuine methodology differences that require engine-level fixes (Plan 02 scope).

## Handler Verification Results

| Handler | Test Case | Expected | Actual | Status |
|---------|-----------|----------|--------|--------|
| intangibles_net | AMAT FY2021 | NET $104M | $104M | MATCH |
| intangibles_net | All AMAT years | 5/5 match | 5/5 match | PASS |
| operating_income_reported | T FY2022 | Reported -$4,587M | -$4,587M | MATCH |
| operating_income_reported | T FY2023-2025 | 3/3 match | 3/3 match | PASS |
| accrued_combined_skip | CRM (combined-only) | 0 comparisons | 0 comparisons | PASS |
| accrued_combined_skip | MSFT (combined-only) | 0 comparisons | 0 comparisons | PASS |
| accrued_combined_skip | AAPL (mixed years) | 2 comparisons (2024,2025) | 2 comparisons | PASS |

## Remaining Top Failure Patterns (for Plans 02/03)

| Field | Statement | Failures | Companies | Category |
|-------|-----------|----------|-----------|----------|
| accrued_liabilities | balance_sheet | 141 | 31 | Value mismatch (engine broader than MS) |
| net_change_in_cash | cash_flow | 74 | 33 | FX effect inclusion |
| other_noncurrent_assets | balance_sheet | 62 | 18 | Residual "Other" |
| other_noncurrent_liabilities | balance_sheet | 53 | 16 | Residual "Other" |
| property_plant_equipment | balance_sheet | 49 | 14 | ROU asset inclusion |
| sale_of_investments | cash_flow | 36 | 9 | Tag coverage |
| total_lease_liability_noncurrent | balance_sheet | 33 | 11 | Lease classification |
| depreciation_amortization | cash_flow | 32 | 4 | D&A broadening |

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Category B handlers verified and working
- Per-year accrued handler architecturally correct
- Remaining failures are engine-level (Plans 02/03) and residual "Other" computation (Plan 03)
- 91.2% accuracy is the confirmed baseline for measuring Plan 02/03 improvements

## Self-Check: PASSED

- FOUND: validation/scripts/lib/field-mapper.mjs
- FOUND: validation/scripts/lib/comparator.mjs
- FOUND: src/engines/__tests__/harness/field-mapper.test.js
- FOUND: .planning/phases/03-engine-fixes/03-04-SUMMARY.md
- FOUND: commit 81d8224

---
*Phase: 03-engine-fixes*
*Completed: 2026-03-27*
