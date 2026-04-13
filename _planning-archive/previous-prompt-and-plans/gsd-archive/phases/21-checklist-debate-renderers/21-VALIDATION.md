---
phase: 21
slug: checklist-debate-renderers
status: ready
nyquist_compliant: true
wave_0_complete: true
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
| 21-01-T0 | 01 | 1 | FS-02 | unit (Wave 0 stubs) | `npm test -- --run` (will fail until T2) | Yes | pending |
| 21-01-T1 | 01 | 1 | FS-02 | unit | `npm test -- --run src/components/__tests__/verdictBadge.test.js` | Yes | pending |
| 21-01-T2 | 01 | 1 | FS-02 | unit | `npm test -- --run src/components/__tests__/checklistRenderer.test.js` | Yes (Wave 0) | pending |
| 21-02-T0 | 02 | 1 | FS-03, FS-05 | unit (Wave 0 stubs) | `npm test -- --run` (will fail until T2) | Yes | pending |
| 21-02-T1 | 02 | 1 | FS-03 | unit | `npm test -- --run` | Yes | pending |
| 21-02-T2 | 02 | 1 | FS-03, FS-05 | unit | `npm test -- --run src/components/__tests__/debateRenderer.test.js` | Yes (Wave 0) | pending |
| 21-03-T1 | 03 | 2 | FS-02, FS-03, FS-05 | unit+integration | `npm test -- --run` | Yes | pending |
| 21-03-T2 | 03 | 2 | FS-02, FS-03, FS-05 | manual | Visual verification | N/A | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

Wave 0 test stubs created by plan tasks:

- [x] `src/components/__tests__/checklistRenderer.test.js` — 8 tests: computeBarSegments (5 cases), formatScoreText (3 cases). Created by 21-01 Task 0.
- [x] `src/components/__tests__/debateRenderer.test.js` — 17 tests: DATA_KEYS (4), DEFAULT_TAB (1), getStrengthStyle (5), getSeverityStyle (3), getExchangeVerdictColor (4). Created by 21-02 Task 0.

Both test files exercise pure helper functions via `_testExports` pattern (same as verdictBadge.test.js). No DOM rendering required.

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

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 5s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved
