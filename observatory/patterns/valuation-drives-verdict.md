---
type: pattern
pattern: valuation-drives-verdict
lastUpdated: 2026-04-17T02:00:00Z
confidence: high
runsSampled: 24
tags: [pattern, verdict, valuation, methodology]
---

## Observation

Agents correctly identify business quality — business fundamentals sections (radar, simple_predictable, market_position, barriers_moats, management, balance_sheet) frequently PASS. But the **overall verdict follows valuation**, not quality.

POOL Sprint 2 pitch deck: 7/10 sections PASS (radar, simple_predictable, market_position, barriers_moats, management, roe_roic_debt, balance_sheet). Overall verdict: WATCHLIST — driven by FCF, PEST, and valuation sections.

SFM Sprint 2: PASS at one-pager and pitch deck (6+ sections PASS), but WATCHLIST at full story after the adversarial debate where the bear case emphasized event recovery timeline.

## Evidence

- POOL 20260416-074532: 7 PASS, 3 WATCHLIST → overall WATCHLIST
- SFM 20260416-074720: pitch deck PASS → full story WATCHLIST
- LULU 20260416-074734: pitch deck WATCHLIST (radar, market_position, barriers_moats all WATCHLIST)
- NKE 20260416-074337: market_position PASS, fcf PASS, roe_roic_debt PASS, but overall WATCHLIST

## Hypothesis

This is actually **correct Rule One behavior**. A great company at the wrong price is a WATCHLIST, not a BUY. The agents are doing their job — the question is whether their calculated buy prices are reasonable, not whether the verdicts are wrong.

The real calibration question is: do the agents' FGR derivations and valuation calculations produce buy prices close to the user's targets? If the agents calculate a buy price of $160 for LULU and it's trading at $163, WATCHLIST is the right call — and the user's price-conditional model (10% margin) would count that as acceptable.

## Recommended Action

- Implement price-conditional verdict matching in the observatory (buyBelow + margin from known-verdicts.json)
- Focus methodology experiments on FGR derivation accuracy, not verdict labels
- Compare agent-calculated buy prices to user's buy targets — that's the real accuracy metric
