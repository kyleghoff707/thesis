# Phase 3: Engine Fixes - Research (v2)

**Researched:** 2026-03-26 (v2 — incorporates intel reports on Morningstar normalization methodology)
**Domain:** XBRL financial data normalization, Morningstar methodology alignment, triangulation pipeline fixes
**Confidence:** HIGH

## Summary

Phase 3 targets 98%+ accuracy on the 50-company Morningstar truth set. The fix-recommendations.json from Phase 2 lists 35 prioritized items (609 CONSENSUS_DIFF + 2,177 LIKELY_BUG = 2,786 actionable items). The previous research (v1) identified that ~80% of these are field naming mismatches between data collectors and the engine. This v2 research incorporates the intel reports on Morningstar's actual normalization methodology, which reshapes the fix taxonomy from 4 categories to **6 distinct root cause types** and provides authoritative Morningstar DataID definitions for every affected field.

**The critical insight from the intel reports:** Morningstar's normalization is a multi-layer pipeline with six industry templates (N/M/U/T/B/I), residual computation for "Other" fields (confirmed exact formula for OtherCurrentLiabilities), cross-statement reconciliation (D&A from CF statement is authoritative, not IS), and TWO distinct operating income figures (normalized DataID 20109 vs reported DataID 20428). These methodological details transform several items from "engine bugs" to "comparison methodology mismatches" that can be resolved by adjusting what we compare against, rather than changing engine extraction logic.

**Primary recommendation:** Execute fixes in 6 batches ordered by risk profile: (1) field alias map in triangulation pipeline, (2) Morningstar comparison harness alignment (intangibles gross-vs-NET, operating income normalized-vs-reported, accrued liabilities combined-only handling), (3) REIT revenue/COGS/interest + D&A broadening, (4) PP&E ROU asset alignment + debt tag coverage, (5) financial sector overlay tuning, (6) FY offset investigation + residual "Other" gate. Run both pipelines (triangulation + Morningstar comparison) after each batch.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ENGINE-01 | Named item XBRL tag coverage fixes for top failure categories | 6 root cause categories identified: 16 naming mismatches (Cat A), ~240-260 Morningstar harness methodology mismatches (Cat B — intangibles, operating income, accrued), 8 real tag coverage issues (Cat C), 9 derivation errors (Cat D), 50-60 D&A broadening fixes (Cat D), 2 FY offset items (Cat E), ~210-290 residual "Other" fixes (Cat F) |
| ENGINE-02 | Residual "Other" field computation with precondition gate | MS methodology confirmed via DataID 23151 — exact residual formula `OtherCL = TotalCL - named items` validated with 5/5 exact matches (AAPL, MSFT, GOOGL, META, AMAT). Gate at 95% named item coverage before enabling. Residuals for OtherCL, OtherIncomeExpense, OtherInvestingCF, OtherFinancingCF, OtherNonCashItems all documented |
| ENGINE-03 | Financial sector overlay validation | MS uses 6 industry templates: banks have NO operating income line (revenue = NII + NonII), REITs use Property Revenue model, insurance uses premiums. BRK-B (SIC 6311), JPM (SIC 6021), WFC (SIC 6022), MET (SIC 6311) need overlay tuning. AMT (SIC 6798 REIT) is the sample company in 13 of 35 recommendations |
| ENGINE-04 | Regression protection via baseline snapshot diffing | Two pipelines must both improve: compare-morningstar.mjs (91.2% baseline) and triangulate.mjs (fix-recommendations.json). Snapshot before/after each batch. Built-in regression diffing in triangulation-reporter.mjs |
</phase_requirements>

## Revised Fix Taxonomy (6 Categories — Informed by Intel Reports)

The previous research identified 4 categories. The intel reports reveal that several items previously classified as "engine bugs" are actually **comparison methodology mismatches** — places where our Morningstar comparison compares against the wrong Morningstar field variant. This creates a new Category B (Morningstar Harness Alignment) that is distinct from the field naming mismatches (Category A) and real tag issues (Category C).

### Category A: Field Naming Mismatches (16 items, ~2,255 affected years)

**Unchanged from v1.** The triangulation pipeline's data collectors normalize to canonical names (e.g., `stockholders_equity`, `total_assets`) that differ from engine internal names (e.g., `equity`, `assets`). The triangulator sees these as `tag_miss` because it compares by exact field name.

| Source Canonical | Engine Field | Statement | Impact |
|------------------|-------------|-----------|--------|
| `stockholders_equity` | `equity` | balance | 46co/218yr |
| `total_liabilities` | `liabilities` | balance | 46co/215yr |
| `total_assets` | `assets` | balance | 46co/214yr |
| `income_tax_expense` | `income_tax` | income | 44co/208yr |
| `cash_and_equivalents` | `cash` | balance | 42co/204yr |
| `pretax_income` | `income_before_tax` | income | 44co/200yr |
| `operating_cash_flow` | `net_cash_flow_from_operating_activities` | cashFlow | 42co/189yr |
| `total_current_assets` | `current_assets` | balance | 38co/185yr |
| `total_current_liabilities` | `current_liabilities` | balance | 39co/179yr |
| `inventories` | `inventory` | balance | 35co/156yr |
| `diluted_eps` | `diluted_earnings_per_share` | income | 14co/61yr |
| `investing_cash_flow` | `net_cash_flow_from_investing_activities` | cashFlow | 12co/60yr |
| `financing_cash_flow` | `net_cash_flow_from_financing_activities` | cashFlow | 12co/52yr |
| `basic_eps` | `basic_earnings_per_share` | income | (not in top 35) |
| `basic_shares_outstanding` | `basic_average_shares` | income | (not in top 35) |
| `diluted_shares_outstanding` | `diluted_average_shares` | income | (not in top 35) |

**Fix strategy:** Add a field alias map to `triangulate.mjs`. Do NOT rename engine fields (used by 50+ UI components).

### Category B: Morningstar Comparison Harness Alignment (NEW — from intel reports)

**These are NOT engine bugs.** The Morningstar comparison pipeline (Phase 1's `compare-morningstar.mjs`) compares our engine output against the wrong Morningstar field variant. The intel reports provide authoritative Morningstar DataID definitions that reveal the mismatch.

#### B1: Intangible Assets — Gross vs NET (~149 failures / 35 companies)

**Source:** ms-xbrl-normalization-research.md Section 5.1

MS DataID 23155 ("OtherIntangibleAssets") shows the **GROSS carrying amount** in MS's standardized statements, with accumulated amortization (DataID 23157) as a separate contra-asset line. Our engine correctly extracts NET (`IntangibleAssetsNetExcludingGoodwill`). The comparison fails because it compares our NET against MS's GROSS.

Evidence: AMAT FY2021 — MS shows $2,041M (GROSS), our engine shows $104M (NET), implied NET = $2,041M - $1,937M = $104M (exact match).

**Fix:** In `compare-morningstar.mjs` or its field-mapping configuration, compute MS implied NET = "Intangibles other than Goodwill" + "Accumulated Amortization of Intangibles other than Goodwill" and compare against our `intangible_assets`. This preserves our engine's correctness (NET is the economically meaningful number).

#### B2: Operating Income — Normalized vs Reported (~49 failures / 22 companies)

**Source:** ms-xbrl-normalization-research.md Section 5.3

MS DataID 20109 ("Total Operating Profit/Loss") is a **normalized** figure that excludes restructuring, impairments, litigation settlements. MS DataID 20428 ("Reported Total Operating Profit/Loss") matches raw XBRL `OperatingIncomeLoss`. Our engine extracts the as-reported value. Our test compares against DataID 20109 (normalized).

Evidence: T FY2022 — MS normalized $27,498M, MS reported $0M (massive goodwill impairment). CRM FY2022 — MS normalized $1,858M, MS reported $1,030M (restructuring).

**Fix:** Change the Morningstar field mapping to compare against "Reported Total Operating Profit/Loss" instead of "Total Operating Profit/Loss". MS fixture data already includes both fields in the supplemental section.

#### B3: Accrued Liabilities — Combined-Only Companies (~40-60 failures / 8+ companies)

**Source:** ms-xbrl-normalization-research.md Section 5.2

MS DataID 23004 (separate accrued) vs DataID 23166 (combined AP+Accrued). When a company only reports `AccountsPayableAndAccruedLiabilitiesCurrent`, MS shows the combined value under "Payables and Accrued Expenses" and does NOT produce a separate accrued line. 8 of 50 truth set companies (CRM, JPM, LEN, MET, MSFT, UNH, WFC, XOM) only have the combined tag.

**Fix:** In the Morningstar comparison, accept null/missing for `accrued_liabilities` when the MS fixture has no "Accrued Expenses, Current" field. Optionally, engine can derive `accrued_liabilities = combined - AP` when both exist.

**Estimated impact of Category B fixes:** ~240-260 failures eliminated from the Morningstar comparison pipeline. Accuracy: ~91.2% -> ~93-94%.

### Category C: Real Tag/Coverage Issues (8 items, ~300 affected years)

These are genuine extraction problems where the engine gets a wrong value or null when sources agree.

| P# | Field | Root Cause Detail | Companies | Notes |
|----|-------|-------------------|-----------|-------|
| P13 | `cost_of_revenue` | REIT (AMT) uses different COGS tags. MS DataID 20013: "derived if missing: Revenue - OpEx - OpProfit" | 16co/57yr | REIT overlay needs COGS tag variants |
| P14 | `gross_profit` | Follows from P13 — derived from revenue - COGS | 15co/55yr | Will auto-fix when P13/P23 are fixed |
| P15 | `short_term_debt` | Engine $6B vs consensus $15.6B (AAPL 2021). MS DataID 23100. Engine uses first-tag-wins but may need component summation (CommercialPaper + DebtCurrent + CurrentPortionLTD) | 19co/54yr | Investigate AAPL ST debt tag composition |
| P17 | `accounts_payable` | AMT $258.7M vs consensus $251.3M. Small difference. MS DataID 23003 | 15co/52yr | Possible accrued/combined tag interference |
| P18 | `sga` | AMT $972M vs consensus $902M. REIT companies may classify expenses differently. MS DataID 20024 | 15co/50yr | REIT overlay may need SGA adjustment |
| P25 | `short_term_investments` | CPRT $1.4B from FMP/SimFin, null from engine. MS DataID 23006 | 7co/25yr | May need additional tags: `MarketableSecuritiesCurrent`, `AvailableForSaleSecuritiesCurrent` — already in taxonomy; investigate why resolution fails |
| P27 | `interest_expense` | AMT $1.4B, null from engine. MS DataID 20064. REIT overlay may not be adding interest expense tags | 9co/21yr | Check if AMT uses `InterestExpense` vs REIT-specific interest tags |
| P34 | `depreciation_amortization_is` | AMT $2.3B from sources, null from engine. IS-level D&A tag missing for REITs | 3co/4yr | REIT overlay may need IS D&A tags |

**Fix strategy:** Investigate each field's XBRL tags for affected companies (especially AMT as the REIT archetype). Check company facts JSON to identify which tags AMT files. Add missing tags to base taxonomy or REIT overlay.

### Category D: Derivation Errors (9 items, ~201 affected years)

The engine extracts raw values correctly but derives composite fields incorrectly.

| P# | Field | Companies | Root Cause Detail | Intel Report Insight |
|----|-------|-----------|-------------------|---------------------|
| P19 | `operating_income_loss` | 16co/47yr | AMT $4.85B vs $4.90B. Derivation path produces slightly different result | MS DataID 20109 is normalized; DataID 20428 is reported. If comparison uses reported, this gap may shrink. SimFin $8.1B is an outlier |
| P22 | `property_plant_equipment` | 11co/39yr | Engine adds ROU assets (line 968-969). AAPL $52.5B vs SimFin/mstarpy $42.1B | **MS includes ROU in "Net PPE"** per consolidated_vs_expanded intel report (BS shows "Leased Property" under Gross PPE). FMP ($52.5B) agrees with us. But SimFin and mstarpy exclude ROU. **Consensus is split.** |
| P23 | `revenues` | 13co/35yr | AMT $717M vs $9.4B consensus. Engine picks sub-revenue tag | MS REIT template: "Property Revenue + Service Revenue = Revenue". Engine likely picks a narrow tag |
| P24 | `net_change_in_cash` | 11co/28yr | FX effect inclusion differs. MS DataID 26172 | Some sources include FX translation effects, some don't |
| P26 | `net_income_loss` | 8co/22yr | AMT $1.70B vs $1.77B. NCI treatment | MS DataID 20162 = net income to parent (after NCI). Our tag list has `NetIncomeLoss` first, `ProfitLoss` second. For companies with NCI, may need to verify tag order |
| P30 | `goodwill` | 9co/11yr | AMT $12.6B vs $12.1B. Restated vs original value | MS restated vs original intel report: restated values may differ from original filings |
| P31 | `research_and_development` | 4co/9yr | COST $5K. Trivial amounts | Likely rounding/negligible. Not worth fixing |
| P32 | `intangible_assets` | 5co/9yr | COST $225K. Trivial amounts | Same as P31 |
| P35 | `stock_based_compensation` | 1co/1yr | POOL $14.9M vs $420K. Wrong tag extraction | Single outlier — investigate POOL's XBRL |

**Key PP&E insight from intel reports:** The consolidated_vs_expanded report shows MS includes "Leased Property, Plant and Equipment" (ROU assets) under Gross PP&E. The edgar-taxonomy-research-report confirms MS's BS structure nests "Leased Property" under Gross PP&E components. This means **our engine's approach of adding ROU to PP&E is actually correct for Morningstar matching**. The disagreement comes from SimFin/mstarpy excluding ROU. For the Morningstar comparison pipeline, our PP&E is correct. For the triangulation pipeline, FMP agrees with us (includes ROU) while SimFin/mstarpy don't. This is a METHODOLOGY_DIFF, not our bug.

**Fix strategy:**
- P23 (REIT revenue): Critical. Investigate AMT's XBRL facts for revenue tags. Add REIT-specific revenue tags to overlay.
- P22 (PP&E): Re-classify as METHODOLOGY_DIFF in triangulation. Our engine matches Morningstar. No engine change needed.
- P19 (operating income): May partially resolve when B2 (comparison target switch) is applied. Remaining gap is derivation path — investigate.
- P24 (net change in cash): FX effects are a known methodology difference. Low priority.
- P26, P30, P35: Investigate individually but low total impact.

### Category E: Fiscal Year Offset (2 items, 30 affected years)

| P# | Field | Companies | Notes |
|----|-------|-----------|-------|
| P28 | `retained_earnings` | 6co/19yr | DINO sample. FY offset mismatch |
| P29 | `accounts_receivable` | 6co/11yr | AMT sample. Values present but offset by 1 year |

**Intel report insight:** The morningstar_original_vs_restated report notes that EDGAR filings may contain restated historical numbers. Non-December FY companies (AMT FY ends Dec 31, DINO FY ends Dec 31 — but subsidiaries may differ) may have alignment issues between the collectors' FY label logic and our engine's `entityFiscalYearEnd`-based resolver.

**Fix strategy:** Investigate the 6 affected companies' `entityFiscalYearEnd` values. These likely need FY alignment corrections in the triangulation pipeline, not engine changes.

### Category F: Residual "Other" Fields (~210-290 potential fixes)

**Source:** ms-xbrl-normalization-research.md Section 5.5

MS uses **residual computation** for "Other" fields. Confirmed exact formula from DataID 23151:

```
OtherCurrentLiabilities = TotalCL - PayablesAndAccrued - CurrentDebt - Provisions - DeferredLiabilities
```

Validated with 5/5 exact matches (AAPL, MSFT, GOOGL, META, AMAT).

Additional residual formulas (from QuantConnect/LEAN reverse engineering):

| Other Field | Formula |
|-------------|---------|
| Other Current Assets | Total CA - Cash - ST Investments - Receivables - Inventory - Prepaid |
| Other Non-Current Assets | Total NCA - PP&E - Goodwill - Intangibles - LT Investments - DTA - ROU |
| Other Non-Current Liabilities | Total NCL - LT Debt - LT Lease - DTL - Pension |
| Other Investing CF | Total Investing CF - CapEx - Acquisitions - Inv Purchases + Inv Sales + Asset Sales |
| Other Financing CF | Total Financing CF - Debt Issuance + Debt Repayment - Dividends - Buybacks + Stock Issuance |
| Other Non-Cash Items | Total Non-Cash Adj - D&A - SBC - Deferred Tax - Impairment |
| Other Income/Expense | Pretax Income - Operating Income - Interest Income + Interest Expense |

**Error amplification problem (B7 failure mode):** When named items don't match MS, residual computation amplifies errors. The engine previously attempted residual "Other" computation and reverted it (documented at line 1101-1103 of edgarFinancials.js).

**Fix strategy — Sequential:**
1. Fix Categories A-E first so named items are accurate
2. Implement confirmed residual formulas starting with OtherCurrentLiabilities (exact formula) and OtherIncomeExpense (simplest)
3. Per-company-year precondition gate: only compute when named item coverage >= 95%
4. Compare residual against direct XBRL tag (if exists) as sanity check

## Architecture Patterns

### Morningstar's Normalization Architecture (from intel reports)

Understanding MS's pipeline clarifies what "correct" means for each field:

```
Layer 1: Tag Resolution  — Static alias tables (~200 maps), confidence scoring
Layer 2: Industry Routing — 6 templates (N/M/U/T/B/I), ~769 industry overrides
Layer 3: Derivation       — Parent-from-children, residual computation, cross-statement
Layer 4: Reconciliation   — CF D&A is authoritative, ReconciledCOGS = COGS + IS D&A - CF D&A
Layer 5: Validation       — Arithmetic consistency, historical continuity
```

Our engine implements Layers 1-3 but not Layer 4 (cross-statement reconciliation). MS's "Reconciled" fields (DataIDs 20314, 20315) are unique to Morningstar — no other source produces them. Our comparison should target the as-reported field variants where possible.

### Morningstar's Industry Template Impact on Comparison

| Industry Template | Revenue Definition | COGS Equivalent | Operating Income | Key DataIDs |
|-------------------|-------------------|-----------------|------------------|-------------|
| **N** (Normal) | Total Revenue (20001) | Cost of Revenue (20013) | Operating Profit (20109 norm / 20428 reported) | Standard flow |
| **B** (Bank) | NII + Non-Interest Income (synthesized) | Provision for Credit Losses | **No OpInc line** — goes directly to Pretax | 20045 (NII) |
| **I** (Insurance) | Premiums + Investment Income + Gains | Benefits & Claims | Operating Income exists | 20026-20029 |
| **T/U/M** (Transport/Utility/Mining) | Standard with industry-specific line items | Standard | Standard | Minor variations |

**Implication for ENGINE-03:** Banks (JPM, WFC) will NEVER match on operating income, COGS, or gross profit — MS doesn't produce those fields for Template B. The comparison must accept null for these fields when `IndustryTemplateCode = B`. Insurance (MET) has operating income but revenue/COGS are different. REITs aren't a separate MS template (they use N) but AMT's revenue structure is REIT-specific.

### Recommended Fix Batching (v2 — Revised with Intel Report Findings)

| Batch | What | Files Modified | Risk | Expected Impact |
|-------|------|---------------|------|-----------------|
| **Batch 1** | Field alias map in triangulate.mjs | 1 file (triangulate.mjs or new field-alias-map.mjs) | VERY LOW | Resolves Cat A (16 items, ~80% of triangulation "bugs"). Re-run triangulation to measure new baseline |
| **Batch 2** | Morningstar harness alignment — intangibles (B1), operating income (B2), accrued liabilities (B3) | compare-morningstar.mjs + field-mapping.json | LOW | Resolves Cat B (~240-260 MS failures). Morningstar accuracy ~91.2% -> ~93-94% |
| **Batch 3** | REIT revenue tag fix (P23) + REIT COGS/interest (P13, P27, P34) + D&A broadening verification | edgarFinancials.js + industryOverlays.js | MEDIUM | Fixes AMT revenue ($717M -> $9.4B) and related REIT issues |
| **Batch 4** | PP&E ROU reclassification in triangulation + debt tag coverage (P15, P20) | triangulate.mjs + edgarFinancials.js | MEDIUM | PP&E reclassified as METHODOLOGY_DIFF. Debt tag summation improved |
| **Batch 5** | Financial sector overlay tuning — bank template handling, insurance template | industryOverlays.js + industryClassifier.js + comparison harness | MEDIUM | Resolves ENGINE-03 for BRK-B, JPM, WFC, MET |
| **Batch 6** | FY offset investigation + residual "Other" precondition gate | edgarFinancials.js + triangulate.mjs | HIGH | Resolves Cat E + Cat F. Enables residual computation only for company-years with 95%+ named item coverage |

### Verification Loop

After each batch:

```bash
# 1. Store pre-fix baselines
cp validation/reports/fix-recommendations.json validation/reports/fix-recommendations-pre-batch-N.json
cp validation/reports/morningstar-accuracy.json validation/reports/morningstar-accuracy-pre-batch-N.json

# 2. Rebuild engine bundle
node validation/scripts/bundle.mjs

# 3. Re-run triangulation (50 companies)
node validation/scripts/triangulate.mjs

# 4. Re-run Morningstar comparison (50 companies)
node validation/scripts/compare-morningstar.mjs

# 5. Compare before/after
# Both pipelines must improve (or stay flat) — never regress
```

**Critical invariant:** After each batch, run BOTH pipelines. The triangulation measures against FMP/SimFin/mstarpy. The Morningstar comparison measures against the original 50-company truth set. Changes to the Morningstar comparison harness (Batch 2) will improve MS accuracy but won't affect triangulation. Changes to the engine (Batch 3-6) will affect both.

### Recommended Project Structure for Fixes

```
src/engines/
├── edgarFinancials.js          # Tag additions (P13, P15, P20, P23, P27), derivation fixes, residual gate
├── industryOverlays.js         # REIT overlay: revenue tags, COGS tags, interest tags, IS D&A tags
├── industryClassifier.js       # SIC code mapping (no changes expected — AMT=6798 already classified as REIT)
validation/scripts/
├── triangulate.mjs             # Field alias map addition (Cat A), PP&E METHODOLOGY_DIFF reclassification
├── compare-morningstar.mjs     # Intangibles implied-NET comparison, operating income reported target, accrued null-acceptance
├── lib/
│   ├── field-alias-map.mjs     # NEW: maps source canonical -> engine field names
│   └── ...existing files...
src/engines/__tests__/fixtures/morningstar/
├── field-mapping.json          # Operating income comparison target change (B2)
```

### Anti-Patterns to Avoid

- **Renaming engine field names:** The engine's field names (`assets`, `liabilities`, `equity`, etc.) are used throughout 50+ UI components, hooks, and scoring engines. Renaming them would be a massive, regression-prone change. Use an alias map instead.
- **Fixing all 35 items in one batch:** Each batch must be verified independently. If a batch causes regressions, you need to know exactly which change caused it.
- **Adding ROU assets to PP&E AND changing the comparison baseline:** Our engine already adds ROU to PP&E (matching Morningstar). Don't remove it. Instead, reclassify the PP&E discrepancy as METHODOLOGY_DIFF in the triangulation pipeline (SimFin/mstarpy exclude ROU, FMP and MS include it).
- **Enabling residual "Other" computation before named items are accurate:** The B7 failure mode is documented at edgarFinancials.js line 1101-1103. The precondition gate must check named item coverage per company-year, not globally.
- **Comparing against MS's normalized operating income:** MS DataID 20109 is normalized (excludes restructuring/impairment). Our engine extracts DataID 20428 equivalent (as-reported). The fix is in the comparison target, not the engine.
- **Treating bank operating income as a bug:** MS Template B (banks) has NO operating income line. JPM, WFC's missing operating income is correct by design.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Field name mapping between systems | Custom translation logic scattered across files | Single alias map object in `field-alias-map.mjs` | A single source of truth prevents drift |
| Regression detection | Manual before/after comparison | Built-in regression diff in `triangulation-reporter.mjs` | Already implemented in Phase 2 |
| Engine bundle for validation | Manual Vite build | `node validation/scripts/bundle.mjs` | Auto-builds the engine as a Node.js-compatible ESM bundle |
| Intangibles NET derivation | Manual extraction of MS gross/amort fields | Compute implied NET from existing MS fixture fields | MS fixtures already have both "Intangibles other than Goodwill" and "Accumulated Amortization" |
| Bank/insurance null handling | Per-field exceptions | Industry template detection based on SIC code + systematic null-acceptance for industry-absent fields | The industry classifier already exists (`classifyIndustryType`) |

## Common Pitfalls

### Pitfall 1: Confusing Tag Miss with Naming Mismatch
**What goes wrong:** Treating all `tag_miss` items as XBRL taxonomy gaps and adding unnecessary tags to the engine, when the data IS being extracted under a different field name.
**Why it happens:** The triangulation pipeline compares by exact canonical field name. If source says `total_assets` and engine says `assets`, it's classified as `tag_miss` even though the engine correctly extracts the value.
**How to avoid:** Cross-reference the engine taxonomy against the canonical name before concluding a field is missing. The 16 naming mismatches identified in Category A account for ~80% of the triangulation "bugs."
**Warning signs:** `thesisValue: null` for a field that obviously exists in the engine (e.g., `total_assets` -- of course the engine extracts total assets).

### Pitfall 2: Comparing Against Wrong Morningstar Field Variant
**What goes wrong:** Morningstar has multiple versions of the same concept (normalized vs reported operating income, gross vs NET intangibles). Comparing against the wrong variant creates false failures.
**Why it happens:** MS's standardized statements show normalized/adjusted values by default. The supplemental section has the reported values.
**How to avoid:** Use Morningstar DataID definitions to determine which variant matches our extraction methodology. For operating income, compare against DataID 20428 (reported), not 20109 (normalized). For intangibles, compute implied NET from gross + accumulated amortization.
**Warning signs:** Consistent pattern of differences that correlate with one-time charges (operating income) or amortization balances (intangibles).

### Pitfall 3: REIT Revenue Extraction
**What goes wrong:** REITs like AMT report revenue differently than standard companies. The engine picks up a sub-revenue tag instead of total revenue.
**Why it happens:** MS REIT template uses "Property Revenue + Service Revenue = Revenue" but the XBRL `Revenues` tag may not be filed. AMT may use `RevenueFromContractWithCustomerExcludingAssessedTax` only for a subset.
**How to avoid:** Check which XBRL revenue tag AMT actually files. The REIT overlay may need additional revenue tag variants.
**Warning signs:** Revenue off by 90%+ (AMT: $717M engine vs $9.4B consensus).

### Pitfall 4: PP&E + ROU — Solving a Non-Problem
**What goes wrong:** Removing ROU from PP&E because SimFin/mstarpy exclude it, which then breaks the Morningstar comparison where MS INCLUDES ROU in Net PPE.
**Why it happens:** The triangulation shows PP&E disagreement, and the reflex is to change the engine.
**How to avoid:** Check ALL sources. FMP ($52.5B for AAPL) includes ROU like we do. MS includes ROU. The disagreement is SimFin/mstarpy methodology. Reclassify as METHODOLOGY_DIFF in triangulation.
**Warning signs:** PP&E consistently higher than SimFin/mstarpy by exactly the ROU asset amount, but matches FMP and MS.

### Pitfall 5: Residual "Other" Amplification (B7 Failure Mode)
**What goes wrong:** Computing "Other Current Liabilities" as `current_liabilities - accounts_payable - short_term_debt - ...` amplifies errors in any named item.
**Why it happens:** Residual computation is subtraction -- any error in the positive terms becomes an equal-magnitude error in the residual.
**How to avoid:** ENGINE-02 specifies a 95% precondition gate. Only compute residuals when named item coverage for that company-year reaches 95%. Gate must be per-company-year, not global.
**Warning signs:** Enabling "Other" computation causes accuracy DECREASE.

### Pitfall 6: Bank Operating Income Expectation
**What goes wrong:** Treating null operating income for JPM/WFC as a bug when MS Template B (banks) genuinely has no operating income line.
**Why it happens:** The fix-recommendations list includes bank companies. The reflex is to "fix" null operating income.
**How to avoid:** Check MS's industry template. Banks go Revenue -> NII -> Provision -> Revenue After Provision -> NoninterestExpense -> PretaxIncome. No operating income step. Accept null for operating income, COGS, and gross profit for banks.
**Warning signs:** Operating income derivation for banks produces a number that doesn't match any source, because no source has it.

## Code Examples

### Field Alias Map (Batch 1 Fix)

```javascript
// validation/scripts/lib/field-alias-map.mjs
// Maps source canonical field names -> engine internal field names.
// Used by the triangulation pipeline to bridge the naming gap.

export const FIELD_ALIASES = {
  // Balance sheet
  stockholders_equity: 'equity',
  total_liabilities: 'liabilities',
  total_assets: 'assets',
  total_current_assets: 'current_assets',
  total_current_liabilities: 'current_liabilities',
  cash_and_equivalents: 'cash',
  inventories: 'inventory',

  // Income statement
  income_tax_expense: 'income_tax',
  pretax_income: 'income_before_tax',
  diluted_eps: 'diluted_earnings_per_share',
  basic_eps: 'basic_earnings_per_share',
  diluted_shares_outstanding: 'diluted_average_shares',
  basic_shares_outstanding: 'basic_average_shares',

  // Cash flow
  operating_cash_flow: 'net_cash_flow_from_operating_activities',
  investing_cash_flow: 'net_cash_flow_from_investing_activities',
  financing_cash_flow: 'net_cash_flow_from_financing_activities',

  // Financial sector
  provision_for_loan_losses: 'provision_for_credit_losses',
};

export function resolveFieldName(canonical) {
  return FIELD_ALIASES[canonical] || canonical;
}
```

### Morningstar Intangibles Implied NET (Batch 2 Fix)

```javascript
// In compare-morningstar.mjs, when comparing intangible_assets:
// Instead of comparing against MS "Intangibles other than Goodwill" directly,
// compute implied NET from MS fixture data.

function getMSImpliedNetIntangibles(msFixture, year) {
  const gross = msFixture?.['Intangibles other than Goodwill']?.[year];
  const accumAmort = msFixture?.['Accumulated Amortization of Intangibles other than Goodwill']?.[year];
  if (gross == null) return null;
  // accumAmort is negative (contra-asset), so adding gives NET
  return gross + (accumAmort ?? 0);
}
```

### Operating Income Comparison Target Switch (Batch 2 Fix)

```javascript
// In field-mapping.json, change the operating income mapping:
// BEFORE: "Total Operating Profit/Loss" (MS DataID 20109, normalized)
// AFTER:  "Reported Total Operating Profit/Loss" (MS DataID 20428, as-reported)
//
// The MS fixture data includes both fields in the supplemental section.
// Our engine extracts OperatingIncomeLoss from XBRL, which matches reported.
```

### REIT Revenue Tag Investigation (Batch 3)

```bash
# Check AMT's XBRL revenue tags
node validation/scripts/triangulate.mjs --ticker AMT

# Then examine AMT's CompanyFacts for revenue tags:
# Look for: RevenueFromContractWithCustomerExcludingAssessedTax,
#           Revenues, RealEstateRevenueNet, PropertyRevenueFromRealEstateOperations
```

### Residual "Other" with Precondition Gate (Batch 6)

```javascript
// In computeDerivedFields, add OtherCurrentLiabilities with gate:
// Only compute when named item coverage >= 95% for this company-year.
//
// MS confirmed formula (DataID 23151):
// OtherCL = TotalCL - PayablesAndAccrued - CurrentDebt - Provisions - DeferredLiabilities
//
// Precondition: count non-null named items / total expected named items >= 0.95

const clNamedItems = [
  bal.accounts_payable, bal.accrued_liabilities, bal.short_term_debt,
  bal.current_portion_lt_debt, bal.operating_lease_liability_current,
  bal.finance_lease_liability_current, bal.deferred_revenue_current, bal.taxes_payable,
];
const clCoverage = clNamedItems.filter(v => v != null).length / clNamedItems.length;

if (bal.other_current_liabilities == null && bal.current_liabilities != null && clCoverage >= 0.95) {
  const namedSum = clNamedItems.reduce((sum, v) => sum + (v ?? 0), 0);
  const residual = bal.current_liabilities - namedSum;
  if (residual >= 0) { // Negative residual means overcounting — don't use
    bal.other_current_liabilities = residual;
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single-source comparison (Morningstar only) | Multi-source triangulation (FMP + SimFin + mstarpy + MS) | Phase 2 (2026-03-25) | Can distinguish our bugs from methodology differences |
| Compare against default MS field variant | Compare against DataID-verified MS field variant (reported OpInc, implied NET intangibles) | Phase 3 research (2026-03-26) | Eliminates ~240-260 false MS failures |
| Treat all `tag_miss` as missing XBRL tags | Distinguish naming mismatches from real tag gaps | Phase 3 research (2026-03-26) | 16 items reclassified from engine bugs to pipeline naming issues |
| PP&E disagreement = our bug | PP&E with ROU = correct for MS, METHODOLOGY_DIFF for SimFin/mstarpy | Phase 3 research (2026-03-26) | PP&E reclassified; no engine change needed |
| Bank/insurance comparison uses standard fields | Industry-aware comparison skips fields absent from MS template | Phase 3 research (2026-03-26) | Eliminates false failures for financial companies |

## Open Questions

1. **AMT (REIT) Revenue: Which XBRL tag does AMT file for total revenue?**
   - What we know: Engine gets $717M, consensus gets $9.4B. Gap suggests a sub-revenue tag.
   - What's unclear: Whether AMT files a total `Revenues` tag at all, or only segment-level tags like `RealEstateRevenueNet`.
   - Recommendation: Inspect AMT's CompanyFacts JSON. If only segment-level revenue exists, add it to the REIT overlay with appropriate summation logic.

2. **Short-term debt undercounting (P15): What components does AAPL report?**
   - What we know: AAPL 2021 -- engine $6B, consensus $15.6B. Engine has tags for `ShortTermBorrowings`, `DebtCurrent`, `CommercialPaper`. First-tag-wins picks one.
   - What's unclear: Whether AAPL reports multiple ST debt components that should be summed (like the investment purchase/sale logic already does).
   - Recommendation: Investigate AAPL's XBRL filing. May need component summation similar to `sale_of_investments` logic.

3. **D&A broadening: Is the "largest value wins" heuristic still correct after intel report analysis?**
   - What we know: The engine already implements broadest-D&A logic (lines 1112-1134 of edgarFinancials.js). The intel report confirms MS uses CF D&A as authoritative.
   - What's unclear: Whether the current implementation covers all edge cases (MSFT depreciation-only, INTU component sum).
   - Recommendation: Verify by running triangulation for MSFT and INTU after Batch 1. If D&A still mismatches, investigate specific tag resolution.

4. **How many financial-sector issues will surface after Batch 1?**
   - What we know: Only 1 recommendation explicitly mentions a financial company (MET, P33 capital_expenditures). Naming mismatch masks financial company issues.
   - What's unclear: After the alias fix, how many financial-sector-specific issues will appear.
   - Recommendation: After Batch 1, re-run `--ticker BRK-B,JPM,WFC,MET` and analyze.

5. **What accuracy level will Batches 1+2 combined achieve?**
   - What we know: Cat A resolves ~2,255 triangulation items. Cat B resolves ~240-260 MS comparison items.
   - What's unclear: The exact accuracy number on the MS truth set after both quick-win batches.
   - Recommendation: Execute Batches 1+2 first as "quick wins," then plan remaining batches against the updated landscape.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.0 |
| Config file | none -- uses vite.config.js defaults |
| Quick run command | `npm test -- --run --reporter=verbose src/engines/__tests__/` |
| Full suite command | `npm test -- --run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ENGINE-01 | Field alias map resolves all 16 naming mismatches | unit | `npm test -- --run src/engines/__tests__/harness/field-alias-map.test.js` | Wave 0 |
| ENGINE-01 | Triangulation with aliases reduces CONSENSUS_DIFF+LIKELY_BUG count | integration | `node validation/scripts/triangulate.mjs --ticker AAPL` | Wave 0 |
| ENGINE-01 | MS intangibles compared against implied NET | unit | `npm test -- --run src/engines/__tests__/harness/morningstar-harness.test.js` | Wave 0 |
| ENGINE-01 | MS operating income compared against reported (DataID 20428) | unit | `npm test -- --run src/engines/__tests__/harness/morningstar-harness.test.js` | Wave 0 |
| ENGINE-02 | Residual "Other" only computed when named item coverage >= 95% | unit | `npm test -- --run src/engines/__tests__/edgarFinancials.test.js` | Extend existing |
| ENGINE-02 | OtherCurrentLiabilities formula matches MS for 5 reference companies | unit | `npm test -- --run src/engines/__tests__/edgarFinancials.test.js` | Wave 0 |
| ENGINE-03 | Financial sector accuracy improves after overlay fixes | integration | `node validation/scripts/triangulate.mjs --ticker BRK-B,JPM,WFC,MET` | Wave 0 |
| ENGINE-03 | Bank companies accept null for operating income, COGS, gross profit | unit | `npm test -- --run src/engines/__tests__/harness/morningstar-harness.test.js` | Wave 0 |
| ENGINE-04 | No regression in Morningstar accuracy after each batch | integration | `node validation/scripts/compare-morningstar.mjs` | Exists |
| ENGINE-04 | No regression in triangulation bug count after each batch | integration | `node validation/scripts/triangulate.mjs` | Exists |

### Sampling Rate
- **Per task commit:** `node validation/scripts/triangulate.mjs --ticker AAPL` (single-company smoke test, ~10s)
- **Per wave merge:** Full triangulation (`node validation/scripts/triangulate.mjs`) + Morningstar comparison (`node validation/scripts/compare-morningstar.mjs`)
- **Phase gate:** 98%+ on Morningstar truth set confirmed by full pipeline run

### Wave 0 Gaps
- [ ] `src/engines/__tests__/harness/field-alias-map.test.js` -- covers ENGINE-01 alias resolution
- [ ] `src/engines/__tests__/harness/morningstar-harness.test.js` -- covers ENGINE-01 MS harness alignment (intangibles, operating income, accrued, bank null handling)
- [ ] Integration test wrapper for single-ticker triangulation with assertions on classification counts
- [ ] Existing `edgarFinancials.test.js` needs extension for residual gate behavior (ENGINE-02)
- [ ] Existing `edgarFinancials.test.js` needs OtherCL formula validation against 5 reference companies

## Sources

### Primary (HIGH confidence)
- `knowledge-ref/intel-reports/ms-xbrl-normalization-research.md` — Morningstar normalization methodology, DataID definitions, 5 field-by-field root cause analyses, confirmed residual formulas. Based on DataDefinitions-EquityandExecutive_201408.pdf (114pp), QuantConnect/LEAN reverse engineering, EDGAR XBRL verification.
- `knowledge-ref/intel-reports/morningstar-complete-data-definitions.md` — Complete DataID reference for all mapped fields (IS 20xxx, BS 23xxx, CF 26xxx, EPS 29xxx). Authoritative definitions from MS PDF.
- `knowledge-ref/intel-reports/edgar-taxonomy-research-report.md` — EDGAR XBRL tag mapping table, cross-source validation (MS vs R1 Toolbox vs EDGAR), coverage gap analysis, 99-field canonical schema.
- `validation/reports/fix-recommendations.json` — Phase 2 triangulation output, 35 prioritized items with sample values, root causes, and affected company/year counts.
- `src/engines/edgarFinancials.js` — Full engine taxonomy review (INCOME_TAXONOMY, BALANCE_TAXONOMY, CASHFLOW_TAXONOMY, computeDerivedFields). Lines 966-974 (PP&E+ROU), 1101-1103 (residual blocked), 1112-1134 (D&A broadening).

### Secondary (MEDIUM confidence)
- `knowledge-ref/intel-reports/consolidated_vs_expanded_financial_statements.md` — Consolidated vs expanded MS statement structure. Confirms MS includes "Leased Property" under Gross PP&E.
- `knowledge-ref/intel-reports/morningstar_original_vs_restated_financials.md` — Original vs restated MS data. EDGAR-based engines produce "as-reported" data; MS restated applies retroactive accounting adjustments.
- `src/engines/industryOverlays.js` — REIT/bank/insurance overlay fields reviewed. Bank overlay has NII/provision/noninterest. REIT overlay needs revenue tag additions.
- `src/engines/industryClassifier.js` — SIC code classification verified (AMT=6798->reit, JPM=6021->bank, WFC=6022->bank, MET=6311->insurance).
- `src/engines/__tests__/fixtures/morningstar/field-mapping.json` — `_sources` canonical names and `thesisField` engine names cross-referenced.

### Tertiary (LOW confidence)
- Estimated accuracy improvements per batch are educated guesses based on failure counts. Actual numbers will only be known after running the pipelines.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - working entirely within existing codebase, no new dependencies
- Architecture: HIGH - Morningstar DataID definitions provide authoritative "what correct means" for each field
- Fix taxonomy: HIGH - all 35 items categorized with verified root causes, upgraded from 4 to 6 categories using intel report insights
- Pitfalls: HIGH - B7 failure mode documented in code comments, REIT revenue gap identified with specific dollar amounts, PP&E ROU convention confirmed across multiple intel reports
- Accuracy projections: MEDIUM - batch-by-batch impact estimates are directional, not exact

**Research date:** 2026-03-26
**Valid until:** 2026-04-26 (stable -- fix-recommendations.json and engine code are under version control)
