# Phase 5A: Agent Definitions & Foundation - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning
**Source:** Converted from gstack CEO + Eng reviewed architecture plan + user questioning during GSD initialization

<domain>
## Phase Boundary

Phase 5A delivers the foundation infrastructure for the AI agent workflow: 9 agent role definitions, DataPacket assembly, report JSON schema, Node.js data bridge, and generation state persistence. No AI calls happen in this phase — it's pure infrastructure that everything else depends on.

The user personally verifies every agent definition before Phase 5A is considered done. This is the most critical phase because all future agent output quality depends on how well these definitions encode Rule One methodology.

</domain>

<decisions>
## Implementation Decisions

### Agent Definitions — Core Product Value
- Agent definitions are the core product of Thes1s. They must be written with maximum care.
- Use `/writing-skills` skill to author each agent's prompt.md — TDD-style process (baseline test, write, pressure test, refine)
- When invoking `/writing-skills`, Claude MUST read ALL reference files in the writing-skills skill directory:
  - `.claude/skills/writing-skills/anthropic-best-practices.md`
  - `.claude/skills/writing-skills/testing-skills-with-subagents.md`
  - `.claude/skills/writing-skills/persuasion-principles.md`
  - `.claude/skills/writing-skills/graphviz-conventions.dot`
  - `.claude/skills/writing-skills/examples/`
- Yes this takes up more context but these are critical skills for the project — do it right

### Agent Philosophy — Hedge Fund Analyst Team
- The user is the portfolio manager. AI agents are the analyst team.
- This is NOT a black box. The PM reviews every output, challenges assumptions, provides data sources agents couldn't access, and makes final decisions.
- Agents must escalate to the PM when they hit data walls — never guess, never skip.
- Agents investigate every unknown like their life is on the line. No "good enough" moments. The power of Rule One research is the depth.
- A human analyst doing 70 hours of manual research inevitably hits fatigue. AI agents don't. The goal is DEEPER than manual research, not just parity.

### Curriculum Expansion — Autoloaded Cross-References
- Every research-reference file that is hyperlinked inside the main curriculum files (one-pager.md, pitch-deck-I through IV, story-form-I/II) is autoloaded into the curriculum for agents reading those curriculum files.
- This ensures agents have full context for every cross-reference — no hallucination of referenced content.
- Specific additions:
  - Business Analyst: + advanced-financial-analysis.md
  - Competitor Evaluator: + advanced-financial-analysis.md
  - Management Evaluator: + advanced-financial-analysis.md, + buffett_letters_claude_training_set/, + guru-list.md
  - Risk Analyst: + advanced-financial-analysis.md, + fgr.md
  - Valuation Specialist: + advanced-financial-analysis.md, + capex-cash-flow-explained.md

### LULU Examples — Benchmark Only
- LULU examples (One Pager PDF, Pitch Deck, Full Story) exist for the user to compare output quality AFTER generation
- Agents must NEVER see or pattern-match from LULU examples during generation
- Example contamination boundary is structurally enforced via `exampleContamination.exclude` arrays in every config.json
- The user is debating removing examples from the project directory entirely to prevent contamination

### Context Engineering Balance
- Enough curriculum to prevent hallucinations and ensure methodological correctness
- Not so much that token budgets explode
- Research confirmed: total curriculum is manageable (~1,570 tokens universal, heaviest agent ~4,610 tokens for primary curriculum, plus cross-referenced files)
- `compressionPolicy: "none"` in every AI agent config.json enforces full-depth curriculum

### rule-1-workflow.md — Orchestrator Only
- `knowledge/research-references/rule-1-workflow.md` is loaded by the orchestrator only
- It covers stage progression, stop conditions, escalation rules, folder architecture
- Individual agents don't need workflow orchestration knowledge — they just do their job when called

### Conversational Checkpoint Dialogue
- At each checkpoint, the PM can ask contextual questions — not just approve/redirect
- Examples: "show me how you calculated that", "why did you go deep on A but not B?"
- Scoped to section context, not open-ended chat
- This is the PM/analyst collaboration model — the PM actively helps, not just clicks buttons

### Build Order (from Eng Review)
- 5A → 5C → 5B → 5D (validate AI quality before investing in display components)
- See real output in ~5 days instead of ~14

### Milestone Structure
- M1 (Phase 5A): Agent definitions verified correct by user
- M2 (Phases 5B-5D): One Pager pipeline working, user satisfied with output quality and UI
- M3 (Phase 6): Pitch Deck — most difficult, every agent follows curriculum exactly, full LULU parity
- M4 (Phase 7): Full Story — builds on pitch deck quality, full LULU parity
- M5 (Phase 8+): Polish, delight, "blown away" quality
- User personally verifies at each milestone boundary. No milestone is done until the user says so.

### Claude's Discretion
- File organization within agents/ directory (subdirectory naming, file layout)
- Test implementation details (vitest patterns, mock strategies)
- Node.js adapter implementation specifics (as long as shims work correctly)
- DataPacket field ordering and internal structure

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Architecture (Source of Truth)
- `gstack/plans/gstack-ai-agent-workflow-plan-20260323.md` — THE authoritative architecture plan. 516 lines. Agent roles, DataPacket schema, Toolbox tools, stage orchestration, quality system, report JSON schema, cost estimates, 22 key design decisions, prototype validation.

### Rule One Curriculum (Agent Knowledge Base)
- `knowledge/stage-1-one-pager/one-pager.md` — One Pager curriculum
- `knowledge/stage-1-one-pager/template.md` — One Pager template
- `knowledge/stage-2-pitch-deck/pitch-deck-I.md` — Pitch Deck sections 1-3 (Radar, Simple & Predictable, Dominance)
- `knowledge/stage-2-pitch-deck/pitch-deck-II.md` — Pitch Deck sections 4-6 (Barriers, FCF, Management)
- `knowledge/stage-2-pitch-deck/pitch-deck-III.md` — Pitch Deck sections 7-9 (Returns/Debt, Balance Sheet, PEST)
- `knowledge/stage-2-pitch-deck/pitch-deck-IV.md` — Pitch Deck section 10 (Valuation — MOS, PBT, Ten Cap, Equity Bond)
- `knowledge/stage-2-pitch-deck/template.md` — Pitch Deck template
- `knowledge/stage-3-full-story/story-form-I.md` — Full Story sections 1-4 (Event, Meaning, Moat, Management)
- `knowledge/stage-3-full-story/story-form-II.md` — Full Story sections 5-8 (Valuation, Inversion, Trading, PACE)
- `knowledge/stage-3-full-story/template.md` — Full Story template

### Research References (Cross-Referenced by Curriculum)
- `knowledge/research-references/rule-one-fundamentals.md` — Universal: R1 philosophy, 3 Ms, investment requirements
- `knowledge/research-references/tools-for-analysis.md` — Universal: practical tools, data sources
- `knowledge/research-references/advanced-financial-analysis.md` — Financial statement benchmarks, health checklist
- `knowledge/research-references/fgr.md` — FGR methodology, Big 4 growth rates, 5 perspectives
- `knowledge/research-references/capex-cash-flow-explained.md` — CapEx and cash flow breakdown
- `knowledge/research-references/equity-bond-research.md` — 3 variants, source books, worked examples
- `knowledge/research-references/buffett_letters_claude_training_set/` — Buffett letter gold standard for management integrity
- `knowledge/research-references/guru-list.md` — 43 named gurus for 13F lookup
- `knowledge/research-references/rule-1-workflow.md` — Stage progression, stop conditions (orchestrator only)

### Skill Authoring
- `.claude/skills/writing-skills/SKILL.md` — TDD-style skill authoring methodology
- `.claude/skills/writing-skills/anthropic-best-practices.md` — Official Anthropic guidance
- `.claude/skills/writing-skills/testing-skills-with-subagents.md` — Pressure testing methodology

### Source Plans (merged into authoritative plan, kept for audit trail)
- `gstack/plans/gstack-ai-agent-workflow-ceo-plan-20260323.md` — CEO review (scope expansion)
- `gstack/plans/gstack-ai-agent-workflow-eng-plan-20260323.md` — Eng review (architecture validated)

</canonical_refs>

<specifics>
## Specific Ideas

- The synthesis-writer's curriculum references `buffett_writing_principles.md` which may not exist as a standalone file. Check `knowledge/research-references/` — the Buffett letters directory exists. Use actual path that exists on disk.
- Plan 04 creates 18 config files in one task (9 config.json + 9 README.md) — repetitive/templated but validate all curriculum paths with existsSync before writing.
- Agent prompt.md files are DRAFT stubs after Phase 5A execution. The user replaces them with real prompts via `/writing-skills` before Phase 5C.
- The orchestrator is BOTH a prompt definition (for CC skill mode) AND a code module (dispatch logic). Plan 05 covers the config/dispatch side.

</specifics>

<deferred>
## Deferred Ideas

- Automated eval system — user IS the eval for first 5-10 reports (Key Design Decision #22)
- Token budgets per agent — measure actual usage first, set budgets based on data (from Eng Review)
- 10-K chunking for Primary Source Reader — may need selective section reading to reduce 200K+ token cost
- Toolbox tool latency optimization — measure bash-to-Node overhead before optimizing

</deferred>

---

*Phase: 05A-agent-definitions-foundation*
*Context gathered: 2026-03-24 via GSD initialization questioning + architecture plan conversion*
