---
phase: 16
slug: api-migration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-31
---

# Phase 16 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.0 |
| **Config file** | `vitest.config.js` (exists) |
| **Quick run command** | `npx vitest run src/engines/__tests__/critic.test.js` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~25 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/engines/__tests__/critic.test.js`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 16-01-01 | 01 | 1 | API-01 | integration | `node scripts/run-pipeline.js --stage fullStory --ticker SFM --dry-run` | ❌ W0 | ⬜ pending |
| 16-01-02 | 01 | 1 | API-02 | unit | `npx vitest run src/engines/__tests__/pipelineManager.test.js` | ✅ | ⬜ pending |
| 16-02-01 | 02 | 2 | API-01 | integration | `node scripts/run-pipeline.js --stage fullStory --ticker SFM` | ❌ W0 | ⬜ pending |
| 16-02-02 | 02 | 2 | API-03 | manual | `node scripts/run-quality-v4.js --ticker SFM --stage fullStory` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- Existing vitest infrastructure covers unit tests
- `scripts/run-pipeline.js` exists and handles pipeline dispatch
- `scripts/run-quality-v4.js` exists and handles quality scoring
- No new test framework installation needed

*Existing infrastructure covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Full Story quality >= 84/83 | API-03 | Requires live API call ($5-8) | Run `node scripts/run-pipeline.js --stage fullStory --ticker SFM`, then `node scripts/run-quality-v4.js --ticker SFM --stage fullStory` and verify scores >= 84 mechanical / 83 methodology |
| Combined pipeline cost <= $15 | API-03 | Requires actual cost data from live run | Check budget report output from pipeline run |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
