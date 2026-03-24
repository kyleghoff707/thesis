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
| 01-T1 | 01 | 1 | ONEP-01 | structural | `grep -c "DRAFT" agents/business-analyst/prompt.md \| grep "^0$" && wc -l agents/business-analyst/prompt.md \| awk '{if ($1 >= 100) print "PASS"}'` | agents/business-analyst/prompt.md | pending |
| 01-T2 | 01 | 1 | ONEP-01 | structural | `grep -c "DRAFT" agents/financial-analyst/prompt.md \| grep "^0$" && wc -l agents/financial-analyst/prompt.md \| awk '{if ($1 >= 100) print "PASS"}'` | agents/financial-analyst/prompt.md | pending |
| 01-T3 | 01 | 1 | ONEP-01 | checkpoint | `wc -l agents/business-analyst/prompt.md agents/financial-analyst/prompt.md \| tail -1 \| awk '{if ($1 >= 200) print "PASS"}'` | N/A (human-verify) | pending |
| 02-T1 | 02 | 1 | ONEP-01 | structural | `grep -c "DRAFT" agents/valuation-specialist/prompt.md \| grep "^0$" && wc -l agents/valuation-specialist/prompt.md \| awk '{if ($1 >= 100) print "PASS"}'` | agents/valuation-specialist/prompt.md | pending |
| 02-T2 | 02 | 1 | ONEP-01 | structural | `grep -c "DRAFT" agents/synthesis-writer/prompt.md \| grep "^0$" && wc -l agents/synthesis-writer/prompt.md \| awk '{if ($1 >= 100) print "PASS"}'` | agents/synthesis-writer/prompt.md | pending |
| 02-T3 | 02 | 1 | ONEP-01 | checkpoint | `wc -l agents/valuation-specialist/prompt.md agents/synthesis-writer/prompt.md \| tail -1 \| awk '{if ($1 >= 200) print "PASS"}'` | N/A (human-verify) | pending |
| 03-T1 | 03 | 2 | ONEP-01 | structural | `test -f scripts/assemble-data.js && test -f .claude/skills/generate-one-pager/SKILL.md && echo "PASS"` | scripts/assemble-data.js, .claude/skills/generate-one-pager/SKILL.md | pending |
| 03-T2 | 03 | 2 | ONEP-01 | unit | `npx vitest run agents/__tests__/ccSkill.test.js` | agents/__tests__/ccSkill.test.js | pending |
| 03-T3 | 03 | 2 | ONEP-01 | integration | `node scripts/assemble-data.js AAPL 2>&1 \| tail -1` | scripts/assemble-data.js | pending |
| 04-T1 | 04 | 3 | ONEP-01 | checkpoint | `echo "User decision required"` | N/A (decision) | pending |
| 04-T2 | 04 | 3 | ONEP-01 | integration | `test -f .thes1s/reports/*/one-pager.json && test -f .thes1s/reports/*/one-pager.md && echo "PASS"` | .thes1s/reports/{TICKER}/*.json | pending |
| 04-T3 | 04 | 3 | ONEP-06 | manual | user benchmark comparison | .thes1s/reports/{TICKER}/one-pager.md | pending |

---

## Wave 0 Requirements

- Existing test infrastructure covers schema validation (13 tests), agent definitions (14 tests)
- Plan 03 Task 2 creates `agents/__tests__/ccSkill.test.js` for CC skill structural validation (new)
- Plan 03 Task 3 is an integration smoke test (live EDGAR API, ~30-60s) — separated from the fast structural tests in Task 2

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
