# Phase 13: CC Pipeline - Context

**Gathered:** 2026-03-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the Full Story CC skill that orchestrates 5 sections (S1-S5) with Pitch Deck findings inherited as context. S6 (inversion_rebuttal) is a known placeholder — the 4-step adversarial debate is Phase 14's scope. No new data preparation — the skill reads existing Pitch Deck output and DataPacket.

Scope: ORCH-01 (Full Story CC skill orchestrates sections with Pitch Deck inheritance).

</domain>

<decisions>
## Implementation Decisions

### Section Scope
- **D-01:** Phase 13 generates 5 sections: event_analysis (S1), meaning_checklist (S2), moat_checklist (S3), management_checklist (S4), valuation_confirmation (S5). S6 (inversion_rebuttal) is a placeholder — not generated until Phase 14 adds the debate.
- **D-02:** All 5 sections run in parallel (they are independent deep-dives building on Pitch Deck findings). Single generation wave.

### Pitch Deck Inheritance
- **D-03:** Each Full Story agent receives the 2-3 Pitch Deck sections most relevant to their assignment as full JSON. Not the entire pitch-deck.json, not compressed summaries. Token-efficient, focused, matches the hedge fund model (analyst reads the prior analysis for their domain).
- **D-04:** Pitch Deck → Full Story section mapping:
  - S1 event_analysis ← PD S9 (PEST risks) + PD S1 (radar)
  - S2 meaning_checklist ← PD S2 (simple & predictable) + PD S3 (dominance)
  - S3 moat_checklist ← PD S4 (barriers & moats) + PD S3 (dominance)
  - S4 management_checklist ← PD S6 (management) + PD S8 (balance sheet)
  - S5 valuation_confirmation ← PD S5 (FCF) + PD S7 (returns/debt) + PD S10 (valuation)
- **D-05:** The mapping is deterministic from the dispatch table. Agents cite specific findings from their inherited PD sections — no re-deriving from scratch.

### Checkpoint Experience
- **D-06:** One checkpoint after the S1-S5 generation wave. PM reviews all 5 section outputs before approving.
- **D-07:** PM can ask questions routed to the specialist who wrote the section (same pattern as Pitch Deck checkpoints). PM can also request section re-runs with additional guidance.
- **D-08:** Phase 14 will add a second checkpoint after the debate (S6). Phase 13's skill structure must accommodate this extension.

### Data Preparation & Gate Check
- **D-09:** Gate check only — read `.thes1s/reports/{TICKER}/pitch-deck.json` and verify it exists with an approved verdict. No new DataPacket assembly, no data refresh.
- **D-10:** The existing DataPacket (assembled during Pitch Deck generation) is reused as-is. Full Story agents receive their DataPacket slices from the same file.
- **D-11:** If the gate check fails (no Pitch Deck or unapproved), the skill stops with a clear message directing the user to run the Pitch Deck first.

### Carrying Forward from Prior Phases
- One dispatch = one section = one ReportSectionSchema object (Phase 10)
- DataPacket is primary data source — tools are supplementary (Phase 10)
- Two-pass agent pattern (prose first, structured output second) is mandatory (Phase 9)
- 6 sections defined in dispatch table, no S7/S8 (Phase 12)
- Checklist format: PASS/FAIL/PARTIAL with evidence per item, scoreDisplay summary (Phase 12)
- Debate schemas defined in Phase 12 — used by Phase 14, not Phase 13

### Claude's Discretion
- CC skill internal architecture (how the checkpoint loop works, state management)
- Exact Pitch Deck section JSON format when passed to Full Story agents (full ReportSectionSchema or extracted data+narrative)
- How the skill handles section re-runs at the checkpoint
- Progress tracking implementation (reuse progressState.js or simpler approach)
- Error handling and retry patterns
- How the placeholder S6 is represented in the output (empty section, null, or omitted entirely)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### CC Skill Pattern (Template)
- `.claude/skills/generate-pitch-deck/SKILL.md` — Pitch Deck CC skill (500+ lines). The pattern to replicate for Full Story. Data prep, agent dispatch, checkpoints, PM dialogue.
- `.claude/skills/generate-one-pager/SKILL.md` — One Pager CC skill. Simpler pattern for reference.
- `.claude/skills/generate-section/SKILL.md` — Single-section re-run skill. Used at checkpoints.

### Full Story Architecture (Phase 12 Output)
- `agents/orchestrator/dispatch-table.json` — Full Story dispatch: 2-phase structure (parallel S1-S5, debate S6), section keys, agent assignments
- `agents/orchestrator/config.json` — Section-to-agent mapping for fullStory
- `agents/orchestrator/schemas/checklist-item.schema.json` — Checklist scoring format (PASS/FAIL/PARTIAL)
- `agents/orchestrator/schemas/debate-step.schema.json` — Debate step output format (Phase 14 reference)

### Agent Prompts (Already Updated in Phase 12)
- `agents/business-analyst/prompt.md` — Full Story S2 meaning_checklist instructions
- `agents/competitor-evaluator/prompt.md` — Full Story S3 moat_checklist instructions
- `agents/management-evaluator/prompt.md` — Full Story S4 management_checklist instructions
- `agents/risk-analyst/prompt.md` — Full Story S1 event_analysis instructions
- `agents/valuation-specialist/prompt.md` — Full Story S5 valuation_confirmation instructions
- `agents/synthesis-writer/prompt.md` — Full Story debate roles (Phase 14)
- `agents/financial-analyst/prompt.md` — Full Story judge role (Phase 14)

### Full Story Curriculum
- `knowledge/stage-3-full-story/template.md` — Full Story template
- `knowledge/stage-3-full-story/story-form-I.md` — Sections 1-4 curriculum
- `knowledge/stage-3-full-story/story-form-II.md` — Sections 5-6 curriculum

### Infrastructure (Reuse from v1.1)
- `src/engines/aiResearch.js` — Claude API dispatch engine (Phase 16 migration target, but CC skill calls agents differently)
- `src/engines/progressState.js` — Generation state machine (IDLE → PRIMARY_SOURCE_READING → GENERATING → COMPLETE)
- `src/engines/dataExport.js` — assembleDataPacket() function
- `src/schemas/reportSection.js` — ReportSectionSchema (Zod) for structured agent output
- `src/schemas/dataPacket.js` — DataPacketSchema + sliceDataPacket()
- `src/engines/critic.js` — Quality scoring (Phase 15 will extend for Full Story)
- `src/engines/contextBudget.js` — Token counting + budget management
- `scripts/prepare-data.js` — Data preparation script (not re-run for Full Story, but reference for DataPacket structure)

### Prior Phase Contexts
- `.planning/phases/12-full-story-foundation/12-CONTEXT.md` — Phase 12 decisions (dispatch table, schemas, prompts)
- `.planning/phases/06-pitch-deck/06-CONTEXT.md` — Pitch Deck CC skill decisions (checkpoint experience, PSR architecture, FGR derivation)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `.claude/skills/generate-pitch-deck/SKILL.md` — Full CC skill pattern: gate check → data prep → agent dispatch → checkpoints → PM dialogue. Direct template for Full Story skill.
- `src/engines/progressState.js` — Generation state tracking with crash recovery. Reuse for Full Story progress.
- `src/engines/contextBudget.js` — Token counting per agent call. Track Full Story costs.
- `src/engines/critic.js` — Citation validation. Run on Full Story sections (Phase 15 adds methodology checks).
- `src/schemas/reportSection.js` — Same schema for Full Story sections. No changes needed.

### Established Patterns
- CC skill orchestration: SKILL.md contains the full pipeline script. Claude Code reads it and executes step by step.
- Agent dispatch in CC: `Task(subagent_type="general-purpose", prompt="...")` with agent prompt + curriculum + DataPacket slice.
- Checkpoint pattern: Generate → present findings → PM dialogue loop → "continue" advances.
- Report persistence: `.thes1s/reports/{TICKER}/full-story.json` (new) alongside existing `one-pager.json` and `pitch-deck.json`.
- Section files: `.thes1s/reports/{TICKER}/sections/fullStory-S{N}-{key}.json` per section.

### Integration Points
- New CC skill: `.claude/skills/generate-full-story/SKILL.md`
- Gate check reads: `.thes1s/reports/{TICKER}/pitch-deck.json`
- Pitch Deck section inheritance: read from `.thes1s/reports/{TICKER}/sections/pitchDeck-S{N}-{key}.json`
- Output: `.thes1s/reports/{TICKER}/full-story.json` + per-section files
- Progress state: new `FULL_STORY_GENERATING` state in progressState.js (or reuse existing states with a stage discriminator)

</code_context>

<specifics>
## Specific Ideas

- The CC skill should be structured so Phase 14 can extend it with the debate phase without rewriting the whole skill. S6 is a known gap, not a bug.
- Section inheritance mapping (D-04) should be defined in the skill as a clear data structure, not hardcoded across scattered prompt assembly. Makes it easy to adjust if quality testing reveals a better mapping.
- The checkpoint should show checklist scores prominently (e.g., "Meaning: 12/15 PASS, 2 PARTIAL, 1 FAIL") — these are the headline numbers the PM cares about.
- Full Story output should be clearly labeled as "partial" (5/6 sections) until Phase 14 completes S6.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 13-cc-pipeline*
*Context gathered: 2026-03-29*
