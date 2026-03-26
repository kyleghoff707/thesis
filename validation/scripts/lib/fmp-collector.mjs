/**
 * fmp-collector.mjs — FMP (Financial Modeling Prep) data collector
 *
 * Fetches annual income statement, balance sheet, and cash flow from FMP Stable API,
 * normalizes to canonical format using field-mapping.json _sources.fmp, and caches to disk.
 */

import fs from 'fs';
import { readCache, writeCache, isExpired } from './disk-cache.mjs';

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Map FMP statement type to canonical statement key
const STMT_TYPE_MAP = {
  'income-statement': 'income',
  'balance-sheet-statement': 'balance',
  'cash-flow-statement': 'cashFlow',
};

/**
 * Fetch AAPL-style financial data from FMP and normalize to canonical format.
 *
 * @param {string} ticker - Stock ticker symbol
 * @param {object} options
 * @param {string} options.apiKey - FMP API key
 * @param {string} options.cacheDir - Directory for disk cache
 * @param {number} [options.cacheTtlMs] - Cache TTL in ms (default 7 days)
 * @param {string} options.fieldMappingPath - Path to field-mapping.json
 * @returns {Promise<{income: object, balance: object, cashFlow: object}|null>}
 */
export async function fetchFmpData(ticker, options) {
  const { apiKey, cacheDir, cacheTtlMs = DEFAULT_TTL_MS, fieldMappingPath } = options;

  // Check disk cache
  const cacheKey = `${ticker}-fmp`;
  const cached = readCache(cacheDir, cacheKey);
  if (cached && !isExpired(cached, cacheTtlMs)) {
    return cached.data;
  }

  // Load field mapping
  const fieldMapping = JSON.parse(fs.readFileSync(fieldMappingPath, 'utf-8'));
  const fmpMap = fieldMapping._sources.fmp;

  // Build per-statement field maps
  const stmtFieldMaps = { income: {}, balance: {}, cashFlow: {} };
  for (const [fmpField, mapping] of Object.entries(fmpMap)) {
    const stmtKey = mapping.statement;
    if (stmtFieldMaps[stmtKey]) {
      stmtFieldMaps[stmtKey][fmpField] = mapping;
    }
  }

  try {
    const baseUrl = 'https://financialmodelingprep.com/stable';
    const endpoints = [
      { url: `${baseUrl}/income-statement?symbol=${ticker}&period=annual&apikey=${apiKey}`, type: 'income-statement' },
      { url: `${baseUrl}/balance-sheet-statement?symbol=${ticker}&period=annual&apikey=${apiKey}`, type: 'balance-sheet-statement' },
      { url: `${baseUrl}/cash-flow-statement?symbol=${ticker}&period=annual&apikey=${apiKey}`, type: 'cash-flow-statement' },
    ];

    const responses = await Promise.all(
      endpoints.map(async ({ url, type }) => {
        const res = await fetch(url);
        if (!res.ok) return { type, data: null };
        const data = await res.json();
        return { type, data };
      })
    );

    // Check for failures
    if (responses.some(r => r.data === null)) {
      return null;
    }

    const result = { income: {}, balance: {}, cashFlow: {} };

    for (const { type, data } of responses) {
      const stmtKey = STMT_TYPE_MAP[type];
      const fieldMap = stmtFieldMaps[stmtKey];

      for (const row of data) {
        const year = String(row.fiscalYear);
        if (!result[stmtKey][year]) {
          result[stmtKey][year] = {};
        }

        for (const [fmpField, mapping] of Object.entries(fieldMap)) {
          const val = row[fmpField];
          if (val != null) {
            result[stmtKey][year][mapping.canonical] = mapping.sign * val;
          }
        }
      }
    }

    // Cache result
    writeCache(cacheDir, cacheKey, result);

    return result;
  } catch (err) {
    console.warn(`FMP fetch failed for ${ticker}:`, err.message);
    return null;
  }
}
