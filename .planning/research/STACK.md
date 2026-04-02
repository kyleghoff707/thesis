# Technology Stack: Report Stage UI (v1.3)

**Project:** Thes1s v1.3 -- Report Stage UI
**Researched:** 2026-04-01
**Overall confidence:** HIGH
**Scope:** Stack additions/changes needed for in-app report display viewers across all three stages. Does NOT re-research validated infrastructure (React 19, Vite 7, Tauri 2, Recharts, inline styles, data engines, Claude API layer).

---

## Executive Summary

**No new dependencies required.** Every feature in the v1.3 milestone -- scroll spy navigation, citation tooltips, sensitivity tables, collapsible sections, slide-out panels, assumption tracker, industry glossary popups, real-time generation progress, adversarial debate rendering, scored checklists, and Bull/Bear narrative toggles -- can be built with vanilla React 19 + the existing dependency set. Most of these features are already partially or fully implemented.

The existing codebase has established clear patterns for all the interaction types needed: `IntersectionObserver` for scroll spy (OnePager.jsx, PitchDeck.jsx), `useState` hover for tooltips (CitationTooltip.jsx), CSS transitions for slide-outs (DeepDivePanel.jsx), polling hooks for real-time progress (useOnePager.js, usePitchDeck.js), and the mutable `C` palette for all styling (theme.js). Building v1.3 is a matter of composing these proven patterns, not introducing new technology.

Adding a component library (Radix, Headless UI), animation library (Framer Motion), or CSS framework (Tailwind) would contradict the project's inline-style architecture and introduce integration friction for zero practical benefit. The codebase is self-contained and consistent -- keep it that way.

---

## Feature-by-Feature Stack Assessment

### 1. Scroll Spy Navigation

**Already built.** `IntersectionObserver` in OnePager.jsx (line 132) and PitchDeck.jsx (line 434). Tracks which section is most visible and updates `activeSection` state. Sticky nav sidebar highlights the current section.

**Pattern:** `new IntersectionObserver(callback, { threshold: 0.3, rootMargin: '-80px 0px -60% 0px' })` with `scrollMarginTop: 120` on section containers and `el.scrollIntoView({ behavior: 'smooth' })` for nav clicks.

**Stack addition needed:** None. Reuse the exact same pattern for Full Story. Consider extracting a shared `useScrollSpy(sectionKeys)` hook to DRY up the duplicated observer logic across OnePager, PitchDeck, and FullStory.

**Confidence:** HIGH -- working in production across two components.

---

### 2. Citation Tooltips

**Already built.** `CitationTooltip.jsx` renders hover tooltips with type detection (thes1s/sec/web), truncated preview text, and icon differentiation. `renderTextWithCitations()` parses `[N]` markers in narrative text and replaces them with tooltip-wrapped superscripts.

**Pattern:** `onMouseEnter/onMouseLeave` toggles `showTooltip` state. Absolute-positioned tooltip div at `bottom: 100%` with `zIndex: 1000` and `pointerEvents: 'none'`. No external tooltip library.

**Stack addition needed:** None. The component handles dark/light theming via `C.tooltipBg`/`C.tooltipText` already defined in theme.js.

**Note for Full Story:** Debate rendering will need citations too. The existing `renderTextWithCitations()` utility works as-is -- just pass `section.citations` and it handles the rest.

**Confidence:** HIGH -- working in production.

---

### 3. Sensitivity Tables

**Already built.** `SensitivityTable.jsx` is a generic, reusable component with configurable row/col values, compute function, formatters, intersection highlighting, and MOS-proximity color coding (undervalued/near/overvalued via green/yellow/default).

**Pattern:** Pure function `computeCell(row, col)` passed as prop. Table renders with `borderCollapse: 'collapse'`, `fontVariantNumeric: 'tabular-nums'`, and conditional cell styling.

**Stack addition needed:** None. For Full Story valuation confirmation, pass the same FGR/EPS variation ranges already used in the Valuation tab.

**Confidence:** HIGH -- working in production.

---

### 4. Collapsible Sections

**Already built.** `CollapsibleSection.jsx` with animated height transitions (measuring `scrollHeight`, animating to target, then switching to `auto` on open). Uses `requestAnimationFrame` double-tick for collapse animation.

**Pattern:** `useRef` for content measurement, `useState` for height/overflow, 250ms ease transition. Renders with chevron rotation and optional badge slot.

**Stack addition needed:** None. For Full Story's 6 sections and subsections, wrap content in `CollapsibleSection` with `defaultOpen` based on section status.

**Confidence:** HIGH -- working in production.

---

### 5. Deep-Dive Slide-Out Panels

**Already built.** `DeepDivePanel.jsx` (440px right-side panel) with overlay, `translateX` slide animation, Escape key handling, focus trap, and loading/content/empty states.

**Pattern:** Fixed positioning, `position: fixed; right: 0; top: 0; bottom: 0`, with `transform: translateX(100%)` to `translateX(0)` transition (250ms ease-out). Overlay at `zIndex: 1000`, panel at `zIndex: 1001`.

**Stack addition needed:** None. The component already handles string content (paragraph-split) and React node content. For "Tell me more" in Full Story, reuse the exact same component.

**Confidence:** HIGH -- working in production.

---

### 6. Assumption Tracker Sidebar

**Already built.** `AssumptionTracker.jsx` (360px right-side panel) with confidence bars, source labels, and "affects sections" tagging. Same overlay/Escape/focus pattern as DeepDivePanel.

**Pattern:** Each assumption item renders a label, confidence fill bar (100%/66%/33% width mapped to HIGH/MEDIUM/LOW), source text, and affected section list.

**Stack addition needed:** None. For Full Story, the assumptions from Pitch Deck carry forward -- render the same data with the same component.

**Note:** Currently read-only (edit capability deferred per Phase 6D comment in the component). If v1.3 needs edit capability, it is a small enhancement (add `onChange` handler, `contentEditable` or input fields) -- no library needed.

**Confidence:** HIGH -- working in production.

---

### 7. Industry Glossary Popups

**Already built.** `IndustryCard.jsx` (320px absolutely-positioned popover) with term, category, definition, and industry benchmark comparisons. Click-outside-to-close via `mousedown` listener.

**Pattern:** `position: absolute` at computed `{ top, left }` coordinates (passed as prop from the trigger element's bounding rect). `zIndex: 1000`. No external popover library.

**Stack addition needed:** None. For Full Story, reuse the same component. The trigger pattern (dashed-underline terms in narrative text) needs a small utility to detect glossary-eligible terms and wrap them -- this is ~20 lines of React, not a library.

**Confidence:** HIGH -- working in production.

---

### 8. Real-Time Generation Progress

**Already built.** Two polling hooks (`useOnePager.js`, `usePitchDeck.js`) fetch report data + progress status from the Vite middleware API. Poll every 2 seconds during generation, stop on COMPLETE, then re-fetch the final report after 500ms.

**Pattern:** `setTimeout`-based polling with `cancelled` flag cleanup. Progress state tracks per-section status (pending/running/complete/failed), current agent, elapsed time, and phase boundaries.

**UI already built:** Progress bars (thin accent bar), section status grids (checkmark/spinner/dot per section), generation status panel with elapsed timer, phase labels, and agent display names. Fade-in animation (`thes1s-fadeIn`) for sections as they complete.

**Stack addition needed:** None. For Full Story, create a `useFullStory.js` hook following the exact same pattern as `usePitchDeck.js`. The Full Story component needs its own generation status panel (same pattern as PitchDeck's `GenerationStatusPanel`), adapted for 6 sections instead of 10.

**Confidence:** HIGH -- working in production for both One Pager and Pitch Deck.

---

### 9. Adversarial Debate Rendering

**Not yet built in UI.** The debate data structure is fully defined (4-step: Bull thesis, Bear inversion, Bull rebuttal, Judge verdict) with Zod schemas in `src/schemas/debateStep.js`. Actual debate JSON outputs exist for SFM and MNST in `.thes1s/reports/`.

**What needs rendering:**
- **Step 1 (Bull):** Array of `thesisPoints` (point + evidence + sourceSection) + `overallThesis`
- **Step 2 (Bear):** Array of `inversions` (targetPoint + counterArgument + evidence + severity + sources) + `overallBearCase`
- **Step 3 (Bull Rebuttal):** Array of `rebuttals` (bearPoint + rebuttal + rebuttalStrength + honest flag)
- **Step 4 (Judge):** Array of `exchanges` (topic + bullStrength + bearStrength + verdict + reasoning) + `overallVerdict` (direction + unresolvedCount + summary + investmentImplication)

**Stack addition needed:** None. This is pure rendering logic using existing patterns:
- Collapsible cards for each step (reuse `CollapsibleSection`)
- Color-coded severity badges for inversions (reuse the `getSeverityColor` pattern from SectionRenderer)
- Strength indicators (strong/moderate/weak) as pill badges (reuse `VerdictBadge` pattern)
- Judge verdict exchange cards with bull/bear strength comparison (inline styled `div` grid)
- "honest" flag as a small badge on rebuttals
- Overall verdict direction ("Bull"/"Bear"/"Mixed") as a styled banner

The rendering complexity is in the design, not the technology. Each debate step maps cleanly to a React component with inline styles reading from `C`.

**Confidence:** HIGH -- data structures are well-defined and rendering patterns are established.

---

### 10. Scored Checklists (43 Items)

**Not yet built in UI.** The checklist data structure exists in generated reports (see `meaning_checklist` section from MNST Full Story). Each checklist item has: `number`, `item` (question text), `verdict` (PASS/PARTIAL/FAIL), `evidence` (detailed text), and `confidence` (HIGH/MEDIUM/LOW).

**What needs rendering:**
- 3 checklists: Meaning (15 items), Moat (15 items), Management (13 items)
- Each item: number, question, verdict badge, evidence (collapsible), confidence indicator
- Summary row: X/Y PASS, Z PARTIAL, W FAIL
- Items that are FAIL or require PM input should be visually prominent

**Stack addition needed:** None. This is a styled list/table using existing components:
- `VerdictBadge` for per-item verdict (PASS/PARTIAL/FAIL -- may need to add PARTIAL to the badge component)
- `ConfidenceBadge` for per-item confidence
- `CollapsibleSection` or a simpler expand/collapse for evidence text per item
- Summary row is a simple count/display

The PARTIAL verdict is new -- VerdictBadge currently handles PASS/FAIL/WATCHLIST/REVIEW. Adding PARTIAL is a one-line addition to the style map (use `C.yellow` background).

**Confidence:** HIGH -- straightforward rendering of structured data.

---

### 11. Bull/Bear Narrative Toggle

**Not yet built in UI.** This is a toggle that switches between viewing the Bull thesis narrative vs. the Bear thesis narrative for the Inversion & Rebuttal section.

**Stack addition needed:** None. This is a standard `useState` toggle:

```jsx
const [view, setView] = useState('bull'); // 'bull' | 'bear' | 'judge'

// Toggle buttons
<div style={{ display: 'flex', gap: 4 }}>
  <button onClick={() => setView('bull')} style={{
    background: view === 'bull' ? C.green : C.bgCard,
    color: view === 'bull' ? '#fff' : C.textSecondary,
    // ... pill button styles
  }}>Bull Case</button>
  <button onClick={() => setView('bear')} style={{
    background: view === 'bear' ? C.red : C.bgCard,
    // ...
  }}>Bear Case</button>
  <button onClick={() => setView('judge')} style={{
    background: view === 'judge' ? C.accent : C.bgCard,
    // ...
  }}>Judge Verdict</button>
</div>

// Conditional rendering based on view
{view === 'bull' && <BullThesisView data={debate.steps[0]} />}
{view === 'bear' && <BearInversionView data={debate.steps[1]} />}
{view === 'judge' && <JudgeVerdictView data={debate.steps[3]} />}
```

**Confidence:** HIGH -- standard React state management.

---

## What NOT to Add

These were considered and explicitly rejected:

### Do Not Add: Component Library (Radix UI, Headless UI, etc.)

**Why not:** The entire app uses inline styles via the mutable `C` palette object. Component libraries expect CSS class-based styling (Tailwind, CSS modules, or styled-components). Mixing paradigms creates two styling systems and doubles maintenance burden. Every existing component (30+ `.jsx` files) follows the inline style pattern -- introducing a component library creates inconsistency.

**What you lose:** Accessibility primitives (focus management, ARIA attributes, keyboard navigation). But the existing DeepDivePanel and AssumptionTracker already implement these manually (Escape key, focus trap, click-outside). The pattern is established and understood.

### Do Not Add: Animation Library (Framer Motion, React Spring, etc.)

**Why not:** The existing CSS transitions handle all animation needs: `CollapsibleSection` animates height, `DeepDivePanel` animates `translateX`, progress bars animate width, sections fade in with `@keyframes thes1s-fadeIn`. All at 250-500ms ease. No spring physics or gesture-based animations are needed for a financial analysis tool.

**Cost if added:** Framer Motion is 30KB+ gzipped. React Spring is 20KB+. The entire app has zero animation libraries currently -- adding one for marginal smoothness is a bad trade.

### Do Not Add: CSS Framework (Tailwind, etc.)

**Why not:** The app is 100% inline styles. Adding Tailwind means maintaining two styling systems, updating vite config, learning new conventions, and potentially breaking existing theme switching (which works by mutating `C` and re-rendering). There are 30+ components all using `style={{ color: C.text, background: C.bgCard }}`. Tailwind adds zero value here.

### Do Not Add: State Management Library (Zustand, Jotai, Redux, etc.)

**Why not:** Report state is managed by hooks (`useOnePager`, `usePitchDeck`) that poll a local API and return `{ report, progress, loading, error }`. Components read this state and render. There is no cross-component state sharing problem -- each report viewer is a standalone route component. The stage gating state lives in `report.stageApprovals` in localStorage via `useResearch`. No global store needed.

### Do Not Add: Markdown Rendering Library (react-markdown, etc.)

**Why not:** `SectionRenderer.jsx` already has a `parseMarkdown()` function that handles headings (`##`, `###`), bullet lists, bold text, and paragraphs. It outputs React elements with inline styles. The report narratives use a minimal markdown subset -- no tables, code blocks, images, or links. A full markdown parser adds dependency weight for features that will never be used.

### Do Not Add: Tooltip Library (Tippy.js, Floating UI, etc.)

**Why not:** `CitationTooltip.jsx` already renders positioned tooltips with `position: absolute; bottom: 100%`. `IndustryCard.jsx` already renders positioned popover cards with click-outside detection. Both work correctly. A tooltip library adds complexity for positioning edge cases (viewport overflow), but the app runs at 1400px max-width in a desktop window -- overflow is not a realistic problem.

### Do Not Add: Virtual Scrolling (react-window, react-virtuoso, etc.)

**Why not:** The longest report (Full Story) has 6 sections + debate steps + checklists (43 items). At most ~100-150 DOM nodes of content. Virtual scrolling is for lists of 1000+ items. The app will never render enough report content to need virtualization.

---

## Recommended Stack (No Changes)

The existing stack handles v1.3 as-is:

| Technology | Version | Purpose | Status |
|------------|---------|---------|--------|
| React | 19.2.0 | UI framework | Already installed |
| react-router-dom | 7.13.1 | Route-based report navigation | Already installed |
| recharts | 3.8.0 | Charts in report sections (price vs value, growth trends) | Already installed |
| zod | 4.3.6 | Report schema validation (if needed client-side) | Already installed |
| idb | 8.0.3 | IndexedDB cache for report data (if needed) | Already installed |

No new `npm install` commands required.

---

## Recommended Code-Level Improvements (No Dependencies)

These are implementation suggestions, not stack changes. They reduce code duplication across the three report viewers:

### 1. Extract `useScrollSpy(sectionKeys)` Hook

OnePager.jsx and PitchDeck.jsx both have ~30 lines of identical `IntersectionObserver` setup. Extract to:

```javascript
// src/hooks/useScrollSpy.js
export function useScrollSpy(sectionKeys) {
  const [activeSection, setActiveSection] = useState(null);
  // ... IntersectionObserver logic
  return activeSection;
}
```

### 2. Extract Shared Spinner Component

Both OnePager.jsx and PitchDeck.jsx define identical `Spinner` and `injectSpinnerStyle` functions. Extract to a shared utility:

```javascript
// src/components/shared/Spinner.jsx
```

### 3. Extract Shared Report Header Pattern

Both OnePager.jsx and PitchDeck.jsx render a hero section with ticker, company name, overall verdict badge, generated timestamp, and approval status. Extract to:

```javascript
// src/components/shared/ReportHeader.jsx
```

### 4. Add PARTIAL to VerdictBadge

The Full Story checklists use PARTIAL verdicts (alongside PASS/FAIL). Add to the existing `getVerdictStyle` map:

```javascript
PARTIAL: { bg: C.yellow, text: '#fff', label: 'PARTIAL' },
```

### 5. Extract Debate Renderer Component

The 4-step adversarial debate is complex enough to warrant its own component file:

```
src/components/fullStory/DebateRenderer.jsx
```

This renders all 4 steps: Bull thesis points, Bear inversions (with severity badges), Bull rebuttals (with strength + honest indicators), and Judge exchanges (with per-topic verdict banners).

---

## React 19 Features Available but Not Required

React 19 introduced several new APIs. None are required for v1.3, but two could be useful:

| Feature | Available | Useful for v1.3? | Assessment |
|---------|-----------|-------------------|------------|
| `useOptimistic` | Yes (React 19 GA) | Not needed | Report approval is instant (localStorage write). No async mutation to optimistically display. |
| `use()` hook | Yes (React 19 GA) | Maybe -- could replace polling hooks | Current polling pattern with `setTimeout` is well-understood and working. `use()` with Suspense would require restructuring the data fetching pattern. Not worth the refactor for v1.3. |
| `useFormStatus` | Yes (React 19 GA) | Not needed | No forms in report viewers. Approval is a button click, not a form submission. |
| `useActionState` | Yes (React 19 GA) | Not needed | Same reason -- no async form submissions. |
| Suspense improvements | Yes (React 19 GA) | Possible for lazy-loading report sections | Could wrap each section in `<Suspense fallback={<Skeleton />}>` for progressive loading. But the current polling + fade-in pattern already achieves this effect. Suspense would add complexity without visual improvement. |

**Recommendation:** Stay with current patterns. The polling hooks and fade-in animations already provide an excellent progressive loading experience. React 19's new APIs solve problems this app does not have (form-heavy SPAs, server components, streaming SSR).

---

## Theme System Adequacy

The mutable `C` palette object (theme.js) already includes all the semantic colors needed for v1.3:

| Need | Theme Token | Exists |
|------|-------------|--------|
| Bull case (green) | `C.green`, `C.greenBg` | Yes |
| Bear case (red) | `C.red`, `C.redBg` | Yes |
| Judge/neutral (accent) | `C.accent`, `C.accentLight` | Yes |
| Warnings/watchlist (yellow) | `C.yellow`, `C.yellowBg` | Yes |
| Tooltip backgrounds | `C.tooltipBg`, `C.tooltipText` | Yes |
| Card backgrounds | `C.bgCard`, `C.bg` | Yes |
| Borders | `C.border`, `C.borderLight` | Yes |
| Score badges | `C.scoreBgGreen`, `C.scoreBgYellow`, `C.scoreBgRed` | Yes |
| Shadow for popovers | `C.shadow` | Yes |

No new theme tokens needed. The Bull/Bear/Judge color scheme maps naturally to green/red/accent.

---

## Data Flow for Report Viewers

The data flow pattern is already established and needs no architectural changes:

```
.thes1s/reports/{ticker}/*.json  (filesystem)
        |
        v
Vite middleware (/api/thes1s/reports/:ticker/:stage)  (serves JSON)
        |
        v
useOnePager / usePitchDeck / useFullStory  (polling hooks)
        |
        v
OnePager / PitchDeck / FullStory  (viewer components)
        |
        v
SectionRenderer / DebateRenderer / ChecklistRenderer  (shared renderers)
```

The `useFullStory.js` hook follows the exact same pattern as the other two. The Full Story viewer may also need to read debate step files separately (`debate-step-1.json` through `debate-step-4.json`), which requires either including them in the full-story.json or adding a secondary fetch -- this is a minor API endpoint addition, not a stack change.

---

## Sources

- React 19 features: [React v19 blog](https://react.dev/blog/2024/12/05/react-19)
- Existing codebase: Direct inspection of OnePager.jsx, PitchDeck.jsx, SectionRenderer.jsx, CitationTooltip.jsx, SensitivityTable.jsx, CollapsibleSection.jsx, DeepDivePanel.jsx, AssumptionTracker.jsx, IndustryCard.jsx, VerdictBadge.jsx, ConfidenceBadge.jsx, RedFlagCallout.jsx, theme.js, package.json
- Debate data schema: src/schemas/debateStep.js
- Report data samples: .thes1s/reports/MNST/full-story-api.json, .thes1s/reports/MNST/sections/debate-step-4.json, .thes1s/reports/MNST/sections/fullStory-S2-meaning_checklist.json
