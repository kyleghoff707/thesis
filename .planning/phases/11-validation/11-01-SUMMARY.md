---
phase: 11-validation
plan: 01
subsystem: testing
tags: [critic, quality, methodology, rule-one, curriculum, vitest]

# Dependency graph
requires:
  - phase: 10-pipeline-integration-prompt-fixes
    provides: Pipeline output with section narratives for methodology analysis
provides:
  - scoreMethodology() function with per-section Rule One curriculum checks
  - METHODOLOGY_CHECKS constant with checks for all 10 Pitch Deck section types
  - Dual-score quality reports (mechanical + methodology)
  - Updated qualityFormatter.js with Methodology Gaps section
  - Updated run-quality-v4.js CLI with methodology output
affects: [11-validation plan 02, quality system, pitch deck validation]

# Tech tracking
tech-stack:
  added: []
  patterns: [methodology-checks per section key, weighted scoring (critical 2x / supplementary 1x), sectionNumber disambiguation for duplicate keys]

key-files:
  created:
    - scripts/run-quality-v4.js
  modified:
    - src/engines/critic.js
    - src/engines/__tests__/critic.test.js
    - src/engines/qualityFormatter.js

key-decisions:
  - "Methodology checks use regex on narrative text -- medium depth, checks for element presence not prose quality"
  - "growth_metrics key disambiguated by sectionNumber: 5 = FCF checks, 7 = ROE/ROIC/Debt checks"
  - "Exempt sections (overall_verdict, synthesis, PSR) return score 100 with empty checks"
  - "Scoring: critical weight 2, supplementary weight 1; score = passed/total * 100; passed threshold >= 50"

patterns-established:
  - "METHODOLOGY_CHECKS constant pattern: keyed by section key, array of { id, label, critical, test(section) } objects"
  - "scoreMethodology returns { score, checks, passed } -- parallel to mechanical scoring"
  - "Dynamic check resolution for duplicate section keys via _growth_metrics_5 / _growth_metrics_7 sentinel pattern"

requirements-completed: [VAL-01]

# Metrics
duration: 8min
completed: 2026-03-29
---

# Phase 11 Plan 01: Methodology Scoring Summary

**Rule One curriculum methodology scoring added to critic.js -- per-section checks for all 10 Pitch Deck types with dual mechanical/methodology quality reporting**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-29T20:23:21Z
- **Completed:** 2026-03-29T20:31:34Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Added scoreMethodology() with 37 curriculum-derived checks across 10 section types (company_info, minimum_standards, market_position, barriers_and_moats, growth_metrics x2, management, balance_sheet, pest_risks, valuation_summary)
- Extended quality formatter with Methodology column in table, Methodology Gaps detail section, and dual Scoring Methodology description
- Extended CLI script with dual-score console output and methodology gap summary
- SFM validation: 87 mechanical / 93 methodology across 11 analysis sections

## Task Commits

Each task was committed atomically:

1. **Task 1: Add scoreMethodology() to critic.js (TDD)** - `c3591ad` (test: failing tests), `e41b249` (feat: implementation + passing tests)
2. **Task 2: Extend qualityFormatter.js and run-quality-v4.js** - `5396a18` (feat: dual methodology scores)

## Files Created/Modified
- `src/engines/critic.js` -- Added METHODOLOGY_CHECKS constant (37 checks across 10 sections), scoreMethodology() function, runMethodologyChecks() helper, integration into validateSection and validateStage
- `src/engines/__tests__/critic.test.js` -- 27 new methodology scoring tests (80 total, all passing)
- `src/engines/qualityFormatter.js` -- Methodology column in table, overall methodology in header, Methodology Gaps section, updated Scoring Methodology description
- `scripts/run-quality-v4.js` -- New file (previously untracked in main repo). Dual-score CLI output with methodology gap summary

## Decisions Made
- Methodology checks use regex pattern matching on narrative text -- checks for element presence (medium depth per D-02), not subjective prose quality
- growth_metrics key disambiguated by sectionNumber (5 = FCF, 7 = ROE/ROIC/Debt); when sectionNumber unavailable, both check sets are tried and higher score wins
- Exempt sections (overall_verdict, synthesis, psr_annual, psr_quarterly) return score 100 with empty checks -- they have no methodology to verify
- Critical checks weighted 2x, supplementary 1x; passed threshold is score >= 50 (at least half of critical elements present)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] scripts/run-quality-v4.js not in worktree**
- **Found during:** Task 2
- **Issue:** The script existed as an untracked file in the main repo but was absent from the worktree. The plan expected it to be modified.
- **Fix:** Created the script fresh in the worktree with the full dual-score implementation
- **Files modified:** scripts/run-quality-v4.js
- **Verification:** Script runs successfully against SFM data via symlink to main repo .thes1s
- **Committed in:** 5396a18

---

**Total deviations:** 1 auto-fixed (blocking)
**Impact on plan:** Required creating script from scratch instead of modifying. No scope creep.

## Issues Encountered
- SFM mechanical score is 87 (not 94 as acceptance criteria expected). This is a pre-existing data condition -- the management section scores 0/100 mechanical due to bad DataPacket citation paths. The score difference is NOT caused by methodology code changes (which are purely additive). All 53 original tests pass with zero regressions.

## Known Stubs
None. All methodology checks are fully implemented with real regex patterns.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Methodology scoring is ready for Plan 02 (second ticker validation)
- Plan 02 can run end-to-end pipeline on a new ticker and get both mechanical and methodology scores
- The methodology checks provide actionable feedback on which sections need curriculum improvement

## Self-Check: PASSED

- All 4 source files exist
- All 3 task commits verified (c3591ad, e41b249, 5396a18)
- SUMMARY.md exists at expected path

---
*Phase: 11-validation*
*Completed: 2026-03-29*
