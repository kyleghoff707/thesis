# TODOS

## Pipeline Migration

### ~~Queue-based fallback architecture~~ RESOLVED
Resolved by using Durable Objects instead of ctx.waitUntil(). DO has no wall-clock limit.
ctx.waitUntil() verified to die at 30-60s. DO deployed in commit de710d4.

### edgarFinancials DRY refactor
**What:** Refactor edgarFinancials.js to separate the pure extraction logic (taxonomy, computeDerivedFields, buildTTM) from the cache/fetch layer. Export the pure functions from a cache-free module.
**Why:** Currently the Worker uses esbuild [alias] + [define] to shim out browser dependencies (idb, import.meta.env). This works but is fragile. A proper separation would let both browser and Worker import the extraction core without shims.
**Pros:** Eliminates shim dependency. Both environments use identical code. Easier to test extraction logic in isolation.
**Cons:** Touching the most validated engine in the codebase (94.8% accuracy, 503 S&P 500 companies). Must run full regression suite after refactor.
**Context:** The extraction core is ~73KB of pure functions (lines 21-1791 of edgarFinancials.js). Only the top-level fetch functions (fetchEdgarStatements, fetchEdgarQuarterly) use cache and apiBase. The refactor would move the pure core to a separate file and have both the browser and Worker fetch wrappers import it.
**Depends on:** Pipeline migration stable in production. Run validation suite: `node validation/scripts/compare-morningstar.mjs` (must stay >= 94.0%).

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
