# Guru Tab Validation — Implementation Plan

## Goal
Identify and fix discrepancies between Thes1s's guru 13F data and trusted third-party sources (Dataroma, WhaleWisdom, ValuSider, StockCircle, GuruFocus). Validate position counts, portfolio values, holdings, and quarter-over-quarter changes for all 43 gurus.

---

## Likely Root Causes (Found by Code Review)

Before designing the validation regime, I read through `gurus.js` line by line. Here are the most probable causes of the discrepancies you're seeing, ranked by impact:

### 1. Options Not Filtered Out (HIGH IMPACT)
**Line 182**: The code reads the `putCall` field from the XML but **never filters on it**. 13F filings include put options, call options, AND stock positions. The `putCall` element is `null` for equity positions and `"Put"` or `"Call"` for options.

Every major guru tracker (Dataroma, WhaleWisdom, GuruFocus, StockCircle) **excludes options** from the holdings display and position count. If Thes1s is counting options as regular positions, this would:
- **Inflate position counts** (sometimes dramatically — Bridgewater has hundreds of options positions)
- **Inflate portfolio values** (options notional values are included in the 13F value column)
- **Create "phantom" holdings** that don't appear on other sites
- **Mess up change detection** (an option expiring looks like a "sold" position)

**Fix**: In `parseInfoTable()`, after line 173 (the skip-placeholder check), add:
```js
// Skip options positions — only include equity holdings (putCall is null for stocks)
if (getText('putCall')) continue;
```

### 2. No Aggregation of Same-Company Share Classes (MEDIUM IMPACT)
13F filings list each CUSIP separately. Many companies have multiple CUSIPs (e.g., Alphabet has GOOG + GOOGL, Berkshire has BRK.A + BRK.B, Fox has FOXA + FOX). The app treats each as a separate position. Most guru trackers merge same-company holdings by matching on the first 6 digits of the CUSIP (the issuer identifier).

This inflates position counts and makes the portfolio look more diversified than it is.

**Fix**: After parsing, aggregate holdings that share the same 6-character CUSIP prefix (the "issuer" portion). Sum values and shares, keep the largest position's issuer name.

### 3. InfoTable XML Detection May Miss Some Filings (MEDIUM IMPACT)
**Lines 138-145**: The fallback logic for finding the infotable XML excludes files starting with `R`. Some filers use names like `R12345.xml` for their infotable. Also, some filings have multiple XML files (primary document + infotable), and the fallback could grab the wrong one.

Additionally, some filers put their infotable in a `.txt` file (tab-separated), not XML. These are missed entirely.

**Fix**: Improve the XML detection heuristic. Check for `type` field in the index.json items — the infotable typically has `type: "INFORMATION TABLE"` or similar.

### 4. Amendment Handling May Be Incomplete (LOW-MEDIUM IMPACT)
**Lines 101-124**: The code prefers `13F-HR/A` (amendments) over `13F-HR` for the same reportDate, which is correct. But some gurus file multiple amendments (13F-HR/A, 13F-HR/A/A, etc.), and the code may not catch all amendment forms. Also, if the amendment has a different reportDate than the original (rare but possible), it won't be matched.

### 5. Value Normalization Heuristic (LOW-MEDIUM IMPACT)
**Lines 193-204**: The thousand-vs-dollar detection uses median implied price < $1/share as the threshold. This is generally clever, but could fail for:
- Filers with many penny-stock holdings (median price naturally < $1)
- Filers with a mix of stocks and options (options have low implied prices, skewing the median)
- If options are filtered out (fix #1), this heuristic becomes more reliable

### 6. Submissions Pagination Not Handled (LOW IMPACT)
**Lines 86-96**: EDGAR's submissions endpoint returns up to 1,000 recent filings. If a filer has more than 1,000 total filings (rare for guru-type filers), older 13Fs are in separate paginated files referenced in `data.filings.files`. The code doesn't fetch these. This only affects very old filing history, not current/recent data.

---

## Validation Sources — What's Actually Usable

### Tier 1: Direct EDGAR Comparison (Ground Truth)
The raw 13F XML on EDGAR is the source of truth. Every third-party site derives from this. The best first validation step is to compare your parsed output against the raw XML for a few gurus manually.

**How**: For a given guru + quarter, download the actual infotable XML from EDGAR, manually count entries, check if options are included, verify total value computation. Compare to what Thes1s shows.

### Tier 2: Dataroma (Best Free Structured Comparison)
- **URL pattern**: `https://www.dataroma.com/m/holdings.php?m={CODE}` (e.g., `m=BRK` for Berkshire)
- **What it shows**: Position count, portfolio value, each holding with % of portfolio, shares, reported price
- **Key feature**: Dataroma **manually verifies** filings against EDGAR. They exclude options. They aggregate share classes. They track ~70 superinvestors, with significant overlap with your 43.
- **Scraping feasibility**: Simple HTML tables, no JavaScript rendering needed. Easy to parse with `fetch` + DOMParser or regex. No login required.
- **Limitation**: Dataroma tracks by their own fund codes, not CIK. You'll need to build a mapping (e.g., Ackman = `PSC`, Buffett = `BRK`, Pabrai = `PI`).
- **Best for**: Position count validation, portfolio value validation, top holdings comparison.

### Tier 3: WhaleWisdom (Most Complete, Partly Free)
- **URL pattern**: `https://whalewisdom.com/filer/berkshire-hathaway-inc` (uses slug)
- **What it shows**: Full portfolio with values, shares, changes. Free tier shows basic holdings.
- **Scraping feasibility**: JavaScript-rendered site, harder to scrape. However, their free tier shows enough data for spot-checking. Some data is behind a paywall.
- **Best for**: Cross-checking specific gurus that Dataroma doesn't cover.

### Tier 4: SEC EDGAR Raw XML (Ground Truth Manual Check)
- **URL**: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={CIK}&type=13F-HR&dateb=&owner=include&count=40`
- Then navigate to the specific filing's infotable XML
- **Best for**: Debugging specific discrepancies found via Dataroma comparison.

### Tier 5: Financial Modeling Prep (Free API, 250 req/day)
- **Endpoint**: `https://financialmodelingprep.com/api/v3/form-thirteen/AAPL?apikey=KEY` (by stock)
- **Endpoint**: `https://financialmodelingprep.com/api/v3/cik/{CIK}?apikey=KEY` (by CIK)
- FMP parses 13F filings and provides structured JSON. Good for programmatic comparison.
- Free tier: 250 requests/day.

### Tier 6: ValuSider / StockCircle / GuruFocus
- All JavaScript-rendered sites, harder to scrape programmatically
- Best used for manual spot-checks, not bulk automation
- GuruFocus has some API access but requires paid subscription

---

## Implementation Plan

### Phase 1: Fix Known Bugs First (Before Validation)

Before running a large-scale comparison, fix the two highest-impact issues identified in the code review. This will likely resolve the majority of discrepancies.

#### Step 1A: Filter out options positions

In `gurus.js`, function `parseInfoTable()`, after line 173 (the "No Securities" skip), add:

```js
// Skip options — 13F includes puts and calls, but guru trackers only show equity
const putCall = getText('putCall');
if (putCall) continue;
```

This single change will likely fix the position count inflation and phantom holdings issues for gurus who trade options (Bridgewater, Icahn, Ackman, Dalio, Tepper, etc.).

#### Step 1B: Aggregate same-company share classes (optional, lower priority)

After `parseInfoTable` returns, and before `enrichHoldings`, add an aggregation step:

```js
function aggregateByIssuer(holdings) {
  const byPrefix = new Map();
  for (const h of holdings) {
    // First 6 chars of CUSIP = issuer identifier
    const prefix = (h.cusip || '').substring(0, 6);
    const existing = byPrefix.get(prefix);
    if (existing) {
      existing.value += h.value;
      existing.shares += h.shares;
      // Keep the larger position's name/class info
      if (h.value > existing.originalValue) {
        existing.issuer = h.issuer;
        existing.titleOfClass = h.titleOfClass;
        existing.cusip = h.cusip; // Use the primary CUSIP
      }
    } else {
      byPrefix.set(prefix, { ...h, originalValue: h.value });
    }
  }
  return Array.from(byPrefix.values()).map(({ originalValue, ...rest }) => rest);
}
```

**Note**: This should be optional/configurable. Some users may want to see each share class separately. Consider a toggle.

#### Step 1C: Bump cache version

Change `GURU_CACHE_V` from `'v2'` to `'v3'` to invalidate stale cached data that included options.

### Phase 2: Build the Validation Harness

#### Step 2A: Create a Dataroma Comparison Script

Create `validation/guru-validation.py`:

```python
# For each guru that overlaps between Thes1s (43 gurus) and Dataroma (~70 superinvestors):
# 1. Fetch Dataroma's holdings page
# 2. Parse position count, portfolio value, top 10 holdings
# 3. Compare against Thes1s exported data
# 4. Report discrepancies
```

**Dataroma mapping** (you'll need to build this — here are the ones I know):
```python
THESIS_TO_DATAROMA = {
    '0001067983': 'BRK',    # Berkshire Hathaway (Buffett)
    '0001336528': 'PSC',    # Pershing Square (Ackman)
    '0001061768': 'BAU',    # Baupost (Klarman)
    '0001549575': 'PI',     # Dalal Street (Pabrai)
    '0001112520': 'akre',   # Akre Capital
    '0001061165': 'LP',     # Lone Pine (Mandel)
    '0000921669': 'icahn',  # Icahn
    '0001345471': 'trian',  # Trian (Peltz)
    '0001040273': '3P',     # Third Point (Loeb)
    '0001649339': 'SC',     # Scion (Burry)
    '0001350694': 'bwater', # Bridgewater (Dalio)
    # ... map the rest by visiting dataroma.com/m/managers.php
}
```

Dataroma's HTML is simple — holdings are in `<table>` elements. Parse with BeautifulSoup or regex.

**Comparison metrics per guru:**
1. **Position count**: Thes1s vs Dataroma. If Thes1s is significantly higher, options are likely leaking through.
2. **Portfolio value**: Should be within ~1% (both derive from the same 13F `value` column).
3. **Top 10 holdings by value**: Same companies? Same approximate values? Same portfolio percentages?
4. **Report date**: Same quarter?

#### Step 2B: Create a Thes1s Data Exporter

Create a Node.js script (`scripts/export-guru-data.mjs`) that:
1. For each guru, calls `fetchGuruWithChanges()`
2. Writes JSON to `validation/data/guru/{CIK}.json` with:
   - Position count
   - Total portfolio value
   - Report date
   - Array of holdings: `[{ issuer, cusip, ticker, value, shares, portfolioPct, putCall }]`

This gives the Python validation scripts a clean JSON to compare against.

#### Step 2C: Direct EDGAR XML Spot-Check

For 5 hand-picked gurus (Buffett, Ackman, Pabrai, Burry, Dalio), manually:
1. Go to EDGAR, find their latest 13F-HR filing
2. Download the infotable XML
3. Count total `<infoTable>` entries
4. Count entries where `<putCall>` is present (options)
5. Count entries where `<putCall>` is absent (equity)
6. Compare equity-only count against Thes1s position count

This takes 30 minutes and will immediately confirm whether the options filtering is the root cause.

### Phase 3: Bulk Validation

After the bug fixes from Phase 1 are applied and cache is cleared:

#### Step 3A: Re-run Dataroma comparison for all overlapping gurus (~20-30)

Generate a report:
```
Guru                | Thes1s Pos | Dataroma Pos | Δ   | Thes1s Value  | Dataroma Value | Δ%
Warren Buffett      | 41         | 41           | 0   | $267.2B       | $267.2B        | 0%
Bill Ackman         | 8          | 8            | 0   | $12.4B        | $12.4B         | 0%
Michael Burry       | 6          | 6            | 0   | $103.1M       | $103.1M        | 0%
Ray Dalio           | 432        | 432          | 0   | $19.2B        | $19.2B         | 0%
...
```

#### Step 3B: Use FMP API for programmatic cross-check

FMP's 13F endpoint returns parsed holdings as JSON. For each guru CIK, fetch from FMP and compare:
- Position count
- Total value
- Top holdings by CUSIP

This is fully automatable, 250 req/day on free tier (enough for all 43 gurus in one day with room to spare).

#### Step 3C: Validate quarter-over-quarter changes

For 5 gurus, compare Thes1s's "new/added/reduced/sold" detection against:
- Dataroma's activity view (`/m/activity.php?m=CODE&typ=a`)
- Manual comparison of raw EDGAR XMLs for current vs previous quarter

Change detection bugs are subtler than position counting bugs — they depend on correct CUSIP matching between quarters.

### Phase 4: Edge Case Testing

Test these known-difficult scenarios:
1. **Berkshire Hathaway** (Buffett) — Confidential treatment requests (some positions hidden)
2. **Bridgewater** (Dalio) — Hundreds of positions, heavy options usage, values in thousands vs dollars
3. **Scion** (Burry) — Small portfolio, frequent complete turnover, options-heavy
4. **Icahn** — Mix of equity and options, complex corporate structures
5. **Himalaya Capital** (Li Lu) — Very concentrated, few positions, may file late
6. **Rule One Fund** (Phil Town) — Recently formed, may have limited filing history
7. **Guy Spier** (Aquamarine) — Newer CIK, may have unusual filing patterns

---

## Agent Allocation

### Agent 1 — Bug Fixes
- Apply the options filter fix in `parseInfoTable()`
- Apply the share class aggregation (optional)
- Bump `GURU_CACHE_V` to `'v3'`
- Improve infotable XML detection heuristic
- Update CLAUDE.md with changes

### Agent 2 — Thes1s Data Exporter
- Build the Node.js export script
- Run it for all 43 gurus
- Save JSON output for comparison

### Agent 3 — Dataroma Scraper + Comparison
- Build the CIK-to-Dataroma-code mapping
- Write Python script to fetch and parse Dataroma holdings pages
- Generate comparison report

### Agent 4 — FMP API Comparison
- Sign up for free FMP key
- Write Python script to fetch 13F data from FMP for each guru CIK
- Cross-compare position counts, values, and top holdings

### Agent 5 — EDGAR Raw XML Spot-Checks
- For 5 gurus, manually download and examine the infotable XML
- Count equity vs options entries
- Document findings
- Verify the bug fixes resolved the discrepancies

### Agent 6 — Report + Remaining Fixes
- Aggregate all comparison results
- Identify any remaining systematic issues
- Implement fixes and re-validate

---

## Expected Outcome

After the options filter fix alone, I expect ~80% of the discrepancies to resolve. The remaining 20% will likely be:
- Share class aggregation differences (2 vs 1 position for Alphabet, etc.)
- Rounding differences in portfolio value (thousands vs dollars normalization)
- Edge cases with specific filing formats
- Dataroma may exclude certain small positions below a threshold

The validation process will give you high confidence that Thes1s's guru data matches the trusted sources, and the comparison infrastructure can be re-run each quarter as a regression test.

---

## Quick Win: The 30-Minute Manual Validation

If you want to confirm the root cause before running the full plan, do this right now:

1. Open Thes1s, load **Ray Dalio / Bridgewater** (CIK 0001350694)
2. Note the position count shown in Thes1s
3. Go to `dataroma.com/m/holdings.php?m=bwater` — note Dataroma's position count
4. If Thes1s shows significantly more positions, open the browser console and look at the data
5. Check if any holdings have a non-null `putCall` field — those are options leaking through

If Bridgewater has, say, 400 equity positions but 800 total (including options), that's a 2x inflation from options alone. This is almost certainly what's happening.