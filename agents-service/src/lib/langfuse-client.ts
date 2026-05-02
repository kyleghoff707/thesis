import { Langfuse } from 'langfuse';
import { loadEnv } from './env.js';

let cached: Langfuse | null = null;

export function getLangfuse(): Langfuse {
  if (cached) return cached;
  const env = loadEnv();
  cached = new Langfuse({
    publicKey: env.LANGFUSE_PUBLIC_KEY,
    secretKey: env.LANGFUSE_SECRET_KEY,
    baseUrl: env.LANGFUSE_HOST,
    flushAt: 1,
    flushInterval: 1000,
  });
  return cached;
}

export async function flushLangfuse(): Promise<void> {
  if (cached) await cached.flushAsync();
}
