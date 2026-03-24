# Architecture Patterns

**Domain:** Multi-agent AI analyst system for investment research
**Researched:** 2026-03-24
**Confidence:** HIGH (architecture plan already validated through CEO + Eng review; patterns verified against Claude Code docs and agent SDK)

---

## Recommended Architecture

The system is a three-layer architecture with a stateful orchestrator coordinating 9 specialized agents. The layers are already partially defined in the existing architecture plan. This document refines component boundaries, data flow, and build order based on research into Claude's actual subagent/SDK capabilities and production multi-agent patterns.

```
+------------------------------------------------------------------+
|                    PRESENTATION LAYER                              |
|  OnePager.jsx | PitchDeck.jsx | FullStory.jsx | ExportView.jsx   |
|  StatusBadge | SensitivityTable | ReferenceList | DebateView      |
|  ProgressDashboard (real-time generation status)                  |
+===========================|=======================================+
                            |
                   Report Data Model (JSON in localStorage)
                            |
+===========================|=======================================+
|                    INTELLIGENCE LAYER                              |
|                                                                    |
|  +------------------------------------------------------------+  |
|  | ORCHESTRATOR (dual-mode: CC skill + aiResearch.js)          |  |
|  |   State: .thes1s/reports/{TICKER}/progress.json             |  |
|  |   Checkpoint queue: questions + findings for user            |  |
|  |   Phase sequencer: Wave 1 -> checkpoint -> Wave 2 -> ...    |  |
|  +----+---+---+---+---+---+---+---+---+---+------------------+  |
|       |   |   |   |   |   |   |   |   |                          |
|       v   v   v   v   v   v   v   v   v                          |
|  +---------+ +---------+ +---------+ +---------+ +---------+    |
|  | Agent 1 | | Agent 2 | | Agent 3 | | Agent 4 | | Agent N |    |
|  | (fresh  | | (fresh  | | (fresh  | | (fresh  | | (fresh  |    |
|  | context)| | context)| | context)| | context)| | context)|    |
|  +---------+ +---------+ +---------+ +---------+ +---------+    |
|       |           |           |           |           |           |
|       v           v           v           v           v           |
|  +------------------------------------------------------------+  |
|  | TOOLBOX (callable functions during agent execution)         |  |
|  |   getMetric() | computeMOS() | comparePeers() | ...        |  |
|  +------------------------------------------------------------+  |
|                                                                    |
|  +------------------------------------------------------------+  |
|  | QUALITY GATE (critic.js)                                    |  |
|  |   Citation validation | Completeness scoring | Confidence   |  |
|  +------------------------------------------------------------+  |
+===========================|=======================================+
                            |
                   DataPacket (canonical JSON snapshot)
                            |
+===========================|=======================================+
|                    DATA LAYER (COMPLETE - 30+ engines)             |
|  edgarFinancials | growthRates | returnMetrics | freeCashFlow     |
|  valuation | fgr | ruleOneScore | gurus | insiders | peers        |
|  peerMetrics | compensation | transcripts | companyEvents         |
|  analystEstimates | filingMarkdown | prices | batchQuotes         |
+------------------------------------------------------------------+
```

### Why This Structure

1. **Data Layer is complete and validated.** 30+ engines, 503 S&P 500 companies, 173 tests. Agents never fetch their own financial data -- they consume structured DataPackets.

2. **Intelligence Layer uses a dual-mode orchestrator.** Phase A uses Claude Code subagents (free, conversational, immediate). Phase B uses the Claude API via `aiResearch.js` (commercial, automated, button-triggered). Same agent prompts, same schemas, same quality checks. The orchestrator abstracts which runtime is active.

3. **Presentation Layer is pure rendering.** No AI logic. Reads the report data model from localStorage and displays it. Status badges, section renderers, approval gates, export views.

---

## Component Boundaries

### Data Layer Components

| Component | Responsibility | Communicates With | Notes |
|-----------|---------------|-------------------|-------|
| `dataExport.js` | Assembles DataPacket from all engines | All 30+ engines -> Orchestrator | NEW. Pure code, no AI. Single function: `assembleDataPacket(ticker)` -> JSON |
| `src/engines/*.js` | Individual data fetchers/calculators | External APIs -> cacheStore -> dataExport | EXISTING. No changes needed |
| `cacheStore.js` | IndexedDB persistence for engine output | Engines <-> IndexedDB | EXISTING. May need new stores for agent output caching |

**Boundary rule:** Data Layer components never call AI APIs. They fetch, compute, cache, and export structured data.

### Intelligence Layer Components

| Component | Responsibility | Communicates With | Notes |
|-----------|---------------|-------------------|-------|
| `orchestrator` (CC skill or `aiResearch.js`) | Dispatches agents, manages phases/checkpoints, collects results, assembles final report | dataExport -> agents -> quality gate -> report model | NEW. The brain. Two implementations (CC mode and API mode) sharing config |
| `agents/*.md` (9 roles) | Prompt definitions + config per agent role | Orchestrator dispatches, agent reads DataPacket slice + curriculum | NEW. Markdown files with YAML frontmatter (CC mode) or prompt templates (API mode) |
| `toolbox.js` | Callable functions agents invoke during generation | Agents call -> engines compute -> results returned | NEW. Wraps engine functions as tool_use definitions for Claude API, or as bash scripts for CC mode |
| `critic.js` | Post-generation quality validation | Orchestrator -> critic -> pass/fail per section | NEW. Citation resolution, completeness checks, confidence validation |
| `contextBudget.js` | Token counting and budget management | Orchestrator queries before dispatching | NEW. Estimates token cost of DataPacket slices + curriculum per agent |
| `progress.json` | Persistent state for generation progress | Orchestrator reads/writes, UI polls | NEW. File-based state at `.thes1s/reports/{TICKER}/progress.json` |

**Boundary rule:** Intelligence Layer components never render UI. They produce structured JSON (report sections) and persist state. They call Data Layer for computation but never fetch external data directly.

### Presentation Layer Components

| Component | Responsibility | Communicates With | Notes |
|-----------|---------------|-------------------|-------|
| `OnePager.jsx` | Renders Stage 1 (6 sections) | Reads report model from localStorage | NEW |
| `PitchDeck.jsx` | Renders Stage 2 (10 sections) | Reads report model, contains section sub-components | NEW |
| `FullStory.jsx` | Renders Stage 3 (8 sections + debate) | Reads report model, scored checklists | NEW |
| `StatusBadge.jsx` | Section-level PASS/FAIL/REVIEW badges | Reads section.status from report model | NEW |
| `SectionRenderer.jsx` | Reusable section display with citations | Report section JSON -> formatted HTML | NEW |
| `ProgressDashboard.jsx` | Real-time generation status | Polls progress.json or subscribes to events | NEW |
| `SensitivityTable.jsx` | Valuation matrix display | Reads sensitivity data from report section | NEW |
| `ExportView.jsx` | Branded PDF/print view | Reads complete report model | NEW |
| `ReferenceList.jsx` | Citation manager (40+ refs) | Reads citations across all sections | NEW |

**Boundary rule:** Presentation Layer components never call AI APIs or compute financial metrics. They render what is in the report data model. If a component needs computed data, it calls Data Layer engines, not Intelligence Layer.

---

## Data Flow

### Generation Flow (Happy Path)

```
User triggers "/generate:pitch-deck COST"
    |
    v
[1] ORCHESTRATOR reads dispatch table for Stage 2
    |
    v
[2] DATA ASSEMBLER (no AI) calls dataExport.js
    |-- edgarFinancials.fetchCompanyData("COST")
    |-- growthRates.calculate(financials)
    |-- returnMetrics.calculate(financials)
    |-- freeCashFlow.calculate(financials)
    |-- prices.getHistory("COST")
    |-- gurus.findGurusOwning("COST")
    |-- insiders.fetchActivity("COST")
    |-- ... (all engines)
    |
    v
    DataPacket.json (~50-100KB structured JSON)
    |
    v
[3] PRIMARY SOURCE READER (Opus, first agent, sequential)
    |-- Reads latest 10-K (filingMarkdown)
    |-- Reads recent transcripts
    |-- Cross-checks DataPacket financials against 10-K text
    |-- Extracts management promises
    |-- Output: primarySourceInsights.json
    |
    v
[4] WAVE 1 (parallel agents, each gets fresh context)
    |
    |-- business-analyst: Sections 1-2 (Radar, Simple & Predictable)
    |     Context: DataPacket.companyInfo + curriculum(pitch-deck-I.md, sections 1-3)
    |     Tools: web search
    |
    |-- competitor-evaluator: Section 3 (Dominant Market Position)
    |     Context: DataPacket.peers + DataPacket.peerMetrics + curriculum(pitch-deck-I.md dominance)
    |     Tools: comparePeers(), web search
    |
    v
    Wave 1 Results (3 section JSONs)
    |
    v
[5] CHECKPOINT 1: Orchestrator presents to user
    |-- Findings from Sections 1-3
    |-- Data gaps identified
    |-- Questions needing user input
    |-- User responds: answers / corrections / "proceed"
    |
    v
[6] WAVE 2 (parallel/sequential agents, inherits Wave 1 summaries)
    |
    |-- competitor-evaluator: Section 4 (Barriers & Moats)
    |     Context: DataPacket + Wave 1 Section 3 summary + curriculum(pitch-deck-II.md barriers)
    |
    |-- financial-analyst: Section 5 (FCF)
    |     Context: DataPacket.fcf + DataPacket.financials + curriculum(capex-cash-flow-explained.md)
    |     Tools: getFinancialLine(), computeGrowthRates()
    |
    |-- management-evaluator: Section 6 (Management)
    |     Context: DataPacket.compensation + DataPacket.insiders + primarySourceInsights
    |     Tools: web search
    |
    |-- financial-analyst: Sections 7-8 (Returns & Debt, Balance Sheet)
    |     Context: DataPacket.returnMetrics + DataPacket.debtMetrics + DataPacket.financials
    |     Tools: getMetric(), comparePeers()
    |
    v
    Wave 2 Results (5 section JSONs)
    |
    v
[7] CHECKPOINT 2: Present Wave 2 + accumulated findings
    |
    v
[8] WAVE 3 (needs full context from Waves 1-2)
    |
    |-- risk-analyst: Section 9 (PEST Risks)
    |     Context: All prior section summaries + DataPacket + curriculum(pitch-deck-III.md)
    |     Tools: web search
    |
    |-- valuation-specialist: Section 10 (Valuation)
    |     Context: DataPacket.growthRates + DataPacket.analystEstimates + all prior summaries
    |     Tools: computeMOS(), computePBT(), computeTenCap(), computeEquityBond(), sensitivityTable()
    |     Sub-workflow: FGR derivation (5 inputs, user confirmation required)
    |
    v
[9] CHECKPOINT 3: FGR confirmation + valuation review
    |
    v
[10] SYNTHESIS WRITER (sequential, needs everything)
     Context: All 10 section outputs + DataPacket summary
     Output: Final polish pass, cross-references, overall verdict
     |
     v
[11] QUALITY GATE (critic.js, no AI)
     |-- Validate all citations resolve to DataPacket paths
     |-- Check completeness (all required fields populated)
     |-- Verify confidence levels justified by data coverage
     |-- Check red flags present in every section
     |
     v
[12] REPORT ASSEMBLY
     |-- Merge all section JSONs into complete report
     |-- Write to localStorage (report data model)
     |-- UI re-renders from updated model
```

### Inter-Agent Communication Pattern

Agents do NOT communicate directly. The orchestrator mediates all information flow.

```
UPSTREAM AGENT                    ORCHESTRATOR                  DOWNSTREAM AGENT
     |                                |                              |
     |-- section JSON result -------->|                              |
     |                                |-- extracts "summary" field --|
     |                                |-- appends to context ------->|
     |                                |                              |
```

Each section JSON includes a `summary` field (1-2 sentences) specifically designed for downstream consumption. Downstream agents receive:
1. Their slice of the DataPacket (not the full thing)
2. Summaries from upstream agents (not full narratives)
3. Their specific curriculum references
4. Their Toolbox tool definitions

This keeps each agent's context focused. The Financial Analyst generating Section 7 does not need to read the Business Analyst's full 2,000-word Section 1 narrative -- it gets "COST operates a membership warehouse model with 98% domestic member renewal rates and 73% Executive tier penetration [Section 1 summary]."

### Checkpoint Data Flow

```
ORCHESTRATOR -> presents to UI:
{
  phase: 2,
  completedSections: [
    { key: "barriers_moats", title: "Barriers & Moats", confidence: "HIGH",
      summary: "...", verdict: "PASS" },
    ...
  ],
  dataGaps: [
    { field: "maintenance_capex_breakdown", source: "10-K not available",
      suggestion: "Can you provide COST's 10-K maintenance capex discussion?" }
  ],
  questions: [
    { id: "q1", question: "Conflicting market size: IBISWorld says $X, Statista says $Y. Which to trust?",
      options: ["IBISWorld", "Statista", "Average both", "Skip this data point"] }
  ],
  escalations: [
    { type: "paywalled_data", description: "Could not access Costco's investor day transcript (behind login)",
      action: "Can you paste the relevant section?" }
  ]
}

USER -> responds:
{
  answers: { q1: "IBISWorld" },
  corrections: [{ section: "barriers_moats", field: "moat_type", value: "Low-cost provider, not switching costs" }],
  pastedData: [{ key: "investor_day_transcript", content: "..." }],
  proceed: true
}
```

---

## Agent Architecture Details

### Agent Definition Structure

Each agent lives in `agents/{role}/` with two files:

```
agents/financial-analyst/
  prompt.md      -- System prompt (Markdown, full curriculum depth)
  config.json    -- Machine-readable config
```

**config.json:**
```json
{
  "model": "sonnet",
  "curriculum": [
    "knowledge/research-references/advanced-financial-analysis.md",
    "knowledge/research-references/fgr.md",
    "knowledge/research-references/capex-cash-flow-explained.md"
  ],
  "dataPacketSlice": ["financials", "ttm", "growthRates", "returnMetrics", "debtMetrics", "fcf", "keyMetrics"],
  "tools": ["getMetric", "getFinancialLine", "computeGrowthRates", "computeMOS", "computePBT", "computeTenCap", "computeEquityBond", "sensitivityTable", "comparePeers"],
  "universalContext": true,
  "sections": {
    "pitchDeck": [5, 7, 8],
    "fullStory": [5]
  }
}
```

**prompt.md:**
```markdown
---
name: financial-analyst
description: Analyze financial metrics, growth rates, returns, FCF, and balance sheet strength for investment research. Use for quantitative financial analysis.
tools: Read, Grep, Glob, Bash
model: sonnet
---

You are a Financial Analyst on an investment research team...
[Full curriculum injected here]
[Rule One fundamentals + 7 Operating Rules appended]
```

### CC Mode vs API Mode

The same agent definitions serve both deployment paths:

| Aspect | CC Mode (Claude Code) | API Mode (aiResearch.js) |
|--------|----------------------|--------------------------|
| Runtime | Claude Code subagents | Claude API `messages.create()` |
| Agent definition | `agents/{role}/prompt.md` (Markdown + frontmatter) | Same prompt.md content used as system prompt |
| Tool execution | Bash scripts wrapping engine functions | `tool_use` definitions in API request |
| Context passing | Agent tool prompt string | System prompt + user message |
| Structured output | Agent returns final text, orchestrator parses | `output_config.format` with JSON schema (guaranteed) |
| Parallelism | Multiple subagents via Agent tool | `Promise.all()` on parallel API calls |
| Cost | Free (Pro subscription) | ~$2-12 per pipeline |
| Checkpoint | Conversational (user types response) | UI modal (user clicks/types) |

**Key insight from research:** Claude's structured outputs (via `output_config.format` with JSON schema) now provide **guaranteed** schema compliance through constrained decoding -- not just prompting. This eliminates the fragile JSON parsing problem identified in the Eng Review (KDD #20). Available on Opus 4.6, Sonnet 4.6, Sonnet 4.5, Opus 4.5, Haiku 4.5.

For CC mode, the subagent's final message is the only thing that returns to the parent. Include output format instructions in the prompt and validate with `critic.js` post-hoc.

### Toolbox Tool Implementation

In CC mode, Toolbox tools are bash scripts that invoke engine functions via Node.js:

```bash
# tools/computeMOS.sh
#!/bin/bash
node -e "
  const { computeMOS } = require('./src/engines/valuation.js');
  const result = computeMOS($1, $2, $3, $4);
  console.log(JSON.stringify(result));
"
```

In API mode, Toolbox tools are `tool_use` definitions:

```json
{
  "name": "computeMOS",
  "description": "Compute Margin of Safety buy price. Returns sticker price and buy price.",
  "strict": true,
  "input_schema": {
    "type": "object",
    "properties": {
      "fgr": { "type": "number", "description": "Future Growth Rate (%)" },
      "eps": { "type": "number", "description": "Current EPS (TTM or 3yr avg)" },
      "futurePE": { "type": "number", "description": "Future P/E ratio" },
      "marr": { "type": "number", "description": "Minimum Acceptable Rate of Return (%)" }
    },
    "required": ["fgr", "eps", "futurePE", "marr"],
    "additionalProperties": false
  }
}
```

The orchestrator handles tool execution: receives the tool_use request from Claude, calls the actual engine function, returns the result.

### Node.js Data Bridge

The existing engines run in the browser (Vite + React). CC subagents and future backend need Node.js access. The data bridge (`dataExport.js` + Node adapter) is ~500-800 LOC that swaps browser APIs for Node equivalents:

| Browser API | Node.js Equivalent |
|-------------|-------------------|
| `fetch()` with Vite proxy | `node-fetch` with direct URLs + User-Agent header |
| `localStorage` | `fs.readFileSync` / `fs.writeFileSync` on JSON files |
| `IndexedDB` via `cacheStore.js` | `better-sqlite3` or flat JSON files |
| `DOMParser` for XML | `jsdom` or `fast-xml-parser` |
| `import.meta.env.DEV` | Always false (production mode) |

This bridge is foundational -- it serves CC skills now AND the future commercial backend.

---

## State Persistence

### Progress State Machine

```
           IDLE
            |
            v
    DATA_ASSEMBLY (collecting DataPacket)
            |
            v
    PRIMARY_SOURCE_READING (10-K, transcripts)
            |
            v
    WAVE_1_RUNNING (parallel agents active)
            |
            v
    CHECKPOINT_1 (waiting for user)
            |
            v
    WAVE_2_RUNNING
            |
            v
    CHECKPOINT_2
            |
            v
    WAVE_3_RUNNING
            |
            v
    CHECKPOINT_3 (FGR confirmation)
            |
            v
    SYNTHESIS (final writer pass)
            |
            v
    QUALITY_CHECK (critic.js validation)
            |
            v
    COMPLETE (report assembled)
```

**progress.json:**
```json
{
  "ticker": "COST",
  "stage": "pitchDeck",
  "state": "CHECKPOINT_2",
  "startedAt": "2026-03-24T10:00:00Z",
  "lastUpdated": "2026-03-24T10:12:00Z",
  "sections": {
    "radar": { "status": "complete", "agentId": "...", "tokenCost": { "input": 12000, "output": 3500 } },
    "simple_predictable": { "status": "complete", "agentId": "..." },
    "market_position": { "status": "complete", "agentId": "..." },
    "barriers_moats": { "status": "complete", "agentId": "..." },
    "fcf": { "status": "running", "agentId": "..." },
    "management": { "status": "pending" },
    "roe_roic_debt": { "status": "pending" },
    "balance_sheet": { "status": "pending" },
    "pest": { "status": "pending" },
    "valuation": { "status": "pending" }
  },
  "checkpoints": [
    { "phase": 1, "status": "approved", "userInput": { ... }, "timestamp": "..." },
    { "phase": 2, "status": "waiting", "findings": { ... }, "questions": [...] }
  ],
  "errors": [],
  "totalCost": { "input": 45000, "output": 12000 }
}
```

**Recovery semantics:** If the process crashes mid-wave, the orchestrator reads `progress.json` on restart, finds which sections are `complete` vs `running` vs `pending`, and resumes from the last incomplete section. Complete sections are never regenerated unless explicitly requested.

### Session Boundary Handling

In CC mode, conversation context is lost between sessions. The progress.json file bridges this gap:
- On session start: orchestrator reads progress.json, reconstructs state
- During generation: orchestrator writes progress.json after each section completes
- On session end: all complete section outputs are in `.thes1s/reports/{TICKER}/sections/`

In API mode, the orchestrator in `aiResearch.js` holds state in memory during a generation run. progress.json is written for crash recovery and UI polling.

---

## Error Recovery

### Three-Tier Error Handling

```
AGENT FAILURE
    |
    v
[Tier 1] AUTOMATIC RETRY
    Agent output fails schema validation or critic.js rejects
    -> Retry once with error context appended to prompt
    -> Include the specific validation failure in retry prompt
    |
    v (still fails)
[Tier 2] ORCHESTRATOR INTERVENTION
    -> Try alternative model (Sonnet -> Opus upgrade for that section)
    -> Try simplified prompt (reduce curriculum, increase DataPacket specificity)
    -> Flag section as LOW confidence and continue
    |
    v (still fails)
[Tier 3] USER ESCALATION
    -> Present error to user at next checkpoint
    -> "Section 5 (FCF) failed to generate after 2 attempts.
        Error: [specific issue]. Options: retry, skip, provide manual input"
    -> User decides: retry with guidance, skip section, or write it themselves
```

### Garbage Output Detection

| Check | What It Catches | Implementation |
|-------|----------------|----------------|
| JSON schema validation | Malformed output, missing required fields | `output_config.format` (API mode) or `critic.js` (CC mode) |
| Citation resolution | References to nonexistent DataPacket fields | `critic.js` validates every `dataRef` against actual DataPacket |
| Hallucination guard | Numbers not in DataPacket cited as facts | Compare all numeric claims against DataPacket values |
| Completeness check | Sections with placeholder text or skipped requirements | Check narrative length, required subsections, verdict present |
| Confidence justification | HIGH confidence with missing data | Cross-reference confidence level against data coverage |
| Red flag requirement | Sections with zero red flags (unrealistic) | Every section must identify at least one concern |

### Partial Failure Handling

The system must tolerate partial generation. If 8 of 10 sections succeed:
1. Complete sections are saved and rendered
2. Failed sections show error state in UI
3. User can regenerate individual sections
4. Overall stage remains "in progress" until all sections pass quality gate

---

## Patterns to Follow

### Pattern 1: Context Window Budgeting

Each agent has a context budget. The orchestrator computes the budget before dispatch:

```
Total context capacity: ~200K tokens (Sonnet) or ~1M tokens (Opus)

Budget allocation per agent:
  System prompt (agent prompt.md):      ~2,000-5,000 tokens
  Universal context (R1 fundamentals):  ~3,000 tokens
  Curriculum (role-specific):           ~5,000-15,000 tokens
  DataPacket slice:                     ~5,000-20,000 tokens
  Upstream summaries:                   ~1,000-3,000 tokens
  Toolbox tool definitions:             ~2,000 tokens
  Primary source insights:              ~2,000-5,000 tokens
  ---
  Total input per agent:                ~20,000-53,000 tokens

  Reserved for output:                  ~4,000-8,000 tokens
```

This means each agent uses 25K-60K tokens total -- well within Sonnet's 200K capacity. The Primary Source Reader is the exception: processing a full 10-K (~200K+ tokens) requires Opus with its 1M context window.

**Rule:** `contextBudget.js` estimates token count for each agent's full input before dispatch. If over budget, it trims the DataPacket slice (least-relevant fields first), then warns the orchestrator.

### Pattern 2: DataPacket Slicing

Not every agent needs the full DataPacket. Slicing reduces token waste and keeps agents focused:

| Agent | DataPacket Slice | Excluded |
|-------|-----------------|----------|
| Financial Analyst | financials, ttm, growthRates, returnMetrics, debtMetrics, fcf, keyMetrics | gurus, insiders, compensation, events |
| Business Analyst | companyInfo, classification, ruleOneScore, peers (names only) | financials (detailed), keyMetrics |
| Competitor Evaluator | peers, peerMetrics, classification | financials (own company detailed), gurus, insiders |
| Management Evaluator | compensation, insiders, gurus | financials (detailed), peers, peerMetrics |
| Risk Analyst | companyInfo, events, analystEstimates, classification | financials (detailed) |
| Valuation Specialist | growthRates, returnMetrics, fcf, analystEstimates, ttm, currentPrice | gurus, insiders, compensation |
| Synthesis Writer | ALL section summaries (not DataPacket directly) | Raw DataPacket |

### Pattern 3: Section-Level Granularity

Every section is independently generated, cached, and regenerable. The report data model enforces this:

```json
{
  "key": "fcf",
  "title": "Free Cash Flow",
  "sectionNumber": 5,
  "status": "pass",
  "confidence": "HIGH",
  "verdict": "PASS",
  "verdictRationale": "FCF margins expanding, capex under control...",
  "summary": "COST generates $6.2B FCF with 30% capex ratio...",
  "data": { "fcfYearly": [...], "capexRatio": 0.30, "fcfCAGR5yr": 12.1 },
  "narrative": "...",
  "citations": [
    { "id": 1, "ref": "EDGAR-fcf-2024", "text": "FCF of $6.2B in FY2024", "source": "DataPacket" },
    { "id": 2, "ref": "10K-capex-discussion", "text": "Management guides...", "source": "10-K FY2024 p.34" }
  ],
  "tables": [...],
  "charts": [...],
  "redFlags": ["FCF growth decelerating from 18% to 12% CAGR over 3yr window"],
  "primarySourceInsights": ["10-K confirms $3.2B capex plan for warehouse expansion"],
  "generatedAt": "2026-03-24T10:08:00Z",
  "modelUsed": "claude-sonnet-4-6",
  "tokenCost": { "input": 28000, "output": 4200 }
}
```

### Pattern 4: Retry-Then-Escalate

From the architecture plan (KDD #19), adapted with specific implementation:

```
Agent dispatched
    |
    v
Agent returns output
    |
    v
critic.js validates
    |
    +-- PASS -> save section, continue
    |
    +-- FAIL (validation error)
         |
         v
    Retry with error context:
    "Your previous output failed validation: [specific error].
     Please fix: [what to change]. Keep all other content."
         |
         v
    critic.js validates retry
         |
         +-- PASS -> save section, continue
         |
         +-- FAIL -> escalate
              |
              v
         Model upgrade (Sonnet -> Opus) OR
         Flag as LOW confidence and present at checkpoint
```

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Monolithic Context
**What:** Loading the full DataPacket + all curriculum + all prior sections into every agent.
**Why bad:** Context pollution degrades output quality. Agents produce vague, unfocused analysis when overwhelmed with irrelevant data.
**Instead:** Slice DataPacket per agent role. Pass upstream section summaries (1-2 sentences each), not full narratives. Each agent gets only what it needs.

### Anti-Pattern 2: Agent-to-Agent Direct Communication
**What:** Having agents pass messages directly to each other.
**Why bad:** Creates invisible dependencies, makes debugging impossible, breaks the orchestrator's ability to checkpoint and persist state.
**Instead:** All communication goes through the orchestrator. Upstream agent -> orchestrator (stores result) -> orchestrator (extracts summary) -> downstream agent prompt.

### Anti-Pattern 3: Shared Mutable State
**What:** Multiple agents writing to the same report object concurrently.
**Why bad:** Race conditions, partial writes, inconsistent state.
**Instead:** Each agent returns an immutable section JSON. The orchestrator is the only writer to the report data model, assembling sections sequentially after each wave completes.

### Anti-Pattern 4: Skipping Quality Gate
**What:** Writing agent output directly to the report without validation.
**Why bad:** Hallucinated citations, missing required fields, unjustified confidence levels.
**Instead:** Every section passes through `critic.js` before being written to the report. Quality gate is non-negotiable.

### Anti-Pattern 5: Re-running Complete Sections on Failure
**What:** When one section in a wave fails, re-running the entire wave.
**Why bad:** Wastes tokens/money, introduces non-determinism in previously-good sections.
**Instead:** Section-level granularity. Only the failed section gets retried. Progress.json tracks per-section status.

---

## Scalability Considerations

| Concern | Single User (Now) | Multi-User (Future) | Notes |
|---------|-------------------|---------------------|-------|
| State storage | localStorage + files | Database (Postgres) | Report data model is JSON -- serializes to either |
| Agent dispatch | CC subagents OR sequential API calls | Parallel API calls with queue | Queue prevents API rate limits |
| Cost tracking | progress.json token counts | Per-user billing records | Token accounting already in section schema |
| Concurrent reports | One at a time | Queue per user | Orchestrator state is per-ticker, naturally isolated |
| DataPacket assembly | On-demand per request | Cache with TTL | DataPacket is deterministic for same data -- cache aggressively |

---

## Suggested Build Order (Dependencies)

The build order follows from component dependencies. You cannot test agents without data to feed them, and you cannot render reports without sections to display.

```
PHASE 5A: Foundation (no dependencies)
   |
   |-- [1] dataExport.js (Data Layer bridge)
   |     Depends on: existing engines (all complete)
   |     Produces: DataPacket JSON
   |     Test: unit test with known ticker, compare to engine output
   |
   |-- [2] Report JSON schema definition
   |     Depends on: nothing (design artifact)
   |     Produces: schema file + CLAUDE.md documentation
   |
   |-- [3] Agent prompt definitions (agents/ directory)
   |     Depends on: knowledge base (complete), DataPacket schema (#2)
   |     Produces: 9 agent folders with prompt.md + config.json
   |
   v
PHASE 5C: First Real Output (depends on 5A)
   |
   |-- [4] CC skill for /generate:one-pager
   |     Depends on: dataExport.js (#1), agent prompts (#3), report schema (#2)
   |     Produces: One Pager JSON for a real ticker
   |     Test: generate LULU One Pager, compare to example quality
   |
   v
PHASE 5B: Display Components (depends on 5A schema)
   |
   |-- [5] OnePager.jsx + StatusBadge.jsx + SectionRenderer.jsx
   |     Depends on: report schema (#2)
   |     Produces: renderable Stage 1 UI
   |     Can be built in parallel with 5C
   |
   v
PHASE 5D: Quality System (depends on 5C output to validate)
   |
   |-- [6] critic.js (citation validation, completeness scoring)
   |     Depends on: report schema (#2), real agent output (#4)
   |     Test: unit test with known-good and known-bad sections
   |
   |-- [7] contextBudget.js (token estimation)
   |     Depends on: agent configs (#3), DataPacket shape (#1)
   |
   v
PHASE 6: Pitch Deck (depends on all Phase 5)
   |
   |-- [8] Toolbox tool wrappers (toolbox.js)
   |     Depends on: existing engine functions
   |     Produces: callable tools for agents
   |
   |-- [9] Orchestrator with wave dispatch + checkpoints
   |     Depends on: all Phase 5 components
   |     This is the most complex new component
   |
   |-- [10] PitchDeck.jsx + 10 section sub-components
   |     Depends on: SectionRenderer (#5), report schema (#2)
   |
   |-- [11] SensitivityTable.jsx
   |     Depends on: valuation engine (complete)
   |
   v
PHASE 7: Full Story + Debate (depends on Phase 6)
   |
   |-- [12] debate.js (Bull/Bear/Judge orchestration)
   |     Depends on: orchestrator (#9), agent prompts (#3)
   |
   |-- [13] FullStory.jsx + scored checklists
   |     Depends on: SectionRenderer (#5), report schema (#2)
   |
   v
PHASE 8: Polish + Export (depends on Phases 6-7)
   |
   |-- [14] ExportView.jsx (PDF rendering)
   |-- [15] ReferenceList.jsx (citation manager)
   |-- [16] aiResearch.js (API mode -- migrates CC patterns to automated)
```

**Critical path:** dataExport.js (#1) -> agent prompts (#3) -> CC skill (#4). Everything else can proceed in parallel once these three are done. The fastest path to seeing real AI output is 3-5 days (5A + 5C).

---

## Sources

- [Claude Code Subagents Documentation](https://code.claude.com/docs/en/sub-agents) -- Official docs on creating, configuring, and managing subagents. HIGH confidence.
- [Claude Agent SDK Subagents](https://platform.claude.com/docs/en/agent-sdk/subagents) -- Programmatic subagent creation for API-driven mode. HIGH confidence.
- [Claude Structured Outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs) -- JSON schema enforcement via constrained decoding. Supported on Opus 4.6, Sonnet 4.6, Sonnet 4.5, Opus 4.5, Haiku 4.5. HIGH confidence.
- [Claude Code Agent Teams](https://claudefa.st/blog/guide/agents/agent-teams) -- Multi-session coordination patterns. MEDIUM confidence (third-party guide).
- [Claude Code Sub-Agent Best Practices](https://claudefa.st/blog/guide/agents/sub-agent-best-practices) -- Parallel vs sequential patterns. MEDIUM confidence (third-party guide).
- [Multi-Agent Report Assembly Research](https://www.mdpi.com/2076-3417/15/21/11619) -- Academic research on multi-agent report generation with coherence mechanisms. MEDIUM confidence.
- [LLM Agent Error Recovery Strategies](https://www.newline.co/@zaoyang/5-recovery-strategies-for-multi-agent-llm-failures--673fe4c4) -- Recovery patterns for multi-agent failures. MEDIUM confidence.
- [Agentic Workflow Architectures 2026](https://www.stackai.com/blog/the-2026-guide-to-agentic-workflow-architectures) -- Checkpoint and state management patterns. MEDIUM confidence.
- [Human-in-the-Loop Best Practices](https://www.permit.io/blog/human-in-the-loop-for-ai-agents-best-practices-frameworks-use-cases-and-demo) -- Checkpoint design for production agentic systems. MEDIUM confidence.
- Existing project documents: `gstack/plans/gstack-ai-agent-workflow-plan-20260323.md`, `knowledge/engineering/agent-workflows/thesis-hybrid-agent-model.md`, `knowledge/engineering/agent-workflows/thesis-agent-architecture.md`, `knowledge/engineering/agentic-workflows/agentic-workflow-stack.md`. HIGH confidence (first-party, reviewed).
