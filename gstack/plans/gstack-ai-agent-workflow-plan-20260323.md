# Thes1s AI Agent Workflow — Authoritative Architecture Plan

**Status**: ACTIVE | **Branch**: main | **Date**: 2026-03-23
**Reviews**: autoplan (CEO+ENG) + interactive CEO (SCOPE EXPANSION)
**Supersedes**: `gstack-ai-agent-workflow-autoplan-20260323.md`, `gstack-ai-agent-workflow-ceo-plan-20260323.md`

---

## Context

Thes1s has 20+ validated data engines, 8 Toolbox tabs, and complete financial data infrastructure. What's missing is the AI layer — the agentic research workflow that generates comprehensive Rule One investment reports. This is a **commercial product** for hedge fund licensing. The agent workflow IS the core product value.

**Vision**: Type `/generate:pitch-deck LULU` → AI analyst team researches the company → portfolio manager (you) reviews at structured checkpoints → fully cited, Buffett-quality investment thesis produced in minutes instead of 40+ hours.

**Collaboration Model**: Portfolio Manager (user) + Analyst Team (AI agents). Agents do the research legwork. User reviews, challenges assumptions, provides inaccessible data, and makes final decisions. Not a black box — a collaborative research operation.

---

## Architecture: GSD-Inspired Three-Layer System

```
+================================================================+
|                    PRESENTATION LAYER                            |
|  OnePager.jsx | PitchDeck.jsx | FullStory.jsx | ExportView.jsx |
|  StatusBadge | SensitivityTable | ReferenceList | DebateView    |
+================================================================+
                              |
                     Report Data Model (JSON)
                              |
+================================================================+
|                    INTELLIGENCE LAYER                            |
|                                                                  |
|  ORCHESTRATOR (CC skill or aiResearch.js)                       |
|    ├── State: .thes1s/reports/{TICKER}/progress.json            |
|    ├── Data Assembly: dataExport.js (no AI, pure code)          |
|    ├── Agent dispatch: parallel waves via CC Agent tool          |
|    ├── Checkpoints: present findings + questions to user         |
|    ├── Quality gate: critic.js (citations + completeness)        |
|    └── Report assembly from subagent outputs                     |
|                                                                  |
|  9 AGENT ROLES (each gets FRESH context, up to 1M tokens)      |
|    ├── Data Assembler (no AI — packages engine output)           |
|    ├── Primary Source Reader (10-K, transcripts, proxy, promises)|
|    ├── Financial Analyst (growth, returns, FCF, balance sheet)    |
|    ├── Business Analyst (business model, moat identification)    |
|    ├── Competitor Evaluator (landscape, TAM, moat validation)    |
|    ├── Management Evaluator (CEO, insiders, compensation)        |
|    ├── Risk Analyst (PEST, bear cases, adversarial)              |
|    ├── Valuation Specialist (FGR, 4 methods, sensitivity)        |
|    └── Synthesis Writer (Buffett-style narrative, verdicts)       |
|                                                                  |
|  ROLE FLEXIBILITY: Roles = prompt configs in agents/ directory.  |
|  Adding/removing roles = editing a prompt file + dispatch table. |
|  DataPacket + report schema are STABLE; roles are FLEXIBLE.      |
+================================================================+
                              |
                     DataPacket (canonical JSON)
                              |
+================================================================+
|                      DATA LAYER (COMPLETE)                       |
|  edgarFinancials | growthRates | returnMetrics | freeCashFlow   |
|  valuation | fgr | ruleOneScore | gurus | insiders | peers      |
|  peerMetrics | compensation | transcripts | companyEvents       |
|  analystEstimates | filingMarkdown | prices | batchQuotes       |
+================================================================+
```

---

## Agent Team: 9 Roles

Definitions stored in `agents/` directory. Each folder: `prompt.md` (system prompt), `config.json` (curriculum refs, DataPacket slice, Toolbox tools, model), `README.md`.

```
agents/
├── orchestrator/          -- dispatch table, phase definitions, checkpoint rules
├── data-assembler/        -- engine list, DataPacket schema (no AI)
├── primary-source-reader/ -- 10-K reader, transcript analyzer, promise tracker, data verifier
├── financial-analyst/     -- numbers: growth, returns, FCF, balance sheet
├── business-analyst/      -- qualitative: business model, moat identification
├── competitor-evaluator/  -- landscape: TAM, market position, moat validation, business cycle
├── management-evaluator/  -- CEO assessment, insider activity, compensation
├── risk-analyst/          -- adversarial: PEST, bear cases, inversion
├── valuation-specialist/  -- FGR derivation, 4 methods, sensitivity, growth ceiling
└── synthesis-writer/      -- Buffett-style narrative, verdicts, overall thesis
```

### Universal Agent Context (loaded into ALL AI agents)
- `rule-one-fundamentals.md` — R1 mentality, philosophy, investment requirements
- `tools-for-analysis.md` — practical tools and data sources reference
- **7 Operating Rules** (from `rule-1-workflow.md`): never skip stages, never assume guru = buy signal, conservative growth, test inversion, define exit before entry, document assumptions, stop when clarity fails

### Orchestrator-Only Context
- `rule-1-workflow.md` — stage progression, stop conditions, escalation rules, folder architecture

| Agent | Sections | Curriculum (+ universals above) | Tools |
|-------|----------|------------|-------|
| Data Assembler | Pre-processing | — | Engine APIs |
| Primary Source Reader | Pre-processing | — | Filing markdown, transcripts |
| Financial Analyst | Growth, FCF, Returns, Balance Sheet, Valuation inputs | advanced-financial-analysis.md, fgr.md, capex-cash-flow-explained.md | DataPacket + Toolbox |
| Business Analyst | Radar, Simple & Predictable, Dominance | pitch-deck-I.md, one-pager.md, story-form-I.md, **advanced-financial-analysis.md** | DataPacket + Toolbox + web search |
| Competitor Evaluator | Market Position, Barriers, Moat validation, TAM, business cycle | pitch-deck-I.md, pitch-deck-II.md, story-form-I.md, **advanced-financial-analysis.md** | DataPacket + Toolbox + web search |
| Management Evaluator | Management | pitch-deck-II.md, **advanced-financial-analysis.md**, **buffett_letters_claude_training_set/**, **guru-list.md** | DataPacket + Toolbox + web search |
| Risk Analyst | PEST, Inversion & Rebuttal, Event Analysis | pitch-deck-III.md, story-form-II.md, **advanced-financial-analysis.md**, **fgr.md** | DataPacket + Toolbox + web search |
| Valuation Specialist | Valuation, FGR derivation, Growth ceiling | pitch-deck-IV.md, fgr.md, equity-bond-research.md, **advanced-financial-analysis.md**, **capex-cash-flow-explained.md** | DataPacket + Toolbox + web search |
| Synthesis Writer | All narratives, verdicts, overall thesis | buffett_writing_principles.md + Buffett letters | All section outputs |

**Curriculum expansion rule:** Every research-reference file hyperlinked inside an agent's primary curriculum files is autoloaded into that agent's curriculum. Agents must have full context for every cross-reference — no hallucination of referenced content. Depth, no shortcuts.

### Agent Role Details

**Primary Source Reader** (the qualitative moat) — Runs BEFORE other agents:
- **10-K text**: Business description, risk factors, competitive positioning, management discussion
- **Earnings transcripts**: Key themes, management tone, Q&A highlights
- **Proxy statements**: Compensation structure, insider ownership, board composition
- **Management Promise Tracker**: Extracts forward-looking statements, tags with quarter/year, compares to actuals over time. Produces management credibility metrics.
- **10-K Data Verification**: Cross-checks key DataPacket financials (revenue, net income, total assets, debt, FCF) against the actual 10-K text. Flags any discrepancies as data quality issues BEFORE analysis begins. The 10-K is always the source of truth; `edgarFinancials.js` saves time but may have holes.

**Competitor Evaluator** (NEW — industry landscape specialist):
- Researches market penetration, TAM, competitive edge, moat differentiators
- Analyzes WHERE we are in the business cycle for this industry
- Compares 15+ competitors on financial and qualitative metrics
- Validates moat claims made by the Business Analyst (Business Analyst identifies the moat; Competitor Evaluator validates it against the landscape)
- Uses peer metrics engine + web search for trade journals and market research

---

## Stage Orchestration (GSD-Style)

Commands orchestrate. Agents execute in parallel where possible. Each gets fresh context.

### Stage 1: One Pager (~2-5 min)

```
/generate:one-pager COST
  ├── data-assembler → DataPacket
  ├── Sections 1-5 (parallel): financial-analyst + business-analyst
  ├── Section 6 (sequential): synthesis-writer (needs 1-5 context)
  └── Quality check → Present to user
```

AI calls: 2-3. Cost: ~$0.05-0.15 (Sonnet).

### Stage 2: Pitch Deck (~15-30 min, 3-4 checkpoints)

```
/generate:pitch-deck COST
  ├── data-assembler → DataPacket + Toolbox tools available to all agents
  ├── primary-source-reader → 10-K insights, transcript summaries, promises, DATA VERIFICATION
  │
  ├── PHASE 1 (parallel):
  │     business-analyst → Section 1 (Radar)
  │     business-analyst → Section 2 (Simple & Predictable)
  │     competitor-evaluator → Section 3 (Dominant Market Position)
  ├── CHECKPOINT: present Phase 1 results + questions to user
  │
  ├── PHASE 2 (sequential, needs Phase 1 context):
  │     competitor-evaluator → Section 4 (Barriers & Moats — moat validation)
  │     financial-analyst → Section 5 (FCF) — uses Toolbox to explore capex trends
  │     management-evaluator → Section 6 (Management)
  │     financial-analyst → Section 7 (ROE/ROIC/ROA & Debt) — uses Toolbox to drill trends
  │     financial-analyst → Section 8 (Balance Sheet)
  ├── CHECKPOINT: present Phase 2 results + questions
  │
  ├── PHASE 3 (needs full context):
  │     risk-analyst → Section 9 (PEST Risks)
  │     valuation-specialist → Section 10 (Valuation)
  │       └── FGR sub-workflow (5 inputs, user confirmation)
  │       └── 4 methods — uses Toolbox to try different assumptions iteratively
  │       └── Sensitivity tables via computeSensitivity()
  │       └── Growth ceiling check
  ├── CHECKPOINT: FGR confirmation + valuation review
  │
  └── synthesis-writer → Final polish pass
```

AI calls: ~17 (including primary source reader + competitor evaluator). Cost: ~$1.50-3.50.

### Stage 3: Full Story (~30-60 min, deepest analysis)

```
/generate:full-story COST
  ├── Inherit: all Pitch Deck findings + updated DataPacket
  │
  ├── PHASE 1 (sequential):
  │     risk-analyst → Section 1 (Event Analysis)
  │     business-analyst → Section 2 (Meaning — 15pt checklist)
  │     business-analyst → Section 3 (Moat — 15pt checklist)
  │     management-evaluator → Section 4 (Management — 13pt checklist)
  │     valuation-specialist → Section 5 (Valuation Confirmation)
  ├── CHECKPOINT
  │
  ├── PHASE 2: THE DEBATE
  │     Bull → synthesis-writer (summarizes thesis from Sections 1-5)
  │     Bear → risk-analyst (attacks every bull point with evidence)
  │     Judge → financial-analyst (scores each rebuttal, flags gaps)
  ├── CHECKPOINT: review debate findings
  │
  ├── PHASE 3 (strategy):
  │     valuation-specialist → Section 7 (Trading Strategy)
  │     synthesis-writer → Section 8 (PACE Plan)
  │
  └── Final assembly + overall thesis verdict
```

AI calls: ~18. Cost: ~$2.00-5.00 (Opus for debate + synthesis).

---

## Structured Checkpoints (PM/Analyst Model)

After each phase, the orchestrator presents to the user:
1. **Findings**: Key insights from each completed section
2. **Data gaps**: "Couldn't find COST's maintenance capex breakdown"
3. **Questions**: "Conflicting market size numbers — which source to trust?"
4. **Confidence**: Per-section confidence levels (HIGH/MEDIUM/LOW)

User responds with: answers, corrections, pasted data, or "proceed."

When agents hit inaccessible data (paywalled, firewalled), they escalate to the user rather than guessing or skipping.

---

## Data Access: DataPacket + Toolbox Tools

R1 research is ITERATIVE, not linear. A Ruler doesn't read a static report — they explore the Toolbox, change assumptions, check different metrics, drill into specific years, and go back and forth until the picture makes sense. Agents must work the same way.

### DataPacket (the overview — "here's the full picture")

`dataExport.js` assembles ALL engine output into one JSON as the STARTING POINT:

```js
{
  ticker, companyInfo, classification, currentPrice,
  financials: { years, income, balance, cashFlow },
  ttm: { revenues, netIncome, operatingCF, fcf, eps },
  growthRates: { bvps: {10yr,7yr,5yr,3yr,1yr}, earnings, revenue, opCash, fcf },
  returnMetrics: { yearly, averages: {10yr,7yr,5yr,3yr} },
  debtMetrics: { netDebt, netDebtToEarnings, netDebtToFCF, isNetCash },
  fcf: { yearly, fcfRatio, capExRatio },
  keyMetrics: { [year]: { perShare, liquidity, profitability, debt, operating } },
  ruleOneScore: { moat, management, composite },
  gurus: { count, holdings },
  insiders: { summary, recentTransactions },
  compensation: { executives, directors },
  peers: { industry, sector },
  peerMetrics: { [cik]: { ticker, name, revenues, margins, roe, ... } },
  analystEstimates: { growthRate, epsEstimates, priceTargets },
  events: { upcoming, recent8K },
  transcriptAvailability: { count, latestQuarter },
  filings: { recent, totalCount },
  promises: [],          // Management Promise Tracker
  priorAnalyses: [],     // Cross-Company Intelligence
  convictionHistory: []  // Conviction Scoring history
}
```

### Toolbox Tools (interactive — "explore what you need")

Agents ALSO get callable functions that let them drill deeper during analysis — just like a Ruler flipping between Toolbox tabs:

```
TOOLBOX TOOLS (available to all AI agents):
  getMetric(ticker, metric, years)          — "Show me ROE/ROIC/ROA for 2015-2024"
  getFinancialLine(ticker, statement, field, years) — "Show me SGA on the income statement"
  computeGrowthRates(ticker, metric, excludeYears)  — "What's earnings CAGR if I exclude 2020?"
  computeMOS(fgr, eps, futurePE, marr)      — "What's MOS price with 12% FGR?"
  computePBT(fcfPerShare, fgr, targetYears)  — "What's PBT at these assumptions?"
  computeTenCap(opCF, maintCapEx, tax, shares) — "Try 80% maintenance capex instead of 70%"
  computeEquityBond(bvps, roe, retained, pe, marr) — "What CAGR do I get at current price?"
  sensitivityTable(method, param1Range, param2Range) — "Vary FGR and EPS across MOS"
  comparePeers(ticker, metric, topN)        — "How does COST's gross margin compare to 10 peers?"
  readFilingSection(ticker, form, section)  — "Show me the 10-K Business Description"
  getTranscriptExcerpt(ticker, quarter, topic) — "What did the CEO say about growth in Q3?"
```

**Why this matters**: A Valuation Specialist computing MOS might get a weird number, then use `computeMOS()` with different FGR values to understand the sensitivity. A Financial Analyst looking at FCF might notice a dip, then use `getFinancialLine()` to check capex that year. This is exactly how YOU use the Toolbox — the analysis drives what data you look at next.

**In CC mode**: These are Claude Code tool calls or bash scripts that invoke engine functions.
**In API mode**: These are Claude `tool_use` definitions that the agent can call during generation.

The DataPacket gives the overview. The Toolbox tools enable the investigation.

---

## Quality Assurance: 5-Layer System

1. **Data Grounding**: Every quantitative claim cites a DataPacket field path. "If not in DataPacket, say 'Data not available.' NEVER estimate."
2. **Structural Completeness**: `critic.js` validates: all required fields, all citations resolve, confidence justified by data completeness.
3. **Multi-Source Verification**: Financial metrics need EDGAR + peer. Growth projections need CAGR + analyst + industry. Moat claims need financial + qualitative evidence.
4. **Confidence Scoring**: HIGH (all data, multiple sources agree) / MEDIUM (some gaps, partial disagreement) / LOW (significant gaps, single source).
5. **Human Gate**: User reviews at structured checkpoints. Can approve, reject with notes, edit directly, or request deeper analysis.

---

## Report JSON Schema (per section)

```js
{
  key: "fcf",
  title: "Free Cash Flow",
  sectionNumber: 5,
  status: "pass" | "fail" | "review" | "pending",
  confidence: "HIGH" | "MEDIUM" | "LOW",
  verdict: "PASS" | "FAIL" | "WATCHLIST",
  verdictRationale: "...",
  summary: "...",         // 1-2 sentence summary for downstream agents
  data: { ... },          // Engine-populated structured data
  narrative: "...",        // Buffett-style AI-generated analysis
  citations: [{ id, ref, text, source }],
  tables: [{ title, headers, rows, source }],
  charts: [{ type, config, data }],  // For PDF rendering
  redFlags: ["..."],      // Even passing sections must have at least one
  primarySourceInsights: ["..."],  // From Primary Source Reader
  generatedAt: "...",
  modelUsed: "...",
  tokenCost: { input, output }
}
```

---

## Dual Deployment Path

### Phase A: CC Skills (Now — Personal Use)
```
/generate:one-pager COST      — Full One Pager
/generate:pitch-deck COST     — Full Pitch Deck (with checkpoints)
/generate:full-story COST     — Full Story (with debate)
/generate:section COST pd 5   — Regenerate specific section
/debate COST                   — Run inversion debate standalone
/fgr COST                     — FGR derivation workflow
```

One interactive session per command. Agents spawned as CC subagents (fresh context each). User interacts at checkpoints. Free (included in Pro subscription).

### Phase B: In-App Generation (Commercial)
Same workflow triggered by "Generate" button. `aiResearch.js` dispatches per-section Claude API calls. Real-time progress. Same schemas, same quality checks. Cost: ~$2-7 per full pipeline.

---

## External Data Strategy

Start with web search + engine data. Architecture supports pluggable data sources per section. When agents can't access data (paywalls, firewalls), they escalate to user. Build custom scrapers only when web search proves insufficient for specific sections.

---

## Cost Optimization

| Stage | Calls | Model Mix | Est. Cost |
|-------|-------|-----------|-----------|
| One Pager | 3-4 | All Sonnet | $0.05-0.15 |
| Pitch Deck | ~15 | 12 Sonnet + 3 Opus | $2.00-4.00 |
| Full Story | ~18 | 12 Sonnet + 6 Opus | $4.00-8.00 |
| **Full Pipeline** | **~36** | **Mixed** | **$6.05-12.15** |

Opus for: FGR derivation, valuation synthesis, debate, final narrative, primary source reading.

**Note (from Eng Review):** Original estimates ($3-8) were low. Primary Source Reader processing full 10-K text is ~200K+ input tokens alone. Real-world cost likely $8-12 per full pipeline. Matters for commercial margin calculations.

---

## Implementation Phases

### Phase 5A: Foundation (3-4 days)
- Create `agents/` directory with 8 agent definitions
- Create `src/engines/dataExport.js` (DataPacket assembly)
- Define report JSON schema (backward-compatible with existing report model)

### Phase 5C: CC Skill + First Analysis (2-3 days) ← MOVED BEFORE 5B (Eng Review)
- CC skill for `/generate:one-pager`
- First real analysis: generate One Pager for LULU, compare to example
- Success benchmark: 80%+ section depth match vs LULU examples
- **Rationale**: Validate AI output quality before investing in display components. See real output in ~5 days instead of ~14.

### Phase 5B: Display Components (1 week)
- `OnePager.jsx` — 6-section renderer
- `StatusBadge.jsx` — PASS/FAIL/REVIEW badges
- `SectionRenderer.jsx` — reusable section display with citations
- Progress dashboard during generation

### Phase 5D: Quality System (3-4 days)
- `critic.js` — citation validation, completeness scoring, confidence checks
- `contextBudget.js` — token counting + budget management

### Phase 6: Pitch Deck (2 weeks)
- `PitchDeck.jsx` + 10 section sub-components
- `SensitivityTable.jsx`
- Assumption tracker sidebar with confidence levels (Delight #4)
- CC skill for `/generate:pitch-deck` with checkpoints
- Industry context cards — pop-up glossary for industry-specific terms (Delight #7)
- "Tell me more" deep-dive on any section point (Delight #1)

### Phase 7: Full Story + Debate (2 weeks)
- `FullStory.jsx` + scored checklists (43 items)
- `debate.js` — structured Bull/Bear/Judge debate orchestration
- Quick Bull/Bear narrative toggle — switch between thesis perspectives (Delight #3)
- Management Promise Tracker (in Primary Source Reader)
- CC skills for `/generate:full-story` and `/debate`

### Phase 8: Polish + Export (1 week)
- `ExportView.jsx` — branded PDF/print view (Thes1s aesthetic)
- `ReferenceList.jsx` — citation manager (40+ numbered references)
- `aiResearch.js` — in-app API-driven generation
- Version history / diff view
- Source preview on citation hover

### Phase 9+ (Future — Architecture Designed Now)
- Living Thesis Intelligence (re-analysis triggers on new data)
- Cross-Company Intelligence (knowledge graph across analyses)
- Conviction Scoring (Bayesian updates)
- Historical comparison across reports (Delight #8)
- stickeR1 evaluation loop integration
- Multi-user backend, auth, billing

---

## TODOS Cross-Reference (from TODOS.md)

These existing deferred items from the XBRL engine reviews amplify agent analysis quality. None are blocking — agents work with available data and flag gaps. But the richer the data, the deeper the research.

| TODO | Priority | Relevance to Agent Workflow | Status |
|------|----------|----------------------------|--------|
| **Full Morningstar Field Parity (~145 fields)** | P2 | DataPacket can only export fields that exist. Missing fields (debt maturity, PP&E sub-breakdowns) = gaps agents must flag as "Data not available." More fields = richer analysis. | Not blocking |
| **Quarterly + TTM Validation** | P2 | Valuation Specialist needs accurate TTM for MOS/PBT. TTM code exists but unvalidated. Annual data is solid. | Not blocking, data quality risk for valuations |
| **Financial Statement Taxonomy Mapping Skill** | P3 | Could become part of the Financial Analyst agent's curriculum — teaching agents HOW to interpret financial data, not just read numbers. "Operating income dropped 30% — was it a restructuring charge or recurring?" | Merge into Financial Analyst agent definition |

---

## Prototype Validation (2026-03-23)

Tested single-agent generation (one Claude instance, DataPacket + curriculum, no orchestration) before committing to full architecture.

**One Pagers** — Single agent produces good output. Confirmed.
- [LULU One Pager (first try)](generated-theses/first-try-one-pagers/LULU-first-try-one-pager.md) | [PDF](generated-theses/first-try-one-pagers/LULU-first-try-one-pager.pdf)
- [TSCO One Pager (first try)](generated-theses/first-try-one-pagers/TSCO-first-try-one-pager.md) | [PDF](generated-theses/first-try-one-pagers/TSCO-first-try-one-pager.pdf)

**Pitch Decks** — Quality degrades fast. LULU attempt regurgitated the example instead of independent analysis. TSCO (no example to reference) was clearly worse. **Multi-agent architecture confirmed necessary.**
- [LULU Pitch Deck (first try)](generated-theses/first-try-pitch-decks/LULU-first-try-pitch-deck.md) | [PDF](generated-theses/first-try-pitch-decks/LULU-first-try-pitch-deck.pdf)
- [TSCO Pitch Deck (first try)](generated-theses/first-try-pitch-decks/TSCO-first-try-pitch-deck.md) | [PDF](generated-theses/first-try-pitch-decks/TSCO-first-try-pitch-deck.pdf)

**Key gaps found**: No screenshots/charts, no citations, example contamination, missing guru data in prototype DataPacket scripts.

## Key Design Decisions

1. **GSD-style orchestration** — Commands orchestrate, agents execute in parallel, each with fresh context
2. **9 agent roles in agents/ directory** — Self-documenting registry. Adding/removing = editing a folder
3. **Portfolio Manager / Analyst Team model** — User reviews at checkpoints, provides data, challenges assumptions
4. **DataPacket + Toolbox Tools** — DataPacket is the overview; Toolbox tools enable iterative exploration (just like a Ruler uses the app). R1 research is an investigation, not a linear read.
5. **Primary Source Reader is the moat** — Reading 10-K text, not just extracting numbers, is the qualitative edge
6. **10-K Data Verification** — Primary Source Reader cross-checks DataPacket financials against actual 10-K text. 10-K is always the source of truth.
7. **Management Promise Tracker** — Track CEO promises vs delivery across earnings calls. No tool does this
8. **Competitor Evaluator as separate role** — Business Analyst identifies the moat; Competitor Evaluator validates it against the landscape. Different hat, different research approach.
9. **Universal agent context** — `rule-one-fundamentals.md` + `tools-for-analysis.md` + 7 Operating Rules loaded into EVERY agent
10. **Section-level granularity** — Each section independently generated, cached, regenerable
11. **Curriculum injected at full depth** — No compression. The depth IS the competitive edge
12. **Red flags always required** — Even passing sections must identify at least one concern
13. **FGR is a workflow** — 5-input derivation with user confirmation, not a single number
14. **Presentation-ready PDF** — First-class export, not an afterthought. The product demo
15. **No example contamination** — Agents must NEVER pattern-match from LULU examples. Each analysis is independent. Prompt: "Perform independent research. Do NOT reference or copy patterns from example analyses."
16. **Visual evidence capture** — Agents screenshot/save notable charts, industry projections, supply chain diagrams during web research — like a human Ruler does. Images embedded in the report.
17. **Academic-style citations** — Numbered references `[1]`, `[2]` with inline links throughout narrative. Every claim traceable to a source URL or DataPacket field. Citation list at the end of each section and the full report.
18. **Node.js adapter for data bridge** — ~500-800 LOC swapping browser APIs for Node equivalents. Foundation for CC skills AND future commercial backend.
19. **Retry-then-escalate failure handling** — Agent fails → retry once with error context → fail again → escalate to user. PM/analyst model.
20. **JSON schema enforcement** — Agent structured output (report sections, DataPacket queries) needs JSON mode or schema validation. Without it, parsing agent output is fragile. Use Claude's JSON mode or post-process with schema validation.
21. **Build order: 5A → 5C → 5B** — Validate AI output quality before investing in display components. See real output in ~5 days instead of ~14. Don't build the frame before you know what goes in it.
22. **Eval strategy: manual first, automated later** — User IS the eval system for the first 5-10 reports, reviewing like a portfolio manager reviews analyst work. What the user learns becomes the spec for automated eval. Don't build eval infrastructure before understanding what "good" looks like.

---

## Delight Opportunities (from CEO Review — ALL ACCEPTED)

Build during relevant phases. These are the details that make hedge funds say "shut up and take my money."

| # | Feature | Phase | Effort | Status |
|---|---------|-------|--------|--------|
| 1 | "Tell me more" deep-dive on any section point | 6 | S | Planned |
| 2 | Source preview — hover citation to see actual 10-K paragraph | 8 | M | Planned |
| 3 | Quick Bull/Bear narrative toggle | 7 | S | Planned |
| 4 | Assumption tracker sidebar with confidence levels | 6 | S | Planned |
| 5 | Real-time progress dashboard during generation | 5B | M | Planned |
| 6 | Version history / diff view between iterations | 8 | M | Planned |
| 7 | Industry context cards (pop-up glossary) | 6 | S | Planned |
| 8 | Historical comparison across reports | 9+ | M | Deferred |

---

## Eng Review Findings (10 Outside Voice items)

| # | Finding | Assessment | Resolution |
|---|---------|-----------|------------|
| 1 | Data bridge is ~500-800 LOC, not ~200 | Valid | Updated estimate (KDD #18) |
| 2 | Toolbox tools have no execution path | Valid | Orchestrator handles tool execution |
| 3 | 9 agents is overengineered for v1 | Tested and disproven | Prototype validated multi-agent necessity |
| 4 | Transcript/filing coverage limits | Valid | 25 Alpha Vantage calls/day, 10-K is 200K+ tokens |
| 5 | Cost estimates are low | Valid | Updated to $8-12 range |
| 6 | Dual deployment = two products | Partially valid | Prompts/schemas shared, orchestration differs |
| 7 | No prototype validation | Addressed | Ran prototype, single-agent fails on pitch decks |
| 8 | Checkpoint model is complex | Valid | Orchestrator is a stateful conversation manager |
| 9 | Structured JSON output reliability | Valid | Need JSON mode or schema enforcement (KDD #20) |
| 10 | FGR blocks pipeline | Manageable | FGR confirmation IS a checkpoint by design |

**Test Strategy (from Eng Review):**
- **Unit tests (Phase 5A-5D):** `dataExport.test.js` (DataPacket assembly), `critic.test.js` (citation validation), Toolbox tool wrappers (known inputs → expected outputs)
- **Eval system:** Manual LULU benchmark first. User IS the eval system for first 5-10 reports. Automated eval built after understanding what "good" looks like from real reports.
- **Token economics:** No budgets now. Let agents use Toolbox freely in CC mode. Measure actual usage, set budgets for API mode based on real data.

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 2 | clean | SCOPE EXPANSION: 10 proposals accepted, 3 deferred. Primary Source Reader + Promise Tracker + GSD orchestration + PM/analyst model. |
| Eng Review | `/plan-eng-review` | Architecture & tests | 1 | clean (via autoplan) | 5 findings: data bridge, cross-section context, FGR sub-workflow, report compat, web search. |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | deferred | Deferred to Phase 5B. |

**VERDICT:** CEO CLEARED (SCOPE EXPANSION). ENG CLEARED (via autoplan). Ready to implement.
