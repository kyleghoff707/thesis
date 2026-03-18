# Implementation Plan: Events & News Section for Thes1s Overview Tab

## Goal

Add a new **"Upcoming Events & News"** collapsible section at the bottom of the Overview tab in `Toolbox.jsx`. This section shows upcoming and recent company events — earnings calls, SEC filings, dividend dates, press releases, annual meetings, and investor day events — scraped from SEC EDGAR data we already have plus the company's investor relations page. Think of the Rule One Toolbox's "Upcoming Company Events" panel (screenshot reference: shows earnings dates, conference calls, and quarterly result dates with calendar-style date badges).

---

## Architecture Overview

**New files to create:**
- `src/engines/companyEvents.js` — data fetching engine (SEC filings + IR page scraping)
- `src/hooks/useCompanyEvents.js` — React hook wrapping the engine
- `src/components/CompanyEvents.jsx` — UI component (used inside Overview tab)

**Files to modify:**
- `src/components/Toolbox.jsx` — add `<CompanyEvents />` inside the Overview tab, as the last section
- `src/engines/cache.js` — add `'events'` TTL category (6 hours, same as analyst data)
- `vite.config.js` — add proxy route for the company's IR page (if needed; see CORS section)

**No new dependencies needed.** We already have `cheerio` (used in Finviz scraping) and all the EDGAR infrastructure.

---

## Data Sources & What We Can Extract

### Source 1: SEC EDGAR Filings (already available — `fetchFilings()`)

We already fetch the full filing history via `fetchFilings(ticker)` in `src/engines/edgar.js`. From this data, we can derive upcoming/recent events by looking at filing patterns:

**Earnings-related (from 8-K filings):**
- Item `2.02` = "Results of Operations and Financial Condition" — this IS the earnings release. The filing date tells us when earnings were reported.
- From historical 8-K 2.02 filings, we can **predict the next earnings date** by looking at the pattern (most companies report on roughly the same schedule each quarter). Look at the last 4-8 filings with item 2.02, compute the average interval, and project forward.
- Also extract: Item `5.02` (officer departures/appointments), Item `2.01` (acquisitions), Item `1.01` (material agreements), Item `8.01` (other events — often press releases).

**Annual meeting / proxy (from DEF 14A filings):**
- DEF 14A proxy statements typically include the annual meeting date in the filing. We can extract the most recent DEF 14A filing date to estimate the next annual meeting (usually same month each year).

**10-K and 10-Q filing dates:**
- Historical pattern predicts when the next annual/quarterly report will be filed.

### Source 2: Company Investor Relations Page (new — scrape via Vite proxy)

The company's website is already available from `fetchCompanyInfo()` → `company.website`. Most public companies have an investor relations section at predictable URLs:
- `{website}/investor-relations`
- `{website}/investors`
- `{website}/ir`

From the IR page, we can potentially scrape:
- **Upcoming earnings date** (usually prominently displayed)
- **Dividend information** (ex-date, record date, payment date, amount)
- **Conference/event calendar** (investor days, industry conferences)
- **Press releases** (recent headlines with dates)

**However**, IR page scraping is unreliable across companies (different HTML structures, JS-rendered content, etc.). Treat this as a **best-effort enhancement** — the SEC-derived data should be the reliable backbone.

### Source 3: Yahoo Finance Events (alternative/supplement)

Yahoo's quoteSummary endpoint (already proxied at `/api/yahoo-summary/:ticker`) includes a `calendarEvents` module with:
- Earnings date (next expected)
- Dividend date, ex-date, payment date
- Revenue/earnings estimates

This is probably the most reliable source for the next earnings date and dividend info. We already have the proxy infrastructure. **Use this as the primary source for earnings date + dividends, with SEC pattern-matching as fallback.**

---

## Implementation Steps

### Step 1: Add events cache TTL

In `src/engines/cache.js`, add to the `TTL` object:

```js
events: 6 * 60 * 60 * 1000, // 6 hours (same as analyst data)
```

### Step 2: Create `src/engines/companyEvents.js`

This engine fetches and aggregates event data from multiple sources. Structure:

```js
import { cacheGet, cacheSet } from './cache';
import { fetchFilings, lookupCIK } from './edgar';

// ─── Constants ──────────────────────────────────────────────

// 8-K items that represent notable events
const NOTABLE_8K_ITEMS = {
  '2.02': { label: 'Earnings Release', icon: 'earnings', priority: 1 },
  '2.01': { label: 'Acquisition/Disposition', icon: 'deal', priority: 2 },
  '1.01': { label: 'Material Agreement', icon: 'contract', priority: 2 },
  '5.02': { label: 'Officer Change', icon: 'person', priority: 3 },
  '5.07': { label: 'Shareholder Vote', icon: 'vote', priority: 3 },
  '8.01': { label: 'Other Event', icon: 'info', priority: 4 },
  '7.01': { label: 'Regulation FD', icon: 'info', priority: 4 },
};

// ─── Yahoo Calendar Events ──────────────────────────────────

async function fetchYahooCalendarEvents(ticker) {
  // Use the existing yahoo-summary proxy
  // The quoteSummary endpoint with modules=calendarEvents returns:
  //   earningsDate (array of timestamps), exDividendDate, dividendDate
  // Also try modules=calendarEvents,earnings for estimates
  const IS_DEV = import.meta.env.DEV;
  const url = IS_DEV
    ? `/api/yahoo-summary/${ticker}?modules=calendarEvents`
    : `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=calendarEvents`;
  
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const cal = data?.quoteSummary?.result?.[0]?.calendarEvents;
    if (!cal) return null;
    
    return {
      earningsDate: cal.earnings?.earningsDate?.map(d => 
        new Date(d.raw * 1000).toISOString().slice(0, 10)
      ) || [],
      exDividendDate: cal.exDividendDate?.fmt || null,
      dividendDate: cal.dividendDate?.fmt || null,
      dividendAmount: cal.earnings?.earningsAverage?.raw || null, // This may vary
    };
  } catch {
    return null;
  }
}

// ─── SEC-Derived Events ─────────────────────────────────────

function deriveEventsFromFilings(filings) {
  const events = [];
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  
  // 1. Extract recent notable 8-K events (last 90 days)
  const recentCutoff = new Date(now);
  recentCutoff.setDate(recentCutoff.getDate() - 90);
  const recentCutoffStr = recentCutoff.toISOString().slice(0, 10);
  
  for (const f of filings) {
    if (!f.form.startsWith('8-K') || !f.items) continue;
    if (f.filingDate < recentCutoffStr) break; // filings are sorted desc
    
    const items = f.items.split(',').map(s => s.trim());
    for (const item of items) {
      const meta = NOTABLE_8K_ITEMS[item];
      if (meta) {
        events.push({
          type: 'filing',
          subtype: item,
          label: meta.label,
          date: f.filingDate,
          icon: meta.icon,
          priority: meta.priority,
          description: f.description || '',
          isPast: f.filingDate <= today,
          source: 'SEC EDGAR',
          url: `https://www.sec.gov/Archives/edgar/data/${f.cik}/${f.accessionNumber.replace(/-/g, '')}/${f.primaryDocument}`,
        });
        break; // one event per 8-K (use highest-priority item)
      }
    }
  }
  
  // 2. Predict next earnings date from historical 8-K 2.02 pattern
  const earningsFilings = filings
    .filter(f => f.form.startsWith('8-K') && f.items?.includes('2.02'))
    .slice(0, 8)
    .map(f => new Date(f.filingDate));
  
  if (earningsFilings.length >= 2) {
    // Compute average quarter interval
    const intervals = [];
    for (let i = 0; i < earningsFilings.length - 1; i++) {
      intervals.push(earningsFilings[i] - earningsFilings[i + 1]);
    }
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    
    // Project next from most recent
    const nextEarnings = new Date(earningsFilings[0].getTime() + avgInterval);
    if (nextEarnings > now) {
      events.push({
        type: 'earnings_estimate',
        label: 'Estimated Earnings Release',
        date: nextEarnings.toISOString().slice(0, 10),
        icon: 'earnings',
        priority: 0,
        description: 'Estimated based on historical filing pattern',
        isPast: false,
        source: 'SEC pattern',
        isEstimate: true,
      });
    }
  }
  
  // 3. Predict next 10-K filing
  const annualFilings = filings
    .filter(f => f.form === '10-K' || f.form === '20-F')
    .slice(0, 3)
    .map(f => new Date(f.filingDate));
  
  if (annualFilings.length >= 2) {
    const interval = annualFilings[0] - annualFilings[1];
    const next10K = new Date(annualFilings[0].getTime() + interval);
    if (next10K > now) {
      events.push({
        type: 'filing_estimate',
        label: 'Estimated 10-K Filing',
        date: next10K.toISOString().slice(0, 10),
        icon: 'annual',
        priority: 1,
        description: 'Estimated based on historical filing pattern',
        isPast: false,
        source: 'SEC pattern',
        isEstimate: true,
      });
    }
  }
  
  // 4. Predict next 10-Q filing
  const quarterlyFilings = filings
    .filter(f => f.form === '10-Q')
    .slice(0, 6)
    .map(f => new Date(f.filingDate));
  
  if (quarterlyFilings.length >= 2) {
    const intervals = [];
    for (let i = 0; i < Math.min(4, quarterlyFilings.length - 1); i++) {
      intervals.push(quarterlyFilings[i] - quarterlyFilings[i + 1]);
    }
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const next10Q = new Date(quarterlyFilings[0].getTime() + avgInterval);
    if (next10Q > now) {
      events.push({
        type: 'filing_estimate',
        label: 'Estimated 10-Q Filing',
        date: next10Q.toISOString().slice(0, 10),
        icon: 'quarterly',
        priority: 2,
        description: 'Estimated based on historical filing pattern',
        isPast: false,
        source: 'SEC pattern',
        isEstimate: true,
      });
    }
  }
  
  // 5. Recent major filings (10-K, 10-Q, DEF 14A in last 30 days)
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDayStr = thirtyDaysAgo.toISOString().slice(0, 10);
  
  const majorForms = new Set(['10-K', '10-Q', '10-K/A', '10-Q/A', 'DEF 14A', '20-F']);
  for (const f of filings) {
    if (f.filingDate < thirtyDayStr) break;
    if (majorForms.has(f.form)) {
      events.push({
        type: 'recent_filing',
        label: `${f.form} Filed`,
        date: f.filingDate,
        icon: f.form.startsWith('10-K') || f.form === '20-F' ? 'annual' : 
              f.form.startsWith('10-Q') ? 'quarterly' : 'proxy',
        priority: 1,
        description: f.description || '',
        isPast: true,
        source: 'SEC EDGAR',
        url: `https://www.sec.gov/Archives/edgar/data/${f.cik}/${f.accessionNumber.replace(/-/g, '')}/${f.primaryDocument}`,
      });
    }
  }
  
  return events;
}

// ─── Main Export ─────────────────────────────────────────────

export async function fetchCompanyEvents(ticker) {
  const cacheKey = `events:v1:${ticker.toUpperCase()}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;
  
  // Fetch all sources in parallel
  const [filings, yahooCal] = await Promise.allSettled([
    fetchFilings(ticker),
    fetchYahooCalendarEvents(ticker),
  ]);
  
  const allEvents = [];
  
  // SEC-derived events
  if (filings.status === 'fulfilled' && filings.value) {
    allEvents.push(...deriveEventsFromFilings(filings.value));
  }
  
  // Yahoo calendar events (earnings date + dividends)
  const yahoo = yahooCal.status === 'fulfilled' ? yahooCal.value : null;
  if (yahoo) {
    // Add confirmed earnings date (replaces SEC estimate if present)
    if (yahoo.earningsDate?.length > 0) {
      // Remove SEC earnings estimate since Yahoo has confirmed date
      const idx = allEvents.findIndex(e => e.type === 'earnings_estimate');
      if (idx !== -1) allEvents.splice(idx, 1);
      
      const earningsDateStr = yahoo.earningsDate[0]; // first date in range
      const earningsEndStr = yahoo.earningsDate.length > 1 ? yahoo.earningsDate[1] : null;
      
      allEvents.push({
        type: 'earnings',
        label: 'Earnings Report',
        date: earningsDateStr,
        dateEnd: earningsEndStr, // range if Yahoo gives two dates
        icon: 'earnings',
        priority: 0,
        description: earningsEndStr && earningsEndStr !== earningsDateStr
          ? `Expected ${earningsDateStr} to ${earningsEndStr}`
          : `Expected ${earningsDateStr}`,
        isPast: earningsDateStr <= new Date().toISOString().slice(0, 10),
        source: 'Yahoo Finance',
      });
    }
    
    // Add dividend dates
    if (yahoo.exDividendDate) {
      allEvents.push({
        type: 'dividend',
        label: 'Ex-Dividend Date',
        date: yahoo.exDividendDate,
        icon: 'dividend',
        priority: 1,
        description: yahoo.dividendDate ? `Payment: ${yahoo.dividendDate}` : '',
        isPast: yahoo.exDividendDate <= new Date().toISOString().slice(0, 10),
        source: 'Yahoo Finance',
      });
    }
  }
  
  // Sort: upcoming first (by date asc), then past (by date desc)
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = allEvents.filter(e => !e.isPast).sort((a, b) => a.date.localeCompare(b.date));
  const recent = allEvents.filter(e => e.isPast).sort((a, b) => b.date.localeCompare(a.date));
  
  const result = { upcoming, recent, fetchedAt: Date.now() };
  cacheSet(cacheKey, result, 'events');
  return result;
}
```

**Key design decisions:**
- Uses `Promise.allSettled` so if Yahoo fails, we still have SEC data
- SEC earnings prediction uses the average interval between historical 8-K item 2.02 filings
- Yahoo's confirmed earnings date replaces the SEC estimate when available
- Events are split into `upcoming` and `recent` arrays for the UI
- 6-hour cache — events don't change frequently

### Step 3: Create `src/hooks/useCompanyEvents.js`

Follow the same pattern as `useInsiders.js`:

```js
import { useState, useEffect } from 'react';
import { fetchCompanyEvents } from '../engines/companyEvents';

export function useCompanyEvents(ticker) {
  const [events, setEvents] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!ticker) {
      setEvents(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchCompanyEvents(ticker)
      .then(result => { if (!cancelled) setEvents(result); })
      .catch(err => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [ticker]);

  return { events, loading, error };
}
```

### Step 4: Create `src/components/CompanyEvents.jsx`

UI component — renders inside a `CollapsibleSection` in the Overview tab. Visual design inspired by the Rule One Toolbox screenshot (calendar-style date badges with event descriptions):

**Props:** `{ events, loading, error, irUrl }`

The `irUrl` prop is the company's base website (from `company.website`). The component uses it to build an "Investor Relations" link.

```
┌─────────────────────────────────────────────────────────┐
│ ▶ Upcoming Events & News                                │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  UPCOMING          Investor Relations ↗                 │
│  ┌──────┬──────────────────────────────────────────┐   │
│  │  14  │ Earnings Report                     🔗   │   │
│  │ MAY  │ Expected May 14 - May 15, 2026           │   │
│  │ 2026 │ Source: Yahoo Finance                     │   │
│  ├──────┼──────────────────────────────────────────┤   │
│  │  22  │ Estimated 10-Q Filing                    │   │
│  │ JUL  │ Estimated based on historical pattern    │   │
│  │ 2026 │ Source: SEC pattern           ⚬ estimate │   │
│  └──────┴──────────────────────────────────────────┘   │
│                                                         │
│  RECENT (Last 90 Days)       SEC Filings ↗             │
│  ┌──────┬──────────────────────────────────────────┐   │
│  │  12  │ Earnings Release                    🔗   │   │
│  │ FEB  │ Results of Operations...                  │   │
│  │ 2026 │ Source: SEC EDGAR                         │   │
│  ├──────┼──────────────────────────────────────────┤   │
│  │  12  │ 10-Q Filed                          🔗   │   │
│  │ FEB  │ Quarterly Report                         │   │
│  │ 2026 │ Source: SEC EDGAR                         │   │
│  └──────┴──────────────────────────────────────────┘   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Design specs:**
- Use the existing `CollapsibleSection` component, `defaultOpen={false}`
- Calendar date badge on the left: large day number, small month + year below (matches Rule One Toolbox style from screenshot)
- Left border accent color: teal for earnings, green for dividends, gray for filings, yellow for estimates
- "estimate" badge (small pill) on predicted events
- External link icon (↗) for events with SEC URLs
- **"UPCOMING" section header** — inline with an "Investor Relations ↗" link on the right. The link should try common IR paths in order: `{irUrl}/investor-relations`, `{irUrl}/investors`, `{irUrl}/ir`. Since we can't HEAD-check these in the browser without CORS issues, just link to `{irUrl}/investors` as the most common convention. Style: 12px, `C.accent` color, `textDecoration: 'none'`, with ↗ arrow. If `irUrl` is null/empty, don't render the link.
- **"RECENT" section header** — inline with an "SEC Filings ↗" link on the right pointing to the Filings tab on EDGAR: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={ticker}&type=&dateb=&owner=include&count=40`. Same styling as the IR link.
- Both section headers use `display: 'flex', justifyContent: 'space-between', alignItems: 'center'` to position the label left and the link right
- "UPCOMING" and "RECENT" labels: 11px, uppercase, `C.textMuted`, `letterSpacing: '0.04em'`, `fontWeight: 600`
- Use existing `C` palette colors and inline styles (consistent with codebase)
- If no events found, show a muted italic message

### Step 5: Wire into `Toolbox.jsx`

In `Toolbox.jsx`, at the top of the file:
1. Import `useCompanyEvents` and `CompanyEvents`
2. Call `const { events, loading: eventsLoading, error: eventsError } = useCompanyEvents(ticker);`
3. In the Overview tab's JSX, after the "Trading Activity" section (at the very bottom), add:

```jsx
{/* Events & News — independent of edgarStatements */}
<div style={{ marginTop: 28 }}>
  <CollapsibleSection title="Upcoming Events & News" defaultOpen={false}>
    <CompanyEvents
      events={events}
      loading={eventsLoading}
      error={eventsError}
      irUrl={company?.website}
    />
  </CollapsibleSection>
</div>
```

Place this AFTER the Trading Activity `<div>` and still inside the `{activeTab === 'overview' && (` block, but OUTSIDE the `{edgarStatements && (` conditional — this section should load independently (it fetches its own data via the hook).

---

## CORS / Proxy Notes

**Yahoo quoteSummary** — already proxied at `/api/yahoo-summary/:ticker` in `vite.config.js`. The `calendarEvents` module just needs to be passed as a query parameter. Check that the existing proxy passes through query params. If not, update the proxy target to include the modules param.

**SEC EDGAR** — already fully proxied. No changes needed.

**Company IR pages** — Skip for v1. IR page scraping is fragile (every company's site is different, many use JS rendering). The SEC + Yahoo combination should cover the core use cases. We can add IR scraping as a v2 enhancement if needed.

---

## Testing Checklist

After implementation, verify with a few tickers:
1. **AAPL** — should show upcoming earnings, dividend dates, recent 10-K/10-Q filings
2. **AMAT** — the company from the screenshot reference. Verify earnings date matches the May 14, 2026 date shown
3. **BRK-A** or **BRK-B** — no dividends, verify graceful handling
4. **A company you just loaded** — verify caching works (second load should be instant)

Check:
- [ ] Events load without blocking other Overview tab content
- [ ] Estimated dates show the "estimate" badge
- [ ] External links (↗) on individual events open SEC filings in new tab
- [ ] "Investor Relations ↗" link next to UPCOMING header opens company IR page in new tab
- [ ] "SEC Filings ↗" link next to RECENT header opens EDGAR filings page in new tab
- [ ] IR link doesn't render for companies with no website in EDGAR data
- [ ] Empty state renders cleanly when no events found
- [ ] Dark mode colors work correctly (test by toggling theme)
- [ ] Cache invalidation works (events refresh after 6 hours)

---

## What This Does NOT Include (Future Enhancements)

- **IR page scraping** — too fragile for v1, every company is different
- **Conference/industry event calendar** — would need a third-party data source
- **Push notifications** — this is a local desktop app, not needed
- **Stock split history** — already handled separately in `splits.js`
- **Analyst estimate changes** — already in `useAnalystData` hook

---

## Summary of File Changes

| File | Action | What |
|------|--------|------|
| `src/engines/companyEvents.js` | **CREATE** | Event data engine (SEC + Yahoo) |
| `src/hooks/useCompanyEvents.js` | **CREATE** | React hook for event data |
| `src/components/CompanyEvents.jsx` | **CREATE** | UI component with calendar badges |
| `src/components/Toolbox.jsx` | **MODIFY** | Import + wire hook + add section to Overview tab |
| `src/engines/cache.js` | **MODIFY** | Add `events: 6 * 60 * 60 * 1000` to TTL object |
| `vite.config.js` | **VERIFY** | Confirm yahoo-summary proxy passes query params |
