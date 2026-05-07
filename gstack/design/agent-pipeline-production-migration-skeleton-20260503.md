# Agent Pipeline → Production Migration — Design Skeleton

**Status:** Skeleton design doc. NOT a plan, NOT a brainstorm. The artifact a future Claude session reads to know what to brainstorm.
**Date:** 2026-05-03
**Owner:** Kyle (PM); Claude (engineering)
**Goal:** Migrate the Thes1s 3-stage agent pipeline (One Pager → Pitch Deck → Full Story) from the legacy Managed Agents v1 stack to a production v3 stack on Langfuse + Inngest + Fly.io, including the UI/UX users see while runs are in flight.

---

## How to use this doc

This skeleton lays out THREE brainstorms in sequence. For each brainstorm:
- The **scope** (what's in, what's out) is fixed — do not deviate
- The **decisions to make** are the items the brainstorm must resolve
- The **open questions** are starting points; the brainstorm will surface more
- The **output format** is the artifact the brainstorm produces
- The **files to read first** are required before brainstorming begins

Each brainstorm runs in a fresh Claude session. Paste the section's "How to invoke" block into that session. Stop at the output, do not execute. Come back to verify before kicking off the next brainstorm.

---

## Where we are now (context for every brainstorm)

**Done:**
- **Phase 1 (One Pager backend, 2026-05-02):** TypeScript service in `agents-service/` deployed to Fly.io. Inngest Cloud orchestrates. Anthropic SDK direct (no agent framework). Langfuse traces every call. Worker `/api/v3/*` routes dispatch + receive callbacks. D1 `v3_runs` table tracks per-run state. End-to-end verified for AAPL (~90s, ~$0.05 without web search).
- **Streaming + web search plan (2026-05-02 → in execution now):** Pattern 1 wrapper (auto-loop → forced fallback) re-enables web search. ProgressPublisher class + per-agent D1 table + `/progress` Worker endpoint give every stage streaming progress out of the box. **Pre-wires PD/FS — when their runners come online, they instantiate ProgressPublisher with their own agentId and the streaming UI displays them automatically.**

**Still on v1 (Managed Agents, blocked on `callable_agents` Research Preview):**
- Pitch Deck — 10 specialists in 5 waves with cross-wave dependencies
- Full Story — 7-agent adversarial debate (Bull → Bear → Rebuttal → Judge → Compose)

**Frontend:**
- v1 UI (`useGeneratePipeline`) shows live streaming sections + progress for all 3 stages
- v3 hook fields (`phase`, `phaseLabel`, `agents[]`, `heartbeatAt`, `tokens`, `costUsd`, `failedSections`) being added now
- v3 has NO frontend renderer yet — runs trigger via DevTools fetch

---

## Cross-cutting principles (apply to all three brainstorms)

1. **Production stack is fixed: Langfuse + Inngest + Fly.io + direct Anthropic SDK.** Brainstorms do not relitigate this.
2. **Reuse infrastructure aggressively.** `anthropic-client.ts` wrapper, ProgressPublisher class, `v3_run_agents` table, `/progress` + `/callback` + `/status` endpoints, hook fields — all pipeline-agnostic. New stages plug into them, do not duplicate.
3. **Parity + cleanup is the bar (not parity alone, not parity + improvements).** TODOS.md items 1–5 are IN scope of the migration plans, not a separate sprint. Fix and migrate as one motion.
4. **No v1 breakage until cutover.** v1 routes (`/api/pipeline/*`) and v1 hook stay live throughout. v3 lives at `/api/v3/*` parallel.
5. **No cost or wall-clock ceilings yet.** The worst observed was ~3 hr / ~$30 for one full run during development — keep that order of magnitude in mind, but do not make it a hard cap. Cost discipline comes from Pattern 1's per-agent budget caps and Langfuse observability, not from a top-level kill switch (yet).
6. **Don't pre-design the agent prompts.** Prompt content is execution work in the impl plan, not brainstorm output.
7. **Production-portable changes only.** Anything that works only in Claude Code subagents and not in the Inngest/Fly stack is forbidden — see `feedback_production_parity` memory.

---

## Brainstorm 1 — v3 Cross-Stage Architectural Decisions

### Scope

**IN:** Architectural decisions that PD and FS migrations both need, made once and shared.

**OUT:** Stage-specific orchestration (waves vs debate), per-agent prompts, UI design, cost estimates.

### Decisions to make (each must be resolved before Brainstorm 2)

1. **DataPacket flow.** Currently `api/src/assembly/assembleDataPacket.js` runs on Worker, imports frontend engines, installs fetch interceptor for direct SEC/EDGAR access, overrides gurus/insiders/transcripts with D1/R2 bindings. For v3, where does DataPacket get assembled and how does it reach the agent?
   - Option A: Worker assembles, sends as Inngest event payload — clean, but DataPacket can be 100KB+ and Inngest events have size limits.
   - Option B: Fly assembles — port engine code to TypeScript, run inside `agents-service/`. Lots of porting.
   - Option C: Worker assembles, stores in D1 or R2 keyed by runId, Fly fetches on demand — adds storage hop, no size constraint.

2. **Filing content flow.** `assembleFilingContent.js` fetches SEC HTML, runs cheerio + Turndown, extracts sections. Content can be megabytes. Same A/B/C question as DataPacket but with stronger size pressure.

3. **Multi-role agent disambiguation (TODOS item 1).** Risk Analyst, Synthesis Writer, and Financial Analyst each play 2-4 distinct roles across PD and FS with different inputs/outputs/tools per role. Two options:
   - 1A — Split into separate agent prompts (`risk-analyst-pest`, `risk-analyst-event`, `risk-analyst-bear`). More files, zero ambiguity, no runtime branching.
   - 1B — Single shared prompt with explicit `role` parameter and role-specific subsections. Fewer files, more complex prompts.
   - **This decision sets the file inventory of both Brainstorm 2 plans.** Pick one.

4. **Cross-cutting findings (TODOS item 4).** Today each agent emits unstructured `crossCuttingFindings`. v3 needs:
   - A Zod schema for the finding shape (what fields? severity? source agent? target sections?)
   - An aggregation step (where? Inngest step or in the runner?)
   - How aggregated findings flow into next-wave agents (input field name, position in prompt, etc.)

5. **Inngest event schema for stage triggers.** What does `thes1s/pitchdeck.start` and `thes1s/fullstory.start` carry? Just `{ runId, ticker, userId }` like One Pager, or more (e.g., `reportId` for v1-shape persistence)?

6. **Prompt cleanup approach for filesystem-based section passing (TODOS item 3).** The v1 Managed Agents pipeline writes to `/workspace/sections/`. v3 must use Inngest step return values. Decision: rewrite affected prompt sections during migration, or write a thin shim that stages still talk to "files" but they're backed by step state. Recommend rewrite — cleaner — but acknowledge trade-off.

7. **Web search timeout/empty fallback (TODOS item 5, partial).** Pattern 1's per-agent caps handle "search hangs forever". What's NOT yet solved: prompt-level degradation when search returns empty. Decision: standard fallback language to add to every web-search-using agent prompt.

8. **Persistence into existing data model.** Today the v3 callback writes only to `v3_runs.result_json`. The v1 reports system writes structured stage output to `report_stages.data`. Question: does v3 also write into `report_stages` so the existing report renderer "just works" (clean cutover), or does v3 build a new renderer that reads `v3_runs.result_json`? Affects Brainstorm 3.

### Open questions to surface

- DataPacket size — what's the actual median and p95 size today? (Inngest free-tier event limit is 32KB; paid is higher.) Need to check before deciding A/B/C.
- Filing content cache strategy — R2 cache exists today. Reuse it for v3 (Fly reads from R2)? That's basically Option C for filing content for free.
- If we go Option C for both, what's the storage key naming? `assembly/{runId}/datapacket.json` and `assembly/{runId}/filings.json`?
- Does the Worker need to validate DataPacket BEFORE sending to Inngest, or do we trust the engine output and let Fly handle validation?
- For multi-role agents, does Option A double the prompt-maintenance burden? (Probably not by much — most prompt content is shared across roles.)

### Output format

A short DECISIONS doc, NOT an implementation plan. Save as:
`gstack/design/agent-pipeline-cross-stage-decisions-{YYYYMMDD}.md`

Structure: one section per decision (1-8 above), each with:
- The choice
- Rejected alternatives + why
- Implementation implications for PD/FS
- Any open questions that propagate to the next brainstorm

### Files to read first

1. `gstack/design/agent-pipeline-production-migration-skeleton-{YYYYMMDD}.md` (this file)
2. `CLAUDE.md` — especially the "v3 Pipeline" and "Agent Pipeline (Managed Agents v2)" sections
3. `TODOS.md` — items 1-5 are required reading
4. `api/src/assembly/assembleDataPacket.js` and `api/src/assembly/assembleFilingContent.js`
5. `api/src/routes/pipeline-v3.js` (current v3 routes) and `api/src/routes/pipeline.js` (v1 reference)
6. `agents-service/src/lib/anthropic-client.ts` (the wrapper that all stages use)
7. `agents-service/src/lib/worker-progress.js` (ProgressPublisher class)
8. `agents-v2/coordinator-pitchdeck/prompt.md` and `agents-v2/coordinator-fullstory/prompt.md` (orchestration today)
9. `gstack/plans/agent-pipeline-streaming-and-websearch-eng-plan-20260502.md` (the streaming + web search plan; provides the wrapper context)

### How to invoke

````
/brainstorm

I'm Kyle, working on Thes1s. Read the design skeleton at
/Users/kylehoff/Desktop/stock-analyzer/gstack/design/agent-pipeline-production-migration-skeleton-20260503.md
in full. Then run /brainstorm scoped tightly to "Brainstorm 1 — v3 Cross-Stage
Architectural Decisions" only. Resolve all 8 decisions. When done, run /write-plan
and save the output as `gstack/design/agent-pipeline-cross-stage-decisions-{YYYYMMDD}.md`.

Stop after the decisions doc is written. Do not start Brainstorm 2.
````

---

## Brainstorm 2 — Pitch Deck + Full Story v3 Migration (combined)

### Scope

**IN:** Implementation plan for migrating BOTH Pitch Deck (10 agents, 5 waves) and Full Story (7-agent debate) to v3, with TODOS items 1-5 baked in. Combined because they share agents (Risk Analyst, Synthesis Writer, Financial Analyst), share infrastructure decisions (made in Brainstorm 1), and share testing strategy.

**OUT:** UI/UX (Brainstorm 3), cross-stage architecture (already decided in Brainstorm 1).

### Decisions to make

1. **PD wave orchestration in Inngest.**
   - 5 waves with dependencies (Wave 0 PSR → Wave 1 Business Context → Wave 2 Deep Analysis → Wave 3 Risk & Valuation → Wave 4 Synthesis).
   - Within each wave, agents run in parallel. Use `Promise.all([step.run(...), step.run(...)])` or `step.parallel`?
   - How are wave outputs aggregated and passed to the next wave's input?

2. **PD partial success policy (TODOS item 7 from streaming plan, deferred to here).**
   - Wave 0 (PSR) — both readers required? Either failure = abort run?
   - Waves 1-3 — degrade gracefully? Mark agent failed, continue, synthesis writer notes the gap?
   - Wave 4 (Synthesis) — runs with whatever's available, even if 6 of 10 sections present?
   - This is the wave-by-wave failure policy that was deferred from the streaming plan. **Decide it now.**

3. **FS debate orchestration in Inngest.**
   - Sequential: Bull → Bear → Rebuttal → Judge → Compose
   - Each step receives all prior outputs as input
   - Schema-validate after each step before passing to next (TODOS item 2)

4. **FS debate cascade fallback policy (TODOS item 2).** If Bear fails:
   - Hard-fail entire FS run?
   - Mark Section 6 "Debate incomplete: Bear failed" and ship Bull-as-thesis?
   - Retry Bear once with validation error in prompt, then fall back?

5. **Per-agent Zod schemas.** 10 PD agents × output schema + 7 FS agents × output schema. Reuse `ReportSectionSchema` where possible. Where do they live in the file tree?

6. **Per-agent runners.** Each agent gets a runner file like `agents-service/src/agents/business-analyst-pitchdeck.ts` (or whatever Brainstorm 1 decided for naming). Each runner: loads prompt, instantiates ProgressPublisher, calls `callAgentWithStructuredOutput` with web-search caps + cost ceiling tuned for that agent.

7. **Inngest function structure.**
   - PD: 1 function with 5 wave-step blocks + final synthesis step + post-callback
   - FS: 1 function with 5 sequential debate-step blocks + post-callback
   - Both publish per-agent state via ProgressPublisher

8. **DataPacket + filing content integration** (consumes Brainstorm 1 decisions). Wherever assembly lives, both PD and FS need:
   - DataPacket fetched/received before Wave 0 / Bull
   - Filing content fetched/received before Annual Reader / Quarterly Reader

9. **Cost budget per stage.** Brainstorm 1 might decide cost-ceiling philosophy; this brainstorm sets the actual numbers per stage. Not a hard cap (Kyle's call) — but the per-agent `costCeilingUsd` parameter needs values.

10. **Testing strategy.** How to test a 10-agent multi-wave Inngest function? Mock 10 Anthropic responses? Test each runner in isolation + a single integration test for the full PD flow?

### Open questions to surface

- Are there any PD agents whose work is so prerequisite that even partial-failure of EARLIER waves shouldn't block them? (e.g., does Synthesis Writer need ALL sections, or can it produce a partial report?)
- The agents-v2/ prompts assume Managed Agents `callable_agents` exists. Concretely, what content needs editing in each prompt to remove that assumption? (Recommend: do this as a separate audit pass during the migration — don't preempt now.)
- Is there a "research" or "assemble" step needed before Wave 0 in PD? (Currently Worker assembles, sends to Inngest. Brainstorm 1 may have changed this.)
- Should FS Compose be its own agent, or is it a final synthesis step inside the FS function (no separate Anthropic call)?
- For TODOS item 4 (cross-cutting findings), is aggregation a CPU operation (just merge JSON) or does it warrant its own micro-Anthropic-call to dedupe/rank?

### Output format

ONE implementation plan. Save as:
`gstack/plans/agent-pipeline-pitchdeck-fullstory-eng-plan-{YYYYMMDD}.md`

Structure: same as the One Pager migration plan (`gstack/plans/agent-pipeline-migration-onepager-eng-plan-20260502.md`) — phase-based, task-by-task, with code snippets, file lists, commit points, USER ACTION REQUIRED gates.

### Files to read first

1. The Brainstorm 1 output (`gstack/design/agent-pipeline-cross-stage-decisions-{YYYYMMDD}.md`)
2. `gstack/plans/agent-pipeline-migration-onepager-eng-plan-20260502.md` — template structure to mirror
3. `gstack/plans/agent-pipeline-streaming-and-websearch-eng-plan-20260502.md` and its impl plan (whatever the impl plan filename ended up as) — provides Pattern 1 wrapper context, ProgressPublisher API, `/progress` endpoint
4. All 17 prompt files: `agents-v2/coordinator-pitchdeck/`, `agents-v2/coordinator-fullstory/`, and the 15 specialist prompts under `agents-v2/*-pitchdeck/` and `agents-v2/*-fullstory/`
5. `CLAUDE.md` — Pitch Deck Wave Structure section, Managed Agents IDs section
6. `TODOS.md` — items 1-5 in full
7. The ALREADY-MIGRATED One Pager as reference: `agents-service/src/agents/one-pager.ts`, `agents-service/src/inngest/functions/one-pager.ts`

### How to invoke

````
/brainstorm

I'm Kyle, working on Thes1s. Read three docs in this order:
  1. /Users/kylehoff/Desktop/stock-analyzer/gstack/design/agent-pipeline-production-migration-skeleton-20260503.md
  2. The Brainstorm 1 output (most recent file in gstack/design/ matching agent-pipeline-cross-stage-decisions-*.md)
  3. /Users/kylehoff/Desktop/stock-analyzer/gstack/plans/agent-pipeline-migration-onepager-eng-plan-20260502.md (template to mirror)

Then run /brainstorm scoped tightly to "Brainstorm 2 — Pitch Deck + Full Story v3
Migration (combined)". Address all 10 decisions and surface additional open questions.
TODOS.md items 1-5 are IN scope — fix and migrate together. Combined plan because PD
and FS share agents and infrastructure.

When done, run /write-plan and save as
`gstack/plans/agent-pipeline-pitchdeck-fullstory-eng-plan-{YYYYMMDD}.md`.

Stop after the impl plan is written. Do not start Brainstorm 3.
````

---

## Brainstorm 3 — v3 Frontend UI/UX (all 3 stages)

### Scope

**IN:** Visual + interaction design for the v3 streaming experience across One Pager, Pitch Deck, and Full Story. The UI consumes the existing v3 hook fields (`phase`, `phaseLabel`, `agents[]`, `heartbeatAt`, `tokens`, `costUsd`, `failedSections`) — backend contract is fixed.

**OUT:** Backend changes (none allowed — if the design needs new backend fields, surface as open question, don't preempt). Cutover decision (separate, comes after).

### Decisions to make

1. **The "running" UX for each stage.** What does the user see for the 5-15 minutes a Pitch Deck or Full Story takes?
   - Sections appearing one-by-one (v1 style)?
   - Hedge-fund-analyst-team metaphor: "Annual Reader: ✓ · Quarterly Reader: ◷ Reading 2024 Q3 · Business Analyst: queued"?
   - Wave-based progress bar with sub-progress?
   - Live transcript of agent outputs as they complete?
   - All of the above, layered?

2. **Per-agent visualization.** With 10 PD agents in 5 waves, how is the wave structure shown? Vertical timeline? Horizontal swim lanes? Collapsed/expandable?

3. **Failure UX.** When agent 7 of 10 fails (TODOS item 7 partial-success policy), what does the user see? How is "completed_with_errors" rendered differently from "completed"?

4. **Cost + token transparency.** The `tokens` and `costUsd` fields are real-time. Do we show them prominently (analyst-team metaphor: "$2.40 / $5 budget used"), hide them, or show on hover?

5. **Heartbeat display.** If `heartbeatAt` is >30s stale, show a "stuck?" indicator? Auto-suggest a retry? Stay silent?

6. **Stage-specific: Full Story debate visualization.** The Bull → Bear → Rebuttal → Judge → Compose flow is conceptually a debate. Does the UI reflect that (e.g., split-screen Bull vs Bear)? Or is it just another linear progress display?

7. **Stage-specific: Pitch Deck cross-cutting findings.** TODOS item 4 — aggregated findings flow between waves. Visible to user, or backend-only?

8. **Final report renderer.** Once `status: completed`, the existing `OnePager.jsx` / `PitchDeck.jsx` / `FullStory.jsx` components render the report. Do they need changes for v3, or does the v3 callback writing to `report_stages` (Brainstorm 1 decision 8) make it transparent?

9. **Hook integration.** The existing `useGeneratePipeline.js` already drives v1. The v3 hook fields are additive. Decision: extend `useGeneratePipeline.js` to dual-source (v1 OR v3) based on a feature flag, or build `useGeneratePipelineV3.js` and adapter at component boundary?

### Open questions to surface

- Should the "running" view for PD be different from One Pager's just because of duration (10 min vs 90s)?
- Is there value in a "waiting room" view if PD/FS will take 10+ min — let the user navigate elsewhere and come back, with a notification when done?
- How does the UI handle a refresh mid-run? (v3 polling makes this trivial — `/status/:runId` returns full state — but worth designing the resume UX explicitly.)
- Cancel button — supported? (Today: no v3 cancel mechanism. Adding one is backend work.)
- Failed-section affordance — let user retry just the failed section (not the whole run)? (Today: no partial-retry mechanism.)

### Output format

Use `/design-shotgun` to generate visual variants, then `/plan-design-review` to score them. Final artifact: a design doc + selected mockups, saved as:
`gstack/design/agent-pipeline-v3-frontend-ux-{YYYYMMDD}.md`

Implementation plan (separate, after design is approved): saved as
`gstack/plans/agent-pipeline-v3-frontend-eng-plan-{YYYYMMDD}.md`

### Files to read first

1. This skeleton (to understand context)
2. Brainstorm 1 + 2 outputs (to understand backend contract)
3. `src/components/OnePager.jsx`, `src/components/PitchDeck.jsx`, `src/components/FullStory.jsx` — current renderers
4. `src/hooks/useGeneratePipeline.js` — current v1 hook
5. The CURRENT v3 hook fields (whatever shape they ended up after the streaming plan executes) — read `src/hooks/useGeneratePipeline.js` after Phase 2 changes land
6. `src/theme.js` and existing component styling patterns — UI must match Thes1s aesthetic
7. CLAUDE.md "Design Philosophy" section — "real hedge fund" litmus test

### How to invoke

````
/brainstorm

I'm Kyle, working on Thes1s. Read four docs in this order:
  1. /Users/kylehoff/Desktop/stock-analyzer/gstack/design/agent-pipeline-production-migration-skeleton-20260503.md
  2. The Brainstorm 1 output: most recent gstack/design/agent-pipeline-cross-stage-decisions-*.md
  3. The Brainstorm 2 output: most recent gstack/plans/agent-pipeline-pitchdeck-fullstory-eng-plan-*.md
  4. CLAUDE.md "Design Philosophy" section

Then run /brainstorm scoped tightly to "Brainstorm 3 — v3 Frontend UI/UX (all 3
stages)". The backend contract is fixed (the v3 hook fields are decided). Address
all 9 decisions. Surface open questions about backend additions but DO NOT propose
backend changes in the design.

When the brainstorm is done, run /design-shotgun to generate variants, then
/plan-design-review to score them. Save the final design doc as
`gstack/design/agent-pipeline-v3-frontend-ux-{YYYYMMDD}.md`.

Then run /write-plan for the implementation work. Save as
`gstack/plans/agent-pipeline-v3-frontend-eng-plan-{YYYYMMDD}.md`.

Stop after both files are written. Do not start implementation.
````

---

## Cutover (after all three brainstorms + their executions)

Not a brainstorm — a checklist for after PD + FS + UI are all built and verified:

- [ ] All 3 stages produce v3 output equivalent to v1 in side-by-side runs (3+ tickers each)
- [ ] Streaming UX works for the longest run (Full Story, ~10+ min) without users believing it's hung
- [ ] Failed-section UX works (force one agent to fail, verify graceful degradation)
- [ ] Cost per run is within an acceptable band (TBD — Kyle decides after seeing real numbers)
- [ ] Langfuse traces show no unexpected token burn
- [ ] Frontend feature flag (`VITE_USE_V3_*`) flipped in production env file
- [ ] v1 routes marked DEPRECATED with a removal date, not deleted yet (rollback path)
- [ ] Monitor first 5 production runs for 1-2 hours after rollout

---

## Cross-cutting open questions (not owned by any single brainstorm)

These are worth answering eventually but don't block kickoff:

- Should `agents-service/` move to its own Git repo eventually, or stay in the monorepo? (Today: monorepo. Fine for now.)
- When does the v1 Managed Agents pipeline get deleted? (Plan: 30 days post-cutover, after no rollback occurred.)
- Observability dashboards — captured in TODOS item F (Langfuse reliability dashboards), triggers at 200+ production runs. Don't need to design now.
- Multi-tab UX (presentation mode) — captured in TODOS item A (Inngest Realtime + SSE), triggers when explicitly needed. Out of scope until then.

---

## References

- Skeleton lives in `gstack/design/`
- Cross-stage decisions doc (Brainstorm 1 output) lives in `gstack/design/`
- Implementation plans (Brainstorm 2 + 3 outputs) live in `gstack/plans/`
- Existing landed plan: `gstack/plans/agent-pipeline-migration-onepager-eng-plan-20260502.md`
- Existing in-execution plan: `gstack/plans/agent-pipeline-streaming-and-websearch-eng-plan-20260502.md`
- Existing TODOS: `TODOS.md` (items 1-5 + items A-F)
- Project context: `CLAUDE.md`

---

## Constraints summary (re-stated for emphasis)

1. Don't relitigate the v3 stack (Langfuse + Inngest + Fly.io is fixed)
2. Reuse infrastructure aggressively (wrapper, ProgressPublisher, D1 tables, endpoints)
3. Parity + cleanup is the bar (TODOS 1-5 in scope)
4. No v1 breakage until cutover
5. No hard cost/time ceilings yet (worst observed: ~3 hr / ~$30, keep in mind)
6. Don't pre-design agent prompts (execution work)
7. Production-portable changes only
8. Each brainstorm is scoped — do not stray
9. Output format is fixed per brainstorm — do not invent new artifact types
10. Stop at the output, do not execute. Verify with Kyle before next brainstorm
