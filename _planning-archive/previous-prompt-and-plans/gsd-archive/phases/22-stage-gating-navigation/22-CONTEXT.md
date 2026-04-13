# Phase 22: Stage Gating & Navigation - Context

**Gathered:** 2026-04-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire stage gating logic so users cannot access later report stages without prior stage approval, upgrade the Reports list to show all 3 stages per ticker with status indicators and direct navigation, and fix top-nav tab highlighting so the Reports tab activates on report stage views. This phase connects the existing per-component gate checks and StageNavBar into a cohesive navigation experience.

</domain>

<decisions>
## Implementation Decisions

### Reports List Multi-Stage Display
- **D-01:** Each ticker row in ReportsList shows 3 inline stage pills in a row: OP · PD · FS. Each pill is color-coded by status (green = approved, teal = generated, gray = pending). Click a pill to navigate directly to that stage route.
- **D-02:** All 3 stage pills always visible per ticker. Locked/gated stages show as grayed-out pills with a tiny lock icon. Clicking a locked pill shows a tooltip explaining what needs to happen (same gate tooltip text as StageNavBar: "Approve One Pager to unlock Pitch Deck", etc.).
- **D-03:** One row per ticker. Current behavior: one report per ticker on disk. Multi-report per ticker deferred to a future milestone.
- **D-04:** Stage status detection: "approved" = `stageApprovals[stage] === 'approved'`; "generated" = report JSON exists on disk (fetched from `/api/thes1s/reports`); "pending" = not generated. "rejected" treated as generated (report exists, just not approved).

### Route/Tab Highlighting Fix
- **D-05:** Keep routes under `/research/:id/*` — no route restructuring. Fix highlighting via custom `isActive` logic on NavLink in Layout.jsx.
- **D-06:** Research tab active ONLY on `/research/:id` (Toolbox, no sub-path). NOT active on `/research/:id/one-pager`, `/research/:id/pitch-deck`, `/research/:id/full-story`.
- **D-07:** Reports tab active on `/reports` (list page) AND on `/research/:id/one-pager`, `/research/:id/pitch-deck`, `/research/:id/full-story` (report stage views). Uses `useLocation` to check pathname.

### Stage Progress Overview
- **D-08:** Reports list inline pills satisfy NAV-04 (stage progress at a glance). No additional progress UI needed — StageNavBar already shows this within individual reports.

### Stage Gating
- **D-09:** Gate logic already exists per-component (PitchDeck checks `onePager === 'approved'`, FullStory checks `pitchDeck === 'approved'`). StageNavBar already implements gate locking with lock icons and tooltips. Phase 22 wires these into the Reports list pills and ensures consistent gating across all entry points.
- **D-10:** ReportsList pill clicks check gate conditions before navigation. Clicking a locked pill does NOT navigate — shows tooltip only.

### Claude's Discretion
- Exact pill styling (border-radius, padding, font size) — follow existing badge patterns
- How to detect which stages have generated reports (API enhancement vs client-side check)
- StageNavBar adjustments if any needed for consistency
- Whether to add a "stage" query param for deep-linking from Reports list

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Navigation Components (modify targets)
- `src/components/Layout.jsx` — Top nav with NavLink tabs. Lines 5-26 define NAV_TABS with `end` and `isActive` props. Lines 86-109 render NavLinks. Must be modified for custom isActive logic (D-05, D-06, D-07).
- `src/components/ReportsList.jsx` — Current single-stage reports list. Must be upgraded with multi-stage pills (D-01, D-02).
- `src/components/StageNavBar.jsx` — Stage nav with gate logic (STAGES, GATE_TOOLTIPS, LockIcon). Pattern reference for gate tooltips in ReportsList.

### Route Definitions
- `src/App.jsx` — All route definitions. Lines 60-68 show report stage routes under `/research/:id/*`. Reports list at `/reports`.

### Gate Logic (existing, pattern reference)
- `src/components/PitchDeck.jsx` — Gate check at line 413: `report?.stageApprovals?.onePager === 'approved'`
- `src/components/FullStory.jsx` — Gate check: `report?.stageApprovals?.pitchDeck === 'approved'`

### Data Model
- `src/hooks/useResearch.js` — Report data model with `stageApprovals` field. Lines 81-85 show the shape.

### API
- `vite.config.js` — thes1sReportsPlugin at lines 437-498. Lists tickers with reports. May need enhancement to return per-stage availability.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **StageNavBar** — Already has STAGES array, GATE_TOOLTIPS, LockIcon SVG, and gate-based locking. ReportsList pills can reuse the same gate logic and tooltip text.
- **VerdictBadge** — Existing pill badge component. Stage pills could follow similar styling patterns.
- **ReportStageLayout** — Wrapper that provides StageNavBar to report stage routes. Already wired in App.jsx.

### Established Patterns
- **NavLink with `isActive`** — Layout.jsx uses react-router-dom `NavLink` with style callback `({ isActive }) => ({...})`. Custom isActive needs `useLocation` since NavLink's built-in matching won't cover cross-path highlighting.
- **Gate check pattern** — `report?.stageApprovals?.stageName === 'approved'` used consistently across PitchDeck and FullStory.
- **Vite API endpoint** — `/api/thes1s/reports` returns `{ tickers: string[] }`. May need to return per-ticker stage availability for the Reports list pills.

### Integration Points
- **Layout.jsx NavLink** — Replace simple `isActive` with custom logic using `useLocation().pathname`
- **ReportsList.jsx** — Major rewrite: add stage pills, gate detection, navigation per stage
- **App.jsx routes** — No changes needed (routes stay under `/research/:id/*`)

</code_context>

<specifics>
## Specific Ideas

- Stage pills should feel like a mini version of StageNavBar — same gate logic, same tooltip language, just compressed into pill badges.
- The Reports tab lighting up on report stage views is the key UX fix — currently confusing when you're reading a report but the Research tab is highlighted.

</specifics>

<deferred>
## Deferred Ideas

- **Multi-report per ticker** — User may re-run a ticker years later. Versioned reports (v1, v2, v3) with history. Deferred to a future milestone.
- **INFRA-02** (scroll spy in nav) — Still pending from Phase 19, not in Phase 22 scope.
- **INFRA-04** (stage nav bar) — Already implemented via StageNavBar in Phase 19, marked pending in requirements but functionally complete.

</deferred>

---

*Phase: 22-stage-gating-navigation*
*Context gathered: 2026-04-03*
