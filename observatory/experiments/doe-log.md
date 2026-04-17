---
type: doe-log
lastUpdated: 2026-04-17T03:00:00Z
experimentCount: 2
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
- **Treatment runs:** Sprint 2 — 20260416-* (LULU, POOL, UBER, SFM, NKE — 15 runs, all sonnet)
- **Result:** No effect. Sprint 1: 8/9 WATCHLIST (89%). Sprint 2: 14/15 WATCHLIST (93%). Verdict distribution unchanged. Conservatism persists across both models.
- **Decision:** REJECT hypothesis. Model choice (opus vs sonnet) is not the driver. The conservatism is in the **prompts**, not the model. Future experiments should target prompt wording, verdict thresholds, and risk-agent weighting.

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

---

## EXP-002: FGR Conservatism Rebalancing
- **Hypothesis:** Layered conservatism language across 6 agent prompts compounds to produce systematically low FGR estimates. Removing explicit conservatism mandates and reframing the risk analyst's FGR role from "attack" to "stress test" will produce higher, more accurate FGR ranges — leading to higher buy prices and more BUY verdicts on known-BUY companies.
- **Control:** Sprint 2 configuration — "Conservative bias is non-negotiable" in valuation specialists, "FGR Attack Methodology" in risk analysts, "Optimism is the enemy of good investing" appearing 5x across prompts
- **Treatment:** Evidence-based framing. Specific changes:
  - Valuation specialist (PD+FS): "Conservative bias is non-negotiable" → "Evidence-based analysis is non-negotiable"
  - Risk analyst (PD+FS): "FGR Attack Methodology" → "FGR Stress Test" — assess both directions (too high AND too low)
  - All 6 affected agents: "Optimism is the enemy" (5 instances) → "The goal is accuracy, not conservatism"
  - Financial analyst (FS): "FGR must be achievable every year" → "achievable on average over 10 years"
  - Synthesis writers (PD+FS): "Always prefer conservative growth estimates" → "Prefer realistic, evidence-based growth estimates"
- **Metric:** FGR ranges (expecting higher low-end and midpoint), buy price calculations, verdict distribution. LULU Sprint 2 FGR was 6-10% (avg 8%) from 19.9% historical — expecting closer to 10-14%.
- **Control runs:** Sprint 2 — 20260416-* (all 15 runs)
- **Treatment runs:** Sprint 3 — pending
- **Result:** _Pending — awaiting Sprint 3 runs_
- **Decision:** _Pending_

### Key Insight from Sprint 2
The conservatism was layered — every agent applied its own discount:
1. Valuation specialist haircuts historical rates by 50%+ ("when in doubt, round down")
2. Risk analyst attacks the already-conservative FGR ("construct counter-arguments for each input")
3. Synthesis writer defaults to WATCHLIST under any uncertainty
4. The debate bear demolishes what's left

A 19.9% historical composite becoming an 8% FGR is a 60% haircut. Even a single layer of conservatism (say, 30% discount to 14%) would be defensible — but three layers compound to produce unrealistically low estimates.
