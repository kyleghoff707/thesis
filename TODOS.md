# Thes1s — TODOS

Open work items, separate from active migration tasks. Address these as their own focused task — they're prompt-level and configuration changes, not infrastructure.

---

## Agent team — pre-migration footgun cleanup

These five issues from the agents-v2 audit (May 1, 2026) are **prompt changes and possible agent reconfigures**. They will bite us in any framework (LangGraph, Inngest + raw SDK, Mastra, etc.), so cleaner to fix them at the prompt/config layer before the migration rather than after.

### 1. Multi-role agent ambiguity — **HIGH severity**

**Issue:** Three agents play multiple distinct roles across the pipeline, with different inputs, outputs, tools, and web-search settings per role. The coordinator has to dispatch the correct role and there's no enforcement.

| Agent | Roles |
|---|---|
| **Risk Analyst** | (a) Pitch Deck §9 PEST Risks (web search ON), (b) Full Story §1 Event Analysis (web search ON), (c) Full Story Bear in debate (web search ON, attacks bull thesis) |
| **Synthesis Writer** | (a) Pitch Deck §11 verdict (no web), (b) Full Story Bull (no web), (c) Full Story Rebuttal (web ON, rebuts bear), (d) Full Story Compose (no web, weaves debate) |
| **Financial Analyst** | (a) Pitch Deck §5/7/8 (analysis), (b) Full Story Judge (debate scoring, no web) |

**Risk:** Coordinator calls wrong role variant; agent receives ambiguous prompt; agent returns wrong output schema; role-specific tools not enabled correctly.

**Fix options:**
- **Option A (recommended):** Split into separate agent prompts with role baked in. e.g. `risk-analyst-pest`, `risk-analyst-event`, `risk-analyst-bear`. More prompts, zero ambiguity.
- **Option B:** Keep shared prompts but add explicit `role` parameter, with role-specific subsections in each prompt and a strict decision tree at the top. More complex prompts, possible confusion.

---

### 2. Debate cascade failure — **CRITICAL severity**

**Issue:** Full Story Phase 2 is a strictly sequential 4-step debate (Bull → Bear → Rebuttal → Judge) plus Compose. If any one step produces invalid JSON, times out, or fails, every downstream step has bad input and the whole Section 6 dies.

**Fix:**
- Schema-validate output after every debate step before passing to the next
- If a step fails twice (retry once with the validation error in prompt), gracefully fall back: skip remaining debate steps, use Bull thesis as the unrebutted thesis, mark Section 6 as "Debate incomplete: [step] failed"
- Test failure scenarios explicitly (unit tests injecting bad JSON at each step)
- Document the fallback path in `agents-v2/coordinator-fullstory/prompt.md`

---

### 3. Filesystem-based section passing — **HIGH severity**

**Issue:** Coordinator writes/reads sections via `/workspace/sections/`, `/workspace/debate/`. Risks: stale data between runs, race conditions if a wave starts before the prior wave's writes flush, downstream agent reads wrong path, no namespacing per run.

**Fix:**
- Move all cross-agent state into in-memory workflow state (whatever framework we land on supports this — LangGraph state, Inngest step return values, etc.)
- If filesystem is needed for debugging artifacts only, namespace by run ID: `/workspace/{runId}/sections/`
- Add cleanup on workflow completion (or rely on framework's per-run isolation)

---

### 4. Cross-cutting findings aggregation loss — **MEDIUM severity**

**Issue:** Each agent produces `crossCuttingFindings` — observations relevant to other agents' sections. Coordinator must aggregate these and pass to downstream agents. If aggregation is buggy or partial, important findings disappear (e.g. Financial Analyst flags "debt-fueled growth" but Valuation Specialist never sees it).

**Fix:**
- Implement explicit aggregation step at the end of each wave, before next wave dispatches
- Validate that aggregated findings count is plausible (e.g. expect ≥ N from Wave 1)
- Log all findings with their originating agent so we can audit later
- Pass aggregated findings as a dedicated input field to next-wave agents (not buried in section dumps)

---

### 5. No web search timeout fallback — **MEDIUM severity**

**Issue:** Six agents use web search (One Pager, Business Analyst, Financial Analyst, Management Evaluator, Risk Analyst, Valuation Specialist). If web search hangs or returns nothing, agent behavior is undefined — could halt, could invent data, could output low-confidence section.

**Fix:**
- Set per-search timeout (suggest 60–120s)
- On timeout/empty: pass empty results to agent + a flag in context indicating "web search unavailable"
- Update each agent prompt with explicit fallback language: "If web search results are empty, proceed using DataPacket and SEC filings only. Reduce confidence to LOW for the affected claims and note 'web search unavailable' in red flags."
- Test with web search mocked to fail — verify all six agents degrade gracefully

---

## Notes on sequencing

- Items 1–4 should be fixed **before** the framework migration, since they affect prompt content and agent topology — easier to iterate on one stack at a time
- Item 5 can be addressed during migration since the timeout/fallback is partly framework-dependent
- Estimated effort for all five: 1–2 weeks of focused prompt work + smoke testing per agent

---

## v3 pipeline follow-ups

Captured during the v3 web-search + streaming brainstorm (2026-05-02). All deferred from the foundational spec at [`gstack/plans/agent-pipeline-streaming-and-websearch-eng-plan-20260502.md`](gstack/plans/agent-pipeline-streaming-and-websearch-eng-plan-20260502.md). None are urgent — each has a "trigger" condition that says when to pick it up.

### A. Streaming Path B — Inngest Realtime + Worker SSE relay

**What:** Upgrade v3 streaming from polling D1 every 3s to push-based Inngest Realtime. Append-only `v3_run_events` table; Fly publishes via `step.realtime.publish()`; Worker exposes a new SSE endpoint that subscribes server-side and re-emits to the browser; frontend hook subscribes via SSE with polling fallback. Forward-compatible with Path A — same `RunProgress` data shape, just delivered via push instead of poll.

**Trigger:** Any of —
- 3s polling lag feels broken in actual user testing of Pitch Deck or Full Story
- Multi-tab UX becomes a product requirement (e.g., presentation mode for advisors showing reports to clients)
- Token-streamed typewriter UX is needed for the One Pager final output or Full Story judge

**Effort:** ~1 week on top of Path A.

### B. Native structured outputs migration

**What:** Replace forced `tool_choice: { type: 'tool', name: 'emit_output' }` with `output_config.format` + `client.messages.parse()` + `zodOutputFormat()` on Phase B synthesis calls inside the wrapper. Strict cleanup — same web_search incompatibility as forced tool_choice, so it doesn't unblock anything, but it gives cleaner code, real type inference, and decoder-level JSON enforcement.

**Trigger:** Stable v3 in production for 30 days with no wrapper-level bugs.

**Effort:** ~2 days. Only the Phase B path of the wrapper changes.

### C. Sufficiency gate (Pattern 8)

**What:** Add a small Haiku verification call between Phase A and Phase B that checks "did the agent research enough?" If not, pump another auto-loop turn with a directive ("you have not yet searched for X — do that before emitting"). Mitigates "lazy emit" failures where the model emits on turn 1 from training data without searching.

**Trigger:** Langfuse data shows >5% of agents emitting structured output without calling `web_search` despite the system prompt nudge.

**Effort:** ~1 day. Inside the wrapper.

### D. Extended thinking on analytical agents

**What:** Turn on adaptive thinking (`thinking: { type: 'adaptive', effort: 'high' }`) for Risk Analyst and Valuation Specialist. The Pattern 1 wrapper change unlocks the capability (forced `tool_choice` was incompatible with thinking); this item is the actual config flip. Expected +5–8 quality points on analytical reasoning at +$0.15 per agent on Sonnet, +$0.60 on Opus.

**Trigger:** Pattern 1 wrapper deployed and validated in production for 1 week.

**Effort:** ~1 day. Per-agent config change in the runners + smoke test.

### E. Token-streamed typewriter UX

**What:** Stream final-output text deltas to the frontend for the One Pager and the Full Story judge. The model output appears character-by-character as it generates, ChatGPT-style. Best for outputs the user actually reads as prose; skip for the 8 middle Pitch Deck specialists whose outputs are JSON consumed by the synthesis writer.

**Trigger:** Bundle with Path B (depends on the same SSE transport).

**Effort:** ~2 days bundled with Path B.

### F. Langfuse reliability dashboards

**What:** Per-agent failure rate dashboards in Langfuse, broken down by failure mode: `schema_fail` / `refusal` / `429` / `pause_turn` / `context_overflow` / `web_search_error` / `cost_ceiling_breach`. Required for systematic progress toward the >99% per-agent success target.

**Trigger:** 200+ production runs of real data accumulated. Dashboards built on noise are noise.

**Effort:** ~3 days. Langfuse dashboard config + Anthropic call instrumentation to tag failure mode at the call site.

---

## Notes on sequencing for v3 follow-ups

- A (Path B), E (typewriter UX) bundle naturally — same SSE transport, ship together when the trigger fires.
- B (native structured outputs) is independent and can ship anytime after the v3 wrapper is stable.
- C (sufficiency gate), D (extended thinking) are quality-tuning sprints — they should follow real production data, not precede it.
- F (Langfuse dashboards) is the foundation for closing the 1% reliability tail over time. See `memory/project_reliability_target.md` for the long-term context.
