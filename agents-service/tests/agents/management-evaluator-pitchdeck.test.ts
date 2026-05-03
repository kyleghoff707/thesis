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

const { runManagementEvaluatorPitchDeck } = await import('../../src/agents/management-evaluator-pitchdeck.js');
const { callAgentWithStructuredOutput } = await import('../../src/lib/anthropic-client.js');
const { loadAgentPrompt } = await import('../../src/agents/prompts.js');

const SECTION = (n: number, title: string) => ({
  key: `s${n}`, title, sectionNumber: n,
  status: 'pass', confidence: 'HIGH', verdict: 'PASS',
  verdictRationale: '.', summary: '.', data: '{}', narrative: '.',
  citations: [], tables: [], charts: [],
  redFlags: ['x'], primarySourceInsights: [], crossCuttingFindings: [], questions: [],
});

describe('runManagementEvaluatorPitchDeck', () => {
  it('returns Section 6 with web search ON', async () => {
    (callAgentWithStructuredOutput as any).mockResolvedValueOnce({
      data: SECTION(6, 'Management'),
      modelUsed: 'claude-sonnet-4-6',
      tokenCost: { input: 100, output: 50 },
    });

    const result = await runManagementEvaluatorPitchDeck({
      ticker: 'AAPL', runId: 'r1',
      dataPacket: { dp: 1 },
      psrFindings: { annual: SECTION(0, 'A'), quarterly: SECTION(0, 'Q') },
      crossCuttingFindings: [],
    });

    expect(result.sectionNumber).toBe(6);
    expect(result.modelUsed).toBe('claude-sonnet-4-6');
    expect(result.tokenCost).toEqual({ input: 100, output: 50 });
    expect(loadAgentPrompt).toHaveBeenCalledWith('management-evaluator-pitchdeck');

    const args = (callAgentWithStructuredOutput as any).mock.calls[0][0];
    expect(args.maxWebSearches).toBe(5);
    expect(args.traceName).toBe('pitchdeck.management-evaluator');
  });
});
