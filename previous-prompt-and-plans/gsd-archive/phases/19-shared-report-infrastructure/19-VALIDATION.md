---
phase: 19
slug: shared-report-infrastructure
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-02
---

# Phase 19 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.0 |
| **Config file** | vitest.config.js (existing) |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 19-01-01 | 01 | 1 | INFRA-01 | unit (tdd) | `npx vitest run src/components/__tests__/reportHelpers.test.js` | Created in task (TDD) | ⬜ pending |
| 19-02-01 | 02 | 2 | INFRA-02, INFRA-04 | unit (tdd) | `npx vitest run src/hooks/__tests__/useScrollSpy.test.js src/components/__tests__/stageNavBar.test.js` | Created in task (TDD) | ⬜ pending |
| 19-02-02 | 02 | 2 | INFRA-02 | automated + manual | `npx vitest run --run` | N/A (refactor) | ⬜ pending |
| 19-03-01 | 03 | 2 | INFRA-03 | unit (tdd) | `npx vitest run src/components/__tests__/reportMarkdown.test.js` | Created in task (TDD) | ⬜ pending |
| 19-03-02 | 03 | 2 | INFRA-03 | automated | `npx vitest run --run` | N/A (refactor) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

All TDD tasks create their test files as the FIRST step within the task itself (test-before-implementation). No separate Wave 0 stubs needed because:

- 19-01-01: `tdd="true"` — Step 1 creates `src/components/__tests__/reportHelpers.test.js` before Step 2 creates implementation
- 19-02-01: `tdd="true"` — Step 1 creates `src/hooks/__tests__/useScrollSpy.test.js` and `src/components/__tests__/stageNavBar.test.js` before Step 2-3 create implementations
- 19-03-01: `tdd="true"` — Step 2 creates `src/components/__tests__/reportMarkdown.test.js` before Step 3 creates implementation

*Existing vitest infrastructure covers framework needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Scroll spy highlights without flicker | INFRA-02 | Requires real browser scroll events | Scroll through a report rapidly, verify active section updates smoothly |
| Sidebar accent bar renders in teal | D-08 | Visual styling verification | Open a report, scroll through sections, verify active section has teal left border |
| Stage nav bar renders with correct lock states | INFRA-04 | Visual UI component with routing | Navigate to report page, verify tabs visible with correct lock/active states |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 5s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved
