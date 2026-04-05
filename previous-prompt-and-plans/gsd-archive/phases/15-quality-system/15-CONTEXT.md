# Phase 15: Quality System - Context

**Gathered:** 2026-03-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Extend critic.js with Full Story methodology checks derived from the Rule One curriculum (story-form-I.md and story-form-II.md). Produce dual quality scores (mechanical + methodology) for all 6 Full Story section types -- standard narrative, scored checklists, and adversarial debate -- in the same format as Pitch Deck scoring so scores are directly comparable across stages. The scorer must produce actionable feedback identifying specific methodology gaps, not just pass/fail.

Scope: QUAL-01 (methodology checks), QUAL-03 (dual scoring).

NOT in scope: End-to-end validation (Phase 17), API migration (Phase 16), UI integration.

</domain>

<decisions>
## Implementation Decisions

### Checklist Methodology: Structural + Content (Both)
- **D-01:** Structural checks on the `data` field (item count, verdicts present, evidence present) feed into the **mechanical** completeness score. Content quality checks on the `narrative` (regex for methodology terms from curriculum) feed into the **methodology** score. This preserves the two-score separation proven in Pitch Deck.
- **D-02:** Checklist item field names are polymorphic across agents -- Meaning uses `{id, question, verdict, confidence, evidence}`, Moat/Management use `{number, item, verdict, evidence, confidence}`. The critic must handle both naming conventions with defensive fallback chains (e.g., `item.question || item.item` for the question text, `item.id || item.number` for the identifier).

### Completeness Formula Adjustment
- **D-03:** Completeness weights are adjusted per section type:
  - **Checklist sections** (S2 meaning_checklist, S3 moat_checklist, S4 management_checklist): data population 40%, narrative depth 15% (swapped from default). The value of a checklist section is in its structured data field.
  - **Debate section** (S6 inversion_rebuttal): keep current weights (narrative depth 25%). The debate's 35K-char narrative IS the primary content -- dual-view format with verdict table + exchange detail.
  - **Standard sections** (S1 event_analysis, S5 valuation_confirmation): keep current weights unchanged.

### Debate Methodology: Process Rigor
- **D-04:** Debate quality is measured by process rigor, not outcome. An honest "5 unresolved risks" is higher quality than a rubber-stamp "0 unresolved" with thin evidence. Methodology checks verify: bear attacked all bull points, bear has web citations, bull responded to all bear points, weak rebuttals are acknowledged honestly.
- **D-05:** Debate checks operate on both the `data` field (debateStructure counts, judgeOverallVerdict) AND the `narrative` (exchange patterns, citation URLs). The `data` field has: `{debateStructure: {totalExchanges, strongBull, strongBear, unresolved, mixed, lean}, judgeOverallVerdict: {direction, unresolvedCount, investmentImplication}}`.

### Non-Standard Verdict Handling
- **D-06:** Real agent output includes non-standard verdicts (CONTEXT, WATCHLIST in Management checklist items, beyond the designed PASS/FAIL/PARTIAL). For scoring purposes, map CONTEXT->PARTIAL, WATCHLIST->PARTIAL. Flag non-standard verdicts as low-severity issues (informational, not blocking). The critic must be robust to agent output variation.

### Methodology Check Inventory (33 checks across 6 sections)

#### S1 event_analysis (5 checks -- from story-form-I.md)
- `event-root-cause` (CRITICAL): Root cause of price drop/event identified
- `event-historical` (CRITICAL): Historical precedent comparison
- `event-recovery` (supplementary): Recovery timeline estimate
- `event-debt` (supplementary): Debt implications during recovery
- `event-analyst` (supplementary): Analyst sentiment context

#### S2 meaning_checklist (5 checks)
- `meaning-item-count` (CRITICAL): All 15 items present in data
- `meaning-all-verdicts` (CRITICAL): Every item has a verdict (PASS/FAIL/PARTIAL or mapped equivalent)
- `meaning-evidence-present` (CRITICAL): Every item has evidence string > 10 chars
- `meaning-radar-items` (supplementary): Radar items (1-3) have non-PARTIAL verdicts
- `meaning-kpi-numeric` (supplementary): KPI-related items cite specific numbers

#### S3 moat_checklist (6 checks)
- `moat-item-count` (CRITICAL): All 15 items present in data
- `moat-all-verdicts` (CRITICAL): Every item has a verdict
- `moat-evidence-present` (CRITICAL): Every item has evidence string > 10 chars
- `moat-type-identified` (CRITICAL): At least one item's evidence names a specific moat type
- `moat-durability` (supplementary): Narrative mentions 10+ year assessment
- `moat-replicability` (supplementary): Any item addresses replicability/barriers

#### S4 management_checklist (6 checks)
- `mgmt-item-count` (CRITICAL): All 13 items present in data
- `mgmt-all-verdicts` (CRITICAL): Every item has a verdict
- `mgmt-evidence-present` (CRITICAL): Every item has evidence string > 10 chars
- `mgmt-financial-numeric` (CRITICAL): Financial discipline items (ROE, ROIC, ROA, debt, FCF) cite actual numbers
- `mgmt-ceo-named` (supplementary): CEO name appears (proper noun pattern in evidence)
- `mgmt-insider-pct` (supplementary): Insider ownership percentage cited

#### S5 valuation_confirmation (5 checks -- from story-form-II.md)
- `val-growth-quality` (CRITICAL): Debt-fueled growth check present
- `val-fgr-rationality` (CRITICAL): FGR rationality test (Rule of 72, market share ceiling)
- `val-sensitivity` (CRITICAL): Sensitivity analysis or range of values
- `val-multiple-methods` (supplementary): Multiple valuation methods referenced (2+ of MOS/PBT/TenCap/EquityBond)
- `val-red-flags` (supplementary): Acquisition/merger red flags addressed

#### S6 inversion_rebuttal (6 checks)
- `debate-bull-count` (CRITICAL): >= 5 bull thesis points (curriculum minimum, check in narrative or data)
- `debate-bear-coverage` (CRITICAL): Bear inversion count >= bull point count (from debateStructure.totalExchanges or narrative parsing)
- `debate-bear-citations` (CRITICAL): Web citations present (not just DataPacket -- real URLs in citations array)
- `debate-rebuttal-coverage` (CRITICAL): Bull rebuts all bear points (rebuttal language present for each exchange)
- `debate-thesis-killer` (supplementary): At least 1 severe/thesis-killer risk identified
- `debate-honesty` (supplementary): At least 1 weak or honest rebuttal acknowledged

### Exempt Sections
- **D-07:** Full Story sections that don't exist in the METHODOLOGY_CHECKS map should return score 100 with empty checks (existing behavior for unknown keys). No Full Story sections need exemption -- all 6 have checks defined above.

### Scoring Threshold
- **D-08:** Same >= 50 passing threshold as Pitch Deck. The Full Story checks are more demanding by nature (more checks, stricter criteria for checklists and debate), so a 50 on Full Story already implies higher quality than a 50 on Pitch Deck. Different thresholds would break cross-stage comparability.

### Carrying Forward from Prior Phases
- Methodology checks use regex on narrative text -- medium depth (Phase 11, D-02)
- Critical checks weighted 2x, supplementary 1x (Phase 11, D-04)
- Per-section scoring with overall as average (Phase 11, D-04)
- Section-specific checks derived from curriculum (Phase 11, D-03)
- `_testExports` pattern for unit testing internal functions (Phase 05D)
- Quality report structure: `{ score, issues, passed, methodology }` (Phase 05D)

### Claude's Discretion
- Exact regex patterns for each methodology check test function
- How to parse polymorphic checklist data (fallback chains for field names)
- Whether to create a helper function for checklist data extraction or inline it
- How to detect bull/bear/rebuttal counts from narrative text when data field doesn't have exchange-level detail
- Test strategy: extend existing critic.test.js or create separate test file for Full Story checks
- qualityFormatter.js updates to render Full Story section types correctly

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Quality System (Extend This)
- `src/engines/critic.js` -- Existing mechanical + Pitch Deck methodology scoring (1127 lines). Full Story checks add to METHODOLOGY_CHECKS map.
- `src/engines/__tests__/critic.test.js` -- 858 lines of existing tests. Full Story checks need test coverage.
- `src/engines/qualityFormatter.js` -- Markdown report formatter (212 lines). Needs Full Story section type formatting.
- `scripts/run-quality-v4.js` -- CLI entry point for quality checks. May need Full Story stage support.

### Full Story Curriculum (Source of Methodology Checks)
- `knowledge/stage-3-full-story/story-form-I.md` -- Event analysis, Meaning, Moat, Management methodology (S1-S4)
- `knowledge/stage-3-full-story/story-form-II.md` -- Valuation confirmation, Inversion & Rebuttal methodology (S5-S6)
- `knowledge/stage-3-full-story/template.md` -- Full Story template with section structure

### Real Full Story Output (Test Data)
- `.thes1s/reports/SFM/sections/fullStory-S1-event_analysis.json` -- Standard narrative section
- `.thes1s/reports/SFM/sections/fullStory-S2-meaning_checklist.json` -- Checklist with 15 items (field names: id, question, verdict, confidence, evidence)
- `.thes1s/reports/SFM/sections/fullStory-S3-moat_checklist.json` -- Checklist with 15 items (field names: number, item, verdict, evidence, confidence)
- `.thes1s/reports/SFM/sections/fullStory-S4-management_checklist.json` -- Checklist with 13 items, includes non-standard verdicts (CONTEXT, WATCHLIST)
- `.thes1s/reports/SFM/sections/fullStory-S5-valuation_confirmation.json` -- Standard narrative section
- `.thes1s/reports/SFM/sections/fullStory-S6-inversion_rebuttal.json` -- Debate section (35K narrative, 35 citations, data has debateStructure + judgeOverallVerdict)
- `.thes1s/reports/SFM/full-story.json` -- Assembled Full Story report

### Schemas
- `src/schemas/reportSection.js` -- ReportSectionSchema (validates all section types)
- `agents/orchestrator/schemas/checklist-item.schema.json` -- Checklist item schema (canonical design, agents deviate)
- `agents/orchestrator/schemas/debate-step.schema.json` -- Debate step schema

### Prior Phase Contexts
- `.planning/phases/05D-quality-system/05D-CONTEXT.md` -- Original quality system design decisions
- `.planning/phases/11-validation/11-CONTEXT.md` -- Methodology scoring design (D-01 through D-04)
- `.planning/phases/12-full-story-foundation/12-CONTEXT.md` -- Checklist format, debate schema, dispatch table

### Requirements
- `.planning/REQUIREMENTS.md` -- QUAL-01, QUAL-03

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `METHODOLOGY_CHECKS` map in critic.js -- Add Full Story section keys alongside existing Pitch Deck keys. Same pattern: array of `{id, label, critical, test}` objects.
- `runMethodologyChecks()` -- Generic function that scores any check array. Full Story checks plug directly in.
- `scoreMethodology()` -- Dispatch function by section key. Add new keys (event_analysis, meaning_checklist, etc.).
- `scoreCompleteness()` -- Currently uses fixed QUALITY_WEIGHTS. Needs section-type-aware weight adjustment (D-03).
- `_testExports` -- Expose new helpers for unit testing.

### Established Patterns
- Pure functions, no side effects, no network calls
- Issues array with `{ type, severity, message, field }` structure
- Regex-based test functions on `s.narrative` for methodology checks
- `isExemptSection()` for sections that skip methodology scoring
- Growth metrics use `dynamic` sentinel with runtime disambiguation

### Integration Points
- `validateSection()` already returns `{ methodology: { score, checks, passed } }` -- Full Story sections will populate this automatically once METHODOLOGY_CHECKS has their keys.
- `validateStage()` already computes `overallMethodologyScore` as average -- works for Full Story if all sections have checks.
- `qualityFormatter.js` renders per-section quality reports -- needs checklist and debate formatting support.
- `scripts/run-quality-v4.js` -- May need `--stage fullStory` support to validate Full Story output specifically.

### Key Finding: Polymorphic Agent Output
Real SFM output reveals that checklist items use DIFFERENT field names across agents:
- Meaning: `{id, question, verdict, confidence, evidence}`
- Moat/Management: `{number, item, verdict, evidence, confidence}`
- Management verdicts include non-standard values: CONTEXT, WATCHLIST

The critic must handle this polymorphism defensively. This aligns with the feedback memory about agent output polymorphism and the SKILL.md's existing defensive formatting.

</code_context>

<specifics>
## Specific Ideas

- The 33 methodology checks are derived directly from curriculum (story-form-I.md, story-form-II.md), not invented. Each check maps to a specific curriculum requirement.
- Checklist structural checks (item count, verdicts, evidence) should parse the `data` field with the same defensive fallback chains used in the SKILL.md report assembly (handles both `item.question || item.item` and `item.id || item.number`).
- Debate checks should leverage the structured `debateStructure` data where available (totalExchanges, strongBull, etc.) and fall back to narrative parsing when data is incomplete.
- The SFM Full Story output is the test fixture -- all 6 sections available for immediate testing during development.
- Completeness weight adjustment should be a clean conditional in scoreCompleteness(), not a separate function -- keeps the scoring path simple.

</specifics>

<deferred>
## Deferred Ideas

- **AI evaluator agent** -- A critic agent that reads each section with curriculum loaded and scores methodology compliance (estimated ~$2-3 per eval). Deferred from Phase 11 discussion. Implement when PM wants deeper quality analysis beyond regex.
- **Cross-stage inheritance checks** -- Verify Full Story references same FGR as Pitch Deck, checklist verdicts align with PD findings. This is an integration concern -- defer to Phase 17 (end-to-end validation).
- **Quality dashboard in UI** -- Show quality scores per section visually. Deferred from Phase 05D.

</deferred>

---

*Phase: 15-quality-system*
*Context gathered: 2026-03-30*
