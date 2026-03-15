// Ticker Data Audit — pre-research data quality check
// Runs 8 check groups against a single ticker to verify data availability and integrity.

import { lookupCIK, fetchCompanyInfo } from './edgar';
import { fetchEdgarStatements, fetchEdgarQuarterly } from './edgarFinancials';
import { validateCompany } from './validation';
import { fetchSplits } from './splits';
import { fetchPrices } from './prices';
import { fetchInsiderTransactions } from './insiders';
import { fetchCompensation } from './compensation';
import { fetchAnalystEstimates } from './analystEstimates';
import { fetchFinvizData } from './finviz';
import { fetchGuruFocusData } from './gurufocus';
import { computeKeyMetrics } from './keyMetrics';

// ─── Check Group Runners ──────────────────────────────────────────────

async function checkCompanyInfo(ticker) {
  const checks = [];
  const start = Date.now();

  try {
    const cik = await lookupCIK(ticker);
    checks.push({
      name: 'CIK Resolution',
      status: cik ? 'pass' : 'fail',
      detail: cik ? `CIK ${cik}` : 'Could not resolve ticker to CIK',
    });
    if (!cik) return { status: 'fail', checks, duration: Date.now() - start };

    const info = await fetchCompanyInfo(ticker);
    checks.push({
      name: 'Company Name',
      status: info?.name ? 'pass' : 'warn',
      detail: info?.name || 'Not available',
    });
    checks.push({
      name: 'SIC Code',
      status: info?.sic ? 'pass' : 'warn',
      detail: info?.sic ? `${info.sic} — ${info.sicDescription || ''}` : 'Not available',
    });
    checks.push({
      name: 'Exchange',
      status: info?.exchange ? 'pass' : 'warn',
      detail: info?.exchange || 'Not available',
    });
    checks.push({
      name: 'Fiscal Year End',
      status: info?.fiscalYearEnd ? 'pass' : 'warn',
      detail: info?.fiscalYearEnd || 'Not available',
    });

    const hasFail = checks.some(c => c.status === 'fail');
    const hasWarn = checks.some(c => c.status === 'warn');
    return { status: hasFail ? 'fail' : hasWarn ? 'warn' : 'pass', checks, duration: Date.now() - start };
  } catch (err) {
    checks.push({ name: 'Error', status: 'fail', detail: err.message });
    return { status: 'fail', checks, duration: Date.now() - start };
  }
}

async function checkFinancialStatements(ticker, options = {}) {
  const checks = [];
  const start = Date.now();

  try {
    const statements = await fetchEdgarStatements(ticker);
    if (!statements || !statements.years || statements.years.length === 0) {
      checks.push({ name: 'EDGAR Statements', status: 'fail', detail: 'No financial statement data returned' });
      return { status: 'fail', checks, duration: Date.now() - start };
    }

    checks.push({
      name: 'Years of Data',
      status: statements.years.length >= 5 ? 'pass' : statements.years.length >= 3 ? 'warn' : 'fail',
      detail: `${statements.years.length} years (${Math.min(...statements.years)}–${Math.max(...statements.years)})`,
    });

    // Run full validation
    let quarterlyData = null;
    if (options.includeQuarterly) {
      try {
        quarterlyData = await fetchEdgarQuarterly(ticker);
      } catch { /* non-critical */ }
    }

    const validation = await validateCompany(ticker, statements, {
      skipFrames: options.skipFrames !== false,
      quarterlyData,
    });

    const s = validation.summary;

    checks.push({
      name: 'Accounting Identities',
      status: s.identityPassRate >= 95 ? 'pass' : s.identityPassRate >= 80 ? 'warn' : 'fail',
      detail: `${s.identityPassRate}% pass rate`,
    });
    checks.push({
      name: 'Data Completeness',
      status: s.completenessScore >= 90 ? 'pass' : s.completenessScore >= 70 ? 'warn' : 'fail',
      detail: `${s.completenessScore}% of critical fields present`,
    });
    checks.push({
      name: 'Derived Fields',
      status: s.derivedMatchRate >= 95 ? 'pass' : s.derivedMatchRate >= 80 ? 'warn' : 'fail',
      detail: `${s.derivedMatchRate}% match rate`,
    });

    if (s.yoyFlagsCount > 0) {
      checks.push({
        name: 'Year-over-Year Sanity',
        status: s.yoyFlagsCount <= 2 ? 'warn' : 'fail',
        detail: `${s.yoyFlagsCount} anomalous YoY change${s.yoyFlagsCount !== 1 ? 's' : ''} flagged`,
      });
    } else {
      checks.push({ name: 'Year-over-Year Sanity', status: 'pass', detail: 'No anomalies' });
    }

    // RE reconciliation warnings are expected for buyback-heavy companies — never fail on this
    const rePassRate = s.retainedEarningsTotal > 0
      ? Math.round((s.retainedEarningsTotal - s.retainedEarningsWarnings) / s.retainedEarningsTotal * 100)
      : 100;
    checks.push({
      name: 'Retained Earnings Reconciliation',
      status: rePassRate >= 70 ? 'pass' : rePassRate >= 40 ? 'warn' : 'warn',
      detail: s.retainedEarningsTotal > 0
        ? `${s.retainedEarningsTotal - s.retainedEarningsWarnings}/${s.retainedEarningsTotal} periods reconcile (${rePassRate}%)${s.retainedEarningsWarnings > 0 ? ' — gaps typically from buybacks' : ''}`
        : 'No data',
    });

    if (!options.skipFrames) {
      checks.push({
        name: 'Frames Cross-Check',
        status: s.framesMatchRate >= 90 ? 'pass' : s.framesMatchRate >= 70 ? 'warn' : 'fail',
        detail: `${s.framesMatchRate}% match rate (${s.framesWarnings} warnings, ${s.framesErrors} errors)`,
      });
    }

    if (options.includeQuarterly && s.quarterlyRollupMatchRate != null) {
      checks.push({
        name: 'Quarterly Roll-Up',
        status: s.quarterlyRollupMatchRate >= 95 ? 'pass' : s.quarterlyRollupMatchRate >= 80 ? 'warn' : 'fail',
        detail: `${s.quarterlyRollupMatchRate}% match rate (${s.quarterlyRollupTotal} checks)`,
      });
    }

    // Key Metrics computation check
    try {
      const result = computeKeyMetrics(statements);
      if (!result || !result.metrics) {
        checks.push({ name: 'Key Metrics', status: 'warn', detail: 'No metrics returned' });
      } else {
        const { metrics: metricsData, years: metricYears } = result;
        const latestMetricYear = metricYears?.[0];
        // Count individual non-null metrics across all categories for latest year
        let metricCount = 0;
        if (latestMetricYear && metricsData[latestMetricYear]) {
          for (const category of Object.values(metricsData[latestMetricYear])) {
            if (category && typeof category === 'object') {
              metricCount += Object.values(category).filter(v => v != null).length;
            }
          }
        }
        checks.push({
          name: 'Key Metrics',
          status: metricCount >= 30 ? 'pass' : metricCount >= 10 ? 'warn' : 'fail',
          detail: metricCount > 0
            ? `${metricCount} non-null metrics computed for FY${latestMetricYear}`
            : `No metrics computed`,
        });
      }
    } catch (e) {
      checks.push({ name: 'Key Metrics', status: 'warn', detail: `Computation error: ${e.message}` });
    }

    const hasFail = checks.some(c => c.status === 'fail');
    const hasWarn = checks.some(c => c.status === 'warn');
    return {
      status: hasFail ? 'fail' : hasWarn ? 'warn' : 'pass',
      checks,
      duration: Date.now() - start,
      validation,
    };
  } catch (err) {
    checks.push({ name: 'Error', status: 'fail', detail: err.message });
    return { status: 'fail', checks, duration: Date.now() - start };
  }
}

async function checkSplits(ticker) {
  const checks = [];
  const start = Date.now();

  try {
    const splits = await fetchSplits(ticker);
    if (!splits || splits.length === 0) {
      checks.push({ name: 'Stock Splits', status: 'pass', detail: 'No splits detected' });
    } else {
      checks.push({
        name: 'Stock Splits',
        status: 'pass',
        detail: `${splits.length} split${splits.length !== 1 ? 's' : ''} detected`,
      });
      for (const split of splits) {
        const year = split.date ? split.date.split('-')[0] : '?';
        const ratio = typeof split.ratio === 'number' ? split.ratio : '?';
        checks.push({
          name: `Split ${year}`,
          status: 'pass',
          detail: `${ratio}:1 on ${split.date || 'unknown date'}`,
        });
      }
    }

    const hasWarn = checks.some(c => c.status === 'warn');
    return { status: hasWarn ? 'warn' : 'pass', checks, duration: Date.now() - start };
  } catch (err) {
    checks.push({ name: 'Error', status: 'fail', detail: err.message });
    return { status: 'fail', checks, duration: Date.now() - start };
  }
}

async function checkPriceData(ticker) {
  const checks = [];
  const start = Date.now();

  try {
    const prices = await fetchPrices(ticker, '5y');
    if (!prices || prices.length === 0) {
      checks.push({ name: 'Price Data', status: 'fail', detail: 'No price data returned from Yahoo Finance' });
      return { status: 'fail', checks, duration: Date.now() - start };
    }

    const firstDate = prices[0]?.date;
    const lastDate = prices[prices.length - 1]?.date;
    checks.push({
      name: 'Data Points',
      status: prices.length >= 200 ? 'pass' : prices.length >= 50 ? 'warn' : 'fail',
      detail: `${prices.length.toLocaleString()} daily prices`,
    });
    checks.push({
      name: 'Date Range',
      status: 'pass',
      detail: `${firstDate} to ${lastDate}`,
    });

    // Check staleness
    const lastDateObj = new Date(lastDate);
    const now = new Date();
    const daysSinceLastPrice = Math.floor((now - lastDateObj) / (1000 * 60 * 60 * 24));
    checks.push({
      name: 'Data Freshness',
      status: daysSinceLastPrice <= 4 ? 'pass' : daysSinceLastPrice <= 10 ? 'warn' : 'fail',
      detail: daysSinceLastPrice <= 1 ? 'Up to date' : `Last price ${daysSinceLastPrice} days ago`,
    });

    // Check for latest price
    const latestClose = prices[prices.length - 1]?.close;
    checks.push({
      name: 'Latest Close',
      status: latestClose != null ? 'pass' : 'warn',
      detail: latestClose != null ? `$${latestClose.toFixed(2)}` : 'Not available',
    });

    const hasFail = checks.some(c => c.status === 'fail');
    const hasWarn = checks.some(c => c.status === 'warn');
    return { status: hasFail ? 'fail' : hasWarn ? 'warn' : 'pass', checks, duration: Date.now() - start };
  } catch (err) {
    checks.push({ name: 'Error', status: 'fail', detail: err.message });
    return { status: 'fail', checks, duration: Date.now() - start };
  }
}

async function checkInsiders(ticker) {
  const checks = [];
  const start = Date.now();

  try {
    const result = await fetchInsiderTransactions(ticker, { yearsBack: 1 });
    if (!result) {
      checks.push({ name: 'Insider Data', status: 'warn', detail: 'No data returned' });
      return { status: 'warn', checks, duration: Date.now() - start };
    }

    const { transactions, summary } = result;
    checks.push({
      name: 'Form 4 Filings',
      status: transactions.length > 0 ? 'pass' : 'warn',
      detail: `${transactions.length} transaction${transactions.length !== 1 ? 's' : ''} in past 12 months`,
    });

    if (summary) {
      checks.push({
        name: 'Unique Insiders',
        status: summary.uniqueInsiders > 0 ? 'pass' : 'warn',
        detail: `${summary.uniqueInsiders} insider${summary.uniqueInsiders !== 1 ? 's' : ''}`,
      });
      checks.push({
        name: 'Open Market Activity',
        status: 'pass',
        detail: summary.openMarketBuyers90D > 0
          ? `${summary.openMarketBuyers90D} open market buyer${summary.openMarketBuyers90D !== 1 ? 's' : ''} (90D)`
          : 'No open market purchases (90D)',
      });
    }

    const hasFail = checks.some(c => c.status === 'fail');
    const hasWarn = checks.some(c => c.status === 'warn');
    return { status: hasFail ? 'fail' : hasWarn ? 'warn' : 'pass', checks, duration: Date.now() - start };
  } catch (err) {
    checks.push({ name: 'Error', status: 'fail', detail: err.message });
    return { status: 'fail', checks, duration: Date.now() - start };
  }
}

async function checkCompensation(ticker) {
  const checks = [];
  const start = Date.now();

  try {
    const data = await fetchCompensation(ticker);
    if (!data) {
      checks.push({ name: 'Compensation Data', status: 'fail', detail: 'No data returned' });
      return { status: 'fail', checks, duration: Date.now() - start };
    }

    const { executives, directors, ceoPayRatio, source } = data;
    checks.push({
      name: 'Executives Found',
      status: executives?.length >= 3 ? 'pass' : executives?.length > 0 ? 'warn' : 'fail',
      detail: executives?.length > 0
        ? `${executives.length} executive${executives.length !== 1 ? 's' : ''}`
        : 'No executives parsed',
    });

    if (executives?.length > 0) {
      const years = new Set();
      for (const exec of executives) {
        for (const yr of Object.keys(exec.compensation || {})) years.add(yr);
      }
      checks.push({
        name: 'Years of Comp Data',
        status: years.size >= 3 ? 'pass' : years.size >= 1 ? 'warn' : 'fail',
        detail: `${years.size} year${years.size !== 1 ? 's' : ''}`,
      });
    }

    checks.push({
      name: 'Directors Found',
      status: directors?.length > 0 ? 'pass' : 'warn',
      detail: directors?.length > 0
        ? `${directors.length} director${directors.length !== 1 ? 's' : ''}`
        : 'Not available',
    });
    checks.push({
      name: 'CEO Pay Ratio',
      status: ceoPayRatio ? 'pass' : 'warn',
      detail: ceoPayRatio || 'Not found',
    });
    checks.push({
      name: 'Parse Source',
      status: 'pass',
      detail: source === 'xbrl-pvp' ? 'ECD XBRL (Pay vs Performance)' : 'HTML table parsing',
    });

    const hasFail = checks.some(c => c.status === 'fail');
    const hasWarn = checks.some(c => c.status === 'warn');
    return { status: hasFail ? 'fail' : hasWarn ? 'warn' : 'pass', checks, duration: Date.now() - start };
  } catch (err) {
    checks.push({ name: 'Error', status: 'fail', detail: err.message });
    return { status: 'fail', checks, duration: Date.now() - start };
  }
}

async function checkAnalystEstimates(ticker) {
  const checks = [];
  const start = Date.now();

  let yahooOk = false, finvizOk = false, guruFocusOk = false;
  let analystGR = null, grSource = null;

  // Run all 3 in parallel
  const [yahooResult, finvizResult, gfResult] = await Promise.allSettled([
    fetchAnalystEstimates(ticker),
    fetchFinvizData(ticker),
    fetchGuruFocusData(ticker),
  ]);

  // Yahoo
  if (yahooResult.status === 'fulfilled' && yahooResult.value) {
    yahooOk = true;
    checks.push({ name: 'Yahoo Finance', status: 'pass', detail: 'Analyst estimates available' });
  } else {
    checks.push({ name: 'Yahoo Finance', status: 'warn', detail: yahooResult.reason?.message || 'No data' });
  }

  // Finviz
  if (finvizResult.status === 'fulfilled' && finvizResult.value) {
    finvizOk = true;
    const eps5y = finvizResult.value.epsNext5y;
    checks.push({
      name: 'Finviz',
      status: 'pass',
      detail: eps5y ? `EPS Next 5Y: ${eps5y}` : 'Data available (no 5Y EPS growth)',
    });
    if (eps5y) {
      const parsed = parseFloat(eps5y);
      if (!isNaN(parsed)) { analystGR = parsed; grSource = 'Finviz 5Y'; }
    }
  } else {
    checks.push({ name: 'Finviz', status: 'warn', detail: finvizResult.reason?.message || 'No data' });
  }

  // GuruFocus
  if (gfResult.status === 'fulfilled' && gfResult.value) {
    guruFocusOk = true;
    checks.push({ name: 'GuruFocus', status: 'pass', detail: 'Valuation data available' });
  } else {
    checks.push({ name: 'GuruFocus', status: 'skip', detail: 'Not available (expected — requires API key or JS-rendered page)' });
  }

  // Derived analyst GR
  if (analystGR == null && yahooResult.status === 'fulfilled' && yahooResult.value) {
    const yahoo = yahooResult.value;
    const nextFYGrowth = yahoo.nextFYGrowth || yahoo.epsGrowthNextFY;
    if (nextFYGrowth != null && !isNaN(nextFYGrowth)) {
      analystGR = typeof nextFYGrowth === 'string' ? parseFloat(nextFYGrowth) : nextFYGrowth;
      grSource = 'Yahoo Next FY';
    }
  }

  checks.push({
    name: 'Analyst Growth Rate',
    status: analystGR != null ? 'pass' : 'warn',
    detail: analystGR != null ? `${analystGR}% (${grSource})` : 'Could not derive from any source',
  });

  const sourcesAvailable = [yahooOk, finvizOk, guruFocusOk].filter(Boolean).length;
  const status = sourcesAvailable >= 2 ? 'pass' : sourcesAvailable >= 1 ? 'warn' : 'fail';
  return { status, checks, duration: Date.now() - start };
}

function checkGuruHoldings(ticker, guruActivities) {
  const checks = [];
  const start = Date.now();

  if (!guruActivities || guruActivities.length === 0) {
    checks.push({
      name: 'Guru Data',
      status: 'skip',
      detail: 'No guru data loaded — visit the Gurus tab to fetch data first',
    });
    return { status: 'skip', checks, duration: Date.now() - start };
  }

  const q = ticker.toUpperCase();
  const holders = [];
  for (const activity of guruActivities) {
    if (!activity?.holdings) continue;
    const match = activity.holdings.find(h =>
      h.ticker?.toUpperCase() === q ||
      h.issuer?.toUpperCase().includes(q)
    );
    if (match) {
      holders.push({
        name: activity.guru.name,
        action: match.action,
        pct: match.portfolioPct,
      });
    }
  }

  checks.push({
    name: 'Guru Ownership',
    status: 'pass',
    detail: holders.length > 0
      ? `${holders.length} guru${holders.length !== 1 ? 's' : ''} hold this stock`
      : 'Not held by any tracked gurus',
  });

  if (holders.length > 0) {
    for (const h of holders.slice(0, 8)) {
      checks.push({
        name: h.name,
        status: 'pass',
        detail: `${h.action || 'held'} — ${h.pct != null ? h.pct.toFixed(2) + '% of portfolio' : ''}`,
      });
    }
    if (holders.length > 8) {
      checks.push({ name: 'More', status: 'pass', detail: `+${holders.length - 8} more gurus` });
    }
  }

  return { status: 'pass', checks, duration: Date.now() - start };
}

// ─── Main Orchestrator ─────────────────────────────────────────────

const GROUP_ORDER = [
  'companyInfo',
  'financials',
  'splits',
  'prices',
  'insiders',
  'compensation',
  'analysts',
  'gurus',
];

const GROUP_LABELS = {
  companyInfo: 'Company Info',
  financials: 'Financial Statements',
  splits: 'Stock Splits',
  prices: 'Price Data',
  insiders: 'Insider Transactions',
  compensation: 'Executive Compensation',
  analysts: 'Analyst Estimates',
  gurus: 'Guru Holdings',
};

export { GROUP_ORDER, GROUP_LABELS };

export async function runTickerAudit(ticker, options = {}) {
  const { skipFrames = true, includeQuarterly = false, guruActivities = [], onProgress } = options;

  const groups = {};

  const report = (groupName, result) => {
    groups[groupName] = result;
    if (onProgress) onProgress(groupName, result.status);
  };

  // Run sequentially to respect SEC rate limits and show progress
  report('companyInfo', await checkCompanyInfo(ticker));

  // If CIK failed, skip EDGAR-dependent checks
  const cikFailed = groups.companyInfo.status === 'fail';

  if (!cikFailed) {
    report('financials', await checkFinancialStatements(ticker, { skipFrames, includeQuarterly }));
    report('splits', await checkSplits(ticker));
  } else {
    report('financials', { status: 'skip', checks: [{ name: 'Skipped', status: 'skip', detail: 'CIK resolution failed' }], duration: 0 });
    report('splits', { status: 'skip', checks: [{ name: 'Skipped', status: 'skip', detail: 'CIK resolution failed' }], duration: 0 });
  }

  report('prices', await checkPriceData(ticker));

  if (!cikFailed) {
    report('insiders', await checkInsiders(ticker));
    report('compensation', await checkCompensation(ticker));
  } else {
    report('insiders', { status: 'skip', checks: [{ name: 'Skipped', status: 'skip', detail: 'CIK resolution failed' }], duration: 0 });
    report('compensation', { status: 'skip', checks: [{ name: 'Skipped', status: 'skip', detail: 'CIK resolution failed' }], duration: 0 });
  }

  report('analysts', await checkAnalystEstimates(ticker));
  report('gurus', checkGuruHoldings(ticker, guruActivities));

  // Overall status
  const statuses = GROUP_ORDER.map(g => groups[g]?.status).filter(s => s && s !== 'skip');
  let overall = 'PASS';
  if (statuses.some(s => s === 'fail')) overall = 'FAIL';
  else if (statuses.some(s => s === 'warn')) overall = 'WARNINGS';

  return {
    ticker: ticker.toUpperCase(),
    timestamp: new Date().toISOString(),
    overall,
    groups,
    totalDuration: GROUP_ORDER.reduce((sum, g) => sum + (groups[g]?.duration || 0), 0),
  };
}
