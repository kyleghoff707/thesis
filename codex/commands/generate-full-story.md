# Generate Full Story

## Purpose

Generate the Stage 3 Thes1s full story for a ticker using the repo's v2 full-story workflow and debate structure.

This is the Codex-friendly equivalent of the Claude `/generate-full-story {TICKER}` skill.

## Inputs

- `TICKER` — stock ticker symbol, uppercase

## How To Invoke

Example prompt:

`Use codex/commands/generate-full-story.md for UBER`

## Workflow

1. Validate and uppercase `TICKER`.
2. Verify `.thes1s/reports/{TICKER}/pitch-deck.json` exists and is not gated out.
3. Verify `.thes1s/reports/{TICKER}/data-packet.json` exists.
4. Clean stale `sections/` and `quality/` state for that ticker while preserving required inherited artifacts.
5. Use the repo's `agents-v2` full-story prompts and phase structure.
6. Run Phase 1 deep-analysis outputs before Phase 2 debate outputs.
7. Preserve full-fidelity outputs when saving sections and debate artifacts.
8. Save the canonical result to `.thes1s/reports/{TICKER}/full-story.json`.
9. Verify the output exists and includes the expected sections.
10. Report the final verdict and whether the full story completed cleanly.

## Rules

- Respect the repo's inherited Stage 2 context model.
- Keep Phase 1 parallelizable work distinct from sequential debate work.
- Preserve complete output when writing files; do not save stubs.
- Do not use `run-pipeline.js`.
- During generation, do not read:
  - `knowledge/stage-1-one-pager/examples/`
  - `knowledge/stage-2-pitch-deck/examples/`
  - `knowledge/stage-3-full-story/examples/`
  - `knowledge/pre-course-examples/`

## Outputs

- `.thes1s/reports/{TICKER}/full-story.json`
- Section files under `.thes1s/reports/{TICKER}/sections/` when produced by the workflow
- A short summary of the final verdict and completion status
