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
- **Financial Data**: SEC EDGAR XBRL (all financials, 13F guru holdings, N-PORT, insiders, compensation, splits — free), Yahoo Finance (prices — free), Finviz (analyst estimates — free), GuruFocus (optional $25/mo API)
- **Charts**: Recharts
- **Deps**: recharts, @anthropic-ai/sdk, uuid, react-router-dom, turndown, turndown-plugin-gfm, yahoo-finance2, cheerio, idb
- **No server, no auth** — runs entirely locally. API calls go direct to external services.

For detailed API integration notes (CORS proxying, EDGAR XBRL details, parsing internals), see `knowledge/references/app-architecture.md`.

---

## Architecture Reference
**When debugging or modifying any engine, API integration, scoring algorithm, CORS proxy, validation system, or parser** — read `knowledge/references/app-architecture.md` first. It contains detailed technical documentation for all implemented systems (moved from CLAUDE.md to save context window).

---

## Current Status
Phases 1-4 complete — app shell, data engines, calculation engines, and full Toolbox UI all functional. EDGAR engine validated across 89 companies (production-ready). **The remaining work is Phase 5-8: AI-driven report generation.**

### What's Built
All data engines, all UI tabs (Overview, Financials, Growth, Valuation, Insiders, Filings, Audit), Gurus tab with 13F + N-PORT, Watchlists, executive compensation, filing markdown conversion, 5 audit systems (validation, guru, ticker, N-PORT, compensation). See source tree below.

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

Four methods, all computed in Stage 2 and confirmed in Stage 3:

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
├── workflow.md                    — Master Research Workflow (stage progression)
├── references/
│   ├── advanced-financial-analysis.md
│   ├── app-architecture.md        — Detailed API/engine/scoring/validation docs (moved from CLAUDE.md)
│   ├── capex-cash-flow-explained.md
│   ├── consolidated_vs_expanded_financial_statements.md
│   ├── edgar-taxonomy-research-report.md
│   ├── edgar-xbrl-taxonomy.md
│   ├── financial-statements.md    — FGR methodology, Big 4 growth rates
│   ├── guru-list.md               — 43 named Gurus for 13F lookup
│   ├── morningstar_original_vs_restated_financials.md
│   └── tools-for-analysis.md      — 3 Ms framework (Moat, Management, MOS)
├── stage-1-one-pager/             — template.md, curriculum, LULU example
├── stage-2-pitch-deck/            — template.md, 4 curriculum files, LULU example + resources
├── stage-3-full-story/            — template.md, 2 curriculum files, resources.md, LULU example
└── pre-course-examples/           — User's own research (Old Template, EW, SFM, MU, ODFL)
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
│   ├── Toolbox.jsx              — Main research container (7 tabs: Overview/Financials/Growth/Valuation/Insiders/Filings/Audit)
│   ├── CompanyHeader.jsx, StockAtGlance.jsx, ScoreTable.jsx
│   ├── FinancialStatements.jsx  — Financials + Key Metrics, 4 dropdown controls
│   ├── GrowthAnalysis.jsx, GrowthRateAnalysis.jsx
│   ├── Valuation.jsx            — 4 sub-tabs (Growth Rate Analysis/Inputs/Calculators/Price vs Value)
│   ├── ValuationCalculators.jsx, ValuationInputs.jsx, HistoricalBuyPrices.jsx
│   ├── Insiders.jsx, ExecutiveCompensation.jsx, Filings.jsx
│   ├── Gurus.jsx, GuruPortfolio.jsx
│   ├── GuruAudit.jsx, TickerAudit.jsx, NportAudit.jsx, CompAudit.jsx, TickerDataAudit.jsx
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
│   ├── gurus.js, nport.js, insiders.js, compensation.js, splits.js
│   ├── growthRates.js, freeCashFlow.js, returnMetrics.js, ruleOneScore.js
│   ├── valuation.js, fgr.js, validation.js
│   ├── tickerSearch.js, companyDetails.js, sicClassification.js, tickerAudit.js
│   ├── analystEstimates.js, finviz.js, gurufocus.js, filingMarkdown.js
│   └── aiResearch.js            — (planned) Claude API calls + prompt builders
├── hooks/
│   ├── useResearch.js, useFinancials.js, usePrices.js, useEdgar.js
│   ├── useGurus.js, useInsiders.js, useCompensation.js
│   ├── useAnalystData.js, useAnalystEstimates.js
│   ├── useWatchlists.js, useSettings.js, useTheme.js
├── data/validationCompanies.js
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
  watchlist: false
}
```
**localStorage key**: `stock-analyzer-reports`

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
- **Toolbox tabs**: Overview | Financials | Growth | Valuation | Insiders | Filings | Audit
- **Styling**: Inline styles with mutable `C` palette object (dark/light). Cards with border + borderRadius 8.
- **Reference**: `knowledge/stickeR1-reference-ui.md` + `knowledge/Rule One Toolbox UI examples/`

---

## Dev Commands

| Command | What it does |
|---------|-------------|
| `npm run dev` | Vite dev server (localhost:5173) |
| `npm run build` | Production build |
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
- **XBRL tag variation**: Taxonomy handles ~95% of large/mid-cap. Edge cases may need new tags.
- **Key Metrics Price category**: Historical P/E per year not yet implemented (would need historical price × FY mapping).
