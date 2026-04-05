---
phase: 14
slug: adversarial-debate
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-30
---

# Phase 14 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.0 |
| **Config file** | implicit (vitest auto-detects from package.json) |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test` (ensure no regression in existing 173 tests)
- **After every plan wave:** Full pipeline run: `/generate:full-story {TICKER}` on a ticker with existing Pitch Deck
- **Before `/gsd:verify-work`:** Full suite must be green + debate output files inspected
- **Max feedback latency:** 5 seconds (unit tests) / manual for pipeline runs

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 14-01-01 | 01 | 1 | DEBATE-01 | manual-only | N/A -- CC skill orchestration | N/A | ⬜ pending |
| 14-01-02 | 01 | 1 | DEBATE-02 | manual-only | N/A -- inspect debate-step-2.json | N/A | ⬜ pending |
| 14-01-03 | 01 | 1 | DEBATE-03 | manual-only | N/A -- inspect debate-step-3.json | N/A | ⬜ pending |
| 14-01-04 | 01 | 1 | DEBATE-04 | manual-only | N/A -- inspect debate-step-4.json | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No new test framework or fixtures needed.

This phase modifies a CC skill (SKILL.md) -- a markdown script that Claude Code follows step by step. The debate is executed by dispatching Claude subagents, not by running unit-testable code. Validation requires running the full pipeline against a real ticker and inspecting output files.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 4-step debate executes sequentially with context passing | DEBATE-01 | CC skill orchestration -- subagent dispatch, not testable function | Run `/generate:full-story {TICKER}`, verify debate-step-{1-4}.json files exist in `.thes1s/reports/{TICKER}/sections/` |
| Bear inversions have web search citations + DataPacket refs | DEBATE-02 | Output quality of AI subagent, not deterministic | Inspect debate-step-2.json: `sources` arrays contain URLs and DataPacket paths |
| Bull rebuttal addresses each bear point with honest flag | DEBATE-03 | Output quality of AI subagent, not deterministic | Inspect debate-step-3.json: `rebuttals[]` has one entry per `inversions[]`, `honest` field present |
| Judge produces verdict per exchange + overall summary | DEBATE-04 | Output quality of AI subagent, not deterministic | Inspect debate-step-4.json: `exchanges[]` has verdicts, `overallVerdict` has direction + unresolvedCount |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: manual verification covers all requirements
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 5s (unit tests)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
