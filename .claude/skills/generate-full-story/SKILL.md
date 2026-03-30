# ~~~~
name: generate-full-story
description: Generate a 6-section Rule One Full Story (Stage 3) deep analysis for a given stock ticker, building on Pitch Deck findings with scored checklists and adversarial debate
argument-hint: TICKER
disable-model-invocation: true
~~~~

# Generate Full Story

Generate the Full Story (Stage 3) deep analysis for **$0**, building on existing Pitch Deck findings.

This skill orchestrates 5 specialist agents to produce 5 scored checklists and deep-dive analyses (S1-S5), then runs a 5-step adversarial debate (Bull, Bear, Bull Rebuttal, Judge, Composition) to produce S6 (Inversion & Rebuttal) — 6 sections total. Each agent inherits relevant Pitch Deck findings as context -- they build on prior work, not from scratch.

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

## Step 8: Phase 2 -- THE DEBATE (5 sequential agent calls)

The adversarial debate stress-tests the investment thesis by having Bull, Bear, Bull Rebuttal, and Judge agents argue over the S1-S5 findings. A 5th composition call assembles the dual-view S6 narrative. Each step receives prior step outputs as context -- strictly sequential, no parallelism.

File layout for intermediate outputs:
- `.thes1s/reports/{TICKER}/sections/debate-step-1.json` (Bull thesis)
- `.thes1s/reports/{TICKER}/sections/debate-step-2.json` (Bear inversion)
- `.thes1s/reports/{TICKER}/sections/debate-step-3.json` (Bull rebuttal)
- `.thes1s/reports/{TICKER}/sections/debate-step-4.json` (Judge verdict)
- `.thes1s/reports/{TICKER}/sections/fullStory-S6-inversion_rebuttal.json` (Final composed S6)

**Resume detection:** If `debate-step-4.json` AND `fullStory-S6-inversion_rebuttal.json` already exist in `.thes1s/reports/{TICKER}/sections/`, skip Steps 8a-8e and go directly to Step 9 (checkpoint). This supports the "stop" command at the debate checkpoint -- the PM can resume without re-running the debate.

```
Step 8: THE DEBATE -- 5 sequential agent calls...
```

### Step 8a: Bull Thesis (synthesis-writer)

Read the synthesis-writer agent configuration:
1. `agents/synthesis-writer/config.json` -- model (opus), curriculum, universalContext settings
2. `agents/synthesis-writer/prompt.md` -- full agent prompt (includes "Debate Step 1: Bull Thesis" instructions)
3. Each curriculum file: `knowledge/research-references/buffett-writing-style-guide.md`
4. Universal context files: `knowledge/research-references/rule-one-fundamentals.md` and `knowledge/research-references/tools-for-analysis.md`

Read all 5 completed section outputs for context:
- `.thes1s/reports/{TICKER}/sections/fullStory-S1-event_analysis.json`
- `.thes1s/reports/{TICKER}/sections/fullStory-S2-meaning_checklist.json`
- `.thes1s/reports/{TICKER}/sections/fullStory-S3-moat_checklist.json`
- `.thes1s/reports/{TICKER}/sections/fullStory-S4-management_checklist.json`
- `.thes1s/reports/{TICKER}/sections/fullStory-S5-valuation_confirmation.json`

Build the bull dispatch prompt (concatenate in this order):
1. Agent prompt.md content
2. Curriculum files
3. Universal context files
4. All 5 section outputs as structured context:
   ```
   ## Prior Full Story Sections (S1-S5) -- YOUR SOURCE MATERIAL

   For each section, present: key, verdict, confidence, summary, redFlags, and narrative (first 2000 chars).
   These are the findings you must synthesize into the strongest possible bull case.
   ```
5. Debate step schema definition (BullThesis variant from `agents/orchestrator/schemas/debate-step.schema.json`)
6. Task instruction: "You are the BULL in the adversarial debate for {TICKER}. Synthesize the strongest possible investment case from the S1-S5 findings above. Each thesis point MUST cite the specific section it comes from. Include at least 5 thesis points covering meaning, moat, management, valuation, and events. Output a JSON object with step=1, role='bull', agent='synthesis-writer', and content matching BullThesis format."

Note: synthesis-writer has NO DataPacket slice (empty array in config) -- it works from section outputs only. No web search.

Dispatch via Agent tool.

After completion:
1. Extract JSON from response (look for ```json block or raw JSON object)
2. Validate required fields: step=1, role="bull", agent="synthesis-writer", content.thesisPoints (array with >= 5 items), content.overallThesis (string)
3. Verify each thesis point has: point, evidence, sourceSection
4. Save to `.thes1s/reports/{TICKER}/sections/debate-step-1.json`

Log:
```
Step 8a: Bull Thesis complete
  Thesis points: {count} (minimum 5 required)
  Source sections cited: {unique sourceSection values}
```

### Step 8b: Bear Inversion (risk-analyst) [WEB SEARCH ENABLED]

Read debate-step-1.json:
- Read `.thes1s/reports/{TICKER}/sections/debate-step-1.json`
- Extract the thesisPoints array -- these are the specific targets the Bear will attack

Read the risk-analyst agent configuration:
1. `agents/risk-analyst/config.json` -- model (opus), curriculum, dataPacketSlice, universalContext settings
2. `agents/risk-analyst/prompt.md` -- full agent prompt (includes "Debate Step 2: Bear Inversion" instructions)
3. Each curriculum file: `knowledge/stage-2-pitch-deck/pitch-deck-III.md`, `knowledge/stage-3-full-story/story-form-II.md`, `knowledge/research-references/advanced-financial-analysis.md`, `knowledge/research-references/fgr.md`
4. Universal context files: `knowledge/research-references/rule-one-fundamentals.md` and `knowledge/research-references/tools-for-analysis.md`

Slice the DataPacket for risk-analyst: companyInfo, events, analystEstimates, classification (plus always-include: ticker, caveats).

Build the bear dispatch prompt (concatenate in this order):
1. Agent prompt.md content
2. Sliced DataPacket as fenced JSON code block labeled "DataPacket"
3. Curriculum files
4. Universal context files
5. Bull thesis context:
   ```
   ## Bull Thesis (Step 1 Output -- YOUR TARGET)

   The synthesis-writer produced the following bull case for {TICKER}.
   Your job is to demolish every point with cited evidence.
   Add 1-2 NEW attack vectors the bull conveniently omitted (per D-04).

   {Full JSON content of debate-step-1.json}
   ```
6. Debate step schema definition (BearInversion variant from `agents/orchestrator/schemas/debate-step.schema.json`)
7. Task instruction: "You are the BEAR in the adversarial debate for {TICKER}. You are an activist short seller playing to WIN. Attack every bull thesis point with web-searched, cited evidence. Add 1-2 new attack vectors the bull conveniently omitted. You MUST perform at least 1 web search per bull thesis point PLUS 1-2 broad searches ('{TICKER} short seller thesis', '{TICKER} SEC investigation'). Minimum 7 web searches total. Output a JSON object with step=2, role='bear', agent='risk-analyst', and content matching BearInversion format. Every inversion MUST have a non-empty sources array with full URLs."

Note: The risk-analyst inherits WebSearch and WebFetch tools in CC subagent context.

Dispatch via Agent tool.

After completion:
1. Extract JSON from response
2. Validate required fields: step=2, role="bear", agent="risk-analyst", content.inversions (array, non-empty), content.overallBearCase (string)
3. Verify each inversion has: targetPoint, counterArgument, evidence, severity (one of thesis_killer/significant/minor), sources (array with >= 1 URL)
4. Count total unique URLs across all inversions -- if < 5, log a WARNING: "Bear cited fewer than 5 unique URLs -- debate quality may be compromised"
5. Save to `.thes1s/reports/{TICKER}/sections/debate-step-2.json`

Log:
```
Step 8b: Bear Inversion complete
  Inversions: {count} (attacking {bull_point_count} bull points + {new_count} new vectors)
  Thesis killers: {count matching severity=thesis_killer}
  Sources cited: {total unique URLs across all inversions}
```

### Step 8c: Bull Rebuttal (synthesis-writer)

Read debate-step-1.json and debate-step-2.json from disk.

Read the synthesis-writer agent configuration (same as Step 8a):
1. `agents/synthesis-writer/config.json`
2. `agents/synthesis-writer/prompt.md`
3. Curriculum files: `knowledge/research-references/buffett-writing-style-guide.md`
4. Universal context files: `knowledge/research-references/rule-one-fundamentals.md` and `knowledge/research-references/tools-for-analysis.md`

Read all 5 S1-S5 section outputs for evidence (same files as Step 8a -- the bull_rebuttal needs this to find counter-evidence).

Build the bull rebuttal dispatch prompt (concatenate in this order):
1. Agent prompt.md content
2. Curriculum files
3. Universal context files
4. S1-S5 section summaries (for each: key, verdict, summary, red flags -- NOT full narratives to manage context size):
   ```
   ## Prior Full Story Sections (S1-S5) -- EVIDENCE SOURCE

   For each section, present: key, verdict, summary, and redFlags only.
   Use these findings to build evidence-based rebuttals.
   ```
5. Prior debate context:
   ```
   ## Prior Debate Steps

   ### Step 1: Bull Thesis
   {Full JSON content of debate-step-1.json}

   ### Step 2: Bear Inversion
   {Full JSON content of debate-step-2.json}
   ```
6. Debate step schema definition (BullRebuttal variant from `agents/orchestrator/schemas/debate-step.schema.json`)
7. Task instruction: "You are the BULL REBUTTAL in the adversarial debate for {TICKER}. Address EVERY bear inversion point -- do not skip any. Rate each rebuttal honestly: strong (clear evidence negates the bear), moderate (partially addresses it), weak (bear case is stronger). When the bear case is genuinely strong, set honest=true and acknowledge it. Do not fabricate evidence -- use only S1-S5 findings. Output a JSON object with step=3, role='bull_rebuttal', agent='synthesis-writer', and content matching BullRebuttal format."

No web search. No DataPacket.

Dispatch via Agent tool.

After completion:
1. Extract JSON from response
2. Validate required fields: step=3, role="bull_rebuttal", agent="synthesis-writer", content.rebuttals (array, length >= number of bear inversions)
3. Verify each rebuttal has: bearPoint, rebuttal, rebuttalStrength (one of strong/moderate/weak), honest (boolean)
4. Save to `.thes1s/reports/{TICKER}/sections/debate-step-3.json`

Log:
```
Step 8c: Bull Rebuttal complete
  Rebuttals: {count} (vs {bear_inversion_count} bear points)
  Strength distribution: {strong_count} strong, {moderate_count} moderate, {weak_count} weak
  Honest acknowledgments: {count where honest=true}
```

### Step 8d: Judge Verdict (financial-analyst)

Read debate-step-1.json, debate-step-2.json, and debate-step-3.json from disk.

Read the financial-analyst agent configuration:
1. `agents/financial-analyst/config.json` -- model (sonnet), curriculum, dataPacketSlice, universalContext settings
2. `agents/financial-analyst/prompt.md` -- full agent prompt (includes "Debate Step 4: Judge Verdict" instructions)
3. Each curriculum file: `knowledge/research-references/advanced-financial-analysis.md`, `knowledge/research-references/fgr.md`, `knowledge/research-references/capex-cash-flow-explained.md`
4. Universal context files: `knowledge/research-references/rule-one-fundamentals.md` and `knowledge/research-references/tools-for-analysis.md`

Slice the DataPacket for financial-analyst: financials, ttm, growthRates, returnMetrics, debtMetrics, fcf, keyMetrics (plus always-include: ticker, companyInfo, classification, caveats).

Build the judge dispatch prompt (concatenate in this order):
1. Agent prompt.md content
2. Sliced DataPacket as fenced JSON code block labeled "DataPacket"
3. Curriculum files
4. Universal context files
5. S1-S5 section summaries (key, verdict, summary -- brief, for reference only)
6. All 3 prior debate step outputs:
   ```
   ## The Debate (Steps 1-3 -- YOUR EVIDENCE TO EVALUATE)

   ### Step 1: Bull Thesis
   {Full JSON content of debate-step-1.json}

   ### Step 2: Bear Inversion
   {Full JSON content of debate-step-2.json}

   ### Step 3: Bull Rebuttal
   {Full JSON content of debate-step-3.json}
   ```
7. Debate step schema definition (JudgeVerdict variant from `agents/orchestrator/schemas/debate-step.schema.json`)
8. Task instruction: "You are the JUDGE in the adversarial debate for {TICKER}. Score EVERY exchange between bull and bear. For each exchange, assess bullStrength and bearStrength (strong/moderate/weak) and produce a verdict (Strong Bull / Strong Bear / Unresolved) with reasoning citing specific evidence each side presented. Produce an overallVerdict with direction (Bull/Bear/Mixed), unresolvedCount, summary, and investmentImplication. Be genuinely neutral -- if the bear has stronger evidence, say so. Output a JSON object with step=4, role='judge', agent='financial-analyst', and content matching JudgeVerdict format."

No web search.

Dispatch via Agent tool.

After completion:
1. Extract JSON from response
2. Validate required fields: step=4, role="judge", agent="financial-analyst", content.exchanges (array, non-empty), content.overallVerdict (object with direction, unresolvedCount, summary, investmentImplication)
3. Verify each exchange has: topic, bullStrength, bearStrength, verdict (one of "Strong Bull"/"Strong Bear"/"Unresolved"), reasoning
4. Save to `.thes1s/reports/{TICKER}/sections/debate-step-4.json`

Log:
```
Step 8d: Judge Verdict complete
  Exchanges scored: {count}
  Verdicts: {Strong Bull count} Strong Bull, {Strong Bear count} Strong Bear, {Unresolved count} Unresolved
  Overall direction: {direction}
  Unresolved risks: {unresolvedCount}
```

### Step 8e: Composition (synthesis-writer)

Read all 4 debate step files from disk:
- `.thes1s/reports/{TICKER}/sections/debate-step-1.json` (Bull)
- `.thes1s/reports/{TICKER}/sections/debate-step-2.json` (Bear)
- `.thes1s/reports/{TICKER}/sections/debate-step-3.json` (Bull Rebuttal)
- `.thes1s/reports/{TICKER}/sections/debate-step-4.json` (Judge)

Read S1-S5 section summaries for reference (key + verdict + summary only -- context management).

Read the synthesis-writer agent configuration (same as Steps 8a/8c):
1. `agents/synthesis-writer/config.json`
2. `agents/synthesis-writer/prompt.md`
3. Curriculum files: `knowledge/research-references/buffett-writing-style-guide.md`
4. Universal context files: `knowledge/research-references/rule-one-fundamentals.md` and `knowledge/research-references/tools-for-analysis.md`

Build the composition dispatch prompt (concatenate in this order):
1. Agent prompt.md content
2. Curriculum files
3. Universal context files
4. S1-S5 brief summaries (key + verdict + summary only -- context management)
5. All 4 debate step outputs in full:
   ```
   ## Complete Debate Record (Steps 1-4)

   ### Step 1: Bull Thesis
   {Full JSON content of debate-step-1.json}

   ### Step 2: Bear Inversion
   {Full JSON content of debate-step-2.json}

   ### Step 3: Bull Rebuttal
   {Full JSON content of debate-step-3.json}

   ### Step 4: Judge Verdict
   {Full JSON content of debate-step-4.json}
   ```
6. ReportSectionSchema definition from `src/schemas/reportSection.js`
7. Composition task instruction:
   ```
   ## Composition Task

   You are composing the final Inversion & Rebuttal section (S6) of the Full Story for {TICKER}.

   Produce a ReportSectionSchema JSON object with:
   - key: "inversion_rebuttal"
   - sectionNumber: 6
   - title: "Inversion & Rebuttal"
   - verdict: derive from Judge's overallVerdict.direction (Bull -> "PASS", Bear -> "FAIL", Mixed -> "WATCHLIST")
   - verdictRationale: condensed from judge.overallVerdict.summary
   - confidence: derive from unresolvedCount (0-1 -> "HIGH", 2-3 -> "MEDIUM", 4+ -> "LOW")
   - summary: 1-2 sentence summary of debate outcome
   - redFlags: extract from bear inversions with severity=thesis_killer or significant
   - citations: merge ALL bear source URLs (FULL clickable URLs) + DataPacket references from all steps

   The narrative MUST use a DUAL-VIEW format:

   ### View 1: Verdict Summary Table (TOP of narrative)
   Create a markdown table: | # | Topic | Verdict | Bull Strength | Bear Strength |
   Populate from Judge's exchanges array. Below the table add:
   - **Overall Direction:** {from judge.overallVerdict.direction}
   - **Unresolved Risks:** {from judge.overallVerdict.unresolvedCount}
   - **Investment Implication:** {from judge.overallVerdict.investmentImplication}

   ### View 2: Exchange Detail (BELOW the table)
   For each exchange (match by position -- exchange #1 = bull point #1 = bear inversion #1, etc.):
   1. **Bull:** thesis point with evidence and source section
   2. **Bear:** counter-argument with ALL URLs from the bear's sources array as CLICKABLE LINKS -- never drop a URL
   3. **Bull Rebuttal:** rebuttal text with strength rating. If honest=true, note: "The bull acknowledges this bear point as stronger."
   4. **Judge Verdict:** verdict and reasoning

   Bear's extra attack vectors (1-2 new vectors per D-04) appear at the end with no corresponding original bull point -- just Bear + Rebuttal + Judge for those.

   Output ONLY the JSON object, no surrounding text.
   ```

Dispatch via Agent tool.

After completion:
1. Extract JSON from response
2. Validate ReportSectionSchema fields: key="inversion_rebuttal", sectionNumber=6, title, verdict (PASS/FAIL/WATCHLIST), confidence, summary, narrative (>= 500 chars), citations (array), redFlags (array)
3. Count URLs in narrative -- compare against total URLs in debate-step-2.json sources arrays. If narrative URL count < 50% of bear source URLs, log WARNING: "Composition may have dropped bear citations -- verify S6 narrative"
4. Save to `.thes1s/reports/{TICKER}/sections/fullStory-S6-inversion_rebuttal.json`
5. If validation fails, retry once with error details. If retry also fails, save with status="failed" and continue.

Log:
```
Step 8e: S6 Composition complete
  Verdict: {verdict} | Confidence: {confidence}
  Narrative: {length} chars (dual-view format)
  Citations: {count} sources
  Red Flags: {count} items

Step 8: DEBATE COMPLETE
  Total debate calls: 5
  Bull points: {count} | Bear inversions: {count} | Rebuttals: {count}
  Judge: {direction} ({unresolvedCount} unresolved)
  S6 verdict: {verdict}
```

### Debate Error Handling

If any debate step fails (JSON parsing or validation) after 1 retry:
- Save with step number, role, and error details to the expected file path
- Print WARNING but continue to next step
- If step 1 (bull) fails, the debate cannot proceed -- print error and leave S6 as placeholder
- If step 2-4 fail, downstream steps that depend on the failed step also cannot proceed
- If step 5 (composition) fails, the 4 debate step files are still saved -- PM can re-run composition at checkpoint

## Step 9: Debate Checkpoint -- Review Debate Results

Read the Judge verdict from `.thes1s/reports/{TICKER}/sections/debate-step-4.json` and the composed S6 from `.thes1s/reports/{TICKER}/sections/fullStory-S6-inversion_rebuttal.json`.

Print the checkpoint display:

```
================================================================
  DEBATE CHECKPOINT: Inversion & Rebuttal (S6)
================================================================

Overall Verdict: {overallVerdict.direction} ({overallVerdict.unresolvedCount} unresolved risks)
Investment Implication: {overallVerdict.investmentImplication}

--- Exchange Summary ---

  #1 {exchanges[0].topic}: {exchanges[0].verdict}
  #2 {exchanges[1].topic}: {exchanges[1].verdict}
  ... (one line per exchange)

--- S6 Section ---
  Verdict: {S6 verdict} | Confidence: {S6 confidence}
  Narrative: {S6 narrative length} chars

================================================================

Review the debate results. You can:
  - Type an exchange number (e.g., "3") to see the full exchange detail
  - Say "re-run from bull" to restart the entire debate (5 agent calls)
  - Say "re-run from bear" to re-run bear + rebuttal + judge + composition (4 calls)
  - Say "re-run from rebuttal" to re-run rebuttal + judge + composition (3 calls)
  - Say "re-run judge" to re-run judge + composition (2 calls)
  - Say "re-run composition" to re-run just the composition (1 call)
  - Add guidance: "re-run from bear: focus on tariff risk and supply chain"
  - Add a file: "re-run from bear with file: ~/Desktop/short-report.pdf"
  - Say "continue" to accept and assemble the final report
  - Say "stop" to pause (all debate step files are already saved)

Your input:
```

### PM Dialogue Loop

Enter a dialogue loop. Handle PM responses:

**Exchange drill-down (number, e.g., "1", "3", "exchange 2"):**

Read the corresponding exchange from debate-step-4.json (Judge's exchanges array). Also read the matching entries from debate-step-1.json (bull thesis point), debate-step-2.json (bear inversion), and debate-step-3.json (bull rebuttal) -- matching by position index. Display the full exchange detail:

```
--- Exchange {N}: {topic} ---

BULL: {thesisPoints[N-1].point}
Evidence: {thesisPoints[N-1].evidence}
Source: {thesisPoints[N-1].sourceSection}

BEAR: {inversions[N-1].counterArgument}
Evidence: {inversions[N-1].evidence}
Severity: {inversions[N-1].severity}
Sources: {inversions[N-1].sources joined with newlines}

BULL REBUTTAL: {rebuttals[N-1].rebuttal}
Strength: {rebuttals[N-1].rebuttalStrength}
{If rebuttals[N-1].honest == true: "** Bull acknowledges bear is stronger on this point **"}

JUDGE: {exchanges[N-1].verdict}
Bull strength: {exchanges[N-1].bullStrength} | Bear strength: {exchanges[N-1].bearStrength}
Reasoning: {exchanges[N-1].reasoning}
```

Note: Bear's extra attack vectors (those beyond the original bull thesis points) will have index > bull thesis points count. For these, show "BULL: (none -- bear-initiated attack vector)" instead of the bull thesis point.

After displaying, return to the dialogue prompt.

**Re-run from step ("re-run from {step}" with optional guidance and file):**

Parse the PM's request:
1. Extract target step name: "bull" -> step 1, "bear" -> step 2, "rebuttal" -> step 3, "judge" -> step 4, "composition" -> step 5
2. Extract optional guidance text: anything after ":" that is not "with file:"
   Example: "re-run from bear: focus on regulatory risk" -> guidance = "focus on regulatory risk"
3. Extract optional file path: text after "with file:"
   Example: "re-run from bear with file: ~/Desktop/short-report.pdf" -> filePath = "~/Desktop/short-report.pdf"

If a file path was provided:
- Read the file content using the Read tool
- Store as pmSourceMaterial for injection into the targeted step's prompt

Determine the execution range: from target step through step 5 (composition). Re-run cascade table:

| Re-run from     | Steps executed | Agent calls |
|-----------------|----------------|-------------|
| bull (1)        | 1, 2, 3, 4, 5 | 5 calls     |
| bear (2)        | 2, 3, 4, 5    | 4 calls     |
| rebuttal (3)    | 3, 4, 5       | 3 calls     |
| judge (4)       | 4, 5          | 2 calls     |
| composition (5) | 5              | 1 call      |

For each step in the execution range:
- Read the agent config for this step's agent (same configs as Step 8)
- Build the prompt following the same pattern as the corresponding Step 8 sub-step above
- For prior debate steps that are NOT in the re-run range, read their existing files from disk (they are preserved from the previous run)
- For the TARGETED step only (the one the PM named): inject PM guidance and file content into the prompt:

  ```
  ## PM RE-RUN GUIDANCE

  The Portfolio Manager has requested this debate step be re-run with the following direction:

  {PM guidance text}

  ## PM-PROVIDED SOURCE MATERIAL

  {File contents read from the provided path}

  Incorporate this guidance and source material into your analysis. The PM has
  specifically chosen to provide this -- it overrides your default research scope
  for this step.
  ```

- Dispatch the agent
- Validate output (same validation as Step 8)
- Save to debate-step-{N}.json (OVERWRITES the previous run's file)
- Log progress for each re-run step

After all steps in the re-run range complete:
- Re-display the debate checkpoint with updated results (re-read all debate step files from disk)
- Return to the dialogue prompt

**"continue":**

Exit the dialogue loop, advance to Step 10 (final assembly update).

**"stop":**

Print "Debate paused. All step files saved. Resume with /generate:full-story {TICKER}" and stop execution.

When the skill is re-invoked, existing debate step files are detected at the top of Step 8 (resume detection) and execution skips directly to Step 9 (this checkpoint).

## Step 10: Final Report Assembly Update

After the PM says "continue" at the debate checkpoint. This step updates the existing full-story.json and full-story.md to include S6 and mark the report as complete. It does NOT rebuild from scratch.

1. Read `fullStory-S6-inversion_rebuttal.json` from `.thes1s/reports/{TICKER}/sections/fullStory-S6-inversion_rebuttal.json`.

2. Read `full-story.json` from `.thes1s/reports/{TICKER}/full-story.json`.

3. Insert S6 into the sections array (append as the 6th element).

4. Update fields:
   - `status`: "partial" -> "complete"
   - `completedSections`: 5 -> 6
   - Remove `pendingPhase` field
   - Set `overallVerdict` based on Judge's verdict logic:
     - **PASS**: overallVerdict.direction is "Bull" AND unresolvedCount <= 2 AND no thesis_killer bear points survived with Strong Bear verdict
     - **FAIL**: overallVerdict.direction is "Bear" OR unresolvedCount >= 4 OR any thesis_killer survived as Strong Bear
     - **WATCHLIST**: overallVerdict.direction is "Bull" or "Mixed" with unresolvedCount == 3

5. Write updated `full-story.json`.

6. Read `full-story.md` from `.thes1s/reports/{TICKER}/full-story.md`.

7. Replace the S6 placeholder text:
   ```
   ## Section 6: Inversion & Rebuttal

   > S6 Inversion & Rebuttal will be added in Phase 14 (adversarial debate).
   > See agents/orchestrator/dispatch-table.json fullStory.phases[1] for the debate structure.
   ```
   With the actual S6 content:
   ```
   ## Section 6: Inversion & Rebuttal
   **Verdict:** {verdict} | **Confidence:** {confidence}

   {S6 narrative -- the full dual-view format with verdict table + exchange detail}

   **Red Flags:**
   {for each redFlag, apply Red Flag Formatting rules from Step 7}

   **Citations:**
   {for each citation, apply Citation Formatting rules from Step 7}
   ```

8. Update the header line from "PARTIAL (5/6 sections)" to "COMPLETE (6/6 sections)".

9. Add an overall verdict line after the header: "**Overall Verdict:** {overallVerdict}"

10. Write updated `full-story.md`.

Log:
```
Step 10: Final report assembly updated
  Status: complete (6/6 sections)
  Overall Verdict: {overallVerdict}
  Output: .thes1s/reports/{TICKER}/full-story.json
  Output: .thes1s/reports/{TICKER}/full-story.md
```

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
Step 7: Assembling partial report (5/6 sections)...
Step 8: THE DEBATE -- 5 sequential agent calls...
Step 9: DEBATE CHECKPOINT -- Review debate results
Step 10: Final assembly update (6/6 sections, overall verdict)
```

### Section Keys Reference

**fullStory** (6 sections):
1. event_analysis (risk-analyst)
2. meaning_checklist (business-analyst) -- 15-item scored checklist
3. moat_checklist (competitor-evaluator) -- 15-item scored checklist
4. management_checklist (management-evaluator) -- 13-item scored checklist
5. valuation_confirmation (valuation-specialist)
6. inversion_rebuttal (debate: synthesis-writer bull/rebuttal/composition + risk-analyst bear + financial-analyst judge)
