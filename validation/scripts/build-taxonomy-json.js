#!/usr/bin/env node
/**
 * build-taxonomy-json.js
 *
 * Downloads FASB US-GAAP taxonomy zips, parses calculation linkbase XMLs,
 * and generates taxonomy-hierarchy.json for Layer 2 XBRL tag resolution.
 *
 * Usage: node validation/scripts/build-taxonomy-json.js
 * Output: src/data/taxonomy-hierarchy.json
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DOMParser } from '@xmldom/xmldom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const OUTPUT_FILE = path.join(PROJECT_ROOT, 'src/data/taxonomy-hierarchy.json');
const CACHE_DIR = path.join(PROJECT_ROOT, 'validation/.taxonomy-cache');

const TAXONOMY_YEARS = [2023, 2024, 2025];
const BASE_URL = 'https://xbrl.fasb.org/us-gaap';

// All Layer 1 root tags from edgarFinancials.js INCOME/BALANCE/CASHFLOW_TAXONOMY.
// We walk descendants for each of these to find additional Layer 2 tags.
const LAYER1_ROOT_TAGS = [
  // ── Income Statement ──
  'RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues', 'SalesRevenueNet',
  'SalesRevenueGoodsNet', 'RevenueFromContractWithCustomerIncludingAssessedTax',
  'CostOfRevenue', 'CostOfGoodsAndServicesSold', 'CostOfGoodsSold',
  'GrossProfit',
  'SellingGeneralAndAdministrativeExpense',
  'SellingAndMarketingExpense',
  'GeneralAndAdministrativeExpense',
  'ResearchAndDevelopmentExpense', 'ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost',
  'DepreciationAndAmortization', 'DepreciationDepletionAndAmortization',
  'OtherOperatingIncomeExpenseNet', 'RestructuringCharges', 'GoodwillImpairmentLoss', 'AssetImpairmentCharges',
  'OperatingExpenses', 'CostsAndExpenses',
  'OperatingIncomeLoss', 'OperatingIncomeLossFromContinuingOperations',
  'InvestmentIncomeInterest', 'InterestIncomeOther', 'InterestAndDividendIncomeOperating', 'InvestmentIncomeInterestAndDividend',
  'InterestExpense', 'InterestExpenseDebt', 'InterestExpenseOperating',
  'InterestIncomeExpenseNet', 'InterestIncomeExpenseNonoperatingNet',
  'NonoperatingIncomeExpense', 'OtherNonoperatingIncomeExpense', 'IncomeLossFromEquityMethodInvestments', 'GainLossOnInvestments',
  'IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest',
  'IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments',
  'IncomeLossFromContinuingOperationsBeforeIncomeTaxesDomestic',
  'IncomeTaxExpenseBenefit',
  'IncomeLossFromContinuingOperations',
  'NetIncomeLoss', 'ProfitLoss', 'NetIncomeLossAvailableToCommonStockholdersBasic',
  'EarningsPerShareBasic', 'EarningsPerShareDiluted',
  'WeightedAverageNumberOfSharesOutstandingBasic', 'WeightedAverageNumberOfShareOutstandingBasicAndDiluted',
  'WeightedAverageNumberOfDilutedSharesOutstanding',
  'CommonStockDividendsPerShareDeclared', 'CommonStockDividendsPerShareCashPaid',

  // ── Balance Sheet ──
  'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents', 'CashAndCashEquivalentsAtCarryingValue',
  'ShortTermInvestments',
  'AccountsReceivableNetCurrent',
  'OtherReceivablesNetCurrent', 'NontradeReceivablesCurrent',
  'InventoryNet',
  'PrepaidExpenseAndOtherAssetsCurrent', 'PrepaidExpenseCurrent',
  'OtherAssetsCurrent',
  'AssetsCurrent',
  'PropertyPlantAndEquipmentNet', 'PropertyPlantAndEquipmentGross',
  'AccumulatedDepreciationDepletionAndAmortizationPropertyPlantAndEquipment',
  'LandAndLandImprovements', 'BuildingsAndImprovementsGross', 'MachineryAndEquipmentGross',
  'ConstructionInProgressGross', 'FurnitureAndFixturesGross', 'LeaseholdImprovementsGross',
  'OperatingLeaseRightOfUseAsset',
  'Goodwill',
  'IntangibleAssetsNetExcludingGoodwill',
  'LongTermInvestments',
  'DeferredIncomeTaxAssetsNet',
  'OtherAssetsNoncurrent',
  'Assets',
  'AccountsPayableCurrent',
  'AccruedLiabilitiesCurrent', 'EmployeeRelatedLiabilitiesCurrent',
  'ShortTermBorrowings', 'LineOfCredit', 'ShortTermBankLoansAndNotesPayable',
  'LongTermDebtCurrent', 'LongTermDebtAndCapitalLeaseObligationsCurrent', 'OtherLongTermDebtCurrent',
  'OperatingLeaseLiabilityCurrent',
  'FinanceLeaseLiabilityCurrent',
  'ContractWithCustomerLiabilityCurrent', 'DeferredRevenueCurrent',
  'LiabilitiesCurrent',
  'LongTermDebtNoncurrent', 'LongTermDebt',
  'OperatingLeaseLiabilityNoncurrent',
  'FinanceLeaseLiabilityNoncurrent',
  'ContractWithCustomerLiabilityNoncurrent', 'DeferredRevenueNoncurrent',
  'DeferredIncomeTaxLiabilitiesNet',
  'PensionAndOtherPostretirementDefinedBenefitPlansLiabilitiesNoncurrent',
  'OtherLiabilitiesNoncurrent',
  'LiabilitiesNoncurrent',
  'Liabilities',
  'LiabilitiesAndStockholdersEquity',
  'CommonStockValue',
  'AdditionalPaidInCapital', 'AdditionalPaidInCapitalCommonStock',
  'RetainedEarningsAccumulatedDeficit',
  'AccumulatedOtherComprehensiveIncomeLossNetOfTax',
  'TreasuryStockValue',
  'StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest',
  'MinorityInterest',
  'PreferredStockValue',
  'CommonStockSharesOutstanding', 'EntityCommonStockSharesOutstanding',
  'TreasuryStockCommonShares',

  // ── Cash Flow ──
  'NetCashProvidedByUsedInOperatingActivities',
  'DepreciationAmortizationAndAccretionNet',
  'ShareBasedCompensation',
  'DeferredIncomeTaxExpenseBenefit',
  'IncreaseDecreaseInAccountsReceivable',
  'IncreaseDecreaseInInventories',
  'IncreaseDecreaseInAccountsPayable',
  'IncreaseDecreaseInOtherOperatingCapital', 'IncreaseDecreaseInOtherOperatingLiabilities',
  'OtherNoncashIncomeExpense',
  'OtherOperatingActivitiesCashFlowStatement',
  'PaymentsToAcquirePropertyPlantAndEquipment',
  'ProceedsFromSaleOfPropertyPlantAndEquipment',
  'PaymentsToAcquireInvestments',
  'ProceedsFromSaleAndMaturityOfInvestments', 'ProceedsFromSaleOfInvestments',
  'PaymentsToAcquireBusinessesNetOfCashAcquired', 'PaymentsToAcquireBusinessesAndInterestInAffiliates',
  'ProceedsFromDivestitureOfBusinesses', 'ProceedsFromDivestitureOfBusinessesNetOfCashDivested',
  'PaymentsToAcquireIntangibleAssets',
  'PaymentsToAcquireOtherInvestments',
  'NetCashProvidedByUsedInInvestingActivities',
  'ProceedsFromIssuanceOfLongTermDebt',
  'RepaymentsOfLongTermDebt',
  'ProceedsFromShortTermDebt', 'ProceedsFromRepaymentsOfShortTermDebt',
  'RepaymentsOfShortTermDebt',
  'PaymentsForRepurchaseOfCommonStock',
  'ProceedsFromStockPlans', 'ProceedsFromIssuanceOfCommonStock',
  'PaymentsOfDividendsCommonStock', 'PaymentsOfDividends',
  'PaymentsOfFinancingCosts',
  'RepaymentsOfLongTermCapitalLeaseObligations', 'FinanceLeasePrincipalPayments',
  'OtherFinancingActivitiesPaymentRelated',
  'NetCashProvidedByUsedInFinancingActivities',
  'EffectOfExchangeRateOnCashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents',
  'InterestPaidNet', 'InterestPaid',
  'IncomeTaxesPaid', 'IncomeTaxesPaidNet',
  'Depreciation',
  'AmortizationOfIntangibleAssets',
  'OtherDepreciationAndAmortization',

  // ── Industry-specific debt tags ──
  'DebtInstrumentCarryingAmount',
  'NotesPayable',
  'SecuredDebt', 'SecuredDebtCurrent',
  'ConvertibleDebt', 'ConvertibleNotesPayable',
  'FinancialServicesReceivablesNetOfFeeIncome',
  'FederalHomeLoanBankAdvancesLongTerm',
  'FederalFundsPurchasedAndSecuritiesSoldUnderAgreementsToRepurchase',
  'SecuritiesSoldUnderAgreementsToRepurchase',
  'SubordinatedLongTermDebt',
  'JuniorSubordinatedNotes',
  'CommercialPaper',
  'OtherBorrowings',
];

// ─── Download & Extract ────────────────────────────────────────

function downloadTaxonomy(year) {
  const extractDir = path.join(CACHE_DIR, `us-gaap-${year}`);

  if (fs.existsSync(extractDir)) {
    console.log(`  Using cached taxonomy ${year}`);
    return extractDir;
  }

  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const zipFile = path.join(CACHE_DIR, `us-gaap-${year}.zip`);

  console.log(`  Downloading US-GAAP ${year} taxonomy...`);
  execSync(`curl -sL "${BASE_URL}/${year}/us-gaap-${year}.zip" -o "${zipFile}"`, { timeout: 120000 });

  console.log(`  Extracting calculation linkbase files...`);
  execSync(`unzip -o "${zipFile}" "us-gaap-${year}/stm/*-cal-*" "us-gaap-${year}/dis/*-cal-*" -d "${CACHE_DIR}" 2>/dev/null || true`, { timeout: 30000 });

  // Clean up zip to save space
  try { fs.unlinkSync(zipFile); } catch {}

  return extractDir;
}

// ─── XML Parsing ────────────────────────────────────────────────

function parseCalcLinkbase(xmlContent) {
  const arcs = [];
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlContent, 'text/xml');

  // Build label → concept name mapping from loc elements
  const labelMap = {};
  const locs = doc.getElementsByTagName('link:loc');
  for (let i = 0; i < locs.length; i++) {
    const loc = locs.item(i);
    const label = loc.getAttribute('xlink:label');
    const href = loc.getAttribute('xlink:href');
    if (label && href) {
      // Extract concept name: "../elts/us-gaap-2024.xsd#us-gaap_Revenues" → "Revenues"
      const match = href.match(/#(?:us-gaap_)?(.+)$/);
      if (match) labelMap[label] = match[1];
    }
  }

  // Parse calculation arcs (summation-item relationships)
  const calcArcs = doc.getElementsByTagName('link:calculationArc');
  for (let i = 0; i < calcArcs.length; i++) {
    const arc = calcArcs.item(i);
    const fromLabel = arc.getAttribute('xlink:from');
    const toLabel = arc.getAttribute('xlink:to');
    const weight = parseFloat(arc.getAttribute('weight') || '1');

    const parent = labelMap[fromLabel];
    const child = labelMap[toLabel];

    if (parent && child) {
      arcs.push({ parent, child, weight });
    }
  }

  return arcs;
}

// ─── Graph Building ─────────────────────────────────────────────

function buildGraph(allArcs) {
  const graph = {}; // parent → [{ child, weight }]
  for (const { parent, child, weight } of allArcs) {
    if (!graph[parent]) graph[parent] = [];
    // Deduplicate same parent-child pair from multiple files/years
    if (!graph[parent].some(e => e.child === child)) {
      graph[parent].push({ child, weight });
    }
  }
  return graph;
}

function findDescendants(concept, graph, maxDepth = 2) {
  const descendants = [];
  const visited = new Set([concept]);
  const queue = [{ tag: concept, depth: 0, pathWeight: 1 }];

  while (queue.length > 0) {
    const { tag, depth, pathWeight } = queue.shift();

    if (depth > 0) {
      descendants.push({ tag, weight: pathWeight, depth });
    }

    if (depth >= maxDepth) continue;

    const children = graph[tag];
    if (!children) continue;

    for (const { child, weight } of children) {
      if (!visited.has(child)) {
        visited.add(child);
        queue.push({ tag: child, depth: depth + 1, pathWeight: pathWeight * weight });
      }
    }
  }

  // Sort by depth (shallowest first), then alphabetically
  descendants.sort((a, b) => a.depth - b.depth || a.tag.localeCompare(b.tag));
  return descendants;
}

// ─── Main ───────────────────────────────────────────────────────

async function main() {
  console.log('Building taxonomy hierarchy JSON...\n');

  const allArcs = [];

  for (const year of TAXONOMY_YEARS) {
    console.log(`Processing ${year} taxonomy:`);
    try {
      const extractDir = downloadTaxonomy(year);

      // Find all calculation linkbase files
      const calFiles = [];
      for (const subdir of ['stm', 'dis']) {
        const dir = path.join(extractDir, subdir);
        if (fs.existsSync(dir)) {
          const files = fs.readdirSync(dir).filter(f => f.includes('-cal-') && f.endsWith('.xml'));
          calFiles.push(...files.map(f => path.join(dir, f)));
        }
      }

      console.log(`  Found ${calFiles.length} calculation linkbase files`);

      for (const file of calFiles) {
        const xml = fs.readFileSync(file, 'utf-8');
        const arcs = parseCalcLinkbase(xml);
        allArcs.push(...arcs);
      }
    } catch (err) {
      console.warn(`  Warning: Failed to process ${year} taxonomy: ${err.message}`);
    }
  }

  console.log(`\nTotal arcs parsed: ${allArcs.length}`);

  // Build parent → children graph (merged across all taxonomy versions)
  const graph = buildGraph(allArcs);
  console.log(`Unique parent concepts: ${Object.keys(graph).length}`);

  // For each Layer 1 tag, find all descendants in the calculation tree
  const hierarchy = {};
  const layer1Set = new Set(LAYER1_ROOT_TAGS);
  let totalAdditional = 0;

  for (const tag of LAYER1_ROOT_TAGS) {
    if (!graph[tag]) continue;

    const descendants = findDescendants(tag, graph);
    if (descendants.length === 0) continue;

    // Only include descendants NOT already in Layer 1, with positive weight
    const additional = descendants.filter(d =>
      !layer1Set.has(d.tag) && d.weight > 0
    );

    if (additional.length > 0) {
      // Compact format: just tag names (all weights are 1.0 since we filter positive only)
      hierarchy[tag] = additional.map(d => d.tag);
      totalAdditional += additional.length;
    }
  }

  // Build output
  const output = {
    _meta: {
      generatedAt: new Date().toISOString(),
      taxonomyVersions: TAXONOMY_YEARS,
      layer1TagCount: LAYER1_ROOT_TAGS.length,
      parentConceptsWithDescendants: Object.keys(hierarchy).length,
      totalAdditionalTags: totalAdditional,
    },
    hierarchy,
  };

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  // Minified JSON to keep file small (~80KB vs ~224KB pretty-printed)
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output));

  const fileSizeKB = (fs.statSync(OUTPUT_FILE).size / 1024).toFixed(1);
  console.log(`\nOutput: ${OUTPUT_FILE} (${fileSizeKB} KB)`);
  console.log(`  ${Object.keys(hierarchy).length} Layer 1 concepts with additional descendants`);
  console.log(`  ${totalAdditional} total additional tags for Layer 2 resolution`);
  console.log('\nDone!');
}

main().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
