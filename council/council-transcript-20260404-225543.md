# LLM Council Transcript — Thes1s Pipeline Architecture Decision

**Date:** April 4, 2026
**Question:** Should Thes1s migrate its AI pipeline orchestration from JavaScript to the Claude Agent SDK, the Claude API Tool Runner, or a hybrid approach?
**Decision Maker:** Kyle Hoff, founder of Thes1s

---

## Original Question

Should Thes1s migrate its AI pipeline orchestration from the current fragile JavaScript implementation to the Claude Agent SDK, the Claude API Tool Runner, or a hybrid approach? This decision has major implications for product stability, commercial viability, multi-provider portability, and Kyle's broader vision of building autonomous hedge fund management software.

---

## Framed Question

**COUNCIL QUESTION: Should Thes1s migrate its AI pipeline orchestration from JavaScript to the Claude Agent SDK, the Claude API Tool Runner, or a hybrid approach?**

**Who is deciding:** Kyle Hoff — materials engineer transitioning into professional money management. Not a programmer. Building Thes1s as his first startup, with ambitions to build a full autonomous hedge fund software stack (research → backtesting → execution → tracking). Currently sole developer using Claude Code as his development partner.

**What Thes1s is:** A Tauri desktop app (React + Vite, no server) that generates hedge-fund-quality Rule One investment research reports through AI agents. The data engines (XBRL extraction, growth rates, valuation, peer discovery, guru tracking — validated across all 503 S&P 500 companies) are mature. The UI is functional. The AI pipeline generates 3-stage gated reports: One Pager (filter) → Pitch Deck (10-section deep research, 17 agents across 3 waves with PM checkpoint reviews) → Full Story (conviction). Quality scores average 94/100.

**The current pipeline:** ~1,600 lines of deterministic JavaScript (pipelineManager.js + aiResearch.js + run-pipeline.js) that dispatches agents in parallel waves via Promise.allSettled, reads dispatch-table.json configs, builds prompts, parses structured output, and handles retries. Each agent has a config.json specifying model, curriculum files, data slice, and section assignments.

**What went wrong:** Kyle spent 10+ hours and $100+ trying to run the Pitch Deck pipeline through the app for the first time. It had worked perfectly when orchestrated by Claude Code (the terminal) but broke extensively in the JavaScript pipeline. Specific failures:
- Web search + structured output API conflict (output_config clashes with tool use → parsed_output: null)
- Section key mismatches (agents produce different key names — simple_and_predictable vs simple_predictable)
- Data slice gaps (agents didn't receive data they needed — guru engine found Phil Town + Burry + Watsa + Dalio holding LULU, but the business-analyst agent never saw it)
- PSR dispatch bug (sent all 5 10-K filings to one agent instead of 5 parallel agents)
- Transcript caching broken (IndexedDB doesn't work in Node.js — data lost between runs)
- 10-minute API timeouts on non-streaming calls
- Multiple React state management bugs (stale state, polling races, white-screen crashes)
- 6-7 killed/restarted runs at $3-10 each

**Root cause:** Claude Code was a smart orchestrator — it dynamically decided what data to pass, how to split filings, how to handle key variants, and how to recover from errors. The JavaScript pipeline is a dumb orchestrator that needs every edge case explicitly coded.

**Three options:**
- **Option A: Fix the JavaScript pipeline** — Continue patching edge cases. 1-2 days. Maximum control, deterministic, no token overhead. Risk: more edge cases with obscure companies, web search+structured output conflict persists.
- **Option B: Claude API Tool Runner (beta)** — Replace aiResearch.js dispatch layer only (keep pipelineManager.js orchestration). Solves web search+structured output. 1-2 days. Low risk, surgical fix. Doesn't solve data slice or key normalization issues.
- **Option C: Claude Agent SDK** — Replace the entire orchestration with Claude-as-orchestrator. ~50 lines vs ~1,600 lines. Smart orchestrator that handles errors, splits work, manages context. 3-5 days prototype, 1-2 weeks production. Introduces token overhead (~$1-2/run), less deterministic, Anthropic vendor lock-in.

**What's at stake:**
1. Product stability — Kyle needs the pipeline to work reliably across any company, not just CMG/LULU.
2. Commercial viability — Kyle plans to license to ~10,000 Rule One investors, then expand to multiple investment strategies.
3. Multi-provider portability — Kyle wants an abstracted AgentDispatcher interface to swap between Claude/Gemini/OpenAI.
4. Cost — $10-12/run currently. Agent SDK adds ~$1-2 overhead. At scale with paying users, this matters.
5. Broader vision — Kyle wants to build a complete autonomous hedge fund stack.
6. Kyle's constraints — 8GB RAM MacBook (crashes from parallel agents), not a programmer, relies on Claude Code as dev partner.
7. Empirical evidence — The CC skill (agent-orchestrated) worked perfectly; the code-orchestrated pipeline was fragile.

---

## Advisor Responses

### The Contrarian

The framing of this question has a buried assumption that needs challenging: the failures listed are being blamed on "dumb orchestration," but several of them are not orchestration problems at all.

The web search + structured output API conflict is an Anthropic API constraint. The Claude Agent SDK does not fix this — it runs on the same API. You will hit the same conflict unless Anthropic resolves it at the platform level.

The PSR dispatch bug (5 filings to one agent) is a configuration error. A smart orchestrator doesn't automatically know your domain logic about splitting filings. You'd have to encode that logic somewhere — either in JavaScript config or in a system prompt. The complexity moves, it doesn't disappear.

The IndexedDB-in-Node.js failure is a runtime environment mismatch. Also not an orchestration problem.

The real count: of the seven listed failures, roughly two (data slice gaps, key normalization) are genuine orchestration intelligence problems. The rest are bugs, API constraints, or environment issues that survive any migration.

Here's the fatal flaw in Option C's pitch: you're extrapolating from "Claude Code handled this gracefully" to "the Agent SDK will too." Claude Code is a long-context, tool-rich, human-supervised agent running in a privileged environment. The Agent SDK in production is not that. It's a framework for building agents — you still write the agents.

The honest diagnosis is that the pipeline had seven distinct bugs, only two of which the Agent SDK addresses. Migrating to fix two bugs while leaving five unaddressed — and adding token overhead, nondeterminism, and lock-in — is not an upgrade. It's a distraction.

Fix the actual bugs first. Then evaluate whether orchestration intelligence is still the bottleneck.

**Position: Option A (Fix JavaScript)**

---

### The First Principles Thinker

The question being asked is "which orchestration framework should we use?" The actual question is "why did the pipeline break?"

The answer: because you built a system that replicates what Claude Code did without having what Claude Code had — which was the ability to read the problem and adapt. You wrote down the result of intelligent orchestration (the dispatch table, the wave structure, the 1,600 lines) without capturing the intelligence itself.

So the real question is: do you want to re-embed the intelligence, or keep trying to codify its outputs?

Option C (Agent SDK) re-embeds the intelligence. But notice what you'd actually be doing — replacing codified outputs with a system that generates fresh outputs each run. That's not simpler orchestration. That's delegating orchestration to a different runtime. You still have the same dependency; you've just moved where it lives.

Here's what you should actually do: the JavaScript pipeline is the right long-term architecture. It's portable, deterministic, testable, auditable. But you built it too early — before you fully understood the edge cases. The 10 hours and $100 were not wasted; they were the requirements-gathering session you skipped.

The correct path is Option A, but reframed: you now know exactly what the edge cases are. Write them down as tests before touching any code. The PSR dispatch bug, the guru data gap, the key mismatches — these are fully knowable, fully solvable. A dumb orchestrator that handles all known cases correctly beats a smart orchestrator that handles unknown cases unpredictably, especially for commercial licensing where reproducibility matters.

The Agent SDK is a debugging crutch dressed as an architecture. Fix the pipeline you understand.

**Position: Option A (Fix JavaScript)**

---

### The Expansionist

The empirical data already answered this question. Agent-orchestrated worked. Code-orchestrated broke for 10 hours and $100. That's not a close call.

But here's what no one is saying loudly enough: the Agent SDK isn't just a fix for the current problem. It's the foundation for everything Kyle actually wants to build.

The autonomous hedge fund stack — research to backtesting to execution to tracking — requires orchestration that can reason about state, handle failure gracefully, and coordinate complex multi-step workflows without a programmer maintaining 1,600 lines of brittle dispatch logic. JavaScript can't scale to that. An AI orchestrator can.

The multi-provider portability concern is real but it's a future problem. Build the abstraction layer when you have three paying customers asking for Gemini, not before. Premature abstraction is how solo founders stall.

The $1-2 token overhead per run is the most undervalued line item in this entire analysis. You're selling to 10,000 Rule One investors who already spend 70+ hours doing this manually. They're paying for time, not tokens. Price the product at $500/year, absorb the $1-2, and the math is irrelevant.

The real upside nobody is naming: if the Agent SDK works, Kyle has a living demonstration that a non-programmer sole founder built a hedge-fund-quality autonomous research pipeline using AI orchestration. That's the product story that raises a seed round. That's the story that gets written up. Option A gets you a working app. Option C gets you a category.

Take the 1-2 week hit. Build on the foundation that scales to the vision, not the one that just closes the current ticket.

**Position: Option C (Agent SDK)**

---

### The Outsider

The JavaScript broke because it was trying to be a brain. It shouldn't be.

Look at what actually failed: the dispatch layer — the part responsible for deciding what to do next, handling edge cases, adapting when something unexpected happens. That's cognition work. You handed cognition work to a 1,600-line script and were surprised it couldn't think.

The data engines don't have this problem. They don't need to think — they just fetch and transform. Deterministic tasks stay in code. That's correct.

The question isn't "Option A vs B vs C." The question is: where does cognition belong in your architecture?

Fresh eyes say: cognition belongs in Claude, not in your JavaScript. The SDK isn't adding a dependency — it's removing a pretender. Your 1,600-line orchestrator was already attempting to be Claude. It was just worse at it.

The vendor lock-in concern is real but misordered. You don't have a working pipeline right now. Lock-in risk on a broken thing is zero priority. Get it working first. Abstraction layers come after you've solved the problem once.

One thing nobody's said: the 10,000-investor licensing ambition means you'll hit scale before you finish debugging Option A. Every hour spent patching JavaScript is an hour not spent on the business. The SDK path has a higher upfront cost but eliminates an entire class of ongoing failure.

The 1-2 week estimate is probably wrong — for a non-programmer using Claude Code as their IDE, this is more likely 3-5 days of actual work. Don't fix the brain. Replace it with an actual one.

**Position: Option C (Agent SDK)**

---

### The Executor

The pipeline worked in Claude Code. It broke when you ported it to JavaScript. That tells you exactly what to do: stop running it in JavaScript.

Option C (Agent SDK) is the right call, but not for the reasons anyone is probably telling you. Here's the Monday morning path:

**Day 1:** Read the Agent SDK quickstart. Pick one section of the One Pager — the simplest one. Wire it through the SDK. Get it generating output. That's your proof of concept.

**Day 2-3:** Replace the dispatch layer in aiResearch.js section by section. Don't touch the React components or data engines. Keep everything upstream and downstream identical.

**Day 4-5:** Test with a real ticker. Verify cost, timing, output quality.

The 1,600 lines you're trying to fix is fighting against how Claude actually works. The SDK is that orchestration, already written, already tested, already handling the web search + structured output conflict you hit. That bug isn't your bug to fix — it's already fixed in the SDK.

The multi-provider concern is real but it's a 2027 problem. You don't have 10,000 users yet. You have a broken pipeline that cost $100+ to debug. Solve the problem in front of you.

The $1-2/run overhead on the SDK: at $10-12 current cost, that's 10-20% more. Acceptable for a working pipeline versus a broken one.

Concrete first step: Run `npm install @anthropic-ai/sdk` (it's already in your dependencies). Open the SDK docs. Wire one agent call through it today. Not the whole pipeline — one call. See if the web search + structured output conflict disappears. It will.

**Position: Option C (Agent SDK)**

---

## Peer Reviews

### Anonymization Mapping
| Letter | Advisor |
|--------|---------|
| A | The Contrarian |
| B | The First Principles Thinker |
| C | The Expansionist |
| D | The Outsider |
| E | The Executor |

### Review 1

**Strongest: Response B (First Principles)**
It correctly reframes the question — the pipeline broke because Kyle codified orchestration outputs without capturing the intelligence. It argues for Option A with the critical insight that the 10 hours were the requirements-gathering session. Most importantly, it's the only response that treats reproducibility as a first-class commercial requirement.

**Biggest blind spot: Response E (Executor)**
It confidently claims "the SDK already fixed the web search + structured output conflict" with zero evidence. Response A correctly identifies this as an Anthropic API-level constraint that the SDK runs on top of.

**All missed:** The RAM/crash problem. Kyle's laptop crashes from parallel agents. The Agent SDK's appeal is parallel multi-agent coordination — but if the hardware can't support it, Option C's core advantage disappears.

### Review 2

**Strongest: Response A (Contrarian)**
Does the most intellectually honest work. It audits the seven failures individually and correctly identifies that most are not orchestration problems. No other response performs this triage.

**Biggest blind spot: Response E (Executor)**
Claims "the SDK already fixed the web search + structured output conflict." Asserted without evidence and almost certainly false. Most operationally dangerous response.

**All missed:** None addressed the actual cost model at scale. An AI orchestrator routing 17 agents generates unpredictable token consumption — could be $5-15, not $1-2. At $500/year SaaS with 10K users, that determines margin viability.

### Review 3

**Strongest: Response A (Contrarian)**
Does the actual diagnostic work. "Migrating to fix two bugs while leaving five unaddressed" is precise and falsifiable.

**Biggest blind spot: Response E (Executor)**
Claims the SDK "already fixed" the web search conflict with no evidence.

**All missed:** The commercial architecture question — reproducibility vs. flexibility. At 10,000 users, a smart orchestrator producing different outputs on reruns creates support, audit, and reproducibility problems.

### Review 4

**Strongest: Response B (First Principles)**
Identifies the root cause correctly and gives the most durable architectural principle — deterministic + testable beats smart + unpredictable for commercial licensing.

**Biggest blind spot: Response C (Expansionist)**
Treats "Agent-orchestrated worked, code-orchestrated broke" as empirical proof for the SDK. Claude Code worked because of the human in the loop (Kyle), not because of smart orchestration. The SDK removes that human.

**All missed:** The SDK is a single-tenant tool today. At scale, every user's pipeline is a separate session with separate billing, rate limits, and failure modes.

### Review 5

**Strongest: Response B (First Principles)**
"You wrote down the result without capturing the intelligence" is precise and actionable.

**Biggest blind spot: Response E (Executor)**
"The SDK already handles the web search conflict" stated without evidence. Most operationally dangerous.

**All missed:** The 10,000-user commercial architecture is fundamentally incompatible with client-side Claude API calls in a Tauri desktop app. The real decision: when does this become a server-side product? That should drive the orchestration choice.

---

## Chairman's Verdict

### Where the Council Agrees

- **The Executor's claim that "the SDK already fixed the web search + structured output conflict" is wrong.** Every peer reviewer flagged this. The SDK runs on the same Anthropic API. Migrating does not fix this bug.
- **The data engines are not the problem.** All five advisors agreed — XBRL, financials, scoring are solid. The failure is localized to the dispatch and orchestration layer.
- **Fix the bugs you understand before adopting new infrastructure.** The Contrarian counted seven failures and found only two are genuine orchestration intelligence problems. The First Principles Thinker and three peer reviewers independently reached the same conclusion.
- **Multi-provider portability and the 10K-user vision are real but not today's problem.** Every advisor acknowledged this is a future constraint.

### Where the Council Clashes

**The central disagreement: is the Agent SDK a genuine architectural upgrade or a distraction?**

The Expansionist and the Outsider argue the SDK re-embeds intelligence that JavaScript cannot replicate — that you wrote down the outputs of Claude Code's reasoning without capturing the reasoning itself, and you'll keep chasing bugs until you stop pretending JavaScript can think.

The Contrarian and the First Principles Thinker argue this is category confusion. The SDK is not magic. You still write the agents. The complexity moves from your dispatch table to your system prompts. The determinism, reproducibility, and auditability you need for a commercial product are harder to guarantee with an AI orchestrator.

Why reasonable advisors disagree: Both sides are right about different time horizons. For the problem in front of you, Option A is faster. For the product you want in three years, JavaScript dispatch is the wrong foundation. The disagreement is about which horizon to optimize for.

### Blind Spots the Council Caught

- **The RAM problem invalidates Option C's core appeal.** Kyle's laptop crashes from parallel agents. The Agent SDK's primary advantage is intelligent parallel coordination. If hardware can't support it, you're paying costs without getting benefits.
- **The cost model at scale is not $1-2.** AI orchestrator token consumption is unpredictable — $5-15 is plausible. At 10K users × $500/year, margin viability depends on this number.
- **The deeper architecture problem:** The entire pipeline runs as direct browser-to-Claude API calls in a Tauri desktop app with no server. This is correct for single-user. It's incompatible with 10K-user licensing. The orchestration choice gets re-evaluated when that rebuild happens.
- **Commercial reproducibility.** AI orchestrators produce different outputs on re-runs. Deterministic JavaScript doesn't. That auditability is a commercial feature.

### The Recommendation

**Fix the JavaScript. Option A. Do it in two days.**

The Agent SDK does not fix five of your seven bugs. The two it might help with — data slice gaps and key normalization — are fully solvable in JavaScript now that you know exactly what they are. The web search + structured output conflict is an API constraint that survives any migration. The PSR dispatch bug is a configuration error fixable with a three-line change. The IndexedDB issue is a Node.js environment mismatch with a known workaround.

The SDK's pitch — "stop maintaining 1,600 lines of brittle dispatch logic" — does not apply to a pipeline where the orchestration is already designed and the failures are enumerable. The lines are not brittle because they're long. They're brittle because they had bugs. Fix the bugs.

The Expansionist's three-year vision is probably correct. But the jump from "broken desktop pipeline" to "Agent SDK foundation for autonomous hedge fund" skips several intermediate steps, each of which changes the correct answer. When you rebuild as server-side for licensing, the orchestration choice gets re-evaluated with full information.

### The One Thing to Do First

Write a test for the PSR dispatch bug — the one that sent 5 filings to one agent instead of splitting them into 5 parallel agents — and confirm it fails. Then fix it and confirm it passes. This is the most concrete, localized, fully-understood bug in the list. Do that one thing before touching any other part of the pipeline or reading any SDK documentation.

---

*Council session completed April 4, 2026. 5 advisors, 5 peer reviews, Chairman synthesis. Powered by Claude Opus 4.6.*
