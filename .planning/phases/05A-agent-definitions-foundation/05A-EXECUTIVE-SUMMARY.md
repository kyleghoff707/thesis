# Phase 5A: Agent Definitions & Foundation — Executive Summary

**Completed:** March 24, 2026
**Duration:** ~35 minutes (3 waves, 5 parallel agents)
**Tests:** 133 new tests, 513 total — all passing, zero regressions

---

## What This Phase Did

Phase 5A built the foundation for Thes1s's AI analyst team. Think of it like setting up a new hedge fund office before the analysts start working — you need job descriptions, data feeds, a workflow system, and report templates before anyone can write a research report.

Nothing in this phase generates reports yet. This is pure infrastructure — the contracts, plumbing, and job definitions that Phase 5C will use to run the first real analysis.

---

## What Was Built (Plain English)

### 1. Report Templates (Schemas)

Defined the exact structure every AI-generated report section must follow. Every section requires:
- A verdict (PASS / FAIL / WATCHLIST)
- Citations backing every claim (no fabricated numbers allowed)
- At least one red flag — even for bullish sections (per Rule One discipline)
- A confidence level (HIGH / MEDIUM / LOW)
- Token cost tracking (so you know what each section costs)

If an agent tries to submit a section missing citations or red flags, it gets rejected automatically by Zod validation. This is the enforcement layer that prevents AI sloppiness.

Also defined the DataPacket shape (what a company data snapshot looks like) and the progress state machine (how generation tracks where it is from start to finish).

**Files created:**
- [src/schemas/reportSection.js](src/schemas/reportSection.js) — ReportSection, Citation, Table, Chart, StageReport schemas
- [src/schemas/dataPacket.js](src/schemas/dataPacket.js) — DataPacket schema + sliceDataPacket() for per-agent filtering
- [src/schemas/progress.js](src/schemas/progress.js) — Generation state machine schema + createInitialProgress()
- [src/schemas/__tests__/reportSection.test.js](src/schemas/__tests__/reportSection.test.js) — 10 tests for schema validation + JSON Schema generation
- [src/schemas/__tests__/progress.test.js](src/schemas/__tests__/progress.test.js) — 3 tests for progress state validation

### 2. Node.js Data Bridge

All 30+ financial data engines (EDGAR, Yahoo, etc.) were built to run inside a web browser with Vite proxying API calls. But AI agents run in Node.js (command line). This bridge lets the same engines work in both places — so agents pull the exact same data the Toolbox UI shows you.

What it does:
- Maps 7 Vite proxy routes to real URLs (SEC, EDGAR, Yahoo, Finviz, Finnhub, Alpha Vantage)
- Provides linkedom as a DOMParser replacement (for HTML parsing outside browsers)
- Loads API keys from `.env.local` (not `.env` — this project only uses `.env.local`)
- Adds SEC-required User-Agent headers to all requests
- Provides file-based caching (`.thes1s/cache/`) as a localStorage replacement

**Files created:**
- [src/engines/nodeAdapter.js](src/engines/nodeAdapter.js) — 168 lines, 11 exports (IS_NODE, getEnv, isDev, resolveURL, PROXY_MAP, createDOMParser, createNodeFetch, SEC_HEADERS, cacheGet, cacheSet, ensureCacheDir)
- [src/engines/__tests__/nodeAdapter.test.js](src/engines/__tests__/nodeAdapter.test.js) — 25 tests covering all proxy routes, env loading, DOM parsing, and caching

### 3. DataPacket Assembler + Toolbox

**DataPacket** ([src/engines/dataExport.js](src/engines/dataExport.js)): A single function that calls all 20+ engines and bundles everything known about a company into one JSON snapshot. This is what gets handed to each agent as their briefing packet. Contains:
- Company info, industry classification, current price
- Full financial statements (annual + TTM)
- Growth rates, return metrics, debt metrics, free cash flow
- Key metrics, Rule One scores (moat, management, composite)
- Guru holdings, insider transactions, executive compensation
- Peer companies, peer metrics with benchmarking
- Analyst estimates, upcoming events, price history
- Transcript availability
- Industry-aware caveats (REIT FFO warnings, bank NIM guidance, insurance float notes)

Each engine call is wrapped in try/catch — if one fails, the rest still work. Partial data is better than no data.

**Toolbox** ([src/engines/toolbox.js](src/engines/toolbox.js)): 13 tools agents can use during analysis, with Claude API-compatible definitions:
1. computeMOS — Margin of Safety buy price
2. computePBT — Payback Time calculation
3. computeTenCap — Ten Cap owner earnings price
4. computeEquityBond — Buffettology Equity Bond method
5. sensitivityTable — Vary assumptions across methods
6. getMetric — Look up any metric from the DataPacket
7. getFinancialLine — Pull a specific line item across years
8. computeGrowthRates — CAGR for any metric
9. comparePeers — Compare against peer companies
10. readFilingSection — Read a 10-K/10-Q section (stub — Phase 5C)
11. getTranscriptExcerpt — Get earnings call excerpt (stub — Phase 5C)
12. fcfPerShare — FCF per share from ratio and EPS
13. yearsToPayback — Years to payback at a given price

Same calculations you see in the Valuation tab, but accessible to AI agents.

**Files created:**
- [src/engines/dataExport.js](src/engines/dataExport.js) — 302 lines, assembleDataPacket() + buildCaveats()
- [src/engines/toolbox.js](src/engines/toolbox.js) — 423 lines, TOOL_DEFINITIONS + executeTool() + createToolExecutor()
- [src/engines/__tests__/dataExport.test.js](src/engines/__tests__/dataExport.test.js) — 16 tests (caveats, schema conformance, slicing)
- [src/engines/__tests__/toolbox.test.js](src/engines/__tests__/toolbox.test.js) — 24 tests (definitions structure, executor smoke tests, error handling)

### 4. The Analyst Team (9 Agent Definitions)

Created job descriptions for all 9 agents. Each agent has a `config.json` (machine-readable contract), a `README.md` (human-readable description), and a stub `prompt.md` (placeholder for you to author via `/writing-skills`).

| Agent | Role | Sections |
|-------|------|----------|
| **data-assembler** | Builds the DataPacket (code, not AI) | Pre-processing |
| **primary-source-reader** | Reads 10-K/10-Q filings directly | Pre-processing |
| **financial-analyst** | Growth metrics, FCF, balance sheet, ROE/ROIC | OP 3-4, PD 5,7,8, FS 5 |
| **business-analyst** | Company story, meaning, moat, market position | OP 1-2, PD 1-2, FS 2-3 |
| **competitor-evaluator** | Peer benchmarking, barriers, moat validation | PD 3-4, FS 3 |
| **management-evaluator** | Leadership quality, compensation, insider activity | PD 6, FS 4 |
| **risk-analyst** | PEST risks, event analysis, bear cases | PD 9, FS 1,6 |
| **valuation-specialist** | MOS, PBT, Ten Cap, Equity Bond, FGR derivation | OP 5, PD 10, FS 5,7 |
| **synthesis-writer** | Pulls everything into final verdicts | OP 6, FS 8 |

*(OP = One Pager, PD = Pitch Deck, FS = Full Story)*

Each config specifies:
- **Model**: which Claude model to use
- **Curriculum**: which knowledge files the agent studies (e.g., financial-analyst reads `fgr.md`, `capex-cash-flow-explained.md`, `advanced-financial-analysis.md`)
- **DataPacket slice**: which parts of the data this agent sees (agents only get what they need)
- **Tools**: which Toolbox tools this agent can call
- **Sections**: which report sections this agent writes, per stage
- **Contamination boundary**: LULU examples are excluded from agent context during generation
- **Compression policy**: none — agents get full curriculum depth (no summarizing)

**Writing briefs** were also created for each agent — these are the guides you'll use when authoring the actual agent prompts via `/writing-skills`. They map curriculum files to sections, explain what data the agent receives, and describe the expected output quality.

**Files created:**

Agent directories (10 agents):
- [agents/data-assembler/](agents/data-assembler/) — [config.json](agents/data-assembler/config.json), [README.md](agents/data-assembler/README.md)
- [agents/primary-source-reader/](agents/primary-source-reader/) — [config.json](agents/primary-source-reader/config.json), [README.md](agents/primary-source-reader/README.md), [prompt.md](agents/primary-source-reader/prompt.md)
- [agents/financial-analyst/](agents/financial-analyst/) — [config.json](agents/financial-analyst/config.json), [README.md](agents/financial-analyst/README.md), [prompt.md](agents/financial-analyst/prompt.md)
- [agents/business-analyst/](agents/business-analyst/) — [config.json](agents/business-analyst/config.json), [README.md](agents/business-analyst/README.md), [prompt.md](agents/business-analyst/prompt.md)
- [agents/competitor-evaluator/](agents/competitor-evaluator/) — [config.json](agents/competitor-evaluator/config.json), [README.md](agents/competitor-evaluator/README.md), [prompt.md](agents/competitor-evaluator/prompt.md)
- [agents/management-evaluator/](agents/management-evaluator/) — [config.json](agents/management-evaluator/config.json), [README.md](agents/management-evaluator/README.md), [prompt.md](agents/management-evaluator/prompt.md)
- [agents/risk-analyst/](agents/risk-analyst/) — [config.json](agents/risk-analyst/config.json), [README.md](agents/risk-analyst/README.md), [prompt.md](agents/risk-analyst/prompt.md)
- [agents/valuation-specialist/](agents/valuation-specialist/) — [config.json](agents/valuation-specialist/config.json), [README.md](agents/valuation-specialist/README.md), [prompt.md](agents/valuation-specialist/prompt.md)
- [agents/synthesis-writer/](agents/synthesis-writer/) — [config.json](agents/synthesis-writer/config.json), [README.md](agents/synthesis-writer/README.md), [prompt.md](agents/synthesis-writer/prompt.md)
- [agents/orchestrator/](agents/orchestrator/) — [config.json](agents/orchestrator/config.json), [README.md](agents/orchestrator/README.md), [dispatch-table.json](agents/orchestrator/dispatch-table.json)

Writing briefs:
- [agents/writing-briefs/README.md](agents/writing-briefs/README.md) — Index of all briefs
- [agents/writing-briefs/primary-source-reader-brief.md](agents/writing-briefs/primary-source-reader-brief.md)
- [agents/writing-briefs/financial-analyst-brief.md](agents/writing-briefs/financial-analyst-brief.md)
- [agents/writing-briefs/business-analyst-brief.md](agents/writing-briefs/business-analyst-brief.md)
- [agents/writing-briefs/competitor-evaluator-brief.md](agents/writing-briefs/competitor-evaluator-brief.md)
- [agents/writing-briefs/management-evaluator-brief.md](agents/writing-briefs/management-evaluator-brief.md)
- [agents/writing-briefs/risk-analyst-brief.md](agents/writing-briefs/risk-analyst-brief.md)
- [agents/writing-briefs/valuation-specialist-brief.md](agents/writing-briefs/valuation-specialist-brief.md)
- [agents/writing-briefs/synthesis-writer-brief.md](agents/writing-briefs/synthesis-writer-brief.md)
- [agents/writing-briefs/orchestrator-brief.md](agents/writing-briefs/orchestrator-brief.md)

Tests:
- [agents/__tests__/agentDefinitions.test.js](agents/__tests__/agentDefinitions.test.js) — 14 structural tests (directory existence, config schema, curriculum paths, contamination boundary, compression policy, tool validity)

### 5. Orchestrator & State Persistence

**Orchestrator** ([agents/orchestrator/](agents/orchestrator/)): The dispatch table that defines exactly which agents handle which sections, in what order, for all 3 stages. This is NOT an AI agent — it's a code-driven coordinator.

- **One Pager**: data assembly -> parallel (financial + business + valuation analysts) -> synthesis writer. No checkpoints (quick screen).
- **Pitch Deck**: data assembly -> primary source reading -> 3 phases with a checkpoint after each (business fundamentals -> financial deep-dive -> risk & valuation). Includes FGR confirmation gate.
- **Full Story**: inherits pitch deck findings -> deep checklists (15pt meaning, 15pt moat, 13pt management) -> THE DEBATE (bull/bear/judge adversarial analysis) -> trading strategy + PACE plan.

The dispatch table is the master blueprint for the entire report generation pipeline.

**State Persistence** ([src/engines/progressState.js](src/engines/progressState.js)): If generation crashes mid-report, it picks up where it left off. Every completed section is saved independently to `.thes1s/reports/{TICKER}/sections/`. The state machine validates transitions — you can't jump from IDLE to WAVE_2_RUNNING (prevents corrupted state).

**Files created:**
- [agents/orchestrator/config.json](agents/orchestrator/config.json) — Section-to-agent mapping for all 3 stages + checkpoint rules
- [agents/orchestrator/dispatch-table.json](agents/orchestrator/dispatch-table.json) — Full phase breakdown with parallelism and checkpoint positions
- [agents/orchestrator/README.md](agents/orchestrator/README.md) — Documentation
- [agents/writing-briefs/orchestrator-brief.md](agents/writing-briefs/orchestrator-brief.md) — Guide for Phase 5C CC skill implementation
- [src/engines/progressState.js](src/engines/progressState.js) — 154 lines, 8 exports (createProgress, readProgress, writeProgress, updateSectionStatus, advanceState, deleteProgress, saveSectionOutput, readSectionOutput)
- [src/engines/__tests__/progressState.test.js](src/engines/__tests__/progressState.test.js) — 17 tests (round-trip persistence, state transitions, invalid transition rejection, section output caching)

---

## File Inventory — Quick Reference

### Production Code (what the app uses)

| File | Lines | What It Does |
|------|-------|-------------|
| [src/schemas/reportSection.js](src/schemas/reportSection.js) | 76 | Report section validation (Zod) |
| [src/schemas/dataPacket.js](src/schemas/dataPacket.js) | 64 | DataPacket validation + slicing |
| [src/schemas/progress.js](src/schemas/progress.js) | 58 | Generation state validation |
| [src/engines/nodeAdapter.js](src/engines/nodeAdapter.js) | 168 | Browser-to-Node.js bridge |
| [src/engines/dataExport.js](src/engines/dataExport.js) | 302 | DataPacket assembly from all engines |
| [src/engines/toolbox.js](src/engines/toolbox.js) | 423 | 13 AI-callable tools |
| [src/engines/progressState.js](src/engines/progressState.js) | 154 | State persistence + crash recovery |
| **Total** | **1,245** | |

### Tests (133 total)

| File | Tests | What It Validates |
|------|-------|-------------------|
| [src/schemas/__tests__/reportSection.test.js](src/schemas/__tests__/reportSection.test.js) | 10 | Schema validation, JSON Schema gen, backward compat |
| [src/schemas/__tests__/progress.test.js](src/schemas/__tests__/progress.test.js) | 3 | Progress state validation |
| [src/engines/__tests__/nodeAdapter.test.js](src/engines/__tests__/nodeAdapter.test.js) | 25 | URL resolution, DOM parsing, env loading, caching |
| [src/engines/__tests__/dataExport.test.js](src/engines/__tests__/dataExport.test.js) | 16 | Caveats, schema conformance, DataPacket slicing |
| [src/engines/__tests__/toolbox.test.js](src/engines/__tests__/toolbox.test.js) | 24 | Tool definitions, executor, error handling |
| [src/engines/__tests__/progressState.test.js](src/engines/__tests__/progressState.test.js) | 17 | State CRUD, transitions, section output |
| [agents/__tests__/agentDefinitions.test.js](agents/__tests__/agentDefinitions.test.js) | 14 | Agent structure, configs, curriculum, contamination |
| **Total** | **133** | |

### Agent Definitions (10 agents, 46 files)

See Section 4 above for the full list with links.

### Dependencies Added

- **zod** — Schema validation and JSON Schema generation for Claude structured outputs
- **linkedom** — Lightweight DOM implementation for Node.js (replaces browser DOMParser)
- **dotenv** — Loads API keys from `.env.local` for Node.js execution

### Config Changes

- [.gitignore](.gitignore) — Added `.thes1s/` (generation artifacts, not committed)

---

## What's Ahead

### Next Phase: 5C — CC Skill + First Analysis

This is where the agents actually **do something**. Phase 5C will:

1. **Author agent prompts** — Using the writing briefs created in 5A, you'll run `/writing-skills` sessions to write the actual prompt.md files for each agent. The briefs tell you exactly which curriculum to reference, what data the agent gets, and what quality bar to hit.

2. **Build the CC skill** — A Claude Code skill (`/generate:one-pager {TICKER}`) that orchestrates the full One Pager generation pipeline: assemble DataPacket -> dispatch agents -> collect sections -> present checkpoint -> return report.

3. **First real benchmark** — Generate a One Pager for a test ticker and compare it against the LULU One Pager benchmark. Target: 80%+ section depth match. This proves the architecture works before any UI is built.

### After That

| Phase | What | Summary |
|-------|------|---------|
| **5B** | One Pager Display | OnePager.jsx, StatusBadge.jsx, progress dashboard — view reports in the app |
| **5D** | Quality System | Citation validation, completeness scoring, confidence justification |
| **6** | Pitch Deck | Multi-agent orchestration, 10 sections, checkpoints, sensitivity tables |
| **7** | Full Story & Debate | Bull/Bear/Judge debate, scored checklists, trading strategy |
| **8** | Polish & Export | PDF export, citation system, working vs export view |

---

## Planning Artifacts

These documents capture the research, plans, and verification for Phase 5A:

| File | What |
|------|------|
| [05A-RESEARCH.md](05A-RESEARCH.md) | Technical research synthesis — architecture decisions, API patterns, code examples |
| [05A-CONTEXT.md](05A-CONTEXT.md) | Phase context from architecture plan conversion |
| [05A-VALIDATION.md](05A-VALIDATION.md) | Validation strategy |
| [05A-01-PLAN.md](05A-01-PLAN.md) | Plan: Zod schemas |
| [05A-02-PLAN.md](05A-02-PLAN.md) | Plan: Node.js data bridge |
| [05A-03-PLAN.md](05A-03-PLAN.md) | Plan: DataPacket + Toolbox |
| [05A-04-PLAN.md](05A-04-PLAN.md) | Plan: Agent definitions + writing briefs |
| [05A-05-PLAN.md](05A-05-PLAN.md) | Plan: Orchestrator + state persistence |
| [05A-01-SUMMARY.md](05A-01-SUMMARY.md) | Execution summary: schemas |
| [05A-02-SUMMARY.md](05A-02-SUMMARY.md) | Execution summary: Node adapter |
| [05A-03-SUMMARY.md](05A-03-SUMMARY.md) | Execution summary: DataPacket + Toolbox |
| [05A-04-SUMMARY.md](05A-04-SUMMARY.md) | Execution summary: Agent definitions |
| [05A-05-SUMMARY.md](05A-05-SUMMARY.md) | Execution summary: Orchestrator + state |
| [05A-VERIFICATION.md](05A-VERIFICATION.md) | Phase verification — all 13 requirements satisfied |
