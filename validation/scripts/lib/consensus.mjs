/**
 * consensus.mjs — Multi-source consensus classification engine
 *
 * Classifies deviations between our XBRL engine and external sources (FMP, SimFin, mstarpy).
 * Pure functions — no disk I/O, no API calls.
 *
 * Per D-05: 1% tolerance for agreement.
 * Per D-06: Classification tiers based on source count and agreement.
 *
 * Classification values:
 *   CONSENSUS_DIFF — 3+ sources agree, we differ (high confidence: our bug)
 *   LIKELY_BUG     — 2 sources agree, we differ (lower confidence)
 *   METHODOLOGY_DIFF — sources disagree among themselves (not our bug)
 *   COVERAGE_GAP   — all sources null, we're also null
 *   UNIQUE_COVERAGE — all sources null, we have data
 *   MATCH          — our value matches consensus
 */

// ─── Helpers ─────────────────────────────────────────────────

/**
 * Compute median of a numeric array.
 * @param {number[]} arr - Sorted or unsorted numeric array
 * @returns {number}
 */
function median(arr) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

// ─── sourcesAgree ────────────────────────────────────────────

/**
 * Check if two values agree within tolerance.
 * Per D-05: 1% default tolerance.
 * Special handling for zero values (use $1M absolute threshold).
 *
 * @param {number} value1
 * @param {number} value2
 * @param {number} [tolerance=0.01] - Relative tolerance (0.01 = 1%)
 * @returns {boolean}
 */
export function sourcesAgree(value1, value2, tolerance = 0.01) {
  if (value1 === 0 && value2 === 0) return true;
  if (value1 === 0 || value2 === 0) {
    return Math.abs(value1 - value2) < 1_000_000;
  }
  return Math.abs((value1 - value2) / value1) <= tolerance;
}

// ─── findLargestCluster ──────────────────────────────────────

/**
 * Find the largest group of sources that agree within tolerance.
 * For small N (3-5 sources), brute force all subsets.
 * Returns array of { source, value } from the largest agreeing group.
 *
 * @param {Array<{ source: string, value: number }>} sourceValues
 * @param {number} [tolerance=0.01]
 * @returns {Array<{ source: string, value: number }>}
 */
export function findLargestCluster(sourceValues, tolerance = 0.01) {
  if (sourceValues.length === 0) return [];
  if (sourceValues.length === 1) return [sourceValues[0]];

  let bestCluster = [sourceValues[0]]; // at minimum, single element

  // For small N, check all subsets of size >= 2
  const n = sourceValues.length;

  // Check all subsets using bitmask (practical for N <= ~20)
  for (let mask = 3; mask < (1 << n); mask++) {
    const subset = [];
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) subset.push(sourceValues[i]);
    }

    if (subset.length <= bestCluster.length) continue; // skip smaller subsets

    // Check if all pairs in this subset agree
    let allAgree = true;
    for (let i = 0; i < subset.length && allAgree; i++) {
      for (let j = i + 1; j < subset.length && allAgree; j++) {
        if (!sourcesAgree(subset[i].value, subset[j].value, tolerance)) {
          allAgree = false;
        }
      }
    }

    if (allAgree && subset.length > bestCluster.length) {
      bestCluster = subset;
    }
  }

  return bestCluster;
}

// ─── classifyField ───────────────────────────────────────────

/**
 * Classify a single field's deviation between our engine and external sources.
 * Per D-06: CONSENSUS_DIFF / LIKELY_BUG / METHODOLOGY_DIFF / COVERAGE_GAP / UNIQUE_COVERAGE / MATCH
 *
 * @param {number|null} thesisValue - Our XBRL engine's extracted value
 * @param {Array<{source: string, value: number|null}>} sourceValues - External source values
 * @param {number} [tolerance=0.01] - Default 0.01 (1%) per D-05
 * @returns {{ classification: string, consensusValue: number|null, agreeingSources: string[], totalSources: number }}
 */
export function classifyField(thesisValue, sourceValues, tolerance = 0.01) {
  const nonNull = sourceValues.filter(s => s.value != null);

  // All sources null
  if (nonNull.length === 0) {
    return {
      classification: thesisValue == null ? 'COVERAGE_GAP' : 'UNIQUE_COVERAGE',
      consensusValue: null,
      agreeingSources: [],
      totalSources: sourceValues.length,
    };
  }

  // Only 1 non-null source — can't form consensus
  if (nonNull.length === 1) {
    const singleValue = nonNull[0].value;
    const matches = thesisValue != null && sourcesAgree(thesisValue, singleValue, tolerance);
    return {
      classification: matches ? 'MATCH' : 'METHODOLOGY_DIFF',
      consensusValue: singleValue,
      agreeingSources: [nonNull[0].source],
      totalSources: sourceValues.length,
    };
  }

  // 2+ non-null sources — find largest agreement cluster
  const cluster = findLargestCluster(nonNull, tolerance);

  // No agreement (all sources disagree — cluster is just 1)
  if (cluster.length <= 1) {
    return {
      classification: 'METHODOLOGY_DIFF',
      consensusValue: null,
      agreeingSources: [],
      totalSources: sourceValues.length,
    };
  }

  // 2+ sources form a cluster — compute consensus as median
  const consensusValue = median(cluster.map(s => s.value));
  const agreeingSources = cluster.map(s => s.source);

  // Check if our value matches consensus
  if (thesisValue != null && sourcesAgree(thesisValue, consensusValue, tolerance)) {
    return {
      classification: 'MATCH',
      consensusValue,
      agreeingSources,
      totalSources: sourceValues.length,
    };
  }

  // Our value doesn't match (or is null)
  if (cluster.length >= 3) {
    return { classification: 'CONSENSUS_DIFF', consensusValue, agreeingSources, totalSources: sourceValues.length };
  }
  if (cluster.length >= 2) {
    return { classification: 'LIKELY_BUG', consensusValue, agreeingSources, totalSources: sourceValues.length };
  }

  return { classification: 'METHODOLOGY_DIFF', consensusValue: null, agreeingSources: [], totalSources: sourceValues.length };
}
