// Filing HTML-to-Markdown Engine
// Lazily fetches SEC filing HTML from EDGAR, converts to clean markdown,
// and caches permanently in IndexedDB. Designed for AI consumption —
// the user reads PDFs directly via the Filings tab links.
//
// Filings are immutable (a 2020 10-K never changes), so cached markdown
// never needs invalidation. First call fetches + converts; subsequent
// calls return from cache instantly.

import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import { cacheGetAsync, cacheSet } from './cache';

// ─── Config ─────────────────────────────────────────────────

const IS_DEV = import.meta.env.DEV;
const FILING_MD_CACHE_V = 'v1';
const FETCH_DELAY_MS = 120; // rate limiting between sequential fetches

// ─── URL helper ─────────────────────────────────────────────

function filingHtmlUrl(cik, accessionNumber, primaryDocument) {
  const cleanCik = String(cik).replace(/^0+/, '');
  const accPath = accessionNumber.replace(/-/g, '');
  const base = IS_DEV ? '/api/sec' : 'https://www.sec.gov';
  return `${base}/Archives/edgar/data/${cleanCik}/${accPath}/${primaryDocument}`;
}

// ─── Turndown singleton ─────────────────────────────────────

let turndownInstance = null;

// Extract cell text, collapsing whitespace and &nbsp;
function cellText(td) {
  return (td.textContent || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

// Convert an HTML table to a pipe-delimited markdown table.
// Handles colspan/rowspan by extracting raw cell text — loses spanning
// info but produces clean readable output for AI consumption.
function tableToMarkdown(tableEl) {
  const rows = tableEl.querySelectorAll('tr');
  if (rows.length === 0) return '';

  const mdRows = [];
  for (const row of rows) {
    const cells = row.querySelectorAll('td, th');
    const cellTexts = Array.from(cells).map(cellText);
    // Skip completely empty rows
    if (cellTexts.every(t => t === '')) continue;
    mdRows.push('| ' + cellTexts.join(' | ') + ' |');
  }

  if (mdRows.length === 0) return '';

  // Insert separator after first row (header)
  const firstRowCols = mdRows[0].split('|').length - 2; // subtract leading/trailing empties
  const separator = '| ' + Array(firstRowCols).fill('---').join(' | ') + ' |';
  mdRows.splice(1, 0, separator);

  return '\n\n' + mdRows.join('\n') + '\n\n';
}

function getTurndown() {
  if (!turndownInstance) {
    turndownInstance = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      bulletListMarker: '-',
      emDelimiter: '*',
    });

    // Custom table rule — handles complex EDGAR tables (colspan, nested spans)
    // that the GFM plugin can't convert. Must be added BEFORE gfm plugin
    // so it takes priority.
    turndownInstance.addRule('edgarTables', {
      filter: 'table',
      replacement: (_content, node) => tableToMarkdown(node),
    });

    // GFM plugin for strikethrough (table support overridden by our rule above)
    turndownInstance.use(gfm);

    // Unwrap <font> tags (EDGAR uses these heavily for styling)
    turndownInstance.addRule('font', {
      filter: 'font',
      replacement: (content) => content,
    });

    // Remove empty links
    turndownInstance.addRule('emptyLinks', {
      filter: (node) => node.nodeName === 'A' && !node.getAttribute('href'),
      replacement: (content) => content,
    });
  }
  return turndownInstance;
}

// ─── HTML cleanup ───────────────────────────────────────────

function cleanEdgarHtml(htmlString) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlString, 'text/html');

  // 1. Remove hidden iXBRL elements (machine-only metadata)
  // Note: querySelectorAll fails on namespaced tags (ix:hidden) — colon parsed as CSS pseudo-class
  const hiddenTags = ['ix:hidden', 'ix:header', 'ix:references'];
  for (const tag of hiddenTags) {
    Array.from(doc.getElementsByTagName(tag)).forEach(el => el.remove());
  }

  // 2. Unwrap visible iXBRL elements (keep their text content, strip the tag)
  const unwrapTags = [
    'ix:nonfraction', 'ix:nonnumeric', 'ix:fraction',
    'ix:continuation', 'ix:exclude',
  ];
  for (const tag of unwrapTags) {
    Array.from(doc.getElementsByTagName(tag)).forEach(el => {
      while (el.firstChild) {
        el.parentNode.insertBefore(el.firstChild, el);
      }
      el.remove();
    });
  }

  // 3. Remove non-content elements
  const removeTags = ['script', 'style', 'link', 'meta'];
  for (const tag of removeTags) {
    doc.querySelectorAll(tag).forEach(el => el.remove());
  }

  // 4. Strip style and class attributes from all elements
  doc.querySelectorAll('*').forEach(el => {
    el.removeAttribute('style');
    el.removeAttribute('class');
  });

  return doc.body?.innerHTML || '';
}

// ─── Markdown conversion ────────────────────────────────────

function convertToMarkdown(cleanHtml) {
  const td = getTurndown();
  let md = td.turndown(cleanHtml);

  // Post-process: collapse excessive blank lines
  md = md.replace(/\n{4,}/g, '\n\n\n');
  // Trim trailing whitespace per line
  md = md.split('\n').map(line => line.trimEnd()).join('\n');
  // Trim leading/trailing whitespace
  md = md.trim();

  return md;
}

// ─── Main API ───────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch a single SEC filing as markdown.
 * @param {Object} filing - Filing object from fetchFilings() with cik, accessionNumber, primaryDocument
 * @returns {{ markdown: string|null, fromCache: boolean, charCount: number, skipped?: boolean, reason?: string }}
 */
export async function fetchFilingMarkdown(filing) {
  if (!filing?.cik || !filing?.accessionNumber || !filing?.primaryDocument) {
    return { markdown: null, skipped: true, reason: 'Missing filing fields (cik, accessionNumber, primaryDocument)' };
  }

  // Check file extension — skip XML (machine-readable XBRL, not human text)
  const ext = filing.primaryDocument.split('.').pop()?.toLowerCase();
  if (ext === 'xml') {
    return { markdown: null, skipped: true, reason: 'XML filing (machine-readable only)' };
  }

  // Check cache first
  const cacheKey = `filing-md:${FILING_MD_CACHE_V}:${filing.accessionNumber}`;
  const cached = await cacheGetAsync(cacheKey);
  if (cached) {
    return { markdown: cached, fromCache: true, charCount: cached.length };
  }

  // Fetch the HTML from EDGAR
  const url = filingHtmlUrl(filing.cik, filing.accessionNumber, filing.primaryDocument);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`EDGAR filing fetch failed: ${res.status} for ${filing.accessionNumber}`);
  }
  const html = await res.text();

  // Convert based on extension
  let markdown;
  if (ext === 'txt') {
    // Plain text filings — just normalize line endings and trim
    markdown = html.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  } else {
    // HTML filings (.htm, .html) — clean iXBRL + convert
    const cleanHtml = cleanEdgarHtml(html);
    markdown = convertToMarkdown(cleanHtml);
  }

  // Cache permanently (10-year TTL — filings are immutable)
  cacheSet(cacheKey, markdown, 'filings');

  return { markdown, fromCache: false, charCount: markdown.length };
}

/**
 * Fetch multiple SEC filings as markdown (sequential, rate-limited).
 * @param {Object[]} filings - Array of filing objects from fetchFilings()
 * @param {Function} [onProgress] - Optional callback(completed, total)
 * @returns {Map<string, Object>} Map of accessionNumber → result
 */
export async function fetchFilingMarkdownBatch(filings, onProgress) {
  const results = new Map();

  for (let i = 0; i < filings.length; i++) {
    const filing = filings[i];
    try {
      const result = await fetchFilingMarkdown(filing);
      results.set(filing.accessionNumber, result);

      // Rate limit: only sleep between uncached, non-skipped fetches
      if (!result.fromCache && !result.skipped && i < filings.length - 1) {
        await sleep(FETCH_DELAY_MS);
      }
    } catch (err) {
      results.set(filing.accessionNumber, {
        markdown: null,
        error: err.message,
      });
    }

    if (onProgress) {
      onProgress(i + 1, filings.length);
    }
  }

  return results;
}
