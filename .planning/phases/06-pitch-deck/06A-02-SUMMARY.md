---
phase: 06-pitch-deck
plan: 06A-02
subsystem: agents
tags: [prompts, pitch-deck, cyclical, dual-owner-earnings, acquisition-tracking, synthesis]

# Dependency graph
requires:
  - phase: 05A-agent-definitions-foundation
    provides: "4 real agent prompts (business-analyst, financial-analyst, valuation-specialist, synthesis-writer)"
provides:
  - "Pitch Deck depth instructions in all 4 existing agent prompts"
  - "Cyclical business handling guidance (CAGR from first positive year, through-cycle averages)"
  - "Dual owner earnings instructions (Rule One + Graham methods)"
  - "Acquisition history tracking table format"
  - "10-section Pitch Deck synthesis with weighted verdict assembly"
affects: [06A-03, 06A-04, 06A-05, 06A-06, 06B-01, 06B-02]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Stage-conditional depth: agents check stage (One Pager vs Pitch Deck) and adjust analysis depth"
    - "Weighted verdict assembly: Pitch Deck synthesis weights moat/financial sections heavier than radar/PEST"

key-files:
  created: []
  modified:
    - "agents/business-analyst/prompt.md"
    - "agents/financial-analyst/prompt.md"
    - "agents/valuation-specialist/prompt.md"
    - "agents/synthesis-writer/prompt.md"

key-decisions:
  - "Added Pitch Deck sections as additive content (not restructuring existing prompts) per D-03"
  - "Weighted Pitch Deck verdict: moat (sections 3-4) and financial health (5-8) heaviest, PEST lightest"
  - "Dual owner earnings requires two computeTenCap calls with method parameter"
  - "Cyclical CAGR from first positive year, not simple endpoint CAGR"

patterns-established:
  - "Agent prompt layering: base curriculum (One Pager) + additive depth sections (Pitch Deck) in same file"
  - "Quality standards per stage: minimum word counts, citation counts, and red flag counts scale with stage depth"

requirements-completed: [PTCH-10, PTCH-11, PTCH-12]

# Metrics
duration: 5min
completed: 2026-03-25
---

# Phase 06A Plan 02: Agent Prompt Pitch Deck Depth Summary

**Light update pass on 4 existing agent prompts with Pitch Deck-specific depth: cyclical business handling, dual owner earnings, acquisition tracking, FGR derivation workflow, sensitivity tables, and 10-section synthesis with weighted verdict assembly**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-25T19:21:03Z
- **Completed:** 2026-03-25T19:26:18Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- All 4 existing agent prompts now have explicit Pitch Deck depth instructions without breaking One Pager behavior
- business-analyst: Radar depth, Simple & Predictable tests, acquisition history table (PTCH-12), PSR integration
- financial-analyst: FCF/ROE/Balance Sheet deep analysis, cyclical handling with first-positive-year CAGR (PTCH-11), DuPont decomposition, PSR cross-reference
- valuation-specialist: Dual owner earnings Rule One + Graham (PTCH-10), FGR 5-input derivation, sensitivity tables, market share ceiling analysis, buy price ranges
- synthesis-writer: 10-section pitchDeck synthesis, overallVerdict assembly with weighted scoring, cross-section consistency checks

## Task Commits

Each task was committed atomically:

1. **Task 1: Update business-analyst and financial-analyst prompts for Pitch Deck depth** - `384b5cb` (feat)
2. **Task 2: Update valuation-specialist and synthesis-writer prompts for Pitch Deck** - `10aa50a` (feat)

## Files Created/Modified
- `agents/business-analyst/prompt.md` - Added Pitch Deck Depth section: Radar, Simple & Predictable, acquisition history, PSR integration, quality standards (+53 lines)
- `agents/financial-analyst/prompt.md` - Added Pitch Deck Depth section: FCF, ROE/ROIC/Debt, Balance Sheet, cyclical handling, PSR cross-reference, quality standards (+62 lines)
- `agents/valuation-specialist/prompt.md` - Added Pitch Deck Depth section: dual owner earnings, FGR derivation workflow, sensitivity tables, market share ceiling, buy price ranges (+98 lines)
- `agents/synthesis-writer/prompt.md` - Added Pitch Deck Synthesis section: 10-section verdict assembly, weighted scoring, consistency checks, quality-aware polish (+52 lines)

## Decisions Made
- Added as additive sections (not restructuring existing content) per D-03 light update pass
- Pitch Deck verdict weighting: moat + financial health sections get heavy weight; PEST gets lower weight (only existential risks override)
- Dual owner earnings requires two separate computeTenCap tool calls with method parameter (ruleOne vs graham)
- Cyclical businesses: CAGR from first positive year + peak-to-peak and trough-to-trough averages + multiple capex scenarios
- FGR derivation structured as 5 numbered inputs with confidence levels (HIGH/MEDIUM/LOW) per input

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 4 existing agent prompts are Pitch Deck-ready
- New agents (06A-03 through 06A-06) can reference these updated prompts for consistency in depth expectations
- Synthesis-writer is ready for 10-section Pitch Deck mode with weighted verdict assembly

## Self-Check: PASSED

---
*Phase: 06-pitch-deck*
*Completed: 2026-03-25*
