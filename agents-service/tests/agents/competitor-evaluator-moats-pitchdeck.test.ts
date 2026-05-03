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

const { runCompetitorMoatsPitchDeck } = await import('../../src/agents/competitor-evaluator-moats-pitchdeck.js');
const { callAgentWithStructuredOutput } = await import('../../src/lib/anthropic-client.js');
const { loadAgentPrompt } = await import('../../src/agents/prompts.js');

const SECTION = (n: number, title: string) => ({
  key: `s${n}`, title, sectionNumber: n,
  status: 'pass', confidence: 'HIGH', verdict: 'PASS',
  verdictRationale: '.', summary: '.', data: '{}', narrative: '.',
  citations: [], tables: [], charts: [],
  redFlags: ['x'], primarySourceInsights: [], crossCuttingFindings: [], questions: [],
  modelUsed: 'claude-sonnet-4-6', tokenCost: { input: 1, output: 1 },
});

describe('runCompetitorMoatsPitchDeck', () => {
  it('loads moats prompt, includes Section 3 in userMessage, returns ReportSection', async () => {
    (callAgentWithStructuredOutput as any).mockResolvedValueOnce(SECTION(4, 'Moats'));

    const result = await runCompetitorMoatsPitchDeck({
      ticker: 'AAPL', runId: 'r1',
      dataPacket: { dp: 1 },
      psrFindings: { annual: SECTION(0, 'A'), quarterly: SECTION(0, 'Q') },
      section3: SECTION(3, 'Market Position'),
      crossCuttingFindings: [],
    });

    expect(result.sectionNumber).toBe(4);
    expect(loadAgentPrompt).toHaveBeenCalledWith('competitor-evaluator-moats-pitchdeck');

    const args = (callAgentWithStructuredOutput as any).mock.calls[0][0];
    expect(args.userMessage).toContain('## Section 3 (Market Position)');
    expect(args.maxWebSearches).toBe(3);
    expect(args.traceName).toBe('pitchdeck.competitor-moats');
  });
});
