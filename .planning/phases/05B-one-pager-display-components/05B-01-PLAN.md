---
phase: 05B-one-pager-display-components
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - vite.config.js
  - src/hooks/useOnePager.js
  - src/components/VerdictBadge.jsx
  - src/components/ConfidenceBadge.jsx
  - src/components/__tests__/verdictBadge.test.js
  - src/components/__tests__/sectionRenderer.test.js
  - src/components/__tests__/onePager.test.js
  - src/components/__tests__/generationProgress.test.js
autonomous: true
requirements: [ONEP-02, ONEP-03, ONEP-05]
must_haves:
  truths:
    - "Browser can fetch One Pager JSON from .thes1s/reports/ via Vite middleware"
    - "Browser can fetch progress JSON from .thes1s/reports/ via Vite middleware"
    - "Browser can list available report tickers via Vite middleware"
    - "VerdictBadge renders PASS as green pill, FAIL as red pill, WATCHLIST as amber pill, REVIEW as teal pill"
    - "ConfidenceBadge renders HIGH/MEDIUM/LOW with distinct visual treatments"
    - "useOnePager hook returns report data, progress state, loading flag, and error"
    - "Test scaffolds exist for all 4 component test files with passing data-transform tests"
  artifacts:
    - path: "vite.config.js"
      provides: "thes1sReportsPlugin middleware serving /api/thes1s/reports/* endpoints"
      contains: "thes1s-reports"
    - path: "src/hooks/useOnePager.js"
      provides: "Hook bridging file-system reports to React state with progress polling"
      exports: ["useOnePager"]
    - path: "src/components/VerdictBadge.jsx"
      provides: "Colored pill badge for PASS/FAIL/WATCHLIST/REVIEW verdicts"
      exports: ["default", "_testExports"]
    - path: "src/components/ConfidenceBadge.jsx"
      provides: "Secondary badge for HIGH/MEDIUM/LOW confidence indicators"
      exports: ["default"]
    - path: "src/components/__tests__/verdictBadge.test.js"
      provides: "Unit tests for verdict-to-color mapping"
    - path: "src/components/__tests__/sectionRenderer.test.js"
      provides: "Unit tests for camelToTitle and data formatting helpers"
    - path: "src/components/__tests__/onePager.test.js"
      provides: "Unit tests for formatTitle, formatRelativeTime, stateToLabel helpers"
    - path: "src/components/__tests__/generationProgress.test.js"
      provides: "Unit tests for progress state to section status mapping"
  key_links:
    - from: "src/hooks/useOnePager.js"
      to: "/api/thes1s/reports"
      via: "fetch calls to Vite middleware"
      pattern: "fetch.*api/thes1s/reports"
    - from: "vite.config.js"
      to: ".thes1s/reports/"
      via: "fs.readFileSync reading report JSON files"
      pattern: "readFileSync.*thes1s.*reports"
---

<objective>
Build the data bridge, foundational UI atoms, and test scaffolds for One Pager display.

Purpose: The browser cannot read files from `.thes1s/reports/` directly. This plan creates the Vite middleware that serves report JSON to the browser, the React hook that consumes it with progress polling, and the badge components (VerdictBadge, ConfidenceBadge) that every section and the page header will use. It also creates all 4 test scaffold files (Wave 0) that downstream plans wire into their verify commands. These are the building blocks for Plans 02 and 03.

Output: Vite middleware plugin, useOnePager hook, VerdictBadge.jsx, ConfidenceBadge.jsx, 4 test files
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/05B-one-pager-display-components/05B-CONTEXT.md
@.planning/phases/05B-one-pager-display-components/05B-RESEARCH.md

@src/theme.js
@src/hooks/useResearch.js
@src/components/CompanyHeader.jsx
@vite.config.js
@.thes1s/reports/COST/one-pager.json

<interfaces>
<!-- Key types and contracts the executor needs -->

From src/schemas/progress.js:
```javascript
// ProgressSchema fields executor needs to understand:
// state: 'IDLE' | 'DATA_ASSEMBLY' | 'PRIMARY_SOURCE_READING' | 'WAVE_1_RUNNING' | 'CHECKPOINT_1' | 'WAVE_2_RUNNING' | ... | 'COMPLETE'
// sections: Record<string, { status: 'complete' | 'running' | 'pending' | 'failed', agentRole?: string, tokenCost?: {...}, error?: string }>
```

From src/theme.js:
```javascript
export const C = { ...C_LIGHT };
// Key colors: C.green (#16a34a/#4ade80), C.red (#dc2626/#f87171), C.yellow (#ca8a04/#fbbf24), C.accent (#0f766e/#2dd4bf)
// Backgrounds: C.greenBg, C.yellowBg, C.redBg, C.accentLight
// Badge: C.badge (#f1f5f9/#334155), C.badgeText (#64748b/#94a3b8)
// Score badges: C.scoreBgGreen, C.scoreBgYellow, C.scoreBgRed
```

From .thes1s/reports/COST/one-pager.json:
```javascript
// Top-level report structure:
// { ticker, companyName, stage, generatedAt, sections: [...], overallVerdict, sectionKeys }
// Section verdict values: "PASS" | "FAIL" | "WATCHLIST" | null
// Section confidence values: "HIGH" | "MEDIUM" | "LOW"
```

From vite.config.js:
```javascript
// Existing plugin registration pattern:
// plugins: [react(), yahooSummaryPlugin(), finvizPlugin(), gurufocusPlugin(), yahooQuotesPlugin(), irEventsPlugin()],
// New plugin appends to this array
```

Existing test pattern (from src/engines/__tests__/edgarFinancials.test.js):
```javascript
// Tests use vitest: import { describe, it, expect } from 'vitest'
// Pure function tests — no DOM, no React rendering
// _testExports pattern: components export { _testExports } for test-only access to internals
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 0: Create test scaffolds for all 4 component test files (Wave 0)</name>
  <files>src/components/__tests__/verdictBadge.test.js, src/components/__tests__/sectionRenderer.test.js, src/components/__tests__/onePager.test.js, src/components/__tests__/generationProgress.test.js</files>
  <read_first>
    - src/engines/__tests__/edgarFinancials.test.js (vitest test pattern, _testExports usage)
    - src/theme.js (C palette values needed for badge color assertions)
    - .thes1s/reports/COST/one-pager.json (real section data for test fixtures)
    - src/schemas/progress.js (progress state enum values for test fixtures)
  </read_first>
  <action>
    Create the `src/components/__tests__/` directory and all 4 test files. These are pure data-transformation tests (no React rendering, no @testing-library/react). They test exported helper functions and mappings via the `_testExports` convention.

    **src/components/__tests__/verdictBadge.test.js — ONEP-03 coverage:**

    Tests the verdict-to-color mapping logic exported from VerdictBadge.jsx via `_testExports.getVerdictStyle`.

    ```javascript
    import { describe, it, expect } from 'vitest';
    // Note: import will be wired after Task 2 creates VerdictBadge.jsx
    // For now, write tests that will import from '../VerdictBadge.jsx'
    ```

    Test cases:
    - `getVerdictStyle('PASS')` returns object with bg containing green (#16a34a or #4ade80)
    - `getVerdictStyle('FAIL')` returns object with bg containing red (#dc2626 or #f87171)
    - `getVerdictStyle('WATCHLIST')` returns object with bg containing yellow (#ca8a04 or #fbbf24)
    - `getVerdictStyle('REVIEW')` returns object with bg containing teal (#0f766e or #2dd4bf)
    - `getVerdictStyle(null)` returns null
    - `getVerdictStyle(undefined)` returns null
    - `getVerdictStyle('INVALID')` returns null
    - All 4 valid verdicts return `text: '#fff'`

    **src/components/__tests__/sectionRenderer.test.js — ONEP-04 coverage:**

    Tests the `camelToTitle` helper and data formatting logic exported from SectionRenderer.jsx via `_testExports.camelToTitle` and `_testExports.formatDataValue`.

    Test cases for camelToTitle:
    - `'mosBuyPrice'` -> `'MOS Buy Price'`
    - `'pbtBuyPrice'` -> `'PBT Buy Price'`
    - `'currentPrice'` -> `'Current Price'`
    - `'preliminaryFGR'` -> `'Preliminary FGR'`
    - `'tenCapPrice'` -> `'Ten Cap Price'`
    - `'priceVsBuyRange'` -> `'Price Vs Buy Range'`
    - `'convergence'` -> `'Convergence'`

    Test cases for formatDataValue:
    - `formatDataValue('mosBuyPrice', { low: 135.04, high: 177.16 })` returns a string containing both dollar amounts
    - `formatDataValue('currentPrice', 972.33)` returns a dollar-formatted string
    - `formatDataValue('preliminaryFGR', { low: 0.09, high: 0.12 })` returns a percentage-formatted string
    - `formatDataValue('convergence', 'All 4 methods...')` returns the string as-is
    - `formatDataValue('someField', null)` returns '--' or empty string

    **src/components/__tests__/onePager.test.js — ONEP-02 coverage:**

    Tests the pure helper functions exported from OnePager.jsx via `_testExports.formatTitle`, `_testExports.formatRelativeTime`, `_testExports.stateToLabel`.

    Test cases for formatTitle:
    - `'COSTCO WHOLESALE CORP /NEW'` -> `'Costco Wholesale Corp'`
    - `'APPLE INC'` -> `'Apple Inc'`
    - `'BERKSHIRE HATHAWAY INC /DE'` -> `'Berkshire Hathaway Inc'`
    - `'MICROSOFT CORP /OLD'` -> `'Microsoft Corp'`

    Test cases for stateToLabel:
    - `'IDLE'` -> `'Preparing...'`
    - `'DATA_ASSEMBLY'` -> `'Assembling data...'`
    - `'WAVE_1_RUNNING'` -> `'Generating sections...'`
    - `'SYNTHESIS'` -> `'Writing synthesis...'`
    - `'QUALITY_CHECK'` -> `'Quality check...'`
    - `'COMPLETE'` -> `'Complete'`
    - `'UNKNOWN_STATE'` -> some reasonable fallback (not crash)

    **src/components/__tests__/generationProgress.test.js — ONEP-05 coverage:**

    Tests the progress-state-to-section-status mapping. This file imports a pure function `computeSectionStatuses(progress)` that will be exported from OnePager.jsx via `_testExports.computeSectionStatuses`.

    Test cases:
    - Given progress with 2 complete, 1 running, 3 pending sections -> returns object mapping each key to its display state
    - Given progress with all sections complete -> returns all 'complete'
    - Given null progress -> returns empty object or null
    - Given progress with a failed section -> that section maps to 'failed' status
    - Percentage computation: 2 complete out of 6 total -> ~33%

    **Important implementation notes:**
    - All 4 files use `import { describe, it, expect } from 'vitest'`
    - Import paths use relative imports: `import { _testExports } from '../VerdictBadge.jsx'`
    - Since the component files don't exist yet (created in Tasks 1-2 and Plan 02/03), the tests will fail on first run -- this is expected (Red phase). They become Green when the components are built with the `_testExports` convention.
    - Do NOT install @testing-library/react. These are pure function tests.
  </action>
  <verify>
    <automated>ls src/components/__tests__/verdictBadge.test.js src/components/__tests__/sectionRenderer.test.js src/components/__tests__/onePager.test.js src/components/__tests__/generationProgress.test.js &amp;&amp; echo "All 4 test files exist" || echo "MISSING test files"</automated>
  </verify>
  <done>
    All 4 test scaffold files exist in src/components/__tests__/ with vitest imports and test cases covering the data-transformation logic for ONEP-02 (formatTitle, stateToLabel), ONEP-03 (getVerdictStyle), ONEP-04 (camelToTitle, formatDataValue), and ONEP-05 (computeSectionStatuses). Tests import from _testExports and will pass once downstream tasks create the component files with exported helpers.
  </done>
</task>

<task type="auto">
  <name>Task 1: Vite middleware for .thes1s/reports + useOnePager hook</name>
  <files>vite.config.js, src/hooks/useOnePager.js</files>
  <read_first>
    - vite.config.js (full file -- understand existing middleware plugin pattern)
    - src/hooks/useResearch.js (hook return pattern: { data, loading, error })
    - src/schemas/progress.js (ProgressSchema fields, state enum values)
    - .thes1s/reports/COST/one-pager.json (actual report structure to serve)
  </read_first>
  <action>
    **vite.config.js — Add thes1sReportsPlugin() middleware:**

    Create a new Vite middleware plugin function `thes1sReportsPlugin()` following the exact pattern of `yahooSummaryPlugin()` (lazy-load fs/path, parse URL, return JSON). The plugin handles three endpoints:

    1. `GET /api/thes1s/reports` — Directory listing. Read `.thes1s/reports/` directory, return JSON array of ticker names that have `one-pager.json` files. Response: `{ tickers: ["COST", ...] }`. If directory doesn't exist, return `{ tickers: [] }`.

    2. `GET /api/thes1s/reports/:ticker/one-pager` — Serve one-pager.json. Read `.thes1s/reports/{TICKER}/one-pager.json`, return contents as JSON. Return 404 with `{ error: 'Not found' }` if file missing.

    3. `GET /api/thes1s/reports/:ticker/progress` — Serve progress.json. Read `.thes1s/reports/{TICKER}/progress.json`, return contents as JSON. Return 404 with `{ error: 'Not found' }` if file missing.

    URL parsing: strip leading `/` from `req.url`, split on `/`. For listing endpoint, `req.url` will be `/` or empty. For ticker endpoints, URL will be `/{TICKER}/{file}`.

    Register the plugin in the `plugins` array: `plugins: [react(), yahooSummaryPlugin(), ..., irEventsPlugin(), thes1sReportsPlugin()]`.

    Use lazy `import('fs')` and `import('path')` at first invocation (same pattern as other plugins). Use `readFileSync` and `existsSync` and `readdirSync`. Construct paths with `join(process.cwd(), '.thes1s', 'reports', ...)`.

    **src/hooks/useOnePager.js — Data-fetching hook with progress polling:**

    Create hook `useOnePager(ticker)` that returns `{ report, progress, loading, error }`.

    Implementation:
    - On mount (or ticker change), fetch `/api/thes1s/reports/${ticker}/one-pager`. If 200, set `report`. If 404, `report` stays null.
    - Simultaneously fetch `/api/thes1s/reports/${ticker}/progress`. If 200, set `progress`.
    - If `progress` exists and `progress.state !== 'COMPLETE'`, start polling every 2000ms via `setTimeout` (not `setInterval`). Each poll re-fetches progress. When state becomes `COMPLETE`, stop polling, wait 500ms, then re-fetch the report (per research Pitfall 2).
    - Use `let cancelled = false` + cleanup pattern (per project convention).
    - Guard clause: `if (!ticker) return { report: null, progress: null, loading: false, error: null }`.
    - All fetches wrapped in try/catch, failures set error state.
    - Export as named export: `export function useOnePager(ticker)`.
  </action>
  <verify>
    <automated>npm run dev -- --host 2>&1 &amp; sleep 3 &amp;&amp; curl -s http://localhost:5173/api/thes1s/reports | grep -q "tickers" &amp;&amp; curl -s http://localhost:5173/api/thes1s/reports/COST/one-pager | grep -q "COSTCO" &amp;&amp; echo "PASS" || echo "FAIL"; kill %1 2>/dev/null</automated>
  </verify>
  <acceptance_criteria>
    - grep -q "thes1s-reports" vite.config.js (plugin registered)
    - grep -q "thes1sReportsPlugin" vite.config.js (function defined)
    - grep -q "/api/thes1s/reports" vite.config.js (endpoint path)
    - grep -q "export function useOnePager" src/hooks/useOnePager.js
    - grep -q "report.*progress.*loading.*error" src/hooks/useOnePager.js (return shape)
    - grep -q "cancelled" src/hooks/useOnePager.js (cancellation pattern)
    - grep -q "COMPLETE" src/hooks/useOnePager.js (polling stop condition)
    - npm test passes (no regressions)
  </acceptance_criteria>
  <done>
    Vite dev server serves COST one-pager.json at /api/thes1s/reports/COST/one-pager, lists tickers at /api/thes1s/reports, serves progress at /api/thes1s/reports/COST/progress. useOnePager hook fetches report data and polls progress with cleanup.
  </done>
</task>

<task type="auto">
  <name>Task 2: VerdictBadge and ConfidenceBadge components with _testExports</name>
  <files>src/components/VerdictBadge.jsx, src/components/ConfidenceBadge.jsx</files>
  <read_first>
    - src/theme.js (C palette -- C.green, C.red, C.yellow, C.accent, C.greenBg, C.yellowBg, C.redBg, C.accentLight)
    - src/components/CompanyHeader.jsx (existing ScoreBadge pattern for inline-styled badges)
    - .thes1s/reports/COST/one-pager.json (verify verdict values: "PASS", "FAIL", "WATCHLIST", null; confidence: "HIGH", "MEDIUM", "LOW")
    - src/components/__tests__/verdictBadge.test.js (test expectations to satisfy)
  </read_first>
  <action>
    **src/components/VerdictBadge.jsx — Colored pill badge per D-04:**

    Props: `{ verdict, size = 'default' }` where verdict is "PASS" | "FAIL" | "WATCHLIST" | "REVIEW" | null.

    **Extract color mapping as a pure function `getVerdictStyle(verdict)`** that returns `{ bg, text, label }` or null for invalid/null verdicts. This function is tested via `_testExports`.

    Color mapping using existing C palette colors (per research Pitfall 5 -- use C palette, not hardcoded hex):
    - PASS: `{ bg: C.green, text: '#fff', label: 'PASS' }`
    - FAIL: `{ bg: C.red, text: '#fff', label: 'FAIL' }`
    - WATCHLIST: `{ bg: C.yellow, text: '#fff', label: 'WATCHLIST' }`
    - REVIEW: `{ bg: C.accent, text: '#fff', label: 'REVIEW' }`
    - null/undefined/invalid: return null (component returns null -- don't render)

    SVG icons inline (12x12, stroke="currentColor", strokeWidth="2"):
    - Checkmark: `<polyline points="20 6 9 17 4 12" />`
    - X: `<line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />`
    - Eye: `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />`
    - Clock: `<circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />`

    Styles -- pill shape per D-04:
    - `display: 'inline-flex'`, `alignItems: 'center'`, `gap: 5`
    - `padding: size === 'large' ? '6px 16px' : '3px 10px'`
    - `borderRadius: 9999` (full pill)
    - `fontSize: size === 'large' ? 13 : 11`, `fontWeight: 700`
    - `textTransform: 'uppercase'`, `letterSpacing: '0.04em'`
    - SVG wrapper: `display: 'flex'`, `alignItems: 'center'`

    Export default component AND test helpers:
    ```javascript
    export default function VerdictBadge({ verdict, size = 'default' }) { ... }
    export const _testExports = { getVerdictStyle };
    ```

    **src/components/ConfidenceBadge.jsx — Secondary indicator per D-05:**

    Props: `{ confidence }` where confidence is "HIGH" | "MEDIUM" | "LOW" | null.

    Color mapping -- subtle, secondary treatment:
    - HIGH: `{ color: C.green, bg: C.greenBg }`
    - MEDIUM: `{ color: C.yellow, bg: C.yellowBg }`
    - LOW: `{ color: C.red, bg: C.redBg }`
    - null/undefined: return null

    Styles -- smaller than VerdictBadge:
    - `display: 'inline-flex'`, `alignItems: 'center'`, `gap: 4`
    - `padding: '2px 8px'`, `borderRadius: 4`
    - `fontSize: 10`, `fontWeight: 600`
    - `textTransform: 'uppercase'`, `letterSpacing: '0.04em'`

    Export as default: `export default function ConfidenceBadge({ confidence })`.

    Both components must: `import { C } from '../theme'`.

    **After creating both components, run the verdictBadge tests to confirm they pass (Red -> Green).**
  </action>
  <verify>
    <automated>npx vitest run src/components/__tests__/verdictBadge.test.js -x &amp;&amp; grep -q "export default function VerdictBadge" src/components/VerdictBadge.jsx &amp;&amp; grep -q "export default function ConfidenceBadge" src/components/ConfidenceBadge.jsx &amp;&amp; grep -q "_testExports" src/components/VerdictBadge.jsx &amp;&amp; echo "PASS" || echo "FAIL"</automated>
  </verify>
  <acceptance_criteria>
    - npx vitest run src/components/__tests__/verdictBadge.test.js passes
    - grep -q "export default function VerdictBadge" src/components/VerdictBadge.jsx
    - grep -q "export default function ConfidenceBadge" src/components/ConfidenceBadge.jsx
    - grep -q "_testExports" src/components/VerdictBadge.jsx (test-only exports)
    - grep -q "getVerdictStyle" src/components/VerdictBadge.jsx (extracted pure function)
    - grep -q "import { C } from" src/components/VerdictBadge.jsx (uses C palette)
    - grep -q "import { C } from" src/components/ConfidenceBadge.jsx (uses C palette)
    - grep -q "PASS" src/components/VerdictBadge.jsx (handles PASS verdict)
    - grep -q "FAIL" src/components/VerdictBadge.jsx (handles FAIL verdict)
    - grep -q "WATCHLIST" src/components/VerdictBadge.jsx (handles WATCHLIST verdict)
    - grep -q "REVIEW" src/components/VerdictBadge.jsx (handles REVIEW verdict)
    - grep -q "borderRadius.*9999" src/components/VerdictBadge.jsx (pill shape)
    - npm test passes
  </acceptance_criteria>
  <done>
    VerdictBadge renders PASS/green, FAIL/red, WATCHLIST/amber, REVIEW/teal as pill badges with SVG icons. ConfidenceBadge renders HIGH/MEDIUM/LOW as smaller secondary indicators. Both use C palette for dark/light mode compatibility. Both handle null gracefully by returning null. VerdictBadge exports _testExports.getVerdictStyle and verdictBadge.test.js passes.
  </done>
</task>

</tasks>

<verification>
- `curl -s http://localhost:5173/api/thes1s/reports` returns `{ "tickers": ["COST"] }`
- `curl -s http://localhost:5173/api/thes1s/reports/COST/one-pager` returns full COST One Pager JSON
- `npx vitest run src/components/__tests__/verdictBadge.test.js` passes
- All 4 test scaffold files exist in src/components/__tests__/
- VerdictBadge.jsx and ConfidenceBadge.jsx exist with correct exports
- useOnePager.js exists with named export
</verification>

<success_criteria>
- Vite middleware serves report data from `.thes1s/reports/` at 3 endpoints
- useOnePager hook fetches report + polls progress with cancellation cleanup
- VerdictBadge renders 4 verdict states as colored pills with icons
- ConfidenceBadge renders 3 confidence levels as secondary indicators
- All components use C palette from theme.js (no hardcoded colors)
- All 4 Wave 0 test files created with pure data-transform tests
- verdictBadge.test.js passes after VerdictBadge component is created
- No new npm dependencies added
</success_criteria>

<output>
After completion, create `.planning/phases/05B-one-pager-display-components/05B-01-SUMMARY.md`
</output>
