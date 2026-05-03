import { OnePagerOutput, OnePagerOutputSchema } from './schemas/one-pager.js';
import { loadAgentPrompt } from './prompts.js';
import { callAgentWithStructuredOutput } from '../lib/anthropic-client.js';
import { ProgressPublisher } from '../lib/worker-progress.js';

export interface OnePagerInput {
  ticker: string;
  runId: string;
  /** Optional stable trace id (e.g. Inngest event.id) to dedupe Langfuse traces across step replays. */
  traceId?: string;
}

const ONE_PAGER_MODEL = 'claude-sonnet-4-6';

export async function runOnePagerAgent(input: OnePagerInput): Promise<OnePagerOutput> {
  const systemPrompt = await loadAgentPrompt('one-pager');

  const userMessage = `Generate a One Pager for ticker ${input.ticker}. Perform 2-3 web searches to ground your analysis in current information about the company. Return your output via the emit_output tool with the structured schema.`;

  const progress = new ProgressPublisher(input.runId, 'one-pager');
  await progress.setStatus('running', {
    displayName: 'One Pager',
    startedAt: new Date().toISOString(),
  });
  await progress.setPhase('researching', 'Researching the company');

  try {
    const { data, modelUsed, tokenCost } = await callAgentWithStructuredOutput({
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

      // Pattern 1 — auto-loop with web search, cost ceiling, token budget.
      maxResearchTurns: 8,
      maxWebSearches: 8,
      costCeilingUsd: 2.0,
      maxTotalTokens: 200_000,
      progress,
    });

    await progress.setStatus('completed', {
      finishedAt: new Date().toISOString(),
    });
    return {
      ...data,
      sections: data.sections.map((s) => ({ ...s, modelUsed, tokenCost })),
    };
  } catch (err) {
    await progress.setStatus('failed', {
      finishedAt: new Date().toISOString(),
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
