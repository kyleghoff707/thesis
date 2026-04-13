# Phase 21: Checklist & Debate Renderers - Context

**Gathered:** 2026-04-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Build specialized renderers for checklist sections (Meaning 15pt, Moat 15pt, Management 13pt) and the adversarial debate section (Inversion & Rebuttal) in the Full Story viewer. These replace the generic SectionRenderer for sections 2-4 and section 6, rendering structured data as interactive, visually distinct components instead of text walls.

</domain>

<decisions>
## Implementation Decisions

### Checklist Item Layout
- **D-01:** Each checklist item renders as a collapsed row: verdict badge (PASS/FAIL/PARTIAL) + item number + question text + confidence indicator. Click to expand and reveal the full evidence paragraph.
- **D-02:** All items start collapsed equally — no auto-expand for FAIL/PARTIAL items. User expands what they want.
- **D-03:** Three checklist sections (meaning_checklist, moat_checklist, management_checklist) all use the same ChecklistRenderer component. Section data provides `data.items[]` with `{number, item, verdict, evidence, confidence}`.

### Checklist Aggregate Header
- **D-04:** Segmented horizontal bar at the top of each checklist section — green/yellow/red segments proportional to pass/partial/fail counts. Text score line below the bar (e.g., "12 PASS · 3 PARTIAL · 0 FAIL").
- **D-05:** Data sourced from `data.summary` with `{passCount, failCount, partialCount, totalItems, scoreDisplay}`.

### Debate Step Navigation
- **D-06:** Horizontal tabs across the top of the debate section: Bull | Bear | Rebuttal | Judge. One step visible at a time. Each tab styled with its role color.
- **D-07:** Tab state managed locally in DebateRenderer (useState). No URL/route changes for tab switching.

### Debate Step Styling
- **D-08:** Each debate role distinguished by colored left border on the content area: Bull (green/C.green), Bear (red/C.red), Rebuttal (teal/C.accent), Judge (slate/C.textMuted). Role name + label shown in tab and content header.
- **D-09:** Consistent with existing left-border accent pattern used in SectionRenderer summary callouts.

### Debate Content Per Tab
- **D-10:** Bull tab: `overallThesis` as header text, then 7 `thesisPoints[]` as expandable items with `{point, evidence, sourceSection}`.
- **D-11:** Bear tab: `overallBearCase` as header text, then 7 `inversions[]` with `{targetPoint, counterArgument, evidence, severity, sources[]}`. Severity shown as badge.
- **D-12:** Rebuttal tab: 7 `rebuttals[]` with `{bearPoint, rebuttal, rebuttalStrength, honest}`. Strength shown as badge. `honest` flag displayed when false (bull admitted the point stands).
- **D-13:** Judge tab: 7 `exchanges[]` first, then overall verdict at bottom. Exchanges show side-by-side strength indicators: Bull strength on left, Bear strength on right, verdict (Resolved/Unresolved) in center, reasoning expandable. Overall verdict shows direction banner + summary + investmentImplication.
- **D-14:** Judge tab exchanges first, overall verdict at bottom — natural reading order following the logic before the conclusion.

### Integration with FullStory.jsx
- **D-15:** FullStory.jsx's section rendering loop checks section key — if `meaning_checklist`, `moat_checklist`, or `management_checklist`, render ChecklistRenderer instead of SectionRenderer. If `inversion_rebuttal`, render DebateRenderer instead. Other sections (event_analysis, valuation_confirmation) continue using SectionRenderer.
- **D-16:** Both new renderers receive the full section object (same props as SectionRenderer) plus debateOutputs for DebateRenderer. They handle their own internal layout.

### Claude's Discretion
- Exact expand/collapse animation approach (can reuse CollapsibleSection or implement simpler toggle)
- Strength indicator visual style for exchange comparisons (bars, dots, or text badges)
- Tab underline/indicator style (follow existing nav patterns)
- Whether to show confidence badges on checklist items or keep minimal
- Loading/empty states for debate data

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Full Story Viewer (integration target)
- `src/components/FullStory.jsx` — The section rendering loop (line ~391) where ChecklistRenderer and DebateRenderer will be conditionally rendered instead of SectionRenderer
- `src/components/SectionRenderer.jsx` — Current general-purpose renderer; new renderers should maintain compatible section header/footer patterns (verdict badge, quality badge, citations)

### Existing UI Components (reuse candidates)
- `src/components/CollapsibleSection.jsx` — Animated expand/collapse with badge support. Potential reuse for checklist item expansion.
- `src/components/VerdictBadge.jsx` — PASS/FAIL/WATCHLIST badge. Reuse for checklist item verdicts.
- `src/components/ConfidenceBadge.jsx` — Confidence level badge. Potential reuse for checklist confidence.

### Pipeline Data Shapes
- `.thes1s/reports/SFM/full-story-api.json` — Full Story data with checklist `data.items[]` + `data.summary` and `debateOutputs` with 4 steps
- `.thes1s/reports/MNST/full-story-api.json` — Second ticker for cross-validation

### Phase 20 Context (inherited patterns)
- `.planning/phases/20-full-story-core-viewer/20-CONTEXT.md` — Quality score display, hero header decisions that affect section rendering context

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **VerdictBadge** — Already renders PASS/FAIL/WATCHLIST pills. Direct reuse for checklist item verdicts.
- **ConfidenceBadge** — Renders confidence levels. Could be used for checklist item confidence display.
- **CollapsibleSection** — Animated expand/collapse with badge. Could wrap each checklist item's evidence.
- **SectionRenderer** — The section header pattern (number circle, title, verdict badge, quality badge) should be maintained by the new renderers for consistency. New renderers replace the *content* area, not the header.
- **DirectionBadge** — Created in Phase 20 for BULL/BEAR/NEUTRAL. Reuse in Judge tab's overall verdict.

### Established Patterns
- **Inline styles with C palette** — All styling via mutable C object from theme.js.
- **Left-border accent callouts** — SectionRenderer uses 3px left-border for summary callouts. Debate role styling should follow this pattern.
- **Traffic-light colors** — Green (PASS/good), yellow (PARTIAL/caution), red (FAIL/bad) established across VerdictBadge and QualityBadge.

### Integration Points
- **FullStory.jsx SECTION_DEFS** — The rendering loop at line ~391 maps over SECTION_DEFS and renders SectionRenderer for each. Phase 21 adds conditional logic: if key is a checklist → ChecklistRenderer, if key is inversion_rebuttal → DebateRenderer.
- **debateOutputs** — Accessed from `fullStoryData.debateOutputs` in FullStory.jsx. Currently used only for the hero header. Phase 21 passes it to DebateRenderer.

</code_context>

<specifics>
## Specific Ideas

- Checklist items all start collapsed — the PM scans the aggregate bar first, then digs into specific items they care about. The expandable evidence is the depth layer.
- Debate exchanges use side-by-side strength indicators — Bull strength on left, Bear strength on right, verdict in center. Quick visual who won each exchange.
- Judge tab shows exchanges first, verdict at bottom — natural reading order: follow the logic, then see the conclusion.
- Segmented bar for checklist aggregates — proportional green/yellow/red segments give instant visual read of how the section scored.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 21-checklist-debate-renderers*
*Context gathered: 2026-04-03*
