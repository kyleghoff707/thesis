# Phase 5D: Quality System — Executive Summary

**Completed:** March 24, 2026
**Duration:** ~25 minutes (3 plans, 2 waves)
**Tests:** 75 new tests, all passing

---

## What This Phase Did

Phase 5D built the "compliance department" for the AI analyst team. After agents generate a report, the quality system checks every section: Are the citations real? Are all required fields present? Is the confidence level justified? Did any agent fail? How much did the generation cost?

This is what a real hedge fund PM does when reviewing analyst work — except automated. The system flags issues; the PM decides what to act on.

---

## What Was Built (Plain English)

### 1. critic.js — The Quality Validation Engine (Plan 01)

A pure validation engine that checks every generated report section across 6 quality dimensions:

1. **Citation validation** (QUAL-01) — For each citation, checks:
   - Thes1s native citations: verifies the DataPacket field path exists AND the cited value matches
   - SEC filing citations: validates well-formed reference format (filing type, year, page)
   - Web search citations: validates URL format (doesn't fetch — URLs go stale)
   - Handles both canonical `{id, ref, text, source}` and non-canonical `{id, source, url, note}` formats found in real output

2. **Completeness scoring** (QUAL-02) — Checks which required ReportSectionSchema fields are present vs missing, produces a percentage score per section

3. **Confidence validation** (QUAL-03) — Verifies HIGH/MEDIUM/LOW is justified by data completeness and source count, not arbitrary

4. **Multi-source verification** (QUAL-04) — Checks that key claims have 2-3+ supporting sources

5. **Red flag quality** (QUAL-05) — Validates at least one red flag per section, checks they're substantive (not generic filler)

6. **Data gap detection** (QUAL-06) — Identifies "honest gaps" where data wasn't available, verifies agents acknowledged them rather than fabricating

Produces a structured quality report: `{sectionKey, score, completeness, issues[], passed, checkedAt}`

Untraceable claims are flagged but don't block — the PM reviews and decides.

**Files created:**
- [src/engines/critic.js](src/engines/critic.js) — 622 lines, 11 exported functions, pure validation (no I/O, no network)
- [src/engines/__tests__/critic.test.js](src/engines/__tests__/critic.test.js) — 41 tests against real COST fixture data
- [src/engines/__tests__/fixtures/cost-section-company-info.json](src/engines/__tests__/fixtures/cost-section-company-info.json) — Real COST company_info section for testing
- [src/engines/__tests__/fixtures/cost-data-packet-slice.json](src/engines/__tests__/fixtures/cost-data-packet-slice.json) — Minimal DataPacket slice for path resolution tests

### 2. contextBudget.js — Token Estimation + Cost Tracking (Plan 02)

Measurement infrastructure for understanding generation costs. This is observe-first: measure actual usage across generations, set budgets later based on data.

- **estimateTokens(text)** — Character-based token estimation (~4 chars per token)
- **computeCost(tokens, model)** — Cost calculation using model pricing tables (Sonnet input/output, Opus input/output)
- **createBudgetTracker()** — Per-generation tracker that accumulates costs across agent calls
- **formatBudgetReport(tracker)** — Human-readable cost summary
- **MODEL_PRICING** — Current pricing for claude-sonnet-4-6 and claude-opus-4-6

**Files created:**
- [src/engines/contextBudget.js](src/engines/contextBudget.js) — 104 lines, pure functions, no I/O
- [src/engines/__tests__/contextBudget.test.js](src/engines/__tests__/contextBudget.test.js) — 17 tests covering all exports

### 3. CC Skill Integration + Failure Recovery (Plan 03)

Wired the quality system into the `/generate:one-pager` CC skill and added failure handling:

**Retry-then-escalate** (QUAL-07):
- Agent fails → retry once with error context injected ("Your previous attempt failed because...")
- Retry fails → save partial output, mark section as `status: 'failed'`, escalate to user with what failed, what was attempted, and partial results
- Like an analyst submitting an incomplete draft with notes on where they got stuck

**Quality check step** added to SKILL.md (Step 9):
- After all sections complete, run `validateStage()` from critic.js
- Quality report saved to `.thes1s/reports/{TICKER}/quality/`
- Flags shown to user with severity levels — PM decides what to act on

**Budget tracking step** added to SKILL.md (Step 10):
- Track token estimation per agent call
- Budget report saved to `.thes1s/reports/{TICKER}/budget.json`
- Generation cost summary shown at the end

**State persistence additions:**
- `saveQualityReport(ticker, report)` — persists quality report to disk
- `saveBudgetReport(ticker, report)` — persists budget report to disk
- `readQualityReport(ticker)` — reads quality report back

**Files modified:**
- [.claude/skills/generate-one-pager/SKILL.md](.claude/skills/generate-one-pager/SKILL.md) — Added Steps 6 (retry-then-escalate), 9 (quality check), 10 (budget tracking), 11 (final summary)
- [src/engines/progressState.js](src/engines/progressState.js) — Added saveQualityReport, saveBudgetReport, readQualityReport exports

---

## File Inventory — Quick Reference

### Production Code

| File | Lines | What It Does |
|------|-------|-------------|
| [src/engines/critic.js](src/engines/critic.js) | 622 | Citation validation, completeness scoring, confidence check, multi-source verification, red flag quality, data gap detection |
| [src/engines/contextBudget.js](src/engines/contextBudget.js) | 104 | Token estimation, cost calculation, budget tracking, model pricing |
| [src/engines/progressState.js](src/engines/progressState.js) | ~200 | Added quality + budget report persistence (3 new exports) |
| [.claude/skills/generate-one-pager/SKILL.md](.claude/skills/generate-one-pager/SKILL.md) | ~350 | Added retry-then-escalate, quality check, budget tracking steps |

### Tests

| File | Tests | What It Validates |
|------|-------|-------------------|
| [src/engines/__tests__/critic.test.js](src/engines/__tests__/critic.test.js) | 41 | All 6 quality dimensions against real COST data |
| [src/engines/__tests__/contextBudget.test.js](src/engines/__tests__/contextBudget.test.js) | 17 | Token estimation, cost math, budget tracker, report formatting |
| [src/engines/__tests__/progressState.test.js](src/engines/__tests__/progressState.test.js) | 17 | State persistence including new quality/budget report functions |

### Test Fixtures

| File | What |
|------|------|
| [src/engines/__tests__/fixtures/cost-section-company-info.json](src/engines/__tests__/fixtures/cost-section-company-info.json) | Real COST company_info section from generation |
| [src/engines/__tests__/fixtures/cost-data-packet-slice.json](src/engines/__tests__/fixtures/cost-data-packet-slice.json) | Minimal DataPacket for citation path verification |

---

## Requirements Covered

| Requirement | What | How |
|-------------|------|-----|
| QUAL-01 | Citation validation | critic.js `validateCitations()` — path exists + value matches |
| QUAL-02 | Completeness scoring | critic.js `checkCompleteness()` — required fields vs present |
| QUAL-03 | Confidence validation | critic.js `validateConfidence()` — justified by data quality |
| QUAL-04 | Multi-source verification | critic.js `checkMultiSource()` — key claims need 2-3+ sources |
| QUAL-05 | Red flag quality | critic.js `validateRedFlags()` — substantive, not generic |
| QUAL-06 | Data gap detection | critic.js `checkDataGaps()` — honest gaps, no fabrication |
| QUAL-07 | Retry-then-escalate | SKILL.md Step 6 — 1 retry with error context, then escalate with partial results |
| QUAL-08 | Token budget measurement | contextBudget.js — estimate tokens, compute costs, track per-generation |

---

## What's Next

**Phase 6: Pitch Deck** — the hardest phase. Multi-agent orchestration with 10 sections, 3 phase groups, structured checkpoints after each phase, and full LULU parity benchmark. Every agent follows the curriculum exactly. This is where the depth of the system gets truly tested.

---

## Planning Artifacts

| File | What |
|------|------|
| [05D-CONTEXT.md](05D-CONTEXT.md) | Design decisions — citation validation depth, failure recovery strategy |
| [05D-RESEARCH.md](05D-RESEARCH.md) | Technical research — citation schema gap, zero token costs, validation architecture |
| [05D-01-PLAN.md](05D-01-PLAN.md) | Plan: critic.js quality validation engine |
| [05D-02-PLAN.md](05D-02-PLAN.md) | Plan: contextBudget.js token estimation |
| [05D-03-PLAN.md](05D-03-PLAN.md) | Plan: CC skill integration + failure recovery |
| [05D-01-SUMMARY.md](05D-01-SUMMARY.md) | Execution summary: critic.js |
| [05D-02-SUMMARY.md](05D-02-SUMMARY.md) | Execution summary: contextBudget.js |
| [05D-03-SUMMARY.md](05D-03-SUMMARY.md) | Execution summary: CC skill integration |
