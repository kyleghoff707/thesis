/**
 * field-mapper.test.js — Unit tests for field mapping
 *
 * Tests loadFieldMapping and mapMorningstarToCanonical.
 */

import { describe, it, expect } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  loadFieldMapping,
  mapMorningstarToCanonical,
  getSpecialFieldHandlers,
  STMT_MAP,
} from '../../../../validation/scripts/lib/field-mapper.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MAPPING_PATH = path.join(__dirname, '..', 'fixtures', 'morningstar', 'field-mapping.json');

// ─── loadFieldMapping ────────────────────────────────────────

describe('loadFieldMapping', () => {
  it('loads field-mapping.json and returns parsed object', () => {
    const mapping = loadFieldMapping(MAPPING_PATH);
    expect(mapping).toBeDefined();
    expect(mapping._meta).toBeDefined();
    expect(mapping._meta.totalMapped).toBe(87);
  });

  it('contains income, balance_sheet, and cash_flow sections', () => {
    const mapping = loadFieldMapping(MAPPING_PATH);
    expect(mapping.income).toBeDefined();
    expect(mapping.balance_sheet).toBeDefined();
    expect(mapping.cash_flow).toBeDefined();
  });

  it('has 101 total mapped fields (with thesisField non-null)', () => {
    const mapping = loadFieldMapping(MAPPING_PATH);
    let count = 0;
    for (const [stmtKey, fields] of Object.entries(mapping)) {
      if (stmtKey === '_meta') continue;
      for (const [, info] of Object.entries(fields)) {
        if (info.thesisField != null) count++;
      }
    }
    // _meta.totalMapped says 87 but actual count is 101 (mapping was extended after metadata)
    expect(count).toBe(101);
  });

  it('each mapped field has sign and tolerance properties', () => {
    const mapping = loadFieldMapping(MAPPING_PATH);
    for (const [stmtKey, fields] of Object.entries(mapping)) {
      if (stmtKey === '_meta') continue;
      for (const [msField, info] of Object.entries(fields)) {
        if (info.thesisField == null) continue;
        expect(info.sign, `${msField} missing sign`).toBeDefined();
        expect(info.tolerance, `${msField} missing tolerance`).toBeDefined();
        expect([1, -1]).toContain(info.sign);
        expect(['exact', 'close', 'approximate', 'relaxed', 'informational']).toContain(info.tolerance);
      }
    }
  });
});

// ─── STMT_MAP ────────────────────────────────────────────────

describe('STMT_MAP', () => {
  it('maps MS statement keys to engine statement keys', () => {
    expect(STMT_MAP).toEqual({
      income: 'income',
      balance_sheet: 'balance',
      cash_flow: 'cashFlow',
    });
  });
});

// ─── getSpecialFieldHandlers ─────────────────────────────────

describe('getSpecialFieldHandlers', () => {
  it('returns an object with known handler names', () => {
    const handlers = getSpecialFieldHandlers();
    expect(handlers).toBeDefined();
    expect(typeof handlers.intangibles_net).toBe('function');
    expect(typeof handlers.operating_income_reported).toBe('function');
    expect(typeof handlers.accrued_combined_skip).toBe('function');
    expect(typeof handlers.effective_tax_rate_scale).toBe('function');
  });

  // Intangibles NET handler
  it('intangibles_net: computes NET = GROSS + AccumAmort', () => {
    const handlers = getSpecialFieldHandlers();
    const yearData = {
      'Intangibles other than Goodwill': 10000000000,
      'Accumulated Amortization of Intangibles other than Goodwill': -3000000000,
    };
    const result = handlers.intangibles_net(10000000000, yearData);
    expect(result).toBe(7000000000); // 10B + (-3B) = 7B
  });

  it('intangibles_net: returns original if no AccumAmort', () => {
    const handlers = getSpecialFieldHandlers();
    const yearData = {
      'Intangibles other than Goodwill': 10000000000,
    };
    const result = handlers.intangibles_net(10000000000, yearData);
    expect(result).toBe(10000000000);
  });

  it('intangibles_net: tries alternative AccumAmort field names', () => {
    const handlers = getSpecialFieldHandlers();
    const yearData = {
      'Intangibles other than Goodwill': 10000000000,
      'Accumulated Amortization of Intangible Assets': -2000000000,
    };
    const result = handlers.intangibles_net(10000000000, yearData);
    expect(result).toBe(8000000000);
  });

  // Operating income handler
  it('operating_income_reported: prefers Reported value', () => {
    const handlers = getSpecialFieldHandlers();
    const yearData = {
      'Total Operating Profit/Loss': 50000000000,
      'Reported Total Operating Profit/Loss': 48000000000,
    };
    const result = handlers.operating_income_reported(50000000000, yearData);
    expect(result).toBe(48000000000);
  });

  it('operating_income_reported: falls back to original if no Reported', () => {
    const handlers = getSpecialFieldHandlers();
    const yearData = {
      'Total Operating Profit/Loss': 50000000000,
    };
    const result = handlers.operating_income_reported(50000000000, yearData);
    expect(result).toBe(50000000000);
  });

  // Accrued liabilities handler (per-year logic)
  it('accrued_combined_skip: returns SKIP when current year has no separate accrued', () => {
    const handlers = getSpecialFieldHandlers();
    const allYearsData = {
      '2021': { 'Accrued Expenses, Current': null },
      '2022': { 'Accrued Expenses, Current': 5000000 },
    };
    // Year 2021 has no separate accrued -> SKIP
    const result = handlers.accrued_combined_skip(1000000, allYearsData, '2021');
    expect(result).toBe('SKIP');
  });

  it('accrued_combined_skip: returns original when current year has separate accrued', () => {
    const handlers = getSpecialFieldHandlers();
    const allYearsData = {
      '2021': { 'Accrued Expenses, Current': null },
      '2022': { 'Accrued Expenses, Current': 5000000 },
    };
    // Year 2022 has separate accrued -> return original
    const result = handlers.accrued_combined_skip(1000000, allYearsData, '2022');
    expect(result).toBe(1000000);
  });

  it('accrued_combined_skip: returns SKIP for all years of combined-only company', () => {
    const handlers = getSpecialFieldHandlers();
    const allYearsData = {
      '2021': { 'Payables and Accrued Expenses': 8000000 },
      '2022': { 'Payables and Accrued Expenses': 9000000 },
    };
    // Neither year has separate accrued -> SKIP for both
    expect(handlers.accrued_combined_skip(1000000, allYearsData, '2021')).toBe('SKIP');
    expect(handlers.accrued_combined_skip(1000000, allYearsData, '2022')).toBe('SKIP');
  });

  it('accrued_combined_skip: returns SKIP when year data is missing entirely', () => {
    const handlers = getSpecialFieldHandlers();
    const allYearsData = {
      '2022': { 'Accrued Expenses, Current': 5000000 },
    };
    // Year 2021 has no entry at all -> SKIP
    const result = handlers.accrued_combined_skip(1000000, allYearsData, '2021');
    expect(result).toBe('SKIP');
  });

  // Effective tax rate handler
  it('effective_tax_rate_scale: multiplies by 100', () => {
    const handlers = getSpecialFieldHandlers();
    expect(handlers.effective_tax_rate_scale(0.24)).toBe(24);
    expect(handlers.effective_tax_rate_scale(0.21)).toBe(21);
    expect(handlers.effective_tax_rate_scale(0.0)).toBe(0);
  });
});

// ─── mapMorningstarToCanonical ───────────────────────────────

describe('mapMorningstarToCanonical', () => {
  const fieldMapping = loadFieldMapping(MAPPING_PATH);

  it('transforms MS revenue (sign: 1) correctly', () => {
    const msStatements = {
      income: {
        '2024': { 'Total Revenue': 391035000000 },
      },
      balance_sheet: {},
      cash_flow: {},
    };
    const canonical = mapMorningstarToCanonical(msStatements, fieldMapping);
    expect(canonical.income['2024'].revenues).toBe(391035000000);
  });

  it('flips COGS sign (sign: -1) correctly', () => {
    const msStatements = {
      income: {
        '2024': { 'Cost of Revenue': -210352000000 },
      },
      balance_sheet: {},
      cash_flow: {},
    };
    const canonical = mapMorningstarToCanonical(msStatements, fieldMapping);
    // sign:-1 * (-210352000000) = +210352000000
    expect(canonical.income['2024'].cost_of_revenue).toBe(210352000000);
  });

  it('scales effective_tax_rate from decimal to percentage', () => {
    const msStatements = {
      income: {
        '2024': { 'Reported Effective Tax Rate': 0.24 },
      },
      balance_sheet: {},
      cash_flow: {},
    };
    const canonical = mapMorningstarToCanonical(msStatements, fieldMapping);
    expect(canonical.income['2024'].effective_tax_rate).toBe(24);
  });

  it('handles balance sheet fields correctly', () => {
    const msStatements = {
      income: {},
      balance_sheet: {
        '2024': {
          'Total Assets': 352583000000,
          'Treasury Stock': -105620000000,
        },
      },
      cash_flow: {},
    };
    const canonical = mapMorningstarToCanonical(msStatements, fieldMapping);
    expect(canonical.balance['2024'].assets).toBe(352583000000);
    // Treasury Stock: sign:-1 * (-105620000000) = +105620000000
    expect(canonical.balance['2024'].treasury_stock).toBe(105620000000);
  });

  it('handles cash flow fields with sign flips', () => {
    const msStatements = {
      income: {},
      balance_sheet: {},
      cash_flow: {
        '2024': {
          'Cash Flow from Operating Activities, Indirect': 118254000000,
          'Purchase of Property, Plant and Equipment': -9959000000,
        },
      },
    };
    const canonical = mapMorningstarToCanonical(msStatements, fieldMapping);
    expect(canonical.cashFlow['2024'].net_cash_flow_from_operating_activities).toBe(118254000000);
    // CapEx: sign:-1 * (-9959000000) = +9959000000
    expect(canonical.cashFlow['2024'].capital_expenditures).toBe(9959000000);
  });

  it('returns canonical with income, balance, and cashFlow keys', () => {
    const msStatements = {
      income: { '2024': {} },
      balance_sheet: { '2024': {} },
      cash_flow: { '2024': {} },
    };
    const canonical = mapMorningstarToCanonical(msStatements, fieldMapping);
    expect(canonical).toHaveProperty('income');
    expect(canonical).toHaveProperty('balance');
    expect(canonical).toHaveProperty('cashFlow');
  });

  it('skips fields with null thesisField', () => {
    const msStatements = {
      income: {
        '2024': {
          'Non-Controlling/Minority Interests': 100000000,
          'Total Revenue': 391035000000,
        },
      },
      balance_sheet: {},
      cash_flow: {},
    };
    const canonical = mapMorningstarToCanonical(msStatements, fieldMapping);
    // Non-Controlling/Minority Interests has thesisField: null — should not appear
    expect(canonical.income['2024']).not.toHaveProperty('null');
    expect(canonical.income['2024'].revenues).toBe(391035000000);
  });

  it('skips null MS values', () => {
    const msStatements = {
      income: {
        '2024': { 'Total Revenue': null },
      },
      balance_sheet: {},
      cash_flow: {},
    };
    const canonical = mapMorningstarToCanonical(msStatements, fieldMapping);
    expect(canonical.income['2024'].revenues).toBeUndefined();
  });
});
