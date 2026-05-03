import {
  ReportSectionSchema,
  type ReportSection,
  type CrossCuttingFinding,
} from './schemas/report-section.js';
import { loadAgentPrompt } from './prompts.js';
import { callAgentWithStructuredOutput } from '../lib/anthropic-client.js';
import { ProgressPublisher } from '../lib/worker-progress.js';

export interface ManagementEvaluatorPDInput {
  ticker: string;
  runId: string;
  traceId?: string;
  dataPacket: unknown;
  psrFindings: { annual: ReportSection; quarterly: ReportSection };
  crossCuttingFindings: CrossCuttingFinding[];
}

const MODEL = 'claude-sonnet-4-6';

export async function runManagementEvaluatorPitchDeck(input: ManagementEvaluatorPDInput): Promise<ReportSection> {
  const systemPrompt = await loadAgentPrompt('management-evaluator-pitchdeck');

  const userMessage =
    `Produce Pitch Deck Section 6 (Management Talent & Integrity) for ${input.ticker}. Use web search ` +
    `to find management interviews, capital allocation track record, executive comp commentary, and ` +
    `insider transaction context. Return your output via emit_output as a single ReportSection.\n\n` +
    `## DataPacket\n\n\`\`\`json\n${JSON.stringify(input.dataPacket, null, 2)}\n\`\`\`\n\n` +
    `## PSR Findings\n\n` +
    `### Annual Reader\n\`\`\`json\n${JSON.stringify(input.psrFindings.annual, null, 2)}\n\`\`\`\n\n` +
    `### Quarterly Reader\n\`\`\`json\n${JSON.stringify(input.psrFindings.quarterly, null, 2)}\n\`\`\`\n\n` +
    `## Cross-Cutting Findings From Prior Waves\n\n\`\`\`json\n${JSON.stringify(input.crossCuttingFindings, null, 2)}\n\`\`\`\n`;

  const progress = new ProgressPublisher(input.runId, 'management-evaluator-pitchdeck');
  await progress.setStatus('running', {
    displayName: 'Management Evaluator',
    wave: 2,
    startedAt: new Date().toISOString(),
  });

  try {
    const { data, modelUsed, tokenCost } = await callAgentWithStructuredOutput({
      systemPrompt,
      userMessage,
      schema: ReportSectionSchema,
      schemaName: 'ManagementEvaluatorSection',
      schemaDescription: 'Emit Section 6 (Management) as a ReportSection.',
      model: MODEL,
      maxTokens: 16000,
      traceName: 'pitchdeck.management-evaluator',
      traceMetadata: { ticker: input.ticker, runId: input.runId, wave: 2 },
      traceId: input.traceId,
      maxResearchTurns: 5,
      maxWebSearches: 5,
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
