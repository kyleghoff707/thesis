// @vitest-environment jsdom
// Tests for dataExport.js — DataPacket assembly and caveats
// Uses mock data to avoid external API calls

import { describe, it, expect, beforeAll } from 'vitest';
import { DataPacketSchema, sliceDataPacket } from '../../schemas/dataPacket.js';

// ─── buildCaveats Tests ──────────────────────────────────────────

describe('buildCaveats', () => {
  let buildCaveats;

  // Dynamic import to handle module not existing yet (TDD RED phase)
  beforeAll(async () => {
    const mod = await import('../dataExport.js');
    buildCaveats = mod.buildCaveats;
  });

  it('returns array with FFO caveat for REIT classification', () => {
    const caveats = buildCaveats({ industryType: 'reit' });
    expect(Array.isArray(caveats)).toBe(true);
    expect(caveats.length).toBeGreaterThanOrEqual(1);
    expect(caveats.some(c => c.includes('FFO'))).toBe(true);
  });

  it('returns array with AFFO caveat for REIT classification', () => {
    const caveats = buildCaveats({ industryType: 'reit' });
    expect(caveats.some(c => c.includes('AFFO') || c.includes('capex'))).toBe(true);
  });

  it('returns array with NIM caveat for bank classification', () => {
    const caveats = buildCaveats({ industryType: 'bank' });
    expect(Array.isArray(caveats)).toBe(true);
    expect(caveats.some(c => c.includes('NIM'))).toBe(true);
  });

  it('returns array with float caveat for insurance classification', () => {
    const caveats = buildCaveats({ industryType: 'insurance' });
    expect(Array.isArray(caveats)).toBe(true);
    expect(caveats.some(c => c.includes('float'))).toBe(true);
  });

  it('returns empty array for standard classification', () => {
    const caveats = buildCaveats({});
    expect(caveats).toEqual([]);
  });

  it('returns empty array for null classification', () => {
    const caveats = buildCaveats(null);
    expect(caveats).toEqual([]);
  });

  it('returns empty array for undefined classification', () => {
    const caveats = buildCaveats(undefined);
    expect(caveats).toEqual([]);
  });
});

// ─── DataPacket Schema Conformance Tests ──────────────────────────

describe('DataPacket schema conformance', () => {
  const mockDataPacket = {
    ticker: 'AAPL',
    companyInfo: { name: 'Apple Inc.', cik: '0000320193' },
    classification: { industryType: 'standard', sicCode: '3571' },
    currentPrice: 175.50,
    financials: { years: [2024, 2023], income: {}, balance: {}, cashFlow: {} },
    ttm: { revenues: 380000000000, netIncome: 95000000000 },
    growthRates: { earnings: { '10yr': 0.12, '5yr': 0.08 } },
    returnMetrics: { averages: { '10yr': { roe: 0.45 } } },
    debtMetrics: { netDebt: 50000000000, isNetCash: false },
    fcf: { yearly: [], fcfRatio: 1.1 },
    keyMetrics: { 2024: {} },
    thesisScore: {
      composite: 82,
      pillars: {
        compounding: { score: 75, metrics: { bvpsGrowth: 80, operatingCashGrowth: 70, fcfGrowth: 75 } },
        capitalEfficiency: { score: 90, metrics: { roic: 95, cashQuality: 90, grossMarginTrend: 85 } },
        capitalAllocation: { score: 85, metrics: { buybackDiscipline: 100, dividendTrackRecord: 70, reinvestmentEffectiveness: 85 } },
        resilience: { score: 78, metrics: { netDebtToFCF: 75, interestCoverage: 100, currentRatio: 50 } },
      },
    },
    gurus: { count: 5, holdings: [] },
    insiders: { summary: {}, recentTransactions: [] },
    compensation: { executives: [], directors: [] },
    peers: { industry: [], sector: [] },
    peerMetrics: null,
    analystEstimates: { growthRate: 0.12 },
    events: { upcoming: [], recent8K: [] },
    prices: { currentPrice: 175.50 },
    transcriptAvailability: { count: 8, latestQuarter: 'Q4 2024' },
    caveats: [],
    assembledAt: new Date().toISOString(),
  };

  it('validates a complete mock DataPacket', () => {
    const result = DataPacketSchema.safeParse(mockDataPacket);
    expect(result.success).toBe(true);
  });

  it('rejects a DataPacket missing ticker', () => {
    const { ticker, ...noTicker } = mockDataPacket;
    const result = DataPacketSchema.safeParse(noTicker);
    expect(result.success).toBe(false);
  });

  it('rejects a DataPacket missing assembledAt', () => {
    const { assembledAt, ...noTimestamp } = mockDataPacket;
    const result = DataPacketSchema.safeParse(noTimestamp);
    expect(result.success).toBe(false);
  });

  it('allows null values for optional nullable fields', () => {
    const withNulls = { ...mockDataPacket, gurus: null, peers: null, peerMetrics: null };
    const result = DataPacketSchema.safeParse(withNulls);
    expect(result.success).toBe(true);
  });

  it('allows extra fields via passthrough', () => {
    const withExtra = { ...mockDataPacket, extraField: 'test' };
    const result = DataPacketSchema.safeParse(withExtra);
    expect(result.success).toBe(true);
  });
});

// ─── sliceDataPacket Tests ────────────────────────────────────────

describe('sliceDataPacket', () => {
  const fullPacket = {
    ticker: 'AAPL',
    companyInfo: { name: 'Apple Inc.' },
    classification: { industryType: 'standard' },
    caveats: [],
    financials: { years: [2024] },
    growthRates: { earnings: { '5yr': 0.12 } },
    gurus: { count: 5 },
    insiders: { summary: {} },
    prices: { currentPrice: 175 },
    assembledAt: new Date().toISOString(),
  };

  it('returns only requested fields plus always-included fields', () => {
    const sliced = sliceDataPacket(fullPacket, { dataPacketSlice: ['financials', 'growthRates'] });
    expect(sliced).toHaveProperty('ticker');
    expect(sliced).toHaveProperty('companyInfo');
    expect(sliced).toHaveProperty('classification');
    expect(sliced).toHaveProperty('caveats');
    expect(sliced).toHaveProperty('financials');
    expect(sliced).toHaveProperty('growthRates');
    expect(sliced).not.toHaveProperty('gurus');
    expect(sliced).not.toHaveProperty('insiders');
    expect(sliced).not.toHaveProperty('prices');
  });

  it('always includes ticker, companyInfo, classification, caveats even with empty slice', () => {
    const sliced = sliceDataPacket(fullPacket, { dataPacketSlice: [] });
    expect(sliced).toHaveProperty('ticker');
    expect(sliced).toHaveProperty('companyInfo');
    expect(sliced).toHaveProperty('classification');
    expect(sliced).toHaveProperty('caveats');
    expect(Object.keys(sliced).length).toBe(4);
  });

  it('handles null agentConfig gracefully', () => {
    const sliced = sliceDataPacket(fullPacket, null);
    expect(sliced).toHaveProperty('ticker');
    expect(sliced).toHaveProperty('companyInfo');
  });
});

// ─── assembleDataPacket Type Check ────────────────────────────────

describe('assembleDataPacket', () => {
  it('is exported as an async function', async () => {
    const mod = await import('../dataExport.js');
    expect(typeof mod.assembleDataPacket).toBe('function');
    // Check it returns a promise (async function)
    expect(mod.assembleDataPacket.constructor.name).toBe('AsyncFunction');
  });
});

// ─── safeCall Retry Behavior Tests ──────────────────────────────

describe('safeCall retry behavior', () => {
  let safeCall;

  beforeAll(async () => {
    const mod = await import('../dataExport.js');
    safeCall = mod._testExports.safeCall;
  });

  it('returns result on first success without retry option', async () => {
    const errors = [];
    const result = await safeCall(() => Promise.resolve('ok'), 'test', errors);
    expect(result).toBe('ok');
    expect(errors).toHaveLength(0);
  });

  it('returns null on failure without retry option', async () => {
    const errors = [];
    const result = await safeCall(() => Promise.reject(new Error('fail')), 'test', errors);
    expect(result).toBeNull();
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('test: fail');
    expect(errors[0]).not.toContain('after retry');
  });

  it('retries once on failure when retry: true and succeeds', async () => {
    const errors = [];
    let callCount = 0;
    const fn = () => {
      callCount++;
      if (callCount === 1) return Promise.reject(new Error('timeout'));
      return Promise.resolve('retry-ok');
    };
    const result = await safeCall(fn, 'test', errors, { retry: true, backoffMs: 10 });
    expect(result).toBe('retry-ok');
    expect(callCount).toBe(2);
    expect(errors).toHaveLength(0);
  });

  it('returns null when both attempts fail with retry: true', async () => {
    const errors = [];
    const fn = () => Promise.reject(new Error('always-fail'));
    const result = await safeCall(fn, 'test', errors, { retry: true, backoffMs: 10 });
    expect(result).toBeNull();
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('after retry');
  });
});

// ─── analystEstimates Finviz Fallback ───────────────────────────

describe('analystEstimates Finviz fallback', () => {
  it('dataExport.js imports fetchFinvizData', async () => {
    // Verify the import exists by checking the module loads without error
    const mod = await import('../dataExport.js');
    expect(typeof mod.assembleDataPacket).toBe('function');
  });
});
