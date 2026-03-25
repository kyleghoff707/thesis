---
phase: 05B-one-pager-display-components
plan: 03
type: execute
wave: 3
depends_on: ["05B-01", "05B-02"]
files_modified:
  - src/components/OnePager.jsx
  - src/components/ReportsList.jsx
  - src/App.jsx
autonomous: false
requirements: [ONEP-02, ONEP-05]
must_haves:
  truths:
    - "User can navigate to /research/:id/one-pager and see the COST One Pager with all 6 sections rendered"
    - "Overall verdict WATCHLIST badge appears as hero at top of report"
    - "Sticky section nav on the side shows all 6 section titles with click-to-scroll"
    - "During generation, section placeholders show spinner with agent name"
    - "Progress bar at top shows overall generation status percentage"
    - "Completed sections appear while others show loading state"
    - "After all sections complete, approval bar appears with Approve and Reject buttons"
    - "Approve/Reject persists decision in report.stageApprovals.onePager via updateReport"
    - "Citation reference list appears at bottom of report"
    - "Reports tab at /reports lists tickers with generated reports per D-01"
    - "formatTitle, stateToLabel, and computeSectionStatuses pass onePager.test.js and generationProgress.test.js"
  artifacts:
    - path: "src/components/OnePager.jsx"
      provides: "Full One Pager page: header, sticky nav, 6 sections via SectionRenderer, progress dashboard, approval gate"
      exports: ["default", "_testExports"]
      min_lines: 150
    - path: "src/components/ReportsList.jsx"
      provides: "Reports listing page that discovers generated reports via /api/thes1s/reports and links to /research/:id/one-pager"
      exports: ["default"]
    - path: "src/App.jsx"
      provides: "Updated routes: OnePager at /research/:id/one-pager, ReportsList at /reports per D-01"
      contains: "OnePager"
  key_links:
    - from: "src/components/OnePager.jsx"
      to: "src/hooks/useOnePager.js"
      via: "import useOnePager"
      pattern: "import.*useOnePager"
    - from: "src/components/OnePager.jsx"
      to: "src/components/SectionRenderer.jsx"
      via: "import SectionRenderer"
      pattern: "import SectionRenderer"
    - from: "src/components/OnePager.jsx"
      to: "src/hooks/useResearch.js"
      via: "updateReport for approval gate"
      pattern: "updateReport"
    - from: "src/App.jsx"
      to: "src/components/OnePager.jsx"
      via: "Route element"
      pattern: "OnePager"
    - from: "src/App.jsx"
      to: "src/components/ReportsList.jsx"
      via: "Route element at /reports per D-01"
      pattern: "ReportsList"
    - from: "src/components/ReportsList.jsx"
      to: "/api/thes1s/reports"
      via: "fetch to list generated tickers"
      pattern: "fetch.*api/thes1s/reports"
---

<objective>
Build the OnePager page component that assembles all sub-components into the full report viewer, create the ReportsList page at /reports per D-01, wire both into the route structure, and implement the progress dashboard and approval gate.

Purpose: This is the culmination plan -- it creates the pages users actually see. The OnePager component orchestrates the useOnePager hook, SectionRenderer, VerdictBadge, sticky section nav, progress display, and approval gate into a cohesive report-reading experience. The ReportsList component replaces ResearchList at /reports per D-01, listing tickers with generated reports and linking to them. The route changes in App.jsx make both accessible. The user verifies it renders the COST One Pager correctly.

Output: OnePager.jsx (with _testExports), ReportsList.jsx, updated App.jsx routes
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/phases/05B-one-pager-display-components/05B-CONTEXT.md
@.planning/phases/05B-one-pager-display-components/05B-RESEARCH.md
@.planning/phases/05B-one-pager-display-components/05B-01-SUMMARY.md
@.planning/phases/05B-one-pager-display-components/05B-02-SUMMARY.md

@src/App.jsx
@src/components/Layout.jsx
@src/hooks/useResearch.js
@src/hooks/useOnePager.js
@src/components/SectionRenderer.jsx
@src/components/VerdictBadge.jsx
@.thes1s/reports/COST/one-pager.json
@src/schemas/progress.js
@src/components/__tests__/onePager.test.js
@src/components/__tests__/generationProgress.test.js

<interfaces>
<!-- From Plan 01 outputs -->
From src/hooks/useOnePager.js:
```javascript
export function useOnePager(ticker)
// Returns: { report, progress, loading, error }
// report: { ticker, companyName, stage, generatedAt, sections: [...], overallVerdict, sectionKeys }
// progress: { ticker, stage, state, startedAt, lastUpdated, sections: { [key]: { status, agentRole? } }, ... }
// loading: boolean
// error: string | null
```

<!-- From Plan 02 outputs -->
From src/components/SectionRenderer.jsx:
```javascript
export default function SectionRenderer({ section, sectionId, onCitationClick })
// section: ReportSectionSchema object
// sectionId: string for scroll anchor (e.g., "section-company_info")
// onCitationClick: (citation) => void
```

<!-- Existing route structure -->
From src/App.jsx:
```javascript
// Current: <Route path="/research/:id/one-pager" element={<StagePlaceholder label="One Pager" />} />
// Replace with: <Route path="/research/:id/one-pager" element={<OnePager ... />} />
// Current: <Route path="/reports" element={<ResearchList reports={reports} onDelete={deleteReport} />} />
// Replace with: <Route path="/reports" element={<ReportsList reports={reports} getReport={getReport} />} /> per D-01
```

From src/hooks/useResearch.js:
```javascript
// updateReport(id, updates) — merges updates into report object
// getReport(id) — returns report by UUID
// report.stageApprovals.onePager: null | "approved" | "rejected"
// report.ticker: string
```

From src/schemas/progress.js:
```javascript
// progress.state enum: 'IDLE' | 'DATA_ASSEMBLY' | ... | 'WAVE_1_RUNNING' | ... | 'COMPLETE'
// progress.sections[key].status: 'complete' | 'running' | 'pending' | 'failed'
// progress.sections[key].agentRole: string (e.g., "financial-analyst", "business-analyst")
```

From src/components/Layout.jsx:
```javascript
// Nav height: 52px
// Content padding: 20px 24px
// Max width: 1400px
```

From Plan 01 test scaffolds:
```javascript
// onePager.test.js expects:
//   import { _testExports } from '../OnePager.jsx'
//   _testExports.formatTitle('COSTCO WHOLESALE CORP /NEW') === 'Costco Wholesale Corp'
//   _testExports.stateToLabel('WAVE_1_RUNNING') === 'Generating sections...'
//
// generationProgress.test.js expects:
//   import { _testExports } from '../OnePager.jsx'
//   _testExports.computeSectionStatuses(progress) returns mapped statuses
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: OnePager page component with _testExports for helpers</name>
  <files>src/components/OnePager.jsx</files>
  <read_first>
    - src/hooks/useOnePager.js (hook API: report, progress, loading, error)
    - src/hooks/useResearch.js (updateReport, getReport, report.stageApprovals)
    - src/components/SectionRenderer.jsx (props: section, sectionId, onCitationClick)
    - src/components/VerdictBadge.jsx (props: verdict, size)
    - src/components/ConfidenceBadge.jsx (props: confidence)
    - .thes1s/reports/COST/one-pager.json (6 sections, overallVerdict, companyName, sectionKeys)
    - src/components/Layout.jsx (52px nav height, content area structure)
    - src/theme.js (C palette)
    - src/schemas/progress.js (state enum values, section status values)
    - src/components/__tests__/onePager.test.js (test expectations for formatTitle, stateToLabel)
    - src/components/__tests__/generationProgress.test.js (test expectations for computeSectionStatuses)
  </read_first>
  <action>
    **src/components/OnePager.jsx — Full One Pager page per ONEP-02 + ONEP-05:**

    Props: `{ getReport, updateReport }` -- receives report CRUD from App.jsx.

    Uses `useParams()` to get `:id` from URL. Calls `getReport(id)` to get report object (for ticker and stageApprovals). Calls `useOnePager(report?.ticker)` to get `{ report: onePagerData, progress, loading, error }`.

    **CRITICAL: Extract pure helper functions for testing.** The following helpers MUST be defined as standalone functions (not inside the component) and exported via `_testExports`:

    1. `formatTitle(name)` -- Strip " /NEW", "/DE", "/OLD" suffixes (case-insensitive regex). Title case the rest (split on spaces, capitalize first letter of each word, lowercase the rest). Return cleaned string.

    2. `formatRelativeTime(isoDate)` -- Return "just now" (< 1min), "X minutes ago" (< 1hr), "X hours ago" (< 24hr), "X days ago" (>= 24hr). Use `Date.now() - new Date(isoDate).getTime()` for calculation.

    3. `stateToLabel(state)` -- Map progress state enum to human-readable label:
       - "IDLE" -> "Preparing..."
       - "DATA_ASSEMBLY" -> "Assembling data..."
       - "PRIMARY_SOURCE_READING" -> "Reading primary sources..."
       - "WAVE_1_RUNNING" -> "Generating sections..."
       - "CHECKPOINT_1" -> "Checkpoint..."
       - "WAVE_2_RUNNING" -> "Generating sections..."
       - "SYNTHESIS" -> "Writing synthesis..."
       - "QUALITY_CHECK" -> "Quality check..."
       - "COMPLETE" -> "Complete"
       - Default/unknown: "Working..." (not crash)

    4. `computeSectionStatuses(progress)` -- Given a progress object, return an object mapping each section key to its display status string. If progress is null/undefined, return empty object `{}`. Otherwise iterate `progress.sections` and return `{ [key]: section.status }` for each key. Also compute percentage: count 'complete' / total * 100 and include as `_percentage` key.

    **Component structure (top to bottom):**

    **A. Loading / Error / Empty states:**
    - If `loading` and no `onePagerData`: Show centered spinner with "Loading report..." text.
    - If `error`: Show error message in red.
    - If no `onePagerData` and no `progress`: Show empty state: "No One Pager generated yet. Run /generate:one-pager {TICKER} to create one." (per the workflow -- generation happens via CC skill, not in-app yet).

    **B. Report Header (Hero):**
    - Company name: `onePagerData.companyName` rendered through `formatTitle`. `fontSize: 24`, `fontWeight: 800`, `color: C.text`.
    - Ticker: `onePagerData.ticker` in `fontSize: 14`, `fontWeight: 600`, `color: C.accent`, `marginBottom: 4`.
    - Overall verdict badge: `<VerdictBadge verdict={onePagerData.overallVerdict} size="large" />` -- hero badge per D-04.
    - Generation metadata: "Generated {formatRelativeTime(onePagerData.generatedAt)}" in `fontSize: 11`, `color: C.textMuted`.
    - Approval status: If `report.stageApprovals?.onePager` is "approved", show green "Approved" text. If "rejected", show red "Rejected" text.
    - Style: `marginBottom: 24`, `paddingBottom: 16`, `borderBottom: '1px solid ' + C.border`.

    **C. Progress Bar (per D-12 -- visible during generation, hides when complete):**
    - Only show if `progress` exists and `progress.state !== 'COMPLETE'`.
    - Compute percentage using `computeSectionStatuses(progress)._percentage`.
    - Outer bar: `height: 4`, `background: C.border`, `borderRadius: 2`, `marginBottom: 16`, `overflow: 'hidden'`.
    - Inner bar: `height: '100%'`, `background: C.accent`, `borderRadius: 2`, `width: percentage + '%'`, `transition: 'width 0.5s ease'`.
    - Status label below bar: `stateToLabel(progress.state)`. `fontSize: 11`, `color: C.textMuted`.

    **D. Two-Column Layout (Sticky Nav + Content):**
    - Wrapper: `display: 'flex'`, `gap: 24`, `alignItems: 'flex-start'`.

    **D1. Sticky Section Nav (Left, per D-02):**
    - `position: 'sticky'`, `top: 72` (52px nav + 20px content padding), `width: 200`, `flexShrink: 0`.
    - List of section links, each with:
      - Section number + truncated title (first 25 chars)
      - Verdict dot: small 8x8 circle colored by section verdict (green/red/amber/teal), or gray if pending
      - If section is the currently visible one (tracked by IntersectionObserver or scroll position), highlight with `background: C.bgHover`, `borderRadius: 6`, `fontWeight: 600`.
      - Click handler: scroll to section anchor using `document.getElementById('section-' + sectionKey).scrollIntoView({ behavior: 'smooth' })`. Apply offset by setting `scrollMarginTop` on the target element (handled in SectionRenderer).
    - Style per item: `padding: '6px 10px'`, `fontSize: 12`, `color: C.textSecondary`, `cursor: 'pointer'`, `display: 'flex'`, `alignItems: 'center'`, `gap: 8`, `borderRadius: 6`, `transition: 'all 0.15s'`.
    - Hover: `background: C.bgHover`.
    - Track active section with `useState(activeSection)` and `IntersectionObserver`:
      - On mount, create observer with `threshold: 0.3`, `rootMargin: '-80px 0px -60% 0px'`.
      - Observe all `section-*` elements.
      - On intersection, set `activeSection` to the key of the most visible section.
      - Clean up observer on unmount.

    **D2. Content Column (Right):**
    - `flex: 1`, `minWidth: 0`.

    **E. Section Rendering (per D-11/D-13 -- progressive display):**
    - Iterate over `onePagerData.sectionKeys` (or use `onePagerData.sections` sorted by `sectionNumber`).
    - For each section key:
      - Find the section in `onePagerData.sections` by key.
      - If section exists (report complete or this section complete): render `<SectionRenderer section={section} sectionId={'section-' + section.key} onCitationClick={handleCitationClick} />`.
      - If section NOT found but progress exists and this section is "running": render a placeholder card with spinner + "Agent: {progress.sections[key].agentRole} working..." per D-12. Style: same card dimensions as SectionRenderer, `opacity: 0.6`, spinner animation.
      - If section NOT found and progress shows "pending": render a minimal placeholder card: section title + "Pending..." in muted text.
      - If section NOT found and progress shows "failed": render a placeholder with red error text.
    - Fade-in animation for newly appeared sections: each SectionRenderer wrapper has `animation: fadeIn 0.4s ease` (use inline keyframe via a `<style>` tag injected once, or use opacity transition with useEffect).

    **F. Citation Reference List (per D-08 -- at bottom of report):**
    - Only render if any section has non-empty `citations` array.
    - Collect all citations across all sections, deduplicate by `id`.
    - Section: "References" header, then numbered list.
    - Each reference: `[N]` + source + text. `fontSize: 12`, `color: C.textSecondary`.
    - `id="citation-references"` for scroll-to-reference on citation click.
    - `handleCitationClick(citation)`: scroll to `#citation-references` and highlight the matching citation.
    - If all citations are empty (current COST state), this section simply doesn't render.

    **G. Approval Bar (per D-14):**
    - Only show when all sections are rendered (either `onePagerData` has all 6 sections, or `progress.state === 'COMPLETE'`) AND `report.stageApprovals?.onePager` is null (not yet decided).
    - Fixed bar at bottom of the section content (not fixed to viewport -- appears after scrolling past all sections).
    - Style: `background: C.bgCard`, `border: '1px solid ' + C.border`, `borderRadius: 8`, `padding: '16px 20px'`, `marginTop: 24`, `display: 'flex'`, `alignItems: 'center'`, `gap: 16`.
    - Text: "Ready for approval" + brief instruction.
    - Approve button: `background: C.green`, `color: '#fff'`, `padding: '8px 20px'`, `borderRadius: 6`, `fontWeight: 600`, `fontSize: 13`, `border: 'none'`, `cursor: 'pointer'`. onClick: `updateReport(id, { stageApprovals: { ...report.stageApprovals, onePager: 'approved' }, updatedAt: new Date().toISOString().slice(0, 10) })`.
    - Reject button: `background: 'transparent'`, `color: C.red`, `border: '1px solid ' + C.red`, same sizing. onClick: prompt for notes via `window.prompt('Rejection notes (optional):')`, then `updateReport(id, { stageApprovals: { ...report.stageApprovals, onePager: 'rejected' }, notes: existingNotes + rejectionNotes })`.

    **H. Spinner Component (inline):**
    - Define a small `Spinner` component inside the file (not separate file).
    - Renders a rotating circle using CSS animation. Inject a `<style>` tag once at component mount for the `@keyframes spin` animation (rotate 360deg in 1s linear infinite).
    - Style: 20x20 circle, `border: '2px solid ' + C.border`, `borderTopColor: C.accent`, `borderRadius: '50%'`, `animation: 'spin 1s linear infinite'`.

    **Export both the component and test helpers:**
    ```javascript
    export default function OnePager({ getReport, updateReport }) { ... }
    export const _testExports = { formatTitle, formatRelativeTime, stateToLabel, computeSectionStatuses };
    ```

    **After creating the component, run the onePager and generationProgress tests to confirm they pass (Red -> Green).**
  </action>
  <verify>
    <automated>npx vitest run src/components/__tests__/onePager.test.js src/components/__tests__/generationProgress.test.js -x &amp;&amp; grep -q "export default function OnePager" src/components/OnePager.jsx &amp;&amp; grep -q "_testExports" src/components/OnePager.jsx &amp;&amp; grep -q "useOnePager" src/components/OnePager.jsx &amp;&amp; grep -q "SectionRenderer" src/components/OnePager.jsx &amp;&amp; echo "PASS" || echo "FAIL"</automated>
  </verify>
  <acceptance_criteria>
    - npx vitest run src/components/__tests__/onePager.test.js passes
    - npx vitest run src/components/__tests__/generationProgress.test.js passes
    - grep -q "export default function OnePager" src/components/OnePager.jsx
    - grep -q "_testExports" src/components/OnePager.jsx (test-only exports)
    - grep -q "formatTitle" src/components/OnePager.jsx (extracted pure function)
    - grep -q "stateToLabel" src/components/OnePager.jsx (extracted pure function)
    - grep -q "computeSectionStatuses" src/components/OnePager.jsx (extracted pure function)
    - grep -q "import.*useOnePager" src/components/OnePager.jsx (data hook)
    - grep -q "import SectionRenderer" src/components/OnePager.jsx (section rendering)
    - grep -q "import VerdictBadge" src/components/OnePager.jsx (verdict badges)
    - grep -q "useParams" src/components/OnePager.jsx (route param extraction)
    - grep -q "IntersectionObserver" src/components/OnePager.jsx (scroll spy for active section)
    - grep -q "scrollIntoView" src/components/OnePager.jsx (section nav click scrolling)
    - grep -q "stageApprovals" src/components/OnePager.jsx (approval persistence)
    - grep -q "approved" src/components/OnePager.jsx (approve action)
    - grep -q "rejected" src/components/OnePager.jsx (reject action)
    - grep -q "updateReport" src/components/OnePager.jsx (persists approval)
    - grep -q "progress" src/components/OnePager.jsx (progress display)
    - grep -q "COMPLETE" src/components/OnePager.jsx (completion detection)
    - grep -q "citation-references" src/components/OnePager.jsx (reference list anchor)
    - grep -q "import { C } from" src/components/OnePager.jsx (uses C palette)
    - npm test passes
  </acceptance_criteria>
  <done>
    OnePager page component renders the full COST report: hero header with overall WATCHLIST verdict badge, sticky section nav on left with scroll spy, all 6 sections via SectionRenderer, progress bar and section placeholders during generation, citation reference list at bottom, and approval bar with Approve/Reject buttons that persist decision to stageApprovals.onePager. Exports _testExports with formatTitle, formatRelativeTime, stateToLabel, and computeSectionStatuses -- all 4 helper test files pass.
  </done>
</task>

<task type="auto">
  <name>Task 2: ReportsList page + route wiring (D-01 implementation)</name>
  <files>src/components/ReportsList.jsx, src/App.jsx</files>
  <read_first>
    - src/App.jsx (full file -- current route structure, StagePlaceholder, ResearchList imports)
    - src/components/ResearchList.jsx (current /reports content -- understand what it renders)
    - src/components/OnePager.jsx (props: getReport, updateReport)
    - src/hooks/useResearch.js (reports array, getReport)
    - src/theme.js (C palette)
  </read_first>
  <action>
    **Per D-01 (locked decision): "Replace the existing top-level Reports tab (currently ResearchList) with the generated One Pager viewer. All generated reports live here."**

    **src/components/ReportsList.jsx — Generated reports listing page:**

    This component replaces ResearchList at the /reports route. It shows a list of tickers that have generated One Pager reports, linking each to the One Pager viewer.

    Props: `{ reports, getReport }` -- receives the reports array and getReport function from App.jsx (same pattern as current ResearchList).

    Implementation:
    - On mount, fetch `/api/thes1s/reports` to get `{ tickers: ["COST", ...] }` (the Vite middleware endpoint created in Plan 01).
    - Use `useState` for `tickers` array, `loading` boolean, `error` string.
    - Use `useEffect` with fetch + cancelled pattern (project convention).
    - For each ticker in the response, find the matching report in `reports` by ticker name to get the report UUID (needed for routing to `/research/:id/one-pager`).

    Display:
    - Page header: "Generated Reports" in `fontSize: 20`, `fontWeight: 700`, `color: C.text`, `marginBottom: 20`.
    - If loading: spinner.
    - If no tickers: empty state -- "No reports generated yet. Use /generate:one-pager {TICKER} from Claude Code to generate your first One Pager."
    - For each ticker with a matching report:
      - Card: `border: '1px solid ' + C.border`, `borderRadius: 8`, `padding: '16px 20px'`, `marginBottom: 12`, `background: C.bgCard`, `cursor: 'pointer'`, `display: 'flex'`, `alignItems: 'center'`, `justifyContent: 'space-between'`.
      - Left side: ticker in `fontSize: 16`, `fontWeight: 700`, `color: C.accent` + company name from report in `fontSize: 13`, `color: C.textSecondary`.
      - Right side: "One Pager" badge + approval status if set (green "Approved", red "Rejected", gray "Pending").
      - Click: use `useNavigate` to navigate to `/research/${reportId}/one-pager`.
    - For tickers WITHOUT a matching report in localStorage (report was generated but no research entry exists): show the ticker with a note "Create a research entry to view" -- the user needs to create a research entry for the ticker first.
    - Hover: `background: C.bgHover`.

    Import: `import { C } from '../theme'`, `import { useNavigate } from 'react-router-dom'`.
    Export: `export default function ReportsList({ reports, getReport })`.

    **src/App.jsx — Route wiring per D-01:**

    1. Add imports at top of file:
       - `import OnePager from './components/OnePager';`
       - `import ReportsList from './components/ReportsList';`

    2. Replace the StagePlaceholder route for one-pager:
       - Before: `<Route path="/research/:id/one-pager" element={<StagePlaceholder label="One Pager" />} />`
       - After: `<Route path="/research/:id/one-pager" element={<OnePager getReport={getReport} updateReport={updateReport} />} />`

    3. Replace the ResearchList route at /reports per D-01:
       - Before: `<Route path="/reports" element={<ResearchList reports={reports} onDelete={deleteReport} />} />`
       - After: `<Route path="/reports" element={<ReportsList reports={reports} getReport={getReport} />} />`

    4. Keep the StagePlaceholder function and its other uses (pitch-deck, full-story) unchanged.

    5. Keep the ResearchList import -- it may still be used elsewhere or can be removed if fully replaced. Check if ResearchList is used in any other route; if not, the import can be removed.

    6. Keep all other routes unchanged (watchlists, research, gurus, validation, audit routes).

    **No other file changes.** The route wiring and ReportsList component complete D-01.
  </action>
  <verify>
    <automated>grep -q "import OnePager" src/App.jsx &amp;&amp; grep -q "import ReportsList" src/App.jsx &amp;&amp; grep "one-pager" src/App.jsx | grep -q "OnePager" &amp;&amp; grep "/reports" src/App.jsx | grep -q "ReportsList" &amp;&amp; grep -q "export default function ReportsList" src/components/ReportsList.jsx &amp;&amp; grep -q "api/thes1s/reports" src/components/ReportsList.jsx &amp;&amp; npm test &amp;&amp; npm run build &amp;&amp; echo "PASS" || echo "FAIL"</automated>
  </verify>
  <acceptance_criteria>
    - grep -q "import OnePager from './components/OnePager'" src/App.jsx (import added)
    - grep -q "import ReportsList from './components/ReportsList'" src/App.jsx (import added)
    - grep "one-pager" src/App.jsx | grep -q "OnePager" (route uses OnePager component)
    - grep -q "getReport={getReport}" src/App.jsx (passes getReport prop)
    - grep -q "updateReport={updateReport}" src/App.jsx (passes updateReport prop)
    - grep "/reports" src/App.jsx | grep -q "ReportsList" (/reports route uses ReportsList per D-01)
    - grep -q "export default function ReportsList" src/components/ReportsList.jsx
    - grep -q "api/thes1s/reports" src/components/ReportsList.jsx (fetches ticker list)
    - grep -q "useNavigate" src/components/ReportsList.jsx (navigates to one-pager)
    - grep -q "StagePlaceholder" src/App.jsx (kept for pitch-deck and full-story)
    - npm test passes
    - npm run build succeeds (no import errors)
  </acceptance_criteria>
  <done>
    /research/:id/one-pager route renders OnePager component with getReport and updateReport props. /reports route renders ReportsList component per D-01 (replacing ResearchList) that fetches generated tickers from /api/thes1s/reports and links to the One Pager viewer. StagePlaceholder remains for pitch-deck and full-story routes. All other routes unchanged.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Visual verification of COST One Pager display</name>
  <files>src/components/OnePager.jsx, src/components/ReportsList.jsx, src/App.jsx</files>
  <action>User visually verifies the complete One Pager display renders correctly with all 6 sections, verdict badges, sticky nav, red flags, cross-cutting findings, and approval gate. Also verifies the Reports tab shows the ReportsList with COST linked.</action>
  <what-built>Complete One Pager display: COST report with 6 sections, verdict badges, sticky nav, red flags, cross-cutting findings, approval gate, and Reports tab listing generated reports per D-01</what-built>
  <how-to-verify>
    1. Run `npm run dev` (Vite dev server at localhost:5173)
    2. Click the Reports tab in the top nav
    3. Verify you see the ReportsList page with "Generated Reports" header and COST listed (per D-01)
    4. Click the COST entry to navigate to the One Pager viewer
    5. Verify you see:
       - Hero header: "Costco Wholesale Corp" with WATCHLIST verdict badge (amber pill + eye icon)
       - Sticky section nav on the left with 6 sections listed
       - All 6 sections rendered as cards with:
         - Section number, title, verdict badge, confidence badge
         - Teal-bordered summary callout box
         - Verdict rationale prose text
         - Red flag callout boxes (amber background, warning icon, bulleted list)
         - Cross-cutting findings with severity dots
       - Valuation Summary section shows data grid with buy prices (MOS, PBT, Ten Cap, Equity Bond), FGR, current price
       - Clicking section names in the left nav scrolls to that section smoothly
    6. Scroll to bottom -- verify approval bar with Approve and Reject buttons
    7. Click Approve -- verify the button state changes (approved indicator appears)
    8. Verify dark/light mode toggle works correctly (all colors adapt)
  </how-to-verify>
  <verify>User confirms visual correctness</verify>
  <done>User approves the One Pager display and Reports tab listing</done>
  <resume-signal>Type "approved" or describe any visual/functional issues to fix</resume-signal>
</task>

</tasks>

<verification>
- Navigate to /reports and see ReportsList with COST entry (per D-01)
- Navigate to /research/:id/one-pager and see COST report with all 6 sections
- Overall WATCHLIST verdict badge visible at top
- Sticky section nav scrolls to sections on click
- Progress bar appears during generation (test with modified progress.json if needed)
- Approval bar appears and persists decision
- All 6 sections render without console errors
- Dark/light mode works for all new components
- All 4 test files pass: npx vitest run src/components/__tests__/ -x
- npm test passes, npm run build succeeds
</verification>

<success_criteria>
- COST One Pager renders with all 6 sections, verdict badges, confidence indicators
- Sticky section nav with scroll-to functionality works
- Progress dashboard shows during generation with per-section status
- Approval gate persists PASS/FAIL decision to stageApprovals.onePager
- Citation reference list renders when citations are present (gracefully absent for current data)
- Route /research/:id/one-pager works with OnePager component
- Route /reports shows ReportsList with generated tickers per D-01
- formatTitle, stateToLabel, computeSectionStatuses pass their unit tests
- User visually verifies the rendered report matches expectations
</success_criteria>

<output>
After completion, create `.planning/phases/05B-one-pager-display-components/05B-03-SUMMARY.md`
</output>
