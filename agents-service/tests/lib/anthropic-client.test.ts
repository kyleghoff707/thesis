import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

// Mock the Anthropic SDK before importing the wrapper.
// We expose APIError on the default export so `err instanceof Anthropic.APIError`
// works inside the wrapper's 4xx-detection branch.
class MockAPIError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

vi.mock('@anthropic-ai/sdk', () => {
  const create = vi.fn();
  const Anthropic: any = vi.fn().mockImplementation(() => ({
    messages: { create },
  }));
  Anthropic.APIError = MockAPIError;
  return {
    default: Anthropic,
    __mockCreate: create,
  };
});

vi.mock('../../src/lib/langfuse-client.js', () => ({
  getLangfuse: () => ({
    trace: () => ({
      generation: () => ({ end: vi.fn() }),
      span: () => ({ end: vi.fn() }),
    }),
  }),
  flushLangfuse: vi.fn(),
}));

vi.mock('../../src/lib/env.js', () => ({
  loadEnv: () => ({
    PORT: 3000,
    NODE_ENV: 'test',
    ANTHROPIC_API_KEY: 'test-key',
    INNGEST_EVENT_KEY: 'test',
    INNGEST_SIGNING_KEY: 'test',
    LANGFUSE_PUBLIC_KEY: 'test',
    LANGFUSE_SECRET_KEY: 'test',
    LANGFUSE_HOST: 'https://us.cloud.langfuse.com',
    WORKER_CALLBACK_URL: 'https://example.com',
    WORKER_CALLBACK_SECRET: 'test',
  }),
}));

const { callAgentWithStructuredOutput } = await import('../../src/lib/anthropic-client.js');
const sdk = await import('@anthropic-ai/sdk');
// @ts-expect-error — accessing the mock helper
const mockCreate = (sdk as any).__mockCreate;

const TestSchema = z.object({ verdict: z.enum(['yes', 'no']), reason: z.string() });

describe('callAgentWithStructuredOutput', () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it('returns parsed output when the model emits a tool_use block', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          name: 'emit_output',
          input: { verdict: 'yes', reason: 'good' },
        },
      ],
      stop_reason: 'tool_use',
      usage: { input_tokens: 100, output_tokens: 20, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    });

    const result = await callAgentWithStructuredOutput({
      systemPrompt: 'You are a test agent.',
      userMessage: 'Test',
      schema: TestSchema,
      schemaName: 'TestOutput',
      schemaDescription: 'Test',
      model: 'claude-sonnet-4-6',
      traceName: 'test',
    });

    expect(result).toEqual({ verdict: 'yes', reason: 'good' });
  });

  it('throws NonRetriableError when Anthropic returns 4xx (non-retryable)', async () => {
    const { NonRetriableError } = await import('inngest');
    mockCreate.mockRejectedValueOnce(new MockAPIError('bad request', 400));

    let thrown: unknown;
    try {
      await callAgentWithStructuredOutput({
        systemPrompt: 'You are a test agent.',
        userMessage: 'Test',
        schema: TestSchema,
        schemaName: 'TestOutput',
        schemaDescription: 'Test',
        model: 'claude-sonnet-4-6',
        traceName: 'test',
      });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(NonRetriableError);
    expect((thrown as Error).message).toMatch(/non-retryable/i);
  });

  it('lets 5xx errors propagate (retryable)', async () => {
    const { NonRetriableError } = await import('inngest');
    mockCreate.mockRejectedValueOnce(new MockAPIError('upstream timeout', 503));

    let thrown: unknown;
    try {
      await callAgentWithStructuredOutput({
        systemPrompt: 'You are a test agent.',
        userMessage: 'Test',
        schema: TestSchema,
        schemaName: 'TestOutput',
        schemaDescription: 'Test',
        model: 'claude-sonnet-4-6',
        traceName: 'test',
      });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(MockAPIError);
    expect(thrown).not.toBeInstanceOf(NonRetriableError);
  });

  it('throws when no tool_use block is returned', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'I refuse.' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 100, output_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    });

    await expect(
      callAgentWithStructuredOutput({
        systemPrompt: 'You are a test agent.',
        userMessage: 'Test',
        schema: TestSchema,
        schemaName: 'TestOutput',
        schemaDescription: 'Test',
        model: 'claude-sonnet-4-6',
        traceName: 'test',
      })
    ).rejects.toThrow(/Phase A exited without emit_output/i);
  });
});

describe('callAgentWithStructuredOutput — Pattern 1 auto-loop', () => {
  beforeEach(() => mockCreate.mockReset());

  it('returns immediately when model emits emit_output on turn 1', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'tool_use', name: 'emit_output', input: { verdict: 'yes', reason: 'good' } }],
      stop_reason: 'tool_use',
      usage: { input_tokens: 100, output_tokens: 20, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    });

    const result = await callAgentWithStructuredOutput({
      systemPrompt: 'You are test', userMessage: 'go',
      schema: TestSchema, schemaName: 'TestOutput', schemaDescription: 't',
      model: 'claude-sonnet-4-6', traceName: 'test',
      maxResearchTurns: 5,
    });

    expect(result).toEqual({ verdict: 'yes', reason: 'good' });
    expect(mockCreate).toHaveBeenCalledOnce();
  });

  it('loops while model returns stop_reason=tool_use without emit_output', async () => {
    // Turn 1: server tool web_search runs (server_tool_use + web_search_tool_result blocks).
    // No client tool_use to execute, but stop_reason=tool_use.
    // Turn 2: model emits emit_output.
    mockCreate
      .mockResolvedValueOnce({
        content: [
          { type: 'server_tool_use', name: 'web_search', input: { query: 'AAPL revenue' } },
          { type: 'web_search_tool_result', tool_use_id: 'sv1', content: [] },
        ],
        stop_reason: 'tool_use',
        usage: { input_tokens: 200, output_tokens: 30, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      })
      .mockResolvedValueOnce({
        content: [{ type: 'tool_use', name: 'emit_output', input: { verdict: 'yes', reason: 'AAPL strong' } }],
        stop_reason: 'tool_use',
        usage: { input_tokens: 250, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      });

    const result = await callAgentWithStructuredOutput({
      systemPrompt: 'You are test', userMessage: 'go',
      schema: TestSchema, schemaName: 'TestOutput', schemaDescription: 't',
      model: 'claude-sonnet-4-6', traceName: 'test',
      maxResearchTurns: 5, maxWebSearches: 3,
    });

    expect(result).toEqual({ verdict: 'yes', reason: 'AAPL strong' });
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it('continues looping on stop_reason=pause_turn', async () => {
    mockCreate
      .mockResolvedValueOnce({
        content: [{ type: 'server_tool_use', name: 'web_search', input: { query: 'q1' } }],
        stop_reason: 'pause_turn',
        usage: { input_tokens: 100, output_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      })
      .mockResolvedValueOnce({
        content: [{ type: 'tool_use', name: 'emit_output', input: { verdict: 'yes', reason: 'paused then resumed' } }],
        stop_reason: 'tool_use',
        usage: { input_tokens: 150, output_tokens: 20, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      });

    const result = await callAgentWithStructuredOutput({
      systemPrompt: 's', userMessage: 'u',
      schema: TestSchema, schemaName: 'TestOutput', schemaDescription: 't',
      model: 'claude-sonnet-4-6', traceName: 'test',
      maxResearchTurns: 5, maxWebSearches: 3,
    });

    expect(result).toEqual({ verdict: 'yes', reason: 'paused then resumed' });
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });
});
