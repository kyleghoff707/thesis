---
type: pattern
pattern: verdict-accuracy
lastUpdated: 2026-04-20T03:32:06.081Z
confidence: high
runsSampled: 58
tags: [pattern, verdict, accuracy]
---

## Observation

Overall verdict accuracy: **0%** (0/42 runs matched expected verdict).

Total runs analyzed: 58

## Per-Ticker Breakdown

| Ticker | Runs | Expected | Actual Verdicts | Accuracy |
|--------|------|----------|----------------|----------|
| [[tickers/LULU]] | 15 | BUY | WATCHLIST | 0/15 |
| [[tickers/POOL]] | 15 | BUY | PASS, WATCHLIST | 0/15 |
| [[tickers/UBER]] | 6 | BUY | WATCHLIST | 0/6 |
| [[tickers/NKE]] | 3 | BUY | WATCHLIST | 0/3 |
| [[tickers/SFM]] | 12 | BUY | PASS, WATCHLIST | 0/12 |
| [[tickers/TSCO]] | 1 | - | WATCHLIST | no expected |
| [[tickers/INTU]] | 3 | - | PASS, WATCHLIST | no expected |
| [[tickers/NOW]] | 3 | - | PASS, WATCHLIST | no expected |

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
- 20260416-194150-POOL-onePager: WATCHLIST vs BUY → MISMATCH
- 20260416-194200-SFM-onePager: PASS vs BUY → MISMATCH
- 20260416-194202-LULU-onePager: WATCHLIST vs BUY → MISMATCH
- 20260416-194956-POOL-pitchDeck: WATCHLIST vs BUY → MISMATCH
- 20260416-195002-SFM-pitchDeck: WATCHLIST vs BUY → MISMATCH
- 20260416-195056-LULU-pitchDeck: WATCHLIST vs BUY → MISMATCH
- 20260416-205941-SFM-fullStory: WATCHLIST vs BUY → MISMATCH
- 20260416-210309-LULU-fullStory: WATCHLIST vs BUY → MISMATCH
- 20260416-210339-POOL-fullStory: WATCHLIST vs BUY → MISMATCH
- 20260417-071237-TSCO-onePager: WATCHLIST vs none → no expected
- 20260417-081604-LULU-onePager: WATCHLIST vs BUY → MISMATCH
- 20260417-082354-LULU-pitchDeck: WATCHLIST vs BUY → MISMATCH
- 20260417-174638-SFM-onePager: PASS vs BUY → MISMATCH
- 20260417-175335-LULU-fullStory: WATCHLIST vs BUY → MISMATCH
- 20260417-175437-SFM-pitchDeck: WATCHLIST vs BUY → MISMATCH
- 20260417-182604-POOL-onePager: WATCHLIST vs BUY → MISMATCH
- 20260417-183135-POOL-pitchDeck: WATCHLIST vs BUY → MISMATCH
- 20260417-185013-SFM-fullStory: WATCHLIST vs BUY → MISMATCH
- 20260417-192126-POOL-fullStory: WATCHLIST vs BUY → MISMATCH
- 20260417-234446-LULU-onePager: WATCHLIST vs BUY → MISMATCH
- 20260417-234502-POOL-onePager: WATCHLIST vs BUY → MISMATCH
- 20260417-234502-SFM-onePager: PASS vs BUY → MISMATCH
- 20260417-235256-POOL-pitchDeck: WATCHLIST vs BUY → MISMATCH
- 20260417-235603-SFM-pitchDeck: WATCHLIST vs BUY → MISMATCH
- 20260417-235824-LULU-pitchDeck: WATCHLIST vs BUY → MISMATCH
- 20260418-004838-POOL-fullStory: WATCHLIST vs BUY → MISMATCH
- 20260418-005535-SFM-fullStory: WATCHLIST vs BUY → MISMATCH
- 20260418-005858-LULU-fullStory: WATCHLIST vs BUY → MISMATCH
- 20260419-181825-INTU-onePager: PASS vs none → no expected
- 20260419-182010-NOW-onePager: PASS vs none → no expected
- 20260419-182914-INTU-pitchDeck: WATCHLIST vs none → no expected
- 20260419-183000-NOW-pitchDeck: WATCHLIST vs none → no expected
- 20260419-194111-NOW-fullStory: WATCHLIST vs none → no expected
- 20260419-195624-INTU-fullStory: WATCHLIST vs none → no expected

## Hypothesis

Agents are systematically conservative — producing WATCHLIST when BUY is expected. This is a known conservatism bias pattern.

## Recommended Action

- Investigate prompt conservatism: agents may over-weight risks vs growth signals
- Compare section-level verdicts to identify which agents drive WATCHLIST
- Consider adjusting valuation thresholds or risk weighting
