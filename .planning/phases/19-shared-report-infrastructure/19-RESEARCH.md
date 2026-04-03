# Phase 19: Shared Report Infrastructure - Research

**Researched:** 2026-04-02
**Domain:** React component extraction, markdown rendering, scroll behavior, stage navigation
**Confidence:** HIGH

## Summary

Phase 19 extracts duplicated code from OnePager.jsx and PitchDeck.jsx into shared modules, replaces the custom `parseMarkdown()` function with `react-markdown`, builds a reusable `useScrollSpy` hook, and adds a `StageNavBar` component for switching between report stages. The codebase is well-structured for this refactoring -- helper functions are already identical between OnePager and PitchDeck (verified line-by-line), the IntersectionObserver logic uses the same thresholds and rootMargin, and the project's inline-style-only convention is fully compatible with react-markdown's `components` prop override pattern.

The main technical risks are: (1) react-markdown's interaction with the existing citation tooltip system (citations are currently rendered via `renderTextWithCitations` which splits text on `[N]` patterns -- this must be preserved as a custom text/paragraph component override), (2) react-markdown is an ESM-only package as of v9+, which works fine with Vite but requires `import` not `require`, and (3) the scroll spy offset calculation must account for both the 52px Layout nav bar AND the new StageNavBar height.

**Primary recommendation:** Install `react-markdown@10.1.0` + `remark-gfm@4.0.1`. Create `reportHelpers.js` for pure function extraction, `Spinner.jsx` for the shared spinner component, `useScrollSpy.js` as a generic hook, `StageNavBar.jsx` for stage switching, and `ReportMarkdown.jsx` as the pre-configured react-markdown wrapper with Thes1s styling overrides.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Use `react-markdown` library (npm package) for all report narrative rendering. Replaces the custom `parseMarkdown()` function in SectionRenderer.jsx.
- **D-02:** react-markdown provides full CommonMark support out of the box -- headings, numbered lists, blockquotes, inline links, code blocks, tables. No maintenance burden for new markdown features from pipeline output.
- **D-03:** Custom component overrides to match Thes1s inline styling (C palette, font sizes, spacing). Citation tooltip integration (`[N]` markers -> hover to see source) preserved via custom text/paragraph component overrides.
- **D-04:** Horizontal tab bar (One Pager | Pitch Deck | Full Story) positioned above report content, below the company header. Always visible.
- **D-05:** Locked/unapproved stages appear dimmed with a small lock icon. Not clickable. Hovering shows a tooltip explaining the gate (e.g., "Approve One Pager to unlock Pitch Deck").
- **D-06:** Active stage tab has teal accent underline, matching existing Toolbox tab styling patterns.
- **D-07:** Extract IntersectionObserver logic from OnePager.jsx into a shared `useScrollSpy` hook. Same hook consumed by all three report viewers.
- **D-08:** Sticky sidebar on the left side with section list. Active section highlighted with teal accent bar. Clicking a section smooth-scrolls to it.
- **D-09:** Hook accounts for header offset (52px top nav + stage nav bar height), debounced updates to prevent flicker on fast scrolling. Success criterion: "without flicker."
- **D-10:** Single `reportHelpers.js` file for all shared helper functions: `formatTitle`, `formatRelativeTime`, `stateToLabel`, `verdictDotColor`, `fmtNum`, `fmtDollar`, `fmtPct`, `formatDataValue`.
- **D-11:** Separate `Spinner.jsx` component file for the shared Spinner (with keyframe injection). React components get their own files.
- **D-12:** OnePager.jsx and PitchDeck.jsx refactored to import from `reportHelpers.js` and `Spinner.jsx` -- remove duplicated function definitions.

### Claude's Discretion
- react-markdown version and specific plugin configuration (remark-gfm for tables, etc.)
- Exact IntersectionObserver thresholds and rootMargin tuning for flicker prevention
- Whether to keep `parseMarkdown()` as a fallback or remove it entirely after react-markdown integration
- Internal structure of reportHelpers.js (export grouping, any sub-modules)
- Stage nav bar component name and exact prop interface
- How section sidebar interacts with report content layout (flex vs grid)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INFRA-01 | User sees consistently formatted numbers, currencies, and percentages across all report stages | Extract `fmtNum`, `fmtDollar`, `fmtPct`, `formatDataValue` from SectionRenderer.jsx into shared `reportHelpers.js`. Both OnePager and PitchDeck already import SectionRenderer which houses these -- making them standalone exports ensures FullStory and any future viewers use identical formatting. |
| INFRA-02 | User sees active section highlighted in nav while scrolling through any report | Extract IntersectionObserver logic (identical in OnePager.jsx lines 122-158 and PitchDeck.jsx lines 424-459) into `useScrollSpy` hook. Hook accepts section IDs and offset, returns `activeSection` string. |
| INFRA-03 | User sees properly rendered markdown in report narratives | Replace `parseMarkdown()` in SectionRenderer.jsx with `react-markdown@10.1.0` + `remark-gfm@4.0.1`. Custom `components` prop overrides apply Thes1s inline styles. Citation `[N]` markers handled via custom paragraph/text component that calls `renderTextWithCitations`. |
| INFRA-04 | User can navigate between report stages via a stage nav bar | New `StageNavBar.jsx` component: horizontal tabs (One Pager / Pitch Deck / Full Story), positioned below company header. Uses react-router `useNavigate` for stage switching. Reads `stageApprovals` from report data for lock/unlock state. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| react-markdown | 10.1.0 | Markdown -> React elements | De facto React markdown renderer. 10M+ weekly downloads. ESM-only, React 19 compatible (peer dep `>=18`). Full CommonMark support. |
| remark-gfm | 4.0.1 | GitHub Flavored Markdown plugin | Adds tables, strikethrough, task lists, autolinks to react-markdown. Pipeline output already uses tables and bullet lists. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| rehype-raw | 7.0.0 | Pass-through raw HTML in markdown | Only needed if pipeline narratives contain raw HTML. Currently they don't -- defer unless needed. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| react-markdown | Extend custom `parseMarkdown()` | Custom parser only handles `##`, `###`, `**bold**`, `- bullet` -- does not support numbered lists, blockquotes, inline links, tables. Pipeline output uses all of these. Whack-a-mole maintenance. User explicitly chose react-markdown (D-01). |
| remark-gfm | No plugin | Lose table support. Pipeline output includes tables in some sections. |

**Installation:**
```bash
npm install react-markdown@10.1.0 remark-gfm@4.0.1
```

**Version verification:** `react-markdown@10.1.0` published 2025-02-01 (latest as of 2026-04-02). `remark-gfm@4.0.1` published 2024-08-13 (latest). Both confirmed via `npm view`. React peer dependency `>=18` satisfied by project's React 19.2.0.

**ESM note:** react-markdown v9+ is ESM-only. This project uses Vite + ES modules throughout -- no compatibility concern. Import as `import Markdown from 'react-markdown'`.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── components/
│   ├── reportHelpers.js         # Shared pure functions (D-10)
│   ├── Spinner.jsx              # Shared Spinner component (D-11)
│   ├── ReportMarkdown.jsx       # Pre-configured react-markdown wrapper (new)
│   ├── StageNavBar.jsx          # Stage navigation tabs (D-04)
│   ├── SectionRenderer.jsx      # Updated: uses ReportMarkdown instead of parseMarkdown
│   ├── OnePager.jsx             # Refactored: imports from reportHelpers/Spinner/useScrollSpy
│   ├── PitchDeck.jsx            # Refactored: imports from reportHelpers/Spinner/useScrollSpy
│   ├── FullStory.jsx            # Will consume shared infrastructure in Phase 20
│   ├── CitationTooltip.jsx      # Unchanged -- renderTextWithCitations stays here
│   ├── VerdictBadge.jsx         # Unchanged
│   ├── ConfidenceBadge.jsx      # Unchanged
│   └── RedFlagCallout.jsx       # Unchanged
├── hooks/
│   ├── useScrollSpy.js          # Shared IntersectionObserver hook (D-07)
│   └── ... (existing hooks)
```

### Pattern 1: Shared Pure Functions Module (reportHelpers.js)
**What:** Extract duplicated helper functions into a single module with named exports.
**When to use:** Functions are pure (no React dependency), identical across multiple components.
**Example:**
```javascript
// src/components/reportHelpers.js
import { C } from '../theme';

// Strip /NEW, /DE, /OLD suffixes and title-case the result
export function formatTitle(name) {
  if (!name) return '';
  const cleaned = name.replace(/\s*\/(NEW|DE|OLD)\s*$/i, '').trim();
  return cleaned
    .split(/\s+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

export function formatRelativeTime(isoDate) { /* ... */ }
export function stateToLabel(state) { /* ... */ }
export function verdictDotColor(verdict) { /* ... */ }

// From SectionRenderer.jsx -- data formatting
export function fmtNum(n) { /* ... */ }
export function fmtDollar(n) { /* ... */ }
export function fmtPct(n) { /* ... */ }
export function formatDataValue(key, value) { /* ... */ }
```

**Important:** `verdictDotColor` references `C` from theme.js. Since `C` is a mutable object, this works at call time (not import time). All other functions are pure.

### Pattern 2: Shared React Component (Spinner.jsx)
**What:** Extract the duplicated Spinner component and its keyframe injection into its own file.
**When to use:** React components that appear identically in multiple files.
**Example:**
```javascript
// src/components/Spinner.jsx
import { C } from '../theme';

// Keyframes injection (once)
let injected = false;
function injectKeyframes() {
  if (injected || typeof document === 'undefined') return;
  const style = document.createElement('style');
  style.textContent = `
    @keyframes thes1s-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    @keyframes thes1s-fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes thes1s-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
  `;
  document.head.appendChild(style);
  injected = true;
}
injectKeyframes(); // Run on import

export default function Spinner({ size = 20 }) {
  return (
    <div style={{
      width: size, height: size,
      border: '2px solid ' + C.border,
      borderTopColor: C.accent,
      borderRadius: '50%',
      animation: 'thes1s-spin 1s linear infinite',
    }} />
  );
}
```

**Design note:** PitchDeck's Spinner is identical to OnePager's except PD also injects the `thes1s-pulse` keyframe. The shared version should inject all three keyframes (spin, fadeIn, pulse) so both components work.

### Pattern 3: useScrollSpy Hook
**What:** Reusable IntersectionObserver hook that returns the currently visible section ID.
**When to use:** Any report viewer with a sidebar section nav.
**Example:**
```javascript
// src/hooks/useScrollSpy.js
import { useState, useEffect, useRef } from 'react';

export function useScrollSpy(sectionIds, options = {}) {
  const {
    prefix = 'section-',
    threshold = 0.3,
    topOffset = 132, // 52px nav + ~40px stage nav + buffer
  } = options;

  const [activeSection, setActiveSection] = useState(null);
  const observerRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (!sectionIds || sectionIds.length === 0) return;

    const elements = sectionIds
      .map(id => document.getElementById(prefix + id))
      .filter(Boolean);

    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Debounce to prevent flicker on fast scrolling
        if (debounceRef.current) cancelAnimationFrame(debounceRef.current);
        debounceRef.current = requestAnimationFrame(() => {
          let best = null;
          for (const entry of entries) {
            if (entry.isIntersecting) {
              if (!best || entry.intersectionRatio > best.intersectionRatio) {
                best = entry;
              }
            }
          }
          if (best) {
            const key = best.target.id.replace(prefix, '');
            setActiveSection(key);
          }
        });
      },
      {
        threshold,
        rootMargin: `-${topOffset}px 0px -60% 0px`,
      },
    );

    elements.forEach(el => observer.observe(el));
    observerRef.current = observer;

    return () => {
      observer.disconnect();
      observerRef.current = null;
      if (debounceRef.current) cancelAnimationFrame(debounceRef.current);
    };
  }, [sectionIds, prefix, threshold, topOffset]);

  return activeSection;
}
```

**Flicker prevention:** The current implementations have no debouncing. Adding `requestAnimationFrame` debouncing coalesces rapid intersection events into a single state update per frame. The `rootMargin: -${topOffset}px 0px -60% 0px` means only the top 40% of the viewport triggers section changes (bottom 60% ignored), preventing rapid toggling when a section boundary crosses the viewport center.

**Offset calculation:** Layout.jsx top nav = 52px. StageNavBar will be approximately 40px (tab bar + border). Total offset = ~92px, rounded to ~100px with a small buffer. The `topOffset` parameter lets each consumer tune this.

### Pattern 4: ReportMarkdown Wrapper
**What:** Pre-configured react-markdown component with Thes1s inline styles and citation integration.
**When to use:** Every place that renders markdown narrative text.
**Example:**
```javascript
// src/components/ReportMarkdown.jsx
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { C } from '../theme';
import { renderTextWithCitations } from './CitationTooltip.jsx';

// Custom components that apply Thes1s inline styles
function makeComponents(citations, onCitationClick) {
  return {
    h2: ({ children }) => (
      <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginTop: 20, marginBottom: 10 }}>
        {children}
      </div>
    ),
    h3: ({ children }) => (
      <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginTop: 16, marginBottom: 8 }}>
        {children}
      </div>
    ),
    p: ({ children }) => {
      // If citations exist, process [N] markers in text nodes
      if (citations?.length > 0) {
        return (
          <p style={{ margin: 0, marginBottom: 12, lineHeight: 1.7 }}>
            {processChildrenWithCitations(children, citations, onCitationClick)}
          </p>
        );
      }
      return <p style={{ margin: 0, marginBottom: 12, lineHeight: 1.7 }}>{children}</p>;
    },
    blockquote: ({ children }) => (
      <div style={{
        background: C.accentLight,
        borderLeft: '3px solid ' + C.accent,
        padding: '10px 14px',
        borderRadius: '0 6px 6px 0',
        marginBottom: 12,
      }}>
        {children}
      </div>
    ),
    ul: ({ children }) => (
      <div style={{ marginBottom: 12 }}>{children}</div>
    ),
    li: ({ children }) => (
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
        <span style={{
          display: 'inline-block', width: 6, height: 6,
          borderRadius: '50%', background: C.textMuted,
          marginTop: 7, flexShrink: 0,
        }} />
        <span style={{ flex: 1 }}>{children}</span>
      </div>
    ),
    ol: ({ children }) => (
      <div style={{ marginBottom: 12, counterReset: 'ol-counter' }}>{children}</div>
    ),
    strong: ({ children }) => (
      <strong style={{ fontWeight: 700 }}>{children}</strong>
    ),
    a: ({ href, children }) => (
      <a href={href} target="_blank" rel="noopener noreferrer"
        style={{ color: C.accent, textDecoration: 'underline' }}>
        {children}
      </a>
    ),
    table: ({ children }) => (
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
        {children}
      </table>
    ),
    th: ({ children }) => (
      <th style={{
        padding: '8px 12px', borderBottom: '2px solid ' + C.border,
        fontSize: 12, fontWeight: 600, color: C.textMuted, textAlign: 'left',
      }}>
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td style={{
        padding: '8px 12px', borderBottom: '1px solid ' + C.borderLight,
        fontSize: 12, color: C.text,
      }}>
        {children}
      </td>
    ),
  };
}

export default function ReportMarkdown({ content, citations, onCitationClick }) {
  if (!content) return null;
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      components={makeComponents(citations, onCitationClick)}
    >
      {content}
    </Markdown>
  );
}
```

### Pattern 5: StageNavBar Component
**What:** Horizontal tab bar for switching between One Pager, Pitch Deck, Full Story.
**When to use:** Rendered above report content on all report routes.
**Example:**
```javascript
// src/components/StageNavBar.jsx
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { C } from '../theme';

const STAGES = [
  { key: 'one-pager', label: 'One Pager', gate: null },
  { key: 'pitch-deck', label: 'Pitch Deck', gate: 'onePager' },
  { key: 'full-story', label: 'Full Story', gate: 'pitchDeck' },
];

export default function StageNavBar({ stageApprovals }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = location.pathname;

  return (
    <div style={{
      display: 'flex',
      gap: 0,
      borderBottom: '1px solid ' + C.border,
      marginBottom: 24,
    }}>
      {STAGES.map(stage => {
        const isActive = currentPath.endsWith('/' + stage.key);
        const isLocked = stage.gate && stageApprovals?.[stage.gate] !== 'approved';

        return (
          <button
            key={stage.key}
            disabled={isLocked}
            onClick={() => !isLocked && navigate(`/research/${id}/${stage.key}`)}
            title={isLocked ? `Approve ${stage.gate === 'onePager' ? 'One Pager' : 'Pitch Deck'} to unlock` : ''}
            style={{
              padding: '10px 20px',
              background: 'transparent',
              border: 'none',
              borderBottom: isActive ? '2px solid ' + C.accent : '2px solid transparent',
              color: isLocked ? C.textMuted : isActive ? C.accent : C.text,
              fontWeight: isActive ? 600 : 400,
              fontSize: 13,
              cursor: isLocked ? 'not-allowed' : 'pointer',
              opacity: isLocked ? 0.5 : 1,
              display: 'flex', alignItems: 'center', gap: 6,
              fontFamily: 'inherit',
            }}
          >
            {isLocked && /* lock icon SVG */}
            {stage.label}
          </button>
        );
      })}
    </div>
  );
}
```

### Anti-Patterns to Avoid
- **Duplicating helpers in new report viewers:** FullStory.jsx (Phase 20) must import from `reportHelpers.js`, not copy-paste from OnePager/PitchDeck.
- **CSS classes or className attributes:** This project uses inline styles exclusively via the `C` palette. react-markdown's default rendering uses HTML elements with no classes, which is fine. Never add `className` props -- use `style` only.
- **Importing `parseMarkdown` after migration:** Once `ReportMarkdown` is in place, remove `parseMarkdown` and `renderInline` from SectionRenderer.jsx entirely. Keeping a dead fallback creates confusion.
- **Hard-coding scroll spy offset:** The offset depends on which bars are visible (top nav: 52px, stage nav: ~40px). Pass offset as a prop/option, don't hard-code magic numbers.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Markdown to React | Extending `parseMarkdown()` with more regex patterns | `react-markdown` + `remark-gfm` | CommonMark spec is complex (nested lists, reference links, entity escaping, table alignment). Custom parser handles only 4 of 20+ markdown features. Pipeline output already uses numbered lists, tables, and will likely add more. |
| GFM table parsing | Custom `\|` pipe-based table parser | `remark-gfm` plugin | Table alignment, header detection, cell escaping -- all solved. |
| Scroll spy debouncing | Manual `setTimeout` debouncing | `requestAnimationFrame` in IntersectionObserver callback | rAF naturally coalesces to 1 update per paint frame (~16ms). setTimeout can miss or over-fire. |

**Key insight:** The custom `parseMarkdown()` handles `##`, `###`, `**bold**`, and `- bullets` only. The pipeline already outputs numbered lists (Full Story valuation_confirmation) and tables. Every new markdown feature the pipeline starts using would require another regex branch. react-markdown eliminates this entire maintenance burden.

## Common Pitfalls

### Pitfall 1: Citation [N] markers parsed as markdown links
**What goes wrong:** react-markdown may interpret `[1]` or `[N]` as partial link references and swallow them.
**Why it happens:** CommonMark spec treats `[text]` as potential link references if a corresponding definition exists.
**How to avoid:** In practice, bare `[1]` without a link definition renders as literal text in react-markdown. But if a narrative accidentally contains a matching definition (e.g., `[1]: http://...`), it would become a link. The safest approach is to process `[N]` patterns in the custom `p` component override AFTER react-markdown has parsed the markdown. Since react-markdown preserves literal text as text nodes in the `children` prop, the custom paragraph component can scan children strings for `[N]` and replace them with `CitationTooltip` components.
**Warning signs:** Citations disappear from rendered output, or appear as clickable links instead of superscript tooltips.

### Pitfall 2: ESM import issues in tests
**What goes wrong:** `vitest` test files that `require('react-markdown')` will fail because react-markdown v10 is ESM-only.
**Why it happens:** v9+ dropped CommonJS support.
**How to avoid:** All test files in this project already use ESM imports (`import { describe, it, expect } from 'vitest'`). vitest handles ESM natively. No action needed -- just don't introduce `require()` in new test files.
**Warning signs:** `ERR_REQUIRE_ESM` errors in test runs.

### Pitfall 3: IntersectionObserver flicker near section boundaries
**What goes wrong:** Active section indicator rapidly toggles between two sections when the boundary is near the viewport edge.
**Why it happens:** Without debouncing, every pixel of scroll that changes intersection ratios triggers a state update, potentially alternating between two entries that are both "intersecting" with similar ratios.
**How to avoid:** (1) Use `requestAnimationFrame` debouncing in the observer callback. (2) Use a generous negative rootMargin (bottom `-60%` means only the top ~40% of viewport triggers). (3) Pick the entry with the highest `intersectionRatio` when multiple entries are intersecting.
**Warning signs:** Section nav sidebar highlight "jumps" back and forth rapidly.

### Pitfall 4: StageNavBar height not accounted for in scroll spy offset
**What goes wrong:** Clicking a section in the sidebar scrolls to the section, but it's hidden behind the StageNavBar.
**Why it happens:** The `scrollMarginTop` on section elements and the IntersectionObserver `rootMargin` must both account for the StageNavBar's height. Currently section elements use `scrollMarginTop: 120` (which roughly covers 52px nav + ~68px buffer). After adding StageNavBar (~40px), this needs to increase to ~160px.
**How to avoid:** Use a CSS custom property or constant for the total header height. Pass it as the `topOffset` to `useScrollSpy` AND set it as `scrollMarginTop` on section elements.
**Warning signs:** Sections appear clipped at the top when navigated to via sidebar click.

### Pitfall 5: Theme reactivity in react-markdown components
**What goes wrong:** Markdown renders with stale colors after theme toggle (dark/light).
**Why it happens:** The `components` object in react-markdown uses `C.text`, `C.accent`, etc. Since `C` is a mutable object that gets `Object.assign`'d on theme change, and `makeComponents` is called at render time, this should work. BUT if `makeComponents` is memoized or cached outside the render cycle, it would capture stale `C` values.
**How to avoid:** Call `makeComponents()` inside the component render (not at module level, not in useMemo). The function is cheap.
**Warning signs:** Text colors don't change when toggling dark/light mode.

## Code Examples

### Citation Integration with react-markdown

The critical integration point -- making `[N]` citation markers work inside react-markdown rendered content:

```javascript
// Process react-markdown children to replace [N] patterns with CitationTooltip
function processChildrenWithCitations(children, citations, onCitationClick) {
  if (!children || !citations?.length) return children;

  return React.Children.map(children, child => {
    // Only process string children
    if (typeof child !== 'string') return child;

    // Check for [N] patterns
    if (!/\[\d+\]/.test(child)) return child;

    // Split on [N] and interleave CitationTooltips
    return renderTextWithCitations(child, citations, onCitationClick);
  });
}
```

This works because react-markdown passes literal text as string children to the `p` component. The custom `p` override intercepts these strings, scans for `[N]` patterns, and replaces them with `CitationTooltip` components using the existing `renderTextWithCitations` function from `CitationTooltip.jsx`.

### Existing IntersectionObserver Logic (extract target)

Both OnePager.jsx (lines 122-158) and PitchDeck.jsx (lines 424-459) use identical logic:

```javascript
// Current pattern in both files (will be extracted to useScrollSpy)
const observer = new IntersectionObserver(
  (entries) => {
    let best = null;
    for (const entry of entries) {
      if (entry.isIntersecting) {
        if (!best || entry.intersectionRatio > best.intersectionRatio) {
          best = entry;
        }
      }
    }
    if (best) {
      const key = best.target.id.replace('section-', '');
      setActiveSection(key);
    }
  },
  { threshold: 0.3, rootMargin: '-80px 0px -60% 0px' },
);
```

The shared hook wraps this with: configurable prefix, configurable offset (replaces hardcoded `-80px`), rAF debouncing, and cleanup.

### Duplicated Functions Inventory (exact match confirmed)

| Function | OnePager.jsx | PitchDeck.jsx | SectionRenderer.jsx |
|----------|-------------|---------------|---------------------|
| `formatTitle` | line 11 | line 103 | -- |
| `formatRelativeTime` | line 23 | line 113 | -- |
| `stateToLabel` | line 36 | line 126 | -- |
| `verdictDotColor` | line 73 | line 92 | -- |
| `Spinner` component | line 96 | line 158 | -- |
| `injectSpinnerStyle` | line 85 | line 145 | -- |
| `fmtNum` | -- | -- | line 43 |
| `fmtDollar` | -- | -- | line 54 |
| `fmtPct` | -- | -- | line 59 |
| `formatDataValue` | -- | -- | line 73 |
| `parseMarkdown` | -- | -- | line 108 |
| `renderInline` | -- | -- | line 193 |
| `parseSummary` | -- | -- | line 207 |

Functions to extract to `reportHelpers.js`: `formatTitle`, `formatRelativeTime`, `stateToLabel`, `verdictDotColor`, `fmtNum`, `fmtDollar`, `fmtPct`, `formatDataValue`.

Functions to remove (replaced by react-markdown): `parseMarkdown`, `renderInline`, `parseSummary`.

Functions that stay in their source files: `camelToTitle` (SectionRenderer-specific), `groupDataEntries` (SectionRenderer-specific), `computeSectionStatuses`/`computePercentage` (OnePager-specific), `getPhaseStatus`/`getSectionNavItems` (PitchDeck-specific).

### Routing Structure for StageNavBar

Current routes from App.jsx:
```javascript
<Route path="/research/:id/one-pager" element={<OnePager ... />} />
<Route path="/research/:id/pitch-deck" element={<PitchDeck ... />} />
<Route path="/research/:id/full-story" element={<FullStory ... />} />
```

StageNavBar uses these same paths. The component reads `useLocation().pathname` to determine the active tab and `useNavigate()` to switch. No route changes needed.

**Key observation:** StageNavBar needs `stageApprovals` from the report data. This is available via `getReport(id)` which is already passed as a prop to all three report components. StageNavBar can receive it as a prop.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Custom regex markdown parser | react-markdown with remark ecosystem | react-markdown v9 (2023) added ESM-only, v10 (2025) latest stable | Full CommonMark + GFM support, zero maintenance for new syntax |
| IntersectionObserver inline in each component | Extracted to shared hook | Standard React pattern | Eliminates duplication, allows per-component tuning |
| Copy-paste helpers between report viewers | Shared module with named exports | Standard JS refactoring | Single source of truth, easier testing |

**Deprecated/outdated:**
- `parseMarkdown()` custom function: Will be removed in this phase, replaced by `react-markdown`.
- `renderInline()` bold parser: Only handles `**bold**`. react-markdown handles all inline formatting.
- `parseSummary()` bullet parser: Subset of what react-markdown handles natively.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.0 |
| Config file | Inferred from vite.config.js (no separate vitest.config.js) |
| Quick run command | `npm test -- --run` |
| Full suite command | `npm test -- --run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INFRA-01 | Shared formatters produce consistent output | unit | `npx vitest run src/components/__tests__/reportHelpers.test.js` | Wave 0 |
| INFRA-02 | useScrollSpy returns correct active section | unit | `npx vitest run src/hooks/__tests__/useScrollSpy.test.js` | Wave 0 |
| INFRA-03 | ReportMarkdown renders headings, lists, tables, bold, citations | unit | `npx vitest run src/components/__tests__/reportMarkdown.test.js` | Wave 0 |
| INFRA-04 | StageNavBar renders tabs, handles locked state | unit | `npx vitest run src/components/__tests__/stageNavBar.test.js` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npm test -- --run`
- **Per wave merge:** `npm test -- --run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/components/__tests__/reportHelpers.test.js` -- covers INFRA-01 (move existing tests from onePager.test.js and sectionRenderer.test.js, add new ones)
- [ ] `src/hooks/__tests__/useScrollSpy.test.js` -- covers INFRA-02 (test hook returns active section, handles empty input)
- [ ] `src/components/__tests__/reportMarkdown.test.js` -- covers INFRA-03 (test markdown rendering with custom styles)
- [ ] `src/components/__tests__/stageNavBar.test.js` -- covers INFRA-04 (test tab rendering, locked state)

**Note:** Existing test files `onePager.test.js` and `sectionRenderer.test.js` test functions (`formatTitle`, `stateToLabel`, `camelToTitle`, `formatDataValue`) that will be moved. These tests should migrate to `reportHelpers.test.js` or be updated to import from the new location. The original test files should be updated to import from the new shared module.

## Open Questions

1. **parseSummary removal timing**
   - What we know: `parseSummary()` in SectionRenderer.jsx handles summary callout text (detects bullets, renders inline bold). react-markdown handles this natively.
   - What's unclear: Should `parseSummary` be replaced with `ReportMarkdown` in the same phase, or left as-is since it works and is only in one file?
   - Recommendation: Replace in this phase. The summary callout already renders markdown-like content (bullets, bold). Using `ReportMarkdown` there too ensures consistency. Wrap in the callout styling container.

2. **FullStory.jsx integration timing**
   - What we know: FullStory.jsx is currently a minimal shell (Phase 18 temporary). Phase 20 will build the real component.
   - What's unclear: Should Phase 19 touch FullStory.jsx at all, or only provide the shared infrastructure for Phase 20 to consume?
   - Recommendation: Do NOT modify FullStory.jsx in Phase 19. Just build the shared components. Phase 20 will consume them when building the real Full Story viewer. This prevents rework.

3. **Test environment for IntersectionObserver**
   - What we know: jsdom (used by vitest) does not implement IntersectionObserver. Existing tests don't test the observer directly.
   - What's unclear: Can we meaningfully unit-test useScrollSpy without mocking IntersectionObserver?
   - Recommendation: Test the hook's edge cases (empty sectionIds, cleanup on unmount) and mock IntersectionObserver in tests. The core observer behavior is browser-native and can be verified visually. The hook's value-add is debouncing and configuration, which can be tested via mocks.

## Project Constraints (from CLAUDE.md)

- **Inline styles only:** No CSS files, no CSS-in-JS libraries. All styling via mutable `C` palette from `theme.js`. react-markdown component overrides must use `style={}` props.
- **Component conventions:** `export default function ComponentName(props)` for components. Named exports for hooks and helpers.
- **Test exports:** Use `export const _testExports = { ... }` pattern for internal functions that need testing.
- **Error handling:** Return `null` on failure, use `console.warn` for non-fatal issues. Never `console.error`.
- **Import organization:** Hooks from `../hooks/`, components from `./`, theme from `../theme`.
- **Naming:** React components PascalCase `.jsx`, hooks camelCase `use` prefix `.js`, pure logic modules camelCase `.js`.
- **Dev command:** `npm run dev` for Vite dev server, `npm test` for vitest.
- **GSD workflow:** All code changes go through GSD commands.

## Sources

### Primary (HIGH confidence)
- **OnePager.jsx** (src/components/OnePager.jsx) -- Full source read, 557 lines. Identified all duplicated helpers and IntersectionObserver pattern.
- **PitchDeck.jsx** (src/components/PitchDeck.jsx) -- Full source read, 650+ lines. Confirmed identical helper functions and observer logic.
- **SectionRenderer.jsx** (src/components/SectionRenderer.jsx) -- Full source read, 594 lines. Identified formatters and parseMarkdown to extract/replace.
- **CitationTooltip.jsx** (src/components/CitationTooltip.jsx) -- Full source read, 135 lines. Confirmed `renderTextWithCitations` API for citation integration.
- **npm registry** -- `react-markdown@10.1.0` (peerDependencies: `react >=18`), `remark-gfm@4.0.1`. Versions verified via `npm view`.
- **Report data files** (.thes1s/reports/MNST/) -- Audited markdown features in actual pipeline output: bold, numbered lists, bullet lists, h2 headings confirmed. No blockquotes or inline links in current output, but likely in future pipeline iterations.
- **App.jsx** -- Confirmed routing structure (`/research/:id/one-pager`, `/research/:id/pitch-deck`, `/research/:id/full-story`).

### Secondary (MEDIUM confidence)
- [react-markdown GitHub](https://github.com/remarkjs/react-markdown) -- ESM-only since v9, components prop API, remarkPlugins configuration.
- [react-markdown npm](https://www.npmjs.com/package/react-markdown) -- 10M+ weekly downloads, actively maintained.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- react-markdown is the de facto solution, versions verified against npm registry, React 19 compatibility confirmed via peerDependencies
- Architecture: HIGH -- extraction patterns follow established project conventions (VerdictBadge.jsx, ConfidenceBadge.jsx as precedent), all source code read in full
- Pitfalls: HIGH -- identified from direct source code analysis (citation integration, scroll spy math, theme reactivity) and library documentation (ESM-only)
- Validation: MEDIUM -- IntersectionObserver mocking in jsdom is well-documented but adds test complexity

**Research date:** 2026-04-02
**Valid until:** 2026-05-02 (stable domain -- react-markdown and IntersectionObserver API are mature)
