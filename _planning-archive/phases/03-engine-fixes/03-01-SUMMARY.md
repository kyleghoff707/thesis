---
phase: 03-engine-fixes
plan: 01
subsystem: validation
tags: [xbrl, field-mapping, triangulation, alias-resolution, baseline-snapshots]

# Dependency graph
requires:
  - phase: 02-multi-source-triangulation
    provides: triangulation pipeline, fix-recommendations.json, field-mapping.json
provides:
  - Field alias map (17 canonical-to-engine mappings) integrated into triangulation pipeline
  - Pre-fix baseline snapshots for regression tracking (fix-recommendations + morningstar-accuracy)
  - 73% increase in triangulation match count (5672->9815)
affects: [03-02, 03-03, 03-04]

# Tech tracking
tech-stack:
  added: []
  patterns: [canonical-to-engine alias resolution, reverse alias mapping, pre-fix baseline snapshotting]

key-files:
  created:
    - validation/scripts/lib/field-alias-map.mjs
    - src/engines/__tests__/harness/field-alias-map.test.js
    - validation/reports/fix-recommendations-pre-batch-1.json
    - validation/reports/morningstar-accuracy-pre-batch-1.json
  modified:
    - validation/scripts/triangulate.mjs

key-decisions:
  - "Alias map resolves canonical->engine names at lookup time rather than renaming engine fields (50+ UI components depend on engine names)"
  - "Added REVERSE_ALIASES and resolveCanonicalName for bidirectional mapping — engine field names normalized to canonical in field union"
  - "Pre-fix baselines force-added to git despite gitignore for regression tracking across sessions"

patterns-established:
  - "Field alias pattern: canonical source names resolved to engine names via import map, not engine refactoring"
  - "Baseline snapshotting: copy current reports before fix batch, compare after"

requirements-completed: [ENGINE-01, ENGINE-04]

# Metrics
duration: 6min
completed: 2026-03-26
---

# Phase 03 Plan 01: Field Alias Map Summary

**17-entry field alias map eliminating ~2,000 false-positive naming mismatches in triangulation, with pre-fix baselines for regression tracking**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-27T00:04:16Z
- **Completed:** 2026-03-27T00:11:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Created field-alias-map.mjs with 17 canonical-to-engine field name aliases (16 Category A + 1 financial sector)
- Integrated alias resolution into triangulate.mjs: engine lookups via getEngineFieldValue, field union via resolveCanonicalName
- Triangulation LIKELY_BUG count dropped 65% (2177 -> 764), CONSENSUS_DIFF dropped 87% (609 -> 79)
- Match count increased 73% (5672 -> 9815)
- Pre-fix baseline snapshots saved for regression diffing in Plans 02-04

## Task Commits

Each task was committed atomically:

1. **Task 1: Create field alias map and integrate into triangulation pipeline** - `a527da0` (feat)
2. **Task 2: Snapshot pre-fix baselines and verify alias map impact** - `c6b33da` (chore)

## Files Created/Modified
- `validation/scripts/lib/field-alias-map.mjs` - Field alias map with 17 canonical-to-engine mappings, bidirectional resolution
- `validation/scripts/triangulate.mjs` - Integrated alias imports, getEngineFieldValue wrapper, canonical field union normalization
- `src/engines/__tests__/harness/field-alias-map.test.js` - 16 unit tests: alias coverage, passthrough, round-trip consistency
- `validation/reports/fix-recommendations-pre-batch-1.json` - Pre-fix triangulation baseline (2177 likelyBug, 609 consensusDiff, 5672 match)
- `validation/reports/morningstar-accuracy-pre-batch-1.json` - Pre-fix MS comparison baseline (91.2% accuracy)

## Decisions Made
- Alias map resolves at lookup time rather than renaming engine fields (50+ UI components depend on engine names like `equity`, `assets`, `cash`)
- Added bidirectional resolution (REVERSE_ALIASES + resolveCanonicalName) so engine fields are normalized to canonical names in the field union, preventing duplicate field entries
- Force-added baseline snapshots to git despite gitignore — these are critical regression tracking artifacts
- getEngineFieldValue wrapper used only for engine lookups; source lookups remain direct (already canonical)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Git worktree merge required for Phase 2 files**
- **Found during:** Task 1 (reading triangulate.mjs)
- **Issue:** Worktree branch was missing Phase 2 triangulation files (on workspace/normalization-engine branch)
- **Fix:** Merged workspace/normalization-engine into worktree branch, resolved planning file conflicts
- **Files modified:** .planning/REQUIREMENTS.md, .planning/ROADMAP.md, .planning/STATE.md
- **Verification:** triangulate.mjs and all validation scripts accessible after merge
- **Committed in:** 5b5603a (merge commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Merge was necessary to access Phase 2 validation infrastructure. No scope creep.

## Triangulation Impact (Post-Alias vs Pre-Alias)

| Metric | Pre-Alias | Post-Alias | Change |
|--------|-----------|------------|--------|
| match | 5,672 | 9,815 | +4,143 (+73%) |
| likelyBug | 2,177 | 764 | -1,413 (-65%) |
| consensusDiff | 609 | 79 | -530 (-87%) |
| methodologyDiff | 12,465 | 10,265 | -2,200 (-18%) |
| coverageGap | 24,388 | 19,215 | -5,173 (-21%) |

## Issues Encountered
- AAPL MS comparison shows 94.3% accuracy (no regression from alias changes)
- Some Category A fields still show residual failures (e.g., stockholders_equity at P15 with 23 failures) — these are real value discrepancies, not naming issues, addressed in Plans 02-04

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Alias map provides correct field resolution foundation for Plans 02-04
- Pre-fix baselines enable before/after comparison for each subsequent fix batch
- Top remaining failures are real tag/derivation issues: cost_of_revenue (P1), gross_profit (P2), short_term_debt (P3)

## Self-Check: PASSED

All files found, all commits verified.

---
*Phase: 03-engine-fixes*
*Completed: 2026-03-26*
