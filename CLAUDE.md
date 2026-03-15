# Thes1s

## Project Overview
**Thes1s** (pronounced "thesis") — a single-user local desktop app for Rule One stock research and analysis. The name embeds a "1" for Rule One — pairs with the user's portfolio tracker **stickeR1**. Generates comprehensive research reports through a 3-stage gated workflow: One Pager → Pitch Deck → Full Story. Each stage must be approved before advancing to the next. Reports are saveable, editable, and include references, tables, and illustrations.

This app is a research report generator — it answers "should I invest in this company?" through the Rule One lens. It is NOT a portfolio tracker. The user also has a separate app called **stickeR1** for portfolio/options tracking.

### Branding
- **Name**: Thes1s — "1" replaces the "i", nods to Rule One
- **Logo**: `public/logo.svg` — fused T1 letterform in a slate-800 (`#1e293b`) rounded square. Teal-500 (`#14b8a6`) dot + teal vertical stem (the "1") with a muted slate (`#cbd5e1`) horizontal crossbar (the "T"). Reads as both a T and a stylized 1/i simultaneously.
- **In-app rendering**: Top nav bar shows logo mark (22px) + styled text where "Thes" is medium (500) primary text, "1" is bold (700) accent teal, "s" is medium (500) primary text. Uses Inter font, -0.02em letter-spacing (same weight-contrast technique as stickeR1).
- **Favicon**: Same `logo.svg` via `index.html`
- **Browser tab title**: "Thes1s" via `index.html <title>`

The user is NOT a programmer. Keep explanations in plain English.

**Goal**: Reduce 40+ hours of manual Rule One research per company to significantly less using AI-assisted analysis.

---

## Tech Stack & Architecture
- **Desktop shell**: Tauri (wraps the React frontend in a native macOS `.app`)
- **Frontend**: Vite + React (functional components with hooks)
- **Styling**: inline styles (dark/light palette object, no CSS framework — same approach as stickeR1)
- **Storage**: localStorage for small data (reports, settings, watchlists), IndexedDB for large caches (EDGAR facts, financial statements, guru 13F data, N-PORT data) via `cacheStore.js`. Single user, no auth needed.
- **AI**: Claude API called directly from the app (no proxy needed — API key lives in local `.env.local`)
- **Financial Data**: SEC EDGAR XBRL (primary source — income statement, balance sheet, cash flow, company details, ticker search, all line items, 13+ years, free, also used for stock split detection), Yahoo Finance (historical stock price data/charts — free, no API key), SEC EDGAR 13F (guru holdings — free, no key needed)
- **Price Storage**: IndexedDB via `idb` npm package — persistent local price database (`thes1s-prices`). First lookup fetches full history from Yahoo, stores locally. Subsequent lookups serve from local store with incremental updates for new trading days. Works offline for previously viewed tickers.
- **Cache Storage**: Three-tier caching — in-memory Map (instant) → IndexedDB (`thes1s-cache` database, 7 object stores: `edgar-facts`, `edgar-statements`, `guru-data`, `nport-data`, `filing-markdown`, `insider-data`, `comp-data`) → localStorage (small keys only). Large cache entries (EDGAR facts 500KB-10MB, financial statements 200-500KB, guru 13F data 200KB-3MB, N-PORT data 50-500KB, insider Form 4 data 1-50KB per filing, compensation proxy HTML 50-500KB per filing) route to IndexedDB automatically via key-prefix routing. Small entries (CUSIP map, company details, series-match flags) stay in localStorage. `cacheStore.js` handles IndexedDB persistence with `fetchedAt` timestamps on all entries for "last refreshed" UI. Feature detection (`typeof indexedDB !== 'undefined'`) ensures Node.js validation scripts still work.
- **Charts**: Recharts (growth metrics, valuation visuals, price charts)
- **Dev**: `npm run dev` → localhost:5173 in browser. Hot-reload works normally.
- **Desktop build**: `npm run tauri:build` → produces a native `.app` for macOS
- **No server, no hosting, no auth** — runs entirely on your machine. API calls go direct to external services.

### API Keys
Stored in `.env.local` (gitignored via `*.local` pattern). No Cloudflare proxy needed since this is local-only.
```
VITE_CLAUDE_KEY=...    # Claude API — for AI report generation (only remaining API key)
```

### API Notes (Validated)
- **SEC EDGAR (Primary — Financial Statements)**: Free, no key needed. Requires `User-Agent` header. The XBRL company facts endpoint (`/api/xbrl/companyfacts/CIK{cik}.json`) returns ALL financial data for a company in one call — income statement, balance sheet, cash flow, every line item. `edgarFinancials.js` maps ~112 XBRL tags across all three statements using a taxonomy with fallback tags per field (handles ASC 606 revenue transition, ASC 842 lease accounting, different debt tags, etc.). Tags are **merged** across fallbacks (not first-match-wins) so older years using legacy tags are included. Supports `USD`, `USD/shares`, and `shares` unit types. Fiscal year extracted from XBRL `fy` field (not `getFullYear()`) — correctly handles companies with non-calendar fiscal years (e.g., SFM ends in early January). Supports **version modes**: `restated` (default — latest filing per FY via `extractAnnualFact`) and `original` (earliest filing per FY via `extractAnnualFactOriginal`). Split-sensitive fields always use `extractAnnualFactOriginal` regardless of version to prevent double-adjustment from restated comparatives. Cache key includes version: `edgar-statements:v2:TICKER:s3:restated`. **fp=Q4 fallback**: `extractAnnualFact` and `extractAnnualFactOriginal` accept `fp=Q4` from 10-K filings as fallback when `fp=FY` is absent for a fiscal year — some companies (e.g., COST FY2019) tag all annual data as Q4 instead of FY. FY entries are always preferred over Q4 for the same fiscal year. Auto-computes derived fields: Gross Profit, EPS, EBIT, EBITDA, non-current totals, total debt, net debt, FCF, net investments, net change in cash, total expenses, effective tax rate, working capital, invested capital, net tangible assets, total capitalization, beginning/ending cash position. Rate limit: 10 req/sec. **CORS note**: `User-Agent` is a forbidden header in browser fetch — browsers silently drop it. Both `www.sec.gov` and `data.sec.gov` are proxied through Vite in dev (`/api/sec` → `www.sec.gov`, `/api/edgar` → `data.sec.gov`) with proper headers injected server-side. In Tauri production, the native webview doesn't enforce CORS so direct calls work. `edgar.js` auto-detects dev vs production via `import.meta.env.DEV`.
- **SEC EDGAR (13F Guru Holdings)**: Same EDGAR infrastructure. Uses `/submissions/CIK{cik}.json` + infotable XML parsing for guru 13F holdings. `gurus.js` uses the same Vite proxy pattern as `edgar.js` (`/api/edgar` + `/api/sec` in dev, direct URLs in Tauri production). **Multi-filing fetch**: fetches current + previous quarter's 13F to compute quarter-over-quarter changes (new/added/reduced/sold/held) by comparing holdings via CUSIP. **Amendment-aware**: handles both `RESTATEMENT` amendments (full replacement) and `NEW HOLDINGS` amendments (confidential treatment disclosures — merges with original filing by fetching both infotables). Checks `amendmentType` in `primary_doc.xml`. Affects 8 gurus / 20 quarters (Buffett, Ackman, Halvorsen, Gayner, Akre, Lampert, Ubben, Dalio). Per-filing cache (`guru-filing:{cik}:{reportDate}`) — old filings are immutable. Activity cache (`guru-activity:{cik}`) stores enriched holdings with change data. Submissions cache (`guru-subs:{cik}`) avoids redundant API calls. **Ticker resolution**: 5-tier matching against EDGAR `company_tickers.json` — (1) CUSIP cache, (2) static CUSIP prefix overrides for known edge cases, (3) exact normalized name match with SEC 13F abbreviation expansion (60+ abbreviations via `SEC_ABBREVIATIONS` map), (4) prefix match, (5) token-overlap match. Persistent CUSIP→ticker localStorage map (`sa-cusip-ticker-map:v2`) for progressive caching. 99.2% resolution rate across 2,238 holdings. **Self-healing resolution**: `resolveTickersForHoldings()` runs at the engine level in `gurus.js` — called in `fetchGuruWithChanges()` before caching, and in `loadCachedActivities()`/`loadCachedPortfolios()` during hydration. Cached data without tickers is automatically detected, resolved, and re-cached on first read. `findGurusOwning()` searches by ticker (exact match), issuer name (substring), and CUSIP. **History fetch**: on-demand `fetchGuruHistory(guru, 8)` for expandable rows — fetches up to 8 quarters of filings per guru. `useGurus` hook hydrates both old portfolio cache and new activity cache on mount.
- **SEC EDGAR (N-PORT Fund Holdings)**: Same EDGAR infrastructure. Supplements 13F data for 13 gurus whose funds are registered mutual funds/ETFs. N-PORT (filed monthly) provides complete fund portfolio: equities + cash + money market + derivatives + fixed income — data invisible in 13F. Uses trust CIK (`fundCik`) + `seriesId` to match the correct fund series within multi-fund trusts (e.g., World Funds Trust has 9+ series). `nport.js` fetches NPORT-P filings from `/submissions/CIK{fundCik}.json`, iterates candidates checking `<seriesId>` in XML to find the right series, then parses full XML via DOMParser. Holdings categorized by `<assetCat>`: `STIV` (money market), `EC`/`EP` (equity), `DE`/`DIR` (derivatives), `DBT` (debt), `RF` (repo). Cash position = sum of STIV + RF + `cshNotRptdInCorD`. Toggled via `settings.enableNport` (on by default). Fetched as non-blocking second pass after 13F data. Same Vite proxy pattern (`/api/edgar` + `/api/sec` in dev).
- **Yahoo Finance (Stock Price Data)**: Free, no API key needed. Uses the public `/v8/finance/chart/{TICKER}` endpoint for daily OHLCV data with adjusted close prices. Uses `period1`/`period2` timestamps for full history and incremental fetches. **CORS note**: Yahoo doesn't send CORS headers, so browser calls fail. In dev, requests are proxied through Vite (`/api/yahoo` → `query1.finance.yahoo.com`). In Tauri production, the native webview doesn't enforce CORS. This is an unofficial endpoint (no API key or account needed) that has been stable for years. If it ever breaks, `yahoo-finance2` npm package is a maintained wrapper. **Local storage**: Price data persists in IndexedDB (`thes1s-prices` database). First lookup fetches entire history (`period1=0`), subsequent lookups only fetch new days since last stored date. Works offline for previously viewed tickers.
- **Finviz (Analyst Estimates)**: Free, no API key needed. Stock quote page (`finviz.com/quote.ashx?t=TICKER`) scraped server-side via Vite middleware (`/api/finviz/:ticker`) using `cheerio` HTML parser. Returns 70+ fields from the snapshot table including **EPS next 5Y** (5-year consensus EPS growth rate — the key long-term growth number for FGR), forward P/E, PEG, target price, analyst recommendation (1.0-5.0 scale), short float, insider/institutional ownership, ROE, ROIC, ROA. Requires browser-like User-Agent headers (403 without). In Tauri production, direct fetch with DOMParser parsing (native webview bypasses CORS). `finviz.js` engine with 6-hour cache (`finviz:v1:TICKER` in localStorage). Key field names from camelCase conversion: `epsNext5y`, `epsThisY`, `epsNextY`, `epsPast35y` (quirk — Finviz label "EPS past 5Y" produces this key), `forwardPE`, `peg`, `recom`, `targetPrice`.
- **GuruFocus (Valuation Estimates)**: Supports two modes. **API mode** ($25/mo, reliable): set `VITE_GURUFOCUS_KEY` in `.env.local`, structured JSON from `api.gurufocus.com`. **Scrape mode** (free, unreliable): attempts to fetch public summary page — currently returns 403 (JS-heavy, anti-scraping). When scraping fails, engine returns `null` gracefully (UI shows only Yahoo + Finviz data). Provides GF Value, predictability rank, financial/profitability scores, Graham Number, Peter Lynch Value, DCF estimates. `gurufocus.js` engine with 6-hour cache (`gurufocus:v1:TICKER`). Vite middleware at `/api/gurufocus/:ticker` handles both modes.
- **Multi-Source Analyst Data**: `useAnalystData` hook fires all 3 sources (Yahoo + Finviz + GuruFocus) in parallel via `Promise.allSettled`. Derives composite "Analyst GR" with priority: Finviz 5Y EPS growth > GuruFocus analyst estimate > Yahoo next-FY growth. Analyst GR always reflects latest fetched value (not stale saved values). Backward-compatible with old `useAnalystEstimates` (re-exported). Analyst data feeds the FGR radio group in ValuationCalculators (Analyst GR option) but no longer has a dedicated display panel — the old analyst estimates box was removed from the MOS section.
- **Claude API**: Direct calls from the app. The app constructs messages with financial data + Rule One methodology context, sends to Claude, receives structured analysis. Claude also reads 10K/10Q filings from EDGAR to extract quantitative data (CapEx, FCF, maintenance CapEx) and qualitative insight (management discussion, risk factors, business description).

### Current State
- **Phases 1-4 complete** — app shell, data engines, calculation engines, and Toolbox UI all functional
- **Navigation restructured** — Left sidebar removed, replaced with horizontal top nav bar (52px). Four top-level tabs: Watchlists | Research | Gurus | Reports, each with 14px SVG icons. Settings gear icon (far left), logo + brand (left), search bar (pushed right via `marginLeft: auto`). Routes: `/watchlists`, `/research`, `/research/:id` (was `/research/:id/toolbox`), `/gurus`, `/gurus/:cik` (individual guru portfolio detail view), `/reports`, `/validation`, `/guru-audit`, `/ticker-audit`, `/nport-audit`, `/comp-audit`. Default landing page is `/research` (empty state). Validation, Guru Audit, Ticker Audit, N-PORT Audit, and Compensation Audit accessed via Settings modal "Tools" section. Old `/research/:id/toolbox` URLs redirect to `/research/:id`.
- **Watchlists feature built** — `useWatchlists` hook (localStorage CRUD, `stock-analyzer-watchlists` key). Create named watchlists, add/remove tickers via inline autocomplete search (reuses `searchTickers` engine), rename (double-click), delete (with confirmation). Collapsible watchlist cards with stock tables. Clicking a ticker creates a research report and navigates to Research tab.
- **Rule One Score — null data handling** — Metrics with no data (all periods null) are now excluded from score averaging instead of scoring 0 and dragging down the average. Matches Toolbox behavior (e.g., BOOT has no FCF data — FCF metric excluded from both Moat and Management scores). Applies to growth metrics, return metrics, and debt metrics.
- **EDGAR financial statements engine complete** — `edgarFinancials.js` with full XBRL taxonomy (~112 tags across income/balance/cash flow) validated against Rule One Toolbox AAPL export. Income: 24 fields, Balance Sheet: 56 fields (including PP&E sub-items, cash sub-items, receivables detail), Cash Flow: 37 fields, plus ~20 derived fields (EBIT, EBITDA, FCF, total/net debt, total receivables, non-current totals, working capital, invested capital, net tangible assets, total capitalization, effective tax rate, beginning/ending cash position). Supports `version` parameter (`restated` default, `original`) controlling whether data uses latest or earliest filing per fiscal year. Wired into `useEdgar` hook and `FinancialStatements` component.
- **Key Metrics engine built** — `keyMetrics.js` computes 62 derived metrics matching Rule One Toolbox Key Metrics export: Per Share (14), Shares (3), Liquidity (4), Profitability (10), Debt Ratios (7), Operating (11), Price (7). Displayed via Key Metrics toggle in FinancialStatements.
- **Key Metrics validated against Rule One Toolbox + Morningstar (AAPL)** — Four formula fixes applied:
  - **Receivable Turnover**: Was using `total_receivables` (trade + vendor/non-trade). Fixed to use `accounts_receivable` (trade only) to match Toolbox/Morningstar. Was 2x off for AAPL (~5.7 vs correct ~11.4). Also fixes Days In Receivables and Cash Conversion Cycle.
  - **ROIC**: Was `Net Income / (Equity + LT Debt - Cash&Mkt Sec)` — cash subtraction made denominator too small, inflating ROIC ~1.5-2x. Fixed to `Net Income / (Equity + LT Debt)` matching Toolbox (verified: pre-debt years show ROIC = ROE exactly). Morningstar uses a different formula (average invested capital with total debt) — intentional methodology difference, not a bug.
  - **Quick Ratio**: Was `(Current Assets - Inventory) / CL` which included prepaid expenses and other current assets. Fixed to narrow formula `(Cash + STI + Trade Receivables) / CL` matching Toolbox/Morningstar.
  - **Debt to Total Capital**: Was `Total Debt / (Equity + Total Debt)`. Fixed to `LT Debt / (Equity + LT Debt)` matching Toolbox.
  - **ROE**: Uses ending equity (matches Toolbox). Morningstar uses average equity — intentional methodology difference.
  - **Remaining minor differences**: EBIT Margin (Toolbox uses PreTax + Interest Expense; app uses Operating Income — differs 1-2% in historical years with non-operating items). Inventory Turnover (~14% off, likely Original vs Restated inventory values). Fixed Asset Turnover (varies 2-5%, version-related PP&E differences). BVPS (~1.6% off vs Toolbox). These are low priority.
- **FinancialStatements rebuilt** — Uses EDGAR as single source. Financials/Key Metrics toggle. 4 dropdown controls matching Rule One Toolbox: **Layout** (Consolidated ~100 rows / Expanded ~140 rows — expanded adds PP&E sub-items, cash breakdown, receivables detail, EBIT/EBITDA, working capital, invested capital, beginning/ending cash, etc.), **Version** (Original / Restated — triggers EDGAR refetch), **View** (Annual / Quarterly — quarterly shows "Q4 2025", "Q3 2025" columns, triggers quarterly data fetch), **Periods** (5/10/13/All years in annual mode, 4/8/12/20/All Qtrs in quarterly mode). Expanded rows use `expanded: true` flag, filtered at render time. Version and View state live in parent Toolbox.jsx (trigger refetch); Layout and Periods are local state (UI-only). CSV export respects current layout/version/periods/view settings. **Trend sparkline bars** — inline SVG bar charts in the rightmost column of each row (both Financials and Key Metrics), showing value trend across visible periods. Handles mixed positive/negative with zero-line. **Column direction toggle** — toolbar button switches between newest-first (default) and oldest-first column ordering; trend bars follow column direction. **Per-row expand/collapse for Key Metrics % change** — each metric row has a chevron (▶/▼) that expands an indented % change row below it (italic, green/red colored values, tinted background). Matches Rule One Toolbox pattern.
- Dependencies installed: recharts, @anthropic-ai/sdk, uuid, react-router-dom, turndown, turndown-plugin-gfm, yahoo-finance2, cheerio
- Tauri CLI installed (`@tauri-apps/cli` in devDependencies)
- GitHub repo created (private)
- `.env.local` has spaces after `=` signs — handled by `config.js` trim
- Rule One Score algorithm fully reverse-engineered and validated (see Rule One Score section below)
- **Light mode default** — `useTheme.js` defaults to light mode for new users
- **Yahoo Finance CORS fix**: Vite dev proxy (`/api/yahoo` → `query1.finance.yahoo.com`) in `vite.config.js`. In Tauri production, the native webview doesn't enforce CORS so direct calls work.
- **Local price database**: IndexedDB via `idb` package. `priceStore.js` handles persistence, `prices.js` handles fetch logic. First lookup fetches full history, stores in IndexedDB. Subsequent visits read locally with incremental updates for new trading days only. Staleness check: >1 hour since last fetch AND last date < today.
- **SEC EDGAR CORS fix**: Both `www.sec.gov` and `data.sec.gov` proxied through Vite (`/api/sec` and `/api/edgar`) with User-Agent headers injected server-side. Browser `fetch` silently drops `User-Agent` (forbidden header per Fetch spec), so direct calls from browser fail. `edgar.js` auto-detects dev vs production via `import.meta.env.DEV`.
- **EDGAR fiscal year fix**: Uses XBRL `fy` field for year mapping (not `getFullYear()` on end date). Correctly handles companies with non-calendar fiscal years (e.g., SFM ends in early January). Deduplicates by latest period end date per fiscal year to avoid picking up prior-year comparatives.
- **EDGAR unit support**: `extractAnnualFact` accepts `unit` parameter — `USD` (default), `USD/shares` (EPS, dividends per share), `shares` (share counts).
- **EPS gap fix**: `edgarFinancials.js` auto-computes EPS from Net Income / Diluted Shares when EDGAR doesn't report it directly.
- **Ticker autocomplete**: EDGAR `company_tickers.json` searched locally — works with both ticker symbols and company names.
- **Guru 13F engine**: All 43 guru CIK numbers verified against live EDGAR data. Fetches, parses, and caches 13F holdings. Includes Phil Town (Rule One Partners, CIK `0002040263`), Ray Dalio (Bridgewater Associates), Carl Icahn (Icahn Carl C, CIK `0000921669` — personal filing entity, not the defunct Icahn Capital LP). **XML namespace fix**: `parseInfoTable` uses `getElementsByTagNameNS('*', tag)` to handle both namespaced (`ns1:infoTable`) and non-namespaced XML — previously ~10 gurus (Klarman, Dalio, Li Lu, Phil Town, etc.) returned 0 positions. **Value normalization**: auto-detects whether 13F values are in dollars or thousands (SEC spec says thousands, but many filers use actual dollars) — checks median implied price per share, multiplies by 1000 if median < $1. **Options filtering**: `parseInfoTable` skips entries where `putCall` is non-null (puts/calls) — only equity positions included. All major guru trackers exclude options; without this filter, position counts and portfolio values were inflated (especially for options-heavy filers like Bridgewater). **Share class aggregation**: `aggregateShareClasses()` merges holdings with the same 6-char CUSIP prefix (issuer identifier) — e.g., GOOG/GOOGL, BRK.A/BRK.B become single positions. Applied per-filing after parsing, before enrichment. Cross-guru aggregation (`aggregateTopBuys`, `aggregateTopHoldings`) also groups by 6-char prefix. **InfoTable detection improved**: 3-tier heuristic — (1) `type` field containing 'INFORMATION TABLE', (2) filename containing 'infotable', (3) any XML fallback. Shared `findInfoTableFile()` helper used by both `getInfoTableUrl()` and `auditGurus()`. Supports `.txt` infotables. Removed overly aggressive `!startsWith('R')` exclusion. **13F-HR/A amendment handling**: `getRecent13Fs` tracks both original and amendment accession numbers per reportDate. `fetchSingleFiling` checks `amendmentType` via `primary_doc.xml` — `RESTATEMENT` replaces original (use amendment only), `NEW HOLDINGS` merges amendment positions into original (confidential treatment disclosures add previously omitted positions). Affects 8 gurus across 20 quarters (Buffett, Ackman, Halvorsen, Gayner, Akre, Lampert, Ubben, Dalio). **Cache versioned** (`GURU_CACHE_V = 'v4'`) to invalidate stale data from before these fixes. **CIK updates**: Guy Spier → Aquamarine Zurich AG (`0001953324`, moved from old Aquamarine Capital `0001404599` in 2023), Jeffrey Ubben → ValueAct Holdings (`0001418814`, moved from Inclusive Capital Partners), David Einhorn → DME Capital Management (`0001489933`, moved from Greenlight Capital `0001079114`).
- **Guru Audit system**: In-app audit at `/guru-audit` (Settings → Tools → "Run Guru Audit") + CLI script (`node validation/scripts/audit-gurus.mjs`). Validates all 43 guru CIKs against EDGAR — checks fund name match (fuzzy, strips legal suffixes like LLC/LP/INC and state identifiers), filing staleness (>180 days), and portfolio position count. CLI `--fix` flag outputs suggested corrections. Designed to catch fund name changes/entity migrations before they break the app. In-app troubleshooting guide with step-by-step instructions for adding/removing/replacing gurus and fixing issues.
- **Ticker Resolution Audit**: In-app audit at `/ticker-audit` (Settings → Tools → "Run Ticker Audit") + CLI script (`node validation/scripts/audit-ticker-resolution.mjs`). Re-resolves all tickers across 43 gurus to find holdings that fail to match a ticker symbol. **99.2% resolution rate** (2,221/2,238 holdings). Remaining 17 failures are all ETFs, foreign ADRs, and private trusts (expected — not in EDGAR's US equity index). **Ticker resolution engine** uses 5-tier matching: (1) CUSIP cache from localStorage, (2) static `CUSIP_TICKER_OVERRIDES` map for known edge cases (10 entries), (3) exact normalized name match with SEC abbreviation expansion (60+ abbreviations), (4) prefix match, (5) token-overlap match (50% threshold). `normalizeIssuer()` expands SEC 13F abbreviations (PETE→PETROLEUM, FINL→FINANCIAL, FMRS→FARMERS, etc.), strips legal suffixes and share class designators, normalizes punctuation (hyphens/dots→spaces). In-app troubleshooting guide with detailed instructions for fixing missing tickers via CUSIP overrides or SEC abbreviation additions.
- **Gurus tab restructured** — Three-tab interface mirroring Rule One Toolbox: **Latest** (default — "Latest Quarter Guru Activity" table showing actual ticker symbols per action column (green for new/added, red for reduced/sold) + two side panels: "Top 10 Quarter Buys" and "Top 10 Guru Holdings", both with Company (name + ticker stacked), Value, Max % Portfolio, # Guru's Owning columns), **Directory** (43 gurus alphabetically, guru names are clickable teal links that navigate to `/gurus/:cik` detail view, shows positions/value/filed date per row, searchable by guru name or fund name), **Stock Lookup** (search by company name across all loaded portfolios). `gurus.js` uses Vite proxy in dev (same `IS_DEV` pattern as `edgar.js`). `aggregateTopBuys()` groups bought/added positions by CUSIP across gurus. `aggregateTopHoldings()` groups ALL holdings by CUSIP (regardless of action) ranked by # gurus owning. Multi-filing fetch compares current vs previous 13F to compute quarter-over-quarter changes. `useGurus` hook hydrates both portfolio and activity caches on mount.
- **Guru Portfolio detail view** — Route `/gurus/:cik`. Header with guru dropdown selector (switch gurus inline), fund name, stats box (Latest Reporting Period, # Stocks Held, Current Portfolio Value). **Interactive treemap** showing top 25 positions, full-width percentage-based layout (responsive), color-coded by action (green=bought/added, red=reduced/sold, blue=held), ticker labels inside rectangles, tooltip anchored to hovered rectangle (appears above or below based on position). **Portfolio Value AreaChart** below holdings table showing historical portfolio value over time (quarterly 13F data points), with 6M/1Y/3Y/5Y range buttons, gradient fill, and % return display — auto-fetches up to 20 quarters via `fetchPortfolioValueHistory()` (cached after first load). Filter dropdown (All/Bought/Sold/Held) filters both treemap and table. **Sortable holdings table** with columns: Ticker, Company Name, % of Portfolio, Shares Held, Last Quarter Action (colored dot + text), % Change, Shares Change, % Portfolio Change. **Expandable rows** with on-demand history fetch (up to 8 quarters): historical activity table (Period, Shares Change, % Change, Quarter End Shares, Avg. Price) + Recharts ComposedChart (bars=shares held, line=avg price, dual Y-axes). Ticker resolution via fuzzy matching issuer names against EDGAR ticker index with persistent CUSIP cache.
- **Score/growth engines migrated to EDGAR** — `growthRates.js`, `returnMetrics.js`, and `freeCashFlow.js` all rewritten to consume EDGAR statements directly (single source of truth). `Toolbox.jsx` passes `edgarStatements` to all score engines. `StockAtGlance.jsx` uses EDGAR as sole source for financials. Market cap computed locally (shares_outstanding × current_price).
- **BVPS+Div+Buybacks composite metric** — Growth rate now uses cumulative running total: BVPS + all dividends per share ever paid + all buyback value per share ever returned. Prevents companies with heavy buybacks (like AAPL) from showing negative BVPS growth when they're creating enormous shareholder value. Validated against Rule One Toolbox AAPL.
- **ROIC formula corrected** — Changed from `Net Income / (Equity + LT Debt - Cash)` to `Net Income / (Equity + LT Debt)` — no cash subtraction, matching Toolbox. Verified: AAPL pre-debt years show ROIC = ROE exactly. Applied in both `returnMetrics.js` (scoring) and `keyMetrics.js` (display).
- **Earnings Growth fix**: Moat scoring uses total Net Income (not EPS) for "Earnings Growth" metric. EPS inflates growth for heavy-buyback companies (e.g., AAPL shares 23B→15B). Validated against Rule One Toolbox AAPL — Earnings Score now matches (50 vs previous 88).
- **Quarterly EDGAR extraction complete** — `fetchEdgarQuarterly()` in `edgarFinancials.js` extracts per-quarter financial data from 10-Q XBRL filings. Flow items use YTD de-cumulation (Q1=Q1_YTD, Q2=Q2_YTD−Q1_YTD, Q3=Q3_YTD−Q2_YTD, Q4=FY−Q3_YTD). Balance sheet uses point-in-time values per quarter (Q4 = FY 10-K). Derived fields computed per quarter. Split-adjusted. Caches with split-count-aware key. Critical fix: `getQuarterlyInstant()` selects by latest `end` date (not `filed` date) to avoid picking comparative FY-end values from 10-Q filings.
- **Quarterly UI in FinancialStatements** — View dropdown switches between Annual/Quarterly. Quarterly columns render as "Q4 2025", "Q3 2025", etc. (most recent first). Periods dropdown shows 4/8/12/20/All Qtrs in quarterly mode. `useEdgar` hook accepts `view` parameter, conditionally fetches quarterly data. `Toolbox.jsx` manages `dataView` state.
- **TTM support**: TTM computation already built in `edgarFinancials.js` (uses same `getQuarterlyYTD`/`getQuarterlyInstant` helpers as quarterly extraction). Displayed in FinancialStatements annual view.
- **Toolbox UI matches Rule One Toolbox**: ScoreTable uses solid colored cell backgrounds (green/yellow/red) with white text, teal section headers, "X.X Years" debt display. StockAtGlance shows all Toolbox metrics in two-column layout with dollar signs and comma formatting for US currency. Price chart shows % return for selected range.
- **Toolbox UX polish**: Settings changes apply immediately (no page reload or scroll reset) — `Toolbox.jsx` syncs local state from `settings` via `useEffect` hooks. Content stays visible during EDGAR refetch with opacity dimming + `pointerEvents: 'none'`. Settings modal has Save button with checkmark icon at bottom. Default settings: `defaultPeriods: '10'`, `defaultQtrPeriods: '8'`, `growthChartYears: '10'`, `defaultPriceRange: '5y'`.
- **Growth Analysis**: 6 metrics — BVPS+Dividends, Earnings (Net Income), Revenue, Operating Cash Flow, FCF, Retained Earnings. CAGR table (color-coded) + bar charts. All data sourced from EDGAR.
- **Growth Rate Analysis (Valuation sub-tab)** — Reverse-engineered from Rule One Toolbox (verified against AAPL, COST, MSFT, NVDA, POOL). Three sections: (1) Multi-line Recharts LineChart of 3-year smoothed growth rates limited to 10 most recent years, with **all 11 metrics toggleable** (Book Value, BVPS+Div, Earnings, Op Cash, Revenue, FCF, Retained Earnings, Market Cap, ROE, ROIC, ROA — default visible: BVPS+Div, Earnings, Op Cash, Revenue). Growth-type metrics show 3-year smoothed growth rates; return-type metrics (ROE/ROIC/ROA) show raw percentage values. **Chart legend shows only active metrics** — deselected metrics are hidden from the legend above the chart. **Nearest-line tooltip**: tracks mouse Y position to show tooltip for the closest line, not always the first. (2) Weighted Average Growth Rates panel — **dynamically shows only selected composite metrics** (default: BVPS+Div, Earnings, Op Cash, Revenue). Toggling a growth metric on/off in the chart or data table also adds/removes it from the composite panel. Return metrics (ROE/ROIC/ROA) are chart-only and don't appear in the panel. Clicking a metric in the panel removes it from both the panel and chart. (3) Data table with 11 rows across **13 years** (matching Toolbox) with **row/column/cell hover highlighting** (same pattern as FinancialStatements), **default oldest-first** column order. All rows clickable to toggle chart lines. **3-year smoothed rate**: NOT a CAGR — arithmetic mean of 3 consecutive YoY growth rates: `mean(YoY_{Y-2}, YoY_{Y-1}, YoY_Y)`. **Weighted average**: linear recency weighting limited to **10 most recent smoothed rates** (matching Toolbox — uses 13 years raw data → 12 YoY rates → 10 smoothed rates). Without this limit, companies with longer EDGAR histories had different weighted averages due to shifted weight distributions. Formula: `Σ(i × rate_i) / (N(N+1)/2)` where N≤10. **Composite GR**: simple average of selected metric weighted averages. State lifted to `Valuation.jsx` so composite GR feeds directly into MOS/PBT calculators. "Save Composite" button switches to Calculators sub-tab with composite selected as FGR source. Market Cap computed from `shares_outstanding × year-end price` using full Yahoo price history. **Book Value Plus Dividends**: total equity + abs(dividends_paid) for that year (undoes dividend deduction from retained earnings, NOT cumulative).
- **Debt display for net cash companies**: Shows "0.0 Years" in green cell with score 100, matching real Toolbox behavior (validated against AMAT, SFM screenshots).
- **Binary debt scoring**: ≤3 years or net cash → 100 (green), >3 years → 0 (red). Intermediate thresholds TBD.
- **Stock split adjustment**: `splits.js` detects splits from EDGAR XBRL data (explicit `StockholdersEquityNoteStockSplitConversionRatio1` tag, with share-count-jump fallback via `dei:EntityCommonStockSharesOutstanding`). No external API needed. `edgarFinancials.js` extracts per-share/share-count fields using `extractAnnualFactOriginal` (prefers earliest filing to avoid double-adjustment from restated comparatives), then applies cumulative split factors. Per-share values ÷ factor, share counts × factor. Runs before derived field computation so auto-computed EPS uses adjusted shares. Cache key includes split count and version (`edgar-statements:TICKER:s3:restated`) so stale data cached before splits loaded or with different version is automatically invalidated.
- **Fiscal year end months**: `extractFiscalYearEnds()` in `edgar.js` extracts the FY end month from XBRL `end` dates. Displayed as abbreviation (e.g., "Sep", "Jan") below each year column in FinancialStatements headers.
- **FinancialStatements UI enhancements**: Sticky header row (years stay visible on vertical scroll), bold/larger year headers (13px/700), comma-formatted numbers throughout, CSV export + column direction toggle toolbar. Filenames include ticker, tab label, layout, and version (e.g., `AAPL_Income_Statement_expanded_restated.csv`). Settings changes (layout, version, view, periods) render immediately via `useEffect` sync without scroll reset — content stays visible during refetch with opacity dimming.
- **Toolbox validation (AAPL)**: App financials compared line-by-line against Rule One Toolbox AAPL export. All major totals match (Revenue, Net Income, Total Assets, Total Liabilities, Stockholder Equity, Investing CF, Change in Cash). Five fixes applied:
  - **Total Debt**: Display now includes lease obligations (operating + finance) to match Toolbox's "Total Debt (Short & Long-Term)" which combines traditional debt + all lease obligations. Uses `total_debt_with_leases` for display. Traditional `total_debt` (no leases) still used internally for Net Debt and scoring calculations.
  - **Net Debt**: Uses traditional debt only (no leases) minus Cash & Cash Equivalents only (no marketable securities). Formula: (ST Debt + Current LT Debt + LT Debt) - Cash & CE. The Toolbox uses two different debt concepts: Total Debt (display, includes leases) vs Net Debt (scoring, excludes leases). Shows "–" when net cash (debt < cash).
  - **Receivables**: Uses broadest available figure — `max(narrow trade + vendor, ReceivablesNetCurrent)`. AAPL: narrow AccountsReceivableNetCurrent + NontradeReceivablesCurrent = ~$70B. SFM: broad ReceivablesNetCurrent = ~$96M. Auto-picks whichever gives the most complete total.
  - **D&A (older years)**: Separated narrow `Depreciation` tag from combined D&A tags. Added `amortization_of_intangibles` field. Computes `D&A = Depreciation + AmortizationOfIntangibleAssets` as fallback when combined XBRL tag is missing (fixes 2016-2017 undercount).
  - **Cache invalidation**: Cache key now includes split count so stale pre-split data is automatically bypassed.
  - **Cost of Revenue auto-compute**: When XBRL CostOfRevenue tag missing (e.g., SFM 2017 and earlier), auto-computes as Revenue - Gross Profit.
  - **LT Debt tag coverage**: Added `LongTermLineOfCredit` fallback tag for companies using credit facilities (e.g., SFM FY2019 had ~$538M revolving credit).
- **Toolbox validation (SFM)**: Second validation against SFM Toolbox export. All major totals match (Revenue, Gross Profit, Pre-Tax Income, Net Income, Total Assets/Liabilities, Equity, Operating/Investing/Financing CF, FCF). Key findings:
  - Total Debt now matches Toolbox (includes lease obligations for display).
  - Net Debt matches Toolbox for scoring years (traditional debt - cash).
  - Operating Income has classification differences (~$5-39M varies by year) where Toolbox reclassifies items above the operating line. Pre-Tax Income matches exactly.
  - Cash Flow D&A differs (app ~$158M vs Toolbox ~$304M for 2025) because Toolbox includes ROU amortization. Operating CF total matches exactly.
- **N-PORT integration built** — 13 of 43 gurus have registered mutual funds that file SEC Form N-PORT (monthly portfolio holdings). N-PORT provides complete fund data including cash/money market positions, derivatives, and net assets — data invisible in 13F filings. `nport.js` engine fetches N-PORT XML from EDGAR, matches the correct series via `seriesId` (trusts have multiple funds under one CIK), parses holdings by category (`STIV`=money market, `DE`/`DIR`=derivatives, `EC`/`EP`=equity, `DBT`=debt). Settings toggle (`enableNport`, on by default) in Settings → Gurus. **GuruPortfolio detail view**: Cash Position stat box with value + % of fund, collapsible "Fund Holdings" section showing cash/money market and derivatives with N-PORT badge and source attribution. **Gurus Directory**: Cash % column with "N" badge for gurus with N-PORT data. `useGurus` hook fetches N-PORT as a non-blocking second pass after 13F data, hydrates from cache on mount. Cache: per-filing (`nport-filing:v1:{fundCik}:{reportDate}`), summary (`nport-summary:v1:{cik}`), series match (`nport-series-match:v1:{accn}`), submissions (`nport-subs:v1:{fundCik}`). **13 guru/fund mappings** stored as `fundCik` + `seriesId` on GURUS array entries.
- **Multi-source analyst estimates built** — `useAnalystData` hook fetches Yahoo Finance + Finviz + GuruFocus in parallel. **Analyst GR priority**: Finviz 5Y EPS growth (true long-term consensus, e.g., AAPL 11.23%, MSFT 18.19%) > GuruFocus analyst estimate > Yahoo next-FY growth (short-term fallback). Analyst GR always updates from fresh data (never stale from saved valuations). FGR radio button shows source badge "(Finviz 5Y)". **Analyst estimates display panel removed** from ValuationCalculators.jsx — analyst data now only feeds the FGR radio group (Analyst GR option). GuruFocus scraping returns 403 (expected — JS-heavy site); works via $25/mo API key (`VITE_GURUFOCUS_KEY` in `.env.local`). Finviz works reliably via `cheerio` HTML parse in Vite middleware. All 3 sources cached independently in localStorage (6hr TTL). `useAnalystEstimates` re-exports from `useAnalystData` for backward compatibility.
- **Valuation tab built** — `Valuation.jsx` container with four sub-tabs: **Growth Rate Analysis** (default — multi-line chart + weighted averages + data table, see above), **Valuation Inputs** (4 historical data tables feeding each calculator), **Valuation Calculators** (hero box showing highest buy price method + 4 calculator sections: 10 Cap, MOS, PBT, Equity Bond), and **Price vs Value** (historical buy price chart — see below). Uses existing `valuation.js` engine + `computeFCFRatio()` from `returnMetrics.js`. **Shared state**: EPS TTM, FGR source (Analyst/Composite/Custom radio group), maintenance %, per-table excluded years (separate Sets for PBT, 10 Cap, MOS, Equity Bond), MARR (shared across MOS + Equity Bond), heroEnabled (which methods contribute to hero box) — all shared across calculators. **10 Cap**: auto-populates from EDGAR TTM (operating CF, CapEx, tax provision, shares outstanding) displayed in millions with comma formatting, all fields user-editable with override pattern (`override ?? default`), only Owner's Earnings and Owner's Earnings Per Share are locked (matching Toolbox lock icon behavior), user-editable % for Maintenance (default 70%). **MOS**: EPS TTM editable, Analyst GR locked (auto-filled), Composite/Custom GR selectable, Future P/E defaults to 2×FGR capped at historical high PE (computed from full Yahoo price history per fiscal year), MARR editable (default 15%), MOS % editable (default 50%). **PBT**: EPS TTM editable, FGR radio interactive, FCF Ratio auto-computed as simple average of per-year FCF/NI ratios with editable override + refresh icon to reset, FCF Per Share editable with refresh icon to reset to computed value, PBT Years editable (default 8), shows PBT at current price in summary. **Equity Bond** (from *The New Buffettology*): grows book value via ROE × retention ratio. Inputs: BVPS (auto from 3yr avg of most recent non-excluded years), Historical Avg ROE (auto from 3yr avg), Retained Earnings Ratio (auto from 3yr avg), Historical Avg P/E (auto from 3yr avg of per-year **average** P/Es — uses mean daily closing price / EPS, NOT high PE — much more conservative), MARR (shared). `eb3yrAvg` memo in Valuation.jsx computes 3-year averages from most recent non-excluded fiscal years, respecting `excludedYearsEB` — serves as both table display column and calculator defaults. Outputs: Equity Growth Rate, Future BVPS, Future EPS, Future Stock Price, Buy Price, Projected Return at Current Price. Engine also has `computePretaxEquityBond()` and `computeBondComparison()` — retained in codebase but not currently wired to UI (Method A Pretax too similar to MOS DCF; Bond Comparison removed alongside). **Hero box** picks highest buy price among enabled methods, shows "Future Price (10yr)" instead of "Sticker Price" when Equity Bond wins. **Hero method selection**: each of the 4 summary cards has a checkbox — unchecking a method dims the card and excludes it from hero calculation (persisted in save). **Summary row**: 4 columns (10 Cap, MOS, PBT, Equity Bond with Buy Price + Projected Return), each with checkbox. All Equity Bond fields use same override ?? default pattern with refresh icons. **Override pattern**: all auto-filled fields use `useState(null)` overrides — effective value = `override ?? default`, overrides reset on ticker change. **Comma formatting**: FieldRow uses focus/blur pattern (raw number when editing, comma-formatted when blurred) to avoid cursor jump issues. **Valuation Inputs sub-tab**: 10 Cap Inputs (4 rows × years + TTM, values in millions), MOS Inputs (EPS + High PE per year), PBT Inputs (5 rows including FCF Ratio = per-year FCF/NI) with click-to-exclude year columns for outlier removal — excluded years recalculate weighted averages and FCF Ratio, Equity Bond Inputs (5 rows: BVPS, ROE, Dividends Per Share, Retained Earnings Ratio, Avg P/E — no TTM column, replaced with **3yr Avg column** showing averages of most recent 3 non-excluded years). All 4 tables support click-to-exclude year columns (independent exclusion Sets per table). **Column direction toggle** — button switches between oldest-first (default) and newest-first ordering; TTM, Weighted Average, and 3yr Avg columns follow direction (always on the "most recent" side). **Composite GR**: average of weighted-average growth rates from Growth Rate Analysis tab (user-selectable from all 8 growth metrics: Book Value, BVPS+Div, Earnings, Pre-Tax Earnings, Op Cash, Revenue, FCF, Retained Earnings — default selection: BVPS+Div, Earnings, Op Cash, Revenue — uses 3-year smoothed rates with linear recency weighting, NOT 10yr CAGRs). Hero box picks highest buy price among enabled methods, labels the method. 10 Cap sticker = price × 2, PBT sticker = price × 2. TTM fallback to latest annual year when quarterly data unavailable. Calls `usePrices(ticker, 'max')` internally for historical PE (same pattern as Insiders). **Two PE computations**: `computeHistoricalHighPE` (max high price / EPS per fiscal year — used for MOS future PE cap) and `computeHistoricalAvgPE` (mean daily closing price / EPS per fiscal year — used for Equity Bond "historically reasonable" PE). **Valuation persistence**: "Save Valuation" button inside the hero box (right-aligned, plus icon, teal → green "Saved!" with checkmark on click for 2s). Persists all override fields + heroEnabled + per-table excluded years to localStorage under `sa-valuation:{TICKER}`. Restores on revisit with "Loaded from save" indicator (shown in sub-tab header). Each ticker has its own saved state. **Input UX**: FieldRow inputs select-all on focus (click to replace), Custom GR uses `type="text"` with `inputMode="decimal"` (no browser spinners). `FGRRadioGroup` called as plain function (not JSX component) to prevent focus loss on re-render.
- **Price vs Value chart built** — `HistoricalBuyPrices.jsx` 4th sub-tab within Valuation. For each fiscal year in EDGAR data, computes buy prices using all 4 methods (MOS, PBT, Ten Cap, Equity Bond) with data available as of that year, overlaid on the daily stock price. **Toggle**: "Single Year" vs "3-Year Trailing" inputs — single uses year Y's actual EPS/FCF ratio/BVPS/retained ratio; trailing uses 3-year average. Ten Cap always uses year's actual total-dollar values. **Rolling FGR**: for each year Y, truncates the growth analysis series to data ≤ Y, computes 3-year smoothed rates + weighted average for each selected composite metric, then averages them — mimics what the Toolbox would have shown at that time. **MOS inputs**: EPS (single or trailing-3yr), Future PE = min(2×FGR, max historical high PE up to year Y), MARR from user settings. **PBT inputs**: FCF ratio (single or trailing-3yr), FCF/share = EPS × ratio. **Ten Cap**: year's actual OpCF, CapEx × maintenance %, tax, shares. **Equity Bond**: BVPS (single or trailing), ROE (trailing 3yr or 5yr of positive years), retained ratio (single or trailing), avg PE = mean of per-year **average** P/Es up to year Y (not high PEs). **Chart**: Recharts ComposedChart — daily stock price as blue area, 4 stepped buy price lines (MOS=green, PBT=orange, Ten Cap=teal, Equity Bond=purple dashed). Buy prices step at each fiscal year end. Method checkboxes toggle lines on/off. Tooltip shows "BUY" when price < buy price. **Data table**: collapsible below chart, Year/Price/FGR/EPS + 4 buy prices, green-highlighted cells when stock was in buy zone. Subtitle shows count of buy-zone years. Serves as valuation sanity check — if stock has never traded in the buy zone within a decade, inputs may be too optimistic.
- **Insiders tab built** — `Insiders.jsx` component rendered as its own top-level Toolbox tab (Overview | Financials | Growth | Valuation | Insiders | Filings). A lightweight summary (4 stat cards: net activity, open market purchases, unique insiders, last activity) also appears in Overview → Trading Activity. Fetches SEC EDGAR Form 4 filings (insider transaction reports) via `insiders.js` engine. **4 sections**: (1) Insider Sentiment Summary — 4 stat cards (net activity 12M, open market purchases 90D, unique insiders, last activity dates), (2) Transaction Snapshot Chart — Recharts `ComposedChart` with red bars (sales), green bars (purchases), stock price line overlay on right Y-axis with **monthly/daily toggle** (monthly = one price point per month; daily = full daily closing prices for accurate price movement, bars still monthly-aggregated placed on last trading day, 6px bar width). **Chart context subtitle** shows active filters inline (e.g., "Open Market Only · Tim Cook"). When a specific insider is selected, shows their total shares held (direct + indirect with breakdown), market value at current price, and as-of date below the chart title. (3) Filters — transaction type dropdown (All/Open Market Only/Purchases/Sales/Awards+Exercises) + insider name dropdown, both apply to chart and table, (4) Transaction Details Table — 11 sortable columns (Trade Date, Insider Name, Title, Trade Type, Price, Shares, Trade Value, % Change, Post-Trade Shares, Price Since Trade, Filing link) with pagination at 50 rows. **Cluster detection** — highlights rows with teal left border when 3+ insiders transact within 5-day window. **Open Market vs Routine distinction** — color-coded trade types (green=Purchase, red=Sale, gray=Exercise/Award). Trade codes: P=Purchase, S=Sale (strongest signals), M=Exercise, A=Award, F=Tax Withholding (routine). **Two-phase loading**: auto-fetches last 12 months on ticker change, "Load Full History" button fetches up to 3 years with progress bar. Renders independently of `edgarStatements` — loads immediately without waiting for XBRL data. Uses `useInsiders` hook + `usePrices` (3y range for price overlay and "Price Since Trade" column). **Price parsing**: null-preserving — distinguishes genuine $0 (awards with `<value>0</value>`) from missing/footnote-only prices (exercises with only `<footnoteId>`). **Footnote price extraction**: when `transactionPricePerShare` has only a `<footnoteId>`, `extractPriceFromFootnote()` looks up the footnote text and extracts dollar amounts via regex. **Exercise price fallback**: for derivative transactions, falls back to `conversionOrExercisePrice` when transaction price is missing. Prices from footnotes/exercise fallback show `*` superscript with tooltip. `priceSource` field tracks origin: `'direct'`, `'footnote'`, `'exercisePrice'`, or `null`. Display uses `!= null` check: $0 shows "$0.00", null shows "--". Cache versioned (`INSIDER_CACHE_V = 'v4'`).
- **Executive Compensation built** — `ExecutiveCompensation.jsx` component in Overview tab (collapsible section). Fetches and parses SEC DEF 14A proxy statements via `compensation.js` engine. **2 sub-tabs**: Key Executives (default), Board of Directors. **Key Executives**: expandable rows with full compensation breakdown (Salary, Bonus, Non-Equity Incentive, Total Cash, Stock Awards, Option Awards, Total Equity, Pension Change, Other Comp, Total Comp) across up to 5 years with trend sparkline bars. Summary row totals all executives. CEO Pay Ratio stat card (e.g., "533:1" for AAPL). Compensation Mix horizontal stacked bars per executive showing salary vs cash incentive vs equity as % of total — directly answers "is compensation tied to long-term performance?" (high equity % = aligned). **Interactive hover tooltip** on mix bar segments: hovering highlights the segment, dims others to 50% opacity, shows styled popup with color swatch + label + dollar amount + percentage (e.g., "Salary: $1,400,000 (2%)"). Tooltip renders outside bar's `overflow:hidden` container to avoid clipping. Comp-to-Revenue ratio in sub-tab bar (computed from `edgarStatements.income[year].revenue`). **Error boundary** wraps component — render crashes show inline error instead of white-screening the app. **Board of Directors**: director compensation table with similar layout. **Parsing v3 overhaul** — v2 had 9 systemic fixes (iXBRL cleanup, nested table isolation, direct cell selection, rowspan tracking, name vs title discrimination, name deduplication, sequential column mapping, value sanity check, innermost table preference). v3 adds 6 more fixes to handle additional real-world SEC proxy HTML patterns (improved audit from ~58% to 83% HTML pass rate across 89 companies): (10) **zero-width character stripping** in `cellText()` — removes `\u200b`, `\u200c`, `\u200d`, `\uFEFF` that made spacer cells appear non-empty, (11) **spacer-rowspan fix** in `parseSummaryCompensationTable()` — many SEC proxies (QCOM, LRCX, etc.) use spacer `<td>` cells with `rowspan` attributes for layout; parser now loops through `allCells` to find the first non-spacer cell with `rowspan > 1` instead of blindly using `allCells[0]` — this was the root cause of 15/17 PARSE_EMPTY failures, (12) **director table exclusion** via salary column requirement — `findSummaryCompensationTable()` now requires a `salary` column in header matching, preventing Director Compensation Tables (which use "fees earned" instead) from being mistaken for Summary Compensation Tables, (13) **full-width name row detection** — rows with fewer than 3 cells are checked for standalone name-only rows (executive name spanning entire row before data rows), (14) **`extractNameFromBlockTags()` function** — aggressive name/title extraction from `<p>`, `<div>`, `<br>` block-level HTML tags, used as a third-tier fallback in `looksLikeName` detection when standard `extractNameTitle` fails (kept separate to avoid regressions in existing code paths), (15) **year-in-name-cell fallback** — when the first data cell doesn't contain a year, checks the name cell itself (some proxies embed the year in the same cell as the executive name), with adjusted `dataStart` index to avoid double-counting. **ECD XBRL fallback** — when HTML table parsing fails (no executives extracted), falls back to parsing ECD (Executive Compensation Disclosure) XBRL data from the `_htm.xml` instance file in the same EDGAR filing directory. SEC mandated ECD XBRL tagging in DEF 14A since FY2022 under Item 402(v) Pay vs Performance. XBRL provides: CEO total comp (`PeoTotalCompAmt`), CEO compensation actually paid (`PeoActuallyPaidCompAmt`), average NEO total comp (`NonPeoNeoAvgTotalCompAmt`), average NEO comp actually paid (`NonPeoNeoAvgCompActuallyPaidAmt`), CEO name (`PeoName`), NEO names (via `NonPeoNeoMember` dimension), TSR (`TotalShareholderRtnAmt`), Peer Group TSR (`PeerGroupTotalShareholderRtnAmt`), Net Income (`NetIncomeLoss`). **Limitations**: no salary/bonus/stock/option breakdown (total comp only), non-CEO NEOs are averaged (not individual), only available since FY2022. Data marked with `source: 'xbrl-pvp'` and `_isAverage: true` on NEO entries. `pvpData` carries TSR/peer TSR/net income per year. **Expected results with fallback**: ~84 PASS (74 HTML + 10 XBRL_FALLBACK) / 4 WARN / 1 FAIL (GE — entity mismatch, CIK maps to old GE Capital Corp). Previously failing companies rescued by XBRL: AMAT, MNST, PFE, ABBV, XOM, HON, DE, RTX, NOW, ZS. Fetches up to 3 DEF 14A filings for 5+ year history. Renders independently of `edgarStatements`. Cache: per-filing `comp-proxy:v2:{accessionNumber}` (10yr TTL, immutable) + per-ticker `comp-summary:v2:{TICKER}` (24hr) → IndexedDB `comp-data` store.
- **Compensation Audit built** — In-app audit at `/comp-audit` (Settings → Tools → "Run Compensation Audit"). Validates executive compensation parsing across all 89 validation companies — checks DEF 14A filing discovery, table detection, column matching, and parse quality. `auditCompensation()` export in `compensation.js` runs the full pipeline per company with `diagnoseSummaryCompensationTable()` diagnostic function that collects heading texts found near tables, column header match attempts, and failure reasons. Results classified into 9 categories: PASS, PARTIAL, XBRL_FALLBACK (HTML parsing failed but ECD XBRL succeeded — shows as teal badge, counts as pass), NO_CIK, NO_FILINGS, FETCH_FAILED, TABLE_NOT_FOUND (heading text didn't match), HEADER_MISMATCH (heading matched but columns didn't), PARSE_EMPTY (table found but no executives extracted), ERROR. `CompAudit.jsx` renders results with progress bar, summary stats (Pass/Partial/Fail/Rate/Total), failures grouped by category with expandable diagnostics (sample heading texts, column header texts, match counts), **JSON download button** (exports full audit results as `comp-audit-YYYY-MM-DD.json` for troubleshooting), and 7-section troubleshooting guide. **Latest results**: ~84 PASS (74 HTML + 10 XBRL_FALLBACK) / 4 WARN / 1 FAIL (~94% pass rate, up from 83% before XBRL fallback, up from initial ~58%). Only remaining failure: GE (CIK entity mismatch). Designed for iterative parser improvement: run audit → identify patterns → fix → re-run.
- **Ticker Data Audit built** — Per-ticker pre-research data quality check, accessible as 7th tab in Toolbox (Overview | Financials | Growth | Valuation | Insiders | Filings | Audit). `tickerAudit.js` engine orchestrates 8 check groups sequentially: (1) **Company Info** — CIK resolution, name, SIC, exchange, FY end, (2) **Financial Statements** — reuses `validateCompany()` for identity checks, completeness, derived fields, YoY sanity, retained earnings reconciliation + `computeKeyMetrics()` metric count + optional Frames cross-check and quarterly roll-up via checkboxes, (3) **Stock Splits** — detection count and method (XBRL tag vs share count jump), (4) **Price Data** — Yahoo data points, date range, freshness, latest close, (5) **Insider Transactions** — Form 4 filing count, unique insiders, open market activity, (6) **Executive Compensation** — DEF 14A parsing success, exec/director count, years, CEO pay ratio, parse source (HTML vs XBRL), (7) **Analyst Estimates** — all 3 sources in parallel (Yahoo + Finviz + GuruFocus), derived analyst GR, (8) **Guru Holdings** — which tracked gurus hold the stock (from cached data, SKIP if not loaded). Auto-runs on tab open. Progress grid shows each group lighting up as it completes. Overall status: PASS/WARNINGS/FAIL (SKIP groups excluded). If CIK resolution fails, EDGAR-dependent groups auto-skip. Cached data makes re-runs near-instant. `TickerDataAudit.jsx` component renders independently of `edgarStatements` gate. **Key thresholds**: Retained earnings reconciliation caps at `warn` (never `fail`) since buyback-heavy companies always diverge; YoY ≤2 flags = `warn`, >2 = `fail`; Key Metrics ≥30 non-null = `pass`. `computeKeyMetrics()` returns `{ years, metrics }` wrapper — metrics data accessed via `result.metrics[year]` with nested category objects (perShare, shares, liquidity, profitability, debt, operating, price).
- **Industry Information built** — `IndustryInformation` inline component in Toolbox.jsx Overview tab (collapsible section). Matches Rule One Toolbox layout exactly: 2-column display with Sector, Industry Group, Industry (left) and NAICS, CIK Number (right). Classification derived from EDGAR SIC code via `sicClassification.js` engine — static mapping of ~250 four-digit SIC codes to Morningstar-style taxonomy (11 sectors), with 2-digit major group fallback and EDGAR `sicDescription` final fallback. NAICS codes from SIC-to-NAICS crosswalk. **Bonus "Company Details" section** below a divider adds: SIC Code + description, State of Incorporation, Fiscal Year End (formatted as month name), Website (clickable teal link). All data sourced from EDGAR `fetchCompanyInfo()` — no new API calls needed. CIK displayed without leading zeros. Verified against Rule One Toolbox screenshots (AAPL, MNST, AMAT, SFM).
- **Guru ticker resolution fix** — Ticker resolution (`resolveTickersForHoldings`) moved from `useGurus.js` hook to `gurus.js` engine level. Previously, resolution ran in the React hook AFTER the engine cached data, so cached holdings never had tickers — guru portfolios displayed truncated SEC issuer names ("COCA C", "BANK A") instead of symbols (KO, BAC). Fix: self-healing pattern at engine level — `fetchGuruWithChanges()` resolves before caching new data, and `loadCachedActivities()`/`loadCachedPortfolios()` detect and resolve cached data lacking tickers on hydration. Resolved data is re-cached so subsequent loads are instant. `findGurusOwning()` now searches by ticker (exact match) in addition to issuer name and CUSIP. No cache version bump needed — old data silently upgrades.
- **Research tab memory** — `Toolbox.jsx` saves current report ID to localStorage (`sa-last-research`) on view. `App.jsx` `ResearchRedirect` component checks for last-viewed report when navigating to `/research` with no ID — redirects to last report if valid, otherwise shows empty state.
- **Filings tab built** — `Filings.jsx` component in Toolbox (6th tab: Overview | Financials | Growth | Valuation | Insiders | Filings). Fetches filing list from EDGAR submissions endpoint via `fetchFilings()` in `edgar.js`. Filter pills (All/Annual/Quarterly/Current/Proxy/Insider/Ownership) with counts, year dropdown, color-coded form types, 8-K item tooltips, pagination (50/page). Each row has SEC EDGAR link (↗) and **markdown conversion** button (MD column). Renders independently of `edgarStatements` — loads immediately without waiting for XBRL data.
- **Filing HTML-to-Markdown engine built** — `filingMarkdown.js` lazily fetches SEC filing HTML from EDGAR, strips iXBRL markup, converts to clean markdown via `turndown` + `turndown-plugin-gfm`, and caches permanently in IndexedDB (`filing-markdown` store, 10-year TTL — filings are immutable). Designed for AI consumption during report generation (Stages 5-7) — the user reads PDFs directly. **~5x cheaper than PDF, ~15x cheaper than raw HTML** for token usage. Custom table rule handles complex EDGAR tables with colspan/rowspan (GFM plugin only handles simple tables). `cleanEdgarHtml()` uses `getElementsByTagName` for namespaced iXBRL tags (`ix:hidden`, `ix:nonfraction`, etc.) — `querySelectorAll` fails on colon-namespaced selectors. Exports: `fetchFilingMarkdown(filing)` (single), `fetchFilingMarkdownBatch(filings, onProgress)` (sequential with 120ms rate limit). Cache key: `filing-md:v1:{accessionNumber}`. **UI features**: per-row cached status indicator (green dot + char count), click to preview markdown in modal, reconvert button to clear cache and re-run conversion. Dependencies: `turndown`, `turndown-plugin-gfm`.
- **IndexedDB cache migration complete** — Large caches migrated from localStorage to IndexedDB to eliminate quota pressure (localStorage 5-10MB limit). New `cacheStore.js` follows `priceStore.js` pattern (`thes1s-cache` database, 7 object stores). `cache.js` rewritten with three-tier architecture: memory Map → IndexedDB (large keys via prefix routing) → localStorage (small keys). New `cacheGetAsync(key)` for async IDB reads (all callers already in `async` functions — mechanical `await` addition). `cacheSet()` signature unchanged — fire-and-forget IDB writes. `hydrateFromIDB(store, keys)` for bulk-loading on mount (single IDB transaction). One-time migration removes old `sa-cache:` entries from localStorage (marker: `sa-cache-idb-migrated-v1`). All engine files updated: `edgar.js`, `edgarFinancials.js`, `edgarFrames.js`, `gurus.js`, `nport.js`. `loadCachedPortfolios()`, `loadCachedActivities()`, `loadCachedNportSummaries()` converted to async. `useGurus.js` hydration is async. **"Last refreshed" UI**: `fetchedAt` timestamps on all cache entries. `timeAgo()` helper in `Gurus.jsx` and `GuruPortfolio.jsx`. Gurus Latest tab shows "Last refreshed: Xm ago" in header. GuruPortfolio shows "Data fetched: Xm ago" below filing date. `lastFetchedAt` state in `useGurus` hook, set after fetches and estimated from cache on hydration.
- **Guru 13F validation complete** — `export-gurus.mjs` exports all 43 gurus to JSON, `validate-gurus.mjs` runs self-consistency checks (portfolio value sum, percentage sum, CUSIP6 duplicate detection, position count, implied price bounds, options leak check). **Results: 41/43 passed.** Two failures are data oddities in the raw 13F filings (Kahn Brothers: trust unit with $0 implied price; Einhorn: Katapult micro-cap at $0.004/share). 159 share classes aggregated across all gurus. No options leaked, no CUSIP6 duplicates in active holdings, all portfolio math checks pass. `parseInfoTable()` fix: `Array.from()` wrapper on `getElementsByTagNameNS` result for Node.js/xmldom compatibility (browser NodeList is iterable, xmldom's is not).
- **Validation system built — 3 layers + quarterly, 89 companies, all complete.** Full details in `knowledge/validation-summary-2026-03-10.md`. EDGAR engine is **production-ready** — no data bugs found, all discrepancies explained by methodology/classification/timing differences.
  - **Layer 1 — EDGAR self-validation** at `/validation` route. 8 checks: accounting identities (A=L+E, GP=Rev-COGS, etc.), completeness (13 critical fields), derived field consistency, YoY sanity flags, Frames API cross-check (9 tags × 5 years), retained earnings reconciliation (Beginning RE + NI - Dividends ≈ Ending RE, 10% tolerance), operating income identity (OpInc ≈ GP - Itemized OpEx, 5% tolerance), quarterly roll-up (Q1+Q2+Q3+Q4 ≈ FY, optional checkbox). Final results: 23 PASS / 48 WARNINGS / 18 FAIL. Avg identity 98%, completeness 94.7%, derived 97.5%, frames 84.9%. All 18 FAILs explained by non-calendar FY Frames quirks or corporate events (ABBV Allergan reclassification, GE Aerospace spinoff). "Skip Frames" option for faster local-only pass. "Include Quarterly Roll-Up" checkbox for quarterly validation.
  - **Quarterly roll-up validation** — 89 companies, 12,037 checks. **98.6% match rate** (11,872 matches). 46/89 companies at 100%. 83/89 at ≥95%. Errors concentrated in older FY cash flow sub-totals (Financing CF: 38 errors, Investing CF: 33) and merger-affected companies (RTX worst at 83.9%). Revenue and Net Income have only 28 and 12 errors respectively. Retained earnings reconciliation: 83.2% pass (208 warnings / 1,237 checks — expected due to buybacks, comprehensive income adjustments). Results in `validation/reports/quarterly-validation.json`.
  - **Layer 2 — Financial statements vs yfinance** (`validation/layer2_statements.py`). 50 fields × 89 companies × ~4 years = 18,112 comparisons. **77.1% exact match, 82% within 5%.** Critical scoring fields (Revenue, Net Income, OCF, Equity, EPS, Shares, Dividends) all >87% exact match with <3% avg diff. mstarpy tested as secondary source but unreliable (34.4%, returns wrong entity data for some companies). FY alignment fix: bidirectional year-offset fallback for non-December FY companies.
  - **Layer 3 — Key metrics vs yfinance `.info`** (`validation/layer3_metrics.py`). 11 derived metrics × 89 companies = 932 comparisons. 36.8% exact match — lower rate expected because yfinance returns TTM values while our metrics are annual FY. Top metrics (current ratio 72.7%, EPS 67.4%, profit margin 67.4%) match well given timing gap.
  - **Validation infrastructure**: esbuild bundler (`validation/scripts/bundle.mjs`) compiles browser ES modules to Node.js (exports `fetchEdgarStatements`, `fetchEdgarQuarterly`, `computeKeyMetrics`, `validateCompany`, plus guru engine exports). Batch exporter (`validation/scripts/export-financials.mjs`) produces 89 JSON files (supports `--quarterly` flag). Quarterly batch runner (`validation/scripts/run-quarterly-validation.mjs`). Guru exporter (`export-gurus.mjs`, resumable, `--force` to re-export) + guru validator (`validate-gurus.mjs`, 6 self-consistency checks). All cached data in `validation/data/`, reports in `validation/reports/`.
- **Validation fixes applied (Layer 1 iterative runs)** — Run 1: 11 PASS/56 FAIL → Run 3: 23 PASS/18 FAIL. Avg identity 84.8%→98%, avg derived 57.2%→97.5%. Key fixes:
  - **Liabilities auto-derivation**: Three-tier: (1) direct `Liabilities` tag, (2) `CL + NCL`, (3) `L&E - Equity - NCI`. Fixed 39 companies.
  - **A=L+E identity check**: Added NCI to equity side. 1% tolerance for mezzanine equity.
  - **Invested Capital validation**: Formula aligned (Equity + LT Debt). Derived match: 6%→100%.
  - **Net Income check**: Uses ProfitLoss + 5% tolerance for discontinued ops. Pass: 58.5%→91.7%.
  - **LT Debt removed from critical fields**: Null = zero debt, not missing. Fixed 59 false flags.
  - **SKIP status**: Delisted/no-data companies excluded from aggregates.
- **Known remaining Toolbox differences**: (1) Payables disaggregation — app shows narrower `AccountsPayableCurrent`, Toolbox shows broader amount; Current Liabilities totals match. (2) Operating CF sub-line items (D&A, working capital components) differ in classification; Operating CF total matches. (3) Interest Income/Expense breakdown varies by company — partially resolved by Original/Restated toggle (Original shows values that Restated may blank out for recent years); Pre-Tax Income totals match. (4) PP&E vs Operating Lease ROU classification — app separates, Toolbox combines; differences visible in Original vs Restated (e.g., AAPL 2022 Gross PPE ~$124B Original vs ~$114B Restated due to reclassification); Non-Current Asset totals match. (5) SGA for companies that changed expense reporting structure (e.g., SFM pre-2018); Operating Income from XBRL is correct.

---

## Research Workflow (3-Stage Gated)

The core workflow follows the Rule One Master Research Workflow (`knowledge/workflow.md`). Each stage is a gate — the user must approve before the next stage unlocks.

### Stage 1 — One Pager (Filter)
**Template**: `knowledge/stage-1-one-pager/template.md`
**Curriculum**: `knowledge/stage-1-one-pager/the-search-begins.md`
**Reference files**: `knowledge/references/` (financial-statements.md, tools-for-analysis.md, guru-list.md)
**Example**: `knowledge/stage-1-one-pager/examples/LULU One Pager.PDF`
**Purpose**: Quick screen. Is this company worth deeper research?
**Sections**: Company Info, Minimum Standards, Meaning KPIs, Management KPIs, Growth Metrics, Company Summary
**Pass/Fail**: If it doesn't meet minimum standards → discard and move on.

### Stage 2 — Pitch Deck (Research)
**Template**: `knowledge/stage-2-pitch-deck/template.md`
**Curriculum**: `knowledge/stage-2-pitch-deck/pitch-deck-I.md` through `pitch-deck-IV.md`
**Reference files**: `knowledge/references/` (all 4 files)
**Example**: `knowledge/stage-2-pitch-deck/examples/LULU/` (Pitch Deck PDF + resources folder with FGR analysis, market research)
**Purpose**: Build structured 10-part business case.
**Sections**: Radar (guru ownership), Simple & Predictable, Dominant Market Position, Barriers & Moats, FCF, Management, ROE/ROIC/ROA & Debt, Balance Sheet, PEST Risks, Valuation (MOS + PBT + Ten Cap)
**Gate**: Escalate only if durable thesis exists.

### Stage 3 — Full Story (Conviction)
**Template**: `knowledge/stage-3-full-story/template.md`
**Curriculum**: `knowledge/stage-3-full-story/story-form-I.md`, `story-form-II.md`, `resources.md`
**Reference files**: `knowledge/references/`, `knowledge/stage-2-pitch-deck/pitch-deck-IV.md`
**Example**: `knowledge/stage-3-full-story/examples/LULU/LULU Story Form.pdf` (50 pages)
**Purpose**: Conviction engineering. Final gate before capital deployment.
**Sections**: Event Analysis, Meaning (15-point checklist), Moat (15-point checklist), Management (13-point checklist), Valuation Confirmation (industry outlook, company outlook, historical growth, FGR derivation, growth funding, buy prices with sensitivity tables, organic vs acquisition growth), Inversion & Rebuttal, Initial Trading Strategies, Historical Price-to-Value Analysis, Trading Strategy, Investment Strategy (PACE Plan)
**Requirement**: All inversions addressed, backtesting complete, exit defined before entry.

---

## FGR (Future Growth Rate) — Critical Concept

FGR is NOT a formula — it's an informed assessment using 5 inputs:

1. **Rear View Mirror** — Historical composite growth rate from Rule One Toolbox (BVPS+Dividends, Earnings, Operating Cash, Revenue). Exclude COVID outlier years (e.g., 2021). LULU example: 20.75%
2. **Market Relativity** — Compare company's cumulative stockholder return vs S&P 500 and sector index (from 10K filings)
3. **Company Guidance** — Management's stated growth plans (e.g., LULU's "Power of Three" = 15% growth target)
4. **Sector/Industry** — Industry CAGR from trade journals/market research (e.g., activewear 9-9.82% globally)
5. **Analysts** — Seeking Alpha quant rating, SA analyst rating, Wall St consensus, revenue growth estimates

Average the quantifiable inputs → FGR. LULU example: avg ~14.92%, used conservatively as 13%.

FGR feeds ALL three valuation calculators. The app must help users derive and document each input.

---

## Valuation Calculators

Four valuation methods, all computed in Stage 2 (Pitch Deck) and confirmed in Stage 3 (Full Story):

### MOS (Margin of Safety)
- Growth Rate = FGR (conservative)
- EPS: TTM or 3-year average (user documents which and why)
- Future P/E: ≤ 2× Growth Rate, capped at historical high
- MARR = 15%
- Sticker Price → MOS Price (50% discount)
- LULU example: 13% FGR, $13.74 EPS (3yr avg), PE 30 → MOS $149.88

### PBT (Payback Time)
- FCF Ratio (FCF / Earnings) — exclude outlier years
- FCF per share (user documents if using toolbox default or custom)
- Years to payback (target ≤ 8 years)
- LULU example: 0.92 FCF ratio, $12.64 FCF/share → PBT $182.23 (8.13 years)

### Ten Cap (Owner Earnings)
- Cash from Operations
- CapEx → Maintenance CapEx % (often 70% assumed when not disclosed in 10K)
- Tax Provision
- Owner Earnings = Cash from Ops - Maintenance CapEx + Tax Provision
- Ten Cap Price = 10 × (Owner Earnings / Shares Outstanding)
- LULU example: $2,090.70 OE, 117.91 shares → Ten Cap $177.32

### Equity Bond (from *The New Buffettology*)
The fourth core valuation method, derived from Mary Buffett & David Clark. Treats a stock as a bond whose coupon grows with retained earnings.
1. Current BVPS (book value per share)
2. Historically reasonable ROE
3. Retained earnings-to-net income ratio (what % do they keep vs pay out?)
4. Equity growth rate = retained earnings ratio × average ROE
5. Grow book value 10 years at equity growth rate
6. Future earnings = future book value × historically reasonable ROE
7. Future price = future earnings × historically reasonable P/E
8. Back-track to present value at MARR to get current buy price
- SFM example: bullish $335.70 / conservative $194.90 (15-23% projected return)
- Can give meaningfully different perspective than MOS/PBT/Ten Cap — especially useful for companies with high ROE and strong retained earnings reinvestment

### Bond Comparison Table
Compare the stock's EPS yield (EPS / market price) against:
- 10-year Treasury bill yield
- 10-year high-quality corporate bond yield
Shows whether the stock is the "best option" for your money at current prices. From Graham/Buffett methodology.
- SFM example: 7.25% EPS yield at $32 vs T-bill 3.75% vs corporate 4.88% → stock is best option

### Sensitivity Tables
The app should generate valuation matrices with multiple inputs:
- MOS & PBT: vary FGR (e.g., 13% vs 15%) and EPS (3yr avg vs TTM)
- Ten Cap: vary Maintenance CapEx % (e.g., 50% vs 70%)
- Equity Bond: vary ROE assumption and retained earnings ratio
- Shows range of buy prices (LULU: $150-$215)

---

## Knowledge Base

All Rule One methodology lives in `knowledge/`. Organized by stage. These files are reference material — Claude reads them to understand methodology, not to display to users.

```
knowledge/
├── workflow.md                           — Master Research Workflow (stage progression rules)
├── references/                           — Cross-stage reference files
│   ├── advanced-financial-analysis.md    — Detailed financial statement analysis guide
│   ├── capex-cash-flow-explained.md      — CapEx definition, FCF formula, maintenance vs growth CapEx
│   ├── consolidated_vs_expanded_financial_statements.md — Consolidated vs Expanded layout differences
│   ├── edgar-taxonomy-research-report.md — Comprehensive EDGAR→R1 Toolbox/Morningstar mapping audit (~100 XBRL tags)
│   ├── edgar-xbrl-taxonomy.md            — XBRL tag reference with fallback chains per financial line item
│   ├── financial-statements.md           — FGR methodology, Big 4 growth rates
│   ├── guru-list.md                      — 43 named Gurus for 13F lookup
│   ├── morningstar_original_vs_restated_financials.md — Original vs Restated version differences
│   └── tools-for-analysis.md             — 3 Ms framework (Moat, Management, MOS)
├── stage-1-one-pager/
│   ├── template.md                       — One Pager execution template
│   ├── the-search-begins.md              — Curriculum: how to find companies
│   └── examples/
│       └── LULU One Pager.PDF
├── stage-2-pitch-deck/
│   ├── template.md                       — Pitch Deck execution template
│   ├── pitch-deck-I.md                   — Curriculum: Radar, Simple & Predictable, Market Position
│   ├── pitch-deck-II.md                  — Curriculum: Moats, FCF
│   ├── pitch-deck-III.md                 — Curriculum: Management, ROE/ROIC/ROA, Balance Sheet, PEST
│   ├── pitch-deck-IV.md                  — Curriculum: Valuation (MOS, PBT, Ten Cap calculations)
│   └── examples/
│       └── LULU/
│           ├── LULU Pitch Deck.pdf       — 20-page completed pitch deck
│           └── LULU resources/
│               ├── LULU_FGR.md           — FGR calculation spreadsheet
│               ├── LULU FGR Analysis.pdf — 5-page FGR methodology walkthrough
│               └── sample-activewear-market-analysis...pdf — 71-page Grand View Research report
├── stage-3-full-story/
│   ├── template.md                       — Story Form execution template
│   ├── resources.md                      — Story Form supplemental resources
│   ├── story-form-I.md                   — Curriculum: sections 1-4 methodology
│   ├── story-form-II.md                  — Curriculum: sections 5-8 methodology
│   └── examples/
│       └── LULU/
│           └── LULU Story Form.pdf       — 50-page completed story form
└── pre-course-examples/                  — User's own research from BEFORE the course (different structure)
    ├── My Old Template.pdf               — 14-page "Investment Checklist" — 5 pillars (Meaning, Moat, Management, Valuation, Inversion)
    ├── EW (2022)/                        — Edwards Lifesciences (medical devices, heart valves)
    │   ├── Edwards Lifesciences.pdf      — 21-page raw working checklist (color-coded annotations)
    │   └── Official EW Investment Thesis.pdf — 14-page polished thesis (clean narrative)
    ├── SFM (pending)/                    — Sprouts Farmers Market (grocery/retail)
    ├── CELH (pending)/                   — Celsius Holdings (energy drinks/beverages)
    └── TPL (pending)/                    — Texas Pacific Land (land/resources)
```

---

## What the App Must Replicate (Learned from LULU Examples)

These patterns were observed across the user's real LULU analysis and must be built into the app:

1. **FGR derivation workflow** — Guide user through 5 inputs (Rear View Mirror, Market Relativity, Company Guidance, Sector/Industry, Analysts) with sources for each
2. **Sensitivity/matrix tables** — Auto-generate valuation tables varying FGR and EPS/CapEx inputs
3. **Market share ceiling analysis** — Calculate current vs projected market share to prove growth rate doesn't require unrealistic dominance
4. **Section-level CONCLUSION checklists** — Each major section (Meaning, Moat, Management, Valuation) ends with a pass/fail conclusion that mirrors the template
5. **Inversion & Rebuttal structure** — Source bear-case articles/analyst reports, document specific rebuttals for each
6. **Visual evidence** — Google Trends, buyback charts, ROE/ROIC/ROA trend lines, NPS comparisons, cumulative stockholder return, industry market projections, revenue/earnings/FCF bar charts
7. **Multi-source verification** — Cross-reference claims from 2-3+ sources (e.g., market size from Grand View, Fortune Business Insights, market.us)
8. **Iterative completion** — Reports are not fill-once-and-done. Some sections (Trading Strategy, PACE Plan) may stay incomplete until the user has more data
9. **Tone** — Thorough but conversational. Plain language. Cite specific numbers. OK to say "I don't know yet" or "will revisit when X happens"
10. **Guru tracking** — Note specific gurus buying, their average prices, and portfolio percentages (from 13F filings)

---

## User's Pre-Course Research Style (Learned from Old Template + EW Analysis)

The user has been doing deep Buffett-style analysis for years before taking Phil Town's course. His pre-course examples follow a different structure but share the same intellectual DNA. The app must accommodate patterns from BOTH the course methodology AND the user's own approach.

### Pre-Course Examples
Located in `knowledge/pre-course-examples/`. These do NOT follow the one pager → pitch deck → story form structure. They use the user's own "Investment Checklist" template organized around 5 pillars: Meaning, Moat, Management, Valuation, Inversion.

**Files**:
- `My Old Template.pdf` — 14-page Investment Checklist (template with prompts, ratio benchmarks, error checklists)
- `EW (2022)/Edwards Lifesciences.pdf` — 21-page working checklist (raw research with colored annotations)
- `EW (2022)/Official EW Investment Thesis.pdf` — 14-page polished thesis (clean narrative version of same analysis)
- *(3 more company examples pending — SFM, CELH, TPL — will be added in future sessions)*

### The User's Old Template (Investment Checklist) — 5 Pillars

The template is a hybrid checklist + study guide. Each section has: (a) educational prompts in black text, (b) specific ratio thresholds/benchmarks, and (c) "error checklists" listing conditions under which your analysis will be wrong.

**1. Meaning** (10-point checklist)
- Circle of competence, understand revenue sources, describe in one sentence
- Industry durability (will it be around in 10 years?), economic cycles, growth peak analysis
- KPIs for the industry, key ongoing risks
- Error checklist: edge of competence, no gurus buying, industry on decline, unfriendly unions, didn't do inversion, didn't read 10K footnotes

**2. Moat** (deep financial statement analysis + 7 general moat questions)
- **Income Statement benchmarks**: gross margin ≥40%, SGA/gross ≤30%, R&D/gross ≤10%, depreciation/gross ≤15%, interest/operating ≤15%, net margin ≥20%, consistent earnings growth over 10 years
- **Balance Sheet analysis**: cash growth over 10 years, inventory growth parallel to earnings, net receivables to sales ratio (compare to competitors), PPE trends, goodwill analysis (are acquisitions adding DCA?), intangibles, long-term investments, ROA (high but not too high)
- **Liabilities**: short-term vs long-term debt ratio, debt payable within 1-4 years of earnings, treasury-adjusted DTE <0.8, retained earnings growth (THE most important balance sheet number for moat), treasury shares presence = buyback history
- **Cash Flow**: CapEx/net income over 10 years (≤50% good, ≤25% great), buyback history, operating cash growth
- **Growth rates in order of importance**: ROE → EPS → Sales → Free cash flow (should move in parallel)
- **4 types of durable competitive businesses**: (1) repetitive consumer need with brand appeal, (2) advertising businesses, (3) repetitive consumer services, (4) low-cost producers
- **6 moat types**: Brand, Price, Secrets/IP, Toll Bridge, Switching, Network
- Error checklist: moat not intrinsic, not durable, not widening, EPS growth from buybacks only, Big 4 not growing, FCF unpredictable, cheap foreign competition

**3. Management** (CEO research + board analysis)
- CEO: letter to shareholders, interviews, insider trading (<30% selling), founder status, significant stake, candid about bad news, reasonable pay (compare to industry), compensation tied to long-term performance
- Board of Directors: who they are, how they got there, are they owners, experience level
- 11-point checklist: little/no debt, ROIC high and consistent (10% good, 20% great), ROE ≥15% (20% great), small maintenance capex, FCF ≥75% of earnings, owner earnings ≥75%, CEO integrity + track record, specific audacious goal, reasonable pay, management buying stock when cheap, executives own <3% of company
- Error checklist: ROE/ROIC declining, CEO not owner-operator, CEO self-interested, FOG in letters, selling >30%, glossing over problems, debt >2 years FCF, loan covenants close to breach

**4. Valuation** (4 methods — more than the course teaches)
- **DCF/MOS**: Growth rate = EPS + BVPS growth rate (average of 10/7/5/3 year periods). Future P/E ≤2× growth rate. MARR = 15%. Sticker → 50% off = MOS price.
- **Owner Earnings / Ten Cap**: Calculated TWO ways:
  - *Rule One Workshop method*: Pretax income + D&A - income tax + change in payables - change in receivables - maintenance fund = Owner Earnings. ×10 = Ten Cap price.
  - *Intelligent Investor (Graham) method*: Operating income + D&A of goodwill - federal income tax - stock option costs - unsustainable pension income (>6.5%) - maintenance fund = Owner Earnings. ×10 = Ten Cap price.
  - The user calculates BOTH and compares. The app should support both methods side by side.
- **Payback Time**: Free cash flow growing at historical FCF growth rate, summed for 8 years. Target ≤8 years.
- **Equity Bond** (from *The New Buffettology* — NOT in the course templates):
  - Current BVPS → historically reasonable ROE → retained earnings ratio → equity growth rate → grow equity 10 years → future earnings from future book value → future price using reasonable P/E → back-track to current value at MARR.
  - This is a unique Buffett method the user learned from Mary Buffett's book. The app should include this as an optional 4th valuation method.
- **Bond Comparison table**: Compare stock's EPS yield vs 10-year T-bill vs 10-year high-quality corporate bond. Shows if stock is "best option" for your money. (Also from Graham/Buffett, not in course.)
- Error checklist: can't calculate owner earnings, no event/price drop, event may permanently damage business, too complex to understand

**5. Inversion**
- Google "short [company]" to find bear cases
- Check 10K risk factors, compare to competitors' risk factors
- Seeking Alpha articles for rebuttals
- International exposure (especially China)
- Top 3 bull-case inversions + top 3 short-seller inversions, each needing fact-based rebuttals

### EW Analysis (2022) — What It Reveals About User's Process

**Two-artifact workflow**: The user naturally creates (a) a raw working checklist with color-coded status (green = answered, red/orange = concerns/TBDs) and (b) a polished investment thesis document. The app should support both a working view and a clean export view.

**Company**: Edwards Lifesciences (EW) — medical device company, heart valves and critical care
**Context**: User was an EW employee at the time, giving firsthand knowledge of culture, campus, and management. This shows the user leverages personal experience when available.
**Date**: October 2022

**Key analytical patterns observed**:
- **Always benchmarks against 2-3 competitors**: EW vs Abbott Labs vs Medtronic on every metric (ROE, ROA, R&D spend, receivables, depreciation, CEO pay ratio)
- **Recession resilience testing**: Checked 2008/9 and 2020 pandemic performance. Sales grew through both. Noted it took until 2014 to see double-digit growth again post-2008.
- **TAM analysis**: $8.6B current → $20B by 2028, EW at 60% market share. Cross-referenced with Fortune Business Insider ($16B by 2026, 11.7% CAGR).
- **Outlier identification**: Abbott litigation ($400M one-off), 2017 tax law changes — excluded from trend analysis
- **Dual Owner Earnings calculation**: Rule One method = $1.51-1.68B (Ten Cap $24-27/share). Graham method = $1.17-1.36B (Ten Cap $19-22/share). Presented as a range, not a single number.
- **Growth rate derivation**: Earnings 25.25%, Operating cash 21.94%, Sales 12.22% → Average 19.8% → Used 20%
- **Acquisition discipline**: Cataloged all 9 acquisitions over 22 years ($1.15B total), noted they're all in core heart valve/monitoring space
- **Deep management research**: Profiled every board member individually (ownership, how shares were acquired, relevant experience). Noted CEO pay ratio (186) vs Abbott (256) and Medtronic (215). Tracked insider selling patterns.
- **Red flags documented honestly**: Management sold >1M shares in past year, R&D at 17% vs competitors' 7%, PPE growing at 18% CAGR, CEO doesn't write shareholder letter, buybacks at inflated prices
- **Valuation conclusion**: MOS $75, PBT $66, Ten Cap $19-27. Stock at $85.95. Concluded 30-50% undervalued.

### Implications for App Design

These patterns from the user's actual research process (beyond what the course templates prescribe) mean the app should support:

1. **Working view vs. clean export view** — Two modes for each report. Working view has color-coded status, TBDs, and notes. Export view is a polished narrative.
2. **Competitor benchmarking** — Every financial metric should have fields for 2-3 competitors for side-by-side comparison.
3. **Dual Owner Earnings methods** — Rule One Workshop method AND Graham/Intelligent Investor method, displayed together.
4. **Equity Bond valuation** — Core 4th valuation method (from *The New Buffettology*), equal standing with MOS/PBT/Ten Cap.
5. **Bond Comparison table** — Stock EPS yield vs T-bill vs corporate bond.
6. **Acquisition history tracking** — Table of all acquisitions (date, target, price, strategic rationale).
7. **Section-level status indicators** — Green/yellow/red or complete/in-progress/TBD for each checklist item.
8. **Outlier flagging** — When calculating growth rates or averages, ability to exclude specific years with documented reason (e.g., "2020 excluded — COVID" or "2020 excluded — Abbott litigation").
9. **Recession resilience section** — How did the company perform in 2008/9 and 2020? Standard question in every analysis.
10. **Management deep-dive** — Individual profiles for each board member and corporate officer, including share ownership and how shares were acquired.
11. **Honest red flag tracking** — Explicit section for documenting concerns/red flags, even when the overall thesis is bullish. User doesn't sugarcoat.
12. **Valuation as ranges, not single numbers** — Present buy prices as ranges based on different calculation methods and inputs.
13. **Industry-contextual benchmarking** — Financial benchmarks (gross margin ≥40%, R&D ≤10%, etc.) are starting points, NOT pass/fail rules. Every metric must be interpreted within the company's specific industry. SFM's ~30% gross margin is excellent for grocery; MU's 43% is strong for semis; ODFL's operating ratio matters more than raw margin in LTL freight. The app should pull industry norms and benchmark against actual competitors, not just flag numbers against generic thresholds.
14. **Reference/citation system** — Support formal source tracking with numbered references (SEC filings, articles, reports). The ODFL analysis cited 40+ sources with bracketed references throughout.
15. **Industry-wide peer screens** — Support comparing against the ENTIRE industry (15+ companies), not just 2-3 hand-picked competitors. Rule One Toolbox scores, comparative stock charts, and financial tables across the full peer set.
16. **Watchlist/no-buy outcomes** — Not every great company is a buy. The app must support "passed analysis but too expensive / no event" as a valid outcome, with the company added to a watchlist for price monitoring.
17. **Cyclical business handling** — For cyclical industries (semis, trucking, etc.), support calculating growth from "first positive year," using multiple capex ratios (capex/net income vs capex/operating profit) when D&A distorts, and documenting why specific years are excluded.
18. **Industry-specific KPIs** — Beyond standard Rule One metrics, each industry has its own KPIs (semis: ASP, cost per bit, EV/S; freight: operating ratio, on-time %, cargo damage rate). The app should adapt its KPI sections based on the company's industry.

---

## Source Structure

Files marked ✅ are built and functional. Files without marks are planned for later phases.

```
src/
├── main.jsx                  ✅ entry point, BrowserRouter wrapper, minimal CSS reset
├── App.jsx                   ✅ Layout + Routes (/, /watchlists, /research, /research/:id, /reports, /gurus, /validation, /guru-audit, /ticker-audit), theme/research state
├── theme.js                  ✅ C_LIGHT, C_DARK palette objects, mutable C, applyTheme()
├── components/
│   ├── Layout.jsx            ✅ app shell: top nav bar (52px) with gear icon + logo + 4 nav tabs (Watchlists/Research/Gurus/Reports) + search bar
│   ├── TickerSearch.jsx      ✅ autocomplete search (EDGAR local ticker search, dropdown, ticker or name)
│   ├── Watchlists.jsx        ✅ named watchlists with create/rename/delete, inline ticker search to add stocks, collapsible cards, click-through to Research
│   ├── ResearchEmpty.jsx     ✅ empty state for Research tab when no ticker selected ("search a ticker above")
│   ├── ResearchList.jsx      ✅ reports list: saved reports table with scores, stages, dates (route: /reports)
│   ├── Gurus.jsx             ✅ guru 13F portfolio browser — 3 tabs: Latest (guru activity table with ticker lists in new/added/reduced/sold columns + Top 10 Quarter Buys panel with Max % Portfolio column + Top 10 Guru Holdings panel), Directory (43 gurus with clickable links to detail view, searchable by guru name or fund name), Stock Lookup (search across loaded portfolios). Fetches 2 filings per guru for quarter-over-quarter change detection.
│   ├── GuruPortfolio.jsx     ✅ individual guru detail view (route: /gurus/:cik) — guru dropdown selector, stats box (with "as of close on {date}" note), full-width interactive treemap (top 25 positions, color-coded by action, tooltip anchored to hovered rect) + portfolio value AreaChart below holdings table with range buttons (6m/1y/3y/5y) and % return display (auto-fetches history on mount), filter dropdown (All/Bought/Sold/Held), sortable holdings table with action dots + change columns, expandable rows with historical activity table + ComposedChart (shares bars + price line).
│   ├── GuruAudit.jsx         ✅ in-app guru validation (route: /guru-audit) — runs auditGurus() against EDGAR, progress bar, summary stats, issues in red / clean in green. Accessible via Settings → Tools. Includes 7-section troubleshooting guide (when to run, understanding results, common issues, adding/removing gurus, entity migrations, file reference).
│   ├── TickerAudit.jsx       ✅ in-app ticker resolution audit (route: /ticker-audit) — re-resolves all tickers across cached guru data, reports failures with CUSIP prefix. Accessible via Settings → Tools. Includes 7-section troubleshooting guide (when to run, understanding results, fixing missing tickers via CUSIP overrides, why tickers fail, adding SEC abbreviations, clearing cache, file reference).
│   ├── NportAudit.jsx        ✅ in-app N-PORT audit (route: /nport-audit) — validates N-PORT fund/series mappings for 13 configured gurus (trust CIK exists, series ID matches, filing freshness <90 days) and scans all 43 gurus for undiscovered NPORT-P filings under their management CIK. Accessible via Settings → Tools. Includes 7-section troubleshooting guide.
│   ├── CompAudit.jsx         ✅ in-app compensation audit (route: /comp-audit) — validates executive compensation parsing across 89 validation companies. Checks DEF 14A filing discovery, table detection, column matching, parse quality. Results classified into 9 categories (added XBRL_FALLBACK — teal badge for companies rescued by ECD XBRL) with expandable diagnostics (heading texts, column headers, match attempts). Accessible via Settings → Tools. Includes 7-section troubleshooting guide.
│   ├── TickerDataAudit.jsx   ✅ per-ticker data quality audit — 7th tab in Toolbox. Auto-runs 8 check groups on tab open: Company Info, Financial Statements (reuses validateCompany + computeKeyMetrics), Stock Splits, Price Data, Insider Transactions, Executive Compensation, Analyst Estimates (3 sources parallel), Guru Holdings (from cache). Progress grid with live status updates per group. Overall PASS/WARNINGS/FAIL summary. Optional Frames cross-check and quarterly roll-up checkboxes. Renders independently of edgarStatements gate.
│   ├── Toolbox.jsx           ✅ main toolbox container (tab navigation: Overview/Financials/Growth/Valuation/Insiders/Filings/Audit — 7 top-level tabs, fetches data, runs calcs). Overview tab contains: StockAtGlance + 3 collapsible sections (Rule One Scores, Executive Compensation, Industry Information) + Trading Activity section with Insider Summary (4 stat cards from useInsiders) + Guru Holdings table (gurus invested in ticker from useGurus, columns: guru name, fund, shares held, last quarter action, % of portfolio). Insiders, Filings, and Audit tabs render independently of edgarStatements gate. Executive Compensation renders independently of edgarStatements (uses `useCompensation` hook). Research tab remembers last-viewed ticker via localStorage (`sa-last-research`).
│   ├── CompanyHeader.jsx     ✅ ticker, name, SIC, price, Moat/Mgmt/R1 Score badges
│   ├── StockAtGlance.jsx     ✅ all Toolbox metrics (2-col layout) + Recharts AreaChart price chart (1y/3y/5y/10y/max) + % return display for selected range
│   ├── ScoreTable.jsx        ✅ Moat + Management score grids (solid colored cells, teal headers, debt "Years" rows)
│   ├── FinancialStatements.jsx ✅ Financials/Key Metrics toggle. 4 dropdown controls (Layout, Version, View, Periods). Consolidated (~100 rows) / Expanded (~140 rows with PP&E sub-items, cash breakdown, EBIT/EBITDA, working capital, etc.). Original/Restated version toggle. Annual/Quarterly view toggle (quarterly columns: "Q4 2025", "Q3 2025", etc.). Configurable periods (5/10/13/All years or 4/8/12/20/All Qtrs). Key Metrics: 62 derived metrics across 7 categories with per-row expand/collapse for % change. Trend sparkline bars on every row. Column direction toggle (newest/oldest first). All from EDGAR (single source).
│   ├── GrowthAnalysis.jsx    ✅ CAGR table (color-coded) + bar charts per metric
│   ├── GrowthRateAnalysis.jsx ✅ Growth Rate Analysis sub-tab within Valuation — multi-line LineChart (3-year smoothed rates, 10 most recent years, all 12 metrics toggleable with nearest-line tooltip), Weighted Average panel (dynamically shows only selected composite metrics — toggling growth metrics on/off in chart/table syncs with panel + composite GR; return metrics are chart-only; "Save Composite" button switches to Calculators sub-tab), data table (12 rows: Book Value, BVPS+Div, Earnings, Pre-Tax Earnings, Op Cash, Revenue, FCF, Retained Earnings, Market Cap, ROE, ROIC, ROA across 13 years with row/column/cell hover highlighting). Growth metrics show smoothed growth rates; return metrics (ROE/ROIC/ROA) show raw values. Market Cap from shares × year-end price. Return metrics from `returns.yearly`.
│   ├── Valuation.jsx         ✅ valuation tab container — four sub-tabs (Growth Rate Analysis/Inputs/Calculators/Price vs Value), manages all shared valuation state (EPS, FGR, maintenance %, per-table excluded years (excludedYears for PBT, excludedYears10Cap, excludedYearsMOS, excludedYearsEB), FCF ratio, compositeMetrics, heroEnabled + Equity Bond state vars: ebBvpsOverride, ebRoeOverride, ebRetainedRatioOverride, ebAvgPEOverride + shared MARR). Also retains Method A Pretax + Bond Comparison state in codebase but not wired to UI. Computes `eb3yrAvg` memo (BVPS, ROE, DPS, retained ratio, avg PE from most recent 3 non-excluded years) which feeds both Equity Bond Inputs 3yr Avg column and calculator defaults via `ebDefaults`. Computes both `computeHistoricalHighPE` (for MOS cap) and `computeHistoricalAvgPE` (for Equity Bond) from full price history. Builds growth analysis series + weighted averages + composite GR, runs calculator engines (10 Cap, MOS, PBT, Equity Bond BVPS Growth). Save/load includes all override fields + heroEnabled + per-table excluded years. Calls usePrices(ticker, 'max') internally.
│   ├── ValuationCalculators.jsx ✅ hero box (highest buy price across enabled methods — shows "Future Price (10yr)" instead of "Sticker Price" when Equity Bond is hero) + 4-column summary row (10 Cap, MOS, PBT, Equity Bond) each with **checkbox to include/exclude from hero calculation** (unchecked dims card, excludes from hero, persisted in save) + 4 calculator sections: 10 Cap, MOS, PBT, Equity Bond (5 editable inputs + 6 locked outputs including Equity Growth Rate and Future BVPS). FGR radio group (Analyst/Composite/Custom) shared across MOS+PBT. MARR shared across MOS+PBT+EB. Shows PBT at current price. "Save Valuation" button inside hero box (right-aligned, plus icon → checkmark on save, teal → green "Saved!" flash for 2s, persists all overrides to localStorage).
│   ├── ValuationInputs.jsx   ✅ 4 historical data tables, all with click-to-exclude year columns (independent Sets per table): 10 Cap Inputs (4 rows × years + TTM in millions), MOS Inputs (EPS + High PE per year), PBT Inputs (5 rows including per-year FCF/NI ratio), Equity Bond Inputs (5 rows: BVPS, ROE, Dividends Per Share, Retained Earnings Ratio, Avg P/E — 3yr Avg column instead of TTM). Accepts `returns` + `historicalAvgPE` + `eb3yrAvg` + per-table excluded years props.
│   ├── HistoricalBuyPrices.jsx ✅ Price vs Value 4th sub-tab — historical buy price chart (daily stock price area + 4 stepped buy price lines: MOS/PBT/Ten Cap/Equity Bond). Toggle: Single Year vs 3-Yr Trailing inputs. Rolling composite FGR per year. Method checkboxes. Collapsible data table with buy-zone highlighting. Sanity check tool for valuation inputs.
│   ├── Filings.jsx           ✅ SEC filing browser — filter pills (7 categories), year dropdown, color-coded form types, 8-K item tooltips, pagination. MD column with per-row convert button, cached status (green dot + char count), preview modal with reconvert. Independent of edgarStatements.
│   ├── Insiders.jsx          ✅ insider trading component — own top-level Toolbox tab (5th of 6). 4 sections: sentiment summary (stat cards), transaction snapshot chart (ComposedChart with bars + price line), filters (type + insider dropdowns), sortable/paginated transaction table (11 columns). Cluster detection (3+ insiders in 5-day window → teal border). Open market vs routine distinction. Two-phase loading (12M auto + 3Y on demand). Uses useInsiders hook + usePrices for price overlay. Summary stat cards also appear in Overview → Trading Activity.
│   ├── ExecutiveCompensation.jsx ✅ executive compensation component — 2 sub-tabs (Key Executives, Board of Directors). Parses SEC DEF 14A proxy statements for Summary Compensation Table and Director Compensation Table. **Key Executives tab**: expandable rows with compensation breakdown (Salary, Bonus, Non-Equity Incentive, Total Cash, Stock Awards, Option Awards, Total Equity, Pension Change, Other Comp, Total Comp) across up to 5 years + trend sparkline bars. Summary row with total compensation for all executives. CEO Pay Ratio stat card (extracted via regex from proxy text). Compensation Mix horizontal stacked bars per executive (salary vs cash incentive vs equity as % of total) with **interactive hover tooltip** (color swatch + label + dollar amount + percentage, non-hovered segments dim to 50%). Comp-to-Revenue ratio computed from `edgarStatements.income[year].revenue`. **Error boundary** (`CompErrorBoundary`) wraps render output — catches crashes with inline message instead of white screen. **ECD XBRL source handling**: when `source === 'xbrl-pvp'`, shows "Pay vs Performance" badge, "(avg NEO comp)" labels on non-CEO entries with `_isAverage` flag, expand shows "Total Compensation (SCT)" + "Compensation Actually Paid" instead of full breakdown, CompMixBar hidden (no breakdown data), TSR vs Peer Group row at bottom (color-coded), explanatory footer text, summary row label changes to "CEO Total Compensation". **Board of Directors tab**: director compensation table with similar structure. Uses `useCompensation` hook, renders independently of edgarStatements.
│   ├── CollapsibleSection.jsx ✅ reusable expand/collapse wrapper with optional badge
│   ├── SensitivityTable.jsx  — reusable valuation matrix (vary 2 params)
│   ├── StatusBadge.jsx       — section-level status (green/yellow/red/gray)
│   ├── OnePager.jsx          — Stage 1 report view/edit
│   ├── PitchDeck.jsx         — Stage 2 container (10 collapsible sections)
│   ├── pitchDeck/
│   │   ├── RadarSection.jsx      — guru ownership, event, discovery
│   │   ├── ValuationSection.jsx  — FGR derivation + 4 calculators + sensitivity
│   │   ├── FCFSection.jsx        — FCF trends, ratio, growth
│   │   └── PESTSection.jsx       — PEST risk grid
│   ├── FullStory.jsx         — Stage 3 container (8 major sections)
│   ├── fullStory/
│   │   ├── ChecklistSection.jsx  — numbered items with status + evidence fields
│   │   ├── InversionSection.jsx  — thesis → inversion → rebuttal table
│   │   └── TradingStrategy.jsx   — price-to-value chart, PACE plan
│   ├── Settings.jsx          ✅ Settings modal — theme, financial statement defaults (layout, version, view, periods), growth chart years, price range. Gurus section with N-PORT data toggle (`enableNport`). Tools section with 5 buttons: "Run Validation" (→ /validation), "Run Guru Audit" (→ /guru-audit), "Run Ticker Audit" (→ /ticker-audit), "Run N-PORT Audit" (→ /nport-audit), "Run Compensation Audit" (→ /comp-audit). Save button with icon. Auto-saves on each change.
│   ├── Validation.jsx        ✅ Layer 1 validation page — batch runner, results display, aggregate summary, export JSON, "Include Quarterly Roll-Up" checkbox. Includes 8-section troubleshooting guide (what validation does, when to run, status badges, common issues, investigating failures, adding companies, Layer 2/3 Python scripts, file reference).
│   ├── ExportView.jsx        — clean export/print view (hides edit controls)
│   └── ReferenceList.jsx     — citation manager (numbered refs, bracket inserts)
├── data/
│   └── validationCompanies.js ✅ 89-company test list across 12 categories (no financials/banks)
├── engines/
│   ├── config.js             ✅ env var helper (trims spaces from .env.local keys)
│   ├── edgar.js              ✅ SEC EDGAR core — CIK lookup, company facts fetch, fact extraction, ticker search (local), company info (submissions endpoint), filing list fetch (`fetchFilings`). Vite proxy in dev, direct in Tauri.
│   ├── edgarFinancials.js    ✅ EDGAR-based financial statements — full XBRL taxonomy (~112 tags), income/balance/cash flow, ~20 derived fields (EBIT, EBITDA, FCF, total/net debt, working capital, invested capital, etc.). Supports version parameter (original/restated). Annual (`fetchEdgarStatements`) + quarterly (`fetchEdgarQuarterly`) + TTM extraction. Single source for FinancialStatements UI.
│   ├── keyMetrics.js         ✅ 62 derived metrics (Per Share, Shares, Liquidity, Profitability, Debt, Operating, Price) matching Rule One Toolbox Key Metrics
│   ├── companyDetails.js     ✅ EDGAR company details via submissions endpoint (name, SIC, sicDescription, exchange). Thin wrapper around edgar.js fetchCompanyInfo.
│   ├── prices.js             ✅ Yahoo Finance historical prices (daily OHLCV, IndexedDB persistence, incremental updates)
│   ├── priceStore.js         ✅ IndexedDB persistence layer for price data (local-first, offline support)
│   ├── tickerSearch.js       ✅ EDGAR local ticker/company search (for autocomplete). Thin wrapper around edgar.js searchEdgarTickers.
│   ├── cacheStore.js         ✅ IndexedDB persistence layer for large cache data (`thes1s-cache` database, 7 object stores: edgar-facts, edgar-statements, guru-data, nport-data, filing-markdown, insider-data, comp-data). DB_VERSION=4. Follows priceStore.js pattern. Exports: idbGet, idbSet, idbGetMeta, idbBulkGet, idbClear. Feature detection for Node.js compat.
│   ├── cache.js              ✅ three-tier cache (memory → IndexedDB → localStorage) with TTL per category. Key-prefix routing determines IDB vs localStorage. Exports: cacheGet (sync memory), cacheGetAsync (async memory+IDB+LS), cacheSet, cacheGetMeta (fetchedAt for UI), hydrateFromIDB (bulk load), cacheClear.
│   ├── gurus.js              ✅ SEC EDGAR 13F engine — 43 guru CIKs (13 with optional `fundCik`/`seriesId` for N-PORT), multi-filing fetch (current + previous quarter), change detection by CUSIP (new/added/reduced/sold/held), activity aggregation, top buys + top holdings (`aggregateTopHoldings`). History fetch (up to 8 quarters on-demand). Portfolio value history (`fetchPortfolioValueHistory`, up to 20 quarters). **Ticker resolution** via 5-tier matching (CUSIP cache → `CUSIP_TICKER_OVERRIDES` static map → exact normalized name with `SEC_ABBREVIATIONS` expansion (60+ entries) → prefix match → token-overlap match). 99.2% resolution rate. Persistent CUSIP→ticker cache (`sa-cusip-ticker-map:v2`). **Self-healing resolution**: `resolveTickersForHoldings()` called at engine level — in `fetchGuruWithChanges()` before caching new data, and in `loadCachedActivities()`/`loadCachedPortfolios()` during hydration. Cached data without tickers is auto-detected, resolved, and re-cached on first read. `findGurusOwning()` searches by ticker (exact), issuer name (substring), and CUSIP. Per-filing cache (immutable, versioned `GURU_CACHE_V`), submissions cache, activity cache, portfolio history cache. Namespace-aware XML parsing (`getElementsByTagNameNS`), auto-detects value convention (dollars vs thousands). **Options filtered** (`putCall` check — excludes puts/calls, equity only). **Share class aggregation** (`aggregateShareClasses` — merges by 6-char CUSIP prefix). **InfoTable detection** (3-tier: type field → filename → XML fallback, shared `findInfoTableFile` helper). **Amendment merging** (`NEW HOLDINGS` amendments merged with original filing; `RESTATEMENT` amendments replace original — checked via `primary_doc.xml` `amendmentType`). `auditGurus()` export for in-app validation. Vite proxy in dev.
│   ├── nport.js              ✅ SEC EDGAR N-PORT engine — fetches monthly fund portfolio data for 13 gurus with registered mutual funds. Matches correct series via seriesId within multi-fund trusts. Parses N-PORT XML: fund-level (totAssets, netAssets, cash), per-holding (name, cusip, value, pctVal, assetCat). Categories: STIV (money market), DE/DIR (derivatives), EC/EP (equity), DBT (debt). Per-filing cache (immutable), summary cache, series-match cache. Used by useGurus hook as non-blocking enrichment after 13F fetch. `auditNport()` export validates all 43 gurus: configured gurus checked for valid trust CIK + series ID + filing freshness (<90 days); unconfigured gurus scanned for NPORT-P filings under management CIK (discovery mode).
│   ├── filingMarkdown.js     ✅ Filing HTML-to-Markdown engine — fetches SEC filing HTML, strips iXBRL tags (getElementsByTagName for namespaced selectors), converts via turndown + GFM plugin with custom EDGAR table rule (handles colspan/rowspan), caches permanently in IndexedDB. Exports: fetchFilingMarkdown (single), fetchFilingMarkdownBatch (sequential, rate-limited). AI-only — ~5x cheaper than PDF tokens.
│   ├── compensation.js       ✅ SEC EDGAR DEF 14A proxy statement engine — fetches proxy filings, parses Summary Compensation Table and Director Compensation Table from SEC-mandated HTML tables, with **ECD XBRL fallback** for failed HTML parses. Key functions: `fetchCompensation(ticker)` (main entry — returns `{ executives, directors, ceoPayRatio, summary, source, pvpData }`), `parseSummaryCompensationTable(doc)`, `parseDirectorCompensationTable(doc)`, `parseCeoPayRatio(doc)` (regex extraction from document text), `findXbrlInstanceFile(filing)` (fetches filing index.json, finds `_htm.xml` XBRL instance file), `parseEcdXbrl(xmlText)` (parses ECD namespace elements — groups by localName, extracts year from contextRef via 3 patterns: ISO `to2025-09-27`, US underscore `To10_26_2025`, plain year fallback — builds per-year data with CEO/NEO totals, names, TSR, net income), `ecdXbrlToCompensationResult(ecdData, filing)` (converts parsed ECD to standard compensation shape with `_isAverage`/`_actuallyPaid` flags and `source: 'xbrl-pvp'`), `fetchEcdXbrlFallback(filing)` (orchestrator: find XML → fetch → parse → convert). **Two-tier fallback**: `fetchAndParseProxy()` tries HTML table parsing first; if `executives.length === 0`, calls `fetchEcdXbrlFallback()`. Result includes `source` field (`'html'` or `'xbrl-pvp'`) and `pvpData` (TSR/peer TSR/net income per year). `mergeCompensationData()` preserves `source`/`pvpData` through merge. **v3 parsing** with 15 fixes total — v2 base (9 fixes: iXBRL cleanup, nested table isolation, direct cell selection, rowspan tracking, name/title discrimination, name deduplication, sequential column mapping, value sanity check, innermost table preference) + v3 additions (6 fixes): (10) `cellText()` strips zero-width characters (`\u200b`, `\u200c`, `\u200d`, `\uFEFF`) that made spacer cells appear non-empty, (11) **spacer-rowspan fix** — loops through `allCells` to find first non-spacer cell with `rowspan > 1` instead of blindly using `allCells[0]` (root cause of most PARSE_EMPTY failures — SEC proxies like QCOM/LRCX use spacer `<td>` with rowspan for layout), (12) **director table exclusion** — requires `salary` column in header matching to prevent Director Compensation Tables from matching, (13) **full-width name row detection** — rows with <3 cells checked for standalone name-only rows, (14) `extractNameFromBlockTags()` — aggressive name/title extraction from `<p>`/`<div>`/`<br>` block-level tags as third-tier fallback, (15) **year-in-name-cell fallback** with adjusted `dataStart` index. Also: broadened salary pattern (`'base sal'`). Content-cell filtering via `isSpacerCell()`/`getContentCells()`. Fuzzy column matching against SEC-mandated header patterns. Fetches up to 3 most recent DEF 14A filings for 5+ year history. `mergeCompensationData()` combines executives across filings using fuzzy name matching. Per-filing cache (`comp-proxy:v2:{accessionNumber}`, 10yr TTL immutable) + per-ticker summary cache (`comp-summary:v2:{TICKER}`, 24hr TTL) → IndexedDB `comp-data` store. Rate limited (120ms between fetches). Vite proxy in dev (XBRL `_htm.xml` files fetched via same `/api/sec` proxy). Helper functions `filingIndexUrl(cik, accessionNumber)` and `filingArchiveUrl(cik, accessionNumber, filename)` construct EDGAR archive URLs for both dev proxy and Tauri production. **Audit**: `auditCompensation(companies, onProgress)` export runs full pipeline per company with `diagnoseSummaryCompensationTable()` diagnostic — classifies failures (TABLE_NOT_FOUND, HEADER_MISMATCH, PARSE_EMPTY, etc.) + tests XBRL fallback for failing companies (new `XBRL_FALLBACK` category). **~94% pass rate** (~84/89 including 10 XBRL fallbacks), up from 83% HTML-only, up from initial ~58%.
│   ├── insiders.js           ✅ SEC EDGAR Form 4 insider trading engine — fetches Form 4 XML filings from EDGAR archives, parses non-derivative and derivative transactions. Key functions: `fetchInsiderTransactions(ticker, { yearsBack, onProgress })` (main entry — returns `{ transactions, monthlyAggregates, summary, allForm4Filings }`), `parseForm4Xml()` (DOMParser, handles `<value>` sub-elements, extracts footnotes), `fetchForm4Batch()` (sequential with 120ms rate limit), `aggregateMonthly()` (groups by YYYY-MM for chart), `computeInsiderSummary()` (12M/90D stats, open market buyer count), `detectClusters()` (3+ insiders within 5 business days), `deduplicateAmendments()` (4/A replaces original). **Archive URL**: Form 4s stored under insider's CIK (filer), not company CIK — `filerCikFromAccession()` extracts filer CIK from accession number prefix. `primaryDocument` has XSLT prefix (`xslF345X05/`) that must be stripped. Uses `www.sec.gov` archives (`/api/sec` in dev). Cache key: `insider-form4:v4:{accessionNumber}` → IndexedDB `insider-data` store (10-year TTL, only caches non-empty results). Transaction codes map with `isOpenMarket` flag. **Null-preserving price parsing**: `pricePerShare` is `null` when XML has no `<value>` element (footnote-only, e.g., exercises), `0` when XML has `<value>0</value>` (genuine $0, e.g., awards), or the actual price (e.g., `254.83` for sales). **Footnote price extraction**: `extractFootnotes(doc)` builds footnote ID→text map, `extractPriceFromFootnote(priceEl, footnotes)` extracts `$X.XX` from footnote prose when price element only has `<footnoteId>`. **Exercise price fallback**: derivative transactions fall back to `conversionOrExercisePrice` when transaction price is missing. `priceSource` field on each transaction: `'direct'`, `'footnote'`, `'exercisePrice'`, or `null`. `totalValue` is `null` when price is null. Vite proxy in dev.
│   ├── splits.js             ✅ Stock split detection via EDGAR XBRL (no external API) — cumulative factor calc for per-share normalization
│   ├── growthRates.js        ✅ CAGR for 6 metrics × 5 periods + outlier year exclusion. Uses EDGAR statements directly. BVPS+Div+BB uses cumulative composite metric. Also exports: `compute3YearSmoothedRates(series)` (arithmetic mean of 3 consecutive YoY rates), `computeWeightedAvgGrowthRate(smoothedRates, maxPoints=10)` (linear recency weighting limited to 10 most recent smoothed rates to match Toolbox — without this limit, companies with longer EDGAR histories produce different weighted averages due to shifted weight distributions), `buildGrowthAnalysisSeries(statements)` (total-dollar series for Growth Rate Analysis tab — Book Value, BVPS+Div, Earnings, Pre-Tax Earnings, Op Cash, Revenue, FCF, Retained Earnings).
│   ├── freeCashFlow.js       ✅ FCF = Operating CF - CapEx, per-share, CapEx ratio. Uses EDGAR statements directly.
│   ├── returnMetrics.js      ✅ ROE/ROIC/ROA averages + debt ratios + FCF ratio. Uses EDGAR statements directly. ROIC = NI/(Equity+LTDebt).
│   ├── ruleOneScore.js       ✅ Moat + Management scoring algorithm (reverse-engineered, validated)
│   ├── valuation.js          ✅ MOS, PBT, Ten Cap, Equity Bond, Bond Comparison + sensitivity tables
│   ├── analystEstimates.js   ✅ Yahoo Finance analyst data — consensus growth rates (current/next FY EPS growth), EPS/revenue estimates (low/avg/high), price targets, buy/hold/sell recommendation breakdown, recent analyst upgrades/downgrades. Uses `yahoo-finance2` npm package via Vite middleware (`/api/yahoo-summary/:ticker`) in dev, direct v10 quoteSummary endpoint in Tauri production. Cache: `analyst:v1:TICKER` (localStorage, 6hr TTL).
│   ├── finviz.js             ✅ Finviz stock quote data — scrapes snapshot table for 70+ metrics. Key fields: `epsNext5Y` (5-year consensus EPS growth — primary Analyst GR source), `epsThisY`/`epsNextY` (short-term growth), `forwardPE`, `peg`, `targetPrice`, `recommendation` (1.0-5.0), `shortFloat`, `insiderOwnership`/`instOwnership`, `roe`/`roic`/`roa`. Dev: Vite middleware (`/api/finviz/:ticker`) with `cheerio` HTML parse. Tauri: direct fetch + DOMParser. Cache: `finviz:v1:TICKER` (localStorage, 6hr TTL).
│   ├── gurufocus.js          ✅ GuruFocus stock summary — dual mode: API ($25/mo via `VITE_GURUFOCUS_KEY`) or scrape (free, currently 403). Provides GF Value, predictability/financial strength/profitability ranks, Graham Number, Peter Lynch Value, DCF estimates, analyst consensus growth. Returns `null` gracefully when scraping fails. Cache: `gurufocus:v1:TICKER` (localStorage, 6hr TTL).
│   ├── sicClassification.js  ✅ SIC-to-Morningstar sector/industry classification — static mapping of ~250 four-digit SIC codes to `{ sector, industryGroup, industry, naics }` matching Rule One Toolbox taxonomy (11 sectors: Technology, Consumer Defensive, Consumer Cyclical, Healthcare, Financial Services, Industrials, Communication Services, Energy, Basic Materials, Real Estate, Utilities). Tiered fallback: (1) exact 4-digit SIC match, (2) 2-digit major group (~80 entries) with EDGAR `sicDescription` as industry name, (3) raw `sicDescription` for all fields. Includes SIC-to-NAICS crosswalk. No API calls — pure static lookup. Verified against Rule One Toolbox screenshots (AAPL, MNST, AMAT, SFM).
│   ├── tickerAudit.js        ✅ per-ticker data quality audit engine — orchestrates 8 check groups sequentially (Company Info, Financial Statements, Stock Splits, Price Data, Insiders, Compensation, Analyst Estimates, Guru Holdings). Each group calls existing engine functions, returns `{ status, checks, duration }`. `runTickerAudit(ticker, options)` is the main entry point. Progress callback for live UI updates. CIK failure auto-skips EDGAR-dependent groups. Exports `GROUP_ORDER` and `GROUP_LABELS` for UI rendering.
│   ├── fgr.js                ✅ FGR 5-input structure + average + Rule of 72
│   ├── validation.js         ✅ Layer 1 validation engine — identity checks, completeness, derived fields, YoY, Frames cross-check, retained earnings reconciliation, operating income identity, quarterly roll-up
│   ├── edgarFrames.js        ✅ EDGAR Frames API fetcher — cross-checks extracted values against EDGAR aggregated data
│   └── aiResearch.js         — Claude API calls + prompt builders per stage
└── hooks/
    ├── useResearch.js        ✅ localStorage CRUD for research reports
    ├── useFinancials.js      ✅ React hook wrapping companyDetails engine (EDGAR company info only)
    ├── usePrices.js          ✅ React hook for price data (with range param)
    ├── useEdgar.js           ✅ React hook for EDGAR data (supplementary fields + full statements via edgarFinancials.js). Accepts version ('restated'/'original') and view ('annual'/'quarterly') parameters. Conditionally fetches quarterly data when view='quarterly'.
    ├── useGurus.js           ✅ React hook for guru 13F + N-PORT data. Exposes: fetchOne, fetchOneWithChanges, fetchAll, fetchAllChanges, searchStock, fetchHistory, fetchPortfolioHistory, fetchNportForOne, fetchNportForAll, lastFetchedAt. State: portfolios, activities, nportData, nportLoading, lastFetchedAt. Activities state for Latest tab with latestTabData derived memo (sorted activities + top buys + top holdings). N-PORT fetched as non-blocking second pass after 13F in fetchAllChanges/fetchOneWithChanges. Async hydration from IndexedDB on mount (portfolios, activities, N-PORT summaries) — ticker resolution handled at engine level (gurus.js self-heals cached data during hydration). `lastFetchedAt` set after fetches and estimated from cached activity filing dates on hydration.
    ├── useCompensation.js    ✅ React hook for executive compensation data (DEF 14A proxy statements). Auto-fetches on ticker change. Independent of edgarStatements. Returns `{ data, loading, error }`. Uses cancelRef for cleanup on unmount/ticker change.
    ├── useInsiders.js        ✅ React hook for insider trading data (Form 4 filings). Auto-fetches last 12 months on ticker change (phase 1). `loadFullHistory()` callback fetches up to 3 years on demand (phase 2). State: transactions, monthlyData, summary, loading, loadingMore, progress, error, hasMore, yearsLoaded. Uses cancelRef for cleanup on unmount/ticker change.
    ├── useAnalystData.js     ✅ Combined multi-source analyst hook (Yahoo + Finviz + GuruFocus). Fires all 3 fetches in parallel on ticker change. Derives composite `analystGR` (priority: Finviz 5Y > GF estimate > Yahoo next FY) and `analystGRSource`. Returns backward-compatible `data` object (all Yahoo fields preserved) plus `data.sources: { yahoo, finviz, gurufocus }`. Exposes: `{ data, loading, loadingDetail, refetch, analystGR, analystGRSource }`.
    ├── useAnalystEstimates.js ✅ Backward-compatible re-export of `useAnalystData` (old hook name preserved for existing imports).
    ├── useWatchlists.js      ✅ localStorage CRUD for named watchlists (create/delete/rename watchlists, add/remove tickers). Storage key: `stock-analyzer-watchlists`.
    ├── useSettings.js        ✅ app-wide settings (localStorage persistence, DEFAULT_SETTINGS export). Settings: theme, layout, version, view, periods, growthChartYears, priceRange, enableNport.
    └── useTheme.js           ✅ dark/light toggle, persists preference to localStorage

validation/                       ✅ 3-layer validation system (not part of app bundle)
├── scripts/
│   ├── bundle.mjs            ✅ esbuild bundler — compiles browser ES modules to Node.js-compatible ESM (exports fetchEdgarStatements, fetchEdgarQuarterly, computeKeyMetrics, validateCompany)
│   ├── bundled-engines.mjs   ✅ auto-generated bundle output (gitignored)
│   ├── export-financials.mjs ✅ batch JSON exporter — runs EDGAR engine for 89 companies (--quarterly flag)
│   ├── run-quarterly-validation.mjs ✅ batch quarterly validation runner — Layer 1 + quarterly roll-up for 89 companies
│   ├── audit-gurus.mjs        ✅ CLI guru audit — validates 43 CIKs against EDGAR (name match, staleness, positions). Run: `node validation/scripts/audit-gurus.mjs [--fix]`
│   ├── export-gurus.mjs       ✅ batch guru 13F exporter — exports all 43 gurus to JSON. Run: `node validation/scripts/export-gurus.mjs [--force]`
│   ├── validate-gurus.mjs     ✅ guru validation — self-consistency checks + spot-check against reference data. Run: `node validation/scripts/validate-gurus.mjs`
│   └── audit-ticker-resolution.mjs ✅ ticker resolution audit — re-resolves tickers across all 43 gurus, reports failures. Supports `--quick` (exported JSON) and live (SEC fetch) modes. Run: `node validation/scripts/audit-ticker-resolution.mjs [--quick]`
├── data/                     ✅ cached validation data (thesis/, yfinance/, mstarpy/, gurus/ — gitignored)
├── reports/                  ✅ raw + summary JSON per layer run (gitignored)
├── layer2_statements.py      ✅ Layer 2 — compares 50 statement fields vs yfinance + mstarpy
└── layer3_metrics.py         ✅ Layer 3 — compares 11 derived metrics vs yfinance .info TTM
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
- **Design system**: stickeR1 reference (`knowledge/stickeR1-reference-ui.md`) + Rule One Toolbox screenshots (`knowledge/Rule One Toolbox UI examples/`)
- **Palette**: stickeR1 slate colors (slate-100→900) + Rule One Toolbox teal accent (`#0f766e` light / `#2dd4bf` dark)
- **Typography**: 13px base, 11px uppercase labels (letterSpacing 0.04em), 12px table cells, Inter/system font stack, antialiased
- **Layout**: Top nav bar (52px) with settings gear + logo + 4 nav tabs + search bar. Full-width content area below (max-width 1400px). No sidebar.
- **Top navigation**: 4 tabs (Watchlists | Research | Gurus | Reports) — React Router NavLinks with underline active style + 14px SVG icons. Research tab uses `end={false}` to match `/research/:id` sub-routes.
- **Toolbox navigation**: Horizontal underline tabs (Overview | Financials | Growth | Valuation | Insiders | Filings | Audit) — 7 top-level tabs, one section at a time (local state within Research tab). Overview tab has collapsible sections (Rule One Scores, Executive Compensation, Industry Information) + Trading Activity section with Insider Summary (4 stat cards) and Guru Holdings table (gurus currently invested in the ticker, with name/fund/shares/action/% of portfolio columns). Audit tab runs per-ticker data quality checks across all 8 data sources.
- **Components**: Cards with border + borderRadius 8, pill badges, underline tabs, subtle shadows (0 1px 3px rgba(0,0,0,0.04))
- Dark/light mode toggle, inline styles with mutable `C` palette object
- Tables for financial data, Recharts for growth/valuation visuals
- No auth, no accounts, no payment — single user, local desktop app

---

## Rule One Score Engine (Reverse-Engineered)

The Rule One Toolbox score was reverse-engineered from 3 example screenshots (AMAT, MNST, ILMN). All scoring uses EDGAR financial statements as the single source of truth.

### Overall Formula
```
Rule #1 Score = round((Moat Score + Management Score) / 2)
```

### Moat Score (5 growth metrics)
Each metric uses the **4 multi-year periods** (10yr, 7yr, 5yr, 3yr). The 1yr is displayed but **NOT scored**.

**Per-period scoring:**
- Rate ≥ 10% → 2 points (green cell)
- Rate ≥ 5% and < 10% → 1 point (yellow cell)
- Rate < 5% → 0 points (red cell)

**Per-metric score** = total points × 12.5 (max 8 points × 12.5 = 100)

**Moat Score** = round(average of scored metrics). Metrics with all-null periods are **excluded** from the average (not scored as 0). E.g., if FCF data is missing, Moat averages over 4 metrics instead of 5.

The 5 metrics: (1) BVPS + Dividends + Buybacks Growth, (2) Earnings Growth, (3) Revenue Growth, (4) Operating Cash Flow Growth, (5) Free Cash Flow Growth

### Management Score (5 metrics)
Three return metrics use the **same 4-period, same-threshold scoring** as Moat:
(1) ROE, (2) ROIC, (3) ROA

Two debt metrics score independently:
(4) Net Debt to Earnings, (5) Net Debt to Free Cash Flow
- ≤ 3 years or net cash → 100
- Null (no data) → excluded from average
- > 3 years → 0
- Intermediate thresholds TBD (need test with heavily indebted company)

**Management Score** = round(average of scored metrics). Metrics with no data are **excluded** from the average (same as Moat). E.g., if FCF is missing, Net Debt to FCF is excluded — averages over 4 metrics instead of 5.

### Score Badge Colors
- Score ≥ 70 → green background
- Score 40-69 → yellow background
- Score < 40 → red background

### Cell Colors (for growth/return tables)
- ≥ 10% → green
- ≥ 5% and < 10% → yellow/gold
- < 5% → red/amber
- Negative → always red
- 1yr column → gray (informational, not scored)

### Verified Examples
- AMAT: Moat 83, Mgmt 100, Rule #1 = 92 ✓
- MNST: Moat 83, Mgmt 60, Rule #1 = 72 ✓
- ILMN: Moat 25, Mgmt 45, Rule #1 = 35 ✓

### Implementation Notes
- **BVPS+Div+Buybacks growth**: Cumulative composite metric. For each year: BVPS + all dividends per share paid to date + all buyback value per share returned to date. Buyback value = |share_repurchases| / shares_outstanding per year. Prevents heavy-buyback companies (AAPL) from showing negative BVPS growth. All data from EDGAR (dividends_per_share, share_repurchases, equity, shares_outstanding).
- **ROIC**: Net Income / (Total Equity + Long-Term Debt). NO cash subtraction — matches Toolbox. Verified: AAPL pre-debt years show ROIC = ROE exactly.
- **FCF**: Operating Cash Flow - CapEx. Both from EDGAR. Uses EDGAR's pre-computed `free_cash_flow` derived field when available, falls back to manual calculation.
- **Net Debt**: Uses EDGAR's pre-computed `net_debt` (traditional debt - cash, no leases). If negative (net cash), debt metrics = "0.0 Years" = 100.

---

## Dev Commands

| Command | What it does |
|---------|-------------|
| `npm run dev` | Start Vite dev server (localhost:5173 in browser) |
| `npm run build` | Build production frontend |
| `npm run tauri:dev` | Launch desktop app in dev mode (with hot-reload) |
| `npm run tauri:build` | Package as native macOS `.app` |

---

## Implementation Plan

Build order: **Toolbox first** (data + calculations), **then** AI-driven report generation. This way reports pull from already-computed numbers — Claude's job becomes narrative and analysis, not arithmetic.

### Phase 1 — App Shell (Foundation) ✅ COMPLETE
| Step | What | Files |
|------|------|-------|
| 1.1 | Install all deps (recharts, @anthropic-ai/sdk, uuid, react-router-dom) | `package.json` |
| 1.2 | Theme system — `C_LIGHT`/`C_DARK` palette objects | `src/theme.js` |
| 1.3 | Strip default scaffold, create Layout (sidebar + header + content) | `src/App.jsx`, `src/main.jsx`, `src/components/Layout.jsx` |
| 1.4 | Routing (`/`, `/research/:id/toolbox`, `/research/:id/one-pager`, etc.) | `src/App.jsx` |
| 1.5 | TickerSearch component (autocomplete dropdown, ticker or company name) | `src/components/TickerSearch.jsx` |
| 1.6 | Dashboard / ResearchList (all saved reports, scores, stages, dates) | `src/components/ResearchList.jsx` |
| 1.7 | localStorage hooks (`useResearch` CRUD, `useTheme` toggle) | `src/hooks/useResearch.js`, `src/hooks/useTheme.js` |

### Phase 2 — Financial Data Engine ✅ COMPLETE
| Step | What | Files |
|------|------|-------|
| 2.1 | Env variable helper (trim spaces from `.env.local` keys) | `src/engines/config.js` |
| 2.2 | EDGAR financial statements — full XBRL taxonomy (~112 tags), all statements | `src/engines/edgarFinancials.js` |
| 2.3 | EDGAR company details — name, SIC, exchange (via submissions endpoint) | `src/engines/companyDetails.js` |
| 2.4 | Yahoo Finance prices — daily OHLCV with IndexedDB persistence + incremental updates | `src/engines/prices.js`, `src/engines/priceStore.js`, `vite.config.js` |
| 2.5 | Cache layer (memory + IndexedDB + localStorage, TTL per category) | `src/engines/cache.js`, `src/engines/cacheStore.js` |
| 2.6 | React hooks — `useFinancials(ticker)`, `usePrices(ticker, range)` | `src/hooks/useFinancials.js`, `src/hooks/usePrices.js` |
| 2.7 | EDGAR ticker search (local autocomplete by ticker or company name) | `src/engines/tickerSearch.js` |
| 2.8 | SEC EDGAR 13F guru engine — 43 guru CIKs, fetch/parse holdings, search | `src/engines/gurus.js`, `src/hooks/useGurus.js` |

### Phase 3 — Calculation Engines (pure math, no UI) ✅ COMPLETE
| Step | What | Files |
|------|------|-------|
| 3.1 | Growth rates — CAGR for 5 metrics × 5 periods + outlier exclusion | `src/engines/growthRates.js` |
| 3.2 | Rule One Score — Moat + Management scoring per algorithm above | `src/engines/ruleOneScore.js` |
| 3.3 | Return metrics — ROE/ROIC/ROA averages + debt ratios + FCF ratio | `src/engines/returnMetrics.js` |
| 3.4 | Valuation — MOS, PBT, Ten Cap, Equity Bond, Bond Comparison, sensitivity | `src/engines/valuation.js` |
| 3.5 | FGR helper — 5-input structure + average + Rule of 72 check | `src/engines/fgr.js` |

### Phase 4 — Toolbox View (UI) ✅ COMPLETE
| Step | What | Files |
|------|------|-------|
| 4.1 | Toolbox container with collapsible sections | `src/components/Toolbox.jsx`, `src/components/CollapsibleSection.jsx` |
| 4.2 | Company header with score badges (Moat / Mgmt / Overall) | `src/components/CompanyHeader.jsx` |
| 4.3 | Stock At Glance — key metrics table + Recharts price chart | `src/components/StockAtGlance.jsx` |
| 4.4 | Score tables — color-coded Moat + Management grids | `src/components/ScoreTable.jsx` |
| 4.5 | Financial statements display (scrollable year-column tables) | `src/components/FinancialStatements.jsx` |
| 4.6 | Growth rate analysis — charts + CAGR table | `src/components/GrowthAnalysis.jsx` |

### Phase 5 — Stage 1: One Pager
| Step | What | Files |
|------|------|-------|
| 5.1 | Claude API integration (direct fetch, `anthropic-dangerous-direct-browser-access` header) | `src/engines/aiResearch.js` |
| 5.2 | One Pager component — 6 sections, auto-populated + AI-generated + user input | `src/components/OnePager.jsx` |
| 5.3 | Status indicators + approval gate (approve → unlocks Stage 2) | `src/components/StatusBadge.jsx` |

### Phase 6 — Stage 2: Pitch Deck
| Step | What | Files |
|------|------|-------|
| 6.1 | Pitch Deck container — 10 collapsible sections, gate check on Stage 1 | `src/components/PitchDeck.jsx` |
| 6.2 | Section sub-components (Radar, Valuation, FCF, PEST, etc.) | `src/components/pitchDeck/*.jsx` |
| 6.3 | FGR derivation workflow UI (5 inputs with sources + Rule of 72) | embedded in `ValuationSection.jsx` |
| 6.4 | Sensitivity table component (reusable, vary 2 params) | `src/components/SensitivityTable.jsx` |

### Phase 7 — Stage 3: Full Story
| Step | What | Files |
|------|------|-------|
| 7.1 | Full Story container — 8 major sections, gate check on Stage 2 | `src/components/FullStory.jsx` |
| 7.2 | Checklist components (Meaning 15pt, Moat 15pt, Management 13pt) | `src/components/fullStory/ChecklistSection.jsx` |
| 7.3 | Inversion & Rebuttal UI (thesis → inversion → rebuttal → strength) | `src/components/fullStory/InversionSection.jsx` |
| 7.4 | Trading Strategy + PACE Plan (price-to-value chart, entry/exit) | `src/components/fullStory/TradingStrategy.jsx` |

### Phase 8 — Polish & Management
| Step | What | Files |
|------|------|-------|
| 8.1 | Enhanced dashboard (sort, filter, pipeline viz, watchlist toggle) | `src/components/ResearchList.jsx` |
| 8.2 | Working view vs clean export view toggle | `src/components/ExportView.jsx` |
| 8.3 | Reference/citation system (numbered refs, bracket inserts) | `src/components/ReferenceList.jsx` |
| 8.4 | Watchlist support (flag, reason, dashboard filter) | data model + `ResearchList.jsx` |

### Dependencies Between Phases
```
Phase 1 (Shell) ──→ Phase 2 (Data) ──→ Phase 3 (Calc) ──→ Phase 4 (Toolbox UI)
                                                               ↓
                                                         Phase 5 (One Pager)
                                                               ↓
                                                         Phase 6 (Pitch Deck)
                                                               ↓
                                                         Phase 7 (Full Story)
                                                               ↓
                                                         Phase 8 (Polish)
```

### Known Risks
- **XBRL tag variation**: Different companies use different XBRL tags for the same concept. The taxonomy in `edgarFinancials.js` handles ~95% of large/mid-cap US companies with ~100 fallback tags per field, but edge cases may need new tags added.
- **Quarterly data edge cases**: Quarterly extraction works for 98.6% of checks across 89 companies. Remaining errors are in older FY cash flow sub-totals and merger-affected companies (RTX, ORCL, FDX). Revenue/NI roll-up is near-perfect. CapEx can diverge when companies reclassify between XBRL tags across 10-Q vs 10-K.
- **EDGAR company details missing some fields**: EDGAR submissions endpoint doesn't provide `description` or `totalEmployees`. These are deferred — may add later from 10-K parsing or other source.
- **Stock split adjustment**: Per-share values from EDGAR may diverge from Toolbox for historical years due to different split-adjustment methodologies. Progressive ratio observed (1.0 recent → ~1.46 for 2016 AAPL). Deferred for later investigation.
- **Claude API cost**: Generate sections individually (not whole reports) to control tokens. Use claude-sonnet-4-20250514 for efficiency.
- **localStorage size**: ~~MITIGATED~~ — Large caches (EDGAR facts, financial statements, guru 13F, N-PORT) now route to IndexedDB (effectively unlimited). Only small data remains in localStorage (reports, settings, watchlists, CUSIP map). One-time migration auto-cleans old large entries.
- **Key Metrics Price category**: Price-based metrics (P/E, P/S, P/B, P/CF, P/FCF) only computed for the latest year using current stock price. Historical P/E (High PE, Low PE from Rule One Toolbox) would require historical price data per year — not yet implemented.
