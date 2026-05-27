---
name: generate-one-pager
description: "Generate a value investing One Pager investment screening for a given stock ticker"
argument-hint: TICKER
disable-model-invocation: true
---

# Generate One Pager

Generate a value investing One Pager investment screening for **$0**.

## Step 1: Validate Input

The ticker symbol is `$0`. Uppercase it and store as `TICKER`.

If `$0` is empty, print usage `/generate-one-pager TICKER` and stop.
Validate `TICKER` before running any command. It must match `^[A-Z0-9]+([.-][A-Z0-9]+)?$` and be 12 characters or fewer (examples: `AAPL`, `BRK.B`, `BF-B`). If it does not match, print `Invalid ticker` and stop.

Create `~/thesis/reports/{TICKER}/` and clean stale cache:

```bash
rm -rf ~/thesis/cache/{TICKER}/sections/
rm -rf ~/thesis/cache/{TICKER}/quality/
```

Mark the run as started:

```bash
node scripts/update-status.js {TICKER} onePager IN_PROGRESS
```

## Step 2: Fetch Hosted DataPacket

```bash
node --loader ./scripts/node-esm-loader.js scripts/assemble-data.js {TICKER}
```

This reads `~/thesis/config.json`, fetches the canonical DataPacket from the hosted Thesis Data API, validates it locally, and writes `~/thesis/reports/{TICKER}/data-packet.json`.

If fetch or validation fails, print the error and stop.

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

  ## DataPacket (sliced — core value investing metrics only)

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

Write to `~/thesis/reports/{TICKER}/one-pager.json`.

## Step 6: Generate PDF

```bash
python3 scripts/pdf/generate_one_pager_pdf.py {TICKER}
```

If it fails, print warning and continue.

## Step 7: Auto-Archive

```bash
ARCHIVE_ID=$(date +%Y%m%d-%H%M%S)
mkdir -p ~/thesis/reports/{TICKER}/archive/${ARCHIVE_ID}
cp ~/thesis/reports/{TICKER}/one-pager.json ~/thesis/reports/{TICKER}/archive/${ARCHIVE_ID}/ 2>/dev/null
cp ~/thesis/reports/{TICKER}/data-packet.json ~/thesis/reports/{TICKER}/archive/${ARCHIVE_ID}/ 2>/dev/null
cp ~/thesis/reports/{TICKER}/*.pdf ~/thesis/reports/{TICKER}/archive/${ARCHIVE_ID}/ 2>/dev/null
```

## Step 8: Mark Stage Complete

```bash
VERDICT=$(node -e "console.log(JSON.parse(require('fs').readFileSync(require('os').homedir() + '/thesis/reports/{TICKER}/one-pager.json','utf8')).overallVerdict)")
node scripts/update-status.js {TICKER} onePager COMPLETED "$VERDICT"
```

## Step 9: Print Summary

Print: overall verdict, per-section verdicts + confidence, red flag count, output paths.

## Constraints

**No API calls.** All AI work runs as Claude Code subagents. Never call `onePagerGenerator.js` or the Claude API directly.

**Contamination boundary.** During generation, NEVER read from:
- `knowledge/stage-1-one-pager/examples/`
- `knowledge/stage-2-pitch-deck/examples/`
- `knowledge/stage-3-final-thesis/examples/`
- `knowledge/pre-course-examples/`
