# Phase 2: Multi-Source Triangulation - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Build data collectors for FMP, SimFin, and mstarpy that fetch financial data for the 50 truth set companies, normalize it through the Phase 1 field-mapping pipeline, and feed it into a consensus engine. The consensus engine classifies every deviation as CONSENSUS_DIFF (high-confidence our bug), LIKELY_BUG (2-source agreement), METHODOLOGY_DIFF (sources disagree), or COVERAGE_GAP (all null). A root cause auto-tagger labels each deviation with a machine-readable cause. Output: `fix-recommendations.json` with a prioritized fix list for Phase 3.

This phase does NOT fix the XBRL engine — that's Phase 3. This phase identifies and classifies the problems.

</domain>

<decisions>
## Implementation Decisions

### Rate Limit Strategy
- **D-01:** Time-based disk cache with 7-day TTL for all API responses. After 7 days, re-fetch automatically to pick up new earnings data. First run uses ~150 FMP calls (50 companies × 3 statements), subsequent runs within the week use 0.
- **D-02:** Fetch all 50 companies in a single run. No incremental batching. FMP budget (250/day) allows this with 100 calls to spare.

### mstarpy Integration
- **D-03:** Pre-fetch to JSON. Run a Python script once that fetches all 50 companies and saves to `validation/data/mstarpy/` as JSON files. The JS pipeline reads cached JSON — no runtime Python dependency. Re-run the Python script when mstarpy cache expires (7 days) or when manually refreshed.
- **D-04:** Graceful degradation. If mstarpy data is missing for a ticker (scraper broke, field unavailable), triangulate with FMP + SimFin only. Never block the pipeline on mstarpy availability.

### Consensus Logic
- **D-05:** 1% tolerance for consensus agreement. If external source values are within 1% of each other, they "agree." Our engine value is then compared against the consensus value.
- **D-06:** Confidence tiers based on source count:
  - **3 sources agree, we differ → CONSENSUS_DIFF** (high confidence — fix first)
  - **2 sources agree, we differ → LIKELY_BUG** (lower confidence — investigate)
  - **Sources disagree among themselves → METHODOLOGY_DIFF** (not our bug — different definitions)
  - **All sources null → COVERAGE_GAP** (nobody has this field)
  - **Only we have data → UNIQUE_COVERAGE** (we may be right, others may not extract it)

### Root Cause Auto-Tagging
- **D-07:** Deterministic pattern matching, not AI. Rules:
  - **sign_flip:** Values same magnitude, opposite sign (our positive, consensus negative or vice versa)
  - **fy_offset:** Our value for year Y matches consensus value for year Y±1
  - **scale_error:** Values differ by exactly 1000x or 1,000,000x
  - **tag_miss:** Our engine returns null, consensus has a value
  - **derivation_error:** Our value exists but doesn't match any year's consensus — likely a formula difference
  - **unknown:** Doesn't match any pattern — needs manual investigation

### Carrying Forward from Phase 1
- **D-03 (Phase 1):** Single field-mapping.json config — extend with FMP, SimFin, mstarpy field name mappings per source
- **D-05/D-06 (Phase 1):** Console + JSON output format, per-company top 3 failures

### Claude's Discretion
- SimFin bank/insurance template field mapping details
- FMP field name mapping specifics (camelCase → canonical)
- How to structure the mstarpy Python pre-fetch script
- JSON structure for fix-recommendations.json
- Whether to use EODHD data (we have the key, but 3 sources may be sufficient)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 1 Outputs (Foundation)
- `validation/scripts/lib/fiscal-aligner.mjs` — FY alignment module (reuse for all sources)
- `validation/scripts/lib/field-mapper.mjs` — Field mapping + sign/scale transforms (extend for new sources)
- `validation/scripts/lib/comparator.mjs` — Comparison engine (extend for multi-source)
- `validation/scripts/lib/reporter.mjs` — Console + JSON reporting (extend for triangulation output)
- `validation/scripts/compare-morningstar.mjs` — Orchestrator pattern to follow
- `validation/reports/morningstar-accuracy.json` — Baseline accuracy (91.2%) for regression diffing
- `src/engines/__tests__/fixtures/morningstar/field-mapping.json` — The single field mapping config to extend

### API Documentation
- `.env.local` — API keys for FMP (`VITE_FMP_KEY`), SimFin (`VITE_SIMFIN_KEY`), EODHD (`VITE_EODHD_KEY`)
- `.planning/PROJECT.md` — API endpoints, rate limits, history depth per source

### Intel Reports (from attempts 1 & 2 — use as reference, not gospel)
- `knowledge-ref/intel-reports/ms-xbrl-normalization-research.md` — How Morningstar normalizes XBRL
- `knowledge-ref/intel-reports/edgar-taxonomy-research-report.md` — EDGAR taxonomy analysis
- `knowledge-ref/intel-reports/morningstar-complete-data-definitions.md` — Morningstar field definitions
- `knowledge-ref/intel-reports/morningstar_original_vs_restated_financials.md` — Restated vs original data
- `knowledge-ref/intel-reports/consolidated_vs_expanded_financial_statements.md` — Consolidated vs expanded
- `knowledge-ref/engineering/edgar-xbrl-taxonomy.md` — XBRL taxonomy reference

### Previous Attempt Plans
- `gstack/plans/gstack-xbrl-annual-normalization-eng-plan-20260319.md` — B1-B8 failure patterns (directly relevant to root cause tagger patterns)

### Reference Scripts (DO NOT use as-is)
- `validation/scripts/reference/test-api-sources.mjs` — Old API test (has FMP/SimFin connection code, buggy comparison)
- `validation/scripts/reference/_mstarpy_batch_tmp.py` — Old mstarpy fetch script (working but minimal)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `validation/scripts/lib/fiscal-aligner.mjs` — `resolveYearOffset()` handles FY alignment for any source. All new collectors should use this.
- `validation/scripts/lib/field-mapper.mjs` — `loadFieldMapping()` + `mapMorningstarToCanonical()` need extension for FMP/SimFin/mstarpy field names. The `scale` parameter already supports per-source scaling (1.0 for MS, 1e6 for mstarpy).
- `validation/scripts/lib/comparator.mjs` — `compareField()` + `compareCompany()` can be extended for multi-source comparison. The injectable `specialHandlers` pattern was designed for this.
- `validation/scripts/lib/reporter.mjs` — `generateConsoleReport()` + `generateJsonReport()` need extension for triangulation output (consensus classification, root cause tags).
- `validation/scripts/compare-morningstar.mjs` — Pattern for SEC fetch interceptor, disk caching, and pipeline orchestration. New orchestrator follows this pattern.
- `validation/scripts/reference/test-api-sources.mjs` — Has working FMP and SimFin API connection code (endpoints, auth headers). Extract the API call patterns, ignore the comparison logic.
- `validation/scripts/reference/_mstarpy_batch_tmp.py` — Working Python mstarpy fetch. Use as starting point for pre-fetch script.

### Established Patterns
- Pure ESM modules in `validation/scripts/lib/` with named exports
- Disk caching via `edgar-cache/` directory (same pattern for FMP/SimFin/mstarpy caches)
- SEC fetch interceptor pattern for rate-limited API calls
- Tests in `src/engines/__tests__/harness/`

### Integration Points
- New collectors go in `validation/scripts/lib/` (fmp-collector.mjs, simfin-collector.mjs)
- mstarpy pre-fetch script goes in `validation/scripts/` (fetch-mstarpy.py)
- mstarpy cached data goes in `validation/data/mstarpy/`
- Consensus engine goes in `validation/scripts/lib/consensus.mjs`
- Root cause tagger goes in `validation/scripts/lib/root-cause-tagger.mjs`
- Triangulation orchestrator goes in `validation/scripts/triangulate.mjs`
- Output goes in `validation/reports/fix-recommendations.json`

</code_context>

<specifics>
## Specific Ideas

- The existing `test-api-sources.mjs` reference script has working FMP and SimFin API call code — extract the endpoint URLs, auth patterns, and response shapes (ignore the comparison logic which was buggy)
- The `_mstarpy_batch_tmp.py` reference script is a working mstarpy fetch — use it as the starting point for the pre-fetch script, but remember we patched `security.py` to fix a region bug (exchange='XNAS')
- mstarpy returns values in millions — the field-mapper `scale` parameter is already set up for this (1e6 multiplier)
- FMP Stable API uses `fiscalYear` field (not `calendarYear`) — this aligns with Morningstar's convention
- SimFin has separate templates for banks and insurance — valuable for validating our industry overlays in Phase 3

</specifics>

<deferred>
## Deferred Ideas

- EODHD as a 4th triangulation source — we have the key but 3 external sources should be sufficient for consensus. Revisit if triangulation reveals ambiguous cases where a 4th source would help.
- AI-assisted root cause analysis — if pattern matching can't classify >20% of deviations, consider using Claude API for the ambiguous cases in a future iteration.

</deferred>

---

*Phase: 02-multi-source-triangulation*
*Context gathered: 2026-03-26*
