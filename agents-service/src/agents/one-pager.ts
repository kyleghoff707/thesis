import { OnePagerOutput, OnePagerOutputSchema } from './schemas/one-pager.js';
import { loadAgentPrompt } from './prompts.js';
import { callAgentWithStructuredOutput } from '../lib/anthropic-client.js';

export interface OnePagerInput {
  ticker: string;
  runId: string;
  /** Optional stable trace id (e.g. Inngest event.id) to dedupe Langfuse traces across step replays. */
  traceId?: string;
}

const ONE_PAGER_MODEL = 'claude-sonnet-4-6';

export async function runOnePagerAgent(input: OnePagerInput): Promise<OnePagerOutput> {
  const systemPrompt = await loadAgentPrompt('one-pager');

  // Note: forced tool_choice on emit_output is incompatible with web_search in a single
  // turn — the model can ONLY emit_output and won't run web_search. Web search is disabled
  // for now until we either (a) add a multi-turn agent loop, or (b) prove the prompt-only
  // path produces acceptable output. Re-enable by adding the tool below + switching to
  // tool_choice: 'auto' in the wrapper.
  const userMessage = `Generate a One Pager for ticker ${input.ticker}. Use what you know from your training data to produce the best analysis you can. Return your output via the emit_output tool with the structured schema.`;

  return callAgentWithStructuredOutput({
    systemPrompt,
    userMessage,
    schema: OnePagerOutputSchema,
    schemaName: 'OnePagerOutput',
    schemaDescription:
      'Emit the One Pager analysis as a structured object matching the OnePagerOutput schema.',
    model: ONE_PAGER_MODEL,
    maxTokens: 8000,
    traceName: 'one-pager',
    traceMetadata: { ticker: input.ticker, runId: input.runId },
    traceId: input.traceId,
  });
}
