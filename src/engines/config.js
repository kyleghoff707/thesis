// Dev-only API keys for direct API calls during local development.
// In production, all secrets live in Cloudflare Worker env vars; the frontend
// uses Worker proxy routes (/proxy/claude, /data/transcripts, etc).
//
// Each export is gated on import.meta.env.DEV so the production bundle
// tree-shakes the env reads to empty strings — no VITE_* secret can ever
// reach the public JS bundle. Static refs (not bracket access) are required
// for Vite/Rollup to do this elimination correctly.

const IS_DEV = import.meta.env.DEV;

export const CLAUDE_KEY = IS_DEV ? (import.meta.env.VITE_CLAUDE_KEY || '').trim() : '';
export const ALPHA_VANTAGE_KEY = IS_DEV ? (import.meta.env.VITE_ALPHA_VANTAGE_KEY || '').trim() : '';
export const ALPHA_VANTAGE_KEY_2 = IS_DEV ? (import.meta.env.VITE_ALPHA_VANTAGE_KEY_2 || '').trim() : '';
