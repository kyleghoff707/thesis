# Phase 5B: UI Polish Notes (Post-Completion)

**Captured:** 2026-03-24
**Status:** Deferred to dedicated UI polish pass (after Phase 5D)
**Recommended approach:** `/design-review` or `/plan-design-review` on the One Pager view

---

## Issues Identified by User

### 1. Confidence badge needs label
- Current: shows "HIGH" next to verdict badge with no context
- Fix: change to "CONFIDENCE: HIGH" so users know what it means
- File: `src/components/ConfidenceBadge.jsx`

### 2. Summary callouts need bullet points
- Current: green highlighted summaries are run-on text ("all four gates Pass. ROE 27.77%, ROIC 23.22%. Rule One composite Score 91/100")
- Fix: parse summary text and bullet-point where applicable (lists of metrics, gate results)
- File: `src/components/SectionRenderer.jsx`

### 3. Data grid is an eyesore
- Raw numbers with no formatting: `432040000000.00` instead of `$432B`, `41.00` instead of `41 years`
- `--` for string fields that aren't numeric
- Grid layout doesn't group related fields
- Fix options: smart number formatting (use existing `fmtNum`/`fmtDollar`/`fmtPct` from Toolbox), group by category, or convert to a structured list instead of flat grid
- File: `src/components/SectionRenderer.jsx` (data grid section)

### 4. Commentary sections are unreadable text blobs
- Narrative text (especially the verdict section at 5,800+ chars) needs paragraph breaks, subheadings, or visual structure
- Content quality is great — just needs better presentation
- Fix: parse markdown-like structure from narrative (paragraphs, bold, line breaks), or have agents output structured narrative with paragraph breaks
- File: `src/components/SectionRenderer.jsx` (narrative rendering)

### 5. Citations not visible in UI
- Citations ARE populated in the JSON now (62 total across sections)
- But inline `[1]` references don't appear in the narrative text because agents write prose without inline citation markers
- Fix: either (a) post-process narrative to insert citation markers where values match, or (b) update agent prompts to include `[1]` markers in their narrative text, or (c) show citations as a separate list below each section
- Files: `src/components/CitationTooltip.jsx`, agent prompts

### 6. Nav highlighting
- Clicking COST in Reports tab navigates to `/research/:id/one-pager` which highlights "Research" in the top nav instead of "Reports"
- Minor CSS/route issue
- File: `src/components/Layout.jsx`

---

## Recommended Approach

Run `/design-review` on the One Pager view after Phase 5D completes. By then:
- Citations will be validated by the quality system (QUAL-01)
- Completeness scoring will flag missing fields (QUAL-02)
- Better test data from regeneration with enforced narrative + citations
- Design review can address all issues holistically instead of piecemeal
