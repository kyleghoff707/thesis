# Phase 1: Comparison Harness - Context

**Gathered:** 2026-03-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Build an all-JavaScript comparison pipeline that produces trustworthy accuracy scores for the 50-company Morningstar truth set. Correct fiscal year alignment, sign conventions, scale normalization, and field mapping. The harness must reproduce the known ~86.4% baseline from Attempt #2 to confirm it measures the same thing.

This phase does NOT add FMP/SimFin/mstarpy data collection — that's Phase 2. This phase only compares our XBRL engine output against the existing Morningstar CSV truth set.

</domain>

<decisions>
## Implementation Decisions

### Existing Scripts
- **D-01:** Old scripts (test-api-sources.mjs, batch-api-comparison.mjs, _mstarpy_batch_tmp.py) copied to `validation/scripts/reference/` as reference only. Build the new pipeline from scratch — old scripts had structural issues (mixed Python/JS, buggy FY alignment, incomplete field mapping). Use them to understand what was tried and what failed.

### Fiscal Year Strategy
- **D-02:** Claude's Discretion — choose the best FY alignment approach based on existing codebase. The EDGAR `entityFiscalYearEnd` field from CompanyFacts is available and should be the primary resolver. The approach must handle all 9 non-December FY companies in the truth set (LULU, NVDA, NKE, COST, AAPL, etc.) correctly.

### Field Mapping Design
- **D-03:** Single JSON config file (`field-mapping.json`) mapping all source field names to Thes1s canonical names. Include sign multipliers and tolerance tiers per field. Human-readable, git-diffable. One file to maintain.
- **D-04:** Claude's Discretion on the 588 unmapped Morningstar fields — categorize and recommend which are relevant to Rule One scoring. Focus on the 87 already-mapped fields for Phase 1; expand only if analysis shows they matter.

### Output Format
- **D-05:** Console summary + JSON detail. Clean console output showing overall accuracy %, top failures, and per-company scores. Detailed JSON file for drilling into specific field-level results.
- **D-06:** Per-company breakdown shows company score + top 3 failure fields. Not full field-by-field dumps. Keep output scannable for a non-programmer.

### Claude's Discretion
- FY alignment implementation approach (D-02)
- Unmapped field categorization and mapping priority (D-04)
- All technical implementation details (architecture, module structure, error handling)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Previous Attempt Documentation
- `gstack/plans/gstack-xbrl-annual-normalization-eng-plan-20260319.md` — Attempt #2 eng plan with B1-B8 results, 86.4% final accuracy, failure pattern breakdown
- `gstack/plans/gstack-xbrl-engine-strategy-eng-plan-20260318.md` — Three-layer XBRL engine strategy
- `gstack/plans/gstack-xbrl-morningstar-engine-ceo-plan-20260318.md` — CEO-level strategy for MS parity

### Morningstar Truth Set
- `knowledge/morningstar-financial-statements/` — 50 companies, CSV files (Income Statement, Balance Sheet, Cash Flow — annual restated)

### Existing Engine Code
- `src/engines/edgarFinancials.js` — Current XBRL engine (the engine being compared)
- `src/engines/edgar.js` — Core EDGAR API functions (entityFiscalYearEnd lives in CompanyFacts)
- `src/engines/config.js` — API keys and environment variables

### Research
- `.planning/research/FEATURES.md` — Detailed accuracy gap analysis, field coverage categories, MVP recommendation
- `.planning/research/PITFALLS.md` — Known pitfalls for XBRL normalization comparison
- `.planning/research/ARCHITECTURE.md` — Comparison pipeline architecture patterns

### Reference Scripts (DO NOT use as-is, reference only)
- `validation/scripts/reference/test-api-sources.mjs` — Old API test script (has known bugs — read for context on what was tried)
- `validation/scripts/reference/batch-api-comparison.mjs` — Old batch comparison (buggy FY alignment)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/engines/edgarFinancials.js` — `fetchEdgarStatements()` produces the normalized data to compare. Already returns `{ years, income, balance, cashFlow, provenance }` structure.
- `src/engines/edgar.js` — `fetchCompanyFacts()` returns raw CompanyFacts including `entityFiscalYearEnd` which is the canonical FY-end resolver.
- `src/engines/cache.js` + `src/engines/cacheStore.js` — Three-tier caching (in-memory → IndexedDB → localStorage). New comparison scripts should use the same caching patterns for consistency.
- `validation/scripts/export-financials.mjs` — Existing script that exports engine output. Can be adapted as the "Thes1s source" in the comparison pipeline.
- `validation/scripts/bundle.mjs` — Bundles engine code for Node.js execution outside browser. Critical infrastructure for running engine code in CLI scripts.

### Established Patterns
- Engine functions return `null` on failure, caller checks for null
- All data uses `snake_case` field names internally
- Cache keys use prefixes like `edgar:facts:`, `edgar-statements:`
- Vitest for testing (`npm test`)

### Integration Points
- New comparison scripts go in `validation/scripts/`
- Field mapping config goes in `src/engines/__tests__/fixtures/morningstar/` (existing `field-mapping.json` lives there) or `src/data/`
- Output JSON goes in `validation/reports/`

</code_context>

<specifics>
## Specific Ideas

- The harness must produce the same ~86.4% baseline as Attempt #2 — this is the sanity check that proves the new harness measures correctly
- Non-December FY companies are the single biggest source of comparison errors — the harness should have a specific test for these (LULU, NKE, COST, NVDA, AAPL)
- User is not a programmer — console output should tell a story, not dump data
- Sign convention differences are the second biggest source of errors after FY alignment — expenses are negative in MS, positive in XBRL

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-comparison-harness*
*Context gathered: 2026-03-25*
