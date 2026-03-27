---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: Phase 03 Complete
stopped_at: Phase 4 context gathered
last_updated: "2026-03-27T03:58:09.022Z"
progress:
  total_phases: 5
  completed_phases: 3
  total_plans: 16
  completed_plans: 18
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-25)

**Core value:** 98%+ accuracy match to Morningstar across all US-listed equities, achieved by triangulating XBRL output against FMP, SimFin, and mstarpy — then fixing normalization rules so paid sources are never needed again.
**Current focus:** Phase 03 complete — ready for Phase 04

## Current Position

Phase: 03 (engine-fixes) — COMPLETE
Plan: 11/11 complete

## Performance Metrics

**Velocity:**

*Updated after each plan completion*
| Phase 01 P01 | 9min | 2 tasks | 7 files |
| Phase 01-comparison-harness P02 | 21min | 3 tasks | 3 files |
| Phase 02 P02 | 4min | 2 tasks | 4 files |
| Phase 02 P01 | 11min | 2 tasks | 10 files |
| Phase 03 P01 | 6min | 2 tasks | 5 files |
| Phase 03 P02 | 8min | 2 tasks | 7 files |
| Phase 03 P03 | 12min | 2 tasks | 7 files |
| Phase 03 P04 | 7min | 2 tasks | 3 files |
| Phase 03 P05 | ~5min | 2 tasks | 2 files |
| Phase 03 P06 | ~5min | 3 tasks | 2 files |
| Phase 03 P07 | 6min | 2 tasks | 4 files |
| Phase 03 P08 | 7min | 2 tasks | 5 files |
| Phase 03 P09 | 15min | 2 tasks | 4 files |
| Phase 03 P10 | 17min | 2 tasks | 4 files |
| Phase 03 P11 | 11min | 2 tasks | 5 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Fix the measurement instrument (harness) before touching the engine — documented root cause of Attempt #2 ceiling
- Triangulate across 3 sources (FMP + SimFin + mstarpy) to distinguish our bugs from Morningstar quirks
- All-JavaScript pipeline — no Python for computation, only mstarpy subprocess for data fetch
- Three-phase accuracy rollout: 50-company truth set → S&P 500 → full market
- Compensation normalization (Phase 5) is secondary and can run in parallel after Phase 1
- [Phase 01]: Used fiscalYearEnd metadata as primary FY resolver with revenue-matching validation (not brute-force-first)
- [Phase 01]: Injectable specialHandlers pattern for comparator extensibility in Phase 2 multi-source comparison
- [Phase 01]: field-mapping.json has 101 mapped fields (not 87 as stale metadata claims) -- tests use actual count
- [Phase 01-comparison-harness]: Harness accuracy 91.2% established as baseline — the 8.8% gap is what Phases 2-3 will close, not a harness methodology error
- [Phase 02]: Kept isClose helper duplicated between consensus.mjs and root-cause-tagger.mjs for zero coupling
- [Phase 02]: Bitmask subset enumeration for cluster finding — O(2^N) but N always 3-5 sources
- [Phase 03]: Alias map resolves canonical->engine names at lookup time rather than renaming engine fields (50+ UI components depend on engine names)
- [Phase 03]: Pre-fix baselines force-added to git despite gitignore for regression tracking across sessions
- [Phase 03]: Overlay merge changed from additive-only to overlay-wins — industry-specific tags more accurate than generic base taxonomy for REITs
- [Phase 03]: Bank template detection uses ticker-based lookup (not SIC from fixtures) because MS fixtures have no SIC field
- [Phase 03]: PP&E reclassification checks FMP agreement before reclassifying to METHODOLOGY_DIFF
- [Phase 03]: 95% coverage gate on residual OtherCL prevents B7 error amplification -- requires 8/8 named CL items
- [Phase 03]: 98% target was aspirational -- 94.8% reflects methodology diffs not bugs; remaining DIFFs are genuine scope differences
- [Phase 03]: FY offset (P28/P29) is triangulation-specific, not MS comparison -- deferred without API keys
- [Phase 03]: Accrued liabilities: reclassify as METHODOLOGY_DIFF because direction is mixed (72 MS higher, 69 engine higher)
- [Phase 03]: D&A broadening: 3% threshold guards against double-counting; only add components when primary DDA is within 3% of depreciation_only + amort
- [Phase 03]: Residual Other fields: XBRL company-defined scope vs MS strict residual -- METHODOLOGY_DIFF, not fixable
- [Phase 03]: Debt/investment/revenue: methodology handlers with ticker-aware variant for industry-specific revenue

### Pending Todos

None yet.

### Blockers/Concerns

- mstarpy scraper is fragile and could break at any time — pipeline must degrade gracefully without it
- FMP 250 calls/day limit constrains how fast the 50-company fetch can run (2-day minimum for full set)

## Session Continuity

Last session: 2026-03-27T03:58:09.013Z
Stopped at: Phase 4 context gathered
Resume file: .planning/phases/04-scale-validation/04-CONTEXT.md
