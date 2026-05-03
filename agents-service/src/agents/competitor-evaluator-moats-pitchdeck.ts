import {
  ReportSectionSchema,
  type ReportSection,
  type CrossCuttingFinding,
} from './schemas/report-section.js';
import { loadAgentPrompt } from './prompts.js';
import { callAgentWithStructuredOutput } from '../lib/anthropic-client.js';
import { ProgressPublisher } from '../lib/worker-progress.js';

export interface CompetitorMoatsPDInput {
  ticker: string;
  runId: string;
  traceId?: string;
  dataPacket: unknown;
  psrFindings: { annual: ReportSection; quarterly: ReportSection };
  section3: ReportSection; // Market Position output
  crossCuttingFindings: CrossCuttingFinding[];
}

const MODEL = 'claude-sonnet-4-6';

export async function runCompetitorMoatsPitchDeck(input: CompetitorMoatsPDInput): Promise<ReportSection> {
  const systemPrompt = await loadAgentPrompt('competitor-evaluator-moats-pitchdeck');

  const userMessage =
    `Produce Pitch Deck Section 4 (Large Barrier to Entry & Moats) for ${input.ticker}. Use Section 3 ` +
    `(Market Position) as your starting point — the named peer set there is your moat-comparison universe. ` +
    `Validate the durability of each moat with web search where useful. Return your output via the ` +
    `emit_output tool as a single ReportSection.\n\n` +
    `## DataPacket\n\n\`\`\`json\n${JSON.stringify(input.dataPacket, null, 2)}\n\`\`\`\n\n` +
    `## PSR Findings\n\n` +
    `### Annual Reader\n\`\`\`json\n${JSON.stringify(input.psrFindings.annual, null, 2)}\n\`\`\`\n\n` +
    `### Quarterly Reader\n\`\`\`json\n${JSON.stringify(input.psrFindings.quarterly, null, 2)}\n\`\`\`\n\n` +
    `## Section 3 (Market Position)\n\n\`\`\`json\n${JSON.stringify(input.section3, null, 2)}\n\`\`\`\n\n` +
    `## Cross-Cutting Findings From Prior Waves\n\n\`\`\`json\n${JSON.stringify(input.crossCuttingFindings, null, 2)}\n\`\`\`\n`;

  const progress = new ProgressPublisher(input.runId, 'competitor-evaluator-moats-pitchdeck');
  await progress.setStatus('running', {
    displayName: 'Competitor — Moats',
    wave: 2,
    startedAt: new Date().toISOString(),
  });

  try {
    const { data, modelUsed, tokenCost } = await callAgentWithStructuredOutput({
      systemPrompt,
      userMessage,
      schema: ReportSectionSchema,
      schemaName: 'CompetitorMoatsSection',
      schemaDescription: 'Emit Section 4 (Moats) as a ReportSection.',
      model: MODEL,
      maxTokens: 8000,
      traceName: 'pitchdeck.competitor-moats',
      traceMetadata: { ticker: input.ticker, runId: input.runId, wave: 2 },
      traceId: input.traceId,
      maxResearchTurns: 3,
      maxWebSearches: 3,
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
