/**
 * triangulation-reporter.mjs — Console + JSON triangulation report generation
 *
 * Three exports:
 * - generateTriangulationConsoleReport: human-readable per-company classification breakdown
 * - generateFixRecommendations: fix-recommendations.json with prioritized CONSENSUS_DIFF entries
 * - generateRegressionDiff: compare current results against morningstar-accuracy.json baseline
 *
 * All functions return data (no console.log inside). Caller decides how to output.
 */

// ─── generateTriangulationConsoleReport ─────────────────────

/**
 * Generate human-readable console report for triangulation results.
 * Shows per-company: accuracy, classification counts (MATCH, CONSENSUS_DIFF, LIKELY_BUG,
 * METHODOLOGY_DIFF, COVERAGE_GAP, UNIQUE_COVERAGE), top failures.
 *
 * @param {Array} companyResults - Array of { ticker, classifications: Array<{field, year, statement, classification, rootCause, thesisValue, consensusValue, sources}> }
 * @returns {string} Full report string (caller prints)
 */
export function generateTriangulationConsoleReport(companyResults) {
  const lines = [];
  lines.push('');
  lines.push('TRIANGULATION REPORT');
  lines.push('\u2550'.repeat(80));

  const totals = {
    MATCH: 0,
    CONSENSUS_DIFF: 0,
    LIKELY_BUG: 0,
    METHODOLOGY_DIFF: 0,
    COVERAGE_GAP: 0,
    UNIQUE_COVERAGE: 0,
  };
  let totalFields = 0;

  // Sort companies alphabetically
  const sorted = [...companyResults].sort((a, b) => a.ticker.localeCompare(b.ticker));

  for (const { ticker, classifications } of sorted) {
    const counts = {
      MATCH: 0,
      CONSENSUS_DIFF: 0,
      LIKELY_BUG: 0,
      METHODOLOGY_DIFF: 0,
      COVERAGE_GAP: 0,
      UNIQUE_COVERAGE: 0,
    };

    for (const c of classifications) {
      if (counts[c.classification] !== undefined) {
        counts[c.classification]++;
      }
    }

    const total = classifications.length;
    totalFields += total;

    // Accumulate totals
    for (const key of Object.keys(totals)) {
      totals[key] += counts[key];
    }

    // Build company line
    const parts = [ticker.padEnd(8)];
    parts.push(`${total} fields`);
    parts.push(`MATCH:${counts.MATCH}`);
    if (counts.CONSENSUS_DIFF > 0) parts.push(`CONSENSUS_DIFF:${counts.CONSENSUS_DIFF}`);
    if (counts.LIKELY_BUG > 0) parts.push(`LIKELY_BUG:${counts.LIKELY_BUG}`);
    if (counts.METHODOLOGY_DIFF > 0) parts.push(`METHODOLOGY_DIFF:${counts.METHODOLOGY_DIFF}`);
    if (counts.COVERAGE_GAP > 0) parts.push(`COVERAGE_GAP:${counts.COVERAGE_GAP}`);
    if (counts.UNIQUE_COVERAGE > 0) parts.push(`UNIQUE_COVERAGE:${counts.UNIQUE_COVERAGE}`);

    lines.push(parts.join('  '));

    // Top 3 CONSENSUS_DIFF + LIKELY_BUG fields
    if (counts.CONSENSUS_DIFF > 0 || counts.LIKELY_BUG > 0) {
      const failMap = {};
      for (const c of classifications) {
        if (c.classification !== 'CONSENSUS_DIFF' && c.classification !== 'LIKELY_BUG') continue;
        if (!failMap[c.field]) failMap[c.field] = 0;
        failMap[c.field]++;
      }
      const topFails = Object.entries(failMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([field, count]) => `${field} (${count})`);
      if (topFails.length > 0) {
        lines.push(`  Top failures: ${topFails.join(', ')}`);
      }
    }
  }

  lines.push('\u2550'.repeat(80));

  // Overall summary
  const matchPct = totalFields > 0
    ? ((totals.MATCH / totalFields) * 100).toFixed(1)
    : '0.0';
  lines.push(
    `OVERALL: ${totalFields} fields | ${totals.MATCH} MATCH (${matchPct}%) | ` +
    `${totals.CONSENSUS_DIFF} CONSENSUS_DIFF | ${totals.LIKELY_BUG} LIKELY_BUG | ` +
    `${totals.METHODOLOGY_DIFF} METHODOLOGY_DIFF | ${totals.COVERAGE_GAP} COVERAGE_GAP | ` +
    `${totals.UNIQUE_COVERAGE} UNIQUE_COVERAGE`
  );

  // Top failure patterns: CONSENSUS_DIFF fields sorted by affected company count
  const patternMap = {};
  for (const { ticker, classifications } of companyResults) {
    for (const c of classifications) {
      if (c.classification !== 'CONSENSUS_DIFF' && c.classification !== 'LIKELY_BUG') continue;
      const key = `${c.field} (${c.statement})`;
      if (!patternMap[key]) patternMap[key] = { field: key, tickers: new Set(), count: 0 };
      patternMap[key].count++;
      patternMap[key].tickers.add(ticker);
    }
  }

  const patterns = Object.values(patternMap)
    .sort((a, b) => b.tickers.size - a.tickers.size || b.count - a.count)
    .slice(0, 15);

  if (patterns.length > 0) {
    lines.push('');
    lines.push('TOP FAILURE PATTERNS:');
    for (const p of patterns) {
      lines.push(`  ${p.field}: ${p.count} failures across ${p.tickers.size} companies`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

// ─── generateFixRecommendations ─────────────────────────────

/**
 * Generate fix-recommendations.json content.
 * Groups all CONSENSUS_DIFF and LIKELY_BUG entries by field+statement,
 * counts affected companies/years, attaches root cause, sorts by priority.
 *
 * Priority = affectedYears descending (most impactful first).
 *
 * @param {Array} companyResults - same as above
 * @returns {object} fix-recommendations.json structure per RESEARCH.md
 */
export function generateFixRecommendations(companyResults) {
  // Count each classification across all companies
  const summary = {
    totalFields: 0,
    consensusDiff: 0,
    likelyBug: 0,
    methodologyDiff: 0,
    coverageGap: 0,
    uniqueCoverage: 0,
    match: 0,
  };

  for (const { classifications } of companyResults) {
    for (const c of classifications) {
      summary.totalFields++;
      switch (c.classification) {
        case 'MATCH': summary.match++; break;
        case 'CONSENSUS_DIFF': summary.consensusDiff++; break;
        case 'LIKELY_BUG': summary.likelyBug++; break;
        case 'METHODOLOGY_DIFF': summary.methodologyDiff++; break;
        case 'COVERAGE_GAP': summary.coverageGap++; break;
        case 'UNIQUE_COVERAGE': summary.uniqueCoverage++; break;
      }
    }
  }

  // Group CONSENSUS_DIFF and LIKELY_BUG by (field, statement)
  const groupMap = {};

  for (const { ticker, classifications } of companyResults) {
    for (const c of classifications) {
      if (c.classification !== 'CONSENSUS_DIFF' && c.classification !== 'LIKELY_BUG') continue;

      const key = `${c.field}|${c.statement}`;

      if (!groupMap[key]) {
        groupMap[key] = {
          field: c.field,
          statement: c.statement,
          classifications: {},  // classification -> count
          rootCauses: {},       // rootCause -> count
          tickers: new Set(),
          yearCount: 0,
          // Sample values from first occurrence
          consensusValue: c.consensusValue,
          thesisValue: c.thesisValue,
          sampleCompany: ticker,
          sampleYear: c.year,
          sources: c.sources,
        };
      }

      const group = groupMap[key];
      group.tickers.add(ticker);
      group.yearCount++;

      // Count classifications
      group.classifications[c.classification] = (group.classifications[c.classification] || 0) + 1;

      // Count root causes
      if (c.rootCause) {
        group.rootCauses[c.rootCause] = (group.rootCauses[c.rootCause] || 0) + 1;
      }
    }
  }

  // Build recommendations array
  const recommendations = Object.values(groupMap).map(group => {
    // Most common classification
    const classification = Object.entries(group.classifications)
      .sort((a, b) => b[1] - a[1])[0][0];

    // Most common root cause
    const rootCauseEntries = Object.entries(group.rootCauses)
      .sort((a, b) => b[1] - a[1]);
    const rootCause = rootCauseEntries.length > 0 ? rootCauseEntries[0][0] : 'unknown';

    return {
      priority: 0, // assigned after sorting
      field: group.field,
      statement: group.statement,
      classification,
      rootCause,
      affectedCompanies: group.tickers.size,
      affectedYears: group.yearCount,
      consensusValue: group.consensusValue,
      thesisValue: group.thesisValue,
      sampleCompany: group.sampleCompany,
      sampleYear: group.sampleYear,
      sources: group.sources,
    };
  });

  // Sort by affectedYears descending
  recommendations.sort((a, b) => b.affectedYears - a.affectedYears);

  // Assign priority numbers
  recommendations.forEach((rec, i) => {
    rec.priority = i + 1;
  });

  // Group by rootCause
  const byRootCause = {};
  for (const rec of recommendations) {
    const key = rec.rootCause;
    if (!byRootCause[key]) byRootCause[key] = [];
    byRootCause[key].push(rec);
  }

  return {
    generatedAt: new Date().toISOString(),
    summary,
    recommendations,
    byRootCause,
    regressionDiff: null, // filled by caller via generateRegressionDiff
  };
}

// ─── generateRegressionDiff ─────────────────────────────────

/**
 * Compare current triangulation against Morningstar baseline.
 *
 * @param {object} fixRecs - The fix-recommendations output (has summary + recommendations)
 * @param {object} baseline - morningstar-accuracy.json content
 * @returns {{ previousAccuracy: number, fieldsGained: string[], fieldsLost: string[], classificationChanges: object[] }}
 */
export function generateRegressionDiff(fixRecs, baseline) {
  const previousAccuracy = baseline.overallAccuracy;

  // Extract baseline failure field names (strip the "(statement)" suffix for matching)
  const baselineFailFields = new Set();
  for (const pattern of (baseline.topFailurePatterns || [])) {
    // field looks like "intangible_assets (balance_sheet)" — extract base name
    const match = pattern.field.match(/^(\S+)/);
    if (match) baselineFailFields.add(match[1]);
  }

  // Extract current CONSENSUS_DIFF/LIKELY_BUG field names
  const currentFailFields = new Set();
  for (const rec of (fixRecs.recommendations || [])) {
    currentFailFields.add(rec.field);
  }

  // Fields gained: were in baseline failures, now NOT in current failures
  // (i.e., previously DIFF, now presumably MATCH or at least not a bug)
  const fieldsGained = [...baselineFailFields].filter(f => !currentFailFields.has(f));

  // Fields lost: NOT in baseline failures, now in current failures
  // (i.e., regression — new CONSENSUS_DIFF fields)
  const fieldsLost = [...currentFailFields].filter(f => !baselineFailFields.has(f));

  // Classification changes: how baseline DIFF fields were reclassified
  const classificationChanges = [];
  for (const baseField of baselineFailFields) {
    const rec = fixRecs.recommendations?.find(r => r.field === baseField);
    if (rec) {
      classificationChanges.push({
        field: baseField,
        baselineStatus: 'DIFF',
        triangulationClassification: rec.classification,
        rootCause: rec.rootCause,
      });
    } else {
      classificationChanges.push({
        field: baseField,
        baselineStatus: 'DIFF',
        triangulationClassification: 'MATCH',
        rootCause: null,
      });
    }
  }

  return {
    previousAccuracy,
    fieldsGained,
    fieldsLost,
    classificationChanges,
  };
}
