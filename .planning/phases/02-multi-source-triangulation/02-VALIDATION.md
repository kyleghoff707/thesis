---
phase: 02
slug: multi-source-triangulation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-26
---

# Phase 02 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

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
| TBD | TBD | TBD | TRI-01 | integration | `node validation/scripts/lib/fmp-collector.mjs --test AAPL` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | TRI-02 | integration | `node validation/scripts/lib/simfin-collector.mjs --test AAPL` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | TRI-03 | integration | `python3 validation/scripts/fetch-mstarpy.py --ticker AAPL` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | TRI-04 | unit | `npm test -- --run` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | TRI-05 | unit | `npm test -- --run` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | TRI-06 | integration | `node validation/scripts/triangulate.mjs --ticker AAPL` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] FMP collector test stubs for TRI-01
- [ ] SimFin collector test stubs for TRI-02
- [ ] Consensus engine unit tests for TRI-04
- [ ] Root cause tagger unit tests for TRI-05

*Existing vitest infrastructure covers framework needs — no additional setup required.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| fix-recommendations.json readability | TRI-06 | Subjective formatting | Review JSON structure, verify priorities make sense |
| Console regression diff readability | TRI-06 | Subjective formatting | Run triangulate.mjs, verify gained/lost output is scannable |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
