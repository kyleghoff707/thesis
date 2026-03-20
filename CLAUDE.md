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
- **Financial Data**: SEC EDGAR XBRL (all financials, 13F guru holdings, N-PORT, insiders, compensation — free), Yahoo Finance (prices, stock splits — free), Finviz (analyst estimates — free), GuruFocus (optional $25/mo API)
- **Charts**: Recharts
- **Deps**: recharts, @anthropic-ai/sdk, uuid, react-router-dom, turndown, turndown-plugin-gfm, yahoo-finance2, cheerio, idb
- **No server, no auth** — runs entirely locally. API calls go direct to external services.

For detailed API integration notes (CORS proxying, EDGAR XBRL details, parsing internals), see `knowledge/references/app-architecture.md`.

---

## Architecture Reference
**When debugging or modifying any engine, API integration, scoring algorithm, CORS proxy, validation system, or parser** — read `knowledge/references/app-architecture.md` first. It contains detailed technical documentation for all implemented systems (moved from CLAUDE.md to save context window).

**When debugging or modifying the XBRL extraction engine, taxonomy, provenance, industry overlays, or coverage systems** — read `previous-prompt-and-plans/xbrl-engine-strategy.md` first. It contains the full three-layer architecture, design decisions, coverage audit results, and implementation history.

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

### EDGAR Frames API — Period Distinction (Critical)
The Frames endpoint (`/api/xbrl/frames/us-gaap/{tag}/{unit}/CY{year}.json`) uses **different period specifiers** for balance sheet vs income statement tags:
- **Duration tags** (income statement, cash flows): `CY{year}.json` — e.g., `CY2024.json`
- **Instant tags** (balance sheet, point-in-time): `CY{year}Q4I.json` — e.g., `CY2024Q4I.json`

All tag definitions in `FRAMES_TAGS` and `PEER_FRAMES_TAGS` have a `period: 'instant' | 'duration'` property. **Always use this property** when constructing Frames API URLs. Using the wrong period returns 404.

### XBRL Taxonomy Conventions
- **`negate` flag**: Some cash flow taxonomy fields have `negate: true` (e.g., `change_in_receivables`, `change_in_inventory`, `other_noncash_items`). This flips XBRL's balance-sheet-change convention to cash-impact convention at extraction time. Do NOT add `negate` to payables — payable increases are already positive in both conventions.
- **Debt sanity check**: `computeDerivedFields` has a ratio-based fallback — if `total_debt / liabilities < 5%`, derives debt from `liabilities - known-non-debt-items`. This catches industry-specific debt tag gaps (REITs, banks, insurance, energy).
- **SGA derivation**: `sga` taxonomy field uses only the combined `SellingGeneralAndAdministrativeExpense` tag. Separate `selling_expense` and `general_and_admin_expense` fields exist; `computeDerivedFields` sums them into `sga` when the combined tag is null (fixes MSFT, others that report separately).
- **Derived field formulas**: `getDerivedFormula()` returns human-readable formula strings for all ~40 derived fields. Stored in `provenance[year][field].formula` for Audit tab display.
- **TTM provenance**: TTM extraction tracks which tag resolved each field, with Layer 1/2 detection and derived field formulas. AI report generation can trace any TTM value back to its XBRL source.
- **REIT FFO caveat**: FFO is derived (not tagged in XBRL). `gain_loss_on_real_estate_sales` was discontinued by many REITs after FY2018 — FFO is approximate for recent years. AI reports should cross-reference NAREIT-published FFO.
- **Insurance float caveat**: Approximation from XBRL balance sheet items. BRK's reported float cannot be reconstructed from standard us-gaap tags. Pure-play insurers (MET, ALL) have better coverage.
- **AFFO maintenance capex**: Hardcoded at 15% of total capex in overlay (varies by REIT subtype: EQIX ~30-40%, PLD ~10-15%). AI reports should use user's maintenance capex % from Valuation Calculators instead.

---

## Current Status
Phases 1-4 complete — app shell, data engines, calculation engines, and full Toolbox UI all functional. **XBRL engine complete** — three-layer tag resolution (static + taxonomy + AI), industry overlays (bank/REIT/insurance), full provenance tracking (annual + TTM), coverage monitor, and Audit tab dashboard. Validated across all 503 S&P 500 companies with 0 failures. See `previous-prompt-and-plans/xbrl-engine-strategy.md` for full architecture and `validation/reports/financial-data-comparison-rca.md` for the original 12-ticker RCA. **The remaining work is Phase 5-8: AI-driven report generation.**

### What's Built
All data engines, all UI tabs (Overview, Financials, Growth, Valuation, Competitors, Insiders, Filings, Audit), Gurus tab with 13F + N-PORT, Watchlists, executive compensation, filing markdown conversion, 5 audit systems (validation, guru, ticker, N-PORT, compensation), Competitors tab with SIC-based peer discovery + Frames API metrics + Yahoo batch quotes + Rule One scores + derived metric computation + Yahoo data backfill + per-ticker caching + sparse peer filtering + data completeness indicators + industry-aware column defaults, Upcoming Events & News section on Overview (SEC 8-K events + Yahoo calendar + IR page discovery), three-layer XBRL engine with provenance tracking and coverage monitoring (173 tests via vitest). See source tree below.

### What's NOT Built
- AI report generation (One Pager, Pitch Deck, Full Story) — Phases 5-7
- Sensitivity tables, status badges, export view, reference/citation system — Phase 8
- `aiResearch.js` engine (Claude API calls + prompt builders per stage)

---

## Research Workflow (3-Stage Gated)

The core workflow follows `knowledge/workflow.md`. Each stage is a gate — user must approve before the next unlocks.

### Stage 1 — One Pager (Filter)
**Template**: `knowledge/stage-1-one-pager/template.md` | **Curriculum**: `the-search-begins.md` | **Example**: LULU One Pager.PDF
Quick screen: Company Info, Minimum Standards, Meaning/Management KPIs, Growth Metrics, Summary. Pass/Fail gate.

### Stage 2 — Pitch Deck (Research)
**Template**: `knowledge/stage-2-pitch-deck/template.md` | **Curriculum**: `pitch-deck-I.md` through `IV.md` | **Example**: LULU/
10-part business case: Radar, Simple & Predictable, Market Position, Barriers & Moats, FCF, Management, ROE/ROIC/ROA & Debt, Balance Sheet, PEST Risks, Valuation (MOS + PBT + Ten Cap + Equity Bond).

### Stage 3 — Full Story (Conviction)
**Template**: `knowledge/stage-3-full-story/template.md` | **Curriculum**: `story-form-I.md`, `II.md`, `resources.md` | **Example**: LULU/
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

---

## Valuation Calculators

Four methods, all computed in Stage 2 and confirmed in Stage 3. **All calculators produce buy RANGES, not single prices** — key assumption inputs accept Low/High values, generating conservative and optimistic buy prices per method. The hero box shows the full range (min to max) across all enabled methods.

### Range Inputs (Low/High)
These 4 inputs are estimates/assumptions and accept ranges:
- **FGR** (Future Growth Rate) — affects MOS + PBT. Range fields appear below the FGR radio source selector.
- **Future P/E** — affects MOS only. Defaults auto-adjust from FGR range via `suggestFuturePE()`.
- **Maintenance CapEx %** — affects Ten Cap only. Higher % = conservative (more capex deducted).
- **Historical Avg P/E** — affects Equity Bond only.

All other inputs (EPS, CFO, CapEx, Tax, Shares, BVPS, ROE, Retained Ratio, MARR, MOS %) are factual or methodology-fixed and remain single values.

### MOS (Margin of Safety)
EPS (TTM or 3yr avg) → grow at FGR for 10 years → Future P/E (≤ 2x FGR, capped at historical high) → Future Price → discount at 15% MARR → Sticker Price → 50% MOS = Buy Price.

### PBT (Payback Time)
FCF Ratio (FCF/Earnings, exclude outliers) → FCF per share → compound at FGR → sum 8 years → target ≤ 8 years payback.

### Ten Cap (Owner Earnings)
Cash from Ops - Maintenance CapEx (often 70% assumed) + Tax Provision = Owner Earnings. Ten Cap Price = 10 × (OE / Shares Outstanding).

### Equity Bond (from *The New Buffettology*)
BVPS → historically reasonable ROE → retained earnings ratio → equity growth rate → grow book value 10yr → future earnings → future price via reasonable P/E → discount at MARR → Buy Price.

### Sensitivity Tables
Vary FGR, EPS, CapEx %, ROE assumptions across methods → range of buy prices.

---

## Knowledge Base

```
knowledge/
├── agent workflows/
│   └── Rule 1 workflow.md         — Master Research Workflow (stage progression)
├── Morningstar Financial Statements/ — 50-company MS CSV truth set (IS/BS/CF per ticker)
├── Morningstar Quarterly Financial Statements/
├── R1 Toolbox Financial Statements/
├── Thes1s Financial Statements (post xbrl strategy)/
├── Thes1s Financial Statements (pre xbrl strategy)/
├── references/
│   ├── advanced-financial-analysis.md
│   ├── app-architecture.md        — Detailed API/engine/scoring/validation docs (moved from CLAUDE.md)
│   ├── buffett_letters_claude_training_set/
│   ├── capex-cash-flow-explained.md
│   ├── consolidated_vs_expanded_financial_statements.md
│   ├── edgar-industry-classification-report.md
│   ├── edgar-xbrl-taxonomy.md
│   ├── financial-statements-future-growth-rate.md — FGR methodology, Big 4 growth rates
│   ├── guru-list.md               — 43 named Gurus for 13F lookup
│   ├── morningstar_original_vs_restated_financials.md
│   ├── run-commands.md
│   └── tools-for-analysis.md      — 3 Ms framework (Moat, Management, MOS)
├── stage-1-one-pager/             — template.md, curriculum, LULU example
├── stage-2-pitch-deck/            — template.md, 4 curriculum files, LULU example + resources
├── stage-3-full-story/            — template.md, 2 curriculum files, resources.md, LULU example
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
src/
├── main.jsx, App.jsx, theme.js
├── components/
│   ├── Layout.jsx, TickerSearch.jsx, Watchlists.jsx, Settings.jsx
│   ├── ResearchEmpty.jsx, ResearchList.jsx
│   ├── Toolbox.jsx              — Main research container (8 tabs: Overview/Financials/Growth/Valuation/Competitors/Insiders/Filings/Audit)
│   ├── CompanyHeader.jsx, StockAtGlance.jsx, ScoreTable.jsx
│   ├── FinancialStatements.jsx  — Financials + Key Metrics, 4 dropdown controls
│   ├── GrowthAnalysis.jsx, GrowthRateAnalysis.jsx
│   ├── Valuation.jsx            — 4 sub-tabs (Growth Rate Analysis/Inputs/Calculators/Price vs Value)
│   ├── ValuationCalculators.jsx, ValuationInputs.jsx, HistoricalBuyPrices.jsx
│   ├── Insiders.jsx, ExecutiveCompensation.jsx, Filings.jsx
│   ├── Gurus.jsx, GuruPortfolio.jsx
│   ├── GuruAudit.jsx, TickerAudit.jsx, NportAudit.jsx, CompAudit.jsx, TickerDataAudit.jsx
│   ├── CompanyEvents.jsx        — Upcoming Events & News (SEC 8-K, Yahoo calendar, date badges, event rows)
│   ├── Competitors.jsx          — Competitor benchmarking (SIC peers, 22 metrics, private competitors, completeness dots, sparse peer filtering, industry-aware column defaults)
│   ├── Validation.jsx, CollapsibleSection.jsx
│   ├── SensitivityTable.jsx     — (planned) reusable valuation matrix
│   ├── StatusBadge.jsx          — (planned) section-level status
│   ├── OnePager.jsx             — (planned) Stage 1
│   ├── PitchDeck.jsx            — (planned) Stage 2
│   ├── pitchDeck/               — (planned) RadarSection, ValuationSection, FCFSection, PESTSection
│   ├── FullStory.jsx            — (planned) Stage 3
│   ├── fullStory/               — (planned) ChecklistSection, InversionSection, TradingStrategy
│   ├── ExportView.jsx           — (planned) clean export/print view
│   └── ReferenceList.jsx        — (planned) citation manager
├── engines/
│   ├── config.js, edgar.js, edgarFinancials.js, edgarFrames.js
│   ├── keyMetrics.js, prices.js, priceStore.js, cache.js, cacheStore.js
│   ├── gurus.js, nport.js, insiders.js, compensation.js
│   ├── splits.js                — Stock split detection (Yahoo primary, EDGAR XBRL fallback) + cumulative split factor with fiscal-month-aware date comparison
│   ├── growthRates.js, freeCashFlow.js, returnMetrics.js, ruleOneScore.js
│   ├── valuation.js, fgr.js, validation.js
│   ├── tickerSearch.js, companyDetails.js, sicClassification.js, tickerAudit.js
│   ├── taxonomyResolver.js      — Layer 2: augments taxonomy with FASB calc linkbase descendants
│   ├── companyAdapter.js        — Layer 3: AI tag classification (pre-built S&P 500 + runtime Claude API)
│   ├── industryClassifier.js    — SIC → industry type (bank/reit/insurance/standard) for overlay selection
│   ├── industryOverlays.js      — Additive XBRL taxonomy overlays: bank (NII, deposits, efficiency ratio), REIT (FFO, NAV, NOI), insurance (premiums, claims, combined ratio)
│   ├── analystEstimates.js, finviz.js, gurufocus.js, filingMarkdown.js
│   ├── peers.js                 — SIC-based peer discovery (browse-edgar + Frames fallback)
│   ├── peerMetrics.js           — Peer metrics via Frames API + derived metrics (GrossProfit, OpIncome from building blocks) + Yahoo backfill + completeness scoring + multi-year scores
│   ├── batchQuotes.js           — Yahoo batch quotes with per-ticker caching (market cap, P/E, EPS, book value, shares, dividend yield)
│   ├── companyEvents.js         — Upcoming events engine (SEC 8-K parsing, Yahoo calendarEvents+assetProfile, IR page discovery with parallel probing, Google search fallback)
│   ├── __tests__/peerMetrics.test.js — Vitest: peer metrics bug reproduction tests
│   ├── __tests__/splits.test.js — Vitest: split detection + cumulativeSplitFactor tests
│   ├── __tests__/edgarFinancials.test.js — Vitest: taxonomy coverage + derived field + provenance tests
│   ├── __tests__/taxonomyResolver.test.js — Vitest: Layer 2 taxonomy augmentation + provenance tests
│   ├── __tests__/industryOverlays.test.js — Vitest: industry classifier + bank/REIT/insurance overlay tests
│   ├── __tests__/companyAdapter.test.js — Vitest: Layer 3 AI classification + orphan tag discovery tests
│   ├── __tests__/coverageMonitor.test.js — Vitest: baseline storage + coverage comparison tests
│   └── aiResearch.js            — (planned) Claude API calls + prompt builders
├── data/
│   ├── validationCompanies.js
│   ├── taxonomy-hierarchy.json  — Layer 2: 1,937 FASB descendant tags (84KB, built from 3 taxonomy versions)
│   └── sp500-tag-classifications.json — Layer 3: 1,989 AI-classified tags for S&P 500 (387KB)
├── hooks/
│   ├── useResearch.js, useFinancials.js, usePrices.js, useEdgar.js
│   ├── useGurus.js, useInsiders.js, useCompensation.js
│   ├── useCompetitors.js        — Progressive 3-phase loading (peers → metrics+Yahoo backfill → scores) + completeness scoring
│   ├── useCompanyEvents.js      — Hook for company events + two-phase IR link (direct probe → Google search fallback)
│   ├── useAnalystData.js, useAnalystEstimates.js
│   ├── useWatchlists.js, useSettings.js, useTheme.js
validation/                      — 3-layer validation system (scripts/, data/, reports/)
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

1. **Diagnose with `/rca`.** Invoke the RCA skill to run a structured root cause analysis — traces data flow, applies 5 Whys, and proposes ranked solutions.
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

## Remaining Implementation Plan

### Phase 5 — Stage 1: One Pager
| Step | What | Files |
|------|------|-------|
| 5.1 | Claude API integration (direct fetch, `anthropic-dangerous-direct-browser-access` header) | `src/engines/aiResearch.js` |
| 5.2 | One Pager component — 6 sections, auto-populated + AI-generated + user input | `src/components/OnePager.jsx` |
| 5.3 | Status indicators + approval gate | `src/components/StatusBadge.jsx` |

### Phase 6 — Stage 2: Pitch Deck
| Step | What | Files |
|------|------|-------|
| 6.1 | Pitch Deck container — 10 collapsible sections, gate check | `src/components/PitchDeck.jsx` |
| 6.2 | Section sub-components (Radar, Valuation, FCF, PEST, etc.) | `src/components/pitchDeck/*.jsx` |
| 6.3 | FGR derivation workflow UI (5 inputs with sources) | `ValuationSection.jsx` |
| 6.4 | Sensitivity table component | `src/components/SensitivityTable.jsx` |

### Phase 7 — Stage 3: Full Story
| Step | What | Files |
|------|------|-------|
| 7.1 | Full Story container — 8 major sections, gate check | `src/components/FullStory.jsx` |
| 7.2 | Checklist components (Meaning 15pt, Moat 15pt, Management 13pt) | `fullStory/ChecklistSection.jsx` |
| 7.3 | Inversion & Rebuttal UI | `fullStory/InversionSection.jsx` |
| 7.4 | Trading Strategy + PACE Plan | `fullStory/TradingStrategy.jsx` |

### Phase 8 — Polish
| Step | What | Files |
|------|------|-------|
| 8.1 | Enhanced dashboard (sort, filter, watchlist toggle) | `ResearchList.jsx` |
| 8.2 | Working view vs clean export view | `ExportView.jsx` |
| 8.3 | Reference/citation system | `ReferenceList.jsx` |

### Known Risks
- **Claude API cost**: Generate sections individually to control tokens. Use claude-sonnet-4-20250514 for efficiency.
- **XBRL tag variation**: Three-layer engine covers 96.1% of scoring-critical fields across S&P 500. Remaining gaps are structural (non-dividend-payers, financials without CapEx). Companies outside S&P 500 may trigger runtime Layer 3 AI classification (~$0.01/company).
- **Key Metrics Price category**: Historical P/E per year not yet implemented (would need historical price × FY mapping).

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
