# Phase 5B: One Pager Display Components — Executive Summary

**Started:** March 24, 2026
**Status:** In progress (Wave 3 visual verification pending)
**Components:** 8 new files, ~1,800 lines of UI code

---

## What This Phase Does

Phase 5B puts the generated One Pager on screen. It builds the components that render the COST report (from Phase 5C) inside the Thes1s desktop app — verdict badges, section cards, inline citations with a 3-type taxonomy, red flag callout boxes, a real-time progress dashboard for watching agents work, and an approval gate for the portfolio manager to approve or reject the report.

---

## What Was Built (Plain English)

### 1. Data Bridge + Badges + Test Scaffolds (Plan 01 — Wave 1, Complete)

**Vite middleware:** A new middleware plugin that serves `.thes1s/reports/` JSON files to the browser at `/api/thes1s/reports/*`. This bridges the gap between the file-based report storage (from the CC skill) and the browser-based UI. Also provides a directory listing endpoint (`/api/thes1s/reports`) so the app knows which tickers have generated reports.

**useOnePager hook:** React hook that fetches a report by ticker from the Vite middleware, with progress polling every 2 seconds during generation. Returns `{ report, progress, loading, error }`. Stops polling when state is COMPLETE.

**VerdictBadge:** Colored pill badge component — PASS (green + checkmark), FAIL (red + x), WATCHLIST (amber + eye), REVIEW (blue + clock). Uses the C palette so it works in both dark and light mode.

**ConfidenceBadge:** Smaller secondary badge for HIGH/MEDIUM/LOW confidence levels.

**Test scaffolds:** 4 test files created as Red tests (failing until the component is built) following the project's TDD convention. Tests cover badge color mapping, section renderer data transformation, progress state formatting, and OnePager helper functions.

**Files created:**
- [vite.config.js](vite.config.js) — Added `thes1sReportsPlugin` middleware (modified, not new)
- [src/hooks/useOnePager.js](src/hooks/useOnePager.js) — Report fetching hook with progress polling
- [src/components/VerdictBadge.jsx](src/components/VerdictBadge.jsx) — Verdict pill badges with `_testExports.getVerdictStyle`
- [src/components/ConfidenceBadge.jsx](src/components/ConfidenceBadge.jsx) — Confidence level indicator
- [src/components/__tests__/verdictBadge.test.js](src/components/__tests__/verdictBadge.test.js) — 8 tests for badge color mapping
- [src/components/__tests__/sectionRenderer.test.js](src/components/__tests__/sectionRenderer.test.js) — Test scaffold for data transformation
- [src/components/__tests__/onePager.test.js](src/components/__tests__/onePager.test.js) — Test scaffold for page helpers
- [src/components/__tests__/generationProgress.test.js](src/components/__tests__/generationProgress.test.js) — Test scaffold for progress state

### 2. Section Renderer + Citations + Red Flags (Plan 02 — Wave 2, Complete)

**SectionRenderer:** The core rendering component that transforms a report section JSON object into a rich visual card. Shows section number, title, verdict badge, confidence badge, summary callout, narrative/verdictRationale prose, data grids (for structured data like valuation tables), and slots for citations, red flags, and cross-cutting findings.

**CitationTooltip:** Inline superscript citation component (`[1]`, `[2]`). Detects citation type automatically:
1. **Thes1s native** (starts with `dataPacket.` or `DataPacket`) — teal accent color
2. **SEC filing** (contains `10-K`, `10-Q`, `8-K`, `proxy`) — blue color
3. **Web search** (contains `http` or URL pattern) — gray color

Hover shows tooltip with source and value. Click jumps to citation list at bottom.

**RedFlagCallout:** Amber-tinted callout box with warning icon, renders the red flags array as a bulleted list. Visually distinct from the narrative — impossible to miss.

**Files created:**
- [src/components/SectionRenderer.jsx](src/components/SectionRenderer.jsx) — 340 lines. Core section rendering with `_testExports` for camelToTitle and formatDataValue
- [src/components/CitationTooltip.jsx](src/components/CitationTooltip.jsx) — 3-type citation detection, tooltip, click-to-jump
- [src/components/RedFlagCallout.jsx](src/components/RedFlagCallout.jsx) — Amber warning callout box

### 3. OnePager Page + ReportsList + Routes (Plan 03 — Wave 3, Visual Verification Pending)

**OnePager.jsx:** The main page component that assembles everything:
- Hero header with formatted company name + overall verdict badge
- Sticky section nav on the left (IntersectionObserver scroll spy)
- All 6 sections rendered via SectionRenderer
- Progress bar + per-section placeholders during generation ("Business Analyst working...")
- Citation reference list at the bottom
- Approval bar with Approve/Reject buttons (persists to `stageApprovals.onePager`)
- Cross-cutting findings displayed with severity dots

**ReportsList.jsx:** Replaces the old Reports tab (per D-01). Fetches generated tickers from `/api/thes1s/reports`, cross-references with localStorage research entries, and links to the One Pager viewer. Auto-creates a research entry if one doesn't exist for a generated ticker.

**Route wiring:** Updated App.jsx to wire OnePager at `/research/:id/one-pager` and ReportsList at `/reports`.

**Files created:**
- [src/components/OnePager.jsx](src/components/OnePager.jsx) — 557 lines. Full report viewer with `_testExports` for helpers
- [src/components/ReportsList.jsx](src/components/ReportsList.jsx) — 181 lines. Reports discovery + navigation
- [src/App.jsx](src/App.jsx) — Route updates (modified, not new)

---

## File Inventory — Quick Reference

### UI Components (New)

| File | Lines | What It Does |
|------|-------|-------------|
| [src/components/OnePager.jsx](src/components/OnePager.jsx) | 557 | Full One Pager page with progress + approval |
| [src/components/SectionRenderer.jsx](src/components/SectionRenderer.jsx) | 340 | Section JSON → rich visual card |
| [src/components/ReportsList.jsx](src/components/ReportsList.jsx) | 181 | Reports discovery + navigation |
| [src/components/VerdictBadge.jsx](src/components/VerdictBadge.jsx) | 91 | PASS/FAIL/WATCHLIST/REVIEW pill badges |
| [src/components/CitationTooltip.jsx](src/components/CitationTooltip.jsx) | ~80 | 3-type inline citations with tooltips |
| [src/components/RedFlagCallout.jsx](src/components/RedFlagCallout.jsx) | ~50 | Amber warning callout boxes |
| [src/components/ConfidenceBadge.jsx](src/components/ConfidenceBadge.jsx) | 33 | HIGH/MEDIUM/LOW confidence indicator |

### Hooks (New)

| File | Lines | What It Does |
|------|-------|-------------|
| [src/hooks/useOnePager.js](src/hooks/useOnePager.js) | 99 | Report fetching + progress polling |

### Infrastructure (Modified)

| File | What Changed |
|------|-------------|
| [vite.config.js](vite.config.js) | Added `thes1sReportsPlugin` middleware for serving report JSON |
| [src/App.jsx](src/App.jsx) | Added OnePager + ReportsList routes, passed createReport prop |

### Tests (New)

| File | Tests | What It Validates |
|------|-------|-------------------|
| [src/components/__tests__/verdictBadge.test.js](src/components/__tests__/verdictBadge.test.js) | 8 | Badge color mapping for all verdict/confidence values |
| [src/components/__tests__/sectionRenderer.test.js](src/components/__tests__/sectionRenderer.test.js) | 13 | camelToTitle, formatDataValue transformations |
| [src/components/__tests__/onePager.test.js](src/components/__tests__/onePager.test.js) | TBD | formatTitle, stateToLabel, computeSectionStatuses |
| [src/components/__tests__/generationProgress.test.js](src/components/__tests__/generationProgress.test.js) | TBD | Progress state formatting |

---

## Design Decisions (from Context)

| Decision | What |
|----------|------|
| D-01 | Replace Reports tab with generated report viewer |
| D-02 | Scrolling page with sticky section anchor nav |
| D-04 | Colored pill badges: green (PASS), red (FAIL), amber (WATCHLIST), blue (REVIEW) |
| D-06 | Red flags as inline warning callout boxes — amber background, can't miss them |
| D-07/08/09 | 3-type citation taxonomy: Thes1s native, SEC filing, web search. Tooltip on hover, jump on click |
| D-11/12/13 | Inline progress — sections fade in as agents complete, progress bar at top |
| D-14 | Approval gate — Approve/Reject bar persists decision to report model |

---

## Current Status

Waves 1 and 2 are complete. Wave 3 code is merged. Visual verification checkpoint is pending — the user is checking the COST One Pager rendering in the browser now. One bug was found and fixed (ReportsList required a research entry to link — now auto-creates one on click).

---

## What's Next

After visual verification passes, Phase 5B completes. Then Phase 5D: Quality System — citation validation, completeness scoring, confidence checks.

---

## Planning Artifacts

| File | What |
|------|------|
| [05B-CONTEXT.md](05B-CONTEXT.md) | Design decisions — layout, badges, citations, progress |
| [05B-RESEARCH.md](05B-RESEARCH.md) | Technical research — existing patterns, COST JSON analysis, pitfalls |
| [05B-01-PLAN.md](05B-01-PLAN.md) | Plan: data bridge + badges + test scaffolds |
| [05B-02-PLAN.md](05B-02-PLAN.md) | Plan: SectionRenderer + CitationTooltip + RedFlagCallout |
| [05B-03-PLAN.md](05B-03-PLAN.md) | Plan: OnePager page + ReportsList + routes |
| [05B-01-SUMMARY.md](05B-01-SUMMARY.md) | Execution summary: data bridge + badges |
| [05B-02-SUMMARY.md](05B-02-SUMMARY.md) | Execution summary: section renderer |
