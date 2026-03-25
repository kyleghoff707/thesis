---
name: generate-one-pager
description: Generate a complete Rule One One Pager investment analysis for a given stock ticker
argument-hint: TICKER
disable-model-invocation: true
---

# Generate One Pager

Generate a complete Rule One One Pager investment analysis for **$0**.

## Step 1: Validate Input and Set Up

The ticker symbol is `$0`. Uppercase it and store as `TICKER`.

- If `$0` is empty, print usage: `/generate:one-pager TICKER` and stop.
- Create output directory: `.thes1s/reports/{TICKER}/`
- Create sections subdirectory: `.thes1s/reports/{TICKER}/sections/`

## Step 2: Assemble DataPacket

Run the data assembly script to gather all financial data:

```bash
node --loader ./scripts/node-esm-loader.js scripts/assemble-data.js {TICKER}
```

Note: The `--loader` flag is required because engine files use Vite-style extension-less imports and bare JSON imports that Node.js native ESM does not support without a custom resolver.

Then read the output file: `.thes1s/reports/{TICKER}/data-packet.json`

If the DataPacket has an `errors` array, log each error but **continue** — the error-resilient design means partial data is expected and analysts should work with what is available.

Verify the DataPacket has a `ticker` field and at least `companyInfo` or `financials` populated. If both are null, stop with an error — there is insufficient data to generate an analysis.

## Step 3: Read Agent Configurations

Read the dispatch table and all agent configurations needed for the One Pager pipeline:

1. Read `agents/orchestrator/dispatch-table.json` — extract the `onePager` configuration for phase structure, agent assignments, and section keys.

2. For each agent referenced in the dispatch table (`business-analyst`, `financial-analyst`, `valuation-specialist`, `synthesis-writer`), read:
   - `agents/{agent-name}/config.json` — for model, curriculum, dataPacketSlice, universalContext settings
   - `agents/{agent-name}/prompt.md` — the agent's full system prompt

3. Read each agent's curriculum files (listed in `config.json` `curriculum` array). These are the Rule One methodology files that ground the agent's analysis.

4. For agents with `universalContext: true`, also read the universal context files listed in `config.json` `universalContextFiles` array (typically `knowledge/research-references/rule-one-fundamentals.md` and `knowledge/research-references/tools-for-analysis.md`).

5. Read the ReportSectionSchema definition from `src/schemas/reportSection.js` — extract the JSON Schema structure that all section outputs must conform to.

## Step 4: Prepare DataPacket Slices

For each analyst agent, create a sliced DataPacket containing only the fields that agent needs:

- Read the agent's `config.json` `dataPacketSlice` array
- Extract those fields from the full DataPacket
- **Always include** regardless of config: `ticker`, `companyInfo`, `classification`, `caveats`

The **synthesis-writer** gets NO DataPacket — it receives the completed section outputs from the analysts instead.

Construct the sliced DataPacket as a JSON object. This will be embedded in the subagent's prompt.

## Step 5: Dispatch 3 Parallel Analyst Agents

Dispatch ALL THREE analyst agents simultaneously using the Agent tool. Each agent runs as a subagent with Sonnet (per D-10, overriding any config.json model setting for cost efficiency).

For **each** analyst agent, construct the Agent call with:

**Prompt content** (concatenated in this order):
1. The agent's `prompt.md` content (primary instructions)
2. The sliced DataPacket as a fenced JSON code block labeled "DataPacket"
3. All curriculum file contents (from `config.json` `curriculum` array)
4. Universal context file contents (from `config.json` `universalContextFiles`)
5. The ReportSectionSchema as a JSON Schema definition, with instruction: "Your output MUST be valid JSON conforming to this schema. Output ONLY the JSON object(s), no surrounding text."

**Task instruction per agent:**

- **business-analyst**: "Analyze {TICKER} and produce sections 1 (company_info) and 2 (minimum_standards) as JSON objects conforming to ReportSectionSchema. Return a JSON array containing both section objects."
- **financial-analyst**: "Analyze {TICKER} and produce sections 3 (meaning) and 4 (growth_metrics) as JSON objects conforming to ReportSectionSchema. Return a JSON array containing both section objects."
- **valuation-specialist**: "Analyze {TICKER} and produce section 5 (valuation_summary) as a JSON object conforming to ReportSectionSchema. Return the single JSON object."

Log: "Dispatching 3 parallel analyst agents for {TICKER}..."

## Step 6: Collect and Validate Analyst Outputs

After all 3 analyst agents complete:

1. **Parse** each agent's response to extract the ReportSectionSchema-conformant JSON. Look for JSON objects/arrays in the response — agents may include some surrounding text.

2. **Validate** each section output has the required fields:
   - `key` (string matching a sectionKey from the dispatch table)
   - `title` (string)
   - `sectionNumber` (number)
   - `status` (one of: pass, fail, review, pending)
   - `confidence` (one of: HIGH, MEDIUM, LOW)
   - `verdict` (one of: PASS, FAIL, WATCHLIST, or null)
   - `verdictRationale` (string)
   - `summary` (string)
   - `narrative` (string)
   - `citations` (array)
   - `redFlags` (array with at least 1 item)

3. **Save** each validated section to `.thes1s/reports/{TICKER}/sections/{section_key}.json`

4. **Log** results for each section:
   - Section key and title
   - Verdict (PASS/FAIL/WATCHLIST)
   - Confidence level
   - Number of citations
   - Number of red flags

5. If a section fails validation, log the error and note which fields are missing. Continue with whatever sections succeeded — do not abort the entire pipeline for one section failure.

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

Expected sections from analysts:
- business-analyst: `company_info` (section 1), `minimum_standards` (section 2)
- financial-analyst: `meaning` (section 3), `growth_metrics` (section 4)
- valuation-specialist: `valuation_summary` (section 5)

## Step 7: Dispatch Synthesis Writer

After all analyst sections are collected, dispatch the **synthesis-writer** using the Agent tool with Opus model (per D-10 — synthesis requires judgment).

**Prompt content:**
1. The synthesis-writer's `prompt.md` content
2. All 5 completed section summaries, verdicts, confidence scores, red flags, and citations — formatted as a structured overview:

```
## Analyst Findings for {TICKER}

### Section 1: Company Info
- Verdict: {verdict}
- Confidence: {confidence}
- Summary: {summary}
- Red Flags: {redFlags}

### Section 2: Minimum Standards
...
(repeat for all 5 sections)
```

3. Universal context file contents
4. The ReportSectionSchema as a JSON Schema definition

**Task instruction:**
"Synthesize the analyst findings for {TICKER} and produce section 6 (overall_verdict) as a JSON object conforming to ReportSectionSchema. Weigh all 5 analyst sections — their verdicts, confidence levels, and red flags — to produce a final PASS/FAIL/WATCHLIST verdict with comprehensive rationale. The narrative should be in Buffett's clear, direct style. Return the single JSON object."

Log: "Dispatching synthesis-writer for {TICKER} overall verdict..."

## Step 8: Assemble Final Report

1. **Collect** all 6 sections (5 analyst + 1 synthesis) into a single report structure:

```json
{
  "ticker": "{TICKER}",
  "companyName": "{from DataPacket companyInfo}",
  "stage": "onePager",
  "generatedAt": "{ISO timestamp}",
  "sections": [ ...all 6 ReportSectionSchema objects ordered by sectionNumber... ],
  "overallVerdict": "{from synthesis-writer section 6 verdict}",
  "sectionKeys": ["company_info", "minimum_standards", "meaning", "growth_metrics", "valuation_summary", "overall_verdict"]
}
```

2. **Write JSON report** to `.thes1s/reports/{TICKER}/one-pager.json`

3. **Generate human-readable markdown** at `.thes1s/reports/{TICKER}/one-pager.md`:

   Format:
   ```markdown
   # {Company Name} ({TICKER}) -- One Pager

   **Generated:** {date}
   **Overall Verdict:** {PASS/FAIL/WATCHLIST} ({confidence})

   ---

   ## 1. Company Info
   {narrative}

   **Verdict:** {verdict} | **Confidence:** {confidence}

   ### Red Flags
   - {red flag 1}
   - {red flag 2}

   ---

   ## 2. Minimum Standards
   {narrative}
   ...

   (repeat for all 6 sections)

   ---

   ## Citations
   1. {citation 1}
   2. {citation 2}
   ...
   ```

4. **Print assembly summary:**
   - Sections completed: X/6
   - Overall verdict: PASS/FAIL/WATCHLIST
   - Total citations: N
   - Total red flags: N

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

## Step 10: Budget Tracking

Track token usage and estimated cost for the generation run:

1. **Run contextBudget tracking** by executing:
   ```bash
   node --import ./scripts/node-esm-loader.js -e "
     import { createBudgetTracker, formatBudgetReport } from './src/engines/contextBudget.js';
     import { readFileSync, writeFileSync } from 'fs';
     const report = JSON.parse(readFileSync('.thes1s/reports/{TICKER}/one-pager.json', 'utf8'));
     const tracker = createBudgetTracker();
     // Record estimates for each agent based on section tokenCost fields
     for (const section of report.sections) {
       const tc = section.tokenCost || { input: 0, output: 0 };
       tracker.record(
         section.key === 'overall_verdict' ? 'synthesis-writer' : 'analyst',
         section.key,
         tc.input || 0,
         tc.output || 0,
         section.modelUsed || 'claude-sonnet-4-20250514'
       );
     }
     const summary = tracker.getSummary();
     writeFileSync('.thes1s/reports/{TICKER}/budget.json', JSON.stringify(summary, null, 2));
     console.log(formatBudgetReport(summary));
   "
   ```

2. **Log budget summary:**
   - Total input/output tokens across all agents
   - Estimated cost for the full One Pager generation
   - Per-agent breakdown

3. **Budget tracking is observational** — it never blocks execution. The budget report helps the user understand cost per generation.

4. **Write budget report** to `.thes1s/reports/{TICKER}/budget.json`

## Step 11: Print Final Summary

Print the complete generation summary:
   - Sections completed: X/6
   - Overall verdict: PASS/FAIL/WATCHLIST
   - Total citations: N
   - Total red flags: N
   - Quality report: `.thes1s/reports/{TICKER}/quality/one-pager.quality.json`
   - Quality score: {overall score}/100
   - Issues found: {count} (high: {N}, medium: {N}, low: {N})
   - Budget report: `.thes1s/reports/{TICKER}/budget.json`
   - Estimated cost: ${total}
   - Output files:
     - `.thes1s/reports/{TICKER}/one-pager.json`
     - `.thes1s/reports/{TICKER}/one-pager.md`
     - `.thes1s/reports/{TICKER}/sections/*.json`
     - `.thes1s/reports/{TICKER}/quality/one-pager.quality.json`
     - `.thes1s/reports/{TICKER}/budget.json`

## Constraints

### Contamination Boundary (CRITICAL)
During generation, NEVER read from any of these paths:
- `knowledge/stage-1-one-pager/examples/`
- `knowledge/stage-2-pitch-deck/examples/`
- `knowledge/stage-3-full-story/examples/`
- `knowledge/pre-course-examples/`

These contain the user's manual research examples used for quality benchmarking. Agents must generate from curriculum + DataPacket alone — never pattern-match from examples. This is a hard constraint per AGNT-04 and D-13.

### Schema Enforcement
Every section output MUST conform to the ReportSectionSchema. Validate before saving. If a section is malformed, log the validation error and skip that section — do not save invalid data.

### Error Resilience
- If a subagent fails entirely, log the error, save what succeeded, and continue.
- If the DataPacket has errors, log them but proceed with available data.
- If some sections fail validation, still assemble the report with valid sections.
- The pipeline should produce partial results rather than nothing.

### Progress Display
Log progress at each major step:
- "Step 1: Validating input..."
- "Step 2: Assembling DataPacket for {TICKER}..."
- "Step 3: Reading agent configurations..."
- "Step 4: Preparing DataPacket slices..."
- "Step 5: Dispatching 3 parallel analyst agents..."
- "Step 6: Collecting analyst outputs... ({N}/5 sections received)"
- "Step 7: Dispatching synthesis-writer..."
- "Step 8: Assembling final report..."
- "Step 9: Running quality checks..."
- "Step 10: Tracking token budget..."
- "Step 11: Generation complete."
