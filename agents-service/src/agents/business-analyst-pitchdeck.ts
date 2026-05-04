import {
  ReportSectionSchema,
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

interface SectionSpec {
  number: number;
  key: string;
  title: string;
  description: string;
}

const SECTIONS: SectionSpec[] = [
  {
    number: 1,
    key: 'radar',
    title: 'Radar',
    description:
      'How the company first showed up — what attracts initial attention (events, guru ownership, sector tailwinds, etc.).',
  },
  {
    number: 2,
    key: 'simple_predictable',
    title: 'Simple & Predictable',
    description:
      'Is this a business model you can understand and that has predictable economics? Apply the "simple and predictable" Rule One test.',
  },
];

/**
 * Business Analyst — produces Pitch Deck Sections 1 + 2 via TWO sequential
 * single-section calls. Each call uses ReportSectionSchema (single shape) —
 * the model reliably produces this; MultiSectionSchema confused the model
 * into emitting flat ReportSection without a wrapper. Sections are merged
 * into a MultiSection before returning so the Inngest function's wave-1
 * step.run output shape is unchanged.
 */
export async function runBusinessAnalystPitchDeck(input: BusinessAnalystPDInput): Promise<MultiSection> {
  const systemPrompt = await loadAgentPrompt('business-analyst-pitchdeck');

  const baseContext =
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
    const sections: ReportSection[] = [];
    for (const spec of SECTIONS) {
      const userMessage =
        `Produce Pitch Deck Section ${spec.number} (${spec.title}) for ${input.ticker} ONLY. ` +
        `Do not produce any other sections in this call — Section ${spec.number} is your sole task. ` +
        `Use web search to ground claims in current information. Return your output via the ` +
        `emit_output tool as a single ReportSection JSON object with key="${spec.key}", ` +
        `title="${spec.title}", and sectionNumber=${spec.number}.\n\n` +
        `Section focus: ${spec.description}\n\n` +
        baseContext;

      const { data, modelUsed, tokenCost } = await callAgentWithStructuredOutput({
        systemPrompt,
        userMessage,
        schema: ReportSectionSchema,
        schemaName: `BusinessAnalystPDSection${spec.number}`,
        schemaDescription: `Emit Section ${spec.number} (${spec.title}) as a ReportSection.`,
        model: MODEL,
        maxTokens: 16000,
        traceName: `pitchdeck.business-analyst.section-${spec.number}`,
        traceMetadata: {
          ticker: input.ticker,
          runId: input.runId,
          wave: 1,
          section: spec.number,
        },
        traceId: input.traceId,
        maxResearchTurns: 3,
        maxWebSearches: 3,
        progress,
      });

      sections.push({ ...data, modelUsed, tokenCost });
    }

    await progress.setStatus('completed', { finishedAt: new Date().toISOString() });
    return { sections };
  } catch (err) {
    await progress.setStatus('failed', {
      finishedAt: new Date().toISOString(),
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
