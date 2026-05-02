import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/lib/anthropic-client.js', () => ({
  callAgentWithStructuredOutput: vi.fn(),
}));

vi.mock('../../src/agents/prompts.js', () => ({
  loadAgentPrompt: vi.fn().mockResolvedValue('SYSTEM PROMPT (mocked)'),
}));

const { runOnePagerAgent } = await import('../../src/agents/one-pager.js');
const { callAgentWithStructuredOutput } = await import('../../src/lib/anthropic-client.js');

describe('runOnePagerAgent', () => {
  it('passes ticker into user message and returns parsed output', async () => {
    (callAgentWithStructuredOutput as any).mockResolvedValueOnce({
      ticker: 'AAPL',
      companyName: 'Apple Inc.',
      generatedAt: new Date().toISOString(),
      overallVerdict: 'PASS',
      overallRationale: '...',
      sections: [{
        key: 'company_info', title: 'Company Info', status: 'pass',
        confidence: 'HIGH', summary: '...', narrative: '...', citations: [], redFlags: [],
      }],
    });

    const result = await runOnePagerAgent({ ticker: 'AAPL', runId: 'r1' });
    expect(result.ticker).toBe('AAPL');
    expect((callAgentWithStructuredOutput as any).mock.calls[0][0].userMessage).toContain('AAPL');
  });
});
