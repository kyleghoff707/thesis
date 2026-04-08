/**
 * fiscal-aligner.test.js — Unit tests for fiscal year alignment
 *
 * Tests parseFiscalYearEnd and resolveYearOffset for all 19 non-December
 * FY companies in the Morningstar truth set.
 */

import { describe, it, expect } from 'vitest';
import { parseFiscalYearEnd, resolveYearOffset } from '../../../../validation/scripts/lib/fiscal-aligner.mjs';

// ─── parseFiscalYearEnd ──────────────────────────────────────

describe('parseFiscalYearEnd', () => {
  it('parses "Sep 30" correctly', () => {
    expect(parseFiscalYearEnd('Sep 30')).toEqual({ month: 'Sep', monthNum: 9 });
  });

  it('parses "Jan 31" correctly', () => {
    expect(parseFiscalYearEnd('Jan 31')).toEqual({ month: 'Jan', monthNum: 1 });
  });

  it('parses "Jun 30" correctly', () => {
    expect(parseFiscalYearEnd('Jun 30')).toEqual({ month: 'Jun', monthNum: 6 });
  });

  it('parses "Feb 28" correctly', () => {
    expect(parseFiscalYearEnd('Feb 28')).toEqual({ month: 'Feb', monthNum: 2 });
  });

  it('parses "Mar 31" correctly', () => {
    expect(parseFiscalYearEnd('Mar 31')).toEqual({ month: 'Mar', monthNum: 3 });
  });

  it('parses "May 31" correctly', () => {
    expect(parseFiscalYearEnd('May 31')).toEqual({ month: 'May', monthNum: 5 });
  });

  it('parses "Jul 31" correctly', () => {
    expect(parseFiscalYearEnd('Jul 31')).toEqual({ month: 'Jul', monthNum: 7 });
  });

  it('parses "Aug 31" correctly', () => {
    expect(parseFiscalYearEnd('Aug 31')).toEqual({ month: 'Aug', monthNum: 8 });
  });

  it('parses "Oct 31" correctly', () => {
    expect(parseFiscalYearEnd('Oct 31')).toEqual({ month: 'Oct', monthNum: 10 });
  });

  it('parses "Nov 30" correctly', () => {
    expect(parseFiscalYearEnd('Nov 30')).toEqual({ month: 'Nov', monthNum: 11 });
  });

  it('parses "Dec 31" correctly', () => {
    expect(parseFiscalYearEnd('Dec 31')).toEqual({ month: 'Dec', monthNum: 12 });
  });

  it('defaults to Dec for null', () => {
    expect(parseFiscalYearEnd(null)).toEqual({ month: 'Dec', monthNum: 12 });
  });

  it('defaults to Dec for undefined', () => {
    expect(parseFiscalYearEnd(undefined)).toEqual({ month: 'Dec', monthNum: 12 });
  });

  it('defaults to Dec for empty string', () => {
    expect(parseFiscalYearEnd('')).toEqual({ month: 'Dec', monthNum: 12 });
  });
});

// ─── resolveYearOffset ───────────────────────────────────────
// Uses mock engine data with known revenues to verify offset detection.
// The key distinction:
//   - Jan/Feb FY companies where fixtures were pre-shifted need offset +1
//   - All other non-Dec FY companies need offset 0

describe('resolveYearOffset', () => {
  // Helper: create mock engine data with specified revenues per year
  function mockEngineData(revenueByYear) {
    return {
      years: Object.keys(revenueByYear).map(Number).sort((a, b) => b - a),
      income: Object.fromEntries(
        Object.entries(revenueByYear).map(([y, rev]) => [Number(y), { revenues: rev }])
      ),
    };
  }

  // ─── AAPL (Sep 30 FY) — offset 0 ───
  it('returns 0 for AAPL (Sep FY)', () => {
    const fixture = {
      fiscalYearEnd: 'Sep 30',
      statements: {
        income: {
          '2021': { 'Total Revenue': 365817000000 },
          '2022': { 'Total Revenue': 394328000000 },
          '2023': { 'Total Revenue': 383285000000 },
          '2024': { 'Total Revenue': 391035000000 },
        },
      },
    };
    const engine = mockEngineData({
      2021: 365817000000,
      2022: 394328000000,
      2023: 383285000000,
      2024: 391035000000,
    });
    expect(resolveYearOffset(fixture, engine)).toBe(0);
  });

  // ─── LULU (Jan 31 FY) — fixture years 2022-2026, engine uses calendar year ───
  // LULU FY ending Jan 2023 labeled as "2022" in fixture but "2023" in engine
  // => offset = +1
  it('returns correct offset for LULU (Jan FY)', () => {
    const fixture = {
      fiscalYearEnd: 'Jan 31',
      statements: {
        income: {
          '2022': { 'Total Revenue': 6256617000 },
          '2023': { 'Total Revenue': 8110518000 },
          '2024': { 'Total Revenue': 9574380000 },
          '2025': { 'Total Revenue': 10591696000 },
        },
      },
    };
    // Engine labels by calendar year of FY end: Jan 2023 = 2023
    const engine = mockEngineData({
      2023: 6256617000,
      2024: 8110518000,
      2025: 9574380000,
      2026: 10591696000,
    });
    const offset = resolveYearOffset(fixture, engine);
    // fixture year 2022 + offset should match engine year 2023
    expect(offset).toBe(1);
  });

  // ─── ULTA (Jan 31 FY) — fixture years 2021-2025 ───
  it('returns correct offset for ULTA (Jan FY)', () => {
    const fixture = {
      fiscalYearEnd: 'Jan 31',
      statements: {
        income: {
          '2021': { 'Total Revenue': 6151953000 },
          '2022': { 'Total Revenue': 8631267000 },
          '2023': { 'Total Revenue': 10208575000 },
          '2024': { 'Total Revenue': 11206781000 },
        },
      },
    };
    const engine = mockEngineData({
      2022: 6151953000,
      2023: 8631267000,
      2024: 10208575000,
      2025: 11206781000,
    });
    expect(resolveYearOffset(fixture, engine)).toBe(1);
  });

  // ─── WSM (Jan 31 FY) — fixture years 2021-2025 ───
  it('returns correct offset for WSM (Jan FY)', () => {
    const fixture = {
      fiscalYearEnd: 'Jan 31',
      statements: {
        income: {
          '2021': { 'Total Revenue': 6783189000 },
          '2022': { 'Total Revenue': 8245936000 },
          '2023': { 'Total Revenue': 7587631000 },
          '2024': { 'Total Revenue': 7671055000 },
        },
      },
    };
    const engine = mockEngineData({
      2022: 6783189000,
      2023: 8245936000,
      2024: 7587631000,
      2025: 7671055000,
    });
    expect(resolveYearOffset(fixture, engine)).toBe(1);
  });

  // ─── CRM (Jan 31 FY) — fixture years 2022-2026 ───
  it('returns correct offset for CRM (Jan FY)', () => {
    const fixture = {
      fiscalYearEnd: 'Jan 31',
      statements: {
        income: {
          '2022': { 'Total Revenue': 26492000000 },
          '2023': { 'Total Revenue': 31352000000 },
          '2024': { 'Total Revenue': 34857000000 },
          '2025': { 'Total Revenue': 37884000000 },
        },
      },
    };
    const engine = mockEngineData({
      2023: 26492000000,
      2024: 31352000000,
      2025: 34857000000,
      2026: 37884000000,
    });
    expect(resolveYearOffset(fixture, engine)).toBe(1);
  });

  // ─── NVDA (Jan 31 FY) — fixture years 2022-2026 ───
  it('returns correct offset for NVDA (Jan FY)', () => {
    const fixture = {
      fiscalYearEnd: 'Jan 31',
      statements: {
        income: {
          '2022': { 'Total Revenue': 26914000000 },
          '2023': { 'Total Revenue': 26974000000 },
          '2024': { 'Total Revenue': 60922000000 },
          '2025': { 'Total Revenue': 130497000000 },
        },
      },
    };
    const engine = mockEngineData({
      2023: 26914000000,
      2024: 26974000000,
      2025: 60922000000,
      2026: 130497000000,
    });
    expect(resolveYearOffset(fixture, engine)).toBe(1);
  });

  // ─── MSFT (Jun 30 FY) — offset 0 ───
  it('returns 0 for MSFT (Jun FY)', () => {
    const fixture = {
      fiscalYearEnd: 'Jun 30',
      statements: {
        income: {
          '2021': { 'Total Revenue': 168088000000 },
          '2022': { 'Total Revenue': 198270000000 },
          '2023': { 'Total Revenue': 211915000000 },
          '2024': { 'Total Revenue': 245122000000 },
        },
      },
    };
    const engine = mockEngineData({
      2021: 168088000000,
      2022: 198270000000,
      2023: 211915000000,
      2024: 245122000000,
    });
    expect(resolveYearOffset(fixture, engine)).toBe(0);
  });

  // ─── PG (Jun 30 FY) — offset 0 ───
  it('returns 0 for PG (Jun FY)', () => {
    const fixture = {
      fiscalYearEnd: 'Jun 30',
      statements: {
        income: {
          '2021': { 'Total Revenue': 76118000000 },
          '2022': { 'Total Revenue': 80187000000 },
        },
      },
    };
    const engine = mockEngineData({
      2021: 76118000000,
      2022: 80187000000,
    });
    expect(resolveYearOffset(fixture, engine)).toBe(0);
  });

  // ─── NKE (May 31 FY) — offset 0 ───
  it('returns 0 for NKE (May FY)', () => {
    const fixture = {
      fiscalYearEnd: 'May 31',
      statements: {
        income: {
          '2021': { 'Total Revenue': 44538000000 },
          '2022': { 'Total Revenue': 46710000000 },
        },
      },
    };
    const engine = mockEngineData({
      2021: 44538000000,
      2022: 46710000000,
    });
    expect(resolveYearOffset(fixture, engine)).toBe(0);
  });

  // ─── COST (Aug 31 FY) — offset 0 ───
  it('returns 0 for COST (Aug FY)', () => {
    const fixture = {
      fiscalYearEnd: 'Aug 31',
      statements: {
        income: {
          '2021': { 'Total Revenue': 195929000000 },
          '2022': { 'Total Revenue': 226954000000 },
        },
      },
    };
    const engine = mockEngineData({
      2021: 195929000000,
      2022: 226954000000,
    });
    expect(resolveYearOffset(fixture, engine)).toBe(0);
  });

  // ─── MU (Aug 31 FY) — offset 0 ───
  it('returns 0 for MU (Aug FY)', () => {
    const fixture = {
      fiscalYearEnd: 'Aug 31',
      statements: {
        income: {
          '2021': { 'Total Revenue': 27705000000 },
          '2022': { 'Total Revenue': 30758000000 },
        },
      },
    };
    const engine = mockEngineData({
      2021: 27705000000,
      2022: 30758000000,
    });
    expect(resolveYearOffset(fixture, engine)).toBe(0);
  });

  // ─── SBUX (Sep 30 FY) — offset 0 ───
  it('returns 0 for SBUX (Sep FY)', () => {
    const fixture = {
      fiscalYearEnd: 'Sep 30',
      statements: {
        income: {
          '2021': { 'Total Revenue': 29060600000 },
          '2022': { 'Total Revenue': 32250300000 },
        },
      },
    };
    const engine = mockEngineData({
      2021: 29060600000,
      2022: 32250300000,
    });
    expect(resolveYearOffset(fixture, engine)).toBe(0);
  });

  // ─── V (Sep 30 FY) — offset 0 ───
  it('returns 0 for V (Sep FY)', () => {
    const fixture = {
      fiscalYearEnd: 'Sep 30',
      statements: {
        income: {
          '2021': { 'Total Revenue': 24105000000 },
          '2022': { 'Total Revenue': 29310000000 },
        },
      },
    };
    const engine = mockEngineData({
      2021: 24105000000,
      2022: 29310000000,
    });
    expect(resolveYearOffset(fixture, engine)).toBe(0);
  });

  // ─── CPRT (Jul 31 FY) — offset 0 ───
  it('returns 0 for CPRT (Jul FY)', () => {
    const fixture = {
      fiscalYearEnd: 'Jul 31',
      statements: {
        income: {
          '2021': { 'Total Revenue': 2692511000 },
          '2022': { 'Total Revenue': 3482000000 },
        },
      },
    };
    const engine = mockEngineData({
      2021: 2692511000,
      2022: 3482000000,
    });
    expect(resolveYearOffset(fixture, engine)).toBe(0);
  });

  // ─── INTU (Jul 31 FY) — offset 0 ───
  it('returns 0 for INTU (Jul FY)', () => {
    const fixture = {
      fiscalYearEnd: 'Jul 31',
      statements: {
        income: {
          '2021': { 'Total Revenue': 9633000000 },
          '2022': { 'Total Revenue': 12726000000 },
        },
      },
    };
    const engine = mockEngineData({
      2021: 9633000000,
      2022: 12726000000,
    });
    expect(resolveYearOffset(fixture, engine)).toBe(0);
  });

  // ─── AMAT (Oct 31 FY) — offset 0 ───
  it('returns 0 for AMAT (Oct FY)', () => {
    const fixture = {
      fiscalYearEnd: 'Oct 31',
      statements: {
        income: {
          '2021': { 'Total Revenue': 23063000000 },
          '2022': { 'Total Revenue': 25785000000 },
        },
      },
    };
    const engine = mockEngineData({
      2021: 23063000000,
      2022: 25785000000,
    });
    expect(resolveYearOffset(fixture, engine)).toBe(0);
  });

  // ─── LEN (Nov 30 FY) — offset 0 ───
  it('returns 0 for LEN (Nov FY)', () => {
    const fixture = {
      fiscalYearEnd: 'Nov 30',
      statements: {
        income: {
          '2021': { 'Total Revenue': 27130676000 },
          '2022': { 'Total Revenue': 33671362000 },
        },
      },
    };
    const engine = mockEngineData({
      2021: 27130676000,
      2022: 33671362000,
    });
    expect(resolveYearOffset(fixture, engine)).toBe(0);
  });

  // ─── BOOT (Mar 31 FY) — offset 0 ───
  it('returns 0 for BOOT (Mar FY)', () => {
    const fixture = {
      fiscalYearEnd: 'Mar 31',
      statements: {
        income: {
          '2021': { 'Total Revenue': 893491000 },
          '2022': { 'Total Revenue': 1490416000 },
        },
      },
    };
    const engine = mockEngineData({
      2021: 893491000,
      2022: 1490416000,
    });
    expect(resolveYearOffset(fixture, engine)).toBe(0);
  });

  // ─── WMS (Mar 31 FY) — offset 0 ───
  it('returns 0 for WMS (Mar FY)', () => {
    const fixture = {
      fiscalYearEnd: 'Mar 31',
      statements: {
        income: {
          '2021': { 'Total Revenue': 1982780000 },
          '2022': { 'Total Revenue': 2460780000 },
        },
      },
    };
    const engine = mockEngineData({
      2021: 1982780000,
      2022: 2460780000,
    });
    expect(resolveYearOffset(fixture, engine)).toBe(0);
  });

  // ─── Edge cases ───

  it('returns 0 when fixture has no income statements', () => {
    const fixture = {
      fiscalYearEnd: 'Dec 31',
      statements: { income: {} },
    };
    const engine = mockEngineData({ 2024: 100000 });
    expect(resolveYearOffset(fixture, engine)).toBe(0);
  });

  it('returns 0 when engine data is null', () => {
    const fixture = {
      fiscalYearEnd: 'Dec 31',
      statements: {
        income: { '2024': { 'Total Revenue': 100000 } },
      },
    };
    expect(resolveYearOffset(fixture, null)).toBe(0);
  });
});
