# Council Transcript: Thes1s Backend Architecture

**Date:** 2026-04-14
**Counciled by:** Claude Opus 4.6 (5 sub-agents + 5 peer reviewers + chairman)

---

## The Question

How should Thes1s design its backend architecture for production scalability — specifically, how should financial data flow between the browser, Worker, and AI agents?

### Context
- Solo dev (materials engineer), $5/mo Cloudflare Workers (30s CPU limit)
- 58 browser engines at 94.8% accuracy across S&P 500
- Tried server-side assembly, hit CPU limits (30-50s for DataPacket, 10-20MB bank 10-Ks)
- Managed Agents for AI, Pitch Deck blocked on callable_agents
- Currently <10 users, designing for 100+

### Options
- A) Browser assembles, Worker relays, MCP for dynamic queries
- B) Keep Worker-side assembly with band-aids
- C) Pre-compute DataPackets for all companies via cron
- D) Hybrid
- E) Something else

---

## Advisor Responses

### The Contrarian

The previous council member who said "server-side is the only way" was wrong because they didn't do the math. 30 seconds of CPU, 128MB of memory, 10-20MB bank 10-Ks. That's not a scaling problem — that's a physics problem. Band-aids like truncation and CPU budgets don't fix physics.

**Option C (pre-compute via cron) will silently kill you.** You have 5,758 companies in your taxonomy. Pre-computing DataPackets for all of them means you're now maintaining a stale cache that drifts from your engines. Every engine fix requires a full recompute. You'll spend more time debugging cache staleness than you save.

**Option A has a fatal assumption:** it assumes the browser is always available when an agent needs data. What happens when the user closes their laptop mid-run? The agent is now calling an MCP server that points at a dead browser. You'd need a persistent relay, which is just reinventing Option B with extra steps.

**The real question nobody's asking:** Why does DataPacket assembly need to happen at request time at all? Your engines are deterministic — same XBRL data in, same numbers out. The actual bottleneck is parsing 10-20MB filing HTML, not running financial calculations.

**What will actually fail in production:** Any architecture where a single synchronous request must parse raw SEC filings. That's the constraint that broke you, and Options A through D all still have some path where that happens.

**The hard truth:** You need to separate "financial number crunching" (fast, cacheable, works anywhere) from "filing content extraction" (slow, CPU-heavy, must be async). Every option that treats these as one pipeline will hit the same wall you just hit. Split them or fail again.

### The First Principles Thinker

The wrong question is being asked. "How should data flow between browser, Worker, and agents?" assumes the Worker needs to be in the data assembly path at all. It doesn't.

Strip it down to first principles:

**What actually needs to happen?** Financial engines produce a DataPacket. An AI agent consumes that DataPacket. That's it.

**What's the actual constraint?** The engines work in the browser. They break in Workers. Workers have a 30s CPU limit and 128MB memory. These aren't temporary limitations — they're fundamental to the platform choice.

**The assumption that caused the failure:** "Server-side assembly is more professional/scalable." This is cargo-culting. The engines were built for the browser. They work in the browser. Moving them to a constrained serverless environment with hard CPU limits was fighting the platform, not using it.

**The rebuild from ground up:**

The browser is the compute engine. Full stop. It already runs 58 engines at 94.8% accuracy. The Worker is a thin relay — authentication, session management, forwarding payloads. It should never parse a 10-20MB HTML file.

The flow is dead simple: Browser assembles DataPacket -> POSTs JSON to Worker -> Worker forwards to Managed Agent session. Worker touches zero financial logic.

For dynamic agent queries during runs, the browser can't serve requests. So pre-compute what agents might need and include it in the DataPacket, or use MCP pointing at simple D1/R2 lookups that the Worker can handle in milliseconds (not parsing — just reading pre-stored data).

**The real question nobody's asking:** "Do we even need the Worker in the data path, or is it just an authenticated proxy?"

Answer: it's just a proxy. Design it that way and the 30s limit becomes irrelevant.

### The Expansionist

The browser-side engines are the most undervalued asset in this entire system. 94.8% accuracy across 503 companies, battle-tested, zero server cost, no CPU limits. Everyone is trying to move work OFF the thing that already works. Stop.

**Option A is the play, and it's bigger than you think.**

Browser assembles the DataPacket. Browser POSTs it to the Worker. Worker relays to the agent. This isn't a compromise — it's the correct architecture for a solo dev with a $5/mo budget and engines that already work.

Here's what everyone is missing: **this pattern scales to 1,000 users without changing a single line of backend code.** Every user's browser is a free compute node. You're getting distributed financial parsing for free. The Worker becomes a thin relay — auth, session management, forwarding payloads. That's a 5ms operation, not a 30s one.

But think bigger. Once the browser is the canonical assembly point:

1. **Real-time DataPackets** — user tweaks a maintenance capex assumption, hits "regenerate valuation section," and only that section reruns with the updated packet. No server round-trip for assembly.
2. **Offline-first pipeline** — DataPacket assembles locally, queues for agent dispatch when connected. Works on planes.
3. **Progressive enrichment** — start the agent with what you have, stream additional filing content as it parses. The agent doesn't wait for the slowest 10-K.
4. **User-customized packets** — power users toggle which data sources feed the agent. You can't do that if assembly is a server black box.

The MCP server for dynamic agent queries during runs is the one piece that needs server-side. That's fine — it's lightweight lookups, not 10MB HTML parsing.

Stop fighting the architecture that's already working. Lean into it.

### The Outsider

Option A. Browser assembles, POSTs to Worker, Worker relays.

Your 58 engines already work in the browser. The Worker version literally imports from the same frontend code (`assembleDataPacket.js` imports from `../../../src/engines/dataExport.js`) with a fetch interceptor bolted on because the engines assume browser context. You rebuilt what already worked, in a worse environment. The 30s CPU limit is not a band-aid problem — it is a fundamental mismatch.

**The architecture should follow the constraint, not fight it.** Your Worker has 30 seconds and 128MB. Your browser has neither limit. The browser is where the engines already run. So:

1. Browser calls `assembleDataPacket()` (already works, no time limit)
2. Browser POSTs the resulting JSON to the Worker (1-2MB, trivial)
3. Worker stores it in R2, creates the Managed Agent session, attaches the R2 URL
4. For filing content: pre-compute it via **cron** into R2 (filings are immutable — you already cache them). Do not parse 10MB HTML at request time, ever.

**The filing cron is the key insight.** You already have 5 cron jobs. Filings do not change. A nightly cron that pre-processes the S&P 500's recent filings into R2 markdown eliminates the entire `assembleFilingContent` CPU problem.

**Do not build an MCP server for dynamic queries.** That is premature complexity for <10 users. If agents need fresh data mid-run, have them output a structured request, and handle it in the next polling cycle.

### The Executor

**Option A wins. Monday morning plan:**

1. **Browser assembles the DataPacket.** It already does this — the engines run client-side today. `assembleDataPacket()` in `dataExport.js` is the same function the Worker imports. Stop importing it into the Worker for generation runs.

2. **Browser POSTs the finished JSON to a new Worker endpoint** (`POST /api/pipeline/dispatch`). The Worker receives ~1-2MB JSON, creates the Managed Agent session, sends the DataPacket as the message content, returns a runId. This is a relay — 0 CPU for data processing.

3. **Filing content goes to R2 via a separate browser-initiated flow.** Browser fetches the 10-K/10-Q HTML, runs DOMParser/Turndown client-side, and the DataPacket includes R2 keys the agent can reference. Or pre-cache in R2 via the existing cron pattern.

4. **Keep the `assemble-data` endpoint for debugging/admin** but remove it from the generation hot path.

**Option C (pre-compute everything via cron) is overkill.** <10 users running on-demand. Pre-computing for all S&P 500 burns cron slots and storage for data that goes stale.

**MCP server is a future concern.** Get the Pitch Deck pipeline working first with static DataPackets. Add dynamic queries when you have evidence agents need them mid-run.

---

## Peer Reviews

### Review 1
- **Strongest: Contrarian** — only one that correctly splits filing parsing from financial computation as separate architectural problems
- **Biggest blind spot: Expansionist** — "1,000 users" meaningless if pipeline requires browser tab open 15+ min
- **All missed:** Managed Agents session lifecycle — agent cannot call back to anything. MCP/dynamic-query discussion is moot until Anthropic ships tool-use callbacks.

### Review 2
- **Strongest: Outsider** — clearest actionable path
- **Biggest blind spot: Expansionist** — browsers close, go offline, vary in performance
- **All missed:** Session lifecycle — retry handling, polling with partial data

### Review 3
- **Strongest: Outsider** — right call on cron + no MCP
- **Biggest blind spot: Expansionist** — fantasy architecture for solo dev
- **All missed:** 30s CPU limit is already "solved" with band-aids — real bottleneck is callable_agents access

### Review 4
- **Strongest: Outsider** — names specific mechanism
- **Biggest blind spot: Expansionist** — solving problems that don't exist
- **All missed:** Real bottleneck is callable_agents, not data flow

### Review 5
- **Strongest: Executor** — converts analysis to action
- **Biggest blind spot: Expansionist** — architecture astronautics
- **All missed:** Token budget for Managed Agents message payload is the real constraint

---

## Chairman's Verdict

*(See council-report-20260414.md for the full verdict)*

**Unanimous: Option A.** Browser assembles DataPacket, Worker relays to Managed Agent, filing content pre-computed in R2 via cron. No MCP. No dynamic queries. One shot, one message, all the data.

**One thing to do first:** Wire the browser to POST its already-assembled DataPacket to `/api/pipeline/run` instead of having the Worker re-assemble it.
