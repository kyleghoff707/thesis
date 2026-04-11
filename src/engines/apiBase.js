// API base URL for the Thes1s Worker.
// Dev: empty string (Vite proxy handles /api/* and /proxy/* routes)
// Production: points to the deployed Worker (e.g. https://api.thes1s.com)

export const API_BASE = import.meta.env.VITE_API_URL || '';

// Production proxy base — prepended to external API paths.
// Dev: Vite proxy routes (e.g. /api/sec/..., /api/edgar/...)
// Production: Worker proxy routes (e.g. https://api.thes1s.com/proxy/sec/...)
const IS_DEV = import.meta.env.DEV;

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

// Data endpoints (shared server data from D1/R2)
export function dataUrl(path) {
  return `${API_BASE}/data${path}`;
}

// Auth endpoints
export function authUrl(path) {
  return `${API_BASE}/auth${path}`;
}

// Claude API proxy — dev calls Anthropic directly, prod goes through Worker
export function claudeBaseUrl() {
  return IS_DEV ? 'https://api.anthropic.com' : `${API_BASE}/proxy/claude`;
}

// User data endpoints
export function userUrl(path) {
  return `${API_BASE}/user${path}`;
}
