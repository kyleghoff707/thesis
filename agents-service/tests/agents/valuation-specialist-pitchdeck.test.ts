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

const { runValuationSpecialistPitchDeck } = await import('../../src/agents/valuation-specialist-pitchdeck.js');
const { callAgentWithStructuredOutput } = await import('../../src/lib/anthropic-client.js');
const { loadAgentPrompt } = await import('../../src/agents/prompts.js');

const SECTION = (n: number, title: string) => ({
  key: `s${n}`, title, sectionNumber: n,
  status: 'pass', confidence: 'HIGH', verdict: 'PASS',
  verdictRationale: '.', summary: '.', data: '{}', narrative: '.',
  citations: [], tables: [], charts: [],
  redFlags: ['x'], primarySourceInsights: [], crossCuttingFindings: [], questions: [],
});

describe('runValuationSpecialistPitchDeck', () => {
  it('includes Section 3 + Section 4 in userMessage, uses Opus + web search', async () => {
    (callAgentWithStructuredOutput as any).mockResolvedValueOnce({
      data: SECTION(10, 'Valuation'),
      modelUsed: 'claude-sonnet-4-6',
      tokenCost: { input: 100, output: 50 },
    });

    const result = await runValuationSpecialistPitchDeck({
      ticker: 'AAPL', runId: 'r1',
      dataPacket: { dp: 1 },
      psrFindings: { annual: SECTION(0, 'A'), quarterly: SECTION(0, 'Q') },
      section3: SECTION(3, 'Market Position'),
      section4: SECTION(4, 'Moats'),
      crossCuttingFindings: [],
    });

    expect(result.sectionNumber).toBe(10);
    expect(result.modelUsed).toBe('claude-sonnet-4-6');
    expect(result.tokenCost).toEqual({ input: 100, output: 50 });
    expect(loadAgentPrompt).toHaveBeenCalledWith('valuation-specialist-pitchdeck');

    const args = (callAgentWithStructuredOutput as any).mock.calls[0][0];
    expect(args.userMessage).toContain('## Section 3');
    expect(args.userMessage).toContain('## Section 4');
    expect(args.model).toBe('claude-sonnet-4-6');
    expect(args.maxWebSearches).toBe(5);
    expect(args.traceName).toBe('pitchdeck.valuation-specialist');
  });
});
