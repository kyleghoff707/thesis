// Free Cash Flow calculation engine
// FCF = Cash Flow from Operating Activities - Capital Expenditures
//
// Now uses EDGAR statements directly (single source of truth).
// EDGAR's edgarFinancials.js already computes free_cash_flow as a derived field,
// but this engine provides the structured yearly breakdown needed by other components.

// Compute FCF for each year from EDGAR statements
// statements: output of fetchEdgarStatements() — { years, income, balance, cashFlow }
export function computeFreeCashFlow(statements) {
  const { years, cashFlow } = statements;
  const sortedYears = [...years].sort((a, b) => a - b);

  const yearly = [];

  for (const year of sortedYears) {
    const cf = cashFlow[year] || {};
    const operatingCF = cf.net_cash_flow_from_operating_activities;
    const capEx = cf.capital_expenditures != null ? Math.abs(cf.capital_expenditures) : null;
    // Prefer EDGAR's pre-computed derived field, fallback to manual calc
    const fcf = cf.free_cash_flow ?? (operatingCF != null && capEx != null ? operatingCF - capEx : null);

    yearly.push({
      year,
      operatingCF,
      capEx,
      fcf,
      source: capEx != null ? 'edgar' : 'none',
    });
  }

  return {
    yearly,
    capExSource: yearly.some(d => d.source === 'edgar') ? 'edgar' : 'none',
    // Convenience: FCF series for growth rate calculations and charts
    series: yearly
      .filter(d => d.fcf != null)
      .map(d => ({ year: d.year, value: d.fcf })),
  };
}

// Get FCF for the most recent available year
export function getLatestFCF(fcfResult) {
  const valid = fcfResult.yearly.filter(d => d.fcf != null);
  return valid.length > 0 ? valid[valid.length - 1] : null;
}

// FCF per share for each year
export function computeFCFPerShare(fcfResult, statements) {
  const { income, balance } = statements;
  return fcfResult.yearly.map(d => {
    // Prefer EOP shares, fallback to weighted average
    const shares = balance[d.year]?.shares_outstanding ?? income[d.year]?.basic_average_shares;
    const fcfPerShare = (d.fcf != null && shares && shares > 0)
      ? d.fcf / shares
      : null;
    return { year: d.year, fcf: d.fcf, shares, fcfPerShare };
  });
}

// CapEx as a percentage of Operating Cash Flow
// Low CapEx/OCF = asset-light business (Buffett loves these)
export function computeCapExRatio(fcfResult) {
  return fcfResult.yearly
    .filter(d => d.operatingCF != null && d.capEx != null && d.operatingCF > 0)
    .map(d => ({
      year: d.year,
      capExToOCF: d.capEx / d.operatingCF,
    }));
}
