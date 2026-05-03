import {
  ReportSectionSchema,
  type ReportSection,
  type CrossCuttingFinding,
} from './schemas/report-section.js';
import { loadAgentPrompt } from './prompts.js';
import { callAgentWithStructuredOutput } from '../lib/anthropic-client.js';
import { ProgressPublisher } from '../lib/worker-progress.js';

export interface CompetitorMPPDInput {
  ticker: string;
  runId: string;
  traceId?: string;
  dataPacket: unknown;
  psrFindings: { annual: ReportSection; quarterly: ReportSection };
  crossCuttingFindings: CrossCuttingFinding[];
}

const MODEL = 'claude-sonnet-4-6';

export async function runCompetitorMarketPositionPitchDeck(input: CompetitorMPPDInput): Promise<ReportSection> {
  const systemPrompt = await loadAgentPrompt('competitor-evaluator-market-position-pitchdeck');

  const userMessage =
    `Produce Pitch Deck Section 3 (Dominant Market Position) for ${input.ticker}. Use web search to ` +
    `validate market share claims, identify the named peer set, and surface market share ceiling ` +
    `analysis. Return your output via the emit_output tool as a single ReportSection.\n\n` +
    `## DataPacket\n\n\`\`\`json\n${JSON.stringify(input.dataPacket, null, 2)}\n\`\`\`\n\n` +
    `## PSR Findings\n\n` +
    `### Annual Reader\n\`\`\`json\n${JSON.stringify(input.psrFindings.annual, null, 2)}\n\`\`\`\n\n` +
    `### Quarterly Reader\n\`\`\`json\n${JSON.stringify(input.psrFindings.quarterly, null, 2)}\n\`\`\`\n\n` +
    `## Cross-Cutting Findings From Prior Waves\n\n\`\`\`json\n${JSON.stringify(input.crossCuttingFindings, null, 2)}\n\`\`\`\n`;

  const progress = new ProgressPublisher(input.runId, 'competitor-evaluator-market-position-pitchdeck');
  await progress.setStatus('running', {
    displayName: 'Competitor — Market Position',
    wave: 1,
    startedAt: new Date().toISOString(),
  });

  try {
    const output = await callAgentWithStructuredOutput({
      systemPrompt,
      userMessage,
      schema: ReportSectionSchema,
      schemaName: 'CompetitorMarketPositionSection',
      schemaDescription: 'Emit Section 3 (Dominant Market Position) as a ReportSection.',
      model: MODEL,
      maxTokens: 8000,
      traceName: 'pitchdeck.competitor-market-position',
      traceMetadata: { ticker: input.ticker, runId: input.runId, wave: 1 },
      traceId: input.traceId,
      maxResearchTurns: 5,
      maxWebSearches: 5,
      progress,
    });

    await progress.setStatus('completed', { finishedAt: new Date().toISOString() });
    return output;
  } catch (err) {
    await progress.setStatus('failed', {
      finishedAt: new Date().toISOString(),
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
