---
phase: 05D-quality-system
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/engines/critic.js
  - src/engines/__tests__/critic.test.js
  - src/engines/__tests__/fixtures/cost-section-company-info.json
  - src/engines/__tests__/fixtures/cost-data-packet-slice.json
autonomous: true
requirements: [QUAL-01, QUAL-02, QUAL-03, QUAL-04, QUAL-05, QUAL-06]

must_haves:
  truths:
    - "validateSection() returns a QualityReport with score, issues, completeness, and passed fields for any section JSON"
    - "DataPacket citations with dot-paths are validated for path existence AND value match (per D-01)"
    - "SEC filing citations are validated for format (filing type + year) without network calls (per D-02)"
    - "Web URL citations are validated for URL format without fetching (per D-03)"
    - "Untraceable citations are flagged as low severity but do not block (per D-04)"
    - "Completeness scoring distinguishes required vs optional ReportSectionSchema fields"
    - "HIGH confidence with only 1 citation source type produces a medium-severity issue"
    - "Red flags with fewer than 1 item produce a high-severity issue"
  artifacts:
    - path: "src/engines/critic.js"
      provides: "Pure validation engine: validateSection, classifyCitation, scoreCompleteness, resolveDataPath"
      exports: ["validateSection", "validateStage"]
    - path: "src/engines/__tests__/critic.test.js"
      provides: "Unit tests against real COST fixture data"
      min_lines: 100
    - path: "src/engines/__tests__/fixtures/cost-section-company-info.json"
      provides: "Real COST company_info section for test fixtures"
    - path: "src/engines/__tests__/fixtures/cost-data-packet-slice.json"
      provides: "Minimal DataPacket slice for path resolution tests"
  key_links:
    - from: "src/engines/critic.js"
      to: "src/schemas/reportSection.js"
      via: "ReportSectionSchema field list for completeness scoring"
      pattern: "REQUIRED_FIELDS"
    - from: "src/engines/__tests__/critic.test.js"
      to: "src/engines/__tests__/fixtures/cost-section-company-info.json"
      via: "import fixture data"
      pattern: "cost-section-company-info"
---

<objective>
Build critic.js — the pure validation engine that checks every generated report section for citation accuracy, completeness, confidence justification, multi-source verification, red flag quality, and data gap detection. Uses the real COST one-pager as the test fixture.

Purpose: This is the quality assurance layer for AI-generated reports. It produces per-section QualityReport objects that flag issues without blocking report generation (per D-04).
Output: `src/engines/critic.js` with full test suite, COST fixtures.
</objective>

<execution_context>
@/Users/kylehoff/.claude/get-shit-done/workflows/execute-plan.md
@/Users/kylehoff/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/05D-quality-system/05D-CONTEXT.md
@.planning/phases/05D-quality-system/05D-RESEARCH.md

@src/schemas/reportSection.js
@src/engines/progressState.js

<interfaces>
<!-- Key types and contracts the executor needs. -->

From src/schemas/reportSection.js:
```javascript
export const CitationSchema = z.object({
  id: z.number(),
  ref: z.string(),      // DataPacket field path or document reference
  text: z.string(),      // The quoted text or value
  source: z.string(),    // "DataPacket", "10-K FY2024 p.34", URL, etc.
});

export const ReportSectionSchema = z.object({
  key: z.string(),
  title: z.string(),
  sectionNumber: z.number(),
  status: z.enum(['pass', 'fail', 'review', 'pending']),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  verdict: z.enum(['PASS', 'FAIL', 'WATCHLIST']).nullable(),
  verdictRationale: z.string(),
  summary: z.string(),
  data: z.looseObject({}),
  narrative: z.string(),
  citations: z.array(CitationSchema),
  tables: z.array(TableSchema).optional().default([]),
  charts: z.array(ChartSchema).optional().default([]),
  redFlags: z.array(z.string()).min(1),
  primarySourceInsights: z.array(z.string()).optional().default([]),
  crossCuttingFindings: z.array(...).optional().default([]),
  generatedAt: z.string(),
  modelUsed: z.string(),
  tokenCost: z.object({ input: z.number(), output: z.number() }),
});
```

COST one-pager citation format reality (62 citations total):
- Canonical format `{id, ref, text, source}`: 15 citations (24%)
- Non-canonical format `{id, source, url, note}`: 47 citations (76%)
- Both must be handled. Non-canonical flagged as low severity.

DataPacket top-level keys: ticker, companyInfo, classification, currentPrice, financials, ttm, growthRates, returnMetrics, debtMetrics, fcf, keyMetrics, ruleOneScore, gurus, insiders, compensation, peers, peerMetrics, analystEstimates, events, prices, transcriptAvailability, caveats, errors, assembledAt

Sample DataPacket values for path resolution:
- growthRates.earnings.10yr = 0.1304210126364862
- growthRates.revenue.10yr = 0.0900593060353001
- ruleOneScore.moat = 88
- ruleOneScore.management = 93
- companyInfo.name = "COSTCO WHOLESALE CORP /NEW"

All 6 COST sections have tokenCost: {input: 0, output: 0} — zeros because CC skill doesn't capture subagent token usage.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create test fixtures from real COST data + critic.js test scaffold</name>
  <files>src/engines/__tests__/fixtures/cost-section-company-info.json, src/engines/__tests__/fixtures/cost-data-packet-slice.json, src/engines/__tests__/critic.test.js</files>
  <read_first>
    - .thes1s/reports/COST/one-pager.json (real generated output — extract company_info section as fixture)
    - .thes1s/reports/COST/data-packet.json (real DataPacket — extract minimal slice with companyInfo, growthRates, returnMetrics, ruleOneScore, currentPrice)
    - src/schemas/reportSection.js (the schema critic.js validates against)
    - src/engines/__tests__/progressState.test.js (test pattern: import style, describe/it structure, afterAll cleanup)
  </read_first>
  <action>
    1. Create `src/engines/__tests__/fixtures/cost-section-company-info.json`:
       - Extract the full `company_info` section object from `.thes1s/reports/COST/one-pager.json` sections[0]
       - This has 10 citations (all non-canonical format: `{id, source, url, note}`), 4 red flags, HIGH confidence, PASS verdict
       - Verify the fixture is valid JSON matching the section structure

    2. Create `src/engines/__tests__/fixtures/cost-data-packet-slice.json`:
       - Extract from `.thes1s/reports/COST/data-packet.json`: ticker, companyInfo, currentPrice, growthRates (just earnings and revenue objects), returnMetrics (just the `yearly` array first 2 entries for size), ruleOneScore, caveats
       - Include enough structure for path resolution testing: `growthRates.earnings.10yr` should be `0.1304210126364862`, `ruleOneScore.moat` should be `88`
       - Keep the file under 5KB — this is a test fixture, not a full DataPacket

    3. Create `src/engines/__tests__/critic.test.js` with test scaffold:
       - Import fixtures with `import companyInfoSection from './fixtures/cost-section-company-info.json' with { type: 'json' };`
       - Import dataPacketSlice with `import dataPacketSlice from './fixtures/cost-data-packet-slice.json' with { type: 'json' };`
       - Tests for QUAL-01 (citation validation):
         - "should classify DataPacket citations correctly" — test classifyCitation with source="DataPacket" and source="Rule One Toolbox"
         - "should classify SEC filing citations correctly" — test with source="SEC EDGAR 10-K FY2025"
         - "should classify web URL citations correctly" — test with url="https://example.com"
         - "should classify untraceable citations correctly" — test with source="Costco corporate history"
         - "should validate DataPacket path exists" — test resolveDataPath with "growthRates.earnings.10yr" against fixture
         - "should detect missing DataPacket path" — test with "growthRates.nonexistent.field"
         - "should match numeric values with tolerance" — test 13.0% matching 0.1304 (percentage to decimal)
         - "should flag non-canonical citation format as low severity" — test that {id, source, url, note} produces a low-severity issue
       - Tests for QUAL-02 (completeness):
         - "should score a complete section above 80" — test with full company_info fixture
         - "should penalize missing narrative" — test with narrative set to ""
         - "should penalize missing citations" — test with citations set to []
       - Tests for QUAL-03 (confidence):
         - "should flag HIGH confidence with only 1 citation source type" — test section with all citations from same source
         - "should accept HIGH confidence with multiple source types" — test with SEC + DataPacket sources
       - Tests for QUAL-04 (multi-source):
         - "should flag financial claims with only one source type" — test section with all DataPacket citations
       - Tests for QUAL-05 (red flags):
         - "should pass sections with specific red flags" — test company_info fixture (4 flags)
         - "should flag generic red flags" — test with redFlags: ["Possible risk"]
       - Tests for QUAL-06 (data gaps):
         - "should detect narrative claims about null DataPacket fields" — test section claiming "current price is $X" when DataPacket.currentPrice is null
       - Tests for validateSection:
         - "should produce a valid QualityReport for COST company_info" — full integration test with fixture
         - "should set passed=true when no high-severity issues exist" — test with clean section
       - Tests for validateStage:
         - "should aggregate section quality reports into stage report" — test with array of sections
  </action>
  <verify>
    <automated>cd /Users/kylehoff/Desktop/stock-analyzer && npx vitest run src/engines/__tests__/critic.test.js 2>&1 | tail -5</automated>
  </verify>
  <acceptance_criteria>
    - `src/engines/__tests__/fixtures/cost-section-company-info.json` exists and contains key "company_info" with 10 citations
    - `src/engines/__tests__/fixtures/cost-data-packet-slice.json` exists and contains growthRates.earnings.10yr = 0.1304210126364862
    - `src/engines/__tests__/critic.test.js` exists with at least 15 test cases
    - All tests initially fail (RED phase — critic.js not written yet) or test file validates import structure
  </acceptance_criteria>
  <done>Test fixtures extracted from real COST data. Test scaffold covers all 6 QUAL requirements with specific test cases. Tests reference real data values, not fabricated examples.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Implement critic.js — pure validation engine</name>
  <files>src/engines/critic.js</files>
  <read_first>
    - src/engines/__tests__/critic.test.js (the tests to pass — written in Task 1)
    - src/engines/__tests__/fixtures/cost-section-company-info.json (real section data)
    - src/engines/__tests__/fixtures/cost-data-packet-slice.json (DataPacket for path resolution)
    - src/schemas/reportSection.js (CitationSchema, ReportSectionSchema — the contract)
    - src/engines/validation.js (existing validation engine — match the pattern: named exports, pure functions, null returns on failure)
    - .planning/phases/05D-quality-system/05D-RESEARCH.md (implementation patterns, code examples, pitfalls)
  </read_first>
  <behavior>
    - classifyCitation({source, ref, url}) returns 'datapacket' | 'sec_filing' | 'web_url' | 'untraceable'
    - resolveDataPath(dataPacket, "growthRates.earnings.10yr") returns {found: true, value: 0.1304...}
    - resolveDataPath(dataPacket, "nonexistent.path") returns {found: false, value: undefined}
    - matchNumericValue("13.0%", 0.1304) returns true (percentage-to-decimal tolerance)
    - matchNumericValue("$432B", 432040000000) returns true (abbreviated dollar match)
    - validateCitations([...], dataPacket) returns issues array per D-01/D-02/D-03/D-04
    - scoreCompleteness(section) returns {requiredFieldsPresent, requiredFieldsTotal: 15, narrativeLength, dataFieldsPopulated, score: 0-100}
    - validateConfidence(section, dataPacket) returns issues when HIGH confidence unjustified
    - checkMultiSource(citations) returns issues when financial claims lack source diversity
    - validateRedFlags(redFlags) returns issues for empty or generic flags
    - detectDataGaps(section, dataPacket) returns issues when narrative claims values from null DataPacket fields
    - validateSection(section, dataPacket) returns full QualityReport: {sectionKey, score, completeness, issues, passed, checkedAt}
    - validateStage(sections, dataPacket) returns aggregate: {sections: [...reports], overallScore, overallPassed, checkedAt}
  </behavior>
  <action>
    Implement `src/engines/critic.js` as a pure validation engine with ZERO side effects, ZERO network calls, ZERO file I/O.

    **Exports (all named exports, matching project convention):**

    1. `classifyCitation(citation)` — classify into 4 types per D-01/D-02/D-03/D-04:
       - 'datapacket': source contains "DataPacket", "Computed", "Rule One Toolbox", or ref contains "dataPacket"
       - 'sec_filing': source contains "SEC", "EDGAR", "10-K", "10-Q", "8-K", "13F"
       - 'web_url': citation.url exists and matches /^https?:\/\//
       - 'untraceable': everything else

    2. `resolveDataPath(dataPacket, dotPath)` — navigate dot-separated path string, return `{found: boolean, value: any}`. Handle null/undefined at each level gracefully.

    3. `matchNumericValue(citationText, dataPacketValue)` — fuzzy numeric matching:
       - Extract numbers from citation text (strip $, %, B, M, K suffixes)
       - Convert percentages to decimals for comparison (13.0% -> 0.13)
       - Convert abbreviations ($432B -> 432000000000)
       - Compare within 5% tolerance (absolute relative error)
       - Return true if any extracted number matches dataPacketValue within tolerance

    4. `validateCitations(citations, dataPacket)` — per-citation validation:
       - Handle BOTH citation formats: canonical `{id, ref, text, source}` AND non-canonical `{id, source, url, note}`
       - Non-canonical format: flag as severity 'low' (format issue) but still validate the citation content
       - DataPacket citations (per D-01): check path existence AND value match. If ref is human-readable label (not a dot-path), flag as severity 'low' format issue.
       - SEC citations (per D-02): check filing type regex + year regex. No network calls.
       - Web URL citations (per D-03): `new URL(citation.url)` in try/catch. No fetching.
       - Untraceable citations (per D-04): flag as severity 'low', never block.

    5. `scoreCompleteness(section)` — weighted scoring per QUAL-02:
       - REQUIRED_FIELDS: key, title, sectionNumber, status, confidence, verdict, verdictRationale, summary, data, narrative, citations, redFlags, generatedAt, modelUsed, tokenCost (15 fields)
       - Weights: requiredFields 40%, narrativeDepth 25%, citationDensity 20%, dataPopulation 15%
       - Returns `{requiredFieldsPresent, requiredFieldsTotal: 15, narrativeLength, dataFieldsPopulated, score}`

    6. `validateConfidence(section, dataPacket)` — per QUAL-03:
       - HIGH confidence requires 2+ citation source types AND key DataPacket fields non-null for section
       - MEDIUM confidence: no additional checks
       - LOW confidence: no additional checks

    7. `checkMultiSource(citations)` — per QUAL-04:
       - Financial metrics claims (source = DataPacket/Computed) should also have corroborating SEC source
       - Flag medium severity if all citations are from single source category

    8. `validateRedFlags(redFlags)` — per QUAL-05:
       - Fewer than 1 flag: high severity (schema should catch this, but validate anyway)
       - Generic flags (under 20 chars or just "Possible risk"): medium severity

    9. `detectDataGaps(section, dataPacket)` — per QUAL-06:
       - Scan narrative for dollar amounts, percentages, and specific metric mentions
       - Cross-reference against DataPacket null fields for the section's domain
       - Flag medium severity if narrative cites a value but corresponding DataPacket field is null

    10. `validateSection(section, dataPacket, options = {})` — main entry point:
        - Runs all 6 checks above, collects issues
        - Computes overall score: `completeness.score - (highIssues * 10) - (mediumIssues * 3) - (lowIssues * 1)`, clamped to 0-100
        - Returns QualityReport: `{sectionKey, score, completeness, issues, passed: (no HIGH severity issues), checkedAt}`

    11. `validateStage(sections, dataPacket)` — aggregate:
        - Run validateSection for each section
        - Overall score = average of section scores
        - Overall passed = all sections passed
        - Returns `{sections: [...reports], overallScore, overallPassed, checkedAt}`

    **Module-level constants:** REQUIRED_FIELDS, QUALITY_WEIGHTS, use UPPER_SNAKE_CASE per project convention.
    **Test-only exports:** `export const _testExports = { classifyCitation, resolveDataPath, matchNumericValue, validateCitations, scoreCompleteness, validateConfidence, checkMultiSource, validateRedFlags, detectDataGaps };`

    Run tests after implementation: `npx vitest run src/engines/__tests__/critic.test.js`
    Fix any failures until all tests pass (GREEN phase).
  </action>
  <verify>
    <automated>cd /Users/kylehoff/Desktop/stock-analyzer && npx vitest run src/engines/__tests__/critic.test.js --reporter=verbose 2>&1 | tail -30</automated>
  </verify>
  <acceptance_criteria>
    - `src/engines/critic.js` exports `validateSection` and `validateStage`
    - `src/engines/critic.js` exports `_testExports` with classifyCitation, resolveDataPath, matchNumericValue
    - REQUIRED_FIELDS array has exactly 15 entries
    - QUALITY_WEIGHTS object has keys requiredFields, narrativeDepth, citationDensity, dataPopulation
    - All critic.test.js tests pass
    - No imports of 'fs', 'path', or 'node:' modules (pure engine, no I/O)
    - No fetch(), XMLHttpRequest, or network calls
  </acceptance_criteria>
  <done>critic.js validates all 6 quality dimensions (QUAL-01 through QUAL-06) against real COST data. All tests pass. Engine is pure — no side effects, no network, no I/O.</done>
</task>

</tasks>

<verification>
Run full critic.js test suite:
```bash
npx vitest run src/engines/__tests__/critic.test.js --reporter=verbose
```

Verify no new dependencies added:
```bash
git diff package.json
```

Verify critic.js is a pure engine (no fs/path/fetch imports):
```bash
grep -E "import.*from.*'(fs|path|node:)" src/engines/critic.js
```
Should return nothing.
</verification>

<success_criteria>
- critic.js exports validateSection() and validateStage() as named exports
- All test cases pass against COST fixture data
- Citation validation handles both canonical and non-canonical formats
- DataPacket path resolution works with dot-path notation
- Numeric value matching handles percentages, dollar abbreviations, and tolerance
- Completeness scoring uses weighted formula with 15 required fields
- No network calls, no file I/O, no new dependencies
</success_criteria>

<output>
After completion, create `.planning/phases/05D-quality-system/05D-01-SUMMARY.md`
</output>
