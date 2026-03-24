// DataPacket assembly — aggregates ALL engine output into canonical JSON
// This is the Data Assembler: calls 20+ engines, returns a DataPacket
// for agent consumption. Pure orchestration, no AI.
//
// Each engine call is wrapped in try/catch — partial data is better than no data.
// Failed engines set their field to null and log to the errors array.

import { fetchEdgarStatements } from './edgarFinancials.js';
import { fetchCompanyInfo } from './edgar.js';
import { classifyIndustryType } from './industryClassifier.js';
import { computeAllGrowthRates } from './growthRates.js';
import { computeReturnMetrics, computeDebtMetrics } from './returnMetrics.js';
import { computeFreeCashFlow } from './freeCashFlow.js';
import { computeKeyMetrics } from './keyMetrics.js';
import { computeMoatScore, computeManagementScore, computeRuleOneScore } from './ruleOneScore.js';
import { findGurusOwning, loadCachedPortfolios } from './gurus.js';
import { fetchInsiderTransactions, computeInsiderSummary } from './insiders.js';
import { fetchCompensation } from './compensation.js';
import { fetchPeersByTier } from './peers.js';
import { fetchPeerFrameData, computePeerMetrics, computePeerScores } from './peerMetrics.js';
import { fetchAnalystEstimates } from './analystEstimates.js';
import { fetchCompanyEvents } from './companyEvents.js';
import { fetchPrices, latestPrice } from './prices.js';
import { fetchBatchQuotes } from './batchQuotes.js';
import { fetchTranscriptList } from './transcripts.js';

// ─── DataPacket Assembly ────────────────────────────────────────

/**
 * Assemble a complete DataPacket for a given ticker.
 * Calls all engines in a staged pipeline:
 *   1. Core financial data (sequential — others depend on this)
 *   2. Computed metrics (parallel — depend only on financials)
 *   3. External data (parallel — independent of each other)
 *   4. Dependent data (depends on previous steps)
 *   5. Composite scores (depends on growth + returns)
 *
 * @param {string} ticker — Stock ticker symbol
 * @returns {Promise<object>} DataPacket object
 */
export async function assembleDataPacket(ticker) {
  const errors = [];

  // ── Step 1: Core financial data (sequential — others depend on this) ──

  let statements = null;
  let companyInfo = null;

  try {
    statements = await fetchEdgarStatements(ticker);
  } catch (err) {
    errors.push(`edgarFinancials: ${err.message}`);
  }

  try {
    companyInfo = await fetchCompanyInfo(ticker);
  } catch (err) {
    errors.push(`companyInfo: ${err.message}`);
  }

  // Classification from EDGAR SIC code
  const sicCode = companyInfo?.sic || statements?.industryType || '';
  const classification = {
    industryType: statements?.industryType || classifyIndustryType(sicCode),
    sicCode: companyInfo?.sic || '',
    sicDescription: companyInfo?.sicDescription || '',
  };

  // ── Step 2: Computed metrics (parallel — depend only on financials) ──

  let growthRates = null;
  let returnMetrics = null;
  let debtMetrics = null;
  let fcf = null;
  let keyMetrics = null;

  if (statements) {
    const step2 = await Promise.allSettled([
      safeCall(() => computeAllGrowthRates(statements), 'growthRates', errors),
      safeCall(() => computeReturnMetrics(statements), 'returnMetrics', errors),
      safeCall(() => computeDebtMetrics(statements), 'debtMetrics', errors),
      safeCall(() => computeFreeCashFlow(statements), 'freeCashFlow', errors),
      safeCall(() => computeKeyMetrics(statements), 'keyMetrics', errors),
    ]);

    growthRates = step2[0].value ?? null;
    returnMetrics = step2[1].value ?? null;
    debtMetrics = step2[2].value ?? null;
    fcf = step2[3].value ?? null;
    keyMetrics = step2[4].value ?? null;
  }

  // ── Step 3: External data (parallel — independent of each other) ──

  const step3 = await Promise.allSettled([
    safeCall(() => fetchGurusForTicker(ticker), 'gurus', errors),
    safeCall(() => fetchInsidersForTicker(ticker), 'insiders', errors),
    safeCall(() => fetchCompensation(ticker), 'compensation', errors),
    safeCall(() => fetchPeersByTier('industry', classification), 'peers', errors),
    safeCall(() => fetchAnalystEstimates(ticker), 'analystEstimates', errors),
    safeCall(() => fetchCompanyEvents(ticker), 'events', errors),
    safeCall(() => fetchPrices(ticker, '10y'), 'prices', errors),
    safeCall(() => fetchTranscriptList(ticker), 'transcripts', errors),
  ]);

  const gurus = step3[0].value ?? null;
  const insiders = step3[1].value ?? null;
  const compensation = step3[2].value ?? null;
  const peers = step3[3].value ?? null;
  const analystEstimates = step3[4].value ?? null;
  const events = step3[5].value ?? null;
  const prices = step3[6].value ?? null;
  const transcriptList = step3[7].value ?? null;

  // ── Step 4: Dependent data (depends on previous steps) ──

  let peerMetrics = null;
  let peerQuotes = null;

  if (peers && peers.length > 0) {
    const peerCIKs = new Set(peers.map(p => Number(p.cik)));
    const latestYear = statements?.years?.[0] || new Date().getFullYear();

    try {
      peerMetrics = await computePeerScores(peerCIKs, latestYear);
    } catch (err) {
      errors.push(`peerMetrics: ${err.message}`);
    }

    const peerTickers = peers.map(p => p.ticker).filter(Boolean);
    if (peerTickers.length > 0) {
      try {
        peerQuotes = await fetchBatchQuotes(peerTickers);
      } catch (err) {
        errors.push(`batchQuotes: ${err.message}`);
      }
    }
  }

  // ── Step 5: Composite scores (depends on growth + returns) ──

  let moatScore = null;
  let managementScore = null;
  let ruleOneScoreResult = null;

  try {
    if (growthRates) {
      moatScore = computeMoatScore(growthRates);
    }
  } catch (err) {
    errors.push(`moatScore: ${err.message}`);
  }

  try {
    if (returnMetrics && debtMetrics) {
      managementScore = computeManagementScore(returnMetrics.averages, debtMetrics);
    }
  } catch (err) {
    errors.push(`managementScore: ${err.message}`);
  }

  try {
    if (moatScore && managementScore) {
      ruleOneScoreResult = computeRuleOneScore(moatScore.moatScore, managementScore.managementScore);
    }
  } catch (err) {
    errors.push(`ruleOneScore: ${err.message}`);
  }

  // ── Derive debt metrics from financials ──

  const derivedDebtMetrics = deriveDebtMetrics(statements, fcf);

  // ── Derive current price ──

  const currentPrice = prices ? latestPrice(prices) : null;

  // ── Build transcript availability summary ──

  const transcriptAvailability = transcriptList
    ? { count: transcriptList.length, latestQuarter: transcriptList[0]?.title || null }
    : null;

  // ── Assemble DataPacket ──

  return {
    ticker: ticker.toUpperCase(),
    companyInfo,
    classification,
    currentPrice,
    financials: statements ? { years: statements.years, income: statements.income, balance: statements.balance, cashFlow: statements.cashFlow } : null,
    ttm: statements?.ttm || null,
    growthRates,
    returnMetrics: returnMetrics || null,
    debtMetrics: derivedDebtMetrics || debtMetrics || null,
    fcf,
    keyMetrics,
    ruleOneScore: {
      moat: moatScore?.moatScore ?? null,
      management: managementScore?.managementScore ?? null,
      composite: ruleOneScoreResult ?? null,
    },
    gurus,
    insiders,
    compensation,
    peers,
    peerMetrics: peerMetrics || null,
    analystEstimates,
    events,
    prices: prices ? { data: prices, currentPrice } : null,
    transcriptAvailability,
    caveats: buildCaveats(classification),
    errors: errors.length > 0 ? errors : undefined,
    assembledAt: new Date().toISOString(),
  };
}

// ─── Helper: Safe engine call ───────────────────────────────────

async function safeCall(fn, label, errors) {
  try {
    return await fn();
  } catch (err) {
    errors.push(`${label}: ${err.message}`);
    return null;
  }
}

// ─── Helper: Fetch gurus holding a ticker ───────────────────────

async function fetchGurusForTicker(ticker) {
  const portfolios = await loadCachedPortfolios();
  if (!portfolios || Object.keys(portfolios).length === 0) return null;
  const holding = findGurusOwning(portfolios, ticker);
  return holding && holding.length > 0
    ? { count: holding.length, holdings: holding }
    : { count: 0, holdings: [] };
}

// ─── Helper: Fetch insider data for a ticker ────────────────────

async function fetchInsidersForTicker(ticker) {
  const transactions = await fetchInsiderTransactions(ticker);
  if (!transactions || transactions.length === 0) return { summary: null, recentTransactions: [] };
  const summary = computeInsiderSummary(transactions);
  return { summary, recentTransactions: transactions.slice(0, 50) };
}

// ─── Helper: Derive debt metrics from financials ────────────────

function deriveDebtMetrics(statements, fcf) {
  if (!statements) return null;

  const latestYear = statements.years?.[0];
  if (!latestYear) return null;

  const balance = statements.balance?.[latestYear] || {};
  const income = statements.income?.[latestYear] || {};
  const cf = statements.cashFlow?.[latestYear] || {};

  const totalDebt = balance.total_debt || 0;
  const cash = balance.cash_and_short_term_investments || balance.cash || 0;
  const netDebt = totalDebt - cash;
  const netIncome = income.net_income_loss || 0;
  const freeCashFlow = cf.free_cash_flow || 0;

  return {
    totalDebt,
    cash,
    netDebt,
    netDebtToEarnings: netIncome !== 0 ? netDebt / netIncome : null,
    netDebtToFCF: freeCashFlow !== 0 ? netDebt / freeCashFlow : null,
    isNetCash: netDebt < 0,
  };
}

// ─── Industry-Aware Caveats ─────────────────────────────────────

/**
 * Build caveats for agent awareness based on industry classification.
 * @param {object|null|undefined} classification
 * @returns {string[]}
 */
export function buildCaveats(classification) {
  if (!classification) return [];

  const caveats = [];
  const type = classification.industryType;

  if (type === 'reit') {
    caveats.push('FFO is derived (not tagged in XBRL) — approximate for post-2018 years. Cross-reference NAREIT-published FFO.');
    caveats.push('AFFO maintenance capex hardcoded at 15% of total capex. Adjust per REIT subtype.');
  }
  if (type === 'insurance') {
    caveats.push('Insurance float is approximated from XBRL balance sheet items. Pure-play insurers have better coverage.');
  }
  if (type === 'bank') {
    caveats.push('Use NIM, efficiency ratio, and provision for credit losses as primary metrics. Gross margin is not meaningful.');
  }

  return caveats;
}
