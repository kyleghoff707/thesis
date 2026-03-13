// Yahoo Finance analyst estimates — consensus growth rate, EPS estimates,
// price targets, recommendations, and upgrade/downgrade history.
//
// Dev: Uses Vite middleware at /api/yahoo-summary/:ticker which calls yahoo-finance2
//      (handles Yahoo's crumb/cookie auth internally).
// Tauri production: Uses yahoo-finance2 via Tauri sidecar or direct fetch with crumb.
//      For now, production falls back to direct v10 endpoint (Tauri webview may not need crumb).

import { cacheGetAsync, cacheSet } from './cache.js';

const isDev = import.meta.env.DEV;
const CACHE_V = 'v1';

function cacheKey(ticker) {
  return `analyst:${CACHE_V}:${ticker.toUpperCase()}`;
}

// --- Parsing helpers (yahoo-finance2 returns slightly different structure) ---

function parseGrowthRates(earningsTrend) {
  if (!earningsTrend?.trend) return null;
  const get = (period) => {
    const entry = earningsTrend.trend.find(t => t.period === period);
    const raw = entry?.growth?.raw ?? entry?.growth ?? null;
    if (raw == null) return null;
    return Math.round(raw * 10000) / 100; // 0.125 → 12.5
  };
  // Yahoo removed the 5yr (+5y) growth estimate from earningsTrend.
  // Use next fiscal year growth as the best available forward consensus.
  const currentYear = get('0y');
  const nextYear = get('+1y');
  return {
    primary: nextYear ?? currentYear,   // next FY preferred (more forward-looking)
    currentYear,
    nextYear,
  };
}

function parseEpsEstimates(earningsTrend) {
  if (!earningsTrend?.trend) return null;
  const get = (period) => {
    const entry = earningsTrend.trend.find(t => t.period === period);
    if (!entry?.earningsEstimate) return null;
    const est = entry.earningsEstimate;
    return {
      avg: est.avg?.raw ?? est.avg ?? null,
      low: est.low?.raw ?? est.low ?? null,
      high: est.high?.raw ?? est.high ?? null,
      numberOfAnalysts: est.numberOfAnalysts?.raw ?? est.numberOfAnalysts ?? null,
      date: entry.endDate ?? null,
    };
  };
  const currentYear = get('0y');
  const nextYear = get('+1y');
  if (!currentYear && !nextYear) return null;
  return { currentYear, nextYear };
}

function parseRevenueEstimates(earningsTrend) {
  if (!earningsTrend?.trend) return null;
  const get = (period) => {
    const entry = earningsTrend.trend.find(t => t.period === period);
    if (!entry?.revenueEstimate) return null;
    const est = entry.revenueEstimate;
    const raw = (v) => v?.raw ?? v ?? null;
    return {
      avg: raw(est.avg),
      low: raw(est.low),
      high: raw(est.high),
      growth: raw(est.growth),
      numberOfAnalysts: raw(est.numberOfAnalysts),
      date: entry.endDate ?? null,
    };
  };
  const currentYear = get('0y');
  const nextYear = get('+1y');
  if (!currentYear && !nextYear) return null;
  return { currentYear, nextYear };
}

function parsePriceTargets(financialData) {
  if (!financialData) return null;
  const raw = (v) => v?.raw ?? v ?? null;
  const low = raw(financialData.targetLowPrice);
  const mean = raw(financialData.targetMeanPrice);
  const median = raw(financialData.targetMedianPrice);
  const high = raw(financialData.targetHighPrice);
  const numberOfAnalysts = raw(financialData.numberOfAnalystOpinions);
  if (mean == null && numberOfAnalysts == null) return null;
  return { low, mean, median, high, numberOfAnalysts };
}

function parseRecommendation(financialData, recommendationTrend) {
  const key = financialData?.recommendationKey ?? null;
  const score = financialData?.recommendationMean?.raw ?? financialData?.recommendationMean ?? null;
  const latest = recommendationTrend?.trend?.[0];
  if (!key && !latest) return null;
  return {
    key,
    score,
    strongBuy: latest?.strongBuy ?? 0,
    buy: latest?.buy ?? 0,
    hold: latest?.hold ?? 0,
    sell: latest?.sell ?? 0,
    strongSell: latest?.strongSell ?? 0,
    total: (latest?.strongBuy ?? 0) + (latest?.buy ?? 0) + (latest?.hold ?? 0) +
           (latest?.sell ?? 0) + (latest?.strongSell ?? 0),
  };
}

function parseUpgrades(upgradeDowngradeHistory) {
  const history = upgradeDowngradeHistory?.history;
  if (!history?.length) return [];
  return history.slice(0, 5).map(entry => {
    // yahoo-finance2 may return epochGradeDate as Date or number
    let date = null;
    if (entry.epochGradeDate instanceof Date) {
      date = entry.epochGradeDate.toISOString().slice(0, 10);
    } else if (typeof entry.epochGradeDate === 'number') {
      date = new Date(entry.epochGradeDate * 1000).toISOString().slice(0, 10);
    } else if (typeof entry.epochGradeDate === 'string') {
      date = entry.epochGradeDate.slice(0, 10);
    }
    return {
      firm: entry.firm ?? 'Unknown',
      date,
      toGrade: entry.toGrade ?? '',
      fromGrade: entry.fromGrade ?? '',
      action: entry.action ?? '',
    };
  });
}

// --- Main fetch ---

export async function fetchAnalystEstimates(ticker) {
  if (!ticker) return null;
  const key = cacheKey(ticker);

  // Check cache
  const cached = await cacheGetAsync(key);
  if (cached) return cached;

  try {
    let result;

    if (isDev) {
      // Dev: use Vite middleware (yahoo-finance2 server-side)
      const resp = await fetch(`/api/yahoo-summary/${encodeURIComponent(ticker.toUpperCase())}`);
      if (!resp.ok) return null;
      result = await resp.json();
      if (result.error) return null;
    } else {
      // Tauri production: try direct v10 endpoint (native webview may bypass CORS/crumb)
      const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker.toUpperCase())}?modules=earningsTrend,financialData,recommendationTrend,upgradeDowngradeHistory`;
      const resp = await fetch(url);
      if (!resp.ok) return null;
      const json = await resp.json();
      result = json?.quoteSummary?.result?.[0];
      if (!result) return null;
    }

    const earningsTrend = result.earningsTrend ?? null;
    const financialData = result.financialData ?? null;
    const recommendationTrend = result.recommendationTrend ?? null;
    const upgradeDowngradeHistory = result.upgradeDowngradeHistory ?? null;

    const growthRates = parseGrowthRates(earningsTrend);

    const data = {
      growthRate: growthRates?.primary ?? null,
      growthRateCurrentYear: growthRates?.currentYear ?? null,
      growthRateNextYear: growthRates?.nextYear ?? null,
      epsEstimates: parseEpsEstimates(earningsTrend),
      revenueEstimates: parseRevenueEstimates(earningsTrend),
      priceTargets: parsePriceTargets(financialData),
      recommendation: parseRecommendation(financialData, recommendationTrend),
      upgrades: parseUpgrades(upgradeDowngradeHistory),
      numberOfAnalysts: parsePriceTargets(financialData)?.numberOfAnalysts ?? null,
      _fetchedAt: Date.now(),
    };

    cacheSet(key, data, 'analyst');
    return data;
  } catch (err) {
    console.warn('[analystEstimates] fetch failed:', err.message);
    return null;
  }
}

// Clear cache for a ticker (used by refetch)
export function clearAnalystCache(ticker) {
  if (!ticker) return;
  const key = cacheKey(ticker);
  try { localStorage.removeItem(`sa-cache:${key}`); } catch {}
}
