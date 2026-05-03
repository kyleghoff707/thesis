// R2 cache for v3 pipeline pre-assembly.
// Keyed by runId so each run has isolated DataPacket + filing content.
// Reads happen from Fly via the Worker proxy route in pipeline-v3.js (Task 15).

const KEY_PREFIX = 'assembly';

export function dataPacketKey(runId) {
  return `${KEY_PREFIX}/${runId}/datapacket.json`;
}

export function filingsKey(runId) {
  return `${KEY_PREFIX}/${runId}/filings.json`;
}

export function parentReportKey(runId) {
  return `${KEY_PREFIX}/${runId}/parent-report.json`;
}

export async function writeAssembly(env, key, data) {
  if (!env?.TRANSCRIPTS) throw new Error('TRANSCRIPTS R2 binding missing');
  const body = typeof data === 'string' ? data : JSON.stringify(data);
  await env.TRANSCRIPTS.put(key, body, {
    httpMetadata: { contentType: 'application/json' },
  });
}

export async function readAssembly(env, key) {
  if (!env?.TRANSCRIPTS) throw new Error('TRANSCRIPTS R2 binding missing');
  const obj = await env.TRANSCRIPTS.get(key);
  if (!obj) return null;
  return JSON.parse(await obj.text());
}

/** Returns the R2 object stream (for proxying to Fly without parsing). */
export async function readAssemblyRaw(env, key) {
  if (!env?.TRANSCRIPTS) throw new Error('TRANSCRIPTS R2 binding missing');
  return env.TRANSCRIPTS.get(key);
}
