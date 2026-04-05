# Phase 14: Adversarial Debate - Context

**Gathered:** 2026-03-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Implement the 4-step adversarial debate (Bull -> Bear -> Bull Rebuttal -> Judge) that produces S6 (inversion_rebuttal) in the Full Story pipeline. Replace the placeholder in the generate-full-story CC skill with working debate orchestration, composition into a final S6 ReportSectionSchema section, and a debate checkpoint.

Scope: DEBATE-01 (sequential execution), DEBATE-02 (evidence-backed bear), DEBATE-03 (cited rebuttals), DEBATE-04 (judge verdict scoring).

</domain>

<decisions>
## Implementation Decisions

### Final Debate Presentation (S6 Report Format)
- **D-01:** S6 uses a **dual-view format** -- verdict summary table at top for quick scanning, full exchange-by-exchange detail below for the deep read. PM gets both views in one section.
- **D-02:** The verdict summary table shows: exchange number, topic, verdict (Strong Bull / Strong Bear / Unresolved), plus overall direction and unresolved count.
- **D-03:** Each exchange below the summary shows the full back-and-forth: Bull point -> Bear counter -> Bull rebuttal -> Judge verdict, with all citations inline.

### Exchange Scope
- **D-04:** Bull produces 5+ thesis points from S1-S5 findings. Bear attacks each one AND adds 1-2 new attack vectors the Bull didn't address (risks conveniently omitted). Bull Rebuttal must address ALL points including Bear's additions. Judge scores all exchanges. Typical range: 6-9 exchanges.

### Debate Checkpoint UX
- **D-05:** After all 4 debate steps complete, PM sees a checkpoint with: Judge's overall verdict, unresolved count, and a summary table of all exchanges (topic / verdict). PM can type an exchange number to see full detail.
- **D-06:** PM can **re-run from any step forward** -- re-running from Bear also re-runs Bull Rebuttal and Judge (downstream steps depend on upstream). Re-running just Judge re-runs only the Judge.
- **D-07:** PM can provide **guidance text AND optional file attachments** when requesting a re-run. Guidance gets injected into the re-run prompt. File content (e.g., short seller report, analyst note) becomes additional context for the agent. Matches the hedge fund model -- PM hands analysts specific sources.

### S6 Narrative Composition
- **D-08:** After the 4 debate steps + Judge verdict, a **5th synthesis-writer call** composes the final S6 narrative. This is a separate call from the bull/bull_rebuttal steps. Synthesis-writer receives all 4 debate outputs and writes the dual-view narrative format.
- **D-09:** The Judge stays focused on objective scoring only. Narrative composition is a presentation task, not a judgment task -- keeping these separate preserves Judge impartiality.
- **D-10:** Total S6 cost: 5 agent calls (bull + bear + bull_rebuttal + judge + composition). Estimated ~$2-3 for S6 alone.

### Bear Aggressiveness
- **D-11:** Bear operates with an **activist short seller mindset** -- plays to WIN, not to be fair. Searches for the strongest possible counter-evidence: short seller theses, analyst downgrades, regulatory risks, insider selling patterns, accounting red flags. If the thesis survives this, it's genuinely strong.
- **D-12:** Bear performs **1+ targeted web search per bull thesis point** plus **1-2 broad searches** for risks the bull didn't mention (e.g., "[TICKER] short seller thesis", "[TICKER] SEC investigation"). Typical total: 7-10 searches per debate.
- **D-13:** Bear's web search citations carry through to the final S6 narrative with **full clickable URLs**. PM can one-click verify any bear claim. Matches the reference/citation system pattern (requirement #14 from user's research patterns).

### Carrying Forward from Prior Phases
- Debate executes strictly sequentially: Bull -> Bear -> Bull Rebuttal -> Judge (Phase 12, D-09)
- Only Bear has web search enabled (Phase 12, D-07)
- 4 lightweight debate outputs compose into final S6 ReportSectionSchema (Phase 12, D-08)
- Role assignments: synthesis-writer=bull, risk-analyst=bear, synthesis-writer=bull_rebuttal, financial-analyst=judge (Phase 12, D-12)
- All debate schemas, dispatch config, and agent prompts already built in Phase 12
- Full Story skill placeholder at Step 8 ready for implementation (Phase 13)
- One dispatch = one section = one ReportSectionSchema object (Phase 10)
- DataPacket is primary data source -- tools are supplementary (Phase 10)
- Two-pass agent pattern (prose first, structured output second) is mandatory (Phase 9)

### Claude's Discretion
- Internal state management for tracking debate step progress and enabling re-runs from any step
- How PM guidance text and file attachments are injected into re-run prompts
- Error handling and retry logic for individual debate steps
- How the synthesis-writer composition prompt is structured to produce the dual-view format
- Token budget allocation across the 5 agent calls

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Debate Architecture (Phase 12 Output)
- `agents/orchestrator/schemas/debate-step.schema.json` -- 4-step debate schema (thesis points, inversions, rebuttals, judge verdicts)
- `agents/orchestrator/dispatch-table.json` -- fullStory.phases[1] debate config (sequential steps, agent/role/webSearch assignments)
- `agents/orchestrator/config.json` -- Section-to-agent mapping for fullStory

### Agent Prompts (Debate Roles -- Already Built in Phase 12)
- `agents/synthesis-writer/prompt.md` -- Bull thesis (lines ~393-428) + Bull rebuttal (lines ~431-468) instructions
- `agents/risk-analyst/prompt.md` -- Bear inversion (lines ~650-707) with web search instructions
- `agents/financial-analyst/prompt.md` -- Judge verdict (lines ~706-768) scoring instructions

### Full Story CC Skill (Phase 13 Output -- Contains Placeholder)
- `.claude/skills/generate-full-story/SKILL.md` -- Step 8 placeholder (lines ~623-632) where debate orchestration goes

### Prior Phase Contexts
- `.planning/phases/12-full-story-foundation/12-CONTEXT.md` -- Debate schema decisions (D-06 through D-12)
- `.planning/phases/13-cc-pipeline/13-CONTEXT.md` -- CC skill architecture, checkpoint pattern, Pitch Deck inheritance

### Full Story Curriculum (Inversion & Rebuttal Source)
- `knowledge/stage-3-full-story/story-form-II.md` -- Section 6 curriculum: inversion methodology, rebuttal framework

### Report Schema
- `src/schemas/reportSection.js` -- ReportSectionSchema for final S6 output

### CC Skill Pattern (Reference)
- `.claude/skills/generate-pitch-deck/SKILL.md` -- Checkpoint and PM dialogue pattern to replicate
- `.claude/skills/generate-section/SKILL.md` -- Single-section re-run pattern (debate re-run will extend this)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `agents/orchestrator/schemas/debate-step.schema.json` -- Complete 4-step schema with all field definitions. Ready to use.
- `agents/orchestrator/dispatch-table.json` -- fullStory.phases[1] has isDebate=true, sequential=true, all 4 steps with agent/role/webSearch/receivesContext defined.
- All 4 agent prompts have debate-specific instructions already written. No prompt changes needed.
- `.claude/skills/generate-full-story/SKILL.md` -- Step 8 placeholder clearly marked for Phase 14. Skill structure designed for extension.
- `src/engines/progressState.js` -- fullStory sectionKeys already includes 'inversion_rebuttal'.

### Established Patterns
- CC skill orchestration: SKILL.md contains pipeline script, Claude Code executes step by step
- Agent dispatch in CC: `Task(subagent_type="general-purpose", prompt="...")` with agent prompt + context
- Checkpoint pattern: Generate -> present findings -> PM dialogue loop -> "continue" advances
- Section re-run: `/generate:section TICKER stage sectionNum` for individual section re-generation

### Integration Points
- Replace Step 8 placeholder in generate-full-story SKILL.md with debate orchestration
- Add Step 9 debate checkpoint after debate completes
- Update report assembly (Step 7/final) to include S6 from debate output
- Debate section files: `.thes1s/reports/{TICKER}/sections/fullStory-S6-inversion_rebuttal.json`
- Per-step intermediate files: `.thes1s/reports/{TICKER}/sections/debate-step-{N}.json` (for re-run support)

</code_context>

<specifics>
## Specific Ideas

- The debate should read like a real investment committee exchange -- adversarial but evidence-based. Not a sterile pros/cons table.
- Bear's activist short seller mindset is key to debate quality. A weak bear produces a weak debate. The prompt already says "use [web search] aggressively" -- implementation should ensure enough search budget.
- The dual-view format mirrors how real research reports present risk analysis: executive summary up top, detailed evidence below.
- File attachment on re-runs is important: the PM might find a short seller report or earnings call transcript that the Bear missed. Handing it directly to the agent is what a real PM does.
- Saving intermediate debate step outputs to disk enables re-run-from-any-step without regenerating earlier steps.

</specifics>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope.

</deferred>

---

*Phase: 14-adversarial-debate*
*Context gathered: 2026-03-30*
