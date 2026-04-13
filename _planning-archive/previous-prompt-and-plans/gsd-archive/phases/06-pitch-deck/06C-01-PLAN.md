---
phase: 06-pitch-deck
plan: 06C-01
type: execute
wave: 4
depends_on: [06B-01]
files_modified:
  - src/components/SectionRenderer.jsx
  - src/components/ConfidenceBadge.jsx
  - src/hooks/usePitchDeck.js
  - vite.config.js
autonomous: true
requirements: [PTCH-02]
must_haves:
  truths:
    - "SectionRenderer.jsx formats data grid values with fmtNum/fmtDollar/fmtPct"
    - "SectionRenderer.jsx parses markdown in narrative text (paragraphs, bold, subheadings)"
    - "ConfidenceBadge.jsx shows label prefix 'CONFIDENCE:'"
    - "usePitchDeck hook fetches pitch-deck.json and progress with polling"
    - "Vite middleware serves pitch-deck.json at /api/thes1s/reports/{ticker}/pitch-deck"
  artifacts:
    - path: "src/hooks/usePitchDeck.js"
      provides: "Pitch Deck report loading hook"
      exports: ["usePitchDeck"]
    - path: "src/components/SectionRenderer.jsx"
      provides: "Improved section renderer with formatted data + markdown parsing"
      contains: "fmtNum"
    - path: "src/components/ConfidenceBadge.jsx"
      provides: "Updated confidence badge with label"
      contains: "CONFIDENCE"
  key_links:
    - from: "src/hooks/usePitchDeck.js"
      to: "vite.config.js"
      via: "fetch /api/thes1s/reports/{ticker}/pitch-deck"
      pattern: "pitch-deck"
    - from: "src/components/SectionRenderer.jsx"
      to: "src/engines/keyMetrics.js"
      via: "fmtNum/fmtDollar/fmtPct formatters"
      pattern: "fmtNum"
---

<objective>
Fix Phase 5B/5D UI debt in shared components (SectionRenderer, ConfidenceBadge) and create the usePitchDeck hook + Vite middleware extension for pitch-deck.json serving.

Purpose: SectionRenderer improvements benefit both One Pager and Pitch Deck display. The usePitchDeck hook and middleware extension enable PitchDeck.jsx (next plan) to load and display generated reports.
Output: Improved shared components + new hook + middleware extension.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/phases/06-pitch-deck/06-CONTEXT.md
@.planning/phases/06-pitch-deck/06-UI-SPEC.md

<interfaces>
From src/hooks/useOnePager.js (pattern to clone):
```javascript
export function useOnePager(ticker) {
  // Returns { report, progress, loading, error }
  // Fetches /api/thes1s/reports/{ticker}/one-pager and /api/thes1s/reports/{ticker}/progress
  // Polls progress every 2s during generation
  // Re-fetches report when progress.state === 'COMPLETE'
}
```

From src/components/SectionRenderer.jsx (to improve):
- Renders section header, summary callout, verdict/confidence badges, narrative, data grid, tables, red flags, citations
- Data grid renders raw key:value pairs without formatting
- Narrative renders as plain text without markdown parsing
- _testExports: { camelToTitle, formatDataValue }

From vite.config.js thes1sReportsPlugin:
- Serves /api/thes1s/reports/{ticker}/one-pager from .thes1s/reports/{ticker}/one-pager.json
- Serves /api/thes1s/reports/{ticker}/progress from .thes1s/reports/{ticker}/progress.json
- Listing endpoint: /api/thes1s/reports lists tickers

Formatters from src/engines/keyMetrics.js:
```javascript
export function fmtNum(n, decimals) { ... }  // "1.23B", "45.6M"
export function fmtDollar(n) { ... }         // "$1.23B"
export function fmtPct(n, decimals) { ... }  // "12.3%"
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix SectionRenderer UI debt (data formatting + markdown parsing + confidence badge label)</name>
  <files>
    src/components/SectionRenderer.jsx
    src/components/ConfidenceBadge.jsx
  </files>
  <read_first>
    src/components/SectionRenderer.jsx
    src/components/ConfidenceBadge.jsx
    src/engines/keyMetrics.js
    .planning/phases/06-pitch-deck/06-UI-SPEC.md
  </read_first>
  <action>
Apply UI debt fixes from 05B-UI-POLISH-NOTES.md and 05D-UI-POLISH-NOTES.md (documented in UI-SPEC "Prior Phase UI Debt" section).

**ConfidenceBadge.jsx fix:**
- Change badge text from just "HIGH"/"MEDIUM"/"LOW" to "CONFIDENCE: HIGH"/"CONFIDENCE: MEDIUM"/"CONFIDENCE: LOW"
- This is a single string change in the render output

**SectionRenderer.jsx fixes (4 improvements):**

1. **Data grid formatting:** Import `fmtNum`, `fmtDollar`, `fmtPct` from `../engines/keyMetrics.js`. In the data grid rendering section, apply formatters based on value type:
   - If key contains "revenue", "income", "debt", "assets", "cash", "capex", "market_cap", "book_value", "earnings", "fcf", "price": use `fmtDollar(value)`
   - If key contains "margin", "ratio", "yield", "growth", "return", "pct", "rate": use `fmtPct(value)`
   - If key is numeric and > 1000: use `fmtNum(value)`
   - If value is '--' or null or undefined: display '--'
   - If value is string (non-numeric): display as-is
   - Group data grid entries by category if more than 8 entries: use the first word of the key as category header (e.g., "Revenue Growth" and "Revenue TTM" group under "Revenue")

2. **Narrative markdown parsing:** Replace plain text rendering of narrative with basic markdown parsing. Create an inline `parseMarkdown(text)` function that:
   - Splits on double newlines to create paragraphs (wrap each in `<p>` with marginBottom 12px)
   - Converts `**text**` to `<strong>` with fontWeight 700
   - Converts `### Heading` to styled div (fontSize 14, fontWeight 700, marginTop 16, marginBottom 8)
   - Converts `## Heading` to styled div (fontSize 15, fontWeight 700, marginTop 20, marginBottom 10)
   - Converts `- item` bullet lists to styled list items with 6px circle bullet in C.textMuted
   - Preserves `[N]` citation markers (do not parse as markdown links)
   - Returns array of React elements

3. **Summary callout parsing:** Apply the same bullet-point detection to the summary field. If summary contains `- ` prefixed lines, render as a bulleted list instead of a paragraph.

4. **Citation visibility:** After the narrative section, if citations array is non-empty, render a "Citations" sub-section with numbered list of all citations for that section. Each citation shows: `[N] source — note` with C.textSecondary styling. This makes citations visible even if agents didn't include `[N]` markers inline.

All changes use inline styles with C palette. No CSS files.
  </action>
  <verify>
    <automated>grep -c "fmtNum\|fmtDollar\|fmtPct" src/components/SectionRenderer.jsx && grep -c "CONFIDENCE" src/components/ConfidenceBadge.jsx && grep -c "parseMarkdown\|parseMd" src/components/SectionRenderer.jsx && npx vitest run src/components/__tests__/sectionRenderer.test.js -x 2>/dev/null; echo "verify done"</automated>
  </verify>
  <acceptance_criteria>
    - SectionRenderer.jsx imports fmtNum, fmtDollar, or fmtPct from keyMetrics.js
    - SectionRenderer.jsx contains a parseMarkdown or similar function that handles `**bold**` and paragraph splitting
    - SectionRenderer.jsx data grid section applies dollar/percent/number formatting based on field name patterns
    - SectionRenderer.jsx renders a "Citations" sub-section when citations array is non-empty
    - ConfidenceBadge.jsx renders text starting with "CONFIDENCE:" prefix
    - Existing _testExports (camelToTitle, formatDataValue) still exported and functional
    - `npx vitest run` all tests pass (no regressions from formatter changes)
  </acceptance_criteria>
  <done>Shared components fixed: data grids show formatted values, narratives render markdown structure, confidence badge labeled, citations visible per section</done>
</task>

<task type="auto">
  <name>Task 2: Create usePitchDeck hook + extend Vite middleware for pitch-deck.json</name>
  <files>
    src/hooks/usePitchDeck.js
    vite.config.js
  </files>
  <read_first>
    src/hooks/useOnePager.js
    vite.config.js
  </read_first>
  <action>
**usePitchDeck.js:** Clone useOnePager.js pattern with these changes:
- Fetch URL: `/api/thes1s/reports/${ticker}/pitch-deck` (instead of `/one-pager`)
- Same progress polling pattern (every 2s, stop when COMPLETE)
- Same { report, progress, loading, error } return shape
- Same cancellation via `let cancelled = false` + cleanup
- Import pattern: `export function usePitchDeck(ticker) { ... }`

```javascript
import { useState, useEffect, useCallback } from 'react';

export function usePitchDeck(ticker) {
  const [report, setReport] = useState(null);
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!ticker) { setLoading(false); return; }
    let cancelled = false;
    let pollInterval = null;

    const fetchReport = async () => {
      try {
        const res = await fetch(`/api/thes1s/reports/${ticker}/pitch-deck`);
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setReport(data);
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    };

    const fetchProgress = async () => {
      try {
        const res = await fetch(`/api/thes1s/reports/${ticker}/progress`);
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) {
            setProgress(data);
            if (data.state === 'COMPLETE') {
              clearInterval(pollInterval);
              fetchReport();
            }
          }
        }
      } catch (_) { /* progress endpoint may not exist yet */ }
    };

    const init = async () => {
      await fetchReport();
      await fetchProgress();
      if (!cancelled) setLoading(false);
      pollInterval = setInterval(fetchProgress, 2000);
    };

    init();

    return () => {
      cancelled = true;
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [ticker]);

  return { report, progress, loading, error };
}
```

**vite.config.js update:** Extend thes1sReportsPlugin to serve pitch-deck.json. In the existing middleware handler, add a route for `/api/thes1s/reports/:ticker/pitch-deck` that serves `.thes1s/reports/{ticker}/pitch-deck.json`. The existing handler already handles `/one-pager` and `/progress` — add `pitch-deck` using the same pattern.

Also update the listing endpoint to include tickers that have pitch-deck.json (not just one-pager.json). The listing should check for either file.
  </action>
  <verify>
    <automated>test -f src/hooks/usePitchDeck.js && grep -c "pitch-deck" src/hooks/usePitchDeck.js && grep -c "pitch-deck" vite.config.js && node -e "const fs = require('fs'); const content = fs.readFileSync('src/hooks/usePitchDeck.js', 'utf8'); console.assert(content.includes('usePitchDeck'), 'missing export'); console.assert(content.includes('progress'), 'missing progress'); console.log('PASS')"</automated>
  </verify>
  <acceptance_criteria>
    - src/hooks/usePitchDeck.js exists with `export function usePitchDeck(ticker)`
    - Hook fetches from `/api/thes1s/reports/${ticker}/pitch-deck`
    - Hook returns `{ report, progress, loading, error }` object
    - Hook polls progress every 2000ms and stops when state is COMPLETE
    - Hook has cleanup function that sets cancelled flag and clears interval
    - vite.config.js middleware handles `/api/thes1s/reports/:ticker/pitch-deck` URL pattern
    - vite.config.js reads from `.thes1s/reports/{ticker}/pitch-deck.json`
    - Listing endpoint checks for both one-pager.json and pitch-deck.json
  </acceptance_criteria>
  <done>usePitchDeck hook ready for PitchDeck.jsx consumption, Vite middleware serves pitch-deck.json and progress</done>
</task>

</tasks>

<verification>
- `npx vitest run` all tests pass
- SectionRenderer changes verified visually (existing COST one-pager should show formatted data)
- usePitchDeck.js exists and follows useOnePager.js pattern
- vite.config.js serves pitch-deck endpoint
</verification>

<success_criteria>
Shared UI components improved (data formatting, markdown parsing, confidence labels, citation visibility). usePitchDeck hook and Vite middleware ready for PitchDeck.jsx to consume.
</success_criteria>

<output>
After completion, create `.planning/phases/06-pitch-deck/06C-01-SUMMARY.md`
</output>
