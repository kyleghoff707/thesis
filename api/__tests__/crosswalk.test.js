import { describe, it, expect } from 'vitest';
import { classifyTicker, isNonCommonStock, MAJOR_EXCHANGES, YAHOO_TO_THES1S } from '../src/cron/crosswalk.js';

describe('crosswalk', () => {
  describe('YAHOO_TO_THES1S', () => {
    it('has 145 mappings', () => {
      expect(YAHOO_TO_THES1S.size).toBe(145);
    });

    it('contains known exact match (Semiconductors)', () => {
      const entry = YAHOO_TO_THES1S.get('Technology|Semiconductors');
      expect(entry).toBeDefined();
      expect(entry.thesisCode).toBe('10301010');
      expect(entry.confidence).toBe(0.85);
    });

    it('contains known split mapping at 0.65 confidence', () => {
      const entry = YAHOO_TO_THES1S.get('Technology|Software - Application');
      expect(entry).toBeDefined();
      expect(entry.confidence).toBe(0.65);
    });
  });

  describe('MAJOR_EXCHANGES', () => {
    it('includes NYSE and NASDAQ variants', () => {
      expect(MAJOR_EXCHANGES.has('NYQ')).toBe(true);
      expect(MAJOR_EXCHANGES.has('NMS')).toBe(true);
      expect(MAJOR_EXCHANGES.has('NGM')).toBe(true);
      expect(MAJOR_EXCHANGES.has('NCM')).toBe(true);
      expect(MAJOR_EXCHANGES.has('ASE')).toBe(true);
    });

    it('excludes OTC and foreign exchanges', () => {
      expect(MAJOR_EXCHANGES.has('PNK')).toBe(false);
      expect(MAJOR_EXCHANGES.has('OTC')).toBe(false);
      expect(MAJOR_EXCHANGES.has('LSE')).toBe(false);
    });
  });

  describe('classifyTicker', () => {
    it('classifies a typical Nasdaq stock correctly', () => {
      const result = classifyTicker(
        { sector: 'Technology', industry: 'Semiconductors' },
        { exchange: 'NMS', quoteType: 'EQUITY' }
      );
      expect(result.status).toBe('classified');
      expect(result.sector).toBe('Technology');
      expect(result.industry).toBe('Semiconductors');
      expect(result.thesisCode).toBe('10301010');
      expect(result.confidence).toBe(0.85);
      expect(result.exchange).toBe('NMS');
    });

    it('classifies a NYSE stock correctly', () => {
      const result = classifyTicker(
        { sector: 'Financial Services', industry: 'Banks - Diversified' },
        { exchange: 'NYQ', quoteType: 'EQUITY' }
      );
      expect(result.status).toBe('classified');
      expect(result.sector).toBe('Financial Services');
    });

    it('excludes non-major exchange stocks', () => {
      const result = classifyTicker(
        { sector: 'Technology', industry: 'Semiconductors' },
        { exchange: 'PNK', quoteType: 'EQUITY' }
      );
      expect(result.status).toBe('excluded');
      expect(result.reason).toBe('non-major-exchange');
    });

    it('excludes when exchange is missing', () => {
      const result = classifyTicker(
        { sector: 'Technology', industry: 'Semiconductors' },
        {}
      );
      expect(result.status).toBe('excluded');
      expect(result.reason).toBe('non-major-exchange');
    });

    it('excludes non-equity types (ETF)', () => {
      const result = classifyTicker(
        { sector: 'Technology', industry: 'Semiconductors' },
        { exchange: 'NMS', quoteType: 'ETF' }
      );
      expect(result.status).toBe('excluded');
      expect(result.reason).toBe('non-equity');
    });

    it('returns unmapped when Yahoo has no sector/industry', () => {
      const result = classifyTicker(
        {},
        { exchange: 'NYQ', quoteType: 'EQUITY' }
      );
      expect(result.status).toBe('unmapped');
      expect(result.reason).toBe('missing-yahoo-classification');
    });

    it('returns unmapped when crosswalk has no match', () => {
      const result = classifyTicker(
        { sector: 'FakeSector', industry: 'FakeIndustry' },
        { exchange: 'NYQ', quoteType: 'EQUITY' }
      );
      expect(result.status).toBe('unmapped');
      expect(result.reason).toBe('no-crosswalk-match');
      expect(result.yahooSector).toBe('FakeSector');
    });

    it('uses 0.65 confidence for split mappings', () => {
      const result = classifyTicker(
        { sector: 'Technology', industry: 'Software - Application' },
        { exchange: 'NMS', quoteType: 'EQUITY' }
      );
      expect(result.status).toBe('classified');
      expect(result.confidence).toBe(0.65);
    });

    it('handles null priceData gracefully', () => {
      const result = classifyTicker({ sector: 'Technology', industry: 'Semiconductors' }, null);
      expect(result.status).toBe('excluded');
    });
  });

  describe('isNonCommonStock', () => {
    it('filters warrants', () => {
      expect(isNonCommonStock('ACHR/WS')).toBe(true);
      expect(isNonCommonStock('SPCE.W')).toBe(true);
      expect(isNonCommonStock('BAC-W')).toBe(true);
    });

    it('filters units', () => {
      expect(isNonCommonStock('PSTH.U')).toBe(true);
      expect(isNonCommonStock('IPOF-U')).toBe(true);
    });

    it('filters rights', () => {
      expect(isNonCommonStock('AEAC-RT')).toBe(true);
      expect(isNonCommonStock('BLNK.R')).toBe(true);
    });

    it('filters preferred shares', () => {
      expect(isNonCommonStock('BAC-PL')).toBe(true);
      expect(isNonCommonStock('WFC.PA')).toBe(true);
      expect(isNonCommonStock('JPM-PR.D')).toBe(true);
    });

    it('passes regular tickers through', () => {
      expect(isNonCommonStock('AAPL')).toBe(false);
      expect(isNonCommonStock('W')).toBe(false);
      expect(isNonCommonStock('U')).toBe(false);
      expect(isNonCommonStock('NVDA')).toBe(false);
      expect(isNonCommonStock('BRK-B')).toBe(false);
    });
  });
});
