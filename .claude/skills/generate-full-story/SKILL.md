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
    prompt: agents-v2/risk-analyst-fullstory/prompt.md
    model: sonnet
    sections: [event_analysis]
    phase: 1
    debateRole: bear (Phase 2, Step 2)
    pdInheritance: [pest, radar]
    dpFields: [companyInfo, classification, financials, ttm, growthRates, peers, insiders, caveats]

  business-analyst:
    prompt: agents-v2/business-analyst-fullstory/prompt.md
    model: sonnet
    sections: [meaning_checklist]
    phase: 1
    pdInheritance: [simple_predictable, market_position]
    dpFields: [companyInfo, classification, ruleOneScore, peers, gurus, financials, ttm, growthRates, caveats]

  competitor-evaluator:
    prompt: agents-v2/competitor-evaluator-fullstory/prompt.md
    model: sonnet
    sections: [moat_checklist]
    phase: 1
    pdInheritance: [barriers_moats, market_position]
    dpFields: [companyInfo, classification, ruleOneScore, peers, peerMetrics, financials, ttm, growthRates, caveats]

  management-evaluator:
    prompt: agents-v2/management-evaluator-fullstory/prompt.md
    model: sonnet
    sections: [management_checklist]
    phase: 1
    pdInheritance: [management, balance_sheet]
    dpFields: [companyInfo, classification, compensation, insiders, gurus, financials, ttm, returnMetrics, caveats]

  valuation-specialist:
    prompt: agents-v2/valuation-specialist-fullstory/prompt.md
    model: sonnet
    sections: [valuation_confirmation]
    phase: 1
    pdInheritance: [fcf, roe_roic_debt, valuation]
    dpFields: [companyInfo, classification, financials, ttm, growthRates, returnMetrics, fcf, keyMetrics, caveats]

  synthesis-writer:
    prompt: agents-v2/synthesis-writer-fullstory/prompt.md
    model: sonnet
    sections: [inversion_rebuttal]
    phase: 2
    debateRoles: bull (Step 1), bull_rebuttal (Step 3), compose (Final)
    dpFields: []

  financial-analyst:
    prompt: agents-v2/financial-analyst-fullstory/prompt.md
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

## Step 2: Initialize Observatory

```bash
node scripts/observatory-init.js {TICKER} fullStory .thes1s/reports/{TICKER}/data-packet.json
```

Capture the **last line of output** as `RUN_ID`. Retry once on failure.

## Step 3: Read Prompts and Prepare Context

### 3a: Read Phase 1 Agent Prompts

- `agents-v2/risk-analyst-fullstory/prompt.md`
- `agents-v2/business-analyst-fullstory/prompt.md`
- `agents-v2/competitor-evaluator-fullstory/prompt.md`
- `agents-v2/management-evaluator-fullstory/prompt.md`
- `agents-v2/valuation-specialist-fullstory/prompt.md`

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

#### Observatory Recording

Per-agent usage: parse each subagent's `<usage>` block:
```
<usage>total_tokens: 24500
tool_uses: 8
duration_ms: 187000</usage>
```

Pass to record-agent: `{AGENT_TOTAL_TOKENS}` = total_tokens, `{SECONDS_ELAPSED}` = duration_ms / 1000, `{AGENT_WEB_SEARCHES}` = count `web_search` tool calls explicitly if visible, else estimate. Phase 1 analysis: `max(0, tool_uses - 1)`. Bull/Bear/Rebuttal: `max(0, tool_uses - 1)`. Judge and Compose: pass `0` (no web search).

Always pass `--tokens` and `--web-searches`. Without them, `usage.cost` records as $0.

```bash
node scripts/observatory-record-agent.js {RUN_ID} \
  --role risk-analyst --wave 1 --stage fullStory \
  --sections "event_analysis" --model claude-sonnet-4-6 \
  --duration {SECONDS_ELAPSED} --verdict {VERDICT} --confidence {CONFIDENCE} \
  --citations {CITATION_COUNT} --red-flags {RED_FLAG_COUNT} --narrative-length {NARRATIVE_LENGTH} \
  --tokens {AGENT_TOTAL_TOKENS} --web-searches {AGENT_WEB_SEARCHES}

node scripts/observatory-record-agent.js {RUN_ID} \
  --role business-analyst --wave 1 --stage fullStory \
  --sections "meaning_checklist" --model claude-sonnet-4-6 \
  --duration {SECONDS_ELAPSED} --verdict {VERDICT} --confidence {CONFIDENCE} \
  --citations {CITATION_COUNT} --red-flags {RED_FLAG_COUNT} --narrative-length {NARRATIVE_LENGTH} \
  --tokens {AGENT_TOTAL_TOKENS} --web-searches {AGENT_WEB_SEARCHES}

node scripts/observatory-record-agent.js {RUN_ID} \
  --role competitor-evaluator --wave 1 --stage fullStory \
  --sections "moat_checklist" --model claude-sonnet-4-6 \
  --duration {SECONDS_ELAPSED} --verdict {VERDICT} --confidence {CONFIDENCE} \
  --citations {CITATION_COUNT} --red-flags {RED_FLAG_COUNT} --narrative-length {NARRATIVE_LENGTH} \
  --tokens {AGENT_TOTAL_TOKENS} --web-searches {AGENT_WEB_SEARCHES}

node scripts/observatory-record-agent.js {RUN_ID} \
  --role management-evaluator --wave 1 --stage fullStory \
  --sections "management_checklist" --model claude-sonnet-4-6 \
  --duration {SECONDS_ELAPSED} --verdict {VERDICT} --confidence {CONFIDENCE} \
  --citations {CITATION_COUNT} --red-flags {RED_FLAG_COUNT} --narrative-length {NARRATIVE_LENGTH} \
  --tokens {AGENT_TOTAL_TOKENS} --web-searches {AGENT_WEB_SEARCHES}

node scripts/observatory-record-agent.js {RUN_ID} \
  --role valuation-specialist --wave 1 --stage fullStory \
  --sections "valuation_confirmation" --model claude-sonnet-4-6 \
  --duration {SECONDS_ELAPSED} --verdict {VERDICT} --confidence {CONFIDENCE} \
  --citations {CITATION_COUNT} --red-flags {RED_FLAG_COUNT} --narrative-length {NARRATIVE_LENGTH} \
  --tokens {AGENT_TOTAL_TOKENS} --web-searches {AGENT_WEB_SEARCHES}

node scripts/observatory-record-event.js {RUN_ID} dispatch \
  --wave 1 --stage "Deep Analysis" \
  --agents "risk-analyst,business-analyst,competitor-evaluator,management-evaluator,valuation-specialist" \
  --parallel true --duration {PHASE_DURATION_SECONDS}
```

## Step 6: Phase 2 — The Debate (Strictly Sequential)

### 6a: Read Debate Prompts

- `agents-v2/synthesis-writer-fullstory/prompt.md` (Bull, Rebuttal, Compose)
- `agents-v2/risk-analyst-fullstory/prompt.md` (Bear — already read)
- `agents-v2/financial-analyst-fullstory/prompt.md` (Judge)

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

## Step 7: Observatory Recording — Debate Phase

```bash
# After Bull (synthesis-writer)
node scripts/observatory-record-agent.js {RUN_ID} \
  --role synthesis-writer-bull --wave 2 --stage fullStory \
  --sections "debate_bull" --model claude-sonnet-4-6 \
  --duration {SECONDS_ELAPSED} --verdict {VERDICT} --confidence {CONFIDENCE} \
  --citations {CITATION_COUNT} --red-flags {RED_FLAG_COUNT} --narrative-length {NARRATIVE_LENGTH} \
  --tokens {AGENT_TOTAL_TOKENS} --web-searches {AGENT_WEB_SEARCHES}

# After Bear (risk-analyst)
node scripts/observatory-record-agent.js {RUN_ID} \
  --role risk-analyst-bear --wave 2 --stage fullStory \
  --sections "debate_bear" --model claude-sonnet-4-6 \
  --duration {SECONDS_ELAPSED} --verdict {VERDICT} --confidence {CONFIDENCE} \
  --citations {CITATION_COUNT} --red-flags {RED_FLAG_COUNT} --narrative-length {NARRATIVE_LENGTH} \
  --tokens {AGENT_TOTAL_TOKENS} --web-searches {AGENT_WEB_SEARCHES}

# After Rebuttal (synthesis-writer)
node scripts/observatory-record-agent.js {RUN_ID} \
  --role synthesis-writer-rebuttal --wave 2 --stage fullStory \
  --sections "debate_rebuttal" --model claude-sonnet-4-6 \
  --duration {SECONDS_ELAPSED} --verdict {VERDICT} --confidence {CONFIDENCE} \
  --citations {CITATION_COUNT} --red-flags {RED_FLAG_COUNT} --narrative-length {NARRATIVE_LENGTH} \
  --tokens {AGENT_TOTAL_TOKENS} --web-searches {AGENT_WEB_SEARCHES}

# After Judge (financial-analyst)
node scripts/observatory-record-agent.js {RUN_ID} \
  --role financial-analyst-judge --wave 2 --stage fullStory \
  --sections "debate_judge" --model claude-sonnet-4-6 \
  --duration {SECONDS_ELAPSED} --verdict {VERDICT} --confidence {CONFIDENCE} \
  --citations {CITATION_COUNT} --red-flags {RED_FLAG_COUNT} --narrative-length {NARRATIVE_LENGTH} \
  --tokens {AGENT_TOTAL_TOKENS} --web-searches {AGENT_WEB_SEARCHES}

# After Compose (synthesis-writer)
node scripts/observatory-record-agent.js {RUN_ID} \
  --role synthesis-writer-compose --wave 2 --stage fullStory \
  --sections "inversion_rebuttal" --model claude-sonnet-4-6 \
  --duration {SECONDS_ELAPSED} --verdict {VERDICT} --confidence {CONFIDENCE} \
  --citations {CITATION_COUNT} --red-flags {RED_FLAG_COUNT} --narrative-length {NARRATIVE_LENGTH} \
  --tokens {AGENT_TOTAL_TOKENS} --web-searches {AGENT_WEB_SEARCHES}

# Phase dispatch record
node scripts/observatory-record-event.js {RUN_ID} dispatch \
  --wave 2 --stage "Adversarial Debate" \
  --agents "synthesis-writer,risk-analyst,synthesis-writer,financial-analyst,synthesis-writer" \
  --parallel false --duration {PHASE_DURATION_SECONDS}
```

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

## Step 8.5: Pre-Finalize Event Sweep

Two-part sweep: scripted file-evidence checks, then a residual checklist for orchestrator-memory items the script cannot see.

**Part 1 — Scripted file-evidence sweep.** Run verbatim:

```bash
node scripts/observatory-sweep-debate.js {RUN_ID} {TICKER}
```

Detects (from saved debate artifacts): bull weak-strength concessions, bull factual errors acknowledged in rebuttal narratives, judge schema drift (missing judgeScore/pointNumber), missing-or-miscounted scoreboard, stub debate-step files (<2KB), markdown-fence wrap survival. Prints `logged N events (...)` summary.

**Part 2 — Orchestrator-memory checklist.** Answer honestly. **When in doubt, log it.**

```
[ ] Did any agent timeout, stall, or fail and get re-dispatched?          → retry (+ stall if >15min)
[ ] Did any "Stream idle timeout" or partial-response error occur?         → stall
[ ] Did you trim any agent's context/prompt and re-dispatch?               → retry, reason: "trimmed prompt to avoid timeout"
[ ] Did you write a debate step's output from orchestrator memory          → retry, reason: "orchestrator wrote from memory"
     instead of re-dispatching the agent?                                     (AND format-violation: "protocol violation — orchestrator as agent")
[ ] Did any agent use the Write tool when protocol said "return JSON"?     → format-violation
[ ] Did any agent wrap JSON in preamble text in the stream you observed    → format-violation
     (gone after extraction)?
[ ] Did you use the JSON extraction fallback chain for any agent?          → format-violation per agent
[ ] Did the rebuttal acknowledge any factual concession the script's       → format-violation per concession
     regex missed (Bull conceding to Bear with phrasing other than
     "factual error" / "the bear correctly caught")?
[ ] Did any agent flag missing DataPacket fields?                          → data-gap
[ ] Were any Pitch Deck inheritance sections missing/empty when Phase 1    → data-gap
     agents were dispatched?
```

For each `yes`, run the corresponding `observatory-record-event.js` command (see Format Violations + Retry Logic at the end of this skill for syntax).

## Step 9: Finalize Observatory

Parse the aggregate `<usage>` block across all subagent calls.

```bash
node scripts/observatory-finalize.js {RUN_ID} .thes1s/reports/{TICKER}/full-story.json --verdict {OVERALL_VERDICT} --tokens {TOTAL_TOKENS} --tool-uses {TOOL_USES} --duration {DURATION_SECONDS}
```

Retry once on error.

## Step 9.5: Wiki Synthesis

```bash
node --loader ./scripts/node-esm-loader.js scripts/observatory-synthesize.js {RUN_ID}
```

Retry once on error.

## Step 10: Generate PDF

The PDF reader expects `full-story-api.json`, so copy first:

```bash
cp .thes1s/reports/{TICKER}/full-story.json .thes1s/reports/{TICKER}/full-story-api.json
python3 scripts/pdf/generate_full_story_pdf.py {TICKER}
```

If it fails, print warning and continue.

## Step 11: Auto-Archive

```bash
mkdir -p .thes1s/reports/{TICKER}/archive/{RUN_ID}
cp .thes1s/reports/{TICKER}/full-story.json .thes1s/reports/{TICKER}/archive/{RUN_ID}/ 2>/dev/null
cp .thes1s/reports/{TICKER}/full-story-api.json .thes1s/reports/{TICKER}/archive/{RUN_ID}/ 2>/dev/null
cp .thes1s/reports/{TICKER}/sections/debate-*.json .thes1s/reports/{TICKER}/archive/{RUN_ID}/ 2>/dev/null
cp .thes1s/reports/{TICKER}/*.pdf .thes1s/reports/{TICKER}/archive/{RUN_ID}/ 2>/dev/null
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

### REQUIRED: Log Format Violations

Whenever the fallback chain triggers ANY of these, run before proceeding:

```bash
# Fallback extraction used
node scripts/observatory-record-event.js {RUN_ID} format-violation \
  --agent {AGENT_ROLE} --violation "fallback extraction required: {markdown fences | preamble | raw JSON | first-to-last brace}" --fix-applied true

# Key mismatch
node scripts/observatory-record-event.js {RUN_ID} format-violation \
  --agent {AGENT_ROLE} --violation "key mismatch: returned '{actual}' expected '{expected}'" --fix-applied true

# Shape mismatch
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

Log both if both apply. **Anti-pattern specific to Full Story:** when a debate step (Bear, Rebuttal, Compose) stalls, the orchestrator's instinct is to write the debate step output directly from its own context using the Write tool instead of re-dispatching the agent. **This is a retry AND a protocol violation — log both.**

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

**Agent model.** Defaults from Agent Registry (all sonnet). Pass the `model` param to the Agent tool per registry. Observatory tracks per-agent model for DOE.
