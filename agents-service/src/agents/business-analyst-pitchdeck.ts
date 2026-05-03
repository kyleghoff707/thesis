import {
  MultiSectionSchema,
  type MultiSection,
  type ReportSection,
  type CrossCuttingFinding,
} from './schemas/report-section.js';
import { loadAgentPrompt } from './prompts.js';
import { callAgentWithStructuredOutput } from '../lib/anthropic-client.js';
import { ProgressPublisher } from '../lib/worker-progress.js';

export interface BusinessAnalystPDInput {
  ticker: string;
  runId: string;
  traceId?: string;
  dataPacket: unknown;
  psrFindings: { annual: ReportSection; quarterly: ReportSection };
  crossCuttingFindings: CrossCuttingFinding[];
}

const MODEL = 'claude-sonnet-4-6';

export async function runBusinessAnalystPitchDeck(input: BusinessAnalystPDInput): Promise<MultiSection> {
  const systemPrompt = await loadAgentPrompt('business-analyst-pitchdeck');

  const userMessage =
    `Produce Pitch Deck Sections 1 (Radar) and 2 (Simple & Predictable) for ${input.ticker}. ` +
    `Use web search to ground claims about the business in current information. Return your output ` +
    `via the emit_output tool with a sections array containing both Section 1 and Section 2.\n\n` +
    `## DataPacket\n\n\`\`\`json\n${JSON.stringify(input.dataPacket, null, 2)}\n\`\`\`\n\n` +
    `## PSR Findings\n\n` +
    `### Annual Reader\n\`\`\`json\n${JSON.stringify(input.psrFindings.annual, null, 2)}\n\`\`\`\n\n` +
    `### Quarterly Reader\n\`\`\`json\n${JSON.stringify(input.psrFindings.quarterly, null, 2)}\n\`\`\`\n\n` +
    `## Cross-Cutting Findings From Prior Waves\n\n\`\`\`json\n${JSON.stringify(input.crossCuttingFindings, null, 2)}\n\`\`\`\n`;

  const progress = new ProgressPublisher(input.runId, 'business-analyst-pitchdeck');
  await progress.setStatus('running', {
    displayName: 'Business Analyst',
    wave: 1,
    startedAt: new Date().toISOString(),
  });

  try {
    const { data, modelUsed, tokenCost } = await callAgentWithStructuredOutput({
      systemPrompt,
      userMessage,
      schema: MultiSectionSchema,
      schemaName: 'BusinessAnalystPDSections',
      schemaDescription: 'Emit Sections 1 and 2 as { sections: ReportSection[] }.',
      model: MODEL,
      maxTokens: 12000,
      traceName: 'pitchdeck.business-analyst',
      traceMetadata: { ticker: input.ticker, runId: input.runId, wave: 1 },
      traceId: input.traceId,
      maxResearchTurns: 5,
      maxWebSearches: 5,
      progress,
    });

    await progress.setStatus('completed', { finishedAt: new Date().toISOString() });
    return { sections: data.sections.map((s) => ({ ...s, modelUsed, tokenCost })) };
  } catch (err) {
    await progress.setStatus('failed', {
      finishedAt: new Date().toISOString(),
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
