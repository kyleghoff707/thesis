# EDGAR XBRL Taxonomy Reference

Comprehensive mapping of US-GAAP XBRL tags to financial statement line items.
Built from SEC EDGAR documentation, FASB taxonomy specs, XBRL US Data Quality Committee rules, Calcbench element definitions, EdgarTools/Intrinio/sec-api standardization mappings, and direct EDGAR API research.

**Key**: Tags are listed in priority order (most common first). The `extractAnnualFact` function in `edgar.js` tries tags in order and merges results -- first tag wins per year, later tags fill gaps. This handles tag transitions (e.g., ASC 606 revenue change in 2018).

**Period types**:
- `duration` = income statement / cash flow (covers a period, e.g., fiscal year)
- `instant` = balance sheet (point in time, e.g., end of fiscal year)

**Unit types**: `USD`, `USD/shares`, `shares`

---

## 1. Income Statement (duration)

### Revenue
| Line Item | XBRL Tag | Notes |
|-----------|----------|-------|
| Revenue (ASC 606) | `RevenueFromContractWithCustomerExcludingAssessedTax` | Post-2018 standard, excludes sales tax. Most companies since ASC 606 adoption. |
| Revenue (general) | `Revenues` | Broad catch-all. Many companies use this. |
| Revenue (legacy net) | `SalesRevenueNet` | Pre-ASC 606 tag, deprecated ~2018. Still in older filings. |
| Revenue (goods, legacy) | `SalesRevenueGoodsNet` | Pre-ASC 606. Product companies. |
| Revenue (including tax) | `RevenueFromContractWithCustomerIncludingAssessedTax` | Rare -- includes assessed tax. |
| Revenue (services, legacy) | `SalesRevenueServicesNet` | Pre-ASC 606. Service companies. |
| Revenue (alternative) | `RevenueNotFromContractWithCustomer` | Non-ASC 606 revenue (e.g., leasing income). Supplemental only. |

**Tag transition**: `SalesRevenueNet` / `SalesRevenueGoodsNet` (pre-2018) --> `RevenueFromContractWithCustomerExcludingAssessedTax` (post-2018). Must merge across both for full history.

### Cost of Revenue
| Line Item | XBRL Tag | Notes |
|-----------|----------|-------|
| Cost of Revenue | `CostOfRevenue` | Broad -- includes COGS + service costs. Most common. |
| Cost of Goods & Services Sold | `CostOfGoodsAndServicesSold` | Equivalent to CostOfRevenue for most filers. |
| Cost of Goods Sold (only) | `CostOfGoodsSold` | Product-only COGS. Rarer. |
| COGS ex-D&A | `CostOfGoodsSoldExcludingDepreciationDepletionAndAmortization` | Some companies separate D&A from COGS. |

### Gross Profit
| Line Item | XBRL Tag | Notes |
|-----------|----------|-------|
| Gross Profit | `GrossProfit` | Revenue minus COGS. Not all companies report this directly. |

**Derivation**: If `GrossProfit` missing, compute `revenues - cost_of_revenue`.

### Operating Expenses
| Line Item | XBRL Tag | Notes |
|-----------|----------|-------|
| SG&A | `SellingGeneralAndAdministrativeExpense` | Most common. Some companies combine selling + G&A. |
| Selling & Marketing | `SellingAndMarketingExpense` | When SG&A is split. Add to G&A for total. |
| General & Administrative | `GeneralAndAdministrativeExpense` | When SG&A is split. Add to S&M for total. |
| R&D | `ResearchAndDevelopmentExpense` | Standard R&D tag. |
| R&D (ex-acquired) | `ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost` | Excludes in-process R&D from acquisitions. |
| R&D (software) | `ResearchAndDevelopmentExpenseSoftwareExcludingAcquiredInProcessCost` | Software-specific R&D. Rare. |
| Total Operating Expenses | `OperatingExpenses` | All operating expenses (may include COGS). |
| Total Costs and Expenses | `CostsAndExpenses` | COGS + all operating expenses. Broader than OperatingExpenses. |
| D&A (on income statement) | `DepreciationAndAmortization` | When D&A is a separate line on income statement. |
| D&A (on income statement) | `DepreciationDepletionAndAmortization` | Broader -- includes depletion (mining/oil companies). |
| Restructuring | `RestructuringCharges` | One-time restructuring costs. |
| Restructuring & related | `RestructuringSettlementAndImpairmentProvisions` | Broader restructuring line. |
| Goodwill Impairment | `GoodwillImpairmentLoss` | Write-down of goodwill. |
| Asset Impairment | `AssetImpairmentCharges` | Write-down of long-lived assets. |
| Impairment (intangibles) | `ImpairmentOfIntangibleAssetsFinitelived` | Impairment of finite-lived intangible assets. |

### Operating Income
| Line Item | XBRL Tag | Notes |
|-----------|----------|-------|
| Operating Income (Loss) | `OperatingIncomeLoss` | Standard EBIT proxy. Most companies report this. |

**Note on EBIT/EBITDA**: There are NO official XBRL tags for EBIT or EBITDA. These are non-GAAP measures. Derive them:
- EBIT = `OperatingIncomeLoss` (close proxy, but not identical if there are non-operating items above the operating line)
- EBITDA = `OperatingIncomeLoss` + `DepreciationDepletionAndAmortization` (from cash flow statement)

### Non-Operating Items
| Line Item | XBRL Tag | Notes |
|-----------|----------|-------|
| Interest Expense | `InterestExpense` | Total interest expense (operating + non-operating combined). As of 2024, definition broadened. |
| Interest Expense (operating) | `InterestExpenseOperating` | New in 2024 taxonomy. Operating interest only. |
| Interest Expense (non-operating) | `InterestExpenseNonoperating` | New in 2024 taxonomy. Non-operating interest. |
| Interest Expense (debt) | `InterestExpenseDebt` | Interest specifically on debt instruments. |
| Interest Income | `InterestIncomeOther` | Interest earned on investments/deposits. |
| Interest Income/Expense (net, operating) | `InterestIncomeExpenseNet` | Net operating interest. Should NOT include non-operating. |
| Interest Income/Expense (net, non-operating) | `InterestIncomeExpenseNonoperatingNet` | Net non-operating interest income/expense. |
| Non-operating Income/Expense | `NonoperatingIncomeExpense` | Catch-all for non-operating items. |
| Other Non-operating Income/Expense | `OtherNonoperatingIncomeExpense` | Residual non-operating items. |
| Income from Equity Method | `IncomeLossFromEquityMethodInvestments` | Earnings from equity-method investees. |
| Gain/Loss on Investments | `GainLossOnInvestments` | Realized + unrealized gains/losses on investments. |
| Gain/Loss on Sale of Business | `GainLossOnSaleOfBusiness` | Gain or loss from divesting a business segment. |
| Gain/Loss on Sale of PP&E | `GainLossOnSaleOfPropertyPlantEquipment` | Gain or loss from selling fixed assets. |
| Foreign Currency Gain/Loss | `ForeignCurrencyTransactionGainLossBeforeTax` | Currency translation effects. |

### Pre-Tax Income / Tax / Net Income
| Line Item | XBRL Tag | Notes |
|-----------|----------|-------|
| Pre-tax Income (standard) | `IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest` | Most common pre-tax income tag. |
| Pre-tax Income (alt) | `IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments` | Older variant. |
| Pre-tax Income (domestic only) | `IncomeLossFromContinuingOperationsBeforeIncomeTaxesDomestic` | Domestic portion only. Less useful for total. |
| Pre-tax Income (foreign only) | `IncomeLossFromContinuingOperationsBeforeIncomeTaxesForeign` | Foreign portion only. |
| Income Tax Expense | `IncomeTaxExpenseBenefit` | Total income tax provision. Positive = expense, negative = benefit. |
| Current Tax Expense | `CurrentIncomeTaxExpenseBenefit` | Current portion of tax provision. |
| Deferred Tax Expense | `DeferredIncomeTaxExpenseBenefit` | Deferred portion of tax provision. |
| Net Income | `NetIncomeLoss` | Net income attributable to parent company. Most common. |
| Profit or Loss | `ProfitLoss` | Net income including minority interest. Broader. |
| Net Income (to common) | `NetIncomeLossAvailableToCommonStockholdersBasic` | After preferred dividends. For EPS calculation. |
| Net Income (to common, diluted) | `NetIncomeLossAvailableToCommonStockholdersDiluted` | After preferred dividends, diluted basis. |
| Discontinued Operations | `IncomeLossFromDiscontinuedOperationsNetOfTax` | Income/loss from discontinued ops, net of tax. |
| Comprehensive Income | `ComprehensiveIncomeNetOfTax` | Net income + other comprehensive income. |
| Other Comprehensive Income | `OtherComprehensiveIncomeLossNetOfTax` | OCI items (FX, hedges, unrealized gains). Duration type. |

### Per-Share Data
| Line Item | XBRL Tag | Unit | Notes |
|-----------|----------|------|-------|
| EPS (diluted) | `EarningsPerShareDiluted` | USD/shares | Standard diluted EPS. |
| EPS (basic) | `EarningsPerShareBasic` | USD/shares | Basic EPS. |
| Diluted Shares | `WeightedAverageNumberOfDilutedSharesOutstanding` | shares | Weighted average diluted shares. |
| Basic Shares | `WeightedAverageNumberOfSharesOutstandingBasic` | shares | Weighted average basic shares. |
| Basic & Diluted Shares | `WeightedAverageNumberOfShareOutstandingBasicAndDiluted` | shares | When basic = diluted (no dilutive instruments). |

**Derivation**: If `EarningsPerShareDiluted` missing, compute `NetIncomeLoss / WeightedAverageNumberOfDilutedSharesOutstanding`.

---

## 2. Balance Sheet (instant)

### Current Assets
| Line Item | XBRL Tag | Notes |
|-----------|----------|-------|
| Total Current Assets | `AssetsCurrent` | Sum of all current assets. |
| Cash & Equivalents | `CashAndCashEquivalentsAtCarryingValue` | Pure cash + money market. Most common. |
| Cash + Short-term Investments | `CashCashEquivalentsAndShortTermInvestments` | Cash + short-term securities combined. Broader. |
| Cash (simple) | `Cash` | Rarely used alone. Very old filings. |
| Restricted Cash (current) | `RestrictedCashCurrent` | Cash restricted for specific purposes. |
| Short-term Investments | `ShortTermInvestments` | Marketable securities, CDs, etc. < 1 year maturity. |
| Marketable Securities (current) | `MarketableSecuritiesCurrent` | Traded securities classified as current. |
| Available-for-Sale (current) | `AvailableForSaleSecuritiesCurrent` | AFS debt securities, current portion. Legacy tag. |
| Available-for-Sale (current, new) | `DebtSecuritiesAvailableForSaleCurrent` | AFS debt securities, current. Post-2018 tag. |
| Accounts Receivable (net) | `AccountsReceivableNetCurrent` | Trade receivables net of allowance. Most common. |
| Receivables (net) | `ReceivablesNetCurrent` | Broader -- includes trade + other receivables. |
| Accounts Receivable (gross) | `AccountsReceivableGrossCurrent` | Before allowance for doubtful accounts. |
| Allowance for Doubtful Accounts | `AllowanceForDoubtfulAccountsReceivableCurrent` | Contra-asset. |
| Inventory (net) | `InventoryNet` | Standard inventory. Most common. |
| Inventory (finished goods + WIP) | `InventoryFinishedGoodsAndWorkInProcess` | Subset of inventory. |
| Inventory (raw materials) | `InventoryRawMaterialsAndSupplies` | Subset of inventory. |
| Inventory (finished goods) | `InventoryFinishedGoods` | Subset. |
| Inventory (work in process) | `InventoryWorkInProcess` | Subset. |
| Prepaid Expenses | `PrepaidExpenseAndOtherAssetsCurrent` | Prepaid + other current combined. Very common. |
| Prepaid Expenses (only) | `PrepaidExpenseCurrent` | Prepaid expenses alone. |
| Other Current Assets | `OtherAssetsCurrent` | Catch-all for other current items. |
| Assets Held for Sale | `AssetsHeldForSaleNotPartOfDisposalGroupCurrent` | Assets being sold, current. |
| Contract Assets (current) | `ContractWithCustomerAssetNetCurrent` | ASC 606 contract assets. |
| Income Taxes Receivable | `IncomeTaxesReceivable` | Tax refunds expected. |

### Non-Current Assets
| Line Item | XBRL Tag | Notes |
|-----------|----------|-------|
| PP&E (net) | `PropertyPlantAndEquipmentNet` | Net of accumulated depreciation. Most common. |
| PP&E (gross) | `PropertyPlantAndEquipmentGross` | Before accumulated depreciation. |
| Accumulated Depreciation | `AccumulatedDepreciationDepletionAndAmortizationPropertyPlantAndEquipment` | Contra-asset for PP&E. |
| Operating Lease ROU Asset | `OperatingLeaseRightOfUseAsset` | ASC 842. Right-of-use asset for operating leases. Post-2019. |
| Finance Lease ROU Asset | `FinanceLeaseRightOfUseAsset` | ASC 842. Right-of-use asset for finance leases. |
| Goodwill | `Goodwill` | Goodwill from acquisitions. |
| Intangible Assets (ex-goodwill) | `IntangibleAssetsNetExcludingGoodwill` | Patents, trademarks, customer lists, etc. |
| Finite-Lived Intangibles (net) | `FiniteLivedIntangibleAssetsNet` | Amortizable intangibles only. |
| Indefinite-Lived Intangibles | `IndefiniteLivedIntangibleAssetsExcludingGoodwill` | Trademarks, brands -- not amortized. |
| Long-term Investments | `LongTermInvestments` | Investments held > 1 year. |
| Investments and Advances | `InvestmentsAndAdvances` | Broader -- investments + advances to affiliates. |
| Marketable Securities (non-current) | `MarketableSecuritiesNoncurrent` | Traded securities, non-current. |
| Available-for-Sale (non-current) | `AvailableForSaleSecuritiesNoncurrent` | AFS debt securities, non-current. Legacy. |
| Available-for-Sale (non-current, new) | `DebtSecuritiesAvailableForSaleNoncurrent` | AFS debt securities, non-current. Post-2018. |
| Equity Securities (FV) | `EquitySecuritiesFvNi` | Equity securities measured at fair value through net income. |
| Deferred Tax Assets (net, non-current) | `DeferredIncomeTaxAssetsNet` | Net deferred tax asset, non-current. |
| Other Non-current Assets | `OtherAssetsNoncurrent` | Catch-all for other non-current items. |
| Other Assets | `OtherAssets` | Catch-all (may include current + non-current). |
| Total Assets | `Assets` | Sum of all assets. |

### Current Liabilities
| Line Item | XBRL Tag | Notes |
|-----------|----------|-------|
| Total Current Liabilities | `LiabilitiesCurrent` | Sum of all current liabilities. |
| Accounts Payable | `AccountsPayableCurrent` | Trade payables. Most common. |
| Accounts Payable & Accrued | `AccountsPayableAndAccruedLiabilitiesCurrent` | Combined AP + accrued. Some companies bundle these. |
| Accrued Liabilities | `AccruedLiabilitiesCurrent` | Accrued expenses (wages, interest, etc.). |
| Short-term Borrowings | `ShortTermBorrowings` | Short-term bank loans, credit facilities. |
| Short-term Debt | `DebtCurrent` | Broader -- all current portion of debt. |
| Current Maturities of LT Debt | `LongTermDebtCurrent` | Portion of long-term debt due within 1 year. |
| Commercial Paper | `CommercialPaper` | Unsecured short-term promissory notes. Large companies (AAPL, MSFT). |
| Notes Payable | `NotesPayable` | Promissory notes. May include current + non-current. |
| Line of Credit | `LineOfCredit` | Drawn balance on revolving credit facility. |
| Deferred Revenue (current) | `DeferredRevenueCurrent` | Unearned revenue, current portion. |
| Contract Liabilities (current) | `ContractWithCustomerLiabilityCurrent` | ASC 606 contract liabilities. Equivalent to deferred revenue. |
| Deferred Revenue (combined) | `DeferredRevenue` | When not split current/non-current. |
| Operating Lease Liability (current) | `OperatingLeaseLiabilityCurrent` | ASC 842. Current portion of operating lease obligations. |
| Finance Lease Liability (current) | `FinanceLeaseLiabilityCurrent` | ASC 842. Current portion of finance lease obligations. |
| Income Taxes Payable | `AccruedIncomeTaxesCurrent` | Income taxes owed, current. |
| Dividends Payable | `DividendsPayableCurrent` | Declared but unpaid dividends. |
| Other Current Liabilities | `OtherLiabilitiesCurrent` | Catch-all for other current items. |
| Employee Compensation | `EmployeeRelatedLiabilitiesCurrent` | Wages, bonuses, benefits payable. |

### Non-Current Liabilities
| Line Item | XBRL Tag | Notes |
|-----------|----------|-------|
| Long-term Debt (non-current) | `LongTermDebtNoncurrent` | LT debt excluding current maturities. Most common. |
| Long-term Debt (total) | `LongTermDebt` | Total LT debt (current + non-current). Less specific. |
| LT Debt + Capital Leases | `LongTermDebtAndCapitalLeaseObligations` | Pre-ASC 842. Combined debt + leases. |
| LT Debt + Capital Leases (non-current) | `LongTermDebtAndCapitalLeaseObligationsIncludingCurrentMaturities` | Total including current. Confusing name. |
| Operating Lease Liability (non-current) | `OperatingLeaseLiabilityNoncurrent` | ASC 842. Non-current operating lease. |
| Finance Lease Liability (non-current) | `FinanceLeaseLiabilityNoncurrent` | ASC 842. Non-current finance lease. |
| Deferred Revenue (non-current) | `DeferredRevenueNoncurrent` | Long-term unearned revenue. |
| Contract Liabilities (non-current) | `ContractWithCustomerLiabilityNoncurrent` | ASC 606 contract liabilities, non-current. |
| Deferred Tax Liabilities (net) | `DeferredIncomeTaxLiabilitiesNet` | Net deferred tax liability, non-current. |
| Deferred Tax Liabilities (gross) | `DeferredIncomeTaxLiabilities` | Gross deferred tax liability. |
| Pension & Post-retirement | `PensionAndOtherPostretirementDefinedBenefitPlansLiabilitiesNoncurrent` | Pension obligations. |
| Other Non-current Liabilities | `OtherLiabilitiesNoncurrent` | Catch-all for other non-current items. |
| Total Liabilities | `Liabilities` | Sum of all liabilities. |
| Liabilities & Equity | `LiabilitiesAndStockholdersEquity` | Total liabilities + equity. Should equal Assets. |

### Stockholders' Equity
| Line Item | XBRL Tag | Notes |
|-----------|----------|-------|
| Total Equity (parent) | `StockholdersEquity` | Equity attributable to parent. Most common. |
| Total Equity (including NCI) | `StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest` | Includes minority interest. |
| Common Stock (par value) | `CommonStockValue` | Par value of issued common stock. Usually small. |
| Additional Paid-in Capital | `AdditionalPaidInCapitalCommonStock` | APIC for common stock. |
| Additional Paid-in Capital | `AdditionalPaidInCapital` | APIC (not stock-specific). |
| Retained Earnings | `RetainedEarningsAccumulatedDeficit` | Cumulative net income minus dividends. THE most important BS number for moat. |
| Retained Earnings (unappropriated) | `RetainedEarningsUnappropriated` | Rare variant. |
| Accumulated Other Comprehensive Income | `AccumulatedOtherComprehensiveIncomeLossNetOfTax` | AOCI (FX translation, hedges, pension adjustments). |
| Treasury Stock (value) | `TreasuryStockValue` | Cost of repurchased shares (contra-equity). |
| Treasury Stock (common, value) | `TreasuryStockCommonValue` | Treasury stock specifically for common shares. |
| Treasury Stock (shares) | `TreasuryStockCommonShares` | Number of treasury shares. Unit: shares. |
| Noncontrolling Interest | `MinorityInterest` | Legacy name for NCI. Still used in many filings. |
| Noncontrolling Interest | `RedeemableNoncontrollingInterestEquityCarryingAmount` | Redeemable NCI. |
| Shares Outstanding | `CommonStockSharesOutstanding` | Point-in-time shares outstanding. Unit: shares. |
| Shares Issued | `CommonStockSharesIssued` | Shares issued (before treasury). Unit: shares. |
| Shares Authorized | `CommonStockSharesAuthorized` | Max shares authorized by charter. Unit: shares. |
| Book Value Per Share | `BookValuePerShareOfCommonStock` | BVPS. Rare -- usually derived from equity / shares. |

---

## 3. Cash Flow Statement (duration)

### Operating Activities
| Line Item | XBRL Tag | Notes |
|-----------|----------|-------|
| Net Cash from Operations | `NetCashProvidedByUsedInOperatingActivities` | Total operating cash flow. THE key number. |
| Net Cash from Ops (continuing) | `NetCashProvidedByUsedInOperatingActivitiesContinuingOperations` | When discontinued ops are separated. |
| Depreciation & Amortization | `DepreciationDepletionAndAmortization` | D&A add-back in operating section. Most common. |
| D&A (without depletion) | `DepreciationAndAmortization` | When depletion is separate. |
| D&A + Accretion | `DepreciationAmortizationAndAccretionNet` | Includes accretion (mining). |
| Depreciation (only) | `Depreciation` | Just depreciation, no amortization. |
| Amortization of Intangibles | `AmortizationOfIntangibleAssets` | Amortization of finite-lived intangible assets. |
| Stock-based Compensation | `ShareBasedCompensation` | SBC add-back. Most common tag. |
| SBC (allocated) | `AllocatedShareBasedCompensationExpense` | When SBC is allocated across segments. |
| Deferred Income Tax | `DeferredIncomeTaxExpenseBenefit` | Deferred tax portion of operating adjustments. |
| Deferred Tax (non-cash) | `DeferredIncomeTaxesAndTaxCredits` | Alternative deferred tax tag. |
| Gain/Loss on Sale of Assets | `GainLossOnSaleOfPropertyPlantEquipment` | Non-cash adjustment for asset sales. |
| Gain/Loss on Investments | `GainLossOnInvestments` | Non-cash investment gains/losses. |
| Impairment Charges | `AssetImpairmentCharges` | Non-cash asset write-downs. |
| Goodwill Impairment | `GoodwillImpairmentLoss` | Non-cash goodwill write-downs. |
| Other Non-cash Items | `OtherNoncashIncomeExpense` | Catch-all non-cash adjustments. |
| Provision for Losses | `ProvisionForDoubtfulAccounts` | Bad debt expense add-back. |
| Change in Receivables | `IncreaseDecreaseInAccountsReceivable` | Working capital change. Positive = cash used. |
| Change in Inventory | `IncreaseDecreaseInInventories` | Working capital change. |
| Change in Payables | `IncreaseDecreaseInAccountsPayable` | Working capital change. Positive = cash provided. |
| Change in Accrued Liabilities | `IncreaseDecreaseInAccruedLiabilities` | Working capital change. |
| Change in Deferred Revenue | `IncreaseDecreaseInDeferredRevenue` | Working capital change. |
| Change in Contract Liabilities | `IncreaseDecreaseInContractWithCustomerLiability` | ASC 606 equivalent. |
| Change in Prepaid/Other | `IncreaseDecreaseInPrepaidDeferredExpenseAndOtherAssets` | Working capital change. |
| Change in Other Operating | `IncreaseDecreaseInOtherOperatingCapitalNet` | Catch-all working capital. |
| Change in Operating Assets/Liabilities | `IncreaseDecreaseInOperatingCapital` | Net change in all operating WC. |

### Investing Activities
| Line Item | XBRL Tag | Notes |
|-----------|----------|-------|
| Net Cash from Investing | `NetCashProvidedByUsedInInvestingActivities` | Total investing cash flow. |
| Net Cash from Investing (continuing) | `NetCashProvidedByUsedInInvestingActivitiesContinuingOperations` | When discontinued ops separated. |
| Capital Expenditures (PP&E) | `PaymentsToAcquirePropertyPlantAndEquipment` | Standard CapEx tag. THE key number for FCF. |
| Capital Expenditures (productive assets) | `PaymentsToAcquireProductiveAssets` | Broader -- includes intangibles. |
| Capital Expenditures (other) | `PaymentsToAcquireOtherPropertyPlantAndEquipment` | Rare variant. |
| Purchase of Investments | `PaymentsToAcquireInvestments` | Buying investment securities. |
| Purchase of Short-term Investments | `PaymentsToAcquireShortTermInvestments` | Buying short-term securities specifically. |
| Purchase of Available-for-Sale | `PaymentsToAcquireAvailableForSaleSecuritiesDebt` | Buying AFS debt securities. |
| Purchase of Held-to-Maturity | `PaymentsToAcquireHeldToMaturitySecurities` | Buying HTM securities. |
| Purchase of Marketable Securities | `PaymentsToAcquireMarketableSecurities` | Buying marketable securities (broad). |
| Proceeds from Sale of Investments | `ProceedsFromSaleOfInvestments` | Selling investment securities. |
| Proceeds from Sale of ST Investments | `ProceedsFromSaleOfShortTermInvestments` | Selling short-term securities. |
| Proceeds from AFS Maturities/Sales | `ProceedsFromSaleAndMaturityOfMarketableSecurities` | AFS security sales + maturities. |
| Proceeds from Maturities of AFS | `ProceedsFromMaturitiesPrepaymentsAndCallsOfAvailableForSaleSecurities` | AFS maturities. |
| Proceeds from Sale of AFS | `ProceedsFromSaleOfAvailableForSaleSecuritiesDebt` | AFS sales. |
| Purchase of Business | `PaymentsToAcquireBusinessesNetOfCashAcquired` | Acquisition spending, net of cash acquired. |
| Purchase of Business (gross) | `PaymentsToAcquireBusinessesGross` | Acquisition spending, gross. |
| Proceeds from Sale of Business | `ProceedsFromDivestitureOfBusinesses` | Divestiture proceeds. |
| Proceeds from Sale of PP&E | `ProceedsFromSaleOfPropertyPlantAndEquipment` | Selling fixed assets. |
| Purchases of Intangibles | `PaymentsToAcquireIntangibleAssets` | Buying patents, licenses, etc. |
| Other Investing Activities | `PaymentsForProceedsFromOtherInvestingActivities` | Catch-all investing. |

### Financing Activities
| Line Item | XBRL Tag | Notes |
|-----------|----------|-------|
| Net Cash from Financing | `NetCashProvidedByUsedInFinancingActivities` | Total financing cash flow. |
| Net Cash from Financing (continuing) | `NetCashProvidedByUsedInFinancingActivitiesContinuingOperations` | When discontinued ops separated. |
| Share Repurchases (common) | `PaymentsForRepurchaseOfCommonStock` | Buyback spending. Most common. |
| Share Repurchases (equity) | `PaymentsForRepurchaseOfEquity` | Broader -- any equity buyback. |
| Dividends Paid (common) | `PaymentsOfDividendsCommonStock` | Cash dividends to common shareholders. |
| Dividends Paid (total) | `PaymentsOfDividends` | All dividends (common + preferred). |
| Dividends Paid (ordinary) | `PaymentsOfOrdinaryDividends` | Alternative tag for common dividends. |
| Dividends Per Share (declared) | `CommonStockDividendsPerShareDeclared` | DPS declared. Unit: USD/shares. |
| Dividends Per Share (cash paid) | `CommonStockDividendsPerShareCashPaid` | DPS actually paid. Unit: USD/shares. |
| Proceeds from LT Debt Issuance | `ProceedsFromIssuanceOfLongTermDebt` | Borrowing long-term. |
| Repayments of LT Debt | `RepaymentsOfLongTermDebt` | Paying down long-term debt. |
| Proceeds from ST Debt | `ProceedsFromShortTermDebt` | Short-term borrowing. |
| Repayments of ST Debt | `RepaymentsOfShortTermDebt` | Paying down short-term debt. |
| Proceeds from Debt (general) | `ProceedsFromIssuanceOfDebt` | Any debt issuance. Broad. |
| Repayments of Debt (general) | `RepaymentsOfDebt` | Any debt repayment. Broad. |
| Proceeds from Lines of Credit | `ProceedsFromLinesOfCredit` | Drawing on credit facility. |
| Repayments of Lines of Credit | `RepaymentsOfLinesOfCredit` | Paying back credit facility. |
| Net Change in Commercial Paper | `ProceedsFromRepaymentsOfCommercialPaper` | Net CP issuance/redemption. |
| Proceeds from Stock Issuance | `ProceedsFromIssuanceOfCommonStock` | Selling new shares. |
| Proceeds from Stock Options | `ProceedsFromStockOptionsExercised` | Cash from option exercises. |
| Excess Tax Benefit from SBC | `ExcessTaxBenefitFromShareBasedCompensationFinancingActivities` | Legacy tag (pre-ASU 2016-09). |
| Payments for Tax Withholding on SBC | `PaymentsRelatedToTaxWithholdingForShareBasedCompensation` | Tax payments on vesting RSUs. |
| Finance Lease Payments | `FinanceLeasePrincipalPayments` | ASC 842 finance lease principal. |
| Other Financing Activities | `ProceedsFromPaymentsForOtherFinancingActivities` | Catch-all financing. |

### Other Cash Flow Items
| Line Item | XBRL Tag | Notes |
|-----------|----------|-------|
| FX Effect on Cash | `EffectOfExchangeRateOnCashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents` | Currency impact on cash. |
| FX Effect on Cash (legacy) | `EffectOfExchangeRateOnCashAndCashEquivalents` | Older variant. |
| Net Change in Cash | `CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsPeriodIncreaseDecreaseIncludingExchangeRateEffect` | Total change in cash. |
| Net Change in Cash (legacy) | `CashAndCashEquivalentsPeriodIncreaseDecrease` | Older variant. |
| Beginning Cash Balance | `CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsIncludingDisposalGroupAndDiscontinuedOperations` | Opening cash (instant). |
| Cash Paid for Interest | `InterestPaidNet` | Supplemental disclosure. Cash basis interest. |
| Cash Paid for Taxes | `IncomeTaxesPaid` | Supplemental disclosure. Cash basis taxes. |
| Cash Paid for Taxes (net) | `IncomeTaxesPaidNet` | Net of refunds. |

---

## 4. Derived / Calculated Metrics (No Direct XBRL Tag)

These line items don't have their own XBRL tags and must be calculated from other tags:

| Metric | Formula | Notes |
|--------|---------|-------|
| **EBIT** | `OperatingIncomeLoss` | Close proxy. True EBIT may differ if company reports non-operating items above the operating line. |
| **EBITDA** | `OperatingIncomeLoss` + `DepreciationDepletionAndAmortization` | Derive from income stmt operating income + cash flow D&A. |
| **Free Cash Flow** | `NetCashProvidedByUsedInOperatingActivities` - `PaymentsToAcquirePropertyPlantAndEquipment` | Standard FCF. |
| **Gross Profit** | `Revenues` - `CostOfRevenue` | When `GrossProfit` tag is not reported. |
| **Gross Margin** | `GrossProfit` / `Revenues` | Percentage. |
| **Net Margin** | `NetIncomeLoss` / `Revenues` | Percentage. |
| **Operating Margin** | `OperatingIncomeLoss` / `Revenues` | Percentage. |
| **EPS (computed)** | `NetIncomeLoss` / `WeightedAverageNumberOfDilutedSharesOutstanding` | When `EarningsPerShareDiluted` not reported. |
| **Book Value Per Share** | `StockholdersEquity` / `CommonStockSharesOutstanding` | When BVPS not directly reported. |
| **ROE** | `NetIncomeLoss` / avg(`StockholdersEquity`) | Return on equity. |
| **ROIC** | `NetIncomeLoss` / (`StockholdersEquity` + `LongTermDebtNoncurrent` - `CashAndCashEquivalentsAtCarryingValue`) | Return on invested capital. |
| **ROA** | `NetIncomeLoss` / avg(`Assets`) | Return on assets. |
| **Net Debt** | `LongTermDebtNoncurrent` - `CashAndCashEquivalentsAtCarryingValue` | Negative = net cash position. |
| **Debt to Earnings** | `LongTermDebtNoncurrent` / `NetIncomeLoss` | Years to pay off debt from earnings. |
| **Debt to FCF** | `LongTermDebtNoncurrent` / FCF | Years to pay off debt from FCF. |
| **Current Ratio** | `AssetsCurrent` / `LiabilitiesCurrent` | Liquidity measure. |
| **CapEx to Revenue** | `PaymentsToAcquirePropertyPlantAndEquipment` / `Revenues` | Capital intensity. |
| **CapEx to Net Income** | `PaymentsToAcquirePropertyPlantAndEquipment` / `NetIncomeLoss` | User uses <=50% good, <=25% great. |
| **FCF to Earnings** | FCF / `NetIncomeLoss` | FCF quality ratio. Target >= 75%. |
| **Dividend Payout Ratio** | `PaymentsOfDividendsCommonStock` / `NetIncomeLoss` | Fraction of earnings paid as dividends. |
| **Retained Earnings Ratio** | 1 - Dividend Payout Ratio | Fraction retained for growth. |
| **Owner Earnings (Rule One)** | `IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest` + D&A - `IncomeTaxExpenseBenefit` + change in `AccountsPayableCurrent` - change in `AccountsReceivableNetCurrent` - maintenance CapEx | Rule One method. |
| **Owner Earnings (Graham)** | `OperatingIncomeLoss` + D&A of goodwill - federal tax - stock option costs - unsustainable pension income - maintenance CapEx | Intelligent Investor method. |
| **BVPS + Dividends Growth** | Change in (`StockholdersEquity` / shares) + cumulative DPS + buyback value | Composite metric for Rule One scoring. |
| **Treasury-Adjusted DTE** | (`Liabilities` - `TreasuryStockValue`) / `StockholdersEquity` | More conservative DTE. User target < 0.8. |

---

## 5. Major Tag Transitions & Gotchas

### Revenue (ASC 606 transition, ~2018)
- Pre-2018: `SalesRevenueNet`, `SalesRevenueGoodsNet`, `SalesRevenueServicesNet`
- Post-2018: `RevenueFromContractWithCustomerExcludingAssessedTax`
- Must merge across both tag sets for 10+ year history

### Leases (ASC 842 transition, ~2019)
- Pre-2019: `CapitalLeaseObligationsCurrent`, `CapitalLeaseObligationsNoncurrent`
- Post-2019: `OperatingLeaseRightOfUseAsset`, `OperatingLeaseLiabilityCurrent`, `OperatingLeaseLiabilityNoncurrent`, `FinanceLeaseRightOfUseAsset`, `FinanceLeaseLiabilityCurrent`, `FinanceLeaseLiabilityNoncurrent`
- Operating leases moved onto balance sheet. Total reported debt jumped for asset-heavy companies.

### Long-term Debt tag variation
Companies use different tags for the same concept:
- `LongTermDebtNoncurrent` -- most specific, excludes current maturities
- `LongTermDebt` -- total LT debt, may include current maturities
- `LongTermDebtAndCapitalLeaseObligations` -- pre-ASC 842, includes capital leases
- Some companies only report `DebtCurrent` + `LongTermDebtNoncurrent` (must sum for total)
- Others report `LongTermDebt` which already includes current portion

### Available-for-Sale Securities (ASU 2016-01 transition, ~2018)
- Pre-2018: `AvailableForSaleSecuritiesCurrent`, `AvailableForSaleSecuritiesNoncurrent`
- Post-2018: `DebtSecuritiesAvailableForSaleCurrent`, `DebtSecuritiesAvailableForSaleNoncurrent`

### Interest Expense (2024 taxonomy change)
- Pre-2024: `InterestExpense` meant total interest (operating + non-operating)
- Post-2024: `InterestExpense` definition broadened, new `InterestExpenseOperating` and `InterestExpenseNonoperating` elements added
- `InterestIncomeExpenseNet` should only include operating interest

### Cash balance tag evolution
- Old: `CashAndCashEquivalentsPeriodIncreaseDecrease`
- New: `CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsPeriodIncreaseDecreaseIncludingExchangeRateEffect`
- Reflects inclusion of restricted cash per ASU 2016-18

### Fiscal Year Mapping
- Use XBRL `fy` field, NOT `getFullYear()` on end date
- Companies with non-calendar fiscal years (e.g., SFM ends early January, AAPL ends late September) would map to wrong year using date parsing
- Deduplicate by fiscal year, keeping latest period end date (not latest filed date)

### Sign Conventions
- Revenue, Assets, Income = positive
- Expenses, Liabilities = positive (reported as positive amounts)
- Cash flow: CapEx reported as positive (cash outflow); must subtract from Operating CF for FCF
- `TreasuryStockValue` = positive (contra-equity, but stored as positive amount)
- `IncreaseDecreaseIn*` working capital changes: Follow T-account convention (asset increase = negative cash impact)

---

## 6. How Data Providers Normalize Tags

### The Core Problem
The US-GAAP XBRL taxonomy has ~17,000+ tags. Companies can also create custom extension tags. None of the ~8,000 US public companies file their statements in exactly the same way.

### EdgarTools Approach
Maps ~2,000 different XBRL tags to 95 standardized concepts (e.g., "Revenue", "CommonEquity"). Uses a standardization directory with concept mapping files. When multiple filings map different tags to the same standard concept, rows are merged rather than duplicated.

### Intrinio Approach
Proprietary ML + combinatorial analysis. Maps each company's XBRL tags to standardized fields. Handles cases where "Total Revenue" aggregates "Product Revenue" + "Service Revenue" without double-counting.

### Our Approach (edgarFinancials.js)
For each line item, define an ordered list of fallback tags. Try each tag via `extractAnnualFact`, merge results across all tags (first tag wins per year, later tags fill gaps for older years). This correctly handles:
- ASC 606 revenue transition
- Different debt tag preferences
- Company-specific tag choices
- Tag deprecation over time

---

## Sources

- [SEC EDGAR APIs](https://www.sec.gov/search-filings/edgar-application-programming-interfaces)
- [SEC Standard Taxonomies](https://www.sec.gov/info/edgar/edgartaxonomies)
- [EDGAR XBRL Guide (2026)](https://www.sec.gov/files/edgar/filer-information/specifications/xbrl-guide.pdf)
- [FASB GAAP Taxonomy FAQ](https://xbrl.fasb.org/resources/taxonomyfaq.pdf)
- [FASB XBRL Taxonomy](https://fasb.org/xbrl)
- [XBRL US Cash Flow Guidance](https://xbrl.us/data-rule/guid-cashflows/)
- [XBRL US Revenue Guidance](https://xbrl.us/data-rule/guid-revenue/)
- [XBRL US Equity Components](https://xbrl.us/data-rule/dqc_0122/)
- [XBRL US PP&E Calculation](https://xbrl.us/data-rule/dqc_0187/)
- [XBRL US Deferred Tax Rules](https://xbrl.us/data-rule/dqc_0085/)
- [XBRL US Interest Expense Rules](https://xbrl.us/data-rule/dqc_0181pr/)
- [XBRL US Lease Allocation](https://xbrl.us/data-rule/dqc_0131/)
- [XBRL US DQC Negative Values (Element List)](https://xbrl.us/data-rule/dqc_0015-le/)
- [Calcbench XBRL Element Browser](https://www.calcbench.com/element/GrossProfit)
- [EdgarTools Documentation](https://edgartools.readthedocs.io/en/latest/getting-xbrl/)
- [EdgarTools GitHub](https://github.com/dgunning/edgartools)
- [Intrinio Normalized XBRL](https://intrinio.com/blog/normalized-xbrl-data)
- [XBRL US Preparers Guide](https://xbrl.us/wp-content/uploads/2015/03/PreparersGuide.pdf)
- [XBRL US - Why Normalize Data](https://xbrl.us/why-normalize-data/)
- [FASB Leases Implementation Guide (ASC 842)](https://www.fasb.org/leases_1)
- [sec-api.io XBRL Documentation](https://sec-api.io/docs/xbrl-to-json-converter-api)
