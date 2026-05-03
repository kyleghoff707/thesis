import {
  ReportSectionSchema,
  type ReportSection,
  type CrossCuttingFinding,
} from './schemas/report-section.js';
import { loadAgentPrompt } from './prompts.js';
import { callAgentWithStructuredOutput } from '../lib/anthropic-client.js';
import { ProgressPublisher } from '../lib/worker-progress.js';

export interface ValuationSpecialistPDInput {
  ticker: string;
  runId: string;
  traceId?: string;
  dataPacket: unknown;
  psrFindings: { annual: ReportSection; quarterly: ReportSection };
  section3: ReportSection;
  section4: ReportSection;
  crossCuttingFindings: CrossCuttingFinding[];
}

const MODEL = 'claude-sonnet-4-6';

export async function runValuationSpecialistPitchDeck(input: ValuationSpecialistPDInput): Promise<ReportSection> {
  const systemPrompt = await loadAgentPrompt('valuation-specialist-pitchdeck');

  const userMessage =
    `Produce Pitch Deck Section 10 (Valuation) for ${input.ticker}. Use Section 3's market share ceiling ` +
    `and Section 4's CAP (competitive advantage period) to constrain growth assumptions. Apply MOS, PBT, ` +
    `Ten Cap, and Equity Bond methods. Use web search for analyst estimates and FGR triangulation. ` +
    `Return as a single ReportSection.\n\n` +
    `## DataPacket\n\n\`\`\`json\n${JSON.stringify(input.dataPacket, null, 2)}\n\`\`\`\n\n` +
    `## PSR Findings\n\n` +
    `### Annual Reader\n\`\`\`json\n${JSON.stringify(input.psrFindings.annual, null, 2)}\n\`\`\`\n\n` +
    `### Quarterly Reader\n\`\`\`json\n${JSON.stringify(input.psrFindings.quarterly, null, 2)}\n\`\`\`\n\n` +
    `## Section 3 (Market Position)\n\n\`\`\`json\n${JSON.stringify(input.section3, null, 2)}\n\`\`\`\n\n` +
    `## Section 4 (Moats)\n\n\`\`\`json\n${JSON.stringify(input.section4, null, 2)}\n\`\`\`\n\n` +
    `## Cross-Cutting Findings From Prior Waves\n\n\`\`\`json\n${JSON.stringify(input.crossCuttingFindings, null, 2)}\n\`\`\`\n`;

  const progress = new ProgressPublisher(input.runId, 'valuation-specialist-pitchdeck');
  await progress.setStatus('running', {
    displayName: 'Valuation Specialist',
    wave: 3,
    startedAt: new Date().toISOString(),
  });

  try {
    const { data, modelUsed, tokenCost } = await callAgentWithStructuredOutput({
      systemPrompt,
      userMessage,
      schema: ReportSectionSchema,
      schemaName: 'ValuationSpecialistPDSection',
      schemaDescription: 'Emit Section 10 (Valuation) as a ReportSection.',
      model: MODEL,
      maxTokens: 16000,
      traceName: 'pitchdeck.valuation-specialist',
      traceMetadata: { ticker: input.ticker, runId: input.runId, wave: 3 },
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
