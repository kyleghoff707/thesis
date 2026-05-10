---
name: analyze
description: "Run the full 3-stage Thesis pipeline (One Pager -> Pitch Deck -> Final Thesis) for a stock ticker using Claude Code subagents"
argument-hint: TICKER
disable-model-invocation: true
---

# Analyze

Run the complete Thesis investment analysis pipeline for **$0** using Claude Code subagents.

Chains all 3 stages sequentially: One Pager -> Pitch Deck -> Final Thesis.
Gates between stages — stops on first failure. One command, walk away.

All AI work runs as Claude Code subagents (Pro Max subscription compute). No API calls.

## Step 1: Validate Input

The ticker symbol is `$0`. Uppercase it and store as `TICKER`.

- If `$0` is empty, print usage: `/analyze TICKER` and stop.
- Create output directories:
  - `~/thesis/reports/{TICKER}/`
  - `~/thesis/cache/{TICKER}/sections/`
  - `~/thesis/cache/{TICKER}/quality/`

## Step 2: Run One Pager (Stage 1)

Invoke the skill:
```
/generate-one-pager {TICKER}
```

Wait for completion. When it finishes, read `~/thesis/reports/{TICKER}/one-pager.json` and check `overallVerdict`.

**Gate check:**
- If verdict is `PASS` or `WATCHLIST` → continue to Step 3 (WATCHLIST means "worth deeper research")
- If verdict is `FAIL` → log the verdict and **stop**. Print:
  ```
  GATE FAILED: One Pager verdict is FAIL. Pipeline stopped at Stage 1.
  Review: ~/thesis/reports/{TICKER}/one-pager.json
  ```

## Step 3: Run Pitch Deck (Stage 2)

Invoke the skill:
```
/generate-pitch-deck {TICKER}
```

The pitch deck skill runs end-to-end without checkpoints — no PM interaction needed.

When it finishes, verify `~/thesis/reports/{TICKER}/pitch-deck.json` exists with sections.

**Gate check:** If fewer than 10 sections were produced or the pipeline errored, log the issue and **stop**.

## Step 4: Run Final Thesis (Stage 3)

Invoke the skill:
```
/generate-final-thesis {TICKER}
```

The final thesis skill runs end-to-end without checkpoints — no PM interaction needed.

When it finishes, verify `~/thesis/reports/{TICKER}/final-thesis.json` exists.

## Step 5: Report Results

Print a summary:
```
============================================================
  PIPELINE COMPLETE — {TICKER}
============================================================

Stage 1 (One Pager):  {verdict}
Stage 2 (Pitch Deck): {sectionCount} sections
Stage 3 (Final Thesis):  {sectionCount} sections + debate

Output: ~/thesis/reports/{TICKER}/
```

Each stage auto-archives its outputs to `~/thesis/reports/{TICKER}/archive/{RUN_ID}/` so prior runs are preserved.

## Constraints

### Auto-pilot Mode
This skill runs unattended. Never pause to ask the user questions. All sub-skills run end-to-end without checkpoints. If something fails, log it and stop — don't ask for guidance.

### Contamination Boundary (CRITICAL)
During generation, NEVER read from any of these paths:
- `knowledge/stage-1-one-pager/examples/`
- `knowledge/stage-2-pitch-deck/examples/`
- `knowledge/stage-3-final-thesis/examples/`
- `knowledge/pre-course-examples/`

### No API Calls
All AI work must run as Claude Code subagents via the existing generation skills. Never call `run-pipeline.js` or the Claude API directly. The user's Pro Max subscription covers subagent compute.
