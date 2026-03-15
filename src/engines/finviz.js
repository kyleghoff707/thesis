// Finviz stock quote data — 5-year EPS growth consensus, forward P/E, PEG,
// target price, analyst recommendation, ownership, and short interest.
//
// Dev: Uses Vite middleware at /api/finviz/:ticker which fetches + parses server-side.
// Tauri production: Direct fetch with browser headers, parse HTML with DOMParser.

import { cacheGetAsync, cacheSet } from './cache.js';

const isDev = import.meta.env.DEV;
const CACHE_V = 'v1';

function cacheKey(ticker) {
  return `finviz:${CACHE_V}:${ticker.toUpperCase()}`;
}

// --- Parse percentage string: "12.50%" → 12.5, "-" → null ---
function parsePct(val) {
  if (val == null || val === '-' || val === '') return null;
  if (typeof val === 'number') return val;
  const clean = String(val).replace(/%/g, '').replace(/,/g, '').trim();
  const n = parseFloat(clean);
  return isNaN(n) ? null : n;
}

// --- Parse dollar string: "$245.00" → 245, "-" → null ---
function parseDollar(val) {
  if (val == null || val === '-' || val === '') return null;
  if (typeof val === 'number') return val;
  const clean = String(val).replace(/[$,]/g, '').trim();
  const n = parseFloat(clean);
  return isNaN(n) ? null : n;
}

// --- Parse numeric: "1.80" → 1.8, "-" → null ---
function parseNum(val) {
  if (val == null || val === '-' || val === '') return null;
  if (typeof val === 'number') return val;
  const clean = String(val).replace(/,/g, '').trim();
  const n = parseFloat(clean);
  return isNaN(n) ? null : n;
}

// --- Normalize data from middleware JSON (camelCase keys from cheerio parse) ---
function normalizeFinvizData(raw) {
  return {
    // Key names come from Finviz HTML labels → camelCase conversion
    // e.g., "EPS next 5Y" → epsNext5y, "EPS past 5Y" → epsPast35y (quirk)
    epsNext5Y: parsePct(raw.epsNext5y ?? raw.epsNext5Y),
    epsThisY: parsePct(raw.epsThisY),
    epsNextY: parsePct(raw.epsNextY),
    epsPast5Y: parsePct(raw.epsPast35y ?? raw.epsPast5y ?? raw.epsPast5Y),
    salesPast5Y: parsePct(raw.salesPast35y ?? raw.salesPast5y ?? raw.salesPast5Y),
    forwardPE: parseNum(raw.forwardPE ?? raw.forwardPe),
    peg: parseNum(raw.peg),
    targetPrice: parseDollar(raw.targetPrice),
    recommendation: parseNum(raw.recom),
    shortFloat: parsePct(raw.shortFloat),
    insiderOwnership: parsePct(raw.insiderOwn),
    instOwnership: parsePct(raw.instOwn),
    instTransactions: parsePct(raw.instTrans),
    price: parseNum(raw.price),
    roe: parsePct(raw.roe),
    roic: parsePct(raw.roic),
    roa: parsePct(raw.roa),
    _fetchedAt: Date.now(),
  };
}

// --- Parse HTML in browser (Tauri production) using DOMParser ---
function parseFinvizHtml(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const rows = doc.querySelectorAll('table.snapshot-table2 tr');
  const data = {};

  rows.forEach(row => {
    const cells = row.querySelectorAll(':scope > td');
    let lastKey = '';
    cells.forEach((cell, j) => {
      const text = cell.textContent.trim();
      if (j % 2 === 0) {
        // Label cell — convert to camelCase
        lastKey = text
          .replace(/[%()]/g, '')
          .replace(/\s*\/\s*/g, ' ')
          .trim()
          .split(/\s+/)
          .map((w, i) => i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
          .join('');
      } else if (lastKey) {
        data[lastKey] = text;
      }
    });
  });

  return normalizeFinvizData(data);
}

// --- Main fetch ---

export async function fetchFinvizData(ticker) {
  if (!ticker) return null;
  const key = cacheKey(ticker);

  const cached = await cacheGetAsync(key);
  if (cached) return cached;

  try {
    let data;

    if (isDev) {
      // Dev: use Vite middleware (server-side fetch + cheerio parse)
      const resp = await fetch(`/api/finviz/${encodeURIComponent(ticker.toUpperCase())}`);
      if (!resp.ok) return null;
      const raw = await resp.json();
      if (raw.error) return null;
      data = normalizeFinvizData(raw);
    } else {
      // Tauri production: direct fetch, parse with DOMParser
      const resp = await fetch(`https://finviz.com/quote.ashx?t=${encodeURIComponent(ticker.toUpperCase())}&p=d`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });
      if (!resp.ok) return null;
      const html = await resp.text();
      data = parseFinvizHtml(html);
    }

    // Sanity check — make sure we got at least some real data
    if (data.epsNext5Y == null && data.forwardPE == null && data.targetPrice == null) {
      return null;
    }

    cacheSet(key, data, 'analyst');
    return data;
  } catch (err) {
    console.warn('[finviz] fetch failed:', err.message);
    return null;
  }
}

export function clearFinvizCache(ticker) {
  if (!ticker) return;
  const key = cacheKey(ticker);
  try { localStorage.removeItem(`sa-cache:${key}`); } catch {}
}
