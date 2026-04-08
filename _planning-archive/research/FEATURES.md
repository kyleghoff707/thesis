# Feature Landscape — Normalization Engine

**Domain:** SEC EDGAR XBRL financial data normalization (institutional-grade accuracy)
**Researched:** 2026-03-25
**Overall confidence:** HIGH — primary evidence drawn from this project's own 3-attempt engineering history, two completed accuracy benchmarks (86.4% annual, 92.8% quarterly), the 50-company Morningstar truth set, and documented failure patterns from B1-B8 phases. Commercial provider behavior inferred from the triangulation data the project already has (FMP, SimFin, mstarpy). Web search unavailable; training data supplements where noted.

---

## Context

This FEATURES.md is scoped to **the normalization engine milestone** — building multi-source triangulation to achieve 98%+ Morningstar parity across all US-listed equities. The "features" here are normalization system capabilities, not end-user UI features. The downstream consumer is the roadmap for this milestone.

**What already exists (not features to build):**
- Three-layer XBRL extraction engine (static tags + taxonomy hierarchy + AI classification)
- ~85 normalized fields with ~40 derived fields
- 50-company Morningstar truth set with accuracy test suite (87 fields mapped)
- Current accuracy: 86.4% annual, 92.8% quarterly against Morningstar
- API connections to FMP, SimFin, mstarpy, Yahoo Finance all working
- Existing validation pipeline (bundle.mjs + export-financials.mjs + Python comparison scripts)

**What this research is informing:** what additional normalization features are table stakes for institutional-grade accuracy vs what differentiates the engine vs what to explicitly not build.

---

## What "Institutional Grade" Means in This Context

Commercial data providers (Morningstar, FactSet, Bloomberg, S&P Capital IQ) define the standard. Key observable behaviors, all verified by this project's own comparison data:

- **Morningstar** uses restated values (latest 10-K comparative data), applies fiscal year labels by calendar year the FY ends (shifts non-Dec FY companies +1 from EDGAR's convention), reports in full dollars, applies consistent sign conventions per statement type (expenses negative on IS, most items positive on CF), and derives ~40 "Other" fields as residuals from subtotals.
- **FMP** normalizes from the same EDGAR XBRL source. 100% accuracy on AAPL. Uses `fiscalYear` labels (same calendar-year convention as Morningstar). Returns full dollars with camelCase field names.
- **SimFin** traces every value to its source filing. Uses separate templates for banks and insurance. Returns full dollars.
- **The gap to close:** 13.6% of field-company-years still differ materially from Morningstar after B1-B8. The failure patterns are documented (intangibles 149 failures, accrued liabilities 143, residual "Other" fields ~500+, operating income 49).

---

## Table Stakes

Features that must exist for the engine to be institutional-grade. Missing = data is not trustworthy for investment analysis.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Fiscal year alignment** | Every data source labels periods differently. EDGAR uses `fy` field (company's stated FY). Morningstar and FMP label by calendar year the FY ends. Companies with non-Dec FY (LULU Jan, NKE May, COST Aug, NVDA Jan, AAPL Sep) generate systematic off-by-one mismatches. Observed in this project: LULU went from 1.9% → 19.2% match after alignment fix. This is the single most common accuracy failure for multi-source comparison. | Med | EDGAR `entityFiscalYearEnd` from CompanyFacts is the canonical source. Build deterministic FY-end resolver, not bidirectional offset guessing. ~200-300 LOC. Affects every comparison against every external source. |
| **Sign convention normalization** | Morningstar: expenses are negative on IS (Cost of Revenue = -$210B), most CF items are positive. EDGAR XBRL: expenses are positive (Cost of Revenue = +$210B). FMP: CapEx is negative, EDGAR is positive. Every source differs. Without explicit sign multipliers per field per source, comparison is meaningless. Observed: `"MS negative, XBRL positive"` appears in 15+ field-mapping.json entries for income and balance fields. | Low-Med | Universal sign convention table per source per field. Already partially exists for Morningstar in `field-mapping.json`. Must extend to FMP, SimFin, mstarpy. ~100 LOC for the normalizer + config JSON. |
| **Scale normalization** | mstarpy returns values in millions. FMP and SimFin return full dollars. EDGAR returns full dollars. Without scale normalization, mstarpy comparisons are off by exactly 1,000,000x. Already an observed failure in this project ("mstarpy 34.4% match rate" was partly because of scale issues). | Low | Per-source scale multiplier (mstarpy: ×1e6, others: ×1). ~50 LOC. |
| **Field name mapping (universal)** | Each source uses different names for the same concept: FMP `netIncome`, SimFin `Net Income`, Thes1s `net_income_loss`, Morningstar `Net Income after Non-Controlling/Minority Interests`. Without a canonical mapping table, every comparison requires ad-hoc string matching. The existing Python comparison scripts had bugs in field name mapping that corrupted accuracy scores. | Med | Universal field mapping JSON: all sources → Thes1s canonical field names. ~300-400 LOC + config JSON. One file to maintain, not per-source scripts. |
| **Accounting identity validation** | Assets = Liabilities + Equity (±1% tolerance for mezzanine equity/NCI). Gross Profit = Revenue - COGS. Operating CF + Investing CF + Financing CF ≈ Change in Cash. Net Income ≈ Pre-Tax Income - Tax (±5% for discontinued ops). This is Layer 1 self-validation — catches extraction bugs before they reach comparison. Already implemented (98.0% identity pass rate), but must remain green after any normalization changes. | Low | Already built in `validation.js`. Must add to regression test suite to verify no new violations after each fix. |
| **Completeness tracking (null vs zero)** | A missing value (null) and zero revenue are different things. Long-term debt null = zero-debt company (not a gap). Revenue null = extraction failure (a real gap). Completeness tracking per field per company enables proper gap analysis. Already implemented at 94.7% on 13 critical fields, but needs extension to all 87 mapped fields for triangulation. | Med | Per-field null/missing classification rules. Some fields (long_term_debt, dividends) are legitimately null for certain company types. |
| **Data provenance on every value** | Every extracted value should carry: which XBRL tag resolved it, which layer (1/2/3), whether derived, the derivation formula if applicable, and for triangulation — which external sources agree/disagree. Already exists for annual and TTM extraction. Must extend to the comparison pipeline. Institutional data systems (Bloomberg, FactSet) maintain full lineage for audit. | Med | Already built in parallel provenance metadata structure. Extend comparison pipeline to attach source-agreement metadata: `{ thesisValue, fmpValue, simfinValue, mstarpyValue, consensus, deviation }`. |
| **Tolerance-tiered accuracy scoring** | Not all fields have the same materiality. Revenue and Net Income mismatches >1% matter. "Other Noncurrent Assets" mismatch >10% may be acceptable. Institutional providers tier their accuracy thresholds the same way: Morningstar has strict tolerance for scoring-critical fields, relaxed for sub-classifications. Already implemented (exact/close/approximate/relaxed/informational tiers in `field-mapping.json`). Must remain consistent as new fields are added. | Low | Already built. Maintain the 5-tier tolerance system. Add tier-specific pass/fail reporting to the comparison dashboard. |
| **Restated vs as-filed distinction** | Morningstar uses restated numbers (the latest 10-K's comparative data — what the company itself restated to). Our engine already extracts restated values via XBRL `fy` + latest filing date. FMP also uses restated. SimFin provides both. The distinction matters because a company that restates earnings backward creates a discrepancy if you compare their original 10-K against the latest restatement. This is already implemented but must be documented as a design decision in the comparison pipeline. | Low | Already correct in engine (v7 cache uses latest filing). Document explicitly in comparison harness as a config option (`useRestated: true`). |
| **YoY sanity checks** | Revenue change >50%, asset change >100%, equity sign flip, share count change >20%. These flag M&A events, spinoffs, and data anomalies before they corrupt accuracy scores. Already implemented in Layer 1 validation as informational flags. Must extend to the triangulation pipeline to auto-label outlier deviations (is this a data bug or a real corporate event?). | Low | Already built as flags. Add to triangulation output to distinguish `DEVIATION: data_bug` from `DEVIATION: corporate_event`. |

---

## Differentiators

Features that would push the engine beyond parity with commercial providers to become genuinely superior.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Multi-source triangulation consensus engine** | When FMP + SimFin + mstarpy agree and Thes1s doesn't, that's a normalization bug with high confidence. When sources disagree among themselves, it's a methodology difference. This distinction is what Attempt #3 is built on. No open-source engine does this. Commercial providers use internal human review; this achieves the same outcome algorithmically. | High | Consensus scorer: for each field/year/company, collect all available source values, compute consensus (median or mode within 1%), classify Thes1s deviation as: `OUR_BUG` (consensus exists, we differ), `METHODOLOGY_DIFF` (sources disagree), or `COVERAGE_GAP` (all null). Each category has a different fix path. ~400-500 LOC. |
| **Root cause tagger for systematic failure patterns** | The project's own B1-B8 analysis identified named failure patterns: sign flip, FY offset, scale error, XBRL tag miss, derivation error, ROU asset inclusion inconsistency, investment component summation, accrued liabilities circular dependency. Auto-classifying deviations by known pattern means a new company that hits an old pattern gets fixed automatically without manual investigation. | High | Pattern library of known failure modes with recognition rules. New deviations get auto-tagged if they match a known pattern. Reduces manual RCA work from hours to minutes per company. ~200 LOC + pattern config JSON. |
| **Residual "Other" field computation (when safe)** | The five "Other" fields (other_financing, other_investing, other_income_expense, other_noncash_items, change_in_other_working_capital) account for ~500 of the remaining DIFFs. They can't be computed as residuals until named items are accurate enough (B7 was attempted twice and reverted both times due to error amplification). The differentiator is knowing when the precondition is met: named items coverage ≥ 95% for a given company-year before enabling residual computation for that record. | High | Per-record precondition checker: verify named item completeness before computing residuals. Not a global toggle — a per-company-per-year gate. Expected to fix 400-500 DIFFs once upstream tag coverage is sufficient. Complex because the precondition check itself requires knowing which named items are complete. |
| **Per-company XBRL tag inspection for structural failures** | The three hardest failure categories — intangibles (149 DIFFs / 35 companies), accrued liabilities (143 DIFFs / 31 companies), D&A for acquisition-heavy companies (62 DIFFs / 8 companies) — require inspecting what specific XBRL tags each company actually uses in their filing vs what Morningstar sums. This is the "manual review" that commercial providers do with human analysts. An automated tag inspector that reads a company's XBRL filing and matches sub-tags to Morningstar's totals could achieve this systematically. | Very High | Automated XBRL instance document inspection for specific companies. Compare the company's reported XBRL tag set against our taxonomy to find which tags we're missing. This is equivalent to what Morningstar's data analysts do manually. High cost, high reward: fixes the hardest 13% of remaining failures. Likely Phase 3+ work, not the comparison harness milestone. |
| **Industry-specific normalization overlays validated against truth set** | The engine already has bank/REIT/insurance overlays. But they haven't been validated against Morningstar's actual bank and REIT normalizations (the 50-company truth set has BRK-B, JPM, WFC, MET). The differentiator is running the comparison harness against financial sector companies and tuning the overlay fields to match Morningstar's definitions for NII, deposits, efficiency ratio, FFO, NAV, combined ratio, etc. | Med-High | Extend field mapping with financial sector fields. Run comparison for BRK-B, JPM, WFC, MET (already in truth set). Expected to surface 20-30 financial-sector-specific failures not yet measured. Requires relaxed tolerance for revenue/debt definitions per the existing test design. |
| **Regression protection with baseline diffing** | Every engine fix should be verified against the full 50-company truth set, not just the target company. Already proven necessary: B5 PP&E fix improved -111 failures but introduced 49 new ones (ROU inconsistency). Without automatic baseline diffing, improvements in one area can mask regressions in another. The differentiator is the regression reporter: shows not just current accuracy but "fields gained/lost since last run" per company. | Med | Baseline snapshot storage (already exists in coverage monitor for the app). Add comparison pipeline equivalent: `run-triangulation.mjs --diff baseline.json` that shows which fields improved and which regressed. ~100 LOC. |
| **S&P 500 scale validation (not just 50-company truth set)** | The 50-company truth set is valuable but may not generalize. The three-layer XBRL engine was validated across all 503 S&P 500 companies. The normalization accuracy should be validated at the same scale — not full truth comparison (no data) but at minimum structural validation (accounting identities, completeness) across all 503. This is the bridge between "passes 50-company test" and "production ready for all US equities." | Med | Run Layer 1 self-validation (accounting identities + completeness) across S&P 500 after each major fix. This is what the existing `Validation.jsx` in-browser runner does — export results as a stability gate. |
| **Executive compensation normalization** | SEC DEF 14A proxy statement parsing is the hardest normalization problem in the project. 27 of 30 audited companies had at least one bug. 11 systemic bugs identified (column misalignment, name/title concatenation, duplicate entries, HTML entity decoding, footnote artifacts, director detection gaps, XBRL fallback failures). FMP has good compensation data as a validation reference. The differentiator is treating compensation normalization with the same rigor as financial statement normalization — field mapping, sign conventions, comparison against FMP as ground truth. | High | This is the compensation engine bug fix plan (gstack-compensation-engine-bugfix-eng-plan-20260321.md) plus a FMP comparison layer. The 11 bugs are already specified with fix implementations. Secondary priority behind financial statement accuracy, but needed before AI report generation can reference compensation data reliably. |

---

## Anti-Features

Features that seem useful but would actively harm the engine's quality or maintainability.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Python for comparison logic** | Maintaining two-language field mapping systems is the documented root cause of previous accuracy measurement bugs. Python `layer2_statements.py` and `layer3_metrics.py` had bugs in fiscal year alignment, field name mapping, and sign conventions — the same bugs that exist in the JS engine. Two languages = two places to get the same answer wrong differently. | All comparison/normalization logic in JavaScript (Node.js). mstarpy Python subprocess bridge only for data fetching — never for computation. |
| **SQLite or PostgreSQL for comparison results** | The dataset is ~500 companies × 87 fields × 5 years = ~217K data points. This fits comfortably in memory and as JSON files. A database adds deployment complexity (drivers, migrations, setup) to a local desktop app's validation pipeline with zero benefit at this scale. JSON files are human-readable and git-diffable for debugging. | JSON file caching per source per ticker. In-memory processing for comparison. Only use a database if the dataset grows 10x (very unlikely). |
| **More external data sources beyond FMP + SimFin + mstarpy** | The project already has four sources (FMP, SimFin, mstarpy, Yahoo). Adding calcbench, Intrinio, Polygon, or AlphaVantage adds API cost and maintenance burden without proportional accuracy gains. Three sources agreeing is sufficient for high-confidence consensus. A fourth source rarely resolves disagreements between three — it just adds noise. | Fix normalization rules based on three-source consensus, then eliminate paid sources (FMP + SimFin = $35/mo) once rules are solid. The goal is to NOT need them long-term. |
| **Real-time or streaming normalization** | This is a historical research data problem. The engine normalizes 5-10 years of annual data. Adding streaming or real-time pipelines creates latency constraints and infrastructure complexity that serve zero use cases for Rule One research. | Batch normalization on demand. Cache results. Refresh on new 10-K filings (annual event). |
| **International equities (IFRS)** | XBRL taxonomy for IFRS is fundamentally different from US-GAAP. RACE (Ferrari) is already excluded from the truth set. International companies file on different schedules, in different currencies, with different accounting standards. Solving IFRS normalization is a separate multi-year project. | Scope: US-listed equities only. EDGAR US-GAAP filings. No IFRS, no foreign private issuers, no OTC with non-standard filings. |
| **OTC penny stocks** | Sub-exchange OTC companies often file with EDGAR but their XBRL quality is poor (missing tags, non-standard taxonomies, irregular filing patterns). The normalization failures for OTC would be structural — not fixable with better tag mapping. | Focus on exchange-listed equities. The 5,758 Thes1s-classified companies are the target universe — these are all exchange-listed with quality EDGAR filings. |
| **Quarterly normalization before annual is at 98%** | The quarterly engine already reached 92.8% accuracy. But quarterly normalization depends on the same taxonomy and derivation logic as annual. Optimizing quarterly-specific edge cases before annual reaches 98% creates a shared-code maintenance problem: fixes that help quarterly may hurt annual and vice versa. | Get annual to 98% first. Then run quarterly accuracy suite as a regression check. Apply quarterly-specific fixes only after annual is stable. |
| **Automated scraping of Morningstar premium data** | mstarpy is a fragile Python scraper that accesses morningstar.com without an official API. It works now but could break at any SEC filing cycle change or Morningstar frontend update. Building normalization rules that depend on continuous mstarpy access creates a dependency on a scraper that could disappear overnight. | Use mstarpy to BUILD the normalization rules (what MS does), then eliminate the dependency once rules are solid. The 50-company truth set (CSV files) is the durable reference, not live mstarpy access. |
| **D3/Chart.js accuracy trend visualization** | Accuracy trends are useful for understanding progress, but console output and JSON diffs are sufficient for the validation pipeline. Adding a visualization layer before the normalization rules are stable wastes engineering time on tooling instead of fixes. | Console reporter + JSON output. If visualization is needed, the app already has Recharts for when this is surfaced to users. |
| **Automated fix application** | The temptation is to have the triangulation engine automatically apply fixes to `edgarFinancials.js` when it detects a deviation pattern. This would be dangerous — automated changes to financial normalization rules could introduce regressions across the full S&P 500 without a human reviewing the tradeoff. | Human-in-the-loop for all fix decisions. Triangulation identifies and classifies. Engineer (or user + Claude) decides whether to fix, and re-runs the full test suite to confirm. |

---

## Feature Dependencies

```
Fiscal year alignment engine
  └──> All multi-source comparisons (without it, off-by-one year contamination)

Sign convention normalizer
  └──> All comparisons vs external sources (without it, 2× errors on expense fields)

Scale normalizer
  └──> All comparisons vs mstarpy (without it, 1e6× errors on every field)

Universal field mapping (JSON config)
  └──> FMP collector
  └──> SimFin collector
  └──> mstarpy bridge
  └──> Triangulation engine (all inputs must be in canonical field names)

Data collectors (FMP + SimFin + mstarpy + thes1s)
  └──> Triangulation consensus engine

Triangulation consensus engine
  └──> Root cause tagger (classifies: OUR_BUG vs METHODOLOGY_DIFF vs COVERAGE_GAP)
  └──> Deviation reporter (console + JSON)
  └──> Regression diffing (compare vs baseline)

Root cause tagger results
  └──> Engine fixes in edgarFinancials.js
  └──> Field mapping updates in field-mapping.json

Full engine fix cycle (collectors → normalization → triangulation → report → fix → re-run)
  └──> 98% accuracy on 50-company truth set
  └──> 98% accuracy on S&P 500 (Layer 1 structural validation scale-up)
  └──> Elimination of paid sources (FMP + SimFin) once rules are stable

Residual "Other" computation
  └──> REQUIRES named item coverage ≥ 95% per company-year (precondition gate)
  └──> REQUIRES stable named items (no ongoing regressions)

Financial sector overlay validation
  └──> REQUIRES base financial statement accuracy ≥ 98% for standard companies first
  └──> Uses existing bank/REIT/insurance overlay infrastructure

Executive compensation normalization
  └──> Can proceed in parallel with financial statement accuracy work
  └──> Uses FMP compensation data as ground truth (separate from financial statement FMP)
```

**Critical path:** FY alignment + sign convention + field mapping → collectors → triangulation → root cause analysis → engine fixes → re-run. Everything else is downstream or parallel.

---

## Field Coverage by Category

Based on the 87 mapped fields and 588 unmapped in the current truth set, here is how field coverage maps to normalization work:

### Already Accurate (>93% match rate, table stakes maintained)

| Category | Fields | Status |
|----------|--------|--------|
| Core income statement | Revenue, Net Income, EPS (basic + diluted), Tax, Pretax Income, Operating Income | 93-96% match — maintain |
| Core balance sheet | Total Assets, Total Equity, Cash, Current Assets, Current Liabilities, Retained Earnings | 93-95% match — maintain |
| Core cash flow | Operating CF, CapEx, Dividends Paid | 93-94% match — maintain |
| Per-share metrics | Diluted Shares, Basic Shares, Dividends Per Share | 92-94% match — maintain |

### Active Accuracy Targets (need improvement to reach 98%)

| Category | Fields | Challenge |
|----------|--------|-----------|
| Balance sheet sub-items | PP&E net/gross (49 failures), Intangibles (149), Accrued Liabilities (143), Finance Lease Liabilities, Other Noncurrent Assets/Liabilities | Tag coverage + definition boundary work |
| Cash flow sub-items | D&A (62), Sale/Purchase of Investments (36), Net Change in Cash (75), Ending Cash Position | Tag variants + restricted cash inclusion |
| Residual "Other" fields | Other Financing (136), Other Investing (133), Other Income/Expense (93), Other Noncash Items (52), Other Working Capital | Blocked by named item accuracy; fix upstream first |
| IS sub-items | Operating Income (49) | Definitional mismatch (MS vs XBRL "operating") |

### Unmapped (out of scope for this milestone)

| Category | Count | Why Unmapped |
|----------|-------|--------------|
| Financial sector specific (NII, deposits, premiums, claims) | ~50 fields | Industry overlays exist but not in core field mapping |
| Balance sheet schedules (maturity buckets, pension detail) | ~200 fields | Sub-breakdowns of core fields |
| Supplemental disclosures | ~150 fields | Not needed for Rule One scoring |
| Segment reporting | ~100 fields | Company-specific, not normalizable |
| Off-balance-sheet items | ~88 fields | Qualitative, not XBRL-tagged |

---

## MVP Recommendation

**Phase 1 (Fix the measurement instrument):**
1. Fiscal year alignment engine (deterministic FY-end resolver)
2. Universal sign convention normalizer (per source per field)
3. Scale normalizer (mstarpy ×1e6)
4. Universal field mapping JSON (all sources → canonical)
5. Rebuild comparison harness in JS (retire Python scripts)

Rationale: Can't improve what you can't accurately measure. Current test harness bugs are reporting wrong scores.

**Phase 2 (Triangulate and identify true gaps):**
1. FMP collector + SimFin collector (JS, with caching)
2. mstarpy Python subprocess bridge
3. Triangulation consensus engine (3-source agreement scorer)
4. Root cause tagger (OUR_BUG vs METHODOLOGY_DIFF vs COVERAGE_GAP)
5. Console + JSON reporter with regression diffing

Rationale: With accurate measurement, find the remaining ~1,600 real bugs (not harness artifacts).

**Phase 3 (Fix the engine — guided by triangulation):**
1. Named item tag coverage fixes (intangibles, accrued liabilities, D&A variants)
2. Residual "Other" computation with precondition gate
3. Financial sector overlay validation (BRK-B, JPM, WFC, MET)
4. Regression protection via baseline diffing

Rationale: Fix what the triangulation identified as consensus mismatches (our bugs, not methodology differences).

**Phase 4 (Scale up and validate):**
1. S&P 500 Layer 1 structural validation at scale
2. Per-company XBRL tag inspection for the hardest remaining failures (intangibles, accrued liabilities)
3. Executive compensation normalization (compensation engine bug fixes + FMP comparison)

**Defer:**
- OTC stocks, international equities, IFRS
- Quarterly normalization optimization (annual first)
- Real-time or streaming data
- Visualization tooling

---

## Sources

- Codebase — primary evidence:
  - `gstack/plans/gstack-xbrl-annual-normalization-eng-plan-20260319.md` — Phase B B1-B8 results (86.4% final accuracy, failure pattern breakdown, root cause analysis)
  - `gstack/plans/gstack-xbrl-quarterly-validation-eng-plan-20260320.md` — 92.8% quarterly accuracy, systematic failures
  - `validation/validation-summary-2026-03-10.md` — Layer 1/2/3 validation (89 companies, 82.0% within 5% on yfinance)
  - `src/engines/__tests__/fixtures/morningstar/field-mapping.json` — 87 mapped fields with sign multipliers, 588 unmapped, tolerance tiers
  - `gstack/plans/gstack-compensation-engine-bugfix-eng-plan-20260321.md` — 11 compensation engine bugs, 27/30 companies affected
  - `.planning/PROJECT.md` — Attempt #3 strategy, data source table, triangulation approach
  - `.planning/research/STACK.md` — All-JS pipeline decision, FMP/SimFin/mstarpy integration, comparison architecture
- Training data (MEDIUM confidence):
  - Commercial provider behavior (Morningstar restated convention, FactSet sign conventions, Bloomberg field coverage) — confirmed against this project's empirical FMP/mstarpy comparison data
  - XBRL US-GAAP taxonomy structure — training data, confirmed against existing taxonomy-hierarchy.json (1,937 tags)
