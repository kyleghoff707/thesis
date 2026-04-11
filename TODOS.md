# TODOS

## Pipeline Migration

### Queue-based fallback architecture
**What:** Design Cloudflare Queues architecture where each wave is a queue message processed by a fresh Worker invocation.
**Why:** If ctx.waitUntil() can't reliably run 15-minute pipelines (Step 0.5 verification), Queues guarantee execution regardless of wall-clock limits.
**Pros:** Truly durable, no time limits, each wave is independently retriable.
**Cons:** Adds complexity (Queue binding, message format, dead letter queue). ~4h extra work.
**Context:** The current plan uses ctx.waitUntil() with wave checkpointing. The outside voice (eng review 2026-04-10) flagged wall-clock limits as a potential fatal issue. Step 0.5 verifies experimentally. If it fails, this Queue design is the fallback.
**Depends on:** Step 0.5 verification result.

### Separate pipeline Worker
**What:** Split pipeline execution into its own Cloudflare Worker (e.g., pipeline.thes1sinvesting.com) separate from the main API Worker.
**Why:** Adding Anthropic SDK + Zod + curriculum content to the main Worker inflates the bundle and may increase cold start times for lightweight routes (auth, data, proxy).
**Pros:** Isolates blast radius. Heavy pipeline deps don't affect fast API routes. Independent deploy cycle.
**Cons:** Service-to-service auth needed. Two Workers to deploy and monitor. Cross-Worker D1/R2 access requires shared bindings.
**Context:** Outside voice finding from eng review 2026-04-10. Not blocking for MVP. Monitor cold start times after initial deploy, split if degraded.
**Depends on:** Pipeline migration shipped and running in production.

### Managed Agents migration (Layer 1 swap)
**What:** Replace orchestrator.js (Layer 1) with a Claude Managed Agent coordinator. Layers 2-3 (agentDispatch.js, dataPacket.js) become custom tool handlers.
**Why:** Managed Agents provides session durability, built-in observability, automatic context compaction, and eliminates custom orchestration code. Currently in public beta (launched 2026-04-08).
**Pros:** Durable sessions (survive everything), queryable event history, automatic prompt caching, zero orchestration code.
**Cons:** $0.08/session-hour (negligible vs token costs). Beta API may evolve. Less deterministic than code-based orchestration.
**Context:** Full feasibility analysis in gstack/research/managed-agents-migration-analysis.md. API docs: platform.claude.com/docs/en/managed-agents/. Pattern 1 (coordinator + custom tools) is production-stable. Multi-agent (callable_agents) is research preview. The three-layer architecture was designed specifically for this swap. When ready, the coordinator's system prompt encodes wave logic in natural language.
**Depends on:** Pipeline migration shipped. Managed Agents API exits beta or stabilizes (expect ~3-4 months from April 2026).
