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

  // Construct the system prompt as a content array so we can attach cache_control.
  // System prompt is cached (5min ephemeral) — agent specialists with the same
  // system prompt + same DataPacket will hit cache for ~10x cost reduction on input.
  const system: Anthropic.TextBlockParam[] = [
    { type: 'text', text: params.systemPrompt, cache_control: { type: 'ephemeral' } },
  ];

  // If cacheable context is provided (e.g. DataPacket), put it as the first user-message
  // content block with its own cache_control breakpoint.
  const userContent: Anthropic.ContentBlockParam[] = [];
  if (params.cacheableContext) {
    userContent.push({
      type: 'text',
      text: params.cacheableContext,
      cache_control: { type: 'ephemeral' },
    });
  }
  userContent.push({ type: 'text', text: params.userMessage });

  // 4xx errors are non-retryable by definition — Inngest's retry policy would just
  // burn tokens making the same malformed request. Wrap them in NonRetriableError so
  // Inngest gives up immediately. 5xx and network errors propagate normally.
  let response;
  try {
    response = await anthropic.messages.create({
      model: params.model,
      max_tokens: params.maxTokens ?? 8000,
      system,
      messages: [{ role: 'user', content: userContent }],
      tools: [...(params.tools ?? []), outputTool] as Anthropic.ToolUnion[],
      tool_choice: { type: 'tool', name: 'emit_output' },
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

  // Find the tool_use block — there should be exactly one because of tool_choice.
  const toolUse = response.content.find((b) => b.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use' || toolUse.name !== 'emit_output') {
    throw new Error(`Anthropic returned no tool_use block (stop_reason=${response.stop_reason})`);
  }

  // Validate against Zod schema. If parse fails, throw — the Inngest retry policy
  // will catch and retry with the validation error in the prompt (handled in Task 15).
  const parsed = params.schema.safeParse(toolUse.input);
  if (!parsed.success) {
    throw new Error(`Schema validation failed: ${parsed.error.message}`);
  }

  return parsed.data;
}
