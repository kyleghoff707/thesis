# External Integrations

**Analysis Date:** 2026-03-24

## APIs & External Services

**AI / LLM:**
- Anthropic Claude API - XBRL tag classification (Layer 3 runtime) + planned AI report generation (Phases 5-7)
  - SDK/Client: `@anthropic-ai/sdk ^0.78.0`
  - Auth: `VITE_CLAUDE_KEY` env var
  - Header: `anthropic-dangerous-direct-browser-access` (direct browser calls, no server proxy)
  - Engine: `src/engines/companyAdapter.js` (Layer 3 classification), planned `src/engines/aiResearch.js`
  - Model: `claude-sonnet-4-20250514` (planned for report generation)
  - Cost concern: ~$0.01/company for non-S&P 500 Layer 3 classification; report generation costs TBD

**Financial Data — SEC EDGAR (free, no API key):**
- Company Facts XBRL API (`data.sec.gov/api/xbrl/companyfacts/`) - Primary financial statement source
  - Engine: `src/engines/edgar.js`, `src/engines/edgarFinancials.js`
  - Dev proxy: `/api/edgar` → `https://data.sec.gov` (Vite proxy, sets User-Agent header)
  - Production: direct calls (Tauri webview bypasses CORS)
  - Rate limit: 10 req/sec; `User-Agent: StockAnalyzer/1.0 kylehoff@example.com` required
- EDGAR Submissions API (`data.sec.gov/submissions/`) - Filing history, company metadata
  - Engine: `src/engines/edgar.js`, `src/engines/gurus.js`, `src/engines/insiders.js`
  - Dev proxy: `/api/edgar`
- EDGAR Frames API (`data.sec.gov/api/xbrl/frames/`) - Cross-company metrics for peer comparison
  - Engine: `src/engines/edgarFrames.js`
  - Dev proxy: `/api/edgar`
  - Period convention: `CY{year}.json` (duration tags) vs `CY{year}Q4I.json` (instant/balance sheet tags)
- SEC Archives (`www.sec.gov/Archives/`) - Full filing documents (10-K, 10-Q, 13F, Form 4, DEF 14A, N-PORT)
  - Engines: `src/engines/gurus.js`, `src/engines/insiders.js`, `src/engines/compensation.js`, `src/engines/nport.js`, `src/engines/filingMarkdown.js`
  - Dev proxy: `/api/sec` → `https://www.sec.gov`
- SEC Ticker Map (`www.sec.gov/files/company_tickers.json`) - CIK lookup for all public companies
  - Engine: `src/engines/edgar.js`
  - Dev proxy: `/api/sec`

**Financial Data — Yahoo Finance (free, no API key):**
- Yahoo Chart API (`query1.finance.yahoo.com/v8/finance/chart`) - Historical daily OHLCV prices
  - Engine: `src/engines/prices.js`
  - Dev proxy: `/api/yahoo` → `https://query1.finance.yahoo.com`
  - Storage: IndexedDB via `src/engines/priceStore.js` (incremental updates)
- Yahoo Quote Summary v10 (`query1.finance.yahoo.com/v10/finance/quoteSummary`) - Analyst estimates, earnings dates, company profile
  - Modules used: `earningsTrend`, `financialData`, `recommendationTrend`, `upgradeDowngradeHistory`, `calendarEvents`, `assetProfile`
  - Dev: Vite middleware `/api/yahoo-summary/:ticker` using `yahoo-finance2` (handles crumb/cookie auth)
  - Engine: `src/engines/analystEstimates.js`, `src/engines/companyEvents.js`
- Yahoo Quote API - Real-time/delayed quotes for peer competitor metrics
  - Dev: Vite middleware `/api/yahoo-quotes/:tickers` (batches up to 50 tickers)
  - Engine: `src/engines/batchQuotes.js`
  - Fields: marketCap, price, P/E, forwardPE, EPS, bookValue, sharesOutstanding, dividendYield, 52-week range

**Financial Data — Finviz (free, scraping):**
- Finviz quote page (`finviz.com/quote.ashx`) - 5yr EPS growth consensus, analyst recommendation, short interest, PEG
  - Approach: Server-side HTML scrape in Vite middleware (`/api/finviz/:ticker`) using cheerio; browser-like User-Agent required
  - Production: Direct DOM parse via `DOMParser`
  - Engine: `src/engines/finviz.js`
  - No API key required; fragile to HTML structure changes

**Financial Data — Finnhub (premium, optional):**
- Earnings call transcripts (`finnhub.io/api/v1/stock/transcripts/list` + transcript fetch)
  - Auth: `VITE_FINNHUB_KEY` env var (premium tier only; 403 on free tier, silently suppressed)
  - Engine: `src/engines/transcripts.js`
  - Cache: IndexedDB `transcript-data` store, 10-year TTL (transcripts are immutable)

**Financial Data — Alpha Vantage (free tier, optional):**
- Earnings call transcripts (fallback when Finnhub unavailable)
  - Auth: `VITE_ALPHA_VANTAGE_KEY` env var
  - Free tier: 25 calls/day
  - Engine: `src/engines/transcripts.js`
  - Base URL: `https://www.alphavantage.co/query`

**Financial Data — GuruFocus (optional, $25/mo API or scrape fallback):**
- GF Value, financial strength/profitability ranks, Graham Number, Peter Lynch Value, DCF estimates, growth rates
  - Auth: `VITE_GURUFOCUS_KEY` env var (API mode); scrape mode if key absent
  - Dev: Vite middleware `/api/gurufocus/:ticker` (dual mode: API or HTML scrape)
  - Engine: `src/engines/gurufocus.js`
  - API endpoint: `api.gurufocus.com/public/user/{key}/stock/{ticker}/summary`

## Data Storage

**Databases:**
- IndexedDB (`thes1s-cache`, version 5)
  - Client: `idb ^8.0.3` via `src/engines/cacheStore.js`
  - Object stores: `edgar-facts`, `edgar-statements`, `guru-data`, `nport-data`, `filing-markdown`, `insider-data`, `comp-data`, `transcript-data`
  - TTLs: financials 24hr, prices 1hr, filings/transcripts 10yr (immutable), analyst/events 6hr

**localStorage:**
- Reports: key `stock-analyzer-reports` — full report objects (One Pager, Pitch Deck, Full Story)
- Settings: `src/hooks/useSettings.js`
- Watchlists: `src/hooks/useWatchlists.js`
- Coverage monitor baselines: per-ticker XBRL field coverage snapshots
- Small/fast cache entries (non-IDB-prefixed keys): routed here via `src/engines/cache.js`

**File Storage:**
- Local filesystem only — no cloud storage
- Static data files bundled with app:
  - `src/data/taxonomy-hierarchy.json` (84KB — 1,937 FASB descendant tags for Layer 2)
  - `src/data/sp500-tag-classifications.json` (387KB — 1,989 AI-classified tags for Layer 3)
  - `industry-classification/thes1s-company-assignments.json` (5,758 company classifications)

**Caching:**
- Three-tier: in-memory Map → IndexedDB (large/immutable data) → localStorage (small/fast data)
- Key routing logic: `src/engines/cache.js` (`IDB_PREFIXES` array determines storage tier)

## Authentication & Identity

**Auth Provider:**
- None — single-user local desktop app, no login system
- API keys stored in `.env.local` (gitignored), accessed via `import.meta.env` through `src/engines/config.js`

## Monitoring & Observability

**Error Tracking:**
- None — no external error reporting service

**Logs:**
- Tauri plugin log (`tauri-plugin-log 2`) for Rust shell
- Browser console.warn/console.error throughout engines (e.g., Finnhub 403 suppressed deliberately)
- No structured logging framework on the frontend

## CI/CD & Deployment

**Hosting:**
- Local macOS desktop app — no cloud hosting
- Distribution: `.app` bundle via `npm run tauri:build` → `src-tauri/target/`

**CI Pipeline:**
- None — no GitHub Actions or CI service configured

## Environment Configuration

**Required env vars (for full functionality):**
- `VITE_CLAUDE_KEY` — Required for Layer 3 XBRL on non-S&P 500 companies; required for Phase 5-7 AI reports
- `VITE_FINNHUB_KEY` — Optional; enables earnings call transcripts (premium endpoint)
- `VITE_ALPHA_VANTAGE_KEY` — Optional; transcript fallback (25 calls/day free)
- `VITE_GURUFOCUS_KEY` — Optional; reliable GuruFocus data ($25/mo) vs HTML scrape fallback

**Secrets location:**
- `.env.local` in project root (gitignored, never committed)
- Read exclusively through `src/engines/config.js`

## Webhooks & Callbacks

**Incoming:**
- None — desktop app, no server, no incoming webhooks

**Outgoing:**
- None — all data fetching is request/response, no event-driven callbacks

## CORS Strategy

The app uses different CORS strategies for dev vs production:

**Dev (Vite dev server):**
- `/api/sec` → proxy to `https://www.sec.gov` (strips browser fingerprint headers, sets proper User-Agent)
- `/api/edgar` → proxy to `https://data.sec.gov` (same header manipulation)
- `/api/yahoo` → proxy to `https://query1.finance.yahoo.com` (adds User-Agent)
- `/api/yahoo-summary/:ticker` → Vite middleware using `yahoo-finance2` (handles Yahoo crumb/cookie)
- `/api/yahoo-quotes/:tickers` → Vite middleware using `yahoo-finance2`
- `/api/finviz/:ticker` → Vite middleware using `cheerio` (server-side HTML fetch)
- `/api/gurufocus/:ticker` → Vite middleware (API or scrape mode)
- `/api/ir-events` → Vite middleware (parallel IR page probing, no CORS needed server-side)

**Production (Tauri native webview):**
- Tauri's WKWebView on macOS does not enforce CORS — all APIs called directly
- CSP is explicitly set to `null` in `src-tauri/tauri.conf.json`

---

*Integration audit: 2026-03-24*
