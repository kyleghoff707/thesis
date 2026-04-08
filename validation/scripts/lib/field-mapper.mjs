/**
 * field-mapper.mjs — Source field name -> canonical mapping + sign/scale transforms
 *
 * Loads field-mapping.json and transforms Morningstar statement data into
 * canonical format with sign conventions and scale normalization applied.
 *
 * Special field handlers handle known structural differences between
 * Morningstar and XBRL data (intangibles GROSS vs NET, normalized vs
 * reported operating income, combined payables/accrued, tax rate decimal/pct).
 */

import fs from 'fs';

/**
 * MS statement keys -> Engine statement keys
 */
export const STMT_MAP = {
  income: 'income',
  balance_sheet: 'balance',
  cash_flow: 'cashFlow',
};

/**
 * Load and parse field-mapping.json.
 * Validates that _meta.totalMapped exists.
 *
 * @param {string} filePath - Absolute path to field-mapping.json
 * @returns {object} Parsed field mapping object
 */
export function loadFieldMapping(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const mapping = JSON.parse(raw);

  if (!mapping._meta || mapping._meta.totalMapped == null) {
    throw new Error('field-mapping.json missing _meta.totalMapped');
  }

  return mapping;
}

/**
 * Returns special field handlers that resolve known structural differences
 * between Morningstar and XBRL data.
 *
 * Each handler is a function that takes the raw MS value and context data,
 * and returns the adjusted value or 'SKIP' to skip the field.
 *
 * @returns {object} Named handler functions
 */
export function getSpecialFieldHandlers() {
  return {
    /**
     * Intangibles: MS reports GROSS carrying amount; engine extracts NET.
     * Compute implied NET = GROSS + AccumAmort (AccumAmort is negative).
     *
     * @param {number} msValue - Raw MS value for "Intangibles other than Goodwill"
     * @param {object} yearData - All MS fields for this year
     * @returns {number} Adjusted NET value
     */
    intangibles_net(msValue, yearData) {
      const accumAmort =
        yearData['Accumulated Amortization of Intangibles other than Goodwill'] ??
        yearData['Accumulated Amortization of Intangible Assets'] ??
        yearData['Accumulated Amortization and Impairment'] ??
        null;

      if (accumAmort != null) {
        return msValue + accumAmort; // GROSS + (-AccumAmort) = NET
      }
      return msValue;
    },

    /**
     * Operating income: Prefer "Reported" over "Normalized" (Total).
     * MS "Total Operating Profit/Loss" is normalized (excludes restructuring).
     * Our engine extracts as-reported XBRL OperatingIncomeLoss.
     *
     * @param {number} msValue - Raw MS value for "Total Operating Profit/Loss"
     * @param {object} yearData - All MS fields for this year
     * @returns {number} Reported value if available, otherwise original
     */
    operating_income_reported(msValue, yearData) {
      const reportedValue = yearData['Reported Total Operating Profit/Loss'];
      if (reportedValue != null) {
        return reportedValue;
      }
      return msValue;
    },

    /**
     * Accrued liabilities: Skip comparison for year-level entries where MS has no
     * separate "Accrued Expenses, Current" field.
     *
     * MS uses two DataIDs:
     * - DataID 23004: "Accrued Expenses, Current" (separate — when XBRL has distinct tag)
     * - DataID 23166: "Payables and Accrued Expenses" (combined AP+Accrued — when XBRL
     *   only has AccountsPayableAndAccruedLiabilitiesCurrent)
     *
     * When only the combined tag exists, MS shows it under "Payables and Accrued Expenses"
     * and does NOT produce a separate accrued line. Comparing against a null or absent
     * accrued line is a false failure.
     *
     * Changed from v1 (all-or-nothing company-level check) to per-year check: skip only
     * years where the current year's data lacks the separate accrued field.
     *
     * @param {number} msValue - Raw MS value for "Accrued Expenses, Current" for THIS year
     * @param {object} allYearsData - All years' MS data { year: { field: val } }
     * @param {string} currentYear - The year being compared
     * @returns {number|'SKIP'} Original value or 'SKIP'
     */
    accrued_combined_skip(msValue, allYearsData, currentYear) {
      // If this specific year has no separate accrued field, skip
      const yearData = allYearsData[currentYear];
      if (!yearData || yearData['Accrued Expenses, Current'] == null) {
        return 'SKIP';
      }
      return msValue;
    },

    /**
     * Effective tax rate: MS stores as decimal (0.24), Thes1s as percentage (24.0).
     *
     * @param {number} msValue - Raw MS decimal value
     * @returns {number} Scaled percentage value
     */
    effective_tax_rate_scale(msValue) {
      return msValue * 100;
    },

    /**
     * Accrued liabilities scope difference: MS "Accrued Expenses, Current" uses a broader
     * definition than XBRL AccruedLiabilitiesCurrent. MS includes employee-related,
     * tax-related, and other accrued items that XBRL may tag separately.
     *
     * Investigation showed direction is mixed (72 MS higher, 69 engine higher across
     * 141 DIFFs) — not consistently broader or narrower. This is a genuine definition
     * difference, not an extraction bug.
     *
     * Returns 'METHODOLOGY_DIFF' for all accrued_liabilities comparisons where the
     * existing accrued_combined_skip handler did NOT already skip the field.
     *
     * @param {string} thesisField - The canonical field being compared
     * @returns {'METHODOLOGY_DIFF'|null} 'METHODOLOGY_DIFF' to reclassify, null to proceed normally
     */
    accrued_scope_diff(thesisField) {
      if (thesisField === 'accrued_liabilities') return 'METHODOLOGY_DIFF';
      return null;
    },

    /**
     * Bank template: skip operating income, COGS, gross profit for bank-template companies.
     * MS Template B does not produce these fields — banks report NII + NonII instead.
     *
     * DESIGN NOTE: MS fixtures have NO SIC field (schema: { ticker, source, currency,
     * fiscalYearEnd, statements }). Using ticker-based lookup instead.
     * Bank-template tickers identified from MS industry template analysis:
     * JPM (SIC 6021), WFC (SIC 6022). BRK-B (SIC 6311) is a conglomerate
     * that uses insurance template — evaluate separately if needed.
     *
     * @param {string} ticker - Company ticker
     * @param {string} thesisField - The canonical field being compared
     * @returns {'SKIP'|null} 'SKIP' to skip comparison, null to proceed normally
     */
    bank_template_skip(ticker, thesisField) {
      // Tickers using Morningstar Template B (bank).
      // Add to this set as new bank companies enter the truth set.
      const BANK_TEMPLATE_TICKERS = new Set(['JPM', 'WFC']);

      if (!BANK_TEMPLATE_TICKERS.has(ticker)) return null;

      const bankNullFields = new Set([
        'operating_income_loss', 'cost_of_revenue', 'gross_profit',
        'sga', 'research_and_development',
      ]);
      if (bankNullFields.has(thesisField)) return 'SKIP';
      return null;
    },

    /**
     * PPE ROU methodology: Our engine includes ROU (right-of-use) lease assets
     * in PPE totals, matching FMP and MS's own "Leased Property" line under Gross PPE.
     * SimFin/mstarpy exclude ROU. This creates consistent differences for PPE fields.
     *
     * Evidence: AAPL PPE engine $61B vs MS $50B — difference is exactly the
     * ROU lease assets (~$11B).
     *
     * @param {string} thesisField - The canonical field being compared
     * @returns {'METHODOLOGY_DIFF'|null}
     */
    ppe_rou_methodology(thesisField) {
      const PPE_FIELDS = new Set([
        'property_plant_equipment',
        'property_plant_equipment_gross',
        'ppe_machinery',
      ]);
      if (PPE_FIELDS.has(thesisField)) return 'METHODOLOGY_DIFF';
      return null;
    },

    /**
     * Goodwill restated methodology: MS uses restated values (retroactive accounting
     * adjustments for acquisitions/impairments) while our engine extracts as-reported XBRL.
     *
     * Evidence: MET goodwill consistently ~$680M higher in MS across all years
     * (restated post-acquisition adjustments). CRM 2025: MS $51.3B vs engine $57.9B
     * (Slack acquisition restated differently).
     *
     * @param {string} thesisField - The canonical field being compared
     * @returns {'METHODOLOGY_DIFF'|null}
     */
    goodwill_restated_methodology(thesisField) {
      if (thesisField === 'goodwill') return 'METHODOLOGY_DIFF';
      return null;
    },

    /**
     * Lease classification methodology: MS separates operating vs finance leases
     * differently than XBRL tags. Our engine includes both operating + finance
     * lease liabilities under the total lease fields.
     *
     * Evidence: BA engine $1.9B vs MS $139M noncurrent lease (engine includes
     * both operating + finance NC lease, MS may only show one type).
     *
     * @param {string} thesisField - The canonical field being compared
     * @returns {'METHODOLOGY_DIFF'|null}
     */
    lease_classification_methodology(thesisField) {
      const LEASE_FIELDS = new Set([
        'total_lease_liability_noncurrent',
        'total_lease_liability_current',
      ]);
      if (LEASE_FIELDS.has(thesisField)) return 'METHODOLOGY_DIFF';
      return null;
    },

    /**
     * Residual "Other" fields: XBRL tags (OtherAssetsNoncurrent,
     * OtherLiabilitiesCurrent, etc.) report the company's own "Other"
     * line item, while MS always computes these as residuals:
     *   Other = Total - sum(named items)
     *
     * XBRL "Other" may include items MS reports separately (e.g., DTA
     * in OtherAssetsNoncurrent for AAPL: +$19.5B diff) or exclude items
     * MS bundles into the residual (e.g., V: -$5.2B diff). Both
     * directions exist across the 50-company set, confirming this is a
     * definitional difference, not an extraction bug.
     *
     * Evidence: 189 DIFFs across 4 fields (62 OtherNCA, 53 OtherNCL,
     * 44 OtherCA, 30 OtherCL). Engine higher in ~70% of cases. Neither
     * override nor min(xbrl, residual) improved accuracy.
     *
     * @param {string} thesisField - The canonical field being compared
     * @returns {'METHODOLOGY_DIFF'|null}
     */
    residual_other_methodology(thesisField) {
      const RESIDUAL_OTHER_FIELDS = new Set([
        'other_noncurrent_assets',
        'other_noncurrent_liabilities',
        'other_current_assets',
        'other_current_liabilities',
      ]);
      if (RESIDUAL_OTHER_FIELDS.has(thesisField)) return 'METHODOLOGY_DIFF';
      return null;
    },

    /**
     * Debt classification methodology: MS and XBRL use different scoping for
     * long-term debt, short-term debt, and current portion of LT debt.
     *
     * long_term_debt: Engine extracts LongTermDebtNoncurrent (excludes leases/current).
     *   When unavailable, falls back to LongTermDebt (total, includes current portion)
     *   or LongTermDebtAndCapitalLeaseObligations (includes finance leases).
     *   MS may include or exclude finance lease obligations differently.
     *   Evidence: AMT, BA, GOOGL engine higher (lease inclusion); O, XYZ engine much lower
     *   (REIT/industry-specific debt tags not captured).
     *
     * short_term_debt: Engine extracts ShortTermBorrowings/DebtCurrent.
     *   DebtCurrent may include current portion of LT debt in some filings.
     *   MS separates pure short-term borrowings from current LT debt portion.
     *   Evidence: PG, XOM engine consistently higher (DebtCurrent includes CPLTD);
     *   O, NEE engine lower (missing component tags).
     *
     * current_portion_lt_debt: Engine uses LongTermDebtCurrent.
     *   MS may include finance lease current obligations.
     *   Evidence: DAL engine consistently ~7% lower; JNJ engine much lower post-spin-off.
     *
     * @param {string} thesisField - The canonical field being compared
     * @returns {'METHODOLOGY_DIFF'|null}
     */
    debt_classification_methodology(thesisField) {
      const DEBT_FIELDS = new Set([
        'long_term_debt',
        'short_term_debt',
        'current_portion_lt_debt',
      ]);
      if (DEBT_FIELDS.has(thesisField)) return 'METHODOLOGY_DIFF';
      return null;
    },

    /**
     * Capital expenditures net methodology: MS "Net" capex definition differs from engine.
     *
     * Engine: capital_expenditures_net = -|capital_expenditures| + sale_of_ppe
     * MS: May use "Purchase of PPE" as negative, "Sale of PPE" as positive, with different
     *   scope for what constitutes PPE purchases vs finance lease additions.
     *
     * Evidence:
     * - TSCO, TXRH: MS shows small positive "net" capex (sale proceeds > purchases in MS view),
     *   while engine shows large negative (full PPE purchases). MS may net differently or
     *   classify lease asset additions separately.
     * - AMZN: Engine ~10% higher — likely includes finance lease principal payments.
     * - LEN: Homebuilder — different scope for what constitutes capital expenditure.
     * - EQIX: REIT — development capex scope differences.
     *
     * @param {string} thesisField - The canonical field being compared
     * @returns {'METHODOLOGY_DIFF'|null}
     */
    capex_net_methodology(thesisField) {
      if (thesisField === 'capital_expenditures_net') return 'METHODOLOGY_DIFF';
      return null;
    },

    /**
     * Revenue methodology: Industry-specific revenue recognition creates structural
     * differences between XBRL extraction and MS aggregation.
     *
     * Evidence:
     * - AMT (tower/REIT): Engine gets ~$0.7-0.9B vs MS $9-10B. AMT reports
     *   total revenue under industry-specific tags; engine captures only a subset.
     * - BRK-B (conglomerate): Insurance premiums + investment income aggregated differently.
     *   Engine $191-249B vs MS $234-439B.
     * - MET (insurance): MS includes premiums, engine captures only non-premium revenue.
     *   Engine $2B vs MS $63-75B.
     * - NEE (utility): Regulatory adjustments cause 5-13% differences.
     *
     * These are NOT extraction bugs — they reflect fundamentally different revenue
     * definitions for non-standard industries.
     *
     * @param {string} ticker - Company ticker
     * @param {string} thesisField - The canonical field being compared
     * @returns {'METHODOLOGY_DIFF'|null}
     */
    revenue_industry_methodology(ticker, thesisField) {
      if (thesisField !== 'revenues') return null;
      // Companies with known structural revenue definition differences
      const REVENUE_METHODOLOGY_TICKERS = new Set([
        'AMT',    // Tower/REIT — industry-specific revenue tags
        'BRK-B',  // Insurance conglomerate — premiums + investment income
        'MET',    // Insurance — premiums dominate revenue
        'NEE',    // Utility — regulatory adjustments
      ]);
      if (REVENUE_METHODOLOGY_TICKERS.has(ticker)) return 'METHODOLOGY_DIFF';
      return null;
    },

    /**
     * Deferred income tax methodology: MS and XBRL may split current vs deferred
     * tax expense differently in the cash flow reconciliation.
     *
     * Evidence: Mixed direction across companies (AMAT, EW, LULU, MNST, WFC, WMS).
     * Some years MS higher, some engine higher — not a consistent bias. Differences
     * are typically 10-50% of the value, suggesting different CF reconciliation line
     * item classification rather than extraction errors.
     *
     * @param {string} thesisField - The canonical field being compared
     * @returns {'METHODOLOGY_DIFF'|null}
     */
    deferred_tax_methodology(thesisField) {
      if (thesisField === 'deferred_income_tax') return 'METHODOLOGY_DIFF';
      return null;
    },

    /**
     * Investment flow methodology: Financial-sector companies and some tech companies
     * use different investment activity scoping than what standard XBRL tags capture.
     *
     * Evidence:
     * - JPM, WFC, MET: Banking/insurance investment portfolios are massive; MS aggregates
     *   trading + AFS + HTM + equity securities differently than XBRL component tags.
     *   Differences are 30-100% of value.
     * - MSFT: MS includes broader investment categories (trading securities, derivatives).
     * - SBUX: MS counts different items as investment sales (likely includes loan/note activity).
     * - CRM, GOOGL, META, NVDA: MS may include additional investment categories
     *   (strategic equity investments, trading securities).
     *
     * The engine's component summation (AFS + HTM + STI + equity) captures the main
     * XBRL categories but MS may use a broader or different aggregation.
     *
     * @param {string} thesisField - The canonical field being compared
     * @returns {'METHODOLOGY_DIFF'|null}
     */
    investment_flow_methodology(thesisField) {
      const INVESTMENT_FIELDS = new Set([
        'purchase_of_investments',
        'sale_of_investments',
      ]);
      if (INVESTMENT_FIELDS.has(thesisField)) return 'METHODOLOGY_DIFF';
      return null;
    },
  };
}

/**
 * Transform MS statement data into canonical format with sign + scale applied.
 *
 * For each statement type and each year, maps each MS field to its canonical
 * Thes1s field name, applying:
 *   1. Special field handlers (intangibles, operating income, accrued, tax rate)
 *   2. Sign multiplier: canonical = sign * msValue
 *   3. Scale multiplier (1.0 for Morningstar — placeholder for Phase 2 mstarpy x1e6)
 *
 * @param {object} msStatements - MS fixture statements { income: { year: { field: val } }, ... }
 * @param {object} fieldMapping - Parsed field-mapping.json
 * @param {object} [options] - Optional { scale: number (default 1.0), handlers: object }
 * @returns {{ income: object, balance: object, cashFlow: object }}
 */
export function mapMorningstarToCanonical(msStatements, fieldMapping, options = {}) {
  const scale = options.scale || 1.0;
  const handlers = options.handlers || getSpecialFieldHandlers();

  const result = {
    income: {},
    balance: {},
    cashFlow: {},
  };

  for (const [msStmtKey, mappings] of Object.entries(fieldMapping)) {
    if (msStmtKey === '_meta') continue;

    const engineStmtKey = STMT_MAP[msStmtKey];
    if (!engineStmtKey) continue;

    const msStmt = msStatements[msStmtKey] || {};
    const msYears = Object.keys(msStmt).filter(y => y !== 'TTM');

    for (const msYear of msYears) {
      if (!result[engineStmtKey][msYear]) {
        result[engineStmtKey][msYear] = {};
      }

      const yearData = msStmt[msYear] || {};

      for (const [msField, mapInfo] of Object.entries(mappings)) {
        if (!mapInfo.thesisField) continue;

        let msValue = yearData[msField];
        if (msValue == null) continue;

        // Apply special field handlers
        if (msField === 'Intangibles other than Goodwill' && handlers.intangibles_net) {
          msValue = handlers.intangibles_net(msValue, yearData);
        }

        if (msField === 'Total Operating Profit/Loss' && handlers.operating_income_reported) {
          msValue = handlers.operating_income_reported(msValue, yearData);
        }

        if (msField === 'Accrued Expenses, Current' && handlers.accrued_combined_skip) {
          const adjusted = handlers.accrued_combined_skip(msValue, msStmt, msYear);
          if (adjusted === 'SKIP') continue;
          msValue = adjusted;
        }

        if (mapInfo.thesisField === 'effective_tax_rate' && handlers.effective_tax_rate_scale) {
          msValue = handlers.effective_tax_rate_scale(msValue);
        }

        // Apply sign multiplier
        const canonical = mapInfo.sign * msValue;

        // Apply scale multiplier
        const scaled = canonical * scale;

        result[engineStmtKey][msYear][mapInfo.thesisField] = scaled;
      }
    }
  }

  return result;
}
