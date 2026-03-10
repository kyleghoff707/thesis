# Thes1s

## Project Overview
**Thes1s** (pronounced "thesis") — a single-user local desktop app for Rule One stock research and analysis. The name embeds a "1" for Rule One — pairs with the user's portfolio tracker **stickeR1**. Generates comprehensive research reports through a 3-stage gated workflow: One Pager → Pitch Deck → Full Story. Each stage must be approved before advancing to the next. Reports are saveable, editable, and include references, tables, and illustrations.

This app is a research report generator — it answers "should I invest in this company?" through the Rule One lens. It is NOT a portfolio tracker. The user also has a separate app called **stickeR1** for portfolio/options tracking.

### Branding
- **Name**: Thes1s — "1" replaces the "i", nods to Rule One
- **Logo**: `public/logo.svg` — fused T1 letterform in a dark rounded square. Blue dot + blue vertical stem (the "1") with a white horizontal crossbar (the "T"). Reads as both a T and a stylized 1/i simultaneously.
- **In-app rendering**: Sidebar shows logo mark (24px) + styled text where "Thes" is white, "1" is accent blue italic, "s" is white
- **Favicon**: Same `logo.svg` via `index.html`
- **Browser tab title**: "Thes1s" via `index.html <title>`

The user is NOT a programmer. Keep explanations in plain English.

**Goal**: Reduce 40+ hours of manual Rule One research per company to significantly less using AI-assisted analysis.

---

## Tech Stack & Architecture
- **Desktop shell**: Tauri (wraps the React frontend in a native macOS `.app`)
- **Frontend**: Vite + React (functional components with hooks)
- **Styling**: inline styles (dark/light palette object, no CSS framework — same approach as stickeR1)
- **Storage**: localStorage for saved reports (single user, no auth needed)
- **AI**: Claude API called directly from the app (no proxy needed — API key lives in local `.env.local`)
- **Financial Data**: SEC EDGAR XBRL (primary source — income statement, balance sheet, cash flow, company details, ticker search, all line items, 13+ years, free, also used for stock split detection), EODHD (historical stock price data/charts — proxied through Vite in dev), SEC EDGAR 13F (guru holdings — free, no key needed)
- **Charts**: Recharts (growth metrics, valuation visuals, price charts)
- **Dev**: `npm run dev` → localhost:5173 in browser. Hot-reload works normally.
- **Desktop build**: `npm run tauri:build` → produces a native `.app` for macOS
- **No server, no hosting, no auth** — runs entirely on your machine. API calls go direct to external services.

### API Keys
Stored in `.env.local` (gitignored via `*.local` pattern). No Cloudflare proxy needed since this is local-only.
```
VITE_CLAUDE_KEY=...    # Claude API — for AI report generation
VITE_EODHD_KEY=...     # EODHD — for historical stock price data (NOT fundamentals — forbidden on current tier)
```

### API Notes (Validated)
- **SEC EDGAR (Primary — Financial Statements)**: Free, no key needed. Requires `User-Agent` header. The XBRL company facts endpoint (`/api/xbrl/companyfacts/CIK{cik}.json`) returns ALL financial data for a company in one call — income statement, balance sheet, cash flow, every line item. `edgarFinancials.js` maps ~112 XBRL tags across all three statements using a taxonomy with fallback tags per field (handles ASC 606 revenue transition, ASC 842 lease accounting, different debt tags, etc.). Tags are **merged** across fallbacks (not first-match-wins) so older years using legacy tags are included. Supports `USD`, `USD/shares`, and `shares` unit types. Fiscal year extracted from XBRL `fy` field (not `getFullYear()`) — correctly handles companies with non-calendar fiscal years (e.g., SFM ends in early January). Supports **version modes**: `restated` (default — latest filing per FY via `extractAnnualFact`) and `original` (earliest filing per FY via `extractAnnualFactOriginal`). Split-sensitive fields always use `extractAnnualFactOriginal` regardless of version to prevent double-adjustment from restated comparatives. Cache key includes version: `edgar-statements:TICKER:s3:restated`. Auto-computes derived fields: Gross Profit, EPS, EBIT, EBITDA, non-current totals, total debt, net debt, FCF, net investments, net change in cash, total expenses, effective tax rate, working capital, invested capital, net tangible assets, total capitalization, beginning/ending cash position. Rate limit: 10 req/sec. **CORS note**: `User-Agent` is a forbidden header in browser fetch — browsers silently drop it. Both `www.sec.gov` and `data.sec.gov` are proxied through Vite in dev (`/api/sec` → `www.sec.gov`, `/api/edgar` → `data.sec.gov`) with proper headers injected server-side. In Tauri production, the native webview doesn't enforce CORS so direct calls work. `edgar.js` auto-detects dev vs production via `import.meta.env.DEV`.
- **SEC EDGAR (13F Guru Holdings)**: Same EDGAR infrastructure. Uses `/submissions/CIK{cik}.json` + infotable XML parsing for guru 13F holdings.
- **EODHD**: Use ONLY for historical stock price data (`/api/eod/{TICKER}.US`). The fundamentals endpoint returns Forbidden on the current plan tier. Do NOT use for financial statements. **CORS note**: EODHD doesn't send `Access-Control-Allow-Origin`, so browser calls fail. In dev, requests are proxied through Vite (`/api/eodhd` → `eodhd.com`). In Tauri production, the native webview doesn't enforce CORS.
- **Claude API**: Direct calls from the app. The app constructs messages with financial data + Rule One methodology context, sends to Claude, receives structured analysis. Claude also reads 10K/10Q filings from EDGAR to extract quantitative data (CapEx, FCF, maintenance CapEx) and qualitative insight (management discussion, risk factors, business description).

### Current State
- **Phases 1-4 complete** — app shell, data engines, calculation engines, and Toolbox UI all functional
- **EDGAR financial statements engine complete** — `edgarFinancials.js` with full XBRL taxonomy (~112 tags across income/balance/cash flow) validated against Rule One Toolbox AAPL export. Income: 24 fields, Balance Sheet: 56 fields (including PP&E sub-items, cash sub-items, receivables detail), Cash Flow: 37 fields, plus ~20 derived fields (EBIT, EBITDA, FCF, total/net debt, total receivables, non-current totals, working capital, invested capital, net tangible assets, total capitalization, effective tax rate, beginning/ending cash position). Supports `version` parameter (`restated` default, `original`) controlling whether data uses latest or earliest filing per fiscal year. Wired into `useEdgar` hook and `FinancialStatements` component.
- **Key Metrics engine built** — `keyMetrics.js` computes 62 derived metrics matching Rule One Toolbox Key Metrics export: Per Share (14), Shares (3), Liquidity (4), Profitability (10), Debt Ratios (7), Operating (11), Price (7). Displayed via Key Metrics toggle in FinancialStatements.
- **Key Metrics validated against Rule One Toolbox + Morningstar (AAPL)** — Four formula fixes applied:
  - **Receivable Turnover**: Was using `total_receivables` (trade + vendor/non-trade). Fixed to use `accounts_receivable` (trade only) to match Toolbox/Morningstar. Was 2x off for AAPL (~5.7 vs correct ~11.4). Also fixes Days In Receivables and Cash Conversion Cycle.
  - **ROIC**: Was `Net Income / (Equity + LT Debt - Cash&Mkt Sec)` — cash subtraction made denominator too small, inflating ROIC ~1.5-2x. Fixed to `Net Income / (Equity + LT Debt)` matching Toolbox (verified: pre-debt years show ROIC = ROE exactly). Morningstar uses a different formula (average invested capital with total debt) — intentional methodology difference, not a bug.
  - **Quick Ratio**: Was `(Current Assets - Inventory) / CL` which included prepaid expenses and other current assets. Fixed to narrow formula `(Cash + STI + Trade Receivables) / CL` matching Toolbox/Morningstar.
  - **Debt to Total Capital**: Was `Total Debt / (Equity + Total Debt)`. Fixed to `LT Debt / (Equity + LT Debt)` matching Toolbox.
  - **ROE**: Uses ending equity (matches Toolbox). Morningstar uses average equity — intentional methodology difference.
  - **Remaining minor differences**: EBIT Margin (Toolbox uses PreTax + Interest Expense; app uses Operating Income — differs 1-2% in historical years with non-operating items). Inventory Turnover (~14% off, likely Original vs Restated inventory values). Fixed Asset Turnover (varies 2-5%, version-related PP&E differences). BVPS (~1.6% off vs Toolbox). These are low priority.
- **FinancialStatements rebuilt** — Uses EDGAR as single source. Financials/Key Metrics toggle. 4 dropdown controls matching Rule One Toolbox: **Layout** (Consolidated ~100 rows / Expanded ~140 rows — expanded adds PP&E sub-items, cash breakdown, receivables detail, EBIT/EBITDA, working capital, invested capital, beginning/ending cash, etc.), **Version** (Original / Restated — triggers EDGAR refetch), **View** (Annual, Quarterly planned), **Periods** (5 / 10 / 13 / All year columns). Expanded rows use `expanded: true` flag, filtered at render time. Version state lives in parent Toolbox.jsx (triggers refetch); Layout and Periods are local state (UI-only). CSV export respects current layout/version/periods settings.
- Dependencies installed: recharts, @anthropic-ai/sdk, uuid, react-router-dom
- Tauri CLI installed (`@tauri-apps/cli` in devDependencies)
- GitHub repo created (private)
- `.env.local` has spaces after `=` signs — handled by `config.js` trim
- Rule One Score algorithm fully reverse-engineered and validated (see Rule One Score section below)
- **Light mode default** — `useTheme.js` defaults to light mode for new users
- **EODHD CORS fix**: Vite dev proxy (`/api/eodhd` → `eodhd.com`) in `vite.config.js`. In Tauri production, the native webview doesn't enforce CORS so direct calls work.
- **SEC EDGAR CORS fix**: Both `www.sec.gov` and `data.sec.gov` proxied through Vite (`/api/sec` and `/api/edgar`) with User-Agent headers injected server-side. Browser `fetch` silently drops `User-Agent` (forbidden header per Fetch spec), so direct calls from browser fail. `edgar.js` auto-detects dev vs production via `import.meta.env.DEV`.
- **EDGAR fiscal year fix**: Uses XBRL `fy` field for year mapping (not `getFullYear()` on end date). Correctly handles companies with non-calendar fiscal years (e.g., SFM ends in early January). Deduplicates by latest period end date per fiscal year to avoid picking up prior-year comparatives.
- **EDGAR unit support**: `extractAnnualFact` accepts `unit` parameter — `USD` (default), `USD/shares` (EPS, dividends per share), `shares` (share counts).
- **EPS gap fix**: `edgarFinancials.js` auto-computes EPS from Net Income / Diluted Shares when EDGAR doesn't report it directly.
- **Ticker autocomplete**: EDGAR `company_tickers.json` searched locally — works with both ticker symbols and company names.
- **Guru 13F engine**: All 41 guru CIK numbers verified against live EDGAR data. Fetches, parses, and caches 13F holdings.
- **Score/growth engines migrated to EDGAR** — `growthRates.js`, `returnMetrics.js`, and `freeCashFlow.js` all rewritten to consume EDGAR statements directly (single source of truth). `Toolbox.jsx` passes `edgarStatements` to all score engines. `StockAtGlance.jsx` uses EDGAR as sole source for financials. Market cap computed locally (shares_outstanding × current_price).
- **BVPS+Div+Buybacks composite metric** — Growth rate now uses cumulative running total: BVPS + all dividends per share ever paid + all buyback value per share ever returned. Prevents companies with heavy buybacks (like AAPL) from showing negative BVPS growth when they're creating enormous shareholder value. Validated against Rule One Toolbox AAPL.
- **ROIC formula corrected** — Changed from `Net Income / (Equity + LT Debt - Cash)` to `Net Income / (Equity + LT Debt)` — no cash subtraction, matching Toolbox. Verified: AAPL pre-debt years show ROIC = ROE exactly. Applied in both `returnMetrics.js` (scoring) and `keyMetrics.js` (display).
- **Earnings Growth fix**: Moat scoring uses total Net Income (not EPS) for "Earnings Growth" metric. EPS inflates growth for heavy-buyback companies (e.g., AAPL shares 23B→15B). Validated against Rule One Toolbox AAPL — Earnings Score now matches (50 vs previous 88).
- **TTM support**: Not yet in EDGAR engine (FinancialStatements currently shows annual only). TODO: add quarterly XBRL extraction for TTM to EDGAR engine.
- **Toolbox UI matches Rule One Toolbox**: ScoreTable uses solid colored cell backgrounds (green/yellow/red) with white text, teal section headers, "X.X Years" debt display. StockAtGlance shows all Toolbox metrics in two-column layout with dollar signs and comma formatting for US currency.
- **Growth Analysis**: 6 metrics — BVPS+Dividends, Earnings (Net Income), Revenue, Operating Cash Flow, FCF, Retained Earnings. CAGR table (color-coded) + bar charts. All data sourced from EDGAR.
- **Debt display for net cash companies**: Shows "0.0 Years" in green cell with score 100, matching real Toolbox behavior (validated against AMAT, SFM screenshots).
- **Binary debt scoring**: ≤3 years or net cash → 100 (green), >3 years → 0 (red). Intermediate thresholds TBD.
- **Stock split adjustment**: `splits.js` detects splits from EDGAR XBRL data (explicit `StockholdersEquityNoteStockSplitConversionRatio1` tag, with share-count-jump fallback via `dei:EntityCommonStockSharesOutstanding`). No external API needed. `edgarFinancials.js` extracts per-share/share-count fields using `extractAnnualFactOriginal` (prefers earliest filing to avoid double-adjustment from restated comparatives), then applies cumulative split factors. Per-share values ÷ factor, share counts × factor. Runs before derived field computation so auto-computed EPS uses adjusted shares. Cache key includes split count and version (`edgar-statements:TICKER:s3:restated`) so stale data cached before splits loaded or with different version is automatically invalidated.
- **Fiscal year end months**: `extractFiscalYearEnds()` in `edgar.js` extracts the FY end month from XBRL `end` dates. Displayed as abbreviation (e.g., "Sep", "Jan") below each year column in FinancialStatements headers.
- **FinancialStatements UI enhancements**: Sticky header row (years stay visible on vertical scroll), bold/larger year headers (13px/700), comma-formatted numbers throughout, CSV export button (Financials exports current tab, Key Metrics exports all categories). Filenames include ticker, tab label, layout, and version (e.g., `AAPL_Income_Statement_expanded_restated.csv`).
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
- **Validation system built — 3 layers, 89 companies, all complete.** Full details in `knowledge/validation-summary-2026-03-10.md`. EDGAR engine is **production-ready** — no data bugs found, all discrepancies explained by methodology/classification/timing differences.
  - **Layer 1 — EDGAR self-validation** at `/validation` route. 5 checks: accounting identities (A=L+E, GP=Rev-COGS, etc.), completeness (13 critical fields), derived field consistency, YoY sanity flags, Frames API cross-check (9 tags × 5 years). Final results: 23 PASS / 48 WARNINGS / 18 FAIL. Avg identity 98%, completeness 94.7%, derived 97.5%, frames 84.9%. All 18 FAILs explained by non-calendar FY Frames quirks or corporate events (ABBV Allergan reclassification, GE Aerospace spinoff). "Skip Frames" option for faster local-only pass.
  - **Layer 2 — Financial statements vs yfinance** (`validation/layer2_statements.py`). 50 fields × 89 companies × ~4 years = 18,112 comparisons. **77.1% exact match, 82% within 5%.** Critical scoring fields (Revenue, Net Income, OCF, Equity, EPS, Shares, Dividends) all >87% exact match with <3% avg diff. mstarpy tested as secondary source but unreliable (34.4%, returns wrong entity data for some companies). FY alignment fix: bidirectional year-offset fallback for non-December FY companies.
  - **Layer 3 — Key metrics vs yfinance `.info`** (`validation/layer3_metrics.py`). 11 derived metrics × 89 companies = 932 comparisons. 36.8% exact match — lower rate expected because yfinance returns TTM values while our metrics are annual FY. Top metrics (current ratio 72.7%, EPS 67.4%, profit margin 67.4%) match well given timing gap.
  - **Validation infrastructure**: esbuild bundler (`validation/scripts/bundle.mjs`) compiles browser ES modules to Node.js. Batch exporter (`validation/scripts/export-financials.mjs`) produces 89 JSON files. All cached data in `validation/data/`, reports in `validation/reports/`.
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
│   ├── guru-list.md                      — 40 named Gurus for 13F lookup
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
├── App.jsx                   ✅ Layout + Routes, theme/research state
├── theme.js                  ✅ C_LIGHT, C_DARK palette objects, mutable C, applyTheme()
├── components/
│   ├── Layout.jsx            ✅ app shell: sidebar + header + main content area
│   ├── TickerSearch.jsx      ✅ autocomplete search (EDGAR local ticker search, dropdown, ticker or name)
│   ├── ResearchList.jsx      ✅ dashboard: saved reports table with scores, stages, dates
│   ├── Toolbox.jsx           ✅ main toolbox container (collapsible sections, fetches data, runs calcs)
│   ├── CompanyHeader.jsx     ✅ ticker, name, SIC, price, Moat/Mgmt/R1 Score badges
│   ├── StockAtGlance.jsx     ✅ all Toolbox metrics (2-col layout) + Recharts AreaChart price chart (1y/3y/5y/10y/max)
│   ├── ScoreTable.jsx        ✅ Moat + Management score grids (solid colored cells, teal headers, debt "Years" rows)
│   ├── FinancialStatements.jsx ✅ Financials/Key Metrics toggle. 4 dropdown controls (Layout, Version, View, Periods). Consolidated (~100 rows) / Expanded (~140 rows with PP&E sub-items, cash breakdown, EBIT/EBITDA, working capital, etc.). Original/Restated version toggle. Configurable periods (5/10/13/All). Key Metrics: 62 derived metrics across 7 categories. All from EDGAR (single source).
│   ├── GrowthAnalysis.jsx    ✅ CAGR table (color-coded) + bar charts per metric
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
│   ├── Validation.jsx        ✅ Layer 1 validation page — batch runner, results display, aggregate summary, export JSON
│   ├── ExportView.jsx        — clean export/print view (hides edit controls)
│   └── ReferenceList.jsx     — citation manager (numbered refs, bracket inserts)
├── data/
│   └── validationCompanies.js ✅ 89-company test list across 12 categories (no financials/banks)
├── engines/
│   ├── config.js             ✅ env var helper (trims spaces from .env.local keys)
│   ├── edgar.js              ✅ SEC EDGAR core — CIK lookup, company facts fetch, fact extraction, ticker search (local), company info (submissions endpoint). Vite proxy in dev, direct in Tauri.
│   ├── edgarFinancials.js    ✅ EDGAR-based financial statements — full XBRL taxonomy (~112 tags), income/balance/cash flow, ~20 derived fields (EBIT, EBITDA, FCF, total/net debt, working capital, invested capital, etc.). Supports version parameter (original/restated). Single source for FinancialStatements UI.
│   ├── keyMetrics.js         ✅ 62 derived metrics (Per Share, Shares, Liquidity, Profitability, Debt, Operating, Price) matching Rule One Toolbox Key Metrics
│   ├── companyDetails.js     ✅ EDGAR company details via submissions endpoint (name, SIC, sicDescription, exchange). Thin wrapper around edgar.js fetchCompanyInfo.
│   ├── prices.js             ✅ EODHD historical prices (daily OHLCV, Vite proxy in dev)
│   ├── tickerSearch.js       ✅ EDGAR local ticker/company search (for autocomplete). Thin wrapper around edgar.js searchEdgarTickers.
│   ├── cache.js              ✅ two-tier cache (memory + localStorage) with TTL per category
│   ├── gurus.js              ✅ SEC EDGAR 13F engine — 41 guru CIKs, fetch/parse holdings, portfolio search
│   ├── splits.js             ✅ Stock split detection via EDGAR XBRL (no external API) — cumulative factor calc for per-share normalization
│   ├── growthRates.js        ✅ CAGR for 6 metrics × 5 periods + outlier year exclusion. Uses EDGAR statements directly. BVPS+Div+BB uses cumulative composite metric.
│   ├── freeCashFlow.js       ✅ FCF = Operating CF - CapEx, per-share, CapEx ratio. Uses EDGAR statements directly.
│   ├── returnMetrics.js      ✅ ROE/ROIC/ROA averages + debt ratios + FCF ratio. Uses EDGAR statements directly. ROIC = NI/(Equity+LTDebt).
│   ├── ruleOneScore.js       ✅ Moat + Management scoring algorithm (reverse-engineered, validated)
│   ├── valuation.js          ✅ MOS, PBT, Ten Cap, Equity Bond, Bond Comparison + sensitivity tables
│   ├── fgr.js                ✅ FGR 5-input structure + average + Rule of 72
│   ├── validation.js         ✅ Layer 1 validation engine — identity checks, completeness, derived fields, YoY, Frames cross-check
│   ├── edgarFrames.js        ✅ EDGAR Frames API fetcher — cross-checks extracted values against EDGAR aggregated data
│   └── aiResearch.js         — Claude API calls + prompt builders per stage
└── hooks/
    ├── useResearch.js        ✅ localStorage CRUD for research reports
    ├── useFinancials.js      ✅ React hook wrapping companyDetails engine (EDGAR company info only)
    ├── usePrices.js          ✅ React hook for price data (with range param)
    ├── useEdgar.js           ✅ React hook for EDGAR data (supplementary fields + full statements via edgarFinancials.js). Accepts version parameter ('restated'/'original'), refetches when version changes.
    ├── useGurus.js           ✅ React hook for guru 13F data (fetch one, fetch all, search)
    └── useTheme.js           ✅ dark/light toggle, persists preference to localStorage

validation/                       ✅ 3-layer validation system (not part of app bundle)
├── scripts/
│   ├── bundle.mjs            ✅ esbuild bundler — compiles browser ES modules to Node.js-compatible ESM
│   ├── bundled-engines.mjs   ✅ auto-generated bundle output (gitignored)
│   └── export-financials.mjs ✅ batch JSON exporter — runs EDGAR engine for 89 companies
├── data/                     ✅ cached validation data (thesis/, yfinance/, mstarpy/ — gitignored)
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
- Clean/minimal (Notion/Linear-inspired aesthetic, same as stickeR1)
- Dark/light mode toggle
- Inline styles with palette object (mutable `C` object switching between `C_LIGHT`/`C_DARK`)
- Reports rendered as structured documents with collapsible sections
- Tables for financial data, Recharts for growth/valuation visuals
- References shown as clickable links
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

**Moat Score** = round(average of 5 metric scores)

The 5 metrics: (1) BVPS + Dividends + Buybacks Growth, (2) Earnings Growth, (3) Revenue Growth, (4) Operating Cash Flow Growth, (5) Free Cash Flow Growth

### Management Score (5 metrics)
Three return metrics use the **same 4-period, same-threshold scoring** as Moat:
(1) ROE, (2) ROIC, (3) ROA

Two debt metrics score independently:
(4) Net Debt to Earnings, (5) Net Debt to Free Cash Flow
- ≤ 3 years or net cash → 100
- Missing/undefined → 0
- Intermediate thresholds TBD (need test with heavily indebted company)

**Management Score** = round(average of 5 metric scores)

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
| 2.4 | EODHD prices — daily OHLCV with date range (Vite proxy for CORS) | `src/engines/prices.js`, `vite.config.js` |
| 2.5 | Cache layer (in-memory + localStorage, 24hr TTL financials, 1hr prices) | `src/engines/cache.js` |
| 2.6 | React hooks — `useFinancials(ticker)`, `usePrices(ticker, range)` | `src/hooks/useFinancials.js`, `src/hooks/usePrices.js` |
| 2.7 | EDGAR ticker search (local autocomplete by ticker or company name) | `src/engines/tickerSearch.js` |
| 2.8 | SEC EDGAR 13F guru engine — 41 guru CIKs, fetch/parse holdings, search | `src/engines/gurus.js`, `src/hooks/useGurus.js` |

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
- **TTM not yet in EDGAR engine**: EDGAR engine only has annual data so far. Need to add quarterly XBRL extraction for TTM support.
- **EDGAR company details missing some fields**: EDGAR submissions endpoint doesn't provide `description` or `totalEmployees`. These are deferred — may add later from 10-K parsing or other source.
- **Stock split adjustment**: Per-share values from EDGAR may diverge from Toolbox for historical years due to different split-adjustment methodologies. Progressive ratio observed (1.0 recent → ~1.46 for 2016 AAPL). Deferred for later investigation.
- **Claude API cost**: Generate sections individually (not whole reports) to control tokens. Use claude-sonnet-4-20250514 for efficiency.
- **localStorage size**: Store raw financials in cache (separate key), only computed results + user input in report objects.
- **Key Metrics Price category**: Price-based metrics (P/E, P/S, P/B, P/CF, P/FCF) only computed for the latest year using current stock price. Historical P/E (High PE, Low PE from Rule One Toolbox) would require historical price data per year — not yet implemented.
