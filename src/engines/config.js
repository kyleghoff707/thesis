// Env variable helper — trims spaces that .env.local may have after = signs

function env(key) {
  const val = import.meta.env[key];
  return val ? val.trim() : '';
}

export const CLAUDE_KEY = env('VITE_CLAUDE_KEY');
export const EODHD_KEY = env('VITE_EODHD_KEY');
