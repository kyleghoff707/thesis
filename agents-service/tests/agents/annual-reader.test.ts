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

const { runAnnualReader } = await import('../../src/agents/annual-reader.js');
const { callAgentWithStructuredOutput } = await import('../../src/lib/anthropic-client.js');
const { loadAgentPrompt } = await import('../../src/agents/prompts.js');

const STUB_OUTPUT = {
  key: 'annual-reader',
  title: 'Annual Filing Analysis',
  sectionNumber: 0,
  status: 'pass',
  confidence: 'HIGH',
  verdict: null,
  verdictRationale: 'PSR — no verdict.',
  summary: 'Filings analyzed.',
  data: '{}',
  narrative: '...',
  citations: [],
  tables: [],
  charts: [],
  redFlags: ['minor formatting variance in 2023'],
  primarySourceInsights: [],
  crossCuttingFindings: [],
  questions: [],
};

describe('runAnnualReader', () => {
  it('loads the annual-reader prompt and includes filings + DataPacket in user message', async () => {
    (callAgentWithStructuredOutput as any).mockResolvedValueOnce({
      data: STUB_OUTPUT,
      modelUsed: 'claude-sonnet-4-6',
      tokenCost: { input: 5000, output: 800 },
    });

    const result = await runAnnualReader({
      ticker: 'AAPL',
      runId: 'r1',
      dataPacket: { foo: 'bar' },
      filingContent: { '10-K-2025-09-04': { sections: { item1: '...' } } },
    });

    expect(result).toEqual({
      ...STUB_OUTPUT,
      modelUsed: 'claude-sonnet-4-6',
      tokenCost: { input: 5000, output: 800 },
    });
    expect(loadAgentPrompt).toHaveBeenCalledWith('annual-reader');

    const args = (callAgentWithStructuredOutput as any).mock.calls[0][0];
    expect(args.userMessage).toContain('AAPL');
    expect(args.userMessage).toContain('## DataPacket');
    expect(args.userMessage).toContain('## 10-K Filings');
    expect(args.model).toBe('claude-sonnet-4-6');
    expect(args.maxResearchTurns).toBe(1);
    expect(args.maxWebSearches).toBeUndefined();
    expect(args.traceName).toBe('pitchdeck.annual-reader');
  });
});
