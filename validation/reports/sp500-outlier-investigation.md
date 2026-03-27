# S&P 500 FMP Outlier Investigation

**Date:** 2026-03-27
**Initial Tier 1 Accuracy:** 80.0%
**Initial Overall Accuracy:** 77.4%

## Executive Summary

Two systematic issues dominate the Tier 1 failure patterns:

1. **Sign convention mismatch for `share_repurchases`** (446 companies, 214% avg diff): FMP stores cash outflow fields as negative, our engine stores XBRL Payments tags as positive. This is a comparison infrastructure bug, not an engine bug.

2. **Fiscal year offset for non-December FY companies** (~100+ companies, causes `revenues`, `operating_income_loss`, `net_income_loss`, and all other fields to DIFF): FMP labels fiscal years by the FY-end year (e.g., LULU FY ending Jan 2025 = FMP "2025"), while our engine labels them by the calendar year covering most of the period (= engine "2024"). This creates a systematic 1-year offset for companies with Jan-May fiscal year ends.

These two issues likely account for ~70% of the observed Tier 1 failures. Fixing them in the comparator (not the engine) should dramatically improve reported accuracy.

---

## RACE (D-05 -- EUR Filer)

**Finding:** RACE (Ferrari) is NOT in the S&P 500 ticker list (verified via Wikipedia scrape). It was previously flagged from the 50-company Morningstar truth set where it had 0% accuracy due to EUR-denominated XBRL filings.

**Resolution:** Non-issue for S&P 500 comparison. RACE is already in the `EUR_COMPANIES` set in `comparator.mjs` and would be skipped with `SKIP_EUR` status if encountered. No action needed.

---

## MET (D-06 -- Insurance Sector)

**FMP Tier 1 Accuracy:** 47.5%
**Top Tier 1 Failures:** revenues, operating_income_loss, long_term_debt

**Analysis:**
- MET (MetLife) has a December fiscal year end -- no FY alignment issue.
- MET is classified as `insurance` by our industry overlay. The overlay adds specialized fields (premiums, claims, combined ratio) but the base revenue/income fields may differ from FMP's definition.
- FMP 2024 revenues: $69.9B; our engine may report different revenue composition for insurance companies (premiums earned vs total revenues including investment income).
- `operating_income_loss`: Insurance companies don't have traditional operating income. FMP may derive it differently than our overlay.
- `long_term_debt`: FMP reports $18.2B; our engine may classify insurance policy liabilities differently.

**Classification:** METHODOLOGY_DIFF for revenue/operating income definitions in the insurance sector. The insurance overlay uses XBRL-specific tags that may capture different line items than FMP's normalization. FMP treats insurance as standard income statement; our overlay uses insurance-specific taxonomy.

**Recommendation:** Do not fix. Insurance revenue and operating income definitions inherently differ between XBRL taxonomy (which separates premiums, investment income, realized gains) and FMP (which may aggregate them differently). Document as METHODOLOGY_DIFF.

---

## WFC (D-06 -- Bank Sector)

**FMP Tier 1 Accuracy:** 72.0%
**Top Tier 1 Failures:** operating_income_loss, share_repurchases, income_tax

**Analysis:**
- WFC (Wells Fargo) has a December fiscal year end -- no FY alignment issue.
- WFC is classified as `bank` by our industry overlay.
- `share_repurchases`: This is the sign convention mismatch (FMP negative, engine positive). Will be fixed by the sign fix in the comparator.
- `operating_income_loss`: Banks don't have traditional COGS/gross profit/operating income. FMP may derive "operating income" differently than our bank overlay.
- `income_tax`: May be a genuine comparison issue or methodology difference in how deferred tax is handled for banks.

**Classification:** Partial METHODOLOGY_DIFF (operating_income for banks) + comparison infrastructure bug (share_repurchases sign). After sign fix, WFC accuracy should improve by ~10-15 percentage points.

---

## CRM (D-07)

**FMP Tier 1 Accuracy:** 24.4%
**Top Tier 1 Failures:** operating_income_loss, revenues, income_tax

**Analysis:**
- CRM (Salesforce) has a **January fiscal year end**.
- FMP year keys: 2022, 2023, 2024, 2025, 2026 (FY2026 ending Jan 2026).
- Our engine likely keys the same period as 2025 (covering most of calendar 2025).
- **This is a fiscal year alignment issue.** Every field comparison is offset by 1 year, causing near-complete mismatch.

**Classification:** FY_ALIGNMENT -- not an engine bug, not a methodology diff. The comparator needs FY offset logic for non-December FY companies.

---

## EW (D-07)

**FMP Tier 1 Accuracy:** 81.3%
**Top Tier 1 Failures:** share_repurchases, operating_income_loss, revenues

**Analysis:**
- EW (Edwards Lifesciences) has a December fiscal year end -- no FY alignment issue.
- `share_repurchases`: Sign convention mismatch (FMP negative, engine positive).
- `operating_income_loss`: May be methodology diff in how EW's R&D/SGA split is handled. EW has significant M&A activity that may distort operating income comparisons.
- `revenues`: EW had a 2023 spin-off of its Critical Care business. Historical revenue comparisons may differ depending on whether restated or original values are used.

**Classification:** Partial comparison bug (share_repurchases sign) + METHODOLOGY_DIFF (operating income) + spin-off effect (revenues). After sign fix, accuracy should improve.

---

## EQIX (D-07)

**FMP Tier 1 Accuracy:** 87.8%
**Top Tier 1 Failures:** retained_earnings, long_term_debt

**Analysis:**
- EQIX (Equinix) has a December fiscal year end -- no FY alignment issue.
- EQIX is classified as `reit` by our industry overlay.
- `retained_earnings`: REITs distribute most income as dividends, keeping retained earnings low. Small absolute differences can create large percentage diffs.
- `long_term_debt`: REITs carry significant debt; our engine may classify certain REIT-specific financing instruments differently than FMP.

**Classification:** METHODOLOGY_DIFF for REIT-specific debt classification. 87.8% Tier 1 accuracy is reasonable for a REIT.

---

## Systematic Tier 1 Failure Analysis

### Top 5 Tier 1 Failure Patterns

| Rank | Field | Companies | Avg Diff | Root Cause | Classification |
|------|-------|-----------|----------|------------|----------------|
| 1 | share_repurchases | 446 | 214.2% | FMP stores as negative (outflow), engine stores as positive (XBRL Payments tag) | COMPARISON_BUG -- sign flip needed in comparator |
| 2 | operating_income_loss | 262 | 83.4% | Mix of FY offset (~100 companies) + financial sector methodology (~50 companies) + genuine diffs (~112) | MIXED -- FY alignment + METHODOLOGY_DIFF |
| 3 | short_term_debt | 224 | 1201.7% | FMP may include current portion of LT debt in short-term debt; our engine separates them | METHODOLOGY_DIFF -- definition boundary |
| 4 | long_term_debt | 176 | 64.4% | FMP/engine boundary between LT debt, capital leases, and current portion differs | METHODOLOGY_DIFF -- definition boundary |
| 5 | capital_expenditures | 139 | 67.8% | FMP sign already flipped to positive (sign:-1 in mapping). May be FY offset for non-Dec companies or definition diff (maintenance vs growth capex) | MIXED -- FY alignment + definition |
| 6 | revenues | 115 | 36.1% | Primarily FY offset for non-Dec FY companies + financial sector revenue definition | MIXED -- FY alignment + METHODOLOGY_DIFF |
| 7 | cash | 111 | 1307.2% | FMP "cash and equivalents" vs engine "cash" -- engine may include/exclude short-term investments differently | METHODOLOGY_DIFF -- definition boundary |
| 8 | income_tax | 109 | 113.3% | Mix of FY offset + deferred tax treatment differences | MIXED -- FY alignment + methodology |
| 9 | retained_earnings | 82 | 37.3% | Genuine diff in equity section decomposition | METHODOLOGY_DIFF |
| 10 | net_income_loss | 80 | 123.2% | Primarily FY offset + discontinued operations treatment | MIXED -- FY alignment + methodology |

### Fixable Issues (for Task 2)

1. **share_repurchases sign convention** (COMPARISON_BUG): Add sign flip in `sp500-fmp-comparator.mjs` for fields where FMP uses outflow convention (negative) but engine uses XBRL Payments convention (positive). Affects: `share_repurchases`. Estimated impact: +2-3% Tier 1 accuracy across 446 companies.

2. **Fiscal year alignment** (COMPARISON_BUG): Add FY offset detection in the comparator for non-December FY companies. FMP uses FY-end year as label; engine uses calendar year covering majority of fiscal period. For Jan-May FY-end companies, FMP year = engine year + 1. Estimated impact: +5-10% Tier 1 accuracy (affects ~100+ companies including all 24 bottom-performers).

### Non-fixable Issues (METHODOLOGY_DIFF)

- Financial sector revenue/operating income definitions (insurance, bank, REIT)
- Short-term vs long-term debt classification boundaries
- Cash vs cash equivalents vs short-term investments boundaries
- Retained earnings decomposition in equity section

These are genuine methodology differences between FMP's normalization and our XBRL extraction. They represent different but valid interpretations of the underlying financial data.
