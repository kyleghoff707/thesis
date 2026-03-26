/**
 * mstarpy-collector.mjs — Morningstar (mstarpy) data reader
 *
 * Reads pre-fetched mstarpy JSON files from disk, walks the nested subLevel tree,
 * applies scale multiplier (1e6 for "Million"), and normalizes to canonical format.
 *
 * Does NOT call any API — mstarpy data must be pre-fetched by fetch-mstarpy.py.
 */

import fs from 'fs';

// Per-share and share-count fields that should NOT be multiplied by the scale factor
const PER_SHARE_FIELDS = new Set([
  'diluted_eps',
  'basic_eps',
  'diluted_shares_outstanding',
  'basic_shares_outstanding',
  'dividends_per_share',
]);

// Map mstarpy statement keys in the JSON file to canonical statement keys
const MSTARPY_STMT_MAP = {
  income: 'income',
  balance: 'balance',
  cashFlow: 'cashFlow',
};

/**
 * Recursively flatten the nested subLevel tree into a flat map of { label: datum[] }.
 *
 * @param {Array} rows - Array of { label, datum?, subLevel? } objects
 * @returns {Map<string, number[]>} Map of label -> datum array
 */
function flattenRows(rows) {
  const flat = new Map();

  function walk(nodes) {
    if (!Array.isArray(nodes)) return;
    for (const node of nodes) {
      if (node.label && node.datum) {
        // If duplicate label, keep the first occurrence
        if (!flat.has(node.label)) {
          flat.set(node.label, node.datum);
        }
      }
      if (node.subLevel) {
        walk(node.subLevel);
      }
    }
  }

  walk(rows);
  return flat;
}

/**
 * Process a single mstarpy statement (income/balance/cashFlow) into canonical format.
 *
 * @param {object} stmtData - Raw mstarpy statement data { columnDefs, rows, footer }
 * @param {object} fieldMap - _sources.mstarpy mapping { label: { canonical, sign, statement } }
 * @param {string} stmtType - 'income', 'balance', or 'cashFlow'
 * @returns {object} Canonical { year: { field: value } }
 */
function processStatement(stmtData, fieldMap, stmtType) {
  if (!stmtData || !stmtData.columnDefs || !stmtData.rows) {
    return {};
  }

  const columnDefs = stmtData.columnDefs;
  const scale = stmtData.footer?.orderOfMagnitude === 'Million' ? 1e6 : 1;

  // Build year indices, excluding TTM
  const yearIndices = [];
  for (let i = 0; i < columnDefs.length; i++) {
    if (columnDefs[i] !== 'TTM') {
      yearIndices.push({ idx: i, year: String(columnDefs[i]) });
    }
  }

  // Flatten nested tree
  const flat = flattenRows(stmtData.rows);

  const result = {};

  for (const [label, mapping] of Object.entries(fieldMap)) {
    // Only process fields for this statement type
    if (mapping.statement !== stmtType) continue;

    const datum = flat.get(label);
    if (!datum) continue;

    for (const { idx, year } of yearIndices) {
      const val = datum[idx];

      // Skip null and _PO_ sentinel values
      if (val == null || val === '_PO_') continue;

      if (!result[year]) result[year] = {};

      const isPerShare = PER_SHARE_FIELDS.has(mapping.canonical);
      const multiplier = isPerShare ? 1 : scale;

      result[year][mapping.canonical] = mapping.sign * val * multiplier;
    }
  }

  return result;
}

/**
 * Read pre-fetched mstarpy data for a ticker and normalize to canonical format.
 *
 * @param {string} ticker - Stock ticker symbol
 * @param {object} options
 * @param {string} options.dataDir - Directory containing pre-fetched mstarpy JSON files
 * @param {string} options.fieldMappingPath - Path to field-mapping.json
 * @returns {Promise<{income: object, balance: object, cashFlow: object}|null>}
 */
export async function readMstarpyData(ticker, options) {
  const { dataDir, fieldMappingPath } = options;

  // Read pre-fetched JSON file
  const filePath = `${dataDir}/${ticker}.json`;
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf-8');
  } catch {
    // File missing — graceful degradation per D-04
    return null;
  }

  const parsed = JSON.parse(raw);

  // Load field mapping
  const fieldMapping = JSON.parse(fs.readFileSync(fieldMappingPath, 'utf-8'));
  const mstarpyMap = fieldMapping._sources.mstarpy;

  const result = { income: {}, balance: {}, cashFlow: {} };

  // Process each statement type
  for (const [jsonKey, canonicalKey] of Object.entries(MSTARPY_STMT_MAP)) {
    const stmtData = parsed[jsonKey];
    if (stmtData) {
      result[canonicalKey] = processStatement(stmtData, mstarpyMap, canonicalKey);
    }
  }

  return result;
}
