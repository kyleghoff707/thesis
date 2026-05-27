const TICKER_PATTERN = /^[A-Z0-9]+([.-][A-Z0-9]+)?$/;
const MAX_TICKER_LENGTH = 12;

export function normalizeTicker(ticker) {
  const normalized = typeof ticker === 'string' ? ticker.trim().toUpperCase() : '';
  if (!normalized) {
    throw new Error('Ticker is required');
  }
  if (normalized.length > MAX_TICKER_LENGTH || !TICKER_PATTERN.test(normalized)) {
    throw new Error('Invalid ticker. Use letters/numbers with one optional dot or dash, e.g. AAPL, BRK.B, or BF-B.');
  }
  return normalized;
}
