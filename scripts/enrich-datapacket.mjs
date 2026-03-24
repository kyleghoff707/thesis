#!/usr/bin/env node
/**
 * Pitch Deck DataPacket Enrichment
 * Usage: node scripts/enrich-datapacket.mjs LULU
 *
 * Takes the base DataPacket from export-datapacket.mjs and adds:
 *   - Current price, P/E, market cap, dividend yield (Yahoo Finance)
 *   - Peer list with basic metrics (Thes1s taxonomy + EDGAR Frames)
 *   - Analyst estimates (Yahoo Finance)
 *   - Rule One Score (computed from growth + returns)
 *   - Guru ownership count (EDGAR 13F scan)
 *   - Recent insider transaction summary (EDGAR Form 4 index)
 *
 * Outputs enriched DataPacket ready for pitch deck generation.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import yahooFinance from 'yahoo-finance2';

const ticker = process.argv[2]?.toUpperCase();
if (!ticker) {
  console.error('Usage: node scripts/enrich-datapacket.mjs <TICKER>');
  process.exit(1);
}

const SEC_HEADERS = {
  'User-Agent': 'Thes1s Research App admin@thes1s.com',
  'Accept': 'application/json'
};

async function fetchJSON(url) {
  const res = await fetch(url, { headers: SEC_HEADERS });
  if (!res.ok) return null;
  return res.json();
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── 1. Load base DataPacket ─────────────────────────────────────────────────
const basePath = `scripts/datapackets/${ticker}-datapacket.json`;
if (!existsSync(basePath)) {
  console.error(`Base DataPacket not found at ${basePath}`);
  console.error(`Run first: node scripts/export-datapacket.mjs ${ticker}`);
  process.exit(1);
}
const dataPacket = JSON.parse(readFileSync(basePath, 'utf-8'));
console.log(`Enriching DataPacket for ${ticker}...`);

// ─── 2. Yahoo Finance: price, P/E, market cap, analyst estimates ─────────────
async function fetchYahooData(ticker) {
  console.log('  Fetching Yahoo Finance data...');
  try {
    // Suppress yahoo-finance2 internal logs
    const quote = await yahooFinance.quote(ticker);
    const estimates = {};

    // Try to get analyst data
    try {
      const analysis = await yahooFinance.quoteSummary(ticker, {
        modules: ['earningsTrend', 'financialData', 'defaultKeyStatistics', 'recommendationTrend']
      });

      if (analysis.financialData) {
        estimates.revenueGrowth = analysis.financialData.revenueGrowth?.fmt || null;
        estimates.earningsGrowth = analysis.financialData.earningsGrowth?.fmt || null;
        estimates.analystTargetPrice = analysis.financialData.targetMeanPrice || null;
        estimates.numberOfAnalysts = analysis.financialData.numberOfAnalystOpinions || null;
        estimates.recommendationMean = analysis.financialData.recommendationMean || null;
        estimates.recommendationKey = analysis.financialData.recommendationKey || null;
      }

      if (analysis.defaultKeyStatistics) {
        estimates.forwardPE = analysis.defaultKeyStatistics.forwardPE || null;
        estimates.pegRatio = analysis.defaultKeyStatistics.pegRatio || null;
        estimates.beta = analysis.defaultKeyStatistics.beta || null;
        estimates.fiveYearAvgDividendYield = analysis.defaultKeyStatistics.fiveYearAvgDividendYield || null;
      }

      if (analysis.earningsTrend?.trend) {
        const trends = analysis.earningsTrend.trend;
        estimates.earningsTrends = trends.map(t => ({
          period: t.period,
          growth: t.growth?.fmt || null,
          earningsEstimate: t.earningsEstimate?.avg?.fmt || null,
          revenueEstimate: t.revenueEstimate?.avg?.fmt || null,
        }));
      }
    } catch (e) {
      console.log('    Analyst data partially unavailable');
    }

    return {
      currentPrice: quote.regularMarketPrice,
      marketCap: quote.marketCap,
      marketCapFormatted: quote.marketCap ? `$${(quote.marketCap / 1e9).toFixed(1)}B` : null,
      peRatio: quote.trailingPE,
      forwardPE: quote.forwardPE,
      eps: quote.epsTrailingTwelveMonths,
      dividendYield: quote.dividendYield ? (quote.dividendYield * 100).toFixed(2) + '%' : '0%',
      annualDividend: quote.dividendRate || 0,
      fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: quote.fiftyTwoWeekLow,
      sharesOutstanding: quote.sharesOutstanding,
      exchange: quote.exchange,
      quoteType: quote.quoteType,
      industry: quote.industry || null,
      sector: quote.sector || null,
      analystEstimates: estimates,
    };
  } catch (e) {
    console.log(`    Yahoo Finance error: ${e.message}`);
    return null;
  }
}

// ─── 3. Peer Discovery (Thes1s taxonomy) ─────────────────────────────────────
function discoverPeers(ticker) {
  console.log('  Discovering peers from taxonomy...');
  try {
    const assignments = JSON.parse(readFileSync('industry-classification/thes1s-company-assignments.json', 'utf-8'));

    // Find this company's classification
    const target = assignments.find(a => a.ticker === ticker);
    if (!target) {
      console.log(`    ${ticker} not found in taxonomy assignments`);
      return { classification: null, peers: [] };
    }

    // Find peers in same industry
    const industryPeers = assignments
      .filter(a => a.industry === target.industry && a.ticker !== ticker)
      .map(a => ({ ticker: a.ticker, name: a.name, industry: a.industry, industryGroup: a.industryGroup, sector: a.sector }));

    // If too few, expand to industry group
    let groupPeers = [];
    if (industryPeers.length < 10) {
      groupPeers = assignments
        .filter(a => a.industryGroup === target.industryGroup && a.ticker !== ticker && !industryPeers.find(p => p.ticker === a.ticker))
        .map(a => ({ ticker: a.ticker, name: a.name, industry: a.industry, industryGroup: a.industryGroup, sector: a.sector }));
    }

    const allPeers = [...industryPeers, ...groupPeers].slice(0, 20);
    console.log(`    Found ${industryPeers.length} industry peers, ${groupPeers.length} group peers`);

    return {
      classification: {
        sector: target.sector,
        industryGroup: target.industryGroup,
        industry: target.industry,
      },
      industryPeerCount: industryPeers.length,
      peers: allPeers,
    };
  } catch (e) {
    console.log(`    Taxonomy error: ${e.message}`);
    return { classification: null, peers: [] };
  }
}

// ─── 4. Peer Metrics (EDGAR Frames API for top peers) ────────────────────────
async function fetchPeerMetrics(peers, year) {
  console.log(`  Fetching peer metrics from EDGAR Frames (CY${year})...`);
  const tags = [
    { tag: 'Revenues', field: 'revenue', period: 'duration' },
    { tag: 'NetIncomeLoss', field: 'netIncome', period: 'duration' },
    { tag: 'Assets', field: 'totalAssets', period: 'instant' },
    { tag: 'StockholdersEquity', field: 'equity', period: 'instant' },
    { tag: 'GrossProfit', field: 'grossProfit', period: 'duration' },
  ];

  // Get CIK mapping for peers
  const tickerData = await fetchJSON('https://www.sec.gov/files/company_tickers.json');
  if (!tickerData) return {};

  const tickerToCIK = {};
  for (const entry of Object.values(tickerData)) {
    tickerToCIK[entry.ticker?.toUpperCase()] = entry.cik_str;
  }

  const peerCIKs = {};
  for (const p of peers) {
    if (tickerToCIK[p.ticker]) peerCIKs[p.ticker] = tickerToCIK[p.ticker];
  }

  const metrics = {};
  for (const p of peers) {
    metrics[p.ticker] = { name: p.name, industry: p.industry };
  }

  for (const { tag, field, period } of tags) {
    const suffix = period === 'instant' ? `Q4I` : '';
    const url = `https://data.sec.gov/api/xbrl/frames/us-gaap/${tag}/USD/CY${year}${suffix}.json`;
    const data = await fetchJSON(url);
    await sleep(120); // SEC rate limit

    if (!data?.data) continue;

    for (const entry of data.data) {
      for (const [pticker, pcik] of Object.entries(peerCIKs)) {
        if (entry.cik === pcik) {
          if (!metrics[pticker]) metrics[pticker] = {};
          metrics[pticker][field] = Math.round(entry.val / 1e6);
        }
      }
    }
  }

  // Compute derived metrics for peers
  for (const [pticker, m] of Object.entries(metrics)) {
    if (m.revenue && m.grossProfit) m.grossMargin = (m.grossProfit / m.revenue * 100).toFixed(1) + '%';
    if (m.revenue && m.netIncome) m.netMargin = (m.netIncome / m.revenue * 100).toFixed(1) + '%';
    if (m.equity && m.netIncome && m.equity > 0) m.roe = (m.netIncome / m.equity * 100).toFixed(1) + '%';
  }

  // Filter out peers with no data
  const enriched = {};
  for (const [pticker, m] of Object.entries(metrics)) {
    if (m.revenue || m.netIncome) enriched[pticker] = m;
  }

  console.log(`    Got metrics for ${Object.keys(enriched).length} peers`);
  return enriched;
}

// ─── 5. Rule One Score (computed from DataPacket) ────────────────────────────
function computeRuleOneScore(dataPacket) {
  console.log('  Computing Rule One Score...');
  const gr = dataPacket.growthRates || {};

  // Moat score: average of available growth rate CAGRs at 10yr
  function scoreRate(rateStr) {
    if (!rateStr) return 0;
    const rate = parseFloat(rateStr);
    if (rate >= 10) return 2;   // Green
    if (rate >= 5) return 1;    // Yellow
    return 0;                    // Red
  }

  const moatInputs = [
    gr.revenue?.['10yr'],
    gr.netIncome?.['10yr'],
    gr.operatingCF?.['10yr'],
    gr.equity?.['10yr'],
  ];

  const moatPoints = moatInputs.reduce((sum, r) => sum + scoreRate(r), 0);
  const moatScore = Math.round(moatPoints / (moatInputs.length * 2) * 100);

  // Management score: ROE, ROIC, ROA averages + debt
  const latestYear = dataPacket.years?.[dataPacket.years.length - 1];
  const latest = dataPacket.yearlyFinancials?.[latestYear] || {};

  function scoreReturn(pctStr) {
    if (!pctStr) return 0;
    const val = parseFloat(pctStr);
    if (val >= 10) return 2;
    if (val >= 5) return 1;
    return 0;
  }

  const mgmtPoints = scoreReturn(latest.roe) + scoreReturn(latest.roic) + scoreReturn(latest.roa);
  // Debt score
  const debtScore = (dataPacket.debtAnalysis?.netDebtToEarnings === 'Net cash position' || parseFloat(dataPacket.debtAnalysis?.netDebtToEarnings) < 3) ? 2 : 0;
  const mgmtScore = Math.round((mgmtPoints + debtScore) / 8 * 100);

  const compositeScore = Math.round((moatScore + mgmtScore) / 2);

  return {
    moatScore,
    managementScore: mgmtScore,
    compositeScore,
    color: compositeScore >= 70 ? 'green' : compositeScore >= 50 ? 'yellow' : 'red',
    breakdown: {
      growthRates: moatInputs.map((r, i) => ({
        metric: ['revenue', 'netIncome', 'operatingCF', 'equity'][i],
        tenYrCAGR: r || 'N/A',
        score: scoreRate(r)
      })),
      returns: {
        roe: latest.roe || 'N/A',
        roic: latest.roic || 'N/A',
        roa: latest.roa || 'N/A',
      },
      debt: dataPacket.debtAnalysis?.netDebtToEarnings || 'N/A',
    }
  };
}

// ─── 6. Guru Ownership (simplified — scan 13F index) ─────────────────────────
async function fetchGuruCount(ticker, cik) {
  console.log('  Checking guru ownership...');
  // Simplified: check if major gurus have recent 13F filings mentioning this CIK
  // Full implementation would parse 13F XML — for prototype, we note it as needing web search
  return {
    note: 'Guru ownership requires 13F filing parsing (complex). For prototype: use web search "guru investors in ' + ticker + '" or check the Thes1s app Gurus tab.',
    suggestedSearch: `"${ticker}" site:sec.gov 13F-HR`,
  };
}

// ─── 7. Insider Activity (simplified — EDGAR filing index) ───────────────────
async function fetchInsiderSummary(cik) {
  console.log('  Checking insider activity...');
  try {
    const filings = await fetchJSON(`https://efts.sec.gov/LATEST/search-index?q=${cik}&forms=4&dateRange=custom&startdt=${new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}`);

    // Simpler approach: just get recent Form 4 count from EDGAR
    const url = `https://data.sec.gov/submissions/CIK${cik}.json`;
    const submissions = await fetchJSON(url);
    if (!submissions?.filings?.recent) return { note: 'Could not fetch insider data' };

    const recent = submissions.filings.recent;
    const form4s = [];
    for (let i = 0; i < recent.form.length && i < 200; i++) {
      if (recent.form[i] === '4') {
        const date = recent.filingDate[i];
        // Only last 12 months
        if (new Date(date) > new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)) {
          form4s.push({ date, description: recent.primaryDocDescription?.[i] || '' });
        }
      }
    }

    return {
      form4FilingsLast12Months: form4s.length,
      recentFilings: form4s.slice(0, 10),
      note: 'Form 4 filing count only. Full buy/sell/award breakdown requires XML parsing. Check the Thes1s app Insiders tab for details.',
    };
  } catch (e) {
    return { note: `Insider data error: ${e.message}` };
  }
}

// ─── 8. Company Description (from EDGAR submissions) ─────────────────────────
async function fetchCompanyDescription(cik) {
  console.log('  Fetching company info...');
  try {
    const url = `https://data.sec.gov/submissions/CIK${cik}.json`;
    const data = await fetchJSON(url);
    if (!data) return null;

    return {
      name: data.name,
      sic: data.sic,
      sicDescription: data.sicDescription,
      stateOfIncorporation: data.stateOfIncorporation,
      fiscalYearEnd: data.fiscalYearEnd,
      website: data.website || null,
      addresses: data.addresses?.business || null,
      category: data.category,
    };
  } catch (e) {
    return null;
  }
}

// ─── MAIN ────────────────────────────────────────────────────────────────────
async function main() {
  const [
    yahooData,
    companyInfo,
  ] = await Promise.all([
    fetchYahooData(ticker),
    fetchCompanyDescription(dataPacket.cik),
  ]);

  const peerData = discoverPeers(ticker);
  await sleep(200);

  const latestYear = dataPacket.years?.[dataPacket.years.length - 1] || new Date().getFullYear() - 1;
  const peerMetrics = peerData.peers.length > 0
    ? await fetchPeerMetrics(peerData.peers.slice(0, 15), latestYear)
    : {};

  const ruleOneScore = computeRuleOneScore(dataPacket);
  const guruInfo = await fetchGuruCount(ticker, dataPacket.cik);
  await sleep(200);
  const insiderInfo = await fetchInsiderSummary(dataPacket.cik);

  // Enrich the DataPacket
  const enriched = {
    ...dataPacket,
    note: 'ENRICHED DataPacket — includes price, peers, Rule One Score, analyst estimates. Ready for Pitch Deck generation.',
    exportDate: new Date().toISOString(),

    companyInfo: companyInfo || {},
    classification: peerData.classification,

    currentQuote: yahooData || {},
    analystEstimates: yahooData?.analystEstimates || {},

    ruleOneScore,

    peers: {
      classification: peerData.classification,
      industryPeerCount: peerData.industryPeerCount,
      peerList: peerData.peers,
      peerMetrics,
    },

    guruOwnership: guruInfo,
    insiderActivity: insiderInfo,

    // Updated missing data list
    missingData: [
      'Executive compensation breakdown (complex proxy parsing — check Thes1s app Compensation section or web search)',
      'Earnings call transcripts (use web search or Thes1s app Filings tab transcript buttons)',
      'Detailed insider buy/sell/award breakdown (check Thes1s app Insiders tab)',
      'Individual guru positions and changes (check Thes1s app Gurus tab)',
      'Historical P/E by year (not yet implemented in engines)',
    ],

    pitchDeckHints: {
      section1_radar: 'Search: "why did ' + ticker + ' stock drop recently" for event analysis. Check guru ownership above.',
      section2_simple: 'Use companyInfo.sicDescription + web search for business model clarity.',
      section3_dominance: 'Use peers.peerMetrics for competitive comparison. Search for market share data.',
      section4_moats: 'Search: "what moats does ' + ticker + ' have" + "competitive advantage ' + ticker + '"',
      section5_fcf: 'FCF data is in yearlyFinancials. FCF ratio in fcfAnalysis.',
      section6_management: 'Search: CEO name + biography. Check insiderActivity. Search Glassdoor ratings.',
      section7_returns: 'ROE/ROIC/ROA trends in yearlyFinancials. Compare to peers in peerMetrics.',
      section8_balance: 'Assets, liabilities, equity, current ratio all in yearlyFinancials.',
      section9_pest: 'Search: "PEST analysis ' + ticker + '" or "risks facing ' + ticker + ' industry"',
      section10_valuation: 'Growth rates in growthRates. Use FGR methodology from fgr.md reference.',
    },
  };

  // Remove the old missingData that's now populated
  delete enriched.missingData;
  enriched.remainingGaps = [
    'Executive compensation breakdown (complex proxy parsing)',
    'Full earnings call transcripts (use web search or paste excerpts)',
    'Detailed insider buy/sell breakdown (Form 4 XML parsing)',
    'Individual guru positions (13F XML parsing)',
  ];

  const outputPath = `scripts/datapackets/${ticker}-enriched-datapacket.json`;
  writeFileSync(outputPath, JSON.stringify(enriched, null, 2));

  console.log(`\nEnriched DataPacket exported to ${outputPath}`);
  console.log(`\n  Quote: $${yahooData?.currentPrice} | P/E: ${yahooData?.peRatio} | MCap: ${yahooData?.marketCapFormatted}`);
  console.log(`  Rule One Score: ${ruleOneScore.compositeScore} (${ruleOneScore.color})`);
  console.log(`  Peers found: ${Object.keys(peerMetrics).length} with financial data`);
  console.log(`  Insider Form 4s (12mo): ${insiderInfo.form4FilingsLast12Months || 'N/A'}`);
  console.log(`\n  Remaining gaps (need web search or Thes1s app):`);
  enriched.remainingGaps.forEach(g => console.log(`    - ${g}`));
  console.log(`\n  Pitch deck section hints included — see pitchDeckHints in the JSON.`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
