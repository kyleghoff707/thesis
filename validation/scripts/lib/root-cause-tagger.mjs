/**
 * root-cause-tagger.mjs — Deterministic pattern matching for deviation root causes
 *
 * Per D-07: Rules are checked in priority order. First match wins.
 * Priority: sign_flip > scale_error > fy_offset > tag_miss > derivation_error > unknown
 *
 * Pure function — no disk I/O, no API calls, no imports from other modules.
 */

// ─── Helpers ─────────────────────────────────────────────────

/**
 * Check if two values are close within 1% relative tolerance.
 * Handles zero values with $1M absolute threshold.
 *
 * @param {number} a
 * @param {number} b
 * @param {number} [tolerance=0.01]
 * @returns {boolean}
 */
function isClose(a, b, tolerance = 0.01) {
  if (a === 0 && b === 0) return true;
  if (a === 0 || b === 0) return Math.abs(a - b) < 1_000_000;
  return Math.abs((a - b) / a) <= tolerance;
}

// ─── tagRootCause ────────────────────────────────────────────

/**
 * Classify the root cause of a deviation between our engine and consensus.
 *
 * @param {number|null} thesisValue - Our engine's value
 * @param {number|null} consensusValue - Consensus value from external sources
 * @param {object} [yearContext={}] - Adjacent year data for fy_offset detection
 * @param {number|null} [yearContext.prevYearConsensus] - Consensus value for year Y-1
 * @param {number|null} [yearContext.nextYearConsensus] - Consensus value for year Y+1
 * @returns {string} One of: sign_flip, scale_error, fy_offset, tag_miss, derivation_error, unknown
 */
export function tagRootCause(thesisValue, consensusValue, yearContext = {}) {
  // Both null — no data to analyze
  if (thesisValue == null && consensusValue == null) return 'unknown';

  // tag_miss: we return null, consensus has value
  if (thesisValue == null && consensusValue != null) return 'tag_miss';

  // Below this point, thesisValue is not null

  // If consensus is null but thesis is not, check fy_offset against adjacent years
  if (consensusValue == null) {
    const { prevYearConsensus, nextYearConsensus } = yearContext;
    if (prevYearConsensus != null && isClose(thesisValue, prevYearConsensus)) return 'fy_offset';
    if (nextYearConsensus != null && isClose(thesisValue, nextYearConsensus)) return 'fy_offset';
    return 'unknown';
  }

  // Both values exist — check patterns in priority order

  // 1. sign_flip: same magnitude, opposite sign
  if (Math.sign(thesisValue) !== Math.sign(consensusValue) &&
      isClose(Math.abs(thesisValue), Math.abs(consensusValue))) {
    return 'sign_flip';
  }

  // 2. scale_error: differ by exactly 1000x or 1,000,000x
  if (consensusValue !== 0) {
    const ratio = thesisValue / consensusValue;
    if (isClose(ratio, 1000) || isClose(ratio, 0.001) ||
        isClose(ratio, 1e6) || isClose(ratio, 1e-6)) {
      return 'scale_error';
    }
  }

  // 3. fy_offset: our value matches adjacent year consensus
  const { prevYearConsensus, nextYearConsensus } = yearContext;
  if (prevYearConsensus != null && isClose(thesisValue, prevYearConsensus)) return 'fy_offset';
  if (nextYearConsensus != null && isClose(thesisValue, nextYearConsensus)) return 'fy_offset';

  // 4. derivation_error: values exist but don't match any specific pattern
  return 'derivation_error';
}
