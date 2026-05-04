import {
  ReportSectionSchema,
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

interface SectionSpec {
  number: number;
  key: string;
  title: string;
  description: string;
}

const SECTIONS: SectionSpec[] = [
  {
    number: 5,
    key: 'fcf',
    title: 'Free Cash Flow Generative',
    description:
      'Is the business generating durable free cash flow? Look at FCF history, FCF/Revenue ratio, FCF per share, and capex sustainability.',
  },
  {
    number: 7,
    key: 'roe_roic_debt',
    title: 'ROE / ROIC / ROA & Debt',
    description:
      'Return metrics + debt sustainability. ROE, ROIC, ROA targets per Rule One; net-debt-to-earnings and net-debt-to-FCF ratios.',
  },
  {
    number: 8,
    key: 'balance_sheet',
    title: 'Strong Balance Sheet',
    description:
      'Liquidity, working capital, and structural balance sheet health. Cash position, current ratio, debt schedule, off-balance-sheet items.',
  },
];

/**
 * Financial Analyst — produces Pitch Deck Sections 5, 7, 8 via THREE
 * sequential single-section calls. Single ReportSectionSchema per call is
 * a shape the model reliably produces; MultiSectionSchema confused the
 * model into emitting bare arrays. Sections are merged into a MultiSection
 * before returning so the Inngest function's wave-2 step.run output shape
 * is unchanged.
 */
export async function runFinancialAnalystPitchDeck(input: FinancialAnalystPDInput): Promise<MultiSection> {
  const systemPrompt = await loadAgentPrompt('financial-analyst-pitchdeck');

  const baseContext =
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
    const sections: ReportSection[] = [];
    for (const spec of SECTIONS) {
      const userMessage =
        `Produce Pitch Deck Section ${spec.number} (${spec.title}) for ${input.ticker} ONLY. ` +
        `Do not produce any other sections in this call — Section ${spec.number} is your sole task. ` +
        `Use web search where analyst estimates or peer benchmarking matter. Return your output via ` +
        `the emit_output tool as a single ReportSection JSON object with key="${spec.key}", ` +
        `title="${spec.title}", and sectionNumber=${spec.number}.\n\n` +
        `Section focus: ${spec.description}\n\n` +
        baseContext;

      const { data, modelUsed, tokenCost } = await callAgentWithStructuredOutput({
        systemPrompt,
        userMessage,
        schema: ReportSectionSchema,
        schemaName: `FinancialAnalystPDSection${spec.number}`,
        schemaDescription: `Emit Section ${spec.number} (${spec.title}) as a ReportSection.`,
        model: MODEL,
        maxTokens: 16000,
        traceName: `pitchdeck.financial-analyst.section-${spec.number}`,
        traceMetadata: {
          ticker: input.ticker,
          runId: input.runId,
          wave: 2,
          section: spec.number,
        },
        traceId: input.traceId,
        maxResearchTurns: 2,
        maxWebSearches: 2,
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
