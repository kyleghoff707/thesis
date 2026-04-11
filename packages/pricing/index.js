// pricing — shared Claude model pricing used by both
// the Thes1s frontend (browser) and the Cloudflare Worker (proxy billing).
//
// Single source of truth for model costs. Update here when Anthropic changes pricing.

// Claude model pricing in dollars per million tokens
// cacheRead/cacheWrite per Anthropic's prompt caching docs
// webSearch per Anthropic's web search tool pricing
export const MODEL_PRICING = {
  'claude-sonnet-4-6': { input: 3.0, output: 15.0, cacheRead: 0.30, cacheWrite: 3.75, webSearch: 0.01 },
  'claude-opus-4-6':   { input: 5.0, output: 25.0, cacheRead: 0.50, cacheWrite: 6.25, webSearch: 0.01 },
};

// Normalize specific-version model IDs (e.g. 'claude-sonnet-4-20250514') to
// base model names ('claude-sonnet-4-6'). Strips date suffixes.
export function normalizeModel(model) {
  if (!model) return 'claude-sonnet-4-6';
  if (MODEL_PRICING[model]) return model;
  for (const key of Object.keys(MODEL_PRICING)) {
    const prefix = key.replace(/-\d+$/, '');
    if (model.startsWith(prefix)) return key;
  }
  return 'claude-sonnet-4-6';
}

// Calculate cost in millicents (tenths of a cent) for precise billing.
// 1 millicent = $0.001. Use ROUND(SUM(millicents) / 10) for Stripe (cents).
// Frontend displays as dollars: millicents / 1000.
export function calculateCostMillicents(usage, model) {
  const p = MODEL_PRICING[normalizeModel(model)];
  const dollars =
    ((usage.input_tokens || 0) * p.input / 1_000_000) +
    ((usage.output_tokens || 0) * p.output / 1_000_000) +
    ((usage.cache_read_input_tokens || 0) * p.cacheRead / 1_000_000) +
    ((usage.cache_creation_input_tokens || 0) * p.cacheWrite / 1_000_000) +
    ((usage.web_searches || 0) * p.webSearch);
  return Math.round(dollars * 1000);
}
