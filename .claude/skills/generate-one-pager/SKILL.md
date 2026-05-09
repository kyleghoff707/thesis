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

If `$0` is empty, print usage `/generate-one-pager TICKER` and stop.

Create `.thes1s/reports/{TICKER}/` and clean stale data:

```bash
rm -rf .thes1s/reports/{TICKER}/sections/
rm -rf .thes1s/reports/{TICKER}/quality/
```

## Step 2: Assemble DataPacket

```bash
node --loader ./scripts/node-esm-loader.js scripts/assemble-data.js {TICKER}
```

If assembly fails, print the error and stop.

## Step 3: Slice DataPacket

```bash
node scripts/slice-datapacket.js {TICKER} one-pager > /tmp/{TICKER}-one-pager-slice.json
```

Keeps: companyInfo, classification, financials, ttm, growthRates, returnMetrics, debtMetrics, fcf, keyMetrics, gurus, caveats. Drops everything else — narrative context comes from web search.

## Step 4: Dispatch One Pager Subagent

Read `agents/one-pager/prompt.md`.

Dispatch a single Sonnet subagent via the **Agent tool** with:

- **System context:** the full prompt + "Output ONLY a valid JSON object with the 6 section keys. First character `{`, last character `}`. No preamble, no markdown fences."
- **User message:**
  ```
  Analyze {TICKER} and produce the complete One Pager screening.

  ## DataPacket (sliced — core Rule One metrics only)

  {contents of /tmp/{TICKER}-one-pager-slice.json}

  ## Assignment

  Produce the One Pager for {TICKER}. Follow your prompt instructions exactly.

  This DataPacket is sliced — it contains the numeric core plus guru holdings. It does NOT include insiders, filings, compensation, peers, or peer metrics. Use web search for narrative context (business model, catalysts, management commentary, competitive landscape).

  Each section: 1-3 short paragraphs. Cite specific numbers from the DataPacket and specific claims from web searches.
  ```

Wait for completion.

## Step 5: Extract and Save

Extract JSON from the response using this chain:
1. JSON code block (```json ... ```)
2. Raw JSON object (first `{` to last `}`)

If parse fails, retry the subagent once with: "Your previous response could not be parsed as JSON. Output ONLY the raw JSON object — no markdown fences, no preamble. Start with `{` end with `}`."

If retry fails, print the error and stop.

Wrap parsed output into the canonical schema:

```json
{
  "ticker": "{TICKER}",
  "companyName": "{from company_info or DataPacket}",
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

Map verdict → status: PASS → "pass", FAIL → "fail", WATCHLIST → "review".

Write to `.thes1s/reports/{TICKER}/one-pager.json`.

## Step 6: Generate PDF

```bash
python3 scripts/pdf/generate_one_pager_pdf.py {TICKER}
```

If it fails, print warning and continue.

## Step 7: Auto-Archive

```bash
ARCHIVE_ID=$(date +%Y%m%d-%H%M%S)
mkdir -p .thes1s/reports/{TICKER}/archive/${ARCHIVE_ID}
cp .thes1s/reports/{TICKER}/one-pager.json .thes1s/reports/{TICKER}/archive/${ARCHIVE_ID}/ 2>/dev/null
cp .thes1s/reports/{TICKER}/data-packet.json .thes1s/reports/{TICKER}/archive/${ARCHIVE_ID}/ 2>/dev/null
cp .thes1s/reports/{TICKER}/*.pdf .thes1s/reports/{TICKER}/archive/${ARCHIVE_ID}/ 2>/dev/null
```

## Step 8: Print Summary

Print: overall verdict, per-section verdicts + confidence, red flag count, output paths.

## Constraints

**No API calls.** All AI work runs as Claude Code subagents. Never call `onePagerGenerator.js` or the Claude API directly.

**Contamination boundary.** During generation, NEVER read from:
- `knowledge/stage-1-one-pager/examples/`
- `knowledge/stage-2-pitch-deck/examples/`
- `knowledge/stage-3-full-story/examples/`
- `knowledge/pre-course-examples/`
