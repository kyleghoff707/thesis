---
type: pattern
pattern: verdict-accuracy
lastUpdated: 2026-04-17T02:02:12.554Z
confidence: high
runsSampled: 24
tags: [pattern, verdict, accuracy]
---

## Observation

Overall verdict accuracy: **0%** (0/15 runs matched expected verdict).

Total runs analyzed: 24

## Per-Ticker Breakdown

| Ticker | Runs | Expected | Actual Verdicts | Accuracy |
|--------|------|----------|----------------|----------|
| [[tickers/LULU]] | 6 | BUY | WATCHLIST | 0/6 |
| [[tickers/POOL]] | 6 | BUY | PASS, WATCHLIST | 0/6 |
| [[tickers/UBER]] | 6 | BUY | WATCHLIST | 0/6 |
| [[tickers/NKE]] | 3 | BUY | WATCHLIST | 0/3 |
| [[tickers/SFM]] | 3 | BUY | PASS, WATCHLIST | 0/3 |

## Evidence

- 20260415-203246-LULU-onePager: WATCHLIST vs none → no expected
- 20260415-204131-LULU-pitchDeck: WATCHLIST vs none → no expected
- 20260415-204150-POOL-onePager: PASS vs none → no expected
- 20260415-204842-POOL-pitchDeck: WATCHLIST vs none → no expected
- 20260415-204928-UBER-onePager: WATCHLIST vs none → no expected
- 20260415-205824-UBER-pitchDeck: WATCHLIST vs none → no expected
- 20260415-213506-UBER-fullStory: WATCHLIST vs none → no expected
- 20260415-220013-LULU-fullStory: WATCHLIST vs none → no expected
- 20260415-221815-POOL-fullStory: WATCHLIST vs none → no expected
- 20260416-073647-POOL-onePager: WATCHLIST vs BUY → MISMATCH
- 20260416-073658-LULU-onePager: WATCHLIST vs BUY → MISMATCH
- 20260416-073658-UBER-onePager: WATCHLIST vs BUY → MISMATCH
- 20260416-073716-NKE-onePager: WATCHLIST vs BUY → MISMATCH
- 20260416-073723-SFM-onePager: PASS vs BUY → MISMATCH
- 20260416-074337-NKE-pitchDeck: WATCHLIST vs BUY → MISMATCH
- 20260416-074526-UBER-pitchDeck: WATCHLIST vs BUY → MISMATCH
- 20260416-074532-POOL-pitchDeck: WATCHLIST vs BUY → MISMATCH
- 20260416-074720-SFM-pitchDeck: WATCHLIST vs BUY → MISMATCH
- 20260416-074734-LULU-pitchDeck: WATCHLIST vs BUY → MISMATCH
- 20260416-083203-POOL-fullStory: WATCHLIST vs BUY → MISMATCH
- 20260416-083535-UBER-fullStory: WATCHLIST vs BUY → MISMATCH
- 20260416-084749-NKE-fullStory: WATCHLIST vs BUY → MISMATCH
- 20260416-112225-SFM-fullStory: WATCHLIST vs BUY → MISMATCH
- 20260416-115440-LULU-fullStory: WATCHLIST vs BUY → MISMATCH

## Hypothesis

Agents are systematically conservative — producing WATCHLIST when BUY is expected. This is a known conservatism bias pattern.

## Recommended Action

- Investigate prompt conservatism: agents may over-weight risks vs growth signals
- Compare section-level verdicts to identify which agents drive WATCHLIST
- Consider adjusting valuation thresholds or risk weighting
