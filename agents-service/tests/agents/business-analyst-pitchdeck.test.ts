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

const { runBusinessAnalystPitchDeck } = await import('../../src/agents/business-analyst-pitchdeck.js');
const { callAgentWithStructuredOutput } = await import('../../src/lib/anthropic-client.js');
const { loadAgentPrompt } = await import('../../src/agents/prompts.js');

const SECTION = (n: number, title: string) => ({
  key: `s${n}`, title, sectionNumber: n,
  status: 'pass', confidence: 'HIGH', verdict: 'PASS',
  verdictRationale: '.', summary: '.', data: '{}', narrative: '.',
  citations: [], tables: [], charts: [],
  redFlags: ['minor concern'], primarySourceInsights: [], crossCuttingFindings: [], questions: [],
});

describe('runBusinessAnalystPitchDeck', () => {
  it('loads BA prompt, builds userMessage with PSR + findings, returns MultiSection', async () => {
    const stub = { sections: [SECTION(1, 'Radar'), SECTION(2, 'Simple & Predictable')] };
    (callAgentWithStructuredOutput as any).mockResolvedValueOnce({
      data: stub,
      modelUsed: 'claude-sonnet-4-6',
      tokenCost: { input: 100, output: 50 },
    });

    const result = await runBusinessAnalystPitchDeck({
      ticker: 'AAPL', runId: 'r1',
      dataPacket: { dp: 1 },
      psrFindings: { annual: SECTION(0, 'Annual'), quarterly: SECTION(0, 'Quarterly') },
      crossCuttingFindings: [{ finding: 'high debt', relevantAgents: [], severity: 'high', source: 'fa' }],
    });

    expect(result.sections).toHaveLength(2);
    for (const s of result.sections) {
      expect(s.modelUsed).toBe('claude-sonnet-4-6');
      expect(s.tokenCost).toEqual({ input: 100, output: 50 });
    }
    expect(loadAgentPrompt).toHaveBeenCalledWith('business-analyst-pitchdeck');

    const args = (callAgentWithStructuredOutput as any).mock.calls[0][0];
    expect(args.userMessage).toContain('AAPL');
    expect(args.userMessage).toContain('## DataPacket');
    expect(args.userMessage).toContain('## PSR Findings');
    expect(args.userMessage).toContain('## Cross-Cutting Findings');
    expect(args.model).toBe('claude-sonnet-4-6');
    expect(args.maxWebSearches).toBe(5);
    expect(args.maxResearchTurns).toBe(5);
  });
});
