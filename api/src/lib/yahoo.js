// Shared Yahoo Finance helper — used by proxy routes and cron jobs.
// Singleton pattern: yahoo-finance2 is imported once and cached.

let _yf = null;

export async function getYahooFinance() {
  if (_yf) return _yf;
  try {
    const mod = await import('yahoo-finance2');
    const YahooFinance = mod.default;
    _yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
    return _yf;
  } catch {
    throw new Error('yahoo-finance2 not available in this runtime');
  }
}

// Manual crumb-based fallback for Yahoo v10 API
export async function yahooFallback(ticker, modules) {
  const homePage = await fetch('https://finance.yahoo.com/', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
  });
  const cookies = homePage.headers.get('set-cookie') || '';
  const html = await homePage.text();

  const crumbMatch = html.match(/"crumb"\s*:\s*"([^"]+)"/);
  if (!crumbMatch) throw new Error('Could not extract Yahoo crumb');
  const crumb = crumbMatch[1].replace(/\\u002F/g, '/');

  const moduleStr = modules.join(',');
  const res = await fetch(
    `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=${moduleStr}&crumb=${encodeURIComponent(crumb)}`,
    { headers: { Cookie: cookies, 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' } }
  );
  if (!res.ok) throw new Error(`Yahoo API returned ${res.status}`);
  const data = await res.json();
  return data.quoteSummary?.result?.[0] || {};
}
