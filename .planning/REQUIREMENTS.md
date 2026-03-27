# Requirements: Thes1s Normalization Engine

**Defined:** 2026-03-25
**Core Value:** 98%+ accuracy match to Morningstar across all US-listed equities, achieved by triangulating our XBRL output against FMP, SimFin, and mstarpy — then fixing the normalization rules so we never need paid sources again.

## v1 Requirements

### Comparison Harness Infrastructure

- [x] **HARNESS-01**: Fiscal year alignment engine with deterministic FY-end resolver using EDGAR `entityFiscalYearEnd` — maps every source's year labels to a canonical fiscal year
- [x] **HARNESS-02**: Universal sign convention normalizer — per source per field sign multiplier table, so expenses/capex/etc compare correctly across EDGAR, FMP, SimFin, mstarpy, Morningstar
- [x] **HARNESS-03**: Scale normalizer — mstarpy returns millions (×1e6), all others return full dollars. Applied automatically per source
- [x] **HARNESS-04**: Universal field mapping JSON — single config file mapping all source field names to Thes1s canonical names (FMP `netIncome`, SimFin `Net Income`, Morningstar `Net Income after Non-Controlling/Minority Interests` → `net_income_loss`)
- [x] **HARNESS-05**: All-JavaScript comparison harness replacing Python comparison scripts — single-language pipeline, no dual-language field mapping bugs

### Multi-Source Triangulation

- [x] **TRI-01**: FMP data collector with per-ticker caching and 250 calls/day rate budget — income, balance, cashflow endpoints via Stable API
- [x] **TRI-02**: SimFin data collector with per-ticker caching and 2,000 calls/day rate budget — compact endpoint with bank/insurance template support
- [x] **TRI-03**: mstarpy Python subprocess bridge — data fetch only (income_statement, balance_sheet, cashflow), no computation in Python
- [x] **TRI-04**: Triangulation consensus engine — for each field/year/company, collect all source values, compute consensus (median or mode within tolerance), classify Thes1s deviation
- [x] **TRI-05**: Root cause tagger — auto-classify deviations as OUR_BUG (consensus exists, we differ), METHODOLOGY_DIFF (sources disagree), or COVERAGE_GAP (all null)
- [ ] **TRI-06**: Console + JSON reporter with regression diffing — shows current accuracy, fields gained/lost since last run, per-company breakdown

### Engine Fixes (Guided by Triangulation)

- [x] **ENGINE-01**: Named item XBRL tag coverage fixes for top failure categories — intangibles (149 DIFFs), accrued liabilities (143), D&A variants (62), operating income (49)
- [ ] **ENGINE-02**: Residual "Other" field computation with per-company-year precondition gate — only compute residuals when named item coverage ≥ 95% for that record
- [ ] **ENGINE-03**: Financial sector overlay validation against truth set — run comparison for bank/REIT/insurance companies (BRK-B, JPM, WFC, MET) and tune overlay fields
- [x] **ENGINE-04**: Regression protection via baseline snapshot diffing — every engine fix verified against full 50-company truth set, report fields gained/lost

### Scale Validation

- [ ] **SCALE-01**: 98%+ accuracy on 50-company Morningstar truth set (annual financials)
- [ ] **SCALE-02**: S&P 500 structural validation — accounting identities + completeness checks across all 503 companies after each major fix
- [ ] **SCALE-03**: 98%+ accuracy across all US-listed equities (structural validation + spot checks on random sample outside S&P 500)
- [ ] **SCALE-04**: Elimination of paid API dependencies — FMP and SimFin subscriptions cancelled once normalization rules produce 98%+ independently

### Executive Compensation (Secondary)

- [ ] **COMP-01**: Fix 11 documented compensation engine bugs (column misalignment, name/title concatenation, duplicates, HTML entity decoding, footnote artifacts, director detection gaps, XBRL fallback failures)
- [ ] **COMP-02**: FMP compensation data comparison layer — validate our compensation extraction against FMP's 339-record AAPL dataset and extend across truth set

## v2 Requirements (Deferred)

- Quarterly financial normalization optimization (annual must reach 98% first)
- International equities / IFRS support
- Automated monthly validation pipeline (cronjob-style monitoring for new earnings, spinoffs, IPOs)
- Accuracy trend visualization dashboard

## Out of Scope

- OTC stocks — non-standard filings, poor XBRL quality, low value
- International equities / IFRS — fundamentally different taxonomy, multi-year effort
- Real-time or streaming data — this is historical financial statement accuracy
- UI changes — components, hooks, agents all off-limits (parallel AI agent buildout)
- Additional data sources beyond FMP + SimFin + mstarpy — three-source consensus is sufficient
- Automated fix application — human-in-the-loop for all normalization rule changes
- Database for comparison results — JSON files sufficient at this scale (~217K data points)
- Python for computation — data fetch only via mstarpy subprocess, all logic in JavaScript

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| HARNESS-01 | Phase 1 | Complete |
| HARNESS-02 | Phase 1 | Complete |
| HARNESS-03 | Phase 1 | Complete |
| HARNESS-04 | Phase 1 | Complete |
| HARNESS-05 | Phase 1 | Complete |
| TRI-01 | Phase 2 | Complete |
| TRI-02 | Phase 2 | Complete |
| TRI-03 | Phase 2 | Complete |
| TRI-04 | Phase 2 | Complete |
| TRI-05 | Phase 2 | Complete |
| TRI-06 | Phase 2 | Pending |
| ENGINE-01 | Phase 3 | Complete |
| ENGINE-02 | Phase 3 | Pending |
| ENGINE-03 | Phase 3 | Pending |
| ENGINE-04 | Phase 3 | Complete |
| SCALE-01 | Phase 4 | Pending |
| SCALE-02 | Phase 4 | Pending |
| SCALE-03 | Phase 4 | Pending |
| SCALE-04 | Phase 4 | Pending |
| COMP-01 | Phase 5 | Pending |
| COMP-02 | Phase 5 | Pending |
