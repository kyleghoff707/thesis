/**
 * mstarpy-collector.test.js — Unit tests for mstarpy data reader
 *
 * Tests nested tree flattening, scale multiplier, per-share handling,
 * and graceful degradation for missing tickers.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { readMstarpyData } from '../../../../validation/scripts/lib/mstarpy-collector.mjs';

const FIELD_MAPPING_PATH = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  '../fixtures/morningstar/field-mapping.json'
);

// ─── Helper: Create a mstarpy-format JSON fixture ────────────────────────────

function makeMstarpyFixture({ statementType, columnDefs, rows, orderOfMagnitude = 'Million' }) {
  return {
    _meta: {},
    columnDefs,
    rows,
    footer: {
      currency: 'USD',
      orderOfMagnitude,
      fiscalYearEndDate: '09-30',
    },
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('mstarpy collector', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mstarpy-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeFixture(ticker, income, balance, cashFlow) {
    const data = {
      _cachedAt: new Date().toISOString(),
      income,
      balance,
      cashFlow,
    };
    fs.writeFileSync(path.join(tmpDir, `${ticker}.json`), JSON.stringify(data, null, 2));
  }

  it('returns null when JSON file is missing (D-04 graceful degradation)', async () => {
    const result = await readMstarpyData('NONEXISTENT', {
      dataDir: tmpDir,
      fieldMappingPath: FIELD_MAPPING_PATH,
    });
    expect(result).toBeNull();
  });

  it('walks nested subLevel tree recursively to extract fields', async () => {
    const income = makeMstarpyFixture({
      statementType: 'income',
      columnDefs: ['2023', '2024'],
      rows: [
        {
          label: 'IncomeStatement',
          subLevel: [
            {
              label: 'Gross Profit',
              datum: [169148, 180683],
              subLevel: [
                { label: 'Total Revenue', datum: [383285, 391035] },
                { label: 'Cost of Revenue', datum: [-214137, -210352] },
              ],
            },
            {
              label: 'Pretax Income',
              datum: [120570, 130572],
            },
          ],
        },
      ],
    });

    writeFixture('AAPL', income, makeMstarpyFixture({ statementType: 'balance', columnDefs: ['2023', '2024'], rows: [] }), makeMstarpyFixture({ statementType: 'cashFlow', columnDefs: ['2023', '2024'], rows: [] }));

    const result = await readMstarpyData('AAPL', {
      dataDir: tmpDir,
      fieldMappingPath: FIELD_MAPPING_PATH,
    });

    // Revenue: 391035 * 1e6 * sign(1) = 391035000000
    expect(result.income['2024'].revenues).toBe(391035000000);
    // Cost: -210352 * 1e6 * sign(-1) = 210352000000
    expect(result.income['2024'].cost_of_revenue).toBe(210352000000);
    expect(result.income['2024'].gross_profit).toBe(180683000000);
    expect(result.income['2024'].pretax_income).toBe(130572000000);
  });

  it('multiplies values by 1e6 when orderOfMagnitude is Million', async () => {
    const income = makeMstarpyFixture({
      statementType: 'income',
      columnDefs: ['2024'],
      rows: [
        {
          label: 'IncomeStatement',
          subLevel: [
            { label: 'Total Revenue', datum: [100] },
          ],
        },
      ],
    });

    writeFixture('TEST', income, makeMstarpyFixture({ statementType: 'balance', columnDefs: ['2024'], rows: [] }), makeMstarpyFixture({ statementType: 'cashFlow', columnDefs: ['2024'], rows: [] }));

    const result = await readMstarpyData('TEST', {
      dataDir: tmpDir,
      fieldMappingPath: FIELD_MAPPING_PATH,
    });

    expect(result.income['2024'].revenues).toBe(100000000); // 100 * 1e6
  });

  it('does NOT scale per-share values (EPS)', async () => {
    const income = makeMstarpyFixture({
      statementType: 'income',
      columnDefs: ['2024'],
      rows: [
        {
          label: 'IncomeStatement',
          subLevel: [
            { label: 'Diluted EPS', datum: [6.08] },
            { label: 'Basic EPS', datum: [6.11] },
            { label: 'Diluted Weighted Average Shares Outstanding', datum: [15408] },
            { label: 'Basic Weighted Average Shares Outstanding', datum: [15343] },
          ],
        },
      ],
    });

    writeFixture('TEST', income, makeMstarpyFixture({ statementType: 'balance', columnDefs: ['2024'], rows: [] }), makeMstarpyFixture({ statementType: 'cashFlow', columnDefs: ['2024'], rows: [] }));

    const result = await readMstarpyData('TEST', {
      dataDir: tmpDir,
      fieldMappingPath: FIELD_MAPPING_PATH,
    });

    // EPS should NOT be multiplied by 1e6
    expect(result.income['2024'].diluted_eps).toBe(6.08);
    expect(result.income['2024'].basic_eps).toBe(6.11);
    // Share counts should NOT be multiplied by 1e6
    expect(result.income['2024'].diluted_shares_outstanding).toBe(15408);
    expect(result.income['2024'].basic_shares_outstanding).toBe(15343);
  });

  it('handles _PO_ sentinel values as null (skips them)', async () => {
    const income = makeMstarpyFixture({
      statementType: 'income',
      columnDefs: ['2023', '2024'],
      rows: [
        {
          label: 'IncomeStatement',
          subLevel: [
            { label: 'Total Revenue', datum: [100, '_PO_'] },
          ],
        },
      ],
    });

    writeFixture('TEST', income, makeMstarpyFixture({ statementType: 'balance', columnDefs: ['2023', '2024'], rows: [] }), makeMstarpyFixture({ statementType: 'cashFlow', columnDefs: ['2023', '2024'], rows: [] }));

    const result = await readMstarpyData('TEST', {
      dataDir: tmpDir,
      fieldMappingPath: FIELD_MAPPING_PATH,
    });

    expect(result.income['2023'].revenues).toBe(100000000);
    // 2024 should not have revenues (was _PO_)
    expect(result.income['2024']?.revenues).toBeUndefined();
  });

  it('filters out TTM column', async () => {
    const income = makeMstarpyFixture({
      statementType: 'income',
      columnDefs: ['2023', '2024', 'TTM'],
      rows: [
        {
          label: 'IncomeStatement',
          subLevel: [
            { label: 'Total Revenue', datum: [100, 200, 210] },
          ],
        },
      ],
    });

    writeFixture('TEST', income, makeMstarpyFixture({ statementType: 'balance', columnDefs: ['2023', '2024', 'TTM'], rows: [] }), makeMstarpyFixture({ statementType: 'cashFlow', columnDefs: ['2023', '2024', 'TTM'], rows: [] }));

    const result = await readMstarpyData('TEST', {
      dataDir: tmpDir,
      fieldMappingPath: FIELD_MAPPING_PATH,
    });

    expect(result.income).toHaveProperty('2023');
    expect(result.income).toHaveProperty('2024');
    expect(result.income).not.toHaveProperty('TTM');
  });

  it('handles balance sheet fields', async () => {
    const balance = makeMstarpyFixture({
      statementType: 'balance',
      columnDefs: ['2024'],
      rows: [
        {
          label: 'BalanceSheet',
          subLevel: [
            { label: 'Total Assets', datum: [364980] },
            { label: 'Total Liabilities', datum: [308030] },
            { label: 'Long Term Debt', datum: [96806] },
          ],
        },
      ],
    });

    writeFixture('TEST',
      makeMstarpyFixture({ statementType: 'income', columnDefs: ['2024'], rows: [] }),
      balance,
      makeMstarpyFixture({ statementType: 'cashFlow', columnDefs: ['2024'], rows: [] })
    );

    const result = await readMstarpyData('TEST', {
      dataDir: tmpDir,
      fieldMappingPath: FIELD_MAPPING_PATH,
    });

    expect(result.balance['2024'].total_assets).toBe(364980000000);
    expect(result.balance['2024'].total_liabilities).toBe(308030000000);
    expect(result.balance['2024'].long_term_debt).toBe(96806000000);
  });

  it('handles cash flow fields with sign flipping', async () => {
    const cashFlow = makeMstarpyFixture({
      statementType: 'cashFlow',
      columnDefs: ['2024'],
      rows: [
        {
          label: 'CashFlow',
          subLevel: [
            { label: 'Cash Flow from Operating Activities, Indirect', datum: [118254] },
            { label: 'Purchase of Property, Plant and Equipment', datum: [-9959] },
            { label: 'Common Stock Dividends Paid', datum: [-15234] },
          ],
        },
      ],
    });

    writeFixture('TEST',
      makeMstarpyFixture({ statementType: 'income', columnDefs: ['2024'], rows: [] }),
      makeMstarpyFixture({ statementType: 'balance', columnDefs: ['2024'], rows: [] }),
      cashFlow
    );

    const result = await readMstarpyData('TEST', {
      dataDir: tmpDir,
      fieldMappingPath: FIELD_MAPPING_PATH,
    });

    expect(result.cashFlow['2024'].operating_cash_flow).toBe(118254000000);
    // capex: -9959 * 1e6 * sign(-1) = 9959000000
    expect(result.cashFlow['2024'].capital_expenditures).toBe(9959000000);
    // dividends: -15234 * 1e6 * sign(-1) = 15234000000
    expect(result.cashFlow['2024'].dividends_paid).toBe(15234000000);
  });
});
