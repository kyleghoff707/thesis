# Phase 10: Pipeline Integration & Prompt Fixes - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire all 10 Pitch Deck sections + synthesis into a single `runPipeline('pitchDeck', dataPacket)` call that completes end-to-end with mechanical format compliance on every section. Fix the DataPacket field path fabrication problem (FIX-01). Audit and fix prompts for API dispatch compatibility. Prove the pipeline works with one live run.

FIX-03, FIX-04, FIX-05 are already enforced by the structured output schema (`reportSection.js`): citations as `{id, ref, text, source}`, searchesPerformed as `{query, resultCount, usedInSection}`, redFlags as `string[]`. No additional work needed unless the live test reveals schema violations.

</domain>

<decisions>
## Implementation Decisions

### DataPacket field path injection (FIX-01)
- **D-01:** Generate a dynamic field path reference block at dispatch time. Walk the actual DataPacket slice (top-level + second-level keys) and inject the resulting "cheat sheet" into the user message alongside the DataPacket JSON. Existing hardcoded field lists in prompt.md files stay as guidance for what the fields mean, but the dynamic block is the source of truth for what fields actually exist. Agents must cite only paths that appear in the reference block.

### PSR findings flow
- **D-02:** After PSR agents (annual-reader + quarterly-reader) complete, extract their `section.narrative` + `section.primarySourceInsights` into a formatted psrFindings string. Pass it as `options.psrFindings` to all analysis agents. It goes into the cached system message block (Phase 9 D-03) at 0.1x cache read cost.
  - **Important:** The quarterly reader reads BOTH 10-Qs AND earnings call transcripts. This is already configured in its `dataPacketSlice` (includes `transcripts` and `filings`).
  - **Financial verification:** PSR readers must verify financial data read directly from filings against the DataPacket financials. Flag any discrepancies. **Filings are the source of truth.** If the XBRL extraction missed something or a number doesn't match, the PSR reader catches it and analysis agents are made aware via the psrFindings string.

### End-to-end pipeline
- **D-03:** Caller assembles DataPacket externally via `assembleDataPacket()` and passes it to `runPipeline()`. The pipeline manager is pure dispatch — it does not know about EDGAR, Yahoo, or any data engines.
- **D-04:** The synthesis writer receives all completed sections via the existing `priorSections` mechanism. By the time postProcessing runs, `allSections` contains all 10 section objects — no new mechanism needed.
- **D-05:** One live end-to-end run in Phase 10 to prove the pipeline completes (all 10 sections + synthesis produced, no crashes). This is NOT a quality evaluation — Phase 11 does rigorous quality/cost/runtime validation.
  - **CHECKPOINT:** The live pipeline run is a PM checkpoint. User must be present when it runs. Do NOT fire it automatically in an executor agent — this must be a human-attended task.

### Prompt audit
- **D-06:** Targeted fixes only. Scan all 10 agent prompts for: (a) Claude Code-specific references that don't apply to API dispatch, (b) outdated format instructions now handled by structured output schema, (c) anything contradicting the new dispatch pattern. Fix what's broken, leave working prompts alone. Do not rewrite prompts that already produce good output.

### Claude's Discretion
- Format of the dynamic field path reference block (indentation, grouping, depth of nesting shown)
- How psrFindings string is formatted (markdown sections, bullet points, etc.)
- Which specific prompt.md lines need updating during the audit (Claude reads them and decides)
- Whether PSR agents run sequentially or partially in parallel (dispatch-table.json has parallelism flags)
- Test structure for the dynamic field path generator

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Pipeline architecture
- `agents/orchestrator/dispatch-table.json` — Wave structure, section-to-agent mapping, checkpoint rules, parallelism flags
- `agents/orchestrator/config.json` — Section mapping, checkpoint rules
- `agents/orchestrator/README.md` — State machine, checkpoint format, FGR confirmation rule

### Phase 8-9 outputs (foundation)
- `src/engines/aiResearch.js` — `dispatchAgent()` with `buildSystemBlocks`, `buildUserMessage`, cache_control breakpoints, psrFindings/pmFeedback options
- `src/engines/pipelineManager.js` — `runPipeline()` with wave-based Promise.allSettled dispatch, onWaveComplete callback, budget/cache tracking
- `src/engines/cacheMonitor.js` — Cache hit rate tracking (70% threshold)
- `src/engines/contextBudget.js` — Actual-usage budget tracker
- `src/engines/dataExport.js` — `assembleDataPacket()` for DataPacket construction

### Agent prompts (all 10 Pitch Deck analysts)
- `agents/business-analyst/prompt.md` — Sections 1-2 (Radar, Simple & Predictable)
- `agents/competitor-evaluator/prompt.md` — Sections 3-4 (Market Position, Barriers & Moats)
- `agents/financial-analyst/prompt.md` — Sections 5, 7-8 (FCF, ROE/ROIC/Debt, Balance Sheet)
- `agents/management-evaluator/prompt.md` — Section 6 (Management)
- `agents/risk-analyst/prompt.md` — Section 9 (PEST Risks)
- `agents/valuation-specialist/prompt.md` — Section 10 (Valuation)
- `agents/annual-reader/prompt.md` — PSR: 10-K reading
- `agents/quarterly-reader/prompt.md` — PSR: 10-Q + transcript reading
- `agents/synthesis-writer/prompt.md` — Post-processing synthesis

### Agent configs (dataPacketSlice definitions)
- `agents/business-analyst/config.json` — slices: companyInfo, classification, ruleOneScore, peers
- `agents/competitor-evaluator/config.json` — slices: peers, peerMetrics, classification, companyInfo
- `agents/financial-analyst/config.json` — slices: financials, ttm, growthRates, returnMetrics, debtMetrics, fcf, keyMetrics
- `agents/management-evaluator/config.json` — slices: compensation, insiders, gurus, companyInfo
- `agents/risk-analyst/config.json` — slices: companyInfo, events, analystEstimates, classification
- `agents/valuation-specialist/config.json` — slices: growthRates, returnMetrics, fcf, analystEstimates, ttm, currentPrice, keyMetrics

### Schema
- `src/schemas/reportSection.js` — ReportSectionSchema with CitationSchema, structured output format (FIX-03/04/05 already enforced)

### Requirements
- `.planning/REQUIREMENTS.md` — FIX-01, FIX-03, FIX-04, FIX-05 are the requirements for this phase

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/engines/aiResearch.js` — `buildUserMessage()` already includes DataPacket JSON in a code fence. FIX-01 field path block should be injected here, before the JSON.
- `src/engines/aiResearch.js` — `sliceDataPacket()` already extracts the correct subset per agent. The field path generator walks the output of this function.
- `src/engines/pipelineManager.js` — `runPipeline()` already has pre-processing → waves → post-processing flow with psrFindings threading and onWaveComplete callbacks.
- `src/engines/dataExport.js` — `assembleDataPacket()` builds the full DataPacket from all engine outputs.

### Established Patterns
- Engines return `null` on failure, callers check for null
- Named exports, `_testExports` for internal helpers
- `try/catch` with `console.warn` for non-fatal errors
- TDD with vitest: write failing tests first, then implement

### Integration Points
- `buildUserMessage()` in aiResearch.js is where the field path block gets injected
- `pipelineManager.js` pre-processing loop is where PSR findings get extracted and formatted
- Agent prompt.md files may need targeted edits for API dispatch compatibility

</code_context>

<specifics>
## Specific Ideas

- PSR financial verification against DataPacket is a key quality gate — readers catch XBRL extraction errors before analysis agents cite incorrect numbers
- The live pipeline run is PM-attended — user wants to be present when it fires. Treat as a checkpoint, not an automated task.
- Quarterly reader handles both 10-Qs AND transcripts (already configured, but make this explicit in any documentation)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 10-pipeline-integration-prompt-fixes*
*Context gathered: 2026-03-28*
