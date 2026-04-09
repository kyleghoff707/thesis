// Stock split detection via Yahoo Finance + EDGAR XBRL fallback
// Used to normalize historical per-share values and share counts from EDGAR.
//
// EDGAR stores values as-reported in each 10-K filing. When a company splits,
// post-split filings restate 2-3 years of comparatives with adjusted numbers,
// but older years keep their original (pre-split) values. This creates
// inconsistent per-share data across the full history.
//
// Primary source: Yahoo Finance chart endpoint (events.splits field).
// Fallback: EDGAR XBRL tags (explicit ratio tag, share count jump detection).
// Yahoo is preferred because EDGAR's post-split restatements make XBRL-based
// detection unreliable for companies like TSCO.

import { lookupCIK, fetchCompanyFacts } from './edgar';
import { cacheGet, cacheSet } from './cache';
import { yahooChartBase } from './apiBase';

const YAHOO_BASE = yahooChartBase();

// ─── Month abbreviation → last day of month ─────────────────────────
const MONTH_LAST_DAY = {
  Jan: '01-31', Feb: '02-28', Mar: '03-31', Apr: '04-30',
  May: '05-31', Jun: '06-30', Jul: '07-31', Aug: '08-31',
  Sep: '09-30', Oct: '10-31', Nov: '11-30', Dec: '12-31',
};

// ─── Yahoo Finance split detection ──────────────────────────────────
// The chart endpoint returns events.splits as an object keyed by Unix timestamp.
// Each value: { date: <unix_ts>, numerator: N, denominator: M }

export function parseYahooSplits(splitEvents) {
  if (!splitEvents || typeof splitEvents !== 'object') return [];

  return Object.values(splitEvents)
    .filter(e => e.date && e.numerator && e.denominator)
    .map(e => ({
      date: new Date(e.date * 1000).toISOString().slice(0, 10),
      ratio: e.numerator / e.denominator,
    }));
}

async function fetchSplitsFromYahoo(ticker) {
  try {
    // Fetch full history to get all splits
    const url = `${YAHOO_BASE}/${ticker}?period1=0&period2=${Math.floor(Date.now() / 1000)}&interval=1mo`;
    const res = await fetch(url);
    if (!res.ok) return [];

    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result?.events?.splits) return [];

    return parseYahooSplits(result.events.splits);
  } catch {
    return [];
  }
}

// ─── EDGAR: Explicit XBRL split ratio tag (fallback) ────────────────
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

// ─── EDGAR: Share count jump detection (fallback) ───────────────────
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
    // Primary: Yahoo Finance (reliable — not affected by XBRL restatements)
    let splits = await fetchSplitsFromYahoo(t);

    // Fallback: EDGAR XBRL
    if (splits.length === 0) {
      const cik = await lookupCIK(ticker);
      if (cik) {
        const facts = await fetchCompanyFacts(cik);
        if (facts) {
          splits = extractExplicitSplits(facts);
          if (splits.length === 0) {
            splits = detectSplitsFromShareCounts(facts);
          }
        }
      }
    }

    // Sort descending by date (newest first)
    splits.sort((a, b) => b.date.localeCompare(a.date));

    // Deduplicate: EDGAR can report the same split event with multiple end dates
    // (e.g., NVDA 10:1 appears as both 2024-06-30 and 2024-05-31).
    // Merge entries with the same ratio within 90 days, keeping the later date.
    const deduped = [];
    for (const s of splits) {
      const isDup = deduped.some(existing => {
        if (existing.ratio !== s.ratio) return false;
        const d1 = new Date(existing.date);
        const d2 = new Date(s.date);
        const daysDiff = Math.abs(d1 - d2) / (1000 * 60 * 60 * 24);
        return daysDiff <= 90;
      });
      if (!isDup) deduped.push(s);
    }
    splits = deduped;

    cacheSet(cacheKey, splits, 'financials');
    return splits;
  } catch (err) {
    console.warn(`Splits detection failed for ${t}:`, err.message);
    return [];
  }
}

// Cumulative split factor for a given fiscal year.
// = product of all split ratios where the split occurred AFTER this fiscal year ended.
// Per-share values: divide by this factor.
// Share counts: multiply by this factor.
//
// fiscalMonth: optional month abbreviation for FY end (e.g. 'Sep' for AAPL).
// Defaults to 'Dec' (calendar year). Needed because a split in Nov 2020 is
// AFTER a Sep 2020 FY end but BEFORE a Dec 2020 FY end.
export function cumulativeSplitFactor(splits, fiscalYear, fiscalMonth) {
  const monthDay = MONTH_LAST_DAY[fiscalMonth] || MONTH_LAST_DAY.Dec;
  const fyEndDate = `${fiscalYear}-${monthDay}`;

  let factor = 1;
  for (const split of splits) {
    // ISO date string comparison works correctly for chronological ordering
    if (split.date > fyEndDate) {
      factor *= split.ratio;
    }
  }
  return factor;
}
