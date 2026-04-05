---
phase: 23
slug: delight-feature-wiring
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-03
---

# Phase 23 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.0 |
| **Config file** | none (uses vite.config.js defaults) |
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
| 23-01-01 | 01 | 0 | DLT-01 | unit | `npm test -- --run src/engines/__tests__/deepDive.test.js` | ❌ W0 | ⬜ pending |
| 23-02-01 | 02 | 0 | DLT-02 | unit | `npm test -- --run src/components/__tests__/promiseTracker.test.js` | ❌ W0 | ⬜ pending |
| 23-03-01 | 03 | 0 | DLT-03 | unit | `npm test -- --run src/components/__tests__/glossaryHelpers.test.js` | ❌ W0 | ⬜ pending |
| 23-01-02 | 01 | 1 | DLT-01 | manual | Deep dive panel opens on "Tell me more" click | n/a | ⬜ pending |
| 23-02-02 | 02 | 1 | DLT-02 | manual | Promise Tracker section renders timeline cards | n/a | ⬜ pending |
| 23-03-02 | 03 | 1 | DLT-03 | manual | Glossary tooltip appears on term hover | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/engines/__tests__/deepDive.test.js` — deep dive engine: mock fetch, error handling, max depth tracking
- [ ] `src/components/__tests__/promiseTracker.test.js` — aggregate bar segment computation, score text formatting
- [ ] `src/components/__tests__/glossaryHelpers.test.js` — term density limiting (max 3 per paragraph)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Deep dive slide-out panel animation | DLT-01 | CSS transition timing | Click "Tell me more" → panel slides from right, 250ms |
| Glossary popover positioning | DLT-03 | Viewport-dependent absolute positioning | Hover underlined term → card appears below, not clipped |
| Promise timeline card expand/collapse | DLT-02 | Visual interaction | Click timeline card → evidence expands with chevron rotation |
| "Go Deeper" iterative deepening | DLT-01 | Requires Claude API call | Click "Go Deeper" → depth counter increments, new content appended |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
