---
phase: 9
slug: parallel-dispatch-caching
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-28
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `vitest.config.js` (or inline in `package.json`) |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | API-02 | unit+integration | `npm test` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | API-03 | unit+integration | `npm test` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | API-06 | unit | `npm test` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | API-07 | unit | `npm test` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/engines/__tests__/pipelineManager.test.js` — stubs for API-02 (parallel dispatch), API-03 (cache verification)
- [ ] `src/engines/__tests__/contextBudget.test.js` — stubs for API-06 (cache monitor), API-07 (budget tracker)
- [ ] Shared fixtures: mock dispatchAgent results with usage fields

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Wall-clock parallelism | API-02 | Requires live API calls with timing measurement | Run pipeline with 3+ agents, verify wall-clock < sum of individual durations |
| Cache hits on 2nd+ agent | API-03 | Requires live API to produce cache_read_input_tokens | Run pipeline, check logs for cache_read_input_tokens > 0 on 2nd agent |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
