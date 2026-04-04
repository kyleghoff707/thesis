# Phase 23: Delight Feature Wiring - Research

**Researched:** 2026-04-03
**Domain:** React UI wiring, on-demand Claude API calls, report data enrichment
**Confidence:** HIGH

## Summary

Phase 23 wires three enrichment features to real report data: (1) DeepDivePanel with on-demand Claude API for notable claims, (2) Management Promise Tracker as a dedicated Full Story section, and (3) IndustryCard glossary tooltips with pipeline-generated term dictionaries. DLT-04 (Bull/Bear toggle) is deferred -- existing DebateRenderer covers it.

The critical insight is that the existing UI shells (DeepDivePanel, IndustryCard) are fully built and ready for wiring. The work is primarily: (a) enhancing SectionRenderer to render "Tell me more" links and glossary terms from pipeline data, (b) creating a new PromiseTracker component following established ChecklistRenderer patterns, (c) building a deepDive engine function that calls Claude directly from the browser using the established `fetch` + `anthropic-dangerous-direct-browser-access` header pattern, and (d) wiring data flow in PitchDeck.jsx and FullStory.jsx.

**Primary recommendation:** Split into 3 plans -- (1) Deep Dive wiring (SectionRenderer enhancement + deepDive engine + PitchDeck/FullStory state), (2) Promise Tracker section (new PromiseTracker component + FullStory integration), (3) Glossary wiring (SectionRenderer enhancement + PitchDeck/FullStory state). Each plan can be executed independently once SectionRenderer changes are coordinated.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Deep dive content generated on-demand via Claude API -- when user clicks "Tell me more" on a notable claim, fires a live Claude API call with claim context + section data. ~3-5s latency, ~$0.02-0.05 per call.
- **D-02:** Notable claims identified by pipeline during report generation. Pipeline adds a `notableClaims[]` array per section with `{text, context}`. UI renders these as clickable "Tell me more" links in the narrative.
- **D-03:** Deep dive responses saved permanently into the report JSON -- the expanded analysis becomes part of the report. No separate cache. User can re-read the deep dive on subsequent visits without re-triggering.
- **D-04:** Iterative deepening supported -- after first deep dive, a "Go Deeper" button appears. Each click adds another layer of analysis, all saved to the report. 2-3 depth levels max.
- **D-05:** Deep dives available on Pitch Deck and Full Story only. One Pager is a quick filter -- no deep dives.
- **D-06:** DeepDivePanel component already exists at `src/components/pitchDeck/DeepDivePanel.jsx`. Reuse as-is, just wire to data.
- **D-07:** Replaces AssumptionTracker. "Assumption tracker" concept replaced by Management Promise Tracker.
- **D-08:** Promise extraction happens in the pipeline during report generation -- Primary Source Reader agent reads cached transcripts.
- **D-09:** Promises stored in report JSON per ticker as a `promises` data structure. Each promise: `{quote, quarterYear, category, status (KEPT/BROKEN/PENDING/PARTIAL), evidence}`.
- **D-10:** Promise Tracker rendered as a dedicated section in Full Story (7th section alongside Event Analysis, checklists, etc.) -- not a sidebar.
- **D-11:** Available on Full Story only.
- **D-12:** Individual promises displayed as timeline cards -- chronological order.
- **D-13:** Aggregate header uses segmented bar + score -- same pattern as checklist aggregate header (Phase 21).
- **D-14:** Produces management credibility metrics fed into the Management section.
- **D-15:** Glossary data generated per-report by the pipeline. Definitions + industry benchmarks contextualized to the ticker.
- **D-16:** Term detection done by pipeline marking -- `glossaryTerms[]` array per section listing detected terms with positions.
- **D-17:** Glossary tooltips available on Pitch Deck and Full Story only.
- **D-18:** IndustryCard component already exists. Reuse as-is.
- **D-19:** DLT-04 deferred -- existing DebateRenderer with Bull/Bear/Rebuttal/Judge tabs covers perspective switching.

### Claude's Discretion
- How to format the "Tell me more" clickable links in narrative text (inline link, button, icon)
- Deep dive API prompt design (what context to send to Claude for the best expansion)
- Promise extraction prompt design for the Primary Source Reader
- Glossary term density limits (how many terms to mark per paragraph to avoid visual noise)
- Whether to show a small floating "Glossary" legend or just rely on hover discovery
- Timeline card expand/collapse animation approach

### Deferred Ideas (OUT OF SCOPE)
- Bull/Bear toggle (DLT-04) -- existing DebateRenderer covers it
- AssumptionTracker (original DLT-02) -- replaced by Promise Tracker
- Deep dives on One Pager
- Glossary on One Pager
- Promise Tracker on Pitch Deck
- Promise credibility feeding into Rule One Score
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DLT-01 | User can click "Tell me more" on notable claims to see expanded AI analysis in a slide-out panel | SectionRenderer enhanced to render clickable links from `notableClaims[]`; DeepDivePanel (existing) wired to on-demand Claude API via `deepDive.js` engine; responses saved to report JSON via `updateReport` |
| DLT-02 | User can view key assumptions with confidence levels (REPLACED by Promise Tracker) | New PromiseTracker component renders pipeline-provided `promises[]` as timeline cards with segmented aggregate bar; integrated as 7th FullStory SECTION_DEFS entry |
| DLT-03 | User can hover underlined industry terms to see glossary definitions with benchmarks | SectionRenderer enhanced to render dashed-underline spans from `glossaryTerms[]`; IndustryCard (existing) wired to glossary data from pipeline; click-to-show, click-outside-to-close |
| DLT-04 | User can toggle between Bull and Bear narrative perspectives (DEFERRED) | Existing DebateRenderer with Bull/Bear/Rebuttal/Judge tabs already delivers this. No work needed. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19.2.0 | UI framework | Already installed, project standard |
| @anthropic-ai/sdk | ^0.80.0 | NOT USED for deep dives -- project uses direct `fetch` | See Architecture Patterns below |
| vitest | ^4.1.0 | Testing | Already installed, 173+ existing tests |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| react-markdown | (installed) | Markdown rendering in deep dive responses | Render Claude API deep dive content via ReportMarkdown |
| idb | ^8.0.3 | IndexedDB wrapper | Report persistence via cacheStore.js |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Direct fetch to Anthropic API | @anthropic-ai/sdk with dangerouslyAllowBrowser | Project already uses direct fetch in companyAdapter.js (line 185-201); consistent with established pattern |
| New glossary tooltip library | @floating-ui/react | Overkill -- IndustryCard already handles positioning with getBoundingClientRect |

**Installation:** No new packages needed. All dependencies are already installed.

## Architecture Patterns

### Deep Dive: Browser-Side Claude API Call Pattern

**What:** The project calls the Anthropic API directly from the browser using `fetch`, not the SDK. This is the established pattern in `companyAdapter.js` (lines 185-201).

**Pattern:**
```javascript
// Source: src/engines/companyAdapter.js lines 185-201
const response = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': CLAUDE_KEY,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
  },
  body: JSON.stringify({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 8192,
    messages: [{ role: 'user', content: prompt }],
  }),
});
```

**Why this pattern:** The Anthropic REST API supports CORS with the `anthropic-dangerous-direct-browser-access` header. The SDK class (`new Anthropic(...)`) is used in Node.js engines (`aiResearch.js`, `onePagerGenerator.js`) but browser-side code uses direct fetch. Deep dive calls run in the browser because they are triggered by user clicks in the React UI.

**Key concern:** The `CLAUDE_KEY` is exposed to the browser via `import.meta.env.VITE_CLAUDE_KEY`. This is acceptable for this single-user local desktop app (stated in CLAUDE.md: "No server, no auth -- runs entirely locally").

### Report JSON Mutation Pattern (Deep Dive Save-Back)

**What:** Deep dive responses must be saved permanently to the report JSON, not just displayed transiently. The report is stored in IndexedDB via `useResearch.js`'s `updateReport` callback.

**Pattern:**
```javascript
// From useResearch.js lines 97-113
const updateReport = useCallback((id, updates) => {
  setReports(prev => {
    const next = prev.map(r =>
      r.id === id ? { ...r, ...updates, updatedAt: new Date().toISOString().slice(0, 10) } : r
    );
    const updated = next.find(r => r.id === id);
    if (updated) {
      idbSet(IDB_STORE, id, updated, REPORT_TTL).catch(err =>
        console.warn('Failed to update report in IndexedDB:', err.message)
      );
    }
    return next;
  });
}, []);
```

**Deep dive save flow:** When a deep dive response arrives from Claude, the component must:
1. Store the response in the section's `notableClaims[claimIndex].deepDives[]` array
2. Call `updateReport(reportId, { fullStory: updatedFullStoryData })` or equivalent
3. The fire-and-forget `idbSet` handles persistence

**Critical consideration:** The report JSON lives at two levels:
- **IndexedDB reports store** (via `useResearch`): contains `{ id, ticker, stageApprovals, ... }` -- this is the "report envelope"
- **File-based report API** (via `useFullStory`/`usePitchDeck`): reads from `.thes1s/reports/TICKER/full-story-api.json` -- this is the pipeline-generated content

Deep dive content must be saved to the **report envelope** in IndexedDB (not back to the filesystem JSON). This means adding a `deepDives` field to the report envelope, keyed by section key and claim index. The component reads pipeline data (from useFullStory) for the initial notableClaims, and reads/writes deep dive responses to/from the report envelope (from useResearch).

### SectionRenderer Enhancement Pattern

**What:** SectionRenderer needs to render "Tell me more" links and glossary terms within narrative text. This requires processing the narrative content and injecting interactive spans.

**Current narrative rendering (SectionRenderer.jsx lines 177-188):**
```jsx
{hasNarrative && (
  <div style={{ fontSize: 13, color: C.text, lineHeight: 1.7, marginBottom: 16, ... }}>
    <ReportMarkdown content={section.narrative} citations={section.citations} onCitationClick={onCitationClick} />
  </div>
)}
```

**Enhancement approach:** SectionRenderer must accept new props:
- `notableClaims` -- array of `{text, context, deepDives}` for "Tell me more" links
- `glossaryTerms` -- array of `{term, category, definition, benchmarks}` for dashed-underline terms
- `onDeepDiveClick(claimIndex)` -- callback when user clicks a "Tell me more" link
- `onGlossaryClick(term, event)` -- callback when user clicks a glossary term

**ReportMarkdown integration challenge:** The narrative is rendered via `react-markdown` in `ReportMarkdown.jsx`. Inserting interactive spans (deep dive links, glossary underlines) into react-markdown output requires either:
- Option A: Pre-process the markdown string to inject markers before passing to react-markdown (fragile, markdown parsing edge cases)
- Option B: Post-process the rendered React tree to find and wrap matching text (complex, but reliable)
- Option C: Use the `components` override in react-markdown to inject custom rendering for paragraphs that contain notable claims or glossary terms

**Recommendation:** Option C -- extend `ReportMarkdown`'s `makeComponents` to accept `notableClaims` and `glossaryTerms`, then in the `p` component override, scan paragraph text for matching claim sentences and glossary terms. This follows the existing pattern where `processChildrenWithCitations` already scans paragraph children for `[N]` citation patterns.

### Promise Tracker: New Section Pattern

**What:** Promise Tracker is a new Full Story section (7th entry in SECTION_DEFS), following the same conditional dispatch pattern used for checklists and debates.

**FullStory.jsx dispatch pattern (lines 374-399):**
```javascript
if (CHECKLIST_KEYS.has(def.key)) {
  content = <ChecklistRenderer section={section} ... />;
} else if (def.key === 'inversion_rebuttal') {
  content = <DebateRenderer section={section} ... />;
} else {
  content = <SectionRenderer section={section} ... />;
}
```

**Promise Tracker addition:**
```javascript
// Add to dispatch:
} else if (def.key === 'promise_tracker') {
  content = <PromiseTracker promises={fullStoryData?.promises || []} ... />;
}
```

**SECTION_DEFS addition:**
```javascript
// Current: 6 entries
// Add as 7th:
{ key: 'promise_tracker', label: 'Management Promise Tracker' },
```

**Data source:** Promise data comes from the pipeline-generated Full Story JSON (`fullStoryData.promises`), NOT from a section in the sections array. The Promise Tracker is a standalone data structure alongside the sections array.

### Promise Tracker Aggregate Bar Pattern

**What:** Reuse the exact ChecklistRenderer aggregate bar pattern for Promise Tracker credibility scoring.

**ChecklistRenderer pattern (lines 10-23):**
```javascript
function computeBarSegments(summary) {
  if (!summary) return [];
  const segments = [];
  if (summary.passCount > 0) segments.push({ flex: summary.passCount, color: C.green, label: 'pass' });
  if (summary.partialCount > 0) segments.push({ flex: summary.partialCount, color: C.yellow, label: 'partial' });
  if (summary.failCount > 0) segments.push({ flex: summary.failCount, color: C.red, label: 'fail' });
  return segments;
}
```

**Promise Tracker equivalent:**
```javascript
function computePromiseBarSegments(promises) {
  if (!promises || !promises.length) return [];
  const counts = { KEPT: 0, PARTIAL: 0, BROKEN: 0, PENDING: 0 };
  for (const p of promises) counts[p.status] = (counts[p.status] || 0) + 1;
  const segments = [];
  if (counts.KEPT > 0) segments.push({ flex: counts.KEPT, color: C.green, label: 'kept' });
  if (counts.PARTIAL > 0) segments.push({ flex: counts.PARTIAL, color: C.yellow, label: 'partial' });
  if (counts.BROKEN > 0) segments.push({ flex: counts.BROKEN, color: C.red, label: 'broken' });
  if (counts.PENDING > 0) segments.push({ flex: counts.PENDING, color: C.badge, label: 'pending' });
  return segments;
}
```

### Promise Status Badge Pattern

**What:** Promise status badges (KEPT/BROKEN/PARTIAL/PENDING) map directly to existing VerdictBadge statuses.

| Promise Status | VerdictBadge Equivalent | Color | Icon |
|---------------|------------------------|-------|------|
| KEPT | PASS | C.green | Checkmark |
| BROKEN | FAIL | C.red | X mark |
| PARTIAL | PARTIAL | C.yellow | Wave |
| PENDING | REVIEW | C.badge/C.badgeText | Clock |

**Implementation choice:** Create a thin `PromiseStatusBadge` component that maps promise statuses to VerdictBadge props, or extend VerdictBadge with the new status labels. A separate component is cleaner -- it avoids adding promise-specific logic to a general-purpose badge component.

### Glossary Term Positioning Pattern

**What:** IndustryCard positioning uses `getBoundingClientRect` from the click target to position the popover below the term.

**Pattern:**
```javascript
function handleGlossaryClick(term, e) {
  const rect = e.target.getBoundingClientRect();
  setIndustryCard({
    isOpen: true,
    term: term.term,
    category: term.category,
    definition: term.definition,
    benchmarks: term.benchmarks,
    position: {
      top: rect.bottom + 8,  // 8px gap below the term
      left: rect.left,
    },
  });
}
```

**Scroll handling:** IndustryCard uses `position: absolute` (not `fixed`). The `position` values must be relative to the nearest positioned ancestor. If the glossary card renders inside a scrollable container, the position calculation needs to account for scroll offset.

**UI Spec density limit:** Maximum 3 glossary terms per paragraph to avoid visual noise (from 23-UI-SPEC.md line 229).

### Anti-Patterns to Avoid

- **Anti-pattern: Pre-computing deep dives during pipeline runs.** Deep dives are on-demand (D-01). Never pre-generate them -- the user triggers them interactively.
- **Anti-pattern: Saving deep dives to the filesystem report JSON.** Deep dives go to the IndexedDB report envelope, not back to `.thes1s/reports/TICKER/full-story-api.json`.
- **Anti-pattern: Making Promise Tracker a sidebar.** It is a Full Story section (D-10), integrated with scroll spy and section nav.
- **Anti-pattern: Adding promise statuses to VerdictBadge.** Keep it as a separate PromiseStatusBadge to avoid polluting a general-purpose component.
- **Anti-pattern: Using react-markdown custom plugins for glossary/deep-dive injection.** Use the `components` prop override pattern already established in `ReportMarkdown.jsx` -- it is simpler and project-consistent.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Slide-out panel | Custom panel with animation | Existing `DeepDivePanel.jsx` | Already handles overlay, Escape, click-outside, animation, loading state |
| Glossary popover | Custom tooltip/popover | Existing `IndustryCard.jsx` | Already handles positioning, click-outside, styled content areas |
| Aggregate segmented bar | Custom proportional bar | ChecklistRenderer's `computeBarSegments` pattern | Proven pattern, exact same visual |
| Markdown rendering | Custom parser | Existing `ReportMarkdown.jsx` | Already handles citations, GFM tables, styled typography |
| Report persistence | localStorage, custom cache | `useResearch.updateReport` + `idbSet` | Already handles fire-and-forget IndexedDB writes with 10-year TTL |
| Status badges | Custom pill badges | VerdictBadge pattern (colors, icons, pill shape) | Established design system |

**Key insight:** This phase is mostly wiring, not building. The UI shells exist. The persistence layer exists. The pattern library exists. The primary engineering is connecting data → components and building the deepDive engine function.

## Common Pitfalls

### Pitfall 1: Report Data Split (Pipeline JSON vs Report Envelope)
**What goes wrong:** Deep dive content gets written to the wrong data layer -- either back to the filesystem (which pipeline will overwrite on next run) or only to React state (which disappears on refresh).
**Why it happens:** The app has two data layers for reports: pipeline JSON (read-only, from useFullStory/usePitchDeck) and the report envelope (read-write, from useResearch).
**How to avoid:** Deep dive responses MUST be stored in the report envelope via `updateReport`. Read pipeline data for `notableClaims[]` definitions; read/write deep dive responses to/from the report envelope.
**Warning signs:** Deep dives disappear on page refresh. Deep dives appear for wrong tickers. Re-running the pipeline deletes saved deep dives.

### Pitfall 2: ReportMarkdown Text Matching for Notable Claims
**What goes wrong:** "Tell me more" links don't appear because the notable claim text doesn't exactly match the rendered markdown text.
**Why it happens:** `react-markdown` transforms markdown syntax (bold, links, etc.) into React elements. A notable claim that spans across markdown formatting (e.g., includes a **bold** word) won't match a simple string comparison on rendered children.
**How to avoid:** Match notable claims at the paragraph level, not substring level. Pipeline should provide claim text that matches a full sentence within a paragraph. Use paragraph-level detection (does this paragraph contain this claim sentence?) rather than character-position-based insertion.
**Warning signs:** Some "Tell me more" links appear but others don't. Links appear in wrong positions. Links break when narrative has markdown formatting.

### Pitfall 3: Glossary Popover Positioning Under Scroll
**What goes wrong:** IndustryCard popover appears at wrong position, especially after scrolling.
**Why it happens:** `getBoundingClientRect()` returns viewport-relative coordinates, but `position: absolute` positions relative to the nearest positioned ancestor. Scrolling changes the relationship.
**How to avoid:** Either (a) render IndustryCard with `position: fixed` (viewport-relative), or (b) compute the position relative to the scrollable container. Option (a) is simpler and consistent with DeepDivePanel's fixed positioning.
**Warning signs:** Popover appears offset from the term. Popover position changes when scrolling while it's open.

### Pitfall 4: Claude API Error Handling in Browser
**What goes wrong:** User clicks "Tell me more", sees infinite spinner because the Claude API call fails silently.
**Why it happens:** API key missing/invalid, rate limiting, network issues. The `companyAdapter.js` pattern logs warnings but doesn't surface errors to the user.
**How to avoid:** Deep dive engine must return `{ content, error }`. Component must show error state in the panel (UI-SPEC specifies: "Unable to generate deep dive. Check your Claude API key in Settings and try again.").
**Warning signs:** "Analyzing..." spinner never resolves. No console output. User doesn't know what went wrong.

### Pitfall 5: Promise Tracker Data Absence
**What goes wrong:** Promise Tracker section renders but shows empty state for all reports because pipeline hasn't been updated to emit `promises[]`.
**Why it happens:** The pipeline (D-08) needs to be updated to extract promises during report generation. If that pipeline work hasn't been done yet, existing reports will have no promise data.
**How to avoid:** Design the component to gracefully handle missing data with the empty state specified in the UI-SPEC. The Promise Tracker UI can be fully built and tested with mock data before the pipeline is updated. The pipeline update is a separate concern.
**Warning signs:** All reports show "No Promises Tracked" empty state.

### Pitfall 6: Glossary Term Density Causing Visual Noise
**What goes wrong:** Every other word in the narrative has a dashed underline, making the text unreadable.
**Why it happens:** Pipeline marks too many terms, or density limit isn't enforced in the renderer.
**How to avoid:** Enforce the 3-terms-per-paragraph limit in the renderer (UI-SPEC line 229). Count glossary terms per paragraph and only render the first 3.
**Warning signs:** Paragraphs look like they have a highlight party. User complains text is hard to read.

## Code Examples

### Deep Dive Engine Function
```javascript
// Source: Pattern from src/engines/companyAdapter.js lines 185-201
// New file: src/engines/deepDive.js

import { CLAUDE_KEY } from './config';

const MODEL = 'claude-sonnet-4-20250514';
const MAX_DEPTH = 3;

export async function generateDeepDive({ claim, sectionContext, previousDives = [] }) {
  if (!CLAUDE_KEY) return { content: null, error: 'Claude API key not configured.' };

  const depth = previousDives.length + 1;
  if (depth > MAX_DEPTH) return { content: null, error: 'Maximum analysis depth reached.' };

  const messages = [{
    role: 'user',
    content: buildDeepDivePrompt(claim, sectionContext, previousDives, depth),
  }];

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CLAUDE_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2048,
        messages,
      }),
    });

    if (!response.ok) {
      return { content: null, error: `API error: ${response.status}` };
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';
    return { content: text, error: null };
  } catch (err) {
    return { content: null, error: err.message };
  }
}
```

### Notable Claims Rendering in ReportMarkdown
```javascript
// Enhancement to ReportMarkdown.jsx makeComponents function
// Add notableClaims scanning to paragraph rendering

p: ({ children }) => {
  // Existing citation processing
  let processed = citations?.length > 0
    ? processChildrenWithCitations(children, citations, onCitationClick)
    : children;

  // Notable claims: append "Tell me more" link after matching sentences
  if (notableClaims?.length > 0) {
    processed = processChildrenWithClaims(processed, notableClaims, onDeepDiveClick);
  }

  // Glossary terms: wrap matching terms with dashed-underline spans
  if (glossaryTerms?.length > 0) {
    processed = processChildrenWithGlossary(processed, glossaryTerms, onGlossaryClick, 3);
  }

  return <p style={{ margin: 0, marginBottom: 12, lineHeight: 1.7 }}>{processed}</p>;
},
```

### PromiseTracker Component Structure
```javascript
// New file: src/components/PromiseTracker.jsx
// Follows ChecklistRenderer pattern exactly

export default function PromiseTracker({ promises, sectionId }) {
  const [expanded, setExpanded] = useState(new Set());

  function toggle(index) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(index) ? next.delete(index) : next.add(index);
      return next;
    });
  }

  const segments = computePromiseBarSegments(promises);
  const scoreText = formatPromiseScoreText(promises);

  return (
    <div id={sectionId} style={{ /* card styles matching SectionRenderer */ }}>
      {/* Section Header */}
      {/* Aggregate Bar */}
      {/* Timeline Cards */}
      {promises.map((promise, i) => (
        <PromiseCard
          key={i}
          promise={promise}
          isExpanded={expanded.has(i)}
          onToggle={() => toggle(i)}
        />
      ))}
    </div>
  );
}
```

## Data Structures

### Pipeline-Provided Data (Read-Only)

**notableClaims[] per section** (added by pipeline, stored in pipeline JSON):
```json
{
  "notableClaims": [
    {
      "text": "Revenue grew 21% year-over-year, outpacing the specialty grocery sector's 4% average.",
      "context": "This claim is notable because it demonstrates exceptional growth relative to peers."
    }
  ]
}
```

**glossaryTerms[] per section** (added by pipeline, stored in pipeline JSON):
```json
{
  "glossaryTerms": [
    {
      "term": "same-store sales",
      "category": "Retail KPI",
      "definition": "Revenue growth from stores open for at least one year, excluding new store openings.",
      "benchmarks": [
        { "label": "SFM", "value": "+8.2%", "isCompany": true },
        { "label": "Industry Avg", "value": "+3.1%", "isCompany": false }
      ]
    }
  ]
}
```

**promises[] top-level** (added by pipeline, stored in pipeline JSON):
```json
{
  "promises": [
    {
      "quote": "We expect to deliver 15% revenue growth in FY2025.",
      "quarterYear": "Q3 2024",
      "category": "Revenue Growth",
      "status": "KEPT",
      "evidence": "Achieved 17.2% revenue growth in FY2025, exceeding the 15% target."
    }
  ]
}
```

### Deep Dive Storage (Read-Write, Report Envelope)

Deep dive responses are stored in the report envelope (IndexedDB via useResearch), not the pipeline JSON:
```json
{
  "deepDives": {
    "event_analysis:0": [
      {
        "depth": 1,
        "content": "Expanded analysis text...",
        "generatedAt": "2026-04-03T10:30:00Z"
      },
      {
        "depth": 2,
        "content": "Even deeper analysis...",
        "generatedAt": "2026-04-03T10:31:00Z"
      }
    ]
  }
}
```

Key format: `{sectionKey}:{claimIndex}` -- e.g., `"event_analysis:0"` for the first notable claim in the Event Analysis section. This allows multiple deep dive chains across different sections and claims.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| AssumptionTracker sidebar | Promise Tracker section | Phase 23 CONTEXT | New component replaces deprecated one |
| Pre-computed deep dives | On-demand Claude API calls | Phase 23 CONTEXT D-01 | User-triggered, not pipeline-generated |
| Transient deep dive display | Permanent report storage | Phase 23 CONTEXT D-03 | Deep dives saved to IndexedDB report |

**Deprecated/outdated:**
- `AssumptionTracker.jsx`: Will be deprecated by this phase. PitchDeck.jsx currently renders it (line 1153-1156). Should be removed from PitchDeck imports and rendering.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.0 |
| Config file | none (uses vite.config.js defaults) |
| Quick run command | `npm test -- --run` |
| Full suite command | `npm test -- --run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DLT-01 | Deep dive engine returns content from mock API; handles errors; respects max depth | unit | `npm test -- --run src/engines/__tests__/deepDive.test.js` | Wave 0 |
| DLT-01 | DeepDivePanel "Go Deeper" button shows depth counter, disabled at max | unit | `npm test -- --run src/components/__tests__/deepDivePanel.test.js` | Wave 0 |
| DLT-02 | PromiseTracker computePromiseBarSegments counts statuses correctly | unit | `npm test -- --run src/components/__tests__/promiseTracker.test.js` | Wave 0 |
| DLT-02 | PromiseTracker formatPromiseScoreText produces correct middot format | unit | `npm test -- --run src/components/__tests__/promiseTracker.test.js` | Wave 0 |
| DLT-03 | Glossary term density limited to 3 per paragraph | unit | `npm test -- --run src/components/__tests__/glossaryHelpers.test.js` | Wave 0 |
| DLT-04 | No test needed -- deferred | n/a | n/a | n/a |

### Sampling Rate
- **Per task commit:** `npm test -- --run`
- **Per wave merge:** `npm test -- --run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/engines/__tests__/deepDive.test.js` -- covers DLT-01 engine logic (mock fetch, error handling, max depth)
- [ ] `src/components/__tests__/promiseTracker.test.js` -- covers DLT-02 aggregate bar + score text
- [ ] `src/components/__tests__/glossaryHelpers.test.js` -- covers DLT-03 density limiting

## Integration Points Summary

### Files Modified
| File | Change | Risk |
|------|--------|------|
| `src/components/SectionRenderer.jsx` | Accept + render `notableClaims[]` and `glossaryTerms[]` with new props and text processing | MEDIUM -- core rendering component, must not break existing sections |
| `src/components/ReportMarkdown.jsx` | Extend `makeComponents` to support claim links and glossary spans in paragraph rendering | MEDIUM -- already processes citations, adding more text processing |
| `src/components/pitchDeck/DeepDivePanel.jsx` | Add "Go Deeper" button, depth counter, content append separator | LOW -- additive changes to existing component |
| `src/components/FullStory.jsx` | Add Promise Tracker to SECTION_DEFS (7th), add deep dive + glossary state, render overlays | MEDIUM -- modifying section loop and state |
| `src/components/PitchDeck.jsx` | Wire existing deep dive + glossary state to real data from sections | LOW -- structure already exists at lines 337-340 |

### New Files
| File | Purpose |
|------|---------|
| `src/engines/deepDive.js` | Claude API call for on-demand deep dive analysis |
| `src/components/PromiseTracker.jsx` | Promise Tracker section renderer (aggregate bar + timeline cards) |
| `src/components/PromiseStatusBadge.jsx` | KEPT/BROKEN/PARTIAL/PENDING pill badges |
| `src/engines/__tests__/deepDive.test.js` | Deep dive engine tests |
| `src/components/__tests__/promiseTracker.test.js` | Promise Tracker aggregate logic tests |
| `src/components/__tests__/glossaryHelpers.test.js` | Glossary density limit tests |

### Components Reused As-Is
| Component | Usage |
|-----------|-------|
| `DeepDivePanel.jsx` | Slide-out panel (enhanced with "Go Deeper") |
| `IndustryCard.jsx` | Glossary popover (no changes needed) |
| `VerdictBadge.jsx` | Section-level verdict on Promise Tracker header |
| `ConfidenceBadge.jsx` | Section-level confidence on Promise Tracker header |
| `ReportMarkdown.jsx` | Markdown rendering in Promise Tracker evidence |
| `ChecklistRenderer.jsx` | Pattern reference for aggregate bar (not imported) |

## Open Questions

1. **Pipeline data availability**
   - What we know: Pipeline needs to add `notableClaims[]`, `glossaryTerms[]`, and `promises[]` to report JSON
   - What's unclear: Whether pipeline changes are part of Phase 23 or a separate phase
   - Recommendation: Build UI components with mock data support. The UI can render with empty arrays and show appropriate empty states. Pipeline changes can be done separately.

2. **Deep dive prompt design**
   - What we know: Need to send claim text + section context to Claude for expanded analysis
   - What's unclear: Optimal prompt structure for investment research deep dives
   - Recommendation: This is explicitly "Claude's Discretion" per CONTEXT.md. Start with a simple prompt (claim + section summary + company ticker) and iterate based on output quality.

3. **Glossary term matching accuracy**
   - What we know: Pipeline provides `glossaryTerms[]` per section with term text
   - What's unclear: Whether pipeline-provided term text will exactly match rendered narrative text (case sensitivity, plural forms, etc.)
   - Recommendation: Use case-insensitive matching. Handle common variations (e.g., match "same-store sales" even if narrative says "Same-Store Sales").

## Sources

### Primary (HIGH confidence)
- `src/engines/companyAdapter.js` -- Verified Claude API browser call pattern (lines 185-201)
- `src/components/pitchDeck/DeepDivePanel.jsx` -- Verified existing panel implementation
- `src/components/pitchDeck/IndustryCard.jsx` -- Verified existing popover implementation
- `src/components/ChecklistRenderer.jsx` -- Verified aggregate bar pattern
- `src/components/FullStory.jsx` -- Verified SECTION_DEFS structure and dispatch pattern
- `src/components/SectionRenderer.jsx` -- Verified narrative rendering flow
- `src/components/ReportMarkdown.jsx` -- Verified markdown component override pattern
- `src/hooks/useResearch.js` -- Verified updateReport and IndexedDB persistence pattern
- `src/hooks/useFullStory.js` -- Verified report data loading pattern
- `src/components/VerdictBadge.jsx` -- Verified badge pattern for status mapping
- `.thes1s/reports/SFM/full-story-api.json` -- Verified actual report data structure
- `.planning/phases/23-delight-feature-wiring/23-UI-SPEC.md` -- Verified visual specifications
- `.planning/phases/23-delight-feature-wiring/23-CONTEXT.md` -- Verified all locked decisions

### Secondary (MEDIUM confidence)
- [Anthropic dangerous direct browser access](https://simonwillison.net/2024/Aug/23/anthropic-dangerous-direct-browser-access/) -- CORS support confirmation
- [Anthropic TypeScript SDK](https://github.com/anthropics/anthropic-sdk-typescript) -- SDK vs direct fetch context

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new libraries, all existing patterns verified in codebase
- Architecture: HIGH -- all integration points verified with line numbers in source code
- Pitfalls: HIGH -- identified from actual codebase structure and data flow analysis
- Data structures: MEDIUM -- pipeline data shapes are specifications from CONTEXT.md, not yet implemented

**Research date:** 2026-04-03
**Valid until:** 2026-05-03 (30 days -- stable codebase, no fast-moving dependencies)
