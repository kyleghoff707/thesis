// N-PORT Engine — fetches fund portfolio data from SEC EDGAR N-PORT filings
// N-PORT provides complete portfolio holdings (equities + cash + money market + derivatives)
// for registered mutual funds/ETFs. Supplements 13F data with cash position visibility.

import { cacheGet, cacheGetAsync, cacheSet, hydrateFromIDB } from './cache';

const IS_DEV = import.meta.env.DEV;
const NPORT_CACHE_V = 'v1';

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
// For gurus WITH fundCik/seriesId: validates mapping still works
// For gurus WITHOUT: checks their CIK for any NPORT-P filings (discovery)

const NPORT_STALE_DAYS = 90; // N-PORT is monthly, so 90 days = 3 missed filings

export async function auditNport(gurus, onProgress) {
  const results = [];

  for (let i = 0; i < gurus.length; i++) {
    const g = gurus[i];
    if (onProgress) onProgress(i + 1, gurus.length, g.name);

    const result = {
      name: g.name,
      fund: g.fund,
      cik: g.cik,
      hasConfig: !!(g.fundCik && g.seriesId),
      fundCik: g.fundCik || null,
      seriesId: g.seriesId || null,
      issues: [],
      discoveries: [],
      ok: true,
      reportDate: null,
      filingDate: null,
      seriesName: null,
      nportCount: 0,
    };

    try {
      if (g.fundCik && g.seriesId) {
        // ── Configured guru: validate the mapping ──
        await auditConfiguredGuru(g, result);
      } else {
        // ── Unconfigured guru: discovery scan ──
        await auditDiscoveryGuru(g, result);
      }

      if (result.issues.length > 0) result.ok = false;
    } catch (e) {
      result.issues.push(`Error: ${e.message}`);
      result.ok = false;
    }

    results.push(result);
    if (i < gurus.length - 1) await sleep(150);
  }

  return results;
}

async function auditConfiguredGuru(g, result) {
  // 1. Fetch trust CIK submissions
  const url = edgarSubmissionsUrl(g.fundCik);
  const res = await fetch(url);
  if (!res.ok) {
    result.issues.push(`Trust CIK ${g.fundCik} returned ${res.status} — may be invalid`);
    return;
  }

  const data = await res.json();
  result.trustName = data.name || '??';

  const filings = data.filings?.recent;
  if (!filings) {
    result.issues.push('No filings data from trust CIK');
    return;
  }

  // 2. Find NPORT-P filings
  const candidates = [];
  for (let i = 0; i < filings.form.length; i++) {
    if (filings.form[i] === 'NPORT-P' || filings.form[i] === 'NPORT-P/A') {
      candidates.push({
        accessionNumber: filings.accessionNumber[i],
        filingDate: filings.filingDate[i],
        reportDate: filings.reportDate?.[i] || filings.filingDate[i],
        form: filings.form[i],
      });
    }
    if (candidates.length >= 12) break; // ~1 year of monthly filings
  }

  result.nportCount = candidates.length;

  if (candidates.length === 0) {
    result.issues.push('Trust CIK has no NPORT-P filings — fund may no longer be registered');
    return;
  }

  // 3. Check if seriesId still matches in recent filings
  let matchFound = false;
  for (const filing of candidates) {
    const accPath = filing.accessionNumber.replace(/-/g, '');
    const xmlUrl = secArchiveUrl(g.fundCik, accPath, 'primary_doc.xml');
    await sleep(100);
    const xmlRes = await fetch(xmlUrl);
    if (!xmlRes.ok) continue;
    const xmlText = await xmlRes.text();
    const seriesMatch = xmlText.match(/<seriesId>([^<]+)<\/seriesId>/);
    const foundSeriesId = seriesMatch ? seriesMatch[1] : '';

    if (foundSeriesId === g.seriesId) {
      matchFound = true;
      result.reportDate = filing.reportDate;
      result.filingDate = filing.filingDate;

      // Extract series name
      const nameMatch = xmlText.match(/<seriesName>([^<]+)<\/seriesName>/);
      result.seriesName = nameMatch ? nameMatch[1] : null;

      // 4. Check staleness
      const age = Math.floor((Date.now() - new Date(filing.filingDate).getTime()) / 86400000);
      if (age > NPORT_STALE_DAYS) {
        result.issues.push(`Stale: last matching N-PORT filed ${age} days ago (${filing.filingDate})`);
      }
      break;
    }
  }

  if (!matchFound) {
    result.issues.push(`Series ${g.seriesId} not found in recent NPORT-P filings — series may have been closed or reorganized`);
  }
}

async function auditDiscoveryGuru(g, result) {
  // Check the management company CIK for any NPORT-P filings
  const url = edgarSubmissionsUrl(g.cik);
  const res = await fetch(url);
  if (!res.ok) return; // CIK issues are caught by the main guru audit

  const data = await res.json();
  const filings = data.filings?.recent;
  if (!filings) return;

  // Scan for any NPORT-P filings
  const nportFilings = [];
  for (let i = 0; i < filings.form.length; i++) {
    if (filings.form[i] === 'NPORT-P' || filings.form[i] === 'NPORT-P/A') {
      nportFilings.push({
        filingDate: filings.filingDate[i],
        reportDate: filings.reportDate?.[i] || filings.filingDate[i],
        accessionNumber: filings.accessionNumber[i],
      });
    }
    if (nportFilings.length >= 3) break;
  }

  if (nportFilings.length > 0) {
    result.nportCount = nportFilings.length;
    result.reportDate = nportFilings[0].reportDate;
    result.filingDate = nportFilings[0].filingDate;

    // Try to extract series info from the most recent filing
    const accPath = nportFilings[0].accessionNumber.replace(/-/g, '');
    const xmlUrl = secArchiveUrl(g.cik, accPath, 'primary_doc.xml');
    await sleep(100);
    try {
      const xmlRes = await fetch(xmlUrl);
      if (xmlRes.ok) {
        const xmlText = await xmlRes.text();
        const seriesIdMatch = xmlText.match(/<seriesId>([^<]+)<\/seriesId>/);
        const seriesNameMatch = xmlText.match(/<seriesName>([^<]+)<\/seriesName>/);
        result.discoveredSeriesId = seriesIdMatch ? seriesIdMatch[1] : null;
        result.seriesName = seriesNameMatch ? seriesNameMatch[1] : null;
      }
    } catch (_) { /* non-critical */ }

    const detail = result.discoveredSeriesId
      ? `Series: ${result.discoveredSeriesId}${result.seriesName ? ` (${result.seriesName})` : ''}`
      : `${nportFilings.length} filing(s) found`;
    result.discoveries.push(`NPORT-P filings found under management CIK — ${detail}. Consider adding fundCik/seriesId.`);
  }
}
