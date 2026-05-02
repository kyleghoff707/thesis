import { loadEnv } from './env.js';

export type CallbackStatus = 'completed' | 'failed';

export interface CallbackPayload {
  runId: string;
  status: CallbackStatus;
  result?: unknown;
  error?: string;
}

export async function postCallback(payload: CallbackPayload): Promise<void> {
  const env = loadEnv();
  const url = `${env.WORKER_CALLBACK_URL}/api/v3/pipeline/callback`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Callback-Secret': env.WORKER_CALLBACK_SECRET,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Worker callback failed (${res.status}): ${body}`);
  }
}
