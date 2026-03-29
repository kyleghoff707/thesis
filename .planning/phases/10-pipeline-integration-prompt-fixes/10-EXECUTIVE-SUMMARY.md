# Phase 10: Pipeline Integration & Prompt Fixes — Executive Summary

**Date:** 2026-03-29
**Duration:** ~90 minutes (execution + live pipeline run + bug fixes + verification)
**Plans:** 3/3 complete across 2 waves
**Lines changed:** +240 / -86 across 11 files
**Tests:** 17 new tests added, 2,224 total passing, zero regressions
**Cost of live run:** $8.53

---

## What This Phase Did

Phase 10 was the "prove it works" phase. The Claude API dispatch pipeline was built in Phases 7-9, but it had never been run end-to-end on a real company. This phase fixed the remaining integration gaps between the dispatch engine and the agent prompts, then ran the full pipeline live against SFM (Sprouts Farmers Market) with the PM watching. Three bugs were discovered and fixed during the live run.

## What Shipped

### Plan 01 — Field Path Generator + PSR Findings Formatter (Wave 1)
**Problem:** Agents were fabricating DataPacket field paths in citations because they didn't know what fields actually existed in their data slice. PSR (Primary Source Reader) agent findings weren't flowing to downstream analysis agents.

**Solution:** Built `generateFieldPathBlock()` — walks the actual DataPacket slice and produces a 2-level field reference (top-level keys + their types/sub-keys). Injected before the DataPacket JSON in every agent's user message. Built `formatPsrFindings()` — extracts narrative + primarySourceInsights from PSR sections and passes the formatted result to all wave and post-processing agents.

**Result:** 10 new tests in aiResearch.test.js, 7 new tests in pipelineManager.test.js. All TDD (red-green). Zero fabricated field paths in the live run.

### Plan 02 — Dispatch Table Split + Prompt Audit (Wave 1)
**Problem:** Four issues blocking API dispatch: (1) dispatch-table.json had multi-section entries but structured output forces single-object return, (2) agent prompts referenced "CC skill" and "Claude Code", (3) prompts told agents to "return an array of TWO JSON objects", (4) prompts referenced custom tools (comparePeers, getMetric, readFilingSection) that aren't available in API dispatch.

**Solution:** Split multi-section dispatch entries to one-per-section (pitchDeck: 10 entries, onePager: 5 entries). Removed all CC-specific references. Replaced unavailable tool documentation with DataPacket direct access instructions. Added API Dispatch Mode notes to PSR agents.

**Result:** Zero instances of "CC skill", "Claude Code", or "return an array of TWO" across all agent prompts. All 10 pitchDeck dispatches produce exactly one ReportSectionSchema object.

### Plan 03 — Pipeline Runner + Live Validation (Wave 2)
**Problem:** No way to run the pipeline from CLI, and no proof the full pipeline actually works.

**Solution:** Created `scripts/run-pipeline.js` — assembles DataPacket, runs pipeline, logs wave-by-wave progress, writes output JSON. Ran live against SFM with PM checkpoint.

**Result:** 13 sections produced (10 pitch deck + 2 PSR + 1 synthesis), 0 errors, $8.53 total, ~19 minutes. 100% compliance on all structured output fields.

---

## Bugs Found and Fixed During Live Run

Three bugs surfaced during the live pipeline run — all fixed in-session:

### 1. Auth Header Stripping (Critical)
`nodeAdapter.js` patches `globalThis.fetch` to add SEC User-Agent headers. It spread `opts.headers` — but the Anthropic SDK passes headers as a `Headers` instance, and spreading a `Headers` object yields `{}`. Every API call hit 401.

**Fix:** Convert `Headers` to plain object via `Object.fromEntries(opts.headers.entries())` before spreading.

### 2. "0 Sections Produced" Per Wave (Cosmetic)
The `onWaveComplete` callback checked `r.status === 'fulfilled'` (Promise.allSettled shape), but `pipelineManager.js` passes plain section objects to the callback, not settlement wrappers.

**Fix:** Count non-null entries instead of checking `.status`.

### 3. PSR Agents Lacked Filing Text (Significant)
DataPacket only included filing metadata (dates, accession numbers) — no actual filing text. PSR agents need the Business, Risk Factors, and MD&A sections to do qualitative analysis. Their output was data-only with explicit "API Dispatch Mode limitation" caveats throughout.

**Fix:** `run-pipeline.js` now pre-fetches the most recent 5 10-Ks + 4 10-Qs via `fetchFilingMarkdown`, extracts sections via `extractAllSections`, and injects as `dataPacket.filingContent`. Agent configs updated to include `filingContent` in their slice. Prompts updated to check `dataPacket.filingContent` first. Not yet validated in a live run — PM approved for next run to happen inside the app UI.

---

## Key Metrics

| Metric | Value |
|--------|-------|
| Total pipeline cost (SFM) | **$8.53** (target: $8-12) |
| Pipeline runtime | **19 minutes** wall clock |
| Sections produced | **13** (10 + 2 PSR + 1 synthesis) |
| Errors | **0** |
| Citations (FIX-03) | **368/368** in canonical format |
| Searches performed (FIX-04) | **40/40** in canonical format |
| Red flags (FIX-05) | **76/76** as strings |
| Fabricated DataPacket paths (FIX-01) | **0** |
| Prompt cache hit rate | **~53%** (938K read tokens) |
| Web searches executed | **40** across all agents |
| Total input tokens | **518,907** |
| Total output tokens | **129,668** |

## Live Run Agent Cost Breakdown

| Agent | Input | Output | Cost |
|-------|-------|--------|------|
| annual-reader | 40.8K | 9.2K | $0.29 |
| quarterly-reader | 41.2K | 7.0K | $0.23 |
| business-analyst (x2) | 22K each | 7-8K | $0.96 |
| competitor-evaluator (x2) | 23-25K | 10.4K | $1.12 |
| financial-analyst (x3) | 67K each | 12-13K | $2.46 |
| management-evaluator | 37.5K | 12.1K | $0.64 |
| risk-analyst | 28.4K | 10.8K | $1.12 |
| valuation-specialist | 61.6K | 11.3K | $1.45 |
| synthesis-writer | 15.8K | 6.6K | $0.25 |

## PM Feedback

1. **Reports need charts, graphs, and illustrations.** The PDF toolkit supports bar charts, gauges, and scorecards — build a richer generator for future reports.
2. **Next pipeline run should happen inside the app UI.** User wants to see the full experience in Tauri before running again.
3. **Filing content fix needs live validation.** The `filingContent` wiring was approved without re-running — will be verified when the pipeline runs in the app.

---

## What's NOT Done (Deferred)

- **Filing content live validation** — `dataPacket.filingContent` wiring committed but not tested in a live run
- **Transcript content for quarterly-reader** — `getTranscriptExcerpt` tool still unavailable; transcript text not pre-fetched
- **Visual report generation** — Charts, gauges, and illustrations in PDF output
- **UI integration** — Pipeline runs from CLI only; Tauri app doesn't trigger pipeline yet

## Remaining Risk

- **Cache hit rate below target** — 53% vs 70% threshold. May improve with filing content (more static context to cache). Monitor on next run.
- **Filing content token impact** — Pre-fetched filing sections could significantly increase DataPacket size and input tokens. May need selective section inclusion or summarization.
- **Transcript gap** — Quarterly-reader still works without transcript text, but quality will improve when transcripts are wired in.

---

## Next Steps

1. **Phase 11** — Next phase in the roadmap (validation or UI integration, per ROADMAP.md)
2. **Run pipeline in app** — Wire pipeline trigger into Tauri UI, show real-time progress
3. **Enrich PDF reports** — Add charts, growth rate visualizations, peer comparison tables, valuation range gauges

---

*Phase 10 complete. The pipeline runs end-to-end, produces investment-grade structured output at $8.53/company, and handles 13 agents across 3 waves with zero errors. Three live-run bugs found and fixed. Ready for UI integration.*
