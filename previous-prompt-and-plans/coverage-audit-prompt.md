# Task: XBRL Taxonomy Coverage Audit — S&P 500

## What You're Doing

Write a Node.js script that measures how well Thes1s's current XBRL tag mapping covers the S&P 500. For each company, pull their EDGAR companyfacts data and check which of our mapped fields have data. Produce a heat map showing coverage gaps by field and by industry.

This is a one-time diagnostic script — it doesn't need to integrate with the app. Put it in `validation/scripts/coverage-audit.js`. It should be runnable with `node validation/scripts/coverage-audit.js`.

## SEC EDGAR API Details

- **Endpoint:** `https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json` — returns all XBRL facts for a company
- **CIK lookup:** `https://www.sec.gov/files/company_tickers.json` — maps tickers to CIK numbers (zero-pad CIK to 10 digits)
- **Rate limit:** 10 requests/second. Add a 120ms delay between requests.
- **Required header:** `User-Agent: Thes1s/1.0 (contact@thes1s.app)` — SEC blocks requests without a User-Agent.
- The companyfacts JSON structure: `facts['us-gaap'][tagName].units[unitType]` returns an array of entries. Each entry has `{ val, end, fy, fp, form, filed }`. We only care about 10-K filings (`form === '10-K'`).

## S&P 500 Ticker List

Fetch the current S&P 500 constituents from Wikipedia:
`https://en.wikipedia.org/wiki/List_of_S%26P_500_companies`

Parse the HTML table to extract ticker symbols and GICS sector/sub-industry. You'll need `cheerio` for HTML parsing — install it if not present. If Wikipedia fetch fails, fall back to a hardcoded list of at least 100 diverse tickers across all 11 GICS sectors.

## The Taxonomy to Test

For each company, check whether their companyfacts contain at least one matching tag (with 10-K data) for each field below. A field "has coverage" for a company if ANY of its listed tags has at least one 10-K entry in the companyfacts.

Split into three priority tiers for the output:

### Tier 1 — Scoring-Critical Fields (feed Rule One Score directly)
These fields feed growth rates, return metrics, or debt ratios that determine the Rule One Score. A gap here means wrong scores.

```
INCOME:
  revenues: [RevenueFromContractWithCustomerExcludingAssessedTax, Revenues, SalesRevenueNet, SalesRevenueGoodsNet, RevenueFromContractWithCustomerIncludingAssessedTax] (USD)
  operating_income_loss: [OperatingIncomeLoss] (USD)
  net_income_loss: [NetIncomeLoss, ProfitLoss, NetIncomeLossAvailableToCommonStockholdersBasic] (USD)
  basic_earnings_per_share: [EarningsPerShareBasic] (USD/shares)
  diluted_earnings_per_share: [EarningsPerShareDiluted] (USD/shares)
  basic_average_shares: [WeightedAverageNumberOfSharesOutstandingBasic, WeightedAverageNumberOfShareOutstandingBasicAndDiluted] (shares)
  diluted_average_shares: [WeightedAverageNumberOfDilutedSharesOutstanding] (shares)
  dividends_per_share: [CommonStockDividendsPerShareDeclared, CommonStockDividendsPerShareCashPaid] (USD/shares)
  income_tax: [IncomeTaxExpenseBenefit] (USD)

BALANCE SHEET:
  cash: [CashAndCashEquivalentsAtCarryingValue, Cash] (USD)
  long_term_debt: [LongTermDebtNoncurrent, LongTermDebt, LongTermLineOfCredit] (USD)
  short_term_debt: [ShortTermBorrowings, DebtCurrent, CommercialPaper] (USD)
  current_portion_lt_debt: [LongTermDebtCurrent] (USD)
  equity: [StockholdersEquity, StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest] (USD)
  retained_earnings: [RetainedEarningsAccumulatedDeficit, RetainedEarningsUnappropriated] (USD)
  shares_outstanding: [CommonStockSharesOutstanding, CommonStockSharesIssued] (shares)
  assets: [Assets] (USD)
  liabilities: [Liabilities] (USD)

CASH FLOW:
  net_cash_flow_from_operating_activities: [NetCashProvidedByUsedInOperatingActivities, NetCashProvidedByUsedInOperatingActivitiesContinuingOperations] (USD)
  capital_expenditures: [PaymentsToAcquirePropertyPlantAndEquipment, PaymentsToAcquireProductiveAssets, PaymentsToAcquireOtherPropertyPlantAndEquipment] (USD)
  depreciation_amortization: [DepreciationDepletionAndAmortization, DepreciationAndAmortization, DepreciationAmortizationAndAccretionNet] (USD)
  dividends_paid: [PaymentsOfDividendsCommonStock, PaymentsOfDividends, PaymentsOfOrdinaryDividends] (USD)
  share_repurchases: [PaymentsForRepurchaseOfCommonStock, PaymentsForRepurchaseOfEquity] (USD)
  free_cash_flow: DERIVED (operating CF - capex, so covered if both parents are covered)
```

### Tier 2 — Display Fields (shown in financial statements UI, but don't affect scores)

```
INCOME:
  cost_of_revenue: [CostOfRevenue, CostOfGoodsAndServicesSold, CostOfGoodsSold] (USD)
  gross_profit: [GrossProfit] (USD)
  sga: [SellingGeneralAndAdministrativeExpense, SellingAndMarketingExpense, GeneralAndAdministrativeExpense] (USD)
  research_and_development: [ResearchAndDevelopmentExpense, ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost] (USD)
  depreciation_amortization_is: [DepreciationAndAmortization, DepreciationDepletionAndAmortization] (USD)
  operating_expenses: [OperatingExpenses, CostsAndExpenses] (USD)
  interest_expense: [InterestExpense, InterestExpenseDebt, InterestExpenseOperating] (USD)
  income_before_tax: [IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest, IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments, IncomeLossFromContinuingOperationsBeforeIncomeTaxesDomestic] (USD)

BALANCE SHEET:
  accounts_receivable: [AccountsReceivableNetCurrent, ReceivablesNetCurrent, AccountsReceivableNet] (USD)
  inventory: [InventoryNet, InventoryFinishedGoodsAndWorkInProcess, InventoryRawMaterialsAndSupplies] (USD)
  current_assets: [AssetsCurrent] (USD)
  property_plant_equipment: [PropertyPlantAndEquipmentNet, PropertyPlantAndEquipmentAndFinanceLeaseRightOfUseAssetAfterAccumulatedDepreciationAndAmortization] (USD)
  goodwill: [Goodwill] (USD)
  intangible_assets: [IntangibleAssetsNetExcludingGoodwill, FiniteLivedIntangibleAssetsNet, IndefiniteLivedIntangibleAssetsExcludingGoodwill] (USD)
  current_liabilities: [LiabilitiesCurrent] (USD)
  additional_paid_in_capital: [AdditionalPaidInCapitalCommonStock, AdditionalPaidInCapital] (USD)
  common_stock: [CommonStockValue, CommonStocksIncludingAdditionalPaidInCapital] (USD)
  aoci: [AccumulatedOtherComprehensiveIncomeLossNetOfTax] (USD)
  treasury_stock: [TreasuryStockValue, TreasuryStockCommonValue] (USD)
  liabilities_and_equity: [LiabilitiesAndStockholdersEquity] (USD)
  operating_lease_rou_asset: [OperatingLeaseRightOfUseAsset] (USD)
  operating_lease_liability_current: [OperatingLeaseLiabilityCurrent] (USD)
  operating_lease_liability_noncurrent: [OperatingLeaseLiabilityNoncurrent] (USD)

CASH FLOW:
  stock_based_compensation: [ShareBasedCompensation, AllocatedShareBasedCompensationExpense] (USD)
  deferred_income_tax: [DeferredIncomeTaxExpenseBenefit, DeferredIncomeTaxesAndTaxCredits] (USD)
  change_in_receivables: [IncreaseDecreaseInAccountsReceivable, IncreaseDecreaseInReceivables] (USD)
  change_in_inventory: [IncreaseDecreaseInInventories] (USD)
  change_in_payables: [IncreaseDecreaseInAccountsPayable, IncreaseDecreaseInAccountsPayableAndAccruedLiabilities] (USD)
  net_cash_flow_from_investing_activities: [NetCashProvidedByUsedInInvestingActivities, NetCashProvidedByUsedInInvestingActivitiesContinuingOperations] (USD)
  net_cash_flow_from_financing_activities: [NetCashProvidedByUsedInFinancingActivities, NetCashProvidedByUsedInFinancingActivitiesContinuingOperations] (USD)
  proceeds_from_lt_debt: [ProceedsFromIssuanceOfLongTermDebt, ProceedsFromIssuanceOfDebt] (USD)
  repayments_of_lt_debt: [RepaymentsOfLongTermDebt, RepaymentsOfDebt] (USD)
```

### Tier 3 — Expanded/Detail Fields (nice-to-have sub-breakdowns)

```
INCOME:
  other_operating_expenses: [OtherOperatingIncomeExpenseNet, RestructuringCharges, GoodwillImpairmentLoss, AssetImpairmentCharges] (USD)
  interest_income: [InvestmentIncomeInterest, InterestIncomeOther, InterestAndDividendIncomeOperating, InvestmentIncomeInterestAndDividend] (USD)
  net_interest_income: [InterestIncomeExpenseNet, InterestIncomeExpenseNonoperatingNet] (USD)
  other_income_expense: [NonoperatingIncomeExpense, OtherNonoperatingIncomeExpense, IncomeLossFromEquityMethodInvestments, GainLossOnInvestments] (USD)
  income_from_continuing_operations: [IncomeLossFromContinuingOperations] (USD)

BALANCE SHEET:
  short_term_investments: [ShortTermInvestments, MarketableSecuritiesCurrent, AvailableForSaleSecuritiesCurrent, DebtSecuritiesAvailableForSaleCurrent] (USD)
  prepaid_expenses: [PrepaidExpenseAndOtherAssetsCurrent, PrepaidExpenseCurrent] (USD)
  other_current_assets: [OtherAssetsCurrent] (USD)
  property_plant_equipment_gross: [PropertyPlantAndEquipmentGross] (USD)
  accumulated_depreciation: [AccumulatedDepreciationDepletionAndAmortizationPropertyPlantAndEquipment] (USD)
  long_term_investments: [LongTermInvestments, InvestmentsAndAdvances, MarketableSecuritiesNoncurrent, AvailableForSaleSecuritiesNoncurrent, DebtSecuritiesAvailableForSaleNoncurrent] (USD)
  deferred_tax_assets: [DeferredIncomeTaxAssetsNet] (USD)
  other_noncurrent_assets: [OtherAssetsNoncurrent, OtherAssets] (USD)
  accounts_payable: [AccountsPayableCurrent, AccountsPayableAndAccruedLiabilitiesCurrent] (USD)
  accrued_liabilities: [AccruedLiabilitiesCurrent, EmployeeRelatedLiabilitiesCurrent] (USD)
  deferred_revenue_current: [DeferredRevenueCurrent, ContractWithCustomerLiabilityCurrent] (USD)
  other_current_liabilities: [OtherLiabilitiesCurrent] (USD)
  deferred_tax_liabilities: [DeferredIncomeTaxLiabilitiesNet, DeferredIncomeTaxLiabilities] (USD)
  pension_liabilities: [PensionAndOtherPostretirementDefinedBenefitPlansLiabilitiesNoncurrent] (USD)
  other_noncurrent_liabilities: [OtherLiabilitiesNoncurrent] (USD)
  noncurrent_liabilities: [LiabilitiesNoncurrent] (USD)
  minority_interest: [MinorityInterest, RedeemableNoncontrollingInterestEquityCarryingAmount] (USD)

CASH FLOW:
  other_noncash_items: [OtherNoncashIncomeExpense] (USD)
  change_in_other_working_capital: [IncreaseDecreaseInOtherOperatingCapitalNet, IncreaseDecreaseInOperatingCapital] (USD)
  sale_of_ppe: [ProceedsFromSaleOfPropertyPlantAndEquipment] (USD)
  purchase_of_investments: [PaymentsToAcquireInvestments, PaymentsToAcquireShortTermInvestments, PaymentsToAcquireAvailableForSaleSecuritiesDebt, PaymentsToAcquireMarketableSecurities] (USD)
  sale_of_investments: [ProceedsFromSaleOfInvestments, ProceedsFromSaleOfShortTermInvestments, ProceedsFromSaleAndMaturityOfMarketableSecurities, ProceedsFromMaturitiesPrepaymentsAndCallsOfAvailableForSaleSecurities, ProceedsFromSaleOfAvailableForSaleSecuritiesDebt] (USD)
  purchase_of_business: [PaymentsToAcquireBusinessesNetOfCashAcquired, PaymentsToAcquireBusinessesGross] (USD)
  proceeds_from_stock_issuance: [ProceedsFromIssuanceOfCommonStock, ProceedsFromStockOptionsExercised] (USD)
  effect_of_exchange_rate: [EffectOfExchangeRateOnCashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents, EffectOfExchangeRateOnCashAndCashEquivalents] (USD)
```

## How to Check Coverage

For each field, check if the company's companyfacts has ANY of the listed tags under `facts['us-gaap']`, with at least one entry where `form === '10-K'` and `unit` matches (USD, USD/shares, or shares as specified).

A field is "covered" for a company = at least one tag has 10-K data.
A field is "not covered" = none of the tags have any 10-K data.

For fields with `unit: shares` or `unit: USD/shares`, check the appropriate unit key in the XBRL data (`shares` or `USD/shares`).

## Output Requirements

Save all output to `validation/reports/coverage-audit-results.md`. The report should contain:

### 1. Executive Summary
- Total companies scanned (should be ~500)
- Companies where CIK lookup failed (list them)
- Companies where companyfacts fetch failed (list them)
- Overall Tier 1 coverage % (average across all Tier 1 fields)
- Overall Tier 2 coverage %
- Overall Tier 3 coverage %

### 2. Field-Level Coverage Table
For EACH field across all three tiers, show:
- Field name
- Tier (1/2/3)
- Coverage % (what % of successfully fetched companies have this field)
- # of companies missing this field
- List of GICS sectors where coverage drops below 80%

Sort by coverage % ascending (worst gaps first).

### 3. Sector-Level Heat Map
For each GICS sector, show the average Tier 1 coverage %. This tells us which industries are most problematic. Format as a table:

| Sector | Companies | Tier 1 Avg | Worst Field | Worst Field % |
|--------|-----------|------------|-------------|---------------|

### 4. Problem Companies List
List every company where ANY Tier 1 field is missing. Group by sector. For each company show:
- Ticker
- Company name
- Sector / Sub-industry
- Which Tier 1 fields are missing

### 5. Tag Hit Analysis (for Tier 1 fields only)
For each Tier 1 field, show which specific tag(s) provided coverage and how often. This tells us which fallback tags are actually earning their keep. Format:

```
revenues:
  RevenueFromContractWithCustomerExcludingAssessedTax: 412 companies (82%)
  Revenues: 63 companies (13%)  [filled gaps not covered by tag above]
  SalesRevenueNet: 8 companies (2%)  [filled gaps]
  ...
  TOTAL COVERED: 489 (98%)
  NOT COVERED: 11 (2%)
```

### 6. Raw Data CSV
Also save a CSV at `validation/reports/coverage-audit-raw.csv` with one row per company:
`ticker, company_name, sector, sub_industry, cik, [one column per field: 1=covered, 0=not covered]`

## Implementation Notes

- Use native `fetch` (Node 18+). No need for axios.
- Respect the 10 req/sec rate limit — 120ms delay between EDGAR API calls.
- Save progress as you go. The S&P 500 scan will take ~60-90 minutes at rate limit. Write a checkpoint file (`validation/reports/coverage-audit-checkpoint.json`) after every 50 companies so you can resume if interrupted. On startup, check for the checkpoint file and skip already-processed companies.
- Log progress to console: `[142/503] AAPL — Tier 1: 100%, Tier 2: 94%, Tier 3: 72%`
- Handle errors gracefully — if a company fails, log it and move on. Don't let one failure crash the whole run.
- The `company_tickers.json` maps internal index → {cik_str, ticker, title}. CIK must be zero-padded to 10 digits for the companyfacts URL.
