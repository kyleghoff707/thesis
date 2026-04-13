---
phase: 20
slug: full-story-core-viewer
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-02
---

# Phase 20 — Validation Strategy

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
| 20-01-00 | 01 | 1 | FS-01, FS-04 | unit | `npm test -- --run 2>&1 \| tail -10` | Yes (Wave 0) | pending |
| 20-01-01 | 01 | 1 | FS-01 | automated+manual | `npm test -- --run 2>&1 \| tail -10` + grep checks | Yes | pending |
| 20-01-02 | 01 | 1 | FS-01 | automated | `npm test -- --run 2>&1 \| tail -10` + build check | Yes | pending |
| 20-02-01 | 02 | 2 | FS-01, FS-04 | automated+manual | `npm test -- --run 2>&1 \| tail -10` + build check | Yes | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

Wave 0 test stubs are created by Plan 01 Task 0:

- [x] `src/components/__tests__/fullStory.test.js` -- Tests for SECTION_DEFS 6-key correctness, qualityColor threshold logic (green/yellow/red/muted), qualityMap join logic (sectionKey mapping)
- [x] `src/components/__tests__/sectionRenderer.test.js` -- Extended with tests for primarySourceInsights rendering contract (string array, object array, empty array guard) and searchesPerformed rendering contract (object with query, string-only, empty array guard)

These stubs test the contract/spec independently. Plan 02 adds `_testExports` to FullStory.jsx, enabling the stubs to be upgraded to import from the actual component.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Gate check blocks Full Story when PD not approved | FS-01 | UI interaction flow | Open FullStory for a ticker without PD approval, verify gate message shown |
| Hero renders judge verdict + quality scores | FS-01, FS-04 | Visual rendering | Load SFM Full Story, verify hero shows Bear verdict, quality 94/100 |
| 6 sections render with SectionRenderer | FS-01 | Visual rendering | Scroll through all 6 sections, verify narrative + data + citations visible |
| Quality badges show per-section scores | FS-04 | Visual rendering | Check each section header for Mech/Method pill badges with traffic-light colors |
| Approval bar appears when complete | FS-01 | UI interaction flow | Scroll to bottom, verify approve/reject buttons, test both flows |
| primarySourceInsights and searchesPerformed render | FS-01 | Visual rendering | Verify each section shows AI research sources |

---

## Automated Test Coverage

| Behavior | Requirement | Test File | Automated Command |
|----------|-------------|-----------|-------------------|
| SECTION_DEFS has exactly 6 correct keys | FS-01 | `src/components/__tests__/fullStory.test.js` | `npm test -- --run` |
| qualityColor returns correct colors for thresholds | FS-04 | `src/components/__tests__/fullStory.test.js` | `npm test -- --run` |
| qualityMap joins quality sections by sectionKey | FS-04 | `src/components/__tests__/fullStory.test.js` | `npm test -- --run` |
| primarySourceInsights accepts string and object arrays | FS-01 | `src/components/__tests__/sectionRenderer.test.js` | `npm test -- --run` |
| searchesPerformed accepts query objects and strings | FS-01 | `src/components/__tests__/sectionRenderer.test.js` | `npm test -- --run` |
| Empty arrays do not render blocks | FS-01 | `src/components/__tests__/sectionRenderer.test.js` | `npm test -- --run` |
| Build succeeds (JSX syntax valid) | FS-01 | N/A | `npm run build 2>&1 \| tail -5` |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify with `npm test -- --run`
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (fullStory.test.js + sectionRenderer.test.js extensions)
- [x] No watch-mode flags
- [x] Feedback latency < 5s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved
