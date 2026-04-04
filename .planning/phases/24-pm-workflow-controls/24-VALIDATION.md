---
phase: 24
slug: pm-workflow-controls
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-04
---

# Phase 24 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x |
| **Config file** | `vitest.config.js` (existing) |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~2 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | TBD | unit/integration | `npm test` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Test stubs for checkpoint panel component
- [ ] Test stubs for comment persistence (IndexedDB)
- [ ] Test stubs for file attachment storage
- [ ] Test stubs for generate button state transitions

*Existing infrastructure covers test framework — only test files needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Checkpoint panel renders during pipeline | D-01, D-02 | Requires live pipeline execution | Run generation, verify panel appears at checkpoint states |
| File attachment upload and display | D-04 | Requires file picker interaction | Attach file via comment box, verify thumbnail/chip appears |
| Confirmation dialog copy and flow | D-12 | Visual/copy verification | Click Generate button, verify dialog text matches spec |
| Cross-tab navigation | D-14, D-15 | Route integration test | Click View Reports/View Toolbox, verify navigation |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
