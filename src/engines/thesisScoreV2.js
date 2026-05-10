// Thesis Score v2 - 4-pillar Buffett-flavored quality score
// See docs/specs/2026-05-09-thesis-score-redesign.md for methodology

import { coefficientOfVariation, consistencyScore } from './utils/consistency.js';

// Per-metric scoring helpers

function scoreLevelByThreshold(value, thresholds) {
  if (value == null) return null;
  if (value >= thresholds.full) return 100;
  if (value >= thresholds.partial) return 50;
  return 0;
}

function combineLevels(score10, score5) {
  if (score10 == null && score5 == null) return null;
  if (score10 == null) return score5;
  if (score5 == null) return score10;
  return (score10 + score5) / 2;
}

function combineLevelAndConsistency(level, cons) {
  if (level == null) return null;
  if (cons == null) return level;
  return 0.7 * level + 0.3 * cons;
}

function scoreGrowthMetric(growthRates, series, thresholds) {
  const level10 = scoreLevelByThreshold(growthRates?.['10yr'], thresholds);
  const level5 = scoreLevelByThreshold(growthRates?.['5yr'], thresholds);
  const level = combineLevels(level10, level5);
  if (level == null) return null;

  const cv = coefficientOfVariation(series || []);
  const cons = consistencyScore(cv);
  return Math.round(combineLevelAndConsistency(level, cons));
}

// Pillar 1: Compounding

const COMPOUNDING_THRESHOLDS = {
  bvps:          { full: 0.12, partial: 0.08 },
  operatingCash: { full: 0.12, partial: 0.08 },
  fcf:           { full: 0.10, partial: 0.06 },
};

export function scoreCompoundingPillar(input) {
  const { growthRates = {}, bvpsSeries, operatingCashSeries, fcfSeries } = input;

  const metrics = {
    bvpsGrowth:          scoreGrowthMetric(growthRates.bvps, bvpsSeries, COMPOUNDING_THRESHOLDS.bvps),
    operatingCashGrowth: scoreGrowthMetric(growthRates.operatingCash, operatingCashSeries, COMPOUNDING_THRESHOLDS.operatingCash),
    fcfGrowth:           scoreGrowthMetric(growthRates.fcf, fcfSeries, COMPOUNDING_THRESHOLDS.fcf),
  };

  const present = Object.values(metrics).filter(v => v != null);
  const score = present.length > 0
    ? Math.round(present.reduce((a, b) => a + b, 0) / present.length)
    : null;

  return { score, metrics };
}

// Pillar 2: Capital Efficiency

const ROIC_THRESHOLDS = { full: 0.15, partial: 0.10 };

function scoreCashQualityRatios(ratios) {
  const valid = (ratios || []).filter(r => r != null && Number.isFinite(r));
  if (valid.length === 0) return null;

  const sorted = [...valid].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];

  const level = median >= 1.0 ? 100 : median >= 0.7 ? 50 : 0;

  const cv = coefficientOfVariation(valid);
  const cons = consistencyScore(cv);
  return Math.round(combineLevelAndConsistency(level, cons));
}

function scoreGrossMarginTrend(slope) {
  if (slope == null || !Number.isFinite(slope)) return null;
  if (slope > 0.005) return 100;
  if (slope >= -0.005) return 50;
  return 0;
}

export function scoreCapitalEfficiencyPillar(input) {
  const { returnAverages = {}, roicSeries, fcfNiRatios, grossMarginSlope } = input;

  const roicLevel = combineLevels(
    scoreLevelByThreshold(returnAverages['10yr']?.roic, ROIC_THRESHOLDS),
    scoreLevelByThreshold(returnAverages['5yr']?.roic, ROIC_THRESHOLDS),
  );
  const roicCV = coefficientOfVariation(roicSeries || []);
  const roicConsistency = consistencyScore(roicCV);
  const roicScore = roicLevel != null
    ? Math.round(combineLevelAndConsistency(roicLevel, roicConsistency))
    : null;

  const metrics = {
    roic:             roicScore,
    cashQuality:      scoreCashQualityRatios(fcfNiRatios),
    grossMarginTrend: scoreGrossMarginTrend(grossMarginSlope),
  };

  const present = Object.values(metrics).filter(v => v != null);
  const score = present.length > 0
    ? Math.round(present.reduce((a, b) => a + b, 0) / present.length)
    : null;

  return { score, metrics };
}

// Pillar 3: Capital Allocation

function scoreBuybackDiscipline(pct5yr) {
  if (pct5yr == null) return null;
  if (pct5yr < -0.02) return 100;
  if (pct5yr <= 0.02) return 50;
  return 0;
}

function scoreDividendTrackRecord(info) {
  if (!info) return null;
  if (!info.isPayer) return 70;

  const { consecutiveYearsCovered = 0, cagr5yr = 0, latestPayoutRatio = 0 } = info;

  if (latestPayoutRatio > 1.0) return 0;
  if (consecutiveYearsCovered < 3) return 0;
  if (cagr5yr < -0.05) return 0;

  if (consecutiveYearsCovered >= 5 && cagr5yr > 0 && latestPayoutRatio < 0.7) return 100;

  return 50;
}

function scoreReinvestmentEffectiveness(ratio) {
  if (ratio == null || !Number.isFinite(ratio)) return null;
  if (ratio >= 1.0) return 100;
  if (ratio >= 0.7) return 50;
  return 0;
}

export function scoreCapitalAllocationPillar(input) {
  const {
    sharesOutstanding5yrPctChange,
    dividendInfo,
    reinvestmentEffectiveness,
  } = input;

  const metrics = {
    buybackDiscipline:         scoreBuybackDiscipline(sharesOutstanding5yrPctChange),
    dividendTrackRecord:       scoreDividendTrackRecord(dividendInfo),
    reinvestmentEffectiveness: scoreReinvestmentEffectiveness(reinvestmentEffectiveness),
  };

  const present = Object.values(metrics).filter(v => v != null);
  const score = present.length > 0
    ? Math.round(present.reduce((a, b) => a + b, 0) / present.length)
    : null;

  return { score, metrics };
}

// Pillar 4: Resilience (point-in-time, no Consistency component)

function scoreNetDebtToFCF(years) {
  if (years == null || !Number.isFinite(years)) return null;
  if (years <= 0) return 100;
  if (years <= 2) return 75;
  if (years <= 4) return 35;
  return 0;
}

function scoreInterestCoverage(ratio) {
  if (ratio == null) return null;
  if (ratio === Infinity || ratio >= 10) return 100;
  if (!Number.isFinite(ratio)) return null;
  if (ratio >= 5) return 50;
  return 0;
}

// Net-cash companies can run sub-1.0 current ratios safely (working capital
// deficit is operational, not financial — see AAPL).
function scoreCurrentRatio(ratio, isNetCash = false) {
  if (ratio == null || !Number.isFinite(ratio)) return null;
  if (ratio >= 1.5) return 100;
  if (ratio >= 1.0) return 50;
  if (isNetCash) return 50;
  if (ratio >= 0.8) return 25;
  return 0;
}

export function scoreResiliencePillar(input) {
  const { netDebtToFCF, interestCoverage, currentRatio, isNetCash = false } = input;

  const metrics = {
    netDebtToFCF:     scoreNetDebtToFCF(netDebtToFCF),
    interestCoverage: scoreInterestCoverage(interestCoverage),
    currentRatio:     scoreCurrentRatio(currentRatio, isNetCash),
  };

  const present = Object.values(metrics).filter(v => v != null);
  const score = present.length > 0
    ? Math.round(present.reduce((a, b) => a + b, 0) / present.length)
    : null;

  return { score, metrics };
}

// Adapters: extract pillar inputs from raw engine outputs

// Convert a [{year, value}] series sorted oldest-first to YoY rates
function seriesToYoY(series) {
  if (!Array.isArray(series) || series.length < 2) return [];
  const sorted = [...series].sort((a, b) => a.year - b.year);
  const yoy = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1].value;
    const curr = sorted[i].value;
    if (prev != null && prev !== 0 && curr != null) {
      yoy.push((curr - prev) / Math.abs(prev));
    }
  }
  return yoy;
}

function adaptCompoundingInput(growthRates) {
  const series = growthRates?._series || {};
  return {
    growthRates: {
      bvps: growthRates?.bvps,
      operatingCash: growthRates?.operatingCash,
      fcf: growthRates?.fcf,
    },
    bvpsSeries:          seriesToYoY(series.bvps),
    operatingCashSeries: seriesToYoY(series.operatingCash),
    fcfSeries:           seriesToYoY(series.fcf),
  };
}

function adaptCapitalEfficiencyInput(returnMetrics, statements) {
  const roicSeries = (returnMetrics?.yearly || [])
    .map(y => y.roic)
    .filter(v => v != null);

  const fcfNiRatios = [];
  if (statements?.years) {
    for (const year of statements.years) {
      const ni = statements.income?.[year]?.net_income_loss;
      const cf = statements.cashFlow?.[year] || {};
      const fcf = cf.free_cash_flow ?? (
        cf.net_cash_flow_from_operating_activities != null && cf.capital_expenditures != null
          ? cf.net_cash_flow_from_operating_activities - Math.abs(cf.capital_expenditures)
          : null
      );
      if (ni && ni > 0 && fcf != null) {
        fcfNiRatios.push(fcf / ni);
      }
    }
  }

  const grossMarginSlope = computeGrossMarginSlope(statements, 5);

  return {
    returnAverages: returnMetrics?.averages || {},
    roicSeries,
    fcfNiRatios,
    grossMarginSlope,
  };
}

function computeGrossMarginSlope(statements, years = 5) {
  if (!statements?.years) return null;
  const sorted = [...statements.years].sort((a, b) => a - b);
  const recent = sorted.slice(-years);

  const points = [];
  for (const y of recent) {
    const inc = statements.income?.[y] || {};
    const rev = inc.revenues;
    let gm = null;
    if (inc.gross_profit != null && rev && rev !== 0) {
      gm = inc.gross_profit / rev;
    } else if (inc.cost_of_revenue != null && rev && rev !== 0) {
      gm = (rev - inc.cost_of_revenue) / rev;
    }
    if (gm != null) points.push({ x: y, y: gm });
  }
  if (points.length < 3) return null;

  const n = points.length;
  const meanX = points.reduce((s, p) => s + p.x, 0) / n;
  const meanY = points.reduce((s, p) => s + p.y, 0) / n;
  const num = points.reduce((s, p) => s + (p.x - meanX) * (p.y - meanY), 0);
  const den = points.reduce((s, p) => s + (p.x - meanX) ** 2, 0);
  return den === 0 ? null : num / den;
}

function getShares(bal, inc) {
  return bal?.shares_outstanding ?? bal?.common_shares_outstanding ?? inc?.basic_average_shares ?? null;
}

function getEquity(bal) {
  return bal?.equity_attributable_to_parent ?? bal?.equity ?? null;
}

function adaptCapitalAllocationInput(statements, growthRates) {
  if (!statements?.years?.length) {
    return {
      sharesOutstanding5yrPctChange: null,
      dividendInfo: null,
      reinvestmentEffectiveness: null,
    };
  }

  const sorted = [...statements.years].sort((a, b) => a - b);
  const latestYear = sorted[sorted.length - 1];
  const fiveAgoYear = sorted[Math.max(0, sorted.length - 6)];

  const sharesNow = getShares(statements.balance?.[latestYear], statements.income?.[latestYear]);
  const sharesThen = getShares(statements.balance?.[fiveAgoYear], statements.income?.[fiveAgoYear]);
  const sharesPct = (sharesNow && sharesThen)
    ? (sharesNow - sharesThen) / sharesThen
    : null;

  const dividendInfo = buildDividendInfo(statements, sorted);
  const reinvestmentEffectiveness = computeReinvestmentEffectiveness(growthRates, statements, sorted, 5);

  return {
    sharesOutstanding5yrPctChange: sharesPct,
    dividendInfo,
    reinvestmentEffectiveness,
  };
}

function getFCF(cf) {
  if (!cf) return null;
  if (cf.free_cash_flow != null) return cf.free_cash_flow;
  if (cf.net_cash_flow_from_operating_activities != null && cf.capital_expenditures != null) {
    return cf.net_cash_flow_from_operating_activities - Math.abs(cf.capital_expenditures);
  }
  return null;
}

function buildDividendInfo(statements, sortedYears) {
  const dividends = sortedYears.map(y => Math.abs(statements.cashFlow?.[y]?.dividends_paid ?? 0));
  const fcfs = sortedYears.map(y => getFCF(statements.cashFlow?.[y]) ?? 0);

  const totalDividends = dividends.reduce((a, b) => a + b, 0);
  if (totalDividends === 0) return { isPayer: false };

  // Consecutive years paying any dividend (single-year FCF coverage gaps from
  // special-dividend years like COST should not zero out the streak).
  let consecutive = 0;
  for (let i = sortedYears.length - 1; i >= 0; i--) {
    if (dividends[i] > 0) consecutive++;
    else break;
  }

  // 5yr cumulative payout ratio smooths special dividends.
  const tailDivs = dividends.slice(-5).reduce((a, b) => a + b, 0);
  const tailFCF = fcfs.slice(-5).reduce((a, b) => a + b, 0);
  const latestPayoutRatio = (tailFCF > 0) ? tailDivs / tailFCF : 1.5;

  const startIdx = Math.max(0, sortedYears.length - 6);
  const startDiv = dividends[startIdx];
  const endDiv = dividends[sortedYears.length - 1];
  const yearsSpan = sortedYears.length - 1 - startIdx;
  const cagr5yr = (startDiv > 0 && yearsSpan > 0)
    ? Math.pow(endDiv / startDiv, 1 / yearsSpan) - 1
    : 0;

  return {
    isPayer: true,
    consecutiveYearsCovered: consecutive,
    cagr5yr,
    latestPayoutRatio,
  };
}

// Reinvestment effectiveness: did each retained dollar create value?
// Uses growthRates._series.bvps (BVPS + cumulative dividends/share + cumulative
// buybacks/share) so that capital returned via buybacks is credited just like
// dividends — otherwise heavy buyback companies (AAPL, LULU) score 0 because
// buybacks reduce equity but the cash returned isn't counted as value created.
function computeReinvestmentEffectiveness(growthRates, statements, sortedYears, windowYears) {
  if (sortedYears.length < windowYears + 1) return null;

  const compositeSeries = growthRates?._series?.bvps;
  if (!Array.isArray(compositeSeries) || compositeSeries.length === 0) return null;
  const compositeByYear = new Map(compositeSeries.map(d => [d.year, d.value]));

  const start = sortedYears[sortedYears.length - 1 - windowYears];
  const end = sortedYears[sortedYears.length - 1];
  const compositeStart = compositeByYear.get(start);
  const compositeEnd = compositeByYear.get(end);
  if (compositeStart == null || compositeEnd == null) return null;

  const windowSlice = sortedYears.slice(-windowYears - 1);
  let cumulativeRetainedPerShare = 0;
  for (const y of windowSlice) {
    const cf = statements.cashFlow?.[y] || {};
    const inc = statements.income?.[y] || {};
    const bal = statements.balance?.[y] || {};
    const shares = getShares(bal, inc);
    if (!shares) continue;

    const ni = (inc.net_income_loss ?? 0) / shares;
    const div = Math.abs(cf.dividends_paid ?? 0) / shares;
    cumulativeRetainedPerShare += (ni - div);
  }

  if (cumulativeRetainedPerShare <= 0) return null;
  return (compositeEnd - compositeStart) / cumulativeRetainedPerShare;
}

function adaptResilienceInput(statements, debtMetrics) {
  if (!statements?.years?.length) {
    return { netDebtToFCF: null, interestCoverage: null, currentRatio: null, isNetCash: false };
  }

  const latestYear = [...statements.years].sort((a, b) => b - a)[0];
  const bal = statements.balance?.[latestYear] || {};
  const inc = statements.income?.[latestYear] || {};

  const netDebtToFCF = debtMetrics?.netDebtToFCF ?? null;
  const isNetCash = !!debtMetrics?.isNetCash;

  // Interest coverage: when interest_expense isn't tagged in EDGAR (common for
  // net-cash companies like AAPL/LULU) treat as effectively infinite coverage.
  const ebit = inc.operating_income_loss ?? null;
  const interest = inc.interest_expense ?? null;
  let interestCoverage;
  if (ebit != null && interest && interest !== 0) {
    interestCoverage = ebit / Math.abs(interest);
  } else if (isNetCash) {
    interestCoverage = Infinity;
  } else {
    interestCoverage = null;
  }

  const ca = bal.current_assets;
  const cl = bal.current_liabilities;
  const currentRatio = (ca && cl && cl !== 0) ? ca / cl : null;

  return { netDebtToFCF, interestCoverage, currentRatio, isNetCash };
}

// Composite

const MIN_PUBLIC_YEARS = 5;

export function computeThesisScoreV2(input) {
  const { statements, growthRates, returnMetrics, debtMetrics } = input;

  if (!statements?.years || statements.years.length < MIN_PUBLIC_YEARS) {
    return {
      composite: null,
      reason: 'insufficient public history (<5 years)',
      pillars: null,
    };
  }

  const compounding       = scoreCompoundingPillar(adaptCompoundingInput(growthRates));
  const capitalEfficiency = scoreCapitalEfficiencyPillar(adaptCapitalEfficiencyInput(returnMetrics, statements));
  const capitalAllocation = scoreCapitalAllocationPillar(adaptCapitalAllocationInput(statements, growthRates));
  const resilience        = scoreResiliencePillar(adaptResilienceInput(statements, debtMetrics));

  const pillarScores = [
    compounding.score,
    capitalEfficiency.score,
    capitalAllocation.score,
    resilience.score,
  ];

  const present = pillarScores.filter(s => s != null);
  if (present.length < 3) {
    return {
      composite: null,
      reason: `${4 - present.length} pillar(s) had insufficient data`,
      pillars: { compounding, capitalEfficiency, capitalAllocation, resilience },
    };
  }

  const composite = Math.round(present.reduce((a, b) => a + b, 0) / present.length);

  return {
    composite,
    pillars: { compounding, capitalEfficiency, capitalAllocation, resilience },
  };
}

// Display helpers (consumed by ScoreTable / ScoreBadge)

export function cellColor(value, fullThreshold, partialThreshold) {
  if (value == null) return 'gray';
  if (value >= fullThreshold) return 'green';
  if (value >= partialThreshold) return 'yellow';
  return 'red';
}

export function badgeColor(score) {
  if (score == null) return 'gray';
  if (score >= 70) return 'green';
  if (score >= 40) return 'yellow';
  return 'red';
}
