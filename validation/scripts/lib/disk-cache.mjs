/**
 * disk-cache.mjs — Shared disk cache utilities for data collectors
 *
 * Provides read/write/expiry check for JSON files on disk.
 * Each cached file stores { _cachedAt: ISO string, data: <payload> }.
 * Default TTL is 7 days.
 */

import fs from 'fs';
import path from 'path';

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Read a cached JSON file from disk.
 *
 * @param {string} dir - Directory containing cache files
 * @param {string} key - Cache key (filename without .json)
 * @returns {object|null} Parsed { _cachedAt, data } or null if missing
 */
export function readCache(dir, key) {
  const filePath = path.join(dir, `${key}.json`);
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Write data to disk cache with _cachedAt timestamp.
 * Creates the directory tree if it doesn't exist.
 *
 * @param {string} dir - Directory to write cache file into
 * @param {string} key - Cache key (filename without .json)
 * @param {*} data - Payload to cache
 */
export function writeCache(dir, key, data) {
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${key}.json`);
  const wrapper = {
    _cachedAt: new Date().toISOString(),
    data,
  };
  fs.writeFileSync(filePath, JSON.stringify(wrapper, null, 2));
}

/**
 * Check whether a cached entry is expired.
 *
 * @param {object|null} cached - Cached wrapper { _cachedAt, data } or null
 * @param {number} [ttlMs=7 days] - Time-to-live in milliseconds
 * @returns {boolean} true if expired or invalid, false if still fresh
 */
export function isExpired(cached, ttlMs = DEFAULT_TTL_MS) {
  if (!cached || !cached._cachedAt) return true;
  const age = Date.now() - new Date(cached._cachedAt).getTime();
  return age > ttlMs;
}
