---
phase: 03-engine-fixes
verified: 2026-03-27T00:42:54Z
status: gaps_found
score: 3/5 success criteria verified
gaps:
  - truth: "The 50-company truth set accuracy reaches 98%+ on scoring-critical fields"
    status: failed
    reason: "Final accuracy is 91.1%, not 98%+. 1244 remaining DIFFs decompose into 463 methodology differences, 176 residual Other mismatches, and 605 genuine value mismatches. All plans executed correctly, but the scope of remaining fixes was underestimated at planning time."
    artifacts:
      - path: "validation/reports/morningstar-accuracy.json"
        issue: "overallAccuracy = 91.1, target was >= 98.0"
    missing:
      - "Reclassify 463 methodology diffs as acceptable in comparator.mjs (accrued scope, ROU PP&E, FX cash, D&A broadening) — +3.1% to 94.2%"
      - "Align residual 'Other' named item lists with MS DataID definitions — +1.2% to 95.4%"
      - "Fix investment flow tags (sale/purchase of investments component summation) — +0.5%"
      - "Fix remaining REIT-specific tag gaps (AMT, EQIX, O revenue/interest residuals) — +0.5%"
      - "Fix per-field genuine mismatches (accounts_receivable scope, DPS timing, effective tax rate rounding) — +2%+"
  - truth: "Triangulation match count higher than pre-batch-1 value (5672)"
    status: failed
    reason: "The final fix-recommendations.json shows match: 0 because all runs were executed without FMP/SimFin API keys, making every field UNIQUE_COVERAGE. The 9815 match count from Plan 01 cannot be confirmed from persisted artifacts — all three pre-batch snapshot files contain the same original 5672 state, not the post-alias state."
    artifacts:
      - path: "validation/reports/fix-recommendations.json"
        issue: "summary.match = 0 (all UNIQUE_COVERAGE, no external sources available)"
      - path: "validation/reports/fix-recommendations-pre-batch-2.json"
        issue: "Identical to pre-batch-1 — post-alias triangulation result (claimed 9815 match) was never snapshotted"
      - path: "validation/reports/fix-recommendations-pre-batch-3.json"
        issue: "Identical to pre-batch-1 — all three pre-batch files are copies of the same original"
    missing:
      - "Re-run triangulate.mjs with FMP/SimFin API keys in .env.local and snapshot the result to confirm 9815 match count"
      - "OR document that triangulation match count tracking is blocked on API key availability and scope to Phase 4 with credentials"
human_verification:
  - test: "Confirm AMT revenue extracted as ~$9.4B after REIT overlay fix"
    expected: "AMT revenue resolves to ~$9.4B (consensus) not $717M (narrow ASC 606 tag). Run node validation/scripts/triangulate.mjs --ticker AMT with API keys and verify revenues field is not classified as CONSENSUS_DIFF."
    why_human: "Cannot verify live XBRL extraction value without running the dev server or a fresh EDGAR API fetch. Code change is confirmed present in edgarFinancials.js and industryOverlays.js but end-to-end AMT value requires live data."
  - test: "Confirm JPM/WFC bank template skip eliminates false operating income failures"
    expected: "Running node validation/scripts/compare-morningstar.mjs --ticker JPM produces 0 DIFF entries for operating_income_loss (status = SKIP_BANK_TEMPLATE)."
    why_human: "Comparator code is verified correct. Full verification requires running the comparison script, which was reported working in Plan 02 (25 skips for JPM) but the current API-key-less environment cannot reproduce."
---

# Phase 03: Engine Fixes Verification Report

**Phase Goal:** The normalization engine reaches 98%+ accuracy on the 50-company Morningstar truth set, with every fix verified against the full truth set before merging
**Verified:** 2026-03-27T00:42:54Z
**Status:** gaps_found
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (from ROADMAP.md Phase 3 Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | 50-company truth set reaches 98%+ accuracy on scoring-critical fields | FAILED | morningstar-accuracy.json: overallAccuracy = 91.1 |
| 2 | No fix creates a net regression — fields gained exceeds fields lost | VERIFIED | fix-recommendations.json regressionDiff shows fieldsGained array, all 7 commits verified clean |
| 3 | Residual "Other" computation enabled only when named item coverage >= 95% | VERIFIED | edgarFinancials.js lines 1152-1160: clCoverage gate confirmed; 8/8 residual tests pass |
| 4 | Financial sector companies (BRK-B, JPM, WFC, MET) show improved accuracy after overlay tuning | VERIFIED (partial) | bank_template_skip handler confirmed wired; REIT overlay revenue/COGS/interest/D&A tags confirmed; AMT live value unverifiable without API run |
| 5 | Triangulation match count higher than pre-batch-1 (5672) after alias resolution | FAILED | Final fix-recommendations.json match = 0 (no API keys); all pre-batch snapshots are identical copies of pre-alias state; post-alias 9815 count not persisted |

**Score:** 3/5 success criteria verified (2 failed: accuracy target and triangulation match tracking)

---

## Required Artifacts

### Plan 01 — Field Alias Map

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `validation/scripts/lib/field-alias-map.mjs` | 17 canonical-to-engine aliases, exports resolveFieldName + FIELD_ALIASES | VERIFIED | File exists, 82 lines, 17 entries, both exports present, REVERSE_ALIASES added for bidirectional resolution |
| `src/engines/__tests__/harness/field-alias-map.test.js` | Unit tests for alias resolution, min 40 lines | VERIFIED | 147 lines, 16 tests covering all aliases, passthrough, round-trip |
| `validation/reports/fix-recommendations-pre-batch-1.json` | Pre-fix triangulation baseline snapshot | VERIFIED | Exists, shows 5672 match, 2177 likelyBug, 609 consensusDiff |
| `validation/reports/morningstar-accuracy-pre-batch-1.json` | Pre-fix MS comparison baseline (91.2%) | VERIFIED | Exists, overallAccuracy = 91.2 |

### Plan 02 — REIT/Bank Engine Fixes

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/engines/industryOverlays.js` | REIT overlay with revenues, cost_of_revenue, interest_expense, depreciation_amortization_is | VERIFIED | All 4 fields confirmed with correct XBRL tags (Revenues, CostOfRealEstateRevenue, InterestExpense, DepreciationAndAmortization) |
| `src/engines/edgarFinancials.js` | Short-term debt component summation using commercial_paper + short_term_borrowings | VERIFIED | Lines 1025-1039: component summation logic confirmed; CommercialPaper field in BALANCE_TAXONOMY at line 319 |
| `validation/scripts/lib/field-mapper.mjs` | bank_template_skip handler with BANK_TEMPLATE_TICKERS (ticker-based) | VERIFIED | Handler exists at line 144; BANK_TEMPLATE_TICKERS = Set(['JPM', 'WFC']); skips operating_income_loss, cost_of_revenue, gross_profit, sga, R&D |
| `validation/scripts/lib/comparator.mjs` | bank_template_skip integration before msValue null check | VERIFIED | Lines 120-134: handler wired, produces SKIP_BANK_TEMPLATE status |
| `validation/scripts/triangulate.mjs` | property_plant_equipment METHODOLOGY_DIFF reclassification | VERIFIED | Lines 475-480: METHODOLOGY_OVERRIDE_FIELDS Set, 1% FMP tolerance check |

### Plan 03 — Residual Other Computation

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/engines/edgarFinancials.js` | Residual OtherCL with 95% clCoverage gate, overcounting guard, no-overwrite | VERIFIED | Lines 1137-1161: all three guards confirmed (coverage >= 0.95, residual >= 0, null-only assignment) |
| `src/engines/__tests__/edgarFinancials.test.js` | 5+ tests in "Residual Other computation" describe block | VERIFIED | 8 tests in describe block, all pass (51/51 total) |
| `validation/reports/morningstar-accuracy.json` | Final MS accuracy report | VERIFIED (content) | Exists, overallAccuracy = 91.1, 14849 compared, 13526 match, 1244 diff |

### Plan 04 — Category B Harness Alignment

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `validation/scripts/lib/field-mapper.mjs` | Per-year accrued_combined_skip handler | VERIFIED | accrued_combined_skip at line 111: checks yearData[currentYear] not all-years |
| `validation/scripts/lib/comparator.mjs` | accrued handler passes msYear as third arg | VERIFIED | Line 148: specialHandlers.accrued_combined_skip(msValue, msStmt, msYear) — msYear passed |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| field-alias-map.mjs | triangulate.mjs | import { resolveFieldName, resolveCanonicalName } | WIRED | Line 156 of triangulate.mjs; getEngineFieldValue wrapper at line 348-350 |
| industryOverlays.js | edgarFinancials.js | mergeOverlayStatements (overlay-wins) | WIRED | Lines 1718-1729 of edgarFinancials.js: overlay always wins, not additive-only |
| field-mapper.mjs bank_template_skip | comparator.mjs compareCompany | specialHandlers.bank_template_skip | WIRED | comparator.mjs line 120: handler checked, SKIP_BANK_TEMPLATE status emitted |
| field-mapper.mjs accrued_combined_skip | comparator.mjs per-year loop | msYear passed as 3rd argument | WIRED | comparator.mjs line 148: all 3 args confirmed |
| edgarFinancials.js computeDerivedFields | clCoverage gate | other_current_liabilities residual | WIRED | Lines 1141-1161: gate → formula → assignment all connected |

---

## Data-Flow Trace (Level 4)

Not applicable — phase produces validation scripts and engine fixes, not React components rendering dynamic data.

---

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| All 51 edgarFinancials tests pass | npx vitest run src/engines/__tests__/edgarFinancials.test.js | 51/51 pass | PASS |
| All 311 harness tests pass | npx vitest run src/engines/__tests__/harness/ | 311/311 pass | PASS |
| Residual gate tests (8 new) all pass | vitest: "Residual Other computation" describe | 8/8 pass | PASS |
| MS accuracy confirmed at 91.1% | morningstar-accuracy.json overallAccuracy | 91.1 | PASS (value confirmed, target missed) |
| Triangulation match > pre-batch-1 (5672) | fix-recommendations.json summary.match | 0 (no API keys) | FAIL |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| ENGINE-01 | 03-01, 03-02, 03-04 | Named item XBRL tag coverage fixes — intangibles, accrued, D&A, operating income | SATISFIED | field-alias-map.mjs (17 aliases), industryOverlays.js (REIT revenue/COGS/D&A/interest), field-mapper.mjs (intangibles_net, operating_income_reported handlers) |
| ENGINE-02 | 03-03 | Residual "Other" field computation with 95% per-company-year precondition gate | SATISFIED | edgarFinancials.js clCoverage gate confirmed; 8 tests pass |
| ENGINE-03 | 03-02, 03-04 | Financial sector overlay validation — bank/REIT/insurance overlay fields tuned | SATISFIED (partial) | bank_template_skip handler wired for JPM/WFC; REIT overlay revenue/COGS/interest/D&A added; live AMT value unverifiable |
| ENGINE-04 | 03-01, 03-02, 03-03 | Regression protection via baseline snapshot diffing | SATISFIED | 3 pre-batch baselines exist; all 7 commits verified; regressionDiff in final report; no test failures |

All 4 ENGINE requirements are marked Complete in REQUIREMENTS.md traceability table and are substantively implemented. ENGINE-03 carries one open item (live AMT revenue verification) but the code change is correct.

**SCALE-01** (98%+ on 50-company truth set) is Phase 4's requirement — not Phase 3's. The ROADMAP notes it as Pending under Phase 4. However, Phase 3's own success criterion #1 requires 98%+, which is not met.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| validation/reports/fix-recommendations-pre-batch-2.json | n/a | Identical content to pre-batch-1 (same timestamp 2026-03-26T02:27:04.642Z) | Warning | Baseline regression tracking for Plans 02-04 is compromised — the three baselines don't capture progressive states. Workaround: SUMMARY files document per-plan accuracy numbers in narrative form. |
| validation/reports/fix-recommendations-pre-batch-3.json | n/a | Identical content to pre-batch-1 | Warning | Same as above |
| validation/reports/fix-recommendations.json | n/a | match: 0 (no external sources, all UNIQUE_COVERAGE) | Warning | Cannot confirm 73% triangulation improvement (5672→9815 MATCH) from Plan 01 — this claim exists only in SUMMARY narrative |

None of these are blocker anti-patterns — the engine code is correct and tests pass. The issues are in the validation artifact tracking (baseline snapshots were not re-taken with API credentials, and post-alias triangulation run result was not committed as a named baseline).

---

## Gaps Summary

**Gap 1 — Accuracy target missed (98% vs 91.1%)**

This is the phase's primary stated goal. The executor documented the gap thoroughly: 1244 DIFFs break down as 463 methodology differences (comparator could reclassify as acceptable), 176 residual Other mismatches (named item list alignment), and 605 genuine value mismatches (require deeper tag additions or derivation fixes). The executor produced a detailed 5-step remediation path to 98%+ that is actionable for Phase 4 planning. The shortfall is in the scope of remaining fixes, not in the quality of delivered fixes.

**Gap 2 — Triangulation match count not verifiable**

The claimed improvement (5672→9815 MATCH, +73%) cannot be confirmed from persisted artifacts. All three pre-batch baseline files are identical copies of the original pre-Phase-3 state, and the final fix-recommendations.json shows 0 MATCH because API keys were not available during the runs. The 9815 number appears only in SUMMARY narrative. This is a documentation/artifact gap, not a code quality gap — the alias map code is correct and the tests pass.

**Root cause overlap:** Both gaps trace to the same constraint — FMP/SimFin API keys were not available in the worktree environment where plans executed. This prevented live triangulation validation of engine fixes and prevented meaningful pre-batch snapshots from being taken.

---

## Human Verification Required

### 1. AMT Revenue Value Confirmation

**Test:** Run `node validation/scripts/triangulate.mjs --ticker AMT` with FMP/SimFin API keys in `.env.local`. Check the `revenues` field classification for AMT.
**Expected:** AMT revenues classified as MATCH or METHODOLOGY_DIFF (not CONSENSUS_DIFF or LIKELY_BUG). Engine value should be approximately $9.4B.
**Why human:** Requires live EDGAR API call + active FMP/SimFin credentials. Code change to industryOverlays.js is correct (Revenues tag added, overlay-wins merge confirmed), but the actual extracted value requires a live data run.

### 2. JPM Bank Template Skip in Production Run

**Test:** Run `node validation/scripts/compare-morningstar.mjs --ticker JPM`. Count entries with status = SKIP_BANK_TEMPLATE.
**Expected:** At least 25 entries skipped (the number documented in Plan 02 SUMMARY). operating_income_loss, cost_of_revenue, and gross_profit should show SKIP_BANK_TEMPLATE not DIFF.
**Why human:** The comparison script runs against local MS fixture files and requires the engine bundle. Requires running `node validation/scripts/bundle.mjs` first to confirm the bundle includes the overlay changes.

---

_Verified: 2026-03-27T00:42:54Z_
_Verifier: Claude (gsd-verifier)_
