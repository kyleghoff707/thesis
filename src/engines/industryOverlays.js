// ─── Industry Overlay Taxonomies ────────────────────────────────
// Additive XBRL tag definitions for bank, REIT, and insurance companies.
// These extend (not replace) the master taxonomy in edgarFinancials.js.
//
// Design: One master taxonomy shared by all. Overlays ADD ~10-15 fields
// per industry type. A bug fix to a shared tag list happens in one place.
//
// Each overlay defines:
//   incomeFields  — additional income statement fields
//   balanceFields — additional balance sheet fields
//   cashFlowFields — additional cash flow fields
//   computeDerived(years, income, balance, cashFlow) — industry-specific derivations

// ─── Bank Overlay ──────────────────────────────────────────────
// Banks report Net Interest Income (NII) + Noninterest Income instead
// of Revenue/COGS/Gross Profit. Their "cost of goods" is provision for
// credit losses. Operating expenses are "noninterest expense."

export const BANK_OVERLAY = {
  incomeFields: [
    // Interest Income (total)
    { field: 'interest_income_operating', unit: 'USD', tags: [
      'InterestIncomeOperating',
      'InterestAndDividendIncomeOperating',
    ]},
    // Interest income breakdowns
    { field: 'interest_income_loans', unit: 'USD', tags: [
      'InterestAndFeeIncomeLoansAndLeases',
      'InterestAndFeeIncomeLoansAndLeasesHeldInPortfolio',
    ]},
    { field: 'interest_income_investments', unit: 'USD', tags: [
      'InterestIncomeSecuritiesTaxable',
      'InterestIncomeSecuritiesTaxExempt',
    ]},
    { field: 'interest_income_deposits', unit: 'USD', tags: [
      'InterestIncomeDepositsWithFinancialInstitutions',
    ]},
    // Interest Expense (operating — bank-specific total)
    { field: 'interest_expense_operating', unit: 'USD', tags: [
      'InterestExpenseOperating',
    ]},
    { field: 'interest_expense_deposits', unit: 'USD', tags: [
      'InterestExpenseDeposits',
    ]},
    { field: 'interest_expense_borrowings', unit: 'USD', tags: [
      'InterestExpenseLongTermDebt',
      'InterestExpenseShortTermBorrowings',
    ]},
    // Net Interest Income (already in master as net_interest_income, but
    // banks need additional tag variants)
    { field: 'net_interest_income_bank', unit: 'USD', tags: [
      'InterestIncomeExpenseNet',
      'InterestIncomeExpenseNonoperatingNet',
    ]},
    // NII after provision (key bank profitability line)
    { field: 'net_interest_income_after_provision', unit: 'USD', tags: [
      'InterestIncomeExpenseAfterProvisionForLoanLoss',
    ]},
    // Provision for credit losses (the bank's "cost of goods sold")
    { field: 'provision_for_credit_losses', unit: 'USD', tags: [
      'ProvisionForLoanLeaseAndOtherLosses',
      'ProvisionForLoanLossesExpensed',
      'ProvisionForLoanAndLeaseLosses',
    ]},
    // Noninterest Income (fee income, trading, investment banking)
    { field: 'noninterest_income', unit: 'USD', tags: [
      'NoninterestIncome',
    ]},
    { field: 'trading_revenue', unit: 'USD', tags: [
      'PrincipalTransactionsRevenue',
      'TradingGainsLosses',
    ]},
    { field: 'investment_banking_revenue', unit: 'USD', tags: [
      'InvestmentBankingRevenue',
    ]},
    { field: 'asset_management_fees', unit: 'USD', tags: [
      'AssetManagementFees1',
      'InvestmentAdvisoryFees',
    ]},
    // Noninterest Expense (the bank's "operating expense")
    { field: 'noninterest_expense', unit: 'USD', tags: [
      'NoninterestExpense',
    ]},
    { field: 'compensation_expense', unit: 'USD', tags: [
      'LaborAndRelatedExpense',
    ]},
  ],

  balanceFields: [
    // Loans (the primary earning asset)
    { field: 'loans_net', unit: 'USD', tags: [
      'FinancingReceivableExcludingAccruedInterestAfterAllowanceForCreditLoss',
      'LoansAndLeasesReceivableNetReportedAmount',
      'LoansAndLeasesReceivableNetOfDeferredIncome',
    ]},
    { field: 'loans_gross', unit: 'USD', tags: [
      'FinancingReceivableExcludingAccruedInterestBeforeAllowanceForCreditLoss',
      'LoansAndLeasesReceivableGrossCarryingAmount',
    ]},
    { field: 'allowance_for_loan_losses', unit: 'USD', tags: [
      'FinancingReceivableAllowanceForCreditLossExcludingAccruedInterest',
      'LoansAndLeasesReceivableAllowance',
      'AllowanceForLoanAndLeaseLossesRealEstate',
    ]},
    // Deposits (the primary funding source)
    { field: 'deposits', unit: 'USD', tags: [
      'Deposits',
    ]},
    { field: 'deposits_interest_bearing', unit: 'USD', tags: [
      'InterestBearingDepositLiabilities',
      'InterestBearingDepositLiabilitiesDomestic',
    ]},
    { field: 'deposits_noninterest_bearing', unit: 'USD', tags: [
      'NoninterestBearingDepositLiabilities',
      'NoninterestBearingDepositLiabilitiesDomestic',
    ]},
    // Investment securities
    { field: 'investment_securities', unit: 'USD', tags: [
      'DebtSecuritiesAvailableForSaleAndHeldToMaturityAmortizedCostAfterAllowanceForCreditLoss',
      'AvailableForSaleSecurities',
      'HeldToMaturitySecurities',
    ]},
    // Fed funds
    { field: 'fed_funds_sold', unit: 'USD', tags: [
      'FederalFundsSoldAndSecuritiesPurchasedUnderAgreementsToResell',
    ]},
    { field: 'fed_funds_purchased', unit: 'USD', tags: [
      'FederalFundsPurchasedAndSecuritiesSoldUnderAgreementsToRepurchase',
    ]},
    // Bank-specific cash
    { field: 'cash_due_from_banks', unit: 'USD', tags: [
      'CashAndDueFromBanks',
    ]},
    { field: 'interest_bearing_deposits_in_banks', unit: 'USD', tags: [
      'InterestBearingDepositsInBanks',
    ]},
  ],

  cashFlowFields: [
    // Banks typically have the same CF tags as standard companies
    // but provision shows up as a non-cash adjustment
  ],

  /**
   * Bank-specific derived fields.
   * Called after base computeDerivedFields.
   */
  computeDerived(years, income, balance, _cashFlow) {
    for (const year of years) {
      const inc = income[year] || {};
      const bal = balance[year] || {};

      // Efficiency Ratio = NoninterestExpense / (NII + NoninterestIncome)
      if (inc.efficiency_ratio == null) {
        const nii = inc.net_interest_income_bank ?? inc.net_interest_income;
        const ni = inc.noninterest_income;
        const nie = inc.noninterest_expense;
        if (nii != null && ni != null && nie != null && (nii + ni) > 0) {
          inc.efficiency_ratio = (nie / (nii + ni)) * 100;
        }
      }

      // Loan-to-Deposit Ratio
      if (bal.loan_to_deposit_ratio == null) {
        const loans = bal.loans_net ?? bal.loans_gross;
        const deposits = bal.deposits;
        if (loans != null && deposits != null && deposits > 0) {
          bal.loan_to_deposit_ratio = (loans / deposits) * 100;
        }
      }

      // Net Interest Margin (NIM) ≈ NII / Earning Assets
      // Earning assets = Loans + Investment Securities + Fed Funds Sold + Deposits at other banks
      if (inc.net_interest_margin == null) {
        const nii = inc.net_interest_income_bank ?? inc.net_interest_income;
        const earningAssets = (bal.loans_net ?? bal.loans_gross ?? 0)
          + (bal.investment_securities ?? 0)
          + (bal.fed_funds_sold ?? 0)
          + (bal.interest_bearing_deposits_in_banks ?? 0);
        if (nii != null && earningAssets > 0) {
          inc.net_interest_margin = (nii / earningAssets) * 100;
        }
      }

      // Provision as % of Loans
      if (inc.provision_to_loans == null) {
        const provision = inc.provision_for_credit_losses;
        const loans = bal.loans_net ?? bal.loans_gross;
        if (provision != null && loans != null && loans > 0) {
          inc.provision_to_loans = (provision / loans) * 100;
        }
      }
    }
  },
};

// ─── REIT Overlay ──────────────────────────────────────────────
// REITs report rental/lease revenue instead of product revenue.
// Key metric: FFO (Funds From Operations) = Net Income + D&A - Gains on RE Sales.
// FFO is not an XBRL tag — must be derived.
// NOI (Net Operating Income) = Revenue - Property Operating Expenses.

export const REIT_OVERLAY = {
  incomeFields: [
    // Property operating costs (the REIT's "COGS")
    { field: 'property_operating_costs', unit: 'USD', tags: [
      'DirectCostsOfLeasedAndRentedPropertyOrEquipment',
      'CostOfOtherPropertyOperatingRevenue',
    ]},
    // Gain/loss on real estate sales (deducted for FFO)
    { field: 'gain_loss_on_real_estate_sales', unit: 'USD', tags: [
      'GainLossOnSaleOfProperties',
      'GainsLossesOnSalesOfInvestmentRealEstate',
      'GainLossOnDispositionOfAssets',
    ]},
    // Impairment of real estate
    { field: 'impairment_of_real_estate', unit: 'USD', tags: [
      'ImpairmentOfRealEstate',
      'AssetImpairmentCharges',
    ]},
    // Equity method income (from JV investments — common for REITs)
    { field: 'equity_method_income', unit: 'USD', tags: [
      'IncomeLossFromEquityMethodInvestments',
    ]},
  ],

  balanceFields: [
    // Real estate investment property
    { field: 'real_estate_investment_net', unit: 'USD', tags: [
      'RealEstateInvestmentPropertyNet',
    ]},
    { field: 'real_estate_investment_gross', unit: 'USD', tags: [
      'RealEstateInvestmentPropertyAtCost',
      'RealEstateGrossAtCarryingValue',
    ]},
    { field: 'real_estate_accumulated_depreciation', unit: 'USD', tags: [
      'RealEstateInvestmentPropertyAccumulatedDepreciation',
      'RealEstateAccumulatedDepreciation',
    ]},
    // Land
    { field: 'land_available_for_development', unit: 'USD', tags: [
      'LandAvailableForDevelopment',
    ]},
    // JV / unconsolidated investments
    { field: 'unconsolidated_jv_investments', unit: 'USD', tags: [
      'InvestmentsInAffiliatesSubsidiariesAssociatesAndJointVentures',
      'RealEstateInvestmentsUnconsolidatedRealEstateAndOtherJointVentures',
    ]},
    // Lease intangibles
    { field: 'in_place_lease_intangibles', unit: 'USD', tags: [
      'FiniteLivedIntangibleAssetAcquiredInPlaceLeases',
    ]},
    { field: 'below_market_lease_liability', unit: 'USD', tags: [
      'BelowMarketLeaseNet',
    ]},
    // Noncontrolling interest (OP units — important for REITs)
    { field: 'nci_operating_partnership', unit: 'USD', tags: [
      'MinorityInterestInOperatingPartnerships',
    ]},
  ],

  cashFlowFields: [
    // REIT-specific investing activities
    { field: 'payments_to_acquire_real_estate', unit: 'USD', tags: [
      'PaymentsToAcquireRealEstate',
    ]},
    { field: 'payments_to_develop_real_estate', unit: 'USD', tags: [
      'PaymentsToDevelopRealEstateAssets',
    ]},
    { field: 'proceeds_from_real_estate_sales', unit: 'USD', tags: [
      'ProceedsFromRealEstateAndRealEstateJointVentures',
      'ProceedsFromSaleOfRealEstate',
    ]},
    { field: 'equity_method_distributions', unit: 'USD', tags: [
      'EquityMethodInvestmentDividendsOrDistributions',
    ]},
  ],

  /**
   * REIT-specific derived fields.
   * Called after base computeDerivedFields.
   */
  computeDerived(years, income, balance, cashFlow) {
    for (const year of years) {
      const inc = income[year] || {};
      const bal = balance[year] || {};
      const cf = cashFlow[year] || {};

      // NOI (Net Operating Income) = Revenue - Property Operating Costs
      if (inc.noi == null && inc.revenues != null && inc.property_operating_costs != null) {
        inc.noi = inc.revenues - inc.property_operating_costs;
      }

      // FFO (Funds From Operations) = Net Income + D&A + Impairment - Gains on RE Sales
      // NAREIT definition: excludes gains/losses on sale of depreciable RE
      // NOTE: FFO is approximate — gain_loss_on_real_estate_sales tag was discontinued
      // by many REITs (e.g., PLD) after FY2018; gains are now embedded in operating
      // income with no separate tag. For AI reports, consider NAREIT-published FFO
      // from earnings supplements for higher accuracy.
      if (inc.ffo == null && inc.net_income_loss != null) {
        const da = cf.depreciation_amortization ?? inc.depreciation_amortization_is ?? 0;
        const gains = inc.gain_loss_on_real_estate_sales ?? 0;
        const impairment = inc.impairment_of_real_estate ?? 0;
        inc.ffo = inc.net_income_loss + da + impairment - gains;
      }

      // FFO per share (basic)
      if (inc.ffo_per_share == null && inc.ffo != null && inc.diluted_average_shares > 0) {
        inc.ffo_per_share = inc.ffo / inc.diluted_average_shares;
      }

      // AFFO (Adjusted FFO) = FFO - Maintenance CapEx - Leasing Costs
      // Very rough approximation — maintenance capex is typically 70-80% of total capex for REITs
      // TODO (AI Reports): When AI-generated analysis consumes AFFO, use the user's
      // maintenance capex % from Valuation Calculators (which supports low/high ranges)
      // instead of this hardcoded 15%. The hardcoded value varies significantly by REIT
      // subtype: data center REITs (EQIX) ~30-40%, industrial (PLD) ~10-15%,
      // healthcare ~20-25%. This default is reasonable for Financials/Audit tabs.
      if (inc.affo == null && inc.ffo != null) {
        const capex = cf.capital_expenditures ?? 0;
        const maintenanceCapex = Math.abs(capex) * 0.15; // REITs spend ~15% of capex on maintenance
        inc.affo = inc.ffo - maintenanceCapex;
      }

      // NAV (Book NAV) = Equity + Accumulated RE Depreciation - Intangibles
      // This is a rough book-value proxy. True NAV requires fair value marks.
      if (bal.nav_book == null && bal.equity != null) {
        const reDepreciation = bal.real_estate_accumulated_depreciation ?? 0;
        const intangibles = bal.intangible_assets ?? bal.in_place_lease_intangibles ?? 0;
        bal.nav_book = bal.equity + reDepreciation - intangibles;
      }

      // NAV per share
      if (bal.nav_per_share == null && bal.nav_book != null && bal.shares_outstanding > 0) {
        bal.nav_per_share = bal.nav_book / bal.shares_outstanding;
      }
    }
  },
};

// ─── Insurance Overlay ──────────────────────────────────────────
// Insurance companies report premiums earned instead of product revenue.
// Key metrics: Loss Ratio, Combined Ratio, Float.
// Uses generic (non-P&C-suffixed) tags for broader coverage.

export const INSURANCE_OVERLAY = {
  incomeFields: [
    // Premiums (the insurance company's "revenue")
    { field: 'premiums_earned_net', unit: 'USD', tags: [
      'PremiumsEarnedNet',
      'PremiumsEarnedNetPropertyAndCasualty',
    ]},
    { field: 'premiums_written_net', unit: 'USD', tags: [
      'PremiumsWrittenNet',
      'PremiumsWrittenNetPropertyAndCasualty',
    ]},
    { field: 'premiums_direct', unit: 'USD', tags: [
      'DirectPremiumsEarned',
      'DirectPremiumsEarnedPropertyAndCasualty',
    ]},
    { field: 'premiums_assumed', unit: 'USD', tags: [
      'AssumedPremiumsEarned',
      'AssumedPremiumsEarnedPropertyAndCasualty',
    ]},
    { field: 'premiums_ceded', unit: 'USD', tags: [
      'CededPremiumsEarned',
      'CededPremiumsEarnedPropertyAndCasualty',
    ]},
    // Net Investment Income
    { field: 'net_investment_income', unit: 'USD', tags: [
      'NetInvestmentIncome',
      'SupplementaryInsuranceInformationNetInvestmentIncome',
    ]},
    // Claims / Benefits (the insurance "cost of goods sold")
    { field: 'policyholder_benefits_and_claims', unit: 'USD', tags: [
      'PolicyholderBenefitsAndClaimsIncurredNet',
      'PolicyholderBenefitsAndClaimsIncurredGross',
      'IncurredClaimsPropertyCasualtyAndLiability',
    ]},
    { field: 'benefits_claims_settlement', unit: 'USD', tags: [
      'SupplementaryInsuranceInformationBenefitsClaimsLossesAndSettlementExpense',
    ]},
    // Commission and other insurance expenses
    { field: 'insurance_commissions', unit: 'USD', tags: [
      'InsuranceCommissionsAndFees',
    ]},
    { field: 'insurance_other_operating_expense', unit: 'USD', tags: [
      'SupplementaryInsuranceInformationOtherOperatingExpense',
    ]},
    // Policyholder dividends
    { field: 'policyholder_dividends', unit: 'USD', tags: [
      'PolicyholderDividends',
    ]},
    // Interest credited to policyholders (life insurance)
    { field: 'interest_credited_to_policyholders', unit: 'USD', tags: [
      'InterestCreditedToPolicyholdersAccountBalances',
    ]},
  ],

  balanceFields: [
    // Insurance liabilities
    { field: 'future_policy_benefits', unit: 'USD', tags: [
      'LiabilityForFuturePolicyBenefits',
      'FutureInsuranceAndPolicyBenefits',
    ]},
    { field: 'unpaid_claims_reserves', unit: 'USD', tags: [
      'LiabilityForUnpaidClaimsAndClaimsAdjustmentExpenseNet',
      'LiabilityForClaimsAndClaimsAdjustmentExpense',
      'LiabilityForClaimsAndClaimsAdjustmentExpensePropertyCasualtyLiability',
    ]},
    { field: 'unearned_premiums', unit: 'USD', tags: [
      'SupplementaryInsuranceInformationUnearnedPremiums',
      'UnearnedPremiums',
    ]},
    { field: 'policyholder_contract_deposits', unit: 'USD', tags: [
      'PolicyholderContractDeposits',
      'PolicyholderFunds',
    ]},
    // Insurance assets
    { field: 'deferred_policy_acquisition_costs', unit: 'USD', tags: [
      'DeferredPolicyAcquisitionCosts',
      'DeferredPolicyAcquisitionCostsNet',
      'DeferredPolicyAcquisitionCostsAndValueOfBusinessAcquired',
    ]},
    { field: 'reinsurance_recoverables', unit: 'USD', tags: [
      'ReinsuranceRecoverables',
      'ReinsuranceRecoverablesOnUnpaidLossesGross',
      'ReinsuranceRecoverableForUnpaidClaimsAndClaimsAdjustments',
    ]},
    { field: 'premiums_receivable', unit: 'USD', tags: [
      'PremiumsAndOtherReceivablesNet',
      'PremiumsReceivableAtCarryingValue',
    ]},
  ],

  cashFlowFields: [
    // Insurance-specific CF items (changes in reserves)
    { field: 'change_in_claims_reserves', unit: 'USD', tags: [
      'IncreaseDecreaseInLiabilityForClaimsAndClaimsAdjustmentExpenseReserve',
    ]},
    { field: 'change_in_unearned_premiums', unit: 'USD', tags: [
      'IncreaseDecreaseInUnearnedPremiums',
    ]},
    { field: 'change_in_insurance_liabilities', unit: 'USD', tags: [
      'IncreaseDecreaseInInsuranceLiabilities',
    ]},
  ],

  /**
   * Insurance-specific derived fields.
   * Called after base computeDerivedFields.
   */
  computeDerived(years, income, balance, _cashFlow) {
    for (const year of years) {
      const inc = income[year] || {};
      const bal = balance[year] || {};

      // Loss Ratio = Claims / Premiums Earned × 100
      if (inc.loss_ratio == null) {
        const claims = inc.policyholder_benefits_and_claims ?? inc.benefits_claims_settlement;
        const premiums = inc.premiums_earned_net;
        if (claims != null && premiums != null && premiums > 0) {
          inc.loss_ratio = (claims / premiums) * 100;
        }
      }

      // Expense Ratio = (Commissions + Operating Expenses) / Premiums Earned × 100
      if (inc.expense_ratio == null) {
        const commissions = inc.insurance_commissions ?? 0;
        const opex = inc.insurance_other_operating_expense ?? 0;
        const premiums = inc.premiums_earned_net;
        if ((commissions > 0 || opex > 0) && premiums != null && premiums > 0) {
          inc.expense_ratio = ((commissions + opex) / premiums) * 100;
        }
      }

      // Combined Ratio = Loss Ratio + Expense Ratio
      if (inc.combined_ratio == null && inc.loss_ratio != null && inc.expense_ratio != null) {
        inc.combined_ratio = inc.loss_ratio + inc.expense_ratio;
      }

      // Float ≈ Unpaid Claims + Future Benefits + Unearned Premiums + Policyholder Deposits
      //        - Reinsurance Recoverables - DAC
      // NOTE: This is an approximation using available XBRL balance sheet items.
      // BRK's reported float (~$171B) cannot be reconstructed from standard us-gaap
      // tags because Berkshire stopped reporting granular insurance tags after 2012-2021.
      // Pure-play insurers (MET, ALL, PGR) have much better XBRL coverage.
      // For AI reports, cross-reference against company-reported float when available.
      if (bal.insurance_float == null) {
        const unpaidClaims = bal.unpaid_claims_reserves ?? 0;
        const futureBenefits = bal.future_policy_benefits ?? 0;
        const unearnedPremiums = bal.unearned_premiums ?? 0;
        const policyholderDeposits = bal.policyholder_contract_deposits ?? 0;
        const reinsurance = bal.reinsurance_recoverables ?? 0;
        const dac = bal.deferred_policy_acquisition_costs ?? 0;

        const floatComponents = unpaidClaims + futureBenefits + unearnedPremiums + policyholderDeposits;
        if (floatComponents > 0) {
          bal.insurance_float = floatComponents - reinsurance - dac;
        }
      }
    }
  },
};

/**
 * Get the overlay definition for an industry type.
 * Returns null for 'standard' (no overlay needed).
 */
export function getOverlay(industryType) {
  switch (industryType) {
    case 'bank': return BANK_OVERLAY;
    case 'reit': return REIT_OVERLAY;
    case 'insurance': return INSURANCE_OVERLAY;
    default: return null;
  }
}
