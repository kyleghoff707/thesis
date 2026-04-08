/**
 * reporter.mjs — Console summary + JSON detail generation for accuracy reports
 *
 * Two report generators that consume compareCompany results:
 * - generateConsoleReport: human-readable summary (per D-05/D-06)
 * - generateJsonReport: structured JSON for machine consumption + Phase 2 regression diffing
 *
 * Both functions return data (no console.log inside). Caller decides how to output.
 */

// ─── Helpers ─────────────────────────────────────────────────

/**
 * Count statuses and compute accuracy for a single company's results.
 *
 * @param {Array} results - Per-field comparison results from compareCompany
 * @returns {{ match, close, diff, missing, skipped, compared, accuracy }}
 */
function tallyResults(results) {
  let match = 0;
  let close = 0;
  let diff = 0;
  let missing = 0;
  let skipped = 0;
  let methodologyDiff = 0;

  for (const r of results) {
    switch (r.status) {
      case 'MATCH': match++; break;
      case 'CLOSE': close++; break;
      case 'DIFF': diff++; break;
      case 'MISSING_FIELD':
      case 'MISSING_YEAR': missing++; break;
      case 'SKIP_SPINOFF':
      case 'SKIP_EUR':
      case 'SKIP_BANK_TEMPLATE':
      case 'ENGINE_ERROR': skipped++; break;
      case 'METHODOLOGY_DIFF': methodologyDiff++; break;
    }
  }

  const compared = match + close + diff;
  const accuracy = compared > 0 ? (match / compared) * 100 : 0;

  return { match, close, diff, missing, skipped, methodologyDiff, compared, accuracy };
}

/**
 * Get top N DIFF fields for a company, sorted by fail count descending.
 *
 * @param {Array} results - Per-field comparison results
 * @param {number} n - How many top failures to return
 * @returns {Array<{ field, statement, failCount, avgPct }>}
 */
function getTopFailures(results, n = 3) {
  const failMap = {};

  for (const r of results) {
    if (r.status !== 'DIFF') continue;
    const key = `${r.thesisField}|${r.statement}`;
    if (!failMap[key]) {
      failMap[key] = { field: r.thesisField, statement: r.statement, count: 0, pctSum: 0 };
    }
    failMap[key].count++;
    if (r.pct != null && isFinite(r.pct)) {
      failMap[key].pctSum += r.pct;
    }
  }

  return Object.values(failMap)
    .sort((a, b) => b.count - a.count)
    .slice(0, n)
    .map(f => ({
      field: f.field,
      statement: f.statement,
      failCount: f.count,
      avgPct: f.count > 0 ? parseFloat((f.pctSum / f.count).toFixed(4)) : 0,
    }));
}

/**
 * Get top N global failure patterns across all companies.
 *
 * @param {Array} allResults - Array of { ticker, offset, results } from compareCompany
 * @param {number} n - How many patterns to return
 * @returns {Array<{ field, totalFailures, companyCount, companies }>}
 */
function getTopFailurePatterns(allResults, n = 15) {
  const patternMap = {};

  for (const { ticker, results } of allResults) {
    for (const r of results) {
      if (r.status !== 'DIFF') continue;
      const key = `${r.thesisField} (${r.statement})`;
      if (!patternMap[key]) {
        patternMap[key] = { field: key, tickers: new Set(), count: 0 };
      }
      patternMap[key].count++;
      patternMap[key].tickers.add(ticker);
    }
  }

  return Object.values(patternMap)
    .sort((a, b) => b.count - a.count)
    .slice(0, n)
    .map(p => ({
      field: p.field,
      totalFailures: p.count,
      companyCount: p.tickers.size,
      companies: [...p.tickers].sort(),
    }));
}

// ─── Console Report ──────────────────────────────────────────

/**
 * Generate a human-readable console report.
 *
 * Format (per D-05/D-06):
 *   MORNINGSTAR ACCURACY REPORT
 *   ══════════════
 *   AAPL      328/345 match (95.2%)  10 close  12 missing  7 DIFF
 *     Top failures: other_income_expense (3), intangible_assets (2), ...
 *   ...
 *   ══════════════
 *   OVERALL: 11234/12345 (91.0%) match | 456 close | 1234 missing | 655 DIFF
 *
 *   TOP FAILURE PATTERNS:
 *     intangible_assets (balance_sheet): 149 failures across 38 companies
 *     ...
 *
 * @param {Array} allResults - Array of { ticker, offset, results } from compareCompany
 * @returns {string} Full report string (caller prints)
 */
export function generateConsoleReport(allResults) {
  const lines = [];
  lines.push('');
  lines.push('MORNINGSTAR ACCURACY REPORT');
  lines.push('\u2550'.repeat(70));

  let totalMatch = 0;
  let totalClose = 0;
  let totalDiff = 0;
  let totalMissing = 0;
  let totalSkipped = 0;
  let totalMethodologyDiff = 0;
  let totalCompared = 0;

  // Sort companies alphabetically
  const sorted = [...allResults].sort((a, b) => a.ticker.localeCompare(b.ticker));

  for (const { ticker, offset, results } of sorted) {
    const tally = tallyResults(results);

    const parts = [`${ticker.padEnd(8)}`];
    parts.push(`${String(tally.match).padStart(4)}/${String(tally.compared).padStart(4)} match (${tally.accuracy.toFixed(1)}%)`);
    if (tally.close > 0) parts.push(`${tally.close} close`);
    if (tally.missing > 0) parts.push(`${tally.missing} missing`);
    if (tally.diff > 0) parts.push(`${tally.diff} DIFF`);
    if (tally.methodologyDiff > 0) parts.push(`${tally.methodologyDiff} meth`);
    if (offset !== 0) parts.push(`offset:${offset}`);
    if (tally.skipped > 0) parts.push(`${tally.skipped} skipped`);

    lines.push(parts.join('  '));

    // Top 3 failure fields for this company
    const topFails = getTopFailures(results, 3);
    if (topFails.length > 0) {
      const failDescs = topFails.map(f => `${f.field} (${f.failCount})`);
      lines.push(`  Top failures: ${failDescs.join(', ')}`);
    }

    totalMatch += tally.match;
    totalClose += tally.close;
    totalDiff += tally.diff;
    totalMissing += tally.missing;
    totalSkipped += tally.skipped;
    totalMethodologyDiff += tally.methodologyDiff;
    totalCompared += tally.compared;
  }

  lines.push('\u2550'.repeat(70));
  const overallPct = totalCompared > 0
    ? ((totalMatch / totalCompared) * 100).toFixed(1)
    : '0.0';
  lines.push(
    `OVERALL: ${totalMatch}/${totalCompared} (${overallPct}%) match | ${totalClose} close | ${totalMissing} missing | ${totalDiff} DIFF | ${totalMethodologyDiff} methodology`
  );

  // Top failure patterns
  const patterns = getTopFailurePatterns(allResults, 15);
  if (patterns.length > 0) {
    lines.push('');
    lines.push('TOP FAILURE PATTERNS:');
    for (const p of patterns) {
      lines.push(`  ${p.field}: ${p.totalFailures} failures across ${p.companyCount} companies`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

// ─── JSON Report ─────────────────────────────────────────────

/**
 * Generate a structured JSON report for machine consumption.
 *
 * @param {Array} allResults - Array of { ticker, offset, results } from compareCompany
 * @returns {object} Structured report object
 */
export function generateJsonReport(allResults) {
  let totalMatch = 0;
  let totalClose = 0;
  let totalDiff = 0;
  let totalMissing = 0;
  let totalSkipped = 0;
  let totalMethodologyDiff = 0;
  let totalCompared = 0;

  const companies = [];

  // Sort companies alphabetically
  const sorted = [...allResults].sort((a, b) => a.ticker.localeCompare(b.ticker));

  for (const { ticker, offset, results } of sorted) {
    const tally = tallyResults(results);

    totalMatch += tally.match;
    totalClose += tally.close;
    totalDiff += tally.diff;
    totalMissing += tally.missing;
    totalSkipped += tally.skipped;
    totalMethodologyDiff += tally.methodologyDiff;
    totalCompared += tally.compared;

    companies.push({
      ticker,
      accuracy: parseFloat(tally.accuracy.toFixed(1)),
      compared: tally.compared,
      match: tally.match,
      close: tally.close,
      diff: tally.diff,
      methodologyDiff: tally.methodologyDiff,
      missing: tally.missing,
      offset,
      topFailures: getTopFailures(results, 3),
      results, // Full per-field results for drilling in
    });
  }

  const overallAccuracy = totalCompared > 0
    ? parseFloat(((totalMatch / totalCompared) * 100).toFixed(1))
    : 0;

  return {
    generatedAt: new Date().toISOString(),
    overallAccuracy,
    summary: {
      totalCompared,
      totalMatch,
      totalClose,
      totalDiff,
      totalMissing,
      totalSkipped,
      totalMethodologyDiff,
    },
    companies,
    topFailurePatterns: getTopFailurePatterns(allResults, 15),
  };
}
