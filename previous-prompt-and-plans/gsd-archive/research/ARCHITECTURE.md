# Architecture Patterns: Report Stage UI Integration

**Domain:** In-app display layer for AI-generated research reports (One Pager, Pitch Deck, Full Story)
**Researched:** 2026-04-01
**Confidence:** HIGH (existing codebase fully analyzed, pipeline outputs inspected, component patterns verified)

## Executive Summary

This document defines how the report stage viewers integrate with the existing Thes1s desktop app architecture. The existing codebase already has substantial infrastructure in place: OnePager.jsx (557 lines, fully functional), PitchDeck.jsx (~1100 lines, fully functional with delight features), SectionRenderer.jsx (594 lines), and 6 shared badge/callout/citation components. The FullStory viewer and several integration improvements are the primary remaining work.

**Key finding: The architecture is further along than the milestone context suggests.** OnePager and PitchDeck are not "planned" -- they are shipped and working. The real work for v1.3 is: (1) FullStory.jsx with debate rendering and scored checklists, (2) section key normalization between pipeline output and components, (3) the `/api/thes1s/reports` endpoint extension for full-story.json, and (4) ReportsList enhancements to show all three stages.

**Critical data mismatch discovered:** The PitchDeck component's `SECTION_DEFS` uses different keys than the pipeline output. For example, the component expects `simple_predictable` but the pipeline writes `simple_and_predictable`. There are 5 such mismatches across 10 sections. This must be resolved before any further PD work.

---

## Current State Inventory

### What Already Exists (Shipped)

| Component | LOC | Status | What It Does |
|-----------|-----|--------|-------------|
| `OnePager.jsx` | 557 | **Working** | Hero header, sticky nav, 6 sections via SectionRenderer, IntersectionObserver scroll spy, progress polling, approval bar, citation reference list |
| `PitchDeck.jsx` | ~1100 | **Working** | 10-section two-column layout, phase progress indicator (3 phases), generation status panel, checkpoint display, delight features (DeepDive, AssumptionTracker, IndustryCard) |
| `SectionRenderer.jsx` | 594 | **Working** | Universal section display: header with number/title/verdict/confidence badges, summary callout, verdict rationale with inline citations, narrative with markdown parsing, data grid with smart formatting and grouping, tables, cross-cutting findings, red flags, per-section citations |
| `VerdictBadge.jsx` | 68 | **Working** | PASS/FAIL/WATCHLIST/REVIEW pill badges with icons |
| `ConfidenceBadge.jsx` | 32 | **Working** | HIGH/MEDIUM/LOW confidence indicators |
| `RedFlagCallout.jsx` | 61 | **Working** | Yellow warning box with flag list |
| `CitationTooltip.jsx` | 135 | **Working** | Inline [N] citation references with hover tooltips, source type detection (thes1s/sec/web), `renderTextWithCitations` utility |
| `SensitivityTable.jsx` | 161 | **Working** | Color-coded valuation matrix with intersection highlighting |
| `DeepDivePanel.jsx` | 179 | **Working** | Right-side slide-out panel (440px), loading state, Escape/click-outside close |
| `AssumptionTracker.jsx` | 223 | **Working** | Right-side panel (360px) listing assumptions with confidence bars |
| `IndustryCard.jsx` | 124 | **Working** | Absolute-positioned popover glossary for industry terms |
| `ReportsList.jsx` | 193 | **Working** | Lists tickers with generated reports, auto-creates research entries, navigates to one-pager |
| `useOnePager.js` | 99 | **Working** | Fetch + poll hook for one-pager.json and progress.json |
| `usePitchDeck.js` | 126 | **Working** | Fetch + poll hook for pitch-deck.json, progress.json, and generation-status.json |

### What Needs to Be Built

| Component | Why | Complexity |
|-----------|-----|------------|
| `FullStory.jsx` | Stage 3 viewer -- 6 sections + debate rendering + scored checklists | High |
| `fullStory/DebateRenderer.jsx` | 4-step adversarial debate display (Bull/Bear/Rebuttal/Judge) | Medium |
| `fullStory/ChecklistRenderer.jsx` | Scored checklist display (15+15+13 items with verdicts) | Medium |
| `useFullStory.js` | Fetch + poll hook for full-story-api.json | Low (clone usePitchDeck pattern) |
| Vite middleware extension | Add `full-story` to `thes1sReportsPlugin` fileMap | Trivial |

### What Needs to Be Modified

| Component | Change | Why |
|-----------|--------|-----|
| `PitchDeck.jsx` SECTION_DEFS | Normalize keys to match pipeline output | 5 key mismatches prevent section rendering |
| `ReportsList.jsx` | Show all 3 stages per ticker, stage badges, navigate to correct stage | Currently only shows One Pager |
| `App.jsx` route for full-story | Replace StagePlaceholder with FullStory component | Currently a placeholder |
| `vite.config.js` thes1sReportsPlugin | Add `full-story` file type mapping | API endpoint doesn't serve full-story.json |

---

## Data Flow: Pipeline Output to Display

### Flow Diagram

```
Pipeline (CLI)                    File System              Vite Middleware           React App
==============                    ===========              ==============           =========

scripts/pipeline/                 .thes1s/reports/         /api/thes1s/             Components
  pipelineManager.js  ──write──>  MNST/                   reports/                 
  onePagerPipeline.js             ├── one-pager.json  ──>  /MNST/one-pager  ──>    useOnePager ──> OnePager.jsx
  pitchDeckPipeline.js            ├── pitch-deck.json ──>  /MNST/pitch-deck ──>    usePitchDeck ──> PitchDeck.jsx
  fullStoryPipeline.js            ├── full-story-api.json  /MNST/full-story ──>    useFullStory ──> FullStory.jsx
                                  ├── progress.json   ──>  /MNST/progress   ──>    (all hooks poll)
                                  ├── generation-status.json /MNST/generation-status (PD/FS only)
                                  ├── budget.json
                                  ├── data-packet.json
                                  ├── quality/
                                  │   ├── pitch-deck-v4.quality.json
                                  │   └── full-story-v4.quality.json
                                  └── sections/
                                      ├── fullStory-S1-event_analysis.json
                                      └── debate-step-{1-4}.json
```

### Data Flow Steps

1. **Pipeline writes JSON files** to `.thes1s/reports/{TICKER}/`. Each stage has a consolidated output file (`one-pager.json`, `pitch-deck.json`, `full-story-api.json`) plus a `progress.json` for real-time status.

2. **Vite dev middleware** (`thes1sReportsPlugin` in `vite.config.js`) serves these files over HTTP at `/api/thes1s/reports/{TICKER}/{file-type}`. This is a simple file-read proxy -- no transformation, no caching.

3. **React hooks** (`useOnePager`, `usePitchDeck`, `useFullStory`) fetch the report JSON and progress JSON on mount. If `progress.state !== 'COMPLETE'`, they poll every 2 seconds.

4. **React components** receive the report data and render sections via `SectionRenderer`. Each section is a card with header, badges, summary, narrative, data grid, tables, and citations.

### No WebSocket, No File Watcher

The current architecture uses **polling** (2-second intervals via `setTimeout`). This is the correct pattern for this app because:

- Pipeline runs are triggered externally (CLI), not from the browser
- Polling is simple, reliable, and works identically in Vite dev and Tauri production
- A full pipeline run takes 5-15 minutes -- 2-second polling is negligible overhead
- No need for WebSocket server or file watcher complexity

### No In-App Generation Trigger

Generation is triggered from Claude Code CLI (`/generate:one-pager TICKER`), not from the browser UI. The app is a **viewer** for pipeline output, not a pipeline launcher. The empty states correctly tell users to run the CLI command.

Future milestone consideration: An in-app "Generate" button could invoke the pipeline via Tauri IPC (Rust shell exec), but this is out of scope for v1.3.

---

## Report JSON Schema (Canonical)

All three stages share a common section schema. The differences are in the top-level metadata and stage-specific content.

### Common Section Schema

```typescript
interface Section {
  key: string;                    // e.g., 'company_info', 'radar', 'event_analysis'
  title: string;                  // Human-readable title
  sectionNumber: number;          // 1-indexed position
  status: string;                 // 'complete' | 'failed'
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  verdict: 'PASS' | 'FAIL' | 'WATCHLIST' | 'REVIEW';
  verdictRationale: string;       // Primary prose explaining the verdict
  summary: string;                // Bullet or short-form summary for callout box
  data: Record<string, any>;      // Structured KV pairs (smart-formatted by SectionRenderer)
  narrative: string;              // Extended markdown narrative
  citations: Citation[];          // Array of citation objects
  tables: Table[];                // Array of table objects (title, headers, rows)
  charts: any[];                  // Chart data (not yet rendered)
  redFlags: string[];             // Warning items
  primarySourceInsights: any;     // Insights from 10-K/transcript reading
  crossCuttingFindings: Finding[];// Cross-section findings with severity
  searchesPerformed: string[];    // Web searches the agent ran
  modelUsed: string;              // e.g., 'claude-sonnet-4-20250514'
  tokenCost: { input: number, output: number };
}

interface Citation {
  id: number;                     // 1-indexed reference number
  source: string;                 // Source description
  text: string;                   // Citation content
  url?: string;                   // Web URL if applicable
  note?: string;                  // Additional context
  title?: string;                 // Alternative to text
}

interface Table {
  title?: string;
  headers?: string[];
  rows: (string | number | null)[][];
}

interface Finding {
  finding: string;
  source?: string;
  severity: 'high' | 'medium' | 'low';
}
```

### Stage-Specific Top-Level Schema

**One Pager** (`one-pager.json`):
```typescript
{
  ticker: string;
  companyName: string;
  stage: 'one-pager';
  generatedAt: string;           // ISO timestamp
  sections: Section[];           // 6 sections
  overallVerdict: string;        // 'PASS' | 'FAIL' | 'WATCHLIST'
  sectionKeys: string[];         // Ordered keys for nav
}
```

**Pitch Deck** (`pitch-deck.json`):
```typescript
{
  ticker: string;
  stage: 'pitch-deck';
  completedAt: string;
  pipelineTimeSeconds: number;
  sectionCount: number;
  errorCount: number;
  sections: Section[];           // 10 sections
  budget: Budget;                // Cost tracking
  cacheStats: any;
  errors: any[];
  // NOTE: No companyName, no overallVerdict at top level
  // NOTE: No assumptions at top level (delight feature can't populate)
}
```

**Full Story** (`full-story-api.json`):
```typescript
{
  ticker: string;
  stage: 'full-story';
  completedAt: string;
  pipelineTimeSeconds: number;
  sectionCount: number;
  errorCount: number;
  sections: Section[];           // 6 sections (with checklist data in .data)
  budget: Budget;
  cacheStats: any;
  errors: any[];
  debateOutputs: {
    bull: DebateStep;            // { step, role, agent, content: { thesisPoints, overallThesis } }
    bear: DebateStep;            // { step, role, agent, content: { inversions, overallBearCase } }
    bull_rebuttal: DebateStep;   // { step, role, agent, content: { rebuttals } }
    judge: DebateStep;           // { step, role, agent, content: { exchanges, overallVerdict } }
  }
}

// Checklist section .data shape:
{
  checklistType: string;          // 'meaning' | 'moat' | 'management'
  items: ChecklistItem[];         // 13-15 items
  summary: string;
}

interface ChecklistItem {
  number: number;
  item: string;                   // The checklist question
  verdict: 'PASS' | 'FAIL' | 'PARTIAL';
  evidence: string;               // Supporting evidence
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}
```

---

## Critical Data Mismatches to Resolve

### PitchDeck Section Key Mismatch

The `SECTION_DEFS` in PitchDeck.jsx uses keys that don't match the pipeline output:

| PitchDeck.jsx SECTION_DEFS | Pipeline Output (pitch-deck.json) | Fix |
|----------------------------|-----------------------------------|-----|
| `simple_predictable` | `simple_and_predictable` | Update SECTION_DEFS |
| `barriers_moats` | `barriers_and_moats` | Update SECTION_DEFS |
| `roe_roic_debt` | *(missing from pipeline)* | Pipeline has no separate section -- merged into others |
| `pest` | `pest_risks` | Update SECTION_DEFS |
| `valuation` | `valuation_summary` | Update SECTION_DEFS |
| *(no equivalent)* | `overall_verdict` | Add to SECTION_DEFS |

**Consequence of current state:** PitchDeck.jsx renders only 5 of 10 sections (radar, market_position, fcf, management, balance_sheet). The other 5 show as "Pending..." because `sectionMap[def.key]` returns `undefined` for the mismatched keys.

**Fix:** Update `SECTION_DEFS` to match pipeline output keys. The pipeline is the source of truth -- the component adapts to it, not the other way around.

### PitchDeck Missing Top-Level Fields

The pitch-deck.json has no `companyName` or `overallVerdict` at the top level (unlike one-pager.json which has both). The PitchDeck component accesses `pitchDeckData?.overallVerdict` and `pitchDeckData?.companyName` -- both return `undefined`.

**Fix options:**
1. Add these fields to the pipeline output (preferred -- all stages should have consistent top-level metadata)
2. Fall back to the `overall_verdict` section's verdict in the component
3. Pull `companyName` from the report object (already done as fallback)

### Full Story File Type Not in Vite Middleware

The `thes1sReportsPlugin` in vite.config.js has a `fileMap` that maps URL file types to filesystem filenames:

```javascript
const fileMap = {
  'one-pager': 'one-pager.json',
  'pitch-deck': 'pitch-deck.json',
  'progress': 'progress.json',
  'generation-status': 'generation-status.json',
};
```

`full-story` is not mapped. The fix is trivial: add `'full-story': 'full-story-api.json'` to this map.

---

## Component Architecture

### Routing Structure

Current routing in App.jsx:

```
/research                          → ResearchRedirect (→ last report or empty)
/research/:id                      → Toolbox (8 data tabs)
/research/:id/one-pager            → OnePager
/research/:id/pitch-deck           → PitchDeck
/research/:id/full-story           → StagePlaceholder (→ FullStory)
/reports                           → ReportsList
```

This routing is correct and requires minimal changes. The `/research/:id/full-story` route just needs the placeholder replaced with the real `FullStory` component.

**Navigation flow:**
1. User lands on `/reports` (Reports tab in top nav) and sees all generated reports
2. Click a report → navigates to `/research/:id/one-pager` (or appropriate stage)
3. From any stage view, the user can navigate between stages
4. The `/research/:id` route (Toolbox) is the data exploration view -- independent of report stages

**Key insight:** Report stages and Toolbox tabs are separate concerns. The Toolbox shows raw data. Report stages show AI-generated analysis. They're accessed via different routes, not different tabs within the same container.

### Report Stage Navigation (New Component Needed)

There is no in-app way to navigate between stages for the same ticker. Once viewing a One Pager, the user has no UI to get to the Pitch Deck (other than manually editing the URL).

**Recommendation: StageNavBar component**

A sub-nav bar below the main Layout header that appears on all `/research/:id/*` routes. Shows:
- Stage tabs: One Pager | Pitch Deck | Full Story
- Stage status: approval badge, lock icon for gated stages
- Toolbox link (back to data view)

This should be a new shared component rendered within `OnePager`, `PitchDeck`, and `FullStory` (or via a wrapper route layout).

### Component Hierarchy

```
App.jsx
├── Layout.jsx (52px top nav)
│   ├── /research/:id/one-pager → OnePager.jsx
│   │   ├── StageNavBar (new)
│   │   ├── ReportHero (shared pattern, currently inline)
│   │   ├── ProgressBar (shared pattern, currently inline)
│   │   ├── StickyNav (shared pattern, currently inline)
│   │   └── SectionRenderer.jsx (6x)
│   │       ├── VerdictBadge.jsx
│   │       ├── ConfidenceBadge.jsx
│   │       ├── CitationTooltip.jsx
│   │       └── RedFlagCallout.jsx
│   │
│   ├── /research/:id/pitch-deck → PitchDeck.jsx
│   │   ├── StageNavBar (new)
│   │   ├── ReportHero
│   │   ├── PhaseProgressIndicator
│   │   ├── GenerationStatusPanel
│   │   ├── StickyNav + SectionRenderer (10x)
│   │   ├── DeepDivePanel.jsx
│   │   ├── AssumptionTracker.jsx
│   │   └── IndustryCard.jsx
│   │
│   ├── /research/:id/full-story → FullStory.jsx (new)
│   │   ├── StageNavBar (new)
│   │   ├── ReportHero
│   │   ├── StickyNav + SectionRenderer (6x)
│   │   │   ├── ChecklistRenderer.jsx (new, for 3 checklist sections)
│   │   │   └── Standard SectionRenderer (for other 3 sections)
│   │   ├── DebateRenderer.jsx (new)
│   │   └── ApprovalBar
│   │
│   └── /reports → ReportsList.jsx
```

### Shared Patterns vs Duplication

OnePager and PitchDeck have significant code duplication:
- `formatTitle()` -- identical in both
- `formatRelativeTime()` -- identical in both
- `stateToLabel()` -- identical in both
- `Spinner` component -- identical in both
- `injectSpinnerStyle()` -- identical in both
- `verdictDotColor()` -- identical in both
- Approval bar JSX -- very similar in both
- Sticky nav JSX -- very similar in both
- Progress bar JSX -- very similar in both

**Recommendation: Extract shared utilities, but don't over-abstract.**

Extract to `src/utils/reportHelpers.js`:
- `formatTitle()`
- `formatRelativeTime()`
- `stateToLabel()`
- `verdictDotColor()`
- `computeSectionStatuses()`
- `computePercentage()`

Extract to shared components:
- `Spinner.jsx` (already tiny)
- `StageNavBar.jsx` (new)

Do NOT extract ReportHero, StickyNav, ProgressBar, or ApprovalBar into shared components. These have subtle per-stage differences (PD has phase progress, OP has different hero layout, FS needs debate verdict in hero). Premature abstraction creates rigid constraints that fight the stage-specific needs.

---

## FullStory.jsx Architecture

### Section Definitions

Based on the actual `full-story-api.json` output:

```javascript
const SECTION_DEFS = [
  { key: 'event_analysis', label: 'Event Analysis' },
  { key: 'meaning_checklist', label: 'Meaning Checklist', isChecklist: true },
  { key: 'moat_checklist', label: 'Moat Checklist', isChecklist: true },
  { key: 'management_checklist', label: 'Management Checklist', isChecklist: true },
  { key: 'valuation_confirmation', label: 'Valuation Confirmation' },
  { key: 'inversion_rebuttal', label: 'Inversion & Rebuttal' },
];
```

### Checklist Rendering

Three of the six sections contain scored checklists (Meaning 15pt, Moat 15pt, Management 13pt). Each checklist item has `{ number, item, verdict, evidence, confidence }`.

The checklist data lives in `section.data.items[]` -- not in `section.tables`. SectionRenderer's data grid format (`key: value` pairs) is wrong for this. A dedicated `ChecklistRenderer` is needed.

**ChecklistRenderer design:**
- Each item is a row: number | question text | verdict badge | confidence badge
- Expand/collapse for evidence text
- Score summary: X/Y PASS, Z PARTIAL, W FAIL
- Color-coded verdict dots in the sticky nav

### Debate Rendering

The adversarial debate is a top-level field (`debateOutputs`), not a section. It has 4 steps:

1. **Bull** (`thesisPoints[]` + `overallThesis`) -- Each point has `{ point, evidence }`
2. **Bear** (`inversions[]` + `overallBearCase`) -- Each inversion is a counter-argument
3. **Bull Rebuttal** (`rebuttals[]`) -- Point-by-point responses to bear case
4. **Judge** (`exchanges[]` + `overallVerdict`) -- Topic-by-topic ruling with `{ topic, bullStrength, bearStrength, verdict, reasoning }`

**DebateRenderer design:**
- Tab or toggle view: Bull | Bear | Rebuttal | Judge
- Exchange-based view: Show each topic with Bull/Bear/Judge side by side
- Judge verdict banner: direction (Bull/Bear), unresolvedCount, summary
- Color coding: Bull arguments in green accent, Bear in red, Judge in neutral

**Placement:** After all 6 sections, before the approval bar. The debate is the culminating analysis that informs the final verdict.

### Gate Logic

FullStory requires PitchDeck approval. The gate check follows the same pattern as PitchDeck (which gates on OnePager):

```javascript
const pitchDeckApproved = report?.stageApprovals?.pitchDeck === 'approved';
if (!pitchDeckApproved && !fullStoryData && !progress) {
  return <GateLockMessage />;
}
```

---

## Patterns to Follow

### Pattern 1: Hook-Mediated Data Flow (Existing)
**What:** Hooks fetch data and manage polling; components are pure renderers.
**When:** Always -- every data-fetching component follows this.
**Example:** `useOnePager(ticker)` returns `{ report, progress, loading, error }`.

### Pattern 2: File-Based Report Serving (Existing)
**What:** Pipeline writes JSON to `.thes1s/reports/`, Vite middleware serves it, hooks fetch via `/api/thes1s/reports/`.
**When:** All report data.
**Why:** No WebSocket, no file watcher, no complex state sync. Pipeline writes files, app reads them. Polling bridges the gap during generation.

### Pattern 3: SectionRenderer for Standard Sections (Existing)
**What:** A single renderer handles header, badges, summary, narrative, data, tables, citations, red flags.
**When:** Any section that fits the standard schema.
**Caveat for FullStory:** Checklist sections need a custom renderer because their `data.items[]` structure doesn't fit the KV-pair data grid.

### Pattern 4: IntersectionObserver Scroll Spy (Existing)
**What:** `IntersectionObserver` with threshold 0.3 and rootMargin '-80px 0px -60% 0px' tracks which section is in view, updates sticky nav active state.
**When:** All stage viewers with sticky nav.
**Reuse:** Same observer config for FullStory.

### Pattern 5: Inline Styles via C Palette (Existing)
**What:** All styling through inline styles reading from the mutable `C` theme object.
**When:** Always. No CSS files, no CSS-in-JS.
**Pattern:** `style={{ color: C.text, background: C.bgCard, border: '1px solid ' + C.border }}`

### Pattern 6: Progressive Rendering During Generation (Existing)
**What:** Sections fade in as they complete. Pending sections show skeleton placeholders. Running sections show spinner with agent name.
**When:** Any stage viewer that supports real-time generation progress.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Over-Abstracting Stage Components
**What:** Creating a `StageViewer` base component that all three stages extend.
**Why bad:** Each stage has distinct layout needs -- OP is simple, PD has phases and delight panels, FS has checklists and debates. A generic base creates constraint wars.
**Instead:** Share utilities and small leaf components. Keep stage containers independent.

### Anti-Pattern 2: Storing Report Data in useResearch/localStorage
**What:** Putting the full report JSON into the `stock-analyzer-reports` localStorage entry.
**Why bad:** Report JSON is large (pitch-deck.json is 414KB, full-story-api.json is 326KB). localStorage has a ~5MB limit. Two full reports would exhaust it.
**Instead:** Reports stay in `.thes1s/reports/` on the file system, served via the Vite middleware. The `useResearch` hook stores only metadata (stage, approvals, notes).

### Anti-Pattern 3: Transforming Pipeline Output in the Component
**What:** Writing complex data transformation logic inside the React component to reshape pipeline JSON.
**Why bad:** Makes components harder to test and debug. Couples rendering to data format.
**Instead:** Accept the pipeline output as-is. If the schema needs transformation, do it in the hook or a dedicated adapter function.

### Anti-Pattern 4: Building a WebSocket Server for Real-Time Updates
**What:** Adding a WebSocket server to push generation progress.
**Why bad:** Adds infrastructure complexity to a desktop app that has no server. The polling pattern works and matches the existing OnePager/PitchDeck hooks.
**Instead:** Poll every 2 seconds. It's proven, simple, and consistent.

---

## Suggested Build Order

Dependencies flow downward -- each phase builds on the previous.

### Phase 1: Foundation Fixes (Day 1)

**Why first:** These are bugs/mismatches that affect existing functionality. Fix them before building new things.

1. **Fix PitchDeck SECTION_DEFS** -- Update all 5 mismatched section keys to match pipeline output. Verify all 10 sections render.
2. **Add `full-story` to Vite middleware** -- One line: `'full-story': 'full-story-api.json'` in the `fileMap`.
3. **Add `companyName` and `overallVerdict` to PD/FS pipeline output** -- Or add fallback logic in components. Decide which approach.

### Phase 2: Shared Infrastructure (Day 1-2)

**Why second:** FullStory needs these, and extracting them now prevents more duplication.

4. **Extract `src/utils/reportHelpers.js`** -- Move duplicated pure functions from OnePager and PitchDeck.
5. **Create `StageNavBar.jsx`** -- Sub-navigation between stages. Renders on all stage routes.
6. **Create `useFullStory.js`** -- Clone `usePitchDeck.js` pattern, adjust endpoint to `full-story`.

### Phase 3: FullStory Core (Day 2-3)

**Why third:** Build the main component with standard section rendering first, add specialized renderers next.

7. **Create `FullStory.jsx`** -- 6 sections, gate check on PD approval, hero header, sticky nav, approval bar. Use SectionRenderer for all sections initially.
8. **Wire into `App.jsx`** -- Replace StagePlaceholder with FullStory component. Import useFullStory.

### Phase 4: Specialized Renderers (Day 3-4)

**Why fourth:** These are the FullStory-specific features that differentiate it from OP/PD.

9. **Create `fullStory/ChecklistRenderer.jsx`** -- Scored checklist display with expand/collapse, verdict counts, per-item evidence.
10. **Create `fullStory/DebateRenderer.jsx`** -- 4-step debate with exchange-based view, Bull/Bear/Judge color coding, verdict banner.
11. **Integrate into FullStory.jsx** -- Replace SectionRenderer with ChecklistRenderer for the 3 checklist sections. Add DebateRenderer after sections.

### Phase 5: ReportsList Enhancement (Day 4)

**Why last:** This is the discovery/navigation layer. It should reflect the complete set of available stages.

12. **Enhance ReportsList.jsx** -- Show all 3 stages per ticker (not just One Pager). Stage badges showing completion status. Navigate to the latest available stage. Show quality scores if available.
13. **Stage navigation from within reports** -- Add StageNavBar to OnePager, PitchDeck, and FullStory so users can move between stages.

### Phase 6: Polish (Day 4-5)

14. **PitchDeck assumption tracker data** -- Pipeline doesn't populate `assumptions` at top level. Either add to pipeline or derive from section data.
15. **FullStory delight features** -- Deep-dive panel reuse, assumption tracker for FS, debate narrative toggle.
16. **Test with all 4 pipeline outputs** -- MNST, SFM, POOL, MSFT -- verify all stages render correctly.

---

## Scalability Considerations

| Concern | Current (4 reports) | At 50 reports | At 200 reports |
|---------|---------------------|---------------|----------------|
| Report listing | Scan .thes1s/reports/ dirs | Same (synchronous fs.readdirSync) | Consider caching dir listing |
| JSON load time | Instant (~400KB) | Same per report | Same -- only loads one at a time |
| localStorage | Metadata only (~2KB/report) | ~100KB total | ~400KB -- well within 5MB limit |
| File system | 17 files per full run | ~850 files | ~3400 files in .thes1s/reports/ |

The architecture scales fine to hundreds of reports. The only concern at very high counts is the ReportsList directory scan, which could be optimized with a manifest file.

---

## Sources

- **Codebase analysis:** Direct inspection of all listed source files in the stock-analyzer repository
- **Pipeline output inspection:** MNST full-story-api.json, pitch-deck.json, one-pager.json structures verified
- **Existing component patterns:** OnePager.jsx, PitchDeck.jsx, SectionRenderer.jsx analyzed for reusable patterns
- **React Router DOM 7.x:** Route structure verified in App.jsx
- **Vite dev middleware:** thes1sReportsPlugin plugin code analyzed in vite.config.js
