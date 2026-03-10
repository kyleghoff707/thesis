// Polygon ticker search — search by ticker symbol or company name
// Used for the autocomplete dropdown in the header

import { POLYGON_KEY } from './config';

const BASE = 'https://api.polygon.io/v3/reference/tickers';

export async function searchTickers(query, limit = 8) {
  if (!query || query.length < 1) return [];

  const url = `${BASE}?search=${encodeURIComponent(query)}&active=true&limit=${limit}&apiKey=${POLYGON_KEY}`;
  const res = await fetch(url);
  if (!res.ok) return [];

  const data = await res.json();
  return (data.results || [])
    .filter(r => r.market === 'stocks') // Only stocks, not crypto/forex/options
    .map(r => ({
      ticker: r.ticker,
      name: r.name,
      exchange: r.primary_exchange,
      type: r.type,
    }));
}
