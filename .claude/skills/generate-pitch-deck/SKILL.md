---
name: generate-pitch-deck
description: Generate a 12-section value investing Pitch Deck using v2 agent prompts, Claude Code subagent orchestration, 5-wave dispatch, and FGR derivation
argument-hint: TICKER
disable-model-invocation: true
---

# Generate Pitch Deck (v2)

Generate a complete 12-section value investing Pitch Deck investment analysis for **$0**.

Orchestrates specialist agents across 5 waves via Claude Code Agent tool dispatch, preceded by Primary Source Reading (annual + quarterly), with an FGR derivation sub-workflow. Runs end-to-end without stopping.

---

## Agent Registry

```
AGENT_REGISTRY:

  annual-reader:
    prompt: agents/annual-reader/prompt.md
    model: sonnet
    sections: [psr_annual]
    wave: 0
    dpFields: [companyInfo, classification, financials, ttm, filings, caveats]

  quarterly-reader:
    prompt: agents/quarterly-reader/prompt.md
    model: sonnet
    sections: [psr_quarterly]
    wave: 0
    dpFields: [companyInfo, classification, financials, ttm, filings, caveats]

  business-analyst:
    prompt: agents/business-analyst-pitchdeck/prompt.md
    model: sonnet
    sections: [setup, business_quality]
    wave: 1
    dpFields: [companyInfo, classification, thesisScore, peers, gurus, financials, ttm, growthRates, caveats]

  competitor-market-position:
    prompt: agents/competitor-evaluator-market-position-pitchdeck/prompt.md
    model: sonnet
    sections: [market_position]
    wave: 1
    dpFields: [companyInfo, classification, thesisScore, peers, peerMetrics, financials, ttm, growthRates, caveats]

  competitor-moats:
    prompt: agents/competitor-evaluator-moats-pitchdeck/prompt.md
    model: sonnet
    sections: [moat_analysis]
    wave: 2
    dpFields: [companyInfo, classification, thesisScore, peers, peerMetrics, financials, ttm, growthRates, caveats]

  financial-analyst:
    prompt: agents/financial-analyst-pitchdeck/prompt.md
    model: sonnet
    sections: [cash_generation, returns_leverage, balance_sheet, accounting_red_flags]
    wave: 2
    dpFields: [companyInfo, classification, financials, ttm, growthRates, returnMetrics, debtMetrics, fcf, keyMetrics, caveats]

  management-evaluator:
    prompt: agents/management-evaluator-pitchdeck/prompt.md
    model: sonnet
    sections: [management_capital_allocation]
    wave: 2
    dpFields: [companyInfo, classification, compensation, insiders, gurus, financials, ttm, returnMetrics, caveats]

  risk-analyst:
    prompt: agents/risk-analyst-pitchdeck/prompt.md
    model: sonnet
    sections: [risk_profile]
    wave: 3
    dpFields: [companyInfo, classification, financials, ttm, growthRates, peers, insiders, caveats]

  valuation-specialist:
    prompt: agents/valuation-specialist-pitchdeck/prompt.md
    model: sonnet
    sections: [valuation]
    wave: 3
    dpFields: [companyInfo, classification, financials, ttm, growthRates, returnMetrics, fcf, keyMetrics, caveats]

  synthesis-writer:
    prompt: agents/synthesis-writer-pitchdeck/prompt.md
    model: sonnet
    sections: [investment_verdict]
    wave: 4
    dpFields: []
```

## Wave Structure

```
Wave 0 (PSR):       annual-reader (1 per 10-K, up to 5) + quarterly-reader (10-Qs + transcripts)
Wave 1 (Business):  business-analyst + competitor-market-position
Wave 2 (Deep):      competitor-moats (needs S3) + financial-analyst + management-evaluator
Wave 3 (Risk/Val):  risk-analyst + valuation-specialist
Wave 4 (Synthesis): synthesis-writer  → investment_verdict
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
rm -rf ~/thesis/cache/{TICKER}/sections/
rm -rf ~/thesis/reports/{TICKER}/filings-md/
rm -rf ~/thesis/reports/{TICKER}/transcripts/
rm -rf ~/thesis/cache/{TICKER}/quality/
```

Create `~/thesis/cache/{TICKER}/sections/` and `~/thesis/cache/{TICKER}/quality/`.

**Gate Check.** Read `~/thesis/reports/{TICKER}/one-pager.json`. Verify it exists and `overallVerdict` is set. If not, print:
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

Save PM-provided data to `~/thesis/reports/{TICKER}/pm-supplementary.md`, re-run prepare-data.js to verify.

**Exit code 0 (PROCEED):** Print summary and continue.

## Step 3: Wave 0 — Primary Source Reading (PARALLEL)

Read the DataPacket from `~/thesis/reports/{TICKER}/data-packet.json`.

### 3a: Read PSR Agent Prompts

- `agents/annual-reader/prompt.md`
- `agents/quarterly-reader/prompt.md`

### 3b: PARALLEL DISPATCH — All PSR Agents (Single Message)

> **CRITICAL: Send ALL PSR Agent tool calls in a SINGLE message.**
> Up to 5 annual readers (one per 10-K) PLUS 1-N quarterly batches — ALL in one parallel dispatch.
> Annual readers and quarterly readers are independent. Quarterly readers do NOT receive annual findings — they extract their own quarterly evidence (trends, guidance changes, transcript commitments). Cross-period reconciliation (matching annual long-term promises to quarterly short-term execution) happens at the merge step (3c), NOT inside the agents.
> Sequential annual-then-quarterly dispatch costs ~10 minutes of wall time and provides zero quality benefit.
> Anti-pattern to avoid: dispatching annual readers, waiting for them to finish, then dispatching quarterly readers. Do NOT do this.

Identify all 10-K filings from `~/thesis/reports/{TICKER}/filings-md/`. Sort chronologically, oldest first. Up to 5. Identify all 10-Q filings, sort chronologically, split into batches of 4.

In a single message, dispatch:
- **One Agent call per 10-K** (annual reader)
- **One Agent call per 10-Q batch** (quarterly reader)

#### Annual Reader Dispatch (one per 10-K)

For each 10-K, the prompt is concatenated as:
1. Full contents of `agents/annual-reader/prompt.md`
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
1. Full contents of `agents/quarterly-reader/prompt.md`
2. DataPacket slice: same fields as annual reader
3. All sections from each 10-Q in the batch
4. Earnings transcripts from `~/thesis/reports/{TICKER}/transcripts/`:
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
2. Merge annual reader outputs into `annual-reader-insights.json` (combine per-year findings, aggregate discrepancies, compile strategic themes and long-term management promises). Write to `~/thesis/cache/{TICKER}/sections/annual-reader-insights.json`.
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

- `agents/business-analyst-pitchdeck/prompt.md`
- `agents/competitor-evaluator-market-position-pitchdeck/prompt.md`

### 4b: PARALLEL DISPATCH — Single Message

Dispatch BOTH agents in a single message (2 Agent tool calls).

**Agent 1: business-analyst** — sections: setup (S1), business_quality (S2)
1. Full prompt
2. DataPacket slice
3. PSR findings
4. One Pager summary
5. Task: "Analyze {TICKER} and produce Pitch Deck sections 1 (Setup) and 2 (Business Quality). Use web search for current information. Return a JSON array containing both section objects matching ReportSectionSchema."

**Agent 2: competitor-market-position** — section: market_position (S3)
1. Full prompt
2. DataPacket slice
3. PSR findings
4. Sections 1-2 summaries
5. Task: "Analyze {TICKER}'s competitive position and produce section 3. Screen 15+ industry peers. Include market share ceiling analysis. Return a single JSON object matching ReportSectionSchema."

After BOTH return, extract COMPLETE JSON from each response and Write to disk. Save to `sections/setup.json`, `sections/business_quality.json`, `sections/market_position.json`. Each 10-50KB.

### 4c: Validate Wave 1 Outputs

Required fields per section: `key`, `title`, `sectionNumber`, `status`, `confidence`, `verdict`, `verdictRationale`, `summary`, `narrative` (>= 200 chars — see Narrative Recovery), `citations`, `redFlags` (>= 1), `searchesPerformed` (non-empty).

## Step 6: Wave 2 — Deep Analysis

### 6a: Read Agent Prompts

- `agents/competitor-evaluator-moats-pitchdeck/prompt.md`
- `agents/financial-analyst-pitchdeck/prompt.md`
- `agents/management-evaluator-pitchdeck/prompt.md`

### 6b: Prepare Wave 1 Context

Format Wave 1 outputs as "Prior Analysis Context" — per-section summary + verdict + confidence + red flags + cross-cutting findings.

### 6c: PARALLEL DISPATCH — Single Message

Dispatch ALL 3 agents in a single message (3 Agent tool calls).

**Agent 1: competitor-moats** — section: moat_analysis (S4). Depends on S3.
1. Full prompt
2. DataPacket slice
3. PSR findings
4. Wave 1 context (especially full S3 market_position)
5. One Pager verdict + summary
6. Task: "Validate {TICKER}'s competitive moats and produce section 4 (Moat Analysis). Use Section 3 (Market Position) findings as competitive landscape foundation. Return a single JSON object matching ReportSectionSchema."

**Agent 2: financial-analyst** — sections: cash_generation (S5), returns_leverage (S6), balance_sheet (S7), accounting_red_flags (S8)
1. Full prompt
2. DataPacket slice (full financials, growth rates, return metrics, debt metrics, FCF, key metrics, analyst estimates)
3. PSR findings
4. Wave 1 context + S4 moat_analysis
5. Task: "Analyze {TICKER}'s financials and produce sections 5 (Cash Generation), 6 (Returns & Leverage), 7 (Balance Sheet), and 8 (Accounting Red Flags). Include dual Owner Earnings (value investing + Graham). Return a JSON array containing all FOUR section objects matching ReportSectionSchema."

**Agent 3: management-evaluator** — section: management_capital_allocation (S9)
1. Full prompt
2. DataPacket slice
3. PSR findings
4. Wave 1 context
5. Task: "Evaluate {TICKER}'s management team and produce section 9. Assess CEO track record, insider ownership, compensation alignment, capital allocation track record, and Guru ownership context (context only — NOT a buy signal). Return a single JSON object matching ReportSectionSchema."

After ALL 3 return, extract COMPLETE JSON and Write to disk. Each file 10-50KB.

### 6d: Validate Wave 2 Outputs

Same validation as Wave 1.

## Step 8: Wave 3 — Risk & Valuation

### 8a: Read Agent Prompts

- `agents/risk-analyst-pitchdeck/prompt.md`
- `agents/valuation-specialist-pitchdeck/prompt.md`

### 8b: Prepare Wave 1 + Wave 2 Context

Wave 1 + Wave 2 per-section summaries + verdicts + cumulative red flags + cumulative cross-cutting findings + One Pager findings.

### 8c: PARALLEL DISPATCH — Single Message

Dispatch BOTH agents in a single message (2 Agent tool calls).

**Agent 1: risk-analyst** — section: risk_profile (S11)
1. Full prompt
2. DataPacket slice
3. PSR findings
4. Full Wave 1+2 context
5. Task: "Conduct a comprehensive risk analysis for {TICKER}. Produce section 11 (Risk Profile). Apply 3-red-flag minimum per category. Assess FGR vulnerability. Pressure-test the bull case with the strongest evidence-based challenges. Classify each risk by severity (thesis-killing / material but manageable / speculative or already priced in). Return a single JSON object matching ReportSectionSchema."

**Agent 2: valuation-specialist** — section: valuation (S10)
1. Full prompt
2. DataPacket slice
3. PSR findings
4. Full Wave 1+2 context + S11 risk_profile
5. Task: "Produce the complete valuation analysis for {TICKER} as section 10. Derive FGR using all 5 inputs with evidence. Run all four methods (MOS, PBT, Ten Cap, Equity Bond) with buy price RANGES. Include sensitivity tables. The FGR derivation must be in the section's `data` field with structure: `{ fgrDerivation: { inputs: [...], proposedRange: { low, high }, weightedAverage } }`. Return a single JSON object matching ReportSectionSchema."

After BOTH return, extract JSON and save.

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

`agents/synthesis-writer-pitchdeck/prompt.md`

### 11b: Dispatch Synthesis Writer

Receives NO raw DataPacket. Works exclusively from section outputs.

Dispatch via Agent tool with:
1. Full prompt
2. ALL 11 section outputs (full JSON — verdicts, summaries, narratives, red flags, citations, data fields)
3. PSR findings summary
4. One Pager verdict + summary
5. FGR derivation with PM-confirmed values
6. Task: "Review all 11 Pitch Deck sections for {TICKER}. Check cross-section consistency. Identify contradictions. Produce the Investment Verdict section (key: 'investment_verdict', sectionNumber: 12). Weight moat and financial sections most heavily, risk lightest, management as contextual. Close the narrative with a Pre-Decision Quality Check (Calibrated Confidence + Anticipated Regret). Return a single JSON object matching ReportSectionSchema with `data` containing: `{ sectionVerdicts: {...}, overallVerdict: 'PASS|FAIL|WATCHLIST', keyStrengths: [...], keyConcerns: [...], nextSteps: [...], preDecisionCheck: { highConfidenceSections, lowConfidenceSections, overconfidenceRisks, anticipatedFailureMode, anticipatedFailureSignal, variantPerceptionStatement } }`."

Wait for completion. Save to `~/thesis/cache/{TICKER}/sections/investment_verdict.json`.

**Fallback if synthesis-writer fails:** Compute overall verdict from individual section verdicts (majority rule weighted by confidence: HIGH=3, MEDIUM=2, LOW=1).

## Step 12: Assemble Final Report

Collect all **12 sections** (S1-S11 + S12 synthesis) + checkpoints + FGR derivation. The synthesis-writer's output is a full ReportSectionSchema object with `key: "investment_verdict"`, `sectionNumber: 12`. Append it to `sections[]` as the 12th element. The top-level `overallVerdict`/`verdictRationale`/`synthesisNarrative` are MIRRORS of section 12.

```json
{
  "ticker": "{TICKER}",
  "companyName": "{from DataPacket companyInfo}",
  "stage": "pitchDeck",
  "generatedAt": "{ISO timestamp}",
  "sections": [
    /* 12 ReportSectionSchema objects ordered by sectionNumber:
         S1  setup                          (business-analyst)
         S2  business_quality               (business-analyst)
         S3  market_position                (competitor-market-position)
         S4  moat_analysis                  (competitor-moats)
         S5  cash_generation                (financial-analyst)
         S6  returns_leverage               (financial-analyst)
         S7  balance_sheet                  (financial-analyst)
         S8  accounting_red_flags           (financial-analyst)
         S9  management_capital_allocation  (management-evaluator)
         S10 valuation                      (valuation-specialist)
         S11 risk_profile                   (risk-analyst)
         S12 investment_verdict             (synthesis-writer)  ← MUST BE IN THE ARRAY
    */
  ],
  "overallVerdict": "{MIRROR of sections[11].verdict}",
  "verdictRationale": "{MIRROR of sections[11].verdictRationale}",
  "synthesisNarrative": "{MIRROR of sections[11].narrative}",
  "sectionKeys": ["setup", "business_quality", "market_position", "moat_analysis", "cash_generation", "returns_leverage", "balance_sheet", "accounting_red_flags", "management_capital_allocation", "valuation", "risk_profile", "investment_verdict"],
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

Write JSON to `~/thesis/reports/{TICKER}/pitch-deck.json`.

Generate human-readable markdown at `~/thesis/reports/{TICKER}/pitch-deck.md`. Structure: title + verdict + FGR range header → Executive Summary (synthesisNarrative) → all 11 analytical sections grouped by wave with narrative + verdict + red flags → Investment Verdict (S12) with Pre-Decision Quality Check → FGR Derivation table → Buy Price Ranges table → Sensitivity Tables → Citations.

## Step 13: Quality Check

```bash
node --import ./scripts/node-esm-loader.js -e "
  import { validateStage } from './src/engines/critic.js';
  import { readFileSync, writeFileSync, mkdirSync } from 'fs';
  const report = JSON.parse(readFileSync('~/thesis/reports/{TICKER}/pitch-deck.json', 'utf8'));
  const dp = JSON.parse(readFileSync('~/thesis/reports/{TICKER}/data-packet.json', 'utf8'));
  const quality = validateStage(report.sections, dp);
  mkdirSync('~/thesis/cache/{TICKER}/quality', { recursive: true });
  writeFileSync('~/thesis/cache/{TICKER}/quality/pitch-deck.quality.json', JSON.stringify(quality, null, 2));
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
  writeFileSync('~/thesis/cache/{TICKER}/quality/pitch-deck.quality.md', qualityMd);
  console.log('Quality report written.');
"
```

Quality is informational. Print overall score, per-section scores + issue counts by severity, list any HIGH severity issues verbatim.

## Step 14: Budget Tracking

```bash
node --import ./scripts/node-esm-loader.js -e "
  import { createBudgetTracker, formatBudgetReport } from './src/engines/contextBudget.js';
  import { readFileSync, writeFileSync, existsSync } from 'fs';
  const report = JSON.parse(readFileSync('~/thesis/reports/{TICKER}/pitch-deck.json', 'utf8'));
  const tracker = createBudgetTracker();
  const annualPSR = existsSync('~/thesis/cache/{TICKER}/sections/annual-reader-insights.json')
    ? JSON.parse(readFileSync('~/thesis/cache/{TICKER}/sections/annual-reader-insights.json', 'utf8'))
    : null;
  const quarterlyPSR = existsSync('~/thesis/cache/{TICKER}/sections/quarterly-reader-insights.json')
    ? JSON.parse(readFileSync('~/thesis/cache/{TICKER}/sections/quarterly-reader-insights.json', 'utf8'))
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
      setup: 'business-analyst', business_quality: 'business-analyst',
      market_position: 'competitor-market-position', moat_analysis: 'competitor-moats',
      cash_generation: 'financial-analyst', returns_leverage: 'financial-analyst',
      balance_sheet: 'financial-analyst', accounting_red_flags: 'financial-analyst',
      management_capital_allocation: 'management-evaluator',
      risk_profile: 'risk-analyst', valuation: 'valuation-specialist'
    };
    tracker.record(agentMap[section.key] || 'unknown', section.key, tc.input || 0, tc.output || 0, model);
  }
  const summary = tracker.getSummary();
  let existing = {};
  if (existsSync('~/thesis/reports/{TICKER}/budget.json')) {
    existing = JSON.parse(readFileSync('~/thesis/reports/{TICKER}/budget.json', 'utf8'));
  }
  const combined = { ...existing, pitchDeck: summary };
  writeFileSync('~/thesis/reports/{TICKER}/budget.json', JSON.stringify(combined, null, 2));
  console.log(formatBudgetReport(summary));
"
```

## Step 14.4: Section Count Contract Check

```bash
node -e "
const r = JSON.parse(require('fs').readFileSync('~/thesis/reports/{TICKER}/pitch-deck.json','utf8'));
const sections = r.sections || [];
const maxSectionNumber = sections.reduce((m,s) => Math.max(m, s.sectionNumber || 0), 0);
console.log('sections.length:', sections.length);
console.log('max sectionNumber in array:', maxSectionNumber);
console.log('has investment_verdict in sections:', sections.some(s => s.key === 'investment_verdict'));
if (sections.length !== 12 || maxSectionNumber !== 12 || !sections.some(s => s.key === 'investment_verdict')) {
  console.error('CONTRACT VIOLATION: pitch deck must have 12 sections with investment_verdict as section 12');
  process.exit(1);
}
console.log('✓ contract check passed');
"
```

If this fails, do NOT proceed. Go back to Step 12, append `sections/investment_verdict.json` as the 12th element.

## Step 16: Generate PDF

```bash
python3 scripts/pdf/generate_pitch_deck_pdf.py {TICKER}
```

If it fails, print warning and continue.

## Step 17: Auto-Archive

```bash
ARCHIVE_ID=$(date +%Y%m%d-%H%M%S)
mkdir -p ~/thesis/reports/{TICKER}/archive/${ARCHIVE_ID}
cp ~/thesis/reports/{TICKER}/pitch-deck.json ~/thesis/reports/{TICKER}/archive/${ARCHIVE_ID}/ 2>/dev/null
cp ~/thesis/reports/{TICKER}/data-packet.json ~/thesis/reports/{TICKER}/archive/${ARCHIVE_ID}/ 2>/dev/null
cp ~/thesis/cache/{TICKER}/sections/*.json ~/thesis/reports/{TICKER}/archive/${ARCHIVE_ID}/ 2>/dev/null
cp ~/thesis/reports/{TICKER}/*.pdf ~/thesis/reports/{TICKER}/archive/${ARCHIVE_ID}/ 2>/dev/null
```

Retry once on error.

## Step 18: Print Summary

Print: sections completed (X/12), overall verdict + confidence, per-section verdicts, FGR range, combined buy price range vs current price, quality score + issue counts, citation total, red flag total, output paths.

---

## JSON Extraction Fallback Chain

After every subagent completes:

1. JSON code block (```json ... ```)
2. Raw JSON object/array (first `{` or `[` to matching closing)
3. First `{` to last `}` (or `[`/`]`) and parse
4. If all parsing fails, retry once with: "Your previous response could not be parsed as JSON. Output ONLY the raw JSON — no markdown fences, no commentary. Start with `{` or `[` and end with `}` or `]`."
5. If retry fails, create a minimal section with `status: "failed"` and save the raw response text in `sections/{key}-raw.txt` for debugging.

**Multi-section agents** (business-analyst returns 2, financial-analyst returns 4): parse the JSON array, split into individual section objects by `key`, save each to its own file.

## Narrative Recovery

After extracting section JSON, check each section's `narrative` field:
- If `narrative.length < 200`: agent likely produced a stub.
  1. Search the agent's full response text for substantial prose (markdown with ## headings, > 200 chars)
  2. If found, inject into the section's `narrative` field and re-save.
  3. If no recoverable narrative, retry the agent once: "Your previous output had a {length}-char narrative stub. The narrative field MUST contain your FULL analysis (500+ words). Write the complete narrative."
  4. If retry also produces a stub, save with a warning and continue.

## Retry Logic

If any agent fails entirely (rate limit, timeout, error):
1. Wait 30 seconds
2. Re-dispatch with the same prompt
3. If retry fails, log the error, save partial output with `status: "failed"`, and continue
4. Do NOT retry more than once

## Constraints

**Contamination boundary.** During generation, NEVER read from:
- `knowledge/stage-1-one-pager/examples/`
- `knowledge/stage-2-pitch-deck/examples/`
- `knowledge/stage-3-final-thesis/examples/`
- `knowledge/pre-course-examples/`

**Schema enforcement.** Every section output MUST conform to ReportSectionSchema. Required fields: `key`, `title`, `sectionNumber`, `status`, `confidence`, `verdict`, `verdictRationale`, `summary`, `data`, `narrative`, `citations`, `redFlags` (>= 1), `modelUsed`, `tokenCost`.

**Error resilience.** PSR agent fails → continue without findings. Wave agent fails after retry → log, save what succeeded, continue. Synthesis-writer fails → use majority-rule fallback. Always produce partial results rather than nothing.

**Agent model.** Defaults from Agent Registry (all sonnet). Pass the `model` param to the Agent tool per registry.
