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
          sectionNumber: 1,
          status: 'pass',
          confidence: 'HIGH',
          verdict: 'PASS',
          verdictRationale: 'Profile complete and consistent across sources.',
          summary: 'Apple makes consumer electronics and services.',
          data: '{}',
          narrative: 'Apple is a global technology company...',
          citations: [{ id: 1, ref: 'web', text: '...', source: 'apple.com' }],
          redFlags: ['No material concerns identified.'],
          modelUsed: 'claude-sonnet-4-6',
          tokenCost: { input: 1000, output: 500 },
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
