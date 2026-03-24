---
phase: 5A
slug: agent-definitions-foundation
status: draft
nyquist_compliant: false
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
| TBD | TBD | TBD | AGNT-01 | manual | User reviews agents/ definitions | N/A | ⬜ pending |
| TBD | TBD | TBD | DATA-01 | unit | `npm test -- --grep dataExport` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | DATA-02 | unit | `npm test -- --grep nodeAdapter` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | SCHM-01 | unit | `npm test -- --grep reportSchema` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | SCHM-02 | unit | `npm test -- --grep zodEnforcement` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | SCHM-04 | unit | `npm test -- --grep progressState` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/engines/__tests__/dataExport.test.js` — DataPacket assembly for known tickers
- [ ] `src/engines/__tests__/reportSchema.test.js` — Zod schema validation/rejection
- [ ] `src/engines/__tests__/nodeAdapter.test.js` — Node.js bridge shim verification

*Existing vitest infrastructure covers framework setup.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Agent definitions encode R1 methodology correctly | AGNT-01, AGNT-02, AGNT-03 | Requires domain expertise to evaluate curriculum accuracy | User reads each agents/{role}/prompt.md and config.json, verifies curriculum refs match role |
| Example contamination boundary | AGNT-04 | Requires human verification that LULU examples are absent from agent context | Search all prompt.md files for "LULU" references |
| Context engineering balance | AGNT-03 | Subjective: enough context to prevent hallucinations, not too much for token waste | User reviews token estimates per agent and judges balance |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
