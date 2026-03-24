# Phase 05B: One Pager Display Components - Research

**Researched:** 2026-03-24
**Domain:** React UI components, report rendering, citation systems, real-time progress display
**Confidence:** HIGH

## Summary

Phase 05B builds the viewer that renders generated One Pager reports inside the Thes1s desktop app. The core challenge is threefold: (1) rendering structured JSON report data as a rich, scrollable research document with verdict badges, citation tooltips, and red flag callouts; (2) showing real-time generation progress as agents complete their work; and (3) integrating the approval gate that controls stage advancement.

The COST One Pager JSON (`.thes1s/reports/COST/one-pager.json`) is the real render target. Examining it reveals a critical architectural detail: the section JSON contains structured fields (`verdict`, `verdictRationale`, `summary`, `redFlags`, `crossCuttingFindings`, `data`) but the `narrative` and `tables` fields defined in the schema are empty/absent in the actual output. The rich narrative text and markdown tables visible in `one-pager.md` were generated separately by the synthesis-writer. This means the `SectionRenderer` must work with both structured data AND narrative text when available, and gracefully handle sections that have only structured fields.

The existing codebase is 100% inline styles using the mutable `C` palette object. There is no CSS-in-JS library, no CSS files, no component testing infrastructure. All new components must follow this pattern exactly. The project uses React 19, React Router DOM 7, and vitest 4 (engine-level tests only, no component rendering tests).

**Primary recommendation:** Build a `SectionRenderer` component that renders report sections from JSON, a `CitationTooltip` component for the 3-type citation system, a `VerdictBadge` component for PASS/FAIL/WATCHLIST/REVIEW pills, and a `OnePager` page component that replaces the Reports tab route. Progress display requires a bridge between the Node.js file-based progress state and the browser -- use polling of a Vite middleware endpoint that reads `progress.json`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Replace the existing top-level Reports tab (currently ResearchList) with the generated One Pager viewer. All generated reports live here.
- **D-02:** Scrolling page layout with sticky section anchor nav/TOC on the side. All 6 sections visible as you scroll. Verdict badge hero at the top. Reads like a research report.
- **D-03:** Follow existing styling patterns: inline styles with mutable C palette (dark/light), 13px base, Inter font, 1400px max-width, stickeR1 slate + teal accent.
- **D-04:** Colored pill badges with icons. PASS = green pill + checkmark, FAIL = red pill + x, WATCHLIST = amber pill + eye, REVIEW = blue pill + clock. Appears next to each section title AND as a hero badge at top of report.
- **D-05:** Confidence indicators (HIGH/MEDIUM/LOW) displayed alongside verdict badges -- smaller, secondary visual treatment.
- **D-06:** Red flags displayed as inline warning callout boxes at the bottom of each section. Tinted background (amber/red), warning icon, lists all red flags. Visually distinct from narrative -- can't miss them.
- **D-07:** Inline citations render as clickable superscript numbers [1][2] in the narrative text.
- **D-08:** Hover shows tooltip with citation source and value. Click jumps to the citation list at the bottom of the report.
- **D-09:** Three citation types with distinct formatting: (1) Thes1s native -- links to Toolbox tab, (2) SEC filing -- links to SEC.gov/Filings tab, (3) Web search -- opens in browser.
- **D-10:** Every decision traced to verifiable evidence. One click and the user can find where the info came from.
- **D-11:** Inline progress directly in the report view. The One Pager page shows immediately with section placeholders. As each agent completes, its section fades in.
- **D-12:** Progress bar at the top shows overall generation status. Sections still pending show a spinner with the agent name.
- **D-13:** The report builds before the user's eyes -- partial results visible as agents complete. No separate progress page.
- **D-14:** After all sections rendered, an approval bar appears at the bottom (or top). User can Approve or Reject (with notes). Decision persists in stageApprovals.onePager.

### Claude's Discretion
- Section anchor nav/TOC exact design and positioning (left sidebar vs top sticky)
- Table rendering within sections (the generated data has markdown tables)
- Chart rendering approach (schema supports charts but COST One Pager doesn't use them yet)
- Transition animations for sections appearing during generation
- Mobile/responsive behavior (desktop-first, but don't break on resize)

### Deferred Ideas (OUT OF SCOPE)
- Chart rendering within sections -- schema supports it but current One Pagers don't use charts yet
- PDF export of rendered One Pager -- Phase 8
- Version history / regeneration comparison -- Phase 8
- Mobile/tablet responsive layout -- desktop-first
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ONEP-02 | `OnePager.jsx` -- 6-section renderer with verdict badges | Render target JSON analyzed (one-pager.json), report section schema documented, existing component patterns mapped. JSON has 6 sections with structured data; narrative text comes from separate synthesis. |
| ONEP-03 | `StatusBadge.jsx` -- PASS/FAIL/REVIEW/WATCHLIST badges | Existing ScoreBadge patterns in CompanyHeader.jsx and ScoreTable.jsx provide reusable color mapping (C.green/red/yellow). Badge design decisions (D-04, D-05) fully specified. |
| ONEP-04 | `SectionRenderer.jsx` -- reusable section display with inline citations | Citation schema analyzed (CitationSchema from reportSection.js). Current COST data has empty citations arrays -- renderer must handle gracefully. 3-type citation taxonomy documented (D-07 through D-10). |
| ONEP-05 | Real-time progress dashboard during generation | Progress schema analyzed (progress.js). progressState.js is Node-only (uses fs). Browser needs polling bridge via Vite middleware to read progress.json. Section status enum: complete/running/pending/failed. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19.2.0 | UI rendering | Already installed, project standard |
| React Router DOM | 7.13.1 | Route management for /reports → OnePager viewer | Already installed, used in App.jsx |
| Vitest | 4.1.0 | Unit testing for engines and utilities | Already installed, project test runner |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none needed) | - | - | All UI is inline styles with C palette; no additional deps required |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Inline styles | CSS Modules, Tailwind | Project convention is inline styles -- breaking convention would create inconsistency across 30+ components |
| Custom markdown renderer | react-markdown | Would add dependency for table rendering in narrative -- but simple regex + JSX is sufficient for the limited markdown subset (tables, bold, headers) |
| @testing-library/react | Manual test assertions | Would enable component render tests -- but project has no component testing precedent; engine-level tests only |

**Installation:**
```bash
# No new packages needed -- all dependencies already installed
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── components/
│   ├── OnePager.jsx              # ONEP-02: Page component, replaces ResearchList at /reports route
│   ├── SectionRenderer.jsx       # ONEP-04: Reusable section display with narrative, tables, citations, red flags
│   ├── VerdictBadge.jsx          # ONEP-03: PASS/FAIL/WATCHLIST/REVIEW colored pill badges
│   ├── ConfidenceBadge.jsx       # D-05: HIGH/MEDIUM/LOW secondary indicator
│   ├── CitationTooltip.jsx       # D-07/D-08/D-09: Inline [1] with tooltip + jump + 3-type formatting
│   ├── RedFlagCallout.jsx        # D-06: Warning callout box for red flags at section bottom
│   ├── SectionNav.jsx            # D-02: Sticky section anchor nav/TOC
│   ├── ApprovalBar.jsx           # D-14: Approve/Reject bar with notes
│   ├── GenerationProgress.jsx    # D-11/D-12: Progress bar + section placeholders + spinners
│   └── ReportHeader.jsx          # Hero area: overall verdict badge, company info, generation metadata
├── hooks/
│   └── useOnePager.js            # Hook to load one-pager.json + poll progress.json
```

### Pattern 1: Report Data Flow (File System to React)
**What:** Generated reports live in `.thes1s/reports/{TICKER}/` as JSON files on disk. The browser has no direct file system access. A Vite dev middleware or Tauri command bridges this gap.
**When to use:** Always -- this is how all report data reaches the UI.
**Critical detail:** `progressState.js` uses Node.js `fs` module directly. It CANNOT run in the browser. Two options:
1. **Vite middleware endpoint** (recommended for dev): Add `/api/thes1s/reports/:ticker/one-pager` and `/api/thes1s/reports/:ticker/progress` endpoints to `vite.config.js` that read from `.thes1s/reports/` directory.
2. **Tauri IPC command** (for production): Register a Tauri command in Rust that reads report files from disk.

For Phase 5B (dev-first), use Vite middleware. Tauri integration can follow.

**Example:**
```javascript
// vite.config.js -- new middleware plugin
function thes1sReportsPlugin() {
  return {
    name: 'thes1s-reports',
    configureServer(server) {
      server.middlewares.use('/api/thes1s/reports', async (req, res) => {
        const { readFileSync, existsSync } = await import('fs');
        const { join } = await import('path');
        const [, ticker, file] = req.url.split('/');
        const filePath = join(process.cwd(), '.thes1s', 'reports', ticker, `${file}.json`);
        if (!existsSync(filePath)) {
          res.writeHead(404);
          res.end(JSON.stringify({ error: 'Not found' }));
          return;
        }
        const data = readFileSync(filePath, 'utf-8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(data);
      });
    },
  };
}
```

### Pattern 2: Progress Polling for Real-Time Generation Display
**What:** The `useOnePager` hook polls `/api/thes1s/reports/{TICKER}/progress` at regular intervals during generation. Once `state === 'COMPLETE'`, polling stops and the full report loads.
**When to use:** During generation -- D-11/D-12/D-13 require real-time updates.
**Implementation:**
```javascript
// src/hooks/useOnePager.js
export function useOnePager(ticker) {
  const [report, setReport] = useState(null);
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ticker) return;
    let cancelled = false;

    async function loadReport() {
      try {
        const res = await fetch(`/api/thes1s/reports/${ticker}/one-pager`);
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setReport(data);
        }
      } catch { /* silent */ }
      if (!cancelled) setLoading(false);
    }

    async function pollProgress() {
      try {
        const res = await fetch(`/api/thes1s/reports/${ticker}/progress`);
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setProgress(data);
          // If still generating, poll again
          if (data.state !== 'COMPLETE' && !cancelled) {
            setTimeout(pollProgress, 2000);
          } else {
            // Generation complete -- load full report
            loadReport();
          }
        }
      } catch { /* silent */ }
    }

    loadReport();
    pollProgress();
    return () => { cancelled = true; };
  }, [ticker]);

  return { report, progress, loading };
}
```

### Pattern 3: Inline Styles with C Palette (Project Convention)
**What:** Every component uses the mutable `C` object from `theme.js`. No CSS files, no CSS-in-JS.
**When to use:** Always. This is a hard project constraint.
**Example:**
```javascript
import { C } from '../theme';

function VerdictBadge({ verdict }) {
  const colors = {
    PASS: { bg: C.green, text: '#fff', icon: 'check' },
    FAIL: { bg: C.red, text: '#fff', icon: 'x' },
    WATCHLIST: { bg: C.yellow, text: '#fff', icon: 'eye' },
    REVIEW: { bg: C.accent, text: '#fff', icon: 'clock' },
  };
  const { bg, text } = colors[verdict] || colors.REVIEW;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '4px 12px', borderRadius: 9999,
      background: bg, color: text,
      fontSize: 12, fontWeight: 700,
      textTransform: 'uppercase', letterSpacing: '0.04em',
    }}>
      {/* SVG icon */}
      {verdict}
    </span>
  );
}
```

### Pattern 4: Section-Aware Rendering (Structured Data + Narrative)
**What:** The COST one-pager.json sections have structured fields but the `narrative` field is absent. The `one-pager.md` has rich narrative text. The renderer needs to handle both cases.
**When to use:** SectionRenderer must render from structured fields (`summary`, `verdictRationale`, `redFlags`, `data`) AND optionally display narrative prose when present.
**Critical finding from COST data:**
- `narrative` field: absent in all 6 sections
- `tables` field: absent in all 6 sections
- `citations` field: empty array `[]` in all 6 sections
- `data` field: present only in `valuation_summary` (buy prices, FGR)
- `crossCuttingFindings` field: present in all sections, 2-3 items each

The SectionRenderer must:
1. Always render `verdictRationale` as the primary text
2. Always render `summary` as a highlight/callout
3. Render `data` fields as formatted key-value display (valuation section has nested objects with low/high ranges)
4. Render `crossCuttingFindings` as a distinct subsection
5. Render `redFlags` array in a RedFlagCallout
6. Render `narrative` as rich text when present (future reports may include it)
7. Render `citations` as superscript links when present (future reports may include them)
8. Render `tables` as HTML tables when present

### Anti-Patterns to Avoid
- **Building a full markdown parser:** The project doesn't need react-markdown or remark. Narrative text, when present, can be rendered with a lightweight custom renderer that handles bold, headers, tables, and line breaks. The markdown subset used by agents is small and predictable.
- **Reading files directly in browser code:** `progressState.js` uses `fs` -- cannot import in browser. Use Vite middleware or Tauri IPC.
- **Global state library:** The project uses React hooks + localStorage. Don't introduce Redux, Zustand, or any state management library.
- **CSS files or CSS modules:** Project convention is 100% inline styles with `C` palette.
- **Hardcoding section order:** Use `sectionKeys` array from the report JSON or `sectionNumber` field to determine render order.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Scroll spy for section nav | Custom IntersectionObserver from scratch | Well-tested IntersectionObserver hook | Scroll spy is finicky -- debouncing, threshold tuning, and edge cases at top/bottom of page |
| Markdown table parsing | Regex-based table parser | Simple split-based parser for the known table format | Agent output uses standard GFM table format with `|` delimiters -- a simple `split('|')` parser works for this controlled input |
| Tooltip positioning | Manual absolute positioning | CSS-only tooltip with `position: absolute` relative to parent | Tooltip positioning edge cases (viewport overflow) are real but for a desktop-first 1400px-max app, simple positioning suffices |
| Progress polling | WebSocket server | `setInterval` + `fetch` with cleanup | Report generation takes 30-60s with 6 sections. Polling every 2s is 15-30 requests total -- trivially cheap for a local app. WebSockets add complexity for no benefit. |

**Key insight:** This is a desktop app running locally. Performance concerns (polling frequency, bundle size, render optimization) that matter for web apps are irrelevant here. Simplicity and correctness are the priorities.

## Common Pitfalls

### Pitfall 1: Rendering Empty Citation Arrays
**What goes wrong:** Citations array is `[]` in all current COST sections. Building citation UI that crashes or looks broken on empty arrays.
**Why it happens:** The citation system is defined in the schema (CitationSchema) but agents don't populate it yet in One Pager generation. Pitch Deck and Full Story will use it more heavily.
**How to avoid:** Build the full citation system (tooltip, jump-to-reference, 3-type formatting) but make it gracefully invisible when `citations.length === 0`. Test with both empty and populated citation arrays.
**Warning signs:** Testing only with mocked data that has citations, never testing with the real COST JSON.

### Pitfall 2: Stale Progress Data After Generation Completes
**What goes wrong:** Progress polling continues after generation finishes, or the report view doesn't update when progress transitions from `WAVE_1_RUNNING` to `COMPLETE`.
**Why it happens:** The progress file and the report file are written at different times. Progress can show `COMPLETE` before the final assembled `one-pager.json` is written to disk.
**How to avoid:** When progress state becomes `COMPLETE`, wait 500ms then fetch the report. Include retry logic if the report file isn't ready yet.
**Warning signs:** Report shows "loading" forever, or stale section data after regeneration.

### Pitfall 3: Route Conflict Between Reports Tab and Research Tab
**What goes wrong:** D-01 says "replace the existing Reports tab." But `/reports` renders `ResearchList` and `/research/:id` renders `Toolbox`. The Reports tab currently navigates to `/reports`.
**Why it happens:** The current route structure has two related but distinct routes. The decision to replace Reports means changing what `/reports` renders, or redirecting it.
**How to avoid:** The Reports tab should now show generated reports (One Pagers, etc.). The existing `ResearchList` pipeline table can merge into the Research tab or become part of the new Reports view. Plan the route change carefully:
  - `/reports` -- list of generated reports (by ticker)
  - `/reports/:ticker/one-pager` -- the One Pager viewer
  - `/research/:id` -- still the Toolbox (unchanged)
**Warning signs:** Clicking Reports tab shows the old ResearchList, not generated reports.

### Pitfall 4: Missing Narrative Text in Section JSON
**What goes wrong:** Building the SectionRenderer expecting a `narrative` field in every section, then seeing blank sections.
**Why it happens:** The COST one-pager.json sections do NOT have a `narrative` field despite the schema defining one. The rich text in one-pager.md was generated separately.
**How to avoid:** Make the SectionRenderer work with what's available: `verdictRationale` as primary prose, `summary` as highlight, structured `data` fields, `redFlags`, and `crossCuttingFindings`. Treat `narrative` as an optional bonus field that enhances the display when present.
**Warning signs:** Testing with mocked data that always has narrative, then breaking on real data.

### Pitfall 5: Theme Not Applied to New Colors
**What goes wrong:** Verdict badge colors (amber for WATCHLIST, blue for REVIEW) don't exist in the current `C` palette. Using hardcoded hex values that don't switch between light/dark mode.
**Why it happens:** The existing palette has `C.green`, `C.red`, `C.yellow`, and `C.accent` (teal) -- but no amber or blue variants. WATCHLIST needs amber (could map to `C.yellow`), REVIEW needs blue.
**How to avoid:** Map verdict colors to existing palette: PASS -> `C.green`, FAIL -> `C.red`, WATCHLIST -> `C.yellow`, REVIEW -> `C.accent`. If a distinct blue is needed for REVIEW, add it to both `C_LIGHT` and `C_DARK` in theme.js.
**Warning signs:** Badges look wrong in dark mode because hardcoded colors were used.

### Pitfall 6: Scroll-to-Section Nav Doesn't Account for Sticky Header
**What goes wrong:** Clicking a section in the anchor nav scrolls the section behind the sticky nav bar (52px) or behind the sticky section nav itself.
**Why it happens:** `scrollIntoView` doesn't account for fixed/sticky elements at the top of the viewport.
**How to avoid:** Use `scrollIntoView({ behavior: 'smooth' })` with a `scroll-margin-top` equivalent in inline styles, or use `window.scrollTo` with a calculated offset that subtracts the header height + section nav height.
**Warning signs:** Section titles are hidden behind the nav when you click a nav link.

## Code Examples

### One Pager Report JSON Structure (Verified from COST data)
```javascript
// Source: .thes1s/reports/COST/one-pager.json
{
  ticker: "COST",
  companyName: "COSTCO WHOLESALE CORP /NEW",
  stage: "onePager",
  generatedAt: "2026-03-24T22:54:11.393Z",
  sections: [
    {
      key: "company_info",           // Unique section identifier
      title: "Company Information",   // Display title
      sectionNumber: 1,              // Render order
      status: "pass",                // "pass" | "fail" | "review" | "pending"
      confidence: "HIGH",            // "HIGH" | "MEDIUM" | "LOW"
      verdict: "PASS",               // "PASS" | "FAIL" | "WATCHLIST" | null
      verdictRationale: "...",        // Primary prose text (ALWAYS present)
      summary: "...",                 // 1-2 sentence summary (ALWAYS present)
      data: {},                       // Section-specific structured data (only valuation_summary has this)
      narrative: undefined,           // NOT present in current output -- optional
      citations: [],                  // Empty in current output -- schema-defined
      tables: undefined,              // NOT present in current output -- optional
      redFlags: ["...", "..."],       // Array of strings, always present, always >= 1
      crossCuttingFindings: [         // Findings for other agents
        { finding: "...", relevantAgents: [...], severity: "high"|"medium"|"low", source: "..." }
      ],
    },
    // ... 5 more sections
  ],
  overallVerdict: "WATCHLIST",
  sectionKeys: ["company_info", "minimum_standards", "meaning", "growth_metrics", "valuation_summary", "overall_verdict"],
}
```

### Progress JSON Structure (Verified from schema)
```javascript
// Source: src/schemas/progress.js
{
  ticker: "COST",
  stage: "onePager",
  state: "WAVE_1_RUNNING",         // State machine position
  startedAt: "2026-03-24T...",
  lastUpdated: "2026-03-24T...",
  sections: {
    company_info: { status: "complete" },
    minimum_standards: { status: "complete" },
    meaning: { status: "running", agentRole: "financial-analyst" },
    growth_metrics: { status: "pending" },
    valuation_summary: { status: "pending" },
    overall_verdict: { status: "pending" },
  },
  checkpoints: [],
  errors: [],
  totalCost: { input: 0, output: 0 },
}
```

### Existing Badge Pattern (Verified from CompanyHeader.jsx)
```javascript
// Source: src/components/CompanyHeader.jsx -- ScoreBadge pattern
function ScoreBadge({ label, score, large = false }) {
  const color = badgeColor(score);
  const bgMap = { green: C.scoreBgGreen, yellow: C.scoreBgYellow, red: C.scoreBgRed, gray: C.badge };
  const bg = bgMap[color] || C.badge;
  const textColor = color === 'gray' ? C.badgeText : '#fff';
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 11, color: C.textSecondary, marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </div>
      <div style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        padding: large ? '6px 20px' : '4px 14px', borderRadius: 6,
        fontSize: large ? 20 : 15, fontWeight: 800,
        color: textColor, background: bg, minWidth: large ? 60 : 48,
      }}>
        {score != null ? score : '--'}
      </div>
    </div>
  );
}
```

### Agent-to-Section Mapping (Verified from dispatch-table.json)
```javascript
// One Pager agent dispatch:
// Phase 1 (parallel):
//   financial-analyst -> sections 3 (meaning), 4 (growth_metrics)
//   business-analyst  -> sections 1 (company_info), 2 (minimum_standards)
//   valuation-specialist -> section 5 (valuation_summary)
// Post-processing:
//   synthesis-writer  -> section 6 (overall_verdict) -- depends on all phases
```

### Existing Route Structure (Verified from App.jsx)
```javascript
// Current routes:
<Route path="/" element={<Navigate to="/research" replace />} />
<Route path="/watchlists" element={<Watchlists />} />
<Route path="/research" element={<ResearchRedirect reports={reports} />} />
<Route path="/research/:id" element={<Toolbox ... />} />
<Route path="/research/:id/one-pager" element={<StagePlaceholder label="One Pager" />} />
<Route path="/reports" element={<ResearchList reports={reports} onDelete={deleteReport} />} />
// Note: /research/:id/one-pager already exists as a placeholder!
```

### Data Bridge Pattern (Verified from existing Vite middleware in vite.config.js)
```javascript
// vite.config.js already has 5+ middleware plugins that serve data from Node.js context:
// - yahooSummaryPlugin: /api/yahoo-summary/:ticker
// - edgarProxyPlugin: /api/edgar/*
// - finvizPlugin: /api/finviz/:ticker
// - guruFocusPlugin: /api/gurufocus/*
// - irEventsPlugin: /api/ir-events/*
// Pattern: Lazy-load Node module, parse URL, read/fetch data, JSON response
// Follow this exact pattern for .thes1s/reports/* middleware
```

### Hook Return Pattern (Verified from useResearch.js)
```javascript
// All hooks return named objects:
return { reports, createReport, updateReport, deleteReport, getReport };
// New hook should follow:
return { report, progress, loading, error };
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| ResearchList at /reports | Will become generated reports viewer | Phase 5B | Routes change; ResearchList may merge into Research tab |
| StagePlaceholder at /research/:id/one-pager | Will become OnePager.jsx viewer | Phase 5B | Placeholder replacement |
| No report rendering | Full section rendering with citations | Phase 5B | New component tree |

**Deprecated/outdated:**
- `StagePlaceholder` component at `/research/:id/one-pager` -- replaced by real `OnePager.jsx`

## Open Questions

1. **Narrative field availability in future reports**
   - What we know: COST one-pager.json sections have NO narrative field. The schema defines it. The one-pager.md has rich narrative.
   - What's unclear: Will future One Pager generations include narrative in the section JSON? Or is narrative always a separate assembly step?
   - Recommendation: Build SectionRenderer to work excellently WITHOUT narrative (using verdictRationale + summary + data + redFlags + crossCuttingFindings), and ALSO support narrative rendering when present. Test both paths.

2. **Report discovery -- how does the UI find which tickers have generated reports?**
   - What we know: Reports live in `.thes1s/reports/{TICKER}/`. The browser needs a list of tickers with generated reports.
   - What's unclear: Should the Vite middleware serve a directory listing? Or should generated reports also be registered in the localStorage report model?
   - Recommendation: Add a `/api/thes1s/reports` endpoint that lists tickers with available reports (reads `.thes1s/reports/` directory). Also update the localStorage report model when a generation completes (write `report.onePager = { sections: [...] }` to the existing report object).

3. **Tauri production path**
   - What we know: Vite middleware only works in dev. Tauri production builds serve static files.
   - What's unclear: How will production builds read `.thes1s/reports/` files?
   - Recommendation: For Phase 5B, focus on Vite dev middleware. Phase 5D or later can add Tauri IPC commands. The hook abstraction layer means swapping the data source later is a 1-line change.

4. **Citation population timeline**
   - What we know: All COST sections have `citations: []`. The schema and CONTEXT both describe a rich citation system.
   - What's unclear: When will agents start populating citations? Is this Phase 5C work, or Phase 5D quality system work?
   - Recommendation: Build the full citation UI now (it's a CONTEXT locked decision), but test it with both empty and mock-populated citations. The citation rendering code should be ready when agents start producing citations.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.0 |
| Config file | Inline in vite.config.js (no separate vitest.config.js) |
| Quick run command | `npm test` |
| Full suite command | `npm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ONEP-02 | OnePager renders 6 sections from COST JSON | unit (data transform) | `npx vitest run src/components/__tests__/onePager.test.js -x` | Wave 0 |
| ONEP-03 | VerdictBadge maps PASS/FAIL/WATCHLIST/REVIEW to correct colors | unit | `npx vitest run src/components/__tests__/verdictBadge.test.js -x` | Wave 0 |
| ONEP-04 | SectionRenderer handles empty citations, missing narrative, populated redFlags | unit (data transform) | `npx vitest run src/components/__tests__/sectionRenderer.test.js -x` | Wave 0 |
| ONEP-05 | Progress state maps to section status display | unit (data transform) | `npx vitest run src/components/__tests__/generationProgress.test.js -x` | Wave 0 |

**Note on component testing:** The project has NO `@testing-library/react` installed. Component render tests require either installing it or testing at the data transformation layer (pure functions that map JSON to props). Given the project convention of engine-level tests only, recommend testing the data transformation logic (JSON parsing, badge color mapping, section ordering, citation formatting) as pure function tests, NOT full React render tests. This avoids a new dependency and follows project conventions.

### Sampling Rate
- **Per task commit:** `npm test`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/components/__tests__/verdictBadge.test.js` -- covers ONEP-03 (badge color mapping)
- [ ] `src/components/__tests__/sectionRenderer.test.js` -- covers ONEP-04 (citation rendering, empty handling)
- [ ] `src/components/__tests__/onePager.test.js` -- covers ONEP-02 (section ordering, data extraction)
- [ ] `src/components/__tests__/generationProgress.test.js` -- covers ONEP-05 (progress state to UI mapping)

## Project Constraints (from CLAUDE.md)

The following CLAUDE.md directives apply to this phase:

- **Inline styles only:** All components use `import { C } from '../theme'` -- no CSS files, no CSS-in-JS.
- **Functional components + hooks:** No class components. All hooks return `{ data, loading, error }` or domain-specific equivalent.
- **Error handling:** `try/catch` returning `null`. Failed fetches return `null`, not throw. Guard clauses at function entry.
- **Naming:** Components PascalCase `.jsx`, hooks `use` prefix camelCase `.js`, engines camelCase `.js`. Constants UPPER_SNAKE_CASE.
- **Formatter pattern:** `fmtNum`, `fmtDollar`, `fmtPct`, `fmtRange` for formatting functions.
- **Theme:** `C` palette object, dark/light modes. Green/Yellow/Red/Teal color scheme.
- **No new dependencies without justification.** All UI is achievable with React + inline styles.
- **Test runner:** vitest via `npm test`. Write tests that match `*.test.js` pattern.
- **Dev commands:** `npm run dev` (Vite dev server), `npm test` (vitest).
- **Data flow:** Hooks call engines; engines are pure async functions; components render hook state.
- **localStorage key:** `stock-analyzer-reports` for report data.
- **GSD workflow:** Use `/gsd:quick`, `/gsd:debug`, or `/gsd:execute-phase` for all work.

## Sources

### Primary (HIGH confidence)
- `.thes1s/reports/COST/one-pager.json` -- Actual generated One Pager JSON, 6 sections, all fields examined
- `.thes1s/reports/COST/one-pager.md` -- Markdown rendering, confirms narrative style and table format
- `src/schemas/reportSection.js` -- ReportSectionSchema, CitationSchema, TableSchema, ChartSchema
- `src/schemas/progress.js` -- ProgressSchema, section status enum, state machine states
- `src/engines/progressState.js` -- Node-only progress persistence (uses fs module)
- `src/components/Toolbox.jsx` -- Tab pattern, hook usage, existing component composition
- `src/components/Layout.jsx` -- Nav bar structure, route layout, 52px header height
- `src/components/CompanyHeader.jsx` -- ScoreBadge pattern, badge color mapping
- `src/components/CollapsibleSection.jsx` -- Expandable section pattern, animation approach
- `src/components/ResearchList.jsx` -- Current Reports tab content (to be replaced)
- `src/App.jsx` -- Full route structure, existing placeholder routes
- `src/theme.js` -- Complete C palette (C_LIGHT, C_DARK), theme switching
- `src/hooks/useResearch.js` -- Report data model, CRUD operations, localStorage persistence
- `agents/orchestrator/dispatch-table.json` -- Agent-to-section mapping for One Pager

### Secondary (MEDIUM confidence)
- CLAUDE.md project architecture documentation -- confirms conventions and patterns

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new deps needed, all conventions well-documented in codebase
- Architecture: HIGH -- existing patterns (Vite middleware, hooks, inline styles) thoroughly verified
- Pitfalls: HIGH -- verified against real COST data; identified concrete schema/data mismatches
- Validation: MEDIUM -- component testing approach is new for this project (only engine tests exist)

**Research date:** 2026-03-24
**Valid until:** 2026-04-24 (stable -- internal UI phase, no external dependency volatility)
