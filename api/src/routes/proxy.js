// Proxy routes — replaces Vite dev middleware for production
// Handles CORS, custom headers, and server-side data processing

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const SEC_UA = 'StockAnalyzer/1.0 kylehoff@example.com';

export async function handleProxy(request, env, path, url) {

  // ─── SEC EDGAR proxy ─────────────────────────────────────────
  // /proxy/sec/* → www.sec.gov/Archives/*
  if (path.startsWith('/proxy/sec/')) {
    const secPath = path.replace('/proxy/sec/', '');
    const target = `https://www.sec.gov/Archives/${secPath}`;
    const res = await fetch(target, {
      headers: { 'User-Agent': env.SEC_USER_AGENT || SEC_UA },
    });
    return new Response(res.body, { status: res.status, headers: { 'Content-Type': res.headers.get('Content-Type') || 'text/plain' } });
  }

  // /proxy/edgar/* → data.sec.gov/*
  if (path.startsWith('/proxy/edgar/')) {
    const edgarPath = path.replace('/proxy/edgar/', '');
    const target = `https://data.sec.gov/${edgarPath}`;
    const res = await fetch(target, {
      headers: { 'User-Agent': env.SEC_USER_AGENT || SEC_UA },
    });
    return new Response(res.body, { status: res.status, headers: { 'Content-Type': res.headers.get('Content-Type') || 'application/json' } });
  }

  // ─── Yahoo Finance proxy ─────────────────────────────────────
  // Uses yahoo-finance2 for crumb auth. Falls back to direct fetch if unavailable.

  // /proxy/yahoo-summary/:ticker?modules=...
  if (path.startsWith('/proxy/yahoo-summary/')) {
    const ticker = path.replace('/proxy/yahoo-summary/', '').split('?')[0];
    const modules = url.searchParams.get('modules')?.split(',') || [
      'earningsTrend', 'recommendationTrend', 'upgradeDowngradeHistory',
      'financialData', 'defaultKeyStatistics',
    ];

    try {
      // Try yahoo-finance2 (handles crumb/cookie auth)
      const yf = await getYahooFinance();
      const data = await yf.quoteSummary(ticker, { modules });
      return json(data);
    } catch (yfErr) {
      // Fallback: manual crumb fetch
      try {
        const data = await yahooFallback(ticker, modules);
        return json(data);
      } catch (fallbackErr) {
        return json({ error: `Yahoo fetch failed: ${fallbackErr.message}` }, 502);
      }
    }
  }

  // /proxy/yahoo-quotes/:tickers (comma-separated)
  if (path.startsWith('/proxy/yahoo-quotes/')) {
    const tickers = path.replace('/proxy/yahoo-quotes/', '').split(',');

    try {
      const yf = await getYahooFinance();
      const quotes = await yf.quote(tickers);
      const mapped = (Array.isArray(quotes) ? quotes : [quotes]).map(q => ({
        ticker: q.symbol,
        price: q.regularMarketPrice,
        marketCap: q.marketCap,
        pe: q.trailingPE,
        forwardPE: q.forwardPE,
        eps: q.epsTrailingTwelveMonths,
        bookValue: q.bookValue,
        priceToBook: q.priceToBook,
        dividendYield: q.dividendYield,
        sharesOutstanding: q.sharesOutstanding,
        fiftyTwoWeekHigh: q.fiftyTwoWeekHigh,
        fiftyTwoWeekLow: q.fiftyTwoWeekLow,
      }));
      return json(mapped);
    } catch (err) {
      return json({ error: `Yahoo quotes failed: ${err.message}` }, 502);
    }
  }

  // ─── Yahoo Chart proxy (prices, splits) ───────────────────────
  // /proxy/yahoo-chart/:ticker?params...
  if (path.startsWith('/proxy/yahoo-chart/')) {
    const rest = path.replace('/proxy/yahoo-chart/', '');
    const target = `https://query1.finance.yahoo.com/v8/finance/chart/${rest}${url.search}`;
    try {
      const res = await fetch(target, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
      });
      return new Response(res.body, { status: res.status, headers: { 'Content-Type': 'application/json' } });
    } catch (err) {
      return json({ error: `Yahoo chart fetch failed: ${err.message}` }, 502);
    }
  }

  // ─── Finviz proxy ────────────────────────────────────────────
  // /proxy/finviz/:ticker — fetch + parse Finviz snapshot table
  if (path.startsWith('/proxy/finviz/')) {
    const ticker = path.replace('/proxy/finviz/', '');
    try {
      const res = await fetch(`https://finviz.com/quote.ashx?t=${ticker}&p=d`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        },
      });
      if (!res.ok) return json({ error: `Finviz returned ${res.status}` }, res.status);
      const html = await res.text();
      const data = parseFinvizSnapshot(html);
      return json(data);
    } catch (err) {
      return json({ error: `Finviz fetch failed: ${err.message}` }, 502);
    }
  }

  // ─── Alpha Vantage proxy ─────────────────────────────────────
  if (path.startsWith('/proxy/alpha-vantage/')) {
    const avPath = path.replace('/proxy/alpha-vantage/', '');
    const params = new URLSearchParams(url.search);
    const target = `https://www.alphavantage.co/query?${params.toString()}`;
    const res = await fetch(target);
    return new Response(res.body, { status: res.status, headers: { 'Content-Type': 'application/json' } });
  }

  return json({ error: 'Unknown proxy route' }, 404);
}

// ─── Yahoo Finance helpers ─────────────────────────────────────

let _yf = null;
async function getYahooFinance() {
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
async function yahooFallback(ticker, modules) {
  // Fetch Yahoo homepage to get crumb + cookies
  const homePage = await fetch('https://finance.yahoo.com/', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
  });
  const cookies = homePage.headers.get('set-cookie') || '';
  const html = await homePage.text();

  // Extract crumb from embedded JSON
  const crumbMatch = html.match(/"crumb"\s*:\s*"([^"]+)"/);
  if (!crumbMatch) throw new Error('Could not extract Yahoo crumb');
  const crumb = crumbMatch[1].replace(/\\u002F/g, '/');

  // Fetch quoteSummary with crumb
  const moduleStr = modules.join(',');
  const res = await fetch(
    `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=${moduleStr}&crumb=${encodeURIComponent(crumb)}`,
    { headers: { Cookie: cookies, 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' } }
  );
  if (!res.ok) throw new Error(`Yahoo API returned ${res.status}`);
  const data = await res.json();
  return data.quoteSummary?.result?.[0] || {};
}

// ─── Finviz HTML parser ────────────────────────────────────────
// Extracts the snapshot table key/value pairs from Finviz HTML.
// Uses regex instead of cheerio to avoid the dependency in Workers.

function parseFinvizSnapshot(html) {
  const data = {};
  // Finviz snapshot table has rows of: <td class="snapshot-td2-cp">Label</td><td class="snapshot-td2">Value</td>
  const regex = /<td[^>]*class="snapshot-td2-cp"[^>]*>([^<]+)<\/td>\s*<td[^>]*class="snapshot-td2"[^>]*>(?:<[^>]+>)*([^<]+)/g;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const label = match[1].trim();
    const value = match[2].trim();
    if (label && value) data[label] = value;
  }
  return data;
}
