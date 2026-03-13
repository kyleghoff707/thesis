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

          // Extract ticker from URL path: /api/yahoo-summary/AAPL -> AAPL
          const ticker = (req.url || '').replace(/^\//, '').split('?')[0];
          if (!ticker) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing ticker' }));
            return;
          }

          const data = await yf.quoteSummary(ticker, {
            modules: ['earningsTrend', 'financialData', 'recommendationTrend', 'upgradeDowngradeHistory'],
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

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), yahooSummaryPlugin()],
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
          'User-Agent': 'StockAnalyzer/1.0 kylehoff@example.com',
          'Accept-Encoding': 'identity',
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
          'User-Agent': 'StockAnalyzer/1.0 kylehoff@example.com',
          'Accept-Encoding': 'identity',
        },
      },
    },
  },
})
