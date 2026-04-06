# Phase 4: Scale Validation - Research

**Researched:** 2026-03-26
**Domain:** Financial data validation at S&P 500 scale using FMP as truth set
**Confidence:** HIGH

## Summary

Phase 4 scales the existing 50-company Morningstar validation to all 503 S&P 500 companies using FMP (Financial Modeling Prep) as the primary truth set. The infrastructure is largely built: `fmp-collector.mjs` already fetches and caches FMP data in canonical field format, `comparator.mjs` does field-level comparison with tolerance tiers, `reporter.mjs` generates console + JSON reports, and `bundled-engines.mjs` runs the XBRL engine outside the browser. The main work is: (1) building a batch orchestrator for 503 companies, (2) adapting the comparison pipeline from Morningstar fixtures to FMP cached data, (3) running iterative fix+validate cycles on findings, and (4) adding accounting identity checks at scale.

A critical finding: The FMP Starter plan has **300 calls/min with no daily cap** (documented in user's memory file `reference_financial_data_apis.md`). This means 503 companies x 3 endpoints = 1,509 calls can complete in ~5-15 minutes, NOT 2 days. The "2-day batch" from the CONTEXT assumed the old 250 calls/day free-tier limit. The actual fetch is a single session, though EDGAR fetches for engine data (503 companies x ~4 SEC requests at 10 req/sec) add another ~4 minutes.

The existing 50-company FMP cache already stores data in canonical field names (sign + scale applied at fetch time), so the comparison pipeline can directly compare FMP values against engine values using the field alias map. The comparison script pattern from `compare-morningstar.mjs` provides the template: browser polyfills, SEC fetch interceptor with disk cache, engine bundle import, progress reporting.

**Primary recommendation:** Build `compare-sp500-fmp.mjs` as the S&P 500 orchestrator, reusing `fmp-collector.mjs`, `field-alias-map.mjs`, and the `bundled-engines.mjs` pattern. Add tiered reporting (scoring-critical hard pass / display soft flag) using the existing `FIELD_TIERS` from `tickerAudit.js`. Run iteratively: fetch all FMP data, compare, fix what FMP confirms as engine bugs, re-compare.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Accuracy target is 94%+ on the 50-company Morningstar truth set (the current level). The 98% target was aspirational -- remaining diffs are methodology, not bugs. Phase 4 proves engine quality at S&P 500 scale rather than pushing the MS number higher.
- **D-02:** FMP is the primary truth set for S&P 500 validation. SimFin and mstarpy may be added later as secondary validation but are NOT required for Phase 4 completion.
- **D-03:** Phase 4 is NOT validation-only. It's iterative: run FMP comparison across S&P 500, fix what's clearly wrong, re-validate. Stop when scoring-critical field accuracy stabilizes (no more clear wins from fixes).
- **D-04:** Fix boundary: only fix issues that FMP comparison confirms as engine bugs (our value differs from FMP on scoring-critical fields). Don't chase methodology diffs or display-only field disagreements.
- **D-05:** Investigate RACE (Ferrari) -- files in EUR, not USD. The 0% accuracy is a currency convention issue, not an engine failure. Fix or exclude with documentation.
- **D-06:** Investigate financial sector outliers (MET 78.6%, WFC 88.9%) using FMP as truth set. Determine whether our industry overlays are actually wrong or if Morningstar used different definitions. Fix if FMP confirms our values are wrong.
- **D-07:** Other low-accuracy companies (CRM 76.1%, EW 86.6%, EQIX 87.7%) -- investigate during fix+validate cycle. Document findings.
- **D-08:** Tiered field comparison: scoring-critical fields (~30 fields feeding Rule One scoring) are hard-pass criteria. Display-only fields are soft-flagged and reported separately. Both tiers reported.
- **D-09:** S&P 500 only for this phase. No beyond-S&P validation -- that's a future milestone.
- **D-10:** Batch fetch over 2 days with disk cache. Day 1: ~250 companies. Day 2: remaining ~253. 7-day TTL cache. All subsequent validation runs use cached data.

### Claude's Discretion
- S&P 500 ticker list source and management
- Accounting identity checks to include alongside FMP comparison
- Batch scheduling details (rate limiting, retry logic)
- Fix prioritization order within the iterative cycle
- Report format for S&P 500 results (console + JSON, following Phase 1-3 patterns)

### Deferred Ideas (OUT OF SCOPE)
- Beyond-S&P validation (random sample from 5,758 US-listed universe) -- user explicitly deferred to a future milestone
- SimFin and mstarpy as secondary S&P 500 validation sources -- "add later as possible validation attributes"
- Subscription cancellation timing -- not discussed, user will decide separately
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SCALE-01 | 98%+ accuracy on 50-company MS truth set (annual financials) | User recalibrated to 94%+ (D-01). Current baseline is 94.8%. Maintained through regression protection -- `compare-morningstar.mjs` runs after engine fixes. |
| SCALE-02 | S&P 500 structural validation -- accounting identities + completeness checks across all 503 companies | `validation.js` already has 9 accounting identity checks. New orchestrator runs these for all 503 companies via the bundled engine. |
| SCALE-03 | 98%+ accuracy across all US-listed equities (structural validation + spot checks outside S&P 500) | Deferred per D-09 -- S&P 500 only for this phase. |
| SCALE-04 | Elimination of paid API dependencies -- FMP and SimFin subscriptions cancelled once normalization rules produce 98%+ independently | Subscription decision deferred per CONTEXT. Phase 4 uses FMP as truth set, not eliminates it. |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js | 24.13.1 | Runtime for validation scripts | Confirmed on dev machine |
| esbuild | (via bundle.mjs) | Bundles browser engine code for Node.js | Already used in existing `bundle.mjs` |
| cheerio | 1.2.0 | S&P 500 ticker list scraping from Wikipedia | Already a project dependency |
| vitest | 4.1.0 | Unit tests for new validation code | Existing test framework |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| FMP Stable API | v4 | Truth set data source (income/balance/cashflow) | All S&P 500 validation |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Wikipedia S&P 500 list | FMP `/sp500_constituent` endpoint | Would cost API calls; Wikipedia is free and already proven in `coverage-audit.js` and `build-tag-classifications.js` |
| Per-field FMP comparison | Triangulation (FMP + SimFin + mstarpy) | More sources = higher confidence, but user locked to FMP-only for Phase 4 (D-02) |
| Custom comparison engine | Reuse existing `comparator.mjs` | Existing comparator is MS-specific (fixture format); adapt for FMP format instead |

**Installation:**
No new dependencies needed. All required packages already installed.

## Architecture Patterns

### Recommended Project Structure
```
validation/
├── scripts/
│   ├── compare-sp500-fmp.mjs       # NEW: S&P 500 FMP comparison orchestrator
│   ├── compare-morningstar.mjs     # EXISTING: 50-company MS baseline (regression gate)
│   ├── fetch-sp500-fmp.mjs         # NEW: Standalone FMP batch fetcher (optional separation)
│   ├── bundle.mjs                  # EXISTING: Engine bundler
│   ├── bundled-engines.mjs         # EXISTING: Bundled engine output
│   └── lib/
│       ├── fmp-collector.mjs       # EXISTING: FMP fetch + cache (extend for batch)
│       ├── disk-cache.mjs          # EXISTING: Disk cache utilities
│       ├── field-alias-map.mjs     # EXISTING: Canonical-to-engine name mapping
│       ├── sp500-fmp-comparator.mjs # NEW: FMP-specific comparison logic (tiered)
│       └── sp500-reporter.mjs      # NEW: S&P 500 scale reporting
├── cache/
│   └── fmp/                        # EXISTING: 50 files, extend to 503
├── reports/
│   ├── morningstar-accuracy.json   # EXISTING: 50-company MS baseline
│   ├── sp500-fmp-accuracy.json     # NEW: S&P 500 FMP comparison results
│   └── sp500-identity-checks.json  # NEW: Accounting identity results
└── data/
    └── sp500-tickers.json          # NEW: Cached S&P 500 ticker list
```

### Pattern 1: FMP vs Engine Comparison Pipeline

**What:** Compare 503 companies' FMP data against our XBRL engine output using tiered field classification.

**When to use:** Every iteration of the fix+validate cycle.

**How it works:**
1. Load S&P 500 ticker list (Wikipedia scrape, cached to JSON)
2. For each ticker: read FMP cache + run engine (or read engine cache)
3. Map FMP canonical names to engine field names using `FIELD_ALIASES` + `REVERSE_ALIASES`
4. Compare each field/year using tolerance thresholds (exact < 1%, close < 5%, approximate < 10%)
5. Classify results by `FIELD_TIERS`: Tier 1 (scoring-critical) = hard pass, Tier 2 (display) = soft flag
6. Generate tiered report (separate accuracy for Tier 1 vs Tier 2 vs Tier 3)

**Key insight:** FMP data in the cache is already in canonical field names (e.g., `revenues`, `cost_of_revenue`). The engine uses different names (e.g., `equity` not `stockholders_equity`). The `FIELD_ALIASES` map from `field-alias-map.mjs` bridges this gap. The comparison must resolve aliases in BOTH directions: FMP canonical -> engine name for lookup, engine name -> canonical for FMP lookup.

### Pattern 2: Iterative Fix+Validate Cycle

**What:** Run comparison, identify systematic failures, fix engine, re-compare.

**When to use:** After initial S&P 500 comparison reveals patterns.

**Flow:**
1. Run full S&P 500 comparison -> `sp500-fmp-accuracy.json`
2. Analyze top failure patterns (field x company count)
3. Fix highest-impact Tier 1 failures in `edgarFinancials.js` / overlays
4. Re-run `compare-morningstar.mjs` to check MS regression
5. Re-run `compare-sp500-fmp.mjs` to verify fix + detect new patterns
6. Repeat until Tier 1 accuracy stabilizes

**Key insight:** This mirrors Phase 3's approach. Each fix must be verified against both the 50-company MS baseline (regression gate) AND the S&P 500 FMP comparison (progress gate). Engine bundle must be rebuilt (`node validation/scripts/bundle.mjs`) after each engine change.

### Pattern 3: Accounting Identity Checks at Scale

**What:** Run `validateCompany()` from `validation.js` for all 503 companies.

**When to use:** Once per iteration, alongside FMP comparison.

**Available checks (already in `validation.js`):**
- Assets = Liabilities + Equity (1% tolerance for mezzanine equity)
- Current Assets + Non-Current Assets = Total Assets
- Current Liab + Non-Current Liab = Total Liabilities
- Gross Profit = Revenue - COGS
- OCF + ICF + FCF + FX = Change in Cash
- FCF = OCF - CapEx
- Net Income = Pre-Tax Income - Tax (5% tolerance for discontinued ops)
- Working Capital = Current Assets - Current Liabilities
- Net Debt = Total Debt - Cash
- Operating Income = GP - Itemized OpEx (5% tolerance)

### Anti-Patterns to Avoid
- **Comparing field names literally:** FMP uses `stockholders_equity`, engine uses `equity`. Always resolve through `FIELD_ALIASES`.
- **Treating all failures equally:** Tier 1 failures are blocking; Tier 3 failures are informational. Don't fix Tier 3 issues that might break Tier 1.
- **Fixing without FMP confirmation:** D-04 says only fix what FMP confirms as bugs. If the engine value differs from FMP on a Tier 2+ field but Tier 1 fields are fine, don't fix.
- **Fetching FMP data during comparison:** Always fetch and cache first, then compare from cache. Never mix network I/O with comparison logic.
- **Forgetting to rebuild the bundle:** After engine changes, `bundled-engines.mjs` is stale. Always run `node validation/scripts/bundle.mjs` before re-running comparisons.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| S&P 500 ticker list | Static hardcoded list | Wikipedia scrape (existing pattern in `coverage-audit.js`) | List changes quarterly; Wikipedia is the canonical public source |
| FMP data fetching | Custom fetch logic | `fmp-collector.mjs` (extend for batch) | Already handles caching, field mapping, sign conventions |
| Field name bridging | Manual field name mapping | `field-alias-map.mjs` (`FIELD_ALIASES` + `REVERSE_ALIASES`) | 17 aliases already tested and proven in Phase 3 triangulation |
| Engine bundling | Inline Node.js polyfills | `bundle.mjs` + `bundled-engines.mjs` | esbuild handles `import.meta.env`, dependencies, and exports |
| Accounting identity checks | New validation functions | `validateCompany()` from `validation.js` (already bundled) | 9 checks already implemented with appropriate tolerances |
| Morningstar regression | Ad-hoc spot checks | `compare-morningstar.mjs` (full 50-company run) | Established baseline at 94.8%, reports fields gained/lost |

**Key insight:** ~80% of the infrastructure already exists. Phase 4's main contribution is an orchestrator script and a tiered reporting layer, not new comparison logic.

## Common Pitfalls

### Pitfall 1: FMP Field Names vs Engine Field Names
**What goes wrong:** Comparison shows 0% match because field names don't align.
**Why it happens:** FMP collector maps to canonical names (`stockholders_equity`, `total_assets`). Engine uses shorter names (`equity`, `assets`). Without alias resolution, every field lookup returns `undefined`.
**How to avoid:** Use `resolveFieldName()` from `field-alias-map.mjs` when looking up engine values by canonical name. Use `resolveCanonicalName()` for the reverse. Test with AAPL first (exists in both 50-company cache and will be in S&P 500 set).
**Warning signs:** If comparison shows 100% MISSING_FIELD, alias resolution is broken.

### Pitfall 2: FMP Fiscal Year Alignment
**What goes wrong:** Values compared across different fiscal years (e.g., FMP's FY2024 vs engine's calendar 2024 for a non-December FY company).
**Why it happens:** FMP uses `fiscalYear` field, EDGAR uses filing dates. For companies with non-December fiscal year ends (e.g., AAPL ends Sep, WMT ends Jan), FMP's `fiscalYear` may differ from the engine's year key by 1.
**How to avoid:** The existing `fmp-collector.mjs` stores data keyed by `String(row.fiscalYear)`. The engine's `fetchEdgarStatements()` returns years keyed by the fiscal year end. Check alignment for non-December FY companies. The `fiscal-aligner.mjs` pattern from the MS comparison can be adapted.
**Warning signs:** Systematic 1-year offset in comparison results for specific companies (NKE, WMT, FDX, etc.).

### Pitfall 3: RACE and EUR Filers
**What goes wrong:** RACE (Ferrari) reports in EUR, not USD. All financial values differ by the exchange rate (~10-15%).
**Why it happens:** RACE is an Italian company listed on NYSE but files in EUR. XBRL tags report EUR values; FMP may report USD-converted values.
**How to avoid:** D-05 says investigate and either fix or exclude with documentation. Most likely outcome: exclude RACE from the S&P 500 accuracy calculation with a `SKIP_EUR` status (same pattern as MS comparison). Document the currency conversion issue.
**Warning signs:** RACE showing 0% accuracy.

### Pitfall 4: Financial Sector Overlay Accuracy
**What goes wrong:** Banks (JPM, WFC, BAC, GS, MS, C), insurance (MET, ALL, AIG, BRK-B), and REITs (EQIX, AMT, PLD, O) show systematically lower accuracy.
**Why it happens:** Industry overlays in `industryOverlays.js` may not capture all industry-specific XBRL tags. Revenue tags for insurers include premiums; banks use NII; REITs use specialized real estate income tags.
**How to avoid:** D-06 says investigate MET and WFC with FMP data. Use FMP as the arbiter: if FMP confirms our value is wrong, fix the overlay. If FMP and our engine agree but differ from MS, the overlay is correct and MS was the outlier.
**Warning signs:** Entire financial sector (50+ companies) having lower accuracy than the standard set.

### Pitfall 5: Engine Bundle Staleness
**What goes wrong:** Comparison runs against old engine code after making fixes.
**Why it happens:** `bundled-engines.mjs` is a build artifact. Editing `edgarFinancials.js` doesn't auto-update it.
**How to avoid:** Always run `node validation/scripts/bundle.mjs` before comparison. Better: have the comparison script auto-rebuild (pattern from `compare-morningstar.mjs` lines 115-123).
**Warning signs:** Fixes don't change comparison results.

### Pitfall 6: FMP Rate Limiting at Scale
**What goes wrong:** FMP returns 429 errors or throttles responses.
**Why it happens:** 503 companies x 3 endpoints = 1,509 calls. FMP Starter allows 300/min, so the math works (~5 minutes), but bursting all 3 endpoints simultaneously for a single ticker could exceed instantaneous rate limits.
**How to avoid:** Fetch all 3 endpoints per ticker in parallel (3 simultaneous calls), then wait 200-300ms before the next ticker. This gives ~100 tickers/min, well under 300 calls/min. Use exponential backoff on 429 errors.
**Warning signs:** Sporadic null returns from FMP (check `console.warn` from `fmp-collector.mjs`).

## Code Examples

### S&P 500 Ticker List Fetch (Reuse Existing Pattern)

```javascript
// Source: validation/scripts/coverage-audit.js lines 214-244
import cheerio from 'cheerio';

async function fetchSP500Tickers() {
  const html = await fetch('https://en.wikipedia.org/wiki/List_of_S%26P_500_companies')
    .then(r => r.text());
  const $ = cheerio.load(html);
  const tickers = [];
  $('table.wikitable').first().find('tbody tr').each((i, row) => {
    const cells = $(row).find('td');
    if (cells.length === 0) return;
    const ticker = $(cells[0]).text().trim().replace('.', '-'); // BRK.B -> BRK-B
    if (ticker) tickers.push(ticker);
  });
  return tickers; // ~503 tickers
}
```

### FMP Batch Fetch with Rate Limiting

```javascript
// Extend fmp-collector.mjs pattern for batch use
import { fetchFmpData } from './lib/fmp-collector.mjs';

async function batchFetchFmp(tickers, apiKey, cacheDir, fieldMappingPath) {
  let fetched = 0, cached = 0, failed = 0;

  for (let i = 0; i < tickers.length; i++) {
    const ticker = tickers[i];
    const result = await fetchFmpData(ticker, {
      apiKey, cacheDir, fieldMappingPath,
      cacheTtlMs: 7 * 24 * 60 * 60 * 1000, // 7-day TTL
    });

    if (result) {
      fetched++;
    } else {
      failed++;
      process.stderr.write(`  FAILED: ${ticker}\n`);
    }

    // Progress
    if ((i + 1) % 50 === 0) {
      process.stderr.write(`  [${i + 1}/${tickers.length}] ${fetched} fetched, ${cached} cached, ${failed} failed\n`);
    }

    // Rate limit: ~200ms between tickers (3 calls/ticker -> ~15 calls/sec)
    await new Promise(r => setTimeout(r, 200));
  }

  return { fetched, cached, failed };
}
```

### Tiered FMP Comparison (Adapting comparator.mjs Pattern)

```javascript
// Source: tickerAudit.js FIELD_TIERS + comparator.mjs compareField
import { FIELD_ALIASES, REVERSE_ALIASES, resolveFieldName } from './lib/field-alias-map.mjs';

// Tier 1: Scoring-critical (hard pass)
const TIER_1_FIELDS = new Set([
  'revenues', 'operating_income_loss', 'net_income_loss',
  'basic_earnings_per_share', 'diluted_earnings_per_share',
  'income_tax', 'cash', 'long_term_debt', 'equity',
  'retained_earnings', 'shares_outstanding', 'assets', 'liabilities',
  'net_cash_flow_from_operating_activities', 'capital_expenditures',
  'depreciation_amortization', 'dividends_paid', 'share_repurchases',
  // ... (all ~22 Tier 1 fields from FIELD_TIERS)
]);

function compareFmpToEngine(fmpData, engineData, years) {
  const results = [];

  for (const stmtKey of ['income', 'balance', 'cashFlow']) {
    for (const year of years) {
      const fmpYear = fmpData[stmtKey]?.[year];
      const engineYear = engineData[stmtKey]?.[year];
      if (!fmpYear || !engineYear) continue;

      for (const [canonical, fmpValue] of Object.entries(fmpYear)) {
        // Resolve canonical -> engine field name
        const engineFieldName = resolveFieldName(canonical);
        const engineValue = engineYear[engineFieldName];

        // Determine tier
        const tier = TIER_1_FIELDS.has(engineFieldName) ? 1 : 2;

        // Compare
        // ... (same pattern as comparator.mjs compareField)
      }
    }
  }
  return results;
}
```

### Accounting Identity Orchestrator

```javascript
// Reuse existing validateCompany from bundled engine
const { validateCompany, fetchEdgarStatements } = await import('./bundled-engines.mjs');

async function runIdentityChecks(tickers) {
  const results = [];
  for (const ticker of tickers) {
    const engineData = await fetchEdgarStatements(ticker, { version: 'restated' });
    if (!engineData) {
      results.push({ ticker, status: 'ENGINE_ERROR', checks: [] });
      continue;
    }

    const validation = validateCompany(engineData);
    results.push({
      ticker,
      status: validation.identityChecks.every(c => c.status !== 'fail') ? 'PASS' : 'FAIL',
      checks: validation.identityChecks,
    });
  }
  return results;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 50-company Morningstar comparison | S&P 500 FMP comparison | Phase 4 (now) | 10x scale increase, FMP as single truth source |
| 250 calls/day FMP limit assumption | 300 calls/min (Starter plan) | Phase 2 discovery | Fetch completes in ~15 min, not 2 days |
| Multi-source triangulation for truth | FMP-only for S&P 500 truth (D-02) | Phase 4 decision | Simpler pipeline, single source of truth |
| Fix all field mismatches | Fix only FMP-confirmed Tier 1 bugs (D-04) | Phase 4 decision | Focused effort, no methodology diff chasing |

**Deprecated/outdated:**
- The 250 calls/day limit is from the free FMP tier. The project uses FMP Starter ($20/mo) with 300 calls/min and no daily cap.
- The "2-day batch" approach is unnecessary. A single session completes in ~15 minutes for all 503 companies.

## Open Questions

1. **FMP Fiscal Year Alignment for Non-December FY Companies**
   - What we know: FMP uses `fiscalYear` field, engine uses filing-date-derived year keys. AAPL (Sep FY) works because FMP's FY2024 = engine's 2024 (both mean the year ending Sep 2024). But some edge cases may exist.
   - What's unclear: Whether FMP always keys fiscal years the same way as our engine for all 503 companies. Companies with January FY ends (WMT, COST) could have off-by-one issues.
   - Recommendation: Test alignment for 5-10 non-December FY companies before full batch. Compare FMP revenue for known year against engine revenue for same year key. Fix alignment if needed.

2. **FMP Data Coverage for Newer S&P 500 Additions**
   - What we know: FMP Starter provides 5 years of history. Some recent S&P 500 additions (IPOs, recent inclusions) may have limited FMP history.
   - What's unclear: How many of the 503 companies have < 3 years of FMP data.
   - Recommendation: Log companies with < 3 overlapping years and exclude from accuracy calculation (not enough data to validate meaningfully).

3. **RACE Investigation Outcome**
   - What we know: RACE files in EUR. FMP likely returns USD-converted values. Our engine returns raw XBRL (EUR). The 0% MS accuracy is a known issue.
   - What's unclear: Whether FMP's USD conversion is reliable enough to use as truth, or whether RACE should simply be excluded.
   - Recommendation: Compare FMP RACE data against known EUR values * approximate exchange rate. If they align, we can flag RACE as EUR-filer and skip. If FMP does the conversion for us, we could potentially add an exchange rate adjustment to the engine. Most pragmatic: skip with documentation (same as current MS approach).

4. **Threshold for "Accuracy Stabilized"**
   - What we know: D-03 says stop when scoring-critical field accuracy stabilizes with "no more clear wins from fixes."
   - What's unclear: What quantitative threshold defines "stabilized." Is it 0 new Tier 1 fixes found? Accuracy plateau?
   - Recommendation: Define stabilization as: Tier 1 accuracy improvement < 0.5% between iterations AND no Tier 1 failure pattern affecting 5+ companies. Document this threshold in the orchestrator.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All validation scripts | Yes | v24.13.1 | -- |
| npm / esbuild | Engine bundling | Yes | (in devDeps) | -- |
| cheerio | Wikipedia S&P 500 scrape | Yes | 1.2.0 | Hardcoded fallback list (exists in coverage-audit.js) |
| FMP API key | FMP data fetching | Yes | (in .env.local) | -- |
| EDGAR/SEC API | Engine XBRL fetches | Yes | (public, rate-limited) | -- |
| vitest | Test execution | Yes | 4.1.0 | -- |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** None.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.0 |
| Config file | vite.config.js (vitest configured within) |
| Quick run command | `npm test` |
| Full suite command | `npm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SCALE-01 | MS accuracy stays at 94%+ | integration (CLI) | `node validation/scripts/compare-morningstar.mjs` | Yes |
| SCALE-02 | S&P 500 identity checks pass | integration (CLI) | `node validation/scripts/compare-sp500-fmp.mjs` | No -- Wave 0 |
| SCALE-03 | Deferred (beyond-S&P) | -- | -- | -- |
| SCALE-04 | Deferred (subscription cancellation) | -- | -- | -- |

### Sampling Rate
- **Per task commit:** `node validation/scripts/compare-morningstar.mjs` (regression gate, ~2 min)
- **Per wave merge:** Full S&P 500 comparison + identity checks (~20 min with warm cache)
- **Phase gate:** Full MS baseline + S&P 500 comparison both green

### Wave 0 Gaps
- [ ] `validation/scripts/compare-sp500-fmp.mjs` -- main S&P 500 orchestrator script
- [ ] `validation/scripts/lib/sp500-fmp-comparator.mjs` -- tiered comparison logic (optional; could be inline)
- [ ] `validation/data/sp500-tickers.json` -- cached ticker list for reproducible runs

## Important Technical Details

### FMP Rate Limit Reality (Corrects D-10)

D-10 assumes a 2-day batch fetch. This was based on the free-tier 250 calls/day limit from REQUIREMENTS.md (TRI-01). The actual FMP Starter plan ($20/mo, currently active) has:
- **300 calls/min** rate limit
- **No daily cap**
- 5-year history depth

This means: 503 tickers x 3 endpoints = 1,509 calls. At a conservative 100 calls/min (3 tickers/min with parallel endpoint fetches + 200ms delays), the full fetch completes in **~17 minutes**. With the disk cache (7-day TTL), subsequent runs use cached data and take ~0 additional FMP calls.

**Recommendation:** Fetch all 503 companies in a single session. No need for Day 1/Day 2 split. But keep the disk cache with 7-day TTL per D-10 -- this is still valuable for iterative comparison runs.

### FMP Data is Already in Canonical Field Names

The existing `fmp-collector.mjs` applies field mapping at fetch time. Cached files in `validation/cache/fmp/` store data like:
```json
{
  "_cachedAt": "2026-03-26T02:03:14.112Z",
  "data": {
    "income": {
      "2021": {
        "revenues": 365817000000,
        "cost_of_revenue": 212981000000,
        ...
      }
    }
  }
}
```

These canonical names (e.g., `revenues`, `stockholders_equity`) need to be resolved to engine names (e.g., `revenues` stays the same, `stockholders_equity` -> `equity`) using `resolveFieldName()`.

### FIELD_TIERS Already Defined

The tiered field classification for D-08 already exists in `src/engines/tickerAudit.js` (lines 500-532). 22 Tier 1 (scoring-critical) fields, 30 Tier 2 (display) fields, 33 Tier 3 (expanded) fields. The new comparison script should import or duplicate this classification.

**Important:** The FIELD_TIERS use engine field names (e.g., `equity`, `assets`, `cash`), not canonical names. The comparison must resolve FMP canonical names to engine names BEFORE doing tier lookups.

### Existing FMP Cache Contains 50 Tickers

`validation/cache/fmp/` already has 50 cached files from Phase 2. These will serve as a warm start -- 50 of the 503 tickers won't need re-fetching (if within TTL). The batch fetcher should check cache freshness before making API calls (the existing `isExpired()` from `disk-cache.mjs` handles this).

### S&P 500 Ticker List: Wikipedia Scrape with JSON Cache

Two existing scripts already scrape the S&P 500 list from Wikipedia (`coverage-audit.js` and `build-tag-classifications.js`). Both use the same cheerio parsing pattern. For Phase 4, the pattern should be:

1. Check for `validation/data/sp500-tickers.json` (cached list with timestamp)
2. If fresh (< 7 days), use cached list
3. If stale or missing, scrape Wikipedia and cache

This avoids repeated Wikipedia scrapes across comparison runs and provides a stable ticker list during iterative fix+validate cycles.

### SEC Fetch Interceptor Pattern (Critical for Engine Runs)

When running the engine in Node.js (via `bundled-engines.mjs`), SEC EDGAR API calls go through `globalThis.fetch`. The comparison script MUST install the SEC fetch interceptor (pattern from `compare-morningstar.mjs` lines 56-110) that:
1. Rewrites Vite proxy URLs (`/api/edgar/` -> `https://data.sec.gov/`)
2. Disk-caches SEC responses in `edgar-cache/`
3. Rate-limits to 10 req/sec (SEC API requirement)
4. Adds required `User-Agent` header

Without this, the engine's SEC calls will fail (they use relative URLs designed for the Vite dev proxy).

## Sources

### Primary (HIGH confidence)
- `validation/scripts/lib/fmp-collector.mjs` -- FMP fetch/cache implementation, verified working with 50 tickers
- `validation/scripts/lib/comparator.mjs` -- Field comparison logic with tolerance tiers
- `validation/scripts/lib/field-alias-map.mjs` -- 17 canonical-to-engine field aliases
- `validation/scripts/lib/disk-cache.mjs` -- Cache read/write/expiry utilities
- `validation/scripts/compare-morningstar.mjs` -- Full orchestrator pattern (SEC interceptor, browser polyfills, progress reporting)
- `validation/scripts/bundle.mjs` -- Engine bundling for Node.js
- `src/engines/tickerAudit.js` lines 500-532 -- FIELD_TIERS (Tier 1/2/3 classification)
- `src/engines/validation.js` -- 9 accounting identity checks
- `validation/reports/morningstar-accuracy.json` -- Current baseline: 94.8% (13,629/14,382 match)
- User memory `reference_financial_data_apis.md` -- FMP Starter: 300 calls/min, no daily cap

### Secondary (MEDIUM confidence)
- [FMP Pricing Plans](https://site.financialmodelingprep.com/pricing-plans) -- Rate limit tiers (verified against user's documented experience)
- Wikipedia S&P 500 list scraping pattern (proven in 2 existing scripts)

### Tertiary (LOW confidence)
- None. All findings verified against existing code and user documentation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- All tools already in the project, no new dependencies
- Architecture: HIGH -- Pattern is well-established from Phase 1-3 scripts; this is adaptation, not invention
- Pitfalls: HIGH -- Based on actual code review of field aliasing, fiscal year handling, and rate limiting in existing scripts
- FMP rate limits: HIGH -- Verified against user's own documentation in persistent memory

**Research date:** 2026-03-26
**Valid until:** 2026-04-25 (stable domain -- FMP API, XBRL engine, validation infrastructure all mature)
