# External Integrations

**Analysis Date:** 2026-03-25

## APIs & External Services

**SEC EDGAR — Financial Data (Primary):**
- Service: SEC EDGAR (data.sec.gov + www.sec.gov)
- What it's used for: Complete financial statements (10-K, 10-Q), company facts (XBRL tags), CIK lookup, ticker mapping, filing metadata, 13F holdings, N-PORT fund holdings, insider Form 4, executive compensation (DEF 14A)
- SDK/Client: Custom fetch via `/api/edgar` proxy (Vite dev) or direct to `https://data.sec.gov` (Tauri production)
- Rate limits: None enforced; SEC requests User-Agent header with contact info
- Integration points:
  - `src/engines/edgar.js` — Core EDGAR API functions (lookupCIK, fetchCompanyFacts, fetchFilings, fetchCompanyInfo, ticker search index)
  - `src/engines/edgarFinancials.js` — XBRL extraction from company facts (10-K filings, three-layer tag resolution)
  - `src/engines/edgarFrames.js` — EDGAR Frames API cross-check (validates extracted values against aggregated data.sec.gov)
  - `src/engines/gurus.js` — 13F filing fetches and parsing (CIK-based 10 lookup, accession number extraction)
  - `src/engines/nport.js` — N-PORT fund holdings extraction (fund CIK + series ID matching)
  - `src/engines/insiders.js` — Form 4 insider trading XML parsing and transaction extraction
  - `src/engines/compensation.js` — DEF 14A proxy statement parsing, executive compensation table extraction
  - `src/engines/peers.js` — Browse-edgar SIC code lookups, ticker discovery via Frames API fallback
- Auth: None (public API); User-Agent required
- Caching: IndexedDB (edgar-facts, edgar-statements, guru-data, nport-data, insider-data, comp-data stores); 10-year TTL for 10-K data, 1-year for other documents

**Yahoo Finance — Market Data & Analyst Estimates:**
- Service: Yahoo Finance (query1.finance.yahoo.com)
- What it's used for: Historical daily OHLCV prices, batch quotes (market cap, P/E, dividend yield, shares outstanding, book value), analyst estimates (earnings growth, EPS consensus, price targets, recommendations), earnings calendar events, upgrade/downgrade history
- SDK/Client: `yahoo-finance2 ^3.13.2` (ESM, handles crumb/cookie auth internally)
- Rate limits: None enforced; requests per day practical limit ~1000 (batch quotes in 50-ticker chunks)
- Integration points:
  - Vite middleware `yahooSummaryPlugin()` in `vite.config.js` — `/api/yahoo-summary/:ticker?modules=` for quoteSummary (analyst estimates)
  - Vite middleware `yahooQuotesPlugin()` in `vite.config.js` — `/api/yahoo-quotes/AAPL,MSFT,GOOGL` for batch quotes
  - `/api/yahoo` proxy → Yahoo's v8 chart endpoint for historical prices
  - `src/engines/prices.js` — Daily historical price fetches (1y, 3y, 5y, 10y, 20y, max ranges)
  - `src/engines/batchQuotes.js` — Multi-ticker quote fetch with caching and per-ticker rate limiting
  - `src/engines/analystEstimates.js` — Parse Yahoo summary modules (earningsTrend, financialData, recommendationTrend)
  - `src/engines/companyEvents.js` — Calendar events extraction from assetProfile module
- Auth: None (public API, crumb handled internally by yahoo-finance2)
- Caching: IndexedDB (priceStore.js) for full history; localStorage for analyst data; 1-hour TTL for estimates

**Finviz — Analyst Consensus & Valuation:**
- Service: Finviz (finviz.com/quote.ashx)
- What it's used for: 5-year EPS growth consensus, forward P/E, PEG ratio, analyst target price, recommendation, short float, insider/institutional ownership, institutional transactions
- SDK/Client: None; HTML scraping via cheerio in `vite.config.js` middleware
- Rate limits: Practical ~5 requests/minute (will be blocked if exceeded)
- Integration points:
  - Vite middleware `finvizPlugin()` — `/api/finviz/:ticker` (fetches quote page server-side, parses HTML snapshot table with cheerio)
  - `src/engines/finviz.js` — Normalize parsed data (percentage parsing, dollar parsing, numeric conversions)
- Auth: None (public page)
- Caching: localStorage; 24-hour TTL

**GuruFocus — Valuation Metrics & Guru Analytics:**
- Service: GuruFocus (api.gurufocus.com, optional API; fallback scraping from www.gurufocus.com)
- What it's used for: GF Value, Graham Number, Peter Lynch Valuation, DCF valuations, financial strength, profitability rank, predictability rank
- SDK/Client: None (REST API or HTML scraping fallback)
- Rate limits: Unknown (optional premium API; free scraping no formal limits)
- Integration points:
  - Vite middleware `gurufocusPlugin()` — `/api/gurufocus/:ticker` (API mode if `VITE_GURUFOCUS_KEY` set; HTML scrape fallback)
  - `src/engines/gurufocus.js` — Parse API response or extract via regex from HTML
- Auth: API key in `VITE_GURUFOCUS_KEY` (optional; $25/mo premium feature)
- Caching: localStorage; 48-hour TTL

**Finnhub — Earnings Call Transcripts (Premium):**
- Service: Finnhub (finnhub.io/api/v1)
- What it's used for: Earnings call transcript list (quarterly), full transcript text for 10-K/10-Q filings
- SDK/Client: Custom fetch to `https://finnhub.io/api/v1/stock/transcripts/list` and `/v1/stock/transcripts`
- Rate limits: Premium tier required for transcripts; free tier returns 403 on transcript endpoints
- Integration points:
  - `src/engines/transcripts.js` — `fetchTranscriptList()`, `fetchTranscriptText()`, match transcripts to filings by date proximity
  - `src/engines/filingMarkdown.js` — Fetches transcript text if matched to a filing
  - Filings tab UI — Transcript buttons appear on 10-K/10-Q rows when matched
- Auth: API key in `VITE_FINNHUB_KEY` (optional; premium tier ~$100/mo)
- Caching: IndexedDB (transcript-data store); 10-year TTL (transcripts are immutable)

**Alpha Vantage — Earnings Transcripts Fallback (Free):**
- Service: Alpha Vantage (alphavantage.co)
- What it's used for: Earnings call transcripts as free alternative to Finnhub (25 calls/day limit)
- SDK/Client: Custom fetch to `https://www.alphavantage.co/query?function=EARNINGS_CALENDAR`
- Rate limits: 5 requests/minute, 100 requests/day (free tier)
- Integration points:
  - `src/engines/transcripts.js` — `fetchTranscriptViaAlphaVantage()` fallback when Finnhub unavailable
- Auth: API key in `VITE_ALPHA_VANTAGE_KEY` (optional; free tier 25 calls/day)
- Caching: IndexedDB; 10-year TTL

**Claude API — AI-Powered Tag Classification & Report Generation:**
- Service: Claude (api.anthropic.com)
- What it's used for:
  - Layer 3 XBRL tag classification (companies outside S&P 500) — maps unresolved tags to financial fields
  - AI report generation (planned Phase 5-7) — One Pager, Pitch Deck, Full Story generation
  - AI criticism engine (planned) — factual validation and claim checking
- SDK/Client: `@anthropic-ai/sdk ^0.78.0` for API calls; direct from browser via `anthropic-dangerous-direct-browser-access` header
- Rate limits: Depends on plan; typically 50k+ requests/month on paid tier
- Integration points:
  - `src/engines/companyAdapter.js` — Layer 3 tag classification (runtime API calls for non-S&P 500 companies)
  - `src/engines/critic.js` — Planned validation engine using Claude for fact-checking
  - `src/engines/aiResearch.js` — Planned AI report generation (all three stages)
- Auth: API key in `VITE_CLAUDE_KEY` (required for report generation; optional for core functionality if Layer 3 skipped)
- Caching: Not cached (API calls are expensive, but necessary for non-S&P 500 companies); cost budget ~$0.01/company for Layer 3

## Data Storage

**Databases:**
- **Type:** Browser-native IndexedDB (thes1s-cache, v5)
  - Connection: `src/engines/cacheStore.js` via `idb ^8.0.3` wrapper
  - Stores:
    - `edgar-facts` — Raw company facts from SEC XBRL (10-15MB per company)
    - `edgar-statements` — Extracted financial statements (1-2MB per company)
    - `guru-data` — 13F holdings and related metadata (100KB per filing)
    - `nport-data` — N-PORT fund portfolio data (50KB per filing)
    - `filing-markdown` — Converted SEC filings (HTML→Markdown) (5-10MB per filing)
    - `insider-data` — Form 4 transaction lists (100KB per company)
    - `comp-data` — Executive compensation tables (50KB per company)
    - `transcript-data` — Earnings call transcripts (500KB per transcript)
  - TTL: 10 years for financials, 1 year for events/estimates, 10 years for immutable data (transcripts)
  - Fallback in Node.js: IndexedDB detection (`HAS_IDB` flag), graceful null return in validation scripts

**File Storage:**
- **Local filesystem (Tauri):** `.thes1s/reports/` directory
  - Stores: One Pager JSON, Pitch Deck JSON, Full Story JSON, progress.json per ticker
  - Served via Vite middleware `thes1sReportsPlugin()` at `/api/thes1s/reports/:ticker/:fileType`
  - Not in app bundle; created at runtime in user's home directory

**Caching:**
- **In-memory:** `Map` objects in hooks/engines for hot data (prevents redundant API calls within session)
- **localStorage:** Small metadata (<1MB typical)
  - `stock-analyzer-reports` — Research workflow records (reportData array)
  - `sa-settings` — User theme, default price range, MARR values
  - `sa-last-research` — Last viewed research ticker (resumption)
  - `sa-competitors-tier` — User's peer data tier preference
  - Analyst data, event lists, price cache metadata
- **IndexedDB:** Large blobs (50MB+ typical total for 10+ companies)
- **Three-tier strategy:**
  1. In-memory → check
  2. IndexedDB → check (if key matches `IDB_PREFIXES` in `src/engines/cache.js`)
  3. localStorage → check (fallback)
  4. Network fetch (API call)

## Authentication & Identity

**Auth Provider:**
- None — No server, no user authentication
- Each user runs app locally; all data stored locally or in browser storage

**API Key Management:**
- Keys stored in `.env.local` (dev-only, gitignored)
- `.env.local` format:
  ```
  VITE_CLAUDE_KEY=sk-...
  VITE_FINNHUB_KEY=xxxxxxxx
  VITE_ALPHA_VANTAGE_KEY=xxxxxxxx
  VITE_GURUFOCUS_KEY=xxxxxxxx
  ```
- Keys injected into `import.meta.env` by Vite at build time
- Tauri production: Keys embedded in app binary (no `.env` loading) — must be rebuilt with new keys

## Monitoring & Observability

**Error Tracking:**
- None (no remote error reporting)
- Errors logged to console via `console.warn()` (non-fatal) or `console.error()` (critical, rare)
- Error state captured in React component state (`{ data, loading, error }` pattern)
- No Sentry, Datadog, or similar

**Logs:**
- Browser console only (`console.warn`, `console.log` sparingly)
- Tauri shell logs via `tauri-plugin-log` (optional, not yet integrated into UI)
- No persistent log file by default

## CI/CD & Deployment

**Hosting:**
- Local desktop (macOS `.app` bundle via Tauri)
- No cloud hosting (single-user app)
- No deployment pipeline (manual build)

**CI Pipeline:**
- None configured
- Manual testing via `npm test` (vitest) and `npm run tauri:dev`

## Environment Configuration

**Required env vars:**
- None (app works with zero keys for core functionality)
- Optional premium features:
  - `VITE_CLAUDE_KEY` — Claude API (for Layer 3 XBRL + AI report generation)
  - `VITE_FINNHUB_KEY` — Finnhub transcripts (premium, ~$100/mo)
  - `VITE_ALPHA_VANTAGE_KEY` — Free transcript fallback (25 calls/day)
  - `VITE_GURUFOCUS_KEY` — GuruFocus API (optional, $25/mo; scraping fallback available)

**Secrets location:**
- `.env.local` file (development)
- Embedded in Tauri binary (production)
- Never committed to git (in `.gitignore`)

## Webhooks & Callbacks

**Incoming:**
- None

**Outgoing:**
- None (all external calls are synchronous request-response)

## Data Flow Summary

```
┌──────────────────────────────────────────────────────────────┐
│ Browser (React + Hooks + Engines)                             │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  Request Flow:                                               │
│  Component → Hook → Engine → Cache (IDB/localStorage/mem)   │
│                   ↓ (if miss)                                │
│                   API Call (dev proxy or direct)            │
│                                                               │
└──────────────────────────────────────────────────────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
    SEC EDGAR         Yahoo Finance      Finviz
    (company facts,    (prices, quotes,   (consensus,
     10-K/10-Q,       analyst est.)       multiples)
     insider, gurus)      │                 │
         │                 │                 │
         ├─────────────────┼──────────────────┤
         │                 │                 │
    GuruFocus         Finnhub/Alpha    Claude API
    (valuations)     Vantage (transcripts) (Layer 3)
         │
    IndexedDB Storage (cached EDGAR facts, statements, transcripts, guru data)
         ↓
    localStorage (reports, settings, metadata)
         │
    Tauri File System (.thes1s/reports/*.json)
```

---

*Integration audit: 2026-03-25*
