---
type: pattern
pattern: verdict-accuracy
lastUpdated: 2026-04-16T14:17:43.519Z
confidence: low
runsSampled: 9
tags: [pattern, verdict, accuracy]
---

## Observation

Overall verdict accuracy: **N/A (no expected verdicts configured)** (0/0 runs matched expected verdict).

Total runs analyzed: 9

## Per-Ticker Breakdown

| Ticker | Runs | Expected | Actual Verdicts | Accuracy |
|--------|------|----------|----------------|----------|
| [[tickers/LULU]] | 3 | - | WATCHLIST | no expected |
| [[tickers/POOL]] | 3 | - | PASS, WATCHLIST | no expected |
| [[tickers/UBER]] | 3 | - | WATCHLIST | no expected |

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

## Hypothesis

No expected verdicts configured yet. Populate `observatory/known-verdicts.json` to enable calibration.

## Recommended Action

- Continue accumulating runs to build statistical confidence
- Populate known-verdicts.json with more tickers
