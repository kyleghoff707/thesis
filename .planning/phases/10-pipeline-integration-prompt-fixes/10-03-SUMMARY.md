---
phase: 10-pipeline-integration-prompt-fixes
plan: 03
status: complete
started: 2026-03-29T05:00:00Z
completed: 2026-03-29T06:30:00Z
---

## Summary

Created pipeline runner script and executed a live end-to-end Pitch Deck pipeline run. PM verified mechanical completion — all 13 sections produced (10 pitch deck + 2 PSR + 1 synthesis) with 100% FIX compliance across all structured output fields.

## Key Results

- **Live run:** SFM Pitch Deck — 13 sections, 0 errors, $8.53 total cost, ~19 min wall clock
- **FIX-01:** 0 fabricated DataPacket paths in citation refs
- **FIX-03:** 368/368 citations in canonical `{id, ref, text, source}` format
- **FIX-04:** 40/40 searchesPerformed in canonical `{query, resultCount, usedInSection}` format
- **FIX-05:** 76/76 redFlags as strings (not objects)
- **Pipeline output:** `.thes1s/reports/SFM/pipeline-output.json`

## Bugs Found and Fixed

1. **Auth header stripping** — nodeAdapter.js fetch patch spread `Headers` instance (yields `{}`), stripping SDK's `x-api-key`. Fixed: convert `Headers` to plain object via `Object.fromEntries()`.

2. **"0 sections produced" per wave** — `onWaveComplete` callback checked `r.status === 'fulfilled'` but receives plain section objects, not Promise.allSettled wrappers. Fixed: count non-null entries.

3. **PSR agents lacked filing text** — DataPacket only included filing metadata (dates, accession numbers). Fixed: `run-pipeline.js` now pre-fetches 10-K/10-Q content via `fetchFilingMarkdown` + `extractAllSections`, injects as `dataPacket.filingContent`. Agent configs and prompts updated.

## Commits

- `fac9488` feat(10-03): add pipeline runner script for live end-to-end runs
- `a9f0093` fix(10-03): preserve SDK auth headers in nodeAdapter fetch patch
- `b33c786` fix(10-03): fix wave section counting + wire filing content to PSR agents

## Self-Check: PASSED

- [x] Pipeline runner script exists and loads cleanly
- [x] Live pipeline run completed all sections
- [x] FIX-01/03/04/05 compliance verified on real output
- [x] PM approved mechanical completion
- [x] Bug fixes committed for auth, counting, and filing access

## key-files

### created
- scripts/run-pipeline.js

### modified
- src/engines/nodeAdapter.js (auth header fix)
- agents/annual-reader/config.json (filingContent slice)
- agents/quarterly-reader/config.json (filingContent slice)
- agents/annual-reader/prompt.md (filingContent dispatch note)
- agents/quarterly-reader/prompt.md (filingContent dispatch note)

## Deviations

1. **Auth header fix (Rule 2 — auto-fix):** nodeAdapter.js `Headers` spreading bug discovered during live run. Not in plan but blocking all API calls.
2. **Filing content wiring (PM feedback):** PM flagged PSR agents lacked qualitative content. Added filing pre-processing step to run-pipeline.js and updated agent configs/prompts. Will be verified on next pipeline run (after UI implementation).
3. **Wave section counting fix (PM feedback):** Cosmetic bug in onWaveComplete callback. Fixed inline.
