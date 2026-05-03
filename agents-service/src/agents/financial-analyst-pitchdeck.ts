import {
  MultiSectionSchema,
  type MultiSection,
  type ReportSection,
  type CrossCuttingFinding,
} from './schemas/report-section.js';
import { loadAgentPrompt } from './prompts.js';
import { callAgentWithStructuredOutput } from '../lib/anthropic-client.js';
import { ProgressPublisher } from '../lib/worker-progress.js';

export interface FinancialAnalystPDInput {
  ticker: string;
  runId: string;
  traceId?: string;
  dataPacket: unknown;
  psrFindings: { annual: ReportSection; quarterly: ReportSection };
  crossCuttingFindings: CrossCuttingFinding[];
}

const MODEL = 'claude-sonnet-4-6';

export async function runFinancialAnalystPitchDeck(input: FinancialAnalystPDInput): Promise<MultiSection> {
  const systemPrompt = await loadAgentPrompt('financial-analyst-pitchdeck');

  const userMessage =
    `Produce Pitch Deck Sections 5 (Free Cash Flow), 7 (ROE/ROIC/ROA & Debt), and 8 (Strong Balance ` +
    `Sheet) for ${input.ticker}. Use web search where analyst estimates or peer benchmarking matter. ` +
    `Return your output via emit_output as { sections: ReportSection[] } with all 3 sections.\n\n` +
    `## DataPacket\n\n\`\`\`json\n${JSON.stringify(input.dataPacket, null, 2)}\n\`\`\`\n\n` +
    `## PSR Findings\n\n` +
    `### Annual Reader\n\`\`\`json\n${JSON.stringify(input.psrFindings.annual, null, 2)}\n\`\`\`\n\n` +
    `### Quarterly Reader\n\`\`\`json\n${JSON.stringify(input.psrFindings.quarterly, null, 2)}\n\`\`\`\n\n` +
    `## Cross-Cutting Findings From Prior Waves\n\n\`\`\`json\n${JSON.stringify(input.crossCuttingFindings, null, 2)}\n\`\`\`\n`;

  const progress = new ProgressPublisher(input.runId, 'financial-analyst-pitchdeck');
  await progress.setStatus('running', {
    displayName: 'Financial Analyst',
    wave: 2,
    startedAt: new Date().toISOString(),
  });

  try {
    const output = await callAgentWithStructuredOutput({
      systemPrompt,
      userMessage,
      schema: MultiSectionSchema,
      schemaName: 'FinancialAnalystPDSections',
      schemaDescription: 'Emit Sections 5, 7, and 8 as { sections: ReportSection[] }.',
      model: MODEL,
      maxTokens: 16000,
      traceName: 'pitchdeck.financial-analyst',
      traceMetadata: { ticker: input.ticker, runId: input.runId, wave: 2 },
      traceId: input.traceId,
      maxResearchTurns: 3,
      maxWebSearches: 3,
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
