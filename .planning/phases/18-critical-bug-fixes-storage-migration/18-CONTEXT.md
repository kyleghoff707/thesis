# Phase 18: Critical Bug Fixes & Storage Migration - Context

**Gathered:** 2026-04-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 18 fixes broken foundations so existing pipeline output renders correctly and reports can scale to 20+ companies. Four fixes: PitchDeck section key mismatches (5 of 10 keys wrong), report storage migration from localStorage to IndexedDB, Full Story Vite middleware route, and pipeline-side cross-ticker schema normalization.

</domain>

<decisions>
## Implementation Decisions

### Storage Migration
- **D-01:** Single 'reports' object store in IndexedDB, keyed by report ID. Each report contains all stages (OP/PD/FS). Bump `thes1s-cache` DB version from 5 to 6.
- **D-02:** Auto-migrate existing localStorage reports to IndexedDB on first app launch after update. Copy to IndexedDB, then remove from localStorage. Seamless — user never notices.
- **D-03:** Reuse existing `cacheStore.js` infrastructure (`idbSet`, `idbGet`, `idbBulkGet`). Add 'reports' to the object store list.

### Section Key Strategy
- **D-04:** Fix PitchDeck.jsx SECTION_DEFS keys to match pipeline output (pipeline is source of truth). Five key changes: `simple_predictable` → `simple_and_predictable`, `barriers_moats` → `barriers_and_moats`, remove `roe_roic_debt` (doesn't exist in pipeline), `pest` → `pest_risks`, `valuation` → `valuation_summary`.
- **D-05:** Render `overall_verdict` as the hero summary at the top of the report — not as a numbered section. It's the "bottom line" before you read the details.
- **D-06:** Also fix progressState.js section keys to match (line 15).

### Schema Normalization
- **D-07:** Pipeline-side normalization — add a normalization pass in run-pipeline.js that ensures consistent output structure before saving to JSON. Fix at the source so every consumer benefits.
- **D-08:** Cross-ticker differences (missing fields, null vs absent, different nesting) resolved in the pipeline, not the frontend. Components can assume well-formed data.

### Report Loading UX
- **D-09:** Skeleton screen while reports load from IndexedDB — show the report layout with gray placeholder blocks that fill in when data arrives. Matches existing Toolbox tab loading patterns.
- **D-10:** Friendly empty state for missing/corrupt report data: "No report found for [TICKER]. Generate one with the pipeline." Clear message, no scary errors, no silent redirect.

### Claude's Discretion
- IndexedDB store index design (whether to add indexes on ticker, stage, etc.)
- Exact skeleton screen component structure
- Migration error handling (what if localStorage data is partially corrupt)
- Order of operations for the normalization pass
- Whether progressState.js needs any other key alignment beyond section keys

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Pipeline Output (Source of Truth)
- `.thes1s/reports/MNST/pitch-deck.json` — Actual pipeline output with correct section keys (414KB)
- `.thes1s/reports/MNST/full-story-api.json` — Full Story pipeline output (325KB)
- `.thes1s/reports/MNST/one-pager-api.json` — One Pager pipeline output

### Components to Fix
- `src/components/PitchDeck.jsx` — SECTION_DEFS with 5 mismatched keys (lines 15-26)
- `src/engines/progressState.js` — Section keys that must match pipeline (line 15)

### Storage Infrastructure
- `src/engines/cacheStore.js` — Existing IndexedDB infrastructure (thes1s-cache DB v5, idbSet/idbGet/idbBulkGet)
- `src/hooks/useResearch.js` — Current localStorage report CRUD (key: stock-analyzer-reports)

### Vite Middleware
- `vite.config.js` — thes1sReportsPlugin fileMap (lines 495-500, missing full-story entry)

### Pipeline Scripts
- `scripts/pipeline/run-pipeline.js` — Pipeline entry point where normalization pass should be added

### Existing UI Patterns
- `src/components/Toolbox.jsx` — Loading state patterns to follow for skeleton screens
- `src/theme.js` — C palette for skeleton screen colors

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `cacheStore.js`: Full IndexedDB wrapper with idbSet/idbGet/idbBulkGet/idbClear. Adding a 'reports' store requires only: adding to STORES array, bumping DB_VERSION, adding upgrade handler.
- `useResearch.js`: Current report CRUD hook. Needs refactoring from sync localStorage to async IndexedDB (useState + useEffect pattern).
- Toolbox tabs already have loading/error/data patterns via hooks — follow the same `{ data, loading, error }` convention.

### Established Patterns
- All hooks follow: `setLoading(true)` → `try/catch` → `setError(err.message)` → `finally { setLoading(false) }`
- Cache keys use prefixes: `edgar:facts:`, `edgar-statements:`, etc. Reports could use `reports:` prefix.
- Formatters use null-coalescing: `score != null ? score : '--'`

### Integration Points
- `App.jsx` routes: `/research/:id` renders Toolbox. Report routes likely need `/reports/:id/:stage`.
- `vite.config.js`: thes1sReportsPlugin serves pipeline JSON files via `/api/thes1s/reports/:ticker/:type`
- `PitchDeck.jsx` line ~45: `sectionMap` lookup fails when keys don't match — root cause of 5 blank sections

</code_context>

<specifics>
## Specific Ideas

- IndexedDB explained to user as "filing cabinet vs notepad" — when cloud backend comes later, IndexedDB becomes the local cache with a sync layer on top. Same store, same structure.
- User wants pipeline to be the source of truth for section keys — no translation layers, no indirection.
- `overall_verdict` should feel like a headline, not a section — hero position.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 18-critical-bug-fixes-storage-migration*
*Context gathered: 2026-04-01*
