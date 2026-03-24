---
phase: 05B-one-pager-display-components
plan: 03
type: execute
wave: 3
depends_on: ["05B-01", "05B-02"]
files_modified:
  - src/components/OnePager.jsx
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
  artifacts:
    - path: "src/components/OnePager.jsx"
      provides: "Full One Pager page: header, sticky nav, 6 sections via SectionRenderer, progress dashboard, approval gate"
      exports: ["default"]
      min_lines: 150
    - path: "src/App.jsx"
      provides: "Updated route replacing StagePlaceholder with OnePager component"
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
---

<objective>
Build the OnePager page component that assembles all sub-components into the full report viewer, wire it into the route structure, and implement the progress dashboard and approval gate.

Purpose: This is the culmination plan -- it creates the page users actually see. The OnePager component orchestrates the useOnePager hook, SectionRenderer, VerdictBadge, sticky section nav, progress display, and approval gate into a cohesive report-reading experience. The route change in App.jsx makes it accessible at `/research/:id/one-pager`. The user verifies it renders the COST One Pager correctly.

Output: OnePager.jsx, updated App.jsx routes
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
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: OnePager page component with progress, nav, sections, approval, and references</name>
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
  </read_first>
  <action>
    **src/components/OnePager.jsx — Full One Pager page per ONEP-02 + ONEP-05:**

    Props: `{ getReport, updateReport }` — receives report CRUD from App.jsx.

    Uses `useParams()` to get `:id` from URL. Calls `getReport(id)` to get report object (for ticker and stageApprovals). Calls `useOnePager(report?.ticker)` to get `{ report: onePagerData, progress, loading, error }`.

    **Component structure (top to bottom):**

    **A. Loading / Error / Empty states:**
    - If `loading` and no `onePagerData`: Show centered spinner with "Loading report..." text.
    - If `error`: Show error message in red.
    - If no `onePagerData` and no `progress`: Show empty state: "No One Pager generated yet. Run /generate:one-pager {TICKER} to create one." (per the workflow -- generation happens via CC skill, not in-app yet).

    **B. Report Header (Hero):**
    - Company name: `onePagerData.companyName` rendered through a `formatTitle` helper that converts "COSTCO WHOLESALE CORP /NEW" to "Costco Wholesale Corp" (strip /NEW suffix, title case). `fontSize: 24`, `fontWeight: 800`, `color: C.text`.
    - Ticker: `onePagerData.ticker` in `fontSize: 14`, `fontWeight: 600`, `color: C.accent`, `marginBottom: 4`.
    - Overall verdict badge: `<VerdictBadge verdict={onePagerData.overallVerdict} size="large" />` — hero badge per D-04.
    - Generation metadata: "Generated {relative time}" in `fontSize: 11`, `color: C.textMuted`.
    - Approval status: If `report.stageApprovals?.onePager` is "approved", show green "Approved" text. If "rejected", show red "Rejected" text.
    - Style: `marginBottom: 24`, `paddingBottom: 16`, `borderBottom: '1px solid ' + C.border`.

    **C. Progress Bar (per D-12 — visible during generation, hides when complete):**
    - Only show if `progress` exists and `progress.state !== 'COMPLETE'`.
    - Compute percentage: count `complete` sections / total sections * 100.
    - Outer bar: `height: 4`, `background: C.border`, `borderRadius: 2`, `marginBottom: 16`, `overflow: 'hidden'`.
    - Inner bar: `height: '100%'`, `background: C.accent`, `borderRadius: 2`, `width: percentage + '%'`, `transition: 'width 0.5s ease'`.
    - Status label below bar: `progress.state` converted to readable text (e.g., "WAVE_1_RUNNING" -> "Generating sections..."). `fontSize: 11`, `color: C.textMuted`.

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

    **E. Section Rendering (per D-11/D-13 — progressive display):**
    - Iterate over `onePagerData.sectionKeys` (or use `onePagerData.sections` sorted by `sectionNumber`).
    - For each section key:
      - Find the section in `onePagerData.sections` by key.
      - If section exists (report complete or this section complete): render `<SectionRenderer section={section} sectionId={'section-' + section.key} onCitationClick={handleCitationClick} />`.
      - If section NOT found but progress exists and this section is "running": render a placeholder card with spinner + "Agent: {progress.sections[key].agentRole} working..." per D-12. Style: same card dimensions as SectionRenderer, `opacity: 0.6`, spinner animation.
      - If section NOT found and progress shows "pending": render a minimal placeholder card: section title + "Pending..." in muted text.
      - If section NOT found and progress shows "failed": render a placeholder with red error text.
    - Fade-in animation for newly appeared sections: each SectionRenderer wrapper has `animation: fadeIn 0.4s ease` (use inline keyframe via a `<style>` tag injected once, or use opacity transition with useEffect).

    **F. Citation Reference List (per D-08 — at bottom of report):**
    - Only render if any section has non-empty `citations` array.
    - Collect all citations across all sections, deduplicate by `id`.
    - Section: "References" header, then numbered list.
    - Each reference: `[N]` + source + text. `fontSize: 12`, `color: C.textSecondary`.
    - `id="citation-references"` for scroll-to-reference on citation click.
    - `handleCitationClick(citation)`: scroll to `#citation-references` and highlight the matching citation.
    - If all citations are empty (current COST state), this section simply doesn't render.

    **G. Approval Bar (per D-14):**
    - Only show when all sections are rendered (either `onePagerData` has all 6 sections, or `progress.state === 'COMPLETE'`) AND `report.stageApprovals?.onePager` is null (not yet decided).
    - Fixed bar at bottom of the section content (not fixed to viewport — appears after scrolling past all sections).
    - Style: `background: C.bgCard`, `border: '1px solid ' + C.border`, `borderRadius: 8`, `padding: '16px 20px'`, `marginTop: 24`, `display: 'flex'`, `alignItems: 'center'`, `gap: 16`.
    - Text: "Ready for approval" + brief instruction.
    - Approve button: `background: C.green`, `color: '#fff'`, `padding: '8px 20px'`, `borderRadius: 6`, `fontWeight: 600`, `fontSize: 13`, `border: 'none'`, `cursor: 'pointer'`. onClick: `updateReport(id, { stageApprovals: { ...report.stageApprovals, onePager: 'approved' }, updatedAt: new Date().toISOString().slice(0, 10) })`.
    - Reject button: `background: 'transparent'`, `color: C.red`, `border: '1px solid ' + C.red`, same sizing. onClick: prompt for notes via `window.prompt('Rejection notes (optional):')`, then `updateReport(id, { stageApprovals: { ...report.stageApprovals, onePager: 'rejected' }, notes: existingNotes + rejectionNotes })`.

    **H. Spinner Component (inline):**
    - Define a small `Spinner` component inside the file (not separate file).
    - Renders a rotating circle using CSS animation. Inject a `<style>` tag once at component mount for the `@keyframes spin` animation (rotate 360deg in 1s linear infinite).
    - Style: 20x20 circle, `border: '2px solid ' + C.border`, `borderTopColor: C.accent`, `borderRadius: '50%'`, `animation: 'spin 1s linear infinite'`.

    **I. Format helpers (inline):**
    - `formatTitle(name)`: Strip " /NEW", "/DE", "/OLD" suffixes. Title case the rest. Return cleaned string.
    - `formatRelativeTime(isoDate)`: Return "just now", "X minutes ago", "X hours ago", "X days ago" relative to now.
    - `stateToLabel(state)`: Map progress state enum to human-readable label: "IDLE" -> "Preparing...", "DATA_ASSEMBLY" -> "Assembling data...", "WAVE_1_RUNNING" -> "Generating sections...", "SYNTHESIS" -> "Writing synthesis...", "QUALITY_CHECK" -> "Quality check...", "COMPLETE" -> "Complete".

    Export: `export default function OnePager({ getReport, updateReport })`.
  </action>
  <verify>
    <automated>grep -q "export default function OnePager" src/components/OnePager.jsx &amp;&amp; grep -q "useOnePager" src/components/OnePager.jsx &amp;&amp; grep -q "SectionRenderer" src/components/OnePager.jsx &amp;&amp; grep -q "VerdictBadge" src/components/OnePager.jsx &amp;&amp; grep -q "IntersectionObserver" src/components/OnePager.jsx &amp;&amp; grep -q "stageApprovals" src/components/OnePager.jsx &amp;&amp; grep -q "approved" src/components/OnePager.jsx &amp;&amp; grep -q "rejected" src/components/OnePager.jsx &amp;&amp; npm test &amp;&amp; echo "PASS" || echo "FAIL"</automated>
  </verify>
  <acceptance_criteria>
    - grep -q "export default function OnePager" src/components/OnePager.jsx
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
    OnePager page component renders the full COST report: hero header with overall WATCHLIST verdict badge, sticky section nav on left with scroll spy, all 6 sections via SectionRenderer, progress bar and section placeholders during generation, citation reference list at bottom, and approval bar with Approve/Reject buttons that persist decision to stageApprovals.onePager.
  </done>
</task>

<task type="auto">
  <name>Task 2: Wire OnePager into App.jsx routes</name>
  <files>src/App.jsx</files>
  <read_first>
    - src/App.jsx (full file — current route structure, StagePlaceholder, imports)
    - src/components/OnePager.jsx (props: getReport, updateReport)
  </read_first>
  <action>
    **src/App.jsx — Route wiring per D-01:**

    1. Add import at top of file: `import OnePager from './components/OnePager';`

    2. Replace the StagePlaceholder route for one-pager:
       - Before: `<Route path="/research/:id/one-pager" element={<StagePlaceholder label="One Pager" />} />`
       - After: `<Route path="/research/:id/one-pager" element={<OnePager getReport={getReport} updateReport={updateReport} />} />`

    3. Keep the StagePlaceholder function and its other uses (pitch-deck, full-story) unchanged.

    4. Keep all other routes unchanged (watchlists, research, gurus, reports, validation, audit routes).

    5. Do NOT change the `/reports` route yet — per D-01 it should eventually become the generated reports viewer, but that requires a reports listing component that discovers all generated tickers. For now, keep ResearchList at `/reports`. The generated One Pager is accessible at `/research/:id/one-pager`.

    **No other file changes.** The route wiring is the only integration point.
  </action>
  <verify>
    <automated>grep -q "import OnePager" src/App.jsx &amp;&amp; grep -q "OnePager" src/App.jsx &amp;&amp; grep "one-pager" src/App.jsx | grep -q "OnePager" &amp;&amp; npm test &amp;&amp; echo "PASS" || echo "FAIL"</automated>
  </verify>
  <acceptance_criteria>
    - grep -q "import OnePager from './components/OnePager'" src/App.jsx (import added)
    - grep "one-pager" src/App.jsx | grep -q "OnePager" (route uses OnePager component)
    - grep -q "getReport={getReport}" src/App.jsx (passes getReport prop)
    - grep -q "updateReport={updateReport}" src/App.jsx (passes updateReport prop)
    - grep -q "StagePlaceholder" src/App.jsx (kept for pitch-deck and full-story)
    - npm test passes
    - npm run build succeeds (no import errors)
  </acceptance_criteria>
  <done>
    /research/:id/one-pager route renders OnePager component with getReport and updateReport props. StagePlaceholder remains for pitch-deck and full-story routes. All other routes unchanged.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Visual verification of COST One Pager display</name>
  <files>src/components/OnePager.jsx, src/App.jsx</files>
  <action>User visually verifies the complete One Pager display renders correctly with all 6 sections, verdict badges, sticky nav, red flags, cross-cutting findings, and approval gate.</action>
  <what-built>Complete One Pager display: COST report with 6 sections, verdict badges, sticky nav, red flags, cross-cutting findings, and approval gate</what-built>
  <how-to-verify>
    1. Run `npm run dev` (Vite dev server at localhost:5173)
    2. Navigate to the Research tab, open any existing COST research report
    3. In the Toolbox URL bar, append `/one-pager` (e.g., `/research/{id}/one-pager`)
    4. Verify you see:
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
    5. Scroll to bottom -- verify approval bar with Approve and Reject buttons
    6. Click Approve -- verify the button state changes (approved indicator appears)
    7. Verify dark/light mode toggle works correctly (all colors adapt)
  </how-to-verify>
  <verify>User confirms visual correctness</verify>
  <done>User approves the One Pager display</done>
  <resume-signal>Type "approved" or describe any visual/functional issues to fix</resume-signal>
</task>

</tasks>

<verification>
- Navigate to /research/:id/one-pager and see COST report with all 6 sections
- Overall WATCHLIST verdict badge visible at top
- Sticky section nav scrolls to sections on click
- Progress bar appears during generation (test with modified progress.json if needed)
- Approval bar appears and persists decision
- All 6 sections render without console errors
- Dark/light mode works for all new components
- npm test passes, npm run build succeeds
</verification>

<success_criteria>
- COST One Pager renders with all 6 sections, verdict badges, confidence indicators
- Sticky section nav with scroll-to functionality works
- Progress dashboard shows during generation with per-section status
- Approval gate persists PASS/FAIL decision to stageApprovals.onePager
- Citation reference list renders when citations are present (gracefully absent for current data)
- Route /research/:id/one-pager works with OnePager component
- User visually verifies the rendered report matches expectations
</success_criteria>

<output>
After completion, create `.planning/phases/05B-one-pager-display-components/05B-03-SUMMARY.md`
</output>
