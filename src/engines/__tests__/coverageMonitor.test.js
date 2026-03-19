// Tests for Phase 6: Coverage Monitor
//
// Tests:
// 1. Baseline storage — save, load, clear coverage baselines in localStorage
// 2. Coverage comparison — detect gained fields, lost fields, tag changes, tier deltas
// 3. Edge cases — null baseline, empty fields, no changes

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── Mock localStorage (not available in Node.js vitest) ────────
const store = {};
const mockLocalStorage = {
  getItem: vi.fn((key) => store[key] ?? null),
  setItem: vi.fn((key, value) => { store[key] = String(value); }),
  removeItem: vi.fn((key) => { delete store[key]; }),
  get length() { return Object.keys(store).length; },
  key: vi.fn((i) => Object.keys(store)[i] ?? null),
  clear: vi.fn(() => { for (const k of Object.keys(store)) delete store[k]; }),
};
globalThis.localStorage = mockLocalStorage;

import {
  saveCoverageBaseline,
  loadCoverageBaseline,
  clearCoverageBaseline,
  compareCoverage,
  FIELD_TIERS,
  FIELD_LABELS,
} from '../tickerAudit';

beforeEach(() => {
  // Clear mock store
  for (const k of Object.keys(store)) delete store[k];
  vi.clearAllMocks();
});

// ─── Test Fixtures ──────────────────────────────────────────────

const makeFieldDetails = (fields) =>
  fields.map(f => ({
    field: f.field,
    label: FIELD_LABELS[f.field] || f.field.replace(/_/g, ' '),
    section: f.section || 'Income',
    tier: f.tier ?? (FIELD_TIERS[f.field] || 0),
    tag: f.tag || null,
    layer: f.layer ?? 1,
    derived: f.derived ?? false,
  }));

const BASE_FIELDS = makeFieldDetails([
  { field: 'revenues', tag: 'RevenueFromContractWithCustomerExcludingAssessedTax', layer: 1, tier: 1 },
  { field: 'net_income_loss', tag: 'NetIncomeLoss', layer: 1, tier: 1 },
  { field: 'cost_of_revenue', tag: 'CostOfGoodsAndServicesSold', layer: 1, tier: 2 },
  { field: 'gross_profit', derived: true, tier: 2 },
  { field: 'interest_income', tag: 'InvestmentIncomeInterest', layer: 1, tier: 3, section: 'Income' },
]);

// ─── Baseline Storage ───────────────────────────────────────────

describe('Phase 6: Coverage Monitor — Baseline Storage', () => {
  it('should save and load a baseline', () => {
    saveCoverageBaseline('AAPL', BASE_FIELDS, 'standard', 2024);
    const loaded = loadCoverageBaseline('AAPL');

    expect(loaded).not.toBeNull();
    expect(loaded.ticker).toBe('AAPL');
    expect(loaded.industryType).toBe('standard');
    expect(loaded.latestYear).toBe(2024);
    expect(loaded.savedAt).toBeTruthy();
    expect(Object.keys(loaded.fields)).toHaveLength(5);
    expect(loaded.fields.revenues.tag).toBe('RevenueFromContractWithCustomerExcludingAssessedTax');
    expect(loaded.fields.revenues.layer).toBe(1);
    expect(loaded.fields.revenues.tier).toBe(1);
    expect(loaded.fields.gross_profit.derived).toBe(true);
  });

  it('should normalize ticker to uppercase', () => {
    saveCoverageBaseline('aapl', BASE_FIELDS, 'standard', 2024);
    expect(loadCoverageBaseline('AAPL')).not.toBeNull();
    expect(loadCoverageBaseline('aapl')).not.toBeNull();
  });

  it('should return null for non-existent baseline', () => {
    expect(loadCoverageBaseline('NONEXISTENT')).toBeNull();
  });

  it('should overwrite existing baseline', () => {
    saveCoverageBaseline('AAPL', BASE_FIELDS, 'standard', 2024);
    const newFields = makeFieldDetails([
      { field: 'revenues', tag: 'Revenues', layer: 1, tier: 1 },
    ]);
    saveCoverageBaseline('AAPL', newFields, 'standard', 2025);

    const loaded = loadCoverageBaseline('AAPL');
    expect(loaded.latestYear).toBe(2025);
    expect(Object.keys(loaded.fields)).toHaveLength(1);
    expect(loaded.fields.revenues.tag).toBe('Revenues');
  });

  it('should clear a baseline', () => {
    saveCoverageBaseline('AAPL', BASE_FIELDS, 'standard', 2024);
    expect(loadCoverageBaseline('AAPL')).not.toBeNull();

    clearCoverageBaseline('AAPL');
    expect(loadCoverageBaseline('AAPL')).toBeNull();
  });

  it('should not affect other tickers when clearing', () => {
    saveCoverageBaseline('AAPL', BASE_FIELDS, 'standard', 2024);
    saveCoverageBaseline('MSFT', BASE_FIELDS, 'standard', 2024);

    clearCoverageBaseline('AAPL');
    expect(loadCoverageBaseline('AAPL')).toBeNull();
    expect(loadCoverageBaseline('MSFT')).not.toBeNull();
  });
});

// ─── Coverage Comparison ────────────────────────────────────────

describe('Phase 6: Coverage Monitor — Comparison', () => {
  it('should return null if no baseline', () => {
    expect(compareCoverage(BASE_FIELDS, null)).toBeNull();
    expect(compareCoverage(BASE_FIELDS, { fields: null })).toBeNull();
  });

  it('should detect no changes when current matches baseline', () => {
    saveCoverageBaseline('AAPL', BASE_FIELDS, 'standard', 2024);
    const baseline = loadCoverageBaseline('AAPL');
    const delta = compareCoverage(BASE_FIELDS, baseline);

    expect(delta).not.toBeNull();
    expect(delta.hasChanges).toBe(false);
    expect(delta.fieldsGained).toHaveLength(0);
    expect(delta.fieldsLost).toHaveLength(0);
    expect(delta.tagsChanged).toHaveLength(0);
    expect(delta.tierDeltas[1]).toBe(0);
    expect(delta.tierDeltas[2]).toBe(0);
    expect(delta.tierDeltas[3]).toBe(0);
  });

  it('should detect gained fields', () => {
    // Baseline has 5 fields
    saveCoverageBaseline('AAPL', BASE_FIELDS, 'standard', 2024);
    const baseline = loadCoverageBaseline('AAPL');

    // Current has 6 fields (added operating_income_loss)
    const currentFields = [
      ...BASE_FIELDS,
      ...makeFieldDetails([{ field: 'operating_income_loss', tag: 'OperatingIncomeLoss', layer: 1, tier: 1 }]),
    ];

    const delta = compareCoverage(currentFields, baseline);
    expect(delta.hasChanges).toBe(true);
    expect(delta.fieldsGained).toHaveLength(1);
    expect(delta.fieldsGained[0].field).toBe('operating_income_loss');
    expect(delta.fieldsGained[0].tier).toBe(1);
    expect(delta.fieldsLost).toHaveLength(0);
    expect(delta.tierDeltas[1]).toBe(1); // +1 Tier 1 field
  });

  it('should detect lost fields', () => {
    saveCoverageBaseline('AAPL', BASE_FIELDS, 'standard', 2024);
    const baseline = loadCoverageBaseline('AAPL');

    // Current has 4 fields (removed interest_income)
    const currentFields = BASE_FIELDS.filter(d => d.field !== 'interest_income');

    const delta = compareCoverage(currentFields, baseline);
    expect(delta.hasChanges).toBe(true);
    expect(delta.fieldsLost).toHaveLength(1);
    expect(delta.fieldsLost[0].field).toBe('interest_income');
    expect(delta.fieldsLost[0].tier).toBe(3);
    expect(delta.fieldsGained).toHaveLength(0);
    expect(delta.tierDeltas[3]).toBe(-1); // -1 Tier 3 field
  });

  it('should detect tag changes', () => {
    saveCoverageBaseline('AAPL', BASE_FIELDS, 'standard', 2024);
    const baseline = loadCoverageBaseline('AAPL');

    // Current has same fields but revenues tag changed
    const currentFields = BASE_FIELDS.map(d =>
      d.field === 'revenues'
        ? { ...d, tag: 'Revenues', layer: 2 }
        : d
    );

    const delta = compareCoverage(currentFields, baseline);
    expect(delta.hasChanges).toBe(true);
    expect(delta.tagsChanged).toHaveLength(1);
    expect(delta.tagsChanged[0].field).toBe('revenues');
    expect(delta.tagsChanged[0].oldTag).toBe('RevenueFromContractWithCustomerExcludingAssessedTax');
    expect(delta.tagsChanged[0].newTag).toBe('Revenues');
    expect(delta.tagsChanged[0].oldLayer).toBe(1);
    expect(delta.tagsChanged[0].newLayer).toBe(2);
    // No gain/loss — same field count
    expect(delta.fieldsGained).toHaveLength(0);
    expect(delta.fieldsLost).toHaveLength(0);
    expect(delta.tierDeltas[1]).toBe(0);
  });

  it('should detect derived→direct changes', () => {
    saveCoverageBaseline('AAPL', BASE_FIELDS, 'standard', 2024);
    const baseline = loadCoverageBaseline('AAPL');

    // gross_profit was derived, now it's direct
    const currentFields = BASE_FIELDS.map(d =>
      d.field === 'gross_profit'
        ? { ...d, derived: false, tag: 'GrossProfit', layer: 1 }
        : d
    );

    const delta = compareCoverage(currentFields, baseline);
    expect(delta.hasChanges).toBe(true);
    expect(delta.tagsChanged).toHaveLength(1);
    expect(delta.tagsChanged[0].field).toBe('gross_profit');
    expect(delta.tagsChanged[0].oldDerived).toBe(true);
    expect(delta.tagsChanged[0].newDerived).toBe(false);
  });

  it('should handle simultaneous gains, losses, and changes', () => {
    saveCoverageBaseline('AAPL', BASE_FIELDS, 'standard', 2024);
    const baseline = loadCoverageBaseline('AAPL');

    // Remove interest_income (loss), add operating_income_loss (gain), change revenues tag (change)
    const currentFields = makeFieldDetails([
      { field: 'revenues', tag: 'Revenues', layer: 2, tier: 1 }, // changed tag+layer
      { field: 'net_income_loss', tag: 'NetIncomeLoss', layer: 1, tier: 1 },
      { field: 'cost_of_revenue', tag: 'CostOfGoodsAndServicesSold', layer: 1, tier: 2 },
      { field: 'gross_profit', derived: true, tier: 2 },
      // interest_income removed (lost)
      { field: 'operating_income_loss', tag: 'OperatingIncomeLoss', layer: 1, tier: 1 }, // gained
    ]);

    const delta = compareCoverage(currentFields, baseline);
    expect(delta.hasChanges).toBe(true);
    expect(delta.fieldsGained).toHaveLength(1);
    expect(delta.fieldsGained[0].field).toBe('operating_income_loss');
    expect(delta.fieldsLost).toHaveLength(1);
    expect(delta.fieldsLost[0].field).toBe('interest_income');
    expect(delta.tagsChanged).toHaveLength(1);
    expect(delta.tagsChanged[0].field).toBe('revenues');
    expect(delta.tierDeltas[1]).toBe(1);  // +1 (gained operating_income_loss)
    expect(delta.tierDeltas[3]).toBe(-1); // -1 (lost interest_income)
  });

  it('should include baselineSavedAt in delta', () => {
    saveCoverageBaseline('AAPL', BASE_FIELDS, 'standard', 2024);
    const baseline = loadCoverageBaseline('AAPL');
    const delta = compareCoverage(BASE_FIELDS, baseline);

    expect(delta.baselineSavedAt).toBeTruthy();
    expect(new Date(delta.baselineSavedAt).getTime()).toBeGreaterThan(0);
  });

  it('should handle empty current fields', () => {
    saveCoverageBaseline('AAPL', BASE_FIELDS, 'standard', 2024);
    const baseline = loadCoverageBaseline('AAPL');
    const delta = compareCoverage([], baseline);

    expect(delta.hasChanges).toBe(true);
    expect(delta.fieldsLost).toHaveLength(5); // all fields lost
    expect(delta.fieldsGained).toHaveLength(0);
  });

  it('should handle empty baseline fields', () => {
    const emptyBaseline = { ticker: 'AAPL', savedAt: new Date().toISOString(), latestYear: 2024, industryType: 'standard', fields: {} };
    const delta = compareCoverage(BASE_FIELDS, emptyBaseline);

    expect(delta.hasChanges).toBe(true);
    expect(delta.fieldsGained).toHaveLength(5); // all fields gained
    expect(delta.fieldsLost).toHaveLength(0);
  });
});

// ─── FIELD_TIERS and FIELD_LABELS sanity ────────────────────────

describe('Phase 6: Coverage Monitor — Constants', () => {
  it('FIELD_TIERS should have all 3 tiers', () => {
    const tiers = new Set(Object.values(FIELD_TIERS));
    expect(tiers.has(1)).toBe(true);
    expect(tiers.has(2)).toBe(true);
    expect(tiers.has(3)).toBe(true);
  });

  it('FIELD_LABELS should cover all FIELD_TIERS entries', () => {
    for (const field of Object.keys(FIELD_TIERS)) {
      expect(FIELD_LABELS[field]).toBeTruthy();
    }
  });

  it('Tier 1 should have the critical scoring fields', () => {
    const criticalFields = ['revenues', 'net_income_loss', 'equity', 'assets', 'capital_expenditures'];
    for (const field of criticalFields) {
      expect(FIELD_TIERS[field]).toBe(1);
    }
  });
});
