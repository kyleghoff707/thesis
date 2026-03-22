// ─── Company Name Formatting ─────────────────────────────────────
// Display-time normalization for raw SEC EDGAR company names.
// Handles: ALL CAPS → title case, /DE/ suffixes → stripped, mixed-case → normalized.
// Raw data is preserved — this is applied only at display time.

/**
 * Known acronyms/tickers that should remain fully uppercase.
 * Covers common company acronyms found in SEC EDGAR filings.
 */
const KEEP_UPPERCASE = new Set([
  // Company acronyms
  'IBM', 'AMD', 'CVS', 'UPS', 'NXP', 'ARM', 'SBA', 'EPR', 'ING',
  'YPF', 'ENI', 'BMO', 'BP', 'TD', 'UBS', 'SAP', 'HP', 'GE', 'GM',
  'AIG', 'ABB', 'BHP', 'CDW', 'AES', 'APA', 'FMC', 'PPG', 'PPL',
  'HCA', 'DTE', 'AEP', 'CME', 'ICE', 'CNA', 'BBB', 'BCC',
  'HSBC', 'PAMT', 'KOSS',
  // Compound with punctuation
  'AT&T',
  // Legal entity suffixes that stay uppercase
  'LLC', 'PLC', 'LP', 'SA', 'SE', 'NV', 'AG', 'REIT',
]);

/**
 * Prepositions/articles that should be lowercase (unless first word).
 */
const PREPOSITIONS = new Set([
  'of', 'the', 'and', 'for', 'in', 'on', 'at', 'or', 'by', 'to',
  'de', 'du', 'van', 'von', 'del', 'da',
]);

/**
 * Known suffix words that should be normalized to a specific casing.
 * Maps stripped uppercase letters → normalized form.
 */
const SUFFIX_NORMALIZE = {
  'INC': 'Inc', 'CORP': 'Corp', 'CO': 'Co', 'LTD': 'Ltd',
  'COMPANY': 'Company',
};

// ─── Helpers ────────────────────────────────────────────────────

/** Extract only letter characters (plus &) from a word */
function stripPunctuation(word) {
  return word.replace(/[^a-zA-Z&]/g, '');
}

/** Check if a word's letter content is ALL CAPS */
function isAllCaps(word) {
  const letters = word.replace(/[^a-zA-Z]/g, '');
  return letters.length > 0 && letters === letters.toUpperCase();
}

/** Title-case a single word, preserving internal punctuation */
function titleCaseWord(word) {
  return word.replace(/[a-zA-Z]+/g, (letters) =>
    letters.charAt(0).toUpperCase() + letters.slice(1).toLowerCase()
  );
}

/**
 * Normalize a known suffix word regardless of input casing.
 * Returns normalized form or null if not a known suffix.
 */
function normalizeSuffix(word) {
  const stripped = stripPunctuation(word).toUpperCase();
  const norm = SUFFIX_NORMALIZE[stripped];
  if (!norm) return null;
  // Preserve trailing punctuation (period, comma)
  const trailingPunct = word.match(/[.,]+$/)?.[0] || '';
  return norm + trailingPunct;
}

// ─── Main ───────────────────────────────────────────────────────

/**
 * Format a company name for display.
 * - Strips SEC EDGAR legal suffixes (/DE/, /NEW, /MA/, etc.)
 * - Converts ALL CAPS names to proper title case
 * - Preserves known acronyms (IBM, AMD, CVS, etc.)
 * - Normalizes common suffixes (INC→Inc, CORP→Corp, etc.)
 * - Lowercases prepositions (of, the, and) unless first word
 *
 * @param {string} name - Raw company name (e.g., "NVIDIA CORP", "BANK OF AMERICA CORP /DE/")
 * @returns {string} Formatted name (e.g., "Nvidia Corp", "Bank of America Corp")
 */
export function formatCompanyName(name) {
  if (!name || typeof name !== 'string') return '';

  // Step 1: Strip legal suffixes (/DE/, /NEW, /MA/, /CAN/, /UK, etc.)
  // Handles both with and without leading space, with and without trailing slash
  let cleaned = name.replace(/\s*\/[A-Za-z]+\/?\s*$/, '').trim();

  // Step 2: Determine if name needs full title-case conversion
  // Count what fraction of letter-containing words are ALL CAPS
  const words = cleaned.split(/\s+/);
  const letterWords = words.filter(w => /[a-zA-Z]/.test(w));
  const capsCount = letterWords.filter(w => isAllCaps(w)).length;
  const capsRatio = letterWords.length > 0 ? capsCount / letterWords.length : 0;
  const needsTitleCase = capsRatio >= 0.5;

  if (needsTitleCase) {
    // Full title-case conversion
    const result = words.map((word, i) => {
      // No letters → keep as-is (e.g., "&", numbers)
      if (!/[a-zA-Z]/.test(word)) return word;

      const stripped = stripPunctuation(word).toUpperCase();

      // Known acronym → keep uppercase
      if (KEEP_UPPERCASE.has(stripped)) return word.toUpperCase();

      // Known suffix → normalize
      const suffix = normalizeSuffix(word);
      if (suffix) return suffix;

      // Already mixed case (not ALL CAPS) → preserve existing casing
      // e.g., "TotalEnergies", "Corp", "Co" — these are already formatted
      if (!isAllCaps(word)) return word;

      // Preposition → lowercase (unless first word)
      const lower = stripPunctuation(word).toLowerCase();
      if (i > 0 && PREPOSITIONS.has(lower)) return lower;

      // Default → title-case
      return titleCaseWord(word);
    }).join(' ');

    return result;
  }

  // Not ALL CAPS — just normalize suffix words (CORP→Corp, INC→Inc, etc.)
  return words.map(word => {
    if (!/[a-zA-Z]/.test(word)) return word;

    // Only normalize ALL CAPS words that are known suffixes
    if (isAllCaps(word)) {
      const suffix = normalizeSuffix(word);
      if (suffix) return suffix;
    }

    return word;
  }).join(' ');
}
