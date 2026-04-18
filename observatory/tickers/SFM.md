---
type: ticker-page
ticker: SFM
companyName: SFM
lastUpdated: 2026-04-18T05:34:57.929Z
runCount: 9
expectedVerdict: BUY
verdictHistory: [PASS, WATCHLIST, WATCHLIST, PASS, WATCHLIST, WATCHLIST, PASS, WATCHLIST, WATCHLIST]
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

## Verdict Stability

Verdicts vary: PASS, WATCHLIST. 3/9 returned PASS.

## Agent Performance

| Agent | Runs | Avg Duration |
|-------|------|--------------|
| [[agents/one-pager]] | 3 | 278s |
| [[agents/annual-reader-fy2021]] | 1 | 272s |
| [[agents/annual-reader-fy2022]] | 1 | 259s |
| [[agents/annual-reader-fy2023]] | 1 | 278s |
| [[agents/annual-reader-fy2024]] | 1 | 225s |
| [[agents/annual-reader-fy2025]] | 1 | 346s |
| [[agents/quarterly-reader]] | 2 | 472s |
| [[agents/business-analyst]] | 6 | 1253s |
| [[agents/competitor-market-position]] | 3 | 508s |
| [[agents/competitor-moats]] | 3 | 508s |
| [[agents/financial-analyst]] | 4 | 356s |
| [[agents/management-evaluator]] | 6 | 829s |
| [[agents/risk-analyst]] | 7 | 442s |
| [[agents/valuation-specialist]] | 6 | 1391s |
| [[agents/synthesis-writer]] | 5 | 411s |
| [[agents/competitor-evaluator]] | 3 | 474s |
| [[agents/financial-analyst-judge]] | 2 | 78s |
| [[agents/risk-analyst-bear]] | 2 | 2456s |
| [[agents/synthesis-writer-bull]] | 2 | 67s |
| [[agents/synthesis-writer-compose]] | 2 | 170s |
| [[agents/synthesis-writer-rebuttal]] | 2 | 92s |
| [[agents/annual-reader]] | 1 | 540s |

## DataPacket Notes

- Judge Step 4: summary.unresolvedCount=3 but exchanges array contains 4 Unresolved verdicts (2 Strong Bull + 1 Strong Bear + 4 Unresolved = 7); internal math error in agent output; orchestrator did not correct, left inconsistency in saved file
- Orchestrator skipped Pre-Finalize Event Sweep step for Full Story run; Phase 1 and Phase 2 format violations were silently cleaned during JSON extraction and not logged; this backfill event reconstructs them retrospectively from subagent transcripts

## Control Variable Sensitivity

_Insufficient data for sensitivity analysis (need multiple runs with different configurations)._
