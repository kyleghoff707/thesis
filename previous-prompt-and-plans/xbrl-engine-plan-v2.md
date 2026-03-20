# Thes1s XBRL Engine — Implementation Plan v2

## Context

### The Goal
Recreate the Rule One Toolbox's financial data pipeline inside Thes1s, using SEC EDGAR XBRL as the data source instead of paying Morningstar thousands of dollars per year. The engine powers Rule One investment research — valuation calculators, growth rates, scoring, and AI-assisted report generation.

### What We Now Know
After comparing raw Morningstar data against R1 Toolbox across 12 companies and all three financial statements, we discovered that **R1 Toolbox does almost nothing**. It is a presentation layer on top of Morningstar:

- **Income Statement**: Zero transformations. Sign flips (expenses negative → positive), label renames, ~20 computed fields (EBITDA, Normalized Income, Tax Rate, etc.). Core financial chain (Revenue → Net Income → EPS) passes through unchanged.
- **Balance Sheet**: Zero transformations. Label renames, hierarchy flattening, ~15 computed fields (Total Debt, Net Debt, Working Capital, Invested Capital, etc.). Net vs Gross presentation on goodwill/intangibles (R1 shows net).
- **Cash Flow**: Zero transformations. The only R1-computed field is Free Cash Flow (OCF - CapEx). Everything else is a direct pass-through.

This means our real challenge is **matching Morningstar's standardized output from XBRL source data** — not replicating R1-specific logic. If we match Morningstar, we match R1 automatically. The R1-added computed fields are simple arithmetic we already implement.

### What Went Wrong Before
The previous XBRL engine restructure (Phases 1-8) focused on increasing *coverage breadth* — more tags, more layers, more taxonomy descendants. The S&P 500 coverage audit showed improving percentages (91.3% → 96.1% Tier 1), but the audit measured "does any tag exist?" not "is the value correct?" This led to:

1. **Tag priority regressions** — Layer 2 taxonomy descendants and Layer 3 AI-classified tags overrode correct aggregate tags, producing values that were 90-99% wrong (NCL regression, MSFT D&A regression)
2. **Unfixed critical bugs** — Stock split detection (TSCO 2400% shares error) and industry debt tags (BRK.B $129B missing) were identified in the original RCA but never actually fixed
3. **Methodology drift** — Total Debt formula changed to include operating leases without matching R1's convention, creating internal inconsistencies

The core lesson: **accuracy on fields that matter beats coverage breadth on fields that don't.** A 96.1% coverage number that includes silent regressions on scoring-critical fields is worse than 90% coverage with no regressions.

### Scope of This Plan
**Annual data, restated version only.** Quarterly extraction will be addressed in a separate phase after annual is validated. TTM depends on quarterly, so it's also deferred.

---

## Architecture: What Changes

### What We Keep
- The `extractSection()` / `buildStatements()` / `computeDerivedFields()` pattern — this is sound
- The provenance metadata system (Phases 2-3) — valuable for debugging
- The `fetchCompanyFacts` / `extractAnnualFact` EDGAR extraction functions — these work correctly
- The coverage audit script — but we'll add **value accuracy checks**, not just tag existence
- The industry classifier (`industryClassifier.js`) — SIC detection is fine
- The sign convention fix (`negate` flag on taxonomy fields) — this was a real improvement
- The LULU cash tag fix (`CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents`) — confirmed working

### What We Remove or Simplify
- **Layer 2 (taxonomy hierarchy resolver)** — this caused the NCL and D&A regressions by injecting descendant tags that overrode correct aggregates. Remove `taxonomyResolver.js` and `taxonomy-hierarchy.json`. If we need additional tags for a field, add them explicitly to Layer 1 after verifying they produce correct values for specific companies.
- **Layer 3 (AI tag classification)** — remove `companyAdapter.js` and `sp500-tag-classifications.json`. Same problem: AI-classified tags had no value verification. We'll add tags manually when gaps are found and verified.
- **Industry overlays for income statement** — the overlays added bank NII, insurance premiums, REIT FFO. These are useful display fields but they didn't fix the scoring-critical gaps (debt, operating income). Keep the infrastructure but simplify the overlays to focus on the fields that actually affect Rule One scores.

### What We Add
- **Value accuracy validation** — compare extracted values against known Morningstar/R1 values for the 12-ticker test set. A field that resolves to the wrong value is worse than a missing field.
- **Morningstar-aligned computed fields** — replicate the exact formulas R1 uses for Total Debt, Net Debt, Working Capital, Invested Capital, EBITDA, etc., using the formulas documented in the Morningstar comparison.
- **Yahoo-based split detection** — the one critical fix that was recommended but never implemented.
- **Cash flow D&A as canonical D&A** — Morningstar's "Depreciation, Reconciled" comes from cash flow, not income statement. This is the comprehensive number that includes D&A embedded in COGS.

---

## The Fields That Matter

Based on the Rule One Score engine and valuation calculators, these are the fields that directly affect investment decisions. Everything else is display.

### Tier 1 — Scoring-Critical (must be exact)

These feed growth rates, return metrics, debt ratios, and valuation calculators. A wrong value here produces a wrong Rule One Score or buy price.

**Income Statement:**
| Field | Primary XBRL Tag | Morningstar Match Status |
|-------|-----------------|--------------------------|
| Revenue | `Revenues` (+ ASC 606 variants) | 8/12 exact. BRK.B/JPM/XOM differ by industry revenue definition. |
| Operating Income | `OperatingIncomeLoss` | 10/12 exact. Banks/insurance don't report this tag. |
| Net Income | `NetIncomeLoss` | 12/12 exact for common stockholders version. |
| EPS (Diluted) | `EarningsPerShareDiluted` | 12/12 exact. |
| Shares (Diluted Avg) | `WeightedAverageNumberOfDilutedSharesOutstanding` | 12/12 exact. |
| Dividends Per Share | `CommonStockDividendsPerShareDeclared` | Coverage depends on whether company pays dividends. |
| Income Tax | `IncomeTaxExpenseBenefit` | 12/12 exact. |

**Balance Sheet:**
| Field | Primary XBRL Tag | Morningstar Match Status |
|-------|-----------------|--------------------------|
| Cash & Equivalents | `CashAndCashEquivalentsAtCarryingValue` + restricted cash variant | 11/12 exact after LULU fix. |
| Total Assets | `Assets` | 12/12 exact. |
| Total Liabilities | `Liabilities` (+ derivation fallback) | 11/12 exact. |
| Equity | `StockholdersEquity` | 12/12 exact. |
| Retained Earnings | `RetainedEarningsAccumulatedDeficit` | 12/12 exact. |
| Shares Outstanding | `CommonStockSharesOutstanding` | Needs split adjustment for TSCO/ODFL. |
| Long-Term Debt | `LongTermDebtNoncurrent` + `LongTermDebt` | 8/12 exact. BRK.B/JPM/O/XOM need industry tags. |
| Short-Term Debt | See Total Debt computation below | Computed field. |

**Cash Flow:**
| Field | Primary XBRL Tag | Morningstar Match Status |
|-------|-----------------|--------------------------|
| Operating Cash Flow | `NetCashProvidedByUsedInOperatingActivities` | 12/12 exact. |
| CapEx | `PaymentsToAcquirePropertyPlantAndEquipment` | 12/12 exact. |
| D&A (Cash Flow) | `DepreciationDepletionAndAmortization` | 10/12 exact. This is the canonical D&A. |
| Dividends Paid | `PaymentsOfDividendsCommonStock` + variants | Coverage depends on dividend status. |
| Share Repurchases | `PaymentsForRepurchaseOfCommonStock` | 12/12 exact. |

### R1-Computed Fields (we compute from Tier 1 inputs)

These are the ~20 fields R1 adds on top of Morningstar. We compute them ourselves using the exact formulas documented in the Morningstar comparison:

| R1 Field | Formula | Source |
|----------|---------|--------|
| **Free Cash Flow** | OCF - abs(CapEx) | Cash flow |
| **Total Debt** | (Current Debt & CL Obligation) + (LT Debt & CL Obligation) | Balance sheet — includes lease obligations |
| **Net Debt** | Total Debt - Cash & Equivalents | Balance sheet — excludes short-term investments from cash |
| **Working Capital** | Current Assets - Current Liabilities | Balance sheet |
| **Invested Capital** | Stockholder Equity + LT Debt & CL + ST Debt (varies) | Balance sheet |
| **Total Capitalization** | Stockholder Equity + LT Debt & CL | Balance sheet |
| **Net Tangible Assets** | Stockholder Equity - Net Intangibles | Balance sheet |
| **Capital Lease Obligations** | Current CL + Non-Current CL | Balance sheet — standalone summary |
| **EBITDA** | Operating Income + Depreciation Reconciled | Income + Cash flow |
| **Tax Rate** | Tax Provision / Pre-Tax Income × 100 | Income statement |
| **Operating Revenue** | = Revenue (redundant) | Income statement |
| **Operating Expenses** | SGA + R&D + D&A (below the line) | Income statement — NOT same as Morningstar's OperatingExpenses |
| **Total Expenses** | Revenue - Net Income (approximate) | Income statement |
| **Depreciation, Reconciled** | = Cash flow D&A | Cash flow → Income statement |

**Critical formula details from the Morningstar comparison:**

1. **Total Debt includes lease obligations.** `Total Debt = Short-Term Debt & Capital Lease Obligation + Long-Term Debt & Capital Lease Obligation`. For companies like LULU and SFM where all debt is leases, Total Debt = total lease obligations. This is Morningstar's convention and R1 follows it.

2. **Net Debt uses Cash & Equivalents only, NOT short-term investments.** AAPL example: Total Debt (98,657) - Cash (35,934) = Net Debt (62,723). NOT Total Debt - Cash+STI (54,697). When Net Debt is negative (cash > debt), R1 displays "-" instead of the negative number.

3. **Depreciation, Reconciled = Cash Flow D&A**, not Income Statement D&A. This is typically larger because it includes D&A embedded in COGS. MSFT example: Income statement D&A = $0 (no separate line), but Cash Flow D&A = $34,153M. AAPL: same pattern — no IS D&A line, CF D&A = $11,698M.

4. **EBITDA = Operating Income + Depreciation, Reconciled** (i.e., Operating Income + Cash Flow D&A). Not Operating Income + Income Statement D&A.

5. **Goodwill = Net (after impairment).** Morningstar shows gross goodwill + accumulated impairment separately. R1 shows the net figure. MSFT: gross $130,809M - impairment $11,300M = net $119,509M. Our XBRL tag `Goodwill` already returns the net figure for most companies, but verify.

6. **PP&E includes ROU assets.** Morningstar already bundles "Leased Property, Plant and Equipment" into Gross PP&E. R1 passes this through. Our current engine separates ROU assets — we should offer both views.

---

## Implementation Phases

### Phase 1 — Revert and Stabilize

**Goal:** Get back to a known-good baseline where pre-restructure correct values are restored, regressions are eliminated, and we have a clean foundation.

**Steps:**

1. **Remove Layer 2 and Layer 3 from `edgarFinancials.js`.** Delete the `augmentTaxonomy` import and calls, remove Layer 3 gap-fill block, remove `companyAdapter.js` import. Revert `extractSection` to use the raw taxonomy arrays directly (no `_layer2Start` tracking). Keep provenance tracking but set all layers to 1.

2. **Verify regression fixes.** After removal, confirm:
   - SFM Non-Current Liabilities > $1.5B (was regressed to $25M)
   - MSFT D&A > $10B for 2021+ (was regressed to $3.4B)
   - MU D&A > $2.5B for 2016-2017 (was regressed to $125M)
   - All other pre-restructure correct values are restored

3. **Keep the improvements that worked:**
   - LULU cash tag (`CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents`)
   - Sign convention negate flags on working capital change fields
   - SGA separate fields (`selling_expense`, `general_and_admin_expense`) + derivation
   - Provenance metadata infrastructure
   - Industry classifier

4. **Bump cache key** to invalidate all stale cached data.

**Verification:** Re-export all 12 tickers, compare against R1 Toolbox. Pre-restructure correct values should be restored. LULU cash and sign convention improvements should be retained.

### Phase 2 — Stock Split Detection (Yahoo)

**Goal:** Fix the TSCO (2400% error) and ODFL (237.5% error) share count and EPS problems.

**Steps:**

1. **Add Yahoo split extraction.** The `prices.js` engine already fetches the Yahoo `chart` endpoint which includes a `splits` field with exact dates and ratios. Surface this data and store in split cache.

2. **Make Yahoo the primary split source.** `fetchSplits()` should try Yahoo first, fall back to existing XBRL methods.

3. **Fix `cumulativeSplitFactor` date comparison.** Current code compares `splitYear > fiscalYear` using integers. A mid-year split (June 2023 for a Dec FY company) has splitYear=2023, fiscalYear=2023, so `2023 > 2023 = false`. Fix to compare the split date against the fiscal year end date.

**Tests:**
- TSCO `shares_outstanding` < 1B for all years
- ODFL `shares_outstanding` < 300M for 2016-2019
- TSCO EPS > $1 for all years (currently 25x too low)
- `cumulativeSplitFactor` correctly handles same-year splits

**Verification:** TSCO and ODFL share counts match R1 within 5%.

### Phase 3 — Industry Debt Tags

**Goal:** Fix BRK.B ($129B missing), O ($29B missing), JPM ($435B missing), XOM ($21B partial gap) Total Debt.

**Steps:**

1. **Add industry-specific debt tags to `BALANCE_TAXONOMY`.** These were identified in the original RCA and confirmed still missing:

   REIT (O): `SecuredDebt`, `UnsecuredDebt`, `SeniorNotesNoncurrent`, `MortgageLoansOnRealEstate`

   Bank (JPM): `FederalFundsPurchasedAndSecuritiesSoldUnderAgreementsToRepurchase`, `AdvancesFromFederalHomeLoanBanks`, `SubordinatedDebt`

   Insurance (BRK.B): `FundsHeldUnderReinsuranceAgreements`, `PolicyholderContractDeposits`

   Energy (XOM): `LongTermNotesPayable`

   Add these as fallback tags in the existing `long_term_debt` field. They should come AFTER the standard tags so they only fill gaps.

2. **Add debt sanity check in `computeDerivedFields`.** If `total_debt / liabilities < 0.05` for a company with `liabilities > $10B`, derive debt as `liabilities - (accounts_payable + accrued_liabilities + deferred_revenue + operating_lease_liabilities + deferred_tax_liabilities + pension_liabilities + other_current_liabilities + other_noncurrent_liabilities)`. This is a safety net, not a primary source.

3. **Verify against Morningstar's Total Debt formula.** R1's Total Debt = `Short-Term Debt & CL Obligation + Long-Term Debt & CL Obligation`. This includes lease obligations. Make sure our `computeDerivedFields` Total Debt formula matches exactly.

**Tests:**
- BRK.B `total_debt > $100B`
- JPM `total_debt > $400B`
- O `total_debt > $25B`
- XOM `total_debt > $35B`
- All within 20% of R1 values

**Verification:** Compare Total Debt and Net Debt against R1 for all 12 tickers.

### Phase 4 — Morningstar-Aligned Computed Fields

**Goal:** Make all R1-computed fields match R1's exact formulas.

**Steps:**

1. **Total Debt** = `(short_term_debt + current_portion_lt_debt + finance_lease_liability_current) + (long_term_debt + finance_lease_liability_noncurrent)`. This is `Current Debt & CL Obligation + LT Debt & CL Obligation`. Include operating lease obligations per R1 convention.

2. **Net Debt** = `total_debt - cash`. Use cash & equivalents ONLY, not cash + short-term investments. When negative, store the negative value (UI can display "-" if desired).

3. **Depreciation, Reconciled** = cash flow `depreciation_amortization` (the `DepreciationDepletionAndAmortization` tag from CASHFLOW_TAXONOMY). This is the comprehensive D&A number. Add as a new field `depreciation_reconciled` in the income statement section of `computeDerivedFields`, sourced from cash flow data.

4. **EBITDA** = `operating_income_loss + depreciation_reconciled`. Not IS D&A. This matches R1 exactly.

5. **Invested Capital** = `equity + long_term_debt_and_leases + short_term_debt_and_leases`. Match R1's formula which includes lease obligations. Verify against R1 values for LULU (where all "debt" is leases).

6. **Working Capital** = `current_assets - current_liabilities`. Already implemented, verify.

7. **Net Tangible Assets** = `equity - intangible_assets - goodwill`. Already implemented, verify.

8. **Goodwill** — verify the XBRL `Goodwill` tag returns net (after impairment) for MSFT ($119,509M not $130,809M) and TSCO ($346,724M not $407,497M). If it returns gross, subtract `GoodwillImpairmentLossNetOfTax` or use `GoodwillNet` variant.

**Tests:**
- AAPL Total Debt = ~$98,657M (matches R1)
- AAPL Net Debt = ~$62,723M (Total Debt - Cash only, not STI)
- MSFT EBITDA uses CF D&A ($34,153M), not IS D&A ($0)
- LULU Total Debt = ~$1,576M (all lease obligations)
- MSFT Goodwill = ~$119,509M (net after impairment)

**Verification:** All 12 tickers' computed fields match R1 within 5%.

### Phase 5 — SGA Derivation + Operating Income Derivation

**Goal:** Fix MSFT SGA (22% low) and the 85 companies missing `operating_income_loss`.

**Steps:**

1. **SGA derivation.** When combined `SellingGeneralAndAdministrativeExpense` tag is null but `selling_expense` and `general_and_admin_expense` are both present, derive `sga = selling_expense + general_and_admin_expense`. This was already partially implemented — verify it works for MSFT.

2. **Operating Income derivation.** When `OperatingIncomeLoss` is null, derive from: `revenues - cost_of_revenue - sga - research_and_development - depreciation_amortization_is - other_operating_expenses`. This handles banks, insurance, and other companies that don't report the aggregate tag.

3. **Liabilities derivation.** When `Liabilities` tag is null, derive from `liabilities_and_equity - equity - minority_interest`. Both component tags are at 100% coverage. This was already in `computeDerivedFields` — verify it fires correctly and produces accurate values.

**Tests:**
- MSFT SGA > $30B for recent years
- Operating income derivable for JPM, BRK.B, O (currently missing)
- Liabilities derivation produces correct values for the 134 companies missing the tag

### Phase 6 — Accuracy Validation (the real test)

**Goal:** Build a validation framework that tests *value accuracy*, not just tag existence.

**Steps:**

1. **Create a truth dataset.** For each of the 12 test tickers, record the R1 Toolbox value for every Tier 1 field for all available years. Store as a JSON fixture file.

2. **Build an accuracy validation script.** For each ticker, extract via the XBRL engine, compare every Tier 1 field against the truth dataset. Report:
   - Exact matches (within rounding tolerance of $1M)
   - Close matches (within 5%)
   - Material differences (>5%)
   - Missing fields
   - Wrong-sign fields

3. **Run after every change.** This replaces the coverage audit as the primary success metric. The coverage audit measured the wrong thing — this measures what actually matters.

4. **Define the pass criteria:**
   - Revenue, Net Income, Operating CF, CapEx, Total Assets, Equity, EPS: must match within 1% for all standard companies (8/12)
   - Total Debt, Net Debt, EBITDA: must match within 5% for all standard companies
   - Shares Outstanding: must match within 1% for all companies after split adjustment
   - Financial-sector companies (BRK.B, JPM, O): Total Debt within 20%, other fields within 5%

**Output:** A clear pass/fail report per company, per field, per year. No ambiguity.

---

## What This Plan Does NOT Do (Deferred)

1. **Quarterly extraction** — deferred to a separate plan after annual is validated
2. **TTM computation** — depends on quarterly, so also deferred
3. **Layer 2 taxonomy expansion** — removed due to regression risk. If specific fields need more tags, add them one at a time with value verification.
4. **Layer 3 AI classification** — removed for same reason. Manual tag additions are safer.
5. **Industry overlays for display fields** — bank NII, insurance premiums, REIT FFO. These are nice-to-have display fields, not scoring-critical. Can be re-added after the core engine is validated.
6. **PP&E + ROU bundled view** — Morningstar bundles ROU into PP&E, our engine separates them. Both are valid. A toggle can be added later.
7. **Revenue definition for financials** — BRK.B/JPM/XOM revenue differs because of what "revenue" means for non-standard industries. This is a philosophical question, not a bug. Defer.

---

## Success Criteria

The engine is production-ready when:

1. All 8 standard companies (AAPL, LULU, MSFT, MU, ODFL, SFM, TSCO, UNH) have every Tier 1 field matching R1 within 1%
2. TSCO and ODFL shares/EPS are split-adjusted correctly
3. All 4 financial-sector companies (BRK.B, JPM, O, XOM) have Total Debt > $0 and within 20% of R1
4. No regressions from pre-restructure correct values
5. All R1-computed fields (Total Debt, Net Debt, EBITDA, FCF, Working Capital, Invested Capital) match R1's formulas exactly
6. The accuracy validation script passes with zero "material difference" flags on standard companies

---

## Reference Files

- `financial-data-comparison-rca.md` — original 12-ticker RCA (2026-03-18)
- `post-restructure-rca.md` — post-restructure regression analysis (2026-03-19)
- `morningstar-vs-r1-income-statement.md` — raw Morningstar vs R1 Toolbox comparison (income)
- `morningstar-vs-r1-balance-sheet.md` — raw Morningstar vs R1 Toolbox comparison (balance sheet)
- `morningstar-vs-r1-cash-flow.md` — raw Morningstar vs R1 Toolbox comparison (cash flow)
