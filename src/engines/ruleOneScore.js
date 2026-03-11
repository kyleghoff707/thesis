// Rule One Score — Moat + Management scoring algorithm
// Reverse-engineered from Rule One Toolbox screenshots (AMAT, MNST, ILMN)
// Validated — see CLAUDE.md for full algorithm

// Scoring thresholds (per period)
// Rate >= 10% → 2 points (green)
// Rate >= 5%  → 1 point  (yellow)
// Rate < 5%   → 0 points (red)
function scoreRate(rate) {
  if (rate == null) return 0;
  if (rate >= 0.10) return 2;
  if (rate >= 0.05) return 1;
  return 0;
}

// Score a single metric across 4 periods (10yr, 7yr, 5yr, 3yr)
// 1yr is displayed but NOT scored
// Max points = 4 periods × 2 points = 8
// Metric score = totalPoints × 12.5 (max 100)
// Returns null if ALL scored periods are null (no data for this metric)
function scoreMetric(rates) {
  const scoredPeriods = ['10yr', '7yr', '5yr', '3yr'];
  let totalPoints = 0;
  let hasData = false;
  for (const p of scoredPeriods) {
    if (rates[p] != null) hasData = true;
    totalPoints += scoreRate(rates[p]);
  }
  if (!hasData) return null;
  return totalPoints * 12.5;
}

// Cell color for display
export function cellColor(rate) {
  if (rate == null) return 'gray';
  if (rate >= 0.10) return 'green';
  if (rate >= 0.05) return 'yellow';
  return 'red';
}

// Score badge color based on composite score
export function badgeColor(score) {
  if (score == null) return 'gray';
  if (score >= 70) return 'green';
  if (score >= 40) return 'yellow';
  return 'red';
}

// Moat Score — 5 growth metrics
// growthRates: output of computeAllGrowthRates() — { bvps, eps, revenue, operatingCash, fcf }
export function computeMoatScore(growthRates) {
  const metrics = ['bvps', 'earnings', 'revenue', 'operatingCash', 'fcf'];
  const scores = {};
  let total = 0;
  let count = 0;

  for (const m of metrics) {
    const rates = growthRates[m];
    if (rates && Object.keys(rates).length > 0) {
      const score = scoreMetric(rates);
      if (score != null) {
        scores[m] = score;
        total += score;
        count++;
      } else {
        scores[m] = null;
      }
    } else {
      scores[m] = null;
    }
  }

  const moatScore = count > 0 ? Math.round(total / count) : null;
  return { moatScore, metricScores: scores };
}

// Management Score — 3 return metrics + 2 debt metrics
// returnAverages: { '10yr': { roe, roic, roa }, '7yr': {...}, ... }
// debtMetrics: { netDebtToEarnings, netDebtToFCF, isNetCash }
export function computeManagementScore(returnAverages, debtMetrics) {
  // Score return metrics the same way as growth (threshold at 10%/5%)
  const returnMetrics = ['roe', 'roic', 'roa'];
  const scores = {};
  let total = 0;
  let count = 0;

  for (const metric of returnMetrics) {
    const rates = {};
    for (const p of ['10yr', '7yr', '5yr', '3yr']) {
      rates[p] = returnAverages[p]?.[metric] ?? null;
    }
    const score = scoreMetric(rates);
    if (score != null) {
      scores[metric] = score;
      total += score;
      count++;
    } else {
      scores[metric] = null;
    }
  }

  // Debt metrics scoring — binary per Rule One methodology
  // Can pay off debt in 3 years or less → green (100)
  // Cannot → red (0)
  // Null → excluded from score (metric has no data)
  const debtScore = (years) => {
    if (years == null) return null;
    if (years <= 0) return 100; // net cash
    if (years <= 3) return 100; // green — payable within 3 years
    return 0; // red — too much debt
  };

  scores.netDebtToEarnings = debtScore(debtMetrics.netDebtToEarnings);
  if (scores.netDebtToEarnings != null) {
    total += scores.netDebtToEarnings;
    count++;
  }

  scores.netDebtToFCF = debtScore(debtMetrics.netDebtToFCF);
  if (scores.netDebtToFCF != null) {
    total += scores.netDebtToFCF;
    count++;
  }

  const managementScore = count > 0 ? Math.round(total / count) : null;
  return { managementScore, metricScores: scores };
}

// Overall Rule One Score
export function computeRuleOneScore(moatScore, managementScore) {
  if (moatScore == null || managementScore == null) return null;
  return Math.round((moatScore + managementScore) / 2);
}
