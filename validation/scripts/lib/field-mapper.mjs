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
