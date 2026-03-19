/**
 * Layer 3 Build Script — S&P 500 Orphan Tag Classification
 *
 * Scans all S&P 500 companyfacts from EDGAR, finds XBRL tags not in our
 * Layer 1+2 taxonomy, deduplicates them, then classifies via Claude API.
 * Outputs src/data/sp500-tag-classifications.json for runtime Layer 3 use.
 *
 * Usage:
 *   node validation/scripts/build-tag-classifications.js
 *
 * Requires ANTHROPIC_API_KEY or VITE_CLAUDE_KEY env var (or in .env.local).
 * Rate-limited to 10 req/sec for SEC EDGAR. Full scan ~60-90 min.
 * Checkpoints every 50 companies for resume-on-interrupt.
 *
 * Phase 1: Scan S&P 500 companyfacts → collect orphan tags
 * Phase 2: Classify orphan tags via Claude API → output JSON
 */

import * as cheerio from 'cheerio';
import Anthropic from '@anthropic-ai/sdk';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPORTS_DIR = join(__dirname, '..', 'reports');
const CHECKPOINT_PATH = join(REPORTS_DIR, 'l3-scan-checkpoint.json');
const OUTPUT_PATH = join(__dirname, '..', '..', 'src', 'data', 'sp500-tag-classifications.json');

if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });

const UA = 'Thes1s/1.0 (contact@thes1s.app)';
const DELAY_MS = 120;

// ─── API Key ─────────────────────────────────────────────────

function getApiKey() {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  if (process.env.VITE_CLAUDE_KEY) return process.env.VITE_CLAUDE_KEY;
  try {
    const envContent = readFileSync(join(__dirname, '..', '..', '.env.local'), 'utf-8');
    const match = envContent.match(/VITE_CLAUDE_KEY=(.+)/);
    if (match) return match[1].trim();
  } catch {}
  return null;
}

// ─── Known Tags (Layer 1 + Layer 2) ─────────────────────────

// Mirror of the TAXONOMY from coverage-audit.js — all Layer 1 tags
const LAYER1_TAGS = new Set();

// All tag lists from all three taxonomy sections (must match edgarFinancials.js)
const ALL_FIELD_TAGS = {
  // Income
  revenues: ['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues', 'SalesRevenueNet', 'SalesRevenueGoodsNet', 'RevenueFromContractWithCustomerIncludingAssessedTax'],
  cost_of_revenue: ['CostOfRevenue', 'CostOfGoodsAndServicesSold', 'CostOfGoodsSold'],
  gross_profit: ['GrossProfit'],
  sga: ['SellingGeneralAndAdministrativeExpense'],
  selling_expense: ['SellingAndMarketingExpense'],
  general_and_admin_expense: ['GeneralAndAdministrativeExpense'],
  research_and_development: ['ResearchAndDevelopmentExpense', 'ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost'],
  depreciation_amortization_is: ['DepreciationAndAmortization', 'DepreciationDepletionAndAmortization'],
  other_operating_expenses: ['OtherOperatingIncomeExpenseNet', 'RestructuringCharges', 'GoodwillImpairmentLoss', 'AssetImpairmentCharges'],
  operating_expenses: ['OperatingExpenses', 'CostsAndExpenses'],
  operating_income_loss: ['OperatingIncomeLoss', 'OperatingIncomeLossFromContinuingOperations'],
  interest_income: ['InvestmentIncomeInterest', 'InterestIncomeOther', 'InterestAndDividendIncomeOperating', 'InvestmentIncomeInterestAndDividend'],
  interest_expense: ['InterestExpense', 'InterestExpenseDebt', 'InterestExpenseOperating'],
  net_interest_income: ['InterestIncomeExpenseNet', 'InterestIncomeExpenseNonoperatingNet'],
  other_income_expense: ['NonoperatingIncomeExpense', 'OtherNonoperatingIncomeExpense', 'IncomeLossFromEquityMethodInvestments', 'GainLossOnInvestments'],
  income_before_tax: ['IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest', 'IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments', 'IncomeLossFromContinuingOperationsBeforeIncomeTaxesDomestic'],
  income_tax: ['IncomeTaxExpenseBenefit'],
  income_from_continuing_operations: ['IncomeLossFromContinuingOperations'],
  net_income_loss: ['NetIncomeLoss', 'ProfitLoss', 'NetIncomeLossAvailableToCommonStockholdersBasic'],
  net_income_including_nci: ['ProfitLoss', 'NetIncomeLoss'],
  basic_earnings_per_share: ['EarningsPerShareBasic'],
  diluted_earnings_per_share: ['EarningsPerShareDiluted'],
  basic_average_shares: ['WeightedAverageNumberOfSharesOutstandingBasic', 'WeightedAverageNumberOfShareOutstandingBasicAndDiluted'],
  diluted_average_shares: ['WeightedAverageNumberOfDilutedSharesOutstanding'],
  dividends_per_share: ['CommonStockDividendsPerShareDeclared', 'CommonStockDividendsPerShareCashPaid'],
  // Balance
  cash: ['CashAndCashEquivalentsAtCarryingValue', 'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents', 'Cash'],
  cash_only: ['Cash'],
  cash_equivalents: ['CashEquivalentsAtCarryingValue'],
  cash_and_short_term_investments: ['CashCashEquivalentsAndShortTermInvestments'],
  short_term_investments: ['ShortTermInvestments', 'MarketableSecuritiesCurrent', 'AvailableForSaleSecuritiesCurrent', 'DebtSecuritiesAvailableForSaleCurrent'],
  accounts_receivable: ['AccountsReceivableNetCurrent', 'ReceivablesNetCurrent', 'AccountsReceivableNet'],
  accounts_receivable_gross: ['AccountsReceivableGrossCurrent'],
  allowance_doubtful_accounts: ['AllowanceForDoubtfulAccountsReceivableCurrent'],
  vendor_receivables: ['NontradeReceivablesCurrent', 'OtherReceivablesCurrent'],
  receivables_broad: ['ReceivablesNetCurrent', 'AccountsNotesAndLoansReceivableNetCurrent'],
  inventory: ['InventoryNet', 'InventoryFinishedGoodsAndWorkInProcess', 'InventoryRawMaterialsAndSupplies'],
  prepaid_expenses: ['PrepaidExpenseAndOtherAssetsCurrent', 'PrepaidExpenseCurrent'],
  other_current_assets: ['OtherAssetsCurrent'],
  current_assets: ['AssetsCurrent'],
  property_plant_equipment_gross: ['PropertyPlantAndEquipmentGross'],
  ppe_land: ['Land', 'LandAndLandImprovements'],
  ppe_buildings: ['BuildingsAndImprovements', 'BuildingAndBuildingImprovements'],
  ppe_machinery: ['MachineryAndEquipment', 'MachineryAndEquipmentGross', 'FurnitureAndFixturesGross'],
  ppe_leasehold: ['LeaseholdImprovementsGross'],
  ppe_other: ['OtherPropertyPlantAndEquipment'],
  ppe_construction: ['ConstructionInProgressGross'],
  accumulated_depreciation: ['AccumulatedDepreciationDepletionAndAmortizationPropertyPlantAndEquipment'],
  property_plant_equipment: ['PropertyPlantAndEquipmentNet', 'PropertyPlantAndEquipmentAndFinanceLeaseRightOfUseAssetAfterAccumulatedDepreciationAndAmortization'],
  operating_lease_rou_asset: ['OperatingLeaseRightOfUseAsset'],
  goodwill: ['Goodwill'],
  intangible_assets: ['IntangibleAssetsNetExcludingGoodwill', 'FiniteLivedIntangibleAssetsNet', 'IndefiniteLivedIntangibleAssetsExcludingGoodwill'],
  long_term_investments: ['LongTermInvestments', 'InvestmentsAndAdvances', 'MarketableSecuritiesNoncurrent', 'AvailableForSaleSecuritiesNoncurrent', 'DebtSecuritiesAvailableForSaleNoncurrent'],
  available_for_sale_securities: ['AvailableForSaleSecurities', 'AvailableForSaleSecuritiesNoncurrent', 'DebtSecuritiesAvailableForSaleNoncurrent'],
  deferred_tax_assets: ['DeferredIncomeTaxAssetsNet'],
  other_noncurrent_assets: ['OtherAssetsNoncurrent', 'OtherAssets'],
  assets: ['Assets'],
  accounts_payable: ['AccountsPayableCurrent', 'AccountsPayableAndAccruedLiabilitiesCurrent'],
  accrued_liabilities: ['AccruedLiabilitiesCurrent', 'EmployeeRelatedLiabilitiesCurrent'],
  short_term_debt: ['ShortTermBorrowings', 'DebtCurrent', 'CommercialPaper', 'LineOfCredit', 'ShortTermBankLoansAndNotesPayable'],
  current_portion_lt_debt: ['LongTermDebtCurrent', 'LongTermDebtAndCapitalLeaseObligationsCurrent', 'OtherLongTermDebtCurrent'],
  operating_lease_liability_current: ['OperatingLeaseLiabilityCurrent'],
  finance_lease_liability_current: ['FinanceLeaseLiabilityCurrent'],
  deferred_revenue_current: ['DeferredRevenueCurrent', 'ContractWithCustomerLiabilityCurrent'],
  other_current_liabilities: ['OtherLiabilitiesCurrent'],
  current_liabilities: ['LiabilitiesCurrent'],
  long_term_debt: ['LongTermDebtNoncurrent', 'LongTermDebt', 'LongTermLineOfCredit', 'SecuredDebt', 'UnsecuredDebt', 'SeniorNotesNoncurrent', 'MortgageLoansOnRealEstate', 'SubordinatedDebt', 'LongTermNotesPayable'],
  long_term_debt_and_leases: ['LongTermDebtAndCapitalLeaseObligations'],
  operating_lease_liability_noncurrent: ['OperatingLeaseLiabilityNoncurrent'],
  finance_lease_liability_noncurrent: ['FinanceLeaseLiabilityNoncurrent'],
  deferred_revenue_noncurrent: ['DeferredRevenueNoncurrent', 'ContractWithCustomerLiabilityNoncurrent'],
  deferred_tax_liabilities: ['DeferredIncomeTaxLiabilitiesNet', 'DeferredIncomeTaxLiabilities'],
  pension_liabilities: ['PensionAndOtherPostretirementDefinedBenefitPlansLiabilitiesNoncurrent'],
  other_noncurrent_liabilities: ['OtherLiabilitiesNoncurrent'],
  noncurrent_liabilities: ['LiabilitiesNoncurrent'],
  liabilities: ['Liabilities'],
  liabilities_and_equity: ['LiabilitiesAndStockholdersEquity'],
  common_stock: ['CommonStockValue', 'CommonStocksIncludingAdditionalPaidInCapital'],
  additional_paid_in_capital: ['AdditionalPaidInCapitalCommonStock', 'AdditionalPaidInCapital'],
  retained_earnings: ['RetainedEarningsAccumulatedDeficit', 'RetainedEarningsUnappropriated'],
  aoci: ['AccumulatedOtherComprehensiveIncomeLossNetOfTax'],
  treasury_stock: ['TreasuryStockValue', 'TreasuryStockCommonValue'],
  equity: ['StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'],
  equity_attributable_to_parent: ['StockholdersEquity'],
  minority_interest: ['MinorityInterest', 'RedeemableNoncontrollingInterestEquityCarryingAmount'],
  preferred_stock: ['PreferredStockValue'],
  shares_outstanding: ['CommonStockSharesOutstanding', 'CommonStockSharesIssued'],
  treasury_shares: ['TreasuryStockCommonShares', 'TreasuryStockShares'],
  // Cash Flow
  net_cash_flow_from_operating_activities: ['NetCashProvidedByUsedInOperatingActivities', 'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations'],
  depreciation_amortization: ['DepreciationDepletionAndAmortization', 'DepreciationAndAmortization', 'DepreciationAmortizationAndAccretionNet', 'OtherDepreciationAndAmortization'],
  depreciation_only: ['Depreciation'],
  amortization_of_intangibles: ['AmortizationOfIntangibleAssets'],
  stock_based_compensation: ['ShareBasedCompensation', 'AllocatedShareBasedCompensationExpense'],
  deferred_income_tax: ['DeferredIncomeTaxExpenseBenefit', 'DeferredIncomeTaxesAndTaxCredits'],
  other_noncash_items: ['OtherNoncashIncomeExpense'],
  change_in_receivables: ['IncreaseDecreaseInAccountsReceivable', 'IncreaseDecreaseInReceivables'],
  change_in_inventory: ['IncreaseDecreaseInInventories'],
  change_in_payables: ['IncreaseDecreaseInAccountsPayable', 'IncreaseDecreaseInAccountsPayableAndAccruedLiabilities'],
  change_in_other_working_capital: ['IncreaseDecreaseInOtherOperatingCapitalNet', 'IncreaseDecreaseInOperatingCapital'],
  capital_expenditures: ['PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets', 'PaymentsToAcquireOtherPropertyPlantAndEquipment'],
  sale_of_ppe: ['ProceedsFromSaleOfPropertyPlantAndEquipment'],
  purchase_of_investments: ['PaymentsToAcquireInvestments', 'PaymentsToAcquireShortTermInvestments', 'PaymentsToAcquireAvailableForSaleSecuritiesDebt', 'PaymentsToAcquireMarketableSecurities'],
  sale_of_investments: ['ProceedsFromSaleOfInvestments', 'ProceedsFromSaleOfShortTermInvestments', 'ProceedsFromSaleAndMaturityOfMarketableSecurities', 'ProceedsFromMaturitiesPrepaymentsAndCallsOfAvailableForSaleSecurities', 'ProceedsFromSaleOfAvailableForSaleSecuritiesDebt'],
  purchase_of_business: ['PaymentsToAcquireBusinessesNetOfCashAcquired', 'PaymentsToAcquireBusinessesGross'],
  sale_of_business: ['ProceedsFromDivestitureOfBusinesses'],
  purchase_of_intangibles: ['PaymentsToAcquireIntangibleAssets'],
  other_investing: ['PaymentsForProceedsFromOtherInvestingActivities'],
  net_cash_flow_from_investing_activities: ['NetCashProvidedByUsedInInvestingActivities', 'NetCashProvidedByUsedInInvestingActivitiesContinuingOperations'],
  proceeds_from_lt_debt: ['ProceedsFromIssuanceOfLongTermDebt', 'ProceedsFromIssuanceOfDebt'],
  repayments_of_lt_debt: ['RepaymentsOfLongTermDebt', 'RepaymentsOfDebt'],
  proceeds_from_st_debt: ['ProceedsFromShortTermDebt', 'ProceedsFromLinesOfCredit', 'ProceedsFromRepaymentsOfCommercialPaper'],
  repayments_of_st_debt: ['RepaymentsOfShortTermDebt', 'RepaymentsOfLinesOfCredit'],
  share_repurchases: ['PaymentsForRepurchaseOfCommonStock', 'PaymentsForRepurchaseOfEquity'],
  proceeds_from_stock_issuance: ['ProceedsFromIssuanceOfCommonStock', 'ProceedsFromStockOptionsExercised'],
  dividends_paid: ['PaymentsOfDividendsCommonStock', 'PaymentsOfDividends', 'PaymentsOfOrdinaryDividends'],
  finance_lease_payments: ['FinanceLeasePrincipalPayments'],
  other_financing: ['ProceedsFromPaymentsForOtherFinancingActivities', 'PaymentsRelatedToTaxWithholdingForShareBasedCompensation'],
  net_cash_flow_from_financing_activities: ['NetCashProvidedByUsedInFinancingActivities', 'NetCashProvidedByUsedInFinancingActivitiesContinuingOperations'],
  effect_of_exchange_rate: ['EffectOfExchangeRateOnCashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents', 'EffectOfExchangeRateOnCashAndCashEquivalents'],
  interest_paid: ['InterestPaidNet', 'InterestPaid'],
  income_taxes_paid: ['IncomeTaxesPaidNet', 'IncomeTaxesPaid'],
};

// Build known tags set (Layer 1)
for (const tags of Object.values(ALL_FIELD_TAGS)) {
  for (const tag of tags) LAYER1_TAGS.add(tag);
}

// Add Layer 2 descendants
const taxonomyHierarchyPath = join(__dirname, '..', '..', 'src', 'data', 'taxonomy-hierarchy.json');
try {
  const raw = JSON.parse(readFileSync(taxonomyHierarchyPath, 'utf-8'));
  const hierarchy = raw.hierarchy || {};
  for (const tag of LAYER1_TAGS) {
    const descendants = hierarchy[tag];
    if (descendants) {
      for (const d of descendants) LAYER1_TAGS.add(d);
    }
  }
  console.log(`Known tags (L1+L2): ${LAYER1_TAGS.size}`);
} catch {
  console.log(`Known tags (L1 only): ${LAYER1_TAGS.size}`);
}

// ─── Field definitions for classification prompt ─────────────

const FIELD_SECTION_MAP = {};
const INCOME_FIELDS = ['revenues','cost_of_revenue','gross_profit','sga','selling_expense','general_and_admin_expense','research_and_development','depreciation_amortization_is','other_operating_expenses','operating_expenses','operating_income_loss','interest_income','interest_expense','net_interest_income','other_income_expense','income_before_tax','income_tax','income_from_continuing_operations','net_income_loss','net_income_including_nci','basic_earnings_per_share','diluted_earnings_per_share','basic_average_shares','diluted_average_shares','dividends_per_share'];
const BALANCE_FIELDS = ['cash','short_term_investments','accounts_receivable','inventory','prepaid_expenses','other_current_assets','current_assets','property_plant_equipment_gross','accumulated_depreciation','property_plant_equipment','operating_lease_rou_asset','goodwill','intangible_assets','long_term_investments','deferred_tax_assets','other_noncurrent_assets','assets','accounts_payable','accrued_liabilities','short_term_debt','current_portion_lt_debt','operating_lease_liability_current','deferred_revenue_current','other_current_liabilities','current_liabilities','long_term_debt','operating_lease_liability_noncurrent','deferred_tax_liabilities','pension_liabilities','other_noncurrent_liabilities','noncurrent_liabilities','liabilities','liabilities_and_equity','common_stock','additional_paid_in_capital','retained_earnings','aoci','treasury_stock','equity','minority_interest','shares_outstanding'];
const CF_FIELDS = ['net_cash_flow_from_operating_activities','depreciation_amortization','stock_based_compensation','deferred_income_tax','other_noncash_items','change_in_receivables','change_in_inventory','change_in_payables','change_in_other_working_capital','capital_expenditures','sale_of_ppe','purchase_of_investments','sale_of_investments','purchase_of_business','net_cash_flow_from_investing_activities','proceeds_from_lt_debt','repayments_of_lt_debt','share_repurchases','proceeds_from_stock_issuance','dividends_paid','net_cash_flow_from_financing_activities','effect_of_exchange_rate'];
for (const f of INCOME_FIELDS) FIELD_SECTION_MAP[f] = 'income';
for (const f of BALANCE_FIELDS) FIELD_SECTION_MAP[f] = 'balance';
for (const f of CF_FIELDS) FIELD_SECTION_MAP[f] = 'cashFlow';

// ─── Helpers ─────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchWithUA(url) {
  const resp = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
  return resp.json();
}

async function fetchHTML(url) {
  const resp = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.text();
}

// ─── S&P 500 + CIK ──────────────────────────────────────────

async function fetchSP500() {
  console.log('Fetching S&P 500 constituents from Wikipedia...');
  try {
    const html = await fetchHTML('https://en.wikipedia.org/wiki/List_of_S%26P_500_companies');
    const $ = cheerio.load(html);
    const companies = [];
    $('table.wikitable').first().find('tbody tr').each((i, row) => {
      const cells = $(row).find('td');
      if (cells.length === 0) return;
      const ticker = $(cells[0]).text().trim().replace('.', '-');
      const companyName = $(cells[1]).text().trim();
      const sector = $(cells[3]).text().trim();
      if (ticker) companies.push({ ticker, companyName, sector });
    });
    console.log(`  Found ${companies.length} companies`);
    return companies;
  } catch (err) {
    console.warn(`  Wikipedia fetch failed: ${err.message}`);
    return [];
  }
}

async function buildCIKMap() {
  console.log('Fetching CIK lookup table...');
  const data = await fetchWithUA('https://www.sec.gov/files/company_tickers.json');
  const map = {};
  for (const entry of Object.values(data)) {
    map[entry.ticker.toUpperCase()] = String(entry.cik_str).padStart(10, '0');
  }
  return map;
}

// ─── Orphan Tag Discovery ────────────────────────────────────

function findOrphanTags(facts) {
  const usGaap = facts?.['us-gaap'] || {};
  const orphans = {};
  const FINANCIAL_UNITS = new Set(['USD', 'USD/shares', 'shares']);

  for (const [tag, tagData] of Object.entries(usGaap)) {
    if (LAYER1_TAGS.has(tag)) continue;

    for (const [unit, entries] of Object.entries(tagData.units || {})) {
      if (!FINANCIAL_UNITS.has(unit)) continue;
      if (entries.some(e => e.form === '10-K')) {
        if (!orphans[tag]) orphans[tag] = { units: new Set(), companies: 0 };
        orphans[tag].units.add(unit);
      }
    }
  }
  return orphans;
}

// ─── Checkpoint Management ───────────────────────────────────

function loadCheckpoint() {
  if (existsSync(CHECKPOINT_PATH)) {
    try {
      return JSON.parse(readFileSync(CHECKPOINT_PATH, 'utf-8'));
    } catch {}
  }
  return { processedTickers: [], orphanTagFrequency: {}, orphanTagUnits: {} };
}

function saveCheckpoint(cp) {
  writeFileSync(CHECKPOINT_PATH, JSON.stringify(cp), 'utf-8');
}

// ─── Phase 1: Scan ──────────────────────────────────────────

async function phase1Scan() {
  const companies = await fetchSP500();
  if (companies.length === 0) {
    console.error('No S&P 500 companies found. Aborting.');
    process.exit(1);
  }
  await sleep(DELAY_MS);
  const cikMap = await buildCIKMap();
  await sleep(DELAY_MS);

  const cp = loadCheckpoint();
  const processed = new Set(cp.processedTickers);
  const tagFreq = cp.orphanTagFrequency;
  const tagUnits = cp.orphanTagUnits;

  let done = processed.size;
  const total = companies.length;

  for (const { ticker } of companies) {
    if (processed.has(ticker)) continue;

    const cik = cikMap[ticker.toUpperCase()] || cikMap[ticker.toUpperCase().replace('-', '.')];
    if (!cik) {
      done++;
      console.log(`[${done}/${total}] ${ticker} — no CIK, skip`);
      processed.add(ticker);
      continue;
    }

    try {
      await sleep(DELAY_MS);
      const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;
      const data = await fetchWithUA(url);
      const orphans = findOrphanTags(data.facts);

      for (const [tag, info] of Object.entries(orphans)) {
        tagFreq[tag] = (tagFreq[tag] || 0) + 1;
        if (!tagUnits[tag]) tagUnits[tag] = [];
        for (const u of info.units) {
          if (!tagUnits[tag].includes(u)) tagUnits[tag].push(u);
        }
      }

      done++;
      const orphanCount = Object.keys(orphans).length;
      console.log(`[${done}/${total}] ${ticker} — ${orphanCount} orphan tags`);
    } catch (err) {
      done++;
      console.log(`[${done}/${total}] ${ticker} — FAILED: ${err.message}`);
    }

    processed.add(ticker);

    if (done % 50 === 0) {
      saveCheckpoint({ processedTickers: [...processed], orphanTagFrequency: tagFreq, orphanTagUnits: tagUnits });
      console.log(`  --- Checkpoint saved (${done}/${total}) ---`);
    }
  }

  saveCheckpoint({ processedTickers: [...processed], orphanTagFrequency: tagFreq, orphanTagUnits: tagUnits });
  console.log(`\nPhase 1 complete: ${Object.keys(tagFreq).length} unique orphan tags found across ${done} companies`);

  return { tagFreq, tagUnits, companiesScanned: done };
}

// ─── Phase 2: Classify ──────────────────────────────────────

const BATCH_SIZE = 200;

function buildFieldList() {
  const lines = ['INCOME STATEMENT:'];
  for (const f of INCOME_FIELDS) {
    const unit = ALL_FIELD_TAGS[f]?.[0]?.includes('PerShare') ? 'USD/shares'
      : f.includes('shares') || f === 'shares_outstanding' ? 'shares' : 'USD';
    lines.push(`  ${f} (${unit})`);
  }
  lines.push('', 'BALANCE SHEET:');
  for (const f of BALANCE_FIELDS) {
    const unit = f === 'shares_outstanding' ? 'shares' : 'USD';
    lines.push(`  ${f} (${unit})`);
  }
  lines.push('', 'CASH FLOW:');
  for (const f of CF_FIELDS) lines.push(`  ${f} (USD)`);
  return lines.join('\n');
}

async function phase2Classify(tagFreq, tagUnits, companiesScanned) {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.error('No API key found. Set ANTHROPIC_API_KEY, VITE_CLAUDE_KEY, or add to .env.local');
    process.exit(1);
  }

  const client = new Anthropic({ apiKey });

  // Filter to tags used by ≥2 companies (reduces noise from company-specific extensions)
  const candidateTags = Object.entries(tagFreq)
    .filter(([_, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([tag]) => tag);

  console.log(`\nPhase 2: Classifying ${candidateTags.length} orphan tags (≥2 companies) via Claude API...`);
  const fieldList = buildFieldList();

  const allClassifications = {};
  let batchNum = 0;

  for (let i = 0; i < candidateTags.length; i += BATCH_SIZE) {
    const batch = candidateTags.slice(i, i + BATCH_SIZE);
    batchNum++;
    console.log(`  Batch ${batchNum}: ${batch.length} tags (${i}-${i + batch.length})...`);

    const prompt = `You are an expert in SEC XBRL US-GAAP taxonomy mapping.

I have standardized financial fields. For each XBRL tag below, determine which field it maps to.

STANDARDIZED FIELDS:
${fieldList}

RULES:
- Only map tags that DIRECTLY represent the same financial concept as the field
- Fair value disclosures, per-segment breakdowns, supplemental disclosures → null
- Sub-components (e.g., domestic-only revenue when we need total) → null
- Tags representing different granularity of the same concept → map if it's the total
- For debts: map to appropriate category (short_term_debt, long_term_debt, current_portion_lt_debt)
- confidence: 1.0 = exact match, 0.9 = very likely, 0.8 = likely, <0.8 = uncertain
- negate: true only if XBRL sign convention is opposite our convention (e.g., expenses stored as positive when we expect negative)

TAGS TO CLASSIFY:
${batch.join('\n')}

Respond ONLY with a JSON array. Each element:
{"tag":"TagName","field":"field_name" or null,"section":"income"|"balance"|"cashFlow"|null,"unit":"USD"|"USD/shares"|"shares"|null,"confidence":0.0,"negate":false}`;

    try {
      const message = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 16384,
        messages: [{ role: 'user', content: prompt }],
      });

      const text = message.content?.[0]?.text || '';
      const jsonMatch = text.match(/\[[\s\S]*\]/);

      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        for (const cls of parsed) {
          if (!cls.tag) continue;
          if (cls.field && cls.confidence >= 0.5) {
            allClassifications[cls.tag] = {
              field: cls.field,
              section: cls.section || FIELD_SECTION_MAP[cls.field] || null,
              unit: cls.unit,
              confidence: cls.confidence,
              negate: cls.negate || false,
            };
          }
        }
        console.log(`    → ${parsed.filter(c => c.field).length} classified, ${parsed.filter(c => !c.field).length} null`);
      } else {
        console.warn(`    → Could not parse JSON from response`);
      }
    } catch (err) {
      console.error(`    → API error: ${err.message}`);
    }

    // Brief pause between API calls
    await sleep(1000);
  }

  // Write output
  const output = {
    meta: {
      version: 1,
      generatedAt: new Date().toISOString(),
      companiesScanned,
      uniqueOrphanTags: Object.keys(tagFreq).length,
      classifiedTags: Object.keys(allClassifications).length,
      candidateTags: candidateTags.length,
      minCompanyFrequency: 2,
    },
    classifications: allClassifications,
  };

  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`\nPhase 2 complete: ${Object.keys(allClassifications).length} tags classified`);
  console.log(`Output: ${OUTPUT_PATH}`);

  return allClassifications;
}

// ─── Main ────────────────────────────────────────────────────

async function main() {
  const startTime = Date.now();

  // Phase 1: Scan S&P 500 for orphan tags
  const { tagFreq, tagUnits, companiesScanned } = await phase1Scan();

  // Phase 2: Classify via Claude
  await phase2Classify(tagFreq, tagUnits, companiesScanned);

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  console.log(`\nTotal time: ${Math.floor(elapsed / 60)}m ${elapsed % 60}s`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
