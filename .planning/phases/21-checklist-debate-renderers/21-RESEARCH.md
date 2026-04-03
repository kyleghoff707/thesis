# Phase 21: Checklist & Debate Renderers - Research

**Researched:** 2026-04-02
**Domain:** React component rendering -- structured data visualization for scored checklists and multi-step adversarial debates
**Confidence:** HIGH

## Summary

Phase 21 adds two specialized renderer components (ChecklistRenderer and DebateRenderer) that replace the generic SectionRenderer for 4 of the 6 Full Story sections. The FullStory.jsx rendering loop (line ~391) already maps SECTION_DEFS to SectionRenderer -- this phase adds conditional branching: checklist sections use ChecklistRenderer, the inversion_rebuttal section uses DebateRenderer, and the remaining 2 sections (event_analysis, valuation_confirmation) continue using SectionRenderer.

The data shapes are fully validated across 2 tickers (SFM, MNST). Checklist items have a consistent `{number, item, verdict, evidence, confidence}` structure with summary aggregates `{passCount, failCount, partialCount, totalItems, scoreDisplay}`. Debate data lives in `debateOutputs` with 4 roles (bull, bear, bull_rebuttal, judge), each with well-defined content structures. All enum values are documented below.

The codebase has strong existing patterns to follow: inline styles via the C palette, VerdictBadge/ConfidenceBadge reuse, CollapsibleSection for expand/collapse, and SectionRenderer's header pattern (number circle + title + verdict badge + confidence badge) for consistency. Both renderers are self-contained -- they receive section data props and manage their own internal layout and state.

**Primary recommendation:** Build ChecklistRenderer.jsx and DebateRenderer.jsx as standalone components in `src/components/`, then modify FullStory.jsx's rendering loop to conditionally dispatch to the correct renderer by section key.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Each checklist item renders as a collapsed row: verdict badge (PASS/FAIL/PARTIAL) + item number + question text + confidence indicator. Click to expand and reveal the full evidence paragraph.
- **D-02:** All items start collapsed equally -- no auto-expand for FAIL/PARTIAL items. User expands what they want.
- **D-03:** Three checklist sections (meaning_checklist, moat_checklist, management_checklist) all use the same ChecklistRenderer component. Section data provides `data.items[]` with `{number, item, verdict, evidence, confidence}`.
- **D-04:** Segmented horizontal bar at the top of each checklist section -- green/yellow/red segments proportional to pass/partial/fail counts. Text score line below the bar (e.g., "12 PASS . 3 PARTIAL . 0 FAIL").
- **D-05:** Data sourced from `data.summary` with `{passCount, failCount, partialCount, totalItems, scoreDisplay}`.
- **D-06:** Horizontal tabs across the top of the debate section: Bull | Bear | Rebuttal | Judge. One step visible at a time. Each tab styled with its role color.
- **D-07:** Tab state managed locally in DebateRenderer (useState). No URL/route changes for tab switching.
- **D-08:** Each debate role distinguished by colored left border on the content area: Bull (green/C.green), Bear (red/C.red), Rebuttal (teal/C.accent), Judge (slate/C.textMuted). Role name + label shown in tab and content header.
- **D-09:** Consistent with existing left-border accent pattern used in SectionRenderer summary callouts.
- **D-10:** Bull tab: `overallThesis` as header text, then 7 `thesisPoints[]` as expandable items with `{point, evidence, sourceSection}`.
- **D-11:** Bear tab: `overallBearCase` as header text, then 7 `inversions[]` with `{targetPoint, counterArgument, evidence, severity, sources[]}`. Severity shown as badge.
- **D-12:** Rebuttal tab: 7 `rebuttals[]` with `{bearPoint, rebuttal, rebuttalStrength, honest}`. Strength shown as badge. `honest` flag displayed when false (bull admitted the point stands).
- **D-13:** Judge tab: 7 `exchanges[]` first, then overall verdict at bottom. Exchanges show side-by-side strength indicators: Bull strength on left, Bear strength on right, verdict (Resolved/Unresolved) in center, reasoning expandable. Overall verdict shows direction banner + summary + investmentImplication.
- **D-14:** Judge tab exchanges first, overall verdict at bottom -- natural reading order following the logic before the conclusion.
- **D-15:** FullStory.jsx's section rendering loop checks section key -- if `meaning_checklist`, `moat_checklist`, or `management_checklist`, render ChecklistRenderer instead of SectionRenderer. If `inversion_rebuttal`, render DebateRenderer instead. Other sections continue using SectionRenderer.
- **D-16:** Both new renderers receive the full section object (same props as SectionRenderer) plus debateOutputs for DebateRenderer. They handle their own internal layout.

### Claude's Discretion
- Exact expand/collapse animation approach (can reuse CollapsibleSection or implement simpler toggle)
- Strength indicator visual style for exchange comparisons (bars, dots, or text badges)
- Tab underline/indicator style (follow existing nav patterns)
- Whether to show confidence badges on checklist items or keep minimal
- Loading/empty states for debate data

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FS-02 | User can view scored checklists (Meaning 15pt, Moat 15pt, Management 13pt) with item-level PASS/FAIL/PARTIAL indicators and aggregate scores | ChecklistRenderer with VerdictBadge reuse, segmented aggregate bar, expand/collapse evidence -- data shape validated across SFM and MNST |
| FS-03 | User can view the adversarial debate (Bull -> Bear -> Bull Rebuttal -> Judge) with distinct visual treatment per step | DebateRenderer with horizontal tabs, role-colored left borders, 4 distinct content layouts per tab -- data shape validated |
| FS-05 | User can navigate between debate steps via tabs or accordion controls | Horizontal tab bar with useState-managed active tab, role-colored tab indicators, no URL changes |
</phase_requirements>

## Standard Stack

### Core (already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19.2.0 | Component rendering, useState for tab/expand state | Already in project |
| react-markdown | (installed) | Markdown rendering for evidence text | Already used via ReportMarkdown |

### Reusable Components (no new dependencies)
| Component | Location | Purpose | Reuse Pattern |
|-----------|----------|---------|---------------|
| VerdictBadge | `src/components/VerdictBadge.jsx` | PASS/FAIL/PARTIAL pills on checklist items | Direct reuse -- already handles PASS, FAIL; needs PARTIAL mapping |
| ConfidenceBadge | `src/components/ConfidenceBadge.jsx` | HIGH/MEDIUM/LOW confidence display | Direct reuse for checklist item confidence |
| CollapsibleSection | `src/components/CollapsibleSection.jsx` | Animated expand/collapse | Pattern reference -- may use simpler inline toggle for checklist items |
| DirectionBadge | Inline in `FullStory.jsx` | BULL/BEAR/NEUTRAL direction badge | Reuse in Judge tab overall verdict |
| ReportMarkdown | `src/components/ReportMarkdown.jsx` | Markdown rendering with citation support | Use for evidence/narrative text that may contain markdown |
| RedFlagCallout | `src/components/RedFlagCallout.jsx` | Red flag display | Reuse in section-level rendering |
| CitationTooltip | `src/components/CitationTooltip.jsx` | Citation rendering with tooltips | Available if needed for debate content |

### No New Dependencies Required

No `npm install` needed. All rendering uses React + the existing C palette + existing shared components.

## Architecture Patterns

### Recommended File Structure
```
src/components/
  ChecklistRenderer.jsx    # NEW — handles all 3 checklist sections
  DebateRenderer.jsx        # NEW — handles inversion_rebuttal section
  FullStory.jsx             # MODIFIED — conditional rendering dispatch
  __tests__/
    checklistRenderer.test.js  # NEW — unit tests
    debateRenderer.test.js     # NEW — unit tests
```

### Pattern 1: Conditional Section Dispatch in FullStory.jsx

**What:** The SECTION_DEFS rendering loop branches on section key to choose the correct renderer.
**When to use:** Where FullStory.jsx currently renders SectionRenderer for all sections (line ~391).

Current code:
```jsx
{SECTION_DEFS.map((def) => {
  const section = sectionMap[def.key];
  const qs = qualityMap[def.key];
  if (!section) return null;
  return (
    <div key={def.key}>
      {qs && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: -8, position: 'relative', zIndex: 1, paddingRight: 8 }}>
          <QualityBadge mechanical={qs.score} methodology={qs.methodology?.score} />
        </div>
      )}
      <SectionRenderer
        section={section}
        sectionId={'section-' + def.key}
        onCitationClick={handleCitationClick}
      />
    </div>
  );
})}
```

Target pattern:
```jsx
const CHECKLIST_KEYS = new Set(['meaning_checklist', 'moat_checklist', 'management_checklist']);

{SECTION_DEFS.map((def) => {
  const section = sectionMap[def.key];
  const qs = qualityMap[def.key];
  if (!section) return null;

  let content;
  if (CHECKLIST_KEYS.has(def.key)) {
    content = (
      <ChecklistRenderer
        section={section}
        sectionId={'section-' + def.key}
        onCitationClick={handleCitationClick}
      />
    );
  } else if (def.key === 'inversion_rebuttal') {
    content = (
      <DebateRenderer
        section={section}
        sectionId={'section-' + def.key}
        debateOutputs={fullStoryData?.debateOutputs}
        onCitationClick={handleCitationClick}
      />
    );
  } else {
    content = (
      <SectionRenderer
        section={section}
        sectionId={'section-' + def.key}
        onCitationClick={handleCitationClick}
      />
    );
  }

  return (
    <div key={def.key}>
      {qs && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: -8, position: 'relative', zIndex: 1, paddingRight: 8 }}>
          <QualityBadge mechanical={qs.score} methodology={qs.methodology?.score} />
        </div>
      )}
      {content}
    </div>
  );
})}
```

### Pattern 2: Section Header Consistency

**What:** Both ChecklistRenderer and DebateRenderer MUST replicate the SectionRenderer header pattern (number circle + title + verdict badge + confidence badge) so all 6 sections look consistent in the scrolling view.
**Why:** The section header is the visual anchor in the nav. Changing it for checklist/debate sections would break visual continuity.

SectionRenderer header pattern to replicate:
```jsx
<div style={{
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  borderBottom: '1px solid ' + C.border,
  paddingBottom: 12,
  marginBottom: 16,
}}>
  {section.sectionNumber != null && (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 24, height: 24,
      borderRadius: '50%',
      background: C.badge,
      color: C.badgeText,
      fontSize: 11, fontWeight: 700,
      flexShrink: 0,
    }}>
      {section.sectionNumber}
    </span>
  )}
  <span style={{ fontSize: 16, fontWeight: 700, color: C.text, flex: 1 }}>
    {section.title}
  </span>
  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
    <VerdictBadge verdict={section.verdict} />
    <ConfidenceBadge confidence={section.confidence} />
  </div>
</div>
```

### Pattern 3: Section Card Wrapper Consistency

**What:** Both renderers must use the same outer card styling as SectionRenderer for consistent visual appearance.

```jsx
<div
  id={sectionId}
  style={{
    border: '1px solid ' + C.border,
    borderRadius: 8,
    padding: '16px 20px',
    marginBottom: 20,
    background: C.bgCard,
    boxShadow: '0 1px 3px 0 rgba(0,0,0,0.04)',
    scrollMarginTop: 160,
  }}
>
```

### Pattern 4: Expand/Collapse for Checklist Items

**What:** Simple boolean toggle per item, no animation needed (CollapsibleSection is heavyweight for individual checklist rows).
**Recommendation:** Use a Set in state to track which item numbers are expanded. Toggle on click.

```jsx
const [expanded, setExpanded] = useState(new Set());
function toggle(num) {
  setExpanded(prev => {
    const next = new Set(prev);
    next.has(num) ? next.delete(num) : next.add(num);
    return next;
  });
}
```

### Pattern 5: Tab Navigation for Debate Steps

**What:** Horizontal tab bar with useState tracking active tab index/key.
**Follows:** The same inline styling approach as FullStory.jsx's sticky nav but adapted to horizontal layout.

```jsx
const TABS = [
  { key: 'bull', label: 'Bull', color: C.green },
  { key: 'bear', label: 'Bear', color: C.red },
  { key: 'rebuttal', label: 'Rebuttal', color: C.accent },
  { key: 'judge', label: 'Judge', color: C.textMuted },
];
const [activeTab, setActiveTab] = useState('bull');
```

### Anti-Patterns to Avoid
- **Do NOT modify SectionRenderer** -- the new renderers are separate components, not extensions of SectionRenderer. The section header pattern should be duplicated (it's ~20 lines), not extracted into a shared sub-component that adds coupling.
- **Do NOT use CSS classes or external stylesheets** -- all styling is inline via C palette. Project convention.
- **Do NOT add react-router integration for debate tabs** -- D-07 explicitly locks this as local useState.
- **Do NOT auto-expand FAIL items** -- D-02 explicitly says all items start collapsed equally.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Verdict badges | Custom verdict rendering | VerdictBadge component | Already handles PASS/FAIL/WATCHLIST with icons and colors |
| Confidence display | Custom confidence rendering | ConfidenceBadge component | Already handles HIGH/MEDIUM/LOW |
| Direction badge | Custom direction rendering | DirectionBadge from FullStory.jsx | Already handles Bull/Bear/Neutral |
| Markdown rendering | Custom text parsing | ReportMarkdown component | Already handles markdown + citations |

**Key insight:** VerdictBadge currently maps PASS/FAIL/WATCHLIST but NOT "PARTIAL". Checklist items use PARTIAL verdict. The ChecklistRenderer needs to handle PARTIAL -- either by extending VerdictBadge's map or by rendering a custom badge inline for the PARTIAL case. Extending VerdictBadge is recommended since PARTIAL may appear elsewhere in the future.

## Data Shape Reference (Validated)

### Checklist Item Shape
```js
{
  number: 1,                    // int, 1-indexed
  item: "Can you describe...",  // string, the question
  verdict: "PASS",              // "PASS" | "FAIL" | "PARTIAL"
  evidence: "Sprouts operates...", // string, the evidence paragraph
  confidence: "HIGH"            // "HIGH" | "MEDIUM" | "LOW"
}
```

### Checklist Summary Shape
```js
{
  passCount: 12,
  failCount: 0,
  partialCount: 3,
  totalItems: 15,
  scoreDisplay: "12/15 PASS, 3 PARTIAL, 0 FAIL",
  // Optional (only on some MNST meaning_checklist):
  criticalItemsStatus: { ... }
}
```

### Debate Outputs Shape
```js
fullStoryData.debateOutputs = {
  bull: {
    step: ..., role: ..., agent: ...,
    content: {
      overallThesis: "string",
      thesisPoints: [{
        point: "string",
        evidence: "string",
        sourceSection: "S2: Meaning Checklist"
      }]  // 7 items
    }
  },
  bear: {
    step: ..., role: ..., agent: ...,
    content: {
      overallBearCase: "string",
      inversions: [{
        targetPoint: "string",
        counterArgument: "string",
        evidence: "string",
        severity: "significant" | "thesis_killer",
        sources: ["url1", "url2", ...]
      }]  // 7 items
    }
  },
  bull_rebuttal: {
    step: ..., role: ..., agent: ...,
    content: {
      rebuttals: [{
        bearPoint: "string",
        rebuttal: "string",
        rebuttalStrength: "strong" | "moderate" | "weak",
        honest: true | false  // false = bull admitted point stands
      }]  // 7 items
    }
  },
  judge: {
    step: ..., role: ..., agent: ...,
    content: {
      exchanges: [{
        topic: "string",
        bullStrength: "strong" | "moderate" | "weak",
        bearStrength: "strong" | "moderate" | "weak",
        verdict: "Unresolved" | "Strong Bear",  // may also include "Resolved", "Strong Bull"
        reasoning: "string"
      }],  // 7 items
      overallVerdict: {
        direction: "Bull" | "Bear" | "Neutral",
        unresolvedCount: 5,
        summary: "string",
        investmentImplication: "string"
      }
    }
  }
}
```

### Enum Values (Validated Across SFM + MNST)

| Field | Observed Values | Notes |
|-------|----------------|-------|
| Checklist verdict | PASS, FAIL, PARTIAL | All 3 present in data |
| Checklist confidence | HIGH, MEDIUM, LOW | All 3 present |
| Inversion severity | significant, thesis_killer | Lowercase |
| Rebuttal strength | strong, moderate, weak | Lowercase |
| Exchange verdict | Unresolved, Strong Bear | Title case; anticipate Resolved, Strong Bull |
| Exchange strength | strong, moderate, weak | Same as rebuttal strength |
| Overall direction | Bull, Bear, Neutral | Title case |

### Section-Level Fields Available on Checklist/Debate Sections

Both checklist and debate sections have the full section object with: `title`, `sectionNumber`, `verdict`, `confidence`, `summary`, `verdictRationale`, `narrative`, `data`, `citations`, `tables`, `redFlags`, `primarySourceInsights`, `crossCuttingFindings`, `searchesPerformed`.

The renderers should display the section header (number + title + verdict + confidence) and the specialized content area. Summary callout and citations should also be rendered for consistency with other sections.

## Common Pitfalls

### Pitfall 1: VerdictBadge Missing PARTIAL
**What goes wrong:** VerdictBadge only maps PASS, FAIL, WATCHLIST, REVIEW. Checklist items use PARTIAL verdict which would render nothing.
**Why it happens:** PARTIAL is unique to checklist items -- not used in section-level verdicts.
**How to avoid:** Add PARTIAL to VerdictBadge's map (yellow background, same as WATCHLIST but with "PARTIAL" label), or handle PARTIAL separately in ChecklistRenderer.
**Warning signs:** Checklist items with no visible verdict badge.

### Pitfall 2: Segmented Bar Math Off By Zero
**What goes wrong:** Segmented bar segments don't sum to 100% when one count is 0.
**Why it happens:** Division by zero or empty segment rendering.
**How to avoid:** Calculate percentages as `count / totalItems * 100`. Use `flex` layout with `flex-grow` set to each count -- handles zero naturally.
**Warning signs:** Bar with gaps or overflow.

### Pitfall 3: Debate Tab Content Mismatch
**What goes wrong:** Tab shows wrong content because debateOutputs keys don't match tab keys.
**Why it happens:** debateOutputs uses `bull_rebuttal` (underscore) but tab might reference `rebuttal`.
**How to avoid:** Map tab keys to debateOutputs keys explicitly: `{ bull: 'bull', bear: 'bear', rebuttal: 'bull_rebuttal', judge: 'judge' }`.
**Warning signs:** Empty tab content or wrong data displayed.

### Pitfall 4: Missing debateOutputs
**What goes wrong:** DebateRenderer crashes when debateOutputs is null/undefined.
**Why it happens:** Older reports or incomplete generation may not have debate data.
**How to avoid:** Guard `if (!debateOutputs)` at the top and render a graceful empty state. Also guard each individual role key.
**Warning signs:** White screen / React error boundary triggered.

### Pitfall 5: Long Evidence Text Overflow
**What goes wrong:** Evidence paragraphs in checklist items are very long (200+ words) and break layout.
**Why it happens:** AI generates detailed evidence for each checklist item.
**How to avoid:** Evidence is in the expandable area, so it naturally flows. Ensure the expand area has proper line-height and padding.
**Warning signs:** Text overlapping other elements.

### Pitfall 6: DirectionBadge Extraction
**What goes wrong:** DirectionBadge is defined inline in FullStory.jsx -- cannot import it.
**Why it happens:** Phase 20 defined it inline per D-20 convention.
**How to avoid:** Either (a) extract DirectionBadge to a separate file, or (b) define a local version in DebateRenderer, or (c) redefine inline in DebateRenderer. Option (a) is cleanest but touches FullStory.jsx. Since Phase 21 already modifies FullStory.jsx, extracting DirectionBadge is a clean add-on.
**Warning signs:** Duplicated code or import errors.

### Pitfall 7: scrollMarginTop Consistency
**What goes wrong:** Clicking a section in the sticky nav scrolls to the wrong position because the new renderers don't have the same scrollMarginTop.
**Why it happens:** SectionRenderer uses `scrollMarginTop: 160` on its card. New renderers must match.
**How to avoid:** Use `scrollMarginTop: 160` on the outermost div of both new renderers, matching SectionRenderer exactly.
**Warning signs:** Section header cut off by the sticky nav bar when clicking nav links.

## Code Examples

### Segmented Aggregate Bar (ChecklistRenderer)
```jsx
// Source: CONTEXT.md D-04, D-05
function AggregateBar({ summary }) {
  if (!summary) return null;
  const { passCount, failCount, partialCount, totalItems } = summary;
  const total = totalItems || (passCount + failCount + partialCount) || 1;

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        display: 'flex',
        height: 8,
        borderRadius: 4,
        overflow: 'hidden',
        background: C.borderLight,
      }}>
        {passCount > 0 && (
          <div style={{ flex: passCount, background: C.green }} />
        )}
        {partialCount > 0 && (
          <div style={{ flex: partialCount, background: C.yellow }} />
        )}
        {failCount > 0 && (
          <div style={{ flex: failCount, background: C.red }} />
        )}
      </div>
      <div style={{
        fontSize: 12,
        fontWeight: 600,
        color: C.textSecondary,
        marginTop: 6,
      }}>
        {passCount} PASS &middot; {partialCount} PARTIAL &middot; {failCount} FAIL
      </div>
    </div>
  );
}
```

### Checklist Item Row (ChecklistRenderer)
```jsx
// Source: CONTEXT.md D-01, D-02, D-03
function ChecklistItem({ item, isExpanded, onToggle }) {
  return (
    <div style={{
      borderBottom: '1px solid ' + C.borderLight,
      padding: '10px 0',
    }}>
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          cursor: 'pointer',
        }}
      >
        <VerdictBadge verdict={item.verdict} />
        <span style={{ fontSize: 12, fontWeight: 600, color: C.textMuted, minWidth: 24 }}>
          #{item.number}
        </span>
        <span style={{ fontSize: 13, color: C.text, flex: 1 }}>
          {item.item}
        </span>
        <ConfidenceBadge confidence={item.confidence} />
        <span style={{
          fontSize: 11,
          color: C.textMuted,
          transition: 'transform 0.2s',
          transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
        }}>
          &#9654;
        </span>
      </div>
      {isExpanded && (
        <div style={{
          padding: '10px 0 4px 44px',
          fontSize: 13,
          color: C.textSecondary,
          lineHeight: 1.7,
        }}>
          {item.evidence}
        </div>
      )}
    </div>
  );
}
```

### Debate Tab Bar (DebateRenderer)
```jsx
// Source: CONTEXT.md D-06, D-07, D-08
const TABS = [
  { key: 'bull', label: 'Bull', color: C.green },
  { key: 'bear', label: 'Bear', color: C.red },
  { key: 'rebuttal', label: 'Rebuttal', color: C.accent },
  { key: 'judge', label: 'Judge', color: C.textMuted },
];

// Inside DebateRenderer:
<div style={{ display: 'flex', gap: 0, borderBottom: '2px solid ' + C.border, marginBottom: 16 }}>
  {TABS.map(tab => (
    <button
      key={tab.key}
      onClick={() => setActiveTab(tab.key)}
      style={{
        padding: '10px 20px',
        fontSize: 13,
        fontWeight: activeTab === tab.key ? 700 : 400,
        color: activeTab === tab.key ? tab.color : C.textMuted,
        background: 'transparent',
        border: 'none',
        borderBottom: activeTab === tab.key ? '2px solid ' + tab.color : '2px solid transparent',
        cursor: 'pointer',
        marginBottom: -2,
        transition: 'all 0.15s',
      }}
    >
      {tab.label}
    </button>
  ))}
</div>
```

### Judge Exchange Row (DebateRenderer)
```jsx
// Source: CONTEXT.md D-13
function ExchangeRow({ exchange, isExpanded, onToggle }) {
  return (
    <div style={{ border: '1px solid ' + C.borderLight, borderRadius: 6, marginBottom: 8, padding: '10px 12px' }}>
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
      >
        {/* Bull strength indicator */}
        <StrengthBadge strength={exchange.bullStrength} side="bull" />
        {/* Verdict in center */}
        <span style={{
          flex: 1,
          textAlign: 'center',
          fontSize: 12,
          fontWeight: 600,
          color: exchange.verdict === 'Unresolved' ? C.yellow : C.red,
        }}>
          {exchange.verdict}
        </span>
        {/* Bear strength indicator */}
        <StrengthBadge strength={exchange.bearStrength} side="bear" />
      </div>
      {/* Topic */}
      <div style={{ fontSize: 12, color: C.textMuted, marginTop: 4 }}>
        {exchange.topic}
      </div>
      {isExpanded && (
        <div style={{ fontSize: 13, color: C.textSecondary, lineHeight: 1.7, marginTop: 8, paddingTop: 8, borderTop: '1px solid ' + C.borderLight }}>
          {exchange.reasoning}
        </div>
      )}
    </div>
  );
}
```

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.0 |
| Config file | vitest config via package.json |
| Quick run command | `npm test -- --run` |
| Full suite command | `npm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FS-02 | ChecklistRenderer renders aggregate bar + item rows with verdicts | unit | `npm test -- --run src/components/__tests__/checklistRenderer.test.js` | No -- Wave 0 |
| FS-02 | ChecklistRenderer expand/collapse toggle works | unit | `npm test -- --run src/components/__tests__/checklistRenderer.test.js` | No -- Wave 0 |
| FS-03 | DebateRenderer renders 4 tabs with correct content per tab | unit | `npm test -- --run src/components/__tests__/debateRenderer.test.js` | No -- Wave 0 |
| FS-05 | DebateRenderer tab switching shows correct content | unit | `npm test -- --run src/components/__tests__/debateRenderer.test.js` | No -- Wave 0 |
| FS-02/03 | FullStory dispatches correct renderer by section key | unit | `npm test -- --run src/components/__tests__/fullStory.test.js` | Yes -- needs extension |

### Sampling Rate
- **Per task commit:** `npm test -- --run`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/components/__tests__/checklistRenderer.test.js` -- covers FS-02
- [ ] `src/components/__tests__/debateRenderer.test.js` -- covers FS-03, FS-05
- [ ] Extend `src/components/__tests__/fullStory.test.js` -- covers conditional dispatch logic

**Testing approach:** Test pure helper functions and data transformations (aggregate bar math, tab key mapping, strength color mapping) via `_testExports`. Component rendering tests are secondary -- the primary quality signal is visual verification.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| SectionRenderer for all sections | Conditional dispatch to specialized renderers | Phase 21 (now) | Checklist + debate sections get purpose-built UIs |
| All data as text/narrative | Structured data -> structured visualization | Phase 21 (now) | Items with individual verdicts, tabbed debate |

**No deprecated patterns apply** -- this is greenfield component work within an established codebase.

## Open Questions

1. **VerdictBadge PARTIAL support**
   - What we know: VerdictBadge maps PASS, FAIL, WATCHLIST, REVIEW but NOT PARTIAL.
   - What's unclear: Should we extend VerdictBadge (touching shared component) or handle PARTIAL locally?
   - Recommendation: Extend VerdictBadge with PARTIAL entry (yellow bg, "PARTIAL" label) since it's a 2-line change and may be needed elsewhere. Low risk.

2. **DirectionBadge extraction**
   - What we know: DirectionBadge is defined inline in FullStory.jsx. DebateRenderer needs it for Judge tab.
   - What's unclear: Extract to separate file or duplicate inline?
   - Recommendation: Extract to `src/components/DirectionBadge.jsx` since FullStory.jsx is already being modified. Clean separation.

3. **Exchange verdict enum completeness**
   - What we know: Only "Unresolved" and "Strong Bear" observed in data. "Resolved" and "Strong Bull" are logically possible but not confirmed.
   - What's unclear: Full set of possible verdict strings.
   - Recommendation: Handle the known values with specific colors, and provide a fallback for unknown values. Use C.textMuted as default.

4. **Severity enum completeness**
   - What we know: Only "significant" and "thesis_killer" observed.
   - What's unclear: Whether other severity levels exist.
   - Recommendation: Map known values (thesis_killer = red, significant = yellow) with a fallback for unknown values.

## Sources

### Primary (HIGH confidence)
- `src/components/FullStory.jsx` -- current section rendering loop, DirectionBadge, QualityBadge
- `src/components/SectionRenderer.jsx` -- section header pattern, card styling, all 11 content blocks
- `src/components/VerdictBadge.jsx` -- existing verdict map (PASS/FAIL/WATCHLIST/REVIEW)
- `src/components/ConfidenceBadge.jsx` -- existing confidence map (HIGH/MEDIUM/LOW)
- `src/components/CollapsibleSection.jsx` -- expand/collapse animation pattern
- `src/theme.js` -- C palette (C_LIGHT and C_DARK color values)
- `.thes1s/reports/SFM/full-story-api.json` -- validated checklist + debate data shape
- `.thes1s/reports/MNST/full-story-api.json` -- cross-validated data shape consistency
- `.planning/phases/21-checklist-debate-renderers/21-CONTEXT.md` -- all locked decisions D-01 through D-16

### Secondary (MEDIUM confidence)
- Exchange verdict enum: only 2 values observed (Unresolved, Strong Bear). Probable that Resolved and Strong Bull exist but unconfirmed. Code should handle gracefully.
- Severity enum: only 2 values observed (significant, thesis_killer). Code should handle unknown values.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, all existing components verified
- Architecture: HIGH -- conditional dispatch pattern is straightforward, data shapes validated across 2 tickers
- Pitfalls: HIGH -- all 7 pitfalls identified from direct code and data inspection
- Data shapes: HIGH -- validated across SFM and MNST with exact field names and enum values

**Research date:** 2026-04-02
**Valid until:** 2026-05-02 (stable -- no external dependencies, internal codebase only)
