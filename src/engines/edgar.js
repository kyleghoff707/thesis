// SEC EDGAR — single source of truth for financial data, company details, and ticker search.
// Free, no API key needed. Requires User-Agent header.
// Rate limit: 10 requests/second.
//
// Browser can't set User-Agent (forbidden header), so all SEC requests
// go through Vite proxy in dev. In Tauri production, native webview
// doesn't enforce CORS and can set arbitrary headers.

import { cacheGet, cacheGetAsync, cacheSet } from './cache';
import { formatCompanyName } from './formatCompanyName';
import sp500Names from '../data/sp500-display-names.json';
import { secBase, edgarBase } from './apiBase';

// ─── SEC URL helpers ────────────────────────────────────────

// Dev: Vite proxy. Production: Cloudflare Worker proxy.

function secTickerMapUrl() {
  return `${secBase()}/files/company_tickers.json`;
}

function secCompanyFactsUrl(cik) {
  return `${edgarBase()}/api/xbrl/companyfacts/CIK${cik}.json`;
}

function secSubmissionsUrl(cik) {
  return `${edgarBase()}/submissions/CIK${cik}.json`;
}

// ─── CIK Lookup ──────────────────────────────────────────────

// Display name resolution: curated S&P 500 names → formatCompanyName() fallback
function displayName(ticker, rawSECName) {
  return sp500Names.names[ticker] || formatCompanyName(rawSECName);
}

// Cache the full tickers map (loaded once, reused for all lookups)
let tickerMapPromise = null;
// Search index: array of { ticker, name, cik } for autocomplete
let tickerSearchIndex = null;

async function loadTickerMap() {
  const cacheKey = 'edgar:ticker-map';
  const cached = cacheGet(cacheKey);
  if (cached) {
    // Rebuild search index from cached map if needed
    if (!tickerSearchIndex) {
      tickerSearchIndex = Object.entries(cached.cikMap).map(([ticker, cik]) => ({
        ticker,
        name: displayName(ticker, cached.names?.[ticker]),
        cik,
      }));
    }
    return cached.cikMap;
  }

  const res = await fetch(secTickerMapUrl());
  if (!res.ok) throw new Error(`EDGAR ticker map: ${res.status}`);
  const data = await res.json();

  // Build ticker → CIK map + search index
  const cikMap = {};
  const names = {};
  tickerSearchIndex = [];
  for (const entry of Object.values(data)) {
    const ticker = entry.ticker.toUpperCase();
    const cik = String(entry.cik_str).padStart(10, '0');
    cikMap[ticker] = cik;
    names[ticker] = entry.title || '';
    tickerSearchIndex.push({ ticker, name: displayName(ticker, entry.title), cik });
  }

  cacheSet(cacheKey, { cikMap, names }, 'financials'); // 24hr cache
  return cikMap;
}

export async function lookupCIK(ticker) {
  // Don't cache a rejected promise — retry on next call if it failed
  if (!tickerMapPromise) {
    tickerMapPromise = loadTickerMap().catch(err => {
      tickerMapPromise = null; // allow retry
      throw err;
    });
  }
  const map = await tickerMapPromise;
  return map[ticker.toUpperCase()] || null;
}

// ─── Ticker Search ─────────
// Searches the EDGAR ticker map locally by ticker prefix or company name substring.

// Expose the ticker search index for external use (e.g., CUSIP-to-ticker fuzzy matching)
export async function getTickerSearchIndex() {
  if (!tickerMapPromise) {
    tickerMapPromise = loadTickerMap().catch(err => {
      tickerMapPromise = null;
      throw err;
    });
  }
  await tickerMapPromise;
  return tickerSearchIndex || [];
}

export async function searchEdgarTickers(query, limit = 8) {
  if (!query || query.length < 1) return [];

  // Ensure ticker map is loaded
  if (!tickerMapPromise) {
    tickerMapPromise = loadTickerMap().catch(err => {
      tickerMapPromise = null;
      throw err;
    });
  }
  await tickerMapPromise;
  if (!tickerSearchIndex) return [];

  const q = query.toUpperCase().trim();

  // Score and filter
  const scored = [];
  for (const entry of tickerSearchIndex) {
    let score = 0;
    if (entry.ticker === q) score = 100;           // exact ticker match
    else if (entry.ticker.startsWith(q)) score = 50; // ticker prefix
    else if (entry.name.toUpperCase().includes(q)) score = 10; // name substring
    else continue;
    scored.push({ ...entry, score });
  }

  scored.sort((a, b) => b.score - a.score || a.ticker.localeCompare(b.ticker));
  return scored.slice(0, limit).map(({ ticker, name }) => ({ ticker, name }));
}

// ─── Company Info ─────────
// Fetches from EDGAR submissions endpoint: name, SIC, exchange, etc.

export async function fetchCompanyInfo(ticker) {
  const cik = await lookupCIK(ticker);
  if (!cik) return null;

  const cacheKey = `edgar:company:${cik}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const url = secSubmissionsUrl(cik);
  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`EDGAR submissions failed: ${res.status} for CIK ${cik}`);
    return null;
  }
  const data = await res.json();

  const info = {
    ticker: ticker.toUpperCase(),
    name: data.name || '',
    sic: data.sic || '',
    sicDescription: data.sicDescription || '',
    exchange: data.exchanges?.[0] || '',
    cik,
    stateOfIncorporation: data.stateOfIncorporation || '',
    fiscalYearEnd: data.fiscalYearEnd || '',
    phone: data.phone || '',
    website: data.website || '',
  };

  cacheSet(cacheKey, info, 'companyDetails');
  return info;
}

// ─── Filings List ───────────────────────────────────────────
// Fetches full list of SEC filings from the submissions endpoint.
// Returns array of { form, filingDate, reportDate, accessionNumber, primaryDocument, description, items, cik }

export async function fetchFilings(ticker) {
  const cik = await lookupCIK(ticker);
  if (!cik) return [];

  const cacheKey = `edgar:filings:${cik}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const url = secSubmissionsUrl(cik);
  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`EDGAR filings fetch failed: ${res.status} for CIK ${cik}`);
    return [];
  }
  const data = await res.json();
  const recent = data.filings?.recent;
  if (!recent?.form) return [];

  const cleanCik = cik.replace(/^0+/, '');
  const filings = [];
  for (let i = 0; i < recent.form.length; i++) {
    filings.push({
      form: recent.form[i],
      filingDate: recent.filingDate[i],
      reportDate: recent.reportDate?.[i] || '',
      accessionNumber: recent.accessionNumber[i],
      primaryDocument: recent.primaryDocument?.[i] || '',
      description: recent.primaryDocDescription?.[i] || '',
      items: recent.items?.[i] || '',
      cik: cleanCik,
    });
  }

  cacheSet(cacheKey, filings, 'companyDetails');
  return filings;
}

// ─── Company Facts ───────────────────────────────────────────

export async function fetchCompanyFacts(cik) {
  const cacheKey = `edgar:facts:${cik}`;
  const cached = await cacheGetAsync(cacheKey);
  if (cached) return cached;

  const url = secCompanyFactsUrl(cik);
  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`EDGAR company facts failed: ${res.status} for CIK ${cik} (${url})`);
    return null;
  }
  const data = await res.json();

  cacheSet(cacheKey, data, 'financials');
  return data;
}

// ─── XBRL Fact Extraction ────────────────────────────────────

// Extract annual values for a given XBRL tag from company facts.
// Each 10-K includes comparatives (prior years), so we deduplicate
// by fiscal year (fy), keeping the most recently filed value.
// Returns { [year]: value } where year = fiscal year from XBRL data.
// unit: 'USD' (default), 'USD/shares' (EPS, DPS), or 'shares' (share counts)
export function extractAnnualFact(companyFacts, tag, unit = 'USD') {
  const facts = companyFacts?.facts?.['us-gaap']?.[tag];
  if (!facts) return null;

  const entries = facts.units?.[unit] || [];
  // Include fp=Q4 from 10-K filings as fallback — some companies tag annual
  // data as Q4 instead of FY (e.g., COST FY2019 has 599 Q4 entries, zero FY).
  const annual = entries.filter(e => e.form === '10-K' && (e.fp === 'FY' || e.fp === 'Q4'));
  if (annual.length === 0) return null;

  // Group by fiscal year, keep the entry with the latest period end date.
  // Each 10-K reports current year + prior year comparative, both with
  // the same fy. We want the current year (latest end date), not the
  // comparative. If end dates tie, prefer the most recently filed.
  // Always prefer fp=FY over fp=Q4 for the same fiscal year.
  const byFY = {};
  for (const e of annual) {
    const fy = e.fy;
    if (!fy) continue;
    const cur = byFY[fy];
    if (!cur
      || (e.fp === 'FY' && cur.fp !== 'FY')
      || (e.fp === cur.fp && (e.end > cur.end || (e.end === cur.end && e.filed > cur.filed)))
    ) {
      byFY[fy] = e;
    }
  }

  // Map to { year: value } using fiscal year
  const result = {};
  for (const [fy, entry] of Object.entries(byFY)) {
    result[Number(fy)] = entry.val;
  }

  return result;
}

// Same as extractAnnualFact but prefers the EARLIEST filing for each fiscal year.
// Returns the as-originally-reported values, not restated comparatives from later
// filings. Used for per-share and share count fields: post-split filings restate
// 2-3 years of comparatives with split-adjusted numbers, which would cause
// double-adjustment if we applied our own split factors on top.
export function extractAnnualFactOriginal(companyFacts, tag, unit = 'USD') {
  const facts = companyFacts?.facts?.['us-gaap']?.[tag];
  if (!facts) return null;

  const entries = facts.units?.[unit] || [];
  // Same fp=Q4 fallback as extractAnnualFact (see comment above).
  const annual = entries.filter(e => e.form === '10-K' && (e.fp === 'FY' || e.fp === 'Q4'));
  if (annual.length === 0) return null;

  // Group by fiscal year, keep the entry with the latest period end date
  // but EARLIEST filed date (original filing, not restated comparative).
  // Always prefer fp=FY over fp=Q4 for the same fiscal year.
  const byFY = {};
  for (const e of annual) {
    const fy = e.fy;
    if (!fy) continue;
    const cur = byFY[fy];
    if (!cur
      || (e.fp === 'FY' && cur.fp !== 'FY')
      || (e.fp === cur.fp && (e.end > cur.end || (e.end === cur.end && e.filed < cur.filed)))
    ) {
      byFY[fy] = e;
    }
  }

  const result = {};
  for (const [fy, entry] of Object.entries(byFY)) {
    result[Number(fy)] = entry.val;
  }
  return result;
}

// Extract fiscal year end months from company facts.
// Returns { [year]: 'Sep' } by looking at a common tag's 10-K end dates.
const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export function extractFiscalYearEnds(companyFacts) {
  // Try common tags that virtually every company reports
  const candidates = ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax',
    'Assets', 'NetIncomeLoss', 'SalesRevenueNet'];
  for (const tag of candidates) {
    const facts = companyFacts?.facts?.['us-gaap']?.[tag];
    if (!facts) continue;
    const entries = facts.units?.USD || [];
    const annual = entries.filter(e => e.form === '10-K' && (e.fp === 'FY' || e.fp === 'Q4') && e.fy && e.end);
    if (annual.length === 0) continue;

    // Group by fy, keep latest end date (same logic as extractAnnualFact).
    // Prefer fp=FY over fp=Q4 for the same fiscal year.
    const byFY = {};
    for (const e of annual) {
      const cur = byFY[e.fy];
      if (!cur
        || (e.fp === 'FY' && cur.fp !== 'FY')
        || (e.fp === cur.fp && e.end > cur.end)
      ) {
        byFY[e.fy] = e;
      }
    }

    const result = {};
    for (const [fy, entry] of Object.entries(byFY)) {
      const month = parseInt(entry.end.split('-')[1]) - 1; // 0-indexed
      result[Number(fy)] = MONTH_ABBR[month];
    }
    return result;
  }
  return {};
}

// Find the most recent 10-Q filing quarter from company facts.
// Returns { fy, fp, end } or null if no quarterly data exists.
export function findLatestQuarter(companyFacts) {
  const candidates = ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax',
    'Assets', 'NetIncomeLoss', 'SalesRevenueNet'];

  let latestQEnd = '';
  let latestQInfo = null;
  let latestKEnd = '';
  let latestKInfo = null;

  for (const tag of candidates) {
    const facts = companyFacts?.facts?.['us-gaap']?.[tag];
    if (!facts) continue;
    for (const entries of Object.values(facts.units || {})) {
      for (const e of entries) {
        if (e.form === '10-Q' && ['Q1', 'Q2', 'Q3'].includes(e.fp) && e.end > latestQEnd) {
          latestQEnd = e.end;
          latestQInfo = { fy: e.fy, fp: e.fp, end: e.end };
        }
        if (e.form === '10-K' && e.fp === 'FY' && e.end > latestKEnd) {
          latestKEnd = e.end;
          latestKInfo = { fy: e.fy, fp: 'FY', end: e.end };
        }
      }
    }
  }

  // If the latest 10-K covers a later period than the latest 10-Q, use it.
  // This handles Q4: after the annual 10-K is filed but before Q1 of the next FY.
  if (latestKInfo && (!latestQInfo || latestKInfo.end > latestQInfo.end)) {
    return latestKInfo;
  }
  return latestQInfo;
}

// Try multiple XBRL tags in priority order (companies use different tags)
export function extractAnnualFactMulti(companyFacts, tags, unit = 'USD') {
  for (const tag of tags) {
    const result = extractAnnualFact(companyFacts, tag, unit);
    if (result && Object.keys(result).length > 0) return { data: result, tag };
  }
  return { data: null, tag: null };
}

// ─── Public API ──────────────────────────────────────────────

// Fetch CapEx (Purchase of PP&E) — the standard value investing definition
// Returns { [year]: value } in raw dollars (positive number = cash spent)
export async function fetchCapEx(ticker) {
  const cik = await lookupCIK(ticker);
  if (!cik) return {};

  const facts = await fetchCompanyFacts(cik);
  if (!facts) return {};

  const { data } = extractAnnualFactMulti(facts, [
    'PaymentsToAcquirePropertyPlantAndEquipment',
    'PaymentsToAcquireProductiveAssets',
    'CapitalExpendituresIncurredButNotYetPaid', // rare fallback
  ]);

  return data || {};
}

// Fetch Depreciation & Amortization
export async function fetchDepreciation(ticker) {
  const cik = await lookupCIK(ticker);
  if (!cik) return {};

  const facts = await fetchCompanyFacts(cik);
  if (!facts) return {};

  const { data } = extractAnnualFactMulti(facts, [
    'DepreciationDepletionAndAmortization',
    'DepreciationAndAmortization',
    'DepreciationAmortizationAndAccretionNet',
    'Depreciation',
  ]);

  return data || {};
}

// Fetch Cash & Cash Equivalents (for net debt calculation)
export async function fetchCash(ticker) {
  const cik = await lookupCIK(ticker);
  if (!cik) return {};

  const facts = await fetchCompanyFacts(cik);
  if (!facts) return {};

  const { data } = extractAnnualFactMulti(facts, [
    'CashAndCashEquivalentsAtCarryingValue',
    'CashCashEquivalentsAndShortTermInvestments',
    'Cash',
  ]);

  return data || {};
}

// Fetch multiple EDGAR facts at once (single CIK lookup + company facts fetch)
// Returns { capEx, depreciation, cash, dividendsPerShare }
export async function fetchEdgarFinancials(ticker) {
  const cik = await lookupCIK(ticker);
  if (!cik) {
    console.warn(`EDGAR: CIK not found for ticker "${ticker}"`);
    return { capEx: {}, depreciation: {}, cash: {}, dividendsPerShare: {} };
  }

  const facts = await fetchCompanyFacts(cik);
  if (!facts) {
    console.warn(`EDGAR: Company facts not available for CIK ${cik} (${ticker})`);
    return { capEx: {}, depreciation: {}, cash: {}, dividendsPerShare: {} };
  }

  const capExResult = extractAnnualFactMulti(facts, [
    'PaymentsToAcquirePropertyPlantAndEquipment',
    'PaymentsToAcquireProductiveAssets',
  ]);
  const capEx = capExResult.data || {};

  const depreciation = extractAnnualFactMulti(facts, [
    'DepreciationDepletionAndAmortization',
    'DepreciationAndAmortization',
    'DepreciationAmortizationAndAccretionNet',
  ]).data || {};

  const cash = extractAnnualFactMulti(facts, [
    'CashAndCashEquivalentsAtCarryingValue',
    'CashCashEquivalentsAndShortTermInvestments',
  ]).data || {};

  const dividendsPerShare = extractAnnualFactMulti(facts, [
    'CommonStockDividendsPerShareDeclared',
    'CommonStockDividendsPerShareCashPaid',
  ], 'USD/shares').data || {};

  const retainedEarnings = extractAnnualFactMulti(facts, [
    'RetainedEarningsAccumulatedDeficit',
    'RetainedEarningsUnappropriated',
  ]).data || {};

  console.log(`EDGAR ${ticker}: CIK=${cik}, capEx tag=${capExResult.tag}, years=${Object.keys(capEx).join(',')}`);

  return { capEx, depreciation, cash, dividendsPerShare, retainedEarnings };
}

// Test exports
export const _testExports = { displayName };
