// Growth rate calculations — CAGR for multiple metrics across multiple periods
// Supports outlier year exclusion (e.g., COVID 2020, one-time charges)

// CAGR = (endValue / startValue)^(1/years) - 1
// For negative start values (e.g., negative earnings), CAGR is undefined
export function cagr(startValue, endValue, years) {
  if (!years || years <= 0) return null;
  if (startValue <= 0 || endValue <= 0) return null;
  return Math.pow(endValue / startValue, 1 / years) - 1;
}

// 1-year growth rate (simple % change)
export function yoyGrowth(oldValue, newValue) {
  if (!oldValue || oldValue === 0) return null;
  return (newValue - oldValue) / Math.abs(oldValue);
}

// Standard periods used by value investing Toolbox
export const PERIODS = [10, 7, 5, 3, 1];

// Compute CAGR for all standard periods from a time series
// series: [{ year, value }] sorted oldest→newest
// excludeYears: Set of years to skip (outliers)
// Returns { '10yr': rate, '7yr': rate, '5yr': rate, '3yr': rate, '1yr': rate }
export function computeGrowthRates(series, excludeYears = new Set()) {
  // Filter out excluded years
  const filtered = series.filter(d => !excludeYears.has(d.year));
  if (filtered.length < 2) return {};

  const latest = filtered[filtered.length - 1];
  const rates = {};

  for (const p of PERIODS) {
    const key = `${p}yr`;
    if (p === 1) {
      // 1-year is simple YoY growth from the prior data point
      if (filtered.length >= 2) {
        const prev = filtered[filtered.length - 2];
        rates[key] = yoyGrowth(prev.value, latest.value);
      } else {
        rates[key] = null;
      }
    } else {
      // Find the data point closest to p years ago
      const targetYear = latest.year - p;
      const start = findClosest(filtered, targetYear);
      if (start && start.year !== latest.year) {
        const actualYears = latest.year - start.year;
        rates[key] = cagr(start.value, latest.value, actualYears);
      } else {
        rates[key] = null;
      }
    }
  }

  return rates;
}

// Find the data point with year closest to targetYear
function findClosest(series, targetYear) {
  let best = null;
  let bestDist = Infinity;
  for (const d of series) {
    const dist = Math.abs(d.year - targetYear);
    if (dist < bestDist) {
      bestDist = dist;
      best = d;
    }
  }
  // Only accept if within 1 year of target
  if (best && bestDist <= 1) return best;
  return null;
}

// Compute 3-year smoothed growth rate for each year in a series.
// The "3 year Average Growth Rate" = arithmetic mean of 3 consecutive YoY growth rates.
// For year Y: mean(YoY_{Y-2}, YoY_{Y-1}, YoY_Y)
// This is NOT a 3-year CAGR — verified against value investing Toolbox screenshots.
// series: [{ year, value }] sorted oldest→newest
// Returns [{ year, rate }] where rate is the 3-year smoothed rate (as decimal, e.g. 0.10 = 10%)
export function compute3YearSmoothedRates(series) {
  const result = [];
  const yearMap = new Map(series.map(d => [d.year, d.value]));

  // First compute all YoY growth rates
  const yoyRates = new Map();
  for (const d of series) {
    const prevVal = yearMap.get(d.year - 1);
    if (prevVal != null && prevVal !== 0) {
      yoyRates.set(d.year, (d.value - prevVal) / Math.abs(prevVal));
    }
  }

  // Then compute 3-year average of YoY rates for each year
  for (const d of series) {
    const r0 = yoyRates.get(d.year);
    const r1 = yoyRates.get(d.year - 1);
    const r2 = yoyRates.get(d.year - 2);
    if (r0 != null && r1 != null && r2 != null) {
      result.push({ year: d.year, rate: (r0 + r1 + r2) / 3 });
    }
  }
  return result;
}

// Compute weighted average of 3-year smoothed growth rates.
// Uses linear recency weighting: oldest point gets weight 1, newest gets weight N.
// Limited to the 10 most recent smoothed rates to match Toolbox behavior — the Toolbox
// shows 13 years of raw data (→ 12 YoY rates → 10 smoothed rates) and computes the
// weighted average from exactly those 10 points. Without this limit, companies with
// longer EDGAR histories (e.g. AAPL back to 2009) include extra old data points that
// shift the weights and change the result.
// Formula: Σ(i × rate_i) / Σ(i) where i=1..N, Σ(i) = N(N+1)/2
export function computeWeightedAvgGrowthRate(smoothedRates, maxPoints = 10) {
  const valid = smoothedRates.filter(d => d.rate != null);
  const limited = maxPoints ? valid.slice(-maxPoints) : valid;
  if (limited.length === 0) return null;
  const n = limited.length;
  const weightSum = n * (n + 1) / 2;
  let weightedSum = 0;
  for (let i = 0; i < n; i++) {
    weightedSum += (i + 1) * limited[i].rate;
  }
  return weightedSum / weightSum;
}

// Build total-dollar series for Growth Rate Analysis tab data table + chart.
// Different from the scoring series: uses total dollars (not per-share), and
// Book Value Plus Dividends = equity + dividends paid that year (undoes dividend deduction).
export function buildGrowthAnalysisSeries(statements) {
  const { years, income, balance, cashFlow } = statements;
  const sortedYears = [...years].sort((a, b) => a - b);

  const buildSeries = (stmtMap, field) =>
    sortedYears
      .map(y => ({ year: y, value: stmtMap[y]?.[field] ?? null }))
      .filter(d => d.value !== null);

  // Book Value = total equity
  const bookValueSeries = sortedYears
    .map(y => {
      const equity = balance[y]?.equity_attributable_to_parent ?? balance[y]?.equity;
      return { year: y, value: equity ?? null };
    })
    .filter(d => d.value !== null);

  // Book Value Plus Dividends = equity + abs(dividends_paid) for that year
  // This undoes the dividend deduction from retained earnings, showing total value created
  const bvPlusDivSeries = sortedYears
    .map(y => {
      const equity = balance[y]?.equity_attributable_to_parent ?? balance[y]?.equity;
      const divPaid = Math.abs(cashFlow[y]?.dividends_paid ?? 0);
      return { year: y, value: equity != null ? equity + divPaid : null };
    })
    .filter(d => d.value !== null);

  const earningsSeries = buildSeries(income, 'net_income_loss');
  const opCashSeries = buildSeries(cashFlow, 'net_cash_flow_from_operating_activities');
  const revenueSeries = buildSeries(income, 'revenues');

  let fcfSeries = buildSeries(cashFlow, 'free_cash_flow');
  if (fcfSeries.length === 0) {
    for (const y of sortedYears) {
      const cf = cashFlow[y] || {};
      const opCF = cf.net_cash_flow_from_operating_activities;
      const capEx = cf.capital_expenditures;
      if (opCF != null && capEx != null) {
        fcfSeries.push({ year: y, value: opCF - Math.abs(capEx) });
      }
    }
  }

  // Retained Earnings
  const retainedEarningsSeries = buildSeries(balance, 'retained_earnings');

  // Pre-Tax Earnings (income before tax)
  const pretaxEarningsSeries = buildSeries(income, 'income_before_tax');

  // Market Cap needs price data — computed externally (needs year-end prices)

  return {
    bookValue: bookValueSeries,
    bvPlusDiv: bvPlusDivSeries,
    earnings: earningsSeries,
    pretaxEarnings: pretaxEarningsSeries,
    operatingCash: opCashSeries,
    revenue: revenueSeries,
    fcf: fcfSeries,
    retainedEarnings: retainedEarningsSeries,
  };
}

// Compute growth rates for all 6 Moat metrics from EDGAR financial statements.
// statements: output of fetchEdgarStatements() — { years, income, balance, cashFlow }
// excludeYears: Set of years to exclude (outliers)
export function computeAllGrowthRates(statements, excludeYears = new Set()) {
  const { years, income, balance, cashFlow } = statements;
  const sortedYears = [...years].sort((a, b) => a - b);

  // Helper to build series from statement data
  const buildSeries = (stmtMap, field) =>
    sortedYears
      .map(y => ({ year: y, value: stmtMap[y]?.[field] ?? null }))
      .filter(d => d.value !== null);

  // 1. BVPS + Dividends + Buybacks growth — cumulative composite metric
  //    Tracks total value creation per share: book value + all dividends returned
  //    + all buyback value returned. This prevents companies with heavy buybacks
  //    (like AAPL) from showing negative BVPS growth when they're actually
  //    creating enormous shareholder value.
  const bvpsSeries = [];
  let cumulativeDivPerShare = 0;
  let cumulativeBBPerShare = 0;

  for (const year of sortedYears) {
    const bal = balance[year] || {};
    const inc = income[year] || {};
    const cf = cashFlow[year] || {};

    const equity = bal.equity_attributable_to_parent ?? bal.equity;
    // Prefer EOP shares outstanding for BVPS (point-in-time equity / point-in-time shares)
    const shares = bal.shares_outstanding ?? inc.basic_average_shares;

    if (equity != null && shares && shares > 0) {
      const bvps = equity / shares;

      // Accumulate dividends per share (already split-adjusted from EDGAR)
      cumulativeDivPerShare += (inc.dividends_per_share ?? 0);

      // Accumulate buyback value per share = |share_repurchases| / shares_outstanding
      const repurchases = Math.abs(cf.share_repurchases ?? 0);
      cumulativeBBPerShare += repurchases / shares;

      bvpsSeries.push({ year, value: bvps + cumulativeDivPerShare + cumulativeBBPerShare });
    }
  }

  // 2. Earnings growth (total Net Income, not per-share EPS)
  //    value investing Toolbox uses total Net Income for "Earnings Growth".
  //    EPS grows faster than Net Income when companies buy back shares (e.g., AAPL),
  //    so using EPS would overstate growth and inflate the Moat Score.
  const earningsSeries = buildSeries(income, 'net_income_loss');

  // 3. Revenue growth (total dollars, not per share — no split-adjustment needed)
  const revenueSeries = buildSeries(income, 'revenues');

  // 4. Operating Cash Flow growth (total dollars)
  const opCashSeries = buildSeries(cashFlow, 'net_cash_flow_from_operating_activities');

  // 5. Free Cash Flow growth
  //    Use EDGAR's pre-computed derived field, fallback to OpCF - CapEx
  let fcfSeries = buildSeries(cashFlow, 'free_cash_flow');
  if (fcfSeries.length === 0) {
    for (const year of sortedYears) {
      const cf = cashFlow[year] || {};
      const opCF = cf.net_cash_flow_from_operating_activities;
      const capEx = cf.capital_expenditures;
      if (opCF != null && capEx != null) {
        fcfSeries.push({ year, value: opCF - Math.abs(capEx) });
      }
    }
  }

  // 6. Retained Earnings growth
  const retainedEarningsSeries = buildSeries(balance, 'retained_earnings');

  return {
    bvps: computeGrowthRates(bvpsSeries, excludeYears),
    earnings: computeGrowthRates(earningsSeries, excludeYears),
    revenue: computeGrowthRates(revenueSeries, excludeYears),
    operatingCash: computeGrowthRates(opCashSeries, excludeYears),
    fcf: computeGrowthRates(fcfSeries, excludeYears),
    retainedEarnings: computeGrowthRates(retainedEarningsSeries, excludeYears),
    // Raw series for charts
    _series: { bvps: bvpsSeries, earnings: earningsSeries, revenue: revenueSeries, operatingCash: opCashSeries, fcf: fcfSeries, retainedEarnings: retainedEarningsSeries },
  };
}
