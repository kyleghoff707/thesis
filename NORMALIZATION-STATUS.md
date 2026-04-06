# Normalization Engine Status

The normalization engine validates Thes1s's XBRL financial extraction against external truth sets (Morningstar 50-company, FMP S&P 500) to prove accuracy and find bugs. Work was organized in 5 phases using GSD (now archived). This document captures where everything stands so future sessions can continue the work.

## Accuracy (as of March 27, 2026)

| Metric | Value | Source |
|--------|-------|--------|
| MS 50-company baseline | **94.8%** | validation/reports/morningstar-accuracy.json |
| S&P 500 Tier 1 (scoring-critical) | **87.3%** | validation/reports/sp500-fmp-accuracy.json |
| S&P 500 Tier 2 (display) | **83.8%** | " |
| S&P 500 Tier 3 (expanded) | **61.0%** | " |
| S&P 500 Overall | **83.0%** | " |

The 94.8% MS number is the regression gate -- engine changes must not drop it below 94.0%.

The S&P 500 numbers reflect comparator-level fixes (sign convention + fiscal year alignment) applied in `sp500-fmp-comparator.mjs`. No engine modifications were made during Phase 4. The remaining Tier 1 gap (87.3% vs 100%) is methodology differences between FMP's normalization and our XBRL extraction, not bugs.

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

### Phase 4, Plan 01: S&P 500 Comparison Infrastructure (Complete)
Built the S&P 500 comparison pipeline: Wikipedia ticker scraper (503 tickers, 7-day cache), batch FMP data fetcher with 200ms rate limiting, 85-field tiered comparator (23 Tier 1 / 32 Tier 2 / 30 Tier 3 with tier-aware tolerance thresholds), tiered accuracy reporter (console + JSON), and full comparison orchestrator with SEC fetch interceptor and auto-bundle.

**Key files:**
- `validation/scripts/fetch-sp500-fmp.mjs` -- S&P 500 ticker scraper + batch FMP fetcher
- `validation/scripts/compare-sp500-fmp.mjs` -- Main comparison orchestrator
- `validation/scripts/lib/sp500-fmp-comparator.mjs` -- 85-field tiered comparator
- `validation/scripts/lib/sp500-reporter.mjs` -- Tiered console + JSON reporter

**Archive:** `_planning-archive/phases/04-scale-validation/04-01-SUMMARY.md`

### Phase 4, Plan 02: S&P 500 FMP Comparison Run (Tasks 1-2 Complete, Task 3 Pending)
Fetched FMP data for all 503 S&P 500 companies. Ran initial comparison (Tier 1: 80.0%, Overall: 77.4%). Applied two comparator fixes:

1. **Sign convention** -- Added SIGN_FLIP_FIELDS for 5 cash flow fields (share_repurchases, dividends_paid, capital_expenditures, debt_repayment, common_stock_repurchased) where FMP outflow convention (negative) differs from XBRL Payments convention (positive). Reduced share_repurchases failures from 446 to 133 companies.

2. **Fiscal year alignment** -- Added revenue-matching `detectFYOffset()` for non-December FY companies. Resolved near-0% accuracy for ~24 companies (LULU, WMT, NVDA, HD, CRM, etc.) where FMP labels fiscal years differently than our engine.

After fixes: Tier 1 = 87.3%, Overall = 83.0% (+7.3% / +5.6%).

Updated REQUIREMENTS.md: SCALE-01 revised from 98%+ to 94%+ per decision D-01.

**Outlier investigation completed** (documented in `validation/reports/sp500-outlier-investigation.md`):
- **RACE** (Ferrari): Not in S&P 500, EUR filer -- non-issue
- **MET** (MetLife, T1: 51.2%): Insurance sector METHODOLOGY_DIFF -- revenue/operating income definitions inherently differ
- **WFC** (Wells Fargo, T1: 72.0%): Bank sector partial METHODOLOGY_DIFF + sign fix helped
- **CRM** (Salesforce, T1: was 24.4%): FY alignment fixed it
- **EW** (Edwards Lifesciences, T1: 81.3%): Sign fix + residual methodology
- **EQIX** (Equinix, T1: 87.8%): REIT debt classification METHODOLOGY_DIFF

**Fix cycle concluded:** No fixable Tier 1 engine bugs remain. All remaining failures are METHODOLOGY_DIFF (operating_income_loss 250 companies, short_term_debt 222, long_term_debt 170, share_repurchases 133, capital_expenditures 120, cash 94).

**Bottom 10 companies:** VST (6.3%), NEE (8%), GM (10%), CRH (31.4%), PPL (36.4%), PSKY (40%), MET (51.2%), SW (52.9%), VTR (57.5%), KR (57.8%) -- financial sector, non-standard XBRL, or unusual FY patterns.

**No SUMMARY.md exists** -- the GSD checkpoint was interrupted before it could be created.

**Git commits:** `48ca0fd` (feat: fetch + initial comparison + outlier investigation), `8e6458a` (fix: comparator sign convention + FY alignment)

**Archive:** `_planning-archive/phases/04-scale-validation/04-02-PLAN.md`

## Remaining Work

### To Finish Phase 4

**1. Accounting identity checks at S&P 500 scale**
Build `validation/scripts/validate-sp500-identities.mjs` -- runs the existing `validateCompany()` function (from `src/engines/validation.js`) against all 503 companies. The function checks 10 accounting identities (Assets=L+E, GP=Rev-COGS, OCF+ICF+FCF=Cash Change, etc.). Follow the same orchestrator pattern as `compare-sp500-fmp.mjs` (browser polyfills, SEC fetch interceptor, auto-bundle, progress reporting). Output: console report + `validation/reports/sp500-identity-checks.json`.

See `_planning-archive/phases/04-scale-validation/04-03-PLAN.md` Task 1 for the full spec.

**2. Comprehensive final report**
Create `validation/reports/sp500-final-report.md` summarizing all Phase 4 findings: MS baseline (94.8%), S&P 500 FMP accuracy (87.3% Tier 1), identity check pass rate, outlier investigations, fix cycle results, and requirement verification (SCALE-01 through SCALE-04).

See `_planning-archive/phases/04-scale-validation/04-03-PLAN.md` Task 2 for the full spec.

### Phase 5: Executive Compensation (Not Started)
Fix 11 documented bugs in the compensation extraction engine and validate against FMP's compensation data.

**Plan reference:** `gstack/plans/gstack-compensation-engine-bugfix-eng-plan-20260321.md`
**Requirements:** COMP-01 (11 bugs), COMP-02 (FMP comparison layer)
**Archive:** `_planning-archive/REQUIREMENTS.md` (full traceability matrix)

## Key Decisions

These decisions were made during Phases 1-4 and must be respected going forward:

1. **94%+ is the target** (not 98%) -- remaining diffs are methodology, not bugs. Chasing 98% would mean matching Morningstar's arbitrary choices, not fixing our engine.
2. **FMP is the primary S&P 500 truth set** -- SimFin/mstarpy are secondary/supplementary.
3. **Only fix FMP-confirmed Tier 1 bugs** -- do not chase Tier 2/3 disagreements or methodology diffs.
4. **Fix+validate iteratively** -- make one fix, rebuild bundle, check MS regression gate (94%+), check S&P 500 improvement, repeat.
5. **Beyond-S&P 500 validation deferred** -- S&P 500 coverage is sufficient for this milestone.
6. **Comparator fixes != engine fixes** -- sign convention and FY alignment corrections live in `sp500-fmp-comparator.mjs`, not in the engine itself.
7. **Alias map resolves at lookup time** -- canonical->engine name resolution happens during comparison, not by renaming engine fields (50+ UI components depend on engine field names).
8. **Overlay-wins for industry overlays** -- REIT/bank/insurance overlay tags take priority over generic base taxonomy.
9. **95% coverage gate on residual Other** -- only compute residual "Other" fields when 95%+ of named items are present.
10. **Engine bundle must be rebuilt** after any engine change: `node validation/scripts/bundle.mjs`

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

# S&P 500 FMP data fetch (run first if cache is stale)
node validation/scripts/fetch-sp500-fmp.mjs

# Read existing accuracy reports (fast, no re-run)
node -e "const r=JSON.parse(require('fs').readFileSync('validation/reports/morningstar-accuracy.json','utf8')); console.log('MS:', r.overallAccuracy)"
node -e "const r=JSON.parse(require('fs').readFileSync('validation/reports/sp500-fmp-accuracy.json','utf8')); console.log(JSON.stringify(r.summary, null, 2))"
```

## Requirements Tracker

From `_planning-archive/REQUIREMENTS.md` -- 22 requirements total:

| Group | Count | Status |
|-------|-------|--------|
| HARNESS (Phase 1) | 5 | All complete |
| TRI (Phase 2) | 6 | 5 complete, TRI-06 pending |
| ENGINE (Phase 3) | 4 | All complete |
| SCALE (Phase 4) | 4 | SCALE-01/02 pending, SCALE-03 deferred, SCALE-04 deferred |
| COMP (Phase 5) | 2 | Not started |

## Archive Reference

The `_planning-archive/` directory contains the full GSD planning history. Key files for future reference:

| File | What it contains |
|------|-----------------|
| `_planning-archive/ROADMAP.md` | Full 5-phase roadmap with success criteria per phase |
| `_planning-archive/REQUIREMENTS.md` | All 22 requirements with traceability matrix |
| `_planning-archive/STATE.md` | 23 accumulated decisions, velocity metrics, blockers |
| `_planning-archive/PROJECT.md` | Core value statement, key decisions table, validated requirements |
| `_planning-archive/phases/03-engine-fixes/` | 11 plan+summary pairs documenting every engine fix (most useful for understanding why specific XBRL decisions were made) |
| `_planning-archive/phases/04-scale-validation/04-CONTEXT.md` | 10 locked decisions (D-01 through D-10) for the S&P 500 validation approach |
| `_planning-archive/phases/04-scale-validation/04-RESEARCH.md` | FMP rate limits, field count corrections, architecture patterns, common pitfalls |
| `_planning-archive/phases/04-scale-validation/04-03-PLAN.md` | Full spec for the remaining identity check + final report work |
| `_planning-archive/codebase/` | 6 docs on existing architecture (useful for onboarding) |
| `_planning-archive/research/` | 5 investigation docs on data sources and approaches |
