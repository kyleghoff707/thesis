# Session Summary — April 4-5, 2026
## Pitch Deck In-App Pipeline Wiring + Checkpoint Removal

### What Was Accomplished
First successful in-app Pitch Deck pipeline run (LULU). 7/7 PSR agents, 10/10 sections, zero failures. Pipeline runs straight through without checkpoints (~25-30 min, ~$10-12).

---

## Major Changes Made

### 1. Parallel PSR Dispatch (`pipelineManager.js`)
- Changed from 1 annual-reader (all 5 10-Ks) to 5 parallel annual-readers (1 per 10-K)
- Added transcript reader as 7th PSR agent
- All 7 dispatched via `Promise.allSettled`
- Each annual-reader gets 32768 max_tokens (was 16384, caused truncation)
- PSR summary written to `psr-summary.json` for UI display

### 2. Schema Simplification (`src/schemas/reportSection.js`)
- Removed `dataGaps` field entirely (agents produced unreliable gaps, UI panel removed)
- Removed `searchesPerformed` field entirely (diagnostic only, inflated grammar)
- Flattened `tables` from `z.array(TableSchema)` → `z.array(z.string())` (JSON strings)
- Flattened `charts` from `z.array(ChartSchema)` → `z.array(z.string())` (JSON strings)
- **Result:** `output_config` + web search tools now works together (grammar small enough). Every agent gets reliable `parsed_output`. The manual JSON extraction fallback is rarely needed.

### 3. Checkpoint Removal (plan at `~/.claude/plans/generic-tinkering-storm.md`)
- Removed CHECKPOINT_1/2/3 states from `VALID_TRANSITIONS` in `progressState.js`
- Removed `waitForCheckpointResponse()` and checkpoint file writing from `run-pipeline.js`
- Changed `wave.checkpoint?.after &&` conditions to unconditional `onWaveComplete` calls in `pipelineManager.js`
- Removed checkpoint configs from `dispatch-table.json`
- Removed CheckpointPanel rendering from PitchDeck.jsx, FullStory.jsx, OnePager.jsx
- Completed sections now written to `generation-status.json` `completedSections` field (embedded, no separate file)
- PSR summary card shows at report completion (was at checkpoint 1)
- Comments are post-completion only via localStorage

### 4. Transcript Engine (`src/engines/transcripts.js`, `scripts/run-pipeline.js`)
- Brute-force 8-quarter scan (no fiscal year guessing, works for LULU/COST/NKE)
- Disk caching at `.thes1s/reports/{TICKER}/transcripts/{year}Q{quarter}.json`
- 2 Alpha Vantage keys with automatic rotation/failover
- Finnhub removed entirely from codebase (was premium-only, key discontinued)

### 5. Agent Data Slices (all `agents/*/config.json`)
- Business-analyst: added `gurus`, `financials`, `ttm`, `growthRates`, `analystEstimates`, `events`
- Competitor-evaluator: added `financials`, `ttm`, `growthRates`, `ruleOneScore`
- Risk-analyst: added `financials`, `ttm`, `growthRates`, `peers`, `insiders`
- Management-evaluator: added `financials`, `ttm`, `returnMetrics`, `classification`
- Financial-analyst: added `companyInfo`, `analystEstimates`, `prices`, `classification`
- Valuation-specialist: added `financials`, `companyInfo`, `prices`
- **Root cause:** CC skill passed data dynamically; config.json slices were minimal starting points that never got expanded

### 6. Section Key Normalization (`scripts/run-pipeline.js`, `src/components/PitchDeck.jsx`)
- 30+ key variants mapped to canonical keys (e.g., `simple_and_predictable` → `simple_predictable`, `fcf_analysis` → `fcf`, `pest_risks` → `pest`)
- `KEY_NORMALIZATION` in run-pipeline.js (pipeline side)
- `KEY_ALIASES` in PitchDeck.jsx (UI side)
- Applied before `completeSection()` calls AND during sectionMap construction

### 7. Retry & Repair Logic (`src/engines/aiResearch.js`)
- All API calls use `client.messages.stream(params).finalMessage()` (no 10-min timeout)
- All API calls use `output_config` with simplified schema (works with tools now)
- 529 retry: 2 attempts with 10s/30s backoff (was 1 attempt, 10s)
- 429 retry: fixed to use `extractResult()` instead of raw `parsed_output`
- Structured output truncation: caught via `err.message.includes('Failed to parse structured output')`, retries with 32768 tokens
- Repair call: fires for ANY null section (was unreachable when API returned an error). Sends raw text to Sonnet with `output_config` to extract structured data.

### 8. UI Changes
- Generate Pitch Deck button on PD page (empty state + header)
- Grace period spinner ("Starting generation...") on click
- Phase indicators read from `generationStatus.phases` during generation (was always pending)
- Timer uses `activeMs` from state machine (not wall-clock)
- PSR Summary Card with expandable filing detail
- PDF/Word export buttons on completed reports
- Comment button moved to bottom of each section
- "No Data Gaps Found" explicit message (then data gaps panel removed entirely)
- Report stage pills show full names ("One Pager" not "OP")
- Full Story also wired with generate button, grace spinner, stage filtering

### 9. Pipeline Runner (`scripts/run-pipeline.js`)
- `onWaveComplete` simplified: normalize keys, save section output, complete section, update phase, advance to next wave (no pause)
- Results flattened with `.flat()` to handle nested arrays from agents
- `saveSectionOutput()` called per section for live UI visibility
- Transcript fetching integrated into `assembleAndPreprocess()`

---

## Bugs Fixed (Critical)

1. **Web search + structured output conflict** — `output_config` + tools exceeded API grammar limit. Fixed by simplifying ReportSectionSchema.
2. **Repair call unreachable** — Placed after error-return guard, never fired when API itself failed (429/529). Fixed by removing early return.
3. **Data slice gaps** — Agents didn't receive guru data, financials, events despite DataPacket having them. Fixed all 6 agent configs.
4. **PSR single-agent dispatch** — All 5 10-Ks sent to one annual-reader. Fixed with per-filing DataPacket cloning.
5. **IndexedDB doesn't work in Node.js** — Transcripts cached in memory, lost between runs. Fixed with disk caching.
6. **dispatch-table.json trailing commas** — Checkpoint removal left orphan commas. Pipeline crashed on JSON parse.
7. **`fetchTranscript` import missing** — Removed during Finnhub cleanup, still called in run-pipeline.js.
8. **`const filings` duplicate variable** — Transcript fetching code reused variable name from filing pre-processing.
9. **White screen crash** — `progress` variable used before declaration (temporal dead zone). Fixed declaration order.
10. **Stale One Pager progress on PD page** — Progress/generation-status files shared across stages. Fixed with stage filtering.

---

## Strategic Decisions

### LLM Council (April 4, 2026)
- **Decision:** Fix JavaScript pipeline (Option A), not migrate to Agent SDK (Option C)
- **Rationale:** Agent SDK runs on same API, doesn't fix 5 of 7 bugs. Deterministic + testable beats smart + unpredictable for commercial licensing.
- **Future:** Agent SDK is long-term direction for autonomous hedge fund stack. Saved to memory.
- **Council transcript:** `council/council-transcript-20260404-225543.md`

### Checkpoint Removal
- Waves run straight through, no PM pause/review gates
- PSR summary card at completion provides source visibility
- Comments post-completion via localStorage
- Plan reviewed by eng + design: `~/.claude/plans/generic-tinkering-storm.md`

### Data Gaps Removed
- Agents produced unreliable data gaps (red flags, hallucinated missing filings)
- Removed from schema, prompts, pipeline, and UI
- PSR summary card provides real observability into what was read

### Finnhub Removed
- Free tier blocked transcripts (403)
- Key discontinued by user
- All transcript fetching via Alpha Vantage with 2-key rotation

---

## Known Issues / TODOs

1. **Quality scores not in PD UI** — `validateStage()` runs and writes to `quality/pitch-deck-v4.quality.json` but no endpoint or UI wiring for PD (FS has it). Need to add endpoint + fetch in `usePitchDeck` + render `QualityBadge`.
2. **529 overloaded errors** — Transient Anthropic capacity. Can't prevent, only retry (now 2 retries with 10s/30s backoff). Hit quarterly-reader and valuation-specialist in one run.
3. **Transcript availability** — AV only has ~2-3 quarters per company. 50 calls/day with 2 keys. Cached permanently after first fetch.
4. **`events` and `prices` missing from DataPacket** — Yahoo Finance fields return null in Node environment. Not critical (agents get prices via web search).
5. **Comment carry-over to FS** — localStorage keyed by `comments:{ticker}:{stage}`. FS pipeline should read PD comments from same localStorage key. Not yet implemented.
6. **Error message string matching** — `err.message?.includes('Failed to parse structured output')` should use SDK typed exceptions. Low risk since schema simplification prevents truncation.

---

## Files Changed (key ones)

| File | What changed |
|------|-------------|
| `src/engines/aiResearch.js` | Streaming, output_config for all, repair call, retry logic |
| `src/engines/pipelineManager.js` | Parallel PSR dispatch, unconditional onWaveComplete |
| `scripts/run-pipeline.js` | Checkpoint removal, transcript fetching, section output saving |
| `src/engines/progressState.js` | Removed CHECKPOINT states, simplified timer |
| `src/schemas/reportSection.js` | Removed dataGaps/searchesPerformed, flattened tables/charts |
| `src/engines/transcripts.js` | Removed Finnhub, 2-key AV rotation, disk caching |
| `src/engines/config.js` | Removed FINNHUB_KEY, added ALPHA_VANTAGE_KEY_2 |
| `src/components/PitchDeck.jsx` | Checkpoint removal, live sections, PSR card, export buttons |
| `src/components/FullStory.jsx` | Checkpoint removal, generate button, stage filtering |
| `src/components/SectionRenderer.jsx` | String table parsing, comment button moved to bottom |
| `agents/*/config.json` | Expanded dataPacketSlice for all 6 analysis agents |
| `agents/*/prompt.md` | Removed dataGaps/searchesPerformed, flattened tables/charts |
| `agents/orchestrator/dispatch-table.json` | Removed checkpoint configs |
| `vite.config.js` | Checkpoint endpoints removed, export/PSR endpoints added |

---

## For the Full Story Implementation

The FS pipeline uses the same `run-pipeline.js` and `pipelineManager.js` infrastructure. Key differences:
- FS has 2 phases (not 3): Phase 1 (5 analysis sections) + Phase 2 (4-step adversarial debate)
- Phase 2 is sequential (bull → bear → rebuttal → judge), not parallel
- FS inherits PD findings via `pitchDeckSections` in the DataPacket
- FS `useFullStory` hook already has quality score fetching wired
- FS components already updated with checkpoint removal, generate button, stage filtering
- The debate dispatch in `pipelineManager.js` (lines ~245-305) is already implemented
- Comments should carry PD comments forward (localStorage key: `comments:{ticker}:pitchDeck`)
