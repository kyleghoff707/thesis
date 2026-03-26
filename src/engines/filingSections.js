// Filing Section Extraction Engine
// Extracts specific sections from 10-K/10-Q markdown text using regex-based
// header detection. SEC filings have standardized Item headers (Item 1, 1A, 7, etc.)
// that become markdown headings via filingMarkdown.js.
//
// Usage: extractSection(markdown, 'Risk Factors') returns just that section.
// Falls back to fuzzy regex matching for non-standard section names.

// ─── Section Header Patterns ────────────────────────────────────

export const SECTION_MAP = {
  'Business': /^(?:#{1,3}\s*)?Item\s*1[.:\s]\s*Business/im,
  'Risk Factors': /^(?:#{1,3}\s*)?Item\s*1A[.:\s]\s*Risk\s*Factors/im,
  'MD&A': /^(?:#{1,3}\s*)?Item\s*7[.:\s]\s*Management[''\u2019]?s?\s*Discussion/im,
  'Financial Statements': /^(?:#{1,3}\s*)?Item\s*8[.:\s]\s*Financial\s*Statements/im,
  'Controls': /^(?:#{1,3}\s*)?Item\s*9A[.:\s]\s*Controls/im,
  'Properties': /^(?:#{1,3}\s*)?Item\s*2[.:\s]\s*Properties/im,
  'Legal': /^(?:#{1,3}\s*)?Item\s*3[.:\s]\s*Legal/im,
  'Executive Compensation': /^(?:#{1,3}\s*)?Item\s*11[.:\s]\s*Executive\s*Comp/im,
  'Market Risk': /^(?:#{1,3}\s*)?Item\s*7A[.:\s]\s*Quantitative.*Market\s*Risk/im,
};

// ─── Section Extraction ─────────────────────────────────────────

/**
 * Extract a specific section from SEC filing markdown.
 * Looks up sectionName in SECTION_MAP first, then falls back to fuzzy regex.
 * Returns the section text between the matched header and the next header
 * at the same or higher level.
 *
 * @param {string} markdown - Full filing markdown text
 * @param {string} sectionName - Section to extract (e.g., 'Risk Factors', 'MD&A')
 * @returns {string|null} Section text, or null if not found / too short
 */
export function extractSection(markdown, sectionName) {
  if (!markdown || !sectionName) return null;

  // Find the matching regex — check SECTION_MAP first (case-insensitive key lookup)
  let pattern = null;
  const lowerName = sectionName.toLowerCase();
  for (const [key, regex] of Object.entries(SECTION_MAP)) {
    if (key.toLowerCase() === lowerName) {
      pattern = regex;
      break;
    }
  }

  // Fuzzy fallback: build regex from the section name
  if (!pattern) {
    try {
      const escaped = sectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      pattern = new RegExp('^(?:#{1,3}\\s*)?(?:Item\\s*\\w+[.:\\s]\\s*)?' + escaped.replace(/\s+/g, '\\s+'), 'im');
    } catch {
      return null;
    }
  }

  // Find the start position
  const match = markdown.match(pattern);
  if (!match) return null;

  const startIdx = match.index;

  // Determine the heading level of the matched header
  const headerLine = markdown.substring(startIdx).split('\n')[0];
  const headingMatch = headerLine.match(/^(#{1,6})/);
  const headingLevel = headingMatch ? headingMatch[1].length : 0;

  // Find the next section boundary
  const afterHeader = markdown.substring(startIdx + headerLine.length);
  let nextHeaderPattern;
  if (headingLevel > 0) {
    // Heading-formatted: find next heading at same or higher level
    nextHeaderPattern = new RegExp(`^#{1,${headingLevel}}\\s+\\S`, 'm');
  } else {
    // Plain-text Item line: find next Item N pattern (same format)
    nextHeaderPattern = /^Item\s+\d+[A-Z]?[.:\s]/im;
  }
  const nextMatch = afterHeader.match(nextHeaderPattern);

  let endIdx;
  if (nextMatch) {
    endIdx = startIdx + headerLine.length + nextMatch.index;
  } else {
    endIdx = markdown.length;
  }

  const section = markdown.substring(startIdx, endIdx).trim();

  // Guard: very short sections are likely false header matches
  if (section.length < 100) return null;

  return section;
}

/**
 * Extract all known sections from SEC filing markdown.
 * Iterates over SECTION_MAP, extracts each section, omits nulls.
 *
 * @param {string} markdown - Full filing markdown text
 * @returns {Object} Map of section name to content (null values omitted)
 */
export function extractAllSections(markdown) {
  if (!markdown) return {};

  const result = {};
  for (const key of Object.keys(SECTION_MAP)) {
    const section = extractSection(markdown, key);
    if (section != null) {
      result[key] = section;
    }
  }
  return result;
}
