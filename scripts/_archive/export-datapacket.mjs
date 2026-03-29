#!/usr/bin/env node
/**
 * Prototype DataPacket Exporter
 * Usage: node scripts/export-datapacket.mjs LULU
 *
 * Fetches financial data directly from EDGAR APIs (same as the app's engines)
 * and outputs a DataPacket JSON for use in AI prototype testing.
 *
 * This is a PROTOTYPE — not the full adapter layer. Just enough to validate
 * the AI agent concept before building the real infrastructure.
 */

const ticker = process.argv[2]?.toUpperCase();
if (!ticker) {
  console.error('Usage: node scripts/export-datapacket.mjs <TICKER>');
  process.exit(1);
}

const SEC_HEADERS = {
  'User-Agent': 'Thes1s Research App admin@thes1s.com',
  'Accept': 'application/json'
};

async function fetchJSON(url) {
  const res = await fetch(url, { headers: SEC_HEADERS });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${url}`);
  return res.json();
}

async function lookupCIK(ticker) {
  const data = await fetchJSON('https://efts.sec.gov/LATEST/search-index?q=' + ticker + '&dateRange=custom&startdt=2020-01-01&forms=10-K');
  // Fallback: use the company tickers JSON
  const tickers = await fetchJSON('https://www.sec.gov/files/company_tickers.json');
  for (const entry of Object.values(tickers)) {
    if (entry.ticker?.toUpperCase() === ticker) {
      return String(entry.cik_str).padStart(10, '0');
    }
  }
  throw new Error(`CIK not found for ${ticker}`);
}

async function fetchCompanyFacts(cik) {
  return fetchJSON(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`);
}

function extractField(facts, tags, years) {
  const usGaap = facts?.['us-gaap'] || {};
  for (const tag of tags) {
    const concept = usGaap[tag];
    if (!concept?.units) continue;
    const units = concept.units['USD'] || concept.units['USD/shares'] || concept.units['shares'] || Object.values(concept.units)[0];
    if (!units) continue;

    const result = {};
    for (const entry of units) {
      if (!entry.form?.startsWith('10-K') && !entry.form?.startsWith('10-KT')) continue;
      const fy = entry.fy;
      if (!fy || !years.includes(fy)) continue;
      // Prefer annual (fp=FY) over quarterly
      if (entry.fp === 'FY' || !result[fy]) {
        result[fy] = entry.val;
      }
    }
    if (Object.keys(result).length > 0) return result;
  }
  return {};
}

function computeCAGR(startVal, endVal, years) {
  if (!startVal || !endVal || startVal <= 0 || endVal <= 0 || years <= 0) return null;
  return Math.pow(endVal / startVal, 1 / years) - 1;
}

async function main() {
  console.log(`Fetching data for ${ticker}...`);

  // 1. Look up CIK
  const cik = await lookupCIK(ticker);
  console.log(`  CIK: ${cik}`);

  // 2. Fetch company facts (all XBRL data)
  const facts = await fetchCompanyFacts(cik);
  const entityName = facts.entityName;
  const sicCode = facts.facts?.dei?.EntityCommonStockSharesOutstanding ? null : null; // SIC not in companyfacts
  console.log(`  Company: ${entityName}`);

  // 3. Extract key financial fields
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 12 }, (_, i) => currentYear - 1 - i); // last 12 fiscal years

  const revenue = extractField(facts.facts, ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'SalesRevenueNet', 'RevenueFromContractWithCustomerIncludingAssessedTax'], years);
  const netIncome = extractField(facts.facts, ['NetIncomeLoss', 'ProfitLoss'], years);
  const totalAssets = extractField(facts.facts, ['Assets'], years);
  const totalLiabilities = extractField(facts.facts, ['Liabilities', 'LiabilitiesAndStockholdersEquity'], years);
  const equity = extractField(facts.facts, ['StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'], years);
  const longTermDebt = extractField(facts.facts, ['LongTermDebt', 'LongTermDebtNoncurrent', 'LongTermDebtAndCapitalLeaseObligations'], years);
  const cash = extractField(facts.facts, ['CashAndCashEquivalentsAtCarryingValue', 'CashCashEquivalentsAndShortTermInvestments'], years);
  const operatingCF = extractField(facts.facts, ['NetCashProvidedByUsedInOperatingActivities', 'NetCashProvidedByOperatingActivities'], years);
  const capex = extractField(facts.facts, ['PaymentsToAcquirePropertyPlantAndEquipment', 'CapitalExpenditureDiscontinuedOperations'], years);
  const sharesOut = extractField(facts.facts, ['CommonStockSharesOutstanding', 'WeightedAverageNumberOfSharesOutstandingBasic', 'EntityCommonStockSharesOutstanding'], years);
  const eps = extractField(facts.facts, ['EarningsPerShareBasic', 'EarningsPerShareDiluted'], years);
  const dividendsPerShare = extractField(facts.facts, ['CommonStockDividendsPerShareDeclared', 'CommonStockDividendsPerShareCashPaid'], years);
  const grossProfit = extractField(facts.facts, ['GrossProfit'], years);
  const operatingIncome = extractField(facts.facts, ['OperatingIncomeLoss'], years);
  const sga = extractField(facts.facts, ['SellingGeneralAndAdministrativeExpense'], years);
  const rd = extractField(facts.facts, ['ResearchAndDevelopmentExpense'], years);
  const costOfRevenue = extractField(facts.facts, ['CostOfGoodsAndServicesSold', 'CostOfRevenue', 'CostOfGoodsSold'], years);
  const currentAssets = extractField(facts.facts, ['AssetsCurrent'], years);
  const currentLiabilities = extractField(facts.facts, ['LiabilitiesCurrent'], years);
  const taxProvision = extractField(facts.facts, ['IncomeTaxExpenseBenefit'], years);
  const shareRepurchases = extractField(facts.facts, ['PaymentsForRepurchaseOfCommonStock'], years);
  const dividendsPaid = extractField(facts.facts, ['PaymentsOfDividends', 'PaymentsOfDividendsCommonStock'], years);

  // 4. Compute derived metrics
  const sortedYears = Object.keys(revenue).map(Number).sort((a, b) => a - b);

  const computedMetrics = {};
  for (const yr of sortedYears) {
    const rev = revenue[yr];
    const ni = netIncome[yr];
    const eq = equity[yr];
    const ta = totalAssets[yr];
    const ltd = longTermDebt[yr] || 0;
    const ocf = operatingCF[yr];
    const cx = capex[yr] || 0;
    const gp = grossProfit[yr];
    const oi = operatingIncome[yr];

    computedMetrics[yr] = {
      revenue: rev ? Math.round(rev / 1e6) : null,
      netIncome: ni ? Math.round(ni / 1e6) : null,
      grossProfit: gp ? Math.round(gp / 1e6) : null,
      operatingIncome: oi ? Math.round(oi / 1e6) : null,
      totalAssets: ta ? Math.round(ta / 1e6) : null,
      equity: eq ? Math.round(eq / 1e6) : null,
      longTermDebt: ltd ? Math.round(ltd / 1e6) : null,
      cash: cash[yr] ? Math.round(cash[yr] / 1e6) : null,
      operatingCF: ocf ? Math.round(ocf / 1e6) : null,
      capex: cx ? Math.round(Math.abs(cx) / 1e6) : null,
      fcf: ocf && cx ? Math.round((ocf - Math.abs(cx)) / 1e6) : null,
      eps: eps[yr] || null,
      sharesOutstanding: sharesOut[yr] ? Math.round(sharesOut[yr] / 1e6) : null,
      taxProvision: taxProvision[yr] ? Math.round(taxProvision[yr] / 1e6) : null,
      grossMargin: rev && gp ? (gp / rev * 100).toFixed(1) + '%' : null,
      operatingMargin: rev && oi ? (oi / rev * 100).toFixed(1) + '%' : null,
      netMargin: rev && ni ? (ni / rev * 100).toFixed(1) + '%' : null,
      roe: ni && eq && eq > 0 ? (ni / eq * 100).toFixed(1) + '%' : null,
      roic: ni && eq && ltd !== undefined ? (ni / (eq + (ltd || 0)) * 100).toFixed(1) + '%' : null,
      roa: ni && ta ? (ni / ta * 100).toFixed(1) + '%' : null,
      currentRatio: currentAssets[yr] && currentLiabilities[yr] ? (currentAssets[yr] / currentLiabilities[yr]).toFixed(2) : null,
      fcfRatio: ni && ocf && cx ? ((ocf - Math.abs(cx)) / ni).toFixed(2) : null,
      capexToOCF: ocf && cx ? (Math.abs(cx) / ocf * 100).toFixed(1) + '%' : null,
      netDebt: (ltd || 0) - (cash[yr] || 0) > 0 ? Math.round(((ltd || 0) - (cash[yr] || 0)) / 1e6) : 0,
      bvps: eq && sharesOut[yr] ? (eq / sharesOut[yr]).toFixed(2) : null,
    };
  }

  // 5. Compute growth rates
  const latestYear = sortedYears[sortedYears.length - 1];
  const growthRates = {};
  for (const [metric, fieldMap] of [
    ['revenue', revenue],
    ['netIncome', netIncome],
    ['operatingCF', operatingCF],
    ['equity', equity],
  ]) {
    const vals = sortedYears.map(y => ({ year: y, value: fieldMap[y] })).filter(v => v.value);
    if (vals.length >= 2) {
      const latest = vals[vals.length - 1];
      growthRates[metric] = {};
      for (const span of [10, 7, 5, 3, 1]) {
        const startIdx = vals.length - 1 - span;
        if (startIdx >= 0) {
          const rate = computeCAGR(vals[startIdx].value, latest.value, span);
          if (rate !== null) growthRates[metric][`${span}yr`] = (rate * 100).toFixed(1) + '%';
        }
      }
    }
  }

  // 6. Build DataPacket
  const dataPacket = {
    ticker,
    entityName,
    cik,
    exportDate: new Date().toISOString(),
    note: 'PROTOTYPE DataPacket — extracted directly from EDGAR companyfacts API. Not all fields available (no price, guru, insider, peer, transcript data). Use for AI generation testing.',

    yearlyFinancials: computedMetrics,
    years: sortedYears,

    growthRates,

    latestMetrics: computedMetrics[latestYear] || {},

    // Debt analysis
    debtAnalysis: {
      latestLTDebt: computedMetrics[latestYear]?.longTermDebt,
      latestNetDebt: computedMetrics[latestYear]?.netDebt,
      latestNetIncome: computedMetrics[latestYear]?.netIncome,
      netDebtToEarnings: computedMetrics[latestYear]?.netDebt && computedMetrics[latestYear]?.netIncome
        ? (computedMetrics[latestYear].netDebt / computedMetrics[latestYear].netIncome).toFixed(1)
        : 'Net cash position',
    },

    // FCF analysis
    fcfAnalysis: {
      latestFCF: computedMetrics[latestYear]?.fcf,
      latestFCFRatio: computedMetrics[latestYear]?.fcfRatio,
      avgCapexToOCF: (() => {
        const vals = sortedYears.map(y => computedMetrics[y]?.capexToOCF).filter(Boolean).map(v => parseFloat(v));
        return vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) + '%' : null;
      })(),
    },

    // What's NOT in this prototype DataPacket (would come from other engines):
    missingData: [
      'Current stock price (would come from prices.js / Yahoo Finance)',
      'P/E ratio, market cap (would come from batchQuotes.js)',
      'Guru holdings — who owns it (would come from gurus.js)',
      'Insider transactions (would come from insiders.js)',
      'Executive compensation (would come from compensation.js)',
      'Peer comparison metrics (would come from peerMetrics.js)',
      'Analyst estimates (would come from analystEstimates.js)',
      'Upcoming events (would come from companyEvents.js)',
      'Earnings call transcripts (would come from transcripts.js)',
      'Rule One Score (would come from ruleOneScore.js)',
    ]
  };

  // 7. Output
  const outputPath = `scripts/datapackets/${ticker}-datapacket.json`;
  const { mkdirSync, writeFileSync } = await import('fs');
  mkdirSync('scripts/datapackets', { recursive: true });
  writeFileSync(outputPath, JSON.stringify(dataPacket, null, 2));

  console.log(`\nDataPacket exported to ${outputPath}`);
  console.log(`Years: ${sortedYears.join(', ')}`);
  console.log(`Fields per year: ${Object.keys(computedMetrics[latestYear] || {}).length}`);
  console.log(`Growth rates computed: ${Object.keys(growthRates).join(', ')}`);
  console.log(`\nMissing data (not in EDGAR companyfacts):`);
  dataPacket.missingData.forEach(m => console.log(`  - ${m}`));
  console.log(`\nTo use: paste the JSON into Claude with the One Pager template.`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
