# Stock Analyzer

## Project Overview
**Stock Analyzer** — a single-user local desktop app for Rule One stock research and analysis. Generates comprehensive research reports through a 3-stage gated workflow: One Pager → Pitch Deck → Full Story. Each stage must be approved before advancing to the next. Reports are saveable, editable, and include references, tables, and illustrations.

This app is a research report generator — it answers "should I invest in this company?" through the Rule One lens. It is NOT a portfolio tracker.

The user is NOT a programmer. Keep explanations in plain English.

---

## Tech Stack & Architecture
- **Desktop shell**: Tauri (wraps the React frontend in a native macOS `.app`)
- **Frontend**: Vite + React (functional components with hooks)
- **Styling**: inline styles (dark/light palette object, no CSS framework)
- **Storage**: localStorage for saved reports (single user, no auth needed)
- **AI**: Claude API called directly from the app (no proxy needed — API key lives in local `.env.local`)
- **Financial Data**: EODHD (stock prices/financials), Polygon.io (options data), SEC EDGAR (10K/10Q filings — free)
- **Charts**: Recharts (growth metrics, valuation visuals, price charts)
- **Dev**: `npm run dev` → localhost:5173 in browser. Hot-reload works normally.
- **Desktop build**: `npm run tauri:build` → produces a native `.app` for macOS
- **No server, no hosting, no auth** — runs entirely on your machine. API calls go direct to external services.

### API Keys
Stored in `.env.local` (gitignored). No Cloudflare proxy needed since this is local-only.
```
VITE_CLAUDE_KEY=...
VITE_EODHD_KEY=...
VITE_POLYGON_KEY=...
```

---

## Research Workflow (3-Stage Gated)

The core workflow follows the Rule One Master Research Workflow. Each stage is a gate — the user must approve before the next stage unlocks.

### Stage 1 — One Pager (Filter)
**Template**: `knowledge/Research Templates/Rule One one-pager`
**Reference files**: Financial Statements and FGR, Tools for Analysis, Guru Reference List
**Purpose**: Quick screen. Is this company worth deeper research?
**Sections**: Company Info, Minimum Standards, Meaning KPIs, Management KPIs, Growth Metrics, Company Summary
**Pass/Fail**: If it doesn't meet minimum standards → discard and move on.

### Stage 2 — Pitch Deck (Research)
**Template**: `knowledge/Research Templates/Rule One PItch Deck Template.md`
**Reference files**: The Pitch Deck, Pitch Deck II/III/IV, Financial Statements and FGR, Tools for Analysis, Guru Reference List
**Purpose**: Build structured 10-part business case.
**Sections**: Radar, Simple & Predictable, Dominant Market Position, Barriers & Moats, FCF, Management, ROE/ROIC/ROA & Debt, Balance Sheet, PEST Risks, Valuation (MOS + PBT + Ten Cap)
**Gate**: Escalate only if durable thesis exists.

### Stage 3 — Full Story (Conviction)
**Template**: `knowledge/Research Templates/Rule One Story Form.md`
**Reference files**: Story Form Resources, Pitch Deck IV, Story Form I & II (examples)
**Purpose**: Conviction engineering. Final gate before capital deployment.
**Sections**: Event Analysis, Meaning, Moat, Management, Valuation Confirmation (3 calculators), Inversion & Rebuttal, Trading Strategy, Investment Strategy (PACE Plan)
**Requirement**: All inversions addressed, backtesting complete, exit defined before entry.

---

## Valuation Calculators

Three valuation methods, all computed in Stage 2 (Pitch Deck) and confirmed in Stage 3 (Full Story):

### MOS (Margin of Safety)
- Growth Rate (conservative — use lower of analyst/historical)
- EPS (TTM or adjusted)
- Future P/E (≤ 2× Growth Rate, not above historical high)
- MARR = 15%
- Sticker Price → MOS Price (50% discount)

### PBT (Payback Time)
- FCF Ratio (FCF / Earnings)
- FCF per share
- Years to payback (target ≤ 8 years)

### Ten Cap (Owner Earnings)
- Cash from Operations
- CapEx / Maintenance CapEx %
- Tax Provision
- Owner Earnings → OE per share
- Ten Cap Price = 10× Owner Earnings per share

---

## Knowledge Base

All Rule One methodology lives in `knowledge/`. These files are reference material — Claude reads them to understand methodology, not to display to users.

```
knowledge/
├── Company Research/          — 9 reference files (methodology, frameworks, analysis guides)
│   ├── Advanced_Financial_Statement_Analysis.md
│   ├── Financial Statements and FGR.md
│   ├── Guru Reference List.md
│   ├── Pitch Deck II.md
│   ├── Pitch Deck III.md
│   ├── Pitch Deck IV.md
│   ├── The Pitch Deck.md
│   ├── The Search Begins.md
│   └── Tools for Analysis.md
├── Full Story/                — 2 completed example analyses (conviction documents)
│   ├── Story Form I.md
│   └── Story Form II.md
├── Research Templates/        — 4 templates (execution frameworks)
│   ├── Rule One one-pager
│   ├── Rule One PItch Deck Template.md
│   ├── Rule One Story Form.md
│   └── Rule One Story Form - Resources.md
└── Rule One Master Research Workflow.md  — orchestration layer (stage progression rules)
```

---

## Source Structure

```
src/
├── main.jsx              — entry point
├── App.jsx               — main app shell, routing, state management
├── components/           — UI components
│   ├── OnePager.jsx      — Stage 1 report view/edit
│   ├── PitchDeck.jsx     — Stage 2 report view/edit
│   ├── FullStory.jsx     — Stage 3 report view/edit
│   ├── ResearchList.jsx  — saved reports list / dashboard
│   ├── ValuationCalc.jsx — MOS, PBT, Ten Cap calculators
│   └── ...
├── engines/              — calc engines and data fetching
│   ├── valuation.js      — MOS, PBT, Ten Cap formulas
│   ├── financials.js     — financial data fetching + parsing
│   ├── aiResearch.js     — Claude API integration for report generation
│   └── ...
└── hooks/                — custom React hooks
```

---

## Data Model (Reports)

Each research report is a single object stored in localStorage:

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
  onePager: { ... },         // Stage 1 data
  pitchDeck: { ... },         // Stage 2 data (null until approved from Stage 1)
  fullStory: { ... },         // Stage 3 data (null until approved from Stage 2)
  notes: "",                  // user's own notes
  watchlist: false            // passed all stages → add to watchlist
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
- Clean/minimal (Notion/Linear-inspired aesthetic)
- Dark/light mode toggle
- Inline styles with palette object (mutable `C` object switching between `C_LIGHT`/`C_DARK`)
- Reports rendered as structured documents with collapsible sections
- Tables for financial data, Recharts for growth/valuation visuals
- References shown as clickable links
- No auth, no accounts, no payment — single user, local desktop app

---

## Dev Commands

| Command | What it does |
|---------|-------------|
| `npm run dev` | Start Vite dev server (localhost:5173 in browser) |
| `npm run build` | Build production frontend |
| `npm run tauri:dev` | Launch desktop app in dev mode (with hot-reload) |
| `npm run tauri:build` | Package as native macOS `.app` |
