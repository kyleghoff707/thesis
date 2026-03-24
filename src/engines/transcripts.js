// Earnings call transcript engine
// Fetches from Finnhub (primary) with Alpha Vantage fallback
// Caches in IndexedDB — transcripts are immutable once published

import { FINNHUB_KEY, ALPHA_VANTAGE_KEY } from './config.js';
import { cacheGetAsync, cacheSet, cacheClear } from './cache.js';

const FINNHUB_BASE = 'https://finnhub.io/api/v1';
const AV_BASE = 'https://www.alphavantage.co/query';

// Forms that have associated quarterly earnings calls
const EARNINGS_FORMS = new Set(['10-K', '10-Q', '20-F', '10-KSB']);

export function isEarningsFiling(form) {
  return EARNINGS_FORMS.has(form);
}

// ─── Transcript List ────────────────────────────────────────

/**
 * Fetch list of available transcripts for a ticker from Finnhub.
 * Returns array of { id, title, time, year, quarter }.
 * Cached for 6 hours (new transcripts appear quarterly).
 */
export async function fetchTranscriptList(ticker) {
  if (!FINNHUB_KEY) return [];

  const cacheKey = `transcript-list:v1:${ticker}`;
  const cached = await cacheGetAsync(cacheKey);
  if (cached) return cached;

  try {
    const url = `${FINNHUB_BASE}/stock/transcripts/list?symbol=${encodeURIComponent(ticker)}&token=${FINNHUB_KEY}`;
    const res = await fetch(url);
    if (!res.ok) {
      // 403 = premium-only endpoint on free tier — cache empty to avoid retrying
      if (res.status === 403) cacheSet(cacheKey, [], 'events');
      return [];
    }

    const data = await res.json();
    const list = Array.isArray(data) ? data : (data.transcripts || []);

    cacheSet(cacheKey, list, 'events'); // 6-hour TTL
    return list;
  } catch {
    return [];
  }
}

// ─── Matching ───────────────────────────────────────────────

/**
 * Match transcript list entries to earnings filings by date proximity.
 * Earnings calls typically happen 0–60 days before the SEC filing.
 * Returns Map<accessionNumber, transcriptEntry>.
 */
export function matchTranscriptsToFilings(transcriptList, filings) {
  if (!transcriptList?.length || !filings?.length) return new Map();

  const earningsFilings = filings.filter(f => isEarningsFiling(f.form));
  const matches = new Map();
  const usedTranscripts = new Set();

  // Sort filings newest-first for greedy matching
  const sorted = [...earningsFilings].sort((a, b) =>
    (b.filingDate || '').localeCompare(a.filingDate || '')
  );

  for (const filing of sorted) {
    if (!filing.filingDate) continue;
    const filingDate = new Date(filing.filingDate);

    let bestMatch = null;
    let bestDist = Infinity;

    for (const t of transcriptList) {
      if (usedTranscripts.has(t.id)) continue;
      if (!t.time) continue;

      const callDate = new Date(t.time);
      const daysDiff = (filingDate - callDate) / 86_400_000;

      // Call happens 0–60 days before filing, rarely after
      if (daysDiff >= -10 && daysDiff <= 75) {
        const dist = Math.abs(daysDiff);
        if (dist < bestDist) {
          bestDist = dist;
          bestMatch = t;
        }
      }
    }

    if (bestMatch) {
      matches.set(filing.accessionNumber, bestMatch);
      usedTranscripts.add(bestMatch.id);
    }
  }

  return matches;
}

// ─── Fetch Single Transcript ────────────────────────────────

/**
 * Fetch a single transcript. Checks cache, tries Finnhub, falls back to Alpha Vantage.
 * Returns { found, text, meta, fromCache, charCount } or { found: false, reason }.
 */
export async function fetchTranscript(ticker, transcriptEntry) {
  if (!transcriptEntry) return { found: false, reason: 'No transcript entry' };

  const { year, quarter, id } = transcriptEntry;
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

  // Try Finnhub
  let text = null;
  let meta = null;

  if (FINNHUB_KEY && id) {
    try {
      const url = `${FINNHUB_BASE}/stock/transcripts?id=${encodeURIComponent(id)}&token=${FINNHUB_KEY}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data?.transcript?.length) {
          text = formatFinnhubTranscript(data);
          meta = {
            source: 'finnhub',
            id,
            title: data.title || `Q${quarter} ${year} Earnings Call`,
            time: data.time,
            participants: data.participant?.length || 0,
            year,
            quarter,
          };
        }
      }
    } catch (err) {
      console.warn('Finnhub transcript fetch error:', err.message);
    }
  }

  // Fallback to Alpha Vantage
  if (!text && ALPHA_VANTAGE_KEY) {
    try {
      const avQuarter = `${year}Q${quarter}`;
      const url = `${AV_BASE}?function=EARNINGS_CALL_TRANSCRIPT&symbol=${encodeURIComponent(ticker)}&quarter=${avQuarter}&apikey=${ALPHA_VANTAGE_KEY}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (!data['Error Message'] && !data['Note'] && !data['Information'] && data.transcript?.length) {
          text = formatAlphaVantageTranscript(data);
          meta = { source: 'alpha_vantage', quarter: avQuarter, year, quarterNum: quarter };
        }
      }
    } catch (err) {
      console.warn('Alpha Vantage transcript fetch error:', err.message);
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
 * Fetches transcript list if needed, matches, then fetches transcript.
 */
export async function fetchTranscriptForFiling(ticker, filing) {
  if (!isEarningsFiling(filing.form)) {
    return { found: false, reason: 'Not an earnings filing' };
  }

  // Try to find matching transcript from Finnhub list
  const list = await fetchTranscriptList(ticker);
  const matches = matchTranscriptsToFilings(list, [filing]);
  const match = matches.get(filing.accessionNumber);

  if (match) {
    return await fetchTranscript(ticker, match);
  }

  // No match from Finnhub list — try Alpha Vantage directly
  if (ALPHA_VANTAGE_KEY && filing.reportDate) {
    const [y, m] = filing.reportDate.split('-').map(Number);
    const isAnnual = filing.form?.startsWith('10-K') || filing.form?.startsWith('20-F') || filing.form === '10-KSB';
    // Annual reports = Q4 of the fiscal year. AV uses fiscal quarter labels.
    // Quarterly: derive from calendar month (correct for 80%+ of companies).
    const q = isAnnual ? 4 : Math.ceil(m / 3);
    return await fetchTranscript(ticker, { year: y, quarter: q, id: null });
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

function formatFinnhubTranscript(data) {
  const lines = [];

  // Header
  lines.push(`# ${data.title || 'Earnings Call Transcript'}`);
  if (data.symbol) lines.push(`**${data.symbol}**`);
  if (data.time) {
    const d = new Date(data.time);
    lines.push(`**Date:** ${d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`);
  }
  lines.push('');

  // Participants
  if (data.participant?.length) {
    lines.push('## Participants');
    lines.push('');
    for (const p of data.participant) {
      const role = p.description || p.role || '';
      lines.push(`- **${p.name}**${role ? ` — ${role}` : ''}`);
    }
    lines.push('');
  }

  // Transcript body grouped by session
  let currentSession = null;
  for (const seg of data.transcript) {
    if (seg.session !== currentSession) {
      currentSession = seg.session;
      lines.push('---');
      lines.push('');
      if (currentSession === 'qa' || currentSession === 'Q&A') {
        lines.push('## Questions & Answers');
      } else if (currentSession === 'management_discussion' || currentSession === 'Prepared Remarks') {
        lines.push('## Prepared Remarks');
      } else {
        lines.push(`## ${currentSession || 'Transcript'}`);
      }
      lines.push('');
    }

    lines.push(`**${seg.name}:**`);
    lines.push('');
    if (Array.isArray(seg.speech)) {
      lines.push(seg.speech.join('\n\n'));
    } else if (typeof seg.speech === 'string') {
      lines.push(seg.speech);
    }
    lines.push('');
  }

  return lines.join('\n');
}

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
