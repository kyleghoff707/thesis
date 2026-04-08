# Thes1s

## Project Overview
**Thes1s** (pronounced "thesis") — an AI-powered Rule One stock research and analysis application. The "1" nods to Rule One — pairs with the user's portfolio tracker **stickeR1**. Generates comprehensive research reports through a 3-stage gated workflow: One Pager → Pitch Deck → Full Story.

This app is a research report generator — it answers "should I invest in this company?" through the Rule One lens. It is NOT a portfolio tracker.

The user is NOT a programmer. Keep explanations in plain English.

**Goal**: Reduce 40+ hours of manual Rule One research per company using AI-assisted analysis.

**Status**: V1 complete — all 3 pipeline stages built and validated in-app. 12 specialized AI agents, wave-based orchestration, structured output schemas, quality validation, and in-app rendering for all stages. Currently a local desktop app (Tauri + Vite). Next phase: migrate to a deployed web application.

### Branding
- **Name**: Thes1s — "1" replaces the "i"
- **Logo**: `public/logo.svg` — fused T1 letterform. Teal-500 + slate-800.
- **In-app**: Logo mark (22px) + styled text ("Thes" medium, "1" custom SVG glyph in teal — hybrid 1/i with tight wedge flag + narrow base, "s" medium). Inter font.

### Design Philosophy

Thes1s is a professional AI-powered investment analyst team. The user is the portfolio manager; the AI agents are the analyst team. Each agent follows Rule One methodology exactly and produces hedge-fund-quality investment theses.

**Core Value:** Depth of investigation that exceeds what a single human analyst can achieve in 70+ hours — delivered in minutes, with zero shortcuts on rigor.

**Design Litmus Test:** "How would a real hedge fund do this?" — Every design decision must pass this test. Would a hedge fund prevent analysts from web searching? No. Would they expect quality? Yes. Would a PM tolerate half-assed work? No. If a real hedge fund wouldn't do it that way, don't build it that way.

### Constraints
- **LULU contamination**: Agents must never access LULU examples during generation. Evaluation only.
- **Rule One methodology**: Creative freedom is limited to investigation depth and narrative style — never methodology.
- **User verification**: No milestone is "done" until the user says so.

---

## Tech Stack
- **Desktop**: Tauri (native macOS `.app`) — to be replaced with web deployment
- **Frontend**: Vite + React (functional components, hooks, inline styles with dark/light palette)
- **Storage**: localStorage (reports, settings, watchlists), IndexedDB (EDGAR, guru, price, insider, compensation caches) via `cacheStore.js`
- **AI**: Claude API direct from app (`VITE_CLAUDE_KEY` in `.env.local`)
- **Financial Data**: SEC EDGAR XBRL (all financials, 13F guru holdings, N-PORT, insiders, compensation — free), Yahoo Finance (prices, stock splits — free), Finviz (analyst estimates — free), GuruFocus (optional $25/mo API), Alpha Vantage (earnings transcripts — free 25 calls/day, 2-key failover)
- **Charts**: Recharts
- **Deps**: recharts, @anthropic-ai/sdk, uuid, react-router-dom, turndown, turndown-plugin-gfm, yahoo-finance2, cheerio, idb, zod
- **No server, no auth** — runs entirely locally. API calls go direct to external services. (This will change with web migration.)

For detailed API integration notes (CORS proxying, EDGAR XBRL details, parsing internals), see `knowledge/engineering/app-architecture.md`.

---

## Architecture Reference
**When debugging or modifying any engine, API integration, scoring algorithm, CORS proxy, validation system, or parser** — read `knowledge/engineering/app-architecture.md` first.

**When debugging or modifying the XBRL extraction engine, taxonomy, provenance, industry overlays, or coverage systems** — read `gstack/plans/gstack-xbrl-engine-strategy-eng-plan-20260318.md` first.

### Three-Layer XBRL Engine (`edgarFinancials.js`)

Maps SEC XBRL tags to ~85 standardized financial fields. Validated across all 503 S&P 500 companies with 0 failures.

| Layer | What | How | Performance |
|-------|------|-----|-------------|
| **Layer 1** | Static tag map (~200 tags) in `edgarFinancials.js` | Priority-ordered fallback tags per field | O(1), handles ~96% |
| **Layer 2** | Pre-built taxonomy JSON (1,937 descendant tags) | `taxonomy-hierarchy.json` from FASB calc linkbase | O(1) lookup, <100KB |
| **Layer 3** | AI tag classification (1,989 pre-classified tags) | `sp500-tag-classifications.json` via Claude Sonnet | O(1) for S&P 500, runtime AI for others |

**Industry overlays** — Additive taxonomies for bank, REIT, and insurance companies. Detected via SIC code → `industryClassifier.js`.

**Data provenance** — Every extracted value carries parallel metadata: XBRL tag, layer (1/2/3), derived flag, confidence score, human-readable formula. Annual AND TTM provenance tracked. Components read bare numbers; provenance is opt-in.

**Coverage monitor** — Baseline storage + change detection per ticker in localStorage.

**Display name resolution** — 2-tier: (1) curated S&P 500 names from `src/data/sp500-display-names.json`, (2) `formatCompanyName()` algorithmic fallback for non-S&P companies.

### EDGAR Frames API — Period Distinction (Critical)
The Frames endpoint uses **different period specifiers** for balance sheet vs income statement tags:
- **Duration tags** (income statement, cash flows): `CY{year}.json`
- **Instant tags** (balance sheet, point-in-time): `CY{year}Q4I.json`

All tag definitions have a `period: 'instant' | 'duration'` property. **Always use this property** when constructing Frames API URLs. Using the wrong period returns 404.

### XBRL Taxonomy Conventions
- **`negate` flag**: Some cash flow fields have `negate: true` to flip XBRL's balance-sheet-change convention to cash-impact convention. Do NOT add `negate` to payables — payable increases are already positive in both conventions.
- **Debt sanity check**: If `total_debt / liabilities < 5%` AND `interest_expense > 0`, derives debt from `liabilities - known-non-debt-items`. Interest expense gate prevents false positives on zero-debt companies (e.g., LULU).
- **Normalized operating income**: `operating_income_loss` + irregular charges. Combined XBRL tags handled via `restructuring_and_impairment` to prevent double-counting with `asset_impairment`.
- **SGA derivation**: Uses combined `SellingGeneralAndAdministrativeExpense` tag. `computeDerivedFields` sums separate fields when combined tag is null.
- **Derived field formulas**: `getDerivedFormula()` returns human-readable formulas for ~40 derived fields. Stored in provenance.
- **REIT FFO caveat**: Derived, not tagged. `gain_loss_on_real_estate_sales` discontinued by many REITs after FY2018 — FFO is approximate for recent years.
- **Insurance float caveat**: Approximation from XBRL balance sheet items. BRK's reported float cannot be reconstructed from standard tags.
- **AFFO maintenance capex**: Hardcoded at 15% of total capex in overlay. AI reports should use user's maintenance capex % from Valuation Calculators instead.

---

## Normalization Engine

Validates Thes1s's XBRL extraction against external truth sets (Morningstar 50-company, FMP S&P 500). 22/24 requirements complete. Full history archived in `_planning-archive/phases/` (01-04 + COMP-01 + KM-01/KM-02).

### Accuracy

| Metric | Value |
|--------|-------|
| MS 50-company baseline | **94.8%** |
| S&P 500 Tier 1 (scoring-critical) | **87.3%** |
| S&P 500 Tier 2 (display) | **83.8%** |
| S&P 500 Overall | **83.0%** |
| Key Metrics (S&P 100, core fields) | **85-94%** |
| Key Metrics (S&P 100, overall) | **65.9%** |
| Compensation parsing (503 S&P 500) | **94.8%** (477/503) |

The 94.8% MS number is the regression gate — engine changes must not drop below **94.0%**.

S&P 500 gaps are methodology differences (FMP's normalization vs our XBRL extraction), not bugs.

### Key Decisions

1. **94%+ is the target** (not 98%) — remaining diffs are methodology, not bugs.
2. **FMP is the primary S&P 500 truth set** — SimFin/mstarpy are secondary.
3. **Only fix FMP-confirmed Tier 1 bugs** — don't chase methodology diffs.
4. **Fix+validate iteratively** — one fix, rebuild bundle, check regression gate.
5. **Comparator fixes != engine fixes** — sign/FY corrections live in comparator, not engine.
6. **Alias map resolves at lookup time** — canonical→engine name resolution during comparison.
7. **Overlay-wins for industry overlays** — REIT/bank/insurance overlay tags take priority.
8. **95% coverage gate on residual Other** — only compute when 95%+ named items present.
9. **Engine bundle must be rebuilt** after any engine change: `node validation/scripts/bundle.mjs`
10. **S&P 500 coverage is sufficient** — beyond-S&P validation dropped as margin work.

### Validation Commands

```bash
# Rebuild engine bundle (required after any engine change)
node validation/scripts/bundle.mjs

# MS 50-company regression gate (must stay >= 94.0%)
node validation/scripts/compare-morningstar.mjs

# S&P 500 FMP comparison (full 503 companies, or single ticker)
node validation/scripts/compare-sp500-fmp.mjs
node validation/scripts/compare-sp500-fmp.mjs --ticker AAPL

# Key metrics validation (S&P 100)
node validation/scripts/compare-key-metrics.mjs

# Compensation comparison
node validation/scripts/compare-compensation.mjs --ticker AAPL

# Run project tests
npm test -- --run
```

**Remaining**: SCALE-04 — cancel FMP and SimFin subscriptions (user action; paid sources were only needed to build and validate normalization rules).

---

## Research Workflow (3-Stage Gated)

Each stage is a gate — user must approve before the next unlocks.

### Stage 1 — One Pager (Filter)
**Template**: `knowledge/stage-1-one-pager/template.md` | **Curriculum**: `one-pager.md`
Quick screen: Company Info, Minimum Standards, Meaning/Management KPIs, Growth Metrics, Summary. Pass/Fail gate.

### Stage 2 — Pitch Deck (Research)
**Template**: `knowledge/stage-2-pitch-deck/template.md` | **Curriculum**: `pitch-deck-I.md` through `IV.md`
10-part business case: Radar, Simple & Predictable, Market Position, Barriers & Moats, FCF, Management, ROE/ROIC/ROA & Debt, Balance Sheet, PEST Risks, Valuation (MOS + PBT + Ten Cap + Equity Bond).

### Stage 3 — Full Story (Conviction)
**Template**: `knowledge/stage-3-full-story/template.md` | **Curriculum**: `story-form-I.md`, `II.md`
Final gate: Event Analysis, Meaning (15pt checklist), Moat (15pt), Management (13pt), Valuation Confirmation, Inversion & Rebuttal, Trading Strategy, PACE Plan.

---

## FGR (Future Growth Rate)

FGR is NOT a formula — it's an informed assessment using 5 inputs:
1. **Rear View Mirror** — Historical composite growth rate (BVPS+Div, Earnings, OpCash, Revenue)
2. **Market Relativity** — Cumulative stockholder return vs S&P 500 and sector
3. **Company Guidance** — Management's stated growth plans
4. **Sector/Industry** — Industry CAGR from trade journals
5. **Analysts** — Seeking Alpha, Wall St consensus, revenue growth estimates

Average the quantifiable inputs → FGR. FGR feeds ALL valuation calculators.

### Composite GR
The Weighted Average panel averages all selected metrics. Default Big 4: BVPS+Div, Earnings, OpCash, Revenue. Any metric can be toggled in/out. Growth metrics use weighted avg YoY growth rates; return metrics use simple averages of annual values.

---

## Valuation Calculators

Four methods. **All produce buy RANGES, not single prices** — key inputs accept Low/High values.

### Range Inputs (Low/High)
- **FGR** — affects MOS + PBT
- **Maintenance CapEx %** — affects Ten Cap only
- **Historical Avg P/E** — affects Equity Bond only

**Future P/E** is a single value — default `2 × max(FGR Low, FGR High)`, capped at historical high P/E. MARR shared between MOS and PBT (default 15%); Equity Bond has independent MARR (default 20%) and MOS% (default 50%).

### MOS (Margin of Safety)
EPS → grow at FGR for 10 years → Future P/E (≤ 2x FGR, capped at historical high) → discount at MARR → Sticker Price → 50% MOS = Buy Price.

### PBT (Payback Time)
FCF Ratio → FCF per share → compound at FGR → sum 8 years → target ≤ 8 years payback.

### Ten Cap (Owner Earnings)
Cash from Ops - Maintenance CapEx + Tax Provision = Owner Earnings. Ten Cap Price = 10 × (OE / Shares Outstanding).

### Equity Bond (from *Buffettology*, 1997)
BVPS → grow 10yr at (ROE × retained ratio) → future EPS → future price (× historical avg P/E) → discount at MARR → MOS% discount → Buy Price. See `knowledge/research-references/equity-bond-research.md` for full methodology.

---

## Report Generation Requirements

These patterns from the user's real analyses must be built into AI report generation:

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
13. **Industry-contextual benchmarks** — Gross margin ≥40% is a starting point, not a rule
14. **Reference/citation system** — Numbered refs, bracket inserts
15. **Industry-wide peer screens** — 15+ companies, not just 2-3 hand-picked
16. **Watchlist/no-buy outcomes** — "Great company but too expensive" is valid
17. **Cyclical business handling** — CAGR from "first positive year," multiple capex ratios
18. **Industry-specific KPIs** — Adapt per industry
19. **Acquisition history tracking** — Table of all acquisitions
20. **Red flag tracking** — Explicit section for concerns, even when bullish

---

## Agent Pipeline

12 specialized AI agents with wave-based orchestration. Pipeline cost: ~$8-12/company for Pitch Deck, ~$28-30 for all 3 stages.

| Agent | Role |
|-------|------|
| business-analyst | Meaning & Simple Predictability |
| competitor-evaluator | Market Position & Barriers/Moats |
| financial-analyst | FCF, ROE/ROIC, Balance Sheet |
| management-evaluator | Management Quality |
| risk-analyst | PEST Risks |
| valuation-specialist | Valuation & FGR |
| synthesis-writer | Polish & Final Synthesis |
| annual-reader | Annual report preprocessing |
| quarterly-reader | Quarterly report preprocessing |
| primary-source-reader | SEC filing extraction |
| data-assembler | Data staging (code-driven) |

Key engines: `aiResearch.js` (Claude API dispatch), `pipelineManager.js` (wave orchestration), `critic.js` (quality validation), `onePagerGenerator.js` (single-call One Pager), `dataExport.js` (DataPacket assembly).

Full Story uses adversarial debate: Bull → Bear → Rebuttal → Judge.

### Known V1 Limitations
- Sensitivity tables: schema exists, not yet wired into agent output or UI
- Cost optimization: PSR agents re-read filings fresh per stage instead of reusing findings
- Content quality: citation URL laundering, DataPacket path fabrication by agents

---

## Knowledge Base

```
knowledge/
├── engineering/          — app-architecture.md, agent-workflows/, agentic-workflows/
├── research-references/  — Rule One fundamentals, FGR, equity bond, guru list, Buffett letters
├── intel-reports/        — XBRL normalization research, EDGAR taxonomy, compensation extraction
├── stage-1-one-pager/   — template, curriculum, examples
├── stage-2-pitch-deck/  — template, 4 curriculum files, examples
├── stage-3-full-story/  — template, 2 curriculum files, examples
├── morningstar-financial-statements/   — 50-company MS CSV truth set
├── morningstar-quarterly-financial-statements/
├── r1-toolbox-financial-statements/
└── pre-course-examples/  — User's own research (EW, SFM, MU, ODFL)
```

### Industry Classification (tracked in repo)

**When working on classification or peer discovery** — read `industry-classification/taxonomy-classification-learning.md` first.

Contains: `thes1s-taxonomy-tree.json` (12 sectors, 52 industry groups, 176 industries), `thes1s-company-assignments.json` (5,758 companies), Yahoo→Thes1s + SIC→Thes1s crosswalks.

---

## Source Structure

```
agents/               — 12 AI agents + orchestrator (configs, prompts, writing briefs, tests)
scripts/              — CLI runners (pipeline, full story, quality), data prep, PDF toolkit
src/
├── components/       — ~58 React components (Toolbox, report renderers, audit views)
│   └── pitchDeck/    — AssumptionTracker, DeepDivePanel, IndustryCard
├── engines/          — ~56 engine modules (EDGAR, scoring, AI pipeline, caching)
├── hooks/            — ~20 React hooks (data fetching, report state, settings)
├── schemas/          — 5 Zod schemas (reportSection, debateStep, dataPacket, progress, onePager)
├── data/             — Static lookup tables (taxonomy, tag classifications, display names)
├── App.jsx, main.jsx, theme.js
validation/           — 3-layer validation system (scripts, data, reports)
industry-classification/ — Thes1s taxonomy + crosswalks
knowledge/            — Domain knowledge, templates, curriculum, truth sets
_planning-archive/    — Full normalization GSD history (phases 01-04, requirements, roadmap)
gstack/               — gstack skill artifacts (plans, QA reports, reviews, design)
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

---

## Conventions

- **Components**: PascalCase `.jsx`, `export default function`, props destructured in signature
- **Hooks**: `use` prefix, single named export, return `{ data, loading, error }`
- **Engines**: camelCase `.js`, named exports, action verb prefix (`compute`, `fetch`, `extract`)
- **Constants**: UPPER_SNAKE_CASE — `INCOME_TAXONOMY`, `PERIODS`, `IDB_PREFIXES`
- **Financial fields**: `snake_case` — `net_income_loss`, `cost_of_revenue`
- **Report data**: camelCase keys — `currentStage`, `stageApprovals`
- **Theme**: `import { C } from '../theme'` — mutable palette object
- **Error handling**: `try/catch` → return `null`. Hooks: `{ data, loading, error }`. Cancellation: `let cancelled = false` in `useEffect` cleanup.
- **Logging**: `console.warn` for non-fatal errors, `console.log` sparingly. Never `console.error`.
- **Code style**: 2-space indent, single quotes, semicolons, trailing commas

---

## Bug-Fixing Strategy

1. **Diagnose with `/investigate`** (gstack). Four-phase root cause analysis.
2. **Write a failing test.** Prove the bug exists. Use vitest (`npm test`).
3. **Fix with a subagent.** Give it the failing test and specific files.
4. **Verify.** All tests pass, app compiles, dev server runs.

---

## gstack

Use `/browse` for all web browsing. Never use `mcp__claude-in-chrome__*` tools. Skill artifacts save to `gstack/` folder (visible, git-tracked) instead of hidden `~/.gstack/`.

### Key Skills
`/investigate` (debugging) | `/qa` `/qa-only` (testing) | `/review` (code review) | `/ship` (deploy) | `/browse` (web) | `/design-review` (visual QA) | `/plan-ceo-review` `/plan-eng-review` `/plan-design-review` (planning) | `/autoplan` (all reviews) | `/codex` (second opinion) | `/cso` (security audit) | `/retro` (retrospective) | `/office-hours` | `/design-consultation` | `/careful` `/freeze` `/guard` `/unfreeze` (safety) | `/land-and-deploy` `/canary` `/benchmark` `/setup-deploy` (deployment)

### Artifact Output
All gstack artifacts save to `gstack/` subfolders (plans, qa-reports, reviews, design, test-plans, test-outcomes, investigations, security-reports, browse-logs). File naming: `gstack-{topic}-{type}-{YYYYMMDD}.md`.

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
- Save progress, checkpoint, resume → invoke checkpoint
- Code quality, health check → invoke health
