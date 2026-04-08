// Tests for keyMetrics.js — 67 derived financial metrics
// Pure function tests: no mocks needed, computeKeyMetrics takes edgarData + optional price

import { describe, it, expect, beforeAll } from 'vitest';
import { computeKeyMetrics, KEY_METRICS_ROWS } from '../keyMetrics.js';

// ─── Test Fixture ───────────────────────────────────────────
// Synthetic EDGAR data with round numbers for easy hand-verification.
// 3 years: 2022, 2023, 2024

const FIXTURE = {
  years: [2024, 2023, 2022],
  income: {
    2024: {
      revenues: 1000000,
      cost_of_revenue: 400000,
      gross_profit: 600000,
      sga: 100000,
      operating_income_loss: 200000,
      income_before_tax: 180000,
      income_tax: 40000,
      net_income_loss: 140000,
      ebit: 200000,
      ebitda: 250000,
      basic_earnings_per_share: 1.50,
      diluted_earnings_per_share: 1.40,
      basic_average_shares: 100000,
      diluted_average_shares: 100000,
      dividends_per_share: 0.50,
      interest_expense: 20000,
    },
    2023: {
      revenues: 900000,
      cost_of_revenue: 360000,
      gross_profit: 540000,
      operating_income_loss: 180000,
      income_before_tax: 160000,
      income_tax: 36000,
      net_income_loss: 124000,
      ebit: 180000,
      ebitda: 230000,
      basic_earnings_per_share: 1.30,
      diluted_earnings_per_share: 1.24,
      basic_average_shares: 100000,
      diluted_average_shares: 100000,
      dividends_per_share: 0.40,
      interest_expense: 18000,
    },
    2022: {
      revenues: 800000,
      cost_of_revenue: 320000,
      gross_profit: 480000,
      operating_income_loss: 160000,
      income_before_tax: 140000,
      income_tax: 32000,
      net_income_loss: 108000,
      ebit: 160000,
      ebitda: 200000,
      basic_earnings_per_share: 1.10,
      diluted_earnings_per_share: 1.08,
      basic_average_shares: 100000,
      diluted_average_shares: 100000,
      dividends_per_share: 0.30,
      interest_expense: 16000,
    },
  },
  balance: {
    2024: {
      assets: 2000000,
      current_assets: 500000,
      cash: 200000,
      short_term_investments: 50000,
      accounts_receivable: 80000,
      inventory: 60000,
      property_plant_equipment: 400000,
      current_liabilities: 300000,
      accounts_payable: 70000,
      long_term_debt: 400000,
      total_debt: 500000,
      net_debt: 250000,
      equity_attributable_to_parent: 800000,
      equity: 800000,
      shares_outstanding: 100000,
      cash_and_marketable_securities: 250000,
    },
    2023: {
      assets: 1800000,
      current_assets: 450000,
      cash: 180000,
      short_term_investments: 40000,
      accounts_receivable: 70000,
      inventory: 55000,
      property_plant_equipment: 380000,
      current_liabilities: 280000,
      accounts_payable: 65000,
      long_term_debt: 380000,
      total_debt: 480000,
      net_debt: 260000,
      equity_attributable_to_parent: 700000,
      equity: 700000,
      shares_outstanding: 100000,
      cash_and_marketable_securities: 220000,
    },
    2022: {
      assets: 1600000,
      current_assets: 400000,
      cash: 160000,
      short_term_investments: 30000,
      accounts_receivable: 60000,
      inventory: 50000,
      property_plant_equipment: 360000,
      current_liabilities: 260000,
      accounts_payable: 60000,
      long_term_debt: 360000,
      total_debt: 460000,
      net_debt: 270000,
      equity_attributable_to_parent: 600000,
      equity: 600000,
      shares_outstanding: 100000,
      cash_and_marketable_securities: 190000,
    },
  },
  cashFlow: {
    2024: {
      net_cash_flow_from_operating_activities: 300000,
      capital_expenditures: 100000,
      free_cash_flow: 200000,
      share_repurchases: -50000,
      dividends_paid: -50000,
    },
    2023: {
      net_cash_flow_from_operating_activities: 270000,
      capital_expenditures: 90000,
      free_cash_flow: 180000,
      share_repurchases: -40000,
      dividends_paid: -40000,
    },
    2022: {
      net_cash_flow_from_operating_activities: 240000,
      capital_expenditures: 80000,
      free_cash_flow: 160000,
      share_repurchases: -30000,
      dividends_paid: -30000,
    },
  },
};

const LATEST_PRICE = 28; // $28 per share

// ─── Helper ─────────────────────────────────────────────────

function getMetric(result, year, category, field) {
  return result.metrics[year]?.[category]?.[field];
}

// ─── Null / Edge Input Handling ─────────────────────────────

describe('Null and edge input handling', () => {
  it('returns null for null input', () => {
    expect(computeKeyMetrics(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(computeKeyMetrics(undefined)).toBeNull();
  });

  it('returns null for empty years', () => {
    expect(computeKeyMetrics({ years: [], income: {}, balance: {}, cashFlow: {} })).toBeNull();
  });

  it('returns null Change metrics for single year', () => {
    const singleYear = {
      years: [2024],
      income: { 2024: FIXTURE.income[2024] },
      balance: { 2024: FIXTURE.balance[2024] },
      cashFlow: { 2024: FIXTURE.cashFlow[2024] },
    };
    const result = computeKeyMetrics(singleYear);
    expect(result).not.toBeNull();
    expect(getMetric(result, 2024, 'perShare', 'bookValuePerShareChange')).toBeNull();
    expect(getMetric(result, 2024, 'perShare', 'basicEPSChange')).toBeNull();
  });

  it('returns null for zero equity (no Infinity)', () => {
    const zeroEquity = {
      years: [2024],
      income: { 2024: FIXTURE.income[2024] },
      balance: { 2024: { ...FIXTURE.balance[2024], equity_attributable_to_parent: 0, equity: 0 } },
      cashFlow: { 2024: FIXTURE.cashFlow[2024] },
    };
    const result = computeKeyMetrics(zeroEquity);
    expect(getMetric(result, 2024, 'profitability', 'roe')).toBeNull();
    // BVPS = 0/100000 = 0 (valid, not null — zero equity is a real value)
    expect(getMetric(result, 2024, 'perShare', 'bookValuePerShare')).toBe(0);
  });

  it('returns null margins for zero revenue', () => {
    const zeroRev = {
      years: [2024],
      income: { 2024: { ...FIXTURE.income[2024], revenues: 0 } },
      balance: { 2024: FIXTURE.balance[2024] },
      cashFlow: { 2024: FIXTURE.cashFlow[2024] },
    };
    const result = computeKeyMetrics(zeroRev);
    expect(getMetric(result, 2024, 'profitability', 'grossMargin')).toBeNull();
    expect(getMetric(result, 2024, 'profitability', 'operatingMargin')).toBeNull();
    // salesPerShare = 0/100000 = 0 (valid, not null — zero revenue is a real value)
    expect(getMetric(result, 2024, 'perShare', 'salesPerShare')).toBe(0);
  });
});

// ─── Per Share Metrics ──────────────────────────────────────

describe('Per Share metrics', () => {
  let result;
  beforeAll(() => { result = computeKeyMetrics(FIXTURE); });

  it('bookValuePerShare = equity / sharesOutstanding', () => {
    // 800000 / 100000 = 8.0
    expect(getMetric(result, 2024, 'perShare', 'bookValuePerShare')).toBeCloseTo(8.0);
  });

  it('bookValuePerShareChange is correct YoY', () => {
    // 2023 BVPS = 700000/100000 = 7.0, 2024 BVPS = 8.0
    // Change = ((8 - 7) / |7|) * 100 = 14.29%
    expect(getMetric(result, 2024, 'perShare', 'bookValuePerShareChange')).toBeCloseTo(14.286, 1);
  });

  it('basicEPS passes through from input', () => {
    expect(getMetric(result, 2024, 'perShare', 'basicEPS')).toBe(1.50);
  });

  it('dilutedEPS passes through from input', () => {
    expect(getMetric(result, 2024, 'perShare', 'dilutedEPS')).toBe(1.40);
  });

  it('operatingCFPerShare = opCF / dilutedAvgShares', () => {
    // 300000 / 100000 = 3.0
    expect(getMetric(result, 2024, 'perShare', 'operatingCFPerShare')).toBeCloseTo(3.0);
  });

  it('salesPerShare = revenue / dilutedAvgShares', () => {
    // 1000000 / 100000 = 10.0
    expect(getMetric(result, 2024, 'perShare', 'salesPerShare')).toBeCloseTo(10.0);
  });

  it('buybacksPerShare = |share_repurchases| / shares', () => {
    // |(-50000)| / 100000 = 0.50
    expect(getMetric(result, 2024, 'perShare', 'buybacksPerShare')).toBeCloseTo(0.50);
  });

  it('dividendPerShare passes through from input', () => {
    expect(getMetric(result, 2024, 'perShare', 'dividendPerShare')).toBe(0.50);
  });

  it('payoutRatio = dps / epsDiluted', () => {
    // 0.50 / 1.40 = 0.3571
    expect(getMetric(result, 2024, 'perShare', 'payoutRatio')).toBeCloseTo(0.3571, 3);
  });

  it('payoutRatio is null when EPS <= 0', () => {
    const negEps = {
      years: [2024],
      income: { 2024: { ...FIXTURE.income[2024], diluted_earnings_per_share: -0.50 } },
      balance: { 2024: FIXTURE.balance[2024] },
      cashFlow: { 2024: FIXTURE.cashFlow[2024] },
    };
    const r = computeKeyMetrics(negEps);
    expect(getMetric(r, 2024, 'perShare', 'payoutRatio')).toBeNull();
  });
});

// ─── Liquidity Metrics ���─────────────────────────────────────

describe('Liquidity metrics', () => {
  let result;
  beforeAll(() => { result = computeKeyMetrics(FIXTURE); });

  it('currentRatio = currentAssets / currentLiabilities', () => {
    // 500000 / 300000 = 1.667
    expect(getMetric(result, 2024, 'liquidity', 'currentRatio')).toBeCloseTo(1.667, 2);
  });

  it('quickRatio = (cash + shortTermInv + receivables) / currentLiabilities', () => {
    // (200000 + 50000 + 80000) / 300000 = 330000 / 300000 = 1.1
    expect(getMetric(result, 2024, 'liquidity', 'quickRatio')).toBeCloseTo(1.1, 2);
  });

  it('cashRatio = cash / currentLiabilities', () => {
    // cash_and_marketable_securities = 250000 / 300000 = 0.833
    expect(getMetric(result, 2024, 'liquidity', 'cashRatio')).toBeCloseTo(0.833, 2);
  });

  it('timesInterestEarned = operatingIncome / interestExpense', () => {
    // 200000 / 20000 = 10.0
    expect(getMetric(result, 2024, 'liquidity', 'timesInterestEarned')).toBeCloseTo(10.0);
  });

  it('workingCapital = currentAssets - currentLiabilities', () => {
    // 500000 - 300000 = 200000
    expect(getMetric(result, 2024, 'liquidity', 'workingCapital')).toBe(200000);
  });

  it('workingCapital is null when inputs missing', () => {
    const noCA = {
      years: [2024],
      income: { 2024: FIXTURE.income[2024] },
      balance: { 2024: { ...FIXTURE.balance[2024], current_assets: undefined } },
      cashFlow: { 2024: FIXTURE.cashFlow[2024] },
    };
    const r = computeKeyMetrics(noCA);
    expect(getMetric(r, 2024, 'liquidity', 'workingCapital')).toBeNull();
  });
});

// ─── Profitability Metrics ──────────────────────────────────

describe('Profitability metrics', () => {
  let result;
  beforeAll(() => { result = computeKeyMetrics(FIXTURE); });

  it('grossMargin = (grossProfit / revenue) * 100', () => {
    // (600000 / 1000000) * 100 = 60.0%
    expect(getMetric(result, 2024, 'profitability', 'grossMargin')).toBeCloseTo(60.0);
  });

  it('operatingMargin = (operatingIncome / revenue) * 100', () => {
    // (200000 / 1000000) * 100 = 20.0%
    expect(getMetric(result, 2024, 'profitability', 'operatingMargin')).toBeCloseTo(20.0);
  });

  it('profitMarginContinuing = (netIncome / revenue) * 100', () => {
    // (140000 / 1000000) * 100 = 14.0%
    expect(getMetric(result, 2024, 'profitability', 'profitMarginContinuing')).toBeCloseTo(14.0);
  });

  it('roe = (netIncome / equity) * 100', () => {
    // (140000 / 800000) * 100 = 17.5%
    expect(getMetric(result, 2024, 'profitability', 'roe')).toBeCloseTo(17.5);
  });

  it('roa = (netIncome / totalAssets) * 100', () => {
    // (140000 / 2000000) * 100 = 7.0%
    expect(getMetric(result, 2024, 'profitability', 'roa')).toBeCloseTo(7.0);
  });

  it('roic = (netIncome / (equity + ltDebt)) * 100', () => {
    // (140000 / (800000 + 400000)) * 100 = 11.667%
    expect(getMetric(result, 2024, 'profitability', 'roic')).toBeCloseTo(11.667, 1);
  });

  it('ebitMargin = (ebit / revenue) * 100', () => {
    // (200000 / 1000000) * 100 = 20.0%
    expect(getMetric(result, 2024, 'profitability', 'ebitMargin')).toBeCloseTo(20.0);
  });

  it('ebitdaMargin = (ebitda / revenue) * 100', () => {
    // (250000 / 1000000) * 100 = 25.0%
    expect(getMetric(result, 2024, 'profitability', 'ebitdaMargin')).toBeCloseTo(25.0);
  });
});

// ─── Debt Ratios ────────────────────────────────────────────

describe('Debt Ratios', () => {
  let result;
  beforeAll(() => { result = computeKeyMetrics(FIXTURE); });

  it('ltDebtToEquity = ltDebt / equity', () => {
    // 400000 / 800000 = 0.5
    expect(getMetric(result, 2024, 'debtRatios', 'ltDebtToEquity')).toBeCloseTo(0.5);
  });

  it('debtToTotalCapital = ltDebt / (equity + ltDebt)', () => {
    // 400000 / (800000 + 400000) = 0.333
    expect(getMetric(result, 2024, 'debtRatios', 'debtToTotalCapital')).toBeCloseTo(0.333, 2);
  });

  it('netDebtToEarnings = 0 when net debt <= 0', () => {
    const negNetDebt = {
      years: [2024],
      income: { 2024: FIXTURE.income[2024] },
      balance: { 2024: { ...FIXTURE.balance[2024], net_debt: -100000 } },
      cashFlow: { 2024: FIXTURE.cashFlow[2024] },
    };
    const r = computeKeyMetrics(negNetDebt);
    expect(getMetric(r, 2024, 'debtRatios', 'netDebtToEarnings')).toBe(0);
  });

  it('netDebtToEarnings positive when net debt > 0', () => {
    // 250000 / 140000 = 1.786
    expect(getMetric(result, 2024, 'debtRatios', 'netDebtToEarnings')).toBeCloseTo(1.786, 2);
  });

  it('ebitdaInterestCoverage = ebitda / interestExpense', () => {
    // 250000 / 20000 = 12.5
    expect(getMetric(result, 2024, 'debtRatios', 'ebitdaInterestCoverage')).toBeCloseTo(12.5);
  });

  it('ebitdaInterestCoverage is null when no interest expense', () => {
    const noInt = {
      years: [2024],
      income: { 2024: { ...FIXTURE.income[2024], interest_expense: null } },
      balance: { 2024: FIXTURE.balance[2024] },
      cashFlow: { 2024: FIXTURE.cashFlow[2024] },
    };
    const r = computeKeyMetrics(noInt);
    expect(getMetric(r, 2024, 'debtRatios', 'ebitdaInterestCoverage')).toBeNull();
  });
});

// ─── Operating Metrics ──────────────────────────────────────

describe('Operating metrics', () => {
  let result;
  beforeAll(() => { result = computeKeyMetrics(FIXTURE); });

  it('assetTurnover = revenue / totalAssets', () => {
    // 1000000 / 2000000 = 0.5
    expect(getMetric(result, 2024, 'operating', 'assetTurnover')).toBeCloseTo(0.5);
  });

  it('receivableTurnover = revenue / receivables', () => {
    // 1000000 / 80000 = 12.5
    expect(getMetric(result, 2024, 'operating', 'receivableTurnover')).toBeCloseTo(12.5);
  });

  it('inventoryTurnover = COGS / inventory', () => {
    // 400000 / 60000 = 6.667
    expect(getMetric(result, 2024, 'operating', 'inventoryTurnover')).toBeCloseTo(6.667, 2);
  });

  it('cashConversionCycle = daysReceivable + daysInventory - daysPayable', () => {
    // receivableTurnover = 12.5 → 365/12.5 = 29.2 days
    // inventoryTurnover = 6.667 → 365/6.667 = 54.75 days
    // payableTurnover = COGS/payables = 400000/70000 = 5.714 → 365/5.714 = 63.88 days
    // CCC = 29.2 + 54.75 - 63.88 = 20.07
    expect(getMetric(result, 2024, 'operating', 'cashConversionCycle')).toBeCloseTo(20.07, 0);
  });

  it('fcfRatio = FCF / netIncome', () => {
    // 200000 / 140000 = 1.4286
    expect(getMetric(result, 2024, 'operating', 'fcfRatio')).toBeCloseTo(1.4286, 3);
  });

  it('opCFToNetIncome = opCF / netIncome', () => {
    // 300000 / 140000 = 2.1429
    expect(getMetric(result, 2024, 'operating', 'opCFToNetIncome')).toBeCloseTo(2.1429, 3);
  });

  it('opCFToNetIncome is null when netIncome is zero', () => {
    const zeroNI = {
      years: [2024],
      income: { 2024: { ...FIXTURE.income[2024], net_income_loss: 0 } },
      balance: { 2024: FIXTURE.balance[2024] },
      cashFlow: { 2024: FIXTURE.cashFlow[2024] },
    };
    const r = computeKeyMetrics(zeroNI);
    expect(getMetric(r, 2024, 'operating', 'opCFToNetIncome')).toBeNull();
  });
});

// ─── Price Metrics ──────────────────────────────────────────

describe('Price metrics', () => {
  let result;
  beforeAll(() => { result = computeKeyMetrics(FIXTURE, LATEST_PRICE); });

  it('peRatio = price / epsDiluted (latest year only)', () => {
    // 28 / 1.40 = 20.0
    expect(getMetric(result, 2024, 'price', 'peRatio')).toBeCloseTo(20.0);
  });

  it('priceToBook = price / bvps', () => {
    // 28 / 8.0 = 3.5
    expect(getMetric(result, 2024, 'price', 'priceToBook')).toBeCloseTo(3.5);
  });

  it('priceToSales = price / salesPerShare', () => {
    // 28 / 10.0 = 2.8
    expect(getMetric(result, 2024, 'price', 'priceToSales')).toBeCloseTo(2.8);
  });

  it('dividendYield = (dps / price) * 100', () => {
    // (0.50 / 28) * 100 = 1.786%
    expect(getMetric(result, 2024, 'price', 'dividendYield')).toBeCloseTo(1.786, 2);
  });

  it('shareholderYield = (dividendsPaid + buybacks) / marketCap * 100', () => {
    // dividendsPaidTotal = |(-50000)| = 50000
    // buybacksTotal = |(-50000)| = 50000
    // marketCap = 28 * 100000 = 2800000
    // (50000 + 50000) / 2800000 * 100 = 3.571%
    expect(getMetric(result, 2024, 'price', 'shareholderYield')).toBeCloseTo(3.571, 2);
  });

  it('price metrics are null for non-latest years', () => {
    expect(getMetric(result, 2023, 'price', 'peRatio')).toBeNull();
    expect(getMetric(result, 2023, 'price', 'priceToBook')).toBeNull();
    expect(getMetric(result, 2023, 'price', 'shareholderYield')).toBeNull();
  });

  it('price metrics are null when no price provided', () => {
    const noPrice = computeKeyMetrics(FIXTURE);
    expect(getMetric(noPrice, 2024, 'price', 'peRatio')).toBeNull();
    expect(getMetric(noPrice, 2024, 'price', 'shareholderYield')).toBeNull();
  });
});

// ─── KEY_METRICS_ROWS Structure ─────────────────────────────

describe('KEY_METRICS_ROWS structure', () => {
  it('has all 7 categories', () => {
    const categories = Object.keys(KEY_METRICS_ROWS);
    expect(categories).toEqual(
      expect.arrayContaining(['perShare', 'shares', 'liquidity', 'profitability', 'debtRatios', 'operating', 'price'])
    );
    expect(categories).toHaveLength(7);
  });

  it('has 67 total row definitions', () => {
    let total = 0;
    for (const cat of Object.values(KEY_METRICS_ROWS)) {
      total += cat.rows.length;
    }
    expect(total).toBe(61);
  });

  it('every row has key, label, and format', () => {
    for (const [catKey, cat] of Object.entries(KEY_METRICS_ROWS)) {
      for (const row of cat.rows) {
        expect(row.key, `${catKey} row missing key`).toBeDefined();
        expect(row.label, `${catKey}.${row.key} missing label`).toBeDefined();
        expect(row.format, `${catKey}.${row.key} missing format`).toBeDefined();
      }
    }
  });

  it('includes the 5 new metrics', () => {
    const allKeys = Object.values(KEY_METRICS_ROWS).flatMap(cat => cat.rows.map(r => r.key));
    expect(allKeys).toContain('payoutRatio');
    expect(allKeys).toContain('workingCapital');
    expect(allKeys).toContain('ebitdaInterestCoverage');
    expect(allKeys).toContain('opCFToNetIncome');
    expect(allKeys).toContain('shareholderYield');
  });
});

// ─── Year Sorting ───────────────────────────────────────────

describe('Year sorting', () => {
  it('returns years in descending order for display', () => {
    const result = computeKeyMetrics(FIXTURE);
    expect(result.years).toEqual([2024, 2023, 2022]);
  });

  it('computes metrics for ascending-sorted input', () => {
    const ascending = { ...FIXTURE, years: [2022, 2023, 2024] };
    const result = computeKeyMetrics(ascending);
    expect(result.years).toEqual([2024, 2023, 2022]);
    // Metrics should still be correct
    expect(getMetric(result, 2024, 'profitability', 'grossMargin')).toBeCloseTo(60.0);
  });
});
