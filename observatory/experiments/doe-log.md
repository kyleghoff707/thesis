---
type: doe-log
lastUpdated: 2026-04-16T14:30:00Z
experimentCount: 1
tags: [experiments, doe]
---

# Experiment Log

> Formal Design of Experiments (DOE) tracking. Each experiment changes one control variable and measures the effect on output variables.

---

## EXP-001: All-Sonnet Model Assignment
- **Hypothesis:** Opus on risk-analyst and valuation-specialist biases verdicts toward conservatism (WATCHLIST over BUY). Switching to all-Sonnet will produce less conservative verdicts without sacrificing analysis quality.
- **Control:** Sprint 1 configuration — quarterly-reader (opus), risk-analyst (opus), valuation-specialist (opus) in pitch deck; risk-analyst (opus) in full story. All others sonnet.
- **Treatment:** All agents use sonnet across all 3 stages. Zero opus assignments.
- **Metric:** Verdict distribution (BUY/WATCHLIST/FAIL), FGR ranges, buy price calculations, section-level verdicts on risk/valuation sections specifically. Also: cost per run (sonnet is cheaper than opus).
- **Control runs:** Sprint 1 — 20260415-* (LULU, POOL, UBER — 9 runs total, all mixed opus/sonnet)
- **Treatment runs:** Sprint 2 — pending (will use same tickers for direct comparison)
- **Result:** _Pending — awaiting Sprint 2 runs_
- **Decision:** _Pending_

### Rationale
Sprint 1 produced 8/9 WATCHLIST verdicts. Price-conditional analysis shows LULU was within margin ($162.74 vs $160 target) and POOL was correctly above target ($218 vs $180). The question is whether opus on risk-analyst (explicitly told to "demolish the bull case") and valuation-specialist produces systematically lower FGRs and buy prices than sonnet would. If sonnet produces similar FGRs, the conservatism is in the prompts, not the model. If sonnet produces higher FGRs, the model choice was a contributing factor.

### Variables Changed
| Skill | Agent | Sprint 1 | Sprint 2 |
|-------|-------|----------|----------|
| Pitch Deck | quarterly-reader | opus | **sonnet** |
| Pitch Deck | risk-analyst | opus | **sonnet** |
| Pitch Deck | valuation-specialist | opus | **sonnet** |
| Full Story | risk-analyst | opus | **sonnet** |
| Full Story | risk-analyst (bear debate) | opus | **sonnet** |

### Confounding Variables (also changed between Sprint 1 and Sprint 2)
- Parallel dispatch fix (sequential → parallel) — affects wall time, not verdicts
- Observatory recording added — non-blocking, should not affect verdicts
- Known verdicts populated — affects calibration scoring but not agent behavior
- Price-conditional calibration model — affects how we score verdicts, not what agents produce
