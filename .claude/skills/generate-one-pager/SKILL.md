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

- If `$0` is empty, print usage: `/generate:one-pager TICKER` and stop.

## Step 2: Generate One Pager

Run the single-call generator via CLI:

```bash
node --loader ./scripts/node-esm-loader.js scripts/run-pipeline.js {TICKER} onePager
```

This assembles the DataPacket (financial data, company info, growth rates, valuation) and generates the complete One Pager in a single Claude Sonnet API call. Output is written to `.thes1s/reports/{TICKER}/one-pager.json`.

**Monitor CLI output for:**
- DataPacket assembly time and field count
- Generation time and cost (should be under $1, under 3 minutes)
- Per-section verdicts (PASS/FAIL/WATCHLIST) and confidence levels
- Overall verdict

**Troubleshooting:**
- If "Failed to assemble DataPacket" — check network connectivity for EDGAR/Yahoo APIs
- If "Structured output parsing failed" — check `.env.local` has `VITE_CLAUDE_KEY` set
- If generation is slow — the DataPacket may be large; this is normal for data-rich companies

## Step 3: Review Results

Read the output file: `.thes1s/reports/{TICKER}/one-pager.json`

Print a summary:
- **Overall Verdict:** PASS / FAIL / WATCHLIST
- **Sections:** 6/6 (company_info, minimum_standards, meaning, growth_metrics, valuation_summary, overall_verdict)
- **Per-section verdicts** and confidence levels
- **Red flags:** total count and any critical ones
- **Cost:** from CLI output (token usage and estimated cost)

## Step 4: Quality Check (Optional)

Run the critic.js quality validator on the output:

```bash
node --import ./scripts/node-esm-loader.js -e "
  import { validateStage } from './src/engines/critic.js';
  import { readFileSync } from 'fs';
  const report = JSON.parse(readFileSync('.thes1s/reports/{TICKER}/one-pager.json', 'utf8'));
  const quality = validateStage(report.sections, null);
  console.log('Quality score:', quality.overallScore, '/ 100');
  console.log('Passed:', quality.overallPassed);
"
```

Quality scoring is informational, not blocking. The One Pager is a screening document — depth comes in the Pitch Deck.

## Constraints

### Contamination Boundary (CRITICAL)

During generation, NEVER read from any of these paths:
- `knowledge/stage-1-one-pager/examples/`
- `knowledge/stage-2-pitch-deck/examples/`
- `knowledge/stage-3-full-story/examples/`
- `knowledge/pre-course-examples/`

These contain the user's manual research examples used for quality benchmarking only.
