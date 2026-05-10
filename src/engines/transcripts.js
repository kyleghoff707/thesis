// Earnings call transcript engine.
// Checks cache, then bundled transcripts (Node), then falls back to direct Alpha Vantage (2-key failover, 50 calls/day).
// Caches in IndexedDB — transcripts are immutable once published.

import { ALPHA_VANTAGE_KEY, ALPHA_VANTAGE_KEY_2 } from './config.js';

// Rotate between AV keys to double the daily rate limit (25 calls each)
const AV_KEYS = [ALPHA_VANTAGE_KEY, ALPHA_VANTAGE_KEY_2].filter(Boolean);
let avKeyIndex = 0;
function getAVKey() {
  if (AV_KEYS.length === 0) return null;
  const key = AV_KEYS[avKeyIndex % AV_KEYS.length];
  avKeyIndex++;
  return key;
}
import { cacheGetAsync, cacheSet, cacheClear } from './cache.js';

const AV_BASE = 'https://www.alphavantage.co/query';

// Forms that have associated quarterly earnings calls
const EARNINGS_FORMS = new Set(['10-K', '10-K/A', '10-Q', '10-Q/A', '20-F', '20-F/A', '10-KSB']);

export function isEarningsFiling(form) {
  return EARNINGS_FORMS.has(form);
}

// ─── Fetch Single Transcript ────────────────────────────────

/**
 * Fetch a single transcript. Checks cache, then tries Alpha Vantage (2-key failover).
 * Returns { found, text, meta, fromCache, charCount } or { found: false, reason }.
 */
export async function fetchTranscript(ticker, transcriptEntry) {
  if (!transcriptEntry) return { found: false, reason: 'No transcript entry' };

  const { year, quarter } = transcriptEntry;
  const cacheKey = `transcript:v1:${ticker}:${year}:Q${quarter}`;

  // Check cache
  const cached = await cacheGetAsync(cacheKey);
  if (cached) {
    return {
      found: true,
      text: cached.text,
      meta: cached.meta,
      fromCache: true,
      charCount: cached.text?.length || 0,
    };
  }

  // Try repo-bundled transcripts (Node only — set up by nodeAdapter).
  // CLI users have no R2 access, so this is the primary path.
  if (typeof globalThis.__nodeTranscriptRead === 'function') {
    const local = globalThis.__nodeTranscriptRead(ticker.toUpperCase(), year, quarter);
    if (local) {
      cacheSet(cacheKey, local, 'transcript');
      return { found: true, text: local.text, meta: local.meta, fromCache: false, charCount: local.text.length };
    }
  }

  // Try Alpha Vantage (try both keys if available)
  let text = null;
  let meta = null;

  if (AV_KEYS.length > 0) {
    const avQuarter = `${year}Q${quarter}`;
    for (let attempt = 0; attempt < AV_KEYS.length; attempt++) {
      try {
        const apiKey = getAVKey();
        const url = `${AV_BASE}?function=EARNINGS_CALL_TRANSCRIPT&symbol=${encodeURIComponent(ticker)}&quarter=${avQuarter}&apikey=${apiKey}`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          if (data['Note'] || data['Information']) {
            // Rate limited — try next key
            continue;
          }
          if (!data['Error Message'] && data.transcript?.length) {
            text = formatAlphaVantageTranscript(data);
            meta = { source: 'alpha_vantage', quarter: avQuarter, year, quarterNum: quarter };
            break;
          }
        }
      } catch (err) {
        console.warn('Alpha Vantage transcript fetch error:', err.message);
      }
    }
  }

  if (!text) {
    return { found: false, reason: 'Transcript not available from any source' };
  }

  // Cache (immutable — 10 year TTL)
  const result = { text, meta };
  cacheSet(cacheKey, result, 'transcript');

  return { found: true, text, meta, fromCache: false, charCount: text.length };
}

/**
 * Auto-fetch transcript for a filing. Used by AI agents.
 * Derives quarter from filing date and tries Alpha Vantage.
 */
export async function fetchTranscriptForFiling(ticker, filing) {
  if (!isEarningsFiling(filing.form)) {
    return { found: false, reason: 'Not an earnings filing' };
  }

  // Derive quarter from filing report date and try Alpha Vantage
  // Non-calendar fiscal years (LULU, COST, etc.) cause quarter mismatches,
  // so try the best guess first, then adjacent quarters + prior year Q4
  if (AV_KEYS.length > 0 && filing.reportDate) {
    const [y, m] = filing.reportDate.split('-').map(Number);
    const isAnnual = filing.form?.startsWith('10-K') || filing.form?.startsWith('20-F') || filing.form === '10-KSB';
    const bestGuessQ = isAnnual ? 4 : Math.ceil(m / 3);

    // Build candidate list: best guess, then adjacent quarters, then prior year
    const candidates = [
      { year: y, quarter: bestGuessQ },
    ];
    // Add adjacent quarters (fiscal year offset companies)
    for (const offset of [-1, 1, -2]) {
      let cq = bestGuessQ + offset;
      let cy = y;
      if (cq < 1) { cq += 4; cy -= 1; }
      if (cq > 4) { cq -= 4; cy += 1; }
      candidates.push({ year: cy, quarter: cq });
    }

    for (const { year: cy, quarter: cq } of candidates) {
      const result = await fetchTranscript(ticker, { year: cy, quarter: cq });
      if (result.found) return result;
    }
  }

  return { found: false, reason: 'No matching transcript found' };
}

// ─── Cache Utilities ────────────────────────────────────────

/**
 * Check cache for multiple filings' transcripts.
 * Accepts either a matchMap (Map<accession, entry>) or an array of filings.
 * Returns Map<accessionNumber, { charCount }>.
 */
export async function checkTranscriptCache(ticker, filingsOrMap) {
  const results = new Map();

  // Handle both Map (matched entries) and Array (filings) inputs
  const entries = filingsOrMap instanceof Map
    ? [...filingsOrMap.entries()].map(([acc, entry]) => ({ accession: acc, year: entry.year, quarter: entry.quarter }))
    : filingsOrMap.filter(f => isEarningsFiling(f.form)).map(f => {
        const [y, m] = (f.reportDate || '').split('-').map(Number);
        if (!y) return null;
        const isAnnual = f.form?.startsWith('10-K') || f.form?.startsWith('20-F') || f.form === '10-KSB';
        const q = isAnnual ? 4 : Math.ceil(m / 3);
        return { accession: f.accessionNumber, year: y, quarter: q };
      }).filter(Boolean);

  for (const { accession, year, quarter } of entries) {
    const cacheKey = `transcript:v1:${ticker}:${year}:Q${quarter}`;
    const cached = await cacheGetAsync(cacheKey);
    if (cached) {
      results.set(accession, { charCount: cached.text?.length || 0 });
    }
  }

  return results;
}

/**
 * Clear cached transcript for re-fetch.
 */
export function clearTranscriptCache(ticker, year, quarter) {
  cacheClear(`transcript:v1:${ticker}:${year}:Q${quarter}`);
}

// ─── Formatters ─────────────────────────────────────────────

function formatAlphaVantageTranscript(data) {
  if (typeof data.transcript === 'string') {
    return `# Earnings Call Transcript\n\n${data.transcript}`;
  }

  if (Array.isArray(data.transcript) && data.transcript.length > 0) {
    const lines = [];
    lines.push(`# Earnings Call Transcript`);
    if (data.symbol) lines.push(`**${data.symbol}** — ${data.quarter || ''}`);
    lines.push('');

    // Extract unique participants with titles
    const participants = new Map();
    for (const seg of data.transcript) {
      if (seg.speaker && seg.title && !participants.has(seg.speaker)) {
        participants.set(seg.speaker, seg.title);
      }
    }
    if (participants.size > 0) {
      lines.push('## Participants');
      lines.push('');
      for (const [name, title] of participants) {
        lines.push(`- **${name}** — ${title}`);
      }
      lines.push('');
      lines.push('---');
      lines.push('');
    }

    // AV fields: speaker, title, content, sentiment
    for (const seg of data.transcript) {
      const speaker = seg.speaker || 'Unknown';
      const title = seg.title || '';
      const content = seg.content || seg.text || seg.speech || '';
      lines.push(`**${speaker}** *(${title})*:`);
      lines.push('');
      lines.push(content);
      lines.push('');
    }

    return lines.join('\n');
  }

  // Last resort
  return `# Earnings Call Transcript\n\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``;
}
