# Testing Patterns

**Analysis Date:** 2026-03-25

## Test Framework

**Runner:**
- Vitest 4.1.0 — test runner for `npm test` / `npm run test:watch`
- Default config (no `vitest.config.js` — uses Vite + ESM defaults)
- Environment: jsdom 29.0.1 for DOM tests, Node.js for engine tests

**Assertion Library:**
- Vitest built-in: `describe()`, `it()` (alias `test()`), `expect()`, `beforeEach()`, `afterEach()`
- Matchers: `.toBe()`, `.toEqual()`, `.toContain()`, `.toHaveLength()`, `.toBeDefined()`, `.toBeCloseTo()`, `.not`, etc.

**Mocking:**
- `vi.mock()` — mock entire modules with vi.fn() replacements
- `vi.fn()` — create mock functions with `.mockImplementation()`, `.mockReset()`, `.mockReturnValue()`
- Pattern: mock external dependencies at top of test file so engine logic runs in isolation

**Run Commands:**
```bash
npm test              # Run all tests once (vitest run)
npm run test:watch   # Watch mode — re-run on file changes (vitest)
```

## Test File Organization

**Location:**
- Tests live alongside source in `__tests__/` directory
- Structure: `src/engines/__tests__/edgarFinancials.test.js` mirrors `src/engines/edgarFinancials.js`
- Agent tests: `agents/__tests__/`
- Schema tests: `src/schemas/__tests__/`
- Component tests: `src/components/__tests__/`

**Naming:**
- Test files: `{module}.test.js` — `edgarFinancials.test.js`, `splits.test.js`, `industryOverlays.test.js`
- Test suites: descriptive strings — `'Fix 2 (P1b): Cash tag — restricted cash included'`
- Test cases: specific assertions — `'should have CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents in cash tags'`

## Test Structure

**Suite organization:**
```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock external dependencies
vi.mock('../edgar', () => ({
  lookupCIK: vi.fn(),
  fetchCompanyFacts: vi.fn(),
}));

// Import module under test
const { computeDerivedFields, INCOME_TAXONOMY } = await import('../edgarFinancials');

describe('Feature/Fix name', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should do specific thing', () => {
    // Arrange: set up data
    const years = [2024];
    const income = { 2024: { revenues: 100 } };

    // Act: call function
    computeDerivedFields(years, income, {}, {});

    // Assert: verify result
    expect(income[2024].gross_profit).toBe(null); // not derived without cost_of_revenue
  });
});
```

**Patterns:**
- Setup: `beforeEach()` block for mock reset, shared data initialization
- Teardown: none typically needed (mocks auto-reset)
- Arrange-Act-Assert: three-phase test structure
- Async tests: use `async/await` with `vi.fn()` mocks for Promise handling

## Mocking

**Framework:**
- Vitest `vi` object — mocking API is vi.mock, vi.fn, vi.spyOn
- No external mocking library (jest-compatible API is built-in)

**Patterns:**
```javascript
// Mock an entire module — replaces all exports
vi.mock('../edgar', () => ({
  lookupCIK: vi.fn(),
  fetchCompanyFacts: vi.fn(),
  extractAnnualFact: vi.fn(),
}));

// Mock individual functions in implementation
vi.fn().mockImplementation((input) => {
  if (input === 'special') return { special: true };
  return null;
});

// Reset mocks between tests
beforeEach(() => {
  vi.clearAllMocks();
  // or per-function: lookupCIK.mockReset();
});
```

**What to Mock:**
- External network APIs: `fetch()`, HTTP clients
- External file system: `readFileSync()`, `writeFileSync()`
- Cache storage: `cacheGet()`, `cacheGetAsync()`, `cacheSet()` — return null to test cache misses
- Database/IndexedDB: `idbGet()`, `idbSet()` — mock to control timing, test offline scenarios
- Complex dependencies with side effects: rarely needed; prefer integration testing for most engines

**What NOT to Mock:**
- The engine under test — run the real function
- Pure math functions — no mocking, deterministic
- XBRL taxonomy definitions (INCOME_TAXONOMY, etc.) — load the real module
- Derived field computation logic — test the real output
- Internal helper functions within a module — test via public API

## Fixtures and Factories

**Test Data (inline):**
```javascript
it('Fix 3: debt sanity check', () => {
  const years = [2024];
  const income = { 2024: { interest_expense: 1500000000 } };
  const balance = { 2024: {
    liabilities: 50000000000,
    short_term_debt: 100000000,
    long_term_debt: 200000000,
    accounts_payable: 2000000000,
    // ... all fields hardcoded
  }};

  computeDerivedFields(years, income, balance, {});

  expect(balance[2024].total_debt).toBe(34200000000);
});
```

**Pattern:** Test data is inline and hardcoded (not in separate fixture files). Numeric values use realistic numbers with comments explaining meaning:
```javascript
const balance = { 2024: {
  liabilities: 50000000000,      // $50B total liabilities
  short_term_debt: 100000000,    // $100M
  interest_expense: 1500000000,  // $1.5B
}};
```

**Location:** Test data lives in test files, no factories or builders. Data is specific to each test case.

## Coverage

**Requirements:**
- No coverage enforcement in project config
- Manual review: engine tests cover major code paths (see below)
- PR practice: new features include tests demonstrating functionality

**View Coverage:**
```bash
# Generate coverage report (if configured)
npm test -- --coverage
```

No coverage report is currently enabled; vitest runs tests but doesn't produce coverage output.

## Test Types

**Unit Tests (primary):**
- **Scope:** Single engine function + its inputs, no external APIs
- **Approach:** Mock external dependencies, test computation logic
- **Examples:**
  - `edgarFinancials.test.js` — computeDerivedFields, extractSection, buildStatements
  - `splits.test.js` — cumulativeSplitFactor with various fiscal year scenarios
  - `industryOverlays.test.js` — industry classifier detection, overlay application

**Integration Tests (secondary):**
- **Scope:** Multiple engines working together
- **Approach:** Use real API mocks where needed; focus on data flow
- **Examples:**
  - `peerMetrics.test.js` — peer discovery + metrics extraction + score computation
  - Quarterly financial extraction testing span income/balance/cashflow coordination

**E2E Tests:**
- **Framework:** Not currently implemented
- **Status:** Manual QA only — app launched via `npm run tauri:dev` for dev testing

## Common Patterns

**Async Testing:**
```javascript
it('should fetch and cache data', async () => {
  const cacheGetAsync = vi.fn(async () => null); // cache miss
  const fetchCompanyFacts = vi.fn(async () => ({ facts: {...} }));

  const result = await fetchEdgarStatements('AAPL');

  expect(fetchCompanyFacts).toHaveBeenCalledWith('1018724');
  expect(result).toBeDefined();
});
```

**Error Testing (null returns, not exceptions):**
```javascript
it('should return null when CIK lookup fails', async () => {
  lookupCIK.mockResolvedValue(null);

  const result = await fetchEdgarStatements('INVALID');

  expect(result).toBe(null);
});

it('should return null when facts fetch fails', async () => {
  lookupCIK.mockResolvedValue('1018724');
  fetchCompanyFacts.mockRejectedValue(new Error('Network error'));

  const result = await fetchEdgarStatements('AAPL');

  expect(result).toBe(null);
});
```

**Guard Clause Testing:**
```javascript
it('should return null for missing EPS', () => {
  const result = computeMOS({ fgr: 0.12, eps: null, futurePE: 20 });
  expect(result).toBe(null);
});

it('should return null for invalid FGR (<=0)', () => {
  const result = computeMOS({ fgr: 0, eps: 5, futurePE: 20 });
  expect(result).toBe(null);
});
```

**Data Transformation Testing:**
```javascript
it('should negate working capital components correctly', () => {
  const years = [2024];
  const cashFlow = { 2024: {
    change_in_receivables: -500,  // already negated by extractSection
    change_in_inventory: -200,
    change_in_payables: 300,      // NOT negated
  }};

  computeDerivedFields(years, {}, {}, cashFlow);

  // -500 + -200 + 300 + 0 = -400
  expect(cashFlow[2024].change_in_working_capital).toBe(-400);
});
```

## Test Coverage by Module

**Well-tested:**
- `edgarFinancials.js` — 173 tests via `edgarFinancials.test.js`, `taxonomyResolver.test.js`, `companyAdapter.test.js`, `industryOverlays.test.js`
  - Derived field computation (gross profit, EBIT, debt fallback, SGA sum)
  - Negate flags on working capital components
  - Tax rate calculation, operating income derivation
  - Industry overlay application (bank NII, REIT FFO, insurance loss ratio)
  - Layer 1 tag expansion testing

- `splits.test.js` — Cumululative split factor, fiscal year-aware date comparison, Yahoo split parsing

- `industryOverlays.test.js` — SIC classification detection, bank/REIT/insurance field addition

- `peerMetrics.test.js` — Peer metrics computation, completeness scoring, multi-year averaging

- `taxonomyResolver.test.js` — Layer 2 taxonomy augmentation from FASB calc linkbase

- `companyAdapter.test.js` — Layer 3 AI classification, orphan tag discovery

**Partially tested:**
- `edgar.js` — CIK lookup, ticker search (mocked API calls)
- `cache.js` — Memory/localStorage tier (mocked IndexedDB)
- `compensation.js` — Executive compensation extraction
- `gurus.js` — Guru holdings and filing parsing

**Not tested:**
- React components (no Jest/React Testing Library setup)
- Hooks (integration tests only)
- UI rendering, event handling, state management
- CLI/validation scripts (manual script execution)
- Tauri native integration

## Validation Scripts

**Purpose:** External verification of XBRL coverage, tag accuracy, taxonomy completeness

**Scripts in `validation/scripts/`:**
- `coverage-audit.js` — Measures XBRL tag mapping coverage across S&P 500, produces detailed report
- `build-taxonomy-json.js` — Builds Layer 2 taxonomy hierarchy from FASB calc linkbase XML
- `build-tag-classifications.js` — Pre-classifies tags for Layer 3 using Claude API (S&P 500 only)

**Running validation:**
```bash
# Full coverage audit (60-90 minutes, S&P 500)
node validation/scripts/coverage-audit.js

# Build Layer 2 taxonomy data
node validation/scripts/build-taxonomy-json.js

# Build Layer 3 AI classifications
node validation/scripts/build-tag-classifications.js
```

**Output:**
- Reports: `validation/reports/*.md` (coverage audit report, detailed findings)
- Data: `src/data/taxonomy-hierarchy.json` (Layer 2), `src/data/sp500-tag-classifications.json` (Layer 3)
- Checkpoints: `validation/reports/coverage-audit-checkpoint.json` (resume on interrupt)

## Known Testing Gaps

**Component testing:** No tests for React components (OnePager, PitchDeck, Toolbox, etc.). Would require:
- React Testing Library or similar
- Mock data providers (usePrices, useFinancials, etc.)
- jsdom environment configuration in vitest

**Hook integration:** useFinancials, useCompanyEvents tested indirectly via component screenshots; no unit tests for hook state management

**End-to-end:** No Playwright/Cypress tests for full workflows. Manual QA only via `npm run tauri:dev`.

**API mocking:** No mock server setup (e.g., MSW); all API mocking is inline with `vi.mock()` and `vi.fn()`

**Performance testing:** No performance/load testing. Coverage audit scripts measure data accuracy, not speed.

---

*Testing analysis: 2026-03-25*
