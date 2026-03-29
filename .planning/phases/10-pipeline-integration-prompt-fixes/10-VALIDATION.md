---
phase: 10
slug: pipeline-integration-prompt-fixes
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-28
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.0 |
| **Config file** | `vitest.config.js` (project root) |
| **Quick run command** | `npx vitest run src/engines/__tests__/` |
| **Full suite command** | `npx vitest run src/engines/__tests__/` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/engines/__tests__/`
- **After every plan wave:** Run `npx vitest run src/engines/__tests__/`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 10-01-01 | 01 | 1 | FIX-01 | unit | `npx vitest run src/engines/__tests__/aiResearch.test.js` | ✅ | ⬜ pending |
| 10-02-01 | 02 | 1 | FIX-01 | unit | `npx vitest run src/engines/__tests__/pipelineManager.test.js` | ✅ | ⬜ pending |
| 10-03-01 | 03 | 2 | FIX-01, FIX-03, FIX-04, FIX-05 | integration | `npx vitest run src/engines/__tests__/` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. vitest and test files already exist for aiResearch.js, pipelineManager.js, contextBudget.js, and cacheMonitor.js.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live pipeline produces 10 sections + synthesis | FIX-01, FIX-03, FIX-04, FIX-05 | Requires live Claude API calls with real ticker data | Run runPipeline('pitchDeck', sfmDataPacket) against SFM — PM must be present (D-05 checkpoint) |
| Cache hits on agents 2+ in wave | API-03 (Phase 9) | Requires real API — cache behavior cannot be unit tested | Check cache_read_input_tokens > 0 in budget report after pipeline run |

*If none: "All phase behaviors have automated verification."*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
