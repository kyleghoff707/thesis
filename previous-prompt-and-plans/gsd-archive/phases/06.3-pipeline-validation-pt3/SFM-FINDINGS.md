# SFM Pitch Deck v2 — Quality Findings

**Date:** 2026-03-27
**Context:** Second SFM pitch deck run after Phase 6.2 pipeline hardening + two quick fixes (web search schema enforcement, quality report formatter). Compared against pre-fix run saved at `~/Desktop/SFM-pitch-deck-before/`.

---

## Overall Results

| Metric | Before (v1) | After (v2) | Change |
|--------|-------------|------------|--------|
| Overall Score | 63 | 56 | -7 |
| Passed | No | No | -- |
| Total Cost | ~$12 (est) | $7.05 | -42% |
| Sections with real narratives | 10/10 | 4/10 | -60% |

The score went **down** despite fixing web search enforcement. The 4 sections that benefited massively (PEST +34, FCF +32, ROE +27, Balance +27) were offset by 6 sections that collapsed from full narratives to placeholder stubs.

---

## Issue 1: Placeholder Narratives (CRITICAL)

**6 of 10 sections** have `"See full narrative in agent output."` instead of actual content:

| Section | Agent | Narrative Length | Score |
|---------|-------|-----------------|-------|
| Radar | business-analyst (Sonnet) | 35 chars | 28 |
| Simple & Predictable | business-analyst (Sonnet) | 35 chars | 31 |
| Market Position | competitor-evaluator (Sonnet) | 22 chars | 35 |
| Barriers & Moats | competitor-evaluator (Sonnet) | 22 chars | 35 |
| Management | management-evaluator (Sonnet) | 22 chars | 40 |
| Valuation | valuation-specialist (Opus) | 55 chars | 41 |

**Working sections** (all have 2,800-7,350 char narratives):

| Section | Agent | Narrative Length | Score |
|---------|-------|-----------------|-------|
| FCF | financial-analyst (Sonnet) | 3,371 chars | 91 |
| ROE/ROIC/Debt | financial-analyst (Sonnet) | 2,870 chars | 88 |
| Balance Sheet | financial-analyst (Sonnet) | 3,244 chars | 88 |
| PEST | risk-analyst (Opus) | 7,350 chars | 84 |

**Key observation:** The financial-analyst produces 3 sections in one call and all 3 have full narratives. The risk-analyst produces 1 section with a full narrative. All other agents produce placeholder stubs. This is NOT a model issue (Sonnet financial-analyst works fine; Opus valuation-specialist is broken). It's likely a prompt or pipeline issue in how section JSON is assembled from agent output.

**Possible causes:**
1. Agent prompts for business-analyst, competitor-evaluator, management-evaluator, valuation-specialist may have the narrative field defined as optional or the JSON schema example shows a short placeholder
2. The pipeline may be extracting only structured fields (verdict, summary, data, redFlags) and ignoring the narrative block
3. The synthesis-writer may be consuming the narrative and replacing it with a pointer

---

## Issue 2: Web Search Enforcement Still Incomplete

The schema fix we applied to 3 agents (valuation-specialist, risk-analyst, management-evaluator) only partially worked:

| Agent | Fixed? | searchesPerformed | Citations | Web Citations |
|-------|--------|-------------------|-----------|---------------|
| risk-analyst (PEST) | Yes | 16 | 16 | Yes (URLs) |
| financial-analyst (FCF/ROE/BS) | No (wasn't broken) | 2-4 | 7-8 | Some |
| business-analyst (Radar/S&P) | No | 1-2 | 0 | None |
| competitor-evaluator (Mkt/Moats) | No | 1-2 | 0 | None |
| management-evaluator | Yes | 1 | 0 | None |
| valuation-specialist | Yes | 3 | 0 | None |

**Two agents still need the schema fix:** business-analyst, competitor-evaluator.

**Two agents we fixed are still broken:** management-evaluator and valuation-specialist report searches but produce 0 citations. Searches may be fabricated (critic flags this as medium-severity). The searchesPerformed data looks suspiciously clean (`resultCount: 10` for every search).

---

## Issue 3: Non-Canonical Citation Format

Every working section uses a non-canonical citation format:

```json
// What agents produce (non-canonical):
{ "id": 1, "source": "SFM 10-K FY2025", "detail": "Revenue $8.81B..." }

// What the schema expects (canonical):
{ "id": "C1", "ref": "SFM 10-K FY2025", "text": "Revenue $8.81B...", "source": "SEC EDGAR" }
```

All 16 PEST citations, all 8 FCF citations, etc. use `{id, source, detail}` instead of `{id, ref, text, source}`. The critic flags each one as low-severity but they accumulate (16 low-severity issues just from PEST). The agents aren't following the canonical citation schema defined in the report section schema.

---

## Issue 4: Fabricated Search Activity

The critic flags a pattern across 6 sections: `searchesPerformed` has entries but `citations` is empty. Example from radar:

```json
"searchesPerformed": [
  {"query": "SFM 2026 earnings news", "resultCount": 10, "usedInSection": true},
  {"query": "organic grocery industry trends 2025 2026", "resultCount": 10, "usedInSection": true}
],
"citations": []
```

Every search reports exactly `resultCount: 10` and `usedInSection: true` — but no citations appear. This looks like the model is generating the `searchesPerformed` array to satisfy the schema requirement without actually performing searches or using results.

**This suggests:** Adding the field to the schema is necessary but not sufficient. The agents need either:
- Actual web search tool access during generation, OR
- Stronger prompt language that the critic can verify (e.g., citations must include URLs from searches)

---

## Issue 5: Red Flag Brevity

Some red flags are too brief to be useful:

- Radar: `"Zero guru ownership"` (19 chars) — flagged by critic
- Several others are one-liners without context

The v1 run had much richer red flags with full sentences explaining the concern.

---

## Issue 6: Missing Quality .md Report

The `.quality.md` formatter wasn't invoked during this run — only `.quality.json` exists. The SKILL.md was updated to call `formatQualityReport` but the pipeline may not have picked up the change, or the formatter step failed silently.

---

## Before vs After Comparison

| Section | v1 Score | v2 Score | Change | v1 Narrative | v2 Narrative |
|---------|----------|----------|--------|-------------|-------------|
| Radar | 77 | 28 | -49 | Full (5,342 chars) | Placeholder (35 chars) |
| Simple & Predictable | 76 | 31 | -45 | Full | Placeholder (35 chars) |
| Market Position | 77 | 35 | -42 | Full | Placeholder (22 chars) |
| Barriers & Moats | 80 | 35 | -45 | Full | Placeholder (22 chars) |
| FCF | 59 | 91 | +32 | Full | Full (3,371 chars) |
| Management | 42 | 40 | -2 | Full (13,463 chars) | Placeholder (22 chars) |
| ROE/ROIC/Debt | 61 | 88 | +27 | Full | Full (2,870 chars) |
| Balance Sheet | 61 | 88 | +27 | Full | Full (3,244 chars) |
| PEST | 50 | 84 | +34 | Full (28,949 chars) | Full (7,350 chars) |
| Valuation | 47 | 41 | -6 | Full (7,439 chars) | Placeholder (55 chars) |

**Pattern:** The sections that improved are all from agents that produce full narratives in the JSON. The sections that regressed all have placeholder narratives. The v1 run somehow got full narratives from all agents — what changed between runs?

---

## Cost Tracking (New — budget.json)

| Agent | Model | Input Tokens | Output Tokens | Cost |
|-------|-------|-------------|---------------|------|
| annual-reader (PSR) | Opus | 125K | 12.5K | $2.81 |
| quarterly-reader (PSR) | Opus | 100K | 10K | $2.25 |
| business-analyst | Sonnet | 15K | 3.75K | $0.10 |
| competitor-evaluator (×2) | Sonnet | 26.25K | 6K | $0.17 |
| financial-analyst | Sonnet | 22.5K | 3.75K | $0.12 |
| management-evaluator | Sonnet | 18.75K | 3.75K | $0.11 |
| risk-analyst (PEST) | Opus | 17.5K | 3.75K | $0.54 |
| valuation-specialist | Opus | 17.5K | 3K | $0.49 |
| synthesis-writer | Opus | 20K | 2K | $0.45 |
| **TOTAL** | | **362.5K** | **48.5K** | **$7.05** |

PSR (annual + quarterly readers) accounts for **$5.06 of $7.05 total** (72% of cost). Well within the $8-12 target.

---

## Prioritized Fix List

### P0 — Must Fix (blocks report usability)
1. **Placeholder narrative bug** — 6 agents producing stubs instead of full narratives. Root cause investigation needed. Compare v1 vs v2 pipeline execution to find what changed.

### P1 — Should Fix (quality score impact)
2. **Web search enforcement for remaining agents** — Add searchesPerformed schema to business-analyst and competitor-evaluator prompts
3. **Search fabrication detection** — Agents generating fake searchesPerformed to satisfy schema. Need either real tool access or stronger verification
4. **Canonical citation format** — All agents use {id, source, detail} instead of {id, ref, text, source}. Either update the schema to match what agents produce, or update all agent prompts to match the schema.

### P2 — Nice to Fix (polish)
5. **Quality .md generation** — Ensure formatQualityReport runs at end of pipeline
6. **Red flag minimum length** — Enforce minimum char count or sentence requirement
7. **Cost tracking** — budget.json is new and useful; surface it in the quality report

---

## Open Questions for User

1. The v1 narratives were much longer (management had 13,463 chars, PEST had 28,949 chars). v2 PEST is 7,350 chars. Is the v2 conciseness an improvement or a regression? The pitch-deck.md itself reads tighter and more actionable.
2. Should we standardize citations to what agents actually produce ({id, source, detail}) rather than fighting for the canonical format?
3. The pitch-deck.md is good despite the JSON issues — should the quality system score the .md output instead of (or in addition to) the section JSON?
