---
phase: 20
slug: full-story-core-viewer
status: draft
nyquist_compliant: false
wave_0_complete: false
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
| 20-01-01 | 01 | 1 | FS-01 | manual | Dev server visual check | N/A | ⬜ pending |
| 20-01-02 | 01 | 1 | FS-01 | manual | Dev server visual check | N/A | ⬜ pending |
| 20-02-01 | 02 | 1 | FS-04 | manual | Dev server visual check | N/A | ⬜ pending |
| 20-02-02 | 02 | 1 | FS-04 | manual | Dev server visual check | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No new test stubs needed — this phase is primarily UI component work validated by visual inspection and existing vitest suite passing.

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

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
