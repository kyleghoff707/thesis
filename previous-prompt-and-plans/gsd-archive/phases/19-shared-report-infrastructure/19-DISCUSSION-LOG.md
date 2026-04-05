# Phase 19: Shared Report Infrastructure - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-02
**Phase:** 19-shared-report-infrastructure
**Areas discussed:** Markdown renderer strategy, Stage nav bar design, Scroll spy behavior, Shared utility scope

---

## Markdown Renderer Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| react-markdown (Recommended) | Full CommonMark library, ~50KB gzipped, handles everything, customizable via component overrides, citation tooltips preserved | ✓ |
| Extend custom parser | Keep hand-rolled parseMarkdown(), add numbered lists/blockquotes/links manually. Smaller bundle but ongoing maintenance | |
| Lightweight library (marked) | 12KB, parse to HTML via dangerouslySetInnerHTML. Smallest but breaks citation tooltip React integration | |

**User's choice:** react-markdown (Recommended)
**Notes:** User asked for plain English explanation before deciding. Key reasoning: pipeline generates real markdown, extending custom parser would be "playing whack-a-mole forever" with missing syntax.

---

## Stage Nav Bar Design

| Option | Description | Selected |
|--------|-------------|----------|
| Tab bar above report (Recommended) | Horizontal tabs below company header, always visible, lock icons for gated stages | ✓ |
| Breadcrumb trail | Pipeline as breadcrumb (OP > PD > FS), compact but feels like navigation history | |
| Sidebar pills | Vertical pill buttons (OP/PD/FS) in left margin, may conflict with section nav sidebar | |

**User's choice:** Tab bar above report (Recommended)

### Follow-up: Locked Stage Appearance

| Option | Description | Selected |
|--------|-------------|----------|
| Dimmed + lock icon (Recommended) | Grayed out text with lock icon, tooltip explaining gate, not clickable | ✓ |
| Dimmed, still clickable | Grayed but clickable, takes to placeholder explaining gate | |
| Hidden entirely | Only show tabs for generated stages | |

**User's choice:** Dimmed + lock icon (Recommended)

---

## Scroll Spy Behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Sticky sidebar (Recommended) | Section list on left, sticks while scrolling, teal accent bar on active section, click to scroll | ✓ |
| Top horizontal dots | Compact dot indicators along top, less info-dense | |
| You decide | Claude picks based on existing patterns | |

**User's choice:** Sticky sidebar (Recommended)

---

## Shared Utility Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Single reportHelpers.js (Recommended) | One file for all helpers (formatters, verdictDotColor, formatTitle, etc.), Spinner.jsx separate. Two files total | ✓ |
| Multiple small files | formatters.js + reportUtils.js + Spinner.jsx. Three files, more granular | |
| You decide | Claude picks most maintainable structure | |

**User's choice:** Single reportHelpers.js (Recommended)

---

## Claude's Discretion

- react-markdown version and plugin configuration
- IntersectionObserver thresholds and rootMargin tuning
- Whether to keep parseMarkdown() as fallback or remove entirely
- Stage nav bar component name and prop interface
- Section sidebar layout approach (flex vs grid)

## Deferred Ideas

None — discussion stayed within phase scope
