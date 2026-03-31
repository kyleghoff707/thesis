# Phase 16: API Migration - Context

**Gathered:** 2026-03-31
**Status:** Ready for planning

<domain>
## Phase Boundary

Migrate Full Story pipeline from CC skill to Claude API dispatch using the proven aiResearch.js + pipelineManager.js infrastructure. All 6 Full Story sections must dispatch via API with structured output enforcement, including the 4-step adversarial debate. Cost is benchmarked against the (revised) $15 ceiling.

</domain>

<decisions>
## Implementation Decisions

### Debate Dispatch Architecture
- **D-01:** Extend pipelineManager.js with an `if (wave.isDebate)` branch for sequential debate dispatch. Do NOT create a separate debateDispatcher.js. Keeps all dispatch logic in one file and reuses existing retry, budget, and cache infrastructure.
- **D-02:** Debate steps execute sequentially within pipelineManager. Each step receives prior step outputs via the `receivesContext` array from dispatch-table.json. Bull output → bear input, bull+bear → rebuttal input, all three → judge input.
- **D-03:** Web search is gated per step — only bear (step 2) gets `web_search` tool. Check `step.webSearch` before adding tool to the dispatch call.

### S6 Composition Strategy
- **D-04:** Use a 5th AI call (synthesis-writer agent) to compose the 4 debate step outputs into the final S6 ReportSectionSchema. This matches the CC skill pattern that produced 91/100 quality. The synthesis-writer receives all 4 step outputs and composes narrative + verdict table + structured data fields.
- **D-05:** The synthesis call is the ONLY call that returns a ReportSectionSchema for S6. The 4 intermediate debate steps return DebateStepSchema (lightweight format per D-06 from Phase 14).

### Cost Management
- **D-06:** Raise the full pipeline cost ceiling from $12 to $15. The $8-12 target was set before Full Story scope was clear. $15 for 3 complete stages of hedge-fund-grade analysis is still a fraction of 70+ hours of manual work.
- **D-07:** Cost breakdown is tracked per-agent and per-step via contextBudget.js. Full Story cost is reported separately from Pitch Deck cost so the user can see where money goes.

### Quality Parity Validation
- **D-08:** Re-run SFM Full Story via API, run quality scorer (run-quality-v4.js), compare against CC baseline (89 mechanical / 88 methodology). Accept if within 5 points of baseline.
- **D-09:** Quality validation happens within Phase 16 (not deferred to Phase 17). Phase 17 handles end-to-end multi-stage validation.

### Claude's Discretion
- Model selection per agent/step (Opus vs Sonnet) — optimize for quality within $15 ceiling
- DebateStepSchema Zod definition — adapt from existing JSON schema in agents/orchestrator/schemas/
- max_tokens per step — size based on CC output token counts
- Cache strategy for debate context passing — whether to cache bull/bear outputs in system message blocks

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Proven Infrastructure (Phases 7-11)
- `src/engines/aiResearch.js` — Core dispatch engine (dispatchAgent, retry logic, structured outputs, citation enrichment)
- `src/engines/pipelineManager.js` — Wave orchestration (extend for debate sequential dispatch)
- `src/engines/contextBudget.js` — Per-agent cost tracking
- `src/engines/cacheMonitor.js` — Cache hit rate monitoring

### Full Story Configuration
- `agents/orchestrator/dispatch-table.json` — fullStory phases, agent assignments, debate step structure
- `agents/orchestrator/schemas/debate-step.schema.json` — DebateStepSchema (ready but not yet wired)
- `agents/orchestrator/schemas/checklist-item.schema.json` — ChecklistSchema for S2/S3/S4

### Agent Prompts (Updated Phase 12)
- `agents/risk-analyst/config.json` — Sections: fullStory [1, 6]; curriculum includes story-form-II.md
- `agents/business-analyst/config.json` — Section: fullStory [2]
- `agents/competitor-evaluator/config.json` — Section: fullStory [3]
- `agents/management-evaluator/config.json` — Section: fullStory [4]
- `agents/valuation-specialist/config.json` — Section: fullStory [5]
- `agents/synthesis-writer/config.json` — Debate roles: bull (step 1), bull_rebuttal (step 3), synthesis (step 5)
- `agents/financial-analyst/config.json` — Debate role: judge (step 4)

### Quality Baseline
- `.thes1s/reports/SFM/quality/full-story-v4.quality.json` — CC baseline scores (89/88)
- `src/engines/critic.js` — Full Story methodology checks (33 checks across 6 sections)
- `scripts/run-quality-v4.js` — Quality runner with debate-step-2 backfill

### Curriculum
- `knowledge/stage-3-full-story/story-form-I.md` — S1-S4 methodology
- `knowledge/stage-3-full-story/story-form-II.md` — S5-S6 methodology

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `dispatchAgent()` in aiResearch.js — handles structured output, retry-escalate, web search extraction, citation enrichment. Reuse for all debate steps.
- `runPipeline()` in pipelineManager.js — wave orchestration with checkpoint callbacks. Extend with `isDebate` branch.
- `createBudgetTracker()` / `createCacheMonitor()` — cost and cache tracking. Reuse as-is.
- `ReportSectionSchema` Zod schema — already enforces all section outputs. Debate steps need a separate DebateStepSchema.

### Established Patterns
- All dispatch goes through `client.messages.parse()` with `zodOutputFormat()` — proven in Phases 8-10
- System message caching uses `cache_control: { type: 'ephemeral' }` breakpoints — universal context + PSR findings cached, agent-specific content not cached
- `section.data` is serialized as JSON string by agents, parsed by orchestrator post-extraction
- Dynamic field path block (FIX-01) injected at dispatch time for citation accuracy

### Integration Points
- pipelineManager.js `for (const wave of stageConfig.phases)` loop — add `if (wave.isDebate)` branch here
- dispatchAgent options — add `debateContext` field for passing prior step outputs
- run-quality-v4.js — already handles Full Story scoring with debate-step-2 backfill

### Key Gap
- pipelineManager.js has NO code for sequential dispatch, context routing between steps, or multi-schema support. All of this is new for Phase 16.

</code_context>

<specifics>
## Specific Ideas

- The 5th synthesis call for S6 composition matches the CC pattern exactly — synthesis-writer already has the prompt for this role
- CC skill produced SFM Full Story at 89/88 quality — this is the bar to match within 5 points
- Debate step outputs are saved individually (debate-step-1.json through debate-step-4.json) for debugging — keep this pattern in API mode

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 16-api-migration*
*Context gathered: 2026-03-31*
