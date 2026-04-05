---
phase: 6
slug: pitch-deck
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-25
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.0 |
| **Config file** | vitest.config.js (inferred from vite.config.js) |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 06-01-xx | 01 | 1 | PTCH-01 (agents) | manual-only | Manual: verify prompt.md files authored via /writing-skills | N/A | ⬜ pending |
| 06-02-xx | 02 | 2 | PTCH-01 (skill) | manual-only | Manual: run /generate:pitch-deck on test ticker | N/A | ⬜ pending |
| 06-03-xx | 03 | 3 | PTCH-02 | unit | `npx vitest run src/components/__tests__/pitchDeck.test.js -x` | ❌ W0 | ⬜ pending |
| 06-03-xx | 03 | 3 | PTCH-05 | unit | `npx vitest run src/components/__tests__/sensitivityTable.test.js -x` | ❌ W0 | ⬜ pending |
| 06-03-xx | 03 | 3 | PTCH-06 | unit | `npx vitest run src/components/__tests__/pitchDeck.test.js -x` | ❌ W0 | ⬜ pending |
| 06-04-xx | 04 | 4 | PTCH-13 | unit | `npx vitest run src/components/__tests__/deepDivePanel.test.js -x` | ❌ W0 | ⬜ pending |
| 06-04-xx | 04 | 4 | PTCH-14 | unit | `npx vitest run src/components/__tests__/industryCard.test.js -x` | ❌ W0 | ⬜ pending |
| 06-04-xx | 04 | 4 | PTCH-15 | unit | `npx vitest run src/components/__tests__/assumptionTracker.test.js -x` | ❌ W0 | ⬜ pending |
| 06-xx-xx | xx | xx | PTCH-03/04 | manual-only | Manual: verify checkpoints in terminal dialogue | N/A | ⬜ pending |
| 06-xx-xx | xx | xx | PTCH-07 | manual-only | Manual: verify PSR insights in generation output | N/A | ⬜ pending |
| 06-xx-xx | xx | xx | PTCH-10 | unit | `npx vitest run src/engines/__tests__/valuation.test.js -x` | ✅ exists | ⬜ pending |
| 06-xx-xx | xx | xx | CMD-01 | manual-only | Manual: run /generate:section for re-run | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/components/__tests__/pitchDeck.test.js` — stubs for PTCH-02 (10 sections render), PTCH-06 (FGR display)
- [ ] `src/components/__tests__/sensitivityTable.test.js` — stubs for PTCH-05 (matrix renders, color coding)
- [ ] `src/components/__tests__/deepDivePanel.test.js` — stubs for PTCH-13 (slide-out panel)
- [ ] `src/components/__tests__/industryCard.test.js` — stubs for PTCH-14 (popover glossary)
- [ ] `src/components/__tests__/assumptionTracker.test.js` — stubs for PTCH-15 (sidebar panel)

*Existing infrastructure covers Vitest framework. No new test dependencies needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| CC skill dispatches 3 phases correctly | PTCH-01 | CC skill runs in terminal, not testable in vitest | Run `/generate:pitch-deck COST`, verify 3 phases execute with correct agents |
| Checkpoint dialogue works | PTCH-03, PTCH-04 | Interactive terminal experience | At each checkpoint, ask a question, inject data, redirect a section |
| PSR agents produce structured insights | PTCH-07 | Requires real EDGAR data + filing download | Run generation, inspect `.thes1s/reports/{TICKER}/insights/` |
| FGR derivation interactive flow | PTCH-06 | Interactive 5-input PM dialogue | Run generation, verify each input is presented for confirmation |
| Section re-run command | CMD-01 | CC skill terminal command | Run `/generate:section COST pitchDeck 4`, verify single section regenerates |
| LULU parity benchmark | PTCH-16 | Subjective user evaluation | Side-by-side comparison with LULU Pitch Deck example |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
