# Phase 1: Comparison Harness — Executive Summary

**Completed:** 2026-03-25
**Duration:** ~30 minutes (2 plans, 5 tasks)
**Verification:** 9/9 must-haves passed

---

## What We Did

Built an all-JavaScript comparison pipeline that measures how accurately our XBRL engine extracts financial data compared to Morningstar's numbers. Think of it as a "grading system" — it takes our engine's output for any company, compares it field-by-field against the Morningstar truth set (50 companies we downloaded), and tells us exactly where we're right, where we're close, and where we're wrong.

**The result: 91.2% accuracy** (13,507 out of 14,818 field comparisons match). This is our starting line. Phases 2-3 will push this toward 98%.

---

## What Each File Does

### Core Library (validation/scripts/lib/)

| File | Lines | What It Does |
|------|-------|--------------|
| **fiscal-aligner.mjs** | 147 | Figures out fiscal year alignment. Companies like LULU (January FY) and Nike (May FY) label their years differently than Morningstar does. This module reads each company's fiscal year-end from EDGAR metadata and calculates the offset so we compare the right years. Handles all 19 non-December FY companies in the truth set. |
| **field-mapper.mjs** | 199 | Translates between different naming systems. Morningstar calls it "Net Income after Non-Controlling/Minority Interests", our engine calls it "net_income_loss", FMP calls it "netIncome". This module maps everything to our canonical names. Also handles sign conventions (Morningstar shows expenses as negative, XBRL shows them as positive) and scale differences. |
| **comparator.mjs** | 218 | The actual comparison engine. Takes our engine's number and Morningstar's number for each field and decides: MATCH (within tolerance), CLOSE (slightly off), DIFF (meaningfully different), MISSING_FIELD (we don't have it), or MISSING_YEAR (year not available). Uses five tolerance tiers — revenue must be exact, but "Other Noncurrent Assets" gets more wiggle room. |
| **reporter.mjs** | 261 | Generates two outputs: a clean console summary (overall %, per-company scores with top 3 failures) and a detailed JSON file for programmatic analysis. Designed so you can scan the console output quickly without being a programmer. |

### Orchestrator Script

| File | Lines | What It Does |
|------|-------|--------------|
| **compare-morningstar.mjs** | 292 | The "run everything" script. One command (`node validation/scripts/compare-morningstar.mjs`) bundles our XBRL engine, runs it against all 50 truth set companies, compares every field, and outputs the results. Handles SEC rate limiting, disk caching, and auto-building the engine bundle. Also supports `--ticker AAPL` for single-company debugging. |

### Test Files (src/engines/__tests__/harness/)

| File | Tests | What It Validates |
|------|-------|-------------------|
| **fiscal-aligner.test.js** | 35 | FY alignment for all 19 non-Dec companies, edge cases, revenue validation |
| **field-mapper.test.js** | 22 | Field loading, sign conventions, scale transforms, special handlers |
| **sign-convention.test.js** | 77 | Every single one of the 101 mapped fields for AAPL has correct sign treatment |
| **comparator.test.js** | 40 | Tolerance boundaries, MATCH/CLOSE/DIFF thresholds, company-level orchestration |

**Total: 174 new tests, all passing.** Plus the existing 718 engine tests still pass (no regressions).

### Output Files

| File | What It Is |
|------|------------|
| **validation/reports/morningstar-accuracy.json** | Baseline accuracy snapshot. 91.2% overall, with per-company breakdowns and top failure patterns. Phase 2 will diff against this to measure improvement. |

### Reference Files (not part of the build)

| File | What It Is |
|------|------------|
| **validation/scripts/reference/test-api-sources.mjs** | Old API test script from previous attempts — copied for reference only, not used |
| **validation/scripts/reference/batch-api-comparison.mjs** | Old batch comparison — reference only |
| **validation/scripts/reference/_mstarpy_batch_tmp.py** | Old mstarpy Python script — reference only |

---

## Files Adjusted (Not Created)

No existing files were modified. This phase was entirely additive — new modules, new tests, new reports. The existing XBRL engine (`edgarFinancials.js`) and Vitest test suite were not touched.

---

## Goals Achieved

| Goal | Status | Evidence |
|------|--------|----------|
| FY alignment works for non-Dec companies | Done | 19 non-Dec FY companies correctly aligned. LULU, NKE, COST, NVDA, AAPL all produce correct year mappings. 35 tests pass. |
| Harness reproduces known accuracy baseline | Done | New harness: 91.2%. Existing Vitest: 91.2%. Delta: 0.0 percentage points. Exact match. |
| Sign conventions handled correctly | Done | 77 sign-convention tests pass for all 101 mapped AAPL fields. Expenses flip from MS-negative to XBRL-positive correctly. |
| Single Node.js script, no Python dependency | Done | `node validation/scripts/compare-morningstar.mjs` runs end-to-end. Zero Python, zero R, zero external tools. |
| Console + JSON output, scannable for non-programmer | Done | Console shows overall %, per-company scores with top 3 failures. JSON file has full detail for drilling in. |

---

## Questions Answered

1. **What's our real accuracy?** 91.2% against Morningstar (not 86.4% — that was an intermediate number from attempt #2).

2. **How many fields are actually mapped?** 101 (not 87 — the old metadata count was stale). The field-mapping.json was extended after its `_meta` was written.

3. **How many non-Dec FY companies are in the truth set?** 19 (not 9 as initially thought). All correctly handled.

4. **Where are the biggest failures?** The JSON report's `topFailurePatterns` shows exactly which fields fail most often across companies — this is the hit list for Phase 3 engine fixes.

5. **Can we trust the harness?** Yes — it produces the exact same numbers as the existing Vitest suite (0.0pp delta). The measuring tool is solid.

---

## What's Left (Phases 2-5)

| What | Phase | Why |
|------|-------|-----|
| **Add FMP, SimFin, mstarpy data collectors** | Phase 2 | Need multiple sources to triangulate — when 3 sources agree and we don't, that's definitively our bug |
| **Build consensus engine + root cause tagger** | Phase 2 | Auto-classify each DIFF as OUR_BUG, METHODOLOGY_DIFF, or COVERAGE_GAP |
| **Fix XBRL normalization rules** | Phase 3 | Apply only the fixes that triangulation confirms are our bugs. Target: 98%+ |
| **Validate at S&P 500 scale** | Phase 4 | Prove fixes generalize beyond the 50-company truth set. Cancel FMP + SimFin subscriptions. |
| **Fix compensation engine bugs** | Phase 5 | 11 documented bugs affecting 27/30 companies. Can start after Phase 1 (parallel track). |

The 91.2% baseline is our starting point. The 1,232 DIFFs and 3,539 missing fields are what the next phases will systematically close.

---

*Phase: 01-comparison-harness*
*Executive Summary written: 2026-03-26*
