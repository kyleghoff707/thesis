/**
 * fiscal-aligner.mjs — Fiscal year alignment for financial data comparison
 *
 * Resolves the year offset between Morningstar fixture labels and XBRL engine
 * labels. Uses fiscalYearEnd metadata as the primary resolver, with revenue
 * matching as validation.
 *
 * Key insight: For Jan/Feb FY-end companies, the fixture parser shifted year
 * labels to EDGAR's fiscal-year convention (FY ending Jan 2023 = "2022").
 * The engine now uses calendar-year convention (Jan 2023 = "2023").
 * So offset = +1 is expected for these companies.
 */

const MONTH_NAMES = {
  Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
  Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
};

/**
 * Parse a fiscal year end string like "Sep 30" into structured data.
 * Returns { month: "Dec", monthNum: 12 } for null/undefined/empty.
 *
 * @param {string|null|undefined} fyEndStr - e.g. "Sep 30", "Jan 31"
 * @returns {{ month: string, monthNum: number }}
 */
export function parseFiscalYearEnd(fyEndStr) {
  if (!fyEndStr || typeof fyEndStr !== 'string' || fyEndStr.trim() === '') {
    return { month: 'Dec', monthNum: 12 };
  }

  const parts = fyEndStr.trim().split(/\s+/);
  const monthStr = parts[0];
  const monthNum = MONTH_NAMES[monthStr];

  if (!monthNum) {
    return { month: 'Dec', monthNum: 12 };
  }

  return { month: monthStr, monthNum };
}

/**
 * Resolve the year offset between MS fixture labels and engine labels.
 *
 * Strategy:
 *   1. Parse fiscalYearEnd from the fixture to determine FY month
 *   2. For Jan/Feb FY ends, the metadata-predicted offset is +1
 *      (fixture shifted years back, engine uses calendar year)
 *   3. Validate using revenue matching: compare overlapping years
 *   4. If validation fails, fall back to brute-force revenue matching
 *      with bias toward offset 0
 *
 * @param {object} msFixture - Morningstar fixture { fiscalYearEnd, statements: { income: { year: { "Total Revenue": val } } } }
 * @param {object} engineData - Engine data { years: number[], income: { year: { revenues: val } } }
 * @returns {number} Year offset to add to MS year to get engine year
 */
export function resolveYearOffset(msFixture, engineData) {
  if (!msFixture || !engineData) return 0;

  const msIncome = msFixture.statements?.income;
  const engineIncome = engineData?.income;
  if (!msIncome || !engineIncome) return 0;

  const msYears = Object.keys(msIncome).filter(y => y !== 'TTM').map(Number);
  const engineYears = engineData.years || Object.keys(engineIncome).map(Number);
  if (msYears.length === 0 || engineYears.length === 0) return 0;

  // Step 1: Determine predicted offset from fiscal year end metadata
  const { monthNum } = parseFiscalYearEnd(msFixture.fiscalYearEnd);
  // Jan/Feb FY companies have their fixture years shifted back by 1
  const predictedOffset = (monthNum <= 2) ? 1 : 0;

  // Step 2: Validate predicted offset using revenue matching
  const validationResult = validateOffset(msIncome, engineIncome, msYears, predictedOffset);

  if (validationResult.matchRate >= 0.5 && validationResult.matches >= 1) {
    return predictedOffset;
  }

  // Step 3: Fallback — brute-force revenue matching with bias toward 0
  return bruteForceBestOffset(msIncome, engineIncome, msYears);
}

/**
 * Validate an offset by checking revenue agreement.
 * @returns {{ matches: number, compared: number, matchRate: number }}
 */
function validateOffset(msIncome, engineIncome, msYears, offset) {
  let matches = 0;
  let compared = 0;

  for (const msYear of msYears) {
    const engineYear = msYear + offset;
    const msRev = msIncome[String(msYear)]?.['Total Revenue'];
    const engRev = engineIncome[engineYear]?.revenues;

    if (msRev != null && engRev != null) {
      compared++;
      const pct = Math.abs((engRev - msRev) / msRev);
      if (pct < 0.02) matches++;
    }
  }

  return {
    matches,
    compared,
    matchRate: compared > 0 ? matches / compared : 0,
  };
}

/**
 * Brute-force best offset from [0, -1, 1] using revenue matching.
 * Biased toward 0 — only uses non-zero if strictly better with >= 3 matches.
 */
function bruteForceBestOffset(msIncome, engineIncome, msYears) {
  const scores = {};

  for (const offset of [0, -1, 1]) {
    let matches = 0;
    let compared = 0;

    for (const msYear of msYears) {
      const engineYear = msYear + offset;
      const msRev = msIncome[String(msYear)]?.['Total Revenue'];
      const engRev = engineIncome[engineYear]?.revenues;

      if (msRev != null && engRev != null) {
        compared++;
        const pct = Math.abs((engRev - msRev) / msRev);
        if (pct < 0.02) matches++;
      }
    }

    scores[offset] = { matches, compared };
  }

  // Bias toward 0: only use non-zero if it has strictly more matches AND at least 3
  const best = [0, -1, 1].reduce((a, b) =>
    scores[a].matches >= scores[b].matches ? a : b
  );

  if (best !== 0 && scores[best].matches > scores[0].matches && scores[best].matches >= 3) {
    return best;
  }

  return 0;
}
