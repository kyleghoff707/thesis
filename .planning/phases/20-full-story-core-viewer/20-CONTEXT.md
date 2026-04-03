# Phase 20: Full Story Core Viewer - Context

**Gathered:** 2026-04-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Build FullStory.jsx as a full-featured report viewer — replacing the current 114-line temporary shell — with gate check, hero header (judge verdict), sticky nav, 6 sections rendered via SectionRenderer, quality score display (mechanical + methodology), and approval bar. This is the "core viewer" that Phase 21 later layers specialized renderers onto (checklist items, debate steps).

</domain>

<decisions>
## Implementation Decisions

### Quality Score Display
- **D-01:** Per-section quality scores displayed as header badges (pill badges next to section title showing "Mech N · Method N"). Consistent with existing VerdictBadge pattern.
- **D-02:** Overall aggregate quality score displayed in the hero header (e.g., "Quality: 94/100 (Method: 98)").
- **D-03:** Quality scores use traffic-light color coding — green (90+), yellow/amber (70-89), red (<70). Matches existing VerdictBadge color language.
- **D-04:** Quality data sourced from separate quality JSON file (`full-story-v4.quality.json`), fetched alongside the report data. Per-section fields: `sectionKey`, `score` (mechanical), `methodology.score`, `completeness`.

### Hero Header Content
- **D-05:** Hero header anchored by the debate judge's verdict from `debateOutputs.judge.content.overallVerdict`. Fields: `direction` (Bear/Bull/Neutral), `summary`, `investmentImplication`.
- **D-06:** Hero includes a 1-2 sentence excerpt from the judge's `summary` field as the verdict blurb.
- **D-07:** Hero includes the `investmentImplication` rendered as a distinct callout box below the summary — this is the actionable "what to do" guidance.
- **D-08:** Hero also shows overall quality score (from D-02) alongside the verdict.
- **D-09:** If debateOutputs or judge data is missing (older reports), fall back to showing the most common section verdict.

### Section Content Depth
- **D-10:** All 6 sections rendered via SectionRenderer showing full content — narrative, summary, verdict rationale, data grids, tables, cross-cutting findings, red flags, and citations. Same approach as OnePager and PitchDeck.
- **D-11:** Also render `primarySourceInsights` per section — shows which 10-K paragraphs, earnings call excerpts, etc. the AI used. Adds a compliance/transparency layer.
- **D-12:** Also render `searchesPerformed` per section — shows what web searches the AI conducted. Same compliance rationale.
- **D-13:** SectionRenderer will need small additions to handle `primarySourceInsights` and `searchesPerformed` fields (these are not currently rendered by SectionRenderer).

### Overall Verdict Source
- **D-14:** Overall verdict read directly from `debateOutputs.judge.content.overallVerdict` — no data duplication, no computed aggregate.
- **D-15:** Hero layout: direction badge + quality score line, then summary blurb, then investmentImplication callout box. Stacked vertically.

### Gate Check & Approval
- **D-16:** Gate check pattern follows PitchDeck precedent — Pitch Deck must be approved (`report.stageApprovals.pitchDeck === 'approved'`) before Full Story is accessible.
- **D-17:** Approval bar at bottom follows PitchDeck pattern — approve/reject buttons when all sections are rendered and report is complete. Approve sets `stageApprovals.fullStory = 'approved'`; reject prompts for notes.

### Shared Infrastructure
- **D-18:** Uses existing shared infrastructure: useScrollSpy hook, SectionRenderer, VerdictBadge, ConfidenceBadge, Spinner, reportHelpers, ReportMarkdown.
- **D-19:** Needs a new useFullStory hook (similar to usePitchDeck) for fetching report data + quality data.
- **D-20:** Full Story section definitions: event_analysis, meaning_checklist, moat_checklist, management_checklist, valuation_confirmation, inversion_rebuttal (6 sections, no overall_verdict section unlike PitchDeck).

### Claude's Discretion
- Sticky nav implementation details (reuse PitchDeck's nav pattern or simplify for 6 sections vs 9)
- Loading/error/empty state patterns (follow established conventions)
- useFullStory hook polling behavior (whether to poll for generation progress like usePitchDeck)
- Exact layout proportions and spacing

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Report Viewers (pattern reference)
- `src/components/PitchDeck.jsx` — Primary pattern reference for hero banner, gate check, approval bar, section nav, SECTION_DEFS structure
- `src/components/OnePager.jsx` — Secondary pattern reference for simpler report viewer with useScrollSpy integration
- `src/components/FullStory.jsx` — Current temporary shell (to be replaced entirely)

### Shared Report Infrastructure
- `src/components/SectionRenderer.jsx` — General-purpose section renderer handling narrative, data grids, tables, red flags, citations, cross-cutting findings
- `src/components/ReportMarkdown.jsx` — Markdown rendering component (react-markdown + remark-gfm)
- `src/components/VerdictBadge.jsx` — Verdict badge component (PASS/FAIL/WATCHLIST)
- `src/components/ConfidenceBadge.jsx` — Confidence level badge
- `src/components/RedFlagCallout.jsx` — Red flag display component
- `src/components/CitationTooltip.jsx` — Citation rendering with tooltips
- `src/components/reportHelpers.js` — Shared formatting utilities (formatTitle, formatRelativeTime, fmtNum, etc.)
- `src/components/Spinner.jsx` — Loading spinner
- `src/hooks/useScrollSpy.js` — Scroll spy hook for active section tracking

### Data Hooks (pattern reference)
- `src/hooks/usePitchDeck.js` — Pattern for report + progress + generation-status polling hook
- `src/hooks/useOnePager.js` — Simpler report + progress hook

### Pipeline Output (data shape reference)
- `.thes1s/reports/SFM/full-story-api.json` — Full Story API JSON with 6 sections + debateOutputs + budget
- `.thes1s/reports/SFM/quality/full-story-v4.quality.json` — Quality scores (per-section mechanical/methodology + overall)
- `.thes1s/reports/MNST/full-story-api.json` — Second example for cross-ticker validation

### Vite Middleware
- `vite.config.js` lines 437-498 — thes1sReportsPlugin serving report JSON; maps 'full-story' to 'full-story-api.json'

### Report Data Model
- `src/hooks/useResearch.js` — Report data model with stageApprovals.fullStory field

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **SectionRenderer** — Handles 9 content blocks (header, summary, verdict rationale, narrative, data grid, tables, cross-cutting findings, red flags, citations). Needs 2 small additions for primarySourceInsights and searchesPerformed.
- **PitchDeck.jsx SECTION_DEFS pattern** — Array of `{ key, label, phase }` defining section order. Full Story needs its own SECTION_DEFS with 6 entries.
- **PitchDeck hero banner** — Renders overall_verdict as a styled banner with verdict badge, confidence, summary. Full Story hero follows same layout but sources from debateOutputs.judge.
- **PitchDeck approval bar** — Approve/reject buttons with updateReport integration. Direct reuse pattern.
- **PitchDeck gate check** — Checks `report.stageApprovals.onePager === 'approved'`. Full Story checks pitchDeck instead.
- **useScrollSpy** — Already used by OnePager and PitchDeck. Ready for Full Story integration.

### Established Patterns
- **Section rendering**: Components pass section data objects to SectionRenderer. No custom per-section rendering in Phase 20 (that's Phase 21).
- **Report fetching**: Hooks fetch from `/api/thes1s/reports/{ticker}/{stage}`, return `{ report, progress, loading, error }`.
- **Quality data**: Separate fetch needed — quality JSON lives at a different path than the report JSON.
- **Theme**: All styling via `C` palette object from `../theme`.

### Integration Points
- **App.jsx routes**: Full Story route already exists (`/research/:id/full-story`)
- **Vite middleware**: Already serves full-story-api.json at `/api/thes1s/reports/:ticker/full-story`
- **useResearch**: Report model already has `stageApprovals.fullStory` field

</code_context>

<specifics>
## Specific Ideas

- User wants ALL data visible including primarySourceInsights and searchesPerformed — "adds a nice compliance layer for users". These fields show what the AI read and searched, adding transparency.
- Hero should feel like a PM's executive summary — judge direction + summary + actionable investment implication in a callout box.
- Quality scores are a new concept not in OnePager/PitchDeck — this is the first stage to surface them. Pattern established here should be reusable when quality scores are added to other stages later.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 20-full-story-core-viewer*
*Context gathered: 2026-04-02*
