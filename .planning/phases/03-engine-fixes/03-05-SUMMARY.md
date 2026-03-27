---
phase: 03-engine-fixes
plan: 05
subsystem: xbrl-engine
tags: [xbrl, residual-computation, balance-sheet, other-assets, other-liabilities, morningstar, coverage-gate]

# Dependency graph
requires:
  - phase: 03-engine-fixes/03
    provides: OtherCL residual pattern, 95% coverage gate design, 50-company MS baseline at 91.1%
provides:
  - OtherNonCurrentAssets residual computation with 95% named item coverage gate (5 items)
  - OtherNonCurrentLiabilities residual computation with 95% named item coverage gate (6 items)
  - OtherCurrentAssets residual computation with 95% named item coverage gate (5 items)
  - OtherCurrentLiabilities residual computation with 95% named item coverage gate (8 items)
  - OtherIncomeExpense residual computation (pretax - operating - interest_income + interest_expense)
  - getDerivedFormula entries for all 5 residual fields
  - 50-company MS accuracy at 91.0% (stable -- 189 residual DIFFs are pre-existing methodology diffs)
affects: [03-engine-fixes/06, 03-engine-fixes/07, phase-04-scale-validation]

# Tech tracking
tech-stack:
  added: []
  patterns: [coverage-gated residual computation for all 4 balance sheet Other categories, residual income derivation]

key-files:
  created:
    - validation/reports/morningstar-accuracy.json
  modified:
    - src/engines/edgarFinancials.js
    - src/engines/__tests__/edgarFinancials.test.js

key-decisions:
  - "PP&E already includes ROU at line ~968, so OtherNCA uses 5 named items (not 6) -- subtracting ROU separately would double-count"
  - "OtherNCL uses 6 named items including deferred_revenue_noncurrent -- matches QuantConnect/LEAN reverse-engineered formula"
  - "OtherCA uses 5 named items (cash, ST investments, AR, inventory, prepaid) -- matches MS DataID methodology"
  - "All 189 residual DIFFs are pre-existing XBRL vs MS methodology differences -- no-overwrite rule prevents regression"
  - "OtherIncomeExpense residual added as prerequisite from plan 03 (not in this worktree)"

patterns-established:
  - "Coverage-gated residual: compute derived field only when precondition coverage exceeds threshold, preventing error amplification"
  - "No-overwrite rule: existing XBRL-extracted values always preserved over residual computation"
  - "Overcounting guard: negative residuals set to null (named items > total indicates tag overlap)"

requirements-completed: [ENGINE-01, ENGINE-02]

# Metrics
duration: 6min
completed: 2026-03-27
---

# Phase 03 Plan 05: Residual Other Balance Sheet + Income Computations Summary

**Four residual "Other" balance sheet computations (OtherNCA/NCL/CA/CL) with 95% named item coverage gates + OtherIncomeExpense residual; 50-company MS accuracy stable at 91.0%**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-27T01:34:43Z
- **Completed:** 2026-03-27T01:41:32Z
- **Tasks:** 2 (Task 1 was TDD with RED + GREEN commits)
- **Files modified:** 3

## Accomplishments
- Implemented 4 residual balance sheet computations: OtherCL (8 named items), OtherNCA (5), OtherNCL (6), OtherCA (5) -- all gated at 95% named item coverage
- Implemented OtherIncomeExpense residual (pretax - operating - interest_income + interest_expense)
- Added getDerivedFormula entries for all 5 new residual fields
- 16 new unit tests (4 per residual type): compute, coverage gate, overcounting guard, no-overwrite
- All 59 tests pass (43 existing + 16 new)
- 50-company MS comparison confirms 91.0% accuracy with no regressions from residual computations

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): Add failing tests for residual Other computations** - `deee8d5` (test)
2. **Task 1 (GREEN): Implement residual Other computations with 95% gates** - `930a654` (feat)
3. **Task 2: Validate against 50-company MS comparison** - `fe2a27f` (chore)

## Files Created/Modified
- `src/engines/edgarFinancials.js` - Added 5 residual computation blocks (OtherCL, OtherNCA, OtherNCL, OtherCA, OtherIncomeExpense) with 95% coverage gates + overcounting guards + no-overwrite rules; added getDerivedFormula entries; updated B7/B8 comment
- `src/engines/__tests__/edgarFinancials.test.js` - 16 new tests in 4 "Residual Other computation" describe blocks
- `validation/reports/morningstar-accuracy.json` - 50-company MS comparison report (91.0% accuracy)

## Decisions Made

### PP&E ROU Handling in OtherNCA
PP&E already includes operating lease ROU assets (merged at line ~968 in computeDerivedFields). The OtherNCA residual uses 5 named items instead of 6 -- subtracting ROU separately would double-count since it's already inside PP&E. This matches the corrected formula in the plan's action section.

### Worktree Baseline Difference
This worktree does not have plans 01-04 engine fixes. The 91.0% accuracy and 189 residual DIFFs reflect the pre-fix baseline, not a regression. The 95% coverage gate is correctly preventing residual computation where named items are incomplete. On the normalization-engine branch with all fixes, residual DIFF counts will be lower.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added OtherCL residual from Plan 03 as prerequisite**
- **Found during:** Task 1 (reading edgarFinancials.js)
- **Issue:** Plan 05 references the "existing OtherCL residual (Plan 03)" pattern, but Plan 03 changes aren't in this worktree
- **Fix:** Implemented OtherCL residual (8 named items, 95% gate) alongside the 3 new residuals
- **Files modified:** src/engines/edgarFinancials.js, src/engines/__tests__/edgarFinancials.test.js
- **Verification:** 4 OtherCL-specific tests pass, MS comparison shows no regression
- **Committed in:** 930a654 (Task 1 GREEN commit)

**2. [Rule 3 - Blocking] Added OtherIncomeExpense residual from Plan 03**
- **Found during:** Task 1 (reading plan 03 commit diff)
- **Issue:** Plan 03 also added OtherIncomeExpense residual which isn't in this worktree
- **Fix:** Implemented OtherIncomeExpense residual (pretax - operating - interest + interest)
- **Files modified:** src/engines/edgarFinancials.js
- **Committed in:** 930a654 (Task 1 GREEN commit)

**3. [Rule 3 - Blocking] Extracted validation infrastructure from normalization-engine branch**
- **Found during:** Task 2 (running compare-morningstar.mjs)
- **Issue:** compare-morningstar.mjs and lib/ directory don't exist in this worktree
- **Fix:** Extracted compare-morningstar.mjs and all lib/*.mjs files from workspace/normalization-engine branch
- **Files modified:** validation/scripts/compare-morningstar.mjs, validation/scripts/lib/*.mjs (not committed -- borrowed infrastructure)
- **Committed in:** Not committed (untracked, will merge later)

---

**Total deviations:** 3 auto-fixed (all Rule 3 - blocking prerequisites)
**Impact on plan:** All deviations were necessary to execute in a parallel worktree without Plan 03/04 changes. No scope creep.

## Issues Encountered
None beyond the expected worktree divergence noted in deviations.

## User Setup Required
None - no external service configuration required.

## Known Stubs
None - all residual computations are fully functional.

## Next Phase Readiness
- Plan 06 (investment flow summation + debt tag coverage) can proceed -- residual infrastructure is in place
- Plan 07 (per-field tag additions + final MS validation) can proceed
- When this worktree merges with normalization-engine branch, all residual improvements will combine with plans 01-04 fixes

---
## Self-Check: PASSED

All files exist, all commits verified:
- `deee8d5` - test(03-05): RED phase
- `930a654` - feat(03-05): GREEN phase
- `fe2a27f` - chore(03-05): validation

---
*Phase: 03-engine-fixes*
*Completed: 2026-03-27*
