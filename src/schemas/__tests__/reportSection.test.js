// Tests for ReportSection, StageReport, DataPacket schemas and JSON Schema generation
// Covers: schema validation, rejection, toJSONSchema(), backward compat, DataPacket slicing
// FMT-01/FMT-02: zodOutputFormat compatibility, CitationSchema url field

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import {
  ReportSectionSchema,
  CitationSchema,
  StageReportSchema,
  getReportSectionJSONSchema,
} from '../reportSection.js';
import { DataPacketSchema } from '../dataPacket.js';

// Fixture: a valid report section (COST FCF analysis)
// data is a JSON string per FMT-01 (agent serializes flexible data as JSON string)
const validSection = {
  key: 'fcf',
  title: 'Free Cash Flow',
  sectionNumber: 5,
  status: 'pass',
  confidence: 'HIGH',
  verdict: 'PASS',
  verdictRationale: 'FCF margins expanding with controlled capex',
  summary: 'COST generates $6.2B FCF with stable margins',
  data: '{"fcfYearly":[5.1,5.5,5.8,6.2],"capexRatio":0.30}',
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

// ─── FMT-01: looseObject replacement ─────────────────────────────────

describe('FMT-01: looseObject replacement', () => {
  it('Test F1: zodOutputFormat(ReportSectionSchema) schema has data.type === string', () => {
    const result = zodOutputFormat(ReportSectionSchema);
    expect(result.type).toBe('json_schema');
    expect(result.schema.properties.data.type).toBe('string');
  });

  it('Test F2: zodOutputFormat schema has charts items as type string', () => {
    const result = zodOutputFormat(ReportSectionSchema);
    const chartsItems = result.schema.properties.charts.items;
    expect(chartsItems.type).toBe('string');
  });

  it('Test F5: ReportSectionSchema.safeParse succeeds when data is a JSON string', () => {
    const section = {
      ...validSection,
      data: '{"ticker":"AAPL","price":150}',
    };
    const result = ReportSectionSchema.safeParse(section);
    expect(result.success).toBe(true);
  });

  it('Test F6: ReportSectionSchema.safeParse succeeds with string chart entries', () => {
    const section = {
      ...validSection,
      charts: [
        '{"type":"bar","config":{"xAxis":"year","yAxis":"revenue"},"data":[{"year":2022,"revenue":100}]}',
        '{"type":"line","config":{"xAxis":"year","yAxis":"price"},"data":[{"year":2022,"price":50}]}',
      ],
    };
    const result = ReportSectionSchema.safeParse(section);
    expect(result.success).toBe(true);
  });

  it('Test F8: No additionalProperties:true in zodOutputFormat output', () => {
    const result = zodOutputFormat(ReportSectionSchema);
    const json = JSON.stringify(result);
    expect(json).not.toContain('"additionalProperties":true');
  });
});

// ─── FMT-02: CitationSchema url field ────────────────────────────────

describe('FMT-02: CitationSchema url field', () => {
  it('Test F4: CitationSchema JSON Schema has url in properties but NOT in required', () => {
    const jsonSchema = z.toJSONSchema(CitationSchema);
    expect(jsonSchema.properties.url).toBeDefined();
    expect(jsonSchema.required).not.toContain('url');
  });

  it('Test F7: StageReportSchema still accepts looseObject for checkpoints[].userInput', () => {
    const stageReport = {
      sections: [validSection],
      overallVerdict: 'PASS',
      generatedAt: '2026-03-24T10:00:00Z',
      totalTokenCost: { input: 28000, output: 4200 },
      checkpoints: [{
        phase: 1,
        status: 'waiting',
        userInput: { foo: 'bar', nested: { a: 1 } },
      }],
    };
    const result = StageReportSchema.safeParse(stageReport);
    expect(result.success).toBe(true);
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
        finalThesis: null,
      },
      onePager: {},
      pitchDeck: null,
      finalThesis: null,
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

// ─── Pitch deck redesign: 12 new section keys ────────────────────────

describe('ReportSectionSchema — pitch deck redesign keys', () => {
  const newKeys = [
    'setup',
    'business_quality',
    'market_position',
    'moat_analysis',
    'cash_generation',
    'returns_leverage',
    'balance_sheet',
    'accounting_red_flags',
    'management_capital_allocation',
    'valuation',
    'risk_profile',
    'investment_verdict',
  ];

  for (const key of newKeys) {
    it(`accepts new key "${key}"`, () => {
      const minimal = {
        key,
        title: 'Test',
        sectionNumber: 1,
        status: 'pass',
        confidence: 'HIGH',
        verdict: 'PASS',
        verdictRationale: 'test',
        summary: 'test',
        data: '{}',
        narrative: 'a'.repeat(250),
        citations: [{ id: 1, ref: 'test', text: 'test', source: 'test' }],
        redFlags: ['flag1', 'flag2'],
        modelUsed: 'claude-sonnet-4-6',
        tokenCost: { input: 1000, output: 500 },
      };
      expect(() => ReportSectionSchema.parse(minimal)).not.toThrow();
    });
  }
});
