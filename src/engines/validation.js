// Layer 1 Validation Engine — EDGAR self-validation
// Checks accounting identities, data completeness, derived field consistency,
// YoY sanity, and cross-checks against EDGAR Frames API.

import { FRAMES_TAGS, crossCheckField, fiscalYearToCalendarYear } from './edgarFrames';
import { lookupCIK } from './edgar';

// ─── Accounting Identity Checks ──────────────────────────────────────

const TOLERANCE = 1_000_000; // $1M rounding tolerance

function closeEnough(a, b, tol = TOLERANCE) {
  if (a == null || b == null) return null; // can't check
  return Math.abs(a - b) <= tol;
}

function identityCheck(name, lhs, rhs, pctTolerance = 0) {
  const diff = lhs != null && rhs != null ? Math.abs(lhs - rhs) : null;
  let tol = TOLERANCE;
  // For checks like A=L+E, use percentage-based tolerance (mezzanine equity, redeemable NCI)
  if (pctTolerance > 0 && lhs != null && lhs !== 0) {
    tol = Math.max(TOLERANCE, Math.abs(lhs) * pctTolerance);
  }
  const pass = diff != null ? diff <= tol : null;
  return {
    name,
    lhs,
    rhs,
    diff,
    status: pass === null ? 'skip' : pass ? 'pass' : 'fail',
  };
}

function runIdentityChecks(income, balance, cashFlow) {
  const checks = [];

  // Assets = Liabilities + Equity (+ NCI if reported separately)
  // equity may be StockholdersEquity (parent only) — add minority_interest if present
  // 1% tolerance: mezzanine/redeemable equity sits between liabilities and stockholders' equity
  const equityForIdentity = (balance.equity ?? 0) + (balance.minority_interest ?? 0);
  checks.push(identityCheck(
    'Assets = Liabilities + Equity',
    balance.assets,
    (balance.liabilities ?? 0) + equityForIdentity,
    0.01
  ));

  // Current Assets + Non-Current Assets = Total Assets
  if (balance.current_assets != null && balance.noncurrent_assets != null) {
    checks.push(identityCheck(
      'Current Assets + Non-Current Assets = Total Assets',
      balance.assets,
      balance.current_assets + balance.noncurrent_assets
    ));
  }

  // Current Liabilities + Non-Current Liabilities = Total Liabilities
  if (balance.current_liabilities != null && balance.noncurrent_liabilities != null) {
    checks.push(identityCheck(
      'Current Liab + Non-Current Liab = Total Liabilities',
      balance.liabilities,
      balance.current_liabilities + balance.noncurrent_liabilities
    ));
  }

  // Gross Profit = Revenue - COGS
  if (income.revenues != null && income.cost_of_revenue != null) {
    checks.push(identityCheck(
      'Gross Profit = Revenue - COGS',
      income.gross_profit,
      income.revenues - income.cost_of_revenue
    ));
  }

  // OCF + ICF + FCF + FX ≈ Change in Cash
  if (cashFlow.net_cash_flow_from_operating_activities != null &&
      cashFlow.net_cash_flow_from_investing_activities != null &&
      cashFlow.net_cash_flow_from_financing_activities != null) {
    const cfSum = cashFlow.net_cash_flow_from_operating_activities
      + cashFlow.net_cash_flow_from_investing_activities
      + cashFlow.net_cash_flow_from_financing_activities
      + (cashFlow.effect_of_exchange_rate ?? 0);
    checks.push(identityCheck(
      'OCF + ICF + FCF + FX ≈ Change in Cash',
      cashFlow.net_change_in_cash,
      cfSum
    ));
  }

  // FCF = OCF - CapEx
  if (cashFlow.net_cash_flow_from_operating_activities != null && cashFlow.capital_expenditures != null) {
    checks.push(identityCheck(
      'FCF = OCF - CapEx',
      cashFlow.free_cash_flow,
      cashFlow.net_cash_flow_from_operating_activities - cashFlow.capital_expenditures
    ));
  }

  // Net Income ≈ Pre-Tax - Tax
  // Use net_income_including_nci (ProfitLoss) which matches Pre-Tax - Tax more closely.
  // NetIncomeLoss (parent only) excludes NCI allocation, discontinued ops, preferred dividends.
  if (income.income_before_tax != null && income.income_tax != null) {
    const niForCheck = income.net_income_including_nci ?? income.net_income_loss;
    const expected = income.income_before_tax - income.income_tax;
    const diff = niForCheck != null && expected != null ? Math.abs(niForCheck - expected) : null;
    // Use 5% tolerance — discontinued ops and extraordinary items can cause legitimate differences
    const pctTol = niForCheck != null && niForCheck !== 0 ? Math.abs(niForCheck) * 0.05 : TOLERANCE;
    const tol = Math.max(TOLERANCE, pctTol);
    const pass = diff != null ? diff <= tol : null;
    checks.push({
      name: 'Net Income ≈ Pre-Tax Income - Tax',
      lhs: niForCheck,
      rhs: expected,
      diff,
      status: pass === null ? 'skip' : pass ? 'pass' : 'fail',
    });
  }

  // Working Capital = CA - CL
  if (balance.current_assets != null && balance.current_liabilities != null) {
    checks.push(identityCheck(
      'Working Capital = Current Assets - Current Liabilities',
      balance.working_capital,
      balance.current_assets - balance.current_liabilities
    ));
  }

  // Net Debt = Total Debt - Cash (when positive)
  if (balance.total_debt != null && balance.cash != null && balance.net_debt != null && balance.net_debt > 0) {
    checks.push(identityCheck(
      'Net Debt = Total Debt - Cash',
      balance.net_debt,
      balance.total_debt - balance.cash
    ));
  }

  return checks;
}

// ─── Data Completeness ───────────────────────────────────────────────

const CRITICAL_FIELDS = {
  income: ['revenues', 'net_income_loss', 'operating_income_loss', 'gross_profit', 'diluted_earnings_per_share'],
  balance: ['assets', 'equity', 'liabilities', 'current_assets', 'current_liabilities', 'shares_outstanding'],
  // Note: long_term_debt intentionally excluded — null means zero debt (good sign), not missing data
  cashFlow: ['net_cash_flow_from_operating_activities', 'capital_expenditures', 'free_cash_flow'],
};

function checkCompleteness(years, income, balance, cashFlow) {
  const result = {};

  for (const [section, fields] of Object.entries(CRITICAL_FIELDS)) {
    const data = section === 'income' ? income : section === 'balance' ? balance : cashFlow;
    for (const field of fields) {
      const present = [];
      const missing = [];
      for (const yr of years) {
        if (data[yr]?.[field] != null) {
          present.push(yr);
        } else {
          missing.push(yr);
        }
      }
      result[`${section}.${field}`] = { present: present.length, missing: missing.length, missingYears: missing, total: years.length };
    }
  }

  return result;
}

// ─── Derived Field Consistency ───────────────────────────────────────

function checkDerivedFields(years, income, balance, cashFlow) {
  const checks = [];

  for (const yr of years) {
    const inc = income[yr] || {};
    const bal = balance[yr] || {};
    const cf = cashFlow[yr] || {};

    // EBITDA = EBIT + D&A
    if (inc.ebit != null && inc.depreciation_amortization_is != null && inc.ebitda != null) {
      const expected = inc.ebit + inc.depreciation_amortization_is;
      const diff = Math.abs(inc.ebitda - expected);
      checks.push({
        field: 'ebitda', year: yr,
        derived: inc.ebitda, expected,
        diff,
        status: diff <= TOLERANCE ? 'match' : 'mismatch',
      });
    }

    // Auto-computed EPS vs. XBRL EPS
    if (inc.net_income_loss != null && bal.shares_outstanding != null && bal.shares_outstanding > 0) {
      const computedEPS = inc.net_income_loss / (inc.diluted_average_shares || bal.shares_outstanding);
      if (inc.diluted_earnings_per_share != null) {
        const diff = Math.abs(inc.diluted_earnings_per_share - computedEPS);
        checks.push({
          field: 'eps_computed_vs_xbrl', year: yr,
          derived: computedEPS,
          expected: inc.diluted_earnings_per_share,
          diff: Math.round(diff * 100) / 100,
          status: diff <= 0.05 ? 'match' : diff <= 0.50 ? 'warning' : 'mismatch',
        });
      }
    }

    // Invested Capital = Equity + LT Debt - Cash (matches edgarFinancials.js formula)
    if (bal.equity != null && bal.invested_capital != null) {
      const expected = (bal.equity ?? 0) + (bal.long_term_debt ?? 0) - (bal.cash ?? 0);
      const diff = Math.abs(bal.invested_capital - expected);
      checks.push({
        field: 'invested_capital', year: yr,
        derived: bal.invested_capital, expected,
        diff,
        status: diff <= TOLERANCE ? 'match' : 'mismatch',
      });
    }
  }

  return checks;
}

// ─── Year-over-Year Sanity ───────────────────────────────────────────

const YOY_THRESHOLDS = {
  revenues: 0.5,       // 50% change flagged
  assets: 1.0,         // 100% change flagged
  equity: null,        // sign-flip flagged separately
  shares_outstanding: 0.2, // 20% change without detected split
};

function checkYoY(years, income, balance) {
  const flags = [];
  const sortedYears = [...years].sort((a, b) => a - b);

  for (let i = 1; i < sortedYears.length; i++) {
    const prev = sortedYears[i - 1];
    const curr = sortedYears[i];

    // Revenue
    const revPrev = income[prev]?.revenues;
    const revCurr = income[curr]?.revenues;
    if (revPrev != null && revCurr != null && revPrev > 0) {
      const pct = Math.abs((revCurr - revPrev) / revPrev);
      if (pct > YOY_THRESHOLDS.revenues) {
        flags.push({ field: 'revenues', year: curr, prior: revPrev, current: revCurr, pctChange: Math.round(pct * 1000) / 10, status: 'flag' });
      }
    }

    // Total Assets
    const assetsPrev = balance[prev]?.assets;
    const assetsCurr = balance[curr]?.assets;
    if (assetsPrev != null && assetsCurr != null && assetsPrev > 0) {
      const pct = Math.abs((assetsCurr - assetsPrev) / assetsPrev);
      if (pct > YOY_THRESHOLDS.assets) {
        flags.push({ field: 'assets', year: curr, prior: assetsPrev, current: assetsCurr, pctChange: Math.round(pct * 1000) / 10, status: 'flag' });
      }
    }

    // Equity sign flip
    const eqPrev = balance[prev]?.equity;
    const eqCurr = balance[curr]?.equity;
    if (eqPrev != null && eqCurr != null && ((eqPrev > 0 && eqCurr < 0) || (eqPrev < 0 && eqCurr > 0))) {
      flags.push({ field: 'equity', year: curr, prior: eqPrev, current: eqCurr, pctChange: null, status: 'flag' });
    }

    // Shares outstanding large change
    const sharesPrev = balance[prev]?.shares_outstanding;
    const sharesCurr = balance[curr]?.shares_outstanding;
    if (sharesPrev != null && sharesCurr != null && sharesPrev > 0) {
      const pct = Math.abs((sharesCurr - sharesPrev) / sharesPrev);
      if (pct > YOY_THRESHOLDS.shares_outstanding) {
        flags.push({ field: 'shares_outstanding', year: curr, prior: sharesPrev, current: sharesCurr, pctChange: Math.round(pct * 1000) / 10, status: 'flag' });
      }
    }
  }

  return flags;
}

// ─── Frames Cross-Check ─────────────────────────────────────────────

async function runFramesCrossCheck(ticker, years, income, balance, cashFlow, fiscalMonths) {
  const cik = await lookupCIK(ticker);
  if (!cik) return {};

  const results = {};

  for (const tagDef of FRAMES_TAGS) {
    results[tagDef.ourField] = {};

    // Determine which statement section holds this field
    const section = tagDef.ourField === 'assets' || tagDef.ourField === 'equity' ||
      tagDef.ourField === 'liabilities' || tagDef.ourField === 'long_term_debt' ||
      tagDef.ourField === 'shares_outstanding'
      ? balance
      : tagDef.ourField === 'net_cash_flow_from_operating_activities' ||
        tagDef.ourField === 'capital_expenditures'
        ? cashFlow
        : income;

    // Check last 5 years to keep request count manageable
    const recentYears = years.slice(0, 5);

    for (const fy of recentYears) {
      const ourValue = section[fy]?.[tagDef.ourField] ?? null;
      const cy = fiscalYearToCalendarYear(fy, fiscalMonths?.[fy]);

      const result = await crossCheckField(tagDef, cik, cy, ourValue);
      results[tagDef.ourField][fy] = result;

      // Small delay to respect 10 req/sec rate limit
      await new Promise(r => setTimeout(r, 120));
    }
  }

  return results;
}

// ─── Main Validation Function ────────────────────────────────────────

export async function validateCompany(ticker, edgarStatements, options = {}) {
  const { skipFrames = false } = options;
  const { years, income, balance, cashFlow, fiscalMonths } = edgarStatements;

  // 1. Accounting identity checks (per year)
  const identityChecks = {};
  for (const yr of years) {
    identityChecks[yr] = runIdentityChecks(
      income[yr] || {},
      balance[yr] || {},
      cashFlow[yr] || {},
    );
  }

  // 2. Data completeness
  const completeness = checkCompleteness(years, income, balance, cashFlow);

  // 3. Derived field consistency
  const derivedChecks = checkDerivedFields(years, income, balance, cashFlow);

  // 4. YoY sanity
  const yoyFlags = checkYoY(years, income, balance);

  // 5. Frames cross-check (optional, requires network calls)
  let framesChecks = {};
  if (!skipFrames) {
    framesChecks = await runFramesCrossCheck(ticker, years, income, balance, cashFlow, fiscalMonths);
  }

  // ─── Summary ───────────────────────────────────────────────────
  let identityTotal = 0, identityPass = 0;
  for (const yr of years) {
    for (const check of identityChecks[yr] || []) {
      if (check.status !== 'skip') {
        identityTotal++;
        if (check.status === 'pass') identityPass++;
      }
    }
  }

  const completenessFields = Object.values(completeness);
  const completenessScore = completenessFields.length > 0
    ? Math.round(completenessFields.reduce((sum, f) => sum + f.present / f.total, 0) / completenessFields.length * 100)
    : 100;

  const derivedMatch = derivedChecks.filter(c => c.status === 'match').length;
  const derivedTotal = derivedChecks.filter(c => c.status !== 'skip').length;

  let framesMatch = 0, framesWarn = 0, framesErr = 0, framesTotal = 0;
  for (const field of Object.values(framesChecks)) {
    for (const yr of Object.values(field)) {
      if (yr.status === 'match') { framesMatch++; framesTotal++; }
      else if (yr.status === 'warning') { framesWarn++; framesTotal++; }
      else if (yr.status === 'error') { framesErr++; framesTotal++; }
      else if (yr.status === 'missing_ours') { framesErr++; framesTotal++; }
      // missing_frames and both_missing don't count
    }
  }

  const identityPassRate = identityTotal > 0 ? Math.round(identityPass / identityTotal * 100) : 100;
  const derivedMatchRate = derivedTotal > 0 ? Math.round(derivedMatch / derivedTotal * 100) : 100;
  const framesMatchRate = framesTotal > 0 ? Math.round(framesMatch / framesTotal * 100) : 100;

  let overallStatus = 'PASS';
  if (identityPassRate < 90 || framesMatchRate < 80) overallStatus = 'FAIL';
  else if (identityPassRate < 100 || framesMatchRate < 95 || framesWarn > 0 || yoyFlags.length > 3) overallStatus = 'WARNINGS';

  return {
    ticker: ticker.toUpperCase(),
    timestamp: new Date().toISOString(),
    years,
    identityChecks,
    completeness,
    derivedChecks,
    yoyFlags,
    framesChecks,
    summary: {
      identityPassRate,
      completenessScore,
      derivedMatchRate,
      framesMatchRate,
      framesWarnings: framesWarn,
      framesErrors: framesErr,
      yoyFlagsCount: yoyFlags.length,
      overallStatus,
    },
  };
}
