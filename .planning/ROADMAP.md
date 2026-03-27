# Roadmap: Thes1s Normalization Engine

## Overview

This milestone builds a production-grade financial data normalization pipeline in four sequential phases plus one secondary track. Phase 1 establishes a trustworthy all-JavaScript comparison harness — the lesson from two prior attempts is that fixing the measurement instrument must come before fixing the engine. Phase 2 adds three external data sources (FMP, SimFin, mstarpy) and a consensus engine that classifies each deviation as a real normalization bug vs a definitional ambiguity vs a coverage gap. Phase 3 applies only the fixes triangulation confirms as our bugs, targeting 98%+ accuracy on the 50-company truth set with regression protection at every step. Phase 4 validates those fixes scale to the full S&P 500 and all US-listed equities, then eliminates the paid data subscriptions. Phase 5 resolves the documented executive compensation engine bugs and can begin after Phase 1 without blocking the main accuracy track.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Comparison Harness** - Build an all-JavaScript comparison pipeline that produces trustworthy accuracy scores — correct fiscal year alignment, sign conventions, scale, and field mapping for all 50 truth-set companies (completed 2026-03-26)
- [ ] **Phase 2: Multi-Source Triangulation** - Add FMP, SimFin, and mstarpy data collectors with a consensus engine that classifies each deviation as our bug, definitional ambiguity, or coverage gap
- [ ] **Phase 3: Engine Fixes** - Apply triangulation-guided fixes to `edgarFinancials.js`, targeting 98%+ accuracy on the 50-company truth set with regression protection at every step
- [ ] **Phase 4: Scale Validation** - Confirm fixes generalize to the full S&P 500 and all US-listed equities, then eliminate the paid FMP and SimFin subscriptions
- [ ] **Phase 5: Compensation Engine** - Fix the 11 documented executive compensation extraction bugs and validate against FMP's compensation dataset

## Phase Details

### Phase 1: Comparison Harness
**Goal**: A comparison pipeline that produces provably correct accuracy scores for the 50-company truth set
**Depends on**: Nothing (first phase)
**Requirements**: HARNESS-01, HARNESS-02, HARNESS-03, HARNESS-04, HARNESS-05
**Success Criteria** (what must be TRUE):
  1. All 9 non-December fiscal year companies (LULU, NVDA, NKE, COST, etc.) show >99% revenue agreement after fiscal year alignment — confirming the aligner works before any other comparison is run
  2. Running the harness against the 50-company Morningstar truth set produces a single accuracy number that matches the known 86.4% baseline from Attempt #2 — confirming the new all-JS harness measures the same thing as the previous harness
  3. A sign convention test for AAPL 2024 passes for every mapped field — each source adapter produces the same sign for expenses, capex, and other sign-convention-sensitive fields
  4. The harness runs end-to-end from a single script call and outputs a JSON report plus console summary without requiring Python, R, or any tool outside Node.js
**Plans:** 2/2 plans complete

Plans:
- [x] 01-01-PLAN.md — Core comparison library modules (fiscal aligner, field mapper, comparator) with unit tests
- [x] 01-02-PLAN.md — Reporter + orchestrator script + baseline accuracy verification

### Phase 2: Multi-Source Triangulation
**Goal**: A 4-way comparison engine that classifies every deviation as CONSENSUS_DIFF (our bug), METHODOLOGY_DIFF (sources disagree), or COVERAGE_GAP (all null)
**Depends on**: Phase 1
**Requirements**: TRI-01, TRI-02, TRI-03, TRI-04, TRI-05, TRI-06
**Success Criteria** (what must be TRUE):
  1. FMP, SimFin, and mstarpy data collectors each cache per-ticker responses to disk and respect their daily rate limits — a full 50-company fetch completes within the FMP 250-call/day budget
  2. The triangulation engine produces a `fix-recommendations.json` file that lists every field/company combination where 3 or more sources agree and our engine disagrees — these are confirmed normalization bugs
  3. The root cause tagger labels each CONSENSUS_DIFF with a machine-readable cause (sign_flip, fy_offset, scale_error, tag_miss, derivation_error) — reducing manual root cause analysis from hours to reading a JSON file
  4. The reporter shows not just current accuracy but fields gained and lost compared to the previous run — regression diffing is visible from the console output
  5. Running the full pipeline against the 50-company truth set reveals which of the remaining 13.6% failures are real engine bugs vs Morningstar quirks vs definitional ambiguity
**Plans:** 3 plans

Plans:
- [x] 02-01-PLAN.md — Data collectors: field-mapping extension, shared disk cache, FMP/SimFin/mstarpy collectors + Python pre-fetch
- [x] 02-02-PLAN.md — Consensus engine + root cause auto-tagger (TDD)
- [x] 02-03-PLAN.md — Triangulation orchestrator + reporter with regression diffing + pipeline verification

### Phase 3: Engine Fixes
**Goal**: The normalization engine reaches 98%+ accuracy on the 50-company Morningstar truth set, with every fix verified against the full truth set before merging
**Depends on**: Phase 2
**Requirements**: ENGINE-01, ENGINE-02, ENGINE-03, ENGINE-04
**Success Criteria** (what must be TRUE):
  1. The 50-company truth set accuracy reaches 98%+ on scoring-critical fields — confirmed by running the Phase 2 pipeline after each fix batch
  2. No fix creates a net regression — the regression diff report shows fields gained exceeding fields lost for every applied fix
  3. The residual "Other" field computation is enabled only for company-years where named item coverage reaches the 95% precondition gate — the B7 failure mode (residuals amplifying upstream errors) does not recur
  4. Financial sector companies (BRK-B, JPM, WFC, MET) show improved accuracy after bank/REIT/insurance overlay tuning — the overlay fields are no longer the primary failure cluster for those companies
**Plans:** 4 plans

Plans:
- [x] 03-01-PLAN.md — Field alias map (16 naming mismatches) + pre-fix baseline snapshots for regression tracking
- [ ] 03-02-PLAN.md — REIT overlay fixes (revenue/COGS/interest/D&A) + short-term debt summation + bank null handling + PP&E reclassification
- [ ] 03-03-PLAN.md — Residual "Other" computation with 95% precondition gate + FY offset investigation + final 98%+ validation
- [ ] 03-04-PLAN.md — Category B harness alignment: accrued liabilities per-year fix + intangibles/operating income handler verification

### Phase 4: Scale Validation
**Goal**: Engine accuracy confirmed at 98%+ across all US-listed equities and paid data source subscriptions are cancelled
**Depends on**: Phase 3
**Requirements**: SCALE-01, SCALE-02, SCALE-03, SCALE-04
**Success Criteria** (what must be TRUE):
  1. The 50-company truth set scores 98%+ on annual financials — the primary milestone target is confirmed
  2. All 503 S&P 500 companies pass accounting identity validation (Assets = Liabilities + Equity, Gross Profit = Revenue - COGS, etc.) after applying the Phase 3 fixes — structural correctness at scale
  3. A random sample of 50 companies outside the S&P 500 (from the 5,758 US-listed universe) passes structural validation and spot-check field comparison — fixes generalize beyond the development truth set
  4. FMP and SimFin subscriptions are cancelled because the engine produces 98%+ accuracy without ongoing triangulation — the $35/month in paid sources is eliminated
**Plans**: TBD

### Phase 5: Compensation Engine
**Goal**: Executive compensation data is accurately extracted for the companies where the 11 documented bugs cause failures
**Depends on**: Phase 1 (harness infrastructure needed to run comparison against FMP)
**Requirements**: COMP-01, COMP-02
**Success Criteria** (what must be TRUE):
  1. The 11 documented compensation engine bugs (column misalignment, name/title concatenation, duplicates, HTML entity decoding, footnote artifacts, director detection gaps, XBRL fallback failures) are each covered by a failing test that passes after the fix
  2. Our compensation extraction matches FMP's 339-record AAPL dataset within a documented tolerance — the comparison confirms which discrepancies are our bugs vs FMP methodology differences
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4. Phase 5 can begin after Phase 1 completes.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Comparison Harness | 2/2 | Complete   | 2026-03-26 |
| 2. Multi-Source Triangulation | 0/3 | Planned | - |
| 3. Engine Fixes | 0/4 | Planned | - |
| 4. Scale Validation | 0/TBD | Not started | - |
| 5. Compensation Engine | 0/TBD | Not started | - |
