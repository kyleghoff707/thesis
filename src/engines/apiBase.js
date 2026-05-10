// API base URL for the Thesis Worker.
// Dev: empty string (Vite proxy handles /api/* and /proxy/* routes locally).
// Production: hardcoded to the deployed Worker. Not env-driven so nothing has
// to flow through .env.local — keeps the bundle reproducible and avoids
// tempting anyone to add VITE_*_KEY back into the build environment.

// Browser-only: the React app reads this for connected-mode requests (Phase 4).
// CLI/Node code paths must not import API_BASE — backend is unreachable in CLI mode.
export const API_BASE = import.meta.env?.DEV ? '' : 'https://api.thesis-investing.com';

// Production proxy base — prepended to external API paths.
// Dev: Vite proxy routes (e.g. /api/sec/..., /api/edgar/...)
// Production: Worker proxy routes (e.g. https://api.thesis.com/proxy/sec/...)
const IS_DEV = import.meta.env?.DEV;

export function secBase() {
  return IS_DEV ? '/api/sec' : `${API_BASE}/proxy/sec`;
}

export function edgarBase() {
  return IS_DEV ? '/api/edgar' : `${API_BASE}/proxy/edgar`;
}

export function yahooSummaryUrl(ticker, modules) {
  const params = modules ? `?modules=${modules}` : '';
  return IS_DEV
    ? `/api/yahoo-summary/${ticker}${params}`
    : `${API_BASE}/proxy/yahoo-summary/${ticker}${params}`;
}

export function yahooQuotesUrl(tickers) {
  return IS_DEV
    ? `/api/yahoo-quotes/${tickers}`
    : `${API_BASE}/proxy/yahoo-quotes/${tickers}`;
}

export function yahooChartBase() {
  return IS_DEV
    ? '/api/yahoo/v8/finance/chart'
    : `${API_BASE}/proxy/yahoo-chart`;
}

export function finvizUrl(ticker) {
  return IS_DEV
    ? `/api/finviz/${ticker}`
    : `${API_BASE}/proxy/finviz/${ticker}`;
}

// Auth endpoints
export function authUrl(path) {
  return `${API_BASE}/auth${path}`;
}

// User data endpoints
export function userUrl(path) {
  return `${API_BASE}/user${path}`;
}
