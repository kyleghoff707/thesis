---
type: prompt-changelog
lastUpdated: 2026-04-17T18:00:00Z
tags: [prompts, changelog]
---

# Prompt Version Changelog

> Reverse chronological record of all agent prompt changes with measured impact.

---

## 2026-04-17 — 3 agents: symmetric debate framework (EXP-003) — Sprint 4

- **Change**: Attacked 6 structural asymmetries in the bear/bull debate simultaneously. Softened Bear's adversarial-performance language; gave Bull + Rebuttal web search; fixed asymmetric judge rubric; added materiality filter (severity × novelty classification) to judge; added symmetric rebuttal honesty mandate; softened residual "Always prefer conservative" Sprint 3 leftovers in risk-analyst prompts.
- **Agents affected**: synthesis-writer (FS Bull/Rebuttal roles), financial-analyst (FS Judge), risk-analyst (PD+FS)
- **Motivation**: Sprint 3 full-story verdicts exactly matched pitch deck verdicts for all 3 tickers (no downgrades, no upgrades). Business quality sections (4-5 PASS on POOL/SFM) consistently recognized, but valuation/PEST sections veto overall verdict. Patterns [[patterns/bear-bull-asymmetry]] and [[patterns/valuation-drives-verdict]] identified the debate framework's structural symmetry toward caution as highest-leverage lever remaining after EXP-002. See [[experiments/doe-log]] EXP-003.
- **Key rewrites**:
  - risk-analyst-fullstory: "demolish the bull case or fail trying" × 3 → "pressure-test with evidence / find the strongest evidence-based challenge"; "make the reader genuinely uncomfortable" → "surface material, evidence-backed concerns clearly and specifically"; "Lead with what keeps you up at night" → "Lead with the most material, evidence-backed risk"
  - risk-analyst-pitchdeck: "demolish — or fail trying" → "pressure-test with the strongest evidence-based challenges"
  - synthesis-writer-fullstory Bull: "You do NOT have web search" → "You HAVE web search" + directed search menu (positive catalysts, insider buying, guru activity, analyst upgrades, third-party validation)
  - synthesis-writer-fullstory Rebuttal: "You do NOT have web search" → "You HAVE web search" + directed search menu (verify bear citations, find already-priced-in context, surface counter-evidence, check materiality)
  - synthesis-writer-fullstory Rebuttal honesty: added symmetric mandate — honest acknowledgment required when bear attack is weak (not just when it's strong)
  - financial-analyst-fullstory Judge: Strong Bull/Strong Bear definitions made symmetric (both require specific evidence + opposing side's weakness); added materiality filter (severity: thesis-killing/material/immaterial × novelty: newly-discovered/already-priced-in/known-and-managed); overall Bear verdict now requires ≥2 thesis-killer items that are BOTH newly-discovered AND unrebutted (was: any single thesis_killer sufficient)
  - risk-analyst prompts (3 instances): "Always prefer conservative growth estimates/assumptions" → "Lean toward conservative ... when evidence is genuinely mixed — conservatism is a tiebreaker, not a ceiling"
- **Skill-level changes**: generate-full-story SKILL.md "Web Search Rule" updated (Bull/Bear/Rebuttal all have web search; Judge/Compose still do not); per-agent web_searches estimation heuristics updated for Bull/Rebuttal.
- **Before runs**: Sprint 3 — 20260416-194*-* + 20260416-195*-* + 20260416-205*-* + 20260416-210*-* (9 runs, 0% verdict accuracy, full-story matched pitch deck 100%)
- **After runs**: Sprint 4 — pending
- **Impact**: _Pending — expecting at least 1 PASS across POOL/SFM/LULU and higher Strong Bull count in judge exchange scores_
- **Sprint 4 goal**: Introduce symmetry into debate framework so wonderful-company pitch deck results can translate into PASS/WATCHLIST-near-BUY in full story.

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
