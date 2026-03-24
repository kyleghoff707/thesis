// Env variable helper — trims spaces that .env.local may have after = signs

function env(key) {
  const val = import.meta.env[key];
  return val ? val.trim() : '';
}

export const CLAUDE_KEY = env('VITE_CLAUDE_KEY');
export const FINNHUB_KEY = env('VITE_FINNHUB_KEY');
export const ALPHA_VANTAGE_KEY = env('VITE_ALPHA_VANTAGE_KEY');
