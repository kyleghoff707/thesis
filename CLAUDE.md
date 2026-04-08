# Thes1s

## Project Overview
**Thes1s** (pronounced "thesis") — a single-user local desktop app for Rule One stock research and analysis. The "1" nods to Rule One — pairs with the user's portfolio tracker **stickeR1**. Generates comprehensive research reports through a 3-stage gated workflow: One Pager → Pitch Deck → Full Story.

This app is a research report generator — it answers "should I invest in this company?" through the Rule One lens. It is NOT a portfolio tracker.

The user is NOT a programmer. Keep explanations in plain English.

**Goal**: Reduce 40+ hours of manual Rule One research per company using AI-assisted analysis.

### Branding
- **Name**: Thes1s — "1" replaces the "i"
- **Logo**: `public/logo.svg` — fused T1 letterform. Teal-500 + slate-800.
- **In-app**: Logo mark (22px) + styled text ("Thes" medium, "1" custom SVG glyph in teal — hybrid 1/i with tight wedge flag + narrow base, "s" medium). Inter font.

---

## Tech Stack
- **Desktop**: Tauri (native macOS `.app`)
- **Frontend**: Vite + React (functional components, hooks, inline styles with dark/light palette)
- **Storage**: localStorage (reports, settings, watchlists), IndexedDB (EDGAR, guru, price, insider, compensation caches) via `cacheStore.js`
- **AI**: Claude API direct from app (`VITE_CLAUDE_KEY` in `.env.local`)
- **Financial Data**: SEC EDGAR XBRL (all financials, 13F guru holdings, N-PORT, insiders, compensation — free), Yahoo Finance (prices, stock splits — free), Finviz (analyst estimates — free), GuruFocus (optional $25/mo API), Alpha Vantage (earnings transcripts — free 25 calls/day, 2-key failover: `VITE_ALPHA_VANTAGE_KEY` + `VITE_ALPHA_VANTAGE_KEY_2`)
- **Charts**: Recharts
- **Deps**: recharts, @anthropic-ai/sdk, uuid, react-router-dom, turndown, turndown-plugin-gfm, yahoo-finance2, cheerio, idb, zod (structured output schemas)
- **No server, no auth** — runs entirely locally. API calls go direct to external services.

For detailed API integration notes (CORS proxying, EDGAR XBRL details, parsing internals), see `knowledge/engineering/app-architecture.md`.

---

## Architecture Reference
**When debugging or modifying any engine, API integration, scoring algorithm, CORS proxy, validation system, or parser** — read `knowledge/engineering/app-architecture.md` first. It contains detailed technical documentation for all implemented systems (moved from CLAUDE.md to save context window).

**When debugging or modifying the XBRL extraction engine, taxonomy, provenance, industry overlays, or coverage systems** — read `gstack/plans/gstack-xbrl-engine-strategy-eng-plan-20260318.md` first. It contains the full three-layer architecture, design decisions, coverage audit results, and implementation history.

### Three-Layer XBRL Engine (`edgarFinancials.js`)

The engine uses a three-layer resolution strategy to map SEC XBRL tags to ~85 standardized financial fields. Each layer is a fallback — Layer 1 handles ~96% of cases, Layer 2 catches most of the rest, Layer 3 handles the long tail. Validated across all 503 S&P 500 companies with 0 failures.

**Coverage (S&P 500):** Tier 1 (scoring-critical): **96.1%** | Tier 2 (display): **90.8%** | Tier 3 (expanded): **83.9%**

| Layer | What | How | Performance |
|-------|------|-----|-------------|
| **Layer 1** | Static tag map (~200 tags) in `edgarFinancials.js` | Priority-ordered fallback tags per field | O(1), handles ~96% |
| **Layer 2** | Pre-built taxonomy JSON (1,937 descendant tags) | `taxonomy-hierarchy.json` built from FASB calc linkbase (3 versions) | O(1) lookup, <100KB |
| **Layer 3** | AI tag classification (1,989 pre-classified tags) | `sp500-tag-classifications.json` built via Claude Sonnet | O(1) lookup for S&P 500, runtime AI for others |

**Industry overlays** — Additive taxonomies for bank (16 income + 10 balance + derived NIM/efficiency), REIT (4 income + 8 balance + 4 CF + derived FFO/NOI/NAV), and insurance (12 income + 7 balance + 3 CF + derived loss/combined ratio/float). Detected via SIC code → `industryClassifier.js`.

**Data provenance** — Every extracted value carries parallel metadata: which XBRL tag resolved it, which layer (1/2/3), whether derived, confidence score (Layer 3), and human-readable formula (derived fields). Annual AND TTM provenance tracked. Zero breaking changes — components read bare numbers, provenance is opt-in.

**Coverage monitor** — Baseline storage + change detection (fields gained/lost/tags changed) per ticker in localStorage. Auto-saves baseline on first load.

**Display name resolution** — Ticker search dropdown uses a 2-tier name lookup: (1) curated S&P 500 names from `src/data/sp500-display-names.json` (503 companies, sourced from Wikipedia + manual review), (2) `formatCompanyName()` algorithmic fallback for non-S&P companies (handles ALL CAPS → title case, acronyms, legal suffixes). Curated map is regenerated via `node validation/scripts/audit-display-names.js`. Raw SEC names are cached in localStorage; display names are applied at index-build time so curated JSON updates take effect without cache clearing.

### EDGAR Frames API — Period Distinction (Critical)
The Frames endpoint (`/api/xbrl/frames/us-gaap/{tag}/{unit}/CY{year}.json`) uses **different period specifiers** for balance sheet vs income statement tags:
- **Duration tags** (income statement, cash flows): `CY{year}.json` — e.g., `CY2024.json`
- **Instant tags** (balance sheet, point-in-time): `CY{year}Q4I.json` — e.g., `CY2024Q4I.json`

All tag definitions in `FRAMES_TAGS` and `PEER_FRAMES_TAGS` have a `period: 'instant' | 'duration'` property. **Always use this property** when constructing Frames API URLs. Using the wrong period returns 404.

### XBRL Taxonomy Conventions
- **`negate` flag**: Some cash flow taxonomy fields have `negate: true` (e.g., `change_in_receivables`, `change_in_inventory`, `other_noncash_items`). This flips XBRL's balance-sheet-change convention to cash-impact convention at extraction time. Do NOT add `negate` to payables — payable increases are already positive in both conventions.
- **Debt sanity check**: `computeDerivedFields` has a ratio-based fallback — if `total_debt / liabilities < 5%` AND `interest_expense > 0`, derives debt from `liabilities - known-non-debt-items` (includes `taxes_payable`). The interest expense gate prevents false positives on zero-debt companies (e.g., LULU) where all liabilities are operating leases and accruals. REITs/banks/insurance with genuine debt tag gaps still trigger the fallback because they report significant interest expense.
- **Normalized operating income**: `normalized_operating_income` = `operating_income_loss` + irregular charges (restructuring, goodwill write-offs, asset impairments). Only set when at least one irregular item is non-zero. Combined XBRL tags (`RestructuringCostsAndAssetImpairmentCharges`) are handled via a separate `restructuring_and_impairment` field to prevent double-counting with `asset_impairment`. Not yet surfaced in UI — available for AI report generation and future Financials tab toggle. Orthogonal to the Version dropdown (restated/original): version controls XBRL extraction method, normalization strips one-time charges.
- **SGA derivation**: `sga` taxonomy field uses only the combined `SellingGeneralAndAdministrativeExpense` tag. Separate `selling_expense` and `general_and_admin_expense` fields exist; `computeDerivedFields` sums them into `sga` when the combined tag is null (fixes MSFT, others that report separately).
- **Derived field formulas**: `getDerivedFormula()` returns human-readable formula strings for all ~40 derived fields. Stored in `provenance[year][field].formula` for Audit tab display.
- **TTM provenance**: TTM extraction tracks which tag resolved each field, with Layer 1/2 detection and derived field formulas. AI report generation can trace any TTM value back to its XBRL source.
- **REIT FFO caveat**: FFO is derived (not tagged in XBRL). `gain_loss_on_real_estate_sales` was discontinued by many REITs after FY2018 — FFO is approximate for recent years. AI reports should cross-reference NAREIT-published FFO.
- **Insurance float caveat**: Approximation from XBRL balance sheet items. BRK's reported float cannot be reconstructed from standard us-gaap tags. Pure-play insurers (MET, ALL) have better coverage.
- **AFFO maintenance capex**: Hardcoded at 15% of total capex in overlay (varies by REIT subtype: EQIX ~30-40%, PLD ~10-15%). AI reports should use user's maintenance capex % from Valuation Calculators instead.

---

## Current Status
**v1.3 complete — all 3 pipeline stages validated in-app.** The entire AI report generation pipeline is built and functional: 12 specialized agents, wave-based orchestration, structured output schemas, quality validation (critic), and in-app rendering for One Pager, Pitch Deck, and Full Story. Validated on LULU (full 3-stage), SFM (Pitch Deck), and CMG. The CC-to-API migration is complete — pipeline runs via direct Claude API calls with prompt caching.

Built across Phases 5A–24 (archived in `previous-prompt-and-plans/gsd-archive/phases/`), with final in-app validation done via gstack skills (QA, design review, eng review). See `gstack/` folder for plan/review/qa artifacts.

**Pipeline cost:** ~$8-12/company for Pitch Deck (with prompt caching), ~$13-14 for Full Story, ~$28-30 for all 3 stages. Cost optimization (PSR reuse, model downgrades) is deferred.

**Normalization engine:** Complete. 94.8% MS accuracy, 94.8% S&P 500 compensation parsing (477/503). Key metrics validated against FMP S&P 100 (no formula bugs, 85-94% on core fields). See `NORMALIZATION-STATUS.md` for full details.

### What's Built
**Data layer (Phases 1-4):** All data engines, all UI tabs (Overview, Financials, Growth, Valuation, Competitors, Insiders, Filings, Audit), Gurus tab with 13F + N-PORT, Watchlists, executive compensation, filing markdown conversion, 5 audit systems, Competitors tab with SIC-based peer discovery + Frames API metrics + Yahoo batch quotes + Rule One scores, three-layer XBRL engine with provenance tracking and coverage monitoring (173 tests via vitest), earnings call transcript engine.

**Agent pipeline (Phases 5A-17):** 12 AI agents with configs, prompts, stage overlays, writing briefs. Wave-based orchestrator with dispatch table. `aiResearch.js` Claude API dispatch engine with structured outputs (Zod schemas). `pipelineManager.js` for wave orchestration. `critic.js` quality validation (citation classification, data gap mapping, red flag detection, methodology scoring). Data assembly pipeline (`dataExport.js`). CLI runner (`scripts/run-pipeline.js`). One Pager single-call generator (`onePagerGenerator.js`). Full Story adversarial debate (Bull/Bear/Rebuttal/Judge).

**In-app wiring (Phases 18-24):** Storage migration, shared report infrastructure, stage navigation + gating, report renderers (SectionRenderer, ChecklistRenderer, DebateRenderer), PromiseTracker, generation UX (phases, timer, progress bar, placeholders), export generators (PDF/Word), PM workflow controls. All 3 stages render and generate in-app.

### What's NOT Built (Remaining Polish)
- Sensitivity tables in reports (schema exists, not yet in agent output)
- Cost optimization (PSR reuse across stages, Sonnet downgrades for preprocessing agents)
- Content quality improvements (citation URL laundering, DataPacket path fabrication by agents)
- Multi-user / server-side architecture (future — see Agent SDK decision in memory)

---

## Research Workflow (3-Stage Gated)

The core workflow follows `knowledge/workflow.md`. Each stage is a gate — user must approve before the next unlocks.

### Stage 1 — One Pager (Filter)
**Template**: `knowledge/stage-1-one-pager/template.md` | **Curriculum**: `one-pager.md` | **Reference**: `research-references/rule-one-fundamentals.md` | **Example**: LULU One Pager.PDF
Quick screen: Company Info, Minimum Standards, Meaning/Management KPIs, Growth Metrics, Summary. Pass/Fail gate.

### Stage 2 — Pitch Deck (Research)
**Template**: `knowledge/stage-2-pitch-deck/template.md` | **Curriculum**: `pitch-deck-I.md` through `IV.md` | **Example**: LULU/
10-part business case: Radar, Simple & Predictable, Market Position, Barriers & Moats, FCF, Management, ROE/ROIC/ROA & Debt, Balance Sheet, PEST Risks, Valuation (MOS + PBT + Ten Cap + Equity Bond).

### Stage 3 — Full Story (Conviction)
**Template**: `knowledge/stage-3-full-story/template.md` | **Curriculum**: `story-form-I.md`, `II.md` | **Example**: LULU/
Final gate: Event Analysis, Meaning (15pt checklist), Moat (15pt), Management (13pt), Valuation Confirmation (sensitivity tables, growth funding), Inversion & Rebuttal, Trading Strategy, PACE Plan.

---

## FGR (Future Growth Rate)

FGR is NOT a formula — it's an informed assessment using 5 inputs:
1. **Rear View Mirror** — Historical composite growth rate (BVPS+Div, Earnings, OpCash, Revenue)
2. **Market Relativity** — Cumulative stockholder return vs S&P 500 and sector
3. **Company Guidance** — Management's stated growth plans
4. **Sector/Industry** — Industry CAGR from trade journals
5. **Analysts** — Seeking Alpha, Wall St consensus, revenue growth estimates

Average the quantifiable inputs → FGR. FGR feeds ALL valuation calculators. The app must help users derive and document each input.

### Growth Rate Analysis — Composite GR
The Composite GR in the Weighted Average panel averages all selected metrics. Default Big 4: BVPS+Div, Earnings, OpCash, Revenue. Any metric can be toggled in/out — including Market Cap, FCF, and return metrics (ROE, ROIC, ROA). Growth metrics use weighted avg YoY growth rates; return metrics use simple averages of annual values (they're already rates, not dollar series).

---

## Valuation Calculators

Four methods, all computed in Stage 2 and confirmed in Stage 3. **All calculators produce buy RANGES, not single prices** — key assumption inputs accept Low/High values, generating conservative and optimistic buy prices per method. The hero box shows the full range (min to max) across all enabled methods.

### Range Inputs (Low/High)
These 3 inputs are estimates/assumptions and accept ranges:
- **FGR** (Future Growth Rate) — affects MOS + PBT. Range fields appear below the FGR radio source selector.
- **Maintenance CapEx %** — affects Ten Cap only. Higher % = conservative (more capex deducted).
- **Historical Avg P/E** — affects Equity Bond only.

**Future P/E** is a single value (not a range) — default is `2 × max(FGR Low, FGR High)`, capped at historical high P/E. The FGR range already provides conservatism; a PE range on top was redundant.

All other inputs (EPS, CFO, CapEx, Tax, Shares, BVPS, ROE, Retained Ratio) are factual or methodology-fixed and remain single values. MARR is shared between MOS and PBT (default 15%); Equity Bond has its own independent MARR (default 20%) and MOS% (default 50%).

### MOS (Margin of Safety)
EPS (TTM or 3yr avg) → grow at FGR for 10 years → Future P/E (≤ 2x FGR, capped at historical high) → Future Price → discount at 15% MARR → Sticker Price → 50% MOS = Buy Price.

### PBT (Payback Time)
FCF Ratio (FCF/Earnings, exclude outliers) → FCF per share → compound at FGR → sum 8 years → target ≤ 8 years payback.

### Ten Cap (Owner Earnings)
Cash from Ops - Maintenance CapEx (often 70% assumed) + Tax Provision = Owner Earnings. Ten Cap Price = 10 × (OE / Shares Outstanding).

### Equity Bond (from *Buffettology*, 1997)
BVPS → grow book value 10yr at (ROE × retained ratio) → future BVPS → future EPS (× ROE) → future price (× historical avg P/E) → discount at MARR → Sticker Price → MOS% discount → Buy Price. Also computes CAGR at current price (the original Buffettology output). Uses P/E multiplier per the original Buffettology method. Equity Bond has its own independent MARR (default 20%) and MOS% (default 50%), both separate from the MOS calculator. See `knowledge/research-references/equity-bond-research.md` for full methodology research.

### Sensitivity Tables
Vary FGR, EPS, CapEx %, ROE assumptions across methods → range of buy prices.

---

## Knowledge Base

```
knowledge/
├── engineering/
│   ├── agent-workflows/           — Agent architecture, hybrid agent model
│   ├── agentic-workflows/         — Agentic workflow patterns
│   ├── app-architecture.md        — Detailed API/engine/scoring/validation docs
│   └── edgar-xbrl-taxonomy.md
├── morningstar-financial-statements/ — 50-company MS CSV truth set (IS/BS/CF per ticker)
├── morningstar-quarterly-financial-statements/
├── r1-toolbox-financial-statements/
├── intel-reports/                 — Dated research investigations and findings
│   ├── ms-xbrl-normalization-research.md
│   ├── edgar-taxonomy-research-report.md
│   ├── executive-compensation-extraction-research.md
│   ├── consolidated_vs_expanded_financial_statements.md
│   ├── morningstar_original_vs_restated_financials.md
│   └── morningstar-complete-data-definitions.md
├── research-references/
│   ├── advanced-financial-analysis.md
│   ├── buffett_letters_claude_training_set/
│   ├── capex-cash-flow-explained.md
│   ├── edgar-industry-classification-report.md
│   ├── equity-bond-research.md    — Definitive research: 3 variants, source books, worked examples, P/E vs P/B analysis
│   ├── fgr.md                     — FGR methodology, Big 4 growth rates, 5 perspectives
│   ├── guru-list.md               — 43 named Gurus for 13F lookup
│   ├── rule-one-fundamentals.md   — R1 philosophy, terms, events, investment requirements, search methods
│   └── tools-for-analysis.md      — 3 Ms framework, practical tools, data sources for research
├── stage-1-one-pager/             — template.md, one-pager.md, LULU example
├── stage-2-pitch-deck/            — template.md, 4 curriculum files, LULU example
├── stage-3-full-story/            — template.md, 2 curriculum files, LULU example
└── pre-course-examples/           — User's own research (Old Template, EW, SFM, MU, ODFL)
```

### Taxonomy Research (not gitignored — tracked in repo)

**When working on classification, peer discovery, or the Competitors tab** — read `industry-classification/taxonomy-classification-learning.md` first.

```
industry-classification/
├── taxonomy-classification-learning.md — Claude agent guide for classifying companies
├── thes1s-taxonomy-tree.json           — 12 sectors, 52 industry groups, 176 industries
├── thes1s-company-assignments.json     — 5,758 company classifications
├── yahoo-to-thes1s-crosswalk.json      — 145 Yahoo → Thes1s mappings
├── sic-to-thes1s-crosswalk.json        — SIC → Thes1s mapping
├── stock-industry-classification.md          — Full research report (6 taxonomy systems)
├── phase-2-session-summary.md          — Pipeline build notes
└── pipeline/                           — Intermediate data (universe, yahoo-seed)
```

---

## Report Generation Requirements (from User's Research Patterns)

These patterns were observed across the user's real analyses (LULU, EW, SFM, MU, ODFL) and must be built into the AI report generation:

1. **FGR derivation workflow** — Guide through 5 inputs with sources
2. **Sensitivity/matrix tables** — Vary FGR, EPS, CapEx across methods
3. **Market share ceiling analysis** — Prove growth rate doesn't require unrealistic dominance
4. **Section-level conclusions** — Pass/fail per major section
5. **Inversion & Rebuttal** — Source bear cases, document rebuttals
6. **Multi-source verification** — Cross-reference 2-3+ sources per claim
7. **Iterative completion** — Some sections stay incomplete until more data
8. **Tone** — Thorough but conversational. Cite specific numbers. OK to say "I don't know yet"
9. **Working view vs export view** — Raw checklist (color-coded status) + polished narrative
10. **Competitor benchmarking** — 2-3+ competitors on every metric, industry-contextual
11. **Dual Owner Earnings** — Rule One method AND Graham method side by side
12. **Valuation as ranges** — Not single numbers, present buy price ranges
13. **Industry-contextual benchmarks** — Gross margin ≥40% is a starting point, not a rule. Interpret within industry.
14. **Reference/citation system** — Numbered refs, bracket inserts (ODFL had 40+ sources)
15. **Industry-wide peer screens** — 15+ companies, not just 2-3 hand-picked
16. **Watchlist/no-buy outcomes** — "Great company but too expensive" is a valid conclusion
17. **Cyclical business handling** — CAGR from "first positive year," multiple capex ratios
18. **Industry-specific KPIs** — Adapt per industry (semis: ASP, cost per bit; freight: operating ratio)
19. **Acquisition history tracking** — Table of all acquisitions
20. **Red flag tracking** — Explicit section for concerns, even when thesis is bullish

---

## Source Structure

```
agents/                          — 12 AI agents + orchestrator
├── orchestrator/                — Wave-based dispatch (code-driven, NOT AI)
│   ├── config.json              — Dispatch routing, section mapping for all 3 stages
│   ├── dispatch-table.json      — Phase sequencing, parallel/dependency specs
│   ├── schemas/                 — checklist-item.schema.json, debate-step.schema.json
│   └── README.md
├── business-analyst/            — Meaning & Simple Predictability (PD sections 1-2, OP sections 1-2, FS section 2)
├── competitor-evaluator/        — Market Position & Barriers/Moats (PD sections 3-4)
├── financial-analyst/           — FCF, ROE/ROIC, Balance Sheet (PD sections 5,7,8)
├── management-evaluator/        — Management Quality (PD section 6)
├── risk-analyst/                — PEST Risks (PD section 9)
├── valuation-specialist/        — Valuation & FGR (PD section 10, OP section 5)
├── synthesis-writer/            — Polish & Final Synthesis
├── annual-reader/               — Annual report reading (preprocessing)
├── quarterly-reader/            — Quarterly report reading (preprocessing)
├── primary-source-reader/       — SEC filing extraction
├── data-assembler/              — Data staging (orchestration code-driven)
├── writing-briefs/              — 12 reference docs for agent writing guidance
└── __tests__/                   — agentDefinitions.test.js, ccSkill.test.js
    (Each agent has: config.json, prompt.md, prompts/fullStory.md, README.md)

scripts/
├── run-pipeline.js              — Main CLI entry: assemble DataPacket, dispatch, write output
├── run-full-story.js            — Full Story CLI (debate orchestration)
├── run-quality-v4.js            — Quality validation CLI
├── assemble-data.js, prepare-data.js, data-quality-checkpoint.js
├── preprocess-filings.js, prefetch-gurus.js, normalize-reports.js
├── node-esm-loader.js           — ESM loader for CLI scripts
└── pdf/                         — Thes1s-branded PDF toolkit

src/
├── main.jsx, App.jsx, theme.js
├── schemas/
│   ├── reportSection.js         — Zod schema: contract for all agent outputs
│   ├── debateStep.js            — Bull/Bear/Rebuttal/Judge debate outputs
│   ├── dataPacket.js            — Complete research data assembled from all engines
│   ├── progress.js              — Generation state schema
│   └── onePagerOutput.js        — One Pager output format
├── components/
│   ├── Layout.jsx, TickerSearch.jsx, Watchlists.jsx, Settings.jsx
│   ├── ResearchEmpty.jsx, ResearchList.jsx, ReportsList.jsx
│   ├── Toolbox.jsx              — Main research container (8 tabs)
│   ├── CompanyHeader.jsx, StockAtGlance.jsx, ScoreTable.jsx
│   ├── FinancialStatements.jsx, GrowthAnalysis.jsx, GrowthRateAnalysis.jsx
│   ├── Valuation.jsx, ValuationCalculators.jsx, ValuationInputs.jsx, HistoricalBuyPrices.jsx
│   ├── Insiders.jsx, ExecutiveCompensation.jsx, Filings.jsx
│   ├── Gurus.jsx, GuruPortfolio.jsx
│   ├── GuruAudit.jsx, TickerAudit.jsx, NportAudit.jsx, CompAudit.jsx, TickerDataAudit.jsx
│   ├── CompanyEvents.jsx, Competitors.jsx, Validation.jsx, CollapsibleSection.jsx
│   ├── OnePager.jsx             — Stage 1 renderer (476L)
│   ├── PitchDeck.jsx            — Stage 2 renderer (1,270L)
│   ├── FullStory.jsx            — Stage 3 renderer (998L) — 6-phase debate + synthesis
│   ├── pitchDeck/               — AssumptionTracker.jsx, DeepDivePanel.jsx, IndustryCard.jsx
│   ├── SectionRenderer.jsx      — Render individual report sections with citations
│   ├── ChecklistRenderer.jsx    — Render meaning/moat/management checklists
│   ├── DebateRenderer.jsx       — Render Bull/Bear/Rebuttal/Judge debate steps
│   ├── ReportMarkdown.jsx       — Markdown rendering with syntax highlight
│   ├── PromiseTracker.jsx       — Phase/section completion tracking UI
│   ├── GenerateButton.jsx, ConfirmGenerateDialog.jsx, StageNavBar.jsx
│   ├── ExportButtons.jsx        — PDF/Word export
│   └── Spinner.jsx
├── engines/
│   ├── config.js, edgar.js, edgarFinancials.js, edgarFrames.js
│   ├── keyMetrics.js             — 61 derived metrics (7 categories), validated against FMP S&P 100
│   ├── prices.js, priceStore.js, cache.js, cacheStore.js
│   ├── gurus.js, nport.js, insiders.js, compensation.js
│   ├── splits.js                — Stock split detection + cumulative split factor
│   ├── growthRates.js, freeCashFlow.js, returnMetrics.js, ruleOneScore.js
│   ├── valuation.js, fgr.js, validation.js
│   ├── tickerSearch.js, companyDetails.js, sicClassification.js, tickerAudit.js
│   ├── taxonomyResolver.js      — Layer 2: FASB calc linkbase descendants
│   ├── companyAdapter.js        — Layer 3: AI tag classification
│   ├── industryClassifier.js, industryOverlays.js
│   ├── analystEstimates.js, finviz.js, gurufocus.js, filingMarkdown.js, filingSections.js
│   ├── peers.js, peerMetrics.js, batchQuotes.js
│   ├── companyEvents.js, transcripts.js
│   ├── aiResearch.js            — Claude API dispatch engine (structured outputs via Zod, prompt loading, curriculum assembly, DataPacket slicing)
│   ├── pipelineManager.js       — Wave-based dispatch orchestration (reads dispatch-table.json, Promise.allSettled, budget/cache tracking)
│   ├── critic.js                — Quality validation (1,638L): citation classification, data path resolution, completeness scoring, red flag detection, methodology scoring
│   ├── nodeAdapter.js           — Node.js fetch polyfill for ESM (SDK auth header passthrough)
│   ├── onePagerGenerator.js     — Single-call Sonnet generation for One Pager
│   ├── dataExport.js            — Assemble DataPacket from all source engines
│   ├── contextBudget.js         — Token budget tracking, cost calculation per model
│   ├── formatCompanyName.js     — Display-time name normalization (ALL CAPS → title case, acronyms, suffixes)
│   ├── qualityFormatter.js      — Format quality report output
│   ├── progressState.js         — State persistence for generation progress
│   ├── cacheMonitor.js          — Cache baseline + field change detection
│   └── __tests__/               — 173+ vitest tests (XBRL, splits, peers, pipeline, agents)
├── data/
│   ├── validationCompanies.js
│   ├── taxonomy-hierarchy.json  — Layer 2: 1,937 FASB descendant tags (84KB)
│   ├── sp500-tag-classifications.json — Layer 3: 1,989 AI-classified tags (387KB)
│   └── sp500-display-names.json — Curated S&P 500 display names (503 companies)
├── hooks/
│   ├── useResearch.js, useFinancials.js, usePrices.js, useEdgar.js
│   ├── useGurus.js, useInsiders.js, useCompensation.js
│   ├── useCompetitors.js        — Progressive 3-phase loading + completeness scoring
│   ├── useCompanyEvents.js      — Company events + two-phase IR link
│   ├── useAnalystData.js, useAnalystEstimates.js
│   ├── useWatchlists.js, useSettings.js, useTheme.js
│   ├── useGeneratePipeline.js   — POST generate/{stage}, polling coordination
│   ├── useOnePager.js           — One Pager state polling
│   ├── usePitchDeck.js          — Pitch Deck state polling + checkpoint display
│   └── useFullStory.js          — Full Story state polling + debate step display
validation/                      — 3-layer validation system (scripts/, data/, reports/)
previous-prompt-and-plans/
└── gsd-archive/phases/          — Phase 5A–24 implementation archive (plans, summaries, verification)
```

---

## Data Model (Reports)

```js
{
  id: "uuid",
  ticker: "AAPL",
  companyName: "Apple Inc.",
  createdAt: "2026-03-08",
  updatedAt: "2026-03-08",
  currentStage: 1,           // 1 = One Pager, 2 = Pitch Deck, 3 = Full Story
  stageApprovals: {
    onePager: null,           // null | "approved" | "rejected"
    pitchDeck: null,
    fullStory: null
  },
  onePager: { ... },
  pitchDeck: { ... },
  fullStory: { ... },
  notes: "",
  watchlist: false,
  competitors: { privateCompetitors: [] }
}
```
**localStorage key**: `stock-analyzer-reports`

---

## Bug-Fixing Strategy

When fixing bugs, follow this approach — do NOT jump straight to a fix:

1. **Diagnose with `/investigate`** (gstack). Four-phase root cause analysis — investigate, analyze, hypothesize, implement. Most bugs resolve here.
2. **Write a failing test.** The test should prove the bug exists. Include a test for the expected post-fix behavior. Use vitest (`npm test`).
3. **Fix with a subagent.** Give the subagent the failing test and the specific files to modify. It works until all tests pass.
4. **Verify.** All tests pass, app compiles, dev server runs.

Writing tests first forces you to define "correct" before writing code — this caught a critical EDGAR Frames API bug that a direct fix attempt missed entirely.

---

## Operating Rules (from Rule One methodology)

1. Never skip stages
2. Never assume Guru ownership is a buy signal (context, not confirmation)
3. Always prefer conservative growth estimates
4. Always test inversion (for every reason to own, create a counter-argument)
5. Always define exit before entry
6. Always document assumptions
7. Stop when clarity fails — if you can't explain it simply, reject it

---

## UI Approach
- **Palette**: stickeR1 slate colors + teal accent (`#0f766e` light / `#2dd4bf` dark)
- **Typography**: 13px base, Inter/system font stack
- **Layout**: Top nav bar (52px) → 4 tabs (Watchlists | Research | Gurus | Reports) + search bar. Full-width content (max 1400px).
- **Toolbox tabs**: Overview | Financials | Growth | Valuation | Competitors | Insiders | Filings | Audit
- **Styling**: Inline styles with mutable `C` palette object (dark/light). Cards with border + borderRadius 8.
- **Reference**: `knowledge/stickeR1-reference-ui.md` + `knowledge/Rule One Toolbox UI examples/`

---

## Dev Commands

| Command | What it does |
|---------|-------------|
| `npm run dev` | Vite dev server (localhost:5173) |
| `npm run build` | Production build |
| `npm test` | Run vitest tests |
| `npm run test:watch` | Run vitest in watch mode |
| `npm run tauri:dev` | Desktop app with hot-reload |
| `npm run tauri:build` | Package native macOS `.app` |

---

## Implementation History

The original CLAUDE.md planned Phases 5-8 for AI report generation. In practice, the work expanded to **Phases 5A through 24**, archived at `previous-prompt-and-plans/gsd-archive/phases/`:

| Phase | What |
|-------|------|
| 5A | Agent definitions foundation (12 agents, configs, prompts) |
| 5B | One Pager display components |
| 5C | CC skill first analysis (prototype pipeline via Claude Code) |
| 5D | Quality system (critic, citation validation) |
| 6 | Pitch Deck pipeline (3-phase wave dispatch) |
| 6.1-6.3 | Pipeline hardening, data pipeline hardening, validation |
| 7 | Schema SDK foundation (Zod structured outputs) |
| 8 | Core agent dispatch (`aiResearch.js`, `pipelineManager.js`) |
| 9 | Parallel dispatch + caching |
| 10 | Pipeline integration + prompt fixes (first live SFM run: $8.53) |
| 11 | Validation + methodology scoring |
| 12 | Full Story foundation |
| 13 | CC pipeline |
| 14 | Adversarial debate (Bull/Bear/Rebuttal/Judge) |
| 15 | Quality system v2 |
| 16-16.2 | API migration (CC subagents → direct Claude API) |
| 17-17.1 | End-to-end validation + report export generators (PDF/Word) |
| 18 | Critical bug fixes + storage migration |
| 19 | Shared report infrastructure |
| 20 | Full Story core viewer |
| 21 | Checklist + debate renderers |
| 22 | Stage gating + navigation |
| 23 | Delight feature wiring (PromiseTracker, generation UX) |
| 24 | PM workflow controls |

Final in-app validation done via gstack skills (`/qa`, `/design-review`, `/plan-eng-review`).

### Remaining Work
- **Cost optimization**: PSR agents re-read all filings fresh for FS instead of reusing PD findings. Two Opus agents in Phase 1. Target: $15 PD+FS ceiling (currently ~$28-30).
- **Content quality**: Citation URL laundering (agents cite domain names not URLs), DataPacket path fabrication, searchesPerformed format chaos across agents.
- **Sensitivity tables**: Schema exists but not yet wired into agent output or UI.
- **Key Metrics Price category**: Historical P/E per year not yet implemented.
- **Future architecture**: Agent SDK migration when moving server-side for multi-user (see council decision in memory).

---

## gstack

Use the `/browse` skill from gstack for all web browsing. Never use `mcp__claude-in-chrome__*` tools.

### Available Skills
- `/office-hours` — Office hours session
- `/plan-ceo-review` — CEO review planning
- `/plan-eng-review` — Engineering review planning
- `/plan-design-review` — Design review planning
- `/design-consultation` — Design consultation
- `/review` — Code review
- `/codex` — Multi-AI second opinion (review, challenge, consult)
- `/ship` — Ship code
- `/browse` — Web browsing (use this for ALL web browsing)
- `/qa` — QA testing
- `/qa-only` — QA testing only
- `/design-review` — Design review
- `/setup-browser-cookies` — Set up browser cookies
- `/retro` — Retrospective
- `/investigate` — Systematic debugging (was /debug)
- `/careful` — Destructive command warnings
- `/freeze` — Lock edits to one directory
- `/guard` — Full safety mode (careful + freeze)
- `/unfreeze` — Remove edit restrictions
- `/document-release` — Document a release
- `/gstack-upgrade` — Update gstack to the latest version
- `/cso` — Security audit (OWASP, STRIDE, secrets, supply chain)
- `/autoplan` — Auto-review pipeline (CEO + design + eng in one command)
- `/land-and-deploy` — Merge PR, deploy, verify production
- `/canary` — Post-deploy monitoring
- `/benchmark` — Performance regression detection
- `/setup-deploy` — Configure deploy settings

### Skill Output Overrides (persist across gstack updates)

gstack skills produce plan/review/design/test artifacts. All artifacts are saved to the `gstack/` folder in the project root (visible, git-tracked) instead of hidden directories. This gives full visibility into the gstack workflow while preserving inter-skill cross-references via symlinks.

#### Output Locations by Skill Type

| Skill Output | Save To | Subfolder |
|---|---|---|
| `/office-hours` design docs | `gstack/design/` | design |
| `/plan-ceo-review` plans | `gstack/plans/` | plans |
| `/plan-eng-review` eng plans | `gstack/plans/` | plans |
| `/plan-eng-review` test plans | `gstack/test-plans/` | test-plans |
| `/plan-design-review` reports | `gstack/design/` | design |
| `/design-consultation` outputs | `gstack/design/` | design |
| `/design-review` audits | `gstack/design/` | design |
| `/qa` + `/qa-only` reports | `gstack/qa-reports/` | qa-reports |
| `/qa` test outcomes | `gstack/test-outcomes/` | test-outcomes |
| `/review` + `/ship` review logs | `gstack/reviews/` (copy) | reviews |
| `/canary` reports | `gstack/canary-reports/` | canary-reports |
| `/benchmark` reports | `gstack/benchmark-reports/` | benchmark-reports |
| `/land-and-deploy` reports | `gstack/deploy-reports/` | deploy-reports |
| `/retro` snapshots | `gstack/retros/` | retros |
| `/investigate` RCA reports | `gstack/investigations/` | investigations |
| `/cso` security audits | `gstack/security-reports/` | security-reports |
| `/browse` logs | `gstack/browse-logs/` | browse-logs |

#### File Naming

Format: `gstack-{topic}-{type}-{YYYYMMDD}.md`
- `{topic}` = descriptive slug (e.g., `xbrl-normalization`, `ai-report-generation`)
- `{type}` = `eng-plan`, `ceo-plan`, `design-review`, `design-consultation`, `test-plan`, `test-outcome`
- `{YYYYMMDD}` = date from system clock (`date +%Y%m%d`)
- Duplicates: append `-v2.md`, `-v3.md`

#### Symlink Protocol (preserves inter-skill workflow)

After writing any artifact to `gstack/`, create a symlink in `~/.gstack/projects/$SLUG/` so gstack binaries and skill lookups still find it:

```bash
# After writing to gstack/{subfolder}/{filename}.md
ln -sf "$(git rev-parse --show-toplevel)/gstack/{subfolder}/{filename}.md" \
  ~/.gstack/projects/$SLUG/{gstack-standard-name}.md
```

#### Review Log Sync

The `gstack-review-log` binary writes directly to `~/.gstack/projects/$SLUG/main-reviews.jsonl` (hardcoded, cannot be redirected). After any skill that writes review entries (`/plan-eng-review`, `/plan-ceo-review`, `/plan-design-review`, `/review`, `/ship`), sync the log:

```bash
cp ~/.gstack/projects/$SLUG/main-reviews.jsonl "$(git rev-parse --show-toplevel)/gstack/reviews/main-reviews.jsonl"
```

#### What Stays in `~/.gstack/projects/$SLUG/` (cannot be moved)
- `main-reviews.jsonl` and `{branch}-reviews.jsonl` — consumed by `gstack-review-log` / `gstack-review-read` binaries (hardcoded paths)
- Symlinks to `gstack/` files — for inter-skill bash glob lookups (`ls -t ~/.gstack/projects/$SLUG/*-test-plan-*.md`)

#### What's gitignored in `gstack/`
Screenshots, browse logs, and binary baselines are large and regenerated on demand — they're gitignored. Plans, reports, review logs, and test outcomes are tracked.

#### Cross-references
When gstack skills look up prior artifacts (Design Doc Check, test plan discovery, design lineage), also search `gstack/` subfolders in addition to `~/.gstack/projects/$SLUG/`. Also check `previous-prompt-and-plans/` for legacy non-gstack prompt files.

#### Post-Upgrade Health Check (run automatically after `/gstack-upgrade`)

After any gstack upgrade, run this check automatically — do not wait for the user to ask:

```bash
# 1. Verify .gstack/ symlinks are intact (skills may have replaced symlinks with real dirs)
echo "=== .gstack/ symlink health ===" && \
for name in qa-reports design-reports canary-reports benchmark-reports deploy-reports security-reports browse-logs; do
  if [ -L ".gstack/$name" ]; then
    echo "OK (symlink): $name"
  elif [ -d ".gstack/$name" ]; then
    echo "BROKEN (real dir replaced symlink): $name — needs re-linking"
  else
    echo "MISSING: $name"
  fi
done

# 2. Check for NEW .gstack/ subdirectories that we haven't symlinked yet
echo "=== New unlinked .gstack/ directories ===" && \
for dir in .gstack/*/; do
  name=$(basename "$dir")
  if [ ! -L ".gstack/$name" ] && [ -d ".gstack/$name" ]; then
    echo "NEW: .gstack/$name — not symlinked to gstack/"
  fi
done
```

**If symlinks are broken** (skill replaced symlink with real dir): move any new files from `.gstack/{name}/` into `gstack/{name}/`, remove the real dir, and re-create the symlink:
```bash
# For each broken symlink:
cp -R .gstack/{name}/* gstack/{name}/ 2>/dev/null; rm -rf .gstack/{name}; ln -sf "$(pwd)/gstack/{name}" .gstack/{name}
```

**If new directories appear**: A new gstack skill is writing to a location we haven't redirected. Create the subfolder in `gstack/`, symlink it, add it to `.gitignore` if it contains screenshots/binaries, and update the Output Locations table above. Tell the user: "gstack upgrade added a new output directory `.gstack/{name}/` — I've linked it to `gstack/{name}/` so it's visible in the project."

**If skill SKILL.md files changed write paths**: Read the changelog or diff the updated skill files in `~/.claude/skills/gstack/`. If any skill changed its output path (e.g., `.gstack/qa-reports/` → `.gstack/qa/`), update the symlink accordingly and tell the user what changed and how it affects our redirect setup.

## Project

**Thes1s — AI Agent Workflow**

Thes1s is a professional AI-powered investment analyst team for Rule One stock research. The user is the portfolio manager; the AI agents are the analyst team. Each agent has a specialized role (financial analyst, business analyst, risk analyst, etc.), follows Rule One methodology exactly, and produces hedge-fund-quality investment theses through a 3-stage gated workflow: One Pager (filter) → Pitch Deck (research) → Full Story (conviction). The agents don't just generate reports — they investigate like their careers depend on it. Every unknown gets explored. Every claim gets cited. Every section gets checked.

This is not a black box. The portfolio manager reads every output, challenges assumptions, provides data sources agents couldn't access, and makes final decisions. It's a collaborative research operation — the same operating model as a real hedge fund analyst team, except the analysts are AI agents working 1000x faster.

**Core Value:** **Depth of investigation that exceeds what a single human analyst can achieve in 70+ hours — delivered in minutes, with zero shortcuts on rigor.**

The power of Rule One research is the depth. A human analyst doing 70 hours of manual research inevitably hits "good enough" moments. AI agents don't. They explore every unknown, follow every thread, cross-reference every claim. The goal is not parity with manual research — it's *deeper* than manual research.

**Design Litmus Test:** "How would a real hedge fund do this?" — Every agent design decision must pass this test. Would a hedge fund prevent analysts from web searching? No. Would they prevent analysts from talking to each other? No. Would they expect quality? Yes. Would a PM tolerate half-assed work? No. Would a good analyst make unwarranted assumptions? No. Would a hedge fund give their team every possible tool? Yes. If a real hedge fund wouldn't do it that way, don't build it that way.

### Constraints

- **Desktop only**: Tauri app, no server. API calls go direct to external services.
- **Cost ceiling**: Full pipeline (One Pager + Pitch Deck + Full Story) should target ~$8-12 per company. Primary Source Reader is the biggest cost driver (~200K+ input tokens for a full 10-K).
- **LULU contamination**: Agents must never access LULU examples during generation. Evaluation only.
- **Rule One methodology**: Agents follow the curriculum exactly. Creative freedom is limited to investigation depth and narrative style — never methodology.
- **User verification**: The user personally verifies agent output quality at each milestone. No milestone is "done" until the user says so.

## Technology Stack

## Languages
- JavaScript (ES2020+) - All frontend logic, engine layer, React components, Vite plugins
- JSX - React component templates (`src/components/*.jsx`)
- Rust (edition 2021, min 1.77.2) - Tauri native shell (`src-tauri/src/`)
- JSON - Static data files: taxonomy hierarchy (`src/data/taxonomy-hierarchy.json`), S&P 500 tag classifications (`src/data/sp500-tag-classifications.json`), S&P 500 display names (`src/data/sp500-display-names.json`), industry company assignments (`industry-classification/thes1s-company-assignments.json`)
## Runtime
- Node.js v24.13.1 (confirmed on dev machine)
- npm (lockfile version 3)
- Lockfile: present (`package-lock.json`)
## Frameworks
- React 19.2.0 - UI layer, functional components with hooks only (`src/components/`)
- React Router DOM 7.13.1 - Client-side routing (`src/App.jsx`)
- Tauri 2.10.3 - Native macOS `.app` packaging; Rust crate `tauri = "2.10.3"`, CLI `@tauri-apps/cli ^2.10.1`
- tauri-plugin-log 2 - Structured logging from the Rust shell
- Vite 7.3.1 - Dev server + production bundler (`vite.config.js`)
- @vitejs/plugin-react 5.1.1 - React JSX transform + HMR
- Vitest 4.1.0 - Unit test runner (`npm test` / `npm run test:watch`)
- jsdom 29.0.1 - DOM environment for engine tests
## Key Dependencies
- `@anthropic-ai/sdk ^0.78.0` - Claude API client; used in `src/engines/companyAdapter.js` (Layer 3 XBRL classification) and planned `src/engines/aiResearch.js`
- `yahoo-finance2 ^3.13.2` - Yahoo Finance data client; runs in Vite dev middleware (`vite.config.js`) for analyst estimates, batch quotes, calendar events
- `recharts ^3.8.0` - Chart rendering (price charts, growth charts) throughout Toolbox tabs
- `idb ^8.0.3` - IndexedDB wrapper; powers the `thes1s-cache` database in `src/engines/cacheStore.js`
- `react-router-dom ^7.13.1` - App-level routing (`src/App.jsx`)
- `uuid ^13.0.0` - Report ID generation (`src/hooks/useResearch.js`)
- `cheerio ^1.2.0` - HTML parsing in Vite middleware (Finviz scraper in `vite.config.js`); also used in `src/engines/filingMarkdown.js`
- `turndown ^7.2.2` + `turndown-plugin-gfm ^1.0.2` - HTML-to-Markdown conversion for SEC filing display (`src/engines/filingMarkdown.js`)
- `xlsx ^0.18.5` - Excel/spreadsheet export (present in deps, used in validation scripts)
- `@xmldom/xmldom ^0.8.11` - XML parsing for EDGAR XBRL files (dev dependency, validation scripts)
- `serde + serde_json 1.0` - Rust serialization (Tauri IPC data exchange)
## Configuration
- Config file: `.env.local` (present, gitignored)
- Variables read via `src/engines/config.js` using `import.meta.env`:
- `vite.config.js` - Vite config with 5 custom middleware plugins + 3 CORS proxy routes
- `src-tauri/tauri.conf.json` - Tauri app config (window size 1400×900, CSP disabled, bundle targets all)
- `eslint.config.js` - ESLint flat config (eslint 9.39.1, react-hooks plugin, react-refresh plugin)
## Platform Requirements
- Node.js 24+ (confirmed)
- Rust 1.77.2+ (required by Tauri build)
- `npm run dev` → Vite dev server at localhost:5173
- `npm run tauri:dev` → Tauri dev with hot-reload
- macOS desktop app (`.app` bundle via `npm run tauri:build`)
- Tauri 2 native webview — no CORS enforcement, can set arbitrary headers
- No server, no auth, no network infrastructure — all API calls go direct to external services

## Conventions

## Naming Patterns
- React components: PascalCase `.jsx` — `CompanyHeader.jsx`, `ValuationCalculators.jsx`
- Hooks: camelCase prefixed with `use` — `useFinancials.js`, `useCompanyEvents.js`
- Engines (pure logic): camelCase `.js` — `growthRates.js`, `edgarFinancials.js`, `returnMetrics.js`
- Data files: kebab-case `.json` / `.js` — `taxonomy-hierarchy.json`, `validationCompanies.js`
- Test files: mirror source with `.test.js` suffix — `edgarFinancials.test.js`
- Exported engine functions: camelCase, prefixed with action verb — `computeGrowthRates`, `fetchCompanyFacts`, `extractAnnualFact`
- React components: PascalCase — `function CompanyHeader(...)`, `export default function Toolbox(...)`
- Local helpers within a file: camelCase, no export — `findClosest`, `makeFrameData`, `isIDBKey`
- Formatter functions: `fmt` prefix — `fmtNum`, `fmtDollar`, `fmtPct`, `fmtRange`
- All camelCase — `companyFacts`, `edgarStatements`, `guruActivities`
- Boolean state: descriptive names — `loading`, `isDark`, `irLinkIsDirect`
- Constants (module-level, never reassigned): UPPER_SNAKE_CASE — `INCOME_TAXONOMY`, `PERIODS`, `IDB_PREFIXES`, `THRESHOLDS`
- Destructured loading/error pairs from hooks: suffix pattern — `finLoading`, `priceLoading`, `edgarError`
- XBRL taxonomy entries: `{ field: 'snake_case', unit: 'USD', tags: [...], negate?: boolean }`
- Financial data fields: `snake_case` — `net_income_loss`, `cost_of_revenue`, `change_in_receivables`
- Report data: `camelCase` keys in JSON — `currentStage`, `stageApprovals`, `onePager`
- Theme palette: single-letter export `C` — always imported as `import { C } from '../theme'`
## Code Style
- No Prettier config detected — formatting is manual/editor-default
- Indentation: 2 spaces throughout
- Single quotes for strings; template literals for interpolation
- Semicolons present throughout
- Trailing commas in multi-line arrays/objects
- ESLint 9 flat config at `eslint.config.js`
- Extends `js.configs.recommended` + `reactHooks` + `reactRefresh`
- Key rule: `no-unused-vars` errors, but vars matching `^[A-Z_]` are ignored (allows unused constants)
- ECMAScript 2020 target, `sourceType: module`
## Import Organization
## Error Handling
- Use `try/catch` and return `null` on failure — callers check for null
- Failed fetches return `null`, not throw — `if (!res.ok) return null`
- Guard clauses at function entry: `if (!fgr || !eps || !futurePE) return null`
- Standard `{ data, loading, error }` pattern
- Cancellation via `let cancelled = false` flag in `useEffect` cleanup
- Always wrapped in try/catch — `QuotaExceededError` triggers cache eviction and retry
- Silent failure with `console.warn` if still full after eviction
- Null coalescing used throughout: `company?.website`, `settings?.defaultPriceRange || '5y'`
- Display fallback: `score != null ? score : '--'` for missing metric values
- Formatter guard: `if (n == null || isNaN(n)) return '--'`
## Logging
- `console.warn(...)` for non-fatal errors, degraded functionality, API failures — `console.warn('EDGAR submissions failed: ...')`
- `console.log(...)` sparingly for diagnostic milestones — `console.log('EDGAR statements AAPL [restated]: 12 years ...')`
- Never `console.error(...)` — errors are captured in state and displayed in UI or silently degraded
- Third-party 403s are suppressed to avoid console noise
## Comments
- Explain non-obvious data conventions: `// payables increase = cash source (already positive)`
- Reference bug numbers in fixes: `// Fix 3 (P1a): Debt tags + sanity check`
- Document XBRL-specific gotchas: `// ASC 606 (2018+)`, `// Q4I for balance sheet instant values`
- Short function-level docstrings for public functions: `// CAGR = (endValue / startValue)^(1/years) - 1`
## Function Design
- Engines: positional for 1-2 params; destructured objects for 3+ — `computeMOS({ fgr, eps, futurePE, marr = 0.15, years = 10 })`
- Components: props destructured in signature — `function CompanyHeader({ company, latest, moatScore, managementScore, ruleOneScore })`
- Pure computation: return result object or `null` on invalid input
- Async fetches: return data object or `null` on failure (never throw to caller)
- Hooks: always return named object `{ data, loading, error }` or domain-specific equivalent
## Module Design
- Engines: named exports for all public functions — `export function computeGrowthRates(...)`
- Components: single `export default function ComponentName(...)` per file
- Hooks: single named export per file — `export function useFinancials(...)`
- Constants: named exports for shared data — `export const PERIODS = [10, 7, 5, 3, 1]`
- Test-only exports: collected under `export const _testExports = { ... }` at file bottom
## Theme Usage

## Architecture

## Pattern Overview
- Hook-mediated data flow: engines are pure async functions; hooks bind them to React state; components render the state
- Three-layer XBRL tag resolution for financial data extraction from SEC EDGAR
- Three-tier caching (in-memory → IndexedDB → localStorage) for API responses
- All styling is inline via a mutable `C` palette object — no CSS files or CSS-in-JS library
- Report data (the research workflow) is persisted in localStorage; financial caches live in IndexedDB
## Layers
- Purpose: Bootstrap React, provide router, inject global CSS reset
- Location: `src/main.jsx`
- Contains: `BrowserRouter` wrapper, root render, 8-line global style injection
- Depends on: `src/App.jsx`
- Used by: Tauri WebView (production) or Vite dev server
- Purpose: Top-level route declarations, cross-cutting state (theme, research list, settings)
- Location: `src/App.jsx`
- Contains: All route definitions for `/research`, `/watchlists`, `/gurus`, `/reports`, `/validation`, audit routes
- Depends on: `useTheme`, `useResearch`, `useSettings`, all top-level page components
- Used by: `src/main.jsx`
- Purpose: 52px top nav bar with logo, 4 nav tabs, ticker search, settings gear, and main content slot
- Location: `src/components/Layout.jsx`
- Contains: Inline-styled nav, `NavLink` tabs, `TickerSearch` component, max-width 1400px content wrapper
- Depends on: `src/theme.js` (C palette), `TickerSearch.jsx`
- Used by: `src/App.jsx` — wraps all routes
- Purpose: Primary research surface — 8-tab container that orchestrates all data hooks and passes computed results to tab components
- Location: `src/components/Toolbox.jsx`
- Contains: Tab switcher (Overview / Financials / Growth / Valuation / Competitors / Insiders / Filings / Data Audit), all hook invocations, all `useMemo` scoring computations
- Depends on: `useFinancials`, `useEdgar`, `usePrices`, `useGurus`, `useInsiders`, `useCompensation`, `useCompanyEvents`, all scoring engines (`growthRates`, `returnMetrics`, `freeCashFlow`, `ruleOneScore`)
- Used by: `/research/:id` route in `App.jsx`
- Purpose: Render specific views/tabs — receive computed data as props, no direct engine calls
- Location: `src/components/*.jsx`
- Contains: `FinancialStatements`, `GrowthAnalysis`, `Valuation`, `Competitors`, `Insiders`, `Filings`, `Gurus`, `GuruPortfolio`, `TickerDataAudit`, `CompanyEvents`, etc.
- Depends on: `src/theme.js`, data props from Toolbox or their own hooks (Competitors uses `useCompetitors`)
- Used by: `Toolbox.jsx` or directly by App routes (Gurus, Watchlists, audit views)
- Purpose: Bridge between async engine functions and React component state — handle loading, error, and cancellation patterns
- Location: `src/hooks/*.js`
- Contains: `useEdgar`, `useFinancials`, `usePrices`, `useGurus`, `useInsiders`, `useCompensation`, `useCompetitors`, `useCompanyEvents`, `useResearch`, `useSettings`, `useTheme`, `useWatchlists`, `useAnalystData`
- Depends on: `src/engines/*.js`
- Used by: `Toolbox.jsx` and individual components
- Purpose: All external API calls, data extraction, and computation — pure async functions with no React dependency
- Location: `src/engines/*.js`
- Contains: EDGAR fetchers (`edgar.js`, `edgarFinancials.js`, `edgarFrames.js`), scoring (`ruleOneScore.js`, `growthRates.js`, `returnMetrics.js`, `freeCashFlow.js`, `valuation.js`), other data sources (`gurus.js`, `insiders.js`, `prices.js`, `compensation.js`, `transcripts.js`, `analystEstimates.js`), and support engines (`cache.js`, `cacheStore.js`, `splits.js`, `peers.js`, `peerMetrics.js`, `batchQuotes.js`)
- Depends on: `src/engines/config.js` (env keys), `src/engines/cache.js`, external APIs
- Used by: `src/hooks/*.js`
- Purpose: Pre-built lookup tables loaded at import time — zero runtime API cost
- Location: `src/data/`
- Contains:
- Used by: `taxonomyResolver.js` (Layer 2), `companyAdapter.js` (Layer 3)
## The Three-Layer XBRL Engine
- Defined inline in `edgarFinancials.js` as `INCOME_TAXONOMY`, `BALANCE_TAXONOMY`, `CASHFLOW_TAXONOMY` arrays
- Each field entry: `{ field: 'revenues', unit: 'USD', tags: ['RevenueFromContract...', 'Revenues', 'SalesRevenueNet', ...] }`
- Tags ordered by prevalence — first tag's value wins per year
- O(1) lookup per tag per year
- `src/engines/taxonomyResolver.js` augments any taxonomy array with FASB calculation linkbase descendants
- Pre-built data: `src/data/taxonomy-hierarchy.json` (1,937 descendant tags from 3 FASB taxonomy versions)
- Used only when Layer 1 misses a field for a company
- Currently dormant (commented out in `edgarFinancials.js`) — code retained for future re-enablement
- `src/engines/companyAdapter.js` — two sub-layers:
- Confidence gating: classifications below 0.8 confidence are marked "inferred" in provenance
- Currently dormant (commented out in `edgarFinancials.js`) — code retained
- `src/engines/industryClassifier.js` maps SIC codes → `'bank' | 'reit' | 'insurance' | 'standard'`
- `src/engines/industryOverlays.js` provides additive XBRL taxonomy for bank/REIT/insurance
- Applied after base extraction: bank gets NII/deposits/efficiency ratio; REIT gets FFO/NAV/NOI; insurance gets premiums/claims/combined ratio
- `computeDerivedFields()` in `edgarFinancials.js` computes ~40 fields not in XBRL (e.g., gross profit from revenue - COGS, total debt from components, working capital, EBITDA)
- Every derived value carries a human-readable formula via `getDerivedFormula()`
- Every extracted value carries parallel metadata: XBRL tag that resolved it, layer (1/2/3), whether derived, confidence score (Layer 3), human-readable formula
- Annual AND TTM provenance tracked
- Components read bare numbers; provenance is opt-in via `edgarStatements.provenance`
## Three-Tier Cache Architecture
| Tier | What | TTL | Used For |
|------|------|-----|----------|
| In-memory (`Map`) | Hot data, avoids redundant reads | Session | All lookups |
| IndexedDB (`cacheStore.js`) | Large blobs (EDGAR facts, guru filings, statements) | 24hr–10yr | `edgar:facts:*`, `edgar-statements:*`, `guru-*`, `nport-*`, `transcript-*`, `filing-md:*`, `insider-*`, `comp-*` |
| localStorage | Small metadata (ticker map, events, analyst data) | 1hr–24hr | Everything else |
## Data Flow
- React `useState` / `useMemo` / `useCallback` — no global state library
- Reports/settings: localStorage (`stock-analyzer-reports`, `sa-settings`)
- Financial caches: IndexedDB via `cacheStore.js`
- Last-viewed research: localStorage (`sa-last-research`)
- Competitors tier preference: localStorage (`sa-competitors-tier`)
## Key Abstractions
- Purpose: A research workflow record — ticker + stage approvals + stage content (onePager/pitchDeck/fullStory)
- Managed by: `useResearch.js`
- Structure: `{ id, ticker, companyName, currentStage, stageApprovals, onePager, pitchDeck, fullStory, watchlist, competitors }`
- Purpose: Normalized financial statements — the single source of truth for all scoring and display
- Produced by: `fetchEdgarStatements()` in `edgarFinancials.js`
- Structure: `{ years, income: {year: {field: value}}, balance: {year: {field: value}}, cashFlow: {year: {field: value}}, provenance: {year: {field: {tag, layer, formula}}} }`
- Purpose: Mutable theme object — all components read from this; dark/light themes applied via `Object.assign(C, source)`
- Location: `src/theme.js`
- Pattern: `import { C } from '../theme'` → `style={{ color: C.text, background: C.bgCard }}`
- Purpose: Determines whether a cache key goes to IndexedDB or localStorage by prefix inspection
- Location: `src/engines/cache.js` — `IDB_PREFIXES` array + `isIDBKey()` + `getStoreName()`
## Entry Points
- Location: `src/main.jsx`
- Triggers: Vite dev server serves `index.html` → loads `main.jsx`
- Responsibilities: Mount React root, inject global styles, provide BrowserRouter
- Location: `src-tauri/src/` (Rust shell), `src-tauri/tauri.conf.json`
- Triggers: macOS `.app` launch
- Responsibilities: Create native window (1400×900), load `dist/` as frontend, no CORS enforcement on network requests
- Location: `vite.config.js` — custom middleware plugins
- Triggers: Any `/api/*` request in dev mode
- Responsibilities: Proxy EDGAR/SEC requests (adds User-Agent header), serve Yahoo Finance via `yahoo-finance2` package, serve Finviz/GuruFocus/IR events via server-side fetch
## Error Handling
- All hooks follow: `setLoading(true)` → `try { ... } catch (err) { setError(err.message) } finally { setLoading(false) }`
- Cancellation: `let cancelled = false` + cleanup `return () => { cancelled = true }` in `useEffect`
- Cache misses are silent — engines fall back to network without surfacing errors
- EDGAR 404s (missing filings) return `null` gracefully; components show "no data" states
## Cross-Cutting Concerns

