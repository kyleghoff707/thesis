---
phase: 21
slug: checklist-debate-renderers
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-03
---

# Phase 21 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.js (or vite.config.js) |
| **Quick run command** | `npm test -- --run` |
| **Full suite command** | `npm test -- --run` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --run`
- **After every plan wave:** Run `npm test -- --run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | FS-02, FS-03, FS-05 | unit+manual | `npm test -- --run` | Wave 0 | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

Wave 0 test stubs to be defined by planner:

- [ ] `src/components/__tests__/checklistRenderer.test.js` — Tests for aggregate bar math, item verdict mapping, expand/collapse behavior
- [ ] `src/components/__tests__/debateRenderer.test.js` — Tests for tab navigation, role color mapping, exchange strength comparison layout

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Checklist items expand/collapse on click | FS-02 | UI interaction | Click item row, verify evidence reveals. Click again, verify collapse. |
| Segmented bar proportions match counts | FS-02 | Visual rendering | Load SFM Full Story, verify meaning checklist bar matches 12/3/0 ratio |
| Debate tabs switch content without page scroll | FS-05 | UI interaction | Click each tab (Bull/Bear/Rebuttal/Judge), verify content changes and scroll position maintained |
| Role-specific left border colors render | FS-03 | Visual rendering | Check each tab has correct left border (green/red/teal/slate) |
| Judge exchanges show side-by-side strength | FS-03 | Visual rendering | Check Judge tab, verify Bull/Bear strength indicators per exchange |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
