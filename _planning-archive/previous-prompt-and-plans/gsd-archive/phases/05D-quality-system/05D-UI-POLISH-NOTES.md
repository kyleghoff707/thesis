# Phase 5D: UI Polish Notes (Post-Completion)

**Captured:** 2026-03-24
**Status:** Deferred to dedicated UI polish pass
**Recommended approach:** `/design-review` on quality dashboard after it's built

---

## Issues Identified

### 1. Quality scores not visible to user
- Quality reports are generated and saved to `.thes1s/reports/{TICKER}/quality/` but no UI surfaces them
- User has to read raw JSON files to see citation validation results, completeness scores, confidence assessments
- Fix: Add a quality score badge or collapsible quality panel per section in the OnePager viewer
- Integration point: `src/components/SectionRenderer.jsx` or a new `QualityBadge.jsx` component

### 2. Citation validation results hidden
- critic.js flags untraceable claims, value mismatches, format issues — but the user never sees them
- Fix: Show citation validation status per section (e.g., "12/14 citations verified, 2 flagged") with expandable details showing which citations passed/failed and why
- Integration point: `src/components/OnePager.jsx` — load quality report via Vite middleware

### 3. Cost breakdown not displayed
- contextBudget.js tracks token estimation and cost per agent — saved to `budget.json` but invisible
- Fix: Show generation cost summary somewhere — either in the OnePager footer, or in the ReportsList card for each ticker
- Example: "Generation cost: ~$1.40 (3 Sonnet agents + 1 Opus synthesis)"
- Integration point: `src/components/ReportsList.jsx` or `src/components/OnePager.jsx`

### 4. Quality dashboard concept
- Aggregate quality view across all sections: overall quality score, sections with issues, citation coverage percentage, cost per report
- Could be a tab within the OnePager viewer, or a separate quality panel
- Shows: which sections passed critic.js, which have flagged citations, completeness scores, confidence justification
- This is how a real hedge fund compliance department would present their review to the PM

---

## Recommended Approach

Build the quality dashboard as part of a broader UI polish phase after Phase 6 (Pitch Deck). By then:
- Multiple report types will exist (One Pager + Pitch Deck) giving richer quality data
- The 5B UI polish notes (data grid formatting, narrative rendering, citation visibility) should be addressed at the same time
- A single `/design-review` pass can cover both report rendering and quality display holistically
