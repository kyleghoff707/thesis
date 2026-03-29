# Phase 12: Full Story Foundation - Context

**Gathered:** 2026-03-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Update the dispatch table, agent prompts, and design the checklist scoring format — all infrastructure before the first Full Story section generates. No actual section generation in this phase.

Scope: ORCH-02 (dispatch table), ORCH-03 (agent prompts), ORCH-04 (checklist format).

</domain>

<decisions>
## Implementation Decisions

### Checklist Scoring Schema
- **D-01:** Each of the 43 checklist items gets a verdict of PASS / FAIL / PARTIAL plus a 1-2 sentence evidence summary. Binary conviction thinking, matching Rule One methodology.
- **D-02:** Checklist data lives in the existing `data` field of ReportSectionSchema (JSON string containing an array of checklist items). No schema changes needed. The `narrative` field gets the prose analysis as usual.
- **D-03:** Section-level summary tallies results: "12/15 PASS, 2 PARTIAL, 1 FAIL" — instantly clear conviction level.

### Agent Prompt Strategy
- **D-04:** Append Full Story instructions to existing agent prompt files (prompt.md). Each prompt already has stage-aware sections (One Pager, Pitch Deck) — Full Story becomes the third section.
- **D-05:** The dispatch table tells the agent which stage it's running, so the agent reads only the relevant prompt section. No separate prompt files.

### Debate Schema
- **D-06:** All 4 debate steps use a lightweight format (not full ReportSectionSchema). Each step produces structured thesis points / inversions / rebuttals / scores — no unnecessary fields like charts, tables, or searchesPerformed on intermediate steps.
- **D-07:** Only the Bear agent has web search enabled for the debate. The Bear researches short-seller theses, negative analyst coverage, and bear cases. Bull, Bull Rebuttal, and Judge work with existing findings from prior sections. Bear's web search citations flow into the final S6 section.
- **D-08:** The 4 lightweight debate outputs are composed into the final S6 (inversion_rebuttal) ReportSectionSchema section. All 4 perspectives are fully visible in the report — the user reads the Bull case, Bear case, Bull rebuttal, and Judge verdict.
- **D-09:** Debate steps execute strictly sequentially — each step receives the prior step's full output as context. Bull → Bear → Bull Rebuttal → Judge.

### Dispatch Table Updates
- **D-10:** Remove trading_strategy (S7) and pace_plan (S8) sections. Full Story has 6 sections, not 8.
- **D-11:** S3 (moat_checklist) ownership changes to competitor-evaluator (was conflicting between business-analyst and competitor-evaluator). Competitor-evaluator deepens their Pitch Deck moat analysis.
- **D-12:** The debate (S6: inversion_rebuttal) is defined as 4 sequential steps with role assignments: synthesis-writer (bull), risk-analyst (bear), synthesis-writer (bull_rebuttal), financial-analyst (judge).

### Carrying Forward from Prior Phases
- One dispatch = one section = one ReportSectionSchema object (Phase 10)
- DataPacket is primary data source — tools are supplementary (Phase 10)
- Two-pass agent pattern (prose first, structured output second) is mandatory (Phase 9)
- Web search enabled for all agents — prompt governs usage (Phase 8)

### Claude's Discretion
- Exact JSON structure of checklist items within the `data` field (field names, nesting)
- Lightweight debate step schema design (fields for thesis points, inversions, rebuttals, scores)
- How to encode the 4 debate steps within the dispatch table JSON structure
- How prior Pitch Deck section data is formatted when passed to Full Story agents as context

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Full Story Curriculum
- `knowledge/stage-3-full-story/template.md` — Full Story template with 8 sections (we use 6)
- `knowledge/stage-3-full-story/story-form-I.md` — Event analysis, Meaning, Moat, Management (sections 1-4)
- `knowledge/stage-3-full-story/story-form-II.md` — Valuation confirmation, Inversion & Rebuttal (sections 5-6)

### Agent Definitions
- `agents/orchestrator/dispatch-table.json` — Current dispatch table (needs Full Story updates)
- `agents/orchestrator/config.json` — Orchestrator section mapping (needs Full Story updates)
- `agents/business-analyst/config.json` — Sections, DataPacket slice, curriculum
- `agents/competitor-evaluator/config.json` — Sections, DataPacket slice, curriculum
- `agents/management-evaluator/config.json` — Sections, DataPacket slice, curriculum
- `agents/risk-analyst/config.json` — Sections, DataPacket slice, curriculum
- `agents/valuation-specialist/config.json` — Sections, DataPacket slice, curriculum
- `agents/synthesis-writer/config.json` — Sections, DataPacket slice, curriculum
- `agents/financial-analyst/config.json` — Sections, DataPacket slice, curriculum

### Agent Prompts (append Full Story sections)
- `agents/business-analyst/prompt.md` — Full Story sections: S2 (meaning checklist)
- `agents/competitor-evaluator/prompt.md` — Full Story sections: S3 (moat checklist)
- `agents/management-evaluator/prompt.md` — Full Story sections: S4 (management checklist)
- `agents/risk-analyst/prompt.md` — Full Story sections: S1 (event analysis), S6 (bear role)
- `agents/valuation-specialist/prompt.md` — Full Story sections: S5 (valuation confirmation)
- `agents/synthesis-writer/prompt.md` — Full Story sections: S6 (bull + bull rebuttal roles)
- `agents/financial-analyst/prompt.md` — Full Story sections: S6 (judge role)

### Report Schema
- `src/schemas/reportSection.js` — ReportSectionSchema (no changes needed, data field used for checklists)

### Quality System
- `src/engines/critic.js` — Existing quality scoring (Phase 15 will extend for Full Story)

### Architecture Reference
- `Thes1s-Agent-Architecture.pdf` — Visual breakdown of all agents, flows, token budgets (generated this session)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `agents/orchestrator/dispatch-table.json` — Already has a `fullStory` section with 3 phases. Needs updating (remove S7/S8, fix S3, add 4-step debate).
- `agents/*/config.json` — All agent configs already have `sections.fullStory` arrays. Most need updating.
- `agents/*/prompt.md` — All prompts have investigation mandate + curriculum structure. Full Story sections append to the same pattern.
- `src/schemas/reportSection.js` — ReportSectionSchema.data is a string field that accepts any JSON. Checklist items fit without schema changes.

### Established Patterns
- Agent prompt structure: Investigation Mandate → Web Research → Contamination Boundary → Stage-specific sections (One Pager, Pitch Deck, now Full Story)
- Dispatch table structure: preProcessing → phases[] → postProcessing with agent/sections/parallel/note fields
- Config structure: role, model, curriculum[], dataPacketSlice[], sections.{stage}[]

### Integration Points
- `dispatch-table.json` fullStory.phases — needs debate phase with sequential 4-step structure
- `dispatch-table.json` fullStory.sectionKeys — needs updating to 6 keys (remove trading_strategy, pace_plan)
- `orchestrator/config.json` sectionMapping.fullStory — needs updating to match dispatch table
- Each agent's `sections.fullStory` array in config.json — needs updating to match new assignments

</code_context>

<specifics>
## Specific Ideas

- Checklist items should feel like a due diligence checklist — the PM reads each item and its evidence to gauge conviction.
- The debate should read like an actual adversarial exchange — not a sterile pros/cons list. Each agent has a voice.
- The curriculum files (story-form-I.md, story-form-II.md) are the source of truth for what each checklist item should cover. The agent prompts should reference specific checklist items from the curriculum.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 12-full-story-foundation*
*Context gathered: 2026-03-29*
