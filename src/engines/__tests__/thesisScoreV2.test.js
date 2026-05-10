import { describe, it, expect } from 'vitest';
import {
  scoreCompoundingPillar,
  scoreCapitalEfficiencyPillar,
  scoreCapitalAllocationPillar,
  scoreResiliencePillar,
  computeThesisScoreV2,
} from '../thesisScoreV2.js';

describe('scoreCompoundingPillar', () => {
  it('scores a strong steady compounder near 100', () => {
    const input = {
      growthRates: {
        bvps: { '10yr': 0.13, '5yr': 0.13 },
        operatingCash: { '10yr': 0.13, '5yr': 0.13 },
        fcf: { '10yr': 0.11, '5yr': 0.11 },
      },
      bvpsSeries: [0.13, 0.12, 0.13, 0.14, 0.12, 0.13, 0.13, 0.12, 0.14, 0.13],
      operatingCashSeries: [0.13, 0.12, 0.14, 0.13, 0.12, 0.13, 0.14, 0.12, 0.13, 0.13],
      fcfSeries: [0.11, 0.10, 0.12, 0.11, 0.10, 0.11, 0.12, 0.11, 0.10, 0.11],
    };
    const { score } = scoreCompoundingPillar(input);
    expect(score).toBeGreaterThanOrEqual(85);
  });

  it('scores a no-growth company near 0', () => {
    const input = {
      growthRates: {
        bvps: { '10yr': 0.02, '5yr': 0.01 },
        operatingCash: { '10yr': 0.03, '5yr': 0.02 },
        fcf: { '10yr': 0.01, '5yr': 0.00 },
      },
      bvpsSeries: [0.02, 0.01, 0.02, 0.01, 0.02, 0.02, 0.01, 0.02, 0.01, 0.02],
      operatingCashSeries: [0.03, 0.02, 0.02, 0.03, 0.02, 0.03, 0.02, 0.02, 0.03, 0.02],
      fcfSeries: [0.01, 0.00, 0.01, 0.00, 0.01, 0.01, 0.00, 0.01, 0.00, 0.01],
    };
    const { score } = scoreCompoundingPillar(input);
    expect(score).toBeLessThan(20);
  });

  it('penalizes lumpy growth even with high mean', () => {
    const steady = scoreCompoundingPillar({
      growthRates: {
        bvps: { '10yr': 0.12, '5yr': 0.12 },
        operatingCash: { '10yr': 0.12, '5yr': 0.12 },
        fcf: { '10yr': 0.10, '5yr': 0.10 },
      },
      bvpsSeries: Array(10).fill(0.12),
      operatingCashSeries: Array(10).fill(0.12),
      fcfSeries: Array(10).fill(0.10),
    });

    const lumpy = scoreCompoundingPillar({
      growthRates: {
        bvps: { '10yr': 0.12, '5yr': 0.12 },
        operatingCash: { '10yr': 0.12, '5yr': 0.12 },
        fcf: { '10yr': 0.10, '5yr': 0.10 },
      },
      bvpsSeries: [-0.20, 0.50, -0.10, 0.40, 0.05, 0.30, -0.15, 0.45, 0.10, 0.10],
      operatingCashSeries: [-0.20, 0.50, -0.10, 0.40, 0.05, 0.30, -0.15, 0.45, 0.10, 0.10],
      fcfSeries: [-0.20, 0.50, -0.10, 0.40, 0.05, 0.30, -0.15, 0.45, 0.10, 0.10],
    });

    expect(steady.score).toBeGreaterThan(lumpy.score);
  });

  it('returns null score when all metrics are missing', () => {
    const { score } = scoreCompoundingPillar({
      growthRates: { bvps: {}, operatingCash: {}, fcf: {} },
      bvpsSeries: [],
      operatingCashSeries: [],
      fcfSeries: [],
    });
    expect(score).toBeNull();
  });
});

describe('scoreCapitalEfficiencyPillar', () => {
  it('scores a high-ROIC, cash-rich, margin-expanding business near 100', () => {
    const { score } = scoreCapitalEfficiencyPillar({
      returnAverages: {
        '10yr': { roic: 0.20 },
        '5yr':  { roic: 0.22 },
      },
      roicSeries: [0.20, 0.21, 0.22, 0.20, 0.22, 0.21, 0.20, 0.22, 0.21, 0.22],
      fcfNiRatios: [1.05, 1.10, 1.00, 1.08, 1.05, 1.05, 1.10, 1.05, 1.00, 1.10],
      grossMarginSlope: 0.012,
    });
    expect(score).toBeGreaterThanOrEqual(85);
  });

  it('scores a leveraged-ROE-but-low-ROIC business well below 50', () => {
    const { score } = scoreCapitalEfficiencyPillar({
      returnAverages: {
        '10yr': { roic: 0.06 },
        '5yr':  { roic: 0.05 },
      },
      roicSeries: [0.06, 0.07, 0.05, 0.06, 0.06, 0.05, 0.07, 0.06, 0.05, 0.06],
      fcfNiRatios: [0.50, 0.60, 0.55, 0.50, 0.55, 0.50, 0.60, 0.50, 0.55, 0.60],
      grossMarginSlope: -0.008,
    });
    expect(score).toBeLessThan(40);
  });

  it('flags accruals red flag (FCF/NI < 0.7) by scoring cash quality at 0', () => {
    const { metrics } = scoreCapitalEfficiencyPillar({
      returnAverages: {
        '10yr': { roic: 0.18 },
        '5yr':  { roic: 0.18 },
      },
      roicSeries: Array(10).fill(0.18),
      fcfNiRatios: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
      grossMarginSlope: 0.0,
    });
    expect(metrics.cashQuality).toBeLessThan(40);
  });

  it('handles missing data with null metrics', () => {
    const { score, metrics } = scoreCapitalEfficiencyPillar({
      returnAverages: { '10yr': {}, '5yr': {} },
      roicSeries: [],
      fcfNiRatios: [],
      grossMarginSlope: null,
    });
    expect(score).toBeNull();
    expect(metrics.roic).toBeNull();
    expect(metrics.cashQuality).toBeNull();
    expect(metrics.grossMarginTrend).toBeNull();
  });
});

describe('scoreCapitalAllocationPillar', () => {
  it('rewards shrinking share count (buybacks) with full credit', () => {
    const { metrics } = scoreCapitalAllocationPillar({
      sharesOutstanding5yrPctChange: -0.05,
      dividendInfo: { isPayer: false },
      reinvestmentEffectiveness: 1.05,
    });
    expect(metrics.buybackDiscipline).toBe(100);
  });

  it('penalizes share dilution', () => {
    const { metrics } = scoreCapitalAllocationPillar({
      sharesOutstanding5yrPctChange: 0.08,
      dividendInfo: { isPayer: false },
      reinvestmentEffectiveness: 0.9,
    });
    expect(metrics.buybackDiscipline).toBe(0);
  });

  it('treats non-payers as neutral (70) on dividend track record', () => {
    const { metrics } = scoreCapitalAllocationPillar({
      sharesOutstanding5yrPctChange: -0.02,
      dividendInfo: { isPayer: false },
      reinvestmentEffectiveness: 1.0,
    });
    expect(metrics.dividendTrackRecord).toBe(70);
  });

  it('rewards consistent, FCF-covered, growing dividends with 100', () => {
    const { metrics } = scoreCapitalAllocationPillar({
      sharesOutstanding5yrPctChange: 0,
      dividendInfo: {
        isPayer: true,
        consecutiveYearsCovered: 10,
        cagr5yr: 0.08,
        latestPayoutRatio: 0.40,
      },
      reinvestmentEffectiveness: 1.0,
    });
    expect(metrics.dividendTrackRecord).toBe(100);
  });

  it('penalizes uncovered or cut dividends with 0', () => {
    const { metrics } = scoreCapitalAllocationPillar({
      sharesOutstanding5yrPctChange: 0,
      dividendInfo: {
        isPayer: true,
        consecutiveYearsCovered: 0,
        cagr5yr: -0.10,
        latestPayoutRatio: 1.5,
      },
      reinvestmentEffectiveness: 1.0,
    });
    expect(metrics.dividendTrackRecord).toBe(0);
  });

  it('reinvestment effectiveness >= 1.0 -> 100', () => {
    const { metrics } = scoreCapitalAllocationPillar({
      sharesOutstanding5yrPctChange: 0,
      dividendInfo: { isPayer: false },
      reinvestmentEffectiveness: 1.2,
    });
    expect(metrics.reinvestmentEffectiveness).toBe(100);
  });

  it('reinvestment effectiveness < 0.7 -> 0', () => {
    const { metrics } = scoreCapitalAllocationPillar({
      sharesOutstanding5yrPctChange: 0,
      dividendInfo: { isPayer: false },
      reinvestmentEffectiveness: 0.4,
    });
    expect(metrics.reinvestmentEffectiveness).toBe(0);
  });

  it('returns null pillar score when all metrics are missing', () => {
    const { score } = scoreCapitalAllocationPillar({
      sharesOutstanding5yrPctChange: null,
      dividendInfo: null,
      reinvestmentEffectiveness: null,
    });
    expect(score).toBeNull();
  });
});

describe('scoreResiliencePillar', () => {
  it('full credit for net cash + 20x interest coverage + 2.5 current ratio', () => {
    const { score } = scoreResiliencePillar({
      netDebtToFCF: -0.5,
      interestCoverage: 20,
      currentRatio: 2.5,
    });
    expect(score).toBe(100);
  });

  it('penalizes leveraged but solvent business', () => {
    const { score } = scoreResiliencePillar({
      netDebtToFCF: 5,
      interestCoverage: 4,
      currentRatio: 0.9,
    });
    expect(score).toBeLessThan(20);
  });

  it('handles 0-2 year debt as 75 per spec', () => {
    const { metrics } = scoreResiliencePillar({
      netDebtToFCF: 1.5,
      interestCoverage: 12,
      currentRatio: 1.8,
    });
    expect(metrics.netDebtToFCF).toBe(75);
  });

  it('handles 2-4 year debt as 35 per spec', () => {
    const { metrics } = scoreResiliencePillar({
      netDebtToFCF: 3,
      interestCoverage: 8,
      currentRatio: 1.2,
    });
    expect(metrics.netDebtToFCF).toBe(35);
  });

  it('returns null pillar when all metrics missing', () => {
    const { score } = scoreResiliencePillar({
      netDebtToFCF: null,
      interestCoverage: null,
      currentRatio: null,
    });
    expect(score).toBeNull();
  });
});

describe('computeThesisScoreV2 -- composite', () => {
  it('returns null when fewer than 5 years of public history', () => {
    const result = computeThesisScoreV2({
      statements: { years: [2024, 2023, 2022, 2021] },
      growthRates: {},
      returnMetrics: { averages: {} },
    });
    expect(result.composite).toBeNull();
    expect(result.reason).toMatch(/insufficient.*history/i);
  });

  it('returns full structure: composite + 4 pillars for a healthy company', () => {
    const result = computeThesisScoreV2(buildHealthyInput());
    expect(result.composite).toBeGreaterThanOrEqual(70);
    expect(result.pillars).toHaveProperty('compounding');
    expect(result.pillars).toHaveProperty('capitalEfficiency');
    expect(result.pillars).toHaveProperty('capitalAllocation');
    expect(result.pillars).toHaveProperty('resilience');
    for (const p of Object.values(result.pillars)) {
      expect(p).toHaveProperty('score');
      expect(p).toHaveProperty('metrics');
    }
  });

  it('returns null composite when 2+ pillars are null', () => {
    const result = computeThesisScoreV2({
      statements: { years: [2024, 2023, 2022, 2021, 2020], income: {}, balance: {}, cashFlow: {} },
      growthRates: {},
      returnMetrics: { averages: {}, yearly: [] },
      debtMetrics: null,
    });
    expect(result.composite).toBeNull();
  });
});

// Synthetic input matching real engine shapes.
// statements.years sorted newest-first (per fetchEdgarStatements convention).
// Balance uses equity_attributable_to_parent + shares_outstanding.
// growthRates._series has the underlying value series.
function buildHealthyInput() {
  const years = Array.from({ length: 11 }, (_, i) => 2014 + i); // 2014..2024
  const yearsNewestFirst = [...years].reverse();

  const incomeBy = {};
  const balanceBy = {};
  const cashFlowBy = {};
  const bvpsValues = [];
  const opCashValues = [];
  const fcfValues = [];

  for (const y of years) {
    const rev = 5000 * Math.pow(1.13, y - 2014);
    const cogs = 3000 * Math.pow(1.10, y - 2014); // grows slower -> rising margin
    const ni = 1000 * Math.pow(1.13, y - 2014);
    const ebit = 1500 * Math.pow(1.13, y - 2014);
    const opCash = 1100 * Math.pow(1.13, y - 2014);
    const fcf = 900 * Math.pow(1.11, y - 2014);
    const equity = 5000 * Math.pow(1.13, y - 2014);
    const shares = 1000 * Math.pow(0.99, y - 2014); // shrinking 1%/yr

    incomeBy[y] = {
      net_income_loss: ni,
      operating_income_loss: ebit,
      interest_expense: 50,
      revenues: rev,
      cost_of_revenue: cogs,
      gross_profit: rev - cogs,
    };
    balanceBy[y] = {
      equity_attributable_to_parent: equity,
      long_term_debt: 100,
      cash: 2000,
      assets: 8000 * Math.pow(1.13, y - 2014),
      shares_outstanding: shares,
      current_assets: 3000,
      current_liabilities: 1500,
    };
    cashFlowBy[y] = {
      net_cash_flow_from_operating_activities: opCash,
      free_cash_flow: fcf,
      capital_expenditures: opCash - fcf,
      dividends_paid: -200,
    };

    bvpsValues.push({ year: y, value: equity / shares });
    opCashValues.push({ year: y, value: opCash });
    fcfValues.push({ year: y, value: fcf });
  }

  return {
    statements: {
      years: yearsNewestFirst,
      income: incomeBy,
      balance: balanceBy,
      cashFlow: cashFlowBy,
    },
    growthRates: {
      bvps:          { '10yr': 0.13, '5yr': 0.13 },
      operatingCash: { '10yr': 0.13, '5yr': 0.13 },
      fcf:           { '10yr': 0.11, '5yr': 0.11 },
      _series: {
        bvps: bvpsValues,
        operatingCash: opCashValues,
        fcf: fcfValues,
      },
    },
    returnMetrics: {
      averages: {
        '10yr': { roic: 0.20 },
        '5yr':  { roic: 0.20 },
      },
      yearly: years.map(y => ({ year: y, roic: 0.20 })),
    },
    debtMetrics: { netDebtToFCF: -0.5, isNetCash: true },
  };
}
