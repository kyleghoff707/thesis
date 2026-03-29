# SFM Pitch Deck: V1 vs V2 Side-by-Side Comparison

**Purpose:** Reference document for future Claude sessions. Describes exactly what improved and what regressed between the two SFM pitch deck runs, so the next session can target fixes precisely.

**V1 location:** `~/Desktop/SFM-pitch-deck-V1/`
**V2 location:** `~/Desktop/SFM-pitch-deck-V2/`
**Changes between runs:** Added `searchesPerformed` to JSON output schema for valuation-specialist, risk-analyst, management-evaluator prompts. Added searchesPerformed to SKILL.md pipeline validation. Added canonical citation guidance to management-evaluator.

---

## Overall Metrics

| Metric | V1 | V2 | Verdict |
|--------|----|----|---------|
| Overall Quality Score | 63 | 56 | REGRESSED |
| pitch-deck.md size | 123,495 chars (1,181 lines) | 6,988 chars (164 lines) | REGRESSED (content loss) |
| pitch-deck.json size | 269,959 chars | 117,879 chars | REGRESSED |
| Sections with full narratives | 10/10 | 4/10 | REGRESSED |
| Sections with citations | 9/10 | 4/10 | REGRESSED |
| Cost | ~$12 (est) | $7.05 | IMPROVED |
| Budget tracking | None | budget.json | IMPROVED |
| Executive summary | 2,800+ chars, rich narrative | 350 chars, bullet-point style | MIXED (tighter but lost depth) |
| Verdict | WATCHLIST | PASS | DIFFERENT (V1 more conservative) |

---

## Section-by-Section Comparison

| # | Section | Agent | V1 Score | V2 Score | Change | V1 Narrative | V2 Narrative | V1 Citations | V2 Citations |
|---|---------|-------|----------|----------|--------|-------------|-------------|-------------|-------------|
| 1 | Radar | business-analyst | 77 | 28 | **-49** | 5,342 chars | 35 chars (stub) | 10 | 0 |
| 2 | Simple & Predictable | business-analyst | 76 | 31 | **-45** | 7,585 chars | 35 chars (stub) | 13 (est) | 0 |
| 3 | Market Position | competitor-evaluator | 77 | 35 | **-42** | 13,485 chars | 22 chars (stub) | 21 | 0 |
| 4 | Barriers & Moats | competitor-evaluator | 80 | 35 | **-45** | 13,546 chars | 22 chars (stub) | 15 | 0 |
| 5 | FCF | financial-analyst | 59 | 91 | **+32** | 5,791 chars | 3,371 chars | 18 | 8 |
| 6 | Management | management-evaluator | 42 | 40 | **-2** | 13,463 chars | 22 chars (stub) | 7 | 0 |
| 7 | ROE/ROIC/Debt | financial-analyst | 61 | 88 | **+27** | 5,920 chars | 2,870 chars | 16 | 7 |
| 8 | Balance Sheet | financial-analyst | 61 | 88 | **+27** | 7,124 chars | 3,244 chars | 16 | 7 |
| 9 | PEST | risk-analyst | 50 | 84 | **+34** | 28,949 chars | 7,350 chars | 24 | 16 |
| 10 | Valuation | valuation-specialist | 47 | 41 | **-6** | 7,439 chars | 55 chars (stub) | 0 | 0 |

---

## What V2 Got RIGHT (preserve these behaviors)

### 1. PEST Section — Massive Improvement (50 → 84)
- V1: Zero web searches, zero web citations, relied entirely on DataPacket/PSR
- V2: 16 web searches, 16 citations with real URLs (Cornell GLP-1 study, FDA data, Mordor Intelligence), 7,350-char narrative
- The `searchesPerformed` schema fix worked perfectly for risk-analyst
- PEST is now the model section — every other agent should emulate this behavior

### 2. Financial-Analyst Sections — Big Jump (59-61 → 88-91)
- FCF, ROE/ROIC, Balance Sheet all jumped 27-32 points
- Full narratives (2,870-3,371 chars), real citations (7-8 each), searchesPerformed present
- These sections were NOT agents we modified — financial-analyst was already working well, but now scores higher because its citations are better structured
- financial-analyst produces 3 sections in one call — all work. This multi-section-per-call pattern seems more reliable than one-section-per-call

### 3. Cost Reduction ($12 → $7.05)
- PSR (annual + quarterly readers) = $5.06 (72% of total)
- All 8 analyst agents combined = $1.99
- Well within the $8-12 target ceiling
- New budget.json provides full per-agent cost transparency

### 4. pitch-deck.md Structure
- V2 has a cleaner structure: Investment Thesis → Executive Summary → Phase 1/2/3 → FGR → Buy Decision Framework
- Buy Decision Framework with tiered price levels (Full Position $60, Starter $75, Walk Away $100+) is more actionable than V1
- Section verdicts are concise and standardized (all "PASS | HIGH")

### 5. searchesPerformed Schema
- All 10 sections now report `searchesPerformed` (V1 had it missing from 4 sections)
- Format is structured JSON: `{query, resultCount, usedInSection}`
- The critic can now audit search compliance for every section

---

## What V2 Got WRONG (must fix)

### 1. Placeholder Narratives — 6 of 10 Sections (CRITICAL)
**Symptom:** Six sections have `"See full narrative in agent output."` instead of real content.
**Affected agents:** business-analyst, competitor-evaluator, management-evaluator, valuation-specialist
**NOT affected:** financial-analyst (3 sections), risk-analyst (1 section)
**V1 had full narratives for ALL sections.** Something changed between runs.

**Evidence that this is a pipeline issue, not a model issue:**
- financial-analyst (Sonnet) produces 3 sections with full narratives
- management-evaluator (Sonnet) produces a stub — same model, different behavior
- valuation-specialist (Opus) produces a stub — even the most capable model fails
- V1 used the same agents and got full narratives

**Possible root cause:** The SKILL.md pipeline may have changed how it extracts narrative from agent responses. Or the synthesis-writer is consuming narratives and replacing them with pointers.

### 2. Empty Citations on 6 Sections
**Symptom:** Sections with placeholder narratives also have 0 citations.
**V1:** radar had 10 citations, management had 7, market_position had 21
**V2:** All three have 0

This is likely the same root cause as the placeholder narrative issue — the section JSON isn't being populated from the agent's actual output.

### 3. Fabricated searchesPerformed
**Symptom:** 6 sections report `searchesPerformed` with entries like `{query: "...", resultCount: 10, usedInSection: true}` but have 0 citations and stub narratives.
**V1 format:** Descriptive strings like `"SEC EDGAR DEF 14A proxy statement for SFM — April 2025"`
**V2 format:** Structured but suspicious: every search has exactly `resultCount: 10`

The agents are generating `searchesPerformed` to satisfy the schema but without performing actual searches. The critic catches this (`"reports N searches but has zero web citations"`) but can't block it.

### 4. Citation Format Regression
**V1 canonical format:** `{id: "C1", ref: "SFM 10-K FY2025", text: "477 stores...", source: "SEC EDGAR"}`
**V2 non-canonical format:** `{id: 1, source: "SFM 10-K FY2025", detail: "Revenue $8.81B..."}`

V2 citations use `{id, source, detail}` with optional `url` instead of `{id, ref, text, source}`. Every V2 citation gets flagged as "non-canonical format" (low severity). Either:
- Update agent prompts to use canonical format, OR
- Update the schema/critic to accept the V2 format as canonical

### 5. Executive Summary Lost Depth
**V1:** 2,800+ char narrative — rich, conversational, covers GLP-1 risk thesis, comp deceleration analysis, moat assessment, management PSA vesting story, full valuation breakdown with specific buy prices
**V2:** ~350 char bullet-point summary — hits the key numbers but reads like cliff notes

V1's executive summary is what a PM would actually want to read. V2's is a table of contents.

### 6. Verdict Difference (WATCHLIST vs PASS)
**V1 verdict: WATCHLIST** — "the price is not yet compelling by the two methods that matter most"
**V2 verdict: PASS** — "stock trades inside the composite buy range after a 60% decline"

V1 was more conservative and intellectually honest — the MOS and PBT methods both said the stock was overpriced, which should dominate. V2's PASS with "$75 starter position" is less disciplined. This may reflect different synthesis-writer behavior or different input data.

### 7. Missing quality.md
The `formatQualityReport` step didn't run — only `.quality.json` exists, not `.quality.md`. The SKILL.md was updated but the pipeline may not have picked up the change.

---

## Format Comparison: searchesPerformed

| Version | Format | Example |
|---------|--------|---------|
| V1 | Descriptive strings | `"SEC EDGAR DEF 14A proxy statement for SFM — April 2025 (FY2024)"` |
| V2 | Structured JSON | `{"query": "SFM 2026 earnings news", "resultCount": 10, "usedInSection": true}` |

V2 format is better for machine parsing. V1 format is better for human auditing and harder to fabricate. Ideal: V2 structured format with V1-style evidence trail (which URLs were visited, what was extracted).

---

## Format Comparison: Citations

| Version | Format | Fields |
|---------|--------|--------|
| V1 (canonical) | `{id: "C1", ref: "...", text: "...", source: "..."}` | String ID, ref=label, text=excerpt, source=origin |
| V2 (non-canonical) | `{id: 1, source: "...", detail: "..."}` | Number ID, source=label, detail=excerpt, optional url |

V1 is what the ReportSectionSchema and critic expect. V2 is what agents naturally produce. Need to align one way or the other.

---

## Summary: What to Tell Future Claude

> **V2 fixed the search compliance problem for 4 sections** (PEST, FCF, ROE, Balance Sheet all jumped 27-34 points) **but introduced a critical narrative regression in 6 sections.** The narrative regression is the #1 priority — without full narratives, the quality score drops and the pitch-deck.md loses its depth.
>
> **Preserve:** PEST agent behavior (16 searches, 16 citations, 7K narrative), financial-analyst multi-section pattern, cost tracking, Buy Decision Framework structure, structured searchesPerformed format.
>
> **Fix:** Placeholder narrative bug (6 sections), empty citations on stub sections, fabricated searchesPerformed detection, citation format alignment, executive summary depth, quality.md generation step.
>
> **Investigate:** Why V1 got full narratives from all agents but V2 didn't. The agents, models, and prompts are nearly identical — something in the pipeline extraction or synthesis step changed.

---

## Files for Reference

| File | V1 Path | V2 Path |
|------|---------|---------|
| Pitch deck markdown | `~/Desktop/SFM-pitch-deck-V1/pitch-deck.md` | `~/Desktop/SFM-pitch-deck-V2/pitch-deck.md` |
| Pitch deck JSON | `~/Desktop/SFM-pitch-deck-V1/pitch-deck.json` | `~/Desktop/SFM-pitch-deck-V2/pitch-deck.json` |
| Quality JSON | `~/Desktop/SFM-pitch-deck-V1/quality/pitch-deck.quality.json` | `~/Desktop/SFM-pitch-deck-V2/pitch-deck.quality.json` |
| Section JSONs | `~/Desktop/SFM-pitch-deck-V1/sections/` | `~/Desktop/SFM-pitch-deck-V2/sections/` |
| Budget | N/A | `~/Desktop/SFM-pitch-deck-V2/budget.json` |
| Findings doc | `.planning/phases/06.3-pipeline-validation-pt3/SFM-FINDINGS.md` | |
