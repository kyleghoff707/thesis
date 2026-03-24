# Phase 5B: One Pager Display Components - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 5B renders generated One Pagers inside the Thes1s desktop app. It replaces the existing Reports tab with a report viewer, builds reusable section rendering components, implements a 3-type citation system, and shows real-time generation progress as agents complete their work. The generated COST One Pager from Phase 5C is the reference data that these components render.

</domain>

<decisions>
## Implementation Decisions

### Report Viewing Layout
- **D-01:** Replace the existing top-level Reports tab (currently ResearchList) with the generated One Pager viewer. All generated reports live here.
- **D-02:** Scrolling page layout with sticky section anchor nav/TOC on the side. All 6 sections visible as you scroll. Verdict badge hero at the top. Reads like a research report.
- **D-03:** Follow existing styling patterns: inline styles with mutable C palette (dark/light), 13px base, Inter font, 1400px max-width, stickeR1 slate + teal accent.

### Verdict Badges & Status
- **D-04:** Colored pill badges with icons. PASS = green pill + checkmark, FAIL = red pill + x, WATCHLIST = amber pill + eye, REVIEW = blue pill + clock. Appears next to each section title AND as a hero badge at top of report.
- **D-05:** Confidence indicators (HIGH/MEDIUM/LOW) displayed alongside verdict badges — smaller, secondary visual treatment.
- **D-06:** Red flags displayed as inline warning callout boxes at the bottom of each section. Tinted background (amber/red), warning icon, lists all red flags. Visually distinct from narrative — can't miss them.

### Citation & Reference System (3-Type Taxonomy)
- **D-07:** Inline citations render as clickable superscript numbers [1][2] in the narrative text.
- **D-08:** Hover shows tooltip with citation source and value. Click jumps to the citation list at the bottom of the report. Academic paper style.
- **D-09:** Three citation types with distinct formatting:
  1. **Thes1s native** — source is the DataPacket/app itself. Display as: "Competitors Tab", "Growth Analysis", "Guru Holdings". Link navigates to the corresponding Toolbox tab in-app.
  2. **SEC filing** — source is an SEC document. Display as: "FY2024 10-K, p.14, Business Section". Link opens the filing on SEC.gov (or the Filings tab).
  3. **Web search** — source is an external URL. Display as truncated/readable link. Opens in browser.
- **D-10:** Every decision traced to verifiable evidence. One click and the user can find where the info came from to double-check themselves.

### Progress Dashboard
- **D-11:** Inline progress directly in the report view. The One Pager page shows immediately with section placeholders. As each agent completes, its section fades in with the content.
- **D-12:** Progress bar at the top shows overall generation status. Sections still pending show a spinner with the agent name: "Business Analyst working..."
- **D-13:** The report builds before the user's eyes — partial results visible as agents complete. No separate progress page.

### Approval Gate
- **D-14:** After all sections rendered, an approval bar appears at the bottom (or top). User can Approve (advance to Pitch Deck eligibility) or Reject (with notes). Decision persists in the report data model (stageApprovals.onePager).

### Claude's Discretion
- Section anchor nav/TOC exact design and positioning (left sidebar vs top sticky)
- Table rendering within sections (the generated data has markdown tables)
- Chart rendering approach (the schema supports charts but COST One Pager doesn't use them yet)
- Transition animations for sections appearing during generation
- Mobile/responsive behavior (desktop-first, but don't break on resize)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Real Output (Render Target)
- `.thes1s/reports/COST/one-pager.json` — Actual generated One Pager JSON with all 6 sections, citations, red flags, verdicts
- `.thes1s/reports/COST/one-pager.md` — Markdown rendering for reference

### Schema (Contract)
- `src/schemas/reportSection.js` — ReportSectionSchema, CitationSchema, TableSchema, ChartSchema, StageReportSchema, crossCuttingFindings
- `src/schemas/dataPacket.js` — DataPacketSchema

### Existing UI Patterns
- `src/components/Toolbox.jsx` — Main research container, tab pattern to follow
- `src/components/Layout.jsx` — Top nav bar, route structure
- `src/components/CollapsibleSection.jsx` — Expandable content pattern
- `src/components/CompanyHeader.jsx` — Company info display pattern
- `src/components/ScoreTable.jsx` — Score display pattern
- `src/theme.js` — C palette object (dark/light themes)

### Data Model
- `src/hooks/useResearch.js` — Existing report data model (id, ticker, currentStage, stageApprovals)

### Design Reference
- `knowledge/stickeR1-reference-ui.md` — stickeR1 design reference
- `knowledge/Rule One Toolbox UI examples/` — Toolbox UI reference screenshots

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `CollapsibleSection.jsx` — expandable sections (could use for red flag boxes)
- `ScoreTable.jsx` — score display (could adapt for verdict summary)
- `CompanyHeader.jsx` — company info header pattern
- `C` palette from `theme.js` — all styling uses this mutable object

### Established Patterns
- All components use inline styles with `C` palette — no CSS files
- Hooks pattern: `{ data, loading, error }` with cancellation
- Tab switching in Toolbox via TABS array and useState
- Route structure in App.jsx: `/research/:id` renders Toolbox

### Integration Points
- Top nav Reports tab — currently renders `ResearchList.jsx` at `/research` route
- `useResearch.js` hook — manages report CRUD in localStorage
- `.thes1s/reports/{TICKER}/` — file-based report storage from generation
- `stageApprovals` field in report model — approval persistence

</code_context>

<specifics>
## Specific Ideas

- The COST One Pager JSON is the real test data — components should render it perfectly
- Citation system is modeled after academic papers — the user is a scientist and expects that rigor
- The 3-type citation taxonomy (Thes1s native / SEC filing / web search) should have visual distinction — maybe different icons or color accents per type
- "The report builds before your eyes" — sections should fade in smoothly as agents complete, not pop in abruptly

</specifics>

<deferred>
## Deferred Ideas

- Chart rendering within sections — schema supports it but current One Pagers don't use charts yet
- PDF export of rendered One Pager — Phase 8
- Version history / regeneration comparison — Phase 8
- Mobile/tablet responsive layout — desktop-first

</deferred>

---

*Phase: 05B-one-pager-display-components*
*Context gathered: 2026-03-24*
