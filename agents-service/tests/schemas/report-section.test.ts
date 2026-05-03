import { describe, it, expect } from 'vitest';
import {
  ReportSectionSchema,
  MultiSectionSchema,
  CrossCuttingFindingSchema,
  type ReportSection,
} from '../../src/agents/schemas/report-section.js';

const MINIMAL_SECTION: ReportSection = {
  key: 'fcf',
  title: 'Free Cash Flow',
  sectionNumber: 5,
  status: 'pass',
  confidence: 'HIGH',
  verdict: 'PASS',
  verdictRationale: 'FCF positive every year for last decade.',
  summary: 'Strong FCF generation.',
  data: '{}',
  narrative: 'AAPL has generated positive free cash flow every year for the past decade...',
  citations: [],
  tables: [],
  charts: [],
  redFlags: ['No material concerns identified.'],
  primarySourceInsights: [],
  crossCuttingFindings: [],
  questions: [],
  modelUsed: 'claude-sonnet-4-6',
  tokenCost: { input: 1000, output: 500 },
};

describe('ReportSectionSchema', () => {
  it('accepts a minimal valid section', () => {
    expect(() => ReportSectionSchema.parse(MINIMAL_SECTION)).not.toThrow();
  });

  it('rejects a section with zero red flags', () => {
    const noRedFlags = { ...MINIMAL_SECTION, redFlags: [] };
    expect(() => ReportSectionSchema.parse(noRedFlags)).toThrow();
  });

  it('rejects an unknown status enum value', () => {
    const badStatus = { ...MINIMAL_SECTION, status: 'unknown' };
    expect(() => ReportSectionSchema.parse(badStatus)).toThrow();
  });
});

describe('MultiSectionSchema', () => {
  it('wraps an array of sections', () => {
    const valid = { sections: [MINIMAL_SECTION] };
    expect(() => MultiSectionSchema.parse(valid)).not.toThrow();
  });
});

describe('CrossCuttingFindingSchema', () => {
  it('accepts a valid finding', () => {
    const valid = {
      finding: 'Debt-fueled buybacks reducing interest coverage.',
      relevantAgents: ['valuation-specialist', 'risk-analyst'],
      severity: 'high',
      source: 'financial-analyst',
    };
    expect(() => CrossCuttingFindingSchema.parse(valid)).not.toThrow();
  });

  it('rejects unknown severity values', () => {
    const bad = {
      finding: '...',
      relevantAgents: [],
      severity: 'critical',
      source: 'x',
    };
    expect(() => CrossCuttingFindingSchema.parse(bad)).toThrow();
  });
});
