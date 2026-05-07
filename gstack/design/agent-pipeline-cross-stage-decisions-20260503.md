# Agent Pipeline v3 — Cross-Stage Architectural Decisions

**Status:** DECISIONS doc (not an implementation plan).
**Date:** 2026-05-03
**Owner:** Kyle (PM); Claude (engineering)
**Scope:** Resolves the 8 cross-stage decisions from `gstack/design/agent-pipeline-production-migration-skeleton-20260503.md` § "Brainstorm 1". These decisions are inputs to Brainstorm 2 (PD + FS migration) and Brainstorm 3 (frontend UX).

**Out of scope:** Stage-specific orchestration (waves, debate sequence), per-agent prompts, UI/UX design, cost estimates per stage. Those are Brainstorm 2 / Brainstorm 3.

---

## Evidence gathered before deciding

Concrete numbers from local report archives (`.thes1s/reports/`):

| Artifact | Sample sizes | Inngest event ceiling |
|---|---|---|
| DataPacket | INTU 257 KB · NOW 232 KB · LULU 203 KB | 512 KB (paid plan) — fits, but no headroom for growth |
| Filing content | INTU 2.8 MB across 5×10-K + 4×10-Q (avg ~270 KB/filing as JSON) | hard fail |

Existing infrastructure relevant to these decisions:

- R2 bucket `thes1s-transcripts` already caches filing markdown under `filings-md/{accession}.md` (filings are immutable, so this cache is hit-rate–maxed).
- `agents-v2/` already has `-pitchdeck` and `-fullstory` split for the multi-role agents (risk-analyst, synthesis-writer, financial-analyst, business-analyst, etc.). PD-vs-FS disambiguation is **already done at the file-tree level**. The remaining role ambiguity lives entirely *inside* Full Story.
- `v3_runs` and `v3_run_agents` D1 tables exist with full streaming columns (`phase`, `phase_label`, `heartbeat_at`, `tokens_*`, `cost_usd`, `failed_sections`).
- `agents-service/src/lib/anthropic-client.ts` and `worker-progress.ts` are pipeline-agnostic and reused as-is.

---

## Decision 1 — DataPacket flow

**Choice: Option C — Worker assembles into R2; Fly fetches by runId.**

The Worker calls `assembleDataPacket(ticker, env)` (existing module, no port required) before firing the Inngest event. Result is written to R2 at `assembly/{runId}/datapacket.json`. The Inngest event payload carries only `{ runId, ticker, userId, reportId }` (see Decision 5). Each PD/FS Inngest function fetches the DataPacket from R2 as its first step.

### Rejected alternatives

- **Option A — Send DataPacket as Inngest event payload.** Sample sizes (200–260 KB) fit under the 512 KB ceiling today, but with zero headroom. Adding a single rich field (e.g., expanded peer financials, more 13F history) breaks the pipeline silently. Hard no.
- **Option B — Port engines to TypeScript and assemble inside Fly.** Multi-week porting effort across ~58 engine modules with ongoing engine churn (XBRL taxonomy work is active). Doubles maintenance burden. Hard no.

### Implementation implications for PD/FS

- New `api/src/assembly/r2-cache.js` helper (or inline in pipeline-v3.js) writes DataPacket to R2 at `assembly/{runId}/datapacket.json` before `inngest.send(...)`. Must complete before the event fires, or the Fly side has nothing to fetch.
- Each PD/FS Inngest function gets a first step `step.run('fetch-datapacket', ...)` that reads from R2. If missing → `NonRetriableError` (callback marks run failed, Worker is the source of truth).
- TTL/cleanup: add to existing weekly cleanup cron — `DELETE assembly/{runId}/*` for runs > 30 days old. Storage cost is negligible (~250 KB per run × hundreds of runs/month = pennies).
- Worker → R2 write happens BEFORE the event send. R2 is strongly consistent for reads-after-writes within the same region; Fly reads directly from R2 with no race risk.
- The Worker's existing fetch interceptor (`assembleDataPacket.js`) is unchanged. It still rewrites self-referencing proxy URLs to direct SEC/EDGAR.

### Open questions for Brainstorm 2

- Does PD or FS need a slightly different DataPacket shape (e.g., FS already has the completed Pitch Deck — does it need DataPacket at all)? Both stages should fetch the same DataPacket; FS additionally fetches the prior PD report. Confirm in Brainstorm 2.

---

## Decision 2 — Filing content flow

**Choice: Option C — Worker assembles into R2; Fly fetches by runId. Reuse the existing `filings-md/` per-accession cache; v3 only adds the per-run aggregate file.**

The Worker calls `assembleFilingContent(ticker, dataPacket, env)` (existing module). Underneath, it already hits R2's `filings-md/{accession}.md` cache for individual filings. v3 adds an aggregate write: `assembly/{runId}/filings.json` containing the assembled `{ filingContent, transcriptContent, errors, stats }` blob.

### Rejected alternatives

- **Option A — Inngest event payload.** 3 MB per ticker is ~6× the event ceiling. Mechanically impossible.
- **Option B — Port to Fly.** All the same reasons as Decision 1, plus filing assembly already has Worker-specific shims (`shims/domino-polyfill.js`, the cheerio iXBRL cleanup, the 25-second CPU budget). Re-implementing that on Fly is wasted work.

### Implementation implications for PD/FS

- The Worker invokes `assembleFilingContent` after `assembleDataPacket` in the same pre-dispatch step. Both writes complete before the Inngest event fires.
- The aggregate JSON `assembly/{runId}/filings.json` carries `{ filingContent, transcriptContent, errors, stats }` — exactly the shape `assembleFilingContent` returns today.
- Per-accession cache (`filings-md/{accession}.md`) is unchanged. R2 cache hits between runs of different tickers and across different users for the same filing. Don't break this.
- Fly's first step (after fetching DataPacket) is `step.run('fetch-filing-content', ...)`. PSR agents (Annual Reader, Quarterly Reader) consume it; downstream agents do not need it directly.
- The Worker's 30s CPU limit is the bottleneck for assembly. Filing assembly already has a 25-second CPU budget guard with graceful partial-completion. That stays. Whatever fraction of filings comes back is what Fly receives.

### Open questions for Brainstorm 2

- Does the Worker hit the 25s CPU budget often enough to warrant moving `assembleFilingContent` to a Cloudflare Durable Object or a separate Worker call? Out of scope here. Surface as a TODO if production data shows >5% of runs hitting the budget.
- Cache strategy for filings already pre-warmed by other tickers: the existing `filings-md/{accession}.md` model already gives this for free. No change.

---

## Decision 3 — Multi-role agent disambiguation (TODOS item 1)

**Choice: 1A — Split into separate agent prompts. Apply both to PD/FS split (already done) AND to the remaining FS-internal role overlap.**

PD/FS split is already complete in `agents-v2/`. The remaining FS-internal multi-roles get their own prompts:

- `agents-v2/synthesis-writer-fullstory/` is split into:
  - `synthesis-writer-fullstory-bull/` (Phase 2 Step 1 — Bull thesis, no web search)
  - `synthesis-writer-fullstory-rebuttal/` (Phase 2 Step 3 — Rebuttal, web search ON per EXP-003)
  - `synthesis-writer-fullstory-compose/` (Phase 2 Compose — final S6 narrative, no web search)
- `agents-v2/risk-analyst-fullstory/` is split into:
  - `risk-analyst-fullstory-event/` (Phase 1 Section 1 — Event Analysis, web search ON)
  - `risk-analyst-fullstory-bear/` (Phase 2 Step 2 — Bear inversions, web search ON)

Net new prompt files: **5**. Net new managed-agent.yaml files: **5** (kept for audit-trail parity with v1 even though Managed Agents is not the runtime in v3).

### Rejected alternatives

- **Option 1B — Single shared prompt with `role` parameter.** Forces every prompt to carry a top-level decision tree, three role-specific subsections, and three output schemas. The runner has to dispatch on role and select the correct schema at runtime. Langfuse traces would all collapse into one trace name (`synthesis-writer-fullstory`) regardless of which role ran. We lose per-role metrics.

### Implementation implications for PD/FS

- **One prompt = one runner = one Zod output schema = one Inngest step.** This rule applies uniformly across all v3 stages. Brainstorm 2's file inventory is therefore mechanical.
- Total v3 specialist runner count under this decision:
  - **One Pager:** 1 runner (already exists).
  - **Pitch Deck:** 10 runners (one per agent in `agents-v2/*-pitchdeck/` and `annual-reader/`, `quarterly-reader/`).
  - **Full Story:** 5 Phase-1 runners + 5 Phase-2 runners (bull, bear, rebuttal, judge, compose) = 10 runners. PSR is inherited from PD output (no re-run).
  - **Total:** 21 runners. Each maps to exactly one prompt directory in `agents-v2/`.
- Langfuse `traceName` per call site: `pitchdeck.{agent-id}` / `fullstory.phase-1.{agent-id}` / `fullstory.phase-2.{step-id}`. Per-role metrics are clean.
- Each split prompt inherits the shared body of its parent prompt (via copy, not a runtime include — keep prompts self-contained for portability and Langfuse fidelity). The split-specific section sits at the top: "You are performing role X. Your inputs are A, B, C. Your output schema is D."

### Open questions for Brainstorm 2

- Output schemas for the 5 FS Phase-2 split prompts: Bull / Rebuttal / Compose / Bear / Judge each have distinct shapes today (see `src/schemas/debateStep.js`). Brainstorm 2 confirms one Zod schema per split prompt.
- Prompt copy maintenance: when shared content changes (e.g., a new Rule One framing line), it must be propagated across all sibling prompts. Acceptable — these prompts move slowly, and Langfuse trace fidelity is the higher-order win. Brainstorm 2 / impl plan must call out a single place to keep the canonical Rule One philosophy block (e.g., `agents-v2/_shared/rule-one-philosophy.md`) referenced as guidance, not auto-included at build time.

---

## Decision 4 — Cross-cutting findings (TODOS item 4)

**Choice: Pure CPU merge inside the Inngest function. Defer Haiku-based semantic dedup as a follow-up if telemetry shows it's needed.**

After each PD wave completes, the Inngest function runs a `step.run('aggregate-findings-wave-N', ...)` that:

1. Pulls `crossCuttingFindings: CrossCuttingFinding[]` from each agent output in the wave.
2. Merges into a single array.
3. Dedupes by `hash(source + finding-text-normalized)` (text is lowercased, whitespace-collapsed).
4. Sorts by `severity` (high → medium → low) then by `source` (alphabetical).
5. Stores cumulatively in step state — wave N's aggregation includes findings from waves 0..N-1.
6. Passes the cumulative array as a dedicated input field `crossCuttingFindings` to every next-wave agent's `userMessage`.

### Zod schema for `CrossCuttingFinding`

**Schema correction (2026-05-03):** Use the EXISTING `CrossCuttingFindingSchema` from `src/schemas/reportSection.js` — the agents already emit this shape and the v1 reports renderer already understands it. The over-specified draft `FindingSchema` originally proposed in this brainstorm (with `sourceAgent` enum, 4-level severity including `critical`, `category` enum, `text` with min/max length, `affectedSections`, `citations`) is REJECTED in favor of the existing 4-field schema. Fewer migration foot-guns; consistent with the reports already in production.

```ts
// Lives in src/schemas/reportSection.js (frontend canonical), ported to
// agents-service/src/agents/schemas/report-section.ts in Brainstorm 2 plan Task 8.
export const CrossCuttingFindingSchema = z.object({
  finding: z.string(),
  relevantAgents: z.array(z.string()),
  severity: z.enum(['high', 'medium', 'low']),  // 3-level (no 'critical')
  source: z.string(),                           // free-form (typically the source agent's id)
});
```

Every PD specialist's output schema already has `crossCuttingFindings: CrossCuttingFindingSchema.array().default([])` via the existing `ReportSectionSchema` — no schema change required at the agent boundary.

### Rejected alternatives

- **Haiku micro-call between waves.** ~$0.005/wave + ~3s latency. Buys semantic dedup ("high debt load" + "leveraged growth" → one finding). YAGNI today. Captured as TODO with trigger: Langfuse data shows >2 redundant findings per wave on average across 30+ runs.

### Implementation implications for PD/FS

- The aggregation step is a CPU-only Inngest step (no Anthropic call) → free, deterministic, idempotent across replays.
- Wave 1 specialists receive `crossCuttingFindings: []` (or only Wave 0 PSR findings if PSR agents emit them — check Brainstorm 2).
- Wave 4 (Synthesis) receives the full cumulative array as its input.
- For FS, the debate is sequential and the analog is "each step receives prior steps' outputs," which is already the model. FS does not need a separate findings aggregator — findings inside FS section outputs (S1–S5) flow naturally as Bull / Bear inputs.
- Logging: every aggregation step writes a Langfuse trace event tagged `cross-cutting-findings` with `count`, `wave`, `severityHistogram`. This gives the data needed to evaluate the Haiku-dedup trigger later.

### Open questions for Brainstorm 2

- Should PSR agents (Annual Reader, Quarterly Reader) also emit findings, or are they "raw extraction" agents whose findings come from downstream specialists? Recommend yes — PSR is precisely where "the 10-K mentions a $4B debt covenant trigger" lives. Brainstorm 2 confirms.
- Where in each agent's user prompt does the `crossCuttingFindings` array sit? Recommend a clearly-labeled section near the top: `## Cross-Cutting Findings From Prior Waves`. Brainstorm 2 locks the prompt template.

---

## Decision 5 — Inngest event schema for stage triggers

**Choice: `{ runId, ticker, userId, reportId }`. PD and FS both carry `reportId` because the Worker mints a `reports` row at dispatch time (paired with Decision 8).**

```ts
// thes1s/onepager.start (existing — add reportId)
{ runId: string, ticker: string, userId: string, reportId: string }

// thes1s/pitchdeck.start
{ runId: string, ticker: string, userId: string, reportId: string }

// thes1s/fullstory.start
{ runId: string, ticker: string, userId: string, reportId: string, parentReportId: string }
//                                                                  ^ the PD report this FS is built from
```

### Rejected alternatives

- **Bare `{ runId, ticker, userId }` for PD/FS.** Works for One Pager (no upstream dependency, no list-page navigation requirement during a run). Doesn't work for PD/FS once Decision 8 says the `reports` row is minted at dispatch time and v3 callbacks need to update it.
- **Embed full DataPacket / filing content in the event.** Already rejected in Decisions 1 + 2.

### Implementation implications for PD/FS

- Worker pre-dispatch sequence (PD/FS):
  1. `INSERT INTO reports (id, user_id, ticker, current_stage)` → `reportId`.
  2. `INSERT INTO v3_runs (id, user_id, ticker, pipeline_stage, status='running')` → `runId`.
  3. `UPDATE reports SET v3_run_id = ?` (links saved-report row to v3 run).
  4. `assembleDataPacket → R2`, `assembleFilingContent → R2`.
  5. `inngest.send({ runId, ticker, userId, reportId, parentReportId? })`.
  6. Return `{ runId, status: 'running' }` to client.
- One Pager event must add `reportId` (small migration to the existing route + runner).
- FS additionally requires `parentReportId` because the FS Inngest function fetches the completed PD output to inherit. Worker validates that the parent PD report exists and belongs to the same user before dispatch.

### Open questions for Brainstorm 2

- FS dispatch validation: does the user invoke FS by passing the parent reportId? (Likely yes — the report list page surfaces "generate Full Story" only on completed PD reports.) Brainstorm 3 will confirm the click path.

---

## Decision 6 — Filesystem-based section passing (TODOS item 3)

**Choice: Rewrite affected prompt sections during migration. No shim layer.**

The PD/FS coordinator prompts (`agents-v2/coordinator-pitchdeck/prompt.md`, `agents-v2/coordinator-fullstory/prompt.md`) are no longer used in v3 — orchestration moves entirely into the Inngest function. The coordinator prompt files stay in the repo for historical reference but are not loaded by any v3 runner.

Each specialist prompt loses its `/workspace/datapacket.json` / `/workspace/sections/section-3.json` references. Replace with:

> Your input is provided directly in this message. You will receive: a DataPacket, [filing content if applicable], [prior section outputs if applicable], and a list of cross-cutting findings from prior waves. Use these inputs to produce your output. Do not attempt to read from any filesystem.

### Rejected alternatives

- **Thin shim that pretends the filesystem still exists.** The Anthropic SDK has no filesystem tool exposed in v3 (no `read_file` / `write_file` server tool wired up) — the shim would have to fake it inside the runner, which means parsing the agent's tool-call attempts and intercepting them. That's coordinator orchestration, which is exactly the thing v1 failed at. Hard no.

### Implementation implications for PD/FS

- The single source of truth for each specialist's input is its `userMessage` constructed by the runner. Runners explicitly assemble the message from step state.
- Audit pass during impl: every prompt file in `agents-v2/*-pitchdeck/` and `agents-v2/*-fullstory/` gets a search-and-replace pass to remove `/workspace/...` references and replace with input-as-message language. Estimate: ~20 prompts × ~5–10 references each.
- Coordinator prompts (`coordinator-pitchdeck/prompt.md`, `coordinator-fullstory/prompt.md`) are marked DEPRECATED at the top with a pointer to the Inngest function file that replaced them. Files stay for ~30 days post-cutover, then deleted.

### Open questions for Brainstorm 2

- Some prompts have detailed examples that reference filesystem paths inside example dialogue. Those need rewriting too — flagged as part of the audit pass.

---

## Decision 7 — Web search timeout / empty fallback (TODOS item 5)

**Choice: Standardized prompt boilerplate appended to every web-search-using agent's system prompt. Framework-level timeout/cap is already handled by the wrapper.**

Boilerplate paragraph:

> ## Web Search Fallback
>
> Web search may fail, time out, or return no usable results. If this happens:
> 1. Proceed using only the DataPacket and filing content provided in your input.
> 2. Lower confidence to LOW for any claim that would normally rely on external research.
> 3. Add a red flag in your output noting "web search unavailable" so the portfolio manager knows the section was produced without live evidence.
> 4. Never fabricate web evidence to fill the gap. Acknowledge the gap and reduce conviction accordingly.

This block is appended verbatim to the system prompts of all six web-search-using v3 agents:

- `one-pager` (already live)
- `business-analyst-pitchdeck`
- `financial-analyst-pitchdeck` (web search ON for analyst estimates)
- `management-evaluator-pitchdeck`
- `risk-analyst-pitchdeck` (PEST risks)
- `valuation-specialist-pitchdeck`
- `risk-analyst-fullstory-event` (Event Analysis)
- `risk-analyst-fullstory-bear` (Bear inversions)
- `synthesis-writer-fullstory-rebuttal` (Rebuttal, web search ON per EXP-003)

(Not appended to PSR agents, Judge, Compose, or Bull — they have web search OFF.)

Framework-level coverage already in place via `anthropic-client.ts`:

- `maxWebSearches` per-agent cap (e.g., 8 for One Pager, 5 for most specialists, 0 for Judge/Compose/Bull/PSR).
- `costCeilingUsd` per-agent dollar cap forces emit if breached.
- `maxResearchTurns` bounds the research loop.
- Per-agent budget tuning belongs to Brainstorm 2's per-agent config, not here.

### Rejected alternatives

- **Hard timeout per search.** The Anthropic SDK's `web_search_20250305` tool doesn't expose a per-search timeout knob today — `max_uses` is the only lever. Captured as a TODO if Langfuse shows search hangs (none observed yet in production One Pager runs).
- **Sufficiency gate (Pattern 8 / TODO C).** A separate Haiku verification call between Phase A and Phase B. Already deferred in `TODOS.md` under "v3 follow-ups" — trigger is >5% lazy-emit rate. Don't pre-empt.

### Implementation implications for PD/FS

- One sweep across all 9 web-search-using v3 prompts during the impl plan. ~30 minutes of prompt-editing work.
- Output schemas already have `redFlags: string[]` — fallback red flag goes there. No schema change.
- Validation: a smoke test (with web search artificially disabled / returning empty) confirms each affected agent produces a low-confidence section with the red flag, rather than crashing or fabricating.

### Open questions for Brainstorm 2

- The `confidence` field on each agent's output schema is already present (`HIGH | MEDIUM | LOW`). Confirm in impl plan that "lower confidence to LOW" flows through to the section-level confidence field, not just an inline note.

---

## Decision 8 — Persistence into existing data model

**Choice: Option B (v3-native). v3 callback writes ONLY to `v3_runs.result_json`. The `reports` table gains a new `v3_run_id` column to link saved-reports to v3 runs. Brainstorm 3 designs the renderer from scratch around v3 data shape. Backward compat for legacy v1 reports is via a thin shape adapter inside the new hook, not a duplicate renderer.**

### Rationale

The original argument for Option A (write to `report_stages` to preserve the existing renderer) only holds if the existing renderer is being preserved. Brainstorm 3 will redesign the live-running UX **and** the completed-report renderer — the existing components are dull and the live-pipeline rendering barely works. With the existing renderers being replaced anyway, Option A's preservation benefit evaporates. Option B's end state is cleaner: the renderer reads directly from v3-native data with no v1-shape impedance mismatch.

### Rejected alternatives

- **Option A — v3 callback writes to BOTH `v3_runs.result_json` and `report_stages.data`.** Was the recommended choice when the renderers were being preserved. Once Brainstorm 3 commits to a redesigned renderer, A becomes "duplicate write into a legacy table that no current code path reads from" — pure overhead.
- **Option B-without-link-column — v3 doesn't write to `reports` at all.** The saved-reports list page reads from the `reports` table; if v3 doesn't mint a `reports` row, v3 reports vanish from the user's list. Hard no.

### Implementation implications for PD/FS

Schema change (new migration):

```sql
ALTER TABLE reports ADD COLUMN v3_run_id TEXT REFERENCES v3_runs(id);
CREATE INDEX IF NOT EXISTS idx_reports_v3_run_id ON reports(v3_run_id);
```

Worker pre-dispatch (per Decision 5):

1. Mint a `reports` row.
2. Mint a `v3_runs` row.
3. Set `reports.v3_run_id = v3_runs.id`.

Worker callback handler (`/api/v3/pipeline/callback`):

- On `status='completed'`: update `v3_runs.result_json`, `v3_runs.finished_at`. Update `reports.current_stage` (1/2/3 depending on `pipeline_stage`) and `reports.updated_at`. **Do not write to `report_stages`.**
- On `status='completed_with_errors'`: same as completed, plus `v3_runs.failed_sections`.
- On `status='failed'`: update `v3_runs.error_message`, `v3_runs.finished_at`. Don't update `reports.current_stage`.

Frontend (Brainstorm 3 will design the components; this brainstorm fixes the data contract):

- Saved-reports list page reads from `reports` table (existing behavior, no change).
- Click-through routes by `reports.v3_run_id IS NULL`:
  - NULL → legacy v1 path (existing `OnePager.jsx` etc., reads `report_stages`). Used only for reports generated before v3 cutover.
  - non-NULL → v3 path (new components designed in Brainstorm 3, reads `v3_runs.result_json` via `/status/:runId` or a new `/api/v3/pipeline/report/:runId` endpoint).
- A small adapter inside the new hook (`useV3ReportData(runIdOrLegacyReportId)`) accepts either a v3 runId or a legacy reportId; for legacy reportId, it reads from `report_stages` and shape-adapts to v3 contract. This lets old reports render with the new components without a data migration. Estimate: ~20 lines.

Cutover sequencing:

- Old reports (`reports.v3_run_id IS NULL`) keep rendering via the legacy renderer until the legacy renderer is deleted.
- New reports flow through v3.
- ~30 days post-cutover (per skeleton's cutover checklist), legacy `OnePager.jsx` / `PitchDeck.jsx` / `FullStory.jsx` are deleted. Adapter takes over rendering legacy reports through the new components.

### Open questions for Brainstorm 3

- Final report data fetch endpoint: extend `/api/v3/pipeline/status/:runId` (already returns `result`) or add `/api/v3/pipeline/report/:runId` that returns just the result + minimal metadata? Latter is cleaner separation of concerns (status = polling; report = rendering). Brainstorm 3 will decide.
- Adapter shape for legacy reports: needs to handle the existing `report_stages.data` JSON for One Pager / Pitch Deck / Full Story respectively. Brainstorm 3 owns this adapter design alongside the renderer.
- The `failedSections`, `agents[]`, `costUsd`, `tokens` fields are v3-native and have no v1 equivalent. Legacy adapter returns empty arrays / nulls for these. Renderers must gracefully degrade when these are absent.

---

## Summary table

| # | Decision | Choice |
|---|---|---|
| 1 | DataPacket flow | C — Worker assembles, R2-keyed by runId, Fly fetches |
| 2 | Filing content flow | C — Worker assembles, R2-keyed by runId, Fly fetches; reuse existing `filings-md/` cache |
| 3 | Multi-role agent disambiguation | 1A — Split prompts further. PD/FS already split; FS-internal split adds 5 prompts (synthesis-writer × 3, risk-analyst × 2) |
| 4 | Cross-cutting findings | Pure CPU merge in Inngest function. Reuses existing `CrossCuttingFindingSchema` (`finding/relevantAgents/severity/source`, severity 3-level — `high/medium/low`). Haiku-dedup deferred behind telemetry trigger |
| 5 | Inngest event schema | `{ runId, ticker, userId, reportId }`; FS adds `parentReportId` |
| 6 | Filesystem section passing | Rewrite prompts. No shim. Coordinator prompts deprecated; orchestration moves to Inngest function |
| 7 | Web search empty fallback | Standardized boilerplate appended to all 9 web-search-using v3 agent prompts. Framework caps stay |
| 8 | Persistence into existing data model | B — v3 writes only to `v3_runs.result_json`. New `reports.v3_run_id` column. Brainstorm 3 designs renderer with v3 shape; legacy reports rendered via thin adapter |

## Cross-decision invariants for Brainstorm 2

These hold across PD and FS regardless of stage-specific orchestration:

1. **One prompt = one runner = one Zod output schema = one Inngest step.** No multi-role at the prompt or runner level.
2. **Inngest event payloads carry only IDs.** Heavy data lives in R2 keyed by runId.
3. **Findings flow as a typed array, not free-form text.** Aggregated CPU-side after each PD wave; baked into FS via the natural sequential flow.
4. **Web-search-using agents always have the fallback boilerplate.** Framework caps + prompt fallback = full coverage.
5. **The Worker is the source of truth for `v3_runs` and `reports` row state.** Fly never inserts; it only triggers updates via the callback + progress endpoints.
6. **No filesystem tool. Inputs assembled into `userMessage` by the runner.**

---

## Out-of-scope (deferred)

These came up during the brainstorm but belong to other docs:

- **Per-stage cost ceilings** (`costCeilingUsd` values per agent) → Brainstorm 2 / impl plan. No ceiling decided here.
- **PD wave failure-tolerance policy** (Wave 0 abort vs degrade, Wave 4 partial synthesis) → Brainstorm 2 (skeleton § PD partial success policy).
- **FS debate cascade fallback** (retry Bear once, ship Bull-as-thesis on second failure, etc.) → Brainstorm 2 (skeleton § FS debate cascade).
- **Renderer visual design** → Brainstorm 3.
- **`/api/v3/pipeline/report/:runId` endpoint shape** → Brainstorm 3.
- **Adapter for legacy `report_stages` → v3-shape rendering** → Brainstorm 3.
- **Token-streamed typewriter UX, Inngest Realtime, Langfuse reliability dashboards** → already captured in `TODOS.md` § "v3 pipeline follow-ups", deferred behind triggers.

---

## References

- Skeleton: `gstack/design/agent-pipeline-production-migration-skeleton-20260503.md`
- Existing One Pager migration plan: `gstack/plans/agent-pipeline-migration-onepager-eng-plan-20260502.md`
- Streaming + web search plan: `gstack/plans/agent-pipeline-streaming-and-websearch-eng-plan-20260502.md`
- Open TODOS: `TODOS.md` items 1–5 (cleanup; addressed by Decisions 3, 4, 6, 7) and items A–F (deferred follow-ups)
- Project context: `CLAUDE.md` § "v3 Pipeline" and § "Agent Pipeline (Managed Agents v2)"
