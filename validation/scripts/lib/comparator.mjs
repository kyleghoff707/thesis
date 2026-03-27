/**
 * comparator.mjs — Field-level and company-level comparison with tolerance tiers
 *
 * Compares Morningstar fixture data against Thes1s XBRL engine output.
 * Uses 5-tier tolerance thresholds (exact/close/approximate/relaxed/informational)
 * with special handling for financial sector companies, spin-offs, and EUR companies.
 *
 * compareCompany takes specialHandlers as an explicit parameter (not hardcoded)
 * so intangibles/opIncome/accrued/taxRate handlers are injectable and testable.
 */

import { resolveYearOffset } from './fiscal-aligner.mjs';

// ─── Constants ───────────────────────────────────────────────

export const THRESHOLDS = {
  exact: 0.01,       // < 1% — scoring-critical fields
  close: 0.05,       // < 5% — important display fields
  approximate: 0.10, // < 10% — derived or definition-variable fields
  relaxed: 0.20,     // < 20% — financial-sector or structurally ambiguous fields
  informational: Infinity, // no fail — known-divergent or unmapped
};

export const FINANCIAL_SECTOR = new Set(['BRK-B', 'JPM', 'MET', 'WFC']);

export const SPIN_OFF = { EW: 2023, JNJ: 2023, T: 2022 };

export const EUR_COMPANIES = new Set(['RACE']);

/**
 * MS statement keys -> Engine statement keys
 */
const STMT_MAP = {
  income: 'income',
  balance_sheet: 'balance',
  cash_flow: 'cashFlow',
};

// ─── compareField ────────────────────────────────────────────

/**
 * Compare a single field value between MS and engine.
 *
 * @param {number} msValue - Raw MS value (before sign flip)
 * @param {number} thesisValue - Engine value (Thes1s convention)
 * @param {number} sign - Sign multiplier (1 or -1) to convert MS -> Thes1s convention
 * @param {string} tolerance - Tolerance tier name (exact/close/approximate/relaxed/informational)
 * @returns {{ status: string, pct: number, expected: number, actual: number }}
 */
export function compareField(msValue, thesisValue, sign, tolerance) {
  const expected = sign * msValue;
  const actual = thesisValue;

  // Both zero or both near-zero (abs < 1)
  if (Math.abs(expected) < 1 && Math.abs(actual) < 1) {
    return { status: 'MATCH', pct: 0, expected, actual };
  }

  // Expected zero, actual not
  if (expected === 0) {
    return {
      status: Math.abs(actual) < 1_000_000 ? 'MATCH' : 'DIFF',
      pct: Infinity,
      expected,
      actual,
    };
  }

  const pct = Math.abs((actual - expected) / expected);
  const threshold = THRESHOLDS[tolerance] || THRESHOLDS.close;

  let status;
  if (pct <= threshold) status = 'MATCH';
  else if (pct <= THRESHOLDS.close) status = 'CLOSE';
  else status = 'DIFF';

  return { status, pct, expected, actual };
}

// ─── compareCompany ──────────────────────────────────────────

/**
 * Compare all mapped fields between a Morningstar fixture and engine data
 * for a single company.
 *
 * @param {string} ticker - Company ticker
 * @param {object} fixture - MS fixture { fiscalYearEnd, statements: { income, balance_sheet, cash_flow } }
 * @param {object} engineData - Engine data { years, income, balance, cashFlow }
 * @param {object} fieldMapping - Parsed field-mapping.json
 * @param {object} [options] - Optional { specialHandlers: { intangibles_net, operating_income_reported, accrued_combined_skip, effective_tax_rate_scale } }
 * @returns {{ ticker: string, offset: number, results: Array }}
 */
export function compareCompany(ticker, fixture, engineData, fieldMapping, options = {}) {
  const results = [];
  const specialHandlers = options.specialHandlers || {};

  // Resolve FY offset using fiscal-aligner
  const offset = resolveYearOffset(fixture, engineData);

  for (const [msStmtKey, mappings] of Object.entries(fieldMapping)) {
    if (msStmtKey === '_meta') continue;

    const engineStmtKey = STMT_MAP[msStmtKey];
    if (!engineStmtKey) continue;

    for (const [msField, mapInfo] of Object.entries(mappings)) {
      if (!mapInfo.thesisField) continue; // Skip unmapped fields

      const msStmt = fixture.statements[msStmtKey] || {};
      const msYears = Object.keys(msStmt).filter(y => y !== 'TTM');

      for (const msYear of msYears) {
        const edgarYear = parseInt(msYear) + offset;
        let msValue = msStmt[msYear]?.[msField];

        // ─── Special field handlers (injected, not hardcoded) ───

        // Intangibles: compute NET from GROSS + AccumAmort
        if (msField === 'Intangibles other than Goodwill' && msValue != null && specialHandlers.intangibles_net) {
          msValue = specialHandlers.intangibles_net(msValue, msStmt[msYear] || {});
        }

        // Operating income: prefer Reported over Normalized
        if (msField === 'Total Operating Profit/Loss' && specialHandlers.operating_income_reported) {
          msValue = specialHandlers.operating_income_reported(msValue, msStmt[msYear] || {});
        }

        // Accrued liabilities: skip combined-only companies
        if (msField === 'Accrued Expenses, Current' && msValue != null && specialHandlers.accrued_combined_skip) {
          const adjusted = specialHandlers.accrued_combined_skip(msValue, msStmt);
          if (adjusted === 'SKIP') continue;
          msValue = adjusted;
        }

        // Skip if MS doesn't have this field for this year
        if (msValue == null) continue;

        // Effective tax rate: scale decimal to percentage
        if (mapInfo.thesisField === 'effective_tax_rate' && specialHandlers.effective_tax_rate_scale) {
          msValue = specialHandlers.effective_tax_rate_scale(msValue);
        }

        // Skip spin-off pre-spin years for affected companies
        if (SPIN_OFF[ticker] && edgarYear < SPIN_OFF[ticker]) {
          results.push({
            msField,
            thesisField: mapInfo.thesisField,
            statement: msStmtKey,
            msYear,
            edgarYear,
            status: 'SKIP_SPINOFF',
            tolerance: mapInfo.tolerance,
          });
          continue;
        }

        const engineStmt = engineData?.[engineStmtKey]?.[edgarYear];
        if (!engineStmt) {
          results.push({
            msField,
            thesisField: mapInfo.thesisField,
            statement: msStmtKey,
            msYear,
            edgarYear,
            status: 'MISSING_YEAR',
            tolerance: mapInfo.tolerance,
          });
          continue;
        }

        const thesisValue = engineStmt[mapInfo.thesisField];
        if (thesisValue == null) {
          results.push({
            msField,
            thesisField: mapInfo.thesisField,
            statement: msStmtKey,
            msYear,
            edgarYear,
            status: 'MISSING_FIELD',
            tolerance: mapInfo.tolerance,
          });
          continue;
        }

        // Compare with sign multiplier
        const comparison = compareField(
          msValue,
          thesisValue,
          mapInfo.sign,
          mapInfo.tolerance
        );

        // Relax tolerance for financial-sector companies on revenue and debt fields
        let effectiveTolerance = mapInfo.tolerance;
        if (FINANCIAL_SECTOR.has(ticker)) {
          if (['revenues', 'total_debt', 'net_debt'].includes(mapInfo.thesisField)) {
            effectiveTolerance = 'relaxed';
          }
        }

        results.push({
          msField,
          thesisField: mapInfo.thesisField,
          statement: msStmtKey,
          msYear,
          edgarYear,
          status: comparison.status,
          pct: comparison.pct,
          expected: comparison.expected,
          actual: comparison.actual,
          tolerance: effectiveTolerance,
        });
      }
    }
  }

  return { ticker, offset, results };
}
