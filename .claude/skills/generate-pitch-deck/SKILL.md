# ~~~~
name: generate-pitch-deck
description: Generate a 10-section Rule One Pitch Deck for a given stock ticker with 3-phase dispatch, PSR pre-processing, conversational checkpoints, and FGR derivation
argument-hint: TICKER
disable-model-invocation: true
~~~~

# Generate Pitch Deck

Generate a complete 10-section Rule One Pitch Deck investment analysis for **$0**.

This is a multi-phase orchestration pipeline that coordinates 10+ agent calls across 3 generation phases, preceded by Primary Source Reading (annual + quarterly), with Portfolio Manager interaction at 3 structured checkpoints, and an FGR derivation sub-workflow.

---

## Step 1: Validate Input, Gate Check, and Set Up

The ticker symbol is `$0`. Uppercase it and store as `TICKER`.

- If `$0` is empty, print usage: `/generate:pitch-deck TICKER` and stop.
- Create output directories:
  - `.thes1s/reports/{TICKER}/`
  - `.thes1s/reports/{TICKER}/sections/`
  - `.thes1s/reports/{TICKER}/quality/`

**Gate Check (CRITICAL):** Read `.thes1s/reports/{TICKER}/one-pager.json`. Verify:
1. The file exists
2. Parse it and check that `overallVerdict` is set (not null, not undefined)

If either check fails, print:
```
Gate check FAILED: One Pager must be completed and have a verdict before generating a Pitch Deck.
Run /generate:one-pager {TICKER} first.
```
And **stop execution**. The Pitch Deck builds on One Pager findings -- skipping gates violates the research methodology.

If the gate passes, log:
```
Step 1: Gate check PASSED -- One Pager verdict: {verdict}
Setting up Pitch Deck generation for {TICKER}...
```

Store the one-pager data for later reference -- Phase 3 agents may reference One Pager findings.

**Initialize Generation Status (D-07-a):**
```bash
node --import ./scripts/node-esm-loader.js -e "
import { initGenerationStatus } from './src/engines/progressState.js';
initGenerationStatus('{TICKER}', 'pitchDeck');
console.log('Generation status initialized for {TICKER}');
"
```

## Step 2: Assemble DataPacket

Run the data assembly script to gather all financial data:

```bash
node --loader ./scripts/node-esm-loader.js scripts/assemble-data.js {TICKER}
```

Note: The `--loader` flag is required because engine files use Vite-style extension-less imports and bare JSON imports that Node.js native ESM does not support without a custom resolver.

Then read the output file: `.thes1s/reports/{TICKER}/data-packet.json`

If the DataPacket has an `errors` array, log each error but **continue** -- the error-resilient design means partial data is expected and analysts should work with what is available.

Verify the DataPacket has a `ticker` field and at least `companyInfo` or `financials` populated. If both are null, stop with an error -- there is insufficient data to generate an analysis.

Log:
```
Step 2: DataPacket assembled for {TICKER}
  Company: {companyInfo.name}
  Financials: {number of years} years
  Errors: {count or "none"}
```

## Step 2.1: Pre-Fetch Guru Holdings

Fetch all 43 guru 13F portfolios so the DataPacket `gurus` field is populated. This is a one-time fetch per ticker — results are cached in `.thes1s/cache/` for future runs.

```bash
node --loader ./scripts/node-esm-loader.js scripts/prefetch-gurus.js {TICKER}
```

If the guru fetch fails or times out, log the error and **continue** — guru data is useful context for the management-evaluator agent but not required. The agent will use WebSearch to find guru holdings if the DataPacket field is null.

After guru fetch, re-run the DataPacket assembly to pick up the cached guru data:

```bash
node --loader ./scripts/node-esm-loader.js scripts/assemble-data.js {TICKER}
```

Log the updated field count to confirm guru data is now included.

## Step 2.5: Pre-Process Filings to Markdown

Convert the most recent 10-K and 10-Q filings to clean markdown BEFORE dispatching PSR agents. This eliminates the need for agents to fetch raw HTML from EDGAR (which wastes 100-200K+ tokens per filing) and provides structured sections they can read directly.

```bash
node --loader ./scripts/node-esm-loader.js scripts/preprocess-filings.js {TICKER}
```

The pre-processed filings are now in `.thes1s/reports/{TICKER}/filings-md/`. Each JSON file contains extracted sections as markdown text. 10-K files extract Business, Risk Factors, MD&A, and Financial Statements (4 sections). 10-Q files extract Financial Statements, MD&A, and Risk Factors (3 sections). Filenames use full filing dates (e.g., `10-K-2024-09-15.json`, `10-Q-2024-07-30.json`) to prevent collisions. PSR agents should READ these files instead of fetching raw HTML from EDGAR.

If `filingSections.js` is not yet available (Phase 06.1-02 dependency), skip this step -- PSR agents will fall back to web-fetching filings directly. The pipeline works either way, but pre-processing saves significant tokens.

## Step 2.6: Data Quality Checkpoint

Run the data quality checkpoint to verify DataPacket completeness and filing extraction results before dispatching expensive PSR agents:

```bash
node --loader ./scripts/node-esm-loader.js scripts/data-quality-checkpoint.js {TICKER}
```

The script outputs a structured summary to stderr (human-readable table) and JSON to stdout (machine-parseable).

**If the script exits with code 1 (BLOCKED):** Critical fields are missing (companyInfo, financials, or filings). Do NOT proceed to Step 3. Instead:
1. Print the full checkpoint summary for the PM
2. Ask: "Critical data is missing. Would you like to:
   (a) Provide file paths or paste data to fill gaps
   (b) Re-run data assembly (scripts/assemble-data.js)
   (c) Abort generation"
3. If PM provides file paths, read those files and include their content as supplementary context for agents
4. If PM pastes text, save it to `.thes1s/reports/{TICKER}/pm-supplementary.md` and include in agent context
5. After gap-fill, re-run the checkpoint to verify

**If the script exits with code 0 (PROCEED):** Print the full summary for the PM. **Do NOT auto-continue.** Even when the verdict is PROCEED, the PM must explicitly approve before agents are dispatched. This is a mandatory gate -- agents are expensive and the PM deserves to see what data they will work with.

Print the summary, then enter a dialogue:

```
Review the data quality summary above. You can:
  - Say "continue" to approve and dispatch PSR agents
  - Say "re-run assembly" to re-assemble the DataPacket (e.g., after fixing an API key)
  - Paste additional data or context to supplement gaps
  - Say "attach /path/to/file.md" to include a file in agent context
  - Ask a question about any field or error

Your input:
```

**Handle PM responses:**
- **"continue":** Save any supplementary context and advance to Step 3.
- **"re-run assembly":** Re-run `scripts/assemble-data.js {TICKER}`, then re-run the checkpoint. Present the updated summary to PM again.
- **Pasted data or "attach" command:** Save to `.thes1s/reports/{TICKER}/pm-supplementary.md` and include in agent context. Acknowledge and re-present the dialogue.
- **Question:** Answer using the checkpoint data and DataPacket contents.

The checkpoint ensures transparent degradation (per D-13): every missing field is visible, the PM decides whether gaps are acceptable, and agents receive the fullest possible context. **The orchestrator never decides on the PM's behalf.**

Log:
```
Step 2.6: Data quality checkpoint for {TICKER}
  DataPacket: {populated}/{total} fields
  Filings: {tenKCount} 10-Ks, {tenQCount} 10-Qs processed
  Verdict: PROCEED / BLOCKED
  [WAITING FOR PM APPROVAL]
```

## Step 3: Pre-Processing -- Primary Source Reading (Annual + Quarterly)

This step dispatches multiple PSR agents to read SEC filings. These findings become the evidential backbone for all downstream generation agents. **Every section of every filing is read -- nothing is skipped.** Financial Statements are critical for cross-validating the DataPacket against actual SEC-reported values (catches XBRL normalization errors).

### Architecture: One Agent Per 10-K, Batched 10-Qs

A single 10-K with all sections (Business, Risk Factors, MD&A, Financial Statements) is ~290KB (~72K tokens). Cramming multiple 10-Ks into one agent would force skipping sections. Instead:

- **Annual Readers:** One Opus agent per 10-K filing year (e.g., 5 agents for 5 10-Ks)
- **Quarterly Readers:** Batch 4 10-Qs per agent (~70-100KB each, ~280-400KB total per batch)
- Each agent receives the **complete filing** -- all sections, no truncation

This ensures:
1. Every section of every filing is read thoroughly
2. Financial Statements are cross-validated against the DataPacket for every year
3. No token pressure forces the agent to summarize or skip

### 3a: Read PSR Agent Configurations

Read both agent configurations:
- `agents/annual-reader/config.json` + `agents/annual-reader/prompt.md`
- `agents/quarterly-reader/config.json` + `agents/quarterly-reader/prompt.md`

For each agent, also read:
- Curriculum files listed in `config.json` `curriculum` array
- Universal context files from `config.json` `universalContextFiles` array

### 3b: Prepare DataPacket Slices for PSR Agents

For each PSR agent, extract only the fields listed in `config.json` `dataPacketSlice`:

- **Annual Reader** receives: `companyInfo`, `classification`, `financials`, `ttm`, `filings`
- **Quarterly Reader** receives: `companyInfo`, `classification`, `financials`, `ttm`, `filings`, `transcripts`

Always include regardless of config: `ticker`, `companyInfo`, `classification`, `caveats`

**Per-year DataPacket slice for annual readers:** Each annual reader agent only needs the financial data for its year (plus prior year for comparison). Extract `financials.income[year]`, `financials.balance[year]`, `financials.cashFlow[year]` for the filing year and the prior year. This keeps the DataPacket slice small and focused.

### 3c: Dispatch Annual Reader Agents (One Per 10-K)

**⚠️ RAM constraint:** Agents are dispatched one at a time to stay within 8GB RAM. Production `aiResearch.js` will use parallel API calls.

**Start progress tracking for PSR phase:**
```bash
node --import ./scripts/node-esm-loader.js -e "
import { updateGenerationStatus } from './src/engines/progressState.js';
updateGenerationStatus('{TICKER}', { state: 'PRIMARY_SOURCE_READING', currentAgent: 'annual-reader' });
"
```

**Identify all 10-K filings** from `.thes1s/reports/{TICKER}/filings-md/`. Sort chronologically, oldest first. For each 10-K file:

1. Read the pre-processed filing JSON (e.g., `10-K-2022-02-24.json`)
2. Include **ALL sections** in the agent prompt: Business, Risk Factors, MD&A, Financial Statements (and Footnotes if present)
3. Extract the DataPacket financial data for that filing's fiscal year (+ prior year for comparison)
4. Dispatch the agent

**Per-year Annual Reader prompt content** (concatenated in this order):
1. The agent's `prompt.md` content
2. Universal context file contents
3. The per-year DataPacket slice as a fenced JSON code block
4. **All sections from that year's 10-K filing** formatted as:
```
## 10-K Filing: FY{year} (filed {date})

### Business Description
{sections.Business}

### Risk Factors
{sections['Risk Factors']}

### MD&A
{sections['MD&A']}

### Financial Statements
{sections['Financial Statements']}
```
5. If this is NOT the first year, include a brief summary of the prior year's key findings (from the previous agent's output) so the agent can identify year-over-year changes.
6. Task instruction: "Read {TICKER}'s FY{year} 10-K filing provided below. This is year {N} of {total} in the chronological reading sequence. ALL filing sections are included -- read every section thoroughly. Extract: (1) Business model changes from prior year, (2) New/changed/removed risk factors, (3) Management's discussion of financial performance, (4) Financial data cross-validation against DataPacket values for this year -- compare EVERY financial metric (revenue, net income, EPS, total debt, total assets, free cash flow, shares outstanding) and flag discrepancies with severity (low <1%, medium 1-5%, high >5%), (5) Acquisition disclosures, (6) Key management promises and strategic priorities. The SEC filing is the source of truth -- if a value differs from the DataPacket, the SEC value wins. Return your findings as a structured JSON object matching the annual-reader output schema."

**Dispatch sequentially, oldest first.** After each agent completes, extract its output and pass a brief summary to the next year's agent as `priorYearContext`.

Log:
```
Step 3: Dispatching annual reader agents (1 per 10-K, oldest first)...
  Annual Reader FY{year1}: 10-K {date1} (~{size}KB, all sections)
  Annual Reader FY{year2}: 10-K {date2} (~{size}KB, all sections)
  ...
```

### 3d: Dispatch Quarterly Reader Agents (Batched)

After all annual readers complete, dispatch quarterly reader agents. Batch up to 4 10-Qs per agent to keep total context manageable (~280-400KB per batch).

**Identify all 10-Q filings** from `.thes1s/reports/{TICKER}/filings-md/`. Sort chronologically, oldest first. Split into batches of 4.

**Per-batch Quarterly Reader prompt content:**
1. The agent's `prompt.md` content
2. Universal context file contents
3. The DataPacket slice (TTM + relevant quarterly financial data)
4. **All sections from each 10-Q in the batch** formatted as:
```
## 10-Q Filing: Q{N} FY{year} (filed {date})

### Financial Statements
{sections['Financial Statements']}

### MD&A
{sections['MD&A']}

### Risk Factors
{sections['Risk Factors']}
```
5. Annual reader findings summary (key insights, discrepancies found, management promises)
6. Task instruction: "Read {TICKER}'s quarterly SEC filings (10-Q) provided below, covering Q{start} through Q{end}. ALL filing sections are included -- read every section thoroughly. For each quarter extract: revenue and earnings trends, management guidance changes, competitive dynamics, forward-looking statements, red flags, and cross-validate quarterly financial data against the DataPacket. Track management promises and their fulfillment across quarters. Return your findings as a structured JSON object matching the quarterly-reader output schema."

Log:
```
  Quarterly Reader Batch 1: Q{start}-Q{end} (~{size}KB, all sections)
  Quarterly Reader Batch 2: Q{start}-Q{end} (~{size}KB, all sections)
```

### 3e: Collect and Save PSR Outputs

After all PSR agents complete:

1. Parse structured JSON from each agent's response
2. Validate that each output has the expected top-level fields

**JSON Output Extraction (Fallback - D-02-a, D-03-a):**
After each PSR agent completes, extract JSON from the agent's response:
1. Look for a JSON code block (```json ... ```) in the agent's response text
2. If found, extract the JSON content and write it using Bash:
```bash
cat << 'SECTION_EOF' > .thes1s/reports/{TICKER}/sections/{key}.json
{extracted JSON}
SECTION_EOF
```
3. If no JSON block found, create a minimal output with the agent's response as narrative text

**Retry Logic (D-02-d):**
If a PSR agent fails entirely (rate limit, timeout, or error), retry ONCE after a 30-second wait:
```bash
sleep 30
```
Then re-dispatch the agent with the same prompt. If the retry also fails, log the error and continue -- downstream agents will work with DataPacket data alone.

3. **Merge annual reader outputs** into a single `annual-reader-insights.json`:
   - Combine all per-year `yearlyInsights` into one chronological array
   - Aggregate all `discrepancies` across years
   - Compile `strategicThemes` from multi-year patterns
   - Collect all `managementPromises`
   - Write to `.thes1s/reports/{TICKER}/sections/annual-reader-insights.json`

4. **Merge quarterly reader outputs** into a single `quarterly-reader-insights.json`:
   - Combine all per-batch `quarterlyInsights` into one chronological array
   - Aggregate `discrepancies`, `analystConcerns`, `guidanceEvolution`
   - Write to `.thes1s/reports/{TICKER}/sections/quarterly-reader-insights.json`

5. Merge into a combined `psrFindings` object for downstream agents:

```json
{
  "annualInsights": { /* merged annual-reader output */ },
  "quarterlyInsights": { /* merged quarterly-reader output */ },
  "discrepancies": [ /* combined from all agents */ ],
  "managementPromises": [ /* from annual-readers */ ],
  "guidanceEvolution": { /* from quarterly-readers */ },
  "recentMomentum": "..."
}
```

If a PSR agent fails entirely, log the error and continue with whatever output was produced. Partial PSR findings are still valuable -- downstream agents can work with incomplete primary source data.

Log:
```
Step 3: PSR complete
  Annual Readers: {agentCount} agents, {yearCount} years analyzed, {discrepancyCount} discrepancies found
  Quarterly Readers: {agentCount} agents, {quarterCount} quarters analyzed
  Combined discrepancies: {totalDiscrepancies}
  Total filing sections read: {sectionCount} (0 skipped)
```

## Step 4: Read Agent Configurations

Read the dispatch table and all agent configurations for the Pitch Deck pipeline:

1. Read `agents/orchestrator/dispatch-table.json` -- extract the `pitchDeck` configuration for phase structure, agent assignments, checkpoint rules, and section keys.

2. Read `agents/orchestrator/config.json` -- extract the `sectionMapping.pitchDeck` for routing section questions to responsible agents at checkpoints.

3. For each agent referenced in the pitchDeck dispatch table (`business-analyst`, `competitor-evaluator`, `financial-analyst`, `management-evaluator`, `risk-analyst`, `valuation-specialist`, `synthesis-writer`), read:
   - `agents/{agent-name}/config.json` -- for model, curriculum, dataPacketSlice, tools, universalContext settings
   - `agents/{agent-name}/prompt.md` -- the agent's full system prompt

4. Read each agent's curriculum files (listed in `config.json` `curriculum` array). These are the Rule One methodology files that ground each agent's analysis.

5. For agents with `universalContext: true`, also read the universal context files listed in `config.json` `universalContextFiles` array (typically `knowledge/research-references/rule-one-fundamentals.md` and `knowledge/research-references/tools-for-analysis.md`).

6. Read the ReportSectionSchema definition from `src/schemas/reportSection.js` -- extract the JSON Schema structure that all section outputs must conform to.

Log:
```
Step 4: Agent configurations loaded
  Agents: business-analyst, competitor-evaluator, financial-analyst, management-evaluator, risk-analyst, valuation-specialist, synthesis-writer
  Section keys: radar, simple_predictable, market_position, barriers_moats, fcf, management, roe_roic_debt, balance_sheet, pest, valuation
```

## Step 5: Phase 1 -- Business Fundamentals (Parallel Dispatch)

**Update phase status:**
```bash
node --import ./scripts/node-esm-loader.js -e "
import { updatePhaseStatus, startSection } from './src/engines/progressState.js';
updatePhaseStatus('{TICKER}', 1, 'active');
startSection('{TICKER}', 'radar', 'business-analyst');
startSection('{TICKER}', 'simple_predictable', 'business-analyst');
startSection('{TICKER}', 'market_position', 'competitor-evaluator');
"
```

Prepare DataPacket slices for Phase 1 agents. For each agent, extract only the fields from `config.json` `dataPacketSlice`. Always include: `ticker`, `companyInfo`, `classification`, `caveats`.

### Standardized Prompt Assembly (D-02-b)

Each agent dispatch follows this exact template:
1. Read agent config: `agents/{agent-dir}/config.json`
2. Read agent prompt: `agents/{agent-dir}/prompt.md`
3. Read curriculum files listed in config
4. Slice DataPacket: Extract fields listed in config `dataPacketSlice`
5. Build prompt: system = prompt.md + curriculum, user = DataPacket slice + PSR findings + prior phase context
6. Start section timer (via startSection)
7. Dispatch subagent with built prompt
8. Extract/verify output (with fallback)
9. Complete section timer (via completeSection)

Dispatch agents **sequentially** using the Agent tool (RAM constraint -- one agent at a time):

**Agent 1: business-analyst** -- Sections: radar (1), simple_predictable (2)
- Model: Sonnet (per config, cost-efficient for analysis)
- Prompt: prompt.md + sliced DataPacket + curriculum + universal context + PSR findings (from Step 3) + ReportSectionSchema
- Task: "Analyze {TICKER} and produce sections 1 (radar) and 2 (simple_predictable) as JSON objects conforming to ReportSectionSchema. Use the Primary Source Reader findings to ground your analysis in actual filing data. Return a JSON array containing both section objects."

**Agent 2: competitor-evaluator** -- Section: market_position (3)
- Model: Sonnet (per config)
- Prompt: prompt.md + sliced DataPacket + curriculum + universal context + PSR findings + ReportSectionSchema
- Task: "Analyze {TICKER}'s competitive position and produce section 3 (market_position) as a JSON object conforming to ReportSectionSchema. Include market share analysis with ceiling test (can growth rate be sustained without requiring unrealistic market dominance?). Screen 15+ industry peers. Return the single JSON object."

**Wait for business-analyst to complete before dispatching competitor-evaluator.**

Log:
```
Step 5: Phase 1 -- Dispatching 2 agents sequentially (RAM constraint)...
  business-analyst: radar (S1), simple_predictable (S2)
  [wait for completion]
  competitor-evaluator: market_position (S3)
```

### Collect and Validate Phase 1 Outputs

After both agents complete:

1. **Parse** each agent's response to extract ReportSectionSchema-conformant JSON. Look for JSON objects/arrays in the response -- agents may include surrounding text.

2. **Validate** each section output has the required fields:
   - `key` (string matching a sectionKey: radar, simple_predictable, market_position)
   - `title` (string)
   - `sectionNumber` (number: 1, 2, or 3)
   - `status` (one of: pass, fail, review, pending)
   - `confidence` (one of: HIGH, MEDIUM, LOW)
   - `verdict` (one of: PASS, FAIL, WATCHLIST, or null)
   - `verdictRationale` (string)
   - `summary` (string)
   - `narrative` (string)
   - `citations` (array)
   - `redFlags` (array with at least 1 item)

3. **Save** each validated section to `.thes1s/reports/{TICKER}/sections/{section_key}.json`

**JSON Output Extraction (Fallback - D-02-a, D-03-a):**
After each agent completes, check if the output file exists:
```bash
test -f .thes1s/reports/{TICKER}/sections/{key}.json && echo "EXISTS" || echo "MISSING"
```
If MISSING, the agent could not write the file (permission denied). Extract the JSON from the agent's response:
1. Look for a JSON code block (```json ... ```) in the agent's response text
2. If found, extract the JSON content and write it to `.thes1s/reports/{TICKER}/sections/{key}.json` using Bash:
```bash
cat << 'SECTION_EOF' > .thes1s/reports/{TICKER}/sections/{key}.json
{extracted JSON}
SECTION_EOF
```
3. If no JSON block found, create a minimal section with status "failed" and the agent's response as narrative

4. **Log** results per section: key, verdict, confidence, citation count, red flag count.

5. **Handle failures** with retry-then-escalate (per D-05/D-06). For each section that fails JSON parsing or validation:

**Retry Logic (D-02-d):**
   a. Wait 30 seconds before retrying: `sleep 30`
   b. Construct a retry prompt: original agent prompt + error details + instruction to output ONLY valid JSON.
   c. Dispatch the same agent again with the retry prompt.
   d. Apply the same JSON extraction fallback on the retry response.
   e. If retry also fails, save partial output with `status: "failed"` and `error: "{error}"`.
   f. Continue -- do not abort the pipeline for one section failure. Do NOT retry more than once -- the PM can re-run individual sections with `/generate:section`.

**Complete section timers:**
```bash
node --import ./scripts/node-esm-loader.js -e "
import { completeSection, updatePhaseStatus } from './src/engines/progressState.js';
completeSection('{TICKER}', 'radar');
completeSection('{TICKER}', 'simple_predictable');
completeSection('{TICKER}', 'market_position');
updatePhaseStatus('{TICKER}', 1, 'complete');
"
```

Expected sections from Phase 1:
- business-analyst: `radar` (section 1), `simple_predictable` (section 2)
- competitor-evaluator: `market_position` (section 3)

## Step 6: Checkpoint 1 -- Business Fundamentals Review

Print a structured checkpoint summary for the Portfolio Manager:

```
================================================================
  CHECKPOINT 1: Business Fundamentals Review
================================================================

Sections completed: 3/3 (radar, simple_predictable, market_position)

--- Section 1: Radar ---
  Verdict: {verdict} | Confidence: {confidence}
  Summary: {summary snippet, first 200 chars}
  Red Flags: {count} items
  Citations: {count} sources

--- Section 2: Simple & Predictable ---
  Verdict: {verdict} | Confidence: {confidence}
  Summary: {summary snippet}
  Red Flags: {count} items
  Citations: {count} sources

--- Section 3: Market Position ---
  Verdict: {verdict} | Confidence: {confidence}
  Summary: {summary snippet}
  Red Flags: {count} items
  Citations: {count} sources

--- Data Gaps Discovered ---
  {list any DataPacket fields that were null or missing that agents flagged}

--- Questions for PM ---
  {list any questions generated by agents in their crossCuttingFindings}

--- Cross-Cutting Findings ---
  {list findings from crossCuttingFindings across all sections}

--- PSR Discrepancies ---
  {list any discrepancies between DataPacket and SEC filings}

================================================================
```

### Conversational Dialogue Loop

Enter a dialogue loop with the PM. Print:

```
Review the findings above. You can:
  - Ask a question about any section (the responsible analyst will answer)
  - Paste additional data or context for Phase 2 agents
  - Say "re-run section X" to regenerate a specific section with guidance
  - Say "continue" to advance to Phase 2

Your input:
```

**Handle PM responses:**

- **If PM asks a question:** Identify which section it relates to using the `sectionMapping.pitchDeck` from `config.json` (section 1/2 -> business-analyst, section 3 -> competitor-evaluator). Dispatch the responsible agent via the Agent tool with: the question + original section context + the section output + instruction to answer the PM's question directly. Print the agent's answer.

- **If PM says "re-run section X":** Re-dispatch that section's agent with the original prompt plus any additional PM guidance. Replace the saved section output. This implements CMD-01 (section-level re-run).

- **If PM pastes data or context:** Store as `supplementaryContext` -- this will be included in Phase 2 and Phase 3 agent prompts. Acknowledge: "Noted. This context will be provided to all subsequent agents."

- **If PM says "continue":** Save checkpoint state and advance to Phase 2.

Save checkpoint data in memory for the final report:
```json
{
  "afterPhase": 1,
  "timestamp": "{ISO timestamp}",
  "sectionsCompleted": ["radar", "simple_predictable", "market_position"],
  "dataGaps": [ /* discovered gaps */ ],
  "pmNotes": [ /* any PM-provided context */ ],
  "sectionConfidence": { "radar": "HIGH", "simple_predictable": "MEDIUM", "market_position": "HIGH" }
}
```

## Step 7: Phase 2 -- Financial Deep-Dive (Mixed Dispatch)

### Collect Phase 1 Context (D-02-c -- Automated Context Threading)

Automatically collect all completed section findings for downstream agents. Read all completed section files:
```bash
for f in .thes1s/reports/{TICKER}/sections/*.json; do
  echo "=== $(basename $f .json) ==="
  node -e "const s=JSON.parse(require('fs').readFileSync('$f','utf8')); console.log('Verdict:', s.verdict, '|', s.summary?.substring(0,200)); if(s.redFlags) console.log('Red flags:', s.redFlags.join('; ')); if(s.crossCuttingFindings) s.crossCuttingFindings.forEach(f=>console.log('Cross-cutting:', f.finding))"
done
```
Include this output as "Prior Phase Findings" in every Phase 2 agent prompt.

### Prepare Inter-Phase Context

Collect Phase 1 outputs and format as "Prior Analysis Context" for Phase 2 agents. For each Phase 1 section, extract:
- Section key, verdict, confidence
- Summary (full)
- Red flags (full list)
- Key data points from the `data` field
- Cross-cutting findings

Format as a structured block:
```
## Prior Analysis Context (Phase 1 Findings)

### Radar (S1): {verdict} ({confidence})
{summary}
Red Flags: {list}

### Simple & Predictable (S2): {verdict} ({confidence})
{summary}
Red Flags: {list}

### Market Position (S3): {verdict} ({confidence})
{summary}
Red Flags: {list}

### Cross-Cutting Findings
{aggregated findings from all Phase 1 sections}
```

### Dispatch Phase 2 Agents

**Update phase status:**
```bash
node --import ./scripts/node-esm-loader.js -e "
import { updatePhaseStatus, startSection } from './src/engines/progressState.js';
updatePhaseStatus('{TICKER}', 2, 'active');
startSection('{TICKER}', 'barriers_moats', 'competitor-evaluator');
"
```

Phase 2 has a dependency: `barriers_moats` (S4) needs Phase 1's `market_position` context. Therefore:

**First:** Dispatch competitor-evaluator for barriers_moats (S4) alone:
- Receives: prompt.md + sliced DataPacket + curriculum + universal context + PSR findings + Phase 1 context (especially market_position output) + supplementaryContext + ReportSectionSchema
- Task: "Analyze {TICKER}'s competitive barriers and moat durability. Produce section 4 (barriers_moats) as a JSON object conforming to ReportSectionSchema. Use the Phase 1 market_position findings and 15-point moat checklist. Return the single JSON object."

**Then:** After barriers_moats completes, dispatch remaining Phase 2 agents **sequentially** (RAM constraint):

**Agent: financial-analyst** -- Sections: fcf (5), roe_roic_debt (7), balance_sheet (8)
- Receives: prompt.md + sliced DataPacket + curriculum + universal context + PSR findings + Phase 1 context + barriers_moats output + supplementaryContext + ReportSectionSchema
- Task: "Analyze {TICKER}'s financials and produce sections 5 (fcf), 7 (roe_roic_debt), and 8 (balance_sheet) as JSON objects conforming to ReportSectionSchema. Include dual Owner Earnings (Rule One + Graham), cyclical business handling where applicable. Return a JSON array containing all three section objects."

**Agent: management-evaluator** -- Section: management (6)
- Receives: prompt.md + sliced DataPacket + curriculum + universal context + PSR findings + Phase 1 context + supplementaryContext + ReportSectionSchema
- Task: "Evaluate {TICKER}'s management team and produce section 6 (management) as a JSON object conforming to ReportSectionSchema. Assess CEO track record, insider ownership, compensation alignment, and Guru ownership context (NOT a buy signal -- context only). Use PSR management promise findings. Return the single JSON object."

**Wait for financial-analyst to complete before dispatching management-evaluator.**

Log:
```
Step 7: Phase 2 -- Financial Deep-Dive
  Dispatching competitor-evaluator for barriers_moats (S4) first (needs Phase 1 context)...
  [After S4 completes]
  Dispatching 2 agents sequentially (RAM constraint):
    financial-analyst: fcf (S5), roe_roic_debt (S7), balance_sheet (S8)
    [wait for completion]
    management-evaluator: management (S6)
```

### Collect and Validate Phase 2 Outputs

Same validation pattern as Phase 1, including:
- **JSON Output Extraction Fallback (D-02-a):** Check if each output file exists after agent completes. If MISSING, extract JSON from agent response text and write via Bash `cat << 'SECTION_EOF'`.
- **Retry Logic (D-02-d):** If an agent fails, wait 30 seconds and retry once. If retry fails, save with `status: "failed"` and continue.

**Start section timers for parallel agents:**
```bash
node --import ./scripts/node-esm-loader.js -e "
import { startSection } from './src/engines/progressState.js';
startSection('{TICKER}', 'fcf', 'financial-analyst');
startSection('{TICKER}', 'management', 'management-evaluator');
startSection('{TICKER}', 'roe_roic_debt', 'financial-analyst');
startSection('{TICKER}', 'balance_sheet', 'financial-analyst');
"
```

Expected sections:
- competitor-evaluator: `barriers_moats` (section 4)
- financial-analyst: `fcf` (section 5), `roe_roic_debt` (section 7), `balance_sheet` (section 8)
- management-evaluator: `management` (section 6)

Save all validated sections to `.thes1s/reports/{TICKER}/sections/{key}.json`

Apply retry-then-escalate for any failed sections.

**Complete section timers:**
```bash
node --import ./scripts/node-esm-loader.js -e "
import { completeSection, updatePhaseStatus } from './src/engines/progressState.js';
completeSection('{TICKER}', 'barriers_moats');
completeSection('{TICKER}', 'fcf');
completeSection('{TICKER}', 'management');
completeSection('{TICKER}', 'roe_roic_debt');
completeSection('{TICKER}', 'balance_sheet');
updatePhaseStatus('{TICKER}', 2, 'complete');
"
```

## Step 8: Checkpoint 2 -- Financial Deep-Dive Review

Same structured checkpoint pattern as Step 6, but for Phase 2 sections.

Print checkpoint summary showing:
- All 5 Phase 2 sections (barriers_moats, fcf, management, roe_roic_debt, balance_sheet)
- Per-section: verdict, confidence, summary snippet, red flags, citations
- Data gaps discovered
- Questions for PM
- Cross-cutting findings
- Cumulative status: "8/10 sections complete (Phase 1: 3, Phase 2: 5)"

Enter conversational dialogue loop with the same options:
- Questions routed to responsible agent (S4 -> competitor-evaluator, S5/S7/S8 -> financial-analyst, S6 -> management-evaluator)
- "re-run section X" triggers re-dispatch
- Pasted data stored as supplementaryContext for Phase 3
- "continue" advances to Phase 3

Save checkpoint 2 data:
```json
{
  "afterPhase": 2,
  "timestamp": "{ISO timestamp}",
  "sectionsCompleted": ["barriers_moats", "fcf", "management", "roe_roic_debt", "balance_sheet"],
  "dataGaps": [ /* discovered gaps */ ],
  "pmNotes": [ /* any PM-provided context */ ],
  "sectionConfidence": { /* per-section confidence */ }
}
```

## Step 9: Phase 3 -- Risk & Valuation (Parallel Dispatch)

### Collect Phase 1+2 Context (D-02-c -- Automated Context Threading)

Automatically collect all completed section findings for Phase 3 agents:
```bash
for f in .thes1s/reports/{TICKER}/sections/*.json; do
  echo "=== $(basename $f .json) ==="
  node -e "const s=JSON.parse(require('fs').readFileSync('$f','utf8')); console.log('Verdict:', s.verdict, '|', s.summary?.substring(0,200)); if(s.redFlags) console.log('Red flags:', s.redFlags.join('; ')); if(s.crossCuttingFindings) s.crossCuttingFindings.forEach(f=>console.log('Cross-cutting:', f.finding))"
done
```
Include this complete output as "Prior Phase Findings" in Phase 3 agent prompts.

### Prepare Full Inter-Phase Context

Collect Phase 1 AND Phase 2 section summaries, verdicts, red flags, and cross-cutting findings. Format as comprehensive prior analysis context for Phase 3 agents. This is the richest context any agents receive -- they see the full thesis taking shape.

```
## Prior Analysis Context (Phase 1 + Phase 2 Findings)

### Phase 1: Business Fundamentals
[Same format as Step 7 context]

### Phase 2: Financial Deep-Dive
[Per-section summaries for S4-S8]

### Cumulative Red Flags
[Aggregated from all 8 sections]

### Cumulative Cross-Cutting Findings
[Aggregated findings]

### PM-Provided Supplementary Context
[Any data or notes from checkpoints]
```

### Dispatch Phase 3 Agents Sequentially

**Update phase status:**
```bash
node --import ./scripts/node-esm-loader.js -e "
import { updatePhaseStatus, startSection } from './src/engines/progressState.js';
updatePhaseStatus('{TICKER}', 3, 'active');
startSection('{TICKER}', 'pest', 'risk-analyst');
startSection('{TICKER}', 'valuation', 'valuation-specialist');
"
```

**Agent: risk-analyst** -- Section: pest (9)
- Model: Opus (per config -- risk requires deep reasoning)
- Receives: prompt.md + sliced DataPacket + curriculum + universal context + PSR findings + Phase 1+2 context + supplementaryContext + ReportSectionSchema
- Task: "Conduct a comprehensive PEST (Political, Economic, Social, Technological) risk analysis for {TICKER}. Produce section 9 (pest) as a JSON object conforming to ReportSectionSchema. Apply the 3-red-flag minimum per PEST category. Assess FGR vulnerability -- what risks could make the assumed growth rate unrealistic? Include cyclical risk assessment with cycle position matrix where applicable. Return the single JSON object."

**Agent: valuation-specialist** -- Section: valuation (10)
- Model: Opus (per config -- valuation requires highest judgment)
- Receives: prompt.md + sliced DataPacket + curriculum + universal context + PSR findings + Phase 1+2 context + supplementaryContext + ReportSectionSchema
- Task: "Produce the complete valuation analysis for {TICKER} as section 10 (valuation) conforming to ReportSectionSchema. Calculate all four methods (MOS, PBT, Ten Cap, Equity Bond) with buy price ranges. Include dual Owner Earnings (Rule One + Graham). Derive the FGR using all 5 inputs with evidence and reasoning for each. Include sensitivity tables varying FGR, EPS, and CapEx assumptions. The FGR derivation data must be in the section's `data` field with structure: { fgrDerivation: { inputs: [ { name, value, source, confidence, reasoning } ], proposedRange: { low, high }, weightedAverage } }. Return the single JSON object."

**Dispatch risk-analyst first, wait for completion, then dispatch valuation-specialist** (RAM constraint).

Log:
```
Step 9: Phase 3 -- Risk & Valuation
  Dispatching 2 agents sequentially (RAM constraint):
    risk-analyst: pest (S9) [Opus]
    [wait for completion]
    valuation-specialist: valuation (S10) [Opus, includes FGR derivation]
```

### Collect and Validate Phase 3 Outputs

Same validation pattern as Phase 1, including:
- **JSON Output Extraction Fallback (D-02-a):** Check if each output file exists. If MISSING, extract JSON from agent response and write via Bash.
- **Retry Logic (D-02-d):** If an agent fails, wait 30 seconds and retry once. If retry fails, save with `status: "failed"`.

Expected sections:
- risk-analyst: `pest` (section 9)
- valuation-specialist: `valuation` (section 10)

Save all validated sections to `.thes1s/reports/{TICKER}/sections/{key}.json`

**Complete section timers:**
```bash
node --import ./scripts/node-esm-loader.js -e "
import { completeSection, updatePhaseStatus } from './src/engines/progressState.js';
completeSection('{TICKER}', 'pest');
completeSection('{TICKER}', 'valuation');
updatePhaseStatus('{TICKER}', 3, 'complete');
"
```

## Step 10: FGR Derivation Sub-Workflow

After the valuation-specialist produces section 10, extract the FGR derivation data from the section's `data.fgrDerivation` field.

Present the FGR derivation to the PM input by input:

```
================================================================
  FGR DERIVATION for {TICKER}
================================================================

The valuation specialist has derived a Future Growth Rate using 5 inputs.
Review each input and confirm or adjust.

--- Input 1: Historical Composite (Rear View Mirror) ---
  Value: {value}%
  Source: {source}
  Confidence: {confidence}
  Reasoning: {reasoning}

  Confirm this value or enter an adjusted value (or 'ok' to accept):
```

Repeat for each of the 5 FGR inputs:
1. **Historical Composite** -- BVPS+Div, Earnings, OpCash, Revenue CAGRs
2. **Market Relativity** -- Cumulative stockholder return vs S&P 500 and sector
3. **Company Guidance** -- Management's stated growth plans
4. **Sector/Industry** -- Industry CAGR from trade journals
5. **Analysts** -- Wall St consensus, revenue growth estimates

After PM confirms all 5 inputs:

```
--- Proposed FGR Range ---
  Low: {low}%
  High: {high}%
  Based on: {weighted average logic explanation}

  Confirm this range (ok) or enter adjusted Low/High:
```

**If PM adjusts any input or the final range:**
1. Update the FGR derivation data with PM-confirmed values
2. Re-run the valuation calculations using the adjusted FGR by dispatching the valuation-specialist again with: "Recalculate all valuation methods (MOS, PBT, Equity Bond) and sensitivity tables using the PM-confirmed FGR range: Low={low}%, High={high}%. Keep all other inputs from your original analysis. Return an updated section 10 (valuation) JSON object."
3. Replace the saved valuation section output
4. Regenerate sensitivity tables with the confirmed FGR

Save the final FGR derivation (with PM-confirmed values) as a standalone object for the final report.

Log:
```
Step 10: FGR Derivation complete
  PM-confirmed FGR: {low}% - {high}%
  Inputs confirmed: {count}/5 unchanged, {count}/5 adjusted
```

## Step 11: Checkpoint 3 -- Risk & Valuation Review

Print the final checkpoint summary:

```
================================================================
  CHECKPOINT 3: Risk & Valuation Review
================================================================

Sections completed: 10/10 (all phases complete)

--- Section 9: PEST Risks ---
  Verdict: {verdict} | Confidence: {confidence}
  Summary: {summary snippet}
  Red Flags: {count} items (minimum 3 per PEST category required)
  Citations: {count} sources

--- Section 10: Valuation ---
  Verdict: {verdict} | Confidence: {confidence}
  Summary: {summary snippet}
  Red Flags: {count} items
  Citations: {count} sources

--- FGR Derivation Summary ---
  Input 1 (Historical): {value}% [{PM confirmed/adjusted}]
  Input 2 (Market Relativity): {value}% [{PM confirmed/adjusted}]
  Input 3 (Company Guidance): {value}% [{PM confirmed/adjusted}]
  Input 4 (Sector/Industry): {value}% [{PM confirmed/adjusted}]
  Input 5 (Analysts): {value}% [{PM confirmed/adjusted}]
  Final FGR Range: {low}% - {high}%

--- Buy Price Ranges ---
  MOS: ${low_mos} - ${high_mos}
  PBT: {payback_years_low} - {payback_years_high} years
  Ten Cap: ${low_tencap} - ${high_tencap}
  Equity Bond: ${low_eb} - ${high_eb}
  Combined Range: ${min_all} - ${max_all}

--- Sensitivity Table Preview ---
  [Text-format matrix showing buy prices at varying FGR/EPS assumptions]

--- Cumulative Status ---
  Phase 1 (Business Fundamentals): 3/3 sections, {pass_count} PASS, {fail_count} FAIL
  Phase 2 (Financial Deep-Dive): 5/5 sections, {pass_count} PASS, {fail_count} FAIL
  Phase 3 (Risk & Valuation): 2/2 sections, {pass_count} PASS, {fail_count} FAIL

================================================================
```

Enter the same conversational dialogue loop:
- Questions routed to responsible agent (S9 -> risk-analyst, S10 -> valuation-specialist)
- "re-run section X" triggers re-dispatch
- "continue" advances to synthesis

Save checkpoint 3 data.

## Step 12: Synthesis Writer -- Final Polish (Post-Processing)

Dispatch the **synthesis-writer** using the Agent tool with **Opus model** (per config -- synthesis requires highest judgment).

**Prompt content:**
1. The synthesis-writer's `prompt.md` content
2. ALL 10 completed section outputs -- full summaries, verdicts, confidence scores, red flags, citations, narratives, and data fields
3. PSR findings (annual + quarterly)
4. All 3 checkpoint notes (PM feedback, supplementary context, data gaps)
5. FGR derivation with PM-confirmed values
6. One Pager verdict and summary (from gate check)
7. Universal context file contents
8. ReportSectionSchema for output format

**Task instruction:**
"Review all 10 Pitch Deck sections for {TICKER}. Your tasks:
1. Check cross-section consistency -- ensure no contradictions between sections (e.g., moat analysis vs competitive threats, growth assumptions vs risk assessment).
2. Identify any gaps where sections reference data not present in other sections.
3. Produce an overallVerdict (PASS, FAIL, or WATCHLIST) with comprehensive rationale weighing all 10 sections. Weight moat and financial sections most heavily, PEST lightest, management as contextual.
4. Write the overallVerdict rationale in Buffett's clear, direct style.
5. Flag any sections that need quality improvement.
6. Return a JSON object with fields: overallVerdict, verdictRationale, confidenceLevel, crossSectionIssues (array), qualityFlags (array), synthesisNarrative (string -- the executive summary tying everything together)."

Log:
```
Step 12: Dispatching synthesis-writer for final polish [Opus]...
```

Collect the synthesis output. The `overallVerdict` becomes the Pitch Deck's final verdict.

**JSON Output Extraction Fallback (D-02-a):** If the synthesis-writer's output file was not written, extract JSON from its response text using the same fallback pattern as section agents.

**Retry Logic (D-02-d):** If the synthesis-writer fails, retry once after 30 seconds. If the retry also fails, use individual section verdicts to compute an overall verdict (majority rule weighted by confidence).

**Update generation status:**
```bash
node --import ./scripts/node-esm-loader.js -e "
import { updateGenerationStatus } from './src/engines/progressState.js';
updateGenerationStatus('{TICKER}', { state: 'SYNTHESIS', currentAgent: 'synthesis-writer' });
"
```

## Step 13: Assemble Final Report

Collect all 10 sections + synthesis + checkpoints + FGR derivation into the final report structure:

```json
{
  "ticker": "{TICKER}",
  "companyName": "{from DataPacket companyInfo}",
  "stage": "pitchDeck",
  "generatedAt": "{ISO timestamp}",
  "sections": [
    /* 10 ReportSectionSchema objects ordered by sectionNumber (1-10) */
  ],
  "overallVerdict": "{PASS|FAIL|WATCHLIST from synthesis-writer}",
  "verdictRationale": "{from synthesis-writer}",
  "synthesisNarrative": "{executive summary from synthesis-writer}",
  "sectionKeys": ["radar", "simple_predictable", "market_position", "barriers_moats", "fcf", "management", "roe_roic_debt", "balance_sheet", "pest", "valuation"],
  "checkpoints": [
    /* 3 checkpoint objects from Steps 6, 8, 11 */
  ],
  "fgrDerivation": {
    "finalLow": 0.10,
    "finalHigh": 0.14,
    "inputs": [
      { "name": "Historical Composite", "value": 0.123, "source": "...", "confidence": "HIGH", "reasoning": "...", "pmConfirmed": true, "pmAdjusted": false }
    ],
    "proposedRange": { "low": 0.10, "high": 0.14 },
    "weightedAverage": 0.12
  },
  "sensitivityTables": {
    "mos": { /* headers, rows */ },
    "pbt": { /* headers, rows */ },
    "tenCap": { /* headers, rows */ },
    "equityBond": { /* headers, rows */ }
  },
  "assumptions": [
    /* key assumptions with confidence levels extracted from sections */
  ],
  "psrSummary": {
    "annualYearsAnalyzed": 10,
    "quarterlyQuartersAnalyzed": 4,
    "discrepanciesFound": 3,
    "managementPromisesTracked": 8
  },
  "onePagerVerdict": "{from gate check -- One Pager's verdict for reference}"
}
```

**Write JSON report** to `.thes1s/reports/{TICKER}/pitch-deck.json`

**Generate human-readable markdown** at `.thes1s/reports/{TICKER}/pitch-deck.md`:

```markdown
# {Company Name} ({TICKER}) -- Pitch Deck

**Generated:** {date}
**Overall Verdict:** {PASS/FAIL/WATCHLIST} ({confidence})
**FGR Range:** {low}% - {high}%

---

## Executive Summary
{synthesisNarrative}

---

## Phase 1: Business Fundamentals

### 1. Radar
{narrative}

**Verdict:** {verdict} | **Confidence:** {confidence}

#### Red Flags
- {red flag 1}
- {red flag 2}

---

### 2. Simple & Predictable
{narrative}
...

(repeat for all 10 sections)

---

## FGR Derivation
| Input | Value | Source | Confidence | PM Status |
|-------|-------|--------|------------|-----------|
| Historical Composite | {value}% | {source} | {confidence} | {confirmed/adjusted} |
| Market Relativity | ... | ... | ... | ... |
| Company Guidance | ... | ... | ... | ... |
| Sector/Industry | ... | ... | ... | ... |
| Analysts | ... | ... | ... | ... |

**Final FGR Range:** {low}% - {high}%

---

## Buy Price Ranges
| Method | Conservative | Optimistic |
|--------|-------------|------------|
| MOS | ${low} | ${high} |
| Ten Cap | ${low} | ${high} |
| Equity Bond | ${low} | ${high} |
| PBT | {years_low}yr | {years_high}yr |

**Combined Range:** ${min} - ${max}

---

## Sensitivity Tables
{text-format sensitivity matrices}

---

## Citations
1. {citation 1}
2. {citation 2}
...
```

Log:
```
Step 13: Report assembled
  Sections: 10/10
  Overall verdict: {verdict}
  Total citations: {count}
  Total red flags: {count}
  Output: .thes1s/reports/{TICKER}/pitch-deck.json
  Output: .thes1s/reports/{TICKER}/pitch-deck.md
```

## Step 14: Quality Check

Run the quality system on the assembled report:

```bash
node --import ./scripts/node-esm-loader.js -e "
  import { validateStage } from './src/engines/critic.js';
  import { readFileSync, writeFileSync, mkdirSync } from 'fs';
  const report = JSON.parse(readFileSync('.thes1s/reports/{TICKER}/pitch-deck.json', 'utf8'));
  const dp = JSON.parse(readFileSync('.thes1s/reports/{TICKER}/data-packet.json', 'utf8'));
  const quality = validateStage(report.sections, dp);
  mkdirSync('.thes1s/reports/{TICKER}/quality', { recursive: true });
  writeFileSync('.thes1s/reports/{TICKER}/quality/pitch-deck.quality.json', JSON.stringify(quality, null, 2));
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

Log quality results:
- Overall quality score (0-100)
- Passed/failed status
- Per-section: score, issue counts by severity
- List any HIGH severity issues verbatim

**Quality is informational, not blocking** (per D-04). The report is already saved. Quality results are supplementary data for the PM to review.

Write quality report to `.thes1s/reports/{TICKER}/quality/pitch-deck.quality.json`

## Step 15: Budget Tracking

Track token usage and estimated cost for the Pitch Deck generation run:

```bash
node --import ./scripts/node-esm-loader.js -e "
  import { createBudgetTracker, formatBudgetReport } from './src/engines/contextBudget.js';
  import { readFileSync, writeFileSync, existsSync } from 'fs';
  const report = JSON.parse(readFileSync('.thes1s/reports/{TICKER}/pitch-deck.json', 'utf8'));
  const tracker = createBudgetTracker();

  // Record PSR agent estimates (Opus model)
  const annualPSR = existsSync('.thes1s/reports/{TICKER}/sections/annual-reader-insights.json')
    ? JSON.parse(readFileSync('.thes1s/reports/{TICKER}/sections/annual-reader-insights.json', 'utf8'))
    : null;
  const quarterlyPSR = existsSync('.thes1s/reports/{TICKER}/sections/quarterly-reader-insights.json')
    ? JSON.parse(readFileSync('.thes1s/reports/{TICKER}/sections/quarterly-reader-insights.json', 'utf8'))
    : null;

  if (annualPSR) {
    const chars = JSON.stringify(annualPSR).length;
    tracker.record('annual-reader', 'pre-processing', chars * 10, chars, 'claude-opus-4-6');
  }
  if (quarterlyPSR) {
    const chars = JSON.stringify(quarterlyPSR).length;
    tracker.record('quarterly-reader', 'pre-processing', chars * 10, chars, 'claude-opus-4-6');
  }

  // Record section agent estimates
  for (const section of report.sections) {
    const tc = section.tokenCost || { input: 0, output: 0 };
    const model = section.modelUsed || 'claude-sonnet-4-20250514';
    const agentMap = {
      radar: 'business-analyst', simple_predictable: 'business-analyst',
      market_position: 'competitor-evaluator', barriers_moats: 'competitor-evaluator',
      fcf: 'financial-analyst', management: 'management-evaluator',
      roe_roic_debt: 'financial-analyst', balance_sheet: 'financial-analyst',
      pest: 'risk-analyst', valuation: 'valuation-specialist'
    };
    tracker.record(
      agentMap[section.key] || 'unknown',
      section.key,
      tc.input || 0,
      tc.output || 0,
      model
    );
  }

  const summary = tracker.getSummary();

  // Append to existing budget.json if One Pager already tracked
  let existing = {};
  if (existsSync('.thes1s/reports/{TICKER}/budget.json')) {
    existing = JSON.parse(readFileSync('.thes1s/reports/{TICKER}/budget.json', 'utf8'));
  }
  const combined = { ...existing, pitchDeck: summary };
  writeFileSync('.thes1s/reports/{TICKER}/budget.json', JSON.stringify(combined, null, 2));
  console.log(formatBudgetReport(summary));
"
```

Log budget summary:
- Total input/output tokens across all agents (PSR + analysts + synthesis)
- Estimated cost for the full Pitch Deck generation
- Per-agent breakdown
- Comparison note: "Pitch Deck uses significantly more tokens than One Pager due to PSR pre-processing and 3-phase dispatch"

**Budget tracking is observational** -- it never blocks execution.

Write budget report to `.thes1s/reports/{TICKER}/budget.json` (appended, not overwritten -- preserves One Pager budget data).

## Step 16: Print Final Summary

**Finalize generation status:**
```bash
node --import ./scripts/node-esm-loader.js -e "
import { updateGenerationStatus } from './src/engines/progressState.js';
updateGenerationStatus('{TICKER}', { state: 'COMPLETE', currentAgent: null });
console.log('Generation status finalized for {TICKER}');
"
```

Print the complete generation summary:

```
================================================================
  PITCH DECK GENERATION COMPLETE: {TICKER}
================================================================

Sections completed: {X}/10
Overall verdict: {PASS/FAIL/WATCHLIST} ({confidence})

--- Section Verdicts ---
  1. Radar:              {verdict} ({confidence})
  2. Simple & Predictable: {verdict} ({confidence})
  3. Market Position:    {verdict} ({confidence})
  4. Barriers & Moats:   {verdict} ({confidence})
  5. Free Cash Flow:     {verdict} ({confidence})
  6. Management:         {verdict} ({confidence})
  7. ROE/ROIC & Debt:    {verdict} ({confidence})
  8. Balance Sheet:      {verdict} ({confidence})
  9. PEST Risks:         {verdict} ({confidence})
  10. Valuation:         {verdict} ({confidence})

--- FGR ---
  Range: {low}% - {high}%

--- Buy Price Range ---
  Combined: ${min} - ${max} (current: ${currentPrice})

--- Quality ---
  Score: {score}/100
  Issues: {count} (high: {N}, medium: {N}, low: {N})

--- Budget ---
  Estimated cost: ${total}
  PSR agents: ${psr_cost}
  Analyst agents: ${analyst_cost}
  Synthesis: ${synthesis_cost}

--- Primary Source Reading ---
  Annual: {yearCount} years of 10-Ks analyzed
  Quarterly: {quarterCount} quarters of 10-Qs/transcripts analyzed
  Discrepancies found: {count}

--- Citations ---
  Total: {count} across all sections

--- Red Flags ---
  Total: {count} across all sections

--- Output Files ---
  Report (JSON): .thes1s/reports/{TICKER}/pitch-deck.json
  Report (MD):   .thes1s/reports/{TICKER}/pitch-deck.md
  Sections:      .thes1s/reports/{TICKER}/sections/*.json
  PSR Insights:  .thes1s/reports/{TICKER}/sections/annual-reader-insights.json
                 .thes1s/reports/{TICKER}/sections/quarterly-reader-insights.json
  Quality:       .thes1s/reports/{TICKER}/quality/pitch-deck.quality.json
  Budget:        .thes1s/reports/{TICKER}/budget.json

================================================================
```

## Constraints

### Contamination Boundary (CRITICAL)
During generation, NEVER read from any of these paths:
- `knowledge/stage-1-one-pager/examples/`
- `knowledge/stage-2-pitch-deck/examples/`
- `knowledge/stage-3-full-story/examples/`
- `knowledge/pre-course-examples/`

These contain the user's manual research examples used for quality benchmarking. Agents must generate from curriculum + DataPacket + PSR findings alone -- never pattern-match from examples. This is a hard constraint per AGNT-04 and D-13.

### Schema Enforcement
Every section output MUST conform to the ReportSectionSchema. Validate before saving. If a section is malformed, log the validation error and apply retry-then-escalate -- do not save invalid data.

### Error Resilience
- If a PSR agent fails, continue without its findings -- downstream agents work with DataPacket alone.
- If a phase agent fails entirely, log the error, save what succeeded, and continue to next phase.
- If some sections fail validation after retry, assemble the report with valid sections.
- If the synthesis-writer fails, use the individual section verdicts to compute an overall verdict (majority rule weighted by confidence).
- The pipeline should ALWAYS produce partial results rather than nothing.
- After 1 retry per failed section, save partial output with `status: "failed"` and move on.

### Progress Display
Log progress at each major step:
```
Step 1:   Validating input and gate check...
Step 2:   Assembling DataPacket for {TICKER}...
Step 2.6: Data quality checkpoint (block on critical gaps, warn on non-critical)
Step 3:   Pre-processing -- dispatching PSR agents (annual + quarterly)...
Step 4:  Reading agent configurations...
Step 5:  Phase 1 -- Business Fundamentals (3 sections)...
Step 6:  CHECKPOINT 1 -- Business Fundamentals Review [INTERACTIVE]
Step 7:  Phase 2 -- Financial Deep-Dive (5 sections)...
Step 8:  CHECKPOINT 2 -- Financial Deep-Dive Review [INTERACTIVE]
Step 9:  Phase 3 -- Risk & Valuation (2 sections)...
Step 10: FGR Derivation -- PM confirmation [INTERACTIVE]
Step 11: CHECKPOINT 3 -- Risk & Valuation Review [INTERACTIVE]
Step 12: Post-processing -- Synthesis Writer...
Step 13: Assembling final report...
Step 14: Running quality checks...
Step 15: Tracking token budget...
Step 16: Generation complete.
```

### Inter-Phase Context
Each phase receives the context from all prior phases. This is the key architectural difference from the One Pager pipeline. Context grows as the analysis deepens:
- Phase 1 agents: DataPacket + PSR findings
- Phase 2 agents: DataPacket + PSR findings + Phase 1 outputs + checkpoint context
- Phase 3 agents: DataPacket + PSR findings + Phase 1 + Phase 2 outputs + checkpoint context
- Synthesis writer: Everything

### Checkpoint Interaction Model
The PM is the portfolio manager reviewing the analyst team's work. Checkpoints are not rubber stamps -- they are genuine review gates where the PM:
- Challenges assumptions
- Provides data the agents could not access (paywalled sources, industry contacts)
- Redirects analysis if a section misses the mark
- Asks follow-up questions directly to the responsible analyst

The conversational loop continues until the PM explicitly says "continue". There is no timeout.

### Agent Model Selection
- **PSR agents (annual-reader, quarterly-reader):** Opus -- deep comprehension of long documents
- **Analysis agents (business-analyst, competitor-evaluator, financial-analyst, management-evaluator):** Sonnet -- cost-efficient for structured analysis
- **Judgment agents (risk-analyst, valuation-specialist):** Opus -- highest reasoning for risk and valuation
- **Synthesis-writer:** Opus -- cross-section consistency requires deep judgment

Model selection follows each agent's config.json setting, not a blanket override.
