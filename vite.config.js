import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Yahoo Finance analyst data middleware using yahoo-finance2 package.
// The v10 quoteSummary API requires crumb/cookie auth — yahoo-finance2 handles this internally.
// This plugin serves quoteSummary data at /api/yahoo-summary/:ticker in dev mode.
function yahooSummaryPlugin() {
  let yf = null;

  return {
    name: 'yahoo-summary',
    configureServer(server) {
      server.middlewares.use('/api/yahoo-summary', async (req, res) => {
        try {
          // Lazy-load yahoo-finance2 v3 (ESM, requires instantiation)
          if (!yf) {
            const mod = await import('yahoo-finance2');
            const YahooFinance = mod.default;
            yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
          }

          // Extract ticker and optional modules from URL: /api/yahoo-summary/AAPL?modules=calendarEvents
          const [path, qs] = (req.url || '').replace(/^\//, '').split('?');
          const ticker = path;
          if (!ticker) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing ticker' }));
            return;
          }

          // Allow callers to request specific modules; default to the analyst data set
          const defaultModules = ['earningsTrend', 'financialData', 'recommendationTrend', 'upgradeDowngradeHistory'];
          const params = new URLSearchParams(qs || '');
          const modules = params.has('modules')
            ? params.get('modules').split(',').map(m => m.trim()).filter(Boolean)
            : defaultModules;

          const data = await yf.quoteSummary(ticker, { modules });

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(data));
        } catch (e) {
          const status = e.message?.includes('Not Found') ? 404 : 500;
          res.writeHead(status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
    },
  };
}

// Finviz stock quote data middleware.
// Fetches the quote page server-side (requires browser-like headers) and parses
// the snapshot table with cheerio. Returns structured JSON at /api/finviz/:ticker.
function finvizPlugin() {
  let cheerioLoad = null;

  return {
    name: 'finviz',
    configureServer(server) {
      server.middlewares.use('/api/finviz', async (req, res) => {
        try {
          if (!cheerioLoad) {
            const mod = await import('cheerio');
            cheerioLoad = mod.load;
          }

          const ticker = (req.url || '').replace(/^\//, '').split('?')[0];
          if (!ticker) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing ticker' }));
            return;
          }

          const resp = await fetch(`https://finviz.com/quote.ashx?t=${encodeURIComponent(ticker.toUpperCase())}&p=d`, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.9',
            },
          });

          if (!resp.ok) {
            res.writeHead(resp.status, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: `Finviz returned ${resp.status}` }));
            return;
          }

          const html = await resp.text();
          const $ = cheerioLoad(html);

          // Parse the snapshot table: alternating label/value cells in each row
          const data = {};
          const rows = $('table.snapshot-table2 tr');
          rows.each((_, row) => {
            const cells = $(row).find('> td');
            let lastKey = '';
            cells.each((j, cell) => {
              const text = $(cell).text().trim();
              if (j % 2 === 0) {
                // Label cell — convert to camelCase key
                lastKey = text
                  .replace(/[%()]/g, '')
                  .replace(/\s*\/\s*/g, ' ')
                  .trim()
                  .split(/\s+/)
                  .map((w, i) => i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
                  .join('');
              } else if (lastKey) {
                // Value cell — parse numbers, strip %, commas
                const clean = text.replace(/,/g, '').replace(/%$/, '');
                const num = parseFloat(clean);
                data[lastKey] = isNaN(num) ? text : num;
              }
            });
          });

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(data));
        } catch (e) {
          const status = e.message?.includes('Not Found') ? 404 : 500;
          res.writeHead(status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
    },
  };
}

// GuruFocus stock summary data middleware.
// Supports two modes: API mode (if VITE_GURUFOCUS_KEY set) or scrape mode.
// Serves structured JSON at /api/gurufocus/:ticker.
function gurufocusPlugin() {
  return {
    name: 'gurufocus',
    configureServer(server) {
      server.middlewares.use('/api/gurufocus', async (req, res) => {
        try {
          const ticker = (req.url || '').replace(/^\//, '').split('?')[0];
          if (!ticker) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing ticker' }));
            return;
          }

          const apiKey = process.env.VITE_GURUFOCUS_KEY?.trim();

          if (apiKey) {
            // API mode — structured JSON, reliable
            const url = `https://api.gurufocus.com/public/user/${apiKey}/stock/${encodeURIComponent(ticker.toUpperCase())}/summary`;
            const resp = await fetch(url);
            if (!resp.ok) {
              res.writeHead(resp.status, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: `GuruFocus API returned ${resp.status}` }));
              return;
            }
            const json = await resp.json();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ _mode: 'api', ...json }));
            return;
          }

          // Scrape mode — attempt to fetch summary page and extract embedded JSON
          const resp = await fetch(`https://www.gurufocus.com/stock/${encodeURIComponent(ticker.toUpperCase())}/summary`, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.9',
            },
          });

          if (!resp.ok) {
            res.writeHead(resp.status, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: `GuruFocus returned ${resp.status}` }));
            return;
          }

          const html = await resp.text();

          // Look for embedded JSON data in script tags (common pattern for SSR sites)
          const data = {};

          // Try to find __NEXT_DATA__ or similar embedded JSON
          const nextDataMatch = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
          if (nextDataMatch) {
            try {
              const nextData = JSON.parse(nextDataMatch[1]);
              data._mode = 'next_data';
              data._raw = nextData;
            } catch {}
          }

          // Try to find window.__DATA__ or similar patterns
          if (!data._mode) {
            const windowDataMatch = html.match(/window\.__(?:DATA|INITIAL_STATE|APP_DATA)__\s*=\s*({[\s\S]*?});?\s*<\/script>/);
            if (windowDataMatch) {
              try {
                const windowData = JSON.parse(windowDataMatch[1]);
                data._mode = 'window_data';
                data._raw = windowData;
              } catch {}
            }
          }

          // Fallback: try to extract key metrics from HTML with regex patterns
          if (!data._mode) {
            data._mode = 'html_parse';
            // GF Value
            const gfValueMatch = html.match(/GF Value[^$]*?\$\s*([\d,.]+)/i);
            if (gfValueMatch) data.gfValue = parseFloat(gfValueMatch[1].replace(/,/g, ''));
            // Graham Number
            const grahamMatch = html.match(/Graham Number[^$]*?\$\s*([\d,.]+)/i);
            if (grahamMatch) data.grahamNumber = parseFloat(grahamMatch[1].replace(/,/g, ''));
            // Peter Lynch
            const lynchMatch = html.match(/Peter Lynch[^$]*?\$\s*([\d,.]+)/i);
            if (lynchMatch) data.peterLynchValue = parseFloat(lynchMatch[1].replace(/,/g, ''));
            // DCF
            const dcfMatch = html.match(/DCF \((?:Earnings|FCF)\)[^$]*?\$\s*([\d,.]+)/gi);
            if (dcfMatch) {
              dcfMatch.forEach(m => {
                const val = parseFloat(m.match(/\$\s*([\d,.]+)/)?.[1]?.replace(/,/g, '') || '');
                if (m.toLowerCase().includes('earnings')) data.dcfEarnings = val;
                else data.dcfFCF = val;
              });
            }
            // Financial Strength / Profitability / Predictability
            const fsMatch = html.match(/Financial Strength[^<]*?(\d+)\s*\/\s*10/i);
            if (fsMatch) data.financialStrength = parseInt(fsMatch[1]);
            const profMatch = html.match(/Profitability Rank[^<]*?(\d+)\s*\/\s*10/i);
            if (profMatch) data.profitabilityRank = parseInt(profMatch[1]);
            const predMatch = html.match(/Predictability Rank[^<]*?([\d.]+)\s*(?:\/\s*5|star)/i);
            if (predMatch) data.predictabilityRank = parseFloat(predMatch[1]);
          }

          // If we got nothing useful, return null indicator
          const hasData = Object.keys(data).some(k => k !== '_mode');
          if (!hasData) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'no_data_extracted', _mode: data._mode }));
            return;
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(data));
        } catch (e) {
          const status = 500;
          res.writeHead(status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
    },
  };
}

// Yahoo Finance batch quotes middleware.
// Uses yahoo-finance2's quote() method to batch-fetch basic quote data
// (market cap, price, PE, dividend yield) for multiple tickers at once.
// Serves JSON at /api/yahoo-quotes/AAPL,MSFT,GOOGL
function yahooQuotesPlugin() {
  let yf = null;

  return {
    name: 'yahoo-quotes',
    configureServer(server) {
      server.middlewares.use('/api/yahoo-quotes', async (req, res) => {
        try {
          if (!yf) {
            const mod = await import('yahoo-finance2');
            const YahooFinance = mod.default;
            yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
          }

          const tickersStr = (req.url || '').replace(/^\//, '').split('?')[0];
          if (!tickersStr) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing tickers' }));
            return;
          }

          const tickers = tickersStr.split(',').map(t => t.trim().toUpperCase()).filter(Boolean);
          if (tickers.length === 0) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'No valid tickers' }));
            return;
          }

          // Chunk into batches of 50 to avoid Yahoo limits
          const results = [];
          for (let i = 0; i < tickers.length; i += 50) {
            const batch = tickers.slice(i, i + 50);
            try {
              const quotes = await yf.quote(batch);
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
            } catch (batchErr) {
              console.warn(`Yahoo batch quote error for ${batch.join(',')}:`, batchErr.message);
            }
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(results));
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
    },
  };
}

// IR Events page discovery middleware.
// Given a company website domain, probes common investor relations URL patterns
// server-side (no CORS) and returns the first one that resolves.
// Fires ALL candidates at once and returns the highest-priority match.
// Serves JSON at /api/ir-events?website=https://www.sprouts.com
function irEventsPlugin() {
  return {
    name: 'ir-events',
    configureServer(server) {
      server.middlewares.use('/api/ir-events', async (req, res) => {
        try {
          const params = new URLSearchParams((req.url || '').split('?')[1] || '');
          const website = params.get('website');
          if (!website) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing website param' }));
            return;
          }

          // Extract registrable domain: "https://shop.lululemon.com" -> "lululemon.com"
          let hostname;
          try {
            hostname = new URL(website.startsWith('http') ? website : `https://${website}`).hostname;
          } catch {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid website URL' }));
            return;
          }
          const parts = hostname.split('.');
          let baseDomain;
          if (parts.length > 2 && parts[parts.length - 2].length <= 3 && parts[parts.length - 1].length <= 2) {
            baseDomain = parts.slice(-3).join('.'); // e.g., company.co.uk
          } else {
            baseDomain = parts.slice(-2).join('.'); // e.g., lululemon.com
          }

          // Candidates ordered by priority (index = priority, lower = better)
          // Covers varied naming: events-and-presentations, events, news-events,
          // news-and-events, upcoming-events, webcasts, etc.
          const candidates = [
            // investors.domain patterns (most common for large/mid-cap)
            `https://investors.${baseDomain}/events-and-presentations`,
            `https://investors.${baseDomain}/events-and-presentations/default.aspx`,
            `https://investors.${baseDomain}/events`,
            `https://investors.${baseDomain}/events/default.aspx`,
            `https://investors.${baseDomain}/news-events`,
            `https://investors.${baseDomain}/news-and-events`,
            `https://investors.${baseDomain}/upcoming-events`,
            // ir.domain patterns
            `https://ir.${baseDomain}/events-and-presentations`,
            `https://ir.${baseDomain}/events`,
            `https://ir.${baseDomain}/news-events`,
            // corporate.domain/investors patterns (e.g. LULU)
            `https://corporate.${baseDomain}/investors/news-and-events/events-and-presentations`,
            `https://corporate.${baseDomain}/investors/events`,
            `https://corporate.${baseDomain}/investors/news-and-events`,
            // domain/investors patterns
            `https://${baseDomain}/investors/events-and-presentations`,
            `https://${baseDomain}/investors/events`,
            `https://${baseDomain}/investor-relations/events`,
            // Broader IR root pages (less specific but still useful)
            `https://${baseDomain}/investors`,
            `https://${baseDomain}/investor-relations`,
            `https://investors.${baseDomain}`,
            `https://ir.${baseDomain}`,
          ];

          const headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml',
          };

          // Fire ALL candidates at once — race for fastest, pick highest priority among successes
          const results = await Promise.allSettled(
            candidates.map(async (url, priority) => {
              const resp = await fetch(url, { method: 'HEAD', headers, redirect: 'follow', signal: AbortSignal.timeout(4000) });
              if (resp.ok) return { url, priority };
              // Some servers reject HEAD — retry with GET
              if (resp.status === 405 || resp.status === 403) {
                const getResp = await fetch(url, { method: 'GET', headers, redirect: 'follow', signal: AbortSignal.timeout(4000) });
                if (getResp.ok) return { url, priority };
              }
              throw new Error(`${resp.status}`);
            })
          );

          // Pick the highest-priority (lowest index) successful result
          let best = null;
          for (const r of results) {
            if (r.status === 'fulfilled') {
              if (!best || r.value.priority < best.priority) {
                best = r.value;
              }
            }
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ url: best?.url || null }));
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
    },
  };
}

// Thes1s report file server middleware.
// Serves generated One Pager / Pitch Deck / Full Story JSON from .thes1s/reports/
// to the browser. Endpoints:
//   GET /api/thes1s/reports                    — list tickers with any report
//   GET /api/thes1s/reports/:ticker/one-pager  — serve one-pager.json
//   GET /api/thes1s/reports/:ticker/pitch-deck — serve pitch-deck.json
//   GET /api/thes1s/reports/:ticker/progress   — serve progress.json
//   GET /api/thes1s/reports/:ticker/generation-status — serve generation-status.json
function thes1sReportsPlugin() {
  let fs = null;
  let path = null;

  return {
    name: 'thes1s-reports',
    configureServer(server) {
      server.middlewares.use('/api/thes1s/reports', async (req, res) => {
        try {
          // Lazy-load fs and path on first invocation
          if (!fs) {
            fs = await import('fs');
            path = await import('path');
          }

          const reportsDir = path.join(process.cwd(), '.thes1s', 'reports');

          // Parse URL path: req.url is relative to the middleware mount point
          // e.g. "/" for listing, "/COST/one-pager" for report, "/COST/progress" for progress
          const urlPath = (req.url || '/').replace(/^\//, '').split('?')[0];

          // Listing endpoint: /api/thes1s/reports (urlPath is empty or "/")
          if (!urlPath) {
            if (!fs.existsSync(reportsDir)) {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ tickers: [] }));
              return;
            }
            const entries = fs.readdirSync(reportsDir, { withFileTypes: true });
            const tickers = entries
              .filter(e => e.isDirectory())
              .filter(e =>
                fs.existsSync(path.join(reportsDir, e.name, 'one-pager.json')) ||
                fs.existsSync(path.join(reportsDir, e.name, 'pitch-deck.json'))
              )
              .map(e => e.name);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ tickers }));
            return;
          }

          // Ticker-specific endpoints: /TICKER/one-pager, /TICKER/pitch-deck, or /TICKER/progress
          const parts = urlPath.split('/');
          if (parts.length < 2) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid path — expected /:ticker/one-pager, /:ticker/pitch-deck, /:ticker/progress, or /:ticker/generation-status' }));
            return;
          }

          const ticker = parts[0].toUpperCase();
          const fileType = parts[1];
          const fileMap = {
            'one-pager': 'one-pager.json',
            'pitch-deck': 'pitch-deck.json',
            'full-story': 'full-story-api.json',
            'full-story-quality': 'quality/full-story-v4.quality.json',
            'progress': 'progress.json',
            'generation-status': 'generation-status.json',
          };
          const fileName = fileMap[fileType];

          if (!fileName) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: `Unknown file type: ${fileType}` }));
            return;
          }

          const filePath = path.join(reportsDir, ticker, fileName);
          if (!fs.existsSync(filePath)) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Not found' }));
            return;
          }

          const content = fs.readFileSync(filePath, 'utf-8');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(content);
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), yahooSummaryPlugin(), finvizPlugin(), gurufocusPlugin(), yahooQuotesPlugin(), irEventsPlugin(), thes1sReportsPlugin()],
  server: {
    proxy: {
      // Yahoo Finance doesn't send CORS headers, so browser blocks direct calls.
      // This proxy routes /api/yahoo/* to query1.finance.yahoo.com in dev mode.
      // In Tauri production builds, the native webview doesn't enforce CORS.
      '/api/yahoo': {
        target: 'https://query1.finance.yahoo.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/yahoo/, ''),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
      },
      // SEC www.sec.gov — ticker map file (no CORS headers).
      // SEC requires User-Agent with contact info for all automated requests.
      '/api/sec': {
        target: 'https://www.sec.gov',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/sec/, ''),
        headers: {
          'Accept-Encoding': 'identity',
        },
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            // Strip browser-fingerprint headers that CDNs use to block headless browsers
            proxyReq.removeHeader('user-agent');
            proxyReq.removeHeader('referer');
            proxyReq.removeHeader('origin');
            proxyReq.removeHeader('sec-ch-ua');
            proxyReq.removeHeader('sec-ch-ua-mobile');
            proxyReq.removeHeader('sec-ch-ua-platform');
            proxyReq.removeHeader('sec-fetch-site');
            proxyReq.removeHeader('sec-fetch-mode');
            proxyReq.removeHeader('sec-fetch-dest');
            proxyReq.setHeader('User-Agent', 'StockAnalyzer/1.0 kylehoff@example.com');
            proxyReq.setHeader('Accept', 'application/json');
          });
        },
      },
      // SEC data.sec.gov — XBRL company facts API.
      // Has CORS headers but requires proper User-Agent.
      // Browser can't set User-Agent (forbidden header), so proxy in dev.
      '/api/edgar': {
        target: 'https://data.sec.gov',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/edgar/, ''),
        headers: {
          'Accept-Encoding': 'identity',
        },
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            // Strip browser-fingerprint headers that CDNs use to block headless browsers
            proxyReq.removeHeader('user-agent');
            proxyReq.removeHeader('referer');
            proxyReq.removeHeader('origin');
            proxyReq.removeHeader('sec-ch-ua');
            proxyReq.removeHeader('sec-ch-ua-mobile');
            proxyReq.removeHeader('sec-ch-ua-platform');
            proxyReq.removeHeader('sec-fetch-site');
            proxyReq.removeHeader('sec-fetch-mode');
            proxyReq.removeHeader('sec-fetch-dest');
            proxyReq.setHeader('User-Agent', 'StockAnalyzer/1.0 kylehoff@example.com');
            proxyReq.setHeader('Accept', 'application/json');
          });
        },
      },
    },
  },
})
