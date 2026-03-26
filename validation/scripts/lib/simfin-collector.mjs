/**
 * simfin-collector.mjs — SimFin data collector
 *
 * Fetches annual PL, BS, CF from SimFin v3 compact API,
 * detects template (GENERAL/BANKS/INSURANCE), normalizes to canonical format,
 * and caches to disk.
 */

import fs from 'fs';
import { readCache, writeCache, isExpired } from './disk-cache.mjs';

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Map SimFin statement type to canonical statement key
const SIMFIN_STMT_MAP = {
  PL: 'income',
  BS: 'balance',
  CF: 'cashFlow',
};

/**
 * Sleep for a given number of milliseconds.
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Parse a SimFin compact response into canonical year-keyed data.
 *
 * @param {Array} apiResponse - Raw SimFin API response array
 * @param {object} templateMaps - { GENERAL: {...}, BANKS: {...}, INSURANCE: {...} }
 * @param {string} stmtType - 'PL', 'BS', or 'CF'
 * @returns {{ data: object, template: string }} Canonical { year: { field: value } } and detected template
 */
function parseCompact(apiResponse, templateMaps, stmtType) {
  const company = Array.isArray(apiResponse) ? apiResponse[0] : apiResponse;
  const template = company?.template || 'GENERAL';
  const stmt = company?.statements?.[0];
  if (!stmt) return { data: {}, template };

  const cols = stmt.columns;
  const yearIdx = cols.indexOf('Fiscal Year');
  const stmtKey = SIMFIN_STMT_MAP[stmtType];
  const activeMap = templateMaps[template] || templateMaps.GENERAL;

  const result = {};

  for (const row of stmt.data) {
    const year = String(row[yearIdx]);
    if (!result[year]) result[year] = {};

    // Only map fields whose statement matches this response type
    for (const [simfinField, mapping] of Object.entries(activeMap)) {
      if (mapping.statement !== stmtType) continue;

      const colIdx = cols.indexOf(simfinField);
      if (colIdx === -1) continue;

      const val = row[colIdx];
      if (val != null) {
        result[year][mapping.canonical] = mapping.sign * val;
      }
    }
  }

  return { data: result, template };
}

/**
 * Fetch financial data from SimFin and normalize to canonical format.
 *
 * @param {string} ticker - Stock ticker symbol
 * @param {object} options
 * @param {string} options.apiKey - SimFin API key
 * @param {string} options.cacheDir - Directory for disk cache
 * @param {number} [options.cacheTtlMs] - Cache TTL in ms (default 7 days)
 * @param {string} options.fieldMappingPath - Path to field-mapping.json
 * @returns {Promise<{income: object, balance: object, cashFlow: object}|null>}
 */
export async function fetchSimfinData(ticker, options) {
  const { apiKey, cacheDir, cacheTtlMs = DEFAULT_TTL_MS, fieldMappingPath } = options;

  // Check disk cache
  const cacheKey = `${ticker}-simfin`;
  const cached = readCache(cacheDir, cacheKey);
  if (cached && !isExpired(cached, cacheTtlMs)) {
    return cached.data;
  }

  // Load field mapping
  const fieldMapping = JSON.parse(fs.readFileSync(fieldMappingPath, 'utf-8'));
  const simfinMaps = fieldMapping._sources.simfin;

  const baseUrl = 'https://backend.simfin.com/api/v3';
  const headers = { Authorization: `api-key ${apiKey}` };
  const stmtTypes = ['PL', 'BS', 'CF'];

  try {
    const result = { income: {}, balance: {}, cashFlow: {} };

    // Fetch sequentially (SimFin has 5/sec rate limit)
    for (let i = 0; i < stmtTypes.length; i++) {
      const stmtType = stmtTypes[i];
      const url = `${baseUrl}/companies/statements/compact?ticker=${ticker}&statements=${stmtType}&period=FY`;

      const res = await fetch(url, { headers });
      if (!res.ok) return null;

      const apiResponse = await res.json();
      const { data } = parseCompact(apiResponse, simfinMaps, stmtType);
      const stmtKey = SIMFIN_STMT_MAP[stmtType];

      // Merge year data
      for (const [year, fields] of Object.entries(data)) {
        if (!result[stmtKey][year]) result[stmtKey][year] = {};
        Object.assign(result[stmtKey][year], fields);
      }

      // Sleep 250ms between requests to stay under 5/sec
      if (i < stmtTypes.length - 1) {
        await sleep(250);
      }
    }

    // Cache result
    writeCache(cacheDir, cacheKey, result);

    return result;
  } catch (err) {
    console.warn(`SimFin fetch failed for ${ticker}:`, err.message);
    return null;
  }
}
