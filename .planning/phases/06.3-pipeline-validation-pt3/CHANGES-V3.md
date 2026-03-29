# Phase 6.3 Pipeline Hardening — V3 Changes Report

**Date:** 2026-03-27
**Session context:** Third iteration of pitch deck pipeline hardening, after two SFM runs (V1 scored 63, V2 scored 56). This document captures every issue identified, what was changed, why, and how the changes should fix the problems. Feed this to future Claude sessions for full context.

---

## Issues from User's Initial Request

The user identified these problems:

1. **Pipeline takes 2+ hours** — too slow for iteration
2. **6/10 sections have placeholder narratives** — "See full narrative in agent output" instead of real content
3. **10Q agents not reading conference call transcripts** — no verification that transcripts reach quarterly readers
4. **SFM pitch deck shows no gurus** — Phil Town and Ray Dalio should both appear
5. **Web search fabrication** — agents generating fake `searchesPerformed` entries
6. **searchesPerformed missing from 2 agents** — business-analyst and competitor-evaluator never got the fix
7. **Citation format drift** — V2 uses `{id, source, detail}` instead of canonical `{id, ref, text, source}`
8. **Executive summary too thin** — V2 is 350 chars vs V1's 2,800 chars
9. **Quality .md report not generated** — `formatQualityReport` step skipped
10. **Need a "compliance department"** — automated verification that sections aren't collapsing

---

## Root Cause Analysis (Diagnostic Findings)

### Narrative Collapse (P0 — Issues #2, #4, #8)

**Root cause:** When models produce a single JSON object with 15+ fields, they budget-constrain the `narrative` field (the longest field) to keep total output manageable. Adding `searchesPerformed` to the output schema between V1→V2 increased the number of required fields, making this worse.

**Evidence:**
- V2 `radar.json`: narrative = "See full narrative in agent output." (35 chars)
- V2 `fcf.json`: narrative = 3,371 chars (WORKS — financial-analyst produces 3 sections per call)
- V2 `pest.json`: narrative = 7,350 chars (WORKS — risk-analyst is Opus with extensive curriculum)
- The financial-analyst avoids the problem because the multi-section-per-call pattern forces comprehensive output per section
- The failure affects agents producing single-section output (business-analyst, competitor-evaluator, management-evaluator, valuation-specialist)

**Guru data was NOT actually missing:**
- DataPacket `gurus.holdings` has both Ray Dalio (171,074 shares, $13.6M) and Phil Town (129,000 shares, $10.3M, 12.4% of Rule One Fund)
- Management evaluator slice (`dp-slice-management-evaluator.json`) has the full guru data
- Management section `data.guruContext` says "Phil Town 12.4% of fund (conviction), Ray Dalio 0.05% (noise)"
- The PM couldn't see any of this because `management.json` narrative is "See full agent output." (22 chars)
- Fixing narrative collapse automatically fixes guru visibility

### Pipeline Speed (Issue #1)

**Components measured from V2:**
- DataPacket assembly: 30-60s (Yahoo timeout at 30s is the bottleneck)
- PSR agents on Opus: ~30-40 min (5 annual + 2 quarterly readers)
- 7 analyst agents sequential: ~30-40 min
- PM checkpoints: variable
- DataPacket errors: `['prices: IndexedDB not available in Node.js (after retry)', 'yahooEnrichment: Yahoo Finance timeout after 30000ms']`

### Transcript Pipeline (Issue #3)

**Root cause:** `transcriptAvailability: { count: 0, latestQuarter: null }` in the V2 DataPacket.

The `node-esm-loader.js` patches `import.meta.env` from `process.env`, but `.env.local` is a Vite convention — it is NOT automatically loaded into `process.env` in Node.js. The VITE_FINNHUB_KEY and VITE_ALPHA_VANTAGE_KEY exist in `.env.local` but the Node scripts can't see them.

**Additionally:** The quarterly reader inputs (9,557 lines across 2 batch files) contain ZERO mentions of "transcript", "earnings call", or "conference call" — even if the transcript engine worked, the orchestrator wasn't including transcript content in the quarterly reader prompts.

### Search Fabrication (Issue #5)

**Evidence:** 6 sections have `searchesPerformed` with entries like `{query: "...", resultCount: 10, usedInSection: true}` but 0 citations and stub narratives. Every search reports exactly `resultCount: 10` — suspiciously uniform. The agents are generating the array to satisfy the schema without performing actual searches.

---

## Changes Made

### File 1: `src/engines/dataExport.js`
**Change:** Removed Yahoo enrichment retry loop (lines 124-180 replaced with comment)
**Why:** Yahoo crumb auth causes 30-60s timeouts in Node.js. The data it provides (description, employees, HQ, analyst estimates) either already comes from EDGAR or can be obtained by agents via web search during their own analysis. Analyst estimates still fall back to Finviz.
**Expected impact:** Eliminates the most common DataPacket error and saves 30-60s per run.

### File 2: `agents/annual-reader/config.json`
**Change:** `"model": "opus"` → `"model": "sonnet"`
**Why:** PSR agents read filing sections and extract structured insights — a task Sonnet handles well. Opus is overkill for reading and summarizing. PSR accounts for 72% of pipeline cost ($5.06 of $7.05).
**Expected impact:** ~50-60% faster per PSR call, ~40% cost reduction for PSR phase.

### File 3: `agents/quarterly-reader/config.json`
**Change:** `"model": "opus"` → `"model": "sonnet"`
**Why:** Same as annual-reader.

### Files 4-10: All 7 analyst agent `prompt.md` files
**Changes applied to each:**

1. **Two-pass output pattern (B2):** Restructured the "Response Format" section to require:
   - PART 1: Write full narrative as regular markdown prose BEFORE any JSON
   - PART 2: Output structured JSON with narrative COPIED from Part 1
   - HARD RULE: narrative < 200 chars = automatic FAIL and re-run
   - This ensures the narrative exists in the response even if the JSON truncates it

2. **Search integrity enforcement (C1/C2):** Updated `searchesPerformed` format to require:
   - `source`: "WebSearch" (must correspond to actual tool call)
   - `topResultUrl`: actual URL visited
   - `keyFinding`: 1-sentence summary of what was found
   - Explicit anti-fabrication language: "the pipeline cross-checks searchesPerformed against citations with web URLs"

3. **Verdict conservatism (F2, synthesis-writer only):** Added instruction that MOS and PBT methods should be weighted more heavily than Ten Cap and Equity Bond. WATCHLIST is the correct verdict for "great company but price not compelling."

4. **Executive summary depth (B4, synthesis-writer only):** Added 800+ word minimum for synthesis narrative. Must include core thesis, financial highlights, moat assessment, FGR justification, buy prices, and critical red flags.

**Files modified:**
- `.claude/worktrees/agent-aa0114ca/agents/business-analyst/prompt.md`
- `.claude/worktrees/agent-aa0114ca/agents/competitor-evaluator/prompt.md`
- `.claude/worktrees/agent-aa0114ca/agents/financial-analyst/prompt.md`
- `.claude/worktrees/agent-aa0114ca/agents/management-evaluator/prompt.md`
- `.claude/worktrees/agent-aa0114ca/agents/risk-analyst/prompt.md`
- `.claude/worktrees/agent-aa0114ca/agents/valuation-specialist/prompt.md`
- `.claude/worktrees/agent-aa0114ca/agents/synthesis-writer/prompt.md`

### File 11: `.claude/skills/generate-pitch-deck/SKILL.md`
**Changes:**

1. **Narrative Recovery (B3):** Added after every agent completion validation step (Phase 1, Phase 2, Phase 3). When a section's narrative is < 200 chars:
   - Search the agent's response text above the JSON block for Part 1 narrative prose
   - If found (> 200 chars), inject it into the section JSON and re-save
   - If not found, retry the agent with an explicit instruction about the failure
   - Log narrative length for every section

2. **Transcript pre-fetch step (D2):** Added Step 2.2 between guru pre-fetch and filing preprocessing. Runs inline Node.js to fetch transcripts via `fetchTranscriptList` + `fetchTranscript`, saves to `.thes1s/reports/{TICKER}/transcripts/`.

3. **Transcript inclusion in quarterly reader input (D3):** Modified Step 3d to explicitly include transcript content in the quarterly reader prompt. If transcripts exist, they're included as full markdown blocks. If none available, a notice is included so the agent flags it as a data gap.

### File 12: `scripts/node-esm-loader.js`
**Change:** Added `.env.local` loading to the `initialize()` hook. The loader now reads `.env.local` on startup and injects `VITE_*` variables into `process.env` (without overriding existing env vars).
**Why:** The VITE_FINNHUB_KEY and VITE_ALPHA_VANTAGE_KEY were invisible to Node scripts because `.env.local` is a Vite convention not native to Node.js. This is the root cause of `transcriptAvailability: { count: 0 }`.
**Expected impact:** All `VITE_*` keys from `.env.local` are now available to Node scripts, enabling transcript fetching and any other API that uses Vite-style env vars.

---

## How These Changes Should Fix Each Problem

| Problem | Fix | Mechanism |
|---------|-----|-----------|
| **2+ hour runtime** | A1 (remove Yahoo) + A2 (Sonnet PSR) | Yahoo timeout eliminated (-60s), PSR ~3x faster (-20 min), total should drop to ~30-45 min |
| **6/10 placeholder narratives** | B2 (two-pass output) + B3 (narrative recovery) | Agents write narrative first as prose, then copy into JSON. If JSON still truncates, orchestrator extracts prose from response and injects it. Double safety net. |
| **No transcripts** | D1 (env fix) + D2 (pre-fetch) + D3 (include in prompt) | `.env.local` keys now load in Node.js. Transcripts pre-fetched and explicitly included in quarterly reader input. |
| **Guru data "missing"** | Resolved by B2/B3 | Guru data was always in the DataPacket and management section `data` field. It was invisible because the narrative was a 22-char stub. Full narratives will surface it. |
| **Search fabrication** | C1 (require URL) + C2 (integrity language) | `searchesPerformed` entries must include `topResultUrl` and `keyFinding`. Anti-fabrication language explicitly warns that the pipeline cross-checks. |
| **searchesPerformed missing** | C1 | business-analyst and competitor-evaluator now have the searchesPerformed schema and required web searches list. |
| **Citation format drift** | C2 | Standardized format requires `{id, ref, text, source, url?}`. All agents updated. |
| **Executive summary thin** | B4 + two-pass pattern | synthesis-writer prompt requires 800+ words for Pitch Deck synthesis. Two-pass pattern ensures it's written as prose first. |
| **Quality .md not generated** | E3 note in plan | Explicit step added to SKILL.md Step 13 to invoke `formatQualityReport`. |
| **Compliance department** | E1 (inline checks in SKILL.md) | Narrative length, citation count, search compliance, red flag minimums all checked after each agent completes. No separate agents needed — embedded in orchestrator validation. |

---

## What to Watch For in V3 Run

1. **Narrative lengths** — All 10 sections should have narrative > 200 chars. The 4 sections that worked in V2 (FCF, ROE, Balance Sheet, PEST) should continue working. The 6 that collapsed should now produce full narratives.

2. **Transcript availability** — Check the Step 2.2 output for transcript count. If still 0, the Finnhub API may require a premium key for SFM (try Alpha Vantage as primary).

3. **PSR quality with Sonnet** — The annual/quarterly readers are now on Sonnet instead of Opus. Quality should be equivalent for structured reading/extraction, but watch for any loss of nuance in the PSR findings.

4. **Pipeline timing** — Track each phase duration. Target: DataPacket < 30s, PSR < 18 min, Phase 1-3 < 20 min, Synthesis < 5 min.

5. **Search integrity** — Check if `searchesPerformed` entries now include actual URLs instead of fabricated `resultCount: 10` entries.

6. **Cost** — With Sonnet PSR, total should drop from $7.05 to ~$3-4. Check budget.json.

---

## Files Changed Summary

| File | Type | Location |
|------|------|----------|
| `src/engines/dataExport.js` | Engine | Main repo |
| `agents/annual-reader/config.json` | Agent config | `.claude/worktrees/agent-aa0114ca/` |
| `agents/quarterly-reader/config.json` | Agent config | `.claude/worktrees/agent-aa0114ca/` |
| `agents/business-analyst/prompt.md` | Agent prompt | `.claude/worktrees/agent-aa0114ca/` |
| `agents/competitor-evaluator/prompt.md` | Agent prompt | `.claude/worktrees/agent-aa0114ca/` |
| `agents/financial-analyst/prompt.md` | Agent prompt | `.claude/worktrees/agent-aa0114ca/` |
| `agents/management-evaluator/prompt.md` | Agent prompt | `.claude/worktrees/agent-aa0114ca/` |
| `agents/risk-analyst/prompt.md` | Agent prompt | `.claude/worktrees/agent-aa0114ca/` |
| `agents/valuation-specialist/prompt.md` | Agent prompt | `.claude/worktrees/agent-aa0114ca/` |
| `agents/synthesis-writer/prompt.md` | Agent prompt | `.claude/worktrees/agent-aa0114ca/` |
| `.claude/skills/generate-pitch-deck/SKILL.md` | Orchestrator | Main repo |
| `scripts/node-esm-loader.js` | Build tool | Main repo |

---

## Pre-Run Test Results (2026-03-27)

### DataPacket Assembly (Post Yahoo Removal)
| Ticker | Fields | Gurus | Peers | Filings | Errors | Null Fields |
|--------|--------|-------|-------|---------|--------|-------------|
| COST | 23/25 | 5 | 9 | 60 | 1 | currentPrice, prices |
| AAPL | 23/25 | 10 | 18 | 62 | 1 | currentPrice, prices |

- **No Yahoo timeout** — completed in seconds vs. 30-60s before
- Only error: `prices: IndexedDB not available in Node.js` (expected, harmless)
- `currentPrice` and `prices` are null because they came from Yahoo. Agents web-search for current price during analysis.

### Transcript Pipeline (Post .env.local Fix)
- **Finnhub**: 403 "You don't have access to this resource" — premium-only endpoint. This was the root cause of `transcriptAvailability: { count: 0 }` in V1 and V2.
- **Alpha Vantage**: Works. Tested:
  - AAPL Q1 2025: 44,648 chars (Tim Cook, Kevan Parekh earnings call)
  - SFM Q1 2025: 58,948 chars
  - SFM Q4 2024: Not found (Alpha Vantage doesn't have all quarters)
- **Fix**: SKILL.md Step 2.2 constructs quarter list from filing dates and calls `fetchTranscript()` directly, bypassing Finnhub's list. Requires `DOTENV_CONFIG_PATH=.env.local node -r dotenv/config` for API keys.
- **Note**: The `--loader` flag runs in a separate thread — `process.env` modifications there don't propagate to the main thread. That's why the `initialize()` approach didn't work. The `-r dotenv/config` preload runs in the main thread before any ESM imports.

### Node Invocation Pattern
All SKILL.md scripts that need API keys must use:
```
DOTENV_CONFIG_PATH=.env.local node -r dotenv/config --loader ./scripts/node-esm-loader.js [script]
```
Not just `node --loader ./scripts/node-esm-loader.js [script]`.

---

## Post-V3 Fix: Orchestrator Overhead (10-min → ~2-min target)

**Problem discovered:** The SKILL.md scripts run in ~30s total, but the actual pitch deck pipeline took ~10 minutes before first agent dispatch. The other Claude's timing breakdown (screenshot saved in project root) revealed:

| Step | Script Time | Wall Time | Root Cause |
|------|------------|-----------|------------|
| DataPacket | ~55s | ~3 min | Background task + polling overhead |
| Guru prefetch | <1s | ~30s | Tool call overhead |
| **Reassembly** | **~55s** | **~3 min** | **Completely unnecessary — guru data already cached** |
| Transcripts | ~15s | ~45s | Tool call overhead |
| Filing preprocess | <1s | ~30s | Tool call overhead |
| Quality checkpoint | <1s | ~30s | Tool call overhead |

**Fixes applied:**
1. **Removed redundant reassembly** (Step 2.1): SKILL.md was running `assemble-data.js` a SECOND time after guru prefetch "to pick up cached guru data." But the DataPacket already includes guru data via `loadCachedPortfolios()`. This wasted ~3 min.
2. **Consolidated Steps 2.2 + 2.5 + 2.6** into a single bash invocation. Each separate `node` command was adding ~15-30s of tool call overhead (bash→Node startup→script). Merging 3 calls into 1 saves ~60s.

**Expected improvement:** ~10 min → ~2-3 min for pre-agent pipeline (1 DataPacket call + 1 guru prefetch + 1 combined transcripts/filings/checkpoint call).

---

## Deferred Work

- **Section-level re-run skill (A3):** Planned but not implemented. Would allow running individual sections without the full pipeline. Create `.claude/skills/generate-section/SKILL.md` when iteration speed becomes the bottleneck again.
- **Separate compliance agent layer:** Decided against this — inline checks in the orchestrator are faster and simpler. If the inline checks prove insufficient, revisit.
- **Quality .md generation fix:** The step is documented in the plan but the actual code invocation needs to be tested in the next run to confirm `formatQualityReport` is called.
