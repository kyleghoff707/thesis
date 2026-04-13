# Phase 20: Full Story Core Viewer - Research

**Researched:** 2026-04-02
**Domain:** React report viewer UI (Full Story stage), inline styles, data fetching hooks
**Confidence:** HIGH

## Summary

Phase 20 replaces the temporary 114-line FullStory.jsx shell with a full-featured report viewer. The existing PitchDeck.jsx is the primary pattern reference -- it demonstrates every pattern needed: hero banner, sticky nav, section rendering via SectionRenderer, approval bar, gate check, and useScrollSpy integration. The Full Story viewer is structurally simpler (6 sections, no phases, no generation status panel) but introduces two new concepts: (1) quality score display (mechanical + methodology per section and overall), and (2) a hero anchored by the debate judge's verdict rather than an overall_verdict section.

The data shapes are well-understood from inspecting SFM and MNST full-story-api.json files and their quality JSON files. Two infrastructure gaps need filling: (1) a Vite middleware endpoint for quality JSON (currently only report JSON is served), and (2) the App.jsx route needs `updateReport` passed to FullStory for the approval bar. All other shared infrastructure (SectionRenderer, useScrollSpy, VerdictBadge, ConfidenceBadge, Spinner, reportHelpers, ReportMarkdown) is ready for use.

**Primary recommendation:** Follow PitchDeck.jsx patterns closely -- same gate check logic, same sticky nav structure, same approval bar layout, same SectionRenderer usage -- but with Full Story's 6-section SECTION_DEFS, debate judge hero, and quality score badges as additions.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Per-section quality scores displayed as header badges (pill badges next to section title showing "Mech N . Method N"). Consistent with existing VerdictBadge pattern.
- **D-02:** Overall aggregate quality score displayed in the hero header (e.g., "Quality: 94/100 (Method: 98)").
- **D-03:** Quality scores use traffic-light color coding -- green (90+), yellow/amber (70-89), red (<70). Matches existing VerdictBadge color language.
- **D-04:** Quality data sourced from separate quality JSON file (`full-story-v4.quality.json`), fetched alongside the report data. Per-section fields: `sectionKey`, `score` (mechanical), `methodology.score`, `completeness`.
- **D-05:** Hero header anchored by the debate judge's verdict from `debateOutputs.judge.content.overallVerdict`. Fields: `direction` (Bear/Bull/Neutral), `summary`, `investmentImplication`.
- **D-06:** Hero includes a 1-2 sentence excerpt from the judge's `summary` field as the verdict blurb.
- **D-07:** Hero includes the `investmentImplication` rendered as a distinct callout box below the summary -- this is the actionable "what to do" guidance.
- **D-08:** Hero also shows overall quality score (from D-02) alongside the verdict.
- **D-09:** If debateOutputs or judge data is missing (older reports), fall back to showing the most common section verdict.
- **D-10:** All 6 sections rendered via SectionRenderer showing full content -- narrative, summary, verdict rationale, data grids, tables, cross-cutting findings, red flags, and citations. Same approach as OnePager and PitchDeck.
- **D-11:** Also render `primarySourceInsights` per section -- shows which 10-K paragraphs, earnings call excerpts, etc. the AI used. Adds a compliance/transparency layer.
- **D-12:** Also render `searchesPerformed` per section -- shows what web searches the AI conducted. Same compliance rationale.
- **D-13:** SectionRenderer will need small additions to handle `primarySourceInsights` and `searchesPerformed` fields (these are not currently rendered by SectionRenderer).
- **D-14:** Overall verdict read directly from `debateOutputs.judge.content.overallVerdict` -- no data duplication, no computed aggregate.
- **D-15:** Hero layout: direction badge + quality score line, then summary blurb, then investmentImplication callout box. Stacked vertically.
- **D-16:** Gate check pattern follows PitchDeck precedent -- Pitch Deck must be approved (`report.stageApprovals.pitchDeck === 'approved'`) before Full Story is accessible.
- **D-17:** Approval bar at bottom follows PitchDeck pattern -- approve/reject buttons when all sections are rendered and report is complete. Approve sets `stageApprovals.fullStory = 'approved'`; reject prompts for notes.
- **D-18:** Uses existing shared infrastructure: useScrollSpy hook, SectionRenderer, VerdictBadge, ConfidenceBadge, Spinner, reportHelpers, ReportMarkdown.
- **D-19:** Needs a new useFullStory hook (similar to usePitchDeck) for fetching report data + quality data.
- **D-20:** Full Story section definitions: event_analysis, meaning_checklist, moat_checklist, management_checklist, valuation_confirmation, inversion_rebuttal (6 sections, no overall_verdict section unlike PitchDeck).

### Claude's Discretion
- Sticky nav implementation details (reuse PitchDeck's nav pattern or simplify for 6 sections vs 9)
- Loading/error/empty state patterns (follow established conventions)
- useFullStory hook polling behavior (whether to poll for generation progress like usePitchDeck)
- Exact layout proportions and spacing

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FS-01 | User can view Full Story report with 6 sections, gate check enforcing Pitch Deck approval, and approval bar | PitchDeck.jsx provides gate check, approval bar, SectionRenderer patterns. Data shape confirmed from SFM/MNST full-story-api.json. Vite middleware already serves full-story endpoint. Route exists in App.jsx. |
| FS-04 | User can see quality scores (mechanical and methodology) per section and overall | Quality JSON shape confirmed from SFM/MNST quality files. Per-section: `score` (mechanical), `methodology.score`. Overall: `overallScore`, `overallMethodologyScore`. Needs new Vite middleware endpoint. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19.2.0 | UI components | Already in project |
| react-router-dom | 7.13.1 | Route params, navigation | Already in project |
| react-markdown | (already installed) | Markdown rendering | Used by ReportMarkdown component |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vitest | 4.1.0 | Testing | Already configured, `npm test` |
| jsdom | 29.0.1 | DOM environment for tests | Already configured |

### Alternatives Considered
None -- all libraries already in the project. No new dependencies needed.

## Architecture Patterns

### Component Structure
```
src/
  hooks/
    useFullStory.js          # NEW: fetch report + quality data
  components/
    FullStory.jsx            # REPLACE: full viewer (currently 114-line shell)
    SectionRenderer.jsx      # MODIFY: add primarySourceInsights + searchesPerformed
    __tests__/
      fullStory.test.js      # NEW: FullStory component tests
```

### Pattern 1: SECTION_DEFS Array (from PitchDeck)
**What:** Static array defining section keys, labels, and order. Used for nav, rendering, and scroll spy.
**When to use:** Every report viewer component.
**Example (Full Story):**
```javascript
// Source: PitchDeck.jsx pattern, adapted for Full Story's 6 sections
const SECTION_DEFS = [
  { key: 'event_analysis', label: 'Event Analysis' },
  { key: 'meaning_checklist', label: 'Meaning Checklist' },
  { key: 'moat_checklist', label: 'Moat Checklist' },
  { key: 'management_checklist', label: 'Management Checklist' },
  { key: 'valuation_confirmation', label: 'Valuation Confirmation' },
  { key: 'inversion_rebuttal', label: 'Inversion & Rebuttal' },
];
```
No `phase` property needed (Full Story doesn't have PitchDeck's 3-phase structure).

### Pattern 2: Hero Banner (adapted from PitchDeck)
**What:** Top-of-page hero showing the overall verdict. PitchDeck uses `overall_verdict` section data; Full Story uses `debateOutputs.judge.content.overallVerdict`.
**Key differences from PitchDeck hero:**
- PitchDeck hero: VerdictBadge + verdictRationale text. Simple layout.
- Full Story hero: Direction badge (Bear/Bull/Neutral) + quality score line + summary blurb + investmentImplication callout box. Richer layout per D-05 through D-09.

### Pattern 3: Gate Check (from PitchDeck, line 474)
**What:** If previous stage not approved, show gate lock message and don't render the report.
**Example:**
```javascript
// PitchDeck checks onePager; Full Story checks pitchDeck
const pitchDeckApproved = report?.stageApprovals?.pitchDeck === 'approved';

if (!pitchDeckApproved && !fullStoryData && !progress) {
  return (
    <div style={{ /* centered message */ }}>
      Pitch Deck must be approved before viewing the Full Story.
    </div>
  );
}
```

### Pattern 4: Approval Bar (from PitchDeck, line 1086)
**What:** Bottom bar with approve/reject buttons. Updates `stageApprovals.fullStory` via `updateReport`.
**Integration requirement:** App.jsx line 67 currently does NOT pass `updateReport` to FullStory. Must be fixed:
```javascript
// Current (broken):
<FullStory getReport={getReport} />
// Needed:
<FullStory getReport={getReport} updateReport={updateReport} />
```

### Pattern 5: Sticky Section Nav (from PitchDeck, line 688)
**What:** 200px left sidebar with scroll-spy active state. Full Story has only 6 sections (vs PitchDeck's 9), so the nav is simpler.
**Recommendation:** Reuse exact same nav layout. 6 items fit comfortably. No simplification needed.

### Pattern 6: Quality Score Badge (NEW -- D-01, D-03)
**What:** Pill badge showing "Mech N . Method N" with traffic-light color.
**Color logic (D-03):**
- Green: score >= 90 (`C.green`)
- Yellow: score 70-89 (`C.yellow`)
- Red: score < 70 (`C.red`)

This maps directly to existing theme colors. Can be a small inline helper or a QualityBadge sub-component within FullStory.jsx. Pattern should be reusable since it will be added to other stages later (noted in CONTEXT specifics).

### Pattern 7: useFullStory Hook
**What:** Custom hook similar to usePitchDeck but fetching two endpoints: report JSON + quality JSON.
**Endpoints:**
- Report: `GET /api/thes1s/reports/${ticker}/full-story` (already works)
- Quality: `GET /api/thes1s/reports/${ticker}/full-story-quality` (NEW -- needs Vite middleware addition)

**Recommendation on polling (Claude's discretion):** Include polling for `progress.json` and `generation-status.json` like usePitchDeck does. The Full Story pipeline takes minutes and users will want to see progress. Follow the exact usePitchDeck polling pattern (2s interval, re-fetch report on COMPLETE).

Return shape: `{ report, quality, progress, generationStatus, loading, error }`

### Anti-Patterns to Avoid
- **Don't duplicate SectionRenderer logic in FullStory.** All section content flows through SectionRenderer. The primarySourceInsights and searchesPerformed additions go INTO SectionRenderer, not into FullStory-specific rendering.
- **Don't compute an aggregate verdict.** D-14 is explicit: read verdict from `debateOutputs.judge.content.overallVerdict` directly.
- **Don't fetch quality inline in the component.** Use the useFullStory hook to keep async logic out of the render component.
- **Don't add phase progress indicators.** Full Story doesn't have PitchDeck's 3-phase structure. No phase circles, no phase labels, no checkpoints.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Section rendering | Custom per-section JSX | SectionRenderer | Already handles 9 content blocks (header, summary, narrative, data grid, tables, cross-cutting, red flags, citations) |
| Scroll tracking | Manual scroll event listeners | useScrollSpy hook | Handles IntersectionObserver + rAF debouncing |
| Markdown rendering | Raw text or custom parser | ReportMarkdown | Already integrates react-markdown + remark-gfm + citation support |
| Verdict display | Custom colored spans | VerdictBadge | Handles PASS/FAIL/WATCHLIST/REVIEW with icons |
| Number formatting | Custom formatters | reportHelpers (fmtNum, fmtDollar, fmtPct, formatDataValue) | Handles all data types including ranges |

## Common Pitfalls

### Pitfall 1: Missing `updateReport` Prop in App.jsx Route
**What goes wrong:** Approval bar approve/reject buttons silently fail because `updateReport` is undefined.
**Why it happens:** The current App.jsx route (line 67) only passes `getReport` to FullStory, not `updateReport`.
**How to avoid:** Fix the route definition to pass both: `<FullStory getReport={getReport} updateReport={updateReport} />`
**Warning signs:** Approve button does nothing when clicked.

### Pitfall 2: Missing Quality Endpoint in Vite Middleware
**What goes wrong:** `useFullStory` quality fetch returns 400 because the fileType `full-story-quality` isn't in the Vite middleware fileMap.
**Why it happens:** Quality files live in a `quality/` subdirectory, not the ticker root. The current fileMap only maps to files in the ticker root.
**How to avoid:** Add `'full-story-quality': 'quality/full-story-v4.quality.json'` to the fileMap in vite.config.js (line 495).
**Warning signs:** Console 400 error on quality fetch; quality scores show as missing.

### Pitfall 3: Full Story API JSON Lacks `companyName` and `generatedAt`
**What goes wrong:** Hero header shows undefined for company name or generation time.
**Why it happens:** Unlike pitch-deck.json, full-story-api.json has `ticker` but NOT `companyName` or `generatedAt`. It uses `completedAt` instead.
**How to avoid:** Fall back to `report.companyName` from useResearch for the company name. Use `data.completedAt` instead of `generatedAt`.
**Warning signs:** "undefined" rendered in the hero.

### Pitfall 4: Verdict Direction Is Not a Standard Verdict String
**What goes wrong:** Passing `overallVerdict.direction` ("Bear"/"Bull"/"Neutral") to `VerdictBadge` renders nothing because VerdictBadge only handles PASS/FAIL/WATCHLIST/REVIEW.
**Why it happens:** The debate judge verdict uses a different vocabulary than section verdicts.
**How to avoid:** Create a custom direction badge for the hero (not VerdictBadge). Use Bear=red, Bull=green, Neutral=yellow styling. Or map: Bull->PASS, Bear->FAIL, Neutral->WATCHLIST.
**Warning signs:** Empty badge in hero header.

### Pitfall 5: SectionRenderer scrollMarginTop Must Account for StageNavBar
**What goes wrong:** Clicking a nav item scrolls the section behind the fixed header.
**Why it happens:** StageNavBar adds ~40px. useScrollSpy already defaults to `topOffset: 100` (52px Layout + 40px StageNavBar + 8px buffer). SectionRenderer has `scrollMarginTop: 160` inline. These are already correct.
**How to avoid:** Use existing values. Don't override topOffset.
**Warning signs:** Section headers hidden behind nav on click.

### Pitfall 6: Quality Data May Be Missing for Some Reports
**What goes wrong:** Rendering quality badges crashes or shows NaN when quality JSON doesn't exist.
**Why it happens:** Older reports or reports that haven't been quality-checked won't have the quality file.
**How to avoid:** Treat quality data as optional. Guard all quality rendering with `quality?.sections`, `quality?.overallScore`. Show "No quality data" or simply omit badges when null.
**Warning signs:** TypeError on null access.

## Code Examples

### Quality Score Badge Helper
```javascript
// Source: D-01, D-03 requirements
function qualityColor(score) {
  if (score == null) return C.textMuted;
  if (score >= 90) return C.green;
  if (score >= 70) return C.yellow;
  return C.red;
}

function QualityBadge({ mechanical, methodology }) {
  if (mechanical == null && methodology == null) return null;
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '2px 10px',
      borderRadius: 9999,
      fontSize: 10,
      fontWeight: 600,
      background: C.badge,
      color: C.badgeText,
    }}>
      {mechanical != null && (
        <span style={{ color: qualityColor(mechanical) }}>Mech {mechanical}</span>
      )}
      {mechanical != null && methodology != null && (
        <span style={{ color: C.textMuted }}>.</span>
      )}
      {methodology != null && (
        <span style={{ color: qualityColor(methodology) }}>Method {methodology}</span>
      )}
    </span>
  );
}
```

### Direction Badge for Hero (debate judge verdict)
```javascript
// Source: D-05 requirement -- Bear/Bull/Neutral direction display
function DirectionBadge({ direction }) {
  const map = {
    Bull: { bg: C.green, text: '#fff', label: 'BULL' },
    Bear: { bg: C.red, text: '#fff', label: 'BEAR' },
    Neutral: { bg: C.yellow, text: '#fff', label: 'NEUTRAL' },
  };
  const style = map[direction];
  if (!style) return null;
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '6px 16px',
      borderRadius: 9999,
      fontSize: 13,
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '0.04em',
      background: style.bg,
      color: style.text,
    }}>
      {style.label}
    </span>
  );
}
```

### SectionRenderer Additions (primarySourceInsights + searchesPerformed)
```javascript
// Source: D-11, D-12 requirements
// Add after existing citations block (block 9) in SectionRenderer.jsx

{/* 10. Primary Source Insights */}
{section.primarySourceInsights && section.primarySourceInsights.length > 0 && (
  <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid ' + C.borderLight }}>
    <div style={{
      fontSize: 10, fontWeight: 700, color: C.textMuted,
      textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6,
    }}>
      Primary Source Insights
    </div>
    {section.primarySourceInsights.map((insight, i) => (
      <div key={i} style={{ fontSize: 11, color: C.textSecondary, marginBottom: 4, lineHeight: 1.5, paddingLeft: 8 }}>
        {insight}
      </div>
    ))}
  </div>
)}

{/* 11. Searches Performed */}
{section.searchesPerformed && section.searchesPerformed.length > 0 && (
  <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid ' + C.borderLight }}>
    <div style={{
      fontSize: 10, fontWeight: 700, color: C.textMuted,
      textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6,
    }}>
      Searches Performed
    </div>
    {section.searchesPerformed.map((search, i) => (
      <div key={i} style={{
        fontSize: 11, color: C.textSecondary, marginBottom: 4,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span style={{ color: C.textMuted }}>Q:</span>
        <span>{search.query}</span>
        {search.resultCount != null && (
          <span style={{ color: C.textMuted, fontSize: 10 }}>({search.resultCount} results)</span>
        )}
      </div>
    ))}
  </div>
)}
```

### useFullStory Hook Skeleton
```javascript
// Source: usePitchDeck.js pattern, adapted for Full Story + quality data
export function useFullStory(ticker) {
  const [report, setReport] = useState(null);
  const [quality, setQuality] = useState(null);
  const [progress, setProgress] = useState(null);
  const [generationStatus, setGenerationStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const pollRef = useRef(null);

  useEffect(() => {
    if (!ticker) return;
    let cancelled = false;

    async function fetchReport() {
      const res = await fetch(`/api/thes1s/reports/${encodeURIComponent(ticker)}/full-story`);
      if (!cancelled && res.ok) setReport(await res.json());
    }

    async function fetchQuality() {
      const res = await fetch(`/api/thes1s/reports/${encodeURIComponent(ticker)}/full-story-quality`);
      if (!cancelled && res.ok) setQuality(await res.json());
      // Silently degrade if quality not found (404)
    }

    // ... polling logic follows usePitchDeck pattern exactly ...
    // Init: parallel fetch report + quality + progress + generationStatus
    // Poll: if generation active, poll progress/generationStatus every 2s
    // On complete: re-fetch report + quality after 500ms delay

    return () => { cancelled = true; /* clear timeout */ };
  }, [ticker]);

  return { report, quality, progress, generationStatus, loading, error };
}
```

## Data Shape Reference

### full-story-api.json (verified from SFM + MNST)
```javascript
{
  ticker: 'SFM',                    // String
  stage: 'full-story',              // Always 'full-story'
  completedAt: '2026-03-31T...',    // ISO date (NOT generatedAt)
  // NOTE: NO companyName field -- use report.companyName from useResearch
  sectionCount: 6,
  errorCount: 0,
  sections: [
    {
      key: 'event_analysis',        // One of 6 section keys
      title: '...',
      sectionNumber: 1,
      status: 'complete',
      confidence: 'HIGH',
      verdict: 'PASS',              // PASS/FAIL/WATCHLIST
      verdictRationale: '...',
      summary: '...',
      data: { /* key-value pairs */ },
      narrative: '...',
      citations: [ { id, source, text } ],
      tables: [ { title, headers, rows } ],
      charts: [],
      redFlags: [ { text, severity } ],
      primarySourceInsights: [ 'string', ... ],    // NEW for SectionRenderer
      crossCuttingFindings: [ { finding, source, severity } ],
      searchesPerformed: [                          // NEW for SectionRenderer
        { query: '...', resultCount: 10, usedInSection: true }
      ],
      modelUsed: '...',
      tokenCost: { input: N, output: N },
    },
    // ... 5 more sections
  ],
  budget: { /* cost tracking */ },
  cacheStats: { /* hit/miss counts */ },
  errors: [],
  debateOutputs: {
    bull: { step, role, agent, content },
    bear: { step, role, agent, content },
    bull_rebuttal: { step, role, agent, content },
    judge: {
      step: 'judge',
      role: 'judge',
      agent: '...',
      content: {
        exchanges: [ /* debate exchanges */ ],
        overallVerdict: {
          direction: 'Bear',                // Bear | Bull | Neutral
          unresolvedCount: 5,               // Number
          summary: '...',                   // Long paragraph
          investmentImplication: '...',     // Long actionable paragraph
        },
      },
    },
  },
}
```

### full-story-v4.quality.json (verified from SFM + MNST)
```javascript
{
  sections: [
    {
      sectionKey: 'event_analysis',
      score: 100,                           // Mechanical score (0-100)
      completeness: {
        requiredFieldsPresent: 14,
        requiredFieldsTotal: 14,
        narrativeLength: 7430,
        dataFieldsPopulated: 4,
        score: 100,
      },
      issues: [],
      passed: true,
      methodology: {
        score: 100,                         // Methodology score (0-100)
        checks: [ { id, label, critical, passed } ],
        passed: true,
      },
      checkedAt: '...',
    },
    // ... 5 more sections
  ],
  overallScore: 94,                         // Aggregate mechanical
  overallPassed: true,
  overallMethodologyScore: 98,              // Aggregate methodology
  checkedAt: '...',
}
```

### Quality-to-Section Mapping
Join quality sections to report sections via `sectionKey`:
```javascript
const qualityMap = {};
if (quality?.sections) {
  for (const qs of quality.sections) {
    qualityMap[qs.sectionKey] = qs;
  }
}
// Then: qualityMap['event_analysis'].score, qualityMap['event_analysis'].methodology.score
```

## Infrastructure Gaps

### Gap 1: Vite Middleware -- Quality JSON Endpoint
**Current state:** The `fileMap` in `vite.config.js` (line 495) only maps to files in the ticker root directory.
**What's needed:** Add `'full-story-quality': 'quality/full-story-v4.quality.json'` to the fileMap.
**Impact:** Without this, `useFullStory` cannot fetch quality data.
**File:** `vite.config.js` line 495-501

### Gap 2: App.jsx Route -- Missing `updateReport` Prop
**Current state:** Line 67: `<FullStory getReport={getReport} />` -- no `updateReport`.
**What's needed:** `<FullStory getReport={getReport} updateReport={updateReport} />`
**Impact:** Without this, the approval bar cannot save approve/reject state.
**File:** `src/App.jsx` line 67

### Gap 3: SectionRenderer -- No primarySourceInsights or searchesPerformed Rendering
**Current state:** SectionRenderer renders 9 content blocks. These two fields are not handled.
**What's needed:** Add blocks 10 (primarySourceInsights) and 11 (searchesPerformed) after the citations block.
**Impact:** These fields exist on all 6 sections of every Full Story report. Without rendering them, compliance transparency is lost.
**File:** `src/components/SectionRenderer.jsx`

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.0 |
| Config file | Inline in package.json (`vitest run`) -- no vitest.config.js |
| Quick run command | `npm test` |
| Full suite command | `npm test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FS-01-a | SECTION_DEFS has correct 6 keys | unit | `npm test -- --grep "SECTION_DEFS"` | No -- Wave 0 |
| FS-01-b | Gate check blocks when pitchDeck not approved | unit | `npm test -- --grep "gate check"` | No -- Wave 0 |
| FS-01-c | Approval bar updates stageApprovals.fullStory | unit | `npm test -- --grep "approval"` | No -- Wave 0 |
| FS-01-d | Nav items built correctly from sections | unit | `npm test -- --grep "nav items"` | No -- Wave 0 |
| FS-04-a | Quality color mapping (green/yellow/red) | unit | `npm test -- --grep "qualityColor"` | No -- Wave 0 |
| FS-04-b | Quality data joined to sections by sectionKey | unit | `npm test -- --grep "quality map"` | No -- Wave 0 |
| SR-add | SectionRenderer renders primarySourceInsights | unit | `npm test -- --grep "primarySourceInsights"` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `npm test`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/components/__tests__/fullStory.test.js` -- covers FS-01, FS-04 (pure function tests for SECTION_DEFS, gate logic, quality helpers, nav items)
- [ ] `src/components/__tests__/sectionRenderer.test.js` -- add tests for primarySourceInsights/searchesPerformed rendering (extend existing file)

## Sources

### Primary (HIGH confidence)
- **SFM full-story-api.json** -- Inspected actual data shape: 6 sections, debateOutputs with judge verdict, primarySourceInsights/searchesPerformed per section. No companyName or generatedAt at top level.
- **MNST full-story-api.json** -- Cross-validated same structure. Confirmed both tickers have same top-level keys and section shape.
- **SFM full-story-v4.quality.json** -- Verified quality JSON shape: per-section score + methodology.score, overall overallScore + overallMethodologyScore.
- **MNST full-story-v4.quality.json** -- Cross-validated quality shape consistency.
- **PitchDeck.jsx (1162 lines)** -- Full source review: hero banner (line 510-564), gate check (line 474), approval bar (line 1086-1132), sticky nav (line 688-745), SECTION_DEFS pattern (line 19-29), SectionRenderer usage (line 786).
- **usePitchDeck.js (127 lines)** -- Full source review: polling pattern, report+progress+generationStatus fetch, completion re-fetch.
- **SectionRenderer.jsx (392 lines)** -- Full source review: 9 content blocks, confirmed no primarySourceInsights or searchesPerformed handling.
- **vite.config.js (lines 437-527)** -- Full middleware review: fileMap at line 495, confirmed no quality endpoint.
- **App.jsx (lines 60-76)** -- Route definitions: confirmed FullStory route missing updateReport prop.
- **theme.js** -- Verified C.green, C.yellow, C.red available for traffic-light quality colors.
- **VerdictBadge.jsx** -- Confirmed only handles PASS/FAIL/WATCHLIST/REVIEW (not Bear/Bull/Neutral).

### Secondary (MEDIUM confidence)
- **useScrollSpy.js** -- Confirmed compatible with 6-section array. Default topOffset 100 accounts for StageNavBar.
- **StageNavBar.jsx** -- Confirmed gate logic uses `stageApprovals[gate] !== 'approved'`. Full Story gate is `pitchDeck`.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, all patterns verified from existing source code
- Architecture: HIGH -- PitchDeck.jsx is a proven pattern with 1162 lines of reference
- Pitfalls: HIGH -- all 6 pitfalls discovered through direct source code inspection
- Data shapes: HIGH -- verified from 2 tickers (SFM + MNST) with consistent structure

**Research date:** 2026-04-02
**Valid until:** 2026-05-02 (30 days -- stable project, no external dependencies changing)
