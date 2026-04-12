// Guru 13F Engine — fetches institutional holdings from SEC EDGAR
// 13F filings are quarterly, delayed 45 days. Long equity only (no shorts, options, or non-US).
// Supports multi-filing fetch for quarter-over-quarter change detection.

import { cacheGetAsync, cacheSet, hydrateFromIDB } from './cache';
import { getTickerSearchIndex } from './edgar';
import { edgarBase, secBase, dataUrl } from './apiBase';
import {
  parseInfoTable as sharedParseInfoTable,
  aggregateShareClasses as sharedAggregateShareClasses,
  enrichHoldings as sharedEnrichHoldings,
  computeChanges as sharedComputeChanges,
  GURUS as sharedGURUS,
  resolveIssuerTickers,
  CUSIP_TICKER_OVERRIDES,
} from '../../packages/sec-parsers/index.js';

// Re-export shared functions so existing consumers import from here
export const GURUS = sharedGURUS;
export { sharedParseInfoTable as parseInfoTable };
export { sharedAggregateShareClasses as aggregateShareClasses };
export { sharedEnrichHoldings as enrichHoldings };
export { sharedComputeChanges as computeChanges };

// ─── SEC URL helpers ────────────────────────────────────────

function edgarSubmissionsUrl(cik) {
  return `${edgarBase()}/submissions/CIK${cik}.json`;
}

function secArchiveUrl(cik, accessionPath, suffix) {
  const cleanCik = cik.replace(/^0+/, '');
  return `${secBase()}/Archives/edgar/data/${cleanCik}/${accessionPath}/${suffix}`;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================
// GURUS list, parseInfoTable, aggregateShareClasses, enrichHoldings, computeChanges
// are imported from packages/sec-parsers/ (shared with Worker cron jobs).

// ============================================================
// Core filing fetch pipeline
// ============================================================

// Get N most recent 13F filings from EDGAR submissions.
// Handles amendments: RESTATEMENT amendments replace the original,
// NEW HOLDINGS amendments (confidential treatment disclosures) are merged with the original.
async function getRecent13Fs(cik, count = 2) {
  // Cache the submissions response to avoid refetching for same guru
  const subsCacheKey = `guru-subs:${cik}`;
  let data = await cacheGetAsync(subsCacheKey);

  if (!data) {
    const url = edgarSubmissionsUrl(cik);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`EDGAR submissions error: ${res.status}`);
    data = await res.json();
    cacheSet(subsCacheKey, data, 'guru');
  }

  const filings = data.filings?.recent;
  if (!filings) return [];

  // Group by reportDate, tracking both originals and amendments
  const byReport = new Map();
  for (let i = 0; i < filings.form.length; i++) {
    const form = filings.form[i];
    if (form !== '13F-HR' && form !== '13F-HR/A') continue;

    const reportDate = filings.reportDate[i];
    const entry = {
      accessionNumber: filings.accessionNumber[i],
      filingDate: filings.filingDate[i],
      reportDate,
      primaryDocument: filings.primaryDocument[i],
      form,
    };

    if (!byReport.has(reportDate)) {
      byReport.set(reportDate, { original: null, amendments: [] });
    }
    const group = byReport.get(reportDate);
    if (form === '13F-HR/A') {
      group.amendments.push(entry);
    } else {
      group.original = entry;
    }
  }

  // Resolve each reportDate to a filing meta
  const results = [];
  for (const [, group] of byReport) {
    if (group.amendments.length === 0) {
      // No amendments — use original
      if (group.original) results.push(group.original);
    } else if (!group.original) {
      // Amendment without original (rare) — use latest amendment
      const latest = group.amendments.sort((a, b) => b.filingDate.localeCompare(a.filingDate))[0];
      results.push(latest);
    } else {
      // Both original and amendment(s) exist — use latest amendment,
      // but carry originalAccessionNumber so fetchSingleFiling can merge if NEW HOLDINGS
      const latest = group.amendments.sort((a, b) => b.filingDate.localeCompare(a.filingDate))[0];
      results.push({
        ...latest,
        originalAccessionNumber: group.original.accessionNumber,
      });
    }
  }

  return results
    .sort((a, b) => b.reportDate.localeCompare(a.reportDate))
    .slice(0, count);
}

// Fetch the filing index to find the infotable XML
// Find the infotable file from a filing's directory listing
// Shared by getInfoTableUrl() and auditGurus()
function findInfoTableFile(items) {
  // Tier 1: Match by type field (most reliable — SEC's own metadata)
  const byType = items.find(f =>
    f.type && f.type.toUpperCase().includes('INFORMATION TABLE') &&
    (f.name.endsWith('.xml') || f.name.endsWith('.txt'))
  );
  if (byType) return byType;

  // Tier 2: Filename contains 'infotable' (common convention)
  const byName = items.find(f =>
    f.name.toLowerCase().includes('infotable') &&
    (f.name.endsWith('.xml') || f.name.endsWith('.txt'))
  );
  if (byName) return byName;

  // Tier 3: Any XML that isn't the primary doc or index
  const fallback = items.find(f =>
    f.name.endsWith('.xml') &&
    !f.name.toLowerCase().includes('primary') &&
    !f.name.toLowerCase().includes('index')
  );
  return fallback || null;
}

async function getInfoTableUrl(cik, accessionNumber) {
  const accessionPath = accessionNumber.replace(/-/g, '');
  const indexUrl = secArchiveUrl(cik, accessionPath, 'index.json');
  const res = await fetch(indexUrl);
  if (!res.ok) throw new Error(`EDGAR index error: ${res.status}`);

  const data = await res.json();
  const items = data.directory?.item || [];
  const infoFile = findInfoTableFile(items);

  if (!infoFile) return null;
  return secArchiveUrl(cik, accessionPath, infoFile.name);
}

// parseInfoTable, aggregateShareClasses, enrichHoldings — removed, imported from packages/sec-parsers
// computeChanges — removed, imported from packages/sec-parsers
//
// ─── LEGACY CODE BOUNDARY ─────────────────────────────────────
// The following functions were moved to packages/sec-parsers/parseInfoTable.js.
// This block is kept as a comment for git history reference only.
// Actual implementations are now at packages/sec-parsers/.
//
// To find the old inline code, check git history for this file.
// ─── END LEGACY ───────────────────────────────────────────────

// Local copy for internal use. Uses browser's native DOMParser.
function _parseInfoTable(xmlText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'text/xml');

  // getElementsByTagNameNS with '*' matches any namespace (including none)
  const NS = '*';
  const entries = Array.from(doc.getElementsByTagNameNS(NS, 'infoTable'));
  const holdings = [];

  for (const entry of entries) {
    const getText = (tag) => {
      const el = entry.getElementsByTagNameNS(NS, tag)[0];
      return el?.textContent?.trim() || null;
    };

    const issuer = getText('nameOfIssuer');
    const shares = parseInt(getText('sshPrnamt')) || 0;
    const rawValue = parseFloat(getText('value')) || 0;

    // Skip placeholder "No Securities" entries
    if (!issuer || issuer === 'No Securities' || (shares === 0 && rawValue === 0)) continue;

    // Skip options (puts/calls) — only include equity positions
    // putCall is null for stocks, 'Put' or 'Call' for options
    if (getText('putCall')) continue;

    holdings.push({
      issuer,
      titleOfClass: getText('titleOfClass'),
      cusip: getText('cusip'),
      value: rawValue,
      shares,
      shareType: getText('sshPrnamtType'),
      putCall: getText('putCall'),
      discretion: getText('investmentDiscretion'),
      votingSole: parseInt(getText('Sole')) || 0,
      votingShared: parseInt(getText('Shared')) || 0,
      votingNone: parseInt(getText('None')) || 0,
    });
  }

  // Normalize value convention: some filers report in thousands (SEC spec),
  // others in actual dollars. Detect by checking if median implied price is
  // unreasonably low (< $1/share), which indicates values are in thousands.
  if (holdings.length > 0) {
    const impliedPrices = holdings
      .filter(h => h.shares > 0)
      .map(h => h.value / h.shares)
      .sort((a, b) => a - b);
    if (impliedPrices.length > 0) {
      const median = impliedPrices[Math.floor(impliedPrices.length / 2)];
      if (median < 1) {
        // Values are in thousands — multiply by 1000
        for (const h of holdings) h.value *= 1000;
      }
    }
  }

  return holdings;
}

// Aggregate holdings with the same issuer (first 6 CUSIP chars = issuer ID)
// Merges share classes like GOOG/GOOGL, BRK.A/BRK.B, FOX/FOXA into single positions
function _aggregateShareClasses(holdings) {
  const byIssuer = new Map();
  const noCusip = [];

  for (const h of holdings) {
    const prefix = (h.cusip || '').slice(0, 6);
    if (!prefix) { noCusip.push(h); continue; }
    if (!byIssuer.has(prefix)) byIssuer.set(prefix, []);
    byIssuer.get(prefix).push(h);
  }

  const merged = [];
  for (const [prefix, group] of byIssuer) {
    if (group.length === 1) {
      merged.push({ ...group[0], cusip6: prefix });
      continue;
    }
    // Multiple share classes — merge into one position
    group.sort((a, b) => b.value - a.value); // primary = largest value
    const primary = group[0];
    merged.push({
      issuer: primary.issuer,
      titleOfClass: group.map(g => g.titleOfClass).filter(Boolean).join(', '),
      cusip: primary.cusip,
      cusip6: prefix,
      value: group.reduce((s, g) => s + g.value, 0),
      shares: group.reduce((s, g) => s + g.shares, 0),
      shareType: primary.shareType,
      putCall: null,
      discretion: primary.discretion,
      votingSole: group.reduce((s, g) => s + g.votingSole, 0),
      votingShared: group.reduce((s, g) => s + g.votingShared, 0),
      votingNone: group.reduce((s, g) => s + g.votingNone, 0),
      mergedClasses: true,
      classCount: group.length,
    });
  }

  return [...merged, ...noCusip];
}

// Enrich raw holdings with portfolioPct and sort by value
function _enrichHoldings(holdings) {
  const totalValue = holdings.reduce((s, h) => s + h.value, 0);
  return {
    holdings: holdings
      .map(h => ({ ...h, portfolioPct: totalValue > 0 ? (h.value / totalValue) * 100 : 0 }))
      .sort((a, b) => b.value - a.value),
    totalValue,
  };
}

// Cache version — bump to invalidate stale data (v4: NEW HOLDINGS amendment merging)
const GURU_CACHE_V = 'v4';

// Check if a 13F-HR/A amendment is RESTATEMENT or NEW HOLDINGS
// by reading the primary_doc.xml. Returns 'NEW HOLDINGS', 'RESTATEMENT', or null.
async function getAmendmentType(cik, accessionNumber) {
  try {
    const accessionPath = accessionNumber.replace(/-/g, '');
    const url = secArchiveUrl(cik, accessionPath, 'primary_doc.xml');
    const res = await fetch(url);
    if (!res.ok) return null;
    const text = await res.text();
    const match = text.match(/<amendmentType>(.*?)<\/amendmentType>/);
    return match ? match[1].trim() : null;
  } catch {
    return null;
  }
}

// Fetch and parse a single infotable XML, returning raw parsed holdings
async function fetchInfoTableHoldings(cik, accessionNumber) {
  const xmlUrl = await getInfoTableUrl(cik, accessionNumber);
  if (!xmlUrl) return null;
  const xmlRes = await fetch(xmlUrl);
  if (!xmlRes.ok) return null;
  const xmlText = await xmlRes.text();
  return _parseInfoTable(xmlText);
}

// Fetch a single filing's holdings with per-filing cache (immutable once filed)
// Handles NEW HOLDINGS amendments by merging with original filing
async function fetchSingleFiling(cik, filingMeta) {
  const cacheKey = `guru-filing:${GURU_CACHE_V}:${cik}:${filingMeta.reportDate}`;
  const cached = await cacheGetAsync(cacheKey);
  if (cached) return cached;

  let raw;

  // If this is an amendment with an original filing, check amendment type
  if (filingMeta.form === '13F-HR/A' && filingMeta.originalAccessionNumber) {
    const amendType = await getAmendmentType(cik, filingMeta.accessionNumber);

    if (amendType === 'NEW HOLDINGS') {
      // NEW HOLDINGS = amendment adds previously confidential positions to original
      // Fetch both and merge
      const [originalHoldings, amendmentHoldings] = await Promise.all([
        fetchInfoTableHoldings(cik, filingMeta.originalAccessionNumber),
        fetchInfoTableHoldings(cik, filingMeta.accessionNumber),
      ]);

      raw = [...(originalHoldings || []), ...(amendmentHoldings || [])];
    } else {
      // RESTATEMENT or unknown — amendment replaces original (existing behavior)
      raw = await fetchInfoTableHoldings(cik, filingMeta.accessionNumber);
    }
  } else {
    raw = await fetchInfoTableHoldings(cik, filingMeta.accessionNumber);
  }

  if (!raw) return { filing: filingMeta, holdings: [], totalValue: 0, positionCount: 0, error: 'No infotable XML' };

  const aggregated = _aggregateShareClasses(raw);
  const { holdings, totalValue } = _enrichHoldings(aggregated);

  const result = { filing: filingMeta, holdings, totalValue, positionCount: holdings.length };
  cacheSet(cacheKey, result, 'guru');
  return result;
}

// ============================================================
// Multi-filing fetch + change detection
// ============================================================

// Fetch N filings for a guru
export async function fetchGuruFilings(guru, count = 2) {
  const filingMetas = await getRecent13Fs(guru.cik, count);
  if (filingMetas.length === 0) return { guru, filings: [], error: 'No 13F-HR filings found' };

  const filings = [];
  for (const meta of filingMetas) {
    const result = await fetchSingleFiling(guru.cik, meta);
    filings.push(result);
    if (filings.length < filingMetas.length) await sleep(100);
  }

  return { guru, filings };
}

// Compare current vs previous holdings by CUSIP to determine quarter-over-quarter changes.
// Returns enriched holdings with action, sharesChange, pctChange, etc.
function _computeChanges(currentHoldings, previousHoldings) {
  const prevByCusip = new Map();
  for (const h of previousHoldings) {
    prevByCusip.set(h.cusip, h);
  }

  const enriched = [];
  const seenCusips = new Set();

  for (const h of currentHoldings) {
    seenCusips.add(h.cusip);
    const prev = prevByCusip.get(h.cusip);

    if (!prev) {
      // New position — not in previous quarter
      enriched.push({
        ...h, action: 'new',
        sharesChange: h.shares, pctChange: 100,
        previousShares: 0, previousValue: 0,
        portfolioPctChange: h.portfolioPct,
      });
    } else if (h.shares > prev.shares) {
      enriched.push({
        ...h, action: 'added',
        sharesChange: h.shares - prev.shares,
        pctChange: prev.shares > 0 ? ((h.shares - prev.shares) / prev.shares) * 100 : 100,
        previousShares: prev.shares, previousValue: prev.value,
        portfolioPctChange: h.portfolioPct - (prev.portfolioPct || 0),
      });
    } else if (h.shares < prev.shares) {
      enriched.push({
        ...h, action: 'reduced',
        sharesChange: h.shares - prev.shares,
        pctChange: prev.shares > 0 ? ((h.shares - prev.shares) / prev.shares) * 100 : 0,
        previousShares: prev.shares, previousValue: prev.value,
        portfolioPctChange: h.portfolioPct - (prev.portfolioPct || 0),
      });
    } else {
      enriched.push({
        ...h, action: 'held',
        sharesChange: 0, pctChange: 0,
        previousShares: prev.shares, previousValue: prev.value,
        portfolioPctChange: h.portfolioPct - (prev.portfolioPct || 0),
      });
    }
  }

  // Sold-out positions: in previous but not current
  for (const [cusip, prev] of prevByCusip) {
    if (!seenCusips.has(cusip)) {
      enriched.push({
        issuer: prev.issuer, titleOfClass: prev.titleOfClass, cusip: prev.cusip,
        value: 0, shares: 0, shareType: prev.shareType, portfolioPct: 0,
        action: 'sold', sharesChange: -prev.shares, pctChange: -100,
        previousShares: prev.shares, previousValue: prev.value,
        portfolioPctChange: -(prev.portfolioPct || 0),
      });
    }
  }

  return enriched;
}

// Compute activity summary for a guru (current vs previous quarter)
export function computeGuruActivity(filingData) {
  const { guru, filings } = filingData;
  if (!filings || filings.length === 0) return null;

  const current = filings[0];
  const previous = filings.length > 1 ? filings[1] : null;

  const holdings = previous
    ? _computeChanges(current.holdings, previous.holdings)
    : current.holdings.map(h => ({
        ...h, action: 'held', sharesChange: 0, pctChange: 0,
        previousShares: 0, previousValue: 0, portfolioPctChange: 0,
      }));

  return {
    guru,
    reportDate: current.filing.reportDate,
    filingDate: current.filing.filingDate,
    totalValue: current.totalValue,
    positionCount: current.positionCount,
    newBuys: holdings.filter(h => h.action === 'new').length,
    added: holdings.filter(h => h.action === 'added').length,
    reduced: holdings.filter(h => h.action === 'reduced').length,
    soldOut: holdings.filter(h => h.action === 'sold').length,
    held: holdings.filter(h => h.action === 'held').length,
    holdings,
    filing: current.filing,
    previousFiling: previous?.filing || null,
  };
}

// Aggregate top buys across all gurus for the Latest tab
export function aggregateTopBuys(allActivities) {
  const byCusip = new Map();

  for (const activity of allActivities) {
    if (!activity?.holdings) continue;
    for (const h of activity.holdings) {
      if (h.action !== 'new' && h.action !== 'added') continue;

      const key = (h.cusip || '').slice(0, 6);
      const existing = byCusip.get(key);
      const valuePurchased = Math.max(0, h.value - (h.previousValue || 0));
      if (existing) {
        existing.totalValuePurchased += valuePurchased;
        existing.guruCount += 1;
        existing.guruNames.push(activity.guru.name);
        existing.totalPortfolioPct += h.portfolioPct;
        existing.maxPortfolioPct = Math.max(existing.maxPortfolioPct, h.portfolioPct);
        if (!existing.ticker && h.ticker) existing.ticker = h.ticker;
      } else {
        byCusip.set(key, {
          issuer: h.issuer, cusip: h.cusip, ticker: h.ticker || null,
          totalValuePurchased: valuePurchased,
          guruCount: 1, guruNames: [activity.guru.name],
          totalPortfolioPct: h.portfolioPct,
          maxPortfolioPct: h.portfolioPct,
        });
      }
    }
  }

  return Array.from(byCusip.values())
    .map(b => ({ ...b, avgPortfolioPct: b.totalPortfolioPct / b.guruCount }))
    .sort((a, b) => b.guruCount - a.guruCount || b.totalValuePurchased - a.totalValuePurchased)
    .slice(0, 10);
}

// Aggregate top holdings across all gurus (regardless of action)
export function aggregateTopHoldings(allActivities) {
  const byCusip = new Map();

  for (const activity of allActivities) {
    if (!activity?.holdings) continue;
    for (const h of activity.holdings) {
      if (h.value === 0) continue; // skip sold-out positions

      const key = (h.cusip || '').slice(0, 6);
      const existing = byCusip.get(key);
      if (existing) {
        existing.totalValue += h.value;
        existing.guruCount += 1;
        existing.guruNames.push(activity.guru.name);
        existing.maxPortfolioPct = Math.max(existing.maxPortfolioPct, h.portfolioPct);
        if (!existing.ticker && h.ticker) existing.ticker = h.ticker;
      } else {
        byCusip.set(key, {
          issuer: h.issuer, cusip: h.cusip, ticker: h.ticker || null,
          totalValue: h.value,
          guruCount: 1, guruNames: [activity.guru.name],
          maxPortfolioPct: h.portfolioPct,
        });
      }
    }
  }

  return Array.from(byCusip.values())
    .sort((a, b) => b.guruCount - a.guruCount || b.totalValue - a.totalValue)
    .slice(0, 10);
}

// ============================================================
// Fetch with changes (single + batch)
// ============================================================

// Fetch a single guru with change detection (2 filings)
export async function fetchGuruWithChanges(guru) {
  const actCacheKey = `guru-activity:${GURU_CACHE_V}:${guru.cik}`;
  const cached = await cacheGetAsync(actCacheKey);
  if (cached) {
    // Self-heal: resolve tickers if cached data lacks them
    if (cached.holdings?.some(h => !h.ticker && h.cusip)) {
      cached.holdings = await resolveTickersForHoldings(cached.holdings);
      cacheSet(actCacheKey, cached, 'guru');
    }
    return cached;
  }

  const filingData = await fetchGuruFilings(guru, 2);
  const activity = computeGuruActivity(filingData);

  if (activity) {
    // Resolve tickers before caching
    activity.holdings = await resolveTickersForHoldings(activity.holdings);

    cacheSet(actCacheKey, activity, 'guru');
    // Also write old-format cache so Stock Lookup / loadCachedPortfolios still works
    cacheSet(`guru:${guru.cik}`, {
      guru, filing: activity.filing,
      holdings: activity.holdings, totalValue: activity.totalValue,
      positionCount: activity.positionCount,
    }, 'guru');
  }

  return activity;
}

// Fetch all guru activities from D1 (single API call).
// Returns activities array or null if D1 is empty/unavailable.
async function fetchActivitiesFromD1() {
  try {
    const res = await fetch(dataUrl('/gurus/all'));
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.activities || data.activities.length === 0) return null;
    return data.activities;
  } catch {
    return null;
  }
}

// Fetch all gurus with change detection
export async function fetchAllWithChanges(onProgress) {
  // Try D1 first (single HTTP call vs 200+ SEC EDGAR calls)
  const d1Activities = await fetchActivitiesFromD1();
  if (d1Activities && d1Activities.length > 0) {
    // Resolve tickers (D1 cron doesn't resolve CUSIP → ticker)
    for (const activity of d1Activities) {
      if (activity.holdings?.some(h => !h.ticker && h.cusip)) {
        activity.holdings = await resolveTickersForHoldings(activity.holdings);
      }
      // Cache to IndexedDB for offline use / Stock Lookup compat
      if (activity.guru?.cik) {
        cacheSet(`guru-activity:${GURU_CACHE_V}:${activity.guru.cik}`, activity, 'guru');
        cacheSet(`guru:${activity.guru.cik}`, {
          guru: activity.guru, filing: activity.filing,
          holdings: activity.holdings, totalValue: activity.totalValue,
          positionCount: activity.positionCount,
        }, 'guru');
      }
    }
    return d1Activities;
  }

  // Fallback: fetch from SEC EDGAR (200+ calls, ~5 min)
  const results = [];
  for (let i = 0; i < GURUS.length; i++) {
    const guru = GURUS[i];

    // Check activity cache first
    const cached = await cacheGetAsync(`guru-activity:${GURU_CACHE_V}:${guru.cik}`);
    if (cached) {
      // Self-heal: resolve tickers if cached data lacks them
      if (cached.holdings?.some(h => !h.ticker && h.cusip)) {
        cached.holdings = await resolveTickersForHoldings(cached.holdings);
        cacheSet(`guru-activity:${GURU_CACHE_V}:${guru.cik}`, cached, 'guru');
      }
      results.push(cached);
      if (onProgress) onProgress(i + 1, GURUS.length, guru.name);
      continue;
    }

    try {
      const activity = await fetchGuruWithChanges(guru);
      if (activity) results.push(activity);
    } catch (err) {
      results.push({ guru, error: err.message, holdings: [] });
    }

    if (onProgress) onProgress(i + 1, GURUS.length, guru.name);

    // Rate limit: 5 API calls per guru (1 submissions + 2 index + 2 XML)
    if (i < GURUS.length - 1) await sleep(500);
  }
  return results;
}

// ============================================================
// History fetch (on-demand for expandable rows)
// ============================================================

// Fetch extended filing history for a guru (up to 8 quarters)
export async function fetchGuruHistory(guru, count = 8) {
  const filingMetas = await getRecent13Fs(guru.cik, count);
  if (filingMetas.length === 0) return { guru, filings: [] };

  const filings = [];
  for (const meta of filingMetas) {
    const result = await fetchSingleFiling(guru.cik, meta);
    filings.push(result);
    if (filings.length < filingMetas.length) await sleep(100);
  }

  return { guru, filings };
}

// Build per-CUSIP history from multiple filings (for expandable row charts)
export function buildHoldingHistory(filings, cusip) {
  const cusip6 = (cusip || '').slice(0, 6);
  return filings.map((f, idx) => {
    const holding = f.holdings.find(h => h.cusip === cusip)
      || f.holdings.find(h => (h.cusip || '').slice(0, 6) === cusip6);
    const prevFiling = filings[idx + 1];
    const prevHolding = prevFiling?.holdings.find(h => h.cusip === cusip)
      || prevFiling?.holdings.find(h => (h.cusip || '').slice(0, 6) === cusip6);

    const shares = holding?.shares || 0;
    const value = holding?.value || 0;
    const prevShares = prevHolding?.shares || 0;

    return {
      reportDate: f.filing.reportDate,
      shares,
      value,
      avgPrice: shares > 0 ? value / shares : 0,
      sharesChange: shares - prevShares,
      pctChange: prevShares > 0 ? ((shares - prevShares) / prevShares) * 100 : (shares > 0 ? 100 : 0),
    };
  });
}

// Fetch portfolio value history for the portfolio value chart
export async function fetchPortfolioValueHistory(guru, maxQuarters = 20) {
  const cacheKey = `guru-portfolio-history:${GURU_CACHE_V}:${guru.cik}`;
  const cached = await cacheGetAsync(cacheKey);
  if (cached) return cached;

  const filingMetas = await getRecent13Fs(guru.cik, maxQuarters);
  if (filingMetas.length === 0) return [];

  const history = [];
  for (const meta of filingMetas) {
    const result = await fetchSingleFiling(guru.cik, meta);
    history.push({
      reportDate: meta.reportDate,
      filingDate: meta.filingDate,
      totalValue: result.totalValue,
      positionCount: result.positionCount,
    });
    if (history.length < filingMetas.length) await sleep(100);
  }

  cacheSet(cacheKey, history, 'guru');
  return history;
}

// ============================================================
// Legacy single-filing fetch (backward compat)
// ============================================================

export async function fetchGuruHoldings(guru) {
  const cacheKey = `guru:${guru.cik}`;
  const cached = await cacheGetAsync(cacheKey);
  if (cached) return cached;

  const metas = await getRecent13Fs(guru.cik, 1);
  if (metas.length === 0) return { guru, holdings: [], filing: null, error: 'No 13F-HR filing found' };

  const filingResult = await fetchSingleFiling(guru.cik, metas[0]);
  if (filingResult.error) return { guru, holdings: [], filing: metas[0], error: filingResult.error };

  const result = {
    guru, filing: metas[0],
    holdings: filingResult.holdings, totalValue: filingResult.totalValue,
    positionCount: filingResult.positionCount,
  };

  cacheSet(cacheKey, result, 'guru');
  return result;
}

// ============================================================
// Search functions
// ============================================================

export function findGurusOwning(guruPortfolios, query) {
  const q = query.toUpperCase();

  return guruPortfolios
    .map(gp => {
      const matches = (gp.holdings || []).filter(h =>
        h.ticker?.toUpperCase() === q ||
        h.issuer?.toUpperCase().includes(q) ||
        h.cusip === q
      );
      if (matches.length === 0) return null;
      return {
        guru: gp.guru,
        filing: gp.filing,
        positions: matches,
        totalPortfolioValue: gp.totalValue,
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const aVal = Math.max(...a.positions.map(p => p.value));
      const bVal = Math.max(...b.positions.map(p => p.value));
      return bVal - aVal;
    });
}

// ============================================================
// Cache hydration (no network calls)
// ============================================================

// Load old-format portfolio cache (for Stock Lookup backward compat)
export async function loadCachedPortfolios() {
  const keys = GURUS.map(g => `guru:${g.cik}`);
  const results = await hydrateFromIDB('guru-data', keys);
  const portfolios = results.map(r => r.data);

  // Self-heal: resolve tickers for cached portfolios that lack them
  for (const p of portfolios) {
    if (p?.holdings?.some(h => !h.ticker && h.cusip)) {
      p.holdings = await resolveTickersForHoldings(p.holdings);
      if (p.guru) cacheSet(`guru:${p.guru.cik}`, p, 'guru');
    }
  }
  return portfolios;
}

// Load activity cache (for Latest tab + GuruPortfolio detail view)
export async function loadCachedActivities() {
  const keys = GURUS.map(g => `guru-activity:${GURU_CACHE_V}:${g.cik}`);
  const results = await hydrateFromIDB('guru-data', keys);
  const activities = results.map(r => r.data);

  // Self-heal: resolve tickers for cached activities that lack them
  for (const a of activities) {
    if (a?.holdings?.some(h => !h.ticker && h.cusip)) {
      a.holdings = await resolveTickersForHoldings(a.holdings);
      if (a.guru) cacheSet(`guru-activity:${GURU_CACHE_V}:${a.guru.cik}`, a, 'guru');
    }
  }
  return activities;
}

// Fetch all guru portfolios — legacy (uses old single-filing path)
export async function fetchAllGuruHoldings(onProgress) {
  const results = [];
  for (let i = 0; i < GURUS.length; i++) {
    const cached = await cacheGetAsync(`guru:${GURUS[i].cik}`);
    if (cached) {
      results.push(cached);
      if (onProgress) onProgress(i + 1, GURUS.length, GURUS[i].name);
      continue;
    }

    try {
      const result = await fetchGuruHoldings(GURUS[i]);
      results.push(result);
    } catch (err) {
      results.push({ guru: GURUS[i], holdings: [], error: err.message });
    }

    if (onProgress) onProgress(i + 1, GURUS.length, GURUS[i].name);

    if (i < GURUS.length - 1) await sleep(350);
  }
  return results;
}

// ============================================================
// Guru Audit — validate CIKs, fund names, and filing freshness
// ============================================================

const STALE_DAYS = 180;

function normalizeForAudit(s) {
  return (s || '')
    .toLowerCase()
    .replace(/\s*\/\s*[\w]+\s*\/?/g, '')
    .replace(/\b(llc|llp|l\.?l\.?c\.?|l\.?p\.?|inc|ltd|co|corp|plc|sa|ag|the|group|of|fund|partners|management|capital|investments?|advisors?|associates?|holdings?|financial|trust|foundation|bill|melinda|gates)\b/g, '')
    .replace(/[^a-z0-9]/g, '');
}

// ============================================================
// Ticker Resolution — wraps shared resolveIssuerTickers with
// browser-side localStorage CUSIP cache for fast-path lookups
// ============================================================

const CUSIP_TICKER_LS_KEY = 'sa-cusip-ticker-map:v2';

// One-time migration: clear old cache key so stale/wrong mappings don't persist
const CUSIP_MIGRATION_KEY = 'sa-cusip-ticker-migrated-v2';
if (typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function' && !localStorage.getItem(CUSIP_MIGRATION_KEY)) {
  try { localStorage.removeItem('sa-cusip-ticker-map'); } catch { /* ok */ }
  try { localStorage.setItem(CUSIP_MIGRATION_KEY, '1'); } catch { /* ok */ }
}

function loadCusipTickerMap() {
  try {
    const raw = localStorage.getItem(CUSIP_TICKER_LS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveCusipTickerMap(map) {
  try { localStorage.setItem(CUSIP_TICKER_LS_KEY, JSON.stringify(map)); } catch { /* full */ }
}

// Resolve tickers for an array of holdings using the EDGAR ticker search index.
// Wraps the shared resolveIssuerTickers with browser-side localStorage CUSIP cache.
export async function resolveTickersForHoldings(holdings) {
  let index;
  try {
    index = await getTickerSearchIndex();
  } catch {
    return holdings; // Can't resolve — return as-is
  }
  if (!index || index.length === 0) return holdings;

  // Fast-path: check localStorage CUSIP cache before running fuzzy matching
  const cusipMap = loadCusipTickerMap();
  const uncached = [];
  const cachedResults = holdings.map((h, i) => {
    if (h.ticker) return h;
    if (cusipMap[h.cusip]) return { ...h, ticker: cusipMap[h.cusip] };
    uncached.push(i);
    return h;
  });

  if (uncached.length === 0) return cachedResults;

  // Run shared resolution on uncached holdings
  const toResolve = uncached.map(i => cachedResults[i]);
  const resolved = resolveIssuerTickers(toResolve, index);

  // Merge results back and update cache
  let mapDirty = false;
  for (let j = 0; j < uncached.length; j++) {
    const idx = uncached[j];
    cachedResults[idx] = resolved[j];
    if (resolved[j].ticker && !cusipMap[resolved[j].cusip]) {
      cusipMap[resolved[j].cusip] = resolved[j].ticker;
      mapDirty = true;
    }
  }

  if (mapDirty) saveCusipTickerMap(cusipMap);
  return cachedResults;
}
