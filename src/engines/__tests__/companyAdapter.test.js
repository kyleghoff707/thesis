// Tests for Layer 3: Company Adapter — orphan tag discovery, classification, gap-fill

import { describe, it, expect, vi } from 'vitest';

// Mock config to avoid env var dependency
vi.mock('../config', () => ({ CLAUDE_KEY: '' }));

// Mock the pre-built classifications JSON
vi.mock('../../data/sp500-tag-classifications.json', () => ({
  default: {
    meta: { version: 1 },
    classifications: {
      // Simulated pre-classified tags
      'NotesPayableCurrent': {
        field: 'current_portion_lt_debt',
        section: 'balance',
        unit: 'USD',
        confidence: 0.9,
        negate: false,
      },
      'RevenueFromRelatedParties': {
        field: null,
        section: null,
        unit: null,
        confidence: 0.8,
        negate: false,
      },
      'DepreciationNonproduction': {
        field: 'depreciation_amortization',
        section: 'cashFlow',
        unit: 'USD',
        confidence: 0.85,
        negate: false,
      },
      'ConvertibleDebtNoncurrent': {
        field: 'long_term_debt',
        section: 'balance',
        unit: 'USD',
        confidence: 0.95,
        negate: false,
      },
      'SalesRevenueServicesNet': {
        field: 'revenues',
        section: 'income',
        unit: 'USD',
        confidence: 0.92,
        negate: false,
      },
      'CommonStockSharesAuthorized': {
        field: null,
        section: null,
        unit: null,
        confidence: 0.9,
        negate: false,
      },
      // A shares-type tag
      'PreferredStockSharesOutstanding': {
        field: null,
        section: null,
        unit: null,
        confidence: 0.9,
        negate: false,
      },
    },
  },
}));

const {
  collectKnownTags,
  findOrphanTags,
  getPreClassified,
  getPreClassifiedCount,
  getLayer3Suggestions,
} = await import('../companyAdapter');

// ─── Test Fixtures ──────────────────────────────────────────

const mockTaxonomy = [
  { field: 'revenues', unit: 'USD', tags: ['Revenues', 'SalesRevenueNet'] },
  { field: 'net_income_loss', unit: 'USD', tags: ['NetIncomeLoss', 'ProfitLoss'] },
  { field: 'shares_outstanding', unit: 'shares', tags: ['CommonStockSharesOutstanding'] },
];

function makeCompanyFacts(tags) {
  const usGaap = {};
  for (const [tag, config] of Object.entries(tags)) {
    usGaap[tag] = {
      units: {
        [config.unit || 'USD']: config.entries || [
          { form: '10-K', fp: 'FY', fy: 2024, val: config.value || 1000000, end: '2024-12-31', filed: '2025-02-15' },
          { form: '10-K', fp: 'FY', fy: 2023, val: config.value || 900000, end: '2023-12-31', filed: '2024-02-15' },
        ],
      },
    };
  }
  return { facts: { 'us-gaap': usGaap } };
}

// ─── collectKnownTags ───────────────────────────────────────

describe('collectKnownTags', () => {
  it('should collect all unique tags from taxonomy arrays', () => {
    const tax1 = [
      { field: 'a', tags: ['TagA', 'TagB'] },
      { field: 'b', tags: ['TagC'] },
    ];
    const tax2 = [
      { field: 'c', tags: ['TagB', 'TagD'] },
    ];
    const known = collectKnownTags(tax1, tax2);
    expect(known.size).toBe(4);
    expect(known.has('TagA')).toBe(true);
    expect(known.has('TagB')).toBe(true);
    expect(known.has('TagC')).toBe(true);
    expect(known.has('TagD')).toBe(true);
  });

  it('should handle null/undefined arrays gracefully', () => {
    const known = collectKnownTags(null, undefined, [{ field: 'a', tags: ['Tag1'] }]);
    expect(known.size).toBe(1);
    expect(known.has('Tag1')).toBe(true);
  });

  it('should return empty set for empty inputs', () => {
    const known = collectKnownTags();
    expect(known.size).toBe(0);
  });
});

// ─── findOrphanTags ─────────────────────────────────────────

describe('findOrphanTags', () => {
  it('should find tags not in known set', () => {
    const known = new Set(['Revenues', 'NetIncomeLoss']);
    const facts = makeCompanyFacts({
      Revenues: { value: 1000000 },
      NetIncomeLoss: { value: 500000 },
      NotesPayableCurrent: { value: 200000 },
      SomeObscureTag: { value: 100000 },
    });

    const orphans = findOrphanTags(facts, known);
    expect(Object.keys(orphans)).toContain('NotesPayableCurrent');
    expect(Object.keys(orphans)).toContain('SomeObscureTag');
    expect(Object.keys(orphans)).not.toContain('Revenues');
    expect(Object.keys(orphans)).not.toContain('NetIncomeLoss');
  });

  it('should only include tags with 10-K entries', () => {
    const known = new Set();
    const facts = {
      facts: {
        'us-gaap': {
          AnnualTag: {
            units: {
              USD: [{ form: '10-K', fp: 'FY', fy: 2024, val: 100, end: '2024-12-31', filed: '2025-02-15' }],
            },
          },
          QuarterlyOnlyTag: {
            units: {
              USD: [{ form: '10-Q', fp: 'Q1', fy: 2024, val: 50, end: '2024-03-31', filed: '2024-05-15' }],
            },
          },
        },
      },
    };

    const orphans = findOrphanTags(facts, known);
    expect(Object.keys(orphans)).toContain('AnnualTag');
    expect(Object.keys(orphans)).not.toContain('QuarterlyOnlyTag');
  });

  it('should only include tags with financial units (USD, USD/shares, shares)', () => {
    const known = new Set();
    const facts = {
      facts: {
        'us-gaap': {
          USDTag: {
            units: { USD: [{ form: '10-K', fp: 'FY', fy: 2024, val: 100, end: '2024-12-31', filed: '2025-02-15' }] },
          },
          PureTag: {
            units: { pure: [{ form: '10-K', fp: 'FY', fy: 2024, val: 0.05, end: '2024-12-31', filed: '2025-02-15' }] },
          },
          SharesTag: {
            units: { shares: [{ form: '10-K', fp: 'FY', fy: 2024, val: 1000, end: '2024-12-31', filed: '2025-02-15' }] },
          },
        },
      },
    };

    const orphans = findOrphanTags(facts, known);
    expect(Object.keys(orphans)).toContain('USDTag');
    expect(Object.keys(orphans)).toContain('SharesTag');
    expect(Object.keys(orphans)).not.toContain('PureTag');
  });

  it('should return empty for null/missing facts', () => {
    expect(findOrphanTags(null, new Set())).toEqual({});
    expect(findOrphanTags({}, new Set())).toEqual({});
    expect(findOrphanTags({ facts: {} }, new Set())).toEqual({});
  });

  it('should track units per orphan tag', () => {
    const known = new Set();
    const facts = {
      facts: {
        'us-gaap': {
          MultiUnitTag: {
            units: {
              USD: [{ form: '10-K', fp: 'FY', fy: 2024, val: 100, end: '2024-12-31', filed: '2025-02-15' }],
              shares: [{ form: '10-K', fp: 'FY', fy: 2024, val: 50, end: '2024-12-31', filed: '2025-02-15' }],
            },
          },
        },
      },
    };

    const orphans = findOrphanTags(facts, known);
    expect(orphans.MultiUnitTag.units).toContain('USD');
    expect(orphans.MultiUnitTag.units).toContain('shares');
  });
});

// ─── getPreClassified ───────────────────────────────────────

describe('getPreClassified', () => {
  it('should return classification for known tags', () => {
    const cls = getPreClassified('NotesPayableCurrent');
    expect(cls).not.toBeNull();
    expect(cls.field).toBe('current_portion_lt_debt');
    expect(cls.section).toBe('balance');
    expect(cls.unit).toBe('USD');
    expect(cls.confidence).toBe(0.9);
  });

  it('should return null for unknown tags', () => {
    expect(getPreClassified('TotallyUnknownTag')).toBeNull();
  });

  it('should return null-field classification for non-mapping tags', () => {
    const cls = getPreClassified('RevenueFromRelatedParties');
    expect(cls).not.toBeNull();
    expect(cls.field).toBeNull();
  });
});

describe('getPreClassifiedCount', () => {
  it('should return the number of pre-classified tags', () => {
    const count = getPreClassifiedCount();
    expect(count).toBe(7); // matches our mock
  });
});

// ─── getLayer3Suggestions ───────────────────────────────────

describe('getLayer3Suggestions', () => {
  it('should suggest tags for missing fields from pre-built cache', () => {
    const known = new Set(['Revenues', 'NetIncomeLoss']);
    const facts = makeCompanyFacts({
      Revenues: { value: 1000000 },
      NetIncomeLoss: { value: 500000 },
      NotesPayableCurrent: { value: 200000 },
    });

    const missingFields = [
      { field: 'current_portion_lt_debt', section: 'balance', unit: 'USD', splitSensitive: false },
    ];

    const suggestions = getLayer3Suggestions(facts, missingFields, known);
    expect(suggestions.length).toBe(1);
    expect(suggestions[0].field).toBe('current_portion_lt_debt');
    expect(suggestions[0].tag).toBe('NotesPayableCurrent');
    expect(suggestions[0].confidence).toBe(0.9);
    expect(suggestions[0].section).toBe('balance');
  });

  it('should not suggest tags for fields that are already resolved', () => {
    const known = new Set(['Revenues']);
    const facts = makeCompanyFacts({
      Revenues: { value: 1000000 },
      SalesRevenueServicesNet: { value: 900000 },
    });

    // revenues is NOT in missing fields → no suggestion
    const missingFields = [
      { field: 'cost_of_revenue', section: 'income', unit: 'USD', splitSensitive: false },
    ];

    const suggestions = getLayer3Suggestions(facts, missingFields, known);
    // SalesRevenueServicesNet maps to revenues, but revenues isn't missing
    expect(suggestions.length).toBe(0);
  });

  it('should not suggest tags classified as null field', () => {
    const known = new Set();
    const facts = makeCompanyFacts({
      RevenueFromRelatedParties: { value: 50000 },
      CommonStockSharesAuthorized: { value: 10000, unit: 'shares' },
    });

    const missingFields = [
      { field: 'revenues', section: 'income', unit: 'USD', splitSensitive: false },
    ];

    const suggestions = getLayer3Suggestions(facts, missingFields, known);
    expect(suggestions.length).toBe(0);
  });

  it('should verify unit compatibility', () => {
    const known = new Set();
    const facts = makeCompanyFacts({
      ConvertibleDebtNoncurrent: { value: 500000 },
    });

    // long_term_debt is classified as USD in our mock
    // but if we pass it as shares unit in missing field, it shouldn't match
    const missingFields = [
      { field: 'long_term_debt', section: 'balance', unit: 'shares', splitSensitive: false },
    ];

    const suggestions = getLayer3Suggestions(facts, missingFields, known);
    expect(suggestions.length).toBe(0);
  });

  it('should keep only highest-confidence suggestion per field', () => {
    const known = new Set();
    const facts = makeCompanyFacts({
      ConvertibleDebtNoncurrent: { value: 500000 },
      NotesPayableCurrent: { value: 200000 },
    });

    const missingFields = [
      { field: 'long_term_debt', section: 'balance', unit: 'USD', splitSensitive: false },
      { field: 'current_portion_lt_debt', section: 'balance', unit: 'USD', splitSensitive: false },
    ];

    const suggestions = getLayer3Suggestions(facts, missingFields, known);
    // Should have one per field
    const fields = suggestions.map(s => s.field);
    expect(new Set(fields).size).toBe(fields.length);
  });

  it('should return empty for no missing fields', () => {
    const known = new Set();
    const facts = makeCompanyFacts({ SomeTag: { value: 100 } });
    const suggestions = getLayer3Suggestions(facts, [], known);
    expect(suggestions).toEqual([]);
  });

  it('should return empty when no orphan tags exist', () => {
    const known = new Set(['TagA', 'TagB']);
    const facts = makeCompanyFacts({
      TagA: { value: 100 },
      TagB: { value: 200 },
    });

    const missingFields = [
      { field: 'revenues', section: 'income', unit: 'USD', splitSensitive: false },
    ];

    const suggestions = getLayer3Suggestions(facts, missingFields, known);
    expect(suggestions).toEqual([]);
  });

  it('should sort suggestions by confidence descending', () => {
    const known = new Set();
    const facts = makeCompanyFacts({
      ConvertibleDebtNoncurrent: { value: 500000 }, // confidence 0.95
      DepreciationNonproduction: { value: 100000 }, // confidence 0.85
    });

    const missingFields = [
      { field: 'long_term_debt', section: 'balance', unit: 'USD', splitSensitive: false },
      { field: 'depreciation_amortization', section: 'cashFlow', unit: 'USD', splitSensitive: false },
    ];

    const suggestions = getLayer3Suggestions(facts, missingFields, known);
    expect(suggestions.length).toBe(2);
    expect(suggestions[0].confidence).toBeGreaterThanOrEqual(suggestions[1].confidence);
  });

  it('should carry splitSensitive from field definition', () => {
    const known = new Set();
    const facts = makeCompanyFacts({
      SalesRevenueServicesNet: { value: 1000000 },
    });

    const missingFields = [
      { field: 'revenues', section: 'income', unit: 'USD', splitSensitive: true },
    ];

    const suggestions = getLayer3Suggestions(facts, missingFields, known);
    expect(suggestions.length).toBe(1);
    expect(suggestions[0].splitSensitive).toBe(true);
  });
});

// ─── Integration: Layer 3 provenance shape ──────────────────

describe('Layer 3 provenance metadata', () => {
  it('should mark suggestions with layer: 3 (verified by shape)', () => {
    const known = new Set();
    const facts = makeCompanyFacts({
      NotesPayableCurrent: { value: 200000 },
    });

    const missingFields = [
      { field: 'current_portion_lt_debt', section: 'balance', unit: 'USD', splitSensitive: false },
    ];

    const suggestions = getLayer3Suggestions(facts, missingFields, known);
    expect(suggestions.length).toBe(1);

    // Verify the suggestion has all fields needed for provenance
    const s = suggestions[0];
    expect(s).toHaveProperty('field');
    expect(s).toHaveProperty('tag');
    expect(s).toHaveProperty('confidence');
    expect(s).toHaveProperty('negate');
    expect(s).toHaveProperty('section');
    expect(s).toHaveProperty('unit');
    // The caller (edgarFinancials.js) will create provenance with layer: 3
    // We just verify the suggestion provides all needed data
  });
});

// ─── Edge Cases ─────────────────────────────────────────────

describe('Edge cases', () => {
  it('should handle companyfacts with no us-gaap namespace', () => {
    const facts = { facts: { dei: { EntityCommonStockSharesOutstanding: {} } } };
    const orphans = findOrphanTags(facts, new Set());
    expect(orphans).toEqual({});
  });

  it('should handle tags with empty units object', () => {
    const facts = { facts: { 'us-gaap': { EmptyTag: { units: {} } } } };
    const orphans = findOrphanTags(facts, new Set());
    expect(orphans).toEqual({});
  });
});
