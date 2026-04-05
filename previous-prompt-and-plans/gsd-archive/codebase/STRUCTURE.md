# Codebase Structure

**Analysis Date:** 2026-03-24

## Directory Layout

```
stock-analyzer/
├── src/                         # All application source code
│   ├── main.jsx                 # React root mount, global CSS reset
│   ├── App.jsx                  # Router, top-level state (theme, research, settings)
│   ├── theme.js                 # C_LIGHT/C_DARK palettes + mutable C object
│   ├── assets/                  # Static assets imported by components
│   ├── components/              # React UI components (33 files)
│   ├── engines/                 # Data fetching + computation (43 files + __tests__)
│   ├── hooks/                   # React hooks bridging engines to components (14 files)
│   └── data/                    # Static JSON/JS lookup tables (3 files)
├── src-tauri/                   # Tauri (Rust) desktop shell
│   ├── tauri.conf.json          # Window config, build config, bundle targets
│   ├── Cargo.toml               # Rust dependencies
│   ├── src/                     # Rust entry point (minimal — no custom commands)
│   ├── capabilities/            # Tauri v2 permission declarations
│   └── icons/                   # App icons (macOS, Windows)
├── public/                      # Static files served directly (logo.svg, etc.)
├── vite.config.js               # Vite config + all dev proxy middleware plugins
├── index.html                   # HTML shell (single div#root)
├── package.json                 # npm dependencies + dev scripts
├── knowledge/                   # Rule One methodology docs, templates, examples
│   ├── engineering/             # Technical docs (app-architecture.md, XBRL docs)
│   ├── stage-1-one-pager/       # One Pager template + curriculum + LULU example
│   ├── stage-2-pitch-deck/      # Pitch Deck template + 4 curriculum files + LULU example
│   ├── stage-3-full-story/      # Full Story template + 2 curriculum files
│   ├── research-references/     # Rule One fundamentals, FGR, equity bond, etc.
│   ├── morningstar-financial-statements/  # 50-company truth set (CSV)
│   └── pre-course-examples/     # User's own research (LULU, EW, SFM, MU, ODFL)
├── industry-classification/     # Thes1s taxonomy + company assignments
│   ├── thes1s-taxonomy-tree.json         # 12 sectors, 52 groups, 176 industries
│   ├── thes1s-company-assignments.json   # 5,758 company classifications
│   ├── yahoo-to-thes1s-crosswalk.json    # 145 Yahoo → Thes1s mappings
│   └── sic-to-thes1s-crosswalk.json      # SIC → Thes1s mapping
├── validation/                  # XBRL validation scripts + reports
│   ├── scripts/                 # Python validation scripts
│   ├── data/                    # Validation test data
│   └── reports/                 # RCA and accuracy reports
├── scripts/                     # Build/utility scripts (PDF generation, etc.)
├── gstack/                      # gstack skill outputs (plans, QA reports, reviews)
├── generated-theses/            # AI-generated research output (gitignored)
├── previous-prompt-and-plans/   # Legacy prompts + plans archive
└── dist/                        # Vite build output (gitignored)
```

---

## Directory Purposes

**`src/components/`:**
- Purpose: All React UI — layout, page views, tab panels, audit tools
- Contains: 33 `.jsx` files; no subdirectories (planned: `pitchDeck/`, `fullStory/` for Phase 6/7)
- Key files:
  - `Layout.jsx` — top nav bar, content wrapper
  - `Toolbox.jsx` — 8-tab per-ticker research container (largest orchestrator, 25KB)
  - `FinancialStatements.jsx` — financials display (largest component, 49KB)
  - `Valuation.jsx` — 4 sub-tabs including valuation calculators (40KB)
  - `Competitors.jsx` — peer benchmarking with 22 metrics (36KB)
  - `Gurus.jsx` + `GuruPortfolio.jsx` — 13F guru holdings views
  - `TickerDataAudit.jsx` — XBRL coverage and provenance audit dashboard

**`src/engines/`:**
- Purpose: All external API calls, data extraction, and computation — pure async functions
- Contains: 43 `.js` files + `__tests__/` subdirectory with 13 test files
- Key files:
  - `edgarFinancials.js` — Three-layer XBRL extraction engine (1,884 lines — largest file)
  - `edgar.js` — SEC EDGAR API: CIK lookup, companyfacts, submissions, ticker search
  - `gurus.js` — 13F guru holdings, portfolio history, activity detection (1,130 lines)
  - `compensation.js` — DEF 14A proxy compensation extraction (1,521 lines)
  - `tickerAudit.js` — Full ticker data audit system (1,089 lines)
  - `sicClassification.js` — SIC code descriptions lookup (586 lines)
  - `cache.js` — Three-tier cache router (memory + IndexedDB + localStorage)
  - `cacheStore.js` — IndexedDB persistence layer (`thes1s-cache` DB, 8 stores)
  - `valuation.js` — Pure math: MOS, PBT, Ten Cap, Equity Bond calculators
  - `ruleOneScore.js` — Moat score + Management score algorithms
  - `peers.js` — SIC-based peer discovery
  - `peerMetrics.js` — EDGAR Frames API peer metrics + derived metrics + completeness scoring
  - `transcripts.js` — Earnings call transcript engine (Finnhub + Alpha Vantage)
  - `config.js` — Env key accessors (`CLAUDE_KEY`, `FINNHUB_KEY`, `ALPHA_VANTAGE_KEY`)

**`src/hooks/`:**
- Purpose: React state wrappers for engine functions — handle loading/error/cancellation
- Contains: 14 `.js` files
- Key files:
  - `useEdgar.js` — Fetches `edgarData` + `edgarStatements` + `edgarQuarterly` in parallel
  - `useResearch.js` — CRUD for research reports in localStorage
  - `useCompetitors.js` — Progressive 3-phase competitor data loading
  - `useGurus.js` — Guru portfolio data with IndexedDB hydration on mount
  - `useCompanyEvents.js` — Upcoming events (SEC 8-K + Yahoo calendar + IR page)

**`src/data/`:**
- Purpose: Static lookup tables imported at module load — zero runtime API cost
- Contains: 3 files
  - `taxonomy-hierarchy.json` — Layer 2 XBRL: 1,937 FASB descendant tags (84KB)
  - `sp500-tag-classifications.json` — Layer 3 XBRL: 1,989 AI-classified S&P 500 tags (387KB)
  - `validationCompanies.js` — 503 S&P 500 tickers for validation scripts

**`src-tauri/`:**
- Purpose: Tauri desktop shell — minimal Rust host wrapping the Vite frontend
- Contains: Standard Tauri v2 scaffold; no custom Rust commands written
- `tauri.conf.json` defines: window 1400×900, build from `../dist`, dev via `http://localhost:5173`

**`vite.config.js`:**
- Purpose: Vite build config + 7 custom dev-server middleware plugins for CORS proxying
- Plugins:
  - `yahooSummaryPlugin` — Yahoo Finance quoteSummary via `yahoo-finance2` npm package
  - `finvizPlugin` — Finviz quote page scraper (cheerio HTML parser)
  - `gurufocusPlugin` — GuruFocus API or scrape mode
  - `irEventsPlugin` — IR events page discovery (parallel URL probing)
  - `yahooCalendarPlugin` — Yahoo calendar events proxy
  - `yahooQuoteBatchPlugin` — Batch quote fetcher (chunks of 50)
  - Plus EDGAR/SEC proxy rules that add required `User-Agent` header

**`knowledge/`:**
- Purpose: Rule One methodology knowledge base consumed by AI report generation (future phases)
- Not gitignored — tracked for reference by AI prompts

**`industry-classification/`:**
- Purpose: Thes1s proprietary taxonomy for peer/competitor discovery
- 5,758 company assignments from Yahoo Finance → Thes1s → SIC crosswalks
- Not gitignored — tracking these as versioned data

---

## Key File Locations

**Entry Points:**
- `src/main.jsx` — React bootstrap, global styles
- `src/App.jsx` — Router and all route definitions
- `index.html` — HTML shell with `<div id="root">`
- `src-tauri/tauri.conf.json` — Tauri window/build config

**Configuration:**
- `src/engines/config.js` — API key accessors from `import.meta.env`
- `.env.local` — API keys (`VITE_CLAUDE_KEY`, `VITE_FINNHUB_KEY`, `VITE_ALPHA_VANTAGE_KEY`) — not committed
- `vite.config.js` — Build config + all dev proxy plugins
- `package.json` — npm scripts and dependencies

**Core Financial Engine:**
- `src/engines/edgar.js` — EDGAR API client (CIK lookup, companyfacts, submissions)
- `src/engines/edgarFinancials.js` — Three-layer XBRL extraction + derivation + provenance
- `src/engines/taxonomyResolver.js` — Layer 2 taxonomy augmentation
- `src/engines/companyAdapter.js` — Layer 3 AI tag classification
- `src/engines/industryClassifier.js` — SIC → industry type mapping
- `src/engines/industryOverlays.js` — Additive XBRL taxonomies for banks/REITs/insurance

**Scoring Engines:**
- `src/engines/growthRates.js` — CAGR for BVPS, EPS, revenue, operating cash, FCF
- `src/engines/returnMetrics.js` — ROE, ROIC, ROA averages
- `src/engines/freeCashFlow.js` — FCF series computation
- `src/engines/ruleOneScore.js` — Moat score (5 metrics) + Management score (5 metrics)
- `src/engines/valuation.js` — MOS, PBT, Ten Cap, Equity Bond calculators

**Storage:**
- `src/engines/cache.js` — Cache router (memory/IDB/localStorage)
- `src/engines/cacheStore.js` — IndexedDB interface (`thes1s-cache` DB)
- `src/hooks/useResearch.js` — Report CRUD (localStorage key: `stock-analyzer-reports`)

**Theme:**
- `src/theme.js` — `C_LIGHT`, `C_DARK`, mutable `C` object, `applyTheme()`

**Tests:**
- `src/engines/__tests__/` — 13 vitest test files
- `vitest.config.js` (if present) or vitest config in `vite.config.js`

---

## Naming Conventions

**Files:**
- React components: PascalCase `.jsx` — `FinancialStatements.jsx`, `GuruPortfolio.jsx`
- Hooks: camelCase starting with `use` + `.js` — `useEdgar.js`, `useCompetitors.js`
- Engines: camelCase `.js` — `edgarFinancials.js`, `ruleOneScore.js`
- Tests: `{subject}.test.js` in `__tests__/` sibling directory — `edgarFinancials.test.js`
- Static data: kebab-case `.json` — `taxonomy-hierarchy.json`, `sp500-tag-classifications.json`

**Directories:**
- Flat — no nested subdirectories in `src/components/`, `src/engines/`, `src/hooks/`
- Tests co-located in `__tests__/` inside `src/engines/`
- Planned subdirectories: `src/components/pitchDeck/`, `src/components/fullStory/` (Phase 6/7)

**Variables/Functions:**
- camelCase for all JS/JSX identifiers
- Engine functions exported as named exports: `export function fetchEdgarStatements(...)`
- Hook return objects use destructuring names: `{ edgarData, edgarStatements, loading, error }`
- XBRL field names: snake_case — `net_income_loss`, `operating_income_loss`, `capital_expenditures`
- Taxonomy arrays: SCREAMING_SNAKE_CASE — `INCOME_TAXONOMY`, `BALANCE_TAXONOMY`, `CASHFLOW_TAXONOMY`

---

## Where to Add New Code

**New UI tab inside Toolbox (e.g., a new research stage view):**
- Component: `src/components/NewTabName.jsx`
- Add to `TABS` array in `src/components/Toolbox.jsx`
- Add hook invocation and data props in `Toolbox.jsx`

**New engine (data source or computation):**
- Implementation: `src/engines/newEngineName.js`
- Test: `src/engines/__tests__/newEngineName.test.js`
- Hook wrapper: `src/hooks/useNewEngine.js`
- Wire hook into `Toolbox.jsx` or component as needed

**New page/route (top-level nav tab):**
- Component: `src/components/NewPage.jsx`
- Add route in `src/App.jsx`
- Add nav tab entry to `NAV_TABS` array in `src/components/Layout.jsx`

**New valuation calculator:**
- Math: `src/engines/valuation.js` — add `export function computeNewCalc({ ... })`
- UI: `src/components/ValuationCalculators.jsx`

**New financial field from XBRL:**
- Add `{ field: 'new_field', unit: 'USD', tags: ['PrimaryXBRLTag', 'FallbackTag'] }` to the appropriate taxonomy array (`INCOME_TAXONOMY` / `BALANCE_TAXONOMY` / `CASHFLOW_TAXONOMY`) in `src/engines/edgarFinancials.js`
- If derived (computed from other fields), add derivation logic to `computeDerivedFields()` and formula string to `getDerivedFormula()` in the same file

**New API integration:**
- Engine: `src/engines/newSource.js`
- Dev proxy middleware: Add plugin function in `vite.config.js` if CORS proxying required
- Add API key accessor to `src/engines/config.js` if key required

**AI report generation (planned Phase 5+):**
- Engine: `src/engines/aiResearch.js` (planned — not yet created)
- Stage 1 component: `src/components/OnePager.jsx`
- Stage 2 component: `src/components/PitchDeck.jsx` + `src/components/pitchDeck/*.jsx`
- Stage 3 component: `src/components/FullStory.jsx` + `src/components/fullStory/*.jsx`

---

## Special Directories

**`.planning/codebase/`:**
- Purpose: GSD codebase mapping documents for AI planning/execution
- Generated: Yes (by `/gsd:map-codebase`)
- Committed: Yes

**`gstack/`:**
- Purpose: gstack skill outputs — plans, QA reports, reviews, investigations
- Generated: Yes (by gstack skills)
- Committed: Yes (plans/reports/reviews tracked; screenshots gitignored)

**`validation/`:**
- Purpose: EDGAR XBRL accuracy validation scripts and reports
- Contains: Python scripts (`scripts/`), test data (`data/`), accuracy reports (`reports/`)
- Generated: Partially — scripts are authored; reports are generated artifacts
- Committed: Yes

**`dist/`:**
- Purpose: Vite production build output
- Generated: Yes (`npm run build`)
- Committed: No (gitignored)

**`generated-theses/`:**
- Purpose: AI-generated research report output files
- Generated: Yes
- Committed: No (gitignored)

**`knowledge/`:**
- Purpose: Rule One methodology documentation — templates, curricula, examples, research references
- Generated: No — manually authored
- Committed: Yes — consumed by AI report generation prompts

**`src/engines/__tests__/fixtures/`:**
- Purpose: Test fixture data for engine unit tests
- Committed: Yes

---

*Structure analysis: 2026-03-24*
