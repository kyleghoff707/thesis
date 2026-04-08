#!/usr/bin/env node
/**
 * triangulate.mjs — Main entry point for 50-company multi-source triangulation
 *
 * Orchestrates the full pipeline: fetch our XBRL engine data + FMP + SimFin + mstarpy,
 * classify every field/year deviation, auto-tag root causes, and produce fix-recommendations.json
 * and triangulation-report.json for Phase 3 triage.
 *
 * Usage:
 *   node validation/scripts/triangulate.mjs                        # full 50-company run
 *   node validation/scripts/triangulate.mjs --ticker AAPL           # single ticker
 *   node validation/scripts/triangulate.mjs --ticker AAPL,MSFT,LULU # multiple tickers
 *
 * Requires bundled engine: auto-builds if missing via `node validation/scripts/bundle.mjs`.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const FIXTURES_DIR = path.resolve(ROOT, 'src/engines/__tests__/fixtures/morningstar');
const EDGAR_CACHE_DIR = path.resolve(FIXTURES_DIR, 'edgar-cache');
const BUNDLE_PATH = path.resolve(__dirname, 'bundled-engines.mjs');
const REPORTS_DIR = path.resolve(ROOT, 'validation/reports');
const FIELD_MAPPING_PATH = path.resolve(FIXTURES_DIR, 'field-mapping.json');
const FMP_CACHE = path.resolve(ROOT, 'validation/cache/fmp');
const SIMFIN_CACHE = path.resolve(ROOT, 'validation/cache/simfin');
const MSTARPY_DATA = path.resolve(ROOT, 'validation/data/mstarpy');

// ─── Load .env.local for API Keys ───────────────────────────

const envPath = path.resolve(ROOT, '.env.local');
let FMP_KEY = '';
let SIMFIN_KEY = '';

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  const fmpMatch = envContent.match(/^VITE_FMP_KEY\s*=\s*(.+)$/m);
  const simfinMatch = envContent.match(/^VITE_SIMFIN_KEY\s*=\s*(.+)$/m);
  if (fmpMatch) FMP_KEY = fmpMatch[1].trim();
  if (simfinMatch) SIMFIN_KEY = simfinMatch[1].trim();
}

if (!FMP_KEY) {
  process.stderr.write('WARNING: VITE_FMP_KEY not found in .env.local. FMP data will be skipped.\n');
}
if (!SIMFIN_KEY) {
  process.stderr.write('WARNING: VITE_SIMFIN_KEY not found in .env.local. SimFin data will be skipped.\n');
}

// ─── Browser Polyfills ──────────────────────────────────────

globalThis.localStorage = {
  _data: {},
  getItem(key) { return this._data[key] ?? null; },
  setItem(key, val) { this._data[key] = String(val); },
  removeItem(key) { delete this._data[key]; },
  get length() { return Object.keys(this._data).length; },
  key(i) { return Object.keys(this._data)[i] ?? null; },
};

// ─── SEC Fetch Interceptor ──────────────────────────────────
// Rewrite Vite dev proxy URLs to direct SEC URLs.
// Disk cache in edgar-cache/ for speed.

const SEC_HEADERS = {
  'User-Agent': 'StockAnalyzer/1.0 kylehoff@example.com',
  'Accept-Encoding': 'identity',
};

let requestCount = 0;
let cacheHits = 0;
let lastRequestTime = 0;

const originalFetch = globalThis.fetch;

globalThis.fetch = async function interceptedFetch(url, opts = {}) {
  let resolved = typeof url === 'string' ? url : url.toString();

  // Rewrite Vite dev proxy URLs to direct SEC URLs
  if (resolved.startsWith('/api/edgar/')) {
    resolved = 'https://data.sec.gov/' + resolved.slice('/api/edgar/'.length);
  } else if (resolved.startsWith('/api/sec/')) {
    resolved = 'https://www.sec.gov/' + resolved.slice('/api/sec/'.length);
  }

  // Only intercept SEC requests
  if (!resolved.includes('sec.gov') && !resolved.includes('data.sec.gov')) {
    return originalFetch(url, opts);
  }

  // Check disk cache
  const cacheKey = resolved.replace(/[^a-zA-Z0-9.-]/g, '_').slice(0, 200);
  const cachePath = path.join(EDGAR_CACHE_DIR, cacheKey + '.json');

  if (fs.existsSync(cachePath)) {
    cacheHits++;
    const data = fs.readFileSync(cachePath, 'utf-8');
    return new Response(data, {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }

  // Rate limit: 100ms between SEC requests (10 req/sec)
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < 100) {
    await new Promise(r => setTimeout(r, 100 - elapsed));
  }
  lastRequestTime = Date.now();
  requestCount++;

  // Fetch from SEC with proper headers
  const resp = await originalFetch(resolved, {
    ...opts,
    headers: { ...SEC_HEADERS, ...opts.headers },
  });

  if (resp.ok) {
    const text = await resp.text();
    fs.mkdirSync(EDGAR_CACHE_DIR, { recursive: true });
    fs.writeFileSync(cachePath, text);
    return new Response(text, {
      status: resp.status,
      headers: { 'content-type': 'application/json' },
    });
  }

  return resp;
};

// ─── Pre-flight Checks ─────────────────────────────────────

// Auto-build engine bundle if missing
if (!fs.existsSync(BUNDLE_PATH)) {
  process.stderr.write('Engine bundle not found. Building...\n');
  execSync('node validation/scripts/bundle.mjs', { cwd: ROOT, stdio: 'inherit' });
  if (!fs.existsSync(BUNDLE_PATH)) {
    process.stderr.write('ERROR: Failed to build engine bundle.\n');
    process.exit(1);
  }
  process.stderr.write('Engine bundle built successfully.\n');
}

// ─── Load Dependencies ─────────────────────────────────────

import { fetchFmpData } from './lib/fmp-collector.mjs';
import { fetchSimfinData } from './lib/simfin-collector.mjs';
import { readMstarpyData } from './lib/mstarpy-collector.mjs';
import { classifyField } from './lib/consensus.mjs';
import { tagRootCause } from './lib/root-cause-tagger.mjs';
import { resolveFieldName, resolveCanonicalName } from './lib/field-alias-map.mjs';
import {
  generateTriangulationConsoleReport,
  generateFixRecommendations,
  generateRegressionDiff,
} from './lib/triangulation-reporter.mjs';

const { fetchEdgarStatements } = await import(BUNDLE_PATH);

// ─── Load Field Mapping ────────────────────────────────────

const fieldMapping = JSON.parse(fs.readFileSync(FIELD_MAPPING_PATH, 'utf-8'));

const STMT_KEY_NORMALIZE = {
  income: 'income',
  balance: 'balance',
  cashFlow: 'cashFlow',
  balance_sheet: 'balance',
  cash_flow: 'cashFlow',
  PL: 'income',
  BS: 'balance',
  CF: 'cashFlow',
};

function buildFieldStatementMap(fm) {
  const map = {};

  // From FMP _sources
  if (fm._sources?.fmp) {
    for (const mapping of Object.values(fm._sources.fmp)) {
      const stmt = STMT_KEY_NORMALIZE[mapping.statement] || mapping.statement;
      if (!map[mapping.canonical]) map[mapping.canonical] = stmt;
    }
  }

  // From SimFin _sources (all templates)
  if (fm._sources?.simfin) {
    for (const templateMap of Object.values(fm._sources.simfin)) {
      for (const mapping of Object.values(templateMap)) {
        const stmt = STMT_KEY_NORMALIZE[mapping.statement] || mapping.statement;
        if (!map[mapping.canonical]) map[mapping.canonical] = stmt;
      }
    }
  }

  // From mstarpy _sources
  if (fm._sources?.mstarpy) {
    for (const mapping of Object.values(fm._sources.mstarpy)) {
      const stmt = STMT_KEY_NORMALIZE[mapping.statement] || mapping.statement;
      if (!map[mapping.canonical]) map[mapping.canonical] = stmt;
    }
  }

  // From main MS field entries (income, balance_sheet, cash_flow)
  for (const [stmtKey, stmtFields] of Object.entries(fm)) {
    if (stmtKey.startsWith('_')) continue;
    if (typeof stmtFields !== 'object') continue;
    const normalized = STMT_KEY_NORMALIZE[stmtKey] || stmtKey;
    for (const entry of Object.values(stmtFields)) {
      if (entry.thesisField && !map[entry.thesisField]) {
        map[entry.thesisField] = normalized;
      }
    }
  }

  return map;
}

// Build canonical field -> statement map from all _sources
const FIELD_STATEMENT_MAP = buildFieldStatementMap(fieldMapping);

// ─── Parse CLI Args ────────────────────────────────────────

const args = process.argv.slice(2);
const tickerIdx = args.indexOf('--ticker');
let requestedTickers = null;
if (tickerIdx !== -1 && args[tickerIdx + 1]) {
  requestedTickers = args[tickerIdx + 1].split(',').map(t => t.toUpperCase());
}

// ─── Get Ticker List ───────────────────────────────────────

function getFixtureTickers() {
  return fs.readdirSync(FIXTURES_DIR)
    .filter(f => f.endsWith('.json') && f !== 'field-mapping.json')
    .map(f => f.replace('.json', ''))
    .sort();
}

const allFixtureTickers = getFixtureTickers();
const tickers = requestedTickers
  ? requestedTickers.filter(t => allFixtureTickers.includes(t))
  : allFixtureTickers;

// Warn about tickers not found in fixtures
if (requestedTickers) {
  for (const t of requestedTickers) {
    if (!allFixtureTickers.includes(t)) {
      process.stderr.write(`WARNING: No fixture found for ${t}, skipping.\n`);
    }
  }
}

// ─── Helper Functions ──────────────────────────────────────

/**
 * Collect union of all year keys across engine data and all sources.
 */
function collectAllYears(engineData, sources) {
  const years = new Set();

  function addYears(data) {
    if (!data) return;
    for (const stmtKey of ['income', 'balance', 'cashFlow']) {
      if (data[stmtKey]) {
        for (const year of Object.keys(data[stmtKey])) {
          years.add(year);
        }
      }
    }
  }

  addYears(engineData);
  for (const s of sources) {
    addYears(s.data);
  }

  return [...years].sort();
}

/**
 * Collect union of all canonical field names from BOTH the XBRL engine and all external sources.
 * Including engine fields is required so that fields we extract but external sources don't have
 * are classified as UNIQUE_COVERAGE (D-06) rather than silently omitted.
 *
 * Engine fields are mapped to canonical names via resolveCanonicalName so that
 * the union contains canonical names only (e.g., engine's 'equity' -> 'stockholders_equity').
 * Source fields are already canonical.
 */
function collectAllFields(engineData, sources) {
  const fields = new Set();

  // Add engine fields, resolving engine names -> canonical names
  if (engineData) {
    for (const stmtKey of ['income', 'balance', 'cashFlow']) {
      if (engineData[stmtKey]) {
        for (const yearData of Object.values(engineData[stmtKey])) {
          for (const field of Object.keys(yearData)) {
            fields.add(resolveCanonicalName(field));
          }
        }
      }
    }
  }

  // Add source fields (already canonical)
  for (const s of sources) {
    if (!s.data) continue;
    for (const stmtKey of ['income', 'balance', 'cashFlow']) {
      if (s.data[stmtKey]) {
        for (const yearData of Object.values(s.data[stmtKey])) {
          for (const field of Object.keys(yearData)) {
            fields.add(field);
          }
        }
      }
    }
  }

  return [...fields].sort();
}

/**
 * Get a field value from canonical data structure.
 * Walks income[year][field], balance[year][field], cashFlow[year][field].
 * Returns first non-null value found.
 */
function getFieldValue(data, field, year) {
  if (!data) return null;
  for (const stmtKey of ['income', 'balance', 'cashFlow']) {
    const val = data[stmtKey]?.[year]?.[field];
    if (val != null) return val;
  }
  return null;
}

/**
 * Get a field value from ENGINE data, resolving canonical -> engine field names.
 * The engine uses short names (equity, assets, cash) while sources use canonical
 * names (stockholders_equity, total_assets, cash_and_equivalents).
 * This wrapper resolves the alias before looking up the value.
 */
function getEngineFieldValue(engineData, canonicalField, year) {
  const engineField = resolveFieldName(canonicalField);
  return getFieldValue(engineData, engineField, year);
}

/**
 * Look up which statement section a field belongs to.
 * Uses pre-built FIELD_STATEMENT_MAP from field-mapping.json _sources entries.
 * Falls back to engine field name via alias resolution.
 */
function getFieldStatement(field) {
  return FIELD_STATEMENT_MAP[field] || FIELD_STATEMENT_MAP[resolveFieldName(field)] || 'unknown';
}

/**
 * Get consensus value for a given field+year across all sources.
 * Collects non-null values and returns the median of the largest agreeing group.
 * Used for fy_offset detection context.
 */
function getConsensusForYear(sources, field, year) {
  const values = [];
  for (const s of sources) {
    const val = getFieldValue(s.data, field, year);
    if (val != null) values.push(val);
  }
  if (values.length === 0) return null;
  // Return median of all values (simple approach for context)
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

// ─── Sleep helper ──────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Main Pipeline ─────────────────────────────────────────

process.stderr.write(`\nTriangulating ${tickers.length} companies (FMP + SimFin + mstarpy vs XBRL engine)...\n\n`);

const allCompanyResults = [];
let engineErrors = 0;

for (let i = 0; i < tickers.length; i++) {
  const ticker = tickers[i];

  // Clear localStorage between tickers
  globalThis.localStorage._data = {};

  process.stderr.write(`${ticker.padEnd(8)} [${i + 1}/${tickers.length}]  `);

  try {
    // Fetch our XBRL engine data
    const engineData = await fetchEdgarStatements(ticker, { version: 'restated' });

    if (!engineData) {
      process.stderr.write('ENGINE_ERROR (no data)\n');
      engineErrors++;
      await sleep(300);
      continue;
    }

    // Fetch external source data (parallel where possible)
    const [fmpData, simfinData] = await Promise.all([
      FMP_KEY
        ? fetchFmpData(ticker, { apiKey: FMP_KEY, cacheDir: FMP_CACHE, fieldMappingPath: FIELD_MAPPING_PATH })
        : Promise.resolve(null),
      SIMFIN_KEY
        ? fetchSimfinData(ticker, { apiKey: SIMFIN_KEY, cacheDir: SIMFIN_CACHE, fieldMappingPath: FIELD_MAPPING_PATH })
        : Promise.resolve(null),
    ]);
    const mstarpyData = await readMstarpyData(ticker, { dataDir: MSTARPY_DATA, fieldMappingPath: FIELD_MAPPING_PATH });

    // Build source array
    const sources = [
      fmpData && { name: 'fmp', data: fmpData },
      simfinData && { name: 'simfin', data: simfinData },
      mstarpyData && { name: 'mstarpy', data: mstarpyData },
    ].filter(Boolean);

    const sourceNames = sources.map(s => s.name).join('+') || 'none';

    // For each field/year, classify
    const classifications = [];
    const allYears = collectAllYears(engineData, sources);
    const allFields = collectAllFields(engineData, sources);

    for (const year of allYears) {
      for (const field of allFields) {
        const thesisValue = getEngineFieldValue(engineData, field, year);
        const sourceValues = sources.map(s => ({
          source: s.name,
          value: getFieldValue(s.data, field, year),
        }));

        const result = classifyField(thesisValue, sourceValues);

        // Root cause tagging for CONSENSUS_DIFF and LIKELY_BUG
        let rootCause = null;
        if (result.classification === 'CONSENSUS_DIFF' || result.classification === 'LIKELY_BUG') {
          const yearContext = {
            prevYearConsensus: getConsensusForYear(sources, field, String(parseInt(year) - 1)),
            nextYearConsensus: getConsensusForYear(sources, field, String(parseInt(year) + 1)),
          };
          rootCause = tagRootCause(thesisValue, result.consensusValue, yearContext);
        }

        classifications.push({
          field,
          year,
          statement: getFieldStatement(field),
          classification: result.classification,
          rootCause,
          thesisValue,
          consensusValue: result.consensusValue,
          sources: Object.fromEntries(sourceValues.map(s => [s.source, s.value])),
        });
      }
    }

    // ─── Post-classification reclassifications ─────────────
    // PP&E + ROU reclassification: Our engine includes operating lease ROU assets
    // in PP&E (matching Morningstar). SimFin and mstarpy exclude ROU. FMP includes it.
    // When our value matches FMP but disagrees with SimFin/mstarpy, it's a
    // methodology split, not our bug.
    const METHODOLOGY_OVERRIDE_FIELDS = new Set(['property_plant_equipment']);
    for (const c of classifications) {
      if (!METHODOLOGY_OVERRIDE_FIELDS.has(c.field)) continue;
      if (c.classification !== 'CONSENSUS_DIFF' && c.classification !== 'LIKELY_BUG') continue;

      // Check if FMP agrees with our engine value (within 1%)
      const fmpValue = c.sources?.fmp;
      if (fmpValue != null && c.thesisValue != null && c.thesisValue !== 0) {
        const pctDiff = Math.abs((c.thesisValue - fmpValue) / c.thesisValue);
        if (pctDiff <= 0.01) {
          c.classification = 'METHODOLOGY_DIFF';
          c.rootCause = 'rou_inclusion_methodology_split';
        }
      }
    }

    allCompanyResults.push({ ticker, classifications });

    const matchCount = classifications.filter(c => c.classification === 'MATCH').length;
    const totalCount = classifications.length;
    const diffCount = classifications.filter(c => c.classification === 'CONSENSUS_DIFF' || c.classification === 'LIKELY_BUG').length;
    process.stderr.write(`${matchCount}/${totalCount} match  ${diffCount} diff  [${sourceNames}]\n`);

    // Rate limiting between tickers
    await sleep(100);
  } catch (err) {
    process.stderr.write(`ERROR: ${err.message}\n`);
    engineErrors++;
    await sleep(300);
  }
}

// ─── Generate Reports ──────────────────────────────────────

// Console report
const consoleReport = generateTriangulationConsoleReport(allCompanyResults);

// Fix recommendations
const fixRecs = generateFixRecommendations(allCompanyResults);

// Regression diff against Morningstar baseline
const baselinePath = path.resolve(REPORTS_DIR, 'morningstar-accuracy.json');
if (fs.existsSync(baselinePath)) {
  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf-8'));
  fixRecs.regressionDiff = generateRegressionDiff(fixRecs, baseline);
} else {
  process.stderr.write('WARNING: morningstar-accuracy.json not found. Skipping regression diff.\n');
}

// Write JSON outputs
fs.mkdirSync(REPORTS_DIR, { recursive: true });

fs.writeFileSync(
  path.resolve(REPORTS_DIR, 'fix-recommendations.json'),
  JSON.stringify(fixRecs, null, 2)
);

fs.writeFileSync(
  path.resolve(REPORTS_DIR, 'triangulation-report.json'),
  JSON.stringify({ generatedAt: new Date().toISOString(), companies: allCompanyResults }, null, 2)
);

// Print console report to stdout
console.log(consoleReport);

process.stderr.write(`\nTriangulation complete. ${allCompanyResults.length} companies processed.\n`);
process.stderr.write(`EDGAR API: ${requestCount} live requests, ${cacheHits} cache hits\n`);
process.stderr.write(`Reports written to:\n`);
process.stderr.write(`  ${path.resolve(REPORTS_DIR, 'fix-recommendations.json')}\n`);
process.stderr.write(`  ${path.resolve(REPORTS_DIR, 'triangulation-report.json')}\n`);

if (engineErrors > 0) {
  process.stderr.write(`WARNING: ${engineErrors} ticker(s) produced errors.\n`);
}

process.exit(engineErrors > 0 ? 1 : 0);
