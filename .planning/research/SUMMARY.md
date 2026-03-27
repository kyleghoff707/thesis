# Project Research Summary

**Project:** Thes1s Normalization Engine — Multi-Source Triangulation
**Domain:** SEC EDGAR XBRL financial data normalization (institutional-grade accuracy)
**Researched:** 2026-03-25
**Confidence:** HIGH (grounded in two prior failed attempts, 50-company Morningstar truth set, 1,894 residual DIFF root cause analysis, and real production engine code)

---

## Executive Summary

The Thes1s normalization engine already extracts ~85 standardized financial fields from SEC EDGAR XBRL data using a three-layer tag resolution strategy. Current accuracy against the 50-company Morningstar truth set is 86.4% annual / 92.8% quarterly — solid but not institutional grade. Attempts #1 and #2 both hit ceilings: Attempt #1 optimized for tag coverage (96.1%) which turned out to be weakly correlated with value accuracy; Attempt #2 reached 91% Morningstar match rate but couldn't distinguish "our engine is wrong" from "Morningstar made a quirky normalization choice." Attempt #3 — the current milestone — breaks through that ceiling by adding three independent data sources (FMP, SimFin, mstarpy) and comparing them all simultaneously. When 3 out of 4 sources agree and our engine disagrees, that is a normalization bug with high confidence. When sources disagree among themselves, it is a definitional ambiguity, not a fixable bug.

The recommended approach is a 6-stage pipeline: Fetch raw data per source, Align fiscal years by period-end date, Map field names and sign conventions to a canonical standard, Score with 4-way comparison and consensus detection, Aggregate cross-company patterns, and Derive actionable engine fixes. The entire pipeline is JavaScript (Node.js) with a single exception: mstarpy has no JavaScript equivalent, so a thin Python subprocess bridge fetches that data only. This single-language discipline eliminates the class of bugs from Attempt #2, where parallel Python and JavaScript field mapping tables each contained independent errors that compounded. The pipeline is disk-based and resumable at any stage — essential given FMP's 250 calls/day limit.

The primary risks are infrastructure bugs masquerading as normalization bugs. Fiscal year misalignment, sign convention differences, and scale errors (mstarpy returns values in millions) produce hundreds of false failures if not solved before any triangulation work begins. The lesson from prior attempts is explicit: fix the measurement instrument before trying to improve the engine. Phase 1 must produce a comparison harness that is provably correct on the 9 non-December fiscal year companies (LULU, NVDA, NKE, COST, etc.) before any engine changes are made.

---

## Key Findings

### Recommended Stack

Keep the existing JavaScript pipeline; extend it. The engine under test IS `edgarFinancials.js`, the bundler already compiles it for Node.js, and the vitest test suite already has 173+ tests. Introducing Python for comparison logic (as the previous `layer2_statements.py` and `layer3_metrics.py` did) requires maintaining duplicate field mappings, sign convention tables, and fiscal year alignment logic — the exact source of previous accuracy measurement bugs. No new npm dependencies are required for the comparison pipeline.

**Core technologies:**
- **vitest 4.1.0 (installed):** Test runner for the accuracy suite — already used, parallel execution, structured reporting, no new dependency.
- **esbuild (installed via vite):** Bundles browser-side `edgarFinancials.js` for Node.js execution — already working via `bundle.mjs`, handles `import.meta.env` shimming.
- **Node.js native fetch (built-in):** HTTP client for FMP, SimFin, EDGAR APIs — already proven in existing validation scripts, zero new dependencies.
- **FMP API (direct fetch):** Normalized financial statements from the same EDGAR XBRL source — 100% accuracy on AAPL, uses restated data, $20/mo, 300 calls/min.
- **SimFin API (direct fetch):** 83% accuracy on AAPL, traces every value to its source filing, separate bank/insurance templates — $15/mo, 5 req/sec.
- **mstarpy via Python subprocess bridge:** The ground-truth source (Morningstar) — no JS equivalent exists, returns values in millions (must multiply by 1e6), fragile scraper (treat as oracle not runtime dependency).
- **yahoo-finance2 (installed):** Supplementary validation, max 4-year history — useful as tie-breaker, already in use throughout the app.

### Expected Features

**Must have (table stakes for comparison harness to be trustworthy):**
- **Fiscal year alignment engine** — deterministic FY-end resolver using EDGAR `entityFiscalYearEnd`, aligning all sources by period-end date not year label. Affects 18% of the 50-company truth set (9 non-Dec FY companies).
- **Sign convention normalizer** — per-source per-field sign multiplier table (4×87 matrix). Morningstar: expenses negative. XBRL/FMP: expenses positive. SimFin: mixed. Without this, ~30% of financial fields show false mismatches.
- **Scale normalizer** — mstarpy returns millions; all others return full dollars. Blanket 1e6 for financial fields, 1.0 for per-share fields.
- **Universal field mapping (JSON config)** — all sources mapped to canonical Thes1s field names in a single config file, not per-source scripts.
- **Data collectors per source** — thin JS wrappers (~80-150 LOC each) that fetch and cache raw API responses to disk. Fetchers preserve source-native format and handle rate limiting only.
- **Triangulation consensus engine** — 4-way comparison with classification: CONSENSUS_MATCH, CONSENSUS_DIFF (our bug), THESIS_AGREES_PARTIAL, ALL_DISAGREE (definitional), THESIS_MISSING (coverage gap).
- **Root cause tagger** — auto-classifies deviations into known patterns: sign flip, FY offset, scale error, XBRL tag miss, derivation error. Reduces manual RCA from hours to minutes.
- **Console + JSON reporter with regression diffing** — shows not just current accuracy but fields gained/lost since last run.
- **Accounting identity validation maintained** — Assets = Liabilities + Equity, Gross Profit = Revenue - COGS, etc. Currently 98% pass rate; must remain green after any fix.

**Should have (differentiators that push beyond Attempt #2's ceiling):**
- **Residual "Other" field computation with precondition gate** — computes other_financing, other_investing, other_income_expense as residuals from totals, but ONLY when named item coverage for that company-year is ≥95%. B7 in Attempt #2 was reverted twice because residual computation without the precondition gate produced 500x wrong values.
- **Industry-specific cohort accuracy reporting** — separate accuracy reporting for standard companies, banks, REITs, and insurance. Financial sector companies have definitionally different "Revenue" and "Operating Income" across sources.
- **Per-company XBRL tag inspection for structural failures** — automated inspection of which tags a specific company actually uses in their filing vs what the taxonomy covers. Addresses the hardest 13% of remaining failures: intangibles (149 DIFFs / 35 companies), accrued liabilities (143 DIFFs / 31 companies).
- **S&P 500 Layer 1 structural validation at scale** — accounting identity checks across all 503 S&P 500 companies after each major fix, not just the 50-company truth set.

**Defer (explicitly out of scope for this milestone):**
- OTC stocks, international equities (IFRS is a separate multi-year problem; RACE already excluded from truth set).
- Quarterly normalization optimization (annual must reach 98% first; premature quarterly tuning introduces regressions in shared code).
- Visualization tooling — console + JSON reports are sufficient until rules are stable.
- Automated fix application — too risky; triangulation identifies, engineer decides.
- Executive compensation normalization — can proceed in parallel but is not on the critical path to 98% financial statement accuracy.

### Architecture Approach

The pipeline decomposes into 6 stages with single responsibilities and clean disk-based interfaces between each. Each stage reads from `validation/data/{stage}/` and writes to the next stage's folder, making the pipeline resumable after any failure and independently testable at each boundary. The feedback loop is: run Stages 1-6 to generate `fix-recommendations.json`, apply fixes to `edgarFinancials.js`, re-run only the Thes1s fetcher (Stage 1), then re-run Stages 2-6 to measure improvement. This iterative cycle is what drove B1-B8 in Attempt #2 — the difference in Attempt #3 is having 3 additional sources to distinguish "our bug" from "Morningstar's quirk."

**Major components:**
1. **Fetch layer** (`validation/collectors/`) — per-source data fetchers with disk caching, rate limiting, and source-native output format. One JSON file per ticker per source.
2. **Fiscal year aligner** (`fiscalAligner.mjs`) — resolves all four sources to a canonical fiscal year convention using EDGAR's FY designation. Validates alignment via revenue cross-check: >1% revenue divergence after alignment means the alignment is wrong.
3. **Field mapper** (`fieldMapper.mjs` + `mappings/*.json`) — applies field name mapping, sign convention normalization, and scale conversion. All downstream processing uses canonical Thes1s field names in full dollars with consistent signs.
4. **Comparator and scorer** (`comparator.mjs`) — 4-way comparison with tolerance-tiered classification. Consensus weight: mstarpy=1.0 (Morningstar gold standard), FMP=0.9 (100% AAPL match), SimFin=0.7 (83% AAPL match).
5. **Aggregator** (`aggregator.mjs`) — cross-company pattern detection, failure clustering by root cause type (tag coverage gap vs sign error vs derivation bug vs definitional mismatch), industry cohort breakdown.
6. **Rule deriver** (`ruleDeriver.mjs`) — converts aggregate findings into: taxonomy fixes for `edgarFinancials.js`, per-company XBRL tag overrides, and tolerance reclassifications in `field-mapping.json`.

### Critical Pitfalls

1. **Fiscal year label misalignment** — ~18% of the truth set has non-December fiscal years (LULU Jan, NVDA Jan, NKE May, COST Aug). Each source uses a different labeling convention. Comparing "FY2024" labels across sources produces 100% false failures for these companies. Fix: align by period-end date, not year label. Build and validate this first. Acid test: all 9 non-Dec FY companies must show >99% revenue agreement after alignment before any other comparison work begins.

2. **Sign convention mismatches** — XBRL and FMP report expenses as positive; Morningstar and SimFin report them as negative. This produces a 200% false DIFF where the actual difference is zero. ~30% of financial fields are affected. Fix: per-source per-field sign multiplier table built as source adapters, not applied in comparison logic. Build a sign convention test suite: for each field, assert all source adapters produce the same sign for AAPL 2024.

3. **Optimizing tag coverage instead of value accuracy** — the lesson from Attempt #1. 96.1% coverage masked 79.5% value accuracy. Worse, Layers 2 and 3 were actively producing wrong values: disconnecting them improved accuracy from 79.5% to 83.7%. Fix: never use tag coverage as an optimization target. Track value accuracy against truth set. Report per-field accuracy by category, not just aggregate.

4. **Derived field error amplification** — B7 turned 62-failure fields into 204-failure fields by computing "Other" residuals before named items were accurate. Residual computation amplifies all upstream errors (subtraction of two large similar numbers magnifies relative error). Fix: validate source fields before derived fields; never enable residual "Other" computation without the ≥95% named item precondition gate; use derivation depth as a sort key for failures.

5. **Morningstar inconsistency treated as engine bugs** — MS includes ROU assets in PP&E for some years but not others for the same company. A "fix" to match MS's majority convention introduced 49 new mismatches for years where MS excludes ROU. Fix: triangulate against FMP and SimFin; when MS is the lone outlier, document as MS_INCONSISTENT rather than applying a fix. Build a consensus truth from 3+ source agreement.

---

## Implications for Roadmap

Based on research, the critical path is: fix the measurement instrument first, then use it to find real bugs, then fix the engine, then scale up validation. Every prior attempt that skipped Phase 1 infrastructure ended up chasing phantom bugs produced by harness errors.

### Phase 1: Comparison Harness Infrastructure

**Rationale:** Cannot improve the engine until the measurement tool is provably correct. Fiscal year alignment, sign conventions, field mapping, and scale normalization are prerequisite to any triangulation work. A broken harness produces fake accuracy numbers and sends engineering effort in the wrong direction — this is the documented root cause of the Attempt #2 ceiling.

**Delivers:** A comparison pipeline that produces trustworthy accuracy scores for the 50-company truth set. Confirmed correct on the 9 non-December FY companies. Single-source (Morningstar-only) comparison re-established as the validated 86.4% baseline using the new all-JS harness.

**Addresses from FEATURES.md:** Fiscal year alignment engine, sign convention normalizer, scale normalizer, universal field mapping JSON, data caching infrastructure, accounting identity validation maintained.

**Avoids from PITFALLS.md:** Pitfall #1 (FY misalignment), Pitfall #2 (sign conventions), Pitfall #6 (field name drift), Pitfall #9 (scale mismatches), Pitfall #16 (rate limit exhaustion via disk caching).

**Key build order within Phase 1:** FY aligner first (everything depends on it), then sign/scale normalizers, then field mapping tables, then single-source Morningstar comparison to re-establish baseline with the new harness.

**Research flag:** Standard patterns — no phase research needed. FY alignment has a deterministic solution (EDGAR `entityFiscalYearEnd`), the existing `morningstarAccuracy.test.js` and `field-mapping.json` establish the patterns to extend.

### Phase 2: Multi-Source Triangulation

**Rationale:** With an accurate measurement tool, add FMP first (closest to XBRL, simplest mapping, 100% AAPL accuracy), then SimFin, then mstarpy. Build one source at a time and validate each before adding the next. The consensus engine and root cause tagger go in during this phase.

**Delivers:** 4-way comparison with CONSENSUS_DIFF classification, root cause tagging, and a `fix-recommendations.json` that distinguishes "our bug" from "definitional ambiguity" from "coverage gap." Reveals which of the remaining 13.6% are real engine bugs vs Morningstar quirks.

**Uses from STACK.md:** FMP direct fetch (verified working, $20/mo), SimFin direct fetch (verified working, $15/mo), mstarpy Python subprocess bridge (graceful degradation if unavailable), disk-based JSON caching per ticker per source.

**Implements from ARCHITECTURE.md:** All 6 pipeline stages including the comparator, aggregator, and rule deriver. Consensus strength weighting: mstarpy=1.0, FMP=0.9, SimFin=0.7.

**Avoids from PITFALLS.md:** Pitfall #3 (coverage vs accuracy — track CONSENSUS_DIFF not tag coverage), Pitfall #5 (MS inconsistency as truth — use 3-source consensus), Pitfall #7 (industry normalization differences — separate financial sector cohort), Pitfall #8 (restated vs as-filed — document per source adapter).

**Research flag:** Needs phase research for SimFin bank/insurance template mapping. SimFin uses separate field names for financial companies; the mapping table requires validation against actual SimFin API responses. FMP mapping is well-documented from the AAPL test and can proceed without additional research.

### Phase 3: Engine Fixes — Guided by Triangulation

**Rationale:** Fix only what triangulation identifies as CONSENSUS_DIFF (our bugs), not METHODOLOGY_DIFF or ALL_DISAGREE. Apply fixes to `edgarFinancials.js`, re-run the Thes1s fetcher only, re-run Stages 2-6, verify improvement. Regression diffing is mandatory — the B5 PP&E fix improved 111 failures but created 49 new ROU inconsistency failures; without regression tracking, net progress is invisible.

**Delivers:** Engine accuracy at or above 98% on the 50-company truth set for scoring-critical fields. Named item tag coverage fixes for the top failure clusters (intangibles 149 DIFFs / 35 companies, accrued liabilities 143 DIFFs / 31 companies, D&A 62 DIFFs / 8 companies). Residual "Other" computation enabled for company-years where named item coverage reaches the ≥95% precondition gate (expected to fix 400-500 DIFFs).

**Avoids from PITFALLS.md:** Pitfall #4 (derived field amplification — validate source fields before derived, use derivation depth tracking), Pitfall #10 (first-tag-wins inconsistency across years — check provenance for tag changes at ASC 606/842 transition years), Pitfall #11 (combined vs separated XBRL tags — mark COMBINED_ONLY separately from DIFF).

**Research flag:** Needs phase research for the intangibles and accrued liabilities structural failures. These 35 and 31 company clusters respectively require per-company XBRL instance document inspection to understand what tags each company actually reports vs what the taxonomy covers. This is the "manual review" that commercial data providers perform with human analysts.

### Phase 4: Scale Up and Validate

**Rationale:** The 50-company truth set is the development environment. Production readiness requires confirming that fixes generalize across the full S&P 500 and do not introduce new failures for company types not in the truth set (utilities, energy, consumer discretionary subclasses, etc.).

**Delivers:** S&P 500 Layer 1 structural validation (accounting identities + completeness) green across all 503 companies after each major fix. Financial sector overlay validation (bank/REIT/insurance fields) confirmed against BRK-B, JPM, WFC, MET from the truth set. Elimination of paid sources (FMP + SimFin = $35/mo) once normalization rules are stable and ongoing triangulation is no longer needed.

**Research flag:** Standard patterns for structural validation (the existing in-browser Validation tab already runs accounting identity checks — extending this to a CLI script is straightforward). Needs phase research for financial sector overlay field definitions — Morningstar's bank/REIT/insurance normalization choices vs the engine's existing overlays.

### Phase Ordering Rationale

- **Infrastructure before measurement:** The entire Attempt #2 post-mortem shows "can't improve what you can't accurately measure." Phase 1 is non-negotiable as the starting point.
- **One source at a time:** FMP before SimFin before mstarpy. FMP is the highest-confidence source (100% AAPL match, same XBRL source, cleanest mapping). Adding sources incrementally keeps debugging tractable and prevents multi-source interaction bugs.
- **Source fields before derived fields:** Every phase that touched derived fields before validating their inputs produced cascading failures. Pitfall #4 (derived field amplification) is the documented mechanism with two prior reversal events (B7 reverted twice).
- **50 companies before 500:** The truth set is the development environment. S&P 500 scale-up is the production gate, not the development gate.
- **Compensation normalization is parallel, not sequential:** The 11 documented compensation bugs (gstack-compensation-engine-bugfix-eng-plan-20260321.md) can be fixed at any phase without blocking financial statement accuracy work.

### Research Flags

Phases needing deeper research during planning:
- **Phase 2 — SimFin bank/insurance templates:** SimFin uses separate field names for financial sector companies; the mapping table needs to be built from SimFin's actual API documentation before the SimFin collector is implemented.
- **Phase 3 — Intangibles and accrued liabilities structural failures:** The 35 and 31 company clusters require per-company XBRL instance document inspection — reading what tags each specific company actually uses in their filings, not just the taxonomy. This is equivalent to what Morningstar's data analysts do manually and may reveal patterns not visible from aggregate tag coverage data.

Phases with standard patterns (skip research-phase):
- **Phase 1 — Comparison harness infrastructure:** FY alignment, sign conventions, field mapping, and scale normalization are well-understood problems with deterministic solutions. The approach is fully established by the existing `morningstarAccuracy.test.js` (offset detection, revenue cross-check) and `field-mapping.json` (sign multipliers, tolerance tiers) patterns.
- **Phase 4 — S&P 500 structural validation:** The existing in-browser Validation tab already runs accounting identity checks across companies; converting this to a CLI script is a mechanical engineering task.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All technologies already in use and working. No new npm dependencies. FMP/SimFin APIs verified working per memory reference. mstarpy Python bridge is the only uncertainty (scraper fragility), but the pipeline degrades gracefully without it. |
| Features | HIGH | Primary evidence from this project's own 3-attempt history, B1-B8 phase results, 50-company truth set analysis, and documented failure patterns. Not theoretical — every table-stakes feature corresponds to a documented failure mode from prior attempts. |
| Architecture | HIGH | 6-stage pipeline design is grounded in the project's existing patterns (bundle.mjs, export-financials.mjs, morningstarAccuracy.test.js) and lessons from prior attempts. Component boundaries are clean and independently testable. The disk-based resumability pattern is proven at the level of the existing export-financials.mjs pipeline. |
| Pitfalls | HIGH | Every major pitfall has a documented prior occurrence in Attempt #1 or #2. Not inferred — observed. Severity rankings are based on actual engineering impact (FY misalignment blocked 18% of truth set; sign conventions affect ~30% of fields; derived field amplification reverted B7 twice). |

**Overall confidence:** HIGH

### Gaps to Address

- **SimFin bank/insurance field names:** SimFin uses different templates for financial companies. The mapping table needs runtime validation against actual SimFin API responses before the SimFin collector can be fully built. Address in Phase 2 research.

- **mstarpy v9 field name stability:** mstarpy v9 changed its API surface (nested `subLevel` format). Field name verification against the existing Morningstar CSV truth set should happen during the mstarpy bridge implementation. Address in Phase 2.

- **Triangulation consensus thresholds:** The starting thresholds (3 sources agree within 1%, Thes1s off by >5%) are reasonable but may need per-field or per-statement-type tuning based on empirical results. Treat as a Phase 2 calibration task, not a Phase 1 design decision.

- **Consensus scoring for derived fields:** Total debt, invested capital, EBITDA, and similar derived fields differ by formula across all providers and may never reach consensus. These likely need a separate classification tier ("DEFINITIONALLY_AMBIGUOUS") rather than being scored as CONSENSUS_DIFF. Address during Phase 2 aggregator design.

- **EDGAR `entityFiscalYearEnd` reliability at scale:** The fiscal calendar resolver depends on this field being reliably populated in EDGAR CompanyFacts. Needs verification across the full 5,758 company universe during Phase 1 FY aligner implementation.

---

## Sources

### Primary (HIGH confidence)
- `gstack/plans/gstack-xbrl-annual-normalization-eng-plan-20260319.md` — B1-B8 results, 86.4% final accuracy, failure pattern breakdown with per-field DIFF counts
- `gstack/plans/gstack-xbrl-quarterly-validation-eng-plan-20260320.md` — 92.8% quarterly accuracy, systematic failures
- `src/engines/__tests__/fixtures/morningstar/field-mapping.json` — 87 mapped fields, sign multipliers, 588 unmapped, 5-tier tolerance system
- `gstack/plans/gstack-xbrl-engine-strategy-eng-plan-20260318.md` — three-layer engine architecture, S&P 500 coverage validation (503 companies, 0 failures)
- `gstack/plans/gstack-compensation-engine-bugfix-eng-plan-20260321.md` — 11 compensation engine bugs, 27/30 companies affected
- `.planning/PROJECT.md` — Attempt #3 strategy, triangulation approach, data source table, constraints

### Secondary (MEDIUM confidence)
- `validation/validation-summary-2026-03-10.md` — Layer 1/2/3 validation (89 companies, 82.0% within 5% on yfinance)
- `memory/reference_financial_data_apis.md` — FMP/SimFin/mstarpy API keys, endpoints, rate limits, accuracy results

### Tertiary (training data — unverifiable without web search)
- Commercial provider behavior (Morningstar restated convention, FactSet sign conventions) — confirmed against this project's FMP/mstarpy comparison data, not independently verified via web search.
- XBRL US-GAAP taxonomy structure — confirmed against `taxonomy-hierarchy.json` (1,937 tags) in the project.

---
*Research completed: 2026-03-25*
*Ready for roadmap: yes*
