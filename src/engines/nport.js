// N-PORT Engine — fetches fund portfolio data from SEC EDGAR N-PORT filings
// N-PORT provides complete portfolio holdings (equities + cash + money market + derivatives)
// for registered mutual funds/ETFs. Supplements 13F data with cash position visibility.

import { cacheGet, cacheGetAsync, cacheSet, hydrateFromIDB } from './cache';
import { edgarBase, secBase } from './apiBase';

const NPORT_CACHE_V = 'v1';

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
// Find the most recent NPORT-P filing for a given seriesId
// ============================================================

async function getRecentNport(fundCik, seriesId) {
  const subsCacheKey = `nport-subs:${NPORT_CACHE_V}:${fundCik}`;
  let data = await cacheGetAsync(subsCacheKey);

  if (!data) {
    const url = edgarSubmissionsUrl(fundCik);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`EDGAR submissions error: ${res.status}`);
    data = await res.json();
    cacheSet(subsCacheKey, data, 'financials');
  }

  const filings = data.filings?.recent;
  if (!filings) return null;

  // Find NPORT-P filings and check their seriesId
  // Since multiple series share one trust CIK, we need to fetch each XML
  // to match the correct series. But first, collect candidates.
  const candidates = [];
  for (let i = 0; i < filings.form.length; i++) {
    const form = filings.form[i];
    if (form === 'NPORT-P' || form === 'NPORT-P/A') {
      candidates.push({
        accessionNumber: filings.accessionNumber[i],
        filingDate: filings.filingDate[i],
        reportDate: filings.reportDate?.[i] || filings.filingDate[i],
        primaryDocument: filings.primaryDocument[i],
        form,
      });
    }
    // Only check recent filings (enough for a couple quarters)
    if (candidates.length >= 30) break;
  }

  if (candidates.length === 0) return null;

  // For each candidate, check if it matches our seriesId by fetching the XML
  // and checking <seriesId>. We cache each check result.
  for (const filing of candidates) {
    const matchKey = `nport-series-match:${NPORT_CACHE_V}:${filing.accessionNumber}`;
    let matchedSeriesId = cacheGet(matchKey);

    if (matchedSeriesId === null) {
      // Fetch the XML and check
      const accPath = filing.accessionNumber.replace(/-/g, '');
      const url = secArchiveUrl(fundCik, accPath, 'primary_doc.xml');
      await sleep(100);
      const res = await fetch(url);
      if (!res.ok) continue;
      const xmlText = await res.text();

      // Quick regex extract of seriesId (avoid full XML parse for matching)
      const seriesMatch = xmlText.match(/<seriesId>([^<]+)<\/seriesId>/);
      matchedSeriesId = seriesMatch ? seriesMatch[1] : '';
      cacheSet(matchKey, matchedSeriesId, 'financials');
    }

    if (matchedSeriesId === seriesId) {
      return filing;
    }
  }

  return null;
}

// ============================================================
// Parse N-PORT XML
// ============================================================

function parseNportXml(xmlText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'text/xml');

  // Helper to get text content by tag name (namespace-agnostic)
  function getText(parent, tag) {
    const el = parent.getElementsByTagNameNS('*', tag)[0];
    return el?.textContent?.trim() || null;
  }

  function getFloat(parent, tag) {
    const val = getText(parent, tag);
    return val ? parseFloat(val) : 0;
  }

  // Fund-level info
  const fundInfo = doc.getElementsByTagNameNS('*', 'fundInfo')[0];
  const genInfo = doc.getElementsByTagNameNS('*', 'genInfo')[0];
  const totAssets = fundInfo ? getFloat(fundInfo, 'totAssets') : 0;
  const totLiabs = fundInfo ? getFloat(fundInfo, 'totLiabs') : 0;
  const netAssets = fundInfo ? getFloat(fundInfo, 'netAssets') : 0;
  const cashNotReported = fundInfo ? getFloat(fundInfo, 'cshNotRptdInCorD') : 0;
  const seriesName = genInfo ? getText(genInfo, 'seriesName') : '';
  const reportDate = genInfo ? getText(genInfo, 'repPdDate') : '';

  // Parse all holdings
  const securities = Array.from(doc.getElementsByTagNameNS('*', 'invstOrSec'));
  const holdings = [];
  let cashTotal = cashNotReported; // Start with cash not in categories

  for (const sec of securities) {
    const name = getText(sec, 'name') || '';
    const title = getText(sec, 'title') || '';
    const cusip = getText(sec, 'cusip') || '';
    const balance = getFloat(sec, 'balance');
    const units = getText(sec, 'units') || '';
    const valUSD = getFloat(sec, 'valUSD');
    const pctVal = getFloat(sec, 'pctVal') * 100; // Convert from decimal to %
    const assetCat = getText(sec, 'assetCat') || '';

    // Categorize
    const isCash = assetCat === 'STIV'; // Short-term investment vehicle (money market)
    const isEquity = assetCat === 'EC' || assetCat === 'EP'; // Common or preferred equity
    const isDerivative = assetCat === 'DE' || assetCat === 'DIR'; // Derivatives
    const isDebt = assetCat === 'DBT';
    const isRepo = assetCat === 'RF'; // Repurchase agreement

    if (isCash || isRepo) {
      cashTotal += valUSD;
    }

    holdings.push({
      name: name === 'Default' || name === 'N/A' ? title : name,
      title,
      cusip,
      balance,
      units,
      value: valUSD,
      pctOfNetAssets: pctVal,
      assetCat,
      isCash,
      isEquity,
      isDerivative,
      isDebt,
    });
  }

  // Separate into categories
  const equityHoldings = holdings.filter(h => h.isEquity);
  const cashHoldings = holdings.filter(h => h.isCash);
  const derivativeHoldings = holdings.filter(h => h.isDerivative);
  const otherHoldings = holdings.filter(h => !h.isEquity && !h.isCash && !h.isDerivative);

  const cashPct = netAssets > 0 ? (cashTotal / netAssets) * 100 : 0;

  return {
    seriesName,
    reportDate,
    totAssets,
    totLiabs,
    netAssets,
    cashNotReported,
    cashPosition: cashTotal,
    cashPct,
    equityCount: equityHoldings.length,
    equityHoldings,
    cashHoldings,
    derivativeHoldings,
    otherHoldings,
    totalHoldings: holdings.length,
  };
}

// ============================================================
// Main entry point — fetch N-PORT data for a guru
// ============================================================

export async function fetchNportData(guru) {
  if (!guru.fundCik || !guru.seriesId) return null;

  // Check summary cache first
  const summaryKey = `nport-summary:${NPORT_CACHE_V}:${guru.cik}`;
  const cached = await cacheGetAsync(summaryKey);
  if (cached) return cached;

  // Find the most recent N-PORT filing for this guru's fund series
  const filing = await getRecentNport(guru.fundCik, guru.seriesId);
  if (!filing) return null;

  // Check per-filing cache (immutable once filed)
  const filingKey = `nport-filing:${NPORT_CACHE_V}:${guru.fundCik}:${filing.reportDate}`;
  let result = await cacheGetAsync(filingKey);

  if (!result) {
    // Fetch and parse the full XML
    const accPath = filing.accessionNumber.replace(/-/g, '');
    const url = secArchiveUrl(guru.fundCik, accPath, 'primary_doc.xml');
    await sleep(100);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`N-PORT fetch error: ${res.status}`);
    const xmlText = await res.text();

    const parsed = parseNportXml(xmlText);

    result = {
      filing: {
        accessionNumber: filing.accessionNumber,
        filingDate: filing.filingDate,
        reportDate: filing.reportDate,
        form: filing.form,
      },
      seriesName: parsed.seriesName,
      netAssets: parsed.netAssets,
      totAssets: parsed.totAssets,
      cashPosition: parsed.cashPosition,
      cashPct: parsed.cashPct,
      cashNotReported: parsed.cashNotReported,
      equityCount: parsed.equityCount,
      cashHoldings: parsed.cashHoldings,
      derivativeHoldings: parsed.derivativeHoldings,
      otherHoldings: parsed.otherHoldings,
      totalHoldings: parsed.totalHoldings,
    };

    // Cache per-filing (immutable)
    cacheSet(filingKey, result, 'financials');
  }

  // Cache summary for quick access
  cacheSet(summaryKey, result, 'financials');

  return result;
}

// ============================================================
// Load cached N-PORT summaries (instant, no network)
// ============================================================

export async function loadCachedNportSummaries(gurus) {
  const gurusWithFund = gurus.filter(g => g.fundCik);
  if (gurusWithFund.length === 0) return {};
  const keys = gurusWithFund.map(g => `nport-summary:${NPORT_CACHE_V}:${g.cik}`);
  const hydrated = await hydrateFromIDB('nport-data', keys);
  const results = {};
  for (const r of hydrated) {
    // Extract CIK from key: nport-summary:v1:{cik}
    const parts = r.key.split(':');
    const cik = parts[parts.length - 1];
    results[cik] = r.data;
  }
  return results;
}

// ============================================================
// N-PORT Audit — validates all gurus for N-PORT filing status
// ============================================================
