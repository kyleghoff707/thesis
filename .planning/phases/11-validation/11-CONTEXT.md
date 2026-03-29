# Phase 11: Validation - Context

**Gathered:** 2026-03-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 11 validates the Pitch Deck API pipeline on two dimensions: (1) mechanical compliance via the existing critic.js quality system (citations, completeness, search compliance), and (2) Rule One methodology compliance via new methodology scoring in critic.js. A second ticker from a different sector proves the pipeline generalizes. Cost and runtime targets are already met ($8.53, 19 min).

This phase does NOT include UI integration, delight feature wiring, or in-app generation triggers — those are deferred to the next milestone (v1.2).

</domain>

<decisions>
## Implementation Decisions

### Methodology Scoring (New)
- **D-01:** Add a separate methodology score to critic.js that checks Rule One compliance per section. This is distinct from the existing mechanical quality score. Both scores are reported independently — "mechanical: 94, methodology: 78" — so the PM can see pipeline health vs analysis quality separately.
- **D-02:** Medium depth checks — specific enough to catch sections that skip methodology steps, but not so granular that we're parsing prose for subjective quality. Focus on: required methodology elements present, required data points cited, required analytical steps performed.
- **D-03:** Methodology checks are section-specific. Each of the 10 Pitch Deck sections has its own checklist derived from the curriculum (pitch-deck-I through IV). Examples:
  - **Radar:** Does it cover all 3 Ms (Meaning, Moat, Management)? Is there a company snapshot with key metrics?
  - **FCF:** Does it distinguish maintenance vs growth capex? Is owner earnings calculated? Is FCF ratio present?
  - **Valuation:** Are all 5 FGR inputs present with values? Are all 4 valuation methods computed (MOS, PBT, Ten Cap, Equity Bond)? Are sensitivity ranges present?
  - **PEST:** Does it cover all 4 categories (Political, Economic, Social, Technological)?
  - **Barriers & Moats:** Does it identify a specific moat type (brand, switching costs, toll bridge, secret, price)?
- **D-04:** Methodology score is per-section (like the mechanical score), with an overall methodology score as the average. Each check is pass/fail with a weight. Missing a critical methodology element (e.g., no FGR derivation in Valuation) is weighted heavier than missing a supplementary element (e.g., no market share ceiling analysis).

### Validation Targets
- **D-05:** VAL-01 (SFM 85+ mechanical) is already achieved at 94. No rerun needed — accept the current V4 score.
- **D-06:** VAL-02 (second ticker, different sector) runs end-to-end and scores 85+ mechanical AND passes methodology checks. Ticker selection is Claude's discretion — pick something from a different sector than Consumer Defensive that has good EDGAR coverage.
- **D-07:** VAL-03 ($8-12 cost) and VAL-04 (30-40 min runtime) are already met. Verify the second ticker stays in range.
- **D-08:** The filing content fix from Phase 10 (Bug #3 — PSR agents lacked actual 10-K text) will be validated as part of the second ticker run, not as a separate SFM rerun.

### Quality Script
- **D-09:** The `scripts/run-quality-v4.js` script stays as the CLI entry point for running quality checks. Extend it to also report methodology scores alongside mechanical scores.

### Claude's Discretion
- Exact methodology checklist items per section (derive from curriculum files)
- Weighting of critical vs supplementary methodology elements
- Second ticker selection (any sector except Consumer Defensive, good EDGAR coverage)
- Whether methodology checks need their own test file or extend existing critic.test.js
- Internal structure of the methodology scoring functions

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Quality System
- `src/engines/critic.js` — Existing mechanical quality scoring (citations, completeness, confidence, search compliance). Methodology scoring extends this.
- `src/engines/__tests__/critic.test.js` — 162 existing tests for critic.js
- `src/engines/qualityFormatter.js` — Markdown report formatter (needs to include methodology scores)
- `scripts/run-quality-v4.js` — CLI entry point for quality checks

### Rule One Curriculum (source of methodology checklists)
- `knowledge/stage-2-pitch-deck/pitch-deck-I.md` — Sections 1-3 methodology (Radar, Simple & Predictable, Dominance)
- `knowledge/stage-2-pitch-deck/pitch-deck-II.md` — Sections 4-6 methodology (Barriers, FCF, Management)
- `knowledge/stage-2-pitch-deck/pitch-deck-III.md` — Sections 7-9 methodology (Returns/Debt, Balance Sheet, PEST)
- `knowledge/stage-2-pitch-deck/pitch-deck-IV.md` — Section 10 methodology (Valuation — MOS, PBT, Ten Cap, Equity Bond, FGR)
- `knowledge/research-references/fgr.md` — FGR methodology (5 inputs)
- `knowledge/research-references/rule-one-fundamentals.md` — 3 Ms framework, moat types, operating rules

### Pipeline Output (validation input)
- `.thes1s/reports/SFM/pipeline-output.json` — V4 API pipeline output (13 sections, $8.53)
- `.thes1s/reports/SFM/quality/pitch-deck-v4.quality.json` — Current mechanical quality report (score: 94)

### Agent Prompts (what agents were told to produce)
- `agents/business-analyst/prompt.md` — Sections 1-2
- `agents/competitor-evaluator/prompt.md` — Sections 3-4
- `agents/financial-analyst/prompt.md` — Sections 5, 7-8
- `agents/management-evaluator/prompt.md` — Section 6
- `agents/risk-analyst/prompt.md` — Section 9
- `agents/valuation-specialist/prompt.md` — Section 10

### Requirements
- `.planning/REQUIREMENTS.md` — VAL-01, VAL-02, VAL-03, VAL-04

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `critic.js` validateSection/validateStage pattern — methodology scoring follows the same structure (per-section checks → aggregate)
- `_testExports` pattern for unit testing internal functions
- `qualityFormatter.js` — already formats per-section scores with issues, extend for methodology
- `QUALITY_WEIGHTS` constant pattern for weighted scoring

### Established Patterns
- Pure functions, no side effects, no network calls (critic.js is validation only)
- Issues array with `{ type, severity, message, field }` structure
- `passed` flag based on high-severity issue count
- Named exports + `_testExports` for internal helpers

### Integration Points
- `validateSection()` returns `{ sectionKey, score, completeness, issues, passed }` — methodology scoring adds a parallel `methodology` field
- `validateStage()` aggregates sections — add `overallMethodologyScore`
- `qualityFormatter.js` renders the report — add methodology section
- `scripts/run-quality-v4.js` prints summary — add methodology line

</code_context>

<specifics>
## Specific Ideas

- Methodology checks should be derived directly from the curriculum files, not invented. If pitch-deck-IV.md says "compute MOS, PBT, Ten Cap, and Equity Bond," then the methodology check is "does the valuation section contain all 4 method results?"
- The PM will do manual evaluation (Option B from discussion) as reports are generated going forward. What they learn feeds into refining the methodology checks over time.
- The second ticker run also validates the Phase 10 filing content fix (PSR agents reading actual 10-K text) — two birds with one stone.

</specifics>

<deferred>
## Deferred Ideas

- **AI evaluator agent (Option C):** A critic agent that reads each section with curriculum loaded and scores methodology compliance. Estimated cost ~$2-3 per evaluation. Implement later when PM is significantly satisfied with output quality — focused on catching hallucinations, not methodology gaps. Light implementation, not too costly.
- **UI integration + delight features:** PitchDeck.jsx in-app generation trigger, DeepDivePanel wiring, IndustryCard wiring, AssumptionTracker data flow — all deferred to v1.2 milestone.
- **One Pager simplification:** User wants to drastically simplify the One Pager pipeline to single-agent, one page with small narrative — deferred to v1.2.
- **Full Story pipeline:** Stage 3 (Bull/Bear debate, 43-item checklists, trading strategy) — deferred to v1.2.

</deferred>

---

*Phase: 11-validation*
*Context gathered: 2026-03-29*
