---
name: generate-section
description: Re-generate a specific section of a report without re-running the full pipeline
argument-hint: TICKER stage section# [guidance]
disable-model-invocation: true
---

# Generate Section

Re-generate a single section of a Thes1s investment report for **$0**.

This skill enables targeted regeneration of individual sections with optional PM guidance, without the cost of re-running the full pipeline. Used at checkpoints when the PM says "re-run section X" and as a standalone command.

## Step 1: Parse Arguments

Parse `$0` to extract the following positional arguments:

1. **TICKER** (required) — The stock ticker symbol (e.g., COST, AAPL)
2. **stage** (required) — One of: `onePager`, `pitchDeck`, `fullStory`
3. **sectionNumber** (required) — The 1-based section number within that stage
4. **guidance** (optional) — Free-text PM guidance in quotes (e.g., "Focus more on international competitors")

**Example invocations:**
- `/generate:section COST pitchDeck 3`
- `/generate:section COST pitchDeck 3 "Focus more on international competitors"`
- `/generate:section AAPL onePager 2 "Include cloud services revenue breakdown"`

If fewer than 3 arguments are provided, print usage and stop:
```
Usage: /generate:section TICKER stage sectionNumber [guidance]

  TICKER         Stock ticker (e.g., COST, AAPL)
  stage          One of: onePager, pitchDeck, fullStory
  sectionNumber  Section number (1-based)
  guidance       Optional: additional PM guidance in quotes

Examples:
  /generate:section COST pitchDeck 3
  /generate:section COST pitchDeck 3 "Focus more on international competitors"
```

Uppercase the TICKER and store it. Validate that `stage` is one of `onePager`, `pitchDeck`, or `fullStory`. Validate that `sectionNumber` is a valid number for that stage.

## Step 2: Load Orchestrator Configuration

Read `agents/orchestrator/config.json` and extract:

1. **sectionMapping** — Look up which agent handles this section: `config.sectionMapping[stage][sectionNumber]`
   - If the section number is not in the sectionMapping for this stage, print an error and stop:
     ```
     Error: Section {sectionNumber} is not valid for stage {stage}.
     Valid sections for {stage}: {list of valid section numbers}
     ```

2. **agentName** — The agent role that produces this section (e.g., "business-analyst", "financial-analyst", "competitor-evaluator", etc.)

3. **Section key** — Read `agents/orchestrator/dispatch-table.json` and extract the sectionKeys array for the stage. The section key is `sectionKeys[sectionNumber - 1]`.

Log: "Section {sectionNumber} ({sectionKey}) of {stage} is handled by {agentName}"

## Step 3: Load Agent Configuration

Read the assigned agent's configuration:

1. Read `agents/{agentName}/config.json` — extract model, curriculum array, dataPacketSlice array, universalContext flag, universalContextFiles array
2. Read `agents/{agentName}/prompt.md` — the agent's full system prompt
3. Read each curriculum file listed in `config.json` `curriculum` array — these are the Rule One methodology files
4. If `universalContext: true`, also read each file in `universalContextFiles` (typically `knowledge/research-references/rule-one-fundamentals.md` and `knowledge/research-references/tools-for-analysis.md`)

## Step 4: Load Existing Report Context

Load all available context from previous generation runs:

1. **DataPacket** — Read `.thes1s/reports/{TICKER}/data-packet.json`
   - If not found, print error: "No DataPacket found for {TICKER}. Run /generate:one-pager or assemble data first." and stop.

2. **Existing section outputs** — Read all `.thes1s/reports/{TICKER}/sections/*.json` files to provide prior context from other sections. This gives the agent awareness of what other analysts found.

3. **PSR findings** (if they exist):
   - `.thes1s/reports/{TICKER}/sections/annual-reader-insights.json` — 10-K/proxy insights
   - `.thes1s/reports/{TICKER}/sections/quarterly-reader-insights.json` — 10-Q/transcript insights
   These provide primary source evidence the agent should incorporate.

4. **Existing report** — Read `.thes1s/reports/{TICKER}/{stage-filename}.json` where stage-filename is:
   - `onePager` -> `one-pager.json`
   - `pitchDeck` -> `pitch-deck.json`
   - `fullStory` -> `full-story.json`
   Check for checkpoint notes or user feedback that should inform the regeneration.

5. **Progress state** — Read `.thes1s/reports/{TICKER}/progress.json` for current generation state context.

Log: "Loaded DataPacket + {N} existing sections + PSR findings: {annual: yes/no, quarterly: yes/no}"

## Step 5: Prepare DataPacket Slice

Create a sliced DataPacket for the assigned agent:

1. Read the agent's `config.json` `dataPacketSlice` array
2. Extract only those fields from the full DataPacket
3. **Always include** regardless of config: `ticker`, `companyInfo`, `classification`, `caveats`

If the agent is the **synthesis-writer**, skip the DataPacket slice — it receives section summaries instead.

## Step 6: Build and Dispatch Agent

Construct the agent prompt by concatenating in this order:

1. **Agent prompt.md** — The agent's primary instructions
2. **Sliced DataPacket** — As a fenced JSON code block labeled "DataPacket"
3. **Curriculum files** — All curriculum content from `config.json` `curriculum` array
4. **Universal context** — Files from `universalContextFiles` (if `universalContext: true`)
5. **ReportSectionSchema** — Read from `src/schemas/reportSection.js`, include the JSON Schema definition with instruction: "Your output MUST be valid JSON conforming to this schema. Output ONLY the JSON object, no surrounding text."
6. **Prior section context** — Summaries from other completed sections:
   ```
   ## Context from Other Analysts

   ### Section {N}: {title}
   - Verdict: {verdict}
   - Confidence: {confidence}
   - Summary: {summary}
   - Key Red Flags: {redFlags}
   ```
7. **PSR findings** — If annual-reader-insights.json or quarterly-reader-insights.json exist, include them:
   ```
   ## Primary Source Reader Findings

   ### Annual Reader (10-K / Proxy)
   {contents}

   ### Quarterly Reader (10-Q / Transcripts)
   {contents}
   ```
8. **PM guidance** — If guidance text was provided, append:
   ```
   ## ADDITIONAL GUIDANCE FROM PM

   The portfolio manager has requested this section be regenerated with the following guidance:

   {guidance}

   Incorporate this guidance into your analysis. Prioritize addressing the PM's specific direction while maintaining analytical rigor and Rule One methodology.
   ```

**Task instruction:**
"Analyze {TICKER} and produce section {sectionNumber} ({sectionKey}) as a JSON object conforming to ReportSectionSchema. Return the single JSON object."

Dispatch via the Agent tool using Sonnet model (per D-10 cost efficiency) unless the agent is the synthesis-writer, which uses Opus (per D-10 — synthesis requires judgment).

Log: "Dispatching {agentName} for section {sectionNumber} ({sectionKey})..."

## Step 7: Collect, Validate, and Save

After the agent completes:

1. **Parse** the response to extract the ReportSectionSchema-conformant JSON object. Look for JSON in the response — the agent may include surrounding text.

2. **Validate** the section output has required fields:
   - `key` (must match sectionKey)
   - `title` (string)
   - `sectionNumber` (must match requested number)
   - `status` (one of: pass, fail, review, pending)
   - `confidence` (one of: HIGH, MEDIUM, LOW)
   - `verdict` (PASS, FAIL, WATCHLIST, or null)
   - `verdictRationale` (string)
   - `summary` (string)
   - `narrative` (string)
   - `citations` (array)
   - `redFlags` (array with at least 1 item)

3. **Save** the validated section to `.thes1s/reports/{TICKER}/sections/{sectionKey}.json` (overwrites previous version).

4. **Run critic.js** quality check on the single section:
   ```bash
   node --import ./scripts/node-esm-loader.js -e "
     import { validateSection } from './src/engines/critic.js';
     import { readFileSync } from 'fs';
     const section = JSON.parse(readFileSync('.thes1s/reports/{TICKER}/sections/{sectionKey}.json', 'utf8'));
     const dp = JSON.parse(readFileSync('.thes1s/reports/{TICKER}/data-packet.json', 'utf8'));
     const result = validateSection(section, dp);
     console.log(JSON.stringify(result, null, 2));
   "
   ```

5. **Print section results:**
   - Section: {sectionNumber} ({sectionKey}) — {title}
   - Verdict: {verdict} | Confidence: {confidence}
   - Citations: {count}
   - Red Flags: {count}
   - Quality Score: {score from critic.js}

**Retry on failure** (per D-05): If JSON parsing or validation fails:
   a. Construct retry prompt: original prompt + error context:
      ```
      RETRY: Your previous response could not be parsed as valid JSON.
      Error: {specific parse/validation error}
      Please output ONLY the JSON object conforming to ReportSectionSchema. No surrounding text.
      ```
   b. Dispatch the agent again with the retry prompt.
   c. If the retry also fails, print error and stop — do NOT update the report file.
      ```
      Error: Section {sectionKey} failed after retry: {error}
      The existing report has NOT been modified.
      ```

## Step 8: Update Report Assembly

After a successful section save:

1. **Read** the existing stage report file:
   - `onePager` -> `.thes1s/reports/{TICKER}/one-pager.json`
   - `pitchDeck` -> `.thes1s/reports/{TICKER}/pitch-deck.json`
   - `fullStory` -> `.thes1s/reports/{TICKER}/full-story.json`

2. If the report file exists:
   - Find the section in the `sections` array matching `sectionNumber`
   - Replace it with the new section output
   - Update the `generatedAt` timestamp
   - Write the updated report back to disk

3. If the report file does NOT exist:
   - Print warning: "No assembled report found at {path}. Section saved to sections/{sectionKey}.json but report not updated. Run the full pipeline to assemble."

4. **Print completion message:**
   ```
   Section {sectionNumber} ({sectionKey}) regenerated successfully.
   Report updated: {report-path}
   ```

## Constraints

### Contamination Boundary (CRITICAL)

During generation, NEVER read from any of these paths:
- `knowledge/stage-1-one-pager/examples/`
- `knowledge/stage-2-pitch-deck/examples/`
- `knowledge/stage-3-full-story/examples/`
- `knowledge/pre-course-examples/`

These contain the user's manual research examples used for quality benchmarking. Agents must generate from curriculum + DataPacket alone — never pattern-match from examples. This is a hard constraint per AGNT-04 and D-13.

### Schema Enforcement

The section output MUST conform to ReportSectionSchema. If the output is malformed after retry, do NOT save it and do NOT update the report.

### Error Resilience

- If the DataPacket has errors, log them but proceed with available data.
- If some prior sections are missing, proceed — the agent works with whatever context is available.
- If critic.js fails, log the warning but the section is still considered saved.
- The section save happens before the report update — even if the report update fails, the section file is preserved.

### Progress Display

Log progress at each major step:
- "Step 1: Parsing arguments..."
- "Step 2: Loading orchestrator config..."
- "Step 3: Loading {agentName} configuration..."
- "Step 4: Loading existing context for {TICKER}..."
- "Step 5: Preparing DataPacket slice..."
- "Step 6: Dispatching {agentName} for section {sectionNumber}..."
- "Step 7: Validating and saving output..."
- "Step 8: Updating report assembly..."
- "Done: Section {sectionNumber} ({sectionKey}) regenerated."

### Supported Stages and Section Keys

**onePager** (6 sections):
1. company_info
2. minimum_standards
3. meaning
4. growth_metrics
5. valuation_summary
6. overall_verdict

**pitchDeck** (10 sections):
1. radar
2. simple_predictable
3. market_position
4. barriers_moats
5. fcf
6. management
7. roe_roic_debt
8. balance_sheet
9. pest
10. valuation

**fullStory** (8 sections):
1. event_analysis
2. meaning_checklist
3. moat_checklist
4. management_checklist
5. valuation_confirmation
6. inversion_rebuttal
7. trading_strategy
8. pace_plan
