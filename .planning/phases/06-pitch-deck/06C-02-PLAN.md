---
phase: 06-pitch-deck
plan: 06C-02
type: execute
wave: 5
depends_on: [06C-01]
files_modified:
  - src/components/PitchDeck.jsx
  - src/components/SensitivityTable.jsx
  - src/App.jsx
autonomous: false
requirements: [PTCH-02, PTCH-05, PTCH-06]
must_haves:
  truths:
    - "PitchDeck.jsx renders all 10 sections via SectionRenderer"
    - "PitchDeck.jsx has a 3-phase progress indicator"
    - "PitchDeck.jsx has a 10-item sticky section nav with scroll tracking"
    - "SensitivityTable.jsx renders 2D matrix with MOS proximity coloring"
    - "FGR derivation display shows 5 inputs with confidence badges"
    - "Approval bar appears when generation is complete"
    - "Route /research/:id/pitch-deck is wired in App.jsx"
  artifacts:
    - path: "src/components/PitchDeck.jsx"
      provides: "Complete Pitch Deck report viewer"
      min_lines: 400
      contains: "PitchDeck"
    - path: "src/components/SensitivityTable.jsx"
      provides: "Reusable sensitivity table component"
      contains: "SensitivityTable"
  key_links:
    - from: "src/components/PitchDeck.jsx"
      to: "src/hooks/usePitchDeck.js"
      via: "hook import for report data"
      pattern: "usePitchDeck"
    - from: "src/components/PitchDeck.jsx"
      to: "src/components/SectionRenderer.jsx"
      via: "section rendering"
      pattern: "SectionRenderer"
    - from: "src/components/SensitivityTable.jsx"
      to: "src/components/CollapsibleSection.jsx"
      via: "wrapper for each sensitivity table"
      pattern: "CollapsibleSection"
    - from: "src/App.jsx"
      to: "src/components/PitchDeck.jsx"
      via: "route definition"
      pattern: "pitch-deck"
---

<objective>
Create PitchDeck.jsx (master layout with 10 sections, phase progress, sticky nav, checkpoints, FGR display, approval gate) and SensitivityTable.jsx (2D assumption matrix with color coding). Wire route in App.jsx.

Purpose: This is the primary Pitch Deck display component — the user's view of the complete generated Pitch Deck. Follows OnePager.jsx patterns but adds phase progress, checkpoint audit trail, sensitivity tables, FGR derivation display, and 10-section navigation.
Output: PitchDeck.jsx (400+ lines), SensitivityTable.jsx (150+ lines), App.jsx route update.
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
@.planning/phases/05B-one-pager-display-components/05B-EXECUTIVE-SUMMARY.md

<interfaces>
From src/components/OnePager.jsx (557 lines, pattern to follow):
- useMemo for section status computation
- IntersectionObserver for scroll tracking (threshold 0.3, rootMargin '-80px 0px -60% 0px')
- Sticky nav on left (200px), content column (flex: 1)
- Report hero with company name + ticker + overall verdict
- Progress bar + per-section loading states during generation
- Approval bar with Approve/Reject buttons
- _testExports for helper functions

From src/hooks/usePitchDeck.js (created in 06C-01):
```javascript
export function usePitchDeck(ticker)
// Returns { report, progress, loading, error }
```

From src/components/SectionRenderer.jsx:
- Renders a single section from ReportSectionSchema JSON
- Props: section object, sectionRefs, scrollToSection (for citation jump)

From UI-SPEC state contract — pitch deck report shape:
```javascript
{
  sections: [/* 10 ReportSectionSchema objects */],
  checkpoints: [{ afterPhase, dataGaps, pmNotes, sectionConfidence }],
  fgrDerivation: { finalLow, finalHigh, inputs: [{ name, value, confidence, source }] },
  sensitivityTables: { mos: { rowLabel, colLabel, rows, cols, cells }, ... },
  assumptions: [{ key, label, value, confidence, source, affectsSections }],
  overallVerdict: 'PASS|FAIL|WATCHLIST',
}
```

From UI-SPEC — phase progress states:
- Complete: filled circle C.green + solid connector
- Active: pulsing circle C.accent + solid left, dashed right
- Pending: empty circle C.border + dashed connector

From UI-SPEC — sensitivity table props:
```javascript
SensitivityTable({ title, rowLabel, colLabel, rowValues, colValues, computeCell, formatRow, formatCol, formatCell, currentRow, currentCol, currentPrice })
```

From UI-SPEC — section nav (10 items):
- radar, simple_predictable, market_position, barriers_moats, fcf, management, roe_roic_debt, balance_sheet, pest, valuation
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create SensitivityTable.jsx</name>
  <files>src/components/SensitivityTable.jsx</files>
  <read_first>
    .planning/phases/06-pitch-deck/06-UI-SPEC.md
    src/components/CollapsibleSection.jsx
    src/theme.js
  </read_first>
  <action>
Create SensitivityTable.jsx following the UI-SPEC design contract exactly.

**Props interface:**
```javascript
export default function SensitivityTable({
  title,          // "MOS Buy Price Sensitivity"
  rowLabel,       // "FGR (%)"
  colLabel,       // "EPS ($)"
  rowValues,      // [0.08, 0.10, 0.12, 0.14, 0.16]
  colValues,      // [5.00, 5.50, 6.00, 6.50, 7.00]
  computeCell,    // (rowVal, colVal) => number | null
  formatRow,      // (val) => "12%"
  formatCol,      // (val) => "$6.00"
  formatCell,     // (val) => "$107"
  currentRow,     // 0.12 -- highlight intersection
  currentCol,     // 6.00 -- highlight intersection
  currentPrice,   // 185.50 -- for MOS proximity coloring
})
```

**Implementation details:**
- Import { C } from '../theme'
- Render a table element with inline styles per UI-SPEC:
  - Title: 16px / 700, C.text
  - Subtitle (axis labels): 10px / 700, C.textSecondary, displayed as "Rows: {rowLabel} | Columns: {colLabel}"
  - Column headers: 10px / 700, C.textMuted, right-aligned
  - Row headers: 10px / 700, C.textMuted, left-aligned
  - Cell values: 13px / 400, C.text, right-aligned, fontVariantNumeric: 'tabular-nums'
  - Cell padding: 8px 12px
  - Table border: 1px solid C.border (outer), 1px solid C.borderLight (inner rows)

- **Current input intersection cell:** When rowValues[i] === currentRow AND colValues[j] === currentCol, apply: 13px / 700, color C.accent, background C.accentLight, borderRadius 4px

- **MOS proximity coloring** (only when currentPrice is not null):
  - Cell value < currentPrice (undervalued): background C.greenBg, color C.green
  - Cell value within 20% of currentPrice (|buy - current| / current < 0.2): background C.yellowBg, color C.yellow
  - Cell value > currentPrice * 1.2 (overvalued): default styling (no background)
  - **Guard against null/negative** (per Pitfall 6): if computeCell returns null or <= 0, render '--' with default styling. If currentPrice is null/undefined, skip all color coding.

- **_testExports:** Export `getCellColor(cellValue, currentPrice)` for unit testing:
  ```javascript
  export function getCellColor(cellValue, currentPrice) {
    if (cellValue == null || cellValue <= 0 || currentPrice == null) return null;
    if (cellValue < currentPrice) return 'undervalued';
    if (cellValue < currentPrice * 1.2) return 'near';
    return 'overvalued';
  }
  ```
  Place under `export const _testExports = { getCellColor };`

The component should be ~150-200 lines with inline styles.
  </action>
  <verify>
    <automated>test -f src/components/SensitivityTable.jsx && grep -c "SensitivityTable" src/components/SensitivityTable.jsx && grep -c "currentPrice" src/components/SensitivityTable.jsx && grep -c "_testExports" src/components/SensitivityTable.jsx && grep -c "getCellColor" src/components/SensitivityTable.jsx</automated>
  </verify>
  <acceptance_criteria>
    - src/components/SensitivityTable.jsx exists with `export default function SensitivityTable`
    - Component accepts all props from UI-SPEC interface (title, rowLabel, colLabel, rowValues, colValues, computeCell, formatRow, formatCol, formatCell, currentRow, currentCol, currentPrice)
    - getCellColor function exported via _testExports handles null/negative values gracefully
    - Intersection cell highlighted with C.accent color and C.accentLight background
    - MOS proximity coloring uses C.greenBg, C.yellowBg based on currentPrice comparison
    - All styling is inline using C palette from theme.js
    - Font sizes match UI-SPEC: title 16px/700, headers 10px/700, cells 13px/400
  </acceptance_criteria>
  <done>SensitivityTable.jsx renders 2D assumption matrix with MOS proximity coloring and null/edge case guards</done>
</task>

<task type="auto">
  <name>Task 2: Create PitchDeck.jsx with full layout + wire route</name>
  <files>
    src/components/PitchDeck.jsx
    src/App.jsx
  </files>
  <read_first>
    src/components/OnePager.jsx
    src/components/SectionRenderer.jsx
    src/components/SensitivityTable.jsx
    src/components/VerdictBadge.jsx
    src/components/ConfidenceBadge.jsx
    src/components/CollapsibleSection.jsx
    src/hooks/usePitchDeck.js
    src/App.jsx
    src/theme.js
    .planning/phases/06-pitch-deck/06-UI-SPEC.md
  </read_first>
  <action>
Create PitchDeck.jsx following the UI-SPEC layout contract. Model after OnePager.jsx (557 lines) but extended for 10 sections + phase progress + checkpoints + sensitivity tables + FGR display.

**Imports:**
```javascript
import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { C } from '../theme';
import { usePitchDeck } from '../hooks/usePitchDeck';
import SectionRenderer from './SectionRenderer';
import SensitivityTable from './SensitivityTable';
import VerdictBadge from './VerdictBadge';
import ConfidenceBadge from './ConfidenceBadge';
import CollapsibleSection from './CollapsibleSection';
```

**Component structure per UI-SPEC layout:**

A. **Report Hero:**
- Ticker badge (C.accent, 13px/700) + company name (24px/700) + overall VerdictBadge (large size)
- "Stage 2: Pitch Deck" + generation timestamp + "Assumptions (N)" button (for 6D, render count if assumptions data present)
- Bottom border: 1px solid C.border, paddingBottom 16, marginBottom 24

B. **Phase Progress (inline, not separate component):**
- 3 horizontal phases: "Phase 1: Business Fundamentals", "Phase 2: Financial Deep-Dive", "Phase 3: Risk & Valuation"
- States based on progress data or section completion:
  - Determine phase completion by checking if all sections in that phase have data
  - Phase 1 sections: radar, simple_predictable, market_position (indexes 0-2)
  - Phase 2 sections: barriers_moats, fcf, management, roe_roic_debt, balance_sheet (indexes 3-7)
  - Phase 3 sections: pest, valuation (indexes 8-9)
- Visual per UI-SPEC: 24px circles, 2px connectors, 10px/700 labels below circles
- Total height: 64px, marginBottom 16

C. **Two-Column Layout:**
- Container: display flex, gap 24px
- **Sticky Nav (left, 200px):**
  - position sticky, top 72px, alignSelf flex-start
  - 10 nav items per UI-SPEC table: radar through valuation
  - Each item: 8px colored dot (section verdict color) + section number + truncated title (max 20 chars)
  - Active: C.bgHover background, fontWeight 700, C.text color
  - Inactive: transparent, fontWeight 400, C.textSecondary
  - role="button", tabIndex={0}, onClick + onKeyDown (Enter/Space) for scrollIntoView smooth
  - IntersectionObserver (threshold 0.3, rootMargin '-80px 0px -60% 0px') tracks active section

- **Content Column (right, flex: 1, minWidth: 0):**
  - Map over sections array, render each via SectionRenderer
  - Each section div has id={`section-${section.key}`} and ref callback for IntersectionObserver
  - scrollMarginTop: 120px per UI-SPEC

  - **Checkpoint display blocks** (per I-02): After sections in Phase 1 (index 2) and Phase 2 (index 7), if checkpoints data exists, render a checkpoint summary block:
    - Thin horizontal rule with phase label centered, C.border, marginTop/marginBottom 24px
    - Phase label: 13px/700, C.textSecondary
    - Data gaps: bulleted list if any
    - PM notes: quoted text if any

  - **Section 10 (Valuation) extras:** After the valuation SectionRenderer, add:
    - **FGR Derivation display** (per I-04): Wrap in CollapsibleSection with title "FGR Derivation" and badge showing `${(report.fgrDerivation?.finalLow * 100).toFixed(0)}% - ${(report.fgrDerivation?.finalHigh * 100).toFixed(0)}%`
      - Each of 5 inputs: 13px/400, C.text + ConfidenceBadge inline
      - Final range: 16px/700, C.accent
    - **Sensitivity Tables:** If report.sensitivityTables exists, render up to 4 SensitivityTable instances (mos, pbt, tenCap, equityBond), each wrapped in CollapsibleSection with the method name as title and badge showing current buy price range

D. **References section:** If any sections have citations, render a combined numbered reference list at bottom

E. **Approval Bar (per I-03):**
- Only when report is loaded and all sections present (generation COMPLETE)
- Two buttons: "Approve Pitch Deck" (C.green bg, white text, borderRadius 8, padding 12px 24px) and "Reject Pitch Deck" (transparent bg, C.red border 1px, C.red text)
- Approve: set report.stageApprovals.pitchDeck = 'approved' and persist (same localStorage pattern as OnePager)
- Reject: window.prompt('Rejection notes (optional):'), set stageApprovals.pitchDeck = 'rejected'

**Loading/empty/error states per UI-SPEC copywriting:**
- Loading: spinner + "Loading Pitch Deck..."
- Empty (no report): "No Pitch Deck generated yet" + "Run /generate:pitch-deck {TICKER} to create one. The One Pager must be approved first."
- Error: "Failed to load Pitch Deck. Check that the report file exists at .thes1s/reports/{TICKER}/pitch-deck.json and try refreshing."
- Generation in progress: show phase progress + per-section loading states ("Agent: {agentRole} working...")

**_testExports:** Export helper functions for testing:
- `getPhaseStatus(sections)` — returns array of 3 phase statuses
- `getSectionNavItems(sections)` — returns nav items with verdict colors

**Route wiring in App.jsx:**
- Import PitchDeck from './components/PitchDeck'
- Add route: `<Route path="/research/:id/pitch-deck" element={<PitchDeck />} />`
- This should be nested alongside the existing one-pager route

Expected total: PitchDeck.jsx ~500-700 lines.
  </action>
  <verify>
    <automated>test -f src/components/PitchDeck.jsx && grep -c "PitchDeck" src/components/PitchDeck.jsx && grep -c "usePitchDeck" src/components/PitchDeck.jsx && grep -c "SensitivityTable" src/components/PitchDeck.jsx && grep -c "SectionRenderer" src/components/PitchDeck.jsx && grep -c "fgrDerivation" src/components/PitchDeck.jsx && grep -c "pitch-deck" src/App.jsx</automated>
  </verify>
  <acceptance_criteria>
    - src/components/PitchDeck.jsx exists with `export default function PitchDeck`
    - Component imports usePitchDeck, SectionRenderer, SensitivityTable, VerdictBadge, ConfidenceBadge, CollapsibleSection
    - Report hero renders ticker (C.accent), company name (24px/700), overall VerdictBadge
    - Phase progress indicator renders 3 phases with circle + connector + label UI
    - Sticky nav has 10 items with section dots, click handlers, and IntersectionObserver scroll tracking
    - All 10 sections rendered via SectionRenderer in a map
    - Checkpoint blocks rendered between phase groups when checkpoint data exists
    - FGR derivation display wrapped in CollapsibleSection showing 5 inputs + final range
    - Sensitivity tables rendered via SensitivityTable component when sensitivityTables data exists
    - Approval bar with "Approve Pitch Deck" and "Reject Pitch Deck" buttons
    - Empty state shows correct copywriting per UI-SPEC
    - App.jsx contains route for "/research/:id/pitch-deck"
    - _testExports contains getPhaseStatus and getSectionNavItems
  </acceptance_criteria>
  <done>PitchDeck.jsx is the complete Pitch Deck report viewer with all UI-SPEC requirements, SensitivityTable renders assumption matrices, and route is wired</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Visual verification of Pitch Deck display and SectionRenderer improvements</name>
  <files>src/components/PitchDeck.jsx, src/components/SensitivityTable.jsx, src/components/SectionRenderer.jsx</files>
  <action>User visually verifies the complete Pitch Deck display renders correctly with all 10 sections, phase progress, sticky nav, sensitivity tables, FGR derivation, approval gate. Also verifies SectionRenderer improvements on existing COST One Pager.</action>
  <what-built>PitchDeck.jsx + SensitivityTable.jsx + SectionRenderer improvements + route wiring</what-built>
  <how-to-verify>
    1. Run `npm run dev` to start the Vite dev server
    2. If a pitch-deck.json exists for any ticker, navigate to http://localhost:5173/research/{id}/pitch-deck
    3. If no pitch-deck.json exists, verify the empty state renders correctly with the gate lock message
    4. Navigate to the existing COST One Pager at /research/{id}/one-pager and verify SectionRenderer improvements:
       - Data grids show formatted dollar/percent values (not raw numbers)
       - Narratives have paragraph breaks and bold text rendered
       - Confidence badges show "CONFIDENCE: HIGH" label
       - Citations visible below each section
    5. Check dark mode and light mode for both One Pager and Pitch Deck views
  </how-to-verify>
  <resume-signal>Type "approved" or describe issues</resume-signal>
</task>

</tasks>

<verification>
- `npx vitest run` all tests pass
- PitchDeck.jsx renders without errors
- SensitivityTable.jsx renders without errors
- Route /research/:id/pitch-deck loads the component
- SectionRenderer improvements visible on existing COST one-pager
</verification>

<success_criteria>
PitchDeck.jsx renders a complete 10-section Pitch Deck with phase progress, sticky nav, checkpoint audit trail, FGR derivation, sensitivity tables, and approval gate. SensitivityTable.jsx renders 2D assumption matrices with MOS proximity coloring. SectionRenderer improvements benefit both One Pager and Pitch Deck.
</success_criteria>

<output>
After completion, create `.planning/phases/06-pitch-deck/06C-02-SUMMARY.md`
</output>
