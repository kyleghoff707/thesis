// ─── Peer Discovery Engine ─────────────────────────────────────────
// Discovers peer companies by SIC code.
// Primary: SEC browse-edgar endpoint (may be deprecated)
// Fallback: Frames API (gets all companies) + submissions SIC lookup
// Returns arrays of { cik, name, ticker } for use in competitor comparison.

import { cacheGet, cacheGetAsync, cacheSet } from './cache';
import { getTickerSearchIndex } from './edgar';
import { SIC_MAP, getSICCodesForTier, classifyBySIC } from './sicClassification';
import { fetchFrame } from './edgarFrames';

const IS_DEV = import.meta.env.DEV;

// ─── Rate Limiting ──────────────────────────────────────────

let lastSecRequest = 0;
async function throttledFetch(url) {
  const now = Date.now();
  const elapsed = now - lastSecRequest;
  if (elapsed < 110) await new Promise(r => setTimeout(r, 110 - elapsed));
  lastSecRequest = Date.now();
  return fetch(url);
}

// ─── SEC URL Helpers ────────────────────────────────────────

function browseEdgarUrl(sic, start = 0) {
  const base = IS_DEV ? '/api/sec' : 'https://www.sec.gov';
  return `${base}/cgi-bin/browse-edgar?action=getcompany&SIC=${sic}&owner=include&match=&start=${start}&count=100&hidefilings=0&output=atom`;
}

function submissionsUrl(cik) {
  const base = IS_DEV ? '/api/edgar' : 'https://data.sec.gov';
  return `${base}/submissions/CIK${cik}.json`;
}

// ─── ATOM Feed Parser ───────────────────────────────────────

function parseAtomFeed(xml) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');
  const entries = doc.querySelectorAll('entry');
  const companies = [];
  for (const entry of entries) {
    const cikEl = entry.querySelector('cik') || entry.querySelector('CIK');
    const nameEl = entry.querySelector('conformed-name') || entry.querySelector('company-name');
    if (cikEl) {
      const cik = String(cikEl.textContent.trim()).padStart(10, '0');
      const name = nameEl ? nameEl.textContent.trim() : '';
      companies.push({ cik, name });
    }
  }
  const totalEl = doc.querySelector('totalResults') || doc.getElementsByTagNameNS('http://a9.com/-/spec/opensearch/1.1/', 'totalResults')[0];
  const total = totalEl ? parseInt(totalEl.textContent, 10) : companies.length;
  return { companies, total };
}

// ─── Strategy 1: browse-edgar (may be deprecated) ───────────

async function fetchPeersBySIC_browseEdgar(sicCode) {
  const allCompanies = [];
  let start = 0;
  let total = Infinity;

  while (start < total) {
    const url = browseEdgarUrl(sicCode, start);
    const res = await throttledFetch(url);
    if (!res.ok) return null; // Signal failure → try fallback
    const xml = await res.text();
    // Check for valid ATOM XML (not an HTML error page)
    if (!xml.includes('<feed') && !xml.includes('<entry')) return null;
    const { companies, total: t } = parseAtomFeed(xml);
    total = t;
    if (companies.length === 0) break;
    allCompanies.push(...companies);
    start += 100;
  }

  return allCompanies;
}

// ─── Strategy 2: Frames API + Submissions SIC Lookup ────────
// Fetches Revenue frame (all companies), then checks SIC via submissions.
// Builds a cached SIC index progressively.

// In-memory SIC index: cik → sicCode
const sicIndex = new Map();

async function fetchSICForCIK(cik) {
  // Check in-memory index first
  if (sicIndex.has(cik)) return sicIndex.get(cik);

  // Check cache (submissions data already cached by edgar.js)
  const cacheKey = `edgar:company:${cik}`;
  const cached = cacheGet(cacheKey);
  if (cached?.sic) {
    sicIndex.set(cik, cached.sic);
    return cached.sic;
  }

  // Fetch submissions
  const url = submissionsUrl(cik);
  try {
    const res = await throttledFetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const sic = data.sic || null;
    if (sic) {
      sicIndex.set(cik, sic);
      // Cache the company info for reuse by other parts of the app
      const info = {
        name: data.name || '',
        sic,
        sicDescription: data.sicDescription || '',
        cik,
      };
      cacheSet(cacheKey, info, 'companyDetails');
    }
    return sic;
  } catch {
    return null;
  }
}

async function fetchPeersBySIC_frames(sicCode) {
  // Latest complete year for frames data
  const now = new Date();
  const year = now.getFullYear();
  const latestYear = now.getMonth() >= 3 ? year - 1 : year - 2;

  // Fetch Revenue frame — returns ALL companies with revenue data
  let framesData = await fetchFrame('Revenues', 'USD', latestYear);
  if (!framesData?.data) {
    framesData = await fetchFrame('Revenues', 'USD', latestYear - 1);
  }
  if (!framesData?.data) return [];

  // Get ticker index to resolve CIK → ticker
  const tickerIndex = await getTickerSearchIndex();
  const cikToTicker = new Map();
  for (const entry of tickerIndex) {
    const padded = String(entry.cik).padStart(10, '0');
    const existing = cikToTicker.get(padded);
    if (!existing || entry.ticker.length < existing.ticker.length) {
      cikToTicker.set(padded, entry);
    }
  }

  // Filter to companies that have tickers (public, tradable)
  // Sort by revenue descending, take top 500 for SIC lookup
  const candidates = framesData.data
    .filter(d => {
      const padded = String(d.cik).padStart(10, '0');
      return cikToTicker.has(padded);
    })
    .sort((a, b) => (b.val || 0) - (a.val || 0))
    .slice(0, 500);

  // Batch-fetch SIC codes for candidates
  const matchingPeers = [];
  const targetSIC = String(sicCode).padStart(4, '0');

  for (let i = 0; i < candidates.length; i += 8) {
    const batch = candidates.slice(i, i + 8);
    const results = await Promise.all(
      batch.map(d => {
        const padded = String(d.cik).padStart(10, '0');
        return fetchSICForCIK(padded).then(sic => ({ cik: padded, sic, name: d.entityName }));
      })
    );
    for (const r of results) {
      if (r.sic && String(r.sic).padStart(4, '0') === targetSIC) {
        matchingPeers.push({ cik: r.cik, name: r.name });
      }
    }
  }

  return matchingPeers;
}

// ─── Public API ─────────────────────────────────────────────

/**
 * Fetch all companies filing under a given SIC code.
 * Tries browse-edgar first, falls back to Frames + submissions.
 * Returns [{ cik, name }]. Cached for 24h.
 */
export async function fetchPeersBySIC(sicCode) {
  const cacheKey = `peers:sic:${sicCode}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  // Strategy 1: browse-edgar
  let companies = null;
  try {
    companies = await fetchPeersBySIC_browseEdgar(sicCode);
  } catch {
    companies = null;
  }

  // Strategy 2: Frames + submissions fallback
  if (!companies || companies.length === 0) {
    try {
      companies = await fetchPeersBySIC_frames(sicCode);
    } catch (err) {
      console.warn(`Fallback peer discovery failed for SIC ${sicCode}:`, err.message);
      companies = [];
    }
  }

  // Deduplicate by CIK
  const seen = new Set();
  const unique = (companies || []).filter(c => {
    if (seen.has(c.cik)) return false;
    seen.add(c.cik);
    return true;
  });

  if (unique.length > 0) {
    cacheSet(cacheKey, unique, 'financials');
  }
  return unique;
}

/**
 * Fetch peers for a given classification tier.
 * tier: 'sector' | 'industryGroup' | 'industry'
 * classification: { sector, industryGroup, industry } from classifyBySIC()
 * companySIC: the target company's raw SIC code
 * Returns [{ cik, name }]
 */
export async function fetchPeersByTier(tier, classification, companySIC) {
  if (tier === 'industry') {
    const sicCodes = getSICCodesForTier('industry', classification.industry);
    sicCodes.add(String(companySIC).padStart(4, '0'));

    if (sicCodes.size === 1) {
      return fetchPeersBySIC(companySIC);
    }

    const allPeers = [];
    for (const sic of sicCodes) {
      const peers = await fetchPeersBySIC(sic);
      allPeers.push(...peers);
    }
    const seen = new Set();
    return allPeers.filter(c => {
      if (seen.has(c.cik)) return false;
      seen.add(c.cik);
      return true;
    });
  }

  // For industryGroup or sector: collect all matching SIC codes
  const sicCodes = getSICCodesForTier(tier, classification[tier]);
  sicCodes.add(String(companySIC).padStart(4, '0'));

  const allPeers = [];
  const sicArray = Array.from(sicCodes);

  for (let i = 0; i < sicArray.length; i += 5) {
    const batch = sicArray.slice(i, i + 5);
    const results = await Promise.all(batch.map(sic => fetchPeersBySIC(sic)));
    for (const peers of results) allPeers.push(...peers);
  }

  const seen = new Set();
  return allPeers.filter(c => {
    if (seen.has(c.cik)) return false;
    seen.add(c.cik);
    return true;
  });
}

/**
 * Enrich peer list with ticker symbols from the EDGAR ticker map.
 * Returns [{ cik, name, ticker }] — ticker may be null if not found.
 */
export async function enrichPeersWithTickers(peers) {
  const index = await getTickerSearchIndex();
  const cikToTicker = new Map();
  for (const entry of index) {
    const padded = String(entry.cik).padStart(10, '0');
    const existing = cikToTicker.get(padded);
    if (!existing || entry.ticker.length < existing.ticker.length) {
      cikToTicker.set(padded, entry);
    }
  }

  return peers.map(p => {
    const match = cikToTicker.get(p.cik);
    return {
      cik: p.cik,
      name: match?.name || p.name,
      ticker: match?.ticker || null,
    };
  });
}
