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

const { runSynthesisWriterPitchDeck } = await import('../../src/agents/synthesis-writer-pitchdeck.js');
const { callAgentWithStructuredOutput } = await import('../../src/lib/anthropic-client.js');
const { loadAgentPrompt } = await import('../../src/agents/prompts.js');

const SECTION = (n: number, title: string) => ({
  key: `s${n}`, title, sectionNumber: n,
  status: 'pass', confidence: 'HIGH', verdict: 'PASS',
  verdictRationale: '.', summary: '.', data: '{}', narrative: '.',
  citations: [], tables: [], charts: [],
  redFlags: ['x'], primarySourceInsights: [], crossCuttingFindings: [], questions: [],
});

describe('runSynthesisWriterPitchDeck', () => {
  it('includes all 10 prior section headers in userMessage, returns Section 11', async () => {
    (callAgentWithStructuredOutput as any).mockResolvedValueOnce({
      data: SECTION(11, 'Overall Verdict'),
      modelUsed: 'claude-sonnet-4-6',
      tokenCost: { input: 100, output: 50 },
    });

    const priorSections = [1,2,3,4,5,6,7,8,9,10].map(n => SECTION(n, `Section ${n}`));

    const result = await runSynthesisWriterPitchDeck({
      ticker: 'AAPL', runId: 'r1',
      priorSections,
      crossCuttingFindings: [],
    });

    expect(result.sectionNumber).toBe(11);
    expect(result.modelUsed).toBe('claude-sonnet-4-6');
    expect(result.tokenCost).toEqual({ input: 100, output: 50 });
    expect(loadAgentPrompt).toHaveBeenCalledWith('synthesis-writer-pitchdeck');

    const args = (callAgentWithStructuredOutput as any).mock.calls[0][0];
    for (let n = 1; n <= 10; n++) {
      expect(args.userMessage).toContain(`### Section ${n}`);
    }
    expect(args.maxWebSearches).toBeUndefined();
    expect(args.maxResearchTurns).toBe(1);
    expect(args.traceName).toBe('pitchdeck.synthesis-writer');
  });
});
