---
phase: 03-engine-fixes
plan: 08
subsystem: validation
tags: [xbrl, morningstar, methodology-diff, ppe, goodwill, lease, net-change-in-cash, fx-effect]

requires:
  - phase: 03-engine-fixes (plans 01-07)
    provides: "Validation harness, field-mapper, comparator, reporter, 50-company MS fixture set"
provides:
  - "METHODOLOGY_DIFF status for PPE ROU, goodwill restated, and lease classification fields"
  - "net_change_in_cash derivation excluding FX effect (matches MS convention)"
  - "Reporter with methodology diff tracking in console and JSON output"
  - "MS accuracy improved from 90.9% to 92.8% (+1.9pp)"
affects: [03-engine-fixes plans 09-11, validation harness, XBRL engine]

tech-stack:
  added: []
  patterns:
    - "Methodology diff reclassification pattern: compare first, reclassify DIFF to METHODOLOGY_DIFF if handler matches"

key-files:
  created: []
  modified:
    - "validation/scripts/lib/field-mapper.mjs"
    - "validation/scripts/lib/comparator.mjs"
    - "validation/scripts/lib/reporter.mjs"
    - "src/engines/edgarFinancials.js"
    - "src/engines/__tests__/edgarFinancials.test.js"
    - "validation/reports/morningstar-accuracy.json"

key-decisions:
  - "Methodology handlers reclassify DIFFs only -- genuine MATCHes preserved (handler returns null, normal comparison used)"
  - "METHODOLOGY_DIFF excluded from compared denominator (not in MATCH+CLOSE+DIFF count) to improve accuracy metric accuracy"
  - "net_change_in_cash excludes FX effect to match MS Change in Cash = Op + Inv + Fin convention"
  - "Reporter tracks METHODOLOGY_DIFF as separate count (not lumped into skipped) for transparency"

patterns-established:
  - "Methodology diff handler pattern: field-mapper exports handler, comparator checks after normal comparison, only DIFFs get reclassified"

requirements-completed: [ENGINE-01, ENGINE-04]

duration: 7min
completed: 2026-03-26
---

# Phase 03 Plan 08: Gap Closure Round 2 - Methodology Diffs Summary

**PPE ROU/goodwill/lease methodology reclassification + net_change_in_cash FX exclusion, improving MS accuracy from 90.9% to 92.8%**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-27T02:43:09Z
- **Completed:** 2026-03-27T02:50:09Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Added 3 methodology diff handlers (PPE ROU inclusion, goodwill restated, lease classification) that reclassify 184 known methodology differences
- Fixed net_change_in_cash derivation to exclude FX effect, matching MS convention (37 new MATCHes)
- MS accuracy improved from 90.9% to 92.8% (+1.9 percentage points), with 305 fewer DIFFs (1282 -> 977)
- Zero regressions confirmed across all 50 companies

## Task Commits

Each task was committed atomically:

1. **Task 1: Harness methodology reclassifications + net_change_in_cash engine fix** - `02653e1` (feat)
2. **Task 2: Run full MS comparison and validate accuracy improvement** - `1844fb8` (chore)

## Files Created/Modified
- `validation/scripts/lib/field-mapper.mjs` - Added 3 methodology diff handlers (ppe_rou, goodwill_restated, lease_classification)
- `validation/scripts/lib/comparator.mjs` - Wired methodology handlers to reclassify DIFF -> METHODOLOGY_DIFF after normal comparison
- `validation/scripts/lib/reporter.mjs` - Added METHODOLOGY_DIFF counting in tallyResults, console report, and JSON report
- `src/engines/edgarFinancials.js` - Removed FX from net_change_in_cash derivation, updated getDerivedFormula
- `src/engines/__tests__/edgarFinancials.test.js` - Added 3 tests: FX exclusion, pre-existing value preservation, formula verification
- `validation/reports/morningstar-accuracy.json` - Updated with 92.8% accuracy and methodology diff counts

## Accuracy Results

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| Accuracy | 90.9% | 92.8% | +1.9pp |
| DIFF count | 1,282 | 977 | -305 |
| MATCH count | 13,541 | 13,578 | +37 |
| Compared | 14,902 | 14,634 | -268 |
| Methodology DIFFs | 0 | 184 | +184 |
| Regressions | - | 0 | - |

## Decisions Made
- Methodology handlers only reclassify DIFF results, not MATCH/CLOSE -- if a field happens to match despite methodology differences, that genuine match is preserved
- METHODOLOGY_DIFF is excluded from the accuracy denominator (like SKIP_BANK_TEMPLATE) since these are known methodology choices, not engine bugs
- net_change_in_cash formula verified against GOOGL 2021: MS=-5233M = Op(91652)+Inv(-35523)+Fin(-61362), engine was incorrectly adding FX(-287M)
- Reporter tracks METHODOLOGY_DIFF separately from "skipped" for transparency in the accuracy breakdown

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Updated reporter.mjs to track METHODOLOGY_DIFF and SKIP_BANK_TEMPLATE**
- **Found during:** Task 1 (harness changes)
- **Issue:** reporter.mjs tallyResults didn't count METHODOLOGY_DIFF or SKIP_BANK_TEMPLATE statuses -- they fell through the switch and were invisible in reports
- **Fix:** Added METHODOLOGY_DIFF as separate tracked count, added SKIP_BANK_TEMPLATE to skipped count, updated both console and JSON report generators
- **Files modified:** validation/scripts/lib/reporter.mjs
- **Verification:** Full 50-company run shows "184 methodology" in console output and totalMethodologyDiff in JSON
- **Committed in:** 02653e1 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Reporter fix was necessary for METHODOLOGY_DIFF visibility. No scope creep.

## Issues Encountered
- Validation harness files (lib/, compare-morningstar.mjs) didn't exist in the worktree branch -- had to checkout from workspace/normalization-engine branch before making changes

## Next Phase Readiness
- Harness now supports METHODOLOGY_DIFF status for future reclassifications
- Plans 09-11 can add more methodology handlers using the same pattern
- Remaining 977 DIFFs available for investigation in subsequent gap closure plans

## Self-Check: PASSED

All 8 files verified present. Both task commits (02653e1, 1844fb8) verified in git log.

---
*Phase: 03-engine-fixes*
*Completed: 2026-03-26*
