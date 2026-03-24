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
  artifacts:
    - path: "vite.config.js"
      provides: "thes1sReportsPlugin middleware serving /api/thes1s/reports/* endpoints"
      contains: "thes1s-reports"
    - path: "src/hooks/useOnePager.js"
      provides: "Hook bridging file-system reports to React state with progress polling"
      exports: ["useOnePager"]
    - path: "src/components/VerdictBadge.jsx"
      provides: "Colored pill badge for PASS/FAIL/WATCHLIST/REVIEW verdicts"
      exports: ["default"]
    - path: "src/components/ConfidenceBadge.jsx"
      provides: "Secondary badge for HIGH/MEDIUM/LOW confidence indicators"
      exports: ["default"]
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
Build the data bridge and foundational UI atoms for One Pager display.

Purpose: The browser cannot read files from `.thes1s/reports/` directly. This plan creates the Vite middleware that serves report JSON to the browser, the React hook that consumes it with progress polling, and the badge components (VerdictBadge, ConfidenceBadge) that every section and the page header will use. These are the building blocks for Plans 02 and 03.

Output: Vite middleware plugin, useOnePager hook, VerdictBadge.jsx, ConfidenceBadge.jsx
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
</interfaces>
</context>

<tasks>

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
  <name>Task 2: VerdictBadge and ConfidenceBadge components</name>
  <files>src/components/VerdictBadge.jsx, src/components/ConfidenceBadge.jsx</files>
  <read_first>
    - src/theme.js (C palette — C.green, C.red, C.yellow, C.accent, C.greenBg, C.yellowBg, C.redBg, C.accentLight)
    - src/components/CompanyHeader.jsx (existing ScoreBadge pattern for inline-styled badges)
    - .thes1s/reports/COST/one-pager.json (verify verdict values: "PASS", "FAIL", "WATCHLIST", null; confidence: "HIGH", "MEDIUM", "LOW")
  </read_first>
  <action>
    **src/components/VerdictBadge.jsx — Colored pill badge per D-04:**

    Props: `{ verdict, size = 'default' }` where verdict is "PASS" | "FAIL" | "WATCHLIST" | "REVIEW" | null.

    Color mapping using existing C palette colors (per research Pitfall 5 — use C palette, not hardcoded hex):
    - PASS: `{ bg: C.green, text: '#fff', icon: checkmark SVG }`
    - FAIL: `{ bg: C.red, text: '#fff', icon: X SVG }`
    - WATCHLIST: `{ bg: C.yellow, text: '#fff', icon: eye SVG }`
    - REVIEW: `{ bg: C.accent, text: '#fff', icon: clock SVG }`
    - null/undefined: return null (don't render)

    SVG icons inline (12x12, stroke="currentColor", strokeWidth="2"):
    - Checkmark: `<polyline points="20 6 9 17 4 12" />`
    - X: `<line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />`
    - Eye: `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />`
    - Clock: `<circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />`

    Styles — pill shape per D-04:
    - `display: 'inline-flex'`, `alignItems: 'center'`, `gap: 5`
    - `padding: size === 'large' ? '6px 16px' : '3px 10px'`
    - `borderRadius: 9999` (full pill)
    - `fontSize: size === 'large' ? 13 : 11`, `fontWeight: 700`
    - `textTransform: 'uppercase'`, `letterSpacing: '0.04em'`
    - SVG wrapper: `display: 'flex'`, `alignItems: 'center'`

    Export as default: `export default function VerdictBadge({ verdict, size = 'default' })`.

    **src/components/ConfidenceBadge.jsx — Secondary indicator per D-05:**

    Props: `{ confidence }` where confidence is "HIGH" | "MEDIUM" | "LOW" | null.

    Color mapping — subtle, secondary treatment:
    - HIGH: `{ color: C.green, bg: C.greenBg }`
    - MEDIUM: `{ color: C.yellow, bg: C.yellowBg }`
    - LOW: `{ color: C.red, bg: C.redBg }`
    - null/undefined: return null

    Styles — smaller than VerdictBadge:
    - `display: 'inline-flex'`, `alignItems: 'center'`, `gap: 4`
    - `padding: '2px 8px'`, `borderRadius: 4`
    - `fontSize: 10`, `fontWeight: 600`
    - `textTransform: 'uppercase'`, `letterSpacing: '0.04em'`

    Export as default: `export default function ConfidenceBadge({ confidence })`.

    Both components must: `import { C } from '../theme'`.
  </action>
  <verify>
    <automated>grep -q "export default function VerdictBadge" src/components/VerdictBadge.jsx &amp;&amp; grep -q "export default function ConfidenceBadge" src/components/ConfidenceBadge.jsx &amp;&amp; grep -q "C.green" src/components/VerdictBadge.jsx &amp;&amp; grep -q "C.greenBg" src/components/ConfidenceBadge.jsx &amp;&amp; npm test &amp;&amp; echo "PASS" || echo "FAIL"</automated>
  </verify>
  <acceptance_criteria>
    - grep -q "export default function VerdictBadge" src/components/VerdictBadge.jsx
    - grep -q "export default function ConfidenceBadge" src/components/ConfidenceBadge.jsx
    - grep -q "import { C } from" src/components/VerdictBadge.jsx (uses C palette)
    - grep -q "import { C } from" src/components/ConfidenceBadge.jsx (uses C palette)
    - grep -q "PASS" src/components/VerdictBadge.jsx (handles PASS verdict)
    - grep -q "FAIL" src/components/VerdictBadge.jsx (handles FAIL verdict)
    - grep -q "WATCHLIST" src/components/VerdictBadge.jsx (handles WATCHLIST verdict)
    - grep -q "REVIEW" src/components/VerdictBadge.jsx (handles REVIEW verdict)
    - grep -q "HIGH" src/components/ConfidenceBadge.jsx (handles HIGH confidence)
    - grep -q "MEDIUM" src/components/ConfidenceBadge.jsx (handles MEDIUM confidence)
    - grep -q "LOW" src/components/ConfidenceBadge.jsx (handles LOW confidence)
    - grep -q "borderRadius.*9999" src/components/VerdictBadge.jsx (pill shape)
    - npm test passes
  </acceptance_criteria>
  <done>
    VerdictBadge renders PASS/green, FAIL/red, WATCHLIST/amber, REVIEW/teal as pill badges with SVG icons. ConfidenceBadge renders HIGH/MEDIUM/LOW as smaller secondary indicators. Both use C palette for dark/light mode compatibility. Both handle null gracefully by returning null.
  </done>
</task>

</tasks>

<verification>
- `curl -s http://localhost:5173/api/thes1s/reports` returns `{ "tickers": ["COST"] }`
- `curl -s http://localhost:5173/api/thes1s/reports/COST/one-pager` returns full COST One Pager JSON
- `npm test` passes with no regressions
- VerdictBadge.jsx and ConfidenceBadge.jsx exist with correct exports
- useOnePager.js exists with named export
</verification>

<success_criteria>
- Vite middleware serves report data from `.thes1s/reports/` at 3 endpoints
- useOnePager hook fetches report + polls progress with cancellation cleanup
- VerdictBadge renders 4 verdict states as colored pills with icons
- ConfidenceBadge renders 3 confidence levels as secondary indicators
- All components use C palette from theme.js (no hardcoded colors)
- No new npm dependencies added
</success_criteria>

<output>
After completion, create `.planning/phases/05B-one-pager-display-components/05B-01-SUMMARY.md`
</output>
