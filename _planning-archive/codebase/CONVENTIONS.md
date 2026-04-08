# Coding Conventions

**Analysis Date:** 2026-03-25

## Naming Patterns

**Files:**
- React components: `PascalCase.jsx` — `CompanyHeader.jsx`, `ValuationCalculators.jsx`, `OnePager.jsx`
- Hooks: `camelCase.js` with `use` prefix — `useFinancials.js`, `useCompanyEvents.js`, `useResearch.js`
- Engine/logic files: `camelCase.js` — `edgarFinancials.js`, `growthRates.js`, `cache.js`, `industryOverlays.js`
- Test files: mirror source name with `.test.js` suffix — `edgarFinancials.test.js`, `splits.test.js`, `industryOverlays.test.js`
- Data files: `kebab-case.json` — `taxonomy-hierarchy.json`, `sp500-tag-classifications.json`
- Validation scripts: lowercase descriptive names — `coverage-audit.js`, `build-taxonomy-json.js`

**Functions and exports:**
- Public engine functions: camelCase verb + noun — `fetchEdgarStatements()`, `computeDerivedFields()`, `extractSection()`, `cacheGetAsync()`
- Helper functions: camelCase, no prefix — `buildStatements()`, `applySplitAdjustment()`, `isIDBKey()`, `getQuarterlyInstant()`
- Formatter functions: `fmt` prefix — `fmtNum()`, `fmtDollar()`, `fmtPct()`, `fmtRange()`
- React components: PascalCase — `function CompanyHeader(...)`, `export default function Toolbox(...)`
- Local constants/helpers within files: camelCase — `allYears`, `fieldData`, `tagUsed`, `merged`

**Variables and state:**
- Boolean state: descriptive `is`/`has` prefixes or plain — `loading`, `isDark`, `irLinkIsDirect`, `cancelled`, `found`, `anyFound`
- Destructured hook results: suffix pattern — `finLoading`, `priceLoading`, `edgarError`, `thresholds`
- Cache prefixes: kebab-case descriptive — `edgar:facts:`, `edgar-statements:`, `guru-filing:`, `nport-filing:`
- XBRL field names: `snake_case` — `net_income_loss`, `cost_of_revenue`, `operating_income_loss`, `change_in_receivables`, `long_term_debt`
- Financial data keys: `snake_case` throughout all taxonomies
- Report data in localStorage/UI: `camelCase` keys — `currentStage`, `stageApprovals`, `onePager`, `pitchDeck`, `fullStory`
- Theme palette: single-letter export `C` — always imported as `import { C } from '../theme'` and used `C.bgCard`, `C.text`, `C.border`

**XBRL Taxonomy conventions:**
- Field definition objects: `{ field: 'snake_case', unit: 'USD' | 'USD/shares' | 'shares', tags: [...], negate?: boolean, splitSensitive?: boolean }`
- Tags: exact XBRL tag names in PascalCase — `RevenueFromContractWithCustomerExcludingAssessedTax`, `OperatingIncomeLoss`
- Tag order: most common/reliable tags first — fallback chain ensures first match wins per year, later tags fill gaps
- Negate flag: `negate: true` inverts sign during extraction — used for working capital items (`change_in_receivables`, `change_in_inventory`, `other_noncash_items`)
- Unit values: always one of `'USD'` (balance sheet dollar values), `'USD/shares'` (per-share), `'shares'` (share counts)
- Tier annotations: scoring-critical (Tier 1), display (Tier 2), expanded detail (Tier 3) — used in coverage audits and UI toggles
- Layer annotations: `_layer2Start` marks where Layer 2 (taxonomy-augmented) tags begin in tag array

## Code Style

**Formatting:**
- Indentation: 2 spaces throughout
- Single quotes for strings; template literals for interpolation: `` `value: ${x}` ``
- Semicolons: present on all statements
- Trailing commas: in multi-line arrays/objects for git diffs
- No Prettier config — formatting is manual/editor-default but consistent
- Max line length: 100 columns typical, up to 120 for complex logic

**Linting:**
- ESLint 9 flat config at `eslint.config.js`
- Extends: `js.configs.recommended`, `reactHooks.configs.flat.recommended`, `reactRefresh.configs.vite`
- Language target: ECMAScript 2020, `sourceType: module`, JSX enabled
- Key rule: `no-unused-vars` with varsIgnorePattern `^[A-Z_]` — allows unused constants like `TAXONOMY`, `TTL`, `IDB_PREFIXES` (module-level constants in UPPER_SNAKE_CASE)
- No `console.error()` — errors are captured in state; use `console.warn()` for non-fatal issues

## Import Organization

**Order:** External imports → internal engines/hooks → React/components → styles/theme

```javascript
// External packages first
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as cheerio from 'cheerio';
import { writeFileSync, existsSync } from 'fs';

// Internal engines and utilities
import { lookupCIK, fetchCompanyFacts } from './edgar';
import { cacheGetAsync, cacheSet } from './cache';
import { fetchSplits } from './splits';

// Import taxonomies and derived functions
const { INCOME_TAXONOMY, BALANCE_TAXONOMY, computeDerivedFields } = await import('../edgarFinancials');

// React and components
import React from 'react';
import { C } from '../theme';

// Hooks
import { useFinancials } from '../hooks/useFinancials';
```

**Path aliases:** None currently used; relative paths via `../` are standard throughout.

**Re-exports:** Engines define specific public functions via `export function name() {}` for clarity. Avoid `export *` in favor of explicit imports. Test-only exports grouped in `export const _testExports = { function1, function2 }` at file bottom.

## Error Handling

**Pattern:** Try/catch with null returns — no exceptions thrown to callers

```javascript
export async function fetchEdgarStatements(ticker, options = {}) {
  try {
    const cik = await lookupCIK(ticker);
    if (!cik) return null;  // Guard clause for missing data

    const facts = await fetchCompanyFacts(cik);
    if (!facts) return null; // Graceful null return on API failure

    // Process data...
    return { years, income, balance, cashFlow, provenance };
  } catch (err) {
    console.warn(`EDGAR statements failed: ${err.message}`);
    return null;
  }
}
```

**Key patterns:**
- All async APIs return `null` on failure, not throw — callers check `if (!data) return`
- Guard clauses at function entry: `if (!fgr || !eps) return null;`
- Failed fetches: check `if (!res.ok)` and return `null` (never throw), log with `console.warn()`
- Try/catch wraps external API calls — catch logs warning and returns `null`
- Cache failures are silent — engines fall back to network without surfacing errors to UI
- Memory cache misses are silent — memory tier is just performance optimization
- IndexedDB quota exceeded: `QuotaExceededError` triggers cache eviction + retry; silent if full after eviction with `console.warn()`
- EDGAR 404s (missing filings): return `null` gracefully; components show "no data" states
- Cancellation via `let cancelled = false` + cleanup `return () => { cancelled = true }` in `useEffect`

**Display fallback:** For missing numeric values, use null coalescing: `score != null ? score : '--'`

**Null propagation:** Use optional chaining throughout: `company?.website`, `settings?.defaultPriceRange || 'default'`, `facts?.facts?.['us-gaap']?.[tag]`

## Logging

**Use `console.warn()` for:**
- Non-fatal errors that degrade functionality: `console.warn('EDGAR submissions failed: ${res.status} for CIK ${cik}')`
- API failures that have fallbacks: `console.warn('EDGAR filings fetch failed: ${res.status}')`
- Cache issues: `console.warn('Cache migration: moved X entries from localStorage to IndexedDB')`

**Use `console.log()` sparingly for:**
- Diagnostic milestones in long-running scripts: `console.log('EDGAR statements AAPL [restated]: 12 years extracted')`
- Validation script progress: `console.log('Layer 3 classifications loaded: ${Object.keys(l3Classifications).length} tags')`

**Never use `console.error()`** — errors are captured in state (`error` property on hook returns) and displayed in UI or silently degraded

**Third-party 403s suppressed:** Financial data APIs (Finnhub free tier 403s, GuruFocus rate limits) have quiet failures to avoid console noise

## Comments

**Document non-obvious data conventions:**
```javascript
// payables increase = cash source (already positive in XBRL cash flow convention)
{ field: 'change_in_payables', unit: 'USD', tags: [...] },

// Per-share values (USD/shares) are divided by cumulative split factor;
// share counts are multiplied. This normalizes historical data to current basis.

// ASC 606 (2018+) — revenue recognition standard; most modern companies use
// RevenueFromContractWithCustomerExcludingAssessedTax. Earlier filings use Revenues.
```

**Reference bug numbers in fixes:**
```javascript
// Fix 3 (P1a): Debt tags + sanity check
if (bal.liabilities != null && bal.liabilities > 0
  && totalDebtComponents / bal.liabilities < 0.05
  && inc.interest_expense != null && inc.interest_expense > 0)
  return 'liabilities - known_non_debt_items (sanity check fallback)';
```

**Document XBRL-specific gotchas:**
```javascript
// Q4I for balance sheet instant values — the EDGAR Frames API uses
// CY{year}Q4I.json for balance sheet tags (instant period), not CY{year}.json

// SEC XBRL allows restatements: restated (latest filing) vs original (as filed).
// Split-sensitive fields use extractAnnualFactOriginal to ensure consistent adjustment.
```

**Taxonomy docstrings:** Each taxonomy section (INCOME_TAXONOMY, BALANCE_TAXONOMY, CASHFLOW_TAXONOMY) has a preamble explaining:
```javascript
// ─── XBRL Taxonomy Map ──────────────────────────────────────
// Each field: { tags: [...fallback order], unit: 'USD' | 'USD/shares' | 'shares' }
// Tags ordered by prevalence — most common first. First tag's value wins
// per year, but later tags fill in gaps (handles ASC 606 transition, etc.)
```

## Function Design

**Engines (pure async functions):**
- Positional arguments for 1-2 params
- Destructured objects for 3+ params: `computeMOS({ fgr, eps, futurePE, marr = 0.15, years = 10 })`
- Always return data object or `null` on invalid input — never throw
- Document return shape in JSDoc if complex: `{ data, provenance }`, `{ income, balance, cashFlow, provenance, quarter }`

**Components:**
- Props destructured in signature: `function CompanyHeader({ company, latest, moatScore, managementScore, ruleOneScore })`
- Single responsibility — pass computed data as props, no direct engine calls (except in top-level Toolbox)
- Inline styles with theme palette `C`

**Hooks:**
- Always return named object with consistent shape: `{ data, loading, error }` or domain-specific equivalent
- Use `useState` + `useEffect` pattern; cancellation via flag for async operations
- Memoize expensive computations with `useMemo` to prevent child re-renders

**Validation functions:**
- Guard clauses at entry for invalid inputs: `if (!companyFacts || !companyFacts.facts) return { ... }`
- Return validation result object: `{ isValid: boolean, issues: string[], warnings: string[] }`

**Helper/pure math functions:**
- Accept positional arguments for readability
- No side effects — return new data, don't mutate inputs
- Calculate and return result; let caller handle persistence

## Module Design

**Engines (`src/engines/*.js`):**
- Named exports for all public functions — `export function computeGrowthRates(...)`
- Constants at top level in UPPER_SNAKE_CASE — `export const PERIODS = [10, 7, 5, 3, 1]`
- Taxonomy definitions as module-level `const` — `const INCOME_TAXONOMY = [...]`
- Layer 2/3 augmentation: kept in separate modules (`taxonomyResolver.js`, `companyAdapter.js`, `industryOverlays.js`) to allow independent enable/disable
- Cache integration: each engine handles its own cache keys, TTL category, and fallback to network

**Hooks (`src/hooks/*.js`):**
- Single named export per file: `export function useFinancials(...)`
- Return object shape consistent across hooks: `{ data, loading, error }`
- All side-free; hooks manage state/effects, engines do the work

**Components (`src/components/*.jsx`):**
- Single `export default function ComponentName(...) {}` per file
- Props are typed in JSDoc when possible (no TypeScript, but document shape in comments)
- No `useState` for data fetching — use hooks instead
- Styling: inline only, no CSS files — `style={{ color: C.text, background: C.bgCard }}`

**Barrel files:** Not used in this codebase — all imports are explicit file paths

**Test organization:** Tests live alongside source in `__tests__/` directory — `src/engines/__tests__/edgarFinancials.test.js` mirrors `src/engines/edgarFinancials.js`

## Derived Fields and Provenance

**Derived field computation:**
- Defined in `getDerivedFormula()` function — returns human-readable formula string or `null`
- Computed in `computeDerivedFields()` after extraction — ~40 derived fields across all sections
- Every derived value carries parallel metadata: formula, derived flag, layer info
- Formulas use plain language with operators: `'revenues - cost_of_revenue'`, `'operating_income_loss + |restructuring_charges|'`, `'(income_tax / income_before_tax) × 100'`
- Negate markers in formulas shown with pipes: `|value|` indicates absolute value or negation applied

**Provenance tracking:**
- Every extracted value: `{ tag: 'TagName', layer: 1 | 2 | 3, derived: false, confidence: null, formula: null }`
- Every derived value: `{ tag: null, layer: 1, derived: true, confidence: null, formula: 'formula_string' }`
- Layer 3 AI classifications include confidence scores (0.0-1.0); values <0.8 marked "inferred"
- Annual AND TTM provenance tracked separately: `provenance[year][field]` and TTM provenance object with quarterly equivalents
- Provenance structure: `{ income: { field: { tag, layer, derived, formula } }, balance: {...}, cashFlow: {...} }`

---

*Conventions analysis: 2026-03-25*
