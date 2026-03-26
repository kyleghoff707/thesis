// Tests for nodeAdapter.js — Node.js data bridge for running engines outside the browser
// Verifies: URL resolution, env access, DOM parsing, file caching, fetch wrapper

import { describe, it, expect, afterAll } from 'vitest';
import { readFileSync, rmSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import {
  IS_NODE,
  getEnv,
  isDev,
  resolveURL,
  PROXY_MAP,
  createDOMParser,
  createNodeFetch,
  SEC_HEADERS,
  cacheGet,
  cacheSet,
  ensureCacheDir,
} from '../nodeAdapter.js';

// ─── URL Resolution ──────────────────────────────────────────

describe('resolveURL', () => {
  it('resolves /api/sec/ to https://www.sec.gov/', () => {
    expect(resolveURL('/api/sec/cgi-bin/browse-edgar?action=getcompany'))
      .toBe('https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany');
  });

  it('resolves /api/edgar/ to https://data.sec.gov/', () => {
    expect(resolveURL('/api/edgar/submissions/CIK0000320193.json'))
      .toBe('https://data.sec.gov/submissions/CIK0000320193.json');
  });

  it('resolves /api/efts/ to https://efts.sec.gov/', () => {
    expect(resolveURL('/api/efts/LATEST/search-index?q=AAPL'))
      .toBe('https://efts.sec.gov/LATEST/search-index?q=AAPL');
  });

  it('resolves /api/yahoo/ to https://query1.finance.yahoo.com/', () => {
    expect(resolveURL('/api/yahoo/v8/finance/chart/AAPL'))
      .toBe('https://query1.finance.yahoo.com/v8/finance/chart/AAPL');
  });

  it('resolves /api/finviz/ to https://finviz.com/', () => {
    expect(resolveURL('/api/finviz/quote.ashx?t=AAPL'))
      .toBe('https://finviz.com/quote.ashx?t=AAPL');
  });

  it('resolves /api/finnhub/ to https://finnhub.io/', () => {
    expect(resolveURL('/api/finnhub/api/v1/stock/earnings?symbol=AAPL'))
      .toBe('https://finnhub.io/api/v1/stock/earnings?symbol=AAPL');
  });

  it('resolves /api/alpha/ to https://www.alphavantage.co/', () => {
    expect(resolveURL('/api/alpha/query?function=EARNINGS'))
      .toBe('https://www.alphavantage.co/query?function=EARNINGS');
  });

  it('passes through non-proxy URLs unchanged', () => {
    expect(resolveURL('https://example.com/path'))
      .toBe('https://example.com/path');
  });
});

// ─── Environment ─────────────────────────────────────────────

describe('environment', () => {
  it('IS_NODE is true (running in vitest = Node)', () => {
    expect(IS_NODE).toBe(true);
  });

  it('isDev() returns false in Node', () => {
    expect(isDev()).toBe(false);
  });

  it('getEnv returns empty string for undefined env vars', () => {
    expect(getEnv('DEFINITELY_NOT_A_REAL_VAR_XYZ_123')).toBe('');
  });

  it('getEnv does not throw for any key', () => {
    expect(() => getEnv('VITE_CLAUDE_KEY')).not.toThrow();
  });

  it('getEnv reads from .env.local (source file verification)', () => {
    const source = readFileSync(
      resolve(__dirname, '..', 'nodeAdapter.js'),
      'utf8'
    );
    expect(source).toContain('.env.local');
  });
});

// ─── DOM Parsing ─────────────────────────────────────────────

describe('createDOMParser', () => {
  it('returns object with parseFromString method', () => {
    const parser = createDOMParser();
    expect(typeof parser.parseFromString).toBe('function');
  });

  it('parses HTML and supports querySelectorAll', () => {
    const parser = createDOMParser();
    const doc = parser.parseFromString('<div><p class="test">hello</p></div>', 'text/html');
    const ps = doc.querySelectorAll('p');
    expect(ps.length).toBe(1);
  });

  it('supports textContent on parsed elements', () => {
    const parser = createDOMParser();
    const doc = parser.parseFromString('<div><p class="test">hello</p></div>', 'text/html');
    const ps = doc.querySelectorAll('p');
    expect(ps[0].textContent).toBe('hello');
  });

  it('supports getAttribute on parsed elements', () => {
    const parser = createDOMParser();
    const doc = parser.parseFromString('<div><p class="test">hello</p></div>', 'text/html');
    const ps = doc.querySelectorAll('p');
    expect(ps[0].getAttribute('class')).toBe('test');
  });

  it('parses tables correctly (td count)', () => {
    const parser = createDOMParser();
    const doc = parser.parseFromString(
      '<table><tr><td>A</td><td>B</td></tr></table>',
      'text/html'
    );
    const tds = doc.querySelectorAll('td');
    expect(tds.length).toBe(2);
  });
});

// ─── File-based Cache ────────────────────────────────────────

describe('file cache', () => {
  const TEST_CACHE_KEY = '__nodeAdapter_test_key__';

  afterAll(() => {
    // Clean up test cache file
    const cachePath = join(process.cwd(), '.thes1s', 'cache', `${TEST_CACHE_KEY}.json`);
    if (existsSync(cachePath)) {
      rmSync(cachePath);
    }
  });

  it('cacheSet does not throw', () => {
    expect(() => cacheSet(TEST_CACHE_KEY, { foo: 'bar' })).not.toThrow();
  });

  it('cacheGet returns stored value', () => {
    cacheSet(TEST_CACHE_KEY, { foo: 'bar' });
    const result = cacheGet(TEST_CACHE_KEY);
    expect(result).toEqual({ foo: 'bar' });
  });

  it('cacheGet returns null for nonexistent key', () => {
    expect(cacheGet('nonexistent_key_xyz_999')).toBeNull();
  });
});

// ─── Fetch Wrapper ───────────────────────────────────────────

describe('createNodeFetch', () => {
  it('returns a function', () => {
    const nodeFetch = createNodeFetch();
    expect(typeof nodeFetch).toBe('function');
  });
});

// ─── Constants ───────────────────────────────────────────────

describe('constants', () => {
  it('PROXY_MAP has all 7 routes', () => {
    expect(Object.keys(PROXY_MAP)).toHaveLength(7);
    expect(PROXY_MAP['/api/sec/']).toBe('https://www.sec.gov/');
    expect(PROXY_MAP['/api/edgar/']).toBe('https://data.sec.gov/');
    expect(PROXY_MAP['/api/efts/']).toBe('https://efts.sec.gov/');
    expect(PROXY_MAP['/api/yahoo/']).toBe('https://query1.finance.yahoo.com/');
    expect(PROXY_MAP['/api/finviz/']).toBe('https://finviz.com/');
    expect(PROXY_MAP['/api/finnhub/']).toBe('https://finnhub.io/');
    expect(PROXY_MAP['/api/alpha/']).toBe('https://www.alphavantage.co/');
  });

  it('SEC_HEADERS includes User-Agent', () => {
    expect(SEC_HEADERS['User-Agent']).toBe('Thes1s/1.0 (contact@thes1s.com)');
  });

  it('SEC_HEADERS includes Accept', () => {
    expect(SEC_HEADERS['Accept']).toBe('application/json');
  });
});

// ─── Node.js Global Shims (Phase 06.1 additions) ────────────

describe('Node.js global shims', () => {
  it('globalThis.DOMParser is defined when running in Node', () => {
    // nodeAdapter.js sets DOMParser globally when IS_NODE is true
    expect(globalThis.DOMParser).toBeDefined();
    expect(typeof globalThis.DOMParser).toBe('function');
  });

  it('globalThis.DOMParser parses HTML correctly', () => {
    const parser = new globalThis.DOMParser();
    const doc = parser.parseFromString('<div><p>test</p></div>', 'text/html');
    const ps = doc.querySelectorAll('p');
    expect(ps.length).toBe(1);
    expect(ps[0].textContent).toBe('test');
  });

  it('globalThis.localStorage has getItem/setItem/removeItem/key/length', () => {
    expect(globalThis.localStorage).toBeDefined();
    expect(typeof globalThis.localStorage.getItem).toBe('function');
    expect(typeof globalThis.localStorage.setItem).toBe('function');
    expect(typeof globalThis.localStorage.removeItem).toBe('function');
    expect(typeof globalThis.localStorage.key).toBe('function');
    expect(typeof globalThis.localStorage.length).toBe('number');
  });

  it('globalThis.localStorage stores and retrieves values', () => {
    globalThis.localStorage.setItem('__test_key__', 'hello');
    expect(globalThis.localStorage.getItem('__test_key__')).toBe('hello');
    globalThis.localStorage.removeItem('__test_key__');
    expect(globalThis.localStorage.getItem('__test_key__')).toBeNull();
  });

  it('globalThis.indexedDB is defined (truthy placeholder)', () => {
    expect(globalThis.indexedDB).toBeDefined();
    expect(globalThis.indexedDB).toBeTruthy();
  });

  it('globalThis.__nodeCache has cacheGet and cacheSet functions', () => {
    expect(globalThis.__nodeCache).toBeDefined();
    expect(typeof globalThis.__nodeCache.cacheGet).toBe('function');
    expect(typeof globalThis.__nodeCache.cacheSet).toBe('function');
  });

  it('globalThis.__nodeCache.cacheGet/cacheSet work for round-trip', () => {
    const key = '__shim_test_roundtrip__';
    globalThis.__nodeCache.cacheSet(key, { data: 42 }, 60000);
    const result = globalThis.__nodeCache.cacheGet(key);
    expect(result).toEqual({ data: 42 });
  });
});

// ─── Fetch Interception ─────────────────────────────────────

describe('fetch interception', () => {
  it('globalThis.fetch is a patched function (not native)', () => {
    // The patched fetch has a name of 'patchedFetch'
    expect(globalThis.fetch.name).toBe('patchedFetch');
  });

  it('intercepts /api/yahoo-summary/ URLs and returns a Response', async () => {
    // This test verifies the interception mechanism, not the Yahoo API
    // In vitest, the dynamic import of nodeYahoo.js will execute real code,
    // so we just verify the fetch returns a Response-like object
    const resp = await globalThis.fetch('/api/yahoo-summary/AAPL');
    expect(resp).toBeDefined();
    expect(typeof resp.json).toBe('function');
    // Should return 200 or 500 (depending on yahoo-finance2 availability)
    expect([200, 500]).toContain(resp.status);
  });

  it('intercepts /api/yahoo-quotes/ URLs and returns a Response', async () => {
    const resp = await globalThis.fetch('/api/yahoo-quotes/AAPL');
    expect(resp).toBeDefined();
    expect(typeof resp.json).toBe('function');
    expect([200, 500]).toContain(resp.status);
  });

  it('intercepts /api/finviz/ URLs and returns a Response', async () => {
    const resp = await globalThis.fetch('/api/finviz/AAPL');
    expect(resp).toBeDefined();
    expect(typeof resp.json).toBe('function');
    expect([200, 500]).toContain(resp.status);
  });
});

// ─── cache.js IS_NODE Routing ────────────────────────────────

describe('cache.js IS_NODE routing', () => {
  it('cacheGet routes to file cache via __nodeCache in Node.js', async () => {
    // Import cache.js — in Node.js (vitest), it should detect IS_NODE
    const { cacheGet: cachejsGet, cacheSet: cachejsSet } = await import('../cache.js');

    // The __nodeCache is set by nodeAdapter.js. In vitest, since we imported
    // nodeAdapter.js above, __nodeCache should be available.
    // Set a value via nodeAdapter's file cache
    const testKey = '__cache_routing_test__';
    globalThis.__nodeCache.cacheSet(testKey.replace(/[/:]/g, '_'), { routed: true }, 60000);

    // Read it back via cache.js — should route to file cache
    const result = cachejsGet(testKey);
    expect(result).toEqual({ routed: true });
  });
});
