---
type: pattern
pattern: verdict-accuracy
lastUpdated: 2026-04-14T23:02:29Z
confidence: low
runsSampled: 1
tags: [pattern, verdict, accuracy]
---

# Verdict Accuracy

## Observation

Verdict accuracy measures how often the pipeline's final verdict matches the expected (pre-labeled) verdict for a given ticker. A high match rate suggests the pipeline's analytical logic is well-calibrated against known investment theses; a low match rate may indicate systematic bias, prompt misconfiguration, or genuine disagreement between the model and the expected baseline.

As of this writing, only one run has been recorded — `20260414-230229-COST-onePager` — and that run carries no expected verdict, making accuracy computation impossible at this stage. This page will be updated as more runs accumulate with defined expected verdicts.

## Evidence

| Run ID | Ticker | Stage | Verdict | Expected | Match |
|---|---|---|---|---|---|
| 20260414-230229-COST-onePager | [[tickers/COST]] | onePager | WATCHLIST | N/A | N/A |

- **Runs sampled:** 1
- **Runs with a defined expected verdict:** 0
- **Accuracy (computable runs only):** N/A — insufficient data
- **Overall accuracy (all runs):** N/A

No verdict mismatch or match can be declared for `20260414-230229-COST-onePager` because `expectedVerdict` is null (run 20260414-230229-COST-onePager). Accuracy tracking will begin in earnest once at least one run with a known expected verdict is logged.

## Hypothesis

Several factors are expected to drive verdict accuracy once measurable data exists:

1. **Stage completeness** — onePager runs cover only a subset of analytical sections (6 sections in the current run vs. a full all-stages run). Verdicts from partial-stage runs may differ systematically from full-pipeline verdicts, introducing stage-driven variance independent of model quality.
2. **Model and prompt version sensitivity** — Changes to agent prompts (see [[prompt-versions/changelog]]) or model selection may shift verdict distributions. Until a stable baseline is established, accuracy benchmarks may be confounded by configuration changes.
3. **Ticker-specific difficulty** — Some tickers may be genuinely ambiguous (e.g., warranting WATCHLIST rather than a clean BUY/SELL), making accuracy a noisy signal even with a well-calibrated pipeline.
4. **Expected verdict provenance** — If expected verdicts are sourced from a single analyst or a specific date's consensus, they may themselves carry staleness or bias, capping achievable accuracy below 100% even for a perfect model.

## Recommended Action

- **Establish expected verdicts for queued tickers** before running additional pipeline stages, so accuracy can be tracked from the first full run onward.
- **Separate onePager accuracy from all-stages accuracy** in future analyses; partial-stage runs should not be pooled with full-pipeline runs when computing a single accuracy figure.
- **Log at least 5 runs with known expected verdicts** before drawing any conclusions about systematic bias. Current confidence is `low` and will remain so until that threshold is met.
- **Cross-reference [[failure-modes/]]** pages once failures accumulate, to determine whether verdict errors correlate with specific failure modes (e.g., truncation or format violations causing a downstream WATCHLIST hedge).
- Monitor [[tickers/COST]] for expected verdict assignment and subsequent run results as the primary near-term data point for this pattern.