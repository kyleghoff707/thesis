---
phase: 15
slug: quality-system
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-30
---

# Phase 15 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.0 |
| **Config file** | `vitest.config.js` (existing) |
| **Quick run command** | `npx vitest run src/engines/__tests__/critic.test.js` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/engines/__tests__/critic.test.js`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 15-01-01 | 01 | 1 | QUAL-01 | unit | `npx vitest run src/engines/__tests__/critic.test.js` | Exists (extend) | pending |
| 15-01-02 | 01 | 1 | QUAL-03 | unit | `npx vitest run src/engines/__tests__/critic.test.js` | Exists (extend) | pending |
| 15-01-03 | 01 | 1 | QUAL-01 | integration | `node scripts/run-quality-v4.js .thes1s/reports/SFM/full-story.json` | Exists (extend) | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. The vitest framework is installed, `critic.test.js` exists with 858 lines of Pitch Deck scoring tests, and SFM Full Story section JSON fixtures are available in `.thes1s/reports/SFM/sections/`.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Actionable feedback quality | QUAL-03 | Subjective — "actionable" depends on PM judgment | Read quality report for a Full Story section, verify methodology gaps are specific enough to guide re-generation |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
