# Phase 21: Checklist & Debate Renderers - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-03
**Phase:** 21-checklist-debate-renderers
**Areas discussed:** Checklist Item Layout, Checklist Aggregate Header, Debate Step Navigation, Debate Step Styling

---

## Checklist Item Layout

### Q1: How should each checklist item be displayed?

| Option | Description | Selected |
|--------|-------------|----------|
| Collapsed rows, expand for evidence | Compact row with verdict badge + question + confidence. Click to expand evidence. | ✓ |
| All expanded | Every item shows full evidence inline. Long page, nothing hidden. | |
| Card grid | 2-column grid of item cards. | |

**User's choice:** Collapsed rows, expand for evidence (Recommended)
**Notes:** None

### Q2: Should FAIL/PARTIAL items auto-expand?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, auto-expand non-PASS items | FAIL/PARTIAL start expanded, PASS collapsed. | |
| All collapsed equally | Every item starts collapsed regardless of verdict. | ✓ |
| You decide | Claude picks. | |

**User's choice:** All collapsed equally
**Notes:** None

---

## Checklist Aggregate Header

### Q3: How should the aggregate score be displayed?

| Option | Description | Selected |
|--------|-------------|----------|
| Segmented bar + text | Horizontal stacked bar (green/yellow/red) + text score below. | ✓ |
| Text-only score line | Just the scoreDisplay text, no visual bar. | |
| Circular progress ring | Donut chart showing pass percentage. | |

**User's choice:** Segmented bar + text (Recommended)
**Notes:** None

---

## Debate Step Navigation

### Q4: How should users navigate between 4 debate steps?

| Option | Description | Selected |
|--------|-------------|----------|
| Horizontal tabs | Four tabs: Bull / Bear / Rebuttal / Judge. One visible at a time. | ✓ |
| Vertical accordion | Stacked collapsible sections. | |
| Scrollable vertical with anchors | All steps in scroll order with mini-nav. | |

**User's choice:** Horizontal tabs (Recommended)
**Notes:** None

### Q5: Judge tab — overall verdict position?

| Option | Description | Selected |
|--------|-------------|----------|
| Overall verdict first | Direction banner + summary at top, exchanges below. | |
| Exchanges first, verdict at bottom | Read exchange evaluations, then see conclusion. | ✓ |
| You decide | Claude picks. | |

**User's choice:** Exchanges first, verdict at bottom
**Notes:** User prefers natural reading order — follow the logic, then see the conclusion.

---

## Debate Step Styling

### Q6: How should each debate role be visually distinguished?

| Option | Description | Selected |
|--------|-------------|----------|
| Colored left borders + role labels | Green (Bull), red (Bear), teal (Rebuttal), slate (Judge) left borders. | ✓ |
| Full background tinting | Subtle background color wash per role. | |
| You decide | Claude picks. | |

**User's choice:** Colored left borders + role labels (Recommended)
**Notes:** None

### Q7: How should per-exchange strength comparisons display?

| Option | Description | Selected |
|--------|-------------|----------|
| Side-by-side strength indicators | Bull strength left, Bear strength right, verdict center. Visual comparison. | ✓ |
| Simple list with labels | Cards with text labels for strength and verdict. | |
| You decide | Claude picks. | |

**User's choice:** Side-by-side strength indicators (Recommended)
**Notes:** None

---

## Claude's Discretion

- Expand/collapse animation approach
- Strength indicator visual style
- Tab underline style
- Confidence badge display on checklist items
- Loading/empty states

## Deferred Ideas

None — discussion stayed within phase scope
