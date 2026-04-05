# Phase 22: Stage Gating & Navigation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-03
**Phase:** 22-stage-gating-navigation
**Areas discussed:** Reports List Multi-Stage Display, Route/Tab Highlighting Fix, Stage Progress Overview

---

## Reports List Multi-Stage Display

### Q1: How should multi-stage info be displayed per ticker?

| Option | Description | Selected |
|--------|-------------|----------|
| Inline stage pills | 3 pills (OP/PD/FS) per row, color-coded by status, clickable. | ✓ |
| Expanded stage rows | Taller card with 3 sub-rows per stage. | |
| You decide | Claude picks. | |

**User's choice:** Inline stage pills (Recommended)
**Notes:** None

### Q2: How should locked/gated stages appear?

| Option | Description | Selected |
|--------|-------------|----------|
| Disabled pill with lock | All 3 pills visible, locked ones grayed with lock icon. Tooltip on click. | ✓ |
| Only show available stages | Hide stages user can't access. | |
| You decide | Claude picks. | |

**User's choice:** Disabled pill with lock (Recommended)
**Notes:** None

---

## Route/Tab Highlighting Fix

### Q3: How should route highlighting be fixed?

| Option | Description | Selected |
|--------|-------------|----------|
| Custom isActive logic | Keep routes under /research/:id/*, override NavLink isActive for both tabs. | ✓ |
| Move routes under /reports | Restructure routes to /reports/:id/one-pager etc. | |
| You decide | Claude picks. | |

**User's choice:** Custom isActive logic (Recommended)
**Notes:** None

---

## Stage Progress Overview

### Q4: Where should the stage progress overview live?

| Option | Description | Selected |
|--------|-------------|----------|
| Reports list pills sufficient | Inline pills in Reports list + StageNavBar inside reports. No third location. | ✓ |
| Add progress bar to Toolbox | Small 3-step indicator in Toolbox header. | |
| Both locations | Reports list + Toolbox header. | |

**User's choice:** Reports list pills are sufficient (Recommended)
**Notes:** None

---

## Additional: Multi-Report Per Ticker

### Q5: How should multiple reports for the same ticker be handled?

| Option | Description | Selected |
|--------|-------------|----------|
| Latest report per ticker | One row per ticker, latest pipeline output. | |
| Show all report entries | Show multiple rows if multiple localStorage entries exist. | |
| Defer entirely | Don't address in Phase 22. Note for future milestone. | ✓ |

**User's choice:** Defer entirely
**Notes:** User asked about re-running a ticker years later. Multi-report/versioned reports deferred to future milestone.

---

## Claude's Discretion

- Pill styling details (size, radius, font)
- API enhancement for per-stage availability detection
- StageNavBar consistency adjustments
- Deep-linking query params

## Deferred Ideas

- Multi-report per ticker (versioned reports with history)
- INFRA-02 (scroll spy) still pending from Phase 19
