# Orchestrator

The orchestrator is **code, not AI**. It is a dispatch coordinator that manages the execution of AI agent roles through the 3-stage research workflow.

## What It Does

- **Dispatches agents** to their assigned sections based on the dispatch table
- **Sequences phases** — parallel agents within a phase, sequential between phases
- **Presents checkpoints** to the user (portfolio manager) with findings, data gaps, questions, and confidence levels
- **Manages the state machine** — tracks generation progress from IDLE through DATA_ASSEMBLY, wave execution, checkpoints, synthesis, quality check, to COMPLETE
- **Handles failure recovery** — retry-then-escalate pattern for agent failures
- **Persists state** — writes progress.json for crash recovery and session boundary handling

## What It Is NOT

- NOT an AI agent — it has no model, no prompt, no AI generation
- NOT a decision maker — it follows the dispatch table deterministically
- NOT a content producer — agents produce content, the orchestrator just coordinates

## Key Files

| File | Purpose |
|------|---------|
| `config.json` | Section-to-agent mapping for all 3 stages, checkpoint rules |
| `dispatch-table.json` | Detailed phase-by-phase execution plan with parallelism and dependencies |

## State Machine

```
IDLE -> DATA_ASSEMBLY -> PRIMARY_SOURCE_READING -> WAVE_1_RUNNING -> CHECKPOINT_1
  -> WAVE_2_RUNNING -> CHECKPOINT_2 -> WAVE_3_RUNNING -> CHECKPOINT_3
  -> SYNTHESIS -> QUALITY_CHECK -> COMPLETE
```

Not all states are used by all stages. One Pager skips PRIMARY_SOURCE_READING and has no checkpoints. Pitch Deck uses all states. Full Story inherits Pitch Deck data and starts from WAVE_1_RUNNING.

## Checkpoint Format

At each checkpoint, the orchestrator presents:

1. **Findings** — Key insights from each completed section in the phase
2. **Data gaps** — Information the agents could not find or access
3. **Questions** — Decisions that require user input (e.g., which market size estimate to trust)
4. **Confidence** — Per-section confidence levels (HIGH / MEDIUM / LOW)

The user (portfolio manager) responds with: answers, corrections, pasted data, or "proceed."

## FGR Confirmation

The `fgrRequiresConfirmation` rule means the valuation specialist's FGR derivation must be explicitly approved by the user before buy prices are calculated. This is the single most impactful assumption in the entire analysis.

## Implementation

The orchestrator logic lives in:
- **CC skill** (Phase 5C) — Claude Code commands like `/generate:one-pager COST`
- **aiResearch.js** (Phase 8) — programmatic API for the Tauri app UI

Both consume the same config.json and dispatch-table.json definitions.
