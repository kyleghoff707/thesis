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

export interface CallAgentResult<T> {
  data: T;
  modelUsed: string;
  tokenCost: { input: number; output: number };
}

export async function callAgentWithStructuredOutput<T>(
  params: CallAgentParams<T>,
): Promise<CallAgentResult<T>> {
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

  // Heartbeat publisher — runs every 8s for the lifetime of this wrapper call.
  // Cleared in finally{} on exit (success or throw).
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  const startHeartbeat = () => {
    if (!params.progress) return;
    heartbeatTimer = setInterval(() => {
      params.progress!.heartbeat().catch(() => { /* swallow */ });
    }, 8_000);
  };
  const stopHeartbeat = () => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  };

  startHeartbeat();
  try {
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

    // Cumulative state across turns for circuit breakers + progress publishing.
    let totalInputTokens  = 0;
    let totalOutputTokens = 0;
    let totalCostUsd = 0;
    const { input: costPerInputTok, output: costPerOutputTok } = costsForModel(params.model);
    const maxTotalTokens = params.maxTotalTokens ?? 200_000;

    // ─── Phase A — research loop with tool_choice='auto' ───────────────────────
    for (let turn = 0; turn < maxResearchTurns; turn++) {
      // Circuit breakers BEFORE each call.
      if (totalInputTokens + totalOutputTokens >= maxTotalTokens) {
        console.warn(`[${params.traceName}] token budget exceeded (${totalInputTokens + totalOutputTokens}/${maxTotalTokens}) — forcing emit`);
        break;
      }
      if (params.costCeilingUsd !== undefined && totalCostUsd >= params.costCeilingUsd) {
        console.warn(`[${params.traceName}] cost ceiling exceeded ($${totalCostUsd.toFixed(2)}/$${params.costCeilingUsd}) — forcing emit`);
        break;
      }

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

      // Accumulate after each call — used by the breakers on the next iteration.
      totalInputTokens  += response.usage.input_tokens;
      totalOutputTokens += response.usage.output_tokens;
      totalCostUsd      += response.usage.input_tokens  * costPerInputTok
                         + response.usage.output_tokens * costPerOutputTok;

      // Publish cumulative tokens + cost (best-effort; swallowed if it fails).
      if (params.progress) {
        params.progress.setRunTokens(totalInputTokens, totalOutputTokens, totalCostUsd)
          .catch(() => { /* swallow — already logged in publisher */ });
      }

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
        return {
          data: parsed.data,
          modelUsed: params.model,
          tokenCost: { input: totalInputTokens, output: totalOutputTokens },
        };
      }

      // Loop continues — server tools auto-feed results, no client tool execution needed.
      if (response.stop_reason === 'tool_use') continue;
      // pause_turn: server tool internal cap hit; re-send to resume.
      // Cast because the SDK type union doesn't include 'pause_turn' yet.
      if ((response.stop_reason as string) === 'pause_turn') continue;

      // Model returned text without emitting. Break to Phase B (Task 14).
      if (response.stop_reason === 'end_turn') break;
    }

    // ─── Phase B — forced synthesis with reflect-and-retry ────────────────────
    // Up to 3 attempts. On Zod failure, append the validation error and retry.
    // After 3 failures, throw NonRetriableError so Inngest stops burning tokens.
    let lastZodError: string | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt === 0) {
        messages.push({
          role: 'user',
          content: 'Now synthesize the research above into the required JSON by calling the emit_output tool. Do not perform additional research.',
        });
      } else if (lastZodError) {
        messages.push({
          role: 'user',
          content: `Your previous output failed validation: ${lastZodError}. Emit a corrected output that exactly matches the schema.`,
        });
      }

      let phaseBResponse: Anthropic.Message;
      try {
        phaseBResponse = await anthropic.messages.create({
          model: params.model,
          max_tokens: params.maxTokens ?? 8000,
          system,
          messages,
          tools: [outputTool as unknown as Anthropic.ToolUnion],
          tool_choice: { type: 'tool', name: 'emit_output' },
        });
      } catch (err) {
        if (err instanceof Anthropic.APIError && err.status >= 400 && err.status < 500) {
          throw new NonRetriableError(
            `Anthropic Phase B ${err.status} (non-retryable): ${err.message}`,
            { cause: err },
          );
        }
        throw err;
      }

      messages.push({ role: 'assistant', content: phaseBResponse.content });

      // Accumulate Phase B tokens too.
      totalInputTokens  += phaseBResponse.usage.input_tokens;
      totalOutputTokens += phaseBResponse.usage.output_tokens;
      totalCostUsd      += phaseBResponse.usage.input_tokens  * costPerInputTok
                         + phaseBResponse.usage.output_tokens * costPerOutputTok;
      if (params.progress) {
        params.progress.setRunTokens(totalInputTokens, totalOutputTokens, totalCostUsd)
          .catch(() => {});
      }

      const phaseBEmit = phaseBResponse.content.find(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === 'emit_output'
      );
      if (!phaseBEmit) {
        throw new Error(`Phase B failed to emit (stop_reason=${phaseBResponse.stop_reason})`);
      }

      const parsed = params.schema.safeParse(phaseBEmit.input);
      if (parsed.success) {
        generation.end({
          output: { stopReason: phaseBResponse.stop_reason },
          usage: {
            input:  phaseBResponse.usage.input_tokens,
            output: phaseBResponse.usage.output_tokens,
            total:  phaseBResponse.usage.input_tokens + phaseBResponse.usage.output_tokens,
          },
          metadata: {
            cacheCreationTokens: phaseBResponse.usage.cache_creation_input_tokens ?? 0,
            cacheReadTokens:     phaseBResponse.usage.cache_read_input_tokens ?? 0,
          },
        });
        return {
          data: parsed.data,
          modelUsed: params.model,
          tokenCost: { input: totalInputTokens, output: totalOutputTokens },
        };
      }

      lastZodError = parsed.error.message;
    }

    throw new NonRetriableError(`Schema validation failed after 3 attempts: ${lastZodError}`);
  } finally {
    stopHeartbeat();
  }
}

function costsForModel(model: string): { input: number; output: number } {
  // USD per token. Keep updated when Anthropic prices change.
  if (model.startsWith('claude-opus'))   return { input: 15 / 1e6, output: 75 / 1e6 };
  if (model.startsWith('claude-sonnet')) return { input:  3 / 1e6, output: 15 / 1e6 };
  if (model.startsWith('claude-haiku'))  return { input:  1 / 1e6, output:  5 / 1e6 };
  // Unknown model — be conservative (treat as Opus pricing).
  return { input: 15 / 1e6, output: 75 / 1e6 };
}
