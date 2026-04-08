/**
 * field-alias-map.mjs — Bridges naming gaps between triangulation canonical
 * field names and the XBRL engine's internal field names.
 *
 * The triangulation pipeline's data collectors (FMP, SimFin, mstarpy) normalize
 * to canonical names like `stockholders_equity`, `total_assets`, etc. The XBRL
 * engine uses shorter internal names like `equity`, `assets`, etc.
 *
 * Without this alias map, the triangulator sees ~2,255 false-positive "bugs"
 * because it compares by exact field name and never finds a match.
 *
 * Usage:
 *   import { resolveFieldName, FIELD_ALIASES } from './lib/field-alias-map.mjs';
 *   const engineField = resolveFieldName('stockholders_equity'); // => 'equity'
 */

/**
 * Maps source canonical field names to the XBRL engine's internal field names.
 *
 * Direction: canonical (source) -> engine (XBRL)
 * When the triangulation pipeline has a canonical name from FMP/SimFin/mstarpy,
 * use this map to find what the engine calls the same field.
 *
 * 17 aliases covering Category A naming mismatches from Phase 3 research.
 */
export const FIELD_ALIASES = {
  // Balance sheet
  stockholders_equity: 'equity',
  total_liabilities: 'liabilities',
  total_assets: 'assets',
  total_current_assets: 'current_assets',
  total_current_liabilities: 'current_liabilities',
  cash_and_equivalents: 'cash',
  inventories: 'inventory',

  // Income statement
  income_tax_expense: 'income_tax',
  pretax_income: 'income_before_tax',
  diluted_eps: 'diluted_earnings_per_share',
  basic_eps: 'basic_earnings_per_share',
  diluted_shares_outstanding: 'diluted_average_shares',
  basic_shares_outstanding: 'basic_average_shares',

  // Cash flow
  operating_cash_flow: 'net_cash_flow_from_operating_activities',
  investing_cash_flow: 'net_cash_flow_from_investing_activities',
  financing_cash_flow: 'net_cash_flow_from_financing_activities',

  // Financial sector
  provision_for_loan_losses: 'provision_for_credit_losses',
};

/**
 * Build reverse map: engine field name -> canonical field name.
 * Used when mapping engine-only fields back to canonical space for the field union.
 */
export const REVERSE_ALIASES = Object.fromEntries(
  Object.entries(FIELD_ALIASES).map(([canonical, engine]) => [engine, canonical])
);

/**
 * Resolve a canonical field name to the engine's internal field name.
 * Returns the engine name if an alias exists, otherwise returns the original.
 *
 * @param {string} canonical - The canonical field name from external sources
 * @returns {string} The engine's internal field name
 */
export function resolveFieldName(canonical) {
  return FIELD_ALIASES[canonical] || canonical;
}

/**
 * Resolve an engine field name back to its canonical name.
 * Returns the canonical name if a reverse alias exists, otherwise returns the original.
 *
 * @param {string} engineField - The engine's internal field name
 * @returns {string} The canonical field name
 */
export function resolveCanonicalName(engineField) {
  return REVERSE_ALIASES[engineField] || engineField;
}
