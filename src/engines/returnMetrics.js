// Return metrics — ROE, ROIC, ROA, debt ratios
// All computed from EDGAR financial statement data (single source of truth)

import { PERIODS } from './growthRates';

// ROE = Net Income / Total Equity
// ROIC = Net Income / (Total Equity + Long-Term Debt) — matches value investing Toolbox
// ROA = Net Income / Total Assets
// All return as decimals (0.15 = 15%)

export function computeReturnMetrics(statements) {
  const { years, income, balance } = statements;
  const sortedYears = [...years].sort((a, b) => a - b);

  const yearlyMetrics = [];

  for (const year of sortedYears) {
    const inc = income[year] || {};
    const bal = balance[year] || {};

    const netIncome = inc.net_income_loss;
    const equity = bal.equity_attributable_to_parent ?? bal.equity;
    const totalAssets = bal.assets;
    const ltDebt = bal.long_term_debt ?? 0;

    const roe = (netIncome && equity && equity !== 0)
      ? netIncome / equity : null;
    // ROIC = Net Income / (Equity + LT Debt) — NO cash subtraction
    // Matches Toolbox. Verified: AAPL pre-debt years show ROIC = ROE exactly.
    const roic = (netIncome && equity != null && (equity + ltDebt) !== 0)
      ? netIncome / (equity + ltDebt) : null;
    const roa = (netIncome && totalAssets && totalAssets !== 0)
      ? netIncome / totalAssets : null;

    yearlyMetrics.push({ year, roe, roic, roa, netIncome, equity, ltDebt, totalAssets });
  }

  // Compute averages over standard periods
  const latest = yearlyMetrics[yearlyMetrics.length - 1];
  if (!latest) return { yearly: [], averages: {} };

  const averages = {};
  for (const p of PERIODS) {
    const key = `${p}yr`;
    const cutoff = latest.year - p;
    const subset = yearlyMetrics.filter(m => m.year > cutoff);

    const avg = (field) => {
      const vals = subset.map(m => m[field]).filter(v => v != null);
      return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    };

    averages[key] = {
      roe: avg('roe'),
      roic: avg('roic'),
      roa: avg('roa'),
    };
  }

  return { yearly: yearlyMetrics, averages };
}

// Debt metrics for value investing Management Score
// Uses EDGAR's pre-computed net_debt (traditional debt - cash, no leases)
// Net Debt to Earnings = Net Debt / Net Income (in years)
// Net Debt to FCF = Net Debt / FCF (in years)
export function computeDebtMetrics(statements) {
  const { years, income, balance, cashFlow } = statements;
  const sortedYears = [...years].sort((a, b) => b - a);
  const latestYear = sortedYears[0];
  if (!latestYear) return { netDebtToEarnings: null, netDebtToFCF: null, isNetCash: false };

  const bal = balance[latestYear] || {};
  const inc = income[latestYear] || {};
  const cf = cashFlow[latestYear] || {};

  const ltDebt = bal.long_term_debt ?? 0;
  const cash = bal.cash ?? 0;
  // Use EDGAR's pre-computed net_debt, fallback to manual calc
  const netDebt = bal.net_debt ?? (bal.total_debt ?? ltDebt) - cash;
  const netIncome = inc.net_income_loss;
  // FCF from EDGAR derived field, fallback to OpCF - CapEx
  const fcf = cf.free_cash_flow ?? (
    cf.net_cash_flow_from_operating_activities != null && cf.capital_expenditures != null
      ? cf.net_cash_flow_from_operating_activities - Math.abs(cf.capital_expenditures)
      : null
  );

  const isNetCash = netDebt <= 0;

  return {
    ltDebt,
    cash,
    netDebt,
    isNetCash,
    netDebtToEarnings: isNetCash ? 0 : (netIncome && netIncome > 0 ? netDebt / netIncome : null),
    netDebtToFCF: isNetCash ? 0 : (fcf && fcf > 0 ? netDebt / fcf : null),
  };
}

// FCF ratio = FCF / Net Income (used in PBT valuation)
// Exclude outlier years, compute average
export function computeFCFRatio(statements, excludeYears = new Set()) {
  const { years, income, cashFlow } = statements;
  const sortedYears = [...years].sort((a, b) => a - b);

  const ratios = [];
  for (const year of sortedYears) {
    if (excludeYears.has(year)) continue;
    const netIncome = income[year]?.net_income_loss;
    const cf = cashFlow[year] || {};
    const fcf = cf.free_cash_flow ?? (
      cf.net_cash_flow_from_operating_activities != null && cf.capital_expenditures != null
        ? cf.net_cash_flow_from_operating_activities - Math.abs(cf.capital_expenditures)
        : null
    );

    if (netIncome && netIncome > 0 && fcf != null) {
      ratios.push({ year, ratio: fcf / netIncome, fcf, netIncome });
    }
  }

  const avgRatio = ratios.length > 0
    ? ratios.reduce((s, r) => s + r.ratio, 0) / ratios.length
    : null;

  return { yearly: ratios, average: avgRatio };
}
