---
type: pattern
pattern: wonderful-company-premium
lastUpdated: 2026-04-17T02:30:00Z
confidence: medium
runsSampled: 15
tags: [pattern, valuation, methodology, rule-one, future-experiment]
---

## Observation

The agents evaluate business quality and valuation independently, then combine them. But they're missing a core Rule One concept: **wonderful companies deserve a thinner margin of safety.**

POOL Sprint 2 pitch deck: 7/10 sections PASS (radar, simple_predictable, market_position, barriers_moats, management, roe_roic_debt, balance_sheet). This is a demonstrably wonderful company. But the agents apply the same 50% MOS discount as they would for a mediocre company — the quality score doesn't flow into valuation.

## Hypothesis

In practice, Rule One investors (and Buffett himself) accept paying closer to fair value for truly wonderful businesses with wide moats and proven management. The 50% MOS is a starting point for unknown or uncertain companies, not a rigid rule for blue-chip compounders.

The synthesis writer currently has no mechanism to say: "This company scored PASS on 7/10 dimensions — I'm comfortable with a 30% MOS instead of 50%." If it could, buy prices would rise and more companies would cross the threshold from WATCHLIST to BUY.

**Example math (POOL):**
- Current: MOS buy price at 50% discount = ~$120 (well below $218 trading price → WATCHLIST)
- With 30% MOS for wonderful company: ~$168 (still below $218 but closer to the user's $180 target)
- With 25% MOS: ~$180 (matches the user's target exactly)

## Potential Experiments (not yet started)

- **EXP-TBD-E:** Add a "quality-adjusted MOS" to the valuation specialist prompt — if the company scores PASS on 6+ of the first 8 sections, use 25-35% MOS instead of 50%
- **EXP-TBD-F:** Add a "wonderful company" classification to the synthesis writer — if it determines the company is truly wonderful (moat + management + financials all PASS), explicitly note that a thinner MOS is appropriate and adjust the verdict threshold
- **EXP-TBD-G:** Make the MOS percentage a slider in known-verdicts.json per ticker — let the user specify their acceptable MOS for each company based on their conviction level

## Status

PARKED — monitoring for now. Will revisit after FGR conservatism experiments (higher leverage). See [[patterns/valuation-drives-verdict]] and [[experiments/doe-log]].
