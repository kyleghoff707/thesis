// Throwaway worker. Spawned by scripts/dump-r2-transcripts.mjs via
// `wrangler dev --remote`. Streams every object in the TRANSCRIPTS R2
// bucket as NDJSON so the dump script can write each transcript to disk
// without ever holding the full ~72 MB snapshot in memory.

const KEY_RE = /^transcripts\/([A-Z.]+)\/(\d{4})\/Q(\d)\.json$/;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return new Response('ok', { status: 200 });
    }

    if (url.pathname !== '/dump') {
      return new Response('not found', { status: 404 });
    }

    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    (async () => {
      try {
        let cursor;
        let total = 0;
        do {
          const page = await env.TRANSCRIPTS.list({ cursor, limit: 1000 });
          for (const o of page.objects) {
            const m = o.key.match(KEY_RE);
            if (!m) continue;
            const [, ticker, year, quarter] = m;
            const obj = await env.TRANSCRIPTS.get(o.key);
            if (!obj) continue;
            const stored = await obj.json();
            const line = JSON.stringify({
              ticker,
              year: +year,
              quarter: +quarter,
              size: o.size,
              uploaded: o.uploaded,
              text: stored.text,
              meta: stored.meta,
            }) + '\n';
            await writer.write(encoder.encode(line));
            total++;
          }
          cursor = page.truncated ? page.cursor : undefined;
        } while (cursor);
        await writer.write(encoder.encode(JSON.stringify({ _done: true, total }) + '\n'));
      } catch (err) {
        await writer.write(encoder.encode(JSON.stringify({ _error: err.message }) + '\n'));
      } finally {
        await writer.close();
      }
    })();

    return new Response(readable, {
      status: 200,
      headers: { 'Content-Type': 'application/x-ndjson' },
    });
  },
};
