import { inngest } from '../client.js';
import { fetchAssembly } from '../../lib/r2-fetch.js';
import { aggregateFindings } from '../../lib/findings-aggregator.js';
import { ProgressPublisher } from '../../lib/worker-progress.js';
import { postCallback } from '../../lib/worker-callback.js';
import { flushLangfuse } from '../../lib/langfuse-client.js';
import type { CrossCuttingFinding, ReportSection } from '../../agents/schemas/report-section.js';

import { runAnnualReader } from '../../agents/annual-reader.js';
import { runQuarterlyReader } from '../../agents/quarterly-reader.js';
import { runBusinessAnalystPitchDeck } from '../../agents/business-analyst-pitchdeck.js';
import { runCompetitorMarketPositionPitchDeck } from '../../agents/competitor-evaluator-market-position-pitchdeck.js';
import { runCompetitorMoatsPitchDeck } from '../../agents/competitor-evaluator-moats-pitchdeck.js';
import { runFinancialAnalystPitchDeck } from '../../agents/financial-analyst-pitchdeck.js';
import { runManagementEvaluatorPitchDeck } from '../../agents/management-evaluator-pitchdeck.js';
import { runRiskAnalystPitchDeck } from '../../agents/risk-analyst-pitchdeck.js';
import { runValuationSpecialistPitchDeck } from '../../agents/valuation-specialist-pitchdeck.js';
import { runSynthesisWriterPitchDeck } from '../../agents/synthesis-writer-pitchdeck.js';

interface FilingAssembly {
  filingContent: Record<string, unknown>;
  transcriptContent: Record<string, unknown>;
  errors?: unknown[];
  stats?: unknown;
}

export const pitchDeckFn = inngest.createFunction(
  {
    id: 'pitch-deck',
    retries: 3,
    timeouts: { finish: '60m' },
    onFailure: async ({ event, error }) => {
      const runId = (event as any).data?.event?.data?.runId;
      if (runId) {
        await postCallback({ runId, status: 'failed', error: error.message });
      }
    },
  },
  { event: 'thes1s/pitchdeck.start' },
  async ({ event, step }) => {
    const { runId, ticker } = event.data;
    const traceId = event.id ?? runId;
    const runPub = new ProgressPublisher(runId, '__run__');

    // Fetch pre-assembled inputs from R2 OUTSIDE step.run. The DataPacket +
    // filings serialize to multiple MB and would blow past Inngest's per-request
    // body size limit if persisted as step state. Inngest replays the function
    // body between steps, so this fetch re-runs on each replay — that's fine
    // because R2 GETs are idempotent and fast (~1–2s combined).
    await runPub.setPhase('fetching-inputs', 'Loading DataPacket and filings');
    const [dataPacket, filing] = await Promise.all([
      fetchAssembly<unknown>(runId, 'datapacket'),
      fetchAssembly<FilingAssembly>(runId, 'filings'),
    ]);

    // ─── Wave 0 — PSR (parallel) ─────────────────────────────────────────
    await runPub.setPhase('wave-0-psr', 'Wave 0: Reading filings and transcripts');
    const [annualOut, quarterlyOut] = await Promise.all([
      step.run('wave-0-annual-reader', () =>
        runAnnualReader({
          ticker, runId, traceId,
          dataPacket,
          filingContent: pickByForm(filing.filingContent, '10-K'),
        })),
      step.run('wave-0-quarterly-reader', () =>
        runQuarterlyReader({
          ticker, runId, traceId,
          dataPacket,
          filingContent: pickByForm(filing.filingContent, '10-Q'),
          transcriptContent: filing.transcriptContent,
        })),
    ]);

    let findings: CrossCuttingFinding[] = aggregateFindings([], [annualOut, quarterlyOut]);
    const psrFindings = { annual: annualOut, quarterly: quarterlyOut };

    // ─── Wave 1 — Business Context (parallel) ─────────────────────────────
    await runPub.setPhase('wave-1-context', 'Wave 1: Business context');
    const [baOut, cmpOut] = await Promise.all([
      step.run('wave-1-business-analyst', () =>
        runBusinessAnalystPitchDeck({
          ticker, runId, traceId, dataPacket, psrFindings, crossCuttingFindings: findings,
        })),
      step.run('wave-1-competitor-market-position', () =>
        runCompetitorMarketPositionPitchDeck({
          ticker, runId, traceId, dataPacket, psrFindings, crossCuttingFindings: findings,
        })),
    ]);

    const sec1 = baOut.sections.find((s: ReportSection) => s.sectionNumber === 1)!;
    const sec2 = baOut.sections.find((s: ReportSection) => s.sectionNumber === 2)!;
    const sec3 = cmpOut;
    findings = aggregateFindings(findings, [sec1, sec2, sec3]);

    // ─── Wave 2 — Deep Analysis (parallel) ────────────────────────────────
    await runPub.setPhase('wave-2-deep-analysis', 'Wave 2: Deep analysis');
    const [moatsOut, faOut, mgmtOut] = await Promise.all([
      step.run('wave-2-competitor-moats', () =>
        runCompetitorMoatsPitchDeck({
          ticker, runId, traceId, dataPacket, psrFindings,
          section3: sec3, crossCuttingFindings: findings,
        })),
      step.run('wave-2-financial-analyst', () =>
        runFinancialAnalystPitchDeck({
          ticker, runId, traceId, dataPacket, psrFindings, crossCuttingFindings: findings,
        })),
      step.run('wave-2-management-evaluator', () =>
        runManagementEvaluatorPitchDeck({
          ticker, runId, traceId, dataPacket, psrFindings, crossCuttingFindings: findings,
        })),
    ]);

    const sec4 = moatsOut;
    const sec5 = faOut.sections.find((s: ReportSection) => s.sectionNumber === 5)!;
    const sec7 = faOut.sections.find((s: ReportSection) => s.sectionNumber === 7)!;
    const sec8 = faOut.sections.find((s: ReportSection) => s.sectionNumber === 8)!;
    const sec6 = mgmtOut;
    findings = aggregateFindings(findings, [sec4, sec5, sec6, sec7, sec8]);

    // ─── Wave 3 — Risk & Valuation (parallel) ─────────────────────────────
    await runPub.setPhase('wave-3-risk-valuation', 'Wave 3: Risk & Valuation');
    const [riskOut, valOut] = await Promise.all([
      step.run('wave-3-risk-analyst', () =>
        runRiskAnalystPitchDeck({
          ticker, runId, traceId, dataPacket, psrFindings, crossCuttingFindings: findings,
        })),
      step.run('wave-3-valuation-specialist', () =>
        runValuationSpecialistPitchDeck({
          ticker, runId, traceId, dataPacket, psrFindings,
          section3: sec3, section4: sec4, crossCuttingFindings: findings,
        })),
    ]);

    const sec9 = riskOut;
    const sec10 = valOut;
    findings = aggregateFindings(findings, [sec9, sec10]);

    // ─── Wave 4 — Synthesis ───────────────────────────────────────────────
    await runPub.setPhase('wave-4-synthesis', 'Wave 4: Final verdict');
    const sec11 = await step.run('wave-4-synthesis-writer', () =>
      runSynthesisWriterPitchDeck({
        ticker, runId, traceId,
        priorSections: [sec1, sec2, sec3, sec4, sec5, sec6, sec7, sec8, sec9, sec10],
        crossCuttingFindings: findings,
      }));

    // ─── Final assembly + callback ────────────────────────────────────────
    const finalReport = {
      ticker,
      pipelineStage: 'pitch-deck' as const,
      generatedAt: new Date().toISOString(),
      sections: [sec1, sec2, sec3, sec4, sec5, sec6, sec7, sec8, sec9, sec10, sec11],
      overallVerdict: sec11.verdict,
    };

    await step.run('post-callback', async () => {
      await runPub.setPhase('finalizing', 'Saving the report');
      await postCallback({ runId, status: 'completed', result: finalReport });
      await runPub.setPhase('completed', 'Completed');
    });

    await flushLangfuse();
    return { runId, ticker, sections: finalReport.sections.length };
  }
);

/** Filter the assembled filing content by form type (10-K vs 10-Q). */
function pickByForm(all: Record<string, unknown>, form: '10-K' | '10-Q'): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(all)) {
    if (key.startsWith(`${form}-`)) out[key] = value;
  }
  return out;
}
