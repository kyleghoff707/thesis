# Phase 18: Critical Bug Fixes & Storage Migration - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-01
**Phase:** 18-critical-bug-fixes-storage-migration
**Areas discussed:** Storage migration, Section key strategy, Schema normalization, Report loading UX

---

## Storage Migration

| Option | Description | Selected |
|--------|-------------|----------|
| Single 'reports' store | One store keyed by report ID. Simple, matches current model. | ✓ |
| Per-stage stores | Separate stores per stage type. More granular but complex. | |
| You decide | Claude picks best approach. | |

**User's choice:** Single 'reports' store
**Notes:** User asked for plain English explanation of IndexedDB vs localStorage. Explained: localStorage = 5-10MB notepad, IndexedDB = filing cabinet (hundreds of MB). When cloud backend comes later, IndexedDB becomes local cache with sync layer. No need to build cloud now.

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-migrate on startup | Copy existing reports to IndexedDB, remove from localStorage. | ✓ |
| Keep both, prefer IndexedDB | Read from IndexedDB first, fall back to localStorage. | |
| You decide | Claude picks safest approach. | |

**User's choice:** Auto-migrate on startup
**Notes:** User initially asked "During migration to where?" — clarified this is local-to-local migration, not cloud. One-time seamless operation on first app launch after update.

---

## Section Key Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Fix component to match pipeline | Update PitchDeck.jsx keys to match pipeline output. Pipeline is source of truth. | ✓ |
| Add normalization layer | Build mapping function to translate pipeline keys to component keys. | |
| You decide | Claude picks cleanest approach. | |

**User's choice:** Fix component to match pipeline

| Option | Description | Selected |
|--------|-------------|----------|
| Show as hero summary | Render overall_verdict at top as hero badge + summary. Not a numbered section. | ✓ |
| Show as Section 11 | Add as last section in the list. | |
| You decide | Claude picks best presentation. | |

**User's choice:** Show as hero summary
**Notes:** No additional clarification needed.

---

## Schema Normalization

| Option | Description | Selected |
|--------|-------------|----------|
| Pipeline-side | Add normalization pass in run-pipeline.js. Fix at the source. | ✓ |
| Frontend-side | Components handle missing/different fields defensively. | |
| Both layers | Pipeline normalizes, components still have fallbacks. | |
| You decide | Claude picks where normalization lives. | |

**User's choice:** Pipeline-side
**Notes:** No additional clarification needed.

---

## Report Loading UX

| Option | Description | Selected |
|--------|-------------|----------|
| Skeleton screen | Gray placeholder blocks that fill in. Matches Toolbox pattern. | ✓ |
| Spinner | Centered spinner until load. | |
| You decide | Claude picks matching pattern. | |

**User's choice:** Skeleton screen

| Option | Description | Selected |
|--------|-------------|----------|
| Friendly empty state | Message with action: "No report found. Generate one." | ✓ |
| Redirect to reports list | Silently bounce back. | |
| You decide | Claude picks error handling. | |

**User's choice:** Friendly empty state
**Notes:** No additional clarification needed.

---

## Claude's Discretion

- IndexedDB store index design
- Exact skeleton screen component structure
- Migration error handling
- Normalization pass order of operations
- progressState.js key alignment scope

## Deferred Ideas

None — discussion stayed within phase scope
