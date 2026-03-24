---
phase: 05A-agent-definitions-foundation
plan: 03
type: execute
wave: 2
depends_on: [05A-01, 05A-02]
files_modified:
  - src/engines/dataExport.js
  - src/engines/toolbox.js
  - src/engines/__tests__/dataExport.test.js
  - src/engines/__tests__/toolbox.test.js
autonomous: true
requirements: [DATA-01, DATA-03, DATA-04]

must_haves:
  truths:
    - "assembleDataPacket(ticker) calls all 20+ engines and returns a canonical JSON DataPacket"
    - "DataPacket contains structured output from every engine category: financials, growth, returns, FCF, key metrics, scores, gurus, insiders, compensation, peers, peerMetrics, analyst estimates, events, prices, transcripts"
    - "sliceDataPacket filters the full DataPacket to only the fields an agent needs"
    - "Toolbox tools wrap existing engine functions with the same input/output as the engine originals"
    - "TOOL_DEFINITIONS array provides Claude tool_use compatible schemas for all 12+ tools"
  artifacts:
    - path: "src/engines/dataExport.js"
      provides: "DataPacket assembly from all engines + assembleDataPacket() function"
      exports: ["assembleDataPacket"]
    - path: "src/engines/toolbox.js"
      provides: "Tool definitions for Claude API + tool executor function"
      exports: ["TOOL_DEFINITIONS", "executeTool"]
    - path: "src/engines/__tests__/dataExport.test.js"
      provides: "Tests for DataPacket assembly and slicing"
    - path: "src/engines/__tests__/toolbox.test.js"
      provides: "Tests for Toolbox tool definitions and executor"
  key_links:
    - from: "src/engines/dataExport.js"
      to: "src/engines/edgarFinancials.js"
      via: "imports fetchEdgarStatements for core financial data"
      pattern: "fetchEdgarStatements"
    - from: "src/engines/dataExport.js"
      to: "src/schemas/dataPacket.js"
      via: "DataPacket output conforms to DataPacketSchema"
      pattern: "DataPacketSchema"
    - from: "src/engines/toolbox.js"
      to: "src/engines/valuation.js"
      via: "wraps computeMOS, computePBT, computeTenCap, computeEquityBond, sensitivityTable"
      pattern: "computeMOS|computePBT|computeTenCap"
---

<objective>
Create the DataPacket assembler and Toolbox tool wrappers. dataExport.js calls all 20+ engines to produce a canonical JSON snapshot of everything known about a company. toolbox.js wraps existing engine functions as callable tools for AI agents, with Claude tool_use compatible definitions for the API path and a unified executor function.

Purpose: These are the two data-side components agents consume. DataPacket is the static snapshot ("here's everything we know"). Toolbox is the interactive capability ("explore further during analysis"). Together they give agents the same access a human user has in the Toolbox UI — the overview plus the ability to drill deeper.

Output: dataExport.js (~300 LOC) with assembleDataPacket(), toolbox.js (~250 LOC) with TOOL_DEFINITIONS and executeTool(), plus tests for both.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/05A-agent-definitions-foundation/05A-RESEARCH.md
@gstack/plans/gstack-ai-agent-workflow-plan-20260323.md

@.planning/phases/05A-agent-definitions-foundation/05A-01-SUMMARY.md
@.planning/phases/05A-agent-definitions-foundation/05A-02-SUMMARY.md
</context>

<interfaces>
<!-- Exports from schemas (Plan 01) and nodeAdapter (Plan 02) that this plan uses -->

From src/schemas/dataPacket.js (Plan 01):
```javascript
export const DataPacketSchema; // Zod schema for DataPacket validation
export function sliceDataPacket(fullPacket, agentConfig); // Returns filtered DataPacket
```

From src/engines/nodeAdapter.js (Plan 02):
```javascript
export function getEnv(key);       // process.env wrapper
export function isDev();           // always false in Node
export function resolveURL(url);   // proxy -> direct URL
export function createDOMParser(); // linkedom DOMParser
export function createNodeFetch(); // fetch with User-Agent
export const IS_NODE;
```

From src/engines/valuation.js (existing):
```javascript
export function computeMOS({ fgr, eps, futurePE, marr = 0.15, years = 10 });
export function computePBT({ fcfPerShare, fgr, targetYears = 8 });
export function computeTenCap({ operatingCashFlow, maintenanceCapEx, taxProvision, sharesOutstanding, method = 'ruleOne' });
export function computeEquityBond({ bvps, roe, retainedRatio, historicalPE, marr = 0.20, mosPercent = 0.50, years = 10, currentPrice = null });
export function sensitivityTable({ method, baseInputs, param1, param2 });
export function fcfPerShare({ fcfRatio, eps });
export function yearsToPayback({ fcfPerShare, fgr, price });
```

From src/engines/growthRates.js (existing):
```javascript
export function computeAllGrowthRates(statements, excludeYears = new Set());
export function computeGrowthRates(series, excludeYears = new Set());
export function buildGrowthAnalysisSeries(statements);
```
</interfaces>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: DataPacket assembly module</name>
  <files>src/engines/dataExport.js, src/engines/__tests__/dataExport.test.js</files>
  <read_first>
    - src/engines/edgarFinancials.js (first 30 lines — see export names for fetchEdgarStatements or similar)
    - src/engines/growthRates.js (first 10 lines — see computeAllGrowthRates signature)
    - src/engines/returnMetrics.js (first 10 lines — see export names)
    - src/engines/freeCashFlow.js (first 10 lines — see export names)
    - src/engines/keyMetrics.js (first 10 lines — see export names)
    - src/engines/ruleOneScore.js (first 20 lines — see computeRuleOneScore, computeMoatScore, computeManagementScore)
    - src/engines/gurus.js (first 10 lines — see export names)
    - src/engines/insiders.js (first 10 lines — see export names)
    - src/engines/compensation.js (first 10 lines — see export names)
    - src/engines/peers.js (first 10 lines — see export names)
    - src/engines/peerMetrics.js (first 10 lines — see export names)
    - src/engines/analystEstimates.js (first 10 lines — see export names)
    - src/engines/companyEvents.js (first 10 lines — see export names)
    - src/engines/transcripts.js (first 10 lines — see export names)
    - src/engines/prices.js (first 20 lines — see export names)
    - src/engines/batchQuotes.js (first 10 lines — see export names)
    - src/engines/fgr.js (first 10 lines — see export names)
    - src/engines/industryClassifier.js (first 20 lines — see classifyIndustry or similar)
    - src/schemas/dataPacket.js (see DataPacketSchema and sliceDataPacket)
    - .planning/phases/05A-agent-definitions-foundation/05A-RESEARCH.md (lines 414-513 for dataExport code example)
    - gstack/plans/gstack-ai-agent-workflow-plan-20260323.md (lines 226-253 for DataPacket schema)
  </read_first>
  <behavior>
    - Test 1: assembleDataPacket is an async function that returns an object
    - Test 2: assembleDataPacket result has ticker field matching input
    - Test 3: assembleDataPacket result has assembledAt field as ISO string
    - Test 4: assembleDataPacket result has caveats as array
    - Test 5: DataPacketSchema.safeParse(mockResult) succeeds (conforms to schema)
    - Test 6: buildCaveats returns REIT caveat for reit classification
    - Test 7: buildCaveats returns empty array for standard classification
  </behavior>
  <action>
    Create `src/engines/dataExport.js`:

    **Import all engine modules.** Read each engine file's exports to get the exact function names (do not assume — read the actual files). The RESEARCH.md lines 414-437 provide a starting list, but the real function names from the actual engine files are authoritative.

    **assembleDataPacket(ticker) function:**

    Follow the 5-step assembly pattern from RESEARCH.md lines 439-498:

    Step 1: Core financial data (sequential — other engines depend on this)
    - Fetch EDGAR statements for the ticker
    - This provides financials, companyInfo, classification, ttm

    Step 2: Computed metrics (parallel — depend only on financials)
    - Growth rates
    - Return metrics
    - Free cash flow
    - Key metrics

    Step 3: External data (parallel — independent of each other)
    - Gurus
    - Insiders
    - Compensation
    - Peers
    - Analyst estimates
    - Company events
    - Prices
    - Transcript availability

    Step 4: Dependent data (depends on previous steps)
    - Peer metrics (depends on peers)
    - Batch quotes for peers

    Step 5: Composite scores (depends on growth + returns)
    - Moat score
    - Management score
    - Rule One composite score

    **Return the DataPacket object** matching the DataPacketSchema shape (from Plan 01):
    ```javascript
    return {
      ticker,
      companyInfo,
      classification,
      currentPrice,
      financials,
      ttm,
      growthRates,
      returnMetrics,
      debtMetrics,
      fcf,
      keyMetrics,
      ruleOneScore: { moat: moatScore, management: managementScore, composite: ruleOneScore },
      gurus,
      insiders,
      compensation,
      peers,
      peerMetrics,
      analystEstimates,
      events,
      prices,
      transcriptAvailability,
      caveats: buildCaveats(classification),
      assembledAt: new Date().toISOString(),
    };
    ```

    **Wrap each engine call in try/catch** — if an engine fails, set its field to null and log the error. DataPacket must be assembled even if individual engines fail (partial data is better than no data). Add an `errors` array field to track which engines failed.

    **buildCaveats(classification) function** (exported for testing):
    - Per RESEARCH.md lines 500-513
    - REIT: FFO caveat, AFFO maintenance capex caveat
    - Insurance: float approximation caveat
    - Bank: NIM/efficiency ratio guidance
    - Standard: empty array

    **debtMetrics derivation** (from financials):
    Extract from financials the latest year's total_debt, net_income, fcf to compute:
    - netDebt = total_debt - cash
    - netDebtToEarnings = netDebt / net_income
    - netDebtToFCF = netDebt / fcf
    - isNetCash = netDebt < 0

    **Tests (src/engines/__tests__/dataExport.test.js):**

    Since assembleDataPacket calls real external APIs (EDGAR, Yahoo, etc.), the tests should NOT call the real function. Instead:

    1. Test buildCaveats directly (pure function, no API calls):
       - buildCaveats({ industryType: 'reit' }) includes FFO caveat string
       - buildCaveats({ industryType: 'bank' }) includes NIM caveat string
       - buildCaveats({ industryType: 'insurance' }) includes float caveat string
       - buildCaveats({}) returns empty array
       - buildCaveats(null) returns empty array

    2. Test DataPacket schema conformance with a mock:
       - Create a complete mock DataPacket with all fields
       - Verify DataPacketSchema.safeParse(mockPacket).success === true
       - Verify a DataPacket missing ticker fails validation

    3. Test sliceDataPacket (imported from schemas/dataPacket.js):
       - sliceDataPacket(mockPacket, { dataPacketSlice: ['financials', 'growthRates'] }) returns object with financials, growthRates, ticker, companyInfo, classification, caveats — and NOT gurus, insiders, etc.
       - sliceDataPacket(mockPacket, { dataPacketSlice: [] }) still returns ticker, companyInfo, classification, caveats

    4. Test assembleDataPacket exists and is an async function (typeof check only — no API calls)
  </action>
  <verify>
    <automated>cd /Users/kylehoff/Desktop/stock-analyzer && npx vitest run src/engines/__tests__/dataExport.test.js --reporter=verbose</automated>
  </verify>
  <acceptance_criteria>
    - src/engines/dataExport.js exists and exports assembleDataPacket and buildCaveats
    - assembleDataPacket is an async function (typeof assembleDataPacket returns 'function' or 'asyncfunction')
    - buildCaveats({ industryType: 'reit' }) returns array containing a string with "FFO"
    - buildCaveats({ industryType: 'bank' }) returns array containing a string with "NIM"
    - buildCaveats({}) returns empty array
    - Each engine call is wrapped in try/catch (grep for 'catch' shows at least 10 catch blocks)
    - File imports from at least 15 engine modules (grep for "from './" shows 15+ import lines)
    - Tests pass with `npx vitest run src/engines/__tests__/dataExport.test.js`
  </acceptance_criteria>
  <done>assembleDataPacket assembles all engine output into a canonical DataPacket JSON, with error resilience per engine and industry-aware caveats</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Toolbox tool wrappers</name>
  <files>src/engines/toolbox.js, src/engines/__tests__/toolbox.test.js</files>
  <read_first>
    - src/engines/valuation.js (full file — see all export function signatures: computeMOS, computePBT, computeTenCap, computeEquityBond, sensitivityTable, fcfPerShare, yearsToPayback, etc.)
    - src/engines/growthRates.js (first 30 lines — see computeAllGrowthRates, computeGrowthRates signatures)
    - src/engines/keyMetrics.js (first 20 lines — see computeKeyMetrics or similar export)
    - src/engines/filingMarkdown.js (first 20 lines — see export for filing section extraction)
    - src/engines/transcripts.js (first 30 lines — see export for transcript fetching)
    - src/engines/peerMetrics.js (first 20 lines — see export for peer comparison)
    - gstack/plans/gstack-ai-agent-workflow-plan-20260323.md (lines 260-275 for Toolbox tool list and descriptions)
    - .planning/phases/05A-agent-definitions-foundation/05A-RESEARCH.md (lines 516-557 for toolbox code example)
  </read_first>
  <behavior>
    - Test 1: TOOL_DEFINITIONS is an array with at least 10 elements
    - Test 2: Each tool definition has name (string), description (string), input_schema (object with type "object")
    - Test 3: Each tool definition's input_schema has required array and properties object
    - Test 4: Tool names include: computeMOS, computePBT, computeTenCap, computeEquityBond, sensitivityTable, getMetric, getFinancialLine, computeGrowthRates, comparePeers, readFilingSection, getTranscriptExcerpt
    - Test 5: executeTool('computeMOS', { fgr: 0.12, eps: 5.0, futurePE: 24 }) returns object with stickerPrice and buyPrice (numbers > 0)
    - Test 6: executeTool('unknown_tool', {}) throws Error with message containing 'Unknown tool'
    - Test 7: Every tool in TOOL_DEFINITIONS has a corresponding case in executeTool
  </behavior>
  <action>
    Create `src/engines/toolbox.js`:

    **Import the actual engine functions** by reading each engine file to get exact export names. The key ones:

    From valuation.js: computeMOS, computePBT, computeTenCap, computeEquityBond, sensitivityTable, fcfPerShare, yearsToPayback
    From growthRates.js: computeAllGrowthRates, computeGrowthRates
    From peerMetrics.js: (whatever the peer comparison export is)
    From filingMarkdown.js: (whatever the filing section reader export is)
    From transcripts.js: (whatever the transcript excerpt export is)

    **TOOL_DEFINITIONS array** — each element is a Claude tool_use compatible definition:
    ```javascript
    {
      name: "computeMOS",
      description: "Compute Margin of Safety buy price using Rule One method. Grows EPS at FGR for 10 years, applies Future P/E, discounts at MARR, then applies 50% MOS. Returns stickerPrice and buyPrice.",
      input_schema: {
        type: "object",
        properties: {
          fgr: { type: "number", description: "Future Growth Rate as decimal (e.g., 0.12 for 12%)" },
          eps: { type: "number", description: "Current EPS (TTM or 3yr avg)" },
          futurePE: { type: "number", description: "Future P/E ratio (max 2x FGR, capped at historical high)" },
          marr: { type: "number", description: "Minimum Acceptable Rate of Return (default 0.15)" },
        },
        required: ["fgr", "eps", "futurePE"],
        additionalProperties: false,
      },
    }
    ```

    Create similar definitions for ALL tools listed in the architecture plan (lines 260-275):
    1. **computeMOS** — MOS buy price
    2. **computePBT** — Payback Time calculation
    3. **computeTenCap** — Ten Cap owner earnings price
    4. **computeEquityBond** — Equity Bond buy price (Buffettology method)
    5. **sensitivityTable** — Vary assumptions across valuation methods
    6. **getMetric** — Retrieve a specific metric for a ticker across years
    7. **getFinancialLine** — Retrieve a specific line item from financial statements
    8. **computeGrowthRates** — Compute CAGR for a metric, optionally excluding years
    9. **comparePeers** — Compare a ticker's metric against N peers
    10. **readFilingSection** — Read a specific section from a 10-K or 10-Q
    11. **getTranscriptExcerpt** — Get earnings call transcript excerpt by topic/quarter
    12. **fcfPerShare** — Compute FCF per share from FCF ratio and EPS
    13. **yearsToPayback** — Compute years to payback at given price

    For getMetric and getFinancialLine, these are wrapper functions that look up values in a pre-loaded DataPacket (passed as context). Implement them as functions that take a DataPacket reference:

    ```javascript
    // These tools need the DataPacket context — pass it when creating the executor
    export function createToolExecutor(dataPacket) {
      return function executeTool(toolName, input) {
        switch (toolName) {
          case 'computeMOS': return computeMOS(input);
          case 'getMetric': return getMetricFromPacket(dataPacket, input);
          // ... etc
          default: throw new Error(`Unknown tool: ${toolName}`);
        }
      };
    }
    ```

    Also export a standalone `executeTool(toolName, input)` for tools that don't need DataPacket context (valuation functions).

    **getMetricFromPacket(dataPacket, { metric, years }):**
    - Looks up `dataPacket[metric]` or navigates nested paths like `growthRates.earnings.10yr`
    - Returns the value(s) for the requested years
    - Supports dot-notation paths: `getMetricFromPacket(dp, { metric: 'growthRates.earnings.5yr' })`

    **getFinancialLineFromPacket(dataPacket, { statement, field, years }):**
    - statement: "income" | "balance" | "cashFlow"
    - field: e.g., "revenue", "net_income", "total_debt"
    - years: optional array of years to filter
    - Returns the yearly values from dataPacket.financials

    **Tests (src/engines/__tests__/toolbox.test.js):**

    1. TOOL_DEFINITIONS array structure:
       - Has at least 10 elements
       - Each has name (string), description (string), input_schema (object)
       - input_schema.type === "object" for all
       - input_schema.properties exists for all
       - input_schema.required is an array for all

    2. Tool name coverage:
       - TOOL_DEFINITIONS.map(t => t.name) includes 'computeMOS', 'computePBT', 'computeTenCap', 'computeEquityBond', 'sensitivityTable'

    3. executeTool smoke tests (pure computation, no API):
       - executeTool('computeMOS', { fgr: 0.12, eps: 5.0, futurePE: 24 }) returns object with numeric stickerPrice and buyPrice
       - executeTool('computePBT', { fcfPerShare: 8, fgr: 0.12, targetYears: 8 }) returns object (verify it has expected structure)
       - executeTool('computeTenCap', { operatingCashFlow: 6000000000, maintenanceCapEx: 2000000000, taxProvision: 500000000, sharesOutstanding: 443000000 }) returns object with tenCapPrice > 0

    4. Error handling:
       - executeTool('nonexistent', {}) throws Error containing 'Unknown tool'

    5. createToolExecutor with mock DataPacket:
       - const executor = createToolExecutor({ growthRates: { earnings: { '5yr': 12.5 } } })
       - executor('getMetric', { metric: 'growthRates.earnings.5yr' }) returns 12.5
  </action>
  <verify>
    <automated>cd /Users/kylehoff/Desktop/stock-analyzer && npx vitest run src/engines/__tests__/toolbox.test.js --reporter=verbose</automated>
  </verify>
  <acceptance_criteria>
    - src/engines/toolbox.js exports TOOL_DEFINITIONS (array), executeTool (function), createToolExecutor (function)
    - TOOL_DEFINITIONS.length >= 10
    - Every element in TOOL_DEFINITIONS has name, description, input_schema with type "object"
    - executeTool('computeMOS', { fgr: 0.12, eps: 5.0, futurePE: 24 }).buyPrice is a number > 0
    - executeTool('unknown_tool', {}) throws Error
    - Tests pass with `npx vitest run src/engines/__tests__/toolbox.test.js`
    - File imports computeMOS, computePBT, computeTenCap, computeEquityBond from valuation.js
  </acceptance_criteria>
  <done>Toolbox provides 12+ tool definitions compatible with Claude tool_use API, plus an executor that routes tool calls to existing engine functions</done>
</task>

</tasks>

<verification>
1. `npx vitest run src/engines/__tests__/dataExport.test.js src/engines/__tests__/toolbox.test.js --reporter=verbose` — all tests pass
2. `npm test -- --run` — existing 630+ tests still pass
3. `node -e "import('./src/engines/toolbox.js').then(m => console.log('Tools:', m.TOOL_DEFINITIONS.map(t => t.name).join(', ')))"` outputs all tool names
</verification>

<success_criteria>
- assembleDataPacket exists and imports from 15+ engine modules
- Each engine call is error-resilient (try/catch)
- buildCaveats produces industry-aware caveats
- TOOL_DEFINITIONS has 12+ Claude tool_use compatible definitions
- executeTool routes to correct engine functions
- createToolExecutor supports DataPacket-dependent tools (getMetric, getFinancialLine)
- All tests pass with 0 failures
</success_criteria>

<output>
After completion, create `.planning/phases/05A-agent-definitions-foundation/05A-03-SUMMARY.md`
</output>
