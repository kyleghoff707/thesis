---
type: pattern
pattern: bear-bull-asymmetry
lastUpdated: 2026-04-18T18:00:00Z
confidence: high
runsSampled: 18
status: mitigated
tags: [pattern, debate, bear, bull, methodology, mitigated]
---

## Observation

The adversarial debate framework is structurally asymmetric — the bear agent consistently dominates the bull agent. Every company has reasons not to buy; the skill is discerning which problems are trivial and which are real. Currently the agents lack this discernment.

**Asymmetries in the current design:**
- Bear agent prompt: "demolish the bull case or fail trying" — explicit mandate to be maximally adversarial
- Bear agent: has web search (can find short-seller theses, negative analyst coverage, bad news)
- Bull agent: NO web search, merely summarizes existing section findings
- Judge: treats any "Strong Bear" exchange as reason for caution, creating a downward ratchet

**Evidence:** SFM went from PASS (one-pager + pitch deck, 6+ sections PASS) to WATCHLIST after the adversarial debate. The bear case emphasized "event recovery timeline 12-24 months" which overrode strong business fundamentals.

## Hypothesis

In practice, every company has one or more compelling bear arguments. Warren Buffett's edge was the intuition to discern which problems were trivial vs. thesis-killing. The current debate framework treats all bear points with equal weight — there's no mechanism for the judge to say "yes that's a real risk but it doesn't matter at this price" or "that bear point is true but already priced in."

## Potential Experiments (not yet started)

- **EXP-TBD-A:** Soften the bear mandate — change "demolish the bull case" to "pressure-test the bull case with evidence" (less adversarial, more analytical)
- **EXP-TBD-B:** Give the bull agent web search too — let it find positive catalysts, insider buying, guru activity
- **EXP-TBD-C:** Add a "materiality filter" to the judge prompt — require the judge to classify each bear point as "thesis-killing," "material but manageable," or "noise/already priced in"
- **EXP-TBD-D:** Weight the debate outcome by pitch deck section verdicts — if 7/10 sections PASS, the bar for the bear to override should be higher

## Status

**MITIGATED — Sprint 4 EXP-003 worked.** Judge directional histograms shifted Bull-leaning across all 3 Sprint 4 fullStory tickers:
- POOL: 2 Strong Bull / 1 Strong Bear / 4 Unresolved → "Bull direction with monitoring"
- SFM:  2 Strong Bull / 1 Strong Bear / 3 Unresolved → "Investable at $45-65"
- LULU: 4 Strong Bull / 2 Strong Bear / 5 Unresolved → "Mixed"

Sprint 3 baseline (pre-EXP-003) was bear-dominant with structural strength asymmetry. Materiality filter visibly working — judges now classify each bear point on severity × novelty axes and disqualify from triggering overall Bear when already-priced-in. Symmetric rebuttal honesty mandate enforced.

Verdict outcomes still WATCHLIST under strict equality — but residual gap is **price-conditional** (agents' calculated buy prices below current price), not debate-framework conservatism. See [[patterns/valuation-drives-verdict]].

**EXP-TBD-D (weight debate by section verdicts) — REJECTED.** Unnecessary: EXP-003 alone resolved the asymmetry. PM directive: methodology is locked in; no further debate-framework experiments planned.

**Sprint 4 risk that materialized:** giving Bull web search produced 5 Bull factual errors across LULU + POOL (over-claimed guru ownership as conviction, unsupported forward-math, content-aggregator citations). Sprint 5-prep prompt edits added Bull source-quality gate + Rule One Operating Rule #2 reminder to mitigate. Monitor in Sprint 5.
