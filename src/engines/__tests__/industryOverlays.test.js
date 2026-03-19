// Tests for Phase 4: Industry Classifier + Overlays
//
// Tests:
// 1. Industry classifier — SIC code → industry type mapping
// 2. Bank overlay — taxonomy fields + derived metrics (efficiency ratio, NIM, etc.)
// 3. REIT overlay — taxonomy fields + derived metrics (FFO, NOI, NAV)
// 4. Insurance overlay — taxonomy fields + derived metrics (loss ratio, combined ratio, float)
// 5. Overlay integration — merging into base statements without overwriting
// 6. getOverlay selection

import { describe, it, expect } from 'vitest';
import { classifyIndustryType, industryTypeLabel, SIC_INDUSTRY_TYPE } from '../industryClassifier';
import { BANK_OVERLAY, REIT_OVERLAY, INSURANCE_OVERLAY, getOverlay } from '../industryOverlays';

// ─── Industry Classifier ────────────────────────────────────

describe('Phase 4: Industry Classifier', () => {
  it('should classify bank SIC codes', () => {
    expect(classifyIndustryType('6020')).toBe('bank');
    expect(classifyIndustryType('6021')).toBe('bank');
    expect(classifyIndustryType('6022')).toBe('bank');
    expect(classifyIndustryType('6035')).toBe('bank');
    expect(classifyIndustryType('6036')).toBe('bank');
  });

  it('should classify insurance SIC codes', () => {
    expect(classifyIndustryType('6311')).toBe('insurance');
    expect(classifyIndustryType('6321')).toBe('insurance');
    expect(classifyIndustryType('6324')).toBe('insurance');
    expect(classifyIndustryType('6331')).toBe('insurance');
    expect(classifyIndustryType('6399')).toBe('insurance');
  });

  it('should classify REIT SIC codes', () => {
    expect(classifyIndustryType('6512')).toBe('reit');
    expect(classifyIndustryType('6798')).toBe('reit');
  });

  it('should return standard for non-special SIC codes', () => {
    expect(classifyIndustryType('7372')).toBe('standard'); // Software
    expect(classifyIndustryType('3674')).toBe('standard'); // Semiconductors
    expect(classifyIndustryType('5411')).toBe('standard'); // Grocery stores
    expect(classifyIndustryType('2860')).toBe('standard'); // Chemicals
  });

  it('should return standard for financial services that are NOT banks/insurance/REITs', () => {
    expect(classifyIndustryType('6141')).toBe('standard'); // Credit services
    expect(classifyIndustryType('6211')).toBe('standard'); // Securities brokers
    expect(classifyIndustryType('6282')).toBe('standard'); // Investment advice
    expect(classifyIndustryType('6411')).toBe('standard'); // Insurance brokers (not carriers)
    expect(classifyIndustryType('6726')).toBe('standard'); // Conglomerates
  });

  it('should handle null/undefined/empty SIC codes', () => {
    expect(classifyIndustryType(null)).toBe('standard');
    expect(classifyIndustryType(undefined)).toBe('standard');
    expect(classifyIndustryType('')).toBe('standard');
  });

  it('should handle numeric SIC codes', () => {
    expect(classifyIndustryType(6021)).toBe('bank');
    expect(classifyIndustryType(6798)).toBe('reit');
  });

  it('should pad short SIC codes', () => {
    // A 3-digit code would be padded to 0xxx — unlikely to match
    expect(classifyIndustryType('20')).toBe('standard');
  });

  it('should provide human-readable labels', () => {
    expect(industryTypeLabel('bank')).toContain('Bank');
    expect(industryTypeLabel('reit')).toContain('REIT');
    expect(industryTypeLabel('insurance')).toContain('Insurance');
    expect(industryTypeLabel('standard')).toBe('Standard');
    expect(industryTypeLabel('unknown')).toBe('Standard');
  });
});

// ─── Overlay Selection ──────────────────────────────────────

describe('Phase 4: getOverlay', () => {
  it('should return bank overlay for bank type', () => {
    expect(getOverlay('bank')).toBe(BANK_OVERLAY);
  });

  it('should return REIT overlay for reit type', () => {
    expect(getOverlay('reit')).toBe(REIT_OVERLAY);
  });

  it('should return insurance overlay for insurance type', () => {
    expect(getOverlay('insurance')).toBe(INSURANCE_OVERLAY);
  });

  it('should return null for standard type', () => {
    expect(getOverlay('standard')).toBeNull();
  });

  it('should return null for unknown type', () => {
    expect(getOverlay('whatever')).toBeNull();
  });
});

// ─── Bank Overlay ───────────────────────────────────────────

describe('Phase 4: Bank Overlay — taxonomy fields', () => {
  it('should have net interest income tags', () => {
    const nii = BANK_OVERLAY.incomeFields.find(f => f.field === 'net_interest_income_bank');
    expect(nii).toBeDefined();
    expect(nii.tags).toContain('InterestIncomeExpenseNet');
  });

  it('should have provision for credit losses', () => {
    const pcl = BANK_OVERLAY.incomeFields.find(f => f.field === 'provision_for_credit_losses');
    expect(pcl).toBeDefined();
    expect(pcl.tags).toContain('ProvisionForLoanLeaseAndOtherLosses');
  });

  it('should have noninterest income and expense', () => {
    const ni = BANK_OVERLAY.incomeFields.find(f => f.field === 'noninterest_income');
    expect(ni).toBeDefined();
    expect(ni.tags).toContain('NoninterestIncome');

    const nie = BANK_OVERLAY.incomeFields.find(f => f.field === 'noninterest_expense');
    expect(nie).toBeDefined();
    expect(nie.tags).toContain('NoninterestExpense');
  });

  it('should have deposits on balance sheet', () => {
    const dep = BANK_OVERLAY.balanceFields.find(f => f.field === 'deposits');
    expect(dep).toBeDefined();
    expect(dep.tags).toContain('Deposits');
  });

  it('should have loans on balance sheet', () => {
    const loans = BANK_OVERLAY.balanceFields.find(f => f.field === 'loans_net');
    expect(loans).toBeDefined();
    expect(loans.tags.length).toBeGreaterThan(0);
  });
});

describe('Phase 4: Bank Overlay — derived metrics', () => {
  it('should compute efficiency ratio', () => {
    const years = [2024];
    const income = { 2024: {
      net_interest_income_bank: 50000000000,  // $50B NII
      noninterest_income: 30000000000,        // $30B noninterest income
      noninterest_expense: 40000000000,       // $40B noninterest expense
    }};
    const balance = { 2024: {} };
    const cashFlow = { 2024: {} };

    BANK_OVERLAY.computeDerived(years, income, balance, cashFlow);

    // Efficiency ratio = 40B / (50B + 30B) = 50%
    expect(income[2024].efficiency_ratio).toBeCloseTo(50.0, 1);
  });

  it('should compute loan-to-deposit ratio', () => {
    const years = [2024];
    const income = { 2024: {} };
    const balance = { 2024: {
      loans_net: 800000000000,    // $800B loans
      deposits: 1500000000000,    // $1.5T deposits
    }};
    const cashFlow = { 2024: {} };

    BANK_OVERLAY.computeDerived(years, income, balance, cashFlow);

    // L/D ratio = 800B / 1500B = 53.3%
    expect(balance[2024].loan_to_deposit_ratio).toBeCloseTo(53.33, 1);
  });

  it('should compute net interest margin', () => {
    const years = [2024];
    const income = { 2024: {
      net_interest_income_bank: 50000000000, // $50B NII
    }};
    const balance = { 2024: {
      loans_net: 1000000000000,              // $1T loans
      investment_securities: 500000000000,    // $500B securities
      fed_funds_sold: 100000000000,           // $100B fed funds
      interest_bearing_deposits_in_banks: 200000000000, // $200B deposits at banks
    }};
    const cashFlow = { 2024: {} };

    BANK_OVERLAY.computeDerived(years, income, balance, cashFlow);

    // NIM = 50B / (1T + 500B + 100B + 200B) = 50/1800 = 2.78%
    expect(income[2024].net_interest_margin).toBeCloseTo(2.78, 1);
  });

  it('should not compute efficiency ratio when components missing', () => {
    const years = [2024];
    const income = { 2024: {
      noninterest_expense: 40000000000,
      // NII and noninterest income missing
    }};
    const balance = { 2024: {} };
    const cashFlow = { 2024: {} };

    BANK_OVERLAY.computeDerived(years, income, balance, cashFlow);

    expect(income[2024].efficiency_ratio).toBeUndefined();
  });
});

// ─── REIT Overlay ───────────────────────────────────────────

describe('Phase 4: REIT Overlay — taxonomy fields', () => {
  it('should have property operating costs', () => {
    const poc = REIT_OVERLAY.incomeFields.find(f => f.field === 'property_operating_costs');
    expect(poc).toBeDefined();
    expect(poc.tags).toContain('DirectCostsOfLeasedAndRentedPropertyOrEquipment');
  });

  it('should have gain/loss on real estate sales', () => {
    const gains = REIT_OVERLAY.incomeFields.find(f => f.field === 'gain_loss_on_real_estate_sales');
    expect(gains).toBeDefined();
    expect(gains.tags).toContain('GainLossOnSaleOfProperties');
  });

  it('should have real estate investment property on balance sheet', () => {
    const reNet = REIT_OVERLAY.balanceFields.find(f => f.field === 'real_estate_investment_net');
    expect(reNet).toBeDefined();
    expect(reNet.tags).toContain('RealEstateInvestmentPropertyNet');

    const reGross = REIT_OVERLAY.balanceFields.find(f => f.field === 'real_estate_investment_gross');
    expect(reGross).toBeDefined();
  });

  it('should have REIT-specific cash flow fields', () => {
    const acq = REIT_OVERLAY.cashFlowFields.find(f => f.field === 'payments_to_acquire_real_estate');
    expect(acq).toBeDefined();
    expect(acq.tags).toContain('PaymentsToAcquireRealEstate');
  });
});

describe('Phase 4: REIT Overlay — derived metrics', () => {
  it('should compute FFO', () => {
    const years = [2024];
    const income = { 2024: {
      net_income_loss: 2000000000,                // $2B net income
      gain_loss_on_real_estate_sales: 500000000,  // $500M gains on RE sales
      impairment_of_real_estate: 100000000,        // $100M impairment
    }};
    const balance = { 2024: {} };
    const cashFlow = { 2024: {
      depreciation_amortization: 3000000000,       // $3B D&A
    }};

    REIT_OVERLAY.computeDerived(years, income, balance, cashFlow);

    // FFO = 2B + 3B + 100M - 500M = 4.6B
    expect(income[2024].ffo).toBe(4600000000);
  });

  it('should compute NOI', () => {
    const years = [2024];
    const income = { 2024: {
      revenues: 5000000000,                       // $5B revenue
      property_operating_costs: 1500000000,       // $1.5B property costs
    }};
    const balance = { 2024: {} };
    const cashFlow = { 2024: {} };

    REIT_OVERLAY.computeDerived(years, income, balance, cashFlow);

    // NOI = 5B - 1.5B = 3.5B
    expect(income[2024].noi).toBe(3500000000);
  });

  it('should compute FFO per share', () => {
    const years = [2024];
    const income = { 2024: {
      net_income_loss: 2000000000,
      diluted_average_shares: 500000000,          // 500M shares
    }};
    const balance = { 2024: {} };
    const cashFlow = { 2024: {
      depreciation_amortization: 3000000000,
    }};

    REIT_OVERLAY.computeDerived(years, income, balance, cashFlow);

    // FFO = 2B + 3B = 5B; FFO/share = 5B / 500M = $10
    expect(income[2024].ffo).toBe(5000000000);
    expect(income[2024].ffo_per_share).toBeCloseTo(10.0, 2);
  });

  it('should compute book NAV', () => {
    const years = [2024];
    const income = { 2024: {} };
    const balance = { 2024: {
      equity: 30000000000,                                // $30B equity
      real_estate_accumulated_depreciation: 10000000000,  // $10B accumulated depreciation
      intangible_assets: 500000000,                       // $500M intangibles
      shares_outstanding: 500000000,                      // 500M shares
    }};
    const cashFlow = { 2024: {} };

    REIT_OVERLAY.computeDerived(years, income, balance, cashFlow);

    // NAV = 30B + 10B - 500M = 39.5B
    expect(balance[2024].nav_book).toBe(39500000000);
    // NAV/share = 39.5B / 500M = $79
    expect(balance[2024].nav_per_share).toBeCloseTo(79.0, 2);
  });

  it('should compute AFFO from FFO', () => {
    const years = [2024];
    const income = { 2024: {
      net_income_loss: 2000000000,
    }};
    const balance = { 2024: {} };
    const cashFlow = { 2024: {
      depreciation_amortization: 3000000000,
      capital_expenditures: 1000000000,      // $1B total capex
    }};

    REIT_OVERLAY.computeDerived(years, income, balance, cashFlow);

    // FFO = 2B + 3B = 5B
    // AFFO = 5B - (1B * 0.15) = 5B - 150M = 4.85B
    expect(income[2024].affo).toBe(4850000000);
  });
});

// ─── Insurance Overlay ──────────────────────────────────────

describe('Phase 4: Insurance Overlay — taxonomy fields', () => {
  it('should have premiums earned tags', () => {
    const premiums = INSURANCE_OVERLAY.incomeFields.find(f => f.field === 'premiums_earned_net');
    expect(premiums).toBeDefined();
    expect(premiums.tags).toContain('PremiumsEarnedNet');
    expect(premiums.tags).toContain('PremiumsEarnedNetPropertyAndCasualty');
  });

  it('should have claims/benefits tags', () => {
    const claims = INSURANCE_OVERLAY.incomeFields.find(f => f.field === 'policyholder_benefits_and_claims');
    expect(claims).toBeDefined();
    expect(claims.tags).toContain('PolicyholderBenefitsAndClaimsIncurredNet');
  });

  it('should have net investment income', () => {
    const nii = INSURANCE_OVERLAY.incomeFields.find(f => f.field === 'net_investment_income');
    expect(nii).toBeDefined();
    expect(nii.tags).toContain('NetInvestmentIncome');
  });

  it('should have insurance balance sheet fields', () => {
    const benefits = INSURANCE_OVERLAY.balanceFields.find(f => f.field === 'future_policy_benefits');
    expect(benefits).toBeDefined();
    expect(benefits.tags).toContain('LiabilityForFuturePolicyBenefits');

    const claims = INSURANCE_OVERLAY.balanceFields.find(f => f.field === 'unpaid_claims_reserves');
    expect(claims).toBeDefined();

    const dac = INSURANCE_OVERLAY.balanceFields.find(f => f.field === 'deferred_policy_acquisition_costs');
    expect(dac).toBeDefined();
  });
});

describe('Phase 4: Insurance Overlay — derived metrics', () => {
  it('should compute loss ratio', () => {
    const years = [2024];
    const income = { 2024: {
      policyholder_benefits_and_claims: 30000000000,  // $30B claims
      premiums_earned_net: 40000000000,                // $40B premiums
    }};
    const balance = { 2024: {} };
    const cashFlow = { 2024: {} };

    INSURANCE_OVERLAY.computeDerived(years, income, balance, cashFlow);

    // Loss ratio = 30B / 40B = 75%
    expect(income[2024].loss_ratio).toBeCloseTo(75.0, 1);
  });

  it('should compute expense ratio', () => {
    const years = [2024];
    const income = { 2024: {
      insurance_commissions: 4000000000,               // $4B commissions
      insurance_other_operating_expense: 6000000000,   // $6B other opex
      premiums_earned_net: 40000000000,                // $40B premiums
    }};
    const balance = { 2024: {} };
    const cashFlow = { 2024: {} };

    INSURANCE_OVERLAY.computeDerived(years, income, balance, cashFlow);

    // Expense ratio = (4B + 6B) / 40B = 25%
    expect(income[2024].expense_ratio).toBeCloseTo(25.0, 1);
  });

  it('should compute combined ratio from loss + expense', () => {
    const years = [2024];
    const income = { 2024: {
      policyholder_benefits_and_claims: 30000000000,
      insurance_commissions: 4000000000,
      insurance_other_operating_expense: 6000000000,
      premiums_earned_net: 40000000000,
    }};
    const balance = { 2024: {} };
    const cashFlow = { 2024: {} };

    INSURANCE_OVERLAY.computeDerived(years, income, balance, cashFlow);

    // Combined = 75% + 25% = 100%
    expect(income[2024].combined_ratio).toBeCloseTo(100.0, 1);
  });

  it('should compute insurance float', () => {
    const years = [2024];
    const income = { 2024: {} };
    const balance = { 2024: {
      unpaid_claims_reserves: 80000000000,              // $80B unpaid claims
      future_policy_benefits: 15000000000,              // $15B future benefits
      unearned_premiums: 2000000000,                    // $2B unearned premiums
      policyholder_contract_deposits: 0,
      reinsurance_recoverables: 3000000000,             // $3B reinsurance recoverables
      deferred_policy_acquisition_costs: 4000000000,    // $4B DAC
    }};
    const cashFlow = { 2024: {} };

    INSURANCE_OVERLAY.computeDerived(years, income, balance, cashFlow);

    // Float = (80B + 15B + 2B + 0) - 3B - 4B = 90B
    expect(balance[2024].insurance_float).toBe(90000000000);
  });

  it('should not compute loss ratio when premiums missing', () => {
    const years = [2024];
    const income = { 2024: {
      policyholder_benefits_and_claims: 30000000000,
      // premiums_earned_net missing
    }};
    const balance = { 2024: {} };
    const cashFlow = { 2024: {} };

    INSURANCE_OVERLAY.computeDerived(years, income, balance, cashFlow);

    expect(income[2024].loss_ratio).toBeUndefined();
  });
});

// ─── Overlay Structure Integrity ────────────────────────────

describe('Phase 4: Overlay structure validation', () => {
  for (const [name, overlay] of [['bank', BANK_OVERLAY], ['reit', REIT_OVERLAY], ['insurance', INSURANCE_OVERLAY]]) {
    it(`${name} overlay should have valid field definitions`, () => {
      for (const section of ['incomeFields', 'balanceFields', 'cashFlowFields']) {
        const fields = overlay[section] || [];
        for (const fieldDef of fields) {
          expect(fieldDef.field).toBeTruthy();
          expect(fieldDef.unit).toBeTruthy();
          expect(Array.isArray(fieldDef.tags)).toBe(true);
          expect(fieldDef.tags.length).toBeGreaterThan(0);
          // Tags should be PascalCase XBRL tag names
          for (const tag of fieldDef.tags) {
            expect(tag).toMatch(/^[A-Z]/);
          }
        }
      }
    });

    it(`${name} overlay should have unique field names`, () => {
      const allFields = [
        ...(overlay.incomeFields || []),
        ...(overlay.balanceFields || []),
        ...(overlay.cashFlowFields || []),
      ].map(f => f.field);
      const unique = new Set(allFields);
      expect(unique.size).toBe(allFields.length);
    });

    it(`${name} overlay should have computeDerived function`, () => {
      expect(typeof overlay.computeDerived).toBe('function');
    });
  }
});

// ─── SIC_INDUSTRY_TYPE coverage ─────────────────────────────

describe('Phase 4: SIC_INDUSTRY_TYPE map', () => {
  it('should have all expected bank SIC codes', () => {
    const bankCodes = Object.entries(SIC_INDUSTRY_TYPE).filter(([, v]) => v === 'bank').map(([k]) => k);
    expect(bankCodes.length).toBe(5); // 6020, 6021, 6022, 6035, 6036
  });

  it('should have all expected insurance SIC codes', () => {
    const insCodes = Object.entries(SIC_INDUSTRY_TYPE).filter(([, v]) => v === 'insurance').map(([k]) => k);
    expect(insCodes.length).toBe(5); // 6311, 6321, 6324, 6331, 6399
  });

  it('should have all expected REIT SIC codes', () => {
    const reitCodes = Object.entries(SIC_INDUSTRY_TYPE).filter(([, v]) => v === 'reit').map(([k]) => k);
    expect(reitCodes.length).toBe(2); // 6512, 6798
  });
});
