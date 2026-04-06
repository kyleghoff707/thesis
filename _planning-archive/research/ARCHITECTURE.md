# Architecture Patterns: Multi-Source Financial Data Triangulation Engine

**Domain:** Financial data normalization and multi-source comparison
**Researched:** 2026-03-25
**Confidence:** HIGH on component boundaries and data flow (grounded in existing codebase + known API structures); MEDIUM on specific API field mapping details (need runtime validation)

---

## Executive Summary

This architecture describes a comparison harness that triangulates the Thes1s XBRL engine output against three independent sources (FMP, SimFin, mstarpy) to identify normalization bugs, derive fix rules, and push accuracy from 91.0% toward 98%+. The design decomposes into six pipeline stages: Fetch, Align, Map, Normalize, Score, and Derive. Each stage has a single responsibility and clean interfaces, allowing incremental build-and-test.

The key insight from Attempt #2 (Morningstar-only comparison at 86.4% ceiling) is that **single-source comparison cannot distinguish between "our bug" and "their quirk."** When 3/4 sources agree on a value and we disagree, that is a normalization bug with high confidence. When sources disagree among themselves, that is a definitional ambiguity worth documenting but not worth chasing.

---

## Recommended Architecture

```
                    ORCHESTRATION LAYER
    ┌─────────────────────────────────────────────┐
    │  Pipeline Runner (validation/scripts/)       │
    │  • Rate-limit budget manager                 │
    │  • Per-ticker state tracking                 │
    │  • Resume-from-failure support               │
    │  • Progress reporting                        │
    └──────────┬──────────────────────────────────┘
               │
    ═══════════╪═══════════════════════════════════
               │           PIPELINE STAGES
    ═══════════╪═══════════════════════════════════
               │
    ┌──────────▼──────────────────────────────────┐
    │  STAGE 1: FETCH                              │
    │  ┌─────────────┐  ┌─────────────┐           │
    │  │ FMP Fetcher  │  │ SimFin      │           │
    │  │ (250/day)    │  │ Fetcher     │           │
    │  └──────┬───────┘  │ (2000/day)  │           │
    │         │          └──────┬──────┘           │
    │  ┌──────┴───────┐  ┌─────┴──────┐           │
    │  │ mstarpy      │  │ Thes1s     │           │
    │  │ Fetcher      │  │ Engine     │           │
    │  │ (Python)     │  │ (existing) │           │
    │  └──────┬───────┘  └──────┬─────┘           │
    │         │                 │                   │
    │         ▼                 ▼                   │
    │   validation/data/{source}/{TICKER}.json     │
    └──────────┬──────────────────────────────────┘
               │
    ┌──────────▼──────────────────────────────────┐
    │  STAGE 2: FISCAL YEAR ALIGNMENT              │
    │  • FY-end detection per source               │
    │  • Calendar-year normalization               │
    │  • Non-Dec FY offset mapping                 │
    │  • Year-label reconciliation                 │
    │  Output: aligned/{TICKER}.json               │
    └──────────┬──────────────────────────────────┘
               │
    ┌──────────▼──────────────────────────────────┐
    │  STAGE 3: FIELD MAPPING                      │
    │  • Source-specific field-name → canonical     │
    │  • Sign convention normalization             │
    │  • Unit conversion (millions → raw)          │
    │  • Per-statement mapping tables              │
    │  Output: mapped/{TICKER}.json                │
    └──────────┬──────────────────────────────────┘
               │
    ┌──────────▼──────────────────────────────────┐
    │  STAGE 4: COMPARISON & SCORING               │
    │  • 4-way field comparison (our + 3 sources)  │
    │  • Consensus detection (3/4 agree = truth)   │
    │  • Tolerance-tiered matching                 │
    │  • Per-field, per-year, per-company scoring  │
    │  Output: scored/{TICKER}.json                │
    └──────────┬──────────────────────────────────┘
               │
    ┌──────────▼──────────────────────────────────┐
    │  STAGE 5: AGGREGATION & ANALYSIS             │
    │  • Cross-company pattern detection           │
    │  • Failure clustering by field               │
    │  • Root cause classification                 │
    │  • Confidence weighting                      │
    │  Output: analysis/aggregate-report.json      │
    └──────────┬──────────────────────────────────┘
               │
    ┌──────────▼──────────────────────────────────┐
    │  STAGE 6: RULE DERIVATION                    │
    │  • Systematic → taxonomy fix recommendations │
    │  • Per-company → tag override table          │
    │  • Definitional → tolerance reclassification │
    │  Output: rules/fix-recommendations.json      │
    └─────────────────────────────────────────────┘
```

### Why This Structure

1. **Each stage is independently testable.** Fetch can be validated without scoring. Alignment can be verified without field mapping. This matches the bug-fixing lesson from Attempt #2: "Can't improve what you can't measure."

2. **Stages are idempotent and resumable.** Each stage reads from disk and writes to disk. A crash at Stage 4 doesn't require re-fetching 500 companies. Rate-limited fetchers resume from the last successful ticker.

3. **Separation of concerns matches the problem structure.** Fiscal year alignment is a completely different problem from field name mapping. Mixing them (as the original `test-api-sources.mjs` did) is what created the "reported accuracy scores are test harness bugs" problem documented in PROJECT.md.

4. **The pipeline feeds backward into the XBRL engine.** Stage 6 outputs actionable fixes -- taxonomy changes, derived field formula updates, tolerance reclassifications -- that are applied to `edgarFinancials.js`. Then the pipeline re-runs to verify improvement.

---

## Component Boundaries

### Stage 1: Fetchers

| Component | File | Responsibility | Rate Limit | Output Format |
|-----------|------|---------------|------------|---------------|
| `fetchFMP.mjs` | `validation/scripts/` | Fetch FMP income/balance/cashflow statements | 300 calls/min, no daily cap | `{ticker, source: 'fmp', fiscalYear, statements: {income: {year: {field: val}}}}` |
| `fetchSimFin.mjs` | `validation/scripts/` | Fetch SimFin statements (compact format) | 5 req/sec, 10yr history | `{ticker, source: 'simfin', statements: {...}}` |
| `fetchMstarpy.py` | `validation/scripts/` | Fetch mstarpy statements (Python scraper) | ~2s delay, fragile | `{ticker, source: 'mstarpy', statements: {...}}` |
| `fetchThesis.mjs` | `validation/scripts/` | Run existing XBRL engine via bundled module | SEC 10 req/sec | `{ticker, source: 'thesis', statements: {...}}` (existing `export-financials.mjs` pattern) |

**Boundary rules:**
- Each fetcher writes ONE JSON file per ticker to `validation/data/{source}/`.
- Fetchers handle their own rate limiting, retry logic, and authentication.
- Fetchers do NOT normalize field names, signs, or units. They preserve source-native format.
- Each fetcher includes a `_meta` block with `fetchedAt`, `source`, `apiVersion`, and `fiscalYearEndMonth`.
- Disk-cached results are reused if fresh (configurable TTL, default 7 days).
- The Thes1s fetcher is the existing `export-financials.mjs` pipeline (bundle engine, run, save JSON). It has been proven across 89+ companies.

**Why Python for mstarpy:** mstarpy is a Python package. Running it in Node would require a Python subprocess anyway. Keep it native. The fetcher writes the same JSON schema as the others.

### Stage 2: Fiscal Year Aligner

| Component | File | Responsibility |
|-----------|------|---------------|
| `fiscalAligner.mjs` | `validation/scripts/` | Detect each source's FY-end month and normalize all year labels to a shared convention |

**The fiscal year alignment problem is the single most important component.** The existing test harness failed primarily because of naive FY alignment. This component must handle:

1. **FY-end detection per source.** FMP has an explicit `fiscalYear` and `calendarYear` field. SimFin has `fiscal_period` and `report_date`. mstarpy labels by calendar year the FY ends. EDGAR uses the company's stated FY designation.

2. **Non-December FY companies.** There are 9 in the truth set alone (LULU Jan, NVDA Jan, NKE May, COST Aug, CRM Jan, INTU Jul, ULTA Jan, WSM Feb, BOOT Jan). Each source may label the same fiscal year differently.

3. **The alignment rule.** All years are normalized to EDGAR's convention: the fiscal year the company designates. This is the canonical label because EDGAR is the source of truth for filing dates. Other sources' labels are mapped TO this convention using their `fiscalYearEndMonth` metadata.

4. **Validation via revenue matching.** After alignment, revenue values must match across sources within 1%. If they don't, the alignment is wrong. This is the same approach used in `morningstarAccuracy.test.js` (`detectYearOffset`), proven to work.

**Output:** `validation/data/aligned/{TICKER}.json` with all four sources' statements keyed by the same fiscal year labels.

```json
{
  "ticker": "LULU",
  "canonicalFYEnd": "January",
  "alignmentOffsets": {
    "fmp": 0,
    "simfin": 0,
    "mstarpy": -1,
    "thesis": 0
  },
  "years": [2024, 2023, 2022, 2021, 2020],
  "statements": {
    "income": {
      "2024": {
        "fmp": { "field": "value", ... },
        "simfin": { "field": "value", ... },
        "mstarpy": { "field": "value", ... },
        "thesis": { "field": "value", ... }
      }
    }
  }
}
```

### Stage 3: Field Mapper

| Component | File | Responsibility |
|-----------|------|---------------|
| `fieldMapper.mjs` | `validation/scripts/` | Map source-native field names to canonical Thes1s field names, apply sign conventions and unit conversions |
| `mappings/fmp-fields.json` | `validation/mappings/` | FMP field name -> Thes1s field name + sign + unit multiplier |
| `mappings/simfin-fields.json` | `validation/mappings/` | SimFin field name -> Thes1s field name + sign + unit multiplier |
| `mappings/mstarpy-fields.json` | `validation/mappings/` | mstarpy field name -> Thes1s field name + sign + unit multiplier |

**This is where the existing `field-mapping.json` pattern is extended.** The Morningstar field mapping already solves the hardest case (87 mapped fields, sign conventions, tolerance tiers). FMP and SimFin need the same treatment.

**Mapping table structure per source:**

```json
{
  "_meta": {
    "source": "fmp",
    "description": "FMP stable API field names -> Thes1s canonical fields",
    "totalMapped": 75,
    "totalUnmapped": 12
  },
  "income": {
    "revenue": {
      "thesisField": "revenues",
      "sign": 1,
      "unitMultiplier": 1,
      "notes": null
    },
    "costOfRevenue": {
      "thesisField": "cost_of_revenue",
      "sign": 1,
      "unitMultiplier": 1,
      "notes": "FMP positive (same as XBRL), unlike MS which is negative"
    }
  }
}
```

**Sign convention differences known from AAPL test:**
- **FMP:** Same sign convention as XBRL (expenses positive, payments positive). Closest to Thes1s.
- **SimFin:** Mixed. Revenue positive, COGS negative, opex negative. Needs field-level sign maps.
- **mstarpy:** Same as Morningstar CSVs. Expenses negative. Already handled by existing `field-mapping.json` sign multipliers.

**Unit conversion:**
- **FMP:** Values in raw dollars (same as XBRL). `unitMultiplier: 1`.
- **SimFin:** Values in raw dollars. `unitMultiplier: 1`.
- **mstarpy v9:** Values in millions. `unitMultiplier: 1e6`.

**Output:** `validation/data/mapped/{TICKER}.json` with all sources' values in canonical Thes1s field names, sign convention, and units (raw dollars).

### Stage 4: Comparator & Scorer

| Component | File | Responsibility |
|-----------|------|---------------|
| `comparator.mjs` | `validation/scripts/` | 4-way comparison with consensus detection and tolerance-tiered scoring |

**The core comparison logic.** For each (field, year, company) triple:

1. Collect all available values: `thesis`, `fmp`, `simfin`, `mstarpy`.
2. Count how many sources have a non-null value for this triple.
3. Compute pairwise agreement within tolerance.
4. Classify the result.

**Classification taxonomy:**

| Classification | Meaning | Action |
|----------------|---------|--------|
| `CONSENSUS_MATCH` | All available sources agree (within tolerance), including Thes1s | No action needed -- we're correct |
| `CONSENSUS_DIFF` | 3+ external sources agree, Thes1s disagrees | **High-priority fix.** Our normalization is wrong. |
| `THESIS_AGREES_PARTIAL` | Thes1s agrees with 1-2 sources, disagrees with others | Investigate -- may be a definitional difference or a source-specific quirk |
| `ALL_DISAGREE` | No consensus among any sources | Definitional ambiguity. Document, don't fix. |
| `INSUFFICIENT_DATA` | Fewer than 2 external sources have a value | Cannot triangulate. Single-source comparison only. |
| `THESIS_ONLY` | Only Thes1s has a value | May be a field coverage advantage or an extraction error |
| `THESIS_MISSING` | External sources have value, Thes1s returns null | Coverage gap in our engine |

**Tolerance tiers (inherited from existing field-mapping.json):**

| Tier | Threshold | Use For |
|------|-----------|---------|
| `exact` | <1% or <$1M | Scoring-critical fields (revenue, net income, EPS, shares) |
| `close` | <5% | Important display fields (COGS, gross profit, SGA) |
| `approximate` | <10% | Derived or definition-variable fields (D&A, working capital changes) |
| `relaxed` | <20% | Financial-sector or structurally ambiguous fields |
| `informational` | No fail | Known-divergent fields (residual "Other" categories) |

**Consensus strength weighting:** Not all sources are equally reliable.

| Source | Weight | Rationale |
|--------|--------|-----------|
| mstarpy | 1.0 | IS Morningstar -- the gold standard target |
| FMP | 0.9 | 100% match on AAPL test, normalizes same XBRL source |
| SimFin | 0.7 | 83% match on AAPL test, known gaps in Cash/CL/LT Debt |
| Thes1s | N/A | This is what we're evaluating, not a source of truth |

**Output per ticker:** `validation/data/scored/{TICKER}.json`

```json
{
  "ticker": "AAPL",
  "summary": {
    "totalComparisons": 425,
    "consensusMatch": 380,
    "consensusDiff": 12,
    "thesisAgrees": 8,
    "allDisagree": 5,
    "insufficientData": 15,
    "thesisMissing": 5
  },
  "details": {
    "income": {
      "revenues": {
        "2024": {
          "thesis": 391035000000,
          "fmp": 391035000000,
          "simfin": 391035000000,
          "mstarpy": 391035000000,
          "classification": "CONSENSUS_MATCH",
          "maxDeviation": 0
        },
        "2023": { ... }
      }
    }
  }
}
```

### Stage 5: Aggregator & Analyzer

| Component | File | Responsibility |
|-----------|------|---------------|
| `aggregator.mjs` | `validation/scripts/` | Cross-company pattern detection and failure clustering |

**This stage answers: "What patterns emerge across 50+ companies?"**

Key analyses:

1. **Field-level failure rates.** Which fields have the most `CONSENSUS_DIFF` across companies? This replaces the manual "Top Failure Patterns" analysis from the eng plan.

2. **Failure clustering.** Group failures by root cause:
   - **Tag coverage gaps:** Thes1s returns null, sources have values. Fix: add XBRL tags.
   - **Sign convention errors:** Values are equal in magnitude but opposite sign. Fix: toggle `negate` flag.
   - **Derivation formula bugs:** Value is systematically wrong by a formula-related offset (e.g., D&A included/excluded). Fix: update `computeDerivedFields`.
   - **Definitional mismatches:** Sources disagree among themselves. No fix possible.

3. **Company-type correlation.** Do financial companies (BRK-B, JPM, MET, WFC) cluster differently from standard companies? Does the industry overlay (bank/REIT/insurance) explain divergences?

4. **Temporal patterns.** Do failures concentrate in older years (pre-ASC 842, pre-ASC 606) or recent years?

**Output:** `validation/data/analysis/aggregate-report.json` plus a human-readable `validation/data/analysis/aggregate-report.md`.

### Stage 6: Rule Deriver

| Component | File | Responsibility |
|-----------|------|---------------|
| `ruleDeriver.mjs` | `validation/scripts/` | Convert aggregated findings into actionable engine fixes |

**This is where triangulation produces value.** Three output categories:

1. **Taxonomy fixes** (apply to `edgarFinancials.js`):
   - New XBRL tags to add to field definitions
   - Tag priority reordering
   - New `negate` flags
   - New derived field formulas

2. **Per-company overrides** (new data file):
   - Companies whose XBRL tags don't match the universal taxonomy
   - Tag-level overrides: "For CRM, use `DepreciationAndAmortization` instead of `DepreciationDepletionAndAmortization` for D&A"
   - This is effectively a lightweight version of the dormant Layer 3, but data-driven instead of AI-classified

3. **Tolerance reclassifications** (apply to field mapping):
   - Fields where sources disagree among themselves should be `informational`, not `exact`
   - Fields where sources agree but use a different formula than MS should have tolerance adjusted

**Output:** `validation/data/rules/fix-recommendations.json`

```json
{
  "taxonomyFixes": [
    {
      "field": "depreciation_amortization",
      "action": "add_tag",
      "tag": "AdjustmentForAmortization",
      "position": "component_sum",
      "evidence": "CRM, INTU, MSFT report intangible amort separately",
      "companies": ["CRM", "INTU", "MSFT"],
      "expectedImpact": "+20 matches",
      "confidence": "HIGH"
    }
  ],
  "companyOverrides": [
    {
      "ticker": "CRM",
      "field": "depreciation_amortization",
      "preferTag": "DepreciationAndAmortization",
      "reason": "Reports amort as separate CF line item",
      "confidence": "HIGH"
    }
  ],
  "toleranceChanges": [
    {
      "field": "other_investing",
      "currentTolerance": "approximate",
      "recommendedTolerance": "informational",
      "reason": "Sources disagree among themselves. Residual computation.",
      "confidence": "HIGH"
    }
  ]
}
```

---

## Data Flow

```
External APIs                    Existing Engine              Disk Cache
═══════════════                  ═══════════════              ══════════

FMP API ──────┐
SimFin API ───┤                  edgarFinancials.js ──┐
mstarpy ──────┤                  (existing, via       │
              │                   bundled-engines.mjs) │
              ▼                                        ▼
    ┌─────────────────────────────────────────────────────────┐
    │  validation/data/{source}/{TICKER}.json                  │
    │  Raw, source-native format (no normalization)            │
    │  One file per ticker per source                          │
    │  ~200 files for 50 tickers x 4 sources                  │
    └──────────────────────────┬──────────────────────────────┘
                               │
                    Fiscal Year Aligner
                               │
                               ▼
    ┌─────────────────────────────────────────────────────────┐
    │  validation/data/aligned/{TICKER}.json                   │
    │  All sources' years mapped to EDGAR FY convention         │
    │  Revenue cross-check validates alignment                 │
    └──────────────────────────┬──────────────────────────────┘
                               │
                    Field Mapper (+ sign + unit normalization)
                               │
                               ▼
    ┌─────────────────────────────────────────────────────────┐
    │  validation/data/mapped/{TICKER}.json                    │
    │  All values in Thes1s canonical field names              │
    │  Same sign convention, same units (raw dollars)          │
    └──────────────────────────┬──────────────────────────────┘
                               │
                    Comparator & Scorer
                               │
                               ▼
    ┌─────────────────────────────────────────────────────────┐
    │  validation/data/scored/{TICKER}.json                    │
    │  Per-field, per-year classification + deviation           │
    └──────────────────────────┬──────────────────────────────┘
                               │
                    Aggregator & Analyzer
                               │
                               ▼
    ┌─────────────────────────────────────────────────────────┐
    │  validation/data/analysis/                               │
    │  aggregate-report.json + aggregate-report.md             │
    │  Field-level failure rates, clustering, patterns         │
    └──────────────────────────┬──────────────────────────────┘
                               │
                    Rule Deriver
                               │
                               ▼
    ┌─────────────────────────────────────────────────────────┐
    │  validation/data/rules/fix-recommendations.json          │
    │  Taxonomy fixes, company overrides, tolerance changes    │
    └──────────────────────────┬──────────────────────────────┘
                               │
                    MANUAL REVIEW + APPLY
                               │
                               ▼
    ┌─────────────────────────────────────────────────────────┐
    │  src/engines/edgarFinancials.js                           │
    │  (taxonomy arrays, computeDerivedFields, new overrides)  │
    │                                                          │
    │  src/engines/__tests__/morningstarAccuracy.test.js        │
    │  (tolerance updates, new assertions)                     │
    └─────────────────────────────────────────────────────────┘
                               │
                    RE-RUN PIPELINE (feedback loop)
                               │
                               ▼
                    Verify improvement, iterate
```

### Feedback Loop

The pipeline is designed to be re-run after each batch of fixes. The cycle:

1. Run pipeline (Stages 1-6) -> produces fix recommendations
2. Apply fixes to `edgarFinancials.js`
3. Re-run Thes1s fetcher (Stage 1, Thes1s only) to regenerate engine output
4. Re-run Stages 2-6 to measure improvement
5. Repeat until `CONSENSUS_DIFF` count drops below threshold

This is the same test-driven approach that worked in Phase B (B1-B8), but with 3 additional sources providing signal instead of just Morningstar.

---

## Patterns to Follow

### Pattern 1: Disk-Based Pipeline with Resumability

**What:** Each stage reads from disk and writes to disk. No in-memory-only state between stages. Each stage can be run independently.

**When:** Always -- this is the core architectural pattern.

**Why:** Rate limits (FMP 300/min, SimFin 5/sec, mstarpy ~0.5/sec) make re-fetching expensive. A crash at Stage 4 after fetching 500 companies would waste hours. Disk persistence is essential.

**Example:**
```javascript
// Pipeline runner
async function runPipeline(tickers, options = {}) {
  const { startStage = 1, skipFetch = false } = options;

  if (startStage <= 1 && !skipFetch) {
    await runFetchers(tickers);  // writes to validation/data/{source}/
  }
  if (startStage <= 2) {
    await runAligner(tickers);   // reads {source}/, writes aligned/
  }
  if (startStage <= 3) {
    await runMapper(tickers);    // reads aligned/, writes mapped/
  }
  if (startStage <= 4) {
    await runScorer(tickers);    // reads mapped/, writes scored/
  }
  if (startStage <= 5) {
    await runAggregator(tickers); // reads scored/, writes analysis/
  }
  if (startStage <= 6) {
    await runDeriver(tickers);   // reads analysis/, writes rules/
  }
}
```

### Pattern 2: Revenue Cross-Check for Alignment Validation

**What:** After fiscal year alignment, verify that revenue values match within 1% across all sources. If they don't, the alignment is wrong.

**When:** Always, as the first quality gate after Stage 2.

**Why:** Revenue is the most universally reported and least ambiguous field. If two sources' revenues for "FY2024" differ by more than 1%, they are almost certainly referring to different fiscal periods. This was proven in the existing `morningstarAccuracy.test.js` offset detection (which uses revenue matching with bias toward offset=0).

**Example:**
```javascript
function validateAlignment(aligned) {
  const sources = ['thesis', 'fmp', 'simfin', 'mstarpy'];
  for (const year of aligned.years) {
    const revenues = {};
    for (const src of sources) {
      const rev = aligned.statements.income[year]?.[src]?.revenues
                ?? aligned.statements.income[year]?.[src]?.revenue
                ?? aligned.statements.income[year]?.[src]?.totalRevenue;
      if (rev != null) revenues[src] = rev;
    }
    // All non-null revenues should agree within 1%
    const vals = Object.values(revenues);
    if (vals.length >= 2) {
      const max = Math.max(...vals);
      const min = Math.min(...vals);
      if (max > 0 && (max - min) / max > 0.01) {
        return { valid: false, year, revenues };
      }
    }
  }
  return { valid: true };
}
```

### Pattern 3: Consensus-Based Truth Detection

**What:** When 3+ sources agree on a value (within tolerance) and Thes1s disagrees, classify as `CONSENSUS_DIFF`. This is a high-confidence normalization bug.

**When:** Stage 4 comparison.

**Why:** Single-source comparison (Attempt #2) cannot distinguish between "we're wrong" and "Morningstar is quirky." Adding FMP and SimFin creates triangulation: if FMP, SimFin, AND mstarpy all say revenue is $X and we say $Y, we are almost certainly wrong. Conversely, if only mstarpy says $X and FMP/SimFin agree with us, it's a Morningstar normalization choice.

### Pattern 4: Incremental Source Addition

**What:** Build and validate one source at a time. Start with FMP (closest to XBRL, simplest mapping), then SimFin, then mstarpy.

**When:** Build order (see below).

**Why:** FMP has 100% accuracy on AAPL (only missing Diluted EPS due to field name mapping). It is the easiest source to integrate and provides the most signal with the least mapping complexity. SimFin has known normalization differences (83% on AAPL). mstarpy is a fragile Python scraper. Building in order of reliability and complexity reduces integration risk.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Mixing Alignment and Comparison in One Pass

**What:** Trying to align fiscal years and compare field values in a single function.
**Why bad:** This is exactly what the original `test-api-sources.mjs` did. PROJECT.md explicitly calls out: "Fiscal year alignment is naive (breaks for non-calendar FY: LULU, COST, NKE)." Mixing concerns makes both bugs harder to find.
**Instead:** Separate stages. Stage 2 (alignment) is complete and validated before Stage 4 (comparison) runs.

### Anti-Pattern 2: Hard-Coding Source Field Names

**What:** Embedding FMP or SimFin field names directly in comparison logic.
**Why bad:** API field names change between versions. SimFin v3 uses different names than v2. FMP stable vs legacy endpoints differ.
**Instead:** All field name mappings live in JSON files (`validation/mappings/{source}-fields.json`). The comparison logic operates on canonical Thes1s field names only.

### Anti-Pattern 3: Treating All Sources as Equally Reliable

**What:** Simple majority vote (3 agree = truth).
**Why bad:** mstarpy (weight 1.0) disagreeing with FMP (0.9) and SimFin (0.7) is different from SimFin disagreeing with mstarpy and FMP. Source reliability varies by field type too -- SimFin's cash flow mapping is weaker than its income statement mapping.
**Instead:** Consensus detection with source weighting. A mstarpy+FMP agreement outweighs a SimFin+Thes1s agreement.

### Anti-Pattern 4: Attempting Residual "Other" Field Derivation Early

**What:** Computing "Other" fields (other_financing, other_investing, etc.) as `Total - Sum(named items)` before named items are accurate.
**Why bad:** Attempted 4 times in the normalization plan (B7, B8, post-research, MS definitions pass). Every time caused accuracy regressions due to error amplification. This is documented as a fundamental blocker.
**Instead:** Classify all residual "Other" fields as `informational` tolerance. Only attempt residual derivation when named item accuracy exceeds 98%.

### Anti-Pattern 5: Re-Fetching Everything on Each Pipeline Run

**What:** Hitting FMP/SimFin APIs for every ticker on every pipeline run.
**Why bad:** With FMP at 250/day and 500 tickers, a full re-fetch takes 2 days. Financial statements don't change between runs.
**Instead:** Disk-cached results with configurable TTL. Default 7 days for annual data. Only re-fetch when explicitly requested or when the ticker is flagged for refresh.

---

## Suggested Build Order

Dependencies between components dictate the build order. Each phase produces a working pipeline that can generate results.

### Phase 1: FMP Integration (Foundation)

Build the full pipeline end-to-end with FMP as the first (and only) external source, plus Thes1s engine output.

**Build order within Phase 1:**
1. **FMP Fetcher** -- fetch and cache FMP statements for 50 truth set tickers
2. **FMP Field Mapping** -- create `fmp-fields.json` (income, balance, cashflow)
3. **Fiscal Year Aligner** -- handle non-Dec FY companies using FMP's `calendarYear`/`fiscalYear` fields
4. **Field Mapper** -- apply FMP mapping to aligned data
5. **Comparator** -- 2-way comparison (Thes1s vs FMP) with classification
6. **Pipeline Runner** -- orchestrate stages, handle resumability

**Why FMP first:** 100% accuracy on AAPL, same sign convention as XBRL, explicit FY metadata, high rate limit (300/min). The simplest and most reliable source. This phase validates the entire pipeline architecture with minimal mapping complexity.

**Exit criteria:** Pipeline runs for all 50 truth set tickers. Revenue cross-check passes for 46+ tickers (allowing for RACE/EUR and financial sector exceptions). `CONSENSUS_DIFF` count is quantified.

### Phase 2: SimFin Integration

Add SimFin as a second external source. Now we have 3-way comparison.

**Build order within Phase 2:**
1. **SimFin Fetcher** -- fetch and cache SimFin statements
2. **SimFin Field Mapping** -- create `simfin-fields.json` (handle bank/insurance templates separately)
3. **Aligner update** -- handle SimFin's FY labeling convention
4. **Comparator update** -- extend to 3-way comparison with consensus detection
5. **Aggregator** -- cross-company pattern analysis

**Why SimFin second:** SimFin traces every value to the source filing -- powerful for debugging when our XBRL extraction disagrees. Also has separate bank/insurance templates matching our industry overlay approach. The known 83% accuracy on AAPL means we'll need careful mapping, but the explicit source-filing linkage makes disagreements investigable.

**Exit criteria:** 3-way comparison runs. Consensus detection identifies `CONSENSUS_DIFF` cases where both FMP and SimFin agree and Thes1s disagrees.

### Phase 3: mstarpy Integration + Triangulation

Add mstarpy as the third external source. Now we have full 4-way triangulation.

**Build order within Phase 3:**
1. **mstarpy Fetcher update** -- use existing Python fetcher, standardize output format
2. **mstarpy Field Mapping update** -- leverage existing `field-mapping.json` from Morningstar truth set
3. **Comparator update** -- full 4-way comparison with weighted consensus
4. **Rule Deriver** -- generate fix recommendations from aggregate analysis

**Why mstarpy last:** It's a fragile Python scraper that could break anytime (noted in PROJECT.md). By building FMP and SimFin first, we have a robust 3-way pipeline that works even if mstarpy dies. Additionally, the existing Morningstar field mapping (87 fields, sign conventions, tolerance tiers) is directly reusable.

**Exit criteria:** Full triangulation operational. Rule recommendations generated. First batch of taxonomy fixes applied and verified.

### Phase 4: Scale to S&P 500

Expand from 50 truth set tickers to all S&P 500 companies.

**Build order within Phase 4:**
1. **Batch fetcher with rate-limit budget** -- schedule fetches across multiple days
2. **Automated failure clustering** -- patterns that appear across 500 companies, not just 50
3. **Industry-specific analysis** -- do bank/REIT/insurance overlays reduce failures?
4. **Per-company override system** -- build the override data file for companies with non-standard XBRL tags

**Exit criteria:** 98%+ accuracy on S&P 500 with tolerance-appropriate thresholds.

### Phase 5: Full Market Coverage

Expand to all ~5,758 US-listed equities.

**Build order within Phase 5:**
1. **Long-tail company handling** -- small-cap companies with unusual XBRL practices
2. **Per-company override growth** -- more override entries as company diversity increases
3. **Automated monitoring pipeline** -- run weekly, flag regressions
4. **Sunrise/sunset handling** -- new IPOs, delistings, M&A

---

## How Triangulation Feeds Back Into the XBRL Engine

The triangulation pipeline is not a standalone system -- its entire purpose is to improve `edgarFinancials.js`. The feedback mechanism:

### Taxonomy Fixes (Layer 1 Improvements)

When `CONSENSUS_DIFF` analysis reveals a systematic tag gap:

```
Analysis: 15 companies missing 'depreciation_amortization' because
          they use 'Depreciation' + 'AdjustmentForAmortization'
          instead of 'DepreciationDepletionAndAmortization'

Fix: Add broadest-value-wins logic in computeDerivedFields
     (already implemented in B8 research fix, but more cases expected)
```

These fixes go directly into the taxonomy arrays (`INCOME_TAXONOMY`, `BALANCE_TAXONOMY`, `CASHFLOW_TAXONOMY`) or into `computeDerivedFields()`.

### Per-Company Override Table (New Layer 1.5)

When `CONSENSUS_DIFF` analysis reveals company-specific tag usage that doesn't fit the universal taxonomy:

```
Analysis: CRM uses 'DepreciationAndAmortization' which is narrower
          than 'DepreciationDepletionAndAmortization' for most companies,
          but broader for CRM specifically because CRM reports intangible
          amortization as a separate CF line item.

Fix: Override table entry, not a taxonomy change.
```

This is a lightweight, data-driven alternative to the dormant Layer 3 (AI classification). Instead of AI guessing which tag to use, the triangulation pipeline PROVES which tag produces the correct value.

**Implementation:** A new JSON file (`src/data/company-overrides.json`) loaded in `edgarFinancials.js`. After standard extraction, overrides are applied per-ticker.

```json
{
  "CRM": {
    "cashFlow": {
      "depreciation_amortization": {
        "preferTag": "DepreciationAndAmortization",
        "reason": "Reports intangible amort separately",
        "validatedAgainst": ["fmp", "simfin", "mstarpy"],
        "addedDate": "2026-04-01"
      }
    }
  }
}
```

### Tolerance Reclassification

When triangulation shows that sources disagree among themselves on a field:

```
Analysis: 'accrued_liabilities' -- FMP uses one definition, SimFin uses
          another, mstarpy uses a third. ALL_DISAGREE classification
          on 31/50 companies.

Fix: Reclassify from 'close' tolerance to 'informational'. This is
     not a Thes1s bug -- it's a definitional ambiguity.
```

These feed into the field mapping JSON and the `morningstarAccuracy.test.js` tolerance configuration.

---

## Scalability Considerations

| Concern | 50 tickers (truth set) | 500 tickers (S&P 500) | 5,758 tickers (full market) |
|---------|----------------------|----------------------|----------------------------|
| FMP fetch time | 10 min | 2 hours (300/min) | 20 hours (spread across days) |
| SimFin fetch time | 5 min | 50 min (5/sec) | 10 hours |
| mstarpy fetch time | 2 min | 20 min (~2s/ticker) | 3 hours |
| Disk storage | ~50MB | ~500MB | ~5GB |
| Comparison runtime | <1 min | ~10 min | ~1 hour |
| Pipeline re-run (skip fetch) | <1 min | ~5 min | ~30 min |

**Key constraint:** FMP at 300 calls/min is the bottleneck. Each ticker needs 3 API calls (income, balance, cashflow) = ~900 calls for S&P 500, which takes ~3 minutes. But with 5,758 tickers, that's ~17,274 calls = ~58 minutes. Comfortable within daily limits. The 250/day cap mentioned in PROJECT.md may be a Starter plan limit -- the actual rate is 300/min per FMP docs. Verify with the FMP dashboard.

**Optimization:** For the S&P 500+ scale, use FMP's bulk endpoint if available (single call for multiple tickers), or batch fetches across multiple days with resumability.

---

## Sources and Confidence

| Claim | Confidence | Source |
|-------|------------|--------|
| Pipeline stage decomposition | HIGH | Derived from existing codebase architecture + known API structures |
| FMP field mapping simplicity | HIGH | Confirmed by AAPL test: 100% accuracy, same sign convention as XBRL |
| SimFin bank/insurance templates | MEDIUM | Training data knowledge; needs runtime validation |
| mstarpy fragility | HIGH | PROJECT.md: "Scraper could break anytime" |
| Fiscal year alignment as hardest subproblem | HIGH | Documented extensively in eng plan (9 offset companies, 3 alignment attempts) |
| Consensus-based truth detection working | MEDIUM | Logical reasoning from multi-source comparison theory; not validated in this codebase yet |
| FMP rate limits (300/min) | MEDIUM | Training data; PROJECT.md says 250/day on Starter plan -- may differ from actual |
| Per-company override approach | HIGH | Directly addresses the "Layer 3 alternative" need documented in eng plan |
| Residual "Other" fields remaining blocked | HIGH | Attempted 4 times, reverted 4 times, documented extensively |
