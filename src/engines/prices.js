// Yahoo Finance historical stock prices — daily OHLCV
// Free, no API key needed. Uses Yahoo's public chart endpoint.
//
// First lookup for a ticker fetches full history and stores in IndexedDB.
// Subsequent lookups read from local store, with incremental fetches for new days.
//
// CORS: Yahoo doesn't send Access-Control-Allow-Origin, so browser fetch fails.
// Dev: requests go through Vite proxy (/api/yahoo → query1.finance.yahoo.com).
// Tauri production: native webview doesn't enforce CORS, so direct calls work.

import { getStoredPrices, storePrices, appendPrices, filterByRange, isStale } from './priceStore';
import { yahooChartBase } from './apiBase';

const BASE = yahooChartBase();

// Fetch daily OHLCV data for a ticker
// range: '1y', '3y', '5y', '10y', '20y', 'max'
export async function fetchPrices(ticker, range = '5y') {
  const t = ticker.toUpperCase();

  // Check local store
  const stored = await getStoredPrices(t);

  if (stored && !isStale(stored)) {
    // Fresh local data — filter to requested range and return
    return filterByRange(stored.prices, range);
  }

  if (stored) {
    // Have data but it's stale — incremental fetch for new days
    try {
      const newPrices = await fetchFromYahoo(t, stored.lastDate);
      if (newPrices.length > 0) {
        await appendPrices(t, newPrices);
      } else {
        // No new data (weekend/holiday) — just mark as fresh
        await appendPrices(t, []);
      }
    } catch {
      // Fetch failed (offline?) — serve stale data
    }
    const updated = await getStoredPrices(t);
    return filterByRange(updated.prices, range);
  }

  // No local data — full fetch (entire history)
  const prices = await fetchFromYahoo(t, null);
  await storePrices(t, prices);
  return filterByRange(prices, range);
}

// Fetch from Yahoo Finance
// If afterDate is provided, fetches only days after that date (incremental)
// If afterDate is null, fetches full history (period1=0)
async function fetchFromYahoo(ticker, afterDate) {
  const period2 = Math.floor(Date.now() / 1000);
  let period1;

  if (afterDate) {
    // Start from the day after the last stored date
    const next = new Date(afterDate);
    next.setDate(next.getDate() + 1);
    period1 = Math.floor(next.getTime() / 1000);
  } else {
    period1 = 0; // Full history
  }

  // Don't fetch if period1 is in the future (lastDate is today)
  if (period1 >= period2) return [];

  const url = `${BASE}/${ticker}?period1=${period1}&period2=${period2}&interval=1d&includeAdjustedClose=true`;

  // Worker proxy handles User-Agent; no custom headers needed from browser.
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Yahoo Finance API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  const result = data?.chart?.result?.[0];
  if (!result || !result.timestamp) {
    return []; // No data for this period
  }

  const timestamps = result.timestamp;
  const quote = result.indicators.quote[0];
  const adjCloseArr = result.indicators.adjclose?.[0]?.adjclose || [];

  const prices = [];
  for (let i = 0; i < timestamps.length; i++) {
    if (quote.close[i] == null) continue;

    const d = new Date(timestamps[i] * 1000);
    const date = d.toISOString().slice(0, 10);

    prices.push({
      date,
      open: quote.open[i],
      high: quote.high[i],
      low: quote.low[i],
      close: quote.close[i],
      adjustedClose: adjCloseArr[i] ?? quote.close[i],
      volume: quote.volume[i],
    });
  }

  return prices;
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
