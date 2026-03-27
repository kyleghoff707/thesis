/**
 * sp500-fmp-comparator.mjs -- Tiered field comparison: FMP data vs XBRL engine output
 *
 * Compares FMP canonical financial data against the Thes1s XBRL engine for a single
 * company, with tier-aware tolerance thresholds. Tier 1 (scoring-critical) fields use
 * exact tolerance (1%), Tier 2 (display) uses close (5%), Tier 3 (expanded) uses
 * approximate (10%).
 *
 * FIELD_TIERS mirrors tickerAudit.js XBRL Coverage Dashboard tiers.
 */

import { compareField, EUR_COMPANIES } from './comparator.mjs';
import { resolveFieldName } from './field-alias-map.mjs';

// ─── FMP Sign Convention Fix ────────────────────────────────
// FMP stores cash outflow fields as NEGATIVE (outflow convention).
// Our XBRL engine stores Payments/Repayments tags as POSITIVE.
// These fields need sign flip (multiply by -1) before comparison.
//
// Note: capital_expenditures already has sign:-1 in field-mapping.json,
// so it's stored as positive in the FMP cache. These fields have sign:1
// in the mapping, so they're stored as raw FMP negative values.
const SIGN_FLIP_FIELDS = new Set([
  'share_repurchases',
  'dividends_paid',
  'purchase_of_investments',
  'purchase_of_business',
  'repayments_of_lt_debt',
]);

// ─── Field Tier Definitions ─────────────────────────────────
// Mirrors src/engines/tickerAudit.js FIELD_TIERS (engine field names)

export const FIELD_TIERS = {
  // Tier 1: Scoring-Critical (23 fields)
  revenues: 1,
  operating_income_loss: 1,
  net_income_loss: 1,
  basic_earnings_per_share: 1,
  diluted_earnings_per_share: 1,
  basic_average_shares: 1,
  diluted_average_shares: 1,
  dividends_per_share: 1,
  income_tax: 1,
  cash: 1,
  long_term_debt: 1,
  short_term_debt: 1,
  current_portion_lt_debt: 1,
  equity: 1,
  retained_earnings: 1,
  shares_outstanding: 1,
  assets: 1,
  liabilities: 1,
  net_cash_flow_from_operating_activities: 1,
  capital_expenditures: 1,
  depreciation_amortization: 1,
  dividends_paid: 1,
  share_repurchases: 1,

  // Tier 2: Display (32 fields)
  cost_of_revenue: 2,
  gross_profit: 2,
  sga: 2,
  research_and_development: 2,
  depreciation_amortization_is: 2,
  operating_expenses: 2,
  interest_expense: 2,
  income_before_tax: 2,
  accounts_receivable: 2,
  inventory: 2,
  current_assets: 2,
  property_plant_equipment: 2,
  goodwill: 2,
  intangible_assets: 2,
  current_liabilities: 2,
  additional_paid_in_capital: 2,
  common_stock: 2,
  aoci: 2,
  treasury_stock: 2,
  liabilities_and_equity: 2,
  operating_lease_rou_asset: 2,
  operating_lease_liability_current: 2,
  operating_lease_liability_noncurrent: 2,
  stock_based_compensation: 2,
  deferred_income_tax: 2,
  change_in_receivables: 2,
  change_in_inventory: 2,
  change_in_payables: 2,
  net_cash_flow_from_investing_activities: 2,
  net_cash_flow_from_financing_activities: 2,
  proceeds_from_lt_debt: 2,
  repayments_of_lt_debt: 2,

  // Tier 3: Expanded (30 fields)
  other_operating_expenses: 3,
  interest_income: 3,
  net_interest_income: 3,
  other_income_expense: 3,
  income_from_continuing_operations: 3,
  short_term_investments: 3,
  prepaid_expenses: 3,
  other_current_assets: 3,
  property_plant_equipment_gross: 3,
  accumulated_depreciation: 3,
  long_term_investments: 3,
  deferred_tax_assets: 3,
  other_noncurrent_assets: 3,
  accounts_payable: 3,
  accrued_liabilities: 3,
  deferred_revenue_current: 3,
  other_current_liabilities: 3,
  deferred_tax_liabilities: 3,
  pension_liabilities: 3,
  other_noncurrent_liabilities: 3,
  noncurrent_liabilities: 3,
  minority_interest: 3,
  other_noncash_items: 3,
  change_in_other_working_capital: 3,
  sale_of_ppe: 3,
  purchase_of_investments: 3,
  sale_of_investments: 3,
  purchase_of_business: 3,
  proceeds_from_stock_issuance: 3,
  effect_of_exchange_rate: 3,
};

// ─── Tier-to-Tolerance Mapping ──────────────────────────────

/**
 * Map field tier number to tolerance tier name.
 *
 * @param {number} tier - Field tier (1, 2, 3, or 0 for untiered)
 * @returns {string} Tolerance tier name for compareField
 */
export function tierToTolerance(tier) {
  switch (tier) {
    case 1: return 'exact';
    case 2: return 'close';
    case 3: return 'approximate';
    default: return 'informational';
  }
}

// ─── Fiscal Year Alignment ──────────────────────────────────
// FMP labels fiscal years by the FY-end year: LULU FY ending Jan 2025 = FMP "2025".
// Our XBRL engine labels them by the calendar year covering most of the fiscal period:
// LULU FY ending Jan 2025 = engine "2024".
//
// For companies with Jan-May fiscal year ends, FMP year = engine year + 1.
// For June-Dec fiscal year ends, FMP year = engine year (no offset needed).

/**
 * Detect fiscal year offset between FMP and engine year labels.
 *
 * Uses revenue matching: for each FMP year, check if the revenue value
 * matches engine's same year (offset=0), previous year (offset=-1),
 * or next year (offset=+1).
 *
 * Non-December FY companies have different year labeling between FMP and engine:
 * - FMP uses the fiscal year designation (e.g., FY2025 ending Jan 2025 = FMP "2025")
 * - Engine may use the XBRL period end year or filing year, which can differ by +1 or -1
 *
 * @param {object} fmpData - FMP data with statement keyed by year
 * @param {object} engineData - Engine data with statement keyed by year
 * @returns {number} Offset to ADD to FMP year to get engine year (-1, 0, or +1)
 */
function detectFYOffset(fmpData, engineData) {
  const fmpIncome = fmpData.income || {};
  const engineIncome = engineData.income || {};
  const fmpYears = Object.keys(fmpIncome).sort();

  let matchNeg1 = 0, match0 = 0, matchPos1 = 0;

  for (const fmpYear of fmpYears) {
    const fmpRevenue = fmpIncome[fmpYear]?.revenues;
    if (fmpRevenue == null || Math.abs(fmpRevenue) < 1000) continue;

    // Check offset=0: FMP year -> engine same year
    const engine0 = engineIncome[fmpYear]?.revenues;
    if (engine0 != null) {
      const pct0 = Math.abs((engine0 - fmpRevenue) / fmpRevenue);
      if (pct0 < 0.01) match0++;
    }

    // Check offset=-1: FMP year -> engine year-1
    const prevYear = String(Number(fmpYear) - 1);
    const engineNeg1 = engineIncome[prevYear]?.revenues;
    if (engineNeg1 != null) {
      const pctNeg1 = Math.abs((engineNeg1 - fmpRevenue) / fmpRevenue);
      if (pctNeg1 < 0.01) matchNeg1++;
    }

    // Check offset=+1: FMP year -> engine year+1
    const nextYear = String(Number(fmpYear) + 1);
    const enginePos1 = engineIncome[nextYear]?.revenues;
    if (enginePos1 != null) {
      const pctPos1 = Math.abs((enginePos1 - fmpRevenue) / fmpRevenue);
      if (pctPos1 < 0.01) matchPos1++;
    }
  }

  // Pick the offset with the most revenue matches (need at least 2 matches)
  if (matchPos1 > match0 && matchPos1 > matchNeg1 && matchPos1 >= 2) return 1;
  if (matchNeg1 > match0 && matchNeg1 > matchPos1 && matchNeg1 >= 2) return -1;
  return 0;
}

// ─── Statement Key Mapping ──────────────────────────────────

// Engine statement keys match FMP canonical keys
const STMT_KEYS = ['income', 'balance', 'cashFlow'];

// ─── Compare FMP vs Engine ──────────────────────────────────

/**
 * Compare FMP financial data against XBRL engine output for a single company.
 *
 * @param {string} ticker - Stock ticker
 * @param {object|null} fmpData - FMP data { income: { year: { field: value } }, balance: {...}, cashFlow: {...} }
 * @param {object|null} engineData - Engine data { years: [], income: { year: { field: value } }, balance: {...}, cashFlow: {...} }
 * @returns {{ ticker: string, status: string, yearsCompared: number, results: Array }}
 */
export function compareFmpToEngine(ticker, fmpData, engineData) {
  // Skip EUR filers
  if (EUR_COMPANIES.has(ticker)) {
    return { ticker, status: 'SKIP_EUR', yearsCompared: 0, results: [] };
  }

  // No data guard
  if (!fmpData || !engineData) {
    return { ticker, status: 'NO_DATA', yearsCompared: 0, results: [] };
  }

  const results = [];

  // Detect fiscal year offset (0 for Dec FY, +1 or -1 for non-Dec FY)
  const fyOffset = detectFYOffset(fmpData, engineData);

  // Determine overlapping years across all statement types
  const allOverlappingYears = new Set();

  for (const stmtKey of STMT_KEYS) {
    const fmpStmt = fmpData[stmtKey] || {};
    const engineStmt = engineData[stmtKey] || {};

    const fmpYears = Object.keys(fmpStmt);
    const engineYears = new Set(Object.keys(engineStmt));

    // Apply FY offset: FMP year N -> engine year (N + offset)
    const overlappingYears = fmpYears.filter(y => {
      const engineYearKey = String(Number(y) + fyOffset);
      return engineYears.has(engineYearKey);
    });

    for (const year of overlappingYears) {
      allOverlappingYears.add(year);

      const engineYearKey = String(Number(year) + fyOffset);
      const fmpYear = fmpStmt[year] || {};
      const engineYear = engineStmt[engineYearKey] || {};

      for (const [canonicalField, rawFmpValue] of Object.entries(fmpYear)) {
        if (rawFmpValue == null) continue;

        // Resolve canonical FMP field name to engine field name
        const engineFieldName = resolveFieldName(canonicalField);

        // Apply sign flip for fields where FMP uses outflow convention (negative)
        // but engine stores XBRL Payments tags as positive
        const fmpValue = SIGN_FLIP_FIELDS.has(engineFieldName) ? -rawFmpValue : rawFmpValue;

        // Look up engine value
        const engineValue = engineYear[engineFieldName];

        // Look up tier
        const tier = FIELD_TIERS[engineFieldName] || 0;

        // Get tolerance
        const tolerance = tierToTolerance(tier);

        if (engineValue == null) {
          results.push({
            field: engineFieldName,
            canonicalField,
            statement: stmtKey,
            year,
            tier,
            status: 'MISSING_FIELD',
            pct: null,
            expected: fmpValue,
            actual: null,
          });
          continue;
        }

        // Compare: sign is 1 because FMP data is already sign-normalized
        // (and sign-flip fields have been corrected above)
        const comparison = compareField(fmpValue, engineValue, 1, tolerance);

        results.push({
          field: engineFieldName,
          canonicalField,
          statement: stmtKey,
          year,
          tier,
          status: comparison.status,
          pct: comparison.pct,
          expected: comparison.expected,
          actual: comparison.actual,
        });
      }
    }
  }

  return {
    ticker,
    status: 'OK',
    yearsCompared: allOverlappingYears.size,
    results,
  };
}
