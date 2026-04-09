// EDGAR Frames API — cross-check extracted values against EDGAR's aggregated data.
// Endpoint: data.sec.gov/api/xbrl/frames/us-gaap/{tag}/{unit}/CY{year}.json
// Returns the reported value for ALL companies for a given tag/year.
// We filter by CIK to find our company's value.

import { cacheGetAsync, cacheSet } from './cache';
import { edgarBase } from './apiBase';

function framesUrl(tag, unit, cyYear) {
  return `${edgarBase()}/api/xbrl/frames/us-gaap/${tag}/${unit}/CY${cyYear}.json`;
}

// The 9 most critical tags for Rule One scoring/valuation.
// Each entry: { tag, fallbacks, unit, ourField }
// fallbacks: alternative XBRL tags to try if primary returns no data for this CIK
export const FRAMES_TAGS = [
  { tag: 'Revenues', fallbacks: ['RevenueFromContractWithCustomerExcludingAssessedTax', 'RevenueFromContractWithCustomerIncludingAssessedTax'], unit: 'USD', ourField: 'revenues', period: 'duration' },
  { tag: 'NetIncomeLoss', fallbacks: [], unit: 'USD', ourField: 'net_income_loss', period: 'duration' },
  { tag: 'Assets', fallbacks: [], unit: 'USD', ourField: 'assets', period: 'instant' },
  { tag: 'StockholdersEquity', fallbacks: ['StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'], unit: 'USD', ourField: 'equity', period: 'instant' },
  { tag: 'Liabilities', fallbacks: [], unit: 'USD', ourField: 'liabilities', period: 'instant' },
  { tag: 'NetCashProvidedByUsedInOperatingActivities', fallbacks: ['NetCashProvidedByUsedInOperatingActivitiesContinuingOperations'], unit: 'USD', ourField: 'net_cash_flow_from_operating_activities', period: 'duration' },
  { tag: 'PaymentsToAcquirePropertyPlantAndEquipment', fallbacks: ['PaymentsToAcquireProductiveAssets'], unit: 'USD', ourField: 'capital_expenditures', period: 'duration' },
  { tag: 'LongTermDebtNoncurrent', fallbacks: ['LongTermDebt'], unit: 'USD', ourField: 'long_term_debt', period: 'instant' },
  { tag: 'EarningsPerShareDiluted', fallbacks: ['EarningsPerShareBasic'], unit: 'USD/shares', ourField: 'diluted_earnings_per_share', period: 'duration' },
];

// Extended tags for peer/competitor metrics computation.
export const PEER_FRAMES_TAGS = [
  ...FRAMES_TAGS,
  { tag: 'GrossProfit', fallbacks: [], unit: 'USD', ourField: 'gross_profit', period: 'duration' },
  { tag: 'OperatingIncomeLoss', fallbacks: [], unit: 'USD', ourField: 'operating_income', period: 'duration' },
  { tag: 'AssetsCurrent', fallbacks: ['CurrentAssets'], unit: 'USD', ourField: 'current_assets', period: 'instant' },
  { tag: 'LiabilitiesCurrent', fallbacks: ['CurrentLiabilities'], unit: 'USD', ourField: 'current_liabilities', period: 'instant' },
  { tag: 'InventoryNet', fallbacks: ['Inventory'], unit: 'USD', ourField: 'inventory', period: 'instant' },
  { tag: 'CashAndCashEquivalentsAtCarryingValue', fallbacks: ['Cash', 'CashCashEquivalentsAndShortTermInvestments'], unit: 'USD', ourField: 'cash', period: 'instant' },
  { tag: 'CommonStockSharesOutstanding', fallbacks: ['EntityCommonStockSharesOutstanding'], unit: 'shares', ourField: 'shares_outstanding', period: 'instant' },
  { tag: 'IncomeTaxExpenseBenefit', fallbacks: ['CurrentIncomeTaxExpenseBenefit'], unit: 'USD', ourField: 'income_tax', period: 'duration' },
  { tag: 'CostOfRevenue', fallbacks: ['CostOfGoodsAndServicesSold', 'CostOfGoodsSold'], unit: 'USD', ourField: 'cost_of_revenue', period: 'duration' },
  { tag: 'CostsAndExpenses', fallbacks: ['OperatingExpenses'], unit: 'USD', ourField: 'total_costs_and_expenses', period: 'duration' },
];

// Fetch a Frames response for a specific tag/unit/year. Cached.
export async function fetchFrame(tag, unit, cyYear) {
  const cacheKey = `edgar-frames:${tag}:${unit}:CY${cyYear}`;
  const cached = await cacheGetAsync(cacheKey);
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
  // Use correct period format for balance sheet (instant) vs income statement (duration) tags
  const effectiveYear = tagDef.period === 'instant' ? `${cyYear}Q4I` : cyYear;
  // Try primary tag, then fallbacks
  const tagsToTry = [tagDef.tag, ...tagDef.fallbacks];

  for (const tag of tagsToTry) {
    const framesData = await fetchFrame(tag, tagDef.unit, effectiveYear);
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

// Fetch multiple Frames in parallel with throttling (100ms spacing for SEC 10 req/s).
// Returns Map<tag+unit+year, framesData>.
export async function fetchFramesBulk(tagDefs, cyYear) {
  const results = new Map();
  const queue = [];
  for (const def of tagDefs) {
    const effectiveYear = def.period === 'instant' ? `${cyYear}Q4I` : cyYear;
    queue.push({ tag: def.tag, unit: def.unit, def, effectiveYear });
    for (const fb of def.fallbacks) {
      queue.push({ tag: fb, unit: def.unit, def, effectiveYear });
    }
  }
  // Process in batches of 8 with 100ms gaps
  for (let i = 0; i < queue.length; i += 8) {
    const batch = queue.slice(i, i + 8);
    const promises = batch.map(({ tag, unit, effectiveYear }) => fetchFrame(tag, unit, effectiveYear));
    const batchResults = await Promise.all(promises);
    batch.forEach(({ tag, unit, effectiveYear }, j) => {
      if (batchResults[j]) results.set(`${tag}:${unit}:CY${effectiveYear}`, batchResults[j]);
    });
    if (i + 8 < queue.length) await new Promise(r => setTimeout(r, 100));
  }
  return results;
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
