---
phase: 13
slug: cc-pipeline
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-29
---

# Phase 13 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.0 |
| **Config file** | inline in `package.json` |
| **Quick run command** | `npm test -- --run` |
| **Full suite command** | `npm test -- --run` |
| **Estimated runtime** | ~4 seconds |

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
| 13-01-01 | 01 | 1 | ORCH-01 | unit | `npm test -- --run src/engines/__tests__/progressState.test.js` | ✅ (needs new case) | ⬜ pending |
| 13-01-02 | 01 | 1 | ORCH-01 | manual | Manual: run `/generate:full-story TICKER` without PD | N/A (CC skill) | ⬜ pending |
| 13-01-03 | 01 | 1 | ORCH-01 | manual | Manual: run full skill, validate 5 section output files | N/A (CC skill) | ⬜ pending |
| 13-01-04 | 01 | 1 | ORCH-01 | manual | Manual: inspect section JSON `data` field for checklist scores | N/A (CC skill) | ⬜ pending |
| 13-01-05 | 01 | 1 | ORCH-01 | manual | Manual: observe checkpoint displays checklist scores | N/A (CC skill) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/engines/__tests__/progressState.test.js` — add test case for fullStory SECTION_KEYS (6 keys, not 8)

*Existing infrastructure covers most phase requirements. CC skill validation is inherently manual (run the skill, inspect output).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Gate check blocks without Pitch Deck | ORCH-01 | CC skill runtime behavior | Run `/generate:full-story TICKER` without existing pitch-deck.json |
| 5 sections generate with correct keys | ORCH-01 | CC skill orchestration output | Run full skill, check `.thes1s/reports/{TICKER}/sections/` for 5 fullStory files |
| Checklist sections have scored data | ORCH-01 | Structured output from agent | Inspect S2/S3/S4 section JSON `data` field for items/verdict/scoreDisplay |
| Checkpoint displays checklist scores | ORCH-01 | Terminal UI output | Observe checkpoint output shows "12/15 PASS, 2 PARTIAL, 1 FAIL" format |
| PD inheritance visible in citations | ORCH-01 | Agent behavior quality | Read generated sections, verify citations reference Pitch Deck findings |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
