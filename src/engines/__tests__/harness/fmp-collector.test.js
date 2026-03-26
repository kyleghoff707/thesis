/**
 * fmp-collector.test.js — Unit tests for FMP data collector
 *
 * Uses mocked fetch to test normalization, caching, and error handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fetchFmpData } from '../../../../validation/scripts/lib/fmp-collector.mjs';

const FIELD_MAPPING_PATH = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  '../fixtures/morningstar/field-mapping.json'
);

// ─── Fixture: FMP API responses (2 years of AAPL data) ──────────────────────

const FMP_INCOME = [
  {
    date: '2024-09-28',
    symbol: 'AAPL',
    fiscalYear: 2024,
    period: 'FY',
    revenue: 391035000000,
    costOfRevenue: 210352000000,
    grossProfit: 180683000000,
    sellingGeneralAndAdministrativeExpenses: 26097000000,
    researchAndDevelopmentExpenses: 31370000000,
    operatingIncome: 123216000000,
    interestIncome: 3999000000,
    interestExpense: 3577000000,
    incomeBeforeTax: 130572000000,
    incomeTaxExpense: 29749000000,
    netIncome: 93736000000,
    epsDiluted: 6.08,
    weightedAverageShsOutDil: 15408095000,
  },
  {
    date: '2023-09-30',
    symbol: 'AAPL',
    fiscalYear: 2023,
    period: 'FY',
    revenue: 383285000000,
    costOfRevenue: 214137000000,
    grossProfit: 169148000000,
    operatingIncome: 114301000000,
    netIncome: 96995000000,
    epsDiluted: 6.13,
    weightedAverageShsOutDil: 15812547000,
  },
];

const FMP_BALANCE = [
  {
    date: '2024-09-28',
    symbol: 'AAPL',
    fiscalYear: 2024,
    period: 'FY',
    totalAssets: 364980000000,
    totalCurrentAssets: 152987000000,
    cashAndCashEquivalents: 29943000000,
    totalLiabilities: 308030000000,
    totalCurrentLiabilities: 176392000000,
    longTermDebt: 96806000000,
    totalStockholdersEquity: 56950000000,
    retainedEarnings: -19154000000,
    totalDebt: 106629000000,
    inventory: 7286000000,
    propertyPlantEquipmentNet: 44856000000,
    goodwill: 0,
    intangibleAssets: 0,
  },
];

const FMP_CASHFLOW = [
  {
    date: '2024-09-28',
    symbol: 'AAPL',
    fiscalYear: 2024,
    period: 'FY',
    netCashProvidedByOperatingActivities: 118254000000,
    netCashUsedForInvestingActivities: 2935000000,
    netCashUsedProvidedByFinancingActivities: -121983000000,
    capitalExpenditure: -9959000000,
    stockBasedCompensation: 11688000000,
    dividendsPaid: -15234000000,
    netChangeInCash: -522000000,
  },
];

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('FMP collector', () => {
  let tmpDir;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fmp-cache-test-'));
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function mockFetch(incomeData, balanceData, cashflowData) {
    globalThis.fetch = vi.fn(async (url) => {
      if (url.includes('income-statement')) {
        return { ok: true, json: async () => incomeData };
      }
      if (url.includes('balance-sheet-statement')) {
        return { ok: true, json: async () => balanceData };
      }
      if (url.includes('cash-flow-statement')) {
        return { ok: true, json: async () => cashflowData };
      }
      return { ok: false, status: 404 };
    });
  }

  it('returns canonical format with correct structure', async () => {
    mockFetch(FMP_INCOME, FMP_BALANCE, FMP_CASHFLOW);

    const result = await fetchFmpData('AAPL', {
      apiKey: 'test-key',
      cacheDir: tmpDir,
      fieldMappingPath: FIELD_MAPPING_PATH,
    });

    expect(result).toHaveProperty('income');
    expect(result).toHaveProperty('balance');
    expect(result).toHaveProperty('cashFlow');
  });

  it('uses fiscalYear for year keys (not date or calendarYear)', async () => {
    mockFetch(FMP_INCOME, FMP_BALANCE, FMP_CASHFLOW);

    const result = await fetchFmpData('AAPL', {
      apiKey: 'test-key',
      cacheDir: tmpDir,
      fieldMappingPath: FIELD_MAPPING_PATH,
    });

    expect(result.income).toHaveProperty('2024');
    expect(result.income).toHaveProperty('2023');
    expect(result.income).not.toHaveProperty('2024-09-28');
  });

  it('normalizes income values with correct sign', async () => {
    mockFetch(FMP_INCOME, FMP_BALANCE, FMP_CASHFLOW);

    const result = await fetchFmpData('AAPL', {
      apiKey: 'test-key',
      cacheDir: tmpDir,
      fieldMappingPath: FIELD_MAPPING_PATH,
    });

    expect(result.income['2024'].revenues).toBe(391035000000);
    expect(result.income['2024'].cost_of_revenue).toBe(210352000000);
    expect(result.income['2024'].net_income_loss).toBe(93736000000);
    expect(result.income['2024'].diluted_eps).toBe(6.08);
  });

  it('normalizes balance values', async () => {
    mockFetch(FMP_INCOME, FMP_BALANCE, FMP_CASHFLOW);

    const result = await fetchFmpData('AAPL', {
      apiKey: 'test-key',
      cacheDir: tmpDir,
      fieldMappingPath: FIELD_MAPPING_PATH,
    });

    expect(result.balance['2024'].total_assets).toBe(364980000000);
    expect(result.balance['2024'].stockholders_equity).toBe(56950000000);
    expect(result.balance['2024'].retained_earnings).toBe(-19154000000);
  });

  it('normalizes cash flow values with sign flipping for capex', async () => {
    mockFetch(FMP_INCOME, FMP_BALANCE, FMP_CASHFLOW);

    const result = await fetchFmpData('AAPL', {
      apiKey: 'test-key',
      cacheDir: tmpDir,
      fieldMappingPath: FIELD_MAPPING_PATH,
    });

    // FMP capex is -9959M, sign: -1, so canonical = -1 * -9959M = +9959M
    expect(result.cashFlow['2024'].capital_expenditures).toBe(9959000000);
    expect(result.cashFlow['2024'].operating_cash_flow).toBe(118254000000);
    expect(result.cashFlow['2024'].stock_based_compensation).toBe(11688000000);
  });

  it('reads from cache if file exists and is within TTL', async () => {
    mockFetch(FMP_INCOME, FMP_BALANCE, FMP_CASHFLOW);

    // First call: fetches from API and caches
    const result1 = await fetchFmpData('AAPL', {
      apiKey: 'test-key',
      cacheDir: tmpDir,
      fieldMappingPath: FIELD_MAPPING_PATH,
    });

    // Second call: should use cache, not fetch again
    const result2 = await fetchFmpData('AAPL', {
      apiKey: 'test-key',
      cacheDir: tmpDir,
      fieldMappingPath: FIELD_MAPPING_PATH,
    });

    // fetch called 3 times for first call (income, balance, cashFlow), 0 for second
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
    expect(result2.income['2024'].revenues).toBe(391035000000);
  });

  it('writes to cache after successful fetch', async () => {
    mockFetch(FMP_INCOME, FMP_BALANCE, FMP_CASHFLOW);

    await fetchFmpData('AAPL', {
      apiKey: 'test-key',
      cacheDir: tmpDir,
      fieldMappingPath: FIELD_MAPPING_PATH,
    });

    const cacheFile = path.join(tmpDir, 'AAPL-fmp.json');
    expect(fs.existsSync(cacheFile)).toBe(true);
  });

  it('returns null if API returns error', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 500,
      statusText: 'Server Error',
    }));

    const result = await fetchFmpData('AAPL', {
      apiKey: 'test-key',
      cacheDir: tmpDir,
      fieldMappingPath: FIELD_MAPPING_PATH,
    });

    expect(result).toBeNull();
  });
});
