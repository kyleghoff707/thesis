---
type: pattern
pattern: bear-bull-asymmetry
lastUpdated: 2026-04-17T02:30:00Z
confidence: medium
runsSampled: 15
tags: [pattern, debate, bear, bull, methodology, future-experiment]
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

PARKED — monitoring for now. Will revisit after FGR conservatism experiments (higher leverage). See [[patterns/valuation-drives-verdict]] and [[experiments/doe-log]].
