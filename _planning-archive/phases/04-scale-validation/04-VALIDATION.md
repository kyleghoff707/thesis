---
phase: 4
slug: scale-validation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-26
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.0 |
| **Config file** | `vitest.config.js` |
| **Quick run command** | `npm test -- --run` |
| **Full suite command** | `npm test -- --run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --run`
- **After every plan wave:** Run `npm test -- --run` + `node validation/scripts/compare-morningstar.mjs` (regression gate)
- **Before `/gsd:verify-work`:** Full suite must be green + MS accuracy >= 94%
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 01 | 1 | SCALE-02 | integration | `node validation/scripts/compare-sp500-fmp.mjs --dry-run` | ❌ W0 | ⬜ pending |
| 04-01-02 | 01 | 1 | SCALE-02 | integration | `node validation/scripts/compare-sp500-fmp.mjs --limit 5` | ❌ W0 | ⬜ pending |
| 04-02-01 | 02 | 2 | SCALE-01, SCALE-02 | integration | `node validation/scripts/compare-sp500-fmp.mjs` | ❌ W0 | ⬜ pending |
| 04-02-02 | 02 | 2 | SCALE-01 | regression | `node validation/scripts/compare-morningstar.mjs` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `validation/scripts/compare-sp500-fmp.mjs` — S&P 500 comparison orchestrator (created in Wave 1)
- [ ] `validation/data/sp500-tickers.json` — Cached S&P 500 ticker list (created in Wave 1)

*Existing infrastructure (`fmp-collector.mjs`, `comparator.mjs`, `field-alias-map.mjs`, `bundled-engines.mjs`) covers core needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| FMP data quality for 503 companies | SCALE-02 | API response review | Spot-check 5 random tickers' FMP cache files for completeness |
| RACE EUR investigation | SCALE-02 | Exploratory | Run comparison for RACE, review FMP vs engine output |
| Financial sector overlay fixes | SCALE-02 | Iterative investigation | Compare MET/WFC/JPM against FMP, document findings |
| Accuracy stabilization judgment | SCALE-01 | Human decision | User reviews iteration reports and decides when to stop |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
