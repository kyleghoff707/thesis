---
phase: 03
slug: engine-fixes
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-26
---

# Phase 03 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.0 |
| **Config file** | vitest.config.js (implicit via package.json) |
| **Quick run command** | `npx vitest run src/engines/__tests__/harness/ --bail 1` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~22 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/engines/__tests__/harness/ --bail 1`
- **After every plan wave:** Run `npx vitest run` (full suite) + `node validation/scripts/triangulate.mjs` + `node validation/scripts/compare-morningstar.mjs`
- **Before `/gsd:verify-work`:** Full suite must be green, triangulation and Morningstar accuracy must not regress
- **Max feedback latency:** 25 seconds (vitest), ~3 min (triangulation), ~5 min (Morningstar comparison)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 1 | ENGINE-01 | integration | `node validation/scripts/triangulate.mjs --ticker AAPL` | ✅ | ⬜ pending |
| 03-01-02 | 01 | 1 | ENGINE-04 | integration | `node validation/scripts/compare-morningstar.mjs --ticker AAPL` | ✅ | ⬜ pending |
| 03-02-01 | 02 | 2 | ENGINE-01 | integration | `node validation/scripts/triangulate.mjs --ticker AMT` | ✅ | ⬜ pending |
| 03-02-02 | 02 | 2 | ENGINE-03 | integration | `node validation/scripts/triangulate.mjs --ticker JPM,WFC,MET` | ✅ | ⬜ pending |
| 03-03-01 | 03 | 3 | ENGINE-02 | unit | `npx vitest run src/engines/__tests__/edgarFinancials.test.js --bail 1` | ✅ | ⬜ pending |
| 03-04-01 | 04 | 4 | ENGINE-04 | integration | `node validation/scripts/compare-morningstar.mjs` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements:
- vitest test suite (293 harness tests)
- `validation/scripts/triangulate.mjs` (Phase 2 output)
- `validation/scripts/compare-morningstar.mjs` (Phase 1 output)
- `validation/reports/morningstar-accuracy.json` (91.2% baseline)

No new test infrastructure needed.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Morningstar accuracy reaches 98%+ | ENGINE-01 | Full pipeline run needed | Run `node validation/scripts/compare-morningstar.mjs` and check overall accuracy |
| No net regressions per batch | ENGINE-04 | Requires before/after comparison | Compare fix-recommendations.json before and after each batch |
| Financial sector companies improved | ENGINE-03 | Per-company inspection needed | Check BRK-B, JPM, WFC, MET accuracy in triangulation output |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 25s (vitest), < 5min (pipelines)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
