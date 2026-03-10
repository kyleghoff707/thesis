// Persistent local price database using IndexedDB
// Stores full price history per ticker. Works in both browser dev and Tauri production.
// First lookup fetches entire history from Yahoo, subsequent lookups are local with
// incremental updates for new trading days.

import { openDB } from 'idb';

const DB_NAME = 'thes1s-prices';
const DB_VERSION = 1;
const STORE_NAME = 'prices';

// Session-level memory cache — avoids async IndexedDB reads on range switches
const memCache = new Map();

let dbPromise = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'ticker' });
        }
      },
    });
  }
  return dbPromise;
}

// Get stored record for a ticker (prices array + metadata)
// Returns null if ticker has never been fetched
export async function getStoredPrices(ticker) {
  const t = ticker.toUpperCase();

  // Check memory cache first
  const mem = memCache.get(t);
  if (mem) return mem;

  const db = await getDB();
  const record = await db.get(STORE_NAME, t);
  if (record) {
    memCache.set(t, record);
  }
  return record || null;
}

// Store prices for a ticker (full replace)
// record: { ticker, prices: [...], firstDate, lastDate, lastFetchedAt }
export async function storePrices(ticker, prices) {
  const t = ticker.toUpperCase();
  const record = {
    ticker: t,
    prices,
    firstDate: prices[0]?.date || null,
    lastDate: prices[prices.length - 1]?.date || null,
    lastFetchedAt: Date.now(),
    rowCount: prices.length,
  };

  const db = await getDB();
  await db.put(STORE_NAME, record);
  memCache.set(t, record);
  return record;
}

// Append new price rows to existing stored data
// Assumes newPrices are chronologically after existing data (no overlap)
export async function appendPrices(ticker, newPrices) {
  const t = ticker.toUpperCase();
  const existing = await getStoredPrices(t);

  if (!existing) {
    return storePrices(t, newPrices);
  }

  // Dedupe: drop any new rows that overlap with existing dates
  const lastExisting = existing.lastDate;
  const fresh = newPrices.filter(p => p.date > lastExisting);

  if (fresh.length === 0) {
    // Just update the fetch timestamp
    existing.lastFetchedAt = Date.now();
    const db = await getDB();
    await db.put(STORE_NAME, existing);
    memCache.set(t, existing);
    return existing;
  }

  const merged = [...existing.prices, ...fresh];
  return storePrices(t, merged);
}

// Filter stored prices by date range
export function filterByRange(prices, range) {
  if (!prices || prices.length === 0) return [];
  if (range === 'max') return prices;

  const years = { '1y': 1, '3y': 3, '5y': 5, '10y': 10, '20y': 20 };
  const y = years[range];
  if (!y) return prices;

  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - y);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  return prices.filter(p => p.date >= cutoffStr);
}

// Check if stored data is stale (needs incremental update)
// Stale = lastFetchedAt > 1 hour ago AND lastDate < today
export function isStale(record) {
  if (!record) return true;

  const oneHour = 60 * 60 * 1000;
  if (Date.now() - record.lastFetchedAt < oneHour) return false;

  const today = new Date().toISOString().slice(0, 10);
  return record.lastDate < today;
}
