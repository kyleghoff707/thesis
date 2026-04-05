---
phase: 05A-agent-definitions-foundation
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/schemas/reportSection.js
  - src/schemas/dataPacket.js
  - src/schemas/progress.js
  - src/schemas/__tests__/reportSection.test.js
  - src/schemas/__tests__/progress.test.js
  - package.json
autonomous: true
requirements: [SCHM-01, SCHM-02, SCHM-03, SCHM-04]

must_haves:
  truths:
    - "Report section schema validates a well-formed section JSON and returns success"
    - "Report section schema rejects JSON missing required fields (e.g., no redFlags, no citations)"
    - "Zod toJSONSchema() produces a valid JSON Schema object suitable for Claude structured outputs"
    - "Progress schema validates all state machine states and rejects invalid transitions"
    - "New report schema is additive to existing localStorage model — existing fields untouched"
  artifacts:
    - path: "src/schemas/reportSection.js"
      provides: "Zod schemas for ReportSection, Citation, Table, Chart, StageReport"
      exports: ["ReportSectionSchema", "CitationSchema", "TableSchema", "StageReportSchema"]
    - path: "src/schemas/dataPacket.js"
      provides: "Zod schema for DataPacket structure with all engine output fields"
      exports: ["DataPacketSchema"]
    - path: "src/schemas/progress.js"
      provides: "Zod schema for generation state machine (progress.json)"
      exports: ["ProgressSchema"]
    - path: "src/schemas/__tests__/reportSection.test.js"
      provides: "Tests for schema validation and JSON Schema generation"
    - path: "src/schemas/__tests__/progress.test.js"
      provides: "Tests for progress state validation"
  key_links:
    - from: "src/schemas/reportSection.js"
      to: "Claude API output_config.format"
      via: "z.toJSONSchema(ReportSectionSchema)"
      pattern: "toJSONSchema"
    - from: "src/schemas/reportSection.js"
      to: "src/hooks/useResearch.js"
      via: "StageReportSchema nests inside existing report model"
      pattern: "onePager.*sections"
---

<objective>
Install Zod and create all three Zod schema files that define the contracts for Phase 5A: report sections, DataPacket structure, and generation state. These schemas are the foundation everything else depends on — agent configs reference them, DataPacket assembly must conform to them, and Claude structured outputs require their JSON Schema representation.

Purpose: Establish the type contracts that all other Phase 5A plans build against. Without these schemas, agent definitions cannot specify output format, DataPacket assembly has no target shape, and structured output enforcement is impossible.

Output: Three schema files in src/schemas/, test files proving validation works, and zod + linkedom + dotenv installed as dependencies.
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
</context>

<tasks>

<task type="auto">
  <name>Task 1: Install dependencies and create schemas directory</name>
  <files>package.json, src/schemas/reportSection.js, src/schemas/dataPacket.js, src/schemas/progress.js</files>
  <read_first>
    - package.json (see current dependencies)
    - src/hooks/useResearch.js (see existing report data model — lines 47-67 for the createReport shape)
    - gstack/plans/gstack-ai-agent-workflow-plan-20260323.md (lines 296-317 for report JSON schema specification)
    - .planning/phases/05A-agent-definitions-foundation/05A-RESEARCH.md (lines 245-296 for ReportSectionSchema, lines 559-592 for ProgressSchema, lines 636-676 for backward compatibility strategy)
  </read_first>
  <action>
    1. Run `npm install zod linkedom dotenv`

    2. Verify Zod v4 is available. After install, test which import path works:
       - Try `import { z } from "zod"` and check if `z.toJSONSchema` exists
       - If not, try `import { z } from "zod/v4"`
       - Use whichever path provides `z.toJSONSchema()`. Document the working import path in a comment at the top of each schema file.

    3. Create `src/schemas/` directory.

    4. Create `src/schemas/reportSection.js` with these exact Zod schemas:

       **CitationSchema:**
       - id: z.number()
       - ref: z.string() — DataPacket field path or document reference
       - text: z.string() — the quoted text or value
       - source: z.string() — "DataPacket", "10-K FY2024 p.34", URL, etc.

       **TableSchema:**
       - title: z.string()
       - headers: z.array(z.string())
       - rows: z.array(z.array(z.union([z.string(), z.number(), z.null()])))
       - source: z.string().optional()

       **ChartSchema:**
       - type: z.string()
       - config: z.record(z.unknown())
       - data: z.array(z.record(z.unknown()))

       **ReportSectionSchema:**
       - key: z.string() — section identifier (e.g., "fcf", "radar", "pest")
       - title: z.string() — human-readable title (e.g., "Free Cash Flow")
       - sectionNumber: z.number()
       - status: z.enum(["pass", "fail", "review", "pending"])
       - confidence: z.enum(["HIGH", "MEDIUM", "LOW"])
       - verdict: z.enum(["PASS", "FAIL", "WATCHLIST"]).nullable()
       - verdictRationale: z.string()
       - summary: z.string() — 1-2 sentences for downstream agents
       - data: z.record(z.unknown()) — section-specific structured data (flexible)
       - narrative: z.string() — Buffett-style prose analysis
       - citations: z.array(CitationSchema)
       - tables: z.array(TableSchema).optional().default([])
       - charts: z.array(ChartSchema).optional().default([])
       - redFlags: z.array(z.string()).min(1) — at least one, even for PASS verdicts (per KDD #12)
       - primarySourceInsights: z.array(z.string()).optional().default([])
       - generatedAt: z.string() — ISO timestamp
       - modelUsed: z.string() — e.g., "claude-sonnet-4-6"
       - tokenCost: z.object({ input: z.number(), output: z.number() })

       **StageReportSchema** (wraps sections into a stage — this nests INSIDE the existing report model):
       - sections: z.array(ReportSectionSchema)
       - overallVerdict: z.enum(["PASS", "FAIL", "WATCHLIST"]).nullable()
       - generatedAt: z.string()
       - totalTokenCost: z.object({ input: z.number(), output: z.number() })
       - checkpoints: z.array(z.object({
           phase: z.number(),
           status: z.enum(["approved", "waiting", "rejected"]),
           userInput: z.record(z.unknown()).optional(),
           timestamp: z.string().optional(),
         })).optional().default([])

       Export all schemas AND a function `getReportSectionJSONSchema()` that returns `z.toJSONSchema(ReportSectionSchema)` — this is what gets passed to Claude's `output_config.format`.

    5. Create `src/schemas/dataPacket.js` with a DataPacketSchema:

       This is a LOOSE validation schema (not strict) because DataPacket fields vary by company data availability. Use z.object() with .passthrough() so extra fields don't cause validation failures.

       **DataPacketSchema fields:**
       - ticker: z.string()
       - companyInfo: z.record(z.unknown()).optional()
       - classification: z.record(z.unknown()).optional()
       - currentPrice: z.number().nullable().optional()
       - financials: z.record(z.unknown()).optional()
       - ttm: z.record(z.unknown()).optional()
       - growthRates: z.record(z.unknown()).optional()
       - returnMetrics: z.record(z.unknown()).optional()
       - debtMetrics: z.record(z.unknown()).optional()
       - fcf: z.record(z.unknown()).optional()
       - keyMetrics: z.record(z.unknown()).optional()
       - ruleOneScore: z.record(z.unknown()).optional()
       - gurus: z.record(z.unknown()).nullable().optional()
       - insiders: z.record(z.unknown()).nullable().optional()
       - compensation: z.record(z.unknown()).nullable().optional()
       - peers: z.record(z.unknown()).nullable().optional()
       - peerMetrics: z.record(z.unknown()).nullable().optional()
       - analystEstimates: z.record(z.unknown()).nullable().optional()
       - events: z.record(z.unknown()).nullable().optional()
       - prices: z.record(z.unknown()).nullable().optional()
       - transcriptAvailability: z.record(z.unknown()).nullable().optional()
       - caveats: z.array(z.string()).optional().default([])
       - assembledAt: z.string()

       Use `.passthrough()` on the root object to allow additional fields.

       Also export a `sliceDataPacket(fullPacket, agentConfig)` function that:
       - Takes the full DataPacket and an agent config object with `dataPacketSlice: string[]`
       - Returns a new object with ONLY the fields listed in dataPacketSlice, plus always-included fields: ticker, companyInfo, classification, caveats
       - This implements DATA-04 (DataPacket slicing per agent)

    6. Create `src/schemas/progress.js` with ProgressSchema:

       **ProgressSchema fields:**
       - ticker: z.string()
       - stage: z.enum(["onePager", "pitchDeck", "fullStory"])
       - state: z.enum(["IDLE", "DATA_ASSEMBLY", "PRIMARY_SOURCE_READING", "WAVE_1_RUNNING", "CHECKPOINT_1", "WAVE_2_RUNNING", "CHECKPOINT_2", "WAVE_3_RUNNING", "CHECKPOINT_3", "SYNTHESIS", "QUALITY_CHECK", "COMPLETE"])
       - startedAt: z.string()
       - lastUpdated: z.string()
       - sections: z.record(z.object({
           status: z.enum(["complete", "running", "pending", "failed"]),
           agentRole: z.string().optional(),
           tokenCost: z.object({ input: z.number(), output: z.number() }).optional(),
           error: z.string().optional(),
         }))
       - checkpoints: z.array(z.object({
           phase: z.number(),
           status: z.enum(["approved", "waiting", "rejected"]),
           userInput: z.record(z.unknown()).optional(),
           timestamp: z.string().optional(),
         }))
       - errors: z.array(z.string())
       - totalCost: z.object({ input: z.number(), output: z.number() })

       Export ProgressSchema and a `createInitialProgress(ticker, stage, sectionKeys)` helper function that returns a valid progress object with all sections set to "pending", state "IDLE", empty checkpoints, and zero costs.
  </action>
  <verify>
    <automated>cd /Users/kylehoff/Desktop/stock-analyzer && node -e "const { z } = require('zod'); console.log('zod installed:', typeof z.object === 'function'); console.log('toJSONSchema:', typeof z.toJSONSchema === 'function')" 2>/dev/null || node -e "import('zod/v4').then(m => { console.log('zod/v4 works:', typeof m.z.toJSONSchema === 'function') })"</automated>
  </verify>
  <acceptance_criteria>
    - package.json contains "zod", "linkedom", and "dotenv" in dependencies
    - src/schemas/reportSection.js exports ReportSectionSchema, CitationSchema, TableSchema, ChartSchema, StageReportSchema, getReportSectionJSONSchema
    - src/schemas/dataPacket.js exports DataPacketSchema and sliceDataPacket
    - src/schemas/progress.js exports ProgressSchema and createInitialProgress
    - ReportSectionSchema includes `redFlags: z.array(z.string()).min(1)` (enforcing KDD #12 — at least one red flag)
    - StageReportSchema includes `sections: z.array(ReportSectionSchema)` (nesting inside existing report model)
    - sliceDataPacket function always includes ticker, companyInfo, classification, caveats in output regardless of agentConfig.dataPacketSlice
    - getReportSectionJSONSchema() returns an object with `type: "object"` and `properties`
  </acceptance_criteria>
  <done>All three Zod schema files exist with correct exports, zod/linkedom/dotenv installed, and toJSONSchema() produces valid JSON Schema</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Schema validation tests (Wave 0)</name>
  <files>src/schemas/__tests__/reportSection.test.js, src/schemas/__tests__/progress.test.js</files>
  <read_first>
    - src/schemas/reportSection.js (the schema just created — see exact field names and types)
    - src/schemas/progress.js (the progress schema just created)
    - src/schemas/dataPacket.js (the DataPacket schema with sliceDataPacket)
    - src/engines/__tests__/edgarFinancials.test.js (existing test patterns — vitest describe/it/expect)
    - src/hooks/useResearch.js (lines 47-67 for existing report data model shape)
  </read_first>
  <behavior>
    - Test 1: ReportSectionSchema.safeParse() succeeds on a valid section with all required fields (key, title, sectionNumber, status, confidence, verdict, verdictRationale, summary, data, narrative, citations, redFlags, generatedAt, modelUsed, tokenCost)
    - Test 2: ReportSectionSchema.safeParse() fails when redFlags is empty array (min(1) constraint)
    - Test 3: ReportSectionSchema.safeParse() fails when citations is missing
    - Test 4: ReportSectionSchema.safeParse() fails when status is not one of ["pass", "fail", "review", "pending"]
    - Test 5: getReportSectionJSONSchema() returns an object with type "object" and properties key
    - Test 6: StageReportSchema wraps sections array — validates a stage report with 2 sections
    - Test 7: StageReportSchema is backward-compatible — the StageReport object can be assigned to `report.onePager` without breaking existing fields (id, ticker, companyName, currentStage, stageApprovals remain untouched)
    - Test 8: ProgressSchema.safeParse() succeeds on a valid progress object with all states in enum
    - Test 9: ProgressSchema.safeParse() fails on invalid state value (e.g., "INVALID_STATE")
    - Test 10: createInitialProgress("COST", "pitchDeck", ["radar", "simple_predictable", "market_position"]) returns object with all sections "pending", state "IDLE"
    - Test 11: DataPacketSchema.safeParse() succeeds on a minimal packet with just ticker and assembledAt
    - Test 12: sliceDataPacket returns only requested fields plus ticker/companyInfo/classification/caveats
    - Test 13: sliceDataPacket excludes fields not in dataPacketSlice (e.g., gurus excluded when not requested)
  </behavior>
  <action>
    Create `src/schemas/__tests__/reportSection.test.js` with vitest tests covering Tests 1-7, 11-13 above.
    Create `src/schemas/__tests__/progress.test.js` with vitest tests covering Tests 8-10 above.

    Use this valid section fixture for tests:
    ```javascript
    const validSection = {
      key: "fcf",
      title: "Free Cash Flow",
      sectionNumber: 5,
      status: "pass",
      confidence: "HIGH",
      verdict: "PASS",
      verdictRationale: "FCF margins expanding with controlled capex",
      summary: "COST generates $6.2B FCF with stable margins",
      data: { fcfYearly: [5.1, 5.5, 5.8, 6.2], capexRatio: 0.30 },
      narrative: "Costco's free cash flow profile demonstrates...",
      citations: [
        { id: 1, ref: "DataPacket.fcf.yearly[2024]", text: "FCF of $6.2B", source: "DataPacket" }
      ],
      redFlags: ["FCF growth decelerating from 18% to 12% CAGR"],
      generatedAt: "2026-03-24T10:00:00Z",
      modelUsed: "claude-sonnet-4-6",
      tokenCost: { input: 28000, output: 4200 },
    };
    ```

    For backward compatibility test (Test 7), create a mock existing report object matching useResearch.js shape (id, ticker, companyName, createdAt, updatedAt, currentStage, stageApprovals, onePager: {}, pitchDeck: null, fullStory: null, notes, watchlist, competitors) and verify that assigning `report.onePager = stageReportData` produces an object where existing fields are preserved.

    For DataPacket slicing tests, create a mock full DataPacket with ticker, companyInfo, classification, caveats, financials, gurus, insiders fields, then verify sliceDataPacket with config `{ dataPacketSlice: ["financials"] }` returns financials + ticker + companyInfo + classification + caveats, but NOT gurus or insiders.
  </action>
  <verify>
    <automated>cd /Users/kylehoff/Desktop/stock-analyzer && npx vitest run src/schemas/__tests__/ --reporter=verbose</automated>
  </verify>
  <acceptance_criteria>
    - src/schemas/__tests__/reportSection.test.js exists and contains at least 7 test cases
    - src/schemas/__tests__/progress.test.js exists and contains at least 3 test cases
    - `npx vitest run src/schemas/__tests__/ --reporter=verbose` exits with code 0 (all tests pass)
    - Test output includes "ReportSectionSchema" and "ProgressSchema" test suite names
    - Backward compatibility test verifies `typeof stageReport.sections === 'object'` and `Array.isArray(stageReport.sections)` both true
    - sliceDataPacket test verifies output does NOT contain "gurus" key when not in dataPacketSlice
  </acceptance_criteria>
  <done>All schema tests pass, confirming validation logic, JSON Schema generation, backward compatibility, and DataPacket slicing work correctly</done>
</task>

</tasks>

<verification>
1. `npm test -- --run` passes (existing 630+ tests unbroken)
2. `npx vitest run src/schemas/__tests__/ --reporter=verbose` passes (all new schema tests green)
3. `node -e "const s = require('./src/schemas/reportSection.js'); console.log(JSON.stringify(s.getReportSectionJSONSchema(), null, 2))"` outputs valid JSON Schema
</verification>

<success_criteria>
- zod, linkedom, and dotenv installed in package.json dependencies
- Three schema files in src/schemas/ with correct Zod definitions and exports
- All schema tests pass with 0 failures
- toJSONSchema() produces valid JSON Schema suitable for Claude API output_config.format
- Existing 630+ vitest tests still pass (no regressions)
</success_criteria>

<output>
After completion, create `.planning/phases/05A-agent-definitions-foundation/05A-01-SUMMARY.md`
</output>
