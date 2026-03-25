---
phase: 06-pitch-deck
plan: 06A-05
subsystem: agents
tags: [risk-analyst, pest-framework, cyclical-risk, inversion, writing-skills, agent-prompt]

# Dependency graph
requires:
  - phase: 06A-01
    provides: "Agent directory structure, config.json, writing brief for risk-analyst"
provides:
  - "Full risk-analyst agent prompt (718 lines) for PEST risk analysis, event analysis, and inversion/rebuttal"
affects: [06B-01, 06D-02]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Adversarial agent design -- bearish bias with minimum red flag floors higher than other agents"
    - "Cyclical business risk assessment methodology with cycle position matrix"
    - "FGR attack methodology -- structured approach to challenging growth assumptions"

key-files:
  created: []
  modified:
    - agents/risk-analyst/prompt.md

key-decisions:
  - "Set minimum 3 red flags for PEST section (higher bar than other agents' 1 minimum) -- risk-analyst is the adversarial voice"
  - "Included FGR attack methodology from fgr.md so agent can challenge valuation assumptions with evidence"
  - "Added cyclical business risk assessment with cycle position matrix and valuation distortion warnings (PTCH-11)"
  - "Extended dataPacketSlice beyond config.json minimum to include financials, ttm, peerMetrics when available from prior agent context"
  - "Structured PEST data schema with per-risk probability/severity/mitigation/rebuttal/thesisImpact fields plus 2x2 risk matrix"

patterns-established:
  - "Adversarial agent pattern: bearish bias, higher red flag minimums, explicit thesis-killer tracking"
  - "PSR integration pattern: when PSR findings available, incorporate risk factor evolution from 10-K reading"

requirements-completed: [PTCH-11]

# Metrics
duration: 4min
completed: 2026-03-25
---

# Phase 6 Plan 06A-05: Risk Analyst Prompt Summary

**Full risk-analyst agent prompt (718 lines) covering PEST risk framework, cyclical business assessment, FGR attack methodology, and structured inversion/rebuttal analysis**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-25T19:29:23Z
- **Completed:** 2026-03-25T19:34:18Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Replaced 22-line stub with 718-line production prompt following /writing-skills TDD methodology
- Full PEST framework covering Political, Economic, Social, Technological risks with structured risk tables and probability/severity assessment
- Cyclical business risk assessment (PTCH-11) with cycle position matrix, valuation distortion warnings, and management track record evaluation
- FGR attack methodology enabling agent to challenge growth assumptions with evidence (Rule of 72 spot check, growth ceiling analysis)
- Three section specifications: Pitch Deck Section 9 (PEST Risks), Full Story Section 1 (Event Analysis), Full Story Section 6 (Inversion and Rebuttal)

## Task Commits

Each task was committed atomically:

1. **Task 1: Author risk-analyst prompt via /writing-skills** - `c57ac11` (feat)

**Plan metadata:** (pending)

## Files Created/Modified
- `agents/risk-analyst/prompt.md` - Full production prompt for the adversarial risk analyst agent (718 lines, replacing 22-line stub)

## Decisions Made
- Set minimum 3 red flags for PEST section vs the standard 1 minimum for other agents -- the risk-analyst's adversarial mandate demands a higher bar
- Extended the DataPacket slice documentation beyond the config.json minimum (companyInfo, events, analystEstimates, classification) to also describe financials, ttm, peers, and peerMetrics fields that may be available via prior agent context
- Included structured JSON data schemas for all three sections with detailed nested objects (risk arrays, cyclical assessment, growth ceiling, inversion framework)
- Added PSR integration section for when Primary Source Reader findings are available

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Known Stubs
None - prompt is complete production content.

## Next Phase Readiness
- Risk-analyst prompt is ready for use by `/generate:pitch-deck` CC skill (06B-01)
- All 5 new agent prompts for Phase 6A are now authored (competitor-evaluator, management-evaluator, risk-analyst remain; annual-reader and quarterly-reader in 06A-06)
- Ready for LULU parity verification in 06D-02

## Self-Check: PASSED

---
*Phase: 06-pitch-deck*
*Completed: 2026-03-25*
