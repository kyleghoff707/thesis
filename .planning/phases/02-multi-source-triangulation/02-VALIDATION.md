---
phase: 02
slug: multi-source-triangulation
status: draft
nyquist_compliant: true
wave_0_complete: true
wave_0_pattern: tdd-inline
created: 2026-03-26
---

# Phase 02 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Wave 0 Note

Wave 0 is satisfied by the TDD-inline pattern used throughout this phase. Every `tdd="true"` task creates test files as the first step of the RED phase (before any implementation exists), which is the functional equivalent of a standalone Wave 0 plan. Specifically:
- Plan 01 Task 2 (fmp-collector), Task 3 (simfin-collector), Task 4 (mstarpy-collector) each create test stubs before implementation
- Plan 02 Task 1 (consensus engine), Task 2 (root-cause tagger) each write RED tests before implementation
- Plan 03 Task 1 (triangulation-reporter) writes tests before implementation

All MISSING automated verify references in the task verification map below are resolved by these inline RED phases.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest + integration scripts |
| **Config file** | `vitest.config.js` (existing) |
| **Quick run command** | `npm test -- --run` |
| **Full suite command** | `npm test -- --run && node validation/scripts/triangulate.mjs --ticker AAPL` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --run`
- **After every plan wave:** Run full suite including integration check
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | TRI-01 | integration | `node validation/scripts/lib/fmp-collector.mjs --test AAPL` | TDD-inline | ⬜ pending |
| TBD | TBD | TBD | TRI-02 | integration | `node validation/scripts/lib/simfin-collector.mjs --test AAPL` | TDD-inline | ⬜ pending |
| TBD | TBD | TBD | TRI-03 | integration | `python3 validation/scripts/fetch-mstarpy.py --ticker AAPL` | TDD-inline | ⬜ pending |
| TBD | TBD | TBD | TRI-04 | unit | `npm test -- --run` | TDD-inline | ⬜ pending |
| TBD | TBD | TBD | TRI-05 | unit | `npm test -- --run` | TDD-inline | ⬜ pending |
| TBD | TBD | TBD | TRI-06 | integration | `node validation/scripts/triangulate.mjs --ticker AAPL` | TDD-inline | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] FMP collector test stubs for TRI-01 — created inline (RED phase) in Plan 01 Task 2
- [x] SimFin collector test stubs for TRI-02 — created inline (RED phase) in Plan 01 Task 3
- [x] Consensus engine unit tests for TRI-04 — created inline (RED phase) in Plan 02 Task 1
- [x] Root cause tagger unit tests for TRI-05 — created inline (RED phase) in Plan 02 Task 2

*Existing vitest infrastructure covers framework needs — no additional setup required.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| fix-recommendations.json readability | TRI-06 | Subjective formatting | Review JSON structure, verify priorities make sense |
| Console regression diff readability | TRI-06 | Subjective formatting | Run triangulate.mjs, verify gained/lost output is scannable |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (satisfied by TDD-inline pattern)
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (TDD-inline RED phases serve as Wave 0)
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
