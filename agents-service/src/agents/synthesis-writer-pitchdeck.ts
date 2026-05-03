import {
  ReportSectionSchema,
  type ReportSection,
  type CrossCuttingFinding,
} from './schemas/report-section.js';
import { loadAgentPrompt } from './prompts.js';
import { callAgentWithStructuredOutput } from '../lib/anthropic-client.js';
import { ProgressPublisher } from '../lib/worker-progress.js';

export interface SynthesisWriterPDInput {
  ticker: string;
  runId: string;
  traceId?: string;
  /** All 10 prior section outputs in order: 1,2,3,4,5,6,7,8,9,10. */
  priorSections: ReportSection[];
  crossCuttingFindings: CrossCuttingFinding[];
}

const MODEL = 'claude-sonnet-4-6';

export async function runSynthesisWriterPitchDeck(input: SynthesisWriterPDInput): Promise<ReportSection> {
  const systemPrompt = await loadAgentPrompt('synthesis-writer-pitchdeck');

  const sectionsBlock = input.priorSections
    .map(s => `### Section ${s.sectionNumber} — ${s.title}\n\`\`\`json\n${JSON.stringify(s, null, 2)}\n\`\`\``)
    .join('\n\n');

  const userMessage =
    `Synthesize the Pitch Deck verdict for ${input.ticker} from the 10 section outputs below. Produce ` +
    `Section 11 (Overall Verdict: PASS / FAIL / WATCHLIST). Return via emit_output as a single ` +
    `ReportSection. No web search — synthesis only.\n\n` +
    `## Prior Section Outputs (Sections 1–10)\n\n${sectionsBlock}\n\n` +
    `## Cross-Cutting Findings (cumulative)\n\n\`\`\`json\n${JSON.stringify(input.crossCuttingFindings, null, 2)}\n\`\`\`\n`;

  const progress = new ProgressPublisher(input.runId, 'synthesis-writer-pitchdeck');
  await progress.setStatus('running', {
    displayName: 'Synthesis Writer',
    wave: 4,
    startedAt: new Date().toISOString(),
  });

  try {
    const output = await callAgentWithStructuredOutput({
      systemPrompt,
      userMessage,
      schema: ReportSectionSchema,
      schemaName: 'OverallVerdictSection',
      schemaDescription: 'Emit Section 11 (Overall Verdict) as a ReportSection.',
      model: MODEL,
      maxTokens: 8000,
      traceName: 'pitchdeck.synthesis-writer',
      traceMetadata: { ticker: input.ticker, runId: input.runId, wave: 4 },
      traceId: input.traceId,
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
    throw err;
  }
}
