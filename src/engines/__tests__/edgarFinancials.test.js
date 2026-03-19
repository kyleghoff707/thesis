// Tests for edgarFinancials.js fixes
// Fix 2 (P1b): Cash tag gap — restricted cash tag
// Fix 3 (P1a): Debt tags + sanity check
// Fix 4 (P2): Sign convention — negate WC components
// Fix 5 (P1e): SGA — separate fields + derived sum
// Fix 6 (P3b): Debt display consistency

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock external dependencies so we can test computeDerivedFields in isolation
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

// Import the taxonomies, computeDerivedFields, and provenance helpers for testing
const { INCOME_TAXONOMY, BALANCE_TAXONOMY, CASHFLOW_TAXONOMY, computeDerivedFields, extractSection, buildProvenance } = await import('../edgarFinancials');
const { extractAnnualFact } = await import('../edgar');

describe('Fix 2 (P1b): Cash tag — restricted cash included', () => {
  it('should have CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents in cash tags', () => {
    const cashField = BALANCE_TAXONOMY.find(f => f.field === 'cash');
    expect(cashField).toBeDefined();
    expect(cashField.tags).toContain('CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents');
  });
});

describe('Fix 3 (P1a): Debt tags — industry-specific coverage', () => {
  it('should include REIT-specific debt tags', () => {
    const debtField = BALANCE_TAXONOMY.find(f => f.field === 'long_term_debt');
    expect(debtField).toBeDefined();
    const tags = debtField.tags;
    expect(tags).toContain('SecuredDebt');
    expect(tags).toContain('UnsecuredDebt');
    expect(tags).toContain('SeniorNotesNoncurrent');
  });

  it('should include bank-specific debt tags', () => {
    const debtField = BALANCE_TAXONOMY.find(f => f.field === 'long_term_debt');
    const tags = debtField.tags;
    expect(tags).toContain('SubordinatedDebt');
  });

  it('should include energy-specific debt tags', () => {
    const debtField = BALANCE_TAXONOMY.find(f => f.field === 'long_term_debt');
    const tags = debtField.tags;
    expect(tags).toContain('LongTermNotesPayable');
  });
});

describe('Fix 4 (P2): Sign convention — working capital components', () => {
  it('should have negate flag on change_in_receivables', () => {
    const field = CASHFLOW_TAXONOMY.find(f => f.field === 'change_in_receivables');
    expect(field).toBeDefined();
    expect(field.negate).toBe(true);
  });

  it('should have negate flag on change_in_inventory', () => {
    const field = CASHFLOW_TAXONOMY.find(f => f.field === 'change_in_inventory');
    expect(field).toBeDefined();
    expect(field.negate).toBe(true);
  });

  it('should have negate flag on change_in_other_working_capital', () => {
    const field = CASHFLOW_TAXONOMY.find(f => f.field === 'change_in_other_working_capital');
    expect(field).toBeDefined();
    expect(field.negate).toBe(true);
  });

  it('should NOT have negate flag on change_in_payables (payables use cash convention already)', () => {
    const field = CASHFLOW_TAXONOMY.find(f => f.field === 'change_in_payables');
    expect(field).toBeDefined();
    expect(field.negate).toBeFalsy();
  });

  it('should have negate flag on other_noncash_items', () => {
    const field = CASHFLOW_TAXONOMY.find(f => f.field === 'other_noncash_items');
    expect(field).toBeDefined();
    expect(field.negate).toBe(true);
  });
});

describe('Fix 5 (P1e): SGA — separate selling + G&A fields', () => {
  it('should have separate selling_expense field', () => {
    const field = INCOME_TAXONOMY.find(f => f.field === 'selling_expense');
    expect(field).toBeDefined();
    expect(field.tags).toContain('SellingAndMarketingExpense');
  });

  it('should have separate general_and_admin_expense field', () => {
    const field = INCOME_TAXONOMY.find(f => f.field === 'general_and_admin_expense');
    expect(field).toBeDefined();
    expect(field.tags).toContain('GeneralAndAdministrativeExpense');
  });

  it('sga field should only use the combined tag (not selling-only)', () => {
    const field = INCOME_TAXONOMY.find(f => f.field === 'sga');
    expect(field).toBeDefined();
    // SGA should ONLY have the combined tag — selling-only and G&A-only are in their own fields
    expect(field.tags).toContain('SellingGeneralAndAdministrativeExpense');
    expect(field.tags).not.toContain('SellingAndMarketingExpense');
    expect(field.tags).not.toContain('GeneralAndAdministrativeExpense');
  });
});

describe('computeDerivedFields behavior', () => {
  it('Fix 4: should sum working capital components with correct (already-negated) signs', () => {
    const years = [2024];
    const income = { 2024: {} };
    const balance = { 2024: {} };
    const cashFlow = { 2024: {
      net_cash_flow_from_operating_activities: 1000,
      change_in_receivables: -500, // already negated by extractSection negate flag
      change_in_inventory: -200,   // already negated
      change_in_payables: 300,     // NOT negated (payables increase = cash source)
      change_in_other_working_capital: -100, // already negated
    }};

    computeDerivedFields(years, income, balance, cashFlow);

    // change_in_working_capital = -500 + -200 + 300 + -100 = -500
    expect(cashFlow[2024].change_in_working_capital).toBe(-500);
  });

  it('Fix 5: should derive SGA from selling + G&A when combined tag is null', () => {
    const years = [2024];
    const income = { 2024: {
      // sga is null (combined tag missing)
      selling_expense: 25000000000,
      general_and_admin_expense: 7000000000,
    }};
    const balance = { 2024: {} };
    const cashFlow = { 2024: {} };

    computeDerivedFields(years, income, balance, cashFlow);

    // sga = 25B + 7B = 32B
    expect(income[2024].sga).toBe(32000000000);
  });

  it('Fix 3: debt sanity check — ratio-based fallback when tags miss debt', () => {
    const years = [2024];
    const income = { 2024: {} };
    const balance = { 2024: {
      liabilities: 50000000000,      // $50B total liabilities
      short_term_debt: 100000000,    // $100M
      current_portion_lt_debt: 200000000, // $200M
      long_term_debt: 200000000,     // $200M → total_debt = $500M (1% of liabilities — triggers sanity check)
      accounts_payable: 2000000000,
      accrued_liabilities: 3000000000,
      deferred_revenue_current: 1000000000,
      deferred_revenue_noncurrent: 500000000,
      operating_lease_liability_current: 800000000,
      operating_lease_liability_noncurrent: 4000000000,
      deferred_tax_liabilities: 2000000000,
      pension_liabilities: 1000000000,
      other_current_liabilities: 500000000,
      other_noncurrent_liabilities: 1000000000,
    }};
    const cashFlow = { 2024: {} };

    computeDerivedFields(years, income, balance, cashFlow);

    // Known non-debt = 2+3+1+0.5+0.8+4+2+1+0.5+1 = 15.8B
    // Derived debt = 50B - 15.8B = 34.2B — much more than $500M
    expect(balance[2024].total_debt).toBe(34200000000);
  });
});

// ─── Phase 1: Layer 1 Tag Expansion ──────────────────────────

describe('Phase 1: operating_income_loss tag expansion', () => {
  it('should include OperatingIncomeLossFromContinuingOperations as fallback', () => {
    const field = INCOME_TAXONOMY.find(f => f.field === 'operating_income_loss');
    expect(field).toBeDefined();
    expect(field.tags).toContain('OperatingIncomeLoss');
    expect(field.tags).toContain('OperatingIncomeLossFromContinuingOperations');
  });
});

describe('Phase 1: short_term_debt tag expansion', () => {
  it('should include LineOfCredit for revolving credit facilities', () => {
    const field = BALANCE_TAXONOMY.find(f => f.field === 'short_term_debt');
    expect(field).toBeDefined();
    expect(field.tags).toContain('LineOfCredit');
  });

  it('should include ShortTermBankLoansAndNotesPayable', () => {
    const field = BALANCE_TAXONOMY.find(f => f.field === 'short_term_debt');
    expect(field.tags).toContain('ShortTermBankLoansAndNotesPayable');
  });
});

describe('Phase 1: current_portion_lt_debt tag expansion', () => {
  it('should include combined debt+lease current tag', () => {
    const field = BALANCE_TAXONOMY.find(f => f.field === 'current_portion_lt_debt');
    expect(field).toBeDefined();
    expect(field.tags).toContain('LongTermDebtAndCapitalLeaseObligationsCurrent');
  });

  it('should include OtherLongTermDebtCurrent', () => {
    const field = BALANCE_TAXONOMY.find(f => f.field === 'current_portion_lt_debt');
    expect(field.tags).toContain('OtherLongTermDebtCurrent');
  });
});

describe('Phase 1: depreciation_amortization tag expansion', () => {
  it('should include OtherDepreciationAndAmortization as fallback', () => {
    const field = CASHFLOW_TAXONOMY.find(f => f.field === 'depreciation_amortization');
    expect(field).toBeDefined();
    expect(field.tags).toContain('OtherDepreciationAndAmortization');
  });
});

// ─── Phase 1: operating_income_loss Derivation ──────────────

describe('Phase 1: operating_income_loss derivation via computeDerivedFields', () => {
  it('should derive from income_before_tax + interest_expense - other_income_expense', () => {
    const years = [2024];
    const income = { 2024: {
      income_before_tax: 10000000000,   // $10B pre-tax
      interest_expense: 500000000,       // $500M interest
      other_income_expense: -200000000,  // -$200M other (loss)
      // operating_income_loss is MISSING (financial company scenario)
    }};
    const balance = { 2024: {} };
    const cashFlow = { 2024: {} };

    computeDerivedFields(years, income, balance, cashFlow);

    // operating_income = 10B + 500M - (-200M) = 10.7B
    expect(income[2024].operating_income_loss).toBe(10700000000);
  });

  it('should derive from income_before_tax + interest_expense when other_income_expense is missing', () => {
    const years = [2024];
    const income = { 2024: {
      income_before_tax: 8000000000,
      interest_expense: 300000000,
      // other_income_expense is missing → defaults to 0
    }};
    const balance = { 2024: {} };
    const cashFlow = { 2024: {} };

    computeDerivedFields(years, income, balance, cashFlow);

    // operating_income = 8B + 300M - 0 = 8.3B
    expect(income[2024].operating_income_loss).toBe(8300000000);
  });

  it('should derive from gross_profit - opex components as fallback', () => {
    const years = [2024];
    const income = { 2024: {
      // No income_before_tax or interest_expense
      gross_profit: 5000000000,         // $5B
      sga: 1500000000,                  // $1.5B
      research_and_development: 800000000, // $800M
      // No D&A on IS, no other opex
    }};
    const balance = { 2024: {} };
    const cashFlow = { 2024: {} };

    computeDerivedFields(years, income, balance, cashFlow);

    // operating_income = 5B - 1.5B - 800M = 2.7B
    expect(income[2024].operating_income_loss).toBe(2700000000);
  });

  it('should NOT override existing operating_income_loss', () => {
    const years = [2024];
    const income = { 2024: {
      operating_income_loss: 9000000000, // Already extracted from XBRL tag
      income_before_tax: 10000000000,
      interest_expense: 500000000,
    }};
    const balance = { 2024: {} };
    const cashFlow = { 2024: {} };

    computeDerivedFields(years, income, balance, cashFlow);

    // Should keep the original value, not derive
    expect(income[2024].operating_income_loss).toBe(9000000000);
  });

  it('derived operating_income_loss should feed into EBIT', () => {
    const years = [2024];
    const income = { 2024: {
      income_before_tax: 10000000000,
      interest_expense: 500000000,
      other_income_expense: 0,
    }};
    const balance = { 2024: {} };
    const cashFlow = { 2024: { depreciation_amortization: 1000000000 } };

    computeDerivedFields(years, income, balance, cashFlow);

    // operating_income derived = 10B + 500M = 10.5B
    expect(income[2024].operating_income_loss).toBe(10500000000);
    // EBIT should use the derived operating_income_loss
    expect(income[2024].ebit).toBe(10500000000);
    // EBITDA = EBIT + D&A = 10.5B + 1B = 11.5B
    expect(income[2024].ebitda).toBe(11500000000);
  });

  it('liabilities derivation from liabilities_and_equity - equity', () => {
    const years = [2024];
    const income = { 2024: {} };
    const balance = { 2024: {
      liabilities_and_equity: 100000000000, // $100B
      equity: 40000000000,                   // $40B
      minority_interest: 2000000000,         // $2B
      // liabilities is MISSING, current_liabilities and noncurrent_liabilities also missing
    }};
    const cashFlow = { 2024: {} };

    computeDerivedFields(years, income, balance, cashFlow);

    // liabilities = 100B - 40B - 2B = 58B
    expect(balance[2024].liabilities).toBe(58000000000);
  });
});

// ─── Phase 2: Provenance Metadata ──────────────────────────

describe('Phase 2: extractSection provenance tracking', () => {
  beforeEach(() => {
    extractAnnualFact.mockReset();
  });

  it('should record which XBRL tag matched per field per year', () => {
    // Mock: RevenueFromContractWithCustomerExcludingAssessedTax has data for 2024,
    // Revenues fills in 2023 (gap-filling via fallback tags)
    extractAnnualFact.mockImplementation((_facts, tag, _unit) => {
      if (tag === 'RevenueFromContractWithCustomerExcludingAssessedTax') {
        return { 2024: 50000000000 };
      }
      if (tag === 'Revenues') {
        return { 2023: 40000000000 };
      }
      return null;
    });

    const taxonomy = [
      { field: 'revenues', unit: 'USD', tags: [
        'RevenueFromContractWithCustomerExcludingAssessedTax',
        'Revenues',
      ]},
    ];

    const { fieldData, provenanceData } = extractSection({}, taxonomy, 'restated');

    // Values extracted correctly
    expect(fieldData.revenues[2024]).toBe(50000000000);
    expect(fieldData.revenues[2023]).toBe(40000000000);

    // Provenance records which tag was used per year
    expect(provenanceData.revenues[2024].tag).toBe('RevenueFromContractWithCustomerExcludingAssessedTax');
    expect(provenanceData.revenues[2023].tag).toBe('Revenues');

    // Both are Layer 1, not derived
    expect(provenanceData.revenues[2024].layer).toBe(1);
    expect(provenanceData.revenues[2024].derived).toBe(false);
    expect(provenanceData.revenues[2023].layer).toBe(1);
    expect(provenanceData.revenues[2023].derived).toBe(false);
  });

  it('should use first tag value when multiple tags have data for same year', () => {
    // Both tags have 2024 data — first tag wins
    extractAnnualFact.mockImplementation((_facts, tag, _unit) => {
      if (tag === 'CostOfRevenue') return { 2024: 30000000000 };
      if (tag === 'CostOfGoodsAndServicesSold') return { 2024: 29000000000 };
      return null;
    });

    const taxonomy = [
      { field: 'cost_of_revenue', unit: 'USD', tags: ['CostOfRevenue', 'CostOfGoodsAndServicesSold'] },
    ];

    const { fieldData, provenanceData } = extractSection({}, taxonomy, 'restated');

    expect(fieldData.cost_of_revenue[2024]).toBe(30000000000);
    expect(provenanceData.cost_of_revenue[2024].tag).toBe('CostOfRevenue');
  });

  it('should apply negate flag and still record correct tag', () => {
    extractAnnualFact.mockImplementation((_facts, tag, _unit) => {
      if (tag === 'IncreaseDecreaseInAccountsReceivable') return { 2024: 500000 };
      return null;
    });

    const taxonomy = [
      { field: 'change_in_receivables', unit: 'USD', negate: true, tags: ['IncreaseDecreaseInAccountsReceivable'] },
    ];

    const { fieldData, provenanceData } = extractSection({}, taxonomy, 'restated');

    // Value is negated
    expect(fieldData.change_in_receivables[2024]).toBe(-500000);
    // Provenance still records the tag
    expect(provenanceData.change_in_receivables[2024].tag).toBe('IncreaseDecreaseInAccountsReceivable');
  });

  it('should return empty provenanceData when no tags match', () => {
    extractAnnualFact.mockReturnValue(null);

    const taxonomy = [
      { field: 'revenues', unit: 'USD', tags: ['NonExistentTag'] },
    ];

    const { fieldData, provenanceData } = extractSection({}, taxonomy, 'restated');

    expect(Object.keys(fieldData)).toHaveLength(0);
    expect(Object.keys(provenanceData)).toHaveLength(0);
  });
});

describe('Phase 2: buildProvenance', () => {
  it('should pivot provenance from field→year to year→field', () => {
    const provenanceData = {
      revenues: {
        2024: { tag: 'Revenues', layer: 1, derived: false, confidence: null, formula: null },
        2023: { tag: 'Revenues', layer: 1, derived: false, confidence: null, formula: null },
      },
      net_income_loss: {
        2024: { tag: 'NetIncomeLoss', layer: 1, derived: false, confidence: null, formula: null },
      },
    };

    const result = buildProvenance(provenanceData, [2024, 2023]);

    // Year 2024 has both fields
    expect(result[2024].revenues.tag).toBe('Revenues');
    expect(result[2024].net_income_loss.tag).toBe('NetIncomeLoss');

    // Year 2023 only has revenues
    expect(result[2023].revenues.tag).toBe('Revenues');
    expect(result[2023].net_income_loss).toBeUndefined();
  });
});

describe('Phase 2: derived field detection via pre/post diff', () => {
  it('should mark fields added by computeDerivedFields as derived', () => {
    const years = [2024];
    const income = { 2024: {
      revenues: 50000000000,
      cost_of_revenue: 30000000000,
      // gross_profit is NOT set — will be derived
    }};
    const balance = { 2024: {} };
    const cashFlow = { 2024: {} };

    // Build provenance for directly extracted fields
    const provIncome = { 2024: {
      revenues: { tag: 'Revenues', layer: 1, derived: false, confidence: null, formula: null },
      cost_of_revenue: { tag: 'CostOfRevenue', layer: 1, derived: false, confidence: null, formula: null },
    }};

    // Snapshot before derivation
    const preFields = new Set(Object.keys(income[2024]));

    computeDerivedFields(years, income, balance, cashFlow);

    // Mark derived fields
    for (const field of Object.keys(income[2024])) {
      if (!preFields.has(field) && !provIncome[2024][field]) {
        provIncome[2024][field] = { tag: null, layer: 1, derived: true, confidence: null, formula: null };
      }
    }

    // gross_profit was derived
    expect(income[2024].gross_profit).toBe(20000000000);
    expect(provIncome[2024].gross_profit.derived).toBe(true);
    expect(provIncome[2024].gross_profit.tag).toBeNull();

    // revenues was direct extraction
    expect(provIncome[2024].revenues.derived).toBe(false);
    expect(provIncome[2024].revenues.tag).toBe('Revenues');
  });

  it('should NOT mark directly extracted fields as derived even if derivation could apply', () => {
    const years = [2024];
    const income = { 2024: {
      revenues: 50000000000,
      cost_of_revenue: 30000000000,
      gross_profit: 20000000000, // Already extracted from XBRL
    }};
    const balance = { 2024: {} };
    const cashFlow = { 2024: {} };

    const provIncome = { 2024: {
      revenues: { tag: 'Revenues', layer: 1, derived: false, confidence: null, formula: null },
      cost_of_revenue: { tag: 'CostOfRevenue', layer: 1, derived: false, confidence: null, formula: null },
      gross_profit: { tag: 'GrossProfit', layer: 1, derived: false, confidence: null, formula: null },
    }};

    const preFields = new Set(Object.keys(income[2024]));

    computeDerivedFields(years, income, balance, cashFlow);

    // Mark derived fields
    for (const field of Object.keys(income[2024])) {
      if (!preFields.has(field) && !provIncome[2024][field]) {
        provIncome[2024][field] = { tag: null, layer: 1, derived: true, confidence: null, formula: null };
      }
    }

    // gross_profit was already present — should stay as direct
    expect(provIncome[2024].gross_profit.derived).toBe(false);
    expect(provIncome[2024].gross_profit.tag).toBe('GrossProfit');
  });

  it('should mark balance sheet derived fields (total_debt, net_debt, etc.)', () => {
    const years = [2024];
    const income = { 2024: {} };
    const balance = { 2024: {
      short_term_debt: 1000000000,
      long_term_debt: 5000000000,
      cash: 3000000000,
      equity: 20000000000,
    }};
    const cashFlow = { 2024: {} };

    const provBalance = { 2024: {
      short_term_debt: { tag: 'ShortTermBorrowings', layer: 1, derived: false, confidence: null, formula: null },
      long_term_debt: { tag: 'LongTermDebtNoncurrent', layer: 1, derived: false, confidence: null, formula: null },
      cash: { tag: 'CashAndCashEquivalentsAtCarryingValue', layer: 1, derived: false, confidence: null, formula: null },
      equity: { tag: 'StockholdersEquity', layer: 1, derived: false, confidence: null, formula: null },
    }};

    const preFields = new Set(Object.keys(balance[2024]));

    computeDerivedFields(years, income, balance, cashFlow);

    for (const field of Object.keys(balance[2024])) {
      if (!preFields.has(field) && !provBalance[2024][field]) {
        provBalance[2024][field] = { tag: null, layer: 1, derived: true, confidence: null, formula: null };
      }
    }

    // total_debt, total_debt_with_leases, net_debt should all be derived
    expect(provBalance[2024].total_debt.derived).toBe(true);
    expect(provBalance[2024].total_debt_with_leases.derived).toBe(true);
    expect(provBalance[2024].net_debt.derived).toBe(true);

    // Direct fields should stay as-is
    expect(provBalance[2024].cash.derived).toBe(false);
    expect(provBalance[2024].equity.derived).toBe(false);
  });

  it('should mark cash flow derived fields (free_cash_flow, etc.)', () => {
    const years = [2024];
    const income = { 2024: {} };
    const balance = { 2024: {} };
    const cashFlow = { 2024: {
      net_cash_flow_from_operating_activities: 10000000000,
      capital_expenditures: 2000000000,
    }};

    const provCashFlow = { 2024: {
      net_cash_flow_from_operating_activities: { tag: 'NetCashProvidedByUsedInOperatingActivities', layer: 1, derived: false, confidence: null, formula: null },
      capital_expenditures: { tag: 'PaymentsToAcquirePropertyPlantAndEquipment', layer: 1, derived: false, confidence: null, formula: null },
    }};

    const preFields = new Set(Object.keys(cashFlow[2024]));

    computeDerivedFields(years, income, balance, cashFlow);

    for (const field of Object.keys(cashFlow[2024])) {
      if (!preFields.has(field) && !provCashFlow[2024][field]) {
        provCashFlow[2024][field] = { tag: null, layer: 1, derived: true, confidence: null, formula: null };
      }
    }

    // free_cash_flow derived from operating CF - capex
    expect(cashFlow[2024].free_cash_flow).toBe(8000000000);
    expect(provCashFlow[2024].free_cash_flow.derived).toBe(true);
    expect(provCashFlow[2024].free_cash_flow.tag).toBeNull();
  });
});
