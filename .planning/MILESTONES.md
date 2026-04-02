# Milestones

## v1.2 Full Story Pipeline (Shipped: 2026-04-02)

**Phases completed:** 14 phases, 31 plans, 50 tasks

**Key accomplishments:**

- z.looseObject({}) replaced with z.string() in all API-facing schemas, CitationSchema gets optional url field, critic.js backward-compatible with string data
- Anthropic SDK upgraded to 0.80.0 with two-stage live smoke test verifying ReportSectionSchema structured outputs and web search tool compatibility
- Date:
- 21-test aiResearch.js scaffold with mock Claude API fixtures and contextBudget claude-sonnet-4-6 model ID fix for structured output dispatch
- Claude API dispatch engine (aiResearch.js) with structured output, web search URL extraction, citation enrichment, retry logic, and cost tracking — 30 unit tests passing
- Cache hit/miss tracking with 70% threshold warning and actual-usage budget tracking with corrected Opus 4.6 pricing ($5/$25)
- Multi-block system message with cache_control breakpoints on shared context, corrected Opus pricing from $15/$75 to $5/$25, and PM feedback support in user messages
- Wave-based pipeline manager dispatching agents in parallel via Promise.allSettled with PM checkpoint feedback, budget tracking, and cache monitoring
- Date:
- Dynamic DataPacket field path reference block for agent prompts (FIX-01) and automated PSR findings extraction/wiring for downstream analysis agents (D-02)
- Split multi-section dispatches to one-per-section for ReportSectionSchema, removed CC-specific references, replaced unavailable tool documentation with DataPacket field paths, and added PSR agent dispatch mode notes
- Date:
- Rule One curriculum methodology scoring added to critic.js -- per-section checks for all 10 Pitch Deck types with dual mechanical/methodology quality reporting
- Date:
- Full Story dispatch table with 6-section layout, 4-step adversarial debate, and checklist/debate JSON schemas for agent output contracts
- 7 agent prompts updated with Full Story instructions: 3 checklist sections (unified PASS/FAIL/PARTIAL schema), 4 debate roles (lightweight format, bear-only web search), and valuation confirmation with 5 growth quality checks
- Aligned progressState.js and generate-section skill with 6-section fullStory dispatch table (removed trading_strategy, pace_plan)
- 586-line CC skill orchestrating 5-section Full Story with Pitch Deck inheritance, scored checklists, and Phase 14 debate placeholder
- 33 methodology checks across 6 Full Story section types with polymorphic checklist parsing, verdict normalization, and dual-score CLI support
- 66 unit tests covering all 33 methodology checks, 4 helpers, completeness weight adjustment, and end-to-end validateStage scoring using 6 real SFM fixtures
- 4 Zod debate step schemas with DEBATE_SCHEMAS lookup map, schema-parameterized dispatchAgent with web search gating and debate context injection
- Sequential 4-step debate dispatch in pipelineManager with inter-step context routing, web search gating, synthesis composition, and 21 comprehensive tests
- CLI runner for Full Story pipeline with Pitch Deck gate check, debate step saving, and per-stage cost reporting against $15 ceiling
- Single-call Sonnet generator replaces 6-agent One Pager pipeline with Zod structured output and backward-compatible PDF format
- Live-validated single-call One Pager on COST ($0.32, 2.5min) with simplified CC skill approved by user
- Unified pipeline dispatch: One Pager now routes through pipelineManager.js with budget/cache tracking, eliminating the early-exit bypass in run-pipeline.js
- run-pipeline.js extended with --stage all flag for automated 3-stage chaining (OP->PD->FS) with inline quality gate checks via critic.js
- 4 Python modules providing unified data access, section rendering, Thes1s PDF base class, and matplotlib chart image generation for all 6 report export generators
- Pitch Deck:
- Word doc generators for all 3 pipeline stages with embedded matplotlib chart images, Thes1s branding, and full debate rendering

---

## v1.0 — Agent Infrastructure & Pitch Deck Pipeline (Completed 2026-03-27)

**Goal:** Transform Thes1s from a financial data toolbox into a hedge-fund-quality AI research operation with 9 agent roles, multi-agent Pitch Deck generation, and quality guardrails.

**What shipped:**

- Phase 5A: Agent definitions, DataPacket assembly, report schema, Node.js data bridge (5 plans)
- Phase 5C: CC skill One Pager generation, first LULU benchmark comparison (4 plans)
- Phase 5B: One Pager display components, SectionRenderer, progress dashboard (3 plans)
- Phase 5D: Quality system — critic.js, context budget, failure recovery (3 plans)
- Phase 6: Pitch Deck — multi-agent orchestration, 10 sections, checkpoints, sensitivity tables, delight features (12 plans)
- Phase 06.1: Pipeline hardening — DataPacket Node.js fixes, filing tools, quality enforcement (5 plans)
- Phase 06.2: Data pipeline hardening — form-aware filing extraction, guru prefetch fix, data checkpoint (3 plans)
- Phase 06.3: Pipeline validation — 3 SFM runs (V1: 63, V2: 56, V3: 75/100)

**Key metrics:** 35+ plans executed, 9 agent roles, 10 pitch deck sections, 173 vitest tests, 56-page branded PDF generation

**Quality ceiling:** V3 scored 75/100 with persistent compliance issues (citation format, web URLs, schema enforcement) that require API migration to solve mechanically.

**Carried forward to v1.1:** API migration, Pitch Deck quality to 85+, parallel dispatch, prompt caching

## v1.1 — API Migration & Pitch Deck Quality (Completed 2026-03-29)

**Goal:** Migrate Pitch Deck pipeline from CC subagents to direct Claude API calls, solving compliance issues mechanically through structured outputs while enabling parallel dispatch and prompt caching.

**What shipped:**

- Phase 7: Schema & SDK Foundation — z.string() fix, SDK 0.80.0, live smoke tests (2 plans, 35min)
- Phase 8: Core Agent Dispatch — aiResearch.js dispatch engine, web search URL extraction, retry logic (2 plans, 12min)
- Phase 9: Parallel Dispatch & Caching — pipeline manager, budget tracker, cache monitor, wave orchestration (3 plans, 13min)
- Phase 10: Pipeline Integration & Prompt Fixes — field path generator, PSR findings formatter, dispatch table split, live SFM run (3 plans, 90min)
- Phase 11: Validation — methodology scoring in critic.js (37 checks), bracket path fix, dual quality scores (1 plan, 12min)

**Key metrics:** 14 plans executed, $8.53/company, 19min runtime, 94 mechanical / 93 methodology, 2,224 tests passing

**Live SFM run:** 13 sections, 0 errors, 368 citations (100% canonical), 40 web searches, 518K input + 130K output tokens

**Carried forward to v1.2:** Full Story pipeline, One Pager simplification, UI integration
