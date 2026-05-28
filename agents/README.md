# Agent Directory

Thesis uses a small team of specialist agents instead of one general-purpose prompt. Each agent receives only the DataPacket slice, source material, and prior-stage findings it needs for its assignment. The result is a gated research process where every section has a clear owner, every wave has a purpose, and synthesis happens only after the evidence has been collected.

This directory contains the production prompts used by the CLI for the three research stages:

1. **One Pager** — fast value-investing screen.
2. **Pitch Deck** — 12-section research case across five waves.
3. **Final Thesis** — conviction document with deep analysis, adversarial debate, and trade plan.

> Agents do not receive the full DataPacket by default. The orchestration skills slice the DataPacket per role so each agent sees the fields relevant to its job.

---

## Stage 1 — One Pager

The One Pager is the first gate. It answers one question: **is this company worth deeper research?**

| Agent | Prompt | Stage | Wave | Tools & inputs | What it does |
|---|---|---:|---:|---|---|
| **One Pager Analyst** | [`one-pager/prompt.md`](one-pager/prompt.md) | 1 | — | Sliced DataPacket, web search, structured JSON output | Produces the initial pass/fail/watchlist screen using company context, minimum standards, meaning, growth metrics, valuation summary, and an overall verdict. |

A `FAIL` stops the pipeline before the user spends Pitch Deck or Final Thesis research budget.

---

## Stage 2 — Pitch Deck

The Pitch Deck moves from screening to organized research. Agents run in five sequential waves. Agents inside a wave run in parallel where safe; later waves inherit prior findings instead of duplicating work.

### Wave map

| Wave | Name | Agents | Purpose |
|---:|---|---|---|
| 0 | Primary source reading | Annual Reader, Quarterly Reader | Extract filing and transcript facts before analysis begins. |
| 1 | Business context | Business Analyst, Competitor Evaluator — Market Position | Establish what the company does and whether it has real market strength. |
| 2 | Deep analysis | Competitor Evaluator — Moats, Financial Analyst, Management Evaluator | Test durability, numbers, balance sheet quality, and leadership. |
| 3 | Risk / valuation | Risk Analyst, Valuation Specialist | Pressure-test the case and determine what price makes sense. |
| 4 | Synthesis | Synthesis Writer | Weave all sections into the final Pitch Deck verdict. |

### Pitch Deck agents

| Agent | Prompt | Wave | Sections | Tools & inputs | What it does |
|---|---|---:|---|---|---|
| **Annual Reader** | [`annual-reader/prompt.md`](annual-reader/prompt.md) | 0 | `psr_annual` | SEC annual filings, proxy statements, sliced DataPacket, structured output | Reads up to five years of annual reports chronologically and extracts business evolution, strategy changes, risks, accounting signals, and management promises. |
| **Quarterly Reader** | [`quarterly-reader/prompt.md`](quarterly-reader/prompt.md) | 0 | `psr_quarterly` | Recent 10-Qs, earnings transcripts, sliced DataPacket, structured output | Captures the current pulse: guidance changes, management tone, recent performance, promise fulfillment, and emerging trends. |
| **Business Analyst — Pitch Deck** | [`business-analyst-pitchdeck/prompt.md`](business-analyst-pitchdeck/prompt.md) | 1 | `setup`, `business_quality` | Sliced DataPacket, web search, web fetch, PSR findings | Explains the company, its operating model, why it matters, and whether the business is simple, predictable, and understandable. |
| **Competitor Evaluator — Market Position** | [`competitor-evaluator-market-position-pitchdeck/prompt.md`](competitor-evaluator-market-position-pitchdeck/prompt.md) | 1 | `market_position` | Peer metrics, industry classification, web search, web fetch | Benchmarks the company against peers and tests whether it truly dominates its market. |
| **Competitor Evaluator — Moats** | [`competitor-evaluator-moats-pitchdeck/prompt.md`](competitor-evaluator-moats-pitchdeck/prompt.md) | 2 | `moat_analysis` | Peer metrics, Section 3 output, web search, web fetch | Validates moat claims, classifies moat types, and asks why competitors have not eroded the advantage. |
| **Financial Analyst — Pitch Deck** | [`financial-analyst-pitchdeck/prompt.md`](financial-analyst-pitchdeck/prompt.md) | 2 | `cash_generation`, `returns_leverage`, `balance_sheet`, `accounting_red_flags` | Financial statements, TTM data, growth rates, return metrics, debt metrics, FCF, key metrics, web research | Owns the numbers: cash generation, ROE/ROIC, leverage, balance sheet resilience, and accounting-quality red flags. |
| **Management Evaluator — Pitch Deck** | [`management-evaluator-pitchdeck/prompt.md`](management-evaluator-pitchdeck/prompt.md) | 2 | `management_capital_allocation` | Compensation, insider activity, guru holdings, return metrics, web search, web fetch | Assesses CEO quality, capital allocation, incentives, insider ownership, and shareholder alignment. |
| **Risk Analyst — Pitch Deck** | [`risk-analyst-pitchdeck/prompt.md`](risk-analyst-pitchdeck/prompt.md) | 3 | `risk_profile` | Financials, peers, insiders, industry context, web search, web fetch | Builds the strongest evidence-based bear case using PEST risks, thesis stress tests, and counterarguments. |
| **Valuation Specialist — Pitch Deck** | [`valuation-specialist-pitchdeck/prompt.md`](valuation-specialist-pitchdeck/prompt.md) | 3 | `valuation` | Growth rates, return metrics, FCF, key metrics, current pricing, web search, web fetch | Derives future growth assumptions and produces value-investing buy-price ranges using multiple valuation methods. |
| **Synthesis Writer — Pitch Deck** | [`synthesis-writer-pitchdeck/prompt.md`](synthesis-writer-pitchdeck/prompt.md) | 4 | `investment_verdict` | All prior Pitch Deck sections, quality checks, structured output | Turns specialist findings into the final investment verdict and narrative. |

---

## Stage 3 — Final Thesis

The Final Thesis is the conviction gate. It inherits the completed Pitch Deck and does not rerun primary source reading. The stage is organized into three phases: deep analysis, adversarial debate, and trade plan.

### Phase map

| Phase | Name | Agents | Purpose |
|---:|---|---|---|
| 1 | Deep analysis | Risk Event, Business, Competitor, Management, Valuation | Build five conviction-level sections in parallel from Pitch Deck inheritance and fresh evidence. |
| 2 | The Debate | Bull, Bear, Rebuttal, Judge, Compose | Pressure-test the thesis through an adversarial sequence. |
| 3 | Trade plan | Trade Plan Writer | Convert conviction into portfolio action rules. |

### Final Thesis agents

| Agent | Prompt | Phase | Sections / role | Tools & inputs | What it does |
|---|---|---:|---|---|---|
| **Risk Analyst — Event Analysis** | [`risk-analyst-finalthesis-event/prompt.md`](risk-analyst-finalthesis-event/prompt.md) | 1 | `event_analysis` | Pitch Deck inheritance, sliced DataPacket, web search, web fetch | Determines whether the recent stock move or business event is temporary, structural, or absent. |
| **Business Analyst — Final Thesis** | [`business-analyst-finalthesis/prompt.md`](business-analyst-finalthesis/prompt.md) | 1 | `business_analysis` | Pitch Deck inheritance, company and peer data, web search, web fetch | Deepens the business understanding into a conviction-level analysis of meaning, quality, and durability. |
| **Competitor Evaluator — Final Thesis** | [`competitor-evaluator-finalthesis/prompt.md`](competitor-evaluator-finalthesis/prompt.md) | 1 | `moat_analysis` | Pitch Deck inheritance, peer metrics, industry data, web search, web fetch | Independently validates whether the company's competitive advantages are real and durable. |
| **Management Evaluator — Final Thesis** | [`management-evaluator-finalthesis/prompt.md`](management-evaluator-finalthesis/prompt.md) | 1 | `management_analysis` | Pitch Deck inheritance, compensation, insiders, guru holdings, returns, web search, web fetch | Judges whether leadership is competent, honest, aligned, and capable of compounding capital. |
| **Valuation Specialist — Final Thesis** | [`valuation-specialist-finalthesis/prompt.md`](valuation-specialist-finalthesis/prompt.md) | 1 | `valuation_analysis` | Pitch Deck valuation, financials, FCF, growth rates, current price, web search, web fetch | Runs a price-implied-expectations reality check and validates whether the Pitch Deck buy prices are still rational. |
| **Synthesis Writer — Bull** | [`synthesis-writer-finalthesis-bull/prompt.md`](synthesis-writer-finalthesis-bull/prompt.md) | 2 | Debate step 1 | Final Thesis Sections 1-5, no fresh web research | Builds the strongest honest bull thesis from completed deep-analysis sections. |
| **Risk Analyst — Bear** | [`risk-analyst-finalthesis-bear/prompt.md`](risk-analyst-finalthesis-bear/prompt.md) | 2 | Debate step 2 | Bull thesis, sliced DataPacket, web search, web fetch | Attacks the bull case with cited counter-evidence, short theses, negative coverage, and material risk inversions. |
| **Synthesis Writer — Rebuttal** | [`synthesis-writer-finalthesis-rebuttal/prompt.md`](synthesis-writer-finalthesis-rebuttal/prompt.md) | 2 | Debate step 3 | Bear case, prior sections, web search | Responds to each bear inversion with evidence-based counterarguments and already-priced-in context. |
| **Financial Analyst — Judge** | [`financial-analyst-finalthesis/prompt.md`](financial-analyst-finalthesis/prompt.md) | 2 | Debate step 4 | Bull, Bear, Rebuttal, completed analysis | Acts as neutral arbiter, scoring argument quality and deciding which side survives the debate. |
| **Synthesis Writer — Compose** | [`synthesis-writer-finalthesis-compose/prompt.md`](synthesis-writer-finalthesis-compose/prompt.md) | 2 | `debate` | Bull, Bear, Rebuttal, Judge outputs | Converts the debate sequence into a cohesive Section 6 narrative with monitoring points. |
| **Trade Plan Writer** | [`trade-plan-finalthesis/prompt.md`](trade-plan-finalthesis/prompt.md) | 3 | `trade_plan` | Completed Final Thesis, composed debate, valuation conclusions | Translates the thesis into position sizing, entry strategy, sell rules, monitoring triggers, and contingency plans. |

---

## Tooling model

Most analytical agents combine three evidence streams:

- **DataPacket slices** for structured financial data, peer metrics, ownership, compensation, and filing provenance.
- **Primary sources** such as SEC filings and earnings transcripts, either read directly by PSR agents or inherited from earlier stages.
- **Web search / web fetch** where the prompt requires current context, market narrative, bear cases, management commentary, or external corroboration.

Synthesis-only agents are intentionally narrower. They generally work from completed section outputs rather than opening a new research loop, which keeps the final narrative grounded in the evidence already gathered.

## Naming conventions

Agent folders follow a role-stage pattern:

- `*-pitchdeck` — Stage 2 Pitch Deck specialist.
- `*-finalthesis` — Stage 3 Final Thesis specialist.
- `annual-reader` / `quarterly-reader` — primary source readers used before Pitch Deck analysis.
- `synthesis-writer-*` — synthesis, debate, rebuttal, or composition roles.

When adding a new agent, keep the folder name specific, document its stage and dependencies here, and update the relevant orchestration skill so the prompt is actually used by the pipeline.
