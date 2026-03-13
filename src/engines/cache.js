// Three-tier cache: in-memory (fast) + IndexedDB (large data) + localStorage (small data)
// TTL in milliseconds

import { idbGet, idbSet, idbGetMeta, idbBulkGet, idbClear } from './cacheStore.js';

const memoryCache = new Map();

const TTL = {
  financials: 24 * 60 * 60 * 1000,   // 24 hours
  companyDetails: 24 * 60 * 60 * 1000, // 24 hours
  prices: 60 * 60 * 1000,             // 1 hour
  filings: 315_360_000_000,           // 10 years (SEC filings are immutable)
  analyst: 6 * 60 * 60 * 1000,        // 6 hours
};

// --- Key routing: which keys go to IndexedDB vs localStorage ---

const IDB_PREFIXES = [
  'edgar:facts:', 'edgar-statements:', 'edgar-quarterly:',
  'edgar-frames:',
  'guru-filing:', 'guru-activity:', 'guru:', 'guru-portfolio-history:', 'guru-subs:',
  'nport-filing:', 'nport-summary:', 'nport-subs:',
  'filing-md:',
  'insider-form4:',
];

function isIDBKey(key) {
  return IDB_PREFIXES.some(p => key.startsWith(p));
}

function getStoreName(key) {
  if (key.startsWith('edgar:facts:') || key.startsWith('edgar-frames:')) return 'edgar-facts';
  if (key.startsWith('edgar-statements:') || key.startsWith('edgar-quarterly:')) return 'edgar-statements';
  if (key.startsWith('guru-') || key.startsWith('guru:')) return 'guru-data';
  if (key.startsWith('nport-')) return 'nport-data';
  if (key.startsWith('filing-md:')) return 'filing-markdown';
  if (key.startsWith('insider-')) return 'insider-data';
  return null;
}

function lsKey(key) {
  return `sa-cache:${key}`;
}

// --- One-time migration: remove old large entries from localStorage ---

function migrateOnce() {
  if (typeof localStorage === 'undefined') return;
  const MARKER = 'sa-cache-idb-migrated-v1';
  try {
    if (localStorage.getItem(MARKER)) return;
    const toRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('sa-cache:')) {
        const innerKey = k.slice(9); // strip 'sa-cache:'
        if (IDB_PREFIXES.some(p => innerKey.startsWith(p))) {
          toRemove.push(k);
        }
      }
    }
    toRemove.forEach(k => localStorage.removeItem(k));
    localStorage.setItem(MARKER, '1');
    if (toRemove.length > 0) {
      console.log(`Cache migration: moved ${toRemove.length} entries from localStorage to IndexedDB tier`);
    }
  } catch {
    // Ignore migration errors
  }
}
migrateOnce();

// --- Sync cache (memory + localStorage for small keys) ---

export function cacheGet(key) {
  // Memory tier — always checked first
  const mem = memoryCache.get(key);
  if (mem && Date.now() < mem.expiresAt) {
    return mem.data;
  }

  // For IDB keys, memory is the only sync tier — caller must use cacheGetAsync for persistence
  if (isIDBKey(key)) return null;

  // localStorage tier — small keys only
  try {
    const raw = localStorage.getItem(lsKey(key));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Date.now() < parsed.expiresAt) {
        // Promote back to memory
        memoryCache.set(key, parsed);
        return parsed.data;
      }
      // Expired — clean up
      localStorage.removeItem(lsKey(key));
    }
  } catch {
    // Corrupted — ignore
  }

  return null;
}

export function cacheSet(key, data, category = 'financials') {
  const ttl = TTL[category] || TTL.financials;
  const now = Date.now();
  const entry = { data, expiresAt: now + ttl, fetchedAt: now };

  // Always write to memory
  memoryCache.set(key, entry);

  if (isIDBKey(key)) {
    // Fire-and-forget write to IndexedDB
    const store = getStoreName(key);
    if (store) {
      idbSet(store, key, data, ttl).catch(() => {});
    }
  } else {
    // Write to localStorage for small keys
    try {
      localStorage.setItem(lsKey(key), JSON.stringify(entry));
    } catch {
      // localStorage full — memory cache still works
    }
  }
}

// --- Async cache (checks memory then IndexedDB) ---

export async function cacheGetAsync(key) {
  // Memory tier first (sync fast path)
  const mem = memoryCache.get(key);
  if (mem && Date.now() < mem.expiresAt) {
    return mem.data;
  }

  // IndexedDB tier
  if (isIDBKey(key)) {
    const store = getStoreName(key);
    if (store) {
      const data = await idbGet(store, key);
      if (data !== null) {
        // Promote to memory for subsequent sync reads
        const meta = await idbGetMeta(store, key);
        memoryCache.set(key, {
          data,
          expiresAt: meta?.expiresAt || Date.now() + TTL.financials,
          fetchedAt: meta?.fetchedAt || Date.now(),
        });
        return data;
      }
    }
    return null;
  }

  // localStorage tier for small keys
  try {
    const raw = localStorage.getItem(lsKey(key));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Date.now() < parsed.expiresAt) {
        memoryCache.set(key, parsed);
        return parsed.data;
      }
      localStorage.removeItem(lsKey(key));
    }
  } catch {
    // Corrupted — ignore
  }

  return null;
}

// Get metadata (fetchedAt, expiresAt) for "last refreshed" UI
export async function cacheGetMeta(key) {
  // Check memory first
  const mem = memoryCache.get(key);
  if (mem) {
    return { fetchedAt: mem.fetchedAt, expiresAt: mem.expiresAt };
  }

  // Check IDB
  if (isIDBKey(key)) {
    const store = getStoreName(key);
    if (store) {
      return await idbGetMeta(store, key);
    }
  }

  // Check localStorage
  try {
    const raw = localStorage.getItem(lsKey(key));
    if (raw) {
      const parsed = JSON.parse(raw);
      return { fetchedAt: parsed.fetchedAt, expiresAt: parsed.expiresAt };
    }
  } catch {}

  return null;
}

// Bulk-load keys from IndexedDB into memory cache. Returns array of { key, data }.
export async function hydrateFromIDB(store, keys) {
  const results = await idbBulkGet(store, keys);
  // Promote all results to memory
  for (const r of results) {
    memoryCache.set(r.key, {
      data: r.data,
      expiresAt: Date.now() + TTL.financials,
      fetchedAt: r.fetchedAt || Date.now(),
    });
  }
  return results;
}

// --- Clear ---

export function cacheClear(prefix) {
  // Clear memory entries matching prefix
  for (const key of memoryCache.keys()) {
    if (key.startsWith(prefix)) memoryCache.delete(key);
  }

  // Clear localStorage entries matching prefix
  try {
    const toRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(`sa-cache:${prefix}`)) {
        toRemove.push(k);
      }
    }
    toRemove.forEach(k => localStorage.removeItem(k));
  } catch {}

  // Clear IDB entries matching prefix (fire-and-forget)
  if (isIDBKey(prefix)) {
    const store = getStoreName(prefix);
    if (store) {
      idbClear(store, prefix).catch(() => {});
    }
  }
}
