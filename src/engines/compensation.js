// Executive Compensation Engine — fetches and parses SEC DEF 14A proxy statements
// Extracts Summary Compensation Table (Item 402 of Reg S-K) and Director Compensation.
// Free, no API key needed. Same EDGAR infrastructure as insiders.js.

import { cacheGetAsync, cacheSet } from './cache';
import { fetchFilings, lookupCIK } from './edgar';

// ─── SEC URL helpers (same proxy pattern as insiders.js / filingMarkdown.js) ──
const IS_DEV = import.meta.env.DEV;

function filingHtmlUrl(cik, accessionNumber, primaryDocument) {
  const cleanCik = String(cik).replace(/^0+/, '');
  const accPath = accessionNumber.replace(/-/g, '');
  const base = IS_DEV ? '/api/sec' : 'https://www.sec.gov';
  return `${base}/Archives/edgar/data/${cleanCik}/${accPath}/${primaryDocument}`;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Constants ──────────────────────────────────────────────

const COMP_CACHE_V = 'v2';
const FETCH_DELAY_MS = 120;

// SEC-mandated Summary Compensation Table column headers (Item 402)
// Normalized to lowercase for fuzzy matching
const EXEC_COLUMN_PATTERNS = [
  { key: 'name', patterns: ['name'] },
  { key: 'year', patterns: ['year', 'fiscal year'] },
  { key: 'salary', patterns: ['salary', 'base sal'] },
  { key: 'bonus', patterns: ['bonus'] },
  { key: 'stockAwards', patterns: ['stock award'] },
  { key: 'optionAwards', patterns: ['option award'] },
  { key: 'nonEquityIncentive', patterns: ['non-equity', 'non equity', 'incentive plan'] },
  { key: 'pensionChange', patterns: ['change in pension', 'pension value', 'nonqualified deferred', 'nqdc'] },
  { key: 'otherComp', patterns: ['all other', 'other comp'] },
  { key: 'total', patterns: ['total'] },
];

// Director Compensation Table column headers
const DIRECTOR_COLUMN_PATTERNS = [
  { key: 'name', patterns: ['name'] },
  { key: 'feesEarned', patterns: ['fees earned', 'fees paid', 'retainer'] },
  { key: 'stockAwards', patterns: ['stock award'] },
  { key: 'optionAwards', patterns: ['option award'] },
  { key: 'nonEquityIncentive', patterns: ['non-equity', 'non equity', 'incentive plan'] },
  { key: 'pensionChange', patterns: ['change in pension', 'pension value'] },
  { key: 'otherComp', patterns: ['all other', 'other comp'] },
  { key: 'total', patterns: ['total'] },
];

// Title keywords — used to distinguish executive titles from names
const TITLE_KEYWORDS = [
  'officer', 'president', 'chief', 'director', 'vice', 'executive',
  'secretary', 'treasurer', 'counsel', 'chairman', 'chairwoman',
  'manager', 'partner', 'senior', 'general', 'principal',
  'controller', 'comptroller', 'head of', 'svp', 'evp', 'ceo',
  'cfo', 'coo', 'cto', 'cio', 'cmo', 'cpo',
];

// ─── iXBRL Cleanup ──────────────────────────────────────────
// Modern SEC filings wrap content in inline XBRL tags that pollute text extraction.
// Adapted from filingMarkdown.js cleanEdgarHtml() — operates on DOM in-place.

function cleanIxbrlFromDoc(doc) {
  // 1. Remove hidden iXBRL elements (machine-only metadata — invisible but pollutes textContent)
  // Note: querySelectorAll fails on colon-namespaced tags — use getElementsByTagName
  const hiddenTags = ['ix:hidden', 'ix:header', 'ix:references'];
  for (const tag of hiddenTags) {
    const els = doc.getElementsByTagName(tag);
    // Iterate backwards since removal shifts indices
    for (let i = els.length - 1; i >= 0; i--) {
      els[i].remove();
    }
  }

  // 2. Unwrap visible iXBRL elements (keep their text content, strip the tag wrapper)
  const unwrapTags = [
    'ix:nonfraction', 'ix:nonnumeric', 'ix:fraction',
    'ix:continuation', 'ix:exclude',
  ];
  for (const tag of unwrapTags) {
    // Must snapshot length and re-query since unwrapping modifies DOM
    let els = doc.getElementsByTagName(tag);
    while (els.length > 0) {
      const el = els[0];
      while (el.firstChild) {
        el.parentNode.insertBefore(el.firstChild, el);
      }
      el.remove();
      els = doc.getElementsByTagName(tag);
    }
  }

  // 3. Remove script/style tags that could pollute text extraction
  for (const tag of ['script', 'style']) {
    const els = doc.querySelectorAll(tag);
    for (let i = els.length - 1; i >= 0; i--) {
      els[i].remove();
    }
  }
}

// ─── Value Parsing ──────────────────────────────────────────

function parseCompValue(text) {
  if (!text) return null;
  const cleaned = text
    .replace(/\u00a0/g, ' ')  // &nbsp;
    .replace(/\s+/g, ' ')
    .trim();

  // Check for dashes / em-dashes / en-dashes (means zero or N/A)
  if (/^[—–\-−]+$/.test(cleaned) || cleaned === '' || cleaned === 'N/A' || cleaned === 'n/a') return null;

  // Strip $, commas, footnote markers like (1), (2), *, superscript markers
  const numStr = cleaned
    .replace(/\$/g, '')
    .replace(/,/g, '')
    .replace(/\(\d+\)/g, '')   // footnote refs
    .replace(/[*†‡§¶]/g, '')   // footnote symbols
    .replace(/\s+/g, '')
    .trim();

  // Handle parenthesized negatives: (123) → -123
  const negMatch = numStr.match(/^\(([\d.]+)\)$/);
  if (negMatch) return -parseFloat(negMatch[1]);

  const num = parseFloat(numStr);
  return isNaN(num) ? null : num;
}

function parseYear(text) {
  if (!text) return null;
  const match = text.trim().match(/\b(20\d{2})\b/);
  return match ? parseInt(match[1]) : null;
}

// ─── Text Helpers ───────────────────────────────────────────

function normalizeText(text) {
  return (text || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function cellText(el) {
  return (el.textContent || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200b\u200c\u200d\uFEFF]/g, '')  // strip zero-width chars
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── DOM Helpers ────────────────────────────────────────────

// Get direct child <tr> elements only (not from nested tables)
function getDirectRows(table) {
  const rows = [];
  for (const child of table.children) {
    if (child.tagName === 'TR') {
      rows.push(child);
    } else if (child.tagName === 'THEAD' || child.tagName === 'TBODY' || child.tagName === 'TFOOT') {
      for (const grandchild of child.children) {
        if (grandchild.tagName === 'TR') {
          rows.push(grandchild);
        }
      }
    }
  }
  return rows;
}

// Get direct child cells of a row (not from nested tables within cells)
function getDirectCells(row) {
  return Array.from(row.children).filter(c => c.tagName === 'TD' || c.tagName === 'TH');
}

// ─── Table Finding Heuristics ──────────────────────────────

// SEC filings use spacer <td> cells between value columns (containing only &nbsp;).
// Filter to "content cells" that have actual text.
function isSpacerCell(cell) {
  const t = cellText(cell);
  // Pure footnote-ref cells like "(3)(4)" are also spacers for column-matching purposes
  return t === '' || /^\(\d+\)\s*(\(\d+\))*$/.test(t);
}

function getContentCells(row) {
  return getDirectCells(row).filter(c => !isSpacerCell(c));
}

// Walk backwards from a table element to find preceding heading/context text
// Collects text from multiple preceding elements (headings, descriptions)
function findPrecedingHeading(table) {
  const texts = [];
  let el = table.previousElementSibling;
  let steps = 0;
  while (el && steps < 15) {
    const text = normalizeText(el.textContent);
    if (text.length > 3) texts.push(text);
    // Stop if we've collected enough or hit a break element
    if (texts.length >= 5) break;
    el = el.previousElementSibling;
    steps++;
  }
  // Also check parent's preceding siblings
  if (table.parentElement) {
    el = table.parentElement.previousElementSibling;
    steps = 0;
    while (el && steps < 5) {
      const text = normalizeText(el.textContent);
      if (text.length > 3) texts.push(text);
      el = el.previousElementSibling;
      steps++;
    }
  }
  return texts.join(' ');
}

// Match content-only cells against SEC compensation column patterns
function matchColumns(headerRow, patterns) {
  const contentCells = getContentCells(headerRow);
  if (contentCells.length < 4) return null;

  const headerTexts = contentCells.map(c => normalizeText(c.textContent));

  const mapping = {};
  let matchCount = 0;

  for (const { key, patterns: pats } of patterns) {
    for (let i = 0; i < headerTexts.length; i++) {
      const h = headerTexts[i];
      if (pats.some(p => h.includes(p))) {
        mapping[key] = i;
        matchCount++;
        break;
      }
    }
  }

  if (matchCount >= 3 && (mapping.salary !== undefined || mapping.total !== undefined || mapping.feesEarned !== undefined)) {
    return mapping;
  }
  return null;
}

function findHeaderMapping(rows, patterns) {
  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    const mapping = matchColumns(rows[i], patterns);
    if (mapping) return { mapping, headerEndIdx: i + 1 };
  }
  return null;
}

// ─── Name Helpers ───────────────────────────────────────────

function looksLikeName(text) {
  if (!text || text.length < 2) return false;

  // Strip footnote markers before checking
  const cleaned = text.replace(/\(\d+\)/g, '').trim();
  if (cleaned.length < 2) return false;

  // Not a name if it's a year
  if (parseYear(cleaned)) return false;

  // Not a name if it starts with $ or is all digits/commas
  if (/^\$/.test(cleaned) || /^[\d,.$]+$/.test(cleaned)) return false;

  // Not a name if it contains title keywords
  const lower = cleaned.toLowerCase();
  if (TITLE_KEYWORDS.some(kw => lower.includes(kw))) return false;

  // Not a name if very long (titles tend to be long descriptions)
  if (cleaned.length > 60) return false;

  return true;
}

function extractNameTitle(cell) {
  const html = cell.innerHTML || '';
  // Split on <br> or newlines to separate name from title
  const parts = html.split(/<br\s*\/?>/i).map(p =>
    p.replace(/<[^>]*>/g, '')
     .replace(/\u00a0/g, ' ')
     .replace(/[\u200b\u200c\u200d\uFEFF]/g, '')
     .replace(/&#\d+;/g, ' ')
     .replace(/\(\d+\)/g, '')  // strip footnote markers from names
     .replace(/\s+/g, ' ')
     .trim()
  ).filter(p => p.length > 0);

  if (parts.length >= 2) {
    return { name: parts[0], title: parts.slice(1).join(', ') };
  }
  const text = cellText(cell).replace(/\(\d+\)/g, '').trim();
  return { name: text, title: '' };
}

// More aggressive name extraction — splits on block-level tags (<p>, <div>) in addition to <br>.
// Used ONLY in the looksLikeName fallback path to avoid regressions in existing code paths.
function extractNameFromBlockTags(cell) {
  const html = cell.innerHTML || '';
  const cleanPart = p => p
    .replace(/<[^>]*>/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200b\u200c\u200d\uFEFF]/g, '')
    .replace(/&#\d+;/g, ' ')
    .replace(/\(\d+\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Try block-level transitions first (safer), then standalone tags
  for (const pattern of [
    /<br\s*\/?>|<\/p>\s*<p[^>]*>|<\/div>\s*<div[^>]*>/gi,
    /<br\s*\/?>|<p[^>]*>|<\/p>|<div[^>]*>|<\/div>/gi,
  ]) {
    const parts = html.split(pattern).map(cleanPart).filter(p => p.length > 0);
    if (parts.length >= 2) {
      return { name: parts[0], title: parts.slice(1).join(', ') };
    }
  }
  return null;
}

// Normalize executive name for deduplication — handles middle initials, suffixes, footnotes
function normalizeExecName(name) {
  return name
    .toLowerCase()
    .replace(/\(\d+\)/g, '')      // strip footnote refs "(1)", "(6)"
    .replace(/[^a-z\s]/g, '')     // strip non-alpha except spaces
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(w => w.length > 1)    // drop single-letter initials ("l", "c", "j")
    .join(' ');
}

// Find matching executive in map — primary normalized match, secondary fuzzy (last name + first name prefix)
function findExecMatch(execMap, name) {
  const key = normalizeExecName(name);
  if (execMap.has(key)) return key;

  // Secondary: last-name + first 3 chars of first name
  const parts = key.split(' ');
  if (parts.length >= 2) {
    const fuzzyKey = parts[parts.length - 1] + ':' + parts[0].slice(0, 3);
    for (const [existingKey] of execMap) {
      const existingParts = existingKey.split(' ');
      if (existingParts.length >= 2) {
        const existingFuzzy = existingParts[existingParts.length - 1] + ':' + existingParts[0].slice(0, 3);
        if (fuzzyKey === existingFuzzy) return existingKey;
      }
    }
  }

  return key; // new entry
}

// ─── Column Mapping ─────────────────────────────────────────

// Build ordered list of compensation column keys from the header mapping
// Sorted by their position (content-cell index) left to right
function buildColumnSequence(mapping) {
  return Object.entries(mapping)
    .filter(([key]) => key !== 'name' && key !== 'year')
    .sort((a, b) => a[1] - b[1])
    .map(([key]) => key);
}

// ─── Sanity Checks ──────────────────────────────────────────

function isReasonableCompensation(comp) {
  const MAX_COMP = 1_000_000_000; // $1B — no single comp field should exceed this
  for (const value of Object.values(comp)) {
    if (value !== null && value !== undefined && Math.abs(value) > MAX_COMP) {
      return false;
    }
  }
  return true;
}

// ─── Summary Compensation Table Parser ─────────────────────

function findSummaryCompensationTable(doc) {
  const allTables = Array.from(doc.querySelectorAll('table'));

  // Prefer innermost table (no nested tables) over outer layout wrappers
  // Sort so tables WITHOUT nested tables come first when scores are equal
  const candidates = [];

  // Pass 1: tables with "Summary Compensation Table" in nearby heading or table text
  for (const table of allTables) {
    const heading = findPrecedingHeading(table);
    const isSCT = heading.includes('summary compensation table') ||
      heading.includes('summary of compensation');

    const tableText = normalizeText(table.textContent).slice(0, 500);
    const hasSCTInTable = tableText.includes('summary compensation table');

    if (!isSCT && !hasSCTInTable) continue;

    const rows = getDirectRows(table);
    const headerResult = findHeaderMapping(rows, EXEC_COLUMN_PATTERNS);
    if (headerResult) {
      // Require salary column — director tables have "fees earned" instead of "salary",
      // and can false-match exec patterns via name + stockAwards + otherComp + total
      if (headerResult.mapping.salary === undefined) continue;
      const hasNestedTables = table.querySelector('table') !== null;
      candidates.push({ table, rows, ...headerResult, priority: hasNestedTables ? 1 : 0 });
    }
  }

  // Return best candidate (innermost preferred)
  if (candidates.length > 0) {
    candidates.sort((a, b) => a.priority - b.priority);
    return candidates[0];
  }

  // Pass 2 fallback: try column header matching on any table (still require salary)
  for (const table of allTables) {
    const rows = getDirectRows(table);
    const headerResult = findHeaderMapping(rows, EXEC_COLUMN_PATTERNS);
    if (headerResult && headerResult.mapping.salary !== undefined) {
      return { table, rows, ...headerResult };
    }
  }

  return null;
}

function parseSummaryCompensationTable(doc) {
  const found = findSummaryCompensationTable(doc);
  if (!found) return [];

  const { rows, mapping, headerEndIdx } = found;
  const colSequence = buildColumnSequence(mapping);
  const executives = [];
  let currentName = null;
  let currentTitle = null;
  let remainingRowspan = 0;

  for (let i = headerEndIdx; i < rows.length; i++) {
    const row = rows[i];
    const allCells = getDirectCells(row);
    if (allCells.length < 3) {
      // Check if this is a full-width name row (common in year-first tables where
      // the name spans all columns as a separator between executives)
      if (allCells.length >= 1 && remainingRowspan === 0) {
        const { name, title } = extractNameTitle(allCells[0]);
        // Require 2+ words to avoid false-matching single words, footnotes, or company names
        if (name && looksLikeName(name) && name.trim().split(/\s+/).length >= 2) {
          currentName = name;
          currentTitle = title || '';
        }
      }
      continue;
    }

    // Determine if this row introduces a new executive or continues previous
    let nameCell = null;
    let dataCells;

    // Check for rowspan — skip leading spacer cells to find the actual name cell.
    // Many SEC proxies use spacer <td> with rowspan for layout (e.g., QCOM, LRCX).
    let rowspanCell = null;
    let rowspanCellIdx = -1;
    let rowspanValue = 0;
    for (let ci = 0; ci < allCells.length; ci++) {
      const rs = parseInt(allCells[ci].getAttribute('rowspan')) || 0;
      if (rs > 1) {
        if (isSpacerCell(allCells[ci])) continue;  // skip spacers with rowspan
        rowspanCell = allCells[ci];
        rowspanCellIdx = ci;
        rowspanValue = rs;
        break;
      }
    }

    if (rowspanCell) {
      // Explicit rowspan on a non-spacer cell — new executive
      nameCell = rowspanCell;
      remainingRowspan = rowspanValue - 1;
      // Data cells: everything after the name cell, minus spacers
      dataCells = allCells.slice(rowspanCellIdx + 1).filter(c => !isSpacerCell(c));
    } else if (remainingRowspan > 0) {
      // Continuation row — name is from previous rowspan
      remainingRowspan--;
      dataCells = getContentCells(row);
    } else {
      // No active rowspan — check if first content cell looks like a name
      const content = getContentCells(row);
      if (content.length < 2) {
        // Could be a name-only row (after spacer filtering) — set name for subsequent rows
        if (content.length === 1) {
          const { name, title } = extractNameTitle(content[0]);
          if (name && looksLikeName(name) && name.trim().split(/\s+/).length >= 2) {
            currentName = name;
            currentTitle = title || '';
          }
        }
        continue;
      }

      const firstText = cellText(content[0]);
      // Try full cell text first; if it fails (e.g. "Tim Cook Chief Executive Officer"),
      // try extracting just the name part before <br>, then try block-level tags (<p>, <div>)
      let isName = looksLikeName(firstText);
      if (!isName) {
        const { name } = extractNameTitle(content[0]);
        if (name && name !== firstText && looksLikeName(name)) {
          isName = true;
        }
      }
      if (!isName) {
        const result = extractNameFromBlockTags(content[0]);
        if (result && result.name && looksLikeName(result.name)) {
          isName = true;
        }
      }

      if (isName) {
        nameCell = content[0];
        dataCells = content.slice(1);
        // This name cell might also have rowspan
        const rs = parseInt(content[0].getAttribute('rowspan')) || 0;
        if (rs > 1) remainingRowspan = rs - 1;
      } else {
        // Treat as continuation of current executive
        dataCells = content;
      }
    }

    // Extract name + title if we have a name cell
    if (nameCell) {
      const { name, title } = extractNameTitle(nameCell);
      if (name) {
        currentName = name;
        currentTitle = title;
      }
    }

    if (!currentName) continue;

    // Extract year from first data cell; if not found there, try the name cell
    // (handles combined name+year columns like "Edward Decker, CEO, 2024")
    let yearText = dataCells.length > 0 ? cellText(dataCells[0]) : '';
    let year = parseYear(yearText);
    let yearInNameCell = false;
    if (!year && nameCell) {
      year = parseYear(cellText(nameCell));
      yearInNameCell = !!year;
    }
    if (!year) continue; // Need a year to record data

    // Map remaining data cells to compensation fields sequentially
    // When year is in the name cell, dataCells[0] is the first comp value (no skip needed)
    // When year is in dataCells[0], skip it: dataCells[1..N] = compensation values
    const comp = {};
    const dataStart = yearInNameCell ? 0 : 1;
    for (let ci = 0; ci < colSequence.length; ci++) {
      const cellIdx = ci + dataStart;
      if (cellIdx < dataCells.length) {
        comp[colSequence[ci]] = parseCompValue(cellText(dataCells[cellIdx]));
      }
    }

    // Sanity check — reject rows with absurd values (e.g., from nested table pollution)
    if (!isReasonableCompensation(comp)) {
      console.warn(`Compensation: unreasonable values for ${currentName} ${year}, skipping`);
      continue;
    }

    // Find or create executive entry (within a single filing — use normalized name)
    const execKey = normalizeExecName(currentName);
    let exec = executives.find(e => normalizeExecName(e.name) === execKey);
    if (!exec) {
      exec = { name: currentName, title: currentTitle || '', compensation: {} };
      executives.push(exec);
    }
    if (currentTitle && !exec.title) exec.title = currentTitle;
    exec.compensation[year] = comp;
  }

  return executives;
}

// ─── Director Compensation Table Parser ────────────────────

function findDirectorCompensationTable(doc) {
  const allTables = Array.from(doc.querySelectorAll('table'));

  for (const table of allTables) {
    const heading = findPrecedingHeading(table);
    const isDirectorTable = heading.includes('director compensation') ||
      heading.includes('non-employee director') ||
      heading.includes('compensation of directors');

    const tableText = normalizeText(table.textContent).slice(0, 500);
    const hasInTable = tableText.includes('director compensation');

    if (!isDirectorTable && !hasInTable) continue;

    const rows = getDirectRows(table);
    const headerResult = findHeaderMapping(rows, DIRECTOR_COLUMN_PATTERNS);
    if (headerResult) {
      return { table, rows, ...headerResult };
    }
  }

  return null;
}

function parseDirectorCompensationTable(doc) {
  const found = findDirectorCompensationTable(doc);
  if (!found) return [];

  const { rows, mapping, headerEndIdx } = found;
  const directors = [];

  for (let i = headerEndIdx; i < rows.length; i++) {
    const content = getContentCells(rows[i]);
    if (content.length < 3) continue;

    const rawName = cellText(content[0]).replace(/\(\d+\)/g, '').trim();
    if (!rawName || rawName.length < 2) continue;

    const nameLower = rawName.toLowerCase();
    if (nameLower.includes('total')) continue;

    const comp = {};
    for (const { key } of DIRECTOR_COLUMN_PATTERNS) {
      if (key === 'name') continue;
      const idx = mapping[key];
      if (idx !== undefined && idx < content.length) {
        comp[key] = parseCompValue(cellText(content[idx]));
      }
    }

    const hasValues = Object.values(comp).some(v => v !== null && v !== undefined);
    if (!hasValues) continue;

    // Sanity check
    if (!isReasonableCompensation(comp)) continue;

    directors.push({ name: rawName, compensation: comp });
  }

  return directors;
}

// ─── CEO Pay Ratio Extraction ───────────────────────────────

function parseCeoPayRatio(doc) {
  const text = doc.body?.textContent || '';

  // Look for pay ratio patterns:
  // "CEO Pay Ratio" section typically says something like:
  // "the ratio of ... CEO ... to the median ... was approximately 256 to 1"
  // "CEO to median employee pay ratio: 186:1"
  // "our CEO's ... compensation was approximately 256 times that of our median employee"
  const patterns = [
    /pay\s*ratio[^.]*?(\d{1,5})\s*(?:to|:)\s*1/i,
    /ratio[^.]*?(\d{1,5})\s*(?:to|:)\s*1/i,
    /(\d{1,5})\s*times\s*(?:that\s*of\s*)?(?:the\s*)?(?:our\s*)?median/i,
    /ratio\s*(?:of|was)\s*(?:approximately\s*)?(\d{1,5})/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const ratio = parseInt(match[1]);
      if (ratio > 0 && ratio < 100000) {
        return { ratio };
      }
    }
  }

  return null;
}

// ─── ECD XBRL Fallback Parser ─────────────────────────────────
// Since FY2022, DEF 14A filings include inline XBRL with ECD (Executive Compensation
// Disclosure) taxonomy tags. Covers Item 402(v) Pay vs Performance — provides CEO
// total comp, NEO names, avg NEO total comp, TSR, and "actually paid" amounts.
// Less detail than the HTML Summary Compensation Table but ~100% reliable.

function filingIndexUrl(cik, accessionNumber) {
  const cleanCik = String(cik).replace(/^0+/, '');
  const accPath = accessionNumber.replace(/-/g, '');
  const base = IS_DEV ? '/api/sec' : 'https://www.sec.gov';
  return `${base}/Archives/edgar/data/${cleanCik}/${accPath}/index.json`;
}

function filingArchiveUrl(cik, accessionNumber, filename) {
  const cleanCik = String(cik).replace(/^0+/, '');
  const accPath = accessionNumber.replace(/-/g, '');
  const base = IS_DEV ? '/api/sec' : 'https://www.sec.gov';
  return `${base}/Archives/edgar/data/${cleanCik}/${accPath}/${filename}`;
}

async function findXbrlInstanceFile(filing) {
  try {
    const url = filingIndexUrl(filing.cik, filing.accessionNumber);
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const items = data?.directory?.item || [];
    const xmlFile = items.find(f => f.name.endsWith('_htm.xml'));
    return xmlFile ? xmlFile.name : null;
  } catch {
    return null;
  }
}

function parseEcdXbrl(xmlText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'text/xml');
  if (doc.querySelector('parsererror')) return null;

  // Collect all elements — use getElementsByTagName('*') and filter by localName
  // since namespace handling varies across filing providers
  const allEls = doc.getElementsByTagName('*');

  // Group facts by localName
  const facts = {};
  for (let i = 0; i < allEls.length; i++) {
    const el = allEls[i];
    const local = el.localName;
    const ns = el.namespaceURI || '';
    // Only collect ecd: namespace facts (or dei: for entity info)
    if (!ns.includes('/ecd/') && !ns.includes('/dei/')) continue;
    const val = el.textContent?.trim();
    if (!val) continue;
    const ctx = el.getAttribute('contextRef') || '';
    if (!facts[local]) facts[local] = [];
    facts[local].push({ value: val, context: ctx });
  }

  // Extract fiscal year periods from contextRefs
  // Formats vary: "From2024-09-29to2025-09-27", "P10_28_2024To10_26_2025", etc.
  function extractYearFromContext(ctx) {
    // Look for the ending year in the context — the "to" date determines the fiscal year
    // Try ISO format: "to2025-09-27" or "To10_26_2025"
    const isoMatch = ctx.match(/to(\d{4})-(\d{2})-(\d{2})/i);
    if (isoMatch) return parseInt(isoMatch[1]);
    const usMatch = ctx.match(/To(\d{1,2})_(\d{1,2})_(\d{4})/i);
    if (usMatch) return parseInt(usMatch[3]);
    // Fallback: find any 4-digit year
    const years = ctx.match(/\b(20\d{2})\b/g);
    if (years && years.length > 0) return parseInt(years[years.length - 1]);
    return null;
  }

  // Extract CEO name and total comp per year
  const ceoName = (facts['PeoName'] || [])
    .find(f => f.context.includes('PeoMember') || !f.context.includes('NonPeoNeo'))
    ?.value?.trim() || null;

  // Build per-year data from PeoTotalCompAmt
  const yearData = {};
  for (const fact of (facts['PeoTotalCompAmt'] || [])) {
    const year = extractYearFromContext(fact.context);
    if (!year) continue;
    if (yearData[year]) continue; // first occurrence wins (avoid duplicates)
    yearData[year] = { ceoTotal: parseInt(fact.value) || 0 };
  }

  // Add CEO "actually paid" compensation
  for (const fact of (facts['PeoActuallyPaidCompAmt'] || [])) {
    const year = extractYearFromContext(fact.context);
    if (year && yearData[year]) {
      yearData[year].ceoActuallyPaid = parseInt(fact.value) || 0;
    }
  }

  // Add average NEO total comp
  for (const fact of (facts['NonPeoNeoAvgTotalCompAmt'] || [])) {
    const year = extractYearFromContext(fact.context);
    if (year && yearData[year]) {
      yearData[year].avgNeoTotal = parseInt(fact.value) || 0;
    }
  }

  // Add average NEO "actually paid"
  for (const fact of (facts['NonPeoNeoAvgCompActuallyPaidAmt'] || [])) {
    const year = extractYearFromContext(fact.context);
    if (year && yearData[year]) {
      yearData[year].avgNeoActuallyPaid = parseInt(fact.value) || 0;
    }
  }

  // Add Total Shareholder Return
  for (const fact of (facts['TotalShareholderRtnAmt'] || [])) {
    const year = extractYearFromContext(fact.context);
    if (year && yearData[year]) {
      yearData[year].tsr = parseFloat(fact.value) || 0;
    }
  }

  // Add Peer Group TSR
  for (const fact of (facts['PeerGroupTotalShareholderRtnAmt'] || [])) {
    const year = extractYearFromContext(fact.context);
    if (year && yearData[year]) {
      yearData[year].peerTsr = parseFloat(fact.value) || 0;
    }
  }

  // Add Net Income
  for (const fact of (facts['NetIncomeLoss'] || [])) {
    const year = extractYearFromContext(fact.context);
    if (year && yearData[year]) {
      yearData[year].netIncome = parseInt(fact.value) || 0;
    }
  }

  // Extract all NEO names (Non-PEO Named Executive Officers)
  // These are in PeoName facts with NonPeoNeoMember dimension + custom member dims
  const neoNames = [];
  const seenNames = new Set();
  for (const fact of (facts['PeoName'] || [])) {
    if (!fact.context.includes('NonPeoNeo')) continue;
    const name = fact.value?.trim().replace(/\s+/g, ' '); // normalize whitespace
    if (name && !seenNames.has(name.toLowerCase())) {
      seenNames.add(name.toLowerCase());
      neoNames.push(name);
    }
  }

  if (Object.keys(yearData).length === 0 && !ceoName) return null;

  return { ceoName, neoNames, yearData };
}

function ecdXbrlToCompensationResult(ecdData, filing) {
  if (!ecdData) return null;

  const { ceoName, neoNames, yearData } = ecdData;
  const years = Object.keys(yearData).map(Number).sort((a, b) => b - a);
  if (years.length === 0) return null;

  const executives = [];

  // CEO executive entry
  if (ceoName) {
    const comp = {};
    for (const year of years) {
      const d = yearData[year];
      if (d?.ceoTotal != null) {
        comp[year] = { total: d.ceoTotal, _actuallyPaid: d.ceoActuallyPaid ?? null };
      }
    }
    if (Object.keys(comp).length > 0) {
      executives.push({
        name: ceoName,
        title: 'Chief Executive Officer',
        compensation: comp,
      });
    }
  }

  // Individual NEO entries — we only have the average, so create entries with
  // avg total comp per year (label them as such)
  for (const name of neoNames) {
    const comp = {};
    for (const year of years) {
      const d = yearData[year];
      if (d?.avgNeoTotal != null) {
        comp[year] = { total: d.avgNeoTotal, _actuallyPaid: d.avgNeoActuallyPaid ?? null, _isAverage: true };
      }
    }
    if (Object.keys(comp).length > 0) {
      executives.push({
        name,
        title: 'Named Executive Officer',
        compensation: comp,
      });
    }
  }

  // Extract TSR data for pay-vs-performance context
  const pvpData = {};
  for (const year of years) {
    const d = yearData[year];
    pvpData[year] = {
      tsr: d?.tsr ?? null,
      peerTsr: d?.peerTsr ?? null,
      netIncome: d?.netIncome ?? null,
    };
  }

  // Try to infer a pay ratio from CEO total vs avg NEO
  let ceoPayRatio = null;
  const latestYear = years[0];
  const latestData = yearData[latestYear];
  if (latestData?.ceoTotal && latestData?.avgNeoTotal && latestData.avgNeoTotal > 0) {
    // This is CEO:NEO ratio, not CEO:median employee — note the difference
    ceoPayRatio = null; // Don't fake a pay ratio — it's a different metric
  }

  return {
    accessionNumber: filing.accessionNumber,
    filingDate: filing.filingDate,
    executives,
    directors: [],
    ceoPayRatio,
    source: 'xbrl-pvp',
    pvpData,
  };
}

async function fetchEcdXbrlFallback(filing) {
  try {
    const xmlFilename = await findXbrlInstanceFile(filing);
    if (!xmlFilename) return null;

    const url = filingArchiveUrl(filing.cik, filing.accessionNumber, xmlFilename);
    const res = await fetch(url);
    if (!res.ok) return null;

    const xmlText = await res.text();
    const ecdData = parseEcdXbrl(xmlText);
    return ecdXbrlToCompensationResult(ecdData, filing);
  } catch (e) {
    console.warn('ECD XBRL fallback failed:', e.message);
    return null;
  }
}

// ─── Fetch and Parse Single DEF 14A ─────────────────────────

async function fetchAndParseProxy(filing) {
  const cacheKey = `comp-proxy:${COMP_CACHE_V}:${filing.accessionNumber}`;
  const cached = await cacheGetAsync(cacheKey);
  if (cached) return cached;

  const url = filingHtmlUrl(filing.cik, filing.accessionNumber, filing.primaryDocument);
  const res = await fetch(url);
  if (!res.ok) return null;

  const html = await res.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Strip iXBRL inline tags before parsing — prevents metadata pollution
  cleanIxbrlFromDoc(doc);

  let executives = parseSummaryCompensationTable(doc);
  const directors = parseDirectorCompensationTable(doc);
  const ceoPayRatio = parseCeoPayRatio(doc);

  // ECD XBRL fallback — when HTML table parsing fails, try structured XBRL data
  let source = 'html';
  let pvpData = null;
  if (executives.length === 0) {
    const xbrlResult = await fetchEcdXbrlFallback(filing);
    if (xbrlResult && xbrlResult.executives.length > 0) {
      executives = xbrlResult.executives;
      source = 'xbrl-pvp';
      pvpData = xbrlResult.pvpData;
      console.log(`Compensation: XBRL fallback succeeded for ${filing.accessionNumber} — ${executives.length} executives from Pay vs Performance table`);
    }
  }

  const result = {
    accessionNumber: filing.accessionNumber,
    filingDate: filing.filingDate,
    executives,
    directors,
    ceoPayRatio,
    source,
    pvpData,
  };

  // Cache non-empty results (filings are immutable)
  if (executives.length > 0 || directors.length > 0) {
    cacheSet(cacheKey, result, 'filings');
  }

  return result;
}

// ─── Find DEF 14A Filings ───────────────────────────────────

function findProxyFilings(allFilings, count = 2) {
  return allFilings
    .filter(f => f.form === 'DEF 14A')
    .sort((a, b) => b.filingDate.localeCompare(a.filingDate))
    .slice(0, count);
}

// ─── Merge Multi-Filing Results ─────────────────────────────

function mergeCompensationData(filingResults) {
  // Merge executives across filings — same person's data from overlapping years
  // should prefer the most recent filing (first in array)
  const execMap = new Map();
  const directorMap = new Map();
  let ceoPayRatio = null;
  let source = 'html';
  let pvpData = null;

  for (const result of filingResults) {
    if (!result) continue;

    // Track source — if any filing used XBRL fallback, note it
    if (result.source === 'xbrl-pvp') source = 'xbrl-pvp';
    if (result.pvpData && !pvpData) pvpData = result.pvpData;

    // CEO Pay Ratio — use most recent
    if (!ceoPayRatio && result.ceoPayRatio) {
      ceoPayRatio = { ...result.ceoPayRatio, filingDate: result.filingDate };
    }

    // Merge executives — use fuzzy name matching
    for (const exec of result.executives) {
      const key = findExecMatch(execMap, exec.name);
      if (!execMap.has(key)) {
        execMap.set(key, { name: exec.name, title: exec.title, compensation: {} });
      }
      const merged = execMap.get(key);
      // Prefer title from most recent filing
      if (exec.title && !merged.title) merged.title = exec.title;
      // Merge compensation years — most recent filing wins for overlapping years
      for (const [year, comp] of Object.entries(exec.compensation)) {
        if (!merged.compensation[year]) {
          merged.compensation[year] = comp;
        }
      }
    }

    // Merge directors — use fuzzy name matching
    for (const dir of result.directors) {
      const key = findExecMatch(directorMap, dir.name);
      if (!directorMap.has(key)) {
        directorMap.set(key, { name: dir.name, compensation: {} });
      }
      const merged = directorMap.get(key);
      // Director tables typically don't have year columns — keyed by filing year
      const filingYear = parseInt(result.filingDate.slice(0, 4));
      if (!merged.compensation[filingYear]) {
        merged.compensation[filingYear] = dir.compensation;
      }
    }
  }

  const executives = Array.from(execMap.values());
  const directors = Array.from(directorMap.values());

  // Compute summary
  const allYears = new Set();
  for (const exec of executives) {
    for (const year of Object.keys(exec.compensation)) allYears.add(parseInt(year));
  }
  const years = Array.from(allYears).sort((a, b) => b - a);

  const totalExecComp = {};
  const totalSalaryOnly = {};
  for (const year of years) {
    let compSum = 0;
    let salarySum = 0;
    for (const exec of executives) {
      const c = exec.compensation[year];
      if (c) {
        compSum += c.total ?? 0;
        salarySum += c.salary ?? 0;
      }
    }
    totalExecComp[year] = compSum;
    totalSalaryOnly[year] = salarySum;
  }

  return {
    executives,
    directors,
    ceoPayRatio,
    summary: { totalExecComp, totalSalaryOnly, years },
    source,
    pvpData,
  };
}

// ─── Diagnostic Table Discovery (for audit) ─────────────────

function diagnoseSummaryCompensationTable(doc) {
  const allTables = Array.from(doc.querySelectorAll('table'));
  const diag = {
    totalTables: allTables.length,
    tablesWithSCTHeading: 0,
    candidateHeadings: [],
    headerMatchAttempts: [],
    pass2Attempts: 0,
    foundTable: false,
    failureReason: null,
  };

  // Pass 1: check heading/text match
  for (const table of allTables) {
    const heading = findPrecedingHeading(table);
    const isSCT = heading.includes('summary compensation table') ||
      heading.includes('summary of compensation');
    const tableText = normalizeText(table.textContent).slice(0, 500);
    const hasSCTInTable = tableText.includes('summary compensation table');

    // Collect heading samples for debugging
    if (heading.length > 10) {
      const snippet = heading.slice(0, 120);
      if (!diag.candidateHeadings.includes(snippet)) {
        diag.candidateHeadings.push(snippet);
      }
    }

    if (!isSCT && !hasSCTInTable) continue;
    diag.tablesWithSCTHeading++;

    const rows = getDirectRows(table);
    const headerResult = findHeaderMapping(rows, EXEC_COLUMN_PATTERNS);

    // Collect header info for debugging
    for (let r = 0; r < Math.min(rows.length, 5); r++) {
      const contentCells = getContentCells(rows[r]);
      if (contentCells.length >= 3) {
        const headerTexts = contentCells.map(c => normalizeText(c.textContent).slice(0, 40));
        const mapping = matchColumns(rows[r], EXEC_COLUMN_PATTERNS);
        diag.headerMatchAttempts.push({
          headerTexts,
          contentCellCount: contentCells.length,
          matched: mapping !== null,
          matchCount: mapping ? Object.keys(mapping).length : 0,
        });
      }
    }

    if (headerResult) {
      diag.foundTable = true;
      return diag;
    }
  }

  // Pass 2 fallback: column matching on any table
  for (const table of allTables) {
    diag.pass2Attempts++;
    const rows = getDirectRows(table);
    const headerResult = findHeaderMapping(rows, EXEC_COLUMN_PATTERNS);
    if (headerResult) {
      diag.foundTable = true;
      return diag;
    }
  }

  // Determine failure reason
  if (diag.tablesWithSCTHeading > 0) {
    diag.failureReason = 'HEADER_MISMATCH';
  } else {
    diag.failureReason = 'TABLE_NOT_FOUND';
  }

  return diag;
}

// ─── Audit Function ─────────────────────────────────────────

export async function auditCompensation(companies, onProgress) {
  const results = [];

  for (let i = 0; i < companies.length; i++) {
    const company = companies[i];
    if (onProgress) onProgress(i + 1, companies.length, company.ticker);

    const result = {
      ticker: company.ticker,
      name: company.name,
      status: 'PASS',
      category: null,
      filingCount: 0,
      execCount: 0,
      directorCount: 0,
      yearCount: 0,
      hasCeoPayRatio: false,
      diagnostics: null,
      issues: [],
    };

    try {
      // Step 1: Look up CIK
      const cik = await lookupCIK(company.ticker);
      if (!cik) {
        result.status = 'FAIL';
        result.category = 'NO_CIK';
        result.issues.push('Could not resolve CIK from ticker');
        results.push(result);
        await sleep(FETCH_DELAY_MS);
        continue;
      }

      // Step 2: Fetch filings list
      const allFilings = await fetchFilings(company.ticker);
      const allProxies = findProxyFilings(allFilings, 10);
      result.filingCount = allProxies.length;

      if (allProxies.length === 0) {
        result.status = 'FAIL';
        result.category = 'NO_FILINGS';
        result.issues.push('No DEF 14A filings found in EDGAR submissions');
        results.push(result);
        await sleep(FETCH_DELAY_MS);
        continue;
      }

      // Step 3: Fetch most recent proxy HTML
      const filing = allProxies[0];
      const url = filingHtmlUrl(filing.cik, filing.accessionNumber, filing.primaryDocument);
      const res = await fetch(url);

      if (!res.ok) {
        result.status = 'FAIL';
        result.category = 'FETCH_FAILED';
        result.issues.push(`HTTP ${res.status} fetching proxy (${filing.primaryDocument})`);
        results.push(result);
        await sleep(FETCH_DELAY_MS);
        continue;
      }

      const html = await res.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      cleanIxbrlFromDoc(doc);

      // Step 4: Diagnose table discovery
      const diagnostics = diagnoseSummaryCompensationTable(doc);

      // Step 4b: Try HTML parsing
      let executives = [];
      let source = 'html';

      if (diagnostics.foundTable) {
        executives = parseSummaryCompensationTable(doc);
      }

      // Step 4c: XBRL fallback when HTML parsing fails or finds no executives
      if (executives.length === 0) {
        const xbrlResult = await fetchEcdXbrlFallback(filing);
        if (xbrlResult && xbrlResult.executives.length > 0) {
          executives = xbrlResult.executives;
          source = 'xbrl-pvp';
        }
      }

      const directors = parseDirectorCompensationTable(doc);
      const ceoPayRatio = parseCeoPayRatio(doc);

      result.execCount = executives.length;
      result.directorCount = directors.length;
      result.hasCeoPayRatio = ceoPayRatio !== null;
      result.source = source;

      if (executives.length > 0) {
        const years = new Set();
        for (const exec of executives) {
          for (const y of Object.keys(exec.compensation)) years.add(y);
        }
        result.yearCount = years.size;
      }

      if (executives.length === 0) {
        // Both HTML and XBRL failed
        result.status = 'FAIL';
        result.category = diagnostics.foundTable ? 'PARSE_EMPTY' : diagnostics.failureReason;
        result.diagnostics = diagnostics;
        if (!diagnostics.foundTable) {
          if (diagnostics.failureReason === 'HEADER_MISMATCH') {
            result.issues.push(`Found ${diagnostics.tablesWithSCTHeading} table(s) with SCT heading but column headers didn't match`);
          } else {
            result.issues.push(`No table with "Summary Compensation Table" heading found (${diagnostics.totalTables} tables in doc)`);
          }
        } else {
          result.issues.push('Table found and headers matched, but no executives extracted');
        }
        result.issues.push('XBRL fallback also failed (no ECD data found)');
      } else if (source === 'xbrl-pvp') {
        // XBRL rescued a previously-failing company
        result.status = 'PASS';
        result.category = 'XBRL_FALLBACK';
        result.issues.push(`HTML parsing failed — rescued by XBRL Pay vs Performance data (${executives.length} exec, total comp only)`);
      } else if (executives.length < 3 || result.yearCount < 2) {
        result.status = 'WARN';
        result.category = 'PARTIAL';
        if (executives.length < 3) result.issues.push(`Only ${executives.length} executive(s) found (expect 4-8)`);
        if (result.yearCount < 2) result.issues.push(`Only ${result.yearCount} year(s) of data (expect 2-3)`);
      }
      // else: PASS (default)
    } catch (e) {
      result.status = 'FAIL';
      result.category = 'ERROR';
      result.issues.push(`Error: ${e.message}`);
    }

    results.push(result);
    if (i < companies.length - 1) await sleep(FETCH_DELAY_MS);
  }

  return results;
}

// ─── Main Entry Point ────────────────────────────────────────

export async function fetchCompensation(ticker) {
  const cacheKey = `comp-summary:${COMP_CACHE_V}:${ticker.toUpperCase()}`;
  const cached = await cacheGetAsync(cacheKey);
  if (cached) return cached;

  const cik = await lookupCIK(ticker);
  if (!cik) return { executives: [], directors: [], ceoPayRatio: null, summary: { totalExecComp: {}, totalSalaryOnly: {}, years: [] } };

  // Get all filings, find DEF 14A proxies
  const allFilings = await fetchFilings(ticker);
  const proxyFilings = findProxyFilings(allFilings, 3); // 3 filings → ~5-7 years of data

  if (proxyFilings.length === 0) {
    return { executives: [], directors: [], ceoPayRatio: null, summary: { totalExecComp: {}, totalSalaryOnly: {}, years: [] } };
  }

  // Fetch and parse each proxy filing
  const results = [];
  for (let i = 0; i < proxyFilings.length; i++) {
    const result = await fetchAndParseProxy(proxyFilings[i]);
    results.push(result);
    if (i < proxyFilings.length - 1) await sleep(FETCH_DELAY_MS);
  }

  // Merge across filings
  const merged = mergeCompensationData(results);

  // Cache the merged result
  cacheSet(cacheKey, merged, 'financials'); // 24hr TTL
  return merged;
}
