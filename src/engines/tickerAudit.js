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

// ─── XBRL Coverage Dashboard ─────────────────────────────────────────

// Tier mapping — which fields are scoring-critical (1), display (2), or expanded (3)
// Mirrors validation/scripts/coverage-audit.js TAXONOMY tiers
const FIELD_TIERS = {
  // Tier 1: Scoring-Critical
  revenues: 1, operating_income_loss: 1, net_income_loss: 1, basic_earnings_per_share: 1,
  diluted_earnings_per_share: 1, basic_average_shares: 1, diluted_average_shares: 1,
  dividends_per_share: 1, income_tax: 1, cash: 1, long_term_debt: 1, short_term_debt: 1,
  current_portion_lt_debt: 1, equity: 1, retained_earnings: 1, shares_outstanding: 1,
  assets: 1, liabilities: 1, net_cash_flow_from_operating_activities: 1,
  capital_expenditures: 1, depreciation_amortization: 1, dividends_paid: 1, share_repurchases: 1,
  // Tier 2: Display
  cost_of_revenue: 2, gross_profit: 2, sga: 2, research_and_development: 2,
  depreciation_amortization_is: 2, operating_expenses: 2, interest_expense: 2,
  income_before_tax: 2, accounts_receivable: 2, inventory: 2, current_assets: 2,
  property_plant_equipment: 2, goodwill: 2, intangible_assets: 2, current_liabilities: 2,
  additional_paid_in_capital: 2, common_stock: 2, aoci: 2, treasury_stock: 2,
  liabilities_and_equity: 2, operating_lease_rou_asset: 2, operating_lease_liability_current: 2,
  operating_lease_liability_noncurrent: 2, stock_based_compensation: 2, deferred_income_tax: 2,
  change_in_receivables: 2, change_in_inventory: 2, change_in_payables: 2,
  net_cash_flow_from_investing_activities: 2, net_cash_flow_from_financing_activities: 2,
  proceeds_from_lt_debt: 2, repayments_of_lt_debt: 2,
  // Tier 3: Expanded
  other_operating_expenses: 3, interest_income: 3, net_interest_income: 3,
  other_income_expense: 3, income_from_continuing_operations: 3, short_term_investments: 3,
  prepaid_expenses: 3, other_current_assets: 3, property_plant_equipment_gross: 3,
  accumulated_depreciation: 3, long_term_investments: 3, deferred_tax_assets: 3,
  other_noncurrent_assets: 3, accounts_payable: 3, accrued_liabilities: 3,
  deferred_revenue_current: 3, other_current_liabilities: 3, deferred_tax_liabilities: 3,
  pension_liabilities: 3, other_noncurrent_liabilities: 3, noncurrent_liabilities: 3,
  minority_interest: 3, other_noncash_items: 3, change_in_other_working_capital: 3,
  sale_of_ppe: 3, purchase_of_investments: 3, sale_of_investments: 3, purchase_of_business: 3,
  proceeds_from_stock_issuance: 3, effect_of_exchange_rate: 3,
};

// Human-readable field labels
const FIELD_LABELS = {
  revenues: 'Revenue', cost_of_revenue: 'Cost of Revenue', gross_profit: 'Gross Profit',
  sga: 'SG&A', selling_expense: 'Selling Expense', general_and_admin_expense: 'G&A Expense',
  research_and_development: 'R&D', depreciation_amortization_is: 'D&A (IS)',
  other_operating_expenses: 'Other Operating Exp', operating_expenses: 'Operating Expenses',
  operating_income_loss: 'Operating Income', interest_income: 'Interest Income',
  interest_expense: 'Interest Expense', net_interest_income: 'Net Interest Income',
  other_income_expense: 'Other Income/Expense', income_before_tax: 'Pre-Tax Income',
  income_tax: 'Income Tax', income_from_continuing_operations: 'Continuing Ops Income',
  net_income_loss: 'Net Income', net_income_including_nci: 'Net Income (incl NCI)',
  basic_earnings_per_share: 'Basic EPS', diluted_earnings_per_share: 'Diluted EPS',
  basic_average_shares: 'Basic Shares', diluted_average_shares: 'Diluted Shares',
  dividends_per_share: 'Dividends/Share', cash: 'Cash & Equivalents',
  short_term_investments: 'Short-Term Investments', accounts_receivable: 'Accounts Receivable',
  inventory: 'Inventory', prepaid_expenses: 'Prepaid Expenses',
  other_current_assets: 'Other Current Assets', current_assets: 'Current Assets',
  property_plant_equipment_gross: 'PP&E (Gross)', accumulated_depreciation: 'Accum. Depreciation',
  property_plant_equipment: 'PP&E (Net)', operating_lease_rou_asset: 'ROU Asset',
  goodwill: 'Goodwill', intangible_assets: 'Intangible Assets',
  long_term_investments: 'Long-Term Investments', deferred_tax_assets: 'Deferred Tax Assets',
  other_noncurrent_assets: 'Other NC Assets', assets: 'Total Assets',
  accounts_payable: 'Accounts Payable', accrued_liabilities: 'Accrued Liabilities',
  short_term_debt: 'Short-Term Debt', current_portion_lt_debt: 'Current Portion LT Debt',
  operating_lease_liability_current: 'Lease Liability (Current)',
  deferred_revenue_current: 'Deferred Revenue (Current)',
  other_current_liabilities: 'Other Current Liabilities', current_liabilities: 'Current Liabilities',
  long_term_debt: 'Long-Term Debt',
  operating_lease_liability_noncurrent: 'Lease Liability (NC)',
  deferred_tax_liabilities: 'Deferred Tax Liabilities', pension_liabilities: 'Pension Liabilities',
  other_noncurrent_liabilities: 'Other NC Liabilities', noncurrent_liabilities: 'NC Liabilities',
  liabilities: 'Total Liabilities', liabilities_and_equity: 'Liabilities + Equity',
  common_stock: 'Common Stock', additional_paid_in_capital: 'APIC',
  retained_earnings: 'Retained Earnings', aoci: 'AOCI', treasury_stock: 'Treasury Stock',
  equity: 'Equity', minority_interest: 'Minority Interest',
  shares_outstanding: 'Shares Outstanding',
  net_cash_flow_from_operating_activities: 'Operating Cash Flow',
  depreciation_amortization: 'D&A (CF)', stock_based_compensation: 'Stock-Based Comp',
  deferred_income_tax: 'Deferred Tax', other_noncash_items: 'Other Non-Cash',
  change_in_receivables: 'Change in Receivables', change_in_inventory: 'Change in Inventory',
  change_in_payables: 'Change in Payables', change_in_other_working_capital: 'Change in Other WC',
  capital_expenditures: 'CapEx', sale_of_ppe: 'Sale of PP&E',
  purchase_of_investments: 'Purchase Investments', sale_of_investments: 'Sale Investments',
  purchase_of_business: 'Acquisitions',
  net_cash_flow_from_investing_activities: 'Investing Cash Flow',
  proceeds_from_lt_debt: 'LT Debt Proceeds', repayments_of_lt_debt: 'LT Debt Repayments',
  share_repurchases: 'Share Repurchases', proceeds_from_stock_issuance: 'Stock Issuance',
  dividends_paid: 'Dividends Paid',
  net_cash_flow_from_financing_activities: 'Financing Cash Flow',
  effect_of_exchange_rate: 'FX Effect',
  // Expanded balance sheet sub-items
  cash_only: 'Cash Only', cash_equivalents: 'Cash Equivalents',
  cash_and_short_term_investments: 'Cash & ST Investments',
  accounts_receivable_gross: 'Receivables (Gross)', allowance_doubtful_accounts: 'Allowance Doubtful Accts',
  vendor_receivables: 'Vendor Receivables', receivables_broad: 'Receivables (Broad)',
  ppe_land: 'PP&E: Land', ppe_buildings: 'PP&E: Buildings', ppe_machinery: 'PP&E: Machinery',
  ppe_leasehold: 'PP&E: Leasehold', ppe_other: 'PP&E: Other', ppe_construction: 'PP&E: Construction',
  available_for_sale_securities: 'AFS Securities',
  equity_attributable_to_parent: 'Equity (Parent)', preferred_stock: 'Preferred Stock',
  treasury_shares: 'Treasury Shares',
  finance_lease_liability_current: 'Finance Lease (Current)',
  finance_lease_liability_noncurrent: 'Finance Lease (NC)',
  deferred_revenue_noncurrent: 'Deferred Revenue (NC)',
  long_term_debt_and_leases: 'LT Debt & Leases',
  // Expanded cash flow sub-items
  depreciation_only: 'Depreciation Only', amortization_of_intangibles: 'Amortization (Intangibles)',
  proceeds_from_st_debt: 'ST Debt Proceeds', repayments_of_st_debt: 'ST Debt Repayments',
  finance_lease_payments: 'Finance Lease Payments', other_financing: 'Other Financing',
  interest_paid: 'Interest Paid', income_taxes_paid: 'Taxes Paid',
  sale_of_business: 'Sale of Business', purchase_of_intangibles: 'Purchase Intangibles',
  other_investing: 'Other Investing',
  // Derived fields
  free_cash_flow: 'Free Cash Flow', total_debt: 'Total Debt',
  total_debt_with_leases: 'Total Debt (w/ Leases)', net_debt: 'Net Debt',
  ebit: 'EBIT', ebitda: 'EBITDA', total_expenses: 'Total Expenses',
  effective_tax_rate: 'Effective Tax Rate',
  cash_and_marketable_securities: 'Cash & Marketable Securities',
  total_receivables: 'Total Receivables', noncurrent_assets: 'Non-Current Assets',
  payables_and_accrued: 'Payables & Accrued',
  short_term_debt_and_leases: 'ST Debt & Leases', lt_debt_and_leases_noncurrent: 'LT Debt & Leases (NC)',
  working_capital: 'Working Capital', invested_capital: 'Invested Capital',
  net_tangible_assets: 'Net Tangible Assets', total_capitalization: 'Total Capitalization',
  net_investments: 'Net Investments', net_debt_issuance: 'Net Debt Issuance',
  net_common_stock: 'Net Common Stock', change_in_working_capital: 'Change in Working Capital',
  net_change_in_cash: 'Net Change in Cash',
  capital_expenditures_net: 'CapEx (Net)', purchase_sale_of_business_net: 'Acquisitions (Net)',
  net_lt_debt_issuance: 'Net LT Debt Issuance', net_st_debt_issuance: 'Net ST Debt Issuance',
  ending_cash_position: 'Ending Cash', beginning_cash_position: 'Beginning Cash',
  // Bank overlay fields
  net_interest_income_bank: 'Net Interest Income (Bank)',
  interest_income_operating: 'Interest Income (Operating)',
  interest_income_loans: 'Interest Income (Loans)',
  interest_income_investments: 'Interest Income (Investments)',
  interest_income_deposits: 'Interest Income (Deposits)',
  interest_expense_operating: 'Interest Expense (Operating)',
  interest_expense_deposits: 'Interest Expense (Deposits)',
  interest_expense_borrowings: 'Interest Expense (Borrowings)',
  net_interest_income_after_provision: 'NII After Provision',
  provision_for_credit_losses: 'Provision for Credit Losses',
  noninterest_income: 'Non-Interest Income', noninterest_expense: 'Non-Interest Expense',
  trading_revenue: 'Trading Revenue', investment_banking_revenue: 'Investment Banking',
  asset_management_fees: 'Asset Management Fees', compensation_expense: 'Compensation Expense',
  loans_net: 'Loans (Net)', loans_gross: 'Loans (Gross)',
  allowance_for_loan_losses: 'Allowance for Loan Losses',
  deposits: 'Total Deposits', deposits_interest_bearing: 'Deposits (Interest-Bearing)',
  deposits_noninterest_bearing: 'Deposits (Non-Interest)',
  investment_securities: 'Investment Securities',
  fed_funds_sold: 'Fed Funds Sold', fed_funds_purchased: 'Fed Funds Purchased',
  cash_due_from_banks: 'Cash Due from Banks',
  interest_bearing_deposits_in_banks: 'Deposits at Other Banks',
  efficiency_ratio: 'Efficiency Ratio', loan_to_deposit_ratio: 'Loan-to-Deposit',
  net_interest_margin: 'NIM', provision_to_loans: 'Provision/Loans',
  // REIT overlay fields
  property_operating_costs: 'Property Operating Costs',
  gain_loss_on_real_estate_sales: 'Gain/Loss on RE Sales',
  impairment_of_real_estate: 'RE Impairment', equity_method_income: 'Equity Method Income',
  real_estate_investment_net: 'RE Investment (Net)', real_estate_investment_gross: 'RE Investment (Gross)',
  real_estate_accumulated_depreciation: 'RE Accum. Depreciation',
  land_available_for_development: 'Land for Development',
  unconsolidated_jv_investments: 'JV Investments',
  in_place_lease_intangibles: 'In-Place Lease Intangibles',
  below_market_lease_liability: 'Below-Market Lease Liability',
  nci_operating_partnership: 'NCI (OP Units)',
  payments_to_acquire_real_estate: 'RE Acquisitions',
  payments_to_develop_real_estate: 'RE Development',
  proceeds_from_real_estate_sales: 'RE Sale Proceeds',
  equity_method_distributions: 'JV Distributions',
  ffo: 'FFO', ffo_per_share: 'FFO/Share', affo: 'AFFO', noi: 'NOI',
  nav_book: 'NAV (Book)', nav_per_share: 'NAV/Share',
  // Insurance overlay fields
  premiums_earned_net: 'Net Premiums Earned', premiums_written_net: 'Net Premiums Written',
  premiums_direct: 'Direct Premiums', premiums_assumed: 'Assumed Premiums',
  premiums_ceded: 'Ceded Premiums', net_investment_income: 'Net Investment Income',
  policyholder_benefits_and_claims: 'Claims & Benefits',
  benefits_claims_settlement: 'Benefits & Settlement',
  insurance_commissions: 'Insurance Commissions',
  insurance_other_operating_expense: 'Insurance Operating Exp',
  policyholder_dividends: 'Policyholder Dividends',
  interest_credited_to_policyholders: 'Interest to Policyholders',
  future_policy_benefits: 'Future Policy Benefits',
  unpaid_claims_reserves: 'Unpaid Claims Reserves', unearned_premiums: 'Unearned Premiums',
  policyholder_contract_deposits: 'Policyholder Deposits',
  deferred_policy_acquisition_costs: 'Deferred Acquisition Costs',
  reinsurance_recoverables: 'Reinsurance Recoverables', premiums_receivable: 'Premiums Receivable',
  change_in_claims_reserves: 'Change in Claims Reserves',
  change_in_unearned_premiums: 'Change in Unearned Premiums',
  change_in_insurance_liabilities: 'Change in Insurance Liabilities',
  loss_ratio: 'Loss Ratio', expense_ratio: 'Expense Ratio', combined_ratio: 'Combined Ratio',
  insurance_float: 'Insurance Float',
};

export { FIELD_TIERS, FIELD_LABELS };

// ─── Coverage Monitor (Baseline Storage + Comparison) ──────────────

const BASELINE_PREFIX = 'sa-coverage-baseline:';

/**
 * Save a coverage baseline snapshot for a ticker.
 * Shape: { ticker, savedAt, latestYear, industryType, fields: { [field]: { tag, layer, derived, tier } } }
 */
export function saveCoverageBaseline(ticker, fieldDetails, industryType, latestYear) {
  const key = BASELINE_PREFIX + ticker.toUpperCase();
  const fields = {};
  for (const d of fieldDetails) {
    fields[d.field] = { tag: d.tag || null, layer: d.layer, derived: !!d.derived, tier: d.tier };
  }
  const baseline = { ticker: ticker.toUpperCase(), savedAt: new Date().toISOString(), latestYear, industryType, fields };
  try {
    localStorage.setItem(key, JSON.stringify(baseline));
  } catch { /* localStorage full — non-critical */ }
  return baseline;
}

/** Load a previously saved coverage baseline for a ticker. Returns null if none exists. */
export function loadCoverageBaseline(ticker) {
  const key = BASELINE_PREFIX + ticker.toUpperCase();
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Remove the coverage baseline for a ticker. */
export function clearCoverageBaseline(ticker) {
  const key = BASELINE_PREFIX + ticker.toUpperCase();
  try { localStorage.removeItem(key); } catch {}
}

/**
 * Compare current field details against a saved baseline.
 * Returns { fieldsGained, fieldsLost, tagsChanged, tierDeltas, baselineSavedAt }.
 */
export function compareCoverage(currentFieldDetails, baseline) {
  if (!baseline || !baseline.fields) return null;

  const currentMap = {};
  for (const d of currentFieldDetails) {
    currentMap[d.field] = { tag: d.tag || null, layer: d.layer, derived: !!d.derived, tier: d.tier, label: d.label };
  }

  const baseFields = baseline.fields;
  const fieldsGained = []; // in current but not in baseline
  const fieldsLost = [];   // in baseline but not in current
  const tagsChanged = [];  // same field, different tag or layer

  // Fields gained
  for (const field of Object.keys(currentMap)) {
    if (!baseFields[field]) {
      const c = currentMap[field];
      fieldsGained.push({ field, label: c.label, tag: c.tag, layer: c.layer, tier: c.tier, derived: c.derived });
    }
  }

  // Fields lost
  for (const field of Object.keys(baseFields)) {
    if (!currentMap[field]) {
      const b = baseFields[field];
      const label = FIELD_LABELS[field] || field.replace(/_/g, ' ');
      fieldsLost.push({ field, label, tag: b.tag, layer: b.layer, tier: b.tier, derived: b.derived });
    }
  }

  // Tag/layer changes
  for (const field of Object.keys(currentMap)) {
    if (!baseFields[field]) continue;
    const c = currentMap[field];
    const b = baseFields[field];
    if (c.tag !== b.tag || c.layer !== b.layer || c.derived !== b.derived) {
      tagsChanged.push({
        field,
        label: c.label,
        tier: c.tier,
        oldTag: b.tag, newTag: c.tag,
        oldLayer: b.layer, newLayer: c.layer,
        oldDerived: b.derived, newDerived: c.derived,
      });
    }
  }

  // Tier-level coverage deltas
  const tierDeltas = {};
  for (const tier of [1, 2, 3]) {
    const currentCount = currentFieldDetails.filter(d => d.tier === tier).length;
    const baseCount = Object.values(baseFields).filter(b => b.tier === tier).length;
    tierDeltas[tier] = currentCount - baseCount;
  }

  return {
    fieldsGained,
    fieldsLost,
    tagsChanged,
    tierDeltas,
    baselineSavedAt: baseline.savedAt,
    hasChanges: fieldsGained.length > 0 || fieldsLost.length > 0 || tagsChanged.length > 0,
  };
}

async function checkCoverage(ticker) {
  const checks = [];
  const start = Date.now();

  try {
    const statements = await fetchEdgarStatements(ticker);
    if (!statements || !statements.years || statements.years.length === 0) {
      checks.push({ name: 'Coverage', status: 'fail', detail: 'No financial statement data' });
      return { status: 'fail', checks, duration: Date.now() - start };
    }

    const { provenance, years, industryType } = statements;
    const latestYear = years[0];

    // Collect all fields with provenance for latest year
    const fieldDetails = [];
    let tier1Total = 0, tier1Resolved = 0;
    let tier2Total = 0, tier2Resolved = 0;
    let tier3Total = 0, tier3Resolved = 0;
    let layer1Count = 0, layer2Count = 0, derivedCount = 0;
    const overlayFields = [];

    // Process all three statement sections
    for (const [section, sectionName] of [['income', 'Income'], ['balance', 'Balance Sheet'], ['cashFlow', 'Cash Flow']]) {
      const prov = provenance?.[section];
      if (!prov) continue;

      const latestProv = prov[latestYear] || {};

      for (const [field, meta] of Object.entries(latestProv)) {
        const tier = FIELD_TIERS[field] || 0;
        const label = FIELD_LABELS[field] || field.replace(/_/g, ' ');

        const detail = {
          field,
          label,
          section: sectionName,
          tier,
          tag: meta.tag,
          layer: meta.layer,
          derived: meta.derived,
        };

        fieldDetails.push(detail);

        // Count by tier
        if (tier === 1) { tier1Total++; tier1Resolved++; }
        else if (tier === 2) { tier2Total++; tier2Resolved++; }
        else if (tier === 3) { tier3Total++; tier3Resolved++; }

        // Count by layer
        if (meta.derived) derivedCount++;
        else if (meta.layer === 2) layer2Count++;
        else layer1Count++;

        // Track overlay fields (tier 0 = overlay-specific)
        if (tier === 0) overlayFields.push(detail);
      }
    }

    // Count expected tier fields that are missing
    for (const [field, tier] of Object.entries(FIELD_TIERS)) {
      const found = fieldDetails.some(d => d.field === field);
      if (!found) {
        if (tier === 1) tier1Total++;
        else if (tier === 2) tier2Total++;
        else if (tier === 3) tier3Total++;
      }
    }

    const tier1Pct = tier1Total > 0 ? Math.round(tier1Resolved / tier1Total * 100) : 100;
    const tier2Pct = tier2Total > 0 ? Math.round(tier2Resolved / tier2Total * 100) : 100;
    const tier3Pct = tier3Total > 0 ? Math.round(tier3Resolved / tier3Total * 100) : 100;
    const totalResolved = tier1Resolved + tier2Resolved + tier3Resolved;
    const totalExpected = tier1Total + tier2Total + tier3Total;
    const totalPct = totalExpected > 0 ? Math.round(totalResolved / totalExpected * 100) : 100;

    // ─── Coverage Monitor: compare against baseline ──────────────
    const baseline = loadCoverageBaseline(ticker);
    const delta = compareCoverage(fieldDetails, baseline);

    // Auto-save baseline on first load (no existing baseline)
    if (!baseline) {
      saveCoverageBaseline(ticker, fieldDetails, industryType, latestYear);
    }

    // Industry type check
    checks.push({
      name: 'Industry Type',
      status: 'pass',
      detail: industryType === 'standard' ? 'Standard' : `${industryType.charAt(0).toUpperCase() + industryType.slice(1)} (overlay active)`,
    });

    // Tier coverage checks
    checks.push({
      name: 'Tier 1 Coverage (Scoring-Critical)',
      status: tier1Pct >= 95 ? 'pass' : tier1Pct >= 85 ? 'warn' : 'fail',
      detail: `${tier1Resolved}/${tier1Total} fields (${tier1Pct}%)`,
    });
    checks.push({
      name: 'Tier 2 Coverage (Display)',
      status: tier2Pct >= 85 ? 'pass' : tier2Pct >= 70 ? 'warn' : 'fail',
      detail: `${tier2Resolved}/${tier2Total} fields (${tier2Pct}%)`,
    });
    checks.push({
      name: 'Tier 3 Coverage (Expanded)',
      status: tier3Pct >= 70 ? 'pass' : tier3Pct >= 50 ? 'warn' : 'fail',
      detail: `${tier3Resolved}/${tier3Total} fields (${tier3Pct}%)`,
    });

    // Resolution breakdown
    checks.push({
      name: 'Resolution Breakdown',
      status: 'pass',
      detail: `Layer 1: ${layer1Count} · Layer 2: ${layer2Count} · Derived: ${derivedCount}`,
    });

    // Overlay fields
    if (overlayFields.length > 0) {
      checks.push({
        name: `${industryType.charAt(0).toUpperCase() + industryType.slice(1)} Overlay Fields`,
        status: 'pass',
        detail: `${overlayFields.length} industry-specific fields extracted`,
      });
    }

    // Coverage monitor checks (if baseline exists)
    if (delta && delta.hasChanges) {
      if (delta.fieldsGained.length > 0) {
        const t1Gains = delta.fieldsGained.filter(f => f.tier === 1).length;
        checks.push({
          name: 'Fields Gained',
          status: 'pass',
          detail: `+${delta.fieldsGained.length} field${delta.fieldsGained.length !== 1 ? 's' : ''} since baseline${t1Gains > 0 ? ` (${t1Gains} Tier 1)` : ''}`,
        });
      }
      if (delta.fieldsLost.length > 0) {
        const t1Losses = delta.fieldsLost.filter(f => f.tier === 1).length;
        checks.push({
          name: 'Fields Lost',
          status: t1Losses > 0 ? 'fail' : 'warn',
          detail: `-${delta.fieldsLost.length} field${delta.fieldsLost.length !== 1 ? 's' : ''} since baseline${t1Losses > 0 ? ` (${t1Losses} Tier 1!)` : ''}`,
        });
      }
      if (delta.tagsChanged.length > 0) {
        checks.push({
          name: 'Tags Changed',
          status: 'warn',
          detail: `${delta.tagsChanged.length} field${delta.tagsChanged.length !== 1 ? 's' : ''} resolved by different tags since baseline`,
        });
      }
    } else if (baseline) {
      checks.push({
        name: 'Coverage Monitor',
        status: 'pass',
        detail: `No changes since baseline (${new Date(baseline.savedAt).toLocaleDateString()})`,
      });
    }

    // Tag stability — check if the same tag resolves across all years
    let stableCount = 0, unstableCount = 0;
    for (const [section] of [['income'], ['balance'], ['cashFlow']]) {
      const prov = provenance?.[section];
      if (!prov) continue;
      const fieldsInLatest = prov[latestYear] ? Object.keys(prov[latestYear]) : [];
      for (const field of fieldsInLatest) {
        const tags = new Set();
        for (const yr of years) {
          const tag = prov[yr]?.[field]?.tag;
          if (tag) tags.add(tag);
        }
        if (tags.size <= 1) stableCount++;
        else unstableCount++;
      }
    }
    if (unstableCount > 0) {
      checks.push({
        name: 'Tag Stability',
        status: unstableCount <= 3 ? 'warn' : 'fail',
        detail: `${unstableCount} field${unstableCount !== 1 ? 's' : ''} resolved by different tags across years (${stableCount} stable)`,
      });
    } else {
      checks.push({
        name: 'Tag Stability',
        status: 'pass',
        detail: `All ${stableCount} fields resolve consistently across years`,
      });
    }

    const hasFail = checks.some(c => c.status === 'fail');
    const hasWarn = checks.some(c => c.status === 'warn');

    return {
      status: hasFail ? 'fail' : hasWarn ? 'warn' : 'pass',
      checks,
      duration: Date.now() - start,
      // Extra structured data for the coverage dashboard renderer
      coverageData: {
        industryType,
        latestYear,
        years,
        fieldDetails: fieldDetails.sort((a, b) => (a.tier || 99) - (b.tier || 99) || a.section.localeCompare(b.section) || a.field.localeCompare(b.field)),
        tiers: { tier1: { resolved: tier1Resolved, total: tier1Total, pct: tier1Pct }, tier2: { resolved: tier2Resolved, total: tier2Total, pct: tier2Pct }, tier3: { resolved: tier3Resolved, total: tier3Total, pct: tier3Pct } },
        layers: { layer1: layer1Count, layer2: layer2Count, derived: derivedCount },
        overlayFields,
        totalResolved, totalExpected, totalPct,
        delta,
      },
    };
  } catch (err) {
    checks.push({ name: 'Error', status: 'fail', detail: err.message });
    return { status: 'fail', checks, duration: Date.now() - start };
  }
}

// ─── Main Orchestrator ─────────────────────────────────────────────

const GROUP_ORDER = [
  'companyInfo',
  'financials',
  'coverage',
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
  coverage: 'XBRL Coverage',
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
    report('coverage', await checkCoverage(ticker));
    report('splits', await checkSplits(ticker));
  } else {
    report('financials', { status: 'skip', checks: [{ name: 'Skipped', status: 'skip', detail: 'CIK resolution failed' }], duration: 0 });
    report('coverage', { status: 'skip', checks: [{ name: 'Skipped', status: 'skip', detail: 'CIK resolution failed' }], duration: 0 });
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
