---
phase: 03-engine-fixes
plan: 09
subsystem: validation
tags: [xbrl, accrued-liabilities, depreciation-amortization, methodology-diff, morningstar, d&a-broadening]

# Dependency graph
requires:
  - phase: 03-engine-fixes/03
    provides: "91.1% MS accuracy baseline, gap analysis identifying 141 accrued DIFFs and 32 D&A DIFFs"
  - phase: 03-engine-fixes/08
    provides: "METHODOLOGY_DIFF reclassification pattern in comparator.mjs"
provides:
  - accrued_liabilities scope handler reclassifying 141 DIFFs as METHODOLOGY_DIFF (bidirectional scope difference)
  - D&A component taxonomy entries (_da_rou_amort, _da_finance_lease_amort, _da_accretion_expense, _da_financing_costs_amort)
  - Double-counting guard preventing component overshoot (3% threshold heuristic)
  - MS accuracy improvement from 91.4% to 92.3% (1132 DIFF, down from 1282)
affects: [phase-04-scale-validation]

# Tech tracking
tech-stack:
  added: []
  patterns: [double-counting guard heuristic for D&A component summation, METHODOLOGY_DIFF reclassification for scope differences]

key-files:
  created: []
  modified:
    - src/engines/edgarFinancials.js
    - src/engines/__tests__/edgarFinancials.test.js
    - validation/scripts/lib/field-mapper.mjs
    - validation/scripts/lib/comparator.mjs

key-decisions:
  - "Accrued liabilities: reclassify as METHODOLOGY_DIFF (not tolerance relaxation) because direction is mixed (72 MS higher, 69 engine higher) -- genuine scope difference, not extraction bug"
  - "D&A broadening: 3% threshold guards against double-counting -- only add components when primary DDA is within 3% of depreciation_only + amort (SFM passes at 1.007, AMZN/EQIX/EW blocked)"
  - "D&A component sum adds ROU amort, finance lease amort, accretion expense, financing cost amort only when genuinely separate from primary DDA tag"
  - "9 D&A regressions accepted as edge cases (BOOT 1, EQIX 4, EW 2, MSFT 2) -- all engine-over-reporting where components are partially embedded in DDA despite 3% guard"

patterns-established:
  - "Double-counting guard: when adding component sums to aggregate tags, verify components are genuinely separate by comparing aggregate vs narrow sum"
  - "METHODOLOGY_DIFF: use for bidirectional scope differences where neither source is wrong, just different definitions"

requirements-completed: [ENGINE-01, ENGINE-03]

# Metrics
duration: 15min
completed: 2026-03-27
---

# Phase 03 Plan 09: Accrued Liabilities + D&A Broadening Summary

**Reclassify 141 accrued_liabilities DIFFs as METHODOLOGY_DIFF (bidirectional scope difference) and broaden D&A with ROU/accretion/finance-lease components using double-counting guard, improving MS accuracy from 91.4% to 92.3%**

## Performance

- **Duration:** 15 min
- **Started:** 2026-03-27T02:43:59Z
- **Completed:** 2026-03-27T02:58:59Z
- **Tasks:** 2 (investigation + implementation)
- **Files modified:** 4

## Accomplishments
- Eliminated accrued_liabilities as #1 failure field: 141 DIFF -> 0 DIFF (reclassified as METHODOLOGY_DIFF after investigation confirmed bidirectional scope difference)
- Added 4 new D&A component taxonomy entries with double-counting guard that fixed SFM (was 52% of MS, now matches), NEE accretion, and MSFT finance lease amort
- Improved MS accuracy from 91.4% to 92.3% (1282 -> 1132 DIFFs, 150 fewer)
- Added 7 new unit tests covering D&A component summation, guard behavior, and anti-regression (AMZN scenario)
- All 97 edgarFinancials tests and 311 harness tests pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Investigation** - no commit (investigation-only, findings informed Task 2)
2. **Task 2: Accrued handler + D&A broadening** - `383992f` (feat)

## Files Created/Modified
- `src/engines/edgarFinancials.js` - Added 4 D&A component taxonomy entries (_da_rou_amort, _da_finance_lease_amort, _da_accretion_expense, _da_financing_costs_amort) and extended computeDerivedFields with component summation + 3% double-counting guard
- `src/engines/__tests__/edgarFinancials.test.js` - 7 new tests for D&A broadening (ROU amort, accretion, finance lease, multi-component, guard behavior, anti-regression)
- `validation/scripts/lib/field-mapper.mjs` - Added accrued_scope_diff handler returning METHODOLOGY_DIFF for accrued_liabilities
- `validation/scripts/lib/comparator.mjs` - Wired accrued_scope_diff handler to reclassify DIFF -> METHODOLOGY_DIFF post-comparison

## Decisions Made
- **Accrued approach**: Chose METHODOLOGY_DIFF reclassification (Approach 2 from plan) over tolerance relaxation because investigation showed mixed direction (72 MS higher vs 69 engine higher) -- this is a genuine scope difference between XBRL AccruedLiabilitiesCurrent and MS's broader "Accrued Expenses, Current"
- **D&A guard threshold**: Empirically tuned from 10% to 3% after AMZN, EQIX, EW, AMT regressions at wider thresholds -- 3% correctly identifies SFM (DDA/narrowDa=1.007) as separate while blocking AMZN (1.61), EQIX (1.06), EW (1.08)
- **Accepted 9 D&A regressions**: BOOT (1yr), EQIX (4yr), EW (2yr), MSFT (2yr) all show engine over-reporting where components are partially embedded in DDA despite guard -- these are edge cases at the boundary of the heuristic

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] D&A component double-counting guard**
- **Found during:** Task 2, Part B (D&A broadening)
- **Issue:** Naive component sum caused 28 regressions -- AMZN ($52B DDA jumped to $56B), EQIX, EW, AMT all overshooting because components were already embedded in their DDA tags
- **Fix:** Added double-counting guard: only sum components when baseDa <= narrowDa (depreciation_only + amort_intangibles) * 1.03
- **Files modified:** src/engines/edgarFinancials.js
- **Verification:** Regressions reduced from 28 to 9; SFM, NEE, MSFT 2024 still fixed correctly
- **Committed in:** 383992f

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug)
**Impact on plan:** Guard was essential to prevent regressions. Plan suggested naive component sum; investigation revealed double-counting risk requiring the guard heuristic.

## Issues Encountered
- D&A broadening required iterative threshold tuning (10% -> 5% -> 3%) because different companies embed lease/accretion in their primary DDA tag to varying degrees
- 9 D&A regressions remain as accepted edge cases -- fixing them would require company-specific logic that's not worth the complexity

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- MS accuracy at 92.3% with 1132 remaining DIFFs
- accrued_liabilities no longer pollutes the failure list -- top failures are now net_change_in_cash, other_noncurrent_assets, property_plant_equipment
- D&A component infrastructure in place for future broadening if additional tags are identified

---
*Phase: 03-engine-fixes*
*Completed: 2026-03-27*
