---
phase: 5A
slug: agent-definitions-foundation
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-03-24
---

# Phase 5A — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `vite.config.js` |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| P01-T2 | 01 | 1 | SCHM-01 | unit | `npx vitest run src/schemas/__tests__/reportSection.test.js` | src/schemas/__tests__/reportSection.test.js | pending |
| P01-T2 | 01 | 1 | SCHM-04 | unit | `npx vitest run src/schemas/__tests__/progress.test.js` | src/schemas/__tests__/progress.test.js | pending |
| P02-T2 | 02 | 1 | DATA-02 | unit | `npx vitest run src/engines/__tests__/nodeAdapter.test.js` | src/engines/__tests__/nodeAdapter.test.js | pending |
| P03-T1 | 03 | 2 | DATA-01 | unit | `npx vitest run src/engines/__tests__/dataExport.test.js` | src/engines/__tests__/dataExport.test.js | pending |
| P03-T2 | 03 | 2 | DATA-03 | unit | `npx vitest run src/engines/__tests__/toolbox.test.js` | src/engines/__tests__/toolbox.test.js | pending |
| P04-T3 | 04 | 3 | AGNT-01 | unit | `npx vitest run agents/__tests__/agentDefinitions.test.js` | agents/__tests__/agentDefinitions.test.js | pending |
| P05-T2 | 05 | 3 | SCHM-04 | unit | `npx vitest run src/engines/__tests__/progressState.test.js` | src/engines/__tests__/progressState.test.js | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [x] `src/schemas/__tests__/reportSection.test.js` — Zod schema validation/rejection (Plan 01, Task 2)
- [x] `src/schemas/__tests__/progress.test.js` — Progress state schema validation (Plan 01, Task 2)
- [x] `src/engines/__tests__/nodeAdapter.test.js` — Node.js bridge shim verification (Plan 02, Task 2)
- [x] `src/engines/__tests__/dataExport.test.js` — DataPacket assembly for known tickers (Plan 03, Task 1)
- [x] `src/engines/__tests__/toolbox.test.js` — Toolbox tool definitions (Plan 03, Task 2)
- [x] `agents/__tests__/agentDefinitions.test.js` — Agent structural validation (Plan 04, Task 3)
- [x] `src/engines/__tests__/progressState.test.js` — State persistence (Plan 05, Task 2)

*All Wave 0 test files are created within their respective plan tasks. Existing vitest infrastructure covers framework setup.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Agent definitions encode R1 methodology correctly | AGNT-01, AGNT-02, AGNT-03 | Requires domain expertise to evaluate curriculum accuracy | User reads each agents/{role}/prompt.md and config.json, verifies curriculum refs match role |
| Example contamination boundary | AGNT-04 | Requires human verification that LULU examples are absent from agent context | Search all prompt.md files for "LULU" references |
| Context engineering balance | AGNT-03 | Subjective: enough context to prevent hallucinations, not too much for token waste | User reviews token estimates per agent and judges balance |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
