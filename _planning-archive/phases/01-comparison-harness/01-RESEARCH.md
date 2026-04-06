# Phase 01: Comparison Harness - Research

**Researched:** 2026-03-25
**Domain:** JavaScript-based financial data comparison pipeline (SEC EDGAR XBRL vs Morningstar truth set)
**Confidence:** HIGH

## Summary

This phase builds a standalone JavaScript comparison harness that measures the accuracy of the Thes1s XBRL engine against the existing 50-company Morningstar truth set. The core challenges are: (1) fiscal year alignment between EDGAR's FY labeling and Morningstar's calendar-year convention, (2) sign convention normalization (Morningstar uses negative expenses, XBRL uses positive), and (3) producing a single deterministic accuracy score that matches the known baseline from Attempt #2.

The project already has substantial infrastructure: 50 Morningstar JSON fixtures, a field-mapping.json with 87 mapped fields including sign multipliers and tolerance tiers, a working Vitest-based accuracy test suite (`morningstarAccuracy.test.js`), an engine bundler (`bundle.mjs`), and an export pipeline (`export-financials.mjs`). The new harness replaces the Vitest-embedded comparison with a standalone Node.js script that produces a JSON report and console summary -- making it runnable outside the test framework and suitable for Phase 2 multi-source extension.

**Primary recommendation:** Build the harness as a pipeline of pure functions (CSV parser -> FY aligner -> field mapper -> comparator -> reporter) that reads from existing fixtures and engine output. Reuse the existing `field-mapping.json` and fixture format. The FY aligner should use `entityFiscalYearEnd` from CompanyFacts (available as `fiscalYearEnd` in the fixture JSON and via `extractFiscalYearEnds` from edgar.js) as the primary resolver, with revenue-matching as validation.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Old scripts (test-api-sources.mjs, batch-api-comparison.mjs, _mstarpy_batch_tmp.py) copied to `validation/scripts/reference/` as reference only. Build the new pipeline from scratch -- old scripts had structural issues (mixed Python/JS, buggy FY alignment, incomplete field mapping). Use them to understand what was tried and what failed.
- **D-03:** Single JSON config file (`field-mapping.json`) mapping all source field names to Thes1s canonical names. Include sign multipliers and tolerance tiers per field. Human-readable, git-diffable. One file to maintain.
- **D-05:** Console summary + JSON detail. Clean console output showing overall accuracy %, top failures, and per-company scores. Detailed JSON file for drilling into specific field-level results.
- **D-06:** Per-company breakdown shows company score + top 3 failure fields. Not full field-by-field dumps. Keep output scannable for a non-programmer.

### Claude's Discretion
- FY alignment implementation approach (D-02) -- use `entityFiscalYearEnd` from CompanyFacts as primary resolver
- Unmapped field categorization and mapping priority (D-04) -- focus on 87 already-mapped fields for Phase 1
- All technical implementation details (architecture, module structure, error handling)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| HARNESS-01 | Fiscal year alignment engine with deterministic FY-end resolver using EDGAR `entityFiscalYearEnd` | FY alignment approach documented in Architecture Patterns; existing `extractFiscalYearEnds` function in edgar.js extracts FY-end month from CompanyFacts; 19 non-Dec FY companies in truth set, 3 need year offset (LULU, ULTA, WSM -- Jan/Feb FY ends) |
| HARNESS-02 | Universal sign convention normalizer -- per source per field sign multiplier table | Existing `field-mapping.json` has `sign` multipliers for all 87 mapped fields; income statement expenses are sign:-1 (MS negative, XBRL positive); balance sheet contra-assets are sign:-1; cash flow items vary |
| HARNESS-03 | Scale normalizer -- mstarpy returns millions, all others return full dollars | Phase 1 only compares Thes1s vs Morningstar (both full dollars); mstarpy scale normalization is Phase 2 concern; build the normalizer interface now but only Morningstar adapter needed |
| HARNESS-04 | Universal field mapping JSON -- single config file mapping all source field names to Thes1s canonical names | Existing `field-mapping.json` at `src/engines/__tests__/fixtures/morningstar/field-mapping.json` already maps 87 MS fields with sign, tolerance, and notes; needs relocation to shared path and extension with source discriminator for Phase 2 |
| HARNESS-05 | All-JavaScript comparison harness replacing Python comparison scripts -- single-language pipeline, no dual-language field mapping bugs | Architecture documented: Node.js ESM scripts in `validation/scripts/`; uses esbuild bundle for engine access; existing `bundle.mjs` and `export-financials.mjs` are proven patterns |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js | 24.13.1 | Runtime for CLI scripts | Already confirmed on dev machine |
| esbuild | 0.27.4 | Bundle engine code for Node.js execution | Already used by `bundle.mjs`; available via Vite transitive dep |
| vitest | 4.1.0 | Unit tests for harness components | Already project standard |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| fs (builtin) | -- | Read fixtures, write reports | All file I/O |
| path (builtin) | -- | Cross-platform path resolution | File path construction |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom CSV parser | csv-parse, papaparse | Extra dependency for a one-time conversion already handled by `morningstar-to-fixtures.cjs` |
| Custom JSON reporter | consola, chalk | Color output is nice but unnecessary -- the user reads JSON reports, not terminal streams |
| esbuild direct | Vite SSR mode | esbuild is simpler for CLI scripts; Vite SSR adds complexity |

**Installation:**
No new packages needed. All dependencies are already available in the project.

## Architecture Patterns

### Recommended Project Structure
```
validation/
  scripts/
    compare-morningstar.mjs    -- Main entry point (orchestrator)
    lib/
      fiscal-aligner.mjs       -- FY-end detection + year-label normalization
      field-mapper.mjs          -- Source field names -> canonical + sign + scale
      comparator.mjs            -- Per-field comparison with tolerance tiers
      reporter.mjs              -- Console summary + JSON detail generator
    reference/                  -- Old scripts (read-only reference)
  reports/
    morningstar-accuracy.json   -- Detailed JSON output (per-company, per-field)
src/engines/__tests__/
  fixtures/morningstar/
    field-mapping.json          -- Existing 87-field mapping (stays here for now)
    {TICKER}.json               -- 50 Morningstar fixtures (existing)
    edgar-cache/                -- Cached EDGAR API responses (existing, gitignored)
  morningstarAccuracy.test.js   -- Existing Vitest suite (keep as regression gate)
  harness/
    fiscal-aligner.test.js      -- Unit tests for FY alignment
    comparator.test.js          -- Unit tests for comparison logic
    sign-convention.test.js     -- AAPL 2024 sign convention validation
```

### Pattern 1: Pipeline of Pure Functions
**What:** Each stage is a pure function: input data -> output data. No shared mutable state between stages.
**When to use:** Every stage of the comparison pipeline.
**Example:**
```javascript
// fiscal-aligner.mjs
export function resolveYearOffset(msFixture, engineData) {
  // Deterministic: uses fiscalYearEnd metadata, validates with revenue matching
  const fyEnd = msFixture.fiscalYearEnd; // e.g., "Jan 31"
  const fyMonth = fyEnd ? fyEnd.split(' ')[0] : 'Dec';

  // Jan/Feb FY ends: engine relabels to calendar year (fy+1)
  // MS also uses calendar year -- BUT fixture parser may have shifted
  // Use revenue matching as the definitive validation
  // ...
  return offset; // 0, -1, or 1
}
```

### Pattern 2: Source Adapter Interface
**What:** Each data source (Morningstar, Thes1s, future FMP/SimFin) has an adapter that normalizes its output to a canonical format.
**When to use:** When reading data from any source before comparison.
**Example:**
```javascript
// field-mapper.mjs
export function mapMorningstarToCanonical(msStatements, fieldMapping) {
  const result = { income: {}, balance: {}, cashFlow: {} };
  for (const [stmtType, fields] of Object.entries(fieldMapping)) {
    if (stmtType === '_meta') continue;
    for (const [msField, mapping] of Object.entries(fields)) {
      if (!mapping.thesisField) continue;
      // Apply sign convention: canonical = sign * msValue
      // Apply scale: canonical = unitMultiplier * msValue (1.0 for MS)
      // ...
    }
  }
  return result;
}
```

### Pattern 3: Existing Engine Access via Bundle
**What:** The harness accesses the Thes1s XBRL engine via esbuild bundle, same as `export-financials.mjs`.
**When to use:** Fetching live engine output for comparison.
**Example:**
```javascript
// Uses existing bundle.mjs pattern
// 1. node validation/scripts/bundle.mjs  (creates bundled-engines.mjs)
// 2. import { fetchEdgarStatements } from './bundled-engines.mjs'
// 3. Polyfill localStorage, intercept fetch for SEC rate limiting
```

### Anti-Patterns to Avoid
- **Mixing comparison logic with FY alignment:** The existing `morningstarAccuracy.test.js` does FY offset detection inside `compareCompany`. The new harness must separate these -- FY alignment is a preprocessing step, not part of comparison.
- **Revenue-matching as FY detection:** The existing test uses revenue matching to detect year offsets. This is fragile (NEE false-detected as offset:-1). Use `entityFiscalYearEnd` metadata as primary, revenue matching as validation only.
- **Embedding comparison in Vitest:** The existing test suite runs comparison as vitest assertions. The new harness is a standalone script that outputs JSON. Vitest is for unit-testing harness components, not running the full comparison.
- **Modifying field-mapping.json for this phase:** The existing mapping works. Don't restructure it until Phase 2 when multi-source support requires it.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Engine bundling | Custom module loader | Existing `bundle.mjs` (esbuild) | Already proven, handles `import.meta.env`, browser API polyfills |
| CSV parsing for MS truth set | New CSV parser | Existing `morningstar-to-fixtures.cjs` output (JSON fixtures) | Already converted, validated, 50 companies |
| EDGAR API access in Node | Direct fetch with manual rate limiting | Existing EDGAR cache pattern from `morningstarAccuracy.test.js` | Disk-cached responses, rate limiting, URL rewriting all solved |
| Sign convention rules | Inference from data | Existing `field-mapping.json` sign multipliers | Already human-verified for 87 fields |
| Tolerance thresholds | New threshold system | Existing 5-tier system (exact/close/approximate/relaxed/informational) | Already tuned through B1-B8 accuracy work |

**Key insight:** Phase 1 is about building the pipeline infrastructure, not redefining the comparison rules. The rules (field mapping, sign conventions, tolerances) already exist and were validated through B1-B8. The harness wraps them in a standalone, scriptable pipeline.

## Common Pitfalls

### Pitfall 1: Fiscal Year Off-By-One for Jan/Feb FY Companies
**What goes wrong:** LULU's FY ending Jan 2025 is XBRL fy=2024, but Morningstar labels it 2025 (calendar year of period end). The engine already relabels Jan/Feb FY companies to calendar year convention. If the harness doesn't account for this, LULU/ULTA/WSM comparisons fail on every field.
**Why it happens:** Three FY labeling conventions coexist. The engine uses calendar-year convention (post-offset). MS fixtures also use calendar year. But the original XBRL fy field is fy-1 for Jan/Feb companies.
**How to avoid:** The harness's FY aligner reads `fiscalYearEnd` from the MS fixture JSON (e.g., "Jan 31") and from the engine output's `fiscalMonths`. For Jan/Feb FY ends, verify that engine years are already calendar-aligned (the engine does this internally). Use revenue matching as validation, not as primary detection.
**Warning signs:** 0% accuracy for LULU, ULTA, WSM, BOOT, NKE, etc. Revenue values off by exactly 1 year's growth.

### Pitfall 2: Sign Convention Double-Flip
**What goes wrong:** The field-mapping.json `sign` multiplier converts MS convention to Thes1s convention. If you apply it in the wrong direction (multiplying the engine value instead of the MS value), expenses will show 200% errors even when the values are correct.
**Why it happens:** The `sign` field means "thesisValue approx equals sign * msValue". If you instead compute "msValue approx equals sign * thesisValue", the comparison math breaks.
**How to avoid:** The comparison formula is: `expected = sign * msValue; actual = thesisValue; diff = abs((actual - expected) / expected)`. This is how the existing test suite does it. Copy the math exactly.
**Warning signs:** All expense fields (COGS, SGA, R&D, tax, interest) show as DIFF despite correct magnitudes. `abs(engine) == abs(ms)` for many fields.

### Pitfall 3: Treating the Vitest Output as the Baseline
**What goes wrong:** The existing `morningstarAccuracy.test.js` reports "91.0% match" as the latest accuracy. But the new harness might produce a different number if comparison logic differs (different FY alignment, different MISSING handling, different tolerance application).
**Why it happens:** Small differences in comparison logic compound across 50 companies x 87 fields x 5 years = 21,750 comparison points. A single edge case handling difference can shift the overall number by 1-2%.
**How to avoid:** The success criterion says "reproduce ~86.4% baseline from Attempt #2." Looking at the eng plan history: 79.5% -> 83.7% -> 85.7% -> 86.4% (B8) -> 87.8% (research fixes) -> 91.0% (MS definitions pass). The 86.4% was B8; the current engine produces 91.0%. The harness should reproduce whatever the current engine + current fixtures produce. Run the existing Vitest suite first, capture its exact numbers, then verify the new harness matches.
**Warning signs:** New harness accuracy differs by more than 0.5% from Vitest suite output.

### Pitfall 4: Effective Tax Rate Scale Mismatch
**What goes wrong:** Morningstar stores effective tax rate as a decimal (0.24 = 24%). The engine stores it as a percentage (24.0). If you compare without scaling, every company shows a "huge DIFF" on this field.
**Why it happens:** The existing test has special handling: `if (thesisField === 'effective_tax_rate') { adjustedMsValue = msValue * 100; }`. Easy to miss in a rewrite.
**How to avoid:** Document all special-case field handling. Extract them as explicit rules in the field-mapping.json (add a `scale` property) rather than burying them in comparison code.
**Warning signs:** effective_tax_rate shows 99%+ error for every company.

### Pitfall 5: Missing Year vs Missing Field Conflation
**What goes wrong:** The harness counts "engine has no data for year 2020" the same as "engine has data for year 2020 but field X is null." These are different failure modes with different remedies.
**Why it happens:** Both are "null" in the comparison. But MISSING_YEAR means the engine didn't extract that fiscal year at all (structural), while MISSING_FIELD means the year exists but a specific field is null (tag coverage gap).
**How to avoid:** Check for year existence first, then field existence. Track them as separate status codes in the report (MISSING_YEAR vs MISSING_FIELD). The existing test does this correctly -- preserve the pattern.
**Warning signs:** MISSING count inflated by companies where the engine returns fewer years than MS has.

### Pitfall 6: Intangible Assets Net vs Gross
**What goes wrong:** Morningstar's "Intangibles other than Goodwill" is GROSS carrying amount. The engine extracts NET (after accumulated amortization). Comparing these directly produces large errors.
**Why it happens:** Different accounting presentation choices. MS provides both gross and accumulated amortization; the engine uses whichever XBRL tag is available.
**How to avoid:** The existing test computes "implied NET = GROSS + AccumAmort" before comparison. This special handling must be preserved in the new harness. Consider encoding it as a field-level rule.
**Warning signs:** Intangible assets systematically higher in MS than engine, by exactly the accumulated amortization amount.

## Code Examples

### Existing Comparison Logic (from morningstarAccuracy.test.js)
```javascript
// Source: src/engines/__tests__/morningstarAccuracy.test.js, lines 186-214
function compareField(msValue, thesisValue, sign, tolerance) {
  const expected = sign * msValue;
  const actual = thesisValue;

  // Both zero or both near-zero
  if (Math.abs(expected) < 1 && Math.abs(actual) < 1) {
    return { status: 'MATCH', pct: 0, expected, actual };
  }

  // One zero, other not
  if (expected === 0) {
    return {
      status: Math.abs(actual) < 1_000_000 ? 'MATCH' : 'DIFF',
      pct: Infinity,
      expected,
      actual,
    };
  }

  const pct = Math.abs((actual - expected) / expected);
  const threshold = THRESHOLDS[tolerance] || THRESHOLDS.close;

  let status;
  if (pct <= threshold) status = 'MATCH';
  else if (pct <= THRESHOLDS.close) status = 'CLOSE';
  else status = 'DIFF';

  return { status, pct, expected, actual };
}
```

### Existing FY Offset Detection (from morningstarAccuracy.test.js)
```javascript
// Source: src/engines/__tests__/morningstarAccuracy.test.js, lines 131-163
function detectYearOffset(msStmt, engineIncome, engineYears) {
  if (!msStmt || !engineIncome) return 0;
  const msYears = Object.keys(msStmt).filter(y => y !== 'TTM').map(Number);
  if (msYears.length === 0 || engineYears.length === 0) return 0;

  const scores = {};
  for (const offset of [0, -1, 1]) {
    let matches = 0;
    let compared = 0;
    for (const msYear of msYears) {
      const engineYear = msYear + offset;
      const msRev = msStmt[String(msYear)]?.['Total Revenue'];
      const engRev = engineIncome[engineYear]?.revenues;
      if (msRev != null && engRev != null) {
        compared++;
        const pct = Math.abs((engRev - msRev) / msRev);
        if (pct < 0.02) matches++;
      }
    }
    scores[offset] = { matches, compared };
  }

  // Bias toward 0: only use non-zero if strictly more matches AND at least 3
  const best = [0, -1, 1].reduce((a, b) =>
    scores[a].matches >= scores[b].matches ? a : b
  );
  if (best !== 0 && scores[best].matches > scores[0].matches &&
      scores[best].matches >= 3) {
    return best;
  }
  return 0;
}
```

### Engine Bundle + Export Pattern (from export-financials.mjs)
```javascript
// Source: validation/scripts/export-financials.mjs
// Step 1: Polyfill browser globals
globalThis.localStorage = {
  _data: {},
  getItem(key) { return this._data[key] ?? null; },
  setItem(key, val) { this._data[key] = String(val); },
  removeItem(key) { delete this._data[key]; },
  get length() { return Object.keys(this._data).length; },
  key(i) { return Object.keys(this._data)[i] ?? null; },
};

// Step 2: Import bundled engine
const { fetchEdgarStatements } = await import('./bundled-engines.mjs');

// Step 3: Fetch with rate limiting
const statements = await fetchEdgarStatements(ticker, { version: 'restated' });
// Returns: { years, income, balance, cashFlow, fiscalMonths, ttm, provenance }
```

### Morningstar Fixture JSON Structure
```json
{
  "ticker": "AAPL",
  "source": "morningstar",
  "currency": "USD",
  "fiscalYearEnd": "Sep 30",
  "statements": {
    "income": {
      "2021": {
        "Total Revenue": 365817000000,
        "Cost of Revenue": -212981000000,
        "Net Income after Non-Controlling/Minority Interests": 94680000000
      }
    },
    "balance_sheet": { ... },
    "cash_flow": { ... }
  }
}
```

### Field Mapping JSON Structure
```json
{
  "_meta": {
    "totalMapped": 87,
    "toleranceTiers": {
      "exact": "< 1% or < $1M difference",
      "close": "< 5%",
      "approximate": "< 10%",
      "relaxed": "< 20%",
      "informational": "no fail"
    }
  },
  "income": {
    "Total Revenue": {
      "thesisField": "revenues",
      "sign": 1,
      "tolerance": "exact",
      "notes": null
    },
    "Cost of Revenue": {
      "thesisField": "cost_of_revenue",
      "sign": -1,
      "tolerance": "close",
      "notes": "MS negative, XBRL positive"
    }
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Layer 2/3 XBRL resolution | Layer 1 only (static tag map) | B1 (2026-03-19) | Layer 2/3 produced 820 false matches; disconnecting improved accuracy from 79.5% to 83.7% |
| Revenue-matching FY detection | `entityFiscalYearEnd` + revenue validation | B1 (2026-03-19) | Revenue-matching caused NEE false positive; metadata-first is deterministic |
| Python comparison scripts | All-JavaScript vitest suite | A3 (2026-03-19) | Eliminated dual-language field mapping bugs |
| Single-source comparison (MS only) | Planned multi-source triangulation | Phase 2 (upcoming) | Can distinguish "our bug" from "their quirk" |

**Deprecated/outdated:**
- `validation/layer2_statements.py` and `validation/layer3_metrics.py` -- Python comparison scripts with known FY alignment bugs. Replaced by `morningstarAccuracy.test.js`.
- `validation/scripts/reference/batch-api-comparison.mjs` -- Mixed FMP/SimFin/mstarpy comparison with buggy FY alignment. Reference only.

## Open Questions

1. **Baseline accuracy target: 86.4% or 91.0%?**
   - What we know: CONTEXT.md says "produce the same ~86.4% baseline from Attempt #2." But the eng plan shows B8=86.4%, then research fixes brought it to 87.8%, then MS definitions pass brought it to 91.0%. The current engine + fixtures should produce 91.0%.
   - What's unclear: Does the user expect the harness to reproduce 86.4% (B8 checkpoint) or 91.0% (latest)?
   - Recommendation: Build the harness to reproduce whatever the current Vitest suite produces (likely 91.0%). Document both numbers. The success criterion #2 says "matches the known 86.4% baseline" but the engine has improved since then. The harness should match the CURRENT engine output, not a historical checkpoint.

2. **field-mapping.json location**
   - What we know: Currently at `src/engines/__tests__/fixtures/morningstar/field-mapping.json`. CONTEXT decision D-03 says single config file.
   - What's unclear: Should it stay in test fixtures or move to a shared location like `validation/mappings/` or `src/data/`?
   - Recommendation: Keep it where it is for Phase 1. Move it in Phase 2 when multi-source support requires restructuring. Avoid unnecessary file moves that could break the existing Vitest suite.

3. **EDGAR cache strategy for the standalone script**
   - What we know: The Vitest suite uses a fetch interceptor with disk cache in `fixtures/edgar-cache/`. The standalone script needs a similar mechanism.
   - What's unclear: Should the standalone script reuse the same cache directory, or have its own?
   - Recommendation: Reuse the same cache directory. The EDGAR responses are deterministic for a given company -- no reason to download twice.

4. **Non-December FY company count**
   - What we know: CONTEXT says 9 non-Dec FY companies. Actual truth set has 19 non-December FY companies (AAPL Sep, AMAT Oct, BOOT Mar, COST Aug, CPRT Jul, CRM Jan, INTU Jul, LEN Nov, LULU Jan, MSFT Jun, MU Aug, NKE May, NVDA Jan, PG Jun, SBUX Sep, ULTA Jan, V Sep, WMS Mar, WSM Jan). Of these, only 3 needed year offset in the existing test (LULU, ULTA, WSM -- all Jan FY ends; the engine now auto-relabels Jan/Feb FY).
   - Recommendation: The FY aligner must handle all 19 correctly, but only Jan/Feb companies needed offset historically. Test all 19 explicitly.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All scripts | yes | 24.13.1 | -- |
| esbuild | bundle.mjs | yes | 0.27.4 (via npx / Vite transitive dep) | -- |
| npm | Package management | yes | (bundled with Node) | -- |
| SEC EDGAR API | Engine data fetching | yes | Free, 10 req/sec | Disk-cached responses in edgar-cache/ |
| Vitest | Unit tests | yes | 4.1.0 | -- |

**Missing dependencies with no fallback:**
- node_modules not installed in this worktree. `npm install` needed before any scripts run.

**Missing dependencies with fallback:**
- None

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.0 |
| Config file | Inline in vite.config.js (default vitest settings) |
| Quick run command | `npx vitest run src/engines/__tests__/harness/` |
| Full suite command | `npm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| HARNESS-01 | FY alignment produces correct year labels for all 19 non-Dec FY companies | unit | `npx vitest run src/engines/__tests__/harness/fiscal-aligner.test.js -x` | Wave 0 |
| HARNESS-01 | Revenue agreement >99% for all 19 non-Dec FY companies after alignment | integration | `node validation/scripts/compare-morningstar.mjs --fy-check` | Wave 0 |
| HARNESS-02 | Sign convention: AAPL 2024 every mapped field has correct sign | unit | `npx vitest run src/engines/__tests__/harness/sign-convention.test.js -x` | Wave 0 |
| HARNESS-03 | Scale normalizer applies correct multiplier per source | unit | `npx vitest run src/engines/__tests__/harness/comparator.test.js -x` | Wave 0 |
| HARNESS-04 | Field mapping loads and covers all 87 mapped fields | unit | `npx vitest run src/engines/__tests__/harness/field-mapper.test.js -x` | Wave 0 |
| HARNESS-05 | Full harness produces JSON report + console summary from single script call | smoke | `node validation/scripts/compare-morningstar.mjs && test -f validation/reports/morningstar-accuracy.json` | Wave 0 |
| HARNESS-05 | Harness accuracy matches existing Vitest suite within 0.5% | regression | Comparison of both outputs | Manual |

### Sampling Rate
- **Per task commit:** `npx vitest run src/engines/__tests__/harness/ -x`
- **Per wave merge:** `npm test` (full suite including existing 173 tests)
- **Phase gate:** Full suite green + harness produces correct baseline accuracy

### Wave 0 Gaps
- [ ] `src/engines/__tests__/harness/fiscal-aligner.test.js` -- covers HARNESS-01
- [ ] `src/engines/__tests__/harness/sign-convention.test.js` -- covers HARNESS-02
- [ ] `src/engines/__tests__/harness/comparator.test.js` -- covers HARNESS-03
- [ ] `src/engines/__tests__/harness/field-mapper.test.js` -- covers HARNESS-04

## Existing Code Inventory

### Directly Reusable (no modifications needed)
| Asset | Path | What It Provides |
|-------|------|-----------------|
| Morningstar JSON fixtures | `src/engines/__tests__/fixtures/morningstar/{TICKER}.json` | 50 companies, already parsed from CSV, year-labeled, full-dollar values |
| Field mapping | `src/engines/__tests__/fixtures/morningstar/field-mapping.json` | 87 mapped fields, sign multipliers, tolerance tiers, notes |
| Engine bundler | `validation/scripts/bundle.mjs` | Bundles XBRL engine for Node.js CLI execution |
| EDGAR disk cache | `src/engines/__tests__/fixtures/morningstar/edgar-cache/` | Pre-cached SEC API responses for 50 companies |
| Comparison logic | `morningstarAccuracy.test.js` lines 186-363 | Proven compareField + compareCompany functions |

### Reusable with Adaptation
| Asset | Path | What Needs Changing |
|-------|------|-------------------|
| Export pipeline | `validation/scripts/export-financials.mjs` | Adapt the localStorage polyfill + bundle import pattern for the harness |
| FY offset detection | `morningstarAccuracy.test.js` lines 131-163 | Extract from test, add `entityFiscalYearEnd` as primary resolver |
| Report generation | `morningstarAccuracy.test.js` lines 368-454 | Extract from test, add JSON output alongside console |

### Key Engine Interfaces
```javascript
// fetchEdgarStatements(ticker, { version: 'restated' })
// Returns: {
//   years: [2024, 2023, 2022, 2021, 2020],
//   income: { 2024: { revenues: 391035000000, ... } },
//   balance: { 2024: { assets: 352583000000, ... } },
//   cashFlow: { 2024: { operating_cash_flow: 118254000000, ... } },
//   fiscalMonths: { 2024: 'Sep', 2023: 'Sep', ... },
//   ttm: { income: {...}, balance: {...}, cashFlow: {...} },
//   provenance: { income: { 2024: { revenues: { tag: '...', layer: 1 } } } },
//   industryType: 'standard'
// }

// extractFiscalYearEnds(companyFacts)
// Returns: { 2024: 'Sep', 2023: 'Sep', 2022: 'Sep', ... }

// fetchCompanyFacts(cik) -> { facts: { 'us-gaap': {...} }, entityType: '...', fiscalYearEnd: '0930' }
```

### Special Field Handling Rules (from existing test)
These must be preserved in the new harness:

1. **Intangible Assets net-vs-gross:** MS "Intangibles other than Goodwill" is GROSS. Compute implied NET = GROSS + AccumAmort before comparison.
2. **Operating Income reported-vs-normalized:** MS "Total Operating Profit/Loss" is normalized (excludes restructuring). Use "Reported Total Operating Profit/Loss" when available.
3. **Accrued Liabilities combined-only:** Skip comparison for companies that only report combined "Payables and Accrued Expenses" (no separate accrued line).
4. **Effective tax rate scale:** MS stores as decimal (0.24), engine stores as percentage (24.0). Multiply MS value by 100.
5. **Financial sector tolerance:** Relax tolerance to "relaxed" for revenues, total_debt, net_debt on BRK-B, JPM, MET, WFC.
6. **Spin-off years:** Skip pre-spin years for EW (2023), JNJ (2023), T (2022).
7. **EUR companies:** Skip RACE entirely (EUR-denominated filings).

### Non-December FY Companies (Complete List from Truth Set)
| FY Month | Companies | Offset Needed |
|----------|-----------|---------------|
| Jan | LULU, ULTA, WSM, CRM, NVDA | Only LULU, ULTA, WSM needed historical offset (engine now auto-offsets Jan/Feb) |
| Feb | (none in truth set) | -- |
| Mar | BOOT, WMS | No offset needed |
| May | NKE | No offset needed |
| Jun | MSFT, PG | No offset needed |
| Jul | CPRT, INTU | No offset needed |
| Aug | COST, MU | No offset needed |
| Sep | AAPL, SBUX, V | No offset needed |
| Oct | AMAT | No offset needed |
| Nov | LEN | No offset needed |

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `src/engines/__tests__/morningstarAccuracy.test.js` -- existing proven comparison logic
- Codebase analysis: `src/engines/__tests__/fixtures/morningstar/field-mapping.json` -- 87 field mappings with sign/tolerance
- Codebase analysis: `src/engines/edgar.js` -- `extractFiscalYearEnds` and `fetchCompanyFacts` implementations
- Codebase analysis: `src/engines/edgarFinancials.js` -- `fetchEdgarStatements` return structure and Jan/Feb FY offset logic
- Codebase analysis: `validation/scripts/bundle.mjs` and `export-financials.mjs` -- proven CLI engine access patterns
- Codebase analysis: `scripts/morningstar-to-fixtures.cjs` -- CSV-to-JSON conversion producing existing fixtures
- Project documentation: `gstack/plans/gstack-xbrl-annual-normalization-eng-plan-20260319.md` -- accuracy history 79.5% -> 91.0%
- Project research: `.planning/research/FEATURES.md`, `PITFALLS.md`, `ARCHITECTURE.md` -- detailed domain analysis

### Secondary (MEDIUM confidence)
- CONTEXT.md decisions D-01 through D-06 -- user-verified constraints
- Truth set CSV analysis -- 19 non-December FY companies identified by parsing CSV footer lines

### Tertiary (LOW confidence)
- None -- all findings verified against codebase

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, all tools already in project
- Architecture: HIGH -- pipeline pattern proven by existing test suite; new harness extracts and restructures existing code
- Pitfalls: HIGH -- all pitfalls documented from real B1-B8 experience with specific examples
- FY alignment: HIGH -- `extractFiscalYearEnds` implementation verified in edgar.js, offset behavior verified in eng plan

**Research date:** 2026-03-25
**Valid until:** Indefinite (Phase 1 scope is well-defined, no external dependency changes expected)
