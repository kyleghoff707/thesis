// ─── Peer Metrics Engine ───────────────────────────────────────────
// Fetches financial metrics for peer companies using EDGAR Frames API.
// Each Frames request returns data for ALL ~10,000 public companies —
// we filter in-memory by peer CIK set.

import { fetchFrame, PEER_FRAMES_TAGS } from './edgarFrames';
import { computeMoatScore, computeManagementScore, computeRuleOneScore } from './ruleOneScore';

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
 * Compute Moat + Management + R1 scores for all peers.
 * Requires multi-year Frames data. Returns Map<cik, { moatScore, managementScore, ruleOneScore }>
 */
export async function computePeerScores(peerCIKs, latestYear) {
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

  // Compute scores per peer
  const scores = new Map();

  for (const cik of numericCIKs) {
    const gd = growthData.get(cik);
    const rd = returnData.get(cik);

    // ── Moat Score (growth CAGRs) ──
    const growthRates = {};
    if (gd) {
      for (const gDef of GROWTH_TAGS) {
        const series = gd[gDef.field];
        if (!series) { growthRates[gDef.metric] = {}; continue; }
        const latest = series[latestYear];
        const rates = {};
        if (latest != null) {
          const periods = { '10yr': 10, '7yr': 7, '5yr': 5, '3yr': 3, '1yr': 1 };
          for (const [label, span] of Object.entries(periods)) {
            const start = series[latestYear - span];
            if (span === 1) {
              // Simple YoY growth
              const prev = series[latestYear - 1];
              rates[label] = (prev && prev !== 0) ? (latest - prev) / Math.abs(prev) : null;
            } else {
              rates[label] = cagr(start, latest, span);
            }
          }
        }
        growthRates[gDef.metric] = rates;
      }
    }
    // FCF growth (derived: opCash - capEx per year — skip for simplicity, use operatingCash as proxy)
    if (!growthRates.fcf) growthRates.fcf = {};

    const { moatScore } = computeMoatScore(growthRates);

    // ── Management Score (return averages + debt) ──
    const returnAverages = {};
    if (rd) {
      const periods = { '10yr': 10, '7yr': 7, '5yr': 5, '3yr': 3 };
      for (const [label, span] of Object.entries(periods)) {
        const yearRange = [];
        for (let y = latestYear; y > latestYear - span; y--) {
          if (rd[y]) yearRange.push(rd[y]);
        }
        if (yearRange.length > 0) {
          const avg = (field, denom) => {
            const vals = yearRange
              .map(yr => (yr.netIncome && yr[denom] && yr[denom] !== 0) ? yr.netIncome / yr[denom] : null)
              .filter(v => v != null);
            return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
          };
          returnAverages[label] = {
            roe: avg('netIncome', 'equity'),
            roic: (() => {
              const vals = yearRange
                .map(yr => (yr.netIncome && (yr.equity || yr.ltDebt)) ? yr.netIncome / ((yr.equity || 0) + (yr.ltDebt || 0)) : null)
                .filter(v => v != null);
              return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
            })(),
            roa: avg('netIncome', 'assets'),
          };
        } else {
          returnAverages[label] = { roe: null, roic: null, roa: null };
        }
      }
    }

    // Debt metrics from latest year
    const latestReturn = rd?.[latestYear] || {};
    const netIncome = latestReturn.netIncome;
    const ltDebt = latestReturn.ltDebt || 0;
    const debtMetrics = {
      netDebtToEarnings: (netIncome && netIncome > 0) ? ltDebt / netIncome : null,
      netDebtToFCF: null, // Would need opCF + capEx — skip
    };

    const { managementScore } = computeManagementScore(returnAverages, debtMetrics);
    const ruleOneScore = computeRuleOneScore(moatScore, managementScore);

    scores.set(cik, { moatScore, managementScore, ruleOneScore });
  }

  return scores;
}
