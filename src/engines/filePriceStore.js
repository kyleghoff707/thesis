// File-based price storage for Node.js — replaces IndexedDB priceStore.js
// Stores price data as JSON files in .thes1s/cache/prices/ directory.
// Same interface as priceStore.js (getStoredPrices, storePrices) so it
// can be used as a drop-in replacement when IndexedDB is unavailable.

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const PRICES_DIR = join(process.cwd(), '.thes1s', 'cache', 'prices');

function ensureDir() {
  mkdirSync(PRICES_DIR, { recursive: true });
}

function pricePath(ticker) {
  return join(PRICES_DIR, `${ticker.toUpperCase()}.json`);
}

/**
 * Get stored price record for a ticker.
 * Returns the same shape as priceStore.js: { ticker, prices, firstDate, lastDate, lastFetchedAt, rowCount }
 * Returns null if no stored data exists.
 * @param {string} ticker
 * @returns {object|null}
 */
export async function getStoredPrices(ticker) {
  const path = pricePath(ticker);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Store prices for a ticker (full replace).
 * Writes the same record shape as priceStore.js.
 * @param {string} ticker
 * @param {Array} prices - Array of { date, close, ... } objects
 * @returns {object} The stored record
 */
export async function storePrices(ticker, prices) {
  ensureDir();
  const t = ticker.toUpperCase();
  const record = {
    ticker: t,
    prices,
    firstDate: prices[0]?.date || null,
    lastDate: prices[prices.length - 1]?.date || null,
    lastFetchedAt: Date.now(),
    rowCount: prices.length,
  };
  writeFileSync(pricePath(t), JSON.stringify(record));
  return record;
}
