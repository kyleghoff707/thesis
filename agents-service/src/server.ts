import Fastify, { FastifyInstance } from 'fastify';
import inngestFastify from 'inngest/fastify';
import { inngest } from './inngest/client.js';
import { functions } from './inngest/functions/index.js';

export async function buildServer(): Promise<FastifyInstance> {
  const server = Fastify({
    logger: {
      level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    },
  });

  server.get('/health', async () => ({ status: 'ok' }));

  // Inngest serves at /api/inngest (Inngest Cloud calls this URL)
  await server.register(inngestFastify, {
    client: inngest,
    functions: functions as never,
  });

  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 3000);
  const server = await buildServer();
  try {
    await server.listen({ port, host: '0.0.0.0' });
    console.log(`agents-service listening on :${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}
