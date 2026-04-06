# Architecture

**Analysis Date:** 2026-03-25

## Pattern Overview

**Overall:** Three-tier engine layer + hook-mediated React binding + component view layer with three-layer XBRL tag resolution for financial data extraction.

**Key Characteristics:**
- Pure async engine functions (no React dependency) → hooks bind to state → components render state
- All financial data sourced from SEC EDGAR XBRL (single source of truth)
- Three-layer XBRL tag resolution: static taxonomy (Layer 1) → taxonomy hierarchy fallback (Layer 2) → AI classification (Layer 3)
- Industry-aware overlays (bank/REIT/insurance) augment base XBRL taxonomy
- Three-tier caching: in-memory → IndexedDB → localStorage with TTL-based expiration
- Data provenance tracking: every extracted value traces back to its XBRL source tag and resolution layer
- All styling via mutable theme palette object `C` (inline styles, no CSS files)

## Layers

**Bootstrap & Router:**
- Purpose: Bootstrap React, provide routing, inject global styles
- Location: `src/main.jsx`, `src/App.jsx`
- Contains: BrowserRouter wrapper, route declarations, localStorage-backed research state
- Depends on: `src/hooks/useResearch`, `src/hooks/useTheme`, `src/hooks/useSettings`
- Used by: Tauri WebView (production) or Vite dev server

**Layout & Navigation:**
- Purpose: 52px top nav bar with logo, 4 nav tabs (Watchlists/Research/Gurus/Reports), ticker search, settings
- Location: `src/components/Layout.jsx`, `src/components/TickerSearch.jsx`
- Contains: NavLink tabs, search autocomplete, max-width 1400px content wrapper
- Depends on: `src/theme.js` palette `C`, `useTheme` hook
- Used by: All page routes in `App.jsx`

**Primary Research Surface - Toolbox:**
- Purpose: 8-tab container orchestrating all financial data, scoring computations, and metric calculations
- Location: `src/components/Toolbox.jsx`
- Contains: Tab switcher (Overview/Financials/Growth/Valuation/Competitors/Insiders/Filings/Data Audit), all hook invocations, `useMemo` scoring computations
- Depends on: `useFinancials`, `useEdgar`, `usePrices`, `useGurus`, `useInsiders`, `useCompensation`, `useCompanyEvents`, `useCompetitors`, scoring engines
- Used by: `/research/:id` route in `App.jsx`

**Tab Components:**
- Purpose: Render specific analysis views — receive computed data as props, no direct engine calls
- Location: `src/components/FinancialStatements.jsx`, `GrowthAnalysis.jsx`, `Valuation.jsx`, `Competitors.jsx`, `Insiders.jsx`, `Filings.jsx`, `Gurus.jsx`, `TickerDataAudit.jsx`, `CompanyEvents.jsx`
- Contains: Data display, charts (Recharts), tables, collapsible sections, audit dashboards
- Depends on: `src/theme.js`, data props from Toolbox or their own hooks
- Used by: `Toolbox.jsx` or directly by App routes

**Hooks - Data State Bridge:**
- Purpose: Bridge between async engine functions and React component state — handle loading, error, cancellation patterns
- Location: `src/hooks/*.js`
- Contains: `useEdgar`, `useFinancials`, `usePrices`, `useGurus`, `useInsiders`, `useCompensation`, `useCompetitors`, `useCompanyEvents`, `useResearch`, `useSettings`, `useTheme`, `useWatchlists`, `useAnalystData`, `useOnePager`
- Standard pattern: `{ data, loading, error }` object returned; cancellation via `cancelled` flag in cleanup
- Depends on: `src/engines/*.js` async functions
- Used by: `Toolbox.jsx`, page components, other hooks

**Engines - Pure Data Logic:**
- Purpose: All external API calls, data extraction, normalization, and computation — pure async functions with no React dependency
- Location: `src/engines/*.js`
- Contains: EDGAR fetchers, XBRL tag resolution, financial normalization, scoring, caching layer
- Depends on: `src/engines/cache.js`, `src/engines/cacheStore.js`, external APIs
- Used by: `src/hooks/*.js`

**Theme & Styling:**
- Purpose: Mutable palette object for dark/light theme switching — all components read inline styles from this
- Location: `src/theme.js`
- Pattern: `import { C } from '../theme'` → `style={{ color: C.text, background: C.bgCard }}`
- Contains: `C_LIGHT` and `C_DARK` palettes (stickeR1 slate + Rule One Toolbox teal accent)

## Data Flow

**Component → Hook → Engine → Cache → External API:**

1. **Component** (e.g., `Toolbox.jsx`) calls a hook: `const { edgarStatements, loading, error } = useEdgar(ticker, version, view)`
2. **Hook** (e.g., `useEdgar.js`) sets up `useEffect`, calls engine function, manages state lifecycle
3. **Engine** (e.g., `fetchEdgarStatements()` in `edgarFinancials.js`) orchestrates extraction:
   - Checks cache via `cacheGetAsync()` (memory tier)
   - If miss, fetches EDGAR companyfacts JSON
   - **Applies three-layer XBRL tag resolution** to extract financial fields
   - **Computes derived fields** (gross profit, free cash flow, EBITDA, etc.)
   - **Applies industry overlays** (bank/REIT/insurance) for specialized fields
   - Stores result in cache with TTL
4. **Cache layer** (3-tier):
   - **Memory tier** (in-memory `Map`): fastest, session-long
   - **IndexedDB tier** (via `cacheStore.js`): large blobs (facts, statements), 24hr–10yr TTL
   - **localStorage tier**: small metadata, 1hr–24hr TTL
   - **Routing**: keys with certain prefixes automatically routed to IDB vs localStorage
5. **External APIs**:
   - SEC EDGAR (facts, submissions, Frames)
   - Yahoo Finance (prices, events, analyst data)
   - Finviz (analyst estimates, snapshot)
   - GuruFocus (optional)
   - Finnhub/Alpha Vantage (transcripts)

**Financial Data Extraction (Three-Layer XBRL):**

```
Raw EDGAR companyfacts JSON (us-gaap namespace)
  ↓
Layer 1: Static XBRL Tag Map (in edgarFinancials.js)
  - ~200 hand-curated tags ordered by prevalence
  - O(1) lookup — first tag's value wins
  - Handles ~96% of companies without additional processing
  ↓ (if Layer 1 misses)
Layer 2: Taxonomy Hierarchy Fallback (taxonomyResolver.js)
  - Pre-built JSON (1,937 descendant tags from FASB calc linkbase)
  - Augments Layer 1 tags with descendant tags as additional fallbacks
  - O(1) lookup, <100KB data file
  ↓ (if Layer 1+2 miss)
Layer 3: AI Tag Classification (companyAdapter.js)
  - Pre-built S&P 500 tag classifications (JSON, zero API cost)
  - Runtime Claude API classification for non-S&P 500 companies
  - Confidence gating: <0.8 confidence tagged "inferred" in provenance
  ↓
Normalized Financial Statements: { years, income, balance, cashFlow, provenance }
  - Every value carries parallel metadata: XBRL tag, layer (1/2/3), derived status, formula
  - TTM (trailing twelve months) provenance tracked separately from annual
```

**Derived Field Computation:**

After base extraction, `computeDerivedFields()` computes ~40 fields not directly in XBRL:
- **Gross Profit**: Revenue - COGS (when not tagged)
- **Operating Income**: EBIT (when Operating Income tag is missing)
- **Free Cash Flow**: Operating CF - CapEx
- **Total Debt**: Sum of short-term + long-term debt with sanity check fallback
- **EBITDA**: Operating Income + D&A
- **Working Capital**: Current Assets - Current Liabilities
- **Return metrics**: ROE, ROIC, ROA (computed per year, then averaged)
- All derive fields include human-readable formula via `getDerivedFormula()`

**Industry Overlays (Applied Post-Extraction):**

After base XBRL extraction, industry-specific overlays add specialized fields:
- **Bank overlay** (`industryOverlays.js`, applied to SIC 6020–6036):
  - Net Interest Income, Noninterest Income, Provision for Credit Losses
  - Deposits, Loans, Investment Securities, Fed Funds, Cash Due from Banks
  - Derived: Efficiency Ratio (Noninterest Expense / NII + Noninterest Income)
- **REIT overlay** (SIC 6512, 6798):
  - FFO (Funds from Operations): Net Income + D&A - Gains on Real Estate Sales
  - NOI (Net Operating Income): Operating Income + depreciation
  - NAV (Net Asset Value): Equity / Shares Outstanding
- **Insurance overlay** (SIC 6311–6399):
  - Premiums Earned, Loss Ratio, Combined Ratio, Loss and Loss Adjustment Expense
  - Float (approximated from balance sheet items)

**Stock Split Normalization:**

`splits.js` detects and applies split adjustments:
1. **Primary source**: Yahoo Finance chart endpoint (events.splits)
2. **Fallback**: EDGAR explicit split ratio tag (`StockholdersEquityNoteStockSplitConversionRatio1`)
3. **Fallback**: EDGAR share count jump detection (>1.8x forward or <0.55x reverse)
4. Returns cumulative split factor for a given fiscal year → applied to per-share metrics and share counts

## Key Abstractions

**EDGAR Statements (Normalized Financial Data):**
- Purpose: Single source of truth for all financial data — the normalized, provenance-tracked result of three-layer XBRL extraction
- Produced by: `fetchEdgarStatements()` in `edgarFinancials.js`
- Structure: `{ years: [2020, 2021, ...], income: {year: {field: value}}, balance: {year: {field: value}}, cashFlow: {year: {field: value}}, provenance: {year: {field: {tag, layer, formula, confidence}}} }`
- Used by: All scoring engines (growthRates, returnMetrics, freeCashFlow, ruleOneScore), valuation calculators, key metrics, UI display tabs
- Fields: ~100 standardized line items (revenues, net_income_loss, total_debt, equity, free_cash_flow, etc.)

**Research Report (Workflow State):**
- Purpose: Persistent research workflow record — ticker + stage approvals + stage content
- Managed by: `useResearch.js` hook
- Stored in: localStorage (`stock-analyzer-reports` key)
- Structure: `{ id, ticker, companyName, currentStage, stageApprovals: {onePager, pitchDeck, fullStory}, onePager: {...}, pitchDeck: {...}, fullStory: {...}, notes, watchlist, competitors: {privateCompetitors: [...]} }`

**Theme Palette (C object):**
- Purpose: Mutable theme object — all components read from this; dark/light themes applied via `Object.assign(C, source)`
- Location: `src/theme.js`
- Pattern: `import { C } from '../theme'` → used in inline styles
- Exported: `C`, `C_LIGHT`, `C_DARK`, `applyTheme(isDark)`

**Cache Key Routing:**
- Purpose: Determines whether a cache key goes to IndexedDB or localStorage by prefix inspection
- Location: `src/engines/cache.js` — `IDB_PREFIXES` array + `isIDBKey()` + `getStoreName()`
- IDB keys: `edgar:facts:*`, `edgar-statements:*`, `guru-*`, `nport-*`, `filing-md:*`, `transcript:*`, `insider-*`, `comp-*`
- localStorage keys: everything else (ticker map, events, analyst data, settings)

## Entry Points

**Browser Entry (Development & Tauri Production):**
- Location: `src/main.jsx`
- Triggers: Vite dev server serves `index.html` → loads `main.jsx`, or Tauri WebView loads `dist/index.html`
- Responsibilities: Mount React root, inject global CSS reset, provide `BrowserRouter` wrapper

**Application Entry:**
- Location: `src/App.jsx`
- Triggers: React root mounts `<App />`
- Responsibilities: Declare all routes (`/research`, `/research/:id`, `/watchlists`, `/gurus`, `/reports`, `/validation`, audit routes), provide top-level state (`useResearch`, `useTheme`, `useSettings`)

**Tauri Native Shell:**
- Location: `src-tauri/src/` (Rust), `src-tauri/tauri.conf.json`
- Triggers: macOS `.app` launch
- Responsibilities: Create native 1400×900 window, load `dist/` as frontend, disable CORS enforcement (allows arbitrary headers on network requests)

**Dev Middleware & API Proxying:**
- Location: `vite.config.js` — 5 custom middleware plugins
- Triggers: Any `/api/*` request in dev mode
- Responsibilities:
  - EDGAR proxy (adds User-Agent header for SEC rate-limiting)
  - Yahoo Finance quoteSummary (via `yahoo-finance2` package)
  - Finviz quote scraper (server-side fetch + cheerio parsing)
  - GuruFocus data fetch (if API key available)
  - IR events discovery middleware

## Error Handling

**Standard Pattern:**
- All hooks follow: `setLoading(true)` → `try { ... } catch (err) { setError(err.message) } finally { setLoading(false) }`
- Cancellation: `let cancelled = false` + cleanup `return () => { cancelled = true }` in `useEffect`

**Graceful Degradation:**
- Cache misses are silent — engines fall back to network without surfacing errors to UI
- EDGAR 404s (missing filings) return `null` gracefully; components show "no data" states
- Third-party API failures (Finnhub free tier 403s, Finviz scrape timeouts) logged via `console.warn`, not thrown
- IndexedDB quota exceeded: automatic eviction + retry; if still full, silent degrade to memory-only cache

**Data Validation:**
- Guard clauses at function entry: `if (!fgr || !eps || !futurePE) return null`
- Null coalescing used throughout: `company?.website`, `settings?.defaultPriceRange || '5y'`
- Display fallback: `score != null ? score : '--'` for missing metric values
- Formatter guard: `if (n == null || isNaN(n)) return '--'`

## Cross-Cutting Concerns

**Logging:**
- `console.warn(...)` for non-fatal errors, degraded functionality, API failures
- `console.log(...)` sparingly for diagnostic milestones (e.g., "EDGAR statements AAPL [restated]: 12 years loaded")
- Never use `console.error(...)` — errors are captured in state and displayed in UI or silently degraded
- Third-party 403s (Finnhub free tier) are suppressed to avoid console noise

**Validation & Audit:**
- Data provenance tracking: every extracted value carries parallel metadata (tag, layer, confidence, formula)
- Five audit systems:
  1. **Ticker Audit** (`tickerAudit.js`): Validates ticker lookup consistency across data sources
  2. **Guru Audit** (`GuruAudit.jsx`): Validates 13F holdings parsing and deduplication
  3. **N-PORT Audit** (`NportAudit.jsx`): Validates N-PORT filing extraction
  4. **Compensation Audit** (`CompAudit.jsx`): Validates executive compensation extraction
  5. **Financial Audit** (`TickerDataAudit.jsx`): Validates EDGAR extraction, provenance, and coverage
- Coverage Monitor: Baseline storage + change detection (fields gained/lost/tags changed) per ticker in localStorage

**EDGAR Frames API (Cross-Check):**
- Purpose: Validates extracted values against SEC's aggregated Frames endpoint
- Period distinction: balance sheet (instant) tags use `CY{year}Q4I.json`; income statement (duration) tags use `CY{year}.json`
- Returned metadata: `{ tag, year, ours, frames, diff, pctDiff, status: 'match'|'missing_ours'|'error' }`
- Status: Error if >5% difference, yellow if >1%, green if <1%

---

*Architecture analysis: 2026-03-25*
