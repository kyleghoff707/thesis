---
name: generate-pitch-deck
description: Generate a 10-section Rule One Pitch Deck using v2 agent prompts, Claude Code subagent orchestration, 5-wave dispatch, and FGR derivation
argument-hint: TICKER
disable-model-invocation: true
---

# Generate Pitch Deck (v2)

Generate a complete 10-section Rule One Pitch Deck investment analysis for **$0**.

Orchestrates 10 specialist agents across 5 waves via Claude Code Agent tool dispatch, preceded by Primary Source Reading (annual + quarterly), with an FGR derivation sub-workflow. Runs end-to-end without stopping.

---

## Agent Registry

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
    model: sonnet
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
    model: sonnet
    sections: [pest]
    wave: 3
    dpFields: [companyInfo, classification, financials, ttm, growthRates, peers, insiders, caveats]

  valuation-specialist:
    prompt: agents-v2/valuation-specialist-pitchdeck/prompt.md
    model: sonnet
    sections: [valuation]
    wave: 3
    dpFields: [companyInfo, classification, financials, ttm, growthRates, returnMetrics, fcf, keyMetrics, caveats]

  synthesis-writer:
    prompt: agents-v2/synthesis-writer-pitchdeck/prompt.md
    model: sonnet
    sections: [overall_verdict]
    wave: 4
    dpFields: []
```

## Wave Structure

```
Wave 0 (PSR):       annual-reader (1 per 10-K, up to 5) + quarterly-reader (10-Qs + transcripts)
Wave 1 (Business):  business-analyst + competitor-market-position
Wave 2 (Deep):      competitor-moats (needs S3) + financial-analyst + management-evaluator
Wave 3 (Risk/Val):  risk-analyst + valuation-specialist
Wave 4 (Synthesis): synthesis-writer
```

Agents within a wave dispatch **in parallel** (multiple Agent tool calls in a single message). Waves run strictly sequential.

---

## CRITICAL RULES

**DataPacket Slicing.** You MUST NOT pass the full DataPacket file path to agents. Use `node scripts/slice-datapacket.js {TICKER} {agent-role}` and embed the output as a fenced JSON block. One bash call per agent. Do NOT manually extract fields or instruct the agent to read the file.

**Full-Fidelity Output Saving.** When an agent returns its result, write the COMPLETE extracted JSON to disk via the Write tool. Do NOT reconstruct from memory. Do NOT save stub sections. Section files must be 10-50KB; if any saved file is under 5KB, you saved a stub — re-extract from the agent response. This rule is non-negotiable; saving stubs invalidates the run.

## Step 1: Validate Input and Gate Check

The ticker symbol is `$0`. Uppercase it and store as `TICKER`.

If `$0` is empty, print usage `/generate-pitch-deck TICKER` and stop.

Clean stale data:
```bash
rm -rf .thes1s/reports/{TICKER}/sections/
rm -rf .thes1s/reports/{TICKER}/filings-md/
rm -rf .thes1s/reports/{TICKER}/transcripts/
rm -rf .thes1s/reports/{TICKER}/quality/
```

Create `.thes1s/reports/{TICKER}/sections/` and `.thes1s/reports/{TICKER}/quality/`.

**Gate Check.** Read `.thes1s/reports/{TICKER}/one-pager.json`. Verify it exists and `overallVerdict` is set. If not, print:
```
Gate check FAILED: One Pager must exist with a verdict.
Run /generate-one-pager {TICKER} first.
```
And stop. Store the one-pager data — synthesis-writer references it.

## Step 2: Prepare Data

```bash
node --loader ./scripts/node-esm-loader.js scripts/prepare-data.js {TICKER}
```

Runs gate check, init status, DataPacket assembly (EDGAR/SEC + gurus), transcript pre-fetch (Alpha Vantage), filing pre-process (5 10-Ks + 4 10-Qs to markdown), data quality checkpoint.

Parse the JSON summary from stdout for `checkpointVerdict`, `dataPacketFields`, `guruCount`, `transcriptsSaved`, `errors`, `timings`.

**Exit code 1 (BLOCKED):** Critical fields missing. Print full checkpoint summary, ask PM:
1. Provide file paths or paste data to fill gaps
2. Re-run prepare-data.js
3. Abort

Save PM-provided data to `.thes1s/reports/{TICKER}/pm-supplementary.md`, re-run prepare-data.js to verify.

**Exit code 0 (PROCEED):** Print summary and continue.

## Step 2.5: Initialize Observatory

```bash
node scripts/observatory-init.js {TICKER} pitchDeck .thes1s/reports/{TICKER}/data-packet.json
```

Capture the **last line of output** as `RUN_ID`. Retry once on failure.

## Step 3: Wave 0 — Primary Source Reading (PARALLEL)

Read the DataPacket from `.thes1s/reports/{TICKER}/data-packet.json`.

### 3a: Read PSR Agent Prompts

- `agents-v2/annual-reader/prompt.md`
- `agents-v2/quarterly-reader/prompt.md`

### 3b: PARALLEL DISPATCH — All PSR Agents (Single Message)

> **CRITICAL: Send ALL PSR Agent tool calls in a SINGLE message.**
> Up to 5 annual readers (one per 10-K) PLUS 1-N quarterly batches — ALL in one parallel dispatch.
> Annual readers and quarterly readers are independent. Quarterly readers do NOT receive annual findings — they extract their own quarterly evidence (trends, guidance changes, transcript commitments). Cross-period reconciliation (matching annual long-term promises to quarterly short-term execution) happens at the merge step (3c), NOT inside the agents.
> Sequential annual-then-quarterly dispatch costs ~10 minutes of wall time and provides zero quality benefit.
> Anti-pattern to avoid: dispatching annual readers, waiting for them to finish, then dispatching quarterly readers. Do NOT do this.

Identify all 10-K filings from `.thes1s/reports/{TICKER}/filings-md/`. Sort chronologically, oldest first. Up to 5. Identify all 10-Q filings, sort chronologically, split into batches of 4.

In a single message, dispatch:
- **One Agent call per 10-K** (annual reader)
- **One Agent call per 10-Q batch** (quarterly reader)

#### Annual Reader Dispatch (one per 10-K)

For each 10-K, the prompt is concatenated as:
1. Full contents of `agents-v2/annual-reader/prompt.md`
2. DataPacket slice: `companyInfo`, `classification`, `financials` (this year + prior year), `ttm`, `filings`, `caveats` — fenced JSON
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
4. If NOT the first year, brief summary of prior year's key findings (intra-annual context — annual reader processes its own years chronologically)
5. Task: "Read {TICKER}'s FY{year} 10-K filing provided above. This is year {N} of {total}. Extract: (1) Business model changes, (2) New/changed risk factors, (3) Management's financial discussion, (4) Financial data cross-validation against DataPacket — flag discrepancies with severity (low <1%, medium 1-5%, high >5%), (5) Acquisition disclosures, (6) Management promises and strategic priorities. Return as JSON matching your prompt's output format."

#### Quarterly Reader Dispatch (one per batch, max 4 10-Qs per batch)

For each batch, the prompt is concatenated as:
1. Full contents of `agents-v2/quarterly-reader/prompt.md`
2. DataPacket slice: same fields as annual reader
3. All sections from each 10-Q in the batch
4. Earnings transcripts from `.thes1s/reports/{TICKER}/transcripts/`:
```
## Earnings Call Transcript: Q{N} FY{YYYY}
{full transcript text}
```
   If no transcripts: "## Earnings Call Transcripts: UNAVAILABLE — flag as data gap."
5. Task: "Read {TICKER}'s quarterly SEC filings covering Q{start} through Q{end}. Cross-reference transcripts against 10-Q filings. Extract quarterly trends, guidance changes, short-term promise tracking (quarter-to-quarter), and cross-validate financials. You run in parallel with the annual reader — cross-period reconciliation between annual long-term promises and your quarterly evidence happens at the merge step, not in your output. Return as JSON matching your prompt's output format."

If an agent fails entirely, wait 30 seconds and retry once.

### 3c: Collect, Merge, and Reconcile PSR Outputs

After all PSR agents return:
1. Extract JSON from each agent response (see JSON Extraction Fallback Chain)
2. Merge annual reader outputs into `annual-reader-insights.json` (combine per-year findings, aggregate discrepancies, compile strategic themes and long-term management promises). Write to `.thes1s/reports/{TICKER}/sections/annual-reader-insights.json`.
3. Merge quarterly reader outputs into `quarterly-reader-insights.json` (combine per-batch findings, aggregate guidance evolution, compile short-term promise tracking). Write to same dir.
4. **Cross-period reconciliation** (this used to happen implicitly inside the quarterly reader; now it happens here): walk the annual `managementPromises[]` and check whether quarterly `guidanceEvolution` honors, abandons, or contradicts each long-term promise. Add a `promiseReconciliation[]` array per promise: `{ promise, source, status: "honored|abandoned|contradicted|unmentioned", quarterlyEvidence }`.
5. Build combined `psrFindings` for downstream agents:
```json
{
  "annualInsights": { /* merged */ },
  "quarterlyInsights": { /* merged */ },
  "discrepancies": [ /* combined */ ],
  "managementPromises": [ /* from annual */ ],
  "guidanceEvolution": { /* from quarterly */ },
  "promiseReconciliation": [ /* annual ↔ quarterly cross-check */ ],
  "recentMomentum": "..."
}
```

If a PSR agent fails entirely, log the error and continue. Partial PSR is still valuable.

## Step 4: Wave 1 — Business Fundamentals

### 4a: Read Agent Prompts

- `agents-v2/business-analyst-pitchdeck/prompt.md`
- `agents-v2/competitor-evaluator-market-position-pitchdeck/prompt.md`

### 4b: PARALLEL DISPATCH — Single Message

Dispatch BOTH agents in a single message (2 Agent tool calls).

**Agent 1: business-analyst** — sections: radar (S1), simple_predictable (S2)
1. Full prompt
2. DataPacket slice
3. PSR findings
4. One Pager summary
5. Task: "Analyze {TICKER} and produce Pitch Deck sections 1 (Radar) and 2 (Simple & Predictable). Use web search for current information. Return a JSON array containing both section objects matching ReportSectionSchema."

**Agent 2: competitor-market-position** — section: market_position (S3)
1. Full prompt
2. DataPacket slice
3. PSR findings
4. Sections 1-2 summaries
5. Task: "Analyze {TICKER}'s competitive position and produce section 3. Screen 15+ industry peers. Include market share ceiling analysis. Return a single JSON object matching ReportSectionSchema."

After BOTH return, extract COMPLETE JSON from each response and Write to disk. Save to `sections/radar.json`, `sections/simple_predictable.json`, `sections/market_position.json`. Each 10-50KB.

#### Observatory Recording

Per-agent usage: parse each subagent's `<usage>` block:
```
<usage>total_tokens: 24500
tool_uses: 8
duration_ms: 187000</usage>
```

Pass to record-agent: `{AGENT_TOTAL_TOKENS}` = total_tokens, `{SECONDS_ELAPSED}` = duration_ms / 1000, `{AGENT_WEB_SEARCHES}` = count `web_search` tool calls explicitly if visible, else `max(0, tool_uses - 2)` for Wave 0 PSR readers, `max(0, tool_uses - 1)` for analysis agents.

Always pass `--tokens` and `--web-searches`. Without them, `usage.cost` records as $0.

```bash
node scripts/observatory-record-agent.js {RUN_ID} \
  --role business-analyst --wave 1 --stage pitchDeck \
  --sections "radar,simple_predictable" --model claude-sonnet-4-6 \
  --duration {SECONDS_ELAPSED} --verdict {VERDICT} --confidence {CONFIDENCE} \
  --citations {CITATION_COUNT} --red-flags {RED_FLAG_COUNT} --narrative-length {NARRATIVE_LENGTH} \
  --tokens {AGENT_TOTAL_TOKENS} --web-searches {AGENT_WEB_SEARCHES}

node scripts/observatory-record-agent.js {RUN_ID} \
  --role competitor-market-position --wave 1 --stage pitchDeck \
  --sections "market_position" --model claude-sonnet-4-6 \
  --duration {SECONDS_ELAPSED} --verdict {VERDICT} --confidence {CONFIDENCE} \
  --citations {CITATION_COUNT} --red-flags {RED_FLAG_COUNT} --narrative-length {NARRATIVE_LENGTH} \
  --tokens {AGENT_TOTAL_TOKENS} --web-searches {AGENT_WEB_SEARCHES}

node scripts/observatory-record-event.js {RUN_ID} dispatch \
  --wave 1 --stage "Business Fundamentals" \
  --agents "business-analyst,competitor-market-position" --parallel true --duration {WAVE_DURATION_SECONDS}
```

### 4c: Validate Wave 1 Outputs

Required fields per section: `key`, `title`, `sectionNumber`, `status`, `confidence`, `verdict`, `verdictRationale`, `summary`, `narrative` (>= 200 chars — see Narrative Recovery), `citations`, `redFlags` (>= 1), `searchesPerformed` (non-empty).

## Step 6: Wave 2 — Deep Analysis

### 6a: Read Agent Prompts

- `agents-v2/competitor-evaluator-moats-pitchdeck/prompt.md`
- `agents-v2/financial-analyst-pitchdeck/prompt.md`
- `agents-v2/management-evaluator-pitchdeck/prompt.md`

### 6b: Prepare Wave 1 Context

Format Wave 1 outputs as "Prior Analysis Context" — per-section summary + verdict + confidence + red flags + cross-cutting findings.

### 6c: PARALLEL DISPATCH — Single Message

Dispatch ALL 3 agents in a single message (3 Agent tool calls).

**Agent 1: competitor-moats** — section: barriers_moats (S4). Depends on S3.
1. Full prompt
2. DataPacket slice
3. PSR findings
4. Wave 1 context (especially full S3 market_position)
5. One Pager verdict + summary
6. Task: "Validate {TICKER}'s competitive moats and produce section 4 (Barriers & Moats). Use Section 3 (Market Position) findings as competitive landscape foundation. Return a single JSON object matching ReportSectionSchema."

**Agent 2: financial-analyst** — sections: fcf (S5), roe_roic_debt (S7), balance_sheet (S8)
1. Full prompt
2. DataPacket slice (full financials, growth rates, return metrics, debt metrics, FCF, key metrics, analyst estimates)
3. PSR findings
4. Wave 1 context + S4 barriers_moats
5. Task: "Analyze {TICKER}'s financials and produce sections 5 (FCF), 7 (ROE/ROIC/ROA & Debt), and 8 (Balance Sheet). Include dual Owner Earnings (Rule One + Graham). Return a JSON array containing all three section objects matching ReportSectionSchema."

**Agent 3: management-evaluator** — section: management (S6)
1. Full prompt
2. DataPacket slice
3. PSR findings
4. Wave 1 context
5. Task: "Evaluate {TICKER}'s management team and produce section 6. Assess CEO track record, insider ownership, compensation alignment, and Guru ownership context (context only — NOT a buy signal). Return a single JSON object matching ReportSectionSchema."

After ALL 3 return, extract COMPLETE JSON and Write to disk. Each file 10-50KB.

#### Observatory Recording

```bash
node scripts/observatory-record-agent.js {RUN_ID} \
  --role competitor-moats --wave 2 --stage pitchDeck \
  --sections "barriers_moats" --model claude-sonnet-4-6 \
  --duration {SECONDS_ELAPSED} --verdict {VERDICT} --confidence {CONFIDENCE} \
  --citations {CITATION_COUNT} --red-flags {RED_FLAG_COUNT} --narrative-length {NARRATIVE_LENGTH} \
  --tokens {AGENT_TOTAL_TOKENS} --web-searches {AGENT_WEB_SEARCHES}

node scripts/observatory-record-agent.js {RUN_ID} \
  --role financial-analyst --wave 2 --stage pitchDeck \
  --sections "fcf,roe_roic_debt,balance_sheet" --model claude-sonnet-4-6 \
  --duration {SECONDS_ELAPSED} --verdict {VERDICT} --confidence {CONFIDENCE} \
  --citations {CITATION_COUNT} --red-flags {RED_FLAG_COUNT} --narrative-length {NARRATIVE_LENGTH} \
  --tokens {AGENT_TOTAL_TOKENS} --web-searches {AGENT_WEB_SEARCHES}

node scripts/observatory-record-agent.js {RUN_ID} \
  --role management-evaluator --wave 2 --stage pitchDeck \
  --sections "management" --model claude-sonnet-4-6 \
  --duration {SECONDS_ELAPSED} --verdict {VERDICT} --confidence {CONFIDENCE} \
  --citations {CITATION_COUNT} --red-flags {RED_FLAG_COUNT} --narrative-length {NARRATIVE_LENGTH} \
  --tokens {AGENT_TOTAL_TOKENS} --web-searches {AGENT_WEB_SEARCHES}

node scripts/observatory-record-event.js {RUN_ID} dispatch \
  --wave 2 --stage "Deep Analysis" \
  --agents "competitor-moats,financial-analyst,management-evaluator" --parallel true --duration {WAVE_DURATION_SECONDS}
```

### 6d: Validate Wave 2 Outputs

Same validation as Wave 1.

## Step 8: Wave 3 — Risk & Valuation

### 8a: Read Agent Prompts

- `agents-v2/risk-analyst-pitchdeck/prompt.md`
- `agents-v2/valuation-specialist-pitchdeck/prompt.md`

### 8b: Prepare Wave 1 + Wave 2 Context

Wave 1 + Wave 2 per-section summaries + verdicts + cumulative red flags + cumulative cross-cutting findings + One Pager findings.

### 8c: PARALLEL DISPATCH — Single Message

Dispatch BOTH agents in a single message (2 Agent tool calls).

**Agent 1: risk-analyst** — section: pest (S9)
1. Full prompt
2. DataPacket slice
3. PSR findings
4. Full Wave 1+2 context
5. Task: "Conduct a comprehensive PEST risk analysis for {TICKER}. Produce section 9. Apply 3-red-flag minimum per PEST category. Assess FGR vulnerability. Pressure-test the bull case with the strongest evidence-based challenges. Classify each risk by severity (thesis-killing / material but manageable / speculative or already priced in). Return a single JSON object matching ReportSectionSchema."

**Agent 2: valuation-specialist** — section: valuation (S10)
1. Full prompt
2. DataPacket slice
3. PSR findings
4. Full Wave 1+2 context + S9 pest
5. Task: "Produce the complete valuation analysis for {TICKER} as section 10. Derive FGR using all 5 inputs with evidence. Run all four methods (MOS, PBT, Ten Cap, Equity Bond) with buy price RANGES. Include sensitivity tables. The FGR derivation must be in the section's `data` field with structure: `{ fgrDerivation: { inputs: [...], proposedRange: { low, high }, weightedAverage } }`. Return a single JSON object matching ReportSectionSchema."

After BOTH return, extract JSON and save.

#### Observatory Recording

```bash
node scripts/observatory-record-agent.js {RUN_ID} \
  --role risk-analyst --wave 3 --stage pitchDeck \
  --sections "pest" --model claude-sonnet-4-6 \
  --duration {SECONDS_ELAPSED} --verdict {VERDICT} --confidence {CONFIDENCE} \
  --citations {CITATION_COUNT} --red-flags {RED_FLAG_COUNT} --narrative-length {NARRATIVE_LENGTH} \
  --tokens {AGENT_TOTAL_TOKENS} --web-searches {AGENT_WEB_SEARCHES}

node scripts/observatory-record-agent.js {RUN_ID} \
  --role valuation-specialist --wave 3 --stage pitchDeck \
  --sections "valuation" --model claude-sonnet-4-6 \
  --duration {SECONDS_ELAPSED} --verdict {VERDICT} --confidence {CONFIDENCE} \
  --citations {CITATION_COUNT} --red-flags {RED_FLAG_COUNT} --narrative-length {NARRATIVE_LENGTH} \
  --tokens {AGENT_TOTAL_TOKENS} --web-searches {AGENT_WEB_SEARCHES}

node scripts/observatory-record-event.js {RUN_ID} dispatch \
  --wave 3 --stage "Risk & Valuation" \
  --agents "risk-analyst,valuation-specialist" --parallel true --duration {WAVE_DURATION_SECONDS}
```

## Step 9: FGR Derivation Sub-Workflow

Extract FGR derivation from S10's `data.fgrDerivation` field (parse `data` if it is a JSON string).

Present each input to the PM:

```
================================================================
  FGR DERIVATION for {TICKER}
================================================================

--- Input 1: Historical Composite (Rear View Mirror) ---
  Value: {value}%
  Source: {source}
  Confidence: {confidence}
  Reasoning: {reasoning}

  Confirm or enter adjusted value (or 'ok' to accept):
```

Repeat for all 5 FGR inputs:
1. **Historical Composite** — BVPS+Div, Earnings, OpCash, Revenue CAGRs
2. **Market Relativity** — Cumulative stockholder return vs S&P 500 and sector
3. **Company Guidance** — Management's stated growth plans
4. **Sector/Industry** — Industry CAGR from trade journals
5. **Analysts** — Wall St consensus, revenue growth estimates

After PM confirms all 5, present proposed range:

```
--- Proposed FGR Range ---
  Low: {low}%
  High: {high}%
  Based on: {weighted average logic}

  Confirm or enter adjusted Low/High:
```

**If PM adjusts any input or the final range:**
1. Update the FGR derivation data with PM-confirmed values
2. Re-dispatch valuation-specialist: "Recalculate all valuation methods using PM-confirmed FGR range: Low={low}%, High={high}%. Keep all other inputs from your original analysis. Return updated section 10 JSON."
3. Replace the saved valuation section
4. Regenerate sensitivity tables

Save the final FGR derivation for the report.

## Step 11: Wave 4 — Synthesis

### 11a: Read Synthesis Writer Prompt

`agents-v2/synthesis-writer-pitchdeck/prompt.md`

### 11b: Dispatch Synthesis Writer

Receives NO raw DataPacket. Works exclusively from section outputs.

Dispatch via Agent tool with:
1. Full prompt
2. ALL 10 section outputs (full JSON — verdicts, summaries, narratives, red flags, citations, data fields)
3. PSR findings summary
4. One Pager verdict + summary
5. FGR derivation with PM-confirmed values
6. Task: "Review all 10 Pitch Deck sections for {TICKER}. Check cross-section consistency. Identify contradictions. Produce the overall verdict section (key: 'overall_verdict', sectionNumber: 11). Weight moat and financial sections most heavily, PEST lightest, management as contextual. Return a single JSON object matching ReportSectionSchema with `data` containing: `{ sectionVerdicts: {...}, overallVerdict: 'PASS|FAIL|WATCHLIST', keyStrengths: [...], keyConcerns: [...], nextSteps: [...] }`."

Wait for completion. Save to `.thes1s/reports/{TICKER}/sections/overall_verdict.json`.

**Fallback if synthesis-writer fails:** Compute overall verdict from individual section verdicts (majority rule weighted by confidence: HIGH=3, MEDIUM=2, LOW=1).

#### Observatory Recording

```bash
node scripts/observatory-record-agent.js {RUN_ID} \
  --role synthesis-writer --wave 4 --stage pitchDeck \
  --sections "overall_verdict" --model claude-sonnet-4-6 \
  --duration {SECONDS_ELAPSED} --verdict {OVERALL_VERDICT} --confidence {CONFIDENCE} \
  --citations {CITATION_COUNT} --red-flags {RED_FLAG_COUNT} --narrative-length {NARRATIVE_LENGTH} \
  --tokens {AGENT_TOTAL_TOKENS} --web-searches {AGENT_WEB_SEARCHES}

node scripts/observatory-record-event.js {RUN_ID} dispatch \
  --wave 4 --stage "Synthesis" \
  --agents "synthesis-writer" --parallel false --duration {WAVE_DURATION_SECONDS}
```

## Step 12: Assemble Final Report

Collect all **11 sections** (S1-S10 + S11 synthesis) + checkpoints + FGR derivation. The synthesis-writer's output is a full ReportSectionSchema object with `key: "overall_verdict"`, `sectionNumber: 11`. Append it to `sections[]` as the 11th element. The top-level `overallVerdict`/`verdictRationale`/`synthesisNarrative` are MIRRORS of section 11.

```json
{
  "ticker": "{TICKER}",
  "companyName": "{from DataPacket companyInfo}",
  "stage": "pitchDeck",
  "generatedAt": "{ISO timestamp}",
  "sections": [
    /* 11 ReportSectionSchema objects ordered by sectionNumber:
         S1  radar              (business-analyst)
         S2  simple_predictable (business-analyst)
         S3  market_position    (competitor-market-position)
         S4  barriers_moats     (competitor-moats)
         S5  fcf                (financial-analyst)
         S6  management         (management-evaluator)
         S7  roe_roic_debt      (financial-analyst)
         S8  balance_sheet      (financial-analyst)
         S9  pest               (risk-analyst)
         S10 valuation          (valuation-specialist)
         S11 overall_verdict    (synthesis-writer)  ← MUST BE IN THE ARRAY
    */
  ],
  "overallVerdict": "{MIRROR of sections[10].verdict}",
  "verdictRationale": "{MIRROR of sections[10].verdictRationale}",
  "synthesisNarrative": "{MIRROR of sections[10].narrative}",
  "sectionKeys": ["radar", "simple_predictable", "market_position", "barriers_moats", "fcf", "management", "roe_roic_debt", "balance_sheet", "pest", "valuation", "overall_verdict"],
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
  }
}
```

Write JSON to `.thes1s/reports/{TICKER}/pitch-deck.json`.

Generate human-readable markdown at `.thes1s/reports/{TICKER}/pitch-deck.md`. Structure: title + verdict + FGR range header → Executive Summary (synthesisNarrative) → all 10 sections grouped by wave with narrative + verdict + red flags → FGR Derivation table → Buy Price Ranges table → Sensitivity Tables → Citations.

## Step 13: Quality Check

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

Quality is informational. Print overall score, per-section scores + issue counts by severity, list any HIGH severity issues verbatim.

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

## Step 14.4: Section Count Contract Check

```bash
node -e "
const r = JSON.parse(require('fs').readFileSync('.thes1s/reports/{TICKER}/pitch-deck.json','utf8'));
const sections = r.sections || [];
const maxSectionNumber = sections.reduce((m,s) => Math.max(m, s.sectionNumber || 0), 0);
console.log('sections.length:', sections.length);
console.log('max sectionNumber in array:', maxSectionNumber);
console.log('has overall_verdict in sections:', sections.some(s => s.key === 'overall_verdict'));
if (sections.length !== 11 || maxSectionNumber !== 11 || !sections.some(s => s.key === 'overall_verdict')) {
  console.error('CONTRACT VIOLATION: pitch deck must have 11 sections with overall_verdict as section 11');
  process.exit(1);
}
console.log('✓ contract check passed');
"
```

If this fails, do NOT proceed. Go back to Step 12, append `sections/overall_verdict.json` as the 11th element. Record:

```bash
node scripts/observatory-record-event.js {RUN_ID} format-violation \
  --agent synthesis-writer --violation "overall_verdict excluded from sections[] during assembly" --fix-applied true
```

## Step 14.5: Pre-Finalize Event Sweep

Log every event the in-the-moment work missed. **When in doubt, log it.**

```
Retries:
  [ ] Did any agent timeout, stall, or fail and get re-dispatched?         → retry (+ stall if >15min)
  [ ] Did any agent require a second prompt to produce valid JSON?          → retry, reason: "JSON parse failed"
  [ ] Did any agent require a second prompt for a full narrative?           → retry, reason: "narrative stub"
  [ ] Did you trim any agent's context/prompt and re-dispatch?              → retry, reason: "trimmed prompt"

Stalls:
  [ ] Did any sonnet agent run >15min?                                      → stall
  [ ] Did any "Stream idle timeout" or partial-response error occur?        → stall

Format violations:
  [ ] Did any agent use markdown fences?                                    → format-violation
  [ ] Did any agent wrap JSON in preamble text ("Now I have...")?           → format-violation
  [ ] Did any agent return an array when an object was expected?            → format-violation
  [ ] Did any agent return multiple JSON objects?                           → format-violation
  [ ] Did the extracted key not match the expected key?                     → format-violation
  [ ] Did you rename any saved file?                                        → format-violation
  [ ] Did any agent save to a wrong directory?                              → format-violation
  [ ] Did any agent use the Write tool when the protocol said "return JSON"? → format-violation
  [ ] Did you use the JSON extraction fallback chain past step 1?           → format-violation per agent

Data gaps:
  [ ] Did any agent flag missing DataPacket fields?                         → data-gap
  [ ] Were any filings missing from filingContent?                          → data-gap
  [ ] Were any transcripts missing?                                         → data-gap
```

For each `yes`, run the corresponding `observatory-record-event.js` command (see Format Violations + Retry Logic at the end of this skill for syntax).

## Step 15: Finalize Observatory

Parse the aggregate `<usage>` block across all subagent calls.

```bash
node scripts/observatory-finalize.js {RUN_ID} .thes1s/reports/{TICKER}/pitch-deck.json --verdict {OVERALL_VERDICT} --tokens {TOTAL_TOKENS} --tool-uses {TOOL_USES} --duration {DURATION_SECONDS}
```

Retry once on error.

## Step 15.5: Wiki Synthesis

```bash
node --loader ./scripts/node-esm-loader.js scripts/observatory-synthesize.js {RUN_ID}
```

Retry once on error.

## Step 16: Generate PDF

```bash
python3 scripts/pdf/generate_pitch_deck_pdf.py {TICKER}
```

If it fails, print warning and continue.

## Step 17: Auto-Archive

```bash
mkdir -p .thes1s/reports/{TICKER}/archive/{RUN_ID}
cp .thes1s/reports/{TICKER}/pitch-deck.json .thes1s/reports/{TICKER}/archive/{RUN_ID}/ 2>/dev/null
cp .thes1s/reports/{TICKER}/data-packet.json .thes1s/reports/{TICKER}/archive/{RUN_ID}/ 2>/dev/null
cp .thes1s/reports/{TICKER}/sections/*.json .thes1s/reports/{TICKER}/archive/{RUN_ID}/ 2>/dev/null
cp .thes1s/reports/{TICKER}/*.pdf .thes1s/reports/{TICKER}/archive/{RUN_ID}/ 2>/dev/null
```

Retry once on error.

## Step 18: Print Summary

Print: sections completed (X/11), overall verdict + confidence, per-section verdicts, FGR range, combined buy price range vs current price, quality score + issue counts, citation total, red flag total, output paths.

---

## JSON Extraction Fallback Chain

After every subagent completes:

1. JSON code block (```json ... ```)
2. Raw JSON object/array (first `{` or `[` to matching closing)
3. First `{` to last `}` (or `[`/`]`) and parse
4. If all parsing fails, retry once with: "Your previous response could not be parsed as JSON. Output ONLY the raw JSON — no markdown fences, no commentary. Start with `{` or `[` and end with `}` or `]`."
5. If retry fails, create a minimal section with `status: "failed"` and save the raw response text in `sections/{key}-raw.txt` for debugging.

**Multi-section agents** (business-analyst returns 2, financial-analyst returns 3): parse the JSON array, split into individual section objects by `key`, save each to its own file.

### REQUIRED: Log Format Violations

Whenever the fallback chain triggers ANY of these, run before proceeding:

```bash
# Fallback extraction used
node scripts/observatory-record-event.js {RUN_ID} format-violation \
  --agent {AGENT_ROLE} --violation "fallback extraction required: {markdown fences | preamble | raw JSON | first-to-last brace}" --fix-applied true

# Key mismatch
node scripts/observatory-record-event.js {RUN_ID} format-violation \
  --agent {AGENT_ROLE} --violation "key mismatch: returned '{actual}' expected '{expected}'" --fix-applied true

# Shape mismatch (multiple objects, array vs object, partial drafts)
node scripts/observatory-record-event.js {RUN_ID} format-violation \
  --agent {AGENT_ROLE} --violation "shape mismatch: {describe}" --fix-applied true

# Wrong filesystem path
node scripts/observatory-record-event.js {RUN_ID} format-violation \
  --agent {AGENT_ROLE} --violation "filesystem violation: saved to {wrong path} instead of {expected path}" --fix-applied true

# Used Write tool when protocol said return JSON
node scripts/observatory-record-event.js {RUN_ID} format-violation \
  --agent {AGENT_ROLE} --violation "protocol violation: used Write tool instead of response body" --fix-applied true
```

If JSON parsing required the retry prompt at step 4, log a retry too.

## Narrative Recovery

After extracting section JSON, check each section's `narrative` field:
- If `narrative.length < 200`: agent likely produced a stub.
  1. Search the agent's full response text for substantial prose (markdown with ## headings, > 200 chars)
  2. If found, inject into the section's `narrative` field and re-save. Log:
     ```bash
     node scripts/observatory-record-event.js {RUN_ID} format-violation \
       --agent {AGENT_ROLE} --violation "narrative stub in JSON, recovered {length} chars from response body" --fix-applied true
     ```
  3. If no recoverable narrative, retry the agent once: "Your previous output had a {length}-char narrative stub. The narrative field MUST contain your FULL analysis (500+ words). Write the complete narrative." Log:
     ```bash
     node scripts/observatory-record-event.js {RUN_ID} retry \
       --agent {AGENT_ROLE} --wave {N} --reason "narrative stub ({length} chars)" --attempt 1 --resolved false
     ```
     Re-run with `--resolved true` if the retry succeeded.
  4. If retry also produces a stub, save with a warning and continue.

## Retry Logic

If any agent fails entirely (rate limit, timeout, error):
1. Wait 30 seconds
2. Re-dispatch with the same prompt
3. If retry fails, log the error, save partial output with `status: "failed"`, and continue
4. Do NOT retry more than once

### REQUIRED: Log Every Retry and Stall

```bash
# Agent retry
node scripts/observatory-record-event.js {RUN_ID} retry \
  --agent {AGENT_ROLE} --wave {N} --reason "{short reason: timeout | rate-limit | JSON parse failed | narrative stub | schema violation}" --attempt 1 --resolved {true|false}

# Stall detected (>15min sonnet, >25min opus)
node scripts/observatory-record-event.js {RUN_ID} stall \
  --agent {AGENT_ROLE} --wave {N} --duration {seconds_before_intervention} --resolution "{retried with trimmed prompt | killed and re-dispatched | timed out}"
```

Log both if both apply.

## Constraints

**Contamination boundary.** During generation, NEVER read from:
- `knowledge/stage-1-one-pager/examples/`
- `knowledge/stage-2-pitch-deck/examples/`
- `knowledge/stage-3-full-story/examples/`
- `knowledge/pre-course-examples/`

**Schema enforcement.** Every section output MUST conform to ReportSectionSchema. Required fields: `key`, `title`, `sectionNumber`, `status`, `confidence`, `verdict`, `verdictRationale`, `summary`, `data`, `narrative`, `citations`, `redFlags` (>= 1), `modelUsed`, `tokenCost`.

**Error resilience.** PSR agent fails → continue without findings. Wave agent fails after retry → log, save what succeeded, continue. Synthesis-writer fails → use majority-rule fallback. Always produce partial results rather than nothing.

**Agent model.** Defaults from Agent Registry (all sonnet). Pass the `model` param to the Agent tool per registry. Observatory tracks per-agent model for DOE.
