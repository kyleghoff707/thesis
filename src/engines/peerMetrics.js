// ─── Peer Metrics Engine ───────────────────────────────────────────
// Fetches financial metrics for peer companies using EDGAR Frames API.
// Each Frames request returns data for ALL ~10,000 public companies —
// we filter in-memory by peer CIK set.

import { fetchFrame, PEER_FRAMES_TAGS } from './edgarFrames';
import {
  scoreCompoundingPillar,
  scoreCapitalEfficiencyPillar,
  scoreCapitalAllocationPillar,
  scoreResiliencePillar,
} from './thesisScoreV2';

// ─── Single-Year Peer Frame Data ───────────────────────────────────

/**
 * Fetch all peer metrics from Frames API for a given year.
 * Returns Map<numericCik, { revenues, net_income_loss, equity, ... }>
 * Only includes CIKs in the peerCIKs set.
 */
export async function fetchPeerFrameData(peerCIKs, year) {
  // Convert padded CIKs to numeric for matching against Frames data
  const numericCIKs = new Set();
  for (const cik of peerCIKs) numericCIKs.add(parseInt(cik, 10));

  const peerData = new Map();

  // Fetch each tag in parallel batches of 6
  for (let i = 0; i < PEER_FRAMES_TAGS.length; i += 6) {
    const batch = PEER_FRAMES_TAGS.slice(i, i + 6);
    const promises = batch.map(async (def) => {
      // Use correct period format: instant (balance sheet) → Q4I suffix, duration → plain year
      const cyYear = def.period === 'instant' ? `${year}Q4I` : year;
      // Try primary tag, then fallbacks
      const tagsToTry = [def.tag, ...def.fallbacks];
      for (const tag of tagsToTry) {
        const framesData = await fetchFrame(tag, def.unit, cyYear);
        if (framesData?.data) {
          for (const entry of framesData.data) {
            if (!numericCIKs.has(entry.cik)) continue;
            if (!peerData.has(entry.cik)) peerData.set(entry.cik, { entityName: entry.entityName });
            const pd = peerData.get(entry.cik);
            // Only set if not already set by a previous tag variant
            if (pd[def.ourField] == null) pd[def.ourField] = entry.val;
          }
          // Check if all peers have this field — if so, skip remaining fallbacks
          const allHaveField = [...numericCIKs].every(cik => peerData.get(cik)?.[def.ourField] != null);
          if (allHaveField) break;
        }
      }
    });
    await Promise.all(promises);
    if (i + 6 < PEER_FRAMES_TAGS.length) await new Promise(r => setTimeout(r, 100));
  }

  return peerData;
}

// ─── Derived Metrics ───────────────────────────────────────────────

/**
 * Compute derived metrics from raw Frames data.
 * Input: Map<cik, { revenues, net_income_loss, equity, ... }>
 * Returns: Map<cik, { ...raw, grossMargin, netMargin, opMargin, roe, roic, roa, fcf, ... }>
 */
export function computePeerMetrics(frameDataMap) {
  const results = new Map();

  for (const [cik, data] of frameDataMap) {
    const d = { ...data };

    // ── Derived raw metrics (fill gaps from building blocks) ──
    // GrossProfit: if missing, try Revenue - CostOfRevenue
    if (d.gross_profit == null && d.revenues != null && d.cost_of_revenue != null) {
      d.gross_profit = d.revenues - d.cost_of_revenue;
    }
    // OperatingIncome: if missing, try Revenue - CostsAndExpenses
    if (d.operating_income == null && d.revenues != null && d.total_costs_and_expenses != null) {
      d.operating_income = d.revenues - d.total_costs_and_expenses;
    }

    // FCF
    const opCF = d.net_cash_flow_from_operating_activities;
    const capEx = d.capital_expenditures;
    d.fcf = (opCF != null && capEx != null) ? opCF - Math.abs(capEx) : null;

    // Margins
    d.grossMargin = (d.gross_profit != null && d.revenues) ? d.gross_profit / d.revenues : null;
    d.netMargin = (d.net_income_loss != null && d.revenues) ? d.net_income_loss / d.revenues : null;
    d.operatingMargin = (d.operating_income != null && d.revenues) ? d.operating_income / d.revenues : null;

    // Returns
    d.roe = (d.net_income_loss != null && d.equity && d.equity !== 0) ? d.net_income_loss / d.equity : null;
    d.roic = (d.net_income_loss != null && d.equity != null && d.long_term_debt != null)
      ? d.net_income_loss / (d.equity + d.long_term_debt)
      : (d.net_income_loss != null && d.equity && d.equity !== 0) ? d.net_income_loss / d.equity : null;
    d.roa = (d.net_income_loss != null && d.assets && d.assets !== 0) ? d.net_income_loss / d.assets : null;

    // FCF Ratio
    d.fcfRatio = (d.fcf != null && d.net_income_loss && d.net_income_loss !== 0) ? d.fcf / d.net_income_loss : null;

    // Quick Ratio
    const ca = d.current_assets;
    const cl = d.current_liabilities;
    const inv = d.inventory || 0;
    d.quickRatio = (ca != null && cl != null && cl !== 0) ? (ca - inv) / cl : null;

    // Debt metrics
    const cash = d.cash || 0;
    const ltDebt = d.long_term_debt || 0;
    const netDebt = ltDebt - cash;

    d.netDebtToEarnings = (d.net_income_loss && d.net_income_loss > 0) ? netDebt / d.net_income_loss : null;
    d.netDebtToFCF = (d.fcf && d.fcf > 0) ? netDebt / d.fcf : null;
    d.ltDebtToEarnings = (d.net_income_loss && d.net_income_loss > 0 && ltDebt > 0) ? ltDebt / d.net_income_loss : null;
    d.ltDebtToFCF = (d.fcf && d.fcf > 0 && ltDebt > 0) ? ltDebt / d.fcf : null;

    results.set(cik, d);
  }

  return results;
}

// ─── Yahoo Data Backfill ──────────────────────────────────────────

/**
 * Merge Yahoo quote data into EDGAR frame data to fill gaps.
 * Only fills null values — never overwrites EDGAR data.
 * Input: raw frameDataMap (pre-derivation), quotesMap, peerList
 * Returns: merged frameDataMap (ready for computePeerMetrics)
 */
export function mergeYahooData(frameDataMap, quotesMap, peerList) {
  const merged = new Map(frameDataMap);

  for (const peer of peerList) {
    if (!peer.ticker) continue;
    const quote = quotesMap.get(peer.ticker);
    if (!quote) continue;

    const numCik = parseInt(peer.cik, 10);
    const existing = merged.get(numCik) || { entityName: peer.name };

    // EPS: fill from Yahoo TTM if EDGAR is missing
    if (existing.diluted_earnings_per_share == null && quote.epsTrailingTwelveMonths != null) {
      existing.diluted_earnings_per_share = quote.epsTrailingTwelveMonths;
    }
    // Shares outstanding
    if (existing.shares_outstanding == null && quote.sharesOutstanding != null) {
      existing.shares_outstanding = quote.sharesOutstanding;
    }
    // Equity: derive from bookValue × sharesOutstanding if missing
    if (existing.equity == null && quote.bookValue != null && quote.sharesOutstanding != null) {
      existing.equity = quote.bookValue * quote.sharesOutstanding;
    }

    merged.set(numCik, existing);
  }

  return merged;
}

// ─── Data Completeness ────────────────────────────────────────────

const CORE_FIELDS = ['revenues', 'net_income_loss', 'equity', 'assets',
  'net_cash_flow_from_operating_activities', 'capital_expenditures'];

/**
 * Compute data completeness per peer.
 * Returns Map<numericCik, number> where number is 0.0-1.0
 */
export function computeCompleteness(metricsMap) {
  const result = new Map();
  for (const [cik, data] of metricsMap) {
    const filled = CORE_FIELDS.filter(f => data[f] != null).length;
    result.set(cik, filled / CORE_FIELDS.length);
  }
  return result;
}

// ─── Multi-Year Scores ─────────────────────────────────────────────

// CAGR helper
function cagr(startVal, endVal, years) {
  if (!startVal || startVal <= 0 || !endVal || endVal <= 0 || !years || years <= 0) return null;
  return Math.pow(endVal / startVal, 1 / years) - 1;
}

// Core tags needed for growth rate scoring (5 Moat metrics)
const GROWTH_TAGS = [
  { tag: 'StockholdersEquity', fallbacks: ['StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'], unit: 'USD', field: 'equity', metric: 'bvps', period: 'instant' },
  { tag: 'NetIncomeLoss', fallbacks: [], unit: 'USD', field: 'earnings', metric: 'earnings', period: 'duration' },
  { tag: 'Revenues', fallbacks: ['RevenueFromContractWithCustomerExcludingAssessedTax', 'RevenueFromContractWithCustomerIncludingAssessedTax'], unit: 'USD', field: 'revenue', metric: 'revenue', period: 'duration' },
  { tag: 'NetCashProvidedByUsedInOperatingActivities', fallbacks: ['NetCashProvidedByUsedInOperatingActivitiesContinuingOperations'], unit: 'USD', field: 'opCash', metric: 'operatingCash', period: 'duration' },
];

// Return metrics tags
const RETURN_TAGS = [
  { tag: 'NetIncomeLoss', unit: 'USD', field: 'netIncome', period: 'duration' },
  { tag: 'StockholdersEquity', fallbacks: ['StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'], unit: 'USD', field: 'equity', period: 'instant' },
  { tag: 'LongTermDebtNoncurrent', fallbacks: ['LongTermDebt'], unit: 'USD', field: 'ltDebt', period: 'instant' },
  { tag: 'Assets', fallbacks: [], unit: 'USD', field: 'assets', period: 'instant' },
];

/**
 * Compute Thesis Score (4 pillars) for all peers.
 *
 * Compounding + Capital Efficiency: scored from multi-year Frames data
 * (equity/NI/revenue/opCash series + ROIC averages).
 *
 * Capital Allocation + Resilience: scored from a degraded subset using
 * Phase-2 single-year metrics (latestYearMetrics, optional). Sub-metrics
 * that require data peers don't expose (dividend history, interest expense)
 * are skipped — the pillar averages whatever is present.
 *
 * Returns Map<cik, { composite, pillars }>.
 */
export async function computePeerScores(peerCIKs, latestYear, latestYearMetrics = null) {
  const numericCIKs = new Set();
  for (const cik of peerCIKs) numericCIKs.add(parseInt(cik, 10));

  // Year points needed for CAGR: 10yr, 7yr, 5yr, 3yr, 1yr
  const years = [latestYear, latestYear - 1, latestYear - 3, latestYear - 5, latestYear - 7, latestYear - 10];

  // Build per-CIK, per-year data for growth tags
  // Structure: growthData[cik][field][year] = value
  const growthData = new Map();
  const returnData = new Map();

  // Fetch growth tag frames for all years
  const allTags = [...GROWTH_TAGS, ...RETURN_TAGS];
  const seen = new Set(); // avoid duplicate fetches
  for (const year of years) {
    for (const def of allTags) {
      // Use correct period format: instant (balance sheet) → Q4I suffix, duration → plain year
      const cyYear = def.period === 'instant' ? `${year}Q4I` : year;
      const tagsToTry = [def.tag, ...(def.fallbacks || [])];
      for (const tag of tagsToTry) {
        const key = `${tag}:${def.unit}:${cyYear}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const framesData = await fetchFrame(tag, def.unit, cyYear);
        if (!framesData?.data) continue;

        for (const entry of framesData.data) {
          if (!numericCIKs.has(entry.cik)) continue;

          // Growth data
          if (GROWTH_TAGS.some(g => g.tag === def.tag || (g.fallbacks || []).includes(tag))) {
            const gDef = GROWTH_TAGS.find(g => g.tag === def.tag || (g.fallbacks || []).includes(tag));
            if (gDef) {
              if (!growthData.has(entry.cik)) growthData.set(entry.cik, {});
              const gd = growthData.get(entry.cik);
              if (!gd[gDef.field]) gd[gDef.field] = {};
              if (gd[gDef.field][year] == null) gd[gDef.field][year] = entry.val;
            }
          }

          // Return data
          if (RETURN_TAGS.some(r => r.tag === def.tag || (r.fallbacks || []).includes(tag))) {
            const rDef = RETURN_TAGS.find(r => r.tag === def.tag || (r.fallbacks || []).includes(tag));
            if (rDef) {
              if (!returnData.has(entry.cik)) returnData.set(entry.cik, {});
              const rd = returnData.get(entry.cik);
              if (!rd[year]) rd[year] = {};
              if (rd[year][rDef.field] == null) rd[year][rDef.field] = entry.val;
            }
          }
        }
        // Only use first successful tag (primary before fallbacks)
        if (framesData?.data?.length > 0) break;
      }
    }
  }

  // Fetch shares-outstanding 5 years prior for buyback discipline scoring.
  // (Latest-year shares come from latestYearMetrics; 5yr-prior needs a
  // separate Frames call.)
  const sharesPriorByCik = new Map();
  {
    const priorYear = `${latestYear - 5}Q4I`;
    const sharesTags = ['CommonStockSharesOutstanding', 'EntityCommonStockSharesOutstanding'];
    for (const tag of sharesTags) {
      const framesData = await fetchFrame(tag, 'shares', priorYear);
      if (!framesData?.data) continue;
      for (const entry of framesData.data) {
        if (!numericCIKs.has(entry.cik)) continue;
        if (!sharesPriorByCik.has(entry.cik)) {
          sharesPriorByCik.set(entry.cik, entry.val);
        }
      }
      // Stop once primary tag covers everyone we can find
      if (sharesPriorByCik.size >= numericCIKs.size) break;
    }
  }

  // Compute scores per peer. Compounding + Capital Efficiency from multi-year
  // Frames; Capital Allocation + Resilience from latestYearMetrics + shares
  // history. Sub-metrics requiring unavailable peer data (dividend history,
  // interest expense, reinvestment composite series) are skipped.
  const scores = new Map();

  for (const cik of numericCIKs) {
    const gd = growthData.get(cik);
    const rd = returnData.get(cik);

    // Build per-share BV+Div proxy from equity series (no dividend/buyback data
    // for peers, so the proxy is just BV per share if shares available, else
    // raw equity). Use raw equity series since shares aren't in the peer fetch.
    const buildSeries = (field) => {
      const series = gd?.[field];
      if (!series) return [];
      return Object.entries(series)
        .map(([y, v]) => ({ year: Number(y), value: v }))
        .filter(d => d.value != null)
        .sort((a, b) => a.year - b.year);
    };

    const bvpsSeriesRaw = buildSeries('equity');
    const opCashSeriesRaw = buildSeries('opCash');

    const cagrFromSeries = (series, span) => {
      if (series.length < 2) return null;
      const latest = series[series.length - 1];
      const target = series.find(d => d.year === latest.year - span);
      return target ? cagr(target.value, latest.value, span) : null;
    };

    const compoundingInput = {
      growthRates: {
        bvps:          { '10yr': cagrFromSeries(bvpsSeriesRaw, 10),  '5yr': cagrFromSeries(bvpsSeriesRaw, 5) },
        operatingCash: { '10yr': cagrFromSeries(opCashSeriesRaw, 10), '5yr': cagrFromSeries(opCashSeriesRaw, 5) },
        // No FCF for peers (no capex in Frames)
        fcf:           {},
      },
      bvpsSeries:          [], // skip consistency for peer (need YoY rate series, not enough points)
      operatingCashSeries: [],
      fcfSeries:           [],
    };
    const compounding = scoreCompoundingPillar(compoundingInput);

    // Capital Efficiency: average ROIC over 5yr window
    let roic5yr = null;
    let roic10yr = null;
    if (rd) {
      const avgRoic = (span) => {
        const vals = [];
        for (let y = latestYear; y > latestYear - span; y--) {
          const r = rd[y];
          if (r && r.netIncome != null && (r.equity || r.ltDebt)) {
            vals.push(r.netIncome / ((r.equity || 0) + (r.ltDebt || 0)));
          }
        }
        return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
      };
      roic5yr = avgRoic(5);
      roic10yr = avgRoic(10);
    }

    const capitalEfficiency = scoreCapitalEfficiencyPillar({
      returnAverages: {
        '10yr': { roic: roic10yr },
        '5yr':  { roic: roic5yr },
      },
      roicSeries:   [],   // no consistency for peers (sparse)
      fcfNiRatios:  [],   // no FCF/NI for peers
      grossMarginSlope: null,
    });

    // Pillar 3: Capital Allocation — buyback discipline only (peers lack
    // dividend cash-flow data and the BVPS composite series needed for
    // reinvestment effectiveness).
    const m = latestYearMetrics?.get(cik);
    const sharesNow = m?.shares_outstanding ?? null;
    const sharesThen = sharesPriorByCik.get(cik) ?? null;
    const sharesPct = (sharesNow != null && sharesThen != null && sharesThen !== 0)
      ? (sharesNow - sharesThen) / sharesThen
      : null;

    const capitalAllocation = scoreCapitalAllocationPillar({
      sharesOutstanding5yrPctChange: sharesPct,
      dividendInfo:                  null,  // not fetched for peers
      reinvestmentEffectiveness:     null,  // requires composite BVPS series
    });

    // Pillar 4: Resilience — netDebtToFCF + currentRatio (peers lack interest
    // expense for interestCoverage).
    const cash    = m?.cash ?? null;
    const ltDebt  = m?.long_term_debt ?? 0;
    const fcf     = m?.fcf ?? null;
    const netDebt = (cash != null) ? ltDebt - cash : null;
    const netDebtToFCF = (netDebt != null && fcf != null && fcf > 0) ? netDebt / fcf : null;
    const currentRatio = (m?.current_assets != null && m?.current_liabilities && m.current_liabilities !== 0)
      ? m.current_assets / m.current_liabilities
      : null;
    const isNetCash = (cash != null) ? cash > ltDebt : false;

    const resilience = scoreResiliencePillar({
      netDebtToFCF,
      interestCoverage: null,  // not fetched for peers
      currentRatio,
      isNetCash,
    });

    const pillars = { compounding, capitalEfficiency, capitalAllocation, resilience };
    const present = [compounding.score, capitalEfficiency.score, capitalAllocation.score, resilience.score]
      .filter(s => s != null);
    const composite = present.length > 0
      ? Math.round(present.reduce((a, b) => a + b, 0) / present.length)
      : null;

    scores.set(cik, { composite, pillars });
  }

  return scores;
}
