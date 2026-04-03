# Phase 19: Shared Report Infrastructure - Context

**Gathered:** 2026-04-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Extract shared utilities, scroll spy hook, markdown renderer, and stage navigation bar to prevent code triplication across OnePager, PitchDeck, and FullStory report viewers. Users see consistent formatting, smooth navigation, properly rendered markdown, and a persistent way to switch between report stages.

</domain>

<decisions>
## Implementation Decisions

### Markdown Renderer Strategy
- **D-01:** Use `react-markdown` library (npm package) for all report narrative rendering. Replaces the custom `parseMarkdown()` function in SectionRenderer.jsx.
- **D-02:** react-markdown provides full CommonMark support out of the box — headings, numbered lists, blockquotes, inline links, code blocks, tables. No maintenance burden for new markdown features from pipeline output.
- **D-03:** Custom component overrides to match Thes1s inline styling (C palette, font sizes, spacing). Citation tooltip integration (`[N]` markers → hover to see source) preserved via custom text/paragraph component overrides.

### Stage Navigation Bar
- **D-04:** Horizontal tab bar (One Pager | Pitch Deck | Full Story) positioned above report content, below the company header. Always visible.
- **D-05:** Locked/unapproved stages appear dimmed with a small lock icon. Not clickable. Hovering shows a tooltip explaining the gate (e.g., "Approve One Pager to unlock Pitch Deck").
- **D-06:** Active stage tab has teal accent underline, matching existing Toolbox tab styling patterns.

### Scroll Spy & Section Nav
- **D-07:** Extract IntersectionObserver logic from OnePager.jsx into a shared `useScrollSpy` hook. Same hook consumed by all three report viewers.
- **D-08:** Sticky sidebar on the left side with section list. Active section highlighted with teal accent bar. Clicking a section smooth-scrolls to it.
- **D-09:** Hook accounts for header offset (52px top nav + stage nav bar height), debounced updates to prevent flicker on fast scrolling. Success criterion: "without flicker."

### Shared Utility Organization
- **D-10:** Single `reportHelpers.js` file for all shared helper functions: `formatTitle`, `formatRelativeTime`, `stateToLabel`, `verdictDotColor`, `fmtNum`, `fmtDollar`, `fmtPct`, `formatDataValue`.
- **D-11:** Separate `Spinner.jsx` component file for the shared Spinner (with keyframe injection). React components get their own files.
- **D-12:** OnePager.jsx and PitchDeck.jsx refactored to import from `reportHelpers.js` and `Spinner.jsx` — remove duplicated function definitions.

### Claude's Discretion
- react-markdown version and specific plugin configuration (remark-gfm for tables, etc.)
- Exact IntersectionObserver thresholds and rootMargin tuning for flicker prevention
- Whether to keep `parseMarkdown()` as a fallback or remove it entirely after react-markdown integration
- Internal structure of reportHelpers.js (export grouping, any sub-modules)
- Stage nav bar component name and exact prop interface
- How section sidebar interacts with report content layout (flex vs grid)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Components to Refactor (source of duplicated code)
- `src/components/OnePager.jsx` — Contains duplicated helpers: formatTitle, formatRelativeTime, stateToLabel, verdictDotColor, Spinner, inline IntersectionObserver scroll spy
- `src/components/PitchDeck.jsx` — Contains same duplicated helpers, plus GenerationStatusPanel, phase status logic
- `src/components/SectionRenderer.jsx` — Contains custom parseMarkdown(), fmtNum/fmtDollar/fmtPct/formatDataValue formatters, renderInline with citation support

### Existing Shared Components (patterns to follow)
- `src/components/VerdictBadge.jsx` — Example of a shared report sub-component
- `src/components/ConfidenceBadge.jsx` — Example of a shared report sub-component
- `src/components/CitationTooltip.jsx` — Citation rendering that must integrate with new markdown renderer
- `src/components/RedFlagCallout.jsx` — Another shared report sub-component

### Layout & Routing
- `src/components/Layout.jsx` — 52px top nav bar (offset for scroll spy)
- `src/App.jsx` — Route definitions for /research/:id, report routes
- `src/theme.js` — C palette for all styling (accent = teal)

### Pipeline Output (what markdown renderer must handle)
- `.thes1s/reports/MNST/pitch-deck.json` — Example narrative content with markdown formatting
- `.thes1s/reports/MNST/full-story-api.json` — Full Story with debates and checklists
- `.thes1s/reports/MNST/one-pager-api.json` — One Pager narratives

### Prior Phase Context
- `.planning/phases/18-critical-bug-fixes-storage-migration/18-CONTEXT.md` — Storage migration decisions, pipeline-as-source-of-truth principle

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `VerdictBadge.jsx`, `ConfidenceBadge.jsx`, `RedFlagCallout.jsx`, `CitationTooltip.jsx`: Already extracted as shared components — good pattern to follow
- `SectionRenderer.jsx`: Core rendering component used by both OnePager and PitchDeck — will need react-markdown integration
- `CollapsibleSection.jsx`: Used by PitchDeck for expandable sections — already shared

### Established Patterns
- All inline styling via mutable `C` palette object from `theme.js`
- Components follow `export default function ComponentName(props)` pattern
- Hooks follow `export function useHookName()` → `{ data, loading, error }` pattern
- Keyframe animations injected once via `document.createElement('style')` pattern (used in both OnePager and PitchDeck)

### Integration Points
- `App.jsx` routes: Report viewers rendered under `/reports/:id/:stage` or similar
- `Toolbox.jsx`: 8-tab container — report viewers are separate routes, not Toolbox tabs
- Stage nav bar needs access to report data (which stages exist, approval status) — likely via `useResearch` hook or direct IndexedDB read

### Duplicated Code Inventory
- `formatTitle()` — identical in OnePager.jsx (line 11) and PitchDeck.jsx (line 103)
- `formatRelativeTime()` — identical in OnePager.jsx (line 23) and PitchDeck.jsx (line 113)
- `stateToLabel()` — identical in OnePager.jsx (line 36) and PitchDeck.jsx (line 126)
- `verdictDotColor()` — identical in OnePager.jsx (line 73) and PitchDeck.jsx (line 92)
- `Spinner` component — identical in OnePager.jsx (line 96) and PitchDeck.jsx (line 158), PD has extra `thes1s-pulse` keyframe
- `injectSpinnerStyle()` — identical pattern in both, PD version has one extra animation

</code_context>

<specifics>
## Specific Ideas

- react-markdown chosen over extending custom parser — pipeline uses real markdown and playing whack-a-mole with missing syntax forever was not appealing
- Stage nav bar tabs should feel like switching tabs in a document, not navigating away
- Lock icon + tooltip for gated stages keeps the full pipeline visible while communicating restrictions
- Sticky sidebar for section nav matches the "document reader" mental model

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 19-shared-report-infrastructure*
*Context gathered: 2026-04-02*
