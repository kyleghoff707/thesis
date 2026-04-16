---
name: generate-pitch-deck
description: Generate a 10-section Rule One Pitch Deck using v2 agent prompts, Claude Code subagent orchestration, 5-wave dispatch, and FGR derivation
argument-hint: TICKER
disable-model-invocation: true
---

# Generate Pitch Deck (v2)

Generate a complete 10-section Rule One Pitch Deck investment analysis for **$0**.

This orchestrates 10 specialist agents across 5 waves via Claude Code Agent tool dispatch, preceded by Primary Source Reading (annual + quarterly), with an FGR derivation sub-workflow. Runs end-to-end without stopping — no PM checkpoints.

**Key v2 changes:** Self-contained agent prompts from `agents-v2/` (no config.json, no knowledgeBundle, no dispatch-table.json). Competitor evaluator is split into Market Position (Wave 1) and Moats (Wave 2). No progressState.js calls.

---

## Agent Registry

Each entry maps an agent role to its v2 prompt path, the sections it produces, its wave, **model** (from managed-agent.yaml), and the DataPacket fields it needs.

**Model is a controlled variable.** During the sprint, these defaults match the Managed Agents YAML configs. The observatory tracks which model each agent used, so DOE experiments can measure the effect of model changes on quality and cost.

```
AGENT_REGISTRY:

  annual-reader:
    prompt: agents-v2/annual-reader/prompt.md
    model: sonnet
    sections: [psr_annual]
    wave: 0
    dpFields: [companyInfo, classification, financials, ttm, filings, caveats]

  quarterly-reader:
    prompt: agents-v2/quarterly-reader/prompt.md
    model: opus
    sections: [psr_quarterly]
    wave: 0
    dpFields: [companyInfo, classification, financials, ttm, filings, caveats]

  business-analyst:
    prompt: agents-v2/business-analyst-pitchdeck/prompt.md
    model: sonnet
    sections: [radar, simple_predictable]
    wave: 1
    dpFields: [companyInfo, classification, ruleOneScore, peers, gurus, financials, ttm, growthRates, caveats]

  competitor-market-position:
    prompt: agents-v2/competitor-evaluator-market-position-pitchdeck/prompt.md
    model: sonnet
    sections: [market_position]
    wave: 1
    dpFields: [companyInfo, classification, ruleOneScore, peers, peerMetrics, financials, ttm, growthRates, caveats]

  competitor-moats:
    prompt: agents-v2/competitor-evaluator-moats-pitchdeck/prompt.md
    model: sonnet
    sections: [barriers_moats]
    wave: 2
    dpFields: [companyInfo, classification, ruleOneScore, peers, peerMetrics, financials, ttm, growthRates, caveats]

  financial-analyst:
    prompt: agents-v2/financial-analyst-pitchdeck/prompt.md
    model: sonnet
    sections: [fcf, roe_roic_debt, balance_sheet]
    wave: 2
    dpFields: [companyInfo, classification, financials, ttm, growthRates, returnMetrics, debtMetrics, fcf, keyMetrics, caveats]

  management-evaluator:
    prompt: agents-v2/management-evaluator-pitchdeck/prompt.md
    model: sonnet
    sections: [management]
    wave: 2
    dpFields: [companyInfo, classification, compensation, insiders, gurus, financials, ttm, returnMetrics, caveats]

  risk-analyst:
    prompt: agents-v2/risk-analyst-pitchdeck/prompt.md
    model: opus
    sections: [pest]
    wave: 3
    dpFields: [companyInfo, classification, financials, ttm, growthRates, peers, insiders, caveats]

  valuation-specialist:
    prompt: agents-v2/valuation-specialist-pitchdeck/prompt.md
    model: opus
    sections: [valuation]
    wave: 3
    dpFields: [companyInfo, classification, financials, ttm, growthRates, returnMetrics, fcf, keyMetrics, caveats]

  synthesis-writer:
    prompt: agents-v2/synthesis-writer-pitchdeck/prompt.md
    model: sonnet
    sections: [overall_verdict]
    wave: 4
    dpFields: []  # receives section outputs only, no raw DataPacket
```

## Wave Structure

```
Wave 0 (PSR):     annual-reader (1 per 10-K, up to 5) + quarterly-reader (10-Qs + transcripts)
Wave 1 (Business): business-analyst + competitor-market-position
Wave 2 (Deep):     competitor-moats (needs S3) + financial-analyst + management-evaluator
Wave 3 (Risk/Val): risk-analyst + valuation-specialist
Wave 4 (Synthesis): synthesis-writer
```

Agents within the same wave dispatch **in parallel** (multiple Agent tool calls in a single message). Waves are sequential — a wave cannot start until all agents in the prior wave have completed.

---

## Step 1: Validate Input, Gate Check, and Set Up

The ticker symbol is `$0`. Uppercase it and store as `TICKER`.

- If `$0` is empty, print usage: `/generate-pitch-deck TICKER` and stop.
- Create output directories:
  - `.thes1s/reports/{TICKER}/`
  - `.thes1s/reports/{TICKER}/sections/`
  - `.thes1s/reports/{TICKER}/quality/`

**Gate Check:** Read `.thes1s/reports/{TICKER}/one-pager.json`. Verify:
1. The file exists
2. Parse it and check that `overallVerdict` is set (not null, not undefined)

If either check fails, print:
```
Gate check FAILED: One Pager must be completed and have a verdict before generating a Pitch Deck.
Run /generate-one-pager {TICKER} first.
```
And **stop execution**.

If the gate passes, log:
```
Step 1: Gate check PASSED -- One Pager verdict: {verdict}
Setting up Pitch Deck generation for {TICKER}...
```

Store the one-pager data for later reference -- Phase 3 agents and synthesis-writer may reference it.

## Step 2: Prepare All Data (Single Script)

ALL data preparation runs in a single Node.js process:

```bash
node --loader ./scripts/node-esm-loader.js scripts/prepare-data.js {TICKER}
```

The script runs these steps internally:
1. Gate check (verifies one-pager exists and has a verdict)
2. Init generation status
3. Assemble DataPacket (EDGAR, SEC — includes guru data)
4. Pre-fetch earnings call transcripts (Alpha Vantage)
5. Pre-process SEC filings to markdown (5 10-Ks + 4 10-Qs)
6. Data quality checkpoint

**Output:** Human-readable logs to stderr, structured JSON summary to stdout (last line).

Parse the JSON summary from stdout to get `checkpointVerdict`, `dataPacketFields`, `guruCount`, `transcriptsSaved`, `errors`, and per-step `timings`.

The pre-processed filings are at `.thes1s/reports/{TICKER}/filings-md/`. Each JSON file contains extracted sections as markdown text. 10-K files extract Business, Risk Factors, MD&A, and Financial Statements. 10-Q files extract Financial Statements, MD&A, and Risk Factors.

**If the script exits with code 1 (BLOCKED):** Critical fields are missing. Do NOT proceed. Instead:
1. Print the full checkpoint summary for the PM
2. Ask: "Critical data is missing. Would you like to:
   (a) Provide file paths or paste data to fill gaps
   (b) Re-run data preparation
   (c) Abort generation"
3. If PM provides data, save to `.thes1s/reports/{TICKER}/pm-supplementary.md`
4. After gap-fill, re-run prepare-data.js to verify

**If the script exits with code 0 (PROCEED):** Print the summary and continue automatically.

Log:
```
Step 2: Data quality checkpoint for {TICKER}
  DataPacket: {populated}/{total} fields
  Filings: {tenKCount} 10-Ks, {tenQCount} 10-Qs processed
  Verdict: PROCEED
```

## Step 2.5: Initialize Observatory Capture

Run the observatory init script:

```bash
node scripts/observatory-init.js {TICKER} pitchDeck .thes1s/reports/{TICKER}/data-packet.json
```

Capture the **last line of output** -- that is the `RUN_ID`. You will need it in Step 15.

If this fails, print a warning and continue -- observatory is non-blocking.

## Step 3: Wave 0 -- Primary Source Reading (Annual + Quarterly)

Read the DataPacket from `.thes1s/reports/{TICKER}/data-packet.json`.

### 3a: Read PSR Agent Prompts

Read both v2 agent prompts:
- `agents-v2/annual-reader/prompt.md`
- `agents-v2/quarterly-reader/prompt.md`

### 3b: Dispatch Annual Reader Agents (One Per 10-K)

**Identify all 10-K filings** from `.thes1s/reports/{TICKER}/filings-md/`. Sort chronologically, oldest first. Up to 5 10-Ks.

For each 10-K file, dispatch a Claude Code subagent via the **Agent tool**:

**Prompt (concatenated):**
1. Full contents of `agents-v2/annual-reader/prompt.md`
2. DataPacket slice: `companyInfo`, `classification`, `financials` (for this year + prior year only), `ttm`, `filings`, `caveats` -- as a fenced JSON block
3. All sections from that year's 10-K filing:
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
4. If NOT the first year, include a brief summary of the prior year's key findings
5. Task instruction: "Read {TICKER}'s FY{year} 10-K filing provided above. This is year {N} of {total}. Extract: (1) Business model changes, (2) New/changed risk factors, (3) Management's financial discussion, (4) Financial data cross-validation against DataPacket -- flag discrepancies with severity (low <1%, medium 1-5%, high >5%), (5) Acquisition disclosures, (6) Management promises and strategic priorities. Return your findings as a JSON object matching the output format in your prompt."

**Dispatch all annual readers in parallel** (one Agent call per 10-K, all in a single message). Each agent operates on its own year independently. After all complete, merge outputs chronologically.

**Retry logic:** If an agent fails entirely, wait 30 seconds and retry once. If retry fails, log the error and continue.

Log:
```
Step 3: Wave 0 -- Dispatching annual reader agents (1 per 10-K)...
  Annual Reader FY{year1}: 10-K {date1} (~{size}KB)
  Annual Reader FY{year2}: 10-K {date2} (~{size}KB)
  ...
```

### 3c: Dispatch Quarterly Reader Agents

After all annual readers complete, dispatch quarterly reader agent(s). Batch up to 4 10-Qs per dispatch.

**Identify all 10-Q filings** from `.thes1s/reports/{TICKER}/filings-md/`. Sort chronologically. Split into batches of 4.

**Prompt (concatenated):**
1. Full contents of `agents-v2/quarterly-reader/prompt.md`
2. DataPacket slice: `companyInfo`, `classification`, `financials`, `ttm`, `filings`, `caveats` -- as a fenced JSON block
3. All sections from each 10-Q in the batch
4. Annual reader findings summary
5. Earnings call transcripts (if available at `.thes1s/reports/{TICKER}/transcripts/`):
```
## Earnings Call Transcript: Q{N} FY{YYYY}
{full transcript text}
```
If no transcripts exist, include: "## Earnings Call Transcripts: UNAVAILABLE\nNo transcripts were available. Proceed with 10-Q filings only. Flag as data gap."
6. Task instruction: "Read {TICKER}'s quarterly SEC filings covering Q{start} through Q{end}. Cross-reference transcripts against 10-Q filings. Extract quarterly trends, guidance changes, promise tracking, and cross-validate financials. Return your findings as a JSON object matching the output format in your prompt."

Log:
```
  Quarterly Reader Batch 1: Q{start}-Q{end} (~{size}KB)
```

### 3d: Collect and Save PSR Outputs

After all PSR agents complete:

1. **Extract JSON** from each agent response using the fallback chain (see "JSON Extraction" section below)
2. **Merge annual reader outputs** into `annual-reader-insights.json`:
   - Combine per-year findings chronologically
   - Aggregate discrepancies across years
   - Compile strategic themes and management promises
   - Write to `.thes1s/reports/{TICKER}/sections/annual-reader-insights.json`
3. **Merge quarterly reader outputs** into `quarterly-reader-insights.json`:
   - Combine per-batch findings chronologically
   - Aggregate guidance evolution and analyst concerns
   - Write to `.thes1s/reports/{TICKER}/sections/quarterly-reader-insights.json`
4. Build combined `psrFindings` object for downstream agents:

```json
{
  "annualInsights": { /* merged */ },
  "quarterlyInsights": { /* merged */ },
  "discrepancies": [ /* combined from all agents */ ],
  "managementPromises": [ /* from annual-readers */ ],
  "guidanceEvolution": { /* from quarterly-readers */ },
  "recentMomentum": "..."
}
```

If a PSR agent fails entirely, log the error and continue. Partial PSR findings are still valuable.

Log:
```
Step 3: Wave 0 complete
  Annual Readers: {agentCount} agents, {yearCount} years analyzed, {discrepancyCount} discrepancies
  Quarterly Readers: {agentCount} agents, {quarterCount} quarters analyzed
```

## Step 4: Wave 1 -- Business Fundamentals

### 4a: Read Agent Prompts

Read the v2 prompts:
- `agents-v2/business-analyst-pitchdeck/prompt.md`
- `agents-v2/competitor-evaluator-market-position-pitchdeck/prompt.md`

### 4b: Dispatch Agents Sequentially

**Agent 1: business-analyst** -- Sections: radar (S1), simple_predictable (S2)

Dispatch via Agent tool with:
1. Full contents of `agents-v2/business-analyst-pitchdeck/prompt.md`
2. DataPacket slice (fields from registry) as fenced JSON
3. PSR findings (from Step 3d)
4. One Pager summary for context
5. Task instruction: "Analyze {TICKER} and produce Pitch Deck sections 1 (Radar) and 2 (Simple & Predictable). The DataPacket and PSR findings are provided. Use web search for current information. Return a JSON array containing both section objects matching the ReportSectionSchema defined in your prompt."

Wait for completion. Extract JSON. Save to `.thes1s/reports/{TICKER}/sections/radar.json` and `.thes1s/reports/{TICKER}/sections/simple_predictable.json`.

**Agent 2: competitor-market-position** -- Section: market_position (S3)

Dispatch via Agent tool with:
1. Full contents of `agents-v2/competitor-evaluator-market-position-pitchdeck/prompt.md`
2. DataPacket slice (fields from registry) as fenced JSON
3. PSR findings
4. Sections 1-2 summaries (from business-analyst output)
5. Task instruction: "Analyze {TICKER}'s competitive position and produce section 3 (Market Position). Screen 15+ industry peers. Include market share ceiling analysis. Return a single JSON object matching ReportSectionSchema."

Wait for completion. Extract JSON. Save to `.thes1s/reports/{TICKER}/sections/market_position.json`.

Log:
```
Step 4: Wave 1 -- Business Fundamentals
  business-analyst: radar (S1), simple_predictable (S2)
  competitor-market-position: market_position (S3)
  All 3 sections complete.
```

### 4c: Collect and Validate Wave 1 Outputs

For each section output, validate required fields:
- `key`, `title`, `sectionNumber`, `status`, `confidence`, `verdict`, `verdictRationale`
- `summary`, `narrative` (check length >= 200 chars -- see "Narrative Recovery" below)
- `citations` (array), `redFlags` (array with >= 1 item)
- `searchesPerformed` (non-empty array for business-analyst and competitor sections)

Save each validated section to `.thes1s/reports/{TICKER}/sections/{section_key}.json`.

Log Wave 1 results:
```
Wave 1 complete: 3/3 sections (radar, simple_predictable, market_position)
  S1 Radar: {verdict} ({confidence}) | {citation_count} citations | {red_flag_count} red flags
  S2 Simple & Predictable: {verdict} ({confidence})
  S3 Market Position: {verdict} ({confidence})
```

## Step 6: Wave 2 -- Deep Analysis

### 6a: Read Agent Prompts

Read the v2 prompts:
- `agents-v2/competitor-evaluator-moats-pitchdeck/prompt.md`
- `agents-v2/financial-analyst-pitchdeck/prompt.md`
- `agents-v2/management-evaluator-pitchdeck/prompt.md`

### 6b: Prepare Inter-Wave Context

Collect all Wave 1 section outputs and format as "Prior Analysis Context":

```
## Prior Analysis Context (Wave 1 Findings)

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
{aggregated}
```

### 6c: Dispatch Agents Sequentially

**Agent 1: competitor-moats** -- Section: barriers_moats (S4)

This agent explicitly depends on S3 (Market Position) output.

Dispatch via Agent tool with:
1. Full contents of `agents-v2/competitor-evaluator-moats-pitchdeck/prompt.md`
2. DataPacket slice as fenced JSON
3. PSR findings
4. Wave 1 context (especially full S3 market_position output)
5. One Pager verdict and summary
6. Task instruction: "Validate {TICKER}'s competitive moats and produce section 4 (Barriers & Moats). You receive Section 3 (Market Position) findings as input -- use them as your competitive landscape foundation. Return a single JSON object matching ReportSectionSchema."

Wait for completion. Extract and save.

**Agent 2: financial-analyst** -- Sections: fcf (S5), roe_roic_debt (S7), balance_sheet (S8)

Dispatch via Agent tool with:
1. Full contents of `agents-v2/financial-analyst-pitchdeck/prompt.md`
2. DataPacket slice (heaviest slice -- full financials, growth rates, return metrics, debt metrics, FCF, key metrics, analyst estimates) as fenced JSON
3. PSR findings
4. Wave 1 context + S4 barriers_moats output
5. Supplementary context
6. Task instruction: "Analyze {TICKER}'s financials and produce sections 5 (FCF), 7 (ROE/ROIC/ROA & Debt), and 8 (Balance Sheet). Include dual Owner Earnings (Rule One + Graham). Return a JSON array containing all three section objects matching ReportSectionSchema."

Wait for completion. Extract and save each section separately.

**Agent 3: management-evaluator** -- Section: management (S6)

Dispatch via Agent tool with:
1. Full contents of `agents-v2/management-evaluator-pitchdeck/prompt.md`
2. DataPacket slice as fenced JSON
3. PSR findings
4. Wave 1 context
5. Supplementary context
6. Task instruction: "Evaluate {TICKER}'s management team and produce section 6 (Management). Assess CEO track record, insider ownership, compensation alignment, and Guru ownership context (context only -- NOT a buy signal). Return a single JSON object matching ReportSectionSchema."

Wait for completion. Extract and save.

Log:
```
Step 6: Wave 2 -- Deep Analysis
  competitor-moats: barriers_moats (S4)
  financial-analyst: fcf (S5), roe_roic_debt (S7), balance_sheet (S8)
  management-evaluator: management (S6)
  All 5 sections complete.
```

### 6d: Validate Wave 2 Outputs

Same validation as Wave 1. Check `searchesPerformed` for all agents. Check narrative length. Save sections.

Log Wave 2 results:
```
Wave 2 complete: 5/5 sections (barriers_moats, fcf, management, roe_roic_debt, balance_sheet)
  S4 Barriers & Moats: {verdict} ({confidence})
  S5 FCF: {verdict} ({confidence})
  S6 Management: {verdict} ({confidence})
  S7 ROE/ROIC/Debt: {verdict} ({confidence})
  S8 Balance Sheet: {verdict} ({confidence})
  Cumulative: 8/10 sections complete
```

## Step 8: Wave 3 -- Risk & Valuation

### 8a: Read Agent Prompts

Read:
- `agents-v2/risk-analyst-pitchdeck/prompt.md`
- `agents-v2/valuation-specialist-pitchdeck/prompt.md`

### 8b: Prepare Full Inter-Wave Context

Collect Wave 1 AND Wave 2 section summaries, verdicts, red flags, and cross-cutting findings. This is the richest context any agents receive.

```
## Prior Analysis Context (Wave 1 + Wave 2 Findings)

### Wave 1: Business Fundamentals
[Per-section summaries for S1-S3]

### Wave 2: Deep Analysis
[Per-section summaries for S4-S8]

### Cumulative Red Flags
[Aggregated from all 8 sections]

### Cumulative Cross-Cutting Findings
[Aggregated findings]

### PM-Provided Supplementary Context
[One Pager findings]
```

### 8c: Dispatch Agents Sequentially

**Agent 1: risk-analyst** -- Section: pest (S9)

Dispatch via Agent tool with:
1. Full contents of `agents-v2/risk-analyst-pitchdeck/prompt.md`
2. DataPacket slice as fenced JSON
3. PSR findings
4. Full Wave 1+2 context
5. Supplementary context
6. Task instruction: "Conduct a comprehensive PEST risk analysis for {TICKER}. Produce section 9 (PEST Risks). Apply the 3-red-flag minimum per PEST category. Assess FGR vulnerability. Your bias is bearish -- demolish the bull case or fail trying. Return a single JSON object matching ReportSectionSchema."

Wait for completion. Extract and save.

**Agent 2: valuation-specialist** -- Section: valuation (S10)

Dispatch via Agent tool with:
1. Full contents of `agents-v2/valuation-specialist-pitchdeck/prompt.md`
2. DataPacket slice as fenced JSON
3. PSR findings
4. Full Wave 1+2 context + S9 pest output
5. Supplementary context
6. Task instruction: "Produce the complete valuation analysis for {TICKER} as section 10 (Valuation). Derive FGR using all 5 inputs with evidence. Run all four methods (MOS, PBT, Ten Cap, Equity Bond) with buy price RANGES. Include sensitivity tables. The FGR derivation must be in the section's `data` field with structure: `{ fgrDerivation: { inputs: [...], proposedRange: { low, high }, weightedAverage } }`. Return a single JSON object matching ReportSectionSchema."

Wait for completion. Extract and save.

Log:
```
Step 8: Wave 3 -- Risk & Valuation
  risk-analyst: pest (S9)
  valuation-specialist: valuation (S10)
  Both sections complete.
```

## Step 9: FGR Derivation Sub-Workflow

After the valuation-specialist produces S10, extract the FGR derivation data from the section's `data.fgrDerivation` field (parse `data` if it is a JSON string).

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
  Based on: {weighted average logic}

  Confirm this range (ok) or enter adjusted Low/High:
```

**If PM adjusts any input or the final range:**
1. Update the FGR derivation data with PM-confirmed values
2. Re-run the valuation by dispatching valuation-specialist again with: "Recalculate all valuation methods using PM-confirmed FGR range: Low={low}%, High={high}%. Keep all other inputs from your original analysis. Return updated section 10 JSON."
3. Replace the saved valuation section
4. Regenerate sensitivity tables

Save the final FGR derivation for the report.

Log:
```
Step 9: FGR Derivation complete
  PM-confirmed FGR: {low}% - {high}%
  Inputs: {count}/5 unchanged, {count}/5 adjusted
```

Log Wave 3 results:
```
Wave 3 complete: 2/2 sections (pest, valuation)
  S9 PEST Risks: {verdict} ({confidence})
  S10 Valuation: {verdict} ({confidence})
  FGR Range: {low}% - {high}%
  All 10 analysis sections complete — proceeding to synthesis
```

## Step 11: Wave 4 -- Synthesis

### 11a: Read Synthesis Writer Prompt

Read `agents-v2/synthesis-writer-pitchdeck/prompt.md`.

### 11b: Dispatch Synthesis Writer

The synthesis-writer receives NO raw DataPacket. It works exclusively with section outputs.

Dispatch via Agent tool with:
1. Full contents of `agents-v2/synthesis-writer-pitchdeck/prompt.md`
2. ALL 10 section outputs -- full JSON (verdicts, summaries, narratives, red flags, citations, data fields)
3. PSR findings summary (annual + quarterly key points)
4. One Pager verdict and summary
5. FGR derivation with PM-confirmed values
6. One Pager verdict and summary
7. Task instruction: "Review all 10 Pitch Deck sections for {TICKER}. Check cross-section consistency. Identify contradictions. Produce the overall verdict section (key: 'overall_verdict', sectionNumber: 11). Weight moat and financial sections most heavily, PEST lightest, management as contextual. Return a single JSON object matching ReportSectionSchema with `data` containing: `{ sectionVerdicts: {...}, overallVerdict: 'PASS|FAIL|WATCHLIST', keyStrengths: [...], keyConcerns: [...], nextSteps: [...] }`."

Wait for completion. Extract and save to `.thes1s/reports/{TICKER}/sections/overall_verdict.json`.

**Fallback if synthesis-writer fails:** Use individual section verdicts to compute an overall verdict (majority rule weighted by confidence: HIGH=3, MEDIUM=2, LOW=1).

Log:
```
Step 11: Wave 4 -- Synthesis Writer dispatched
  Overall verdict: {verdict} ({confidence})
```

## Step 12: Assemble Final Report

Collect all 10 sections + synthesis + checkpoints + FGR derivation:

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
  "synthesisNarrative": "{executive summary narrative from synthesis-writer}",
  "sectionKeys": ["radar", "simple_predictable", "market_position", "barriers_moats", "fcf", "management", "roe_roic_debt", "balance_sheet", "pest", "valuation"],
  "onePagerVerdict": "{verdict from gate check}",
  "fgrDerivation": {
    "finalLow": 0.10,
    "finalHigh": 0.14,
    "inputs": [
      { "name": "Historical Composite", "value": 0.123, "source": "...", "confidence": "HIGH", "reasoning": "...", "pmConfirmed": true, "pmAdjusted": false }
    ],
    "proposedRange": { "low": 0.10, "high": 0.14 },
    "weightedAverage": 0.12
  },
  "sensitivityTables": { "mos": {}, "pbt": {}, "tenCap": {}, "equityBond": {} },
  "assumptions": [ /* key assumptions from sections */ ],
  "psrSummary": {
    "annualYearsAnalyzed": 0,
    "quarterlyQuartersAnalyzed": 0,
    "discrepanciesFound": 0,
    "managementPromisesTracked": 0
  },
  "onePagerVerdict": "{from gate check}"
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

## Wave 1: Business Fundamentals

### 1. Radar
{narrative}

**Verdict:** {verdict} | **Confidence:** {confidence}

#### Red Flags
- {list}

---

### 2. Simple & Predictable
{narrative}
...

(repeat for all 10 sections grouped by wave)

---

## FGR Derivation
| Input | Value | Source | Confidence | PM Status |
|-------|-------|--------|------------|-----------|
| Historical Composite | {value}% | {source} | {confidence} | {status} |
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
Step 12: Report assembled
  Sections: 10/10
  Overall verdict: {verdict}
  Total citations: {count}
  Total red flags: {count}
  Output: .thes1s/reports/{TICKER}/pitch-deck.json
  Output: .thes1s/reports/{TICKER}/pitch-deck.md
```

## Step 13: Quality Check

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
  const { formatQualityReport } = await import('./src/engines/qualityFormatter.js');
  const qualityMd = formatQualityReport(quality, { ticker: '{TICKER}', stage: 'pitch-deck' });
  writeFileSync('.thes1s/reports/{TICKER}/quality/pitch-deck.quality.md', qualityMd);
  console.log('Quality report written.');
"
```

**Quality is informational, not blocking.** The report is already saved.

Log quality results:
- Overall quality score (0-100)
- Per-section: score, issue counts by severity
- List any HIGH severity issues verbatim

## Step 14: Budget Tracking

```bash
node --import ./scripts/node-esm-loader.js -e "
  import { createBudgetTracker, formatBudgetReport } from './src/engines/contextBudget.js';
  import { readFileSync, writeFileSync, existsSync } from 'fs';
  const report = JSON.parse(readFileSync('.thes1s/reports/{TICKER}/pitch-deck.json', 'utf8'));
  const tracker = createBudgetTracker();
  const annualPSR = existsSync('.thes1s/reports/{TICKER}/sections/annual-reader-insights.json')
    ? JSON.parse(readFileSync('.thes1s/reports/{TICKER}/sections/annual-reader-insights.json', 'utf8'))
    : null;
  const quarterlyPSR = existsSync('.thes1s/reports/{TICKER}/sections/quarterly-reader-insights.json')
    ? JSON.parse(readFileSync('.thes1s/reports/{TICKER}/sections/quarterly-reader-insights.json', 'utf8'))
    : null;
  if (annualPSR) {
    const chars = JSON.stringify(annualPSR).length;
    tracker.record('annual-reader', 'pre-processing', chars * 10, chars, 'claude-sonnet-4-6');
  }
  if (quarterlyPSR) {
    const chars = JSON.stringify(quarterlyPSR).length;
    tracker.record('quarterly-reader', 'pre-processing', chars * 10, chars, 'claude-sonnet-4-6');
  }
  for (const section of report.sections) {
    const tc = section.tokenCost || { input: 0, output: 0 };
    const model = section.modelUsed || 'claude-sonnet-4-6';
    const agentMap = {
      radar: 'business-analyst', simple_predictable: 'business-analyst',
      market_position: 'competitor-market-position', barriers_moats: 'competitor-moats',
      fcf: 'financial-analyst', management: 'management-evaluator',
      roe_roic_debt: 'financial-analyst', balance_sheet: 'financial-analyst',
      pest: 'risk-analyst', valuation: 'valuation-specialist'
    };
    tracker.record(agentMap[section.key] || 'unknown', section.key, tc.input || 0, tc.output || 0, model);
  }
  const summary = tracker.getSummary();
  let existing = {};
  if (existsSync('.thes1s/reports/{TICKER}/budget.json')) {
    existing = JSON.parse(readFileSync('.thes1s/reports/{TICKER}/budget.json', 'utf8'));
  }
  const combined = { ...existing, pitchDeck: summary };
  writeFileSync('.thes1s/reports/{TICKER}/budget.json', JSON.stringify(combined, null, 2));
  console.log(formatBudgetReport(summary));
"
```

**Budget tracking is observational** -- never blocks execution.

## Step 15: Finalize Observatory Capture

Parse the `<usage>` block from the overall session (aggregate across all subagent calls if available). Then run:

```bash
node scripts/observatory-finalize.js {RUN_ID} .thes1s/reports/{TICKER}/pitch-deck.json --verdict {OVERALL_VERDICT} --tokens {TOTAL_TOKENS} --tool-uses {TOOL_USES} --duration {DURATION_SECONDS}
```

Where:
- `{RUN_ID}` is from Step 2.5
- `{OVERALL_VERDICT}` is the final verdict (PASS, FAIL, or WATCHLIST)
- Token/tool/duration values are best-effort estimates from subagent usage blocks

If this fails, print a warning and continue -- observatory is non-blocking.

## Step 16: Generate PDF

Generate the Thes1s-branded Pitch Deck PDF:

```bash
python3 scripts/pdf/generate_pitch_deck_pdf.py {TICKER}
```

This reads `.thes1s/reports/{TICKER}/pitch-deck.json` + `data-packet.json` and produces a branded PDF with charts, tables, and section narratives. If it fails, print a warning and continue — the JSON output is the primary artifact.

## Step 17: Print Final Summary

```
================================================================
  PITCH DECK GENERATION COMPLETE: {TICKER}
================================================================

Sections completed: {X}/10
Overall verdict: {PASS/FAIL/WATCHLIST} ({confidence})

--- Section Verdicts ---
  1.  Radar:                {verdict} ({confidence})
  2.  Simple & Predictable: {verdict} ({confidence})
  3.  Market Position:      {verdict} ({confidence})
  4.  Barriers & Moats:     {verdict} ({confidence})
  5.  Free Cash Flow:       {verdict} ({confidence})
  6.  Management:           {verdict} ({confidence})
  7.  ROE/ROIC & Debt:      {verdict} ({confidence})
  8.  Balance Sheet:         {verdict} ({confidence})
  9.  PEST Risks:           {verdict} ({confidence})
  10. Valuation:            {verdict} ({confidence})

--- FGR ---
  Range: {low}% - {high}%

--- Buy Price Range ---
  Combined: ${min} - ${max} (current: ${currentPrice})

--- Quality ---
  Score: {score}/100
  Issues: {count} (high: {N}, medium: {N}, low: {N})

--- Primary Source Reading ---
  Annual: {yearCount} years of 10-Ks analyzed
  Quarterly: {quarterCount} quarters analyzed
  Discrepancies: {count}

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

---

## JSON Extraction Fallback Chain

After every subagent completes, extract JSON from the response using this chain:

1. Look for a JSON code block (` ```json ... ``` `) in the response text
2. If not found, look for a raw JSON object/array (first `{` or `[` to matching closing)
3. If not found, locate the first `{` and last `}` (or `[`/`]`) and attempt parse
4. Parse the extracted JSON
5. If all parsing fails, retry once -- dispatch the same agent with the original prompt plus: "Your previous response could not be parsed as JSON. Output ONLY the raw JSON -- no markdown fences, no commentary. Start with `{` or `[` and end with `}` or `]`."
6. If retry also fails, create a minimal section with `status: "failed"` and save the raw response text in a `.thes1s/reports/{TICKER}/sections/{key}-raw.txt` file for debugging.

**For multi-section agents** (business-analyst returns 2, financial-analyst returns 3):
- Parse the JSON array
- Split into individual section objects by `key` field
- Save each to its own file

## Narrative Recovery

After extracting section JSON, check each section's `narrative` field:
- If `narrative.length < 200`: The agent likely produced a stub.
  1. Search the agent's full response text for substantial prose (markdown with ## headings, > 200 chars)
  2. If found, inject it into the section's `narrative` field and re-save
  3. If no recoverable narrative found, retry the agent once with: "Your previous output had a {length}-char narrative stub. The narrative field MUST contain your FULL analysis (500+ words). Write the complete narrative."
  4. If retry also produces a stub, save with a warning and continue

## Retry Logic

If any agent fails entirely (rate limit, timeout, error):
1. Wait 30 seconds
2. Re-dispatch with the same prompt
3. If the retry also fails, log the error, save partial output with `status: "failed"`, and continue
4. Do NOT retry more than once -- the PM can re-run individual sections at checkpoints

## Constraints

### Contamination Boundary (CRITICAL)
During generation, NEVER read from any of these paths:
- `knowledge/stage-1-one-pager/examples/`
- `knowledge/stage-2-pitch-deck/examples/`
- `knowledge/stage-3-full-story/examples/`
- `knowledge/pre-course-examples/`

These contain the user's manual research examples. Agents must generate from their v2 prompt (which has curriculum baked in) + DataPacket + PSR findings alone.

### Schema Enforcement
Every section output MUST conform to ReportSectionSchema. Required fields: `key`, `title`, `sectionNumber`, `status`, `confidence`, `verdict`, `verdictRationale`, `summary`, `data`, `narrative`, `citations`, `redFlags` (>= 1), `modelUsed`, `tokenCost`.

### Error Resilience
- If a PSR agent fails, continue without its findings -- downstream agents work with DataPacket alone.
- If a wave agent fails entirely after retry, log the error, save what succeeded, continue to next wave.
- If some sections fail validation after retry, assemble the report with valid sections.
- If the synthesis-writer fails, use individual section verdicts (majority rule weighted by confidence).
- The pipeline ALWAYS produces partial results rather than nothing.

### Inter-Wave Context
Each wave receives context from all prior waves:
- Wave 0: DataPacket + filings
- Wave 1: DataPacket + PSR findings
- Wave 2: DataPacket + PSR findings + Wave 1 outputs
- Wave 3: DataPacket + PSR findings + Wave 1 + Wave 2 outputs
- Wave 4 (synthesis): All section outputs + PSR findings + FGR derivation

### Checkpoint Interaction Model
The pipeline runs end-to-end without stopping. Log wave results between waves for observability, but do not pause for PM input.

### Agent Model Selection
**Model assignments are controlled variables** (from managed-agent.yaml configs). When dispatching each agent via the Agent tool, use the `model` parameter from the Agent Registry above. Defaults: quarterly-reader, risk-analyst, and valuation-specialist use **opus**; all others use **sonnet**. The observatory tracks which model each agent used so DOE experiments can measure the effect of model swaps on quality and cost.

### Progress Display
```
Step 1:   Validating input and gate check...
Step 2:   Preparing data for {TICKER}...
Step 2.5: Observatory initialized
Step 3:   Wave 0 -- Primary Source Reading (annual + quarterly)...
Step 4:   Wave 1 -- Business Fundamentals (3 sections)...
Step 5:   Log Wave 1 results
Step 6:   Wave 2 -- Deep Analysis (5 sections)...
Step 7:   Log Wave 2 results
Step 8:   Wave 3 -- Risk & Valuation (2 sections)...
Step 9:   FGR Derivation -- PM confirmation [INTERACTIVE]
Step 10:  Log Wave 3 results
Step 11:  Wave 4 -- Synthesis Writer...
Step 12:  Assembling final report...
Step 13:  Running quality checks...
Step 14:  Tracking token budget...
Step 15:  Finalizing observatory capture...
Step 16:  Generation complete.
```
