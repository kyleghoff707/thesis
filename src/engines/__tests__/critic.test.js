// critic.js — Quality Validation Engine Tests
// Tests against real COST fixture data extracted from generated one-pager
// Covers QUAL-01 through QUAL-06

import { describe, it, expect } from 'vitest';

import {
  validateSection,
  validateStage,
  _testExports,
} from '../critic.js';

const {
  classifyCitation,
  resolveDataPath,
  matchNumericValue,
  validateCitations,
  scoreCompleteness,
  validateConfidence,
  checkMultiSource,
  validateRedFlags,
  detectDataGaps,
  checkSearchCompliance,
} = _testExports;

// Fixtures — real COST data
import companyInfoSection from './fixtures/cost-section-company-info.json' with { type: 'json' };
import dataPacketSlice from './fixtures/cost-data-packet-slice.json' with { type: 'json' };

// ─── QUAL-01: Citation Validation ─────────────────────────────────────

describe('QUAL-01: Citation Validation', () => {
  describe('classifyCitation', () => {
    it('should classify DataPacket citations correctly', () => {
      expect(classifyCitation({ source: 'DataPacket', ref: 'growthRates.earnings.10yr' }))
        .toBe('datapacket');
      expect(classifyCitation({ source: 'Rule One Toolbox', ref: 'Moat Score' }))
        .toBe('datapacket');
      expect(classifyCitation({ source: 'Computed', ref: 'FCF calculation' }))
        .toBe('datapacket');
    });

    it('should classify SEC filing citations correctly', () => {
      expect(classifyCitation({ source: 'SEC EDGAR 10-K FY2025' }))
        .toBe('sec_filing');
      expect(classifyCitation({ source: 'SEC EDGAR 10-Q Q3 2025' }))
        .toBe('sec_filing');
      expect(classifyCitation({ source: 'SEC EDGAR company facts' }))
        .toBe('sec_filing');
    });

    it('should classify web URL citations correctly', () => {
      expect(classifyCitation({ url: 'https://example.com/report' }))
        .toBe('web_url');
      expect(classifyCitation({ url: 'http://sec.gov/cgi-bin/browse' }))
        .toBe('web_url');
    });

    it('should classify untraceable citations correctly', () => {
      expect(classifyCitation({ source: 'Costco corporate history' }))
        .toBe('untraceable');
      expect(classifyCitation({ source: 'Industry CAGR research' }))
        .toBe('untraceable');
      expect(classifyCitation({ source: 'Yahoo Finance' }))
        .toBe('untraceable');
    });
  });

  describe('resolveDataPath', () => {
    it('should validate DataPacket path exists', () => {
      const result = resolveDataPath(dataPacketSlice, 'growthRates.earnings.10yr');
      expect(result.found).toBe(true);
      expect(result.value).toBeCloseTo(0.1304210126364862, 10);
    });

    it('should detect missing DataPacket path', () => {
      const result = resolveDataPath(dataPacketSlice, 'growthRates.nonexistent.field');
      expect(result.found).toBe(false);
      expect(result.value).toBeUndefined();
    });

    it('should handle top-level path', () => {
      const result = resolveDataPath(dataPacketSlice, 'ticker');
      expect(result.found).toBe(true);
      expect(result.value).toBe('COST');
    });

    it('should handle null at intermediate level', () => {
      const result = resolveDataPath(dataPacketSlice, 'currentPrice.something');
      expect(result.found).toBe(false);
    });

    it('should handle nested object path', () => {
      const result = resolveDataPath(dataPacketSlice, 'ruleOneScore.moat');
      expect(result.found).toBe(true);
      expect(result.value).toBe(88);
    });
  });

  describe('matchNumericValue', () => {
    it('should match numeric values with tolerance', () => {
      // 13.0% matching 0.1304 (percentage to decimal)
      expect(matchNumericValue('13.0%', 0.1304210126364862)).toBe(true);
    });

    it('should match dollar abbreviations', () => {
      // $432B matching 432040000000
      expect(matchNumericValue('$432B', 432040000000)).toBe(true);
    });

    it('should match plain numbers', () => {
      expect(matchNumericValue('88', 88)).toBe(true);
    });

    it('should reject non-matching values', () => {
      expect(matchNumericValue('50%', 0.1304)).toBe(false);
    });

    it('should handle million abbreviations', () => {
      expect(matchNumericValue('$141M', 141000000)).toBe(true);
    });

    it('should handle comma-separated numbers', () => {
      expect(matchNumericValue('341,000', 341000)).toBe(true);
    });
  });

  describe('validateCitations', () => {
    it('should flag non-canonical citation format as low severity', () => {
      // The COST citations use {id, source, url, note} instead of {id, ref, text, source}
      const nonCanonical = [{ id: 1, source: 'SEC EDGAR 10-K FY2025', url: '', note: 'Revenue data' }];
      const issues = validateCitations(nonCanonical, dataPacketSlice);
      const formatIssues = issues.filter(i => i.message.includes('non-canonical'));
      expect(formatIssues.length).toBeGreaterThan(0);
      expect(formatIssues[0].severity).toBe('low');
    });

    it('should validate DataPacket citations with dot-path ref', () => {
      const canonical = [{ id: 1, ref: 'dataPacket.growthRates.earnings.10yr', text: '13.0%', source: 'DataPacket' }];
      const issues = validateCitations(canonical, dataPacketSlice);
      // Should have no high-severity issues — path exists and value matches
      const highIssues = issues.filter(i => i.severity === 'high');
      expect(highIssues.length).toBe(0);
    });

    it('should flag DataPacket citation with invalid path as high severity', () => {
      const bad = [{ id: 1, ref: 'dataPacket.nonexistent.field', text: '42', source: 'DataPacket' }];
      const issues = validateCitations(bad, dataPacketSlice);
      const pathIssues = issues.filter(i => i.severity === 'high' && i.message.includes('path not found'));
      expect(pathIssues.length).toBe(1);
    });

    it('should validate SEC citation format', () => {
      const sec = [{ id: 1, ref: 'SEC filing', text: '10-K data', source: 'SEC EDGAR 10-K FY2025' }];
      const issues = validateCitations(sec, dataPacketSlice);
      // Has both filing type and year — no medium or high issues from SEC validation
      const secIssues = issues.filter(i => i.type === 'citation' && i.severity !== 'low');
      expect(secIssues.length).toBe(0);
    });

    it('should validate web URL format', () => {
      const urlCitation = [{ id: 1, ref: 'Web', text: 'Data', source: 'Web', url: 'https://example.com' }];
      const issues = validateCitations(urlCitation, dataPacketSlice);
      const urlIssues = issues.filter(i => i.message.includes('Invalid URL'));
      expect(urlIssues.length).toBe(0);
    });

    it('should flag invalid URL format', () => {
      const badUrl = [{ id: 1, ref: 'Web', text: 'Data', source: 'Web', url: 'not-a-url' }];
      const issues = validateCitations(badUrl, dataPacketSlice);
      const urlIssues = issues.filter(i => i.message.includes('Invalid URL'));
      expect(urlIssues.length).toBe(1);
    });
  });
});

// ─── QUAL-02: Completeness Scoring ──────────────────────────────────

describe('QUAL-02: Completeness Scoring', () => {
  it('should score a complete section above 80', () => {
    const result = scoreCompleteness(companyInfoSection);
    expect(result.score).toBeGreaterThan(80);
    expect(result.requiredFieldsTotal).toBe(15);
  });

  it('should penalize missing narrative', () => {
    const sparse = { ...companyInfoSection, narrative: '' };
    const result = scoreCompleteness(sparse);
    const fullResult = scoreCompleteness(companyInfoSection);
    expect(result.score).toBeLessThan(fullResult.score);
  });

  it('should penalize missing citations', () => {
    const noCitations = { ...companyInfoSection, citations: [] };
    const result = scoreCompleteness(noCitations);
    const fullResult = scoreCompleteness(companyInfoSection);
    expect(result.score).toBeLessThan(fullResult.score);
  });

  it('should report correct required fields count', () => {
    const result = scoreCompleteness(companyInfoSection);
    expect(result.requiredFieldsPresent).toBeGreaterThanOrEqual(14);
    expect(result.requiredFieldsTotal).toBe(15);
  });

  it('should report narrative length', () => {
    const result = scoreCompleteness(companyInfoSection);
    expect(result.narrativeLength).toBeGreaterThan(100);
  });
});

// ─── FMT-01: scoreCompleteness handles string data field ────────────

describe('FMT-01: scoreCompleteness handles string data field', () => {
  it('should count keys when data is a valid JSON string', () => {
    const section = {
      ...companyInfoSection,
      data: '{"ticker":"AAPL","price":150,"sector":"Tech"}',
    };
    const result = scoreCompleteness(section);
    expect(result.dataFieldsPopulated).toBe(3);
  });

  it('should return 0 keys when data is an invalid JSON string', () => {
    const section = {
      ...companyInfoSection,
      data: 'not valid json at all',
    };
    const result = scoreCompleteness(section);
    expect(result.dataFieldsPopulated).toBe(0);
  });

  it('should return 0 keys when data is null', () => {
    const section = {
      ...companyInfoSection,
      data: null,
    };
    const result = scoreCompleteness(section);
    expect(result.dataFieldsPopulated).toBe(0);
  });

  it('should still count keys when data is an object (backward compat)', () => {
    // companyInfoSection.data is an object — existing behavior preserved
    const result = scoreCompleteness(companyInfoSection);
    expect(result.dataFieldsPopulated).toBeGreaterThan(0);
  });
});

// ─── QUAL-03: Confidence Validation ─────────────────────────────────

describe('QUAL-03: Confidence Validation', () => {
  it('should flag HIGH confidence with only 1 citation source type', () => {
    // All citations from the same untraceable source
    const singleSourceSection = {
      ...companyInfoSection,
      confidence: 'HIGH',
      citations: [
        { id: 1, source: 'Costco corporate history', url: '', note: 'Data point 1' },
        { id: 2, source: 'Costco press release', url: '', note: 'Data point 2' },
      ],
    };
    const issues = validateConfidence(singleSourceSection, dataPacketSlice);
    const confIssues = issues.filter(i => i.type === 'confidence' && i.severity === 'medium');
    expect(confIssues.length).toBeGreaterThan(0);
  });

  it('should accept HIGH confidence with multiple source types', () => {
    // Mix of SEC and DataPacket citations
    const multiSourceSection = {
      ...companyInfoSection,
      confidence: 'HIGH',
      citations: [
        { id: 1, ref: 'dataPacket.ruleOneScore.moat', text: '88', source: 'DataPacket' },
        { id: 2, source: 'SEC EDGAR 10-K FY2025', url: '', note: 'Filing data' },
        { id: 3, source: 'Morningstar', url: 'https://morningstar.com/cost', note: 'Research' },
      ],
    };
    const issues = validateConfidence(multiSourceSection, dataPacketSlice);
    const confIssues = issues.filter(i => i.type === 'confidence');
    expect(confIssues.length).toBe(0);
  });

  it('should not flag MEDIUM confidence regardless of sources', () => {
    const medSection = { ...companyInfoSection, confidence: 'MEDIUM' };
    const issues = validateConfidence(medSection, dataPacketSlice);
    expect(issues.length).toBe(0);
  });
});

// ─── QUAL-04: Multi-Source Verification ─────────────────────────────

describe('QUAL-04: Multi-Source Verification', () => {
  it('should flag financial claims with only one source type', () => {
    // All DataPacket citations, no corroborating SEC sources
    const singleType = [
      { id: 1, ref: 'growth', text: '13%', source: 'DataPacket' },
      { id: 2, ref: 'score', text: '91', source: 'Computed' },
      { id: 3, ref: 'metric', text: '88', source: 'Rule One Toolbox' },
    ];
    const issues = checkMultiSource(singleType);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].severity).toBe('medium');
  });

  it('should accept diverse citation sources', () => {
    const diverse = [
      { id: 1, ref: 'growth', text: '13%', source: 'DataPacket' },
      { id: 2, source: 'SEC EDGAR 10-K FY2025', url: '', note: 'Filing' },
      { id: 3, source: 'Industry research', url: 'https://example.com', note: 'Web' },
    ];
    const issues = checkMultiSource(diverse);
    expect(issues.length).toBe(0);
  });
});

// ─── QUAL-05: Red Flag Quality ──────────────────────────────────────

describe('QUAL-05: Red Flag Quality', () => {
  it('should pass sections with specific red flags', () => {
    // The COST company_info has 4 detailed red flags
    const issues = validateRedFlags(companyInfoSection.redFlags);
    const highIssues = issues.filter(i => i.severity === 'high');
    expect(highIssues.length).toBe(0);
  });

  it('should flag empty red flags as high severity', () => {
    const issues = validateRedFlags([]);
    const highIssues = issues.filter(i => i.severity === 'high');
    expect(highIssues.length).toBe(1);
  });

  it('should flag generic red flags as medium severity', () => {
    const issues = validateRedFlags(['Possible risk']);
    const medIssues = issues.filter(i => i.severity === 'medium');
    expect(medIssues.length).toBeGreaterThan(0);
  });

  it('should accept detailed red flags', () => {
    const detailed = [
      'Revenue growth reliant on warehouse expansion -- organic same-store growth alone is ~5-6%',
    ];
    const issues = validateRedFlags(detailed);
    expect(issues.length).toBe(0);
  });
});

// ─── QUAL-06: Data Gap Detection ────────────────────────────────────

describe('QUAL-06: Data Gap Detection', () => {
  it('should detect narrative claims about null DataPacket fields', () => {
    // DataPacket has currentPrice: null, but narrative claims a price
    const sectionWithPriceClaim = {
      ...companyInfoSection,
      key: 'valuation_summary',
      narrative: 'The current stock price is $973.82, representing a premium to intrinsic value.',
    };
    const issues = detectDataGaps(sectionWithPriceClaim, dataPacketSlice);
    const gapIssues = issues.filter(i => i.type === 'data_gap');
    expect(gapIssues.length).toBeGreaterThan(0);
  });

  it('should not flag when DataPacket fields are populated', () => {
    // growthRates are fully populated, narrative references them
    const sectionWithGrowth = {
      ...companyInfoSection,
      key: 'growth_metrics',
      narrative: 'Earnings growth rate of 13.0% over 10 years demonstrates consistent compounding.',
    };
    const issues = detectDataGaps(sectionWithGrowth, dataPacketSlice);
    // Should not flag growth-related gaps since growthRates exists
    const growthGaps = issues.filter(i => i.message.includes('growthRates'));
    expect(growthGaps.length).toBe(0);
  });
});

// ─── QUAL-07: Search Compliance (D-06) ───────────────────────────────

describe('QUAL-07: Search Compliance', () => {
  // Helper to build a section with specific search/citation config
  function makeSection(overrides = {}) {
    return {
      ...companyInfoSection,
      key: overrides.key || 'radar',
      title: overrides.title || 'Radar',
      searchesPerformed: overrides.searchesPerformed || [],
      citations: overrides.citations || [],
    };
  }

  it('should score 100 for section with searches and web citations', () => {
    const section = makeSection({
      searchesPerformed: [
        { query: 'Costco business model overview', resultCount: 12, usedInSection: true },
        { query: 'Costco competitive advantages moat', resultCount: 8, usedInSection: true },
        { query: 'COST bull bear case 2026', resultCount: 15, usedInSection: true },
      ],
      citations: [
        { id: 1, ref: 'Web source', text: 'Business model data', source: 'Web', url: 'https://example.com/costco-analysis' },
        { id: 2, ref: 'DataPacket', text: 'Revenue data', source: 'DataPacket' },
      ],
    });
    const result = checkSearchCompliance(section);
    expect(result.score).toBe(100);
    expect(result.issues.length).toBe(0);
  });

  it('should flag section with zero searchesPerformed as severity high', () => {
    const section = makeSection({
      searchesPerformed: [],
      citations: [
        { id: 1, ref: 'Web', text: 'Data', source: 'Web', url: 'https://example.com' },
      ],
    });
    const result = checkSearchCompliance(section);
    const noSearchIssues = result.issues.filter(i => i.type === 'search_compliance' && i.message.includes('zero web searches'));
    expect(noSearchIssues.length).toBe(1);
    expect(noSearchIssues[0].severity).toBe('high');
  });

  it('should flag section with zero web citations as severity high', () => {
    const section = makeSection({
      searchesPerformed: [
        { query: 'Costco business model', resultCount: 10, usedInSection: true },
      ],
      citations: [
        { id: 1, ref: 'dataPacket.ticker', text: 'COST', source: 'DataPacket' },
      ],
    });
    const result = checkSearchCompliance(section);
    const noCitationIssues = result.issues.filter(i => i.type === 'search_compliance' && i.message.includes('zero web-sourced citations'));
    expect(noCitationIssues.length).toBe(1);
    expect(noCitationIssues[0].severity).toBe('high');
  });

  it('should flag searches reported but no web citations as suspicious (medium)', () => {
    const section = makeSection({
      searchesPerformed: [
        { query: 'Costco business model', resultCount: 10, usedInSection: true },
        { query: 'COST bull case 2026', resultCount: 5, usedInSection: true },
      ],
      citations: [
        { id: 1, ref: 'dataPacket.ticker', text: 'COST', source: 'DataPacket' },
      ],
    });
    const result = checkSearchCompliance(section);
    const suspiciousIssues = result.issues.filter(i => i.type === 'search_compliance' && i.message.includes('fabricated'));
    expect(suspiciousIssues.length).toBe(1);
    expect(suspiciousIssues[0].severity).toBe('medium');
  });

  it('should always score 100 for exempt sections (synthesis)', () => {
    const section = makeSection({
      key: 'synthesis',
      title: 'Overall Synthesis',
      searchesPerformed: [],
      citations: [],
    });
    const result = checkSearchCompliance(section);
    expect(result.score).toBe(100);
    expect(result.issues.length).toBe(0);
  });

  it('should always score 100 for exempt sections (psr_annual)', () => {
    const section = makeSection({
      key: 'psr_annual',
      title: 'Primary Source Reader - Annual',
      searchesPerformed: [],
      citations: [],
    });
    const result = checkSearchCompliance(section);
    expect(result.score).toBe(100);
    expect(result.issues.length).toBe(0);
  });

  it('should always score 100 for exempt sections (overall_verdict)', () => {
    const section = makeSection({
      key: 'overall_verdict',
      title: 'Overall Verdict',
      searchesPerformed: [],
      citations: [],
    });
    const result = checkSearchCompliance(section);
    expect(result.score).toBe(100);
    expect(result.issues.length).toBe(0);
  });

  it('should flag mostly empty search results as low severity warning', () => {
    const section = makeSection({
      searchesPerformed: [
        { query: 'very specific query 1', resultCount: 0, usedInSection: false },
        { query: 'very specific query 2', resultCount: 0, usedInSection: false },
        { query: 'very specific query 3', resultCount: 0, usedInSection: false },
        { query: 'Costco overview', resultCount: 10, usedInSection: true },
      ],
      citations: [
        { id: 1, ref: 'Web', text: 'Data', source: 'Web', url: 'https://example.com' },
      ],
    });
    const result = checkSearchCompliance(section);
    const emptyIssues = result.issues.filter(i => i.type === 'search_compliance' && i.message.includes('returned 0 results'));
    expect(emptyIssues.length).toBe(1);
    expect(emptyIssues[0].severity).toBe('low');
  });
});

// ─── validateSection Integration ────────────────────────────────────

describe('validateSection', () => {
  it('should produce a valid QualityReport for COST company_info', () => {
    const report = validateSection(companyInfoSection, dataPacketSlice);
    expect(report).toBeDefined();
    expect(report.sectionKey).toBe('company_info');
    expect(typeof report.score).toBe('number');
    expect(report.score).toBeGreaterThanOrEqual(0);
    expect(report.score).toBeLessThanOrEqual(100);
    expect(report.completeness).toBeDefined();
    expect(report.completeness.requiredFieldsTotal).toBe(15);
    expect(Array.isArray(report.issues)).toBe(true);
    expect(typeof report.passed).toBe('boolean');
    expect(typeof report.checkedAt).toBe('string');
  });

  it('should set passed=true when no high-severity issues exist', () => {
    // Build a clean section with canonical citations that should pass
    const cleanSection = {
      ...companyInfoSection,
      citations: [
        { id: 1, ref: 'dataPacket.ruleOneScore.moat', text: '88', source: 'DataPacket' },
        { id: 2, ref: 'SEC filing', text: '10-K data', source: 'SEC EDGAR 10-K FY2025' },
      ],
    };
    const report = validateSection(cleanSection, dataPacketSlice);
    // No high-severity issues means passed should be true
    const highIssues = report.issues.filter(i => i.severity === 'high');
    expect(report.passed).toBe(highIssues.length === 0);
  });
});

// ─── validateStage Aggregation ──────────────────────────────────────

describe('validateStage', () => {
  it('should aggregate section quality reports into stage report', () => {
    const sections = [companyInfoSection, companyInfoSection];
    const report = validateStage(sections, dataPacketSlice);
    expect(report).toBeDefined();
    expect(report.sections).toHaveLength(2);
    expect(typeof report.overallScore).toBe('number');
    expect(typeof report.overallPassed).toBe('boolean');
    expect(typeof report.checkedAt).toBe('string');
  });

  it('should compute overall score as average of section scores', () => {
    const sections = [companyInfoSection];
    const report = validateStage(sections, dataPacketSlice);
    expect(report.overallScore).toBe(report.sections[0].score);
  });
});
