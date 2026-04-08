/**
 * key-metrics-comparator.mjs -- Compare FMP pre-computed metrics against our keyMetrics.js output
 *
 * Maps FMP key-metrics + ratios fields to our engine's computed metrics,
 * applies scale factors and tolerance thresholds, and produces per-field comparison results.
 */

// ─── Field Mapping ──────────────────────────────────────────
// Maps FMP fields to our keyMetrics.js output paths.
// fmpSource: 'keyMetrics' or 'ratios' (from FMP cache)
// scale: multiply FMP value by this before comparing (e.g., FMP returns 0.46 for 46%)
// tolerance: max allowed pct diff (0.05 = 5%)

export const METRICS_MAP = [
  // Profitability — FMP ratios are decimal (0.46), ours are percentage (46.0)
  { fmpSource: 'ratios', fmpField: 'grossProfitMargin',    ourCategory: 'profitability', ourField: 'grossMargin',             scale: 100, tolerance: 0.05, tier: 'profitability' },
  { fmpSource: 'ratios', fmpField: 'operatingProfitMargin', ourCategory: 'profitability', ourField: 'operatingMargin',         scale: 100, tolerance: 0.05, tier: 'profitability' },
  { fmpSource: 'ratios', fmpField: 'netProfitMargin',       ourCategory: 'profitability', ourField: 'profitMarginContinuing',  scale: 100, tolerance: 0.05, tier: 'profitability' },
  { fmpSource: 'ratios', fmpField: 'ebitMargin',            ourCategory: 'profitability', ourField: 'ebitMargin',              scale: 100, tolerance: 0.05, tier: 'profitability' },
  { fmpSource: 'ratios', fmpField: 'ebitdaMargin',          ourCategory: 'profitability', ourField: 'ebitdaMargin',            scale: 100, tolerance: 0.05, tier: 'profitability' },
  { fmpSource: 'keyMetrics', fmpField: 'returnOnEquity',    ourCategory: 'profitability', ourField: 'roe',                     scale: 100, tolerance: 0.05, tier: 'profitability' },
  { fmpSource: 'keyMetrics', fmpField: 'returnOnAssets',    ourCategory: 'profitability', ourField: 'roa',                     scale: 100, tolerance: 0.05, tier: 'profitability' },

  // Liquidity — 1:1 scale
  { fmpSource: 'ratios', fmpField: 'currentRatio',          ourCategory: 'liquidity', ourField: 'currentRatio',               scale: 1, tolerance: 0.05, tier: 'liquidity' },
  { fmpSource: 'ratios', fmpField: 'quickRatio',            ourCategory: 'liquidity', ourField: 'quickRatio',                 scale: 1, tolerance: 0.05, tier: 'liquidity' },
  { fmpSource: 'ratios', fmpField: 'cashRatio',             ourCategory: 'liquidity', ourField: 'cashRatio',                  scale: 1, tolerance: 0.05, tier: 'liquidity' },

  // Operating — 10% tolerance (sensitive to classification diffs)
  { fmpSource: 'ratios', fmpField: 'assetTurnover',         ourCategory: 'operating', ourField: 'assetTurnover',              scale: 1, tolerance: 0.10, tier: 'operating' },
  { fmpSource: 'ratios', fmpField: 'fixedAssetTurnover',    ourCategory: 'operating', ourField: 'fixedAssetTurnover',         scale: 1, tolerance: 0.10, tier: 'operating' },
  { fmpSource: 'ratios', fmpField: 'receivablesTurnover',   ourCategory: 'operating', ourField: 'receivableTurnover',         scale: 1, tolerance: 0.10, tier: 'operating' },
  { fmpSource: 'ratios', fmpField: 'inventoryTurnover',     ourCategory: 'operating', ourField: 'inventoryTurnover',          scale: 1, tolerance: 0.10, tier: 'operating' },
  { fmpSource: 'ratios', fmpField: 'payablesTurnover',      ourCategory: 'operating', ourField: 'payableTurnover',            scale: 1, tolerance: 0.10, tier: 'operating' },

  // Per Share — 3% tolerance
  { fmpSource: 'ratios', fmpField: 'revenuePerShare',       ourCategory: 'perShare', ourField: 'salesPerShare',               scale: 1, tolerance: 0.03, tier: 'perShare' },
  { fmpSource: 'ratios', fmpField: 'bookValuePerShare',     ourCategory: 'perShare', ourField: 'bookValuePerShare',           scale: 1, tolerance: 0.03, tier: 'perShare' },
  { fmpSource: 'ratios', fmpField: 'operatingCashFlowPerShare', ourCategory: 'perShare', ourField: 'operatingCFPerShare',     scale: 1, tolerance: 0.03, tier: 'perShare' },
  { fmpSource: 'ratios', fmpField: 'dividendPayoutRatio',   ourCategory: 'perShare', ourField: 'payoutRatio',                 scale: 1, tolerance: 0.05, tier: 'perShare' },

  // Debt — 15% tolerance (known classification diffs)
  { fmpSource: 'ratios', fmpField: 'debtToEquityRatio',     ourCategory: 'debtRatios', ourField: 'ltDebtToEquity',            scale: 1, tolerance: 0.15, tier: 'debt', note: 'FMP total debt vs our LT debt' },
  { fmpSource: 'ratios', fmpField: 'interestCoverageRatio', ourCategory: 'liquidity', ourField: 'timesInterestEarned',        scale: 1, tolerance: 0.15, tier: 'debt', note: 'EBIT vs operating income diff' },

  // Key metrics extras
  { fmpSource: 'keyMetrics', fmpField: 'currentRatio',      ourCategory: 'liquidity', ourField: 'currentRatio',               scale: 1, tolerance: 0.05, tier: 'liquidity', skip: true }, // duplicate, prefer ratios
  { fmpSource: 'keyMetrics', fmpField: 'cashConversionCycle', ourCategory: 'operating', ourField: 'cashConversionCycle',       scale: 1, tolerance: 0.10, tier: 'operating' },
  { fmpSource: 'keyMetrics', fmpField: 'incomeQuality',     ourCategory: 'operating', ourField: 'opCFToNetIncome',            scale: 1, tolerance: 0.05, tier: 'operating' },
  { fmpSource: 'keyMetrics', fmpField: 'workingCapital',    ourCategory: 'liquidity', ourField: 'workingCapital',             scale: 1, tolerance: 0.03, tier: 'liquidity' },
].filter(m => !m.skip);

// ─── Comparison ─────────────────────────────────────────────

/**
 * Compare FMP pre-computed metrics against our engine's computed metrics.
 *
 * @param {string} ticker
 * @param {object} fmpMetrics - { keyMetrics: { year: {...} }, ratios: { year: {...} } }
 * @param {object} engineMetrics - Output of computeKeyMetrics(): { years, metrics: { year: { cat: { field: val } } } }
 * @returns {{ ticker, comparisons, summary }}
 */
export function compareKeyMetrics(ticker, fmpMetrics, engineMetrics) {
  const comparisons = [];

  if (!fmpMetrics || !engineMetrics) {
    return { ticker, comparisons, summary: { total: 0, match: 0, diff: 0, skip: 0 } };
  }

  // Find overlapping years
  const fmpYears = new Set([
    ...Object.keys(fmpMetrics.keyMetrics || {}),
    ...Object.keys(fmpMetrics.ratios || {}),
  ]);
  const engineYears = new Set(engineMetrics.years.map(String));
  const overlap = [...fmpYears].filter(y => engineYears.has(y)).sort();

  for (const year of overlap) {
    for (const mapping of METRICS_MAP) {
      const fmpData = fmpMetrics[mapping.fmpSource]?.[year];
      const fmpRaw = fmpData?.[mapping.fmpField];
      const engineVal = engineMetrics.metrics[Number(year)]?.[mapping.ourCategory]?.[mapping.ourField];

      // Skip if either side is null/undefined
      if (fmpRaw == null || engineVal == null) {
        comparisons.push({
          year: Number(year),
          fmpField: mapping.fmpField,
          ourField: mapping.ourField,
          tier: mapping.tier,
          fmpValue: fmpRaw ?? null,
          engineValue: engineVal ?? null,
          status: 'SKIP',
          pctDiff: null,
          tolerance: mapping.tolerance,
          note: mapping.note || null,
        });
        continue;
      }

      const fmpScaled = fmpRaw * mapping.scale;

      // Compute percentage difference
      let pctDiff;
      if (Math.abs(fmpScaled) < 0.001 && Math.abs(engineVal) < 0.001) {
        pctDiff = 0;
      } else if (Math.abs(fmpScaled) < 0.001) {
        pctDiff = Math.abs(engineVal) > 1 ? 1 : 0; // FMP ~0, we have a value
      } else {
        pctDiff = Math.abs(engineVal - fmpScaled) / Math.abs(fmpScaled);
      }

      const status = pctDiff <= mapping.tolerance ? 'MATCH' : 'DIFF';

      comparisons.push({
        year: Number(year),
        fmpField: mapping.fmpField,
        ourField: mapping.ourField,
        tier: mapping.tier,
        fmpValue: fmpScaled,
        engineValue: engineVal,
        status,
        pctDiff,
        tolerance: mapping.tolerance,
        note: mapping.note || null,
      });
    }
  }

  const match = comparisons.filter(c => c.status === 'MATCH').length;
  const diff = comparisons.filter(c => c.status === 'DIFF').length;
  const skip = comparisons.filter(c => c.status === 'SKIP').length;
  const total = comparisons.length;
  const comparable = match + diff;
  const accuracy = comparable > 0 ? (match / comparable * 100) : null;

  return {
    ticker,
    comparisons,
    summary: { total, match, diff, skip, accuracy },
  };
}
