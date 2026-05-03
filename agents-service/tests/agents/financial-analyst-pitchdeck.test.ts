import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/lib/anthropic-client.js', () => ({
  callAgentWithStructuredOutput: vi.fn(),
}));
vi.mock('../../src/agents/prompts.js', () => ({
  loadAgentPrompt: vi.fn().mockResolvedValue('SYSTEM PROMPT (mocked)'),
}));
vi.mock('../../src/lib/worker-progress.js', () => ({
  ProgressPublisher: vi.fn().mockImplementation(() => ({
    setStatus: vi.fn().mockResolvedValue(undefined),
    setPhase: vi.fn().mockResolvedValue(undefined),
    heartbeat: vi.fn().mockResolvedValue(undefined),
    setRunTokens: vi.fn().mockResolvedValue(undefined),
  })),
}));

const { runFinancialAnalystPitchDeck } = await import('../../src/agents/financial-analyst-pitchdeck.js');
const { callAgentWithStructuredOutput } = await import('../../src/lib/anthropic-client.js');
const { loadAgentPrompt } = await import('../../src/agents/prompts.js');

const SECTION = (n: number, title: string) => ({
  key: `s${n}`, title, sectionNumber: n,
  status: 'pass', confidence: 'HIGH', verdict: 'PASS',
  verdictRationale: '.', summary: '.', data: '{}', narrative: '.',
  citations: [], tables: [], charts: [],
  redFlags: ['x'], primarySourceInsights: [], crossCuttingFindings: [], questions: [],
});

describe('runFinancialAnalystPitchDeck', () => {
  it('returns MultiSection with Sections 5, 7, 8', async () => {
    const stub = { sections: [SECTION(5, 'FCF'), SECTION(7, 'ROE'), SECTION(8, 'Balance Sheet')] };
    (callAgentWithStructuredOutput as any).mockResolvedValueOnce({
      data: stub,
      modelUsed: 'claude-sonnet-4-6',
      tokenCost: { input: 200, output: 80 },
    });

    const result = await runFinancialAnalystPitchDeck({
      ticker: 'AAPL', runId: 'r1',
      dataPacket: { dp: 1 },
      psrFindings: { annual: SECTION(0, 'A'), quarterly: SECTION(0, 'Q') },
      crossCuttingFindings: [],
    });

    expect(result.sections).toHaveLength(3);
    for (const s of result.sections) {
      expect(s.modelUsed).toBe('claude-sonnet-4-6');
      expect(s.tokenCost).toEqual({ input: 200, output: 80 });
    }
    expect(loadAgentPrompt).toHaveBeenCalledWith('financial-analyst-pitchdeck');

    const args = (callAgentWithStructuredOutput as any).mock.calls[0][0];
    expect(args.maxTokens).toBe(16000);
    expect(args.maxWebSearches).toBe(3);
    expect(args.traceName).toBe('pitchdeck.financial-analyst');
  });
});
