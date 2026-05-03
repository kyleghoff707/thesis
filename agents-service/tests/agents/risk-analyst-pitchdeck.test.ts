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

const { runRiskAnalystPitchDeck } = await import('../../src/agents/risk-analyst-pitchdeck.js');
const { callAgentWithStructuredOutput } = await import('../../src/lib/anthropic-client.js');
const { loadAgentPrompt } = await import('../../src/agents/prompts.js');

const SECTION = (n: number, title: string) => ({
  key: `s${n}`, title, sectionNumber: n,
  status: 'pass', confidence: 'HIGH', verdict: 'PASS',
  verdictRationale: '.', summary: '.', data: '{}', narrative: '.',
  citations: [], tables: [], charts: [],
  redFlags: ['x'], primarySourceInsights: [], crossCuttingFindings: [], questions: [],
});

describe('runRiskAnalystPitchDeck', () => {
  it('uses Opus, web search, returns Section 9', async () => {
    (callAgentWithStructuredOutput as any).mockResolvedValueOnce({
      data: SECTION(9, 'PEST Risks'),
      modelUsed: 'claude-opus-4-7',
      tokenCost: { input: 100, output: 50 },
    });

    const result = await runRiskAnalystPitchDeck({
      ticker: 'AAPL', runId: 'r1',
      dataPacket: { dp: 1 },
      psrFindings: { annual: SECTION(0, 'A'), quarterly: SECTION(0, 'Q') },
      crossCuttingFindings: [],
    });

    expect(result.sectionNumber).toBe(9);
    expect(result.modelUsed).toBe('claude-opus-4-7');
    expect(result.tokenCost).toEqual({ input: 100, output: 50 });
    expect(loadAgentPrompt).toHaveBeenCalledWith('risk-analyst-pitchdeck');

    const args = (callAgentWithStructuredOutput as any).mock.calls[0][0];
    expect(args.model).toBe('claude-opus-4-7');
    expect(args.maxWebSearches).toBe(5);
    expect(args.traceName).toBe('pitchdeck.risk-analyst');
  });
});
