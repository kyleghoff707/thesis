/**
 * comparator.test.js — Unit tests for comparison logic with tolerance tiers
 *
 * Tests compareField tolerance boundaries and compareCompany orchestration.
 */

import { describe, it, expect } from 'vitest';
import {
  compareField,
  compareCompany,
  THRESHOLDS,
  FINANCIAL_SECTOR,
  SPIN_OFF,
  EUR_COMPANIES,
} from '../../../../validation/scripts/lib/comparator.mjs';

// ─── THRESHOLDS constant ─────────────────────────────────────

describe('THRESHOLDS', () => {
  it('has 5 tolerance tiers', () => {
    expect(Object.keys(THRESHOLDS)).toHaveLength(5);
  });

  it('exact = 0.01 (1%)', () => {
    expect(THRESHOLDS.exact).toBe(0.01);
  });

  it('close = 0.05 (5%)', () => {
    expect(THRESHOLDS.close).toBe(0.05);
  });

  it('approximate = 0.10 (10%)', () => {
    expect(THRESHOLDS.approximate).toBe(0.10);
  });

  it('relaxed = 0.20 (20%)', () => {
    expect(THRESHOLDS.relaxed).toBe(0.20);
  });

  it('informational = Infinity', () => {
    expect(THRESHOLDS.informational).toBe(Infinity);
  });
});

// ─── Constants ───────────────────────────────────────────────

describe('Constants', () => {
  it('FINANCIAL_SECTOR contains BRK-B, JPM, MET, WFC', () => {
    expect(FINANCIAL_SECTOR.has('BRK-B')).toBe(true);
    expect(FINANCIAL_SECTOR.has('JPM')).toBe(true);
    expect(FINANCIAL_SECTOR.has('MET')).toBe(true);
    expect(FINANCIAL_SECTOR.has('WFC')).toBe(true);
    expect(FINANCIAL_SECTOR.size).toBe(4);
  });

  it('SPIN_OFF contains EW:2023, JNJ:2023, T:2022', () => {
    expect(SPIN_OFF).toEqual({ EW: 2023, JNJ: 2023, T: 2022 });
  });

  it('EUR_COMPANIES contains RACE', () => {
    expect(EUR_COMPANIES.has('RACE')).toBe(true);
    expect(EUR_COMPANIES.size).toBe(1);
  });
});

// ─── compareField ────────────────────────────────────────────

describe('compareField', () => {
  // Exact match
  it('returns MATCH for identical values (billions scale)', () => {
    const result = compareField(365817000000, 365817000000, 1, 'exact');
    expect(result.status).toBe('MATCH');
    expect(result.pct).toBe(0);
    expect(result.expected).toBe(365817000000);
    expect(result.actual).toBe(365817000000);
  });

  it('returns MATCH for identical small values', () => {
    const result = compareField(42, 42, 1, 'exact');
    expect(result.status).toBe('MATCH');
    expect(result.pct).toBe(0);
  });

  // Sign flip
  it('returns MATCH when sign flip makes values match', () => {
    // MS: -212981000000 (negative expense), sign: -1
    // expected = -1 * -212981000000 = +212981000000
    const result = compareField(-212981000000, 212981000000, -1, 'close');
    expect(result.status).toBe('MATCH');
    expect(result.expected).toBe(212981000000);
  });

  // Tolerance tier boundaries
  it('MATCH for exact: 0.9% error within 1% threshold', () => {
    // 100 vs 100.9 = 0.9% error
    const result = compareField(100, 100.9, 1, 'exact');
    expect(result.status).toBe('MATCH');
    expect(result.pct).toBeCloseTo(0.009, 3);
  });

  it('CLOSE for exact: 1.1% error exceeds exact but within close', () => {
    // 100 vs 101.1 = 1.1% error
    const result = compareField(100, 101.1, 1, 'exact');
    expect(result.status).toBe('CLOSE');
    expect(result.pct).toBeCloseTo(0.011, 3);
  });

  it('DIFF for close: 5.1% error exceeds close threshold', () => {
    // 100 vs 105.1 = 5.1% error
    const result = compareField(100, 105.1, 1, 'close');
    expect(result.status).toBe('DIFF');
    expect(result.pct).toBeCloseTo(0.051, 3);
  });

  it('MATCH for close: 4.9% error within 5% threshold', () => {
    // 100 vs 104.9 = 4.9% error
    const result = compareField(100, 104.9, 1, 'close');
    expect(result.status).toBe('MATCH');
    expect(result.pct).toBeCloseTo(0.049, 3);
  });

  it('MATCH for approximate: 9.9% error within 10% threshold', () => {
    const result = compareField(100, 109.9, 1, 'approximate');
    expect(result.status).toBe('MATCH');
    expect(result.pct).toBeCloseTo(0.099, 3);
  });

  it('DIFF for approximate: 10.1% error exceeds 10% threshold', () => {
    const result = compareField(100, 110.1, 1, 'approximate');
    expect(result.status).toBe('DIFF');
    expect(result.pct).toBeCloseTo(0.101, 3);
  });

  it('MATCH for relaxed: 19.9% error within 20% threshold', () => {
    const result = compareField(100, 119.9, 1, 'relaxed');
    expect(result.status).toBe('MATCH');
  });

  it('DIFF for relaxed: 20.5% error exceeds 20% threshold', () => {
    const result = compareField(100, 120.5, 1, 'relaxed');
    expect(result.status).toBe('DIFF');
  });

  it('MATCH for informational: any percentage matches (Infinity threshold)', () => {
    const result = compareField(100, 500, 1, 'informational');
    expect(result.status).toBe('MATCH');
  });

  // Both-zero edge case
  it('returns MATCH for both-zero values', () => {
    const result = compareField(0, 0, 1, 'exact');
    expect(result.status).toBe('MATCH');
    expect(result.pct).toBe(0);
  });

  it('returns MATCH for near-zero values (< 1)', () => {
    const result = compareField(0.5, 0.3, 1, 'exact');
    expect(result.status).toBe('MATCH');
    expect(result.pct).toBe(0);
  });

  // Expected-zero edge cases
  it('returns MATCH when expected=0 and actual < 1M', () => {
    const result = compareField(0, 500000, 1, 'exact');
    expect(result.status).toBe('MATCH');
    expect(result.pct).toBe(Infinity);
  });

  it('returns DIFF when expected=0 and actual > 1M', () => {
    const result = compareField(0, 2000000, 1, 'exact');
    expect(result.status).toBe('DIFF');
    expect(result.pct).toBe(Infinity);
  });

  it('returns MATCH when expected=0 and actual = -500000', () => {
    const result = compareField(0, -500000, 1, 'exact');
    expect(result.status).toBe('MATCH');
  });

  it('returns DIFF when expected=0 and actual = -2000000', () => {
    const result = compareField(0, -2000000, 1, 'exact');
    expect(result.status).toBe('DIFF');
  });

  // 20% error with exact tolerance
  it('returns DIFF for 20% error with exact tolerance', () => {
    const result = compareField(100, 120, 1, 'exact');
    expect(result.status).toBe('DIFF');
    expect(result.pct).toBeCloseTo(0.20, 2);
  });

  // Falls back to THRESHOLDS.close for unknown tolerance
  it('uses close threshold for unknown tolerance name', () => {
    const result = compareField(100, 104, 1, 'nonexistent');
    expect(result.status).toBe('MATCH'); // 4% within close 5%
  });
});

// ─── compareCompany ──────────────────────────────────────────

describe('compareCompany', () => {
  // Helper: minimal field mapping for tests
  const minimalFieldMapping = {
    _meta: { totalMapped: 1 },
    income: {
      'Total Revenue': {
        thesisField: 'revenues',
        sign: 1,
        tolerance: 'exact',
      },
    },
  };

  it('returns correct structure with ticker, offset, and results', () => {
    const fixture = {
      fiscalYearEnd: 'Sep 30',
      statements: {
        income: {
          '2024': { 'Total Revenue': 391035000000 },
        },
      },
    };
    const engineData = {
      years: [2024],
      income: { 2024: { revenues: 391035000000 } },
    };

    const result = compareCompany('AAPL', fixture, engineData, minimalFieldMapping);
    expect(result).toHaveProperty('ticker', 'AAPL');
    expect(result).toHaveProperty('offset');
    expect(result).toHaveProperty('results');
    expect(Array.isArray(result.results)).toBe(true);
  });

  it('returns offset 0 for AAPL', () => {
    const fixture = {
      fiscalYearEnd: 'Sep 30',
      statements: {
        income: {
          '2024': { 'Total Revenue': 391035000000 },
        },
      },
    };
    const engineData = {
      years: [2024],
      income: { 2024: { revenues: 391035000000 } },
    };

    const result = compareCompany('AAPL', fixture, engineData, minimalFieldMapping);
    expect(result.offset).toBe(0);
  });

  it('produces MATCH for matching revenue', () => {
    const fixture = {
      fiscalYearEnd: 'Dec 31',
      statements: {
        income: {
          '2024': { 'Total Revenue': 100000000000 },
        },
      },
    };
    const engineData = {
      years: [2024],
      income: { 2024: { revenues: 100000000000 } },
    };

    const result = compareCompany('TEST', fixture, engineData, minimalFieldMapping);
    const rev = result.results.find(r => r.thesisField === 'revenues');
    expect(rev.status).toBe('MATCH');
  });

  it('produces MISSING_FIELD when engine lacks the field', () => {
    const fixture = {
      fiscalYearEnd: 'Dec 31',
      statements: {
        income: {
          '2024': { 'Total Revenue': 100000000000 },
        },
      },
    };
    const engineData = {
      years: [2024],
      income: { 2024: {} }, // No revenues field
    };

    const result = compareCompany('TEST', fixture, engineData, minimalFieldMapping);
    const rev = result.results.find(r => r.thesisField === 'revenues');
    expect(rev.status).toBe('MISSING_FIELD');
  });

  it('produces MISSING_YEAR when engine lacks the year', () => {
    const fixture = {
      fiscalYearEnd: 'Dec 31',
      statements: {
        income: {
          '2024': { 'Total Revenue': 100000000000 },
        },
      },
    };
    const engineData = {
      years: [2023],
      income: { 2023: { revenues: 90000000000 } }, // No 2024
    };

    const result = compareCompany('TEST', fixture, engineData, minimalFieldMapping);
    const rev = result.results.find(r => r.thesisField === 'revenues');
    expect(rev.status).toBe('MISSING_YEAR');
  });

  it('returns SKIP_SPINOFF for EW pre-2023', () => {
    const fixture = {
      fiscalYearEnd: 'Dec 31',
      statements: {
        income: {
          '2022': { 'Total Revenue': 50000000000 },
          '2023': { 'Total Revenue': 60000000000 },
        },
      },
    };
    const engineData = {
      years: [2023, 2022],
      income: {
        2022: { revenues: 50000000000 },
        2023: { revenues: 60000000000 },
      },
    };

    const result = compareCompany('EW', fixture, engineData, minimalFieldMapping);
    const pre = result.results.find(r => r.edgarYear === 2022);
    const post = result.results.find(r => r.edgarYear === 2023);
    expect(pre.status).toBe('SKIP_SPINOFF');
    expect(post.status).toBe('MATCH');
  });

  it('returns SKIP_SPINOFF for T pre-2022', () => {
    const fixture = {
      fiscalYearEnd: 'Dec 31',
      statements: {
        income: {
          '2021': { 'Total Revenue': 100000000000 },
          '2022': { 'Total Revenue': 120000000000 },
        },
      },
    };
    const engineData = {
      years: [2022, 2021],
      income: {
        2021: { revenues: 100000000000 },
        2022: { revenues: 120000000000 },
      },
    };

    const result = compareCompany('T', fixture, engineData, minimalFieldMapping);
    const pre = result.results.find(r => r.edgarYear === 2021);
    const post = result.results.find(r => r.edgarYear === 2022);
    expect(pre.status).toBe('SKIP_SPINOFF');
    expect(post.status).toBe('MATCH');
  });

  it('applies relaxed tolerance for JPM on revenues', () => {
    const fixture = {
      fiscalYearEnd: 'Dec 31',
      statements: {
        income: {
          '2024': { 'Total Revenue': 100000000000 },
        },
      },
    };
    const engineData = {
      years: [2024],
      income: { 2024: { revenues: 115000000000 } }, // 15% off — would fail exact, pass relaxed
    };

    const result = compareCompany('JPM', fixture, engineData, minimalFieldMapping);
    const rev = result.results.find(r => r.thesisField === 'revenues');
    // For financial sector + revenues field, tolerance is relaxed (20%)
    expect(rev.tolerance).toBe('relaxed');
  });

  it('skips null MS values', () => {
    const fixture = {
      fiscalYearEnd: 'Dec 31',
      statements: {
        income: {
          '2024': { 'Total Revenue': null },
        },
      },
    };
    const engineData = {
      years: [2024],
      income: { 2024: { revenues: 100000000000 } },
    };

    const result = compareCompany('TEST', fixture, engineData, minimalFieldMapping);
    expect(result.results).toHaveLength(0); // null MS value = skip
  });

  it('applies special handlers when provided', () => {
    const fieldMappingWithTax = {
      _meta: { totalMapped: 1 },
      income: {
        'Reported Effective Tax Rate': {
          thesisField: 'effective_tax_rate',
          sign: 1,
          tolerance: 'approximate',
        },
      },
    };

    const specialHandlers = {
      effective_tax_rate_scale: (msValue) => msValue * 100,
    };

    const fixture = {
      fiscalYearEnd: 'Dec 31',
      statements: {
        income: {
          '2024': { 'Reported Effective Tax Rate': 0.24 },
        },
      },
    };
    const engineData = {
      years: [2024],
      income: { 2024: { effective_tax_rate: 24 } },
    };

    const result = compareCompany('TEST', fixture, engineData, fieldMappingWithTax, { specialHandlers });
    const tax = result.results.find(r => r.thesisField === 'effective_tax_rate');
    expect(tax.status).toBe('MATCH');
    expect(tax.expected).toBe(24); // 0.24 * 100
  });

  it('applies intangibles handler when provided', () => {
    const fieldMappingIntangibles = {
      _meta: { totalMapped: 1 },
      balance_sheet: {
        'Intangibles other than Goodwill': {
          thesisField: 'intangible_assets',
          sign: 1,
          tolerance: 'close',
        },
      },
    };

    const specialHandlers = {
      intangibles_net: (msValue, yearData) => {
        const accumAmort = yearData['Accumulated Amortization of Intangibles other than Goodwill'];
        return accumAmort != null ? msValue + accumAmort : msValue;
      },
    };

    const fixture = {
      fiscalYearEnd: 'Dec 31',
      statements: {
        balance_sheet: {
          '2024': {
            'Intangibles other than Goodwill': 10000000000,
            'Accumulated Amortization of Intangibles other than Goodwill': -3000000000,
          },
        },
      },
    };
    const engineData = {
      years: [2024],
      balance: { 2024: { intangible_assets: 7000000000 } },
    };

    const result = compareCompany('TEST', fixture, engineData, fieldMappingIntangibles, { specialHandlers });
    const intangibles = result.results.find(r => r.thesisField === 'intangible_assets');
    expect(intangibles.status).toBe('MATCH');
    expect(intangibles.expected).toBe(7000000000);
  });
});
