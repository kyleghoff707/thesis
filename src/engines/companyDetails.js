// Polygon.io company details — name, description, SIC code, market cap, etc.

import { POLYGON_KEY } from './config';
import { cacheGet, cacheSet } from './cache';

const BASE = 'https://api.polygon.io/v3/reference/tickers';

export async function fetchCompanyDetails(ticker) {
  const cacheKey = `company:${ticker}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const url = `${BASE}/${ticker}?apiKey=${POLYGON_KEY}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Polygon API error: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  const r = data.results || {};

  const details = {
    ticker: r.ticker,
    name: r.name,
    description: r.description || '',
    sic: r.sic_code,
    sicDescription: r.sic_description || '',
    marketCap: r.market_cap,
    sharesOutstanding: r.share_class_shares_outstanding || r.weighted_shares_outstanding,
    locale: r.locale,
    exchange: r.primary_exchange,
    type: r.type,
    phoneNumber: r.phone_number,
    address: r.address,
    homepage: r.homepage_url,
    listDate: r.list_date,
    totalEmployees: r.total_employees,
    branding: r.branding,
  };

  cacheSet(cacheKey, details, 'companyDetails');
  return details;
}
