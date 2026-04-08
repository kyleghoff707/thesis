# Codebase Concerns

**Analysis Date:** 2026-03-25

## Overview

This document identifies technical debt, known limitations, and areas of concern in the SEC XBRL financial data normalization engine and supporting systems. Focus is on data accuracy, API resilience, cache invalidation, and architecture gaps.

---

## Tech Debt

### Layer 2 and Layer 3 XBRL Resolution — Currently Dormant

**Status:** Disabled but code retained
**Files:** `src/engines/edgarFinancials.js` (lines 11-15, 1738), `src/engines/taxonomyResolver.js`, `src/engines/companyAdapter.js`
**Issue:** Layer 2 (pre-built taxonomy JSON) and Layer 3 (AI tag classification) are fully implemented and validated but are commented out in production. The engine currently uses only Layer 1 (static 200-tag map).

**Impact:**
- Leaves ~4-7% of S&P 500 companies with coverage gaps that could be fixed via Layer 2 descendant tags
- No runtime AI classification for non-S&P 500 companies or companies with unusual reporting structures
- Single-layer extraction means no fallback for edge-case companies in different industries (banks reporting unique loan tags, REITs with property-specific depreciation, insurance with premium variants)

**Root cause:** Layer 2/3 were disabled during the refactoring to support industry overlays (Phase 4). The comment states "Layer 2/3 disconnected — kept dormant, not deleted" and references "B1 in eng plan" (gstack-xbrl-engine-strategy-eng-plan-20260318.md) but no re-enablement timeline exists.

**Fix approach:**
1. Understand why they were disconnected (likely integration complexity with overlay architecture)
2. Re-enable Layer 2 augmentation in `extractSection()` call chain
3. Add Layer 3 safeguard with confidence gating (<80% → "inferred" tag, don't treat as definitive)
4. Re-run S&P 500 coverage audit to measure improvement
5. Test with non-S&P 500 companies to confirm Layer 3 runtime AI works

---

## Known Bugs (Documented & Fixed)

### ✅ TTM Q4 Stale Data (FIXED)

**Status:** Fixed as of 2026-03-21
**Files:** `src/engines/edgar.js`, `src/engines/edgarFinancials.js`
**Original Issue:** When the latest filing was a 10-K (not a 10-Q), TTM calculation bypassed it and reported stale Q3 data. Affected every company during the 2-3 month window between their 10-K filing and the next Q1 10-Q. Examples: LULU (Feb 26 10-K, but TTM stale until Jun Q1 10-Q).

**What was broken:**
- `findLatestQuarter()` filtered `form === '10-Q'`, making Q4 (which comes from 10-K) invisible
- Q1/Q2/Q3 quarterly formula was applied even when 10-K was latest, producing stale values

**How it was fixed:**
- Track both latest 10-Q AND latest 10-K
- Return whichever has the later end date
- When Q4 (fp === 'FY'), bypass quarterly formula and return annual 10-K value directly
- Cache key bumped `v8 → v9` to force re-extraction

---

### ✅ Total Debt Over-Inflated (FIXED)

**Status:** Fixed as of 2026-03-21
**Files:** `src/engines/edgarFinancials.js`
**Original Issue:** Zero-debt companies with large operating lease liabilities were incorrectly classified as leveraged. LULU showed `total_debt = $2,272M` vs actual $0. The sanity check for missing debt tags fired incorrectly on companies with $0 financial debt.

**What was broken:**
- Sanity check: `if (total_debt / liabilities < 5%) → derive debt from (liabilities - known_non_debt)`
- For zero-debt retailers with high lease liabilities, `knownNonDebt` deductions were incomplete
- `taxes_payable` was missing from deduction buckets, causing unclassified liabilities to be misclassified as debt

**How it was fixed:**
- Gated the sanity check on `interest_expense > 0` (zero-debt companies have zero interest expense)
- Added `taxes_payable` as a new `BALANCE_TAXONOMY` field with proper deductions
- REITs/banks/insurance with genuine debt gaps still trigger the fallback (they have significant interest expense)

---

### ✅ Fiscal Year Label Offset (FIXED)

**Status:** Fixed as of 2026-03-21
**Files:** `src/engines/edgarFinancials.js`, `src/engines/edgar.js`
**Original Issue:** Companies with Jan/Feb fiscal year ends had year labels offset by -1. LULU FY ending Feb 2, 2025 was labeled "2024" (XBRL `fy` convention) instead of "2025" (calendar year convention matching R1/Morningstar).

**Affected companies:** LULU, NVDA, WMT, HD, TGT, CRM, CRWD, ROST, DG, SFM, MRVL, WDAY (all Jan FY ends)

**How it was fixed:**
- Detect if FY end month is Jan or Feb
- After all computation, remap all year keys by +1 before caching
- Applied to both annual and quarterly extraction paths
- Cache keys bumped to force re-extraction

---

## Known Limitations (By Design)

### Industry Overlay Approximations

**REIT FFO Approximation**

Files: `src/engines/edgarFinancials.js`, `src/engines/industryOverlays.js`, `src/engines/dataExport.js`

**Limitation:** FFO (Funds From Operations) is derived, not tagged in XBRL. After FY2018, many REITs discontinued reporting the underlying `gain_loss_on_real_estate_sales` tag, making post-2018 FFO approximate.

Formula: `FFO = net_income + depreciation + amortization - gain_loss_on_real_estate_sales`

**Impact:** FFO values for REIT years 2019+ are estimates. Exact values require cross-reference with NAREIT-published FFO or company investor relations documents.

**Where surfaced:** `src/engines/dataExport.js:buildCaveats()` line 291 — AI reports should cite this caveat.

**Fix approach:** When building AI report generation (Phase 5+), add a data source toggle allowing the user to provide exact NAREIT FFO or override the derived value.

---

**Insurance Float Approximation**

Files: `src/engines/industryOverlays.js`, `src/engines/dataExport.js`

**Limitation:** Insurance float is approximated from XBRL balance sheet items (`future_policy_benefits`, `unpaid_claims_reserves`, `unearned_premiums`). This reconstruction is accurate for pure-play insurers (MET, ALL) but fails for conglomerates like BRK where the float calculation is more complex.

**Impact:** BRK's reported float cannot be reliably reconstructed from standard us-gaap tags. Use with caution for multi-line insurers.

**Where surfaced:** `src/engines/dataExport.js:buildCaveats()` line 295

**Fix approach:** Flag high-risk float calculations at extraction time. For BRK and other conglomerates, recommend manual entry from company proxy or annual letter.

---

**AFFO Maintenance CapEx Hardcoded to 15%**

Files: `src/engines/industryOverlays.js`, `src/engines/edgarFinancials.js`

**Limitation:** AFFO (Adjusted Funds From Operations) requires subtracting maintenance CapEx. The overlay hardcodes maintenance CapEx at 15% of total CapEx.

```javascript
maintenance_capex = total_capex * 0.15  // fixed ratio
affo = ffo - maintenance_capex
```

This varies significantly by REIT subtype:
- EQIX (data center): ~30-40% maintenance ratio
- PLD (industrial): ~10-15% maintenance ratio
- Residential REITs: ~5-10%

**Impact:** AFFO for REITs outside industrial/office is inaccurate. High-capex companies like EQIX will show understated AFFO.

**Where surfaced:** `src/engines/industryOverlays.js` line 314 (TODO comment), `src/engines/dataExport.js` line 292

**Fix approach:** When AI report generation (Phase 5+) consumes AFFO, allow the user to override maintenance CapEx % per REIT subtype. Provide a lookup table: `{ 'data-center': 0.35, 'industrial': 0.12, 'residential': 0.08, ... }`

---

### Bank Overlay Limitations

Files: `src/engines/industryOverlays.js`

**Limitation:** Bank overlay provides NII, NIM, efficiency ratio, but doesn't fully capture:
- Loan portfolio breakdowns (commercial, residential, consumer — each with different loss provisioning)
- Interest rate sensitivity (duration gaps, basis risk) — requires market data not in XBRL
- Deposit stability (transaction vs savings) — XBRL doesn't distinguish

**Impact:** Growth rate analysis for banks is incomplete. Earnings growth doesn't reflect interest rate risk or deposit mix shifts.

**Where surfaced:** `src/engines/dataExport.js:buildCaveats()` line 298

**Fix approach:** Add a warning in the Competitors tab when analyzing banks: "NIM and efficiency ratio are primary metrics. Gross margin is not meaningful for banks."

---

## Cache Invalidation Risks

### IndexedDB TTL-Based Expiration Without Cleanup

Files: `src/engines/cacheStore.js`

**Issue:** Cache entries expire based on TTL (time-to-live), but the expired entries are not automatically cleared from IndexedDB. They're cleaned up lazily: only when a read attempts to access an expired entry does it get deleted.

```javascript
// cacheStore.js line 44-46
if (Date.now() >= record.expiresAt) {
  db.delete(store, key).catch(() => {});  // async, not awaited
  return null;
}
```

**Impact:**
- Over time, IndexedDB can accumulate expired entries, bloating the database
- On browsers with storage quota limits, the app could exhaust quota without visible feedback
- No UI for manual cache clearing or quota monitoring

**Risk level:** Medium — affects app performance over weeks/months of heavy use, not immediately.

**Fix approach:**
1. Add a periodic background cleanup task (e.g., weekly) that deletes all expired entries
2. Expose cache size metrics in Settings tab for user visibility
3. Add a "Clear Cache" button in Settings with TTL options (clear all vs clear >7 days old)
4. Monitor IndexedDB quota via `navigator.storage.estimate()` and warn user if >80% full

---

### No Cache Invalidation Trigger for External Data Changes

Files: `src/engines/edgarFinancials.js` (cache keys: `edgar-statements:v9`, `edgar-facts:v1`)

**Issue:** Cache keys include a version number (e.g., `v9`) but there's no mechanism to invalidate caches when:
- SEC EDGAR data is restated (company corrects a prior filing via 8-K or amended 10-K)
- A company changes fiscal year end (rare but happens)
- Taxonomy interpretation changes (e.g., ASC 606 adoption)

When a restatement is filed, the app continues serving the old cached values until the version number is manually bumped.

**Impact:** User sees stale financials for 1-24 hours after a restatement is filed, unaware that data has changed.

**Where this matters:** Companies that file 8-K amendments or corrected 10-K/A filings. Example: LULU filed a corrected 10-K in 2024 — users who had cached the original would see outdated numbers.

**Risk level:** Low for most users (restatements are rare), but high impact when they occur (conviction changes based on stale data).

**Fix approach:**
1. Add a check-on-load to see if EDGAR has a newer version of the filing
2. Detect restatements by comparing `accessionNumber` of latest annual vs cached value
3. If restatement detected, auto-clear cache key and re-fetch
4. Add a "Data Restated" indicator in the UI (Audit tab) to alert user

---

## API Rate Limit & Failure Mode Concerns

### Finnhub Transcript API — Premium-Only on Free Tier

Files: `src/engines/transcripts.js`

**Issue:** The Finnhub transcript list endpoint (`/stock/transcripts/list`) is premium-only. Free-tier API keys return 403 Forbidden.

```javascript
// transcripts.js line 35-37
if (!res.ok) {
  if (res.status === 403) cacheSet(cacheKey, [], 'events');
  return [];
}
```

The code silently caches an empty array, so the user never sees transcripts.

**Impact:** Earnings transcripts won't work unless the user upgrades to Finnhub paid. The app provides no feedback that the feature is disabled.

**Fix approach:**
1. Check `FINNHUB_KEY` presence and log a console warning if present but 403 is returned
2. Add a user-facing message in the Filings tab: "Transcripts require Finnhub premium subscription"
3. Provide an optional `ALPHA_VANTAGE_KEY` (free tier) as primary fallback for transcript search

---

### Alpha Vantage — 25 Calls/Day Rate Limit

Files: `src/engines/transcripts.js`

**Issue:** Alpha Vantage's free tier is limited to 25 API calls per day. There's no rate-limit detection or queuing — requests just fail silently once quota is hit.

**Impact:**
- If a user researches 5+ companies in one day (transcript search for each), they hit the limit
- Subsequent requests fail with no indication why
- User thinks transcripts aren't available, not that they hit a rate limit

**Fix approach:**
1. Detect 429 (Too Many Requests) or quota-exhausted error from Alpha Vantage
2. Cache the "quota hit" state for the day with TTL = time-to-midnight
3. Surface a message: "Transcript lookup limit reached today (Alpha Vantage free tier: 25/day). Try again tomorrow."
4. Suggest switching to Finnhub premium or SpotifyAPI alternative

---

### Yahoo Finance — CORS Blocked in Browser

Files: `src/engines/prices.js`, `vite.config.js`

**Issue:** Yahoo Finance doesn't send CORS headers, so direct browser fetch fails. The app works around this via Vite middleware proxy (dev) and Tauri native webview (prod).

```javascript
// prices.js line 7-8
// CORS: Yahoo doesn't send Access-Control-Allow-Origin, so browser fetch fails.
```

**Impact:**
- Breaks if the app ever migrates away from Tauri (e.g., to web-based deployment)
- Vite proxy adds ~500ms latency on each price fetch in dev mode
- No fallback if Yahoo API changes or becomes unavailable

**Risk level:** Low for current desktop app, high if future multi-user backend is added.

**Fix approach:** When planning multi-user (Phase X), add a server-side price cache proxy instead of relying on Vite middleware.

---

## Data Quality & Coverage Gaps

### S&P 500 Coverage Baseline — 91.7% Annual, 96.1% for Scoring-Critical Fields

Files: `gstack/plans/gstack-xbrl-engine-strategy-eng-plan-20260318.md`, validation reports

**Current State:**
- Tier 1 (scoring-critical, 23 fields): 96.1% coverage
- Tier 2 (display, 32 fields): 90.8% coverage
- Tier 3 (expanded, 30 fields): 83.9% coverage

**Remaining Gaps (Tier 1):**
- `dividends_per_share`: 81.3% — many companies don't pay dividends (legitimate zeros)
- `short_term_debt`: 84.9% — growth companies genuinely have no ST debt
- `current_portion_lt_debt`: 80.3% — some bundle into `DebtCurrent` or have none
- `shares_outstanding`: 94.0% — some companies only report in DEI namespace, not us-gaap

**Impact:**
- ~4% of companies are missing 1-3 critical fields despite the three-layer engine
- Scoring calculations (Rule One Score, growth rates) will use fallbacks or skip the company
- Undetected: which of these gaps are "legitimate zeros" vs actual data quality issues

**Fix approach:**
1. Audit the 4% gap companies to understand the root cause per field
2. Add company-level data quality indicators in Audit tab
3. For companies with gaps, show derivation path used instead of raw tag
4. Add user override capability: "I know this field value; let me enter it manually"

---

### Quarterly Data Accuracy — 92.8% Rollup Match Rate

Files: `src/engines/__tests__/morningstarQuarterlyAccuracy.test.js`

**Issue:** TTM quarterly calculations match Morningstar at 92.8% accuracy (was 100% before TTM Q4 fix). Remaining 7.2% are:
- Companies with unusual fiscal calendars (53-week years, mid-quarter earnings)
- Quarterly data availability lags (EDGAR publishes Q results 40+ days after period end)
- Complex stock splits during the quarter (recalculation timing)

**Impact:** TTM growth rates for companies with quarterly data mismatches will be off by 5-15%.

**Fix approach:**
1. Build a company-level "quarterly data quality score" in Audit tab
2. Flag quarters with >5% rollup mismatch
3. For research reports (Phase 5+), use annual data instead of TTM for companies with poor quarterly quality

---

### Derived Field Formulas — No Validation of Output Reasonableness

Files: `src/engines/edgarFinancials.js`, `src/engines/industryOverlays.js`

**Issue:** Derived fields are computed via hardcoded formulas (e.g., `liabilities = total_assets - equity`). There's no post-computation sanity check that the derived value is reasonable.

Examples of potential issues:
- Negative `working_capital` for seasonal businesses (not necessarily wrong, but worth flagging)
- `operating_income` derived from income statement components doesn't match reported GAAP operating income (due to reclassifications or unusual items)
- `free_cash_flow` negative despite positive net income (could indicate capex spike or working capital shift)

**Impact:** Derived fields may be mathematically correct but economically nonsensical. User trust in the data decreases if they spot obviously wrong derived values.

**Fix approach:**
1. Add reasonableness ranges for derived fields (e.g., working capital should be between -10% and +50% of revenue for most industries)
2. Flag derived values outside expected ranges as "review" in Audit tab
3. When building AI reports, include a note: "Derived from [formula]. Manual verification recommended."

---

## Performance Bottlenecks

### Peer Metrics Computation — O(n*m) for n Companies × m Metrics

Files: `src/engines/peerMetrics.js`, `src/hooks/useCompetitors.js`

**Issue:** When Competitors tab loads 20+ peers, the app:
1. Fetches EDGAR Frames data for each peer (20 API calls)
2. For each peer, computes 22 metrics (derived metrics, completeness scoring)
3. Compares against cached peer scores (multi-year lookup)

Total: ~20 × 22 + 20 × 3-year-lookups = expensive.

**Impact:** Competitors tab takes 15-30 seconds to load on slow connections, with sequential API calls creating bottlenecks.

**Where surfaced:** Comments in `useCompetitors.js` note "Progressive 3-phase loading" but implementation is still linear.

**Fix approach:**
1. Pre-compute peer metrics at build time for the current S&P 500 (ship pre-built scores with the app)
2. Update quarterly (via cronjob or user-triggered sync)
3. Only compute new/updated peers at runtime
4. Parallelize Frames API calls (batch 5 tickers per request if EDGAR supports)

---

## Fragile Areas

### SIC Code → Industry Type Mapping — 250 SIC codes, no validation

Files: `src/engines/sicClassification.js`, `src/engines/industryClassifier.js`

**Issue:** The SIC mapping is a simple lookup table. No validation that:
- Company's reported SIC code is current (companies don't update SIC frequently)
- SIC code is accurate (some companies misclassify themselves)
- Fallback industry type ('standard') is correct for unmapped SIC codes

**Impact:**
- REIT overlay won't apply if SIC is slightly off (e.g., SIC 6512 is real estate, but company reports 7389 "business services")
- Banks with SIC 6022 (state banks) but assigned SIC 6021 (national banks) get wrong overlay
- Unknown SIC codes always default to 'standard', losing industry context

**Risk level:** Medium — affects maybe 5-10% of companies with unusual business models.

**Fix approach:**
1. Add a user override in Toolbox: "Company Type: [Auto-Detected | Bank | REIT | Insurance | Standard]"
2. Store override in report metadata so it persists
3. Add a coverage audit for SIC mapping accuracy (compare our overlay choice vs Morningstar/Yahoo classification)

---

### Guru Holdings Data — 43 Gurus, Manual List with No Update Schedule

Files: `src/engines/gurus.js` (lines 48-93)

**Issue:** The guru list is hardcoded:
```javascript
export const GURUS = [
  { name: 'Warren Buffett', fund: 'Berkshire Hathaway', cik: '0000912057' },
  ...
  // 43 gurus total
]
```

No mechanism to:
- Add new gurus without a code change
- Detect if a guru has retired or stopped filing
- Validate CIK numbers are current

**Impact:**
- If a guru name changes or CIK changes, the app breaks silently (returns no holdings)
- New Rule One investors added to the list won't be available until next app release
- User might assume a guru has no holdings, when actually the data source is stale

**Risk level:** Low — gurus rarely change, but high impact when they do (Gurus tab shows "no holdings").

**Fix approach:**
1. Store guru list in a separate JSON file with version tracking
2. Update quarterly via GitHub releases or an in-app data sync
3. Add fallback: if CIK lookup fails, try alternative CIKs or fallback to SEC's company ticker list
4. Surface "Last updated: [date]" in the Gurus tab UI

---

## Security Considerations

### Claude API Key in Environment — Direct Fetch from Browser

Files: `src/engines/config.js`, `src/engines/companyAdapter.js` (Layer 3 AI)

**Issue:** The Claude API key is stored in `.env.local` and loaded into `VITE_CLAUDE_KEY`. When Layer 3 AI classification is re-enabled, the app will make direct Claude API calls from the browser using this key.

```javascript
// Potential Layer 3 code (currently dormant)
const res = await fetch('https://api.anthropic.com/v1/messages', {
  headers: { 'x-api-key': VITE_CLAUDE_KEY }
});
```

**Risk:** If the key is exposed in bundle source or network traffic, an attacker can:
- Burn through API quota by generating bogus tags
- Classify company data to learn business strategies
- Use the key to make other API calls

**Current mitigation:** Tauri desktop app doesn't expose the environment to browser DevTools, and API calls use HTTPS. The key never leaves the app process.

**Risk level:** Low for desktop app, critical if ever ported to web.

**Fix approach:**
1. Keep Claude API calls server-side if multi-user backend is added (Phase X)
2. Document in CLAUDE.md that browser-based deployment requires API key rotation and rate-limiting
3. When enabling Layer 3 for non-S&P 500 companies, use batch API calls (classify multiple companies at once) to reduce key exposure

---

## Missing Critical Features

### No Manual Data Override Capability

Files: None

**Issue:** If a user discovers incorrect XBRL data (restatement not yet in EDGAR, wrong SIC code, missing tag), they can't correct it. The app forces them to use incorrect data in research reports.

**Impact:** AI report generation (Phase 5+) will generate analyses based on incorrect data. User must manually edit the PDF after export (defeats the purpose of automation).

**Example:** LULU's SIC was wrong at one point; user had no way to override it without modifying the code.

**Fix approach:**
1. Add an "Overrides" object to report data model: `{ ticker, overrides: { sic_code: 6512, revenues_2024: 12345 } }`
2. In engines, check for overrides before returning computed values
3. Store overrides in report metadata and in localStorage
4. Surface override UI in Audit tab: "Override value: [field] [current] → [override]"

---

### No Data Recency Indicator

Files: `src/engines/cacheStore.js`

**Issue:** The app caches data with TTLs (EDGAR facts: 10 years, guru data: 30 days, prices: 1 day), but doesn't display when data was last fetched.

User sees financials and doesn't know:
- If the data is from this morning or 30 days ago
- If a restatement has been filed since the last fetch
- If the company just announced earnings and quarter end data isn't available yet

**Impact:** User makes investment decisions based on data they think is current but might be months old.

**Fix approach:**
1. Add a `fetchedAt` timestamp to all cached objects
2. Display in the UI: "Data as of: [date]. Refresh?" with a button
3. In Audit tab, show which engines have stale data
4. For production app (Phase 5+), warn if any financial data is >30 days old

---

## Quarterly Data Extraction — Limited to Last 4 Quarters

Files: `src/engines/edgarFinancials.js`, `src/engines/edgar.js`

**Issue:** The quarterly extraction only pulls data for the last 4 quarters (current Q1/Q2/Q3/Q4). Historical quarterly data (e.g., Q1 2022 earnings) isn't available.

**Impact:**
- User can't analyze quarterly trends over 5+ years (e.g., "have margins improved over time?")
- AI report generation (Phase 5+) can't show quarterly progression charts
- Seasonal business analysis (retailer December sales trend) is limited to last year

**Fix approach:**
1. Fetch all quarterly filings (not just latest 4) via EDGAR submissions endpoint
2. Store in IndexedDB under `edgar-quarterly-history:v1:TICKER`
3. In Valuation tab, add "Quarterly History" chart showing last 20 quarters
4. For AI reports, compute seasonal patterns from historical quarters

---

## Testing Coverage Gaps

### Industry Overlay — Limited Test Coverage for Edge Cases

Files: `src/engines/__tests__/industryOverlays.test.js`

**Issue:** Tests cover basic overlay application (bank, REIT, insurance) but don't test:
- Companies with multiple overlays (e.g., insurance company that owns a REIT subsidiary) — which overlay wins?
- Overlay field interactions (e.g., `net_interest_income` from overlay interferes with `net_income_loss` from base)
- SIC code boundary cases (e.g., SIC 6515 is "real estate agents/brokers" but shouldn't get REIT overlay)

**Impact:** Edge-case companies may get incorrect overlays, producing wrong growth rates and valuation.

**Risk level:** Low for S&P 500 (well-defined companies), medium for smaller companies with hybrid business models.

**Fix approach:**
1. Add test cases for companies with unclear classification (e.g., BRK — insurance + holding company)
2. Test overlay precedence rules (if a company matches multiple overlays, which is applied?)
3. Add a "Suggested Overlay" indicator in Audit tab with rationale

---

### Derived Field Test Coverage — 42 Derived Fields, Limited Bounds Testing

Files: `src/engines/__tests__/edgarFinancials.test.js`

**Issue:** Tests verify that derived fields are computed correctly for normal cases but don't test:
- Negative inputs (e.g., company reports negative depreciation due to XBRL error)
- Division by zero (e.g., computing ratios when denominator is 0 or null)
- Extreme values (e.g., company with $1B revenue and $0 equity → infinite ROE)

**Impact:** AI report generation could surface nonsensical ratios without warning.

**Fix approach:**
1. Add "bounds tests" for derived fields: verify output is within reasonable range
2. Add NaN/Infinity checks and replace with null if invalid
3. Add confidence scoring: computed values far from historical range get "low confidence" flag

---

## Recommendations by Priority

### High Priority

1. **Re-enable Layer 2/3 XBRL resolution** — Unlock the remaining 4-7% coverage gains and remove dead code
2. **Add manual data override capability** — Essential for AI report generation phase to handle XBRL data quality issues
3. **Implement cache invalidation for restated data** — Prevents stale data from contaminating research reports
4. **Add data recency indicators** — User awareness of when data was last fetched

### Medium Priority

5. **Audit SIC → industry type mapping accuracy** — Test against 100+ companies to verify correct overlay selection
6. **Add quarterly data history** — Support multi-year seasonal analysis and research narrative
7. **Parallelize peer metrics computation** — Make Competitors tab load in <5 seconds
8. **Add reasonableness checks for derived fields** — Flag obviously wrong values before they reach AI reports

### Low Priority

9. **Automate guru list updates** — Reduce manual maintenance, improve data freshness
10. **IndexedDB cleanup and quota monitoring** — Prevent app slowdown from cache bloat over months of use

---

*Concerns audit: 2026-03-25*
