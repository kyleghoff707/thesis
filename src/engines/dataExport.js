// DataPacket assembly — aggregates ALL engine output into canonical JSON
// This is the Data Assembler: calls 20+ engines, returns a DataPacket
// for agent consumption. Pure orchestration, no AI.
//
// Each engine call is wrapped in try/catch — partial data is better than no data.
// Failed engines set their field to null and log to the errors array.

import { fetchEdgarStatements } from './edgarFinancials.js';
import { fetchCompanyInfo, fetchFilings } from './edgar.js';
import { classifyIndustryType } from './industryClassifier.js';
import { classifyCompany } from './thesisClassification.js';
import { computeAllGrowthRates } from './growthRates.js';
import { computeReturnMetrics, computeDebtMetrics } from './returnMetrics.js';
import { computeFreeCashFlow } from './freeCashFlow.js';
import { computeKeyMetrics } from './keyMetrics.js';
import { computeThesisScoreV2 } from './thesisScoreV2.js';
import { findGurusOwning, loadCachedPortfolios, fetchAllGuruHoldings } from './gurus.js';
import { fetchInsiderTransactions, computeInsiderSummary } from './insiders.js';
import { fetchCompensation } from './compensation.js';
import { fetchPeersByTier } from './peers.js';
import { fetchPeerFrameData, computePeerMetrics, computePeerScores } from './peerMetrics.js';
import { fetchBatchQuotes } from './batchQuotes.js';
import { getTranscriptAvailability } from './transcripts.js';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const IS_NODE = typeof window === 'undefined';

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

  // ── Step 1: Core financial data (parallel — companyInfo only needs ticker, not statements) ──

  const [statementsResult, companyInfoResult] = await Promise.allSettled([
    fetchEdgarStatements(ticker).catch(err => { errors.push(`edgarFinancials: ${err.message}`); return null; }),
    fetchCompanyInfo(ticker).catch(err => { errors.push(`companyInfo: ${err.message}`); return null; }),
  ]);

  const statements = statementsResult.status === 'fulfilled' ? statementsResult.value : null;
  let companyInfo = companyInfoResult.status === 'fulfilled' ? companyInfoResult.value : null;

  // Classification from EDGAR SIC code + Thesis taxonomy
  const sicCode = companyInfo?.sic || statements?.industryType || '';
  const thesisClass = classifyCompany(
    ticker,
    companyInfo?.cik || null,
    sicCode,
    companyInfo?.sicDescription || ''
  );
  const classification = {
    industryType: statements?.industryType || classifyIndustryType(sicCode),
    sicCode: companyInfo?.sic || '',
    sicDescription: companyInfo?.sicDescription || '',
    // Thesis taxonomy fields needed by peers.js fetchPeersByTier
    sector: thesisClass?.sector || null,
    industryGroup: thesisClass?.industryGroup || null,
    industry: thesisClass?.industry || null,
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
  // In Node.js, skip Yahoo-dependent engines entirely — yahoo-finance2 crumb auth
  // is broken and every call times out at 30s, wasting ~65s per engine (timeout +
  // retry backoff + retry timeout). Use Finviz/EODHD fallbacks instead.

  const step3 = await Promise.allSettled([
    safeCall(() => fetchGurusForTicker(ticker), 'gurus', errors),
    safeCall(() => fetchInsidersForTicker(ticker), 'insiders', errors),
    safeCall(() => fetchCompensation(ticker), 'compensation', errors),
    safeCall(() => fetchPeersByTier('industry', classification, ticker), 'peers', errors),
    safeCall(() => fetchFilingList(ticker), 'filings', errors),
  ]);

  const gurus = step3[0].value ?? null;
  const insiders = step3[1].value ?? null;
  const compensation = step3[2].value ?? null;
  const peers = step3[3].value ?? null;
  const filings = step3[4].value ?? null;

  // ── Step 4: Dependent data (depends on previous steps) ──

  let peerMetrics = null;
  let peerQuotes = null;

  if (peers && peers.length > 0) {
    const peerCIKs = new Set(peers.map(p => Number(p.cik)));
    const latestYear = statements?.years?.[0] || new Date().getFullYear();

    try {
      const raw = await computePeerScores(peerCIKs, latestYear);
      // Fix: computePeerScores returns a Map; JSON.stringify(Map) = '{}'
      peerMetrics = raw instanceof Map ? Object.fromEntries(raw) : raw;
    } catch (err) {
      errors.push(`peerMetrics: ${err.message}`);
    }

    // Skip Yahoo batch quotes in Node.js — same crumb auth timeout issue
    const peerTickers = peers.map(p => p.ticker).filter(Boolean);
    if (peerTickers.length > 0 && !IS_NODE) {
      try {
        peerQuotes = await fetchBatchQuotes(peerTickers);
      } catch (err) {
        errors.push(`batchQuotes: ${err.message}`);
      }
    }
  }

  // ── Step 5: Composite score (Thesis Score v2) ──
  // See docs/specs/2026-05-09-thesis-score-redesign.md

  let thesisScoreResult = { composite: null, pillars: null };

  try {
    if (statements && growthRates && returnMetrics) {
      thesisScoreResult = computeThesisScoreV2({
        statements,
        growthRates,
        returnMetrics,
        fcf,
        debtMetrics,
      });
    }
  } catch (err) {
    errors.push(`thesisScore: ${err.message}`);
  }

  // ── Derive debt metrics from financials ──

  const derivedDebtMetrics = deriveDebtMetrics(statements, fcf);

  // ── Build transcript availability summary ──
  // Prefers the repo-bundled corpus (free, instant, no rate limit);
  // falls back to Alpha Vantage when configured. Returns null only when
  // neither source has anything for this ticker.

  const transcriptAvailability = getTranscriptAvailability(ticker);

  // ── TTM field aliases + BVPS derivation ──

  const ttm = statements?.ttm || null;
  if (ttm) {
    // Fix 5: operating_cash_flow alias for net_cash_flow_from_operating_activities
    if (ttm.cashFlow?.net_cash_flow_from_operating_activities && !ttm.cashFlow.operating_cash_flow) {
      ttm.cashFlow.operating_cash_flow = ttm.cashFlow.net_cash_flow_from_operating_activities;
    }
    // Fix 6: derive book_value_per_share in TTM balance
    if (ttm.balance && !ttm.balance.book_value_per_share) {
      const equity = ttm.balance.stockholders_equity;
      const shares = ttm.balance.common_shares_outstanding;
      if (equity && shares) ttm.balance.book_value_per_share = equity / shares;
    }
  }

  // ── Assemble DataPacket ──

  return {
    ticker: ticker.toUpperCase(),
    companyInfo,
    classification,
    financials: statements ? trimFinancials(statements, 10) : null,
    ttm,
    growthRates,
    returnMetrics: returnMetrics || null,
    debtMetrics: derivedDebtMetrics || debtMetrics || null,
    fcf,
    keyMetrics,
    thesisScore: {
      composite: thesisScoreResult.composite,
      pillars: thesisScoreResult.pillars,
      reason: thesisScoreResult.reason,
    },
    gurus,
    insiders,
    compensation,
    peers,
    peerMetrics: peerMetrics || null,
    transcriptAvailability,
    filings,
    caveats: buildCaveats(classification),
    errors: errors.length > 0 ? errors : undefined,
    assembledAt: new Date().toISOString(),
  };
}

// ─── Helper: Trim financials to N most recent years ────────────

function trimFinancials(statements, maxYears) {
  const years = statements.years.slice(0, maxYears);
  const pick = (obj) => {
    const out = {};
    for (const y of years) { if (obj[y] !== undefined) out[y] = obj[y]; }
    return out;
  };
  return { years, income: pick(statements.income), balance: pick(statements.balance), cashFlow: pick(statements.cashFlow) };
}

// ─── Helper: Safe engine call ───────────────────────────────────

async function safeCall(fn, label, errors, { retry = false, backoffMs = 5000 } = {}) {
  try {
    return await fn();
  } catch (err) {
    if (retry) {
      // Retry once after backoff (per D-09)
      await sleep(backoffMs);
      try {
        return await fn();
      } catch (retryErr) {
        errors.push(`${label}: ${retryErr.message} (after retry)`);
        return null;
      }
    }
    errors.push(`${label}: ${err.message}`);
    return null;
  }
}

// ─── Helper: Fetch gurus holding a ticker ───────────────────────

async function fetchGurusForTicker(ticker) {
  // Load all portfolios from cache/SEC EDGAR
  let portfolios = await loadCachedPortfolios();
  if (!portfolios || portfolios.filter(Boolean).length === 0) {
    portfolios = await fetchAllGuruHoldings();
  }
  if (!portfolios || portfolios.filter(Boolean).length === 0) return null;
  const holding = findGurusOwning(portfolios, ticker);
  return holding && holding.length > 0
    ? { count: holding.length, holdings: holding }
    : { count: 0, holdings: [] };
}

// ─── Helper: Fetch insider data for a ticker ────────────────────

async function fetchInsidersForTicker(ticker) {
  const result = await fetchInsiderTransactions(ticker);
  // fetchInsiderTransactions returns { transactions, monthlyAggregates, summary, ... }
  const txns = result?.transactions || [];
  if (txns.length === 0) return { summary: result?.summary || null, recentTransactions: [] };
  return { summary: result.summary, recentTransactions: txns.slice(0, 50) };
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

// ─── Helper: Fetch filing list for DataPacket ───────────────────

const FILING_FORMS = new Set(['10-K', '10-Q', '8-K', 'DEF 14A']);
const MAX_PER_FORM = 20;

/**
 * Fetch a filtered list of SEC filings for the DataPacket.
 * Uses the existing fetchFilings engine, then filters to forms
 * of interest and limits to MAX_PER_FORM per form type.
 * @param {string} ticker
 * @returns {Promise<object[]>} Array of { form, filingDate, accessionNumber, primaryDocument }
 */
async function fetchFilingList(ticker) {
  const allFilings = await fetchFilings(ticker);
  if (!allFilings || allFilings.length === 0) return null;

  const counts = {};
  const result = [];
  for (const f of allFilings) {
    if (!FILING_FORMS.has(f.form)) continue;
    counts[f.form] = (counts[f.form] || 0) + 1;
    if (counts[f.form] > MAX_PER_FORM) continue;
    result.push({
      form: f.form,
      filingDate: f.filingDate,
      accessionNumber: f.accessionNumber,
      primaryDocument: f.primaryDocument,
    });
  }
  return result.length > 0 ? result : null;
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

// Test-only exports (matches codebase convention — see edgarFinancials.js)
export const _testExports = { safeCall };
