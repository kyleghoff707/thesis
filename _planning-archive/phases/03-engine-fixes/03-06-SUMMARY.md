---
phase: 03-engine-fixes
plan: 06
subsystem: xbrl-engine
tags: [xbrl, investment-flow, debt-tags, component-summation, edgarFinancials, gap-closure]

# Dependency graph
requires:
  - phase: 03-engine-fixes/03
    provides: gap analysis documenting 1244 remaining DIFFs, 605 genuine value mismatches, 91.1% MS accuracy baseline
provides:
  - Investment flow equity component fields (sale_of_investments_equity, purchase_of_investments_equity)
  - Additional aggregate investment tags (ProceedsFromSaleOfDebtSecurities, PaymentsToAcquireOtherInvestments, ProceedsFromSaleAndMaturityOfAvailableForSaleSecurities)
  - Short-term debt component summation (commercial_paper + short_term_borrowings + notes_payable_current)
  - Long-term debt convertible debt coverage (ConvertibleDebt, ConvertibleLongTermNotesPayable)
  - Short-term debt additional tags (NotesPayable, BankOverdrafts)
  - 11 new unit tests for investment flow and debt coverage
  - MS accuracy maintained at 91.1% with 1243 DIFFs (reduced by 1 from baseline)
affects: [phase-04-scale-validation]

# Tech tracking
tech-stack:
  added: []
  patterns: [equity investment component summation, short-term debt component summation with notes_payable_current]

key-files:
  created: []
  modified:
    - src/engines/edgarFinancials.js
    - src/engines/__tests__/edgarFinancials.test.js

key-decisions:
  - "DebtCurrent reordered to first position in short_term_debt tags -- broader aggregate should win over narrow CommercialPaper/ShortTermBorrowings in first-tag-wins resolution"
  - "short_term_debt component summation excludes current_portion_lt_debt to avoid double-counting in total_debt (current_portion_lt_debt is tracked separately)"
  - "Equity investment components added for both sale and purchase paths to capture companies reporting equity method investment proceeds/payments separately"
  - "ConvertibleDebt placed after LongTermLineOfCredit but before REIT-specific tags in priority order"

patterns-established:
  - "Equity investment component summation: sale_of_investments_equity + purchase_of_investments_equity alongside existing AFS/HTM/STI components"
  - "Short-term debt component summation: commercial_paper + short_term_borrowings + notes_payable_current, max(component_sum, aggregate)"

requirements-completed: [ENGINE-01, ENGINE-03]

# Metrics
duration: 7min
completed: 2026-03-27
---

# Phase 03 Plan 06: Investment Flow and Debt Tag Gap Closure Summary

**Expanded investment flow component summation with equity securities and broadened debt tag coverage with convertible debt, notes payable, and component summation -- MS accuracy stable at 91.1%, 1243 DIFFs (1 fewer than baseline)**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-27T01:33:35Z
- **Completed:** 2026-03-27T01:40:35Z
- **Tasks:** 3 (2 TDD + 1 verification)
- **Files modified:** 2

## Accomplishments
- Added equity investment component fields (sale_of_investments_equity, purchase_of_investments_equity) and updated component summation to include them alongside AFS/HTM/STI
- Added 4 new aggregate investment tags: ProceedsFromSaleAndMaturityOfAvailableForSaleSecurities, ProceedsFromSaleOfDebtSecurities, PaymentsToAcquireOtherInvestments
- Implemented short-term debt component summation (commercial_paper + short_term_borrowings + notes_payable_current) with max-vs-aggregate logic
- Added ConvertibleDebt and ConvertibleLongTermNotesPayable to long_term_debt taxonomy
- Added NotesPayable and BankOverdrafts to short_term_debt taxonomy; reordered DebtCurrent to first position
- 11 new unit tests (6 investment flow + 5 debt) -- all 54 tests pass
- MS comparison confirms no regression: 91.1% accuracy, 1243 DIFFs (reduced from 1244 baseline)

## Task Commits

Each task was committed atomically:

1. **Task 1: Improve investment flow component summation** - `ece8e58` (test) + `2245948` (feat)
2. **Task 2: Improve short-term and long-term debt tag coverage** - `af5f7c3` (test) + `d89557c` (feat)
3. **Task 3: Rebuild bundle and verify no MS comparison regression** - verification only, no commit needed

## Files Created/Modified
- `src/engines/edgarFinancials.js` - Added equity investment component fields, expanded aggregate tags, short-term debt component summation, convertible debt tags, derived formulas
- `src/engines/__tests__/edgarFinancials.test.js` - 11 new tests for investment flow and debt coverage

## Decisions Made
- Reordered short_term_debt tags to put DebtCurrent first (broader aggregate should win in first-tag-wins over narrow ShortTermBorrowings/CommercialPaper)
- Excluded current_portion_lt_debt from short_term_debt component summation to prevent double-counting in total_debt
- Added derived formulas for sale_of_investments, purchase_of_investments, and short_term_debt component summation

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] compare-morningstar.mjs not present in worktree**
- **Found during:** Task 3 (MS regression check)
- **Issue:** The compare-morningstar.mjs script and its lib/ dependencies exist only on the workspace/normalization-engine branch, not in this worktree
- **Fix:** Temporarily extracted scripts from workspace branch for verification, then cleaned up
- **Files modified:** None (temporary extraction, removed after verification)
- **Verification:** MS comparison ran successfully across all 50 companies

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Trivial -- just needed to extract validation scripts from the right branch for the regression check.

## Issues Encountered
None -- plan executed smoothly. TDD cycle clean for both tasks.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Investment flow and debt tag coverage expanded as specified
- 91.1% accuracy maintained with 1243 DIFFs
- Remaining gap closure plans (03-05, 03-07) can proceed independently

## Known Stubs
None -- all implemented functionality is fully wired and tested.

---
*Phase: 03-engine-fixes*
*Completed: 2026-03-27*
