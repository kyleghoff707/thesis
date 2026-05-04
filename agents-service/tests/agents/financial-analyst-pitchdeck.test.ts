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
  it('makes 3 sequential single-section calls and returns MultiSection', async () => {
    (callAgentWithStructuredOutput as any)
      .mockResolvedValueOnce({
        data: SECTION(5, 'Free Cash Flow Generative'),
        modelUsed: 'claude-sonnet-4-6',
        tokenCost: { input: 200, output: 80 },
      })
      .mockResolvedValueOnce({
        data: SECTION(7, 'ROE / ROIC / ROA & Debt'),
        modelUsed: 'claude-sonnet-4-6',
        tokenCost: { input: 220, output: 90 },
      })
      .mockResolvedValueOnce({
        data: SECTION(8, 'Strong Balance Sheet'),
        modelUsed: 'claude-sonnet-4-6',
        tokenCost: { input: 180, output: 70 },
      });

    const result = await runFinancialAnalystPitchDeck({
      ticker: 'AAPL', runId: 'r1',
      dataPacket: { dp: 1 },
      psrFindings: { annual: SECTION(0, 'A'), quarterly: SECTION(0, 'Q') },
      crossCuttingFindings: [],
    });

    expect(result.sections).toHaveLength(3);
    expect(result.sections.map((s) => s.sectionNumber)).toEqual([5, 7, 8]);
    expect(result.sections[0].tokenCost).toEqual({ input: 200, output: 80 });
    expect(result.sections[1].tokenCost).toEqual({ input: 220, output: 90 });
    expect(result.sections[2].tokenCost).toEqual({ input: 180, output: 70 });
    expect(loadAgentPrompt).toHaveBeenCalledWith('financial-analyst-pitchdeck');
    expect((callAgentWithStructuredOutput as any).mock.calls).toHaveLength(3);

    const callOne = (callAgentWithStructuredOutput as any).mock.calls[0][0];
    expect(callOne.userMessage).toContain('Section 5');
    expect(callOne.maxTokens).toBe(16000);
    expect(callOne.maxWebSearches).toBe(2);
    expect(callOne.traceName).toBe('pitchdeck.financial-analyst.section-5');

    const callThree = (callAgentWithStructuredOutput as any).mock.calls[2][0];
    expect(callThree.userMessage).toContain('Section 8');
    expect(callThree.traceName).toBe('pitchdeck.financial-analyst.section-8');
  });
});
