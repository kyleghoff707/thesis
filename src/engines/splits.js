// Stock split detection via EDGAR XBRL data
// Used to normalize historical per-share values and share counts from EDGAR.
//
// EDGAR stores values as-reported in each 10-K filing. When a company splits,
// post-split filings restate 2-3 years of comparatives with adjusted numbers,
// but older years keep their original (pre-split) values. This creates
// inconsistent per-share data across the full history.
//
// We detect splits from EDGAR companyfacts data (zero additional API calls)
// and apply cumulative adjustment factors so all per-share values and share
// counts are on the same basis as current shares.

import { lookupCIK, fetchCompanyFacts } from './edgar';
import { cacheGet, cacheSet } from './cache';

// ─── Primary: Explicit XBRL split ratio tag ─────────────────────────
// StockholdersEquityNoteStockSplitConversionRatio1 (units: pure)
// Gives the exact split ratio (e.g., 4.0 for 4:1, 0.05 for 1:20 reverse).

function extractExplicitSplits(facts) {
  const tag = facts?.facts?.['us-gaap']?.['StockholdersEquityNoteStockSplitConversionRatio1'];
  if (!tag) return [];

  const entries = tag.units?.['pure'] || [];
  const validForms = new Set(['10-K', '10-Q', '8-K']);
  const filtered = entries.filter(e => validForms.has(e.form) && e.end && e.val);

  // Deduplicate by end date — keep latest filed per date
  const byDate = {};
  for (const e of filtered) {
    if (!byDate[e.end] || e.filed > byDate[e.end].filed) {
      byDate[e.end] = e;
    }
  }

  return Object.values(byDate).map(e => ({
    date: e.end,
    ratio: e.val,
  }));
}

// ─── Fallback: Share count jump detection ────────────────────────────
// EntityCommonStockSharesOutstanding from dei namespace.
// Walk sequential pairs and detect jumps >= 1.8x (forward) or <= 0.55x (reverse).

function detectSplitsFromShareCounts(facts) {
  const tag = facts?.facts?.['dei']?.['EntityCommonStockSharesOutstanding'];
  if (!tag) return [];

  const entries = tag.units?.['shares'] || [];
  const validForms = new Set(['10-K', '10-Q', '8-K']);
  const filtered = entries.filter(e => validForms.has(e.form) && e.end && e.val > 0);

  // Sort by end date, then filed date
  filtered.sort((a, b) => a.end.localeCompare(b.end) || a.filed.localeCompare(b.filed));

  // Deduplicate by end date — keep latest filed per date
  const byDate = {};
  for (const e of filtered) {
    if (!byDate[e.end] || e.filed > byDate[e.end].filed) {
      byDate[e.end] = e;
    }
  }

  const sorted = Object.values(byDate).sort((a, b) => a.end.localeCompare(b.end));
  if (sorted.length < 2) return [];

  // Check for confirming XBRL tag (shares issued due to split)
  const confirmTag = facts?.facts?.['us-gaap']?.['StockIssuedDuringPeriodSharesStockSplits'];
  const confirmDates = new Set();
  if (confirmTag) {
    const confirmEntries = confirmTag.units?.['shares'] || [];
    for (const e of confirmEntries) {
      if (e.end) confirmDates.add(e.end);
    }
  }

  const splits = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    const ratio = curr.val / prev.val;

    if (ratio >= 1.8) {
      // Forward split — round to nearest integer for clean ratios
      const detected = { date: curr.end, ratio: Math.round(ratio) };
      if (!confirmDates.has(curr.end)) {
        console.warn(`Detected possible split for ${curr.end} (ratio ${Math.round(ratio)}) — no confirming XBRL tag found`);
      }
      splits.push(detected);
    } else if (ratio <= 0.55 && ratio > 0) {
      // Reverse split — keep precise decimal
      const detected = { date: curr.end, ratio };
      if (!confirmDates.has(curr.end)) {
        console.warn(`Detected possible reverse split for ${curr.end} (ratio ${ratio.toFixed(4)}) — no confirming XBRL tag found`);
      }
      splits.push(detected);
    }
    // 0.55–1.8 range = normal share count changes (buybacks, issuances, options)
  }

  return splits;
}

// ─── Public API ──────────────────────────────────────────────────────

export async function fetchSplits(ticker) {
  const t = ticker.toUpperCase();
  const cacheKey = `splits:${t}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  try {
    const cik = await lookupCIK(ticker);
    if (!cik) return [];

    const facts = await fetchCompanyFacts(cik);
    if (!facts) return [];

    // Try explicit XBRL split ratio tag first (most reliable)
    let splits = extractExplicitSplits(facts);

    // Fall back to share count jump detection
    if (splits.length === 0) {
      splits = detectSplitsFromShareCounts(facts);
    }

    // Sort descending by date (newest first)
    splits.sort((a, b) => b.date.localeCompare(a.date));

    cacheSet(cacheKey, splits, 'financials');
    return splits;
  } catch (err) {
    console.warn(`Splits detection failed for ${t}:`, err.message);
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
