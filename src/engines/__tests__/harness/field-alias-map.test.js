/**
 * field-alias-map.test.js — Unit tests for the field alias map that bridges
 * canonical source field names to XBRL engine internal field names.
 */
import { describe, it, expect } from 'vitest';
import {
  FIELD_ALIASES,
  REVERSE_ALIASES,
  resolveFieldName,
  resolveCanonicalName,
} from '../../../../validation/scripts/lib/field-alias-map.mjs';

describe('FIELD_ALIASES', () => {
  it('contains all 16 required Category A aliases', () => {
    const requiredAliases = [
      'stockholders_equity',
      'total_liabilities',
      'total_assets',
      'total_current_assets',
      'total_current_liabilities',
      'cash_and_equivalents',
      'inventories',
      'income_tax_expense',
      'pretax_income',
      'diluted_eps',
      'basic_eps',
      'diluted_shares_outstanding',
      'basic_shares_outstanding',
      'operating_cash_flow',
      'investing_cash_flow',
      'financing_cash_flow',
    ];

    for (const alias of requiredAliases) {
      expect(FIELD_ALIASES).toHaveProperty(alias);
    }
  });

  it('also includes financial sector alias', () => {
    expect(FIELD_ALIASES).toHaveProperty('provision_for_loan_losses');
    expect(FIELD_ALIASES.provision_for_loan_losses).toBe('provision_for_credit_losses');
  });

  it('maps balance sheet aliases to correct engine names', () => {
    expect(FIELD_ALIASES.stockholders_equity).toBe('equity');
    expect(FIELD_ALIASES.total_liabilities).toBe('liabilities');
    expect(FIELD_ALIASES.total_assets).toBe('assets');
    expect(FIELD_ALIASES.total_current_assets).toBe('current_assets');
    expect(FIELD_ALIASES.total_current_liabilities).toBe('current_liabilities');
    expect(FIELD_ALIASES.cash_and_equivalents).toBe('cash');
    expect(FIELD_ALIASES.inventories).toBe('inventory');
  });

  it('maps income statement aliases to correct engine names', () => {
    expect(FIELD_ALIASES.income_tax_expense).toBe('income_tax');
    expect(FIELD_ALIASES.pretax_income).toBe('income_before_tax');
    expect(FIELD_ALIASES.diluted_eps).toBe('diluted_earnings_per_share');
    expect(FIELD_ALIASES.basic_eps).toBe('basic_earnings_per_share');
    expect(FIELD_ALIASES.diluted_shares_outstanding).toBe('diluted_average_shares');
    expect(FIELD_ALIASES.basic_shares_outstanding).toBe('basic_average_shares');
  });

  it('maps cash flow aliases to correct engine names', () => {
    expect(FIELD_ALIASES.operating_cash_flow).toBe('net_cash_flow_from_operating_activities');
    expect(FIELD_ALIASES.investing_cash_flow).toBe('net_cash_flow_from_investing_activities');
    expect(FIELD_ALIASES.financing_cash_flow).toBe('net_cash_flow_from_financing_activities');
  });

  it('has no duplicate engine target names (except intentional)', () => {
    const engineNames = Object.values(FIELD_ALIASES);
    const unique = new Set(engineNames);
    // Each canonical should map to a unique engine name
    expect(engineNames.length).toBe(unique.size);
  });
});

describe('REVERSE_ALIASES', () => {
  it('contains all engine field names from FIELD_ALIASES', () => {
    for (const engineName of Object.values(FIELD_ALIASES)) {
      expect(REVERSE_ALIASES).toHaveProperty(engineName);
    }
  });

  it('maps engine names back to canonical names', () => {
    expect(REVERSE_ALIASES.equity).toBe('stockholders_equity');
    expect(REVERSE_ALIASES.liabilities).toBe('total_liabilities');
    expect(REVERSE_ALIASES.assets).toBe('total_assets');
    expect(REVERSE_ALIASES.cash).toBe('cash_and_equivalents');
    expect(REVERSE_ALIASES.income_tax).toBe('income_tax_expense');
  });
});

describe('resolveFieldName', () => {
  it('resolves each alias to its engine name', () => {
    for (const [canonical, engine] of Object.entries(FIELD_ALIASES)) {
      expect(resolveFieldName(canonical)).toBe(engine);
    }
  });

  it('returns original name for unmapped fields (passthrough)', () => {
    expect(resolveFieldName('revenues')).toBe('revenues');
    expect(resolveFieldName('net_income_loss')).toBe('net_income_loss');
    expect(resolveFieldName('cost_of_revenue')).toBe('cost_of_revenue');
    expect(resolveFieldName('gross_profit')).toBe('gross_profit');
    expect(resolveFieldName('some_unknown_field')).toBe('some_unknown_field');
  });

  it('resolves stockholders_equity -> equity', () => {
    expect(resolveFieldName('stockholders_equity')).toBe('equity');
  });

  it('resolves operating_cash_flow -> net_cash_flow_from_operating_activities', () => {
    expect(resolveFieldName('operating_cash_flow')).toBe('net_cash_flow_from_operating_activities');
  });
});

describe('resolveCanonicalName', () => {
  it('resolves each engine name back to canonical', () => {
    for (const [canonical, engine] of Object.entries(FIELD_ALIASES)) {
      expect(resolveCanonicalName(engine)).toBe(canonical);
    }
  });

  it('returns original name for unmapped engine fields (passthrough)', () => {
    expect(resolveCanonicalName('revenues')).toBe('revenues');
    expect(resolveCanonicalName('net_income_loss')).toBe('net_income_loss');
    expect(resolveCanonicalName('gross_profit')).toBe('gross_profit');
  });
});

describe('round-trip consistency', () => {
  it('canonical -> engine -> canonical returns original', () => {
    for (const canonical of Object.keys(FIELD_ALIASES)) {
      const engine = resolveFieldName(canonical);
      const back = resolveCanonicalName(engine);
      expect(back).toBe(canonical);
    }
  });

  it('engine -> canonical -> engine returns original', () => {
    for (const engine of Object.values(FIELD_ALIASES)) {
      const canonical = resolveCanonicalName(engine);
      const back = resolveFieldName(canonical);
      expect(back).toBe(engine);
    }
  });
});
