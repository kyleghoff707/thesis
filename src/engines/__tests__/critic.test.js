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
  scoreMethodology,
  METHODOLOGY_CHECKS,
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
    expect(result.requiredFieldsTotal).toBe(14);
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
    expect(result.requiredFieldsTotal).toBe(14);
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
    expect(report.completeness.requiredFieldsTotal).toBe(14);
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

  it('should include overallMethodologyScore in stage report', () => {
    const sections = [companyInfoSection];
    const report = validateStage(sections, dataPacketSlice);
    expect(typeof report.overallMethodologyScore).toBe('number');
    expect(report.overallMethodologyScore).toBeGreaterThanOrEqual(0);
    expect(report.overallMethodologyScore).toBeLessThanOrEqual(100);
  });
});

// ─── Methodology Scoring ──────────────────────────────────────────────

describe('Methodology Scoring', () => {
  // Helper to build a section with given key, sectionNumber, and narrative
  function makeMethodSection(key, sectionNumber, narrative, overrides = {}) {
    return {
      key,
      sectionNumber,
      title: `Test Section ${sectionNumber}`,
      status: 'complete',
      confidence: 'HIGH',
      verdict: 'PASS',
      verdictRationale: 'Test',
      summary: 'Test summary',
      data: { field1: 'value1' },
      narrative,
      citations: overrides.citations || [],
      redFlags: overrides.redFlags || ['A valid red flag that is sufficiently long'],
      modelUsed: 'test-model',
      tokenCost: { input: 100, output: 100 },
      searchesPerformed: overrides.searchesPerformed || [],
      ...overrides,
    };
  }

  describe('scoreMethodology basics', () => {
    it('should return { score, checks, passed } shape', () => {
      const section = makeMethodSection('company_info', 1, 'This is a test narrative about the company.');
      const result = scoreMethodology(section);
      expect(result).toBeDefined();
      expect(typeof result.score).toBe('number');
      expect(Array.isArray(result.checks)).toBe(true);
      expect(typeof result.passed).toBe('boolean');
    });

    it('should return lower score when critical methodology elements are missing', () => {
      const fullNarrative = 'The event was a market dislocation causing a price drop. We evaluate Meaning, Moat, and Management. Key metrics: revenue $5B, earnings $1B, ROIC 25%.';
      const emptyNarrative = 'This section has no relevant methodology content at all.';

      const fullSection = makeMethodSection('company_info', 1, fullNarrative);
      const emptySection = makeMethodSection('company_info', 1, emptyNarrative);

      const fullResult = scoreMethodology(fullSection);
      const emptyResult = scoreMethodology(emptySection);

      expect(fullResult.score).toBeGreaterThan(emptyResult.score);
    });
  });

  describe('METHODOLOGY_CHECKS constant', () => {
    it('should have checks for at least 8 section types', () => {
      expect(METHODOLOGY_CHECKS).toBeDefined();
      const keys = Object.keys(METHODOLOGY_CHECKS);
      expect(keys.length).toBeGreaterThanOrEqual(8);
    });

    it('should include keys for company_info, market_position, barriers_and_moats, growth_metrics, management, balance_sheet, pest_risks, valuation_summary', () => {
      expect(METHODOLOGY_CHECKS.company_info).toBeDefined();
      expect(METHODOLOGY_CHECKS.market_position).toBeDefined();
      expect(METHODOLOGY_CHECKS.barriers_and_moats).toBeDefined();
      expect(METHODOLOGY_CHECKS.growth_metrics).toBeDefined();
      expect(METHODOLOGY_CHECKS.management).toBeDefined();
      expect(METHODOLOGY_CHECKS.balance_sheet).toBeDefined();
      expect(METHODOLOGY_CHECKS.pest_risks).toBeDefined();
      expect(METHODOLOGY_CHECKS.valuation_summary).toBeDefined();
    });

    it('should have at least 2 checks per section type', () => {
      for (const [key, checks] of Object.entries(METHODOLOGY_CHECKS)) {
        if (key === '_exempt') continue;
        expect(checks.length, `${key} should have >=2 checks`).toBeGreaterThanOrEqual(2);
      }
    });

    it('should have check objects with id, label, critical, and test fields', () => {
      const checks = METHODOLOGY_CHECKS.valuation_summary;
      for (const check of checks) {
        expect(typeof check.id).toBe('string');
        expect(typeof check.label).toBe('string');
        expect(typeof check.critical).toBe('boolean');
        expect(typeof check.test).toBe('function');
      }
    });
  });

  describe('Radar section (company_info)', () => {
    it('should check for event analysis, 3 Ms coverage, company snapshot', () => {
      const narrative = 'The event was a significant price drop creating a dislocation. We evaluate Meaning — do I understand it? Moat — does it have durable advantages? Management — is leadership trustworthy? Key metrics: revenue $5B.';
      const section = makeMethodSection('company_info', 1, narrative, {
        data: { ticker: 'TEST', revenue: 5000000000 },
      });
      const result = scoreMethodology(section);
      expect(result.score).toBeGreaterThanOrEqual(80);
      const passedChecks = result.checks.filter(c => c.passed);
      expect(passedChecks.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Market Position (market_position)', () => {
    it('should check for market share data and competitor comparison', () => {
      const narrative = 'The company holds a 15% market share in the specialty grocery segment. Competitors include Whole Foods and Trader Joes who collectively represent the primary competitive threats. The TAM is estimated at $200B.';
      const section = makeMethodSection('market_position', 3, narrative);
      const result = scoreMethodology(section);
      expect(result.score).toBeGreaterThanOrEqual(80);
    });
  });

  describe('Barriers & Moats (barriers_and_moats)', () => {
    it('should check for specific moat type identification', () => {
      const narrative = 'The company benefits from a strong brand moat — its name is synonymous with the category. Switching costs are low but the brand loyalty creates a de facto toll bridge. This moat should endure for 10-20 years as the brand recognition continues to deepen. Competitors like Whole Foods have tried to copy the format but cannot replicate the value proposition.';
      const section = makeMethodSection('barriers_and_moats', 4, narrative);
      const result = scoreMethodology(section);
      const moatCheck = result.checks.find(c => c.id === 'moat-type');
      expect(moatCheck).toBeDefined();
      expect(moatCheck.passed).toBe(true);
    });

    it('should fail when no moat type is identified', () => {
      const narrative = 'The company has some advantages but we did not analyze them specifically.';
      const section = makeMethodSection('barriers_and_moats', 4, narrative);
      const result = scoreMethodology(section);
      const moatCheck = result.checks.find(c => c.id === 'moat-type');
      expect(moatCheck).toBeDefined();
      expect(moatCheck.passed).toBe(false);
    });
  });

  describe('Valuation (valuation_summary)', () => {
    it('should check for all 4 methods, FGR derivation, and buy price', () => {
      const narrative = 'We computed the MOS (Margin of Safety) price at $45, Payback Time (PBT) target of 6.2 years, Ten Cap price at $52, and Equity Bond price at $48. The FGR (future growth rate) was derived from historical growth of 15%, analyst consensus of 12%, company guidance of 14%, and sector CAGR of 8%. The buy price range is $42-$52 with a sticker price of $90. Sensitivity analysis across conservative and optimistic scenarios confirms the range. The 10-year outlook suggests durable growth.';
      const section = makeMethodSection('valuation_summary', 10, narrative);
      const result = scoreMethodology(section);
      expect(result.score).toBeGreaterThanOrEqual(80);
    });

    it('should fail when valuation methods are missing', () => {
      const narrative = 'The company looks undervalued based on our analysis. We think it is worth more.';
      const section = makeMethodSection('valuation_summary', 10, narrative);
      const result = scoreMethodology(section);
      expect(result.score).toBeLessThan(50);
    });
  });

  describe('PEST Risks (pest_risks)', () => {
    it('should check for all 4 PEST categories', () => {
      const narrative = 'Political risks include tariffs on imported goods and FDA regulation changes. Economic factors like consumer spending slowdowns and inflation affect margins. Social trends toward health-conscious eating provide tailwinds. Technological disruption from online grocery delivery poses a long-term threat. Our rebuttal: the company has demonstrated resilience through multiple economic cycles.';
      const section = makeMethodSection('pest_risks', 9, narrative);
      const result = scoreMethodology(section);
      const pestCheck = result.checks.find(c => c.id === 'pest-all-categories');
      expect(pestCheck).toBeDefined();
      expect(pestCheck.passed).toBe(true);
    });

    it('should fail when PEST categories are incomplete', () => {
      const narrative = 'There are some political risks from regulation. Economic headwinds exist.';
      const section = makeMethodSection('pest_risks', 9, narrative);
      const result = scoreMethodology(section);
      const pestCheck = result.checks.find(c => c.id === 'pest-all-categories');
      expect(pestCheck.passed).toBe(false);
    });
  });

  describe('FCF / Growth Metrics section 5', () => {
    it('should check for FCF ratio and maintenance vs growth capex', () => {
      const narrative = 'Free cash flow was $800M with an FCF ratio of 1.2x earnings. Operating cash flow minus capex yields strong FCF. Maintenance capex is estimated at 70% of total while growth capex drives expansion. Shareholders benefit from buybacks totaling $500M.';
      const section = makeMethodSection('growth_metrics', 5, narrative);
      const result = scoreMethodology(section);
      expect(result.score).toBeGreaterThanOrEqual(60);
    });
  });

  describe('Management (management)', () => {
    it('should check for CEO evaluation and insider ownership', () => {
      const narrative = 'CEO Jack Sinclair has transformed the company since 2019 with a clear strategic vision. Insider ownership shows management has skin in the game with significant share purchases. The capital allocation strategy focuses on share buybacks and store expansion. Management integrity is demonstrated by delivering on their Big Audacious Goal of 10% operating margins.';
      const section = makeMethodSection('management', 6, narrative);
      const result = scoreMethodology(section);
      expect(result.score).toBeGreaterThanOrEqual(60);
    });
  });

  describe('ROE/ROIC/Debt (growth_metrics section 7)', () => {
    it('should check for return metrics and debt analysis', () => {
      const narrative = 'ROE stands at 45% reflecting exceptional capital efficiency. ROIC of 32% confirms returns are not debt-driven. The company has zero long-term debt and leverage is minimal. Return consistency over the past 10 years has been remarkable with ROE never dropping below 20%.';
      const section = makeMethodSection('growth_metrics', 7, narrative);
      const result = scoreMethodology(section);
      expect(result.score).toBeGreaterThanOrEqual(60);
    });
  });

  describe('Balance Sheet (balance_sheet)', () => {
    it('should check for current ratio and equity trend', () => {
      const narrative = 'The current ratio of 1.8 indicates strong liquidity. Shareholder equity has grown consistently from $500M to $1.2B over the past decade, demonstrating a positive equity trend. Assets exceed liabilities with a comfortable margin.';
      const section = makeMethodSection('balance_sheet', 8, narrative);
      const result = scoreMethodology(section);
      expect(result.score).toBeGreaterThanOrEqual(60);
    });
  });

  describe('Exempt sections', () => {
    it('should return score 100 for overall_verdict', () => {
      const section = makeMethodSection('overall_verdict', 11, 'Final verdict on the company.');
      const result = scoreMethodology(section);
      expect(result.score).toBe(100);
      expect(result.checks).toEqual([]);
      expect(result.passed).toBe(true);
    });

    it('should return score 100 for synthesis sections', () => {
      const section = makeMethodSection('synthesis', 12, 'Synthesis of all sections.');
      const result = scoreMethodology(section);
      expect(result.score).toBe(100);
    });

    it('should return score 100 for PSR sections', () => {
      const section = makeMethodSection('psr_annual', 0, 'PSR annual reader output.');
      const result = scoreMethodology(section);
      expect(result.score).toBe(100);
    });
  });

  describe('Scoring formula', () => {
    it('should weight critical checks 2x and supplementary 1x', () => {
      // Build a section where only critical checks pass
      const narrative = 'The company holds a 25% market share. Competitors include Walmart and Target.';
      const section = makeMethodSection('market_position', 3, narrative);
      const result = scoreMethodology(section);
      // Score should be > 0 since critical checks pass
      expect(result.score).toBeGreaterThan(0);
    });

    it('should set passed=true when score >= 50', () => {
      const narrative = 'The company holds market share. Competitors include Walmart.';
      const section = makeMethodSection('market_position', 3, narrative);
      const result = scoreMethodology(section);
      if (result.score >= 50) {
        expect(result.passed).toBe(true);
      } else {
        expect(result.passed).toBe(false);
      }
    });
  });

  describe('growth_metrics disambiguation by sectionNumber', () => {
    it('should use FCF checks for sectionNumber 5', () => {
      const narrative = 'Free cash flow analysis shows FCF ratio of 1.1x.';
      const section = makeMethodSection('growth_metrics', 5, narrative);
      const result = scoreMethodology(section);
      const hasFcfCheck = result.checks.some(c => c.id.startsWith('fcf-'));
      expect(hasFcfCheck).toBe(true);
    });

    it('should use ROE/ROIC/Debt checks for sectionNumber 7', () => {
      const narrative = 'ROE is 30% and ROIC is 25%. Debt is manageable.';
      const section = makeMethodSection('growth_metrics', 7, narrative);
      const result = scoreMethodology(section);
      const hasReturnCheck = result.checks.some(c => c.id.startsWith('returns-'));
      expect(hasReturnCheck).toBe(true);
    });
  });

  describe('validateSection integration', () => {
    it('should include methodology field in validateSection return', () => {
      const report = validateSection(companyInfoSection, dataPacketSlice);
      expect(report.methodology).toBeDefined();
      expect(typeof report.methodology.score).toBe('number');
      expect(Array.isArray(report.methodology.checks)).toBe(true);
      expect(typeof report.methodology.passed).toBe('boolean');
    });
  });
});
