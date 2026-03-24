# Architecture

**Analysis Date:** 2026-03-24

## Pattern Overview

**Overall:** Layered client-side single-page application wrapped in a Tauri desktop shell. No backend server — all computation runs in the browser WebView and API calls go direct to external services.

**Key Characteristics:**
- Hook-mediated data flow: engines are pure async functions; hooks bind them to React state; components render the state
- Three-layer XBRL tag resolution for financial data extraction from SEC EDGAR
- Three-tier caching (in-memory → IndexedDB → localStorage) for API responses
- All styling is inline via a mutable `C` palette object — no CSS files or CSS-in-JS library
- Report data (the research workflow) is persisted in localStorage; financial caches live in IndexedDB

---

## Layers

**Shell / Entry:**
- Purpose: Bootstrap React, provide router, inject global CSS reset
- Location: `src/main.jsx`
- Contains: `BrowserRouter` wrapper, root render, 8-line global style injection
- Depends on: `src/App.jsx`
- Used by: Tauri WebView (production) or Vite dev server

**Routing / App Shell:**
- Purpose: Top-level route declarations, cross-cutting state (theme, research list, settings)
- Location: `src/App.jsx`
- Contains: All route definitions for `/research`, `/watchlists`, `/gurus`, `/reports`, `/validation`, audit routes
- Depends on: `useTheme`, `useResearch`, `useSettings`, all top-level page components
- Used by: `src/main.jsx`

**Layout / Chrome:**
- Purpose: 52px top nav bar with logo, 4 nav tabs, ticker search, settings gear, and main content slot
- Location: `src/components/Layout.jsx`
- Contains: Inline-styled nav, `NavLink` tabs, `TickerSearch` component, max-width 1400px content wrapper
- Depends on: `src/theme.js` (C palette), `TickerSearch.jsx`
- Used by: `src/App.jsx` — wraps all routes

**Toolbox (per-ticker research container):**
- Purpose: Primary research surface — 8-tab container that orchestrates all data hooks and passes computed results to tab components
- Location: `src/components/Toolbox.jsx`
- Contains: Tab switcher (Overview / Financials / Growth / Valuation / Competitors / Insiders / Filings / Data Audit), all hook invocations, all `useMemo` scoring computations
- Depends on: `useFinancials`, `useEdgar`, `usePrices`, `useGurus`, `useInsiders`, `useCompensation`, `useCompanyEvents`, all scoring engines (`growthRates`, `returnMetrics`, `freeCashFlow`, `ruleOneScore`)
- Used by: `/research/:id` route in `App.jsx`

**UI Components:**
- Purpose: Render specific views/tabs — receive computed data as props, no direct engine calls
- Location: `src/components/*.jsx`
- Contains: `FinancialStatements`, `GrowthAnalysis`, `Valuation`, `Competitors`, `Insiders`, `Filings`, `Gurus`, `GuruPortfolio`, `TickerDataAudit`, `CompanyEvents`, etc.
- Depends on: `src/theme.js`, data props from Toolbox or their own hooks (Competitors uses `useCompetitors`)
- Used by: `Toolbox.jsx` or directly by App routes (Gurus, Watchlists, audit views)

**Hooks (data-binding layer):**
- Purpose: Bridge between async engine functions and React component state — handle loading, error, and cancellation patterns
- Location: `src/hooks/*.js`
- Contains: `useEdgar`, `useFinancials`, `usePrices`, `useGurus`, `useInsiders`, `useCompensation`, `useCompetitors`, `useCompanyEvents`, `useResearch`, `useSettings`, `useTheme`, `useWatchlists`, `useAnalystData`
- Depends on: `src/engines/*.js`
- Used by: `Toolbox.jsx` and individual components

**Engines (data + computation layer):**
- Purpose: All external API calls, data extraction, and computation — pure async functions with no React dependency
- Location: `src/engines/*.js`
- Contains: EDGAR fetchers (`edgar.js`, `edgarFinancials.js`, `edgarFrames.js`), scoring (`ruleOneScore.js`, `growthRates.js`, `returnMetrics.js`, `freeCashFlow.js`, `valuation.js`), other data sources (`gurus.js`, `insiders.js`, `prices.js`, `compensation.js`, `transcripts.js`, `analystEstimates.js`), and support engines (`cache.js`, `cacheStore.js`, `splits.js`, `peers.js`, `peerMetrics.js`, `batchQuotes.js`)
- Depends on: `src/engines/config.js` (env keys), `src/engines/cache.js`, external APIs
- Used by: `src/hooks/*.js`

**Static Data:**
- Purpose: Pre-built lookup tables loaded at import time — zero runtime API cost
- Location: `src/data/`
- Contains:
  - `taxonomy-hierarchy.json` — 1,937 FASB descendant tags (Layer 2 XBRL, 84KB)
  - `sp500-tag-classifications.json` — 1,989 AI-classified tags for S&P 500 (Layer 3 XBRL, 387KB)
  - `validationCompanies.js` — 503 S&P 500 tickers for validation runs
- Used by: `taxonomyResolver.js` (Layer 2), `companyAdapter.js` (Layer 3)

---

## The Three-Layer XBRL Engine

The core financial data engine (`src/engines/edgarFinancials.js`) resolves ~85 standardized financial fields from raw SEC EDGAR XBRL data using a three-layer fallback strategy. This is the most architecturally significant subsystem.

**Layer 1 — Static Tag Map (handles ~96% of cases):**
- Defined inline in `edgarFinancials.js` as `INCOME_TAXONOMY`, `BALANCE_TAXONOMY`, `CASHFLOW_TAXONOMY` arrays
- Each field entry: `{ field: 'revenues', unit: 'USD', tags: ['RevenueFromContract...', 'Revenues', 'SalesRevenueNet', ...] }`
- Tags ordered by prevalence — first tag's value wins per year
- O(1) lookup per tag per year

**Layer 2 — Taxonomy Hierarchy Fallback:**
- `src/engines/taxonomyResolver.js` augments any taxonomy array with FASB calculation linkbase descendants
- Pre-built data: `src/data/taxonomy-hierarchy.json` (1,937 descendant tags from 3 FASB taxonomy versions)
- Used only when Layer 1 misses a field for a company
- Currently dormant (commented out in `edgarFinancials.js`) — code retained for future re-enablement

**Layer 3 — AI Tag Classification:**
- `src/engines/companyAdapter.js` — two sub-layers:
  - 3a: Pre-built S&P 500 classifications (`src/data/sp500-tag-classifications.json`) — zero API cost
  - 3b: Runtime Claude API classification (for companies outside S&P 500, ~$0.01/company)
- Confidence gating: classifications below 0.8 confidence are marked "inferred" in provenance
- Currently dormant (commented out in `edgarFinancials.js`) — code retained

**Industry Overlays (additive to all layers):**
- `src/engines/industryClassifier.js` maps SIC codes → `'bank' | 'reit' | 'insurance' | 'standard'`
- `src/engines/industryOverlays.js` provides additive XBRL taxonomy for bank/REIT/insurance
- Applied after base extraction: bank gets NII/deposits/efficiency ratio; REIT gets FFO/NAV/NOI; insurance gets premiums/claims/combined ratio

**Derived Fields:**
- `computeDerivedFields()` in `edgarFinancials.js` computes ~40 fields not in XBRL (e.g., gross profit from revenue - COGS, total debt from components, working capital, EBITDA)
- Every derived value carries a human-readable formula via `getDerivedFormula()`

**Provenance System:**
- Every extracted value carries parallel metadata: XBRL tag that resolved it, layer (1/2/3), whether derived, confidence score (Layer 3), human-readable formula
- Annual AND TTM provenance tracked
- Components read bare numbers; provenance is opt-in via `edgarStatements.provenance`

---

## Three-Tier Cache Architecture

**`src/engines/cache.js`** routes cache operations across three storage tiers:

| Tier | What | TTL | Used For |
|------|------|-----|----------|
| In-memory (`Map`) | Hot data, avoids redundant reads | Session | All lookups |
| IndexedDB (`cacheStore.js`) | Large blobs (EDGAR facts, guru filings, statements) | 24hr–10yr | `edgar:facts:*`, `edgar-statements:*`, `guru-*`, `nport-*`, `transcript-*`, `filing-md:*`, `insider-*`, `comp-*` |
| localStorage | Small metadata (ticker map, events, analyst data) | 1hr–24hr | Everything else |

The `idbGet/idbSet` API in `src/engines/cacheStore.js` manages a single IndexedDB named `thes1s-cache` (version 5) with 8 object stores. Falls back gracefully in Node.js (validation scripts).

---

## Data Flow

**Standard per-ticker research flow:**

1. User enters ticker in `TickerSearch.jsx` → `Layout.jsx` calls `createReport(ticker)` → navigates to `/research/:id`
2. `Toolbox.jsx` mounts, reads report from `useResearch` (localStorage), extracts `ticker`
3. Hooks fire in parallel:
   - `useFinancials(ticker)` → `fetchCompanyDetails()` → EDGAR submissions API → company info
   - `useEdgar(ticker, version, view)` → `fetchEdgarFinancials()` + `fetchEdgarStatements()` → EDGAR companyfacts API → 3-layer XBRL extraction → normalized financial statements
   - `usePrices(ticker, range)` → Yahoo Finance prices + split detection
   - `useGurus()` → EDGAR 13F filings for 43 named gurus (IndexedDB cached)
   - `useInsiders()` → EDGAR Form 4 filings
4. `Toolbox.jsx` runs scoring via `useMemo`:
   - `computeAllGrowthRates(edgarStatements)` → BVPS, EPS, revenue, operatingCash, FCF CAGRs
   - `computeReturnMetrics(edgarStatements)` → ROE, ROIC, ROA averages
   - `computeFreeCashFlow(edgarStatements)` → FCF series
   - `computeMoatScore(growthRates)` + `computeManagementScore(returns, debt)` → Rule One scores
5. Computed data flows as props to tab components (no prop drilling beyond one level — Toolbox → tab component)

**Competitors data flow (progressive 3-phase):**

1. Phase 1: `classifyCompany()` (in-memory Thes1s taxonomy JSON) → peer list from `industry-classification/thes1s-company-assignments.json`
2. Phase 2: `fetchPeerFrameData()` via EDGAR Frames API → `fetchBatchQuotes()` via Yahoo → `mergeYahooData()` → `computePeerMetrics()`
3. Phase 3: On-demand `computePeerScores()` (multi-year EDGAR Frames fetch)

**State Management:**
- React `useState` / `useMemo` / `useCallback` — no global state library
- Reports/settings: localStorage (`stock-analyzer-reports`, `sa-settings`)
- Financial caches: IndexedDB via `cacheStore.js`
- Last-viewed research: localStorage (`sa-last-research`)
- Competitors tier preference: localStorage (`sa-competitors-tier`)

---

## Key Abstractions

**Report:**
- Purpose: A research workflow record — ticker + stage approvals + stage content (onePager/pitchDeck/fullStory)
- Managed by: `useResearch.js`
- Structure: `{ id, ticker, companyName, currentStage, stageApprovals, onePager, pitchDeck, fullStory, watchlist, competitors }`

**edgarStatements:**
- Purpose: Normalized financial statements — the single source of truth for all scoring and display
- Produced by: `fetchEdgarStatements()` in `edgarFinancials.js`
- Structure: `{ years, income: {year: {field: value}}, balance: {year: {field: value}}, cashFlow: {year: {field: value}}, provenance: {year: {field: {tag, layer, formula}}} }`

**C palette:**
- Purpose: Mutable theme object — all components read from this; dark/light themes applied via `Object.assign(C, source)`
- Location: `src/theme.js`
- Pattern: `import { C } from '../theme'` → `style={{ color: C.text, background: C.bgCard }}`

**Cache key routing:**
- Purpose: Determines whether a cache key goes to IndexedDB or localStorage by prefix inspection
- Location: `src/engines/cache.js` — `IDB_PREFIXES` array + `isIDBKey()` + `getStoreName()`

---

## Entry Points

**Browser/Dev:**
- Location: `src/main.jsx`
- Triggers: Vite dev server serves `index.html` → loads `main.jsx`
- Responsibilities: Mount React root, inject global styles, provide BrowserRouter

**Tauri (production):**
- Location: `src-tauri/src/` (Rust shell), `src-tauri/tauri.conf.json`
- Triggers: macOS `.app` launch
- Responsibilities: Create native window (1400×900), load `dist/` as frontend, no CORS enforcement on network requests

**Vite dev proxy:**
- Location: `vite.config.js` — custom middleware plugins
- Triggers: Any `/api/*` request in dev mode
- Responsibilities: Proxy EDGAR/SEC requests (adds User-Agent header), serve Yahoo Finance via `yahoo-finance2` package, serve Finviz/GuruFocus/IR events via server-side fetch

---

## Error Handling

**Strategy:** Per-hook try/catch with `loading`/`error` state. Hooks surface errors as string messages; components render error states inline. No global error boundary.

**Patterns:**
- All hooks follow: `setLoading(true)` → `try { ... } catch (err) { setError(err.message) } finally { setLoading(false) }`
- Cancellation: `let cancelled = false` + cleanup `return () => { cancelled = true }` in `useEffect`
- Cache misses are silent — engines fall back to network without surfacing errors
- EDGAR 404s (missing filings) return `null` gracefully; components show "no data" states

---

## Cross-Cutting Concerns

**Logging:** `console.warn` for non-fatal issues (cache failures, API 403s). No structured logging.

**Validation:** `src/engines/validation.js` (572 lines) — rule-based validation of extracted EDGAR data against known good values. Used in dev/QA, not in production flow.

**Split adjustment:** `src/engines/splits.js` — stock split detection and cumulative split factor calculation. Applied to per-share fields during XBRL extraction to ensure historical comparability.

**CORS handling:** Dev mode routes all external API calls through Vite middleware plugins in `vite.config.js`. Production (Tauri) bypasses CORS entirely via native WebView.

---

*Architecture analysis: 2026-03-24*
