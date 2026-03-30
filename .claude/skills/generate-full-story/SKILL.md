# ~~~~
name: generate-full-story
description: Generate a 5-section Rule One Full Story (Stage 3) deep analysis for a given stock ticker, building on Pitch Deck findings with scored checklists
argument-hint: TICKER
disable-model-invocation: true
~~~~

# Generate Full Story

Generate the Full Story (Stage 3) deep analysis for **$0**, building on existing Pitch Deck findings.

This skill orchestrates 5 specialist agents to produce scored checklists and deep-dive analyses that test investment conviction. Each agent inherits relevant Pitch Deck findings as context -- they build on prior work, not from scratch. S6 (inversion_rebuttal) is deferred to Phase 14's adversarial debate.

---

## Pitch Deck Inheritance Map (D-04)

This constant mapping defines which Pitch Deck sections feed into each Full Story section. Agents cite specific findings from their inherited PD sections -- no re-deriving from scratch (D-05).

```
PD_INHERITANCE_MAP:
  event_analysis:         [pest, radar]
  meaning_checklist:      [simple_predictable, market_position]
  moat_checklist:         [barriers_moats, market_position]
  management_checklist:   [management, balance_sheet]
  valuation_confirmation: [fcf, roe_roic_debt, valuation]
```

**PD Section Key Normalization** (handles both CC skill and API pipeline formats):
When reading Pitch Deck sections from `pipeline-output.json`, section keys may differ from the dispatch table. Try both the canonical key AND these common variants:

| Canonical Key       | Pipeline Variant(s)              |
|---------------------|----------------------------------|
| `radar`             | `company_info`                   |
| `simple_predictable`| `minimum_standards`              |
| `barriers_moats`    | `barriers_and_moats`             |
| `pest`              | `pest_risks`                     |
| `valuation`         | `valuation_summary`              |
| `roe_roic_debt`     | `growth_metrics`                 |
| `fcf`               | `growth_metrics`                 |

---

## Step 1: Validate Input and Gate Check

The ticker symbol is `$0`. Uppercase it and store as `TICKER`.

- If `$0` is empty, print usage: `/generate:full-story TICKER` and stop.
- Create output directories:
  - `.thes1s/reports/{TICKER}/`
  - `.thes1s/reports/{TICKER}/sections/`

**Gate Check (D-09, D-11):** Read `.thes1s/reports/{TICKER}/pitch-deck.json`. Verify:
1. The file exists
2. Parse it and check that `overallVerdict` is set (not null, not undefined)

**Fallback (Pitfall 2):** If `pitch-deck.json` not found, try `.thes1s/reports/{TICKER}/pipeline-output.json`. Check for `overallVerdict`. If `pipeline-output.json` exists but has no top-level `overallVerdict` field, check if at least 10 sections exist with verdicts -- treat as passed if so (the API pipeline stores verdict per section but may not set a top-level `overallVerdict`).

If both fail, print:
```
Gate check FAILED: Pitch Deck must be completed before generating a Full Story.
Run /generate:pitch-deck {TICKER} first.
```
And **stop execution**.

If the gate passes, log:
```
Step 1: Gate check PASSED -- Pitch Deck verdict: {verdict}
Setting up Full Story generation for {TICKER}...
```

Store the Pitch Deck data source path (`pitch-deck.json` or `pipeline-output.json`) for use in Step 3.

## Step 2: Load Orchestrator and Agent Configurations

Read the dispatch table and all agent configurations for the Full Story pipeline:

1. Read `agents/orchestrator/dispatch-table.json` -- extract the `fullStory` configuration for phase structure, agent assignments, section keys, and checkpoint rules.

2. Read `agents/orchestrator/config.json` -- extract `sectionMapping.fullStory` for routing PM questions to responsible agents at the checkpoint:
   - S1 -> risk-analyst
   - S2 -> business-analyst
   - S3 -> competitor-evaluator
   - S4 -> management-evaluator
   - S5 -> valuation-specialist
   - S6 -> synthesis-writer (Phase 14)

3. For each of these 5 agents (`risk-analyst`, `business-analyst`, `competitor-evaluator`, `management-evaluator`, `valuation-specialist`), read:
   - `agents/{agent-name}/config.json` -- for model, curriculum, dataPacketSlice, universalContext settings, tools
   - `agents/{agent-name}/prompt.md` -- the agent's full system prompt (includes Full Story section instructions from Phase 12)
   - Each curriculum file listed in `config.json` `curriculum` array
   - If `universalContext: true`, read each file in `universalContextFiles` (typically `knowledge/research-references/rule-one-fundamentals.md` and `knowledge/research-references/tools-for-analysis.md`)

4. Read `src/schemas/reportSection.js` -- extract the JSON Schema definition for section output validation.

5. Read `agents/orchestrator/schemas/checklist-item.schema.json` -- needed for checkpoint score extraction from checklist section `data` fields.

Log:
```
Step 2: Configurations loaded for 5 agents
  risk-analyst (S1 event_analysis)
  business-analyst (S2 meaning_checklist)
  competitor-evaluator (S3 moat_checklist)
  management-evaluator (S4 management_checklist)
  valuation-specialist (S5 valuation_confirmation)
```

## Step 3: Prepare Pitch Deck Inheritance (D-03, D-04, D-05)

For each Full Story section key, read its inherited Pitch Deck section data using the PD_INHERITANCE_MAP defined above.

**Reading PD sections (handle both CC and API pipeline formats -- Pitfall 3):**

For each PD section key in the inheritance map:

1. **First try:** Read `.thes1s/reports/{TICKER}/sections/{pd_key}.json` (CC skill format -- individual files)

2. **If not found:** Extract from `.thes1s/reports/{TICKER}/pitch-deck.json` sections array (match by `key` field)

3. **If not found:** Extract from `.thes1s/reports/{TICKER}/pipeline-output.json` sections array (match by `key` field)

4. **Key normalization for pipeline-output.json:** The API pipeline may use different section keys than the dispatch table. When matching, try both the exact canonical key AND common variants from the normalization table above. For example, when looking for `barriers_moats`, also try `barriers_and_moats`.

For each found PD section, format as inherited context:

```
## Prior Pitch Deck Analysis

### {PD Section Title} (Section {N})
Verdict: {verdict} | Confidence: {confidence}

Summary: {summary}

Key Findings:
{narrative, first 2000 chars -- enough for context, not full prose}

Red Flags:
- {red flags list}

Citations:
- {citations list}

Data:
{data field if present -- contains structured findings}
```

Log:
```
Step 3: Pitch Deck inheritance prepared -- {N}/5 sections have PD context
  event_analysis: pest ({found/missing}), radar ({found/missing})
  meaning_checklist: simple_predictable ({found/missing}), market_position ({found/missing})
  moat_checklist: barriers_moats ({found/missing}), market_position ({found/missing})
  management_checklist: management ({found/missing}), balance_sheet ({found/missing})
  valuation_confirmation: fcf ({found/missing}), roe_roic_debt ({found/missing}), valuation ({found/missing})
```

## Step 4: Prepare DataPacket Slices (D-10)

Read `.thes1s/reports/{TICKER}/data-packet.json` -- the existing DataPacket assembled during Pitch Deck generation. Do NOT re-assemble it (D-09, D-10).

If the DataPacket file does not exist, print:
```
Warning: No DataPacket found at .thes1s/reports/{TICKER}/data-packet.json
Full Story agents will rely on Pitch Deck inheritance context only.
```
And continue -- agents can work with PD inheritance even without the DataPacket.

For each of the 5 agents, slice the DataPacket per their `config.json` `dataPacketSlice` array:

- **risk-analyst** receives: `companyInfo`, `events`, `analystEstimates`, `classification`
- **business-analyst** receives: `companyInfo`, `classification`, `ruleOneScore`, `peers`
- **competitor-evaluator** receives: `peers`, `peerMetrics`, `classification`, `companyInfo`
- **management-evaluator** receives: `compensation`, `insiders`, `gurus`, `companyInfo`
- **valuation-specialist** receives: `growthRates`, `returnMetrics`, `fcf`, `analystEstimates`, `ttm`, `currentPrice`, `keyMetrics`

**Always include** regardless of config: `ticker`, `companyInfo`, `classification`, `caveats`

Log:
```
Step 4: DataPacket sliced for 5 agents
```

## Step 5: Dispatch 5 Agents Sequentially (D-01, D-02, Pitfall 4)

Despite sections being logically independent (D-02), dispatch agents one at a time due to the CC RAM constraint (same as Pitch Deck skill). The dispatch order is: S1, S2, S3, S4, S5.

```
Step 5: Dispatching 5 agents sequentially (RAM constraint)...
```

### Standardized Prompt Assembly

Each agent dispatch follows this exact template. Concatenate in this order:

1. **Agent prompt.md content** -- includes Full Story section instructions from Phase 12
2. **Sliced DataPacket** -- as a fenced JSON code block labeled "DataPacket":
   ````
   ```json DataPacket
   {sliced DataPacket JSON}
   ```
   ````
3. **Curriculum files** from config.json `curriculum` array
4. **Universal context files** (if `universalContext: true`)
5. **ReportSectionSchema definition** -- read from `src/schemas/reportSection.js`, include the JSON Schema definition with instruction: "Your output MUST be valid JSON conforming to this schema. Output ONLY the JSON object, no surrounding text."
6. **Inherited Pitch Deck section context** -- formatted per Step 3 for this section's PD dependencies
7. **PSR findings** -- read `.thes1s/reports/{TICKER}/sections/annual-reader-insights.json` and `.thes1s/reports/{TICKER}/sections/quarterly-reader-insights.json` if they exist. Include as:
   ```
   ## Primary Source Reader Findings

   ### Annual Reader (10-K / Proxy)
   {contents}

   ### Quarterly Reader (10-Q / Transcripts)
   {contents}
   ```
   If not found, skip silently.
8. **Task instruction:**
   ```
   Analyze {TICKER} and produce section {N} ({key}) of the Full Story as a JSON object
   conforming to ReportSectionSchema. Build on the Pitch Deck findings provided above --
   cite specific findings from the prior analysis, do not re-derive from scratch.
   For checklist sections: your `data` field MUST contain a JSON string conforming to
   ChecklistSectionData schema (checklistType, items array with verdict/evidence/confidence
   per item, summary with scoreDisplay). Return the single JSON object.
   ```

### Per-Section Dispatch

**S1: risk-analyst -- event_analysis**
- Inherits: PD pest (S9) + PD radar (S1)
- Focus: Event analysis building on PEST risks identified in Pitch Deck

**S2: business-analyst -- meaning_checklist**
- Inherits: PD simple_predictable (S2) + PD market_position (S3)
- Focus: 15-point Meaning checklist with PASS/FAIL/PARTIAL per item
- Checklist type: `meaning` (15 items)

**S3: competitor-evaluator -- moat_checklist**
- Inherits: PD barriers_moats (S4) + PD market_position (S3)
- Focus: 15-point Moat checklist with PASS/FAIL/PARTIAL per item
- Checklist type: `moat` (15 items)

**S4: management-evaluator -- management_checklist**
- Inherits: PD management (S6) + PD balance_sheet (S8)
- Focus: 13-point Management checklist with PASS/FAIL/PARTIAL per item
- Checklist type: `management` (13 items)

**S5: valuation-specialist -- valuation_confirmation**
- Inherits: PD fcf (S5) + PD roe_roic_debt (S7) + PD valuation (S10)
- Focus: Valuation confirmation with sensitivity analysis building on PD valuations

### Post-Dispatch Processing (per agent)

After each agent completes:

**a. JSON extraction fallback:**
Check if the agent wrote the section file directly. If not, look for a ```json code block in the agent's response. If found, extract the JSON content and write to `.thes1s/reports/{TICKER}/sections/fullStory-S{N}-{key}.json`:

```bash
cat << 'SECTION_EOF' > .thes1s/reports/{TICKER}/sections/fullStory-S{N}-{key}.json
{extracted JSON}
SECTION_EOF
```

**b. Narrative recovery:**
Check `narrative` field length. If < 200 chars, search the agent's response above the JSON block for Part 1 narrative prose (markdown with ## headings). If substantial prose found (> 200 chars), inject into the narrative field and re-save. If no recoverable narrative, retry once with enhanced instruction:
```
RETRY: Your previous output had a {length}-char narrative stub. The narrative field MUST
contain your FULL analysis (500+ words). Write the complete narrative -- do NOT abbreviate.
```

**c. Validation:**
Verify the section JSON has required fields:
- `key` (matches the sectionKey for this section)
- `title` (string)
- `sectionNumber` (matches the expected section number)
- `status` (one of: pass, fail, review, pending)
- `confidence` (one of: HIGH, MEDIUM, LOW)
- `verdict` (PASS, FAIL, WATCHLIST, or null)
- `verdictRationale` (string)
- `summary` (string)
- `narrative` (string)
- `citations` (array)
- `redFlags` (array with >= 1 item)

**d. Retry on failure:**
If JSON parsing or validation fails:
1. Wait 30 seconds: `sleep 30`
2. Construct retry prompt with error details and instruction to output ONLY valid JSON
3. Dispatch the agent again
4. If retry also fails, save with `status: "failed"` and continue to next section

**e. Log per section:**
```
  S{N} {key} ({agent}): {verdict} | {confidence} | {citation_count} citations | {red_flag_count} red flags | narrative: {length} chars
```

**Section naming convention:** `fullStory-S{N}-{key}.json` (stage-prefixed to avoid collisions with Pitch Deck and One Pager section files in the same directory).

After all 5 agents complete, log:
```
Step 5: All 5 sections dispatched and collected
  S1 event_analysis: {verdict} ({confidence})
  S2 meaning_checklist: {verdict} ({confidence})
  S3 moat_checklist: {verdict} ({confidence})
  S4 management_checklist: {verdict} ({confidence})
  S5 valuation_confirmation: {verdict} ({confidence})
```

## Step 6: Checkpoint -- Full Story Deep Analysis Review (D-06, D-07, D-08)

Print a structured checkpoint summary for the Portfolio Manager.

**Checklist score extraction (Pitfall 5):** For sections S2 (meaning_checklist), S3 (moat_checklist), and S4 (management_checklist), parse the `data` field as JSON. Extract `summary.scoreDisplay` string. If `data` parsing fails, log warning and show "Score: unable to parse" instead.

```
================================================================
  CHECKPOINT: Full Story Deep Analysis Review
================================================================

Sections completed: 5/5 (S6 inversion_rebuttal deferred to Phase 14 debate)

--- Section 1: Event Analysis ---
  Agent: risk-analyst
  Verdict: {verdict} | Confidence: {confidence}
  Summary: {summary, first 200 chars}
  Red Flags: {count} items
  Citations: {count} sources

--- Section 2: Meaning Checklist ---
  Agent: business-analyst
  Score: {scoreDisplay}
  Verdict: {verdict} | Confidence: {confidence}
  Summary: {summary, first 200 chars}
  Red Flags: {count} items

--- Section 3: Moat Checklist ---
  Agent: competitor-evaluator
  Score: {scoreDisplay}
  Verdict: {verdict} | Confidence: {confidence}
  Summary: {summary, first 200 chars}
  Red Flags: {count} items

--- Section 4: Management Checklist ---
  Agent: management-evaluator
  Score: {scoreDisplay}
  Verdict: {verdict} | Confidence: {confidence}
  Summary: {summary, first 200 chars}
  Red Flags: {count} items

--- Section 5: Valuation Confirmation ---
  Agent: valuation-specialist
  Verdict: {verdict} | Confidence: {confidence}
  Summary: {summary, first 200 chars}
  Red Flags: {count} items
  Citations: {count} sources

--- Cross-Cutting Findings ---
  {aggregated crossCuttingFindings from all 5 sections}

================================================================
```

### Conversational Dialogue Loop (D-07)

Enter a dialogue loop with the PM. Print:

```
Review the findings above. You can:
  - Ask a question about any section (the responsible analyst will answer)
  - Say "re-run section X" to regenerate with guidance (uses /generate:section)
  - Say "continue" to assemble the final report
  - Say "stop" to pause generation (progress is saved)

Your input:
```

**Handle PM responses:**

- **Question about a section:** Identify which section using `sectionMapping.fullStory` from `config.json`:
  - S1 -> risk-analyst
  - S2 -> business-analyst
  - S3 -> competitor-evaluator
  - S4 -> management-evaluator
  - S5 -> valuation-specialist
  Dispatch the responsible agent with: the question + original section context + section output. Print the agent's answer.

- **"re-run section X" (with optional guidance):** Invoke `/generate:section {TICKER} fullStory {X} "{guidance}"`. After re-run completes, re-read the updated section file and update the checkpoint display with the new section data.

- **"continue":** Advance to Step 7 (report assembly).

- **"stop":** Save current state. All 5 section files are already saved individually in `.thes1s/reports/{TICKER}/sections/`. The PM can resume later by running `/generate:full-story {TICKER}` again -- the skill should detect existing section files and skip to the checkpoint.

## Step 7: Assemble Final Report (D-08 -- extensible for Phase 14)

Collect all 5 section outputs into the final report.

**Extract checklist scores from section data fields:**
For sections S2, S3, S4, parse the `data` field as JSON and extract `summary.scoreDisplay`:
```javascript
const checklistScores = {};
for (const section of [S2, S3, S4]) {
  try {
    const data = JSON.parse(section.data);
    const type = data.checklistType; // 'meaning', 'moat', or 'management'
    checklistScores[type] = data.summary.scoreDisplay;
  } catch (e) {
    checklistScores[section.key.replace('_checklist', '')] = 'unable to parse';
  }
}
```

**Write report JSON** to `.thes1s/reports/{TICKER}/full-story.json`:

```json
{
  "ticker": "{TICKER}",
  "companyName": "{from DataPacket companyInfo.name or Pitch Deck data}",
  "stage": "fullStory",
  "generatedAt": "{ISO timestamp}",
  "status": "partial",
  "completedSections": 5,
  "totalSections": 6,
  "pendingPhase": "Phase 14 debate (S6 inversion_rebuttal)",
  "sections": [
    { "S1 through S5 ReportSectionSchema objects ordered by sectionNumber" }
  ],
  "checklistScores": {
    "meaning": "{scoreDisplay from S2 data}",
    "moat": "{scoreDisplay from S3 data}",
    "management": "{scoreDisplay from S4 data}"
  },
  "sectionKeys": ["event_analysis", "meaning_checklist", "moat_checklist", "management_checklist", "valuation_confirmation", "inversion_rebuttal"],
  "overallVerdict": null,
  "pitchDeckVerdict": "{verdict from gate check}"
}
```

Note: `overallVerdict` is null because the Full Story verdict requires the complete debate (S6). The `status: "partial"` flag and `pendingPhase` field clearly indicate what is missing.

**Write human-readable markdown** to `.thes1s/reports/{TICKER}/full-story.md`:

Build the markdown report by iterating over all 5 section JSON objects. Apply the following
defensive formatting rules for every field that varies across agents.

**Section Title Resolution (handles title vs sectionTitle vs missing):**

For each section, resolve its display title using this fallback chain:
```
displayTitle = section.title
               || section.sectionTitle (strip any leading "Section N: " prefix if present)
               || derive from sectionKey:
                    event_analysis -> "Event Analysis"
                    meaning_checklist -> "Meaning Checklist"
                    moat_checklist -> "Moat Checklist"
                    management_checklist -> "Management Checklist"
                    valuation_confirmation -> "Valuation Confirmation"
```
Then render: `## Section {N}: {displayTitle}`

**Citation Formatting (handles 4 observed variants):**

For each citation in a section's `citations` array, detect the format and render:

1. If citation is a **plain string**: output the string as-is (it already contains numbering)
2. If citation is an **object with `ref` and `text` fields** (canonical schema):
   output: `{id}. {ref}: {text} ({source})`
3. If citation is an **object with `source` and `detail` fields but NO `ref`**:
   output: `{id}. {source}: {detail}`
4. If citation is an **object with `title` and `detail` fields**:
   output: `{id}. {title} -- {detail} ({url || source})`
5. **Fallback** for any other object shape:
   output: `{id || index+1}. {first-string-valued-field}: {second-string-valued-field}`

Never output raw `[object Object]` or fields that resolve to `undefined`.

**Checklist Item Formatting (handles 2 observed naming conventions):**

Parse `section.data` as JSON. For each item in `data.items`:
```
itemNumber = item.number || item.id || (index + 1)
itemText   = item.item || item.question || "--"
evidence   = item.evidence (truncate to 120 chars + "..." if longer)
```
Render as table row: `| {itemNumber} | {itemText} | {item.verdict} | {evidence} | {item.confidence} |`

**Red Flag Formatting (handles string and object variants):**

For each entry in a section's `redFlags` array:

1. If the entry is a **plain string**: output `- {string}`
2. If the entry is an **object**:
   ```
   flag     = entry.flag || entry.finding || entry.description || JSON.stringify(entry)
   severity = entry.severity ? " [{severity}]" : ""
   ```
   output: `- {flag}{severity}`

Never output `- [object Object]`.

---

**Assembled report structure** (apply the defensive rules above to every section):

```markdown
# Full Story: {companyName} ({TICKER})

**Generated:** {ISO timestamp}
**Status:** PARTIAL (5/6 sections -- S6 Inversion & Rebuttal deferred to Phase 14)
**Pitch Deck Verdict:** {pitchDeckVerdict}

## Checklist Scores

| Checklist    | Score              |
|-------------|---------------------|
| Meaning     | {meaning score}     |
| Moat        | {moat score}        |
| Management  | {management score}  |

---

## Section 1: {displayTitle resolved via fallback chain}
**Verdict:** {verdict} | **Confidence:** {confidence}

{narrative}

**Red Flags:**
{for each redFlag, apply Red Flag Formatting rules above}

**Citations:**
{for each citation, apply Citation Formatting rules above}

---

## Section 2: {displayTitle resolved via fallback chain}
**Verdict:** {verdict} | **Confidence:** {confidence}
**Score:** {scoreDisplay from parsed data.summary.scoreDisplay}

{narrative}

### Checklist Items
| # | Item | Verdict | Evidence | Confidence |
|---|------|---------|----------|------------|
{for each item in parsed data.items, apply Checklist Item Formatting rules above}

**Red Flags:**
{for each redFlag, apply Red Flag Formatting rules above}

**Citations:**
{for each citation, apply Citation Formatting rules above}

---

## Section 3: {displayTitle resolved via fallback chain}
**Verdict:** {verdict} | **Confidence:** {confidence}
**Score:** {scoreDisplay from parsed data.summary.scoreDisplay}

{narrative}

### Checklist Items
| # | Item | Verdict | Evidence | Confidence |
|---|------|---------|----------|------------|
{for each item in parsed data.items, apply Checklist Item Formatting rules above}

**Red Flags:**
{for each redFlag, apply Red Flag Formatting rules above}

**Citations:**
{for each citation, apply Citation Formatting rules above}

---

## Section 4: {displayTitle resolved via fallback chain}
**Verdict:** {verdict} | **Confidence:** {confidence}
**Score:** {scoreDisplay from parsed data.summary.scoreDisplay}

{narrative}

### Checklist Items
| # | Item | Verdict | Evidence | Confidence |
|---|------|---------|----------|------------|
{for each item in parsed data.items, apply Checklist Item Formatting rules above}

**Red Flags:**
{for each redFlag, apply Red Flag Formatting rules above}

**Citations:**
{for each citation, apply Citation Formatting rules above}

---

## Section 5: {displayTitle resolved via fallback chain}
**Verdict:** {verdict} | **Confidence:** {confidence}

{narrative}

**Red Flags:**
{for each redFlag, apply Red Flag Formatting rules above}

**Citations:**
{for each citation, apply Citation Formatting rules above}

---

## Section 6: Inversion & Rebuttal

> S6 Inversion & Rebuttal will be added in Phase 14 (adversarial debate).
> See agents/orchestrator/dispatch-table.json fullStory.phases[1] for the debate structure.
```

Log:
```
Step 7: Report assembled
  Sections: 5/6 (partial -- S6 deferred to Phase 14)
  Checklist Scores:
    Meaning: {scoreDisplay}
    Moat: {scoreDisplay}
    Management: {scoreDisplay}
  Output: .thes1s/reports/{TICKER}/full-story.json
  Output: .thes1s/reports/{TICKER}/full-story.md
```

## Step 8: Phase 2 -- THE DEBATE (Phase 14)

> This section is not yet implemented. Phase 14 will add the 4-step adversarial
> debate (Bull -> Bear -> Bull Rebuttal -> Judge) that produces S6 (inversion_rebuttal).
> Until then, S6 is omitted from the Full Story output.
> The checkpoint after the debate will be added as Step 9.
> See agents/orchestrator/dispatch-table.json fullStory.phases[1] for the debate structure.
> See agents/orchestrator/schemas/debate-step.schema.json for the output format.

---

## Constraints

### Contamination Boundary (CRITICAL)

During generation, NEVER read from any of these paths:
- `knowledge/stage-1-one-pager/examples/`
- `knowledge/stage-2-pitch-deck/examples/`
- `knowledge/stage-3-full-story/examples/`
- `knowledge/pre-course-examples/`

These contain the user's manual research examples used for quality benchmarking. Agents must generate from curriculum + DataPacket + Pitch Deck inheritance alone -- never pattern-match from examples. This is a hard constraint per AGNT-04 and D-13.

### Schema Enforcement

All section outputs MUST conform to ReportSectionSchema from `src/schemas/reportSection.js`. If output is malformed after retry, save with `status: "failed"` and continue. Do NOT abort the pipeline for one section failure.

### Error Resilience

- If the DataPacket file has errors or is missing fields, log them but proceed with available data. Agents can work with Pitch Deck inheritance context alone.
- If some PD sections are missing for inheritance, proceed with whatever context is available. Not all PD sections may exist for every ticker.
- Section saves happen immediately after each dispatch -- before report assembly. Even if assembly fails in Step 7, all completed section files are preserved in `.thes1s/reports/{TICKER}/sections/`.
- Do NOT re-run data preparation (D-09, D-10). The DataPacket is reused as-is from Pitch Deck generation.
- If a section fails after retry, save with `status: "failed"` and continue to the next section. The PM can re-run individual sections at the checkpoint using `/generate:section`.

### Progress Display

Log progress at each major step:
```
Step 1: Validating input and gate check...
Step 2: Loading orchestrator and agent configurations...
Step 3: Preparing Pitch Deck inheritance...
Step 4: Preparing DataPacket slices...
Step 5: Dispatching 5 agents sequentially...
Step 6: CHECKPOINT -- Full Story Deep Analysis Review
Step 7: Assembling final report...
```

### Section Keys Reference

**fullStory** (6 sections -- 5 generated in Phase 13, 1 deferred to Phase 14):
1. event_analysis (risk-analyst)
2. meaning_checklist (business-analyst) -- 15-item scored checklist
3. moat_checklist (competitor-evaluator) -- 15-item scored checklist
4. management_checklist (management-evaluator) -- 13-item scored checklist
5. valuation_confirmation (valuation-specialist)
6. inversion_rebuttal (Phase 14 debate -- synthesis-writer + risk-analyst + financial-analyst)
