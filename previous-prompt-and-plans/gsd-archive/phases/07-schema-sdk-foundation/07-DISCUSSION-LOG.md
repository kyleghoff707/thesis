# Phase 7: Schema & SDK Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-27
**Phase:** 07-schema-sdk-foundation
**Areas discussed:** looseObject strategy, Schema scope, Smoke test design

---

## looseObject Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| z.string() | Agent serializes data as JSON string. Orchestrator parses after. Simplest, guaranteed compatible. | ✓ |
| Per-section schemas | Create ~10 typed data schemas. Best validation but most upfront work. | |
| Test z.record() first | Try z.record(z.string(), z.unknown()) live. If it works, use it. If not, fall back to z.string(). | |

**User's choice:** z.string() (Recommended)
**Notes:** Consistent approach — same z.string() pattern for ChartSchema.config and ChartSchema.data as well.

### Follow-up: Chart fields

| Option | Description | Selected |
|--------|-------------|----------|
| z.string() for both | Same pattern as data field. Consistent. | ✓ |
| Drop charts from schema | Remove charts entirely, add in post-processing. | |

**User's choice:** z.string() for both
**Notes:** Consistency over simplification.

---

## Schema Scope

| Option | Description | Selected |
|--------|-------------|----------|
| API-facing only | Fix ReportSectionSchema + ChartSchema + CitationSchema. Leave internal schemas alone. | ✓ |
| All schemas | Fix everything that uses looseObject. More consistent but more risk. | |
| You decide | Claude picks scope. | |

**User's choice:** API-facing only (Recommended)
**Notes:** StageReportSchema, progress.js, dataPacket.js are internal validation only — no need to touch.

---

## Smoke Test Design

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal API call | Simple prompt, verify schema mechanics. ~$0.05. | |
| Realistic agent call | Actual prompt + DataPacket + web search. ~$0.50. | |
| Both | Minimal first, then realistic. ~$0.55. Belt and suspenders. | ✓ |

**User's choice:** Both
**Notes:** Two-stage approach. Stage 1 verifies schema mechanics. Stage 2 verifies agent + web search compatibility.

### Follow-up: Web search in smoke test

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, test it | Include web_search_20250305 in the realistic call. | ✓ |
| Defer to Phase 8 | Keep Phase 7 focused on schema only. | |

**User's choice:** Yes, test it
**Notes:** Validates the research finding that structured outputs + web search tool_use work together.

---

## Claude's Discretion

- Exact max_tokens value for smoke tests
- Standalone test script vs vitest integration
- ChartSchema.data array handling details

## Deferred Ideas

None
