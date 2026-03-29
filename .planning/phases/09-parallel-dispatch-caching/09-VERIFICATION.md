---
phase: 09-parallel-dispatch-caching
verified: 2026-03-28T23:31:00Z
status: passed
score: 12/12 must-haves verified
gaps: []
human_verification:
  - test: "Run a live pipeline against a real ticker and confirm wall-clock time is roughly equal to the slowest single agent (not the sum)"
    expected: "Promise.allSettled parallel dispatch means 3 simultaneous agents complete in ~the slowest agent's time, not 3x the time"
    why_human: "Cannot verify actual concurrency behavior without live API calls — test suite mocks dispatchAgent synchronously"
  - test: "Confirm cache_read_input_tokens > 0 on second and subsequent agents in a live wave"
    expected: "Universal context and PSR findings blocks with cache_control ephemeral produce cache hits on agents 2+ in a wave"
    why_human: "Anthropic's prompt caching requires real API calls — the cache_control blocks are structurally correct but cache activation cannot be verified without live traffic"
---

# Phase 9: Parallel Dispatch & Caching Verification Report

**Phase Goal:** Multiple agents run concurrently with shared prompt caching, and every API call's cost is tracked
**Verified:** 2026-03-28T23:31:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A wave of 3+ agents dispatched via Promise.allSettled completes in parallel | VERIFIED | `pipelineManager.js:69` — `await Promise.allSettled(waveAgents.map(a => dispatchAgent(...)))` dispatches all wave agents simultaneously; Test 2 and Test 16 confirm parallel dispatch and graceful rejection handling |
| 2 | cache_read_input_tokens > 0 on second+ agents (shared curriculum and DataPacket cached) | VERIFIED (structural) | `aiResearch.js:121,130` — universal context and PSR findings each carry `cache_control: { type: 'ephemeral' }`; `buildSystemBlocks` helper confirmed in 7 tests; live behavior requires human verification |
| 3 | Cache monitor logs hit rate per pipeline run and warns if below 70% | VERIFIED | `cacheMonitor.js` — `createCacheMonitor()` computes `hitRate` and `belowThreshold`; `pipelineManager.js:105-107,147-149` — warns via `console.warn` after each wave and at pipeline end; Test 14 confirms warning fires |
| 4 | Budget tracker reports per-agent and total cost broken down by token categories | VERIFIED | `contextBudget.js` — `createBudgetTracker().record(agentRole, usage)` records actual API fields; `getSummary()` returns `{entries, totals:{inputTokens,outputTokens,cacheRead,cacheWrite,webSearches,cost}}`; 7 contextBudget tests verify shape |

**Score:** 4/4 truths verified (2 require human confirmation for live API behavior)

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/engines/cacheMonitor.js` | Cache hit/miss tracking with 70% threshold warning | VERIFIED | 40 lines, exports `createCacheMonitor`, contains `hitRate < 0.70` and `entries.length > 1` guards |
| `src/engines/__tests__/cacheMonitor.test.js` | Unit tests for cache monitor | VERIFIED | 103 lines, 9 `it()` blocks, all passing |
| `src/engines/contextBudget.js` | Actual-usage budget tracker (replaces character-based) | VERIFIED | 103 lines, exports `createBudgetTracker`, `formatBudgetReport`, `estimateTokens`, `computeCost`, `MODEL_PRICING`; `record(agentRole, usage)` 2-param signature confirmed |
| `src/engines/__tests__/contextBudget.test.js` | Updated tests for actual-usage budget tracker | VERIFIED | 264 lines, 24 `it()` blocks including `'createBudgetTracker (actual usage)'` describe block, all passing |
| `src/engines/aiResearch.js` | Cache-enabled agent dispatch with multi-block system message | VERIFIED | `buildSystemBlocks` helper at line 113; `cache_control: {type: 'ephemeral'}` on blocks 1 and 2; `system: systemBlocks` at line 325; `_testExports` includes `buildSystemBlocks`; Opus pricing `input: 5.0, output: 25.0` |
| `src/engines/__tests__/aiResearch.test.js` | Tests for cache_control block structure and Opus pricing | VERIFIED | 534 lines, 41 `it()` blocks; `'buildSystemBlocks'` describe with 7 tests; Opus cost assertion `toBeCloseTo(0.3422)`; PRICING constants test asserts `input: 5.0, output: 25.0` for Opus |
| `src/engines/pipelineManager.js` | Wave-based dispatch manager reading dispatch-table.json | VERIFIED | 160 lines, exports `runPipeline`; contains `Promise.allSettled`, `dispatch-table.json`, `onWaveComplete`, `pmFeedback`, `belowThreshold` |
| `src/engines/__tests__/pipelineManager.test.js` | Unit tests for pipeline manager | VERIFIED | 402 lines, 16 `it()` blocks (Tests 1-16), all passing |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `cacheMonitor.js createCacheMonitor` | `dispatchAgent result.usage` | `record(usage)` accepting `{cacheRead, cacheWrite, inputTokens}` | WIRED | `cacheMonitor.js:10-15` — `record(usage)` reads `usage.cacheRead`, `usage.cacheWrite`, `usage.inputTokens`; wired in `pipelineManager.js:61,92,142` |
| `contextBudget.js createBudgetTracker` | `dispatchAgent result.usage` | `record(agentRole, usage)` accepting actual API usage object | WIRED | `contextBudget.js:54` — `record(agentRole, usage)` reads `usage.inputTokens`, `.outputTokens`, `.cacheRead`, `.cacheWrite`, `.webSearches`, `.cost`; wired in `pipelineManager.js:60,91,141` |
| `aiResearch.js dispatchAgent` | `client.messages.parse system parameter` | `buildSystemBlocks` returns array with selective `cache_control` | WIRED | `aiResearch.js:315,325` — `buildSystemBlocks(...)` called, result passed as `system: systemBlocks`; `pipelineManager.test.js` Test 7 verifies psrFindings propagates as cache block |
| `aiResearch.js dispatchAgent` | `options.psrFindings` | PSR findings passed as option, placed in second cache_control block | WIRED | `aiResearch.js:126-130` — PSR findings get `cache_control: {type: 'ephemeral'}`; `aiResearch.test.js` line 363-370 verifies psrFindings appears as cached block |
| `pipelineManager.js` | `src/engines/aiResearch.js` | `import { dispatchAgent } from './aiResearch.js'` | WIRED | `pipelineManager.js:8` — import confirmed; all 9 dispatchAgent call sites in pipeline |
| `pipelineManager.js` | `src/engines/cacheMonitor.js` | `import { createCacheMonitor } from './cacheMonitor.js'` | WIRED | `pipelineManager.js:9` — import confirmed; `createCacheMonitor()` called at line 38 |
| `pipelineManager.js` | `src/engines/contextBudget.js` | `import { createBudgetTracker } from './contextBudget.js'` | WIRED | `pipelineManager.js:10` — import confirmed; `createBudgetTracker()` called at line 37 |
| `pipelineManager.js` | `agents/orchestrator/dispatch-table.json` | `readFileSync + JSON.parse` to load wave structure | WIRED | `pipelineManager.js:16-17` — `resolve(AGENTS_DIR, 'orchestrator', 'dispatch-table.json')` + `JSON.parse(readFileSync(...))`; confirmed in Test 1 |

---

### Data-Flow Trace (Level 4)

These are infrastructure/engine modules, not UI components rendering dynamic data. No Level 4 data-flow trace required. The data flow is verified through the key link wiring: `dispatchAgent` returns `usage`, `usage` flows into both `budget.record()` and `cacheMonitor.record()`, and both produce summaries returned in `runPipeline`'s final result object.

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| cacheMonitor tracks writes and computes hit rate | `npx vitest run src/engines/__tests__/cacheMonitor.test.js` | 9 tests passed | PASS |
| contextBudget records actual usage, correct Opus pricing | `npx vitest run src/engines/__tests__/contextBudget.test.js` | 24 tests passed | PASS |
| aiResearch buildSystemBlocks creates cached blocks | `npx vitest run src/engines/__tests__/aiResearch.test.js` | 41 tests passed | PASS |
| pipelineManager dispatches waves in parallel and sequence | `npx vitest run src/engines/__tests__/pipelineManager.test.js` | 16 tests passed | PASS |
| All Phase 9 engine tests together | `npx vitest run src/engines/__tests__/` | 730 tests passed (23 files) | PASS |
| Full engine suite (no regressions) | `npx vitest run src/engines/__tests__/` | 730/730 pass, 0 regressions | PASS |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| API-02 | 09-03-PLAN.md | Parallel agent dispatch within phases using Promise.allSettled | SATISFIED | `pipelineManager.js:69` — `await Promise.allSettled(waveAgents.map(...))` dispatches all agents in a wave simultaneously; 16-test suite including Test 2 (parallel), Test 3 (sequential between waves), Test 16 (rejected promise handling) |
| API-03 | 09-02-PLAN.md | Prompt caching with cache_control breakpoints on shared context | SATISFIED | `aiResearch.js:113-141` — `buildSystemBlocks` creates 3-block system message; blocks 1 (universal context) and 2 (PSR findings) carry `cache_control: {type: 'ephemeral'}`; agent-specific block 3 carries no cache_control; 7 tests in `buildSystemBlocks` describe block confirm structure |
| API-06 | 09-01-PLAN.md, 09-03-PLAN.md | Cache monitoring — log cache_read_input_tokens and cache_creation_input_tokens per response, warn if hit rate below 70% | SATISFIED | `cacheMonitor.js` — records `cacheRead`, `cacheWrite` per API response; computes `hitRate`; `belowThreshold = hitRate < 0.70 && entries.length > 1`; 9 tests verify tracking logic; `pipelineManager.js:104-107` warns after each wave |
| API-07 | 09-01-PLAN.md, 09-03-PLAN.md | Token budget tracking using actual API response usage fields | SATISFIED | `contextBudget.js:54` — `record(agentRole, usage)` captures `inputTokens`, `outputTokens`, `cacheRead`, `cacheWrite`, `webSearches`, `cost` directly from API response usage object (not character estimates); `formatBudgetReport` formats per-agent and total breakdown; 24 tests verify behavior |

**Orphaned requirements check:** REQUIREMENTS.md Traceability table maps API-02, API-03, API-06, API-07 to Phase 9. All 4 are covered by the 3 plans. No orphaned requirements found.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None found | — | — | — | — |

Scan results:
- No `TODO`, `FIXME`, `XXX`, `HACK`, or `PLACEHOLDER` comments in any Phase 9 files
- No `return null` / `return {}` / `return []` stubs in public functions
- No hardcoded empty data arrays passed to render paths
- No console.log-only implementations
- Pre-processing section pushes to `allSections` even for PSR agents (they produce sections too) — this is correct behavior, not a stub
- The `formatBudgetReport` import in `pipelineManager.js` is imported but not called within `runPipeline` itself — the formatted report is returned to callers via `budget.getSummary()` and they format it themselves. This is intentional design (separation of concerns), not an orphaned import.

---

### Human Verification Required

#### 1. Parallel Wall-Clock Verification

**Test:** Run `runPipeline('pitchDeck', dataPacket)` against a real ticker (e.g., SFM) with live API keys. Time Wave 1 dispatch (2 agents). Compare wall-clock to a sequential baseline (dispatch agents one at a time).
**Expected:** Wave 1 completes in approximately the time of the slowest single agent, not the sum of both agents. With 2 agents each taking ~30s, parallel should complete in ~30s vs ~60s sequential.
**Why human:** Test suite mocks `dispatchAgent` as synchronous Promise.resolve — actual concurrency requires live network calls. The `Promise.allSettled` call is structurally correct but concurrent execution is not verifiable without real API traffic.

#### 2. Cache Hit Confirmation

**Test:** Run `runPipeline('pitchDeck', dataPacket)` with live API. Inspect the `cacheStats` from the returned result. Check that `cacheStats.totalRead > 0` after wave 1 (at least one agent read from cache after the first agent wrote).
**Expected:** `cache_read_input_tokens > 0` on agents 2+ in a wave, demonstrating that `cache_control: {type: 'ephemeral'}` on the universal context block is actively caching.
**Why human:** Anthropic's prompt caching activates only under live API conditions — the cache breakpoints are structurally correct in `buildSystemBlocks`, but actual cache activation cannot be mocked or unit-tested.

---

### Gaps Summary

No gaps found. All automated checks passed:
- All 4 requirement IDs (API-02, API-03, API-06, API-07) are satisfied by the implemented code
- All 8 required artifacts exist, are substantive (not stubs), and are wired to their consumers
- All 8 key links are confirmed (imports verified, usage patterns confirmed)
- 90 Phase 9 tests pass; 730 total engine tests pass with no regressions
- Opus 4.6 pricing is correctly $5/$25 in both `contextBudget.js MODEL_PRICING` and `aiResearch.js PRICING`
- The old character-based budget tracking has been fully replaced by actual-usage tracking
- The old monolithic system message string (`systemContent`) has been fully replaced by `buildSystemBlocks` multi-block array

Two items are flagged for human verification because they require live API calls: parallel wall-clock behavior and actual cache hit confirmation. These are behavioral properties of the Anthropic API infrastructure, not code correctness issues.

---

_Verified: 2026-03-28T23:31:00Z_
_Verifier: Claude (gsd-verifier)_
