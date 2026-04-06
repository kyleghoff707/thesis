# Phase 4: Scale Validation - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Validate the normalization engine against FMP data for all 503 S&P 500 companies using a tiered field comparison (scoring-critical = hard pass, display = soft flag). Iteratively fix issues the comparison reveals — including investigating outliers like RACE (EUR filer) and financial sector companies (MET, WFC) — until the engine is structurally sound at scale. No beyond-S&P validation in this phase (deferred to future milestone).

This phase does NOT add new data sources, change the XBRL engine architecture, or validate companies outside the S&P 500. It uses existing FMP infrastructure (Phase 2 collector + field mapping) to prove the engine works at scale, with fixes applied iteratively when FMP comparison reveals clear bugs.

</domain>

<decisions>
## Implementation Decisions

### Success Bar
- **D-01:** Accuracy target is 94%+ on the 50-company Morningstar truth set (the current level). The 98% target was aspirational — remaining diffs are methodology, not bugs. Phase 4 proves engine quality at S&P 500 scale rather than pushing the MS number higher.
- **D-02:** FMP is the primary truth set for S&P 500 validation. SimFin and mstarpy may be added later as secondary validation but are NOT required for Phase 4 completion.

### Fix + Validate Approach
- **D-03:** Phase 4 is NOT validation-only. It's iterative: run FMP comparison across S&P 500, fix what's clearly wrong, re-validate. Stop when scoring-critical field accuracy stabilizes (no more clear wins from fixes).
- **D-04:** Fix boundary: only fix issues that FMP comparison confirms as engine bugs (our value differs from FMP on scoring-critical fields). Don't chase methodology diffs or display-only field disagreements.

### Outlier Handling
- **D-05:** Investigate RACE (Ferrari) — files in EUR, not USD. The 0% accuracy is a currency convention issue, not an engine failure. Fix or exclude with documentation.
- **D-06:** Investigate financial sector outliers (MET 78.6%, WFC 88.9%) using FMP as truth set. Determine whether our industry overlays are actually wrong or if Morningstar used different definitions. Fix if FMP confirms our values are wrong.
- **D-07:** Other low-accuracy companies (CRM 76.1%, EW 86.6%, EQIX 87.7%) — investigate during fix+validate cycle. Document findings.

### Validation Scope
- **D-08:** Tiered field comparison: scoring-critical fields (~30 fields feeding Rule One scoring) are hard-pass criteria. Display-only fields are soft-flagged and reported separately. Both tiers reported.
- **D-09:** S&P 500 only for this phase. No beyond-S&P validation — that's a future milestone.

### FMP Fetch Strategy
- **D-10:** Batch fetch over 2 days with disk cache. Day 1: ~250 companies. Day 2: remaining ~253. 7-day TTL cache. All subsequent validation runs use cached data.

### Subscription Decision
- Not discussed — user will decide separately when to cancel FMP/SimFin.

### Claude's Discretion
- S&P 500 ticker list source and management
- Accounting identity checks to include alongside FMP comparison
- Batch scheduling details (rate limiting, retry logic)
- Fix prioritization order within the iterative cycle
- Report format for S&P 500 results (console + JSON, following Phase 1-3 patterns)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 2 Collector Infrastructure (Foundation)
- `validation/scripts/lib/fmp-collector.mjs` — FMP data collector with disk caching (extend for S&P 500 batch)
- `validation/scripts/lib/simfin-collector.mjs` — SimFin collector (reference, not primary for Phase 4)
- `validation/scripts/lib/disk-cache.mjs` — Shared disk cache module
- `validation/scripts/lib/field-mapper.mjs` — Field mapping + sign/scale transforms
- `validation/scripts/lib/consensus.mjs` — Consensus engine (may be useful for comparison logic)
- `validation/scripts/lib/comparator.mjs` — Core comparison engine

### Phase 2-3 Pipeline
- `validation/scripts/triangulate.mjs` — Existing triangulation orchestrator (pattern for S&P 500 orchestrator)
- `validation/scripts/compare-morningstar.mjs` — MS comparison orchestrator (pattern reference)
- `src/engines/__tests__/fixtures/morningstar/field-mapping.json` — Field mapping config

### Existing Validation Reports
- `validation/reports/morningstar-accuracy.json` — Current 50-company accuracy baseline (94.8%)
- `validation/reports/fix-recommendations.json` — Phase 2-3 fix recommendations (context for what's already been fixed)

### Engine Code
- `src/engines/edgarFinancials.js` — XBRL engine (will receive iterative fixes)
- `src/engines/industryOverlays.js` — Bank/REIT/insurance overlays (relevant for MET/WFC investigation)
- `src/engines/industryClassifier.js` — SIC-based industry detection

### Cache Infrastructure
- `validation/cache/fmp/` — Existing FMP cache (50 companies from Phase 2)
- `validation/cache/simfin/` — Existing SimFin cache

### XBRL Engine Strategy
- `gstack/plans/gstack-xbrl-engine-strategy-eng-plan-20260318.md` — Three-layer engine architecture reference

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `validation/scripts/lib/fmp-collector.mjs` — Already fetches income/balance/cashflow from FMP with disk caching. Needs batch mode for 503 companies with rate limiting.
- `validation/scripts/lib/field-mapper.mjs` — FMP field mappings already exist from Phase 2. Can reuse directly for S&P 500 comparison.
- `validation/scripts/lib/comparator.mjs` — Core comparison logic with injectable specialHandlers. Extend for tiered field reporting.
- `validation/scripts/lib/reporter.mjs` + `triangulation-reporter.mjs` — Console + JSON reporting. Extend for S&P 500 scale output.
- `validation/scripts/bundle.mjs` + `bundled-engines.mjs` — Bundles engine code for Node.js CLI execution. Critical for running comparisons outside the browser.
- `src/data/sp500-tag-classifications.json` — 1,989 AI-classified tags for S&P 500 (387KB). Contains the S&P 500 universe implicitly.

### Established Patterns
- ESM modules in `validation/scripts/lib/` with named exports
- Disk caching in `validation/cache/{source}/` with JSON files per ticker
- SEC fetch interceptor for rate-limited API calls (reuse for FMP batching)
- Pre-fix baseline snapshots in `validation/reports/` for regression tracking
- Vitest for unit tests (`src/engines/__tests__/`)

### Integration Points
- New S&P 500 comparison script goes in `validation/scripts/` (e.g., `compare-sp500-fmp.mjs`)
- S&P 500 ticker list — derive from existing `sp500-tag-classifications.json` or fetch from EDGAR
- FMP cache extends to `validation/cache/fmp/` (same directory, more tickers)
- Results go in `validation/reports/` (e.g., `sp500-fmp-accuracy.json`)
- Engine fixes go in `src/engines/edgarFinancials.js` and overlay files

</code_context>

<specifics>
## Specific Ideas

- RACE (Ferrari) files in EUR — this is a currency convention issue, not an engine failure. The user flagged this specifically.
- Use FMP as truth set because "that was the point of getting those API keys" — the user sees FMP/SimFin as validation infrastructure, not just Phase 2 tools.
- The fix+validate cycle should mirror Phase 3's approach: fix, run comparison, check regression, repeat.
- Financial sector companies (MET, WFC, JPM, BRK-B) should be investigated using FMP data to determine if our overlays are wrong or if Morningstar was the outlier.

</specifics>

<deferred>
## Deferred Ideas

- Beyond-S&P validation (random sample from 5,758 US-listed universe) — user explicitly deferred to a future milestone
- SimFin and mstarpy as secondary S&P 500 validation sources — "add later as possible validation attributes"
- Subscription cancellation timing — not discussed, user will decide separately

</deferred>

---

*Phase: 04-scale-validation*
*Context gathered: 2026-03-26*
