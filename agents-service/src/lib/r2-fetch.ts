import { loadEnv } from './env.js';

export type AssemblyKey = 'datapacket' | 'filings' | 'parent-report';

/**
 * Fetch a v3 assembly artifact (DataPacket / filings / parent PD report) from R2
 * via the Worker proxy. Avoids coupling Fly to Cloudflare R2 credentials.
 */
export async function fetchAssembly<T = unknown>(runId: string, key: AssemblyKey): Promise<T> {
  const env = loadEnv();
  const url = `${env.WORKER_CALLBACK_URL}/api/v3/pipeline/assembly/${runId}/${key}.json`;
  const res = await fetch(url, {
    headers: { 'X-Callback-Secret': env.WORKER_CALLBACK_SECRET },
  });
  if (!res.ok) {
    throw new Error(`R2 fetch ${key} for run ${runId} failed: HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}
