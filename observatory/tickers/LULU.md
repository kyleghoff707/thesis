---
type: ticker-page
ticker: LULU
companyName: lululemon athletica inc.
lastUpdated: 2026-04-16T14:01:30.310Z
runCount: 3
expectedVerdict: not set
verdictHistory: [WATCHLIST, WATCHLIST, WATCHLIST]
verdictAccuracy: N/A
tags: [ticker, LULU, consumer-cyclical]
---

## Run History

| Run ID | Stage | Verdict | Expected | Match | Cost | Duration | Sections | Notes |
|--------|-------|---------|----------|-------|------|----------|----------|-------|
| 20260415-203246-LULU-onePager | onePager | WATCHLIST | — | — | $0.69 | 4min | 6/6 | No errors, no retries |
| 20260415-204131-LULU-pitchDeck | pitchDeck | WATCHLIST | — | — | $7.39 | 58min | 10/11 | 1 section missing |
| 20260415-220013-LULU-fullStory | fullStory | WATCHLIST | — | — | $7.41 | 55min | 6/6 | No errors, no retries |

## Verdict Stability

All 3 runs across all 3 pipeline stages (onePager, pitchDeck, fullStory) returned WATCHLIST. Verdict is highly stable across stage variation. No contradictions observed.

However, no expected verdict has been set for LULU, so accuracy cannot be computed. Once an expected verdict (e.g. BUY, PASS, FAIL) is defined, historical accuracy can be back-filled across all three runs.

Notable: the pitchDeck stage completed only 10/11 sections, which may indicate a minor truncation or assembly issue. Despite this, the verdict aligned with the other two stages, suggesting the missing section did not materially affect the output.

Across the broader run context, LULU's WATCHLIST verdicts are consistent with the pattern seen in [[tickers/POOL]] (fullStory also WATCHLIST) and [[tickers/UBER]] (all stages WATCHLIST), suggesting a possible system-wide conservatism bias rather than a LULU-specific signal. More data — and an established expected verdict — are needed to distinguish between genuine WATCHLIST conviction and a model-level default tendency.

## Agent Performance

No agent-level data has been recorded for any LULU run to date. Agent-level recording was not enabled during runs 20260415-203246-LULU-onePager, 20260415-204131-LULU-pitchDeck, or 20260415-220013-LULU-fullStory. This limits the ability to attribute verdict outcomes or cost drivers to specific agents.

Once agent recording is enabled, the following agents are expected to appear in LULU runs and should be monitored: [[agents/business-analyst]], [[agents/financial-analyst]], [[agents/valuation-specialist]], [[agents/synthesis-writer]].

## DataPacket Notes

No data gaps (`dataGaps: []`) were recorded in any of the three LULU runs. No format violations or retries were observed in the onePager or fullStory stages. The pitchDeck stage completed 10/11 sections — the cause of the missing section has not been identified and warrants investigation in future runs.

## Control Variable Sensitivity

Insufficient data for formal sensitivity analysis. No prompt version changes, model swaps, or wave-order variations have been tested against LULU yet. The three runs represent a single pass through three pipeline stages (onePager → pitchDeck → fullStory) rather than controlled variation of any single variable.

Observations available so far:
- **Stage variation**: All three stages produced WATCHLIST — stage type does not appear to drive verdict divergence for LULU.
- **Cost variation**: onePager ($0.69) vs. pitchDeck/fullStory (~$7.40) reflects expected stage-level scope differences, not anomalous behavior.
- **Duration variation**: pitchDeck (58min) and fullStory (55min) are comparable; onePager (4min) is expected to be faster.

Formal sensitivity testing (e.g. model swap, prompt version change) is recommended once an expected verdict is established. See [[experiments/doe-log]] for any related experiments.