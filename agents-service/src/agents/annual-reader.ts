import { ReportSectionSchema, type ReportSection } from './schemas/report-section.js';
import { loadAgentPrompt } from './prompts.js';
import { callAgentWithStructuredOutput } from '../lib/anthropic-client.js';
import { ProgressPublisher } from '../lib/worker-progress.js';

export interface AnnualReaderInput {
  ticker: string;
  runId: string;
  /** Stable Langfuse trace id (Inngest event.id). */
  traceId?: string;
  /** Pre-assembled DataPacket fetched from R2. */
  dataPacket: unknown;
  /** Filing content for 10-Ks only — Inngest function filters before calling. */
  filingContent: Record<string, unknown>;
}

const MODEL = 'claude-sonnet-4-6';

export async function runAnnualReader(input: AnnualReaderInput): Promise<ReportSection> {
  const systemPrompt = await loadAgentPrompt('annual-reader');

  const userMessage =
    `Analyze the 10-K filings for ${input.ticker}. Extract material findings about the business, ` +
    `material year-over-year changes, and any cross-cutting findings downstream agents should consider. ` +
    `Return your output via the emit_output tool.\n\n` +
    `## DataPacket\n\n` +
    '```json\n' + JSON.stringify(input.dataPacket, null, 2) + '\n```\n\n' +
    `## 10-K Filings\n\n` +
    '```json\n' + JSON.stringify(input.filingContent, null, 2) + '\n```\n';

  const progress = new ProgressPublisher(input.runId, 'annual-reader');
  await progress.setStatus('running', {
    displayName: 'Annual Reader',
    wave: 0,
    startedAt: new Date().toISOString(),
  });

  try {
    const output = await callAgentWithStructuredOutput({
      systemPrompt,
      userMessage,
      schema: ReportSectionSchema,
      schemaName: 'AnnualReaderSection',
      schemaDescription: 'Emit your annual-filing analysis as a ReportSection.',
      model: MODEL,
      maxTokens: 8000,
      traceName: 'pitchdeck.annual-reader',
      traceMetadata: { ticker: input.ticker, runId: input.runId, wave: 0 },
      traceId: input.traceId,
      // No web search — PSR is filing-grounded only.
      maxResearchTurns: 1,
      progress,
    });

    await progress.setStatus('completed', { finishedAt: new Date().toISOString() });
    return output;
  } catch (err) {
    await progress.setStatus('failed', {
      finishedAt: new Date().toISOString(),
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    throw err; // bubble — Inngest retries this step (per-agent retry isolation)
  }
}
