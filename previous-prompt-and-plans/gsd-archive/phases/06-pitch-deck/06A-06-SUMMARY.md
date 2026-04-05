---
phase: 06-pitch-deck
plan: 06A-06
subsystem: agents
tags: [agent-prompts, writing-skills, primary-source-reader, 10-K, 10-Q, transcripts, SEC-filings]

# Dependency graph
requires:
  - phase: 06A-01
    provides: annual-reader and quarterly-reader config.json + writing-briefs
provides:
  - Full annual-reader agent prompt (650 lines) for chronological 10-K processing
  - Full quarterly-reader agent prompt (653 lines) for 10-Q + transcript processing with promise tracking
affects: [06B-01, 06D-02]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Chronological reading order (oldest-first) for filing extraction"
    - "Targeted section reading via readFilingSection (never full filing reads)"
    - "Promise tracking system with structured status lifecycle"
    - "Graceful transcript absence handling"
    - "Cross-validation protocol (SEC vs DataPacket) with severity classification"

key-files:
  created:
    - agents/annual-reader/prompt.md
    - agents/quarterly-reader/prompt.md
  modified: []

key-decisions:
  - "Annual-reader has readFilingSection only -- no transcript access (separation of concerns per D-08)"
  - "Both prompts use structured JSON output format matching downstream agent consumption patterns"
  - "Promise tracker uses 5-status lifecycle: fulfilled, partially_fulfilled, missed, revised, pending"
  - "Cross-validation severity uses 3 tiers: low (<1%), medium (1-5%), high (>5%) with SEC as source of truth"

patterns-established:
  - "PSR agent prompt structure: role statement, investigation mandate, contamination boundary, R1 fundamentals, filing scope, reading order, extraction protocol, output format, quality checklist"
  - "Quarterly reader promise tracking: extract exact quotes with metadata, check fulfillment in subsequent quarters"

requirements-completed: [PTCH-07]

# Metrics
duration: 7min
completed: 2026-03-25
---

# Phase 06A Plan 06: PSR Agent Prompts Summary

**Two full production prompts (650 + 653 lines) for annual-reader (10-K + proxy chronological processing) and quarterly-reader (10-Q + transcript promise tracking) authored via /writing-skills methodology**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-25T19:29:55Z
- **Completed:** 2026-03-25T19:37:00Z
- **Tasks:** 2
- **Files created:** 2

## Accomplishments
- Annual-reader prompt: 650-line production prompt covering chronological 10-K reading (Item 1, 1A, 7, 6), proxy extraction (compensation, board, shareholder letters), cross-validation against DataPacket, and complete acquisition history extraction
- Quarterly-reader prompt: 653-line production prompt covering 10-Q + earnings transcript processing, management promise tracking system, tone assessment, guidance trajectory tracking, Q&A quality analysis, and graceful transcript absence handling
- Both prompts produce structured JSON output designed for consumption by all 6 downstream analyst agents

## Task Commits

Each task was committed atomically:

1. **Task 1: Author annual-reader prompt** - `04e4e5f` (feat)
2. **Task 2: Author quarterly-reader prompt** - `592b6b1` (feat)

## Files Created/Modified
- `agents/annual-reader/prompt.md` - Full annual filing specialist prompt (650 lines): chronological 10-K + proxy reading, targeted section extraction, cross-validation, acquisition history, structured JSON output
- `agents/quarterly-reader/prompt.md` - Full quarterly filing & transcript specialist prompt (653 lines): 10-Q + transcript reading, promise tracking, tone assessment, guidance trajectory, graceful transcript absence

## Decisions Made
- Annual-reader explicitly excludes transcript access (no getTranscriptExcerpt references) -- clean separation of concerns per D-08
- Promise tracker uses a structured 5-status lifecycle (fulfilled/partially_fulfilled/missed/revised/pending) with exact quote preservation and evidence sourcing
- Cross-validation uses 3-tier severity (low/medium/high) with SEC as authoritative source of truth for high-severity discrepancies
- Both agents output structured JSON (not report sections) since they are pre-processing agents consumed by all downstream analysts
- Proxy DEF 14A sections are read for each fiscal year alongside the 10-K -- not just one proxy per decade

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed getTranscriptExcerpt reference from annual-reader**
- **Found during:** Task 1 verification
- **Issue:** The prompt contained a negative reference to getTranscriptExcerpt ("You do NOT have...") which technically contained the forbidden keyword per acceptance criteria
- **Fix:** Rewrote the sentence to say "You have ONLY the readFilingSection tool" without mentioning the forbidden tool name
- **Files modified:** agents/annual-reader/prompt.md
- **Verification:** grep confirms 0 occurrences of getTranscriptExcerpt
- **Committed in:** 04e4e5f (part of Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - keyword enforcement)
**Impact on plan:** Minor wording fix for acceptance criteria compliance. No scope creep.

## Issues Encountered
- Cherry-picked 06A-01 commits (0069663, 834a318) into worktree since the dependency plan had been executed on a separate branch. The config.json and writing-brief.md files were prerequisites for this plan.
- Pre-existing test failure in agentDefinitions.test.js (knowledge/research-references/advanced-financial-analysis.md missing from worktree) -- not caused by this plan's changes.

## Known Stubs
None -- both prompts are complete production-quality agent definitions with no placeholder content.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Both PSR agent prompts are ready for the CC skill (06B-01) to reference during pitch deck generation
- Annual-reader: ready for 10-K + proxy pre-processing dispatch
- Quarterly-reader: ready for 10-Q + transcript pre-processing dispatch (handles absent transcripts gracefully)
- All 10 agent roles now have production prompts (4 from Phase 5C, 3 from 06A-03/04/05, 2 from this plan, plus orchestrator)

## Self-Check: PASSED

- agents/annual-reader/prompt.md: FOUND (650 lines)
- agents/quarterly-reader/prompt.md: FOUND (653 lines)
- .planning/phases/06-pitch-deck/06A-06-SUMMARY.md: FOUND
- Commit 04e4e5f: FOUND
- Commit 592b6b1: FOUND

---
*Phase: 06-pitch-deck*
*Completed: 2026-03-25*
