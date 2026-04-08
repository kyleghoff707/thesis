---
phase: 02-multi-source-triangulation
plan: 03
subsystem: validation
tags: [triangulation, consensus, xbrl, edgar, fmp, simfin, mstarpy]

requires:
  - phase: 02-01
    provides: "FMP, SimFin, mstarpy data collectors with canonical field normalization"
  - phase: 02-02
    provides: "Consensus engine (classifyField) and root cause tagger (tagRootCause)"
provides:
  - "triangulate.mjs orchestrator — full 50-company pipeline"
  - "triangulation-reporter.mjs — console + JSON report generation + regression diffing"
  - "fix-recommendations.json — prioritized CONSENSUS_DIFF entries for Phase 3"
  - "triangulation-report.json — full per-company classification detail"
affects: [03-engine-fixes, 04-scale-validation]

tech-stack:
  added: []
  patterns:
    - "Pipeline orchestrator pattern: env loading → polyfills → SEC interceptor → auto-bundle → ticker loop → report generation"

key-files:
  created:
    - "validation/scripts/triangulate.mjs"
    - "validation/scripts/lib/triangulation-reporter.mjs"
    - "src/engines/__tests__/harness/triangulation-reporter.test.js"
    - "validation/reports/fix-recommendations.json"
    - "validation/reports/triangulation-report.json"
  modified: []

key-decisions:
  - "STMT_KEY_NORMALIZE map must be defined before use in collectAllFields — variable ordering bug caught and fixed"
  - "Engine fields included in field union so UNIQUE_COVERAGE classification is reachable"

patterns-established:
  - "Triangulation pipeline: XBRL engine + 3 external sources → per-field classification → root cause tagging → prioritized fix list"

requirements-completed: [TRI-06]

duration: ~30min
completed: 2026-03-25
---

# Plan 02-03: Triangulation Orchestrator Summary

**Full 50-company triangulation pipeline wiring collectors, consensus engine, and root cause tagger — produces prioritized fix-recommendations.json (609 CONSENSUS_DIFF + 2,177 LIKELY_BUG = 2,786 actionable items) with regression diff against 91.2% Morningstar baseline**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-03-25T18:45:00Z
- **Completed:** 2026-03-25T19:30:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Triangulation orchestrator runs end-to-end for all 50 truth set companies
- Fix-recommendations.json identifies top fields to fix: stockholders_equity (46co/218yr), total_liabilities (46co/215yr), total_assets (46co/214yr), income_tax_expense (44co/208yr), cash_and_equivalents (42co/204yr)
- Root cause analysis: most high-priority items are `tag_miss` — fields our engine doesn't extract but all 3 sources agree on
- Console report shows per-company classification breakdown
- Regression diff references 91.2% Morningstar baseline
- 14 reporter unit tests passing

## Task Commits

1. **Task 1: Create triangulation reporter and orchestrator** - `176282e` (test), `3518408` (feat)
2. **Task 1 bugfix: STMT_KEY_NORMALIZE ordering** - `10e61f8` (fix)
3. **Task 2: Run full pipeline** - Pipeline executed, results saved to validation/reports/

## Files Created/Modified
- `validation/scripts/triangulate.mjs` — Main orchestrator: env loading, polyfills, SEC interceptor, auto-bundle, parallel source fetching, classification, report generation
- `validation/scripts/lib/triangulation-reporter.mjs` — Three exports: generateTriangulationConsoleReport, generateFixRecommendations, generateRegressionDiff
- `src/engines/__tests__/harness/triangulation-reporter.test.js` — 14 unit tests for reporter
- `validation/reports/fix-recommendations.json` — Prioritized fix list for Phase 3 (gitignored)
- `validation/reports/triangulation-report.json` — Full 42MB triangulation detail (gitignored)

## Key Triangulation Results

| Category | Count | Meaning |
|----------|-------|---------|
| MATCH | 5,672 (5.1%) | Our value matches at least one source |
| CONSENSUS_DIFF | 609 | All sources agree, we don't — high-confidence bugs |
| LIKELY_BUG | 2,177 | Most sources agree, we don't — investigate |
| METHODOLOGY_DIFF | 12,465 | Sources disagree with each other — not our bug |
| COVERAGE_GAP | 24,388 | Sources have it, we don't |
| UNIQUE_COVERAGE | 65,111 | We have it, sources don't |

## Decisions Made
- Fixed STMT_KEY_NORMALIZE variable ordering bug — map was referenced before initialization in collectAllFields
- Engine fields included in field union per D-06 so UNIQUE_COVERAGE classification works correctly

## Deviations from Plan
None — plan executed as written. One bug discovered and fixed during Task 1 execution.

## Issues Encountered
- `STMT_KEY_NORMALIZE` variable used before it was defined in `triangulate.mjs` — caused crash on first run. Fixed by moving the constant definition above `collectAllFields()`.

## Next Phase Readiness
- fix-recommendations.json is the primary input to Phase 3 (Engine Fixes)
- Top priority: 609 CONSENSUS_DIFF items where all 3 sources agree and we disagree
- Secondary: 2,177 LIKELY_BUG items where most sources agree
- The 5.1% match rate is misleading — denominator includes 65K UNIQUE_COVERAGE fields. Actual comparison surface is much smaller.

---
*Phase: 02-multi-source-triangulation*
*Completed: 2026-03-25*
