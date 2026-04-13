# Technology Stack

**Analysis Date:** 2026-03-24

## Languages

**Primary:**
- JavaScript (ES2020+) - All frontend logic, engine layer, React components, Vite plugins
- JSX - React component templates (`src/components/*.jsx`)

**Secondary:**
- Rust (edition 2021, min 1.77.2) - Tauri native shell (`src-tauri/src/`)
- JSON - Static data files: taxonomy hierarchy (`src/data/taxonomy-hierarchy.json`), S&P 500 tag classifications (`src/data/sp500-tag-classifications.json`), industry company assignments (`industry-classification/thes1s-company-assignments.json`)

## Runtime

**Environment:**
- Node.js v24.13.1 (confirmed on dev machine)

**Package Manager:**
- npm (lockfile version 3)
- Lockfile: present (`package-lock.json`)

## Frameworks

**Core:**
- React 19.2.0 - UI layer, functional components with hooks only (`src/components/`)
- React Router DOM 7.13.1 - Client-side routing (`src/App.jsx`)

**Desktop Shell:**
- Tauri 2.10.3 - Native macOS `.app` packaging; Rust crate `tauri = "2.10.3"`, CLI `@tauri-apps/cli ^2.10.1`
- tauri-plugin-log 2 - Structured logging from the Rust shell

**Build/Dev:**
- Vite 7.3.1 - Dev server + production bundler (`vite.config.js`)
- @vitejs/plugin-react 5.1.1 - React JSX transform + HMR

**Testing:**
- Vitest 4.1.0 - Unit test runner (`npm test` / `npm run test:watch`)
- jsdom 29.0.1 - DOM environment for engine tests

## Key Dependencies

**Critical:**
- `@anthropic-ai/sdk ^0.78.0` - Claude API client; used in `src/engines/companyAdapter.js` (Layer 3 XBRL classification) and planned `src/engines/aiResearch.js`
- `yahoo-finance2 ^3.13.2` - Yahoo Finance data client; runs in Vite dev middleware (`vite.config.js`) for analyst estimates, batch quotes, calendar events
- `recharts ^3.8.0` - Chart rendering (price charts, growth charts) throughout Toolbox tabs
- `idb ^8.0.3` - IndexedDB wrapper; powers the `thes1s-cache` database in `src/engines/cacheStore.js`
- `react-router-dom ^7.13.1` - App-level routing (`src/App.jsx`)
- `uuid ^13.0.0` - Report ID generation (`src/hooks/useResearch.js`)

**Parsing/Conversion:**
- `cheerio ^1.2.0` - HTML parsing in Vite middleware (Finviz scraper in `vite.config.js`); also used in `src/engines/filingMarkdown.js`
- `turndown ^7.2.2` + `turndown-plugin-gfm ^1.0.2` - HTML-to-Markdown conversion for SEC filing display (`src/engines/filingMarkdown.js`)
- `xlsx ^0.18.5` - Excel/spreadsheet export (present in deps, used in validation scripts)
- `@xmldom/xmldom ^0.8.11` - XML parsing for EDGAR XBRL files (dev dependency, validation scripts)

**Infrastructure:**
- `serde + serde_json 1.0` - Rust serialization (Tauri IPC data exchange)

## Configuration

**Environment:**
- Config file: `.env.local` (present, gitignored)
- Variables read via `src/engines/config.js` using `import.meta.env`:
  - `VITE_CLAUDE_KEY` - Anthropic Claude API key (required for Layer 3 XBRL classification on non-S&P 500 tickers; required for Phase 5-7 AI report generation)
  - `VITE_FINNHUB_KEY` - Finnhub API key (optional; enables earnings call transcripts from premium endpoint)
  - `VITE_ALPHA_VANTAGE_KEY` - Alpha Vantage API key (optional; transcript fallback, 25 calls/day free tier)
  - `VITE_GURUFOCUS_KEY` - GuruFocus API key (optional; $25/mo for reliable data vs scrape fallback)

**Build:**
- `vite.config.js` - Vite config with 5 custom middleware plugins + 3 CORS proxy routes
- `src-tauri/tauri.conf.json` - Tauri app config (window size 1400×900, CSP disabled, bundle targets all)
- `eslint.config.js` - ESLint flat config (eslint 9.39.1, react-hooks plugin, react-refresh plugin)

## Platform Requirements

**Development:**
- Node.js 24+ (confirmed)
- Rust 1.77.2+ (required by Tauri build)
- `npm run dev` → Vite dev server at localhost:5173
- `npm run tauri:dev` → Tauri dev with hot-reload

**Production:**
- macOS desktop app (`.app` bundle via `npm run tauri:build`)
- Tauri 2 native webview — no CORS enforcement, can set arbitrary headers
- No server, no auth, no network infrastructure — all API calls go direct to external services

---

*Stack analysis: 2026-03-24*
