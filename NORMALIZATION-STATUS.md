# Normalization Engine Status

The normalization engine validates Thes1s's XBRL financial extraction against external truth sets (Morningstar 50-company, FMP S&P 500) to prove accuracy and find bugs. This document is the source of truth for normalization work going forward.

## Accuracy (updated April 6, 2026)

| Metric | Value | Source |
|--------|-------|--------|
| MS 50-company baseline | **94.8%** | validation/reports/morningstar-accuracy.json |
| S&P 500 Tier 1 (scoring-critical) | **87.3%** | validation/reports/sp500-fmp-accuracy.json |
| S&P 500 Tier 2 (display) | **83.8%** | " |
| S&P 500 Tier 3 (expanded) | **61.0%** | " |
| S&P 500 Overall | **83.0%** | " |
| S&P 500 Identity Checks | **83.8%** | validation/reports/sp500-identity-checks.json |
| Compensation field accuracy (5 tickers) | **100%** | validation/reports/comp-accuracy.json |
| Compensation parsing (503 S&P 500) | **92.8% GOOD** (467/503) | 0 all-null, 26 no-execs, 10 rate-limit errors |

The 94.8% MS number is the regression gate -- engine changes must not drop it below 94.0%.

The S&P 500 numbers reflect comparator-level fixes (sign convention + fiscal year alignment) applied in `sp500-fmp-comparator.mjs`. No engine modifications were made during Phase 4. The remaining Tier 1 gap (87.3% vs 100%) is methodology differences between FMP's normalization and our XBRL extraction, not bugs.

## Requirements Status

| ID | Description | Status | Notes |
|----|-------------|--------|-------|
| HARNESS-01 | FY alignment engine | **Complete** | Phase 1 |
| HARNESS-02 | Sign convention normalizer | **Complete** | Phase 1 |
| HARNESS-03 | Scale normalizer | **Complete** | Phase 1 |
| HARNESS-04 | Universal field mapping JSON | **Complete** | Phase 1 (101 fields) |
| HARNESS-05 | All-JS comparison harness | **Complete** | Phase 1 |
| TRI-01 | FMP data collector | **Complete** | Phase 2 |
| TRI-02 | SimFin data collector | **Complete** | Phase 2 |
| TRI-03 | mstarpy Python bridge | **Complete** | Phase 2 |
| TRI-04 | Triangulation consensus engine | **Complete** | Phase 2 |
| TRI-05 | Root cause tagger | **Complete** | Phase 2 |
| TRI-06 | Reporter with regression diffing | **Complete** | Added to compare-morningstar.mjs: accuracy delta, patterns resolved/new, per-company regressions |
| ENGINE-01 | Tag coverage fixes | **Complete** | Phase 3 |
| ENGINE-02 | Residual Other with 95% gate | **Complete** | Phase 3 |
| ENGINE-03 | Financial sector overlay validation | **Complete** | Phase 3 |
| ENGINE-04 | Regression protection via baselines | **Complete** | Phase 3 |
| SCALE-01 | 94%+ MS accuracy | **Complete** | 94.8% confirmed |
| SCALE-02 | S&P 500 structural validation | **Complete** | 87.3% FMP Tier 1, 83.8% identity checks, 503/503 companies |
| SCALE-03 | Beyond-S&P 500 validation | **Dropped** | Margin work, S&P 500 coverage is sufficient |
| SCALE-04 | Eliminate paid API subscriptions | **Waiting** | User cancels after COMP work is verified |
| COMP-01 | Fix 11 compensation bugs + scale fixes | **Code done, needs manual verification** | 56/56 tests pass; 92.8% of 503 S&P 500 tickers parse successfully (was 54%); 26 no-execs remaining (hidden headers, non-standard formats); 30-company manual check pending |
| COMP-02 | FMP compensation comparison layer | **Complete** | AAPL 100% field accuracy, 5-ticker verified. compare-compensation.mjs built |

**Summary:** 19/22 complete, 1 needs manual verification (COMP-01), 1 waiting on user action (SCALE-04), 1 dropped (SCALE-03).

## What's Left

### 1. COMP-01: Manual verification (user action)
Run the dev server, clear IndexedDB `comp-data` store, and check 30 companies:
- **Column alignment (Bug 1):** TXRH, ODFL, EW, BOOT, AMZN, GOOGL, JPM, NVDA, SFM
- **Name/title (Bugs 2, 6, 7):** AAPL, MSFT, GOOGL, JPM, NVDA, WFC, MLI, SFM
- **Dedup (Bug 3):** AAPL, GOOGL, NVDA, WFC, SFM
- **Non-names (Bug 4):** NVDA, ODFL, MU, EW, BA
- **Directors (Bug 9):** AMZN, JPM
- **Cache (Bug 8):** MET
- **Pay ratio (Bug 10):** MLI
- **No regressions:** META, UNH, LULU, BRK-B

### 2. SCALE-04: Cancel API subscriptions (user action)
After all verification is done, cancel FMP and SimFin subscriptions. The normalization rules are self-sufficient -- paid sources were only needed to build and validate them.

## Completed Work

### Phase 1: Comparison Harness (Complete)
Built the all-JavaScript comparison pipeline: fiscal year alignment using EDGAR metadata, universal sign convention normalizer, scale normalizer (mstarpy millions -> full dollars), 101-field mapping JSON, and the comparison harness itself. Established 91.2% baseline on 50-company Morningstar truth set. 174 vitest tests.

**Key files:** `validation/scripts/compare-morningstar.mjs`, `validation/scripts/lib/comparator.mjs`, `validation/scripts/lib/field-alias-map.mjs`
**Archive:** `_planning-archive/phases/01-comparison-harness/` (12 files, 2 plans)

### Phase 2: Multi-Source Triangulation (Complete)
Built 3 data collectors (FMP, SimFin, mstarpy) with rate-limited caching. Consensus engine classifies deviations as CONSENSUS_DIFF, METHODOLOGY_DIFF, or COVERAGE_GAP. Root cause auto-tagger labels: sign_flip, fy_offset, scale_error, tag_miss, derivation_error. Identified 2,786 actionable items (609 consensus diffs + 2,177 likely bugs).

**Key files:** `validation/scripts/lib/fmp-collector.mjs`, `validation/scripts/lib/consensus.mjs`, `validation/scripts/lib/root-cause-tagger.mjs`
**Archive:** `_planning-archive/phases/02-multi-source-triangulation/` (14 files, 3 plans)

### Phase 3: Engine Fixes (Complete)
11 plans executed. Accuracy: 91.2% -> 94.8%. Major fixes: field alias map (canonical->engine name resolution at lookup time), REIT overlay changed from additive-only to overlay-wins, residual "Other" computation with 95% coverage gate, bank overlay with ticker-based template detection, PP&E reclassification with FMP agreement check, D&A broadening with 3% double-count guard. Key decision: 98% target was aspirational -- 94.8% reflects methodology diffs (accrued liabilities, residual Other fields, debt classification), not fixable bugs.

**Key files:** `src/engines/edgarFinancials.js`, `src/engines/industryOverlays.js`, `validation/scripts/lib/field-alias-map.mjs`
**Archive:** `_planning-archive/phases/03-engine-fixes/` (22 files, 11 plans -- each with PLAN.md + SUMMARY.md)

### Phase 4: Scale Validation (Complete)
Validated the engine across all 503 S&P 500 companies using FMP comparison (tiered) and accounting identity checks. Built comparison infrastructure (ticker scraper, batch fetcher, tiered comparator, reporter, orchestrator). Ran full comparison, applied comparator-level fixes (sign convention + FY alignment), investigated outliers (RACE, MET, WFC, CRM, EW, EQIX). Ran identity checks (83.8% pass, 50,882/60,692 checks). No engine bugs found -- all gaps are methodology differences.

**Key files:**
- `validation/scripts/compare-sp500-fmp.mjs` -- S&P 500 FMP comparison orchestrator
- `validation/scripts/validate-sp500-identities.mjs` -- Identity check orchestrator
- `validation/scripts/lib/sp500-fmp-comparator.mjs` -- 85-field tiered comparator
- `validation/reports/sp500-final-report.md` -- Comprehensive final report
- `validation/reports/sp500-outlier-investigation.md` -- Outlier deep-dives

**Archive:** `_planning-archive/phases/04-scale-validation/` (8 files, 3 plans)

### COMP-01: Compensation Bug Fixes (Code Complete, Manual Verification Pending)
All 11 bugs fixed in `src/engines/compensation.js`. 47/47 tests pass. Cache bumped v2 -> v3. Bugs: column misalignment (physical position tracking), name/title concatenation (3-stage split pipeline), duplicates (tertiary matching + post-merge dedup), non-names (word-boundary validation), HTML entities, footnote artifacts, director headings, pay ratio regex, XBRL fallback trigger ($50K median gate).

**Key files:** `src/engines/compensation.js`, `src/engines/__tests__/compensation.test.js`
**Plan:** `gstack/plans/gstack-compensation-engine-bugfix-eng-plan-20260321.md`

## Key Decisions

These decisions were made during Phases 1-4 and must be respected going forward:

1. **94%+ is the target** (not 98%) -- remaining diffs are methodology, not bugs.
2. **FMP is the primary S&P 500 truth set** -- SimFin/mstarpy are secondary/supplementary.
3. **Only fix FMP-confirmed Tier 1 bugs** -- do not chase Tier 2/3 disagreements or methodology diffs.
4. **Fix+validate iteratively** -- make one fix, rebuild bundle, check MS regression gate (94%+), check S&P 500 improvement, repeat.
5. **Comparator fixes != engine fixes** -- sign convention and FY alignment corrections live in `sp500-fmp-comparator.mjs`, not in the engine itself.
6. **Alias map resolves at lookup time** -- canonical->engine name resolution happens during comparison, not by renaming engine fields (50+ UI components depend on engine field names).
7. **Overlay-wins for industry overlays** -- REIT/bank/insurance overlay tags take priority over generic base taxonomy.
8. **95% coverage gate on residual Other** -- only compute residual "Other" fields when 95%+ of named items are present.
9. **Engine bundle must be rebuilt** after any engine change: `node validation/scripts/bundle.mjs`
10. **S&P 500 coverage is sufficient** -- beyond-S&P validation (SCALE-03) is dropped as margin work.

## Validation Commands

```bash
# Rebuild engine bundle (required after any engine change)
node validation/scripts/bundle.mjs

# MS 50-company regression gate (must stay >= 94.0%)
node validation/scripts/compare-morningstar.mjs

# S&P 500 FMP comparison (full 503 companies)
node validation/scripts/compare-sp500-fmp.mjs

# S&P 500 FMP comparison (single ticker debug)
node validation/scripts/compare-sp500-fmp.mjs --ticker AAPL

# S&P 500 accounting identity checks (503 companies)
node --max-old-space-size=4096 validation/scripts/validate-sp500-identities.mjs

# Compensation comparison (FMP vs engine)
node validation/scripts/compare-compensation.mjs --ticker AAPL
node validation/scripts/compare-compensation.mjs --fetch              # fetch FMP comp data + compare all

# S&P 500 FMP data fetch (run first if cache is stale)
node validation/scripts/fetch-sp500-fmp.mjs

# Run project tests (exclude gstack skill tests)
npm test -- --run

# Read existing accuracy reports (fast, no re-run)
node -e "const r=JSON.parse(require('fs').readFileSync('validation/reports/morningstar-accuracy.json','utf8')); console.log('MS:', r.overallAccuracy)"
node -e "const r=JSON.parse(require('fs').readFileSync('validation/reports/sp500-fmp-accuracy.json','utf8')); console.log(JSON.stringify(r.summary, null, 2))"
```

## Archive Reference

The `_planning-archive/` directory contains the full GSD planning history. Key files for future reference:

| File | What it contains |
|------|-----------------|
| `_planning-archive/ROADMAP.md` | Full 5-phase roadmap with success criteria per phase |
| `_planning-archive/REQUIREMENTS.md` | All 22 requirements with original traceability matrix |
| `_planning-archive/STATE.md` | 23 accumulated decisions, velocity metrics, blockers |
| `_planning-archive/PROJECT.md` | Core value statement, key decisions table, validated requirements |
| `_planning-archive/phases/03-engine-fixes/` | 11 plan+summary pairs documenting every engine fix (most useful for understanding why specific XBRL decisions were made) |
| `_planning-archive/phases/04-scale-validation/04-CONTEXT.md` | 10 locked decisions (D-01 through D-10) for the S&P 500 validation approach |
| `_planning-archive/phases/04-scale-validation/04-RESEARCH.md` | FMP rate limits, field count corrections, architecture patterns, common pitfalls |
| `_planning-archive/codebase/` | 6 docs on existing architecture (useful for onboarding) |
| `_planning-archive/research/` | 5 investigation docs on data sources and approaches |
