// Filing Content Pre-Fetch for Worker Pipeline.
// Fetches SEC filing HTML from EDGAR, cleans iXBRL with cheerio,
// converts to markdown via Turndown, extracts key sections, and
// fetches earnings call transcripts from R2 (with AV fallback).
//
// This runs server-side in the Worker — the browser version
// (filingMarkdown.js) uses DOMParser which doesn't exist in Workers.
// cheerio provides the HTML manipulation; Turndown uses its built-in
// domino DOM for the markdown conversion.

import '../shims/domino-polyfill.js';  // Must be before Turndown — sets up DOMParser for Workers
import * as cheerio from 'cheerio';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import { extractAllSections } from '../../../src/engines/filingSections.js';
import { formatAlphaVantageTranscript } from '../../../packages/sec-parsers/formatTranscript.js';

// ─── Config ─────────────────────────────────────────────────

const SEC_UA = 'Thes1s/1.0 kylehoff@thes1sinvesting.com';
const MAX_10K = 5;
const MAX_10Q = 4;
const MAX_TRANSCRIPTS = 4;
const BATCH_SIZE = 3;
const SECTION_LIMIT_10K = 40_000;
const SECTION_LIMIT_10Q = 15_000;

// ─── Main API ───────────────────────────────────────────────

/**
 * Assemble filing content (markdown sections + transcripts) for a ticker.
 *
 * @param {string} ticker - Stock ticker
 * @param {object} dataPacket - DataPacket with .filings array and .companyInfo.cik
 * @param {object} env - Worker env (TRANSCRIPTS R2 binding, ALPHA_VANTAGE_KEY, ALPHA_VANTAGE_KEY_2)
 * @returns {Promise<{ filingContent, transcriptContent, errors, stats }>}
 */
export async function assembleFilingContent(ticker, dataPacket, env) {
  const startTime = Date.now();
  const errors = [];
  const upperTicker = ticker.toUpperCase();
  const cik = dataPacket?.companyInfo?.cik;

  // 1. Select filings
  const { tenKs, tenQs } = selectFilings(dataPacket?.filings);

  // 2. Fetch + convert filings to markdown sections
  const filingContent = {};
  const allFilings = [...tenKs, ...tenQs];
  let filingsFetched = 0;

  // Process in batches of BATCH_SIZE
  for (let i = 0; i < allFilings.length; i += BATCH_SIZE) {
    const batch = allFilings.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(f => processFiling(f, cik, env, errors))
    );

    for (let j = 0; j < results.length; j++) {
      const filing = batch[j];
      const result = results[j];
      if (result.status === 'fulfilled' && result.value) {
        const key = `${filing.form}-${filing.filingDate}`;
        filingContent[key] = result.value;
        filingsFetched++;
      } else if (result.status === 'rejected') {
        errors.push(`filing ${filing.accessionNumber}: ${result.reason?.message || result.reason}`);
      }
    }
  }

  // 3. Fetch transcripts
  const { transcriptContent, transcriptsFetched } = await fetchTranscripts(
    upperTicker, env, errors
  );

  return {
    filingContent,
    transcriptContent,
    errors,
    stats: {
      filingsFetched,
      transcriptsFetched,
      elapsedMs: Date.now() - startTime,
    },
  };
}

// ─── Filing Selection ───────────────────────────────────────

/**
 * Pick the N most recent 10-Ks and 10-Qs from a filings array.
 * @param {object[]|null} filings - Array from dataPacket.filings
 * @returns {{ tenKs: object[], tenQs: object[] }}
 */
export function selectFilings(filings) {
  if (!Array.isArray(filings) || filings.length === 0) {
    return { tenKs: [], tenQs: [] };
  }

  const tenKs = [];
  const tenQs = [];

  // filings are already sorted by date descending from dataExport.js
  for (const f of filings) {
    // Skip XML filings (machine-readable XBRL, not human text)
    if (f.primaryDocument?.endsWith('.xml')) continue;

    if (f.form === '10-K' && tenKs.length < MAX_10K) {
      tenKs.push(f);
    } else if (f.form === '10-Q' && tenQs.length < MAX_10Q) {
      tenQs.push(f);
    }
  }

  return { tenKs, tenQs };
}

// ─── Single Filing Processing ───────────────────────────────

async function processFiling(filing, cik, env, errors) {
  if (!filing?.accessionNumber || !filing?.primaryDocument) {
    errors.push(`filing skip: missing accessionNumber or primaryDocument`);
    return null;
  }

  const accession = filing.accessionNumber;
  const r2Key = `filings-md/${accession}.md`;

  // 1. Check R2 cache first — filings are immutable
  let markdown = null;
  let fromCache = false;

  if (env?.TRANSCRIPTS) {
    try {
      const cached = await env.TRANSCRIPTS.get(r2Key);
      if (cached) {
        markdown = await cached.text();
        fromCache = true;
      }
    } catch (e) {
      errors.push(`r2-cache-read ${accession}: ${e.message}`);
    }
  }

  // 2. Fetch from SEC if not cached
  if (!markdown) {
    if (!cik) {
      errors.push(`filing ${accession}: no CIK available for URL construction`);
      return null;
    }

    const url = buildEdgarUrl(cik, accession, filing.primaryDocument);
    const res = await fetch(url, {
      headers: { 'User-Agent': SEC_UA, 'Accept': 'text/html' },
    });

    if (!res.ok) {
      errors.push(`filing ${accession}: EDGAR fetch failed ${res.status}`);
      return null;
    }

    const html = await res.text();
    const ext = filing.primaryDocument.split('.').pop()?.toLowerCase();

    if (ext === 'txt') {
      markdown = html.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
    } else {
      const cleanHtml = cleanEdgarHtml(html);
      markdown = convertToMarkdown(cleanHtml);
    }

    // 3. Cache in R2 for next time
    if (env?.TRANSCRIPTS && markdown) {
      try {
        await env.TRANSCRIPTS.put(r2Key, markdown);
      } catch (e) {
        errors.push(`r2-cache-write ${accession}: ${e.message}`);
      }
    }
  }

  if (!markdown) return null;

  // 4. Extract sections
  const formType = filing.form === '10-Q' ? '10-Q' : '10-K';
  const sections = extractAllSections(markdown, formType);
  const limit = formType === '10-Q' ? SECTION_LIMIT_10Q : SECTION_LIMIT_10K;

  // 5. Truncate oversized sections
  for (const key of Object.keys(sections)) {
    if (sections[key] && sections[key].length > limit) {
      sections[key] = sections[key].slice(0, limit) +
        `\n\n[TRUNCATED — full section available in ${formType} filing]`;
    }
  }

  const charCount = Object.values(sections).reduce((sum, s) => sum + (s?.length || 0), 0);

  return {
    form: filing.form,
    filingDate: filing.filingDate,
    sections,
    charCount,
    fromCache,
  };
}

// ─── EDGAR URL ──────────────────────────────────────────────

function buildEdgarUrl(cik, accessionNumber, primaryDocument) {
  const cleanCik = String(cik).replace(/^0+/, '');
  const accPath = accessionNumber.replace(/-/g, '');
  return `https://www.sec.gov/Archives/edgar/data/${cleanCik}/${accPath}/${primaryDocument}`;
}

// ─── iXBRL Cleanup (cheerio) ────────────────────────────────

/**
 * Clean EDGAR HTML of iXBRL markup using cheerio.
 * Mirrors the logic in src/engines/filingMarkdown.js:cleanEdgarHtml
 * but uses cheerio instead of browser DOMParser.
 */
export function cleanEdgarHtml(htmlString) {
  const $ = cheerio.load(htmlString);

  // 1. Remove hidden iXBRL elements (machine-only metadata)
  // cheerio handles namespaced tags — escape the colon in CSS selectors
  $('ix\\:hidden, ix\\:header, ix\\:references').remove();

  // 2. Unwrap visible iXBRL elements (keep text content, strip the tag)
  const unwrapSelectors = [
    'ix\\:nonfraction', 'ix\\:nonnumeric', 'ix\\:fraction',
    'ix\\:continuation', 'ix\\:exclude',
  ];
  for (const sel of unwrapSelectors) {
    $(sel).each((_, el) => {
      $(el).replaceWith($(el).contents());
    });
  }

  // 3. Remove non-content elements
  $('script, style, link, meta').remove();

  // 4. Strip style and class attributes from all elements
  $('*').removeAttr('style').removeAttr('class');

  return $('body').html() || $.html();
}

// ─── Markdown Conversion (Turndown + domino) ────────────────

let turndownInstance = null;

function getTurndown() {
  if (!turndownInstance) {
    turndownInstance = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      bulletListMarker: '-',
      emDelimiter: '*',
    });

    // Custom table rule — handles complex EDGAR tables (colspan, nested spans).
    // Must be added BEFORE gfm plugin so it takes priority.
    // The `node` here is a domino DOM node (Turndown's server-side DOM),
    // which supports querySelectorAll, textContent, etc.
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

function cellText(td) {
  return (td.textContent || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function tableToMarkdown(tableEl) {
  const rows = Array.from(tableEl.querySelectorAll('tr'));
  if (rows.length === 0) return '';

  const mdRows = [];
  for (const row of rows) {
    const cells = row.querySelectorAll('td, th');
    const cellTexts = Array.from(cells).map(cellText);
    if (cellTexts.every(t => t === '')) continue;
    mdRows.push('| ' + cellTexts.join(' | ') + ' |');
  }

  if (mdRows.length === 0) return '';

  const firstRowCols = mdRows[0].split('|').length - 2;
  const separator = '| ' + Array(firstRowCols).fill('---').join(' | ') + ' |';
  mdRows.splice(1, 0, separator);

  return '\n\n' + mdRows.join('\n') + '\n\n';
}

/**
 * Convert cleaned HTML to markdown using Turndown.
 */
export function convertToMarkdown(cleanHtml) {
  const td = getTurndown();
  let md = td.turndown(cleanHtml);

  // Post-process: collapse excessive blank lines
  md = md.replace(/\n{4,}/g, '\n\n\n');
  // Trim trailing whitespace per line
  md = md.split('\n').map(line => line.trimEnd()).join('\n');
  md = md.trim();

  return md;
}

// ─── Transcript Fetching ────────────────────────────────────

async function fetchTranscripts(ticker, env, errors) {
  const transcriptContent = {};
  let transcriptsFetched = 0;

  if (!env?.TRANSCRIPTS) {
    errors.push('transcripts: no R2 binding available');
    return { transcriptContent, transcriptsFetched };
  }

  // 1. List R2 objects for this ticker
  let r2Keys = [];
  try {
    const listed = await env.TRANSCRIPTS.list({ prefix: `transcripts/${ticker}/` });
    r2Keys = (listed.objects || []).map(o => o.key);
  } catch (e) {
    errors.push(`transcripts: R2 list failed: ${e.message}`);
  }

  // 2. Parse and sort by year/quarter descending, take most recent
  const parsed = r2Keys
    .map(key => {
      const match = key.match(/transcripts\/[A-Z.]+\/(\d{4})\/Q(\d)\.json/);
      if (!match) return null;
      return { key, year: parseInt(match[1]), quarter: parseInt(match[2]) };
    })
    .filter(Boolean)
    .sort((a, b) => a.year !== b.year ? b.year - a.year : b.quarter - a.quarter)
    .slice(0, MAX_TRANSCRIPTS);

  // 3. Fetch each transcript from R2
  for (const { key, year, quarter } of parsed) {
    try {
      const obj = await env.TRANSCRIPTS.get(key);
      if (obj) {
        const data = JSON.parse(await obj.text());
        const contentKey = `transcript-Q${quarter}-${year}`;
        transcriptContent[contentKey] = data.text || data;
        transcriptsFetched++;
      }
    } catch (e) {
      errors.push(`transcript ${key}: ${e.message}`);
    }
  }

  // 4. AV fallback if we got fewer than MAX_TRANSCRIPTS from R2
  if (transcriptsFetched < MAX_TRANSCRIPTS) {
    const avKeys = [env.ALPHA_VANTAGE_KEY, env.ALPHA_VANTAGE_KEY_2].filter(Boolean);
    if (avKeys.length > 0) {
      const needed = getExpectedQuarters(MAX_TRANSCRIPTS);
      const haveSet = new Set(Object.keys(transcriptContent));
      let avCallIdx = 0;

      for (const { year, quarter } of needed) {
        const contentKey = `transcript-Q${quarter}-${year}`;
        if (haveSet.has(contentKey)) continue;
        if (transcriptsFetched >= MAX_TRANSCRIPTS) break;

        const avKey = avKeys[avCallIdx % avKeys.length];
        const url = `https://www.alphavantage.co/query?function=EARNINGS_CALL_TRANSCRIPT&symbol=${ticker}&quarter=${year}Q${quarter}&apikey=${avKey}`;

        try {
          const res = await fetch(url);
          const data = await res.json();
          avCallIdx++;

          if (data.Note || data.Information || data['Error Message']) continue;
          if (!data.transcript || data.transcript.length === 0) continue;

          const text = formatAlphaVantageTranscript(data);
          transcriptContent[contentKey] = text;
          transcriptsFetched++;

          // Store in R2 for future use
          const r2Key = `transcripts/${ticker}/${year}/Q${quarter}.json`;
          try {
            const stored = {
              text,
              meta: { source: 'alpha_vantage', quarter: `${year}Q${quarter}`, year, quarterNum: quarter, fetchedAt: new Date().toISOString() },
            };
            await env.TRANSCRIPTS.put(r2Key, JSON.stringify(stored));
          } catch {}
        } catch (e) {
          errors.push(`transcript-av ${year}Q${quarter}: ${e.message}`);
          avCallIdx++;
        }
      }
    }
  }

  return { transcriptContent, transcriptsFetched };
}

/**
 * Get the last N expected quarters (most recent first).
 * Reused from api/src/cron/transcripts.js logic.
 */
function getExpectedQuarters(count = 4) {
  const now = new Date();
  let year = now.getFullYear();
  let q = Math.ceil((now.getMonth() + 1) / 3) - 1;
  if (q <= 0) { q = 4; year -= 1; }

  const quarters = [];
  for (let i = 0; i < count; i++) {
    quarters.push({ year, quarter: q });
    q -= 1;
    if (q <= 0) { q = 4; year -= 1; }
  }
  return quarters;
}

// Test-only exports
export const _testExports = {
  selectFilings,
  cleanEdgarHtml,
  convertToMarkdown,
  buildEdgarUrl,
  getExpectedQuarters,
  SECTION_LIMIT_10K,
  SECTION_LIMIT_10Q,
};
