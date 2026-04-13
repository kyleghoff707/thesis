# Codebase Concerns

**Analysis Date:** 2026-03-24

---

## Tech Debt

**Layers 2 and 3 of XBRL Engine Deliberately Disconnected:**
- Issue: Both Layer 2 (taxonomy hierarchy augmentation) and Layer 3 (AI tag classification) are commented out and dormant in `src/engines/edgarFinancials.js`. Lines 11-15 and 630-633 mark them as "disconnected — kept dormant." Line 1737-1739 forces `layer3Count = 0`. The `companyAdapter.js` and `taxonomyResolver.js` engines exist and are fully built but not wired into the extraction pipeline.
- Files: `src/engines/edgarFinancials.js` (lines 11, 630, 1737), `src/engines/companyAdapter.js`, `src/engines/taxonomyResolver.js`
- Impact: Coverage for companies outside the S&P 500 is Layer 1 only (~96% for S&P 500 but lower for smaller-cap names). AI reports on non-S&P-500 companies may have data gaps. The Layer 3 runtime AI path (~$0.01/company) exists in `companyAdapter.js` but is never invoked.
- Fix approach: Re-enable the imports and augmentation calls in `edgarFinancials.js` per the eng plan at `gstack/plans/gstack-xbrl-engine-strategy-eng-plan-20260318.md` section B1. Requires reconnecting the `augmentTaxonomy` and `getLayer3Suggestions` calls.

**`batchQuotes.js` Uses Same URL for Dev and Production:**
- Issue: `src/engines/batchQuotes.js` lines 35-37 construct the same `/api/yahoo-quotes/` URL for both `IS_DEV` and production. The `/api/yahoo-quotes/` endpoint is a Vite middleware (defined in `vite.config.js`) that doesn't exist in the compiled Tauri `.app`. This will silently fail (404) in production.
- Files: `src/engines/batchQuotes.js` (lines 35-37)
- Impact: All competitor peer market cap, PE, EPS, and book value data (shown in the Competitors tab) will be unavailable in the packaged macOS app. The batch quotes feed the Yahoo backfill path in `peerMetrics.js` as well.
- Fix approach: Add a production code path using direct Yahoo Finance v7 quote endpoint (same pattern as `prices.js`), or bundle `yahoo-finance2` as a Tauri sidecar.

**GuruFocus Production Scrape Falls Back to `return null`:**
- Issue: In Tauri production without `VITE_GURUFOCUS_KEY`, `src/engines/gurufocus.js` line 149 comments "GuruFocus is JS-heavy so this will likely return empty" and explicitly returns `null`. No actual extraction is attempted. The scrape mode that works in dev (via Vite middleware + cheerio) has no equivalent in production.
- Files: `src/engines/gurufocus.js` (lines 140-150)
- Impact: The GF Value, Graham Number, Peter Lynch Value, and DCF valuation reference data shown in the Valuation tab will never populate in the packaged app unless the user pays for the $25/mo API key.
- Fix approach: Document clearly in Settings UI that GuruFocus requires an API key. Consider disabling the UI section when data is unavailable rather than showing empty/missing indicators silently.

**IR Events Discovery Degrades to Single Pattern in Production:**
- Issue: In dev, `discoverIREventsUrl()` in `src/engines/companyEvents.js` uses the Vite `/api/ir-events` middleware which probes 19 URL candidates in parallel. In Tauri production (line 231), it falls back to a single hardcoded guess: `https://investors.${baseDomain}`. Most companies use variations like `ir.`, `corporate.`, or `/${baseDomain}/investor-relations`.
- Files: `src/engines/companyEvents.js` (lines 225-247)
- Impact: The IR Events link shown in the Overview tab will frequently be wrong or missing in the packaged app, pointing users to generic investor pages rather than events/presentations pages.
- Fix approach: Replicate the parallel probe loop in production using direct fetch (CORS-free in Tauri). The logic already exists in the Vite plugin — port it to a shared utility function called by both paths.

**Historical P/E Per Year Not Implemented:**
- Issue: CLAUDE.md "Known Risks" section explicitly flags this: "Historical P/E per year not yet implemented (would need historical price × FY mapping)." The `Valuation.jsx` computes an averaged `historicalPE` from daily price data, but this is an approximation, not a per-fiscal-year high/avg/low P/E.
- Files: `src/components/Valuation.jsx` (lines 408-415, 504)
- Impact: The Equity Bond calculator and Historical Buy Prices component use an averaged P/E across all years, which can be distorted by periods of abnormally high or low valuations. This affects the accuracy of historical MOS calculations shown in `HistoricalBuyPrices.jsx`.
- Fix approach: Map daily prices to fiscal years using `fiscalMonths` data already available in EDGAR statements, then compute high/avg/low P/E per year. This would unlock year-specific P/E inputs for sensitivity tables.

**REIT AFFO Uses Hardcoded 15% Maintenance CapEx:**
- Issue: `src/engines/industryOverlays.js` line 321 hardcodes `maintenanceCapex = Math.abs(capex) * 0.15` for AFFO computation. CLAUDE.md documents this explicitly: data center REITs (EQIX) are ~30-40%, industrial REITs (PLD) ~10-15%. The TODO comment at line 314 says AI reports should use the user's maintenance capex % from Valuation Calculators.
- Files: `src/engines/industryOverlays.js` (lines 314-322)
- Impact: AFFO is systematically understated for data center REITs and overstated for some industrial REITs. This flows into the Financials tab display and will flow into AI report generation once Phase 5-7 is built.
- Fix approach: When AI reports are built, pass the user's maintenance capex % (from `ValuationInputs`) through to the overlay computation. For the Financials tab, add a UI note that AFFO uses 15% default and users should adjust in Valuation.

**REIT FFO Missing for Post-2018 Companies:**
- Issue: `src/engines/industryOverlays.js` line 296 documents that `gain_loss_on_real_estate_sales` XBRL tag was discontinued by many REITs (e.g., PLD) after FY2018. FFO is computed as `net_income + da + impairment - gains`, so missing gains makes FFO approximate or overstated.
- Files: `src/engines/industryOverlays.js` (lines 294-305)
- Impact: FFO figures for major industrial and retail REITs from 2019+ will be slightly overstated. NAREIT-published FFO from earnings supplements should be preferred for AI reports.
- Fix approach: Flag FFO values computed with `gain_loss_on_real_estate_sales = 0` as approximate in provenance. In AI report generation, instruct the model to cross-reference NAREIT-published FFO.

**ROIC Formula Differs Between Peer Metrics and Core Engine:**
- Issue: `src/engines/peerMetrics.js` line 89-91 computes ROIC as `net_income / (equity + long_term_debt)` — omitting cash from invested capital. `src/engines/returnMetrics.js` line 30 uses the same formula and comments "NO cash subtraction — matches Toolbox." However `peerMetrics.js` also has a fallback (line 91) that uses `net_income / equity` when `long_term_debt` is null, making it equal to ROE — which is incorrect and will inflate ROIC for zero-debt companies like LULU in the Competitors tab.
- Files: `src/engines/peerMetrics.js` (lines 89-92), `src/engines/returnMetrics.js` (lines 28-35)
- Impact: Competitors with no long-term debt will show ROIC = ROE in the Competitors tab, inflating their apparent capital efficiency. This is inconsistent with how the main toolbox calculates the same metric.
- Fix approach: When `long_term_debt` is null, default to 0 (not skip) so `ROIC = net_income / equity` only when debt is genuinely zero, not when the Frames API didn't return a value.

---

## Known Bugs

**peerMetrics Fallback Tag Early-Exit Bug (Test-Documented):**
- Symptoms: In the Competitors tab, a peer company with revenue reported under `RevenueFromContractWithCustomerExcludingAssessedTax` (ASC 606) shows null revenue if any other peer has revenue under the primary `Revenues` tag.
- Files: `src/engines/peerMetrics.js` (lines 40-44), `src/engines/__tests__/peerMetrics.test.js` (line 189, comment "THIS IS THE BUG")
- Trigger: When the primary tag returns data for at least one peer, the `allHaveField` check on line 42 breaks early if any peer has data, even if other peers are still missing the field. This was caught in test but the test comment indicates the fix was not yet applied.
- Workaround: None — affected peers simply show missing data indicators in the Competitors tab.

---

## Security Considerations

**CSP Disabled in Tauri Production:**
- Risk: `src-tauri/tauri.conf.json` line 23 sets `"csp": null`. This disables Content Security Policy entirely in the native webview. While Tauri's IPC model provides some isolation, a null CSP means any injected script (e.g., via a malicious SEC filing HTML rendered in the app) has no sandbox restrictions.
- Files: `src-tauri/tauri.conf.json` (line 23)
- Current mitigation: Tauri v2's capability system (`src-tauri/capabilities/default.json`) limits IPC to `core:default` permissions only. The app does not use `tauri-plugin-fs` or shell commands.
- Recommendations: Define a restrictive CSP that allows only the external origins actually used (anthropic.com, sec.gov, finnhub.io, alphavantage.co, finviz.com, gurufocus.com, yahoo finance). This limits blast radius if any rendered HTML is malicious.

**API Keys Exposed in Compiled Vite Bundle:**
- Risk: `VITE_CLAUDE_KEY`, `VITE_FINNHUB_KEY`, and `VITE_ALPHA_VANTAGE_KEY` are inlined into the production JavaScript bundle at build time (this is standard Vite behavior for `VITE_` prefixed vars). Anyone with access to the compiled `.app` bundle can extract these keys from the JS files.
- Files: `src/engines/config.js`, `src-tauri/tauri.conf.json`
- Current mitigation: This is a single-user local desktop app — the user's own keys are exposed only to themselves. The `.env.local` file is gitignored.
- Recommendations: For the current single-user use case, this is acceptable. If the app ever moves toward multi-user distribution, keys must move to a backend service. Document this limitation explicitly in the Settings UI so the user understands the key storage model.

**SEC User-Agent Contains Placeholder Email:**
- Risk: Both SEC proxy entries in `vite.config.js` (lines 473, 500) set `User-Agent: StockAnalyzer/1.0 kylehoff@example.com`. SEC's API terms of service require a real contact email in the User-Agent string for automated requests. Using a placeholder email technically violates the SEC's bot policy and could result in rate limiting or IP blocking.
- Files: `vite.config.js` (lines 473, 500)
- Current mitigation: Only active in dev mode (Vite proxy). In Tauri production, the native webview sends requests directly without this header.
- Fix approach: Replace `kylehoff@example.com` with the user's real email address. Consider reading it from an env var or the Settings store so the user can configure it.

---

## Performance Bottlenecks

**2.8MB Company Assignments JSON Bundled Into App:**
- Problem: `industry-classification/thes1s-company-assignments.json` (97,910 lines, 2.8MB) is imported as a static JSON import in `src/engines/thes1sClassification.js` line 9. Vite will inline this into the JS bundle at build time.
- Files: `src/engines/thes1sClassification.js` (line 9), `industry-classification/thes1s-company-assignments.json`
- Cause: The file covers 5,758 companies and is required for instant peer discovery without network calls. The lazy index build (`ensureIndexes()`) defers parsing, but the data is still part of the initial bundle parse.
- Improvement path: Consider splitting into sector-level chunks and lazy-loading only the relevant sector when the user loads the Competitors tab. Alternatively, move to a build-time lookup table keyed by ticker only (not full CIK+taxonomy tree), reducing the size by ~60%.

**Competitors Tab Makes 22+ Parallel Frames API Calls Per Year:**
- Problem: `src/engines/peerMetrics.js` `fetchPeerFrameData()` issues up to 22 EDGAR Frames API requests per tag definition, batched 6 at a time with 100ms delays between batches. With multi-year scoring enabled, this multiplies by 10 years × 4 growth tags + current year metrics.
- Files: `src/engines/peerMetrics.js` (lines 16-52, 199-270), `src/hooks/useCompetitors.js`
- Cause: Each Frames request returns data for all ~10,000 SEC filers and is filtered in memory. These are large JSON payloads (100KB-2MB each). The per-request 100ms delays are conservative rate limiting.
- Improvement path: The Frames data is cached in IndexedDB (see `edgarFrames.js` with 10-year TTL for immutable data). On repeat visits, all calls are cache hits. The cold-load experience for the Competitors tab on a new ticker will still be slow (15-30 seconds). Consider showing a clear progress indicator rather than the current opacity-reduced loading state.

**edgarFinancials.js Is 1,884 Lines:**
- Problem: `src/engines/edgarFinancials.js` is the largest file in the codebase at 1,884 lines. It contains the taxonomy definitions, extraction logic, TTM computation, derived field calculations, industry overlay merging, fiscal year relabeling, and provenance tracking all in one file.
- Files: `src/engines/edgarFinancials.js`
- Cause: Organic growth as features were added; separation is complex because the taxonomy arrays reference helper functions in the same file.
- Improvement path: No immediate impact — the file is well-commented and internally organized with clear section headers. Splitting is a medium-term refactor, not urgent.

---

## Fragile Areas

**Finviz HTML Scraper in Production:**
- Files: `src/engines/finviz.js` (lines 119-127)
- Why fragile: Production Tauri path fetches `finviz.com/quote.ashx` HTML directly and parses it with `DOMParser`. Finviz has anti-scraping measures (User-Agent sniffing, occasional CAPTCHAs) and changes their HTML structure periodically. The `parseFinvizHtml()` function searches for a `table.snapshot-table2` CSS class that is subject to change without notice.
- Safe modification: When modifying `finviz.js`, always test both dev (Vite middleware + cheerio) and the production code path (DOMParser variant). The two parsers are separate implementations and can diverge.
- Test coverage: No tests exist for `finviz.js`.

**Compensation Proxy HTML Parser:**
- Files: `src/engines/compensation.js` (1,521 lines)
- Why fragile: Fetches DEF 14A proxy HTML from SEC EDGAR and parses compensation tables using string/regex matching and DOM traversal. The parser has a multi-step fallback (table structure → XBRL ECD → graceful degradation). Proxy filings vary enormously in HTML structure between companies and years. The compensation engine has the most `console.warn` calls in the codebase.
- Safe modification: Always test against the XBRL ECD fallback path. Run `npm run test` which includes `compensation.test.js`. The XBRL fallback at line 1042 is the safer path.
- Test coverage: `src/engines/__tests__/compensation.test.js` (779 lines) — the most thoroughly tested engine.

**Alpha Vantage Quarterly Mapping Approximation:**
- Files: `src/engines/transcripts.js` (lines 203-208)
- Why fragile: When Finnhub has no transcript match, the Alpha Vantage fallback derives the fiscal quarter from `Math.ceil(reportMonth / 3)` — a calendar quarter approximation. For companies with non-calendar fiscal years (e.g., SFM, LULU), this maps to the wrong fiscal quarter, causing transcript mismatches. The comment on line 207 acknowledges "correct for 80%+ of companies."
- Safe modification: No safe fix without a fiscal-quarter-to-calendar-quarter mapping. For now, transcript buttons for non-calendar FY companies may silently fetch the wrong quarter's transcript.
- Test coverage: No tests for `transcripts.js`.

**Report Data Stored Only in localStorage (No Backup):**
- Files: `src/hooks/useResearch.js`
- Why fragile: All research reports (One Pager, Pitch Deck, Full Story content) live in the `stock-analyzer-reports` localStorage key. There is no export, backup, or sync mechanism. If the user clears browser/Tauri storage, all report content is permanently lost. The `QuotaExceededError` handler at line 32 evicts caches and retries, but if the reports themselves become too large (e.g., after Phase 5-7 adds AI-generated content), the retry could also fail.
- Safe modification: Before implementing Phase 5-7 AI report generation, assess whether the full report payload (including generated text) could exceed the ~5MB localStorage budget for a single `JSON.stringify()`. Consider migrating reports to IndexedDB using the existing `cacheStore.js` infrastructure.
- Test coverage: No tests for `useResearch.js`.

**`discoverIREventsUrl` Production Fallback Returns Only Root IR Page:**
- Files: `src/engines/companyEvents.js` (lines 228-232)
- Why fragile: In Tauri production, the IR discovery returns `https://investors.${baseDomain}` — the investor relations root, not the events/presentations subpage. The CompanyEvents component then displays this link as if it were a valid events page. Users clicking it will land on a generic IR home page and have to navigate further.
- Safe modification: Consider making the production path also probe `investors.${baseDomain}/events` and `ir.${baseDomain}/events` with direct fetches before falling back to the root.
- Test coverage: No tests for `companyEvents.js`.

---

## Scaling Limits

**localStorage Budget for Reports:**
- Current capacity: Approximately 5MB across all localStorage keys in Tauri's WebKit webview. Current usage: reports JSON + cache metadata + validation results + settings.
- Limit: Once Phase 5-7 generates full AI text for One Pager, Pitch Deck, and Full Story sections, a single report with all three stages could contain 10,000-50,000 characters of generated text. At 20+ reports, this could exceed 5MB.
- Scaling path: Migrate the `stock-analyzer-reports` storage key from localStorage to IndexedDB (`cacheStore.js` already provides the infrastructure). This removes the 5MB ceiling entirely.

**Competitors Tab with 100+ Industry Peers:**
- Current capacity: Works well for industries with 10-50 peers. Industries with 100+ companies (e.g., Financial Services sector) may load slowly.
- Limit: The sparse peer filter (`completeness < 17%`) mitigates this, but tier switching to "sector" level could expose 200+ peers to the Frames API pipeline.
- Scaling path: Add a hard cap (e.g., top 50 by market cap) when peer count exceeds a threshold. The completeness filter handles most cases today.

---

## Dependencies at Risk

**Finviz (Free Scraping, No Terms of Service Agreement):**
- Risk: Finviz's terms prohibit automated scraping. The app uses Finviz for analyst estimates (EPS next 5Y, forward PE, target price) without an API key or formal agreement. Finviz may block access, implement CAPTCHA, or change HTML structure.
- Impact: Loss of analyst estimate data in the Valuation tab. The app degrades gracefully (shows missing indicators), but the FGR input loses one data source.
- Migration plan: If Finviz blocks access, the app already uses multiple analyst sources (Yahoo Finance via `analystEstimates.js` is the primary path). Finviz is supplementary.

**Yahoo Finance v8/v10 Unofficial Endpoints:**
- Risk: `prices.js` uses `query1.finance.yahoo.com/v8/finance/chart` and `analystEstimates.js` uses `v10/finance/quoteSummary`. These are unofficial endpoints that Yahoo has broken before. No API agreement or key.
- Impact: Loss of historical price data (breaks Valuation tab, Growth charts, historical buy prices). Loss of analyst estimates and earnings trends.
- Migration plan: `yahoo-finance2` package wraps these endpoints with crumb/cookie management. In Tauri production, the app calls them directly. If Yahoo enforces crumb auth in production, prices will stop loading. The dev path (Vite middleware via `yahoo-finance2`) would still work, but production would need a sidecar.

**GuruFocus Scrape Mode (Production Without API Key):**
- Risk: GuruFocus is JS-rendered. The production scrape path explicitly returns `null` (line 149 of `gurufocus.js`). The optional `$25/mo` API key is the only reliable production data source.
- Impact: GF Value and other GuruFocus metrics never appear in the packaged `.app` without the API key. The UI shows empty/missing states silently.
- Migration plan: Already documented — add a prominent Settings prompt encouraging the user to add the GuruFocus API key for production use.

---

## Missing Critical Features

**`aiResearch.js` Engine Does Not Exist:**
- Problem: The file `src/engines/aiResearch.js` is listed in CLAUDE.md as the planned implementation target for Phase 5 (Step 5.1), but the file has not been created. Phases 5-7 (One Pager, Pitch Deck, Full Story) are entirely blocked on this engine. The routes at `/research/:id/one-pager`, `/research/:id/pitch-deck`, and `/research/:id/full-story` all render `<StagePlaceholder>` components.
- Blocks: All Phase 5-8 work. The core value proposition of the app (AI-driven research reports) is not yet built.

**No Data Export or Backup for Reports:**
- Problem: Research reports exist only in localStorage with no export, JSON download, or backup mechanism. The Validation tab has an "Export JSON" button for validation results, but no equivalent exists for research reports.
- Blocks: Data portability, disaster recovery if storage is cleared.

**Sensitivity Tables Not Built:**
- Problem: `src/components/SensitivityTable.jsx` is listed in CLAUDE.md as "planned" and referenced in the Phase 6.4 implementation plan. The component file does not exist. Valuation calculators produce single values or ranges but no cross-tabulation of FGR × EPS × method.
- Blocks: Phase 8 polish, and the research patterns described in CLAUDE.md requirement #2.

---

## Test Coverage Gaps

**Most Engines Have No Tests:**
- What's not tested: `analystEstimates.js`, `batchQuotes.js`, `cache.js`, `cacheStore.js`, `companyDetails.js`, `companyEvents.js`, `config.js`, `edgar.js`, `edgarFrames.js`, `fgr.js`, `filingMarkdown.js`, `finviz.js`, `freeCashFlow.js`, `growthRates.js`, `gurufocus.js`, `gurus.js`, `industryClassifier.js`, `insiders.js`, `keyMetrics.js`, `nport.js`, `peers.js`, `priceStore.js`, `prices.js`, `returnMetrics.js`, `ruleOneScore.js`, `sicClassification.js`, `thes1sClassification.js`, `tickerAudit.js`, `tickerSearch.js`, `transcripts.js`, `valuation.js`, `validation.js`
- Files: `src/engines/__tests__/` (13 test files for ~40 engine files)
- Risk: Logic regressions in the financial calculation engines (growth rates, FCF, valuation calculators) could go undetected. The ROIC peer metrics bug documented above is an example of a bug that has a test noting it but not verifying the fix.
- Priority: High for `valuation.js` (buy price calculations), `growthRates.js` (Composite GR affects FGR), `fgr.js`, and `returnMetrics.js` (ROE/ROIC/ROA drives moat scoring). Medium for the data engines.

**No React Component Tests:**
- What's not tested: Zero test files exist for any component in `src/components/`. All 28 components are untested.
- Files: `src/components/` (28 files, no corresponding test files)
- Risk: The large components (`FinancialStatements.jsx` at 1,036 lines, `Competitors.jsx` at 772 lines, `Valuation.jsx` at 924 lines) have complex conditional rendering and calculation logic that could silently break.
- Priority: Medium — the Toolbox data display components are low-risk for regressions. The valuation calculation display (`ValuationCalculators.jsx`) is higher risk because errors affect investment decisions.

**Known Bug in Test Without Confirmed Fix:**
- What's not tested: The peerMetrics fallback tag early-exit bug at `src/engines/__tests__/peerMetrics.test.js` line 189 has a comment "THIS IS THE BUG" but the test is not marked as expected-to-fail. If the test is passing, the bug may be fixed in the production code but the comment was not updated. If the test is failing, CI would catch it.
- Files: `src/engines/__tests__/peerMetrics.test.js` (line 189), `src/engines/peerMetrics.js` (lines 40-44)
- Risk: Ambiguous state — run `npm test` and verify whether this test passes or fails before modifying `peerMetrics.js`.
- Priority: High — verify test state before any work on the Competitors tab.

---

*Concerns audit: 2026-03-24*
