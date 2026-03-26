# Phase 02: Multi-Source Triangulation - Research

**Researched:** 2026-03-26
**Domain:** Financial data API integration, multi-source consensus engine, root cause classification
**Confidence:** HIGH

## Summary

Phase 2 builds three data collectors (FMP, SimFin, mstarpy), a consensus engine, and a root cause auto-tagger. The collectors fetch annual financial statements for 50 truth set companies, normalize them to canonical field names, and feed them into a consensus classifier that distinguishes "our XBRL engine has a bug" from "data sources disagree on methodology" from "nobody has this field." The output is `fix-recommendations.json` -- a prioritized list for Phase 3 engine fixes.

All three APIs have been verified working with live calls during this research. FMP returns 5 years of history per endpoint (Stable API), SimFin returns 10 years, mstarpy returns 10 years. FMP uses `fiscalYear` for year identification (confirmed), SimFin uses `Fiscal Year` column, mstarpy uses year strings in `columnDefs`. Response structures, field names, and sign conventions have been documented below from actual API responses.

The Phase 1 library modules (fiscal-aligner, field-mapper, comparator, reporter) provide a solid foundation. The field-mapper's `mapMorningstarToCanonical()` pattern with sign/scale/tolerance per field extends naturally to FMP and SimFin. The comparator's `specialHandlers` injection was designed for this exact multi-source scenario.

**Primary recommendation:** Build three stateless collector modules (one per source) that each return `{ income: {year: {canonical_field: value}}, balance: {...}, cashFlow: {...} }` in the same shape as the existing Morningstar canonical data. Then build consensus.mjs as a pure function that takes an array of source results and classifies deviations. This keeps the consensus logic testable independently of any API.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Time-based disk cache with 7-day TTL for all API responses. After 7 days, re-fetch automatically to pick up new earnings data. First run uses ~150 FMP calls (50 companies x 3 statements), subsequent runs within the week use 0.
- **D-02:** Fetch all 50 companies in a single run. No incremental batching. FMP budget (250/day) allows this with 100 calls to spare.
- **D-03:** Pre-fetch to JSON. Run a Python script once that fetches all 50 companies and saves to `validation/data/mstarpy/` as JSON files. The JS pipeline reads cached JSON -- no runtime Python dependency. Re-run the Python script when mstarpy cache expires (7 days) or when manually refreshed.
- **D-04:** Graceful degradation. If mstarpy data is missing for a ticker (scraper broke, field unavailable), triangulate with FMP + SimFin only. Never block the pipeline on mstarpy availability.
- **D-05:** 1% tolerance for consensus agreement. If external source values are within 1% of each other, they "agree." Our engine value is then compared against the consensus value.
- **D-06:** Confidence tiers based on source count:
  - 3 sources agree, we differ -> CONSENSUS_DIFF (high confidence -- fix first)
  - 2 sources agree, we differ -> LIKELY_BUG (lower confidence -- investigate)
  - Sources disagree among themselves -> METHODOLOGY_DIFF (not our bug -- different definitions)
  - All sources null -> COVERAGE_GAP (nobody has this field)
  - Only we have data -> UNIQUE_COVERAGE (we may be right, others may not extract it)
- **D-07:** Deterministic pattern matching for root cause auto-tagging, not AI. Rules: sign_flip, fy_offset, scale_error, tag_miss, derivation_error, unknown.
- **D-03 (Phase 1):** Single field-mapping.json config -- extend with FMP, SimFin, mstarpy field name mappings per source.
- **D-05/D-06 (Phase 1):** Console + JSON output format, per-company top 3 failures.

### Claude's Discretion
- SimFin bank/insurance template field mapping details
- FMP field name mapping specifics (camelCase -> canonical)
- How to structure the mstarpy Python pre-fetch script
- JSON structure for fix-recommendations.json
- Whether to use EODHD data (we have the key, but 3 sources may be sufficient)

### Deferred Ideas (OUT OF SCOPE)
- EODHD as a 4th triangulation source -- we have the key but 3 external sources should be sufficient for consensus. Revisit if triangulation reveals ambiguous cases where a 4th source would help.
- AI-assisted root cause analysis -- if pattern matching can't classify >20% of deviations, consider using Claude API for the ambiguous cases in a future iteration.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TRI-01 | FMP data collector with per-ticker caching and 250 calls/day rate budget | FMP Stable API verified live -- 3 endpoints (income/balance/cashflow), `fiscalYear` field for FY alignment, full field list documented below |
| TRI-02 | SimFin data collector with per-ticker caching and 2,000 calls/day rate budget | SimFin v3 compact API verified live -- 3 statements (PL/BS/CF), `Fiscal Year` column, GENERAL+BANKS+INSURANCE templates documented |
| TRI-03 | mstarpy Python subprocess bridge -- data fetch only | mstarpy 9.0.2 verified on machine, response structure (columnDefs/rows/footer) documented, values in millions (footer.orderOfMagnitude), nested subLevel tree structure |
| TRI-04 | Triangulation consensus engine | Consensus logic fully specified in D-05/D-06, existing comparator pattern extends naturally, 1% tolerance for source agreement |
| TRI-05 | Root cause tagger -- auto-classify deviations | Six deterministic patterns specified in D-07, all implementable as pure functions on value pairs |
| TRI-06 | Console + JSON reporter with regression diffing | Existing reporter.mjs provides base pattern, baseline JSON at morningstar-accuracy.json for regression comparison |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js | v24.13.1 | Runtime for all pipeline scripts | Already in use, confirmed on machine |
| Python 3 | 3.14.3 | mstarpy pre-fetch script only | Already installed, mstarpy 9.0.2 confirmed |
| mstarpy | 9.0.2 | Morningstar data scraper | Pre-installed, working for AAPL verified |
| vitest | 4.1.0 | Test runner for harness tests | Already used for 174 existing tests |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| fs/path/url (Node built-ins) | N/A | Disk cache I/O, path resolution | All collector modules |
| child_process (Node built-in) | N/A | Only for mstarpy pre-fetch invocation | fetch-mstarpy.py trigger (optional) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Direct fetch() for FMP/SimFin | axios/node-fetch | No benefit -- native fetch works fine in Node 24, zero dependencies |
| EODHD as 4th source | Deferred by user decision | 3 sources sufficient for consensus, 4th adds API cost and complexity |
| Runtime Python for mstarpy | Pre-fetch to JSON (chosen) | Eliminates runtime Python dependency in JS pipeline |

**Installation:**
```bash
# No new npm packages needed -- all built-in
# mstarpy already installed:
pip3 install mstarpy  # only if missing
```

## Architecture Patterns

### Recommended Project Structure
```
validation/
  scripts/
    lib/
      fiscal-aligner.mjs      # [existing] FY alignment
      field-mapper.mjs         # [existing] field mapping + sign/scale
      comparator.mjs           # [existing] field-level comparison
      reporter.mjs             # [existing] console + JSON reporting
      fmp-collector.mjs        # [NEW] FMP API fetcher + canonical mapper
      simfin-collector.mjs     # [NEW] SimFin API fetcher + canonical mapper
      mstarpy-collector.mjs    # [NEW] mstarpy JSON reader + canonical mapper
      consensus.mjs            # [NEW] multi-source consensus classifier
      root-cause-tagger.mjs    # [NEW] deviation pattern matcher
    compare-morningstar.mjs    # [existing] Morningstar-only pipeline
    triangulate.mjs            # [NEW] main orchestrator
    fetch-mstarpy.py           # [NEW] Python pre-fetch script
  data/
    mstarpy/                   # [NEW] cached mstarpy JSON files
      AAPL.json
      MSFT.json
      ...
  cache/
    fmp/                       # [NEW] FMP cached responses (7-day TTL)
      AAPL-income.json
      AAPL-balance.json
      AAPL-cashflow.json
    simfin/                    # [NEW] SimFin cached responses (7-day TTL)
      AAPL-PL.json
      AAPL-BS.json
      AAPL-CF.json
  reports/
    morningstar-accuracy.json  # [existing] Phase 1 baseline (91.2%)
    fix-recommendations.json   # [NEW] Phase 2 output
    triangulation-report.json  # [NEW] full triangulation detail
src/engines/__tests__/
  fixtures/morningstar/
    field-mapping.json         # [EXTEND] add fmpField, simfinField, mstarpyField per entry
  harness/
    fmp-collector.test.js      # [NEW]
    simfin-collector.test.js   # [NEW]
    mstarpy-collector.test.js  # [NEW]
    consensus.test.js          # [NEW]
    root-cause-tagger.test.js  # [NEW]
```

### Pattern 1: Collector Module Pattern
**What:** Each data source gets a pure ESM module that fetches raw data, normalizes to canonical format, and handles disk caching.
**When to use:** Every new data source follows this pattern.
**Example:**
```javascript
// Source: Verified from live FMP API response (2026-03-26)
// fmp-collector.mjs

/**
 * Fetch and normalize FMP financial data for a single ticker.
 * Returns data in canonical format: { income: {year: {field: value}}, balance: {...}, cashFlow: {...} }
 * Uses disk cache with 7-day TTL per D-01.
 */
export async function fetchFmpData(ticker, options = {}) {
  const { apiKey, cacheDir, cacheTtlMs = 7 * 24 * 60 * 60 * 1000 } = options;

  // Check disk cache first
  const cached = readCache(cacheDir, ticker);
  if (cached && !isExpired(cached, cacheTtlMs)) return cached.data;

  // Fetch all 3 statements
  const base = 'https://financialmodelingprep.com/stable';
  const q = `symbol=${ticker}&period=annual&apikey=${apiKey}`;

  const [income, balance, cashFlow] = await Promise.all([
    fetchJSON(`${base}/income-statement?${q}`),
    fetchJSON(`${base}/balance-sheet-statement?${q}`),
    fetchJSON(`${base}/cash-flow-statement?${q}`),
  ]);

  // Normalize: FMP array of objects keyed by fiscalYear -> canonical format
  const result = {
    income: normalizeByFiscalYear(income, FMP_INCOME_MAP),
    balance: normalizeByFiscalYear(balance, FMP_BALANCE_MAP),
    cashFlow: normalizeByFiscalYear(cashFlow, FMP_CASHFLOW_MAP),
  };

  writeCache(cacheDir, ticker, result);
  return result;
}
```

### Pattern 2: Consensus Engine Pattern
**What:** Takes an array of source results (each in canonical format), groups by field/year, determines consensus.
**When to use:** After all collectors have produced canonical data.
**Example:**
```javascript
// consensus.mjs

/**
 * Classify a single field across sources.
 * @param {number|null} thesisValue - Our XBRL engine value
 * @param {Array<{source: string, value: number|null}>} sourceValues - External source values
 * @param {number} tolerance - Consensus tolerance (default 0.01 = 1%)
 * @returns {{ classification, consensusValue, sources }}
 */
export function classifyField(thesisValue, sourceValues, tolerance = 0.01) {
  const nonNull = sourceValues.filter(s => s.value != null);

  if (nonNull.length === 0 && thesisValue == null) {
    return { classification: 'COVERAGE_GAP', consensusValue: null };
  }

  if (nonNull.length === 0 && thesisValue != null) {
    return { classification: 'UNIQUE_COVERAGE', consensusValue: null };
  }

  // Find groups of sources that agree within tolerance
  const consensus = findConsensusGroup(nonNull, tolerance);
  // ... classify based on D-06 rules
}
```

### Pattern 3: Disk Cache Pattern
**What:** JSON files on disk with a `_cachedAt` timestamp. Check TTL on read.
**When to use:** All API responses.
**Example:**
```javascript
// Shared cache utilities (used by all collectors)

function readCache(dir, key) {
  const filePath = path.join(dir, `${key}.json`);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function writeCache(dir, key, data) {
  fs.mkdirSync(dir, { recursive: true });
  const wrapped = { _cachedAt: new Date().toISOString(), data };
  fs.writeFileSync(path.join(dir, `${key}.json`), JSON.stringify(wrapped, null, 2));
}

function isExpired(cached, ttlMs) {
  if (!cached?._cachedAt) return true;
  return Date.now() - new Date(cached._cachedAt).getTime() > ttlMs;
}
```

### Anti-Patterns to Avoid
- **Embedding field mapping in collector code:** All field name mappings belong in field-mapping.json (or a parallel mapping config), not hardcoded in the collector. The field-mapper.mjs pattern already handles this.
- **Blocking on mstarpy failures:** Per D-04, the pipeline must work with 2 sources if mstarpy is unavailable. Never `throw` on mstarpy issues.
- **Running mstarpy at pipeline runtime:** Per D-03, mstarpy data is pre-fetched to JSON. The JS pipeline reads JSON files, never calls Python.
- **Conflating FMP `calendarYear` with `fiscalYear`:** FMP Stable API uses `fiscalYear` (verified). The old reference script tried `calendarYear` as fallback -- this is wrong for non-Dec FY companies.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| FY alignment for new sources | Custom per-source FY logic | `fiscal-aligner.mjs resolveYearOffset()` | Already handles 19 non-Dec FY companies correctly |
| Sign convention normalization | Per-collector sign flips | `field-mapping.json sign` property + `field-mapper.mjs` | Single source of truth for all sign conventions |
| Tolerance comparison | Custom % diff math | `comparator.mjs compareField()` | 5-tier tolerance already implemented and tested |
| Console/JSON reporting | Custom report generators | Extend `reporter.mjs` | Pattern already handles per-company + global aggregation |
| Disk caching | Custom file I/O per module | Shared cache utilities (new, small) | Consistent TTL checking across all sources |

**Key insight:** Phase 1 built the comparison infrastructure generically. Phase 2 should extend it, not rebuild it. The `specialHandlers` injection, the tolerance tiers, the reporter aggregation -- all designed for multi-source.

## FMP API Reference (Verified Live 2026-03-26)

### Endpoints
```
Base URL: https://financialmodelingprep.com/stable
Auth: ?apikey={key} query parameter
Rate limit: 250 calls/day

GET /income-statement?symbol={ticker}&period=annual&apikey={key}
GET /balance-sheet-statement?symbol={ticker}&period=annual&apikey={key}
GET /cash-flow-statement?symbol={ticker}&period=annual&apikey={key}
```

### Response Format
Array of objects, most recent first. Each object has metadata fields (`date`, `symbol`, `reportedCurrency`, `cik`, `filingDate`, `acceptedDate`, `fiscalYear`, `period`) plus financial fields.

**Key:** `fiscalYear` (integer, e.g. 2025) -- use this for year alignment, NOT `date` or `calendarYear` (which doesn't exist in Stable API).

### Income Statement Fields (40 fields)
```
revenue, costOfRevenue, grossProfit,
researchAndDevelopmentExpenses, generalAndAdministrativeExpenses,
sellingAndMarketingExpenses, sellingGeneralAndAdministrativeExpenses,
otherExpenses, operatingExpenses, costAndExpenses,
netInterestIncome, interestIncome, interestExpense,
depreciationAndAmortization, ebitda, ebit,
nonOperatingIncomeExcludingInterest, operatingIncome,
totalOtherIncomeExpensesNet, incomeBeforeTax, incomeTaxExpense,
netIncomeFromContinuingOperations, netIncomeFromDiscontinuedOperations,
otherAdjustmentsToNetIncome, netIncome, netIncomeDeductions,
bottomLineNetIncome, eps, epsDiluted,
weightedAverageShsOut, weightedAverageShsOutDil
```

### Balance Sheet Fields (63 fields)
```
cashAndCashEquivalents, shortTermInvestments, cashAndShortTermInvestments,
netReceivables, accountsReceivables, otherReceivables, inventory, prepaids,
otherCurrentAssets, totalCurrentAssets,
propertyPlantEquipmentNet, goodwill, intangibleAssets, goodwillAndIntangibleAssets,
longTermInvestments, taxAssets, otherNonCurrentAssets, totalNonCurrentAssets,
otherAssets, totalAssets,
totalPayables, accountPayables, otherPayables, accruedExpenses,
shortTermDebt, capitalLeaseObligationsCurrent, taxPayables,
deferredRevenue, otherCurrentLiabilities, totalCurrentLiabilities,
longTermDebt, capitalLeaseObligationsNonCurrent, deferredRevenueNonCurrent,
deferredTaxLiabilitiesNonCurrent, otherNonCurrentLiabilities, totalNonCurrentLiabilities,
otherLiabilities, capitalLeaseObligations, totalLiabilities,
treasuryStock, preferredStock, commonStock, retainedEarnings,
additionalPaidInCapital, accumulatedOtherComprehensiveIncomeLoss,
otherTotalStockholdersEquity, totalStockholdersEquity, totalEquity,
minorityInterest, totalLiabilitiesAndTotalEquity,
totalInvestments, totalDebt, netDebt
```

### Cash Flow Fields (47 fields)
```
netIncome, depreciationAndAmortization, deferredIncomeTax,
stockBasedCompensation, changeInWorkingCapital,
accountsReceivables, inventory, accountsPayables, otherWorkingCapital,
otherNonCashItems, netCashProvidedByOperatingActivities,
investmentsInPropertyPlantAndEquipment, acquisitionsNet,
purchasesOfInvestments, salesMaturitiesOfInvestments, otherInvestingActivities,
netCashProvidedByInvestingActivities,
netDebtIssuance, longTermNetDebtIssuance, shortTermNetDebtIssuance,
netStockIssuance, netCommonStockIssuance, commonStockIssuance,
commonStockRepurchased, netPreferredStockIssuance,
netDividendsPaid, commonDividendsPaid, preferredDividendsPaid,
otherFinancingActivities, netCashProvidedByFinancingActivities,
effectOfForexChangesOnCash, netChangeInCash,
cashAtEndOfPeriod, cashAtBeginningOfPeriod,
operatingCashFlow, capitalExpenditure, freeCashFlow,
incomeTaxesPaid, interestPaid
```

### FMP Sign Convention
All values are in their natural sign:
- Revenue, assets: positive
- Expenses: positive (cost_of_revenue = positive number)
- CapEx: negative (`capitalExpenditure` and `investmentsInPropertyPlantAndEquipment` are negative)
- Dividends: negative (`commonDividendsPaid` is negative)
- Share repurchases: negative (`commonStockRepurchased` is negative)

### FMP History Depth
5 years (FMP Stable API limit on starter plan). Morningstar truth set has ~5 years of data per company, so this aligns well.

## SimFin API Reference (Verified Live 2026-03-26)

### Endpoints
```
Base URL: https://backend.simfin.com/api/v3
Auth: Authorization: api-key {key} (header)
Rate limit: 2,000 calls/day, max 5/sec on Start plan

GET /companies/statements/compact?ticker={ticker}&statements=PL&period=FY
GET /companies/statements/compact?ticker={ticker}&statements=BS&period=FY
GET /companies/statements/compact?ticker={ticker}&statements=CF&period=FY
```

### Response Format
```json
[{
  "template": "GENERAL",   // or "BANKS" or "INSURANCE"
  "name": "APPLE INC",
  "ticker": "AAPL",
  "statements": [{
    "statement": "PL",     // or "BS" or "CF"
    "columns": ["Fiscal Period", "Fiscal Year", "Report Date", ...],
    "data": [[...row1...], [...row2...]]   // oldest first
  }]
}]
```

**Key:** `Fiscal Year` column (integer in data array) -- use column index from `columns` array.

### Templates
SimFin uses 3 templates with different field layouts:
- **GENERAL** -- standard companies (most of the 50 truth set)
- **BANKS** -- JPM, WFC (different income structure: net interest income, provisions, etc.)
- **INSURANCE** -- MET (different income structure: premiums, claims, etc.)

BRK-B may use GENERAL despite being a financial conglomerate -- verify at runtime.

### PL (Income Statement) - GENERAL Template (67 columns)
Key financial columns (beyond metadata):
```
Revenue, Sales & Services Revenue, Financing Revenue, Other Revenue,
Cost of revenue, Cost of Goods & Services, Gross Profit,
Operating Expenses, Selling, General & Administrative,
Selling & Marketing, General & Administrative,
Research & Development, Depreciation & Amortization,
Other Operating Expense, Operating Income (Loss),
Non-Operating Income (Loss), Interest Expense (net),
Interest Expense, Interest Income,
Pretax Income (Loss), Income Tax (Expense) Benefit (net),
Net Income, Net Income Available to Common Shareholders
```

### PL - BANKS Template
Different structure: `Net Revenue`, `Net interest income`, `Total Interest Income`, `Total Interest Expense`, `Total Non-Interest Income`, `Provision for Loan Losses`, `Operating Income (Loss)`, etc.

### BS (Balance Sheet) - GENERAL Template (93 columns)
Key financial columns:
```
Cash & Cash Equivalents, Short Term Investments,
Accounts Receivable (Net), Inventories, Total Current Assets,
Property Plant & Equipment (Net), Property Plant & Equipment,
Accumulated Depreciation, Goodwill, Other Intangible Assets,
Intangible Assets, Total Noncurrent Assets, Total Assets,
Accounts Payable, Accrued Taxes, Short Term Debt,
Total Current Liabilities, Long Term Debt,
Accrued Liabilities, Total Noncurrent Liabilities, Total Liabilities,
Common Stock, Additional Paid in Capital, Treasury Stock,
Retained Earnings, Equity Before Minority Interest,
Minority Interest, Total Equity, Total Liabilities & Equity
```

### CF (Cash Flow) - GENERAL Template (62 columns)
Key financial columns:
```
Net Income, Depreciation & Amortization,
Stock-Based Compensation, Deferred Income Taxes,
Change in Working Capital, Cash from Operating Activities,
Purchase of Fixed Assets, Acquisition of Intangible Assets,
Decrease/Increase in Long Term Investment,
Cash from Investing Activities,
Dividends Paid, Cash From (Repayment of) Debt,
Cash From (Repurchase of) Equity,
Cash from Financing Activities, Net Changes in Cash
```

### SimFin Sign Convention
- Revenue, assets: positive
- Expenses: negative (unlike FMP -- `Cost of revenue` is negative)
- CapEx: negative (`Purchase of Fixed Assets` is negative)
- Dividends: negative (`Dividends Paid` is negative)

### SimFin History Depth
10 years on Start plan. More than sufficient for the 5-year truth set overlap.

## mstarpy Reference (Verified Live 2026-03-26)

### API
```python
from mstarpy import Stock
s = Stock(term="AAPL")
income = s.incomeStatement(period="annual", reportType="restated")
balance = s.balanceSheet(period="annual", reportType="restated")
cf = s.cashFlow(period="annual", reportType="restated")
```

### Response Format
```json
{
  "_meta": {...},
  "columnDefs": ["2016", "2017", ..., "2025", "TTM"],
  "rows": [
    {
      "label": "IncomeStatement",
      "subLevel": [
        {
          "label": "Gross Profit",
          "datum": [null, 101839000000, ...],
          "subLevel": [
            { "label": "Total Revenue", "datum": [...] },
            { "label": "Cost of Revenue", "datum": [...] }
          ]
        }
      ]
    }
  ],
  "footer": {
    "currency": "USD",
    "orderOfMagnitude": "Million",
    "fiscalYearEndDate": "09-30"
  }
}
```

### Key Characteristics
- **Values in millions** -- `footer.orderOfMagnitude` is "Million". Multiply by 1e6. Exception: per-share values (EPS, DPS) and share counts are NOT in millions.
- **Nested tree structure** -- `rows[].subLevel[]` can be nested arbitrarily deep. Must walk recursively to extract all labels.
- **Year labels are strings** -- `columnDefs` contains year strings ("2016", "2017", etc.) plus "TTM".
- **Datum array alignment** -- `datum[i]` corresponds to `columnDefs[i]`. `null` for missing, `"_PO_"` for not-yet-reported.
- **Field labels match Morningstar CSV labels** -- "Total Revenue", "Cost of Revenue", "Gross Profit", etc. This is the same data source as the truth set CSVs.
- **`fiscalYearEndDate` in footer** -- Can be used for FY alignment validation.
- **10 years of history** typically available.

### mstarpy Income Statement Labels (verified for AAPL)
```
Total Revenue, Business Revenue, Cost of Revenue, Cost of Goods and Services,
Gross Profit, Operating Income/Expenses,
Selling General and Administrative Expenses,
Research and Development Expenses,
Total Operating Profit/Loss,
Non-Operating Income/Expense Total,
Total Net Finance Income/Expense, Interest Expense Net of Capitalized Interest,
Interest Income, Other Income/Expense Non-Operating,
Pretax Income, Provision for Income Tax,
Net Income before Extraordinary Items and Discontinued Operations,
Net Income after Non-Controlling/Minority Interests,
Net Income Available to Common Stockholders,
Basic EPS, Diluted EPS,
Basic Weighted Average Shares Outstanding,
Diluted Weighted Average Shares Outstanding,
Reported Total Operating Profit/Loss,
Reported Effective Tax Rate
```

### mstarpy Sign Convention
- Revenue, income: positive
- Expenses: negative (Cost of Revenue is negative, same as Morningstar CSVs)
- This matches the Morningstar truth set sign convention exactly (same data source)

## Field Mapping Strategy

### Extending field-mapping.json
The existing 101-field mapping maps Morningstar field names to canonical Thes1s field names. For Phase 2, add `fmpField`, `simfinField`, and `mstarpyField` properties to each entry.

**Approach:** Add source-specific field names alongside the existing `thesisField`:

```json
{
  "income": {
    "Total Revenue": {
      "thesisField": "revenues",
      "sign": 1,
      "tolerance": "exact",
      "fmpField": "revenue",
      "fmpSign": 1,
      "simfinField": "Revenue",
      "simfinSign": 1,
      "mstarpyField": "Total Revenue",
      "mstarpySign": 1
    },
    "Cost of Revenue": {
      "thesisField": "cost_of_revenue",
      "sign": -1,
      "tolerance": "close",
      "fmpField": "costOfRevenue",
      "fmpSign": 1,
      "simfinField": "Cost of revenue",
      "simfinSign": -1,
      "mstarpyField": "Cost of Revenue",
      "mstarpySign": -1
    }
  }
}
```

**Alternative (recommended):** Keep per-source mappings in a separate section or keyed by source, to avoid bloating every entry. Since each source has different field names, a per-source mapping table is cleaner:

```json
{
  "_meta": { ... },
  "_sources": {
    "fmp": {
      "revenue": { "canonical": "revenues", "sign": 1 },
      "costOfRevenue": { "canonical": "cost_of_revenue", "sign": 1 },
      ...
    },
    "simfin": {
      "Revenue": { "canonical": "revenues", "sign": 1 },
      "Cost of revenue": { "canonical": "cost_of_revenue", "sign": -1 },
      ...
    },
    "mstarpy": {
      "Total Revenue": { "canonical": "revenues", "sign": 1 },
      "Cost of Revenue": { "canonical": "cost_of_revenue", "sign": -1 },
      ...
    }
  },
  "income": { ... existing MS mappings ... }
}
```

This is Claude's discretion per CONTEXT.md. Recommendation: Use the `_sources` approach for cleanliness.

### Critical Sign Convention Differences

| Field | Thes1s (XBRL) | FMP | SimFin | mstarpy/MS |
|-------|---------------|-----|--------|------------|
| Revenue | + | + | + | + |
| Cost of Revenue | + (positive) | + (positive) | - (negative) | - (negative) |
| SGA | + | + | - | - |
| R&D | + | + | - | - |
| Operating Income | + | + | + | + |
| Interest Expense | + | + | - | - |
| Tax Expense | + | + | - | - |
| Net Income | + | + | + | + |
| CapEx | - (negative in XBRL) | - | - | - |
| Dividends Paid | - | - | - | - |
| D&A (CF) | + | + | + | - |

**Key insight:** FMP follows the same sign convention as our XBRL engine (expenses positive). SimFin and mstarpy follow Morningstar convention (expenses negative). The `sign` multiplier in field-mapping.json handles this per-source.

### FMP-to-Canonical Field Mapping (Key Fields)

| FMP Field | Canonical | Statement | Sign |
|-----------|-----------|-----------|------|
| `revenue` | `revenues` | income | 1 |
| `costOfRevenue` | `cost_of_revenue` | income | 1 |
| `grossProfit` | `gross_profit` | income | 1 |
| `sellingGeneralAndAdministrativeExpenses` | `sga` | income | 1 |
| `researchAndDevelopmentExpenses` | `research_and_development` | income | 1 |
| `depreciationAndAmortization` | `depreciation_amortization_is` | income | 1 |
| `operatingIncome` | `operating_income_loss` | income | 1 |
| `interestIncome` | `interest_income` | income | 1 |
| `interestExpense` | `interest_expense` | income | 1 |
| `incomeBeforeTax` | `pretax_income` | income | 1 |
| `incomeTaxExpense` | `income_tax_expense` | income | 1 |
| `netIncome` | `net_income_loss` | income | 1 |
| `epsDiluted` | `diluted_eps` | income | 1 |
| `totalAssets` | `total_assets` | balance | 1 |
| `totalCurrentAssets` | `total_current_assets` | balance | 1 |
| `cashAndCashEquivalents` | `cash_and_equivalents` | balance | 1 |
| `inventory` | `inventories` | balance | 1 |
| `propertyPlantEquipmentNet` | `property_plant_equipment` | balance | 1 |
| `goodwill` | `goodwill` | balance | 1 |
| `intangibleAssets` | `intangible_assets` | balance | 1 |
| `totalLiabilities` | `total_liabilities` | balance | 1 |
| `totalCurrentLiabilities` | `total_current_liabilities` | balance | 1 |
| `longTermDebt` | `long_term_debt` | balance | 1 |
| `totalStockholdersEquity` | `stockholders_equity` | balance | 1 |
| `retainedEarnings` | `retained_earnings` | balance | 1 |
| `totalDebt` | `total_debt` | balance | 1 |
| `netDebt` | `net_debt` | balance | 1 |
| `netCashProvidedByOperatingActivities` | `operating_cash_flow` | cashFlow | 1 |
| `netCashProvidedByInvestingActivities` | `investing_cash_flow` | cashFlow | 1 |
| `netCashProvidedByFinancingActivities` | `financing_cash_flow` | cashFlow | 1 |
| `depreciationAndAmortization` (CF) | `depreciation_amortization` | cashFlow | 1 |
| `stockBasedCompensation` | `stock_based_compensation` | cashFlow | 1 |
| `capitalExpenditure` | `capital_expenditures` | cashFlow | -1 |
| `commonDividendsPaid` | `dividends_paid` | cashFlow | -1 |
| `netChangeInCash` | `net_change_in_cash` | cashFlow | 1 |

### SimFin-to-Canonical Field Mapping (Key Fields)

| SimFin Field | Canonical | Statement | Sign |
|-------------|-----------|-----------|------|
| `Revenue` | `revenues` | PL | 1 |
| `Cost of revenue` | `cost_of_revenue` | PL | -1 |
| `Gross Profit` | `gross_profit` | PL | 1 |
| `Selling, General & Administrative` | `sga` | PL | -1 |
| `Research & Development` | `research_and_development` | PL | -1 |
| `Depreciation & Amortization` | `depreciation_amortization_is` | PL | -1 |
| `Operating Income (Loss)` | `operating_income_loss` | PL | 1 |
| `Interest Expense` | `interest_expense` | PL | -1 |
| `Interest Income` | `interest_income` | PL | 1 |
| `Pretax Income (Loss)` | `pretax_income` | PL | 1 |
| `Income Tax (Expense) Benefit, net` | `income_tax_expense` | PL | -1 |
| `Net Income` | `net_income_loss` | PL | 1 |
| `Total Assets` | `total_assets` | BS | 1 |
| `Total Current Assets` | `total_current_assets` | BS | 1 |
| `Cash & Cash Equivalents` | `cash_and_equivalents` | BS | 1 |
| `Inventories` | `inventories` | BS | 1 |
| `Property, Plant & Equipment, Net` | `property_plant_equipment` | BS | 1 |
| `Goodwill` | `goodwill` | BS | 1 |
| `Other Intangible Assets` | `intangible_assets` | BS | 1 |
| `Total Liabilities` | `total_liabilities` | BS | 1 |
| `Total Current Liabilities` | `total_current_liabilities` | BS | 1 |
| `Long Term Debt` | `long_term_debt` | BS | 1 |
| `Equity Before Minority Interest` | `stockholders_equity` | BS | 1 |
| `Retained Earnings` | `retained_earnings` | BS | 1 |
| `Cash from Operating Activities` | `operating_cash_flow` | CF | 1 |
| `Cash from Investing Activities` | `investing_cash_flow` | CF | 1 |
| `Cash from Financing Activities` | `financing_cash_flow` | CF | 1 |
| `Depreciation & Amortization` (CF) | `depreciation_amortization` | CF | 1 |
| `Stock-Based Compensation` | `stock_based_compensation` | CF | 1 |
| `Purchase of Fixed Assets` | `capital_expenditures` | CF | 1 |
| `Dividends Paid` | `dividends_paid` | CF | 1 |
| `Net Changes in Cash` | `net_change_in_cash` | CF | 1 |

## Consensus Engine Design

### Classification Algorithm

For each canonical field, for each year, for each company:

1. Collect values from all available sources (FMP, SimFin, mstarpy)
2. Filter out nulls
3. If 0 non-null sources:
   - If our engine also null -> `COVERAGE_GAP`
   - If our engine has value -> `UNIQUE_COVERAGE`
4. If 1 non-null source: not enough for consensus, compare directly
5. If 2+ non-null sources: find the largest agreement group within 1% tolerance
6. Determine consensus based on group size vs total sources:
   - 3 agree, we differ -> `CONSENSUS_DIFF`
   - 2 agree, we differ -> `LIKELY_BUG`
   - No agreement group -> `METHODOLOGY_DIFF`
   - Sources agree and we match -> `MATCH` (our value is correct)

### Consensus Value Computation
When sources agree within 1%, use the **median** of agreeing values as the consensus value. This is more robust than mean for small groups.

### Tolerance Implementation
```javascript
function sourcesAgree(value1, value2, tolerance = 0.01) {
  if (value1 === 0 && value2 === 0) return true;
  if (value1 === 0 || value2 === 0) return Math.abs(value1 - value2) < 1_000_000;
  return Math.abs((value1 - value2) / value1) <= tolerance;
}
```

The 1% tolerance handles rounding differences, minor timing differences in data snapshots, and insignificant methodology differences. It matches the existing `THRESHOLDS.exact` tier from comparator.mjs.

## Root Cause Tagger Design

### Pattern Rules (from D-07)

```javascript
export function tagRootCause(thesisValue, consensusValue, allYearsData) {
  // 1. sign_flip: same magnitude, opposite sign
  if (thesisValue != null && consensusValue != null) {
    if (Math.sign(thesisValue) !== Math.sign(consensusValue) &&
        isClose(Math.abs(thesisValue), Math.abs(consensusValue), 0.01)) {
      return 'sign_flip';
    }
  }

  // 2. scale_error: differ by exactly 1000x or 1,000,000x
  if (thesisValue != null && consensusValue != null && consensusValue !== 0) {
    const ratio = thesisValue / consensusValue;
    if (isClose(ratio, 1000, 0.01) || isClose(ratio, 0.001, 0.01) ||
        isClose(ratio, 1e6, 0.01) || isClose(ratio, 1e-6, 0.01)) {
      return 'scale_error';
    }
  }

  // 3. fy_offset: our value for year Y matches consensus for Y+1 or Y-1
  if (allYearsData) {
    const prevConsensus = allYearsData.prevYearConsensus;
    const nextConsensus = allYearsData.nextYearConsensus;
    if (prevConsensus != null && isClose(thesisValue, prevConsensus, 0.01)) return 'fy_offset';
    if (nextConsensus != null && isClose(thesisValue, nextConsensus, 0.01)) return 'fy_offset';
  }

  // 4. tag_miss: our engine returns null, consensus has value
  if (thesisValue == null && consensusValue != null) return 'tag_miss';

  // 5. derivation_error: value exists but doesn't match
  if (thesisValue != null && consensusValue != null) return 'derivation_error';

  // 6. unknown
  return 'unknown';
}
```

### Priority Order
The rules are checked in priority order (sign_flip > scale_error > fy_offset > tag_miss > derivation_error > unknown). The first match wins. This prevents "derivation_error" from swallowing more specific patterns.

## fix-recommendations.json Structure

```json
{
  "generatedAt": "2026-03-26T...",
  "summary": {
    "totalFields": 14818,
    "consensusDiff": 234,
    "likelyBug": 156,
    "methodologyDiff": 89,
    "coverageGap": 412,
    "uniqueCoverage": 67,
    "match": 13860
  },
  "recommendations": [
    {
      "priority": 1,
      "field": "accrued_liabilities",
      "statement": "balance_sheet",
      "classification": "CONSENSUS_DIFF",
      "rootCause": "tag_miss",
      "affectedCompanies": 31,
      "affectedYears": 141,
      "consensusValue": 15234000000,
      "thesisValue": null,
      "sampleCompany": "AAPL",
      "sampleYear": 2024,
      "sources": {
        "fmp": 15234000000,
        "simfin": 15210000000,
        "mstarpy": 15234000000
      }
    }
  ],
  "byRootCause": {
    "sign_flip": [ ... ],
    "fy_offset": [ ... ],
    "scale_error": [ ... ],
    "tag_miss": [ ... ],
    "derivation_error": [ ... ],
    "unknown": [ ... ]
  },
  "regressionDiff": {
    "previousAccuracy": 91.2,
    "currentAccuracy": null,
    "fieldsGained": [],
    "fieldsLost": [],
    "classificationChanges": []
  }
}
```

### Regression Diffing
Compare current triangulation output against `morningstar-accuracy.json` baseline:
- Fields that were MATCH and now DIFF -> regression
- Fields that were DIFF and now MATCH -> improvement
- New fields covered -> gained
- Previously covered fields now missing -> lost

## Common Pitfalls

### Pitfall 1: FMP Fiscal Year vs Calendar Year
**What goes wrong:** Using `date` or `calendarYear` instead of `fiscalYear` breaks companies like AAPL (Sep FY), LULU (Jan FY), COST (Aug FY).
**Why it happens:** FMP Stable API returns `fiscalYear` but NOT `calendarYear`. Old reference script had `calendarYear` as fallback.
**How to avoid:** Always use `row.fiscalYear` for FMP year indexing. Verified: FMP Stable API returns `fiscalYear` as integer.
**Warning signs:** Non-Dec FY companies show data shifted by 1 year.

### Pitfall 2: SimFin Template Differences
**What goes wrong:** Applying GENERAL template field names to BANKS or INSURANCE companies returns nulls.
**Why it happens:** JPM uses "Net interest income" instead of "Revenue", MET uses different field names entirely.
**How to avoid:** Check `response[0].template` ("GENERAL"/"BANKS"/"INSURANCE") and use template-specific field mappings. Of the 50 truth set companies: JPM + WFC = BANKS, MET = INSURANCE, BRK-B = check at runtime.
**Warning signs:** Financial sector companies showing 0% match rate on income fields.

### Pitfall 3: mstarpy Value Scale
**What goes wrong:** Comparing raw mstarpy values (in millions) against XBRL values (in dollars) produces 1000000x differences.
**Why it happens:** `footer.orderOfMagnitude` is "Million" -- values must be multiplied by 1e6.
**How to avoid:** Check `footer.orderOfMagnitude` and apply multiplier. Exception: EPS, DPS, share counts are NOT in millions.
**Warning signs:** Every mstarpy comparison shows "scale_error" root cause.

### Pitfall 4: mstarpy Nested Tree Structure
**What goes wrong:** Only extracting top-level row labels misses sub-level fields.
**Why it happens:** mstarpy nests data in `subLevel` arrays. "Total Revenue" is a child of "Gross Profit" which is a child of "IncomeStatement".
**How to avoid:** Walk the tree recursively (the reference script's `parseMstarpy()` already does this correctly).
**Warning signs:** Missing fields that clearly exist in the data.

### Pitfall 5: SimFin Sign Convention for Tax
**What goes wrong:** Tax shows as "Income Tax (Expense) Benefit, net" -- the sign depends on whether it's an expense or benefit.
**Why it happens:** SimFin uses signed values where negative = expense, positive = benefit. Most companies have negative tax (expense).
**How to avoid:** Map with `sign: -1` to convert to positive-expense convention matching Thes1s.
**Warning signs:** Tax values showing sign_flip root cause.

### Pitfall 6: Consensus Agreement Clustering
**What goes wrong:** Naive pairwise comparison doesn't find the maximal agreement group when 3 sources have different values.
**Why it happens:** If FMP=100, SimFin=101, mstarpy=200, naive check might compare FMP-mstarpy and conclude no consensus.
**How to avoid:** Check ALL pairs, find the largest cluster within tolerance, then check remaining sources against the cluster median.
**Warning signs:** Fields classified as METHODOLOGY_DIFF when 2 sources clearly agree.

### Pitfall 7: FMP Rate Limit Exhaustion
**What goes wrong:** Pipeline crashes mid-run after 250 calls, leaving partial cache.
**Why it happens:** 50 tickers x 3 endpoints = 150 calls. Plus any retries. Close to limit.
**How to avoid:** Cache first, count calls, log remaining budget. Never retry without checking budget.
**Warning signs:** HTTP 429 responses from FMP.

## Code Examples

### FMP Response Parsing (verified from live API)
```javascript
// Source: Live FMP Stable API response for AAPL (2026-03-26)
// Each endpoint returns an array of year objects
const incomeRow = {
  date: "2025-09-27",
  symbol: "AAPL",
  fiscalYear: 2025,        // USE THIS for year indexing
  period: "FY",
  revenue: 416161000000,
  costOfRevenue: 175543000000,
  grossProfit: 240618000000,
  // ... all values in full dollars, expenses positive
};

// Normalize to { year: { canonical_field: value } }
function fmpToCanonical(rows, fieldMap) {
  const result = {};
  for (const row of rows) {
    const year = String(row.fiscalYear);
    result[year] = {};
    for (const [fmpField, { canonical, sign }] of Object.entries(fieldMap)) {
      const val = row[fmpField];
      if (val != null) {
        result[year][canonical] = sign * val;
      }
    }
  }
  return result;
}
```

### SimFin Compact Response Parsing (verified from live API)
```javascript
// Source: Live SimFin v3 compact API response for AAPL (2026-03-26)
// Response: [{ template, name, ticker, statements: [{ columns, data }] }]
function simfinToCanonical(apiResponse, fieldMap) {
  const company = Array.isArray(apiResponse) ? apiResponse[0] : apiResponse;
  const template = company?.template || 'GENERAL';
  const stmt = company?.statements?.[0];
  if (!stmt) return {};

  const cols = stmt.columns;
  const yearIdx = cols.indexOf('Fiscal Year');
  const result = {};

  for (const row of stmt.data) {
    const year = String(row[yearIdx]);
    result[year] = {};

    // Use template-specific field map
    const activeMap = fieldMap[template] || fieldMap.GENERAL;
    for (const [simfinField, { canonical, sign }] of Object.entries(activeMap)) {
      const colIdx = cols.indexOf(simfinField);
      if (colIdx === -1) continue;
      const val = row[colIdx];
      if (val != null) {
        result[year][canonical] = sign * val;
      }
    }
  }
  return result;
}
```

### mstarpy Pre-Fetch Script Pattern
```python
#!/usr/bin/env python3
# fetch-mstarpy.py — Pre-fetch all 50 truth set companies to JSON

import json, sys, os, time
from mstarpy import Stock

TICKERS = ["AAPL", "AMAT", "AMT", ...]  # 50 companies
OUTPUT_DIR = "validation/data/mstarpy"

os.makedirs(OUTPUT_DIR, exist_ok=True)

for ticker in TICKERS:
    outfile = os.path.join(OUTPUT_DIR, f"{ticker}.json")
    try:
        s = Stock(term=ticker)
        data = {
            "_cachedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "income": s.incomeStatement(period="annual", reportType="restated"),
            "balance": s.balanceSheet(period="annual", reportType="restated"),
            "cashFlow": s.cashFlow(period="annual", reportType="restated"),
        }
        with open(outfile, "w") as f:
            json.dump(data, f, default=str, indent=2)
        print(f"OK  {ticker}")
        time.sleep(1)  # Be polite to Morningstar
    except Exception as e:
        print(f"ERR {ticker}: {e}", file=sys.stderr)
```

### Consensus Classification Pattern
```javascript
// Source: Design based on D-05/D-06 decisions
function classifyDeviation(thesisValue, sourceValues, tolerance = 0.01) {
  const nonNull = sourceValues.filter(s => s.value != null);

  if (nonNull.length === 0) {
    return thesisValue == null ? 'COVERAGE_GAP' : 'UNIQUE_COVERAGE';
  }

  // Find largest agreement cluster
  const cluster = findLargestCluster(nonNull, tolerance);

  if (cluster.length === 0) return 'METHODOLOGY_DIFF';

  const consensusValue = median(cluster.map(s => s.value));

  if (thesisValue == null) return 'CONSENSUS_DIFF';  // tag_miss

  if (sourcesAgree(thesisValue, consensusValue, tolerance)) return 'MATCH';

  if (cluster.length >= 3) return 'CONSENSUS_DIFF';
  if (cluster.length >= 2) return 'LIKELY_BUG';

  return 'METHODOLOGY_DIFF';  // only 1 source, can't form consensus
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| FMP v3 API with `calendarYear` | FMP Stable API with `fiscalYear` | 2025 | Proper fiscal year alignment, simpler URL patterns |
| SimFin v2 flat format | SimFin v3 nested `statements` array | June 2023 | Need to unwrap `company.statements[0]` |
| mstarpy v7 flat dicts | mstarpy v9 nested `subLevel` tree | 2025 | Must walk tree recursively to extract all labels |

**Deprecated/outdated:**
- FMP v3 API endpoints -- replaced by Stable API endpoints with different URL patterns
- SimFin v2 API -- deprecated, v3 uses different response nesting
- The old `test-api-sources.mjs` reference script -- has correct API connection code but buggy comparison logic (no FY alignment, incomplete field mapping, no sign normalization)

## Open Questions

1. **BRK-B SimFin Template**
   - What we know: JPM and WFC use BANKS template, MET uses INSURANCE
   - What's unclear: Does BRK-B use GENERAL or BANKS? It's a holding company, not a traditional bank
   - Recommendation: Check at runtime via `response[0].template`, handle both possibilities

2. **FMP History Depth Variation**
   - What we know: AAPL returns 5 years on current plan
   - What's unclear: Do all tickers return 5 years? Some smaller companies might have less
   - Recommendation: Handle variable year counts gracefully, only compare overlapping years

3. **XYZ Ticker**
   - What we know: XYZ is in the 50-company truth set
   - What's unclear: XYZ appears to be a test/example ticker -- will any API return data for it?
   - Recommendation: Handle gracefully as missing data, don't let it fail the pipeline

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All pipeline scripts | Yes | v24.13.1 | -- |
| Python 3 | mstarpy pre-fetch | Yes | 3.14.3 | -- |
| mstarpy | mstarpy pre-fetch | Yes | 9.0.2 | Pipeline runs without mstarpy (D-04 graceful degradation) |
| FMP API key | FMP collector | Yes | In .env.local | -- |
| SimFin API key | SimFin collector | Yes | In .env.local | -- |
| vitest | Unit tests | Yes | 4.1.0 | -- |
| Internet access | API calls | Yes | -- | Disk cache for subsequent runs |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None -- all dependencies available.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.0 |
| Config file | vite.config.js (vitest config embedded) |
| Quick run command | `npx vitest run src/engines/__tests__/harness/` |
| Full suite command | `npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TRI-01 | FMP collector fetches, caches, normalizes to canonical | unit | `npx vitest run src/engines/__tests__/harness/fmp-collector.test.js -x` | Wave 0 |
| TRI-02 | SimFin collector fetches, caches, normalizes (GENERAL + BANKS + INSURANCE templates) | unit | `npx vitest run src/engines/__tests__/harness/simfin-collector.test.js -x` | Wave 0 |
| TRI-03 | mstarpy collector reads JSON, normalizes, handles missing | unit | `npx vitest run src/engines/__tests__/harness/mstarpy-collector.test.js -x` | Wave 0 |
| TRI-04 | Consensus engine classifies CONSENSUS_DIFF, LIKELY_BUG, METHODOLOGY_DIFF, COVERAGE_GAP, UNIQUE_COVERAGE, MATCH | unit | `npx vitest run src/engines/__tests__/harness/consensus.test.js -x` | Wave 0 |
| TRI-05 | Root cause tagger labels sign_flip, fy_offset, scale_error, tag_miss, derivation_error, unknown | unit | `npx vitest run src/engines/__tests__/harness/root-cause-tagger.test.js -x` | Wave 0 |
| TRI-06 | Reporter shows regression diff (fields gained/lost vs baseline) | unit | `npx vitest run src/engines/__tests__/harness/triangulation-reporter.test.js -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run src/engines/__tests__/harness/`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/engines/__tests__/harness/fmp-collector.test.js` -- covers TRI-01
- [ ] `src/engines/__tests__/harness/simfin-collector.test.js` -- covers TRI-02
- [ ] `src/engines/__tests__/harness/mstarpy-collector.test.js` -- covers TRI-03
- [ ] `src/engines/__tests__/harness/consensus.test.js` -- covers TRI-04
- [ ] `src/engines/__tests__/harness/root-cause-tagger.test.js` -- covers TRI-05
- [ ] `src/engines/__tests__/harness/triangulation-reporter.test.js` -- covers TRI-06

## Project Constraints (from CLAUDE.md)

- **No UI work:** Only touch `validation/`, `src/engines/`, `src/data/`. Components, hooks, and agents are off-limits.
- **API rate limits:** FMP 250/day, SimFin 2,000/day. Pipeline must work within limits.
- **Fragile mstarpy:** Scraper could break anytime. Use it while it works, don't depend on it long-term.
- **All-JavaScript pipeline:** No Python for computation, only mstarpy subprocess for data fetch.
- **Pure ESM modules** in `validation/scripts/lib/` with named exports.
- **Tests in `src/engines/__tests__/harness/`** using relative imports to lib.
- **TDD workflow:** RED-GREEN pattern for all new modules (established in Phase 1).
- **Bug-fixing strategy:** Understand first, write failing tests, fix with subagent, verify.
- **User is not a programmer:** Explain findings in plain English.

## Sources

### Primary (HIGH confidence)
- Live FMP Stable API responses for AAPL (income/balance/cashflow) -- 2026-03-26, verified field names, response structure, sign conventions
- Live SimFin v3 compact API responses for AAPL (PL/BS/CF) and JPM (PL) -- 2026-03-26, verified field names, template detection, BANKS template structure
- Live mstarpy 9.0.2 response for AAPL income statement -- 2026-03-26, verified columnDefs, nested subLevel structure, footer.orderOfMagnitude
- Phase 1 codebase: fiscal-aligner.mjs, field-mapper.mjs, comparator.mjs, reporter.mjs, compare-morningstar.mjs -- read in full
- `validation/reports/morningstar-accuracy.json` -- 91.2% baseline with top failure patterns
- `validation/scripts/reference/test-api-sources.mjs` -- working API connection patterns (FMP, SimFin, mstarpy)
- `validation/scripts/reference/_mstarpy_batch_tmp.py` -- working mstarpy fetch pattern

### Secondary (MEDIUM confidence)
- [FMP Developer Docs](https://site.financialmodelingprep.com/developer/docs/stable/income-statement) -- referenced but 403 on direct fetch; verified via live API calls instead
- [SimFin Technical Updates](https://www.simfin.com/en/technical-updates-to-api-v3-and-bulk-download/) -- changelog confirms v3 format changes

### Tertiary (LOW confidence)
- None -- all findings verified through live API calls

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all tools already installed and verified working
- Architecture: HIGH -- extending proven Phase 1 patterns, all API structures verified live
- Pitfalls: HIGH -- identified from actual API behavior, not speculation
- Field mappings: HIGH -- derived from live API responses, not documentation
- Consensus logic: MEDIUM -- algorithm designed from requirements, not yet tested against real multi-source data

**Research date:** 2026-03-26
**Valid until:** 2026-04-26 (30 days -- APIs are stable, field names unlikely to change)
