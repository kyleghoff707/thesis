# Coding Conventions

**Analysis Date:** 2026-03-24

## Naming Patterns

**Files:**
- React components: PascalCase `.jsx` — `CompanyHeader.jsx`, `ValuationCalculators.jsx`
- Hooks: camelCase prefixed with `use` — `useFinancials.js`, `useCompanyEvents.js`
- Engines (pure logic): camelCase `.js` — `growthRates.js`, `edgarFinancials.js`, `returnMetrics.js`
- Data files: kebab-case `.json` / `.js` — `taxonomy-hierarchy.json`, `validationCompanies.js`
- Test files: mirror source with `.test.js` suffix — `edgarFinancials.test.js`

**Functions:**
- Exported engine functions: camelCase, prefixed with action verb — `computeGrowthRates`, `fetchCompanyFacts`, `extractAnnualFact`
- React components: PascalCase — `function CompanyHeader(...)`, `export default function Toolbox(...)`
- Local helpers within a file: camelCase, no export — `findClosest`, `makeFrameData`, `isIDBKey`
- Formatter functions: `fmt` prefix — `fmtNum`, `fmtDollar`, `fmtPct`, `fmtRange`

**Variables:**
- All camelCase — `companyFacts`, `edgarStatements`, `guruActivities`
- Boolean state: descriptive names — `loading`, `isDark`, `irLinkIsDirect`
- Constants (module-level, never reassigned): UPPER_SNAKE_CASE — `INCOME_TAXONOMY`, `PERIODS`, `IDB_PREFIXES`, `THRESHOLDS`
- Destructured loading/error pairs from hooks: suffix pattern — `finLoading`, `priceLoading`, `edgarError`

**Types / Data Shapes:**
- XBRL taxonomy entries: `{ field: 'snake_case', unit: 'USD', tags: [...], negate?: boolean }`
- Financial data fields: `snake_case` — `net_income_loss`, `cost_of_revenue`, `change_in_receivables`
- Report data: `camelCase` keys in JSON — `currentStage`, `stageApprovals`, `onePager`
- Theme palette: single-letter export `C` — always imported as `import { C } from '../theme'`

## Code Style

**Formatting:**
- No Prettier config detected — formatting is manual/editor-default
- Indentation: 2 spaces throughout
- Single quotes for strings; template literals for interpolation
- Semicolons present throughout
- Trailing commas in multi-line arrays/objects

**Linting:**
- ESLint 9 flat config at `eslint.config.js`
- Extends `js.configs.recommended` + `reactHooks` + `reactRefresh`
- Key rule: `no-unused-vars` errors, but vars matching `^[A-Z_]` are ignored (allows unused constants)
- ECMAScript 2020 target, `sourceType: module`

## Import Organization

**Order (as seen in `Toolbox.jsx`, `CompanyHeader.jsx`, `edgarFinancials.js`):**
1. React built-ins — `import { useState, useEffect, useMemo } from 'react'`
2. Third-party packages — `import { useParams } from 'react-router-dom'`
3. Internal theme — `import { C } from '../theme'`
4. Internal engines — `import { computeAllGrowthRates } from '../engines/growthRates'`
5. Internal hooks — `import { useFinancials } from '../hooks/useFinancials'`
6. Internal components — `import CompanyHeader from './CompanyHeader'`

No path aliases — all imports use relative paths (`../theme`, `../engines/edgar`, `./CompanyHeader`).

## Error Handling

**Async engine functions:**
- Use `try/catch` and return `null` on failure — callers check for null
- Failed fetches return `null`, not throw — `if (!res.ok) return null`
- Guard clauses at function entry: `if (!fgr || !eps || !futurePE) return null`

**React hooks:**
- Standard `{ data, loading, error }` pattern
- Cancellation via `let cancelled = false` flag in `useEffect` cleanup
  ```js
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchSomething().then(d => { if (!cancelled) setData(d); })
                    .catch(e => { if (!cancelled) setError(e.message); })
                    .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [dep]);
  ```

**localStorage:**
- Always wrapped in try/catch — `QuotaExceededError` triggers cache eviction and retry
- Silent failure with `console.warn` if still full after eviction

**Null/undefined handling:**
- Null coalescing used throughout: `company?.website`, `settings?.defaultPriceRange || '5y'`
- Display fallback: `score != null ? score : '--'` for missing metric values
- Formatter guard: `if (n == null || isNaN(n)) return '--'`

## Logging

**Framework:** Native `console` — no logging library

**Patterns:**
- `console.warn(...)` for non-fatal errors, degraded functionality, API failures — `console.warn('EDGAR submissions failed: ...')`
- `console.log(...)` sparingly for diagnostic milestones — `console.log('EDGAR statements AAPL [restated]: 12 years ...')`
- Never `console.error(...)` — errors are captured in state and displayed in UI or silently degraded
- Third-party 403s (e.g., Finnhub free tier) are suppressed to avoid console noise

## Comments

**Section Dividers:**
Engine files use box-drawing dividers to separate logical sections:
```js
// ─── XBRL Taxonomy Map ──────────────────────────────────────
// ─── Derived Fields ──────────────────────────────────────────
// ─── Public API ──────────────────────────────────────────────
```

**Inline comments:**
- Explain non-obvious data conventions: `// payables increase = cash source (already positive)`
- Reference bug numbers in fixes: `// Fix 3 (P1a): Debt tags + sanity check`
- Document XBRL-specific gotchas: `// ASC 606 (2018+)`, `// Q4I for balance sheet instant values`
- Short function-level docstrings for public functions: `// CAGR = (endValue / startValue)^(1/years) - 1`

**JSDoc:** Not used — plain comments only.

## Function Design

**Size:** Engine functions are focused single-purpose. Larger files (`edgarFinancials.js`, `compensation.js`) are organized into clearly separated sections using divider comments. Components inline helper functions near usage.

**Parameters:**
- Engines: positional for 1-2 params; destructured objects for 3+ — `computeMOS({ fgr, eps, futurePE, marr = 0.15, years = 10 })`
- Components: props destructured in signature — `function CompanyHeader({ company, latest, moatScore, managementScore, ruleOneScore })`

**Return Values:**
- Pure computation: return result object or `null` on invalid input
- Async fetches: return data object or `null` on failure (never throw to caller)
- Hooks: always return named object `{ data, loading, error }` or domain-specific equivalent

## Module Design

**Exports:**
- Engines: named exports for all public functions — `export function computeGrowthRates(...)`
- Components: single `export default function ComponentName(...)` per file
- Hooks: single named export per file — `export function useFinancials(...)`
- Constants: named exports for shared data — `export const PERIODS = [10, 7, 5, 3, 1]`
- Test-only exports: collected under `export const _testExports = { ... }` at file bottom

**Barrel Files:** Not used — components, hooks, and engines are imported directly by file path.

**Internal-Only Functions:**
Functions not exported remain in module scope as plain `function name(...)`. Prefixing with `_` is not used — non-export alone signals internal scope.

## Theme Usage

All styled components read colors from the mutable `C` palette object:
```js
import { C } from '../theme';
// then use directly in inline styles:
style={{ background: C.bgCard, color: C.text, border: `1px solid ${C.border}` }}
```
Never hardcode hex values in components — always reference `C.{token}`. `applyTheme(isDark)` mutates `C` in-place so all components re-render with new values when theme changes.

---

*Convention analysis: 2026-03-24*
