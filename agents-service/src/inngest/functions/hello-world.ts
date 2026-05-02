import { inngest } from '../client.js';
import { getLangfuse, flushLangfuse } from '../../lib/langfuse-client.js';

export const helloWorld = inngest.createFunction(
  { id: 'hello-world' },
  { event: 'thes1s/hello.world' },
  async ({ event, step }) => {
    const langfuse = getLangfuse();
    const trace = langfuse.trace({
      name: 'hello-world',
      metadata: { eventId: event.id, runId: event.data.message },
    });

    const greeting = await step.run('compose-greeting', async () => {
      const span = trace.span({ name: 'compose-greeting' });
      const result = `Hello, ${event.data.message}!`;
      span.end({ output: { result } });
      return result;
    });

    const wait = await step.run('compute-wait-ms', async () => {
      const span = trace.span({ name: 'compute-wait-ms' });
      const result = 100;
      span.end({ output: { result } });
      return result;
    });

    await flushLangfuse();
    return { greeting, waitedMs: wait };
  }
);
