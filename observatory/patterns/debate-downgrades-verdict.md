---
type: pattern
pattern: debate-downgrades-verdict
lastUpdated: 2026-04-17T02:00:00Z
confidence: medium
runsSampled: 15
tags: [pattern, verdict, debate, full-story, conservatism]
---

## Observation

The full story adversarial debate framework systematically **downgrades** verdicts compared to the pitch deck stage. No ticker improved from pitch deck to full story; one (SFM) actively degraded from PASS to WATCHLIST.

| Ticker | Pitch Deck | Full Story | Direction |
|--------|-----------|-----------|-----------|
| LULU | WATCHLIST | WATCHLIST | flat |
| POOL | WATCHLIST | WATCHLIST | flat |
| UBER | WATCHLIST | WATCHLIST | flat |
| SFM | **PASS** | **WATCHLIST** | downgrade |
| NKE | WATCHLIST | WATCHLIST | flat |

## Evidence

SFM is the clearest case: one-pager PASS, pitch deck PASS (6+ sections PASS), then full story WATCHLIST after the adversarial debate. The bear case (risk-analyst) emphasized "event recovery timeline being 12-24 months" which overrode the strong business fundamentals.

The debate structure is: Bull → Bear → Rebuttal → Judge → Compose. The bear agent is explicitly told to "demolish the bull case." If the judge finds any "Strong Bear" exchanges, the compose step tends toward WATCHLIST regardless of how many sections PASS'd at pitch deck.

## Hypothesis

The debate framework has a structural asymmetry: the bear agent has a **mandate** to demolish (explicit in prompt), while the bull agent merely summarizes existing evidence. The judge then treats any unresolved bear point as a reason for caution. This creates a ratchet — verdicts can only stay flat or downgrade, never upgrade through debate.

## Recommended Action

- Consider whether the debate framework should be able to **upgrade** a verdict (e.g., if the rebuttal successfully addresses all bear points, the judge could strengthen confidence)
- Review the judge's scoring criteria — "Strong Bear" should require evidence the bull couldn't counter, not just the existence of a bearish argument
- SFM is the test case: run it with modified debate rules and see if PASS survives to full story
