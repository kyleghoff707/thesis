// IndexedDB persistence layer for large cache entries
// Follows the same pattern as priceStore.js — lazy singleton DB, memory cache, idb package
// Used by cache.js to store EDGAR facts, financial statements, guru data, and N-PORT data
// Falls back gracefully in Node.js (validation scripts) where IndexedDB doesn't exist

import { openDB } from 'idb';

const DB_NAME = 'thes1s-cache';
const DB_VERSION = 3;
const STORES = ['edgar-facts', 'edgar-statements', 'guru-data', 'nport-data', 'filing-markdown', 'insider-data'];

let dbPromise = null;

// Feature detection — IndexedDB not available in Node.js
const HAS_IDB = typeof indexedDB !== 'undefined';

function getDB() {
  if (!dbPromise) {
    if (!HAS_IDB) return Promise.resolve(null);
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        for (const store of STORES) {
          if (!db.objectStoreNames.contains(store)) {
            db.createObjectStore(store, { keyPath: 'key' });
          }
        }
      },
    }).catch(err => {
      console.warn('IndexedDB cache init failed:', err.message);
      dbPromise = null;
      return null;
    });
  }
  return dbPromise;
}

// Get a single record. Returns data if valid (not expired), null otherwise.
export async function idbGet(store, key) {
  const db = await getDB();
  if (!db) return null;
  try {
    const record = await db.get(store, key);
    if (!record) return null;
    if (Date.now() >= record.expiresAt) {
      // Expired — clean up async
      db.delete(store, key).catch(() => {});
      return null;
    }
    return record.data;
  } catch {
    return null;
  }
}

// Store a record with TTL and fetchedAt timestamp
export async function idbSet(store, key, data, ttl) {
  const db = await getDB();
  if (!db) return;
  try {
    await db.put(store, {
      key,
      data,
      expiresAt: Date.now() + ttl,
      fetchedAt: Date.now(),
    });
  } catch (err) {
    console.warn('IndexedDB cache write failed:', err.message);
  }
}

// Get just the metadata (fetchedAt, expiresAt) without deserializing the full data blob
export async function idbGetMeta(store, key) {
  const db = await getDB();
  if (!db) return null;
  try {
    const record = await db.get(store, key);
    if (!record) return null;
    return { fetchedAt: record.fetchedAt, expiresAt: record.expiresAt };
  } catch {
    return null;
  }
}

// Bulk-get multiple keys from a single store. Returns array of { key, data } for valid entries.
export async function idbBulkGet(store, keys) {
  const db = await getDB();
  if (!db) return [];
  try {
    const tx = db.transaction(store, 'readonly');
    const s = tx.objectStore(store);
    const results = [];
    const now = Date.now();
    for (const key of keys) {
      const record = await s.get(key);
      if (record && now < record.expiresAt) {
        results.push({ key: record.key, data: record.data, fetchedAt: record.fetchedAt });
      }
    }
    return results;
  } catch {
    return [];
  }
}

// Clear entries matching a key prefix from a store
export async function idbClear(store, prefix) {
  const db = await getDB();
  if (!db) return;
  try {
    const tx = db.transaction(store, 'readwrite');
    const s = tx.objectStore(store);
    let cursor = await s.openCursor();
    while (cursor) {
      if (!prefix || cursor.key.startsWith(prefix)) {
        await cursor.delete();
      }
      cursor = await cursor.continue();
    }
  } catch {
    // Ignore clear errors
  }
}
