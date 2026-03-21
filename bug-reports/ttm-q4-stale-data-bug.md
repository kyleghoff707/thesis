# TTM Q4 Bug — Stale Data When 10-K Is Latest Filing

**Date:** 2026-03-21
**Tickers investigated:** LULU (lululemon), CMG (Chipotle)
**Sources compared:** Thes1s XBRL engine, R1 Toolbox, Morningstar (MS)
**Status:** Fixed

---

## How We Found It

Manual comparison of TTM vs latest FY annual columns for LULU and CMG. Both companies had recently filed their annual 10-K (LULU FY ending Feb 2026, CMG FY ending Dec 2025). For companies whose latest quarter IS the last quarter of the fiscal year, TTM should be identical to the latest annual — it's the same 12-month period.

### LULU: TTM vs Latest FY (pre-fix)

| Line Item | Thes1s TTM | Thes1s Annual | MS TTM | MS Annual | Match? |
|-----------|------------|---------------|--------|-----------|--------|
| Revenue | $11,150.6M | $11,102.6M | $11,102.6M | $11,102.6M | Thes1s wrong |
| Net Income | $2,000.1M | $1,579.2M | $1,579.2M | $1,579.2M | Thes1s wrong ($421M off) |
| CFO | $2,232.0M | $1,602.5M | $1,602.5M | $1,602.5M | Thes1s wrong |
| Total Assets | $7,955.2M | $8,456.7M | — | $8,456.7M | Thes1s wrong ($501M off) |
| Free Cash Flow | $1,533.8M | $921.7M | — | — | Thes1s wrong |

Morningstar correctly showed TTM = FY annual for both LULU and CMG. Thes1s did not.

### CMG: R1 and MS (reference)

CMG was clean across R1 and MS — both showed TTM = FY2025 for all values. CMG is a December FY company, so no year-label complications. But Thes1s would have had the same Q4 staleness issue.

### R1 Toolbox: LULU lagging

R1 hadn't picked up LULU's new 10-K yet (latest annual was still FY ending Feb 2025). R1's TTM was computing from trailing quarters — a different problem (R1 data lag, not a bug in our engine).

---

## Root Cause Analysis

### The TTM formula

TTM for flow items (income statement, cash flow) uses:
```
TTM = prior_FY_annual + current_YTD - prior_year_same_quarter_YTD
```

When the latest quarter is Q4 (the last quarter of the fiscal year), the math should collapse:
```
TTM = FY(n-1) + FY(n) - FY(n-1) = FY(n)
```

So TTM = latest annual. Simple.

### The bug: Q4 is invisible

The function `findLatestQuarter()` in `src/engines/edgar.js` determines which quarter to use for TTM. Here's what it did:

```javascript
// BEFORE (broken)
if (e.form === '10-Q' && ['Q1', 'Q2', 'Q3'].includes(e.fp) && e.end > latestEnd) {
    latestEnd = e.end;
    latestInfo = { fy: e.fy, fp: e.fp, end: e.end };
}
```

Two filters made Q4 invisible:
1. **`form === '10-Q'`** — Q4 data comes from the annual 10-K filing, not a 10-Q. There is no separate 10-Q for Q4.
2. **`['Q1', 'Q2', 'Q3'].includes(e.fp)`** — Q4 has `fp === 'FY'` in XBRL, which was excluded.

### The cascade

Even if `findLatestQuarter` had returned a Q4 reference, the downstream helpers would have failed:

- `getQuarterlyYTD()` filters `form === '10-Q'` — would return null for Q4 10-K data
- `getQuarterlyInstant()` filters `form === '10-Q'` — would return null for Q4 10-K data

So the entire TTM pipeline was hardcoded to only work with Q1, Q2, and Q3.

### When did this matter?

Every company is affected during the window between their 10-K filing and their next Q1 10-Q filing. For example:
- CMG (Dec FY): 10-K filed ~Feb 2026, Q1 10-Q filed ~May 2026. TTM stale from Feb to May.
- LULU (Jan FY): 10-K filed ~Mar 2026, Q1 10-Q filed ~Jun 2026. TTM stale from Mar to Jun.
- AAPL (Sep FY): 10-K filed ~Nov 2025, Q1 10-Q filed ~Feb 2026. TTM stale from Nov to Feb.

This is a 2-3 month blind spot for EVERY company, EVERY year.

---

## The Fix

### Logic

When the latest filing is a 10-K (not a 10-Q), TTM is simply the annual data from that 10-K. No quarterly formula needed — the 10-K IS the trailing twelve months.

The key insight: compare the end dates of the latest 10-K and latest 10-Q. If the 10-K's period ends after the latest 10-Q's period, we're in the Q4 window and should use annual data directly.

### Change 1: `findLatestQuarter` (src/engines/edgar.js)

Now tracks both the latest 10-Q AND the latest 10-K. Returns whichever has the later end date.

```javascript
// AFTER (fixed)
// Track latest 10-Q (Q1/Q2/Q3) as before
if (e.form === '10-Q' && ['Q1', 'Q2', 'Q3'].includes(e.fp) && e.end > latestQEnd) {
    latestQEnd = e.end;
    latestQInfo = { fy: e.fy, fp: e.fp, end: e.end };
}
// NEW: also track latest 10-K
if (e.form === '10-K' && e.fp === 'FY' && e.end > latestKEnd) {
    latestKEnd = e.end;
    latestKInfo = { fy: e.fy, fp: 'FY', end: e.end };
}

// Return whichever is more recent
if (latestKInfo && (!latestQInfo || latestKInfo.end > latestQInfo.end)) {
    return latestKInfo;  // Q4 case: 10-K is newest
}
return latestQInfo;  // Normal case: 10-Q is newest
```

### Change 2: `extractTTMSection` (src/engines/edgarFinancials.js)

When `fp === 'FY'` (the Q4 case), bypasses the quarterly YTD formula entirely and returns the annual 10-K value directly via `getAnnualTotal()`. This function already existed and works for all statement types — income, balance sheet, and cash flow — because it simply returns the value from the 10-K filing regardless of whether it's a duration or instant item.

```javascript
// NEW: Q4 case — latest filing is a 10-K, TTM = full fiscal year
if (fp === 'FY') {
    val = getAnnualTotal(entries, fy);
} else if (sectionType === 'balance') {
    // existing Q1/Q2/Q3 balance sheet logic
} else {
    // existing Q1/Q2/Q3 flow item formula
}
```

### Change 3: Cache key bump (v8 → v9)

The TTM result is cached as part of the `edgar-statements` object. Bumped `edgar-statements:v8` to `edgar-statements:v9` so existing users automatically re-extract with the fixed logic.

### Change 4: Export `computeTTM` for testing

Added `computeTTM` to the module exports so unit tests can exercise the TTM pipeline directly with mock XBRL data.

---

## Edge Case Analysis

| Scenario | Latest 10-Q | Latest 10-K | Winner | TTM Source |
|----------|-------------|-------------|--------|------------|
| Mid-year (normal) | Q3 FY2025 (Sep 2025) | FY2024 (Dec 2024) | 10-Q | Formula: FY2024 + Q3_YTD(2025) - Q3_YTD(2024) |
| Just filed 10-K | Q3 FY2025 (Sep 2025) | FY2025 (Dec 2025) | 10-K | Annual: FY2025 directly |
| Q1 of next year | Q1 FY2026 (Mar 2026) | FY2025 (Dec 2025) | 10-Q | Formula: FY2025 + Q1_YTD(2026) - Q1_YTD(2025) |
| LULU (Jan FY) | Q3 FY2026 (Nov 2025) | FY2025 (Feb 2026) | 10-K | Annual: FY2025 directly |
| No 10-K yet (IPO) | Q2 FY2025 (Jun 2025) | None | 10-Q | Formula (normal) |
| No 10-Q yet (new FY) | None | FY2025 (Dec 2025) | 10-K | Annual: FY2025 directly |

All cases handled correctly by the end-date comparison.

---

## Regression Tests

5 new tests in `src/engines/__tests__/edgarFinancials.test.js` under the describe block "TTM Q4 bug: TTM should equal annual when 10-K is latest filing":

1. **TTM revenue** = FY2025 annual ($12B) when 10-K is latest
2. **TTM net income** = FY2025 annual ($1.8B) when 10-K is latest
3. **TTM total assets** (balance sheet instant) = FY2025 10-K value ($9B)
4. **TTM operating cash flow** = FY2025 annual ($2.5B) when 10-K is latest
5. **TTM quarter label** contains "FY" (not "Q3")

Mock data simulates a Dec-FY company with complete FY2024 + FY2025 10-K data and Q1-Q3 FY2025 10-Q data, where FY2025 10-K end date (2025-12-31) is later than Q3 end date (2025-09-30).

All tests confirmed failing before the fix (returned `undefined`) and passing after.

---

## Verification

| Check | Result |
|-------|--------|
| Engine unit tests | **330/330 pass** (10 test files) |
| New TTM tests | **5/5 pass** |
| Production build | Succeeds |
| Cache key | Bumped v8→v9 |

---

## Files Changed

| File | What changed |
|------|-------------|
| `src/engines/edgar.js` | `findLatestQuarter()` now also scans 10-K filings, returns whichever (10-Q or 10-K) has the later end date |
| `src/engines/edgarFinancials.js` | `extractTTMSection()` handles `fp='FY'` via `getAnnualTotal()`, `computeTTM` exported, cache key v8→v9 |
| `src/engines/__tests__/edgarFinancials.test.js` | 5 new TTM regression tests with mock XBRL data |
| `bug-reports/financial-data-discrepancies-rca.md` | Added Issue 5 summary to the master RCA |

---

## Related Context

- This bug existed since the TTM feature was first built — it was never correct for the Q4 window.
- The R1 Toolbox truth data for LULU is also stale (still shows FY ending Feb 2025 as latest annual). That's an R1 data lag issue, not our bug. MS truth data is current.
- The new R1 LULU CSV uploaded 2026-03-21 (`RuleOneToolbox_NAS_LULU_Consolidated_Financials_2026-03-21-10-0.csv`) still has the same numbers as the old one — R1 hasn't ingested LULU's new 10-K yet.
