# Financial Data Discrepancies — Root Cause Analysis

**Date:** 2026-03-21
**Ticker investigated:** LULU (lululemon athletica)
**Sources compared:** R1 Toolbox, Morningstar (MS), Thes1s XBRL engine
**Status:** ✅ All 3 fixes implemented and verified (2026-03-21)

---

## Summary

Four categories of discrepancies found when comparing LULU financial statement numbers across R1 Toolbox, Morningstar, and Thes1s. Two were bugs (total debt, year labels), one was a missing feature (restated operating income), and one is a defensible design difference (shares outstanding).

| Issue | Severity | Scope | Root Cause | Status |
|-------|----------|-------|------------|--------|
| Total debt over-inflated | High | Zero-debt companies with large lease liabilities | Sanity check false-fires, misclassifies non-debt liabilities as debt | ✅ Fixed |
| Fiscal year label offset | High | 12+ S&P 500 tickers | XBRL `fy` field ≠ end-date calendar year for Jan/Feb FY companies | ✅ Fixed |
| Operating income (as-reported only) | High | Any company with impairments/restructuring | No normalized/restated view — irregular items included | ✅ Fixed |
| Shares outstanding mismatch | Low | All companies (minor variance) | Different XBRL tag vs R1/MS methodology | Deferred — defensible |

---

## Issue 1: Total Debt Over-Inflated by Sanity Check

### Symptom

Thes1s shows LULU Total Debt = $2,272M vs R1's $1,576M for the same period. LULU has **zero financial debt** — all liabilities are operating leases and accruals.

### Root Cause

A cascading bug in `computeDerivedFields` (`src/engines/edgarFinancials.js:957-991`):

**Step 1** — Initial calculation: LULU has no traditional debt, no finance leases.
```
total_debt = short_term_debt(0) + current_portion_lt_debt(0) + long_term_debt(0)
           + finance_lease_current(0) + finance_lease_noncurrent(0) = $0
```

**Step 2** — Sanity check fires: `$0 / $3,279M = 0% < 5%` threshold.
The check assumes debt tags are missing and derives debt from `liabilities - knownNonDebt`.

**Step 3** — `knownNonDebt` deductions are incomplete. These liability categories have no matching deduction:
- **Taxes payable** (~$200M) — tagged as `TaxesPayableCurrent` / `AccruedIncomeTaxesCurrent`, not in any deduction bucket
- **Derivative liabilities** (~$75M) — no category at all in knownNonDebt
- **Other provisions** (~$74M) — partially captured but not fully

Result: `derived_debt ≈ $696M` (the unclassified remainder gets misclassified as "debt").

**Step 4** — The CSV maps "Total Debt (Short & Long-Term)" to `total_debt_with_leases` (`FinancialStatements.jsx:247`):
```
total_debt_with_leases = $696M (false "debt") + $1,576M (operating leases) = $2,272M
```

**Correct values:** `total_debt = $0`, `total_debt_with_leases = $1,576M`

### Scope

Any company with:
- Zero or very low traditional debt (many tech companies, asset-light retailers)
- Significant operating lease liabilities (all retailers, restaurants, airlines)
- Uncategorized liability items (taxes payable, derivatives, provisions)

The sanity check was designed for REITs/banks/insurance where debt tags genuinely have gaps. For standard companies with zero debt, it creates false positives.

### Fix Applied ✅

**Interest expense gate + expanded non-debt buckets** (Option D from investigation)

1. **Gated the sanity check on interest expense:**
   The check now only fires when `interest_expense != null && interest_expense > 0`. Companies with $0 debt have ~$0 interest expense, so the check correctly skips them. REITs/banks/insurance with genuine debt tag gaps still have the fallback because they report significant interest expense.

2. **Added `taxes_payable` taxonomy field:**
   New `BALANCE_TAXONOMY` entry with tags `TaxesPayableCurrent`, `AccruedIncomeTaxesCurrent`, `IncomeTaxesPayable`. Added to `knownNonDebt` deductions so taxes payable is never misclassified as debt.

3. **Did NOT add `derivative_liabilities` or `provisions_current`:**
   The interest expense gate is sufficient — it prevents the sanity check from firing on zero-debt companies entirely. The expanded non-debt buckets are a belt-and-suspenders improvement for when the check legitimately fires; `taxes_payable` was the largest missing category.

**Files changed:**
- `src/engines/edgarFinancials.js` — added `taxes_payable` to `BALANCE_TAXONOMY`, gated sanity check on `interest_expense > 0`, added `taxes_payable` to `knownNonDebt`
- `src/engines/__tests__/edgarFinancials.test.js` — updated sanity check test to include `interest_expense` in test data

**Result:** LULU `total_debt` now correctly = $0. `total_debt_with_leases` correctly = operating leases only.

---

## Issue 2: Fiscal Year Label Offset

### Symptom

Thes1s labels LULU fiscal years 1 year behind R1/MS. Example: Thes1s shows "2024 (Feb)" for the same period R1/MS call "2025" (Revenue = $10,588M in both).

### Root Cause

The engine uses the XBRL `fy` field directly as the year label (`src/engines/edgar.js:254-268`). For companies whose fiscal year ends in January or February, the XBRL `fy` value is 1 less than the calendar year of the period end date.

- **LULU FY ending Feb 2, 2025** → XBRL `fy` = 2024, end-date year = 2025
- R1/MS use end-date calendar year convention → "2025"
- Thes1s uses XBRL `fy` convention → "2024 (Feb)"

For companies with March–December fiscal year ends, `fy` and end-date year are the same — no offset.

### Affected Companies (S&P 500 — all January FY ends)

LULU, NVDA, WMT, HD, TGT, CRM, CRWD, ROST, DG, SFM, MRVL, WDAY

This was previously documented in `validation/validation-summary-2026-03-10.md` — a year-offset fallback was added to the Python validation scripts, but no fix was applied to the main app engine.

### Fix Applied ✅

**Re-label to end-date calendar year at the output layer**

Applied the offset in `fetchEdgarStatements` and `fetchEdgarQuarterly` AFTER all computation (extraction, split adjustment, derived fields, provenance) but BEFORE caching. This keeps the core extraction functions (`extractAnnualFact`, `extractFiscalYearEnds`) pure — they continue using XBRL `fy` internally.

**Implementation:**
1. After all computation, detect if FY end month is Jan or Feb (from `fiscalMonths`)
2. If so, remap all year keys in `income`, `balance`, `cashFlow`, provenance objects, `fiscalMonths`, and the `years` array by +1
3. Applied the same offset to `fetchEdgarQuarterly` (remaps `quarterly` keys and `fiscalYears` array)

**Frames API not affected:** `edgarFrames.js` continues using XBRL convention via its own `fiscalYearToCalendarYear()` function — no changes needed.

**Cache keys bumped:** Annual v7→v8, quarterly added v2 prefix. Forces re-extraction with new labels.

**Accuracy test offset detection updated:** Both annual and quarterly tests now try offsets [0, -1, +1] (was [0, -1]). Needed because the Morningstar fixture parser shifted Jan/Feb FY companies to EDGAR convention, but the engine now outputs calendar-year labels.

**Files changed:**
- `src/engines/edgarFinancials.js` — year remapping in `fetchEdgarStatements` and `fetchEdgarQuarterly`, cache key bumps
- `src/engines/__tests__/morningstarAccuracy.test.js` — offset detection: added +1, updated comments
- `src/engines/__tests__/morningstarQuarterlyAccuracy.test.js` — same offset detection update

**Result:** LULU years now labeled 2011-2026 (was 2010-2025). CRM, NVDA, ULTA, WSM, BOOT all correctly relabeled. Annual accuracy 91.2% (up from 91.0%), quarterly 92.8% (unchanged).

---

## Issue 3: Operating Income — Restated vs As-Reported

### Symptom

Thes1s operating income includes irregular charges (impairments, restructuring, M&A, goodwill write-offs). R1/MS strip these out to show a "restated" or "normalized" figure.

| Year (R1 label) | Thes1s (as-reported) | R1/MS (restated) | Difference | Cause |
|---|---|---|---|---|
| 2025 | $2,506M | $2,506M | — | No irregular items |
| 2024 | $2,133M | $2,207M | −$74.5M | Asset impairment |
| 2023 | $1,328M | $1,726M | −$398M | Goodwill write-off + impairment |
| 2022 | $1,333M | $1,375M | −$41M | M&A charges |

### Root Cause

The engine extracts `OperatingIncomeLoss` directly from XBRL (`src/engines/edgarFinancials.js:68-71`). This is the as-reported GAAP figure. The irregular item XBRL tags exist in the `other_operating_expenses` field (`edgarFinancials.js:58-63`) but are aggregated into a single bucket — never used to compute a normalized operating income.

Available XBRL tags for irregular items:
- `RestructuringCharges`
- `GoodwillImpairmentLoss`
- `AssetImpairmentCharges`

### Scope

Any company that has ever taken a write-down, restructuring charge, or impairment. This is extremely common — most S&P 500 companies have at least one irregular year in a 10-year history.

For Rule One analysis, the restated view is more useful (reflects ongoing business profitability). The as-reported view matters for GAAP accuracy and understanding what actually happened.

### Fix Applied ✅

**Added both views — as-reported preserved, normalized derived**

1. **Added 3 new fields to `INCOME_TAXONOMY`:**
   - `restructuring_charges` → `RestructuringCharges`, `RestructuringSettlementAndImpairmentProvisions`, `RestructuringCostsAndAssetImpairmentCharges`
   - `goodwill_impairment` → `GoodwillImpairmentLoss`
   - `asset_impairment` → `AssetImpairmentCharges`, `ImpairmentOfLongLivedAssetsHeldForUse`, `ImpairmentOfIntangibleAssetsExcludingGoodwill`

2. **Added derived `normalized_operating_income` in `computeDerivedFields`:**
   ```
   normalized_operating_income = operating_income_loss
     + abs(restructuring_charges)
     + abs(goodwill_impairment)
     + abs(asset_impairment)
   ```
   Only set when at least one irregular item is non-zero. Uses `Math.abs()` because XBRL may report charges as negative (expense convention).

3. **Added formula to `getDerivedFormula`** for provenance tracking.

**Not yet done:** UI toggle to switch between `operating_income_loss` and `normalized_operating_income` in the Financials tab. The field is available in the data for AI report generation (Phase 5+) and future UI integration.

**Files changed:**
- `src/engines/edgarFinancials.js` — 3 new taxonomy fields, derived field computation, formula

---

## Issue 4: Shares Outstanding Mismatch

### Symptom

| Source | LULU FY2025 Shares | Measurement |
|--------|-------------------|-------------|
| Thes1s | 116.2M | Period-end balance sheet (`CommonStockSharesOutstanding`) |
| R1 | 121.3M | Unknown methodology (likely proprietary) |
| MS | 123.7M | Weighted average (`WeightedAverageNumberOfSharesOutstandingBasic`) |

### Root Cause

Three different measurements:

- **Thes1s** uses `CommonStockSharesOutstanding` from the `us-gaap` namespace (`edgarFinancials.js:413-416`), with `CommonStockSharesIssued` as fallback. This is the **period-end** point-in-time count. Uses `splitSensitive: true` (original filing via `extractAnnualFactOriginal`).

- **MS** uses weighted average shares outstanding (WASO) — the average over the fiscal year. For a company buying back shares throughout the year, WASO > period-end count.

- **R1** (121.3M) falls between the two, suggesting a different source or mid-year snapshot.

The `dei:EntityCommonStockSharesOutstanding` tag (10-K cover page) exists in the SEC data but the engine only extracts from the `us-gaap` namespace (`edgar.js:238`). The `dei` namespace is only used for split detection (`splits.js:98`).

### Assessment

**Thes1s's 116.2M is actually the most accurate for current valuation.** Period-end shares outstanding is the correct number for:
- Current BVPS calculation
- Current market cap calculation
- Per-share valuation metrics

WASO is correct for EPS (and Thes1s already uses `basic_average_shares` / `diluted_average_shares` for EPS via separate tags).

### Status: Deferred (low priority)

Current behavior is defensible and arguably more correct for valuation purposes. Optionally add `dei:EntityCommonStockSharesOutstanding` as an additional fallback in a future iteration.

---

## Verification Results

### Test Suite (post-fix)

| Test | Result |
|------|--------|
| Engine unit tests | **323/323 pass** (10 test files, 3.24s) |
| Annual accuracy | **91.2%** (13,507/14,818 match) — up from 91.0% baseline |
| Quarterly accuracy | **92.8%** (46,607/50,235 match) — unchanged from baseline |
| Production build | ✅ succeeds |

### LULU Specific

| Issue | Before | After |
|-------|--------|-------|
| FY label for FY ending Feb 2026 | "2025 (Feb)" | "2026 (Feb)" ✅ |
| Total debt | $2,272M (false) | $0 (correct) ✅ |
| Total debt with leases | $2,272M (inflated) | $1,576M (operating leases only) ✅ |
| Normalized operating income | Not available | Available as `normalized_operating_income` ✅ |

### Per-Company Impact (accuracy test)

| Ticker | Before | After | Change | Note |
|--------|--------|-------|--------|------|
| LULU | ~87% | 90.6% | +3.6pp | FY offset fixed |
| CRM | 61.0% | 70.7% | +9.7pp | FY offset fixed (now offset:1) |
| NVDA | ~90% | 94.6% | +4.6pp | FY offset fixed (now offset:1) |
| ULTA | 89.8% | 96.1% | +6.3pp | FY offset fixed |
| Overall | 91.0% | 91.2% | +0.2pp | Net improvement |

---

## Big Picture: Future-Proofing for Non-Calendar Fiscal Years

### Companies with non-December FY ends in the validation set

| FY End Month | Companies |
|---|---|
| Jan | SFM, LULU, NVDA, WMT, HD, TGT, DG, ROST, MRVL, WDAY, CRM, CRWD |
| Mar | DECK |
| Apr | CASY |
| May | NKE, FDX, ORCL |
| Jun | MSFT, LRCX, KLAC |
| Jul | PANW, ZS |
| Aug | COST, MU, ACN |
| Sep | AAPL, QCOM, DIS, SBUX |
| Oct | AMAT, AVGO, DE |
| Nov | CCL, ADBE |

Only January (and occasionally February) FY ends create the year-label offset. All other non-December months: XBRL `fy` matches the calendar year of the end date.

### Implementation Order (completed)

1. ✅ **Total debt sanity check** — Interest expense gate prevents false-fires on zero-debt companies
2. ✅ **Fiscal year labels** — Jan/Feb FY companies relabeled to end-date calendar year
3. ✅ **Normalized operating income** — Irregular items extracted, normalized field derived
4. ⏸ **Shares outstanding** — Deferred, current behavior is defensible
5. ✅ **TTM Q4 bug** — TTM now uses 10-K annual data when it's the latest filing (was stuck on Q3)

---

## Issue 5: TTM Stale When 10-K Is Latest Filing

### Symptom

For companies whose latest quarter is Q4 (i.e., the annual 10-K just filed), TTM values did NOT equal the latest fiscal year annual. LULU example: TTM Revenue = $11,150.6M vs Annual FY = $11,102.6M, TTM Net Income = $2,000.1M vs Annual = $1,579.2M — off by $421M. TTM Total Assets = $7,955.2M vs Annual = $8,456.7M (balance sheet stale by one quarter). Affected all companies between 10-K filing and next Q1 10-Q.

### Root Cause

`findLatestQuarter()` in `src/engines/edgar.js:363` explicitly filtered to `form === '10-Q'` and `fp ∈ ['Q1', 'Q2', 'Q3']`. Q4 data arrives via the 10-K filing (`form === '10-K'`, `fp === 'FY'`), not a 10-Q. The engine never considered 10-K filings when determining the latest quarter, so TTM always computed from Q3 at most.

Additionally, the TTM helper functions (`getQuarterlyYTD`, `getQuarterlyInstant`) all filtered on `form === '10-Q'`, so even if `findLatestQuarter` returned a 10-K reference, the data lookup would have failed.

### Fix Applied ✅

**Two changes:**

1. **`findLatestQuarter` (edgar.js)** — now also scans for 10-K filings. Compares end dates: if the latest 10-K covers a later period than the latest 10-Q, returns `{ fy, fp: 'FY', end }`. This correctly detects the Q4 window (after 10-K filing, before next Q1 10-Q).

2. **`extractTTMSection` (edgarFinancials.js)** — when `fp === 'FY'`, bypasses the quarterly YTD formula entirely and returns `getAnnualTotal(entries, fy)` directly. This works for all section types (income, balance sheet, cash flow) because `getAnnualTotal` returns the 10-K value regardless of whether it's a duration or instant item.

**Cache key bumped** v8→v9 to force re-extraction.

**Files changed:**
- `src/engines/edgar.js` — `findLatestQuarter()` now detects 10-K as latest
- `src/engines/edgarFinancials.js` — `extractTTMSection()` handles `fp='FY'`, `computeTTM` exported for testing, cache key v8→v9
- `src/engines/__tests__/edgarFinancials.test.js` — 5 new regression tests (revenue, net income, total assets, operating CF, quarter label)

### Remaining Work

- **UI toggle for normalized operating income** — the field exists in the data but isn't surfaced in the FinancialStatements UI yet. Could extend the existing Version dropdown or add a separate toggle.
- **Cache invalidation** — users with existing cached data need to clear IndexedDB or wait for cache expiry. The cache key bump (v8→v9 annual, v2 quarterly) ensures fresh extraction.
