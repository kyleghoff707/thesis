# Requirements: Thes1s Normalization Engine

**Defined:** 2026-03-25
**Core Value:** 98%+ accuracy match to Morningstar across all US-listed equities, achieved by triangulating our XBRL output against FMP, SimFin, and mstarpy — then fixing the normalization rules so we never need paid sources again.

## v1 Requirements

### Comparison Harness Infrastructure

- [ ] **HARNESS-01**: Fiscal year alignment engine with deterministic FY-end resolver using EDGAR `entityFiscalYearEnd` — maps every source's year labels to a canonical fiscal year
- [ ] **HARNESS-02**: Universal sign convention normalizer — per source per field sign multiplier table, so expenses/capex/etc compare correctly across EDGAR, FMP, SimFin, mstarpy, Morningstar
- [ ] **HARNESS-03**: Scale normalizer — mstarpy returns millions (×1e6), all others return full dollars. Applied automatically per source
- [ ] **HARNESS-04**: Universal field mapping JSON — single config file mapping all source field names to Thes1s canonical names (FMP `netIncome`, SimFin `Net Income`, Morningstar `Net Income after Non-Controlling/Minority Interests` → `net_income_loss`)
- [ ] **HARNESS-05**: All-JavaScript comparison harness replacing Python comparison scripts — single-language pipeline, no dual-language field mapping bugs

### Multi-Source Triangulation

- [ ] **TRI-01**: FMP data collector with per-ticker caching and 250 calls/day rate budget — income, balance, cashflow endpoints via Stable API
- [ ] **TRI-02**: SimFin data collector with per-ticker caching and 2,000 calls/day rate budget — compact endpoint with bank/insurance template support
- [ ] **TRI-03**: mstarpy Python subprocess bridge — data fetch only (income_statement, balance_sheet, cashflow), no computation in Python
- [ ] **TRI-04**: Triangulation consensus engine — for each field/year/company, collect all source values, compute consensus (median or mode within tolerance), classify Thes1s deviation
- [ ] **TRI-05**: Root cause tagger — auto-classify deviations as OUR_BUG (consensus exists, we differ), METHODOLOGY_DIFF (sources disagree), or COVERAGE_GAP (all null)
- [ ] **TRI-06**: Console + JSON reporter with regression diffing — shows current accuracy, fields gained/lost since last run, per-company breakdown

### Engine Fixes (Guided by Triangulation)

- [ ] **ENGINE-01**: Named item XBRL tag coverage fixes for top failure categories — intangibles (149 DIFFs), accrued liabilities (143), D&A variants (62), operating income (49)
- [ ] **ENGINE-02**: Residual "Other" field computation with per-company-year precondition gate — only compute residuals when named item coverage ≥ 95% for that record
- [ ] **ENGINE-03**: Financial sector overlay validation against truth set — run comparison for bank/REIT/insurance companies (BRK-B, JPM, WFC, MET) and tune overlay fields
- [ ] **ENGINE-04**: Regression protection via baseline snapshot diffing — every engine fix verified against full 50-company truth set, report fields gained/lost

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

| Requirement | Phase |
|-------------|-------|
| HARNESS-01 through HARNESS-05 | TBD — Roadmap |
| TRI-01 through TRI-06 | TBD — Roadmap |
| ENGINE-01 through ENGINE-04 | TBD — Roadmap |
| SCALE-01 through SCALE-04 | TBD — Roadmap |
| COMP-01, COMP-02 | TBD — Roadmap |
