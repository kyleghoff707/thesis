import Anthropic from '@anthropic-ai/sdk';
import { NonRetriableError } from 'inngest';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { loadEnv } from './env.js';
import { getLangfuse } from './langfuse-client.js';

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (client) return client;
  const env = loadEnv();
  client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 4 });
  return client;
}

export interface CallAgentParams<T> {
  systemPrompt: string;
  userMessage: string;
  /** Optional cacheable user-side block (e.g. DataPacket). Cached separately from system prompt. */
  cacheableContext?: string;
  schema: z.ZodType<T, z.ZodTypeDef, unknown>;
  schemaName: string;
  schemaDescription: string;
  model: string;
  maxTokens?: number;
  traceName: string;
  traceMetadata?: Record<string, unknown>;
  /** Stable Langfuse trace ID — pass event.id from Inngest to dedupe across step replays. */
  traceId?: string;
  /** Pass tools (e.g. web_search) — they coexist with the forced output tool. */
  tools?: Array<Record<string, unknown>>;
  // ─── NEW optional params (Tasks 11–16) ────────────────────────────────────
  /** Max research turns in Phase A before forcing emit. Default: 1 (current behavior). */
  maxResearchTurns?: number;
  /** Web search cap. If provided, web_search tool is added automatically. */
  maxWebSearches?: number;
  /** Per-agent cumulative cost ceiling (USD). If exceeded, force final emit. */
  costCeilingUsd?: number;
  /** ProgressPublisher for heartbeat + tokens publishing. */
  progress?: import('./worker-progress.js').ProgressPublisher;
  /** Per-agent token cumulative cap. Default: 200_000. */
  maxTotalTokens?: number;
}

export async function callAgentWithStructuredOutput<T>(params: CallAgentParams<T>): Promise<T> {
  const anthropic = getClient();
  const langfuse = getLangfuse();

  const trace = langfuse.trace({
    name: params.traceName,
    metadata: params.traceMetadata,
    ...(params.traceId ? { id: params.traceId } : {}),
  });
  const generation = trace.generation({
    name: 'anthropic-call',
    model: params.model,
    input: { system: params.systemPrompt.slice(0, 500), user: params.userMessage.slice(0, 500) },
  });

  // Build the schema-emitting tool. Forcing tool_choice on this tool guarantees the model
  // returns a single tool_use block matching the schema.
  // Use the openAi target so the schema is inlined (Anthropic requires top-level type: "object",
  // not a $ref/definitions wrapper).
  const jsonSchema = zodToJsonSchema(params.schema, {
    target: 'jsonSchema2019-09',
    $refStrategy: 'none', // inline everything — no $defs/$ref
  }) as Record<string, unknown>;
  // Strip JSON Schema-only fields Anthropic doesn't expect.
  delete (jsonSchema as { $schema?: unknown }).$schema;
  const outputTool = {
    name: 'emit_output',
    description: params.schemaDescription,
    input_schema: jsonSchema,
  };

  // Build tools array. web_search is a server tool, added when maxWebSearches > 0.
  const tools: Anthropic.ToolUnion[] = [];
  if ((params.maxWebSearches ?? 0) > 0) {
    tools.push({
      type: 'web_search_20250305',
      name: 'web_search',
      max_uses: params.maxWebSearches,
    } as unknown as Anthropic.ToolUnion);
  }
  // Caller-provided tools (passthrough)
  for (const t of params.tools ?? []) tools.push(t as unknown as Anthropic.ToolUnion);
  // emit_output last
  tools.push(outputTool as unknown as Anthropic.ToolUnion);

  // System prompt with cache_control.
  const system: Anthropic.TextBlockParam[] = [
    { type: 'text', text: params.systemPrompt, cache_control: { type: 'ephemeral' } },
  ];

  // User content (cacheable context, then user message).
  const userContent: Anthropic.ContentBlockParam[] = [];
  if (params.cacheableContext) {
    userContent.push({ type: 'text', text: params.cacheableContext, cache_control: { type: 'ephemeral' } });
  }
  userContent.push({ type: 'text', text: params.userMessage });

  // Conversation accumulator across turns.
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userContent }];

  const maxResearchTurns = params.maxResearchTurns ?? 1;

  // ─── Phase A — research loop with tool_choice='auto' ───────────────────────
  for (let turn = 0; turn < maxResearchTurns; turn++) {
    let response: Anthropic.Message;
    try {
      response = await anthropic.messages.create({
        model: params.model,
        max_tokens: params.maxTokens ?? 8000,
        system,
        messages,
        tools,
        tool_choice: maxResearchTurns > 1 ? { type: 'auto' } : { type: 'tool', name: 'emit_output' },
      });
    } catch (err) {
      if (err instanceof Anthropic.APIError && err.status >= 400 && err.status < 500) {
        throw new NonRetriableError(
          `Anthropic ${err.status} (non-retryable): ${err.message}`,
          { cause: err },
        );
      }
      throw err;
    }

    messages.push({ role: 'assistant', content: response.content });

    // Did the model emit_output?
    const emitBlock = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === 'emit_output'
    );
    if (emitBlock) {
      generation.end({
        output: { stopReason: response.stop_reason },
        usage: {
          input: response.usage.input_tokens,
          output: response.usage.output_tokens,
          total: response.usage.input_tokens + response.usage.output_tokens,
        },
        metadata: {
          cacheCreationTokens: response.usage.cache_creation_input_tokens ?? 0,
          cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
        },
      });
      const parsed = params.schema.safeParse(emitBlock.input);
      if (!parsed.success) throw new Error(`Schema validation failed: ${parsed.error.message}`);
      return parsed.data;
    }

    // Loop continues — server tools auto-feed results, no client tool execution needed.
    if (response.stop_reason === 'tool_use') continue;
    // pause_turn: server tool internal cap hit; re-send to resume.
    // Cast because the SDK type union doesn't include 'pause_turn' yet.
    if ((response.stop_reason as string) === 'pause_turn') continue;

    // Model returned text without emitting. Break to Phase B (Task 14).
    if (response.stop_reason === 'end_turn') break;
  }

  // Phase B will handle this in Task 14. Until then, fail loud.
  throw new Error('Phase A exited without emit_output (Phase B not yet implemented — see Task 14)');
}
