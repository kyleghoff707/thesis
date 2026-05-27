import { describe, it, expect } from 'vitest';
import { sliceDataPacket, fieldsForAgent, SLICE_REGISTRY } from '../sliceDataPacket.js';

function makeFullDataPacket(overrides = {}) {
  return {
    ticker: 'SFM',
    companyInfo: { name: 'Sprouts Farmers Market', cik: '0001718512' },
    classification: { industryType: 'standard' },
    financials: { annual: [{ year: 2024, revenue: 7_100_000_000 }] },
    ttm: { revenue: 7_500_000_000 },
    growthRates: { revenueGrowth: 0.065 },
    returnMetrics: { roe: 0.22 },
    debtMetrics: { netDebtToEarnings: 0.3 },
    fcf: { fcfTTM: 420_000_000 },
    keyMetrics: { pe: 28, marketCap: 7_200_000_000 },
    gurus: [{ name: 'Test Guru', shares: 100000 }],
    insiders: [{ name: 'CEO', shares: 50000 }],
    compensation: { ceo: 12_500_000 },
    peers: [{ ticker: 'KR' }, { ticker: 'WMK' }],
    peerMetrics: { KR: { pe: 15 } },
    filings: [{ form: '10-K', accession: '...' }],
    thesisScore: { overall: 72 },
    caveats: [],
    ...overrides,
  };
}

describe('sliceDataPacket', () => {
  it('returns exactly the 11 fields for one-pager', () => {
    const full = makeFullDataPacket();
    const slice = sliceDataPacket(full, 'one-pager');

    const expected = [
      'companyInfo', 'classification', 'financials', 'ttm', 'growthRates',
      'returnMetrics', 'debtMetrics', 'fcf', 'keyMetrics', 'gurus', 'caveats',
    ];
    const actual = Object.keys(slice).filter(k => k !== '_sliceMetadata');
    expect(actual.sort()).toEqual(expected.sort());
  });

  it('omits fields that are not in the source DataPacket (rather than setting null)', () => {
    const full = makeFullDataPacket();
    delete full.gurus;
    const slice = sliceDataPacket(full, 'one-pager');

    expect('gurus' in slice).toBe(false);
    expect(slice._sliceMetadata.fieldsMissing).toContain('gurus');
    expect(slice._sliceMetadata.fieldsIncluded).not.toContain('gurus');
  });

  it('drops fields not in the one-pager registry (e.g., insiders, compensation, filings)', () => {
    const full = makeFullDataPacket();
    const slice = sliceDataPacket(full, 'one-pager');

    expect('insiders' in slice).toBe(false);
    expect('compensation' in slice).toBe(false);
    expect('filings' in slice).toBe(false);
    expect('peers' in slice).toBe(false);
    expect('peerMetrics' in slice).toBe(false);
    expect('thesisScore' in slice).toBe(false);
  });

  it('populates _sliceMetadata with ticker, agentRole, sizes, and field lists', () => {
    const full = makeFullDataPacket();
    const slice = sliceDataPacket(full, 'one-pager');

    expect(slice._sliceMetadata.ticker).toBe('SFM');
    expect(slice._sliceMetadata.agentRole).toBe('one-pager');
    expect(slice._sliceMetadata.fieldsIncluded.length).toBe(11);
    expect(slice._sliceMetadata.fieldsMissing.length).toBe(0);
    expect(slice._sliceMetadata.originalSize).toBeGreaterThan(slice._sliceMetadata.sliceSize);
  });

  it('throws on unknown agent role', () => {
    const full = makeFullDataPacket();
    expect(() => sliceDataPacket(full, 'nonexistent-agent')).toThrow(/unknown agentRole/);
  });

  it('throws on non-object dataPacket', () => {
    expect(() => sliceDataPacket(null, 'one-pager')).toThrow(/must be an object/);
    expect(() => sliceDataPacket('not-a-packet', 'one-pager')).toThrow(/must be an object/);
  });

  it('handles synthesis-writer (empty fields array) without error', () => {
    const full = makeFullDataPacket();
    const slice = sliceDataPacket(full, 'synthesis-writer');

    const dataFields = Object.keys(slice).filter(k => k !== '_sliceMetadata');
    expect(dataFields).toEqual([]);
    expect(slice._sliceMetadata.fieldsIncluded).toEqual([]);
  });

  it('matches the scripts/slice-datapacket.js REGISTRY for one-pager field set', () => {
    // Canonical one-pager field list — if this test breaks, either the registry
    // or the Node script diverged. Update both together.
    const canonical = [
      'companyInfo', 'classification', 'financials', 'ttm', 'growthRates',
      'returnMetrics', 'debtMetrics', 'fcf', 'keyMetrics', 'gurus', 'caveats',
    ];
    expect(fieldsForAgent('one-pager').sort()).toEqual(canonical.sort());
    expect(SLICE_REGISTRY['one-pager'].sort()).toEqual(canonical.sort());
  });
});
