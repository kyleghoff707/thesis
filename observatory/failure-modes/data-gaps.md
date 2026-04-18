---
type: failure-mode
mode: data-gaps
lastUpdated: 2026-04-18T05:34:57.932Z
severity: low
frequency: 2
affectedAgents: []
tags: [failure-mode, data-gaps]
---

## Definition

Required data was missing or incomplete during pipeline execution.

## Instances

| Run ID | Ticker | Agent | Details |
|--------|--------|-------|---------|
| 20260417-185013-SFM-fullStory | SFM | - | Judge Step 4: summary.unresolvedCount=3 but exchanges array contains 4 Unresolved verdicts (2 Strong Bull + 1 Strong Bear + 4 Unresolved = 7); internal math error in agent output; orchestrator did not correct, left inconsistency in saved file |
| 20260417-185013-SFM-fullStory | SFM | - | Orchestrator skipped Pre-Finalize Event Sweep step for Full Story run; Phase 1 and Phase 2 format violations were silently cleaned during JSON extraction and not logged; this backfill event reconstructs them retrospectively from subagent transcripts |

## Root Cause Analysis

_To be filled after pattern emerges across multiple runs._

## Mitigation

_To be determined based on root cause._
