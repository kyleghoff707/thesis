---
type: prompt-changelog
lastUpdated: 2026-04-17T03:00:00Z
tags: [prompts, changelog]
---

# Prompt Version Changelog

> Reverse chronological record of all agent prompt changes with measured impact.

---

## 2026-04-17 — 6 agents: FGR conservatism rebalancing (EXP-002) — Sprint 3

- **Change**: Removed layered conservatism language across valuation-specialist, risk-analyst, synthesis-writer, and financial-analyst prompts. Reframed risk analyst FGR role from "attack" to "stress test."
- **Agents affected**: valuation-specialist (PD+FS), risk-analyst (PD+FS), synthesis-writer (PD+FS), financial-analyst (FS)
- **Key rewrites**:
  - "Conservative bias is non-negotiable" → "Evidence-based analysis is non-negotiable"
  - "FGR Attack Methodology" → "FGR Stress Test" (assess both directions)
  - "Optimism is the enemy of good investing" (5x) → "The goal is accuracy, not conservatism"
  - "Always prefer conservative growth estimates" → "Prefer realistic, evidence-based growth estimates"
  - "FGR must be achievable every year" → "achievable on average over 10 years"
- **Motivation**: Sprint 2 showed LULU 19.9% historical composite → 8% FGR (60% haircut). Three layers of conservatism compounded: valuation specialist haircuts, risk analyst attacks the result, synthesis writer defaults to WATCHLIST. See [[experiments/doe-log]] EXP-002 and [[patterns/valuation-drives-verdict]].
- **Before runs**: Sprint 2 — 20260416-* (15 runs, 0% verdict accuracy, FGR systematically low)
- **After runs**: Sprint 3 — pending
- **Impact**: _Pending — expecting FGR ranges to rise (LULU: 6-10% → ~10-14%)_
- **Sprint 3 goal**: Reduce conservatism-bias

## 2026-04-17 — All skills: mandatory observatory + full-fidelity saving

- **Change**: Replaced all "non-blocking" observatory language with "REQUIRED" + retry-once. Added CRITICAL RULE for full-fidelity output saving (no stubs, minimum file size thresholds).
- **Motivation**: Sprint 2 orchestrators skipped observatory recording (0/5 pitch deck, 0/5 full story) and saved stub section files (4/5 full stories truncated). Claude treats "non-blocking" as "optional" under context pressure.
- **Before runs**: Sprint 2 — empty agent records, truncated outputs
- **After runs**: Sprint 3 — pending
- **Impact**: _Pending — mechanical fix, should not affect verdicts_

## 2026-04-16 — All agents: model assignment change (EXP-001) — Sprint 2

- **Change**: Switched all agents from mixed opus/sonnet to all-sonnet
- **Agents affected**: quarterly-reader (PD), risk-analyst (PD+FS), valuation-specialist (PD)
- **Motivation**: Sprint 1 produced 8/9 WATCHLIST verdicts. Hypothesis: opus on risk-analyst and valuation-specialist produces systematically conservative FGRs.
- **Before runs**: Sprint 1 — 20260415-* (LULU, POOL, UBER — 9 runs, mixed opus/sonnet)
- **After runs**: Sprint 2 — 20260416-* (15 runs, all sonnet)
- **Impact**: **No effect.** Sprint 1: 89% WATCHLIST. Sprint 2: 93% WATCHLIST. Model is not the driver. EXP-001 REJECTED. See [[patterns/model-independence]].

## 2026-04-16 — All skills: parallel dispatch fix — Sprint 2

- **Change**: Renamed pitch deck Wave 1-3 headers from "Dispatch Agents Sequentially" to "PARALLEL DISPATCH" with CRITICAL callout blocks.
- **Motivation**: Sprint 1 pitch decks took 55-60min.
- **After runs**: Sprint 2 — 4/5 orchestrators confirmed parallel dispatch. RESOLVED. See [[failure-modes/sequential-dispatch]].

## 2026-04-16 — All skills: observatory recording added — Sprint 2

- **Change**: Added per-agent recording, orchestrator event recording, and wiki synthesis step.
- **Motivation**: Sprint 1 had zero agent-level data.
- **Impact**: Partially worked (one-pager only). Sprint 2 pitch deck + full story still empty due to "non-blocking" language. Fixed in Sprint 3 prep.
