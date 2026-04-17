# Generate Pitch Deck

## Purpose

Generate the Stage 2 Thes1s pitch deck for a ticker using the repo's v2 multi-agent workflow.

This is the Codex-friendly equivalent of the Claude `/generate-pitch-deck {TICKER}` skill.

## Inputs

- `TICKER` — stock ticker symbol, uppercase

## How To Invoke

Example prompt:

`Use codex/commands/generate-pitch-deck.md for UBER`

## Workflow

1. Validate and uppercase `TICKER`.
2. Verify `.thes1s/reports/{TICKER}/one-pager.json` exists and includes a verdict.
3. Clean stale `sections/`, `filings-md/`, `transcripts/`, and `quality/` state for that ticker.
4. Prepare the full Stage 2 data inputs required by the repo workflow.
5. Use the repo's `agents-v2` pitch-deck prompts and wave structure.
6. Save section artifacts and the final canonical output to `.thes1s/reports/{TICKER}/pitch-deck.json`.
7. Verify the result includes the expected sections and an overall verdict.
8. Report the overall verdict and section count.

## Rules

- Respect the repo's wave-based orchestration structure.
- Prefer sliced context over passing oversized raw context when the workflow supports it.
- Preserve full-fidelity outputs when writing artifacts.
- Do not use `run-pipeline.js`.
- During generation, do not read:
  - `knowledge/stage-1-one-pager/examples/`
  - `knowledge/stage-2-pitch-deck/examples/`
  - `knowledge/stage-3-full-story/examples/`
  - `knowledge/pre-course-examples/`

## Outputs

- `.thes1s/reports/{TICKER}/pitch-deck.json`
- Section files under `.thes1s/reports/{TICKER}/sections/` when produced by the workflow
- A short summary with verdict and section count
