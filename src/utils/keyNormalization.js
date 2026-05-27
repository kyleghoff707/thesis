// Single source of truth for AI-key-variant → canonical-key migration.
// Used by both PitchDeck and FinalThesis renderers.
//
// Two classes of entries live here:
//
//   1. AI-variant aliases — the model occasionally emits a section under a
//      different name (e.g. `simple_and_predictable` instead of
//      `simple_predictable`). These forward to the canonical section key.
//
//   2. Legacy redesign migrations — the 2026-05-09 Pitch Deck and Final
//      Thesis redesigns renamed several canonical sections. Old archived
//      reports still use the pre-redesign keys; we map them forward so
//      they continue to render under the new section structure.
//
// Collision notes:
// - Both Pitch Deck and Final Thesis have a `moat_analysis` section.
//   That's intentional — the renderer disambiguates by stage (top-level
//   grouping is per-stage), not by key.
// - The bare keys `management` and `valuation` are ambiguous: PD's redesign
//   maps `management` → `management_capital_allocation`, while FT historically
//   aliased `management` → `management_analysis`. The redesign migration
//   wins (more specific, post-2026-05-09 rename); FT's bare-key aliases are
//   dropped but its specific aliases (managementChecklist, etc.) survive.
//   Same logic for `valuation_summary`.

export const KEY_NORMALIZATION = {
  // ===== Pitch Deck redesign (2026-05-09) =====
  // Old canonical → new canonical
  radar: 'setup',
  simple_predictable: 'business_quality',
  barriers_moats: 'moat_analysis',
  fcf: 'cash_generation',
  roe_roic_debt: 'returns_leverage',
  management: 'management_capital_allocation',
  pest: 'risk_profile',
  pest_risks: 'risk_profile',
  overall_verdict: 'investment_verdict',

  // ===== Final Thesis redesign (2026-05-09) =====
  // Old canonical → new canonical
  meaning_checklist: 'business_analysis',
  moat_checklist: 'moat_analysis',
  management_checklist: 'management_analysis',
  valuation_confirmation: 'valuation_analysis',
  inversion_rebuttal: 'debate',

  // ===== Pitch Deck AI-variant aliases (preserved from legacy renderer) =====
  radar_section: 'radar',
  initial_awareness: 'radar',
  event_context: 'radar',
  simple_and_predictable: 'simple_predictable',
  simple_predictability: 'simple_predictable',
  business_model: 'simple_predictable',
  market_position_analysis: 'market_position',
  competitive_position: 'market_position',
  dominant_market_position: 'market_position',
  barriers_and_moats: 'barriers_moats',
  moats: 'barriers_moats',
  barriers_to_entry: 'barriers_moats',
  barriers: 'barriers_moats',
  fcf_analysis: 'fcf',
  free_cash_flow: 'fcf',
  owner_earnings: 'fcf',
  fcf_owner_earnings: 'fcf',
  management_talent: 'management',
  management_integrity: 'management',
  // NOTE: the legacy pitch deck renderer aliased `management_analysis` → `management`,
  // but `management_analysis` is now the FT canonical key. Dropped to avoid mis-
  // routing FT sections.
  roe_roic_roa_debt: 'roe_roic_debt',
  roe_roic: 'roe_roic_debt',
  capital_structure: 'roe_roic_debt',
  return_metrics: 'roe_roic_debt',
  balance_sheet_analysis: 'balance_sheet',
  balance_sheet_deep_dive: 'balance_sheet',
  pest_analysis: 'pest',
  pest_risk_analysis: 'pest',
  risk_analysis: 'pest',
  valuation_summary: 'valuation',
  valuation_section: 'valuation',

  // ===== Final Thesis AI-variant aliases (preserved from legacy renderer) =====
  // Section 1: Event Analysis
  event: 'event_analysis',
  eventAnalysis: 'event_analysis',
  'event-analysis': 'event_analysis',
  event_analysis_section: 'event_analysis',

  // Section 2: Business Analysis
  meaning: 'business_analysis',
  meaningChecklist: 'business_analysis',
  'meaning-checklist': 'business_analysis',
  meaning_check: 'business_analysis',
  meaning_analysis: 'business_analysis',
  business: 'business_analysis',
  businessAnalysis: 'business_analysis',
  'business-analysis': 'business_analysis',

  // Section 3: Moat Analysis
  moat: 'moat_analysis',
  moatChecklist: 'moat_analysis',
  'moat-checklist': 'moat_analysis',
  moat_check: 'moat_analysis',
  moatAnalysis: 'moat_analysis',
  'moat-analysis': 'moat_analysis',

  // Section 4: Management Analysis
  // (bare-key `management` conflict resolved above in favor of PD redesign)
  managementChecklist: 'management_analysis',
  'management-checklist': 'management_analysis',
  management_check: 'management_analysis',
  management_evaluation: 'management_analysis',
  managementAnalysis: 'management_analysis',
  'management-analysis': 'management_analysis',

  // Section 5: Valuation Analysis
  // (bare-key `valuation` and `valuation_summary` conflicts resolved above
  // in favor of PD's pre-redesign canonical mapping)
  valuationConfirmation: 'valuation_analysis',
  'valuation-confirmation': 'valuation_analysis',
  valuation_confirm: 'valuation_analysis',
  valuationAnalysis: 'valuation_analysis',
  'valuation-analysis': 'valuation_analysis',

  // Section 6: The Debate
  inversion: 'debate',
  rebuttal: 'debate',
  inversionRebuttal: 'debate',
  'inversion-rebuttal': 'debate',
  inversion_and_rebuttal: 'debate',
  the_debate: 'debate',
  theDebate: 'debate',
  'the-debate': 'debate',

  // Section 7: Trade Plan
  tradePlan: 'trade_plan',
  'trade-plan': 'trade_plan',
};

export function normalizeKey(key) {
  return KEY_NORMALIZATION[key] || key;
}
