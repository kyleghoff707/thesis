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
const { INCOME_TAXONOMY, BALANCE_TAXONOMY, CASHFLOW_TAXONOMY, computeDerivedFields, computeTTM, extractSection, buildProvenance, getDerivedFormula } = await import('../edgarFinancials');
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
    // Sanity check requires interest_expense > 0 (companies with real debt have interest)
    const income = { 2024: { interest_expense: 1500000000 } }; // $1.5B interest expense
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

  it('Fix 3b: debt sanity check — skips fallback when interest_expense is zero (LULU-type)', () => {
    const years = [2024];
    // Zero-debt company: no interest expense → sanity check must NOT fire
    const income = { 2024: { interest_expense: 0 } };
    const balance = { 2024: {
      liabilities: 5000000000,       // $5B total liabilities (all leases + accruals)
      short_term_debt: 0,
      current_portion_lt_debt: 0,
      long_term_debt: 0,             // $0 total_debt → 0% of liabilities
      accounts_payable: 500000000,
      accrued_liabilities: 800000000,
      operating_lease_liability_current: 400000000,
      operating_lease_liability_noncurrent: 2000000000,
      deferred_revenue_current: 300000000,
      other_current_liabilities: 200000000,
    }};
    const cashFlow = { 2024: {} };

    computeDerivedFields(years, income, balance, cashFlow);

    // Without the interest expense gate, the sanity check would fire and derive
    // a false debt value from unclassified liabilities. With the gate, total_debt stays $0.
    expect(balance[2024].total_debt).toBe(0);
  });

  it('Fix 3c: debt sanity check — skips fallback when interest_expense is null', () => {
    const years = [2024];
    // Company with no interest_expense tag at all → sanity check must NOT fire
    const income = { 2024: {} };
    const balance = { 2024: {
      liabilities: 5000000000,
      short_term_debt: 0,
      long_term_debt: 0,
      accounts_payable: 500000000,
    }};
    const cashFlow = { 2024: {} };

    computeDerivedFields(years, income, balance, cashFlow);

    expect(balance[2024].total_debt).toBe(0);
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

// ─── Residual "Other" computation with 95% precondition gate ────────────────
describe('Residual Other computation', () => {
  it('computes OtherCL when named item coverage >= 95%', () => {
    const years = [2024];
    const income = { 2024: {} };
    const balance = { 2024: {
      current_liabilities: 50000000000,       // $50B total CL
      accounts_payable: 10000000000,          // $10B
      accrued_liabilities: 8000000000,        // $8B
      short_term_debt: 5000000000,            // $5B
      current_portion_lt_debt: 3000000000,    // $3B
      operating_lease_liability_current: 2000000000, // $2B
      finance_lease_liability_current: 1000000000,   // $1B
      deferred_revenue_current: 4000000000,   // $4B
      taxes_payable: 2000000000,              // $2B
      // Named sum = 10+8+5+3+2+1+4+2 = $35B
      // Residual = 50 - 35 = $15B
    }};
    const cashFlow = { 2024: {} };

    computeDerivedFields(years, income, balance, cashFlow);

    expect(balance[2024].other_current_liabilities).toBe(15000000000);
  });

  it('does NOT compute OtherCL when coverage < 95%', () => {
    const years = [2024];
    const income = { 2024: {} };
    const balance = { 2024: {
      current_liabilities: 50000000000,       // $50B total CL
      accounts_payable: 10000000000,          // Only 3 of 8 named items present = 37.5%
      accrued_liabilities: 8000000000,
      short_term_debt: 5000000000,
      // Missing: current_portion_lt_debt, operating_lease_liability_current,
      //          finance_lease_liability_current, deferred_revenue_current, taxes_payable
    }};
    const cashFlow = { 2024: {} };

    computeDerivedFields(years, income, balance, cashFlow);

    expect(balance[2024].other_current_liabilities).toBeUndefined();
  });

  it('does NOT set negative OtherCL (overcounting guard)', () => {
    const years = [2024];
    const income = { 2024: {} };
    const balance = { 2024: {
      current_liabilities: 20000000000,       // $20B total CL
      accounts_payable: 10000000000,          // Named items sum to $45B > $20B CL
      accrued_liabilities: 8000000000,
      short_term_debt: 5000000000,
      current_portion_lt_debt: 3000000000,
      operating_lease_liability_current: 2000000000,
      finance_lease_liability_current: 1000000000,
      deferred_revenue_current: 10000000000,
      taxes_payable: 6000000000,
    }};
    const cashFlow = { 2024: {} };

    computeDerivedFields(years, income, balance, cashFlow);

    expect(balance[2024].other_current_liabilities).toBeUndefined();
  });

  it('sets OtherCL = 0 when named items exactly sum to current_liabilities', () => {
    const years = [2024];
    const income = { 2024: {} };
    const balance = { 2024: {
      current_liabilities: 35000000000,       // $35B = exact sum of named items
      accounts_payable: 10000000000,
      accrued_liabilities: 8000000000,
      short_term_debt: 5000000000,
      current_portion_lt_debt: 3000000000,
      operating_lease_liability_current: 2000000000,
      finance_lease_liability_current: 1000000000,
      deferred_revenue_current: 4000000000,
      taxes_payable: 2000000000,
    }};
    const cashFlow = { 2024: {} };

    computeDerivedFields(years, income, balance, cashFlow);

    expect(balance[2024].other_current_liabilities).toBe(0);
  });

  it('does not overwrite existing OtherCL from XBRL tag', () => {
    const years = [2024];
    const income = { 2024: {} };
    const balance = { 2024: {
      current_liabilities: 50000000000,
      other_current_liabilities: 12000000000, // Already has a value from direct XBRL extraction
      accounts_payable: 10000000000,
      accrued_liabilities: 8000000000,
      short_term_debt: 5000000000,
      current_portion_lt_debt: 3000000000,
      operating_lease_liability_current: 2000000000,
      finance_lease_liability_current: 1000000000,
      deferred_revenue_current: 4000000000,
      taxes_payable: 2000000000,
    }};
    const cashFlow = { 2024: {} };

    computeDerivedFields(years, income, balance, cashFlow);

    // Existing value must NOT be overwritten
    expect(balance[2024].other_current_liabilities).toBe(12000000000);
  });

  it('computes OtherIncomeExpense when components available', () => {
    const years = [2024];
    const income = { 2024: {
      income_before_tax: 15000000000,         // $15B pretax
      operating_income_loss: 12000000000,     // $12B operating
      interest_income: 500000000,             // $500M interest income
      interest_expense: 800000000,            // $800M interest expense
      // OtherIncomeExpense = 15B - 12B - 0.5B + 0.8B = $3.3B
    }};
    const balance = { 2024: {} };
    const cashFlow = { 2024: {} };

    computeDerivedFields(years, income, balance, cashFlow);

    expect(income[2024].other_income_expense).toBe(3300000000);
  });

  it('does not overwrite existing OtherIncomeExpense from XBRL tag', () => {
    const years = [2024];
    const income = { 2024: {
      income_before_tax: 15000000000,
      operating_income_loss: 12000000000,
      interest_income: 500000000,
      interest_expense: 800000000,
      other_income_expense: 2000000000,       // Existing value from XBRL
    }};
    const balance = { 2024: {} };
    const cashFlow = { 2024: {} };

    computeDerivedFields(years, income, balance, cashFlow);

    // Existing value must NOT be overwritten
    expect(income[2024].other_income_expense).toBe(2000000000);
  });

  it('coverage gate counts only the 8 named CL items', () => {
    // Even if balance sheet has many other fields, only the 8 CL-specific items matter
    const years = [2024];
    const income = { 2024: {} };
    const balance = { 2024: {
      current_liabilities: 50000000000,
      // Lots of non-CL fields present
      assets: 100000000000,
      equity: 40000000000,
      goodwill: 5000000000,
      liabilities: 60000000000,
      // But only 6 of 8 CL named items = 75% coverage (below 95%)
      accounts_payable: 10000000000,
      accrued_liabilities: 8000000000,
      short_term_debt: 5000000000,
      current_portion_lt_debt: 3000000000,
      operating_lease_liability_current: 2000000000,
      finance_lease_liability_current: 1000000000,
      // Missing: deferred_revenue_current, taxes_payable
    }};
    const cashFlow = { 2024: {} };

    computeDerivedFields(years, income, balance, cashFlow);

    // 6/8 = 75% < 95% — should NOT compute residual
    expect(balance[2024].other_current_liabilities).toBeUndefined();
  });
});

// ─── Investment flow component summation ─────────────────────────────────────

describe('Investment flow component summation', () => {
  it('sale_of_investments uses component sum when aggregate is null and AFS + maturity + STI + equity components present', () => {
    const years = [2024];
    const income = { 2024: {} };
    const balance = { 2024: {} };
    const cashFlow = { 2024: {
      sale_of_investments: null,
      sale_of_investments_afs: 5000000000,
      sale_of_investments_maturity: 3000000000,
      sale_of_investments_sti: 1000000000,
      sale_of_investments_equity: 2000000000,
    }};

    computeDerivedFields(years, income, balance, cashFlow);

    // 5B + 3B + 1B + 2B = 11B
    expect(cashFlow[2024].sale_of_investments).toBe(11000000000);
  });

  it('sale_of_investments uses component sum when it exceeds aggregate by >5%', () => {
    const years = [2024];
    const income = { 2024: {} };
    const balance = { 2024: {} };
    const cashFlow = { 2024: {
      sale_of_investments: 5000000000,  // partial aggregate
      sale_of_investments_afs: 5000000000,
      sale_of_investments_maturity: 3000000000,
      sale_of_investments_sti: 1000000000,
      sale_of_investments_equity: 2000000000,
    }};

    computeDerivedFields(years, income, balance, cashFlow);

    // Component sum 11B > 5B * 1.05 = 5.25B → use component sum
    expect(cashFlow[2024].sale_of_investments).toBe(11000000000);
  });

  it('sale_of_investments includes ProceedsFromSaleOfDebtSecurities as aggregate tag', () => {
    const saleField = CASHFLOW_TAXONOMY.find(f => f.field === 'sale_of_investments');
    expect(saleField).toBeDefined();
    expect(saleField.tags).toContain('ProceedsFromSaleOfDebtSecurities');
  });

  it('purchase_of_investments includes PaymentsToAcquireOtherInvestments as aggregate tag', () => {
    const purchaseField = CASHFLOW_TAXONOMY.find(f => f.field === 'purchase_of_investments');
    expect(purchaseField).toBeDefined();
    expect(purchaseField.tags).toContain('PaymentsToAcquireOtherInvestments');
  });

  it('purchase_of_investments component sum includes equity investments component', () => {
    const years = [2024];
    const income = { 2024: {} };
    const balance = { 2024: {} };
    const cashFlow = { 2024: {
      purchase_of_investments: null,
      purchase_of_investments_afs: -4000000000,
      purchase_of_investments_htm: -2000000000,
      purchase_of_investments_sti: -1000000000,
      purchase_of_investments_equity: -3000000000,
    }};

    computeDerivedFields(years, income, balance, cashFlow);

    // abs(4B) + abs(2B) + abs(1B) + abs(3B) = 10B → stored as positive or negative per convention
    // Since purchase_of_investments was null, sign convention defaults to positive componentSum
    expect(Math.abs(cashFlow[2024].purchase_of_investments)).toBe(10000000000);
  });

  it('both investment summation paths preserve sign convention', () => {
    const years = [2024];
    const income = { 2024: {} };
    const balance = { 2024: {} };
    const cashFlow = { 2024: {
      sale_of_investments: null,
      sale_of_investments_afs: 5000000000,
      sale_of_investments_maturity: 0,
      sale_of_investments_sti: 0,
      sale_of_investments_equity: 1000000000,
      purchase_of_investments: -100,  // existing negative
      purchase_of_investments_afs: -4000000000,
      purchase_of_investments_htm: -2000000000,
      purchase_of_investments_sti: 0,
      purchase_of_investments_equity: -1000000000,
    }};

    computeDerivedFields(years, income, balance, cashFlow);

    // Sale should be positive (proceeds)
    expect(cashFlow[2024].sale_of_investments).toBe(6000000000);
    // Purchase should be negative (was negative before override)
    expect(cashFlow[2024].purchase_of_investments).toBe(-7000000000);
  });
});

// ─── Debt tag coverage and summation ─────────────────────────────────────────

describe('Debt tag coverage and summation', () => {
  it('short_term_debt component summation includes notes_payable_current alongside commercial_paper and short_term_borrowings', () => {
    // When short_term_debt aggregate tag (DebtCurrent) is null but component fields exist
    const years = [2024];
    const income = { 2024: {} };
    const balance = { 2024: {
      short_term_debt: null,
      commercial_paper: 6000000000,
      short_term_borrowings: 2000000000,
      notes_payable_current: 3000000000,
    }};
    const cashFlow = { 2024: {} };

    computeDerivedFields(years, income, balance, cashFlow);

    // 6B + 2B + 3B = 11B
    expect(balance[2024].short_term_debt).toBe(11000000000);
  });

  it('short_term_debt summation result = commercial_paper + short_term_borrowings + notes_payable_current when all present', () => {
    const years = [2024];
    const income = { 2024: {} };
    const balance = { 2024: {
      short_term_debt: 5000000000,  // aggregate is lower than component sum
      commercial_paper: 4000000000,
      short_term_borrowings: 3000000000,
      notes_payable_current: 2000000000,
    }};
    const cashFlow = { 2024: {} };

    computeDerivedFields(years, income, balance, cashFlow);

    // Component sum 9B > aggregate 5B → use component sum
    expect(balance[2024].short_term_debt).toBe(9000000000);
  });

  it('long_term_debt resolves from ConvertibleDebt tag when primary tags are null', () => {
    const ltDebtField = BALANCE_TAXONOMY.find(f => f.field === 'long_term_debt');
    expect(ltDebtField).toBeDefined();
    expect(ltDebtField.tags).toContain('ConvertibleDebt');
    expect(ltDebtField.tags).toContain('ConvertibleLongTermNotesPayable');
  });

  it('short_term_debt resolves from NotesPayable tag as additional fallback', () => {
    const stdField = BALANCE_TAXONOMY.find(f => f.field === 'short_term_debt');
    expect(stdField).toBeDefined();
    expect(stdField.tags).toContain('NotesPayable');
    expect(stdField.tags).toContain('BankOverdrafts');
  });

  it('component summation does NOT double-count when DebtCurrent already includes components', () => {
    // If DebtCurrent (15.6B) already includes all sub-components, component sum should NOT override
    const years = [2024];
    const income = { 2024: {} };
    const balance = { 2024: {
      short_term_debt: 15600000000,  // DebtCurrent, already comprehensive
      commercial_paper: 6000000000,
      short_term_borrowings: 4000000000,
      notes_payable_current: null,
    }};
    const cashFlow = { 2024: {} };

    computeDerivedFields(years, income, balance, cashFlow);

    // Component sum 10B < aggregate 15.6B → keep aggregate
    expect(balance[2024].short_term_debt).toBe(15600000000);
  });
});

// ─── TTM Q4 Bug: When latest filing is 10-K, TTM should equal annual ────────
// Bug: findLatestQuarter only looks at 10-Q filings (Q1/Q2/Q3), so when the
// latest data is a 10-K (Q4/FY), TTM uses stale Q3 data instead of annual values.
describe('TTM Q4 bug: TTM should equal annual when 10-K is latest filing', () => {
  // Simulate a company (like CMG, Dec FY) where:
  //   - FY2024 10-K filed (annual data for full year)
  //   - FY2025 10-K filed (annual data for full year) ← latest filing
  //   - Q1/Q2/Q3 of FY2025 10-Qs also exist
  //   - No Q1 of FY2026 yet
  // TTM should = FY2025 annual, not a stale Q3-based computation.
  function buildMockFacts() {
    return {
      facts: {
        'us-gaap': {
          // ── Income: Revenue ──
          Revenues: {
            units: {
              USD: [
                // FY2024 10-K annual
                { val: 10000000000, form: '10-K', fp: 'FY', fy: 2024, end: '2024-12-31', filed: '2025-02-20' },
                // FY2025 quarterly 10-Qs (YTD cumulative)
                { val: 2800000000, form: '10-Q', fp: 'Q1', fy: 2025, end: '2025-03-31', start: '2025-01-01', filed: '2025-05-01' },
                { val: 5700000000, form: '10-Q', fp: 'Q2', fy: 2025, end: '2025-06-30', start: '2025-01-01', filed: '2025-08-01' },
                { val: 8800000000, form: '10-Q', fp: 'Q3', fy: 2025, end: '2025-09-30', start: '2025-01-01', filed: '2025-11-01' },
                // FY2024 comparative YTDs in Q filings
                { val: 2500000000, form: '10-Q', fp: 'Q1', fy: 2024, end: '2024-03-31', start: '2024-01-01', filed: '2024-05-01' },
                { val: 5100000000, form: '10-Q', fp: 'Q2', fy: 2024, end: '2024-06-30', start: '2024-01-01', filed: '2024-08-01' },
                { val: 7600000000, form: '10-Q', fp: 'Q3', fy: 2024, end: '2024-09-30', start: '2024-01-01', filed: '2024-11-01' },
                // FY2025 10-K annual ← THE KEY: this is the latest filing
                { val: 12000000000, form: '10-K', fp: 'FY', fy: 2025, end: '2025-12-31', filed: '2026-02-20' },
              ]
            }
          },
          // ── Income: Net Income ──
          NetIncomeLoss: {
            units: {
              USD: [
                { val: 1500000000, form: '10-K', fp: 'FY', fy: 2024, end: '2024-12-31', filed: '2025-02-20' },
                { val: 400000000, form: '10-Q', fp: 'Q1', fy: 2025, end: '2025-03-31', start: '2025-01-01', filed: '2025-05-01' },
                { val: 850000000, form: '10-Q', fp: 'Q2', fy: 2025, end: '2025-06-30', start: '2025-01-01', filed: '2025-08-01' },
                { val: 1300000000, form: '10-Q', fp: 'Q3', fy: 2025, end: '2025-09-30', start: '2025-01-01', filed: '2025-11-01' },
                { val: 350000000, form: '10-Q', fp: 'Q1', fy: 2024, end: '2024-03-31', start: '2024-01-01', filed: '2024-05-01' },
                { val: 750000000, form: '10-Q', fp: 'Q2', fy: 2024, end: '2024-06-30', start: '2024-01-01', filed: '2024-08-01' },
                { val: 1100000000, form: '10-Q', fp: 'Q3', fy: 2024, end: '2024-09-30', start: '2024-01-01', filed: '2024-11-01' },
                { val: 1800000000, form: '10-K', fp: 'FY', fy: 2025, end: '2025-12-31', filed: '2026-02-20' },
              ]
            }
          },
          // ── Balance Sheet: Total Assets (instant) ──
          Assets: {
            units: {
              USD: [
                { val: 8000000000, form: '10-K', fp: 'FY', fy: 2024, end: '2024-12-31', filed: '2025-02-20' },
                { val: 8200000000, form: '10-Q', fp: 'Q1', fy: 2025, end: '2025-03-31', filed: '2025-05-01' },
                { val: 8500000000, form: '10-Q', fp: 'Q2', fy: 2025, end: '2025-06-30', filed: '2025-08-01' },
                { val: 8800000000, form: '10-Q', fp: 'Q3', fy: 2025, end: '2025-09-30', filed: '2025-11-01' },
                // FY2025 10-K: total assets at year-end
                { val: 9000000000, form: '10-K', fp: 'FY', fy: 2025, end: '2025-12-31', filed: '2026-02-20' },
              ]
            }
          },
          // ── Cash Flow: Operating CF ──
          NetCashProvidedByUsedInOperatingActivities: {
            units: {
              USD: [
                { val: 2000000000, form: '10-K', fp: 'FY', fy: 2024, end: '2024-12-31', filed: '2025-02-20' },
                { val: 600000000, form: '10-Q', fp: 'Q1', fy: 2025, end: '2025-03-31', start: '2025-01-01', filed: '2025-05-01' },
                { val: 1200000000, form: '10-Q', fp: 'Q2', fy: 2025, end: '2025-06-30', start: '2025-01-01', filed: '2025-08-01' },
                { val: 1800000000, form: '10-Q', fp: 'Q3', fy: 2025, end: '2025-09-30', start: '2025-01-01', filed: '2025-11-01' },
                { val: 500000000, form: '10-Q', fp: 'Q1', fy: 2024, end: '2024-03-31', start: '2024-01-01', filed: '2024-05-01' },
                { val: 1000000000, form: '10-Q', fp: 'Q2', fy: 2024, end: '2024-06-30', start: '2024-01-01', filed: '2024-08-01' },
                { val: 1500000000, form: '10-Q', fp: 'Q3', fy: 2024, end: '2024-09-30', start: '2024-01-01', filed: '2024-11-01' },
                { val: 2500000000, form: '10-K', fp: 'FY', fy: 2025, end: '2025-12-31', filed: '2026-02-20' },
              ]
            }
          },
        }
      }
    };
  }

  it('TTM revenue should equal FY2025 annual when 10-K is latest filing', () => {
    const facts = buildMockFacts();
    // Q4 case: latest 10-K (end 2025-12-31) is newer than latest 10-Q Q3 (end 2025-09-30)
    const ttm = computeTTM(facts, { fy: 2025, fp: 'FY', end: '2025-12-31' });
    expect(ttm).not.toBeNull();
    expect(ttm.income.revenues).toBe(12000000000);
  });

  it('TTM net income should equal FY2025 annual when 10-K is latest filing', () => {
    const facts = buildMockFacts();
    const ttm = computeTTM(facts, { fy: 2025, fp: 'FY', end: '2025-12-31' });
    expect(ttm.income.net_income_loss).toBe(1800000000);
  });

  it('TTM total assets (balance sheet) should equal FY2025 10-K instant value', () => {
    const facts = buildMockFacts();
    const ttm = computeTTM(facts, { fy: 2025, fp: 'FY', end: '2025-12-31' });
    expect(ttm.balance.assets).toBe(9000000000);
  });

  it('TTM operating cash flow should equal FY2025 annual when 10-K is latest filing', () => {
    const facts = buildMockFacts();
    const ttm = computeTTM(facts, { fy: 2025, fp: 'FY', end: '2025-12-31' });
    expect(ttm.cashFlow.net_cash_flow_from_operating_activities).toBe(2500000000);
  });

  it('TTM quarter label should indicate FY (not Q3)', () => {
    const facts = buildMockFacts();
    const ttm = computeTTM(facts, { fy: 2025, fp: 'FY', end: '2025-12-31' });
    expect(ttm.quarter).toContain('FY');
    expect(ttm.quarter).toContain('2025');
  });
});

// ─── Residual Other computation ───────────────────────────────────────────

describe('Residual Other computation: OtherCurrentLiabilities', () => {
  it('computes OtherCL when 8/8 named CL items present (coverage >= 95%)', () => {
    const years = [2024];
    const income = { 2024: {} };
    const balance = { 2024: {
      current_liabilities: 20000000000,
      accounts_payable: 5000000000,
      accrued_liabilities: 3000000000,
      short_term_debt: 2000000000,
      current_portion_lt_debt: 1000000000,
      operating_lease_liability_current: 500000000,
      finance_lease_liability_current: 200000000,
      deferred_revenue_current: 1500000000,
      taxes_payable: 800000000,
    }};
    const cashFlow = { 2024: {} };

    computeDerivedFields(years, income, balance, cashFlow);

    // named sum = 5+3+2+1+0.5+0.2+1.5+0.8 = 14B, residual = 20 - 14 = 6B
    expect(balance[2024].other_current_liabilities).toBe(6000000000);
  });

  it('does NOT compute OtherCL when coverage < 95% (6/8 items)', () => {
    const years = [2024];
    const income = { 2024: {} };
    const balance = { 2024: {
      current_liabilities: 20000000000,
      accounts_payable: 5000000000,
      accrued_liabilities: 3000000000,
      short_term_debt: 2000000000,
      current_portion_lt_debt: 1000000000,
      operating_lease_liability_current: 500000000,
      finance_lease_liability_current: 200000000,
      // missing: deferred_revenue_current, taxes_payable (6/8 = 75%)
    }};
    const cashFlow = { 2024: {} };

    computeDerivedFields(years, income, balance, cashFlow);

    expect(balance[2024].other_current_liabilities).toBeUndefined();
  });

  it('sets OtherCL to null when residual is negative (overcounting guard)', () => {
    const years = [2024];
    const income = { 2024: {} };
    const balance = { 2024: {
      current_liabilities: 10000000000,
      accounts_payable: 5000000000,
      accrued_liabilities: 3000000000,
      short_term_debt: 2000000000,
      current_portion_lt_debt: 1000000000,
      operating_lease_liability_current: 500000000,
      finance_lease_liability_current: 200000000,
      deferred_revenue_current: 1500000000,
      taxes_payable: 800000000,
      // named sum = 14B > current_liabilities 10B → negative residual
    }};
    const cashFlow = { 2024: {} };

    computeDerivedFields(years, income, balance, cashFlow);

    expect(balance[2024].other_current_liabilities).toBeUndefined();
  });

  it('preserves existing XBRL value for OtherCL (no-overwrite)', () => {
    const years = [2024];
    const income = { 2024: {} };
    const balance = { 2024: {
      current_liabilities: 20000000000,
      other_current_liabilities: 999000000, // existing XBRL value
      accounts_payable: 5000000000,
      accrued_liabilities: 3000000000,
      short_term_debt: 2000000000,
      current_portion_lt_debt: 1000000000,
      operating_lease_liability_current: 500000000,
      finance_lease_liability_current: 200000000,
      deferred_revenue_current: 1500000000,
      taxes_payable: 800000000,
    }};
    const cashFlow = { 2024: {} };

    computeDerivedFields(years, income, balance, cashFlow);

    expect(balance[2024].other_current_liabilities).toBe(999000000);
  });
});

describe('Residual Other computation: OtherNonCurrentAssets', () => {
  it('computes OtherNCA when 5/5 named NCA items present (coverage >= 95%)', () => {
    const years = [2024];
    const income = { 2024: {} };
    const balance = { 2024: {
      assets: 100000000000,
      current_assets: 40000000000,
      // noncurrent_assets will be derived as 100 - 40 = 60B
      property_plant_equipment: 20000000000, // post-ROU-merge (no operating_lease_rou_asset to merge)
      goodwill: 10000000000,
      intangible_assets: 5000000000,
      long_term_investments: 8000000000,
      deferred_tax_assets: 2000000000,
    }};
    const cashFlow = { 2024: {} };

    computeDerivedFields(years, income, balance, cashFlow);

    // noncurrent_assets = 100 - 40 = 60B
    // named sum = 20 + 10 + 5 + 8 + 2 = 45B
    // residual = 60 - 45 = 15B
    expect(balance[2024].other_noncurrent_assets).toBe(15000000000);
  });

  it('does NOT compute OtherNCA when coverage < 95% (3/5 items)', () => {
    const years = [2024];
    const income = { 2024: {} };
    const balance = { 2024: {
      assets: 100000000000,
      current_assets: 40000000000,
      property_plant_equipment: 20000000000,
      goodwill: 10000000000,
      intangible_assets: 5000000000,
      // missing: long_term_investments, deferred_tax_assets (3/5 = 60%)
    }};
    const cashFlow = { 2024: {} };

    computeDerivedFields(years, income, balance, cashFlow);

    expect(balance[2024].other_noncurrent_assets).toBeUndefined();
  });

  it('sets OtherNCA to null when residual is negative (overcounting guard)', () => {
    const years = [2024];
    const income = { 2024: {} };
    const balance = { 2024: {
      assets: 50000000000,
      current_assets: 40000000000,
      // noncurrent_assets = 10B
      property_plant_equipment: 5000000000,
      goodwill: 3000000000,
      intangible_assets: 2000000000,
      long_term_investments: 4000000000,
      deferred_tax_assets: 1000000000,
      // named sum = 15B > noncurrent_assets 10B → negative
    }};
    const cashFlow = { 2024: {} };

    computeDerivedFields(years, income, balance, cashFlow);

    expect(balance[2024].other_noncurrent_assets).toBeUndefined();
  });

  it('preserves existing XBRL value for OtherNCA (no-overwrite)', () => {
    const years = [2024];
    const income = { 2024: {} };
    const balance = { 2024: {
      assets: 100000000000,
      current_assets: 40000000000,
      other_noncurrent_assets: 888000000, // existing XBRL value
      property_plant_equipment: 20000000000,
      goodwill: 10000000000,
      intangible_assets: 5000000000,
      long_term_investments: 8000000000,
      deferred_tax_assets: 2000000000,
    }};
    const cashFlow = { 2024: {} };

    computeDerivedFields(years, income, balance, cashFlow);

    expect(balance[2024].other_noncurrent_assets).toBe(888000000);
  });
});

describe('Residual Other computation: OtherNonCurrentLiabilities', () => {
  it('computes OtherNCL when 6/6 named NCL items present (coverage >= 95%)', () => {
    const years = [2024];
    const income = { 2024: {} };
    const balance = { 2024: {
      liabilities: 50000000000,
      current_liabilities: 15000000000,
      // noncurrent_liabilities will be derived as 50 - 15 = 35B
      long_term_debt: 10000000000,
      operating_lease_liability_noncurrent: 4000000000,
      finance_lease_liability_noncurrent: 1000000000,
      deferred_tax_liabilities: 3000000000,
      pension_liabilities: 2000000000,
      deferred_revenue_noncurrent: 500000000,
    }};
    const cashFlow = { 2024: {} };

    computeDerivedFields(years, income, balance, cashFlow);

    // noncurrent_liabilities = 50 - 15 = 35B
    // named sum = 10 + 4 + 1 + 3 + 2 + 0.5 = 20.5B
    // residual = 35 - 20.5 = 14.5B
    expect(balance[2024].other_noncurrent_liabilities).toBe(14500000000);
  });

  it('does NOT compute OtherNCL when coverage < 95% (3/6 items)', () => {
    const years = [2024];
    const income = { 2024: {} };
    const balance = { 2024: {
      liabilities: 50000000000,
      current_liabilities: 15000000000,
      long_term_debt: 10000000000,
      operating_lease_liability_noncurrent: 4000000000,
      finance_lease_liability_noncurrent: 1000000000,
      // missing: deferred_tax_liabilities, pension_liabilities, deferred_revenue_noncurrent (3/6 = 50%)
    }};
    const cashFlow = { 2024: {} };

    computeDerivedFields(years, income, balance, cashFlow);

    expect(balance[2024].other_noncurrent_liabilities).toBeUndefined();
  });

  it('sets OtherNCL to null when residual is negative (overcounting guard)', () => {
    const years = [2024];
    const income = { 2024: {} };
    const balance = { 2024: {
      liabilities: 20000000000,
      current_liabilities: 15000000000,
      // noncurrent_liabilities = 5B
      long_term_debt: 3000000000,
      operating_lease_liability_noncurrent: 2000000000,
      finance_lease_liability_noncurrent: 1000000000,
      deferred_tax_liabilities: 1500000000,
      pension_liabilities: 500000000,
      deferred_revenue_noncurrent: 200000000,
      // named sum = 8.2B > noncurrent_liabilities 5B → negative
    }};
    const cashFlow = { 2024: {} };

    computeDerivedFields(years, income, balance, cashFlow);

    expect(balance[2024].other_noncurrent_liabilities).toBeUndefined();
  });

  it('preserves existing XBRL value for OtherNCL (no-overwrite)', () => {
    const years = [2024];
    const income = { 2024: {} };
    const balance = { 2024: {
      liabilities: 50000000000,
      current_liabilities: 15000000000,
      other_noncurrent_liabilities: 777000000, // existing XBRL value
      long_term_debt: 10000000000,
      operating_lease_liability_noncurrent: 4000000000,
      finance_lease_liability_noncurrent: 1000000000,
      deferred_tax_liabilities: 3000000000,
      pension_liabilities: 2000000000,
      deferred_revenue_noncurrent: 500000000,
    }};
    const cashFlow = { 2024: {} };

    computeDerivedFields(years, income, balance, cashFlow);

    expect(balance[2024].other_noncurrent_liabilities).toBe(777000000);
  });
});

describe('Residual Other computation: OtherCurrentAssets', () => {
  it('computes OtherCA when 5/5 named CA items present (coverage >= 95%)', () => {
    const years = [2024];
    const income = { 2024: {} };
    const balance = { 2024: {
      current_assets: 30000000000,
      cash: 10000000000,
      short_term_investments: 5000000000,
      accounts_receivable: 4000000000,
      inventory: 3000000000,
      prepaid_expenses: 1000000000,
    }};
    const cashFlow = { 2024: {} };

    computeDerivedFields(years, income, balance, cashFlow);

    // named sum = 10 + 5 + 4 + 3 + 1 = 23B
    // residual = 30 - 23 = 7B
    expect(balance[2024].other_current_assets).toBe(7000000000);
  });

  it('does NOT compute OtherCA when coverage < 95% (3/5 items)', () => {
    const years = [2024];
    const income = { 2024: {} };
    const balance = { 2024: {
      current_assets: 30000000000,
      cash: 10000000000,
      short_term_investments: 5000000000,
      accounts_receivable: 4000000000,
      // missing: inventory, prepaid_expenses (3/5 = 60%)
    }};
    const cashFlow = { 2024: {} };

    computeDerivedFields(years, income, balance, cashFlow);

    expect(balance[2024].other_current_assets).toBeUndefined();
  });

  it('sets OtherCA to null when residual is negative (overcounting guard)', () => {
    const years = [2024];
    const income = { 2024: {} };
    const balance = { 2024: {
      current_assets: 15000000000,
      cash: 10000000000,
      short_term_investments: 5000000000,
      accounts_receivable: 4000000000,
      inventory: 3000000000,
      prepaid_expenses: 1000000000,
      // named sum = 23B > current_assets 15B → negative
    }};
    const cashFlow = { 2024: {} };

    computeDerivedFields(years, income, balance, cashFlow);

    expect(balance[2024].other_current_assets).toBeUndefined();
  });

  it('preserves existing XBRL value for OtherCA (no-overwrite)', () => {
    const years = [2024];
    const income = { 2024: {} };
    const balance = { 2024: {
      current_assets: 30000000000,
      other_current_assets: 666000000, // existing XBRL value
      cash: 10000000000,
      short_term_investments: 5000000000,
      accounts_receivable: 4000000000,
      inventory: 3000000000,
      prepaid_expenses: 1000000000,
    }};
    const cashFlow = { 2024: {} };

    computeDerivedFields(years, income, balance, cashFlow);

    expect(balance[2024].other_current_assets).toBe(666000000);
  });
});

// ─── Plan 07: Per-field tag additions for gap closure ───────────────────

describe('Plan 07: accounts_receivable broader fallback tag', () => {
  it('should include AccountsNotesAndLoansReceivableNetCurrent as last fallback', () => {
    const field = BALANCE_TAXONOMY.find(f => f.field === 'accounts_receivable');
    expect(field).toBeDefined();
    expect(field.tags).toContain('AccountsNotesAndLoansReceivableNetCurrent');
  });

  it('should prefer narrow AccountsReceivableNetCurrent over broader fallback', () => {
    const field = BALANCE_TAXONOMY.find(f => f.field === 'accounts_receivable');
    const narrowIdx = field.tags.indexOf('AccountsReceivableNetCurrent');
    const broadIdx = field.tags.indexOf('AccountsNotesAndLoansReceivableNetCurrent');
    expect(narrowIdx).toBeLessThan(broadIdx);
  });

  it('should resolve accounts_receivable via broad fallback when narrow tags absent', () => {
    extractAnnualFact.mockReset();
    extractAnnualFact.mockImplementation((_facts, tag, _unit) => {
      if (tag === 'AccountsNotesAndLoansReceivableNetCurrent') return { 2024: 8500000000 };
      return null;
    });

    const taxonomy = [
      { field: 'accounts_receivable', unit: 'USD', tags: [
        'AccountsReceivableNetCurrent',
        'ReceivablesNetCurrent',
        'AccountsReceivableNet',
        'AccountsNotesAndLoansReceivableNetCurrent',
      ]},
    ];

    const { fieldData } = extractSection({}, taxonomy, 'restated');
    expect(fieldData.accounts_receivable[2024]).toBe(8500000000);
  });
});

describe('Plan 07: deferred_revenue_current additional tags', () => {
  it('should include CustomerDepositsCurrent tag', () => {
    const field = BALANCE_TAXONOMY.find(f => f.field === 'deferred_revenue_current');
    expect(field).toBeDefined();
    expect(field.tags).toContain('CustomerDepositsCurrent');
  });

  it('should include DeferredIncomeCurrent tag', () => {
    const field = BALANCE_TAXONOMY.find(f => f.field === 'deferred_revenue_current');
    expect(field.tags).toContain('DeferredIncomeCurrent');
  });

  it('should prefer DeferredRevenueCurrent over new fallbacks', () => {
    const field = BALANCE_TAXONOMY.find(f => f.field === 'deferred_revenue_current');
    const primaryIdx = field.tags.indexOf('DeferredRevenueCurrent');
    const depositsIdx = field.tags.indexOf('CustomerDepositsCurrent');
    const deferredIncIdx = field.tags.indexOf('DeferredIncomeCurrent');
    expect(primaryIdx).toBeLessThan(depositsIdx);
    expect(primaryIdx).toBeLessThan(deferredIncIdx);
  });
});

describe('Plan 07: short_term_investments additional tags', () => {
  it('should include OtherShortTermInvestments tag', () => {
    const field = BALANCE_TAXONOMY.find(f => f.field === 'short_term_investments');
    expect(field).toBeDefined();
    expect(field.tags).toContain('OtherShortTermInvestments');
  });

  it('should include HeldToMaturitySecuritiesCurrent tag', () => {
    const field = BALANCE_TAXONOMY.find(f => f.field === 'short_term_investments');
    expect(field.tags).toContain('HeldToMaturitySecuritiesCurrent');
  });
});

describe('Plan 07: minority_interest additional tag', () => {
  it('should include RedeemableNoncontrollingInterest as fallback', () => {
    const field = BALANCE_TAXONOMY.find(f => f.field === 'minority_interest');
    expect(field).toBeDefined();
    expect(field.tags).toContain('RedeemableNoncontrollingInterest');
  });

  it('should prefer MinorityInterest over redeemable NCI', () => {
    const field = BALANCE_TAXONOMY.find(f => f.field === 'minority_interest');
    const primaryIdx = field.tags.indexOf('MinorityInterest');
    const redeemableIdx = field.tags.indexOf('RedeemableNoncontrollingInterest');
    expect(primaryIdx).toBeLessThan(redeemableIdx);
  });
});

describe('Plan 07: common_stock additional tag', () => {
  it('should include CommonStockValueOutstanding as fallback', () => {
    const field = BALANCE_TAXONOMY.find(f => f.field === 'common_stock');
    expect(field).toBeDefined();
    expect(field.tags).toContain('CommonStockValueOutstanding');
  });

  it('should prefer CommonStockValue over CommonStockValueOutstanding', () => {
    const field = BALANCE_TAXONOMY.find(f => f.field === 'common_stock');
    const primaryIdx = field.tags.indexOf('CommonStockValue');
    const outstandingIdx = field.tags.indexOf('CommonStockValueOutstanding');
    expect(primaryIdx).toBeLessThan(outstandingIdx);
  });
});

// ─── Plan 08: net_change_in_cash excludes FX ─────────────────

describe('net_change_in_cash derivation (Plan 08)', () => {
  it('excludes FX effect from net_change_in_cash', () => {
    const years = [2024];
    const income = { 2024: {} };
    const balance = { 2024: {} };
    const cashFlow = { 2024: {
      net_cash_flow_from_operating_activities: 91652000000,
      net_cash_flow_from_investing_activities: -35523000000,
      net_cash_flow_from_financing_activities: -61362000000,
      effect_of_exchange_rate: -287000000,
    }};

    computeDerivedFields(years, income, balance, cashFlow);

    // Should be Op + Inv + Fin WITHOUT FX
    // 91652 + (-35523) + (-61362) = -5233 (in millions: -5233000000)
    expect(cashFlow[2024].net_change_in_cash).toBe(-5233000000);
  });

  it('does not derive when net_change_in_cash already set', () => {
    const years = [2024];
    const income = { 2024: {} };
    const balance = { 2024: {} };
    const cashFlow = { 2024: {
      net_change_in_cash: -999000000,
      net_cash_flow_from_operating_activities: 91652000000,
      net_cash_flow_from_investing_activities: -35523000000,
      net_cash_flow_from_financing_activities: -61362000000,
      effect_of_exchange_rate: -287000000,
    }};

    computeDerivedFields(years, income, balance, cashFlow);

    // Should keep the pre-existing value
    expect(cashFlow[2024].net_change_in_cash).toBe(-999000000);
  });

  it('getDerivedFormula excludes fx_effect', () => {
    const formula = getDerivedFormula('net_change_in_cash');
    expect(formula).not.toContain('fx');
    expect(formula).toContain('operating_cf');
    expect(formula).toContain('investing_cf');
    expect(formula).toContain('financing_cf');
  });
});
