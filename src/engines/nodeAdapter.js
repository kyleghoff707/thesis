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
import { mkdirSync, readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import { parseHTML } from 'linkedom';
import { DOMParser as XmlDOMParser } from '@xmldom/xmldom';

// ─── Load .env.local ─────────────────────────────────────────
// CRITICAL: Load .env.local specifically, NOT bare `import 'dotenv/config'`.
// The default dotenv only loads .env which does NOT exist in this project.
// API keys (VITE_CLAUDE_KEY, VITE_ALPHA_VANTAGE_KEY, VITE_ALPHA_VANTAGE_KEY_2)
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
  '/api/alpha/': 'https://www.alphavantage.co/',
  '/data/': 'https://api.thesis-investing.com/data/',
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
 * Patch an @xmldom/xmldom document with minimal querySelector/querySelectorAll.
 * xmldom only supports DOM Level 2 (getElementsByTagName, getElementsByTagNameNS).
 * Several engines (insiders.js, compensation.js) call querySelector('parsererror')
 * on XML documents. This polyfill handles simple tag-name-only selectors.
 */
function patchXmlDoc(doc) {
  if (!doc.querySelector) {
    doc.querySelector = function (selector) {
      // Simple tag-name selector only (e.g., 'parsererror')
      const els = this.getElementsByTagName(selector);
      return els.length > 0 ? els[0] : null;
    };
  }
  if (!doc.querySelectorAll) {
    doc.querySelectorAll = function (selector) {
      return Array.from(this.getElementsByTagName(selector));
    };
  }
  return doc;
}

/**
 * Create a DOMParser-compatible object using linkedom (HTML) or @xmldom/xmldom (XML).
 * Provides querySelectorAll, textContent, getAttribute — the subset
 * used by filingMarkdown.js for HTML-to-markdown conversion.
 * @returns {{ parseFromString: (html: string, type: string) => Document }}
 */
export function createDOMParser() {
  return {
    parseFromString(content, type) {
      if (type === 'text/xml' || type === 'application/xml') {
        return patchXmlDoc(new XmlDOMParser().parseFromString(content, type));
      }
      const { document } = parseHTML(content);
      return document;
    },
  };
}

// ─── Fetch wrapper ───────────────────────────────────────────

/** SEC-required headers for EDGAR API requests */
export const SEC_HEADERS = {
  'User-Agent': 'Thesis/1.0 (contact@thesis.com)',
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
      'User-Agent': 'Thesis/1.0 (contact@thesis.com)',
      ...options.headers,
    };
    return fetch(resolvedURL, { ...options, headers });
  };
}

// ─── File-based cache ────────────────────────────────────────
// Replaces localStorage/IndexedDB for Node.js execution.
// Stores JSON files in .thesis/cache/ with TTL expiration.

const CACHE_DIR = join(process.cwd(), '.thesis', 'cache');

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
    if (data.expiresAt && Date.now() > data.expiresAt) {
      try { unlinkSync(path); } catch {}
      return null;
    }
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

// ─── Repo-bundled transcript reader ──────────────────────────
// Phase 3: ./transcripts/{TICKER}/{YEAR}/Q{N}.md ships in the repo so
// CLI users get earnings call transcripts without R2 access. transcripts.js
// calls globalThis.__nodeTranscriptRead before falling through to R2/AV.

const TRANSCRIPTS_DIR = join(process.cwd(), 'transcripts');

/**
 * Read a repo-bundled transcript. Returns { text, meta } or null.
 * @param {string} ticker - Uppercase ticker symbol
 * @param {number} year - 4-digit year
 * @param {number} quarter - 1..4
 */
export function readBundledTranscript(ticker, year, quarter) {
  const path = join(TRANSCRIPTS_DIR, ticker, String(year), `Q${quarter}.md`);
  if (!existsSync(path)) return null;
  try {
    const text = readFileSync(path, 'utf8');
    return { text, meta: { source: 'repo', year, quarterNum: quarter } };
  } catch {
    return null;
  }
}

// ─── Node.js Global Shims ──────────────────────────────────────
// When running in Node.js, inject browser-like globals so engines
// can run unmodified. This block must run at import time (side-effect)
// so that all subsequent engine imports find these globals.

if (IS_NODE) {
  // 1. Global DOMParser via linkedom
  // Engines (insiders.js, compensation.js, finviz.js, filingMarkdown.js)
  // use `new DOMParser()` directly — inject it globally.
  globalThis.DOMParser = class NodeDOMParser {
    parseFromString(content, type) {
      if (type === 'text/xml' || type === 'application/xml') {
        return patchXmlDoc(new XmlDOMParser().parseFromString(content, type));
      }
      const { document } = parseHTML(content);
      return document;
    }
  };

  // 2. Fake IndexedDB globals to prevent idb package crashes
  // The idb package references IDBRequest, IDBDatabase, IDBObjectStore,
  // IDBIndex, IDBCursor, IDBTransaction as globals. Define minimal stubs.
  // cacheStore.js checks `typeof indexedDB !== 'undefined'` (HAS_IDB).
  // The idb openDB wraps indexedDB.open() result with promisifyRequest.
  const FakeIDBClass = class {};
  for (const name of [
    'IDBRequest', 'IDBOpenDBRequest', 'IDBDatabase', 'IDBObjectStore',
    'IDBIndex', 'IDBCursor', 'IDBTransaction', 'IDBKeyRange',
  ]) {
    if (typeof globalThis[name] === 'undefined') {
      globalThis[name] = FakeIDBClass;
    }
  }
  if (typeof globalThis.indexedDB === 'undefined') {
    globalThis.indexedDB = {
      open() {
        const listeners = {};
        const req = Object.create(FakeIDBClass.prototype);
        Object.assign(req, {
          result: null,
          error: new Error('IndexedDB not available in Node.js'),
          readyState: 'done',
          onerror: null,
          onsuccess: null,
          onupgradeneeded: null,
          addEventListener(evt, fn) {
            if (!listeners[evt]) listeners[evt] = [];
            listeners[evt].push(fn);
          },
          removeEventListener(evt, fn) {
            if (listeners[evt]) {
              listeners[evt] = listeners[evt].filter(f => f !== fn);
            }
          },
          dispatchEvent() { return true; },
        });
        // Fire error asynchronously — idb's promisifyRequest listens via addEventListener('error', ...)
        setTimeout(() => {
          const errorHandlers = listeners['error'] || [];
          for (const fn of errorHandlers) fn();
          if (req.onerror) req.onerror({ target: req });
        }, 0);
        return req;
      },
    };
  }

  // 3. Global localStorage shim (Map-backed)
  // cache.js and several engines use localStorage directly for
  // small-key caching. This prevents ReferenceError in Node.js.
  if (typeof globalThis.localStorage === 'undefined' || typeof globalThis.localStorage.getItem !== 'function') {
    const _store = new Map();
    globalThis.localStorage = {
      getItem(k) { return _store.get(k) ?? null; },
      setItem(k, v) { _store.set(k, String(v)); },
      removeItem(k) { _store.delete(k); },
      key(i) { return [..._store.keys()][i] ?? null; },
      get length() { return _store.size; },
      clear() { _store.clear(); },
    };
  }

  // 4. Expose file-based cache for cache.js Node routing
  // cache.js checks globalThis.__nodeCache to redirect all
  // cacheGet/cacheSet/cacheGetAsync to file-based storage.
  globalThis.__nodeCache = { cacheGet, cacheSet };

  // 4b. Expose repo-bundled transcript reader for transcripts.js
  // (Phase 3: CLI users get S&P 500 transcripts from ./transcripts/
  // without needing R2 or an Alpha Vantage key.)
  globalThis.__nodeTranscriptRead = readBundledTranscript;

  // 5. Patch fetch to intercept Vite middleware URLs
  // In the browser, engines call /api/yahoo-summary/:ticker etc.
  // which are Vite middleware endpoints (not simple proxies).
  // In Node.js, we intercept these and call the underlying
  // libraries directly (yahoo-finance2, cheerio).
  const _origFetch = globalThis.fetch;
  globalThis.fetch = async function patchedFetch(url, opts = {}) {
    const urlStr = typeof url === 'string' ? url : url.toString();

    // Yahoo Summary middleware interception (dev path)
    // AND Yahoo v10 quoteSummary (production path — engines use this when isDev is false)
    // Both need to route through yahoo-finance2 for crumb/cookie auth.
    const yahooV10Match = urlStr.match(
      /^https:\/\/query\d\.finance\.yahoo\.com\/v10\/finance\/quoteSummary\/([^?]+)/
    );
    if (yahooV10Match) {
      try {
        const ticker = decodeURIComponent(yahooV10Match[1]);
        const qs = urlStr.split('?')[1] || '';
        const params = new URLSearchParams(qs);
        const modules = params.has('modules')
          ? params.get('modules').split(',').map(m => m.trim()).filter(Boolean)
          : undefined;
        const { yahooSummary } = await import('./nodeYahoo.js');
        const data = await yahooSummary(ticker, modules);
        return new Response(JSON.stringify({ quoteSummary: { result: [data] } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    if (urlStr.startsWith('/api/yahoo-summary/')) {
      try {
        const pathAndQs = urlStr.replace('/api/yahoo-summary/', '');
        const [tickerPart, qs] = pathAndQs.split('?');
        const ticker = decodeURIComponent(tickerPart);
        const params = new URLSearchParams(qs || '');
        const modules = params.has('modules')
          ? params.get('modules').split(',').map(m => m.trim()).filter(Boolean)
          : undefined;
        const { yahooSummary } = await import('./nodeYahoo.js');
        const data = await yahooSummary(ticker, modules);
        return new Response(JSON.stringify(data), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    // Yahoo Quotes middleware interception
    if (urlStr.startsWith('/api/yahoo-quotes/')) {
      try {
        const tickerStr = urlStr.replace('/api/yahoo-quotes/', '').split('?')[0];
        const { yahooQuotes } = await import('./nodeYahoo.js');
        const data = await yahooQuotes(tickerStr);
        return new Response(JSON.stringify(data), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    // Finviz middleware interception
    if (urlStr.startsWith('/api/finviz/')) {
      try {
        const ticker = decodeURIComponent(
          urlStr.replace('/api/finviz/', '').split('?')[0]
        );
        const { finvizData } = await import('./nodeFinviz.js');
        const data = await finvizData(ticker);
        return new Response(JSON.stringify(data), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    // Standard proxy resolution for SEC/EDGAR/Yahoo URLs
    const resolvedURL = resolveURL(urlStr);
    // Headers may be a Headers instance (e.g. from Anthropic SDK) — spread
    // doesn't enumerate Headers entries, so convert to plain object first.
    const incomingHeaders = opts.headers instanceof Headers
      ? Object.fromEntries(opts.headers.entries())
      : (opts.headers || {});
    const headers = {
      'User-Agent': 'Thesis/1.0 (contact@thesis.com)',
      ...incomingHeaders,
    };
    return _origFetch(resolvedURL, { ...opts, headers });
  };
}
