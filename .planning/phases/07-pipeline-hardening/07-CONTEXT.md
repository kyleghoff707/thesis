---
phase: 07
name: pipeline-hardening
status: preliminary
source: COST Pitch Deck generation debrief (2026-03-25)
created: 2026-03-25
---

# Phase 7: Pipeline Hardening — CONTEXT.md (Preliminary)

## Origin

This phase addresses ALL 42 engineering issues identified during the first production run of `/generate:pitch-deck` on COST (Costco Wholesale) on 2026-03-25.

**Source documents:**
- `.thes1s/reports/COST/pitch-deck-generation-debrief.md` — 12-question engineering debrief with root causes and recommendations
- `.thes1s/reports/COST/pitch-deck.md` — The generated report (used as quality baseline)

**Guiding principle:** Quality over everything. All 42 issues must be addressed — no shortcuts, no deferrals within this phase.

---

## Proposed Sub-phases

| Sub-phase | Name | Issues | What it builds |
|-----------|------|--------|----------------|
| **7A** | Node.js DataPacket | #1-12 | Full DataPacket population outside browser |
| **7B** | Filing Tools + PSR | #13-15 | `readFilingSection` tool for token-efficient filing access |
| **7C** | Orchestration Engine | #16-24 | `aiResearch.js` — code-driven pipeline replacing manual CC orchestration |
| **7D** | Quality Enforcement | #25-33, #40-41 | Web search + citation enforcement, timing, quality audit |
| **7E** | PM Experience | #34-39, #42 | Live progress UI, checkpoint modals, FGR confirmation |

**Execution order matters:** 7A-7B fix data foundation -> 7C automates orchestration -> 7D enforces quality -> 7E makes it visible to the PM.

---

## Full Issue Catalog (42 issues, 9 work streams)

### Work Stream 1: DataPacket / Node.js Compatibility (Debrief Q2) -> Sub-phase 7A

The DataPacket is ~40% populated when run in Node.js. The engines were designed for the browser with Vite middleware proxying. The `nodeAdapter.js` patches some things but doesn't handle DOMParser, indexedDB, or the Vite middleware endpoints.

| # | Issue | Current State | Fix |
|---|-------|--------------|-----|
| 1 | `filings` field undefined | `dataExport.js` doesn't assemble filing accession numbers | Add filings assembler: EDGAR submissions API -> accession numbers + dates + form types |
| 2 | `transcripts` count: 0 | Finnhub list gated behind premium; AV is fallback-only | Fix transcript pipeline so AV works standalone (currently gated behind Finnhub for list) |
| 3 | `prices` failed | `indexedDB is not defined` — browser-only API | Node.js-compatible price fetch (direct Yahoo Finance) |
| 4 | `insiders` failed | `DOMParser is not defined` — browser-only API | Node.js-compatible insider fetch (direct EDGAR) |
| 5 | `compensation` failed | `DOMParser is not defined` — browser-only API | Node.js-compatible compensation fetch (direct EDGAR) |
| 6 | `peers` empty array | SIC peer discovery uses Vite dev middleware | Direct EDGAR SIC browse (engine exists, needs Vite middleware bypass) |
| 7 | `peerMetrics` empty | Cascading failure from peers | Resolves when #6 is fixed |
| 8 | `analystEstimates` null | Depends on Vite middleware (Finviz scraper) | Node.js-compatible Finviz fetch |
| 9 | `currentPrice` null | Depends on prices engine (indexedDB) | Simple Yahoo Finance quote call |
| 10 | `events` likely failed | Browser APIs | Node.js-compatible events fetch |
| 11 | Balance sheet fields undefined | `total_assets`, `total_equity`, `cash_and_equivalents`, `shares_diluted` all undefined despite income working | Investigate taxonomy gap for COST specifically; may be extraction issue |
| 12 | EPS diluted undefined | Not in DataPacket | Ensure EPS flows through dataExport.js |

**Key files:** `src/engines/dataExport.js`, `src/engines/nodeAdapter.js`, all engine files that depend on browser APIs

### Work Stream 2: PSR Filing Access (Debrief Q4) -> Sub-phase 7B

PSR agents currently fetch raw HTML from EDGAR via curl. The app has `filingMarkdown.js` which converts SEC filings to clean markdown — this was never used by agents.

| # | Issue | Current State | Fix |
|---|-------|--------------|-----|
| 13 | PSR agents fetch raw HTML via curl | 100-200K+ tokens per 10-K filing | Build `readFilingSection` tool |
| 14 | No markdown conversion for agents | Agents parse raw HTML with formatting noise | Use existing `filingMarkdown.js` converter |
| 15 | No section extraction | Agents read entire filings | Tool takes accession number + section name, returns just that section as markdown |

**Key files:** `src/engines/filingMarkdown.js` (existing converter), agent configs in `agents/*/config.json` (tool definitions)

### Work Stream 3: Agent Communication & Data Flow (Debrief Q3, Q5) -> Sub-phase 7C

No agent-to-agent communication exists. No data regen pathway was triggered. Context threading was done manually by the orchestrator.

| # | Issue | Current State | Fix |
|---|-------|--------------|-----|
| 16 | No agent mechanism to request additional data | Agents adapt or use WebSearch to fill gaps | Build `requestData` tool — orchestrator catches requests, runs targeted fetches, re-injects |
| 17 | No mid-phase data enrichment protocol | Orchestrator doesn't support data regen loop | Design data gap resolution loop in aiResearch.js |
| 18 | Zero direct agent-to-agent communication | All context threading manual | Agents read prior section files from disk directly |
| 19 | Manual context threading by orchestrator | Orchestrator builds downstream prompts with summaries | Code-driven context assembly in aiResearch.js |
| 20 | Agents receive summaries instead of full prior sections | Downstream agents get compressed context | Agents read full prior section JSON files, not summary injections |

### Work Stream 4: Orchestration (Debrief Q1) -> Sub-phase 7C

~30% of wall clock time was engineering overhead: manual prompt building, config reading, DataPacket slicing, file extraction from killed agents.

| # | Issue | Current State | Fix |
|---|-------|--------------|-----|
| 21 | Orchestration overhead | Manual prompt building, config reading, DataPacket prep | Code-driven orchestration in `aiResearch.js` |
| 22 | Sequential CC orchestration | CC can only dispatch and wait serially | `aiResearch.js` dispatches parallel Claude API calls, monitors, retries |
| 23 | Agent file write permissions | Write tool denied; JSON extracted from agent transcripts | Pre-authorize write paths OR agents return JSON in response text |
| 24 | Fragile extraction from killed/hung agents | Agents completed analysis but output lost | Structured response format; retry logic; partial result recovery |

**Key file:** `src/engines/aiResearch.js` (planned but not built)

### Work Stream 5: Web Search Quality (Debrief Q10, Q12) -> Sub-phase 7D

Phase 1 agents did zero web research due to rate limits. No mechanism to verify agents execute curriculum-mandated searches.

| # | Issue | Current State | Fix |
|---|-------|--------------|-----|
| 25 | Phase 1 agents did zero web research | Rate limits prevented execution; manually regenerated without web search | Retry logic + rate limit handling in orchestrator |
| 26 | Inconsistent web searching across agents | Some agents searched extensively, others not at all | Enforce mandated search lists per agent |
| 27 | No verification mechanism for mandated searches | Agent prompts say "MUST perform" but no enforcement | Post-generation audit comparing manifest vs actual |
| 28 | Need search manifest | Curriculum search examples not machine-readable | Extract mandated searches from agent prompts into structured manifest |
| 29 | Need search logging | No record of what agents actually searched | Log each WebSearch call: agent, section, query, timestamp, resultCount |
| 30 | Need post-generation audit | No comparison of mandated vs actual searches | Audit tool reads manifest + log, flags gaps in quality report |

### Work Stream 6: Citation Quality (Debrief Q11) -> Sub-phase 7D

105 total citations across 10 sections. Web citations concentrated in only 3 agents. Business fundamentals sections light on web citations.

| # | Issue | Current State | Fix |
|---|-------|--------------|-----|
| 31 | Web citations concentrated in 3 of 9 agents | Management, risk, valuation agents searched; others didn't | Enforce minimum web citations per section |
| 32 | S1-S4 light on web citations | Business fundamentals sections lack independent web evidence | Minimum citation mix: at least 2 DataPacket + 2 filing + 2 web per section |
| 33 | No citation mix enforcement | Quality check doesn't validate citation diversity | Add citation mix check to critic.js / quality system |

### Work Stream 7: Timing & Metrics (Debrief Q9) -> Sub-phase 7D

No timing data captured during generation.

| # | Issue | Current State | Fix |
|---|-------|--------------|-----|
| 40 | No per-section timing | No startedAt/completedAt on sections | Add timestamps to section JSON output; orchestrator records dispatch/completion times |
| 41 | No overall generation timing | Report has `generatedAt` but no duration | Add `generationStartedAt` + `totalDurationMs` to report-level JSON |

### Work Stream 8: PM Progress Visibility (Debrief Q8) -> Sub-phase 7E

PM sees nothing during generation until orchestrator prints a checkpoint summary.

| # | Issue | Current State | Fix |
|---|-------|--------------|-----|
| 34 | PM blind during generation | No visibility until checkpoint | Live report viewer polling section files as they appear |
| 35 | Need live report viewer | Sections are JSON on disk, not visible in app | New component (or extend PitchDeck.jsx) that renders sections progressively |
| 36 | Need section status indicators | No visual state per section | Cards with pending -> generating -> complete states |
| 37 | Need checkpoint modals | Checkpoints are text in terminal | Modal showing verdicts, red flags, cross-cutting findings; blocks until PM approves |
| 38 | Need progress bar | No overall progress indicator | Simple: "3/10 sections complete | Phase 1 done | Generating Phase 2..." |
| 39 | Need FGR confirmation UI | FGR inputs confirmed in terminal text | Dedicated panel with 5 editable inputs; PM adjusts and confirms |

### Work Stream 9: VS Code / Runtime (Debrief Q7) -> Sub-phase 7E

| # | Issue | Current State | Fix |
|---|-------|--------------|-----|
| 42 | "Not Responding" in VS Code during heavy I/O | UI thread freezes when agents do heavy work | Resolves naturally when pipeline moves to aiResearch.js (in-app orchestration) |

---

## Decisions to Lock in `/gsd:discuss-phase 7`

These are the gray areas that need user input before planning:

1. **Node.js adapter strategy** — Duplicate engines for Node.js? Or make existing engines environment-aware (detect browser vs Node.js)?
2. **`aiResearch.js` architecture** — Single orchestrator function? Event-driven? How does it integrate with the Claude API SDK already in the project?
3. **Agent output format** — Agents return JSON in response text vs write to disk? Hybrid?
4. **`readFilingSection` tool** — CC tool (agents call it)? Or pre-processing step (orchestrator converts before dispatch)?
5. **`requestData` tool** — Real-time tool call during generation? Or a structured "needs" field in agent output that triggers a second pass?
6. **Search manifest format** — Static JSON per agent? Extracted from prompt.md at build time? Runtime extraction?
7. **Live progress architecture** — File polling? localStorage events? Something else that fits the desktop-first, no-server model?
8. **Quality report format** — Extend existing critic.js? New quality system? What does the PM see?
9. **Verification test** — Which ticker for the second production run? (Not COST, not LULU)

---

## Verification Criteria

Phase 7 is verified when:
1. A second Pitch Deck generation (different ticker) completes with all 42 issues resolved
2. DataPacket is 90%+ populated (vs ~40% on COST run)
3. PSR agents read clean markdown, not raw HTML
4. All agents perform mandated web searches (manifest audit passes)
5. Every section has minimum citation mix (2 DataPacket + 2 filing + 2 web)
6. PM can see live progress during generation
7. Per-section and overall timing captured in report JSON
8. No manual orchestration steps — `aiResearch.js` handles the full pipeline
9. Wall clock time reduced by 30%+ vs COST baseline (~60-75 min -> target ~40-50 min)
