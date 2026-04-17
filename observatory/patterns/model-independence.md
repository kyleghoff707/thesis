---
type: pattern
pattern: model-independence
lastUpdated: 2026-04-17T02:00:00Z
confidence: high
runsSampled: 24
tags: [pattern, model, opus, sonnet, EXP-001]
---

## Observation

Switching from mixed Opus/Sonnet to all-Sonnet had **zero measurable effect** on verdict distribution.

- Sprint 1 (mixed opus/sonnet): 8/9 WATCHLIST (89%)
- Sprint 2 (all sonnet): 14/15 WATCHLIST (93%)

The conservatism is **prompt-driven, not model-driven**. Both Opus and Sonnet produce the same verdict pattern when given the same prompts.

## Evidence

EXP-001 in [[experiments/doe-log]]. 9 control runs (Sprint 1) vs 15 treatment runs (Sprint 2). Same tickers (LULU, POOL, UBER) plus 2 new (SFM, NKE). Verdict distribution statistically identical.

## Hypothesis

The agent prompts contain structural conservatism — risk-analyst told to "demolish the bull case," synthesis writer weighing PEST risks, valuation methods producing buy prices below current market. These are prompt-level decisions, not model-level tendencies. Opus and Sonnet interpret the same instructions the same way.

## Recommended Action

- Future methodology experiments should target **prompt wording**, not model assignments
- Specific targets: risk-analyst bearish mandate, synthesis writer verdict weighting, valuation FGR derivation guardrails
- Model can be chosen for cost/speed — Sonnet is cheaper with identical output quality for this use case
