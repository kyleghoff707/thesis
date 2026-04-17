---
name: generate-full-story
description: Generate a 6-section Rule One Full Story (Stage 3) using v2 agent prompts, Claude Code subagent orchestration, adversarial debate, and Pitch Deck inheritance
argument-hint: TICKER
disable-model-invocation: true
---

# Generate Full Story (v2)

Generate a complete 6-section Rule One Full Story conviction document for **$0**.

This orchestrates 7 specialist agents across 2 phases via Claude Code Agent tool dispatch: Phase 1 dispatches 5 deep-analysis agents in parallel, Phase 2 runs a 4-step adversarial debate (Bull, Bear, Rebuttal, Judge) plus a composition step to produce the final Section 6. Runs end-to-end without stopping -- no PM checkpoints.

The Full Story is Stage 3 -- the final conviction gate before capital deployment. It builds entirely on the completed Pitch Deck (Stage 2). PSR findings are inherited, not re-run.

**Key v2 changes:** Self-contained agent prompts from `agents-v2/` (no config.json, no knowledgeBundle, no dispatch-table.json, no progressState.js, no run-pipeline.js). Multi-role agents (Risk Analyst plays Bear, Synthesis Writer plays Bull + Rebuttal + Compose). No old v1 references.

---

## Agent Registry

Each entry maps an agent role to its v2 prompt path, the section(s) or debate role it produces, its phase, **model** (from managed-agent.yaml), and Pitch Deck sections it inherits.

**Model is a controlled variable.** These defaults match the Managed Agents YAML configs. The observatory tracks which model each agent used, so DOE experiments can measure the effect of model changes on quality and cost.

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
    dpFields: []  # receives section outputs only, no raw DataPacket

  financial-analyst:
    prompt: agents-v2/financial-analyst-fullstory/prompt.md
    model: sonnet
    sections: []  # no independent section
    phase: 2
    debateRole: judge (Step 4)
    dpFields: []  # receives debate outputs only
```

## Pitch Deck Inheritance Map

Each Full Story section inherits specific Pitch Deck sections. Agents cite prior findings directly -- they go DEEPER, not wider.

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
Phase 1 (Deep Analysis):  risk-analyst + business-analyst + competitor-evaluator + management-evaluator + valuation-specialist  [ALL PARALLEL]
Phase 2 (The Debate):     Bull (synthesis-writer) -> Bear (risk-analyst) -> Rebuttal (synthesis-writer) -> Judge (financial-analyst) -> Compose (synthesis-writer)  [STRICTLY SEQUENTIAL]
```

Phase 1 agents dispatch **in parallel** (5 Agent tool calls in a single message). Phase 2 debate steps are strictly sequential -- each step depends on the prior step's output.

---

## CRITICAL RULE: DataPacket Slicing

> **You MUST NOT pass the full DataPacket file path to agents.** Instead, use the slicing script:
>
> ```bash
> node scripts/slice-datapacket.js {TICKER} {agent-role}
> ```
>
> This outputs only the fields that agent needs (per the Agent Registry `dpFields`).
> Embed the output as a fenced JSON block in the agent's prompt. One bash call per agent.
>
> **Why this matters:** The full DataPacket is 200KB. Passing it all wastes agent context
> and reduces output quality. The slicing script handles field extraction automatically —
> do NOT try to manually extract fields or tell the agent to "read the file yourself."

## CRITICAL RULE: Full-Fidelity Output Saving

> **NEVER summarize, abbreviate, or reconstruct agent output when saving to disk.**
>
> When an agent returns its result, the COMPLETE JSON output must be written to the section file
> using the Write tool. Do NOT create a new JSON object from memory with just key/verdict/summary fields.
> Do NOT write "stub" sections with short summaries to "keep things moving."
>
> **The correct save process:**
> 1. Extract the JSON from the agent response (see JSON Extraction Fallback Chain)
> 2. Write the COMPLETE extracted JSON to disk using the Write tool — every field the agent produced
> 3. Verify the saved file is at least 5KB for section files, 2KB for debate steps
> 4. If a file is under these thresholds, you have likely saved a stub — go back to the agent response and re-extract the full output
>
> Agent outputs typically contain: narrative (500-2000 words), citations (20-30), redFlags (5-10),
> data objects (checklists, tables, sensitivity matrices), tables, and charts arrays.
> A valid section file is 10-50KB. A valid debate-step file is 5-30KB.
> If your saved file is under these sizes, something went wrong.
>
> **This rule is non-negotiable.** Saving stubs destroys the pipeline output and invalidates
> the entire run. The PDF generator, quality checks, and observatory all read these files.

## Step 1: Validate Input and Gate Check

The ticker symbol is `$0`. Uppercase it and store as `TICKER`.

- If `$0` is empty, print usage: `/generate-full-story TICKER` and stop.
- **Clean start:** Remove stale section data from prior runs (but preserve pitch-deck.json and data-packet.json which this stage reads):
  ```bash
  rm -rf .thes1s/reports/{TICKER}/sections/
  rm -rf .thes1s/reports/{TICKER}/quality/
  ```
- Create output directories:
  - `.thes1s/reports/{TICKER}/`
  - `.thes1s/reports/{TICKER}/sections/`

**Gate Check:** Read `.thes1s/reports/{TICKER}/pitch-deck.json`. Verify:
1. The file exists
2. Parse it and check that `overallVerdict` is set (not null, not undefined)
3. Verify `overallVerdict` is not `"FAIL"` -- a FAIL verdict means the company did not pass the Pitch Deck gate

Also read `.thes1s/reports/{TICKER}/data-packet.json`. Verify the file exists.

If any check fails, print:
```
Gate check FAILED: Pitch Deck must be completed with a PASS or WATCHLIST verdict before generating a Full Story.
Run /generate-pitch-deck {TICKER} first.

Missing:
  pitch-deck.json: {exists/missing}
  data-packet.json: {exists/missing}
  Pitch Deck verdict: {verdict or "N/A"}
```
And **stop execution**.

If the gate passes, log:
```
Step 1: Gate check PASSED -- Pitch Deck verdict: {verdict}
Setting up Full Story generation for {TICKER}...
```

Store the Pitch Deck data and DataPacket for downstream use.

## Step 2: Initialize Observatory Capture

Run the observatory init script:

```bash
node scripts/observatory-init.js {TICKER} fullStory .thes1s/reports/{TICKER}/data-packet.json
```

Capture the **last line of output** -- that is the `RUN_ID`. You will need it in Step 9.

If this fails, retry once. Observatory tracking is required for every run.

## Step 3: Read Agent Prompts and Prepare Context

### 3a: Read All Phase 1 Agent Prompts

Read all 5 v2 agent prompts:
- `agents-v2/risk-analyst-fullstory/prompt.md`
- `agents-v2/business-analyst-fullstory/prompt.md`
- `agents-v2/competitor-evaluator-fullstory/prompt.md`
- `agents-v2/management-evaluator-fullstory/prompt.md`
- `agents-v2/valuation-specialist-fullstory/prompt.md`

### 3b: Extract DataPacket and Pitch Deck Context

Read the DataPacket from `.thes1s/reports/{TICKER}/data-packet.json`.
Read the Pitch Deck from `.thes1s/reports/{TICKER}/pitch-deck.json`.

For each Phase 1 agent, prepare two context blocks:

**DataPacket slice:** Run `node scripts/slice-datapacket.js {TICKER} {agent-role}` for each agent. Embed the output as a fenced JSON block. See CRITICAL RULE: DataPacket Slicing above.

**Pitch Deck inheritance:** Extract the relevant Pitch Deck sections per the PD_INHERITANCE_MAP. For each inherited PD section, include:
- The section's `summary`, `verdict`, `confidence`, `verdictRationale`
- The section's `narrative` (full text)
- The section's `redFlags` array
- The section's `citations` array
- The section's `data` object

Format as:
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

Also include any PSR findings if they exist in the Pitch Deck sections (check for `psr_annual` and `psr_quarterly` section keys, or check for `psrSummary` in the top-level pitch-deck.json). Format PSR findings as a separate context block.

Log:
```
Step 3: Context prepared
  DataPacket: {fieldCount} fields loaded
  Pitch Deck: {sectionCount} sections loaded
  PSR findings: {available/unavailable}
```

## Step 4: Phase 1 -- Deep Analysis (5 Agents in Parallel)

> **CRITICAL: Send ALL 5 Agent tool calls in a SINGLE message.**
> Do NOT dispatch agents one at a time. All 5 are independent — no shared state.

Dispatch all 5 section agents **simultaneously** via 5 Agent tool calls in a single message.

**For each agent, the prompt is concatenated as:**

1. Full contents of the agent's v2 prompt file (from Agent Registry)
2. DataPacket slice (relevant fields from registry) as a fenced JSON block
3. Inherited Pitch Deck sections (from PD_INHERITANCE_MAP) formatted per Step 3b
4. PSR findings (if available)
5. Task instruction specific to each agent (below)

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

Return your output as Format A (ReportSectionSchema) JSON -- the Event Analysis format defined in your prompt.
```

**Business Analyst (S2: Meaning Checklist):**
```
Analyze {TICKER} ({COMPANY_NAME}) for the Full Story.

You are producing Full Story Section 2: Meaning Checklist (15-point).
Your inherited Pitch Deck sections are above (Simple & Predictable, Market Position).
The DataPacket and PSR findings are provided.

Deepen the business understanding from the Pitch Deck into a structured 15-point conviction assessment.
Use web search for current business developments and industry context.

Return your output as a single ReportSectionSchema JSON object matching the output format in your prompt.
```

**Competitor Evaluator (S3: Moat Checklist):**
```
Analyze {TICKER} ({COMPANY_NAME}) for the Full Story.

You are producing Full Story Section 3: Moat Checklist (15-point).
Your inherited Pitch Deck sections are above (Barriers & Moats, Market Position).
The DataPacket and PSR findings are provided.

Validate competitive durability point by point with a 15-point moat checklist.
Use web search for competitive dynamics, recent entrants, and moat erosion signals.

Return your output as a single ReportSectionSchema JSON object matching the output format in your prompt.
```

**Management Evaluator (S4: Management Checklist):**
```
Analyze {TICKER} ({COMPANY_NAME}) for the Full Story.

You are producing Full Story Section 4: Management Checklist (13-point).
Your inherited Pitch Deck sections are above (Management, Balance Sheet).
The DataPacket and PSR findings are provided.

Assess leadership quality, integrity, and shareholder alignment with a 13-point checklist.
Use web search for recent management actions, governance issues, and leadership changes.

Return your output as a single ReportSectionSchema JSON object matching the output format in your prompt.
```

**Valuation Specialist (S5: Valuation Confirmation):**
```
Analyze {TICKER} ({COMPANY_NAME}) for the Full Story.

You are producing Full Story Section 5: Valuation Confirmation.
Your inherited Pitch Deck sections are above (FCF, ROE/ROIC & Debt, Valuation).
The DataPacket and PSR findings are provided.

Stress-test the Pitch Deck's valuation assumptions. Do NOT re-run the calculators -- validate the inputs.
Is the FGR achievable or does it require unrealistic market share? Is the growth real or debt-fueled?
Use web search for current analyst estimates, market conditions, and growth rate validation.

Return your output as a single ReportSectionSchema JSON object matching the output format in your prompt.
```

### Collect Phase 1 Outputs

After all 5 agents return:

1. **Extract JSON** from each agent response using the fallback chain (see "JSON Extraction Fallback Chain" below)
2. **Validate** each section has required fields: `key`, `title`, `sectionNumber`, `status`, `confidence`, `verdict`, `verdictRationale`, `summary`, `narrative` (>= 200 chars), `citations`, `redFlags` (>= 1)
3. **Check narrative length** -- if < 200 chars, apply Narrative Recovery (see below)
4. **Save the COMPLETE extracted JSON** to `.thes1s/reports/{TICKER}/sections/{section_key}.json` using the Write tool. Do NOT reconstruct a summary from memory. Write the full agent output as-is. See CRITICAL RULE above. Each file should be 10-50KB. If any file is under 5KB, you saved a stub — re-extract from the agent response.

**Retry logic:** If an agent fails entirely, wait 30 seconds and retry once. If retry fails, log the error and continue.

Log:
```
Step 4: Phase 1 -- Deep Analysis complete
  S1 Event Analysis:          {verdict} ({confidence}) | {citation_count} citations | {red_flag_count} red flags
  S2 Meaning Checklist:       {verdict} ({confidence}) | {citation_count} citations | {red_flag_count} red flags
  S3 Moat Checklist:          {verdict} ({confidence}) | {citation_count} citations | {red_flag_count} red flags
  S4 Management Checklist:    {verdict} ({confidence}) | {citation_count} citations | {red_flag_count} red flags
  S5 Valuation Confirmation:  {verdict} ({confidence}) | {citation_count} citations | {red_flag_count} red flags
  Phase 1: {completed}/5 sections complete
```

#### Observatory Recording (REQUIRED)

For each Phase 1 agent, record its performance. Extract verdict, confidence, red flags, and citations from saved section JSONs. You MUST run every recording command. If a command errors, retry it once before continuing.

**Per-agent usage parsing — applies to every record-agent call in this skill (Phase 1 + Phase 2 debate steps):**

Each subagent's result includes a `<usage>` block like:

```
<usage>total_tokens: 24500
tool_uses: 8
duration_ms: 187000</usage>
```

For each agent, parse that block and pass the values:
- `{AGENT_TOTAL_TOKENS}` — total_tokens from the usage block
- `{SECONDS_ELAPSED}` — duration_ms / 1000
- `{AGENT_WEB_SEARCHES}` — number of `web_search` tool calls the subagent made. Count explicitly if you can observe per-tool-call detail. Otherwise estimate by role: **(EXP-003 update: Bull, Bear, AND Rebuttal now all have web search.)** Bull/Bear/Rebuttal debate steps — estimate `max(0, tool_uses - 1)` (one input read). Judge and Compose have NO web search — pass `0`. Phase 1 analysis agents typically run 3-6 web searches (estimate `max(0, tool_uses - 1)` for one DataPacket read).

The script auto-computes `usage.cost` from tokens (Sonnet: $3/M input, $15/M output, 60/40 split when only total is given; Opus: $15/M input, $75/M output) plus web searches ($0.01 each — Managed Agents production billing). **This per-agent cost is the instrument the DOE log uses to attribute cost deltas to specific prompt changes.** If any record-agent call omits `--tokens` or `--web-searches`, that agent's cost will silently record as $0 and break cost-sensitivity analysis.

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

## Step 5: Log Phase 1 Results

Print Phase 1 summary with verdicts and any cross-cutting findings:

```
================================================================
  PHASE 1 COMPLETE: {TICKER} Full Story Deep Analysis
================================================================

  S1 Event Analysis:          {verdict} ({confidence})
  S2 Meaning Checklist:       {verdict} ({confidence})
  S3 Moat Checklist:          {verdict} ({confidence})
  S4 Management Checklist:    {verdict} ({confidence})
  S5 Valuation Confirmation:  {verdict} ({confidence})

  Cross-Cutting Findings:
  {aggregated cross-cutting findings from all sections, if any}

  Proceeding to Phase 2: The Debate...
================================================================
```

## Step 6: Phase 2 -- The Debate (Strictly Sequential)

### 6a: Read Debate Agent Prompts

Read the prompts for agents that play debate roles (if not already read):
- `agents-v2/synthesis-writer-fullstory/prompt.md` (Bull, Rebuttal, Compose)
- `agents-v2/risk-analyst-fullstory/prompt.md` (Bear -- already read in Step 3a)
- `agents-v2/financial-analyst-fullstory/prompt.md` (Judge)

### 6b: Prepare Section Summaries for Debate

Build a combined summary of all 5 sections for debate context:

```
## Completed Full Story Sections (S1-S5)

### S1: Event Analysis -- {verdict} ({confidence})
{summary}
Red Flags: {list}
Key Data: {event risk score, upcoming events count}

### S2: Meaning Checklist -- {verdict} ({confidence})
{summary}
Red Flags: {list}
Key Data: {checklist score, e.g. 12/15}

### S3: Moat Checklist -- {verdict} ({confidence})
{summary}
Red Flags: {list}
Key Data: {checklist score, e.g. 11/15}

### S4: Management Checklist -- {verdict} ({confidence})
{summary}
Red Flags: {list}
Key Data: {checklist score, e.g. 10/13}

### S5: Valuation Confirmation -- {verdict} ({confidence})
{summary}
Red Flags: {list}
Key Data: {FGR assessment, buy price confirmation}
```

### 6c: Step 1 -- Bull (Synthesis Writer)

Dispatch the Synthesis Writer via Agent tool with:
1. Full contents of `agents-v2/synthesis-writer-fullstory/prompt.md`
2. All 5 section outputs (full JSON -- verdicts, summaries, narratives, red flags, citations, data)
3. Task instruction:

```
You are the BULL in the Full Story Section 6 adversarial debate for {TICKER} ({COMPANY_NAME}).

Your role is Step 1: Bull Thesis. Synthesize the strongest possible investment thesis from Sections 1-5 provided above.

Extract 5-7 thesis points covering meaning, moat, management, valuation, and events.
Each point must cite the source section. Write a compelling overallThesis summary.

You HAVE web search for this role (EXP-003: symmetric evidentiary tooling with the Bear). Use it to surface positive catalysts, insider buying, guru activity, analyst upgrades, and validating third-party signals. Primary job is still distilling the section findings — web search is for sharpening and validating, not inventing a thesis the sections don't support.

Return your output as the Bull Thesis JSON format (Step 1) defined in your prompt.
```

Wait for completion. Extract the COMPLETE JSON from the agent response and write it to disk — not a 1-line summary, the full output. Save to `.thes1s/reports/{TICKER}/sections/debate-step-1-bull.json`.

Log:
```
  Step 1 (Bull): {thesisPointCount} thesis points | Overall thesis: {first 100 chars}...
```

### 6d: Step 2 -- Bear (Risk Analyst)

Dispatch the Risk Analyst via Agent tool with:
1. Full contents of `agents-v2/risk-analyst-fullstory/prompt.md`
2. The Bull thesis output (Step 1 JSON)
3. DataPacket slice (full dpFields for risk-analyst)
4. All 5 section outputs (for reference)
5. Task instruction:

```
You are the BEAR in the Full Story Section 6 adversarial debate for {TICKER} ({COMPANY_NAME}).

Your role is Step 2: Bear Inversion. The bull has presented their thesis above. Attack EVERY thesis point with cited counter-evidence.

Use web search for short-seller theses, negative analyst coverage, bear cases, and recent bad news. The Bull also has web search now (EXP-003) — your evidence advantage is no longer structural, it's in the quality and materiality of what you find. A bear point that doesn't survive a web-search-armed rebuttal wasn't a strong bear point to begin with.

Each inversion must cite specific evidence (URLs, DataPacket, SEC filings). Classify severity as thesis_killer, significant, or minor.

Return your output as the Bear Debate Step JSON format (Step 2 / Format B) defined in your prompt.
```

Wait for completion. Extract the COMPLETE JSON from the agent response and write it to disk — not a 1-line summary, the full output. Save to `.thes1s/reports/{TICKER}/sections/debate-step-2-bear.json`.

Log:
```
  Step 2 (Bear): {inversionCount} inversions | Thesis killers: {count} | Significant: {count} | Minor: {count}
```

### 6e: Step 3 -- Rebuttal (Synthesis Writer)

Dispatch the Synthesis Writer via Agent tool with:
1. Full contents of `agents-v2/synthesis-writer-fullstory/prompt.md`
2. The Bull thesis output (Step 1 JSON)
3. The Bear inversion output (Step 2 JSON)
4. All 5 section outputs (for evidence)
5. Task instruction:

```
You are the BULL REBUTTAL in the Full Story Section 6 adversarial debate for {TICKER} ({COMPANY_NAME}).

Your role is Step 3: Bull Rebuttal. The bear has attacked your thesis above. Respond to EACH inversion with evidence-based counter-arguments.

You do NOT have web search. Respond using evidence already gathered in Sections 1-5.
Rate each rebuttal honestly: strong, moderate, or weak. If the bear has a genuine point, acknowledge it.

Return your output as the Bull Rebuttal JSON format (Step 3) defined in your prompt.
```

Wait for completion. Extract the COMPLETE JSON from the agent response and write it to disk — not a 1-line summary, the full output. Save to `.thes1s/reports/{TICKER}/sections/debate-step-3-rebuttal.json`.

Log:
```
  Step 3 (Rebuttal): {rebuttalCount} rebuttals | Strong: {count} | Moderate: {count} | Weak: {count}
```

### 6f: Step 4 -- Judge (Financial Analyst)

Dispatch the Financial Analyst via Agent tool with:
1. Full contents of `agents-v2/financial-analyst-fullstory/prompt.md`
2. The Bull thesis output (Step 1 JSON)
3. The Bear inversion output (Step 2 JSON)
4. The Rebuttal output (Step 3 JSON)
5. All 5 section outputs (for reference)
6. Task instruction:

```
You are the JUDGE in the Full Story Section 6 adversarial debate for {TICKER} ({COMPANY_NAME}).

Your role is Step 4: Judge Verdict. Score EACH exchange between the bull and bear impartially.

For each bear inversion, evaluate: the bull's original claim, the bear's counter-argument, and the bull's rebuttal. Score as Strong Bull, Strong Bear, or Unresolved.

You do NOT have web search. Judge based on evidence presented by both sides and the section data.

Return your output as the JudgeVerdictSchema JSON format (Step 4) defined in your prompt.
```

Wait for completion. Extract the COMPLETE JSON from the agent response and write it to disk — not a 1-line summary, the full output. Save to `.thes1s/reports/{TICKER}/sections/debate-step-4-judge.json`.

Log:
```
  Step 4 (Judge): Direction: {direction} | Exchanges: {count} | Strong Bull: {count} | Strong Bear: {count} | Unresolved: {count}
```

### 6g: Compose -- Final Section 6 (Synthesis Writer)

Dispatch the Synthesis Writer via Agent tool with:
1. Full contents of `agents-v2/synthesis-writer-fullstory/prompt.md`
2. All 4 debate step outputs (Bull, Bear, Rebuttal, Judge -- full JSON)
3. All 5 section outputs (for reference and citation propagation)
4. Task instruction:

```
You are COMPOSING the final Section 6 (Inversion & Rebuttal) for {TICKER} ({COMPANY_NAME}).

Your role is Compose (Final Call). Weave all 4 debate outputs into a cohesive Buffett-style narrative.

The verdict MUST follow the judge's overall direction. Include ALL bear source URLs.
Structure: thesis -> antithesis -> synthesis. Highlight which bear points were rebutted and which remain unresolved.

The narrative must be 600+ words. Synthesize, do NOT concatenate.

Return your output as the Composition ReportSectionSchema JSON format defined in your prompt (key: "inversion_rebuttal", sectionNumber: 6).
```

Wait for completion. Extract the COMPLETE JSON from the agent response. Validate as ReportSectionSchema. Write the full output to `.thes1s/reports/{TICKER}/sections/inversion_rebuttal.json` — not a summary. This file should be 10-50KB. See CRITICAL RULE above.

Log:
```
  Compose: Section 6 complete | Verdict: {verdict} ({confidence}) | Debate direction: {direction}
```

## Step 7: Log Phase 2 Results

Print Phase 2 summary:

```
================================================================
  PHASE 2 COMPLETE: {TICKER} Full Story Adversarial Debate
================================================================

  Step 1 (Bull):     {thesisPointCount} thesis points
  Step 2 (Bear):     {inversionCount} inversions ({thesisKillerCount} thesis killers)
  Step 3 (Rebuttal): {rebuttalCount} rebuttals (strong: {N}, moderate: {N}, weak: {N})
  Step 4 (Judge):    Direction: {direction} | Unresolved: {unresolvedCount}
  Compose:           Verdict: {verdict} ({confidence})

  Debate outcome: {judge's summary}
================================================================
```

#### Observatory Recording — Debate Phase (REQUIRED)

For each debate step agent, record its performance. You MUST run every recording command. If a command errors, retry it once before continuing.

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

Collect all 6 sections + debate steps:

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
  "overallVerdict": "{from Section 6 / judge direction mapped: Bull=PASS, Bear=FAIL, Mixed=WATCHLIST}",
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

**Write JSON report** to `.thes1s/reports/{TICKER}/full-story.json`

**Generate human-readable markdown** at `.thes1s/reports/{TICKER}/full-story.md`:

```markdown
# {Company Name} ({TICKER}) -- Full Story

**Generated:** {date}
**Overall Verdict:** {PASS/FAIL/WATCHLIST} ({confidence})
**Pitch Deck Verdict:** {verdict} (generated {date})
**Debate Direction:** {Bull/Bear/Mixed}

---

## Executive Summary
{Section 6 verdictRationale + debate outcome summary}

---

## Phase 1: Deep Analysis

### 1. Event Analysis
{narrative}

**Verdict:** {verdict} | **Confidence:** {confidence}

#### Red Flags
- {list}

---

### 2. Meaning Checklist (15-point)
{narrative}

**Verdict:** {verdict} | **Confidence:** {confidence}
**Score:** {checklist score}/15

#### Red Flags
- {list}

---

### 3. Moat Checklist (15-point)
{narrative}

**Verdict:** {verdict} | **Confidence:** {confidence}
**Score:** {checklist score}/15

#### Red Flags
- {list}

---

### 4. Management Checklist (13-point)
{narrative}

**Verdict:** {verdict} | **Confidence:** {confidence}
**Score:** {checklist score}/13

#### Red Flags
- {list}

---

### 5. Valuation Confirmation
{narrative}

**Verdict:** {verdict} | **Confidence:** {confidence}

#### Red Flags
- {list}

---

## Phase 2: The Debate

### Section 6: Inversion & Rebuttal
{Section 6 narrative -- the composed Buffett-style debate synthesis}

**Verdict:** {verdict} | **Confidence:** {confidence}
**Debate Direction:** {direction} | **Unresolved:** {count}

#### Debate Scorecard
| Exchange | Bull | Bear | Outcome |
|----------|------|------|---------|
{for each exchange from judge verdict}

#### Red Flags
- {list}

---

## Section Verdicts
| Section | Verdict | Confidence |
|---------|---------|------------|
| 1. Event Analysis | {verdict} | {confidence} |
| 2. Meaning Checklist | {verdict} | {confidence} |
| 3. Moat Checklist | {verdict} | {confidence} |
| 4. Management Checklist | {verdict} | {confidence} |
| 5. Valuation Confirmation | {verdict} | {confidence} |
| 6. Inversion & Rebuttal | {verdict} | {confidence} |

---

## All Red Flags
{aggregated from all 6 sections}

---

## Citations
1. {citation 1}
2. {citation 2}
...
```

Log:
```
Step 8: Report assembled
  Sections: {completed}/6
  Overall verdict: {verdict}
  Total citations: {count}
  Total red flags: {count}
  Output: .thes1s/reports/{TICKER}/full-story.json
  Output: .thes1s/reports/{TICKER}/full-story.md
```

## Step 8.5: Pre-Finalize Event Sweep (REQUIRED)

**This step exists because orchestrators systematically under-report their own problem-solving.** When an agent stalls and you re-dispatch, when output needs renaming, when JSON requires fallback extraction, when a debate step's output is written from orchestrator memory instead of re-dispatching — your default mode is "silent cleanup to keep the pipeline moving," not "log it for future-me." That bias produces empty `retries: []`, `stallsDetected: []`, `formatViolations: []` arrays in the observatory, which makes the agent prompts look cleaner than they actually are. DOE experiments reading empty telemetry will conclude "these prompts produce clean output" when in fact the orchestrator was smoothing over mess.

Before running observatory-finalize, retrospectively sweep this run for every event the in-the-moment mode missed. Answer each yes/no honestly. **When in doubt, log it — the cost of a false positive is one extra row in a JSON array; the cost of a false negative is a corrupted DOE conclusion.**

For each `yes`, run the corresponding `observatory-record-event.js` command. The cheat-sheet is in [Retry Logic](#retry-logic), [Log Format Violations](#required-log-format-violations), and below.

```
Retries:
  [ ] Did any agent timeout, stall, or fail and get re-dispatched?          → retry (+ stall if >15min before intervention)
  [ ] Did any agent require a second prompt to produce valid JSON?           → retry, reason: "JSON parse failed"
  [ ] Did any agent require a second prompt for a full narrative?            → retry, reason: "narrative stub"
  [ ] Did you trim any agent's context/prompt and re-dispatch?               → retry, reason: "trimmed prompt to avoid timeout"
  [ ] Did you write a debate step's output from orchestrator memory          → retry, reason: "orchestrator wrote from memory vs re-dispatch"
       instead of re-dispatching the agent?                                     (AND format-violation: "protocol violation — orchestrator as agent")

Stalls:
  [ ] Did any sonnet agent run longer than ~15min?                           → stall
  [ ] Did any opus agent run longer than ~25min?                             → stall
  [ ] Did any "Stream idle timeout" or partial-response error occur?         → stall, resolution: "idle timeout — trimmed and re-dispatched" (or similar)

Format violations:
  [ ] Did any agent use markdown fences despite being told not to?           → format-violation
  [ ] Did any agent wrap JSON in preamble text ("Now I have...")?            → format-violation
  [ ] Did any agent return an array when an object was expected?             → format-violation
  [ ] Did any agent return multiple JSON objects instead of one?             → format-violation
  [ ] Did any agent return partial drafts with "..." before the real JSON?   → format-violation
  [ ] Did the extracted key not match the expected key?                      → format-violation
  [ ] Did you rename any saved file (wrong extension, wrong path, wrong case)? → format-violation
  [ ] Did any agent save to a wrong directory (project root vs sections/)?   → format-violation
  [ ] Did any debate step output end up < 2KB (stub) or get written from     → format-violation
       orchestrator memory?                                                       (AND retry as noted above)
  [ ] Did you use the JSON extraction fallback chain at all for any agent?   → format-violation (for each)

Data gaps:
  [ ] Did any agent flag missing DataPacket fields?                          → data-gap
  [ ] Did the DataPacket slice step get skipped for any agent (especially    → data-gap, description: "slice skipped for {agent}"
       the Bear in the debate)?
  [ ] Were any Pitch Deck inheritance sections missing/empty when Phase 1    → data-gap
       agents were dispatched?
```

**How to verify your sweep is complete:**

```bash
cat observatory/runs/{RUN_ID}/orchestrator.json
```

Look at the four arrays: `retries`, `stallsDetected`, `formatViolations`, `dataGaps`. Ask yourself: "Does this honestly reflect what happened during the run, or does it look cleaner than reality?" If the run had ANY mid-wave problem-solving and these arrays are still empty, you haven't logged enough.

This step is retrospective on purpose — logging during the wave competes with the "get it done" mode. Logging now, one step before finalize, fits natural bookkeeping.

## Step 9: Finalize Observatory Capture

Parse the `<usage>` block from the overall session (aggregate across all subagent calls if available). Then run:

```bash
node scripts/observatory-finalize.js {RUN_ID} .thes1s/reports/{TICKER}/full-story.json --verdict {OVERALL_VERDICT} --tokens {TOTAL_TOKENS} --tool-uses {TOOL_USES} --duration {DURATION_SECONDS}
```

Where:
- `{RUN_ID}` is from Step 2
- `{OVERALL_VERDICT}` is the final verdict (PASS, FAIL, or WATCHLIST)
- Token/tool/duration values are best-effort estimates from subagent usage blocks

You MUST run this step. If the command errors, retry once before continuing.

## Step 9.5: Observatory Wiki Synthesis (REQUIRED)

Run wiki synthesis to update agent profiles, ticker pages, and pattern pages:

```bash
node --loader ./scripts/node-esm-loader.js scripts/observatory-synthesize.js {RUN_ID}
```

Wiki synthesis is part of the pipeline -- run it now. If the command errors, retry once before continuing.

## Step 10: Generate PDF

Generate the Thes1s-branded Full Story PDF. The PDF reader expects `full-story-api.json`, so copy the output file first:

```bash
cp .thes1s/reports/{TICKER}/full-story.json .thes1s/reports/{TICKER}/full-story-api.json
python3 scripts/pdf/generate_full_story_pdf.py {TICKER}
```

This produces a branded PDF with checklist tables, debate rendering, and evidence sections. If it fails, print a warning and continue — the JSON output is the primary artifact.

## Step 11: Auto-Archive

Archive this run's outputs using the observatory RUN_ID from Step 2:

```bash
mkdir -p .thes1s/reports/{TICKER}/archive/{RUN_ID}
cp .thes1s/reports/{TICKER}/full-story.json .thes1s/reports/{TICKER}/archive/{RUN_ID}/ 2>/dev/null
cp .thes1s/reports/{TICKER}/full-story-api.json .thes1s/reports/{TICKER}/archive/{RUN_ID}/ 2>/dev/null
cp .thes1s/reports/{TICKER}/sections/debate-*.json .thes1s/reports/{TICKER}/archive/{RUN_ID}/ 2>/dev/null
cp .thes1s/reports/{TICKER}/*.pdf .thes1s/reports/{TICKER}/archive/{RUN_ID}/ 2>/dev/null
```

This preserves the run's output so future runs on the same ticker don't overwrite it. You MUST run this step. If the command errors, retry once before continuing.

## Step 12: Print Final Summary

```
================================================================
  FULL STORY GENERATION COMPLETE: {TICKER}
================================================================

Sections completed: {X}/6
Overall verdict: {PASS/FAIL/WATCHLIST} ({confidence})
Pitch Deck verdict: {verdict}
Debate direction: {direction}

--- Section Verdicts ---
  1.  Event Analysis:          {verdict} ({confidence})
  2.  Meaning Checklist:       {verdict} ({confidence})
  3.  Moat Checklist:          {verdict} ({confidence})
  4.  Management Checklist:    {verdict} ({confidence})
  5.  Valuation Confirmation:  {verdict} ({confidence})
  6.  Inversion & Rebuttal:    {verdict} ({confidence})

--- Debate ---
  Direction: {Bull/Bear/Mixed}
  Exchanges: {count}
  Strong Bull: {count} | Strong Bear: {count} | Unresolved: {count}
  Thesis killers found: {count}
  Investment implication: {from judge}

--- Red Flags ---
  Total: {count} across all sections

--- Citations ---
  Total: {count} across all sections

--- Output Files ---
  Report (JSON): .thes1s/reports/{TICKER}/full-story.json
  Report (MD):   .thes1s/reports/{TICKER}/full-story.md
  Sections:      .thes1s/reports/{TICKER}/sections/*.json
  Debate Steps:  .thes1s/reports/{TICKER}/sections/debate-step-*.json

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

### REQUIRED: Log Format Violations

**This is load-bearing observability — not optional cleanup.** The orchestrator's default instinct is to silently fix agent output and keep moving. That bias corrupts the observatory's format-violation metric, which the DOE uses to measure prompt quality. Log every deviation from clean output, even if you fix it in one line.

Whenever the fallback chain triggers ANY of these, run the record-event command BEFORE proceeding:

```bash
# Fallback extraction used (not the happy path — agent output had markdown fences, preamble, or raw JSON instead of the expected fenced block)
node scripts/observatory-record-event.js {RUN_ID} format-violation \
  --agent {AGENT_ROLE} --violation "fallback extraction required: {describe: markdown fences | preamble text | raw JSON without fences | first-to-last brace | etc}" --fix-applied true

# Key mismatch (agent returned "pest_risks" when schema expected "pest"; agent saved "market-position.json" when expected "market_position.json"; etc)
node scripts/observatory-record-event.js {RUN_ID} format-violation \
  --agent {AGENT_ROLE} --violation "key mismatch: returned '{actual}' expected '{expected}'" --fix-applied true

# Agent returned multiple JSON objects or an array when a single object was expected (or vice versa)
node scripts/observatory-record-event.js {RUN_ID} format-violation \
  --agent {AGENT_ROLE} --violation "shape mismatch: {describe — multiple objects, array vs object, partial drafts, etc}" --fix-applied true

# Agent saved to wrong path (project root instead of sections/, wrong filename, etc)
node scripts/observatory-record-event.js {RUN_ID} format-violation \
  --agent {AGENT_ROLE} --violation "filesystem violation: saved to {wrong path} instead of {expected path}" --fix-applied true

# Agent wrote output directly via Write tool instead of returning JSON in response (or vice versa)
node scripts/observatory-record-event.js {RUN_ID} format-violation \
  --agent {AGENT_ROLE} --violation "protocol violation: used Write tool instead of response body (or vice versa)" --fix-applied true
```

If JSON parsing required the retry prompt at step 5, log a retry too (see Retry Logic below).

## Narrative Recovery

After extracting section JSON, check each section's `narrative` field:
- If `narrative.length < 200`: The agent likely produced a stub.
  1. Search the agent's full response text for substantial prose (markdown with ## headings, > 200 chars)
  2. If found, inject it into the section's `narrative` field and re-save. **Log a format-violation:**
     ```bash
     node scripts/observatory-record-event.js {RUN_ID} format-violation \
       --agent {AGENT_ROLE} --violation "narrative stub in JSON, recovered {length} chars of prose from response body" --fix-applied true
     ```
  3. If no recoverable narrative found, retry the agent once with: "Your previous output had a {length}-char narrative stub. The narrative field MUST contain your FULL analysis (500+ words). Write the complete narrative." **Log the retry:**
     ```bash
     node scripts/observatory-record-event.js {RUN_ID} retry \
       --agent {AGENT_ROLE} --wave {N} --reason "narrative stub ({length} chars) — full narrative required" --attempt 1 --resolved false
     ```
     After the retry completes, re-run with `--resolved true` if the retry succeeded.
  4. If retry also produces a stub, save with a warning and continue

## Retry Logic

If any agent fails entirely (rate limit, timeout, error):
1. Wait 30 seconds
2. Re-dispatch with the same prompt
3. If the retry also fails, log the error, save partial output with `status: "failed"`, and continue
4. Do NOT retry more than once -- the PM can re-run individual sections manually

### REQUIRED: Log Every Retry and Stall

**When you retry, log it. When you trim a prompt to avoid a timeout, log it. When an agent runs >15min and you kill it, log it.** Silent workarounds corrupt the observatory's orchestrator telemetry.

```bash
# Agent retry (any reason — timeout, rate limit, parse failure, stub narrative, key mismatch that can't be auto-fixed, etc)
node scripts/observatory-record-event.js {RUN_ID} retry \
  --agent {AGENT_ROLE} --wave {N} --reason "{short reason: timeout | rate-limit | JSON parse failed | narrative stub | schema violation | ...}" --attempt 1 --resolved {true|false}

# Stall detected (agent running unusually long before you intervened — timeout, idle stream, partial response, etc)
# "Unusually long" = >15min for sonnet agents, >25min for opus agents.
node scripts/observatory-record-event.js {RUN_ID} stall \
  --agent {AGENT_ROLE} --wave {N} --duration {seconds_before_intervention} --resolution "{how you resolved: retried with trimmed prompt | killed and re-dispatched | timed out | ...}"
```

Retry and stall are NOT redundant. Log both if both apply: stall captures "how long it ran before intervention," retry captures "what happened after intervention."

**Full Story has an additional anti-pattern to watch for:** when a debate step (Bear, Rebuttal, Compose) stalls, the orchestrator's instinct is to write the debate step output directly from its own context using the Write tool instead of re-dispatching the agent. **This is a retry AND a protocol violation — log both.**

## Constraints

### Contamination Boundary (CRITICAL)
During generation, NEVER read from any of these paths:
- `knowledge/stage-1-one-pager/examples/`
- `knowledge/stage-2-pitch-deck/examples/`
- `knowledge/stage-3-full-story/examples/`
- `knowledge/pre-course-examples/`

These contain the user's manual research examples. Agents must generate from their v2 prompt (which has curriculum baked in) + DataPacket + Pitch Deck inheritance alone.

### Schema Enforcement
Every section output MUST conform to ReportSectionSchema. Required fields: `key`, `title`, `sectionNumber`, `status`, `confidence`, `verdict`, `verdictRationale`, `summary`, `data`, `narrative`, `citations`, `redFlags` (>= 1), `modelUsed`, `tokenCost`.

Debate step outputs (Steps 1-4) use their own lightweight formats, NOT ReportSectionSchema. Only the Compose step produces a ReportSectionSchema.

### Error Resilience
- If a Phase 1 agent fails entirely after retry, log the error, save what succeeded, continue to Phase 2 with available sections.
- If a debate step fails after retry, the debate cannot continue past that step. Assemble the report with Phase 1 sections only and note the debate failure.
- If the Compose step fails, use the judge verdict to construct a minimal Section 6 with the judge's direction as the verdict and the judge's summary as the narrative.
- The pipeline ALWAYS produces partial results rather than nothing.

### Multi-Role Agent Handling
Two agents play multiple roles:
- **Risk Analyst** -- Phase 1 (S1: Event Analysis) + Phase 2 Step 2 (Bear). When dispatching as Bear, the message MUST explicitly state: "Your role is Step 2: Bear Inversion" so the agent activates Format B output.
- **Synthesis Writer** -- Phase 2 Steps 1, 3, and Compose. Each dispatch MUST explicitly state which role: "Your role is Step 1: Bull Thesis" or "Your role is Step 3: Bull Rebuttal" or "Your role is Compose (Final Call)".

### Web Search Rule (updated EXP-003 — symmetric tooling)
Phase 1 agents all have web search (their prompts state this). In Phase 2: Bull, Bear, and Rebuttal all have web search. Judge and Compose do NOT — the Judge is a neutral arbiter judging presented evidence, and Compose is assembly-only. Bull/Bear symmetry is deliberate: the bear's evidence advantage was the core structural bias. Judge still adjudicates claims without its own research — its impartiality is the integrity of the debate.

### Agent Model Selection
**Model assignments are controlled variables** (from managed-agent.yaml configs). When dispatching each agent via the Agent tool, use the `model` parameter from the Agent Registry above. Default: all agents use **sonnet**. (Sprint 1 used opus for risk-analyst — switched to all-sonnet for Sprint 2 experiment per DOE.) The observatory tracks which model each agent used so DOE experiments can measure the effect of model swaps on quality and cost.

### Progress Display
```
Step 1:   Validating input and gate check...
Step 2:   Observatory initialized (RUN_ID: {id})
Step 3:   Reading prompts and preparing context...
Step 4:   Phase 1 -- Deep Analysis (5 agents in parallel)...
Step 5:   Phase 1 results logged
Step 6:   Phase 2 -- The Debate (4 steps + compose, strictly sequential)...
          Step 1 (Bull): dispatching synthesis-writer...
          Step 2 (Bear): dispatching risk-analyst...
          Step 3 (Rebuttal): dispatching synthesis-writer...
          Step 4 (Judge): dispatching financial-analyst...
          Compose: dispatching synthesis-writer...
Step 7:   Phase 2 results logged
Step 8:   Assembling final report...
Step 9:   Finalizing observatory capture...
Step 10:  Generation complete.
```
