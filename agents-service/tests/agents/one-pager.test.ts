import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/lib/worker-progress.js', () => ({
  ProgressPublisher: vi.fn().mockImplementation(() => ({
    setStatus:      vi.fn().mockResolvedValue(undefined),
    setPhase:       vi.fn().mockResolvedValue(undefined),
    heartbeat:      vi.fn().mockResolvedValue(undefined),
    setRunTokens:   vi.fn().mockResolvedValue(undefined),
    setSubprogress: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('../../src/lib/anthropic-client.js', () => ({
  callAgentWithStructuredOutput: vi.fn(),
}));

vi.mock('../../src/agents/prompts.js', () => ({
  loadAgentPrompt: vi.fn().mockResolvedValue('SYSTEM PROMPT (mocked)'),
}));

const { runOnePagerAgent } = await import('../../src/agents/one-pager.js');
const { callAgentWithStructuredOutput } = await import('../../src/lib/anthropic-client.js');

describe('runOnePagerAgent', () => {
  it('passes ticker into user message and returns parsed output with runner-injected model + tokenCost', async () => {
    (callAgentWithStructuredOutput as any).mockResolvedValueOnce({
      data: {
        ticker: 'AAPL',
        companyName: 'Apple Inc.',
        generatedAt: new Date().toISOString(),
        overallVerdict: 'PASS',
        overallRationale: '...',
        sections: [{
          key: 'company_info', title: 'Company Info', status: 'pass',
          confidence: 'HIGH', summary: '...', narrative: '...', citations: [], redFlags: ['x'],
        }],
      },
      modelUsed: 'claude-sonnet-4-6',
      tokenCost: { input: 100, output: 50 },
    });

    const result = await runOnePagerAgent({ ticker: 'AAPL', runId: 'r1' });
    expect(result.ticker).toBe('AAPL');
    expect(result.sections[0].modelUsed).toBe('claude-sonnet-4-6');
    expect(result.sections[0].tokenCost).toEqual({ input: 100, output: 50 });
    expect((callAgentWithStructuredOutput as any).mock.calls[0][0].userMessage).toContain('AAPL');
  });
});
