# Generate One Pager

## Purpose

Generate the Stage 1 Thes1s one-pager for a ticker.

This command is the Codex-friendly equivalent of the Claude `/generate-one-pager {TICKER}` skill. It exists so Codex can follow a reusable, repo-native workflow file when asked.

## Inputs

- `TICKER` — stock ticker symbol, uppercase

## How To Invoke

Example prompt:

`Use codex/commands/generate-one-pager.md for UBER`

## Workflow

1. Validate and uppercase `TICKER`.
2. Create `.thes1s/reports/{TICKER}/` if needed.
3. Clean stale `sections/` and `quality/` state for that ticker.
4. Assemble the data packet needed for the one-pager workflow.
5. Use the existing repo one-pager process and prompts under `agents-v2/one-pager/`.
6. Save the canonical output to `.thes1s/reports/{TICKER}/one-pager.json`.
7. Verify the output parses and includes `overallVerdict`.
8. Report section verdicts and the overall verdict.

## Rules

- Do not use `run-pipeline.js`.
- Do not assume Claude slash-command support.
- During generation, do not read:
  - `knowledge/stage-1-one-pager/examples/`
  - `knowledge/stage-2-pitch-deck/examples/`
  - `knowledge/stage-3-full-story/examples/`
  - `knowledge/pre-course-examples/`

## Outputs

- `.thes1s/reports/{TICKER}/one-pager.json`
- Optional generated PDF if the repo workflow produces one
- A short summary of the verdict and section status
