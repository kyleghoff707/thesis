# Technology Stack — Normalization Engine

**Project:** Thes1s Normalization Engine (Multi-Source Triangulation)
**Researched:** 2026-03-25
**Overall confidence:** MEDIUM (all web search tools were unavailable; recommendations draw on training data, existing codebase analysis, and project documentation. Versions flagged where unverifiable.)

---

## Context

This STACK.md covers the **normalization engine milestone** -- building a production-grade comparison harness and multi-source triangulation pipeline to reach 98%+ accuracy against Morningstar across all US-listed equities. This is NOT about the AI agent layer (covered by the existing research from 2026-03-24).

**What already exists:**
- Three-layer XBRL engine in `edgarFinancials.js` (~85 normalized fields, ~200 static tags, taxonomy hierarchy, AI classification layer)
- 50-company Morningstar truth set with CSV parser, field mapping (87 mapped fields), and accuracy test suite (`morningstarAccuracy.test.js`)
- Layer 2/3 validation scripts (Python: `layer2_statements.py`, `layer3_metrics.py`)
- Node.js engine bundler (`bundle.mjs` via esbuild) and JSON data exporter
- Working API connections to FMP, SimFin, mstarpy, Yahoo Finance, EDGAR
- Current accuracy: ~91% against Morningstar truth set

**What's needed:**
- Production comparison harness with proper fiscal year alignment, sign conventions, and field mapping
- Multi-source triangulation engine (our engine + FMP + SimFin + mstarpy vs Morningstar truth)
- Automated validation pipeline for ongoing accuracy monitoring
- Normalization rule improvements derived from triangulation findings

---

## Recommended Stack

### Core: Keep the Existing JavaScript Pipeline

The normalization engine is JavaScript. The comparison and triangulation harness should also be JavaScript. Rationale: the engine under test IS `edgarFinancials.js`, the bundler already compiles it for Node.js, the test infrastructure already uses vitest, and introducing a second language (Python) for the comparison harness creates a maintenance burden.

**Decision: Migrate validation logic from Python to JavaScript/Node.js.**

The existing `layer2_statements.py` and `layer3_metrics.py` are ~300 LOC each and use yfinance + mstarpy (Python packages). But the triangulation engine needs to:
1. Run against the live JS engine (already bundled for Node.js)
2. Integrate with the existing vitest test suite
3. Share field mappings, sign conventions, and tolerance configs with the accuracy tests
4. Be maintainable by a single-language team

Keeping Python for API fetching and JS for engine testing means maintaining two field mapping systems, two sign convention tables, and two fiscal year alignment implementations. That's exactly the bug source that previous attempts encountered.

**Exception:** mstarpy has no JavaScript equivalent. Use a thin Python bridge (spawn process, read JSON stdout) for mstarpy data fetching only. Everything else in JS.

---

### Comparison Harness Infrastructure

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **vitest** | ^4.1.0 (installed) | Test runner for accuracy suite | Already used for 173+ tests. Parallel execution, watch mode, structured reporting. No new dependency. |
| **esbuild** | (installed via vitest/vite) | Bundle browser engines for Node.js | Already used in `bundle.mjs`. Handles `import.meta.env` shimming, tree-shaking. No new dependency. |
| **Node.js native fetch** | Built-in (Node 18+) | HTTP client for FMP, SimFin, EDGAR APIs | Node 18+ has native fetch. No axios/got/node-fetch needed. Already verified working in the existing validation scripts. |

**Confidence:** HIGH -- all already in use and working.

### Data Source API Clients

| Technology | Approach | Purpose | Why |
|------------|----------|---------|-----|
| **FMP** | Direct fetch with API key | Normalized financial statements (income, balance, cash flow) | 100% accuracy on AAPL test. Uses same EDGAR XBRL source, so differences reveal normalization methodology. $20/mo, 300 calls/min. |
| **SimFin** | Direct fetch with API key + auth header | Financial statements with source traceability | 83% accuracy but traceable to specific filings. Separate bank/insurance templates. $15/mo, 5 req/sec. |
| **mstarpy** | Python subprocess bridge | Morningstar data (the truth standard) | No JS equivalent. Fragile scraper -- treat as a validation oracle, not a runtime dependency. Spawn `python3 -c "..."` and parse JSON stdout. |
| **Yahoo Finance** | `yahoo-finance2` (installed) | Supplementary validation source | Already installed, already used in the app. 4yr annual max history -- insufficient as primary but useful as tie-breaker. |

**Confidence:** HIGH for FMP/SimFin/Yahoo (APIs verified working per memory). MEDIUM for mstarpy (scraper fragility acknowledged, but v9.0.2 working as of 2026-03-25).

### Fiscal Year Alignment Engine

This is the single most important piece of new infrastructure. The existing `layer2_statements.py` discovered the fiscal year alignment problem (LULU went from 1.9% to 19.2% match after adding bidirectional year-offset fallback) but solved it naively. The production solution needs:

| Component | What It Does | Why |
|-----------|-------------|-----|
| **Fiscal calendar resolver** | Maps ticker -> fiscal year end month/day using EDGAR company info (`entityFiscalYearEnd` from CompanyFacts) | Each data source labels fiscal years differently. EDGAR uses XBRL `fy` field, FMP uses `fiscalYear`, SimFin uses `report-date`, yfinance uses period-end-date year. Without knowing the company's FY end, you can't align them. |
| **Period matcher** | Given a company's FY end, translates each source's year label to a canonical fiscal year identifier | Eliminates the bidirectional guessing. Example: LULU FY ends Jan 31 -- EDGAR calls it FY2022, FMP calls it FY2023, yfinance calls it 2023. The period matcher maps all three to the same canonical period. |
| **Overlap detector** | Finds the intersection of years available across sources | Not all sources have the same history depth. FMP: 5yr, SimFin: 10yr, mstarpy: 10+yr, Yahoo: 4yr. Only compare years all sources have. |

**Build this as:** `validation/engines/fiscalAlignment.js` (~200-300 LOC)

**Confidence:** HIGH for the approach. The field mapping JSON already has `fiscalYearEnd` data per Morningstar fixture. EDGAR CompanyFacts has `entityFiscalYearEnd`. This is a solved problem once you centralize it instead of doing ad-hoc offset guessing.

### Sign Convention & Field Mapping Engine

| Component | What It Does | Why |
|-----------|-------------|-----|
| **Universal field mapping** | Maps field names across all sources to canonical Thes1s field names | Each source uses different names: FMP `netIncome`, SimFin `Net Income`, yfinance `Net Income`, mstarpy `Net Income`, Thes1s `net_income_loss`. One canonical mapping table, not per-source scripts. |
| **Sign convention normalizer** | Applies sign multipliers per source per field | FMP returns CapEx as negative, EDGAR as positive. Morningstar returns cost_of_revenue as negative, EDGAR as positive. The existing `field-mapping.json` has sign multipliers for Morningstar; extend it to all sources. |
| **Scale normalizer** | Handles unit differences (millions vs full dollars vs thousands) | mstarpy returns values in millions. FMP returns full dollars. SimFin returns full dollars. Normalize everything to full dollars (Thes1s convention). |

**Build this as:** `validation/engines/fieldMapping.js` (~300-400 LOC) + `validation/data/source-mappings.json`

**Confidence:** HIGH -- the `field-mapping.json` pattern already works for Morningstar. This extends the pattern to all sources.

### Triangulation Engine

| Component | What It Does | Why |
|-----------|-------------|-----|
| **Consensus scorer** | For each field/year/company, collects values from all available sources and determines consensus | When FMP + SimFin + mstarpy agree and Thes1s doesn't, that's a normalization bug. When sources disagree among themselves, it's a methodology difference. The distinction is critical. |
| **Deviation classifier** | Categorizes each deviation: consensus mismatch (our bug), source disagreement (methodology), missing data (coverage gap) | Different categories need different fixes. A consensus mismatch goes to `edgarFinancials.js`. A methodology difference goes to documentation. A coverage gap goes to tag expansion. |
| **Root cause tagger** | Labels common deviation patterns: sign flip, FY offset, scale error, XBRL tag miss, derivation error, classification difference | Automates the root cause analysis the user has been doing manually. The eng plan already categorizes failures into "named line items", "subtotals & derived formulas", and "residual categories". |

**Build this as:** `validation/engines/triangulation.js` (~400-500 LOC)

**Confidence:** MEDIUM -- the approach is sound (validated by the user's Attempt #3 strategy), but the consensus scoring thresholds will need tuning. Start with: "3 sources agree within 1% and Thes1s disagrees by >5% = definite bug."

### Reporting & Diagnostics

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **JSON output** | Native | Structured comparison results | Machine-readable for automated regression detection. Already the pattern used by `layer2_raw_*.json`. |
| **Console reporter** | Custom (~100 LOC) | Human-readable accuracy dashboard | Print to terminal: overall accuracy, top failures, per-source breakdowns, per-field breakdowns. No dependency needed. |
| **vitest custom reporter** | vitest built-in | CI-friendly accuracy tracking | vitest supports custom reporters. Output accuracy percentages as test metadata for trend tracking. |

**Confidence:** HIGH -- no new dependencies, just structured JSON + console output.

---

## What NOT to Use

| Technology | Why Not |
|------------|---------|
| **pandas / NumPy** (Python) | Tempting for data comparison, but creates a two-language maintenance burden. The comparison logic is simple arithmetic (percentage differences, sign flips, scale factors) -- nothing that needs pandas. Keep everything in JS. |
| **Arelle** (Python XBRL processor) | Full XBRL taxonomy processor (~20K LOC). Massive overkill. The engine already handles XBRL extraction from EDGAR's pre-parsed JSON CompanyFacts API. Arelle is for parsing raw XBRL instance documents, which EDGAR already does for you. |
| **XBRL.js / xbrl-parse** (npm) | Same problem as Arelle -- designed for raw XBRL parsing. EDGAR's CompanyFacts API returns pre-parsed JSON. No raw XBRL parsing needed. |
| **edgartools** (Python) | Convenient Python wrapper for EDGAR, but the JS engine already handles all EDGAR interactions. Adding a Python EDGAR client duplicates work. |
| **sec-edgar-downloader** (Python) | Downloads raw filing documents. The engine uses the CompanyFacts JSON API, not raw filings. Different use case. |
| **calcbench / Intrinio / Polygon** | Additional paid data sources. The project already has FMP + SimFin + mstarpy + Yahoo -- four sources are sufficient for triangulation. More sources add cost without proportional accuracy gains once consensus is established. |
| **PostgreSQL / SQLite** | Tempting for storing comparison results, but the dataset is small (~500 companies x ~85 fields x ~5 years = ~212K data points). JSON files + in-memory processing handle this fine. A database adds deployment complexity to a desktop app's validation pipeline. |
| **D3.js / Chart.js** | Visualization of accuracy trends is a nice-to-have but not needed for the normalization pipeline. Console reports and JSON are sufficient. The app already has Recharts if visualization is needed later. |
| **OpenFIGI / CUSIP lookup** | Ticker resolution isn't the problem. EDGAR CIK lookup already works across all 5,758 companies. |
| **dbt / Great Expectations** | Data quality frameworks designed for data warehouse pipelines. Overkill for a Node.js validation script that runs locally. The vitest + JSON output pattern is simpler and sufficient. |

---

## How Other Projects Solve Normalization

Understanding the competitive landscape informs what's actually hard and what's already solved.

### Commercial Data Providers (Morningstar, S&P Capital IQ, Bloomberg)

These companies employ teams of analysts (hundreds at Morningstar) who manually review and normalize financial statements. Their normalization rules are proprietary. Key patterns:
- **Manual review for edge cases** -- no fully automated system handles 100% of companies. The last 5% requires human judgment (reclassifications, restatements, M&A adjustments).
- **Company-specific overrides** -- major companies get hand-tuned mappings. The "standard" taxonomy handles 95%; exceptions are catalogued per-company.
- **Restated vs. as-originally-filed** -- Morningstar uses restated numbers (the latest 10-K's comparative data), which is what the existing engine extracts via XBRL `fy` + `frame` parameters.

### Open Source XBRL Projects

| Project | Language | What It Does | Relevance |
|---------|----------|-------------|-----------|
| **Arelle** | Python | Full XBRL processor (taxonomy validation, instance parsing, formula processor) | The reference implementation for XBRL standards. Not relevant -- EDGAR provides pre-parsed data. But useful for understanding taxonomy relationships. |
| **calcbench/python_api_client** | Python | Calcbench API wrapper | Commercial API wrapper, not a normalization engine. |
| **edgartools** | Python | Pythonic EDGAR API wrapper | Convenient but handles raw filing access, not normalization. |
| **sec-api.io** | SaaS | EDGAR full-text search + XBRL data | Commercial. Doesn't normalize -- just makes EDGAR data searchable. |
| **Financial Modeling Prep (FMP)** | API | Normalized EDGAR XBRL data | The best reference for how a commercial provider normalizes the same XBRL source. Their normalization differences ARE our research subjects. |

### The Key Insight from the Ecosystem

Nobody has open-sourced a production-grade XBRL normalization engine. The open-source tools handle parsing/downloading, but normalization (mapping 14,000+ XBRL tags to ~85 standardized fields with correct sign conventions, fiscal year alignment, industry-specific rules, and derived field formulas) is treated as proprietary by every commercial provider.

**This means Thes1s's three-layer engine + triangulation approach is genuinely novel.** There's no existing library to plug in. The "stack" for this milestone is less about choosing the right library and more about building the right comparison infrastructure to systematically find and fix normalization rules.

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Comparison language | JavaScript (all JS pipeline) | Python (keep layer2/layer3.py) | Two-language maintenance burden. Field mappings, sign conventions, and FY alignment must be duplicated. Previous Python scripts had bugs in all three areas. |
| mstarpy access | Python subprocess bridge | Port mstarpy to JS | mstarpy is a Python scraper with complex anti-bot handling. No JS equivalent exists. Spawning a Python subprocess for data fetching only is the pragmatic solution. |
| Data storage | JSON files in `validation/data/` | SQLite database | ~212K data points fit comfortably in memory. JSON files are human-readable, git-diffable, and need no driver. SQLite adds complexity for marginal benefit at this scale. |
| Test framework | vitest (existing) | Jest | Already using vitest with 173+ tests. Migration cost with zero benefit. |
| API client | Native fetch | axios / got / node-fetch | Node 18+ native fetch works. Already proven in the existing validation scripts. Zero dependency additions. |
| Accuracy reporting | Console + JSON | Jupyter notebooks | Jupyter is great for exploration but terrible for CI/automation. The validation pipeline should be fully scriptable. |
| Rate limiting | Manual delays (sleep) | p-queue / bottleneck | FMP 300/min, SimFin 5/sec, EDGAR 10/sec. Simple `await sleep(ms)` between requests is sufficient. A rate limiting library adds a dependency for a pattern that's ~3 lines of code. |

---

## Architecture of the Comparison Pipeline

```
VALIDATION PIPELINE (all Node.js except mstarpy bridge)
═══════════════════════════════════════════════════════

┌──────────────────────────┐
│  1. Data Collection      │
│                          │
│  validation/collectors/  │
│  ├── thes1s.js          │ ← calls bundled engine (esbuild)
│  ├── fmp.js             │ ← direct fetch + API key
│  ├── simfin.js          │ ← direct fetch + auth header
│  ├── mstarpy-bridge.js  │ ← spawns python3, reads JSON
│  └── yahoo.js           │ ← yahoo-finance2 package
└──────────┬───────────────┘
           │ raw JSON per source per ticker
           ▼
┌──────────────────────────┐
│  2. Normalization        │
│                          │
│  validation/engines/     │
│  ├── fieldMapping.js     │ ← universal field name map
│  ├── signConvention.js   │ ← per-source sign multipliers
│  ├── scaleNormalizer.js  │ ← millions → full dollars
│  └── fiscalAlignment.js  │ ← FY-end-aware period matching
└──────────┬───────────────┘
           │ normalized {field: value} per source per year
           ▼
┌──────────────────────────┐
│  3. Triangulation        │
│                          │
│  validation/engines/     │
│  ├── triangulation.js    │ ← consensus scoring
│  ├── deviationClassifier │ ← categorize discrepancies
│  └── rootCauseTagger.js  │ ← pattern-match known issues
└──────────┬───────────────┘
           │ deviation reports per ticker
           ▼
┌──────────────────────────┐
│  4. Reporting            │
│                          │
│  validation/reporters/   │
│  ├── console.js          │ ← terminal dashboard
│  ├── json.js             │ ← machine-readable output
│  └── regression.js       │ ← diff vs previous run
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│  5. Fix Application      │
│                          │
│  src/engines/            │
│  └── edgarFinancials.js  │ ← taxonomy fixes, derivation
│                          │    fixes, sign convention fixes
│  + re-run pipeline       │
└──────────────────────────┘
```

---

## Installation

```bash
# No new npm dependencies needed for the comparison pipeline.
# Everything uses existing packages (vitest, esbuild, yahoo-finance2, native fetch).

# Python dependencies (mstarpy bridge only):
pip install mstarpy yfinance
# mstarpy v9.0.2 confirmed working as of 2026-03-25
```

**New files to create (no external dependencies):**

```
validation/
├── collectors/
│   ├── thes1s.js          # ~80 LOC - calls bundled engine
│   ├── fmp.js             # ~120 LOC - FMP API client
│   ├── simfin.js          # ~150 LOC - SimFin API client
│   ├── mstarpy-bridge.js  # ~60 LOC - python3 subprocess
│   └── yahoo.js           # ~80 LOC - yahoo-finance2 wrapper
├── engines/
│   ├── fieldMapping.js    # ~300 LOC - universal field map
│   ├── signConvention.js  # ~100 LOC - sign normalizer
│   ├── scaleNormalizer.js # ~50 LOC - unit converter
│   ├── fiscalAlignment.js # ~250 LOC - FY period matcher
│   ├── triangulation.js   # ~400 LOC - consensus scorer
│   └── rootCauseTagger.js # ~200 LOC - deviation classifier
├── reporters/
│   ├── console.js         # ~150 LOC - terminal output
│   ├── json.js            # ~80 LOC - structured output
│   └── regression.js      # ~100 LOC - diff vs baseline
├── data/
│   ├── source-mappings.json       # field name mappings per source
│   ├── sign-conventions.json      # sign multipliers per source per field
│   ├── fiscal-calendars.json      # FY-end dates per ticker (cached from EDGAR)
│   ├── thesis/                    # existing: Thes1s engine exports
│   ├── fmp/                       # cached FMP responses
│   ├── simfin/                    # cached SimFin responses
│   ├── mstarpy/                   # existing: cached mstarpy responses
│   └── yfinance/                  # existing: cached yfinance responses
└── scripts/
    ├── run-triangulation.mjs      # main pipeline entry point
    ├── collect-all-sources.mjs    # batch data collection
    └── generate-baseline.mjs     # snapshot current accuracy
```

**Estimated total new code:** ~2,100 LOC (all JavaScript except mstarpy's 10-line Python snippet)

---

## Key Technical Decisions

| Decision | Rationale |
|----------|-----------|
| **All-JS pipeline** | Single language for field mappings, sign conventions, FY alignment. Eliminates the class of bugs caused by maintaining parallel implementations in Python and JS. |
| **Collector pattern** (thin API wrappers) | Each source gets a ~100 LOC collector that fetches and returns raw JSON. Normalization happens downstream in shared code. This decouples "how to call the API" from "how to interpret the data." |
| **JSON file caching** per source per ticker | FMP 300/day, SimFin 2000/day. Cache raw responses so re-running triangulation doesn't re-fetch. Files are human-inspectable for debugging. |
| **Universal field mapping** as a single JSON config | One file maps all sources to canonical fields. When a new source is added, add a column. When a field is renamed, change one place. |
| **mstarpy as subprocess, not dependency** | mstarpy is Python-only and fragile. Don't make the JS pipeline depend on it. If mstarpy breaks, the pipeline degrades gracefully to 3-source triangulation. |
| **vitest for accuracy tests** | The accuracy suite already runs in vitest. Keep it there. Add triangulation as additional test suites in the same framework. |
| **Consensus threshold: 3 sources agree within 1%** | Start conservative. When FMP + SimFin + mstarpy all report the same value (within 1%) and Thes1s differs by >5%, that's a high-confidence normalization bug. Loosen thresholds later based on empirical results. |

---

## API-Specific Integration Notes

### FMP (Financial Modeling Prep)

```javascript
// Stable endpoints (verified working per memory reference)
const income = await fetch(
  `https://financialmodelingprep.com/api/v3/income-statement/${ticker}?period=annual&apikey=${key}`
);
// Also: balance-sheet-statement, cash-flow-statement
// Returns array of objects with camelCase keys: { revenue, costOfRevenue, netIncome, ... }
// Uses `fiscalYear` field for year labeling (calendar year of FY end)
// Full dollars (not millions)
```

**Key mapping challenge:** FMP field names are camelCase and mostly match Thes1s semantics, but `totalDebt`, `netDebt`, `investedCapital` use different formulas. Map ~40 fields.

### SimFin

```javascript
// Compact endpoint (verified working per memory reference)
const data = await fetch(
  `https://backend.simfin.com/api/v3/companies/statements/compact?ticker=${ticker}&statements=PL&period=FY`,
  { headers: { 'Authorization': `api-key ${key}` } }
);
// Returns { statements: [{ columns: [...], data: [[...]] }] }
// Separate templates for banks/insurance: statements=PL,BS,CF vs statements=BANK
// Full dollars, fiscal period dates in data
```

**Key mapping challenge:** SimFin uses its own field names (e.g., "Depreciation & Amortisation" not "Depreciation And Amortization"). Compact format requires column-index mapping. ~30 fields for standard companies, additional bank/insurance fields.

### mstarpy Python Bridge

```javascript
// Spawn Python subprocess to fetch mstarpy data
import { execFile } from 'child_process';

function fetchMstarpy(ticker) {
  return new Promise((resolve, reject) => {
    execFile('python3', ['-c', `
import json, mstarpy
sec = mstarpy.SecurityAnalysis(ticker="${ticker}", exchange="XNAS")
fs = sec.financial_statements(frequency="annual", statement_type="income")
print(json.dumps(fs))
    `], (err, stdout) => {
      if (err) return resolve(null); // graceful degradation
      resolve(JSON.parse(stdout));
    });
  });
}
```

**Key mapping challenge:** mstarpy returns values in millions (multiply by 1e6). Field names match Morningstar CSV labels (the truth set). This is the easiest source to map because the field-mapping.json already exists.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| All-JS pipeline decision | HIGH | Already proven by the bundler + vitest pattern. Two-language bugs documented in previous attempts. |
| FMP/SimFin API integration | HIGH | API connections verified working, accuracy tested on AAPL (per memory reference). |
| Fiscal year alignment approach | HIGH | Problem well-understood from layer2_statements.py experience. Solution is deterministic (use FY-end month from EDGAR). |
| mstarpy subprocess bridge | MEDIUM | mstarpy scraper is fragile by nature. Works today, could break tomorrow. The pipeline must handle mstarpy failure gracefully. |
| Triangulation consensus thresholds | MEDIUM | Starting thresholds (3 agree within 1%, Thes1s off by >5%) are reasonable but need empirical tuning. May need per-field or per-statement-type thresholds. |
| Total LOC estimate (~2,100) | MEDIUM | Could be 1,500-3,000 depending on how many edge cases the field mappings need. The collector pattern keeps individual files small. |
| Version numbers for existing deps | HIGH | Read directly from `package.json` in this session. |

---

## Gaps to Address in Phase-Specific Research

1. **SimFin bank/insurance template mapping** -- SimFin uses different statement templates for financial companies. Need to verify which fields are available and how they map to Thes1s industry overlays. Research this when implementing the SimFin collector.

2. **FMP field completeness** -- FMP's 100% accuracy on AAPL (single ticker) may not hold across all 50 truth set companies. Need batch comparison to validate. This is a Phase 1 deliverable, not pre-research.

3. **mstarpy v9 field name stability** -- mstarpy v9 changed its API surface (nested `subLevel` format). Need to verify field names match across statement types. Do this during mstarpy bridge implementation.

4. **Consensus scoring for derived fields** -- Total debt, invested capital, EBITDA, and similar derived fields differ by formula across ALL providers. These may never reach consensus. Need to categorize derived fields differently from directly-extracted fields.

5. **EDGAR CompanyFacts API changes** -- SEC occasionally changes API behavior. The `entityFiscalYearEnd` field for fiscal calendar resolution needs to be verified for reliability across the full company universe.

---

## Sources

- Existing codebase: `package.json`, `edgarFinancials.js`, `morningstarAccuracy.test.js`, `field-mapping.json`, `bundle.mjs`, `layer2_statements.py`, `export-financials.mjs`
- Engineering plans: `gstack-xbrl-annual-normalization-eng-plan-20260319.md`, `gstack-xbrl-engine-strategy-eng-plan-20260318.md`
- Validation reports: `validation-summary-2026-03-10.md`
- Memory references: `reference_financial_data_apis.md` (API keys, endpoints, rate limits, accuracy results)
- Project definition: `.planning/PROJECT.md` (Attempt #3 strategy, data source table, constraints)

**Note:** WebSearch, WebFetch, and Bash tools were all unavailable during this research session. Ecosystem claims about Arelle, edgartools, sec-edgar-downloader, and commercial providers are based on training data (cutoff May 2025) and flagged accordingly. Version recommendations for external tools should be verified before implementation.
