# Phase 10: Pipeline Integration & Prompt Fixes - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-28
**Phase:** 10-pipeline-integration-prompt-fixes
**Areas discussed:** DataPacket field path injection, PSR findings flow, End-to-end pipeline gaps, Prompt audit for API dispatch

---

## DataPacket Field Path Injection (FIX-01)

| Option | Description | Selected |
|--------|-------------|----------|
| Dynamic path block at dispatch time | Walk actual DataPacket slice, generate field path reference block, inject into user message. Keep existing prompt guidance. | ✓ |
| Replace hardcoded sections in prompt.md | Rewrite prompts to remove hardcoded field lists, instruct agents to discover paths from JSON. | |
| Both — dynamic block + updated prompts | Generate dynamic block AND update prompts to explicitly reference it. Belt and suspenders. | |

**User's choice:** Dynamic path block at dispatch time
**Notes:** User needed plain-English explanation of the problem (agents fabricating field paths) before deciding. Recommended option accepted after clarification.

---

## PSR Findings Flow

| Option | Description | Selected |
|--------|-------------|----------|
| Extract PSR narrative as psrFindings string | Extract narrative + primarySourceInsights from PSR agents, format as string, pass via options.psrFindings into cached system message block. | ✓ |
| Pass raw PSR section objects | Pass full section result objects to analysis agents. More data but higher token cost. | |
| You decide | Claude picks best approach. | |

**User's choice:** Extract PSR narrative as psrFindings string
**Notes:** User added two important clarifications: (1) Quarterly reader reads BOTH 10-Qs AND transcripts — already configured but should be explicit. (2) PSR readers must verify financial data from filings against DataPacket financials and flag discrepancies — filings are the source of truth.

---

## End-to-End Pipeline Gaps

### DataPacket Assembly

| Option | Description | Selected |
|--------|-------------|----------|
| Caller assembles, passes to runPipeline | Code calling runPipeline is responsible for assembleDataPacket() first. Pipeline is pure dispatch. | ✓ |
| Pipeline assembles internally | runPipeline calls assembleDataPacket() as first step. | |

**User's choice:** Caller assembles externally

### Synthesis Writer Input

| Option | Description | Selected |
|--------|-------------|----------|
| Pass all completed sections as priorSections | Existing mechanism — allSections array passed via options.priorSections. | ✓ |
| Build dedicated synthesis payload | Custom summary formatted for synthesis writer. | |

**User's choice:** Pass as priorSections (existing mechanism)

### Live Test Timing

| Option | Description | Selected |
|--------|-------------|----------|
| One live run in Phase 10 | Run pipeline once against real ticker to prove completion. Not quality eval. | ✓ |
| Save all live testing for Phase 11 | Phase 10 is pure code + unit tests. | |

**User's choice:** One live run in Phase 10
**Notes:** User requested to be present for the live pipeline run — "let me know before you run the full SFM pipeline." This is a PM checkpoint.

---

## Prompt Audit for API Dispatch

| Option | Description | Selected |
|--------|-------------|----------|
| Targeted fixes only | Scan for CC-specific references, outdated format instructions, dispatch pattern conflicts. Fix what's broken. | ✓ |
| Full prompt rewrite | Rewrite all 10 prompts from scratch for API dispatch. | |
| Skip prompt changes entirely | Trust prompts work as-is through API. | |

**User's choice:** Targeted fixes only

---

## Claude's Discretion

- Format of dynamic field path reference block
- PSR findings string formatting
- Which specific prompt.md lines need updating
- PSR agent sequencing (per dispatch-table.json flags)
- Test structure for field path generator

## Deferred Ideas

None — discussion stayed within phase scope
