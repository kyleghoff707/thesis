---
phase: 02-multi-source-triangulation
plan: 01
subsystem: validation
tags: [fmp, simfin, mstarpy, data-collection, normalization, disk-cache, field-mapping]

# Dependency graph
requires:
  - phase: 01-comparison-harness
    provides: field-mapping.json with canonical field names, comparator library, test infrastructure
provides:
  - FMP collector (fetchFmpData) normalizing Stable API to canonical format
  - SimFin collector (fetchSimfinData) with GENERAL/BANKS/INSURANCE template detection
  - mstarpy collector (readMstarpyData) reading pre-fetched JSON with 1e6 scale handling
  - Shared disk-cache utility (readCache/writeCache/isExpired) with 7-day TTL
  - Extended field-mapping.json with _sources section (61 FMP + 42 SimFin GENERAL + 19 BANKS + 17 INSURANCE + 37 mstarpy mappings)
  - Python pre-fetch script for 50 truth set companies
affects: [02-02 consensus engine, 02-03 triangulation orchestrator]

# Tech tracking
tech-stack:
  added: []
  patterns: [per-source field mapping in _sources, disk-cache with TTL, template-aware SimFin parsing]

key-files:
  created:
    - validation/scripts/lib/disk-cache.mjs
    - validation/scripts/lib/fmp-collector.mjs
    - validation/scripts/lib/simfin-collector.mjs
    - validation/scripts/lib/mstarpy-collector.mjs
    - validation/scripts/fetch-mstarpy.py
    - src/engines/__tests__/harness/disk-cache.test.js
    - src/engines/__tests__/harness/fmp-collector.test.js
    - src/engines/__tests__/harness/simfin-collector.test.js
    - src/engines/__tests__/harness/mstarpy-collector.test.js
  modified:
    - src/engines/__tests__/fixtures/morningstar/field-mapping.json

key-decisions:
  - "FMP capex sign: -1 (FMP returns negative, canonical is positive per XBRL convention) — corrected plan analysis that suggested sign: 1"
  - "Per-source field mapping stored in _sources section (not inline per-entry) for cleanliness — per RESEARCH.md recommendation"
  - "mstarpy uses statement key matching (income/balance/cashFlow) to apply correct field subset per statement"
  - "SimFin BANKS and INSURANCE templates share BS/CF field names with GENERAL for common fields"

patterns-established:
  - "Collector pattern: each collector returns { income: {year: {field: value}}, balance: {...}, cashFlow: {...} } or null"
  - "Disk cache pattern: readCache/writeCache/isExpired with 7-day default TTL, JSON files with _cachedAt timestamp"
  - "Template-aware parsing: SimFin response[0].template determines which field mapping sub-object to use"

requirements-completed: [TRI-01, TRI-02, TRI-03]

# Metrics
duration: 11min
completed: 2026-03-26
---

# Phase 02 Plan 01: Data Collectors Summary

**Three data collectors (FMP, SimFin, mstarpy) normalizing financial data to canonical format with shared disk cache, template-aware SimFin parsing, and 176 per-source field mappings**

## Performance

- **Duration:** 11 min
- **Started:** 2026-03-26T01:33:25Z
- **Completed:** 2026-03-26T01:44:25Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Built 3 data collectors that produce identical canonical output format for triangulation
- Extended field-mapping.json with 176 source-specific field mappings across FMP, SimFin (3 templates), and mstarpy
- Created shared disk-cache utility with 7-day TTL enforcing rate limit budget preservation
- Python pre-fetch script ready for 50 truth set companies with BRK-B alias handling
- 52 new tests passing (29 disk-cache/field-mapping + 23 collector tests), 876 project tests pass with 0 regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend field-mapping.json with _sources and create shared disk-cache utility** - `21aed38` (test+feat)
2. **Task 2: Create FMP, SimFin, and mstarpy collectors with tests** - `4584448` (feat)

## Files Created/Modified
- `validation/scripts/lib/disk-cache.mjs` - Shared disk cache: readCache, writeCache, isExpired with 7-day TTL
- `validation/scripts/lib/fmp-collector.mjs` - FMP Stable API collector using fiscalYear keys, parallel 3-endpoint fetch
- `validation/scripts/lib/simfin-collector.mjs` - SimFin v3 compact API collector with GENERAL/BANKS/INSURANCE template detection
- `validation/scripts/lib/mstarpy-collector.mjs` - mstarpy JSON reader with recursive subLevel tree walk, 1e6 scale (except per-share fields)
- `validation/scripts/fetch-mstarpy.py` - Python pre-fetch script for 50 truth set companies (mstarpy library)
- `src/engines/__tests__/fixtures/morningstar/field-mapping.json` - Extended with _sources section (61 FMP + 42+19+17 SimFin + 37 mstarpy mappings)
- `src/engines/__tests__/harness/disk-cache.test.js` - 29 tests for cache utilities and field mapping structure
- `src/engines/__tests__/harness/fmp-collector.test.js` - 7 tests for FMP normalization, caching, error handling
- `src/engines/__tests__/harness/simfin-collector.test.js` - 7 tests for SimFin template detection, sign normalization
- `src/engines/__tests__/harness/mstarpy-collector.test.js` - 9 tests for tree flattening, scale, per-share exclusion, _PO_ handling

## Decisions Made
- **FMP capex sign correction:** Plan analysis suggested sign: 1 for FMP capitalExpenditure, but RESEARCH.md table correctly specifies sign: -1 (FMP returns negative capex, canonical is positive per XBRL convention). Used RESEARCH.md values.
- **_sources approach over inline:** Per-source field mappings stored as separate _sources sub-objects (not inline on each existing entry) for cleanliness and maintainability.
- **SimFin template sharing:** BANKS and INSURANCE templates include shared BS/CF field names from GENERAL for common balance sheet and cash flow fields, avoiding duplication of mapping logic.
- **mstarpy statement-key matching:** The mstarpy collector maps statement type (income/balance/cashFlow) to filter _sources.mstarpy entries by their `statement` property, ensuring capex mappings only apply to cashFlow processing.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected FMP capex sign convention**
- **Found during:** Task 1 (field-mapping.json _sources construction)
- **Issue:** Plan's inline analysis concluded sign: 1 for FMP capitalExpenditure, but this would produce negative canonical values when XBRL convention expects positive capex
- **Fix:** Used RESEARCH.md table value of sign: -1, which correctly flips FMP's negative capex to canonical positive
- **Files modified:** src/engines/__tests__/fixtures/morningstar/field-mapping.json
- **Verification:** Test confirms canonical capex is positive after sign flip
- **Committed in:** 21aed38 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix)
**Impact on plan:** Essential correctness fix. RESEARCH.md analysis was right; the plan's inline analysis was incorrect.

## Issues Encountered
None

## Known Stubs
None -- all collectors are fully functional with complete field mappings.

## User Setup Required
None - no external service configuration required. The Python pre-fetch script (`fetch-mstarpy.py`) requires `pip install mstarpy` but this is documented in the script itself.

## Next Phase Readiness
- All 3 collectors ready for Plan 02 consensus engine to consume
- Disk cache ready for orchestrator to manage rate limits across collectors
- field-mapping.json _sources section provides the canonical-to-source mapping the consensus engine needs
- Python pre-fetch script ready to run when mstarpy data is needed

## Self-Check: PASSED

All 10 created files verified present on disk. Both commit hashes (21aed38, 4584448) verified in git log.

---
*Phase: 02-multi-source-triangulation*
*Completed: 2026-03-26*
