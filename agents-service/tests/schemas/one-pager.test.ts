import { describe, it, expect } from 'vitest';
import { OnePagerOutputSchema } from '../../src/agents/schemas/one-pager.js';

describe('OnePagerOutputSchema', () => {
  it('accepts a valid one-pager output', () => {
    const valid = {
      ticker: 'AAPL',
      companyName: 'Apple Inc.',
      generatedAt: new Date().toISOString(),
      overallVerdict: 'PASS',
      overallRationale: 'Strong financials, durable moat.',
      sections: [
        {
          key: 'company_info',
          title: 'Company Info',
          status: 'pass',
          confidence: 'HIGH',
          summary: 'Apple makes consumer electronics and services.',
          narrative: 'Apple is a global technology company...',
          citations: [{ id: 1, ref: 'web', text: '...', source: 'apple.com' }],
          redFlags: [],
        },
      ],
    };
    expect(() => OnePagerOutputSchema.parse(valid)).not.toThrow();
  });

  it('rejects a one-pager without sections', () => {
    expect(() => OnePagerOutputSchema.parse({ ticker: 'AAPL' })).toThrow();
  });

  it('rejects an invalid verdict value', () => {
    const invalid = {
      ticker: 'AAPL',
      companyName: 'Apple Inc.',
      generatedAt: new Date().toISOString(),
      overallVerdict: 'MAYBE',
      overallRationale: '...',
      sections: [],
    };
    expect(() => OnePagerOutputSchema.parse(invalid)).toThrow();
  });
});
