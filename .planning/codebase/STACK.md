# Technology Stack

**Analysis Date:** 2026-03-25

## Languages

**Primary:**
- JavaScript (ES2020+) — All frontend logic, React components, engines, hooks, utilities (`src/components/*.jsx`, `src/engines/*.js`, `src/hooks/*.js`)
- JSX — React component templates with inline styles (`src/components/**/*.jsx`)

**Secondary:**
- Rust (edition 2021, min 1.77.2) — Tauri native shell, app window management, file system access (`src-tauri/src/`)
- JSON — Static data files: taxonomy hierarchy (1,937 tags), S&P 500 tag classifications (1,989 pre-classified tags), company industry assignments

## Runtime

**Environment:**
- Node.js v24.13.1 (confirmed on dev machine)
- npm (lockfile version 3 in package-lock.json)
- Lockfile present — `package-lock.json` (tracked, enforced)

**Package Manager:**
- npm v10+ (inferred from lockfile v3)
- Commands: `npm run dev` (Vite server), `npm run build`, `npm test`, `npm run tauri:dev`

## Frameworks

**Core UI:**
- React 19.2.0 — Functional components only, hooks-based state management (`src/components/`, `src/hooks/`)
- React Router DOM 7.13.1 — Client-side routing for `/research/:id`, `/watchlists`, `/gurus`, `/reports`, etc. (`src/App.jsx`)
- Vite 7.3.1 — Dev server + production bundler, custom middleware plugins for CORS proxying and data ingestion
- @vitejs/plugin-react 5.1.1 — JSX transform + HMR (hot module reload)

**Desktop:**
- Tauri 2.10.3 — Native macOS `.app` packaging
  - Rust crate: `tauri = "2.10.3"`
  - CLI: `@tauri-apps/cli ^2.10.1`
  - Config: `src-tauri/tauri.conf.json` (window 1400×900, CSP disabled, native webview, bundle all targets)
- tauri-plugin-log 2 — Structured logging from Rust shell to frontend

**Testing:**
- Vitest 4.1.0 — Unit test runner (`npm test` / `npm run test:watch`)
- jsdom 29.0.1 — Browser DOM environment for engine tests
- Tests located in `src/engines/__tests__/*.test.js` (173 tests total, vitest coverage for XBRL taxonomy, splits, derived fields, overlays, industry classification)

**Build/Dev:**
- ESLint 9.39.1 — Flat config (`eslint.config.js`), with `react-hooks` and `react-refresh` plugins
  - No Prettier detected; formatting is manual/editor-default
  - No build-time CSS processing (all inline styles via `C` theme object)

**Charts:**
- Recharts 3.8.0 — Interactive charts for price history, growth rates, valuation curves (`src/components/`)

## Key Dependencies

**Critical:**
- `@anthropic-ai/sdk ^0.78.0` — Claude API client for Layer 3 XBRL tag classification (`src/engines/companyAdapter.js`) and planned AI report generation (`src/engines/aiResearch.js`)
- `yahoo-finance2 ^3.13.2` — Yahoo Finance data client; handles crumb/cookie auth internally; runs in Vite dev middleware for quoteSummary (analyst estimates), batch quotes, calendar events; used in production via direct fetch with Tauri webview
- `idb ^8.0.3` — IndexedDB wrapper for client-side caching of large blobs (EDGAR facts, guru filings, statements, transcripts); powers `cacheStore.js`

**Data Processing:**
- `cheerio ^1.2.0` — HTML parsing for web scraping; runs in Vite middleware (Finviz quote parser, company events IR page discovery); also used in `filingMarkdown.js` for SEC filing HTML cleanup
- `turndown ^7.2.2` + `turndown-plugin-gfm ^1.0.2` — HTML-to-Markdown conversion for SEC filing display in UI (`src/engines/filingMarkdown.js`)
- `@xmldom/xmldom ^0.8.11` — XML parsing for EDGAR XBRL (Form 4, N-PORT, etc.); dev dependency but used in validation scripts

**Infrastructure:**
- `uuid ^13.0.0` — Report ID generation (`src/hooks/useResearch.js`)
- `react-dom ^19.2.0` — React DOM binding
- `dotenv ^17.3.1` — Load `.env.local` (dev-only, not used in production Tauri build)
- `linkedom ^0.18.12` — Lightweight DOM implementation (alternative to cheerio in some contexts)
- `zod ^4.3.6` — Schema validation (data validation for external API responses)
- `xlsx ^0.18.5` — Excel/spreadsheet export (present in deps, used in validation scripts)

## Configuration

**Environment Variables:**
- File: `.env.local` (gitignored, dev-only)
- Variables read via `src/engines/config.js` using `import.meta.env`:
  - `VITE_CLAUDE_KEY` — Claude API key for Layer 3 AI classification
  - `VITE_FINNHUB_KEY` — Finnhub API key for earnings transcripts (optional premium feature)
  - `VITE_ALPHA_VANTAGE_KEY` — Alpha Vantage API key for free transcript fallback
  - `VITE_GURUFOCUS_KEY` — GuruFocus API key for premium data (optional, falls back to scraping)

**Vite Configuration:**
- File: `vite.config.js`
- 6 custom middleware plugins:
  - `yahooSummaryPlugin()` — `/api/yahoo-summary/:ticker` for analyst estimates (uses yahoo-finance2)
  - `yahooQuotesPlugin()` — `/api/yahoo-quotes/AAPL,MSFT` for batch quote data (market cap, P/E, dividend yield)
  - `finvizPlugin()` — `/api/finviz/:ticker` for analyst consensus (EPS growth, forward P/E, PEG, target price)
  - `gurufocusPlugin()` — `/api/gurufocus/:ticker` for valuation multiples (API mode if key present, scrape fallback)
  - `irEventsPlugin()` — `/api/ir-events?website=` for investor relations page discovery (parallel probing of 20+ URL patterns)
  - `thes1sReportsPlugin()` — `/api/thes1s/reports` for serving generated One Pager/Pitch Deck/Full Story JSON from `.thes1s/reports/` directory
- 3 CORS proxy routes:
  - `/api/yahoo` → `https://query1.finance.yahoo.com` (Yahoo lacks CORS headers, proxied in dev)
  - `/api/sec` → `https://www.sec.gov` (strips browser fingerprinting headers, adds StockAnalyzer User-Agent)
  - `/api/edgar` → `https://data.sec.gov` (XBRL company facts API, custom User-Agent handling)

**Tauri Configuration:**
- File: `src-tauri/tauri.conf.json`
- Window: 1400×900, resizable, no fullscreen, title "Stock Analyzer"
- Security: CSP (Content Security Policy) disabled — allows direct API calls to external services
- Bundle: All targets (macOS `.app`, Windows `.exe`, Linux binary)
- App identifier: `com.stock-analyzer.app`
- Icons: 32×32, 128×128, 128×128@2x (retina), .icns (macOS), .ico (Windows)

**Build/Dev Commands:**
```
npm run dev              # Vite dev server @ localhost:5173
npm run build            # Production bundler output to dist/
npm run tauri:dev       # Tauri dev with hot-reload
npm run tauri:build     # Package native macOS .app
npm test                # Vitest (all tests)
npm run test:watch      # Vitest in watch mode
npm run lint            # ESLint check
```

## Platform Requirements

**Development:**
- Node.js 24+ (exact: v24.13.1)
- Rust 1.77.2+ (required by Tauri v2)
- macOS (Tauri build tested on macOS; Linux/Windows untested for this project)

**Production:**
- Tauri 2 native webview (macOS Webkit)
  - No CORS enforcement — direct API calls work without proxying
  - No file system restrictions beyond app sandbox
- Deployment: Single `.app` bundle for macOS (signed and notarized optional but not yet implemented)

**Network:**
- No server component — all API calls go direct to external services (SEC EDGAR, Yahoo Finance, Finviz, GuruFocus, Finnhub, Alpha Vantage, Claude)
- No authentication layer — user credentials for external APIs (Claude, Finnhub, GuruFocus) stored in `.env.local` only
- CORS handled by Vite dev proxy or disabled in Tauri production

**Storage:**
- IndexedDB (browser-native, ~50MB+ typical usage for cached EDGAR data, guru filings, transcripts)
- localStorage (JSON-serialized reports, settings, watchlists; typical usage ~1MB)
- File system via Tauri: `.thes1s/reports/` directory for One Pager/Pitch Deck/Full Story JSON exports

---

*Stack analysis: 2026-03-25*
