# Phase 5C: CC Skill + First Analysis - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 5C delivers the first working One Pager generation pipeline. It authors real agent prompts (replacing 5A stubs) via `/writing-skills`, builds a CC skill that orchestrates the full pipeline as CC subagents, and runs the first real analysis against a test ticker to benchmark against the LULU One Pager. This phase proves the agent architecture works before any UI is built (Phase 5B).

</domain>

<decisions>
## Implementation Decisions

### Prompt Authoring Workflow
- **D-01:** Use `/writing-skills` to author prompt.md for each of the 4 One Pager agents: business-analyst, financial-analyst, valuation-specialist, synthesis-writer
- **D-02:** `/writing-skills` MUST read ALL reference files in the skill directory: `anthropic-best-practices.md`, `testing-skills-with-subagents.md`, `persuasion-principles.md`, `graphviz-conventions.dot`, `examples/`
- **D-03:** Claude drafts each prompt via `/writing-skills` (reading writing briefs + curriculum + reference files). User reviews and approves each before moving to next agent.
- **D-04:** Only 4 agents need prompts for 5C — the One Pager agents. Remaining agents (primary-source-reader, competitor-evaluator, management-evaluator, risk-analyst) keep stubs until Phase 6.
- **D-05:** Data-assembler is code-driven (no prompt needed). The CC skill wires in the existing `assembleDataPacket()` from 5A.

### CC Skill Architecture
- **D-06:** `/generate:one-pager {TICKER}` is a Claude Code skill (`.claude/skills/generate-one-pager/SKILL.md`) that orchestrates the full One Pager pipeline
- **D-07:** Dual-path runtime strategy: Phase 5C uses CC subagents (free with CC subscription) for development/validation. Phase 8 adds direct Claude API calls via `aiResearch.js` for the Tauri production app. Same agent prompts power both paths.
- **D-08:** The CC skill reads agent prompt.md files, assembles the DataPacket, dispatches subagents with sliced DataPacket + curriculum, collects structured section outputs, and saves the report to `.thes1s/reports/{TICKER}/`

### Agent Execution Model
- **D-09:** Parallel execution for analysts: DataPacket assembled first (sequential). Then financial-analyst, business-analyst, and valuation-specialist run as parallel CC subagents (no dependencies between them). Synthesis-writer runs last after all 3 complete. Matches the dispatch table from 5A.
- **D-10:** Model selection: Sonnet for analyst agents (financial-analyst, business-analyst, valuation-specialist). Opus for synthesis-writer (needs judgment to weigh verdicts and craft narrative).
- **D-11:** Each subagent receives: its prompt.md as system context, sliced DataPacket (per config.json dataPacketSlice), curriculum files (per config.json curriculum array), universal context (rule-one-fundamentals.md + tools-for-analysis.md), and the ReportSectionSchema for structured output.
- **D-12:** Agent output must conform to ReportSectionSchema (Zod validation). Structured output enforcement via schema, not just prompting.

### Benchmark & Validation
- **D-13:** Test ticker for first generation is user's choice at runtime (any ticker with good EDGAR data). LULU is the benchmark for comparison but is never used during generation (contamination boundary).
- **D-14:** "80% section depth match" is user-verified — the user reads the generated One Pager side-by-side with the LULU One Pager PDF and judges whether each section has comparable depth, specificity, and rigor.

### Claude's Discretion
- CC skill internal implementation details (how subagents are spawned, error handling patterns)
- DataPacket assembly error handling during generation (already resilient from 5A)
- Report file format within `.thes1s/reports/{TICKER}/` (JSON structure, section files)
- Progress state updates during generation (uses progressState.js from 5A)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Architecture (Source of Truth)
- `gstack/plans/gstack-ai-agent-workflow-plan-20260323.md` — Authoritative architecture plan. Agent roles, stage orchestration, quality system, report schema, cost estimates, 22 key design decisions.

### Phase 5A Outputs (Foundation This Phase Builds On)
- `agents/orchestrator/dispatch-table.json` — Exact phase groupings, parallelism rules, section keys for One Pager
- `agents/orchestrator/config.json` — Section-to-agent mapping for all stages
- `src/schemas/reportSection.js` — ReportSectionSchema that agents must conform to
- `src/schemas/dataPacket.js` — DataPacketSchema + sliceDataPacket()
- `src/schemas/progress.js` — ProgressSchema for generation state
- `src/engines/dataExport.js` — assembleDataPacket() function
- `src/engines/toolbox.js` — TOOL_DEFINITIONS for agent tools
- `src/engines/progressState.js` — State persistence for crash recovery

### Agent Definitions (To Be Authored in This Phase)
- `agents/business-analyst/config.json` — Sections, curriculum, DataPacket slice, tools
- `agents/financial-analyst/config.json` — Sections, curriculum, DataPacket slice, tools
- `agents/valuation-specialist/config.json` — Sections, curriculum, DataPacket slice, tools
- `agents/synthesis-writer/config.json` — Sections, curriculum, DataPacket slice, tools

### Writing Briefs (Guides for /writing-skills Authoring)
- `agents/writing-briefs/business-analyst-brief.md` — Curriculum mapping + DataPacket context
- `agents/writing-briefs/financial-analyst-brief.md` — Curriculum mapping + DataPacket context
- `agents/writing-briefs/valuation-specialist-brief.md` — Curriculum mapping + DataPacket context
- `agents/writing-briefs/synthesis-writer-brief.md` — Curriculum mapping + DataPacket context

### Rule One Curriculum (Loaded Into Agents)
- `knowledge/stage-1-one-pager/one-pager.md` — One Pager curriculum
- `knowledge/stage-1-one-pager/template.md` — One Pager template
- `knowledge/research-references/rule-one-fundamentals.md` — Universal: R1 philosophy, 3 Ms
- `knowledge/research-references/tools-for-analysis.md` — Universal: practical tools, data sources
- `knowledge/research-references/advanced-financial-analysis.md` — Financial benchmarks
- `knowledge/research-references/fgr.md` — FGR methodology
- `knowledge/research-references/capex-cash-flow-explained.md` — CapEx breakdown
- `knowledge/research-references/equity-bond-research.md` — Equity Bond methodology

### Skill Authoring (For /writing-skills)
- `.claude/skills/writing-skills/SKILL.md` — TDD-style skill authoring methodology
- `.claude/skills/writing-skills/anthropic-best-practices.md` — Anthropic prompt engineering guidance
- `.claude/skills/writing-skills/testing-skills-with-subagents.md` — Pressure testing methodology
- `.claude/skills/writing-skills/persuasion-principles.md` — Persuasion/communication principles
- `.claude/skills/writing-skills/examples/` — Example skills for reference

### Benchmark
- `knowledge/stage-1-one-pager/examples/LULU One Pager.PDF` — LULU benchmark (comparison only, never agent input)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/engines/dataExport.js`: assembleDataPacket() — complete DataPacket assembly from all 20+ engines, error-resilient
- `src/engines/toolbox.js`: TOOL_DEFINITIONS + executeTool() + createToolExecutor() — 13 Claude tool_use compatible tools
- `src/engines/progressState.js`: createProgress/readProgress/updateSectionStatus/advanceState — full state machine for generation tracking
- `src/schemas/reportSection.js`: ReportSectionSchema + getReportSectionJSONSchema() — Zod validation + JSON Schema for structured outputs
- `src/schemas/dataPacket.js`: sliceDataPacket() — filters DataPacket to agent-specific fields
- `src/engines/nodeAdapter.js`: Browser-to-Node shims for running engines from CLI

### Established Patterns
- Agent configs in `agents/*/config.json` define curriculum, dataPacketSlice, tools, sections per stage
- Writing briefs in `agents/writing-briefs/` map curriculum to sections with DataPacket context
- Three-layer XBRL engine provides financial data with provenance tracking
- Inline styles with mutable C palette (dark/light) — no CSS files

### Integration Points
- CC skill at `.claude/skills/generate-one-pager/SKILL.md` — new entry point
- Agent prompt.md files in `agents/*/prompt.md` — stubs to be replaced
- `.thes1s/reports/{TICKER}/` — output directory for generated reports (gitignored)
- `progressState.js` state machine — tracks generation from IDLE through COMPLETE

</code_context>

<specifics>
## Specific Ideas

- `/writing-skills` sessions should read the agent's writing brief FIRST, then the curriculum files referenced in the brief, then the reference files in the writing-skills directory. The brief is the roadmap for prompt authoring.
- Each agent prompt must enforce ReportSectionSchema output format — agents should know exactly what fields they must produce.
- The CC skill should show progress as agents complete (which agent finished, what verdict, cost). The user watches this in the terminal.
- For the benchmark comparison, save the generated One Pager as both JSON (machine-readable) and a formatted markdown file (human-readable for side-by-side comparison with LULU PDF).

</specifics>

<deferred>
## Deferred Ideas

- Direct Claude API path for production Tauri app — Phase 8 (`aiResearch.js`)
- Primary Source Reader agent prompt — Phase 6 (Pitch Deck needs it, One Pager doesn't)
- Competitor-evaluator, management-evaluator, risk-analyst prompts — Phase 6
- Token budget measurement and optimization — Quality System Phase 5D
- Automated eval system — user IS the eval for first 5-10 reports

</deferred>

---

*Phase: 05C-cc-skill-first-analysis*
*Context gathered: 2026-03-24*
