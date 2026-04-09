// GuruFocus stock summary data — GF Value, quality scores, growth rates,
// Graham Number, Peter Lynch Value, DCF estimates, analyst consensus.
//
// Two modes:
// - API mode: If VITE_GURUFOCUS_KEY set in .env.local, uses their $25/mo API (reliable).
// - Scrape mode: Attempts to fetch/parse the public summary page (may fail — 403/JS-heavy).
//
// Dev: Uses Vite middleware at /api/gurufocus/:ticker.
// Tauri production: Direct fetch (API mode preferred for reliability).

import { cacheGetAsync, cacheSet } from './cache.js';
import { API_BASE } from './apiBase.js';

const isDev = import.meta.env.DEV;
const CACHE_V = 'v1';

function cacheKey(ticker) {
  return `gurufocus:${CACHE_V}:${ticker.toUpperCase()}`;
}

function parseNum(val) {
  if (val == null || val === '-' || val === '' || val === 'N/A') return null;
  if (typeof val === 'number') return isNaN(val) ? null : val;
  const clean = String(val).replace(/[$,%]/g, '').replace(/,/g, '').trim();
  const n = parseFloat(clean);
  return isNaN(n) ? null : n;
}

// --- Normalize API response ---
// GuruFocus API returns nested objects; extract the fields we care about.
function normalizeApiResponse(raw) {
  const summary = raw.summary ?? raw;
  const ratios = summary.ratios ?? {};
  const valuation = summary.valuation ?? {};
  const growth = summary.growth ?? {};

  return {
    gfValue: parseNum(valuation.gf_value ?? summary.gf_value ?? raw.gf_value),
    gfValueLabel: summary.gf_value_label ?? valuation.gf_value_label ?? null,
    predictabilityRank: parseNum(summary.predictability_rank ?? ratios.predictability_rank),
    financialStrength: parseNum(summary.financial_strength ?? ratios.financial_strength),
    profitabilityRank: parseNum(summary.profitability_rank ?? ratios.profitability_rank),
    growthRates: {
      revenue3Y: parseNum(growth.revenue_3y ?? growth['revenue_growth_3y']),
      revenue5Y: parseNum(growth.revenue_5y ?? growth['revenue_growth_5y']),
      revenue10Y: parseNum(growth.revenue_10y ?? growth['revenue_growth_10y']),
      eps3Y: parseNum(growth.eps_3y ?? growth['eps_growth_3y']),
      eps5Y: parseNum(growth.eps_5y ?? growth['eps_growth_5y']),
      eps10Y: parseNum(growth.eps_10y ?? growth['eps_growth_10y']),
      ebitda3Y: parseNum(growth.ebitda_3y ?? growth['ebitda_growth_3y']),
      ebitda5Y: parseNum(growth.ebitda_5y ?? growth['ebitda_growth_5y']),
      ebitda10Y: parseNum(growth.ebitda_10y ?? growth['ebitda_growth_10y']),
    },
    peterLynchValue: parseNum(valuation.peter_lynch_value ?? raw.peter_lynch_value),
    grahamNumber: parseNum(valuation.graham_number ?? raw.graham_number),
    dcfEarnings: parseNum(valuation.dcf_earnings ?? raw.dcf_earnings),
    dcfFCF: parseNum(valuation.dcf_fcf ?? raw.dcf_fcf),
    analystEstimate: parseNum(summary.analyst_estimate ?? raw.analyst_estimate),
    _fetchedAt: Date.now(),
  };
}

// --- Normalize scrape response (from middleware html_parse / embedded JSON) ---
function normalizeScrapeResponse(raw) {
  if (raw._mode === 'api') return normalizeApiResponse(raw);

  // If middleware found embedded JSON (__NEXT_DATA__ or window.__DATA__), try to extract
  if (raw._raw) {
    try {
      // Try common nested paths in SSR data
      const props = raw._raw.props?.pageProps ?? raw._raw.pageProps ?? raw._raw;
      const stock = props.stock ?? props.stockData ?? props.data ?? props;
      return normalizeApiResponse(stock);
    } catch {
      // Fall through to html_parse fields
    }
  }

  // html_parse mode — middleware already extracted what it could via regex
  return {
    gfValue: parseNum(raw.gfValue),
    gfValueLabel: raw.gfValueLabel ?? null,
    predictabilityRank: parseNum(raw.predictabilityRank),
    financialStrength: parseNum(raw.financialStrength),
    profitabilityRank: parseNum(raw.profitabilityRank),
    growthRates: {
      revenue3Y: null, revenue5Y: null, revenue10Y: null,
      eps3Y: null, eps5Y: null, eps10Y: null,
      ebitda3Y: null, ebitda5Y: null, ebitda10Y: null,
    },
    peterLynchValue: parseNum(raw.peterLynchValue),
    grahamNumber: parseNum(raw.grahamNumber),
    dcfEarnings: parseNum(raw.dcfEarnings),
    dcfFCF: parseNum(raw.dcfFCF),
    analystEstimate: parseNum(raw.analystEstimate),
    _fetchedAt: Date.now(),
  };
}

// --- Check if result has any meaningful data ---
function hasUsefulData(data) {
  return data.gfValue != null ||
    data.grahamNumber != null ||
    data.peterLynchValue != null ||
    data.dcfEarnings != null ||
    data.financialStrength != null ||
    data.predictabilityRank != null ||
    data.analystEstimate != null;
}

// --- Main fetch ---

export async function fetchGuruFocusData(ticker) {
  if (!ticker) return null;
  const key = cacheKey(ticker);

  const cached = await cacheGetAsync(key);
  if (cached) return cached;

  try {
    let data;

    if (isDev) {
      // Dev: use Vite middleware
      const resp = await fetch(`/api/gurufocus/${encodeURIComponent(ticker.toUpperCase())}`);
      if (!resp.ok) return null;
      const raw = await resp.json();
      if (raw.error && raw.error !== 'no_data_extracted') return null;
      if (raw.error === 'no_data_extracted') return null;
      data = normalizeScrapeResponse(raw);
    } else {
      // Tauri production: prefer API mode if key available
      const apiKey = (import.meta.env.VITE_GURUFOCUS_KEY || '').trim();

      if (apiKey) {
        const resp = await fetch(`https://api.gurufocus.com/public/user/${apiKey}/stock/${encodeURIComponent(ticker.toUpperCase())}/summary`);
        if (!resp.ok) return null;
        const raw = await resp.json();
        data = normalizeApiResponse(raw);
      } else {
        // Scrape mode in production — attempt direct fetch
        const resp = await fetch(`https://www.gurufocus.com/stock/${encodeURIComponent(ticker.toUpperCase())}/summary`, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
        });
        if (!resp.ok) return null;
        // In Tauri, we'd need to parse the HTML — but GuruFocus is JS-heavy
        // so this will likely return empty. API mode is recommended for production.
        return null;
      }
    }

    if (!hasUsefulData(data)) return null;

    cacheSet(key, data, 'analyst');
    return data;
  } catch (err) {
    console.warn('[gurufocus] fetch failed:', err.message);
    return null;
  }
}

export function clearGuruFocusCache(ticker) {
  if (!ticker) return;
  const key = cacheKey(ticker);
  try { localStorage.removeItem(`sa-cache:${key}`); } catch {}
}
