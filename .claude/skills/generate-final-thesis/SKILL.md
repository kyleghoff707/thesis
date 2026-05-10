---
name: generate-final-thesis
description: Generate a 7-section value investing Final Thesis (Stage 3) using v2 agent prompts, Claude Code subagent orchestration, adversarial debate, and Pitch Deck inheritance
argument-hint: TICKER
disable-model-invocation: true
---

# Generate Final Thesis (v2)

Generate a complete 7-section value investing Final Thesis conviction document for **$0**.

Orchestrates 11 specialist agents across 3 phases via Claude Code Agent tool dispatch. Phase 1 dispatches 5 deep-analysis agents in parallel. Phase 2 runs a 4-step adversarial debate (Bull, Bear, Rebuttal, Judge) plus a composition step to produce final Section 6. Phase 3 dispatches the trade-plan agent to produce Section 7 once Section 6 is composed. Runs end-to-end without stopping. Builds entirely on the completed Pitch Deck — PSR findings are inherited, not re-run.

---

## Agent Registry

```
AGENT_REGISTRY:

  risk-analyst-event:
    prompt: agents/risk-analyst-finalthesis-event/prompt.md
    model: sonnet
    sections: [event_analysis]
    phase: 1
    pdInheritance: [pest, radar]
    dpFields: [companyInfo, classification, financials, ttm, growthRates, peers, insiders, caveats]

  business-analyst:
    prompt: agents/business-analyst-finalthesis/prompt.md
    model: sonnet
    sections: [business_analysis]
    phase: 1
    pdInheritance: [simple_predictable, market_position]
    dpFields: [companyInfo, classification, thesisScore, peers, gurus, financials, ttm, growthRates, caveats]

  competitor-evaluator:
    prompt: agents/competitor-evaluator-finalthesis/prompt.md
    model: sonnet
    sections: [moat_analysis]
    phase: 1
    pdInheritance: [barriers_moats, market_position]
    dpFields: [companyInfo, classification, thesisScore, peers, peerMetrics, financials, ttm, growthRates, caveats]

  management-evaluator:
    prompt: agents/management-evaluator-finalthesis/prompt.md
    model: sonnet
    sections: [management_analysis]
    phase: 1
    pdInheritance: [management, balance_sheet]
    dpFields: [companyInfo, classification, compensation, insiders, gurus, financials, ttm, returnMetrics, caveats]

  valuation-specialist:
    prompt: agents/valuation-specialist-finalthesis/prompt.md
    model: sonnet
    sections: [valuation_analysis]
    phase: 1
    pdInheritance: [fcf, roe_roic_debt, valuation]
    dpFields: [companyInfo, classification, financials, ttm, growthRates, returnMetrics, fcf, keyMetrics, caveats]

  bull:
    prompt: agents/synthesis-writer-finalthesis-bull/prompt.md
    model: sonnet
    sections: []
    phase: 2
    debateRole: bull (Step 1)
    dpFields: []

  bear:
    prompt: agents/risk-analyst-finalthesis-bear/prompt.md
    model: sonnet
    sections: []
    phase: 2
    debateRole: bear (Step 2)
    dpFields: [companyInfo, classification, financials, ttm, growthRates, peers, insiders, caveats]

  rebuttal:
    prompt: agents/synthesis-writer-finalthesis-rebuttal/prompt.md
    model: sonnet
    sections: []
    phase: 2
    debateRole: rebuttal (Step 3)
    dpFields: []

  judge:
    prompt: agents/financial-analyst-finalthesis/prompt.md
    model: sonnet
    sections: []
    phase: 2
    debateRole: judge (Step 4)
    dpFields: []

  compose:
    prompt: agents/synthesis-writer-finalthesis-compose/prompt.md
    model: sonnet
    sections: [debate]
    phase: 2
    debateRole: compose (Final Section 6)
    dpFields: []

  trade-plan:
    prompt: agents/trade-plan-finalthesis/prompt.md
    model: sonnet
    sections: [trade_plan]
    phase: 3
    dpFields: []
```

## Pitch Deck Inheritance Map

```
PD_INHERITANCE_MAP:
  event_analysis:        [pest, radar]
  business_analysis:     [simple_predictable, market_position]
  moat_analysis:         [barriers_moats, market_position]
  management_analysis:   [management, balance_sheet]
  valuation_analysis:    [fcf, roe_roic_debt, valuation]
```

(Sections 6 and 7 don't inherit from Pitch Deck — they synthesize from the other Final Thesis sections.)

## Phase Structure

```
Phase 1 (Deep Analysis):  risk-analyst-event + business-analyst + competitor-evaluator + management-evaluator + valuation-specialist  [PARALLEL — 5 Agent dispatches in single message]
Phase 2 (The Debate):     Bull → Bear → Rebuttal → Judge → Compose  [SEQUENTIAL — each step depends on prior step's output]
Phase 3 (Trade Plan):     trade-plan  [SEQUENTIAL — depends on composed Section 6]
```

Phase 1 agents dispatch in a single message (5 Agent tool calls). Phase 2 debate steps are strictly sequential — each step depends on the prior step's output. Phase 3 dispatches the trade-plan agent once Section 6 is composed.

---

## CRITICAL RULES

**DataPacket Slicing.** You MUST NOT pass the full DataPacket file path to agents. Use `node scripts/slice-datapacket.js {TICKER} {agent-role}` and embed the output as a fenced JSON block. One bash call per agent. Do NOT manually extract fields or instruct the agent to read the file.

**Full-Fidelity Output Saving.** When an agent returns its result, write the COMPLETE extracted JSON to disk via the Write tool. Do NOT reconstruct from memory. Do NOT save stub sections. Section files: 10-50KB. Debate-step files: 5-30KB. If a saved file is under 5KB (sections) or 2KB (debate steps), you saved a stub — re-extract from the agent response. This rule is non-negotiable; saving stubs invalidates the run.

## Step 1: Validate Input and Gate Check

The ticker symbol is `$0`. Uppercase it and store as `TICKER`.

If `$0` is empty, print usage `/generate-final-thesis TICKER` and stop.

Clean stale section data (preserve pitch-deck.json + data-packet.json):
```bash
rm -rf ~/thesis/cache/{TICKER}/sections/
rm -rf ~/thesis/cache/{TICKER}/quality/
```

Create `~/thesis/cache/{TICKER}/sections/`.

**Gate Check.** Read `~/thesis/reports/{TICKER}/pitch-deck.json` and `~/thesis/reports/{TICKER}/data-packet.json`. Verify:
1. Both files exist
2. `overallVerdict` is set
3. `overallVerdict` is NOT `"FAIL"`

If any check fails, print:
```
Gate check FAILED: Pitch Deck must exist with PASS or WATCHLIST verdict.
Run /generate-pitch-deck {TICKER} first.
```
And stop.

Store both for downstream use.

## Step 3: Read Prompts and Prepare Context

### 3a: Read Phase 1 Agent Prompts

- `agents/risk-analyst-finalthesis-event/prompt.md`
- `agents/business-analyst-finalthesis/prompt.md`
- `agents/competitor-evaluator-finalthesis/prompt.md`
- `agents/management-evaluator-finalthesis/prompt.md`
- `agents/valuation-specialist-finalthesis/prompt.md`

### 3b: Build DataPacket and Pitch Deck Context

For each Phase 1 agent:

**DataPacket slice:** Run `node scripts/slice-datapacket.js {TICKER} {agent-role}` for each agent. Embed as fenced JSON.

**Pitch Deck inheritance:** Extract per PD_INHERITANCE_MAP. For each inherited PD section include `summary`, `verdict`, `confidence`, `verdictRationale`, `narrative`, `redFlags`, `citations`, `data`. Format:

```
## Inherited Pitch Deck Findings

### {PD Section Title} (S{N}): {verdict} ({confidence})
**Summary:** {summary}
**Verdict Rationale:** {verdictRationale}

{narrative}

**Red Flags:**
- {list}

**Data:** {JSON of data field}

**Citations:**
{list}
```

Also include PSR findings if present in pitch-deck.json (`psr_annual`, `psr_quarterly` keys, or `psrSummary`).

## Step 4: Phase 1 — Deep Analysis (5 Agents Parallel)

Dispatch all 5 in a single message (5 Agent tool calls).

For each agent, the prompt is concatenated as:
1. Full v2 prompt
2. DataPacket slice (fenced JSON)
3. Inherited Pitch Deck sections per PD_INHERITANCE_MAP
4. PSR findings (if available)
5. Task instruction (below)

### Task Instructions

**Risk Analyst — Event (S1: Event Analysis):**
```
Analyze {TICKER} ({COMPANY_NAME}) for the Final Thesis.

You are producing Final Thesis Section 1: Event Analysis.
Your inherited Pitch Deck sections are above (PEST, Radar).
The DataPacket and PSR findings are provided.

Determine if any current price dislocation is temporary or structural.
Identify upcoming catalyst events, recent material events, and the event calendar.
Use web search for current news, upcoming events, and market sentiment.

Return your output as Format A (ReportSectionSchema) JSON with key `event_analysis`, sectionNumber 1.
```

**Business Analyst (S2: Business Analysis):**
```
Analyze {TICKER} ({COMPANY_NAME}) for the Final Thesis.

You are producing Final Thesis Section 2: Business Analysis.
Your inherited Pitch Deck sections are above (Simple & Predictable, Market Position).
The DataPacket and PSR findings are provided.

Deepen the business understanding from the Pitch Deck into a prose conviction assessment.
Use web search for current business developments and industry context.

Return a single ReportSectionSchema JSON object with key `business_analysis`, sectionNumber 2.
```

**Competitor Evaluator (S3: Moat Analysis):**
```
Analyze {TICKER} ({COMPANY_NAME}) for the Final Thesis.

You are producing Final Thesis Section 3: Moat Analysis.
Your inherited Pitch Deck sections are above (Barriers & Moats, Market Position).
The DataPacket and PSR findings are provided.

Validate competitive durability with a prose analysis of moat sources, durability, and erosion risks.
Use web search for competitive dynamics, recent entrants, and moat erosion signals.

Return a single ReportSectionSchema JSON object with key `moat_analysis`, sectionNumber 3.
```

**Management Evaluator (S4: Management Analysis):**
```
Analyze {TICKER} ({COMPANY_NAME}) for the Final Thesis.

You are producing Final Thesis Section 4: Management Analysis.
Your inherited Pitch Deck sections are above (Management, Balance Sheet).
The DataPacket and PSR findings are provided.

Assess leadership quality, integrity, and shareholder alignment.
Use web search for recent management actions, governance issues, and leadership changes.

Return a single ReportSectionSchema JSON object with key `management_analysis`, sectionNumber 4.
```

**Valuation Specialist (S5: Valuation Analysis):**
```
Analyze {TICKER} ({COMPANY_NAME}) for the Final Thesis.

You are producing Final Thesis Section 5: Valuation Analysis.
Your inherited Pitch Deck sections are above (FCF, ROE/ROIC & Debt, Valuation).
The DataPacket and PSR findings are provided.

Stress-test the Pitch Deck's valuation assumptions. Do NOT re-run the calculators — validate the inputs.
Is the FGR achievable or does it require unrealistic market share? Is the growth real or debt-fueled?
Use web search for current analyst estimates, market conditions, and growth rate validation.

Return a single ReportSectionSchema JSON object with key `valuation_analysis`, sectionNumber 5.
```

### Collect Phase 1 Outputs

After all 5 agents return:
1. Extract JSON from each response (see JSON Extraction Fallback Chain)
2. Validate required fields: `key`, `title`, `sectionNumber`, `status`, `confidence`, `verdict`, `verdictRationale`, `summary`, `narrative` (>= 200 chars — see Narrative Recovery), `citations`, `redFlags` (>= 1)
3. Save COMPLETE JSON to `sections/{section_key}.json`. Each file 10-50KB.

If an agent fails entirely, wait 30 seconds and retry once.

## Step 6: Phase 2 — The Debate (Strictly Sequential)

### 6a: Read Debate Prompts

- `agents/synthesis-writer-finalthesis-bull/prompt.md` (Bull — Step 1)
- `agents/risk-analyst-finalthesis-bear/prompt.md` (Bear — Step 2)
- `agents/synthesis-writer-finalthesis-rebuttal/prompt.md` (Rebuttal — Step 3)
- `agents/financial-analyst-finalthesis/prompt.md` (Judge — Step 4)
- `agents/synthesis-writer-finalthesis-compose/prompt.md` (Compose — Final Section 6)

### 6b: Build Section Summaries

```
## Completed Final Thesis Sections (S1-S5)

### S1: Event Analysis — {verdict} ({confidence})
{summary}
Red Flags: {list}
Key Data: {event risk score, upcoming events count}

### S2: Business Analysis — {verdict} ({confidence})
{summary}
Red Flags: {list}
Key Data: {key business findings}

### S3: Moat Analysis — {verdict} ({confidence})
{summary}
Red Flags: {list}
Key Data: {moat width, moat sources}

### S4: Management Analysis — {verdict} ({confidence})
{summary}
Red Flags: {list}
Key Data: {key management findings}

### S5: Valuation Analysis — {verdict} ({confidence})
{summary}
Red Flags: {list}
Key Data: {FGR assessment, buy price range}
```

### 6c: Step 1 — Bull (Synthesis Writer — Bull)

Dispatch via Agent tool with:
1. Full prompt (`agents/synthesis-writer-finalthesis-bull/prompt.md`)
2. All 5 section outputs (full JSON)
3. Task:

```
You are the BULL in the Final Thesis Section 6 adversarial debate for {TICKER} ({COMPANY_NAME}).

Your role is Step 1: Bull Thesis. Synthesize the strongest possible investment thesis from Sections 1-5 above.

Extract 5-7 thesis points covering business, moat, management, valuation, and events.
Each point must cite the source section. Write a compelling overallThesis summary.

You HAVE web search. Use it to surface positive catalysts, insider buying, guru activity, analyst upgrades, validating third-party signals. Primary job is still distilling section findings — web search is for sharpening and validating, not inventing a thesis the sections don't support.

Return your output as the Bull Thesis JSON format (Step 1).
```

Wait. Extract COMPLETE JSON, save to `sections/debate-step-1-bull.json`.

### 6d: Step 2 — Bear (Risk Analyst — Bear)

Dispatch via Agent tool with:
1. Full prompt (`agents/risk-analyst-finalthesis-bear/prompt.md`)
2. Bull thesis output (Step 1 JSON)
3. DataPacket slice (full bear dpFields)
4. All 5 section outputs (reference)
5. Task:

```
You are the BEAR in the Final Thesis Section 6 adversarial debate for {TICKER} ({COMPANY_NAME}).

Your role is Step 2: Bear Inversion. The bull has presented their thesis above. Attack EVERY thesis point with cited counter-evidence.

Use web search for short-seller theses, negative analyst coverage, bear cases, recent bad news. The Bull also has web search — your evidence advantage is in quality and materiality.

Each inversion must cite specific evidence (URLs, DataPacket, SEC filings). Classify severity as thesis_killer, significant, or minor.

Return your output as the Bear Debate Step JSON format (Step 2 / Format B).
```

Wait. Extract COMPLETE JSON, save to `sections/debate-step-2-bear.json`.

### 6e: Step 3 — Rebuttal (Synthesis Writer — Rebuttal)

Dispatch via Agent tool with:
1. Full prompt (`agents/synthesis-writer-finalthesis-rebuttal/prompt.md`)
2. Bull thesis (Step 1 JSON)
3. Bear inversion (Step 2 JSON)
4. All 5 section outputs (evidence)
5. Task:

```
You are the BULL REBUTTAL in the Final Thesis Section 6 adversarial debate for {TICKER} ({COMPANY_NAME}).

Your role is Step 3: Bull Rebuttal. The bear has attacked your thesis above. Respond to EACH inversion with evidence-based counter-arguments.

You HAVE web search. Use it to verify bear citations, find already-priced-in context, surface counter-evidence, and check materiality.
Rate each rebuttal honestly: strong, moderate, or weak. If the bear has a genuine point, acknowledge it.

Return your output as the Bull Rebuttal JSON format (Step 3).
```

Wait. Extract COMPLETE JSON, save to `sections/debate-step-3-rebuttal.json`.

### 6f: Step 4 — Judge (Financial Analyst)

Dispatch via Agent tool with:
1. Full prompt (`agents/financial-analyst-finalthesis/prompt.md`)
2. Bull thesis (Step 1 JSON)
3. Bear inversion (Step 2 JSON)
4. Rebuttal (Step 3 JSON)
5. All 5 section outputs (reference)
6. Task:

```
You are the JUDGE in the Final Thesis Section 6 adversarial debate for {TICKER} ({COMPANY_NAME}).

Your role is Step 4: Judge Verdict. Score EACH exchange between the bull and bear impartially.

For each bear inversion, evaluate: the bull's original claim, the bear's counter-argument, and the bull's rebuttal. Score as Strong Bull, Strong Bear, or Unresolved.

You do NOT have web search. Judge based on evidence presented by both sides and the section data.

Return your output as the JudgeVerdictSchema JSON format (Step 4).
```

Wait. Extract COMPLETE JSON, save to `sections/debate-step-4-judge.json`.

### 6g: Compose — Final Section 6 (Synthesis Writer — Compose)

Dispatch via Agent tool with:
1. Full prompt (`agents/synthesis-writer-finalthesis-compose/prompt.md`)
2. All 4 debate step outputs (full JSON)
3. All 5 section outputs (reference and citation propagation)
4. Task:

```
You are COMPOSING the final Section 6 (The Debate) for {TICKER} ({COMPANY_NAME}).

Your role is Compose (Final Call). Weave all 4 debate outputs into a cohesive Buffett-style narrative.

The verdict MUST follow the judge's overall direction. Include ALL bear source URLs.
Structure: thesis → antithesis → synthesis. Highlight which bear points were rebutted and which remain unresolved.

The narrative must be 600+ words. Synthesize, do NOT concatenate.

Return your output as the Composition ReportSectionSchema JSON (key: "debate", sectionNumber: 6).
```

Wait. Extract COMPLETE JSON, validate ReportSectionSchema, save to `sections/debate.json`. 10-50KB.

## Step 7: Phase 3 — Trade Plan Dispatch

### 7a: Read Trade Plan Prompt

- `agents/trade-plan-finalthesis/prompt.md`

### 7b: Build Trade Plan Context

Trade Plan receives as context:
1. The full Trade Plan agent prompt
2. All 5 Phase 1 section outputs (full JSON) — for buy prices, moat width, KPIs
3. The composed Section 6 (`sections/debate.json`) — for verdict, watchpoints, debate outcome
4. Task instruction (below)

### 7c: Dispatch Trade Plan

Dispatch via Agent tool with the context above and:

```
You are producing Final Thesis Section 7: Trade Plan for {TICKER} ({COMPANY_NAME}).

The 6 prior sections are above. Section 6 (The Debate) has produced the verdict
that gates this section: a FAIL verdict means produce a "no trade" plan; a PASS
or WATCHLIST verdict means produce a real trade plan.

Cover all 5 required components: position sizing, entry tranches, sell rules,
PACE plan, and the closing forcing question. Be concrete — every recommendation
must have a specific number, trigger, and action.

Honor the Section 5 buy price range and the Section 6 watchpoints — the trade
plan inherits from these and must not contradict them.

Return your output as Format A (ReportSectionSchema) JSON with key `trade_plan`,
sectionNumber 7.
```

Wait. Extract COMPLETE JSON, save to `sections/trade_plan.json`. 5-30KB.

## Step 8: Assemble Final Report

```json
{
  "ticker": "{TICKER}",
  "companyName": "{from DataPacket companyInfo}",
  "stage": "finalThesis",
  "generatedAt": "{ISO timestamp}",
  "sections": [
    /* 7 ReportSectionSchema objects ordered by sectionNumber (1-7) */
  ],
  "sectionKeys": ["event_analysis", "business_analysis", "moat_analysis", "management_analysis", "valuation_analysis", "debate", "trade_plan"],
  "overallVerdict": "{from Section 6 / judge direction: Bull=PASS, Bear=FAIL, Mixed=WATCHLIST}",
  "verdictRationale": "{from Section 6 verdictRationale}",
  "debateOutcome": {
    "direction": "{Bull | Bear | Mixed}",
    "unresolvedCount": 0,
    "strongBullPoints": 0,
    "strongBearPoints": 0,
    "exchangeCount": 0,
    "investmentImplication": "{from judge verdict}"
  },
  "pitchDeckVerdict": "{verdict from gate check}",
  "pitchDeckDate": "{generatedAt from pitch-deck.json}",
  "debate": {
    "step1Bull": "{path to debate-step-1-bull.json}",
    "step2Bear": "{path to debate-step-2-bear.json}",
    "step3Rebuttal": "{path to debate-step-3-rebuttal.json}",
    "step4Judge": "{path to debate-step-4-judge.json}"
  }
}
```

Write JSON to `~/thesis/reports/{TICKER}/final-thesis.json`.

Generate human-readable markdown at `~/thesis/reports/{TICKER}/final-thesis.md`. Structure: title + verdict + Pitch Deck verdict + debate direction header → Executive Summary (Section 6 verdictRationale + debate outcome) → Phase 1 sections (1-5) with narrative + verdict + red flags → Section 6 (The Debate) narrative + debate scorecard table (per-exchange Bull/Bear/Outcome) → Section 7 (Trade Plan) narrative with position sizing, entry tranches, sell rules, PACE plan, and forcing question → Section verdicts table → All red flags aggregated → Citations.

## Step 10: Generate PDF

The PDF reader expects `final-thesis-api.json`, so copy first:

```bash
cp ~/thesis/reports/{TICKER}/final-thesis.json ~/thesis/reports/{TICKER}/final-thesis-api.json
python3 scripts/pdf/generate_final_thesis_pdf.py {TICKER}
```

If it fails, print warning and continue.

## Step 11: Auto-Archive

```bash
ARCHIVE_ID=$(date +%Y%m%d-%H%M%S)
mkdir -p ~/thesis/reports/{TICKER}/archive/${ARCHIVE_ID}
cp ~/thesis/reports/{TICKER}/final-thesis.json ~/thesis/reports/{TICKER}/archive/${ARCHIVE_ID}/ 2>/dev/null
cp ~/thesis/reports/{TICKER}/final-thesis-api.json ~/thesis/reports/{TICKER}/archive/${ARCHIVE_ID}/ 2>/dev/null
cp ~/thesis/cache/{TICKER}/sections/debate-*.json ~/thesis/reports/{TICKER}/archive/${ARCHIVE_ID}/ 2>/dev/null
cp ~/thesis/cache/{TICKER}/sections/trade_plan.json ~/thesis/reports/{TICKER}/archive/${ARCHIVE_ID}/ 2>/dev/null
cp ~/thesis/reports/{TICKER}/*.pdf ~/thesis/reports/{TICKER}/archive/${ARCHIVE_ID}/ 2>/dev/null
```

Retry once on error.

## Step 12: Print Summary

Print: sections completed (X/7), overall verdict + confidence, Pitch Deck verdict, debate direction + Strong Bull/Bear/Unresolved counts, thesis killer count, investment implication, red flag total, citation total, output paths.

---

## JSON Extraction Fallback Chain

After every subagent completes:

1. JSON code block (```json ... ```)
2. Raw JSON object/array (first `{` or `[` to matching closing)
3. First `{` to last `}` (or `[`/`]`) and parse
4. If all parsing fails, retry once with: "Your previous response could not be parsed as JSON. Output ONLY the raw JSON — no markdown fences, no commentary. Start with `{` or `[` and end with `}` or `]`."
5. If retry fails, create a minimal section with `status: "failed"` and save raw response to `sections/{key}-raw.txt`.

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

**Anti-pattern specific to Final Thesis:** when a debate step (Bear, Rebuttal, Compose) or the Trade Plan stalls, the orchestrator's instinct is to write the agent output directly from its own context using the Write tool instead of re-dispatching the agent. Do not. Re-dispatch the agent.

## Constraints

**Contamination boundary.** During generation, NEVER read from:
- `knowledge/stage-1-one-pager/examples/`
- `knowledge/stage-2-pitch-deck/examples/`
- `knowledge/stage-3-final-thesis/examples/`
- `knowledge/pre-course-examples/`

**Schema enforcement.** Every section output MUST conform to ReportSectionSchema. Required fields: `key`, `title`, `sectionNumber`, `status`, `confidence`, `verdict`, `verdictRationale`, `summary`, `data`, `narrative`, `citations`, `redFlags` (>= 1), `modelUsed`, `tokenCost`. Debate step outputs (Steps 1-4) use lightweight formats, NOT ReportSectionSchema. Only Compose (Section 6) and Trade Plan (Section 7) produce ReportSectionSchema sections in Phases 2-3.

**Single-role agents.** Each agent in the registry plays exactly one role — the previous combined-role Risk Analyst and Synthesis Writer prompts have been split into single-role prompts:
- `risk-analyst-finalthesis-event` — Phase 1 only (S1: Event Analysis)
- `risk-analyst-finalthesis-bear` — Phase 2 Step 2 only (Bear Inversion)
- `synthesis-writer-finalthesis-bull` — Phase 2 Step 1 only (Bull Thesis)
- `synthesis-writer-finalthesis-rebuttal` — Phase 2 Step 3 only (Bull Rebuttal)
- `synthesis-writer-finalthesis-compose` — Phase 2 Final only (Compose Section 6)
- `trade-plan-finalthesis` — Phase 3 only (S7: Trade Plan)

Each dispatch task instruction should still name the role for clarity, but the prompt itself no longer needs to branch by role.

**Web search rule.** Phase 1 agents all have web search. Phase 2: Bull, Bear, Rebuttal have web search. Judge and Compose do NOT. Phase 3: Trade Plan does NOT.

**Error resilience.** Phase 1 agent fails after retry → log, save what succeeded, continue to Phase 2 with available sections. Debate step fails after retry → debate cannot continue past that step; assemble report with Phase 1 sections only and note the failure. Compose fails → use judge verdict to construct minimal Section 6 with judge's direction as verdict and judge's summary as narrative. Trade Plan fails after retry → log and assemble report with Sections 1-6 only, noting the missing Section 7. Always produce partial results rather than nothing.

**Agent model.** Defaults from Agent Registry (all sonnet). Pass the `model` param to the Agent tool per registry.
