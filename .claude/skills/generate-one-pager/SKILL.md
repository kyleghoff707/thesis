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

## Step 3: Read Agent Prompt and DataPacket

1. Read the One Pager agent prompt: `agents-v2/one-pager/prompt.md`
2. Read the DataPacket: `.thes1s/reports/{TICKER}/data-packet.json`

## Step 3.5: Initialize Observatory Capture

Run the observatory init script to start tracking this pipeline run:

```bash
node scripts/observatory-init.js {TICKER} onePager .thes1s/reports/{TICKER}/data-packet.json
```

Capture the **last line of output** — that is the `RUN_ID`. You will need it in Step 5.5.

If this fails, print a warning and continue — observatory is non-blocking.

## Step 4: Dispatch One Pager Subagent

Dispatch a single Claude Code subagent via the **Agent tool** with:

- **System context (concatenated in this order):**
  1. The full contents of `agents-v2/one-pager/prompt.md`
  2. A reminder about the output format: "Output ONLY a valid JSON object with the 6 section keys described in your prompt. No surrounding text, no markdown fences — just the raw JSON object."

- **User message:**
  ```
  Analyze {TICKER} and produce the complete One Pager screening.

  ## DataPacket

  {full DataPacket JSON}

  ## Assignment

  Produce the One Pager for {TICKER}. Follow your prompt instructions exactly. Use web search for current information. Be concise — each section 1-3 short paragraphs. Cite specific numbers from the DataPacket and from your web searches.
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

#### Observatory Recording (non-blocking)

Record the one-pager agent's performance. Extract verdict, confidence, and section metrics from the saved one-pager JSON.

```bash
node scripts/observatory-record-agent.js {RUN_ID} \
  --role one-pager --wave 0 --stage onePager \
  --sections "company_info,minimum_standards,meaning,growth_metrics,valuation_summary,overall_verdict" \
  --model claude-sonnet-4-6 \
  --duration {SECONDS_ELAPSED} --verdict {OVERALL_VERDICT} --confidence {CONFIDENCE} \
  --citations {CITATION_COUNT} --red-flags {RED_FLAG_COUNT} --narrative-length {NARRATIVE_LENGTH}

node scripts/observatory-record-event.js {RUN_ID} dispatch \
  --wave 0 --stage "One Pager" \
  --agents "one-pager" --parallel false --duration {SECONDS_ELAPSED}
```

If this fails, print a warning and continue -- observatory recording is non-blocking.

## Step 5.5: Finalize Observatory Capture

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

If this fails, print a warning and continue — observatory is non-blocking.

## Step 5.6: Observatory Wiki Synthesis (non-blocking)

Run wiki synthesis to update agent profiles, ticker pages, and pattern pages:

```bash
node --loader ./scripts/node-esm-loader.js scripts/observatory-synthesize.js {RUN_ID}
```

If this fails, print a warning and continue -- wiki synthesis can be run manually later.

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

This preserves the run's output so future runs on the same ticker don't overwrite it. Non-blocking — if it fails, continue.

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
