/**
 * triangulation-reporter.test.js — Tests for triangulation console + JSON report generation
 *
 * Tests generateTriangulationConsoleReport, generateFixRecommendations, generateRegressionDiff.
 */

import { describe, it, expect } from 'vitest';
import {
  generateTriangulationConsoleReport,
  generateFixRecommendations,
  generateRegressionDiff,
} from '../../../../validation/scripts/lib/triangulation-reporter.mjs';

// ─── Fixtures ────────────────────────────────────────────────

function makeMockCompanyResults() {
  return [
    {
      ticker: 'AAPL',
      classifications: [
        { field: 'revenues', year: '2023', statement: 'income', classification: 'MATCH', rootCause: null, thesisValue: 383000000000, consensusValue: 383000000000, sources: { fmp: 383000000000, simfin: 383000000000, mstarpy: 383000000000 } },
        { field: 'net_income_loss', year: '2023', statement: 'income', classification: 'MATCH', rootCause: null, thesisValue: 97000000000, consensusValue: 97000000000, sources: { fmp: 97000000000, simfin: 97000000000, mstarpy: 97000000000 } },
        { field: 'intangible_assets', year: '2023', statement: 'balance', classification: 'CONSENSUS_DIFF', rootCause: 'tag_miss', thesisValue: null, consensusValue: 5200000000, sources: { fmp: 5200000000, simfin: 5200000000, mstarpy: 5200000000 } },
        { field: 'intangible_assets', year: '2022', statement: 'balance', classification: 'CONSENSUS_DIFF', rootCause: 'tag_miss', thesisValue: null, consensusValue: 4800000000, sources: { fmp: 4800000000, simfin: 4800000000, mstarpy: 4800000000 } },
        { field: 'capital_expenditures', year: '2023', statement: 'cashFlow', classification: 'LIKELY_BUG', rootCause: 'sign_flip', thesisValue: -11000000000, consensusValue: 11000000000, sources: { fmp: 11000000000, simfin: 11000000000, mstarpy: null } },
        { field: 'other_income_expense', year: '2023', statement: 'income', classification: 'METHODOLOGY_DIFF', rootCause: null, thesisValue: 500000000, consensusValue: null, sources: { fmp: 500000000, simfin: -200000000, mstarpy: 300000000 } },
        { field: 'obscure_field', year: '2023', statement: 'balance', classification: 'COVERAGE_GAP', rootCause: null, thesisValue: null, consensusValue: null, sources: { fmp: null, simfin: null, mstarpy: null } },
        { field: 'normalized_operating_income', year: '2023', statement: 'income', classification: 'UNIQUE_COVERAGE', rootCause: null, thesisValue: 112000000000, consensusValue: null, sources: { fmp: null, simfin: null, mstarpy: null } },
      ],
    },
    {
      ticker: 'MSFT',
      classifications: [
        { field: 'revenues', year: '2023', statement: 'income', classification: 'MATCH', rootCause: null, thesisValue: 212000000000, consensusValue: 212000000000, sources: { fmp: 212000000000, simfin: 212000000000, mstarpy: 212000000000 } },
        { field: 'intangible_assets', year: '2023', statement: 'balance', classification: 'CONSENSUS_DIFF', rootCause: 'tag_miss', thesisValue: null, consensusValue: 9800000000, sources: { fmp: 9800000000, simfin: 9800000000, mstarpy: 9800000000 } },
        { field: 'accrued_liabilities', year: '2023', statement: 'balance', classification: 'CONSENSUS_DIFF', rootCause: 'derivation_error', thesisValue: 15000000000, consensusValue: 18000000000, sources: { fmp: 18000000000, simfin: 18000000000, mstarpy: null } },
        { field: 'capital_expenditures', year: '2023', statement: 'cashFlow', classification: 'MATCH', rootCause: null, thesisValue: 28000000000, consensusValue: 28000000000, sources: { fmp: 28000000000, simfin: 28000000000, mstarpy: null } },
      ],
    },
  ];
}

function makeMockBaseline() {
  return {
    generatedAt: '2026-03-25T23:51:51.973Z',
    overallAccuracy: 91.2,
    summary: {
      totalCompared: 14818,
      totalMatch: 13507,
      totalClose: 79,
      totalDiff: 1232,
      totalMissing: 3539,
      totalSkipped: 404,
    },
    companies: [],
    topFailurePatterns: [
      { field: 'intangible_assets (balance_sheet)', totalFailures: 149, companyCount: 38, companies: ['AAPL', 'MSFT'] },
      { field: 'accrued_liabilities (balance_sheet)', totalFailures: 120, companyCount: 31, companies: ['MSFT'] },
      { field: 'property_plant_equipment (balance_sheet)', totalFailures: 80, companyCount: 20, companies: ['AAPL'] },
    ],
  };
}

// ─── generateTriangulationConsoleReport ─────────────────────

describe('generateTriangulationConsoleReport', () => {
  it('returns a string containing TRIANGULATION REPORT header', () => {
    const results = makeMockCompanyResults();
    const report = generateTriangulationConsoleReport(results);
    expect(report).toContain('TRIANGULATION REPORT');
  });

  it('includes per-company ticker lines with classification counts', () => {
    const results = makeMockCompanyResults();
    const report = generateTriangulationConsoleReport(results);
    expect(report).toContain('AAPL');
    expect(report).toContain('MSFT');
    // AAPL has 2 MATCH, 2 CONSENSUS_DIFF, 1 LIKELY_BUG, 1 METHODOLOGY_DIFF, 1 COVERAGE_GAP, 1 UNIQUE_COVERAGE
    expect(report).toContain('MATCH');
    expect(report).toContain('CONSENSUS_DIFF');
  });

  it('includes overall totals footer', () => {
    const results = makeMockCompanyResults();
    const report = generateTriangulationConsoleReport(results);
    // Should contain overall summary line
    expect(report).toContain('OVERALL');
  });

  it('shows top failure patterns for CONSENSUS_DIFF fields', () => {
    const results = makeMockCompanyResults();
    const report = generateTriangulationConsoleReport(results);
    // intangible_assets appears in both AAPL and MSFT as CONSENSUS_DIFF
    expect(report).toContain('intangible_assets');
  });
});

// ─── generateFixRecommendations ─────────────────────────────

describe('generateFixRecommendations', () => {
  it('returns object with recommendations sorted by affectedYears descending', () => {
    const results = makeMockCompanyResults();
    const fixRecs = generateFixRecommendations(results);
    expect(fixRecs.recommendations).toBeDefined();
    expect(fixRecs.recommendations.length).toBeGreaterThan(0);

    // Check sorting: first recommendation should have highest affectedYears
    for (let i = 0; i < fixRecs.recommendations.length - 1; i++) {
      expect(fixRecs.recommendations[i].affectedYears)
        .toBeGreaterThanOrEqual(fixRecs.recommendations[i + 1].affectedYears);
    }
  });

  it('summary has correct counts for each classification type', () => {
    const results = makeMockCompanyResults();
    const fixRecs = generateFixRecommendations(results);
    const s = fixRecs.summary;

    // Total classifications: AAPL 8 + MSFT 4 = 12
    expect(s.totalFields).toBe(12);

    // MATCH: AAPL 2 + MSFT 2 = 4
    expect(s.match).toBe(4);

    // CONSENSUS_DIFF: AAPL 2 + MSFT 2 = 4
    expect(s.consensusDiff).toBe(4);

    // LIKELY_BUG: AAPL 1 = 1
    expect(s.likelyBug).toBe(1);

    // METHODOLOGY_DIFF: AAPL 1 = 1
    expect(s.methodologyDiff).toBe(1);

    // COVERAGE_GAP: AAPL 1 = 1
    expect(s.coverageGap).toBe(1);

    // UNIQUE_COVERAGE: AAPL 1 = 1
    expect(s.uniqueCoverage).toBe(1);
  });

  it('byRootCause groups entries by rootCause key', () => {
    const results = makeMockCompanyResults();
    const fixRecs = generateFixRecommendations(results);

    expect(fixRecs.byRootCause).toBeDefined();
    // tag_miss: intangible_assets (AAPL + MSFT)
    expect(fixRecs.byRootCause.tag_miss).toBeDefined();
    expect(fixRecs.byRootCause.tag_miss.length).toBeGreaterThan(0);

    // sign_flip: capital_expenditures
    expect(fixRecs.byRootCause.sign_flip).toBeDefined();
    expect(fixRecs.byRootCause.sign_flip.length).toBeGreaterThan(0);

    // derivation_error: accrued_liabilities
    expect(fixRecs.byRootCause.derivation_error).toBeDefined();
    expect(fixRecs.byRootCause.derivation_error.length).toBeGreaterThan(0);
  });

  it('recommendations have correct priority numbers starting from 1', () => {
    const results = makeMockCompanyResults();
    const fixRecs = generateFixRecommendations(results);

    expect(fixRecs.recommendations[0].priority).toBe(1);
    // Priorities should be sequential
    fixRecs.recommendations.forEach((rec, i) => {
      expect(rec.priority).toBe(i + 1);
    });
  });

  it('recommendation entries have all required fields', () => {
    const results = makeMockCompanyResults();
    const fixRecs = generateFixRecommendations(results);

    const rec = fixRecs.recommendations[0];
    expect(rec).toHaveProperty('priority');
    expect(rec).toHaveProperty('field');
    expect(rec).toHaveProperty('statement');
    expect(rec).toHaveProperty('classification');
    expect(rec).toHaveProperty('rootCause');
    expect(rec).toHaveProperty('affectedCompanies');
    expect(rec).toHaveProperty('affectedYears');
    expect(rec).toHaveProperty('consensusValue');
    expect(rec).toHaveProperty('thesisValue');
    expect(rec).toHaveProperty('sampleCompany');
    expect(rec).toHaveProperty('sampleYear');
    expect(rec).toHaveProperty('sources');
  });

  it('regressionDiff is null before caller fills it', () => {
    const results = makeMockCompanyResults();
    const fixRecs = generateFixRecommendations(results);
    expect(fixRecs.regressionDiff).toBeNull();
  });
});

// ─── generateRegressionDiff ─────────────────────────────────

describe('generateRegressionDiff', () => {
  it('returns previousAccuracy 91.2 when given baseline with that value', () => {
    const results = makeMockCompanyResults();
    const fixRecs = generateFixRecommendations(results);
    const baseline = makeMockBaseline();

    const diff = generateRegressionDiff(fixRecs, baseline);
    expect(diff.previousAccuracy).toBe(91.2);
  });

  it('returns empty arrays when no regressions exist', () => {
    // Create simple results with no regressions (no fields went from MATCH to DIFF)
    const results = [
      {
        ticker: 'TEST',
        classifications: [
          { field: 'revenues', year: '2023', statement: 'income', classification: 'MATCH', rootCause: null, thesisValue: 100, consensusValue: 100, sources: {} },
        ],
      },
    ];
    const fixRecs = generateFixRecommendations(results);
    const baseline = {
      overallAccuracy: 91.2,
      topFailurePatterns: [],
    };

    const diff = generateRegressionDiff(fixRecs, baseline);
    expect(diff.fieldsGained).toEqual([]);
    expect(diff.fieldsLost).toEqual([]);
  });

  it('detects fields gained when baseline DIFF becomes MATCH in triangulation', () => {
    // property_plant_equipment was in baseline failures, if it's now MATCH it's "gained"
    const results = [
      {
        ticker: 'TEST',
        classifications: [
          { field: 'property_plant_equipment', year: '2023', statement: 'balance', classification: 'MATCH', rootCause: null, thesisValue: 100, consensusValue: 100, sources: {} },
        ],
      },
    ];
    const fixRecs = generateFixRecommendations(results);
    const baseline = makeMockBaseline(); // has property_plant_equipment in topFailurePatterns

    const diff = generateRegressionDiff(fixRecs, baseline);
    expect(diff.fieldsGained).toContain('property_plant_equipment');
  });

  it('detects classification changes for baseline DIFF fields', () => {
    const results = makeMockCompanyResults();
    const fixRecs = generateFixRecommendations(results);
    const baseline = makeMockBaseline();

    const diff = generateRegressionDiff(fixRecs, baseline);
    expect(diff.classificationChanges).toBeDefined();
    expect(Array.isArray(diff.classificationChanges)).toBe(true);
  });
});
