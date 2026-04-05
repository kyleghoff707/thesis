# SFM Pitch Deck Pipeline Validation Report

**Date:** 2026-03-27
**Runs completed:** 3 (V1, V2, V3)
**Total development time:** ~7.5 hours (3 runs x ~2.5 hours each)
**Current quality score:** 75/100

---

## Run History

| Metric | V1 | V2 | V3 |
|--------|----|----|-----|
| Quality Score | 63 | 56 | **75** |
| Narratives (full) | 10/10 | 4/10 | **10/10** |
| Sections with citations | 9/10 | 4/10 | **10/10** |
| Total citations | ~140 | ~38 | **146** |
| Executive summary | 2,800 chars | 350 chars | **4,700+ chars** |
| Overall verdict | WATCHLIST | PASS | **WATCHLIST** |
| Transcripts consumed | 0 | 0 | **2** |
| Guru data visible | Yes | No (stub) | **Yes** |
| Quality .md generated | No | No | **Yes** |
| Red flags (total) | Rich | Brief | **55, substantive** |
| Cost (estimated API) | ~$12 | $7.05 | ~$32 (Opus PSR + CC overhead) |
| Runtime | ~2 hr | ~2 hr | ~2.5 hr |
| pitch-deck.md size | 123 KB | 7 KB | **92 KB** |
| pitch-deck.pdf | N/A | N/A | **56 pages, 276 KB** |

---

## What Went Well in V3

### 1. Narrative Collapse Fully Resolved
V2's critical failure was 6/10 sections producing "See full narrative in agent output." placeholder stubs instead of real analysis. The root cause was models budget-constraining the narrative field when too many JSON fields were required.

V3 fix: Two-pass output pattern (agents write prose narrative first, then structured JSON) plus narrative recovery in the orchestrator (if JSON narrative < 200 chars, extract prose from agent response and inject it). Result: all 10 sections have 837-1266 word narratives. Zero stubs.

### 2. Executive Summary Depth Restored
V1 had a rich 2,800-char Buffett-style narrative. V2 collapsed to a 350-char bullet list. V3's synthesis-writer prompt now requires 800+ words and the two-pass pattern ensures it's written as prose first. V3 produced a 4,700+ char executive summary covering thesis, moat, financials, risks, and valuation — the strongest of all three runs.

### 3. Verdict Conservatism Correct
V2 returned PASS for SFM at $75, which was intellectually dishonest — MOS buy range was $37-54. V3 correctly returns WATCHLIST at $78.14, with clear rationale: "great company at a price that demands patience, not action." The synthesis-writer now weights MOS and PBT more heavily than Ten Cap and Equity Bond per Rule One methodology.

### 4. Transcript Pipeline Working
V1 and V2 both had `transcriptAvailability: { count: 0 }` because `.env.local` API keys weren't loading in Node.js. V3 fixes: `.env.local` injection into Node process, Alpha Vantage as primary source (Finnhub is premium-only), explicit pre-fetch step in the orchestrator. Result: 2 transcripts consumed (Q3-FY2025, Q4-FY2025), quarterly readers cross-referenced management commentary against 10-Q filings.

### 5. PSR Integration Is Strong
All 10 analysis agents consumed and cited annual-reader and quarterly-reader findings. Examples:
- Management evaluator cited promise tracking data across 5 years
- Risk analyst referenced comp deceleration trajectory from quarterly insights
- Valuation specialist used PSR-identified ROIC trend for Equity Bond calculation
- Business analyst cited KeHE concentration escalation from annual reader

### 6. Red Flag Quality
55 total red flags across 10 sections, all substantive. Examples: "CEO 31-0 sell/buy ratio," "KeHE 52% concentration renewed through 2035," "customer bifurcation — core spending more, acquired drifting," "$34.3M AR spike (FY2024: $31M to FY2025: $65M, +111%)." Zero boilerplate ("possible risk," "some concerns").

### 7. PDF Generation
56-page Thes1s-branded PDF with charts (revenue trajectory, EPS growth, gross margin vs ROIC, FCF trajectory, OCF vs CapEx, ROIC expansion, debt elimination, buy price ranges vs current, FGR input sources, store count runway, Sprouts Brand penetration), verdict scorecard, metric gauges, sensitivity tables, and all section content with citations. First successful pitch deck PDF.

---

## What Specifically Needs to Change

### Issue 1: Citation Format Anarchy (persists across all 3 runs)

**Problem:** Two citation formats coexist. Some agents produce canonical `{id, ref, text, source}` (matching ReportSectionSchema). Others produce `{id, source, detail}` (missing `ref` and `text` fields). The critic flags every non-canonical citation as low-severity, accumulating 30+ issues.

**Which agents use which format:**
- Canonical `{id, ref, text, source}`: business-analyst (radar, simple_predictable), financial-analyst (fcf, roe_roic_debt, balance_sheet), valuation-specialist
- Non-canonical `{id, source, detail}`: competitor-evaluator (market_position, barriers_moats), management-evaluator, risk-analyst (pest)

**Impact:** Critic can't trace non-canonical citations to DataPacket fields. PDF renderer had to handle both formats. Cross-section citation aggregation is unreliable.

**What needs to change:** Enforce a single canonical format. Two options:
1. Update all agent prompts to include explicit citation examples (prompt-level fix, fragile)
2. Use structured outputs on the API to mechanically enforce the schema (architectural fix, permanent)

### Issue 2: Web Search Citation Laundering (persists across all 3 runs)

**Problem:** Agents perform web searches (53 total across V3) and incorporate findings into their narratives, but cite results with domain names or article titles instead of actual URLs. Examples:
- `"findmymoat.com / BeyondSPX Sprouts analysis"` (no URL)
- `"Grocery Dive: '8 grocery industry trends to watch in 2026' (Jan 2026)"` (no URL)
- `"Progressive Grocer: 'Sprouts Farmers Market's 2026 Growth Strategy' article"` (no URL)

The critic checks for `http` in citation sources to classify as "web" — so these register as "other" and trigger "zero web-sourced citations" flags on every section. The critic then escalates to "Agent may have fabricated search activity."

**Impact:** Every analysis section gets a high-severity search_compliance flag. Quality score drops ~10 points per section. Cannot verify whether agents actually visited the claimed sources.

**What needs to change:** Citations from web searches must include the full URL in the `source` field. The V3 prompt updates (C1/C2: require `topResultUrl`) didn't stick. Options:
1. Stronger prompt enforcement with examples showing exact URL format required
2. Post-processing step that matches search queries to citation sources
3. On the API: agent tool results include URLs automatically — require agents to pass them through

### Issue 3: searchesPerformed Format Inconsistency (persists across all 3 runs)

**Problem:** The schema defines `{query: string, resultCount: number, usedInSection: boolean}` but agents use 4 different formats:
- Canonical objects (radar, fcf, pest, valuation)
- Objects with `result` instead of `resultCount` and inline findings (market_position)
- Bare strings instead of objects (barriers_moats)
- Objects with `purpose` and `keyFindings` fields (management)

**Impact:** Programmatic search audit is unreliable. Cannot compare search behavior across runs or agents.

**What needs to change:** Structured outputs on the API would enforce the exact schema. Alternatively, the orchestrator could normalize searchesPerformed after each agent completes (post-processing fix).

### Issue 4: DataPacket Path Fabrication (persists across all 3 runs)

**Problem:** Agents cite DataPacket field paths that don't exist in the actual JSON structure:
- `DataPacket.fcf.yearly[2025]` — should be `DataPacket.financials.cashFlow.2025`
- `DataPacket.keyMetrics.2025.operating.cashConversionCycle` — doesn't exist
- `DataPacket.returnMetrics.yearly[2025]` — should be computed from `DataPacket.financials`

The agents read the full DataPacket file, find the data they need, but then guess at a citation path format that looks plausible rather than using the actual JSON keys.

**Impact:** Citation traceability breaks — the critic can't find the cited value at the claimed path. Generates high-severity issues in quality checks.

**What needs to change:** Include a "DataPacket Field Path Reference" section in each agent prompt listing the exact available top-level and second-level paths. This is a prompt-level fix that doesn't depend on API migration.

### Issue 5: Red Flags as Objects (new in V3)

**Problem:** 3 sections (market_position, barriers_moats, management) returned red flags as `{flag: "...", severity: "..."}` objects instead of plain strings. Crashed the critic (`flag.trim is not a function`). Had to fix inline by converting objects to strings before quality checks could run.

**What needs to change:** ReportSectionSchema defines `redFlags` as `z.array(z.string()).min(1)`. Agents must produce string arrays. Structured outputs on the API would enforce this. Short-term: add normalization in the orchestrator after each agent completes.

### Issue 6: Moat Types Schema Ambiguity (new in V3)

**Problem:** barriers_moats returned `moatTypes` as an array of `{type, strength, evidence, durabilityRisk}` objects instead of a dictionary. Crashed the PDF renderer which expected `{moatType: score}` dict. Had to add type-checking to handle both formats.

**What needs to change:** The competitor-evaluator prompt's `data` field documentation shows `moatTypes` as an array of objects — this is actually the correct format per the prompt. The PDF renderer assumed a dict. Fix the PDF renderer to always expect the array format (already done inline in V3). Document the canonical format.

---

## What Will Change Upon API Conversion

### Mechanically Solved by Structured Outputs
These issues disappear when the API's `output_config.format` enforces the JSON schema:

1. **Citation format** — The schema specifies `{id: number, ref: string, text: string, source: string}`. Structured outputs guarantee exactly these fields, no `detail` substitution, no missing `ref`.
2. **Red flags type** — Schema specifies `z.array(z.string()).min(1)`. Structured outputs guarantee strings, not objects.
3. **searchesPerformed format** — Schema specifies `{query: string, resultCount: number, usedInSection: boolean}`. Exact format enforced.
4. **Field completeness** — Every required field guaranteed present with correct type. No null verdicts, no missing arrays.

### Solved by Parallel Dispatch
5. **Runtime: 2.5 hours → ~30-40 minutes.** Claude Code dispatches agents sequentially (RAM constraint). The API dispatches in parallel:
   - PSR: 5 annual + 2 quarterly readers in parallel (~8-10 min on Sonnet)
   - Phase 1: business-analyst + competitor-evaluator in parallel (~5 min)
   - Phase 2: competitor-evaluator(S4) first, then financial-analyst + management-evaluator in parallel (~8 min)
   - Phase 3: risk-analyst + valuation-specialist in parallel (~5 min)
   - Synthesis: ~3 min
   - Total: ~30-35 min

### Solved by Prompt Caching
6. **Cost: ~$14 → ~$8-9 per company.** Repeated context across agents (curriculum, DataPacket, PSR findings, universal context files) is sent once and cached. Subsequent agents pay 90% less for cached input tokens. The curriculum (~5K tokens), DataPacket (~50K tokens), and PSR findings (~30K tokens) repeat across most agents — ~85K tokens cached at 90% discount.

### Solved by Direct API Tool Results
7. **Web search citation URLs.** When agents use WebSearch via the API's tool_use, the API returns actual URLs in the tool result. Agents can be required to pass these URLs into citation `source` fields. Unlike Claude Code subagents where the search tool result is ephemeral, the API tool results are structured and traceable.

### Still Requires Prompt-Level Fixes (Not Solved by API Alone)
8. **DataPacket path accuracy** — Agents need a field path reference in their prompts regardless of API or Claude Code execution. The API doesn't know which DataPacket paths are valid.
9. **Web citation attribution discipline** — Even with URLs available from tool results, agents must be prompted to include them in citations rather than paraphrasing the source. Structured outputs enforce the field exists, but not that it contains a URL vs a description.
10. **Narrative quality** — The two-pass output pattern works in V3 but may not be needed with structured outputs (the model can produce long narrative fields when the schema is explicit). Needs testing on the API.

---

## Recommended Next Steps

1. **New GSD milestone** combining compliance fixes + API migration (they're intertwined)
2. **Research phase:** Claude API structured outputs, prompt caching, parallel dispatch patterns, tool_use for web search
3. **Phase 1:** Build `aiResearch.js` — direct API client with parallel dispatch, prompt caching, structured outputs
4. **Phase 2:** Migrate pitch deck pipeline from SKILL.md orchestration to `aiResearch.js`
5. **Phase 3:** Compliance fixes that require prompt-level changes (DataPacket path reference, web citation URLs)
6. **Phase 4:** Validation run on SFM + at least 1 other ticker to confirm generalization

Target: pitch deck generation in 30-40 minutes at $8-12 per company with 85+ quality score.

---

## Appendix: V3 Section Scores

| # | Section | Score | Narrative | Citations | Red Flags | Searches | Pass |
|---|---------|-------|-----------|-----------|-----------|----------|------|
| 1 | Radar | 75 | 6,097 chars | 15 | 5 | 7 | No |
| 2 | Simple & Predictable | 76 | 7,146 chars | 15 | 5 | 7 | No |
| 3 | Market Position | 85 | 8,235 chars | 15 | 4 | 7 | Yes |
| 4 | Barriers & Moats | 85 | 6,639 chars | 15 | 4 | 6 | Yes |
| 5 | Free Cash Flow | 63 | 5,995 chars | 10 | 4 | 2 | No |
| 6 | Management | 78 | 8,322 chars | 16 | 4 | 7 | Yes |
| 7 | ROE/ROIC & Debt | 74 | 5,553 chars | 10 | 4 | 2 | No |
| 8 | Balance Sheet | 82 | 7,032 chars | 10 | 4 | 2 | No |
| 9 | PEST Risks | 71 | 6,078 chars | 18 | 16 | 9 | No |
| 10 | Valuation | 58 | 5,779 chars | 22 | 5 | 4 | No |

**Highest scoring:** Market Position (85), Barriers & Moats (85)
**Lowest scoring:** Valuation (58), Free Cash Flow (63)
**Most citations:** Valuation (22), PEST (18)
**Most red flags:** PEST (16)
**Most searches:** PEST (9)

Sections that fail quality are primarily due to search_compliance (no verifiable web URLs in citations) and citation path issues — NOT content quality. The narratives and analysis are strong across all 10 sections.
