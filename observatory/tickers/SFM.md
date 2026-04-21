---
type: ticker-page
ticker: SFM
companyName: SFM
lastUpdated: 2026-04-18T08:25:32.782Z
runCount: 12
expectedVerdict: BUY
verdictHistory: [PASS, WATCHLIST, WATCHLIST, PASS, WATCHLIST, WATCHLIST, PASS, WATCHLIST, WATCHLIST, PASS, WATCHLIST, WATCHLIST]
verdictAccuracy: 0.00
tags: [ticker, SFM]
---

## Run History

| Run ID | Stage | Verdict | Expected | Match | Cost | Duration | Sections |
|--------|-------|---------|----------|-------|------|----------|----------|
| 20260416-073723-SFM-onePager | onePager | PASS | BUY | MISMATCH | $0.91 | 5min | 6/6 |
| 20260416-074720-SFM-pitchDeck | pitchDeck | WATCHLIST | BUY | MISMATCH | $6.24 | 70min | 10/11 |
| 20260416-112225-SFM-fullStory | fullStory | WATCHLIST | BUY | MISMATCH | $3.90 | 100min | 6/6 |
| 20260416-194200-SFM-onePager | onePager | PASS | BUY | MISMATCH | $1.15 | 3min | 6/6 |
| 20260416-195002-SFM-pitchDeck | pitchDeck | WATCHLIST | BUY | MISMATCH | $10.92 | 50min | 10/11 |
| 20260416-205941-SFM-fullStory | fullStory | WATCHLIST | BUY | MISMATCH | $7.02 | 58min | 6/6 |
| 20260417-174638-SFM-onePager | onePager | PASS | BUY | MISMATCH | $0.74 | 6min | 6/6 |
| 20260417-175437-SFM-pitchDeck | pitchDeck | WATCHLIST | BUY | MISMATCH | $12.07 | 44min | 11/11 |
| 20260417-185013-SFM-fullStory | fullStory | WATCHLIST | BUY | MISMATCH | $7.98 | 31min | 6/6 |
| 20260417-234502-SFM-onePager | onePager | PASS | BUY | MISMATCH | $0.72 | 5min | 6/6 |
| 20260417-235603-SFM-pitchDeck | pitchDeck | WATCHLIST | BUY | MISMATCH | $14.67 | 58min | 11/11 |
| 20260418-005535-SFM-fullStory | fullStory | WATCHLIST | BUY | MISMATCH | $7.46 | 42min | 6/6 |

## Verdict Stability

Verdicts vary: PASS, WATCHLIST. 4/12 returned PASS.

## Agent Performance

| Agent | Runs | Avg Duration |
|-------|------|--------------|
| [[agents/one-pager]] | 4 | 281s |
| [[agents/annual-reader-fy2021]] | 2 | 276s |
| [[agents/annual-reader-fy2022]] | 2 | 276s |
| [[agents/annual-reader-fy2023]] | 2 | 315s |
| [[agents/annual-reader-fy2024]] | 2 | 249s |
| [[agents/annual-reader-fy2025]] | 2 | 347s |
| [[agents/quarterly-reader]] | 3 | 517s |
| [[agents/business-analyst]] | 8 | 1023s |
| [[agents/competitor-market-position]] | 4 | 461s |
| [[agents/competitor-moats]] | 4 | 540s |
| [[agents/financial-analyst]] | 5 | 367s |
| [[agents/management-evaluator]] | 8 | 702s |
| [[agents/risk-analyst]] | 9 | 437s |
| [[agents/valuation-specialist]] | 8 | 1134s |
| [[agents/synthesis-writer]] | 6 | 380s |
| [[agents/competitor-evaluator]] | 4 | 457s |
| [[agents/financial-analyst-judge]] | 3 | 109s |
| [[agents/risk-analyst-bear]] | 3 | 1733s |
| [[agents/synthesis-writer-bull]] | 3 | 122s |
| [[agents/synthesis-writer-compose]] | 3 | 185s |
| [[agents/synthesis-writer-rebuttal]] | 3 | 154s |
| [[agents/annual-reader]] | 1 | 540s |

## DataPacket Notes

- Judge Step 4: summary.unresolvedCount=3 but exchanges array contains 4 Unresolved verdicts (2 Strong Bull + 1 Strong Bear + 4 Unresolved = 7); internal math error in agent output; orchestrator did not correct, left inconsistency in saved file
- Orchestrator skipped Pre-Finalize Event Sweep step for Full Story run; Phase 1 and Phase 2 format violations were silently cleaned during JSON extraction and not logged; this backfill event reconstructs them retrospectively from subagent transcripts

## Control Variable Sensitivity

_Insufficient data for sensitivity analysis (need multiple runs with different configurations)._
