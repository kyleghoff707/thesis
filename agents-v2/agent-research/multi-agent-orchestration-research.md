# Multi-Agent Orchestration Alternatives & Model Optimization

**Thes1s Project — Internal Research Report**
**Date:** April 20, 2026
**Author:** Research compilation for Kyle Hoff
**Status:** Decision-support document for the Pitch Deck pipeline blocked on Anthropic Managed Agents `callable_agents` access

---

## Executive Summary

You're 1.5 weeks into waiting for Anthropic's multiagent Research Preview approval. The One Pager pipeline is live. The Pitch Deck (10 specialists + coordinator across 5 dependency waves) and Full Story (7 agents across 2 phases) cannot ship without orchestrator-to-subagent dispatch. This report evaluates eleven alternative platforms across four categories, scores them against your specific constraints, and recommends a phased path forward.

### Top-Line Recommendations

1. **Primary path (~3–5 day migration):** Move the Pitch Deck coordinator to **Claude Agent SDK** (Anthropic's open-source self-hosted agent loop). Subagent files are nearly identical to your current `prompt.md` + `managed-agent.yaml` format. Production parity preserved — when Managed Agents `callable_agents` opens, you can swap back without prompt changes.

2. **Backup path if Claude Agent SDK is too immature for production:** **Inngest AgentKit**. AI-first multi-agent framework on a durable execution backend. Free tier covers your volume. Wave structure maps to their Network + Router pattern almost directly.

3. **Long-term Cloudflare-native answer:** **Cloudflare Project Think** (sub-agents on Durable Objects). Currently in preview. Once GA, this is the right home for Thes1s — same vendor as your Workers + D1 + R2 stack.

4. **Model optimization is independent of platform choice and worth doing now.** Mixing models per agent — Gemini 2.5 Pro for filing reading, GPT-5.4 for valuation math, Claude Opus 4.7 for synthesis and bear-case reasoning, Claude Haiku 4.5 for orchestration — saves ~40% per Pitch Deck and lifts quality on numerical sections. **Constraint:** if you stay on Managed Agents, you're locked to Claude. Cross-provider routing is the strongest argument for switching now.

5. **What we're missing today and would gain on any modern platform:** real observability (LangSmith/Langfuse/AgentOps trace + replay), structured eval harness against known verdicts (your Observatory is a head start), prompt versioning with measured impact, circuit breakers on cost + token spend, and typed structured output validation at agent boundaries.

---

## 1. The Problem

Your `feedback_no_custom_orchestration.md` memory is the load-bearing constraint: Workers, Durable Objects, and hand-rolled dispatch all failed in v1 of the pipeline. The pivot to Managed Agents was the right call. But "no custom orchestration" was always shorthand for "no DIY orchestration code I have to debug myself" — it was never a vote against using a battle-tested orchestration framework someone else maintains.

The two functional requirements are unchanged:

1. **Multi-agent callability with parallelism within waves.** The Pitch Deck dispatches 10 specialist agents in 5 dependency waves. Within Wave 2, three agents (Moats, Financial Analyst, Management Evaluator) must run in parallel. Wave 3 cannot start until Wave 2 completes.
2. **A smart, dynamic orchestrator that handles failures.** Pitch Deck and Full Story runs take 10–30 minutes. Network blips, rate-limit 429s, malformed JSON, and partial section outputs happen in production. The orchestrator must retry transient failures, surface durable failures, and continue the pipeline when individual sections fail rather than aborting the whole 25-minute run.

Anything you adopt must satisfy both, and must not violate `feedback_production_parity.md` — the migration must be reversible if Managed Agents access lands tomorrow.

---

## 2. Current State of the Pipeline

### Inventory of `agents-v2/`

| Agent | Stage | Current Model | Prompt Size |
|---|---|---|---|
| coordinator-pitchdeck | Pitch Deck | claude-sonnet-4-6 | 1,110 words |
| coordinator-fullstory | Full Story | claude-sonnet-4-6 | 1,926 words |
| one-pager | One Pager | claude-sonnet-4-6 | 2,625 words |
| annual-reader | PSR (PD+FS) | claude-sonnet-4-6 | 5,424 words |
| quarterly-reader | PSR (PD+FS) | claude-sonnet-4-6 | 4,424 words |
| business-analyst-pitchdeck | PD §1–2 | claude-sonnet-4-6 | 6,077 words |
| business-analyst-fullstory | FS §2 | claude-sonnet-4-6 | 6,239 words |
| competitor-evaluator-market-position-pitchdeck | PD §3 | claude-sonnet-4-6 | 4,931 words |
| competitor-evaluator-moats-pitchdeck | PD §4 | claude-sonnet-4-6 | 3,691 words |
| competitor-evaluator-fullstory | FS §3 | claude-sonnet-4-6 | 6,023 words |
| financial-analyst-pitchdeck | PD §5,7,8 | claude-sonnet-4-6 | 5,625 words |
| financial-analyst-fullstory | FS §6 (judge) | claude-sonnet-4-6 | 4,197 words |
| management-evaluator-pitchdeck | PD §6 | claude-sonnet-4-6 | 4,851 words |
| management-evaluator-fullstory | FS §4 | claude-sonnet-4-6 | 6,004 words |
| risk-analyst-pitchdeck | PD §9 | claude-sonnet-4-6 | 4,842 words |
| risk-analyst-fullstory | FS §1 + Bear | **claude-opus-4-6** | 7,443 words |
| valuation-specialist-pitchdeck | PD §10 | claude-sonnet-4-6 | 5,090 words |
| valuation-specialist-fullstory | FS §5 | claude-sonnet-4-6 | 5,169 words |
| synthesis-writer-pitchdeck | PD §11 | claude-sonnet-4-6 | 4,145 words |
| synthesis-writer-fullstory | FS §6 (Bull/Rebuttal) | claude-sonnet-4-6 | 4,041 words |

**Observation:** 19 of 20 agents are on Sonnet 4.6. Only `risk-analyst-fullstory` runs Opus. Total prompt corpus is ~98,000 words across 20 agents — roughly 130K tokens of system prompt content. This is a meaningful asset; any migration must preserve it byte-for-byte.

### Current Pitch Deck Wave Structure

```
Wave 0 (PSR, parallel)     →  annual-reader, quarterly-reader
Wave 1 (Business, parallel) →  business-analyst, competitor-market-position
Wave 2 (Deep, parallel)     →  competitor-moats, financial-analyst, management-evaluator
Wave 3 (Risk+Val, parallel) →  risk-analyst, valuation-specialist
Wave 4 (Synthesis, single)  →  synthesis-writer
```

This is a 5-superstep DAG. Every modern multi-agent framework has a primitive for it. The question is which one we want to own.

---

## 3. Evaluation Framework

For each platform, the report scores on:

| Dimension | What it measures |
|---|---|
| Multi-agent fit | Does it have a first-class abstraction for orchestrator + specialist + waves? |
| Parallelism within waves | Native parallel dispatch, or hand-rolled `Promise.all`? |
| Failure handling sophistication | Retries, replay, checkpoints, supervisor patterns, durable execution |
| Multi-LLM provider support | Can we mix Claude / GPT-5 / Gemini per agent? |
| Migration effort from `prompt.md` + YAML | 1 (rewrite required) → 5 (drop in verbatim) |
| Production maturity | Who runs it in prod? When did it GA? |
| Cost at our volume | Platform fees + LLM tokens. We assume ~50–100 Pitch Decks + 20 Full Stories per month. |
| Production parity | If Managed Agents `callable_agents` opens, can we revert without losing work? |

---

## 4. Platform Deep Dives

### Tier 1 — Anthropic Self-Hosted Stack

#### 4.1 Claude Agent SDK ⭐ **TOP PICK**

The Claude Agent SDK (formerly Claude Code SDK) is Anthropic's open-source library that runs the same agent loop as Claude Code in your own infrastructure. Subagents are defined as **Markdown files with YAML frontmatter** — name, description, tools, model, permissions — almost identical to your current `managed-agent.yaml` + `prompt.md` split.

**How it handles multi-agent.** Subagents isolate context, run in parallel, and the parent agent dispatches via the Task tool. The "Agent Teams" pattern coordinates multiple Claude Code instances with one as team lead. Sub-agents get their own conversation thread, their own tool permissions, their own model assignment.

**Failure handling.** You own retry/escalation policy in your dispatch code (no managed supervisor). Pair with simple TS/JS error handling in the coordinator script. For long-running pipelines, wrap in a Cloudflare Workflow step or an Inngest function for durable execution.

**Multi-LLM.** Native = Claude only. Via the **LiteLLM proxy**, the SDK can call OpenAI/Gemini/Bedrock through OpenAI-compatible endpoints. This is well-documented as of Apr 2026.

**Migration effort.** **Lowest of any framework.** Your `agents-v2/{agent}/prompt.md` files become `.claude/agents/{agent}.md` with the YAML frontmatter from `managed-agent.yaml` merged in. Your coordinator's "send message → poll events → write to filesystem" pattern translates to Task tool dispatch + result collection.

**Cost.** SDK is free (MIT-style license). You pay Anthropic API tokens (same as today) plus your hosting (a long-running Node process — Cloudflare Workers won't work, but Fly.io, Render, or a small EC2 box does).

**Production parity.** **Highest.** Same model access, same prompts, same agent loop semantics. Switching back to Managed Agents is a configuration change, not a rewrite.

**Gotchas.** You re-implement the session/event lifecycle Managed Agents handles for you. No managed sandbox unless you wire up Docker/gVisor/Firecracker per Anthropic's hosting docs. The hosted `web_search` tool needs to be re-wired (use Anthropic's web search API directly, or swap to Tavily/Exa).

**Verdict:** This is the Anthropic-blessed escape hatch. If multiagent Managed Agents lands in 2 weeks, you're fine — minimal migration, easy revert. If it doesn't land for 3 months, you're not blocked.

---

### Tier 2 — Multi-Agent Frameworks

#### 4.2 LangGraph

The most production-tested multi-agent framework in market. Used by Klarna, Replit, Uber, LinkedIn, Elastic, AppFolio, JP Morgan, BlackRock, Cisco. Hit v1.0 in Oct 2025.

**Mechanics.** Agents are nodes in a `StateGraph`. Edges are control flow. A typed shared `State` flows through the graph. Execution is **superstep-based** (Pregel/BEAM model) — all eligible nodes run, state writes merge via reducers, graph advances. Your wave structure maps 1:1 to graph layers.

**Parallelism.** Two patterns: static fanout (multiple edges from one node to N downstream) and dynamic `Send` API (runtime map-reduce). Both fit your needs.

**Failure handling.** Per-node `RetryPolicy` (exponential backoff). Checkpointer (Postgres/SQLite/Dynamo) persists state every superstep — on crash, resume from last checkpoint. `interrupt()` for human-in-the-loop. **Caveat:** checkpoints are persistence, not durable execution — if the host process dies (not just a node), no one restarts it. You need k8s/systemd/PM2 to respawn the runner. This is the core critique in [Diagrid's writeup](https://www.diagrid.io/blog/checkpoints-are-not-durable-execution-why-langgraph-crewai-google-adk-and-others-fall-short-for-production-agent-workflows).

**Multi-LLM.** Trivial. `ChatAnthropic`, `ChatOpenAI`, `ChatGoogleGenerativeAI` are interchangeable at the node level. Per-agent model choice is the common pattern.

**Migration effort.** **Medium.** Prompts copy verbatim. `managed-agent.yaml` model assignments translate to `ChatAnthropic(model=...)` per node. The coordinator's `callable_agents` becomes explicit `StateGraph` edges. Your `assembleDataPacket.js` stays put (or gets ported to Python/TS). Estimated 1–2 weeks for 11 agents.

**Cost.** LangSmith Developer tier is **free** (5K traces/month — plenty for your volume). LangGraph Platform self-hosted Developer tier is **free** for the first 100K node executions/month. Only LLM costs. Or LangGraph Cloud at ~$0.06/run hosting on top of tokens.

**Observability.** LangSmith is genuinely excellent and is the main reason teams adopt the stack. Per-node traces, token counts, latency, replayable runs, dataset-backed evals, prompt diffing, time-travel debugging.

**Production parity.** Lower than Claude Agent SDK — Managed Agents and LangGraph have different agent loop semantics. You can keep the same prompts but the orchestration code is different.

**Gotchas.** Steeper learning curve than CrewAI/Inngest. `InvalidUpdateError` on parallel writes if you forget reducers. Recursion limits hit on cyclic supervisor loops. The mental model takes a few days to internalize.

#### 4.3 Inngest AgentKit

Best-fit AI-native abstraction for your pattern. AgentKit is Inngest's TS multi-agent framework on top of their durable execution backend. `Agent` = single LLM + tools; `Network` = multiple agents + a `Router` that decides which agent runs next; backed by `step.run()` and `step.ai.infer()` which are auto-checkpointed and retried.

**Parallelism.** Native via `step.parallel()`. Wave dispatch via Router function (~50 lines).

**Failure handling.** Per-step retry with backoff, replay from last step on crash, built-in throttling and concurrency limits — useful for Anthropic rate limits.

**Multi-LLM.** Native — OpenAI, Anthropic, Gemini, any OpenAI-compatible model.

**Migration effort.** **Lowest of the frameworks.** prompt.md content drops into `Agent({ system: ... })` definitions almost verbatim. Router function implements your wave dispatch.

**Cost.** Free tier: 50K executions/month. Pro starts at $25/month. At 100 pipeline runs × ~50 steps = 5K executions, **you live in the free tier indefinitely**.

**Production parity.** Lower than Claude Agent SDK — different abstraction. But the Network + Router pattern is close in spirit to Managed Agents' coordinator + callable_agents.

**Gotchas.** Newer than LangGraph; smaller community. Router function logic is custom code (your one place to introduce orchestration bugs).

#### 4.4 OpenAI Agents SDK (Swarm successor)

Production-ready open-source framework, Python + TypeScript. Two coordination patterns: **handoffs** (control transfers entirely) and **agents-as-tools** (orchestrator stays in control, specialist returns result). Agents-as-tools is what you want — it preserves the coordinator/specialist hierarchy.

**Multi-LLM.** Native OpenAI. LiteLLM adapter (`openai-agents[litellm]`, beta) enables Claude/Gemini/Bedrock.

**Migration effort.** Medium. Each `managed-agent.yaml` becomes a Python `Agent(...)` constructor.

**Cost.** SDK free; pay tokens. OpenAI's tracing dashboard included.

**Why I'm not recommending it as the primary:** LiteLLM is "best-effort beta" for non-OpenAI models. For a Claude-heavy stack, the Claude Agent SDK is a more direct fit.

#### 4.5 Other multi-agent frameworks (skip for this pipeline)

- **CrewAI** — Most-starred multi-agent framework but **hierarchical mode produces circular delegation, off-topic tangents, infinite consensus loops**. This is exactly the failure mode that would break your 11-agent dependency graph. Pass.
- **Microsoft AutoGen v0.4** — Conversation/group-chat mental model doesn't match your fixed dependency-wave pipeline. Studio is for prototyping, not production wiring.
- **Pydantic AI** — Promising. `AgentSpec` (v1.71) added YAML/JSON agent loading — closest analog to your format. Smaller ecosystem of pre-built tools. Worth re-evaluating in 6 months.
- **LlamaIndex AgentWorkflow** — RAG-first lineage; multi-agent is newer surface area. Pass for now.

---

### Tier 3 — Cloud Platform Agent Services

#### 4.6 Cloudflare Project Think (with Agents SDK + Sub-Agents)

**The eventual right answer for Thes1s.** Cloudflare's April 2026 announcement adds sub-agents on Durable Objects, durable execution with fibers, persistent sessions, sandboxed code execution. Sub-agents are isolated child agents with their own SQLite + typed RPC. AI Gateway brokers 70+ models across 12+ providers with one API and no markup.

**Multi-LLM.** Yes — AI Gateway is provider-agnostic. Claude direct, Anthropic standard rates.

**Migration effort.** Highest in absolute LOC — you write the wave dispatch and routing yourself. BUT the SDK provides the durable primitives, so it's not from-scratch like the failed v1.

**Cost.** Workers Paid plan ($5/mo, you already pay). AI Gateway free for routing/observability. Tokens at Anthropic parity.

**Production parity.** Lower — different orchestration model entirely.

**Status.** Sub-agents are **preview as of April 2026.** I'd wait until they GA before betting the production pipeline on it. But put it on the roadmap as the long-term home — you already live on Cloudflare.

#### 4.7 AWS Bedrock Multi-Agent Collaboration

GA since early 2025, now part of Bedrock AgentCore. Hierarchical supervisor + collaborator agents. Supervisor decomposes and dispatches collaborators in parallel within a wave. AgentCore Runtime handles timeouts/retries/error conditions automatically. Sessions up to 8 hours.

**Claude availability.** Claude Sonnet 4.6 went GA in Bedrock Feb 2026. Opus 4.x available. **Same per-token price as Anthropic direct** ($3/$15 per 1M for Sonnet 4.6).

**Cost.** Tokens identical to Anthropic. AgentCore Runtime: $0.0895/vCPU-hr + $0.00945/GB-hr — adds ~$0.10–0.50/run on top of tokens.

**Migration effort.** Medium. Each agent becomes a Bedrock Agent (instruction = prompt.md, plus Action Groups for tools). Web_search needs Action Groups → Lambda re-wiring.

**Lock-in.** Moderate — Bedrock Agent definitions and Action Groups are AWS-proprietary. Claude prompts portable.

**Why it's a strong runner-up:** Most mature multi-agent platform in market. Supervisor model maps perfectly to your coordinator. Modest premium over Anthropic direct.

#### 4.8 Google Vertex AI Agent Engine (ADK)

ADK = Agent Development Kit, Python + Java. Hierarchical agent trees, sequential/parallel/loop workflows, deterministic guardrails. Explicit `ParallelAgent` workflow primitive.

**Claude availability.** Sonnet 4.6 and Opus 4.x on Vertex Model Garden, identical per-token pricing to Anthropic direct.

**Cost.** Tokens at Anthropic parity. Agent Engine compute: $0.0864/vCPU-hr + $0.0090/GB-hr (cheaper than AgentCore). Free tier: 50 vCPU-hr + 100 GiB-hr/month — covers all your dev runs.

**Migration effort.** Higher — ADK is code-first Python (~100 LOC per agent). Heavier than Bedrock or LangGraph.

**Lock-in.** ADK is open source (you can self-host the agents elsewhere), but Agent Engine runtime is GCP-specific.

#### 4.9 Microsoft Foundry Agent Service

Workflows use States as execution checkpoints; multiple agents in one State run in parallel — closest semantic match to your wave model. Declarative YAML-ish workflow defs. Multi-agent workflows GA early 2026.

**Claude availability.** Sonnet 4.6 and Opus 4.6/4.7 with **1M context window**. **Caveat: Enterprise/MCA-E subscriptions only.** Likely a blocker for your account.

**Cost.** Foundry-native orchestration is free. Pay only model tokens at Anthropic parity.

**Verdict:** Best semantic fit (declarative wave-like workflows) but the enterprise subscription gate is real. Skip unless you already have MCA-E.

---

### Tier 4 — Durable Workflow Engines (lower-level)

These are infrastructure primitives. You'd combine them with one of the agent frameworks above (or build your own thin agent abstraction on top). Worth knowing about for the failure-handling layer.

#### 4.10 Cloudflare Workflows

Native to Cloudflare Workers. Steps checkpointed by the platform; instances run for **months**. GA in 2025, hardened in 2026.

**Cost.** Included in your existing Workers Standard plan ($5/mo).

**Why it's not the answer alone:** No agent abstraction. You write the orchestration yourself, which collides with the no-custom-orchestration rule. **Best use:** wrap a Claude Agent SDK runner inside a Workflow step for durable execution.

#### 4.11 Temporal

Gold-standard durable execution platform. Production-grade since 2021. Workflow + activity pattern; activity = LLM call.

**Cost.** Cloud: $50/M actions + $100/mo Essentials base. Self-hosted: free OSS but 1–2 SRE FTEs of operational overhead.

**Verdict:** Most powerful, slowest migration, most operational burden. Right answer at hedge-fund scale; overkill for now.

#### 4.12 Inngest, Restate, DBOS

Covered in the framework section (Inngest AgentKit) or briefly elsewhere. DBOS requires Postgres (you don't have Postgres). Restate is newer Temporal-alike with simpler ops; viable but no compelling edge over Inngest for your case.

---

## 5. Comparison Matrix

Scored 1–5 (5 = best for your specific Thes1s case). Higher total = better fit.

| Platform | Multi-agent Fit | Parallel Waves | Failure Handling | Multi-LLM | Migration Ease | Production Maturity | Cost (your scale) | Production Parity | **Total** |
|---|---|---|---|---|---|---|---|---|---|
| **Claude Agent SDK** | 5 | 4 | 3 | 4 (LiteLLM) | **5** | 5 | 5 | **5** | **36** |
| **Inngest AgentKit** | 5 | 5 | 5 | 5 | 5 | 4 | 5 (free tier) | 3 | **37** |
| **LangGraph** | 5 | 5 | 4 | 5 | 4 | 5 | 5 (free tier) | 3 | **36** |
| **AWS Bedrock MAC** | 5 | 5 | 5 | 3 (Bedrock-only) | 3 | 5 | 4 | 3 | **33** |
| **Cloudflare Project Think** | 5 | 4 | 5 | 5 | 3 | 2 (preview) | 5 | 3 | **32** |
| **Vertex Agent Engine** | 4 | 5 | 4 | 5 | 3 | 4 | 4 | 3 | **32** |
| **Microsoft Foundry** | 5 | 5 | 4 | 4 | 4 | 4 | 5 | 3 | **34*** |
| **OpenAI Agents SDK** | 4 | 4 | 3 | 4 (LiteLLM beta) | 3 | 5 | 5 | 2 | **30** |
| **Cloudflare Workflows** | 1 | 4 | 5 | 5 | 2 | 4 | 5 | 4 | **30** |
| **Temporal** | 1 | 5 | 5 | 5 | 1 | 5 | 3 | 4 | **29** |
| **CrewAI** | 3 | 3 | 2 | 5 | 2 | 4 | 4 | 2 | **25** |

\* Foundry score gated by Enterprise subscription requirement.

**Top three for your specific needs:** Inngest AgentKit (37), Claude Agent SDK (36), LangGraph (36). All three are within striking distance — pick by deployment philosophy:

- If you want the **maximum production parity with Managed Agents** → Claude Agent SDK
- If you want the **most AI-native abstraction** with built-in durable execution → Inngest AgentKit
- If you want the **most mature framework** with the best observability story → LangGraph

---

## 6. Migration Effort by Platform

For each platform, what specifically you need to do to port the Pitch Deck pipeline. Time estimates assume one focused engineer.

### Claude Agent SDK

| Step | Effort |
|---|---|
| Move `prompt.md` files into `.claude/agents/` with merged YAML frontmatter | 1 day |
| Rewrite coordinator dispatch using Task tool | 1 day |
| Re-wire `web_search` tool (Anthropic search API or Tavily) | 0.5 day |
| Wrap pipeline in a long-running Node service or Cloudflare Workflow | 1 day |
| Port `assembleDataPacket.js` integration (it stays mostly the same) | 0.5 day |
| End-to-end test on LULU + 2 known-verdict tickers | 1 day |
| **Total** | **~5 days** |

### Inngest AgentKit

| Step | Effort |
|---|---|
| Convert each agent to `Agent({ system, model, tools })` constructor | 2 days |
| Write Router function implementing wave dispatch (~50 LOC) | 1 day |
| Wire `step.ai.infer()` for each agent invocation | 1 day |
| Sign up for Inngest, deploy initial run | 0.5 day |
| End-to-end test | 1 day |
| **Total** | **~5–6 days** |

### LangGraph

| Step | Effort |
|---|---|
| Define typed `State` TypedDict with reducers for parallel writes | 1 day |
| Convert each agent to a node function (`prompt + ChatAnthropic.invoke`) | 2 days |
| Wire StateGraph with explicit edges per wave | 1 day |
| Set up Postgres checkpointer (or use SQLite for dev) | 0.5 day |
| Provision LangSmith for tracing | 0.5 day |
| Stand up long-running runner (Fly.io / Render) | 1 day |
| End-to-end test | 1 day |
| **Total** | **~7 days** |

### AWS Bedrock MAC

| Step | Effort |
|---|---|
| Sign up for Bedrock, request Claude Sonnet 4.6 + Opus 4.7 access | 1–3 days (AWS) |
| Define each agent in Bedrock Agent console (instruction + Action Groups for tools) | 3 days |
| Wire web_search via Lambda Action Group | 1 day |
| Configure supervisor agent with collaborators | 1 day |
| End-to-end test | 1 day |
| **Total** | **~7–10 days + AWS approval delay** |

### Cloudflare Project Think

| Step | Effort |
|---|---|
| Wait for sub-agents to GA | unknown (preview Apr 2026) |
| Then: convert each agent to a sub-agent class with prompt + AI Gateway model binding | 2 days |
| Coordinator orchestration in a Durable Object | 2 days |
| End-to-end test | 1 day |
| **Total** | **~5–6 days once GA, currently blocked** |

---

## 7. Cost Analysis

Assumes 100 Pitch Decks + 20 Full Stories per month. Token costs are LLM-side and identical across platforms (same Anthropic API prices). Platform fees are the differentiator.

### Per-Run Cost (Pitch Deck only, all-Sonnet baseline)

Today, with Sonnet-only on Managed Agents, a Pitch Deck costs roughly **$5–6/run** in tokens (Annual Reader is the heaviest, ~150K input × $3 = $0.45 plus output; multiplied across 11 agents). Optimal mixed-model stack drops this to **~$3.30/run** (see §8).

### Monthly Platform Fees at Your Volume

| Platform | Monthly fee | Notes |
|---|---|---|
| Anthropic Managed Agents | $0 (today) | Pay tokens only |
| Claude Agent SDK | $0 + hosting | ~$10–25/mo on Fly.io/Render for the runner |
| Inngest AgentKit | $0 (free tier) | 50K executions/mo covers all your runs |
| LangGraph (self-hosted) | $0 + hosting | Same as Claude Agent SDK |
| LangGraph Cloud | ~$10–20/mo | Pricing scales with run-minutes |
| AWS Bedrock MAC | ~$15–50/mo | AgentCore Runtime overhead at $0.10–0.50/run |
| Cloudflare Project Think | $0 (existing $5/mo Workers plan) | No platform premium |
| Vertex Agent Engine | $0 (free tier covers dev) | $50–100/mo at 100 runs |
| Temporal Cloud | $100/mo Essentials + actions | Heaviest |

**Verdict:** At your volume, platform fees are <$50/mo for any reasonable choice. **LLM token cost dominates and is roughly equal across platforms.** Don't pick on platform fee — pick on capability fit.

---

## 8. Model Optimization (Independent of Platform)

This section applies regardless of which orchestration platform you pick. **The core insight: 19 of 20 agents on Sonnet is a missed opportunity. Mixing models per agent saves ~40% per Pitch Deck and lifts quality on numerical and adversarial sections.**

### Why Mix Models?

Three forces make a single-model stack suboptimal:

1. **Specialization is real and benchmarked.** GPT-5 leads FinanceReasoning at **88.23%**, Claude Opus 4.6 at 87.82%. Claude Opus 4.6 leads multi-needle retrieval at 1M tokens (76% MRCR v2). Gemini 3.1 Pro tops Arena Creative Writing and abstract reasoning. No model wins everything.
2. **Cost spread is 50x.** Haiku 4.5 input: $1/M tokens. Opus 4.7 output: $25/M. A pipeline that uses Opus everywhere pays 25x for tasks Haiku does equally well (orchestration, JSON dispatch).
3. **Failure modes differ.** GPT-5.4 reportedly "refuses to fabricate" missing financial data. Gemini 3.1 Pro is *not recommended* for incomplete-data financial tasks. Claude is most transparent about limitations. For hedge-fund-grade work, this matters more than a 1-point benchmark gap.

### Pricing Reference (April 2026)

| Model | Input ($/M) | Output ($/M) | Context |
|---|---|---|---|
| Claude Opus 4.7 | $5 | $25 | 1M |
| Claude Sonnet 4.6 | $3 | $15 | 1M |
| Claude Haiku 4.5 | $1 | $5 | 200K |
| GPT-5 (standard) | $1.25 | $10 | 400K |
| GPT-5.4 short-ctx | $2.50 | $15 | — |
| GPT-5.4 long-ctx | $5.00 | $22.50 | — |
| GPT-5 mini | $0.25 | $2 | — |
| Gemini 2.5 Pro ≤200K | $1.25 | $10 | 1M |
| Gemini 2.5 Pro >200K | $2.50 | $15 | — |

Caching: ~90% off cached input on all three providers. Batch APIs: 50% off for non-realtime work.

### Recommended Per-Agent Model Assignment

| Agent | Current | Proposed Primary | Why | Fallback | Per-Run $ |
|---|---|---|---|---|---|
| coordinator-pitchdeck | Sonnet 4.6 | **Haiku 4.5** | JSON dispatch + routing, no reasoning needed | Sonnet 4.6 | ~$0.10 |
| annual-reader | Sonnet 4.6 | **Gemini 2.5 Pro** | MRCR retrieval parity with Opus at half the price >200K; 1M context handles full 10-Ks | Opus 4.7 | ~$0.45 |
| quarterly-reader | Sonnet 4.6 | **Gemini 2.5 Pro** | Same logic; 10-Q + transcripts often span 200K | Opus 4.7 | ~$0.30 |
| business-analyst-pitchdeck | Sonnet 4.6 | **Sonnet 4.6** (keep) | Best balance of long-form writing + cost | GPT-5 | ~$0.20 |
| competitor-market-position | Sonnet 4.6 | **GPT-5 (standard)** | Numerical comparison; 88% FinanceReasoning | Sonnet 4.6 | ~$0.15 |
| competitor-moats | Sonnet 4.6 | **Sonnet 4.6** (keep) | Web-search workflow; qualitative reasoning | Gemini 2.5 Pro | ~$0.20 |
| financial-analyst-pitchdeck | Sonnet 4.6 | **GPT-5.4 (short-ctx)** | Top FinanceReasoning; "won't fabricate" in 10-K tests | Opus 4.7 | ~$0.40 |
| management-evaluator-pitchdeck | Sonnet 4.6 | **GPT-5 (standard)** | Mixed numerical (comp tables) + qualitative | Sonnet 4.6 | ~$0.15 |
| risk-analyst-pitchdeck | Sonnet 4.6 | **Opus 4.7** | Best Anthropic reasoning + extended thinking + web search | GPT-5.4 xhigh | ~$0.50 |
| valuation-specialist-pitchdeck | Sonnet 4.6 | **GPT-5.4 (short-ctx)** | Highest accuracy on financial math; audit-grade | Opus 4.7 | ~$0.40 |
| synthesis-writer-pitchdeck | Sonnet 4.6 | **Opus 4.7** | Best long-form coherence with citation fidelity; 1M ctx | Sonnet 4.6 | ~$0.45 |
| **PITCH DECK TOTAL** | ~$5.50 | | | | **~$3.30** |
| risk-analyst-fullstory (Bear) | Opus 4.6 | **Opus 4.7** (already opus) | Adversarial reasoning + writing | GPT-5.4 xhigh | ~$0.40 |
| synthesis-writer-fullstory | Sonnet 4.6 | **Opus 4.7** for Judge; Sonnet for Bull/Rebuttal drafts | Final verdict needs highest reasoning | Sonnet 4.6 | ~$0.50 |

**Sonnet-only baseline: ~$5.50/Pitch Deck. Mixed stack: ~$3.30/Pitch Deck. Savings: ~40%, plus measurable quality lift on Valuation, Financial Analyst, and Risk sections.**

### The Production Parity Problem

`feedback_production_parity.md` says: don't make agent changes that won't translate to production Managed Agents.

**Today, Managed Agents only routes to Claude.** Cross-provider model assignment in `managed-agent.yaml` doesn't exist. So:

- **Safe today (Anthropic-only swaps):** Coordinator → Haiku 4.5, Risk Analyst PD → Opus 4.7, Synthesis Writer PD → Opus 4.7. These are pure config changes that work in Managed Agents and any alternative platform.
- **Cross-provider (Gemini, GPT) swaps:** Only viable if you switch off Managed Agents. **This is the strongest pragmatic argument for the migration.** If multiagent Managed Agents access lands and you want to use it, you'd need to revert these to Claude-equivalent assignments.

### Phased Rollout

1. **Phase A (no platform migration needed):** Move Coordinator to Haiku 4.5, Risk Analyst PD to Opus 4.7, Synthesis Writer PD to Opus 4.7. Measure quality vs current via Observatory. **Estimated savings: ~25% per Pitch Deck. Estimated work: 1 day.**
2. **Phase B (after platform migration):** Move long-context readers to Gemini 2.5 Pro (or stay on Opus if quality matters more than cost). Move Financial Analyst + Valuation Specialist to GPT-5.4. **Estimated savings: another ~15%. Estimated work: 1 week of A/B testing across known-verdict tickers.**
3. **Phase C (calibration):** Run cross-model eval on ~10 known-verdict companies. Use Observatory wiki to track verdict-accuracy by model assignment. Adjust based on measured outcomes, not vibes.

---

## 9. Production Patterns We're Currently Missing

Modern multi-agent stacks come with capabilities that Managed Agents either doesn't expose or that you haven't wired up yet. These are independent of platform choice (most can be added today). Worth knowing about because they raise the ceiling on what Thes1s can become.

### 9.1 Observability with replay

LangSmith, Langfuse, AgentOps, Pydantic Logfire — all let you trace every LLM call across a multi-agent run, see token counts and latency per agent, and **replay a failed run from the exact superstep that broke**. Time-travel debugging means you can rewind to any checkpoint, modify state, and re-run downstream nodes. This is the single biggest dev-velocity multiplier for multi-agent work. Your Observatory wiki is a half-step in this direction (run capture + manifest); pairing it with one of these traces gives you the full picture.

### 9.2 Structured eval harness

Your Observatory has `known-verdicts.json` and verdict-check scripts. Modern eval harnesses (LangSmith Datasets, OpenAI Evals, Promptfoo, Inspect) let you:
- Define dataset of known-verdict tickers as a fixture
- Run a candidate prompt/model assignment across the dataset in one command
- Get pass/fail + per-criterion scoring against a rubric
- Compare two configurations side-by-side with statistical significance

This is the engine for RL-style optimization that the agent optimization phase (`project_agent_optimization_phase.md`) needs.

### 9.3 Prompt versioning with measured impact

LangSmith Prompt Hub, PromptLayer, Helicone — all version your prompts as first-class artifacts and track which version produced which run output. Right now your prompts live in git, which is good, but you don't have measured-impact-per-prompt-change. With versioned prompts + datasets, you can answer: "did my Annual Reader prompt change improve verdict accuracy on 10 calibration tickers?"

### 9.4 Circuit breakers and cost guards

Helicone, Portkey, AI Gateway — sit between your code and LLM APIs and enforce:
- Per-run token budget caps (kill a runaway agent)
- Per-month cost caps (don't accidentally burn $500)
- Automatic fallback to cheaper model when primary rate-limits
- Request deduplication and caching

For a hedge-fund-grade production system, these are not optional.

### 9.5 Typed structured output validation at boundaries

You already use Zod schemas for sections — that's the right pattern. Production-grade extension: validate at every agent boundary, retry with `Schema validation failed: <error>` appended to the prompt when an agent produces malformed output. Pydantic AI's typed agents and OpenAI's strict mode (`response_format: { type: "json_schema", strict: true }`) make this enforceable at the API level.

### 9.6 Memory layer (cross-run learnings)

Mem0, Letta (formerly MemGPT), and the memory primitives in Claude Agent SDK + AgentCore Memory let agents accumulate cross-run knowledge. For Thes1s, this means: an agent that processed AAPL last quarter remembers what surprised it, what it got wrong on the verdict check, and applies those learnings to MSFT. Not a Day 1 feature, but a real long-term competitive advantage for the hedge-fund product vision.

### 9.7 A2A (Agent-to-Agent protocol)

Google's A2A protocol (with broad industry adoption including Anthropic) lets agents from different vendors talk to each other in a standardized way. Becomes important when you want Thes1s to plug into an external risk model, a third-party valuation engine, or stickeR1's portfolio context. Worth designing toward.

---

## 10. Recommended Path Forward

### Step 1 — Continue waiting on Anthropic, but set a deadline (this week)

Email Anthropic again. Set an internal deadline of April 27. If `callable_agents` access hasn't landed by then, execute Step 2.

### Step 2 — Execute Phase A model optimization NOW (this week, no platform migration)

Pure config change. Works on Managed Agents (One Pager) and any alternative.
- coordinator-pitchdeck → Haiku 4.5
- coordinator-fullstory → Haiku 4.5
- risk-analyst-pitchdeck → Opus 4.7
- synthesis-writer-pitchdeck → Opus 4.7 (final synthesis only)

Measure on the One Pager pipeline (the live one) first. Run on 5 tickers. Compare verdict + cost vs current Sonnet baseline. Decide.

### Step 3 — Migrate to Claude Agent SDK if Anthropic deadline misses (week of Apr 28)

Allocate 5 days to:
1. Stand up a long-running Node service on Fly.io or Render
2. Move prompts to `.claude/agents/` format
3. Rewrite the Pitch Deck coordinator using Task tool dispatch
4. Wire web_search via Anthropic search API or Tavily
5. End-to-end test on LULU + 2 calibration tickers
6. Wrap in Cloudflare Workflow for durable execution

This preserves production parity. When Managed Agents `callable_agents` opens, you swap the dispatcher back without touching prompts.

### Step 4 — Add observability (week 2)

Pick one: Langfuse (open source, self-host), LangSmith (free tier 5K traces/mo), or AgentOps. Wire it as a passthrough on every LLM call. **You will recoup the setup time on the first stuck pipeline run you can replay.**

### Step 5 — Run agent optimization sprint (weeks 3–4)

Now you have a platform that supports cross-provider routing. Execute Phase B:
- Move readers to Gemini 2.5 Pro (or measure parity vs Opus)
- Move Financial Analyst + Valuation Specialist to GPT-5.4
- Run on all 10 known-verdict tickers
- Use Observatory + new tracing tool to track verdict accuracy per model assignment

### Step 6 — Long-term: Cloudflare Project Think when sub-agents GA

Once Cloudflare Project Think exits preview (likely Q3/Q4 2026), revisit. Your stack already lives on Cloudflare. This is the eventual home — single vendor, Durable Objects for state, AI Gateway for multi-LLM, all on infrastructure you understand.

---

## 11. Decision Tree

```
Is Anthropic Managed Agents callable_agents access live by Apr 27?
├── YES → stay on Managed Agents. Execute Phase A (Anthropic-only model swaps). Production parity preserved.
└── NO → migrate.
    │
    Are you ok adding a 5-day engineering project this sprint?
    ├── YES → Claude Agent SDK (top pick — closest to current architecture)
    └── NO → wait. Cost of waiting = whatever the One Pager-only revenue gap is.
        │
        Once migrated, do you want cross-provider model mixing?
        ├── YES → execute Phase B (Gemini for readers, GPT-5.4 for valuation)
        └── NO → keep all-Anthropic, only Phase A optimizations
            │
            Are you also planning a long-term Cloudflare-native rebuild?
            ├── YES → Cloudflare Project Think when sub-agents GA (likely H2 2026)
            └── NO → stay on Claude Agent SDK indefinitely
```

---

## Appendix A: Quick Reference — Current Agent Inventory

### Pitch Deck (10 specialists + coordinator)

| Agent | Model | Wave | Tools |
|---|---|---|---|
| coordinator-pitchdeck | claude-sonnet-4-6 | dispatcher | callable_agents, agent_toolset |
| annual-reader | claude-sonnet-4-6 | Wave 0 (PSR) | (filesystem) |
| quarterly-reader | claude-sonnet-4-6 | Wave 0 (PSR) | (filesystem) |
| business-analyst-pitchdeck | claude-sonnet-4-6 | Wave 1 | web_search |
| competitor-evaluator-market-position-pitchdeck | claude-sonnet-4-6 | Wave 1 | web_search |
| competitor-evaluator-moats-pitchdeck | claude-sonnet-4-6 | Wave 2 | web_search |
| financial-analyst-pitchdeck | claude-sonnet-4-6 | Wave 2 | web_search |
| management-evaluator-pitchdeck | claude-sonnet-4-6 | Wave 2 | web_search |
| risk-analyst-pitchdeck | claude-sonnet-4-6 | Wave 3 | web_search |
| valuation-specialist-pitchdeck | claude-sonnet-4-6 | Wave 3 | web_search |
| synthesis-writer-pitchdeck | claude-sonnet-4-6 | Wave 4 | (synthesis only) |

### Full Story (7 specialists + coordinator)

| Agent | Model | Phase | Tools |
|---|---|---|---|
| coordinator-fullstory | claude-sonnet-4-6 | dispatcher | callable_agents, agent_toolset |
| annual-reader | claude-sonnet-4-6 | shared PSR | (filesystem) |
| quarterly-reader | claude-sonnet-4-6 | shared PSR | (filesystem) |
| risk-analyst-fullstory | **claude-opus-4-6** | Phase 1 + Bear | web_search |
| business-analyst-fullstory | claude-sonnet-4-6 | Phase 1 | web_search |
| competitor-evaluator-fullstory | claude-sonnet-4-6 | Phase 1 | web_search |
| management-evaluator-fullstory | claude-sonnet-4-6 | Phase 1 | web_search |
| valuation-specialist-fullstory | claude-sonnet-4-6 | Phase 1 | web_search |
| financial-analyst-fullstory | claude-sonnet-4-6 | Phase 2 (Judge) | (synthesis only) |
| synthesis-writer-fullstory | claude-sonnet-4-6 | Phase 2 (Bull/Rebuttal) | (synthesis only) |

---

## Appendix B: Sources

### Multi-agent frameworks
- [LangGraph multi-agent docs](https://docs.langchain.com/oss/python/langgraph/use-graph-api)
- [Inngest AgentKit overview](https://agentkit.inngest.com/overview)
- [Claude Agent SDK — Subagents](https://platform.claude.com/docs/en/agent-sdk/subagents)
- [OpenAI Agents SDK multi-agent](https://openai.github.io/openai-agents-python/multi_agent/)
- [Diagrid — Checkpoints aren't durable execution](https://www.diagrid.io/blog/checkpoints-are-not-durable-execution-why-langgraph-crewai-google-adk-and-others-fall-short-for-production-agent-workflows)

### Cloud agent platforms
- [AWS Bedrock multi-agent collaboration GA](https://aws.amazon.com/blogs/machine-learning/amazon-bedrock-announces-general-availability-of-multi-agent-collaboration/)
- [Cloudflare Project Think](https://blog.cloudflare.com/project-think/)
- [Vertex AI Agent Engine](https://docs.cloud.google.com/agent-builder/agent-engine/overview)
- [Microsoft Foundry Agent Service](https://learn.microsoft.com/en-us/azure/foundry/agents/overview)

### Durable execution
- [Temporal AI agentic workflows](https://temporal.io/blog/build-resilient-agentic-ai-with-temporal)
- [Cloudflare Workflows GA](https://blog.cloudflare.com/workflows-ga-production-ready-durable-execution/)

### Pricing
- [LangSmith pricing](https://www.langchain.com/pricing)
- [Inngest pricing](https://www.inngest.com/pricing)
- [Bedrock AgentCore pricing](https://aws.amazon.com/bedrock/agentcore/pricing/)
- [Claude API pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- [OpenAI API pricing](https://openai.com/api/pricing/)
- [Vertex AI pricing](https://cloud.google.com/vertex-ai/pricing)

### Model benchmarks (April 2026)
- [LM Council Benchmarks Apr 2026](https://lmcouncil.ai/benchmarks)
- [Patronus FinanceBench](https://docs.patronus.ai/docs/research_and_differentiators/financebench)
- [EQ-Bench Longform Creative Writing](https://eqbench.com/creative_writing_longform.html)
- [Vellum LLM Leaderboard 2026](https://www.vellum.ai/llm-leaderboard)
- [Chroma Context Rot Research](https://research.trychroma.com/context-rot)
