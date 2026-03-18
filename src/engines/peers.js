// ─── Peer Discovery Engine ─────────────────────────────────────────
// Discovers peer companies using the Thes1s taxonomy.
// Instant in-memory lookup from prebuilt company assignments —
// no HTTP requests needed. Replaces the old SIC-based approach
// that required dozens of SEC requests per lookup.
//
// Returns arrays of { cik, name, ticker } for use in competitor comparison.

import { getCompaniesForTier } from './thes1sClassification';
import { getTickerSearchIndex } from './edgar';

// ─── Public API ─────────────────────────────────────────────

/**
 * Get peers for a given classification tier.
 * Instant — filters the prebuilt Thes1s company index in memory.
 * @param {'sector'|'industryGroup'|'industry'} tier
 * @param {{ sector, industryGroup, industry }} classification
 * @returns {Array<{ cik, name, ticker }>}
 */
export function fetchPeersByTier(tier, classification) {
  if (!classification?.[tier]) return [];
  const companies = getCompaniesForTier(tier, classification[tier]);
  return companies.map(c => ({
    cik: c.cik,
    name: c.name,
    ticker: c.ticker || null,
  }));
}

/**
 * Enrich peer list with ticker symbols from the EDGAR ticker map.
 * Mostly a pass-through now (Thes1s assignments already include tickers),
 * but fills gaps for any peers that are missing tickers.
 * Returns [{ cik, name, ticker }] — ticker may be null if not found.
 */
export async function enrichPeersWithTickers(peers) {
  if (peers.every(p => p.ticker)) return peers;

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
    if (p.ticker) return p;
    const match = cikToTicker.get(p.cik);
    return {
      cik: p.cik,
      name: match?.name || p.name,
      ticker: match?.ticker || null,
    };
  });
}
