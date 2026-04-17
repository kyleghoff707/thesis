# Analyze

## Purpose

Run the full Thes1s analysis workflow for a ticker through all 3 stages:

1. One Pager
2. Pitch Deck
3. Full Story

This file is the Codex-friendly equivalent of the Claude `/analyze {TICKER}` skill. Codex should treat this as an explicit workflow document, not as a native slash command.

## Inputs

- `TICKER` — stock ticker symbol, uppercase

## How To Invoke

Example prompts:

- `Use codex/commands/analyze.md for UBER`
- `Follow codex/commands/analyze.md for POOL`

## Workflow

1. Uppercase and validate `TICKER`.
2. Create or use `.thes1s/reports/{TICKER}/`.
3. Follow [generate-one-pager.md](./generate-one-pager.md).
4. Read `.thes1s/reports/{TICKER}/one-pager.json` and inspect `overallVerdict`.
5. If Stage 1 verdict is `FAIL`, stop and report the gate failure.
6. If Stage 1 verdict is `PASS` or `WATCHLIST`, follow [generate-pitch-deck.md](./generate-pitch-deck.md).
7. Verify `.thes1s/reports/{TICKER}/pitch-deck.json` exists and contains sections.
8. If Stage 2 failed or produced too few sections, stop and report the failure.
9. Follow [generate-full-story.md](./generate-full-story.md).
10. Verify `.thes1s/reports/{TICKER}/full-story.json` exists.
11. Report a concise stage-by-stage summary.

## Rules

- Run unattended when possible.
- Do not stop for optional PM-style checkpoints.
- Stop on the first hard gate failure.
- Do not use `run-pipeline.js`.
- Do not rely on Claude-only slash command behavior.
- Respect contamination boundaries from the stage command docs.

## Outputs

- `.thes1s/reports/{TICKER}/one-pager.json`
- `.thes1s/reports/{TICKER}/pitch-deck.json`
- `.thes1s/reports/{TICKER}/full-story.json`
- A concise Codex summary of stage outcomes
