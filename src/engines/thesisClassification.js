// ─── Thesis Taxonomy Classification Engine ────────────────────────────
// Modern 3-tier taxonomy (Sector > Industry Group > Industry) covering
// 5,758 US public companies. Replaces SIC-based classification for
// peer discovery and competitive analysis.
//
// Data: thesis-company-assignments.json (5,758 classifications)
// Lookup priority: CIK → ticker → SIC fallback

import companyAssignments from '../../industry-classification/thesis-company-assignments.json';
import { classifyBySIC as classifyBySIC_legacy } from './sicClassification';

// ─── Lazy Indexes ──────────────────────────────────────────

let _cikIndex = null;     // Map<paddedCik, assignment>
let _tickerIndex = null;  // Map<TICKER, assignment>
let _tierIndex = null;    // { sector: Map<name, [entries]>, ... }

function ensureIndexes() {
  if (_cikIndex) return;
  _cikIndex = new Map();
  _tickerIndex = new Map();
  _tierIndex = {
    sector: new Map(),
    industryGroup: new Map(),
    industry: new Map(),
  };

  for (const [cik, entry] of Object.entries(companyAssignments.assignments)) {
    _cikIndex.set(cik, entry);
    if (entry.ticker) {
      _tickerIndex.set(entry.ticker.toUpperCase(), entry);
    }
    for (const tier of ['sector', 'industryGroup', 'industry']) {
      const val = entry[tier];
      if (!_tierIndex[tier].has(val)) _tierIndex[tier].set(val, []);
      _tierIndex[tier].get(val).push(entry);
    }
  }
}

// ─── Classification ────────────────────────────────────────

/**
 * Classify a company using the Thesis taxonomy.
 * Tries CIK → ticker → SIC fallback.
 * @returns {{ sector, industryGroup, industry, thesisCode }} or null
 */
export function classifyCompany(ticker, cik, sicCode, sicDescription) {
  ensureIndexes();

  // CIK lookup (primary — most reliable identifier)
  if (cik) {
    const padded = String(cik).padStart(10, '0');
    const entry = _cikIndex.get(padded);
    if (entry) {
      return {
        sector: entry.sector,
        industryGroup: entry.industryGroup,
        industry: entry.industry,
        thesisCode: entry.thesisCode,
      };
    }
  }

  // Ticker lookup (secondary)
  if (ticker) {
    const entry = _tickerIndex.get(ticker.toUpperCase());
    if (entry) {
      return {
        sector: entry.sector,
        industryGroup: entry.industryGroup,
        industry: entry.industry,
        thesisCode: entry.thesisCode,
      };
    }
  }

  // SIC fallback (legacy — for companies not in Thesis assignments)
  if (sicCode) {
    const legacy = classifyBySIC_legacy(sicCode, sicDescription);
    return {
      sector: legacy.sector,
      industryGroup: legacy.industryGroup,
      industry: legacy.industry,
      thesisCode: null,
    };
  }

  return null;
}

// ─── Peer Lookup ───────────────────────────────────────────

/**
 * Get all companies classified under a given tier value.
 * Instant — in-memory filter, no network calls.
 * @param {'sector'|'industryGroup'|'industry'} tier
 * @param {string} value - e.g., "Technology" or "Software"
 * @returns {Array<{ ticker, cik, name, thesisCode, sector, industryGroup, industry }>}
 */
export function getCompaniesForTier(tier, value) {
  ensureIndexes();
  return _tierIndex[tier]?.get(value) || [];
}

/**
 * Get peer counts for all three tiers of a classification.
 * Instant — no network calls.
 * @returns {{ sector: number, industryGroup: number, industry: number }}
 */
export function getTierCounts(classification) {
  if (!classification) return { sector: 0, industryGroup: 0, industry: 0 };
  ensureIndexes();
  return {
    sector: _tierIndex.sector.get(classification.sector)?.length || 0,
    industryGroup: _tierIndex.industryGroup.get(classification.industryGroup)?.length || 0,
    industry: _tierIndex.industry.get(classification.industry)?.length || 0,
  };
}

// ─── Backward Compatibility ────────────────────────────────

/** @deprecated Use classifyCompany() instead */
export function classifyBySIC(sicCode, sicDescription) {
  return classifyBySIC_legacy(sicCode, sicDescription);
}

export { SIC_MAP } from './sicClassification';
