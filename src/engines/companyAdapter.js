// Layer 3: Company-Specific XBRL Tag Adapter
//
// When Layers 1 (static tag map) and 2 (taxonomy hierarchy) can't resolve a field,
// Layer 3 fills gaps using:
//   3a: Pre-built S&P 500 tag classifications (static JSON, zero API cost)
//   3b: Runtime Claude API classification (for companies outside the pre-built cache)
//
// Confidence gating: classifications with confidence < 0.8 are marked "inferred"
// in provenance and shown with ⚠️ in the Audit tab.
//
// This module does NOT do extraction — it returns tag SUGGESTIONS that the caller
// (edgarFinancials.js) extracts using the standard extractAnnualFact functions.

import { CLAUDE_KEY } from './config';
import preClassifiedData from '../data/sp500-tag-classifications.json';

const classifications = preClassifiedData?.classifications || {};

// ─── Tag Discovery ──────────────────────────────────────────

/**
 * Collect all XBRL tags used across taxonomy arrays (L1 + L2 augmented).
 * Returns a Set of tag names. Used to identify "orphan" tags in companyfacts.
 */
export function collectKnownTags(...taxonomyArrays) {
  const known = new Set();
  for (const tax of taxonomyArrays) {
    if (!tax) continue;
    for (const fieldDef of tax) {
      if (fieldDef.tags) {
        for (const tag of fieldDef.tags) {
          known.add(tag);
        }
      }
    }
  }
  return known;
}

/**
 * Find us-gaap tags in companyfacts not matched by any taxonomy.
 * Only returns tags that have 10-K entries in financial units (USD, USD/shares, shares).
 *
 * @param {Object} companyFacts - Raw EDGAR companyfacts
 * @param {Set} knownTags - All L1+L2 tags from collectKnownTags()
 * @returns {Object} { tagName: { units: string[], entryCount: number } }
 */
export function findOrphanTags(companyFacts, knownTags) {
  const usGaap = companyFacts?.facts?.['us-gaap'];
  if (!usGaap) return {};

  const FINANCIAL_UNITS = new Set(['USD', 'USD/shares', 'shares']);
  const orphans = {};

  for (const [tag, tagData] of Object.entries(usGaap)) {
    if (knownTags.has(tag)) continue;

    const validUnits = [];
    let entryCount = 0;

    for (const [unit, entries] of Object.entries(tagData.units || {})) {
      if (!FINANCIAL_UNITS.has(unit)) continue;
      const annualEntries = entries.filter(e => e.form === '10-K');
      if (annualEntries.length > 0) {
        validUnits.push(unit);
        entryCount += annualEntries.length;
      }
    }

    if (validUnits.length > 0) {
      orphans[tag] = { units: validUnits, entryCount };
    }
  }

  return orphans;
}

// ─── Pre-Built Classification Lookup ────────────────────────

/**
 * Get pre-built classification for a tag.
 * @param {string} tag - XBRL tag name
 * @returns {Object|null} { field, section, unit, confidence, negate } or null
 */
export function getPreClassified(tag) {
  return classifications[tag] || null;
}

/**
 * Get the number of pre-built classifications available.
 */
export function getPreClassifiedCount() {
  return Object.keys(classifications).length;
}

// ─── Layer 3 Suggestion Engine ──────────────────────────────

/**
 * Get Layer 3 tag suggestions for unresolved fields.
 *
 * For each missing field, checks orphan tags against the pre-built classification
 * cache. Returns suggestions sorted by confidence (highest first), deduplicated
 * to one tag per field.
 *
 * @param {Object} companyFacts - Raw EDGAR companyfacts
 * @param {Array} missingFields - Array of { field, section, unit, splitSensitive }
 * @param {Set} knownTags - All L1+L2 tags from collectKnownTags()
 * @returns {Array} [{ field, tag, unit, section, confidence, negate, splitSensitive }]
 */
export function getLayer3Suggestions(companyFacts, missingFields, knownTags) {
  if (missingFields.length === 0) return [];

  const orphans = findOrphanTags(companyFacts, knownTags);
  if (Object.keys(orphans).length === 0) return [];

  // Build a set of missing field keys for fast lookup
  const missingFieldMap = new Map();
  for (const f of missingFields) {
    missingFieldMap.set(`${f.section}:${f.field}`, f);
  }

  const suggestions = [];

  for (const tag of Object.keys(orphans)) {
    const cls = getPreClassified(tag);
    if (!cls || !cls.field) continue;

    const key = `${cls.section}:${cls.field}`;
    const fieldDef = missingFieldMap.get(key);
    if (!fieldDef) continue;

    // Verify unit compatibility
    if (cls.unit !== fieldDef.unit) continue;

    suggestions.push({
      field: cls.field,
      tag,
      unit: cls.unit,
      section: cls.section,
      confidence: cls.confidence,
      negate: cls.negate || false,
      splitSensitive: fieldDef.splitSensitive || false,
    });
  }

  // Sort by confidence descending, then field name for determinism
  suggestions.sort((a, b) => b.confidence - a.confidence || a.field.localeCompare(b.field));

  // Deduplicate: keep only the highest-confidence tag per field
  const seen = new Set();
  return suggestions.filter(s => {
    const key = `${s.section}:${s.field}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── Runtime AI Classification (Layer 3b) ───────────────────

const AI_BATCH_SIZE = 150;

/**
 * Classify orphan tags via Claude API for a single company.
 * Only called when pre-built cache misses and CLAUDE_KEY is available.
 *
 * Returns classifications in same shape as pre-built JSON entries:
 * { tagName: { field, section, unit, confidence, negate } }
 *
 * @param {string[]} orphanTagNames - Tags to classify
 * @param {Array} allFieldDefs - All field definitions with section info
 * @returns {Object} Tag classifications
 */
export async function classifyTagsViaAI(orphanTagNames, allFieldDefs) {
  if (!CLAUDE_KEY || orphanTagNames.length === 0) return {};

  const fieldDescriptions = buildFieldDescriptions(allFieldDefs);
  const results = {};

  // Process in batches
  for (let i = 0; i < orphanTagNames.length; i += AI_BATCH_SIZE) {
    const batch = orphanTagNames.slice(i, i + AI_BATCH_SIZE);

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': CLAUDE_KEY,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 8192,
          messages: [{
            role: 'user',
            content: buildClassificationPrompt(batch, fieldDescriptions),
          }],
        }),
      });

      if (!response.ok) {
        console.warn(`Layer 3 AI classification failed: HTTP ${response.status}`);
        continue;
      }

      const data = await response.json();
      const text = data.content?.[0]?.text || '';

      // Parse JSON array from response
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        for (const cls of parsed) {
          if (cls.tag && cls.field && cls.confidence >= 0.5) {
            results[cls.tag] = {
              field: cls.field,
              section: cls.section,
              unit: cls.unit,
              confidence: cls.confidence,
              negate: cls.negate || false,
            };
          }
        }
      }
    } catch (err) {
      console.warn(`Layer 3 AI batch classification error: ${err.message}`);
    }
  }

  return results;
}

/**
 * Build a field description string for the AI prompt.
 */
function buildFieldDescriptions(allFieldDefs) {
  const sections = { income: [], balance: [], cashFlow: [] };
  const seen = new Set();

  for (const d of allFieldDefs) {
    const key = `${d.section}:${d.field}`;
    if (seen.has(key)) continue;
    seen.add(key);
    sections[d.section]?.push(`  ${d.field} (${d.unit})`);
  }

  return [
    'INCOME STATEMENT:',
    ...sections.income,
    '',
    'BALANCE SHEET:',
    ...sections.balance,
    '',
    'CASH FLOW:',
    ...sections.cashFlow,
  ].join('\n');
}

/**
 * Build the Claude prompt for tag classification.
 */
function buildClassificationPrompt(tags, fieldDescriptions) {
  return `You are an expert in SEC XBRL US-GAAP taxonomy mapping.

I have standardized financial fields. For each XBRL tag below, determine which field it maps to.

STANDARDIZED FIELDS:
${fieldDescriptions}

RULES:
- Only map tags that DIRECTLY represent the same financial concept as the field
- Fair value disclosures, per-segment breakdowns, supplemental disclosures → null
- Sub-components (e.g., domestic-only revenue when we need total) → null
- Tags representing different granularity of the same concept → map if it's the total
- For debts: map to the appropriate category (short_term_debt, long_term_debt, current_portion_lt_debt)
- confidence: 1.0 = exact match, 0.9 = very likely, 0.8 = likely, <0.8 = uncertain
- negate: true only if XBRL sign convention is opposite our convention

TAGS TO CLASSIFY:
${tags.join('\n')}

Respond ONLY with a JSON array. Each element:
{"tag":"TagName","field":"field_name" or null,"section":"income"|"balance"|"cashFlow"|null,"unit":"USD"|"USD/shares"|"shares"|null,"confidence":0.0,"negate":false}`;
}

// ─── Cache for Runtime AI Classifications ───────────────────

const AI_CACHE_PREFIX = 'sa-l3-ai:';

/**
 * Save runtime AI classifications to localStorage for a ticker.
 */
export function saveAIClassifications(ticker, classifications) {
  try {
    localStorage.setItem(
      AI_CACHE_PREFIX + ticker.toUpperCase(),
      JSON.stringify({ savedAt: new Date().toISOString(), classifications })
    );
  } catch { /* localStorage full — non-critical */ }
}

/**
 * Load cached runtime AI classifications for a ticker.
 */
export function loadAIClassifications(ticker) {
  try {
    const raw = localStorage.getItem(AI_CACHE_PREFIX + ticker.toUpperCase());
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed.classifications || null;
  } catch {
    return null;
  }
}

// ─── Full Layer 3 Pipeline ──────────────────────────────────

/**
 * Run the complete Layer 3 pipeline for a company:
 * 1. Get suggestions from pre-built cache
 * 2. If gaps remain and AI is enabled, classify via Claude
 * 3. Return all suggestions
 *
 * @param {Object} companyFacts - Raw EDGAR companyfacts
 * @param {Array} missingFields - Array of { field, section, unit, splitSensitive }
 * @param {Set} knownTags - All L1+L2 tags
 * @param {Array} allFieldDefs - All field definitions with section info
 * @param {string} ticker - Company ticker (for AI cache)
 * @param {Object} options - { enableAI: bool }
 * @returns {Promise<Array>} Suggestions array
 */
export async function getLayer3SuggestionsWithAI(companyFacts, missingFields, knownTags, allFieldDefs, ticker, options = {}) {
  // Phase 1: Pre-built cache suggestions
  const preSuggestions = getLayer3Suggestions(companyFacts, missingFields, knownTags);

  if (!options.enableAI || !CLAUDE_KEY) return preSuggestions;

  // Check which fields still have no suggestion
  const resolvedFields = new Set(preSuggestions.map(s => `${s.section}:${s.field}`));
  const stillMissing = missingFields.filter(f => !resolvedFields.has(`${f.section}:${f.field}`));

  if (stillMissing.length === 0) return preSuggestions;

  // Phase 2: Check AI cache
  const cached = loadAIClassifications(ticker);
  if (cached) {
    // Merge cached AI classifications with orphan tag discovery
    const orphans = findOrphanTags(companyFacts, knownTags);
    const aiSuggestions = [];

    for (const tag of Object.keys(orphans)) {
      const cls = cached[tag];
      if (!cls || !cls.field) continue;
      const fieldDef = stillMissing.find(f => f.field === cls.field && f.section === cls.section);
      if (!fieldDef || cls.unit !== fieldDef.unit) continue;
      aiSuggestions.push({
        field: cls.field,
        tag,
        unit: cls.unit,
        section: cls.section,
        confidence: cls.confidence,
        negate: cls.negate || false,
        splitSensitive: fieldDef.splitSensitive || false,
      });
    }

    if (aiSuggestions.length > 0) {
      return [...preSuggestions, ...aiSuggestions];
    }
  }

  // Phase 3: Runtime AI classification
  const orphans = findOrphanTags(companyFacts, knownTags);
  const orphanNames = Object.keys(orphans);

  if (orphanNames.length === 0) return preSuggestions;

  console.log(`Layer 3 AI: classifying ${orphanNames.length} orphan tags for ${ticker}...`);
  const aiResults = await classifyTagsViaAI(orphanNames, allFieldDefs);

  // Cache the results
  if (Object.keys(aiResults).length > 0) {
    saveAIClassifications(ticker, aiResults);
  }

  // Build suggestions from AI results
  const aiSuggestions = [];
  for (const [tag, cls] of Object.entries(aiResults)) {
    if (!cls.field) continue;
    const fieldDef = stillMissing.find(f => f.field === cls.field && f.section === cls.section);
    if (!fieldDef || cls.unit !== fieldDef.unit) continue;
    aiSuggestions.push({
      field: cls.field,
      tag,
      unit: cls.unit,
      section: cls.section,
      confidence: cls.confidence,
      negate: cls.negate || false,
      splitSensitive: fieldDef.splitSensitive || false,
    });
  }

  // Deduplicate AI suggestions (one per field, highest confidence)
  const seenAI = new Set(resolvedFields);
  const dedupedAI = aiSuggestions
    .sort((a, b) => b.confidence - a.confidence)
    .filter(s => {
      const key = `${s.section}:${s.field}`;
      if (seenAI.has(key)) return false;
      seenAI.add(key);
      return true;
    });

  return [...preSuggestions, ...dedupedAI];
}
