// Node.js Data Bridge — Browser API shims for running engines outside the browser
// Used by dataExport.js (CC Skills) and future aiResearch.js (commercial backend)
//
// The existing 30+ engine files are designed for browser/Vite execution.
// They depend on import.meta.env, DOMParser, Vite dev proxy routes, and
// browser caching (localStorage/IndexedDB). This module provides Node.js
// equivalents so the same engines can run from the command line.
//
// This is a Node-only module. Browser code continues using config.js and
// native APIs. Only dataExport.js and toolbox.js import this.

import dotenv from 'dotenv';
import { resolve, join } from 'path';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { parseHTML } from 'linkedom';

// ─── Load .env.local ─────────────────────────────────────────
// CRITICAL: Load .env.local specifically, NOT bare `import 'dotenv/config'`.
// The default dotenv only loads .env which does NOT exist in this project.
// API keys (VITE_CLAUDE_KEY, VITE_FINNHUB_KEY, VITE_ALPHA_VANTAGE_KEY)
// are in .env.local.
dotenv.config({ path: resolve(process.cwd(), '.env.local') });

// ─── IS_NODE detection ───────────────────────────────────────

/** True when running in Node.js (no browser window object) */
export const IS_NODE = typeof window === 'undefined';

// ─── Environment access ─────────────────────────────────────

/**
 * Read an environment variable by key.
 * In Node: reads from process.env (loaded from .env.local via dotenv).
 * Replaces import.meta.env[key] for engines running outside the browser.
 * @param {string} key - Environment variable name (e.g. 'VITE_CLAUDE_KEY')
 * @returns {string} Trimmed value, or empty string if not set
 */
export function getEnv(key) {
  return process.env[key]?.trim() || '';
}

/**
 * Whether we're in dev mode. Always false in Node — Node adapter runs in
 * "production" mode with direct fetch (no Vite proxy).
 * @returns {false}
 */
export function isDev() {
  return false;
}

// ─── Proxy URL resolution ────────────────────────────────────

/**
 * Maps Vite dev proxy routes to their real external endpoints.
 * In the browser, Vite rewrites /api/sec/* to https://www.sec.gov/*
 * (adding User-Agent headers). In Node, we do the rewrite here.
 */
export const PROXY_MAP = {
  '/api/sec/': 'https://www.sec.gov/',
  '/api/edgar/': 'https://data.sec.gov/',
  '/api/efts/': 'https://efts.sec.gov/',
  '/api/yahoo/': 'https://query1.finance.yahoo.com/',
  '/api/finviz/': 'https://finviz.com/',
  '/api/finnhub/': 'https://finnhub.io/',
  '/api/alpha/': 'https://www.alphavantage.co/',
};

/**
 * Resolve a URL that may use a Vite proxy prefix to the real external URL.
 * If the URL doesn't match any proxy prefix, returns it unchanged.
 * @param {string} proxyURL - URL that may start with /api/sec/, /api/edgar/, etc.
 * @returns {string} Resolved URL with real hostname
 */
export function resolveURL(proxyURL) {
  for (const [prefix, real] of Object.entries(PROXY_MAP)) {
    if (proxyURL.startsWith(prefix)) {
      return proxyURL.replace(prefix, real);
    }
  }
  return proxyURL;
}

// ─── DOM Parser (linkedom) ───────────────────────────────────

/**
 * Create a DOMParser-compatible object using linkedom.
 * Provides querySelectorAll, textContent, getAttribute — the subset
 * used by filingMarkdown.js for HTML-to-markdown conversion.
 * @returns {{ parseFromString: (html: string, type: string) => Document }}
 */
export function createDOMParser() {
  return {
    parseFromString(html, type) {
      const { document } = parseHTML(html);
      return document;
    },
  };
}

// ─── Fetch wrapper ───────────────────────────────────────────

/** SEC-required headers for EDGAR API requests */
export const SEC_HEADERS = {
  'User-Agent': 'Thes1s/1.0 (contact@thes1s.com)',
  'Accept': 'application/json',
};

/**
 * Create a fetch wrapper that auto-resolves proxy URLs and adds
 * the SEC User-Agent header. Uses Node.js native fetch (v18+).
 * @returns {(url: string, options?: RequestInit) => Promise<Response>}
 */
export function createNodeFetch() {
  return async function nodeFetch(url, options = {}) {
    const resolvedURL = resolveURL(url);
    const headers = {
      'User-Agent': 'Thes1s/1.0 (contact@thes1s.com)',
      ...options.headers,
    };
    return fetch(resolvedURL, { ...options, headers });
  };
}

// ─── File-based cache ────────────────────────────────────────
// Replaces localStorage/IndexedDB for Node.js execution.
// Stores JSON files in .thes1s/cache/ with TTL expiration.

const CACHE_DIR = join(process.cwd(), '.thes1s', 'cache');

/**
 * Ensure the cache directory exists. Creates it recursively if needed.
 */
export function ensureCacheDir() {
  mkdirSync(CACHE_DIR, { recursive: true });
}

/**
 * Read a cached value by key. Returns null if not found or expired.
 * @param {string} key - Cache key (used as filename)
 * @returns {*} Cached value, or null
 */
export function cacheGet(key) {
  const path = join(CACHE_DIR, `${key}.json`);
  if (!existsSync(path)) return null;
  try {
    const data = JSON.parse(readFileSync(path, 'utf8'));
    if (data.expiresAt && Date.now() > data.expiresAt) return null;
    return data.value;
  } catch {
    return null;
  }
}

/**
 * Store a value in the file cache with TTL.
 * @param {string} key - Cache key (used as filename)
 * @param {*} value - Value to cache (must be JSON-serializable)
 * @param {number} [ttlMs=86400000] - Time to live in milliseconds (default 24h)
 */
export function cacheSet(key, value, ttlMs = 24 * 60 * 60 * 1000) {
  ensureCacheDir();
  const path = join(CACHE_DIR, `${key}.json`);
  writeFileSync(path, JSON.stringify({
    value,
    expiresAt: Date.now() + ttlMs,
    cachedAt: new Date().toISOString(),
  }));
}
