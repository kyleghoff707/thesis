// Filing Section Extraction Engine
// Extracts specific sections from 10-K/10-Q markdown text using regex-based
// header detection. SEC filings have standardized Item headers (Item 1, 1A, 7, etc.)
// that become markdown headings via filingMarkdown.js.
//
// Usage: extractSection(markdown, 'Risk Factors') returns just that section.
// Falls back to fuzzy regex matching for non-standard section names.

// ─── Section Header Patterns ────────────────────────────────────

// Item separator pattern — matches period, colon, whitespace, em-dash, en-dash, hyphen
// Some filers use "Item 1." others "Item 1—" (Costco), "Item 1:" (Costco TOC),
// or "ITEM 7 - MANAGEMENT'S DISCUSSION" (Intuit, space before dash) etc.
const SEP = '\\s*[.:\\-\\u2013\\u2014][.:|\\s\\-\\u2013\\u2014]*';

// Leading pipe for markdown-table-wrapped item headers, e.g. `| Item 1. Business |`
const LEAD = `^(?:\\|\\s*)?(?:#{1,3}\\s*)?`;

// 10-K focused map: 4 sections the pipeline uses for annual filings
export const SECTION_MAP_10K = {
  'Business': new RegExp(`${LEAD}Item\\s*1${SEP}\\s*Business`, 'im'),
  'Risk Factors': new RegExp(`${LEAD}Item\\s*1A${SEP}\\s*Risk\\s*Factors`, 'im'),
  'MD&A': new RegExp(`${LEAD}Item\\s*7${SEP}\\s*Management[''\\u2019]?s?\\s*Discussion`, 'im'),
  'Financial Statements': new RegExp(`${LEAD}Item\\s*8${SEP}\\s*Financial\\s*Statements`, 'im'),
};

// 10-Q focused map: 3 sections with 10-Q item numbers
// Item 1 = Financial Statements (not Business), Item 2 = MD&A (not Properties)
export const SECTION_MAP_10Q = {
  'Financial Statements': new RegExp(`${LEAD}Item\\s*1${SEP}\\s*Financial\\s*Statements`, 'im'),
  'MD&A': new RegExp(`${LEAD}Item\\s*2${SEP}\\s*Management[''\\u2019]?s?\\s*Discussion`, 'im'),
  'Risk Factors': new RegExp(`${LEAD}Item\\s*1A${SEP}\\s*Risk\\s*Factors`, 'im'),
};

// Backward-compatible full map — includes all legacy sections (10-K items)
export const SECTION_MAP = {
  'Business': new RegExp(`${LEAD}Item\\s*1${SEP}\\s*Business`, 'im'),
  'Risk Factors': new RegExp(`${LEAD}Item\\s*1A${SEP}\\s*Risk\\s*Factors`, 'im'),
  'MD&A': new RegExp(`${LEAD}Item\\s*7${SEP}\\s*Management[''\\u2019]?s?\\s*Discussion`, 'im'),
  'Financial Statements': new RegExp(`${LEAD}Item\\s*8${SEP}\\s*Financial\\s*Statements`, 'im'),
  'Controls': new RegExp(`${LEAD}Item\\s*9A${SEP}\\s*Controls`, 'im'),
  'Properties': new RegExp(`${LEAD}Item\\s*2${SEP}\\s*Properties`, 'im'),
  'Legal': new RegExp(`${LEAD}Item\\s*3${SEP}\\s*Legal`, 'im'),
  'Executive Compensation': new RegExp(`${LEAD}Item\\s*11${SEP}\\s*Executive\\s*Comp`, 'im'),
  'Market Risk': new RegExp(`${LEAD}Item\\s*7A${SEP}\\s*Quantitative.*Market\\s*Risk`, 'im'),
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
 * @param {Object} [sectionMap=SECTION_MAP] - Section map to use for lookup
 * @returns {string|null} Section text, or null if not found / too short
 */
export function extractSection(markdown, sectionName, sectionMap = SECTION_MAP) {
  if (!markdown || !sectionName) return null;

  // Find the matching regex — check sectionMap first (case-insensitive key lookup)
  let pattern = null;
  const lowerName = sectionName.toLowerCase();
  for (const [key, regex] of Object.entries(sectionMap)) {
    if (key.toLowerCase() === lowerName) {
      pattern = regex;
      break;
    }
  }

  // Fuzzy fallback: build regex from the section name
  if (!pattern) {
    try {
      const escaped = sectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      pattern = new RegExp('^(?:#{1,3}\\s*)?(?:Item\\s*\\w+[.:\\s\\-\\u2013\\u2014]\\s*)?' + escaped.replace(/\s+/g, '\\s+'), 'im');
    } catch {
      return null;
    }
  }

  // Find ALL candidate start positions (TOC entries often match before the body).
  // Iterate from latest to earliest so we prefer the body header; fall back to
  // the longest extracted section if needed.
  const globalPattern = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
  const starts = [];
  let gm;
  while ((gm = globalPattern.exec(markdown)) !== null) {
    starts.push(gm.index);
    if (gm.index === globalPattern.lastIndex) globalPattern.lastIndex++;
  }
  if (starts.length === 0) return null;

  const TOC_THRESHOLD = 1000;
  let best = null;
  // Prefer later matches (body > TOC). First section whose extraction is substantial wins.
  for (let i = starts.length - 1; i >= 0; i--) {
    const startIdx = starts[i];
    const headerLine = markdown.substring(startIdx).split('\n')[0];
    const headingMatch = headerLine.match(/^(#{1,6})/);
    const headingLevel = headingMatch ? headingMatch[1].length : 0;

    const afterHeader = markdown.substring(startIdx + headerLine.length);
    let nextHeaderPattern;
    if (headingLevel > 0) {
      nextHeaderPattern = new RegExp(`^#{1,${headingLevel}}\\s+\\S`, 'm');
    } else {
      nextHeaderPattern = /^(?:\|\s*)?Item\s+\d+[A-Z]?[.:\s|]/im;
    }
    const nextMatch = afterHeader.match(nextHeaderPattern);
    const endIdx = nextMatch ? startIdx + headerLine.length + nextMatch.index : markdown.length;
    const section = markdown.substring(startIdx, endIdx).trim();

    if (section.length >= TOC_THRESHOLD) return section;
    if (!best || section.length > best.length) best = section;
  }

  if (!best || best.length < 100) return null;
  return best;
}

/**
 * Extract all known sections from SEC filing markdown.
 * Uses form-specific section map (10-K vs 10-Q) to avoid item number collisions.
 *
 * @param {string} markdown - Full filing markdown text
 * @param {string} [formType='10-K'] - Filing form type ('10-K' or '10-Q')
 * @returns {Object} Map of section name to content (null values omitted)
 */
export function extractAllSections(markdown, formType = '10-K') {
  if (!markdown) return {};

  const map = formType === '10-Q' ? SECTION_MAP_10Q : SECTION_MAP_10K;
  const result = {};
  for (const key of Object.keys(map)) {
    const section = extractSection(markdown, key, map);
    if (section != null) {
      result[key] = section;
    }
  }
  return result;
}
