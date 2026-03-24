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
