# Testing Patterns

**Analysis Date:** 2026-03-24

## Test Framework

**Runner:**
- Vitest 4.x
- Config: embedded in `vite.config.js` (no separate `vitest.config.*` file)

**Assertion Library:**
- Vitest built-in (`expect`)

**Run Commands:**
```bash
npm test              # Run all tests (vitest run — single pass)
npm run test:watch    # Watch mode (vitest)
```

No coverage command configured in `package.json`. Coverage not enforced.

## Test File Organization

**Location:** Co-located in `src/engines/__tests__/` — all tests live in a single flat directory alongside the engine source files they test.

**Naming:** `{engineName}.test.js` mirrors `src/engines/{engineName}.js`
- `edgarFinancials.test.js` → tests `engines/edgarFinancials.js`
- `splits.test.js` → tests `engines/splits.js`
- `peerMetrics.test.js` → tests `engines/peerMetrics.js`
- `compensation.test.js` → tests `engines/compensation.js`

**No component tests** — only engine (pure logic) files have tests. React components are untested.

**Fixture data:**
```
src/engines/__tests__/fixtures/
├── morningstar/              # Annual Morningstar golden fixtures (50 tickers) + field-mapping.json
│   └── edgar-cache/          # Disk-cached SEC EDGAR responses (gitignored, shared)
├── morningstar-quarterly/    # Quarterly Morningstar fixtures (50 tickers)
└── r1toolbox/                # Rule One Toolbox reference data
```

## Test Structure

**Suite Organization:**
```js
// Tests for {engine} — {brief description}
// Fix 2 (P1b): {what was fixed}

import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Phase/Fix/Feature label: Human-readable title', () => {
  it('should {expected behavior}', () => {
    expect(result).toBe(expected);
  });
});
```

Describes are labeled by: phase (`Phase 4: Industry Classifier`), bug number (`Bug 1: ...`), or fix reference (`Fix 3 (P1a): ...`). This traces each test directly back to the issue it validates.

**Async tests:** `async/await` throughout, no callbacks:
```js
it('should parse Yahoo splits format', async () => {
  const { parseYahooSplits } = await import('../splits');
  const result = parseYahooSplits(yahooEvents);
  expect(result).toHaveLength(2);
});
```

**Dynamic imports in tests:** Used when mocks must be set up before module initialization:
```js
vi.mock('../edgar', () => ({ lookupCIK: vi.fn(), ... }));
// Then dynamic import AFTER mocks are in place:
const { INCOME_TAXONOMY, computeDerivedFields } = await import('../edgarFinancials');
```

**Setup/Teardown:**
```js
beforeEach(() => {
  fetchFrameCalls.length = 0;
  mockFrameResponses = {};
  vi.clearAllMocks();
});
```

`beforeAll` / `afterAll` used in integration tests for fetch interceptor setup and cleanup.

## Mocking

**Framework:** `vi` from Vitest (`vi.mock`, `vi.fn`, `vi.clearAllMocks`, `vi.importActual`)

**Standard mock pattern — external dependencies:**
Every engine test mocks the same three modules to isolate unit under test:
```js
vi.mock('../edgar', () => ({
  lookupCIK: vi.fn(),
  fetchCompanyFacts: vi.fn(),
  extractAnnualFact: vi.fn(),
  extractAnnualFactOriginal: vi.fn(),
  extractFiscalYearEnds: vi.fn(() => ({})),
  findLatestQuarter: vi.fn(),
}));
vi.mock('../cache', () => ({
  cacheGet: () => null,
  cacheGetAsync: async () => null,
  cacheSet: () => {},
}));
vi.mock('../splits', () => ({
  fetchSplits: vi.fn(async () => []),
  cumulativeSplitFactor: vi.fn(() => 1),
}));
```

**Partial mock with `vi.importActual`** — when mocking only one function of a module:
```js
vi.mock('../edgarFrames', async () => {
  const actual = await vi.importActual('../edgarFrames');
  return {
    ...actual,
    fetchFrame: vi.fn(async (tag, unit, cyYear) => {
      fetchFrameCalls.push({ tag, unit, cyYear });
      return mockFrameResponses[`${tag}:${unit}:${cyYear}`] || null;
    }),
  };
});
```

**localStorage mock** — for tests that exercise cache/storage logic:
```js
const store = {};
const mockLocalStorage = {
  getItem: vi.fn((key) => store[key] ?? null),
  setItem: vi.fn((key, value) => { store[key] = String(value); }),
  removeItem: vi.fn((key) => { delete store[key]; }),
  clear: vi.fn(() => { for (const k of Object.keys(store)) delete store[k]; }),
};
globalThis.localStorage = mockLocalStorage;
```

**Configurable mock responses** — used in `peerMetrics.test.js` to simulate different API responses per test:
```js
let mockFrameResponses = {};
// In test:
mockFrameResponses['Assets:USD:CY2023Q4I'] = makeFrameData([{ cik: 100, val: 5e9 }]);
```

**What to Mock:**
- All external network calls (`fetchCompanyFacts`, `fetchFrame`, etc.)
- Cache layer (`cacheGet`, `cacheSet`, `cacheGetAsync`) — always return null/no-op in unit tests
- Browser globals not available in Node (`localStorage`, `DOMParser`)
- `../config` when it reads env vars (`vi.mock('../config', () => ({ CLAUDE_KEY: '' }))`)

**What NOT to Mock:**
- The module under test itself
- Pure math/utility functions imported by the module under test
- JSON data files (`taxonomy-hierarchy.json`, `sp500-tag-classifications.json`) unless testing classification logic specifically

## Fixtures and Factories

**Inline fixture builders** — small helper functions inside test files:
```js
// peerMetrics.test.js
function makeFrameData(entries) {
  return { data: entries.map(e => ({ cik: e.cik, entityName: e.name || '', val: e.val })) };
}

// coverageMonitor.test.js
const makeFieldDetails = (fields) =>
  fields.map(f => ({
    field: f.field,
    label: FIELD_LABELS[f.field] || f.field.replace(/_/g, ' '),
    section: f.section || 'Income',
    tier: f.tier ?? (FIELD_TIERS[f.field] || 0),
    tag: f.tag || null,
    layer: f.layer ?? 1,
    derived: f.derived ?? false,
  }));
```

**DOM fixture helpers** — for `compensation.test.js` (uses `@vitest-environment jsdom`):
```js
function makeDoc(html) {
  return new DOMParser().parseFromString(html, 'text/html');
}
function makeCell(html) {
  const doc = makeDoc(`<table><tr>${html}</tr></table>`);
  return doc.querySelector('td') || doc.querySelector('th');
}
```

**Golden fixture JSON files:**
- `src/engines/__tests__/fixtures/morningstar/{TICKER}.json` — 50 tickers, annual Morningstar truth set
- `src/engines/__tests__/fixtures/morningstar-quarterly/{TICKER}.json` — 50 tickers, quarterly
- `src/engines/__tests__/fixtures/morningstar/field-mapping.json` — maps MS field names to engine field names
- `src/engines/__tests__/fixtures/edgar-cache/` — disk-cached SEC responses (gitignored, auto-populated on first run)

**Test exports pattern** — engines with private internal functions expose them via a named export at file bottom:
```js
// At bottom of compensation.js:
export const _testExports = {
  cellText, normalizeText, parseCompValue, parseYear,
  parseSummaryCompensationTable, parseDirectorCompensationTable,
  // ...25+ internal helpers
};

// In test:
const { _testExports } = await import('../compensation');
const { cellText, parseCompValue } = _testExports;
```

**Location:** All fixtures in `src/engines/__tests__/fixtures/`. No separate `test/` directory at project root.

## Coverage

**Requirements:** None enforced — no coverage thresholds configured.

**View Coverage:**
```bash
# Not configured — would need: vitest run --coverage
```

## Test Types

**Unit Tests:**
All tests in `src/engines/__tests__/` except `morningstarAccuracy.test.js`, `morningstarQuarterlyAccuracy.test.js`, and `diag-revequity.test.js`. Test individual functions in isolation with mocked dependencies.
- `edgarFinancials.test.js` (750 lines) — taxonomy structure, `computeDerivedFields`, provenance
- `splits.test.js` (110 lines) — `cumulativeSplitFactor` edge cases (non-calendar FY, same-year splits)
- `industryOverlays.test.js` (499 lines) — SIC classifier, bank/REIT/insurance overlay fields
- `coverageMonitor.test.js` (298 lines) — localStorage baseline storage and comparison logic
- `companyAdapter.test.js` (441 lines) — Layer 3 tag classification, orphan discovery
- `taxonomyResolver.test.js` (317 lines) — Layer 2 FASB hierarchy augmentation
- `peerMetrics.test.js` (308 lines) — Frames API period types, fallback tags, derived metrics
- `formatCompanyName.test.js` (181 lines) — company name normalization edge cases
- `compensation.test.js` (779 lines) — SEC proxy table parsing, all internal parsers

**Integration Tests (Morningstar Parity):**
- `morningstarAccuracy.test.js` (525 lines) — runs live XBRL engine against 50 Morningstar annual fixtures
- `morningstarQuarterlyAccuracy.test.js` (570 lines) — same for quarterly data
- Both intercept `globalThis.fetch` to rewrite Vite proxy URLs to direct SEC URLs and disk-cache responses
- Rate-limited to 100ms/request (10 req/sec) when fetching live SEC data

**Diagnostic Tests:**
- `diag-revequity.test.js` (373 lines) — deep-dive comparison for `revenues` and `equity` failures, outputs diff tables

**E2E Tests:** Not used.

## Common Patterns

**Taxonomy structure verification:**
```js
it('should have negate flag on change_in_receivables', () => {
  const field = CASHFLOW_TAXONOMY.find(f => f.field === 'change_in_receivables');
  expect(field).toBeDefined();
  expect(field.negate).toBe(true);
});
```

**Derived field computation (inject controlled data):**
```js
it('Fix 5: should derive SGA from selling + G&A when combined tag is null', () => {
  const years = [2024];
  const income = { 2024: { selling_expense: 25_000_000_000, general_and_admin_expense: 7_000_000_000 } };
  const balance = { 2024: {} };
  const cashFlow = { 2024: {} };
  computeDerivedFields(years, income, balance, cashFlow);
  expect(income[2024].sga).toBe(32_000_000_000);
});
```

**Null/missing field handling:**
```js
it('should handle missing fields gracefully (null, not NaN or errors)', () => {
  const peer = { cik: 100, ticker: 'TEST', netIncome: null, equity: null, assets: null };
  const metrics = computePeerMetrics([peer]);
  expect(metrics[0].roe).toBeNull();  // never NaN
});
```

**Async module test with configurable mock response:**
```js
it('fetchPeerFrameData should pass correct cyYear format based on period type', async () => {
  mockFrameResponses['Assets:USD:CY2023Q4I'] = makeFrameData([{ cik: 100, val: 5e9 }]);
  await fetchPeerFrameData([{ cik: 100 }], 2023);
  const call = fetchFrameCalls.find(c => c.tag === 'Assets');
  expect(call.cyYear).toBe('CY2023Q4I');
});
```

**Vitest environment directive** (for DOM-dependent tests):
```js
// @vitest-environment jsdom
// Must be first line of file
```
Only `compensation.test.js` uses this — it tests HTML table parsing logic requiring `DOMParser`.

---

*Testing analysis: 2026-03-24*
