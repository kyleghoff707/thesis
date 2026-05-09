---
name: generate-full-story
description: Generate a 6-section Rule One Full Story (Stage 3) using v2 agent prompts, Claude Code subagent orchestration, adversarial debate, and Pitch Deck inheritance
argument-hint: TICKER
disable-model-invocation: true
---

# Generate Full Story (v2)

Generate a complete 6-section Rule One Full Story conviction document for **$0**.

Orchestrates 7 specialist agents across 2 phases via Claude Code Agent tool dispatch. Phase 1 dispatches 5 deep-analysis agents in parallel. Phase 2 runs a 4-step adversarial debate (Bull, Bear, Rebuttal, Judge) plus a composition step to produce final Section 6. Runs end-to-end without stopping. Builds entirely on the completed Pitch Deck — PSR findings are inherited, not re-run.

---

## Agent Registry

```
AGENT_REGISTRY:

  risk-analyst:
    prompt: agents/risk-analyst-fullstory/prompt.md
    model: sonnet
    sections: [event_analysis]
    phase: 1
    debateRole: bear (Phase 2, Step 2)
    pdInheritance: [pest, radar]
    dpFields: [companyInfo, classification, financials, ttm, growthRates, peers, insiders, caveats]

  business-analyst:
    prompt: agents/business-analyst-fullstory/prompt.md
    model: sonnet
    sections: [meaning_checklist]
    phase: 1
    pdInheritance: [simple_predictable, market_position]
    dpFields: [companyInfo, classification, ruleOneScore, peers, gurus, financials, ttm, growthRates, caveats]

  competitor-evaluator:
    prompt: agents/competitor-evaluator-fullstory/prompt.md
    model: sonnet
    sections: [moat_checklist]
    phase: 1
    pdInheritance: [barriers_moats, market_position]
    dpFields: [companyInfo, classification, ruleOneScore, peers, peerMetrics, financials, ttm, growthRates, caveats]

  management-evaluator:
    prompt: agents/management-evaluator-fullstory/prompt.md
    model: sonnet
    sections: [management_checklist]
    phase: 1
    pdInheritance: [management, balance_sheet]
    dpFields: [companyInfo, classification, compensation, insiders, gurus, financials, ttm, returnMetrics, caveats]

  valuation-specialist:
    prompt: agents/valuation-specialist-fullstory/prompt.md
    model: sonnet
    sections: [valuation_confirmation]
    phase: 1
    pdInheritance: [fcf, roe_roic_debt, valuation]
    dpFields: [companyInfo, classification, financials, ttm, growthRates, returnMetrics, fcf, keyMetrics, caveats]

  synthesis-writer:
    prompt: agents/synthesis-writer-fullstory/prompt.md
    model: sonnet
    sections: [inversion_rebuttal]
    phase: 2
    debateRoles: bull (Step 1), bull_rebuttal (Step 3), compose (Final)
    dpFields: []

  financial-analyst:
    prompt: agents/financial-analyst-fullstory/prompt.md
    model: sonnet
    sections: []
    phase: 2
    debateRole: judge (Step 4)
    dpFields: []
```

## Pitch Deck Inheritance Map

```
PD_INHERITANCE_MAP:
  event_analysis:         [pest, radar]
  meaning_checklist:      [simple_predictable, market_position]
  moat_checklist:         [barriers_moats, market_position]
  management_checklist:   [management, balance_sheet]
  valuation_confirmation: [fcf, roe_roic_debt, valuation]
```

## Phase Structure

```
Phase 1 (Deep Analysis):  risk-analyst + business-analyst + competitor-evaluator + management-evaluator + valuation-specialist  [PARALLEL]
Phase 2 (The Debate):     Bull (synthesis-writer) → Bear (risk-analyst) → Rebuttal (synthesis-writer) → Judge (financial-analyst) → Compose (synthesis-writer)  [SEQUENTIAL]
```

Phase 1 agents dispatch in a single message (5 Agent tool calls). Phase 2 debate steps are strictly sequential — each step depends on the prior step's output.

---

## CRITICAL RULES

**DataPacket Slicing.** You MUST NOT pass the full DataPacket file path to agents. Use `node scripts/slice-datapacket.js {TICKER} {agent-role}` and embed the output as a fenced JSON block. One bash call per agent. Do NOT manually extract fields or instruct the agent to read the file.

**Full-Fidelity Output Saving.** When an agent returns its result, write the COMPLETE extracted JSON to disk via the Write tool. Do NOT reconstruct from memory. Do NOT save stub sections. Section files: 10-50KB. Debate-step files: 5-30KB. If a saved file is under 5KB (sections) or 2KB (debate steps), you saved a stub — re-extract from the agent response. This rule is non-negotiable; saving stubs invalidates the run.

## Step 1: Validate Input and Gate Check

The ticker symbol is `$0`. Uppercase it and store as `TICKER`.

If `$0` is empty, print usage `/generate-full-story TICKER` and stop.

Clean stale section data (preserve pitch-deck.json + data-packet.json):
```bash
rm -rf .thes1s/reports/{TICKER}/sections/
rm -rf .thes1s/reports/{TICKER}/quality/
```

Create `.thes1s/reports/{TICKER}/sections/`.

**Gate Check.** Read `.thes1s/reports/{TICKER}/pitch-deck.json` and `.thes1s/reports/{TICKER}/data-packet.json`. Verify:
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

- `agents/risk-analyst-fullstory/prompt.md`
- `agents/business-analyst-fullstory/prompt.md`
- `agents/competitor-evaluator-fullstory/prompt.md`
- `agents/management-evaluator-fullstory/prompt.md`
- `agents/valuation-specialist-fullstory/prompt.md`

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

**Risk Analyst (S1: Event Analysis):**
```
Analyze {TICKER} ({COMPANY_NAME}) for the Full Story.

You are producing Full Story Section 1: Event Analysis.
Your inherited Pitch Deck sections are above (PEST, Radar).
The DataPacket and PSR findings are provided.

Determine if any current price dislocation is temporary or structural.
Identify upcoming catalyst events, recent material events, and the event calendar.
Use web search for current news, upcoming events, and market sentiment.

Return your output as Format A (ReportSectionSchema) JSON.
```

**Business Analyst (S2: Meaning Checklist):**
```
Analyze {TICKER} ({COMPANY_NAME}) for the Full Story.

You are producing Full Story Section 2: Meaning Checklist (15-point).
Your inherited Pitch Deck sections are above (Simple & Predictable, Market Position).
The DataPacket and PSR findings are provided.

Deepen the business understanding from the Pitch Deck into a structured 15-point conviction assessment.
Use web search for current business developments and industry context.

Return a single ReportSectionSchema JSON object.
```

**Competitor Evaluator (S3: Moat Checklist):**
```
Analyze {TICKER} ({COMPANY_NAME}) for the Full Story.

You are producing Full Story Section 3: Moat Checklist (15-point).
Your inherited Pitch Deck sections are above (Barriers & Moats, Market Position).
The DataPacket and PSR findings are provided.

Validate competitive durability point by point with a 15-point moat checklist.
Use web search for competitive dynamics, recent entrants, and moat erosion signals.

Return a single ReportSectionSchema JSON object.
```

**Management Evaluator (S4: Management Checklist):**
```
Analyze {TICKER} ({COMPANY_NAME}) for the Full Story.

You are producing Full Story Section 4: Management Checklist (13-point).
Your inherited Pitch Deck sections are above (Management, Balance Sheet).
The DataPacket and PSR findings are provided.

Assess leadership quality, integrity, and shareholder alignment with a 13-point checklist.
Use web search for recent management actions, governance issues, and leadership changes.

Return a single ReportSectionSchema JSON object.
```

**Valuation Specialist (S5: Valuation Confirmation):**
```
Analyze {TICKER} ({COMPANY_NAME}) for the Full Story.

You are producing Full Story Section 5: Valuation Confirmation.
Your inherited Pitch Deck sections are above (FCF, ROE/ROIC & Debt, Valuation).
The DataPacket and PSR findings are provided.

Stress-test the Pitch Deck's valuation assumptions. Do NOT re-run the calculators — validate the inputs.
Is the FGR achievable or does it require unrealistic market share? Is the growth real or debt-fueled?
Use web search for current analyst estimates, market conditions, and growth rate validation.

Return a single ReportSectionSchema JSON object.
```

### Collect Phase 1 Outputs

After all 5 agents return:
1. Extract JSON from each response (see JSON Extraction Fallback Chain)
2. Validate required fields: `key`, `title`, `sectionNumber`, `status`, `confidence`, `verdict`, `verdictRationale`, `summary`, `narrative` (>= 200 chars — see Narrative Recovery), `citations`, `redFlags` (>= 1)
3. Save COMPLETE JSON to `sections/{section_key}.json`. Each file 10-50KB.

If an agent fails entirely, wait 30 seconds and retry once.

## Step 6: Phase 2 — The Debate (Strictly Sequential)

### 6a: Read Debate Prompts

- `agents/synthesis-writer-fullstory/prompt.md` (Bull, Rebuttal, Compose)
- `agents/risk-analyst-fullstory/prompt.md` (Bear — already read)
- `agents/financial-analyst-fullstory/prompt.md` (Judge)

### 6b: Build Section Summaries

```
## Completed Full Story Sections (S1-S5)

### S1: Event Analysis — {verdict} ({confidence})
{summary}
Red Flags: {list}
Key Data: {event risk score, upcoming events count}

### S2: Meaning Checklist — {verdict} ({confidence})
{summary}
Red Flags: {list}
Key Data: {checklist score, e.g. 12/15}

### S3: Moat Checklist — {verdict} ({confidence})
{summary}
Red Flags: {list}
Key Data: {checklist score, e.g. 11/15}

### S4: Management Checklist — {verdict} ({confidence})
{summary}
Red Flags: {list}
Key Data: {checklist score, e.g. 10/13}

### S5: Valuation Confirmation — {verdict} ({confidence})
{summary}
Red Flags: {list}
Key Data: {FGR assessment, buy price confirmation}
```

### 6c: Step 1 — Bull (Synthesis Writer)

Dispatch via Agent tool with:
1. Full prompt
2. All 5 section outputs (full JSON)
3. Task:

```
You are the BULL in the Full Story Section 6 adversarial debate for {TICKER} ({COMPANY_NAME}).

Your role is Step 1: Bull Thesis. Synthesize the strongest possible investment thesis from Sections 1-5 above.

Extract 5-7 thesis points covering meaning, moat, management, valuation, and events.
Each point must cite the source section. Write a compelling overallThesis summary.

You HAVE web search. Use it to surface positive catalysts, insider buying, guru activity, analyst upgrades, validating third-party signals. Primary job is still distilling section findings — web search is for sharpening and validating, not inventing a thesis the sections don't support.

Return your output as the Bull Thesis JSON format (Step 1).
```

Wait. Extract COMPLETE JSON, save to `sections/debate-step-1-bull.json`.

### 6d: Step 2 — Bear (Risk Analyst)

Dispatch via Agent tool with:
1. Full prompt
2. Bull thesis output (Step 1 JSON)
3. DataPacket slice (full risk-analyst dpFields)
4. All 5 section outputs (reference)
5. Task:

```
You are the BEAR in the Full Story Section 6 adversarial debate for {TICKER} ({COMPANY_NAME}).

Your role is Step 2: Bear Inversion. The bull has presented their thesis above. Attack EVERY thesis point with cited counter-evidence.

Use web search for short-seller theses, negative analyst coverage, bear cases, recent bad news. The Bull also has web search — your evidence advantage is in quality and materiality.

Each inversion must cite specific evidence (URLs, DataPacket, SEC filings). Classify severity as thesis_killer, significant, or minor.

Return your output as the Bear Debate Step JSON format (Step 2 / Format B).
```

Wait. Extract COMPLETE JSON, save to `sections/debate-step-2-bear.json`.

### 6e: Step 3 — Rebuttal (Synthesis Writer)

Dispatch via Agent tool with:
1. Full prompt
2. Bull thesis (Step 1 JSON)
3. Bear inversion (Step 2 JSON)
4. All 5 section outputs (evidence)
5. Task:

```
You are the BULL REBUTTAL in the Full Story Section 6 adversarial debate for {TICKER} ({COMPANY_NAME}).

Your role is Step 3: Bull Rebuttal. The bear has attacked your thesis above. Respond to EACH inversion with evidence-based counter-arguments.

You HAVE web search. Use it to verify bear citations, find already-priced-in context, surface counter-evidence, and check materiality.
Rate each rebuttal honestly: strong, moderate, or weak. If the bear has a genuine point, acknowledge it.

Return your output as the Bull Rebuttal JSON format (Step 3).
```

Wait. Extract COMPLETE JSON, save to `sections/debate-step-3-rebuttal.json`.

### 6f: Step 4 — Judge (Financial Analyst)

Dispatch via Agent tool with:
1. Full prompt
2. Bull thesis (Step 1 JSON)
3. Bear inversion (Step 2 JSON)
4. Rebuttal (Step 3 JSON)
5. All 5 section outputs (reference)
6. Task:

```
You are the JUDGE in the Full Story Section 6 adversarial debate for {TICKER} ({COMPANY_NAME}).

Your role is Step 4: Judge Verdict. Score EACH exchange between the bull and bear impartially.

For each bear inversion, evaluate: the bull's original claim, the bear's counter-argument, and the bull's rebuttal. Score as Strong Bull, Strong Bear, or Unresolved.

You do NOT have web search. Judge based on evidence presented by both sides and the section data.

Return your output as the JudgeVerdictSchema JSON format (Step 4).
```

Wait. Extract COMPLETE JSON, save to `sections/debate-step-4-judge.json`.

### 6g: Compose — Final Section 6 (Synthesis Writer)

Dispatch via Agent tool with:
1. Full prompt
2. All 4 debate step outputs (full JSON)
3. All 5 section outputs (reference and citation propagation)
4. Task:

```
You are COMPOSING the final Section 6 (Inversion & Rebuttal) for {TICKER} ({COMPANY_NAME}).

Your role is Compose (Final Call). Weave all 4 debate outputs into a cohesive Buffett-style narrative.

The verdict MUST follow the judge's overall direction. Include ALL bear source URLs.
Structure: thesis → antithesis → synthesis. Highlight which bear points were rebutted and which remain unresolved.

The narrative must be 600+ words. Synthesize, do NOT concatenate.

Return your output as the Composition ReportSectionSchema JSON (key: "inversion_rebuttal", sectionNumber: 6).
```

Wait. Extract COMPLETE JSON, validate ReportSectionSchema, save to `sections/inversion_rebuttal.json`. 10-50KB.

## Step 8: Assemble Final Report

```json
{
  "ticker": "{TICKER}",
  "companyName": "{from DataPacket companyInfo}",
  "stage": "fullStory",
  "generatedAt": "{ISO timestamp}",
  "sections": [
    /* 6 ReportSectionSchema objects ordered by sectionNumber (1-6) */
  ],
  "sectionKeys": ["event_analysis", "meaning_checklist", "moat_checklist", "management_checklist", "valuation_confirmation", "inversion_rebuttal"],
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

Write JSON to `.thes1s/reports/{TICKER}/full-story.json`.

Generate human-readable markdown at `.thes1s/reports/{TICKER}/full-story.md`. Structure: title + verdict + Pitch Deck verdict + debate direction header → Executive Summary (Section 6 verdictRationale + debate outcome) → Phase 1 sections (1-5) with narrative + verdict + checklist score + red flags → Section 6 (Inversion & Rebuttal) narrative + debate scorecard table (per-exchange Bull/Bear/Outcome) → Section verdicts table → All red flags aggregated → Citations.

## Step 10: Generate PDF

The PDF reader expects `full-story-api.json`, so copy first:

```bash
cp .thes1s/reports/{TICKER}/full-story.json .thes1s/reports/{TICKER}/full-story-api.json
python3 scripts/pdf/generate_full_story_pdf.py {TICKER}
```

If it fails, print warning and continue.

## Step 11: Auto-Archive

```bash
ARCHIVE_ID=$(date +%Y%m%d-%H%M%S)
mkdir -p .thes1s/reports/{TICKER}/archive/${ARCHIVE_ID}
cp .thes1s/reports/{TICKER}/full-story.json .thes1s/reports/{TICKER}/archive/${ARCHIVE_ID}/ 2>/dev/null
cp .thes1s/reports/{TICKER}/full-story-api.json .thes1s/reports/{TICKER}/archive/${ARCHIVE_ID}/ 2>/dev/null
cp .thes1s/reports/{TICKER}/sections/debate-*.json .thes1s/reports/{TICKER}/archive/${ARCHIVE_ID}/ 2>/dev/null
cp .thes1s/reports/{TICKER}/*.pdf .thes1s/reports/{TICKER}/archive/${ARCHIVE_ID}/ 2>/dev/null
```

Retry once on error.

## Step 12: Print Summary

Print: sections completed (X/6), overall verdict + confidence, Pitch Deck verdict, debate direction + Strong Bull/Bear/Unresolved counts, thesis killer count, investment implication, red flag total, citation total, output paths.

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

**Anti-pattern specific to Full Story:** when a debate step (Bear, Rebuttal, Compose) stalls, the orchestrator's instinct is to write the debate step output directly from its own context using the Write tool instead of re-dispatching the agent. Do not. Re-dispatch the agent.

## Constraints

**Contamination boundary.** During generation, NEVER read from:
- `knowledge/stage-1-one-pager/examples/`
- `knowledge/stage-2-pitch-deck/examples/`
- `knowledge/stage-3-full-story/examples/`
- `knowledge/pre-course-examples/`

**Schema enforcement.** Every section output MUST conform to ReportSectionSchema. Required fields: `key`, `title`, `sectionNumber`, `status`, `confidence`, `verdict`, `verdictRationale`, `summary`, `data`, `narrative`, `citations`, `redFlags` (>= 1), `modelUsed`, `tokenCost`. Debate step outputs (Steps 1-4) use lightweight formats, NOT ReportSectionSchema. Only Compose produces a ReportSectionSchema.

**Multi-role agents.** Two agents play multiple roles. When dispatching, the message MUST explicitly state the role:
- **Risk Analyst** — Phase 1 (S1: Event Analysis) + Phase 2 Step 2 (Bear). Bear dispatch MUST say: "Your role is Step 2: Bear Inversion" so Format B activates.
- **Synthesis Writer** — Phase 2 Steps 1, 3, Compose. Each dispatch MUST say: "Your role is Step 1: Bull Thesis" or "Your role is Step 3: Bull Rebuttal" or "Your role is Compose (Final Call)".

**Web search rule.** Phase 1 agents all have web search. Phase 2: Bull, Bear, Rebuttal have web search. Judge and Compose do NOT.

**Error resilience.** Phase 1 agent fails after retry → log, save what succeeded, continue to Phase 2 with available sections. Debate step fails after retry → debate cannot continue past that step; assemble report with Phase 1 sections only and note the failure. Compose fails → use judge verdict to construct minimal Section 6 with judge's direction as verdict and judge's summary as narrative. Always produce partial results rather than nothing.

**Agent model.** Defaults from Agent Registry (all sonnet). Pass the `model` param to the Agent tool per registry.
