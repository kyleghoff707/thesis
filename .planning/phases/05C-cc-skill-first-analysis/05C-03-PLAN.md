---
phase: 05C-cc-skill-first-analysis
plan: 03
type: execute
wave: 2
depends_on: [05C-01, 05C-02]
files_modified:
  - scripts/assemble-data.js
  - .claude/skills/generate-one-pager/SKILL.md
autonomous: true
requirements: [ONEP-01]
must_haves:
  truths:
    - "Running 'node scripts/assemble-data.js AAPL' produces a valid DataPacket JSON file at .thes1s/reports/AAPL/data-packet.json"
    - "The CC skill at .claude/skills/generate-one-pager/SKILL.md orchestrates the full One Pager pipeline: data assembly, parallel analyst dispatch, synthesis, report output"
    - "The CC skill reads dispatch-table.json and agent config.json files at runtime (DRY, not hardcoded)"
    - "The CC skill dispatches 3 analysts in parallel (business-analyst, financial-analyst, valuation-specialist) then synthesis-writer sequentially"
  artifacts:
    - path: "scripts/assemble-data.js"
      provides: "CLI wrapper for assembleDataPacket()"
      min_lines: 15
    - path: ".claude/skills/generate-one-pager/SKILL.md"
      provides: "CC skill orchestrator for One Pager pipeline"
      min_lines: 80
  key_links:
    - from: ".claude/skills/generate-one-pager/SKILL.md"
      to: "agents/orchestrator/dispatch-table.json"
      via: "Reads dispatch table at runtime for section-to-agent mapping"
      pattern: "dispatch-table"
    - from: ".claude/skills/generate-one-pager/SKILL.md"
      to: "agents/*/prompt.md"
      via: "Reads agent prompts at runtime for subagent system context"
      pattern: "prompt.md"
    - from: "scripts/assemble-data.js"
      to: "src/engines/dataExport.js"
      via: "Imports assembleDataPacket()"
      pattern: "assembleDataPacket"
---

<objective>
Create the CLI DataPacket assembly script and the CC skill that orchestrates the full One Pager generation pipeline. The CC skill is the `/generate:one-pager {TICKER}` entry point that assembles data, dispatches 4 agents as subagents, validates outputs against ReportSectionSchema, and produces the final report.

Purpose: This is the runtime infrastructure that turns the 4 agent prompts (from Plans 01-02) into a working pipeline. Without this, the prompts exist but cannot be executed.

Output: A working CLI script and a CC skill ready for first generation run.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/05C-cc-skill-first-analysis/05C-CONTEXT.md
@.planning/phases/05C-cc-skill-first-analysis/05C-RESEARCH.md
@.planning/phases/05A-agent-definitions-foundation/05A-03-SUMMARY.md
@.planning/phases/05A-agent-definitions-foundation/05A-05-SUMMARY.md
@.planning/phases/05C-cc-skill-first-analysis/05C-01-SUMMARY.md
@.planning/phases/05C-cc-skill-first-analysis/05C-02-SUMMARY.md

<interfaces>
<!-- Key functions and schemas the executor needs -->

From src/engines/dataExport.js:
```javascript
export async function assembleDataPacket(ticker)
// Returns: { ticker, companyInfo, classification, financials, ttm, growthRates,
//            returnMetrics, debtMetrics, fcf, keyMetrics, currentPrice, prices,
//            edgarStatements, ruleOneScore, peers, gurus, insiders, compensation,
//            analystEstimates, companyEvents, caveats, errors }
```

From src/schemas/dataPacket.js:
```javascript
export function sliceDataPacket(fullPacket, agentConfig)
// Returns subset of fullPacket based on agentConfig.dataPacketSlice
// Always includes: ticker, companyInfo, classification, caveats
```

From src/schemas/reportSection.js:
```javascript
export const ReportSectionSchema  // Zod schema for section validation
export function getReportSectionJSONSchema()  // Returns JSON Schema object
```

From src/engines/progressState.js:
```javascript
export function createProgress(ticker, stage)
export function readProgress(ticker)
export function advanceState(ticker, newState)
export function updateSectionStatus(ticker, sectionKey, status)
export function saveSectionOutput(ticker, sectionKey, output)
```

From agents/orchestrator/dispatch-table.json:
```json
{
  "onePager": {
    "preProcessing": [{ "step": "data-assembly", "agent": "data-assembler" }],
    "phases": [{ "phase": 1, "agents": [
      { "agent": "financial-analyst", "sections": [3, 4], "parallel": true },
      { "agent": "business-analyst", "sections": [1, 2], "parallel": true },
      { "agent": "valuation-specialist", "sections": [5], "parallel": true }
    ]}],
    "postProcessing": [{ "step": "synthesis", "agent": "synthesis-writer", "sections": [6] }],
    "sectionKeys": ["company_info", "minimum_standards", "meaning", "growth_metrics", "valuation_summary", "overall_verdict"]
  }
}
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create CLI DataPacket assembly script + CC skill orchestrator</name>
  <files>scripts/assemble-data.js, .claude/skills/generate-one-pager/SKILL.md</files>
  <read_first>
    src/engines/dataExport.js
    src/engines/nodeAdapter.js
    src/schemas/dataPacket.js
    src/schemas/reportSection.js
    src/engines/progressState.js
    agents/orchestrator/dispatch-table.json
    agents/orchestrator/config.json
    agents/business-analyst/config.json
    agents/financial-analyst/config.json
    agents/valuation-specialist/config.json
    agents/synthesis-writer/config.json
    .planning/phases/05C-cc-skill-first-analysis/05C-RESEARCH.md
  </read_first>
  <action>
    Create two files:

    **1. scripts/assemble-data.js** — CLI wrapper for assembleDataPacket():

    ```javascript
    // CLI wrapper: node scripts/assemble-data.js TICKER
    // Assembles a full DataPacket and writes to .thes1s/reports/{TICKER}/data-packet.json
    ```

    Requirements:
    - Import nodeAdapter.js first (side-effect: loads .env.local, patches globals)
    - Import assembleDataPacket from src/engines/dataExport.js
    - Accept TICKER as process.argv[2], uppercase it
    - Call assembleDataPacket(ticker)
    - Create .thes1s/reports/{TICKER}/ directory (recursive)
    - Write data-packet.json with JSON.stringify(packet, null, 2)
    - Log success message with file path and DataPacket field count
    - Log any errors from packet.errors array
    - Exit with code 0 on success, 1 on failure
    - Handle import/execution errors with try/catch

    **2. .claude/skills/generate-one-pager/SKILL.md** — CC skill orchestrator:

    YAML frontmatter (per D-06, research architecture):
    ```yaml
    ---
    name: generate-one-pager
    description: Generate a complete Rule One One Pager investment analysis for a given stock ticker
    argument-hint: TICKER
    disable-model-invocation: true
    context: fork
    model: opus
    allowed-tools: Agent, Bash, Read, Write, Glob, Grep
    ---
    ```

    Skill body — markdown instructions for the orchestrator. The CC skill does this:

    **Step 1: Validate input and set up**
    - $0 is the ticker symbol. Uppercase it.
    - Create output directory: .thes1s/reports/{TICKER}/

    **Step 2: Assemble DataPacket**
    - Run: `node scripts/assemble-data.js {TICKER}`
    - Read the output: .thes1s/reports/{TICKER}/data-packet.json
    - If DataPacket has errors, log them but continue (error-resilient design)

    **Step 3: Read agent configurations**
    - Read agents/orchestrator/dispatch-table.json for onePager phase structure
    - Read config.json for each agent in the dispatch table: business-analyst, financial-analyst, valuation-specialist, synthesis-writer
    - Read each agent's prompt.md file
    - Read each agent's curriculum files (listed in config.json curriculum array)
    - Read each agent's universal context files (rule-one-fundamentals.md, tools-for-analysis.md)

    **Step 4: Prepare DataPacket slices**
    - For each analyst agent, extract only the fields listed in config.json dataPacketSlice
    - Always include: ticker, companyInfo, classification, caveats
    - The synthesis-writer gets NO DataPacket — it receives section outputs instead

    **Step 5: Dispatch 3 parallel analyst agents** (per D-09)
    - Dispatch ALL THREE in a single message using the Agent tool:
      * **financial-analyst** (Sonnet per D-10): prompt.md content + sliced DataPacket + curriculum content + ReportSectionSchema JSON + universal context. Task: "Analyze {TICKER} and produce sections 3 (meaning) and 4 (growth_metrics) as JSON objects conforming to ReportSectionSchema."
      * **business-analyst** (Sonnet per D-10): prompt.md content + sliced DataPacket + curriculum content + ReportSectionSchema JSON + universal context. Task: "Analyze {TICKER} and produce sections 1 (company_info) and 2 (minimum_standards) as JSON objects conforming to ReportSectionSchema."
      * **valuation-specialist** (Sonnet per D-10, overriding config.json "opus"): prompt.md content + sliced DataPacket + curriculum content + ReportSectionSchema JSON + universal context. Task: "Analyze {TICKER} and produce section 5 (valuation_summary) as a JSON object conforming to ReportSectionSchema."

    - Each subagent receives its prompt.md as the primary instruction context, the sliced DataPacket as structured data input, and is instructed to output valid JSON conforming to ReportSectionSchema.

    **Step 6: Collect and validate analyst outputs**
    - Parse each analyst's output to extract ReportSectionSchema-conformant JSON
    - Save each section to .thes1s/reports/{TICKER}/sections/{section_key}.json
    - Log which sections completed successfully and their verdicts

    **Step 7: Dispatch synthesis-writer** (per D-09, sequential after analysts)
    - Dispatch ONE Agent call:
      * **synthesis-writer** (Opus per D-10): prompt.md content + all 5 section summaries + all 5 section verdicts + all 5 confidence scores + all red flags + all citations + universal context + ReportSectionSchema JSON.
      * Task: "Synthesize the analyst findings for {TICKER} and produce section 6 (overall_verdict) as a JSON object conforming to ReportSectionSchema. Here are the analyst outputs: [section summaries, verdicts, confidence, red flags]"

    **Step 8: Assemble final report**
    - Collect all 6 sections into a single JSON report
    - Write to .thes1s/reports/{TICKER}/one-pager.json
    - Generate a human-readable markdown version at .thes1s/reports/{TICKER}/one-pager.md with:
      * Title: "{Company Name} ({TICKER}) — One Pager"
      * Each section as a markdown heading with narrative, tables, red flags, verdict badges
      * Citations as numbered footnotes
    - Print summary: sections completed, overall verdict, file paths

    **CRITICAL constraints in the skill:**
    - Contamination boundary: NEVER read from knowledge/stage-*/examples/ or knowledge/pre-course-examples/ during generation (per AGNT-04, D-13)
    - Schema enforcement: validate every section output against ReportSectionSchema before saving (per D-12)
    - Error handling: if a subagent fails, log the error, save what succeeded, and continue (per DataPacket's error-resilient design pattern)
    - Progress display: log which agent is running, when each completes, section verdicts, and estimated time remaining
  </action>
  <verify>
    <automated>test -f scripts/assemble-data.js && test -f .claude/skills/generate-one-pager/SKILL.md && echo "PASS: both files exist" || echo "FAIL: missing files"</automated>
  </verify>
  <acceptance_criteria>
    - scripts/assemble-data.js exists and is >= 15 lines
    - scripts/assemble-data.js imports nodeAdapter.js and assembleDataPacket
    - scripts/assemble-data.js reads TICKER from process.argv[2]
    - scripts/assemble-data.js writes to .thes1s/reports/{TICKER}/data-packet.json
    - .claude/skills/generate-one-pager/SKILL.md exists and is >= 80 lines
    - SKILL.md frontmatter contains: name: generate-one-pager, disable-model-invocation: true, context: fork, model: opus
    - SKILL.md contains "Agent" (subagent dispatch)
    - SKILL.md contains "dispatch-table" (reads config at runtime, not hardcoded)
    - SKILL.md contains "parallel" (parallel analyst dispatch documented)
    - SKILL.md contains "synthesis-writer" (sequential synthesis step)
    - SKILL.md contains "ReportSectionSchema" (output validation)
    - SKILL.md contains "contamination" or "NEVER read" (contamination boundary)
    - SKILL.md contains "one-pager.json" and "one-pager.md" (both output formats)
    - SKILL.md contains "$0" or "$ARGUMENTS" (ticker argument handling)
    - SKILL.md does NOT contain "LULU" or "lululemon"
  </acceptance_criteria>
  <done>
    CLI DataPacket assembly script exists and imports the correct modules. CC skill SKILL.md defines the complete One Pager orchestration pipeline with parallel analyst dispatch, sequential synthesis, schema validation, contamination boundary, and both JSON and markdown output formats.
  </done>
</task>

<task type="auto">
  <name>Task 2: Smoke test DataPacket CLI assembly</name>
  <files>scripts/assemble-data.js</files>
  <read_first>
    scripts/assemble-data.js
    src/engines/nodeAdapter.js
  </read_first>
  <action>
    Run a smoke test to verify the CLI DataPacket assembly script works end-to-end:

    1. Execute: `node scripts/assemble-data.js AAPL`
       - This should load nodeAdapter.js (patches globals for Node.js), call assembleDataPacket('AAPL'), and write to .thes1s/reports/AAPL/data-packet.json

    2. Verify the output file exists and is valid JSON:
       - `cat .thes1s/reports/AAPL/data-packet.json | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log('Fields:', Object.keys(d).length); console.log('Ticker:', d.ticker); console.log('Errors:', d.errors?.length || 0)"`

    3. Check key DataPacket fields are populated (not null):
       - ticker, companyInfo, financials (or edgarStatements), growthRates, returnMetrics

    4. If there are errors in the errors array, log them for awareness but do NOT fail the smoke test — the error-resilient design means partial data is expected.

    5. If the script fails to run (import errors, nodeAdapter issues), diagnose and fix:
       - Most likely issues: import.meta.env not patched, missing module, CORS proxy route needed
       - Fix the assemble-data.js script to handle the specific failure
       - Re-run until it produces a valid DataPacket

    6. Clean up the test output: delete .thes1s/reports/AAPL/ after validation (this was just a smoke test, not a real generation run).
  </action>
  <verify>
    <automated>node scripts/assemble-data.js AAPL 2>&1 | tail -1</automated>
  </verify>
  <acceptance_criteria>
    - `node scripts/assemble-data.js AAPL` exits with code 0
    - .thes1s/reports/AAPL/data-packet.json is created and is valid JSON
    - DataPacket JSON contains "ticker" field with value "AAPL"
    - DataPacket JSON has >= 10 top-level fields populated
    - No import errors or uncaught exceptions during execution
  </acceptance_criteria>
  <done>CLI DataPacket assembly script runs successfully for AAPL, producing a valid DataPacket JSON with populated fields. The CC skill can rely on this script for Step 2 of the pipeline.</done>
</task>

</tasks>

<verification>
- scripts/assemble-data.js exists and runs successfully: `node scripts/assemble-data.js AAPL` exits 0
- .claude/skills/generate-one-pager/SKILL.md exists with correct frontmatter
- CC skill references dispatch-table.json (not hardcoded agent assignments)
- CC skill dispatches 3 parallel analysts + 1 sequential synthesis-writer
- CC skill includes contamination boundary
- CC skill produces both JSON and markdown output
- Existing tests still pass: npm test -- --run
</verification>

<success_criteria>
1. `node scripts/assemble-data.js AAPL` produces a valid DataPacket JSON at .thes1s/reports/AAPL/data-packet.json
2. CC skill SKILL.md defines the complete One Pager pipeline with correct frontmatter (context: fork, disable-model-invocation: true, model: opus)
3. CC skill reads dispatch-table.json and agent configs at runtime (DRY)
4. CC skill dispatches analysts in parallel, synthesis-writer after all analysts complete
5. CC skill validates outputs against ReportSectionSchema
6. CC skill writes both one-pager.json and one-pager.md to .thes1s/reports/{TICKER}/
</success_criteria>

<output>
After completion, create `.planning/phases/05C-cc-skill-first-analysis/05C-03-SUMMARY.md`
</output>
