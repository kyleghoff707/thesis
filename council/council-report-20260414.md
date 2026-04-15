# Council Verdict: Thes1s Backend Architecture

**Date:** 2026-04-14
**Question:** How should Thes1s design its backend for production scalability — how should financial data flow between browser, Worker, and AI agents?

---

## Advisor Positions

| Advisor | Position | Key Insight |
|---------|----------|-------------|
| Contrarian | Option A, but split filing parsing out | Filing HTML extraction is the real bottleneck, not financial math |
| First Principles | Option A — Worker is just a proxy | "Server-side is more professional" was cargo-culting |
| Expansionist | Option A — browsers are free compute | Scales to 1,000 users without backend changes |
| Outsider | Option A + filing cron | Filings are immutable, pre-compute into R2. No MCP yet. |
| Executor | Option A — Monday morning plan | Browser assembles, POSTs to Worker relay, filing content via cron |

**Unanimous: Option A (browser assembles, Worker relays).**

---

## Where the Council Agrees

1. **Browser-side DataPacket assembly.** All 5 advisors independently. The 58 engines work at 94.8% accuracy in the browser. Moving them to a 30s CPU-limited Worker was fighting the platform.

2. **Filing content is a separate problem.** Number crunching (fast, cacheable) must not be conflated with filing HTML-to-markdown (slow, CPU-heavy). Filings are immutable — pre-compute via cron into R2.

3. **Do not build MCP yet.** Premature complexity for <10 users. More importantly: Managed Agents consume data at message time and cannot call back. Dynamic queries are moot until Anthropic ships tool-use callbacks.

4. **The real bottleneck is callable_agents access, not architecture.** Three peer reviews flagged this. Time on data flow is time not on prompts.

## Where the Council Clashes

**Browser reliability.** Expansionist says every browser is a free compute node. Contrarian flags the risk: user closes laptop mid-run, pipeline breaks. Resolution: at current scale this is a non-issue. The browser's job finishes in seconds (assemble + POST). The long-running agent session runs server-side regardless.

## Blind Spots the Council Caught

1. **Managed Agents session lifecycle** — the agent gets one message with all data. No callbacks, no MCP, no progressive enrichment. The DataPacket must be complete at send time.

2. **Token budget is the real DataPacket constraint** — not compute, not storage. How much data fits in the agent's context window determines DataPacket design.

3. **Retry/failure handling** — nobody addressed what happens when assembly fails mid-pipeline.

## The Recommendation

**Browser assembles DataPacket. Worker relays to Managed Agent. Filing content pre-computed in R2 via cron.**

1. Browser runs 58 engines, assembles DataPacket (already works for Toolbox)
2. Browser POSTs DataPacket to Worker
3. Worker pulls pre-computed filing content from R2, appends to message
4. Worker creates Managed Agent session, sends everything as one message
5. Worker polls for completion (already built)

No MCP. No dynamic queries. No progressive enrichment. One shot, one message, all the data.

## The One Thing to Do First

**Wire the browser to POST its already-assembled DataPacket to `/api/pipeline/run` instead of having the Worker re-assemble it.**

The DataPacket assembly already works in the browser (powers every Toolbox tab). The Worker endpoint already creates agent sessions. The only change: Worker receives DataPacket in the request body instead of building it internally. Plumbing change, not architecture change.

---

*Full transcript: [council-transcript-20260414.md](council-transcript-20260414.md)*
