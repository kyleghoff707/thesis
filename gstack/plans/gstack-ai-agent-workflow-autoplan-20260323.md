# Thes1s AI Agent Workflow Architecture

<!-- /autoplan restore point: ~/.gstack/projects/kyleghoff707-stock-analyzer/main-autoplan-restore-20260323.md -->

## Context

Thes1s has 20+ validated data engines, 8 Toolbox tabs, and a complete financial data infrastructure. What's missing is the AI layer -- the agentic research workflow that generates comprehensive Rule One investment reports. This is being built as a **commercial product** for potential hedge fund licensing. The agent workflow IS the core product value.

The user's vision: type `/generate:pitch-deck LULU` in Claude Code and get a fully researched, cited, Buffett-quality investment thesis. Then migrate that same workflow to an in-app "Generate" button for paying customers.

---

## Architecture: Three-Layer System (GSD-Inspired Orchestration)

The orchestration follows the GSD (Get Shit Done) pattern: one orchestrator managing many subagents, each with their own fresh context window, working in parallel where possible.

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
|  ORCHESTRATOR (the CC skill or aiResearch.js)                   |
|    ├── State tracking (.thes1s/reports/{TICKER}/progress.json)  |
|    ├── Data Assembly (dataExport.js -- no AI, pure code)        |
|    ├── Subagent dispatch (parallel where possible)               |
|    ├── Progress monitoring + failure handling                    |
|    ├── Quality gate (critic.js -- citation + completeness)       |
|    └── Report assembly from subagent outputs                     |
|                                                                  |
|  SUBAGENTS (each gets FRESH context window, up to 1M tokens)   |
|    ├── Financial Analyst (numbers, ratios, growth, FCF)          |
|    ├── Business Analyst (moats, competitors, market position)    |
|    ├── Management Evaluator (CEO, insiders, compensation)        |
|    ├── Risk Analyst (PEST, bear cases, adversarial)              |
|    ├── Valuation Specialist (FGR, 4 methods, sensitivity)        |
|    ├── Synthesis Writer (Buffett-style narrative, verdicts)       |
|    └── Data Assembler (no AI -- packages engine output)          |
|                                                                  |
|  ROLE FLEXIBILITY                                                |
|    Roles are prompt configurations (system prompt + curriculum   |
|    slice + DataPacket slice), NOT hard-coded systems.            |
|    Adding/removing/merging roles = editing a prompt file +       |
|    updating the dispatch table. DataPacket and report schema     |
|    are the STABLE contracts; roles are the FLEXIBLE layer.       |
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

## Agent Team: 7 Roles

Each "agent" is a system prompt + knowledge slice + data payload. In CC mode, Claude fulfills all roles with full context. In API mode, each is an independent call.

### 1. DATA ASSEMBLER (no AI -- pure code)
- `dataExport.js` -- calls all 20+ engines, normalizes output
- Produces canonical DataPacket (~15-25K tokens serialized)
- Fields: financials, growth rates, returns, FCF, valuation inputs, gurus, insiders, compensation, peers, events, transcripts, analyst estimates

### 2. FINANCIAL ANALYST
- Numbers-heavy sections: growth metrics, ROE/ROIC/ROA, balance sheet, FCF, valuation inputs
- Curriculum: `advanced-financial-analysis.md`, `fgr.md`, `capex-cash-flow-explained.md`
- Rule: every number must cite DataPacket field path + compare to at least one peer

### 3. BUSINESS ANALYST
- Qualitative sections: business model, moats, competitive positioning, market dominance
- Curriculum: `pitch-deck-I.md` (sections 1-3), `rule-one-fundamentals.md`
- Tools: web search for industry research, market share, competitive landscape
- Rule: moat claims need BOTH financial evidence (margins, returns) AND qualitative evidence

### 4. MANAGEMENT EVALUATOR
- CEO assessment: track record, capital allocation, insider activity, compensation alignment
- Data: compensation engine, insider transactions, guru holdings, 10-K/proxy markdown
- Tools: web search for CEO background, Glassdoor, news
- Rule: check buyback prices against sticker price -- buybacks above intrinsic value = misallocation

### 5. RISK ANALYST (Adversarial)
- PEST analysis, bear case construction, inversion & rebuttal
- Curriculum: `pitch-deck-III.md` (PEST), `story-form-II.md` (inversion)
- Mandate: find every vulnerability. Probability (L/M/H) + Impact (L/M/H) per risk
- Rule: if a bear case can't be rebutted with evidence, it reduces the thesis

### 6. VALUATION SPECIALIST
- FGR derivation (5-input workflow), 4 valuation methods, sensitivity tables, growth ceiling
- Curriculum: `pitch-deck-IV.md`, `fgr.md`, `equity-bond-research.md`
- Rule: all 4 methods must be computed. If they don't converge within 30%, explain why
- FGR is a sub-workflow: historical CAGR + market relativity + guidance + sector + analysts

### 7. SYNTHESIS WRITER
- Polishes all sections into Buffett-style narrative. Section verdicts, overall thesis
- Curriculum: `buffett_writing_principles.md` + 1 Buffett letter excerpt
- Tone: conversational, precise, honest about gaps, teaching the reader
- Rule: every section must have PASS/FAIL/WATCHLIST verdict + one-sentence rationale

---

## Stage Orchestration

### Stage 1: One Pager (~2-5 min, mostly engine data)

```
Sections 1-5 (parallel):          Section 6 (sequential):
  [Company Info] ENGINE ONLY       [Company Summary]
  [Min Standards] ENGINE ONLY      SYNTHESIS WRITER
  [Meaning KPIs] FINANCIAL+BIZ    (needs context from 1-5)
  [Management]   FINANCIAL
  [Growth]       FINANCIAL         Quality Check → Present to User
```

AI calls: 2-3 (sections 3, 5, 6 need narrative). Cost: ~$0.05-0.15 (Sonnet).

### Stage 2: Pitch Deck (~15-30 min, heavy research)

```
PHASE 1 (parallel):           PHASE 2 (sequential):       PHASE 3 (sequential):
  [1-Radar]     BIZ+SEARCH     [4-Barriers]   BIZ+SEARCH   [9-PEST]     RISK+SEARCH
  [2-Simple]    BIZ+FILINGS    [5-FCF]        FINANCIAL     [10-Valuation] VALUATION
  [3-Dominance] BIZ+PEERS      [6-Management] MGMT+SEARCH     ├── FGR derivation
                                [7-Returns]    FINANCIAL        ├── 4 methods
                                [8-Balance]    FINANCIAL        ├── Sensitivity tables
                                                                └── Growth ceiling
```

AI calls: ~13. Cost: ~$0.80-2.50 (Sonnet + Opus for valuation).

### Stage 3: Full Story (~30-60 min, deepest analysis)

```
PHASE 1 (sequential):    PHASE 2 (the debate):     PHASE 3 (strategy):
  [1-Event]    RISK       [6-Inversion & Rebuttal]   [7-Trading]  VALUATION
  [2-Meaning]  BIZ          Bull → SYNTHESIS WRITER   [8-PACE]     SYNTHESIS
  [3-Moat]     BIZ          Bear → RISK ANALYST
  [4-Management] MGMT       Judge → FINANCIAL ANALYST
  [5-Valuation] VALUATION

PHASE 4: Scored Checklists (15+15+13 = 43 items, batched into 3 calls)
```

AI calls: ~15. Cost: ~$1.50-4.00 (Opus for debate + synthesis).

---

## Data Bridge: How Agents Access Engine Data

### The DataPacket

`dataExport.js` assembles ALL engine output into one JSON object per ticker:

```js
{
  ticker, companyInfo, classification, currentPrice,
  financials: { years, income, balance, cashFlow },
  ttm: { revenues, netIncome, operatingCF, fcf, eps },
  growthRates: { bvps: {10yr,7yr,5yr,3yr,1yr}, earnings, revenue, opCash, fcf },
  returnMetrics: { yearly: [...], averages: {10yr,7yr,5yr,3yr} },
  debtMetrics: { netDebt, netDebtToEarnings, netDebtToFCF, isNetCash },
  fcf: { yearly, fcfRatio, capExRatio },
  keyMetrics: { [year]: { perShare, liquidity, profitability, debt, operating } },
  ruleOneScore: { moat, management, composite },
  gurus: { count, holdings: [...] },
  insiders: { summary, recentTransactions },
  compensation: { executives, directors },
  peers: { industry: [...], sector: [...] },
  peerMetrics: { [cik]: { ticker, name, revenues, margins, roe, ... } },
  analystEstimates: { growthRate, epsEstimates, priceTargets },
  events: { upcoming, recent8K },
  transcriptAvailability: { count, latestQuarter },
  filings: { recent, totalCount }
}
```

### Dual-Mode Execution

**CC Mode**: Claude Code reads engines directly (via Node adapter or gstack /browse for live app data). Full context window — all curriculum + full DataPacket + conversational iteration.

**API Mode**: `aiResearch.js` dispatches per-section Claude API calls with curated context (system prompt + curriculum slice + DataPacket slice). Output written directly to report data model.

---

## Quality Assurance: 5-Layer System

### Layer 1: Data Grounding
Every quantitative claim must reference a DataPacket field path:
```json
{ "claim": "Revenue CAGR 18.2% over 10yr", "dataRef": "growthRates.revenue.10yr", "source": "EDGAR" }
```
System prompt: "If a data point is not in the DataPacket, say 'Data not available.' NEVER estimate a financial metric."

### Layer 2: Structural Completeness
`critic.js` validates: all required fields present, all citations resolve to valid DataPacket paths, confidence justified by data completeness.

### Layer 3: Multi-Source Verification
- Financial metrics: EDGAR source + at least one peer comparison
- Growth projections: historical CAGR + analyst consensus + industry growth rate
- Moat claims: financial evidence + qualitative evidence
- Valuation: at least 2 of 4 methods converging within 30%

### Layer 4: Confidence Scoring
- **HIGH**: All data available, multiple sources agree, clear historical pattern
- **MEDIUM**: Some data gaps, sources partially disagree, pattern has disruptions
- **LOW**: Significant gaps, single source, recent structural change

### Layer 5: Human Gate
User sees section-level verdicts + confidence badges. Can approve, reject with notes, edit directly, or request deeper analysis.

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
  data: { /* engine-populated structured data */ },
  narrative: "Costco generates cash like a toll booth on the busiest highway...",
  citations: [{ id: 1, ref: "fcf.yearly[2023]", text: "FCF $6.7B FY2023", source: "EDGAR" }],
  tables: [{ title: "FCF Conversion (10yr)", headers: [...], rows: [...] }],
  redFlags: ["FCF dipped 35% in FY2022 due to inventory build"],
  generatedAt: "2026-03-23T14:30:00Z",
  modelUsed: "claude-sonnet-4-20250514",
  tokenCost: { input: 8420, output: 2180 }
}
```

---

## Dual Deployment Path

### Phase A: CC Skills (Now)
```
/generate:one-pager COST      — Full One Pager
/generate:pitch-deck COST     — Full Pitch Deck
/generate:full-story COST     — Full Story
/generate:section COST pd 5   — Regenerate specific section
/debate COST                   — Run inversion debate
/fgr COST                     — FGR derivation workflow
```

CC skill reads curriculum → calls engines → generates sections → writes to report model → presents for review. One conversation, full context, conversational iteration. Free (included in Pro).

### Phase B: In-App Generation (Commercial)
Same workflow triggered by "Generate" button. `aiResearch.js` dispatches per-section API calls. Real-time progress (sections appear as they complete). Same report schema, same quality checks. Per-token cost (~$2-7 per full pipeline).

### What Stays the Same
DataPacket schema, report schema, curriculum content, quality checks, section templates, agent role definitions.

### What Changes
CC → one conversation, full context. API → separate calls, curated context per call.

---

## Cost Optimization

| Stage | Calls | Model Mix | Est. Cost |
|-------|-------|-----------|-----------|
| One Pager | 3-4 | All Sonnet | $0.05-0.15 |
| Pitch Deck | 13 | 11 Sonnet + 2 Opus | $0.80-2.50 |
| Full Story | 15 | 10 Sonnet + 5 Opus | $1.50-4.00 |
| **Full Pipeline** | **~32** | **Mixed** | **$2.35-6.65** |

Opus reserved for: valuation (FGR derivation), debate (adversarial reasoning), synthesis (writing quality).

---

## Commercial Architecture

```
Phase 1 (now):   Single user, localStorage, CC skills
Phase 2 (3mo):   Single user, in-app generation, Claude API
Phase 3 (6mo):   Multi-user backend, shared data cache, auth
Phase 4 (12mo):  Commercial SaaS, usage metering, Stripe billing
```

Shared data (same for all users): EDGAR financials, growth rates, guru holdings, transcripts, filings.
Per-user data: AI-generated reports, FGR assumptions, valuation inputs, approvals, notes.

Usage tiers: Free (5 one-pagers), Starter ($X/mo), Professional ($X/mo), Institutional (unlimited).

---

## Implementation Phases

### Phase 5A: Data Bridge + Report Schema (3-4 days, human: 2wk / CC: 3-4 days)
- Create `src/engines/dataExport.js`
- Define report JSON schema
- Create Node.js adapter for engines

### Phase 5B: Display Components (1 week, human: 3wk / CC: 1 week)
- `OnePager.jsx` — 6-section renderer
- `StatusBadge.jsx` — PASS/FAIL/REVIEW badges
- `SectionRenderer.jsx` — reusable section display

### Phase 5C: CC Skill + First Analysis (2-3 days)
- CC skill for `/generate:one-pager`
- Prompt templates in `knowledge/prompts/`
- First real analysis: generate One Pager for COST, compare to LULU example

### Phase 5D: Quality System (3-4 days)
- `critic.js` — validation engine
- `contextBudget.js` — token counting + budget management

### Phase 6: Pitch Deck (2 weeks)
- `PitchDeck.jsx` + 10 section sub-components
- `SensitivityTable.jsx`
- Prompt templates for all 10 sections
- CC skill for `/generate:pitch-deck`

### Phase 7: Full Story + Debate (2 weeks)
- `FullStory.jsx` + scored checklists + debate display
- `debate.js` — structured debate orchestration
- CC skills for `/generate:full-story` and `/debate`

### Phase 8: Polish + Export (1 week)
- `ExportView.jsx` — print/PDF view
- `ReferenceList.jsx` — citation manager
- `aiResearch.js` — in-app API-driven generation

---

## Key Design Decisions

1. **Section-level granularity** — Each section independently generated, cached, regenerable
2. **DataPacket is the contract** — Single canonical JSON shape consumed by all agents
3. **Curriculum injected, not embedded** — Knowledge files loaded at call time, updates propagate automatically
4. **The debate is real** — Bull/Bear/Judge use genuinely different system prompts with opposing mandates
5. **Web research cached** — 24hr cache per query, 10-15 searches max per Pitch Deck
6. **Red flags always required** — Even passing sections must identify at least one concern
7. **FGR is a workflow** — 5-input derivation with explicit user confirmation, not a single number

<!-- AUTONOMOUS DECISION LOG -->
## Decision Audit Trail

| # | Phase | Decision | Principle | Rationale | Rejected |
|---|-------|----------|-----------|-----------|----------|
| 1 | CEO-0A | Premises confirmed (all 8) | P6-Action | User confirmed all premises. Apprehensive about role count but confirmed 7 as starting point. | — |
| 2 | CEO-0A | GSD-style orchestration adopted | P1-Complete | User requested GSD pattern (orchestrator + parallel subagents). Natural fit — CC Agent tool spawns fresh-context subagents. | Simpler sequential loop |
| 3 | CEO-0A | Role flexibility emphasized | P3-Pragmatic | Roles are prompt configs, not systems. Adding/removing roles = editing a prompt file. User explicitly asked about this. | — |
| 4 | CEO-0A | Each subagent gets fresh context | P1-Complete | User asked specifically about this. Yes — CC Agent tool and API calls both provide fresh context per agent. | Shared single conversation |
| 5 | CEO-0D | Mode: SELECTIVE EXPANSION | P1+P3 | Hold scope baseline, surface expansions individually. Plan is already ambitious — selective cherry-picking of improvements. | — |
| 6 | CEO-3 | Generate JSON before building UI (5C before 5B) | P6-Action | TASTE: Could validate AI quality before investing in display components. But display lets you visually compare to LULU examples. | — |
| 7 | CEO-8 | Success = LULU comparison benchmark | P1-Complete | Generate LULU One Pager + Pitch Deck, compare section-by-section to real examples. 80%+ depth match = validated. | — |
| 8 | CEO-9 | Defer multi-user to Phase 3+ | P3-Pragmatic | Commercial infrastructure adds no value until AI quality is proven. Get quality right first. | — |
| 9 | ENG-0 | Data bridge: start with /browse, build Node adapter later | P5-Explicit | Prototype with gstack /browse to extract data from running app. Build proper Node adapter in Phase 5A. | Node adapter first |
| 10 | ENG-1 | Cross-section context: structured summaries | P5-Explicit | Each section includes a summary field. Downstream agents receive summaries, not full narratives. | Full narrative injection |
| 11 | ENG-1 | FGR as independent subagent with user confirmation | P1-Complete | FGR is the most important number. Deserves its own sub-workflow and explicit user sign-off. | Inline in Section 10 |
| 12 | ENG-1 | Report schema backward-compatible | P3-Pragmatic | Section schema goes inside existing onePager/pitchDeck/fullStory fields. No breaking changes. | — |
| 13 | ENG-2 | Design review deferred to Phase 5B | P6-Action | UI design review runs when building display components, not during architecture planning. | Run design review now |

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | clean | 8 premises confirmed. GSD orchestration adopted. 2 taste decisions surfaced. |
| Eng Review | `/plan-eng-review` | Architecture & tests | 1 | clean | 5 findings: data bridge strategy, cross-section context, FGR sub-workflow, report compat, web search rate limits. |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | deferred | Deferred to Phase 5B (display component implementation). |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | skipped | Not available in this session. |

**VERDICT:** CEO + ENG REVIEWS COMPLETE via `/autoplan`. 13 auto-decisions logged. 2 taste decisions surfaced at approval gate.
