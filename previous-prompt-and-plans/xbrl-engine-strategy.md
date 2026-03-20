# Thes1s — XBRL Engine Strategy

## The Goal

Build a general-purpose SEC XBRL → standardized financials engine that works for any public company. This is effectively reverse-engineering Morningstar's proprietary mapping — but using AI and the SEC's own taxonomy structure instead of an army of analysts. The engine needs to be product-grade (sellable), not just "works for the 50 companies I research."

## Current State

The engine (`edgarFinancials.js`) uses **tag enumeration** — a static list of ~200 XBRL tags mapped to standardized fields. Phases 1-3 are complete: tag expansion + derivation fixes (Phase 1), provenance metadata (Phase 2), and Layer 2 taxonomy resolver (Phase 3). The engine now tracks which XBRL tag resolved each field per year, distinguishes Layer 1 vs Layer 2 resolution in provenance, and automatically identifies derived vs directly-extracted fields. **Next: Phase 4 — Industry classifier + overlays.**

## Coverage Audit Results (S&P 500)

Scanned 503 companies, 0 failures. Full results in `validation/reports/coverage-audit-results.md`.

**Latest audit (2026-03-19, post-Phase 7 — Layer 3 AI Classification):**

| Tier | Fields | Avg Coverage | Verdict |
|------|--------|-------------|---------|
| Tier 1 (Scoring-Critical) | 23 | **96.1%** | +0.7pp from Layer 3 AI |
| Tier 2 (Display) | 32 | **90.8%** | +2.1pp from Layer 3 AI |
| Tier 3 (Expanded) | 30 | **83.9%** | +12.8pp from Layer 3 AI |

**Previous audits:** Phase 4 overlays: Tier 1: 95.4% · Tier 2: 88.7% · Tier 3: 71.1% | Phase 3 Layer 2: Tier 1: 92.3% · Tier 2: 82.7% · Tier 3: 64.3%

### Layer 2 Audit Analysis

Layer 2 added 1,937 descendant tags across 113 concepts but didn't change the aggregate S&P 500 coverage numbers. **This is expected.** The coverage audit checks whether *any* tag in a field's list exists in a company's CompanyFacts. S&P 500 companies overwhelmingly report using standard Layer 1 tags. The ~8% missing Tier 1 coverage are companies that genuinely *don't report that concept at all* (financials, REITs, insurance with fundamentally different structures) — not companies using obscure tag variants.

**Where Layer 2 actually helps:** Individual company *extraction* — when a company uses an industry-specific variant (like `PremiumsEarnedNet` instead of `Revenues` for insurance). The audit's coarse "does any tag exist?" check can't measure this. Layer 2 improves data quality for edge-case companies at runtime, even though aggregate S&P 500 numbers look the same.

**Conclusion:** Aggregate coverage improvements will come from Layer 3 (AI classification) and Phase 4 (industry overlays), which address the structural reporting differences that cause the remaining gaps. Layer 2 is still valuable for its intended purpose — catching tag variants within standard reporting structures.

### Worst Tier 1 Fields (post-Phase 7)

| Field | Coverage | Prev | Root Cause |
|-------|----------|------|------------|
| current_portion_lt_debt | 80.3% | 72.6% | Layer 3 caught alternative debt tags; remainder are companies that genuinely bundle into `DebtCurrent` or have none |
| dividends_per_share | 81.3% | 81.1% | ~95 companies don't pay dividends — legitimate zeros, not gaps |
| short_term_debt | 84.9% | 75.7% | Layer 3 found industry-specific ST debt tags; growth companies genuinely have none |
| dividends_paid | 88.3% | 83.7% | Same as dividends_per_share — non-payers |
| shares_outstanding | 94.0% | — | Some companies only report in DEI namespace, not us-gaap |
| capital_expenditures | 96.8% | — | Financials/insurance don't report CapEx |
| operating_income_loss | 97.0% | 83.1% | Layer 3 + derivation fixes; remainder are pure financials |
| long_term_debt | 97.6% | 91.7% | Layer 3 caught REIT/bank-specific debt tags |
| depreciation_amortization | 99.0% | 89.9% | Layer 3 found alternative D&A tags |

### Key Insight

The gap is **concentrated in a handful of fields**, not spread evenly. Debt-related fields are the #1 problem across the entire market, not just financials. But most gaps are fixable through derivation and tag expansion — no architecture change needed to reach ~96-97%.

### What's Actually Broken vs Legitimately Missing

Not all "missing" = broken. Dividend fields are low because ~95 S&P 500 companies don't pay dividends. Short-term debt is low partly because many companies genuinely have none. The **real** broken fields are: `liabilities` (derivable), `operating_income_loss` (derivable), and the industry-specific debt tags (fixable with more tags).

---

## Three-Layer Engine Architecture

The engine uses a three-layer resolution strategy. Each layer is a fallback — Layer 1 handles ~96% of cases, Layer 2 catches most of the rest, Layer 3 handles the long tail.

```
┌───────────────────────────────────────────────────┐
│         edgarFinancials.js (orchestrator)          │
│                                                   │
│  1. Detect industry (SIC → type)                  │
│  2. Extract via three layers                      │
│  3. Apply industry overlay                        │
│  4. Compute derived fields                        │
│  5. Sum-of-parts validation                       │
│  6. Build provenance (parallel metadata)          │
│  7. Apply split adjustment                        │
│  8. Cache result (versioned key)                  │
└──┬────────────┬──────────────┬────────────────────┘
   │            │              │
┌──▼──────┐ ┌──▼─────────┐ ┌──▼──────────────────┐
│ LAYER 1 │ │  LAYER 2   │ │   LAYER 3           │
│ Static  │ │  Pre-built │ │  3a: AI classify    │
│ Tag Map │ │  Taxonomy  │ │     unknown tags     │
│         │ │  JSON      │ │     from co.facts    │
│ ~200    │ │  <100KB    │ │  3b: Full linkbase  │
│ tags    │ │  O(1)      │ │     parse fallback   │
│ O(1)    │ │  lookup    │ │                      │
└─────────┘ └────────────┘ └──────────┬───────────┘
                                      │
                             ┌────────▼─────────┐
                             │ Confidence gate   │
                             │ <80% → "inferred" │
                             └──────────────────┘
```

### Layer 1: Static Tag Map (existing, improved)

The current `INCOME_TAXONOMY`, `BALANCE_TAXONOMY`, `CASHFLOW_TAXONOMY` arrays in `edgarFinancials.js`. Priority-ordered fallback tags per field. ~200 tags covering ~96% of S&P 500 companies.

**Changes needed:**
- Add derivation fixes (liabilities, operating_income, D&A)
- Expand tag lists using insights from Layer 2 build script (add newly discovered child tags to the static lists)
- Track provenance metadata (which tag matched per field per year)

### Layer 2: Pre-Built Taxonomy JSON

A <100KB JSON lookup table, built at build time from the SEC's US-GAAP taxonomy. Maps each of our ~70 target concepts to all their descendant tags in the calculation linkbase hierarchy.

**How it works:**
1. **Build script** (`validation/scripts/build-taxonomy-json.js`) downloads the SEC taxonomy zip (~49MB), parses only the calculation linkbase XML files, and extracts parent-child relationships with weights for our target concepts.
2. Processes **current + prior 2 taxonomy versions** (e.g., 2024, 2025, 2026) to handle historical filings that use older tags.
3. Includes a **deprecation map** (old tag → replacement) extracted from taxonomy labels.
4. Outputs `src/data/taxonomy-hierarchy.json` — a static JSON file imported at build time.

**At runtime:** When Layer 1 misses a field for a company, the resolver checks this JSON: "Does this company report any tag that's a known descendant of my target concept?" If yes, use it with the calculation weight.

**SEC Taxonomy Details:**
- Published annually by FASB at `https://fasb.org/xbrl` (~Q1 each year)
- Full DTS is ~860MB across 12,000+ files, but we only need the calculation linkbase relationships
- ~14,000 US-GAAP concepts total
- Calculation linkbase uses `summation-item` arcs with `weight` attributes (1.0 = add, -1.0 = subtract)

### Layer 3: Per-Company Adapter (AI-assisted)

Two sub-layers, tried in order:

**Layer 3a — AI Tag Classification:** When Layers 1+2 both miss, examine the company's companyfacts for us-gaap tags that weren't matched by any field. Send these unmatched tags to Claude with: "Which of these standard financial fields does each tag correspond to?" Cache the classification per-company.

- Confidence threshold: <80% → mark as "inferred" with ⚠️, don't treat as definitive
- **Pre-classified S&P 500:** Run Layer 3a on all S&P 500 companies at build time, ship cached classifications with the app. Runtime AI only needed for companies outside the S&P 500.
- **Batch API calls:** When loading multiple companies (e.g., Competitors tab with 15+ peers), collect all unmatched tags and send one Claude API call instead of 15 serial calls.

**Layer 3b — Full Linkbase Parsing (fallback):** If 3a can't resolve a tag, download the company's filing package from EDGAR, parse their calculation linkbase XML, and map their specific tags to our standard fields. Cache the adapter per company.

### Industry-Aware Overlays

The engine detects what kind of company it's looking at and applies additive overlays:

```
MASTER TAXONOMY (shared by all)
  │
  ├── BANK OVERLAY: adds NII, NIM, efficiency ratio, loan loss provisions
  │                 remaps revenue → net_interest_income + non_interest_income
  │
  ├── REIT OVERLAY: adds FFO, AFFO, NAV
  │                 remaps earnings → FFO for growth rate analysis
  │
  ├── INSURANCE OVERLAY: adds combined ratio, loss ratio, float
  │                      remaps revenue → premiums_earned
  │
  └── STANDARD: no overlay (default)
```

**Detection:** SIC code → industry type via `sicClassification.js` (already exists, ~250 SIC codes mapped). Falls back to "standard" for unknown SIC codes. User can override industry type per company in the future.

**DRY principle:** One master taxonomy, not four copies. The overlay only adds/remaps ~10-15 fields per industry type. A bug fix to a shared tag list happens in one place.

### Data Provenance & Confidence

Every extracted value carries parallel metadata (stored alongside the data, NOT changing the data model):

```js
// Data model (unchanged):
income[2024].revenues = 123456789

// Parallel provenance (new, separate object):
provenance.income[2024].revenues = {
  tag: 'RevenueFromContractWithCustomerExcludingAssessedTax',
  layer: 1,           // 1 = static, 2 = taxonomy, 3 = AI/linkbase
  derived: false,      // true if computed from other fields
  confidence: null,    // only set for Layer 3 results (0-100)
  formula: null,       // only set for derived fields (e.g., "revenues - cost_of_revenue")
}
```

**Zero breaking changes:** Components read bare numbers as before. Provenance is opt-in for components that want to display confidence indicators or tag source info.

**Sum-of-parts validation:** After extraction, run accounting identity checks (reusing `validation.js`'s `runIdentityChecks()`). Flag mismatches in the provenance metadata.

### Coverage Monitoring (Self-Healing)

On company load (or periodically for researched companies), compare current extraction result against cached baseline:
- New fields resolved → log improvement
- Fields lost → ⚠️ flag in Audit tab, show which tags changed
- Triggers Layer 2/3 re-resolution for that company

Reuses the coverage audit logic already built in `validation/scripts/coverage-audit.js`.

### Taxonomy Coverage Dashboard (Audit Tab)

New section in the Audit tab showing per-company:
- Which XBRL tags matched for each field (fallback chain transparency)
- Which layer resolved each field (direct / taxonomy / AI / derived)
- Coverage percentage vs S&P 500 sector average
- Filing structure changes between years

---

## Implementation Phases

Each phase is independently shippable and testable. Re-run the S&P 500 coverage audit after each phase to measure improvement.

### Phase 1 — Derivation Fixes + Layer 1 Tag Expansion ✅ COMPLETE

**Files:** `src/engines/edgarFinancials.js`
**Completed:** 2026-03-18

Added derived field fallbacks in `computeDerivedFields` + expanded static tag lists:

| Fix | Derivation | Impact |
|-----|-----------|--------|
| `liabilities` | `liabilities_and_equity - equity - minority_interest` | 73.4% → ~100% |
| `operating_income_loss` | `revenues - cost_of_revenue - operating_expenses` or `income_before_tax + interest_expense` | 83.1% → ~95%+ |
| `depreciation_amortization` | Already partially handled. Added additional tags. | 89.5% → ~94% |

Also expanded tag lists for: short-term debt (`LineOfCredit`, `ShortTermBankLoansAndNotesPayable`), current portion LT debt (`LongTermDebtAndCapitalLeaseObligationsCurrent`, `OtherLongTermDebtCurrent`), D&A (`OtherDepreciationAndAmortization`), operating income (`OperatingIncomeLossFromContinuingOperations`).

**Tests:** 24 tests in `src/engines/__tests__/edgarFinancials.test.js` covering taxonomy structure, derivation logic, and tag expansion.

### Phase 2 — Provenance Metadata ✅ COMPLETE

**Files:** `src/engines/edgarFinancials.js`, `src/engines/__tests__/edgarFinancials.test.js`
**Completed:** 2026-03-18

Implemented provenance tracking through the extraction pipeline:

1. **`extractSection()`** — now returns `provenanceData` alongside `fieldData`. Tracks which XBRL tag resolved each field per year. Returns `{ fieldData, years, provenanceData }`.

2. **`buildProvenance()`** — new helper that pivots provenance from `field→year→prov` to `year→field→prov` (same shape as `buildStatements`).

3. **`fetchEdgarStatements()`** — builds provenance from extraction, uses pre/post snapshot diff around `computeDerivedFields()` to automatically mark derived fields (`derived: true`). Result now includes `provenance: { income, balance, cashFlow }`.

4. **Cache key** bumped from `v2` to `v3`.

5. **Exports** — `extractSection` and `buildProvenance` added to module exports.

**Provenance shape per field per year:**
```js
{
  tag: 'RevenueFromContractWithCustomerExcludingAssessedTax',  // which XBRL tag resolved this
  layer: 1,           // 1 = static tag map
  derived: false,     // true if computed by computeDerivedFields
  confidence: null,   // reserved for Layer 3
  formula: null,      // reserved for derived field formulas (Phase 5 Audit UI)
}
```

**Design note:** Derived fields are detected via pre/post snapshot diff (snapshot field keys before `computeDerivedFields`, diff after) rather than inline `markDerived` calls. This avoids modifying ~42 derivation sites and automatically catches all current and future derivations. The `formula` field is left `null` for now — can be populated when building the Audit tab UI (Phase 5).

**TTM/Quarterly provenance** skipped for Phase 2 — annual data is the primary path.

**Tests:** 12 new tests (36 total) covering tag tracking, fallback resolution, negate flag, `buildProvenance` pivot, and derived field detection for income/balance/cashFlow.

### Phase 3 — Pre-Built Taxonomy JSON + Layer 2 Resolver ✅ COMPLETE

**New files:** `validation/scripts/build-taxonomy-json.js`, `src/data/taxonomy-hierarchy.json`, `src/engines/taxonomyResolver.js`
**Completed:** 2026-03-18

1. **Build script** (`validation/scripts/build-taxonomy-json.js`) downloads FASB US-GAAP taxonomy zips for 2023, 2024, 2025 (~7MB each), extracts calculation linkbase XML files (62-65 per version), parses all summation-item arcs using `@xmldom/xmldom`, and builds a parent→descendants graph. Outputs descendants (max depth 2, positive weight only) for all Layer 1 root concepts, excluding tags already in Layer 1. Cached in `validation/.taxonomy-cache/`.

2. **Taxonomy JSON** (`src/data/taxonomy-hierarchy.json`, 84KB minified) — maps 113 Layer 1 concepts to 1,937 additional descendant tags from the FASB calculation linkbase hierarchy. Key expansions: `long_term_debt` +62 tags, `cost_of_revenue` +49 tags, `depreciation_amortization` +28 tags, `interest_expense` +19 tags, `operating_income_loss` +15 tags, `current_portion_lt_debt` +15 tags, `short_term_debt` +14 tags.

3. **Runtime resolver** (`src/engines/taxonomyResolver.js`) — `augmentTaxonomy()` extends each taxonomy field's tag list with Layer 2 descendants. Layer 1 tags remain first (highest priority). `_layer2Start` index tracks where Layer 2 begins for provenance.

4. **Integration** into `edgarFinancials.js` — `extractSection()` now accepts augmented taxonomy arrays with `_layer2Start` marker. Provenance tracks `layer: 2` for Layer 2-resolved fields. Cache key bumped to `v4`.

5. **Tests:** 23 tests in `src/engines/__tests__/taxonomyResolver.test.js` covering: JSON structure, `getLayer2Tags`, `augmentTaxonomy`, `getTagLayer`, Layer 2 provenance in `extractSection` (including L2-only, L1 priority, mixed L1/L2, negate flag), and coverage stats for all three real taxonomy arrays.

**Verification:** Full S&P 500 coverage audit completed (503/503 companies, 0 failures). Layer 2 didn't move aggregate S&P 500 coverage (Tier 1 remains 92.3%) because remaining gaps are structural — companies that don't report certain concepts at all, not companies using obscure tag variants. Layer 2's value is in individual company extraction for edge-case industry tags. See "Layer 2 Audit Analysis" in the Coverage Audit Results section above.

### Phase 4 — Industry Classifier + Overlays ✅ COMPLETE

**New files:** `src/engines/industryClassifier.js`, `src/engines/industryOverlays.js`
**Completed:** 2026-03-18

1. **Industry classifier** (`industryClassifier.js`) — maps SIC codes to industry types: `bank` (SIC 6020-6036), `reit` (SIC 6512, 6798), `insurance` (SIC 6311-6399), or `standard` (everything else). Precision over recall — only classifies companies whose financial reporting is structurally different from standard companies.

2. **Bank overlay** (16 income + 10 balance fields + derived metrics):
   - Income: `interest_income_operating`, `interest_expense_operating`, `net_interest_income_bank`, `net_interest_income_after_provision`, `provision_for_credit_losses`, `noninterest_income`, `noninterest_expense`, `trading_revenue`, `investment_banking_revenue`, `asset_management_fees`, `compensation_expense`, plus breakdowns
   - Balance: `loans_net`, `loans_gross`, `allowance_for_loan_losses`, `deposits`, `deposits_interest_bearing`, `deposits_noninterest_bearing`, `investment_securities`, `fed_funds_sold`, `fed_funds_purchased`, `cash_due_from_banks`, `interest_bearing_deposits_in_banks`
   - Derived: `efficiency_ratio`, `net_interest_margin`, `loan_to_deposit_ratio`, `provision_to_loans`

3. **REIT overlay** (4 income + 8 balance + 4 cash flow fields + derived metrics):
   - Income: `property_operating_costs`, `gain_loss_on_real_estate_sales`, `impairment_of_real_estate`, `equity_method_income`
   - Balance: `real_estate_investment_net`, `real_estate_investment_gross`, `real_estate_accumulated_depreciation`, `land_available_for_development`, `unconsolidated_jv_investments`, `in_place_lease_intangibles`, `below_market_lease_liability`, `nci_operating_partnership`
   - Cash flow: `payments_to_acquire_real_estate`, `payments_to_develop_real_estate`, `proceeds_from_real_estate_sales`, `equity_method_distributions`
   - Derived: `ffo`, `ffo_per_share`, `affo`, `noi`, `nav_book`, `nav_per_share`

4. **Insurance overlay** (12 income + 7 balance + 3 cash flow fields + derived metrics):
   - Income: `premiums_earned_net`, `premiums_written_net`, `premiums_direct`, `premiums_assumed`, `premiums_ceded`, `net_investment_income`, `policyholder_benefits_and_claims`, `benefits_claims_settlement`, `insurance_commissions`, `insurance_other_operating_expense`, `policyholder_dividends`, `interest_credited_to_policyholders`
   - Balance: `future_policy_benefits`, `unpaid_claims_reserves`, `unearned_premiums`, `policyholder_contract_deposits`, `deferred_policy_acquisition_costs`, `reinsurance_recoverables`, `premiums_receivable`
   - Cash flow: `change_in_claims_reserves`, `change_in_unearned_premiums`, `change_in_insurance_liabilities`
   - Derived: `loss_ratio`, `expense_ratio`, `combined_ratio`, `insurance_float`

5. **Integration** into `edgarFinancials.js`:
   - `fetchEdgarStatements` now detects industry type from SIC (via parallel `fetchCompanyInfo` call — already cached)
   - Extracts overlay fields using same `extractSection` mechanism with Layer 2 augmentation
   - Merges overlay fields into base statements (additive — never overwrites)
   - Runs overlay-specific `computeDerived` after base `computeDerivedFields`
   - Provenance tracks overlay fields same as base fields
   - Result includes `industryType` property
   - Cache key bumped from `v4` to `v5`

6. **Research base:** Real companyfacts analysis for JPM (917 us-gaap tags), PLD (585 tags), BRK-B (437 tags), MET (1,064 tags). Identified which tags are available with 10-K data and which metrics must be derived.

**Tests:** 46 tests in `src/engines/__tests__/industryOverlays.test.js` covering:
- Industry classifier: SIC→type mapping, edge cases (null, numeric, padding), label function
- Overlay selection: getOverlay returns correct overlay or null
- Bank overlay: taxonomy field structure + derived metrics (efficiency ratio, L/D ratio, NIM)
- REIT overlay: taxonomy field structure + derived metrics (FFO, NOI, FFO/share, AFFO, NAV)
- Insurance overlay: taxonomy field structure + derived metrics (loss ratio, expense ratio, combined ratio, float)
- Structure validation: unique field names, valid tag format, computeDerived function presence

**Design notes:**
- Overlays are **additive** — one master taxonomy, not four copies. Bug fixes to shared fields happen in one place.
- Industry type detection uses **exact SIC match only** (no 2-digit fallback) — precision over recall. Credit services, capital markets, insurance brokers, and conglomerates stay "standard" since their reporting is closer to standard companies.
- FFO tag doesn't exist in XBRL — must be **derived** from Net Income + D&A + Impairment - Gains on RE Sales.
- Insurance float is an **approximation** from available XBRL balance sheet items. BRK's reported float can't be reconstructed from XBRL alone.
- AFFO uses 15% of total capex as maintenance capex estimate (REIT heuristic).

**Verification:** Full S&P 500 coverage audit (503 companies, 0 failures). Tier 1 coverage improved **92.3% → 95.4%** (+3.1pp). Tier 2: 82.7% → 88.7% (+6.0pp). Tier 3: 64.3% → 71.1% (+6.8pp). Industry overlays resolved structural gaps for banks, REITs, and insurance companies that Layer 2 couldn't address.

### Phase 5 — Coverage Dashboard (Audit Tab UI) ✅ COMPLETE

**Files:** `src/engines/tickerAudit.js`, `src/components/TickerDataAudit.jsx`
**Completed:** 2026-03-19

Added XBRL Coverage Dashboard as a new check group in the Data Audit tab, displaying per-company field resolution from provenance metadata.

1. **Coverage check group** (`tickerAudit.js`) — new `checkCoverage()` function that:
   - Reads `provenance` and `industryType` from `fetchEdgarStatements()`
   - Computes per-tier coverage percentages (Tier 1/2/3) for the latest fiscal year
   - Breaks down resolution by layer (Layer 1 Static, Layer 2 Taxonomy, Derived)
   - Tracks industry overlay fields separately
   - Measures tag stability across years (whether the same XBRL tag resolves consistently)
   - Returns structured `coverageData` alongside standard check results

2. **Field tier mapping** — exported `FIELD_TIERS` constant mapping all ~85 standard fields to tiers (1=Scoring-Critical, 2=Display, 3=Expanded), mirroring `coverage-audit.js` tier definitions. Overlay fields get tier 0 (industry-specific).

3. **Human-readable labels** — exported `FIELD_LABELS` constant with display names for all fields including derived and overlay-specific fields.

4. **CoverageDashboard component** (`TickerDataAudit.jsx`) — specialized renderer with:
   - **Header**: Industry type badge (bank/REIT/insurance), overall field count, fiscal year
   - **Tier coverage bars**: Three horizontal progress bars showing Tier 1/2/3 coverage % with field counts
   - **Layer breakdown**: Color-coded dots showing Layer 1 (static), Layer 2 (taxonomy), Derived, and Overlay field counts
   - **Section filters**: Toggle buttons to view All, Tier 1, Tier 2, Tier 3, or Overlay fields
   - **Field resolution table**: 4-column grid (Field, XBRL Tag, Layer badge, Tier badge) showing every extracted field with its source tag. Derived fields shown in italic. Overlay fields marked with OVR badge.
   - **Show more toggle**: Collapses to 30 fields by default with expand button

5. **Integration**: Coverage group runs automatically after Financial Statements check (uses cached data — no extra API calls). Added to GROUP_ORDER between `financials` and `splits`.

**Tests:** Existing 130 tests pass (149 after Phase 6 adds 19). No new tests needed for Phase 5 — this is a UI rendering layer consuming existing provenance data.

**Verification:** Full S&P 500 coverage audit (503 companies, 0 failures). Results unchanged from Phase 4 — Tier 1: 95.4%, Tier 2: 88.7%, Tier 3: 71.1%. Expected since Phase 5 is UI-only.

### Phase 6 — Coverage Monitor ✅ COMPLETE

**Files:** `src/engines/tickerAudit.js`, `src/components/TickerDataAudit.jsx`
**Completed:** 2026-03-19

Implemented coverage baseline storage and change detection, integrated into the Audit tab.

1. **Baseline storage** (localStorage) — `saveCoverageBaseline()`, `loadCoverageBaseline()`, `clearCoverageBaseline()` with key `sa-coverage-baseline:{TICKER}`. Stores per-field snapshot: tag, layer, derived status, tier. Auto-saves on first load when no baseline exists.

2. **Coverage comparison** — `compareCoverage()` detects three types of changes:
   - **Fields gained**: present in current extraction but not in baseline (improvement)
   - **Fields lost**: present in baseline but not in current extraction (regression)
   - **Tags changed**: same field resolved by different tag/layer/derived status
   - Per-tier deltas (Tier 1/2/3 field count changes)

3. **Audit tab integration** — `checkCoverage()` now loads baseline, compares, auto-saves on first load, and includes delta in `coverageData`. Coverage monitor checks added: "Fields Gained" (pass), "Fields Lost" (fail if Tier 1, warn otherwise), "Tags Changed" (warn), or "No changes" (pass with baseline date).

4. **CoverageDashboard UI** — Three new sections:
   - **Changes panel**: Shows gained (+), lost (-), and changed (~) fields with tier badges, tag details, and strikethrough for removed/replaced tags. "Accept as New Baseline" button to reset.
   - **Tier delta indicators**: +/- numbers next to tier coverage percentages showing field count changes since baseline.
   - **Stable baseline bar**: Green confirmation bar when no changes detected, with "Reset Baseline" button and baseline date.

**Tests:** 19 tests in `src/engines/__tests__/coverageMonitor.test.js` covering:
- Baseline storage: save, load, clear, uppercase normalization, overwrite, ticker isolation
- Coverage comparison: no changes, gained fields, lost fields, tag changes, derived→direct changes, simultaneous gains/losses/changes, empty edge cases, baselineSavedAt
- Constants validation: FIELD_TIERS completeness, FIELD_LABELS coverage, critical field tier assignments

**Verification:** Full test suite passes (149 tests). Build compiles cleanly. S&P 500 coverage unchanged — Tier 1: 95.4%, Tier 2: 88.7%, Tier 3: 71.1% (expected: Phase 6 is monitoring-only, no extraction changes).

### Phase 7 — Layer 3: AI Tag Classification ✅ COMPLETE

**New files:** `src/engines/companyAdapter.js`, `src/data/sp500-tag-classifications.json`, `validation/scripts/build-tag-classifications.js`, `src/engines/__tests__/companyAdapter.test.js`
**Completed:** 2026-03-19

Implemented Layer 3 AI tag classification — pre-built S&P 500 tag classifications (Layer 3a) and runtime Claude API classification (Layer 3b) for companies outside the cache.

1. **Build script** (`validation/scripts/build-tag-classifications.js`) — Two-phase pipeline:
   - **Phase 1**: Scans all 503 S&P 500 companyfacts from SEC EDGAR (120ms rate limit, checkpoint every 50 companies). Discovers 6,284 unique orphan tags (us-gaap tags not in any L1+L2 taxonomy) with 10-K data in financial units.
   - **Phase 2**: Filters to 5,101 tags used by ≥2 companies (reduces noise from company-specific extensions), classifies via Claude Sonnet API in batches of 200. 26 API calls total, ~$1-1.50 total cost.
   - Output: `sp500-tag-classifications.json` with 1,989 classified tags (39% mapped, 61% null/supplemental).

2. **Pre-built classifications** (`sp500-tag-classifications.json`, 387KB) — Maps 1,989 orphan XBRL tags to standardized fields with section, unit, confidence, and negate metadata. Loaded at build time — zero API cost at runtime for S&P 500 companies.

3. **Runtime engine** (`src/engines/companyAdapter.js`) — Key exports:
   - `collectKnownTags(...taxonomyArrays)` → Set of all L1+L2 tag names
   - `findOrphanTags(companyFacts, knownTags)` → orphan tags with 10-K data in financial units
   - `getPreClassified(tag)` → pre-built classification lookup
   - `getLayer3Suggestions(companyFacts, missingFields, knownTags)` → sorted, deduplicated suggestions from pre-built cache
   - `classifyTagsViaAI(orphanTagNames, allFieldDefs)` → runtime Claude API classification for non-S&P 500 companies
   - `getLayer3SuggestionsWithAI(...)` → full pipeline: pre-built → AI cache → runtime AI
   - `saveAIClassifications` / `loadAIClassifications` → localStorage cache for runtime AI results

4. **Integration** into `edgarFinancials.js`:
   - Post-extraction gap-fill: after L1+L2 `extractSection()` calls, collects all known tags, identifies unresolved fields, gets Layer 3 suggestions, and extracts values using standard `extractAnnualFact` functions
   - Respects `splitSensitive` field flag (uses `extractAnnualFactOriginal` for split-sensitive fields)
   - Provenance tracks `layer: 3` with confidence metadata
   - Cache key bumped from `v5` to `v6`

5. **Coverage audit updated** (`validation/scripts/coverage-audit.js`) — Now checks Layer 3 classifications for fields where L1+L2 tags don't match. Measures true three-layer coverage.

**Tests:** 25 tests in `src/engines/__tests__/companyAdapter.test.js` covering:
- `collectKnownTags`: unique tag collection, null/undefined handling, empty inputs
- `findOrphanTags`: orphan discovery, 10-K filtering, financial unit filtering, null/empty edge cases, multi-unit tracking
- `getPreClassified`: known tag lookup, unknown tag → null, null-field classifications
- `getPreClassifiedCount`: count validation
- `getLayer3Suggestions`: missing field matching, already-resolved field exclusion, null-field exclusion, unit compatibility, highest-confidence dedup, empty inputs, confidence sorting, splitSensitive passthrough
- Provenance shape validation, edge cases (no us-gaap, empty units)

**Design notes:**
- Layer 3 is a **POST-extraction** step — it provides tag SUGGESTIONS that the caller extracts using standard functions. All extraction logic (version handling, splitSensitive, negate) stays centralized in `edgarFinancials.js`.
- The integration point is after `extractSection()` calls but before `buildStatements()` and `computeDerivedFields()`, so Layer 3 values feed naturally into the derivation pipeline.
- Pre-built classifications filter to tags with ≥2 company frequency to reduce noise from company-specific XBRL extensions.
- Layer 3b (full linkbase parsing) deferred — Layer 3a alone achieved significant coverage gains, and linkbase parsing adds complexity with diminishing returns.

**Verification:** Full S&P 500 coverage audit (503 companies, 0 failures):
- **Tier 1: 95.4% → 96.1%** (+0.7pp) — Modest gain because most Tier 1 fields were already well-covered
- **Tier 2: 88.7% → 90.8%** (+2.1pp) — Improved inventory, change-in-inventory, treasury_stock, lease fields
- **Tier 3: 71.1% → 83.9%** (+12.8pp) — Massive gain from Layer 3 catching expanded/detail fields that L1+L2 taxonomies don't cover

**Cumulative coverage progression:**
| Phase | Tier 1 | Tier 2 | Tier 3 |
|-------|--------|--------|--------|
| Phase 3 (Layer 2) | 92.3% | 82.7% | 64.3% |
| Phase 4 (Overlays) | 95.4% | 88.7% | 71.1% |
| Phase 7 (Layer 3 AI) | **96.1%** | **90.8%** | **83.9%** |

### Phase 8 — Validation Re-Run + Polish ⏭️ SKIPPED

Skipped — all Phase 8 deliverables were completed as part of Phase 7:
- Full S&P 500 audit re-run (503 companies, 0 failures) ✅
- Before/after comparison across all phases (cumulative table above) ✅
- Coverage audit script updated to include Layer 3 lookup ✅
- Remaining Tier 1 gaps identified as structural (non-dividend-payers, no ST debt, financials without CapEx) — not fixable through tag mapping ✅

**Remaining polish items** (deferred to future sessions via Flags section below):
- Tighten Audit tab coverage thresholds (Flag 9)
- Other flags as needed

---

## Key Design Decisions

| Decision | Choice | Reasoning |
|----------|--------|-----------|
| Layer 2 taxonomy loading | Pre-built JSON at build time (<100KB) | Zero runtime parse cost. Taxonomy changes once/year. |
| Layer 2 scope | Pre-computed lookup only (no runtime taxonomy fetch) | 99%+ coverage from pre-built. Edge cases handled by Layer 3. |
| Layer 2 versions | Current + prior 2 taxonomy versions | Handles historical filings with deprecated tags. |
| Industry model | Additive overlays on one master taxonomy | DRY — 95% of fields shared. Bug fix in one place. |
| Layer 3 design | AI tag classification first, linkbase parsing fallback | Companyfacts already has all tags. No filing download needed for 3a. |
| Layer 3 performance | Pre-classify S&P 500 at build time + batch runtime API | Eliminates API calls for 90%+ of researched companies. |
| Provenance data model | Parallel metadata object | Zero breaking changes to existing components. |
| AI safety | Confidence threshold (<80% → inferred) + sum-of-parts validation | Belt and suspenders against silent wrong data. |
| Split detection | Yahoo Finance (not XBRL heuristics) | XBRL-based detection fails on restated comparatives. |
| Sign convention | Fix in engine (`negate` flag), not display | All downstream consumers get correct values. |
| Derivation priority | Derive from existing fields before adding more tags | More robust — works regardless of XBRL tag variation. |

---

## Test Strategy

### Fixtures
- **Synthetic fixtures** for unit tests — small JSON objects with just the tags needed per test case. Fast, focused.
- **Real companyfacts snapshots** for integration tests — downloaded from SEC for AAPL (standard), JPM (bank), PLD (REIT), BRK-B (insurance), plus 2-3 worst-coverage companies from the audit.

### Key Test Groups

| # | What | Type | Key Assertions |
|---|------|------|---------------|
| 1 | Layer 1 extraction | Unit | Tag match → value returned; tag missing → null |
| 2 | Layer 2 lookup | Unit | Child tag found → resolved with weight; not found → null |
| 3 | Layer 3a AI classify | Unit | Confident match → cached; low confidence → "inferred"; API fail → null |
| 4 | Layer 3b linkbase parse | Unit | Valid XML → mapping; malformed → error caught |
| 5 | Three-layer fallback | Integration | L1 hit → skip L2/L3; all miss → null + provenance |
| 6 | Industry detection | Unit | Bank SIC → "bank"; unknown → "standard" |
| 7 | Bank overlay | Integration | JPM → NII field present |
| 8 | REIT overlay | Integration | PLD → FFO calculated |
| 9 | Provenance tracking | Unit | Direct tag → layer:1; derived → derived:true |
| 10 | Sum-of-parts validation | Unit | A=L+E passes → clean; mismatch → flagged |
| 11 | Coverage monitor | Unit | Same → no alert; drop → alert |
| 12 | Derivation fixes | Unit | liabilities derived from L&E-E; operating_income derived |

### Verification Gate
After each implementation phase, re-run `node validation/scripts/coverage-audit.js` and compare Tier 1 coverage against the baseline. Coverage progression: Layer 1 baseline → 92.3% (Phase 3/Layer 2 unchanged) → **95.4%** (Phase 4 industry overlays) → **95.4%** (Phase 5 UI-only, stable) → **95.4%** (Phase 6 monitoring-only, stable) → **96.1%** (Phase 7 Layer 3 AI). Note: Tier 1 didn't reach 99% because remaining gaps are structural (companies that genuinely don't report certain concepts — non-dividend-payers, companies without short-term debt, financials without CapEx). Tier 3 saw the biggest gain (+12.8pp to 83.9%).

---

## Deferred Work (TODOS.md)

### P2 — Direct XBRL/iXBRL Instance Document Parsing
Parse XBRL instance documents directly from EDGAR filings for real-time data (24-72hr delay eliminated). Build AFTER Layers 1-3 are production-stable. Layer 3 adapter work naturally leads into this.

---

## Reference Files

- `financial-data-comparison-rca.md` — 12-ticker RCA with fix plan
- `validation/reports/coverage-audit-results.md` — full S&P 500 field-level coverage report
- `validation/reports/coverage-audit-raw.csv` — per-company raw coverage data
- `validation/scripts/coverage-audit.js` — the audit script (rerun after fixes to measure improvement)
- `coverage-audit-prompt.md` — the prompt that generated the coverage audit script
- `~/.gstack/projects/stock-analyzer/ceo-plans/2026-03-18-xbrl-morningstar-engine.md` — CEO review decisions

---

## Review History

| Review | Date | Status | Mode |
|--------|------|--------|------|
| CEO Review (`/plan-ceo-review`) | 2026-03-18 | CLEAR | SCOPE EXPANSION |
| Eng Review (`/plan-eng-review`) | 2026-03-18 | CLEAR | FULL REVIEW |

Both reviews passed with 0 critical gaps and 0 unresolved decisions.

## Flags for Future Phases

1. ~~**Formula field format (Phase 5 — Audit Tab UI)**~~ ✅ RESOLVED 2026-03-19. Added `getDerivedFormula()` function in `edgarFinancials.js` with human-readable formula strings for all ~40 derived fields (income, balance, cash flow, and industry overlay). Wired into post-derivation provenance loop. Formula is now populated in `provenance[year][field].formula` for all derived fields.

2. ~~**TTM/Quarterly provenance (before Phases 5-7 — AI Report Generation)**~~ ✅ RESOLVED 2026-03-19. Modified `extractTTMSection()` to return `{ data, provenance }` tracking which XBRL tag resolved each TTM field (with Layer 1/2 detection). `computeTTM()` now builds full provenance with derived field detection (pre/post snapshot diff + formula strings). TTM result includes `provenance: { income, balance, cashFlow }`.

3. ~~**Dead tests in edgarFinancials.test.js (lines ~123-189)**~~ ✅ RESOLVED 2026-03-19. Added real assertions to all three `computeDerivedFields behavior` tests: working capital summation (verifies -500 = -500 + -200 + 300 + -100), SGA derivation (verifies 32B = 25B + 7B), and debt sanity check (verifies 34.2B derived from liabilities - known non-debt when total_debt/liabilities < 5%).

4. ~~**Layer 2 maxDepth tuning**~~ ✅ RESOLVED 2026-03-19. Research complete — bumping maxDepth to 3 would NOT help. Of 1,989 L3-classified tags with field mappings, only 32 (1.6%) overlap with L2's 1,528 tags. The remaining 1,957 (98.4%) are entirely outside the FASB calculation linkbase hierarchy — they're semantically related tags that AI maps to our fields, not depth-3 descendants. Examples: `CurrentFederalTaxExpenseBenefit` → `income_tax` (a component, not a calc child), `TreasuryStockValueAcquiredCostMethod` → `treasury_stock` (an alternative name). Layer 3 AI is the right tool for these; maxDepth=2 is sufficient for Layer 2.

5. **Overlay UI integration (deferred):** The `industryType` field is in `fetchEdgarStatements` results. The Audit Tab already shows industry type badge and overlay fields. Financials tab KPI cards for bank/REIT/insurance — deferred, not needed for current phase.

6. ~~**REIT FFO limitations**~~ ✅ RESOLVED 2026-03-19. Added detailed comment in `industryOverlays.js` REIT `computeDerived` documenting: gain_loss_on_real_estate_sales tag discontinued by many REITs after FY2018, FFO is approximate for recent years, AI reports should reference NAREIT-published FFO from earnings supplements.

7. ~~**Insurance float precision**~~ ✅ RESOLVED 2026-03-19. Added detailed comment in `industryOverlays.js` insurance `computeDerived` documenting: float is approximation from XBRL balance sheet items, BRK's float cannot be reconstructed from standard tags, pure-play insurers have better coverage, AI reports should cross-reference company-reported float.

8. **Overlay coverage audit (deferred):** The base S&P 500 coverage audit doesn't measure overlay field coverage. Could add overlay-specific audit for the ~30 bank/REIT/insurance companies — deferred, not blocking.

9. ~~**Tighten coverage thresholds**~~ ✅ RESOLVED 2026-03-19. Updated `tickerAudit.js` thresholds: Tier 1: 95%/85% (was 90%/75%), Tier 2: 85%/70% (was 80%/60%), Tier 3: 70%/50% (was 60%/40%).

10. ~~**FIELD_LABELS maintenance**~~ ✅ RESOLVED 2026-03-19. Added ~90 missing labels to `FIELD_LABELS` in `tickerAudit.js` covering: all bank overlay fields (17), all REIT overlay fields (16), all insurance overlay fields (19), master taxonomy expanded sub-items (PP&E breakdowns, receivables detail, cash sub-items, lease liabilities, etc.), all derived fields (working capital, invested capital, EBITDA, etc.), and cash flow detail fields (ST debt proceeds/repayments, lease payments, taxes/interest paid).

11. ~~**AFFO maintenance capex % is hardcoded**~~ ✅ RESOLVED 2026-03-19. Added TODO comment in `industryOverlays.js` REIT `computeDerived` documenting: AI reports should use user's maintenance capex % from Valuation Calculators (supports low/high ranges) instead of hardcoded 15%. Includes REIT subtype variation data (EQIX ~30-40%, PLD ~10-15%, healthcare ~20-25%). Hardcoded 15% remains as reasonable default for Financials/Audit tabs.

## Implementation Progress

| Phase | Status | Date | Notes |
|-------|--------|------|-------|
| Phase 1 — Layer 1 Tag Expansion | ✅ Complete | 2026-03-18 | 24 tests, tag lists expanded, derivation fixes |
| Phase 2 — Provenance Metadata | ✅ Complete | 2026-03-18 | 12 new tests (36 total), pre/post diff for derived detection |
| Phase 3 — Layer 2 Taxonomy JSON | ✅ Complete | 2026-03-18 | 23 new tests, 113 concepts → 1,937 descendant tags, 84KB JSON |
| Phase 4 — Industry Overlays | ✅ Complete | 2026-03-18 | 46 new tests, bank/REIT/insurance overlays, SIC classifier, derived metrics |
| Phase 5 — Audit Tab UI | ✅ Complete | 2026-03-19 | Coverage dashboard with tier bars, layer breakdown, field table, industry badges |
| Phase 6 — Coverage Monitor | ✅ Complete | 2026-03-19 | 19 tests, baseline storage, change detection (gained/lost/changed), auto-save, UI delta indicators |
| Phase 7 — Layer 3 AI Classification | ✅ Complete | 2026-03-19 | 25 tests, 1,989 classified tags, pre-built S&P 500 JSON + runtime AI, Tier 3 +12.8pp |
| Phase 8 — Validation + Polish | ⏭️ Skipped | 2026-03-19 | Completed as part of Phase 7; remaining polish in Flags section |
