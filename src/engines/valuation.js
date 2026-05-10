// Valuation calculators — MOS, PBT, Ten Cap, Equity Bond, Bond Comparison
// All take explicit inputs (FGR, EPS, CapEx, etc.) — no internal data fetching
// These are pure math functions fed by the user's documented assumptions

// ============================================================
// 1. MOS (Margin of Safety) Price
// ============================================================
// Growth Rate = FGR (conservative)
// EPS: TTM or 3-year average (user documents which and why)
// Future P/E: ≤ 2× Growth Rate, capped at historical high
// MARR = 15%
// Fair Value → MOS Price (50% discount)

export function computeMOS({ fgr, eps, futurePE, marr = 0.15, years = 10 }) {
  if (!fgr || !eps || !futurePE) return null;

  // Future EPS = current EPS grown at FGR for 10 years
  const futureEPS = eps * Math.pow(1 + fgr, years);

  // Future price = Future EPS × Future P/E
  const futurePrice = futureEPS * futurePE;

  // Fair Value = Future price discounted at MARR
  const fairValue = futurePrice / Math.pow(1 + marr, years);

  // MOS price = 50% of Fair Value
  const mosPrice = fairValue / 2;

  return {
    futureEPS: round2(futureEPS),
    futurePrice: round2(futurePrice),
    fairValue: round2(fairValue),
    mosPrice: round2(mosPrice),
    inputs: { fgr, eps, futurePE, marr, years },
  };
}

// Suggested Future P/E: ≤ 2× growth rate (as whole number), capped at historical high
export function suggestFuturePE(fgr, historicalHighPE) {
  const twoTimesGrowth = Math.min(Math.round(fgr * 100) * 2, 100);
  if (historicalHighPE != null) {
    return Math.min(twoTimesGrowth, historicalHighPE);
  }
  return twoTimesGrowth;
}

// ============================================================
// 2. PBT (Payback Time) Price
// ============================================================
// FCF per share growing at FGR, summed over 8 years
// Target: ≤ 8 years to pay back the purchase price

export function computePBT({ fcfPerShare, fgr, targetYears = 8 }) {
  if (!fcfPerShare || !fgr) return null;

  // Sum of FCF per share over targetYears, growing at FGR each year
  let cumulativeFCF = 0;
  const yearlyFCF = [];

  for (let i = 1; i <= targetYears; i++) {
    const yearFCF = fcfPerShare * Math.pow(1 + fgr, i);
    cumulativeFCF += yearFCF;
    yearlyFCF.push({ year: i, fcf: round2(yearFCF), cumulative: round2(cumulativeFCF) });
  }

  return {
    pbtPrice: round2(cumulativeFCF),
    yearlyFCF,
    inputs: { fcfPerShare, fgr, targetYears },
  };
}

// Compute FCF per share from inputs
export function fcfPerShare({ fcfRatio, eps }) {
  if (fcfRatio == null || eps == null) return null;
  return round2(fcfRatio * eps);
}

// Compute how many years to payback at a given price
export function yearsToPayback({ fcfPerShare, fgr, price }) {
  if (!fcfPerShare || !fgr || !price || price <= 0) return null;
  let cumulative = 0;
  for (let i = 1; i <= 50; i++) {
    cumulative += fcfPerShare * Math.pow(1 + fgr, i);
    if (cumulative >= price) return round2(i - 1 + (price - (cumulative - fcfPerShare * Math.pow(1 + fgr, i))) / (fcfPerShare * Math.pow(1 + fgr, i)));
  }
  return null; // > 50 years
}

// ============================================================
// 3. Ten Cap (Owner Earnings) Price
// ============================================================
// Owner Earnings = Cash from Operations - Maintenance CapEx + Tax Provision
// Ten Cap Price = 10 × (Owner Earnings / Shares Outstanding)
//
// Supports two methods:
//   value investing Workshop: OpCF - Maintenance CapEx + Tax Provision
//   Graham/Intelligent Investor: Operating Income + D&A of Goodwill - Federal Tax
//                                - Stock Option Costs - Unsustainable Pension - Maintenance CapEx

export function computeTenCap({ operatingCashFlow, maintenanceCapEx, taxProvision, sharesOutstanding, method = 'ruleOne' }) {
  if (operatingCashFlow == null || sharesOutstanding == null || sharesOutstanding <= 0) return null;

  // Maintenance CapEx defaults to 0 if not provided
  const maintCapEx = Math.abs(maintenanceCapEx ?? 0);
  const tax = taxProvision ?? 0;

  const ownerEarnings = operatingCashFlow - maintCapEx + tax;
  const tenCapPrice = 10 * (ownerEarnings / sharesOutstanding);

  return {
    ownerEarnings: round2(ownerEarnings),
    tenCapPrice: round2(tenCapPrice),
    ownerEarningsPerShare: round2(ownerEarnings / sharesOutstanding),
    method,
    inputs: { operatingCashFlow, maintenanceCapEx: maintCapEx, taxProvision: tax, sharesOutstanding },
  };
}

// Maintenance CapEx estimation helper
// totalCapEx × maintenancePct (often 70% assumed when not disclosed)
export function estimateMaintenanceCapEx(totalCapEx, maintenancePct = 0.70) {
  if (totalCapEx == null) return null;
  return Math.abs(totalCapEx) * maintenancePct;
}

// ============================================================
// 4. Equity Bond (from Buffettology, 1997)
// ============================================================
// Treats stock as a bond whose coupon grows with retained earnings
// 1. Current BVPS
// 2. Historically reasonable ROE
// 3. Retained earnings ratio (what % kept vs paid out)
// 4. Equity growth rate = retained ratio × ROE
// 5. Grow book value 10 years at equity growth rate
// 6. Future earnings = future book value × ROE
// 7. Future price = future earnings × historically reasonable P/E
// 8. Back-track to present value at MARR → Fair Value
// 9. Apply margin of safety discount → buy price
// 10. Projected CAGR at current price (the original Buffettology output)

export function computeEquityBond({ bvps, roe, retainedRatio, historicalPE, marr = 0.20, mosPercent = 0.50, years = 10, currentPrice = null }) {
  if (!bvps || !roe || !retainedRatio || !historicalPE) return null;

  // Equity growth rate
  const equityGrowthRate = retainedRatio * roe;

  // Future book value
  const futureBVPS = bvps * Math.pow(1 + equityGrowthRate, years);

  // Future earnings per share
  const futureEPS = futureBVPS * roe;

  // Future price
  const futurePrice = futureEPS * historicalPE;

  // Fair Value = future price discounted at MARR
  const fairValue = futurePrice / Math.pow(1 + marr, years);

  // Buy price = Fair Value × MOS%
  const buyPrice = fairValue * mosPercent;

  // Projected annual return at current market price
  const projectedReturn = (currentPrice && currentPrice > 0)
    ? round4(Math.pow(futurePrice / currentPrice, 1 / years) - 1)
    : null;

  return {
    equityGrowthRate: round4(equityGrowthRate),
    futureBVPS: round2(futureBVPS),
    futureEPS: round2(futureEPS),
    futurePrice: round2(futurePrice),
    fairValue: round2(fairValue),
    buyPrice: round2(buyPrice),
    projectedReturn,
    inputs: { bvps, roe, retainedRatio, historicalPE, marr, mosPercent, years },
  };
}

// ============================================================
// 4b. Pretax Equity Bond (from Interpretation of Financial Statements, 2008)
// ============================================================
// Treats pretax EPS as a growing bond coupon
// 1. Current pretax EPS (pretax income / shares)
// 2. Historical pretax EPS growth rate (CAGR)
// 3. Capitalize at corporate bond yield → bond-equivalent value
// 4. OR: project forward at growth rate × historical P/E → discount at MARR → buy price

export function computePretaxEquityBond({ pretaxEPS, pretaxGrowthRate, corpBondYield, historicalPE, marr = 0.15, years = 10, currentPrice = null }) {
  if (!pretaxEPS || pretaxEPS <= 0) return null;

  // Pretax yield at current price (the "initial coupon rate")
  const pretaxYield = (currentPrice && currentPrice > 0)
    ? round4(pretaxEPS / currentPrice)
    : null;

  // Bond capitalization value: what you'd pay for this coupon at bond rates
  const bondCapValue = (corpBondYield && corpBondYield > 0)
    ? round2(pretaxEPS / corpBondYield)
    : null;

  // Projection method (requires growth rate and P/E)
  let futurePretaxEPS = null;
  let futurePrice = null;
  let buyPrice = null;
  let projectedReturnAtCurrentPrice = null;

  if (pretaxGrowthRate && historicalPE) {
    futurePretaxEPS = round2(pretaxEPS * Math.pow(1 + pretaxGrowthRate, years));
    futurePrice = round2(futurePretaxEPS * historicalPE);
    buyPrice = round2(futurePrice / Math.pow(1 + marr, years));

    if (currentPrice && currentPrice > 0) {
      projectedReturnAtCurrentPrice = round4(Math.pow(futurePrice / currentPrice, 1 / years) - 1);
    }
  }

  return {
    pretaxYield,
    bondCapValue,
    futurePretaxEPS,
    futurePrice,
    buyPrice,
    projectedReturnAtCurrentPrice,
    inputs: { pretaxEPS, pretaxGrowthRate, corpBondYield, historicalPE, marr, years },
  };
}

// ============================================================
// 5. Bond Comparison Table
// ============================================================
// Compare stock's EPS yield against bond yields
// EPS Yield = EPS / market price
// If stock yield > bond yields, stock is the "best option"

export function computeBondComparison({ eps, marketPrice, tbillYield, corpBondYield }) {
  if (!eps || !marketPrice || marketPrice <= 0) return null;

  const epsYield = eps / marketPrice;

  return {
    epsYield: round4(epsYield),
    epsYieldPct: (epsYield * 100).toFixed(2) + '%',
    tbillYield: tbillYield,
    tbillYieldPct: tbillYield != null ? (tbillYield * 100).toFixed(2) + '%' : null,
    corpBondYield: corpBondYield,
    corpBondYieldPct: corpBondYield != null ? (corpBondYield * 100).toFixed(2) + '%' : null,
    isBestOption: epsYield > (tbillYield ?? 0) && epsYield > (corpBondYield ?? 0),
    inputs: { eps, marketPrice, tbillYield, corpBondYield },
  };
}

// ============================================================
// 6. Sensitivity Tables
// ============================================================
// Generate valuation matrices by varying two parameters
// Returns a 2D array of results

export function sensitivityTable({ method, baseInputs, param1, param2 }) {
  const results = [];

  for (const v1 of param1.values) {
    const row = [];
    for (const v2 of param2.values) {
      const inputs = {
        ...baseInputs,
        [param1.key]: v1,
        [param2.key]: v2,
      };

      let result;
      switch (method) {
        case 'mos':
          result = computeMOS(inputs);
          row.push(result?.mosPrice ?? null);
          break;
        case 'pbt':
          result = computePBT(inputs);
          row.push(result?.pbtPrice ?? null);
          break;
        case 'tenCap':
          result = computeTenCap(inputs);
          row.push(result?.tenCapPrice ?? null);
          break;
        case 'equityBond':
          result = computeEquityBond(inputs);
          row.push(result?.buyPrice ?? null);
          break;
        case 'pretaxEquityBond':
          result = computePretaxEquityBond(inputs);
          row.push(result?.buyPrice ?? null);
          break;
        default:
          row.push(null);
      }
    }
    results.push(row);
  }

  return {
    method,
    param1: { label: param1.label, values: param1.values },
    param2: { label: param2.label, values: param2.values },
    results,
  };
}

// ============================================================
// Helpers
// ============================================================

function round2(n) {
  return Math.round(n * 100) / 100;
}

function round4(n) {
  return Math.round(n * 10000) / 10000;
}
