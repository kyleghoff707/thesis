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

const { runQuarterlyReader } = await import('../../src/agents/quarterly-reader.js');
const { callAgentWithStructuredOutput } = await import('../../src/lib/anthropic-client.js');
const { loadAgentPrompt } = await import('../../src/agents/prompts.js');

const STUB_OUTPUT = {
  key: 'quarterly-reader',
  title: 'Quarterly Filing Analysis',
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
  redFlags: ['guidance trajectory softened in latest 10-Q'],
  primarySourceInsights: [],
  crossCuttingFindings: [],
  questions: [],
};

describe('runQuarterlyReader', () => {
  it('loads the quarterly-reader prompt and includes 10-Qs + transcripts in user message', async () => {
    (callAgentWithStructuredOutput as any).mockResolvedValueOnce({
      data: STUB_OUTPUT,
      modelUsed: 'claude-opus-4-7',
      tokenCost: { input: 8000, output: 1200 },
    });

    const result = await runQuarterlyReader({
      ticker: 'AAPL',
      runId: 'r1',
      dataPacket: { foo: 'bar' },
      filingContent: { '10-Q-2026-02-26': { sections: { item2: '...' } } },
      transcriptContent: { 'transcript-Q4-2025': 'Operator: ...' },
    });

    expect(result).toEqual({
      ...STUB_OUTPUT,
      modelUsed: 'claude-opus-4-7',
      tokenCost: { input: 8000, output: 1200 },
    });
    expect(loadAgentPrompt).toHaveBeenCalledWith('quarterly-reader');

    const args = (callAgentWithStructuredOutput as any).mock.calls[0][0];
    expect(args.userMessage).toContain('AAPL');
    expect(args.userMessage).toContain('## DataPacket');
    expect(args.userMessage).toContain('## 10-Q Filings');
    expect(args.userMessage).toContain('## Transcripts');
    expect(args.model).toBe('claude-opus-4-7');
    expect(args.maxResearchTurns).toBe(1);
    expect(args.maxWebSearches).toBeUndefined();
    expect(args.traceName).toBe('pitchdeck.quarterly-reader');
  });
});
