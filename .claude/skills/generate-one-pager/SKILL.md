---
name: generate-one-pager
description: "Generate a Rule One One Pager investment screening for a given stock ticker"
argument-hint: TICKER
disable-model-invocation: true
---

# Generate One Pager

Generate a Rule One One Pager investment screening for **$0**.

## Step 1: Validate Input

The ticker symbol is `$0`. Uppercase it and store as `TICKER`.

- If `$0` is empty, print usage: `/generate-one-pager TICKER` and stop.
- Create output directory: `.thes1s/reports/{TICKER}/`
- **Clean start:** Remove stale data from prior runs:
  ```bash
  rm -rf .thes1s/reports/{TICKER}/sections/
  rm -rf .thes1s/reports/{TICKER}/quality/
  ```

## Step 2: Assemble DataPacket

Run the data assembly script (no AI calls — just EDGAR/SEC/Finviz data fetching):

```bash
node --loader ./scripts/node-esm-loader.js scripts/assemble-data.js {TICKER}
```

This writes the DataPacket to `.thes1s/reports/{TICKER}/data-packet.json`.

If assembly fails, print the error and stop.

After assembly, read `.thes1s/reports/{TICKER}/data-packet.json` and note the field count and any errors.

## Step 3: Read Agent Prompt and Slice DataPacket

1. Read the One Pager agent prompt: `agents-v2/one-pager/prompt.md`
2. Slice the DataPacket to only the fields the one-pager analyst needs (EXP-005):

   ```bash
   node scripts/slice-datapacket.js {TICKER} one-pager > /tmp/{TICKER}-one-pager-slice.json
   ```

   This keeps: companyInfo, classification, financials, ttm, growthRates, returnMetrics, debtMetrics, fcf, keyMetrics, gurus, caveats. It drops: insiders, filings, compensation, peers, peerMetrics, ruleOneScore.

   Narrative context (business model, catalysts, management commentary) should come from web search, not DataPacket fields.

   Expect ~35% size reduction vs. full DataPacket.

## Step 3.5: Initialize Observatory Capture

Run the observatory init script to start tracking this pipeline run:

```bash
node scripts/observatory-init.js {TICKER} onePager .thes1s/reports/{TICKER}/data-packet.json
```

Capture the **last line of output** — that is the `RUN_ID`. You will need it in Step 5.5.

If this fails, retry once. Observatory tracking is required for every run.

## Step 4: Dispatch One Pager Subagent

Dispatch a single Claude Code subagent via the **Agent tool** with:

- **System context (concatenated in this order):**
  1. The full contents of `agents-v2/one-pager/prompt.md`
  2. A reminder about the output format: "Output ONLY a valid JSON object with the 6 section keys described in your prompt. No surrounding text, no markdown fences — just the raw JSON object."

- **User message:**
  ```
  Analyze {TICKER} and produce the complete One Pager screening.

  ## DataPacket (sliced — core Rule One metrics only)

  {contents of /tmp/{TICKER}-one-pager-slice.json}

  ## Assignment

  Produce the One Pager for {TICKER}. Follow your prompt instructions exactly.

  This DataPacket is intentionally sliced — it contains the numeric core (financials, growth rates, return metrics, FCF, key ratios, company info) plus guru holdings (Rule One "meaning" signal). It does NOT include insiders, filings, compensation, peers, or peer metrics. For narrative context (business model, catalysts, management commentary, competitive landscape), use web search — that's a first-class source for this stage.

  Be concise — each section 1-3 short paragraphs. Cite specific numbers from the DataPacket and specific claims from your web searches.
  ```

**Subagent model:** Use Sonnet (cost-efficient for a screening document).

Wait for the subagent to complete.

## Step 5: Extract and Save Output

The subagent's response should contain a JSON object with 6 keys (company_info, minimum_standards, meaning, growth_metrics, valuation_summary, overall_verdict).

**JSON extraction (handle CC subagent output variability):**

1. Look for a JSON code block (```json ... ```) in the response
2. If not found, look for a raw JSON object (starts with `{`, ends with `}`)
3. If not found, look for JSON between the first `{` and last `}` in the response
4. Parse the extracted JSON

**If JSON extraction fails:**
Retry once — dispatch the subagent again with the same prompt plus: "Your previous response could not be parsed as JSON. Output ONLY the raw JSON object — no markdown fences, no explanation text, no preamble. Start your response with { and end with }."

If retry also fails, print the error and stop.

**Transform to output format:**

Once parsed, wrap the 6-section output into the canonical one-pager format:

```json
{
  "ticker": "{TICKER}",
  "companyName": "{from company_info section or DataPacket}",
  "stage": "onePager",
  "generatedAt": "{ISO timestamp}",
  "overallVerdict": "{from overall_verdict.verdict}",
  "sectionKeys": ["company_info", "minimum_standards", "meaning", "growth_metrics", "valuation_summary", "overall_verdict"],
  "sections": [
    {
      "key": "company_info",
      "title": "Company Information",
      "sectionNumber": 1,
      "status": "{pass/fail/review based on verdict}",
      "confidence": "{from section}",
      "verdict": "{from section}",
      "verdictRationale": "{from section}",
      "summary": "{from section}",
      "data": "{}",
      "narrative": "{from section}",
      "citations": [],
      "tables": [],
      "charts": [],
      "redFlags": [],
      "primarySourceInsights": [],
      "crossCuttingFindings": [],
      "questions": [],
      "modelUsed": null,
      "tokenCost": null
    }
  ]
}
```

For each of the 6 sections, map the subagent's output fields (verdict, confidence, verdictRationale, summary, narrative, redFlags, citations) into the canonical schema above. Set `status` based on verdict: PASS → "pass", FAIL → "fail", WATCHLIST → "review".

Write to `.thes1s/reports/{TICKER}/one-pager.json`.

#### Observatory Recording (REQUIRED)

**First: parse the subagent's `<usage>` block.** The Agent tool result includes a usage block like:

```
<usage>total_tokens: 90220
tool_uses: 17
duration_ms: 202720</usage>
```

Extract `TOTAL_TOKENS`, `TOOL_USES`, and `DURATION_SECONDS` (= duration_ms / 1000). Also count how many of those tool uses were `web_search` calls — if the subagent's tool-call stream is visible to you, count web_search explicitly; if only the aggregate is available, estimate web_search count as `tool_uses - 3` (subtract ~3 for DataPacket read + agent prompt read + Write). Call this `WEB_SEARCHES`.

Then record the agent with all the usage data:

```bash
node scripts/observatory-record-agent.js {RUN_ID} \
  --role one-pager --wave 0 --stage onePager \
  --sections "company_info,minimum_standards,meaning,growth_metrics,valuation_summary,overall_verdict" \
  --model claude-sonnet-4-6 \
  --duration {DURATION_SECONDS} --verdict {OVERALL_VERDICT} --confidence {CONFIDENCE} \
  --citations {CITATION_COUNT} --red-flags {RED_FLAG_COUNT} --narrative-length {NARRATIVE_LENGTH} \
  --tokens {TOTAL_TOKENS} --web-searches {WEB_SEARCHES}

node scripts/observatory-record-event.js {RUN_ID} dispatch \
  --wave 0 --stage "One Pager" \
  --agents "one-pager" --parallel false --duration {DURATION_SECONDS}
```

**Why --tokens and --web-searches matter:** The script auto-computes `usage.cost` from tokens (Sonnet: $3/M input, $15/M output, 60/40 split if only total given) plus web searches ($0.01 each in Managed Agents production). This is the production-cost proxy EXP-005 uses to measure whether DataPacket slicing actually saves money. If you don't pass these flags, `usage.cost` stays 0 and cost-sensitivity analysis across runs is broken.

You MUST run this step. If the command errors, retry once before continuing.

## Step 5.4: Pre-Finalize Event Sweep (REQUIRED)

**Orchestrators systematically under-report their own problem-solving.** If the subagent's first response didn't parse cleanly, if you ran the retry prompt, if the output needed any fallback extraction — log it. The observatory's `formatViolations` array is only useful if it honestly reflects what happened. Silent cleanup produces empty arrays that make the one-pager agent prompt look cleaner than it is.

Sweep this run before finalize. Answer honestly:

```
Format violations:
  [ ] Did the subagent's output require markdown-fence stripping?            → format-violation
  [ ] Did the subagent's output contain preamble text before the JSON?       → format-violation
  [ ] Did the subagent emit multiple JSON objects (drafts + final)?          → format-violation
  [ ] Did the extracted JSON have a key mismatch vs. expected schema?        → format-violation
  [ ] Did you use any step past #1 of the JSON extraction fallback chain?    → format-violation

Retries:
  [ ] Did you dispatch the retry prompt at Step 5 because JSON parse failed? → retry
  [ ] Did you dispatch a second time for any other reason?                   → retry
```

For each `yes`:

```bash
# Format violation
node scripts/observatory-record-event.js {RUN_ID} format-violation \
  --agent one-pager --violation "{describe what deviated from clean output}" --fix-applied true

# Retry
node scripts/observatory-record-event.js {RUN_ID} retry \
  --agent one-pager --wave 0 --reason "{short reason}" --attempt 1 --resolved {true|false}
```

If there were no violations or retries, skip this step — but verify by checking that the subagent output was a single clean JSON object matching the schema on first attempt. If in doubt, log.

## Step 5.5: Finalize Observatory Capture (REQUIRED)

After the subagent completes, its result includes a `<usage>` block with token and timing data:
```
<usage>total_tokens: NNNNN
tool_uses: NN
duration_ms: NNNNNN</usage>
```

Parse these three values from the subagent result. Then run the observatory finalize script:

```bash
node scripts/observatory-finalize.js {RUN_ID} .thes1s/reports/{TICKER}/one-pager.json --verdict {OVERALL_VERDICT} --tokens {TOTAL_TOKENS} --tool-uses {TOOL_USES} --duration {DURATION_SECONDS}
```

Where:
- `{RUN_ID}` is from Step 3.5
- `{OVERALL_VERDICT}` is the verdict extracted in Step 5 (PASS, FAIL, or WATCHLIST)
- `{TOTAL_TOKENS}` is `total_tokens` from the usage block
- `{TOOL_USES}` is `tool_uses` from the usage block
- `{DURATION_SECONDS}` is `duration_ms` from the usage block divided by 1000 (convert to seconds)

You MUST run this step. If the command errors, retry once before continuing.

## Step 5.6: Observatory Wiki Synthesis (REQUIRED)

Run wiki synthesis to update agent profiles, ticker pages, and pattern pages:

```bash
node --loader ./scripts/node-esm-loader.js scripts/observatory-synthesize.js {RUN_ID}
```

You MUST run this step. If the command errors, retry once before continuing.

## Step 6: Generate PDF

Generate the Thes1s-branded PDF report:

```bash
python3 scripts/pdf/generate_one_pager_pdf.py {TICKER}
```

This reads `.thes1s/reports/{TICKER}/one-pager.json` + `data-packet.json` and produces a branded PDF in the same directory. If it fails, print a warning and continue — the JSON output is the primary artifact.

## Step 7: Auto-Archive

Archive this run's outputs using the observatory RUN_ID from Step 3.5:

```bash
mkdir -p .thes1s/reports/{TICKER}/archive/{RUN_ID}
cp .thes1s/reports/{TICKER}/one-pager.json .thes1s/reports/{TICKER}/archive/{RUN_ID}/ 2>/dev/null
cp .thes1s/reports/{TICKER}/data-packet.json .thes1s/reports/{TICKER}/archive/{RUN_ID}/ 2>/dev/null
cp .thes1s/reports/{TICKER}/*.pdf .thes1s/reports/{TICKER}/archive/{RUN_ID}/ 2>/dev/null
```

This preserves the run's output so future runs on the same ticker don't overwrite it. If archive fails, print the error but do not skip — the archive preserves run data for comparison.

## Step 8: Review Results

Print a summary:
- **Overall Verdict:** PASS / FAIL / WATCHLIST
- **Per-section verdicts** and confidence levels
- **Red flags:** total count and any critical ones
- **Output path:** `.thes1s/reports/{TICKER}/one-pager.json`
- **PDF path:** `.thes1s/reports/{TICKER}/` (if generated)

## Constraints

### No API Calls
All AI work runs as a Claude Code subagent. Never call `run-pipeline.js`, `onePagerGenerator.js`, or the Claude API directly.

### Contamination Boundary (CRITICAL)
During generation, NEVER read from any of these paths:
- `knowledge/stage-1-one-pager/examples/`
- `knowledge/stage-2-pitch-deck/examples/`
- `knowledge/stage-3-full-story/examples/`
- `knowledge/pre-course-examples/`

These contain the user's manual research examples used for quality benchmarking only.
