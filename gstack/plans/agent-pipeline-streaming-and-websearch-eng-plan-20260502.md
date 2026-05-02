# v3 Pipeline — Web Search Re-Enablement + Streaming Progress

**Status:** Design spec (not yet an implementation plan).
**Date:** 2026-05-02
**Author:** Claude (with Kyle in the loop)
**Owns:** `agents-service/src/lib/anthropic-client.ts`, `agents-service/src/agents/*.ts`, `api/src/routes/pipeline-v3.js`, `api/schema.sql` (new tables), `src/hooks/useGeneratePipeline.js` (small change), and the v3 status response shape.
**Does not own:** Pitch Deck or Full Story orchestration design (separate plans), v1 deprecation, frontend UI design.

---

## 1. Problem statement

Two limitations are blocking v3 from being shippable to real users today, and both will scale across all 3 stages once Pitch Deck and Full Story are migrated:

**Problem 1 — Web search disabled.** The wrapper at `agents-service/src/lib/anthropic-client.ts` uses `tool_choice: { type: 'tool', name: 'emit_output' }` to force structured Zod-validated JSON output. This is the right choice for guaranteeing schema compliance, but it forces the model to emit `emit_output` on its first turn — which means `web_search_20250305` can never run. The One Pager currently generates from training data only. Quality is below acceptable.

**Problem 2 — Silent UI during generation.** v3's frontend has no progress signal beyond a `running`/`completed`/`failed` status string from D1. One Pager runs in ~90 seconds; Pitch Deck (10 specialists in 5 waves) will run ~10 minutes; Full Story (7-agent debate) ~10+ minutes. Users will believe the app is hung.

This spec resolves both with the smallest change set that works. **The pipeline shape does not change** — agents stay autonomous, web search stays per-agent. The wrapper changes; D1 grows two new tables; the Worker grows one new endpoint; the frontend renders richer fields from polling.

---

## 2. Decisions taken (during brainstorm)

| Decision | Choice | Rejected alternatives |
|---|---|---|
| **Web search architecture** | Per-agent web search (each agent runs its own searches) | Shared research dossier (would require pipeline change — explicitly ruled out) |
| **Wrapper pattern** | Pattern 1: auto-loop → forced fallback (Anthropic Cookbook canonical) | Pattern 2 (two-stage), Pattern 3 (native structured outputs — same web_search incompatibility), Pattern 5 (auto + retry-on-fail — 10–15% failure rate) |
| **Streaming transport** | Path A: polling D1 every 3s, agents-service writes per-agent state via Worker callback | Path B (Inngest Realtime + SSE) — deferred to TODOS as forward-compatible upgrade |
| **Streaming granularity** | Per-agent state + phase label + heartbeat. 3s lag is acceptable for all 3 stages. | Token streaming (deferred to Path B), Inngest step events (Path B) |
| **Native structured outputs migration** | Defer | Doing both at once — extra scope without unblocking anything |
| **Sufficiency gate (Pattern 8)** | Defer | Useful for Pitch Deck, premature for One Pager — wait for Langfuse data |
| **Extended thinking on analytical agents** | Defer (capability unblocked by wrapper change; turning it on is separate config sprint) | Bundling into this plan |
| **Long-term reliability target** | >99% per-agent success rate across all stages; Langfuse is the diagnostic spine | Acceptance of partial-success as steady state |

---

## 3. Architecture changes

### 3.1 Anthropic wrapper — Pattern 1 (auto-loop → forced fallback)

**File:** `agents-service/src/lib/anthropic-client.ts`

Replace the single forced `messages.create` call with a small loop. ~80 lines of TypeScript. Public API of `callAgentWithStructuredOutput` stays the same — callers (the 3 stage runners) do not change.

**Phase A — research loop:**
- Tools: `[web_search, emit_output]` (web_search optional per caller).
- `tool_choice: { type: 'auto' }`.
- For up to `maxResearchTurns` (default 8 for One Pager, 5 for PD specialist, 6 for FS bull/bear, 3 for FS judge):
  - Call `messages.create` with the conversation so far.
  - Append assistant content to `messages`.
  - If a `tool_use` block named `emit_output` is in the response → parse with Zod and return.
  - If `stop_reason === 'tool_use'` → server tools handle their own tool_result injection; loop.
  - If `stop_reason === 'pause_turn'` → loop (server-side iteration cap fired; conversation is recoverable).
  - If `stop_reason === 'end_turn'` → break to Phase B.

**Phase B — forced synthesis (only if Phase A didn't already emit):**
- Tools: `[emit_output]` only.
- `tool_choice: { type: 'tool', name: 'emit_output' }`.
- Conversation history from Phase A is preserved.
- One additional user message: "Synthesize the research above into the required JSON. Do not perform additional research."
- Parse with Zod; throw on failure (which Section 3.4 then handles with reflect-and-retry).

**Guardrails inside the loop:**
- `maxResearchTurns` — caller-configurable; defaults above.
- `maxTotalTokens = 200_000` per agent — safety net against runaway loops.
- `pause_turn` handling — required.

**System prompt nudge** added to every agent prompt (pure prompt content; fully production-portable):
> Before emitting your structured output, you should perform at least 2–3 web searches to ground your analysis in current information. Do not emit the output tool until you have completed your research.

**Search caps (`web_search.max_uses` and `maxResearchTurns`):**

`maxResearchTurns` and `web_search.max_uses` are **caller-configurable parameters** on the wrapper, not hardcoded. The Pitch Deck and Full Story migration plans set their own values when they wire up their agent runners. This plan sets defaults only for the One Pager:

| Caller | max_uses | maxResearchTurns |
|---|---|---|
| One Pager | 8 | 8 |

**What the wrapper change unlocks for free** (capability only — actually enabling is a separate sprint):
- Extended thinking (forced `tool_choice` was incompatible; `tool_choice: 'auto'` is not).
- Future native structured outputs migration (if we want it for Phase B specifically).

### 3.2 D1 schema additions

**File:** `api/schema.sql`

```sql
-- Per-agent state (1 row per agent per run)
CREATE TABLE v3_run_agents (
  run_id        TEXT NOT NULL,
  agent_id      TEXT NOT NULL,    -- 'one-pager' | 'business-analyst' | 'risk-analyst' | ...
  display_name  TEXT NOT NULL,
  wave          INTEGER,           -- 0..4 for Pitch Deck, NULL for One Pager and Full Story
  status        TEXT NOT NULL,     -- 'pending' | 'running' | 'completed' | 'failed'
  started_at    TEXT,
  finished_at   TEXT,
  subprogress   TEXT,              -- JSON: { current, total, label }
  last_message  TEXT,
  tokens_input  INTEGER NOT NULL DEFAULT 0,
  tokens_output INTEGER NOT NULL DEFAULT 0,
  cached_tokens INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  PRIMARY KEY (run_id, agent_id)
);
CREATE INDEX idx_v3_run_agents_run ON v3_run_agents(run_id);

-- Run-level phase + heartbeat + cumulative cost
ALTER TABLE v3_runs ADD COLUMN phase TEXT;             -- 'researching' | 'wave-2' | 'judge' | etc.
ALTER TABLE v3_runs ADD COLUMN phase_label TEXT;       -- Human-readable
ALTER TABLE v3_runs ADD COLUMN heartbeat_at TEXT;      -- Bumped every ~8s by the wrapper
ALTER TABLE v3_runs ADD COLUMN tokens_input INTEGER NOT NULL DEFAULT 0;
ALTER TABLE v3_runs ADD COLUMN tokens_output INTEGER NOT NULL DEFAULT 0;
ALTER TABLE v3_runs ADD COLUMN cost_usd REAL NOT NULL DEFAULT 0;

-- Partial-success surface (Section 3.4)
ALTER TABLE v3_runs ADD COLUMN failed_sections TEXT;   -- JSON: [{ agentId, error }]

-- New status: 'completed_with_errors' allowed in addition to existing values
```

**Application-layer validation update required:** D1's status column has no CHECK constraint, so the schema accepts the new value automatically. But the Worker callback handler validates incoming status values inline. Update `api/src/routes/pipeline-v3.js` line 109 to add `'completed_with_errors'` to the allowed list:

```js
// Before:
if (!runId || !['completed', 'failed'].includes(status)) { ... }
// After:
if (!runId || !['completed', 'completed_with_errors', 'failed'].includes(status)) { ... }
```

Without this change, the callback will reject Inngest's partial-success notifications with a 400.

### 3.3 Worker `/progress` endpoint

**File:** `api/src/routes/pipeline-v3.js`

New route: `POST /api/v3/pipeline/progress`. Auth: shared-secret header `X-Callback-Secret` (same `V3_CALLBACK_SECRET` used by the existing `/callback` endpoint). Body:

```typescript
{
  runId: string;
  kind: 'agent-update' | 'phase-update' | 'heartbeat' | 'tokens';
  payload: {
    // For 'agent-update':
    agentId?: string;
    displayName?: string;
    wave?: number;
    status?: 'pending' | 'running' | 'completed' | 'failed';
    startedAt?: string;
    finishedAt?: string;
    subprogress?: { current: number; total: number; label: string };
    lastMessage?: string;
    tokensInput?: number;
    tokensOutput?: number;
    cachedTokens?: number;
    errorMessage?: string;

    // For 'phase-update':
    phase?: string;
    phaseLabel?: string;

    // For 'heartbeat':
    // (no payload fields required)

    // For 'tokens' (run-level cumulative):
    tokensInput?: number;
    tokensOutput?: number;
    costUsd?: number;
  };
}
```

Handler is **idempotent**:
- `heartbeat` → bump `v3_runs.heartbeat_at` to NOW.
- `phase-update` → conditional UPDATE only when status not yet terminal.
- `agent-update` → UPSERT on `(run_id, agent_id)`; when transitioning to `completed`/`failed`, write `finished_at`.
- `tokens` → conditional UPDATE only when status not yet terminal.

Returns 200 even on duplicate writes (Inngest must see success or it'll retry). Returns 401 on bad secret. Returns 400 on malformed body.

### 3.4 Robustness additions (the 8 items from brainstorm Section 3)

| # | Item | Where it lives |
|---|---|---|
| 1 | `pause_turn` handling | Inside the wrapper loop (Section 3.1) |
| 2 | Schema reflect-and-retry, max 3 attempts → NonRetriableError | Inside the wrapper Phase B path |
| 3 | Conditional UPDATE on Worker callback + progress endpoint | `api/src/routes/pipeline-v3.js` |
| 4 | `runId` as global correlation key in every log line | Cross-cutting: wrapper, agent runners, Inngest functions, Worker routes |
| 5 | Per-agent token budget circuit breaker (200K cap) | Inside the wrapper loop |
| 6 | Per-run cost ceiling ($2 for One Pager; PD/FS ceilings TBD in their respective migration plans) | Wrapper tracks cumulative cost in memory across turns (from `response.usage`) and aborts when the caller-passed ceiling is reached. The Worker `/progress` endpoint independently persists cumulative cost to D1 for UI display. |
| 7 | Partial success infrastructure — `failed_sections` JSON column + `completed_with_errors` status enum value + Inngest `onFailure` handler writes partial state instead of just `failed` | D1 schema (Section 3.2) + Worker `/callback` handler |
| 8 | Replay-trace test fixtures from production failures | `agents-service/tests/fixtures/`, populated as failures happen |

This plan ships the **infrastructure** for partial success (the schema columns and the `onFailure` partial-state write). Stage-specific failure policies — e.g. which Pitch Deck waves are hard requirements vs degradable — belong in the Pitch Deck and Full Story migration plans where the wave/role topology lives.

### 3.5 Updated `/status/:runId` response

**File:** `api/src/routes/pipeline-v3.js`

Existing `GET /api/v3/pipeline/status/:runId` returns expanded JSON (additive — backwards compatible with the `result` field):

```typescript
{
  runId: string;
  ticker: string;
  pipelineStage: 'one-pager' | 'pitch-deck' | 'full-story';   // matches existing field name in pipeline-v3.js
  status: 'pending' | 'running' | 'completed' | 'completed_with_errors' | 'failed';

  phase: string | null;
  phaseLabel: string | null;

  agents: Array<{
    id: string;
    displayName: string;
    wave: number | null;
    status: 'pending' | 'running' | 'completed' | 'failed';
    startedAt: string | null;
    finishedAt: string | null;
    subprogress: { current: number; total: number; label: string } | null;
    lastMessage: string | null;
    tokens: { input: number; output: number; cached: number } | null;
    error: string | null;
  }>;

  heartbeatAt: string;
  startedAt: string;
  updatedAt: string;
  finishedAt: string | null;

  tokens: { input: number; output: number; cached: number };
  costUsd: number;

  result: object | null;                                  // existing report shape
  error: { message: string; agentId?: string } | null;
  failedSections: Array<{ agentId: string; error: string }> | null;
}
```

Implementation: SQL JOIN of `v3_runs` and `v3_run_agents`, ordered by `wave ASC, agent_id ASC`.

### 3.6 Frontend changes

**File:** `src/hooks/useGeneratePipeline.js`

Minimal: parse the new fields from the existing polling endpoint and expose them on the hook's return value. UI design that consumes them is a separate skill/plan.

```typescript
return {
  triggerGeneration,
  generating,
  generationError,
  result,
  progress,           // existing — keep
  liveSections,       // existing — keep (for v1 compat)

  // New
  phase,              // string | null
  phaseLabel,         // string | null
  agents,             // RunProgress['agents'] | []
  heartbeatAt,        // string
  tokens,             // { input, output, cached }
  costUsd,            // number
  failedSections,     // array | null
};
```

The existing `result` payload shape (sections array) is unchanged — the report renderer doesn't change.

---

## 4. What does NOT change

- `agents-service/src/agents/one-pager.ts` and the future `pitch-deck.ts` / `full-story.ts` runners — only minor edits to remove the "web search disabled" comment and pass through the new `maxResearchTurns` parameter to the wrapper.
- `agents-service/src/inngest/functions/one-pager.ts` and future Inngest functions — the 3-step structure (`run-agent → validate-output → post-callback`) stays. New: each step publishes `phase-update` and `agent-update` events to the Worker as it transitions.
- `api/src/routes/pipeline-v3.js` `/start` and `/callback` routes — unchanged.
- D1 `pipeline_runs` (v1 table) — untouched.
- The frontend report renderer.
- Anthropic prompt content (except the one-line research nudge added to every agent prompt).
- Inngest function timeouts (`'15m'` stays).
- All cron jobs.

---

## 5. Testing strategy

### 5.1 Unit tests (vitest, in `agents-service/tests/`)

- **Wrapper Pattern 1 happy path** — mock Anthropic to emit `emit_output` on turn 1, assert single API call, parsed output returned.
- **Wrapper Pattern 1 multi-turn** — mock 3 web_search turns followed by `emit_output`; assert all 4 calls happen and final output parses.
- **Wrapper Pattern 1 forced fallback** — mock model to end with `end_turn` text; assert Phase B fires with forced `tool_choice` and final emit succeeds.
- **`pause_turn` handling** — mock 1 turn returning `pause_turn`; assert loop continues without error.
- **Reflect-and-retry on Zod failure** — mock invalid JSON, then valid JSON on retry; assert success after 1 retry.
- **3-strikes Zod failure → NonRetriableError** — mock 3 invalid JSONs; assert NonRetriableError thrown.
- **maxResearchTurns cap** — mock model to keep calling web_search forever; assert forced final emit fires after cap.
- **maxTotalTokens cap** — mock model with high token usage; assert circuit breaker fires.
- **Per-run cost ceiling** — mock cost over $8 mid-PD-run; assert run aborted with "cost spike" error.

### 5.2 Integration tests (Worker + D1)

- **`/progress heartbeat`** — POST 5 heartbeats, assert `heartbeat_at` advances each time.
- **`/progress agent-update` upsert** — POST `{ agentId: 'risk-analyst', status: 'running' }`, then `{ agentId: 'risk-analyst', status: 'completed' }`, assert single row exists with final status.
- **Conditional UPDATE on terminal state** — set `v3_runs.status = 'completed'`, then POST `/progress` with `phase-update`; assert status not overwritten.
- **Status endpoint join** — seed `v3_runs` + 10 `v3_run_agents` rows, GET `/status/:runId`, assert response shape matches Section 3.5.

### 5.3 End-to-end smoke test

- Trigger an AAPL One Pager via the existing `/start` endpoint.
- Assert: web_search actually runs (Langfuse trace shows tool calls), `agents` array populates with `one-pager` row transitioning `pending → running → completed`, heartbeat advances, terminal status `completed` with valid `result`.

### 5.4 Replay-trace fixtures

- New directory: `agents-service/tests/fixtures/replay/`.
- Each fixture: `{ id, dataPacket, prompt, expectedShape }` JSON files captured from production failures.
- CI runs all fixtures through the wrapper on every PR. Initial seed: any 2–3 known-failure cases from existing One Pager runs (or empty if none yet — seed as failures emerge).

---

## 6. Effort estimate

| Workstream | Effort |
|---|---|
| Wrapper Pattern 1 + guardrails (Section 3.1) | ~1 day (Phase 1 unit-test scaffolding already exists; loop logic + cost-cap math + `pause_turn` is incremental) |
| D1 schema migration + Worker `/progress` endpoint (Sections 3.2, 3.3) | ~1 day |
| Robustness items 3, 4, 6, 7 (Section 3.4) | ~1.5 days (most are small additions to routes already in place) |
| Updated `/status/:runId` join + frontend hook fields (Sections 3.5, 3.6) | ~0.5 day (SQL JOIN + JSON shape extension) |
| Test suite (unit + integration + e2e smoke) (Section 5) | ~2 days |
| System prompt nudge to `agents-v2/one-pager/prompt.md` | ~5 min (PD/FS plans add the nudge to their own prompts as part of their migrations) |

**Total: ~6 days of focused work**, with ~1 day of buffer for surprises → 6–7 day plan.

Robustness items 1 (`pause_turn`), 2 (reflect-and-retry), 5 (per-agent token budget) live inside the wrapper change in Section 3.1 — included in that 1 day. Item 8 (replay fixtures) is a process, not a one-time task.

---

## 7. Cost & quality projections

### Per-run cost (One Pager only — this plan's scope)

| Stage | Pre-change | Post-change | Delta | Driver |
|---|---|---|---|---|
| One Pager | ~$0.05 (no search) | ~$0.40 | +$0.35 | 8 web searches at ~$0.04 fully loaded |

PD and FS post-change cost projections are owned by their respective migration plans. The wrapper from Section 3.1 is a foundation those plans build on; per-stage costs depend on model assignments and search caps set there.

### Quality lift

- One Pager moves from "training-data only" to "current + verifiable" — qualitative jump, not measurable until shipped.

### Reliability baseline

This plan does not target reliability metrics directly. Section 3.4 items establish the **observability foundation** for the long-term >99% target:
- `runId` correlation across Langfuse + Inngest + Worker + D1.
- `failed_sections` JSON gives per-agent failure-rate measurement by stage and ticker.
- Replay-trace fixtures close gaps systematically as failures emerge.

The reliability flywheel itself (dashboards, automated fixture ingestion) is future work — captured under Section 8.

---

## 8. Out of scope / deferred

The following were considered and deferred. All are captured in `TODOS.md` for future plans.

- **Path B streaming** (Inngest Realtime + Worker SSE relay + frontend hook with polling fallback). Forward-compatible — Path A's data model is exactly what Path B publishes over.
- **Native structured outputs migration** (`output_config.format` + `client.messages.parse()` + Zod helpers on Phase B). Strict cleanup; doesn't unblock anything.
- **Sufficiency gate** (Pattern 8 — Haiku verification call before Phase B). Wait for Langfuse data showing "lazy emit" is a real failure mode.
- **Extended thinking on Risk Analyst / Valuation Specialist.** Wrapper change unlocks the capability; turning it on is a per-agent prompt/config sprint.
- **Token-streamed typewriter UX** for the One Pager final output / Full Story judge. Bundles with Path B.
- **Langfuse reliability dashboards** — per-agent failure rate by failure mode (`schema_fail` / `refusal` / `429` / `pause_turn` / `context_overflow` / `web_search_error`). Trigger: 200+ production runs of real data.
- **Pitch Deck and Full Story migration to v3.** This plan is the foundation; the actual stage migrations are separate plans.

### Long-term goals (visible target, not work in this plan)

- **>99% per-agent success rate across all 3 stages.** The Section 3.4 items are the foundation. Future investment: dashboards, automated replay-fixture ingestion when production runs fail, schema evolution to reduce Zod-fail rate. See `memory/project_reliability_target.md`.

---

## 9. Open questions

These are deliberately surfaced for the implementation plan to resolve. Each has a default if no decision is made; the implementation plan should pick one explicitly per item.

1. **Frontend polling cadence.** v1 polls every 3s; the brainstorm ratified 3s as acceptable for v3 too. Should v3 stay at 3s, or change (e.g., 2s for faster perceived liveness)? *Default: keep 3s for parity with v1.*

2. **`/progress` endpoint authentication.** Reuse `V3_CALLBACK_SECRET` (currently used by `/callback`) for the new `/progress` endpoint, or mint a separate `V3_PROGRESS_SECRET` for defense-in-depth (compromise of one secret doesn't expose both surfaces)? *Default: reuse to minimize secret-rotation surface; revisit if defense-in-depth becomes a CSO finding.*

3. **Backfill of existing `v3_runs` rows.** Prior smoke tests left ~1 row in the table. New columns (`phase`, `phase_label`, `heartbeat_at`, `tokens_input`, `tokens_output`, `cost_usd`, `failed_sections`) will default to NULL/0 on existing rows. Backfill them with synthetic values, leave NULL, or delete the test rows? *Default: leave NULL — they're already in a terminal state; backfill is busywork.*

4. **`maxTotalTokens` scope.** Is the 200K cap (Section 3.4 item 5) a per-agent total **across all turns of the loop**, or per-API-call (`max_tokens`)? Wrapper math is easiest if it's the cumulative sum from `response.usage.input_tokens + output_tokens` over every turn; spec text is currently ambiguous. *Default: per-agent cumulative across the full Phase A + Phase B loop. Per-call `max_tokens` stays bounded by the existing 8K (or 16K for synthesis) parameter.*

---

## 10. References

- Research report: [`gstack/research/agent-harness-engineering-research-20260502.md`](../research/agent-harness-engineering-research-20260502.md) (and PDF). Foundation for every architectural choice in this spec.
- Migration plan that landed One Pager: [`gstack/plans/agent-pipeline-migration-onepager-eng-plan-20260502.md`](agent-pipeline-migration-onepager-eng-plan-20260502.md). This spec layers on top.
- Anthropic Cookbook: [`extracting_structured_json.ipynb`](https://github.com/anthropics/anthropic-cookbook/blob/main/tool_use/extracting_structured_json.ipynb), [`customer_support_agent.ipynb`](https://github.com/anthropics/anthropic-cookbook/blob/main/agents/customer_support_agent.ipynb).
- Anthropic docs: [tool use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/implement-tool-use), [handling stop reasons](https://platform.claude.com/docs/en/build-with-claude/handling-stop-reasons), [prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching).
- Inngest docs: [errors and retries](https://www.inngest.com/docs/features/inngest-functions/error-retries/inngest-errors), [idempotency](https://www.inngest.com/docs/guides/handling-idempotency).
