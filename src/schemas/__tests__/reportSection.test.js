// Tests for ReportSection, StageReport, DataPacket schemas and JSON Schema generation
// Covers: schema validation, rejection, toJSONSchema(), backward compat, DataPacket slicing

import { describe, it, expect } from 'vitest';
import {
  ReportSectionSchema,
  StageReportSchema,
  getReportSectionJSONSchema,
} from '../reportSection.js';
import { DataPacketSchema, sliceDataPacket } from '../dataPacket.js';

// Fixture: a valid report section (COST FCF analysis)
const validSection = {
  key: 'fcf',
  title: 'Free Cash Flow',
  sectionNumber: 5,
  status: 'pass',
  confidence: 'HIGH',
  verdict: 'PASS',
  verdictRationale: 'FCF margins expanding with controlled capex',
  summary: 'COST generates $6.2B FCF with stable margins',
  data: { fcfYearly: [5.1, 5.5, 5.8, 6.2], capexRatio: 0.30 },
  narrative: "Costco's free cash flow profile demonstrates...",
  citations: [
    { id: 1, ref: 'DataPacket.fcf.yearly[2024]', text: 'FCF of $6.2B', source: 'DataPacket' },
  ],
  redFlags: ['FCF growth decelerating from 18% to 12% CAGR'],
  generatedAt: '2026-03-24T10:00:00Z',
  modelUsed: 'claude-sonnet-4-6',
  tokenCost: { input: 28000, output: 4200 },
};

describe('ReportSectionSchema', () => {
  it('Test 1: validates a well-formed section with all required fields', () => {
    const result = ReportSectionSchema.safeParse(validSection);
    expect(result.success).toBe(true);
  });

  it('Test 2: rejects empty redFlags array (min(1) constraint)', () => {
    const noFlags = { ...validSection, redFlags: [] };
    const result = ReportSectionSchema.safeParse(noFlags);
    expect(result.success).toBe(false);
  });

  it('Test 3: rejects when citations is missing', () => {
    const noCitations = { ...validSection };
    delete noCitations.citations;
    const result = ReportSectionSchema.safeParse(noCitations);
    expect(result.success).toBe(false);
  });

  it('Test 4: rejects invalid status value', () => {
    const badStatus = { ...validSection, status: 'excellent' };
    const result = ReportSectionSchema.safeParse(badStatus);
    expect(result.success).toBe(false);
  });

  it('Test 5: getReportSectionJSONSchema() returns valid JSON Schema', () => {
    const jsonSchema = getReportSectionJSONSchema();
    expect(jsonSchema.type).toBe('object');
    expect(jsonSchema.properties).toBeDefined();
    expect(jsonSchema.properties.key).toBeDefined();
    expect(jsonSchema.properties.redFlags).toBeDefined();
    expect(jsonSchema.properties.tokenCost).toBeDefined();
  });
});

describe('StageReportSchema', () => {
  it('Test 6: validates a stage report with 2 sections', () => {
    const section2 = {
      ...validSection,
      key: 'radar',
      title: 'Radar',
      sectionNumber: 1,
      status: 'review',
      confidence: 'MEDIUM',
      verdict: 'WATCHLIST',
      verdictRationale: 'Mixed signals on competitive positioning',
      summary: 'COST shows strong positioning but faces margin pressure',
      redFlags: ['Membership fee dependency increasing'],
    };
    const stageReport = {
      sections: [validSection, section2],
      overallVerdict: 'PASS',
      generatedAt: '2026-03-24T10:00:00Z',
      totalTokenCost: { input: 56000, output: 8400 },
    };
    const result = StageReportSchema.safeParse(stageReport);
    expect(result.success).toBe(true);
    expect(result.data.sections).toHaveLength(2);
  });

  it('Test 7: backward-compatible — StageReport can be assigned to report.onePager', () => {
    // Existing report model shape from useResearch.js
    const existingReport = {
      id: 'test-uuid-123',
      ticker: 'COST',
      companyName: 'Costco Wholesale Corporation',
      createdAt: '2026-03-24',
      updatedAt: '2026-03-24',
      currentStage: 1,
      stageApprovals: {
        onePager: null,
        pitchDeck: null,
        fullStory: null,
      },
      onePager: {},
      pitchDeck: null,
      fullStory: null,
      notes: '',
      watchlist: false,
      competitors: { privateCompetitors: [] },
    };

    // Assign a StageReport to onePager
    const stageReportData = {
      sections: [validSection],
      overallVerdict: 'PASS',
      generatedAt: '2026-03-24T10:00:00Z',
      totalTokenCost: { input: 28000, output: 4200 },
    };

    const stageResult = StageReportSchema.safeParse(stageReportData);
    expect(stageResult.success).toBe(true);

    // Assign to existing report — existing fields preserved
    const updatedReport = { ...existingReport, onePager: stageResult.data };
    expect(updatedReport.id).toBe('test-uuid-123');
    expect(updatedReport.ticker).toBe('COST');
    expect(updatedReport.companyName).toBe('Costco Wholesale Corporation');
    expect(updatedReport.currentStage).toBe(1);
    expect(updatedReport.stageApprovals.onePager).toBeNull();
    expect(updatedReport.notes).toBe('');
    expect(updatedReport.watchlist).toBe(false);

    // StageReport fields accessible
    expect(typeof updatedReport.onePager.sections).toBe('object');
    expect(Array.isArray(updatedReport.onePager.sections)).toBe(true);
    expect(updatedReport.onePager.sections).toHaveLength(1);
    expect(updatedReport.onePager.overallVerdict).toBe('PASS');
  });
});

describe('DataPacketSchema', () => {
  it('Test 11: validates a minimal packet with just ticker and assembledAt', () => {
    const result = DataPacketSchema.safeParse({
      ticker: 'COST',
      assembledAt: '2026-03-24T10:00:00Z',
    });
    expect(result.success).toBe(true);
  });
});

describe('sliceDataPacket', () => {
  const fullPacket = {
    ticker: 'COST',
    companyInfo: { name: 'Costco Wholesale Corporation', sic: '5311' },
    classification: { sector: 'Consumer Staples', industryGroup: 'Retail' },
    caveats: ['Quarterly data may lag by 1 quarter'],
    financials: { income: { 2024: { revenues: 242290000000 } } },
    gurus: { topHolders: ['Berkshire Hathaway'] },
    insiders: { recentTransactions: [] },
    assembledAt: '2026-03-24T10:00:00Z',
  };

  it('Test 12: returns only requested fields plus always-included fields', () => {
    const sliced = sliceDataPacket(fullPacket, { dataPacketSlice: ['financials'] });
    expect(sliced.ticker).toBe('COST');
    expect(sliced.companyInfo).toBeDefined();
    expect(sliced.classification).toBeDefined();
    expect(sliced.caveats).toBeDefined();
    expect(sliced.financials).toBeDefined();
  });

  it('Test 13: excludes fields not in dataPacketSlice', () => {
    const sliced = sliceDataPacket(fullPacket, { dataPacketSlice: ['financials'] });
    expect(sliced.gurus).toBeUndefined();
    expect(sliced.insiders).toBeUndefined();
    expect(Object.keys(sliced)).not.toContain('gurus');
    expect(Object.keys(sliced)).not.toContain('insiders');
  });
});
