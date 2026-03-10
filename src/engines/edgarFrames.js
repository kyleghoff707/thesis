// EDGAR Frames API — cross-check extracted values against EDGAR's aggregated data.
// Endpoint: data.sec.gov/api/xbrl/frames/us-gaap/{tag}/{unit}/CY{year}.json
// Returns the reported value for ALL companies for a given tag/year.
// We filter by CIK to find our company's value.

import { cacheGet, cacheSet } from './cache';

const IS_DEV = import.meta.env.DEV;

function framesUrl(tag, unit, cyYear) {
  const base = IS_DEV ? '/api/edgar' : 'https://data.sec.gov';
  return `${base}/api/xbrl/frames/us-gaap/${tag}/${unit}/CY${cyYear}.json`;
}

// The 9 most critical tags for Rule One scoring/valuation.
// Each entry: { tag, fallbacks, unit, ourField }
// fallbacks: alternative XBRL tags to try if primary returns no data for this CIK
export const FRAMES_TAGS = [
  { tag: 'Revenues', fallbacks: ['RevenueFromContractWithCustomerExcludingAssessedTax', 'RevenueFromContractWithCustomerIncludingAssessedTax'], unit: 'USD', ourField: 'revenues' },
  { tag: 'NetIncomeLoss', fallbacks: [], unit: 'USD', ourField: 'net_income_loss' },
  { tag: 'Assets', fallbacks: [], unit: 'USD', ourField: 'assets' },
  { tag: 'StockholdersEquity', fallbacks: ['StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'], unit: 'USD', ourField: 'equity' },
  { tag: 'Liabilities', fallbacks: [], unit: 'USD', ourField: 'liabilities' },
  { tag: 'NetCashProvidedByUsedInOperatingActivities', fallbacks: ['NetCashProvidedByUsedInOperatingActivitiesContinuingOperations'], unit: 'USD', ourField: 'net_cash_flow_from_operating_activities' },
  { tag: 'PaymentsToAcquirePropertyPlantAndEquipment', fallbacks: ['PaymentsToAcquireProductiveAssets'], unit: 'USD', ourField: 'capital_expenditures' },
  { tag: 'LongTermDebtNoncurrent', fallbacks: ['LongTermDebt'], unit: 'USD', ourField: 'long_term_debt' },
  { tag: 'EarningsPerShareDiluted', fallbacks: [], unit: 'USD/shares', ourField: 'diluted_earnings_per_share' },
];

// Fetch a Frames response for a specific tag/unit/year. Cached.
async function fetchFrame(tag, unit, cyYear) {
  const cacheKey = `edgar-frames:${tag}:${unit}:CY${cyYear}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const url = framesUrl(tag, unit, cyYear);
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    cacheSet(cacheKey, data, 'financials');
    return data;
  } catch (err) {
    console.warn(`Frames fetch failed: ${tag}/${unit}/CY${cyYear}:`, err.message);
    return null;
  }
}

// Find a company's value in a Frames response by CIK.
// CIK in Frames data is numeric (no leading zeros).
function findByCIK(framesData, cik) {
  if (!framesData?.data) return null;
  const numCik = parseInt(cik, 10);
  const entry = framesData.data.find(d => d.cik === numCik);
  return entry || null;
}

// Cross-check our extracted value for a field against the Frames API.
// Returns { tag, year, ours, frames, diff, pctDiff, status }
// cyYear = calendar year integer for the Frames API
export async function crossCheckField(tagDef, cik, cyYear, ourValue) {
  // Try primary tag, then fallbacks
  const tagsToTry = [tagDef.tag, ...tagDef.fallbacks];

  for (const tag of tagsToTry) {
    const framesData = await fetchFrame(tag, tagDef.unit, cyYear);
    if (!framesData) continue;

    const entry = findByCIK(framesData, cik);
    if (!entry) continue;

    const framesVal = entry.val;
    const diff = ourValue != null ? Math.abs(ourValue - framesVal) : null;
    const pctDiff = ourValue != null && framesVal !== 0
      ? Math.abs((ourValue - framesVal) / framesVal) * 100
      : null;

    let status = 'match';
    if (ourValue == null) {
      status = 'missing_ours';
    } else if (pctDiff != null && pctDiff > 5) {
      status = 'error';
    } else if (pctDiff != null && pctDiff > 1) {
      status = 'warning';
    }

    return {
      tag,
      ourField: tagDef.ourField,
      year: cyYear,
      ours: ourValue,
      frames: framesVal,
      diff,
      pctDiff: pctDiff != null ? Math.round(pctDiff * 100) / 100 : null,
      status,
    };
  }

  // No Frames data found for any tag variant
  return {
    tag: tagDef.tag,
    ourField: tagDef.ourField,
    year: cyYear,
    ours: ourValue,
    frames: null,
    diff: null,
    pctDiff: null,
    status: ourValue != null ? 'missing_frames' : 'both_missing',
  };
}

// Map fiscal year to calendar year for the Frames API.
// Most companies: FY = CY. Non-calendar FYE (e.g., SFM FY2025 ends Jan 2026):
// the Frames API groups by the calendar year the fiscal period falls in.
// For annual data, CY = FY for most cases. For fiscal years ending in Jan/Feb
// of the *next* calendar year, CY = FY (the period mostly falls in that CY).
export function fiscalYearToCalendarYear(fy, fiscalEndMonth) {
  // Fiscal years ending in Jan or Feb technically end in the next calendar year,
  // but the Frames API uses the year from the XBRL fy field which matches our FY.
  // So CY = FY in all cases for annual data.
  return fy;
}
