import { mkdirSync, readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

import { cacheDir } from '../utils/thesisDir.js';

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

function safeCacheKey(key) {
  return String(key).replace(/[^a-zA-Z0-9._-]/g, '_');
}

function cachePath(key) {
  return join(cacheDir(), 'node-cache', `${safeCacheKey(key)}.json`);
}

export async function cacheGetAsync(key) {
  return cacheGet(key);
}

export function cacheGet(key) {
  const path = cachePath(key);
  if (!existsSync(path)) return null;

  try {
    const entry = JSON.parse(readFileSync(path, 'utf8'));
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      try { unlinkSync(path); } catch {}
      return null;
    }
    return entry.value ?? null;
  } catch {
    return null;
  }
}

export function cacheSet(key, value, category = 'default') {
  const ttlMs = category === 'filings' || category === 'transcript'
    ? 315_360_000_000
    : DEFAULT_TTL_MS;
  const path = cachePath(key);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, JSON.stringify({
    value,
    category,
    cachedAt: new Date().toISOString(),
    expiresAt: Date.now() + ttlMs,
  }, null, 2));
}

export function cacheClear(key) {
  try { unlinkSync(cachePath(key)); } catch {}
}
