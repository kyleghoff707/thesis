// Stock split data from Polygon.io
// Used to normalize historical per-share values and share counts from EDGAR.
//
// EDGAR stores values as-reported in each 10-K filing. When a company splits,
// post-split filings restate 2-3 years of comparatives with adjusted numbers,
// but older years keep their original (pre-split) values. This creates
// inconsistent per-share data across the full history.
//
// We fetch the split history and apply cumulative adjustment factors so all
// per-share values and share counts are on the same basis as current shares.

import { POLYGON_KEY } from './config';
import { cacheGet, cacheSet } from './cache';

export async function fetchSplits(ticker) {
  const t = ticker.toUpperCase();
  const cacheKey = `splits:${t}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  if (!POLYGON_KEY) return [];

  try {
    const url = `https://api.polygon.io/v3/reference/splits?ticker=${t}&sort=execution_date&order=desc&limit=100&apiKey=${POLYGON_KEY}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();

    const splits = (data.results || []).map(s => ({
      date: s.execution_date,
      ratio: s.split_to / s.split_from, // e.g. 4 for a 4:1 split
    }));

    cacheSet(cacheKey, splits, 'financials');
    return splits;
  } catch (err) {
    console.warn(`Splits fetch failed for ${t}:`, err.message);
    return [];
  }
}

// Cumulative split factor for a given fiscal year.
// = product of all split ratios where the split occurred AFTER this fiscal year.
// Per-share values: divide by this factor.
// Share counts: multiply by this factor.
export function cumulativeSplitFactor(splits, fiscalYear) {
  let factor = 1;
  for (const split of splits) {
    const splitYear = parseInt(split.date.split('-')[0]);
    if (splitYear > fiscalYear) {
      factor *= split.ratio;
    }
  }
  return factor;
}
