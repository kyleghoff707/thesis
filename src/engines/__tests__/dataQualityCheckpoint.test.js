import { describe, it, expect, vi } from 'vitest';
import {
  CRITICAL_FIELDS,
  IMPORTANT_FIELDS,
  NICE_TO_HAVE_FIELDS,
  classifyField,
  assessDataPacket,
  assessFilings,
} from '../../../scripts/data-quality-checkpoint.js';

// ── Field Classification ────────────────────────────────────────────

describe('classifyField', () => {
  it('classifies companyInfo as critical', () => {
    expect(classifyField('companyInfo')).toBe('critical');
  });

  it('classifies financials as critical', () => {
    expect(classifyField('financials')).toBe('critical');
  });

  it('classifies filings as critical', () => {
    expect(classifyField('filings')).toBe('critical');
  });

  it('classifies growthRates as important', () => {
    expect(classifyField('growthRates')).toBe('important');
  });

  it('classifies returnMetrics as important', () => {
    expect(classifyField('returnMetrics')).toBe('important');
  });

  it('classifies fcf as important', () => {
    expect(classifyField('fcf')).toBe('important');
  });

  it('classifies ruleOneScore as important', () => {
    expect(classifyField('ruleOneScore')).toBe('important');
  });

  it('classifies ttm as important', () => {
    expect(classifyField('ttm')).toBe('important');
  });

  it('classifies analystEstimates as nice-to-have', () => {
    expect(classifyField('analystEstimates')).toBe('nice-to-have');
  });

  it('classifies gurus as nice-to-have', () => {
    expect(classifyField('gurus')).toBe('nice-to-have');
  });

  it('classifies unknown field as unknown', () => {
    expect(classifyField('notARealField')).toBe('unknown');
  });
});

// ── Constants ───────────────────────────────────────────────────────

describe('field classification constants', () => {
  it('CRITICAL_FIELDS contains companyInfo, financials, filings', () => {
    expect(CRITICAL_FIELDS).toEqual(['companyInfo', 'financials', 'filings']);
  });

  it('IMPORTANT_FIELDS contains growthRates, returnMetrics, fcf, ruleOneScore, ttm', () => {
    expect(IMPORTANT_FIELDS).toEqual(['growthRates', 'returnMetrics', 'fcf', 'ruleOneScore', 'ttm']);
  });

  it('NICE_TO_HAVE_FIELDS includes analystEstimates, gurus, insiders', () => {
    expect(NICE_TO_HAVE_FIELDS).toContain('analystEstimates');
    expect(NICE_TO_HAVE_FIELDS).toContain('gurus');
    expect(NICE_TO_HAVE_FIELDS).toContain('insiders');
  });
});

// ── assessDataPacket ────────────────────────────────────────────────

describe('assessDataPacket', () => {
  // Helper to build a full DataPacket with all fields populated
  function makeFullPacket() {
    return {
      ticker: 'AAPL',
      companyInfo: { name: 'Apple Inc.', cik: '0000320193' },
      classification: { sector: 'Technology' },
      currentPrice: { price: 150.0 },
      financials: { years: [2024, 2023], income: {}, balance: {}, cashFlow: {} },
      ttm: { income: {} },
      growthRates: { revenue: 0.08 },
      returnMetrics: { roe: 0.45 },
      debtMetrics: { debtToEquity: 1.2 },
      fcf: { fcfPerShare: 6.5 },
      keyMetrics: { peRatio: 28 },
      ruleOneScore: { moat: 85, management: 78, composite: 80 },
      gurus: { holders: [] },
      insiders: { transactions: [] },
      compensation: { executives: [] },
      peers: { tickers: ['MSFT', 'GOOG'] },
      peerMetrics: { metrics: {} },
      analystEstimates: { targetPrice: 180 },
      events: { upcoming: [] },
      prices: { data: [], currentPrice: { price: 150 } },
      transcriptAvailability: { available: true },
      filings: [{ form: '10-K', filingDate: '2024-09-15' }],
      caveats: [],
      assembledAt: '2026-03-26T00:00:00Z',
    };
  }

  it('returns canProceed: true when all fields are populated', () => {
    const result = assessDataPacket(makeFullPacket());
    expect(result.canProceed).toBe(true);
    expect(result.criticalMissing).toEqual([]);
  });

  it('returns canProceed: false when companyInfo is null', () => {
    const packet = makeFullPacket();
    packet.companyInfo = null;
    const result = assessDataPacket(packet);
    expect(result.canProceed).toBe(false);
    expect(result.criticalMissing).toContain('companyInfo');
  });

  it('returns canProceed: false when financials is null', () => {
    const packet = makeFullPacket();
    packet.financials = null;
    const result = assessDataPacket(packet);
    expect(result.canProceed).toBe(false);
    expect(result.criticalMissing).toContain('financials');
  });

  it('returns canProceed: false when filings is null', () => {
    const packet = makeFullPacket();
    packet.filings = null;
    const result = assessDataPacket(packet);
    expect(result.canProceed).toBe(false);
    expect(result.criticalMissing).toContain('filings');
  });

  it('returns canProceed: true when analystEstimates is null (nice-to-have)', () => {
    const packet = makeFullPacket();
    packet.analystEstimates = null;
    const result = assessDataPacket(packet);
    expect(result.canProceed).toBe(true);
    expect(result.warnings).toContain('analystEstimates');
  });

  it('returns canProceed: true when gurus is null (nice-to-have)', () => {
    const packet = makeFullPacket();
    packet.gurus = null;
    const result = assessDataPacket(packet);
    expect(result.canProceed).toBe(true);
    expect(result.warnings).toContain('gurus');
  });

  it('tracks important missing fields separately', () => {
    const packet = makeFullPacket();
    packet.growthRates = null;
    packet.ttm = null;
    const result = assessDataPacket(packet);
    expect(result.canProceed).toBe(true);
    expect(result.importantMissing).toContain('growthRates');
    expect(result.importantMissing).toContain('ttm');
  });

  it('includes field count summary', () => {
    const packet = makeFullPacket();
    const result = assessDataPacket(packet);
    expect(result.fieldCount.total).toBeGreaterThan(0);
    expect(result.fieldCount.populated).toBeGreaterThan(0);
    expect(result.fieldCount.missing).toBe(0);
  });

  it('populates the populated array with field names', () => {
    const packet = makeFullPacket();
    const result = assessDataPacket(packet);
    expect(result.populated).toContain('companyInfo');
    expect(result.populated).toContain('financials');
    expect(result.populated).toContain('filings');
  });
});

// ── assessFilings ───────────────────────────────────────────────────

describe('assessFilings', () => {
  it('returns complete: true when there is at least 1 10-K with 3+ sections', () => {
    const files = [
      {
        filename: '10-K-2024-09-15.json',
        data: {
          form: '10-K',
          date: '2024-09-15',
          sections: { Business: '...', 'Risk Factors': '...', 'MD&A': '...' },
          fullLength: 50000,
        },
      },
    ];
    const result = assessFilings(files);
    expect(result.complete).toBe(true);
    expect(result.tenKCount).toBe(1);
  });

  it('returns complete: false when there are 0 files', () => {
    const result = assessFilings([]);
    expect(result.complete).toBe(false);
    expect(result.tenKCount).toBe(0);
    expect(result.tenQCount).toBe(0);
  });

  it('counts sections per filing correctly', () => {
    const files = [
      {
        filename: '10-K-2024-09-15.json',
        data: {
          form: '10-K',
          date: '2024-09-15',
          sections: {
            Business: '...',
            'Risk Factors': '...',
            'MD&A': '...',
            'Financial Statements': '...',
          },
          fullLength: 80000,
        },
      },
      {
        filename: '10-Q-2024-07-30.json',
        data: {
          form: '10-Q',
          date: '2024-07-30',
          sections: { 'MD&A': '...', 'Financial Statements': '...', 'Risk Factors': '...' },
          fullLength: 30000,
        },
      },
    ];
    const result = assessFilings(files);
    expect(result.files[0].sectionCount).toBe(4);
    expect(result.files[0].sections).toEqual(['Business', 'Risk Factors', 'MD&A', 'Financial Statements']);
    expect(result.files[1].sectionCount).toBe(3);
    expect(result.tenKCount).toBe(1);
    expect(result.tenQCount).toBe(1);
    expect(result.totalSections).toBe(7);
  });

  it('returns complete: false when 10-K has fewer than 3 sections', () => {
    const files = [
      {
        filename: '10-K-2024-09-15.json',
        data: {
          form: '10-K',
          date: '2024-09-15',
          sections: { Business: '...' },
          fullLength: 5000,
        },
      },
    ];
    const result = assessFilings(files);
    expect(result.complete).toBe(false);
  });

  it('returns complete: false when only 10-Qs exist (no 10-K)', () => {
    const files = [
      {
        filename: '10-Q-2024-07-30.json',
        data: {
          form: '10-Q',
          date: '2024-07-30',
          sections: { 'MD&A': '...', 'Financial Statements': '...', 'Risk Factors': '...' },
          fullLength: 30000,
        },
      },
    ];
    const result = assessFilings(files);
    expect(result.complete).toBe(false);
    expect(result.tenKCount).toBe(0);
    expect(result.tenQCount).toBe(1);
  });
});
