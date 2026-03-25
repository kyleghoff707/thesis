# Phase 6: Pitch Deck - Context

**Gathered:** 2026-03-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 6 delivers the full Pitch Deck generation pipeline: 10-section multi-agent orchestration with structured checkpoints, conversational PM dialogue, Primary Source Reading (annual + quarterly), FGR derivation workflow, sensitivity tables, and LULU benchmark parity. Split into 4 sub-phases (6A-6D) for incremental verification.

**Prerequisite:** Phase 5B (One Pager UI) must complete before Phase 6 starts. SectionRenderer.jsx, StatusBadge.jsx, and OnePager.jsx become reusable foundations for PitchDeck.jsx.

</domain>

<decisions>
## Implementation Decisions

### Build Order & Sub-phasing
- **D-01:** Split Phase 6 into 4 sub-phases:
  - **6A**: Author 5 new agent prompts (competitor-evaluator, management-evaluator, risk-analyst, annual-reader, quarterly-reader) + light update pass on existing 4 agent prompts for Pitch Deck depth
  - **6B**: New CC skill `/generate:pitch-deck` + 3-phase generation + checkpoints + Primary Source Reading
  - **6C**: PitchDeck.jsx + 10 section sub-components + SensitivityTable.jsx (reuses Phase 5B shared components)
  - **6D**: Delight features (PTCH-13 deep-dive, PTCH-14 industry cards, PTCH-15 assumption tracker) + LULU parity verification
- **D-02:** Use `/writing-skills` for every new agent prompt — read ALL reference files in the writing-skills skill directory (anthropic-best-practices.md, testing-skills-with-subagents.md, persuasion-principles.md, graphviz-conventions.dot, examples/). These skills are the core product. No shortcuts.
- **D-03:** Light update pass on existing agents (business-analyst, financial-analyst, valuation-specialist, synthesis-writer) to ensure prompts handle deeper Pitch Deck sections. Not full rewrites.
- **D-04:** Separate CC skill `/generate:pitch-deck` — new skill alongside existing `/generate:one-pager`. Each self-contained.

### Checkpoint Experience
- **D-05:** Terminal dialogue at each checkpoint (after generation Phases 1, 2, 3). CC skill pauses, prints structured checkpoint summary (findings, data gaps, questions, confidence), enters conversational loop. PM types questions or 'continue' to advance.
- **D-06:** PM can inject external data at checkpoints — paste text, URLs, notes. Next phase's agents receive this as supplementary context. PM can also re-run specific sections with additional guidance (targeted, not full phase re-run).
- **D-07:** Questions from PM are routed to the agent that produced the section. The relevant specialist answers, not a generic agent. Like asking the analyst who wrote the report.

### Primary Source Reader — Two Agents
- **D-08:** Replace single `primary-source-reader` with two specialized agents:
  - **Annual Reader** (`annual-reader`): Reads 10 years of 10-Ks + 10 years of proxy statements + annual shareholder letters (when in proxy). The "more important" of the two — deep historical view of the company's evolution.
  - **Quarterly Reader** (`quarterly-reader`): Reads at least 4 quarters of 10-Q reports + at least 4 quarters of earnings call transcripts. If budget/time allows, can read more quarters. Follows the quarterly narrative over a year+.
- **D-09:** Chronological reading order — oldest first, reading forward. Agent experiences the company's evolution as it happened. **Note for later: A/B test reverse-chronological reading order to determine which produces better output.**
- **D-10:** Both agents cross-validate with financial analyst on Rule-One-relevant financial metrics (not every line item). SEC filings are always the source of truth.
- **D-11:** Discrepancy handling: Flag + override. PSR flags the discrepancy in a structured report. The corrected SEC-derived value becomes the "primary source value" for downstream agents. DataPacket value preserved for audit trail. PM sees both at checkpoint.
- **D-12:** Filings are already optimized — `filingMarkdown.js` converts HTML/PDF to markdown specifically to reduce token usage. Agents read markdown, not raw filings.
- **D-13:** Both PSR agents run in pre-processing (before the 3 generation phases), per the dispatch table. All section authors have PSR findings available.

### FGR Derivation
- **D-14:** Agent-assisted with PM confirmation, input-by-input review. Valuation-specialist presents each of the 5 FGR inputs (Historical, Market Relativity, Company Guidance, Industry CAGR, Analyst Consensus) one at a time with evidence and reasoning. PM confirms or adjusts each. Then agent proposes FGR Low/High range. PM approves.
- **D-15:** FGR derivation only runs within pitch deck generation (section 10, after all prior sections complete). Has access to all prior section outputs + both PSR agents' findings + full DataPacket. Context-rich, not shallow.
- **D-16:** Standalone `/fgr TICKER` command (CMD-03) dropped from Phase 6 scope. FGR without prior deep research would be superficial. May revisit as a "re-derive on completed pitch deck" command later.

### Agent Roster Change
- **D-17:** Agent count changes from 9 to 10. The single `primary-source-reader` role splits into `annual-reader` and `quarterly-reader`. Writing briefs, config.json, dispatch-table.json, and orchestrator config all need updating in 6A.

### Claude's Discretion
- CC skill internal architecture (how checkpoints are implemented, state management between phases)
- Exact token budget allocation per agent call
- How inter-phase context is passed (full section JSON, summaries, or both)
- PitchDeck.jsx component structure and sub-component boundaries (6C)
- SensitivityTable.jsx implementation approach
- Delight feature implementation details (6D)
- Error handling and retry patterns within generation phases

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Architecture (Source of Truth)
- `gstack/plans/gstack-ai-agent-workflow-plan-20260323.md` — Authoritative architecture plan. Agent roles, stage orchestration, quality system, report schema, cost estimates, 22 key design decisions.
- `agents/orchestrator/dispatch-table.json` — Pitch Deck dispatch: 3-phase agent groupings, parallelism rules, checkpoints, section keys, pre-processing steps (data assembly + PSR)
- `agents/orchestrator/config.json` — Section-to-agent mapping for all stages

### Phase 5A-5D Outputs (Foundation)
- `src/schemas/reportSection.js` — ReportSectionSchema (Zod) for structured agent output
- `src/schemas/dataPacket.js` — DataPacketSchema + sliceDataPacket()
- `src/schemas/progress.js` — ProgressSchema for generation state
- `src/engines/dataExport.js` — assembleDataPacket() function
- `src/engines/toolbox.js` — TOOL_DEFINITIONS for agent-callable tools
- `src/engines/progressState.js` — State persistence for crash recovery
- `src/engines/nodeAdapter.js` — Browser-to-Node shims for CLI execution
- `src/engines/critic.js` — Citation validation (quality system)
- `src/engines/contextBudget.js` — Token counting + budget management
- `.claude/skills/generate-one-pager/SKILL.md` — One Pager CC skill (pattern for pitch deck skill)

### Agent Definitions
- `agents/business-analyst/` — Real prompt (539 lines), config.json, writing brief
- `agents/financial-analyst/` — Real prompt (648 lines), config.json, writing brief
- `agents/valuation-specialist/` — Real prompt (451 lines), config.json, writing brief
- `agents/synthesis-writer/` — Real prompt (330 lines), config.json, writing brief
- `agents/competitor-evaluator/` — STUB prompt (22 lines), config.json, writing brief
- `agents/management-evaluator/` — STUB prompt (22 lines), config.json, writing brief
- `agents/risk-analyst/` — STUB prompt (22 lines), config.json, writing brief
- `agents/primary-source-reader/` — STUB prompt (22 lines) — to be REPLACED by annual-reader + quarterly-reader

### Rule One Curriculum (Loaded Into Agents)
- `knowledge/stage-2-pitch-deck/pitch-deck-I.md` — Sections 1-3 (Radar, Simple & Predictable, Dominance)
- `knowledge/stage-2-pitch-deck/pitch-deck-II.md` — Sections 4-6 (Barriers, FCF, Management)
- `knowledge/stage-2-pitch-deck/pitch-deck-III.md` — Sections 7-9 (Returns/Debt, Balance Sheet, PEST)
- `knowledge/stage-2-pitch-deck/pitch-deck-IV.md` — Section 10 (Valuation — MOS, PBT, Ten Cap, Equity Bond)
- `knowledge/stage-2-pitch-deck/template.md` — Pitch Deck template
- `knowledge/research-references/rule-one-fundamentals.md` — Universal: R1 philosophy, 3 Ms
- `knowledge/research-references/tools-for-analysis.md` — Universal: practical tools, data sources
- `knowledge/research-references/advanced-financial-analysis.md` — Financial benchmarks
- `knowledge/research-references/fgr.md` — FGR methodology, Big 4, 5 perspectives
- `knowledge/research-references/capex-cash-flow-explained.md` — CapEx breakdown
- `knowledge/research-references/equity-bond-research.md` — Equity Bond methodology
- `knowledge/research-references/guru-list.md` — 43 named gurus (management-evaluator)
- `knowledge/research-references/buffett_letters_claude_training_set/` — Buffett letters (management-evaluator)

### Skill Authoring
- `.claude/skills/writing-skills/SKILL.md` — TDD-style skill authoring methodology
- `.claude/skills/writing-skills/anthropic-best-practices.md` — Anthropic prompt engineering guidance
- `.claude/skills/writing-skills/testing-skills-with-subagents.md` — Pressure testing methodology
- `.claude/skills/writing-skills/persuasion-principles.md` — Persuasion/communication principles
- `.claude/skills/writing-skills/graphviz-conventions.dot` — Graphviz conventions
- `.claude/skills/writing-skills/examples/` — Example skills for reference

### Filing Infrastructure
- `src/engines/filingMarkdown.js` — HTML-to-markdown conversion for SEC filings (token optimization)
- `src/engines/transcripts.js` — Earnings call transcript engine (Finnhub + Alpha Vantage, IndexedDB cache)
- `src/engines/edgar.js` — EDGAR API integration (company facts, submissions, filings)

### Requirements
- `.planning/REQUIREMENTS.md` — PTCH-01 through PTCH-16, CMD-01, CMD-03 definitions

### Benchmark
- `knowledge/stage-2-pitch-deck/` — LULU Pitch Deck example (comparison only, never agent input)

### Prior Phase Contexts
- `.planning/phases/05A-agent-definitions-foundation/05A-CONTEXT.md` — Agent philosophy, hedge fund model, LULU contamination boundary, context engineering
- `.planning/phases/05C-cc-skill-first-analysis/05C-CONTEXT.md` — CC skill architecture, agent execution model, parallel dispatch, structured outputs
- `.planning/phases/05D-quality-system/05D-CONTEXT.md` — critic.js, contextBudget.js, failure recovery

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/engines/dataExport.js`: assembleDataPacket() — complete DataPacket from all 20+ engines
- `src/engines/toolbox.js`: 13 Claude tool_use compatible tools (computeMOS, computePBT, etc.)
- `src/engines/progressState.js`: Full state machine for generation tracking + crash recovery
- `src/engines/critic.js`: Citation validation — path existence + value matching
- `src/engines/contextBudget.js`: Token counting + per-agent cost tracking
- `src/schemas/reportSection.js`: Zod schema + JSON Schema for structured outputs
- `src/engines/filingMarkdown.js`: SEC filing HTML-to-markdown (token optimization for PSR)
- `src/engines/transcripts.js`: Earnings call transcripts with IndexedDB cache
- `.claude/skills/generate-one-pager/SKILL.md`: CC skill pattern (346 lines) — template for pitch deck skill

### Established Patterns
- CC subagent execution: parallel dispatch where possible, Sonnet for analysts, Opus for synthesis
- Agent configs define curriculum, dataPacketSlice, tools, sections per stage
- Quality system (critic.js) runs on every section output
- Report JSON saved to `.thes1s/reports/{TICKER}/`
- Progress state tracks generation from IDLE through COMPLETE
- Inline styles with mutable C palette (dark/light) — no CSS files

### Integration Points
- New CC skill at `.claude/skills/generate-pitch-deck/SKILL.md`
- New agent dirs: `agents/annual-reader/`, `agents/quarterly-reader/` (replace `agents/primary-source-reader/`)
- Updated: `agents/orchestrator/dispatch-table.json` (annual-reader + quarterly-reader in preProcessing)
- PitchDeck.jsx in `src/components/` (reuses SectionRenderer, StatusBadge from Phase 5B)
- `.thes1s/reports/{TICKER}/pitch-deck.json` (new report output)

</code_context>

<specifics>
## Specific Ideas

- Agent prompts are the core product of Thes1s. Every writing-skills invocation MUST read ALL reference files in the skill directory. This takes up more context but it's critical.
- Annual reader reads chronologically (oldest → newest) to experience the company's evolution as it happened. A/B test reverse-chronological later to determine which produces better analysis.
- Quarterly reader has a minimum floor (4 quarters each of 10-Qs and transcripts) but can read more if budget/time allows. Consider enforcing "at least 3 years of quarterlies" later if the agent finishes faster than expected.
- The COST One Pager (`.thes1s/reports/COST/`) is the reference output from Phase 5C — use it to understand the existing generation pipeline and report structure.
- Proxy statements sometimes contain annual shareholder letters — the annual reader should extract these when present (they're gold for management evaluation).
- CMD-01 (`/generate:section TICKER stage section#`) stays in scope for Phase 6 — it's the mechanism for re-running specific sections at checkpoints.

</specifics>

<deferred>
## Deferred Ideas

- Standalone `/fgr TICKER` command (CMD-03) — FGR without prior deep research is superficial. May revisit as "re-derive on completed pitch deck" later.
- A/B testing chronological vs reverse-chronological filing reading order — note for future validation.
- Enforcing "at least 3 years of quarterlies" for the quarterly reader — observe actual behavior first.
- Automated eval system — user IS the eval for first 5-10 reports.
- Token budget optimization — measure actual Pitch Deck generation costs before setting budgets.

</deferred>

---

*Phase: 06-pitch-deck*
*Context gathered: 2026-03-25*
