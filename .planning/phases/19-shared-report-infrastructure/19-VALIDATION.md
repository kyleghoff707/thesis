---
phase: 19
slug: shared-report-infrastructure
status: draft
nyquist_compliant: false
wave_0_complete: false
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
| 19-01-01 | 01 | 1 | INFRA-01 | unit | `npm test` | ❌ W0 | ⬜ pending |
| 19-02-01 | 02 | 1 | INFRA-02 | unit | `npm test` | ❌ W0 | ⬜ pending |
| 19-03-01 | 03 | 1 | INFRA-03 | unit | `npm test` | ❌ W0 | ⬜ pending |
| 19-02-02 | 02 | 1 | INFRA-04 | manual | visual verification | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/engines/__tests__/reportHelpers.test.js` — stubs for INFRA-01 formatting utilities
- [ ] `src/hooks/__tests__/useScrollSpy.test.js` — stubs for INFRA-02 scroll spy hook
- [ ] `src/components/__tests__/MarkdownRenderer.test.js` — stubs for INFRA-03 markdown rendering

*Existing vitest infrastructure covers framework needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Stage nav bar renders with correct lock states | INFRA-04 | Visual UI component with routing | Navigate to report page, verify tabs visible with correct lock/active states |
| Scroll spy highlights without flicker | INFRA-02 | Requires real browser scroll events | Scroll through a report rapidly, verify active section updates smoothly |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
