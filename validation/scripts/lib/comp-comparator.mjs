/**
 * comp-comparator.mjs — Compare FMP compensation data against our engine output
 *
 * Name matching strategy:
 *   1. Exact match on normalized last name + first initial
 *   2. Fuzzy match: last name matches, first name starts with same 3+ chars
 *   3. No match: record as MISSING_IN_ENGINE
 *
 * Field comparison uses 10% tolerance for total, 5% for individual fields.
 */

// ─── Name Normalization ─────────────────────────────────────

/**
 * Normalize a name for matching: lowercase, strip suffixes/prefixes, extract last name + first name.
 */
function normalizeName(name) {
  if (!name) return { first: '', last: '', full: '' };

  let cleaned = name
    .replace(/\b(jr|sr|ii|iii|iv|md|phd|esq|cpa)\b\.?/gi, '')
    .replace(/[.,]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  const parts = cleaned.split(' ').filter(Boolean);
  if (parts.length === 0) return { first: '', last: '', full: '' };

  return {
    first: parts[0],
    last: parts[parts.length - 1],
    full: cleaned,
  };
}

/**
 * Try to match an FMP executive name against an engine executive name.
 * Returns match confidence: 'exact', 'fuzzy', or null.
 */
function matchNames(fmpName, engineName) {
  const fmp = normalizeName(fmpName);
  const eng = normalizeName(engineName);

  if (!fmp.last || !eng.last) return null;

  // Last names must match
  if (fmp.last !== eng.last) return null;

  // Exact: first initial matches
  if (fmp.first && eng.first && fmp.first[0] === eng.first[0]) {
    // If first names share 3+ leading chars, it's a strong match
    if (fmp.first.length >= 3 && eng.first.length >= 3 &&
        fmp.first.slice(0, 3) === eng.first.slice(0, 3)) {
      return 'exact';
    }
    // First initial match only
    return 'fuzzy';
  }

  return null;
}

// ─── Field Comparison ───────────────────────────────────────

const COMP_FIELDS = [
  { fmpField: 'salary', engineField: 'salary', tolerance: 0.05 },
  { fmpField: 'bonus', engineField: 'bonus', tolerance: 0.05 },
  { fmpField: 'stockAward', engineField: 'stockAwards', tolerance: 0.05 },
  { fmpField: 'optionAward', engineField: 'optionAwards', tolerance: 0.05 },
  { fmpField: 'total', engineField: 'total', tolerance: 0.10 },
];

function compareField(fmpVal, engVal, tolerance) {
  if (fmpVal == null && engVal == null) return { status: 'BOTH_NULL' };
  if (fmpVal == null) return { status: 'MISSING_FMP', pct: null };
  // FMP 0 vs engine null = match (engine doesn't store zero-value comp items)
  if (engVal == null && fmpVal === 0) return { status: 'MATCH', pct: 0 };
  if (engVal == null) return { status: 'MISSING_ENGINE', pct: null };

  // Both zero
  if (fmpVal === 0 && engVal === 0) return { status: 'MATCH', pct: 0 };

  const denom = Math.max(Math.abs(fmpVal), Math.abs(engVal), 1);
  const pct = Math.abs(fmpVal - engVal) / denom;

  if (pct <= tolerance) return { status: 'MATCH', pct: Math.round(pct * 1000) / 10 };
  return { status: 'DIFF', pct: Math.round(pct * 1000) / 10 };
}

// ─── Main Comparator ────────────────────────────────────────

/**
 * Compare FMP compensation data against engine compensation data.
 *
 * @param {string} ticker
 * @param {Array} fmpRecords - From fmp-comp-collector: [{ name, title, year, salary, ... }]
 * @param {object} engineData - From fetchCompensation: { executives: [{ name, title, compensation: { year: { salary, ... } } }] }
 * @returns {{ ticker, status, matched, missing, extra, execMatches, fieldResults }}
 */
export function compareCompensation(ticker, fmpRecords, engineData) {
  if (!fmpRecords || fmpRecords.length === 0) {
    return { ticker, status: 'NO_FMP_DATA', matched: 0, missing: 0, extra: 0, execMatches: [], fieldResults: [] };
  }
  if (!engineData || !engineData.executives || engineData.executives.length === 0) {
    return { ticker, status: 'NO_ENGINE_DATA', matched: 0, missing: fmpRecords.length, extra: 0, execMatches: [], fieldResults: [] };
  }

  const engineExecs = engineData.executives;
  const fieldResults = [];
  const execMatches = [];
  const matchedEngineIndices = new Set();

  // Group FMP records by executive name
  const fmpByExec = {};
  for (const rec of fmpRecords) {
    const key = normalizeName(rec.name).full;
    if (!key) continue;
    if (!fmpByExec[key]) fmpByExec[key] = { name: rec.name, records: [] };
    fmpByExec[key].records.push(rec);
  }

  // Match each FMP executive to an engine executive
  for (const [fmpKey, fmpExec] of Object.entries(fmpByExec)) {
    let bestMatch = null;
    let bestConfidence = null;
    let bestIdx = -1;

    for (let i = 0; i < engineExecs.length; i++) {
      if (matchedEngineIndices.has(i)) continue;
      const confidence = matchNames(fmpExec.name, engineExecs[i].name);
      if (confidence === 'exact') {
        bestMatch = engineExecs[i];
        bestConfidence = confidence;
        bestIdx = i;
        break;
      }
      if (confidence === 'fuzzy' && !bestMatch) {
        bestMatch = engineExecs[i];
        bestConfidence = confidence;
        bestIdx = i;
      }
    }

    if (bestMatch && bestIdx >= 0) {
      matchedEngineIndices.add(bestIdx);
      execMatches.push({
        fmpName: fmpExec.name,
        engineName: bestMatch.name,
        confidence: bestConfidence,
      });

      // Compare fields per year
      for (const fmpRec of fmpExec.records) {
        const year = fmpRec.year;
        const engineComp = bestMatch.compensation?.[year];

        if (!engineComp) {
          // Engine doesn't have this year
          for (const { fmpField, engineField } of COMP_FIELDS) {
            if (fmpRec[fmpField] != null) {
              fieldResults.push({
                exec: fmpExec.name,
                year,
                field: engineField,
                fmpValue: fmpRec[fmpField],
                engineValue: null,
                status: 'MISSING_YEAR',
                pct: null,
              });
            }
          }
          continue;
        }

        for (const { fmpField, engineField, tolerance } of COMP_FIELDS) {
          const result = compareField(fmpRec[fmpField], engineComp[engineField], tolerance);
          if (result.status === 'BOTH_NULL') continue;

          fieldResults.push({
            exec: fmpExec.name,
            year,
            field: engineField,
            fmpValue: fmpRec[fmpField],
            engineValue: engineComp[engineField],
            status: result.status,
            pct: result.pct,
          });
        }
      }
    } else {
      execMatches.push({
        fmpName: fmpExec.name,
        engineName: null,
        confidence: null,
      });
    }
  }

  const matched = execMatches.filter(m => m.engineName != null).length;
  const missing = execMatches.filter(m => m.engineName == null).length;
  const extra = engineExecs.length - matchedEngineIndices.size;

  return {
    ticker,
    status: 'OK',
    matched,
    missing,
    extra,
    execMatches,
    fieldResults,
  };
}

// ─── Exports for testing ────────────────────────────────────
export const _testExports = { normalizeName, matchNames, compareField };
