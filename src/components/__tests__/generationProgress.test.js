// Tests for GenerationProgress — progress state to section status mapping
// ONEP-05 coverage: computeSectionStatuses

import { describe, it, expect } from 'vitest';
import { _testExports } from '../OnePager.jsx';

const { computeSectionStatuses } = _testExports;

describe('GenerationProgress: computeSectionStatuses', () => {
  it('maps mixed progress to correct display states', () => {
    const progress = {
      sections: {
        company_info: { status: 'complete' },
        minimum_standards: { status: 'complete' },
        meaning: { status: 'running' },
        growth_metrics: { status: 'pending' },
        valuation_summary: { status: 'pending' },
        overall_verdict: { status: 'pending' },
      },
    };
    const result = computeSectionStatuses(progress);
    expect(result.company_info).toBe('complete');
    expect(result.minimum_standards).toBe('complete');
    expect(result.meaning).toBe('running');
    expect(result.growth_metrics).toBe('pending');
    expect(result.valuation_summary).toBe('pending');
    expect(result.overall_verdict).toBe('pending');
  });

  it('all complete returns all complete', () => {
    const progress = {
      sections: {
        company_info: { status: 'complete' },
        minimum_standards: { status: 'complete' },
        meaning: { status: 'complete' },
        growth_metrics: { status: 'complete' },
        valuation_summary: { status: 'complete' },
        overall_verdict: { status: 'complete' },
      },
    };
    const result = computeSectionStatuses(progress);
    for (const key of Object.keys(result)) {
      expect(result[key]).toBe('complete');
    }
  });

  it('null progress returns empty object', () => {
    const result = computeSectionStatuses(null);
    expect(result).toEqual({});
  });

  it('undefined progress returns empty object', () => {
    const result = computeSectionStatuses(undefined);
    expect(result).toEqual({});
  });

  it('failed section maps to failed status', () => {
    const progress = {
      sections: {
        company_info: { status: 'complete' },
        meaning: { status: 'failed', error: 'token limit exceeded' },
      },
    };
    const result = computeSectionStatuses(progress);
    expect(result.meaning).toBe('failed');
  });

  it('percentage: 2 complete out of 6 total is ~33%', () => {
    const progress = {
      sections: {
        company_info: { status: 'complete' },
        minimum_standards: { status: 'complete' },
        meaning: { status: 'pending' },
        growth_metrics: { status: 'pending' },
        valuation_summary: { status: 'pending' },
        overall_verdict: { status: 'pending' },
      },
    };
    const statuses = computeSectionStatuses(progress);
    const keys = Object.keys(statuses);
    const complete = keys.filter(k => statuses[k] === 'complete').length;
    const pct = Math.round((complete / keys.length) * 100);
    expect(pct).toBe(33);
  });
});
