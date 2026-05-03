import { inngest } from '../client.js';
import { runOnePagerAgent } from '../../agents/one-pager.js';
import { OnePagerOutputSchema } from '../../agents/schemas/one-pager.js';
import { postCallback } from '../../lib/worker-callback.js';
import { ProgressPublisher } from '../../lib/worker-progress.js';
import { flushLangfuse } from '../../lib/langfuse-client.js';

export const onePagerFn = inngest.createFunction(
  {
    id: 'one-pager',
    retries: 3,
    // 15-minute hard ceiling — One Pager normally takes 4-5 min. If exceeded, fail fast.
    timeouts: { finish: '15m' },
    onFailure: async ({ event, error }) => {
      // Always inform the Worker of terminal failure so the run isn't stuck "running" forever.
      const runId = (event as any).data?.event?.data?.runId;
      if (runId) {
        await postCallback({
          runId,
          status: 'failed',
          error: error.message,
        });
      }
    },
  },
  { event: 'thes1s/onepager.start' },
  async ({ event, step }) => {
    const { runId, ticker } = event.data;
    // Use the Inngest event id as a stable Langfuse trace id so step replays
    // dedupe into a single trace instead of producing N copies.
    const traceId = event.id ?? runId;

    // Run-level publisher — used for setPhase only. Synthetic __run__ agentId
    // never appears in v3_run_agents (that table holds per-agent rows; the
    // run-level publisher only writes to v3_runs via the phase-update kind).
    const runPub = new ProgressPublisher(runId, '__run__');

    // Cost protection: Inngest doesn't support per-step retry overrides. The
    // companion fix is in anthropic-client.ts which wraps 4xx errors as
    // NonRetriableError so consistent failures stop after the first attempt
    // instead of burning tokens on 4 attempts. Transient 5xx still gets the
    // function-level retries: 3.
    const output = await step.run('run-one-pager-agent', async () => {
      // Per-agent state (running → completed) is published from inside the runner (Task 17).
      // The runner also publishes phase=researching at start.
      return runOnePagerAgent({ ticker, runId, traceId });
    });

    await step.run('validate-output', async () => {
      await runPub.setPhase('validating', 'Validating the output schema');
      const parsed = OnePagerOutputSchema.safeParse(output);
      if (!parsed.success) {
        throw new Error(`Schema validation failed at gate: ${parsed.error.message}`);
      }
    });

    await step.run('post-callback', async () => {
      await runPub.setPhase('finalizing', 'Saving the report');
      await postCallback({ runId, status: 'completed', result: output });
      await runPub.setPhase('completed', 'Completed');
    });

    await flushLangfuse();
    return { runId, ticker, sections: output.sections.length };
  }
);
