// Node.js Yahoo Finance direct calls — replaces Vite middleware endpoints
// Used by nodeAdapter.js fetch interceptor when running in Node.js.
// Calls yahoo-finance2 directly instead of going through /api/yahoo-summary/
// and /api/yahoo-quotes/ Vite middleware.

let yf = null;

async function getYF() {
  if (!yf) {
    const mod = await import('yahoo-finance2');
    const YahooFinance = mod.default;
    yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
  }
  return yf;
}

const DEFAULT_MODULES = [
  'defaultKeyStatistics',
  'financialData',
  'calendarEvents',
  'earningsTrend',
  'recommendationTrend',
  'upgradeDowngradeHistory',
];

/**
 * Fetch Yahoo Finance quoteSummary for a single ticker.
 * Direct replacement for Vite middleware /api/yahoo-summary/:ticker.
 * @param {string} ticker - Stock ticker symbol
 * @param {string[]} [modules] - Yahoo Finance modules to request
 * @returns {Promise<object>} quoteSummary result object
 */
export async function yahooSummary(ticker, modules) {
  const client = await getYF();
  const mods = modules && modules.length > 0 ? modules : DEFAULT_MODULES;
  return client.quoteSummary(ticker, { modules: mods });
}

/**
 * Fetch Yahoo Finance batch quotes for multiple tickers.
 * Direct replacement for Vite middleware /api/yahoo-quotes/:tickers.
 * Returns the same shape as the Vite middleware (array of quote objects).
 * @param {string} tickerString - Comma-separated ticker symbols
 * @returns {Promise<object[]>} Array of quote objects with normalized fields
 */
export async function yahooQuotes(tickerString) {
  const client = await getYF();
  const tickers = tickerString.split(',').map(t => t.trim().toUpperCase()).filter(Boolean);
  if (tickers.length === 0) return [];

  const results = [];
  // Chunk into batches of 50 to match Vite middleware behavior
  for (let i = 0; i < tickers.length; i += 50) {
    const batch = tickers.slice(i, i + 50);
    try {
      const quotes = await client.quote(batch);
      const arr = Array.isArray(quotes) ? quotes : [quotes];
      for (const q of arr) {
        if (q && q.symbol) {
          results.push({
            ticker: q.symbol,
            marketCap: q.marketCap || null,
            price: q.regularMarketPrice || null,
            pe: q.trailingPE || null,
            forwardPE: q.forwardPE || null,
            dividendYield: q.dividendYield || null,
            fiftyTwoWeekHigh: q.fiftyTwoWeekHigh || null,
            fiftyTwoWeekLow: q.fiftyTwoWeekLow || null,
            epsTrailingTwelveMonths: q.epsTrailingTwelveMonths || null,
            epsForward: q.epsForward || null,
            bookValue: q.bookValue || null,
            priceToBook: q.priceToBook || null,
            sharesOutstanding: q.sharesOutstanding || null,
          });
        }
      }
    } catch (err) {
      console.warn(`Yahoo batch quote error for ${batch.join(',')}:`, err.message);
    }
  }

  return results;
}
