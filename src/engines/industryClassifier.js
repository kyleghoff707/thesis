// ─── Industry Classifier ────────────────────────────────────────
// Maps SIC codes to industry types for overlay selection.
// Used by edgarFinancials.js to apply industry-specific XBRL
// taxonomy overlays (bank, REIT, insurance) on top of the
// master taxonomy.
//
// Only classifies the ~4 structural types that fundamentally differ
// in how they report financials via XBRL. Everything else is "standard."

/**
 * SIC code ranges → industry type.
 *
 * Bank:      SIC 6020-6036 (commercial banks, savings institutions)
 * Insurance: SIC 6311-6399 (insurance carriers — life, health, P&C, diversified)
 * REIT:      SIC 6512, 6798 (real estate investment trusts)
 * Standard:  everything else (including credit services, capital markets, brokers)
 */
const SIC_INDUSTRY_TYPE = {
  // ── Banks ──
  '6020': 'bank',   // State commercial banks - Federal Reserve members
  '6021': 'bank',   // National commercial banks
  '6022': 'bank',   // State commercial banks - non-Fed members
  '6035': 'bank',   // Savings institution, federally chartered
  '6036': 'bank',   // Savings institution, not federally chartered

  // ── Insurance ──
  '6311': 'insurance',  // Life insurance
  '6321': 'insurance',  // Accident and health insurance
  '6324': 'insurance',  // Hospital and medical service plans
  '6331': 'insurance',  // Fire, marine, and casualty insurance
  '6399': 'insurance',  // Insurance carriers, NEC

  // ── REITs ──
  '6512': 'reit',   // Operators of apartment buildings (REIT-structured)
  '6798': 'reit',   // Real estate investment trusts
};

/**
 * 2-digit SIC major group fallback for broader classification.
 * Only used when exact 4-digit code is not in SIC_INDUSTRY_TYPE.
 */
const SIC_MAJOR_GROUP_TYPE = {
  // No major group fallbacks — we want precision.
  // Banks (60xx) include credit unions and non-bank lenders that don't
  // report like banks. Insurance (63xx) includes reinsurance that
  // reports differently. Better to miss a few than misclassify.
};

/**
 * Classify a company's industry type from its SIC code.
 *
 * @param {string|number} sicCode - 4-digit SIC code
 * @returns {'bank'|'reit'|'insurance'|'standard'} Industry type for overlay selection
 */
export function classifyIndustryType(sicCode) {
  if (!sicCode) return 'standard';

  const code = String(sicCode).padStart(4, '0');

  // Exact 4-digit match
  const exact = SIC_INDUSTRY_TYPE[code];
  if (exact) return exact;

  // 2-digit major group fallback (currently empty — precision over recall)
  const majorGroup = code.slice(0, 2);
  const mg = SIC_MAJOR_GROUP_TYPE[majorGroup];
  if (mg) return mg;

  return 'standard';
}

/**
 * Get a human-readable label for the industry type.
 */
export function industryTypeLabel(type) {
  const labels = {
    bank: 'Bank / Savings Institution',
    reit: 'Real Estate Investment Trust (REIT)',
    insurance: 'Insurance Carrier',
    standard: 'Standard',
  };
  return labels[type] || 'Standard';
}

export { SIC_INDUSTRY_TYPE };
