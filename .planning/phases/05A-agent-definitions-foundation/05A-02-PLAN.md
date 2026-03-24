---
phase: 05A-agent-definitions-foundation
plan: 02
type: execute
wave: 1
depends_on: []
files_modified:
  - src/engines/nodeAdapter.js
  - src/engines/__tests__/nodeAdapter.test.js
autonomous: true
requirements: [DATA-02]

must_haves:
  truths:
    - "Node.js code can resolve Vite proxy URLs to their real external endpoints"
    - "Node.js code can parse HTML using linkedom instead of browser DOMParser"
    - "Node.js code can read environment variables from .env.local via dotenv"
    - "Node.js code can detect it is running outside a browser and behave accordingly"
  artifacts:
    - path: "src/engines/nodeAdapter.js"
      provides: "Browser API shims for Node.js: env wrapper, URL resolver, DOMParser provider, cache provider, IS_NODE detection"
      exports: ["getEnv", "isDev", "resolveURL", "createDOMParser", "IS_NODE", "PROXY_MAP", "createNodeFetch"]
    - path: "src/engines/__tests__/nodeAdapter.test.js"
      provides: "Unit tests for Node adapter shims"
  key_links:
    - from: "src/engines/nodeAdapter.js"
      to: "src/engines/config.js"
      via: "getEnv replaces import.meta.env for VITE_CLAUDE_KEY, VITE_FINNHUB_KEY, VITE_ALPHA_VANTAGE_KEY"
      pattern: "getEnv.*VITE_"
    - from: "src/engines/nodeAdapter.js"
      to: "src/engines/filingMarkdown.js"
      via: "createDOMParser replaces browser DOMParser for HTML parsing"
      pattern: "createDOMParser"
    - from: "src/engines/nodeAdapter.js"
      to: "src/engines/edgar.js"
      via: "resolveURL maps /api/sec/ and /api/edgar/ proxy routes to real SEC URLs"
      pattern: "resolveURL"
---

<objective>
Create the Node.js data bridge adapter that shims browser APIs for Node.js execution. This module lets the existing 30+ engine files (designed for browser/Vite) run in Node.js for CC Skills and future backend use. It maps Vite proxy routes to real URLs, provides linkedom as DOMParser replacement, wraps import.meta.env access, and offers a fetch wrapper with proper User-Agent headers.

Purpose: The engines currently depend on browser APIs (import.meta.env.DEV for URL routing, DOMParser for HTML, Vite proxy for CORS). CC Skills run in Node.js where none of these exist. This adapter bridges that gap, enabling DataPacket assembly from the command line.

Output: nodeAdapter.js (~200 LOC) with exports for all browser API shims, plus tests proving each shim works correctly in Node.js.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/05A-agent-definitions-foundation/05A-RESEARCH.md
@.planning/research/STACK.md
</context>

<interfaces>
<!-- Key patterns from existing engines that the adapter must support -->

From src/engines/config.js:
```javascript
function env(key) {
  const val = import.meta.env[key];
  return val ? val.trim() : '';
}
export const CLAUDE_KEY = env('VITE_CLAUDE_KEY');
export const FINNHUB_KEY = env('VITE_FINNHUB_KEY');
export const ALPHA_VANTAGE_KEY = env('VITE_ALPHA_VANTAGE_KEY');
```

From Vite proxy routes (vite.config.js proxy patterns used by 15 engine files):
```
/api/sec/    -> https://www.sec.gov/
/api/edgar/  -> https://data.sec.gov/
/api/efts/   -> https://efts.sec.gov/
/api/yahoo/  -> https://query1.finance.yahoo.com/
/api/finviz/ -> https://finviz.com/
/api/finnhub/ -> https://finnhub.io/
/api/alpha/  -> https://www.alphavantage.co/
```

From src/engines/filingMarkdown.js (uses DOMParser):
```javascript
const parser = new DOMParser();
const doc = parser.parseFromString(html, 'text/html');
doc.querySelectorAll('table');
element.textContent;
```
</interfaces>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Create Node.js adapter module</name>
  <files>src/engines/nodeAdapter.js</files>
  <read_first>
    - src/engines/config.js (see how import.meta.env is accessed — 3 env vars: VITE_CLAUDE_KEY, VITE_FINNHUB_KEY, VITE_ALPHA_VANTAGE_KEY)
    - src/engines/edgar.js (first 50 lines — see how fetch URLs are constructed with proxy prefix)
    - src/engines/edgarFrames.js (first 30 lines — see /api/edgar/ proxy usage)
    - src/engines/filingMarkdown.js (first 50 lines — see DOMParser usage)
    - src/engines/cacheStore.js (first 80 lines — see HAS_IDB detection pattern and localStorage fallback)
    - .planning/phases/05A-agent-definitions-foundation/05A-RESEARCH.md (lines 298-352 for nodeAdapter pattern)
    - .planning/research/STACK.md (lines 101-127 for Node.js data bridge details)
  </read_first>
  <behavior>
    - Test 1: IS_NODE is true when typeof window is undefined (Node environment)
    - Test 2: getEnv('VITE_CLAUDE_KEY') returns process.env.VITE_CLAUDE_KEY in Node
    - Test 3: isDev() returns false in Node (Node = production mode, no Vite proxy)
    - Test 4: resolveURL('/api/sec/cgi-bin/browse-edgar?action=getcompany') returns 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany'
    - Test 5: resolveURL('/api/edgar/submissions/CIK0000320193.json') returns 'https://data.sec.gov/submissions/CIK0000320193.json'
    - Test 6: resolveURL('/api/efts/LATEST/search-index?q=AAPL') returns 'https://efts.sec.gov/LATEST/search-index?q=AAPL'
    - Test 7: resolveURL('/api/yahoo/v8/finance/chart/AAPL') returns 'https://query1.finance.yahoo.com/v8/finance/chart/AAPL'
    - Test 8: resolveURL('https://some-external.com/path') returns the URL unchanged (not a proxy route)
    - Test 9: createDOMParser() returns object with parseFromString method
    - Test 10: createDOMParser().parseFromString('<div><p>test</p></div>', 'text/html') returns a document where querySelectorAll('p') has length 1
    - Test 11: createNodeFetch wraps fetch with User-Agent header 'Thes1s/1.0 (contact@thes1s.com)'
  </behavior>
  <action>
    Create `src/engines/nodeAdapter.js` with these exact exports:

    ```javascript
    // Node.js Data Bridge — Browser API shims for running engines outside the browser
    // Used by dataExport.js (CC Skills) and future aiResearch.js (commercial backend)
    ```

    **IS_NODE constant:**
    `export const IS_NODE = typeof window === 'undefined';`

    **getEnv(key) function:**
    - In Node: load dotenv/config (once, at module level via side-effect import), return `process.env[key]?.trim() || ''`
    - In browser: return `import.meta.env[key]?.trim() || ''`
    - Note: Must handle conditional import — use dynamic import or IS_NODE guard. Since this module may be imported by Vite in browser context, wrap the dotenv import in an IS_NODE check using a top-level side effect:
      ```javascript
      if (IS_NODE) {
        // Dynamic import not needed — dotenv/config auto-loads .env
        // But we need to handle this at build time. Use try/catch for safety.
        try { await import('dotenv/config'); } catch {}
      }
      ```
      Actually, since Vite tree-shakes dead code, use a simpler pattern: make nodeAdapter.js a Node-only module. Browser code continues using config.js directly. The adapter is imported ONLY by dataExport.js which runs in Node.

    **Revised approach:** This module is Node-only. It will only be imported by dataExport.js and toolbox.js which run in Node for CC Skills. Browser code continues using config.js and native APIs. This simplifies everything — no dual-mode conditionals needed.

    At the top of the file:
    ```javascript
    import 'dotenv/config';  // loads .env.local into process.env
    import { parseHTML } from 'linkedom';
    ```

    **getEnv(key):**
    ```javascript
    export function getEnv(key) {
      return process.env[key]?.trim() || '';
    }
    ```

    **isDev():**
    ```javascript
    export function isDev() {
      return false;  // Node adapter always runs in "production" mode (direct fetch, no proxy)
    }
    ```

    **PROXY_MAP constant:**
    ```javascript
    export const PROXY_MAP = {
      '/api/sec/': 'https://www.sec.gov/',
      '/api/edgar/': 'https://data.sec.gov/',
      '/api/efts/': 'https://efts.sec.gov/',
      '/api/yahoo/': 'https://query1.finance.yahoo.com/',
      '/api/finviz/': 'https://finviz.com/',
      '/api/finnhub/': 'https://finnhub.io/',
      '/api/alpha/': 'https://www.alphavantage.co/',
    };
    ```

    **resolveURL(proxyURL):**
    - Iterate PROXY_MAP entries
    - If proxyURL starts with any key, replace the prefix with the corresponding real URL
    - If no match, return proxyURL unchanged
    - This enables engines built for Vite proxy to work with direct URLs in Node

    **createDOMParser():**
    ```javascript
    export function createDOMParser() {
      return {
        parseFromString(html, type) {
          const { document } = parseHTML(html);
          return document;
        }
      };
    }
    ```

    **createNodeFetch():**
    Returns a wrapped fetch function that adds the SEC-required User-Agent header:
    ```javascript
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
    ```

    **SEC_HEADERS constant** (for engines that construct headers manually):
    ```javascript
    export const SEC_HEADERS = {
      'User-Agent': 'Thes1s/1.0 (contact@thes1s.com)',
      'Accept': 'application/json',
    };
    ```

    **File-based cache provider** for engines that use localStorage:
    ```javascript
    import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
    import { join } from 'path';

    const CACHE_DIR = join(process.cwd(), '.thes1s', 'cache');

    export function ensureCacheDir() {
      mkdirSync(CACHE_DIR, { recursive: true });
    }

    export function cacheGet(key) {
      const path = join(CACHE_DIR, `${key}.json`);
      if (!existsSync(path)) return null;
      try {
        const data = JSON.parse(readFileSync(path, 'utf8'));
        if (data.expiresAt && Date.now() > data.expiresAt) return null;
        return data.value;
      } catch { return null; }
    }

    export function cacheSet(key, value, ttlMs = 24 * 60 * 60 * 1000) {
      ensureCacheDir();
      const path = join(CACHE_DIR, `${key}.json`);
      writeFileSync(path, JSON.stringify({
        value,
        expiresAt: Date.now() + ttlMs,
        cachedAt: new Date().toISOString(),
      }));
    }
    ```

    Total module should be ~150-200 LOC with clear JSDoc comments on each export.
  </action>
  <verify>
    <automated>cd /Users/kylehoff/Desktop/stock-analyzer && npx vitest run src/engines/__tests__/nodeAdapter.test.js --reporter=verbose</automated>
  </verify>
  <acceptance_criteria>
    - src/engines/nodeAdapter.js exists and is <250 LOC
    - File exports: getEnv, isDev, resolveURL, createDOMParser, createNodeFetch, IS_NODE, PROXY_MAP, SEC_HEADERS, cacheGet, cacheSet, ensureCacheDir
    - resolveURL('/api/sec/foo') returns string starting with 'https://www.sec.gov/foo'
    - resolveURL('/api/edgar/foo') returns string starting with 'https://data.sec.gov/foo'
    - resolveURL('/api/efts/foo') returns string starting with 'https://efts.sec.gov/foo'
    - resolveURL('/api/yahoo/foo') returns string starting with 'https://query1.finance.yahoo.com/foo'
    - resolveURL('https://example.com') returns 'https://example.com' unchanged
    - createDOMParser().parseFromString('<div>test</div>', 'text/html') does not throw
    - isDev() returns false
    - File begins with `import 'dotenv/config'` or equivalent
  </acceptance_criteria>
  <done>nodeAdapter.js provides all browser API shims needed for engines to run in Node.js, with tests proving each shim works correctly</done>
</task>

<task type="auto">
  <name>Task 2: Node adapter tests</name>
  <files>src/engines/__tests__/nodeAdapter.test.js</files>
  <read_first>
    - src/engines/nodeAdapter.js (the module just created — see all exports and their signatures)
    - src/engines/__tests__/edgarFinancials.test.js (first 30 lines — existing vitest test patterns in this project)
  </read_first>
  <action>
    Create `src/engines/__tests__/nodeAdapter.test.js` with vitest tests:

    **describe('nodeAdapter')**

    **URL resolution tests:**
    - resolveURL('/api/sec/cgi-bin/browse-edgar?action=getcompany') === 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany'
    - resolveURL('/api/edgar/submissions/CIK0000320193.json') === 'https://data.sec.gov/submissions/CIK0000320193.json'
    - resolveURL('/api/efts/LATEST/search-index?q=AAPL') === 'https://efts.sec.gov/LATEST/search-index?q=AAPL'
    - resolveURL('/api/yahoo/v8/finance/chart/AAPL') === 'https://query1.finance.yahoo.com/v8/finance/chart/AAPL'
    - resolveURL('/api/finviz/quote.ashx?t=AAPL') === 'https://finviz.com/quote.ashx?t=AAPL'
    - resolveURL('/api/finnhub/api/v1/stock/earnings?symbol=AAPL') === 'https://finnhub.io/api/v1/stock/earnings?symbol=AAPL'
    - resolveURL('/api/alpha/query?function=EARNINGS') === 'https://www.alphavantage.co/query?function=EARNINGS'
    - resolveURL('https://example.com/path') === 'https://example.com/path' (passthrough for non-proxy URLs)

    **Environment tests:**
    - isDev() returns false
    - getEnv returns empty string for undefined env vars
    - IS_NODE is true (running in vitest = Node)

    **DOM parsing tests:**
    - createDOMParser() returns object with parseFromString method
    - parseFromString('<div><p class="test">hello</p></div>', 'text/html') produces document where querySelectorAll('p') has length 1
    - querySelectorAll('p')[0].textContent === 'hello'
    - querySelectorAll('p')[0].getAttribute('class') === 'test'
    - parseFromString('<table><tr><td>A</td><td>B</td></tr></table>', 'text/html') parses table correctly (querySelectorAll('td').length === 2)

    **Cache tests:**
    - cacheSet('test-key', { foo: 'bar' }) does not throw
    - cacheGet('test-key') returns { foo: 'bar' }
    - cacheGet('nonexistent-key') returns null
    - Use a beforeEach/afterEach to clean up test cache files (or use a unique key per test)

    **Fetch wrapper tests:**
    - createNodeFetch() returns a function
    - The returned function type is 'function'
    - (Do NOT test actual HTTP calls — just verify the wrapper exists and resolves URLs)
  </action>
  <verify>
    <automated>cd /Users/kylehoff/Desktop/stock-analyzer && npx vitest run src/engines/__tests__/nodeAdapter.test.js --reporter=verbose</automated>
  </verify>
  <acceptance_criteria>
    - src/engines/__tests__/nodeAdapter.test.js exists with at least 15 test cases
    - `npx vitest run src/engines/__tests__/nodeAdapter.test.js --reporter=verbose` exits with code 0
    - Test output contains "resolveURL" and "createDOMParser" test names
    - All 7 proxy URL mappings tested (sec, edgar, efts, yahoo, finviz, finnhub, alpha)
    - DOM parsing test verifies querySelectorAll and textContent work (linkedom compatibility)
  </acceptance_criteria>
  <done>All node adapter tests pass, confirming URL resolution, DOM parsing, env access, and caching shims work in Node.js</done>
</task>

</tasks>

<verification>
1. `npx vitest run src/engines/__tests__/nodeAdapter.test.js --reporter=verbose` — all tests pass
2. `npm test -- --run` — existing 630+ tests still pass (no regressions)
3. `node -e "import('./src/engines/nodeAdapter.js').then(m => console.log(m.resolveURL('/api/sec/test')))"` outputs `https://www.sec.gov/test`
</verification>

<success_criteria>
- nodeAdapter.js exists at ~150-200 LOC with all browser API shims
- All proxy URL mappings correct (7 routes)
- linkedom DOMParser provides querySelectorAll, textContent, getAttribute
- File-based caching works for key/value with TTL
- All tests pass with 0 failures
- Existing tests unbroken
</success_criteria>

<output>
After completion, create `.planning/phases/05A-agent-definitions-foundation/05A-02-SUMMARY.md`
</output>
