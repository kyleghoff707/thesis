// ─── Batch Yahoo Finance Quotes ────────────────────────────────────
// Fetches quote data (market cap, price, PE, EPS, book value, shares, etc.)
// for multiple tickers via the yahoo-quotes middleware.
// Uses per-ticker caching so tier switches don't refetch already-cached tickers.

import { cacheGet, cacheSet } from './cache';
import { yahooQuotesUrl } from './apiBase';

/**
 * Fetch batch quotes for an array of tickers.
 * Returns Map<ticker, { marketCap, price, pe, forwardPE, dividendYield, ... }>
 * Per-ticker cache (1 hour). Only fetches uncached tickers from Yahoo.
 */
export async function fetchBatchQuotes(tickers) {
  if (!tickers || tickers.length === 0) return new Map();

  // Check per-ticker cache first
  const map = new Map();
  const uncached = [];
  for (const t of tickers) {
    const cached = cacheGet(`quote:${t}`);
    if (cached) {
      map.set(t, cached);
    } else {
      uncached.push(t);
    }
  }

  // Only fetch uncached tickers
  if (uncached.length > 0) {
    try {
      const sorted = [...uncached].sort();
      const tickerStr = sorted.join(',');
      const url = yahooQuotesUrl(tickerStr);

      const res = await fetch(url);
      if (!res.ok) throw new Error(`Batch quotes failed: ${res.status}`);
      const data = await res.json();

      for (const q of data) {
        if (q.ticker) {
          cacheSet(`quote:${q.ticker}`, q, 'prices');
          map.set(q.ticker, q);
        }
      }
    } catch (err) {
      console.warn('Batch quotes fetch failed:', err.message);
    }
  }

  return map;
}
