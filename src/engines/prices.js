// EODHD historical stock prices — daily OHLCV
// Used ONLY for price data (fundamentals endpoint is Forbidden on current tier)

import { EODHD_KEY } from './config';
import { cacheGet, cacheSet } from './cache';

// In dev mode, use Vite proxy to avoid CORS. In Tauri production, call EODHD directly.
const isDev = import.meta.env.DEV;
const BASE = isDev ? '/api/eodhd/eod' : 'https://eodhd.com/api/eod';

// Fetch daily OHLCV data for a ticker
// range: '1y', '5y', '10y', 'max', or { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }
export async function fetchPrices(ticker, range = '5y') {
  const { from, to } = parseDateRange(range);
  const cacheKey = `prices:${ticker}:${from}:${to}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const url = `${BASE}/${ticker}.US?from=${from}&to=${to}&period=d&fmt=json&api_token=${EODHD_KEY}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`EODHD API error: ${res.status} ${res.statusText}`);
  }
  const raw = await res.json();

  // Normalize to consistent shape
  const prices = raw.map(d => ({
    date: d.date,
    open: d.open,
    high: d.high,
    low: d.low,
    close: d.close,
    adjustedClose: d.adjusted_close,
    volume: d.volume,
  }));

  cacheSet(cacheKey, prices, 'prices');
  return prices;
}

function parseDateRange(range) {
  const today = new Date();
  const to = fmt(today);

  if (typeof range === 'object' && range.from && range.to) {
    return { from: range.from, to: range.to };
  }

  const years = {
    '1y': 1,
    '3y': 3,
    '5y': 5,
    '10y': 10,
    '20y': 20,
    'max': 30,
  };

  const y = years[range] || 5;
  const fromDate = new Date(today);
  fromDate.setFullYear(fromDate.getFullYear() - y);
  return { from: fmt(fromDate), to };
}

function fmt(d) {
  return d.toISOString().slice(0, 10);
}

// Get latest price from price data
export function latestPrice(prices) {
  if (!prices || prices.length === 0) return null;
  const last = prices[prices.length - 1];
  return {
    price: last.adjustedClose ?? last.close,
    date: last.date,
    change: last.close - last.open,
    changePct: ((last.close - last.open) / last.open) * 100,
  };
}
