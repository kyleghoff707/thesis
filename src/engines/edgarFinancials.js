// EDGAR-based financial statements — single source of truth
// Fetches all income statement, balance sheet, and cash flow data from SEC XBRL.
// Replaces Polygon for statement data. Polygon still used for company details + ticker search.
//
// Taxonomy covers ~100 line items matching both Rule One Toolbox and Morningstar structures.
// Each field uses ordered fallback tags — first tag's value wins per year, later tags fill gaps.

import { lookupCIK, fetchCompanyFacts, extractAnnualFact, extractAnnualFactOriginal, extractFiscalYearEnds, findLatestQuarter } from './edgar';
import { cacheGet, cacheSet } from './cache';
import { fetchSplits, cumulativeSplitFactor } from './splits';

// ─── XBRL Taxonomy Map ──────────────────────────────────────
// Each field: { tags: [...fallback order], unit: 'USD' | 'USD/shares' | 'shares' }
// Tags ordered by prevalence — most common first.

const INCOME_TAXONOMY = [
  // ── Revenue & Cost ──
  { field: 'revenues', unit: 'USD', tags: [
    'RevenueFromContractWithCustomerExcludingAssessedTax', // ASC 606 (2018+)
    'Revenues',
    'SalesRevenueNet',
    'SalesRevenueGoodsNet',
    'RevenueFromContractWithCustomerIncludingAssessedTax',
  ]},
  { field: 'cost_of_revenue', unit: 'USD', tags: [
    'CostOfRevenue',
    'CostOfGoodsAndServicesSold',
    'CostOfGoodsSold',
  ]},
  { field: 'gross_profit', unit: 'USD', tags: [
    'GrossProfit',
  ]},

  // ── Operating Expenses ──
  { field: 'sga', unit: 'USD', tags: [
    'SellingGeneralAndAdministrativeExpense',
    'SellingAndMarketingExpense',
    'GeneralAndAdministrativeExpense',
  ]},
  { field: 'research_and_development', unit: 'USD', tags: [
    'ResearchAndDevelopmentExpense',
    'ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost',
  ]},
  // D&A on income statement (SFM reports this; AAPL embeds in COGS/SGA)
  { field: 'depreciation_amortization_is', unit: 'USD', tags: [
    'DepreciationAndAmortization',
    'DepreciationDepletionAndAmortization',
  ]},
  { field: 'other_operating_expenses', unit: 'USD', tags: [
    'OtherOperatingIncomeExpenseNet',
    'RestructuringCharges',
    'GoodwillImpairmentLoss',
    'AssetImpairmentCharges',
  ]},
  { field: 'operating_expenses', unit: 'USD', tags: [
    'OperatingExpenses',
    'CostsAndExpenses',
  ]},
  { field: 'operating_income_loss', unit: 'USD', tags: [
    'OperatingIncomeLoss',
  ]},

  // ── Non-Operating Income/Expense ──
  { field: 'interest_income', unit: 'USD', tags: [
    'InvestmentIncomeInterest',
    'InterestIncomeOther',
    'InterestAndDividendIncomeOperating',
    'InvestmentIncomeInterestAndDividend',
  ]},
  { field: 'interest_expense', unit: 'USD', tags: [
    'InterestExpense',
    'InterestExpenseDebt',
    'InterestExpenseOperating',
  ]},
  { field: 'net_interest_income', unit: 'USD', tags: [
    'InterestIncomeExpenseNet',
    'InterestIncomeExpenseNonoperatingNet',
  ]},
  { field: 'other_income_expense', unit: 'USD', tags: [
    'NonoperatingIncomeExpense',
    'OtherNonoperatingIncomeExpense',
    'IncomeLossFromEquityMethodInvestments',
    'GainLossOnInvestments',
  ]},

  // ── Pre-Tax → Net Income ──
  { field: 'income_before_tax', unit: 'USD', tags: [
    'IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest',
    'IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments',
    'IncomeLossFromContinuingOperationsBeforeIncomeTaxesDomestic',
  ]},
  { field: 'income_tax', unit: 'USD', tags: [
    'IncomeTaxExpenseBenefit',
  ]},
  { field: 'income_from_continuing_operations', unit: 'USD', tags: [
    'IncomeLossFromContinuingOperations',
  ]},
  { field: 'net_income_loss', unit: 'USD', tags: [
    'NetIncomeLoss',
    'ProfitLoss',
    'NetIncomeLossAvailableToCommonStockholdersBasic',
  ]},
  { field: 'net_income_including_nci', unit: 'USD', tags: [
    'ProfitLoss',
    'NetIncomeLoss',
  ]},

  // ── Per-Share Data ──
  // splitSensitive: use original filing values (not restated comparatives) so
  // we can apply consistent split adjustment without double-counting.
  { field: 'basic_earnings_per_share', unit: 'USD/shares', splitSensitive: true, tags: [
    'EarningsPerShareBasic',
  ]},
  { field: 'diluted_earnings_per_share', unit: 'USD/shares', splitSensitive: true, tags: [
    'EarningsPerShareDiluted',
  ]},
  { field: 'basic_average_shares', unit: 'shares', splitSensitive: true, tags: [
    'WeightedAverageNumberOfSharesOutstandingBasic',
    'WeightedAverageNumberOfShareOutstandingBasicAndDiluted',
  ]},
  { field: 'diluted_average_shares', unit: 'shares', splitSensitive: true, tags: [
    'WeightedAverageNumberOfDilutedSharesOutstanding',
  ]},
  { field: 'dividends_per_share', unit: 'USD/shares', splitSensitive: true, tags: [
    'CommonStockDividendsPerShareDeclared',
    'CommonStockDividendsPerShareCashPaid',
  ]},
];

const BALANCE_TAXONOMY = [
  // ── Current Assets ──
  { field: 'cash', unit: 'USD', tags: [
    'CashAndCashEquivalentsAtCarryingValue',
    'Cash',
  ]},
  // Expanded sub-breakdowns of cash
  { field: 'cash_only', unit: 'USD', tags: [
    'Cash',
  ]},
  { field: 'cash_equivalents', unit: 'USD', tags: [
    'CashEquivalentsAtCarryingValue',
  ]},
  { field: 'cash_and_short_term_investments', unit: 'USD', tags: [
    'CashCashEquivalentsAndShortTermInvestments',
  ]},
  { field: 'short_term_investments', unit: 'USD', tags: [
    'ShortTermInvestments',
    'MarketableSecuritiesCurrent',
    'AvailableForSaleSecuritiesCurrent',
    'DebtSecuritiesAvailableForSaleCurrent',
  ]},
  { field: 'accounts_receivable', unit: 'USD', tags: [
    'AccountsReceivableNetCurrent',
    'ReceivablesNetCurrent',
    'AccountsReceivableNet',
  ]},
  // Expanded receivables detail
  { field: 'accounts_receivable_gross', unit: 'USD', tags: [
    'AccountsReceivableGrossCurrent',
  ]},
  { field: 'allowance_doubtful_accounts', unit: 'USD', tags: [
    'AllowanceForDoubtfulAccountsReceivableCurrent',
  ]},
  { field: 'vendor_receivables', unit: 'USD', tags: [
    'NontradeReceivablesCurrent',
    'OtherReceivablesCurrent',
  ]},
  // Broad receivables tag — may include trade + other receivables combined
  // Used in derived total_receivables when narrow + vendor undercount
  { field: 'receivables_broad', unit: 'USD', tags: [
    'ReceivablesNetCurrent',
    'AccountsNotesAndLoansReceivableNetCurrent',
  ]},
  { field: 'inventory', unit: 'USD', tags: [
    'InventoryNet',
    'InventoryFinishedGoodsAndWorkInProcess',
    'InventoryRawMaterialsAndSupplies',
  ]},
  { field: 'prepaid_expenses', unit: 'USD', tags: [
    'PrepaidExpenseAndOtherAssetsCurrent',
    'PrepaidExpenseCurrent',
  ]},
  { field: 'other_current_assets', unit: 'USD', tags: [
    'OtherAssetsCurrent',
  ]},
  { field: 'current_assets', unit: 'USD', tags: [
    'AssetsCurrent',
  ]},

  // ── Non-Current Assets ──
  { field: 'property_plant_equipment_gross', unit: 'USD', tags: [
    'PropertyPlantAndEquipmentGross',
  ]},
  // Expanded PP&E sub-items
  { field: 'ppe_land', unit: 'USD', tags: [
    'Land',
    'LandAndLandImprovements',
  ]},
  { field: 'ppe_buildings', unit: 'USD', tags: [
    'BuildingsAndImprovements',
    'BuildingAndBuildingImprovements',
  ]},
  { field: 'ppe_machinery', unit: 'USD', tags: [
    'MachineryAndEquipment',
    'MachineryAndEquipmentGross',
    'FurnitureAndFixturesGross',
  ]},
  { field: 'ppe_leasehold', unit: 'USD', tags: [
    'LeaseholdImprovementsGross',
  ]},
  { field: 'ppe_other', unit: 'USD', tags: [
    'OtherPropertyPlantAndEquipment',
  ]},
  { field: 'ppe_construction', unit: 'USD', tags: [
    'ConstructionInProgressGross',
  ]},
  { field: 'accumulated_depreciation', unit: 'USD', tags: [
    'AccumulatedDepreciationDepletionAndAmortizationPropertyPlantAndEquipment',
  ]},
  { field: 'property_plant_equipment', unit: 'USD', tags: [
    'PropertyPlantAndEquipmentNet',
    'PropertyPlantAndEquipmentAndFinanceLeaseRightOfUseAssetAfterAccumulatedDepreciationAndAmortization',
  ]},
  { field: 'operating_lease_rou_asset', unit: 'USD', tags: [
    'OperatingLeaseRightOfUseAsset',
  ]},
  { field: 'goodwill', unit: 'USD', tags: [
    'Goodwill',
  ]},
  { field: 'intangible_assets', unit: 'USD', tags: [
    'IntangibleAssetsNetExcludingGoodwill',
    'FiniteLivedIntangibleAssetsNet',
    'IndefiniteLivedIntangibleAssetsExcludingGoodwill',
  ]},
  { field: 'long_term_investments', unit: 'USD', tags: [
    'LongTermInvestments',
    'InvestmentsAndAdvances',
    'MarketableSecuritiesNoncurrent',
    'AvailableForSaleSecuritiesNoncurrent',
    'DebtSecuritiesAvailableForSaleNoncurrent',
  ]},
  // Expanded investment detail
  { field: 'available_for_sale_securities', unit: 'USD', tags: [
    'AvailableForSaleSecurities',
    'AvailableForSaleSecuritiesNoncurrent',
    'DebtSecuritiesAvailableForSaleNoncurrent',
  ]},
  { field: 'deferred_tax_assets', unit: 'USD', tags: [
    'DeferredIncomeTaxAssetsNet',
  ]},
  { field: 'other_noncurrent_assets', unit: 'USD', tags: [
    'OtherAssetsNoncurrent',
    'OtherAssets',
  ]},
  { field: 'assets', unit: 'USD', tags: [
    'Assets',
  ]},

  // ── Current Liabilities ──
  { field: 'accounts_payable', unit: 'USD', tags: [
    'AccountsPayableCurrent',
    'AccountsPayableAndAccruedLiabilitiesCurrent',
  ]},
  { field: 'accrued_liabilities', unit: 'USD', tags: [
    'AccruedLiabilitiesCurrent',
    'EmployeeRelatedLiabilitiesCurrent',
  ]},
  { field: 'short_term_debt', unit: 'USD', tags: [
    'ShortTermBorrowings',
    'DebtCurrent',
    'CommercialPaper',
  ]},
  { field: 'current_portion_lt_debt', unit: 'USD', tags: [
    'LongTermDebtCurrent',
  ]},
  { field: 'operating_lease_liability_current', unit: 'USD', tags: [
    'OperatingLeaseLiabilityCurrent',
  ]},
  { field: 'finance_lease_liability_current', unit: 'USD', tags: [
    'FinanceLeaseLiabilityCurrent',
  ]},
  { field: 'deferred_revenue_current', unit: 'USD', tags: [
    'DeferredRevenueCurrent',
    'ContractWithCustomerLiabilityCurrent',
  ]},
  { field: 'other_current_liabilities', unit: 'USD', tags: [
    'OtherLiabilitiesCurrent',
  ]},
  { field: 'current_liabilities', unit: 'USD', tags: [
    'LiabilitiesCurrent',
  ]},

  // ── Non-Current Liabilities ──
  { field: 'long_term_debt', unit: 'USD', tags: [
    'LongTermDebtNoncurrent',
    'LongTermDebt',
    'LongTermLineOfCredit',
  ]},
  { field: 'long_term_debt_and_leases', unit: 'USD', tags: [
    'LongTermDebtAndCapitalLeaseObligations',
  ]},
  { field: 'operating_lease_liability_noncurrent', unit: 'USD', tags: [
    'OperatingLeaseLiabilityNoncurrent',
  ]},
  { field: 'finance_lease_liability_noncurrent', unit: 'USD', tags: [
    'FinanceLeaseLiabilityNoncurrent',
  ]},
  { field: 'deferred_revenue_noncurrent', unit: 'USD', tags: [
    'DeferredRevenueNoncurrent',
    'ContractWithCustomerLiabilityNoncurrent',
  ]},
  { field: 'deferred_tax_liabilities', unit: 'USD', tags: [
    'DeferredIncomeTaxLiabilitiesNet',
    'DeferredIncomeTaxLiabilities',
  ]},
  { field: 'pension_liabilities', unit: 'USD', tags: [
    'PensionAndOtherPostretirementDefinedBenefitPlansLiabilitiesNoncurrent',
  ]},
  { field: 'other_noncurrent_liabilities', unit: 'USD', tags: [
    'OtherLiabilitiesNoncurrent',
  ]},
  { field: 'liabilities', unit: 'USD', tags: [
    'Liabilities',
  ]},

  // ── Stockholders' Equity ──
  { field: 'common_stock', unit: 'USD', tags: [
    'CommonStockValue',
    'CommonStocksIncludingAdditionalPaidInCapital',
  ]},
  { field: 'additional_paid_in_capital', unit: 'USD', tags: [
    'AdditionalPaidInCapitalCommonStock',
    'AdditionalPaidInCapital',
  ]},
  { field: 'retained_earnings', unit: 'USD', tags: [
    'RetainedEarningsAccumulatedDeficit',
    'RetainedEarningsUnappropriated',
  ]},
  { field: 'aoci', unit: 'USD', tags: [
    'AccumulatedOtherComprehensiveIncomeLossNetOfTax',
  ]},
  { field: 'treasury_stock', unit: 'USD', tags: [
    'TreasuryStockValue',
    'TreasuryStockCommonValue',
  ]},
  { field: 'equity', unit: 'USD', tags: [
    'StockholdersEquity',
    'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest',
  ]},
  { field: 'equity_attributable_to_parent', unit: 'USD', tags: [
    'StockholdersEquity',
  ]},
  { field: 'minority_interest', unit: 'USD', tags: [
    'MinorityInterest',
    'RedeemableNoncontrollingInterestEquityCarryingAmount',
  ]},
  { field: 'preferred_stock', unit: 'USD', tags: [
    'PreferredStockValue',
  ]},

  // ── Share Counts (balance sheet point-in-time) ──
  { field: 'shares_outstanding', unit: 'shares', splitSensitive: true, tags: [
    'CommonStockSharesOutstanding',
    'CommonStockSharesIssued',
  ]},
  { field: 'treasury_shares', unit: 'shares', splitSensitive: true, tags: [
    'TreasuryStockCommonShares',
    'TreasuryStockShares',
  ]},
];

const CASHFLOW_TAXONOMY = [
  // ── Operating Activities ──
  { field: 'net_cash_flow_from_operating_activities', unit: 'USD', tags: [
    'NetCashProvidedByUsedInOperatingActivities',
    'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations',
  ]},
  { field: 'depreciation_amortization', unit: 'USD', tags: [
    'DepreciationDepletionAndAmortization',
    'DepreciationAndAmortization',
    'DepreciationAmortizationAndAccretionNet',
  ]},
  // Narrow depreciation-only tag (PP&E) — used as fallback when combined D&A tag is missing
  { field: 'depreciation_only', unit: 'USD', tags: [
    'Depreciation',
  ]},
  { field: 'amortization_of_intangibles', unit: 'USD', tags: [
    'AmortizationOfIntangibleAssets',
  ]},
  { field: 'stock_based_compensation', unit: 'USD', tags: [
    'ShareBasedCompensation',
    'AllocatedShareBasedCompensationExpense',
  ]},
  { field: 'deferred_income_tax', unit: 'USD', tags: [
    'DeferredIncomeTaxExpenseBenefit',
    'DeferredIncomeTaxesAndTaxCredits',
  ]},
  { field: 'other_noncash_items', unit: 'USD', tags: [
    'OtherNoncashIncomeExpense',
  ]},
  // Working capital changes
  { field: 'change_in_receivables', unit: 'USD', tags: [
    'IncreaseDecreaseInAccountsReceivable',
    'IncreaseDecreaseInReceivables',
  ]},
  { field: 'change_in_inventory', unit: 'USD', tags: [
    'IncreaseDecreaseInInventories',
  ]},
  { field: 'change_in_payables', unit: 'USD', tags: [
    'IncreaseDecreaseInAccountsPayable',
    'IncreaseDecreaseInAccountsPayableAndAccruedLiabilities',
  ]},
  { field: 'change_in_other_working_capital', unit: 'USD', tags: [
    'IncreaseDecreaseInOtherOperatingCapitalNet',
    'IncreaseDecreaseInOperatingCapital',
  ]},

  // ── Investing Activities ──
  { field: 'capital_expenditures', unit: 'USD', tags: [
    'PaymentsToAcquirePropertyPlantAndEquipment',
    'PaymentsToAcquireProductiveAssets',
    'PaymentsToAcquireOtherPropertyPlantAndEquipment',
  ]},
  { field: 'sale_of_ppe', unit: 'USD', tags: [
    'ProceedsFromSaleOfPropertyPlantAndEquipment',
  ]},
  { field: 'purchase_of_investments', unit: 'USD', tags: [
    'PaymentsToAcquireInvestments',
    'PaymentsToAcquireShortTermInvestments',
    'PaymentsToAcquireAvailableForSaleSecuritiesDebt',
    'PaymentsToAcquireMarketableSecurities',
  ]},
  { field: 'sale_of_investments', unit: 'USD', tags: [
    'ProceedsFromSaleOfInvestments',
    'ProceedsFromSaleOfShortTermInvestments',
    'ProceedsFromSaleAndMaturityOfMarketableSecurities',
    'ProceedsFromMaturitiesPrepaymentsAndCallsOfAvailableForSaleSecurities',
    'ProceedsFromSaleOfAvailableForSaleSecuritiesDebt',
  ]},
  { field: 'purchase_of_business', unit: 'USD', tags: [
    'PaymentsToAcquireBusinessesNetOfCashAcquired',
    'PaymentsToAcquireBusinessesGross',
  ]},
  { field: 'sale_of_business', unit: 'USD', tags: [
    'ProceedsFromDivestitureOfBusinesses',
  ]},
  { field: 'purchase_of_intangibles', unit: 'USD', tags: [
    'PaymentsToAcquireIntangibleAssets',
  ]},
  { field: 'other_investing', unit: 'USD', tags: [
    'PaymentsForProceedsFromOtherInvestingActivities',
  ]},
  { field: 'net_cash_flow_from_investing_activities', unit: 'USD', tags: [
    'NetCashProvidedByUsedInInvestingActivities',
    'NetCashProvidedByUsedInInvestingActivitiesContinuingOperations',
  ]},

  // ── Financing Activities ──
  { field: 'proceeds_from_lt_debt', unit: 'USD', tags: [
    'ProceedsFromIssuanceOfLongTermDebt',
    'ProceedsFromIssuanceOfDebt',
  ]},
  { field: 'repayments_of_lt_debt', unit: 'USD', tags: [
    'RepaymentsOfLongTermDebt',
    'RepaymentsOfDebt',
  ]},
  { field: 'proceeds_from_st_debt', unit: 'USD', tags: [
    'ProceedsFromShortTermDebt',
    'ProceedsFromLinesOfCredit',
    'ProceedsFromRepaymentsOfCommercialPaper',
  ]},
  { field: 'repayments_of_st_debt', unit: 'USD', tags: [
    'RepaymentsOfShortTermDebt',
    'RepaymentsOfLinesOfCredit',
  ]},
  { field: 'share_repurchases', unit: 'USD', tags: [
    'PaymentsForRepurchaseOfCommonStock',
    'PaymentsForRepurchaseOfEquity',
  ]},
  { field: 'proceeds_from_stock_issuance', unit: 'USD', tags: [
    'ProceedsFromIssuanceOfCommonStock',
    'ProceedsFromStockOptionsExercised',
  ]},
  { field: 'dividends_paid', unit: 'USD', tags: [
    'PaymentsOfDividendsCommonStock',
    'PaymentsOfDividends',
    'PaymentsOfOrdinaryDividends',
  ]},
  { field: 'finance_lease_payments', unit: 'USD', tags: [
    'FinanceLeasePrincipalPayments',
  ]},
  { field: 'other_financing', unit: 'USD', tags: [
    'ProceedsFromPaymentsForOtherFinancingActivities',
    'PaymentsRelatedToTaxWithholdingForShareBasedCompensation',
  ]},
  { field: 'net_cash_flow_from_financing_activities', unit: 'USD', tags: [
    'NetCashProvidedByUsedInFinancingActivities',
    'NetCashProvidedByUsedInFinancingActivitiesContinuingOperations',
  ]},

  // ── Cash Position ──
  { field: 'effect_of_exchange_rate', unit: 'USD', tags: [
    'EffectOfExchangeRateOnCashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents',
    'EffectOfExchangeRateOnCashAndCashEquivalents',
  ]},

  // ── Supplemental ──
  { field: 'interest_paid', unit: 'USD', tags: [
    'InterestPaidNet',
    'InterestPaid',
  ]},
  { field: 'income_taxes_paid', unit: 'USD', tags: [
    'IncomeTaxesPaidNet',
    'IncomeTaxesPaid',
  ]},
];

// ─── Extraction ──────────────────────────────────────────────

// Extract all fields in a taxonomy section from company facts.
// For each field, tries all tags and MERGES results — first tag's value wins
// per year, but later tags fill in gaps (handles ASC 606 revenue transition, etc.)
//
// version controls which extraction function is used:
//   'restated' (default) — split-sensitive use earliest filing, others use latest filing
//   'original' — ALL fields use earliest filing (as originally reported)
// Split-sensitive fields always use extractAnnualFactOriginal regardless of version
// so our own split adjustment works consistently.
function extractSection(companyFacts, taxonomy, version = 'restated') {
  const allYears = new Set();
  const fieldData = {};

  for (const { field, tags, unit, splitSensitive } of taxonomy) {
    // Original mode: all fields use earliest filing
    // Restated mode: split-sensitive use earliest, others use latest
    const extractFn = (version === 'original' || splitSensitive)
      ? extractAnnualFactOriginal
      : extractAnnualFact;
    const merged = {};
    for (const tag of tags) {
      const data = extractFn(companyFacts, tag, unit);
      if (data) {
        for (const [year, val] of Object.entries(data)) {
          if (merged[year] == null) merged[year] = val;
        }
      }
    }
    if (Object.keys(merged).length > 0) {
      fieldData[field] = merged;
      for (const y of Object.keys(merged)) allYears.add(Number(y));
    }
  }

  return { fieldData, years: allYears };
}

// Build year-by-year statement object from extracted field data
function buildStatements(fieldData, years) {
  const statements = {};
  for (const year of years) {
    statements[year] = {};
    for (const [field, yearData] of Object.entries(fieldData)) {
      if (yearData[year] != null) {
        statements[year][field] = yearData[year];
      }
    }
  }
  return statements;
}

// ─── Split Adjustment ────────────────────────────────────
// Adjusts per-share values and share counts so the full history is on the
// same basis as current shares. Per-share values (USD/shares) are divided
// by the cumulative factor; share counts are multiplied.

const PER_SHARE_FIELDS = {
  income: ['basic_earnings_per_share', 'diluted_earnings_per_share', 'dividends_per_share'],
};
const SHARE_COUNT_FIELDS = {
  income: ['basic_average_shares', 'diluted_average_shares'],
  balance: ['shares_outstanding', 'treasury_shares'],
};

function applySplitAdjustment(years, income, balance, _cashFlow, splits) {
  if (!splits || splits.length === 0) return;

  for (const year of years) {
    const factor = cumulativeSplitFactor(splits, year);
    if (factor === 1) continue;

    const inc = income[year];
    if (inc) {
      for (const f of PER_SHARE_FIELDS.income) {
        if (inc[f] != null) inc[f] /= factor;
      }
      for (const f of SHARE_COUNT_FIELDS.income) {
        if (inc[f] != null) inc[f] *= factor;
      }
    }

    const bal = balance[year];
    if (bal) {
      for (const f of SHARE_COUNT_FIELDS.balance) {
        if (bal[f] != null) bal[f] *= factor;
      }
    }
  }
}

// ─── Derived Fields ──────────────────────────────────────────

function computeDerivedFields(years, income, balance, cashFlow) {
  for (const year of years) {
    const inc = income[year] || {};
    const bal = balance[year] || {};
    const cf = cashFlow[year] || {};

    // ── Income Statement Derived ──

    // Gross Profit = Revenue - COGS
    if (inc.gross_profit == null && inc.revenues != null && inc.cost_of_revenue != null) {
      inc.gross_profit = inc.revenues - inc.cost_of_revenue;
    }

    // Cost of Revenue = Revenue - Gross Profit (when XBRL tag missing but both components exist)
    // SFM doesn't report CostOfRevenue for 2017 and earlier, but has Revenue + GrossProfit
    if (inc.cost_of_revenue == null && inc.revenues != null && inc.gross_profit != null) {
      inc.cost_of_revenue = inc.revenues - inc.gross_profit;
    }

    // EPS auto-compute if missing
    if (inc.diluted_earnings_per_share == null && inc.net_income_loss != null && inc.diluted_average_shares) {
      inc.diluted_earnings_per_share = inc.net_income_loss / inc.diluted_average_shares;
    }
    if (inc.basic_earnings_per_share == null && inc.net_income_loss != null && inc.basic_average_shares) {
      inc.basic_earnings_per_share = inc.net_income_loss / inc.basic_average_shares;
    }

    // EBIT = Operating Income (or Pre-Tax + Interest Expense if missing)
    if (inc.operating_income_loss != null) {
      inc.ebit = inc.operating_income_loss;
    } else if (inc.income_before_tax != null && inc.interest_expense != null) {
      inc.ebit = inc.income_before_tax + inc.interest_expense;
    }

    // EBITDA = EBIT + D&A
    const da = inc.depreciation_amortization_is || cf.depreciation_amortization;
    if (inc.ebit != null && da != null) {
      inc.ebitda = inc.ebit + da;
    }

    // Total Expenses = Cost of Revenue + Operating Expenses
    if (inc.total_expenses == null && inc.cost_of_revenue != null && inc.operating_expenses != null) {
      inc.total_expenses = inc.cost_of_revenue + inc.operating_expenses;
    }

    // Effective Tax Rate = Tax / Pre-Tax Income × 100
    if (inc.effective_tax_rate == null && inc.income_tax != null && inc.income_before_tax != null && inc.income_before_tax !== 0) {
      inc.effective_tax_rate = (inc.income_tax / inc.income_before_tax) * 100;
    }

    // ── Balance Sheet Derived ──

    // Cash & Marketable Securities combined (matches R1 Toolbox "Cash, Cash Equivalents, & Marketable Securities")
    if (bal.cash_and_marketable_securities == null) {
      const c = bal.cash_and_short_term_investments ?? bal.cash ?? 0;
      const sti = bal.cash_and_short_term_investments ? 0 : (bal.short_term_investments ?? 0);
      bal.cash_and_marketable_securities = c + sti;
    }

    // Total Receivables — use broadest available figure
    // Some companies (AAPL) report narrow trade + vendor receivables separately.
    // Others (SFM) report a broad ReceivablesNetCurrent that includes all types.
    // Use whichever gives the larger (more complete) total.
    {
      const narrowTotal = (bal.accounts_receivable ?? 0) + (bal.vendor_receivables ?? 0);
      const broad = bal.receivables_broad ?? 0;
      if (narrowTotal > 0 || broad > 0) {
        bal.total_receivables = Math.max(narrowTotal, broad);
      }
    }

    // Non-Current Assets = Total Assets - Current Assets
    if (bal.noncurrent_assets == null && bal.assets != null && bal.current_assets != null) {
      bal.noncurrent_assets = bal.assets - bal.current_assets;
    }

    // Non-Current Liabilities = Total Liabilities - Current Liabilities
    if (bal.noncurrent_liabilities == null && bal.liabilities != null && bal.current_liabilities != null) {
      bal.noncurrent_liabilities = bal.liabilities - bal.current_liabilities;
    }

    // Traditional Debt = Short-Term Debt + Current Portion LT Debt + Long-Term Debt
    // (excludes lease obligations — used for Net Debt and scoring)
    const std = bal.short_term_debt ?? 0;
    const cpltd = bal.current_portion_lt_debt ?? 0;
    const ltd = bal.long_term_debt ?? 0;
    bal.total_debt = std + cpltd + ltd;

    // Total Debt with Leases = Traditional Debt + All Lease Obligations
    // (matches Rule One Toolbox "Total Debt (Short & Long-Term)" display)
    const olCurrent = bal.operating_lease_liability_current ?? 0;
    const olNoncurrent = bal.operating_lease_liability_noncurrent ?? 0;
    const flCurrent = bal.finance_lease_liability_current ?? 0;
    const flNoncurrent = bal.finance_lease_liability_noncurrent ?? 0;
    bal.total_debt_with_leases = bal.total_debt + olCurrent + olNoncurrent + flCurrent + flNoncurrent;

    // Net Debt = Traditional Debt - Cash & Cash Equivalents only
    // Toolbox uses traditional debt (no leases) for Net Debt, subtracts cash only (no marketable securities)
    bal.net_debt = bal.total_debt - (bal.cash ?? 0);

    // ── Expanded Balance Sheet Derived ──

    // Payables & Accrued Expenses combined
    if (bal.payables_and_accrued == null) {
      const ap = bal.accounts_payable ?? 0;
      const al = bal.accrued_liabilities ?? 0;
      if (ap || al) bal.payables_and_accrued = ap + al;
    }

    // Short-Term Debt & Capital Lease Obligation combined
    if (bal.short_term_debt_and_leases == null) {
      const total = std + cpltd + flCurrent;
      if (total) bal.short_term_debt_and_leases = total;
    }

    // Long-Term Debt & Capital Lease Obligations (non-current portion only)
    if (bal.lt_debt_and_leases_noncurrent == null) {
      const total = ltd + flNoncurrent;
      if (total) bal.lt_debt_and_leases_noncurrent = total;
    }

    // Working Capital = Current Assets - Current Liabilities
    if (bal.working_capital == null && bal.current_assets != null && bal.current_liabilities != null) {
      bal.working_capital = bal.current_assets - bal.current_liabilities;
    }

    // Invested Capital = Equity + LT Debt - Cash
    if (bal.invested_capital == null && bal.equity != null) {
      bal.invested_capital = (bal.equity ?? 0) + ltd - (bal.cash ?? 0);
    }

    // Net Tangible Assets = Total Assets - Goodwill - Intangibles - Total Liabilities
    // Simplified: Equity - Goodwill - Intangibles
    if (bal.net_tangible_assets == null && bal.equity != null) {
      bal.net_tangible_assets = (bal.equity ?? 0) - (bal.goodwill ?? 0) - (bal.intangible_assets ?? 0);
    }

    // Total Capitalization = Equity + Total Debt (traditional)
    if (bal.total_capitalization == null && bal.equity != null) {
      bal.total_capitalization = (bal.equity ?? 0) + bal.total_debt;
    }

    // ── Cash Flow Derived ──

    // D&A enhancement: if combined D&A tag was missing for this year but we have
    // the narrow Depreciation tag, sum it with AmortizationOfIntangibleAssets
    if (cf.depreciation_amortization == null && cf.depreciation_only != null) {
      cf.depreciation_amortization = cf.depreciation_only + (cf.amortization_of_intangibles ?? 0);
    }

    // Free Cash Flow = Operating CF - CapEx
    if (cf.free_cash_flow == null && cf.net_cash_flow_from_operating_activities != null && cf.capital_expenditures != null) {
      cf.free_cash_flow = cf.net_cash_flow_from_operating_activities - Math.abs(cf.capital_expenditures);
    }

    // Net change in investments
    if (cf.net_investments == null) {
      const pi = cf.purchase_of_investments;
      const si = cf.sale_of_investments;
      if (pi != null || si != null) {
        cf.net_investments = (si ?? 0) - Math.abs(pi ?? 0);
      }
    }

    // Net debt issuance = proceeds - repayments
    if (cf.net_debt_issuance == null) {
      const pltd = cf.proceeds_from_lt_debt ?? 0;
      const rltd = cf.repayments_of_lt_debt ? Math.abs(cf.repayments_of_lt_debt) : 0;
      const pstd = cf.proceeds_from_st_debt ?? 0;
      const rstd = cf.repayments_of_st_debt ? Math.abs(cf.repayments_of_st_debt) : 0;
      if (pltd || rltd || pstd || rstd) {
        cf.net_debt_issuance = (pltd + pstd) - (rltd + rstd);
      }
    }

    // Net change in common stock = stock issuance - buybacks
    if (cf.net_common_stock == null) {
      const proceeds = cf.proceeds_from_stock_issuance ?? 0;
      const buybacks = cf.share_repurchases ? Math.abs(cf.share_repurchases) : 0;
      if (proceeds || buybacks) {
        cf.net_common_stock = proceeds - buybacks;
      }
    }

    // Change in working capital (sum of components)
    if (cf.change_in_working_capital == null) {
      const cr = cf.change_in_receivables;
      const ci = cf.change_in_inventory;
      const cp = cf.change_in_payables;
      const co = cf.change_in_other_working_capital;
      if (cr != null || ci != null || cp != null || co != null) {
        cf.change_in_working_capital = (cr ?? 0) + (ci ?? 0) + (cp ?? 0) + (co ?? 0);
      }
    }

    // Net change in cash = Op + Inv + Fin + FX
    if (cf.net_change_in_cash == null) {
      const op = cf.net_cash_flow_from_operating_activities;
      const inv = cf.net_cash_flow_from_investing_activities;
      const fin = cf.net_cash_flow_from_financing_activities;
      const fx = cf.effect_of_exchange_rate ?? 0;
      if (op != null && inv != null && fin != null) {
        cf.net_change_in_cash = op + inv + fin + fx;
      }
    }

    // ── Expanded Cash Flow Derived ──

    // Capital Expenditures, Net = CapEx - Sale of PPE
    if (cf.capital_expenditures_net == null && cf.capital_expenditures != null) {
      cf.capital_expenditures_net = -Math.abs(cf.capital_expenditures) + (cf.sale_of_ppe ?? 0);
    }

    // Purchase/Sale of Business, Net
    if (cf.purchase_sale_of_business_net == null) {
      const pb = cf.purchase_of_business;
      const sb = cf.sale_of_business;
      if (pb != null || sb != null) {
        cf.purchase_sale_of_business_net = (sb ?? 0) - Math.abs(pb ?? 0);
      }
    }

    // Net LT debt issuance
    if (cf.net_lt_debt_issuance == null) {
      const pltd = cf.proceeds_from_lt_debt ?? 0;
      const rltd = cf.repayments_of_lt_debt ? Math.abs(cf.repayments_of_lt_debt) : 0;
      if (pltd || rltd) {
        cf.net_lt_debt_issuance = pltd - rltd;
      }
    }

    // Net ST debt issuance
    if (cf.net_st_debt_issuance == null) {
      const pstd = cf.proceeds_from_st_debt ?? 0;
      const rstd = cf.repayments_of_st_debt ? Math.abs(cf.repayments_of_st_debt) : 0;
      if (pstd || rstd) {
        cf.net_st_debt_issuance = pstd - rstd;
      }
    }

    // Ending cash position = current year balance sheet cash
    if (cf.ending_cash_position == null && bal.cash != null) {
      cf.ending_cash_position = bal.cash;
    }
  }

  // Second pass: beginning cash = prior year's ending cash
  const sortedYears = [...years].sort((a, b) => b - a);
  for (let i = 0; i < sortedYears.length; i++) {
    const cf = cashFlow[sortedYears[i]] || {};
    const priorYear = sortedYears[i + 1];
    if (cf.beginning_cash_position == null && priorYear != null) {
      const priorBal = balance[priorYear];
      if (priorBal?.cash != null) {
        cf.beginning_cash_position = priorBal.cash;
      }
    }
  }
}

// ─── TTM (Trailing Twelve Months) ────────────────────────────
// TTM for flow items (income, cash flow):
//   TTM = prior FY total + current YTD - prior year same-quarter YTD
// TTM for instant items (balance sheet):
//   Use most recent quarterly value

function getAnnualTotal(entries, fy) {
  const annual = entries.filter(e => e.form === '10-K' && e.fp === 'FY' && e.fy === fy);
  if (annual.length === 0) return null;
  let best = annual[0];
  for (const e of annual) {
    if (e.end > best.end || (e.end === best.end && e.filed > best.filed)) best = e;
  }
  return best.val;
}

function getQuarterlyYTD(entries, fy, fp) {
  const matches = entries.filter(e => e.form === '10-Q' && e.fy === fy && e.fp === fp);
  if (matches.length === 0) return null;
  // For flow items, pick the longest duration (YTD cumulative)
  const withStart = matches.filter(e => e.start != null);
  if (withStart.length > 0) {
    let best = withStart[0];
    for (const e of withStart) {
      const durBest = new Date(best.end) - new Date(best.start);
      const durE = new Date(e.end) - new Date(e.start);
      if (durE > durBest || (durE === durBest && e.filed > best.filed)) best = e;
    }
    return best.val;
  }
  return matches[0].val;
}

function getQuarterlyInstant(entries, fy, fp) {
  const matches = entries.filter(e => e.form === '10-Q' && e.fy === fy && e.fp === fp);
  if (matches.length === 0) return null;
  let best = matches[0];
  for (const e of matches) {
    if (e.filed > best.filed) best = e;
  }
  return best.val;
}

function extractTTMSection(companyFacts, taxonomy, sectionType, latestQtr) {
  const { fy, fp } = latestQtr;
  const priorFY = fy - 1;
  const result = {};

  for (const { field, tags, unit } of taxonomy) {
    // Skip per-share USD items — will be derived from totals
    if (unit === 'USD/shares') continue;

    let val = null;

    for (const tag of tags) {
      if (val != null) break;

      const facts = companyFacts?.facts?.['us-gaap']?.[tag];
      if (!facts) continue;
      const entries = facts.units?.[unit] || [];

      if (sectionType === 'balance') {
        // All balance sheet items: point-in-time from latest quarter
        val = getQuarterlyInstant(entries, fy, fp);
      } else if (unit === 'shares') {
        // Share counts in income/CF: use latest quarter's YTD weighted average
        val = getQuarterlyYTD(entries, fy, fp);
      } else {
        // Flow items (USD): TTM = prior FY + current YTD - prior YTD
        const fyTotal = getAnnualTotal(entries, priorFY);
        const currentYTD = getQuarterlyYTD(entries, fy, fp);
        const priorYTD = getQuarterlyYTD(entries, priorFY, fp);

        if (fyTotal != null && currentYTD != null && priorYTD != null) {
          val = fyTotal + currentYTD - priorYTD;
        }
      }
    }

    if (val != null) {
      result[field] = val;
    }
  }

  return result;
}

function computeTTM(companyFacts, latestQtr) {
  if (!latestQtr) return null;

  const income = extractTTMSection(companyFacts, INCOME_TAXONOMY, 'income', latestQtr);
  const balance = extractTTMSection(companyFacts, BALANCE_TAXONOMY, 'balance', latestQtr);
  const cashFlow = extractTTMSection(companyFacts, CASHFLOW_TAXONOMY, 'cashFlow', latestQtr);

  // Run derived field computation (wraps in 'TTM' key for computeDerivedFields)
  const incMap = { TTM: income };
  const balMap = { TTM: balance };
  const cfMap = { TTM: cashFlow };
  computeDerivedFields(['TTM'], incMap, balMap, cfMap);

  return {
    income: incMap.TTM,
    balance: balMap.TTM,
    cashFlow: cfMap.TTM,
    quarter: `${latestQtr.fp} FY${latestQtr.fy}`,
    endDate: latestQtr.end,
  };
}

// ─── Public API ──────────────────────────────────────────────

export async function fetchEdgarStatements(ticker, options = {}) {
  const { version = 'restated' } = options;

  const cik = await lookupCIK(ticker);
  if (!cik) {
    console.warn(`EDGAR statements: CIK not found for "${ticker}"`);
    return null;
  }

  // Fetch company facts and split history in parallel
  const [facts, splits] = await Promise.all([
    fetchCompanyFacts(cik),
    fetchSplits(ticker),
  ]);

  if (!facts) {
    console.warn(`EDGAR statements: company facts not available for CIK ${cik} (${ticker})`);
    return null;
  }

  // Include split count + version in cache key
  const cacheKey = `edgar-statements:${ticker.toUpperCase()}:s${splits.length}:${version}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const incSection = extractSection(facts, INCOME_TAXONOMY, version);
  const balSection = extractSection(facts, BALANCE_TAXONOMY, version);
  const cfSection = extractSection(facts, CASHFLOW_TAXONOMY, version);

  const allYears = new Set([...incSection.years, ...balSection.years, ...cfSection.years]);
  const years = [...allYears].sort((a, b) => b - a);

  const income = buildStatements(incSection.fieldData, years);
  const balance = buildStatements(balSection.fieldData, years);
  const cashFlow = buildStatements(cfSection.fieldData, years);

  // Normalize per-share values and share counts for stock splits
  // (must happen before derived fields so auto-computed EPS uses adjusted shares)
  applySplitAdjustment(years, income, balance, cashFlow, splits);

  // Compute all derived fields
  computeDerivedFields(years, income, balance, cashFlow);

  // Extract fiscal year end months (e.g. { 2024: 'Sep', 2023: 'Sep' })
  const fiscalMonths = extractFiscalYearEnds(facts);

  // Compute TTM from latest quarterly filing
  const latestQtr = findLatestQuarter(facts);
  const ttm = computeTTM(facts, latestQtr);

  const result = { years, income, balance, cashFlow, fiscalMonths, ttm };

  const splitNote = splits.length > 0 ? `, ${splits.length} split(s) adjusted` : '';
  const incFields = Object.keys(incSection.fieldData);
  const balFields = Object.keys(balSection.fieldData);
  const cfFields = Object.keys(cfSection.fieldData);
  console.log(`EDGAR statements ${ticker} [${version}]: ${years.length} years (${years[years.length - 1]}-${years[0]}), ` +
    `income: ${incFields.length} fields, balance: ${balFields.length} fields, cashFlow: ${cfFields.length} fields${splitNote}`);

  cacheSet(cacheKey, result, 'financials');
  return result;
}

export { INCOME_TAXONOMY, BALANCE_TAXONOMY, CASHFLOW_TAXONOMY };
