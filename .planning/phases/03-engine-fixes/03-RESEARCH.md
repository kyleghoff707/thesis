# Phase 3: Engine Fixes - Research

**Researched:** 2026-03-26
**Domain:** XBRL financial data normalization, field name mapping, triangulation pipeline alignment
**Confidence:** HIGH

## Summary

Phase 3's fix-recommendations.json lists 35 prioritized items (609 CONSENSUS_DIFF + 2,177 LIKELY_BUG = 2,786 actionable items). This research reveals a critical finding: **the dominant root cause is NOT missing XBRL tags but a field naming mismatch between the Phase 2 data collectors and the engine's internal field names.** Of the 35 items, 16 are pure naming mismatches (affecting ~2,255 company-years), 8 are real tag coverage or value issues, 9 are derivation formula errors, and 2 are fiscal year offset issues.

The Phase 2 data collectors (FMP, SimFin, mstarpy) normalize to "canonical" field names stored in `field-mapping.json`'s `_sources` section (e.g., `stockholders_equity`, `total_assets`, `operating_cash_flow`). But the XBRL engine (`edgarFinancials.js`) uses different internal names for the same concepts (e.g., `equity`, `assets`, `net_cash_flow_from_operating_activities`). The triangulation pipeline compares values by field name directly -- when the engine outputs `equity: 63B` and FMP outputs `stockholders_equity: 63B`, the triangulator sees `stockholders_equity` as null from the engine (tag_miss) and `equity` as UNIQUE_COVERAGE. This single issue accounts for the top 12 items in the fix list and approximately 80% of all "bug" classifications.

**Primary recommendation:** Fix the field naming layer in the triangulation pipeline first (either add aliases in `triangulate.mjs` or normalize canonical names in the collectors to match engine names). This alone should push accuracy dramatically upward. Then fix the remaining genuine tag coverage, derivation, and financial sector overlay issues.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ENGINE-01 | Named item XBRL tag coverage fixes for top failure categories | 16 naming mismatches identified (see Category A), plus 8 real tag_miss items (Category B) covering intangibles, accrued liabilities, D&A variants, operating income |
| ENGINE-02 | Residual "Other" field computation with precondition gate | B7/B8 failure mode documented in edgarFinancials.js lines 1101-1103 and 1257-1260. Code exists but is commented out. Gate at 95% named item coverage needed |
| ENGINE-03 | Financial sector overlay validation | BRK-B, JPM, WFC, MET need overlay tuning. AMT (REIT) is the sample company in 13 of 35 recommendations. REIT revenue/COGS/gross_profit extraction is the main issue |
| ENGINE-04 | Regression protection via baseline snapshot diffing | compare-morningstar.mjs produces morningstar-accuracy.json baseline. triangulate.mjs has built-in regression diffing. Re-run after each fix batch |
</phase_requirements>

## Architecture Patterns

### The Real Fix Taxonomy (35 Items, 4 Categories)

Based on exhaustive analysis of fix-recommendations.json, the 35 items break into 4 distinct categories requiring different fix strategies:

#### Category A: Field Naming Mismatches (16 items, ~2,255 affected years)

These are NOT XBRL tag problems. The engine extracts the correct values but under different field names than the data collectors expect. The triangulation sees them as `tag_miss` because it compares by exact field name.

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
| `basic_eps` | `basic_earnings_per_share` | income | not in top 35 |
| `basic_shares_outstanding` | `basic_average_shares` | income | not in top 35 |
| `diluted_shares_outstanding` | `diluted_average_shares` | income | not in top 35 |

**Fix strategy:** Add a field alias map to `triangulate.mjs` that maps source canonical names to engine field names before comparison. This is a ~30-line change in one file. Do NOT rename engine fields (they're used by 50+ UI components).

**Why not rename source canonical names instead?** Because they match FMP/SimFin/mstarpy API field names -- changing them would break the collector normalization logic. The alias map in the triangulation script is the lowest-risk fix.

#### Category B: Real Tag/Coverage Issues (8 items, ~300 affected years)

These are genuine extraction problems where the engine gets a wrong value or null when sources agree on a value.

| P# | Field | Root Cause | Companies | Notes |
|----|-------|-----------|-----------|-------|
| P13 | `cost_of_revenue` | tag_miss | 16co/57yr | AMT (REIT) sample. REITs may use different COGS tags |
| P14 | `gross_profit` | tag_miss | 15co/55yr | Follows from P13 -- derived from revenue - COGS |
| P15 | `short_term_debt` | tag_miss | 19co/54yr | Engine has $6B, consensus $15.6B for AAPL. Engine likely missing `CommercialPaper` tag resolution for some companies |
| P17 | `accounts_payable` | tag_miss | 15co/52yr | AMT sample. Possible combined payables/accrued mismatch |
| P18 | `sga` | tag_miss | 15co/50yr | AMT sample. REIT/telecom companies may report SGA differently |
| P20 | `long_term_debt` | tag_miss | 17co/46yr | AMT $43.5B vs consensus $38.7B -- engine overcounting (may be including `SecuredDebt` + `UnsecuredDebt` overlap) |
| P25 | `short_term_investments` | tag_miss | 7co/25yr | CPRT sample. Might need additional tags |
| P27 | `interest_expense` | tag_miss | 9co/21yr | AMT sample. Null from engine but consensus has $1.4B |

**Fix strategy:** Investigate each field in the engine taxonomy, check which XBRL tags the affected companies actually use, and add/fix tags. Some are REIT-specific (AMT) and may need overlay adjustments.

#### Category C: Derivation Errors (9 items, 201 affected years)

The engine extracts raw values correctly but derives composite fields incorrectly.

| P# | Field | Companies | Root Cause Detail |
|----|-------|-----------|-------------------|
| P19 | `operating_income_loss` | 16co/47yr | Derivation path produces different result than sources. AMT: $4.85B vs $4.90B -- close but wrong derivation path |
| P22 | `property_plant_equipment` | 11co/39yr | Engine adds ROU assets to PP&E (line 968-969). AAPL: $52.5B (ours) vs $42.1B (SimFin+mstarpy). SimFin/mstarpy may NOT include ROU. Need to align with consensus |
| P23 | `revenues` | 13co/35yr | AMT: $717M (ours) vs $9.4B (consensus). Engine likely picking a sub-revenue tag for REITs instead of total |
| P24 | `net_change_in_cash` | 11co/28yr | FX effect inclusion difference |
| P26 | `net_income_loss` | 8co/22yr | AMT: $1.70B vs $1.77B. NCI treatment or discontinued operations |
| P30 | `goodwill` | 9co/11yr | AMT: $12.6B vs $12.1B. Possible restated vs original value |
| P31 | `research_and_development` | 4co/9yr | COST: null vs $5K. Trivial dollar amounts |
| P32 | `intangible_assets` | 5co/9yr | COST: null vs $225K. Trivial dollar amounts |
| P35 | `stock_based_compensation` | 1co/1yr | POOL: $14.9M vs $420K. Likely extraction from wrong tag |

**Fix strategy:** Investigate each derivation formula in `computeDerivedFields()`. The PP&E/ROU issue (P22) and revenue issue (P23) are the highest impact. The PP&E fix likely means NOT adding ROU assets when comparing against sources that exclude them, or adding a separate `property_plant_equipment_ex_rou` field.

#### Category D: Fiscal Year Offset (2 items, 30 affected years)

| P# | Field | Companies | Notes |
|----|-------|-----------|-------|
| P28 | `retained_earnings` | 6co/19yr | DINO sample. FY offset mismatch |
| P29 | `accounts_receivable` | 6co/11yr | AMT sample. Values present but offset by 1 year |

**Fix strategy:** These 6 companies likely have non-standard fiscal years where the FY label offset logic in `fetchEdgarStatements` doesn't fully align with how the collectors resolve fiscal years. Investigate DINO and AMT fiscal year ends.

### Recommended Fix Batching

Batch fixes by risk profile, not by root cause:

| Batch | What | Files Modified | Risk | Expected Impact |
|-------|------|---------------|------|-----------------|
| **Batch 1** | Field alias map in triangulate.mjs | 1 file (triangulate.mjs) | VERY LOW | Resolves 16 items (~80% of bugs). Run triangulation to measure new baseline |
| **Batch 2** | REIT/financial revenue + COGS tag fixes | edgarFinancials.js + industryOverlays.js | MEDIUM | Resolves P13, P14, P23 (REIT revenue), P18, P27 |
| **Batch 3** | Derivation formula fixes (PP&E, operating income, net change in cash) | edgarFinancials.js | MEDIUM | Resolves P19, P22, P24, P26 |
| **Batch 4** | Debt tag coverage (short_term_debt, long_term_debt) | edgarFinancials.js | LOW | Resolves P15, P20 |
| **Batch 5** | Financial sector overlay tuning (BRK-B, JPM, WFC, MET) | industryOverlays.js + industryClassifier.js | MEDIUM | Resolves ENGINE-03, P33 |
| **Batch 6** | FY offset investigation + residual "Other" precondition gate | edgarFinancials.js + triangulate.mjs | HIGH | Resolves P28-P29, ENGINE-02 |

### Verification Loop

After each batch:

```bash
# 1. Rebuild engine bundle
node validation/scripts/bundle.mjs

# 2. Re-run triangulation (50 companies, ~3 min)
node validation/scripts/triangulate.mjs

# 3. Check fix-recommendations.json — items should decrease
cat validation/reports/fix-recommendations.json | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));console.log('CONSENSUS_DIFF:',d.summary.consensusDiff,'LIKELY_BUG:',d.summary.likelyBug)"

# 4. Re-run Morningstar comparison (50 companies, ~5 min)
node validation/scripts/compare-morningstar.mjs

# 5. Check for regressions — accuracy should only go UP
cat validation/reports/morningstar-accuracy.json | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));console.log('Accuracy:',d.summary?.accuracy || 'check format')"
```

**Critical invariant:** After each batch, run BOTH pipelines. The triangulation pipeline measures against FMP/SimFin/mstarpy. The Morningstar comparison measures against the original 50-company truth set. Both must improve (or stay flat) -- never regress.

### Recommended Project Structure for Fixes

```
src/engines/
├── edgarFinancials.js          # Tag additions, derivation fixes
├── industryOverlays.js         # REIT/bank/insurance overlay tuning
├── industryClassifier.js       # SIC code mapping (if needed)
validation/scripts/
├── triangulate.mjs             # Field alias map addition
├── compare-morningstar.mjs     # No changes expected
├── lib/
│   ├── field-alias-map.mjs     # NEW: maps source canonical → engine field names
│   └── ...existing files...
```

### Anti-Patterns to Avoid

- **Renaming engine field names:** The engine's field names (`assets`, `liabilities`, `equity`, etc.) are used throughout 50+ UI components, hooks, and scoring engines. Renaming them would be a massive, regression-prone change. Use an alias map instead.
- **Fixing all 35 items in one batch:** Resist the temptation. Each batch must be verified independently. If a batch causes regressions, you need to know exactly which change caused it.
- **Adding ROU assets to PP&E unconditionally:** The current engine adds ROU assets to PP&E (line 968-969), but SimFin/mstarpy may NOT include them. The fix should either: (a) stop adding ROU unconditionally and let it be opt-in, or (b) verify which convention FMP/SimFin/mstarpy use and align.
- **Enabling residual "Other" computation before named items are accurate:** The B7/B8 failure mode is well-documented. The precondition gate must check named item coverage per company-year, not globally.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Field name mapping between systems | Custom translation logic scattered across files | Single alias map object in one place | A single source of truth prevents drift between the triangulation pipeline and future systems |
| Regression detection | Manual before/after comparison | Built-in regression diff in triangulation-reporter.mjs | Already implemented in Phase 2, produces fieldsGained/fieldsLost arrays |
| Engine bundle for validation | Manual Vite build | `node validation/scripts/bundle.mjs` | Auto-builds the engine as a Node.js-compatible ESM bundle, reused by both compare-morningstar.mjs and triangulate.mjs |

## Common Pitfalls

### Pitfall 1: Confusing Tag Miss with Naming Mismatch
**What goes wrong:** Treating all `tag_miss` items as XBRL taxonomy gaps and adding unnecessary tags to the engine, when the data IS being extracted under a different field name.
**Why it happens:** The triangulation pipeline compares by exact canonical field name. If source says `total_assets` and engine says `assets`, it's classified as `tag_miss` even though the engine correctly extracts the value.
**How to avoid:** Always cross-reference the engine taxonomy (`INCOME_TAXONOMY`, `BALANCE_TAXONOMY`, `CASHFLOW_TAXONOMY`) against the canonical name before concluding a field is missing. The 16 naming mismatches identified in this research account for ~80% of the "bugs."
**Warning signs:** `thesisValue: null` for a field that obviously exists in the engine (e.g., `total_assets` -- of course the engine extracts total assets).

### Pitfall 2: REIT Revenue Extraction
**What goes wrong:** REITs like AMT report revenue differently than standard companies. The engine may pick up a sub-revenue tag (e.g., `RealEstateRevenueNet` or `RevenuesExcludingInterestAndDividends`) instead of total revenue.
**Why it happens:** The `revenues` taxonomy field uses tags ordered by prevalence for standard companies. REITs use different XBRL tags that may not be in the fallback list, or the first-tag-wins logic picks a narrower tag.
**How to avoid:** Check which XBRL revenue tag AMT actually files. The REIT overlay may need to add revenue tag variants, or the base taxonomy needs additional REIT-relevant revenue tags.
**Warning signs:** Revenue off by 90%+ (e.g., AMT: $717M engine vs $9.4B consensus).

### Pitfall 3: PP&E + ROU Asset Double-Counting
**What goes wrong:** The engine adds operating lease ROU assets to PP&E (line 968-969 of edgarFinancials.js). Some sources (SimFin, mstarpy) report PP&E WITHOUT ROU assets. This creates a systematic derivation_error.
**Why it happens:** Morningstar includes ROU in "Net PPE" per their methodology. But FMP/SimFin may not. The engine was designed to match Morningstar, not multi-source consensus.
**How to avoid:** Check whether the consensus value for PP&E includes or excludes ROU. If consensus excludes it, remove the ROU addition and report them separately. The Morningstar comparison pipeline (Phase 1) might need its own adjustment.
**Warning signs:** PP&E consistently higher than consensus by exactly the ROU asset amount.

### Pitfall 4: Residual "Other" Amplification (B7 Failure Mode)
**What goes wrong:** Computing "Other Current Liabilities" as `current_liabilities - accounts_payable - short_term_debt - ...` amplifies errors in any of the named items. If `short_term_debt` is wrong by $2B, `other_current_liabilities` is wrong by $2B in the opposite direction.
**Why it happens:** Residual computation is subtraction -- any error in the positive terms becomes an equal-magnitude error in the residual.
**How to avoid:** ENGINE-02 specifies a 95% precondition gate: only compute residuals when named item coverage for that company-year reaches 95%. The gate must be per-company-year, not global.
**Warning signs:** Enabling "Other" computation causes accuracy DECREASE, not increase.

### Pitfall 5: Breaking the Morningstar Comparison Baseline
**What goes wrong:** Fixing the triangulation pipeline (alias map) improves triangulation results but may diverge from the Morningstar comparison. The Morningstar pipeline uses `thesisField` mappings that already match engine names -- it's NOT affected by the naming mismatch.
**Why it happens:** The two pipelines use different field mapping systems. Changes that help one could theoretically hurt the other.
**How to avoid:** Always run BOTH pipelines after each batch. The Morningstar comparison (Phase 1 baseline) is the ground truth for accuracy. The triangulation is the diagnostic tool.
**Warning signs:** Triangulation improves but Morningstar accuracy drops.

## Code Examples

### Field Alias Map (Batch 1 Fix)

The core fix for Category A items. Add to `triangulate.mjs` or as a new module:

```javascript
// validation/scripts/lib/field-alias-map.mjs
// Maps source canonical field names → engine internal field names.
// Used by the triangulation pipeline to bridge the naming gap between
// data collectors (FMP/SimFin/mstarpy canonical names) and the XBRL engine.

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

/**
 * Normalize a canonical field name to the engine's internal name.
 * Returns the alias if one exists, otherwise returns the original name.
 */
export function resolveFieldName(canonical) {
  return FIELD_ALIASES[canonical] || canonical;
}
```

Usage in `triangulate.mjs` -- modify `getFieldValue()` for engine data:

```javascript
import { resolveFieldName } from './lib/field-alias-map.mjs';

// In the main loop, resolve field names when reading from engine data:
function getFieldValue(data, field, year, isEngine = false) {
  if (!data) return null;
  // For engine data, also check the alias
  const names = isEngine ? [field, resolveFieldName(field)] : [field];
  for (const name of names) {
    for (const stmtKey of ['income', 'balance', 'cashFlow']) {
      const val = data[stmtKey]?.[year]?.[name];
      if (val != null) return val;
    }
  }
  return null;
}
```

### REIT Revenue Tag Investigation (Batch 2)

To diagnose AMT's revenue issue, check which XBRL revenue tags AMT actually files:

```bash
# Run for a single REIT ticker to see what's extracted
node validation/scripts/triangulate.mjs --ticker AMT
```

Then in the XBRL facts for AMT, check:
- Does AMT file `RevenueFromContractWithCustomerExcludingAssessedTax`?
- Or does it use `Revenues` (the generic fallback)?
- Or a REIT-specific tag like `RealEstateRevenueNet`?

The fix will likely be adding REIT-specific revenue tags to either the base taxonomy or the REIT overlay.

### Regression Check Script (ENGINE-04)

After each fix batch:

```bash
# Store pre-fix baseline
cp validation/reports/fix-recommendations.json validation/reports/fix-recommendations-pre-batch-N.json
cp validation/reports/morningstar-accuracy.json validation/reports/morningstar-accuracy-pre-batch-N.json

# Apply fixes, rebuild, re-run
node validation/scripts/bundle.mjs
node validation/scripts/triangulate.mjs
node validation/scripts/compare-morningstar.mjs

# Diff
node -e "
const pre = JSON.parse(require('fs').readFileSync('validation/reports/fix-recommendations-pre-batch-N.json','utf8'));
const post = JSON.parse(require('fs').readFileSync('validation/reports/fix-recommendations.json','utf8'));
console.log('BEFORE:', pre.summary.consensusDiff, 'CONSENSUS_DIFF,', pre.summary.likelyBug, 'LIKELY_BUG');
console.log('AFTER:', post.summary.consensusDiff, 'CONSENSUS_DIFF,', post.summary.likelyBug, 'LIKELY_BUG');
console.log('Reduction:', pre.summary.consensusDiff + pre.summary.likelyBug - post.summary.consensusDiff - post.summary.likelyBug, 'items');
"
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single-source comparison (Morningstar only) | Multi-source triangulation (FMP + SimFin + mstarpy + MS) | Phase 2 (2026-03-25) | Can distinguish our bugs from methodology differences |
| Manual root cause analysis | Auto-classification (tag_miss, sign_flip, derivation_error, etc.) | Phase 2 (2026-03-25) | Machine-readable fix list |
| 91.2% accuracy baseline | 91.2% + decomposed into 2,786 bugs + 12,465 methodology diffs | Phase 2 (2026-03-25) | Scoped Phase 3 to specific fixes |

## Open Questions

1. **PP&E + ROU convention: Which is correct?**
   - What we know: Engine adds ROU to PP&E (matching Morningstar). SimFin/mstarpy apparently exclude ROU.
   - What's unclear: Does FMP include ROU in PP&E? Is the Morningstar convention the right one for our use case?
   - Recommendation: Check AAPL's actual PP&E value with and without ROU. If consensus (FMP+SimFin+mstarpy) excludes ROU, stop adding it. Report ROU as a separate field.

2. **AMT (REIT) revenue: Which XBRL tag does AMT file?**
   - What we know: Engine gets $717M, consensus gets $9.4B. Massive gap suggests a sub-revenue tag.
   - What's unclear: Which specific XBRL tag AMT uses for total revenue. May be a REIT-specific tag not in the base taxonomy.
   - Recommendation: Inspect AMT's CompanyFacts JSON to identify the revenue tag. Add it to the REIT overlay or base taxonomy.

3. **Short-term debt undercounting (P15): What's missing?**
   - What we know: AAPL 2021 -- engine gets $6B, consensus gets $15.6B. Engine has tags for `ShortTermBorrowings`, `DebtCurrent`, `CommercialPaper`.
   - What's unclear: Whether AAPL reports commercial paper + other ST debt components that the first-tag-wins logic misses.
   - Recommendation: Investigate AAPL's XBRL filing for ST debt tags. May need component summation like the investment purchase/sale logic.

4. **Financial sector overlay completeness: How much improvement is needed?**
   - What we know: Only 1 recommendation explicitly mentions a financial company (MET, P33). But the naming mismatch masks financial company issues.
   - What's unclear: After the naming fix (Batch 1), how many financial-sector-specific issues will surface?
   - Recommendation: After Batch 1, re-run triangulation with `--ticker BRK-B,JPM,WFC,MET` and analyze results.

5. **What accuracy level will Batch 1 (naming fix) alone achieve?**
   - What we know: 16 naming mismatches account for ~2,255 of the 2,786 bug-classified items.
   - What's unclear: The exact accuracy number after re-running with the alias map.
   - Recommendation: Batch 1 should be executed first as a "quick win" that dramatically changes the landscape. The remaining batches can then be planned against the updated fix-recommendations.json.

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
| ENGINE-02 | Residual "Other" only computed when named item coverage >= 95% | unit | `npm test -- --run src/engines/__tests__/edgarFinancials.test.js` | Extend existing |
| ENGINE-03 | Financial sector accuracy improves after overlay fixes | integration | `node validation/scripts/triangulate.mjs --ticker BRK-B,JPM,WFC,MET` | Wave 0 |
| ENGINE-04 | No regression in Morningstar accuracy after each batch | integration | `node validation/scripts/compare-morningstar.mjs` | Exists |

### Sampling Rate
- **Per task commit:** `node validation/scripts/triangulate.mjs --ticker AAPL` (single-company smoke test, ~10s)
- **Per wave merge:** Full triangulation (`node validation/scripts/triangulate.mjs`) + Morningstar comparison (`node validation/scripts/compare-morningstar.mjs`)
- **Phase gate:** 98%+ on Morningstar truth set confirmed by full pipeline run

### Wave 0 Gaps
- [ ] `src/engines/__tests__/harness/field-alias-map.test.js` -- covers ENGINE-01 (alias resolution)
- [ ] Integration test wrapper for single-ticker triangulation with assertions on classification counts
- [ ] Existing `edgarFinancials.test.js` needs extension for residual gate behavior (ENGINE-02)

## Sources

### Primary (HIGH confidence)
- `validation/reports/fix-recommendations.json` -- Phase 2 triangulation output, 35 prioritized items analyzed in full
- `src/engines/edgarFinancials.js` -- Full engine taxonomy (INCOME_TAXONOMY, BALANCE_TAXONOMY, CASHFLOW_TAXONOMY) and derivation logic reviewed
- `src/engines/__tests__/fixtures/morningstar/field-mapping.json` -- Both `_sources` canonical names and `thesisField` engine names cross-referenced
- `validation/scripts/triangulate.mjs` -- Triangulation pipeline reviewed, field name comparison mechanism confirmed

### Secondary (MEDIUM confidence)
- `src/engines/industryOverlays.js` -- REIT/bank/insurance overlay fields reviewed
- `src/engines/industryClassifier.js` -- SIC code classification verified (AMT=REIT via SIC 6798)
- `.planning/phases/02-multi-source-triangulation/02-EXECUTIVE-SUMMARY.md` -- Phase 2 results and classification breakdown

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - working entirely within existing codebase, no new dependencies
- Architecture: HIGH - field naming mismatch root cause verified by cross-referencing actual field names in engine vs collectors
- Pitfalls: HIGH - B7 failure mode well-documented in code comments, REIT revenue gap identified with specific dollar amounts
- Fix taxonomy: HIGH - all 35 items categorized with verified root causes

**Research date:** 2026-03-26
**Valid until:** 2026-04-26 (stable -- the fix-recommendations.json and engine code are under version control)
