---
phase: 06-pitch-deck
plan: 06D-01
type: execute
wave: 6
depends_on: [06C-02]
files_modified:
  - src/components/pitchDeck/DeepDivePanel.jsx
  - src/components/pitchDeck/IndustryCard.jsx
  - src/components/pitchDeck/AssumptionTracker.jsx
  - src/components/PitchDeck.jsx
autonomous: true
requirements: [PTCH-13, PTCH-14, PTCH-15]
must_haves:
  truths:
    - "DeepDivePanel slides out from right when 'Tell me more' is clicked"
    - "IndustryCard appears as popover below glossary terms"
    - "AssumptionTracker sidebar lists assumptions with confidence bars"
    - "All three delight components integrated into PitchDeck.jsx"
  artifacts:
    - path: "src/components/pitchDeck/DeepDivePanel.jsx"
      provides: "Slide-out deep dive panel for section claims"
      contains: "DeepDivePanel"
    - path: "src/components/pitchDeck/IndustryCard.jsx"
      provides: "Glossary popover for industry terms"
      contains: "IndustryCard"
    - path: "src/components/pitchDeck/AssumptionTracker.jsx"
      provides: "Assumption sidebar with confidence bars"
      contains: "AssumptionTracker"
  key_links:
    - from: "src/components/PitchDeck.jsx"
      to: "src/components/pitchDeck/DeepDivePanel.jsx"
      via: "import and conditional render"
      pattern: "DeepDivePanel"
    - from: "src/components/PitchDeck.jsx"
      to: "src/components/pitchDeck/AssumptionTracker.jsx"
      via: "import and toggle state"
      pattern: "AssumptionTracker"
---

<objective>
Create the three Phase 6D delight features: DeepDivePanel (PTCH-13), IndustryCard (PTCH-14), and AssumptionTracker (PTCH-15). Integrate all three into PitchDeck.jsx.

Purpose: These features elevate the Pitch Deck from a static report to an interactive analysis tool. The PM can drill into specific claims, understand industry terminology, and track key assumptions — all within the report view.
Output: 3 new components in src/components/pitchDeck/ + PitchDeck.jsx integration.
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
From UI-SPEC — DeepDivePanel contract:
- Fixed right-side slide-out, 440px wide
- Animation: slide from right, 250ms ease-out
- Overlay: rgba(0,0,0,0.3)
- Header: 16px/700 + close button (X icon, 20px)
- Content: 13px/400, line-height 1.7
- Close: click X, click overlay, or Escape
- Loading state: spinner + "Analyzing..."

From UI-SPEC — IndustryCard contract:
- Absolute popover below trigger term, 320px wide
- Trigger: dashed underline on term, cursor help
- Content: Term (16px/700), Category (10px/400), Definition (13px/400), Industry Benchmark (10px/700 label + 13px/400 values)
- Dismiss: click outside

From UI-SPEC — AssumptionTracker contract:
- Fixed right-side panel, 360px wide, slide-out like DeepDivePanel
- Toggle button: "Assumptions (N)" in hero, 10px/700
- Items: label (13px/700) + confidence bar (120px × 6px) + source (10px/400) + affects (10px/400)
- Read-only in Phase 6D

From pitch-deck.json report shape:
```javascript
// DeepDive: triggered by user click, calls AI endpoint (or shows cached deep dive)
// IndustryCard: agents mark glossary terms in section.data.glossary array
// Assumptions: report.assumptions array with { key, label, value, confidence, source, affectsSections }
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create DeepDivePanel and IndustryCard components</name>
  <files>
    src/components/pitchDeck/DeepDivePanel.jsx
    src/components/pitchDeck/IndustryCard.jsx
  </files>
  <read_first>
    .planning/phases/06-pitch-deck/06-UI-SPEC.md
    src/components/PitchDeck.jsx
    src/theme.js
  </read_first>
  <action>
Create the `src/components/pitchDeck/` directory if it does not exist.

**DeepDivePanel.jsx (~120-150 lines):**
```javascript
import { useEffect, useRef } from 'react';
import { C } from '../../theme';

export default function DeepDivePanel({ isOpen, onClose, title, content, loading }) { ... }
```

Implementation per UI-SPEC:
- When `isOpen` is false, render nothing (return null)
- When `isOpen` is true, render:
  - **Overlay:** position fixed, inset 0, background rgba(0,0,0,0.3), zIndex 1000, onClick={onClose}
  - **Panel:** position fixed, top 0, right 0, bottom 0, width 440, background C.bgCard, borderLeft 1px solid C.border, zIndex 1001, overflowY auto
  - **Slide animation:** Use CSS transform. Panel starts at `transform: translateX(100%)` and transitions to `translateX(0)` via `transition: transform 250ms ease-out`. Use a state variable for animation.
  - **Header:** display flex, justifyContent space-between, alignItems center, padding 16px. Title: 16px/700, C.text. Close button: background none, border none, cursor pointer, 20px X icon (inline SVG), C.textMuted, hover C.text, aria-label="Close panel"
  - **Content area:** padding 16px. If `loading` is true, show spinner (24px border animation) + "Analyzing..." text (13px/400, C.textSecondary). If content, render as 13px/400 line-height 1.7 C.text.
  - **Escape key handler:** useEffect with keydown listener for 'Escape', calls onClose
  - **Focus trap:** useRef on panel, focus panel on open

**IndustryCard.jsx (~100-130 lines):**
```javascript
import { useEffect, useRef } from 'react';
import { C } from '../../theme';

export default function IndustryCard({ isOpen, onClose, term, category, definition, benchmarks, position }) { ... }
```

Implementation per UI-SPEC:
- When `isOpen` is false, render nothing
- When `isOpen` is true, render:
  - **Card:** position absolute, top `position.top`, left `position.left`, width 320, background C.bgCard, border 1px solid C.border, borderRadius 8, boxShadow `0 4px 12px ${C.shadow}`, padding 16, zIndex 1000
  - **Term:** 16px/700, C.text
  - **Category:** 10px/400, C.textMuted, in parentheses
  - **"DEFINITION" label:** 10px/700, C.textMuted, textTransform uppercase, marginTop 12
  - **Definition text:** 13px/400, lineHeight 1.5, C.text
  - **"INDUSTRY BENCHMARK" label:** 10px/700, C.textMuted, textTransform uppercase, marginTop 12
  - **Benchmark values:** If benchmarks array provided, render each as 13px/400 C.textSecondary. Company value in 13px/700 C.text.
  - **Click outside handler:** useRef + useEffect with mousedown listener on document, calls onClose if click is outside card ref

Props:
- `position` is { top: number, left: number } — computed by the parent from the trigger element's getBoundingClientRect()
- `benchmarks` is an array of { label: string, value: string, isCompany?: boolean }

Both components use inline styles with C palette. No CSS files.
  </action>
  <verify>
    <automated>test -d src/components/pitchDeck && test -f src/components/pitchDeck/DeepDivePanel.jsx && test -f src/components/pitchDeck/IndustryCard.jsx && grep -c "DeepDivePanel" src/components/pitchDeck/DeepDivePanel.jsx && grep -c "IndustryCard" src/components/pitchDeck/IndustryCard.jsx && grep -c "Escape" src/components/pitchDeck/DeepDivePanel.jsx && grep -c "440" src/components/pitchDeck/DeepDivePanel.jsx</automated>
  </verify>
  <acceptance_criteria>
    - src/components/pitchDeck/DeepDivePanel.jsx exists with `export default function DeepDivePanel`
    - DeepDivePanel has Escape key handler calling onClose
    - DeepDivePanel panel width is 440px (per UI-SPEC)
    - DeepDivePanel has overlay with rgba background
    - DeepDivePanel shows loading spinner when loading prop is true
    - src/components/pitchDeck/IndustryCard.jsx exists with `export default function IndustryCard`
    - IndustryCard has click-outside handler calling onClose
    - IndustryCard width is 320px (per UI-SPEC)
    - IndustryCard renders term, category, definition, and benchmarks
    - Both components use inline styles with C palette
  </acceptance_criteria>
  <done>DeepDivePanel (slide-out, 440px, Escape close, loading state) and IndustryCard (popover, 320px, click-outside close, benchmarks) created</done>
</task>

<task type="auto">
  <name>Task 2: Create AssumptionTracker + integrate all delight components into PitchDeck.jsx</name>
  <files>
    src/components/pitchDeck/AssumptionTracker.jsx
    src/components/PitchDeck.jsx
  </files>
  <read_first>
    .planning/phases/06-pitch-deck/06-UI-SPEC.md
    src/components/PitchDeck.jsx
    src/components/pitchDeck/DeepDivePanel.jsx
    src/theme.js
  </read_first>
  <action>
**AssumptionTracker.jsx (~130-160 lines):**
```javascript
import { useEffect, useRef } from 'react';
import { C } from '../../theme';

export default function AssumptionTracker({ isOpen, onClose, assumptions }) { ... }
```

Implementation per UI-SPEC:
- Same slide-out pattern as DeepDivePanel but 360px wide
- **Header:** "Key Assumptions" — 16px/700, C.text + close button
- **Assumption items:** Map over `assumptions` array. Each item:
  - Label: 13px/700, C.text — e.g., "FGR Low: 10%"
  - Confidence bar: 120px wide, 6px tall, borderRadius 3px
    - Background track: C.border
    - Fill width: HIGH = 100%, MEDIUM = 66%, LOW = 33%
    - Fill color: C.green (HIGH), C.yellow (MEDIUM), C.red (LOW)
  - Confidence label: 10px/700, same color as fill, textTransform uppercase, displayed inline after bar
  - Source: 10px/400, C.textSecondary
  - Affects: 10px/400, C.textMuted — "Affects: Section 10 (Valuation)"
  - Separator: borderBottom 1px solid C.borderLight, paddingBottom 12, marginBottom 12
- Escape key handler + overlay (same as DeepDivePanel)
- Read-only in Phase 6D (no edit capability)

**PitchDeck.jsx integration — ADD to existing component:**

1. **Import delight components:**
   ```javascript
   import DeepDivePanel from './pitchDeck/DeepDivePanel';
   import IndustryCard from './pitchDeck/IndustryCard';
   import AssumptionTracker from './pitchDeck/AssumptionTracker';
   ```

2. **Add state for delight features:**
   ```javascript
   const [deepDive, setDeepDive] = useState({ isOpen: false, title: '', content: null, loading: false });
   const [industryCard, setIndustryCard] = useState({ isOpen: false, term: '', category: '', definition: '', benchmarks: [], position: { top: 0, left: 0 } });
   const [assumptionOpen, setAssumptionOpen] = useState(false);
   ```

3. **Assumptions toggle button in hero area:** After the generation timestamp, add:
   ```jsx
   {report?.assumptions?.length > 0 && (
     <button onClick={() => setAssumptionOpen(true)} style={{
       fontSize: 10, fontWeight: 700, color: assumptionOpen ? C.accent : C.textSecondary,
       background: assumptionOpen ? C.accentLight : C.badge, borderRadius: 6, padding: '4px 12px',
       textTransform: 'uppercase', border: 'none', cursor: 'pointer',
     }}>
       Assumptions ({report.assumptions.length})
     </button>
   )}
   ```

4. **Render delight components at bottom of PitchDeck.jsx return:**
   ```jsx
   <DeepDivePanel
     isOpen={deepDive.isOpen}
     onClose={() => setDeepDive(d => ({ ...d, isOpen: false }))}
     title={deepDive.title}
     content={deepDive.content}
     loading={deepDive.loading}
   />
   <IndustryCard
     isOpen={industryCard.isOpen}
     onClose={() => setIndustryCard(c => ({ ...c, isOpen: false }))}
     term={industryCard.term}
     category={industryCard.category}
     definition={industryCard.definition}
     benchmarks={industryCard.benchmarks}
     position={industryCard.position}
   />
   <AssumptionTracker
     isOpen={assumptionOpen}
     onClose={() => setAssumptionOpen(false)}
     assumptions={report?.assumptions || []}
   />
   ```

5. **Note for future:** "Tell me more" trigger buttons within sections and glossary term highlighting within narratives depend on agent-generated markers in the section data (deepDive triggers, glossary terms). For now, the components are wired but triggers will only appear when agents mark them in their output. The components are ready — the agent prompts from 6A already instruct agents to include these markers.
  </action>
  <verify>
    <automated>test -f src/components/pitchDeck/AssumptionTracker.jsx && grep -c "AssumptionTracker" src/components/pitchDeck/AssumptionTracker.jsx && grep -c "DeepDivePanel" src/components/PitchDeck.jsx && grep -c "IndustryCard" src/components/PitchDeck.jsx && grep -c "AssumptionTracker" src/components/PitchDeck.jsx && grep -c "assumptionOpen\|setAssumptionOpen" src/components/PitchDeck.jsx</automated>
  </verify>
  <acceptance_criteria>
    - src/components/pitchDeck/AssumptionTracker.jsx exists with `export default function AssumptionTracker`
    - AssumptionTracker is 360px wide (per UI-SPEC)
    - AssumptionTracker renders confidence bars with color based on confidence level
    - AssumptionTracker has Escape key handler
    - PitchDeck.jsx imports DeepDivePanel, IndustryCard, AssumptionTracker
    - PitchDeck.jsx has state variables for deepDive, industryCard, assumptionOpen
    - PitchDeck.jsx renders "Assumptions (N)" toggle button in hero area
    - PitchDeck.jsx renders all three delight components conditionally
    - All styling uses inline styles with C palette
  </acceptance_criteria>
  <done>All three delight features created and integrated into PitchDeck.jsx — DeepDivePanel (claim drill-down), IndustryCard (glossary), AssumptionTracker (assumption sidebar with confidence bars)</done>
</task>

</tasks>

<verification>
- `ls src/components/pitchDeck/` shows DeepDivePanel.jsx, IndustryCard.jsx, AssumptionTracker.jsx
- `npx vitest run` all tests pass
- PitchDeck.jsx imports and renders all three delight components
</verification>

<success_criteria>
Three delight features implemented per UI-SPEC contracts and integrated into PitchDeck.jsx. DeepDivePanel enables claim drill-down, IndustryCard provides industry glossary, AssumptionTracker shows key assumptions with confidence visualization. All are read-only and slide-out pattern consistent.
</success_criteria>

<output>
After completion, create `.planning/phases/06-pitch-deck/06D-01-SUMMARY.md`
</output>
