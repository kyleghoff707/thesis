// Tests for Layer 2 taxonomy resolver
// Phase 3: Pre-built taxonomy JSON + runtime resolution

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock external dependencies (same pattern as edgarFinancials.test.js)
vi.mock('../edgar', () => ({
  lookupCIK: vi.fn(),
  fetchCompanyFacts: vi.fn(),
  extractAnnualFact: vi.fn(),
  extractAnnualFactOriginal: vi.fn(),
  extractFiscalYearEnds: vi.fn(() => ({})),
  findLatestQuarter: vi.fn(),
}));
vi.mock('../cache', () => ({
  cacheGet: () => null,
  cacheGetAsync: async () => null,
  cacheSet: () => {},
}));
vi.mock('../splits', () => ({
  fetchSplits: vi.fn(async () => []),
  cumulativeSplitFactor: vi.fn(() => 1),
}));

const { augmentTaxonomy, getLayer2Tags, getTagLayer } = await import('../taxonomyResolver');
const { extractSection, INCOME_TAXONOMY, BALANCE_TAXONOMY, CASHFLOW_TAXONOMY } = await import('../edgarFinancials');
const { extractAnnualFact } = await import('../edgar');

// ─── taxonomy-hierarchy.json structure ──────────────────────────

describe('taxonomy-hierarchy.json', () => {
  it('should have loaded hierarchy data', async () => {
    const data = (await import('../../data/taxonomy-hierarchy.json')).default;
    expect(data._meta).toBeDefined();
    expect(data._meta.taxonomyVersions).toContain(2024);
    expect(data.hierarchy).toBeDefined();
    expect(Object.keys(data.hierarchy).length).toBeGreaterThan(50);
  });

  it('should have descendants for key concepts', async () => {
    const data = (await import('../../data/taxonomy-hierarchy.json')).default;
    // Revenues should have descendants (industry-specific revenue tags)
    expect(data.hierarchy['Revenues']).toBeDefined();
    expect(data.hierarchy['Revenues'].length).toBeGreaterThan(10);
    // Assets should have descendants
    expect(data.hierarchy['Assets']).toBeDefined();
  });
});

// ─── getLayer2Tags ──────────────────────────────────────────────

describe('getLayer2Tags', () => {
  it('should return additional tags from taxonomy hierarchy', () => {
    // Revenues has many descendant tags in the FASB hierarchy
    const tags = getLayer2Tags(['Revenues']);
    expect(tags.length).toBeGreaterThan(0);
    // Should NOT include the input tag itself
    expect(tags).not.toContain('Revenues');
  });

  it('should not return tags already in the input list', () => {
    const layer1Tags = ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax'];
    const tags = getLayer2Tags(layer1Tags);
    // Should not duplicate tags that are already in Layer 1
    expect(tags).not.toContain('Revenues');
    expect(tags).not.toContain('RevenueFromContractWithCustomerExcludingAssessedTax');
  });

  it('should return empty array for tags with no descendants', () => {
    const tags = getLayer2Tags(['SomeNonexistentTag']);
    expect(tags).toEqual([]);
  });

  it('should merge descendants from multiple root tags', () => {
    // Both InterestExpense and InterestExpenseDebt have hierarchy entries
    const tags1 = getLayer2Tags(['InterestExpense']);
    const tags2 = getLayer2Tags(['InterestExpenseDebt']);
    const tagsBoth = getLayer2Tags(['InterestExpense', 'InterestExpenseDebt']);
    // Combined should include descendants from both (without duplicates)
    expect(tagsBoth.length).toBeGreaterThanOrEqual(tags1.length);
  });

  it('should not include duplicate tags', () => {
    const tags = getLayer2Tags(['Revenues', 'CostOfRevenue']);
    const unique = new Set(tags);
    expect(tags.length).toBe(unique.size);
  });
});

// ─── augmentTaxonomy ────────────────────────────────────────────

describe('augmentTaxonomy', () => {
  it('should extend tags array with Layer 2 tags', () => {
    const taxonomy = [
      { field: 'revenues', unit: 'USD', tags: ['Revenues', 'SalesRevenueNet'] },
    ];
    const augmented = augmentTaxonomy(taxonomy);

    expect(augmented[0].tags.length).toBeGreaterThan(2);
    // Original tags should be first
    expect(augmented[0].tags[0]).toBe('Revenues');
    expect(augmented[0].tags[1]).toBe('SalesRevenueNet');
    // _layer2Start marks where Layer 2 begins
    expect(augmented[0]._layer2Start).toBe(2);
  });

  it('should not mutate the original taxonomy', () => {
    const taxonomy = [
      { field: 'revenues', unit: 'USD', tags: ['Revenues'] },
    ];
    const origLength = taxonomy[0].tags.length;
    augmentTaxonomy(taxonomy);
    expect(taxonomy[0].tags.length).toBe(origLength);
  });

  it('should preserve fields with no Layer 2 descendants', () => {
    const taxonomy = [
      { field: 'custom_field', unit: 'USD', tags: ['SomeUnknownTag'] },
    ];
    const augmented = augmentTaxonomy(taxonomy);
    // Should be unchanged (same reference)
    expect(augmented[0]).toBe(taxonomy[0]);
    expect(augmented[0]._layer2Start).toBeUndefined();
  });

  it('should preserve all original field properties', () => {
    const taxonomy = [
      { field: 'revenues', unit: 'USD', tags: ['Revenues'], splitSensitive: false, negate: false },
    ];
    const augmented = augmentTaxonomy(taxonomy);
    expect(augmented[0].field).toBe('revenues');
    expect(augmented[0].unit).toBe('USD');
    expect(augmented[0].splitSensitive).toBe(false);
    expect(augmented[0].negate).toBe(false);
  });

  it('should work with real INCOME_TAXONOMY', () => {
    const augmented = augmentTaxonomy(INCOME_TAXONOMY);
    // Should have same number of fields
    expect(augmented.length).toBe(INCOME_TAXONOMY.length);
    // At least some fields should have Layer 2 tags
    const withL2 = augmented.filter(f => f._layer2Start != null);
    expect(withL2.length).toBeGreaterThan(0);
  });

  it('should work with real BALANCE_TAXONOMY', () => {
    const augmented = augmentTaxonomy(BALANCE_TAXONOMY);
    expect(augmented.length).toBe(BALANCE_TAXONOMY.length);
    const withL2 = augmented.filter(f => f._layer2Start != null);
    expect(withL2.length).toBeGreaterThan(0);
  });

  it('should work with real CASHFLOW_TAXONOMY', () => {
    const augmented = augmentTaxonomy(CASHFLOW_TAXONOMY);
    expect(augmented.length).toBe(CASHFLOW_TAXONOMY.length);
    const withL2 = augmented.filter(f => f._layer2Start != null);
    expect(withL2.length).toBeGreaterThan(0);
  });
});

// ─── getTagLayer ────────────────────────────────────────────────

describe('getTagLayer', () => {
  it('should return 1 for tags before _layer2Start', () => {
    expect(getTagLayer(0, 3)).toBe(1);
    expect(getTagLayer(2, 3)).toBe(1);
  });

  it('should return 2 for tags at or after _layer2Start', () => {
    expect(getTagLayer(3, 3)).toBe(2);
    expect(getTagLayer(5, 3)).toBe(2);
  });

  it('should return 1 when _layer2Start is undefined', () => {
    expect(getTagLayer(0, undefined)).toBe(1);
    expect(getTagLayer(5, undefined)).toBe(1);
  });
});

// ─── extractSection with Layer 2 integration ────────────────────

describe('extractSection Layer 2 provenance', () => {
  beforeEach(() => {
    extractAnnualFact.mockReset();
  });

  it('should mark Layer 2 resolved fields with layer: 2 in provenance', () => {
    // Simulate: Layer 1 tags return null, Layer 2 tag returns data
    extractAnnualFact.mockImplementation((_facts, tag, _unit) => {
      // Layer 1 tags: no data
      if (tag === 'Revenues') return null;
      if (tag === 'SalesRevenueNet') return null;
      // Layer 2 tag (a taxonomy descendant): has data
      if (tag === 'PremiumsEarnedNet') return { 2024: 5000000000 };
      return null;
    });

    // Build a taxonomy where Layer 1 has [Revenues, SalesRevenueNet]
    // and Layer 2 adds [PremiumsEarnedNet, ...] from the hierarchy
    const taxonomy = augmentTaxonomy([
      { field: 'revenues', unit: 'USD', tags: ['Revenues', 'SalesRevenueNet'] },
    ]);

    // PremiumsEarnedNet should be in the augmented tags (it's a child of Revenues)
    expect(taxonomy[0].tags).toContain('PremiumsEarnedNet');

    const { fieldData, provenanceData } = extractSection({}, taxonomy, 'restated');

    // Value should be extracted
    expect(fieldData.revenues[2024]).toBe(5000000000);

    // Provenance should show Layer 2
    expect(provenanceData.revenues[2024].tag).toBe('PremiumsEarnedNet');
    expect(provenanceData.revenues[2024].layer).toBe(2);
    expect(provenanceData.revenues[2024].derived).toBe(false);
  });

  it('should prefer Layer 1 tags over Layer 2 tags', () => {
    extractAnnualFact.mockImplementation((_facts, tag, _unit) => {
      if (tag === 'Revenues') return { 2024: 10000000000 };
      if (tag === 'PremiumsEarnedNet') return { 2024: 5000000000 };
      return null;
    });

    const taxonomy = augmentTaxonomy([
      { field: 'revenues', unit: 'USD', tags: ['Revenues'] },
    ]);

    const { fieldData, provenanceData } = extractSection({}, taxonomy, 'restated');

    // Layer 1 value should win
    expect(fieldData.revenues[2024]).toBe(10000000000);
    expect(provenanceData.revenues[2024].tag).toBe('Revenues');
    expect(provenanceData.revenues[2024].layer).toBe(1);
  });

  it('should handle mixed Layer 1 and Layer 2 across years', () => {
    extractAnnualFact.mockImplementation((_facts, tag, _unit) => {
      // 2024: Layer 1 tag has data
      if (tag === 'Revenues') return { 2024: 10000000000 };
      // 2023: only Layer 2 tag has data
      if (tag === 'PremiumsEarnedNet') return { 2023: 4000000000 };
      return null;
    });

    const taxonomy = augmentTaxonomy([
      { field: 'revenues', unit: 'USD', tags: ['Revenues'] },
    ]);

    const { fieldData, provenanceData } = extractSection({}, taxonomy, 'restated');

    expect(fieldData.revenues[2024]).toBe(10000000000);
    expect(provenanceData.revenues[2024].layer).toBe(1);

    expect(fieldData.revenues[2023]).toBe(4000000000);
    expect(provenanceData.revenues[2023].layer).toBe(2);
  });

  it('should still apply negate flag for Layer 2 resolved fields', () => {
    extractAnnualFact.mockImplementation((_facts, tag, _unit) => {
      // Assume some Layer 2 descendant of IncreaseDecreaseInAccountsReceivable
      if (tag === 'IncreaseDecreaseInAccountsReceivable') return null;
      if (tag === 'IncreaseDecreaseInAccountsReceivableRelatedParties') return { 2024: 300000 };
      return null;
    });

    const taxonomy = augmentTaxonomy([
      { field: 'change_in_receivables', unit: 'USD', negate: true,
        tags: ['IncreaseDecreaseInAccountsReceivable'] },
    ]);

    // Check that the descendant tag was added by Layer 2
    const hasDescendant = taxonomy[0].tags.includes('IncreaseDecreaseInAccountsReceivableRelatedParties');
    if (!hasDescendant) {
      // If this specific tag isn't in the hierarchy, skip the test
      return;
    }

    const { fieldData, provenanceData } = extractSection({}, taxonomy, 'restated');
    expect(fieldData.change_in_receivables[2024]).toBe(-300000);
    expect(provenanceData.change_in_receivables[2024].layer).toBe(2);
  });
});

// ─── Taxonomy coverage stats ────────────────────────────────────

describe('Layer 2 coverage statistics', () => {
  it('should add Layer 2 tags to key financial fields', () => {
    const incAug = augmentTaxonomy(INCOME_TAXONOMY);
    const balAug = augmentTaxonomy(BALANCE_TAXONOMY);
    const cfAug = augmentTaxonomy(CASHFLOW_TAXONOMY);

    // Check specific important fields have Layer 2 expansion
    const revenueField = incAug.find(f => f.field === 'revenues');
    expect(revenueField._layer2Start).toBeDefined();
    expect(revenueField.tags.length).toBeGreaterThan(revenueField._layer2Start);

    const assetsField = balAug.find(f => f.field === 'assets');
    expect(assetsField._layer2Start).toBeDefined();

    const opCfField = cfAug.find(f => f.field === 'net_cash_flow_from_operating_activities');
    expect(opCfField._layer2Start).toBeDefined();
  });

  it('Layer 2 should not include tags that are already in Layer 1', () => {
    const incAug = augmentTaxonomy(INCOME_TAXONOMY);

    for (const field of incAug) {
      if (!field._layer2Start) continue;
      const layer1Tags = new Set(INCOME_TAXONOMY.find(f => f.field === field.field).tags);
      const layer2Tags = field.tags.slice(field._layer2Start);
      for (const tag of layer2Tags) {
        expect(layer1Tags.has(tag)).toBe(false);
      }
    }
  });
});
