# Phase 17: End-to-End Validation - Context

**Gathered:** 2026-04-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Run MNST (Monster Beverage) through the complete 3-stage pipeline (One Pager → Pitch Deck → Full Story) in a single automated invocation with no manual intervention between stages. Each stage must pass quality scoring (OP: PASS verdict, PD: 85+ dual score, FS: 85+ dual score). The Full Story must demonstrate inheritance from the Pitch Deck. On success, generate PDFs for all stages. Total pipeline cost must stay within $15 ceiling.

This phase does NOT include UI integration, new features, or pipeline architecture changes — it validates what's already built.

</domain>

<decisions>
## Implementation Decisions

### Ticker Selection
- **D-01:** Validation ticker is **MNST** (Monster Beverage). Consumer Staples/beverages sector — different from SFM (Consumer Defensive/grocery). Large-cap with strong EDGAR coverage. Fresh ticker with no prior pipeline runs.

### Pipeline Orchestration
- **D-02:** Extend `run-pipeline.js` with a `--stage all` flag that chains OP → PD → FS in a single invocation. No new script — keep one entry point.
- **D-03:** Auto-advance between stages on gate pass. If OP verdict is PASS, PD starts automatically. If PD scores 85+, FS starts automatically. Fail fast on gate failure — stop pipeline and report which stage failed and why.
- **D-04:** Gate check between OP→PD uses the `overallVerdict` field from the one-pager output. Gate check between PD→FS uses quality scoring (run critic.js inline, check both mechanical and methodology scores are 85+).

### Quality Bar & Scoring
- **D-05:** Quality threshold is **85+** for both Pitch Deck and Full Story (mechanical AND methodology). One Pager uses PASS/FAIL verdict (no numeric score).
- **D-06:** If any stage scores below threshold, treat as a bug: diagnose root cause, fix (prompt/schema/critic), re-run. Phase is not complete until all stages pass.
- **D-07:** Quality scoring runs inline during the pipeline (not as a separate post-hoc step) so the gate check has scores before deciding whether to advance.

### Output & Artifacts
- **D-08:** Per-stage output files follow existing conventions in `.thes1s/reports/MNST/`:
  - `one-pager.json` — One Pager structured output
  - `pipeline-output.json` — Pitch Deck sections + metadata
  - `full-story-api.json` — Full Story sections + metadata
  - `quality/` — Per-stage quality reports (`.quality.json`)
  - `budget.json` — Cost breakdown per-agent and per-stage
- **D-09:** Inheritance proof: verify Full Story output references Pitch Deck findings. Check that checklist items cite PD section data, valuation confirmation uses same assumptions, and debate addresses the thesis from the Pitch Deck. This can be a section in the quality report or a separate validation check.
- **D-10:** On successful validation (all stages pass), generate PDFs for Pitch Deck and Full Story using existing PDF generation scripts (`scripts/pdf/`).

### Cost
- **D-11:** Total pipeline cost (OP + PD + FS) must stay within $15 ceiling (PM-approved in Phase 16). Budget tracker provides per-stage breakdown.

### Claude's Discretion
- Whether gate check scoring runs as part of pipelineManager or as a callback in run-pipeline.js
- How to structure the inheritance proof check (regex on narrative, field comparison, or dedicated validation function)
- Whether to add a `--ticker` flag to run-pipeline.js or keep the positional argument
- Internal implementation of the stage chaining logic
- PDF generation: whether to auto-trigger or require a separate flag

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Pipeline Infrastructure
- `scripts/run-pipeline.js` — CLI entry point to extend with `--stage all` chaining
- `src/engines/pipelineManager.js` — Wave-based orchestration, handles all 3 stages
- `src/engines/aiResearch.js` — Agent dispatch engine
- `src/engines/contextBudget.js` — Cost tracking and budget reports
- `src/engines/dataExport.js` — DataPacket assembly

### One Pager
- `src/engines/onePagerGenerator.js` — Single-call generator (Phase 16.1)
- `src/schemas/onePagerOutput.js` — Zod schema for structured output

### Quality Scoring
- `src/engines/critic.js` — Dual scoring (mechanical + methodology) for PD and FS
- `scripts/run-quality-v4.js` — Standalone quality runner (reference for inline scoring)
- `src/engines/qualityFormatter.js` — Quality report formatting

### Dispatch Configuration
- `agents/orchestrator/dispatch-table.json` — Stage configs for all 3 stages

### Existing Reports (reference for output format)
- `.thes1s/reports/SFM/` — Most complete example (PD + FS + quality reports)

### PDF Generation
- `scripts/pdf/` — Thes1s-branded PDF generation scripts

### Curriculum (for inheritance validation)
- `knowledge/stage-2-pitch-deck/template.md` — Pitch Deck structure
- `knowledge/stage-3-full-story/template.md` — Full Story structure (references PD findings)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `run-pipeline.js` — Already handles all 3 stages individually via `--stage` argument. Just needs chaining logic for `all`.
- `runPipeline()` in pipelineManager.js — Returns `{ sections, budget, cacheStats, errors, singleCallOutput }`. All the data needed for gate checks.
- `critic.js` — `validateStage()` produces `{ overallScore, overallMethodologyScore }`. Can be called inline.
- `formatBudgetReport()` — Already formats per-agent cost breakdowns.

### Established Patterns
- Pipeline output written to `.thes1s/reports/{TICKER}/` with consistent file naming
- Quality reports written to `.thes1s/reports/{TICKER}/quality/`
- Budget data included in pipeline output JSON
- `onWaveComplete` callback pattern for progress reporting

### Integration Points
- `run-pipeline.js` main() function — add stage chaining after Step 4 (write output)
- Gate check after OP: read `result.singleCallOutput.overallVerdict`
- Gate check after PD: call `validateStage('pitchDeck', sections)` from critic.js
- Full Story needs PD output as context — pipelineManager already reads prior stage files from `.thes1s/reports/{TICKER}/`

</code_context>

<specifics>
## Specific Ideas

- MNST chosen specifically because it's a clean large-cap beverages company with no prior pipeline artifacts — true end-to-end test
- The "auto-advance on gate pass" pattern mirrors the hedge fund model: if the screening pass (OP) says invest further, the deep research (PD) kicks off automatically
- Inheritance proof is critical — the whole point of 3 stages is that each builds on the prior. If the Full Story doesn't reference PD findings, the pipeline is generating in isolation rather than building a thesis
- PDF generation on success gives the PM a tangible deliverable to review quality holistically

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 17-end-to-end-validation*
*Context gathered: 2026-04-01*
