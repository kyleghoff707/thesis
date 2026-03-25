# Phase 5D: Quality System - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 5D builds the automated quality checks that run on every generated section — citation validation, completeness scoring, confidence justification, failure recovery, and token budget measurement. This is the "compliance department" of the hedge fund analogy: analysts submit reports, the quality system flags issues, and the portfolio manager decides what to act on.

</domain>

<decisions>
## Implementation Decisions

### Citation Validation (critic.js) — QUAL-01
- **D-01:** Citation validation checks path existence AND value matches for Thes1s native citations. If a citation says `dataPacket.growthRates.earnings.10yr = 13.0%`, critic.js verifies that path exists in the DataPacket AND the value is actually 13.0%.
- **D-02:** SEC filing citations: validate well-formed reference format (has filing type, year, page). Do NOT fetch the actual filing to verify.
- **D-03:** Web search citations: validate URL format is valid. Do NOT fetch URLs (they go stale). Just check it looks like a real URL.
- **D-04:** Untraceable claims are flagged but don't block. Quality report shows severity levels. Report generation still completes — the PM reviews flags and decides whether to accept, regenerate, or investigate. Like compliance flagging issues for the PM.

### Failure Recovery — QUAL-07
- **D-05:** 1 retry with error context, then escalate. Agent fails → retry once with error message injected ("Your previous attempt failed because..."). If retry fails → save partial output, escalate to user with: what failed, what was attempted, partial results if any.
- **D-06:** Partial results preserved and marked as `status: 'failed'` in progress state. User can see what was attempted and decide if it's salvageable. Like an analyst submitting an incomplete draft with notes on where they got stuck.

### Claude's Discretion
- Completeness scoring implementation (QUAL-02) — which fields are "required" vs "optional" per section, scoring formula
- Confidence validation logic (QUAL-03) — how to verify HIGH/MEDIUM/LOW is justified by data completeness and source agreement
- Multi-source verification rules (QUAL-04) — which claims need 2-3+ sources
- Red flag enforcement (QUAL-05) — already enforced in prompts, quality system validates
- "Data not available" handling (QUAL-06) — already enforced in prompts ("honest gaps, never estimated numbers"), quality system validates
- Token budget measurement (QUAL-08) — contextBudget.js implementation, how to surface costs to user

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Schema (Contract to Validate Against)
- `src/schemas/reportSection.js` — ReportSectionSchema with all required fields, citations, crossCuttingFindings
- `src/schemas/dataPacket.js` — DataPacketSchema for validating citation paths

### Real Output (Test Data)
- `.thes1s/reports/COST/one-pager.json` — Real generated report with 62 citations, narratives, red flags
- `.thes1s/reports/COST/data-packet.json` — DataPacket for citation path verification

### Agent Infrastructure
- `agents/orchestrator/dispatch-table.json` — Section assignments for error routing
- `src/engines/progressState.js` — State persistence for failure tracking
- `.claude/skills/generate-one-pager/SKILL.md` — CC skill that quality system integrates with

### Quality Requirements
- `.planning/REQUIREMENTS.md` — QUAL-01 through QUAL-08 definitions

### Prior Phase Context
- `.planning/phases/05B-one-pager-display-components/05B-UI-POLISH-NOTES.md` — Citation rendering issues to coordinate with

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/engines/validation.js` — existing validation engine for financial data (different domain but same pattern)
- `src/schemas/reportSection.js` — Zod schema with `.safeParse()` for structural validation
- `src/engines/progressState.js` — updateSectionStatus() for marking sections as failed
- `src/engines/dataExport.js` — DataPacket structure for citation path resolution

### Established Patterns
- Engines are pure async functions returning data or null on failure
- Try/catch with null returns, callers check for null
- Console.warn for non-fatal errors
- Vitest for all tests

### Integration Points
- critic.js runs after each agent completes (inside CC skill or as post-processing)
- contextBudget.js wraps agent calls to measure token usage
- Failure recovery integrates with progressState.js state machine
- Quality report surfaces in the UI (Phase 5B OnePager component or future quality dashboard)

</code_context>

<specifics>
## Specific Ideas

- critic.js should produce a structured quality report per section: `{ score, issues: [{type, severity, claim, expected, actual}], passed: bool }`
- The quality report should be saved alongside the section JSON in `.thes1s/reports/{TICKER}/quality/`
- Token budget measurement is observe-first: measure actual usage across 5-10 generations before setting budgets
- Completeness scoring should check against ReportSectionSchema required fields, not a hardcoded list

</specifics>

<deferred>
## Deferred Ideas

- Quality dashboard in the UI — show quality scores per section visually
- Automated re-generation triggers based on quality scores
- Historical quality tracking across multiple generations
- Token budget alerts (warn when approaching limits)

</deferred>

---

*Phase: 05D-quality-system*
*Context gathered: 2026-03-24*
