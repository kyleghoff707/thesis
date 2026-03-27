/**
 * simfin-collector.test.js — Unit tests for SimFin data collector
 *
 * Uses mocked fetch to test template detection, normalization, and error handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fetchSimfinData } from '../../../../validation/scripts/lib/simfin-collector.mjs';

const FIELD_MAPPING_PATH = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  '../fixtures/morningstar/field-mapping.json'
);

// ─── Fixture: SimFin compact API responses ───────────────────────────────────

function makeSimfinResponse(template, statement, columns, data) {
  return [
    {
      template,
      name: 'TEST INC',
      ticker: 'TEST',
      statements: [
        {
          statement,
          columns,
          data,
        },
      ],
    },
  ];
}

const GENERAL_PL = makeSimfinResponse('GENERAL', 'PL',
  ['Fiscal Period', 'Fiscal Year', 'Report Date', 'Revenue', 'Cost of revenue', 'Gross Profit', 'Selling, General & Administrative', 'Research & Development', 'Operating Income (Loss)', 'Interest Expense', 'Interest Income', 'Pretax Income (Loss)', 'Income Tax (Expense) Benefit, net', 'Net Income'],
  [
    ['FY', 2024, '2024-10-30', 391035000000, -210352000000, 180683000000, -26097000000, -31370000000, 123216000000, -3577000000, 3999000000, 130572000000, -29749000000, 93736000000],
    ['FY', 2023, '2023-10-27', 383285000000, -214137000000, 169148000000, -24932000000, -29915000000, 114301000000, -3468000000, 3750000000, 120570000000, -16741000000, 96995000000],
  ]
);

const GENERAL_BS = makeSimfinResponse('GENERAL', 'BS',
  ['Fiscal Period', 'Fiscal Year', 'Report Date', 'Total Assets', 'Total Current Assets', 'Cash & Cash Equivalents', 'Inventories', 'Total Liabilities', 'Total Current Liabilities', 'Long Term Debt', 'Equity Before Minority Interest', 'Retained Earnings'],
  [
    ['FY', 2024, '2024-10-30', 364980000000, 152987000000, 29943000000, 7286000000, 308030000000, 176392000000, 96806000000, 56950000000, -19154000000],
  ]
);

const GENERAL_CF = makeSimfinResponse('GENERAL', 'CF',
  ['Fiscal Period', 'Fiscal Year', 'Report Date', 'Cash from Operating Activities', 'Cash from Investing Activities', 'Cash from Financing Activities', 'Depreciation & Amortization (CF)', 'Stock-Based Compensation', 'Purchase of Fixed Assets', 'Dividends Paid', 'Net Changes in Cash'],
  [
    ['FY', 2024, '2024-10-30', 118254000000, 2935000000, -121983000000, 11445000000, 11688000000, -9959000000, -15234000000, -522000000],
  ]
);

const BANKS_PL = makeSimfinResponse('BANKS', 'PL',
  ['Fiscal Period', 'Fiscal Year', 'Report Date', 'Net Revenue', 'Net interest income', 'Provision for Loan Losses', 'Operating Income (Loss)', 'Pretax Income (Loss)', 'Income Tax (Expense) Benefit, net', 'Net Income'],
  [
    ['FY', 2024, '2024-01-15', 187000000000, 92000000000, -9400000000, 53700000000, 53700000000, -13200000000, 40500000000],
  ]
);

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('SimFin collector', () => {
  let tmpDir;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'simfin-cache-test-'));
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function mockFetch(plResponse, bsResponse, cfResponse) {
    let callCount = 0;
    const responses = [plResponse, bsResponse, cfResponse];
    globalThis.fetch = vi.fn(async () => {
      const resp = responses[callCount++];
      return { ok: true, json: async () => resp };
    });
  }

  it('returns canonical format with correct structure for GENERAL', async () => {
    mockFetch(GENERAL_PL, GENERAL_BS, GENERAL_CF);

    const result = await fetchSimfinData('AAPL', {
      apiKey: 'test-key',
      cacheDir: tmpDir,
      fieldMappingPath: FIELD_MAPPING_PATH,
    });

    expect(result).toHaveProperty('income');
    expect(result).toHaveProperty('balance');
    expect(result).toHaveProperty('cashFlow');
  });

  it('detects GENERAL template and applies correct field extraction', async () => {
    mockFetch(GENERAL_PL, GENERAL_BS, GENERAL_CF);

    const result = await fetchSimfinData('AAPL', {
      apiKey: 'test-key',
      cacheDir: tmpDir,
      fieldMappingPath: FIELD_MAPPING_PATH,
    });

    expect(result.income['2024'].revenues).toBe(391035000000);
    // SimFin cost_of_revenue is negative (-210352M), sign: -1, canonical = positive
    expect(result.income['2024'].cost_of_revenue).toBe(210352000000);
    expect(result.income['2024'].gross_profit).toBe(180683000000);
    expect(result.income['2024'].net_income_loss).toBe(93736000000);
  });

  it('uses Fiscal Year column for year keys', async () => {
    mockFetch(GENERAL_PL, GENERAL_BS, GENERAL_CF);

    const result = await fetchSimfinData('AAPL', {
      apiKey: 'test-key',
      cacheDir: tmpDir,
      fieldMappingPath: FIELD_MAPPING_PATH,
    });

    expect(result.income).toHaveProperty('2024');
    expect(result.income).toHaveProperty('2023');
  });

  it('normalizes negative expenses to positive for GENERAL', async () => {
    mockFetch(GENERAL_PL, GENERAL_BS, GENERAL_CF);

    const result = await fetchSimfinData('AAPL', {
      apiKey: 'test-key',
      cacheDir: tmpDir,
      fieldMappingPath: FIELD_MAPPING_PATH,
    });

    // SGA in SimFin is -26097M, sign: -1, canonical = +26097M
    expect(result.income['2024'].sga).toBe(26097000000);
    expect(result.income['2024'].research_and_development).toBe(31370000000);
    expect(result.income['2024'].interest_expense).toBe(3577000000);
    expect(result.income['2024'].income_tax_expense).toBe(29749000000);
  });

  it('handles BANKS template with Net Revenue', async () => {
    const banksBs = makeSimfinResponse('BANKS', 'BS',
      ['Fiscal Period', 'Fiscal Year', 'Report Date', 'Total Assets'],
      [['FY', 2024, '2024-01-15', 4000000000000]]
    );
    const banksCf = makeSimfinResponse('BANKS', 'CF',
      ['Fiscal Period', 'Fiscal Year', 'Report Date', 'Cash from Operating Activities'],
      [['FY', 2024, '2024-01-15', 50000000000]]
    );
    mockFetch(BANKS_PL, banksBs, banksCf);

    const result = await fetchSimfinData('JPM', {
      apiKey: 'test-key',
      cacheDir: tmpDir,
      fieldMappingPath: FIELD_MAPPING_PATH,
    });

    expect(result.income['2024'].revenues).toBe(187000000000);
    expect(result.income['2024'].net_interest_income).toBe(92000000000);
    expect(result.income['2024'].net_income_loss).toBe(40500000000);
    // Provision: -9400M * sign -1 = +9400M
    expect(result.income['2024'].provision_for_loan_losses).toBe(9400000000);
  });

  it('returns null on API error', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
    }));

    const result = await fetchSimfinData('AAPL', {
      apiKey: 'bad-key',
      cacheDir: tmpDir,
      fieldMappingPath: FIELD_MAPPING_PATH,
    });

    expect(result).toBeNull();
  });

  it('reads from cache on subsequent calls', async () => {
    mockFetch(GENERAL_PL, GENERAL_BS, GENERAL_CF);

    await fetchSimfinData('AAPL', {
      apiKey: 'test-key',
      cacheDir: tmpDir,
      fieldMappingPath: FIELD_MAPPING_PATH,
    });

    const result2 = await fetchSimfinData('AAPL', {
      apiKey: 'test-key',
      cacheDir: tmpDir,
      fieldMappingPath: FIELD_MAPPING_PATH,
    });

    // 3 calls for first fetch, 0 for second (cached)
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
    expect(result2.income['2024'].revenues).toBe(391035000000);
  });
});
