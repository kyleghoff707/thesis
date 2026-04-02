#!/usr/bin/env node
// Normalize existing pipeline output for schema consistency
// Usage: node scripts/normalize-reports.js
// One-time migration — safe to re-run (idempotent)

import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'fs';
import { join } from 'path';

// Canonical section fields (19 fields) — must match run-pipeline.js
const CANONICAL_SECTION_FIELDS = {
  key: null,
  title: null,
  sectionNumber: null,
  status: 'complete',
  confidence: null,
  verdict: null,
  verdictRationale: null,
  summary: null,
  data: {},
  narrative: null,
  citations: [],
  tables: [],
  charts: [],
  redFlags: [],
  primarySourceInsights: [],
  crossCuttingFindings: [],
  searchesPerformed: [],
  modelUsed: null,
  tokenCost: null,
};

// Canonical Pitch Deck section keys (for stale data detection)
const CANONICAL_PD_KEYS = [
  'radar',
  'simple_and_predictable',
  'market_position',
  'barriers_and_moats',
  'fcf',
  'management',
  'balance_sheet',
  'pest_risks',
  'valuation_summary',
  'overall_verdict',
];

// Normalize a section object: fill missing fields with defaults, remove unexpected fields
function normalizeSection(section) {
  if (!section) return null;
  const normalized = {};
  for (const [field, defaultVal] of Object.entries(CANONICAL_SECTION_FIELDS)) {
    normalized[field] = section[field] !== undefined ? section[field] : defaultVal;
  }
  return normalized;
}

// Normalize all sections in a report
function normalizeSections(sections) {
  if (!Array.isArray(sections)) return [];
  return sections.map(normalizeSection).filter(Boolean);
}

// Check if pipeline-output.json has canonical PD section keys
// Per D-07: check specifically for 'radar' or 'simple_and_predictable' —
// these are distinctive to the canonical format and absent in stale data
function hasCanonicalPDKeys(sections) {
  if (!Array.isArray(sections) || sections.length === 0) return false;
  const keys = sections.map(s => s.key).filter(Boolean);
  return keys.includes('radar') || keys.includes('simple_and_predictable');
}

// Main
const reportsDir = join(process.cwd(), '.thes1s', 'reports');

if (!existsSync(reportsDir)) {
  console.log('No .thes1s/reports/ directory found. Nothing to normalize.');
  process.exit(0);
}

const tickers = readdirSync(reportsDir).filter(name => {
  const fullPath = join(reportsDir, name);
  return statSync(fullPath).isDirectory();
});

if (tickers.length === 0) {
  console.log('No ticker directories found in .thes1s/reports/. Nothing to normalize.');
  process.exit(0);
}

console.log(`\nNormalizing pipeline output for ${tickers.length} tickers...\n`);

const results = [];

for (const ticker of tickers) {
  const tickerDir = join(reportsDir, ticker);
  const tickerResult = { ticker, actions: [] };

  // --- one-pager.json ---
  const opPath = join(tickerDir, 'one-pager.json');
  if (existsSync(opPath)) {
    try {
      const data = JSON.parse(readFileSync(opPath, 'utf-8'));

      if (Array.isArray(data.sections)) {
        // Has sections array — normalize each section
        data.sections = normalizeSections(data.sections);
        writeFileSync(opPath, JSON.stringify(data, null, 2));
        tickerResult.actions.push(`one-pager.json: normalized ${data.sections.length} sections`);
      } else {
        // Legacy format (e.g., SFM) — wrap in canonical structure
        const wrapped = {
          ticker: data.ticker || ticker,
          companyName: data.companyName || null,
          stage: 'onePager',
          generatedAt: null,
          sections: [], // No sections available in legacy format
          overallVerdict: data.overallVerdict || null,
          sectionKeys: [],
          _legacyFormat: true, // Flag for components to handle gracefully
        };
        writeFileSync(opPath, JSON.stringify(wrapped, null, 2));
        tickerResult.actions.push(`one-pager.json: wrapped legacy format (_legacyFormat=true)`);
      }
    } catch (err) {
      tickerResult.actions.push(`one-pager.json: ERROR - ${err.message}`);
    }
  }

  // --- pitch-deck.json ---
  const pdPath = join(tickerDir, 'pitch-deck.json');
  const poPath = join(tickerDir, 'pipeline-output.json');

  if (existsSync(pdPath)) {
    // pitch-deck.json already exists — normalize sections
    try {
      const data = JSON.parse(readFileSync(pdPath, 'utf-8'));
      if (Array.isArray(data.sections)) {
        data.sections = normalizeSections(data.sections);
        writeFileSync(pdPath, JSON.stringify(data, null, 2));
        tickerResult.actions.push(`pitch-deck.json: normalized ${data.sections.length} sections`);
      } else {
        tickerResult.actions.push(`pitch-deck.json: no sections array, skipped`);
      }
    } catch (err) {
      tickerResult.actions.push(`pitch-deck.json: ERROR - ${err.message}`);
    }
  } else if (existsSync(poPath)) {
    // No pitch-deck.json — check if pipeline-output.json is a PD stage with canonical keys
    try {
      const data = JSON.parse(readFileSync(poPath, 'utf-8'));
      if (data.stage === 'pitchDeck') {
        if (hasCanonicalPDKeys(data.sections)) {
          // Canonical keys present — create pitch-deck.json
          const pdData = {
            ticker: data.ticker || ticker,
            stage: 'pitchDeck',
            completedAt: data.completedAt || null,
            pipelineTimeSeconds: data.pipelineTimeSeconds || null,
            sectionCount: data.sections?.length || 0,
            errorCount: data.errors?.length || 0,
            sections: normalizeSections(data.sections),
            budget: data.budget || null,
            cacheStats: data.cacheStats || null,
            errors: data.errors || [],
          };
          writeFileSync(pdPath, JSON.stringify(pdData, null, 2));
          tickerResult.actions.push(`pitch-deck.json: CREATED from pipeline-output.json (${pdData.sections.length} sections)`);
        } else {
          // Stale non-canonical keys — skip
          const keys = (data.sections || []).map(s => s.key).filter(Boolean).slice(0, 5);
          console.warn(`SKIP ${ticker}: pipeline-output.json has stale non-canonical section keys — re-run pipeline to generate canonical pitch-deck.json`);
          console.warn(`  Found keys: ${keys.join(', ')}...`);
          tickerResult.actions.push(`pitch-deck.json: SKIPPED (stale non-canonical keys in pipeline-output.json)`);
        }
      } else {
        tickerResult.actions.push(`pitch-deck.json: no PD-stage pipeline-output.json`);
      }
    } catch (err) {
      tickerResult.actions.push(`pitch-deck.json: ERROR - ${err.message}`);
    }
  }

  // --- full-story-api.json ---
  const fsPath = join(tickerDir, 'full-story-api.json');
  if (existsSync(fsPath)) {
    try {
      const data = JSON.parse(readFileSync(fsPath, 'utf-8'));
      if (Array.isArray(data.sections)) {
        data.sections = normalizeSections(data.sections);
        writeFileSync(fsPath, JSON.stringify(data, null, 2));
        tickerResult.actions.push(`full-story-api.json: normalized ${data.sections.length} sections`);
      } else {
        tickerResult.actions.push(`full-story-api.json: no sections array, skipped`);
      }
    } catch (err) {
      tickerResult.actions.push(`full-story-api.json: ERROR - ${err.message}`);
    }
  }

  results.push(tickerResult);
}

// Print summary table
console.log('\n' + '='.repeat(60));
console.log('  Normalization Summary');
console.log('='.repeat(60) + '\n');

for (const r of results) {
  console.log(`${r.ticker}:`);
  if (r.actions.length === 0) {
    console.log('  (no report files found)');
  } else {
    for (const action of r.actions) {
      console.log(`  ${action}`);
    }
  }
  console.log('');
}

console.log('Done. All reports normalized.\n');
