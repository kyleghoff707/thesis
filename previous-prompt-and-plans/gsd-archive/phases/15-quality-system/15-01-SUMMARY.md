---
phase: 15-quality-system
plan: 01
subsystem: quality
tags: [critic, methodology-checks, quality-scoring, full-story, checklist, debate]

# Dependency graph
requires:
  - phase: 11-validation
    provides: "Pitch Deck methodology scoring in critic.js, METHODOLOGY_CHECKS pattern, runMethodologyChecks generic scorer"
  - phase: 14-adversarial-debate
    provides: "Full Story sections with adversarial debate output (SFM S6 inversion_rebuttal)"
provides:
  - "33 Full Story methodology checks across 6 section keys in critic.js"
  - "Checklist data parser with polymorphic field fallback (parseChecklistData)"
  - "Non-standard verdict normalization (normalizeVerdict: CONTEXT/WATCHLIST -> PARTIAL)"
  - "Debate data parser (parseDebateData)"
  - "Section-type-aware completeness weights for checklist sections"
  - "Full Story section labels in qualityFormatter.js"
  - "Full Story CLI support in run-quality-v4.js (--stage fullStory)"
affects: [16-api-migration, 17-end-to-end-validation]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Section-type-aware completeness weights (checklist sections: 15% narrative, 25% data)", "Polymorphic data parsing with defensive fallback chains"]

key-files:
  created: []
  modified: ["src/engines/critic.js", "src/engines/qualityFormatter.js", "scripts/run-quality-v4.js"]

key-decisions:
  - "Checklist completeness weights swap only narrativeDepth and dataPopulation (25<->15), keeping total at 100"
  - "Non-standard verdicts (CONTEXT, WATCHLIST) mapped to PARTIAL for scoring purposes"
  - "run-quality-v4.js auto-detects stage from available section files when --stage not specified"

patterns-established:
  - "parseChecklistData: polymorphic extraction from section.data with item.question||item.item and item.id||item.number fallbacks"
  - "normalizeVerdict: centralized verdict mapping for all checklist checks"
  - "Section key registration: adding keys to METHODOLOGY_CHECKS auto-enables methodology scoring with zero pipeline changes"

requirements-completed: [QUAL-01, QUAL-03]

# Metrics
duration: 6min
completed: 2026-03-30
---

# Phase 15 Plan 01: Full Story Quality Scoring Summary

**33 methodology checks across 6 Full Story section types with polymorphic checklist parsing, verdict normalization, and dual-score CLI support**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-30T05:08:50Z
- **Completed:** 2026-03-30T05:14:50Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Added 33 methodology checks to critic.js covering all 6 Full Story section types (5+5+6+6+5+6) with 19 critical and 14 supplementary checks
- Built 4 helper functions for checklist/debate parsing with polymorphic field fallbacks that handle real agent output variations
- Extended run-quality-v4.js with --stage fullStory support, producing SFM quality report: 62 mechanical / 87 methodology
- Fixed 2 pre-existing bugs in critic.js triggered by Full Story data (numeric citation refs, object red flags)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add helpers, completeness weights, and 33 methodology checks** - `cc5b2bc` (feat)
2. **Task 2: Update qualityFormatter.js labels and run-quality-v4.js Full Story support** - `d98a94a` (feat)

## Files Created/Modified
- `src/engines/critic.js` - Added 4 helpers (normalizeVerdict, parseChecklistData, parseDebateData, flagNonStandardVerdicts), 33 methodology checks across 6 section keys, section-type-aware completeness weights, fixed classifyCitation for numeric refs, fixed validateRedFlags for object format
- `src/engines/qualityFormatter.js` - Added 6 Full Story section labels with item counts, fullStory stage title, updated scoring methodology description
- `scripts/run-quality-v4.js` - Rewritten to support --stage flag, auto-detect stage, read fullStory-S*.json section files, and output stage-specific quality files

## Decisions Made
- Completeness weight adjustment swaps only narrativeDepth (25->15) and dataPopulation (15->25) for checklist sections, keeping requiredFields at 40 and citationDensity at 20 (total stays 100)
- run-quality-v4.js auto-detects Full Story stage by checking for fullStory-S*.json section files before falling back to pitchDeck
- Quality output files use stage-specific prefix (full-story-v4.quality.json vs pitch-deck-v4.quality.json)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] classifyCitation crashes on numeric ref fields**
- **Found during:** Task 2 (running quality scorer on real SFM data)
- **Issue:** S3 moat_checklist has citation.ref as integer (e.g., `"ref": 2`), but classifyCitation calls `.toLowerCase()` which fails on numbers
- **Fix:** Wrapped both `citation.source` and `citation.ref` with `String()` before calling `.toLowerCase()`
- **Files modified:** src/engines/critic.js
- **Verification:** Quality scorer runs without error on all 6 SFM Full Story sections
- **Committed in:** d98a94a (Task 2 commit)

**2. [Rule 1 - Bug] validateRedFlags crashes on object red flag format**
- **Found during:** Task 2 (running quality scorer on real SFM data)
- **Issue:** S4 management_checklist has redFlags as objects `{severity, flag, detail, resolution}` not plain strings. `flag.trim()` and `flag.length` fail on objects.
- **Fix:** Added type check to extract string from either raw string or object.flag before length/pattern checks
- **Files modified:** src/engines/critic.js
- **Verification:** Quality scorer runs without error, 83 existing tests still pass
- **Committed in:** d98a94a (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 Rule 1 bugs)
**Impact on plan:** Both bugs were pre-existing in critic.js, triggered by Full Story data polymorphism (numeric refs, object red flags). Fixes are minimal and defensive. No scope creep.

## Issues Encountered
None beyond the two auto-fixed bugs above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Full Story quality scoring is operational: `node --loader ./scripts/node-esm-loader.js scripts/run-quality-v4.js SFM --stage fullStory` produces dual-score report
- SFM baseline scores: 62 mechanical / 87 methodology (6 sections)
- Event analysis methodology score (29) identifies real gap: section lacks root cause and historical precedent analysis
- Ready for Phase 16 (API migration) and Phase 17 (end-to-end validation)

## Self-Check: PASSED

- All 3 modified files exist
- Both task commits (cc5b2bc, d98a94a) found in git log
- SUMMARY.md created

---
*Phase: 15-quality-system*
*Completed: 2026-03-30*
