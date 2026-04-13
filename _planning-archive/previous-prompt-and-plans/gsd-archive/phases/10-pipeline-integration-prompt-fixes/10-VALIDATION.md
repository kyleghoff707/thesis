---
phase: 10
slug: pipeline-integration-prompt-fixes
status: draft
nyquist_compliant: true
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
| 10-01-01 | 01 | 1 | FIX-01 | unit (TDD) | `npx vitest run src/engines/__tests__/aiResearch.test.js` | Yes | pending |
| 10-01-02 | 01 | 1 | D-02 | unit (TDD) | `npx vitest run src/engines/__tests__/pipelineManager.test.js` | Yes | pending |
| 10-02-01 | 02 | 1 | FIX-01 | structural | `node -e "..." (dispatch-table entry count)` | Yes | pending |
| 10-02-02 | 02 | 1 | FIX-01, D-06 | grep | `! grep -r "CC skill\|Claude Code" agents/*/prompt.md` | N/A (text check) | pending |
| 10-02-03 | 02 | 1 | D-06 | grep | `grep "API Dispatch Mode" agents/annual-reader/prompt.md agents/quarterly-reader/prompt.md` | N/A (text check) | pending |
| 10-03-01 | 03 | 2 | FIX-01, FIX-03, FIX-04, FIX-05 | integration | `test -f scripts/run-pipeline.js && node -e "..."` | Wave 2 | pending |
| 10-03-02 | 03 | 2 | FIX-01, FIX-03, FIX-04, FIX-05 | manual | PM-attended live pipeline run | N/A | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. Plan 01 uses TDD approach (tests written first, then implementation) -- vitest test files already exist for aiResearch.js and pipelineManager.js. New test cases are added as part of Plan 01's TDD tasks. This satisfies the Nyquist requirement: every code-producing task has automated verification via the TDD test-first workflow.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live pipeline produces 10 sections + synthesis | FIX-01, FIX-03, FIX-04, FIX-05 | Requires live Claude API calls with real ticker data | Run runPipeline('pitchDeck', sfmDataPacket) against SFM -- PM must be present (D-05 checkpoint) |
| Cache hits on agents 2+ in wave | API-03 (Phase 9) | Requires real API -- cache behavior cannot be unit tested | Check cache_read_input_tokens > 0 in budget report after pipeline run |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
