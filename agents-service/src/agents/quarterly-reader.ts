import { ReportSectionSchema, type ReportSection } from './schemas/report-section.js';
import { loadAgentPrompt } from './prompts.js';
import { callAgentWithStructuredOutput } from '../lib/anthropic-client.js';
import { ProgressPublisher } from '../lib/worker-progress.js';

export interface QuarterlyReaderInput {
  ticker: string;
  runId: string;
  traceId?: string;
  dataPacket: unknown;
  /** Filing content for 10-Qs only. */
  filingContent: Record<string, unknown>;
  /** Earnings call transcripts. */
  transcriptContent: Record<string, unknown>;
}

const MODEL = 'claude-opus-4-7';

export async function runQuarterlyReader(input: QuarterlyReaderInput): Promise<ReportSection> {
  const systemPrompt = await loadAgentPrompt('quarterly-reader');

  const userMessage =
    `Analyze the 10-Q filings and earnings call transcripts for ${input.ticker}. Extract material ` +
    `findings about quarterly trajectory, guidance changes, management tone, and cross-cutting ` +
    `findings downstream agents should consider. Return your output via the emit_output tool.\n\n` +
    `## DataPacket\n\n` +
    '```json\n' + JSON.stringify(input.dataPacket, null, 2) + '\n```\n\n' +
    `## 10-Q Filings\n\n` +
    '```json\n' + JSON.stringify(input.filingContent, null, 2) + '\n```\n\n' +
    `## Transcripts\n\n` +
    '```json\n' + JSON.stringify(input.transcriptContent, null, 2) + '\n```\n';

  const progress = new ProgressPublisher(input.runId, 'quarterly-reader');
  await progress.setStatus('running', {
    displayName: 'Quarterly Reader',
    wave: 0,
    startedAt: new Date().toISOString(),
  });

  try {
    const { data, modelUsed, tokenCost } = await callAgentWithStructuredOutput({
      systemPrompt,
      userMessage,
      schema: ReportSectionSchema,
      schemaName: 'QuarterlyReaderSection',
      schemaDescription: 'Emit your quarterly-filing + transcript analysis as a ReportSection.',
      model: MODEL,
      maxTokens: 8000,
      traceName: 'pitchdeck.quarterly-reader',
      traceMetadata: { ticker: input.ticker, runId: input.runId, wave: 0 },
      traceId: input.traceId,
      maxResearchTurns: 1,
      progress,
    });

    await progress.setStatus('completed', { finishedAt: new Date().toISOString() });
    return { ...data, modelUsed, tokenCost };
  } catch (err) {
    await progress.setStatus('failed', {
      finishedAt: new Date().toISOString(),
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
