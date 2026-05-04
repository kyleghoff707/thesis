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
  it('makes 2 sequential single-section calls and returns MultiSection', async () => {
    // Mock 2 single-section responses (one per section).
    (callAgentWithStructuredOutput as any)
      .mockResolvedValueOnce({
        data: SECTION(1, 'Radar'),
        modelUsed: 'claude-sonnet-4-6',
        tokenCost: { input: 100, output: 50 },
      })
      .mockResolvedValueOnce({
        data: SECTION(2, 'Simple & Predictable'),
        modelUsed: 'claude-sonnet-4-6',
        tokenCost: { input: 120, output: 60 },
      });

    const result = await runBusinessAnalystPitchDeck({
      ticker: 'AAPL', runId: 'r1',
      dataPacket: { dp: 1 },
      psrFindings: { annual: SECTION(0, 'Annual'), quarterly: SECTION(0, 'Quarterly') },
      crossCuttingFindings: [{ finding: 'high debt', relevantAgents: [], severity: 'high', source: 'fa' }],
    });

    // Wrapper returns MultiSection-shaped output (2 sections merged)
    expect(result.sections).toHaveLength(2);
    expect(result.sections[0].sectionNumber).toBe(1);
    expect(result.sections[1].sectionNumber).toBe(2);
    expect(result.sections[0].modelUsed).toBe('claude-sonnet-4-6');
    expect(result.sections[0].tokenCost).toEqual({ input: 100, output: 50 });
    expect(result.sections[1].tokenCost).toEqual({ input: 120, output: 60 });
    expect(loadAgentPrompt).toHaveBeenCalledWith('business-analyst-pitchdeck');
    expect((callAgentWithStructuredOutput as any).mock.calls).toHaveLength(2);

    // First call (Section 1) — userMessage targets just Section 1 with ReportSectionSchema
    const callOne = (callAgentWithStructuredOutput as any).mock.calls[0][0];
    expect(callOne.userMessage).toContain('Section 1 (Radar)');
    expect(callOne.userMessage).toContain('AAPL');
    expect(callOne.userMessage).toContain('## DataPacket');
    expect(callOne.userMessage).toContain('## PSR Findings');
    expect(callOne.userMessage).toContain('## Cross-Cutting Findings');
    expect(callOne.model).toBe('claude-sonnet-4-6');
    expect(callOne.maxWebSearches).toBe(3);
    expect(callOne.traceName).toBe('pitchdeck.business-analyst.section-1');

    // Second call (Section 2)
    const callTwo = (callAgentWithStructuredOutput as any).mock.calls[1][0];
    expect(callTwo.userMessage).toContain('Section 2 (Simple & Predictable)');
    expect(callTwo.traceName).toBe('pitchdeck.business-analyst.section-2');
  });
});
