/**
 * sp500-reporter.mjs -- Console + JSON reporting for S&P 500 FMP comparison results
 *
 * Generates tiered accuracy reports (Tier 1/2/3 separately + overall) in both
 * human-readable console format and structured JSON for machine consumption.
 *
 * All functions return data (no console.log). Caller decides how to output.
 */

// ─── Tiered Tallying ────────────────────────────────────────

/**
 * Tally results per tier for a single company.
 *
 * @param {Array} results - Per-field comparison results from compareFmpToEngine
 * @returns {{ tier1: { match, close, diff, missing, accuracy }, tier2: {...}, tier3: {...}, overall: {...} }}
 */
export function tallyTieredResults(results) {
  const buckets = {
    1: { match: 0, close: 0, diff: 0, missing: 0 },
    2: { match: 0, close: 0, diff: 0, missing: 0 },
    3: { match: 0, close: 0, diff: 0, missing: 0 },
    0: { match: 0, close: 0, diff: 0, missing: 0 },
  };

  for (const r of results) {
    const tier = r.tier || 0;
    const bucket = buckets[tier] || buckets[0];

    switch (r.status) {
      case 'MATCH': bucket.match++; break;
      case 'CLOSE': bucket.close++; break;
      case 'DIFF': bucket.diff++; break;
      case 'MISSING_FIELD': bucket.missing++; break;
    }
  }

  // Compute accuracy per tier
  function withAccuracy(b) {
    const compared = b.match + b.close + b.diff;
    return { ...b, compared, accuracy: compared > 0 ? (b.match / compared) * 100 : 0 };
  }

  // Overall across all tiers
  const overall = { match: 0, close: 0, diff: 0, missing: 0 };
  for (const tier of [1, 2, 3, 0]) {
    overall.match += buckets[tier].match;
    overall.close += buckets[tier].close;
    overall.diff += buckets[tier].diff;
    overall.missing += buckets[tier].missing;
  }

  return {
    tier1: withAccuracy(buckets[1]),
    tier2: withAccuracy(buckets[2]),
    tier3: withAccuracy(buckets[3]),
    untiered: withAccuracy(buckets[0]),
    overall: withAccuracy(overall),
  };
}

// ─── Top Tier 1 Failure Patterns ────────────────────────────

/**
 * Get top N Tier 1 failure patterns across all companies.
 *
 * @param {Array} allResults - Array of company result objects
 * @param {number} n - Number of patterns to return
 * @returns {Array<{ field, companyCount, avgPct }>}
 */
function getTopTier1Failures(allResults, n = 10) {
  const failMap = {};

  for (const company of allResults) {
    if (company.status !== 'OK') continue;

    for (const r of company.results) {
      if (r.status !== 'DIFF' || r.tier !== 1) continue;
      if (!failMap[r.field]) {
        failMap[r.field] = { field: r.field, tickers: new Set(), pctSum: 0, count: 0 };
      }
      failMap[r.field].tickers.add(company.ticker);
      failMap[r.field].count++;
      if (r.pct != null && isFinite(r.pct)) {
        failMap[r.field].pctSum += r.pct;
      }
    }
  }

  return Object.values(failMap)
    .sort((a, b) => b.tickers.size - a.tickers.size)
    .slice(0, n)
    .map(f => ({
      field: f.field,
      companyCount: f.tickers.size,
      avgPct: f.count > 0 ? parseFloat(((f.pctSum / f.count) * 100).toFixed(1)) : 0,
    }));
}

// ─── Console Report ─────────────────────────────────────────

/**
 * Generate a human-readable console report with tiered accuracy.
 *
 * @param {Array} companyResults - Array of { ticker, status, yearsCompared, results }
 * @param {object} [options] - { showAll: false }
 * @returns {string} Full report string
 */
export function generateSP500ConsoleReport(companyResults, options = {}) {
  const { showAll = false } = options;
  const lines = [];

  // Count company statuses
  const compared = companyResults.filter(c => c.status === 'OK');
  const skipped = companyResults.filter(c => c.status === 'SKIP_EUR');
  const failed = companyResults.filter(c => c.status === 'NO_DATA' || c.status === 'ENGINE_ERROR');

  lines.push('');
  lines.push('S&P 500 FMP COMPARISON REPORT');
  lines.push('='.repeat(70));
  lines.push(`Companies: ${companyResults.length} | Compared: ${compared.length} | Skipped: ${skipped.length} (EUR) | Failed: ${failed.length}`);
  lines.push('');

  // Aggregate tiered accuracy across all companies
  const aggTiers = {
    tier1: { match: 0, close: 0, diff: 0, compared: 0 },
    tier2: { match: 0, close: 0, diff: 0, compared: 0 },
    tier3: { match: 0, close: 0, diff: 0, compared: 0 },
    overall: { match: 0, close: 0, diff: 0, compared: 0 },
  };

  const perCompany = [];

  for (const company of compared) {
    const tally = tallyTieredResults(company.results);

    aggTiers.tier1.match += tally.tier1.match;
    aggTiers.tier1.close += tally.tier1.close;
    aggTiers.tier1.diff += tally.tier1.diff;
    aggTiers.tier1.compared += tally.tier1.compared;

    aggTiers.tier2.match += tally.tier2.match;
    aggTiers.tier2.close += tally.tier2.close;
    aggTiers.tier2.diff += tally.tier2.diff;
    aggTiers.tier2.compared += tally.tier2.compared;

    aggTiers.tier3.match += tally.tier3.match;
    aggTiers.tier3.close += tally.tier3.close;
    aggTiers.tier3.diff += tally.tier3.diff;
    aggTiers.tier3.compared += tally.tier3.compared;

    aggTiers.overall.match += tally.overall.match;
    aggTiers.overall.close += tally.overall.close;
    aggTiers.overall.diff += tally.overall.diff;
    aggTiers.overall.compared += tally.overall.compared;

    perCompany.push({
      ticker: company.ticker,
      tier1Accuracy: tally.tier1.accuracy,
      tier2Accuracy: tally.tier2.accuracy,
      tier3Accuracy: tally.tier3.accuracy,
      overallAccuracy: tally.overall.accuracy,
      yearsCompared: company.yearsCompared,
      tally,
    });
  }

  // Tiered accuracy section
  function tierLine(label, tier) {
    const pct = tier.compared > 0 ? ((tier.match / tier.compared) * 100).toFixed(1) : '0.0';
    return `  ${label.padEnd(30)} ${pct.padStart(6)}%  (${tier.match}/${tier.compared} match)`;
  }

  lines.push('TIERED ACCURACY');
  lines.push(tierLine('Tier 1 (Scoring-Critical):', aggTiers.tier1));
  lines.push(tierLine('Tier 2 (Display):', aggTiers.tier2));
  lines.push(tierLine('Tier 3 (Expanded):', aggTiers.tier3));
  lines.push(tierLine('Overall:', aggTiers.overall));
  lines.push('');

  // Top Tier 1 failure patterns
  const topFailures = getTopTier1Failures(companyResults, 10);
  if (topFailures.length > 0) {
    lines.push('TOP 10 TIER 1 FAILURE PATTERNS');
    lines.push(`  ${'Field'.padEnd(35)} Companies  Avg Diff`);
    for (const f of topFailures) {
      lines.push(`  ${f.field.padEnd(35)} ${String(f.companyCount).padStart(6)}     ${f.avgPct.toFixed(1)}%`);
    }
    lines.push('');
  }

  // Lowest-accuracy companies (bottom 10 by overall accuracy)
  const sorted = [...perCompany].sort((a, b) => a.overallAccuracy - b.overallAccuracy);
  const bottomN = showAll ? sorted : sorted.slice(0, 10);

  if (bottomN.length > 0) {
    const header = showAll ? 'ALL COMPANIES (sorted by accuracy)' : 'LOWEST-ACCURACY COMPANIES (bottom 10)';
    lines.push(header);
    lines.push(`  ${'Ticker'.padEnd(8)} ${'Tier1%'.padStart(7)}  ${'Overall%'.padStart(9)}  ${'Years'.padStart(5)}  Top Failure`);

    for (const c of bottomN) {
      // Find top DIFF field for this company
      const companyResult = compared.find(cr => cr.ticker === c.ticker);
      const diffs = (companyResult?.results || []).filter(r => r.status === 'DIFF');
      const topField = diffs.length > 0 ? diffs[0].field : '-';

      lines.push(`  ${c.ticker.padEnd(8)} ${c.tier1Accuracy.toFixed(1).padStart(7)}  ${c.overallAccuracy.toFixed(1).padStart(9)}  ${String(c.yearsCompared).padStart(5)}  ${topField}`);
    }
    lines.push('');
  }

  // Skipped/failed companies
  if (skipped.length > 0) {
    lines.push(`Skipped (EUR): ${skipped.map(c => c.ticker).join(', ')}`);
  }
  if (failed.length > 0) {
    lines.push(`Failed: ${failed.map(c => c.ticker).join(', ')}`);
  }

  lines.push('');
  return lines.join('\n');
}

// ─── JSON Report ────────────────────────────────────────────

/**
 * Generate a structured JSON report for machine consumption.
 *
 * @param {Array} companyResults - Array of { ticker, status, yearsCompared, results }
 * @returns {object} Structured report object
 */
export function generateSP500JsonReport(companyResults) {
  const compared = companyResults.filter(c => c.status === 'OK');
  const skipped = companyResults.filter(c => c.status === 'SKIP_EUR');
  const failed = companyResults.filter(c => c.status === 'NO_DATA' || c.status === 'ENGINE_ERROR');

  // Aggregate tiered accuracy
  const agg = {
    tier1: { match: 0, compared: 0 },
    tier2: { match: 0, compared: 0 },
    tier3: { match: 0, compared: 0 },
    overall: { match: 0, compared: 0 },
  };

  const companies = [];

  for (const company of companyResults) {
    if (company.status !== 'OK') {
      companies.push({
        ticker: company.ticker,
        status: company.status,
        tier1Accuracy: null,
        tier2Accuracy: null,
        overallAccuracy: null,
        yearsCompared: 0,
        topFailures: [],
      });
      continue;
    }

    const tally = tallyTieredResults(company.results);

    agg.tier1.match += tally.tier1.match;
    agg.tier1.compared += tally.tier1.compared;
    agg.tier2.match += tally.tier2.match;
    agg.tier2.compared += tally.tier2.compared;
    agg.tier3.match += tally.tier3.match;
    agg.tier3.compared += tally.tier3.compared;
    agg.overall.match += tally.overall.match;
    agg.overall.compared += tally.overall.compared;

    // Top failures for this company (Tier 1 only)
    const tier1Diffs = company.results.filter(r => r.status === 'DIFF' && r.tier === 1);
    const failMap = {};
    for (const r of tier1Diffs) {
      if (!failMap[r.field]) failMap[r.field] = { field: r.field, count: 0 };
      failMap[r.field].count++;
    }
    const topFails = Object.values(failMap)
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
      .map(f => f.field);

    companies.push({
      ticker: company.ticker,
      status: company.status,
      tier1Accuracy: parseFloat(tally.tier1.accuracy.toFixed(1)),
      tier2Accuracy: parseFloat(tally.tier2.accuracy.toFixed(1)),
      overallAccuracy: parseFloat(tally.overall.accuracy.toFixed(1)),
      yearsCompared: company.yearsCompared,
      topFailures: topFails,
    });
  }

  function pct(m, c) {
    return c > 0 ? parseFloat(((m / c) * 100).toFixed(1)) : 0;
  }

  return {
    timestamp: new Date().toISOString(),
    summary: {
      totalCompanies: companyResults.length,
      compared: compared.length,
      skipped: skipped.length,
      failed: failed.length,
      tier1Accuracy: pct(agg.tier1.match, agg.tier1.compared),
      tier2Accuracy: pct(agg.tier2.match, agg.tier2.compared),
      tier3Accuracy: pct(agg.tier3.match, agg.tier3.compared),
      overallAccuracy: pct(agg.overall.match, agg.overall.compared),
    },
    topTier1Failures: getTopTier1Failures(companyResults, 15),
    companies: companies.sort((a, b) => (a.ticker || '').localeCompare(b.ticker || '')),
  };
}
