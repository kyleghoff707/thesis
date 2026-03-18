// Company Events engine — aggregates upcoming/recent events from SEC EDGAR + Yahoo Finance
// Sources: 8-K item codes, filing date patterns, Yahoo calendarEvents module

import { cacheGet, cacheSet } from './cache';
import { fetchFilings } from './edgar';

// ─── Constants ──────────────────────────────────────────────

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
  const IS_DEV = import.meta.env.DEV;
  // Fetch calendarEvents + assetProfile (for website, since EDGAR often has it empty)
  const url = IS_DEV
    ? `/api/yahoo-summary/${ticker}?modules=calendarEvents,assetProfile`
    : `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=calendarEvents,assetProfile`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const cal = data?.calendarEvents;

    return {
      earningsDate: cal?.earnings?.earningsDate?.map(d =>
        d.raw ? new Date(d.raw * 1000).toISOString().slice(0, 10)
              : d.fmt || null
      ).filter(Boolean) || [],
      exDividendDate: cal?.exDividendDate?.fmt || null,
      dividendDate: cal?.dividendDate?.fmt || null,
      website: data?.assetProfile?.website || null,
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
    const intervals = [];
    for (let i = 0; i < earningsFilings.length - 1; i++) {
      intervals.push(earningsFilings[i] - earningsFilings[i + 1]);
    }
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;

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

// ─── IR Events Page Discovery (separate cache) ──────────────

export async function discoverIREventsUrl(website) {
  if (!website) return null;

  const cacheKey = `ir-events:v1:${website}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const IS_DEV = import.meta.env.DEV;
  let url = null;

  if (!IS_DEV) {
    // In Tauri production, no CORS restrictions — try common pattern directly
    const hostname = new URL(website.startsWith('http') ? website : `https://${website}`).hostname;
    const baseDomain = hostname.replace(/^www\./, '');
    url = `https://investors.${baseDomain}`;
  } else {
    try {
      const res = await fetch(`/api/ir-events?website=${encodeURIComponent(website)}`);
      if (res.ok) {
        const data = await res.json();
        url = data.url || null;
      }
    } catch {
      // Probe failed — url stays null
    }
  }

  // Cache even null results so we don't re-probe constantly
  cacheSet(cacheKey, url || '__none__', 'events');
  return url;
}

// ─── Main Export ─────────────────────────────────────────────

export async function fetchCompanyEvents(ticker) {
  const cacheKey = `events:v1:${ticker.toUpperCase()}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  // Fetch SEC + Yahoo in parallel
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

      const earningsDateStr = yahoo.earningsDate[0];
      const earningsEndStr = yahoo.earningsDate.length > 1 ? yahoo.earningsDate[1] : null;

      allEvents.push({
        type: 'earnings',
        label: 'Earnings Report',
        date: earningsDateStr,
        dateEnd: earningsEndStr,
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
  const upcoming = allEvents.filter(e => !e.isPast).sort((a, b) => a.date.localeCompare(b.date));
  const recent = allEvents.filter(e => e.isPast).sort((a, b) => b.date.localeCompare(a.date));

  const result = { upcoming, recent, yahooWebsite: yahoo?.website || null, fetchedAt: Date.now() };
  cacheSet(cacheKey, result, 'events');
  return result;
}
