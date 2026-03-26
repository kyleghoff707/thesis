---
phase: 01-comparison-harness
plan: 02
subsystem: validation
tags: [xbrl, morningstar, accuracy-harness, reporter, orchestrator, nodejs, esm]

# Dependency graph
requires:
  - phase: 01-comparison-harness plan 01
    provides: "fiscal-aligner.mjs, field-mapper.mjs, comparator.mjs — the three library modules this plan wires together"
provides:
  - "reporter.mjs: generateConsoleReport + generateJsonReport for human-readable and machine-readable output"
  - "compare-morningstar.mjs: single-command pipeline running all 50 Morningstar fixture companies"
  - "validation/reports/morningstar-accuracy.json: baseline accuracy snapshot at 91.2% (13507/14818 matches)"
affects: [02-triangulation-engine, 03-engine-fixes, phase-regression-testing]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SEC fetch interceptor with disk cache in edgar-cache/ — rate-limited 100ms between requests, cache reuse across runs"
    - "localStorage polyfill pattern (globalThis.localStorage._data) for Node.js engine execution"
    - "Auto-bundle check with child_process.execSync before running harness"
    - "Per-ticker progress printed to stderr, final report to stdout — clean pipe-friendly output"

key-files:
  created:
    - "validation/scripts/lib/reporter.mjs"
    - "validation/scripts/compare-morningstar.mjs"
    - "validation/reports/morningstar-accuracy.json"
  modified: []

key-decisions:
  - "Harness accuracy 91.2% is the established baseline — the 8.8% gap is what Phases 2-3 will close"
  - "JSON report structure designed for Phase 2 extension: companies array + topFailurePatterns enable regression diffing"
  - "Accuracy denominator is match+close+diff (not including missing) — consistent with existing Vitest suite"
  - "Per-company topFailures captures top 3 DIFF fields with failCount and avgPct for triage guidance"

patterns-established:
  - "generateConsoleReport returns string (no side effects) — caller prints. Enables both stdout and file capture."
  - "generateJsonReport returns object — caller serializes. Enables testing without file I/O."
  - "SEC fetch interceptor modifies globalThis.fetch once at startup — all engine fetches go through it automatically"

requirements-completed: [HARNESS-05]

# Metrics
duration: 21min
completed: 2026-03-25
---

# Phase 01 Plan 02: Comparison Harness Orchestrator Summary

**reporter.mjs + compare-morningstar.mjs wiring all 50 Morningstar fixtures through the XBRL engine producing 91.2% baseline accuracy (13507/14818 matches, 1232 DIFF, 3539 missing)**

## Performance

- **Duration:** ~21 min (Tasks 1-2 during prior session, Task 3 checkpoint approved by user)
- **Started:** 2026-03-25T23:49:00Z (estimated from commit timestamps)
- **Completed:** 2026-03-26T00:10:02Z
- **Tasks:** 3 (2 auto + 1 checkpoint:human-verify)
- **Files created:** 3

## Accomplishments
- reporter.mjs generates scannable console summary (overall %, per-company with top 3 failure fields, top 15 failure patterns) and structured JSON for Phase 2 regression diffing
- compare-morningstar.mjs orchestrates the full 50-company pipeline: polyfills, SEC fetch interceptor with disk cache, auto-bundle check, per-ticker progress to stderr, report to stdout + JSON file
- Baseline accuracy of 91.2% established and user-approved — 13507/14818 matches, 79 close, 1232 DIFF, 3539 missing across all 50 companies

## Task Commits

Each task was committed atomically:

1. **Task 1: Create reporter.mjs for console + JSON output** - `6b65097` (feat)
2. **Task 2: Create compare-morningstar.mjs orchestrator script** - `40c67f9` (feat)
3. **Task 3: Verify harness accuracy (checkpoint)** - N/A (user-approved checkpoint, no code change)

## Files Created/Modified
- `validation/scripts/lib/reporter.mjs` (261 lines) - generateConsoleReport + generateJsonReport, per-company top failures, top 15 patterns
- `validation/scripts/compare-morningstar.mjs` (292 lines) - full pipeline: polyfills, SEC cache, preflight, fixture load, comparison loop, report generation
- `validation/reports/morningstar-accuracy.json` - baseline snapshot: 91.2% overall, 50 companies, per-company + topFailurePatterns

## Decisions Made
- **91.2% is the correct baseline.** The harness measures what the XBRL engine actually produces against the Morningstar truth set. The 8.8% gap is attributable to XBRL normalization imprecision, not harness methodology error. User confirmed.
- **Missing fields excluded from accuracy denominator.** Accuracy = match / (match+close+diff). Fields the engine returns null for (missing) are tracked separately — they represent coverage gaps, not normalization errors. Consistent with existing Vitest suite.
- **JSON structure designed for Phase 2.** The `companies[].results` array contains full per-field detail. The `topFailurePatterns` array sorts by totalFailures across companies. Both enable regression diffing when Phase 3 engine fixes are applied.

## Deviations from Plan

None — plan executed exactly as written. The 91.2% accuracy matched the checkpoint acceptance criteria (user approval received).

## Issues Encountered
None — both tasks completed without blocking issues.

## Known Stubs
None — the harness is fully functional. The JSON report at `validation/reports/morningstar-accuracy.json` contains real engine output, not placeholder data.

## User Setup Required
None — harness runs standalone with `node validation/scripts/compare-morningstar.mjs`. Auto-builds bundle if missing.

## Next Phase Readiness
- Baseline JSON at `validation/reports/morningstar-accuracy.json` is ready for Phase 2 regression diffing
- `topFailurePatterns` reveals top failure candidates for Phase 3 engine fixes
- The `--ticker AAPL` flag enables single-company debugging during Phase 3 fix iteration
- Phase 2 (triangulation engine) can extend compare-morningstar.mjs by injecting additional source data into the comparison pipeline

---
*Phase: 01-comparison-harness*
*Completed: 2026-03-25*
