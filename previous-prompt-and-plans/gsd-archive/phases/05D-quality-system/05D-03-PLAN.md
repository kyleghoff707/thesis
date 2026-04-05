---
phase: 05D-quality-system
plan: 03
type: execute
wave: 2
depends_on: ["05D-01", "05D-02"]
files_modified:
  - .claude/skills/generate-one-pager/SKILL.md
  - src/engines/progressState.js
autonomous: true
requirements: [QUAL-07]

must_haves:
  truths:
    - "When an agent section fails parsing, the CC skill retries once with error context injected"
    - "When retry also fails, partial output is saved with status 'failed' and error message (per D-05, D-06)"
    - "After all sections complete, the CC skill runs critic.js validateStage and saves quality report"
    - "After all sections complete, the CC skill runs contextBudget tracking and saves budget report"
    - "The quality report is saved to .thes1s/reports/{TICKER}/quality/one-pager.quality.json"
    - "The budget report is saved to .thes1s/reports/{TICKER}/budget.json"
  artifacts:
    - path: ".claude/skills/generate-one-pager/SKILL.md"
      provides: "Updated CC skill with quality system integration"
      contains: "critic.js"
    - path: "src/engines/progressState.js"
      provides: "Updated with saveQualityReport and saveBudgetReport helpers"
      exports: ["saveQualityReport", "saveBudgetReport"]
  key_links:
    - from: ".claude/skills/generate-one-pager/SKILL.md"
      to: "src/engines/critic.js"
      via: "Step 8.5 quality check instruction"
      pattern: "validateStage"
    - from: ".claude/skills/generate-one-pager/SKILL.md"
      to: "src/engines/contextBudget.js"
      via: "Budget tracking instruction"
      pattern: "contextBudget"
    - from: "src/engines/progressState.js"
      to: ".thes1s/reports/{TICKER}/quality/"
      via: "saveQualityReport writes quality JSON"
      pattern: "quality"
---

<objective>
Wire critic.js and contextBudget.js into the generate-one-pager CC skill, add retry-then-escalate failure handling, and add quality report persistence to progressState.js. This completes the quality system integration.

Purpose: Quality checks and cost tracking run automatically on every One Pager generation. Failure recovery prevents single-section failures from crashing the pipeline.
Output: Updated SKILL.md with quality integration, updated progressState.js with quality persistence helpers.
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

<interfaces>
<!-- From critic.js (Plan 01) -->
```javascript
// Main entry point — pure function, no side effects
export function validateSection(section, dataPacket, options = {});
// Returns: { sectionKey, score, completeness, issues, passed, checkedAt }

// Aggregate — runs validateSection for each section
export function validateStage(sections, dataPacket);
// Returns: { sections: [...reports], overallScore, overallPassed, checkedAt }
```

<!-- From contextBudget.js (Plan 02) -->
```javascript
export function estimateTokens(text);  // chars/4 estimation
export function createBudgetTracker();
// tracker.record(agentRole, sectionKey, inputText, outputText, model)
// tracker.getSummary() -> { entries, totals, estimatedCost }
export function formatBudgetReport(summary);  // human-readable string
```

<!-- From progressState.js (existing) -->
```javascript
export function saveSectionOutput(ticker, sectionKey, sectionData);
export function updateSectionStatus(ticker, sectionKey, status, metadata = {});
// Sections dir: .thes1s/reports/{TICKER}/sections/
// Progress file: .thes1s/reports/{TICKER}/progress.json
```

<!-- From SKILL.md (existing steps) -->
Step 5: Dispatch 3 parallel analyst agents
Step 6: Collect and validate analyst outputs
Step 7: Dispatch synthesis writer
Step 8: Assemble final report

<!-- State machine transitions (existing) -->
SYNTHESIS -> QUALITY_CHECK -> COMPLETE
// The QUALITY_CHECK state exists but nothing currently runs there.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add quality persistence helpers to progressState.js</name>
  <files>src/engines/progressState.js</files>
  <read_first>
    - src/engines/progressState.js (existing code — full file, understand the pattern)
    - src/engines/__tests__/progressState.test.js (existing tests to not break)
  </read_first>
  <action>
    Add two new exported functions to `src/engines/progressState.js`, following the exact same pattern as `saveSectionOutput`:

    1. `saveQualityReport(ticker, qualityData)`:
       - Creates directory: `.thes1s/reports/{TICKER}/quality/`
       - Writes `qualityData` as JSON to `.thes1s/reports/{TICKER}/quality/one-pager.quality.json`
       - Uses `mkdirSync(qualityDir, { recursive: true })` and `writeFileSync`
       - Same error-handling pattern as saveSectionOutput (no try/catch, let caller handle)

    2. `saveBudgetReport(ticker, budgetData)`:
       - Writes `budgetData` as JSON to `.thes1s/reports/{TICKER}/budget.json`
       - Uses `mkdirSync` (directory already exists from prior steps) and `writeFileSync`
       - Same pattern as saveSectionOutput

    3. `readQualityReport(ticker)`:
       - Reads `.thes1s/reports/{TICKER}/quality/one-pager.quality.json`
       - Returns parsed JSON or null if not found
       - Same pattern as `readSectionOutput`

    Add these to the `_testExports` object at the bottom of the file (append to existing object, do not replace existing entries).

    Do NOT modify any existing functions. Only add new exports.

    Run existing tests to confirm no regressions: `npx vitest run src/engines/__tests__/progressState.test.js`
  </action>
  <verify>
    <automated>cd /Users/kylehoff/Desktop/stock-analyzer && npx vitest run src/engines/__tests__/progressState.test.js --reporter=verbose 2>&1 | tail -10</automated>
  </verify>
  <acceptance_criteria>
    - `src/engines/progressState.js` exports saveQualityReport, saveBudgetReport, readQualityReport
    - Existing progressState.test.js tests still pass (no regressions)
    - saveQualityReport writes to `.thes1s/reports/{TICKER}/quality/one-pager.quality.json`
    - saveBudgetReport writes to `.thes1s/reports/{TICKER}/budget.json`
    - readQualityReport returns null when file doesn't exist
  </acceptance_criteria>
  <done>progressState.js has quality and budget persistence helpers. All existing tests pass. New helpers follow identical patterns to saveSectionOutput/readSectionOutput.</done>
</task>

<task type="auto">
  <name>Task 2: Integrate quality system into generate-one-pager SKILL.md</name>
  <files>.claude/skills/generate-one-pager/SKILL.md</files>
  <read_first>
    - .claude/skills/generate-one-pager/SKILL.md (full file — understand all 8 steps)
    - src/engines/critic.js (validate the export names to reference correctly)
    - src/engines/contextBudget.js (validate the export names to reference correctly)
    - src/engines/progressState.js (after Task 1 — confirm saveQualityReport, saveBudgetReport exist)
    - .planning/phases/05D-quality-system/05D-CONTEXT.md (D-05, D-06 decisions for failure recovery)
  </read_first>
  <action>
    Update `.claude/skills/generate-one-pager/SKILL.md` with three additions. Do NOT rewrite existing steps — add to them.

    **Addition 1: Retry-then-escalate in Step 6 (QUAL-07, per D-05)**

    After the existing Step 6 validation paragraph (item 5: "If a section fails validation..."), add:

    ```markdown
    6. **Retry failed sections** (per D-05). For each section that fails JSON parsing or validation:
       a. Construct a retry prompt: Take the original agent prompt and append:
          ```
          RETRY: Your previous response could not be parsed as valid JSON.
          Error: {the specific parse/validation error message}
          Please output ONLY the JSON object(s) conforming to ReportSectionSchema. No surrounding text.
          ```
       b. Dispatch the same agent again with the retry prompt using the Agent tool.
       c. Parse and validate the retry response.
       d. If the retry also fails, save partial output by writing a section JSON with `status: "failed"` and `error: "{error message}"` to `.thes1s/reports/{TICKER}/sections/{section_key}.json`. Log: "Section {section_key} failed after retry: {error}. Partial output saved."
       e. Continue with remaining sections — do not abort the pipeline.
    ```

    **Addition 2: Quality check as new Step 8.5 (after Step 8 "Assemble Final Report")**

    Add between current Step 8 and the Constraints section:

    ```markdown
    ## Step 9: Quality Check

    Run the quality system on the assembled report:

    1. **Run critic.js validation** by executing:
       ```bash
       node --import ./scripts/node-esm-loader.js -e "
         import { validateStage } from './src/engines/critic.js';
         import { readFileSync } from 'fs';
         const report = JSON.parse(readFileSync('.thes1s/reports/{TICKER}/one-pager.json', 'utf8'));
         const dp = JSON.parse(readFileSync('.thes1s/reports/{TICKER}/data-packet.json', 'utf8'));
         const quality = validateStage(report.sections, dp);
         const { writeFileSync, mkdirSync } = await import('fs');
         mkdirSync('.thes1s/reports/{TICKER}/quality', { recursive: true });
         writeFileSync('.thes1s/reports/{TICKER}/quality/one-pager.quality.json', JSON.stringify(quality, null, 2));
         console.log('Quality check complete. Overall score:', quality.overallScore, 'Passed:', quality.overallPassed);
         console.log('Issues:', quality.sections.reduce((s, r) => s + r.issues.length, 0), 'total');
         for (const r of quality.sections) {
           const highCount = r.issues.filter(i => i.severity === 'high').length;
           const medCount = r.issues.filter(i => i.severity === 'medium').length;
           const lowCount = r.issues.filter(i => i.severity === 'low').length;
           console.log('  ' + r.sectionKey + ': score=' + r.score + ' (high:' + highCount + ' med:' + medCount + ' low:' + lowCount + ')');
         }
       "
       ```

    2. **Log quality results:**
       - Overall quality score (0-100)
       - Passed/failed status
       - Per-section: score, issue counts by severity
       - List any HIGH severity issues verbatim

    3. **Quality is informational, not blocking** (per D-04). The report is already saved. The quality report is supplementary data for the user to review.

    4. **Write quality report** to `.thes1s/reports/{TICKER}/quality/one-pager.quality.json`
    ```

    **Addition 3: Renumber Step 8 -> Step 9, add Step 10 for summary**

    Renumber the existing Step 8 (Assemble Final Report) to keep it, and make the quality check Step 9, then rename the print summary at the end of the existing Step 8 to Step 10 and add quality + budget info:

    In the final print summary (currently at end of Step 8, becomes Step 10), add these lines after "Output files:":
    ```
    - Quality report: `.thes1s/reports/{TICKER}/quality/one-pager.quality.json`
    - Quality score: {overall score}/100
    - Issues found: {count} (high: {N}, medium: {N}, low: {N})
    ```

    Also update the step numbering in the "Progress Display" section under Constraints to include:
    ```
    - "Step 9: Running quality checks..."
    - "Step 10: Generation complete."
    ```
  </action>
  <verify>
    <automated>cd /Users/kylehoff/Desktop/stock-analyzer && grep -c "critic\|contextBudget\|quality\|RETRY\|retry" .claude/skills/generate-one-pager/SKILL.md</automated>
  </verify>
  <acceptance_criteria>
    - SKILL.md contains "RETRY" text in Step 6 section for failure recovery
    - SKILL.md contains "critic.js" reference for quality validation
    - SKILL.md contains "quality/one-pager.quality.json" output path
    - SKILL.md contains "Quality is informational, not blocking" (per D-04)
    - SKILL.md Step 6 describes retry-then-escalate: retry once, then save with status "failed"
    - Existing Steps 1-7 are preserved (not rewritten, only appended to)
    - Step numbering is consistent (no duplicate step numbers)
  </acceptance_criteria>
  <done>generate-one-pager SKILL.md integrates quality system: retry-then-escalate on section failure (D-05/D-06), critic.js quality check after assembly, quality report saved alongside generated output. Quality is informational — never blocks.</done>
</task>

</tasks>

<verification>
Verify progressState.js tests still pass:
```bash
npx vitest run src/engines/__tests__/progressState.test.js
```

Verify SKILL.md has quality integration:
```bash
grep -n "critic\|quality\|RETRY\|retry\|budget" .claude/skills/generate-one-pager/SKILL.md
```

Verify all engine tests still pass:
```bash
npx vitest run
```
</verification>

<success_criteria>
- progressState.js exports saveQualityReport, saveBudgetReport, readQualityReport
- SKILL.md Step 6 has retry-then-escalate logic per D-05/D-06
- SKILL.md has quality check step running critic.js validateStage
- SKILL.md quality report saved to .thes1s/reports/{TICKER}/quality/
- Quality is informational, never blocking (per D-04)
- All existing tests pass (no regressions)
</success_criteria>

<output>
After completion, create `.planning/phases/05D-quality-system/05D-03-SUMMARY.md`
</output>
