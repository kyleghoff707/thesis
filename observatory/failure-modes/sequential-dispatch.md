---
type: failure-mode
mode: sequential-dispatch
lastUpdated: 2026-04-16T14:00:00Z
severity: high
frequency: 3
affectedAgents: [business-analyst, competitor-market-position, competitor-moats, financial-analyst, management-evaluator, risk-analyst, valuation-specialist]
tags: [failure-mode, sequential-dispatch, performance]
---

## Definition

Agents within a wave are dispatched one at a time (sequentially) when they should run in parallel. Results in 2-3x longer wall time with no quality benefit.

## Detection Criteria

- Pitch deck wall time > 35 minutes (expected ~20-25min with parallel dispatch)
- Orchestrator dispatch records show `parallel: false` when `parallel: true` is expected
- Wave duration approximately equals sum of individual agent durations (no overlap)

## Instances

| Run ID | Ticker | Wave | Expected | Actual | Impact |
|--------|--------|------|----------|--------|--------|
| 20260415-204131-LULU-pitchDeck | LULU | 1-3 | ~20min | 58min | 2.9x slower |
| 20260415-204842-POOL-pitchDeck | POOL | 1-3 | ~20min | 60min | 3.0x slower |
| 20260415-205824-UBER-pitchDeck | UBER | 1-3 | ~10min | 25min | 2.5x slower |

## Root Cause Analysis

The pitch deck skill had contradictory instructions:
- Line 108: "Agents within the same wave dispatch **in parallel**"
- Lines 319, 401, 496: Section headers reading "### Dispatch Agents Sequentially"

Claude follows the most proximate instruction. At dispatch time, the "Sequentially" header was the last instruction seen, overriding the earlier "in parallel" note.

Contributing factor: An old memory note about RAM constraints may have reinforced sequential behavior in some instances.

## Mitigation

**Applied 2026-04-16:**
- Renamed all 3 headers to "PARALLEL DISPATCH -- Wave N Agents (Single Message)"
- Added CRITICAL callout blocks at each wave: "Send ALL Agent tool calls in a SINGLE message"
- Strengthened full story Phase 1 parallel instructions with same callout pattern
- Removed stale RAM constraint memory note

**Verification needed:** Next pitch deck run should show ~20-30min wall time.
