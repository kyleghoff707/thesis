// SEC EDGAR — single source of truth for financial data, company details, and ticker search.
// Free, no API key needed. Requires User-Agent header.
// Rate limit: 10 requests/second.
//
// Browser can't set User-Agent (forbidden header), so all SEC requests
// go through Vite proxy in dev. In Tauri production, native webview
// doesn't enforce CORS and can set arbitrary headers.

import { cacheGet, cacheSet } from './cache';

// ─── SEC URL helpers ────────────────────────────────────────

// In dev: route through Vite proxy (adds User-Agent header).
// In Tauri production: call SEC directly (no CORS enforcement).
const IS_DEV = import.meta.env.DEV;

function secTickerMapUrl() {
  return IS_DEV
    ? '/api/sec/files/company_tickers.json'
    : 'https://www.sec.gov/files/company_tickers.json';
}

function secCompanyFactsUrl(cik) {
  return IS_DEV
    ? `/api/edgar/api/xbrl/companyfacts/CIK${cik}.json`
    : `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;
}

function secSubmissionsUrl(cik) {
  return IS_DEV
    ? `/api/edgar/submissions/CIK${cik}.json`
    : `https://data.sec.gov/submissions/CIK${cik}.json`;
}

// ─── CIK Lookup ──────────────────────────────────────────────

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
        name: cached.names?.[ticker] || '',
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
    tickerSearchIndex.push({ ticker, name: entry.title || '', cik });
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

// ─── Company Facts ───────────────────────────────────────────

export async function fetchCompanyFacts(cik) {
  const cacheKey = `edgar:facts:${cik}`;
  const cached = cacheGet(cacheKey);
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
  const annual = entries.filter(e => e.form === '10-K' && e.fp === 'FY');
  if (annual.length === 0) return null;

  // Group by fiscal year, keep the entry with the latest period end date.
  // Each 10-K reports current year + prior year comparative, both with
  // the same fy. We want the current year (latest end date), not the
  // comparative. If end dates tie, prefer the most recently filed.
  const byFY = {};
  for (const e of annual) {
    const fy = e.fy;
    if (!fy) continue;
    if (!byFY[fy] || e.end > byFY[fy].end || (e.end === byFY[fy].end && e.filed > byFY[fy].filed)) {
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
  const annual = entries.filter(e => e.form === '10-K' && e.fp === 'FY');
  if (annual.length === 0) return null;

  // Group by fiscal year, keep the entry with the latest period end date
  // but EARLIEST filed date (original filing, not restated comparative).
  const byFY = {};
  for (const e of annual) {
    const fy = e.fy;
    if (!fy) continue;
    if (!byFY[fy] || e.end > byFY[fy].end || (e.end === byFY[fy].end && e.filed < byFY[fy].filed)) {
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
    const annual = entries.filter(e => e.form === '10-K' && e.fp === 'FY' && e.fy && e.end);
    if (annual.length === 0) continue;

    // Group by fy, keep latest end date (same logic as extractAnnualFact)
    const byFY = {};
    for (const e of annual) {
      if (!byFY[e.fy] || e.end > byFY[e.fy].end) byFY[e.fy] = e;
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

  let latestEnd = '';
  let latestInfo = null;

  for (const tag of candidates) {
    const facts = companyFacts?.facts?.['us-gaap']?.[tag];
    if (!facts) continue;
    for (const entries of Object.values(facts.units || {})) {
      for (const e of entries) {
        if (e.form === '10-Q' && ['Q1', 'Q2', 'Q3'].includes(e.fp) && e.end > latestEnd) {
          latestEnd = e.end;
          latestInfo = { fy: e.fy, fp: e.fp, end: e.end };
        }
      }
    }
  }
  return latestInfo;
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

// Fetch CapEx (Purchase of PP&E) — the standard Rule One definition
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
