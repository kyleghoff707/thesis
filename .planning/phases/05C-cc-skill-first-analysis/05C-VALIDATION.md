---
phase: 05C
slug: cc-skill-first-analysis
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-24
---

# Phase 05C — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.0 |
| **Config file** | vitest.config implicit (package.json) |
| **Quick run command** | `npx vitest run src/schemas/__tests__/ agents/__tests__/` |
| **Full suite command** | `npx vitest run src/ agents/` |
| **Estimated runtime** | ~4 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick suite
- **After every plan wave:** Run full suite
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | ONEP-01 | integration | `npx vitest run` | TBD | pending |
| TBD | TBD | TBD | ONEP-06 | manual | user benchmark comparison | N/A | pending |

*Status: pending — will be filled after plans are created*

---

## Wave 0 Requirements

- Existing test infrastructure covers schema validation (13 tests), agent definitions (14 tests)
- New tests needed for CC skill orchestration logic (if any testable components)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| One Pager section depth | ONEP-06 | Quality is subjective — requires human judgment | User reads generated One Pager side-by-side with LULU benchmark PDF, judges 80%+ depth match per section |
| Citation accuracy | ONEP-01 | Requires verifying claims against real financial data | User spot-checks 5+ citations trace to real DataPacket values or SEC filings |
| Contamination boundary | ONEP-01 | Requires confirming LULU content absent from agent context | User reviews agent prompts and CC skill to verify no LULU example paths loaded |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
