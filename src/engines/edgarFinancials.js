// EDGAR-based financial statements — single source of truth
// Fetches all income statement, balance sheet, and cash flow data from SEC XBRL.
// Single source of truth for all financial statement data.
//
// Taxonomy covers ~100 line items matching both Rule One Toolbox and Morningstar structures.
// Each field uses ordered fallback tags — first tag's value wins per year, later tags fill gaps.

import { lookupCIK, fetchCompanyFacts, fetchCompanyInfo, extractAnnualFact, extractAnnualFactOriginal, extractFiscalYearEnds, findLatestQuarter } from './edgar';
import { cacheGetAsync, cacheSet } from './cache';
import { fetchSplits, cumulativeSplitFactor } from './splits';
import { augmentTaxonomy } from './taxonomyResolver';
import { classifyIndustryType } from './industryClassifier';
import { getOverlay } from './industryOverlays';
import { collectKnownTags, getLayer3Suggestions } from './companyAdapter';

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
  ]},
  { field: 'selling_expense', unit: 'USD', tags: [
    'SellingAndMarketingExpense',
  ]},
  { field: 'general_and_admin_expense', unit: 'USD', tags: [
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
    'OperatingIncomeLossFromContinuingOperations',
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
    'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents',
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
    'LineOfCredit',
    'ShortTermBankLoansAndNotesPayable',
  ]},
  { field: 'current_portion_lt_debt', unit: 'USD', tags: [
    'LongTermDebtCurrent',
    'LongTermDebtAndCapitalLeaseObligationsCurrent',
    'OtherLongTermDebtCurrent',
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
    // REIT-specific
    'SecuredDebt',
    'UnsecuredDebt',
    'SeniorNotesNoncurrent',
    'MortgageLoansOnRealEstate',
    // Bank-specific
    'SubordinatedDebt',
    // Energy/General
    'LongTermNotesPayable',
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
  { field: 'noncurrent_liabilities', unit: 'USD', tags: [
    'LiabilitiesNoncurrent',
  ]},
  { field: 'liabilities', unit: 'USD', tags: [
    'Liabilities',
  ]},
  { field: 'liabilities_and_equity', unit: 'USD', tags: [
    'LiabilitiesAndStockholdersEquity',
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
    'OtherDepreciationAndAmortization',
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
  { field: 'other_noncash_items', unit: 'USD', negate: true, tags: [
    'OtherNoncashIncomeExpense',
  ]},
  // Working capital changes
  // XBRL tags use balance-sheet-change convention (positive = asset increased).
  // Cash flow convention: asset increase = cash used = negative.
  // negate: true flips the sign at extraction time so downstream values
  // match R1 Toolbox / Morningstar cash-impact convention.
  // Exception: payables increase = source of cash = already positive in both conventions.
  { field: 'change_in_receivables', unit: 'USD', negate: true, tags: [
    'IncreaseDecreaseInAccountsReceivable',
    'IncreaseDecreaseInReceivables',
  ]},
  { field: 'change_in_inventory', unit: 'USD', negate: true, tags: [
    'IncreaseDecreaseInInventories',
  ]},
  { field: 'change_in_payables', unit: 'USD', tags: [
    'IncreaseDecreaseInAccountsPayable',
    'IncreaseDecreaseInAccountsPayableAndAccruedLiabilities',
  ]},
  { field: 'change_in_other_working_capital', unit: 'USD', negate: true, tags: [
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

// Layer 2 augmented taxonomies — computed once at module load
const AUG_INCOME = augmentTaxonomy(INCOME_TAXONOMY);
const AUG_BALANCE = augmentTaxonomy(BALANCE_TAXONOMY);
const AUG_CASHFLOW = augmentTaxonomy(CASHFLOW_TAXONOMY);

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
  const provenanceData = {};

  for (const fieldDef of taxonomy) {
    const { field, tags, unit, splitSensitive, negate, _layer2Start } = fieldDef;
    // Original mode: all fields use earliest filing
    // Restated mode: split-sensitive use earliest, others use latest
    const extractFn = (version === 'original' || splitSensitive)
      ? extractAnnualFactOriginal
      : extractAnnualFact;
    const merged = {};
    const tagUsed = {};
    const tagIndex = {};
    for (let ti = 0; ti < tags.length; ti++) {
      const tag = tags[ti];
      const data = extractFn(companyFacts, tag, unit);
      if (data) {
        for (const [year, val] of Object.entries(data)) {
          if (merged[year] == null) {
            merged[year] = negate ? -val : val;
            tagUsed[year] = tag;
            tagIndex[year] = ti;
          }
        }
      }
    }
    if (Object.keys(merged).length > 0) {
      fieldData[field] = merged;
      provenanceData[field] = {};
      for (const y of Object.keys(merged)) {
        allYears.add(Number(y));
        const layer = (_layer2Start != null && tagIndex[y] >= _layer2Start) ? 2 : 1;
        provenanceData[field][y] = { tag: tagUsed[y], layer, derived: false, confidence: null, formula: null };
      }
    }
  }

  return { fieldData, years: allYears, provenanceData };
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

// Build year-by-year provenance object from extracted provenance data
// Same pivot as buildStatements: { field: { year: prov } } → { year: { field: prov } }
function buildProvenance(provenanceData, years) {
  const provenance = {};
  for (const year of years) {
    provenance[year] = {};
    for (const [field, yearData] of Object.entries(provenanceData)) {
      if (yearData[year] != null) {
        provenance[year][field] = yearData[year];
      }
    }
  }
  return provenance;
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

function applySplitAdjustment(years, income, balance, _cashFlow, splits, fiscalMonths) {
  if (!splits || splits.length === 0) return;

  for (const year of years) {
    const fyMonth = fiscalMonths?.[year];
    const factor = cumulativeSplitFactor(splits, year, fyMonth);
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

// ─── Derived Field Formulas ──────────────────────────────────
// Human-readable formula strings for display in the Audit tab provenance view.
// These describe how each derived field was computed — NOT executable expressions.
// For fields with multiple derivation paths, getDerivedFormula checks which
// inputs are present to determine which path was taken.

function getDerivedFormula(field, inc, bal, cf) {
  switch (field) {
    // Income Statement
    case 'sga': return 'selling_expense + general_and_admin_expense';
    case 'gross_profit':
      return inc.revenues != null && inc.cost_of_revenue != null ? 'revenues - cost_of_revenue' : null;
    case 'cost_of_revenue':
      return inc.revenues != null && inc.gross_profit != null ? 'revenues - gross_profit' : null;
    case 'diluted_earnings_per_share': return 'net_income_loss / diluted_average_shares';
    case 'basic_earnings_per_share': return 'net_income_loss / basic_average_shares';
    case 'operating_income_loss':
      if (inc.income_before_tax != null && inc.interest_expense != null)
        return 'income_before_tax + interest_expense - other_income_expense';
      if (inc.gross_profit != null && inc.sga != null)
        return 'gross_profit - sga - R&D - D&A(IS) - other_operating_expenses';
      return null;
    case 'ebit':
      if (inc.operating_income_loss != null) return 'operating_income_loss';
      return 'income_before_tax + interest_expense';
    case 'ebitda': return 'ebit + depreciation_amortization';
    case 'total_expenses': return 'cost_of_revenue + operating_expenses';
    case 'effective_tax_rate': return '(income_tax / income_before_tax) × 100';

    // Balance Sheet
    case 'cash_and_marketable_securities': return 'cash + short_term_investments';
    case 'total_receivables': return 'max(accounts_receivable + vendor_receivables, receivables_broad)';
    case 'noncurrent_assets': return 'assets - current_assets';
    case 'noncurrent_liabilities': return 'liabilities - current_liabilities';
    case 'liabilities':
      if (bal.current_liabilities != null && bal.noncurrent_liabilities != null)
        return 'current_liabilities + noncurrent_liabilities';
      return 'liabilities_and_equity - equity - minority_interest';
    case 'total_debt':
      if (bal.liabilities != null && bal.liabilities > 0 && (bal.short_term_debt ?? 0) + (bal.current_portion_lt_debt ?? 0) + (bal.long_term_debt ?? 0) > 0
        && ((bal.short_term_debt ?? 0) + (bal.current_portion_lt_debt ?? 0) + (bal.long_term_debt ?? 0)) / bal.liabilities < 0.05)
        return 'liabilities - known_non_debt_items (sanity check fallback)';
      return 'short_term_debt + current_portion_lt_debt + long_term_debt';
    case 'total_debt_with_leases': return 'total_debt + operating_lease_liabilities + finance_lease_liabilities';
    case 'net_debt': return 'total_debt_with_leases - cash';
    case 'payables_and_accrued': return 'accounts_payable + accrued_liabilities';
    case 'short_term_debt_and_leases': return 'short_term_debt + current_portion_lt_debt + finance_lease_liability_current';
    case 'lt_debt_and_leases_noncurrent': return 'long_term_debt + finance_lease_liability_noncurrent';
    case 'working_capital': return 'current_assets - current_liabilities';
    case 'invested_capital': return 'equity + long_term_debt - cash';
    case 'net_tangible_assets': return 'equity - goodwill - intangible_assets';
    case 'total_capitalization': return 'equity + total_debt';

    // Cash Flow
    case 'depreciation_amortization':
      if (cf.depreciation_only != null) return 'depreciation_only + amortization_of_intangibles';
      return null;
    case 'free_cash_flow': return 'operating_cash_flow - |capital_expenditures|';
    case 'net_investments': return 'sale_of_investments - |purchase_of_investments|';
    case 'net_debt_issuance': return '(proceeds_lt_debt + proceeds_st_debt) - (repayments_lt_debt + repayments_st_debt)';
    case 'net_common_stock': return 'proceeds_from_stock_issuance - |share_repurchases|';
    case 'change_in_working_capital': return 'change_in_receivables + change_in_inventory + change_in_payables + change_in_other_wc';
    case 'net_change_in_cash': return 'operating_cf + investing_cf + financing_cf + fx_effect';
    case 'capital_expenditures_net': return '-|capital_expenditures| + sale_of_ppe';
    case 'purchase_sale_of_business_net': return 'sale_of_business - |purchase_of_business|';
    case 'net_lt_debt_issuance': return 'proceeds_from_lt_debt - |repayments_of_lt_debt|';
    case 'net_st_debt_issuance': return 'proceeds_from_st_debt - |repayments_of_st_debt|';
    case 'ending_cash_position': return 'cash (balance sheet)';
    case 'beginning_cash_position': return 'prior year cash (balance sheet)';

    // Industry overlay derived fields
    case 'efficiency_ratio': return '(noninterest_expense / (NII + noninterest_income)) × 100';
    case 'loan_to_deposit_ratio': return '(loans / deposits) × 100';
    case 'net_interest_margin': return '(NII / earning_assets) × 100';
    case 'provision_to_loans': return '(provision_for_credit_losses / loans) × 100';
    case 'noi': return 'revenues - property_operating_costs';
    case 'ffo': return 'net_income + D&A + impairment - gains_on_RE_sales';
    case 'ffo_per_share': return 'ffo / diluted_average_shares';
    case 'affo': return 'ffo - maintenance_capex (est. 15% of total capex)';
    case 'nav_book': return 'equity + RE_accumulated_depreciation - intangibles';
    case 'nav_per_share': return 'nav_book / shares_outstanding';
    case 'loss_ratio': return '(claims / premiums_earned) × 100';
    case 'expense_ratio': return '(commissions + operating_expenses) / premiums_earned × 100';
    case 'combined_ratio': return 'loss_ratio + expense_ratio';
    case 'insurance_float': return 'unpaid_claims + future_benefits + unearned_premiums + policyholder_deposits - reinsurance - DAC';

    default: return null;
  }
}

// ─── Derived Fields ──────────────────────────────────────────

function computeDerivedFields(years, income, balance, cashFlow) {
  for (const year of years) {
    const inc = income[year] || {};
    const bal = balance[year] || {};
    const cf = cashFlow[year] || {};

    // ── Income Statement Derived ──

    // SGA = Selling + G&A when combined tag missing (MSFT, others report separately)
    if (inc.sga == null && inc.selling_expense != null && inc.general_and_admin_expense != null) {
      inc.sga = inc.selling_expense + inc.general_and_admin_expense;
    }

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

    // Operating Income derivation (financial companies often don't report OperatingIncomeLoss tag)
    // Path 1: Pre-tax income + interest expense - non-operating items
    // Path 2: Build from components (gross profit - opex items)
    if (inc.operating_income_loss == null) {
      if (inc.income_before_tax != null && inc.interest_expense != null) {
        inc.operating_income_loss = inc.income_before_tax + inc.interest_expense - (inc.other_income_expense ?? 0);
      } else if (inc.gross_profit != null && inc.sga != null) {
        inc.operating_income_loss = inc.gross_profit - inc.sga
          - (inc.research_and_development ?? 0)
          - (inc.depreciation_amortization_is ?? 0)
          - (inc.other_operating_expenses ?? 0);
      }
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

    // Total Liabilities = Current + Non-Current (when aggregate tag missing — 39+ companies)
    if (bal.liabilities == null && bal.current_liabilities != null && bal.noncurrent_liabilities != null) {
      bal.liabilities = bal.current_liabilities + bal.noncurrent_liabilities;
    }

    // Total Liabilities = LiabilitiesAndEquity - Equity (last resort when neither
    // Liabilities nor LiabilitiesNoncurrent tags exist — 31+ companies)
    if (bal.liabilities == null && bal.liabilities_and_equity != null && bal.equity != null) {
      bal.liabilities = bal.liabilities_and_equity - bal.equity - (bal.minority_interest ?? 0);
    }

    // Traditional Debt = Short-Term Debt + Current Portion LT Debt + Long-Term Debt
    // (excludes lease obligations — used for Net Debt and scoring)
    const std = bal.short_term_debt ?? 0;
    const cpltd = bal.current_portion_lt_debt ?? 0;
    const ltd = bal.long_term_debt ?? 0;
    bal.total_debt = std + cpltd + ltd;

    // Debt sanity check: if total_debt / liabilities < 5% but liabilities are significant,
    // the specific debt tags likely have gaps (common for REITs, banks, insurance, energy).
    // Fall back to: Liabilities - known non-debt liabilities.
    if (bal.liabilities != null && bal.liabilities > 0 && bal.total_debt / bal.liabilities < 0.05) {
      const knownNonDebt =
        (bal.accounts_payable ?? 0) +
        (bal.accrued_liabilities ?? 0) +
        (bal.deferred_revenue_current ?? 0) +
        (bal.deferred_revenue_noncurrent ?? 0) +
        (bal.operating_lease_liability_current ?? 0) +
        (bal.operating_lease_liability_noncurrent ?? 0) +
        (bal.deferred_tax_liabilities ?? 0) +
        (bal.pension_liabilities ?? 0) +
        (bal.other_current_liabilities ?? 0) +
        (bal.other_noncurrent_liabilities ?? 0);
      const derivedDebt = bal.liabilities - knownNonDebt;
      if (derivedDebt > bal.total_debt) {
        bal.total_debt = derivedDebt;
      }
    }

    // Total Debt with Leases = Traditional Debt + All Lease Obligations
    // (matches Rule One Toolbox "Total Debt (Short & Long-Term)" display)
    const olCurrent = bal.operating_lease_liability_current ?? 0;
    const olNoncurrent = bal.operating_lease_liability_noncurrent ?? 0;
    const flCurrent = bal.finance_lease_liability_current ?? 0;
    const flNoncurrent = bal.finance_lease_liability_noncurrent ?? 0;
    bal.total_debt_with_leases = bal.total_debt + olCurrent + olNoncurrent + flCurrent + flNoncurrent;

    // Net Debt = Total Debt (with leases) - Cash & Cash Equivalents
    // Uses the same debt figure shown in the UI for consistency (Fix 6 / P3b)
    bal.net_debt = bal.total_debt_with_leases - (bal.cash ?? 0);

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
    // Prefer latest end date (current quarter, not comparative FY-end)
    // Then latest filed date as tiebreaker
    if (e.end > best.end || (e.end === best.end && e.filed > best.filed)) best = e;
  }
  return best.val;
}

function extractTTMSection(companyFacts, taxonomy, sectionType, latestQtr) {
  const { fy, fp } = latestQtr;
  const priorFY = fy - 1;
  const result = {};
  const provenance = {};

  for (const { field, tags, unit, negate, _layer2Start } of taxonomy) {
    // Skip per-share USD items — will be derived from totals
    if (unit === 'USD/shares') continue;

    let val = null;
    let matchedTag = null;
    let matchedLayer = 1;

    for (let i = 0; i < tags.length; i++) {
      if (val != null) break;
      const tag = tags[i];

      const facts = companyFacts?.facts?.['us-gaap']?.[tag];
      if (!facts) continue;
      const entries = facts.units?.[unit] || [];

      if (sectionType === 'balance') {
        val = getQuarterlyInstant(entries, fy, fp);
      } else if (unit === 'shares') {
        val = getQuarterlyYTD(entries, fy, fp);
      } else {
        const fyTotal = getAnnualTotal(entries, priorFY);
        const currentYTD = getQuarterlyYTD(entries, fy, fp);
        const priorYTD = getQuarterlyYTD(entries, priorFY, fp);

        if (fyTotal != null && currentYTD != null && priorYTD != null) {
          val = fyTotal + currentYTD - priorYTD;
        }
      }

      if (val != null) {
        matchedTag = tag;
        matchedLayer = (_layer2Start != null && i >= _layer2Start) ? 2 : 1;
      }
    }

    if (val != null) {
      result[field] = negate ? -val : val;
      provenance[field] = { tag: matchedTag, layer: matchedLayer, derived: false, confidence: null, formula: null };
    }
  }

  return { data: result, provenance };
}

function computeTTM(companyFacts, latestQtr) {
  if (!latestQtr) return null;

  const incResult = extractTTMSection(companyFacts, INCOME_TAXONOMY, 'income', latestQtr);
  const balResult = extractTTMSection(companyFacts, BALANCE_TAXONOMY, 'balance', latestQtr);
  const cfResult = extractTTMSection(companyFacts, CASHFLOW_TAXONOMY, 'cashFlow', latestQtr);

  const income = incResult.data;
  const balance = balResult.data;
  const cashFlow = cfResult.data;

  // Snapshot fields before derivation for provenance tracking
  const preInc = new Set(Object.keys(income));
  const preBal = new Set(Object.keys(balance));
  const preCf = new Set(Object.keys(cashFlow));

  // Run derived field computation (wraps in 'TTM' key for computeDerivedFields)
  const incMap = { TTM: income };
  const balMap = { TTM: balance };
  const cfMap = { TTM: cashFlow };
  computeDerivedFields(['TTM'], incMap, balMap, cfMap);

  // Build TTM provenance — mark derived fields with formulas
  const provIncome = { ...incResult.provenance };
  const provBalance = { ...balResult.provenance };
  const provCashFlow = { ...cfResult.provenance };

  for (const [stmt, pre, prov] of [
    [incMap.TTM, preInc, provIncome],
    [balMap.TTM, preBal, provBalance],
    [cfMap.TTM, preCf, provCashFlow],
  ]) {
    for (const field of Object.keys(stmt || {})) {
      if (!pre.has(field) && !prov[field]) {
        prov[field] = { tag: null, layer: 1, derived: true, confidence: null, formula: getDerivedFormula(field, incMap.TTM, balMap.TTM, cfMap.TTM) };
      }
    }
  }

  return {
    income: incMap.TTM,
    balance: balMap.TTM,
    cashFlow: cfMap.TTM,
    provenance: { income: provIncome, balance: provBalance, cashFlow: provCashFlow },
    quarter: `${latestQtr.fp} FY${latestQtr.fy}`,
    endDate: latestQtr.end,
  };
}

// ─── Quarterly Data Extraction ──────────────────────────────
// Extracts individual quarter values for all fiscal years that have 10-Q filings.
// Flow items (income, CF): YTD values are de-cumulated to get individual quarters.
//   Q1 = Q1_YTD, Q2 = Q2_YTD - Q1_YTD, Q3 = Q3_YTD - Q2_YTD, Q4 = FY - Q3_YTD
// Balance sheet: point-in-time from each quarter; Q4 = FY 10-K value.

function findQuarterlyFiscalYears(companyFacts) {
  const candidates = ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'Assets'];
  const fys = new Set();

  for (const tag of candidates) {
    const facts = companyFacts?.facts?.['us-gaap']?.[tag];
    if (!facts) continue;
    for (const entries of Object.values(facts.units || {})) {
      for (const e of entries) {
        if (e.form === '10-Q' && e.fy) fys.add(e.fy);
      }
    }
  }

  return [...fys].sort((a, b) => b - a);
}

function extractQuarterlySection(companyFacts, taxonomy, sectionType, fy) {
  const quarters = { Q1: {}, Q2: {}, Q3: {}, Q4: {} };

  for (const { field, tags, unit, negate } of taxonomy) {
    // Skip per-share USD items — will be derived from totals later
    if (unit === 'USD/shares') continue;

    const sign = negate ? -1 : 1;
    let found = false;
    for (const tag of tags) {
      if (found) break;

      const facts = companyFacts?.facts?.['us-gaap']?.[tag];
      if (!facts) continue;
      const entries = facts.units?.[unit] || [];

      if (sectionType === 'balance') {
        // Balance sheet: point-in-time from each quarter
        let anyFound = false;
        for (const fp of ['Q1', 'Q2', 'Q3']) {
          if (quarters[fp][field] != null) continue;
          const val = getQuarterlyInstant(entries, fy, fp);
          if (val != null) { quarters[fp][field] = val * sign; anyFound = true; }
        }
        // Q4 balance sheet = FY 10-K value
        if (quarters.Q4[field] == null) {
          const val = getAnnualTotal(entries, fy);
          if (val != null) { quarters.Q4[field] = val * sign; anyFound = true; }
        }
        if (anyFound) found = true;
      } else {
        // Flow items + share counts: extract YTD, then de-cumulate
        const q1ytd = getQuarterlyYTD(entries, fy, 'Q1');
        const q2ytd = getQuarterlyYTD(entries, fy, 'Q2');
        const q3ytd = getQuarterlyYTD(entries, fy, 'Q3');
        const fyTotal = getAnnualTotal(entries, fy);

        let anyFound = false;
        if (quarters.Q1[field] == null && q1ytd != null) { quarters.Q1[field] = q1ytd * sign; anyFound = true; }
        if (quarters.Q2[field] == null && q2ytd != null && q1ytd != null) { quarters.Q2[field] = (q2ytd - q1ytd) * sign; anyFound = true; }
        if (quarters.Q3[field] == null && q3ytd != null && q2ytd != null) { quarters.Q3[field] = (q3ytd - q2ytd) * sign; anyFound = true; }
        if (quarters.Q4[field] == null && fyTotal != null && q3ytd != null) { quarters.Q4[field] = (fyTotal - q3ytd) * sign; anyFound = true; }
        if (anyFound) found = true;
      }
    }
  }

  return quarters;
}

export async function fetchEdgarQuarterly(ticker, options = {}) {
  const { version = 'restated' } = options;

  const cik = await lookupCIK(ticker);
  if (!cik) return null;

  const [facts, splits] = await Promise.all([
    fetchCompanyFacts(cik),
    fetchSplits(ticker),
  ]);
  if (!facts) return null;

  const cacheKey = `edgar-quarterly:${ticker.toUpperCase()}:s${splits.length}:${version}`;
  const cached = await cacheGetAsync(cacheKey);
  if (cached) return cached;

  const availableFYs = findQuarterlyFiscalYears(facts);

  const quarterly = {};
  for (const fy of availableFYs) {
    const incQ = extractQuarterlySection(facts, INCOME_TAXONOMY, 'income', fy);
    const balQ = extractQuarterlySection(facts, BALANCE_TAXONOMY, 'balance', fy);
    const cfQ = extractQuarterlySection(facts, CASHFLOW_TAXONOMY, 'cashFlow', fy);

    quarterly[fy] = {};
    for (const qtr of ['Q1', 'Q2', 'Q3', 'Q4']) {
      const inc = incQ[qtr];
      const bal = balQ[qtr];
      const cf = cfQ[qtr];

      // Only include quarters that have some data
      const hasData = Object.keys(inc).length > 0 || Object.keys(bal).length > 0 || Object.keys(cf).length > 0;
      if (hasData) {
        // Compute derived fields for this quarter
        const incMap = { [qtr]: inc };
        const balMap = { [qtr]: bal };
        const cfMap = { [qtr]: cf };
        computeDerivedFields([qtr], incMap, balMap, cfMap);

        quarterly[fy][qtr] = { income: incMap[qtr], balance: balMap[qtr], cashFlow: cfMap[qtr] };
      }
    }
  }

  // Extract fiscal year end months before split adjustment (needed for date comparison)
  const fiscalMonths = extractFiscalYearEnds(facts);

  // Apply split adjustment to quarterly per-share/share-count fields
  for (const fy of availableFYs) {
    const fyMonth = fiscalMonths?.[fy];
    const factor = cumulativeSplitFactor(splits, fy, fyMonth);
    if (factor === 1) continue;
    for (const qtr of ['Q1', 'Q2', 'Q3', 'Q4']) {
      const q = quarterly[fy]?.[qtr];
      if (!q) continue;
      if (q.income) {
        for (const f of PER_SHARE_FIELDS.income) {
          if (q.income[f] != null) q.income[f] /= factor;
        }
        for (const f of SHARE_COUNT_FIELDS.income) {
          if (q.income[f] != null) q.income[f] *= factor;
        }
      }
      if (q.balance) {
        for (const f of SHARE_COUNT_FIELDS.balance) {
          if (q.balance[f] != null) q.balance[f] *= factor;
        }
      }
    }
  }
  const result = { quarterly, fiscalYears: availableFYs, fiscalMonths };

  const qtrCount = Object.values(quarterly).reduce((sum, fy) => sum + Object.keys(fy).length, 0);
  console.log(`EDGAR quarterly ${ticker} [${version}]: ${availableFYs.length} FYs, ${qtrCount} quarters total`);

  cacheSet(cacheKey, result, 'financials');
  return result;
}

// ─── Industry Overlay Helpers ────────────────────────────────
// Merge overlay-extracted fields into base statements.
// Overlay fields are additive — they never overwrite base fields.

function mergeOverlayStatements(base, overlay, years) {
  for (const year of years) {
    if (!overlay[year]) continue;
    if (!base[year]) base[year] = {};
    for (const [field, value] of Object.entries(overlay[year])) {
      if (base[year][field] == null) {
        base[year][field] = value;
      }
    }
  }
}

function mergeOverlayProvenance(baseProv, overlayProv, years) {
  for (const year of years) {
    if (!overlayProv[year]) continue;
    if (!baseProv[year]) baseProv[year] = {};
    for (const [field, prov] of Object.entries(overlayProv[year])) {
      if (!baseProv[year][field]) {
        baseProv[year][field] = prov;
      }
    }
  }
}

// ─── Public API ──────────────────────────────────────────────

export async function fetchEdgarStatements(ticker, options = {}) {
  const { version = 'restated' } = options;

  const cik = await lookupCIK(ticker);
  if (!cik) {
    console.warn(`EDGAR statements: CIK not found for "${ticker}"`);
    return null;
  }

  // Fetch company facts, split history, and company info (for SIC code) in parallel
  const [facts, splits, companyInfo] = await Promise.all([
    fetchCompanyFacts(cik),
    fetchSplits(ticker),
    fetchCompanyInfo(ticker).catch(() => null),
  ]);

  if (!facts) {
    console.warn(`EDGAR statements: company facts not available for CIK ${cik} (${ticker})`);
    return null;
  }

  // Detect industry type from SIC code for overlay selection
  const sicCode = companyInfo?.sic || '';
  const industryType = classifyIndustryType(sicCode);
  const overlay = getOverlay(industryType);

  // Include split count + version + industry type in cache key. v6: Layer 3 AI adapter added.
  const cacheKey = `edgar-statements:v6:${ticker.toUpperCase()}:s${splits.length}:${version}:${industryType}`;
  const cached = await cacheGetAsync(cacheKey);
  if (cached) return cached;

  const incSection = extractSection(facts, AUG_INCOME, version);
  const balSection = extractSection(facts, AUG_BALANCE, version);
  const cfSection = extractSection(facts, AUG_CASHFLOW, version);

  // Extract overlay fields (if any) — additive, same extraction mechanism
  let overlayIncSection = { fieldData: {}, years: new Set(), provenanceData: {} };
  let overlayBalSection = { fieldData: {}, years: new Set(), provenanceData: {} };
  let overlayCfSection = { fieldData: {}, years: new Set(), provenanceData: {} };
  if (overlay) {
    if (overlay.incomeFields?.length > 0) {
      overlayIncSection = extractSection(facts, augmentTaxonomy(overlay.incomeFields), version);
    }
    if (overlay.balanceFields?.length > 0) {
      overlayBalSection = extractSection(facts, augmentTaxonomy(overlay.balanceFields), version);
    }
    if (overlay.cashFlowFields?.length > 0) {
      overlayCfSection = extractSection(facts, augmentTaxonomy(overlay.cashFlowFields), version);
    }
  }

  // ── Layer 3: AI-assisted gap-fill ──────────────────────────
  // After L1+L2 extraction, check pre-built S&P 500 tag classifications
  // for orphan XBRL tags that could fill unresolved fields.
  const augOverlayInc = overlay?.incomeFields ? augmentTaxonomy(overlay.incomeFields) : [];
  const augOverlayBal = overlay?.balanceFields ? augmentTaxonomy(overlay.balanceFields) : [];
  const augOverlayCf = overlay?.cashFlowFields ? augmentTaxonomy(overlay.cashFlowFields) : [];
  const knownTags = collectKnownTags(AUG_INCOME, AUG_BALANCE, AUG_CASHFLOW, augOverlayInc, augOverlayBal, augOverlayCf);

  // Build missing fields list from all three sections
  const allResolvedIncome = new Set([...Object.keys(incSection.fieldData), ...Object.keys(overlayIncSection.fieldData)]);
  const allResolvedBalance = new Set([...Object.keys(balSection.fieldData), ...Object.keys(overlayBalSection.fieldData)]);
  const allResolvedCashFlow = new Set([...Object.keys(cfSection.fieldData), ...Object.keys(overlayCfSection.fieldData)]);

  const missingFields = [];
  for (const def of INCOME_TAXONOMY) {
    if (!allResolvedIncome.has(def.field)) {
      missingFields.push({ field: def.field, section: 'income', unit: def.unit, splitSensitive: def.splitSensitive || false });
    }
  }
  for (const def of BALANCE_TAXONOMY) {
    if (!allResolvedBalance.has(def.field)) {
      missingFields.push({ field: def.field, section: 'balance', unit: def.unit, splitSensitive: def.splitSensitive || false });
    }
  }
  for (const def of CASHFLOW_TAXONOMY) {
    if (!allResolvedCashFlow.has(def.field)) {
      missingFields.push({ field: def.field, section: 'cashFlow', unit: def.unit, splitSensitive: def.splitSensitive || false });
    }
  }

  // Get Layer 3 suggestions from pre-built cache (synchronous, no API calls)
  let layer3Count = 0;
  const l3Suggestions = getLayer3Suggestions(facts, missingFields, knownTags);
  for (const suggestion of l3Suggestions) {
    const { field, tag, unit, section, confidence, negate, splitSensitive } = suggestion;
    const extractFn = (version === 'original' || splitSensitive) ? extractAnnualFactOriginal : extractAnnualFact;
    const data = extractFn(facts, tag, unit);
    if (!data) continue;

    // Determine target section
    const target = section === 'income' ? incSection
                 : section === 'balance' ? balSection
                 : cfSection;

    // Only fill gaps — don't overwrite L1/L2 values
    let filled = false;
    for (const [year, val] of Object.entries(data)) {
      if (target.fieldData[field]?.[year] == null) {
        if (!target.fieldData[field]) target.fieldData[field] = {};
        target.fieldData[field][year] = negate ? -val : val;

        if (!target.provenanceData[field]) target.provenanceData[field] = {};
        target.provenanceData[field][year] = {
          tag, layer: 3, derived: false, confidence, formula: null,
        };
        target.years.add(Number(year));
        filled = true;
      }
    }
    if (filled) layer3Count++;
  }

  const allYears = new Set([
    ...incSection.years, ...balSection.years, ...cfSection.years,
    ...overlayIncSection.years, ...overlayBalSection.years, ...overlayCfSection.years,
  ]);
  const years = [...allYears].sort((a, b) => b - a);

  const income = buildStatements(incSection.fieldData, years);
  const balance = buildStatements(balSection.fieldData, years);
  const cashFlow = buildStatements(cfSection.fieldData, years);

  // Merge overlay fields into base statements
  if (overlay) {
    mergeOverlayStatements(income, buildStatements(overlayIncSection.fieldData, years), years);
    mergeOverlayStatements(balance, buildStatements(overlayBalSection.fieldData, years), years);
    mergeOverlayStatements(cashFlow, buildStatements(overlayCfSection.fieldData, years), years);
  }

  // Build provenance from extraction (which XBRL tag matched per field per year)
  const provIncome = buildProvenance(incSection.provenanceData, years);
  const provBalance = buildProvenance(balSection.provenanceData, years);
  const provCashFlow = buildProvenance(cfSection.provenanceData, years);

  // Merge overlay provenance
  if (overlay) {
    mergeOverlayProvenance(provIncome, buildProvenance(overlayIncSection.provenanceData, years), years);
    mergeOverlayProvenance(provBalance, buildProvenance(overlayBalSection.provenanceData, years), years);
    mergeOverlayProvenance(provCashFlow, buildProvenance(overlayCfSection.provenanceData, years), years);
  }

  // Extract fiscal year end months (e.g. { 2024: 'Sep', 2023: 'Sep' })
  // Needed before split adjustment for correct date comparison on non-calendar FY companies
  const fiscalMonths = extractFiscalYearEnds(facts);

  // Normalize per-share values and share counts for stock splits
  // (must happen before derived fields so auto-computed EPS uses adjusted shares)
  applySplitAdjustment(years, income, balance, cashFlow, splits, fiscalMonths);

  // Snapshot field keys before derivation so we can identify derived fields
  const preDeriveIncome = Object.fromEntries(years.map(y => [y, new Set(Object.keys(income[y] || {}))]));
  const preDeriveBalance = Object.fromEntries(years.map(y => [y, new Set(Object.keys(balance[y] || {}))]));
  const preDeriveCashFlow = Object.fromEntries(years.map(y => [y, new Set(Object.keys(cashFlow[y] || {}))]));

  // Compute all derived fields (base + overlay)
  computeDerivedFields(years, income, balance, cashFlow);
  if (overlay?.computeDerived) {
    overlay.computeDerived(years, income, balance, cashFlow);
  }

  // Mark derived fields in provenance (fields added by computeDerivedFields + overlay)
  for (const year of years) {
    for (const [statements, pre, prov] of [
      [income, preDeriveIncome, provIncome],
      [balance, preDeriveBalance, provBalance],
      [cashFlow, preDeriveCashFlow, provCashFlow],
    ]) {
      const stmt = statements[year];
      if (!stmt) continue;
      const preFields = pre[year] || new Set();
      const inc = income[year] || {};
      const bal = balance[year] || {};
      const cf = cashFlow[year] || {};
      for (const field of Object.keys(stmt)) {
        if (!preFields.has(field) && !prov[year]?.[field]) {
          if (!prov[year]) prov[year] = {};
          prov[year][field] = { tag: null, layer: 1, derived: true, confidence: null, formula: getDerivedFormula(field, inc, bal, cf) };
        }
      }
    }
  }

  // Compute TTM from latest quarterly filing
  const latestQtr = findLatestQuarter(facts);
  const ttm = computeTTM(facts, latestQtr);

  const provenance = { income: provIncome, balance: provBalance, cashFlow: provCashFlow };
  const result = { years, income, balance, cashFlow, fiscalMonths, ttm, provenance, industryType };

  const splitNote = splits.length > 0 ? `, ${splits.length} split(s) adjusted` : '';
  const incFields = Object.keys(incSection.fieldData);
  const balFields = Object.keys(balSection.fieldData);
  const cfFields = Object.keys(cfSection.fieldData);

  // Count Layer 2 resolved fields
  const countL2 = (prov) => {
    let n = 0;
    for (const yr of Object.values(prov)) {
      for (const p of Object.values(yr || {})) {
        if (p?.layer === 2) { n++; break; } // count unique fields, not year×field
      }
    }
    return n;
  };
  const l2Count = countL2(provIncome) + countL2(provBalance) + countL2(provCashFlow);
  const l2Note = l2Count > 0 ? `, ${l2Count} L2` : '';
  const l3Note = layer3Count > 0 ? `, ${layer3Count} L3` : '';
  const overlayNote = industryType !== 'standard' ? `, overlay: ${industryType}` : '';

  // Count overlay fields
  const overlayFieldCount = overlay
    ? Object.keys(overlayIncSection.fieldData).length + Object.keys(overlayBalSection.fieldData).length + Object.keys(overlayCfSection.fieldData).length
    : 0;
  const overlayFieldNote = overlayFieldCount > 0 ? `, ${overlayFieldCount} overlay fields` : '';

  console.log(`EDGAR statements ${ticker} [${version}]: ${years.length} years (${years[years.length - 1]}-${years[0]}), ` +
    `income: ${incFields.length} fields, balance: ${balFields.length} fields, cashFlow: ${cfFields.length} fields${splitNote}${l2Note}${l3Note}${overlayNote}${overlayFieldNote}`);

  cacheSet(cacheKey, result, 'financials');
  return result;
}

export { INCOME_TAXONOMY, BALANCE_TAXONOMY, CASHFLOW_TAXONOMY, computeDerivedFields, getDerivedFormula, findQuarterlyFiscalYears, extractSection, buildProvenance };
