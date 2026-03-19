/**
 * XBRL Taxonomy Coverage Audit — S&P 500
 *
 * Measures how well Thes1s's current XBRL tag mapping covers the S&P 500.
 * For each company, pulls EDGAR companyfacts and checks which mapped fields have data.
 * Produces a detailed report + CSV showing coverage gaps by field and sector.
 *
 * Usage: node validation/scripts/coverage-audit.js
 *
 * Rate-limited to 10 req/sec (120ms delay). Full S&P 500 scan takes ~60-90 minutes.
 * Checkpoints every 50 companies for resume-on-interrupt.
 */

import * as cheerio from 'cheerio';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPORTS_DIR = join(__dirname, '..', 'reports');
const CHECKPOINT_PATH = join(REPORTS_DIR, 'coverage-audit-checkpoint.json');
const REPORT_PATH = join(REPORTS_DIR, 'coverage-audit-results.md');
const CSV_PATH = join(REPORTS_DIR, 'coverage-audit-raw.csv');

// Ensure reports dir exists
if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });

const UA = 'Thes1s/1.0 (contact@thes1s.app)';
const DELAY_MS = 120;

// ─── Taxonomy Definition ────────────────────────────────────────────

const TAXONOMY = {
  // ── Tier 1: Scoring-Critical ──
  // Income
  revenues: { tier: 1, category: 'INCOME', unit: 'USD', tags: ['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues', 'SalesRevenueNet', 'SalesRevenueGoodsNet', 'RevenueFromContractWithCustomerIncludingAssessedTax'] },
  operating_income_loss: { tier: 1, category: 'INCOME', unit: 'USD', tags: ['OperatingIncomeLoss', 'OperatingIncomeLossFromContinuingOperations'] },
  net_income_loss: { tier: 1, category: 'INCOME', unit: 'USD', tags: ['NetIncomeLoss', 'ProfitLoss', 'NetIncomeLossAvailableToCommonStockholdersBasic'] },
  basic_earnings_per_share: { tier: 1, category: 'INCOME', unit: 'USD/shares', tags: ['EarningsPerShareBasic'] },
  diluted_earnings_per_share: { tier: 1, category: 'INCOME', unit: 'USD/shares', tags: ['EarningsPerShareDiluted'] },
  basic_average_shares: { tier: 1, category: 'INCOME', unit: 'shares', tags: ['WeightedAverageNumberOfSharesOutstandingBasic', 'WeightedAverageNumberOfShareOutstandingBasicAndDiluted'] },
  diluted_average_shares: { tier: 1, category: 'INCOME', unit: 'shares', tags: ['WeightedAverageNumberOfDilutedSharesOutstanding'] },
  dividends_per_share: { tier: 1, category: 'INCOME', unit: 'USD/shares', tags: ['CommonStockDividendsPerShareDeclared', 'CommonStockDividendsPerShareCashPaid'] },
  income_tax: { tier: 1, category: 'INCOME', unit: 'USD', tags: ['IncomeTaxExpenseBenefit'] },
  // Balance Sheet
  cash: { tier: 1, category: 'BALANCE SHEET', unit: 'USD', tags: ['CashAndCashEquivalentsAtCarryingValue', 'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents', 'Cash'] },
  long_term_debt: { tier: 1, category: 'BALANCE SHEET', unit: 'USD', tags: ['LongTermDebtNoncurrent', 'LongTermDebt', 'LongTermLineOfCredit', 'SecuredDebt', 'UnsecuredDebt', 'SeniorNotesNoncurrent', 'MortgageLoansOnRealEstate', 'SubordinatedDebt', 'LongTermNotesPayable'] },
  short_term_debt: { tier: 1, category: 'BALANCE SHEET', unit: 'USD', tags: ['ShortTermBorrowings', 'DebtCurrent', 'CommercialPaper', 'LineOfCredit', 'ShortTermBankLoansAndNotesPayable'] },
  current_portion_lt_debt: { tier: 1, category: 'BALANCE SHEET', unit: 'USD', tags: ['LongTermDebtCurrent', 'LongTermDebtAndCapitalLeaseObligationsCurrent', 'OtherLongTermDebtCurrent'] },
  equity: { tier: 1, category: 'BALANCE SHEET', unit: 'USD', tags: ['StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'] },
  retained_earnings: { tier: 1, category: 'BALANCE SHEET', unit: 'USD', tags: ['RetainedEarningsAccumulatedDeficit', 'RetainedEarningsUnappropriated'] },
  shares_outstanding: { tier: 1, category: 'BALANCE SHEET', unit: 'shares', tags: ['CommonStockSharesOutstanding', 'CommonStockSharesIssued'] },
  assets: { tier: 1, category: 'BALANCE SHEET', unit: 'USD', tags: ['Assets'] },
  liabilities: { tier: 1, category: 'BALANCE SHEET', unit: 'USD', tags: ['Liabilities'] },
  // Cash Flow
  net_cash_flow_from_operating_activities: { tier: 1, category: 'CASH FLOW', unit: 'USD', tags: ['NetCashProvidedByUsedInOperatingActivities', 'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations'] },
  capital_expenditures: { tier: 1, category: 'CASH FLOW', unit: 'USD', tags: ['PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets', 'PaymentsToAcquireOtherPropertyPlantAndEquipment'] },
  depreciation_amortization: { tier: 1, category: 'CASH FLOW', unit: 'USD', tags: ['DepreciationDepletionAndAmortization', 'DepreciationAndAmortization', 'DepreciationAmortizationAndAccretionNet', 'OtherDepreciationAndAmortization'] },
  dividends_paid: { tier: 1, category: 'CASH FLOW', unit: 'USD', tags: ['PaymentsOfDividendsCommonStock', 'PaymentsOfDividends', 'PaymentsOfOrdinaryDividends'] },
  share_repurchases: { tier: 1, category: 'CASH FLOW', unit: 'USD', tags: ['PaymentsForRepurchaseOfCommonStock', 'PaymentsForRepurchaseOfEquity'] },

  // ── Tier 2: Display Fields ──
  // Income
  cost_of_revenue: { tier: 2, category: 'INCOME', unit: 'USD', tags: ['CostOfRevenue', 'CostOfGoodsAndServicesSold', 'CostOfGoodsSold'] },
  gross_profit: { tier: 2, category: 'INCOME', unit: 'USD', tags: ['GrossProfit'] },
  sga: { tier: 2, category: 'INCOME', unit: 'USD', tags: ['SellingGeneralAndAdministrativeExpense', 'SellingAndMarketingExpense', 'GeneralAndAdministrativeExpense'] },
  research_and_development: { tier: 2, category: 'INCOME', unit: 'USD', tags: ['ResearchAndDevelopmentExpense', 'ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost'] },
  depreciation_amortization_is: { tier: 2, category: 'INCOME', unit: 'USD', tags: ['DepreciationAndAmortization', 'DepreciationDepletionAndAmortization'] },
  operating_expenses: { tier: 2, category: 'INCOME', unit: 'USD', tags: ['OperatingExpenses', 'CostsAndExpenses'] },
  interest_expense: { tier: 2, category: 'INCOME', unit: 'USD', tags: ['InterestExpense', 'InterestExpenseDebt', 'InterestExpenseOperating'] },
  income_before_tax: { tier: 2, category: 'INCOME', unit: 'USD', tags: ['IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest', 'IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments', 'IncomeLossFromContinuingOperationsBeforeIncomeTaxesDomestic'] },
  // Balance Sheet
  accounts_receivable: { tier: 2, category: 'BALANCE SHEET', unit: 'USD', tags: ['AccountsReceivableNetCurrent', 'ReceivablesNetCurrent', 'AccountsReceivableNet'] },
  inventory: { tier: 2, category: 'BALANCE SHEET', unit: 'USD', tags: ['InventoryNet', 'InventoryFinishedGoodsAndWorkInProcess', 'InventoryRawMaterialsAndSupplies'] },
  current_assets: { tier: 2, category: 'BALANCE SHEET', unit: 'USD', tags: ['AssetsCurrent'] },
  property_plant_equipment: { tier: 2, category: 'BALANCE SHEET', unit: 'USD', tags: ['PropertyPlantAndEquipmentNet', 'PropertyPlantAndEquipmentAndFinanceLeaseRightOfUseAssetAfterAccumulatedDepreciationAndAmortization'] },
  goodwill: { tier: 2, category: 'BALANCE SHEET', unit: 'USD', tags: ['Goodwill'] },
  intangible_assets: { tier: 2, category: 'BALANCE SHEET', unit: 'USD', tags: ['IntangibleAssetsNetExcludingGoodwill', 'FiniteLivedIntangibleAssetsNet', 'IndefiniteLivedIntangibleAssetsExcludingGoodwill'] },
  current_liabilities: { tier: 2, category: 'BALANCE SHEET', unit: 'USD', tags: ['LiabilitiesCurrent'] },
  additional_paid_in_capital: { tier: 2, category: 'BALANCE SHEET', unit: 'USD', tags: ['AdditionalPaidInCapitalCommonStock', 'AdditionalPaidInCapital'] },
  common_stock: { tier: 2, category: 'BALANCE SHEET', unit: 'USD', tags: ['CommonStockValue', 'CommonStocksIncludingAdditionalPaidInCapital'] },
  aoci: { tier: 2, category: 'BALANCE SHEET', unit: 'USD', tags: ['AccumulatedOtherComprehensiveIncomeLossNetOfTax'] },
  treasury_stock: { tier: 2, category: 'BALANCE SHEET', unit: 'USD', tags: ['TreasuryStockValue', 'TreasuryStockCommonValue'] },
  liabilities_and_equity: { tier: 2, category: 'BALANCE SHEET', unit: 'USD', tags: ['LiabilitiesAndStockholdersEquity'] },
  operating_lease_rou_asset: { tier: 2, category: 'BALANCE SHEET', unit: 'USD', tags: ['OperatingLeaseRightOfUseAsset'] },
  operating_lease_liability_current: { tier: 2, category: 'BALANCE SHEET', unit: 'USD', tags: ['OperatingLeaseLiabilityCurrent'] },
  operating_lease_liability_noncurrent: { tier: 2, category: 'BALANCE SHEET', unit: 'USD', tags: ['OperatingLeaseLiabilityNoncurrent'] },
  // Cash Flow
  stock_based_compensation: { tier: 2, category: 'CASH FLOW', unit: 'USD', tags: ['ShareBasedCompensation', 'AllocatedShareBasedCompensationExpense'] },
  deferred_income_tax: { tier: 2, category: 'CASH FLOW', unit: 'USD', tags: ['DeferredIncomeTaxExpenseBenefit', 'DeferredIncomeTaxesAndTaxCredits'] },
  change_in_receivables: { tier: 2, category: 'CASH FLOW', unit: 'USD', tags: ['IncreaseDecreaseInAccountsReceivable', 'IncreaseDecreaseInReceivables'] },
  change_in_inventory: { tier: 2, category: 'CASH FLOW', unit: 'USD', tags: ['IncreaseDecreaseInInventories'] },
  change_in_payables: { tier: 2, category: 'CASH FLOW', unit: 'USD', tags: ['IncreaseDecreaseInAccountsPayable', 'IncreaseDecreaseInAccountsPayableAndAccruedLiabilities'] },
  net_cash_flow_from_investing_activities: { tier: 2, category: 'CASH FLOW', unit: 'USD', tags: ['NetCashProvidedByUsedInInvestingActivities', 'NetCashProvidedByUsedInInvestingActivitiesContinuingOperations'] },
  net_cash_flow_from_financing_activities: { tier: 2, category: 'CASH FLOW', unit: 'USD', tags: ['NetCashProvidedByUsedInFinancingActivities', 'NetCashProvidedByUsedInFinancingActivitiesContinuingOperations'] },
  proceeds_from_lt_debt: { tier: 2, category: 'CASH FLOW', unit: 'USD', tags: ['ProceedsFromIssuanceOfLongTermDebt', 'ProceedsFromIssuanceOfDebt'] },
  repayments_of_lt_debt: { tier: 2, category: 'CASH FLOW', unit: 'USD', tags: ['RepaymentsOfLongTermDebt', 'RepaymentsOfDebt'] },

  // ── Tier 3: Expanded/Detail Fields ──
  // Income
  other_operating_expenses: { tier: 3, category: 'INCOME', unit: 'USD', tags: ['OtherOperatingIncomeExpenseNet', 'RestructuringCharges', 'GoodwillImpairmentLoss', 'AssetImpairmentCharges'] },
  interest_income: { tier: 3, category: 'INCOME', unit: 'USD', tags: ['InvestmentIncomeInterest', 'InterestIncomeOther', 'InterestAndDividendIncomeOperating', 'InvestmentIncomeInterestAndDividend'] },
  net_interest_income: { tier: 3, category: 'INCOME', unit: 'USD', tags: ['InterestIncomeExpenseNet', 'InterestIncomeExpenseNonoperatingNet'] },
  other_income_expense: { tier: 3, category: 'INCOME', unit: 'USD', tags: ['NonoperatingIncomeExpense', 'OtherNonoperatingIncomeExpense', 'IncomeLossFromEquityMethodInvestments', 'GainLossOnInvestments'] },
  income_from_continuing_operations: { tier: 3, category: 'INCOME', unit: 'USD', tags: ['IncomeLossFromContinuingOperations'] },
  // Balance Sheet
  short_term_investments: { tier: 3, category: 'BALANCE SHEET', unit: 'USD', tags: ['ShortTermInvestments', 'MarketableSecuritiesCurrent', 'AvailableForSaleSecuritiesCurrent', 'DebtSecuritiesAvailableForSaleCurrent'] },
  prepaid_expenses: { tier: 3, category: 'BALANCE SHEET', unit: 'USD', tags: ['PrepaidExpenseAndOtherAssetsCurrent', 'PrepaidExpenseCurrent'] },
  other_current_assets: { tier: 3, category: 'BALANCE SHEET', unit: 'USD', tags: ['OtherAssetsCurrent'] },
  property_plant_equipment_gross: { tier: 3, category: 'BALANCE SHEET', unit: 'USD', tags: ['PropertyPlantAndEquipmentGross'] },
  accumulated_depreciation: { tier: 3, category: 'BALANCE SHEET', unit: 'USD', tags: ['AccumulatedDepreciationDepletionAndAmortizationPropertyPlantAndEquipment'] },
  long_term_investments: { tier: 3, category: 'BALANCE SHEET', unit: 'USD', tags: ['LongTermInvestments', 'InvestmentsAndAdvances', 'MarketableSecuritiesNoncurrent', 'AvailableForSaleSecuritiesNoncurrent', 'DebtSecuritiesAvailableForSaleNoncurrent'] },
  deferred_tax_assets: { tier: 3, category: 'BALANCE SHEET', unit: 'USD', tags: ['DeferredIncomeTaxAssetsNet'] },
  other_noncurrent_assets: { tier: 3, category: 'BALANCE SHEET', unit: 'USD', tags: ['OtherAssetsNoncurrent', 'OtherAssets'] },
  accounts_payable: { tier: 3, category: 'BALANCE SHEET', unit: 'USD', tags: ['AccountsPayableCurrent', 'AccountsPayableAndAccruedLiabilitiesCurrent'] },
  accrued_liabilities: { tier: 3, category: 'BALANCE SHEET', unit: 'USD', tags: ['AccruedLiabilitiesCurrent', 'EmployeeRelatedLiabilitiesCurrent'] },
  deferred_revenue_current: { tier: 3, category: 'BALANCE SHEET', unit: 'USD', tags: ['DeferredRevenueCurrent', 'ContractWithCustomerLiabilityCurrent'] },
  other_current_liabilities: { tier: 3, category: 'BALANCE SHEET', unit: 'USD', tags: ['OtherLiabilitiesCurrent'] },
  deferred_tax_liabilities: { tier: 3, category: 'BALANCE SHEET', unit: 'USD', tags: ['DeferredIncomeTaxLiabilitiesNet', 'DeferredIncomeTaxLiabilities'] },
  pension_liabilities: { tier: 3, category: 'BALANCE SHEET', unit: 'USD', tags: ['PensionAndOtherPostretirementDefinedBenefitPlansLiabilitiesNoncurrent'] },
  other_noncurrent_liabilities: { tier: 3, category: 'BALANCE SHEET', unit: 'USD', tags: ['OtherLiabilitiesNoncurrent'] },
  noncurrent_liabilities: { tier: 3, category: 'BALANCE SHEET', unit: 'USD', tags: ['LiabilitiesNoncurrent'] },
  minority_interest: { tier: 3, category: 'BALANCE SHEET', unit: 'USD', tags: ['MinorityInterest', 'RedeemableNoncontrollingInterestEquityCarryingAmount'] },
  // Cash Flow
  other_noncash_items: { tier: 3, category: 'CASH FLOW', unit: 'USD', tags: ['OtherNoncashIncomeExpense'] },
  change_in_other_working_capital: { tier: 3, category: 'CASH FLOW', unit: 'USD', tags: ['IncreaseDecreaseInOtherOperatingCapitalNet', 'IncreaseDecreaseInOperatingCapital'] },
  sale_of_ppe: { tier: 3, category: 'CASH FLOW', unit: 'USD', tags: ['ProceedsFromSaleOfPropertyPlantAndEquipment'] },
  purchase_of_investments: { tier: 3, category: 'CASH FLOW', unit: 'USD', tags: ['PaymentsToAcquireInvestments', 'PaymentsToAcquireShortTermInvestments', 'PaymentsToAcquireAvailableForSaleSecuritiesDebt', 'PaymentsToAcquireMarketableSecurities'] },
  sale_of_investments: { tier: 3, category: 'CASH FLOW', unit: 'USD', tags: ['ProceedsFromSaleOfInvestments', 'ProceedsFromSaleOfShortTermInvestments', 'ProceedsFromSaleAndMaturityOfMarketableSecurities', 'ProceedsFromMaturitiesPrepaymentsAndCallsOfAvailableForSaleSecurities', 'ProceedsFromSaleOfAvailableForSaleSecuritiesDebt'] },
  purchase_of_business: { tier: 3, category: 'CASH FLOW', unit: 'USD', tags: ['PaymentsToAcquireBusinessesNetOfCashAcquired', 'PaymentsToAcquireBusinessesGross'] },
  proceeds_from_stock_issuance: { tier: 3, category: 'CASH FLOW', unit: 'USD', tags: ['ProceedsFromIssuanceOfCommonStock', 'ProceedsFromStockOptionsExercised'] },
  effect_of_exchange_rate: { tier: 3, category: 'CASH FLOW', unit: 'USD', tags: ['EffectOfExchangeRateOnCashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents', 'EffectOfExchangeRateOnCashAndCashEquivalents'] },
};

// ── Layer 3: Load pre-built tag classifications ──
const l3ClassificationsPath = join(__dirname, '..', '..', 'src', 'data', 'sp500-tag-classifications.json');
let l3Classifications = {};
try {
  const raw = JSON.parse(readFileSync(l3ClassificationsPath, 'utf-8'));
  l3Classifications = raw.classifications || {};
  console.log(`Layer 3 classifications loaded: ${Object.keys(l3Classifications).length} tags`);
} catch { /* Layer 3 not available */ }

// Build reverse lookup: section:field → [{ tag, confidence, unit, negate }]
const l3FieldIndex = {};
for (const [tag, cls] of Object.entries(l3Classifications)) {
  if (!cls.field || !cls.section) continue;
  const key = `${cls.section}:${cls.field}`;
  if (!l3FieldIndex[key]) l3FieldIndex[key] = [];
  l3FieldIndex[key].push({ tag, confidence: cls.confidence, unit: cls.unit, negate: cls.negate });
}

// Map TAXONOMY categories to L3 section names
const CATEGORY_TO_SECTION = {
  'INCOME': 'income',
  'BALANCE SHEET': 'balance',
  'CASH FLOW': 'cashFlow',
};

// ── Layer 2: Augment tag lists with taxonomy hierarchy descendants ──
const taxonomyHierarchyPath = join(__dirname, '..', '..', 'src', 'data', 'taxonomy-hierarchy.json');
let taxonomyHierarchy = {};
try {
  const raw = JSON.parse(readFileSync(taxonomyHierarchyPath, 'utf-8'));
  taxonomyHierarchy = raw.hierarchy || {};
  console.log(`Layer 2 taxonomy loaded: ${Object.keys(taxonomyHierarchy).length} concepts with descendants`);
} catch { /* Layer 2 not available, Layer 1 only */ }

// Augment each field's tags with Layer 2 descendants
for (const [field, def] of Object.entries(TAXONOMY)) {
  const layer1Set = new Set(def.tags);
  const additional = [];
  for (const rootTag of def.tags) {
    const descendants = taxonomyHierarchy[rootTag];
    if (!descendants) continue;
    for (const tag of descendants) {
      if (!layer1Set.has(tag) && !additional.includes(tag)) {
        additional.push(tag);
      }
    }
  }
  if (additional.length > 0) {
    def.tags = [...def.tags, ...additional];
    def._layer2Count = additional.length;
  }
}

const ALL_FIELDS = Object.keys(TAXONOMY);
const TIER1_FIELDS = ALL_FIELDS.filter(f => TAXONOMY[f].tier === 1);
const TIER2_FIELDS = ALL_FIELDS.filter(f => TAXONOMY[f].tier === 2);
const TIER3_FIELDS = ALL_FIELDS.filter(f => TAXONOMY[f].tier === 3);

// ─── Helpers ────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithUA(url) {
  const resp = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
  return resp.json();
}

async function fetchHTML(url) {
  const resp = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
  return resp.text();
}

// ─── S&P 500 Fetch ─────────────────────────────────────────────────

async function fetchSP500() {
  console.log('Fetching S&P 500 constituents from Wikipedia...');
  try {
    const html = await fetchHTML('https://en.wikipedia.org/wiki/List_of_S%26P_500_companies');
    const $ = cheerio.load(html);
    const companies = [];

    // First table on the page is the constituents table
    const table = $('table.wikitable').first();
    table.find('tbody tr').each((i, row) => {
      const cells = $(row).find('td');
      if (cells.length === 0) return; // skip header

      const ticker = $(cells[0]).text().trim().replace('.', '-'); // BRK.B → BRK-B for EDGAR
      const companyName = $(cells[1]).text().trim();
      const sector = $(cells[3]).text().trim();
      const subIndustry = $(cells[4]).text().trim();

      if (ticker) {
        companies.push({ ticker, companyName, sector, subIndustry });
      }
    });

    console.log(`  Found ${companies.length} companies from Wikipedia`);
    return companies;
  } catch (err) {
    console.warn(`  Wikipedia fetch failed: ${err.message}`);
    console.log('  Using fallback ticker list...');
    return getFallbackTickers();
  }
}

function getFallbackTickers() {
  // Diverse set across all 11 GICS sectors
  const tickers = [
    // Info Tech
    { ticker: 'AAPL', sector: 'Information Technology' }, { ticker: 'MSFT', sector: 'Information Technology' },
    { ticker: 'NVDA', sector: 'Information Technology' }, { ticker: 'AVGO', sector: 'Information Technology' },
    { ticker: 'ADBE', sector: 'Information Technology' }, { ticker: 'CRM', sector: 'Information Technology' },
    { ticker: 'CSCO', sector: 'Information Technology' }, { ticker: 'ORCL', sector: 'Information Technology' },
    { ticker: 'ACN', sector: 'Information Technology' }, { ticker: 'INTC', sector: 'Information Technology' },
    // Health Care
    { ticker: 'UNH', sector: 'Health Care' }, { ticker: 'JNJ', sector: 'Health Care' },
    { ticker: 'LLY', sector: 'Health Care' }, { ticker: 'PFE', sector: 'Health Care' },
    { ticker: 'ABBV', sector: 'Health Care' }, { ticker: 'MRK', sector: 'Health Care' },
    { ticker: 'TMO', sector: 'Health Care' }, { ticker: 'ABT', sector: 'Health Care' },
    { ticker: 'AMGN', sector: 'Health Care' }, { ticker: 'BMY', sector: 'Health Care' },
    // Financials
    { ticker: 'BRK-B', sector: 'Financials' }, { ticker: 'JPM', sector: 'Financials' },
    { ticker: 'V', sector: 'Financials' }, { ticker: 'MA', sector: 'Financials' },
    { ticker: 'BAC', sector: 'Financials' }, { ticker: 'WFC', sector: 'Financials' },
    { ticker: 'GS', sector: 'Financials' }, { ticker: 'MS', sector: 'Financials' },
    { ticker: 'BLK', sector: 'Financials' }, { ticker: 'SCHW', sector: 'Financials' },
    // Consumer Discretionary
    { ticker: 'AMZN', sector: 'Consumer Discretionary' }, { ticker: 'TSLA', sector: 'Consumer Discretionary' },
    { ticker: 'HD', sector: 'Consumer Discretionary' }, { ticker: 'MCD', sector: 'Consumer Discretionary' },
    { ticker: 'NKE', sector: 'Consumer Discretionary' }, { ticker: 'LULU', sector: 'Consumer Discretionary' },
    { ticker: 'SBUX', sector: 'Consumer Discretionary' }, { ticker: 'TJX', sector: 'Consumer Discretionary' },
    { ticker: 'LOW', sector: 'Consumer Discretionary' }, { ticker: 'BKNG', sector: 'Consumer Discretionary' },
    // Communication Services
    { ticker: 'META', sector: 'Communication Services' }, { ticker: 'GOOGL', sector: 'Communication Services' },
    { ticker: 'NFLX', sector: 'Communication Services' }, { ticker: 'DIS', sector: 'Communication Services' },
    { ticker: 'CMCSA', sector: 'Communication Services' }, { ticker: 'T', sector: 'Communication Services' },
    { ticker: 'VZ', sector: 'Communication Services' }, { ticker: 'TMUS', sector: 'Communication Services' },
    // Industrials
    { ticker: 'GE', sector: 'Industrials' }, { ticker: 'CAT', sector: 'Industrials' },
    { ticker: 'UNP', sector: 'Industrials' }, { ticker: 'HON', sector: 'Industrials' },
    { ticker: 'RTX', sector: 'Industrials' }, { ticker: 'DE', sector: 'Industrials' },
    { ticker: 'UPS', sector: 'Industrials' }, { ticker: 'LMT', sector: 'Industrials' },
    { ticker: 'BA', sector: 'Industrials' }, { ticker: 'MMM', sector: 'Industrials' },
    // Consumer Staples
    { ticker: 'PG', sector: 'Consumer Staples' }, { ticker: 'KO', sector: 'Consumer Staples' },
    { ticker: 'PEP', sector: 'Consumer Staples' }, { ticker: 'COST', sector: 'Consumer Staples' },
    { ticker: 'WMT', sector: 'Consumer Staples' }, { ticker: 'PM', sector: 'Consumer Staples' },
    { ticker: 'MO', sector: 'Consumer Staples' }, { ticker: 'CL', sector: 'Consumer Staples' },
    // Energy
    { ticker: 'XOM', sector: 'Energy' }, { ticker: 'CVX', sector: 'Energy' },
    { ticker: 'COP', sector: 'Energy' }, { ticker: 'SLB', sector: 'Energy' },
    { ticker: 'EOG', sector: 'Energy' }, { ticker: 'MPC', sector: 'Energy' },
    { ticker: 'PSX', sector: 'Energy' }, { ticker: 'VLO', sector: 'Energy' },
    // Utilities
    { ticker: 'NEE', sector: 'Utilities' }, { ticker: 'DUK', sector: 'Utilities' },
    { ticker: 'SO', sector: 'Utilities' }, { ticker: 'D', sector: 'Utilities' },
    { ticker: 'AEP', sector: 'Utilities' }, { ticker: 'EXC', sector: 'Utilities' },
    // Real Estate
    { ticker: 'PLD', sector: 'Real Estate' }, { ticker: 'AMT', sector: 'Real Estate' },
    { ticker: 'EQIX', sector: 'Real Estate' }, { ticker: 'CCI', sector: 'Real Estate' },
    { ticker: 'PSA', sector: 'Real Estate' }, { ticker: 'SPG', sector: 'Real Estate' },
    // Materials
    { ticker: 'LIN', sector: 'Materials' }, { ticker: 'APD', sector: 'Materials' },
    { ticker: 'SHW', sector: 'Materials' }, { ticker: 'FCX', sector: 'Materials' },
    { ticker: 'NEM', sector: 'Materials' }, { ticker: 'ECL', sector: 'Materials' },
  ];
  return tickers.map(t => ({ ...t, companyName: t.ticker, subIndustry: '' }));
}

// ─── CIK Lookup ─────────────────────────────────────────────────────

async function buildCIKMap() {
  console.log('Fetching CIK lookup table from SEC...');
  const data = await fetchWithUA('https://www.sec.gov/files/company_tickers.json');
  const map = {};
  for (const entry of Object.values(data)) {
    const ticker = entry.ticker.toUpperCase();
    const cik = String(entry.cik_str).padStart(10, '0');
    map[ticker] = { cik, title: entry.title };
  }
  console.log(`  Loaded ${Object.keys(map).length} ticker-to-CIK mappings`);
  return map;
}

// ─── Coverage Check ─────────────────────────────────────────────────

function checkCoverage(facts) {
  const usGaap = facts?.['us-gaap'] || {};
  const result = {};    // field → { covered: bool, matchedTag: string|null, layer: number|null }

  // Build set of all L1+L2 tags for orphan detection
  const allKnownTags = new Set();
  for (const def of Object.values(TAXONOMY)) {
    for (const tag of def.tags) allKnownTags.add(tag);
  }

  for (const [field, def] of Object.entries(TAXONOMY)) {
    const unitKey = def.unit; // 'USD', 'USD/shares', or 'shares'
    let covered = false;
    let matchedTag = null;
    let layer = null;

    // Layer 1+2: check taxonomy tags
    for (const tag of def.tags) {
      const tagData = usGaap[tag];
      if (!tagData) continue;

      const unitEntries = tagData.units?.[unitKey];
      if (!unitEntries || unitEntries.length === 0) continue;

      // Check for at least one 10-K entry
      const has10K = unitEntries.some(e => e.form === '10-K');
      if (has10K) {
        covered = true;
        matchedTag = tag;
        layer = def._layer2Count && def.tags.indexOf(tag) >= (def.tags.length - def._layer2Count) ? 2 : 1;
        break; // first match wins (priority order)
      }
    }

    // Layer 3: check pre-built classifications for orphan tags
    if (!covered && Object.keys(l3Classifications).length > 0) {
      const section = CATEGORY_TO_SECTION[def.category];
      const key = `${section}:${field}`;
      const candidates = l3FieldIndex[key] || [];

      for (const candidate of candidates) {
        if (candidate.unit !== unitKey) continue;
        if (allKnownTags.has(candidate.tag)) continue; // not an orphan

        const tagData = usGaap[candidate.tag];
        if (!tagData) continue;

        const unitEntries = tagData.units?.[unitKey];
        if (!unitEntries || unitEntries.length === 0) continue;

        const has10K = unitEntries.some(e => e.form === '10-K');
        if (has10K) {
          covered = true;
          matchedTag = candidate.tag;
          layer = 3;
          break;
        }
      }
    }

    result[field] = { covered, matchedTag, layer };
  }

  return result;
}

// ─── Checkpoint Management ──────────────────────────────────────────

function loadCheckpoint() {
  if (existsSync(CHECKPOINT_PATH)) {
    try {
      const data = JSON.parse(readFileSync(CHECKPOINT_PATH, 'utf-8'));
      console.log(`  Resuming from checkpoint: ${data.results.length} companies already processed`);
      return data;
    } catch {
      console.warn('  Checkpoint file corrupt, starting fresh');
    }
  }
  return { results: [], cikFailures: [], fetchFailures: [] };
}

function saveCheckpoint(checkpoint) {
  writeFileSync(CHECKPOINT_PATH, JSON.stringify(checkpoint), 'utf-8');
}

// ─── Main Scan ──────────────────────────────────────────────────────

async function runAudit() {
  const startTime = Date.now();

  const companies = await fetchSP500();
  await sleep(DELAY_MS);
  const cikMap = await buildCIKMap();
  await sleep(DELAY_MS);

  const checkpoint = loadCheckpoint();
  const processedTickers = new Set(checkpoint.results.map(r => r.ticker));
  const results = [...checkpoint.results];
  const cikFailures = [...checkpoint.cikFailures];
  const fetchFailures = [...checkpoint.fetchFailures];

  const total = companies.length;
  let processed = results.length;

  for (const company of companies) {
    const { ticker } = company;

    // Skip already processed
    if (processedTickers.has(ticker)) continue;

    // CIK lookup
    // Try exact match, then without hyphen conversion
    const lookupTicker = ticker.toUpperCase();
    const cikEntry = cikMap[lookupTicker] || cikMap[lookupTicker.replace('-', '.')];

    if (!cikEntry) {
      cikFailures.push({ ticker, companyName: company.companyName, sector: company.sector });
      processed++;
      console.log(`[${processed}/${total}] ${ticker} — CIK not found, skipping`);
      continue;
    }

    // Fetch companyfacts
    try {
      await sleep(DELAY_MS);
      const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cikEntry.cik}.json`;
      const data = await fetchWithUA(url);

      const coverage = checkCoverage(data.facts);

      // Compute tier summaries
      const tier1Covered = TIER1_FIELDS.filter(f => coverage[f].covered).length;
      const tier2Covered = TIER2_FIELDS.filter(f => coverage[f].covered).length;
      const tier3Covered = TIER3_FIELDS.filter(f => coverage[f].covered).length;

      const tier1Pct = Math.round(100 * tier1Covered / TIER1_FIELDS.length);
      const tier2Pct = Math.round(100 * tier2Covered / TIER2_FIELDS.length);
      const tier3Pct = Math.round(100 * tier3Covered / TIER3_FIELDS.length);

      results.push({
        ticker,
        companyName: company.companyName,
        sector: company.sector,
        subIndustry: company.subIndustry,
        cik: cikEntry.cik,
        coverage,
        tier1Pct,
        tier2Pct,
        tier3Pct,
      });

      processed++;
      console.log(`[${processed}/${total}] ${ticker} — Tier 1: ${tier1Pct}%, Tier 2: ${tier2Pct}%, Tier 3: ${tier3Pct}%`);

    } catch (err) {
      fetchFailures.push({ ticker, companyName: company.companyName, sector: company.sector, error: err.message });
      processed++;
      console.log(`[${processed}/${total}] ${ticker} — FETCH FAILED: ${err.message}`);
    }

    // Checkpoint every 50
    if (processed % 50 === 0) {
      saveCheckpoint({ results, cikFailures, fetchFailures });
      console.log(`  --- Checkpoint saved (${processed}/${total}) ---`);
    }
  }

  // Final checkpoint
  saveCheckpoint({ results, cikFailures, fetchFailures });

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  console.log(`\nScan complete in ${Math.floor(elapsed / 60)}m ${elapsed % 60}s`);
  console.log(`  ${results.length} companies processed, ${cikFailures.length} CIK failures, ${fetchFailures.length} fetch failures`);

  // Generate reports
  generateReport(results, cikFailures, fetchFailures, companies.length);
  generateCSV(results);

  console.log(`\nReport saved to: ${REPORT_PATH}`);
  console.log(`CSV saved to: ${CSV_PATH}`);
}

// ─── Report Generation ──────────────────────────────────────────────

function generateReport(results, cikFailures, fetchFailures, totalCompanies) {
  const lines = [];
  const w = (...args) => lines.push(args.join(''));

  const successCount = results.length;

  // Compute field-level stats
  const fieldStats = {};
  for (const field of ALL_FIELDS) {
    const covered = results.filter(r => r.coverage[field].covered).length;
    const pct = successCount > 0 ? (100 * covered / successCount) : 0;

    // Per-sector breakdown
    const sectorCoverage = {};
    const sectorCounts = {};
    for (const r of results) {
      const s = r.sector || 'Unknown';
      sectorCounts[s] = (sectorCounts[s] || 0) + 1;
      if (r.coverage[field].covered) {
        sectorCoverage[s] = (sectorCoverage[s] || 0) + 1;
      }
    }
    const lowSectors = [];
    for (const [s, count] of Object.entries(sectorCounts)) {
      const sCov = (sectorCoverage[s] || 0) / count * 100;
      if (sCov < 80) lowSectors.push(`${s} (${Math.round(sCov)}%)`);
    }

    fieldStats[field] = { covered, missing: successCount - covered, pct, lowSectors };
  }

  // ── Section 1: Executive Summary ──
  const tier1Avg = TIER1_FIELDS.reduce((sum, f) => sum + fieldStats[f].pct, 0) / TIER1_FIELDS.length;
  const tier2Avg = TIER2_FIELDS.reduce((sum, f) => sum + fieldStats[f].pct, 0) / TIER2_FIELDS.length;
  const tier3Avg = TIER3_FIELDS.reduce((sum, f) => sum + fieldStats[f].pct, 0) / TIER3_FIELDS.length;

  w('# XBRL Taxonomy Coverage Audit — S&P 500');
  w('');
  w(`*Generated ${new Date().toISOString().split('T')[0]}*`);
  w('');
  w('## 1. Executive Summary');
  w('');
  w(`- **Total companies targeted**: ${totalCompanies}`);
  w(`- **Successfully scanned**: ${successCount}`);
  w(`- **CIK lookup failures**: ${cikFailures.length}${cikFailures.length > 0 ? ' — ' + cikFailures.map(c => c.ticker).join(', ') : ''}`);
  w(`- **Companyfacts fetch failures**: ${fetchFailures.length}${fetchFailures.length > 0 ? ' — ' + fetchFailures.map(c => c.ticker).join(', ') : ''}`);
  w('');
  w(`| Tier | Fields | Avg Coverage |`);
  w(`|------|--------|-------------|`);
  w(`| **Tier 1** (Scoring-Critical) | ${TIER1_FIELDS.length} | **${tier1Avg.toFixed(1)}%** |`);
  w(`| **Tier 2** (Display) | ${TIER2_FIELDS.length} | **${tier2Avg.toFixed(1)}%** |`);
  w(`| **Tier 3** (Expanded) | ${TIER3_FIELDS.length} | **${tier3Avg.toFixed(1)}%** |`);
  w('');

  // ── Section 2: Field-Level Coverage Table ──
  w('## 2. Field-Level Coverage Table');
  w('');
  w('Sorted by coverage % ascending (worst gaps first).');
  w('');
  w('| Field | Tier | Category | Coverage % | # Missing | Low-Coverage Sectors (<80%) |');
  w('|-------|------|----------|-----------|-----------|----------------------------|');

  const sorted = [...ALL_FIELDS].sort((a, b) => fieldStats[a].pct - fieldStats[b].pct);
  for (const field of sorted) {
    const s = fieldStats[field];
    const def = TAXONOMY[field];
    const lowStr = s.lowSectors.length > 0 ? s.lowSectors.join('; ') : '—';
    w(`| ${field} | ${def.tier} | ${def.category} | ${s.pct.toFixed(1)}% | ${s.missing} | ${lowStr} |`);
  }
  w('');

  // ── Section 3: Sector-Level Heat Map ──
  w('## 3. Sector-Level Heat Map');
  w('');

  const sectors = {};
  for (const r of results) {
    const s = r.sector || 'Unknown';
    if (!sectors[s]) sectors[s] = [];
    sectors[s].push(r);
  }

  w('| Sector | Companies | Tier 1 Avg | Worst Field | Worst Field % |');
  w('|--------|-----------|------------|-------------|---------------|');

  const sectorRows = [];
  for (const [sector, companies] of Object.entries(sectors)) {
    const avgTier1 = companies.reduce((sum, c) => sum + c.tier1Pct, 0) / companies.length;

    // Find worst Tier 1 field for this sector
    let worstField = '';
    let worstPct = 100;
    for (const field of TIER1_FIELDS) {
      const covered = companies.filter(c => c.coverage[field].covered).length;
      const pct = 100 * covered / companies.length;
      if (pct < worstPct) {
        worstPct = pct;
        worstField = field;
      }
    }

    sectorRows.push({ sector, count: companies.length, avgTier1, worstField, worstPct });
  }

  sectorRows.sort((a, b) => a.avgTier1 - b.avgTier1);
  for (const row of sectorRows) {
    w(`| ${row.sector} | ${row.count} | ${row.avgTier1.toFixed(1)}% | ${row.worstField} | ${row.worstPct.toFixed(1)}% |`);
  }
  w('');

  // ── Section 4: Problem Companies ──
  w('## 4. Problem Companies (Missing Tier 1 Fields)');
  w('');

  const problemCompanies = results.filter(r => TIER1_FIELDS.some(f => !r.coverage[f].covered));

  if (problemCompanies.length === 0) {
    w('No companies are missing any Tier 1 fields! 🎉');
  } else {
    w(`${problemCompanies.length} companies have at least one missing Tier 1 field.`);
    w('');

    // Group by sector
    const bySector = {};
    for (const r of problemCompanies) {
      const s = r.sector || 'Unknown';
      if (!bySector[s]) bySector[s] = [];
      bySector[s].push(r);
    }

    for (const [sector, companies] of Object.entries(bySector).sort((a, b) => a[0].localeCompare(b[0]))) {
      w(`### ${sector}`);
      w('');
      w('| Ticker | Company | Sub-Industry | Missing Tier 1 Fields |');
      w('|--------|---------|--------------|----------------------|');

      for (const c of companies.sort((a, b) => a.ticker.localeCompare(b.ticker))) {
        const missing = TIER1_FIELDS.filter(f => !c.coverage[f].covered).join(', ');
        const subInd = c.subIndustry || '—';
        w(`| ${c.ticker} | ${c.companyName} | ${subInd} | ${missing} |`);
      }
      w('');
    }
  }

  // ── Section 5: Tag Hit Analysis (Tier 1 only) ──
  w('## 5. Tag Hit Analysis (Tier 1 Fields)');
  w('');
  w('Shows which specific XBRL tags provide coverage and how often.');
  w('');

  for (const field of TIER1_FIELDS) {
    const def = TAXONOMY[field];
    const tagCounts = {};
    let totalCovered = 0;

    // Count which tag matched for each company (first match in priority order)
    for (const r of results) {
      const match = r.coverage[field];
      if (match.covered && match.matchedTag) {
        tagCounts[match.matchedTag] = (tagCounts[match.matchedTag] || 0) + 1;
        totalCovered++;
      }
    }

    const notCovered = successCount - totalCovered;

    w(`### ${field}`);
    w('```');

    // Show tags in priority order
    for (const tag of def.tags) {
      const count = tagCounts[tag] || 0;
      if (count > 0) {
        const pct = (100 * count / successCount).toFixed(1);
        w(`  ${tag}: ${count} companies (${pct}%)`);
      }
    }
    w(`  TOTAL COVERED: ${totalCovered} (${(100 * totalCovered / successCount).toFixed(1)}%)`);
    w(`  NOT COVERED: ${notCovered} (${(100 * notCovered / successCount).toFixed(1)}%)`);
    w('```');
    w('');
  }

  // ── Section 6: Failure Details ──
  if (fetchFailures.length > 0) {
    w('## 6. Fetch Failure Details');
    w('');
    w('| Ticker | Sector | Error |');
    w('|--------|--------|-------|');
    for (const f of fetchFailures) {
      w(`| ${f.ticker} | ${f.sector} | ${f.error} |`);
    }
    w('');
  }

  writeFileSync(REPORT_PATH, lines.join('\n'), 'utf-8');
}

function generateCSV(results) {
  const header = ['ticker', 'company_name', 'sector', 'sub_industry', 'cik', ...ALL_FIELDS];
  const rows = [header.join(',')];

  for (const r of results) {
    const row = [
      r.ticker,
      `"${(r.companyName || '').replace(/"/g, '""')}"`,
      `"${(r.sector || '').replace(/"/g, '""')}"`,
      `"${(r.subIndustry || '').replace(/"/g, '""')}"`,
      r.cik,
      ...ALL_FIELDS.map(f => r.coverage[f].covered ? 1 : 0),
    ];
    rows.push(row.join(','));
  }

  writeFileSync(CSV_PATH, rows.join('\n'), 'utf-8');
}

// ─── Run ────────────────────────────────────────────────────────────

runAudit().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
