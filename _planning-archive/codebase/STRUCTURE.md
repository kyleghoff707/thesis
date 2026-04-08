# Codebase Structure

**Analysis Date:** 2026-03-25

## Directory Layout

```
stock-analyzer/
├── src/
│   ├── main.jsx                 # Bootstrap: mount React root, inject global CSS
│   ├── App.jsx                  # Route declarations, top-level state (useResearch, useTheme, useSettings)
│   ├── theme.js                 # Mutable palette C, C_LIGHT, C_DARK, applyTheme()
│   │
│   ├── components/              # React view layer (no data fetching, only render props)
│   │   ├── Layout.jsx           # Top nav bar, 4 nav tabs, ticker search, max-width wrapper
│   │   ├── Toolbox.jsx          # Primary research surface: 8-tab container, all hook calls, scoring computations
│   │   ├── ResearchEmpty.jsx    # Placeholder when no research exists
│   │   ├── ResearchList.jsx     # List of all research items
│   │   ├── Watchlists.jsx       # Watchlist management
│   │   ├── Settings.jsx         # Theme, defaults, preferences modal
│   │   ├── TickerSearch.jsx     # Ticker autocomplete, fuzzy match
│   │   │
│   │   ├── CompanyHeader.jsx    # Ticker, company name, key badges
│   │   ├── StockAtGlance.jsx    # Current price, 52-week range, dividend, P/E cards
│   │   ├── ScoreTable.jsx       # Moat + Management scoring display
│   │   │
│   │   ├── FinancialStatements.jsx    # Financials tab: 4 dropdown controls (annual/quarterly, restated/original, P/E/dividends)
│   │   ├── GrowthAnalysis.jsx         # Growth tab: multi-period CAGR, smoothed growth rates, charts
│   │   ├── GrowthRateAnalysis.jsx     # Sub-tab: detailed growth rate picker
│   │   ├── Valuation.jsx              # Valuation tab: 4 sub-tabs (Growth Rate Analysis/Inputs/Calculators/Price vs Value)
│   │   ├── ValuationInputs.jsx        # Valuation sub-tab: FGR inputs, MARR, CapEx %, P/E
│   │   ├── ValuationCalculators.jsx   # Valuation sub-tab: MOS, PBT, Ten Cap, Equity Bond with scenarios
│   │   ├── HistoricalBuyPrices.jsx    # Valuation sub-tab: buy prices for 5yr, 10yr periods
│   │   ├── Competitors.jsx            # Competitors tab: SIC-based peers, 22 metrics, completeness scoring
│   │   ├── Insiders.jsx               # Insiders tab: form 4 activity, insider holdings
│   │   ├── ExecutiveCompensation.jsx  # Exec comp section: proxy statement data
│   │   ├── Gurus.jsx                  # Gurus tab: 13F + N-PORT holdings + portfolio
│   │   ├── GuruPortfolio.jsx          # Individual guru portfolio view
│   │   ├── Filings.jsx                # Filings tab: 10-K/10-Q list, markdown preview, transcript buttons
│   │   ├── CompanyEvents.jsx          # Upcoming Events & News: SEC 8-K, Yahoo calendar, IR page
│   │   │
│   │   ├── TickerDataAudit.jsx        # Data Audit tab: provenance, coverage monitor, baseline comparison
│   │   ├── GuruAudit.jsx              # Audit route: 13F parsing validation
│   │   ├── TickerAudit.jsx            # Audit route: ticker lookup consistency
│   │   ├── NportAudit.jsx             # Audit route: N-PORT extraction validation
│   │   ├── CompAudit.jsx              # Audit route: compensation extraction validation
│   │   │
│   │   ├── OnePager.jsx               # Stage 1: One Pager research template (WIP)
│   │   ├── CollapsibleSection.jsx     # Reusable collapse/expand section
│   │   ├── SectionRenderer.jsx        # Report section markdown → HTML rendering
│   │   ├── VerdictBadge.jsx           # Pass/Fail/Pending badge for stage gates
│   │   ├── RedFlagCallout.jsx         # Risk/concern display component
│   │   ├── CitationTooltip.jsx        # Reference/citation popup
│   │   ├── ConfidenceBadge.jsx        # Confidence level indicator (from Layer 3 AI classification)
│   │   │
│   │   ├── Validation.jsx             # Validation page: run tests, view audit results
│   │   ├── ReportsList.jsx            # Reports list page (planned)
│   │   └── __tests__/                 # Component unit tests
│   │       ├── onePager.test.js
│   │       ├── sectionRenderer.test.js
│   │       ├── verdictBadge.test.js
│   │       └── generationProgress.test.js
│   │
│   ├── engines/                 # Pure data logic layer (no React, all async functions)
│   │   ├── edgar.js             # SEC EDGAR API: ticker map, companyfacts, submissions, ticker search
│   │   ├── edgarFinancials.js   # Three-layer XBRL extraction: INCOME/BALANCE/CASHFLOW taxonomies, industry overlays, derived fields, provenance
│   │   ├── edgarFrames.js       # EDGAR Frames API: cross-validation of extracted values
│   │   ├── industryClassifier.js # SIC code → industry type (bank/reit/insurance/standard)
│   │   ├── industryOverlays.js  # Additive XBRL taxonomy for bank/REIT/insurance
│   │   ├── taxonomyResolver.js  # Layer 2: taxonomy hierarchy augmentation (FASB descendant tags)
│   │   ├── companyAdapter.js    # Layer 3: AI tag classification (pre-built S&P 500 + runtime API)
│   │   │
│   │   ├── cache.js             # Three-tier cache coordinator: memory + IndexedDB + localStorage
│   │   ├── cacheStore.js        # IndexedDB persistence layer via idb package
│   │   ├── config.js            # Environment variable access (VITE_CLAUDE_KEY, etc.)
│   │   │
│   │   ├── growthRates.js       # CAGR, YoY growth, smoothed growth rate computation
│   │   ├── returnMetrics.js     # ROE, ROIC, ROA computation (yearly + period averages)
│   │   ├── freeCashFlow.js      # FCF yearly breakdown, FCF per share, CapEx ratio
│   │   ├── ruleOneScore.js      # Moat + Management scoring algorithm (reverse-engineered from Toolbox)
│   │   ├── keyMetrics.js        # 62 derived metrics (per-share, profitability, debt, operating, price)
│   │   ├── valuation.js         # Valuation calculator orchestration
│   │   ├── fgr.js               # FGR (Future Growth Rate) derivation from 5 inputs
│   │   │
│   │   ├── splits.js            # Stock split detection (Yahoo primary, EDGAR fallback) + cumulative split factor
│   │   ├── prices.js            # Yahoo Finance price history, latest price, dividend data
│   │   ├── priceStore.js        # IndexedDB store for price time-series caching
│   │   ├── batchQuotes.js       # Yahoo batch quotes: market cap, P/E, EPS, book value, shares, dividend yield
│   │   │
│   │   ├── peers.js             # SIC-based peer discovery (browse-edgar + Frames fallback)
│   │   ├── peerMetrics.js       # Peer metrics via Frames API + derived metrics + Yahoo backfill + completeness scoring
│   │   ├── companyDetails.js    # Company info (name, SIC, exchange) from EDGAR submissions
│   │   ├── companyEvents.js     # Upcoming events engine (SEC 8-K parsing, Yahoo calendarEvents+assetProfile, IR page discovery)
│   │   │
│   │   ├── gurus.js             # Guru data engine: fetch, parse, cache 13F + N-PORT filings
│   │   ├── nport.js             # N-PORT mutual fund holdings extraction
│   │   ├── insiders.js          # Form 4 insider trading activity
│   │   ├── compensation.js      # Executive compensation from proxy statements
│   │   ├── analystEstimates.js  # Analyst estimates via Finviz scraper
│   │   ├── finviz.js            # Finviz quote snapshot scraper (via Vite middleware)
│   │   ├── gurufocus.js         # GuruFocus API (optional, paid)
│   │   ├── filingMarkdown.js    # SEC filing HTML → Markdown conversion
│   │   ├── transcripts.js       # Earnings call transcript engine (Finnhub premium + Alpha Vantage free)
│   │   │
│   │   ├── sicClassification.js # SIC code lookup, industry classification
│   │   ├── thes1sClassification.js # Thes1s taxonomy classification (12 sectors, 52 industry groups, 176 industries)
│   │   ├── tickerSearch.js      # Ticker → company fuzzy search
│   │   ├── tickerAudit.js       # Validation: ticker lookup consistency
│   │   ├── validation.js        # Test runner, audit system orchestration
│   │   ├── formatCompanyName.js # Company name normalization
│   │   │
│   │   ├── dataExport.js        # Export research data to JSON/CSV
│   │   ├── toolbox.js           # Toolbox orchestration helpers
│   │   ├── progressState.js     # Report generation progress tracking
│   │   ├── contextBudget.js     # Claude API context window budgeting
│   │   ├── critic.js            # Critic engine for report review (planned)
│   │   ├── nodeAdapter.js       # Node.js compatibility layer (validation scripts)
│   │   │
│   │   ├── __tests__/           # Engine unit tests (vitest)
│   │   │   ├── edgarFinancials.test.js      # Layer 1/2/3 tag resolution, derived fields, provenance
│   │   │   ├── taxonomyResolver.test.js    # Layer 2 augmentation
│   │   │   ├── industryOverlays.test.js    # Bank/REIT/insurance overlays
│   │   │   ├── companyAdapter.test.js      # Layer 3 AI classification
│   │   │   ├── splits.test.js              # Stock split detection + cumulative factor
│   │   │   ├── peerMetrics.test.js         # Peer metrics computation
│   │   │   ├── coverageMonitor.test.js     # Baseline storage + coverage comparison
│   │   │   └── fixtures/                   # Test data
│   │   │       ├── morningstar/            # 50-company validation dataset
│   │   │       ├── morningstar-quarterly/  # Quarterly test data
│   │   │       └── r1toolbox/              # Rule One Toolbox examples
│   │   │
│   │   └── (DEPRECATED / DORMANT):
│   │       └── aiResearch.js   # Placeholder for Stage 1-3 Claude API integration (planned)
│   │
│   ├── hooks/                   # React hooks: state + lifecycle management
│   │   ├── useFinancials.js     # Company details (name, SIC, exchange)
│   │   ├── useEdgar.js          # EDGAR statements + quarterly (version/view control)
│   │   ├── usePrices.js         # Price history, latest price, dividend data
│   │   ├── useGurus.js          # Guru activities (13F, N-PORT)
│   │   ├── useInsiders.js       # Insider activity summary
│   │   ├── useCompensation.js   # Executive compensation data
│   │   ├── useCompetitors.js    # Peer discovery + metrics + Yahoo backfill + scoring
│   │   ├── useCompanyEvents.js  # Upcoming events + IR link probing (direct + fallback)
│   │   ├── useAnalystData.js    # Analyst consensus + recommendations
│   │   ├── useAnalystEstimates.js # Finviz analyst estimates
│   │   ├── useResearch.js       # Research report CRUD (localStorage)
│   │   ├── useSettings.js       # User preferences (theme, defaults, version, view)
│   │   ├── useTheme.js          # Theme state + toggle (dark/light)
│   │   ├── useWatchlists.js     # Watchlist management (localStorage)
│   │   ├── useOnePager.js       # Stage 1 One Pager generation + state (planned)
│   │   └── (pattern): all return `{ data/[specific fields], loading, error }`
│   │
│   ├── data/                    # Pre-built static lookup tables (git-tracked, zero API cost)
│   │   ├── sp500-tag-classifications.json  # Layer 3: 1,989 AI-classified XBRL tags for S&P 500 (387KB)
│   │   ├── taxonomy-hierarchy.json         # Layer 2: 1,937 FASB descendant tags (84KB)
│   │   └── validationCompanies.js          # 50-company validation dataset metadata
│   │
│   ├── schemas/                 # Data validation schemas
│   │   ├── __tests__/           # Schema validation tests
│   │   └── (future: zod/yup validation)
│   │
│   └── assets/                  # Static assets (logo, icons, etc.)
│       └── logo.svg             # Thes1s logo (fused T1 letterform)
│
├── src-tauri/                   # Tauri native shell (macOS .app packaging)
│   ├── src/
│   │   └── lib.rs               # Rust command handlers (IPC from frontend)
│   └── tauri.conf.json          # App config: window size 1400×900, bundle targets
│
├── vite.config.js               # Vite + 5 custom middleware plugins
│   # Plugins:
│   # - yahooSummary: /api/yahoo-summary/:ticker (quoteSummary via yahoo-finance2)
│   # - finviz: /api/finviz/:ticker (snapshot scraper via cheerio)
│   # - EDGAR proxy: /api/edgar/* (adds User-Agent header)
│   # - Yahoo Finance proxy: /api/yahoo/* (chart, v8 endpoints)
│   # - GuruFocus proxy: /api/gurufocus/* (if API key available)
│
├── index.html                   # Entry HTML: loads root div + main.jsx
├── package.json                 # npm dependencies, build scripts
├── eslint.config.js             # ESLint flat config (eslint 9, react-hooks, react-refresh plugins)
├── vitest.config.js             # Vitest config for unit tests
│
├── knowledge/                   # Research curriculum & reference (not code)
│   ├── workflow.md              # 3-stage research workflow (One Pager → Pitch Deck → Full Story)
│   ├── stage-1-one-pager/       # Stage 1 template, curriculum, examples
│   ├── stage-2-pitch-deck/      # Stage 2 template, 4 curriculum files, examples
│   ├── stage-3-full-story/      # Stage 3 template, 2 curriculum files, examples
│   ├── research-references/     # Rule One methodology, FGR, equity bond research
│   ├── morningstar-financial-statements/ # 50-company validation data
│   └── pre-course-examples/     # User's own analyses (EW, SFM, MU, ODFL)
│
├── industry-classification/     # Thes1s taxonomy & classification
│   ├── taxonomy-classification-learning.md  # Claude agent guide
│   ├── thes1s-taxonomy-tree.json           # 12 sectors, 52 industry groups, 176 industries
│   ├── thes1s-company-assignments.json     # 5,758 company classifications
│   ├── yahoo-to-thes1s-crosswalk.json      # Yahoo → Thes1s mapping
│   └── sic-to-thes1s-crosswalk.json        # SIC → Thes1s mapping
│
├── validation/                  # Data validation scripts & reports
│   ├── scripts/                 # Python/Node.js validation runners
│   ├── data/                    # Validation datasets, comparison files
│   └── reports/                 # Validation results, RCA documents
│
└── .planning/                   # GSD planning artifacts
    ├── codebase/                # This mapping (ARCHITECTURE.md, STRUCTURE.md)
    └── [other GSD docs]

[.env.local]                     # (gitignored) API keys: VITE_CLAUDE_KEY, VITE_FINNHUB_KEY, VITE_ALPHA_VANTAGE_KEY
```

## Directory Purposes

**src/**
- Purpose: All frontend source code — components, hooks, engines, utilities
- Contains: React UI layer, data logic layer, styling
- Key files: `App.jsx` (router), `theme.js` (styling), `Toolbox.jsx` (main research surface)

**src/components/**
- Purpose: React view layer — no data fetching, only render props
- Contains: 40+ components organized by feature (Toolbox tabs, audit views, modals)
- Key files: `Toolbox.jsx` (main container), tab components (FinancialStatements, Valuation, Competitors, etc.)

**src/engines/**
- Purpose: Pure data logic — API calls, normalization, computation
- Contains: 45+ engine files organized by domain (EDGAR, pricing, scoring, caching)
- Key files: `edgarFinancials.js` (three-layer XBRL, industry overlays), `cache.js` (three-tier caching)

**src/hooks/**
- Purpose: React state management — wrap engines with hooks pattern
- Contains: 15+ hooks, all following `{ data/fields, loading, error }` pattern
- Standard: fetch on mount, handle cancellation, manage error states

**src/data/**
- Purpose: Pre-built static lookup tables (zero API cost at runtime)
- Contains: XBRL tag classifications (S&P 500), taxonomy hierarchy (FASB descendants)
- Size: ~500KB total, loaded once at app start

**src-tauri/**
- Purpose: Native macOS shell for Tauri packaging
- Contains: Rust command handlers, app config, bundle settings
- Built via: `npm run tauri:build` → produces `.app` in `src-tauri/target/release/bundle/macos/`

**vite.config.js**
- Purpose: Development server config + custom middleware
- Contains: 5 middleware plugins for API proxying (EDGAR, Yahoo, Finviz, GuruFocus)
- Runtime: dev server runs on localhost:5173, production uses Tauri direct calls

**knowledge/**
- Purpose: Research curriculum, methodology reference, examples
- Contains: Stage templates, Rule One framework, FGR methodology, 50-company dataset
- Not code: research workflow documentation only

**industry-classification/**
- Purpose: Thes1s taxonomy and company industry mappings
- Contains: 12-sector tree, 5,758 company assignments, cross-walk tables
- Used by: Competitors tab for industry-aware peer discovery

**validation/**
- Purpose: Data validation scripts, test datasets, audit reports
- Contains: Python/Node.js runners, Morningstar comparison data, RCA documents
- CI/CD: Quarterly validation at 91.7%, annual baseline 91.0%+

## Key File Locations

**Entry Points:**
- `src/main.jsx` - Bootstrap React app, inject global CSS
- `src/App.jsx` - Route declarations, top-level state hooks
- `src/components/Toolbox.jsx` - Primary research surface, 8-tab container

**Core Financial Data:**
- `src/engines/edgarFinancials.js` - Three-layer XBRL extraction, normalized statements, provenance
- `src/engines/industryOverlays.js` - Bank/REIT/insurance additive taxonomy
- `src/engines/cache.js` - Three-tier cache coordination
- `src/data/sp500-tag-classifications.json` - Layer 3 pre-classified tags
- `src/data/taxonomy-hierarchy.json` - Layer 2 FASB descendants

**Scoring & Valuation:**
- `src/engines/growthRates.js` - CAGR, smoothed growth rates
- `src/engines/returnMetrics.js` - ROE, ROIC, ROA
- `src/engines/ruleOneScore.js` - Moat + Management scoring
- `src/engines/valuation.js` - Calculator orchestration
- `src/engines/fgr.js` - FGR derivation from 5 inputs

**Configuration & Utilities:**
- `src/theme.js` - Mutable palette C, dark/light themes
- `src/engines/config.js` - Environment variable access
- `vite.config.js` - Vite + middleware plugins
- `src-tauri/tauri.conf.json` - App metadata, window size, bundle config

**Testing:**
- `src/engines/__tests__/edgarFinancials.test.js` - 173 vitest tests: tag resolution, derived fields, provenance
- `src/engines/__tests__/splits.test.js` - Stock split detection tests
- `src/engines/__tests__/peerMetrics.test.js` - Peer metrics computation tests

## Naming Conventions

**Files:**
- React components: PascalCase `.jsx` — `CompanyHeader.jsx`, `FinancialStatements.jsx`
- Hooks: `use` prefix, camelCase `.js` — `useFinancials.js`, `useEdgar.js`
- Engines: camelCase `.js` — `growthRates.js`, `edgarFinancials.js`, `industryOverlays.js`
- Data files: kebab-case `.json` / `.js` — `sp500-tag-classifications.json`, `validationCompanies.js`
- Tests: mirror source with `.test.js` suffix — `edgarFinancials.test.js`

**Directories:**
- Feature-based grouping: `components/`, `hooks/`, `engines/`, `data/`
- By domain (within engines): `edgar*.js` (EDGAR), `grow*`, `return*`, `free*`, `rule*` (scoring), `cache*` (caching)
- Audit components co-located: `*Audit.jsx` (all audit views)

**Code Conventions:**
- Exported engine functions: camelCase, action verb prefix — `computeGrowthRates`, `fetchEdgarStatements`, `extractAnnualFact`
- React components: PascalCase — `function CompanyHeader(...)`, `export default function Toolbox(...)`
- Local helpers: camelCase, no export — `findClosest`, `computeOverlayFields`, `isValidFactEntry`
- Formatter functions: `fmt` prefix — `fmtNum`, `fmtDollar`, `fmtPct`, `fmtRange`
- All exports are camelCase — `companyFacts`, `edgarStatements`, `guruActivities`
- Boolean state: descriptive names — `loading`, `isDark`, `irLinkIsDirect`, `isNetCash`
- Constants: UPPER_SNAKE_CASE, module-level, never reassigned — `INCOME_TAXONOMY`, `PERIODS`, `IDB_PREFIXES`
- XBRL taxonomy entries: `{ field: 'snake_case', unit: 'USD', tags: [...], negate?: boolean }`
- Financial data fields: `snake_case` — `net_income_loss`, `cost_of_revenue`, `long_term_debt`, `free_cash_flow`
- Report data: `camelCase` keys in JSON — `currentStage`, `stageApprovals`, `onePager`
- Theme palette: single-letter export `C` — always imported as `import { C } from '../theme'`

## Where to Add New Code

**New Financial Data Field (XBRL):**
1. Add field definition to appropriate taxonomy in `src/engines/edgarFinancials.js` (INCOME/BALANCE/CASHFLOW)
2. Format: `{ field: 'snake_case_name', unit: 'USD' | 'USD/shares' | 'shares', tags: ['PrimaryXBRLTag', 'FallbackTag1', ...], negate?: boolean }`
3. Add derived formula in `getDerivedFormula()` if field is computed
4. Add corresponding provenance tracking test in `src/engines/__tests__/edgarFinancials.test.js`
5. If industry-specific, add to appropriate overlay in `src/engines/industryOverlays.js`

**New Scoring Metric or Valuation Calculator:**
1. Create engine file in `src/engines/` — e.g., `src/engines/myMetric.js`
2. Export single function: `export function computeMyMetric(statements) { ... }`
3. Create corresponding hook in `src/hooks/` if component needs it, or call directly in `Toolbox.jsx`
4. Add tests in `src/engines/__tests__/myMetric.test.js`
5. Integrate into Toolbox via `useMemo` computation

**New Component Tab or Feature:**
1. Create component file in `src/components/ComponentName.jsx`
2. Receive all data as props from `Toolbox.jsx` — no direct engine calls
3. Use inline styles via `C` palette: `import { C } from '../theme'`
4. Add tests in `src/components/__tests__/componentName.test.js`
5. Wire into `Toolbox.jsx` tab switcher

**New Audit System:**
1. Create engine in `src/engines/` — e.g., `src/engines/myAudit.js`
2. Create component in `src/components/MyAudit.jsx`
3. Add route in `src/App.jsx` — e.g., `<Route path="/my-audit" element={<MyAudit />} />`
4. Add navigation link in `Layout.jsx` if user-facing

**Utilities / Helpers:**
1. Pure functions → `src/engines/` (if data/calculation related)
2. Formatters (`fmtNum`, `fmtDollar`) → `src/engines/` and import where needed
3. React-specific utilities → inline in component or small file in `src/components/`

## Special Directories

**src/engines/__tests__/fixtures/**
- Purpose: Test data mirroring real EDGAR responses for validation
- Contains: 50-company Morningstar dataset (annual + quarterly), Rule One Toolbox examples
- Generated: No — manually curated for validation, committed to git
- Replaces: Live EDGAR API calls during test runs

**src/data/**
- Purpose: Pre-built static lookup tables
- Generated: `sp500-tag-classifications.json` via Claude Sonnet (Layer 3), `taxonomy-hierarchy.json` via FASB parser
- Committed: Yes — zero runtime API cost after build
- Updated: Quarterly as part of XBRL engine refresh

**knowledge/**
- Purpose: Research curriculum and methodology reference
- Generated: No — curated by Rule One experts
- Committed: Yes — user studies this alongside the app
- Used by: AI agents during report generation (Phase 5+)

**validation/**
- Purpose: Data validation scripts and audit results
- Generated: Yes — CI/CD runners produce quarterly validation reports
- Committed: Partially — scripts committed, reports gitignored (large)
- Baseline: Annual validation at 91.0%+ coverage (S&P 500 tier 1 scoring-critical fields)

---

*Structure analysis: 2026-03-25*
