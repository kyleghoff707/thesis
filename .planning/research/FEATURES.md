# Feature Landscape: Report Stage UI Display (v1.3)

**Domain:** Multi-section AI-generated investment research report viewer with citations, verdicts, real-time generation progress, and interactive exploration
**Researched:** 2026-04-01
**Overall confidence:** HIGH (existing components examined, domain patterns well-established)

## Context: What Already Exists

Before mapping features, it is critical to note that significant report display infrastructure is already built. The v1.3 milestone is NOT greenfield -- it extends and completes existing components.

**Already implemented (partial or complete):**
- `SectionRenderer.jsx` -- Renders a single report section with header, verdict, confidence, summary callout, verdict rationale with inline citations, narrative with markdown parsing, structured data grid, tables, cross-cutting findings, red flags, and per-section citation list. ~595 lines, production-ready.
- `OnePager.jsx` -- Full One Pager viewer with two-column layout (sticky sidebar nav + content), IntersectionObserver scroll-spy, progress bar during generation, fade-in animation for completed sections, spinner/pending/failed placeholders, approval gate (Approve/Reject buttons), consolidated reference list. ~558 lines.
- `PitchDeck.jsx` -- Full Pitch Deck viewer with 10-section three-phase layout, generation status panel with elapsed time, phase indicators, section status grid, scroll-spy, DeepDivePanel/AssumptionTracker/IndustryCard integration. ~500+ lines.
- `CitationTooltip.jsx` -- Inline [N] markers with hover tooltips showing source type (thes1s/sec/web) with icons, truncated excerpt, click-to-scroll to reference list. `renderTextWithCitations()` utility parses text and replaces `[N]` markers.
- `VerdictBadge.jsx` -- PASS/FAIL/WATCHLIST/REVIEW badges with icons, two sizes.
- `ConfidenceBadge.jsx` -- HIGH/MEDIUM/LOW badges with color coding.
- `RedFlagCallout.jsx` -- Warning triangle icon with bulleted flag list.
- `SensitivityTable.jsx` -- Color-coded valuation matrix (undervalued/near/overvalued) with current-intersection highlight.
- `DeepDivePanel.jsx` -- 440px slide-out right panel with overlay, Escape/click-outside close, loading spinner, paragraph-split content display.
- `AssumptionTracker.jsx` -- 360px slide-out panel listing assumptions with confidence bars (33%/66%/100%), source attribution, affects-sections mapping.
- `IndustryCard.jsx` -- 320px absolute-positioned popover with term, category, definition, industry benchmarks.
- `ReportsList.jsx` -- List view of generated reports with ticker cards, approval status, auto-create research entry on click.
- `useOnePager.js` -- Hook that fetches report JSON + polls progress every 2s during generation.
- `usePitchDeck.js` -- Hook that fetches pitch deck JSON + polls generation status.
- Vite middleware serving report JSON from `.thes1s/reports/` directory via `/api/thes1s/reports/` endpoints.

**What this means for the feature landscape:** Many "table stakes" features are already implemented. The remaining work is primarily Full Story display, debate rendering, stage gating integration, polish, and delight features that elevate the experience from "functional viewer" to "interactive research workspace."

---

## Table Stakes

Features users expect from a multi-section report viewer. Missing = product feels broken or incomplete.

| Feature | Why Expected | Complexity | Dependencies | Status |
|---------|-------------|------------|--------------|--------|
| Section-by-section rendering with verdict/confidence badges | Core report consumption pattern. Every investment report platform (Bloomberg, Morningstar, Hebbia) shows structured sections with clear status indicators. | Low | `SectionRenderer`, `VerdictBadge`, `ConfidenceBadge` | DONE |
| Sticky sidebar navigation with scroll-spy | Users need to orient themselves in long documents. Perplexity, Notion, Google Docs, and every documentation site uses this pattern. IntersectionObserver-based scroll tracking is the standard implementation. | Low | Already built in `OnePager.jsx` and `PitchDeck.jsx` | DONE |
| Inline citation markers with hover tooltips | Claim-to-source bond is non-negotiable for investment research. Perplexity popularized [N] inline markers. Hebbia uses "clickable, in-line citations." ShapeofAI identifies four citation variants; Thes1s uses inline markers with hover preview -- the strongest pattern for "point to exact passages" use cases. | Low | `CitationTooltip.jsx`, `renderTextWithCitations()` | DONE |
| Consolidated reference list per report | Academic/research convention. Users need a scannable list of all sources at the bottom. Numbered references with source attribution and text excerpts. | Low | Already in `OnePager.jsx` | DONE |
| Real-time generation progress during pipeline execution | Users must see that "something is happening." Skeleton placeholders for pending sections, spinner for active sections, fade-in for completed sections. AG-UI protocol pattern: start events create placeholders, completion events trigger content render. | Medium | `useOnePager.js` polling, `usePitchDeck.js` polling, progress/generation-status JSON endpoints | DONE |
| Progress bar with section count and elapsed time | Quantitative progress feedback. "3/10 sections, 2:45 elapsed" gives users expectation-setting that a spinner alone cannot. | Low | Already in `PitchDeck.jsx` `GenerationStatusPanel` | DONE |
| Stage gating -- OP approval unlocks PD, PD approval unlocks FS | The 3-stage workflow IS the product. Without gating, the progressive research methodology collapses. Users must explicitly approve before deeper (and more expensive) analysis runs. | Medium | `report.stageApprovals` in localStorage, route guards, approval bar UI | PARTIAL -- OP approval bar done, PD/FS gate checks not wired |
| Approval bar with Approve/Reject actions | Decision point UI. Must be prominent, appear only when report is complete, and capture rejection notes. Approval should feel deliberate -- this commits the user to next-stage cost. | Low | Already in `OnePager.jsx` | PARTIAL -- OP done, PD/FS needed |
| Red flag callouts per section | Investment research demands honest risk surfacing. Red flags must be visually distinct and impossible to miss. Yellow warning-triangle pattern with bulleted list. | Low | `RedFlagCallout.jsx` | DONE |
| Full Story display -- 6 sections + debate rendering | Third and final stage. Inherits PD sections, adds scored checklists and adversarial debate. Without this viewer, the pipeline output exists only as raw JSON files. | High | New `FullStory.jsx` component, debate rendering sub-components, checklist renderers | NOT BUILT |
| Scored checklist rendering (43 items across 3 checklists) | Core Full Story feature. Meaning (15pt), Moat (15pt), Management (13pt) checklists with PASS/PARTIAL/FAIL per item, aggregate scores. Must render as interactive scored tables with per-item evidence and confidence. | High | New `ChecklistRenderer.jsx`, data from Full Story JSON | NOT BUILT |
| Adversarial debate rendering (Bull/Bear/Rebuttal/Judge) | The debate is a 4-step structured exchange per topic. Each exchange has Bull argument, Bear argument, Bull Rebuttal, and Judge Verdict with strength assessments. This is the crown jewel of the Full Story -- it cannot be a text wall. | High | New debate display component, structured data in `inversion_rebuttal` section | NOT BUILT |
| Dark/light theme support for all new components | App already has dark/light toggle via `C` palette object. All new components must read from `C` -- no hardcoded colors. | Low | `theme.js`, existing `C` pattern | Inherent -- just follow conventions |
| Report navigation -- discover and open reports | Users need a way to find and navigate between generated reports. Current `ReportsList.jsx` covers this for One Pagers. | Low | `ReportsList.jsx`, route structure | PARTIAL -- OP only, needs PD/FS routes |
| Markdown narrative rendering | Reports contain markdown in narrative fields (headings, bullets, bold). Must render cleanly without raw markdown syntax showing. | Low | `parseMarkdown()` in `SectionRenderer.jsx` | DONE |
| Structured data grids with smart formatting | Financial data (dollar amounts, percentages, ranges) must auto-format based on key patterns. Grid layout for data fields with category grouping when >8 entries. | Low | `formatDataValue()` and `groupDataEntries()` in `SectionRenderer.jsx` | DONE |
| Table rendering for comparison/sensitivity data | Reports include structured tables (headers + rows). Must render as proper HTML tables with consistent styling. | Low | Table rendering in `SectionRenderer.jsx` | DONE |

---

## Differentiators

Features that set the product apart. Not expected, but valued. These are the "delight" features that transform a report viewer into a research workspace.

| Feature | Value Proposition | Complexity | Dependencies | Notes |
|---------|-------------------|------------|--------------|-------|
| "Tell me more" deep-dive panel | Click a claim in the narrative, slide-out panel explains the underlying analysis in more depth. Mimics a PM asking an analyst "walk me through this." No competitor does this -- research reports are static documents everywhere else. | Medium | `DeepDivePanel.jsx` (shell built), needs AI call integration or pre-computed deep-dive content | Shell component exists. Integration with backend needed to actually generate deep-dive content on demand. Could be pre-computed for each section during generation (cheaper) or on-demand via Claude API (richer but ~$0.10/query). Recommend pre-computed deep-dives for V1, on-demand for V2. |
| Assumption tracker sidebar | All key assumptions (FGR, maintenance capex %, historical P/E) in one panel with confidence bars, source attribution, and which sections they affect. Changes to assumptions propagate visually. Hebbia Matrix shows source-linked assumptions; Thes1s goes further by tracking confidence per assumption. | Low-Medium | `AssumptionTracker.jsx` (built), needs data wiring from report JSON `assumptions` array | Shell component exists. Need to extract assumptions from report JSON and wire into the sidebar. Read-only in V1 -- editable assumptions with re-scoring is a future feature. |
| Industry context cards (glossary popover) | Dashed-underline terms in narrative text trigger a popover with definition, category, and industry benchmark values. Makes reports accessible without financial literacy prerequisites. No competitor explains terms inline. | Low-Medium | `IndustryCard.jsx` (built), needs term detection in narrative text and glossary data source | Shell component exists. Need: (1) glossary data (term -> definition + benchmarks), (2) term detection in `parseMarkdown` to wrap recognized terms with trigger elements. Glossary could be static JSON (~100 terms) or extracted from DataPacket industry data. |
| Bull/Bear narrative toggle | Switch the entire report between "bull case emphasis" and "bear case emphasis." Same data, different narrative framing. Unique to Thes1s -- investment research platforms show a single perspective. | High | Requires dual narratives generated during pipeline, or dynamic re-weighting of existing content. New toggle UI component. | Expensive if implemented as dual full-report generation. Cheaper approach: highlight/dim bull-vs-bear arguments within existing sections. Recommend the cheaper "filter view" approach -- collapse bear arguments in bull mode, collapse bull arguments in bear mode. This works because the adversarial debate already has explicit Bull/Bear labels. |
| Source preview -- hover citation to see actual 10-K paragraph | Instead of just citation metadata in the tooltip, show the actual passage from the source document (SEC filing paragraph, earnings transcript quote). Mimics Dovetail/Adobe inline linking to specific document sections. | High | Requires source text snippets stored in citation objects during generation. `CitationTooltip.jsx` already supports `text` field; pipeline must populate it with actual passage text. | Pipeline already stores citation text in most cases. For SEC filings, the text field would need to contain the actual 10-K paragraph, not just a reference to "10-K Item 7." This is a pipeline improvement more than a UI feature -- the tooltip already renders text. Cost: ~0 additional UI work if pipeline populates citation.text properly. |
| Real-time progress dashboard during generation | Beyond basic progress bar: show which agent is working on which section, agent role names, per-section elapsed time, wave/phase indicators. The PitchDeck `GenerationStatusPanel` already does much of this. | Low | `GenerationStatusPanel` in `PitchDeck.jsx` already built for PD. Needs generalization for OP and FS stages. | Already implemented for Pitch Deck. Generalize `GenerationStatusPanel` into a shared component used by all three stage viewers. Low effort, high perceived value. |
| Cross-section findings aggregation | Show findings that appear across multiple sections (e.g., "insider selling flagged in Management, Moat, and Inversion sections"). `SectionRenderer` already renders `crossCuttingFindings`. A report-level aggregation view would surface patterns. | Medium | Cross-cutting findings data in report JSON, new aggregation component | The per-section `crossCuttingFindings` rendering exists. A report-level "Executive Findings" panel that aggregates all cross-section issues would help the PM see the full picture without reading every section. |
| Sensitivity table integration in Valuation section | Interactive heat-map-style tables varying FGR, EPS, CapEx across methods. `SensitivityTable.jsx` already renders these with color coding. Needs wiring into report Valuation section. | Low | `SensitivityTable.jsx` (built), valuation data from report JSON | Component exists and is production-ready. Just needs data extraction from the Pitch Deck valuation section's `data` and `tables` fields. |
| Section collapse/expand for completed reports | Long reports (10+ sections) benefit from collapsible sections. Show summary + verdict inline, expand for full narrative. `CollapsibleSection.jsx` already exists. | Low | `CollapsibleSection.jsx`, wrapper in stage viewers | Very low effort. Wrap `SectionRenderer` in `CollapsibleSection` with summary as the collapsed preview. Useful for re-review of completed reports. |
| Print/export link from report viewer | "Export this to PDF" button in the report header. Pipeline already generates PDF/Word exports. Surface a link to trigger export from the viewer. | Low | Existing PDF/Word generators in `scripts/pdf/`, needs UI trigger button | The heavy work (export generators) is done. UI just needs a button that calls the export script or links to the generated file. |
| Keyboard navigation between sections | Arrow keys or J/K to jump between sections. Power-user feature for rapid report review. | Low | Key event listeners, scroll-to-section logic (already in `handleNavClick`) | Low effort. Add keydown handler that maps Up/Down or J/K to prev/next section scrolling. |

---

## Anti-Features

Features to explicitly NOT build. Either harmful, premature, or wrong for the product.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Inline editing of report content | Reports are AI-generated research artifacts. Allowing direct text editing destroys the audit trail and makes citations unreliable. The PM reviews and approves/rejects -- they do not rewrite analyst output. A hedge fund PM does not rewrite analyst memos; they send them back with notes. | Rejection notes field on the approval bar. If rejected, re-generate with feedback. |
| Real-time token-by-token streaming of section text | The report sections are generated as complete structured JSON objects (not streaming text). Token-by-token rendering would require restructuring the entire pipeline architecture for minimal UX gain. Sections complete in 15-30 seconds each -- the fade-in pattern is sufficient. | Poll-based progress + section-level fade-in (already implemented). Shows "Agent working..." placeholder, then complete section appears with animation. |
| Multi-tab report viewing (multiple tickers open simultaneously) | Desktop app with 1400px max-width. Multiple simultaneous reports creates tab management overhead with no research benefit. Analysts compare companies via the Competitors tab, not by reading two reports side by side. | Single report view with easy navigation back to ReportsList. The Toolbox tabs already allow switching between data views for one company. |
| Automated re-scoring when assumptions change | Tempting to make the Assumption Tracker editable and re-run valuation calculations when FGR changes. This is premature optimization -- the valuation calculators in the Toolbox already do this interactively. Duplicating that logic in the report viewer creates two sources of truth. | Read-only Assumption Tracker in V1. User adjusts assumptions in Valuation tab, regenerates if needed. |
| Comment/annotation threading on sections | Collaborative features for a single-user app. There is no second user to collaborate with. The PM's feedback mechanism is the approval gate, not inline comments. | Rejection notes + re-generation feedback loop. |
| Animated chart rendering during generation | Charting during streaming/generation is technically complex and provides no analytical value. Charts should render from complete data only. | Render charts after section completion. Use placeholder/skeleton during generation. |
| Version diff view between report iterations | Comparing two iterations of a report line-by-line (like a git diff) is technically interesting but analytically useless. Investment theses change holistically, not line-by-line. The PM cares about "did the verdict change?" not "which paragraph was reworded." | Show verdict/confidence delta between versions (e.g., "Verdict changed: WATCHLIST -> PASS"). A simple comparison card, not a full diff view. |
| Drag-and-drop section reordering | Sections follow the Rule One curriculum sequence. Reordering them violates the methodology's progressive disclosure design. The sequence IS the analytical framework. | Fixed section order matching the curriculum templates exactly. |

---

## Feature Dependencies

```
SectionRenderer (DONE) --> OnePager (DONE)
SectionRenderer (DONE) --> PitchDeck (DONE)
SectionRenderer (DONE) --> FullStory (NOT BUILT)

CitationTooltip (DONE) --> SectionRenderer (DONE)
VerdictBadge (DONE) --> SectionRenderer (DONE)
ConfidenceBadge (DONE) --> SectionRenderer (DONE)
RedFlagCallout (DONE) --> SectionRenderer (DONE)

FullStory.jsx --> ChecklistRenderer (NOT BUILT)
FullStory.jsx --> DebateRenderer (NOT BUILT)
FullStory.jsx --> useFullStory hook (NOT BUILT)
FullStory.jsx --> SectionRenderer (DONE, reused)
FullStory.jsx --> GenerationStatusPanel (exists in PitchDeck, needs extraction)

Stage Gating --> OnePager approval (DONE) --> PitchDeck unlock
Stage Gating --> PitchDeck approval (NOT BUILT) --> FullStory unlock

ReportsList --> Route structure for /research/:id/one-pager (DONE)
ReportsList --> Route structure for /research/:id/pitch-deck (PARTIAL)
ReportsList --> Route structure for /research/:id/full-story (NOT BUILT)

GenerationStatusPanel (in PitchDeck) --> extract to shared component
DeepDivePanel (built) --> AI call integration or pre-computed content
AssumptionTracker (built) --> data wiring from report JSON
IndustryCard (built) --> glossary data source + term detection
```

---

## MVP Recommendation

### Phase 1: Complete the Core Viewers (HIGH priority)

Prioritize (builds on what exists, fills critical gaps):

1. **Full Story viewer** (`FullStory.jsx`) -- 6 sections + debate rendering. This is the only stage without a display component. Without it, Full Story output exists only as JSON files. Reuse `SectionRenderer` for standard sections, build new `ChecklistRenderer` for scored checklists and `DebateRenderer` for the adversarial debate.

2. **Checklist rendering** -- The 43-item scored checklists (Meaning 15pt, Moat 15pt, Management 13pt) are the backbone of the Full Story. Each item has: question, verdict (PASS/PARTIAL/FAIL), confidence, evidence, and red flags. Render as scored tables with color-coded status, aggregate score display, and expandable evidence rows.

3. **Debate rendering** -- The adversarial debate (9 exchanges x 4 steps = 36 content blocks) needs a purpose-built renderer. Each exchange should show: topic, Bull argument, Bear argument, Bull Rebuttal (with strength self-assessment), Judge Verdict (with direction: Strong Bull/Strong Bear/Unresolved/Mixed). A verdict summary table at the top shows all exchanges at a glance (this table already exists in the narrative markdown but should be a structured component).

4. **Stage gating wiring** -- Connect PitchDeck approval to FullStory unlock. Add approval bar to PitchDeck. Add route guards that prevent navigating to locked stages.

### Phase 2: Extract and Generalize (MEDIUM priority)

5. **Extract `GenerationStatusPanel`** from PitchDeck into a shared component usable by all three stage viewers. Parameterize section definitions and phase labels.

6. **Wire delight feature shells** -- The DeepDivePanel, AssumptionTracker, and IndustryCard components are built but not wired to real data. Connect them to report JSON data:
   - AssumptionTracker: extract `assumptions` array from report JSON
   - IndustryCard: build static glossary JSON (~100 financial terms), add term detection to narrative rendering
   - DeepDivePanel: populate with pre-computed deep-dive content from generation (defer on-demand AI calls)

7. **Report navigation for all stages** -- Extend ReportsList to show stage progression per ticker (OP -> PD -> FS with status indicators). Add sub-navigation tabs within a report for switching between stages.

### Phase 3: Polish (LOWER priority)

Defer: Bull/Bear toggle, version comparison cards, keyboard navigation, export button. These are valuable but not blocking for the core report consumption workflow.

---

## Adversarial Debate Display: Design Recommendation

The debate is the most complex rendering challenge in the Full Story. Based on the actual SFM data structure examined:

**Data shape per exchange:**
```
Exchange N: [Topic]
  BULL: [argument with sources]
  BEAR: [argument with sources and citation URLs]
  BULL REBUTTAL: [rebuttal with strength self-assessment]
  JUDGE: [verdict: Strong Bull | Strong Bear | Unresolved | Mixed]
```

**Recommended display pattern:**

1. **Verdict Summary Table** (top) -- All exchanges in a scored grid: #, Topic, Verdict, Bull Strength, Bear Strength. Color-coded rows (green = Strong Bull, red = Strong Bear, yellow = Unresolved). This gives the PM a 10-second overview before reading any detail.

2. **Exchange Accordion** (below table) -- Each exchange is a collapsible card. Header shows: exchange number, topic, verdict badge, strength indicators. Expand to see the full 4-step exchange.

3. **Within each exchange:** Two-column layout for Bull (left, green tint) vs Bear (right, red tint). Bull Rebuttal and Judge Verdict span full width below. Judge verdict gets a highlighted callout with direction and reasoning.

4. **Citation handling within debate:** Bear arguments contain web search citation URLs. These should render as clickable links (not the [N] tooltip pattern used elsewhere) because they are external URLs, not internal DataPacket references.

This pattern borrows from Morgan Stanley's Bull/Bear Investment Cases format -- structured opposing arguments with explicit verdict calls -- but adds the interactive accordion pattern for managing information density.

---

## Scored Checklist Display: Design Recommendation

Based on the Full Story data (43 items across 3 checklists):

**Recommended display:**

1. **Aggregate score header** -- "Meaning: 15/15 PASS" or "Moat: 6/15 PASS, 8 PARTIAL, 1 FAIL" with a mini progress bar showing the ratio.

2. **Item rows** -- Vertical list with: item number, question text, status badge (PASS green / PARTIAL yellow / FAIL red), confidence level. Click to expand evidence and red flags per item.

3. **Conditional formatting** -- FAIL items get a red left border. PARTIAL items get a yellow left border. PASS items get a green left border or no special treatment (let failures stand out).

This mirrors how rubric-based assessment UIs work: aggregate score at top, drill into individual items, failures highlighted.

---

## Sources

Research sources informing these recommendations:

- [ShapeofAI - Citation UI Patterns](https://www.shapeof.ai/patterns/citations) -- Four citation variants, design principles, product examples (Perplexity, Adobe, Dovetail, Granola)
- [Hebbia - What Makes a Good Equity Research Report](https://www.hebbia.com/resources/equity-research-report) -- Iterative source decomposition, clickable in-line citations, audit trail requirements
- [Perplexity Platform Guide - Citation-Forward Answers](https://www.unusual.ai/blog/perplexity-platform-guide-design-for-citation-forward-answers) -- Inline footnote numbers, expandable snippets, Sources panel
- [thefrontkit - Streaming UI in AI Applications](https://thefrontkit.com/blogs/what-is-streaming-ui-in-ai-applications) -- Skeleton placeholders, progressive rendering, anti-patterns (layout thrashing, flickering)
- [AG-UI Real-Time Streaming Guide](https://medium.datadriveninvestor.com/production-grade-agentic-apps-with-ag-ui-real-time-streaming-guide-2026-5331c452684a) -- Start events create placeholders, UI renders incrementally
- [NN/g Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/) -- Reduce cognitive load by revealing information as users need it
- [Morningstar Direct vs Bloomberg Terminal](https://www.institutionalinvestor.com/article/2b1c7fywh59l7zinwr280/ria-intel/morningstar-debuts-new-bloomberg-like-research-portal-built-for-financial-advisors) -- Presentation Studio for custom visualizations, customizable reporting
- [Scrollspy Demystified](https://blog.maximeheckel.com/posts/scrollspy-demystified/) -- IntersectionObserver implementation patterns for section tracking
- [The Inferential Investor - Bull & Bear Case Workups](https://www.inferentialinvestor.com/p/bull-and-bear-investment-case-workups) -- Structured opposing arguments with explicit "must-be-true conditions"
- Existing Thes1s codebase: `SectionRenderer.jsx`, `OnePager.jsx`, `PitchDeck.jsx`, `CitationTooltip.jsx`, SFM Full Story fixture data
