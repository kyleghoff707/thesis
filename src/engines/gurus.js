// Guru 13F Engine — fetches institutional holdings from SEC EDGAR
// 13F filings are quarterly, delayed 45 days. Long equity only (no shorts, options, or non-US).
// Supports multi-filing fetch for quarter-over-quarter change detection.

import { cacheGet, cacheSet } from './cache';
import { getTickerSearchIndex } from './edgar';

// ─── SEC URL helpers (same proxy pattern as edgar.js) ────────
// In dev: route through Vite proxy (adds User-Agent header).
// In Tauri production: call SEC directly (no CORS enforcement).
const IS_DEV = import.meta.env.DEV;

function edgarSubmissionsUrl(cik) {
  return IS_DEV
    ? `/api/edgar/submissions/CIK${cik}.json`
    : `https://data.sec.gov/submissions/CIK${cik}.json`;
}

function secArchiveUrl(cik, accessionPath, suffix) {
  const cleanCik = cik.replace(/^0+/, '');
  const base = IS_DEV ? '/api/sec' : 'https://www.sec.gov';
  return `${base}/Archives/edgar/data/${cleanCik}/${accessionPath}/${suffix}`;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================
// Guru List — CIK numbers verified against live EDGAR data
// ============================================================

export const GURUS = [
  { name: 'Bill Ackman', fund: 'Pershing Square Capital Management', cik: '0001336528' },
  { name: 'Jeffrey Ubben', fund: 'ValueAct Holdings', cik: '0001418814' },
  { name: 'Pat Dorsey', fund: 'Dorsey Asset Management', cik: '0001671657' },
  { name: 'Michael Larson', fund: 'Bill & Melinda Gates Foundation Trust', cik: '0001166559' },
  { name: 'Norbert Lou', fund: 'Punch Card Management', cik: '0001631664' },
  { name: 'Bruce Berkowitz', fund: 'Fairholme Capital Management', cik: '0001056831' },
  { name: 'Alex Roepers', fund: 'Atlantic Investment Management', cik: '0001063296' },
  { name: 'Fred Martin', fund: 'Disciplined Growth Investors', cik: '0001050442' },
  { name: 'Li Lu', fund: 'Himalaya Capital Management', cik: '0001709323' },
  { name: 'Glenn Greenberg', fund: 'Brave Warrior Advisors', cik: '0001553733' },
  { name: 'David Einhorn', fund: 'DME Capital Management', cik: '0001489933' },
  { name: 'Ako Capital', fund: 'Ako Capital LLP', cik: '0001376879' },
  { name: 'Stephen Mandel', fund: 'Lone Pine Capital', cik: '0001061165' },
  { name: 'Terry Smith', fund: 'Fundsmith LLP', cik: '0001569205' },
  { name: 'David Rolfe', fund: 'Wedgewood Partners', cik: '0000859804' },
  { name: 'Mason Hawkins', fund: 'Southeastern Asset Management', cik: '0000807985' },
  { name: 'Greg Alexander', fund: 'Conifer Management', cik: '0001773994' },
  { name: 'David Abrams', fund: 'Abrams Capital Management', cik: '0001358706' },
  { name: 'Seth Klarman', fund: 'Baupost Group', cik: '0001061768' },
  { name: 'Chuck Akre', fund: 'Akre Capital Management', cik: '0001112520' },
  { name: 'Francis Chou', fund: 'Chou Associates Management', cik: '0001389403' },
  { name: 'Mohnish Pabrai', fund: 'Dalal Street LLC', cik: '0001549575' },
  { name: 'Kahn Brothers', fund: 'Kahn Brothers Group', cik: '0001039565' },
  { name: 'Wallace Weitz', fund: 'Weitz Investment Management', cik: '0000883965' },
  { name: 'Harry Burn', fund: 'Sound Shore Management', cik: '0000820124' },
  { name: 'Chris Davis', fund: 'Davis Selected Advisers', cik: '0001036325' },
  { name: 'Ronald Muhlenkamp', fund: 'Muhlenkamp & Co.', cik: '0001133219' },
  { name: 'Donald Yacktman', fund: 'Yacktman Asset Management', cik: '0000905567' },
  { name: 'Lindsell Train', fund: 'Lindsell Train Ltd', cik: '0001484150' },
  { name: 'Carl Icahn', fund: 'Icahn Carl C', cik: '0000921669' },
  { name: 'Prem Watsa', fund: 'Fairfax Financial Holdings', cik: '0000915191' },
  { name: 'Nelson Peltz', fund: 'Trian Fund Management', cik: '0001345471' },
  { name: 'Daniel Loeb', fund: 'Third Point LLC', cik: '0001040273' },
  { name: 'Chris Hohn', fund: 'TCI Fund Management', cik: '0001647251' },
  { name: 'Warren Buffett', fund: 'Berkshire Hathaway', cik: '0001067983' },
  { name: 'Chris Bloomstran', fund: 'Semper Augustus Investments Group', cik: '0001115373' },
  { name: 'Guy Spier', fund: 'Aquamarine Zurich AG', cik: '0001953324' },
  { name: 'Tweedy Browne', fund: 'Tweedy, Browne Co. LLC', cik: '0000732905' },
  { name: 'William Von Mueffling', fund: 'Cantillon Capital Management', cik: '0001279936' },
  { name: 'Michael Burry', fund: 'Scion Asset Management', cik: '0001649339' },
  { name: 'David Tepper', fund: 'Appaloosa LP', cik: '0001656456' },
  { name: 'Phil Town', fund: 'Rule One Fund', cik: '0002040263' },
  { name: 'Ray Dalio', fund: 'Bridgewater Associates', cik: '0001350694' },
];

// ============================================================
// Core filing fetch pipeline
// ============================================================

// Get N most recent 13F filings from EDGAR submissions.
// Prefers 13F-HR/A (amendments) over 13F-HR for the same reportDate.
async function getRecent13Fs(cik, count = 2) {
  // Cache the submissions response to avoid refetching for same guru
  const subsCacheKey = `guru-subs:${cik}`;
  let data = cacheGet(subsCacheKey);

  if (!data) {
    const url = edgarSubmissionsUrl(cik);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`EDGAR submissions error: ${res.status}`);
    data = await res.json();
    cacheSet(subsCacheKey, data, 'financials');
  }

  const filings = data.filings?.recent;
  if (!filings) return [];

  // Group by reportDate, prefer amendments over originals
  const byReport = new Map();
  for (let i = 0; i < filings.form.length; i++) {
    const form = filings.form[i];
    if (form !== '13F-HR' && form !== '13F-HR/A') continue;

    const reportDate = filings.reportDate[i];
    const existing = byReport.get(reportDate);

    // Prefer 13F-HR/A over 13F-HR for the same quarter
    if (!existing || (form === '13F-HR/A' && existing.form !== '13F-HR/A')) {
      byReport.set(reportDate, {
        accessionNumber: filings.accessionNumber[i],
        filingDate: filings.filingDate[i],
        reportDate,
        primaryDocument: filings.primaryDocument[i],
        form,
      });
    }
  }

  return Array.from(byReport.values())
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

// Parse the 13F infotable XML into holdings
// Handles both namespaced (ns1:infoTable) and non-namespaced (infoTable) XML
export function parseInfoTable(xmlText) {
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
export function aggregateShareClasses(holdings) {
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
export function enrichHoldings(holdings) {
  const totalValue = holdings.reduce((s, h) => s + h.value, 0);
  return {
    holdings: holdings
      .map(h => ({ ...h, portfolioPct: totalValue > 0 ? (h.value / totalValue) * 100 : 0 }))
      .sort((a, b) => b.value - a.value),
    totalValue,
  };
}

// Cache version — bump to invalidate stale data (v3: options filter + share class aggregation + infotable detection)
const GURU_CACHE_V = 'v3';

// Fetch a single filing's holdings with per-filing cache (immutable once filed)
async function fetchSingleFiling(cik, filingMeta) {
  const cacheKey = `guru-filing:${GURU_CACHE_V}:${cik}:${filingMeta.reportDate}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const xmlUrl = await getInfoTableUrl(cik, filingMeta.accessionNumber);
  if (!xmlUrl) return { filing: filingMeta, holdings: [], totalValue: 0, positionCount: 0, error: 'No infotable XML' };

  const xmlRes = await fetch(xmlUrl);
  if (!xmlRes.ok) return { filing: filingMeta, holdings: [], totalValue: 0, positionCount: 0, error: `XML fetch: ${xmlRes.status}` };

  const xmlText = await xmlRes.text();
  const raw = parseInfoTable(xmlText);
  const aggregated = aggregateShareClasses(raw);
  const { holdings, totalValue } = enrichHoldings(aggregated);

  const result = { filing: filingMeta, holdings, totalValue, positionCount: holdings.length };
  cacheSet(cacheKey, result, 'financials');
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
export function computeChanges(currentHoldings, previousHoldings) {
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
    ? computeChanges(current.holdings, previous.holdings)
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
  const cached = cacheGet(actCacheKey);
  if (cached) return cached;

  const filingData = await fetchGuruFilings(guru, 2);
  const activity = computeGuruActivity(filingData);

  if (activity) {
    cacheSet(actCacheKey, activity, 'financials');
    // Also write old-format cache so Stock Lookup / loadCachedPortfolios still works
    cacheSet(`guru:${guru.cik}`, {
      guru, filing: activity.filing,
      holdings: activity.holdings, totalValue: activity.totalValue,
      positionCount: activity.positionCount,
    }, 'financials');
  }

  return activity;
}

// Fetch all gurus with change detection
export async function fetchAllWithChanges(onProgress) {
  const results = [];
  for (let i = 0; i < GURUS.length; i++) {
    const guru = GURUS[i];

    // Check activity cache first
    const cached = cacheGet(`guru-activity:${GURU_CACHE_V}:${guru.cik}`);
    if (cached) {
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
  const cached = cacheGet(cacheKey);
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

  cacheSet(cacheKey, history, 'financials');
  return history;
}

// ============================================================
// Legacy single-filing fetch (backward compat)
// ============================================================

export async function fetchGuruHoldings(guru) {
  const cacheKey = `guru:${guru.cik}`;
  const cached = cacheGet(cacheKey);
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

  cacheSet(cacheKey, result, 'financials');
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
export function loadCachedPortfolios() {
  const results = [];
  for (const guru of GURUS) {
    const cached = cacheGet(`guru:${guru.cik}`);
    if (cached) results.push(cached);
  }
  return results;
}

// Load activity cache (for Latest tab + GuruPortfolio detail view)
export function loadCachedActivities() {
  const results = [];
  for (const guru of GURUS) {
    const cached = cacheGet(`guru-activity:${GURU_CACHE_V}:${guru.cik}`);
    if (cached) results.push(cached);
  }
  return results;
}

// Fetch all guru portfolios — legacy (uses old single-filing path)
export async function fetchAllGuruHoldings(onProgress) {
  const results = [];
  for (let i = 0; i < GURUS.length; i++) {
    const cached = cacheGet(`guru:${GURUS[i].cik}`);
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

export async function auditGurus(onProgress) {
  const results = [];

  for (let i = 0; i < GURUS.length; i++) {
    const g = GURUS[i];
    if (onProgress) onProgress(i + 1, GURUS.length, g.name);

    const result = { ...g, issues: [], ok: true };

    try {
      const url = edgarSubmissionsUrl(g.cik);
      const res = await fetch(url);
      if (!res.ok) { result.issues.push(`EDGAR returned ${res.status}`); result.ok = false; results.push(result); continue; }

      const data = await res.json();
      result.edgarName = data.name || '??';

      // Name mismatch check
      if (normalizeForAudit(result.edgarName) !== normalizeForAudit(g.fund)) {
        result.issues.push(`Name mismatch: ours="${g.fund}" — EDGAR="${result.edgarName}"`);
      }

      // Find latest 13F
      const f = data.filings?.recent;
      if (!f) { result.issues.push('No filings data'); result.ok = false; results.push(result); continue; }

      let latest = null;
      for (let j = 0; j < f.form.length; j++) {
        if (f.form[j] === '13F-HR' || f.form[j] === '13F-HR/A') {
          latest = { form: f.form[j], filed: f.filingDate[j], report: f.reportDate[j], accession: f.accessionNumber[j] };
          break;
        }
      }

      if (!latest) { result.issues.push('No 13F filings found'); result.ok = false; results.push(result); continue; }

      result.latestFiled = latest.filed;
      result.reportDate = latest.report;

      // Staleness check
      const age = Math.floor((Date.now() - new Date(latest.filed).getTime()) / 86400000);
      if (age > STALE_DAYS) {
        result.issues.push(`Stale: last filed ${age} days ago (${latest.filed})`);
      }

      // Position count — fetch the infotable XML
      const accPath = latest.accession.replace(/-/g, '');
      const indexUrl = secArchiveUrl(g.cik, accPath, 'index.json');
      const indexRes = await fetch(indexUrl);
      if (indexRes.ok) {
        const indexData = await indexRes.json();
        const items = indexData.directory?.item || [];
        const infoFile = findInfoTableFile(items);

        if (infoFile) {
          const xmlUrl = secArchiveUrl(g.cik, accPath, infoFile.name);
          const xmlRes = await fetch(xmlUrl);
          if (xmlRes.ok) {
            const xml = await xmlRes.text();
            const entries = xml.match(/<(?:\w+:)?infoTable>/g) || [];
            result.positions = entries.length;
            if (entries.length <= 1 && xml.includes('No Securities')) {
              result.positions = 0;
              result.issues.push('Empty portfolio ("No Securities")');
            }
          }
        } else {
          result.issues.push('No infotable XML found');
        }
      }

      if (result.issues.length > 0) result.ok = false;
    } catch (e) {
      result.issues.push(`Error: ${e.message}`);
      result.ok = false;
    }

    results.push(result);
    if (i < GURUS.length - 1) await sleep(150);
  }

  return results;
}

// ============================================================
// Ticker Resolution — fuzzy match issuer names to tickers
// ============================================================

const CUSIP_TICKER_LS_KEY = 'sa-cusip-ticker-map';

function loadCusipTickerMap() {
  try {
    const raw = localStorage.getItem(CUSIP_TICKER_LS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveCusipTickerMap(map) {
  try { localStorage.setItem(CUSIP_TICKER_LS_KEY, JSON.stringify(map)); } catch { /* full */ }
}

// Strip common suffixes for fuzzy matching
function normalizeIssuer(name) {
  return (name || '')
    .toUpperCase()
    .replace(/\b(INC|CORP|CO|LTD|LLC|LP|PLC|NV|SA|SE|AG|GROUP|HOLDINGS|ENTERPRISES|INTERNATIONAL|TECHNOLOGIES)\b/g, '')
    .replace(/\b(CL\s*[A-C]|CLASS\s*[A-C]|SHS|COM|COMMON|ORD|ORDINARY|NEW|THE)\b/g, '')
    .replace(/[.,\-/()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Resolve tickers for an array of holdings using the EDGAR ticker search index.
// Checks a persistent CUSIP→ticker localStorage map first, then fuzzy matches.
export async function resolveTickersForHoldings(holdings) {
  let index;
  try {
    index = await getTickerSearchIndex();
  } catch {
    return holdings; // Can't resolve — return as-is
  }
  if (!index || index.length === 0) return holdings;

  const cusipMap = loadCusipTickerMap();
  let mapDirty = false;

  // Build a normalized name→ticker lookup from the EDGAR index
  const nameIndex = new Map();
  for (const entry of index) {
    const norm = normalizeIssuer(entry.name);
    if (norm && !nameIndex.has(norm)) {
      nameIndex.set(norm, entry.ticker);
    }
  }

  const resolved = holdings.map(h => {
    // Already has a ticker
    if (h.ticker) return h;

    // Check CUSIP cache
    if (cusipMap[h.cusip]) return { ...h, ticker: cusipMap[h.cusip] };

    // Fuzzy match: exact normalized name
    const normIssuer = normalizeIssuer(h.issuer);
    let ticker = nameIndex.get(normIssuer) || null;

    // Fallback: startsWith match (catches "ALPHABET" matching "ALPHABET INC CL A")
    if (!ticker) {
      for (const [norm, t] of nameIndex) {
        if (norm.startsWith(normIssuer) || normIssuer.startsWith(norm)) {
          ticker = t;
          break;
        }
      }
    }

    if (ticker) {
      cusipMap[h.cusip] = ticker;
      mapDirty = true;
      return { ...h, ticker };
    }

    return h;
  });

  if (mapDirty) saveCusipTickerMap(cusipMap);
  return resolved;
}
