# Phase 17: End-to-End Validation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-01
**Phase:** 17-end-to-end-validation
**Areas discussed:** Ticker selection, Pipeline orchestration, Quality bar & scoring, Output & artifacts

---

## Ticker Selection

| Option | Description | Selected |
|--------|-------------|----------|
| Fresh ticker | Pick a new company nobody's tested — proves generalization. Claude picks from a different sector. | |
| SFM (re-run all 3 stages) | Already has PD + FS data. Doesn't prove generalization. | |
| COST or POOL | Partial data from earlier testing. Old formats may confuse validation. | |

**User's choice:** "Let's go with MNST" (Monster Beverage — user-selected fresh ticker)
**Notes:** Consumer Staples/beverages, different sector from SFM. Large-cap with strong EDGAR coverage.

---

## Pipeline Orchestration

### Stage Chaining

| Option | Description | Selected |
|--------|-------------|----------|
| Single script, auto-advance | One invocation runs OP → PD → FS automatically. Gate check between stages. | ✓ |
| Manual stage-by-stage | Run each stage separately (3 invocations). PM reviews between stages. | |
| Single script, pause between | One script, pauses after each stage for Enter key. | |

**User's choice:** Single script, auto-advance
**Notes:** None

### Script Location

| Option | Description | Selected |
|--------|-------------|----------|
| Extend run-pipeline.js | Add --stage all flag. Keeps one entry point. | ✓ |
| New run-full-pipeline.js | Dedicated script. Cleaner separation but another file. | |

**User's choice:** Extend run-pipeline.js
**Notes:** None

---

## Quality Bar & Scoring

### Full Story Quality Threshold

| Option | Description | Selected |
|--------|-------------|----------|
| 85+ (same as Pitch Deck) | Consistent bar across stages. SFM hit 89/88 — achievable. | ✓ |
| 80+ (lower bar for v1.2) | Acknowledges FS pipeline is newer/less mature. | |
| Match SFM baseline within 5 pts | Anchored to 89/88 baseline (84+). | |

**User's choice:** 85+ (same as Pitch Deck)
**Notes:** None

### Failure Handling

| Option | Description | Selected |
|--------|-------------|----------|
| Diagnose + fix + re-run | Treat as bug. Fix root cause, re-run. Phase not done until pass. | ✓ |
| Log and continue | Record failure, keep going. Fix after all stages complete. | |
| Abort pipeline | Stop immediately. Fix before further stages. | |

**User's choice:** Diagnose + fix + re-run
**Notes:** None

---

## Output & Artifacts

| Option | Description | Selected |
|--------|-------------|----------|
| Per-stage JSON + quality reports | Standard file structure matching SFM. | ✓ |
| Consolidated summary | Single validation-report.md with all scores. | |
| Cost breakdown | Total pipeline cost with per-agent/stage breakdown. | ✓ (implicit via budget tracker) |
| Inheritance proof | Check FS references PD findings. | ✓ |

**User's choice:** Per-stage JSON + quality reports + inheritance proof. On success, also generate PDFs.
**Notes:** User specifically requested PDF generation on quality pass using standard practices.

---

## Claude's Discretion

- Gate check implementation location (pipelineManager vs run-pipeline.js callback)
- Inheritance proof check mechanism (regex, field comparison, or validation function)
- CLI flag design for run-pipeline.js extension
- PDF generation trigger (automatic vs flag-based)

## Deferred Ideas

None — discussion stayed within phase scope
