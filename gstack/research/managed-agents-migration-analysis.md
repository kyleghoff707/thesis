# Managed Agents Migration Analysis for Thes1s Pipeline

**Date**: April 10, 2026
**Type**: Technical feasibility analysis
**Decision**: Should Thes1s migrate from custom JS orchestration to Claude Managed Agents?

---

## Executive Summary

**Yes, migrate.** Managed Agents eliminates the exact code that keeps breaking: retry logic, JSON extraction, error recovery, session management, and the in-browser execution model that kills $10 reports when users close tabs. The multi-agent feature is in research preview (not production-stable), but the single-coordinator pattern is production-ready and maps directly to the Thes1s wave architecture. Migration effort: 3-5 days. The hardest part isn't the orchestration rewrite, it's getting DataPacket data into the container.

---

## Current State of Managed Agents (as of April 10, 2026)

### What's Production-Ready (Public Beta)

| Feature | Status | Relevance to Thes1s |
|---------|--------|-------------------|
| Agent creation (model, system prompt, tools) | Stable | Direct: each of 12 agents becomes a Managed Agent |
| Environments (containers with packages, networking) | Stable | Containers can run Node.js, pip packages, etc. |
| Sessions (stateful, persistent event history) | Stable | Pipeline runs survive tab closes, server restarts |
| SSE streaming | Stable | Frontend can show real-time progress |
| Built-in tools (bash, file ops, web search/fetch) | Stable | Agents can search web, read/write files in container |
| Custom tools (client-executed) | Stable | DataPacket injection, D1 queries, SEC API calls |
| MCP server support | Stable | Could expose SEC/Yahoo/D1 as MCP tools |
| Prompt caching & compaction | Built-in | No more manual cache breakpoint management |
| Event history (queryable) | Stable | Full observability for free |

### What's Research Preview (Requires Access Request)

| Feature | Status | Relevance to Thes1s |
|---------|--------|-------------------|
| Multi-agent (coordinator + callable agents) | Research preview | The "ideal" pattern for wave orchestration |
| Outcomes (success/failure criteria) | Research preview | Quality gates |
| Memory (cross-session learning) | Research preview | Pattern library / learning system |

### Key Architecture Detail

Managed Agents uses a decoupled design: sessions are append-only event logs persisted externally, harnesses (agent loops) are stateless and replaceable, and sandboxes (containers) are disposable. When a container fails, Claude gets a tool error and decides whether to retry. When a harness crashes, a new one picks up from the session log. [Source: Anthropic engineering blog]

This directly addresses the #1 reliability concern: the current pipeline runs in-browser and dies if the tab closes. Managed Agents runs server-side with durable state.

---

## Migration Feasibility

### What Maps Directly

| Current (Custom JS) | Managed Agents Equivalent |
|---------------------|--------------------------|
| `agents/*/config.json` (12 agents) | `POST /v1/agents` with model, system prompt, tools |
| Agent system prompts (markdown files) | `system` field on agent creation |
| `pipelineManager.js` wave dispatch | Coordinator agent's system prompt + `callable_agents` |
| `aiResearch.js` Claude API calls | Handled by Managed Agents internally |
| `critic.js` quality validation | Coordinator re-dispatches on failure (natural language) |
| `contextBudget.js` token tracking | Built-in via event history (tokens logged per event) |
| Progress reporting (SSE) | Native SSE streaming on session |

### The DataPacket Problem (Biggest Migration Challenge)

The current pipeline runs `assembleDataPacket(ticker)` in-browser, which calls 20+ engines (EDGAR XBRL, Yahoo, Finviz, D1) and produces a ~50KB JSON object. Each agent receives a slice of this DataPacket.

In Managed Agents, the DataPacket needs to get INTO the container. Three options:

**Option A: Custom tool (recommended)**
Define a `get_data_packet` custom tool. When the coordinator calls it, your Cloudflare Worker runs `assembleDataPacket()` server-side and returns the JSON. The coordinator then writes it to a file in the container for sub-agents to read.

**Option B: Pre-upload via session event**
Send the DataPacket as a `user.message` event after session creation. The coordinator writes it to disk. Downside: 50KB of JSON in the prompt wastes context.

**Option C: Container fetches directly**
Give the container network access to your API. The coordinator runs bash/fetch commands to call `api.thes1sinvesting.com/data/*` endpoints and SEC EDGAR directly. Downside: duplicates logic that `dataExport.js` already handles, and the container would need your D1/SEC proxy infrastructure.

**Recommendation: Option A.** Move `assembleDataPacket()` to a Worker endpoint (`POST /api/pipeline/data-packet`). Define it as a custom tool on the coordinator. One clean handoff.

### Wave Orchestration: Two Viable Patterns

**Pattern 1: Single coordinator with custom tools (works today)**
One coordinator agent with 12 custom tools (one per analyst agent). The coordinator's system prompt describes the wave logic: "Run business-analyst and financial-analyst in parallel first, wait for both, then run competitor-evaluator..." Each "agent tool" is actually a custom tool that your Worker dispatches via the Messages API.

Pro: Works with production-stable features. Full control over dispatch.
Con: You're still writing dispatch logic on your Worker, just less of it.

**Pattern 2: Multi-agent with callable_agents (research preview)**
Define all 12 as Managed Agents. The coordinator has `callable_agents` referencing their IDs. The coordinator decides when to dispatch, and Managed Agents handles threading, context isolation, and parallel execution.

Pro: Eliminates ALL dispatch code. Natural language orchestration.
Con: Research preview. One level of delegation only (sub-agents can't call sub-agents). May need access approval.

**Recommendation:** Start with Pattern 1 for immediate production use. Switch to Pattern 2 when multi-agent exits research preview (likely 1-2 months based on Anthropic's pace).

---

## What Managed Agents Solves That You Currently Handle Manually

| Problem | Current Solution | Managed Agents |
|---------|-----------------|----------------|
| Tab close kills pipeline | Nothing (user loses $10) | Server-side, survives anything |
| JSON extraction from Claude | Regex fallbacks (brittle) | Structured output via tools |
| Retry on failure | Manual retry logic in aiResearch.js | Harness auto-retries tool failures |
| Session state persistence | In-memory (lost on refresh) | Durable event log |
| Context window overflow | Manual compaction in contextBudget.js | Built-in compaction |
| Prompt caching | Manual cache breakpoints | Automatic |
| Observability | console.log | Full event history, queryable API |
| Progress reporting | Custom SSE in useGeneratePipeline | Native SSE streaming |
| Error recovery | Silent data loss | Errors surface as events, coordinator can react |
| Container security | N/A (runs in browser) | Sandboxed, credential-isolated |

---

## Cost Analysis

### Current Cost Structure
- Pitch Deck: $8-12/company (tokens only)
- Full Story (all 3 stages): $28-30/company
- Infrastructure: $0 (runs in browser)

### Managed Agents Additional Cost
- **$0.08/session-hour** on top of token costs
- Typical pipeline run: 5-15 minutes → $0.01-0.02 per run
- Even a 30-minute Full Story run: $0.04

**Impact: Negligible.** Less than 0.5% of total pipeline cost. The token costs dominate.

### Potential Token Savings
- Built-in prompt caching may improve on manual breakpoints
- Compaction handled automatically (no wasted context)
- Model tiering still applies (Haiku for PSR agents, Sonnet for analysis)

---

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Beta API changes | Medium | Agent specs are decoupled from runtime. Pin to `managed-agents-2026-04-01` beta header. |
| Multi-agent not production-ready | Low | Pattern 1 (single coordinator + custom tools) works today without multi-agent feature |
| Container cold start latency | Low | Anthropic reports 60% reduction in TTFT with new architecture |
| Vendor lock-in | Medium | Agent specs (prompts, tools, schemas) are portable. Only the dispatch wrapper is Anthropic-specific |
| DataPacket assembly server-side | Low | Most engines already work in Node.js. Only Yahoo-dependent engines skip in Node (already handled) |
| Observability gap during migration | Low | Event history provides more observability than current console.log |

### The "Multi-Month Break" Risk

Your scaling doc mentions a multi-month break. Managed Agents' beta status means the API could evolve. However:
- The beta header versions the API (`managed-agents-2026-04-01`)
- Agent definitions are declarative (easy to update)
- Anthropic's track record with Messages API beta → stable was smooth
- Having durable session logs during your break is strictly better than in-browser execution

---

## Migration Plan (3-5 Days)

### Day 1: Server-Side DataPacket + Agent Definitions
- Move `assembleDataPacket()` to a Worker endpoint (`POST /api/pipeline/data-packet`)
- Define 12 agents via `POST /v1/agents` (translate `config.json` + prompt files)
- Create environment with Node.js + required packages

### Day 2: Coordinator + Session Flow
- Write coordinator agent system prompt (wave logic in natural language)
- Implement session lifecycle on Worker: create session → send DataPacket → stream events
- Wire frontend to poll/stream session progress

### Day 3: Custom Tool Integration
- Define custom tools for DataPacket slicing, D1 queries, report saving
- Handle `user.custom_tool_result` events on the Worker
- Wire report output saving to D1 (`report_stages` table)

### Day 4: Testing + Error Handling
- Run 3-5 test pipelines (mix of S&P 500 and non-S&P 500 tickers)
- Verify quality matches current pipeline output
- Handle edge cases (rate limits, missing data, partial failures)

### Day 5: Frontend Polish + Deploy
- Progress UI (streaming events → section-by-section updates)
- Error display (surface agent errors to user)
- Cost tracking (read tokens from event history)
- Deploy and test with real user account

---

## Recommendation

Migrate to Managed Agents using **Pattern 1** (single coordinator with custom tools). This is production-stable today, eliminates ~2,000 lines of fragile orchestration code, and solves every problem listed in the scaling doc's "Current Fragility Points."

The biggest win isn't the code reduction, it's moving the pipeline server-side. Users can close their browser and come back to a finished report. That's table stakes for a paid product.

Don't wait for multi-agent to exit research preview. Pattern 1 gets you 90% of the benefit. When multi-agent stabilizes, the migration from Pattern 1 → Pattern 2 is swapping custom tools for `callable_agents`, about a day of work.

---

## Sources
- [Claude Managed Agents Overview](https://platform.claude.com/docs/en/managed-agents/overview)
- [Managed Agents Quickstart](https://platform.claude.com/docs/en/managed-agents/quickstart)
- [Multi-Agent Sessions](https://platform.claude.com/docs/en/managed-agents/multi-agent)
- [Managed Agents Tools](https://platform.claude.com/docs/en/managed-agents/tools)
- [Managed Agents Environments](https://platform.claude.com/docs/en/managed-agents/environments)
- [Scaling Managed Agents: Decoupling the Brain from the Hands (Anthropic Engineering)](https://www.anthropic.com/engineering/managed-agents)
- [New Agent Capabilities on the Anthropic API](https://www.anthropic.com/news/agent-capabilities-api)
