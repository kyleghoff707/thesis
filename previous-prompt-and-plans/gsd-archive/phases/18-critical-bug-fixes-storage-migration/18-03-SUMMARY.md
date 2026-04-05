---
phase: 18-critical-bug-fixes-storage-migration
plan: 03
subsystem: pipeline
tags: [normalization, json-schema, pipeline, migration-script]

# Dependency graph
requires:
  - phase: none
    provides: existing pipeline output in .thes1s/reports/
provides:
  - CANONICAL_SECTION_FIELDS (19 fields) enforced on all pipeline output
  - pitch-deck.json written alongside pipeline-output.json for PD stage
  - Retroactive normalization script for existing reports
affects: [19-report-stage-ui, pitch-deck-display, one-pager-display, full-story-display]

# Tech tracking
tech-stack:
  added: []
  patterns: [canonical section schema normalization at pipeline output boundary]

key-files:
  created:
    - scripts/normalize-reports.js
  modified:
    - scripts/run-pipeline.js

key-decisions:
  - "Canonical key detection uses radar/simple_and_predictable specifically (not all PD keys) to distinguish canonical vs stale formats"
  - "SFM legacy one-pager wrapped with _legacyFormat flag and empty sections array rather than attempting to reconstruct sections"
  - "normalizeSections strips unexpected fields (e.g., POOL's generatedAt) ensuring exact 19-field set"

patterns-established:
  - "CANONICAL_SECTION_FIELDS: single source of truth for section shape, duplicated in run-pipeline.js and normalize-reports.js"
  - "Stale data guard: pipeline-output.json only promoted to pitch-deck.json when distinctive canonical keys present"

requirements-completed: [FIX-04]

# Metrics
duration: 4min
completed: 2026-04-02
---

# Phase 18 Plan 03: Schema Normalization Summary

**Canonical 19-field section schema enforced across all pipeline output with retroactive migration script for existing reports (SFM legacy format, POOL extra fields, missing pitch-deck.json)**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-02T06:47:45Z
- **Completed:** 2026-04-02T06:51:43Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Pipeline now normalizes all section objects to exactly 19 canonical fields before writing, stripping unexpected fields and filling defaults
- Pipeline writes pitch-deck.json alongside pipeline-output.json for PD stage in both single-stage and multi-stage modes
- Retroactive normalization script handles all 4 existing tickers: SFM legacy one-pager wrapped, POOL generatedAt stripped, MNST sections normalized, SFM stale PD keys detected and skipped

## Task Commits

Each task was committed atomically:

1. **Task 1: Add normalization pass to pipeline and write canonical output filenames** - `8577004` (feat)
2. **Task 2: Create retroactive normalization script for existing pipeline output** - `67d3443` (feat)

## Files Created/Modified
- `scripts/run-pipeline.js` - Added CANONICAL_SECTION_FIELDS, normalizeSection/normalizeSections functions, pitch-deck.json writing for PD stage
- `scripts/normalize-reports.js` - Standalone ESM normalization script for existing .thes1s/reports/ output

## Decisions Made
- Used specific canonical key detection (radar/simple_and_predictable) rather than checking all PD keys, because SFM's stale format shares 6 key names with canonical format (market_position, barriers_and_moats, etc.) -- checking for radar/simple_and_predictable is the reliable discriminator
- SFM legacy one-pager wrapped with _legacyFormat=true flag and empty sections array rather than attempting section reconstruction -- components can detect and handle gracefully
- CANONICAL_SECTION_FIELDS duplicated between run-pipeline.js and normalize-reports.js since normalize-reports.js is a standalone script

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed hasCanonicalPDKeys to check radar/simple_and_predictable specifically**
- **Found during:** Task 2 (normalization script verification)
- **Issue:** Initial implementation checked if ANY section key was in the full CANONICAL_PD_KEYS array, but SFM's stale data shares 6 keys (market_position, barriers_and_moats, balance_sheet, pest_risks, valuation_summary, overall_verdict) with canonical format
- **Fix:** Changed hasCanonicalPDKeys to check specifically for 'radar' or 'simple_and_predictable' as the plan specified
- **Files modified:** scripts/normalize-reports.js
- **Verification:** Re-ran script; SFM correctly SKIPPED, MNST correctly promoted
- **Committed in:** 67d3443 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix)
**Impact on plan:** Essential for correctness -- without this fix, SFM's stale non-canonical data would be blindly promoted to pitch-deck.json

## Issues Encountered
None

## Known Stubs
None -- all functionality is fully wired.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All cross-ticker schema differences eliminated
- Pipeline writes consistent output going forward
- Components can rely on exactly 19 fields per section object
- SFM needs pipeline re-run for canonical PD data (stale keys detected and documented)

---
*Phase: 18-critical-bug-fixes-storage-migration*
*Completed: 2026-04-02*
