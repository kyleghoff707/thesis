---
phase: 01
slug: comparison-harness
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-25
---

# Phase 01 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `vitest.config.js` (existing) |
| **Quick run command** | `npm test -- --run` |
| **Full suite command** | `npm test -- --run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --run`
- **After every plan wave:** Run `npm test -- --run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | HARNESS-01 | unit | `npm test -- --run` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | HARNESS-02 | unit | `npm test -- --run` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | HARNESS-03 | unit | `npm test -- --run` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | HARNESS-04 | unit | `npm test -- --run` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | HARNESS-05 | integration | `node validation/scripts/run-comparison.mjs` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Comparison harness test file stubs for HARNESS-01 through HARNESS-05
- [ ] FY alignment unit tests for all 19 non-Dec FY companies in truth set
- [ ] Sign convention unit tests for AAPL 2024 all mapped fields

*Existing vitest infrastructure covers framework needs — no additional setup required.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Console output readability | HARNESS-05 | Subjective formatting | Run harness, verify output is scannable by non-programmer |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
